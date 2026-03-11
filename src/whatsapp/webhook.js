/**
 * WhatsApp Cloud API — Webhook Handler
 *
 * GET  /webhook — Meta verification (subscribe challenge)
 * POST /webhook — Incoming messages from WhatsApp users
 */

const { sendMessage, sendImage, sendVideo, sendAudio, markAsRead, toInternational } = require('./sender');
const { transcribeVoice, analyzeImage, downloadMedia, saveIncomingMedia } = require('./media-handler');
const hybrid = require('../hybrid');
const settingsModel = require('../db/models/settings');
const { getDb } = require('../db');
const customerModel = require('../db/models/customer');
const conversationModel = require('../db/models/conversation');
const messageModel = require('../db/models/message');
const mediaModel = require('../db/models/media');

// Broadcast function — injected from index.js
let _broadcast = () => {};
function setBroadcast(fn) { _broadcast = fn; }

// ============= MEDIA PROCESSING LOCK =============
// When media (image/voice) is being processed, text messages for same phone wait
// so they get batched together instead of processing separately
const _mediaProcessing = new Map(); // phone → { promise, resolve }

function startMediaLock(phone) {
  let _resolve;
  const promise = new Promise(r => { _resolve = r; });
  // Auto-expire after 15s (safety net)
  const timeout = setTimeout(() => { endMediaLock(phone); }, 15000);
  _mediaProcessing.set(phone, { promise, resolve: _resolve, timeout });
}

function endMediaLock(phone) {
  const lock = _mediaProcessing.get(phone);
  if (lock) {
    clearTimeout(lock.timeout);
    lock.resolve();
    _mediaProcessing.delete(phone);
  }
}

async function waitForMediaLock(phone, maxWaitMs = 10000) {
  const lock = _mediaProcessing.get(phone);
  if (!lock) return;
  // Wait for media processing to finish (with timeout)
  await Promise.race([lock.promise, new Promise(r => setTimeout(r, maxWaitMs))]);
}

// ============= MESSAGE BATCHING =============
// When customer sends multiple quick messages, combine them before processing
const _pendingBatches = new Map(); // phone → { texts: [], mediaCosts: [], timer, firstResolve }

function batchMessage(phone, text, messageId, waitMs, mediaCost) {
  return new Promise((resolve) => {
    const existing = _pendingBatches.get(phone);
    if (existing) {
      // 2nd/3rd message arrives while batch is open
      existing.texts.push(text);
      if (mediaCost) existing.mediaCosts.push(mediaCost);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        const batch = _pendingBatches.get(phone);
        _pendingBatches.delete(phone);
        // Resolve the FIRST caller with the combined text + all media costs
        batch.firstResolve({ waiting: false, combined: batch.texts.join(' '), count: batch.texts.length, mediaCosts: batch.mediaCosts });
      }, waitMs);
      // This (2nd/3rd) caller returns immediately — don't process
      resolve({ waiting: true });
    } else {
      // First message — start a new batch, wait for more
      const batch = { texts: [text], mediaCosts: mediaCost ? [mediaCost] : [], timer: null, firstResolve: resolve };
      batch.timer = setTimeout(() => {
        _pendingBatches.delete(phone);
        // Only 1 message — process normally
        resolve({ waiting: false, combined: text, count: 1, mediaCosts: batch.mediaCosts });
      }, waitMs);
      _pendingBatches.set(phone, batch);
    }
  });
}

// ============= DEDUPLICATION =============
// Deduplicate: DB-backed so duplicates are caught even after server restart
// Also keep in-memory Set for fast path (avoids DB hit on every message)
const _recentIds = new Set();

function isDuplicate(messageId) {
  // Fast path: in-memory check
  if (_recentIds.has(messageId)) return true;

  // DB check: survives server restarts
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM processed_webhooks WHERE message_id = ?').get(messageId);
  if (exists) {
    _recentIds.add(messageId);
    return true;
  }

  // Record this message
  db.prepare('INSERT OR IGNORE INTO processed_webhooks (message_id) VALUES (?)').run(messageId);
  _recentIds.add(messageId);

  // Cleanup: keep only last 24 hours in DB (run occasionally)
  if (Math.random() < 0.05) {
    db.prepare("DELETE FROM processed_webhooks WHERE created_at < datetime('now','localtime','-24 hours')").run();
  }

  return false;
}

/**
 * GET /webhook — Meta verification endpoint.
 * Meta sends: hub.mode, hub.verify_token, hub.challenge
 */
function webhookVerify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = settingsModel.get('meta_verify_token') || 'nureva-webhook-2026';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WA Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[WA Webhook] Verification failed — token mismatch');
  return res.sendStatus(403);
}

