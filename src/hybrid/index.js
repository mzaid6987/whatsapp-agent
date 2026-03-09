/**
 * AI-First Orchestrator
 *
 * Flow: preCheck (CODE) → template-only states → AI call → validate → quality gate
 *
 * AI handles: GREETING, PRODUCT_INQUIRY, COLLECT_NAME, COLLECT_ADDRESS, HAGGLING
 * Code handles: phone/city validation, complaints, ORDER_SUMMARY, UPSELL, ORDER_CONFIRMED
 */
const { preCheck, isYes, isNo, isComplaint } = require('./pre-check');
const { handleTemplateState, askNextField, buildOrderSummary, nextMissingState, buildVars, confirmOrder } = require('./state-machine');
const { qualityGate } = require('./quality-gate');
const { composePrompt } = require('../ai/prompt-composer');
const { chat, AI_MODEL_NAME, AI_PRICING } = require('../ai/claude');
const { getHonorific, PRODUCTS, deliveryTime, productList } = require('./data');
const { fillTemplate } = require('./templates');
const { buildAddressString, validatePhone, extractCity, extractAllCities, extractPhone, extractArea, isLikelyName, hasAddressKeywords, detectProduct } = require('./extractors');
const { getAreaSuggestions, matchArea } = require('./city-areas');
const { getDb } = require('../db');

// DB models
const customerModel = require('../db/models/customer');
const conversationModel = require('../db/models/conversation');
const messageModel = require('../db/models/message');
const { getSmartFill } = require('./context-builder');

