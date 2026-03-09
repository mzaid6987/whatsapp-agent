/**
 * Intent detection: regex/keyword-based, state-aware, priority-ordered
 */
const { detectProduct, extractPhone, extractCity, isRegion, isLikelyName } = require('./extractors');

// ============= INTENT ENUM =============
const INTENT = {
  COMPLAINT: 'COMPLAINT',
  GREETING_SALAM: 'GREETING_SALAM',
  GREETING_CASUAL: 'GREETING_CASUAL',
  PRODUCT_INQUIRY: 'PRODUCT_INQUIRY',
  PRODUCT_WITH_ORDER: 'PRODUCT_WITH_ORDER',
  PRODUCT_WITH_PRICE: 'PRODUCT_WITH_PRICE',
  PRICE_ASK: 'PRICE_ASK',
  ORDER_INTENT: 'ORDER_INTENT',
  YES: 'YES',
  NO: 'NO',
  HAGGLE: 'HAGGLE',
  DELIVERY_QUERY: 'DELIVERY_QUERY',
  TRUST_QUESTION: 'TRUST_QUESTION',
  PRODUCT_LIST: 'PRODUCT_LIST',
  SHOW_MORE: 'SHOW_MORE',
  SAME_NUMBER: 'SAME_NUMBER',
  PHONE_NUMBER: 'PHONE_NUMBER',
  CITY_NAME: 'CITY_NAME',
  REGION_NAME: 'REGION_NAME',
  NAME_TEXT: 'NAME_TEXT',
  THANKS: 'THANKS',
  UNKNOWN: 'UNKNOWN',
};

// ============= PATTERNS =============
const COMPLAINT_WORDS = [
  'kharab','kharaab','toot','broken','defective','return karna','return','refund',
  'galat','wrong','scam','fake','fraud','dhoka','bakwas','pagal','nonsense','wtf',
  'bas karo','bekar','cheat','loot','nakli','naqli','wahiyat','ghatiya','complain',
  'complaint','compliant','complane','toot gaya','kam nahi karta','kaam nahi','band ho gaya','chal nahi raha',
  'damage','damaged'
];

const ORDER_ACTION = ['order','mangwa','mangana','book','lena','lyna','bhej','chahiye','chaiye','chaye'];
const ORDER_CONFIRM = [
  'kardo','kar do','karna','krna','krdo','kr do','kro','kar dein','kr dein',
  'krdein','kardein','de do','dedo','bhej do','bhejdo','bhejo','confirm',
  'mangwana','mangwao','do','dein'
];

function hasOrderIntent(l) {
  return ORDER_ACTION.some(w => l.includes(w)) && ORDER_CONFIRM.some(w => l.includes(w));
}

function hasPriceAsk(l) {
  // Exclude "kitne din" — that's delivery query, not price ask
  if (/kitne\s*din/i.test(l)) return false;
  return /\b(kit[nh][ea]|price|rate|qeemat|kimat|cost|daam|pais[ea])\b/i.test(l);
}

function isYes(l) {
  return /^(ha+n?|ji+|jee|g|yes|ok(ay|k|y)?|done|th[ie]+k|sahi|bilkul|confirm|zaroor|hn|kr\s*do|kardo|krdo|kar\s*do)\s*[.!]?\s*$/i.test(l);
}

function isNo(l) {
  return /^(nahi+|nhi|no|cancel|nope|na+h?|mat|band|nai|rehne\s*do|chor[od]|ni)\s*[.!]?\s*$/i.test(l);
}

function isComplaint(l) {
  return COMPLAINT_WORDS.some(w => l.includes(w));
}

function isHaggle(l) {
  return /\b(discount|mehenga|mehnga|sasta|kam\s*(kar|kr|ho)|offer|deal|budget|zyada\s*hai|bohot\s*mehen|bahut\s*mehen|aur\s*kam|thora\s*kam|price\s*kam)\b/i.test(l);
}

function isGreetingSalam(l) {
  return /\b(a(ssa)?la+[mn]u?\s*(o\s*)?a?la+i?ku?m?|salam|slaam|aoa|slam|w[\s.]*s[\s.]*a|walaikum|w\.?slam)\b/i.test(l);
}

function isGreetingCasual(l) {
  return /^(hi+|hello|hey|helo)\s*(nureva|shrine|alvora|elvora|zenora|ruvenza|nuvenza)?[.!?\s]*$/i.test(l);
}

function isDeliveryQuery(l) {
  return /\b(k[ae]?b\s*(t[ae]?k|aaye?|milega|mile\s*ga|pohch|pohchega|ayga|aye?\s*ga|a[ea]ga|aayega|ayega)|k[ae]?b\s*t[ae]?k|kitne?\s*din|tracking|dispatch|ship|parcel|rider|delivery\s*k[ae]?b|pohch|pahunch|pohanch)\b/i.test(l);
}

function isTrustQuestion(l) {
  return /\b(fake|asli|original|cod|cash\s*on|return\s*policy|exchange\s*policy|warranty|guarantee|kharab\s*nikla|pasand\s*nahi|quality|bharosa|trust|kais[ai]\s*h[ae]i?|kes[iy]\s*h[ae]i?|chez\s*kes|cheez\s*k[ae]s|acha\s*hai|achi\s*hai|kaisi?\s*quality)\b/i.test(l);
}