/**
 * POST /webhook — Incoming WhatsApp messages.
 * Parses Meta payload, calls handleMessage, sends reply back.
 */
async function webhookHandler(req, res) {
  // Always respond 200 quickly — Meta expects fast acknowledgment
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value) return;

    // Process status updates (delivered, read, sent)
    if (value.statuses) {
      const { getDb } = require('../db');
      for (const s of value.statuses) {
        const waId = s.id;
        const status = s.status; // 'sent', 'delivered', 'read'
        if (!waId || !['sent', 'delivered', 'read'].includes(status)) continue;
        try {
          // Only upgrade status: sent → delivered → read (never downgrade)
          const rank = { sent: 1, delivered: 2, read: 3 };
          const msg = getDb().prepare('SELECT id, wa_status, conversation_id FROM messages WHERE wa_message_id = ?').get(waId);
          if (msg && rank[status] > (rank[msg.wa_status] || 0)) {
            getDb().prepare('UPDATE messages SET wa_status = ? WHERE id = ?').run(status, msg.id);
            // Broadcast to admin dashboard
            _broadcast({ type: 'msg_status', conversation_id: msg.conversation_id, wa_message_id: waId, status });
          }
        } catch (e) {
          console.error('[WA Status] Error:', e.message);
        }
      }
      return;
    }

    const messages = value.messages;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];
    const messageId = msg.id;

    // Deduplicate
    if (isDuplicate(messageId)) return;

    const fromPhone = msg.from; // International: 923001234567
    const contactName = value.contacts?.[0]?.profile?.name || '';
    const phoneNumberId = value.metadata?.phone_number_id;

    // Get credentials
    const accessToken = settingsModel.get('meta_whatsapp_token', '');
    const apiKey = settingsModel.get('openai_api_key', '') || process.env.OPENAI_API_KEY || '';

    if (!accessToken) {
      console.error('[WA Webhook] No access token configured');
      return;
    }

    // NOTE: markAsRead moved to AFTER processing — only mark read when bot actively replies
    // Don't mark read when: bot OFF, complaint, human-assigned (customer sees grey ticks = unread)

    // Extract message text
    let messageText = '';
    let mediaNote = ''; // For logging what type of media was processed
    let mediaCost = null; // Track media processing cost
    let incomingMediaType = null; // 'image', 'audio', 'video' — for dashboard preview
    let incomingMediaFile = null; // saved filename in chat-media/

    // Reactions — handle BEFORE text extraction so they don't enter batching as '[reaction]'
    if (msg.type === 'reaction') {
      const emoji = msg.reaction?.emoji || '';
      const positiveReactions = ['👍', '❤️', '❤', '♥️', '🙏', '✅', '👌'];
      if (positiveReactions.includes(emoji) && emoji) {
        console.log(`[WA] ${fromPhone}: positive reaction ${emoji} — treating as YES`);
        messageText = 'haan';
        // Skip batching — process immediately as a standalone "haan"
        // (otherwise it corrupts the batch with [reaction] text)
      } else {
        console.log(`[WA] ${fromPhone}: reaction ${emoji} — ignored`);
        return;
      }
    }

    if (msg.type === 'reaction') {
      // Already handled above — messageText is set to 'haan' or returned
    } else if (msg.type === 'text') {
      // Wait for any ongoing media processing for this phone (image/voice takes 3-5s)
      // so text + media get batched together instead of separate responses
      await waitForMediaLock(fromPhone);
      messageText = msg.text?.body || '';
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      // Voice message — log raw payload for debugging
      const voiceData = msg.audio || msg.voice || {};
      console.log(`[WA] Voice payload: type=${msg.type}, audio=${JSON.stringify(msg.audio)}, voice=${JSON.stringify(msg.voice)}, keys=${Object.keys(msg).join(',')}`);
      const MAX_VOICE_SEC = 120;
      if (voiceData.duration && voiceData.duration > MAX_VOICE_SEC) {
        const replyText = 'Voice load nahi ho rahi. Ap apna message likh ke bhej dein.';
        await sendMessage(fromPhone, replyText, phoneNumberId, accessToken);
        console.log(`[WA] Voice too long (${voiceData.duration}s) from ${fromPhone} — skipped`);
        return;
      }
      // Lock so text messages wait for voice processing
      startMediaLock(fromPhone);
      // Transcribe with Whisper
      try {
        const mediaId = voiceData.id;
        console.log(`[WA] Voice mediaId: ${mediaId}, apiKey: ${apiKey ? 'set' : 'NOT SET'}`);
        if (!mediaId) {
          messageText = '[voice message - no mediaId found]';
          console.error(`[WA] Voice: no mediaId! voiceData=${JSON.stringify(voiceData)}`);
        } else {
          // Download & save voice file for dashboard playback
          try {
            const { buffer: rawBuf, mimeType: rawMime } = await downloadMedia(mediaId, accessToken);
            incomingMediaFile = saveIncomingMedia(rawBuf, 'audio', fromPhone, rawMime);
            incomingMediaType = 'audio';
          } catch (e) { console.warn('[WA] Voice save failed:', e.message); }

          const result = await transcribeVoice(mediaId, accessToken, apiKey);
          messageText = result.text;
          mediaNote = ' [voice→text]';
          mediaCost = { model: result.model, cost_rs: result.cost_rs, response_ms: result.response_ms, type: 'voice' };
          if (!messageText || messageText.trim().length < 2) {
            messageText = '[voice message - samajh nahi aaya]';
          }
        }
      } catch (err) {
        console.error('[WA] Voice transcription FAILED:', err.message, err.stack);
        messageText = '[voice message]';
        mediaNote = ` [voice FAILED: ${err.message}]`;
      } finally {
        endMediaLock(fromPhone);
      }
    } else if (msg.type === 'image') {
      // Lock so text messages wait for image processing
      startMediaLock(fromPhone);
      // Image — analyze with GPT-4o mini Vision
      try {
        const mediaId = msg.image?.id;
        const caption = msg.image?.caption || '';
        if (!mediaId) { messageText = caption || '[image]'; }
        else {
          // Download & save image for dashboard preview
          try {
            const { buffer: rawBuf, mimeType: rawMime } = await downloadMedia(mediaId, accessToken);
            incomingMediaFile = saveIncomingMedia(rawBuf, 'image', fromPhone, rawMime);
            incomingMediaType = 'image';
          } catch (e) { console.warn('[WA] Image save failed:', e.message); }

          // Skip expensive vision analysis for known spammers (save Rs.0.39/image)
          let skipVision = false;
          const _cust = customerModel.findByPhone(fromPhone);
          if (_cust) {
            const _conv = conversationModel.findActive(_cust.id);
            if (_conv && (_conv.spam_flag || (_conv.state === 'IDLE' && getDb().prepare(
              "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND direction = 'incoming' AND content LIKE '[Image:%'"
            ).get(_conv.id)?.c >= 2))) {
              skipVision = true;
              messageText = caption || '[image]';
              console.log(`[WA] ${fromPhone}: Skipping vision analysis (spam/repeat non-product images)`);
            }
          }

          if (!skipVision) {
            const result = await analyzeImage(mediaId, accessToken, apiKey);
            messageText = caption ? `${caption} [Image: ${result.text}]` : `[Image: ${result.text}]`;
            mediaNote = ' [image→text]';
            mediaCost = { model: result.model, cost_rs: result.cost_rs, tokens_in: result.tokens_in, tokens_out: result.tokens_out, response_ms: result.response_ms, type: 'image' };
          }
        }
      } catch (err) {
        console.error('[WA] Image analysis failed:', err.message);
        messageText = msg.image?.caption || '[image]';
      } finally {
        endMediaLock(fromPhone);
      }
    } else if (msg.type === 'video') {
      // Video — download and save for dashboard preview (no AI analysis)
      const videoData = msg.video || {};
      const caption = videoData.caption || '';
      const mediaId = videoData.id;
      if (mediaId) {
        try {
          const { buffer: rawBuf, mimeType: rawMime } = await downloadMedia(mediaId, accessToken);
          incomingMediaFile = saveIncomingMedia(rawBuf, 'video', fromPhone, rawMime);
          incomingMediaType = 'video';
          console.log(`[WA] Video saved: ${incomingMediaFile} (${rawBuf.length} bytes)`);
        } catch (e) { console.warn('[WA] Video save failed:', e.message); }
      }
      messageText = caption || '[video]';
    } else if (msg.type === 'interactive') {
      // Interactive messages: button replies, list replies, product messages
      const interactive = msg.interactive || {};
      if (interactive.type === 'button_reply') {
        messageText = interactive.button_reply?.title || interactive.button_reply?.id || '[button reply]';
      } else if (interactive.type === 'list_reply') {
        messageText = interactive.list_reply?.title || interactive.list_reply?.description || interactive.list_reply?.id || '[list reply]';
      } else if (interactive.type === 'product_list' || interactive.type === 'product') {
        // Customer sent a product from catalog
        const prodName = interactive.product_list?.product_retailer_id || interactive.product?.product_retailer_id || '';
        messageText = prodName ? `[Product: ${prodName}]` : '[product message]';
      } else if (interactive.type === 'nfm_reply') {
        // Flow reply (form submission)
        const body = interactive.nfm_reply?.body || interactive.nfm_reply?.response_json || '';
        messageText = typeof body === 'string' ? body : JSON.stringify(body);
      } else {
        messageText = interactive.body?.text || `[interactive: ${interactive.type || 'unknown'}]`;
      }
      console.log(`[WA] Interactive (${interactive.type}) from ${fromPhone}: "${messageText}"`);
    } else if (msg.type === 'order') {
      // WhatsApp catalog order — extract product details
      const order = msg.order || {};
      const items = order.product_items || [];
      if (items.length > 0) {
        const itemNames = items.map(i => `${i.product_retailer_id || 'product'} (qty: ${i.quantity || 1})`).join(', ');
        messageText = `[Order: ${itemNames}]`;
      } else {
        messageText = '[order message]';
      }
      console.log(`[WA] Order from ${fromPhone}: "${messageText}"`);
    } else if (msg.type === 'button') {
      // Quick reply button response
      messageText = msg.button?.text || msg.button?.payload || '[button]';
      console.log(`[WA] Button reply from ${fromPhone}: "${messageText}"`);
    } else if (msg.type === 'referral') {
      // Customer clicked on an ad / referral link
      const ref = msg.referral || {};
      messageText = ref.body || msg.text?.body || '[ad click]';
      console.log(`[WA] Referral from ${fromPhone}: "${messageText}"`);
    } else {
      // Other types (sticker, document, location, contacts, unsupported, etc.)
      // Don't pass to bot — these are not processable text and cause wrong product matches
      console.log(`[WA] Unsupported type (${msg.type}) from ${fromPhone} — ignoring. Raw keys: ${Object.keys(msg).join(',')}`);
      // Try to save to DB for admin visibility
      try {
        const customerModel = require('../db/models/customer');
        const _cust = customerModel.findByPhone(fromPhone);
        if (_cust) {
          const _conv = conversationModel.findActive(_cust.id);
          if (_conv) {
            messageModel.create(_conv.id, 'incoming', 'customer', `[📎 ${msg.type || 'unsupported'}]`, { source: 'unsupported_media' });
            conversationModel.updateLastMessage(_conv.id, `[📎 ${msg.type || 'unsupported'}]`);
            _broadcast({ type: 'new_message', conversationId: _conv.id });
          }
        }
      } catch (e) { /* non-critical — just skip saving */ }
      return;
    }

    if (!messageText.trim()) {
      console.warn(`[WA] Empty message from ${fromPhone} — type: ${msg.type}, keys: ${Object.keys(msg).join(',')}, raw: ${JSON.stringify(msg).slice(0, 500)}`);
      return;
    }

    console.log(`[WA] ${fromPhone}${mediaNote}: "${messageText}"`);

    // ============ MESSAGE BATCHING ============
    // Customers often split one thought across 2-3 quick messages.
    // Wait briefly to collect them, then process as one combined message.
    const BATCH_WAIT_MS = 2500; // 2.5 seconds
    const batched = await batchMessage(fromPhone, messageText, messageId, BATCH_WAIT_MS, mediaCost);
    if (batched.waiting) return; // Still collecting, will process when timer fires
    messageText = batched.combined; // Combined text from all rapid messages
    // Merge all media costs from batch (image + voice could both be in one batch)
    if (batched.mediaCosts && batched.mediaCosts.length > 0) {
      // Use first media cost as primary, sum up total cost
      mediaCost = batched.mediaCosts[0];
      if (batched.mediaCosts.length > 1) {
        mediaCost.cost_rs = batched.mediaCosts.reduce((sum, mc) => sum + (mc.cost_rs || 0), 0);
        mediaCost.type = batched.mediaCosts.map(mc => mc.type).join('+');
      }
    }
    console.log(`[WA] Batched ${batched.count} msg(s) from ${fromPhone}: "${messageText}"`);

    // Check bot enabled
    const botEnabled = settingsModel.getBoolean('bot_enabled', true);

    if (!botEnabled) {
      // Bot disabled — save incoming message to DB but don't reply
      const customer = customerModel.findOrCreate(fromPhone);
      // Save WhatsApp profile name separately — don't overwrite customer.name (that's for COLLECT_NAME)
      if (contactName) customerModel.update(customer.id, { wa_profile_name: contactName });
      const convo = conversationModel.getOrCreateActive(customer.id, 'nureva');
      messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
      conversationModel.updateLastMessage(convo.id, messageText);
      conversationModel.setAdminUnread(convo.id, true);
      console.log('[WA Webhook] Bot disabled, message saved:', fromPhone);
      _broadcast({
        type: 'new_message',
        phone: fromPhone,
        source: 'whatsapp',
        contactName,
        result: { reply: null, incoming: messageText },
      });
      return;
    }

    // Check if customer is blocked (pre-activation CSV numbers)
    const blockedCheck = customerModel.findByPhone(fromPhone);
    if (blockedCheck && blockedCheck.is_blocked) {
      // Blocked customer — save message but don't reply
      const convo = conversationModel.getOrCreateActive(blockedCheck.id, 'nureva');
      messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
      conversationModel.updateLastMessage(convo.id, messageText);
      console.log('[WA Webhook] Blocked customer, skipping:', fromPhone);
      _broadcast({ type: 'new_message', phone: fromPhone, source: 'whatsapp', contactName, result: { reply: null, incoming: messageText } });
      return;
    }

    // (Reactions handled above, before text extraction)

    // Unsupported media types (sticker, document, location, contacts)
    if (['sticker', 'document', 'location', 'contacts'].includes(msg.type)) {
      const replyText = 'Abhi sirf text, voice aur video messages support hain. Ap please message likh ke bhej dein.';
      await sendMessage(fromPhone, replyText, phoneNumberId, accessToken);
      console.log(`[WA] Unsupported (${msg.type}) from ${fromPhone}`);
      return;
    }

    // Get store name
    const stores = getDb().prepare('SELECT * FROM stores').all();
    const store = stores[0];
    const storeName = store?.brand_name || 'Nureva';

    // ---- AUTO-SPAM: detect non-product image broadcasters ----
    // If customer sends image-only messages that aren't product-related while IDLE,
    // auto-mark as spam after 2nd such message to save AI costs
    const _productKeywords = ['trimmer', 'blackhead', 'remover', 'cutting board', 'oil spray', 'ear wax', 'vegetable cutter', 'facial', 'nebulizer', 'knee', 'duster', 'product', 'order', 'price', 'parcel', 'delivery', 'package', 'box', 'label', 'cod', 'cash'];
    if (incomingMediaType === 'image' && messageText.startsWith('[Image:')) {
      const desc = messageText.toLowerCase();
      const isProductRelated = _productKeywords.some(kw => desc.includes(kw));
      if (!isProductRelated) {
        const cust = customerModel.findByPhone(fromPhone);
        if (cust) {
          const conv = conversationModel.getOrCreateActive(cust.id, storeName.toLowerCase());
          if (conv && conv.state === 'IDLE') {
            // Count previous non-product image messages in this conversation
            const prevImages = getDb().prepare(
              "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND direction = 'incoming' AND content LIKE '[Image:%'"
            ).get(conv.id);
            const count = prevImages?.c || 0;
            if (count >= 1) {
              // 2nd+ non-product image → auto-spam, skip AI entirely
              conversationModel.setSpam(conv.id, true);
              messageModel.create(conv.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
              conversationModel.updateLastMessage(conv.id, messageText);
              conversationModel.setAdminUnread(conv.id, true);
              console.log(`[SPAM-AUTO] ${fromPhone}: ${count + 1} non-product images → auto-spam`);
              _broadcast({ type: 'new_message', phone: fromPhone, source: 'whatsapp', contactName, result: { reply: null, incoming: messageText } });
              return;
            }
          }
        }
      }
    }

    // Check if conversation is blocked (spam_flag) or assigned to human — don't auto-reply
    const customer = customerModel.findByPhone(fromPhone);
    if (customer) {
      const convo = conversationModel.getOrCreateActive(customer.id, storeName.toLowerCase());
      // Blocked conversation — save message silently, no bot response
      if (convo && convo.spam_flag) {
        messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
        conversationModel.updateLastMessage(convo.id, messageText);
        conversationModel.setAdminUnread(convo.id, true);
        console.log(`[WA] ${fromPhone}: "${messageText}" — blocked (spam_flag), skipping bot reply`);
        _broadcast({
          type: 'new_message',
          phone: fromPhone,
          source: 'whatsapp',
          contactName,
          result: { reply: null, incoming: messageText },
        });
        return;
      }
      // Gift card or voice message flagged — save message silently, no bot response
      if (convo && (convo.gift_card_flag || convo.voice_msg_flag)) {
        messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
        conversationModel.updateLastMessage(convo.id, messageText);
        conversationModel.setAdminUnread(convo.id, true);
        const flagType = convo.gift_card_flag ? 'gift_card_flag' : 'voice_msg_flag';
        console.log(`[WA] ${fromPhone}: "${messageText}" — ${flagType}, skipping bot reply`);
        _broadcast({
          type: 'new_message',
          phone: fromPhone,
          source: 'whatsapp',
          contactName,
          result: { reply: null, incoming: messageText },
        });
        return;
      }
      if (convo && convo.needs_human) {
        // Save message but don't reply — human agent will handle
        messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId, media_type: incomingMediaType, media_url: incomingMediaFile });
        conversationModel.updateLastMessage(convo.id, messageText);
        conversationModel.setAdminUnread(convo.id, true);
        console.log(`[WA] ${fromPhone}: "${messageText}" — needs_human, skipping bot reply`);
        _broadcast({
          type: 'new_message',
          phone: fromPhone,
          source: 'whatsapp',
          contactName,
          result: { reply: null, incoming: messageText },
        });
        return;
      }
    }

    // Process message through the hybrid engine
    const result = await hybrid.handleMessage(messageText, fromPhone, storeName, apiKey || undefined, { mediaCost, wa_message_id: messageId, incoming_media_type: incomingMediaType, incoming_media_url: incomingMediaFile });

    // Add media processing cost to result (so dashboard shows it)
    if (mediaCost) {
      result.mediaCost = mediaCost;
      // Add media cost to total AI cost
      const existingCost = result.ai_cost_rs || 0;
      result.ai_cost_rs = existingCost + mediaCost.cost_rs;
    }

    // Handle media request — send product images/videos (single product)
    if (result._media) {
      const { product_id, type, product_name } = result._media;
      const mediaFiles = mediaModel.getByProduct(product_id, type);
      const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
      const hasTextReply = !!result.reply; // Product inquiry has reply text, explicit media request has null

      // If there's a text reply (product inquiry auto-video), send text FIRST
      if (hasTextReply) {
        await sendMessage(fromPhone, result.reply, phoneNumberId, accessToken);
      }

      if (mediaFiles.length > 0) {
        console.log(`[WA Media] Sending ${mediaFiles.length} ${type}(s) for product ${product_name} to ${fromPhone}`);
        let mediaSent = 0;
        for (const m of mediaFiles) {
          const mediaUrl = `${serverUrl}/media/${m.filename}`;
          const caption = m.caption || null;
          const sendResult = m.type === 'image'
            ? await sendImage(fromPhone, mediaUrl, caption, phoneNumberId, accessToken)
            : await sendVideo(fromPhone, mediaUrl, caption, phoneNumberId, accessToken);
          if (sendResult.success) {
            mediaSent++;
          } else {
            console.error(`[WA Media] FAILED to send ${m.type} ${m.filename}: ${sendResult.error}`);
          }
        }
        if (!hasTextReply) {
          // Explicit media request — send follow-up text
          const isUpsellState = result.state === 'UPSELL_SHOW' || result.state === 'UPSELL_HOOK';
          const isPostOrder = result.state === 'ORDER_CONFIRMED';
          const followUpAction = isUpsellState ? 'Add karna hai order mein?' : (isPostOrder ? '' : 'Order karna hai?');
          const followUp = type === 'video'
            ? `Yeh rahi ${product_name} ki video 😊 ${followUpAction}`.trim()
            : `Yeh rahi ${product_name} ki ${mediaFiles.length > 1 ? 'pictures' : 'picture'} 😊 ${followUpAction}`.trim();
          await sendMessage(fromPhone, followUp, phoneNumberId, accessToken);
          const mediaLabel = `[📎 ${mediaSent} ${type}${mediaSent > 1 ? 's' : ''} sent: ${product_name}]\n`;
          result.reply = mediaLabel + followUp;
        } else {
          // Auto-video with product info — prepend media label to existing reply for log
          const mediaLabel = `[📎 ${mediaSent} ${type}${mediaSent > 1 ? 's' : ''} sent: ${product_name}]\n`;
          result.reply = mediaLabel + result.reply;
        }
        markAsRead(messageId, phoneNumberId, accessToken);
        // Update DB message with media label + media preview info
        if (result.db_conversation_id) {
          try {
            const { getDb } = require('../db');
            const firstMedia = mediaFiles[0];
            const mType = firstMedia.type === 'image' ? 'image' : 'video';
            const mUrl = `/media/${firstMedia.filename}`;
            getDb().prepare(`
              UPDATE messages SET content = ?, media_type = ?, media_url = ?
              WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND direction = 'outgoing' ORDER BY created_at DESC LIMIT 1)
            `).run(result.reply, mType, mUrl, result.db_conversation_id);
          } catch (e) { /* non-critical */ }
        }
      } else if (!hasTextReply) {
        // No media uploaded + explicit request — tell customer
        result.reply = `Abhi ${product_name} ki ${type === 'video' ? 'video' : 'picture'} available nahi hai. Lekin product bohat acha hai 😊 Order karna hai?`;
        await sendMessage(fromPhone, result.reply, phoneNumberId, accessToken);
        markAsRead(messageId, phoneNumberId, accessToken);
      }
      // If hasTextReply + no media files → text was already sent above, nothing more to do
    }

    // Send reply back to WhatsApp (skip complaint — handled by delayed sequence)
    if (result.reply && !result._media && !result._complaint_audio) {
      const sendResult = await sendMessage(fromPhone, result.reply, phoneNumberId, accessToken);
      if (sendResult.success) {
        console.log(`[WA] → ${fromPhone}: "${result.reply.substring(0, 80)}..."`);

        // Mark as read (blue ticks) only when bot replies AND not a complaint/human-assigned
        // Complaints stay unread so customer sees admin hasn't read yet
        if (!result.needs_human) {
          markAsRead(messageId, phoneNumberId, accessToken);
        }

        // Store wa_message_id on the last outgoing message for read receipt tracking
        if (sendResult.messageId && result.db_conversation_id) {
          try {
            const { getDb } = require('../db');
            getDb().prepare(`
              UPDATE messages SET wa_message_id = ?
              WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND direction = 'outgoing' ORDER BY created_at DESC LIMIT 1)
            `).run(sendResult.messageId, result.db_conversation_id);
          } catch (e) { /* non-critical */ }
        }
      } else {
        console.error(`[WA] Send failed to ${fromPhone}:`, sendResult.error);
      }
    }

    // Complaint: delayed voice note (10s) + number text (15s after voice)
    // Runs in background — don't block the response
    if (result._complaint_audio) {
      // Auto-create complaint tracker entry
      try {
        const complaintModel = require('../db/models/complaint');
        const existingComplaint = result.db_conversation_id ? complaintModel.findByConversation(result.db_conversation_id) : null;
        if (!existingComplaint) {
          complaintModel.create({
            conversation_id: result.db_conversation_id,
            customer_id: result.db_customer_id,
            customer_name: result.collected?.name || null,
            customer_phone: fromPhone,
            product_name: result.collected?.product || null,
            description: messageText || null,
          });
          console.log(`[COMPLAINT] Auto-created complaint for ${fromPhone}`);
        }
      } catch (e) {
        console.error('[COMPLAINT] Auto-create error:', e.message);
      }
      const _compPhone = fromPhone;
      const _compPhoneId = phoneNumberId;
      const _compToken = accessToken;
      const _compReply = result.reply;
      const _compConvId = result.db_conversation_id;
      setTimeout(async () => {
        try {
          // Step 1: Send voice note (after 1 minute)
          const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
          const audioUrl = `${serverUrl}/media/complaint-voice.mp3`;
          const audioResult = await sendAudio(_compPhone, audioUrl, _compPhoneId, _compToken);
          console.log(`[WA] Complaint voice note ${audioResult.success ? 'sent' : 'FAILED'} to ${_compPhone}`);
          // Log voice note in DB + dashboard
          if (audioResult.success && _compConvId) {
            messageModel.create(_compConvId, 'outgoing', 'bot', '[🎤 Complaint Voice Note]', { source: 'complaint_voice', media_type: 'audio', media_url: '/media/complaint-voice.mp3' });
            conversationModel.updateLastMessage(_compConvId, '[🎤 Voice Note]');
            _broadcast({ type: 'new_message', conversationId: _compConvId });
          }

          // Step 2: Send number text (5s after voice note)
          setTimeout(async () => {
            try {
              const sendResult = await sendMessage(_compPhone, _compReply, _compPhoneId, _compToken);
              console.log(`[WA] Complaint number text ${sendResult.success ? 'sent' : 'FAILED'} to ${_compPhone}`);
              // Save complaint text to DB (after voice note — correct order)
              if (sendResult.success && _compConvId) {
                messageModel.create(_compConvId, 'outgoing', 'bot', _compReply, { source: 'complaint_text' });
                conversationModel.updateLastMessage(_compConvId, _compReply);
                _broadcast({ type: 'new_message', conversationId: _compConvId });
              }
            } catch (err) {
              console.error('[WA] Complaint number text error:', err.message);
            }
          }, 5 * 1000);
        } catch (err) {
          console.error('[WA] Complaint voice note error:', err.message);
        }
      }, 10 * 1000);
    }

    // Trust/quality: send voice note 10s after text reply
    if (result._trust_audio) {
      const _tPhone = fromPhone;
      const _tPhoneId = phoneNumberId;
      const _tToken = accessToken;
      const _tConvId = result.db_conversation_id;
      setTimeout(async () => {
        try {
          const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
          const audioUrl = `${serverUrl}/media/trust-voice.mp3`;
          const audioResult = await sendAudio(_tPhone, audioUrl, _tPhoneId, _tToken);
          console.log(`[WA] Trust voice note ${audioResult.success ? 'sent' : 'FAILED'} to ${_tPhone}`);
          if (audioResult.success && _tConvId) {
            messageModel.create(_tConvId, 'outgoing', 'bot', '[🎤 Trust Voice Note]', { source: 'trust_voice' });
            conversationModel.updateLastMessage(_tConvId, '[🎤 Voice Note]');
            _broadcast({ type: 'new_message', conversationId: _tConvId });
          }
        } catch (err) {
          console.error('[WA] Trust voice note error:', err.message);
        }
      }, 10 * 1000);
    }

    // Greeting voice note — send audio instead of text for salam greeting
    if (result._greeting_audio) {
      const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
      const audioUrl = `${serverUrl}/media/${result._greeting_audio}`;
      const audioResult = await sendAudio(fromPhone, audioUrl, phoneNumberId, accessToken);
      console.log(`[WA] Greeting voice note ${audioResult.success ? 'sent' : 'FAILED'} to ${fromPhone}`);
      if (audioResult.success) {
        markAsRead(messageId, phoneNumberId, accessToken);
        if (result.db_conversation_id) {
          messageModel.create(result.db_conversation_id, 'outgoing', 'bot', '[🎤 Salam Voice Note]', { source: 'greeting_voice', media_type: 'audio', media_url: `/media/${result._greeting_audio}` });
          conversationModel.updateLastMessage(result.db_conversation_id, '[🎤 Salam Voice Note]');
          _broadcast({ type: 'new_message', conversationId: result.db_conversation_id });
        }
      }
    }

    // Voice reply needed — notify admin panel to record and send voice note
    if (result._needs_voice_reply) {
      _broadcast({
        type: 'voice_reply_needed',
        conversationId: result.db_conversation_id,
        phone: fromPhone,
        phoneNumberId,
      });
    }

    // Handle batch media — send videos for multiple products AFTER text reply
    // (product list text goes first, then all videos follow)
    if (result._media_batch && result._media_batch.length > 0) {
      const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
      let batchSent = 0;
      const sentNames = [];
      for (const item of result._media_batch) {
        const mediaFiles = mediaModel.getByProduct(item.product_id, item.type);
        if (mediaFiles.length > 0) {
          // Send first video/image only per product (not all duplicates)
          const m = mediaFiles[0];
          const mediaUrl = `${serverUrl}/media/${m.filename}`;
          const caption = item.product_name;
          const sendResult = m.type === 'image'
            ? await sendImage(fromPhone, mediaUrl, caption, phoneNumberId, accessToken)
            : await sendVideo(fromPhone, mediaUrl, caption, phoneNumberId, accessToken);
          if (sendResult.success) {
            batchSent++;
            sentNames.push(item.product_name);
          } else {
            console.error(`[WA Media Batch] FAILED ${m.type} for ${item.product_name}: ${sendResult.error}`);
          }
        }
      }
      if (batchSent > 0) {
        console.log(`[WA Media Batch] Sent ${batchSent} videos to ${fromPhone}: ${sentNames.join(', ')}`);
        // Prepend media info to reply for admin log
        const batchLabel = `[📎 ${batchSent} video${batchSent > 1 ? 's' : ''} sent: ${sentNames.join(', ')}]\n`;
        result.reply = batchLabel + (result.reply || '');
        // Update DB message with media label + first video as preview
        if (result.db_conversation_id) {
          try {
            const { getDb } = require('../db');
            // Find first successfully sent media file for preview
            const firstBatchMedia = result._media_batch.find(item => mediaModel.getByProduct(item.product_id, item.type).length > 0);
            const firstFile = firstBatchMedia ? mediaModel.getByProduct(firstBatchMedia.product_id, firstBatchMedia.type)[0] : null;
            if (firstFile) {
              getDb().prepare(`
                UPDATE messages SET content = ?, media_type = ?, media_url = ?
                WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND direction = 'outgoing' ORDER BY created_at DESC LIMIT 1)
              `).run(result.reply, firstFile.type, `/media/${firstFile.filename}`, result.db_conversation_id);
            } else {
              getDb().prepare(`
                UPDATE messages SET content = ?
                WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND direction = 'outgoing' ORDER BY created_at DESC LIMIT 1)
              `).run(result.reply, result.db_conversation_id);
            }
          } catch (e) { console.error('[WA Media Batch] DB update failed:', e.message); }
        }
      }
    }

    // Broadcast to admin dashboard
    _broadcast({
      type: 'new_message',
      phone: fromPhone,
      source: 'whatsapp',
      contactName,
      result,
      mediaCost,
    });

  } catch (err) {
    console.error('[WA Webhook] Error:', err.message);
  }
}

module.exports = { webhookVerify, webhookHandler, setBroadcast };
