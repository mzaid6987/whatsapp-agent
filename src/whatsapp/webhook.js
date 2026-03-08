/**
 * WhatsApp Cloud API — Webhook Handler
 *
 * GET  /webhook — Meta verification (subscribe challenge)
 * POST /webhook — Incoming messages from WhatsApp users
 */

const { sendMessage, sendImage, sendVideo, markAsRead, toInternational } = require('./sender');
const { transcribeVoice, analyzeImage } = require('./media-handler');
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

    if (msg.type === 'text') {
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
          const result = await analyzeImage(mediaId, accessToken, apiKey);
          messageText = caption ? `${caption} [Image: ${result.text}]` : `[Image: ${result.text}]`;
          mediaNote = ' [image→text]';
          mediaCost = { model: result.model, cost_rs: result.cost_rs, tokens_in: result.tokens_in, tokens_out: result.tokens_out, response_ms: result.response_ms, type: 'image' };
        }
      } catch (err) {
        console.error('[WA] Image analysis failed:', err.message);
        messageText = msg.image?.caption || '[image]';
      } finally {
        endMediaLock(fromPhone);
      }
    } else {
      // Other types (sticker, video, document, etc.) — not supported yet
      messageText = `[${msg.type}]`;
    }

    if (!messageText.trim()) return;

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
      if (contactName && !customer.name) customerModel.update(customer.id, { name: contactName });
      const convo = conversationModel.getOrCreateActive(customer.id, 'nureva');
      messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId });
      conversationModel.updateLastMessage(convo.id, messageText);
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
      messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId });
      conversationModel.updateLastMessage(convo.id, messageText);
      console.log('[WA Webhook] Blocked customer, skipping:', fromPhone);
      _broadcast({ type: 'new_message', phone: fromPhone, source: 'whatsapp', contactName, result: { reply: null, incoming: messageText } });
      return;
    }

    // Reactions — thumbs up / heart = treat as "haan" (YES), others = ignore
    if (msg.type === 'reaction') {
      const emoji = msg.reaction?.emoji || '';
      const positiveReactions = ['👍', '❤️', '❤', '♥️', '🙏', '✅', '👌'];
      if (positiveReactions.includes(emoji) && emoji) {
        console.log(`[WA] ${fromPhone}: positive reaction ${emoji} — treating as YES`);
        messageText = 'haan';
        // Fall through to normal message processing
      } else {
        console.log(`[WA] ${fromPhone}: reaction ${emoji} — ignored`);
        return;
      }
    }

    // Unsupported media types (sticker, video, document, location, contacts)
    if (['sticker', 'video', 'document', 'location', 'contacts'].includes(msg.type)) {
      const replyText = msg.type === 'video'
        ? 'Video load nahi ho rahi. Ap please message likh ke bhej dein.'
        : 'Abhi sirf text aur voice messages support hain. Ap please message likh ke bhej dein.';
      await sendMessage(fromPhone, replyText, phoneNumberId, accessToken);
      console.log(`[WA] Unsupported (${msg.type}) from ${fromPhone}`);
      return;
    }

    // Get store name
    const stores = getDb().prepare('SELECT * FROM stores').all();
    const store = stores[0];
    const storeName = store?.brand_name || 'Nureva';

    // Check if conversation is blocked (spam_flag) or assigned to human — don't auto-reply
    const customer = customerModel.findByPhone(fromPhone);
    if (customer) {
      const convo = conversationModel.getOrCreateActive(customer.id, storeName.toLowerCase());
      // Blocked conversation — save message silently, no bot response
      if (convo && convo.spam_flag) {
        messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId });
        conversationModel.updateLastMessage(convo.id, messageText);
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
      if (convo && convo.needs_human) {
        // Save message but don't reply — human agent will handle
        messageModel.create(convo.id, 'incoming', 'customer', messageText, { source: 'whatsapp', wa_message_id: messageId });
        conversationModel.updateLastMessage(convo.id, messageText);
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
    const result = await hybrid.handleMessage(messageText, fromPhone, storeName, apiKey || undefined, { mediaCost, wa_message_id: messageId });

    // Add media processing cost to result (so dashboard shows it)
    if (mediaCost) {
      result.mediaCost = mediaCost;
      // Add media cost to total AI cost
      const existingCost = result.ai_cost_rs || 0;
      result.ai_cost_rs = existingCost + mediaCost.cost_rs;
    }

    // Handle media request — send product images/videos
    if (result._media) {
      const { product_id, type, product_name } = result._media;
      const mediaFiles = mediaModel.getByProduct(product_id, type);
      const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');

      if (mediaFiles.length > 0) {
        console.log(`[WA Media] Sending ${mediaFiles.length} ${type}(s) for product ${product_name} to ${fromPhone}`);
        for (const m of mediaFiles) {
          const mediaUrl = `${serverUrl}/media/${m.filename}`;
          const caption = m.caption || product_name;
          if (m.type === 'image') {
            await sendImage(fromPhone, mediaUrl, caption, phoneNumberId, accessToken);
          } else {
            await sendVideo(fromPhone, mediaUrl, caption, phoneNumberId, accessToken);
          }
        }
        // Send follow-up text
        const followUp = type === 'video'
          ? `Yeh rahi ${product_name} ki video 😊 Order karna hai?`
          : `Yeh rahi ${product_name} ki ${mediaFiles.length > 1 ? 'pictures' : 'picture'} 😊 Order karna hai?`;
        await sendMessage(fromPhone, followUp, phoneNumberId, accessToken);
        result.reply = followUp; // For logging
        markAsRead(messageId, phoneNumberId, accessToken);
      } else {
        // No media uploaded yet
        result.reply = `Abhi ${product_name} ki ${type === 'video' ? 'video' : 'picture'} available nahi hai. Lekin product bohat acha hai 😊 Order karna hai?`;
        await sendMessage(fromPhone, result.reply, phoneNumberId, accessToken);
        markAsRead(messageId, phoneNumberId, accessToken);
      }
    }

    // Send reply back to WhatsApp
    if (result.reply && !result._media) {
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