function isProductList(l) {
  return /\b(products?|items?|dikhao|list|kya\s*kya|menu|catalog|sab\s*dikhao)\b/i.test(l);
}

function isThanks(l) {
  return /\b(shukri?ya|thanks?|jazak|allah\s*hafiz|khuda\s*hafiz|bye|alvida)\b/i.test(l);
}

function isSameNumber(l) {
  return /\b(isi|same|yehi|yahi|wohi|haan?|ji|ha+n)\b/i.test(l);
}

// ============= MAIN INTENT DETECTOR =============
function detectIntent(message, currentState, collected) {
  const msg = message.trim();
  const l = msg.toLowerCase().trim();

  // Priority 1: Complaints (any state) — but not if also trust question
  const complaint = isComplaint(l);
  const trust = isTrustQuestion(l);
  if (complaint && !trust) {
    return { intent: INTENT.COMPLAINT };
  }
  // Both complaint + trust words → treat as trust (less severe, better UX)
  if (complaint && trust) {
    return { intent: INTENT.TRUST_QUESTION };
  }

  // Priority 2: Phone number (state-aware)
  const phone = extractPhone(msg);
  if (phone && ['COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE'].includes(currentState)) {
    return { intent: INTENT.PHONE_NUMBER, data: phone };
  }

  // Priority 3: Product detection (skip in COLLECT_ADDRESS — address text has random words)
  const product = currentState === 'COLLECT_ADDRESS' ? null : detectProduct(msg);

  // Priority 4: State-aware — in COLLECT_NAME, treat as name ONLY if no other intent matches
  if (currentState === 'COLLECT_NAME' && !product && !isComplaint(l) && !isNo(l)) {
    // Skip name detection if message is clearly a question/intent
    const isQuestion = isTrustQuestion(l) || isHaggle(l) || isDeliveryQuery(l) ||
      isGreetingSalam(l) || isGreetingCasual(l) || isProductList(l) || isThanks(l) ||
      /\b(kesi|kaisi|kaisa|kaise|kya|kitne|kitna|k[ae]?b|quality)\b/i.test(l);
    if (!isQuestion && (isLikelyName(msg) || msg.trim().split(/\s+/).length <= 4)) {
      return { intent: INTENT.NAME_TEXT, data: msg.trim() };
    }
  }

  // Priority 5: Product + order intent combined
  if (product && hasOrderIntent(l)) {
    return { intent: INTENT.PRODUCT_WITH_ORDER, product };
  }
  // Product + price ask
  if (product && hasPriceAsk(l)) {
    return { intent: INTENT.PRODUCT_WITH_PRICE, product };
  }
  // Just product mention
  if (product) {
    return { intent: INTENT.PRODUCT_INQUIRY, product };
  }

  // Priority 6: Simple intents
  if (isGreetingSalam(l)) return { intent: INTENT.GREETING_SALAM };
  if (isGreetingCasual(l)) return { intent: INTENT.GREETING_CASUAL };
  if (hasOrderIntent(l)) return { intent: INTENT.ORDER_INTENT };
  if (isDeliveryQuery(l)) return { intent: INTENT.DELIVERY_QUERY };
  if (hasPriceAsk(l) && !currentState.startsWith('COLLECT_')) return { intent: INTENT.PRICE_ASK };
  if (isYes(l)) return { intent: INTENT.YES };
  if (isNo(l)) return { intent: INTENT.NO };
  if (isHaggle(l)) return { intent: INTENT.HAGGLE };

  // Trust question check — but not if it matches complaint words too
  if (isTrustQuestion(l) && !isComplaint(l)) return { intent: INTENT.TRUST_QUESTION };

  if (isProductList(l)) return { intent: INTENT.PRODUCT_LIST };
  if (isThanks(l)) return { intent: INTENT.THANKS };

  // Priority 7: State-specific data extraction
  if (currentState === 'COLLECT_DELIVERY_PHONE') {
    if (isSameNumber(l)) return { intent: INTENT.SAME_NUMBER };
    if (phone) return { intent: INTENT.PHONE_NUMBER, data: phone };
  }

  if (currentState === 'COLLECT_CITY') {
    const regionCheck = isRegion(msg);
    if (regionCheck.isRegion) {
      return { intent: INTENT.REGION_NAME, data: regionCheck.region, examples: regionCheck.examples };
    }
    const city = extractCity(msg);
    if (city) return { intent: INTENT.CITY_NAME, data: city };
    // 1-2 words in COLLECT_CITY → probably a city name (even if not in our list)
    if (msg.trim().split(/\s+/).length <= 2 && /^[A-Za-z\s]+$/.test(msg.trim())) {
      return { intent: INTENT.CITY_NAME, data: msg.trim() };
    }
  }

  // Priority 8: Phone number in any collect state
  if (phone && currentState === 'COLLECT_PHONE') {
    return { intent: INTENT.PHONE_NUMBER, data: phone };
  }

  // Priority 9: UNKNOWN
  return { intent: INTENT.UNKNOWN };
}

module.exports = { INTENT, detectIntent, isYes, isNo, hasOrderIntent, isHaggle, isComplaint };
