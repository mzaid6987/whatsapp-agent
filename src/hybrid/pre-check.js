/**
 * Pre-Check: thin code-based checks that are 100% reliable
 * Runs BEFORE AI call — if matched, skip AI entirely (zero cost)
 *
 * Handles: phone numbers, cities, regions, complaints, yes/no, product numbers
 */

const { extractPhone, validatePhone, extractCity, extractAllCities, isRegion, detectProduct, detectAllProducts, detectRuralAddress } = require('./extractors');
const { PRODUCTS } = require('./data');

// ============= COMPLAINT DETECTION =============
const COMPLAINT_WORDS = [
  'kharab','kharaab','khrab','khraab','toot','broken','defective','return karna','return','refund',
  'galat','wrong','scam','fake','fraud','dhoka','bakwas','pagal','nonsense','wtf',
  'bas karo','bekar','cheat','loot','nakli','naqli','wahiyat','ghatiya','complain',
  'complaint','toot gaya','kam nahi karta','kam nhi karta','kam ni karta',
  'kaam nahi','kaam nhi','kaam ni','band ho gaya','chal nahi raha','chal nhi raha',
  'damage','damaged','replacement','replace','kharab hai','kharab he',
  'receive nhi','receive ni','receive nahi','nhi mila','ni mila','nahi mila',
  'kam ni krta','kam nhi krta','kam nahi krta',
  'kaam ka nahi','kaam ka nhi','kaam ka ni','kam ka nahi','kam ka nhi','kam ka ni',
  'ek bhi kaam','kisi kaam','kisi bhi kaam','kaat nahi','kaat nhi','kaat ni','kaat saka',
  'nuqsan','paise wapas','paisa wapas','paisay wapas',
  'chalta nahi','chalta nhi','chalta ni','chalta hi nahi','chalta hi nhi','chalta hi ni',
  'chalti nahi','chalti nhi','chalti ni','chalti hi nahi','chalti hi nhi','chalti hi ni',
  // Mixed Urdu-English complaint phrases (voice transcription patterns)
  'work nahi','work nhi','work ni','working nahi','working nhi','working ni',
  'work nahi kar','work nhi kar','working nahi kar','working nhi kar',
  'sahi work nahi','sahi working nahi','sahi kam nahi','sahi kaam nahi',
  'sahi nahi chal','sahi nhi chal','sahi ni chal',
  'sahi nahi','sahi nhi','theek nahi','theek nhi','thik nahi','thik nhi',
  'hilta hai','hilta he','hilti hai','hilti he','dhila','dheela',
  'page nahi','missing','toota hua','tuta hua',
  // English complaint phrases
  'not work','not working','doesn\'t work','doesnt work','dont work',
  'not fit','does not fit','doesn\'t fit','stopped working','stop working',
  'not charging','not charge','charger issue','charger problem',
  'sending damage','damage product','faulty','malfunction',
  'not turning on','not turn on','not switching on','issue with'
];

const TRUST_WORDS = /\b(asli|original|cod|cash\s*on|return\s*policy|exchange\s*policy|warranty|guarantee|quality|bharosa|trust|kaisi?\s*quality)\b/i;
// Note: "fake" removed from TRUST_WORDS — it's almost always a complaint, not a trust question
// "achi he na", "theek hogi na ye", "chalegi na", "kaisi hai", "quality kesi he" — quality reassurance questions
// BUT NOT "kam krta he" / "sahi kam krta he" / "works?" — those are product functionality questions (AI handles)
const QUALITY_ASK = /(\b(ach+[ia]|theek|thik|thk|chale\s*g[ia])\b.*\b(hai|he|h|na|hogi|hoga|hain)\b|\bkais[ie]\s*h[ae]i?\b|\bkes[ie]\s*h[ae]i?\b|\bquality\s*(kais[ie]|kes[ie]|kaisi|kesi)\s*(h[ae]i?|he)?\b|\bquality\s*[?؟]\s*$|\bquality\s*(hai|he|h|batao|btao|bta|dikhao)?\s*[?؟]\s*$)/im;
// "kam krta", "kaam karta", "works" — product functionality question, NOT trust
// Covers typos: kryta, krte, krta, krti, kregi, karti, karta etc.
const IS_FUNCTIONALITY_Q = /\b(kam\s*kr[yta]*[aie]?|kaam\s*kr[yta]*[aie]?|kam\s*kar[tae]*[aie]?|kaam\s*kar[tae]*[aie]?|works?|work\s*kart?a?)\b/i;

function isComplaint(l) {
  return COMPLAINT_WORDS.some(w => l.includes(w));
}

// ============= YES / NO DETECTION =============
function isYes(l) {
  return /^(ha+n?|hm+|ji+|jee|g|yes+|yess+|yup|ik|o?k+a*y+|o?ki+|ok\s*ok|o?ok(ay|k|y)?|done|th[ie]*k|tik|sai|sahi|sa[ih]i?|bilkul|c[oa]n?f[iou]r?m(ed)?|comf[io]rm(ed)?|conf?rim(ed)?|zaroor|hn|kr\s*do|kardo|krdo|kar\s*do|bhejwa?\s*d[oae]|bhijwa?\s*d[oae]|mangwa?\s*d[oae]|laga?\s*d[oae])\s*[.!]?\s*$/i.test(l);
}

function isNo(l) {
  return /^(nahi+|nhi|no|cancel|nope|na+h?|mat|band|nai|rehne\s*do|chor[od]|ni)\s*[.!]?\s*$/i.test(l);
}

// ============= MAIN PRE-CHECK =============
/**
 * Returns { intent, extracted, templateKey?, templateVars? } or null
 * null = let AI handle it
 */
