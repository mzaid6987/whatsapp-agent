/**
 * Bot V2 — Full AI-Driven Handler
 *
 * AI handles EVERYTHING: reply generation, state transitions, data extraction.
 * Code only handles: validation (phone/city), order creation, media sending, DB ops.
 * AI returns JSON: { reply, next_state, extracted: { name, phone, city, address, delivery_phone, product } }
 */
const { buildV2SystemPrompt } = require('./v2-prompt');
const { PRODUCTS, UPSELL_MAP, getHonorific, deliveryTime, fmtPrice } = require('./data');
const { validatePhone, extractCity, detectProduct } = require('./extractors');
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
      product: null,
      gender: null,
      haggle_round: 0,
      discount_percent: 0,
      messages: [],
      _db_conversation_id: null,
      _db_customer_id: null,
    };
  }
  return v2Conversations[phone];
}

function resetConvV2(phone) {
  delete v2Conversations[phone];
}

// ============= AI CALL (JSON mode) =============
async function callAI(systemPrompt, messages, apiKey) {
  const OpenAI = require('openai');
  const { getActiveModel } = require('../ai/claude');

  if (!apiKey) {
    const settingsModel = require('../db/models/settings');
    apiKey = settingsModel.get('openai_api_key', '');
  }
  if (!apiKey) throw new Error('OpenAI API key not set');

  const openai = new OpenAI({ apiKey });
  const activeModel = getActiveModel();
  const recentMessages = messages.slice(-12);

  const response = await openai.chat.completions.create({
    model: activeModel,
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      ...recentMessages,
    ],
    response_format: { type: 'json_object' },
  });

  const rawText = response.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Fallback: extract JSON from response
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    if (!parsed) parsed = { reply: rawText.replace(/[{}"]/g, '').trim(), _parse_failed: true };
  }

  return {
    parsed,
    tokens_in: response.usage?.prompt_tokens || 0,
    tokens_out: response.usage?.completion_tokens || 0,
  };
}

// ============= VALIDATION LAYER =============
// Code validates what AI extracted — AI can be wrong about phone format, city names
function validateExtracted(aiExtracted, state) {
  const validated = {};

  // Product: match AI's product name against catalog
  if (aiExtracted.product && !state.collected.product) {
    const product = detectProduct(aiExtracted.product);
    if (product) {
      validated.product = product.short;
      validated._productObj = product;
    }
  }

  // Name: basic sanity check
  if (aiExtracted.name && !state.collected.name) {
    let name = String(aiExtracted.name).trim();
    // Title case
    name = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    // Reject obvious non-names
    const nonNameWords = /\b(order|chahiye|product|price|send|nahi|haan|ok|purani|soorh|address|delivery|city|gali|road|colony|bazar|market|street|mohalla)\b/i;
    if (name.length >= 2 && name.length <= 50 && !nonNameWords.test(name)) {
      validated.name = name;
    }
  }

  // Phone: strict Pakistani format validation
  if (aiExtracted.phone && !state.collected.phone) {
    const phone = String(aiExtracted.phone).replace(/[\s\-\(\)\+]/g, '');
    const result = validatePhone(phone);
    if (result.valid) validated.phone = result.phone;
  }

  // Delivery phone
  if (aiExtracted.delivery_phone) {
    const dp = String(aiExtracted.delivery_phone).toLowerCase().trim();
    if (dp === 'same' || dp === 'yehi' || dp === 'same number') {
      validated.delivery_phone = 'same';
    } else {
      const dpClean = dp.replace(/[\s\-\(\)\+]/g, '');
      const result = validatePhone(dpClean);
      if (result.valid) validated.delivery_phone = result.phone;
    }
  }

  // City: validate against known cities
  if (aiExtracted.city && !state.collected.city) {
    const city = extractCity(String(aiExtracted.city));
    if (city) validated.city = city;
    else {
      // AI might have correct city not in our list — accept if reasonable
      const raw = String(aiExtracted.city).trim().replace(/\s*(hai|h|he)\s*$/i, '').trim();
      if (raw.length >= 3 && raw.length <= 50) validated.city = raw;
    }
  }

  // Address: accept as-is if reasonable length
  if (aiExtracted.address && !state.collected.address) {
    const addr = String(aiExtracted.address).trim();
    if (addr.length >= 5) validated.address = addr;
  }

  // Auto-extract city from address if city is missing
  if (!validated.city && !state.collected.city) {
    const addrToCheck = validated.address || state.collected.address || '';
    if (addrToCheck) {
      const cityFromAddr = extractCity(addrToCheck);
      if (cityFromAddr) validated.city = cityFromAddr;
    }
  }

  return validated;
}

// ============= STATE VALIDATION =============
// AI decides state but code enforces guardrails
const VALID_STATES = [
  'IDLE', 'GREETING', 'PRODUCT_INQUIRY', 'PRODUCT_SELECTION',
  'COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE',
  'COLLECT_CITY', 'COLLECT_ADDRESS', 'ORDER_SUMMARY',
  'HAGGLING', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED',
  'COMPLAINT', 'CANCEL_AFTER_CONFIRM',
];

function validateState(aiState, state) {
  if (!aiState || !VALID_STATES.includes(aiState)) return state.current;

  const collected = state.collected;
  const prev = state.current;

  // Guardrail: can't go to ORDER_SUMMARY without all required fields
  if (aiState === 'ORDER_SUMMARY' || aiState === 'ORDER_CONFIRMED' || aiState === 'UPSELL_HOOK') {
    if (!collected.product || !collected.name || !collected.phone || !collected.city || !collected.address) {
      // Find first missing field
      if (!collected.product) return 'PRODUCT_INQUIRY';
      if (!collected.name) return 'COLLECT_NAME';
      if (!collected.phone) return 'COLLECT_PHONE';
      if (!collected.delivery_phone) return 'COLLECT_DELIVERY_PHONE';
      if (!collected.city) return 'COLLECT_CITY';
      if (!collected.address) return 'COLLECT_ADDRESS';
    }
  }

  // Allow HAGGLING from collection states (customer asked about price during info gathering)
  if (aiState === 'HAGGLING' && collected.product) {
    return 'HAGGLING'; // always allow if product selected
  }

  // Guardrail: UPSELL_SHOW only from UPSELL_HOOK (not from random states)
  if (aiState === 'UPSELL_SHOW' && prev !== 'UPSELL_HOOK' && prev !== 'UPSELL_SHOW') {
    return prev; // stay in current state
  }

  // Guardrail: can't jump to ORDER_CONFIRMED without going through ORDER_SUMMARY
  if (aiState === 'ORDER_CONFIRMED' && prev !== 'ORDER_SUMMARY' && prev !== 'UPSELL_HOOK' && prev !== 'UPSELL_SHOW' && prev !== 'ORDER_CONFIRMED') {
    // If all fields present, allow ORDER_SUMMARY first
    if (collected.product && collected.name && collected.phone && collected.city && collected.address) {
      return 'ORDER_SUMMARY';
    }
    return prev;
  }

  // Guardrail: don't go to COLLECT_X if data already collected — skip to next missing
  const collectStates = {
    'COLLECT_NAME': 'name',
    'COLLECT_PHONE': 'phone',
    'COLLECT_DELIVERY_PHONE': 'delivery_phone',
    'COLLECT_CITY': 'city',
    'COLLECT_ADDRESS': 'address',
  };
  if (collectStates[aiState] && collected[collectStates[aiState]]) {
    // This field already collected — find next missing or go to ORDER_SUMMARY
    if (!collected.product) return 'PRODUCT_INQUIRY';
    if (!collected.name) return 'COLLECT_NAME';
    if (!collected.phone) return 'COLLECT_PHONE';
    if (!collected.delivery_phone) return 'COLLECT_DELIVERY_PHONE';
    if (!collected.city) return 'COLLECT_CITY';
    if (!collected.address) return 'COLLECT_ADDRESS';
    // All collected — go to summary
    return 'ORDER_SUMMARY';
  }

  return aiState;
}

// ============= MAIN HANDLER =============
async function handleMessageV2(message, phone, storeName, apiKey, options = {}) {
  const startTime = Date.now();
  phone = normalizePhone(phone);
  const state = getOrCreateConvV2(phone);

  const pendingWaMessageId = options.wa_message_id || null;
  const pendingMediaType = options.incoming_media_type || null;
  const pendingMediaUrl = options.incoming_media_url || null;

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

    if (dbConv) {
      try { getDb().prepare("UPDATE conversations SET bot_version = 'v2' WHERE id = ? AND (bot_version IS NULL OR bot_version != 'v2')").run(dbConv.id); } catch (e) {}
    }

    // Sync: if DB is IDLE but memory has non-IDLE state, reset
    if (dbConv && dbConv.state === 'IDLE' && state.current !== 'IDLE' && state.current !== 'GREETING') {
      delete v2Conversations[phone];
      return handleMessageV2(message, phone, storeName, apiKey, options);
    }

    // Restore from DB if memory is empty
    if (dbConv && state.current === 'IDLE' && dbConv.state && dbConv.state !== 'IDLE') {
      state.current = dbConv.state;
      try {
        const dbCollected = JSON.parse(dbConv.collected_json || '{}');
        Object.assign(state.collected, dbCollected);
        if (dbConv.product_json) state.product = JSON.parse(dbConv.product_json);
      } catch (e) {}
      // Restore messages from DB
      try {
        const recentMsgs = messageModel.getRecent(dbConv.id, 12) || [];
        state.messages = recentMsgs.map(m => ({
          role: m.direction === 'incoming' ? 'user' : 'assistant',
          content: m.content || '',
        }));
      } catch (e) {}
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

  // Gender detection
  const lm = message.toLowerCase().trim();
  if (!state.gender) {
    if (/\b(btao\s*gi|batao\s*gi|krlun\s*gi|kar[uo]n\s*gi|deti\s*h[ou]n|lun\s*gi|karti\s*h[ou]n)\b/i.test(lm)) {
      state.gender = 'female';
    }
  }

  // Code-side product detection (AI might miss product keywords/misspellings)
  let codeDetectedProduct = null;
  if (!state.collected.product) {
    codeDetectedProduct = detectProduct(message);
  }

  // Build system prompt with full context
  const prevState = state.current;
  const honorific = getHonorific(state.collected.name, state.gender);
  const upsellCandidates = state.product ? PRODUCTS.filter(p => p.id !== state.product.id) : [];

  const systemPrompt = buildV2SystemPrompt({
    storeName,
    collected: state.collected,
    state: state.current,
    product: state.product || codeDetectedProduct,
    honorific,
    upsellCandidates,
    codeDetectedProduct,
    senderPhone: phone,
  });

  // Add user message to history
  state.messages.push({ role: 'user', content: message });

  // Call AI — returns JSON
  let aiResult;
  try {
    aiResult = await callAI(systemPrompt, state.messages, apiKey);
  } catch (e) {
    console.error('[V2] AI call failed:', e.message);
    aiResult = { parsed: { reply: 'Ji ek second, abhi jawab deta hun 😊', next_state: state.current, extracted: {} }, tokens_in: 0, tokens_out: 0 };
  }

  const aiResponse = aiResult.parsed;
  let reply = String(aiResponse.reply || '').trim();
  const aiExtracted = aiResponse.extracted || {};
  let aiNextState = aiResponse.next_state || state.current;

  // State-aware fallback if AI returned empty/garbage reply
  if (!reply || reply.length < 3 || aiResult.parsed._parse_failed) {
    reply = getStateFallback(state.current, state.collected, honorific);
  }

  // Code-side product override (if AI missed but code detected)
  if (codeDetectedProduct && !aiExtracted.product) {
    aiExtracted.product = codeDetectedProduct.short;
  }

  // Code-side: "yahi number/same/WhatsApp wala" → use sender phone
  if (state.current === 'COLLECT_PHONE' && !state.collected.phone && !aiExtracted.phone) {
    const lmsg = message.toLowerCase().replace(/[\s\-]/g, '');
    if (/yahi|yehi|same|whatsapp|isi|isipe|yehwala|yahiwala/.test(lmsg) && phone && phone !== 'unknown') {
      aiExtracted.phone = phone;
    }
  }

  // Code-side: auto-fill delivery_phone from context
  if (state.current === 'COLLECT_DELIVERY_PHONE' && !state.collected.delivery_phone && !aiExtracted.delivery_phone) {
    const lmsg = message.toLowerCase().trim();
    if (/^(haan|ha+n|jee|ji|g|ok|theek|hm+|same|yahi|yehi|isi)$/i.test(lmsg) || /same|yahi|yehi|isipe/.test(lmsg.replace(/\s/g, ''))) {
      aiExtracted.delivery_phone = 'same';
    }
  }

  // Code-side: if delivery_phone missing but bot asked "rider isi number pe call karega" and customer said ok/yes
  if (!state.collected.delivery_phone && !aiExtracted.delivery_phone && state.collected.phone) {
    const lmsg = message.toLowerCase().trim();
    const lastBot = state.messages.filter(m => m.role === 'assistant').slice(-1)[0];
    if (lastBot && /rider.*number.*call/i.test(lastBot.content || '') && /^(ok|haan|ha+n|jee|ji|g|theek|yes)$/i.test(lmsg)) {
      aiExtracted.delivery_phone = 'same';
    }
  }

  // Validate AI's extracted data
  const validated = validateExtracted(aiExtracted, state);

  // Apply validated data to state
  if (validated.product && !state.collected.product) {
    state.collected.product = validated.product;
    state.product = validated._productObj;
  }
  if (validated.name) state.collected.name = validated.name;
  if (validated.phone) state.collected.phone = validated.phone;
  if (validated.delivery_phone) state.collected.delivery_phone = validated.delivery_phone;
  if (validated.city) state.collected.city = validated.city;
  if (validated.address) state.collected.address = validated.address;

  // Validate AI's state transition
  const newState = validateState(aiNextState, state);
  state.current = newState;

  // "Can't read English" detection → escalate to human
  const cantReadEnglish = /english\s*nahi\s*aa|urdu\s*mein\s*(bol|baat|likh)|samajh\s*nahi\s*aa|mujhe\s*nahi\s*aata|nahi\s*samajh/i.test(message);
  if (cantReadEnglish && state.messages.filter(m => m.role === 'user' && /english|urdu|samajh\s*nahi|nahi\s*aata/i.test(m.content)).length >= 2) {
    // Customer has asked 2+ times → needs human
    if (dbConv) {
      getDb().prepare('UPDATE conversations SET needs_human = 1 WHERE id = ?').run(dbConv.id);
    }
  }

  // Complaint intercept — code enforces
  if (aiResponse.is_complaint || (aiNextState === 'COMPLAINT' && state.current !== 'COMPLAINT')) {
    state.current = 'COMPLAINT';
    if (dbConv) {
      getDb().prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1 WHERE id = ?').run(dbConv.id);
    }
  }

  // Order creation — when AI moves to ORDER_CONFIRMED or UPSELL from ORDER_SUMMARY
  let orderSaved = false;
  if ((newState === 'ORDER_CONFIRMED' || newState === 'UPSELL_HOOK' || newState === 'UPSELL_SHOW') && prevState === 'ORDER_SUMMARY') {
    orderSaved = saveOrder(state, storeName, dbConv, dbCustomer);
  }

  // Media detection — product video on first product mention
  let mediaToSend = null;
  if (validated._productObj && !state._media_sent) {
    mediaToSend = { product_id: validated._productObj.id, type: 'video', product_name: validated._productObj.short };
    state._media_sent = true;
  }
  // AI requested media
  if (aiResponse.send_media) {
    const mediaProduct = detectProduct(aiResponse.send_media) || state.product;
    if (mediaProduct) {
      mediaToSend = { product_id: mediaProduct.id, type: 'video', product_name: mediaProduct.short };
    }
  }

  // Quality check on reply
  reply = reply.replace(/```[\s\S]*?```/g, '').trim();
  if (reply.startsWith('{') || reply.startsWith('[')) {
    reply = getStateFallback(state.current, state.collected, honorific);
  }
  if (!reply || reply.length < 3) {
    reply = getStateFallback(state.current, state.collected, honorific);
  }
  // "Ji batayein" killer — if AI returns this generic garbage, replace with context-aware response
  if (/^ji\s*batay?ein/i.test(reply.replace(/[^\w\s]/g, '').trim())) {
    reply = getStateFallback(state.current, state.collected, honorific);
  }

  // Price/discount dodge killer — if in COLLECT_NAME and customer asked about price/discount, ensure reply includes price
  if (state.current === 'COLLECT_NAME' && state.collected.product) {
    const priceDodge = /\b(price|rate|kitne|kitni|kya\s*rate|discount|kam|less|kum|final\s*rate|kitna)\b/i.test(message);
    const replyHasPrice = /Rs\.?\s*\d|price|rate|kitne/i.test(reply);
    if (priceDodge && !replyHasPrice) {
      const p = PRODUCTS.find(pr => pr.short === state.collected.product);
      if (p) {
        reply = `${state.collected.product} ki price Rs.${fmtPrice(p.price)} hai, COD hai aur delivery FREE hai 😊 ${honorific}, apna naam bata dein?`;
      }
    }
  }

  // Banned words filter — code-side enforcement
  const BANNED_WORDS = ['premium', 'high-quality', 'ultra', 'top-notch', 'superior', 'excellent', 'nureva', 'thenureva', 'kripya', 'dhanyavaad', 'namaste'];
  const replyLower = reply.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (replyLower.includes(word)) {
      reply = reply.replace(new RegExp(word, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
    }
  }
  // Replace "best" only when used as adjective
  reply = reply.replace(/\b(best)\b/gi, 'achi').trim();

  // Duplicate reply prevention — don't send same or similar message as last bot message
  const lastBotMsg = state.messages.filter(m => m.role === 'assistant').slice(-1)[0];
  if (lastBotMsg && reply.length > 15) {
    const lastContent = lastBotMsg.content || '';
    // Exact match OR first 50 chars match (catches slight variations of same reply)
    if (lastContent === reply || (lastContent.substring(0, 50) === reply.substring(0, 50) && lastContent.length > 20)) {
      reply = getStateFallback(state.current, state.collected, honorific);
    }
  }

  // Add AI reply to history
  state.messages.push({ role: 'assistant', content: reply });
  if (state.messages.length > 20) state.messages = state.messages.slice(-20);

  // Save to DB
  const costRs = calculateCost(aiResult.tokens_in, aiResult.tokens_out);
  const { getActiveModel, getModelInfo } = require('../ai/claude');
  const _modelName = getModelInfo(getActiveModel()).name;

  if (dbConv) {
    messageModel.create(dbConv.id, 'outgoing', 'bot', reply, {
      source: 'v2_ai',
      debug_json: JSON.stringify({
        state: state.current, prev_state: prevState,
        ai_extracted: aiExtracted, validated,
        ai_next_state: aiNextState, final_state: newState,
        tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
        _cost_rs: costRs, _model: _modelName,
      }),
    });
    try {
      const productJson = state.product ? JSON.stringify(state.product) : null;
      const collectedJson = JSON.stringify(state.collected);
      getDb().prepare(`UPDATE conversations SET state = ?, product_json = ?, collected_json = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
        .run(state.current, productJson, collectedJson, dbConv.id);
    } catch (e) {}
    conversationModel.updateLastMessage(dbConv.id, reply);
    if (state.collected.name && dbCustomer) {
      try {
        getDb().prepare('UPDATE customers SET name = ? WHERE id = ? AND (name IS NULL OR name = ?)').run(state.collected.name, dbCustomer.id, dbCustomer.name || '');
      } catch (e) {}
    }
  }

  const responseMs = Date.now() - startTime;

  return {
    reply,
    state: state.current,
    collected: state.collected,
    needs_human: aiResponse.is_complaint || false,
    source: 'v2_ai',
    intent: validated.product ? 'product_inquiry' : (aiResponse.intent || 'conversation'),
    tokens_in: aiResult.tokens_in,
    tokens_out: aiResult.tokens_out,
    response_ms: responseMs,
    ai_cost_rs: costRs,
    _media: mediaToSend,
    db_conversation_id: state._db_conversation_id,
    db_customer_id: state._db_customer_id,
  };
}

// ============= HELPERS =============

// State-aware fallback — never returns generic "Ji batayein"
function getStateFallback(currentState, collected, honorific) {
  const h = honorific || 'sir';
  switch (currentState) {
    case 'IDLE':
    case 'GREETING':
      return `Assalam-o-Alaikum ${h}! Kya aap kisi product ke baare mein janna chahte hain? 😊`;
    case 'PRODUCT_INQUIRY':
    case 'PRODUCT_SELECTION':
      if (collected.product) {
        const p = PRODUCTS.find(pr => pr.short === collected.product);
        return `${collected.product} ki price Rs.${p ? fmtPrice(p.price) : '?'} hai. Kya aap order karna chahenge? 😊`;
      }
      return `Hamare paas kaafi products hain — aap konsa dekhna chahenge? 😊`;
    case 'COLLECT_NAME': {
      const p = collected.product ? PRODUCTS.find(pr => pr.short === collected.product) : null;
      if (p) return `${collected.product} ki price Rs.${fmtPrice(p.price)} hai, COD hai aur delivery FREE hai. ${h}, apna naam bata dein? 😊`;
      return `${h}, apna naam bata dein taake order process kar sakein? 😊`;
    }
    case 'COLLECT_PHONE':
      return `${collected.name || h}, apna phone number bata dein (03XX format)? 📱`;
    case 'COLLECT_DELIVERY_PHONE':
      return `Rider ${collected.phone || 'aapke number'} pe call karega. Yeh theek hai ya koi aur number dein? 📞`;
    case 'COLLECT_CITY':
      return `Delivery konsi city mein karni hai? 🚚`;
    case 'COLLECT_ADDRESS':
      return `Apna poora delivery address bhej dein — ghar/shop number, mohalla/area 📍`;
    case 'ORDER_SUMMARY':
      return `Sab theek hai to "haan" bol dein, order confirm ho jayega ✅`;
    case 'HAGGLING':
      return `Yeh price already discounted hai. COD hai, free delivery hai, aur 7 din exchange bhi hai 😊`;
    case 'UPSELL_HOOK':
      return `${collected.name || h}, discount products dekhna chahein ge? Sath delivery free hogi 🚚`;
    case 'UPSELL_SHOW': {
      const upsellList = PRODUCTS.filter(p => p.short !== collected.product).slice(0, 4)
        .map((p, i) => `${i+1}. ${p.name} — Rs.${fmtPrice(Math.max(499, p.price - 500))}`).join('\n');
      return `Yeh hain discount products:\n${upsellList}\nKoi pasand aaye to number ya naam bata dein 😊`;
    }
    case 'ORDER_CONFIRMED':
      return `Aapka order confirm ho chuka hai! Delivery 3-5 din mein hogi 📦`;
    case 'COMPLAINT':
      return `Aap 03701337838 pe message karein, masla resolve ho jayega 🙏`;
    default:
      return `${h}, main aapki kaise madad kar sakti hun? 😊`;
  }
}

function saveOrder(state, storeName, dbConv, dbCustomer) {
  try {
    const db = getDb();
    let product = state.product;
    // Fallback: if product obj is null but collected has product name, find it
    if (!product && state.collected.product) {
      product = detectProduct(state.collected.product);
      if (product) state.product = product;
    }
    if (!product || !dbConv || !dbCustomer) return false;

    const items = [{ name: product.name, price: product.price, quantity: 1 }];
    const discount = state.discount_percent || 0;
    const subtotal = product.price;
    const discountTotal = Math.round(subtotal * discount / 100);
    const grandTotal = subtotal - discountTotal;

    const orderId = `NRV-WA-${Math.floor(10000 + Math.random() * 90000)}`;

    db.prepare(`INSERT INTO orders (order_id, conversation_id, customer_id, store_name, customer_name, customer_phone, delivery_phone, customer_city, customer_address, items_json, subtotal, delivery_fee, discount_percent, discount_total, grand_total, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'confirmed', 'bot_v2', datetime('now','localtime'), datetime('now','localtime'))`)
    .run(
      orderId, dbConv.id, dbCustomer.id, storeName || 'Nureva',
      state.collected.name, state.collected.phone,
      state.collected.delivery_phone === 'same' ? state.collected.phone : (state.collected.delivery_phone || state.collected.phone),
      state.collected.city, state.collected.address,
      JSON.stringify(items), subtotal, discount, discountTotal, grandTotal
    );

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

function calculateCost(tokensIn, tokensOut) {
  const { getActiveModel, getModelInfo } = require('../ai/claude');
  const modelInfo = getModelInfo(getActiveModel());
  const costUsd = (tokensIn * modelInfo.input + tokensOut * modelInfo.output) / 1_000_000;
  return Math.round(costUsd * 280 * 100) / 100;
}

module.exports = { handleMessageV2, getOrCreateConvV2, resetConvV2, v2Conversations };