// ============= MULTI-LINE DETAIL EXTRACTION =============
// When customer sends product + name + phone + address + city in one message
// Handles both newline-separated AND dot-separated messages
function extractDetailsFromMsg(msg, productShort) {
  const details = {};

  // Normalize: remove dots between digits (phone: 0312.7395452 → 03127395452)
  // Then convert dots before letters into newlines (sentence separators)
  let normalized = msg.replace(/(\d)\.(\d)/g, '$1$2');
  // Only split on dots if message has few newlines (single-line detail message)
  if (normalized.split(/\n/).filter(l => l.trim()).length < 3) {
    normalized = normalized.replace(/\.(?=\s*[A-Za-z])/g, '\n');
  }

  const lines = normalized.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

  // Phone & city extraction (works for any message length)
  const phone = extractPhone(normalized);
  if (phone) {
    const validated = validatePhone(phone);
    details.phone = validated.valid ? validated.phone : phone;
  }

  const city = extractCity(normalized);
  if (city) details.city = city;

  // --- INLINE KEYWORD EXTRACTION (single-line messages) ---
  // Handles: "Name ayan flat nomber 230 maria appartmint bloc one gate nom 2 nagan chorangi"
  const inlineKeywords = /\b(name|naam)\s+/i.test(msg) || /\b(flat|house|ghar|makan|villa|apt|unit)\s*(no|nomber|number|nmbr|#)?\s*\d/i.test(msg) ||
    /\b(block|bloc|blk)\s+\S/i.test(msg) || /\b(street|gali|galli)\s*\d/i.test(msg);
  if (lines.length < 2 && inlineKeywords) {
    const l = msg.toLowerCase();
    // Extract name: "name X" or "naam X" — words after keyword until address keyword
    const addrKeywords = /^(flat|house|ghar|gali|street|block|bloc|gate|near|mobile|phone|number|nomber|nmbr|city|area|address|plot|sector|mohalla|colony)\b/i;
    const nameMatch = msg.match(/\b(?:name|naam)\s+(.+)/i);
    if (nameMatch) {
      const afterName = nameMatch[1].trim().split(/\s+/);
      const nameWords = [];
      for (const w of afterName) {
        if (addrKeywords.test(w) || /^\d/.test(w)) break;
        nameWords.push(w);
      }
      if (nameWords.length > 0 && nameWords.length <= 3) {
        details.name = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
    }
    // Extract address from remaining text (everything except name and phone parts)
    // Build name removal pattern dynamically
    const nameRemoval = details.name ? new RegExp('\\b(?:name|naam)\\s+' + details.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /\b(?:name|naam)\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\b/i;
    let addrText = msg
      .replace(nameRemoval, '')  // remove name
      .replace(/(?:\+?92|0)3\d{2}[\s\-]?\d{7}/g, '')  // remove phone
      .replace(/\b(?:mobile|phone)\s*(?:no|nomber|number|nmbr)?\s*(?:ye|yeh|yahi)?\s*(?:he|hai|h)?\s*(?:hai|h)?\b/gi, '')  // remove "mobile nomber ye he hai"
      .trim();
    if (addrText.length > 5) {
      // Remove product/order keywords from address text
      addrText = addrText
        .replace(/\b(bhej\s*do|bhejdo|bhej\s*dein|send\s*kr|send\s*kro|order\s*kr|chahiye|chahea|chaeah|chaeh|manga|mangwa|mangao)\b/gi, '')
        .trim();
      // Remove product names (short names from PRODUCTS)
      for (const p of PRODUCTS) {
        if (p.short && addrText.toLowerCase().includes(p.short.toLowerCase())) {
          addrText = addrText.replace(new RegExp('\\b' + p.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '').trim();
        }
      }
      addrText = addrText.replace(/\s{2,}/g, ' ').trim();

      details.addressHint = addrText;
      // Parse structured address parts from inline text
      const addrParts = {};
      // Strip block/street/gali patterns before area extraction
      // "block c", "street 4" etc. are NOT areas — removing them prevents false matches
      const areaText = addrText
        .replace(/\b(?:bloc?k?|blk)\s+[A-Za-z0-9]+\b/i, '')
        .replace(/\b[A-Za-z]{2,}\s+(?:bloc?k?|blk)\b/i, '')
        .replace(/\b(?:street|gali|galli|st)\s*(?:no\.?\s*)?\d+\b/i, '')
        .replace(/\s{2,}/g, ' ').trim();
      // Extract area using extractArea (city-specific if city known)
      let detectedArea = extractArea(areaText, details.city);
      if (!detectedArea) detectedArea = extractArea(addrText, details.city); // fallback to full text
      // If no city and no area found, try fuzzy matching against top cities
      if (!detectedArea && !details.city) {
        const topCities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Peshawar', 'Multan', 'Hyderabad', 'Quetta', 'Gujranwala'];
        for (const tryCity of topCities) {
          const tryArea = matchArea(addrText, tryCity);
          if (tryArea) {
            detectedArea = tryArea;
            details.inferredCity = tryCity; // hint only — still ask customer
            break;
          }
        }
      }
      if (detectedArea) addrParts.area = detectedArea;

      // === BLOCK EXTRACTION (independent — supports strings: "Block C", "Ali Block", "Overseas Block") ===
      let blockValue = null;
      const numWords = { one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10' };
      // Forward: "block c", "block 5", "block ali", "block overseas", "bloc one"
      const blockFwd = addrText.match(/\b(?:bloc?k?|blk)\s+([A-Za-z]+|\d+)\b/i);
      if (blockFwd) {
        const raw = blockFwd[1].trim();
        blockValue = 'Block ' + (numWords[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
      }
      // Reverse: "ali block", "overseas block" (2+ letter name before block)
      if (!blockValue) {
        const blockRev = addrText.match(/\b([A-Za-z]{2,})\s+(?:bloc?k?|blk)\b/i);
        if (blockRev && !/\b(flat|house|near|qareeb|ke)\b/i.test(blockRev[1])) {
          blockValue = blockRev[1].charAt(0).toUpperCase() + blockRev[1].slice(1).toLowerCase() + ' Block';
        }
      }

      // === STREET/GALI EXTRACTION (independent — street = gali, same field) ===
      let streetValue = null;
      const streetGaliMatch = addrText.match(/\b(?:street|gali|galli|st)\s*(?:no\.?\s*)?(\d+)\b/i);
      if (streetGaliMatch) {
        const type = /\b(gali|galli)\b/i.test(streetGaliMatch[0]) ? 'Gali' : 'Street';
        streetValue = `${type} ${streetGaliMatch[1]}`;
      }

      // Combine block + street/gali into one street field
      if (blockValue || streetValue) {
        addrParts.street = [blockValue, streetValue].filter(Boolean).join(', ');
      }

      // === HOUSE EXTRACTION ===
      // A) With keyword prefix: "flat no 1", "house 5", "plot 22", "villa 892"
      const houseMatch = addrText.match(/\b(?:flat|house|ghar|makan|plot|villa|apt|unit)\s*(?:no|nomber|number|nmbr|#)?\s*\d+[A-Za-z]?\b/i);
      if (houseMatch) {
        const houseStart = addrText.indexOf(houseMatch[0]);
        let houseText = addrText.substring(houseStart);
        if (detectedArea) {
          const fuzzyArea = detectedArea.toLowerCase().split(' ')[0];
          const areaIdx = houseText.toLowerCase().indexOf(fuzzyArea);
          if (areaIdx > 0) houseText = houseText.substring(0, areaIdx).trim();
          else {
            const areaRe = new RegExp(detectedArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            houseText = houseText.replace(areaRe, '').trim();
          }
        }
        if (details.city) {
          const cityRe = new RegExp('\\b' + details.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          houseText = houseText.replace(cityRe, '').trim();
        }
        // Remove block/street text from house (already extracted above)
        if (blockValue) houseText = houseText.replace(/\b(?:bloc?k?|blk)\s+\S+/i, '').trim();
        if (streetValue) houseText = houseText.replace(/\b(?:street|gali|galli|st)\s*(?:no\.?\s*)?\d+/i, '').trim();
        houseText = houseText.replace(/\s{2,}/g, ' ').trim();
        if (houseText.length > 2) {
          addrParts.house = houseText;
        }
      }

      // B) Standalone letter-number house: "e 45", "E-45", "B/13", "R68"
      if (!addrParts.house) {
        const letterNum = addrText.match(/(?:^|[\s,])([A-Za-z])[\s\-\/](\d{1,4}[A-Za-z]?)\b/);
        if (letterNum) {
          const letter = letterNum[1].toUpperCase();
          const num = letterNum[2];
          // Exclude if same letter as block value (e.g., "c" from "block c")
          const blockLetter = blockValue ? blockValue.replace(/^block\s*/i, '').charAt(0).toUpperCase() : '';
          const isArea = detectedArea && (detectedArea.toUpperCase().replace(/[\s\-]/g, '') === (letter + num).toUpperCase());
          if (letter !== blockLetter && !isArea) {
            addrParts.house = letter + '-' + num;
          }
        }
      }

      // C) Digit-first house: "11A", "45B", "892" (standalone number+optional letter)
      // Only if preceded by space/start and not part of street/gali/block number
      if (!addrParts.house) {
        // Remove known patterns to avoid matching street/block numbers
        const houseSearchText = addrText
          .replace(/\b(?:bloc?k?|blk)\s+\S+/i, '')
          .replace(/\b(?:street|gali|galli|st)\s*(?:no\.?\s*)?\d+/i, '')
          .replace(/\b(?:flat|house|ghar|makan|plot|villa|apt|unit)\s*(?:no|nomber|number|nmbr|#)?\s*\d+[A-Za-z]?/i, '');
        const digitFirst = houseSearchText.match(/(?:^|[\s,])(\d{1,4}[A-Za-z])\b/);
        if (digitFirst) {
          addrParts.house = digitFirst[1].toUpperCase();
        }
      }

      // Apartment/building → no street needed
      if (!addrParts.street && /\b(appaa?rtm[ei]nt|apart[a-z]*|building|tower|plaza|residenc[a-z]*|heights|complex|mansion)\b/i.test(addrText)) {
        addrParts.street = 'nahi_pata';
      }
      if (Object.keys(addrParts).length > 0) {
        details.addressParts = addrParts;
      }
    }
    return details;
  }

  if (lines.length < 2) return details; // Not enough parts, skip

  // --- LABELED FORMAT DETECTION ---
  // Handles: "Name. Saba", "House no. Flat 1", "Gali nmbr. Gulshan colony", etc.
  const labelRegex = /^(name|naam|number|num|phone|mob|mobile|house\s*(?:no|number|nmbr)?|flat\s*(?:no)?|gali\s*(?:no|nmbr|number)?|street\s*(?:no|nmbr|number)?|city|shehar|shehr|area|mohalla|mohallah|colony|landmark|famous\s*(?:jaga|jagah)|tehsil|zilla|district|address)\s*[.:\-]\s*/i;
  const labeledCount = lines.filter(l => labelRegex.test(l)).length;

  if (labeledCount >= 2) {
    // Parse labeled key-value pairs
    const labeled = {};
    for (const line of lines) {
      const m = line.match(/^([A-Za-z\s]+?)\s*[.:\-]\s*(.+)$/);
      if (m) {
        labeled[m[1].trim().toLowerCase()] = m[2].trim();
      }
    }

    // Name
    const nameKey = Object.keys(labeled).find(k => /^(name|naam)$/i.test(k));
    if (nameKey && /^[A-Za-z\s]{2,50}$/.test(labeled[nameKey])) {
      details.name = labeled[nameKey];
    }

    // City: "city", "shehar", or "zilla/district" as fallback
    const cityKey = Object.keys(labeled).find(k => /^(city|shehar|shehr)$/i.test(k));
    if (cityKey) {
      details.city = extractCity(labeled[cityKey]) || labeled[cityKey];
    }
    if (!details.city) {
      const zillaKey = Object.keys(labeled).find(k => /^(zilla|district)$/i.test(k));
      if (zillaKey) details.city = extractCity(labeled[zillaKey]) || labeled[zillaKey];
    }

    // Structured address parts
    details.addressParts = {};

    const areaKey = Object.keys(labeled).find(k => /^(area|mohalla|mohallah)$/i.test(k));
    if (areaKey) details.addressParts.area = labeled[areaKey];

    const streetKey = Object.keys(labeled).find(k => /^(gali|street)\s*(no|nmbr|number)?$/i.test(k));
    if (streetKey) details.addressParts.street = labeled[streetKey];

    const houseKey = Object.keys(labeled).find(k => /^(house|flat)\s*(no|number|nmbr)?$/i.test(k));
    if (houseKey) details.addressParts.house = labeled[houseKey];

    const landmarkKey = Object.keys(labeled).find(k => /^(landmark|famous\s*(jaga|jagah))$/i.test(k));
    if (landmarkKey) details.addressParts.landmark = labeled[landmarkKey];

    // Tehsil & Zilla — important for village/gaon/chak deliveries
    const tehsilKey = Object.keys(labeled).find(k => /^tehsil$/i.test(k));
    if (tehsilKey) details.addressParts.tehsil = labeled[tehsilKey];

    const zillaKey = Object.keys(labeled).find(k => /^(zilla|district)$/i.test(k));
    if (zillaKey) details.addressParts.zilla = labeled[zillaKey];

    // If gali value contains colony/mohalla/town, use as area instead
    if (!details.addressParts.area && details.addressParts.street &&
        /\b(colony|mohalla|mohallah|town|scheme|nagar|society|housing)\b/i.test(details.addressParts.street)) {
      details.addressParts.area = details.addressParts.street;
      details.addressParts.street = null;
    }

    // Build address string from parts using buildAddressString (handles tehsil/zilla)
    const addrVals = Object.values(details.addressParts).filter(v => v);
    if (addrVals.length > 0) {
      details.address = addrVals.join(', ');
    }

    return details; // Labeled format fully parsed
  }

  const productLower = (productShort || '').toLowerCase();
  const addressParts = [];

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Skip phone line (contains phone digits or "phone num" label)
    if (phone && line.replace(/[\s\-\.]/g, '').includes(phone.replace(/[\s\-]/g, ''))) continue;
    if (/^phone\s*(num|number|no)?\.?\s*$/i.test(line)) continue;

    // Skip city-only line
    if (city && extractCity(line) && line.split(/\s+/).length <= 2) continue;

    // Product line — but check if it also contains name or address after removing product
    if (productLower && lineLower.includes(productLower)) {
      const remaining = line.replace(new RegExp(productShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
      if (remaining && !details.name && isLikelyName(remaining) && !hasAddressKeywords(remaining)) {
        details.name = remaining;
      } else if (remaining && remaining.length > 3 && hasAddressKeywords(remaining)) {
        addressParts.push(remaining);
      }
      continue;
    }

    // Name: alphabetic only, 1-3 words, no address keywords
    if (!details.name && isLikelyName(line) && !hasAddressKeywords(line)) {
      details.name = line.trim();
      continue;
    }

    // Everything else → address hint (not full address, needs proper collection)
    if (line.length > 1) addressParts.push(line);
  }

  if (addressParts.length > 0) {
    const addrText = addressParts.join(', ');
    const addrLower = addrText.toLowerCase();
    // Complete address = has house/gali/street detail OR multiple address keywords
    const hasHouse = /\b(house|ghar|makan|flat|plot|apartment)\s*(no\.?|number|nmbr|#)?\s*\d/i.test(addrText) || /^\d{1,4}[a-z]?\s*[,\s]/i.test(addrText);
    const hasStreet = /\b(gali|street|galli|st\b|lane)/i.test(addrText);
    const hasLandmark = /\b(near|nazd|samne|pass|qareeb|wali|wala|peeche|agay)\b/i.test(addrText);
    const detailCount = [hasHouse, hasStreet, hasLandmark].filter(Boolean).length;

    if (hasHouse || hasStreet || detailCount >= 2) {
      // Detailed enough — accept as complete address
      details.address = addrText;
    } else {
      // Just area/locality — save as hint for address collection flow
      details.addressHint = addrText;
    }
  }

  return details;
}

// ============= AUTO-TEMPLATE LEARNING =============
const STOP_WORDS = new Set([
  'hai','he','ho','hain','hen','ka','ki','ke','ko','me','mein','se','ye','yeh',
  'wo','woh','aur','or','to','bhi','na','kya','ap','aap','main','mera','meri',
  'mere','hum','tum','is','us','ek','ji','g','sir','bhai','the','a','an','in',
  'on','of','for','and','is','it','i','my','this','that','kr','kro','do','de'
]);

const AUTO_TEMPLATE_STATES = ['IDLE', 'GREETING', 'PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'HAGGLING'];

function extractKeywords(msg) {
  return msg.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w)).sort();
}

function keywordSimilarity(kw1, kw2) {
  const set1 = new Set(kw1);
  const set2 = new Set(kw2);
  const intersection = [...set1].filter(w => set2.has(w)).length;
  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

function matchAutoTemplate(msg, currentState, productId) {
  if (!AUTO_TEMPLATE_STATES.includes(currentState)) return null;
  try {
    const db = getDb();
    const keywords = extractKeywords(msg);
    if (keywords.length === 0) return null;

    const templates = db.prepare(
      'SELECT * FROM auto_templates WHERE state = ? AND (product_id = ? OR product_id IS NULL) AND times_seen >= 3 AND (is_active = 1 OR is_active IS NULL)'
    ).all(currentState, productId || null);

    let bestMatch = null, bestScore = 0;
    for (const tpl of templates) {
      const score = keywordSimilarity(keywords, JSON.parse(tpl.keywords));
      if (score > bestScore) { bestScore = score; bestMatch = tpl; }
    }

    if (bestMatch && bestScore >= 0.9) {
      db.prepare(
        "UPDATE auto_templates SET times_used = times_used + 1, last_used_at = datetime('now','localtime') WHERE id = ?"
      ).run(bestMatch.id);
      return bestMatch.response;
    }
    return null;
  } catch (e) {
    console.error('[AutoTemplate] Match error:', e.message);
    return null;
  }
}

function saveAutoPattern(msg, currentState, productId, response) {
  if (!AUTO_TEMPLATE_STATES.includes(currentState)) return;
  try {
    const db = getDb();
    const keywords = extractKeywords(msg);
    if (keywords.length === 0) return;

    const existing = db.prepare(
      'SELECT * FROM auto_templates WHERE state = ? AND (product_id = ? OR product_id IS NULL)'
    ).all(currentState, productId || null);

    for (const tpl of existing) {
      if (keywordSimilarity(keywords, JSON.parse(tpl.keywords)) >= 0.85) {
        db.prepare(
          "UPDATE auto_templates SET times_seen = times_seen + 1, response = ?, last_used_at = datetime('now','localtime') WHERE id = ?"
        ).run(response, tpl.id);
        return;
      }
    }

    db.prepare(
      'INSERT INTO auto_templates (state, product_id, keywords, response) VALUES (?, ?, ?, ?)'
    ).run(currentState, productId || null, JSON.stringify(keywords), response);
  } catch (e) {
    console.error('[AutoTemplate] Save error:', e.message);
  }
}

// ============= PHONE NORMALIZATION =============
function normalizePhone(phone) {
  if (!phone) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) digits = '0' + digits.slice(2);
  if (digits.startsWith('3') && digits.length === 10) digits = '0' + digits;
  return digits;
}

// ============= CONVERSATION STATE =============
const conversations = {};

function getOrCreateConv(phone) {
  if (!conversations[phone]) {
    // Try to restore state from DB (survives server restart / memory loss)
    let restored = false;
    try {
      const customer = customerModel.findByPhone(phone);
      if (customer) {
        const dbConv = conversationModel.findActive(customer.id);
        if (dbConv && dbConv.state && dbConv.state !== 'IDLE' && dbConv.collected_json) {
          const collected = JSON.parse(dbConv.collected_json || '{}');
          let product = null;
          try { product = dbConv.product_json ? JSON.parse(dbConv.product_json) : null; } catch (e) { /* ignore */ }
          let products = [];
          try { products = dbConv.products_json ? JSON.parse(dbConv.products_json) : []; } catch (e) { /* ignore */ }
          let upsellCandidates = [];
          try { upsellCandidates = dbConv.upsell_json ? JSON.parse(dbConv.upsell_json) : []; } catch (e) { /* ignore */ }

          // Restore recent messages from DB for AI context
          const recentMsgs = messageModel.getRecent(dbConv.id, 10) || [];
          const messages = recentMsgs.map(m => ({
            role: m.direction === 'incoming' ? 'user' : 'assistant',
            content: m.content || '',
          }));

          conversations[phone] = {
            current: dbConv.state,
            product,
            products,
            collected: {
              product: collected.product || null,
              name: collected.name || null,
              phone: collected.phone || null,
              delivery_phone: collected.delivery_phone || null,
              city: collected.city || null,
              address: collected.address || null,
              address_parts: collected.address_parts || { area: null, street: null, house: null, landmark: null },
            },
            address_step: null,
            address_confirming: false,
            haggle_round: dbConv.haggle_round || 0,
            discount_percent: dbConv.discount_percent || 0,
            upsell_candidates: upsellCandidates,
            unknown_count: dbConv.unknown_count || 0,
            messages,
            isReturning: true,
            // Restore rural flags from collected JSON (persisted)
            _is_rural: !!collected._is_rural,
            _rural_type: collected._rural_type || null,
            _rural_home_delivery: !!collected._rural_home_delivery,
          };
          restored = true;
          console.log(`[State] Restored from DB for ${phone}: state=${dbConv.state}, product=${product?.short || 'N/A'}, name=${collected.name || 'N/A'}`);
        }
      }
    } catch (e) {
      console.error('[State] DB restore error:', e.message);
    }

    if (!restored) {
      let prefill = null;
      try { prefill = getSmartFill(phone); } catch (e) { /* ignore */ }

      // Validate prefill name — reject sentence-like names ("Main same order", "I want product")
      let prefillName = prefill?.name || null;
      if (prefillName) {
        const nLower = prefillName.toLowerCase();
        const isSentence = /\b(main|mein|i\s+want|order|product|same|delivery|chahiye|chahti|chahta|karna|krna|send|bhejo)\b/i.test(nLower);
        const tooManyWords = prefillName.trim().split(/\s+/).length > 3;
        if (isSentence || tooManyWords) prefillName = null;
      }

      conversations[phone] = {
        current: 'IDLE',
        product: null,
        products: [],
        collected: {
          product: null,
          name: prefillName,
          phone: null,
          delivery_phone: null,
          city: prefill?.city || null,
          address: null,
          address_parts: { area: null, street: null, house: null, landmark: null },
        },
        address_step: null,
        address_confirming: false,
        haggle_round: 0,
        discount_percent: 0,
        upsell_candidates: [],
        unknown_count: 0,
        messages: [],
        isReturning: !!prefill,
        _prefill_city: prefill?.city || null,
      };
    }
  }
  return conversations[phone];
}

function resetConv(phone) {
  delete conversations[phone];
  return getOrCreateConv(phone);
}

// Hard clear — no smartfill, no DB restore. Used when admin deletes a chat.
function clearConv(phone) {
  const p = normalizePhone(phone);
  delete conversations[p];
}

// ============= DB WRITE-THROUGH =============
function dbSave(fn) {
  try { fn(); } catch (e) { console.error('[DB Write-through]', e.message); }
}

// Module-level media cost — set per handleMessage call, consumed on first saveMessages
let _pendingMediaCost = null;
let _pendingWaMessageId = null;

function saveMessages(dbConv, message, reply, intent, source, state, extra = {}) {
  if (!dbConv) return;
  dbSave(() => {
    // Save incoming message — include media cost + WA message ID if present
    const incomingExtra = { intent, source };
    if (_pendingWaMessageId) {
      incomingExtra.wa_message_id = _pendingWaMessageId;
      _pendingWaMessageId = null; // Consume
    }
    if (_pendingMediaCost) {
      incomingExtra.debug_json = JSON.stringify({
        _media_type: _pendingMediaCost.type,
        _media_model: _pendingMediaCost.model,
        _media_cost_rs: _pendingMediaCost.cost_rs,
        _media_response_ms: _pendingMediaCost.response_ms,
      });
      incomingExtra.tokens_in = _pendingMediaCost.tokens_in || 0;
      incomingExtra.tokens_out = _pendingMediaCost.tokens_out || 0;
      incomingExtra.response_ms = _pendingMediaCost.response_ms || 0;
      _pendingMediaCost = null; // Consume — only first saveMessages gets it
    }
    messageModel.create(dbConv.id, 'incoming', 'customer', message, incomingExtra);
    // Mark chat as unread for admin
    conversationModel.setAdminUnread(dbConv.id, true);
    if (reply) {
      // Inject model + cost into debug_json for accurate historical tracking
      let debugData = extra.debug ? (typeof extra.debug === 'string' ? JSON.parse(extra.debug) : { ...extra.debug }) : {};
      if (extra.tokens_in) {
        debugData._model = AI_MODEL_NAME;
        debugData._cost_rs = ((extra.tokens_in || 0) * AI_PRICING.input + (extra.tokens_out || 0) * AI_PRICING.output) / 1000000 * 300;
      }
      messageModel.create(dbConv.id, 'outgoing', 'bot', reply, {
        source,
        tokens_in: extra.tokens_in || 0,
        tokens_out: extra.tokens_out || 0,
        response_ms: extra.response_ms || 0,
        debug_json: Object.keys(debugData).length > 0 ? JSON.stringify(debugData) : null,
      });
    }
    conversationModel.updateLastMessage(dbConv.id, reply || message);
    if (extra.tokens_in) conversationModel.addTokens(dbConv.id, extra.tokens_in, extra.tokens_out || 0);
    if (extra.needs_human) conversationModel.setNeedsHuman(dbConv.id, true);
  });
}

function saveState(dbConv, state) {
  if (!dbConv) return;
  dbSave(() => {
    conversationModel.updateState(dbConv.id, state.current,
      state.product ? JSON.stringify(state.product) : null,
      JSON.stringify(state.products),
      JSON.stringify(state.collected),
      state.haggle_round, state.discount_percent,
      JSON.stringify(state.upsell_candidates),
      state.unknown_count
    );
  });
}

function saveCustomer(dbCustomer, state) {
  if (!dbCustomer) return;
  dbSave(() => {
    if (state.collected.name) customerModel.update(dbCustomer.id, { name: state.collected.name });
    if (state.collected.city) customerModel.update(dbCustomer.id, { city: state.collected.city });
  });
}

// ============= VALID STATE TRANSITIONS =============
const VALID_TRANSITIONS = {
  'IDLE': ['GREETING', 'PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'COLLECT_NAME', 'HAGGLING'],
  'GREETING': ['GREETING', 'PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'COLLECT_NAME', 'HAGGLING'],
  'PRODUCT_INQUIRY': ['PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'COLLECT_NAME', 'HAGGLING', 'GREETING'],
  'PRODUCT_SELECTION': ['PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'COLLECT_NAME'],
  'COLLECT_NAME': ['COLLECT_NAME', 'COLLECT_PHONE'],
  'COLLECT_PHONE': ['COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE', 'COLLECT_NAME'],
  'COLLECT_DELIVERY_PHONE': ['COLLECT_DELIVERY_PHONE', 'COLLECT_CITY', 'COLLECT_ADDRESS'],
  'COLLECT_CITY': ['COLLECT_CITY', 'COLLECT_ADDRESS', 'CONFIRM_RURAL_CITY'],
  'CONFIRM_RURAL_CITY': ['CONFIRM_RURAL_CITY', 'COLLECT_CITY', 'COLLECT_ADDRESS'],
  'COLLECT_ADDRESS': ['COLLECT_ADDRESS', 'COLLECT_CITY'], // AI stays here, code decides when complete; city change allowed
  'HAGGLING': ['HAGGLING', 'COLLECT_NAME', 'IDLE'],
};

// States AI can NEVER set
const FORBIDDEN_AI_STATES = ['ORDER_SUMMARY', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED', 'CANCEL_AFTER_CONFIRM'];

// Template-only states — handled by state machine, no AI needed
const TEMPLATE_STATES = ['ORDER_SUMMARY', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED', 'CANCEL_AFTER_CONFIRM', 'COMPLAINT', 'CONFIRM_RURAL_CITY'];

// ============= INTENT → STATE MAPPING =============
function intentToNextState(intent, currentState, extracted, state) {
  switch (intent) {
    case 'greeting':
      return 'GREETING';
    case 'product_inquiry':
      if (extracted?.product || extracted?.product_name) return 'PRODUCT_INQUIRY';
      return currentState;
    case 'product_with_order':
      if (extracted?.product || extracted?.product_name) return 'COLLECT_NAME';
      return currentState;
    case 'order_intent':
      // If product was extracted from the message, set it on state
      if (!state?.product && (extracted?.product || extracted?.product_name)) {
        const { PRODUCTS } = require('./data');
        const pMatch = PRODUCTS.find(p => p.short === extracted.product || p.name === extracted.product_name);
        if (pMatch) {
          state.product = pMatch;
          state.collected.product = pMatch.short;
        }
      }
      // If city was extracted, set it
      if (!state?.collected?.city && extracted?.city) {
        state.collected.city = extracted.city;
      }
      if (state?.product) return 'COLLECT_NAME';
      return 'PRODUCT_SELECTION';
    case 'product_list':
      return 'PRODUCT_SELECTION';
    case 'price_ask':
      return 'PRODUCT_SELECTION';
    case 'haggle':
      return 'HAGGLING';
    case 'yes':
      if (currentState === 'PRODUCT_INQUIRY' && state?.product) return 'COLLECT_NAME';
      return currentState;
    case 'name_given':
      if (extracted?.name) return 'COLLECT_PHONE';
      return currentState;
    case 'phone_given':
      return 'COLLECT_DELIVERY_PHONE';
    case 'city_given':
      return 'COLLECT_ADDRESS';
    case 'address_info':
      return 'COLLECT_ADDRESS';
    case 'no':
      if (currentState === 'PRODUCT_INQUIRY') return 'GREETING';
      if (currentState === 'HAGGLING') return 'IDLE';
      return currentState;
    case 'complaint':
      return 'COMPLAINT';
    default:
      return currentState;
  }
}

// ============= MAIN HANDLER =============
async function handleMessage(message, phone, storeName, apiKey, options = {}) {
  const startTime = Date.now();

  // Set pending media cost + WA message ID for saveMessages to pick up
  _pendingMediaCost = options.mediaCost || null;
  _pendingWaMessageId = options.wa_message_id || null;

  // Guard: non-text messages (image, voice, sticker, location, contact) → polite reply
  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      reply: 'Ji, sirf text messages samajh aata hai. Apna sawal likh ke bhejein.',
      state: 'UNKNOWN', collected: {}, needs_human: false, source: 'guard',
      intent: 'non_text', tokens_in: 0, tokens_out: 0, response_ms: 0,
    };
  }

  phone = normalizePhone(phone);
  const state = getOrCreateConv(phone);

  // Gender detection from feminine verb forms (any message)
  if (!state.gender) {
    const lm = message.toLowerCase();
    const isFeminine = /\b(btao\s*gi|batao\s*gi|krlun\s*gi|karun\s*gi|deti\s*h[ou]n|lun\s*gi|dalon\s*gi|bhejun\s*gi|krun\s*gi|karti\s*h[ou]n|krti\s*h[ou]n)\b/i.test(lm) ||
      /\b(m[ei]\s*nahi\s*btao\s*gi|meri\s*taraf)\b/i.test(lm);
    if (isFeminine) state.gender = 'female';
  }

  // DB setup
  let dbCustomer = null, dbConv = null;
  dbSave(() => {
    dbCustomer = customerModel.findOrCreate(phone);
    dbConv = conversationModel.getOrCreateActive(dbCustomer.id, storeName);
    // Attach DB IDs to state so confirmOrder can use them
    if (dbConv) state._db_conversation_id = dbConv.id;
    if (dbCustomer) state._db_customer_id = dbCustomer.id;
  });

  // ============================================
  // PATH 0: COMPLAINT INTERCEPT — runs BEFORE template states
  // Customer saying "complain" should ALWAYS be caught, even in ORDER_SUMMARY/UPSELL/ORDER_CONFIRMED
  // ============================================
  {
    const cl = message.toLowerCase().trim();
    if (isComplaint(cl) && !(/\b(to\s*nahi|toh?\s*nahi|nahi\s*ho|nhi\s*ho|hogi|hoga|jayega|jayegi)\b/i.test(cl))) {
      // Strong complaint (not a quality question like "kharab to nahi hogi?")
      const vars = buildVars(state, storeName);
      state.current = 'COMPLAINT';
      const reply = qualityGate(fillTemplate('COMPLAINT', vars));
      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: reply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);
      saveMessages(dbConv, message, reply, 'template', 'template', state, {
        needs_human: true,
        debug: { path: 'PATH0_COMPLAINT_INTERCEPT', state_before: state.current, state_after: 'COMPLAINT', detected_intent: 'complaint', collected: { ...state.collected } },
      });
      // Set complaint flag on conversation
      if (dbConv) {
        const db = require('../db').getDb();
        db.prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1 WHERE id = ?').run(dbConv.id);
      }
      saveState(dbConv, state);
      saveCustomer(dbCustomer, state);
      return {
        reply,
        state: 'COMPLAINT',
        collected: { ...state.collected },
        needs_human: true,
        source: 'template',
        intent: 'complaint',
        tokens_in: 0, tokens_out: 0,
        response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
  }

  // ============================================
  // PATH 1: Template-only states (zero AI cost)
  // ============================================
  if (TEMPLATE_STATES.includes(state.current)) {
    // Pre-detect yes/no flexibly for template states
    const l = message.toLowerCase().trim();
    const preYes = /\b(ha+n|ji|yes|yup|sahi|bilkul|confirm|ik|ok|done|theek|thik|thk|tik|zaroor|kr\s*do|kardo|krdo|kar\s*do|hn|hm+)\b/i.test(l);
    const preNo = /\b(nahi|nhi|no|galat|nope|na+h|mat|cancel|rehne\s*do)\b/i.test(l);
    // "kuch nahi sab sahi" = yes (nahi negates change, not order)
    const negatedNo = /\b(kuch\s*nahi|koi\s*nahi|nahi\s*kuch|change\s*nahi|nahi\s*change)\b/i.test(l) && /\b(sahi|theek|thik|done|ok|confirm|bilkul)\b/i.test(l);
    const preIntent = negatedNo ? 'yes' : (preYes && !preNo) ? 'yes' : (preNo && !preYes) ? 'no' : null;
    const tmplResult = handleTemplateState(message, state, storeName, preIntent);
    if (tmplResult) {
      state.current = tmplResult.state;
      if (state.product) state.collected.product = state.product.short;

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: tmplResult.reply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(tmplResult.reply);
      saveMessages(dbConv, message, reply, 'template', 'template', state, {
        needs_human: tmplResult.needs_human || false,
        debug: { path: 'PATH1_TEMPLATE_STATE', state_before: state.current, state_after: tmplResult.state, detected_intent: preIntent, template_used: tmplResult.template || null, collected: { ...state.collected } },
      });
      saveState(dbConv, state);
      saveCustomer(dbCustomer, state);

      return {
        reply,
        state: state.current,
        collected: { ...state.collected },
        needs_human: tmplResult.needs_human || false,
        source: 'template',
        intent: 'template',
        tokens_in: 0, tokens_out: 0,
        response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        _media: tmplResult._media || null,
        _media_batch: tmplResult._media_batch || null,
      };
    }
  }

  // ============================================
  // PATH 1.5: Address confirmation (yes/no check before AI call)
  // ============================================
  if (state.current === 'COLLECT_ADDRESS' && state.address_confirming) {
    const l = message.toLowerCase().trim();
    // Flexible yes: "haan", "haan sahi hai", "ji bilkul", "confirm", "yes", "jee", "je", "yess", "g"
    const flexYes = /\b(ha+n|ji+|je+|yes+|yup|shi|sahi|sa[ih]i?|bilkul|confirm|ik|ok+|done|theek|thik|thk|tik|hn|hm+|g+|acha|accha|achha|bhej\s*d[oae]|bhejd[oae]|bhejwa\s*d[oae]|bhijwa\s*d[oae]|kr\s*d[oae]|kard[oae]|krd[oae])\b/i.test(l) && !/\b(nahi|nhi|no|galat|nope|na+h)\b/i.test(l);
    const flexNo = /\b(nahi+|nhi*|nh|no+|galat|nope|na+h|mat|cancel)\b/i.test(l);

    if (flexYes) {
      state.address_confirming = false;
      const addrStr = buildAddressString(state.collected.address_parts);
      state.collected.address = state.collected.city ? addrStr + ', ' + state.collected.city : addrStr;
      // Add alt phone note in address if delivery_phone is a DIFFERENT number
      const dp = state.collected.delivery_phone;
      if (dp && dp !== 'same' && dp !== state.collected.phone) {
        state.collected.address += ` (agar call na lug rahi ho ya signal issue ho to ${dp} pr bhi call krlena)`;
      }
      const smResult = buildOrderSummary(state, storeName);
      state.current = smResult.state;

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: smResult.reply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(smResult.reply);
      saveMessages(dbConv, message, reply, 'yes', 'template', state);
      saveState(dbConv, state);

      return {
        reply, state: state.current, collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'yes',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
    if (flexNo) {
      state.address_confirming = false;
      state.collected.address_parts = { area: null, street: null, house: null, landmark: null };
      state.address_step = 'area';
      const reaskReply = fillTemplate('ASK_ADDRESS_AREA', {
        city: state.collected.city || '', honorific: getHonorific(state.collected.name, state.gender), name: state.collected.name || '',
        area_suggestions: getAreaSuggestions(state.collected.city) || ''
      });

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: reaskReply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(reaskReply);
      saveMessages(dbConv, message, reply, 'no', 'template', state);
      saveState(dbConv, state);

      return {
        reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'no',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
    // Not yes/no → correction, fall through to AI
    state.address_confirming = false;
  }

  // ============================================
  // PATH 1.56: Rural "ghar pe" home delivery — switch to full address collection
  // When rural customer says "ghar pe bhej do" instead of TCS/post office,
  // collect full detailed address (house, street, area) + tehsil + zilla
  // ============================================
  if (state.current === 'COLLECT_ADDRESS' && state._is_rural && !state._rural_home_delivery && !state.address_confirming) {
    const isGharPe = /\b(ghar|home|ghr)\s*(pe|par|pr|p|tk|tak|mein|mai|me|ko)\b/i.test(message) ||
      /\b(ghar|home|ghr)\s*(delivery|deliver|bhej|bhijwa|pohcha|pohncha)\b/i.test(message) ||
      /\b(deliver|bhej|bhijwa|pohcha)\s*(ghar|home|ghr)\b/i.test(message) ||
      /\bhome\s*delivery\b/i.test(message) ||
      /\bghar\s*(tk|tak|pe|par)\s*(aa|a|bhej|deliver|pohch|ana|aana)\b/i.test(message);
    if (isGharPe) {
      state._rural_home_delivery = true; state.collected._rural_home_delivery = true;
      // Keep area, clear landmark (was expecting TCS/post office), collect full address
      state.collected.address_parts.landmark = null;
      state.collected.address_parts.street = null;
      state.collected.address_parts.house = null;
      // Ask for street/gali
      const vars = buildVars(state, storeName);
      vars.area = state.collected.address_parts.area || '';
      const nextAsk = fillTemplate('ASK_ADDRESS_STREET', vars);

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: nextAsk });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(nextAsk);
      saveMessages(dbConv, message, reply, 'rural_home_delivery', 'template', state, {});
      saveState(dbConv, state);

      return {
        reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'rural_home_delivery',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
  }

  // ============================================
  // PATH 1.57: Rural delivery point / generic place — handle without AI
  // A) Known delivery points (dak khana, TCS, post office) → accept directly
  // B) Generic place names (chowk, bazaar, masjid) → ask for specific name via template
  // ============================================
  if (state.current === 'COLLECT_ADDRESS' && state._is_rural && !state.address_confirming && !state.collected.address_parts.landmark) {
    const l = message.toLowerCase().trim();
    // A) Known delivery points — accept directly
    const dpMatch = message.match(/\b(dak\s*khana|dakkhana|post\s*office|tcs|tcs\s*office|leopards?|leopard\s*courier|call\s*courier|m&p|mnp)\b/i);
    // B) Generic place names — ask for specific name
    const genericMatch = message.match(/\b(chowk|chouk|chok|bazaar|bazar|market|masjid|mosque|school|college|hospital|clinic|park|naka|bus\s*stop|adda|stop|bakery|dukaan|dukan|shop|hotel|company|factory|firm|office|godown|kiryana|karyana|petrol\s*pump|pump)\b/i);

    if (dpMatch) {
      // Capitalize delivery point name
      const dpName = dpMatch[1].replace(/\b[a-z]/g, c => c.toUpperCase());
      state.collected.address_parts.landmark = dpName;

      // Check if zilla is needed
      const ap = state.collected.address_parts;
      const hasZilla = !!ap.zilla;
      const vars = buildVars(state, storeName);
      const nextAsk = hasZilla ? null : fillTemplate('ASK_ZILLA', vars);

      if (nextAsk) {
        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: nextAsk });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);

        const reply = qualityGate(nextAsk);
        saveMessages(dbConv, message, reply, 'delivery_point', 'template', state, {});
        saveState(dbConv, state);

        return {
          reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
          needs_human: false, source: 'template', intent: 'delivery_point',
          tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }
      // Zilla already collected → address complete, fall through to completeness check
    } else if (genericMatch && !dpMatch) {
      // Generic place name — ask for specific name via template (no AI)
      const placeName = genericMatch[1].charAt(0).toUpperCase() + genericMatch[1].slice(1).toLowerCase();
      state._generic_landmark = placeName;
      state._asked_nearby_ref = false; // reset for potential follow-up
      const honorific = getHonorific(state.collected.name, state.gender);
      const askName = `${honorific}, konsa ${placeName.toLowerCase()}? Naam bata dein taake rider ko aasani ho.`;

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: askName });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(askName);
      saveMessages(dbConv, message, reply, 'generic_landmark', 'template', state, {});
      saveState(dbConv, state);

      return {
        reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'generic_landmark',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
  }

  // ============================================
  // PATH 1.58: Rural generic landmark name response
  // When we asked "konsa chowk/masjid?" and customer gives the name → accept as landmark
  // ============================================
  if (state.current === 'COLLECT_ADDRESS' && state._is_rural && !state.address_confirming && !state.collected.address_parts.landmark && state._generic_landmark) {
    const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1]?.content || '' : '';
    const askedGenericName = /kon(sa|si)\s/i.test(lastMsg) || /naam\s*bata/i.test(lastMsg);
    if (askedGenericName && message.trim().length >= 2) {
      const nameText = message.trim();
      // Not a refusal
      const isRefusal = /^(nahi?|nhi|no|nope|ni|nai|koi\s*nahi|kuch\s*nahi|nothing|none)(\s*(he|hai|h|pata|maloom|pta))?$/i.test(nameText);
      if (!isRefusal) {
        // Combine: "Faisal Chowk" or just use what customer said
        const genericType = state._generic_landmark.toLowerCase();
        const hasType = new RegExp(`\\b${genericType}\\b`, 'i').test(nameText);
        const landmark = hasType ? nameText : `${nameText} ${state._generic_landmark}`;
        state.collected.address_parts.landmark = landmark.replace(/\b[a-z]/g, c => c.toUpperCase());
        delete state._generic_landmark;

        // Ask zilla if needed
        const ap = state.collected.address_parts;
        const hasZilla = !!ap.zilla;
        const vars = buildVars(state, storeName);
        const nextAsk = hasZilla ? null : fillTemplate('ASK_ZILLA', vars);

        if (nextAsk) {
          state.messages.push({ role: 'user', content: message });
          state.messages.push({ role: 'assistant', content: nextAsk });
          if (state.messages.length > 10) state.messages = state.messages.slice(-10);

          const reply = qualityGate(nextAsk);
          saveMessages(dbConv, message, reply, 'landmark_name', 'template', state, {});
          saveState(dbConv, state);

          return {
            reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
            needs_human: false, source: 'template', intent: 'landmark_name',
            tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
            db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
          };
        }
        // Zilla already collected → fall through to completeness check
      }
    }
  }

  // ============================================
  // PATH 1.59: COLLECT_ADDRESS — Late rural detection
  // When customer says "gaon hai" / "village hai" / "house number nahi hote" mid-address
  // Switch to rural mode even if not detected earlier
  // ============================================
  if (state.current === 'COLLECT_ADDRESS' && !state._is_rural && !state.address_confirming) {
    const ll = message.toLowerCase().trim();
    const isGaonDeclaration = /\b(gaon|gao|village|dehat)\s*(hai|he|h|mein|me|mai)\b/i.test(ll) ||
      /\bye\s*(gaon|gao|village|dehat)\s*(hai|he|h)\b/i.test(ll) ||
      /\b(house\s*no|house\s*number|ghar\s*ka\s*number|flat)\s*(nahi|nhi|ni|nai)\s*(hota|hote|hoti|hai|he|milta|milte)\b/i.test(ll) ||
      /\b(number|no)\s*(nahi|nhi|ni)\s*(hot[aei]|hai|he|hain|milta|milte)\b/i.test(ll) ||
      /\b(yaha|yahan|idhar)\s*(ye|yeh)?\s*(nahi|nhi|ni)\s*(hot[aei]|hain|milta)\b/i.test(ll);
    if (isGaonDeclaration) {
      state._is_rural = true; state.collected._is_rural = true;
      // Clear urban-style fields, keep area
      state.collected.address_parts.street = null;
      state.collected.address_parts.house = null;
      // Ask for delivery point (TCS/post office/mashoor jagah)
      const ruralVars = buildVars(state, storeName);
      const nextAsk = fillTemplate('ASK_RURAL_DELIVERY_POINT', ruralVars);
      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: nextAsk });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);
      const reply = qualityGate(nextAsk);
      saveMessages(dbConv, message, reply, 'late_rural_detect', 'template', state, {});
      saveState(dbConv, state);
      return {
        reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'late_rural_detect',
        tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }
  }

  // ============================================
  // PATH 1.6: COLLECT_ADDRESS — "no/nahi" refusal for sub-fields
  // When customer says "no" to a sub-question (landmark, house, street),
  // handle it here instead of sending to AI (which may hallucinate)
  // ============================================
  // PATH 1.55: COLLECT_ADDRESS — Zilla answer (rural only)
  // When we asked ASK_ZILLA and customer replies, save it as zilla
  if (state.current === 'COLLECT_ADDRESS' && !state.address_confirming && state._is_rural && !state.collected.address_parts.zilla) {
    const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1]?.content || '' : '';
    const askedZilla = /zill[ae]|district/i.test(lastMsg);
    if (askedZilla && message.trim().length >= 2) {
      const zillaText = message.trim().replace(/^\s*(zilla|zila|district)\s+/i, '').replace(/\s*(zilla|zila|district|ka|ki|ke|mein|mai|me|se)\s*$/i, '').trim();
      if (zillaText.length >= 2) {
        state.collected.address_parts.zilla = zillaText.charAt(0).toUpperCase() + zillaText.slice(1).toLowerCase();
      }
    }
  }

  if (state.current === 'COLLECT_ADDRESS' && !state.address_confirming) {
    const isNo = /^(no|nahi?|nhi|nope|ni|nai)$/i.test(message.trim()) ||
                 /^(nahi?|nhi|ni|nai)\s*(he|hai|h|pata|maloom|malom|pta)$/i.test(message.trim()) ||
                 /^(koi\s*nahi|kuch\s*nahi|nothing|none)$/i.test(message.trim());
    if (isNo) {
      const ap = state.collected.address_parts;
      const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1]?.content || '' : '';
      const askedLandmark = /mashoor|landmark|famous|qareeb|nearby|jaga/i.test(lastMsg);
      const askedHouse = /house|flat|makan|ghar\b|plot\b|ghar\s*[\/,]\s*plot|ghar\s*ka\s*number|flat\s*no|plot\s*no/i.test(lastMsg);
      const askedStreet = /street|gali|road/i.test(lastMsg);
      // Also detect AI asking "konsa chowk/masjid?" — landmark name question
      const askedLandmarkName = /kon(sa|si)\s*(chowk|masjid|bazaar|market|school|dukaan|store)/i.test(lastMsg) ||
        /naam\s*bata/i.test(lastMsg);

      // Rural: if customer can't name the chowk/place, ask for nearby reference instead
      if (state._is_rural && !state._asked_nearby_ref && (askedLandmark || askedLandmarkName || (!askedHouse && !askedStreet && ap.area && !ap.landmark))) {
        state._asked_nearby_ref = true;
        const genericPlace = state._generic_landmark || 'wahan';
        const vars = buildVars(state, storeName);
        vars.generic_place = genericPlace;
        const nearbyAsk = fillTemplate('ASK_RURAL_NEARBY_REFERENCE', vars);

        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: nearbyAsk });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);

        const reply = qualityGate(nearbyAsk);
        saveMessages(dbConv, message, reply, 'no-refusal', 'template', state, {});
        saveState(dbConv, state);

        return {
          reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
          needs_human: false, source: 'template', intent: 'no-refusal',
          tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }

      if (askedLandmark || askedLandmarkName) {
        ap.landmark = 'nahi_pata';
      } else if (askedHouse) {
        ap.house = 'nahi_pata';
      } else if (askedStreet) {
        ap.street = 'nahi_pata';
      } else {
        // Can't determine what was asked — set based on what's missing
        if (ap.area && !ap.landmark) ap.landmark = 'nahi_pata';
        else if (ap.area && !ap.house) ap.house = 'nahi_pata';
        else if (ap.area && !ap.street) ap.street = 'nahi_pata';
      }

      // Check address completeness
      const hasArea = !!ap.area;
      const hasHouse = ap.house && ap.house !== 'nahi_pata';
      const houseUnknown = ap.house === 'nahi_pata';
      const hasLandmark = !!ap.landmark;
      const isRural = !!state._is_rural || !!state.collected?._is_rural;
      const isRuralHome = !!state._rural_home_delivery || !!state.collected?._rural_home_delivery;
      const hasZilla = !!ap.zilla;
      // Rural home delivery = full address + zilla (like urban but with zilla)
      // Rural TCS = area + landmark(delivery point) + zilla
      // Urban = area + house + landmark
      const addrComplete = isRural
        ? (isRuralHome
          ? (hasArea && (hasHouse || houseUnknown) && hasLandmark && hasZilla)
          : (hasArea && hasLandmark && hasZilla))
        : (hasArea && (hasHouse || houseUnknown) && hasLandmark);

      if (addrComplete) {
        // Address complete → confirm
        state.address_confirming = true;
        const fullAddrParts = buildAddressString(ap);
        const cityLabel = state.collected.city || '';
        const fullAddr = cityLabel ? fullAddrParts + ', ' + cityLabel : fullAddrParts;
        const honorific = getHonorific(state.collected.name, state.gender);
        const confirmReply = fillTemplate('CONFIRM_ADDRESS', {
          full_address: fullAddr, honorific, name: state.collected.name || ''
        });

        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: confirmReply });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);

        const reply = qualityGate(confirmReply);
        saveMessages(dbConv, message, reply, 'no-refusal', 'template', state, {});
        saveState(dbConv, state);

        return {
          reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
          needs_human: false, source: 'template', intent: 'no-refusal',
          tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      } else {
        // Ask next missing part
        const vars = buildVars(state, storeName);
        let nextAsk;
        if (!hasArea) nextAsk = fillTemplate('ASK_ADDRESS_AREA', vars);
        else if (!ap.street && (!isRural || isRuralHome)) nextAsk = fillTemplate('ASK_ADDRESS_STREET', vars);
        else if (!ap.house && (!isRural || isRuralHome)) nextAsk = fillTemplate('ASK_ADDRESS_HOUSE', vars);
        else if (!hasLandmark) nextAsk = (isRural && !isRuralHome) ? fillTemplate('ASK_RURAL_DELIVERY_POINT', vars) : fillTemplate('ASK_ADDRESS_LANDMARK', vars);
        else if (isRural && !hasZilla) nextAsk = fillTemplate('ASK_ZILLA', vars);

        if (nextAsk) {
          state.messages.push({ role: 'user', content: message });
          state.messages.push({ role: 'assistant', content: nextAsk });
          if (state.messages.length > 10) state.messages = state.messages.slice(-10);

          const reply = qualityGate(nextAsk);
          saveMessages(dbConv, message, reply, 'no-refusal', 'template', state, {});
          saveState(dbConv, state);

          return {
            reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
            needs_human: false, source: 'template', intent: 'no-refusal',
            tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
            db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
          };
        }
      }
    }
  }

  // ============================================
  // PATH 2: Pre-check (code handles perfectly)
  // ============================================
  const pre = preCheck(message, state.current, state.collected, state);
  if (pre) {
    const preResult = handlePreCheck(pre, message, state, storeName, phone);
    if (preResult) {
      // Spam — silently ignore, no response, no AI, no tokens
      if (preResult.skip) {
        saveMessages(dbConv, message, null, 'spam', 'pre-check', state, {});
        saveState(dbConv, state);
        if (dbConv?.id) conversationModel.setSpam(dbConv.id, true);
        return { reply: null, state: state.current, source: 'pre-check', intent: 'spam' };
      }

      state.current = preResult.state;
      if (state.product) state.collected.product = state.product.short;

      // Media request: reply may be null (media sent separately by webhook)
      if (preResult.reply) {
        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: preResult.reply });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);
      }

      const reply = preResult.reply ? qualityGate(preResult.reply) : null;
      const stateBefore = state.current;
      saveMessages(dbConv, message, reply || '(media sent)', pre.intent, 'pre-check', state, {
        needs_human: preResult.needs_human || false,
        debug: { path: 'PATH2_PRE_CHECK', intent: pre.intent, extracted: pre.extracted || null, state_before: stateBefore, state_after: preResult.state, collected: { ...state.collected } },
      });
      saveState(dbConv, state);
      saveCustomer(dbCustomer, state);

      return {
        reply,
        state: state.current,
        collected: { ...state.collected },
        needs_human: preResult.needs_human || false,
        source: 'pre-check',
        intent: pre.intent,
        tokens_in: 0, tokens_out: 0,
        response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        _media: preResult._media || null,
        _media_batch: preResult._media_batch || null,
      };
    }
  }

  // ============================================
  // PATH 2.5: Auto-template match (learned patterns, zero AI cost)
  // ============================================
  const autoReply = matchAutoTemplate(message, state.current, state.product?.id);
  if (autoReply) {
    state.messages.push({ role: 'user', content: message });
    state.messages.push({ role: 'assistant', content: autoReply });
    if (state.messages.length > 10) state.messages = state.messages.slice(-10);

    const reply = qualityGate(autoReply);
    saveMessages(dbConv, message, reply, 'auto-template', 'auto-template', state, {
      debug: { path: 'PATH2.5_AUTO_TEMPLATE', state: state.current, collected: { ...state.collected } },
    });
    saveState(dbConv, state);

    return {
      reply, state: state.current, collected: { ...state.collected },
      needs_human: false, source: 'auto-template', intent: 'auto-template',
      tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
      db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
    };
  }

  // ============================================
  // PATH 3: AI-powered response
  // ============================================

  // GUARD: AI cost limit — if conversation AI cost exceeds Rs.3, hand off to human
  if (dbConv) {
    try {
      const costRow = getDb().prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN debug_json IS NOT NULL THEN
            COALESCE(json_extract(debug_json, '$._cost_rs'), 0) + COALESCE(json_extract(debug_json, '$._media_cost_rs'), 0)
          ELSE 0 END
        ), 0) as total_cost
        FROM messages WHERE conversation_id = ?
      `).get(dbConv.id);
      const totalCost = costRow?.total_cost || 0;
      if (totalCost >= 3) {
        console.log(`[COST GUARD] Conversation ${dbConv.id} AI cost Rs.${totalCost.toFixed(2)} exceeds Rs.3 limit — switching to human`);
        conversationModel.setHumanOnly(dbConv.id, true);
        const costReply = `${getHonorific(state.collected.name, state.gender)}, hamara agent abhi aapse baat karega 🙏 Thori der mein reply milega.`;
        saveMessages(dbConv, message, costReply, 'cost_limit', 'guard', state, {
          needs_human: true,
          debug: { path: 'COST_LIMIT_GUARD', total_cost: totalCost, limit: 3 },
        });
        return {
          reply: costReply, state: state.current, collected: { ...state.collected },
          needs_human: true, source: 'guard', intent: 'cost_limit',
          tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }
    } catch (e) {
      console.error('[COST GUARD] Error checking AI cost:', e.message);
    }
  }

  if (!apiKey) {
    const fallback = 'Ji sir, order karna ho to bata dein. Ya koi aur product dekhna hai?';
    saveMessages(dbConv, message, fallback, 'unknown', 'fallback', state);
    return {
      reply: fallback, state: state.current, collected: { ...state.collected },
      needs_human: false, source: 'fallback', intent: 'unknown',
      tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
    };
  }

  try {
    const _stateBefore = state.current;
    const _collectedBefore = JSON.parse(JSON.stringify(state.collected));
    // Build state-specific mini-prompt
    const prompt = composePrompt(storeName, state.current, state.collected, state.product, {
      isReturning: state.isReturning,
      haggleRound: state.haggle_round,
      discountPercent: state.discount_percent,
      isRural: !!state._is_rural,
      isRuralHomeDelivery: !!state._rural_home_delivery,
      gender: state.gender,
    });

    // Send last 4 messages for context
    const recentMessages = state.messages.slice(-4);
    recentMessages.push({ role: 'user', content: message });

    const aiResult = await chat(apiKey, prompt, recentMessages);

    // Extract AI intent + data
    const aiIntent = aiResult.intent || aiResult.extracted?.intent || 'unknown';
    const extracted = aiResult.extracted || {};

    // Reset consecutive error counter on successful AI call
    state._error_count = 0;

    // --- Process AI extracted data ---

    // Product detection from AI
    if (extracted.product_name) {
      const match = PRODUCTS.find(p =>
        p.short.toLowerCase().includes(extracted.product_name.toLowerCase()) ||
        p.kw.some(k => extracted.product_name.toLowerCase().includes(k))
      );
      if (match && !state.product) state.product = match;
    }
    if (extracted.product) {
      state.product = extracted.product;
    }
    if (extracted.wants_order && state.product) {
      // Product + order intent — move to collection
    }

    // INFERENCE: If AI says product_with_order but didn't extract product,
    // scan previous bot messages for product suggestions (e.g. "Kya aap T9 Trimmer ka order dena chahte hain?")
    if (aiIntent === 'product_with_order' && !state.product && !extracted.product_name && !extracted.product) {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'assistant') {
          const botMsg = state.messages[i].content;
          const inferredProduct = PRODUCTS.find(p =>
            botMsg.includes(p.short) || botMsg.includes(p.name)
          );
          if (inferredProduct) {
            state.product = inferredProduct;
            state.collected.product = inferredProduct.short;
            console.log(`[AI] Inferred product "${inferredProduct.short}" from previous bot message`);
            break;
          }
        }
      }
    }

    // Name extraction — in COLLECT_NAME, PRODUCT_SELECTION (early info), or explicit "name X" in any state
    const hasExplicitName = /\b(name|naam|my\s*name|mera\s*naam)\s+/i.test(message);
    if (extracted.name && (state.current === 'COLLECT_NAME' || state.current === 'PRODUCT_SELECTION' || hasExplicitName)) {
      const name = extracted.name.trim();
      // Guard: don't store question fragments as name (e.g. "kya hai" from "tumhara naam kya hai")
      const isQuestionFragment = /^(kya|kia|what|kaun|kon|who|how|kaise|kitna|kitne)\b/i.test(name) ||
        /\b(hai|he|h|ho|hain)\s*[?]?\s*$/i.test(name);
      if (name.length >= 2 && name.length <= 50 && !isQuestionFragment) {
        state.collected.name = name;
      }
    }

    // Phone (AI might extract, code validates)
    // GUARD: Only accept AI-extracted phone if the message actually contains digits
    // AI sometimes hallucinates phone from context when customer only sent a name
    // EXCEPTION: If AI intent is explicitly phone_given, trust it (customer confirmed number from context)
    if (extracted.phone) {
      const msgDigits = message.replace(/\D/g, '');
      const aiSaysPhone = aiIntent === 'phone_given' || aiIntent === 'phone_confirmed';
      if (msgDigits.length >= 7 || aiSaysPhone) {
        const clean = extracted.phone.replace(/\D/g, '');
        const validation = validatePhone(clean);
        if (validation.valid) state.collected.phone = validation.phone;
      }
    }

    // AI says "use_wa_number" — customer wants to use WhatsApp number
    if (aiIntent === 'use_wa_number' && !state.collected.phone && phone) {
      let waPhone = phone;
      if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
      const validation = validatePhone(waPhone);
      if (validation.valid) {
        state.collected.phone = validation.phone;
        const nextField = askNextField(state, storeName);
        if (nextField) {
          nextField.reply = `Number mil gaya 👍 ` + nextField.reply;
          return returnTemplate(nextField, 'ai→use_wa');
        }
      }
    }

    // Delivery phone
    // AI intent "yes" in COLLECT_DELIVERY_PHONE = same phone (even if extracted.same_phone missing)
    if (extracted.same_phone || (state.current === 'COLLECT_DELIVERY_PHONE' && aiIntent === 'yes' && !extracted.delivery_phone)) {
      state.collected.delivery_phone = 'same'; // same as main
    }
    if (extracted.delivery_phone) {
      const validation = validatePhone(extracted.delivery_phone.replace(/\D/g, ''));
      if (validation.valid) state.collected.delivery_phone = validation.phone;
    }

    // City (AI might extract, code validates)
    if (extracted.city) {
      state.collected.city = extracted.city;
      // If rural part was stored from previous rural_no_city, mark as rural now
      if (state._rural_part) {
        state.collected.address_parts = state.collected.address_parts || { area: null, street: null, house: null, landmark: null };
        state.collected.address_parts.area = state._rural_part;
        state._is_rural = true; state.collected._is_rural = true;
        delete state._rural_part;
        delete state._rural_type;
      }
    }

    // --- SMART FILL: extract extra fields from combined messages ---
    // Customer may send name+phone+city+address all at once (even without product)
    // Works for multi-line AND single-line with inline keywords ("Name ayan flat nomber 230...")
    const msgLines = message.split(/\n/).filter(l => l.trim());
    const hasInlineKeywords = /\b(name|naam)\s+/i.test(message) || /\b(flat|house|ghar|makan|villa|apt|unit)\s*(no|nomber|number|nmbr|#)?\s*\d/i.test(message) ||
      /\b(block|bloc|blk)\s+\S/i.test(message) || /\b(street|gali|galli)\s*\d/i.test(message);
    const _smartFillDebug = { ran: false, trigger: null, raw_result: null, applied: {} };
    if (msgLines.length >= 2 || hasInlineKeywords) {
      _smartFillDebug.ran = true;
      _smartFillDebug.trigger = msgLines.length >= 2 ? 'multi_line' : 'inline_keywords';
      const smartDetails = extractDetailsFromMsg(message, state.product?.short);
      _smartFillDebug.raw_result = smartDetails;
      // Update name if: not set, OR message explicitly says "name X" / "naam X" (customer correcting/giving name)
      const explicitNameGiven = /\b(name|naam|my\s*name|mera\s*naam)\s+/i.test(message);
      if (smartDetails.name && (!state.collected.name || explicitNameGiven)) state.collected.name = smartDetails.name;
      if (smartDetails.phone && !state.collected.phone) state.collected.phone = smartDetails.phone;
      if (smartDetails.city && !state.collected.city) state.collected.city = smartDetails.city;
      // Labeled format: directly populate address_parts (area, street, house, landmark)
      if (smartDetails.addressParts) {
        const ap = state.collected.address_parts;
        if (smartDetails.addressParts.area && !ap.area) ap.area = smartDetails.addressParts.area;
        if (smartDetails.addressParts.street && !ap.street) ap.street = smartDetails.addressParts.street;
        if (smartDetails.addressParts.house && !ap.house) ap.house = smartDetails.addressParts.house;
        if (smartDetails.addressParts.landmark && !ap.landmark) ap.landmark = smartDetails.addressParts.landmark;
        if (smartDetails.addressParts.tehsil) ap.tehsil = smartDetails.addressParts.tehsil;
        if (smartDetails.addressParts.zilla) ap.zilla = smartDetails.addressParts.zilla;
      }
      // Non-labeled: save as addressHint for COLLECT_ADDRESS flow
      if (!smartDetails.addressParts && (smartDetails.address || smartDetails.addressHint) && !state.addressHint) {
        state.addressHint = smartDetails.address || smartDetails.addressHint;
      }
    }
    if (!state.collected.phone) {
      const rawPhone = extractPhone(message);
      if (rawPhone) {
        const validation = validatePhone(rawPhone);
        if (validation.valid) state.collected.phone = validation.phone;
      }
      // "yehi number hai" / "isi number se" / "mobile nomber ye he hai" / "yehi ha whatsapp wala" → use WhatsApp number
      if (!state.collected.phone) {
        const useThisNumber = /\b(yehi|yahi|yhi|isi|issi|same)\s*(number|no|nmbr|nomber)\b/i.test(message) ||
          /\b(number|nomber|nmbr|mobile)\s*(yehi|yahi|yhi|ye|yeh)\s*(he|hai|h)\b/i.test(message) ||
          /\bjis\s*(se|number|no)\s*(baat|msg|message|chat)\b/i.test(message) ||
          /\b(mobile|phone)\s*(nomber|number|nmbr)?\s*(ye|yeh|yehi|yahi)?\s*(he|hai|h)\s*(he|hai|h)?\b/i.test(message) ||
          /\b(yehi|yahi|yhi|ye|yeh)\s*(he|hai|ha|h)\s*(whatsapp|watsapp|whats\s*app)\s*(wala|vala|number|no)?\b/i.test(message) ||
          /\b(whatsapp|watsapp)\s*(wala|vala|number|no)?\s*(yehi|yahi|yhi|ye|yeh)?\s*(he|hai|ha|h)\b/i.test(message);
        if (useThisNumber && phone) {
          // phone param = customer's WhatsApp number (e.g. "923001234567")
          let waPhone = phone;
          if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
          const validation = validatePhone(waPhone);
          if (validation.valid) state.collected.phone = validation.phone;
        }
      }
    }
    if (!state.collected.city) {
      const allCities = extractAllCities(message);
      if (allCities.length === 1) {
        state.collected.city = allCities[0];
      } else if (allCities.length > 1) {
        // Multiple cities detected — flag for clarification
        state.collected._multipleCities = allCities;
      }
    }
    if (!state.collected.address_parts.area) {
      const rawArea = extractArea(message, state.collected.city);
      if (rawArea) state.collected.address_parts.area = rawArea;
    }
    // Full address extraction: when customer sends name + detailed address in one message
    // e.g. "Sardar Shaukat Sardar Builders, Office No. 1, Ground Floor, Plaza No. 99D, Spring North, Bahria Phase 7, Rawalpindi, Punjab"
    if (state.collected.name && state.collected.city && !state.collected.address && message.length > 40) {
      // Remove name from the beginning (could be anywhere in msg)
      let addrText = message;
      const nameWords = state.collected.name.split(/\s+/);
      for (const w of nameWords) {
        addrText = addrText.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '');
      }
      // Remove city + province
      addrText = addrText.replace(new RegExp('\\b' + state.collected.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '');
      addrText = addrText.replace(/\b(Punjab|Sindh|KPK|Khyber\s*Pakhtunkhwa|Balochistan|Islamabad)\b\.?/gi, '');
      // Remove phone numbers
      addrText = addrText.replace(/(?:\+?92|0)3\d{9}/g, '');
      // Clean up extra commas, dots, spaces
      addrText = addrText.replace(/^[\s,.\-]+/, '').replace(/[\s,.\-]+$/, '').replace(/\s*,\s*,+\s*/g, ', ').trim();
      // Check if remaining text has house/office number + area/phase (= complete address)
      const hasHouseNum = /\b(house|makan|ghar|flat|apartment|apt|office|plot|floor|ground\s*floor)\s*(no\.?|number|#)?\s*\d/i.test(addrText) ||
        /\b(no\.?|#)\s*\d+\s*[a-z]?\b/i.test(addrText) ||
        /\b\d+\s*-?\s*[a-z]\b/i.test(addrText.toLowerCase());
      const hasArea = /\b(phase|block|sector|colony|town|society|scheme|bahria|dha|gulberg|model|cantt|saddar|johar|north|south|east|west|spring)\b/i.test(addrText);
      if (hasHouseNum && hasArea && addrText.length > 15) {
        state.collected.address = addrText + ', ' + state.collected.city;
        // Also fill address_parts so COLLECT_ADDRESS is skipped
        state.collected.address_parts.area = addrText;
        state.collected.address_parts.street = 'nahi_pata';
        state.collected.address_parts.house = 'nahi_pata';
        state.collected.address_parts.landmark = 'nahi_pata';
      }
    }
    // Extract block/street/gali from any message (standalone — even without smart fill)
    if (!state.collected.address_parts.street) {
      const numWords = { one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10' };
      let bv = null;
      const bf = message.match(/\b(?:bloc?k?|blk)\s+([A-Za-z]+|\d+)\b/i);
      // Exclude Urdu words that follow "block" in negation/conversation: "block ya gharhi nahi hai"
      const BLOCK_EXCLUDE = /^(ya|hai|he|h|nahi|nhi|na|ka|ki|ke|ko|pe|par|pr|me|mein|ho|hota|wala|bhi|to|kya|koi|naya|purana|number|nahin)$/i;
      if (bf && !BLOCK_EXCLUDE.test(bf[1].trim())) bv = 'Block ' + (numWords[bf[1].trim().toLowerCase()] || bf[1].trim().charAt(0).toUpperCase() + bf[1].trim().slice(1).toLowerCase());
      if (!bv) {
        const br = message.match(/\b([A-Za-z]{2,})\s+(?:bloc?k?|blk)\b/i);
        if (br && !/\b(flat|house|near|qareeb|ke)\b/i.test(br[1])) bv = br[1].charAt(0).toUpperCase() + br[1].slice(1).toLowerCase() + ' Block';
      }
      let sv = null;
      const sg = message.match(/\b(?:street|gali|galli|st)\s*(?:no\.?\s*)?(\d+)\b/i);
      if (sg) sv = (/\b(gali|galli)\b/i.test(sg[0]) ? 'Gali' : 'Street') + ' ' + sg[1];
      if (bv || sv) state.collected.address_parts.street = [sv, bv].filter(Boolean).join(', ');
    }

    // --- SMART FILL SHORT-CIRCUIT ---
    // If customer sent name + other details in one message AND we have a product,
    // skip directly to next missing field instead of going to AI
    // BUT NOT when already in COLLECT_ADDRESS — customer is answering step-by-step questions
    if (state.product && state.collected.name && state.current !== 'COLLECT_ADDRESS' && (hasInlineKeywords || msgLines.length >= 2)) {
      // We got at least name from this message — check if we can skip ahead
      const nextField = askNextField(state, storeName);
      if (nextField) {
        // Don't call saveMessages here — returnTemplate already saves
        return returnTemplate(nextField, 'smart-fill');
      }
    }

    // Address parts — AI may put them in extracted.address_parts OR directly in extracted
    const addrParts = extracted.address_parts ||
      (state.current === 'COLLECT_ADDRESS' && (extracted.area || extracted.street || extracted.house || extracted.landmark)
        ? { area: extracted.area, street: extracted.street, house: extracted.house, landmark: extracted.landmark }
        : null);
    if (addrParts && state.current === 'COLLECT_ADDRESS') {
      const ap = state.collected.address_parts;
      const newParts = addrParts;
      // Filter out "MISSING" / null / empty / "nahi" — AI may echo prompt placeholders or customer refusals
      const valid = (v) => v && typeof v === 'string' && !['missing', 'null', 'undefined', 'none', 'n/a', '-', '—', '...', '..'].includes(v.toLowerCase().trim()) && v.trim() !== '' && !/^\.{2,}$/.test(v.trim());
      const isRefusal = (v) => v && /^(nahi?|nhi|no|none|nope)([_\s]*(he|hai|h|pata))?$/i.test(v.trim());
      if (valid(newParts.area) && !isRefusal(newParts.area)) {
        // Don't store a city name as area (AI sometimes extracts city typo as area)
        const areaAsCity = extractAllCities(newParts.area);
        if (areaAsCity.length > 0) {
          if (!state.collected.city) state.collected.city = areaAsCity[0];
          console.log(`[Address] AI area "${newParts.area}" is a city (${areaAsCity[0]}) — skipping as area`);
        } else {
          ap.area = newParts.area;
        }
      }
      if (valid(newParts.street) && !isRefusal(newParts.street)) {
        // If AI put a landmark-type word in street (hospital, masjid, school etc.), move to landmark
        const isLandmarkInStreet = /\b(hospital|hosptal|masjid|mosque|school|bank|petrol\s*pump|chowk|chorangi|park|market|bazaar|plaza|clinic|dispensary|library|church|mandir|gurdwara|dargah|factory|mill|company|office)\b/i.test(newParts.street);
        if (isLandmarkInStreet && !ap.landmark) {
          ap.landmark = newParts.street;
          console.log(`[Address] AI street "${newParts.street}" is a landmark — moved to landmark field`);
        } else if (!isLandmarkInStreet) {
          ap.street = newParts.street;
        }
      }
      if (valid(newParts.house)) {
        // "nahi" for house → set nahi_pata (not null — means customer said they don't know)
        ap.house = isRefusal(newParts.house) ? 'nahi_pata' : newParts.house;
      }
      if (valid(newParts.landmark) && !isRefusal(newParts.landmark)) {
        // If already have a landmark from bulk_info, combine (don't overwrite)
        if (ap.landmark && ap.landmark !== newParts.landmark) {
          const existLower = ap.landmark.toLowerCase();
          const newLower = newParts.landmark.toLowerCase();
          if (!existLower.includes(newLower) && !newLower.includes(existLower)) {
            ap.landmark = `${newParts.landmark}, ${ap.landmark}`;
          } else if (newLower.length > existLower.length) {
            ap.landmark = newParts.landmark;
          }
        } else {
          ap.landmark = newParts.landmark;
        }
      }

      // Link street name to landmark — "School vali Gali" + landmark "The Right School" → "The Right School vali Gali"
      if (ap.street && ap.landmark) {
        const PLACE_WORDS = /\b(school|masjid|mosque|bakery|hospital|clinic|college|park|dukaan|shop|store|hotel|pharmacy|church|temple|mandir|factory|mill|company|firm)\b/i;
        const placeMatch = ap.street.match(PLACE_WORDS);
        if (placeMatch) {
          const genericWord = placeMatch[1].toLowerCase();
          const landmarkLower = ap.landmark.toLowerCase();
          // Landmark has a specific name AND contains the same place word
          if (landmarkLower.includes(genericWord) && landmarkLower.length > genericWord.length + 2) {
            // Replace generic word in street with full landmark name
            // e.g. "School vali Gali" → "The Right School vali Gali"
            ap.street = ap.street.replace(new RegExp(`\\b${placeMatch[1]}\\b`, 'i'), ap.landmark);
          }
        }
      }

      // Reject generic landmarks (no name) — "masjid ke paas" is not enough, need "Bilal Masjid"
      const GENERIC_LANDMARKS = /^(near\s+)?(ek\s+)?(masjid|mosque|bakery|school|college|hospital|clinic|park|dukaan|shop|store|hotel|pharmacy|dawakhana|kiryana|general\s*store|petrol\s*pump|bank|atm|market|bazaar|chowk|naka|stop|bus\s*stop)(\s+ke?\s*paas)?$/i;
      const isGenericLandmark = ap.landmark && GENERIC_LANDMARKS.test(ap.landmark.trim());
      if (isGenericLandmark) {
        const genericType = ap.landmark.trim();
        // Save what they said for context (rural: will ask nearby reference)
        if (state._is_rural) state._generic_landmark = genericType;
        ap.landmark = null;
        // Non-rural: ask for specific name — "bank" → "Konsa bank? Naam bata dein"
        if (!state._is_rural && state.current === 'COLLECT_ADDRESS') {
          const typeLabel = genericType.replace(/^(near\s+|ek\s+)/i, '').replace(/\s+ke?\s*paas$/i, '').trim();
          const honorific = getHonorific(state);
          aiResult = { reply: `${honorific}, konsa ${typeLabel}? Naam bata dein taake rider ko direction mil sake 😊`, intent: 'ask_specific_landmark' };
          console.log(`[Address] Generic landmark "${genericType}" → asking for specific name`);
        }
      }

      // LETTER+NUMBER in street but house empty → swap to house (G78, R68, E-45, B/13 etc.)
      if (ap.street && !ap.house && /^[A-Za-z]\s*[\-\/]?\s*\d+$/i.test(ap.street.trim())) {
        console.log(`[Address] Swapping street→house: "${ap.street}" (letter+number pattern)`);
        ap.house = ap.street;
        ap.street = null;
        // Override AI reply — AI was asking for house but house is now filled after swap
        // Ask for the next missing part instead
        if (aiResult && aiResult.reply && /\b(house|ghar|makan|flat|plot)\s*(number|no|nmbr)?\b/i.test(aiResult.reply)) {
          const vars = buildVars(state, storeName);
          if (!ap.landmark) {
            aiResult.reply = fillTemplate('ASK_ADDRESS_LANDMARK', vars);
          }
        }
      }

      // Street format reorder: "Sector H, Street 8" → "Street 8, Sector H" (street/gali first, block/sector second)
      if (ap.street && /,/.test(ap.street)) {
        const parts = ap.street.split(',').map(s => s.trim());
        const streetIdx = parts.findIndex(p => /^(street|gali|galli|st)\s/i.test(p));
        if (streetIdx > 0) {
          // Move street/gali to front
          const streetPart = parts.splice(streetIdx, 1)[0];
          parts.unshift(streetPart);
          ap.street = parts.join(', ');
        }
      }
    }

    // "Rider call krle" / "bas itna he" = customer wants to stop address collection → accept as-is
    if (state.current === 'COLLECT_ADDRESS' && !state.address_confirming) {
      const addrDoneSignal = /\b(rider\s*(call|aa|a\s*kr|ajaye|aa\s*jaye|ko\s*bol|phone)|bas\s*(itna|yahi|yehi)|call\s*kr\s*(le|lena|do|dena)|aa\s*kr\s*(call|puch|pooch)|vaha\s*aa|wahan\s*aa|address\s*(bas|itna|yahi))\b/i.test(message);
      if (addrDoneSignal && state.collected.address_parts.area) {
        const ap = state.collected.address_parts;
        // Accept generic landmark if any, set house to nahi_pata if missing
        if (!ap.house) ap.house = 'nahi_pata';
        if (!ap.landmark) ap.landmark = 'nahi_pata';
      }
    }

    // SHOP DELIVERY auto-complete: if area + named landmark (shop/fabric/store/dukaan) → fill missing
    if (state.current === 'COLLECT_ADDRESS' && !state.address_confirming) {
      const ap = state.collected.address_parts;
      if (ap.area && ap.landmark) {
        const isShopDelivery = /\b(shop|dukaan|dukan|store|fabric|bakery|kiryana|medical|pharmacy|cloth|kapra|general|mart|karyana|hotel|restaurant|dhaba|office|workshop|godown)\b/i.test(ap.landmark);
        if (isShopDelivery) {
          if (!ap.street) ap.street = 'nahi_pata';
          if (!ap.house) ap.house = 'nahi_pata';
        }
      }
    }

    // ALWAYS check address completeness after AI call — not just when AI returned parts
    // This catches cases where AI fails to extract but accumulated parts are already complete
    if (state.current === 'COLLECT_ADDRESS' && !state.address_confirming) {
      const ap = state.collected.address_parts;
      const hasArea = !!ap.area;
      const hasHouse = ap.house && ap.house !== 'nahi_pata';
      const houseUnknown = ap.house === 'nahi_pata';
      const hasLandmark = !!ap.landmark;
      const isRural = !!state._is_rural;
      const isRuralHome = !!state._rural_home_delivery;
      const hasZilla = !!ap.zilla;
      // Rural home delivery = full address + zilla
      // Rural TCS = area + landmark(delivery point) + zilla
      // Urban = area + house + landmark
      const addrComplete = isRural
        ? (isRuralHome
          ? (hasArea && (hasHouse || houseUnknown) && hasLandmark && hasZilla)
          : (hasArea && hasLandmark && hasZilla))
        : (hasArea && (hasHouse || houseUnknown) && hasLandmark);

      if (addrComplete) {
        // Address complete — check if AI asked a relevant follow-up (landmark, street, etc.)
        // If yes, use AI reply (smarter) instead of template confirmation
        const aiAskedFollowUp = aiResult && aiResult.reply &&
          /\b(landmark|mashoor|mashoor\s*jag[ah]|nearby|qareeb|qareebi|nazdee?k|koi\s*(jag[ah]|dukaan|masjid|school|hospital|chowk)|konsa|konsi|kis\s*ke?\s*paas|reference|pehchan)\b/i.test(aiResult.reply);

        if (aiAskedFollowUp) {
          // AI asked a follow-up — but ONLY null landmark if it's generic (no specific name)
          // If landmark already has a specific name (e.g., "the right school"), keep it and confirm
          const NAMED_LANDMARK = ap.landmark && ap.landmark.length > 3 &&
            !/^(school|masjid|mosque|bakery|dukaan|shop|hospital|clinic|market|bazaar|chowk|park|bank)$/i.test(ap.landmark.trim());
          if (NAMED_LANDMARK) {
            // Landmark has a specific name — skip AI follow-up, go to confirmation
            state.address_confirming = true;
            const fullAddrParts = buildAddressString(ap);
            const cityLabel = state.collected.city || '';
            const fullAddr = cityLabel ? fullAddrParts + ', ' + cityLabel : fullAddrParts;
            const honorific = getHonorific(state.collected.name, state.gender);
            const confirmReply = fillTemplate('CONFIRM_ADDRESS', {
              full_address: fullAddr, honorific, name: state.collected.name || ''
            });
            state.messages.push({ role: 'user', content: message });
            state.messages.push({ role: 'assistant', content: confirmReply });
            if (state.messages.length > 10) state.messages = state.messages.slice(-10);
            const reply = qualityGate(confirmReply);
            saveMessages(dbConv, message, reply, 'address_complete', 'ai→confirm', state, {
              tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
              debug: { path: 'PATH3_AI_ADDRESS_CONFIRM', state_before: _stateBefore, ai_extracted: extracted, ai_raw_response: aiResult, system_prompt: prompt, context_messages: recentMessages, collected: { ...state.collected }, address_parts: { ...state.collected.address_parts } },
            });
            saveState(dbConv, state);
            return {
              reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
              needs_human: false, source: 'ai→confirm', intent: aiIntent,
              tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
              response_ms: Date.now() - startTime,
              db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
            };
          }
          // Generic landmark — null it so AI can ask for specifics
          ap.landmark = null;
          const aiReply = qualityGate(aiResult.reply);
          state.messages.push({ role: 'user', content: message });
          state.messages.push({ role: 'assistant', content: aiReply });
          if (state.messages.length > 10) state.messages = state.messages.slice(-10);
          saveMessages(dbConv, message, aiReply, 'ai_address_followup', 'ai', state, {
            tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
            debug: { path: 'PATH3_AI_ADDRESS_FOLLOWUP', state_before: _stateBefore, ai_extracted: extracted, ai_raw_response: aiResult, collected: { ...state.collected }, address_parts: { ...state.collected.address_parts } },
          });
          saveState(dbConv, state);
          return {
            reply: aiReply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
            needs_human: false, source: 'ai', intent: aiIntent,
            tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
            response_ms: Date.now() - startTime,
            db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
          };
        }

        // No follow-up from AI → show template confirmation
        state.address_confirming = true;
        const fullAddrParts = buildAddressString(ap);
        const cityLabel = state.collected.city || '';
        const fullAddr = cityLabel ? fullAddrParts + ', ' + cityLabel : fullAddrParts;
        const honorific = getHonorific(state.collected.name, state.gender);
        const confirmReply = fillTemplate('CONFIRM_ADDRESS', {
          full_address: fullAddr, honorific, name: state.collected.name || ''
        });

        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: confirmReply });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);

        const reply = qualityGate(confirmReply);
        saveMessages(dbConv, message, reply, 'address_complete', 'ai→confirm', state, {
          tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
          debug: { path: 'PATH3_AI_ADDRESS_CONFIRM', state_before: _stateBefore, ai_extracted: extracted, ai_raw_response: aiResult, system_prompt: prompt, context_messages: recentMessages, collected: { ...state.collected }, address_parts: { ...state.collected.address_parts } },
        });
        saveState(dbConv, state);

        return {
          reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
          needs_human: false, source: 'ai→confirm', intent: aiIntent,
          tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
          response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }

      // SAFETY NET: If AI reply says "order confirm" or "address complete" but address is NOT complete,
      // replace bad AI reply with proper re-ask for the missing part
      if (/\b(order\s*confirm|confirm\s*ho|complete\s*ho|order\s*place|order.*ho\s*gaya)\b/i.test(aiResult.reply)) {
        const vars = buildVars(state, storeName);
        if (!hasArea) {
          aiResult.reply = fillTemplate('ASK_ADDRESS_AREA', vars);
        } else if ((!isRural || isRuralHome) && !hasHouse && !houseUnknown) {
          aiResult.reply = fillTemplate('ASK_ADDRESS_HOUSE', vars);
        } else if (!hasLandmark) {
          aiResult.reply = (isRural && !isRuralHome)
            ? fillTemplate('ASK_RURAL_DELIVERY_POINT', vars)
            : fillTemplate('ASK_ADDRESS_LANDMARK', vars);
        } else if (isRural && !hasZilla) {
          aiResult.reply = fillTemplate('ASK_ZILLA', vars);
        }
      }
    }

    // Address confirmation yes/no is handled in PATH 1.5 (before AI call)
    // If we reach here with address_confirming, it means user gave a correction or unclear no
    if (state.current === 'COLLECT_ADDRESS' && state.address_confirming) {
      state.address_confirming = false;
      // Safety net: if AI returned "no" or "unknown" intent, user probably rejected the address
      // Reset and re-ask instead of showing same address again
      if (aiIntent === 'no' || aiIntent === 'unknown') {
        state.collected.address_parts = { area: null, street: null, house: null, landmark: null };
        state.address_step = 'area';
        const reaskVars = buildVars(state, storeName);
        reaskVars.area_suggestions = getAreaSuggestions(state.collected.city) || '';
        const reaskReply = fillTemplate('ASK_ADDRESS_AREA', reaskVars);
        state.messages.push({ role: 'user', content: message });
        state.messages.push({ role: 'assistant', content: reaskReply });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);
        const reply = qualityGate(reaskReply);
        saveMessages(dbConv, message, reply, 'address_reject_ai', 'ai→template', state, {
          tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
        });
        saveState(dbConv, state);
        return {
          reply, state: 'COLLECT_ADDRESS', collected: { ...state.collected },
          needs_human: false, source: 'ai→template', intent: 'address_reject',
          tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
          response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }
    }

    // --- DATA-DRIVEN STATE ADVANCE ---
    // Instead of relying solely on AI intent, check if data was collected
    // and auto-advance to the next state. This is MORE RELIABLE than AI intent.

    // Helper to return template response and exit
    function returnTemplate(templateResult, source = 'ai→template') {
      // Silent reply — no message to send (e.g., repeated "ok" after order confirmed)
      if (templateResult.reply === null) {
        state.current = templateResult.state;
        state.messages.push({ role: 'user', content: message });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);
        saveState(dbConv, state);
        return {
          reply: null, state: state.current, collected: { ...state.collected },
          needs_human: false, source: 'silent', intent: 'casual_ack',
          tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }

      // Prepend side question answers (delivery/trust queries embedded in other messages)
      const sidePrefix = sideQuestionPrefix(message, state, storeName);
      if (sidePrefix) templateResult.reply = sidePrefix + templateResult.reply;

      state.current = templateResult.state;
      if (state.product) state.collected.product = state.product.short;

      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: templateResult.reply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);

      const reply = qualityGate(templateResult.reply);
      saveMessages(dbConv, message, reply, aiIntent, source, state, {
        tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
        needs_human: templateResult.needs_human || false,
        debug: { path: 'PATH3_AI_TO_TEMPLATE', state_before: _stateBefore, state_after: templateResult.state, ai_intent: aiIntent, ai_extracted: extracted, ai_raw_response: aiResult, system_prompt: prompt, context_messages: recentMessages, template_used: templateResult.template || null, collected: { ...state.collected } },
      });
      saveState(dbConv, state);
      saveCustomer(dbCustomer, state);

      return {
        reply, state: state.current, collected: { ...state.collected },
        needs_human: templateResult.needs_human || false, source, intent: aiIntent,
        tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
        response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }

    // Handle media_request from AI — customer asked for picture/video
    if (aiIntent === 'media_request') {
      const mediaProductName = extracted.product_name || extracted.product;
      const mediaProduct = mediaProductName ? detectProduct(mediaProductName) : state.product;
      const mediaType = extracted.media_type || 'image';
      if (mediaProduct) {
        return {
          reply: null,
          state: state.current,
          _media: { product_id: mediaProduct.id, type: mediaType, product_name: mediaProduct.short },
          response_ms: Date.now() - startTime,
          db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
        };
      }
      // No product identified — ask which product
      return returnAi({ reply: `Kis product ki ${mediaType === 'video' ? 'video' : 'picture'} chahiye? Product ka naam ya number bata dein 😊`, state: state.current });
    }

    // Handle haggle state updates — only from valid states (not during data collection)
    if (aiIntent === 'haggle' && state.product &&
        !state.current.startsWith('COLLECT_') && !FORBIDDEN_AI_STATES.includes(state.current)) {
      state.haggle_round = (state.haggle_round || 0) + 1;
      state.current = 'HAGGLING';
      if (state.haggle_round === 2) state.discount_percent = 5;
      if (state.haggle_round >= 3) state.discount_percent = 10;
      // AI reply for haggle is fine, fall through to default AI reply
    }

    // Handle complaint
    if (aiIntent === 'complaint') {
      state.current = 'COMPLAINT';
      const complaintResult = { reply: fillTemplate('COMPLAINT', buildVars(state, storeName)), state: 'COMPLAINT', needs_human: true };
      return returnTemplate(complaintResult);
    }

    // Product + order → show product info + start collection
    if (aiIntent === 'product_with_order' && state.product) {
      // Extract details from multi-line message (name, phone, city, address if detailed)
      const aiPwoDetails = extractDetailsFromMsg(message, state.product?.short);
      if (aiPwoDetails.name) state.collected.name = aiPwoDetails.name;
      if (aiPwoDetails.phone) state.collected.phone = aiPwoDetails.phone;
      if (aiPwoDetails.city) state.collected.city = aiPwoDetails.city;
      if (aiPwoDetails.address) state.collected.address = aiPwoDetails.address;
      if (aiPwoDetails.addressHint) state.addressHint = aiPwoDetails.addressHint;
      if (aiPwoDetails.addressParts) {
        const ap = state.collected.address_parts;
        if (aiPwoDetails.addressParts.area && !ap.area) ap.area = aiPwoDetails.addressParts.area;
        if (aiPwoDetails.addressParts.street && !ap.street) ap.street = aiPwoDetails.addressParts.street;
        if (aiPwoDetails.addressParts.house && !ap.house) ap.house = aiPwoDetails.addressParts.house;
        if (aiPwoDetails.addressParts.landmark && !ap.landmark) ap.landmark = aiPwoDetails.addressParts.landmark;
        if (aiPwoDetails.addressParts.tehsil) ap.tehsil = aiPwoDetails.addressParts.tehsil;
        if (aiPwoDetails.addressParts.zilla) ap.zilla = aiPwoDetails.addressParts.zilla;
      }

      if (aiPwoDetails.name || aiPwoDetails.phone || aiPwoDetails.city || aiPwoDetails.address || aiPwoDetails.addressParts) {
        const nextField = askNextField(state, storeName);
        if (nextField) return returnTemplate(nextField);
      }

      state.current = 'COLLECT_NAME';
      const pwoVars = buildVars(state, storeName);
      const tplKey = state.collected.name ? 'PRODUCT_WITH_ORDER_KNOWN_NAME' : 'PRODUCT_WITH_ORDER';
      return returnTemplate({ reply: fillTemplate(tplKey, pwoVars), state: state.current });
    }
    if ((aiIntent === 'order_intent' ||
         (aiIntent === 'yes' && ['PRODUCT_INQUIRY', 'HAGGLING'].includes(state.current))) && state.product) {
      const nextField = askNextField(state, storeName);
      if (nextField) return returnTemplate(nextField);
    }

    // DATA-DRIVEN: If current collection state's data was just filled, advance
    const prevState = state.current;
    if (state.current === 'COLLECT_NAME' && state.collected.name) {
      // Name collected → advance to next field
      const nextField = askNextField(state, storeName);
      if (nextField) return returnTemplate(nextField);
    }

    if (state.current === 'COLLECT_PHONE' && state.collected.phone) {
      // Phone collected → advance
      const nextField = askNextField(state, storeName);
      if (nextField) return returnTemplate(nextField);
    }

    if (state.current === 'COLLECT_DELIVERY_PHONE' && state.collected.delivery_phone !== null) {
      // Delivery phone answered → advance
      const nextField = askNextField(state, storeName);
      if (nextField) return returnTemplate(nextField);
    }

    // Multiple cities detected — ask customer to clarify
    if (state.collected._multipleCities && state.collected._multipleCities.length > 1 && !state.collected.city) {
      const cities = state.collected._multipleCities;
      const honorific = getHonorific(state.collected.name, state.gender);
      const cityList = cities.join(' ya ');
      state.current = 'COLLECT_CITY';
      delete state.collected._multipleCities;
      const mcReply = `${state.collected.name} ${honorific}, aap ne ${cities.length} cities mention ki hain — ${cityList}. Delivery kis city mein karni hai?`;
      saveMessages(dbConv, message, mcReply, 'multiple_cities', 'ai→template', state, {
        tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
      });
      saveState(dbConv, state);
      return {
        reply: mcReply,
        state: state.current,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }

    if (state.current === 'COLLECT_CITY' && state.collected.city) {
      // City collected → advance
      const nextField = askNextField(state, storeName);
      if (nextField) return returnTemplate(nextField);
    }

    // All fields complete check (except address which has its own flow)
    if (state.collected.name && state.collected.phone && state.collected.city &&
        state.collected.address && state.product && !['COLLECT_ADDRESS', 'ORDER_SUMMARY', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED'].includes(state.current)) {
      const smResult = buildOrderSummary(state, storeName);
      return returnTemplate(smResult);
    }

    // AI intent-based transitions for non-collection states
    if (!state.current.startsWith('COLLECT_')) {
      const desiredState = intentToNextState(aiIntent, state.current, extracted, state);
      if (!FORBIDDEN_AI_STATES.includes(desiredState)) {
        const valid = VALID_TRANSITIONS[state.current] || [];
        if (valid.includes(desiredState)) {
          state.current = desiredState;
        }
      }
    }

    // Sync product
    if (state.product) state.collected.product = state.product.short;

    // Guard: empty/whitespace AI reply — use state-aware fallback
    if (!aiResult.reply || !aiResult.reply.trim()) {
      console.warn('[AI] Empty/whitespace reply detected, using fallback | State:', state.current, '| Tokens out:', aiResult.tokens_out);
      let fallbackReply;
      if (state.current === 'HAGGLING' && state.product) {
        // Haggle fallback — advance round and give discount
        state.haggle_round = (state.haggle_round || 0) + 1;
        if (state.haggle_round >= 2) {
          state.discount_percent = state.haggle_round >= 3 ? 10 : 5;
          const dp = state.discount_percent;
          const discPrice = Math.round(state.product.price * (1 - dp / 100));
          fallbackReply = fillTemplate('HAGGLE_ROUND_2', { ...vars, discount_percent: dp, discounted_price: discPrice.toLocaleString(), discount_amount: (state.product.price - discPrice).toLocaleString() });
        } else {
          fallbackReply = fillTemplate('HAGGLE_ROUND_1', { ...vars, product_short: state.product.short, price: state.product.price.toLocaleString() });
        }
      } else if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        fallbackReply = reask ? reask.reply : fillTemplate('FALLBACK', vars);
      } else {
        fallbackReply = fillTemplate('FALLBACK', vars);
      }
      state.messages.push({ role: 'user', content: message });
      state.messages.push({ role: 'assistant', content: fallbackReply });
      if (state.messages.length > 10) state.messages = state.messages.slice(-10);
      const fReply = qualityGate(fallbackReply);
      saveMessages(dbConv, message, fReply, 'empty_ai_fallback', 'template', state, {
        tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
        debug: { path: 'PATH3_AI_EMPTY_FALLBACK', state: state.current, ai_raw: aiResult },
      });
      saveState(dbConv, state);
      return {
        reply: fReply, state: state.current, collected: { ...state.collected },
        needs_human: false, source: 'template', intent: 'empty_ai_fallback',
        tokens_in: aiResult.tokens_in || 0, tokens_out: aiResult.tokens_out || 0,
        response_ms: Date.now() - startTime,
        db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
      };
    }

    // Default: use AI reply
    state.messages.push({ role: 'user', content: message });
    state.messages.push({ role: 'assistant', content: aiResult.reply });
    if (state.messages.length > 10) state.messages = state.messages.slice(-10);

    const reply = qualityGate(aiResult.reply);

    // Auto-learn: save this AI response as a pattern for future reuse
    saveAutoPattern(message, state.current, state.product?.id, reply);

    saveMessages(dbConv, message, reply, aiIntent, 'ai', state, {
      tokens_in: aiResult.tokens_in, tokens_out: aiResult.tokens_out,
      response_ms: Date.now() - startTime,
      needs_human: aiResult.needs_human,
      debug: {
        path: 'PATH3_AI',
        state_before: _stateBefore,
        state_after: state.current,
        collected_before: _collectedBefore,
        collected_after: { ...state.collected },
        ai_intent: aiIntent,
        ai_extracted: extracted,
        ai_raw_response: aiResult,
        system_prompt: prompt,
        context_messages: recentMessages,
        product: state.product?.short || null,
        smart_fill: _smartFillDebug,
        address_parts_before: _collectedBefore.address_parts || null,
        address_parts: state.collected.address_parts ? { ...state.collected.address_parts } : null,
        address_hint: state.addressHint || null,
        is_rural: state._is_rural || false,
        haggle_round: state.haggle_round || 0,
        pre_check_result: pre || 'NO_MATCH',
      },
    });
    saveState(dbConv, state);
    saveCustomer(dbCustomer, state);

    return {
      reply,
      state: state.current,
      collected: { ...state.collected },
      needs_human: aiResult.needs_human || false,
      source: 'ai',
      intent: aiIntent,
      tokens_in: aiResult.tokens_in || 0,
      tokens_out: aiResult.tokens_out || 0,
      response_ms: Date.now() - startTime,
      db_customer_id: dbCustomer?.id, db_conversation_id: dbConv?.id,
    };

  } catch (err) {
    console.error('[AI] Error:', err.message);
    console.error('[AI] Stack:', err.stack);
    console.error('[AI] State:', state.current, '| Msg:', message.substring(0, 80), '| Product:', typeof state.product, state.product?.short || state.product);

    // Track consecutive errors — after 2, try recovery AI call instead of generic template
    state._error_count = (state._error_count || 0) + 1;
    console.log(`[AI] Consecutive error count: ${state._error_count}`);

    // After 2 consecutive errors, try a simple recovery AI call with minimal prompt
    if (state._error_count >= 2 && apiKey) {
      try {
        console.log('[AI] Attempting recovery AI call after consecutive errors...');
        const recoveryPrompt = `Tu WhatsApp sales assistant hai. Roman Urdu mein jawab de. Customer se baat chal rahi hai. Uski baat samajh ke helpful jawab de. Max 2 lines. Agar address ya info de raha hai to acknowledge kar aur aage badh. JSON format: {"reply":"..."}`;
        const recoveryMessages = state.messages.slice(-6);
        recoveryMessages.push({ role: 'user', content: message });
        const recoveryResult = await chat(apiKey, recoveryPrompt, recoveryMessages);
        if (recoveryResult.reply && recoveryResult.reply.trim()) {
          state._error_count = 0; // Reset on success
          state.messages.push({ role: 'user', content: message });
          state.messages.push({ role: 'assistant', content: recoveryResult.reply });
          if (state.messages.length > 10) state.messages = state.messages.slice(-10);
          const reply = qualityGate(recoveryResult.reply);
          saveMessages(dbConv, message, reply, 'recovery', 'ai', state, {
            tokens_in: recoveryResult.tokens_in, tokens_out: recoveryResult.tokens_out,
            debug: { path: 'PATH3_ERROR_RECOVERY', error_count: state._error_count, original_error: err.message },
          });
          saveState(dbConv, state);
          return {
            reply, state: state.current, collected: { ...state.collected },
            needs_human: false, source: 'ai', intent: 'recovery',
            tokens_in: recoveryResult.tokens_in || 0, tokens_out: recoveryResult.tokens_out || 0,
            response_ms: Date.now() - startTime,
          };
        }
      } catch (recoveryErr) {
        console.error('[AI] Recovery call also failed:', recoveryErr.message);
      }
    }

    // State-aware error fallback — don't give generic "samajh nahi aaya" everywhere
    let errReply;
    if (state.current === 'HAGGLING' && state.product) {
      const dp = state.discount_percent || 0;
      const discPrice = dp ? Math.round(state.product.price * (1 - dp / 100)) : state.product.price;
      errReply = dp
        ? `${getHonorific(state.collected.name, state.gender)}, yeh last price hai Rs.${discPrice.toLocaleString()} — isse kam nahi ho sakti 😊 Jab order karna ho to bata dein!`
        : `${getHonorific(state.collected.name, state.gender)}, ${state.product.short} Rs.${state.product.price.toLocaleString()} mein hai. Order karna hai? 😊`;
    } else if (state.current === 'PRODUCT_INQUIRY' && state.product) {
      errReply = `${state.product.short} Rs.${state.product.price.toLocaleString()} mein hai. Order karna hai ${getHonorific(state.collected.name, state.gender)}? 😊`;
    } else {
      errReply = 'Ji, kuch samajh nahi aaya. Dobara bata dein?';
    }
    saveMessages(dbConv, message, errReply, 'error', 'error', state, { debug: { error: err.message, stack: err.stack?.split('\n').slice(0, 5).join(' | '), state_current: state.current, product_type: typeof state.product, error_count: state._error_count } });
    return {
      reply: errReply, state: state.current, collected: { ...state.collected },
      needs_human: false, source: 'error', intent: 'error',
      tokens_in: 0, tokens_out: 0, response_ms: Date.now() - startTime,
    };
  }
}

// ============= SIDE QUESTION DETECTION =============
// Detects delivery/trust questions embedded in other responses
const DELIVERY_Q = /\b(kb|kab|kitne?\s*din|kitna\s*time|kab\s*tak|kb\s*tk|kab\s*aye|kb\s*ayga|delivery|pohch|pohunch|ayega|aayega|milega)\b/i;
const TRUST_Q = /\b(fake|asli|original|cod|cash\s*on|return|exchange|warranty|guarantee|quality|bharosa|trust)\b/i;

function sideQuestionPrefix(message, state, storeName) {
  const l = message.toLowerCase();
  const parts = [];
  if (DELIVERY_Q.test(l)) {
    const dt = deliveryTime(state.collected.city);
    if (state.collected.city) {
      parts.push(`${state.collected.city} mein ${dt} mein delivery ho jayegi.`);
    } else {
      parts.push(`Delivery ${dt} mein ho jayegi.`);
    }
  }
  if (TRUST_Q.test(l)) {
    parts.push(`Paisa delivery ke waqt dena hai — pehle check karein phir paisa dein.`);
  }
  return parts.length ? parts.join(' ') + ' ' : '';
}

// ============= PRE-CHECK RESULT HANDLER =============
function handlePreCheck(pre, message, state, storeName, phone) {
  const vars = buildVars(state, storeName);

  switch (pre.intent) {

    case 'spam': {
      // Spam/scam messages — don't respond, don't waste AI tokens
      console.log('[SPAM] Blocked spam message, no response sent');
      return { reply: null, state: state.current, skip: true };
    }

    case 'image_not_recognized': {
      // Image sent but Vision couldn't match it to any product
      const imgReply = state.product
        ? `Yeh image samajh nahi aayi 🤔 Aap ${state.product.short} ke baare mein poochna chahte hain ya kuch aur? Text mein bata dein.`
        : 'Yeh image samajh nahi aayi 🤔 Aap kya chahte hain text mein bata dein, taake hum madad kar sakein!';
      return { reply: imgReply, state: state.current };
    }

    case 'parcel_image': {
      // Customer sent a parcel/courier label image — extract name, phone, address, city
      const parcelData = pre.extracted || {};
      // Save parcel data in state for "usi pe bhejo" follow-up reference
      state._parcel_data = parcelData;
      const parts = [];
      if (parcelData.name) { state.collected.name = parcelData.name; parts.push(`Naam: ${parcelData.name}`); }
      if (parcelData.phone) { state.collected.phone = parcelData.phone; state.collected.delivery_phone = 'same'; parts.push(`Phone: ${parcelData.phone}`); }
      if (parcelData.city) {
        const cityMatch = extractCity(parcelData.city);
        if (cityMatch) { state.collected.city = cityMatch; parts.push(`City: ${cityMatch}`); }
        else { state.collected.city = parcelData.city; parts.push(`City: ${parcelData.city}`); }
      }
      if (parcelData.address) {
        state.collected.address_parts = state.collected.address_parts || { area: null, street: null, house: null, landmark: null };
        state.collected.address_parts.area = parcelData.address;
        parts.push(`Address: ${parcelData.address}`);
      }
      const honorific = getHonorific(state.collected.name, state.gender);
      const confirmText = parts.length > 0
        ? `${honorific}, parcel se yeh info mili:\n${parts.join('\n')}\n\nKya yeh sahi hai? ✅`
        : `${honorific}, parcel se info nahi mil saki. Apna naam bata dein?`;
      // Move to appropriate next state
      if (parts.length > 0) {
        state._parcel_confirming = true;
      }
      return { reply: confirmText, state: state.current };
    }

    case 'parcel_image_confirm': {
      // Customer said "usi pe bhejo" — apply saved parcel data
      const pd = pre.extracted || {};
      if (pd.name && !state.collected.name) state.collected.name = pd.name;
      if (pd.phone && !state.collected.phone) { state.collected.phone = pd.phone; state.collected.delivery_phone = 'same'; }
      if (pd.city && !state.collected.city) {
        const cm = extractCity(pd.city);
        state.collected.city = cm || pd.city;
      }
      if (pd.address) {
        state.collected.address_parts = state.collected.address_parts || { area: null, street: null, house: null, landmark: null };
        if (!state.collected.address_parts.area) state.collected.address_parts.area = pd.address;
      }
      // Figure out what's next
      const nf = askNextField(state, storeName);
      if (nf) return { reply: nf.reply, state: nf.state };
      return { reply: fillTemplate('FALLBACK', vars), state: state.current };
    }

    case 'greeting': {
      state.current = 'GREETING';
      if (state.isReturning && state.collected.name) {
        return { reply: fillTemplate('GREETING_RETURNING_CASUAL', vars), state: 'GREETING' };
      }
      return { reply: fillTemplate('GREETING_CASUAL', vars), state: 'GREETING' };
    }

    case 'greeting_salam': {
      // In HAGGLING/PRODUCT_INQUIRY — greet + remind about product
      if (['HAGGLING', 'PRODUCT_INQUIRY'].includes(state.current) && state.product) {
        const greet = fillTemplate('GREETING_SALAM', vars);
        return { reply: `${greet} ${state.product.short} Rs.${state.product.price.toLocaleString()} — order karna hai?`, state: state.current };
      }
      state.current = 'GREETING';
      if (state.isReturning && state.collected.name) {
        return { reply: fillTemplate('GREETING_RETURNING_SALAM', vars), state: 'GREETING' };
      }
      return { reply: fillTemplate('GREETING_SALAM', vars), state: 'GREETING' };
    }

    case 'greeting_casual': {
      if (['HAGGLING', 'PRODUCT_INQUIRY'].includes(state.current) && state.product) {
        const greet = fillTemplate('GREETING_CASUAL', vars);
        return { reply: `${greet} ${state.product.short} Rs.${state.product.price.toLocaleString()} — order karna hai?`, state: state.current };
      }
      state.current = 'GREETING';
      if (state.isReturning && state.collected.name) {
        return { reply: fillTemplate('GREETING_RETURNING_CASUAL', vars), state: 'GREETING' };
      }
      return { reply: fillTemplate('GREETING_CASUAL', vars), state: 'GREETING' };
    }

    case 'greeting_howru': {
      state.current = 'GREETING';
      return { reply: fillTemplate('GREETING_HOWRU', vars), state: 'GREETING' };
    }

    case 'bot_identity': {
      // "Tumhara naam kya hai?" / "What is your name?" — answer as Zoya, keep current state
      const botReply = 'Mera naam Zoya hai 😊';
      // In collection/address states — answer + re-ask current field
      const isCollectionState = ['COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_CITY', 'COLLECT_ADDRESS', 'COLLECT_DELIVERY_PHONE'].includes(state.current);
      if (isCollectionState || state.address_confirming) {
        if (state.address_confirming) {
          // During address confirmation — answer + re-show confirmation
          const addrStr = buildAddressString(state.collected.address_parts);
          const cityLabel = state.collected.city || '';
          const fullAddr = cityLabel ? addrStr + ', ' + cityLabel : addrStr;
          return { reply: botReply + ` 📍 Yeh address sahi hai? ${fullAddr} ✅`, state: state.current };
        }
        const reask = askNextField(state, storeName);
        if (reask) return { reply: botReply + ' ' + reask.reply, state: state.current };
        return { reply: botReply, state: state.current };
      }
      if (state.current === 'ORDER_SUMMARY') {
        return { reply: botReply + ' Order confirm karna hai?', state: state.current };
      }
      return { reply: botReply, state: state.current };
    }

    case 'greeting_in_collection': {
      // Greeting during collection states — respond with greeting + re-ask current field
      const greetReply = fillTemplate('GREETING_SALAM', vars);
      const reask = askNextField(state, storeName);
      if (reask) {
        return { reply: greetReply + ' ' + reask.reply, state: state.current };
      }
      return { reply: greetReply, state: state.current };
    }

    case 'greeting_in_selection': {
      // Greeting during PRODUCT_SELECTION — respond with greeting, keep state, re-ask product
      state.current = 'PRODUCT_SELECTION';
      return { reply: fillTemplate('GREETING_SALAM', vars) + ' Konsa product pasand aaya sir?', state: 'PRODUCT_SELECTION' };
    }

    case 'show_products':
    case 'product_list': {
      state.current = 'PRODUCT_SELECTION';
      const nextVars = buildVars(state, storeName);
      // Send all product videos along with the list
      const _allVideos = PRODUCTS.map(p => ({ product_id: p.id, type: 'video', product_name: p.short }));
      return { reply: fillTemplate('PRODUCT_LIST', nextVars), state: 'PRODUCT_SELECTION', _media_batch: _allVideos };
    }

    case 'order_without_product': {
      state.current = 'PRODUCT_SELECTION';
      const owpVars = buildVars(state, storeName);
      return { reply: fillTemplate('ORDER_WITHOUT_PRODUCT', owpVars), state: 'PRODUCT_SELECTION' };
    }

    case 'reorder': {
      // Customer wants to reorder — check if we have their past data
      state.current = 'PRODUCT_SELECTION';
      const reorderVars = buildVars(state, storeName);
      if (state.isReturning && state.collected.name) {
        // We have data — show last order info
        const ctx = require('./context-builder').buildContext(phone);
        const lastOrder = ctx.orderHistory?.[0];
        if (lastOrder && lastOrder.items.length > 0) {
          const lastItems = lastOrder.items.map(i => i.name || i.short).join(', ');
          reorderVars.last_order = lastItems;
          return { reply: fillTemplate('REORDER_WITH_DATA', reorderVars), state: 'PRODUCT_SELECTION' };
        }
      }
      // No data found — politely say "data nahi mila, koi baat nahi"
      return { reply: fillTemplate('REORDER_NO_DATA', reorderVars), state: 'PRODUCT_SELECTION' };
    }

    case 'product_ambiguous': {
      // 2+ products matched with same score — ask customer to clarify
      const ambigProducts = pre.extracted.products;
      const matchList = ambigProducts.map((p, i) => `${i + 1}. ${p.name} — Rs.${p.price.toLocaleString()}`).join('\n');
      state.current = 'PRODUCT_SELECTION';
      state._ambiguous_products = ambigProducts;
      const ambigReply = fillTemplate('PRODUCT_AMBIGUOUS', { ...vars, matching_products: matchList });
      return { reply: ambigReply, state: 'PRODUCT_SELECTION' };
    }

    case 'bulk_info_given': {
      // Customer sent all order details at once (name, number, address in one message)
      if (!state.products) state.products = [];
      const ext = pre.extracted || {};

      // Fill name — always override from bulk_info (customer is explicitly correcting/providing)
      if (ext.name) {
        const words = ext.name.split(/\s+/);
        state.collected.name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }

      // Fill phone — use_wa_number or explicit
      if (ext.phone) {
        state.collected.phone = ext.phone;
      } else if (ext.use_wa_number && phone) {
        let waPhone = phone;
        if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
        const validation = validatePhone(waPhone);
        if (validation.valid) state.collected.phone = validation.phone;
      }

      // Fill city
      if (ext.city) state.collected.city = ext.city;

      // Fill address parts
      if (ext.address_text || ext.landmark) {
        if (!state.collected.address_parts) state.collected.address_parts = { area: null, street: null, house: null, landmark: null };
        if (ext.address_text) {
          state.collected.address_parts.area = ext.address_text;
          // Check if bulk address is already detailed enough (has house/office/flat/plot number + area)
          const addrLower = ext.address_text.toLowerCase();
          const hasHouseNum = /\b(house|makan|ghar|flat|apartment|apt|office|plot|floor|ground\s*floor)\s*(no\.?|number|#)?\s*[a-z0-9]/i.test(ext.address_text) ||
            /\b(no\.?|#)\s*[a-z]?\s*\d+/i.test(ext.address_text) ||
            /\b\d+\s*-?\s*[a-z]\b/i.test(addrLower);
          const hasArea = /\b(phase|block|sector|colony|town|society|scheme|bahria|dha|gulberg|gulshan|iqbal|model|cantt|saddar|johar|north|south|east|west|garden|nazimabad|clifton|defence)\b/i.test(ext.address_text);
          if (hasHouseNum && hasArea) {
            // Address is complete — set final address directly to skip COLLECT_ADDRESS
            const city = ext.city || state.collected.city;
            state.collected.address = city ? ext.address_text + ', ' + city : ext.address_text;
          }
        }
        if (ext.landmark) state.collected.address_parts.landmark = ext.landmark;
      }

      // Fill gender if detected from feminine verb forms
      if (ext.gender) state.gender = ext.gender;

      // Fill product if detected in bulk message
      if (ext.product && !state.product) {
        state.product = ext.product;
        state.collected.product = ext.product.short;
      }

      // If no product → ask which product
      if (!state.product) {
        state.current = 'PRODUCT_SELECTION';
        const bulkVars = buildVars(state, storeName);
        const honorific = getHonorific(state.collected.name, state.gender);
        const nameStr = state.collected.name ? state.collected.name + ' ' + honorific + ', ' : '';
        return { reply: `Shukriya ${nameStr}details ke liye! Batayein konsa product order karna hai?`.trim(), state: 'PRODUCT_SELECTION' };
      }

      // Product set → move to next missing field
      const bulkNext = askNextField(state, storeName);
      return bulkNext || { reply: fillTemplate('FALLBACK', vars), state: state.current };
    }

    case 'greeting_ack': {
      // Pure "ok"/"acha"/"theek" in GREETING — silent, no reply needed
      return { reply: null, state: 'GREETING' };
    }

    case 'greeting_no': {
      // User said no to "products dekhna hai?" — politely stay available
      return { reply: fillTemplate('FALLBACK', vars), state: 'GREETING' };
    }

    case 'product_qualifier': {
      // "larkio vala", "ladies wala" — customer describing what kind of product they want
      // Show product list so they can pick the right one
      const qualText = pre.extracted?.text || message;
      const honorific = getHonorific(state.collected.name, state.gender);
      const productList = PRODUCTS.map((p, i) => `${i + 1}. ${p.short} — Rs.${p.price.toLocaleString()}`).join('\n');
      return { reply: `${honorific.charAt(0).toUpperCase() + honorific.slice(1)}, "${qualText}" ke liye yeh products hain:\n${productList}\nIn mein se konsa chahiye? Number ya naam bata dein.`, state: 'PRODUCT_SELECTION' };
    }

    case 'frustration': {
      // Customer is frustrated — hand off to human agent
      const frustReply = `${getHonorific(state.collected.name, state.gender)}, maafi chahte hain aapko takleef hui 🙏 Hamara agent abhi aapse baat karega. Thori der mein aapko reply milega.`;
      return { reply: frustReply, state: state.current, needs_human: true };
    }

    case 'complaint': {
      state.current = 'COMPLAINT';
      return { reply: fillTemplate('COMPLAINT', vars), state: 'COMPLAINT', needs_human: true };
    }

    case 'trust_question': {
      let reply = fillTemplate('TRUST_GENERAL', vars);
      // Re-ask current collection question so flow doesn't stall
      if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        if (reask) reply += ' ' + reask.reply;
      }
      return { reply, state: state.current };
    }

    case 'quality_question': {
      let reply = fillTemplate('QUALITY_REASSURANCE', vars);
      // Re-ask current collection question so flow doesn't stall
      if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        if (reask) reply += ' ' + reask.reply;
      }
      return { reply, state: state.current };
    }

    case 'haggle': {
      // Haggle detected by pre-check — handle with template (saves AI cost)
      if (!state.product) return null; // no product → let AI handle
      state.haggle_round = (state.haggle_round || 0) + 1;
      state.current = 'HAGGLING';
      const hp = state.product;
      if (state.haggle_round === 1) {
        return { reply: fillTemplate('HAGGLE_ROUND_1', { ...vars, product_short: hp.short, price: hp.price.toLocaleString() }), state: 'HAGGLING' };
      } else if (state.haggle_round === 2) {
        state.discount_percent = 5;
        const dp2 = Math.round(hp.price * 0.95);
        return { reply: fillTemplate('HAGGLE_ROUND_2', { ...vars, discount_percent: 5, discounted_price: dp2.toLocaleString(), discount_amount: (hp.price - dp2).toLocaleString() }), state: 'HAGGLING' };
      } else if (state.haggle_round === 3) {
        state.discount_percent = 10;
        const dp3 = Math.round(hp.price * 0.90);
        return { reply: fillTemplate('HAGGLE_ROUND_3', { ...vars, discounted_price: dp3.toLocaleString() }), state: 'HAGGLING' };
      } else {
        return { reply: fillTemplate('HAGGLE_FINAL', vars), state: 'HAGGLING' };
      }
    }

    case 'haggle_in_collection': {
      // Discount/haggle request during data collection — respond + re-ask current field
      const product = state.product;
      const hagglePrice = product ? `${product.short} Rs.${product.price.toLocaleString()} fixed price hai` : 'Yeh fixed price hai';
      const reaskHaggle = askNextField(state, storeName);
      const haggleReply = `${vars.honorific}, ${hagglePrice} — COD hai, delivery pe check kar lein. ${reaskHaggle ? reaskHaggle.reply : ''}`;
      return { reply: haggleReply.trim(), state: state.current };
    }

    case 'phone_in_name_state': {
      // Customer gave phone number during COLLECT_NAME — save phone, still ask name
      const phoneNum = pre.extracted.phone;
      state.collected.phone = phoneNum;
      return { reply: `Number mil gaya 👍 ${vars.honorific}, apna naam bata dein?`, state: 'COLLECT_NAME' };
    }

    case 'wa_number_in_name_state': {
      // Customer said "use this WhatsApp number" during COLLECT_NAME — save WA phone, still ask name
      // phone is international format (923001234567) → convert to local (03001234567)
      const waLocal = phone.startsWith('92') ? '0' + phone.slice(2) : phone;
      state.collected.phone = waLocal;
      return { reply: `Number mil gaya 👍 ${vars.honorific}, apna naam bata dein?`, state: 'COLLECT_NAME' };
    }

    case 'acknowledgment': {
      // Pure ack ("ok", "acha", "theek") in collection states → re-ask current field
      const reask = askNextField(state, storeName);
      return reask || { reply: fillTemplate('FALLBACK', vars), state: state.current };
    }

    case 'phone_given': {
      if (state.current === 'COLLECT_DELIVERY_PHONE' && state.collected.phone) {
        // Already have main phone — this new number is delivery/alt phone
        const newPhone = pre.extracted.phone;
        if (newPhone === state.collected.phone) {
          // Same as main → treat as same_phone
          state.collected.delivery_phone = 'same';
        } else {
          state.collected.delivery_phone = newPhone;
        }
      } else {
        state.collected.phone = pre.extracted.phone;
        state.collected.delivery_phone = null;
      }
      const sidePrefix = sideQuestionPrefix(message, state, storeName);
      const nextField = askNextField(state, storeName);
      if (sidePrefix && nextField) nextField.reply = sidePrefix + nextField.reply;
      return nextField;
    }

    case 'use_wa_number': {
      // "Yehi ha WhatsApp wala" → use customer's WhatsApp number
      if (phone) {
        let waPhone = phone;
        if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
        const validation = validatePhone(waPhone);
        if (validation.valid) {
          state.collected.phone = validation.phone;
          state.collected.delivery_phone = null;
          const sidePrefix = sideQuestionPrefix(message, state, storeName);
          const nextField = askNextField(state, storeName);
          if (sidePrefix && nextField) nextField.reply = sidePrefix + nextField.reply;
          return nextField;
        }
      }
      return { reply: fillTemplate('ASK_PHONE', vars), state: state.current };
    }

    case 'phone_invalid': {
      if (pre.extracted.error === 'too_long') {
        const honorific = getHonorific(state.collected.name, state.gender);
        return {
          reply: `${state.collected.name || ''} ${honorific}, yeh number ${pre.extracted.digits} digits ka hai — 11 digits hona chahiye (03xx-xxxxxxx). Dobara check kar ke bata dein?`.trim(),
          state: state.current
        };
      }
      const tpl = pre.extracted.error === 'incomplete' ? 'PHONE_INVALID_INCOMPLETE' : 'PHONE_INVALID_FORMAT';
      return { reply: fillTemplate(tpl, vars), state: state.current };
    }

    case 'city_given': {
      state.collected.city = pre.extracted.city;
      // If area was detected (e.g., "Malir" is area in Karachi, not a city)
      if (pre.extracted.area && !state.collected.address_parts.area) {
        state.collected.address_parts.area = pre.extracted.area;
      }
      // If rural part was stored from previous rural_no_city, move to address area
      if (state._rural_part) {
        state.collected.address_parts = state.collected.address_parts || { area: null, street: null, house: null, landmark: null };
        state.collected.address_parts.area = state._rural_part;
        state._is_rural = true; state.collected._is_rural = true; // Mark as rural — skip street/house, ask TCS/post office
        state.address_step = 'tcs_postoffice'; // Skip street/house entirely
        delete state._rural_part;
        delete state._rural_type;
        // Ask for TCS/post office instead of street
        state.current = 'COLLECT_ADDRESS';
        const ruralVars = buildVars(state, storeName);
        const sidePrefix = sideQuestionPrefix(message, state, storeName);
        return { reply: sidePrefix + fillTemplate('ASK_RURAL_DELIVERY_POINT', ruralVars), state: 'COLLECT_ADDRESS' };
      }
      // Use askNextField which properly checks what's already collected
      const sidePrefix = sideQuestionPrefix(message, state, storeName);
      const nextField = askNextField(state, storeName);
      if (nextField) {
        if (sidePrefix) nextField.reply = sidePrefix + nextField.reply;
        return nextField;
      }
      // Fallback: all fields complete after city — build order summary
      return buildOrderSummary(state, storeName);
    }

    case 'region_given': {
      const regionVars = { ...vars, region: pre.extracted.region, examples: pre.extracted.examples };
      return { reply: fillTemplate('REGION_NOT_CITY', regionVars), state: 'COLLECT_CITY' };
    }

    case 'phone_clarification_in_city': {
      // Customer talking about phone numbers in COLLECT_CITY state — acknowledge and re-ask city
      return { reply: `Noted ${vars.honorific}! 👍 Ab city bata dein — delivery kahan karni hai? 🚚`, state: 'COLLECT_CITY' };
    }

    case 'multiple_cities': {
      const cities = pre.extracted.cities;
      const cityList = cities.join(' ya ');
      const honorific = getHonorific(state.collected.name, state.gender);
      return { reply: `${state.collected.name || ''} ${honorific}, aap ne ${cities.length} cities mention ki hain — ${cityList}. Delivery kis city mein karni hai?`.trim(), state: 'COLLECT_CITY' };
    }

    case 'rural_no_city': {
      // Rural address without city — store rural part and ask for city
      // Keep existing _rural_part if it's more specific (e.g. "chak no 32" vs bare "chak")
      if (!state._rural_part || pre.extracted.rural_part.length > state._rural_part.length) {
        state._rural_part = pre.extracted.rural_part;
      }
      state._rural_type = pre.extracted.rural_type; state.collected._rural_type = pre.extracted.rural_type;
      const ruralVars = { ...vars, rural_part: pre.extracted.rural_part };
      return { reply: fillTemplate('ASK_RURAL_CITY', ruralVars), state: 'COLLECT_CITY' };
    }

    case 'generic_admin_word': {
      // Customer said "taluqa", "tehsil", "zila" etc. — ask for actual name
      const word = pre.extracted?.word || 'tehsil';
      return { reply: `${vars.honorific}, "${word}" ka naam kya hai? Tehsil ya city ka poora naam bata dein 🏙️`, state: 'COLLECT_CITY' };
    }

    case 'rural_with_city': {
      // Rural + city both mentioned — ask confirmation
      state._rural_part = pre.extracted.rural_part;
      state._rural_type = pre.extracted.rural_type; state.collected._rural_type = pre.extracted.rural_type;
      state._pending_city = pre.extracted.city;
      state.current = 'CONFIRM_RURAL_CITY';
      const ruralVars = { ...vars, city: pre.extracted.city, rural_part: pre.extracted.rural_part };
      return { reply: fillTemplate('ASK_RURAL_CONFIRM', ruralVars), state: 'CONFIRM_RURAL_CITY' };
    }

    case 'cancel_order': {
      // Cancel after order confirmed — handled entirely here, no AI
      state.current = 'CANCEL_AFTER_CONFIRM';
      state._cancelTag = true;
      try {
        const custPhone = state.collected.phone;
        if (custPhone) {
          const cust = customerModel.findByPhone(custPhone);
          if (cust) {
            const orders = orderModel.getByCustomer(cust.id);
            if (orders.length > 0) orderModel.updateStatus(orders[0].id, 'cancel_requested');
          }
        }
      } catch (e) { /* ignore */ }
      const honorific = getHonorific(state.collected.name, state.gender);
      const reply = `${state.collected.name || ''} ${honorific}, aapka parcel dispatch ho chuka hai — ab cancel nahi ho sakta. Delivery ke waqt rider se mil jayega. Shukriya!`.trim();
      return { reply, state: 'CANCEL_AFTER_CONFIRM' };
    }

    case 'delivery_charge_question': {
      const honorific = getHonorific(state.collected.name, state.gender);
      let reply = `${state.collected.name || ''} ${honorific}, delivery bilkul FREE hai — koi charges nahi. Cash on Delivery (COD) hai, paisa delivery ke waqt dena hai.`.trim();
      // Re-ask current collection question so flow doesn't stall
      if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        if (reask) reply += ' ' + reask.reply;
      } else {
        reply += ' Order karna hai?';
      }
      return { reply, state: state.current };
    }

    case 'delivery_time_question': {
      // If city in extracted (from message) or collected, give specific time
      const dtCity = pre.extracted?.city || state.collected.city;
      // Save city if extracted and not yet collected
      if (pre.extracted?.city && !state.collected.city) {
        state.collected.city = pre.extracted.city;
      }
      let reply;
      if (dtCity) {
        const dtVars = { ...vars, city: dtCity, delivery_time: deliveryTime(dtCity) };
        reply = fillTemplate('DELIVERY_WITH_CITY', dtVars);
      } else {
        reply = fillTemplate('DELIVERY_GENERAL', vars);
      }
      // Re-ask current collection question so flow doesn't stall
      if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        if (reask) reply += ' ' + reask.reply;
      }
      return { reply, state: state.current };
    }

    case 'product_reassurance': {
      const honorific = getHonorific(state.collected.name, state.gender);
      const pName = state.product ? state.product.short : 'yeh product';
      let reply = `${state.collected.name || ''} ${honorific}, ${pName} tested hai aur sab customers ka feedback positive hai. COD hai — delivery pe check kar lein, pasand na aaye to wapis.`.trim();
      // Re-ask current collection question so flow doesn't stall
      if (state.current.startsWith('COLLECT_')) {
        const reask = askNextField(state, storeName);
        if (reask) reply += '\n\n' + reask.reply;
      } else if (['PRODUCT_INQUIRY', 'HAGGLING'].includes(state.current)) {
        reply += ' Order karna hai?';
      }
      return { reply, state: state.current };
    }

    case 'city_delivery_question': {
      const askedCity = pre.extracted.asked_city;
      const currentCity = pre.extracted.current_city || state.collected.city;
      const dt = deliveryTime(askedCity);
      const honorific = getHonorific(state.collected.name, state.gender);
      // Reset to COLLECT_CITY so customer can pick
      state.current = 'COLLECT_CITY';
      state.collected.city = null;
      state.collected.address_parts = { area: null, street: null, house: null, landmark: null };
      state.address_step = null;
      state.address_confirming = false;
      return {
        reply: `Haan ${honorific}, ${askedCity} mein bhi delivery hoti hai — ${dt} lagte hain. Delivery ${currentCity} mein karni hai ya ${askedCity} mein?`,
        state: 'COLLECT_CITY'
      };
    }

    case 'address_enough': {
      // Customer says "btaya to" / "bas itna" / "yeh address hai" / "just likh do ajayega"
      // Accept what we have, fill missing with nahi_pata, and add reassurance about delivery call
      const ap = state.collected.address_parts;
      if (!ap.house) ap.house = 'nahi_pata';
      if (!ap.landmark) ap.landmark = 'nahi_pata';
      if (!ap.street) ap.street = 'nahi_pata';
      // Move to next field (should go to address confirmation now)
      const nextField = askNextField(state, storeName);
      return nextField || { reply: fillTemplate('FALLBACK', vars), state: state.current };
    }

    case 'address_during_phone': {
      // Customer gave address/city info during COLLECT_PHONE — save it, still ask phone
      const ext = pre.extracted || {};
      if (ext.city) {
        state.collected.city = ext.city;
      }
      if (ext.address_hint) {
        // Store hint for later use during COLLECT_ADDRESS
        state._address_hint = ext.address_hint;
      }
      const honorific = getHonorific(state.collected.name, state.gender);
      const savedMsg = ext.city ? `${ext.city} note kar liya` : 'Address note kar liya';
      return {
        reply: `${savedMsg} ${honorific} — pehle phone number bata dein? 📱`,
        state: 'COLLECT_PHONE'
      };
    }

    case 'same_phone': {
      state.collected.delivery_phone = 'same'; // same as main
      const sidePrefix = sideQuestionPrefix(message, state, storeName);
      const nextField = askNextField(state, storeName);
      if (sidePrefix && nextField) {
        nextField.reply = sidePrefix + nextField.reply;
      }
      return nextField;
    }

    case 'rural_in_phone_state': {
      // Customer gave rural address (e.g. "chak no 32 mangla") in COLLECT_DELIVERY_PHONE
      // Assume same phone, store rural info, move to city or rural flow
      state.collected.delivery_phone = 'same';
      state._rural_part = pre.extracted.rural_part;
      state._rural_type = pre.extracted.rural_type; state.collected._rural_type = pre.extracted.rural_type;
      if (pre.extracted.city) {
        // Rural + city both mentioned — confirm and start rural address flow
        state.collected.city = pre.extracted.city;
        state._is_rural = true; state.collected._is_rural = true;
        state.collected.address_parts.area = pre.extracted.rural_part;
        const ruralVars = { ...vars, city: pre.extracted.city, rural_part: pre.extracted.rural_part };
        return { reply: fillTemplate('ASK_RURAL_DELIVERY_POINT', ruralVars), state: 'COLLECT_ADDRESS' };
      }
      // Rural without city — ask for city/tehsil
      const ruralVars = { ...vars, rural_part: pre.extracted.rural_part };
      return { reply: fillTemplate('ASK_RURAL_CITY', ruralVars), state: 'COLLECT_CITY' };
    }

    case 'name_given': {
      state.collected.name = pre.extracted.name;
      // Also save city if extracted from same message (voice: "naam Amjad hai aur Sukkur mein delivery")
      if (pre.extracted.city && !state.collected.city) {
        state.collected.city = pre.extracted.city;
      }
      // Strip customer name from address_parts.area if it was accidentally included (bulk extraction)
      if (state.collected.address_parts?.area && state.collected.name) {
        const nameRegex = new RegExp('^\\s*' + state.collected.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,.]?\\s*', 'i');
        state.collected.address_parts.area = state.collected.address_parts.area.replace(nameRegex, '').trim();
        // Also update final address if already set
        if (state.collected.address) {
          state.collected.address = state.collected.address.replace(nameRegex, '').trim();
        }
      }
      const sidePrefix = sideQuestionPrefix(message, state, storeName);
      const nextField = askNextField(state, storeName);
      if (sidePrefix && nextField) nextField.reply = sidePrefix + nextField.reply;
      return nextField;
    }

    case 'product_selected': {
      state.product = pre.extracted.product;
      delete state._ambiguous_products; // Clear ambiguous list after selection
      state.current = 'PRODUCT_INQUIRY';
      const nextVars = buildVars(state, storeName);
      return { reply: fillTemplate('PRODUCT_INQUIRY', nextVars), state: 'PRODUCT_INQUIRY' };
    }

    case 'product_inquiry': {
      // If customer previously asked for media (video/picture) and now names a product → send media
      if (state._pending_media_type && pre.extracted?.product) {
        const pendingType = state._pending_media_type;
        state._pending_media_type = null;
        state.product = pre.extracted.product;
        state.collected.product = pre.extracted.product.short;
        return {
          reply: null,
          state: state.current,
          _media: { product_id: pre.extracted.product.id, type: pendingType, product_name: pre.extracted.product.short }
        };
      }
      state._pending_media_type = null; // Clear if unrelated
      // If already in PRODUCT_INQUIRY with same product, let AI answer the specific question
      // Template just repeats price+features, AI actually answers "yh baal katti he?" type questions
      if (state.current === 'PRODUCT_INQUIRY' && state.product && pre.extracted?.product &&
          state.product.short === pre.extracted.product.short) {
        return null; // Fall through to AI
      }
      if (pre.extracted?.product) state.product = pre.extracted.product;
      // Check if message also has personal details (name, address, phone)
      // "Name ayan flat nomber 230... facial hair remover" = product + details in one msg
      const piHasInline = /\b(name|naam)\s+/i.test(message) || /\b(flat|house|ghar|makan)\s*(no|nomber|number|nmbr|#)?\s*\d/i.test(message);
      if (piHasInline || message.split(/\n/).filter(l => l.trim()).length >= 2) {
        const piDetails = extractDetailsFromMsg(message, state.product?.short);
        if (piDetails.name) state.collected.name = piDetails.name;
        if (piDetails.phone) state.collected.phone = piDetails.phone;
        if (piDetails.city) state.collected.city = piDetails.city;
        if (piDetails.addressHint) state.addressHint = piDetails.addressHint;
        if (piDetails.addressParts) {
          const ap = state.collected.address_parts;
          if (piDetails.addressParts.area && !ap.area) ap.area = piDetails.addressParts.area;
          if (piDetails.addressParts.house && !ap.house) ap.house = piDetails.addressParts.house;
          if (piDetails.addressParts.street && !ap.street) ap.street = piDetails.addressParts.street;
          if (piDetails.addressParts.landmark && !ap.landmark) ap.landmark = piDetails.addressParts.landmark;
        }
        // "mobile nomber ye he hai" / "yehi ha whatsapp wala" → use WhatsApp number
        if (!state.collected.phone && !piDetails.phone) {
          const useThisNum = /\b(yehi|yahi|yhi|isi|issi|same)\s*(number|no|nmbr|nomber)\b/i.test(message) ||
            /\b(number|nomber|nmbr|mobile)\s*(yehi|yahi|yhi|ye|yeh)\s*(he|hai|h)\b/i.test(message) ||
            /\bjis\s*(se|number|no)\s*(baat|msg|message|chat)\b/i.test(message) ||
            /\b(mobile|phone)\s*(nomber|number|nmbr)?\s*(ye|yeh|yehi|yahi)?\s*(he|hai|h)\s*(he|hai|h)?\b/i.test(message) ||
            /\b(yehi|yahi|yhi|ye|yeh)\s*(he|hai|ha|h)\s*(whatsapp|watsapp|whats\s*app)\s*(wala|vala|number|no)?\b/i.test(message) ||
            /\b(whatsapp|watsapp)\s*(wala|vala|number|no)?\s*(yehi|yahi|yhi|ye|yeh)?\s*(he|hai|ha|h)\b/i.test(message);
          if (useThisNum && phone) {
            let waPhone = phone;
            if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
            const pv = validatePhone(waPhone);
            if (pv.valid) state.collected.phone = pv.phone;
          }
        }
        // Infer city from area as hint — don't auto-set, let bot ask customer
        if (!state.collected.city && (piDetails.inferredCity || piDetails.addressParts?.area)) {
          const hint = piDetails.inferredCity || extractCity(piDetails.addressParts?.area);
          if (hint) state._cityHint = hint;
        }
      }
      state.current = 'PRODUCT_INQUIRY';
      const nextVars = buildVars(state, storeName);
      // Auto-send product video with inquiry response
      const _piMedia = state.product ? { product_id: state.product.id, type: 'video', product_name: state.product.short } : null;
      return { reply: fillTemplate('PRODUCT_INQUIRY', nextVars), state: 'PRODUCT_INQUIRY', _media: _piMedia };
    }

    case 'product_with_order': {
      if (pre.extracted?.product) state.product = pre.extracted.product;

      // Extract details from multi-line message (name, phone, city, address if detailed)
      const pwoDetails = extractDetailsFromMsg(message, state.product?.short);
      if (pwoDetails.name) state.collected.name = pwoDetails.name;
      if (pwoDetails.phone) state.collected.phone = pwoDetails.phone;
      if (pwoDetails.city) state.collected.city = pwoDetails.city;
      if (pwoDetails.address) state.collected.address = pwoDetails.address;
      if (pwoDetails.addressHint) state.addressHint = pwoDetails.addressHint;
      if (pwoDetails.addressParts) {
        const ap = state.collected.address_parts;
        if (pwoDetails.addressParts.area && !ap.area) ap.area = pwoDetails.addressParts.area;
        if (pwoDetails.addressParts.street && !ap.street) ap.street = pwoDetails.addressParts.street;
        if (pwoDetails.addressParts.house && !ap.house) ap.house = pwoDetails.addressParts.house;
        if (pwoDetails.addressParts.landmark && !ap.landmark) ap.landmark = pwoDetails.addressParts.landmark;
        if (pwoDetails.addressParts.tehsil) ap.tehsil = pwoDetails.addressParts.tehsil;
        if (pwoDetails.addressParts.zilla) ap.zilla = pwoDetails.addressParts.zilla;
      }
      // "mobile nomber ye he hai" / "yehi ha whatsapp wala" → use WhatsApp number
      if (!state.collected.phone && !pwoDetails.phone) {
        const useThisNum = /\b(yehi|yahi|yhi|isi|issi|same)\s*(number|no|nmbr|nomber)\b/i.test(message) ||
          /\b(number|nomber|nmbr|mobile)\s*(yehi|yahi|yhi|ye|yeh)\s*(he|hai|h)\b/i.test(message) ||
          /\bjis\s*(se|number|no)\s*(baat|msg|message|chat)\b/i.test(message) ||
          /\b(mobile|phone)\s*(nomber|number|nmbr)?\s*(ye|yeh|yehi|yahi)?\s*(he|hai|h)\s*(he|hai|h)?\b/i.test(message) ||
          /\b(yehi|yahi|yhi|ye|yeh)\s*(he|hai|ha|h)\s*(whatsapp|watsapp|whats\s*app)\s*(wala|vala|number|no)?\b/i.test(message) ||
          /\b(whatsapp|watsapp)\s*(wala|vala|number|no)?\s*(yehi|yahi|yhi|ye|yeh)?\s*(he|hai|ha|h)\b/i.test(message);
        if (useThisNum && phone) {
          let waPhone = phone;
          if (waPhone.startsWith('92')) waPhone = '0' + waPhone.slice(2);
          const pv = validatePhone(waPhone);
          if (pv.valid) state.collected.phone = pv.phone;
        }
      }
      // Infer city from area as hint — don't auto-set, let bot ask customer
      if (!state.collected.city && (pwoDetails.inferredCity || pwoDetails.addressParts?.area)) {
        const hint = pwoDetails.inferredCity || extractCity(pwoDetails.addressParts?.area);
        if (hint) state._cityHint = hint;
      }

      // Check if we already have details (from smart fill, previous msgs, or current extraction)
      // Skip to next missing field instead of always asking name
      if (state.collected.name || state.collected.phone || state.collected.city ||
          pwoDetails.name || pwoDetails.phone || pwoDetails.city || pwoDetails.address || pwoDetails.addressParts) {
        const nextField = askNextField(state, storeName);
        if (nextField) {
          // Always prepend product price info so customer sees it (even when skipping to phone/city)
          const p = state.product;
          if (p) {
            const priceInfo = `${p.short} — Rs.${p.price.toLocaleString()}. ${p.f1}.\n`;
            nextField.reply = priceInfo + nextField.reply;
          }
          return nextField;
        }
      }

      // No details at all — show product info + ask name (existing behavior)
      state.current = 'COLLECT_NAME';
      const pwoVars = buildVars(state, storeName);
      const tplKey = state.collected.name ? 'PRODUCT_WITH_ORDER_KNOWN_NAME' : 'PRODUCT_WITH_ORDER';
      return { reply: fillTemplate(tplKey, pwoVars), state: state.current };
    }

    case 'order_intent':
    case 'yes': {
      // Product extracted from pre-check → set it and start order collection
      if (state.product) {
        const nextField = askNextField(state, storeName);
        // If customer also asked delivery time ("G karna ha kB tak ajayga"), prepend answer
        if (nextField && pre.extracted?.side_question === 'delivery_time') {
          nextField.reply = fillTemplate('DELIVERY_TIME', vars) + ' ' + nextField.reply;
        }
        return nextField;
      }
      // No product yet → ask which product
      if (pre.intent === 'order_intent' && !state.product) {
        state.current = 'PRODUCT_SELECTION';
        const owpVars = buildVars(state, storeName);
        return { reply: fillTemplate('ORDER_WITHOUT_PRODUCT', owpVars), state: 'PRODUCT_SELECTION' };
      }
      // In template states, handled by handleTemplateState already
      return null;
    }

    case 'no': {
      if (state.current === 'COLLECT_DELIVERY_PHONE') {
        return { reply: fillTemplate('ASK_DELIVERY_PHONE_NEW', vars), state: 'COLLECT_DELIVERY_PHONE' };
      }
      return null;
    }

    case 'number_pick': {
      // Upsell number pick — handled by handleTemplateState
      return null;
    }

    case 'info_before_product': {
      // Customer gave name+phone in PRODUCT_SELECTION (e.g. "Aslam 03452198887")
      // Store the data, then ask for product selection
      if (pre.extracted?.name) state.collected.name = pre.extracted.name;
      if (pre.extracted?.phone) {
        const pv = validatePhone(pre.extracted.phone);
        if (pv.valid) state.collected.phone = pv.phone;
      }
      state.current = 'PRODUCT_SELECTION';
      const honorific = getHonorific(state.collected.name, state.gender);
      const namePrefix = state.collected.name ? `${state.collected.name} ${honorific}` : honorific;
      return {
        reply: `${namePrefix}, shukriya! 😊 Konsa product order karna chahein ge?\n\n${productList()}\n\nNumber ya naam bata dein.`,
        state: 'PRODUCT_SELECTION'
      };
    }

    case 'media_request': {
      // Customer asked for picture/video — flag for webhook to send media
      const mediaProduct = pre.extracted?.product || state.product;
      const mediaType = pre.extracted?.media_type || 'image';
      if (!mediaProduct) {
        // Remember that customer asked for media — so when they name a product next, send media instead of product info
        state._pending_media_type = mediaType;
        return { reply: 'Kis product ki ' + (mediaType === 'video' ? 'video' : 'picture') + ' chahiye? Product ka naam ya number bata dein 😊', state: state.current };
      }
      state._pending_media_type = null;
      // Return special _media flag for webhook to pick up and send media files
      return {
        reply: null,
        state: state.current,
        _media: { product_id: mediaProduct.id, type: mediaType, product_name: mediaProduct.short }
      };
    }

    default:
      return null;
  }
}

// ============= HISTORY MANAGEMENT =============
function clearHistory(phone) {
  return resetConv(normalizePhone(phone));
}

function getHistory(phone) {
  const state = conversations[normalizePhone(phone)];
  return state ? state.messages : [];
}

module.exports = { handleMessage, getHistory, clearHistory, getOrCreateConv, resetConv, clearConv };