function preCheck(message, currentState, collected) {
  const msg = message.trim();
  const l = msg.toLowerCase().trim();

  // 0a. GIBBERISH / JUNK — single dot, random chars, emojis only, etc.
  // Treat as greeting so template responds (no AI cost)
  const isJunk = /^[.\-_,;:!?\s*#+@^~`'"(){}[\]<>\/\\|]+$/.test(msg) || msg.length <= 2;
  if (isJunk && ['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'greeting' };
  }

  // 0b. SPAM DETECTION — messages with URLs from unknown senders = spam/scam
  // Ramzan packages, free data, phishing links etc. — don't waste AI tokens
  const hasUrl = /https?:\/\/|www\.|\.com\b|\.online\b|\.site\b|\.pk\b|\.buzz\b|\.top\b|\.live\b|\.html\b|\.org\b|\.net\b|clkbitz|lnkbits/i.test(l);
  if (hasUrl && ['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'spam' };
  }

  // 0c. PAST ORDER REFERENCE — "maine magayi thi", "maine order kiya tha", "aap se li thi"
  // Past tense = already ordered. If combined with negative words = complaint about existing order
  const isPastOrder = /\b(maine|mene|mne|mny|humne)\s*(aap\s*se\s*|apny|ap\s*sy\s*)?(order|manga|mangi|magayi?|magaya?|magwa[iy]?a?|mangwa[iy]?a?|li[iy]?|lea?|kharid[ia]?|liya?|kia)\s*(th[aie]|tha|thi|hai|he|h)?\b/i.test(l) ||
    /\b(aap\s*se|ap\s*sy|tumse)\s*(order|manga|mangi|magayi?|magaya?|mangwa[iy]?a?|li[iy]?|lea?|kharid[ia]?)\s*(th[aie]|tha|thi|hai|he)?\b/i.test(l) ||
    /\b(pehle|pehly|pahle|pahly|last\s*time)\s*(order|manga|magayi?|magaya?|mangwa[iy]?a?|li[iy]?|lea?|kharid[ia]?)\s*(th[aie]|tha|thi|hai|he)?\b/i.test(l) ||
    /\b(receive|mil[ia]?|mila|aa\s*gaya|agaya|aa\s*gai|agyi|pohch\s*ga[iy]a?)\s*(th[aie]|tha|thi|hai|he|h)\b/i.test(l);

  // Past order + negative/problem context = definitely a complaint
  const hasNegativeContext = /\b(nahi|nhi|ni|problem|masla|issue|kharab|toot|broken|hilta|missing|galat|wrong|defective|damage|working nahi|work nahi|sahi nahi|sahi nhi|band)\b/i.test(l);
  if (isPastOrder && hasNegativeContext) {
    return { intent: 'complaint' };
  }

  // 0d. COLLECT_DELIVERY_PHONE early check — compound voice messages like
  // "haan call receive karlunga ... kharab to nahi hai" start with YES but contain complaint words later
  // Must check BEFORE complaint detection to not lose the delivery phone confirmation
  if (currentState === 'COLLECT_DELIVERY_PHONE') {
    const startsWithYes = /^(ha+n|ji+|jee|g|yes|yup|ok|haan|hn)\b/i.test(l.trim());
    const hasYesWord = /\b(ha+n|ji|yes|yup|ik|ok[zgky]?|haan|hn|g|k|shi|sahi|sa[ih]i?|theek|thik|thk|tik|bilkul|done)\b/i.test(l);
    const hasNoWord = /\b(nahi|nhi|no|nope|na+h|mat|cancel)\b/i.test(l);
    // "krlungi/karlunga/karlungi/krlnga" = "I'll do it" = YES (receive kar lungi/lunga)
    const hasWillDo = /\b(kr\s*lun?g[ia]|kar\s*lun?g[ia]|receive\s*kr|receive\s*kar)\b/i.test(l);
    if (/\b(isi|same|yehi|yahi|wohi)\b/i.test(l) || isYes(l) || /^k+$/i.test(l.trim()) || (hasYesWord && !hasNoWord) || (startsWithYes && hasNoWord) || hasWillDo) {
      return { intent: 'same_phone', extracted: { same_phone: true } };
    }
    if (isNo(l) || (hasNoWord && !hasYesWord && !startsWithYes)) {
      return { intent: 'no' };
    }
  }

  // 1. COMPLAINT — highest priority, any state (but not if also trust question)
  // "kharab to nahi hogi" / "toot to nahi jayegi" = QUESTION about quality, not complaint
  const complaint = isComplaint(l);
  const trust = TRUST_WORDS.test(l);
  const isQualityQuestion = /\b(to\s*nahi|toh?\s*nahi|nahi\s*ho|nhi\s*ho|nahi\s*na|hogi|hoga|jayega|jayegi|sakti|sakta)\b/i.test(l) && complaint;
  // Strong complaint = clearly reporting an issue (past tense, active problem)
  // "sending damage", "not work", "broken hai", "kharab mila", "charger issue" etc.
  // "receive" alone is NOT a complaint — "call receive kar lunga" is normal. Only "receive nhi/nahi" is complaint.
  const strongComplaint = complaint && (/\b(sending|sent|mila|receive[d]?\s*(nahi|nhi|ni|nai)|not work|not fit|broken|damage[d]?\s*product|issue|problem|stopped|charger|band ho|chal nahi|chal nhi|chalt[ai]\s*(hi\s*)?(nahi|nhi|ni)|work\s*nahi|work\s*nhi|working\s*nahi|working\s*nhi|sahi\s*work|sahi\s*kam|sahi\s*nahi|hilta|missing|toota|tuta|kaam\s*ka\s*nahi|kaam\s*ka\s*nhi|kaat\s*nahi|kaat\s*nhi|kaat\s*saka|nuqsan|paise?\s*wapas|paisay?\s*wapas|ek\s*bhi\s*kaam|kisi\s*bhi?\s*kaam)\b/i.test(l) || isPastOrder);
  if (isQualityQuestion && !strongComplaint) {
    return { intent: 'trust_question' };
  }
  if (complaint && (!trust || strongComplaint)) {
    return { intent: 'complaint' };
  }
  if (complaint && trust) {
    return { intent: 'trust_question' };
  }
  // Standalone trust question without complaint — "warranty kitny time ki", "COD hai?", "exchange hota hai?"
  // BUT: "quality?" alone = quality question (not trust) — route to quality_question
  if (trust && !complaint) {
    if (QUALITY_ASK.test(l)) {
      return { intent: 'quality_question' };
    }
    return { intent: 'trust_question' };
  }

  // 1a-x. GREETING FAST-PATH — "kya haal", "kaise ho", "salam" + filler like "theek hai"
  // Must check BEFORE quality_question so "kya haal hain theek hai" isn't caught as quality
  // BUT: if message ALSO contains product/price content, skip greeting → let product detection handle
  const isGreetingPhrase = /\b(kya\s*ha+l|kia\s*ha+l|kesy\s*ho|kaise\s*ho|kaisy\s*ho|kese\s*ho)\b/i.test(l) ||
    (/\b(salam|slaam|salamu|aoa|assalam|walaikum|asalam|aslam)\b/i.test(l) && /\b(theek|thik|thk|tik)\s*(hai|he|h|hain)\b/i.test(l));
  const hasProductOrPriceContent = /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka|trimmer|trimer|order|chahiye|chahea|manga|lena)\b/i.test(l) || detectProduct(msg);
  if (isGreetingPhrase && ['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState) && !hasProductOrPriceContent) {
    if (/\b(salam|slaam|salamu|aoa|assalam|walaikum|asalam|aslam)\b/i.test(l)) return { intent: 'greeting_salam' };
    return { intent: 'greeting_howru' };
  }

  // 1b. QUALITY REASSURANCE — "achi he na", "theek hogi na", "chalegi na", "kaisi hai", "quality kesi he"
  // BUT NOT "kam krta he" — that's a product question, let AI explain with features
  // EXCEPTION: "kam krti he achi" — has BOTH functionality + quality words → quality question wins
  // SKIP: "acha mujy order dena he" — "acha" at start is acknowledgment, not quality question
  // SKIP: In COLLECT_ADDRESS state — "achha yaar idhar block nahi hai" = address info, NOT quality
  // SKIP: If message also has product mention + price question → product_inquiry is better (has features+price)
  const achaAtStart = /^(acha+|accha+|ach+a+|ik|ok|okay)\s+/i.test(l);
  const isAddressState = currentState === 'COLLECT_ADDRESS';
  const qualityHasProduct = detectProduct(msg) && /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka)\b/i.test(l);
  if (QUALITY_ASK.test(l) && !achaAtStart && !isAddressState && !qualityHasProduct) {
    if (!IS_FUNCTIONALITY_Q.test(l)) {
      return { intent: 'quality_question' };
    }
    // Both match — if quality words (achi/theek/chalegi) are present, it's a quality question
    const hasQualityWord = /\b(ach+[ia]|theek|thik|thk|chale\s*g[ia]|quality)\b/i.test(l);
    if (hasQualityWord) {
      return { intent: 'quality_question' };
    }
  }

  // 2. PHONE NUMBER — in phone collection states
  // BUT skip if message looks like bulk info (2+ colon labels) — let section 7d handle it
  const _bulkColonCount = (msg.match(/\b(na+me?|naam|number|phone|nmbr|mohall?ah?|tehsil|zilla|district|address|city|famous\s*jagah?)\s*[:=]/gi) || []).length;
  if (['COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE'].includes(currentState) && _bulkColonCount < 2) {
    // Check raw digit count first — catch too-long numbers BEFORE extractPhone truncates them
    const rawDigits = msg.replace(/[^\d]/g, '');
    if (/^0?3/.test(rawDigits) && rawDigits.length > 11) {
      return { intent: 'phone_invalid', extracted: { error: 'too_long', digits: rawDigits.length } };
    }
    const phone = extractPhone(msg);
    if (phone) {
      const validation = validatePhone(phone);
      if (validation.valid) {
        return { intent: 'phone_given', extracted: { phone: validation.phone } };
      }
      return { intent: 'phone_invalid', extracted: { error: validation.error } };
    }
    // Try raw digits
    const digits = msg.replace(/[\s\-\+]/g, '').match(/\d+/)?.[0];
    if (digits) {
      if (/^03\d{9}$/.test(digits)) {
        return { intent: 'phone_given', extracted: { phone: digits } };
      }
      if (/^3\d{9}$/.test(digits)) {
        return { intent: 'phone_given', extracted: { phone: '0' + digits } };
      }
      if (/^03/.test(digits) && digits.length < 11) {
        return { intent: 'phone_invalid', extracted: { error: 'incomplete' } };
      }
      if (digits.length >= 7) {
        return { intent: 'phone_invalid', extracted: { error: 'format' } };
      }
    }
    // "Yehi ha WhatsApp wala" / "isi number pe" / "same number hai" → use WhatsApp number
    const useWaNumber = /\b(yehi|yahi|yhi|isi|issi|same)\s*(number|no|nmbr|nomber)\b/i.test(l) ||
      /\bnumber\s*(yehi|yahi|yhi)\s*(wala|vala)?\s*(hai|he|h)?\b/i.test(l) ||
      /\b(yehi|yahi|yhi|ye|yeh)\s*(he|hai|ha|h)\s*(whatsapp|watsapp|whats\s*app)\s*(wala|vala|number|no)?\b/i.test(l) ||
      /\b(whatsapp|watsapp)\s*(wala|vala|number|no)?\s*(yehi|yahi|yhi|ye|yeh)?\s*(he|hai|ha|h)\b/i.test(l) ||
      /\b(mobile|phone)\s*(nomber|number|nmbr)?\s*(ye|yeh|yehi|yahi)?\s*(he|hai|h)\b/i.test(l) ||
      /\bjis\s*(se|sy|s|tarah?|tarha?)\s+.*\b(ba+t|msg|message|chat|call)\b/i.test(l) ||
      /\bjisse?\s+.*\b(ba+t|msg|message|chat|call)\b/i.test(l) ||
      /\b(de?\s*diy?a|dy\s*dya|bhej\s*diy?a|bhej\s*dia|send\s*kr\s*d[iy]a?|send\s*kia)\s*(h[ae]?i?|tha)?\b/i.test(l) ||
      /\b(\d+)\s*(dfa|dafa|baar|bar|time)\s*(send|bhej|de|dy)\b/i.test(l) ||
      /\b(kitni|kitne)\s*(dfa|dafa|baar|bar)\s*(number|no|nmbr)?\s*(bhej|send|de|dy)\b/i.test(l) ||
      /\bbataya\s*to\s*number\b/i.test(l) ||
      // Urdu script: "جس سے بات", "یہی نمبر", "یہی والا", "نمبر میرا یہی"
      /جس\s*سے.*بات/u.test(msg) ||
      /یہی\s*(نمبر|والا|ہے|ہی)/u.test(msg) ||
      /نمبر\s*(تو\s*)?(میرا|مرا)\s*(یہی|یہ)/u.test(msg) ||
      /اسی\s*(نمبر|سے)/u.test(msg);
    if (useWaNumber) {
      return { intent: 'use_wa_number' };
    }
  }

  // 3. CITY — in city collection state
  if (currentState === 'COLLECT_CITY') {
    // 3-pre. "yh dono numbers he" / "dono number mere hain" / "both numbers are mine"
    // Customer is clarifying about phone numbers, NOT giving a city. Acknowledge and re-ask city.
    const isDualNumberMsg = /\b(dono|donon|both)\s*(number|no|nmbr|phone)s?\b/i.test(l) ||
      /\b(number|no|nmbr|phone)s?\s*(dono|donon|both)\b/i.test(l) ||
      /\b(yh|ye|yeh)\s*(dono|donon)\s*(number|no|nmbr)?\b/i.test(l);
    if (isDualNumberMsg) {
      return { intent: 'phone_clarification_in_city' };
    }

    // Rural address detection (chak/village/gaon/goth/killi/dhoke/mauza)
    const rural = detectRuralAddress(msg);
    if (rural && rural.isRural) {
      const allCities = extractAllCities(msg);
      if (allCities.length >= 1) {
        // Rural + city mentioned → ask confirmation
        return { intent: 'rural_with_city', extracted: { city: allCities[0], rural_part: rural.ruralPart, rural_type: rural.type } };
      }
      // Rural without city → ask for city/zilla
      return { intent: 'rural_no_city', extracted: { rural_part: rural.ruralPart, rural_type: rural.type } };
    }

    const regionCheck = isRegion(msg);
    if (regionCheck.isRegion) {
      return { intent: 'region_given', extracted: { region: regionCheck.region, examples: regionCheck.examples } };
    }
    // Check for multiple cities
    const allCities = extractAllCities(msg);
    if (allCities.length > 1) {
      return { intent: 'multiple_cities', extracted: { cities: allCities } };
    }
    if (allCities.length === 1) {
      // Check if message also has area info (e.g. "Karachi ke andar Jinnah Square")
      const { matchArea } = require('./city-areas');
      // Remove city name, city abbreviations, and common filler, then check remaining text for known areas
      const cityLower = allCities[0].toLowerCase();
      // Also remove abbreviations that map to this city (e.g., "pindi" for Rawalpindi)
      const { CITY_ABBR } = require('./data');
      const cityAbbrs = Object.entries(CITY_ABBR).filter(([, v]) => v.toLowerCase() === cityLower).map(([k]) => k);
      let remaining = l.replace(new RegExp('\\b' + cityLower + '\\b', 'i'), '');
      for (const abbr of cityAbbrs) {
        remaining = remaining.replace(new RegExp('\\b' + abbr + '\\b', 'i'), '');
      }
      remaining = remaining.replace(/\b(ke|ka|ki|mein|me|mai|andar|dena|hai|he|h|pe|par|wahan|yahan|delivery|bhejo|bhej|do|karni|krni)\b/gi, '').trim();
      if (remaining.length >= 3) {
        const areaInCity = matchArea(remaining, allCities[0]);
        if (areaInCity) {
          return { intent: 'city_given', extracted: { city: allCities[0], area: areaInCity } };
        }
      }
      return { intent: 'city_given', extracted: { city: allCities[0] } };
    }
    // Check if input is a known area (not a city) — e.g., "Malir" is an area in Karachi
    const cleanInput = msg.trim().replace(/\s*(mai|mein|me|m|ka|ki|ke)\s*$/i, '').trim();
    if (cleanInput.length >= 3) {
      const { matchArea } = require('./city-areas');
      const topCities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Peshawar', 'Multan', 'Hyderabad', 'Quetta', 'Gujranwala'];
      for (const tryCity of topCities) {
        const areaMatch = matchArea(cleanInput, tryCity);
        if (areaMatch) {
          return { intent: 'city_given', extracted: { city: tryCity, area: areaMatch } };
        }
      }
    }
    // 1-2 words, all letters → check against ALL_CITIES fuzzy match before accepting
    // Don't blindly accept random text as city (e.g. "laiba" is NOT a city)
    if (msg.split(/\s+/).length <= 2 && /^[A-Za-z\s]+$/.test(msg)) {
      const { ALL_CITIES, CITY_ABBR } = require('./data');
      const inputLower = msg.trim().toLowerCase();
      // Check exact match in ALL_CITIES
      if (ALL_CITIES.includes(inputLower)) {
        return { intent: 'city_given', extracted: { city: msg.trim() } };
      }
      // Check CITY_ABBR
      if (CITY_ABBR[inputLower]) {
        return { intent: 'city_given', extracted: { city: CITY_ABBR[inputLower] } };
      }
      // Not a known city — let AI handle (will ask customer to clarify)
    }
  }

  // 4. DELIVERY PHONE — handled early in section 0d (before complaint detection)

  // 4a-0b. NAME IN MIXED MESSAGE — voice messages often have name + question together
  // "Yaar Sukkur mein kab delivery hogi aur mera naam hai Amjad" → extract name, answer question
  // Must run BEFORE other COLLECT_NAME checks to not lose the name
  if (currentState === 'COLLECT_NAME' && msg.length > 20) {
    const nameInMsg = msg.match(/\b(?:naam|name)\s+(?:hai|he|h|mera|mra)?\s*([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\b/i) ||
      msg.match(/\b(?:mera|mra)\s+(?:naam|name)\s+(?:hai|he|h)?\s*([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\b/i) ||
      msg.match(/\b([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\s+(?:naam|name)\s+(?:hai|he|h)\s+(?:mera|mra)\b/i);
    if (nameInMsg) {
      const rawName = nameInMsg[1].trim();
      // Make sure it's not a common word
      const isCommon = /^(delivery|order|product|price|rate|quality|time|sukkur|lahore|karachi|islamabad|local|number|phone|yaar|bhai|kab|kya|kitna|nahi|haan)$/i.test(rawName);
      if (!isCommon && rawName.length >= 2) {
        const name = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        // Also try to extract city from same message
        const cityInMsg = extractCity(msg);
        const extracted = { name };
        if (cityInMsg) extracted.city = cityInMsg;
        return { intent: 'name_given', extracted };
      }
    }
  }

  // 4a-1. PHONE NUMBER in COLLECT_NAME — customer gives phone before we ask
  // Catch it so it doesn't get lost or go to AI which makes up random responses
  // BUT: if message is long and has city/address → let bulk_info_given handle it (section 7d)
  if (currentState === 'COLLECT_NAME') {
    const phone = extractPhone(msg);
    const isBulkCandidate = msg.length > 30 && (extractCity(msg) !== null || /\b(address|mohall?ah?|gali|street|sector|phase|block|colony|bahria|dha)\b/i.test(l));
    if (phone && !isBulkCandidate) {
      const validation = validatePhone(phone);
      if (validation.valid) {
        return { intent: 'phone_in_name_state', extracted: { phone: validation.phone } };
      }
    }
    // Pure digits that look like phone (only if NOT bulk)
    if (!isBulkCandidate) {
      const digits = msg.replace(/[\s\-\+]/g, '').match(/\d+/)?.[0];
      if (digits && /^0?3\d{9}$/.test(digits)) {
        const normalized = digits.startsWith('3') ? '0' + digits : digits;
        return { intent: 'phone_in_name_state', extracted: { phone: normalized } };
      }
    }
    // "Use this WhatsApp number" in COLLECT_NAME — save phone early
    const useWaInName = /\b(yehi|yahi|yhi|isi|issi|same)\s*(number|no|nmbr|nomber)\b/i.test(l) ||
      /\bnumber\s*(yehi|yahi|yhi)\s*(wala|vala)?\b/i.test(l) ||
      /\bjis\s*(se|sy|s|tarah?|tarha?)\s+.*\b(ba+t|msg|message|chat|call)\b/i.test(l) ||
      /\bjisse?\s+.*\b(ba+t|msg|message|chat|call)\b/i.test(l) ||
      /\b(yehi|yahi|yhi|ye|yeh)\s*(he|hai|ha|h)\s*(whatsapp|watsapp)\b/i.test(l) ||
      /\bbataya\s*to\s*number\b/i.test(l) ||
      /جس\s*سے.*بات/u.test(msg) ||
      /یہی\s*(نمبر|والا|ہے|ہی)/u.test(msg);
    if (useWaInName) {
      return { intent: 'wa_number_in_name_state' };
    }
  }

  // 4a0. DISCOUNT/HAGGLE in COLLECT_NAME — "discount to do", "offer do", "sasta kro"
  // Must catch BEFORE name detection so "discount to do" is not saved as name
  if (currentState === 'COLLECT_NAME') {
    const isDiscountInName = /\b(disc?o?u?n?t|discoutn|disocunt|discont|discoynt|off|offer|sast[aie]|kam\s*kr|km\s*kr|mehn?g[aie])\b/i.test(l);
    if (isDiscountInName) return { intent: 'haggle_in_collection' };
  }

  // 4a. NAME DETECTION in COLLECT_NAME — simple names like "Salman", "Ali Khan" etc.
  // Saves AI call cost for simple name responses
  if (currentState === 'COLLECT_NAME') {
    const trimmed = msg.trim();
    const words = trimmed.split(/\s+/);
    // 1-3 words, all letters (with spaces), 2-40 chars, no numbers, no question/order words
    const looksLikeName = words.length >= 1 && words.length <= 3 &&
      /^[A-Za-z\s.]+$/.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 40;
    const isQuestionWord = /\b(kab|kya|kitna|kitne|kitni|quality|price|rate|order|delivery|kaise|kaisy|kesy|product|hai|he|ha|nahi|nhi|cancel|complaint|return|salam|hello|hi|hey|aoa|discount|discont|discoutn|offer|sasta|mehenga|exchange|refund|cod|cash|free|payment|dedo|kardo|krdo|chahiye|chahie|mangta|bhejo|trimmer|cutter|remover|nebulizer|duster|spray)\b/i.test(l);
    const isCommonNonName = /^(ok+|okay|acha+|theek|thik|hmm+|hm+|g|k|jee?|ji|yes|yup|yep|yeah|no|nahi|nhi|done|cancel|sahi|bilkul|confirm)\s*[.!]?\s*$/i.test(l);
    const isAddressLabel = /^(address|city|phone|number|mobile|area|mohalla|colony|gali|street|house|flat|landmark)\s*$/i.test(l);
    // Check if text matches a product keyword — "baal katny vala" is product demand, not name
    const isProductKeyword = detectProduct(msg) !== null;
    // Frustration/conversation phrases that look like names — "btaya to", "bata dia", "pehle bataya"
    const isFrustration = /^(btaya|bata|bta)\s*(to|toh?|dia|diya|tha|thi|na|he|hai|h)\s*$/i.test(l) ||
      /^(pehle|phle|pehly|already)\s*(bata|btaya|bta|likha|told|given|sent|dia)\s*(to|tha|thi|na|he|hai|h)?\s*$/i.test(l) ||
      /^(upar|opar|oper)\s*(likh|dekh|bata|btaya)\s*(he|hai|h|a|dia)?\s*$/i.test(l);
    // Product qualifier patterns — "larkio vala", "ladies wala", "chota wala", "gents ka" = NOT a name
    const isProductQualifier = /\b(wal[aie]|val[aie]|ke\s*li[ey]e?|ka|ki)\s*$/i.test(l) &&
      /\b(lark[ioy]+|ladki|ladies|lady|gents|boys?|girls?|men|women|chot[aie]|bar[aie]|sast[aie]|mehn?g[aie]|ach[aie]|nay[aie]|puran[aie])\b/i.test(l);
    if (looksLikeName && !isQuestionWord && !isCommonNonName && !isAddressLabel && !isProductKeyword && !isFrustration && !isProductQualifier) {
      // Capitalize properly
      const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { intent: 'name_given', extracted: { name } };
    }
  }

  // 4b0. ADDRESS CORRECTION — "X me nhi dena Y pe chahea" / "X nahi Y hai"
  // Customer correcting wrong area/city — let AI handle it (has all context)
  if (currentState === 'COLLECT_ADDRESS') {
    const isCorrection = /\b(nhi|nahi|na|ni)\s*(dena|den|bhejo|bhej|lagao|karo|rakh|he|hai)\b/i.test(l) &&
      /\b(chahea|chahiye|chaiye|dena|den|bhejo|pe|par|me|mein|wala|vala)\b/i.test(l) && msg.length > 20;
    if (isCorrection) {
      return null; // Let AI handle — it has full context to understand correction
    }
  }

  // 4b1. "ALREADY TOLD" in COLLECT_ADDRESS — "btaya to", "bata dia", "bas itna", "upar likha he"
  // Customer frustrated repeating — accept what we have, fill missing with nahi_pata
  if (currentState === 'COLLECT_ADDRESS') {
    const isAlreadyTold = /\b(btaya|bata\s*di[ay]?|bta\s*di[ay]?|likh[a]?\s*(he|hai|h|dia|diya)|upar\s*(likh|he|hai|dekh)|pehle\s*(bata|btaya|likha)|already\s*(told|given|sent))\b/i.test(l) ||
      /\b(bas\s*(itna|yahi|yehi|bs)|itna\s*(he|hai|h|bas)|yahi\s*(he|hai|h)|ho\s*gaya|enough|kafi)\b/i.test(l) ||
      /\b(rider\s*(call|puch|samajh)|aa\s*k[ae]r?\s*(puch|dekh|mil))\b/i.test(l);
    if (isAlreadyTold) {
      return { intent: 'address_enough' };
    }
  }

  // 4b. ACKNOWLEDGMENT in collection states — "ok", "acha", "theek", "hmm" → re-ask current field
  // Also: "order krna he", "order karna hai" during collection = just acknowledging, re-ask field
  if (['COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_CITY', 'COLLECT_ADDRESS', 'COLLECT_DELIVERY_PHONE'].includes(currentState)) {
    const isAck = /^(ik|ok+|okay|acha+|ach+a|theek|thik|thk|tik|hmm+|hm+|g|k|jee?|ji|samajh\s*(aa?\s*ga[yi]?|aa?\s*gai)?)\s*[.!]?\s*$/i.test(l);
    if (isAck) return { intent: 'acknowledgment' };
    // "order krna he", "order karo", "haan order krna" = ack during collection (product already set)
    const isOrderAck = collected.product && /\b(order\s*(kr|kar|kro|karo|krna|karna|krdo|kardo|krn?a?\s*(hai|he|h|chahta|chahti)?)|haan?\s*order)\b/i.test(l) && l.trim().split(/\s+/).length <= 5;
    if (isOrderAck) return { intent: 'acknowledgment' };
    // Product qualifier in COLLECT_NAME — "larkio vala", "ladies wala" = product clarification, not name
    if (currentState === 'COLLECT_NAME') {
      const isProdQual = /\b(wal[aie]|val[aie]|ke\s*li[ey]e?|ka|ki)\s*$/i.test(l) &&
        /\b(lark[ioy]+|ladki|ladies|lady|gents|boys?|girls?|men|women|chot[aie]|bar[aie]|sast[aie]|mehn?g[aie]|ach[aie]|nay[aie]|puran[aie])\b/i.test(l);
      if (isProdQual) return { intent: 'product_qualifier', extracted: { text: msg.trim() } };
    }
    // Product keyword in COLLECT_NAME = customer describing demand ("baal katny vala"), not name
    // If same product already set → ack, if different → product switch
    if (currentState === 'COLLECT_NAME' && collected.product) {
      const prodMatch = detectProduct(msg);
      if (prodMatch) {
        if (prodMatch.short === collected.product || prodMatch.short === collected.product?.short) {
          return { intent: 'acknowledgment' }; // same product, re-ask name
        }
        // Different product — switch
        return { intent: 'product_with_order', extracted: { product: prodMatch } };
      }
    }
  }

  // 5. PRODUCT NUMBER PICK — in selection/upsell states
  if (['PRODUCT_SELECTION', 'UPSELL_SHOW'].includes(currentState)) {
    const numMatch = l.match(/^(\d{1,2})$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (currentState === 'UPSELL_SHOW') {
        // Upsell uses candidate list, handled by state machine
        return { intent: 'number_pick', extracted: { index: idx } };
      }
      if (idx >= 0 && idx < PRODUCTS.length) {
        return { intent: 'product_selected', extracted: { product: PRODUCTS[idx] } };
      }
    }
  }

  // 6. YES/NO — for template-only states (ORDER_SUMMARY, UPSELL_HOOK, etc.)
  // Flexible matching: "haan confirm kardo", "ji bilkul" etc. should all work
  if (['ORDER_SUMMARY', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED'].includes(currentState)) {
    // ORDER_CONFIRMED: cancel request → direct to state machine cancel handler
    if (currentState === 'ORDER_CONFIRMED') {
      const isCancelReq = /\b(cancel|cancl|cance?l|cansel)\b/i.test(l) ||
        /\b(order\s*)?(band|khatam|wapis|wapas|vapas|vapsi|return)\s*(kr|kar|karo|krdo|kardo|krna|karna)?\b/i.test(l) ||
        /\b(nahi|nhi|ni)\s*(chahiye|chaiye|mangta|manga)\b/i.test(l) ||
        /\bmat\s*(bhej|send|ship)\b/i.test(l);
      if (isCancelReq) return { intent: 'cancel_order' };
    }
    const hasYesWord = /\b(ha+n|ji|yes|yup|shi|sahi|sa[ih]i?|bilkul|confir\w*|ik|ok|done|theek|thik|thk|tik|zaroor|kr\s*do|kardo|krdo|kar\s*do|bhej\s*d[oae]|bhejd[oae]|bhij\s*d[oae]|bhijd[oae]|bhaj\s*d[oae]|bhajd[oae]|bhwj\s*d[oae]|bhwjd[oae]|bhjdo|bhjd[oae])\b/i.test(l);
    const hasNoWord = /\b(nahi|nhi|no|galat|nope|na+h|mat|cancel|rehne\s*do)\b/i.test(l);
    if (hasYesWord && !hasNoWord) return { intent: 'yes' };
    if (hasNoWord && !hasYesWord) return { intent: 'no' };
    if (isYes(l)) return { intent: 'yes' };
    if (isNo(l)) return { intent: 'no' };
  }

  // 7. Order intent WITHOUT product mention (product already set in state)
  // "order kardo", "theek hai kardo", "haan order kar do", "theek hai haan karo" etc.
  if (['PRODUCT_INQUIRY', 'HAGGLING'].includes(currentState)) {
    // Price negotiation patterns — MUST check BEFORE yes detection
    // "sirf 5%", "bas itna", "1000 ki de do", "km kro", "aur km", "itna kam"
    const isPriceNegotiation = /\b(sirf|bas|itna)\s*\d/i.test(l) ||
      /\d+\s*(ki|me|mein|mey|mai|ka|rupay?|rs)\s*(de|do|dedo|de\s*do|kr|kro)/i.test(l) ||
      /\d+\s*(krdo|kr\s*do|kardo|kar\s*do|de\s*do|dedo|ka\s*krdo|ka\s*kardo)\b/i.test(l) ||
      /\b(aur|or|thora|thoda|mazeed)\s*(km|kam|discount|off)\b/i.test(l) ||
      /\b(itna\s*(km|kam|hi)|bohot?\s*(km|kam)|zya+da\s*(km|kam))\b/i.test(l);
    if (isPriceNegotiation && currentState === 'HAGGLING') {
      return { intent: 'haggle' };
    }

    const hasOrderAction = /\b(order|mangwa|mangana|book|chahiye|chaiye|chaye|chahea|chahye|chaea|chahe)\b/i.test(l);
    const hasOrderConfirm = /\b(kardo|kar\s*do|karna|krna|krdo|kr\s*do|kro|karo|kar|de\s*do|dedo|bhej\s*do|bhejdo|bhejwa\s*do|bhijwa\s*do|bhejwao|confirm|mangwao|mangwana)\b/i.test(l);
    const hasYesWord = /\b(ha+n|ji|yes|yup|theek|thik|thk|tik|ik|ok|done|bilkul|sahi|acha|accha|achha)\b/i.test(l);
    if ((hasOrderAction && hasOrderConfirm) || (hasYesWord && hasOrderConfirm)) {
      // Extract product + city from same message so we don't lose them
      const oiProduct = detectProduct(msg);
      const oiCity = extractCity(msg);
      const oiExtracted = {};
      if (oiProduct) oiExtracted.product = oiProduct.short, oiExtracted.product_name = oiProduct.name;
      if (oiCity) oiExtracted.city = oiCity;
      return { intent: 'order_intent', extracted: oiExtracted };
    }
    // Flexible yes in PRODUCT_INQUIRY or HAGGLING = wants to order
    // Multi-word like "theek hai haan karo", "ok done", "bilkul theek"
    // BUT NOT functionality questions: "sahi kam krta he", "theek kaam karta hai"
    const flexYes = hasYesWord && !/\b(nahi|nhi|no|galat|nope|na+h|mat|cancel)\b/i.test(l);
    if ((isYes(l) || flexYes) && !IS_FUNCTIONALITY_Q.test(l)) {
      return { intent: 'yes' };
    }
  }

  // 7b. DELIVERY CHARGE/COST question — "delivery ke paise?", "delivery free hai?", "shipping charges?"
  const isDeliveryChargeQ = /\b(delivery|shipping|courier)\s*(ke|ki|ka|k|ky)?\s*(pais[ey]|charg[ei]s?|chages?|cost|rate|kitne?|free|muft|patsy)\b/i.test(l) ||
    /\b(pais[ey]|charg[ei]s?|chages?|cost|patsy)\s*(delivery|shipping)\b/i.test(l) ||
    /\b(delivery|shipping)\s*(free|muft)\s*(hai|he|h)?\b/i.test(l) ||
    /\bfree\s*(delivery|shipping)\b/i.test(l) ||
    /\bdelivery\b.*\b(patsy|paise|paisy|free|muft|charg|chage)\b/i.test(l) ||
    /\b(delivery|shipping)\s*(kia|kya|kaise|kaisy|kitni|kitny|kab)\s*(hai|ha|he|h|hoti|hogi)?\b/i.test(l) ||
    /\bdelivery\s*\?\s*$/i.test(l) ||
    /\bdelivery\s+chag/i.test(l);
  if (isDeliveryChargeQ) {
    return { intent: 'delivery_charge_question' };
  }

  // 7b2. DELIVERY TIME question — "kb tk ayga?", "kitne din lagenge", "kab milega"
  const isDeliveryTimeQ = /\b(k[ae]?b\s*(t[ae]?k|aaye?|milega|ayga|ajayga|ajaye?ga|aye?\s*ga|pohch|pohnch))\b/i.test(l) ||
    /\b(kitne?\s*(din|days?|waqt|time))\b/i.test(l) ||
    /\b(kab\s*(aaye|milega|ayega|ayga|ajayga|ajaye?ga|pohchega|deliver))\b/i.test(l) ||
    /\b(delivery\s*(time|din|days?|kitne?|kab|kb))\b/i.test(l) ||
    /\b(kb\s*tk\s*(ayga|aayga|ajayga|ajaye?ga|milega|pohchega)?)\b/i.test(l) ||
    /\b(parcel|order)\s*(kab|kb)\s*(aaye?ga|ajaye?ga|milega|pohche?ga)?\b/i.test(l);
  if (isDeliveryTimeQ) {
    // Check if message ALSO has order intent — "order karna hai ... kab tak ayega"
    const hasOrderWords = /\b(order|mangwa|chahiye|chahea|krna|karna|krdo|kardo|kar\s*do|book)\b/i.test(l);
    const hasYesOrOrder = /\b(ha+n|ji|yes|g|ok|theek|thik|kardo|kar\s*do|kro|karo|krna|karna|krdo)\b/i.test(l);
    // If message has order intent words + delivery question → prioritize order (any state)
    if (hasOrderWords && /\b(order|mangwa|chahiye|chahea)\b/i.test(l)) {
      const dtCity = extractCity(msg);
      const dtProduct = detectProduct(msg);
      const dtExtracted = { side_question: 'delivery_time' };
      if (dtCity) dtExtracted.city = dtCity;
      if (dtProduct) { dtExtracted.product = dtProduct.short; dtExtracted.product_name = dtProduct.name; }
      return { intent: 'order_intent', extracted: dtExtracted };
    }
    if (['PRODUCT_INQUIRY', 'HAGGLING'].includes(currentState) && hasYesOrOrder) {
      return { intent: 'order_intent', extracted: { side_question: 'delivery_time' } };
    }
    // Try to extract city from delivery question — "Sukkur mein kab delivery hogi"
    const dtCity = extractCity(msg);
    return { intent: 'delivery_time_question', extracted: dtCity ? { city: dtCity } : {} };
  }

  // 7c. CITY DELIVERY QUESTION — in COLLECT_ADDRESS, customer mentions a DIFFERENT city
  // "Or Gujrat me?", "Gujrat me delivery krty?", "Lahore me bhi hoti?" etc.
  if (currentState === 'COLLECT_ADDRESS') {
    const allCities = extractAllCities(msg);
    if (allCities.length >= 1) {
      const currentCity = (collected.city || '').toLowerCase();
      const otherCity = allCities.find(c => c.toLowerCase() !== currentCity);
      if (otherCity) {
        // Different city mentioned during address collection = asking about that city
        return { intent: 'city_delivery_question', extracted: { asked_city: otherCity, current_city: collected.city } };
      }
    }
  }

  // 7d2. PRODUCT REASSURANCE — customer asks "kaam krti he?", "chalti hai?", "achi hai?" during any state
  // These are product functionality questions — answer with reassurance + continue current flow
  {
    const isProductReassurance = /\b(ka+m|kaam|kam|work|wrk)\s*(to|toh?)?\s*(kr|kar|karti|krti|karta|krta|krte|karte|krega|karegi|kregi)\s*(he|hai|ha|h|na)?\s*(na)?\s*[\?]?\s*$/i.test(l) ||
      /\b(chal|chalt[ie]|chale?gi)\s*(he|hai|ha|h|na)?\s*(na)?\s*[\?]?\s*$/i.test(l) ||
      /\b(ach[ia]|achi|acha|theek|thik|sahi)\s*(he|hai|ha|h|hoti|hogi)?\s*(na)?\s*[\?]?\s*$/i.test(l) ||
      /\b(quality|qlty)\s*(kais[ie]|kesi|kaisi)\s*(he|hai|ha|h)?\b/i.test(l) ||
      /\b(original|asli|real|naqli|fake|copy)\s*(he|hai|ha|h|to|toh?)?\b/i.test(l) ||
      /\b(wark|wrk|work)\s*(krt[ie]|karti|karta)\s*(he|hai|h)?\b/i.test(l);
    // Skip if message also has product + price content → product_inquiry is more useful
    const reassHasProduct = detectProduct(msg) && /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka)\b/i.test(l);
    if (isProductReassurance && !reassHasProduct) {
      return { intent: 'product_reassurance' };
    }
  }

  // 7d. BULK ORDER INFO — customer sends all details at once with labels
  // "name: X, number: Y, address: Z" → extract fields, skip greeting/yes/no detection
  {
    const hasNameField = /\b(na+me?|naam)\b/i.test(l);
    const hasPhoneField = /\b(number|phone|mobile|whatsapp|nmbr|nomber)\b/i.test(l);
    const hasAddressField = /\b(address|city|mohall?ah?|tehsil|tahseel|zilla|zilah|district|gali|street|sector|famous\s*jagah?|mashh?oor)\b/i.test(l);
    // Also check if a known city name is in the message (even without "city:" label)
    const hasCityInMsg = extractCity(msg) !== null;
    const fieldsMentioned = [hasNameField, hasPhoneField, hasAddressField || hasCityInMsg].filter(Boolean).length;

    // Also detect colon-labeled format: "name:X\nnumber:Y\nmohallah:Z"
    const hasColonLabels = (msg.match(/\b(na+me?|naam|number|phone|nmbr|mohall?ah?|tehsil|zilla|district|address|city|famous\s*jagah?)\s*[:=]/gi) || []).length >= 2;

    // Also: phone number + known city + long message = bulk info (e.g. "03452198887 faisalabad tariqabad jhumra road")
    const hasPhone = extractPhone(msg) !== null;
    const bulkByContent = hasPhone && hasCityInMsg && msg.length > 30;

    if ((fieldsMentioned >= 2 || hasColonLabels || bulkByContent) && msg.length > 30 && currentState !== 'COLLECT_ADDRESS') {
      const extracted = {};

      // Name — parenthesized name like (sultan) OR "name:eman" / "name: eman" colon format
      const parenName = msg.match(/\(([A-Za-z\s]{2,30})\)/);
      if (parenName) extracted.name = parenName[1].trim();
      if (!extracted.name) {
        const colonName = msg.match(/\b(?:na+me?|naam)\s*[:\.\-="']\s*"?\s*([A-Za-z\s]{2,30})/i);
        if (colonName) extracted.name = colonName[1].trim().replace(/["']+$/, '').split(/\n/)[0].trim();
      }
      // Name before phone number — "Sardar Shaukat 03001234567 address here..."
      // Match 1-3 capitalized words right before phone number
      if (!extracted.name) {
        const nameBeforePhone = msg.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:\+?92|0)3\d{9}/);
        if (nameBeforePhone) {
          const candidateName = nameBeforePhone[1].trim();
          const isNotName = /^(Office|Ground|Floor|Plaza|Block|House|Flat|Street|Road|Colony|Phase|Sector|Near|Punjab|Sindh|KPK|Balochistan|Spring|North|South|East|West)$/i.test(candidateName.split(/\s+/).pop());
          if (!isNotName && candidateName.length >= 3) {
            extracted.name = candidateName;
          }
        }
      }
      // Multi-line: first line may be name if it's 1-4 alpha words (not phone/address/city)
      // e.g. "Mujammad zaid\n03705938753\nJamia milia multan"
      if (!extracted.name) {
        const lines = msg.split(/\n/).map(ln => ln.trim()).filter(Boolean);
        if (lines.length >= 2) {
          const firstLine = lines[0];
          const isAlphaName = /^[A-Za-z\s]{2,40}$/.test(firstLine) && firstLine.split(/\s+/).length <= 4;
          const isNotAddress = !/\b(address|office|house|flat|block|street|gali|phase|sector|road|colony|plot|floor|plaza|near|bahria|dha|cantt|gulberg|model)\b/i.test(firstLine);
          const isNotCity = extractCity(firstLine) === null;
          const isNotPhone = !/\d{4,}/.test(firstLine);
          if (isAlphaName && isNotAddress && isNotCity && isNotPhone) {
            extracted.name = firstLine;
          }
        }
      }
      // Name after phone number — "03001234567 Ali Khan, address here..."
      // Match 1-2 capitalized words right after phone, followed by comma (simple reliable pattern)
      if (!extracted.name) {
        const nameAfterPhone = msg.match(/(?:\+?92|0)3\d{9}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,/);
        if (nameAfterPhone) {
          const candidateName = nameAfterPhone[1].trim();
          const isNotName = /^(Office|Ground|Floor|Plaza|Block|House|Flat|Street|Road|Colony|Phase|Sector|Near|Punjab|Sindh|KPK|Balochistan)$/i.test(candidateName);
          if (!isNotName && candidateName.length >= 3) {
            extracted.name = candidateName;
          }
        }
      }

      // Phone — "yehi/yhi whatsapp wala" = use customer's WhatsApp number
      const useWa = /\b(yehi|yahi|yhi|isi|same)\s*(number|no|nmbr|nomber|whatsapp|watsapp)\b/i.test(l) ||
        /\b(whatsapp|watsapp)\s*(wala|vala)\s*(number|no)?\b/i.test(l) ||
        /\byhi\s*(he|hai|ha|h)\b/i.test(l);
      if (useWa) extracted.use_wa_number = true;
      // Also try extracting explicit phone
      const bulkPhone = extractPhone(msg);
      if (bulkPhone) {
        const v = validatePhone(bulkPhone);
        if (v.valid) extracted.phone = v.phone;
      }

      // City
      const bulkCity = extractCity(msg);
      if (bulkCity) extracted.city = bulkCity;

      // Address text — "address:", "mohallah:", "gali:", etc. (separator REQUIRED to avoid matching "address pe bhi call")
      const addrMatch = msg.match(/\baddress\s*[:\.\-=]\s*(.+)/i);
      if (addrMatch) extracted.address_text = addrMatch[1].trim().split(/\n/)[0].trim();

      // Mohallah/area — build address from labeled fields
      const addressParts = [];
      const mohallahMatch = msg.match(/\b(?:mohall?ah?|area|muhall?ah?|gali|street|sector)\s*[:\.\-=]\s*(.+)/i);
      if (mohallahMatch) addressParts.push(mohallahMatch[1].trim().split(/\n/)[0].trim());
      if (addressParts.length > 0 && !extracted.address_text) {
        extracted.address_text = addressParts.join(', ');
      }

      // Common misspellings → correct city/town names
      const cityAliases = {
        'attack': 'Attock', 'atak': 'Attock', 'atock': 'Attock', 'attak': 'Attock',
        'lhr': 'Lahore', 'lahore': 'Lahore', 'lahor': 'Lahore',
        'isb': 'Islamabad', 'islamabad': 'Islamabad', 'islmabad': 'Islamabad',
        'rwp': 'Rawalpindi', 'rawalpindi': 'Rawalpindi', 'pindi': 'Rawalpindi',
        'khi': 'Karachi', 'karachi': 'Karachi', 'krachi': 'Karachi',
        'fsd': 'Faisalabad', 'faisalabad': 'Faisalabad', 'lyallpur': 'Faisalabad',
        'multan': 'Multan', 'mtn': 'Multan',
        'peshawar': 'Peshawar', 'peshawer': 'Peshawar',
        'quetta': 'Quetta', 'qta': 'Quetta',
        'gujranwala': 'Gujranwala', 'gujrat': 'Gujrat',
        'sialkot': 'Sialkot', 'skt': 'Sialkot',
        'hyderabad': 'Hyderabad', 'hyd': 'Hyderabad',
        'bahawalpur': 'Bahawalpur', 'bwp': 'Bahawalpur',
        'sargodha': 'Sargodha', 'sahiwal': 'Sahiwal',
        'mardan': 'Mardan', 'abbottabad': 'Abbottabad', 'swat': 'Swat',
        'fatha jang': 'Fateh Jang', 'fateh jang': 'Fateh Jang', 'fatehjang': 'Fateh Jang',
        'fatah jang': 'Fateh Jang', 'fateha jang': 'Fateh Jang',
      };
      const normalizeCity = (raw) => cityAliases[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);

      // Tehsil = actual town (delivery city). Zilla = district (goes in address).
      const tehsilMatch = msg.match(/\b(?:tehsil|tahseel|tehseel)\s*[:\.\-=]\s*(.+)/i);
      const zillaMatch = msg.match(/\b(?:zilla|zilah|district)\s*[:\.\-=]\s*(.+)/i);

      if (tehsilMatch && zillaMatch) {
        // Both given: tehsil is city, zilla is district (add to address)
        const tehsilRaw = tehsilMatch[1].trim().split(/\n/)[0].trim();
        const zillaRaw = zillaMatch[1].trim().split(/\n/)[0].trim();
        extracted.city = normalizeCity(tehsilRaw);
        extracted.district = normalizeCity(zillaRaw);
        // Prepend "Tehsil X" to address for context
        if (extracted.address_text) {
          extracted.address_text += ', District ' + extracted.district;
        }
      } else if (tehsilMatch) {
        // Only tehsil: use as city
        const tehsilRaw = tehsilMatch[1].trim().split(/\n/)[0].trim();
        extracted.city = normalizeCity(tehsilRaw);
      } else if (zillaMatch) {
        // Only zilla: use as city
        const zillaRaw = zillaMatch[1].trim().split(/\n/)[0].trim();
        if (!extracted.city) extracted.city = normalizeCity(zillaRaw);
      }

      // City label — "city:" (explicit city label overrides tehsil/zilla)
      if (!extracted.city) {
        const cityMatch = msg.match(/\bcity\s*[:\.\-=]\s*(.+)/i);
        if (cityMatch) {
          extracted.city = normalizeCity(cityMatch[1].trim().split(/\n/)[0].trim());
        }
      }

      // Landmark — "nezd/near/nazdeek/pass" OR "famous jagah:" label
      const landmarkMatch = msg.match(/\b(nezd|near|nazdeek|nazdik|qareeb|pass|nzd)\s+(.+?)(?:\.{2,}|$)/im);
      if (landmarkMatch) extracted.landmark = landmarkMatch[2].trim();
      if (!extracted.landmark) {
        const famousMatch = msg.match(/\b(?:famous\s*jagah?|mashh?oor\s*jagah?|landmark)\s*[:\.\-=]\s*(.+)/i);
        if (famousMatch) extracted.landmark = famousMatch[1].trim().split(/\n/)[0].trim();
      }

      // Free-text address — check both BEFORE and AFTER city name
      // Standard format: "Phone Name Address, City, Province" (address BEFORE city)
      // Alt format: "City address details" (address AFTER city)
      // Province names to strip from address
      const PROVINCES = /\b(punjab|sindh|sind|kpk|khyber\s*pakhtunkhwa|balochistan|baluchistan|islamabad\s*capital\s*territory|ict|azad\s*kashmir|gilgit\s*baltistan|gb)\b/i;

      if (extracted.city && !extracted.address_text) {
        const cityLower = extracted.city.toLowerCase();
        const cityIdx = l.indexOf(cityLower);
        if (cityIdx >= 0) {
          // Try BEFORE city first — "Sardar Builders, Office No. 1, ..., Rawalpindi, Punjab"
          let beforeCity = msg.substring(0, cityIdx).trim();
          // Remove phone number from before-city text
          beforeCity = beforeCity.replace(/(?:\+?92|0)3\d{9}/g, '').trim();
          // Remove extracted name from before-city text
          if (extracted.name) {
            beforeCity = beforeCity.replace(new RegExp('\\b' + extracted.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '').trim();
          }
          // Remove name labels
          beforeCity = beforeCity.replace(/\b(?:na+me?|naam)\s*[:\.\-="']\s*"?[A-Za-z\s]{1,30}"?\s*/gi, '').trim();
          // Remove number/phone labels
          beforeCity = beforeCity.replace(/\b(?:number|phone|mobile|nmbr|nomber)\s*[:\.\-="']?\s*\d*/gi, '').trim();
          // Clean leading/trailing commas, dots, spaces
          beforeCity = beforeCity.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
          beforeCity = beforeCity.replace(/\s{2,}/g, ' ').trim();

          if (beforeCity.length > 4 && /[a-z]{2,}/i.test(beforeCity)) {
            extracted.address_text = beforeCity;
          }

          // Also try AFTER city — "faisalabad tariqabad main jhumra road"
          if (!extracted.address_text) {
            let afterCity = msg.substring(cityIdx + cityLower.length).trim();
            afterCity = afterCity.replace(/^[,.\s]+/, '').trim();
            afterCity = afterCity.replace(/\b0[3]\d{9}\b/g, '').trim();
            afterCity = afterCity.replace(/\b(?:na+me?|naam)\s*[:\.\-="']\s*"?[A-Za-z\s]{1,30}"?\s*/gi, '').trim();
            afterCity = afterCity.replace(/\b(?:number|phone|mobile|nmbr|nomber)\s*[:\.\-="']?\s*\d*/gi, '').trim();
            // Strip province names
            afterCity = afterCity.replace(PROVINCES, '').trim();
            afterCity = afterCity.replace(/^[,.\s]+|[,.\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
            if (afterCity.length > 4 && /[a-z]{2,}/i.test(afterCity)) {
              extracted.address_text = afterCity.replace(/[,.\n]+$/, '').trim();
            }
          }

          // Strip province from address_text if present
          if (extracted.address_text) {
            extracted.address_text = extracted.address_text.replace(PROVINCES, '').replace(/^[,.\s]+|[,.\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
          }
        }
      }

      // Product — "trimer chahea", "facial remover" etc. in bulk message
      const bulkProduct = detectProduct(msg);
      if (bulkProduct) extracted.product = bulkProduct;

      // Strip name from address_text if name was detected (prevent name polluting address)
      if (extracted.name && extracted.address_text) {
        const nameRegex = new RegExp('\\b' + extracted.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        extracted.address_text = extracted.address_text.replace(nameRegex, '').replace(/^[\s,.\-]+/, '').replace(/[\s,.\-]+$/, '').trim();
      }

      // Gender — feminine verb forms: "btaogi", "deti hon", "krlungi", "karungi", "hon me"
      const isFeminine = /\b(btao\s*gi|batao\s*gi|krlun\s*gi|karun\s*gi|deti\s*h[ou]n|lun\s*gi|dalon\s*gi|bhejun\s*gi|hon\s*m[ei]|hun\s*m[ei]|nahi\s*btao\s*gi)\b/i.test(l) ||
        /\b(m[ei]\s*nahi\s*btao\s*gi|meri\s*taraf|apni\s*taraf)\b/i.test(l);
      if (isFeminine) extracted.gender = 'female';

      return { intent: 'bulk_info_given', extracted };
    }
  }

  // 8. GREETING — in IDLE/GREETING/PRODUCT_SELECTION states, use template instead of AI
  // Also detect greetings in COLLECT_* states so template responds + re-asks current field
  const isGreetingState = ['IDLE', 'GREETING', 'PRODUCT_SELECTION', 'PRODUCT_INQUIRY', 'HAGGLING'].includes(currentState);
  const isCollectState = currentState.startsWith('COLLECT_');
  if (isGreetingState || isCollectState) {
    const isSalam = /\b(salam|slaam|salamu|aoa|wsalam|wasalam)\b/i.test(l) || /assalam|walaikum|asalam|aslam|w\s*salam/i.test(l);
    const isCasual = /^(hi+|hey+|hello+|helo|yo)\s*[.!]?\s*$/i.test(l);
    const isHowRU = /\b(kesy|kaise|kaisy|kese|kaisy)\s*(ho|hai|hain|h)\b/i.test(l) || /\b(kya\s*ha+l|kia\s*ha+l)\b/i.test(l);
    // "hi salam" combined — treat as salam
    const isCombined = isCasual && isSalam;
    if (isCollectState && (isSalam || isCasual || isHowRU || isCombined)) {
      return { intent: 'greeting_in_collection' };
    }
    // Greeting in PRODUCT_SELECTION → don't reset to GREETING, keep asking for product
    if (currentState === 'PRODUCT_SELECTION' && (isSalam || isCasual || isHowRU || isCombined)) {
      return { intent: 'greeting_in_selection' };
    }
    // Skip greeting if message also has product/price content — let product detection handle
    const greetHasProduct = /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka|trimmer|trimer|order|chahiye|chahea|manga|lena)\b/i.test(l) || detectProduct(msg);
    if (!greetHasProduct) {
      if (isSalam) return { intent: 'greeting_salam' };
      if (isHowRU) return { intent: 'greeting_howru' };
      if (isCasual) return { intent: 'greeting_casual' };
    }
    // Has product/price content → fall through to product detection
  }

  // 8b. YES in GREETING → show product list (greeting asks "products dekhna hai?")
  // BUT if a specific product is mentioned, skip to product detection instead
  if (currentState === 'GREETING') {
    // Pure acknowledgment ("acha", "theek", "hmm") in GREETING = "yes, show products"
    // "ok/okay/g/ji" → treat as YES (show products), not silent ack
    const isSilentAck = /^(acha+|accha+|hmm+|hm+)\s*[.!]?\s*$/i.test(l);
    if (isSilentAck) return { intent: 'show_products' };

    const greetingProduct = detectProduct(msg);
    if (!greetingProduct) {
      // Skip if it's a COD/payment question — "payment order milny ke baad karoge"
      const isCodQuestion = /\b(payment|paisa|paise|paisy|pese|cod|cash\s*on)\b/i.test(l);
      if (isYes(l) && !isCodQuestion) return { intent: 'show_products' };
      const hasYesWord = /\b(ha+n|ji|yes|ok|haan|hn|hm+|g|dikhao|dikhado|batao|dekhna|dekhne|order|mangta|manga|chahiye|chahie|krna|karna|lena)\b/i.test(l);
      const hasNoWord = /\b(nahi|nhi|no|nope|na+h|mat|cancel)\b/i.test(l);
      if (hasYesWord && !hasNoWord && !isCodQuestion) return { intent: 'show_products' };
      if (hasNoWord && !hasYesWord) return { intent: 'greeting_no' };
    }
    // Product detected → fall through to product detection section below
  }

  // 8b2. BARE PRICE ASK — just "Price", "rate", "kitne ka hai", "qeemat" without product mention
  // Show product list (with prices) via template — saves AI call
  if (['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState)) {
    const isBarePrice = /^(price|prices?|rate|rates?|qeemat|qimat|kimat|kitne\s*ka|kitny\s*ka|kitne\s*ki|kitny\s*ki|price\s*list|rate\s*list|price\s*btao|rate\s*btao|price\s*bta|rate\s*bta)\s*[?.!]?\s*$/i.test(l);
    if (isBarePrice) return { intent: 'product_list' };
  }

  // 8c. PRODUCT LIST REQUEST — "kn kn se products he", "products dikhao", "kya kya milta hai"
  // Common repetitive question → template response, no AI needed
  const isProductListAsk = /\b(k[oa]n\s*k[oa]n|kn\s*kn|kon\s*se|konse|kya\s*kya|kitne|kaun\s*se)\s*(se\s*)?(products?|items?|cheez|chiz|samaan|saman)\b/i.test(l) ||
    /\b(products?|items?|cheez|chiz|samaan|saman)\s*(kya|konse|kon|dikhao|dikha|batao|bata|list|hai|hain|he|hein|available|milte?)\b/i.test(l) ||
    /\b(kya|kon|kaun)\s*(kya|kon|kaun)\s*(milta|milte|milt[ei]|available|hai|hain|he|rakh[ae])\b/i.test(l) ||
    /\b(sab|saare?|all|poore?)\s*(products?|items?|cheez)\b/i.test(l) ||
    /\b(products?|items?)\s*(list|dikhao|dikha|batao)\b/i.test(l) ||
    /\b(dikhao|dikha\s*do|batao|bata\s*do)\s*(products?|items?|sab|saari?)\b/i.test(l) ||
    /\b(products?|items?)\s*(dikhao|dikha\s*do|batao|bata\s*do)\b/i.test(l);
  if (isProductListAsk) return { intent: 'product_list' };

  // 8c2. REORDER INTENT — "dubara order", "phir se order", "same order mangwana hai"
  if (['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState)) {
    const isReorder = /\b(dubara|dobara|phir\s*se|again|re[\s\-]?order)\s*(order|manga|mangwa|mangao|krn?a?|karn?a?|karb?a?|chahiy?e?|chahta|chahti)/i.test(l) ||
      /\b(order|manga|mangwa)\s*(dubara|dobara|phir\s*se|again)/i.test(l) ||
      /\b(woh?i|wohi|same|wahi|vahi)\s*(order|product|cheez|chiz|item)\s*(dubara|dobara|phir\s*se|again|manga|mangwa|mangao|krn?a?|karn?a?|chahiy?e?)/i.test(l) ||
      /\b(woh?i|wohi|same|wahi|vahi)\s*(manga|mangwa|mangao|chahiy?e?|chahta|chahti)/i.test(l);
    if (isReorder) {
      return { intent: 'reorder' };
    }
  }

  // 8d. ORDER INTENT (English) — "i want to order", "wanna order", "need to order"
  // No product mentioned but clear order intent → show product list
  if (['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState)) {
    const engOrderIntent = /\b(wan[nrt]?[aoe]?\s*(to\s*)?order|wanna\s*order|need\s*to\s*order|i\s*want\s*to\s*(order|buy)|want\s*to\s*(buy|order|purchase))\b/i.test(l) ||
      /\b(order\s*kr?n?a?\s*(hai|he|h|ha|chahta|chahti)?)\b/i.test(l) ||
      /\b(order\s*karb?a?\s*(hai|he|h|ha)?)\b/i.test(l) ||
      /\b(mujhe|muje|mjhe|mjy|humain|hmain|hme)\s*(order|manga|mangwa|chahiye|chaiye|chahea|chahye|chahy|chahe)\s*(kr|kar|karb?a?|krn?a?|karn?a?)?\s*(hai|he|h|ha)?\b/i.test(l) ||
      /\b(mujhe|muje|mjhe|mjy)\s*(chahy|chahiy?e?|chaiy?e?|chahea)\b/i.test(l) ||
      /\b(kuch|koi)\s*(order|manga|mangwa)\s*(krn?a?|karn?a?|karb?a?)\s*(hai|he|h|ha|tha|chahta)?\b/i.test(l);
    if (engOrderIntent && !detectProduct(msg)) {
      return { intent: 'order_without_product' };
    }
  }

  // 9. Product detection — useful in IDLE/GREETING/PRODUCT states
  //    Also detect during COLLECT_ADDRESS/COLLECT_PHONE if customer mentions product
  //    (e.g. "facial remover chahea" during address collection = product, not address)
  const isCollectionState = ['COLLECT_ADDRESS', 'COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE'].includes(currentState);

  // Ambiguity check: when 2+ products match with same/close scores, ask customer
  if (!isCollectionState && ['IDLE', 'GREETING', 'PRODUCT_SELECTION', 'PRODUCT_INQUIRY'].includes(currentState)) {
    const allMatches = detectAllProducts(msg);
    if (allMatches.length >= 2) {
      const topScore = allMatches[0].score;
      // Products with same score as top = ambiguous
      const tied = allMatches.filter(m => m.score === topScore);
      if (tied.length >= 2) {
        return { intent: 'product_ambiguous', extracted: { products: tied.map(m => m.product) } };
      }
    }
  }

  const product = detectProduct(msg);
  if (product) {
    // Check if order intent is also present
    // "chahiye/chahea/chahe" ALONE = order intent (no need for action word like "kardo")
    const hasWantWord = /\b(chahiye|chaiye|chaye|chahea|chahye|chaea|chahe|chaeah|chaeh|chaiea|chaiyea|chahea|manga|mangwa|mangana|want|need|chahtaa?|chahti)\b/i.test(l);
    const hasSendWord = /\b(bhej\s*do|bhejdo|bhej\s*dein|bhejdein|bhej\s*dena|send\s*kr|send\s*kro)\b/i.test(l);
    const hasFullOrder = /\b(order|book|lena)\b/i.test(l) &&
                         /\b(kardo|kar do|karna|krna|krdo|kr do|kro|de do|dedo|bhej do|bhejdo|confirm|mangwao|mangwana|do|dein)\b/i.test(l);
    const hasWantToOrder = /\b(want|need|chahta|chahti)\s+(to\s+)?(order|buy|lena|mangwana)\b/i.test(l);
    const hasOrder = hasWantWord || hasSendWord || hasFullOrder || hasWantToOrder;
    // If message has phone number + product → customer is giving order details
    const hasPhone = /(?:\+?92|0)3\d{2}[\s\-\.]?\d{3,7}/.test(msg);

    if (isCollectionState) {
      // During collection: only detect if message is CLEARLY a product mention
      // (short message = just product name, or has order/want words, or price question, or image description)
      // Strip [Image: ...] from word count — image descriptions inflate length
      const msgNoImage = msg.replace(/\[Image:[^\]]*\]\s*/g, '').trim();
      const isShortProductMsg = msgNoImage.split(/\s+/).length <= 6;
      const hasPriceWord = /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka|kitni|kitne|kimat)\b/i.test(l);
      if (isShortProductMsg || hasWantWord || hasPriceWord) {
        return { intent: hasPriceWord ? 'product_inquiry' : 'product_with_order', extracted: { product } };
      }
      // Long message with product name during collection → likely address info, skip
    } else {
      // Product + personal details (name/address/phone) = order intent even without order word
      const hasPersonalDetails = /\b(name|naam)\s+[a-z]/i.test(l) ||
        /\b(flat|house|ghar|makan)\s*(no|nomber|number|nmbr|#)?\s*\d/i.test(l) ||
        /\b(mobile|phone)\s*(nomber|number|nmbr)?\s*(ye|yeh|yehi|yahi)/i.test(l);
      if (hasOrder || hasPhone || hasPersonalDetails) {
        return { intent: 'product_with_order', extracted: { product } };
      }
      return { intent: 'product_inquiry', extracted: { product } };
    }
  }

  // No match → let AI handle
  return null;
}

module.exports = { preCheck, isYes, isNo, isComplaint };
