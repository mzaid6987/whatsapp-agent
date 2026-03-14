/**
 * Bot V2 — Pure AI Handler
 *
 * Unlike V1 (template-based with AI fallback), V2 uses Claude AI for ALL responses.
 * Same state machine concept but AI drives transitions and generates all replies.
 * Same guardrails: human takeover, complaint routing, spam detection.
 *
 * Returns same format as V1's handleMessage() for drop-in compatibility.
 */
const { buildV2SystemPrompt } = require('./v2-prompt');
const { PRODUCTS, UPSELL_MAP, getHonorific, deliveryTime, fmtPrice } = require('./data');
const { validatePhone, extractCity, extractPhone, detectProduct } = require('./extractors');
const { getDb } = require('../db');
const customerModel = require('../db/models/customer');
const conversationModel = require('../db/models/conversation');
const messageModel = require('../db/models/message');

// In-memory conversation states (keyed by phone)
const v2Conversations = {};

function normalizePhone(p) {
  if (!p) return 'unknown';
  return p.replace(/[\s\-\(\)\+]/g, '').replace(/^92/, '0');
}

function getOrCreateConvV2(phone) {
  if (!v2Conversations[phone]) {
    v2Conversations[phone] = {
      current: 'IDLE',
      collected: {
        product: null, name: null, phone: null,
        delivery_phone: null, city: null, address: null,
      },
      product: null, // full product object
      gender: null,
      haggle_round: 0,
      discount_percent: 0,
      upsell_shown: false,
      upsell_pending: null,
      messages: [], // conversation history for AI context
      _db_conversation_id: null,
      _db_customer_id: null,
    };
  }
  return v2Conversations[phone];
}

function resetConvV2(phone) {
  delete v2Conversations[phone];
}

// ============= AI CALL =============
async function callAI(systemPrompt, messages, storeName, apiKey) {
  const OpenAI = require('openai');
  const { getActiveModel, getModelInfo } = require('../ai/claude');

  if (!apiKey) {
    const settingsModel = require('../db/models/settings');
    apiKey = settingsModel.get('openai_api_key', '');
  }
  if (!apiKey) throw new Error('OpenAI API key not set');

  const openai = new OpenAI({ apiKey });
  const activeModel = getActiveModel();

  // Keep last 10 messages for context (5 exchanges)
  const recentMessages = messages.slice(-10);

  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages
  ];

  const response = await openai.chat.completions.create({
    model: activeModel,
    max_tokens: 300,
    messages: openaiMessages,
    // No response_format — V2 returns plain text, not JSON
  });

  const reply = response.choices[0]?.message?.content || '';

  return {
    reply,
    tokens_in: response.usage?.prompt_tokens || 0,
    tokens_out: response.usage?.completion_tokens || 0,
  };
}

// ============= STATE TRANSITION LOGIC =============
// After AI generates reply, we need to determine state transitions
// based on what data was collected from customer's message
function processMessage(state, message) {
  const lm = message.toLowerCase().trim();
  const currentState = state.current;
  const collected = state.collected;

  // Gender detection from feminine verb forms
  if (!state.gender) {
    const isFeminine = /\b(btao\s*gi|batao\s*gi|krlun\s*gi|kar[uo]n\s*gi|deti\s*h[ou]n|lun\s*gi|kr[uo]n\s*gi|karti\s*h[ou]n|dekhon\s*gi|rakhon\s*gi|aaon\s*gi|jaon\s*gi)\b/i.test(lm);
    if (isFeminine) state.gender = 'female';
  }

  // Extract data from message based on current state
  const extracted = {};

  // Always try to extract phone if not collected
  if (!collected.phone) {
    const phone = extractPhone(message);
    if (phone) {
      const validated = validatePhone(phone);
      if (validated.valid) extracted.phone = validated.phone;
    }
  }

  // Always try to extract city if not collected
  if (!collected.city) {
    const city = extractCity(message);
    if (city) extracted.city = city;
  }

  // Product detection
  if (!collected.product) {
    const product = detectProduct(message);
    if (product) {
      extracted.product = product.short;
      extracted.productObj = product;
    }
  }

  // Smart-fill: customer sends all info at once
  // Detect structured multi-line messages
  const lines = message.split(/\n/).filter(l => l.trim());
  if (lines.length >= 2) {
    // Try to extract name from labeled format
    for (const line of lines) {
      const nameMatch = line.match(/^(?:name|naam)\s*[.::\-]\s*(.+)/i);
      if (nameMatch && !collected.name) {
        const name = nameMatch[1].trim();
        if (name.length >= 2 && name.length <= 50 && /^[A-Za-z\s.]+$/.test(name)) {
          extracted.name = name;
        }
      }
      // City from labeled
      const cityMatch = line.match(/^(?:city|shehar|shehr)\s*[.::\-]\s*(.+)/i);
      if (cityMatch && !collected.city) {
        extracted.city = extractCity(cityMatch[1]) || cityMatch[1].trim();
      }
      // Address from labeled
      const addrMatch = line.match(/^(?:address|pata)\s*[.::\-]\s*(.+)/i);
      if (addrMatch && !collected.address) {
        extracted.address = addrMatch[1].trim();
      }
    }
  }

  // Single-line smart-fill: "Chaudhry Rehman 04212678976 Hyderabad"
  // If phone was extracted, try to extract name from text before the phone number
  if (extracted.phone && !collected.name && !extracted.name) {
    const phonePattern = message.match(/(\d[\d\s\-]{9,})/);
    if (phonePattern) {
      const beforePhone = message.substring(0, phonePattern.index).trim();
      // Remaining text after phone number
      const afterPhone = message.substring(phonePattern.index + phonePattern[0].length).trim();
      // Name = text before phone (if it looks like a name: 2+ alpha words)
      if (beforePhone && /^[A-Za-z\s.]{2,50}$/.test(beforePhone) && !/\b(order|chahiye|product|send|bhej)\b/i.test(beforePhone)) {
        extracted.name = beforePhone.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      // City = text after phone (if it matches a known city)
      if (afterPhone && !collected.city && !extracted.city) {
        const cityFromAfter = extractCity(afterPhone);
        if (cityFromAfter) extracted.city = cityFromAfter;
      }
    }
  }

  // Yes/No detection
  const isYes = /^(jee|ji|g|j|haan|han|h[aā]n|yes|yess|yeah|ok|okay|theek|thik|sahi|bilkul|zaroor|kr\s*do|kardo|kar\s*dein|laga\s*do|lagado|confirm|done)\b/i.test(lm) ||
    /^(jee|g|han|ji|ok)\s*$/i.test(lm);
  const isNo = /^(nahi|nhi|nai|nahin|no|nope|cancel|nahi\s*chahiye|nahi\s*chaiye)\b/i.test(lm);

  // Complaint detection
  const isComplaint = /\b(kharab|toot|broken|damaged|fake|dhoka|scam|fraud|return\s*kr|refund\s*kr|not\s*working|kam\s*nahi\s*kart[aie]|chal\s*nahi|galat\s*bhej)\b/i.test(lm);

  return { extracted, isYes, isNo, isComplaint };
}

// ============= DETERMINE NEXT STATE =============
function determineNextState(state, extracted, isYes, isNo) {
  const current = state.current;
  const collected = state.collected;

  // Apply extracted data to collected
  if (extracted.product && !collected.product) {
    collected.product = extracted.product;
    state.product = extracted.productObj;
  }
  if (extracted.name && !collected.name) collected.name = extracted.name;
  if (extracted.phone && !collected.phone) collected.phone = extracted.phone;
  if (extracted.city && !collected.city) collected.city = extracted.city;
  if (extracted.address && !collected.address) collected.address = extracted.address;

  switch (current) {
    case 'IDLE':
    case 'GREETING':
      if (collected.product) return 'COLLECT_NAME';
      return 'PRODUCT_INQUIRY';

    case 'PRODUCT_INQUIRY':
    case 'PRODUCT_SELECTION':
      if (isYes && collected.product) return 'COLLECT_NAME';
      if (collected.product && (isYes || /\b(order|chahiye|chahea|mangwa|bhej)\b/i.test(state._lastMsg || '')))
        return 'COLLECT_NAME';
      return current;

    case 'COLLECT_NAME':
      // AI will extract name from response
      if (collected.name) {
        // Skip ahead if phone/city already collected in same message
        if (collected.phone) {
          if (collected.delivery_phone || collected.delivery_phone === 'same') {
            if (collected.city) return collected.address ? 'ORDER_SUMMARY' : 'COLLECT_ADDRESS';
            return 'COLLECT_CITY';
          }
          return 'COLLECT_DELIVERY_PHONE';
        }
        return 'COLLECT_PHONE';
      }
      return current;

    case 'COLLECT_PHONE':
      if (collected.phone) {
        // Skip ahead if city already collected
        if (collected.city) return collected.address ? 'ORDER_SUMMARY' : 'COLLECT_ADDRESS';
        return 'COLLECT_DELIVERY_PHONE';
      }
      return current;

    case 'COLLECT_DELIVERY_PHONE':
      if (isYes || /\b(same|yehi|yahi|isi|issi|haan)\b/i.test(state._lastMsg || '')) {
        collected.delivery_phone = 'same';
        return 'COLLECT_CITY';
      }
      // If they gave a different phone number
      if (extracted.phone) {
        collected.delivery_phone = extracted.phone;
        return 'COLLECT_CITY';
      }
      return current;

    case 'COLLECT_CITY':
      if (collected.city) return 'COLLECT_ADDRESS';
      return current;

    case 'COLLECT_ADDRESS':
      // AI should detect when address is complete
      if (collected.address) return 'ORDER_SUMMARY';
      return current;

    case 'ORDER_SUMMARY':
      if (isYes) return 'CONFIRM_AND_UPSELL';
      if (isNo) return 'ORDER_SUMMARY'; // stay, ask what to change
      return current;

    case 'HAGGLING':
      if (isYes) return 'ORDER_SUMMARY';
      state.haggle_round++;
      if (state.haggle_round >= 3) return 'ORDER_SUMMARY';
      return current;

    case 'UPSELL_HOOK':
      if (isYes) return 'UPSELL_SHOW';
      if (isNo) return 'ORDER_CONFIRMED';
      return current;

    case 'UPSELL_SHOW':
      if (isNo || /\b(nahi|bas|koi\s*nahi|nhi)\b/i.test(state._lastMsg || '')) return 'ORDER_CONFIRMED';
      return current;

    case 'ORDER_CONFIRMED':
      return current;

    default:
      return current;
  }
}

// ============= MAIN HANDLER =============
async function handleMessageV2(message, phone, storeName, apiKey, options = {}) {
  const startTime = Date.now();
  phone = normalizePhone(phone);
  const state = getOrCreateConvV2(phone);

  // Store pending options
  const pendingWaMessageId = options.wa_message_id || null;
  const pendingMediaType = options.incoming_media_type || null;
  const pendingMediaUrl = options.incoming_media_url || null;
  const mediaCost = options.mediaCost || null;

  // Guard: empty message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      reply: 'Ji, sirf text messages samajh aata hai. Apna sawal likh ke bhejein.',
      state: 'UNKNOWN', collected: {}, needs_human: false, source: 'guard',
      intent: 'non_text', tokens_in: 0, tokens_out: 0, response_ms: 0,
    };
  }

  // DB setup
  let dbCustomer = null, dbConv = null;
  try {
    dbCustomer = customerModel.findOrCreate(phone);
    dbConv = conversationModel.getOrCreateActive(dbCustomer.id, storeName);
    state._db_conversation_id = dbConv?.id;
    state._db_customer_id = dbCustomer?.id;

    // Mark as v2
    if (dbConv) {
      try {
        getDb().prepare("UPDATE conversations SET bot_version = 'v2' WHERE id = ? AND (bot_version IS NULL OR bot_version != 'v2')").run(dbConv.id);
      } catch (e) {}
    }

    // Sync: if DB is IDLE but memory has state, reset
    if (dbConv && dbConv.state === 'IDLE' && state.current !== 'IDLE' && state.current !== 'GREETING') {
      delete v2Conversations[phone];
      return handleMessageV2(message, phone, storeName, apiKey, options);
    }
  } catch (e) {
    console.error('[V2] DB setup error:', e.message);
  }

  // Save incoming message to DB
  if (dbConv) {
    messageModel.create(dbConv.id, 'incoming', 'customer', message, {
      source: 'whatsapp', wa_message_id: pendingWaMessageId,
      media_type: pendingMediaType, media_url: pendingMediaUrl,
    });
    conversationModel.updateLastMessage(dbConv.id, message);
    conversationModel.setAdminUnread(dbConv.id, true);
  }

  state._lastMsg = message;

  // Process message: extract data, detect yes/no/complaint
  const { extracted, isYes, isNo, isComplaint: isComplaintMsg } = processMessage(state, message);

  // Complaint intercept
  if (isComplaintMsg && state.current !== 'COMPLAINT') {
    state.current = 'COMPLAINT';
    const honorific = getHonorific(state.collected.name, state.gender);
    const reply = `${state.collected.name ? state.collected.name + ' ' + honorific + ', ' : ''}aap is number pe message karein — 03701337838 🙏 InshaAllah aapka masla resolve ho jayega ✅`;

    state.messages.push({ role: 'user', content: message });
    state.messages.push({ role: 'assistant', content: reply });

    if (dbConv) {
      messageModel.create(dbConv.id, 'outgoing', 'bot', reply, { source: 'v2_ai' });
      conversationModel.updateState(dbConv.id, 'COMPLAINT');
      conversationModel.updateLastMessage(dbConv.id, reply);
      getDb().prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1 WHERE id = ?').run(dbConv.id);
    }

    return {
      reply, state: 'COMPLAINT', collected: state.collected,
      needs_human: true, source: 'v2_ai', intent: 'complaint',
      tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
    };
  }

  // Explicit media request detection ("video dikhao", "picture bhejo")
  const lm = message.toLowerCase().trim();
  const isMediaRequest =
    /\b(video|vidoe|vedio|vid|reel)\s*(dikha|dikhana|dikhao|dikhado|bhej|bhejo|bhejdo|bhejdena|send|de|do|dena|chahiye)\b/i.test(lm) ||
    /\b(dikha|dikhana|dikhao|bhej|bhejo|send|de)\s*(do|dena|na)?\s*(picture|photo|pic|image|tasveer|tasver|video|vid|vidoe|vedio)\b/i.test(lm) ||
    /\b(pic(ture)?s?\s*(send|bhej)|photos?\s*(send|bhej)|videos?\s*(send|bhej))\b/i.test(lm) ||
    /\bki\s+(video|vidoe|vedio|vid|picture|photo|pic|image|tasveer)\b/i.test(lm);

  if (isMediaRequest) {
    const mediaProduct = detectProduct(message) || state.product;
    const mediaType = /\b(video|vidoe|vedio|vid|reel)\b/i.test(lm) ? 'video' : 'image';
    if (mediaProduct) {
      state.messages.push({ role: 'user', content: message });
      if (dbConv) {
        messageModel.create(dbConv.id, 'incoming', 'customer', message, { source: 'customer', wa_message_id: options.wa_message_id });
        conversationModel.updateLastMessage(dbConv.id, message);
      }
      return {
        reply: null, state: state.current, collected: state.collected,
        needs_human: false, source: 'v2_ai', intent: 'media_request',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        _media: { product_id: mediaProduct.id, type: mediaType, product_name: mediaProduct.short },
      };
    }
    // No product detected — AI will ask which product
  }

  // Determine state transition BEFORE AI call (so AI knows what to do)
  const prevState = state.current;
  const nextState = determineNextState(state, extracted, isYes, isNo);

  // Special: ORDER_SUMMARY confirmed → save order first
  if (nextState === 'CONFIRM_AND_UPSELL') {
    const orderSaved = saveOrder(state, storeName, dbConv, dbCustomer);
    state.current = 'UPSELL_HOOK';
  } else {
    state.current = nextState;
  }

  // Handle product detection → auto-show product info
  if (extracted.productObj && prevState === 'IDLE') {
    state.product = extracted.productObj;
    state.collected.product = extracted.productObj.short;
  }

  // Build AI context
  const honorific = getHonorific(state.collected.name, state.gender);
  const upsellCandidates = getUpsellCandidates(state.product);

  const systemPrompt = buildV2SystemPrompt({
    storeName,
    collected: state.collected,
    state: state.current,
    product: state.product,
    honorific,
    upsellCandidates: state.current === 'UPSELL_SHOW' ? upsellCandidates : null,
  });

  // Add user message to history
  state.messages.push({ role: 'user', content: message });

  // Call AI
  let aiResult;
  try {
    aiResult = await callAI(systemPrompt, state.messages, storeName, apiKey);
  } catch (e) {
    console.error('[V2] AI call failed:', e.message);
    aiResult = { reply: 'Ji, ek second — abhi jawab deta hun 😊', tokens_in: 0, tokens_out: 0 };
  }

  let reply = aiResult.reply.trim();

  // Quality checks
  reply = reply.replace(/```[\s\S]*?```/g, '').trim(); // Remove code blocks
  reply = reply.replace(/\{[\s\S]*?\}/g, '').trim(); // Remove JSON fragments
  if (!reply || reply.length < 2) {
    reply = `Ji ${honorific}, batayein kaise madad karun? 😊`;
  }

  // Post-AI: extract data from AI's context (name, address) if AI prompted and customer answered
  postAIExtraction(state, message, prevState);

  // Add AI reply to history
  state.messages.push({ role: 'assistant', content: reply });
  if (state.messages.length > 20) state.messages = state.messages.slice(-20);

  // Save outgoing message + update DB state
  const costRs = calculateCost(aiResult.tokens_in, aiResult.tokens_out);
  const { getActiveModel, getModelInfo } = require('../ai/claude');
  const _modelName = getModelInfo(getActiveModel()).name;

  if (dbConv) {
    messageModel.create(dbConv.id, 'outgoing', 'bot', reply, {
      source: 'v2_ai',
      debug_json: JSON.stringify({
        state: state.current, prev_state: prevState,
        extracted, tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
        _cost_rs: costRs, _model: _modelName,
      }),
    });
    // Update state + collected in DB
    try {
      const productJson = state.product ? JSON.stringify(state.product) : null;
      const collectedJson = JSON.stringify(state.collected);
      getDb().prepare(`UPDATE conversations SET state = ?, product_json = ?, collected_json = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
        .run(state.current, productJson, collectedJson, dbConv.id);
    } catch (e) {}
    conversationModel.updateLastMessage(dbConv.id, reply);
    // Update customer name if collected
    if (state.collected.name && dbCustomer) {
      try {
        getDb().prepare('UPDATE customers SET name = ? WHERE id = ? AND (name IS NULL OR name = ?)').run(state.collected.name, dbCustomer.id, dbCustomer.name || '');
      } catch (e) {}
    }
  }

  // Handle media: if product just detected in IDLE, send product video
  let mediaToSend = null;
  if (extracted.productObj && prevState === 'IDLE') {
    mediaToSend = { product_id: extracted.productObj.id, type: 'video', product_name: extracted.productObj.short };
  }

  const responseMs = Date.now() - startTime;

  return {
    reply,
    state: state.current,
    collected: state.collected,
    needs_human: false,
    source: 'v2_ai',
    intent: extracted.product ? 'product_inquiry' : 'unknown',
    tokens_in: aiResult.tokens_in,
    tokens_out: aiResult.tokens_out,
    response_ms: responseMs,
    ai_cost_rs: calculateCost(aiResult.tokens_in, aiResult.tokens_out),
    _media: mediaToSend,
  };
}

// ============= HELPERS =============

function postAIExtraction(state, message, prevState) {
  const lm = message.trim();

  // Name extraction: if we were in COLLECT_NAME and customer replied
  if (prevState === 'COLLECT_NAME' && !state.collected.name) {
    // Simple heuristic: if message is 1-4 words and looks like a name
    const words = lm.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 1 && words.length <= 4) {
      const nameCandidate = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      // Reject if it looks like a command or question
      if (!/\b(order|chahiye|karna|price|kitna|kitne|kya|nahi|haan)\b/i.test(nameCandidate) && nameCandidate.length >= 2 && nameCandidate.length <= 50) {
        state.collected.name = nameCandidate;
        // Auto-advance state
        if (state.current === 'COLLECT_NAME') state.current = 'COLLECT_PHONE';
      }
    }
  }

  // Phone extraction
  if (prevState === 'COLLECT_PHONE' && !state.collected.phone) {
    const phone = extractPhone(lm);
    if (phone) {
      const validated = validatePhone(phone);
      if (validated.valid) {
        state.collected.phone = validated.phone;
        if (state.current === 'COLLECT_PHONE') state.current = 'COLLECT_DELIVERY_PHONE';
      }
    }
  }

  // City extraction
  if (prevState === 'COLLECT_CITY' && !state.collected.city) {
    const city = extractCity(lm);
    if (city) {
      state.collected.city = city;
      if (state.current === 'COLLECT_CITY') state.current = 'COLLECT_ADDRESS';
    }
  }

  // Address: if in COLLECT_ADDRESS and customer sent something substantial
  if (prevState === 'COLLECT_ADDRESS' && !state.collected.address) {
    if (lm.length >= 10) {
      // Accept address as-is (v2 philosophy: don't force parse)
      state.collected.address = lm;
      if (state.current === 'COLLECT_ADDRESS') state.current = 'ORDER_SUMMARY';
    }
  }
}

function saveOrder(state, storeName, dbConv, dbCustomer) {
  try {
    const db = getDb();
    const product = state.product;
    if (!product || !dbConv || !dbCustomer) return false;

    const items = [{ name: product.name, price: product.price, quantity: 1 }];
    const discount = state.discount_percent || 0;
    const subtotal = product.price;
    const discountTotal = Math.round(subtotal * discount / 100);
    const grandTotal = subtotal - discountTotal;

    const orderId = `NRV-WA-${Math.floor(10000 + Math.random() * 90000)}`;

    db.prepare(`INSERT INTO orders (order_id, conversation_id, customer_id, store_name, customer_name, customer_phone, delivery_phone, customer_city, customer_address, items_json, subtotal, delivery_fee, discount_percent, discount_total, grand_total, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'confirmed', 'bot_v2', datetime('now','localtime'), datetime('now','localtime'))`
    ).run(
      orderId, dbConv.id, dbCustomer.id, storeName || 'Nureva',
      state.collected.name, state.collected.phone,
      state.collected.delivery_phone || 'same',
      state.collected.city, state.collected.address,
      JSON.stringify(items), subtotal, discount, discountTotal, grandTotal
    );

    // Update conversation state
    db.prepare("UPDATE conversations SET state = 'ORDER_CONFIRMED' WHERE id = ?").run(dbConv.id);

    // Update customer
    try {
      db.prepare('UPDATE customers SET name = ?, order_count = order_count + 1, total_spend = total_spend + ? WHERE id = ?')
        .run(state.collected.name, grandTotal, dbCustomer.id);
    } catch (e) {}

    console.log(`[V2] Order saved: ${orderId} — ${state.collected.name} — ${fmtPrice(grandTotal)}`);
    return true;
  } catch (e) {
    console.error('[V2] Save order error:', e.message);
    return false;
  }
}

function getUpsellCandidates(product) {
  if (!product) return [];
  const upsellIds = UPSELL_MAP[product.id] || [];
  return upsellIds.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean).slice(0, 3);
}

function calculateCost(tokensIn, tokensOut) {
  const { getActiveModel, getModelInfo } = require('../ai/claude');
  const modelInfo = getModelInfo(getActiveModel());
  const costUsd = (tokensIn * modelInfo.input + tokensOut * modelInfo.output) / 1_000_000;
  return Math.round(costUsd * 280 * 100) / 100; // Convert to PKR (1 USD ≈ 280 PKR)
}

module.exports = { handleMessageV2, getOrCreateConvV2, resetConvV2, v2Conversations };
