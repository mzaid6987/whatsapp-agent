/**
 * Pre-Check: thin code-based checks that are 100% reliable
 * Runs BEFORE AI call — if matched, skip AI entirely (zero cost)
 *
 * Handles: phone numbers, cities, regions, complaints, yes/no, product numbers
 */

const { extractPhone, extractAllPhones, validatePhone, extractCity, extractAllCities, isRegion, detectProduct, detectAllProducts, detectRuralAddress, extractArea, extractHouse, extractStreet, extractLandmark } = require('./extractors');
const { matchArea } = require('./city-areas');
const { PRODUCTS } = require('./data');

// ============= COMPLAINT DETECTION =============
const COMPLAINT_WORDS = [
  'kharab','kharaab','khrab','khraab','toot','broken','defective','return karna','return','refund',
  'galat','wrong','scam','fake','fraud','dhoka','bakwas','pagal','nonsense','wtf',
  'bas karo','bekar','cheat','loot','nakli','naqli','wahiyat','ghatiya','complain',
  'complaint','compliant','complane','complane','toot gaya','kam nahi karta','kam nhi karta','kam ni karta',
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
  'not turning on','not turn on','not switching on','issue with',
  // "nahien/nahin" spelling variants (common in Pakistani English-Urdu)
  'chal nahien','chal nahin','chalti nahien','chalti nahin','chalta nahien','chalta nahin',
  'kam nahien','kam nahin','kaam nahien','kaam nahin','work nahien','work nahin',
  // English complaint expressions
  'disappointed','very disappointed','not happy','not satisfied','unsatisfied',
  'waste of money','waste money','money waste','paisa barbaad','paise barbaad','paisay barbaad',
  'haraam','haram','paisay haraam','paise haraam','paisa haraam',
  // "on nhi ho rha" / device not turning on (Roman Urdu — common electronics complaint)
  'on nhi','on nahi','on ni','on nhi ho','on nahi ho',
  'start nhi','start nahi','start ni','start nhi ho','start nahi ho',
  'charge nhi','charge nahi','charge ni','charge nhi ho','charge nahi ho',
  'light nhi','light nahi','light ni',
  'jal nhi','jal nahi','jal ni',
  'power nhi','power nahi','power ni',
  'chalu nhi','chalu nahi','chalu ni',
  'band hai','band he','band h',
  'on hi nhi','on hi nahi','on he nhi','on he nahi'
];

const TRUST_WORDS = /\b(asli|original|cod|cash\s*on|return\s*policy|exchange\s*policy|warranty|guarantee|quality|bharosa|trust|reliable|kaisi?\s*quality|allow\s*to\s*open|open\s*(parcel|box|packet)|parcel\s*(open|khol)|khol\s*k[ae]?\s*(dekh|check)|pehle\s*check|check\s*kar\s*k[ae]?|sulook|salook|slook|exchange|replace|wapas|wapis|vapas|vapsi)\b/i;
// Note: "fake" removed from TRUST_WORDS — it's almost always a complaint, not a trust question
// "achi he na", "theek hogi na ye", "chalegi na", "kaisi hai", "quality kesi he" — quality reassurance questions
// BUT NOT "kam krta he" / "sahi kam krta he" / "works?" — those are product functionality questions (AI handles)
const QUALITY_ASK = /(\b(ach+[ia]|theek|thik|thk|chale\s*g[ia])\b.*\b(hai|he|h|na|hogi|hoga|hain)\b|\bkais[ie]\s*h[ae]i?\b|\bkes[ie]\s*h[ae]i?\b|\bquality\s*(kais[ie]|kes[ie]|kaisi|kesi)\s*(h[ae]i?|he)?\b|\bquality\s*[?؟]\s*$|\bquality\s*(hai|he|h|batao|btao|bta|dikhao)?\s*[?؟]\s*$)/im;
// "kam krta", "kaam karta", "works" — product functionality question, NOT trust
// Covers typos: kryta, krte, krta, krti, kregi, karti, karta etc.
const IS_FUNCTIONALITY_Q = /\b(kam\s*kr[yta]*[aie]?|kaam\s*kr[yta]*[aie]?|kam\s*kar[tae]*[aie]?|kaam\s*kar[tae]*[aie]?|works?|work\s*kart?a?|bn[ae]?t[aie]?\s*(h[aey]i?|hy)|bant[aie]?\s*(h[aey]i?|hy)|ho\s*t[aie]?\s*(h[aey]i?|hy)|kr\s*sakt[aie]?|kar\s*sakt[aie]?|cut\s*kart?a?|kaat\s*t?a?|kaat\s*sakt[aie]?)\b/i;

function isComplaint(l) {
  return COMPLAINT_WORDS.some(w => l.includes(w));
}

// ============= YES / NO DETECTION =============
function isYes(l) {
  return /^(ha+n?|hm+|ji+|jee|g|ge|yes+|yess+|yup|ik|o?k+a*y+|o?ki+|ok\s*ok|o?ok(ay|k|y)?|done|th[ie]*k|tik|sai|sahi|sa[ih]i?|bilkul|c[oa]n?f[iou]r?m(ed)?|comf[io]rm(ed)?|conf?rim(ed)?|zaroor|hn+|kr\s*do|kardo|krdo|kar\s*do|bhejwa?\s*d[oae]|bhijwa?\s*d[oae]|mangwa?\s*d[oae]|laga?\s*d[oae])\s*[.!]?\s*$/i.test(l);
}

function isNo(l) {
  return /^(nahi+|nhi+|no+|cancel|nope|na+h?|mat|band|nai|rehne\s*do|chor[od]|ni+)\s*[.!]?\s*$/i.test(l);
}

// ============= MAIN PRE-CHECK =============
/**
 * Returns { intent, extracted, templateKey?, templateVars? } or null
 * null = let AI handle it
 */
function preCheck(message, currentState, collected, state) {
  const msg = message.trim();
  const l = msg.toLowerCase().trim();

  // 0a0. VOICE UNCLEAR — Whisper failed or hallucinated → ask customer to type
  if (/^\[voice message/i.test(msg)) {
    return { intent: 'voice_unclear' };
  }

  // 0a. GIBBERISH / JUNK — single dot, random chars, emojis only, etc.
  // Treat as greeting so template responds (no AI cost)
  // BUT: "G", "K", "J", "Y", "N" etc are valid short responses (G=ji, K=ok, Y=yes, N=no)
  const isAffirmativeShort = /^[gkyjhn]$/i.test(l);
  const isJunk = /^[.\-_,;:!?\s*#+@^~`'"(){}[\]<>\/\\|]+$/.test(msg) || (msg.length <= 2 && !isAffirmativeShort);
  if (isJunk && ['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'greeting' };
  }

  // 0a2. PARCEL CONFIRMING — customer confirming parcel info ("G", "yes", "sahi hai")
  if (state && state._parcel_confirming) {
    if (isYes(l) || /^(g|k|ok|ji|ha+n|hn|hm+|sahi|theek|thik|bilkul|confirm|done)$/i.test(l.trim())) {
      return { intent: 'parcel_confirmed', extracted: state._parcel_data || {} };
    }
    if (isNo(l) || /^(nahi|nhi|no|galat|nope|na+h|cancel)$/i.test(l.trim())) {
      return { intent: 'parcel_rejected' };
    }
  }

  // 0b. SPAM DETECTION — messages with URLs from unknown senders = spam/scam
  // Ramzan packages, free data, phishing links etc. — don't waste AI tokens
  // BUT: whitelist our own store domains (website WhatsApp button sends product URL)
  // All our stores: nureva, alvora, elvora, ruvenza, zenora, nuvenza (with/without "the" prefix)
  const OWN_DOMAINS = /\b(the)?(nureva|alvora|elvora|ruvenza|zenora|nuvenza|alvorashop|elvorastore|novenzashop)\.(shop|store)\b/i;
  const hasUrl = /https?:\/\/|www\.|\.com\b|\.online\b|\.site\b|\.pk\b|\.buzz\b|\.top\b|\.live\b|\.html\b|\.org\b|\.net\b|clkbitz|lnkbits/i.test(l);
  const isOwnDomain = OWN_DOMAINS.test(l);
  // Don't flag as spam if message contains product-related words (customer sharing a link asking about product)
  const hasProductContext = /\b(order|chahiye|chahie|mangta|bhej|lena|price|rate|kitna|kitne|kitni|product|milega|available|stock|trimmer|cutter|remover|nebulizer|duster|spray|yeh|ye|yahi|yehi|wala|wali)\b/i.test(l);
  if (hasUrl && !isOwnDomain && ['IDLE', 'GREETING'].includes(currentState) && !hasProductContext) {
    return { intent: 'spam' };
  }

  // 0b-ref. WEBSITE REFERRAL — "I want to order "Product Name" https://ourstore.shop/..."
  // Customer clicked WhatsApp button on our website — extract product name from quoted text
  if (isOwnDomain && /i\s*want\s*to\s*order/i.test(l)) {
    const quotedProduct = msg.match(/["""]([^"""]+)["""]/);
    if (quotedProduct) {
      const productName = quotedProduct[1].trim();
      let product = detectProduct(productName);
      // Fallback: if detectProduct fails, try matching against product names directly
      // Website sends full product name like "Stainless Steel Cutting Board Large Size (39cm by 48cm)"
      if (!product) {
        const cleanName = productName.replace(/\([^)]*\)/g, '').trim().toLowerCase(); // strip (39cm by 48cm)
        const { PRODUCTS } = require('./data');
        for (const p of PRODUCTS) {
          if (cleanName.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(cleanName)) {
            product = p;
            break;
          }
          // Also check if most words in product name appear in the input
          const pWords = p.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const matchCount = pWords.filter(w => cleanName.includes(w)).length;
          if (matchCount >= pWords.length * 0.6 && matchCount >= 2) {
            product = p;
            break;
          }
        }
      }
      if (product) {
        return { intent: 'product_selected', extracted: { product, source: 'website_referral' } };
      }
      // Product name found but not in our DB — still treat as inquiry, not spam
      return { intent: 'website_referral', extracted: { product_text: productName } };
    }
  }

  // 0b0. GIFT CARD DETECTION — customer mentions gift card or sends gift card image
  // Works in ALL states — parcel ke sath gift card aata hai, customer image ya text bhejta hai
  const isGiftCard = /\b(gift\s*card|giftcard|gift\s*kard|gft\s*card|gft\s*kard)\b/i.test(l) ||
    /\b(gift)\b/i.test(l) && /\b(card|kard|mila|aya|aaya|aai|aayi|mil\s*gaya|mil\s*gya|received)\b/i.test(l) ||
    /\[Image:.*\b(gift\s*card|giftcard|gift.*card|coupon|voucher|discount\s*card|scratch\s*card)\b/i.test(l);
  if (isGiftCard) {
    return { intent: 'gift_card' };
  }

  // 0b0b. VOICE MESSAGE REQUEST — customer asks for voice message / call
  // "voice message karo", "voice bhejo", "call karo", "bol ke batao", "voice note bhejo"
  const isVoiceMsgReq = /\b(voice\s*(msg|message|note|call)?|vc|voic)\s*(kr[od]?o?|kar[od]?o?|bhej[od]?o?|send|de\s*do|dedo|d[eo]|bana|bnao?)\b/i.test(l) ||
    /\b(voice)\s*(pe|pr|par|mein|me|mai|m|se)\s*(baat|bat|bta|samjha|smjha)\s*(kr[od]?o?|kar[od]?o?)\b/i.test(l) ||
    /\b(voice)\s*(mein|me|mai|m|pe|pr|par|se)\s*(bata[od]?o?|samjha[od]?o?|smjha[od]?o?|bol[od]?o?)\b/i.test(l) ||
    /\b(call|kall|col)\s*(kr[od]?o?|kar[od]?o?|laga[od]?o?)\b/i.test(l) ||
    /\b(bol\s*ke|bol\s*kr|bolke|bolkr)\s*(bata[od]?o?|smjha[od]?o?|samjha[od]?o?)\b/i.test(l) ||
    /\b(awaaz|awaz|aawaz)\s*(mein|me|mai|m)\s*(bata[od]?o?|bhej[od]?o?|bol[od]?o?)\b/i.test(l) ||
    /\b(voice\s*(msg|message|note)|voice)\s*(chahiye|chahie|chaiye|mangta|mangti)\b/i.test(l);
  if (isVoiceMsgReq) {
    return { intent: 'voice_msg_request' };
  }

  // 0b1. BOT IDENTITY — "tumhara naam kya hai", "what is your name", "aapka naam", "tum kaun ho"
  // Must be EARLY so it works in ALL states (COLLECT_NAME, COLLECT_ADDRESS, ORDER_SUMMARY etc.)
  const isBotIdentityQ = /\b(tumhara|tumhary|apka|aapka|tera|ap\s*ka|aap\s*ka)\s*(naam|name)\b/i.test(l) ||
    /\b(what\s*is\s*your\s*name|whats?\s*your\s*name|your\s*name\s*(kya|kia|what))\b/i.test(l) ||
    /\b(naam\s*(kya|kia|batao|btao|bta)\s*(hai|he|h)?)\b/i.test(l) && /\b(tumhara|tumhary|apka|aapka|tera|your|tum|aap)\b/i.test(l) ||
    /\b(kaun|kon|who)\s*(ho|hai|he|h|are\s*you)\b/i.test(l) && !/\b(order|delivery|rider)\b/i.test(l);
  if (isBotIdentityQ) {
    return { intent: 'bot_identity' };
  }

  // 0b2a. PARCEL IMAGE — Vision detected a courier/parcel label with address info
  // e.g. "[Image: [Parcel Info] Name: Ahmed, Phone: 03001234567, Address: House 5 Street 3, City: Lahore]"
  const parcelMatch = msg.match(/\[Parcel Info\]\s*(.+?)(?:\]|$)/i);
  if (parcelMatch) {
    // Clean Vision AI text — strip AI descriptions like "Yeh product...", "Yeh tasveer..."
    let info = parcelMatch[1]
      .replace(/\.\s*Yeh\s+(product|tasveer|parcel|image|order).*/i, '') // strip AI description
      .replace(/\.\s*(Is|Isme|Ye|Product).*/i, '')                       // other AI suffixes
      .trim();
    const extracted = {};
    const nameM = info.match(/Name:\s*([^,\]]+)/i);
    const phoneM = info.match(/Phone:\s*([^,\]]+)/i);
    // Address: capture between "Address:" and "City:" (if City exists)
    const addressM = info.match(/Address:\s*(.+?)(?=,?\s*City:|$)/i);
    // City: capture just the city name (1-3 words, stop at period/comma/bracket)
    const cityM = info.match(/City:\s*([A-Za-z\s]+?)(?:\.|,|\]|$)/i);
    if (nameM) extracted.name = nameM[1].trim();
    if (phoneM) {
      const ph = phoneM[1].trim().replace(/[\s-]/g, '');
      if (/^0\d{10}$/.test(ph)) extracted.phone = ph;
    }
    if (addressM) extracted.address = addressM[1].trim().replace(/,\s*$/, '');
    if (cityM) extracted.city = cityM[1].trim();
    if (Object.keys(extracted).length > 0) {
      return { intent: 'parcel_image', extracted };
    }
  }

  // 0b2. IMAGE NO MATCH — Vision says image is not a product or doesn't match
  // e.g. "[Image: Yeh tasveer kisi product ka nahi...]" — prevent false product detection
  const imageMatch = msg.match(/\[Image:\s*([^\]]+)\]/);
  if (imageMatch) {
    const imgDesc = imageMatch[1].toLowerCase();
    const isNoMatch = /\b(kisi product ka nahi|product.*nahi|match nahi|identify nahi|pehchaan nahi|product se nahi|taluq.*nahi|samajh nahi|koi product nahi)\b/i.test(imageMatch[1]) ||
      (/\bnahi\b/.test(imgDesc) && /\b(product|match|taluq|pehchaan)\b/.test(imgDesc));
    // Check if message is ONLY the image (no meaningful text besides it)
    const textWithoutImage = msg.replace(/\[Image:[^\]]*\]/g, '').trim();
    const isImageOnly = textWithoutImage.length < 5 || /^(yh|ye|yeh|is|check|dekho?|dekhein)\s*$/i.test(textWithoutImage);
    if (isNoMatch && isImageOnly) {
      // AUTO-SPAM: Track non-product image count — 2+ = broadcast spammer
      if (state) {
        state._nonProductImages = (state._nonProductImages || 0) + 1;
        if (state._nonProductImages >= 2) {
          console.log(`[AUTO-SPAM] ${state._nonProductImages} non-product images detected — marking as spam`);
          return { intent: 'spam' };
        }
      }
      return { intent: 'image_not_recognized' };
    }
    // Even if not image-only, strip product names from image description to prevent false product detection
    if (isNoMatch) {
      msg = msg.replace(/\[Image:[^\]]*\]/, '[Image: unrecognized]');
      l = msg.toLowerCase().trim();
    }
  }

  // 0b3. "ISI PE BHEJO" — reference to previous image/parcel for address
  // "usi pe bhejo", "isi address pe", "uper jo dress hai usi py bjna"
  // Only relevant during collection states — tells bot to use previously extracted info
  const isReferenceToImage = /\b(usi|isi|us[iy]?\s*(pe|py|par)|is[iy]?\s*(pe|py|par)|uper\s*jo|oper\s*jo|wahi|wohi|yehi|yahi)\s*.*(bhej|bjna|send|address|pata|parcel|dress)\b/i.test(l) ||
    /\b(bhej|bjna|send|address|pata)\s*.*(usi|isi|uper|oper|wahi|wohi|yehi|yahi)\b/i.test(l);
  if (isReferenceToImage && state && state._parcel_data) {
    // Customer is saying "use that address" — re-trigger parcel data application
    return { intent: 'parcel_image_confirm', extracted: state._parcel_data };
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

  // 0c2. POST-DELIVERY SUPPORT — customer already received order, asking about usage/voucher/etc.
  // "parcel aa gaya", "order mil gaya", "maine order liya tha" WITHOUT complaint = post-delivery
  const isPostDelivery = isPastOrder && !hasNegativeContext;
  // "how to use", "kaise chalana", "use karna hai", "chalana kaise hai", "features kya hain"
  const isUsageQuestion = /\b(how\s*to\s*use|kaise?\s*(chala|use|istemal|istmal)|chala+na+\s*(kaise?|kesy)|use\s*kar(na|ne|ni)|features?\s*(kya|kia|batao|samjh)|instructions?|taree?qa)\b/i.test(l) ||
    /\b(is\s*ko|isko|ise|ye)\s*(chala|use|on|start|operate)\b/i.test(l);
  if ((isPostDelivery || isUsageQuestion) && ['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState)) {
    const pdProd = detectProduct(msg);
    return { intent: 'post_delivery', extracted: pdProd ? { product: pdProd } : {} };
  }
  // Usage question OR product functionality question in any state (even mid-order) — send product video
  // "chicken qeema bnata hai?", "ye kam krta hai?" etc. in collection states should NOT go to collection AI
  // (collection AI has no product info and hallucinates)
  if ((isUsageQuestion || (IS_FUNCTIONALITY_Q.test(l) && currentState.startsWith('COLLECT_'))) && !['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'usage_question' };
  }

  // 0d. COLLECT_DELIVERY_PHONE early check — compound voice messages like
  // "haan call receive karlunga ... kharab to nahi hai" start with YES but contain complaint words later
  // Must check BEFORE complaint detection to not lose the delivery phone confirmation
  if (currentState === 'COLLECT_DELIVERY_PHONE') {
    // Check for rural address FIRST — "chak no 32 mangla" has "no" which false-matches hasNoWord
    const ruralInPhone = detectRuralAddress(msg);
    if (ruralInPhone && ruralInPhone.isRural) {
      const cityInMsg = extractCity(msg);
      return { intent: 'rural_in_phone_state', extracted: { rural_part: ruralInPhone.ruralPart, rural_type: ruralInPhone.type, city: cityInMsg } };
    }

    // Address info given during delivery phone — "pindi road youneek store", "saddar bazar dukaan"
    // Customer skipped phone question and gave address → assume same phone + extract address
    const ADDRESS_KW_IN_PHONE = /\b(road|rd|bazar|bazaar|market|mohall?ah?|colony|sector|block|gali|galli|chowk|chorangi|town|nagar|abad|dukaan|dukan|shop|stor[e]?|masjid|school|hospital|bank|pump|plaza|center|centre|mandi|garhi|kacheri|society|scheme|naka|morr?|chauraha|flyover|bridge|pull|main\s*baz[ae]r|saddar|cantt)\b/i;
    if (ADDRESS_KW_IN_PHONE.test(l) && !extractPhone(msg)) {
      const cityInMsg = extractCity(msg);
      const areaInMsg = extractArea(msg, cityInMsg);
      // Try to extract store/shop/dukaan name as landmark — "youneek Stor", "Ali ki dukaan"
      let landmark = null;
      const storeMatch = msg.match(/\b([a-z][a-z]+)\s+(stor[e]?|shop|dukaan|dukan|mart|pharmacy|medical|kiryana|general)\b/i) ||
        msg.match(/\b(stor[e]?|shop|dukaan|dukan|mart|pharmacy|medical|kiryana|general)\s+([a-z][a-z]+)\b/i);
      if (storeMatch) {
        // Determine which group is name vs type
        const isTypeFirst = /^(stor[e]?|shop|dukaan|dukan|mart|pharmacy|medical|kiryana|general)$/i.test(storeMatch[1]);
        const name = isTypeFirst ? (storeMatch[2] || '') : storeMatch[1];
        const type = isTypeFirst ? storeMatch[1] : storeMatch[2];
        const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        // Skip if "name" is a filler word like "pta", "he", "ye"
        if (name.length > 2 && !/^(pta|pata|he|hai|ye|yeh|woh|koi|ek|aik)$/i.test(name)) {
          landmark = `${titleCase(name)} ${titleCase(type)}`;
        }
      }
      // Also try extractLandmark for other patterns (near X, X ke paas)
      if (!landmark) landmark = extractLandmark(msg);
      return { intent: 'address_in_phone_state', extracted: { city: cityInMsg, address_text: msg, area: areaInMsg, landmark } };
    }

    // Gratitude words = acknowledgment after trust answer = continue (same phone)
    // "Thanks" / "shukriya" after trust Q means "ok, satisfied, continue"
    const isGratitude = /\b(thanks|thank\s*you|thankyou|shukriya|shukria|meherbani)\b/i.test(l);
    if (isGratitude) {
      return { intent: 'same_phone', extracted: { same_phone: true } };
    }

    const startsWithYes = /^(ha+n|ji+|jee|g|yes|yup|ok|haan|hn+)\b/i.test(l.trim());
    const hasYesWord = /\b(ha+n|ji|yes|yup|ik|ok[zgky]?|haan|hn+|g|k|shi|sahi|sa[ih]i?|theek|thik|thk|tik|bilkul|done)\b/i.test(l);
    // Exclude "no" when it's part of "no." / "no " + digit (number abbreviation like "chak no 32")
    const noWordCleaned = l.replace(/\bno\.?\s*\d/gi, '___');
    const hasNoWord = /\b(nahi|nhi|no|nope|na+h|mat|cancel)\b/i.test(noWordCleaned);
    // "krlungi/karlunga/karlungi/krlnga" = "I'll do it" = YES (receive kar lungi/lunga)
    const hasWillDo = /\b(kr\s*lun?g[ia]|kar\s*lun?g[ia]|receive\s*kr|receive\s*kar)\b/i.test(l);
    // "Nahi yahi number hai" / "nahi isi pe" / "no this only" / "only this no" = SAME phone, NOT rejection
    const nahiButSame = hasNoWord && /\b(yahi|yehi|yhi|isi|issi|same|only\s*this|this\s*only|ya\s*hi|ye\s*hi|wohi|wahi)\b/i.test(l);
    if (/\b(isi|same|yehi|yahi|yhi|wohi|wahi)\b/i.test(l) || nahiButSame || isYes(l) || /^k+$/i.test(l.trim()) || (hasYesWord && !hasNoWord) || (startsWithYes && hasNoWord) || hasWillDo) {
      return { intent: 'same_phone', extracted: { same_phone: true } };
    }
    if (isNo(l) || (hasNoWord && !hasYesWord && !startsWithYes && !nahiButSame)) {
      return { intent: 'no' };
    }
  }

  // 1. COMPLAINT — highest priority, any state (but not if also trust question)
  // "kharab to nahi hogi" / "toot to nahi jayegi" = QUESTION about quality, not complaint
  const complaint = isComplaint(l);
  const trust = TRUST_WORDS.test(l);
  const isQualityQuestion = /\b(to\s*nahi|toh?\s*nahi|nahi\s*ho|nhi\s*ho|nahi\s*na|hogi|hoga|jayega|jayegi|sakti|sakta)\b/i.test(l) && complaint;
  // Question tone: "kya fake hai?", "ye kharab to nahi?", ends with ? — asking, not reporting
  const isQuestionTone = complaint && !strongComplaint && (
    /[?؟]\s*$/.test(l) ||
    /^(kya|ye|yeh|ya|to)\b/i.test(l) ||
    /\b(haina|hai\s*na|he\s*na|na\s*ho|hog[aie]|milega|chalega|chalegi|lag[ae]\s*ga|sakta|sakti|to\s*nahi|toh?\s*nahi)\b/i.test(l)
  );
  // Strong complaint = clearly reporting an issue (past tense, active problem)
  // "sending damage", "not work", "broken hai", "kharab mila", "charger issue" etc.
  // "receive" alone is NOT a complaint — "call receive kar lunga" is normal. Only "receive nhi/nahi" is complaint.
  const strongComplaint = complaint && (/\b(sending|sent|mila|receive[d]?\s*(nahi|nhi|ni|nai)|not work|not fit|broken|damage[d]?\s*product|issue|problem|stopped|charger|band ho|chal nahi|chal nhi|chalt[ai]\s*(hi\s*)?(nahi|nhi|ni)|work\s*nahi|work\s*nhi|working\s*nahi|working\s*nhi|sahi\s*work|sahi\s*kam|sahi\s*nahi|hilta|missing|toota|tuta|kaam\s*ka\s*nahi|kaam\s*ka\s*nhi|kaat\s*nahi|kaat\s*nhi|kaat\s*saka|nuqsan|paise?\s*wapas|paisay?\s*wapas|ek\s*bhi\s*kaam|kisi\s*bhi?\s*kaam)\b/i.test(l) || isPastOrder);
  if (isQualityQuestion && !strongComplaint) {
    return { intent: 'trust_question' };
  }
  if (isQuestionTone) {
    return { intent: 'trust_question' };
  }
  if (complaint && (!trust || strongComplaint)) {
    return { intent: 'complaint' };
  }
  if (complaint && trust) {
    return { intent: 'trust_question' };
  }
  // 1x. FRUSTRATION DETECTION — customer is fed up, wants to quit
  // "rehne do", "chor do", "bhool jao", "band karo", "dimagh kharab", "pagal kr dia"
  // Only trigger when customer has been in conversation for a while (not first message)
  const FRUSTRATION_PHRASES = /\b(rehne?\s*d[oey]|rhn[ey]?\s*d[oey]|chor\s*d[oey]|choro|bhool\s*jao|bhul\s*jao|band\s*kar[o]?|bas\s*kar[o]?|dimagh?\s*kharab|dmagh?\s*khrab|pagal|pagl|bewakoof|bewaqoof|bekaar|bekar|wahiyat|time\s*waste|tym\s*waste|koi\s*faida\s*nahi|koi\s*fayda\s*nahi|tang\s*aa?\s*ga[iy]a|thak\s*ga[iy]a|fed\s*up|frustrated|give\s*up|leave\s*it|forget\s*it|nahi\s*chahiye\s*kuch|kuch\s*nahi\s*chahiye|mat\s*karo|baat\s*mat|jawab\s*mat)\b/i;
  const isFrustrated = FRUSTRATION_PHRASES.test(l);
  if (isFrustrated && !['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'frustration', needs_human: true };
  }

  // Standalone trust question without complaint — "warranty kitny time ki", "COD hai?", "exchange hota hai?"
  // BUT: "quality?" alone = quality question (not trust) — route to quality_question
  if (trust && !complaint) {
    if (QUALITY_ASK.test(l)) {
      return { intent: 'quality_question' };
    }
    return { intent: 'trust_question' };
  }

  // 0c. "SAB KI" / "ALL" after pending media request — send all product videos/pics
  // Also matches "sb ki dikhao", "sab ki bhejo", "all products", etc.
  if (state && state._pending_media_type && /^(sab|sb|sari|saari|all|sabki|sb\s*ki|sab\s*ki|sari\s*ki)(\s*(dikhao|dikha|bhejo|bhej|send|de|do|dena|products?))?\s*[.!]?\s*$/i.test(l)) {
    return { intent: 'media_request_all', extracted: { media_type: state._pending_media_type } };
  }
  // Also catch "sab ki dikhao" even without _pending_media_type (standalone request after product list)
  if (/^(sab|sb|sari|saari|all)\s*(ki|ke)?\s*(dikha|dikhao|bhej|bhejo|send|de|do|dena)\s*[.!]?\s*$/i.test(l) && currentState === 'PRODUCT_SELECTION') {
    return { intent: 'media_request_all', extracted: { media_type: 'video' } };
  }

  // 1a-0. STANDALONE MEDIA WORD — just "Video", "Photo", "Picture" with product selected
  // Customer wants to see product media — not a name, not a username
  const isStandaloneMedia = /^(video|vidoe|vedio|vid|photo|picture|pic|image|tasveer|tasver|reel)\s*[?؟]?\s*$/i.test(l);
  if (isStandaloneMedia && state.product) {
    const detectedMediaType = /\b(video|vidoe|vedio|vid|reel)\b/i.test(l) ? 'video' : 'image';
    return { intent: 'media_request', extracted: { product: state.product, media_type: detectedMediaType } };
  }

  // 1a. MEDIA REQUEST — "picture dikhao", "photo bhejo", "video dikhao", "image send karo"
  // Also: "X ki video", "X ki picture" (standalone, no action word needed)
  const isMediaReq = /\b(picture|photo|pic|image|tasveer|tasver|tsveer)\s*(dikha|dikhana|dikhao|dikhado|bhej|bhejo|bhejdo|bhejdena|bhejdo|send|de|do|dena|chahiye)\b/i.test(l) ||
    /\b(video|vid|vidoe|vedio|reel)\s*(dikha|dikhana|dikhao|dikhado|bhej|bhejo|bhejdo|bhejdena|send|de|do|dena|chahiye)\b/i.test(l) ||
    /\b(dikha|dikhana|dikhao|bhej|bhejo|send|de)\s*(do|dena|na)?\s*(picture|photo|pic|image|tasveer|tasver|video|vid|vidoe|vedio)\b/i.test(l) ||
    /\b(kaise?\s*(dikhta|lagta|hota)|kaisa\s*(hai|he|h|dikhta|lagta))\b/i.test(l) ||
    /\b(pic(ture)?s?\s*(send|bhej)|photos?\s*(send|bhej)|videos?\s*(send|bhej))\b/i.test(l) ||
    /\bki\s+(video|vidoe|vedio|vid|picture|photo|pic|image|tasveer)\b/i.test(l) ||
    /\b(video|vidoe|vedio|vid|picture|photo|pic|image|tasveer)\s+ki\b/i.test(l);
  if (isMediaReq) {
    // Check if asking for ALL products' media — "sab ki video dikhao", "sb products ki video"
    const isAllReq = /\b(sab|sb|sari|saari|all|har\s*ek)\b/i.test(l);
    const detectedMediaType = /\b(video|vidoe|vedio|vid|reel)\b/i.test(l) ? 'video' : 'image';
    if (isAllReq) {
      return { intent: 'media_request_all', extracted: { media_type: detectedMediaType } };
    }
    // Check if asking for a specific product's media
    const mediaProduct = detectProduct(msg);
    return { intent: 'media_request', extracted: { product: mediaProduct || null, media_type: detectedMediaType } };
  }

  // 1a-x. GREETING FAST-PATH — "kya haal", "kaise ho", "salam" + filler like "theek hai"
  // Must check BEFORE quality_question so "kya haal hain theek hai" isn't caught as quality
  // BUT: if message ALSO contains product/price content, skip greeting → let product detection handle
  // SKIP: If message contains phone number (10-11 digits) → it's info submission, not greeting
  const hasPhoneNumber = /\b0\d{10}\b/.test(msg) || /\d{10,11}/.test(msg.replace(/[\s-]/g, ''));
  const isGreetingPhrase = /\b(kya\s*ha+l|kia\s*ha+l|kesy\s*ho|kaise\s*ho|kaisy\s*ho|kese\s*ho)\b/i.test(l) ||
    (/\b(salam|slaam|salamu|aoa|assalam|walaikum|asalam|aslam)\b/i.test(l) && /\b(theek|thik|thk|tik)\s*(hai|he|h|hain)\b/i.test(l));
  const hasProductOrPriceContent = /\b(price|rate|qeemat|qimat|kitne\s*ka|kitny\s*ka|trimmer|trimer|order|chahiye|chahea|manga|lena)\b/i.test(l) || detectProduct(msg);
  if (isGreetingPhrase && ['IDLE', 'GREETING', 'PRODUCT_SELECTION'].includes(currentState) && !hasProductOrPriceContent && !hasPhoneNumber) {
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
      // Two numbers mashed together? Try extracting both
      const allPhones = extractAllPhones(msg);
      if (allPhones.length >= 2 && currentState === 'COLLECT_PHONE') {
        const v1 = validatePhone(allPhones[0]);
        const v2 = validatePhone(allPhones[1]);
        if (v1.valid && v2.valid) {
          return { intent: 'two_phones_given', extracted: { phone: v1.phone, delivery_phone: v2.phone } };
        }
      }
      return { intent: 'phone_invalid', extracted: { error: 'too_long', digits: rawDigits.length } };
    }
    // Check for two phone numbers in one message (e.g. "0321-1234567 ya 0300-9876543")
    if (currentState === 'COLLECT_PHONE') {
      const allPhones = extractAllPhones(msg);
      if (allPhones.length >= 2) {
        const v1 = validatePhone(allPhones[0]);
        const v2 = validatePhone(allPhones[1]);
        if (v1.valid && v2.valid) {
          return { intent: 'two_phones_given', extracted: { phone: v1.phone, delivery_phone: v2.phone } };
        }
      }
    }
    const phone = extractPhone(msg);
    if (phone) {
      const validation = validatePhone(phone);
      if (validation.valid) {
        const extracted = { phone: validation.phone };
        // Extract name attached to phone — "03001234567.Ahsan", "03001234567 Ali Khan"
        const remaining = msg.replace(/[\+]?(?:92|0)?3\d{2}[\s\.\-]?\d{7}/g, '').replace(/[.,\-]/g, ' ').trim();
        if (remaining.length >= 2 && remaining.length <= 30 && /^[A-Za-z\s]+$/.test(remaining)) {
          const nameWords = remaining.trim().split(/\s+/);
          if (nameWords.length >= 1 && nameWords.length <= 3 && nameWords[0].length >= 2) {
            extracted.name = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          }
        }
        return { intent: 'phone_given', extracted };
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

  // 2z. ADDRESS/CITY info given during COLLECT_PHONE — save it, don't lose it
  // Customer says "Fath pur makki fabric main bazar" or "District Layyah" during phone collection
  if (currentState === 'COLLECT_PHONE') {
    // Detect city/district mention
    const distMatch = l.match(/\b(?:dist(?:rict|c)?|distt?|zil+a)\s+(\w[\w\s]*)/i);
    if (distMatch) {
      const cityName = distMatch[1].trim().replace(/\b\w/g, c => c.toUpperCase());
      return { intent: 'address_during_phone', extracted: { city: cityName } };
    }
    // Detect full address-like text (3+ words, has area-like words) — no phone number present
    const hasPhone = /0\d{10}|03\d{8,}/.test(msg.replace(/\s/g, ''));
    if (!hasPhone && l.trim().split(/\s+/).length >= 3) {
      const hasAddressWords = /\b(bazar|bazaar|market|road|gali|street|block|mohall?ah?|colony|town|nagar|abad|pur|garh|sector|phase|scheme|plot|house|area|chowk|shop|fabric|store|dukaan|dukan)\b/i.test(l);
      if (hasAddressWords) {
        return { intent: 'address_during_phone', extracted: { address_hint: msg.trim() } };
      }
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

    // Generic admin words — "taluqa", "tehsil", "zila", "district" are NOT city names
    // Customer is describing the type of place, not giving a name
    const GENERIC_ADMIN_WORDS = /^(taluqa|taluka|tehsil|tahsil|zila|zilla|district|ilaqa|ilaaka|markaz|sub\s*division|gaon|village|dehat|sheher|shehr|city)\s*$/i;
    if (GENERIC_ADMIN_WORDS.test(l.trim())) {
      return { intent: 'generic_admin_word', extracted: { word: l.trim() } };
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
      remaining = remaining.replace(/\b(ke|ka|ki|mein|me|men|mai|main|may|mn|m|andar|dena|hai|he|h|pe|par|wahan|yahan|delivery|bhejo|bhej|do|karni|krni|se|sy)\b/gi, '').trim();
      if (remaining.length >= 3) {
        const areaInCity = matchArea(remaining, allCities[0]);
        if (areaInCity) {
          return { intent: 'city_given', extracted: { city: allCities[0], area: areaInCity } };
        }
        // Not a known area but meaningful text (e.g. "Allah wali per") — save as address_hint
        // so address collection can use it as landmark/area info
        // BUT skip if text is a QUESTION — "konsy city sy delivered hoga??" is NOT an address
        const cleanRemaining = remaining.replace(/[,،.]+/g, '').trim();
        const isQuestionText = /[?؟]/.test(cleanRemaining) ||
          /\b(kons[iy]|kahan|kidhar|kab|kitna|kitne|kitni|kitny|kaise|kaisy|kesy|kya|kia|hoga|hogi|hota|delivered|deliver)\b/i.test(cleanRemaining);
        if (cleanRemaining.length >= 3 && /[a-z]/i.test(cleanRemaining) && !isQuestionText) {
          return { intent: 'city_given', extracted: { city: allCities[0], address_hint: cleanRemaining } };
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
    // Order matters: "X naam hai mera" pattern FIRST (more specific), then "naam hai X"
    // English: "my name is X Y Z" — must come before Urdu patterns
    const englishNameIs = msg.match(/\bmy\s+name\s+is\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20}){0,2})\b/i) ||
      msg.match(/\bi\s*(?:am|m)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20}){0,2})\b/i);
    const nameInMsg = englishNameIs ||
      msg.match(/\b([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\s+(?:naam|name)\s+(?:hai|he|h)\s+(?:mera|mra)\b/i) ||
      msg.match(/\b([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\s+(?:naam|name)\s+(?:hai|he|h)\s*(?:mera|mra)?\s*$/i) ||
      msg.match(/\b(?:mera|mra)\s+(?:naam|name)\s+(?:hai|he|h)?\s*([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)\b/i) ||
      msg.match(/\b(?:naam|name)\s+(?:hai|he|h|is|mera|mra)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20}){0,2})\b/i);
    if (nameInMsg) {
      const rawName = nameInMsg[1].trim();
      // Make sure it's not a common word
      const isCommon = /^(delivery|order|product|price|rate|quality|time|sukkur|lahore|karachi|islamabad|local|number|phone|yaar|bhai|kab|kya|kitna|nahi|haan|mera|mra|hai|he|aap|tum|tera|apka)$/i.test(rawName);
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
    const isBulkCandidate = msg.length > 30 && (extractCity(msg) !== null || /\b(address|mohall?ah?|gali|street|sector|phase|block|colony|bahria|dha|chak|village|gaon|goth)\b/i.test(l));
    if (phone && !isBulkCandidate) {
      const validation = validatePhone(phone);
      if (validation.valid) {
        const extracted = { phone: validation.phone };
        // Also extract name if there's text before/after the phone (e.g. "Rehman 03001234567")
        const textWithoutPhone = msg.replace(/[\+]?0?[0-9\s\-]{10,13}/g, '').trim();
        if (textWithoutPhone && /^[A-Za-z\s]{2,30}$/.test(textWithoutPhone) && textWithoutPhone.split(/\s+/).length <= 3) {
          extracted.name = textWithoutPhone.replace(/\b[a-z]/g, c => c.toUpperCase());
        }
        return { intent: extracted.name ? 'name_and_phone_given' : 'phone_in_name_state', extracted };
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

  // 4a-WANT. "Yah chahiya mujhe" / "mujhe chahiye" / "ye chahiye" = ORDER INTENT, NOT name
  // Must come BEFORE name_in_product_inquiry check to prevent false name detection
  if (currentState === 'PRODUCT_INQUIRY' && state.product) {
    if (/\b(chahiy[ae]|chaiy[ae]|chay[ae]|chahea|chahye|chaea|chahe)\b/i.test(l) &&
        /\b(mujhe|mujhy|mjhe|mjhy|ye|yeh|yah|ya|muje|wo|woh|humein|hame|hamein)\b/i.test(l)) {
      return { intent: 'order_intent', extracted: {} };
    }
    // "2 chahiye" / "3 mangta" / "do chahiye" — quantity + want word = order intent
    if (/\b(\d{1,2}|do|teen|char|panch|chhay?|saat|aath|nau|das)\s*(chahiy[ae]|chaiy[ae]|chay[ae]|chahea|chahye|chaea|chahe|mangta|mangti|mangwao|bhej\s*do|bhejdo)\b/i.test(l)) {
      return { intent: 'order_intent', extracted: {} };
    }
  }

  // 4a-PI. NAME IN PRODUCT_INQUIRY — customer skipped "haan" and directly gave name after "Order karna hai?"
  // e.g. Bot: "Order karna hai?" → Customer: "Shazia Jamshed" (implicit yes + name)
  if (currentState === 'PRODUCT_INQUIRY' && state.product) {
    const trimmed = msg.trim();
    const words = trimmed.split(/\s+/);
    const looksLikeName = words.length >= 1 && words.length <= 3 &&
      /^[A-Za-z\s.]+$/.test(trimmed) && trimmed.length >= 3 && trimmed.length <= 40;
    const isQuestionWord = /\b(kab|kya|kitna|kitne|kitni|kitny|quality|price|rate|order|delivery|kaise|kaisy|kesy|product|hai|he|ha|hy|nahi|nhi|cancel|complaint|return|salam|hello|hi|hey|aoa|discount|offer|sasta|mehenga|exchange|refund|cod|cash|free|payment|chahiye|chahie|chahiya|chahya|chaiya|mangta|mangwa|bhejo|video|photo|picture|link|website|trimmer|cutter|remover|nebulizer|duster|spray|massager|board|milega|melega|milta|milti|mein|sabzi|beef|chicken|mutton|gosht|qeema|keema|meat|bnata|banta|hota|bnta|mujhe|mujhy|mjhe|yah|yeh|ye|lena|dena|karna|krna|dono|sath|saath|mil|milengy|miljiengy|miljaenge|miljayenge|ayenge|aenge|ajaenge|ajayenge|pehle|phle|zaroor|zaror|required|need|needed|want|wanted|interested|send|please|urgent|available|necessary)\b/i.test(l);
    // Single-letter "B" at end = "bhi" (also) in WhatsApp Urdu — NOT a name initial
    const endsWithBhi = /\s+b\s*$/i.test(l.trim());
    const isCommonNonName = /^(ok+|okay|acha+|theek|thik|hmm+|hm+|g|k|jee?|ji|yes|yup|yep|yeah|no|nahi|nhi|done|cancel|sahi|bilkul|confirm|ha+n|hn|hanji|hnji)\s*[.!]?\s*$/i.test(l);
    // Common conversational phrases that are NOT names — "ok wait", "no thanks", "let me think" etc.
    const isConversationalPhrase = /\b(wait|ruk[oa]?|soch|think|later|baad|bad|abhi\s*nahi|pehle|phle|already|thanks|shukriya|thank\s*you)\b/i.test(l) ||
      /^(ok\s+wait|no\s+thanks?|not\s+now|let\s+me|hold\s+on|one\s+min|ek\s+min)\b/i.test(l);
    const isProductKeyword = detectProduct(msg) !== null;
    // Urdu phrases that look like 2-3 English words but are NOT names
    const isUrduPhrase = /^(g\s+brother|ji\s+sir|ji\s+madam|g\s+sir|easily|easyli|dono\s+sath|sath\s+milj|sath\s+mil|required\s+me|final\s+price|last\s+price|ok\s+sir|ok\s+madam|ok\s+done|aik\s+piece|ek\s+piece|one\s+piece)\s*$/i.test(l) ||
      /\b(chahiy[ae]|milj[aie]|milengy|miljiengy|ayenge|jayenge|hojaye|hojayen|krwao|krwana|mangwao|mangwana|bhejdo|bhejdein|bhejna|deliver|delivery|receive|receive)\b/i.test(l);
    // English non-name words — "I Went This", "Yes Ok", "Not Now" etc.
    const ENGLISH_NON_NAME_PI = /\b(i|me|my|he|she|we|us|they|them|it|this|that|these|those|the|and|but|or|for|with|not|just|very|also|too|only|went|want|wanted|go|going|gone|come|came|need|needed|send|sent|get|got|gave|give|have|had|has|done|did|make|take|took|tell|told|know|said|please|plz|fine|good|bad|here|there|from|will|can|may|should|would|must|required|available)\b/i;
    const isEnglishNonNamePI = ENGLISH_NON_NAME_PI.test(l);
    // Greeting check — "Assalamu Alaikum", "AoA", etc.
    const isGreetingPI = /^(assalam|wa?\s*[ao]?l[ae]i?ku?m|aoa|salam|slam|slaam|hello|hi|hey)\b/i.test(l);
    // Combo phrases — "Don G Bhai", "Is Ki", "Ok Bhai", "Tobha H", "Bata Diya"
    const isComboPI = /^(ok|g|ji|don|so|is|ye|yeh|tobha|toba|diya|bata)\s+(bhai|sir|madam|ki|ka|g|h|diya|dia)\b/i.test(l) ||
      /\b(bhai|sir|madam)\s*$/i.test(l);
    // Urdu meaning phrases mistaken as names — "Kuch Gunjaish", "Kitne ka hai", "Bata Diya"
    const isUrduMeaningPI = /^(kuch|kitne?|kitni|bata|btao|tobha|toba|yes\s*ok)\b/i.test(l) ||
      /\b(gunjaish|gunjais|kahi|diya|dia|hai|he|h|nahi|nhi)\s*$/i.test(l);
    // Product phrases — "machine", "massager", etc.
    const isProductPhrasePI = /\b(machine|mashin|trimmer|cutter|remover|nebulizer|duster|spray|massager|masajar|cotton|vegetable|facial|hair|knee|board|cutting|mehn?g[aie]|sast[aie]|gunjaish|gunjais)\b/i.test(l);
    if (looksLikeName && !isQuestionWord && !isCommonNonName && !isConversationalPhrase && !isProductKeyword && !endsWithBhi && !isUrduPhrase && !isEnglishNonNamePI && !isGreetingPI && !isComboPI && !isUrduMeaningPI && !isProductPhrasePI && words.length >= 2) {
      // 2+ word name in PRODUCT_INQUIRY = implicit yes + name (e.g. "Shazia Jamshed")
      const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { intent: 'name_in_product_inquiry', extracted: { name } };
    }
  }

  // 4a0. CANCEL/REFUSAL in collection states — "cancel", "nahi chahiye", "order nahi karna"
  // Must catch BEFORE name detection so "nahi chahiye" is not processed as name
  if (['COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_CITY', 'COLLECT_DELIVERY_PHONE', 'COLLECT_ADDRESS'].includes(currentState)) {
    // "ya nahi" / "ke nahi" / "ya na" at end = question ("X kar sakain ge ya nahi?"), NOT cancel
    const isQuestionSuffix = /\b(ya|k[ey]|ki)\s+(nahi|nhi|ni|nai|na|mat)\s*[?؟.!]?\s*$/i.test(l);
    const isCancelInCollection = /\b(cancel|cancl|cansel)\b/i.test(l) ||
      (!isQuestionSuffix && /\b(order|ordr)?\s*(nai|nahi|nhi|ni|na|mat)\s*(kr|kar|karn[aie]|krn[aie]|chahiy[ae]|chaiy[ae])?\b/i.test(l) && /\b(nai|nahi|nhi|ni|na|mat)\b/i.test(l)) ||
      /\b(nai|nahi|nhi|ni|na|mat)\s*(chahiy[ae]|chaiy[ae]|mangta|manga|lena|order|krna|karna)\b/i.test(l) ||
      /\b(rehne\s*do|choro|chhoro|bas|nai\s*krwana|abhi\s*nahi|filhal\s*nahi|felhal\s*nahi|abi\s*nahi)\b/i.test(l) ||
      /\b(not\s*interested|no\s*thanks?|no\s*thnks?|don'?t\s*want|i'?m?\s*not\s*interested)\b/i.test(l);
    if (isCancelInCollection) return { intent: 'no_order_now' };
  }

  // 4a0b. DISCOUNT/HAGGLE in collection states — "discount to do", "offer do", "sasta kro"
  // Must catch BEFORE name detection so "discount to do" is not saved as name
  if (['COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_CITY', 'COLLECT_DELIVERY_PHONE'].includes(currentState)) {
    const isDiscountInName = /\b(disc?o?u?n?t|discoutn|disocunt|discont|discoynt|off|offer|sast[aie]|kam\s*kr[oa]?|km\s*kr[oa]?|kam\s*kard?o?|km\s*kard?o?|kam\s*do|km\s*do|kuch\s*(to\s*)?km|mehn?g[aie]|price\s*kam|price\s*km|rate\s*kam|rate\s*km)\b/i.test(l);
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
    const isCommonNonName = /^(ok+|okay|acha+|theek|thik|hmm+|hm+|g|k|jee?|ji|yes|yup|yep|yeah|no|nahi|nhi|done|cancel|sahi|bilkul|confirm|ha+n|hn|hanji|hnji|han\s*ji)\s*[.!]?\s*$/i.test(l);
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
    // Suspicious WhatsApp usernames — common English words that are NOT real names
    // e.g. "Video", "Admin", "User", "Business", "Shop", "Official", "Online"
    const isSuspiciousUsername = /^(admin|user|guest|test|demo|owner|manager|boss|staff|support|service|services|business|shop|store|official|online|digital|media|studio|tech|gaming|gamer|vlogs?|blogger|trader|trading|dealer|reviews?|status|updates?|news|channel|page|group|public|private|personal|main|real|original|backup|old|new|unknown|null|undefined|bot|robot|ai|home|office|work|mobile|android|iphone|samsung|oppo|vivo|realme|redmi|infinix|tecno|nokia|huawei)\s*\d*$/i.test(l);
    // Common conversational phrases that are NOT names — "ok wait", "no thanks", "not now" etc.
    const isConversationalPhrase = /\b(wait|ruk[oa]?|soch|think|later|baad|bad|abhi\s*nahi|thanks|shukriya|thank\s*you)\b/i.test(l) ||
      /^(ok\s+wait|no\s+thanks?|not\s+now|let\s+me|hold\s+on|one\s+min|ek\s+min)\b/i.test(l);
    // Name refusal — "not required", "zaroorat nahi", "naam nahi bataunga", "ok not required"
    const isNameRefusal = /\b(not\s*required|no\s*need|zaroorat?\s*nahi|zarurat?\s*nahi|naam\s*(nahi|nhi|ni|nai)|nahi?\s*batao?n?g[aie]?|nai\s*btaon?g[aie]?|order\s*(nahi|nhi|ni|nai)|nahi?\s*kr[nw]a|cancel|nai\s*krna)\b/i.test(l);
    // Islamic greetings that are NOT names — "Assalamu Alaikum", "Wa Alaikum Assalam", "AoA"
    const isGreeting = /^(assalam[ou]?\s*[ao]?l[ae]i?ku?m|wa?\s*[ao]?l[ae]i?ku?m\s*(assalam|[ao]?ssalam)|aoa|salam|slam|slaam|asslam|asalam)\b/i.test(l) ||
      /^(hello|hi|hey|helo|hlw|hellow|assalam)\s*(bhai|sir|madam|g|ji|dear|boss|bro)?\s*$/i.test(l);
    // Product-related phrases that are NOT names — "Cotton Machine", "Muje Masajar", "Itni Mehngi"
    const isProductPhrase = /\b(machine|mashin|trimmer|cutter|remover|nebulizer|duster|spray|massager|masajar|cotton|vegetable|facial|hair|knee|sleeve|board|cutting)\b/i.test(l) ||
      /\b(mehn?g[aie]|sast[aie]|itni|kitne?|muje|mjhe|mujhe?|chahiy[ae]|chiy|gunjaish|gunjais)\b/i.test(l);
    // Gibberish/repeated characters — "A Jjj Jjjjj", "Fffff", "Hhhh"
    const isGibberish = /(.)\1{2,}/i.test(trimmed) || // same char repeated 3+ times
      trimmed.split(/\s+/).some(w => w.length > 1 && new Set(w.toLowerCase()).size === 1); // word with all same letters
    // "Ok/G + word" combos and other non-name combos — "Ok Bhai", "G Bhej Dein", "Don G Bhai", "So Sorry", "Yes Ok"
    const isComboPhrase = /^(ok|g|ji|don|so|is|ye|yeh|tobha|toba|diya|bata|yes)\s+(bhai|sir|madam|bhej|wait|sorry|sorryg|ki|ka|gaya|bhi|ok|g|h|diya|dia)\b/i.test(l) ||
      /\b(bhai|bhej\s*dein|gaya\s*hai|sorry)\s*$/i.test(l);
    // Urdu phrases that look like English names but are NOT names
    const isUrduPhrase = /^(g\s+brother|ji\s+sir|ji\s+madam|g\s+sir|easily|easyli|dono\s+sath|required\s+me|final\s+price|last\s+price|ok\s+sir|ok\s+done|yes\s+ok|tobha\s+h|bata\s+diya?|kuch\s+gunjaish?)\s*$/i.test(l) ||
      /\b(chahiy[ae]|milj[aie]|milengy|miljiengy|ayenge|jayenge|hojaye|hojayen|krwao|mangwao|bhejdo|deliver|delivery|receive)\b/i.test(l);
    // English non-name words — pronouns, verbs, adjectives that are NEVER Pakistani names
    // Catches: "I Went This", "Required Me", "Ok Not Required", "Send Me", "Just Fine" etc.
    const ENGLISH_NON_NAME_WORDS = /\b(i|me|my|he|she|we|us|they|them|it|this|that|these|those|the|and|but|or|for|with|not|just|very|much|also|too|only|went|want|wanted|go|going|gone|come|came|coming|need|needed|send|sent|get|got|gave|give|have|had|has|done|did|does|make|made|take|took|tell|told|know|knew|see|saw|look|let|try|put|run|set|keep|show|find|call|feel|think|said|please|plz|pls|fine|good|bad|nice|great|here|there|from|into|will|can|may|should|would|could|must|shall|required|available)\b/i;
    const isEnglishNonName = words.length >= 2 && ENGLISH_NON_NAME_WORDS.test(l);
    // Single common English words that are NOT names (but could pass looksLikeName)
    const isSingleEnglishWord = words.length === 1 && /^(yes|no|ok|hi|hey|hello|bye|please|thanks|sorry|sure|fine|good|nice|great|love|like|want|need|help|send|done|wait|stop|start|open|close|free|new|old|big|small|fast|slow|easy|hard|real|true|best|last|next|same|other|much|more|less|just|only|even|still|also|back|down|here|there|away|home|long|full|high|low|off|sir|madam|bro|dear|boss|dude|miss|mam|available|required)$/i.test(l);
    if (looksLikeName && !isQuestionWord && !isCommonNonName && !isConversationalPhrase && !isNameRefusal && !isAddressLabel && !isProductKeyword && !isFrustration && !isProductQualifier && !isSuspiciousUsername && !isGreeting && !isProductPhrase && !isGibberish && !isComboPhrase && !isUrduPhrase && !isEnglishNonName && !isSingleEnglishWord) {
      // Strip "Name" prefix — "Name Arshad Luck" → "Arshad Luck"
      let nameWords = words;
      if (nameWords.length >= 2 && /^name$/i.test(nameWords[0])) {
        nameWords = nameWords.slice(1);
      }
      // Strip "Luck" suffix (common WhatsApp username artifact)
      if (nameWords.length >= 2 && /^luck$/i.test(nameWords[nameWords.length - 1])) {
        nameWords = nameWords.slice(0, -1);
      }
      const name = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { intent: 'name_given', extracted: { name } };
    }
    // Suspicious WhatsApp username detected — re-ask for real name
    if (looksLikeName && isSuspiciousUsername) {
      return { intent: 'suspicious_username', extracted: { username: trimmed } };
    }
  }

  // 4b0-CITY. CITY CORRECTION — "Lahore nahi Fatehpur hai" / "city galat hai X hai"
  // Customer correcting wrongly detected city — update city and re-ask address
  if (currentState === 'COLLECT_ADDRESS' || currentState === 'COLLECT_CITY') {
    const currentCity = (collected.city || '').toLowerCase();
    const allCities = extractAllCities(msg);
    // Method 1: Negation + new city — "nahi X hai", "X nahi Y hai", "galat city"
    const hasNegation = /\b(nhi|nahi|na|ni|nai|galat|ghalat|wrong|change|correct)\b/i.test(l);
    if (hasNegation && allCities.length > 0) {
      const newCity = allCities.find(c => c.toLowerCase() !== currentCity);
      if (newCity) {
        return { intent: 'city_correction', extracted: { city: newCity } };
      }
    }
    // Method 2: Explicit city statement — "mein X se hoon", "city X hai", "X mein delivery"
    // Only triggers if the mentioned city is DIFFERENT from current city
    if (currentCity && allCities.length > 0) {
      const isCityStatement = /\b(city|shehr|shehar)\s*(mera|meri|hmari|hamari)?\s*(h[ae]i?|ye|yeh)\b/i.test(l) ||
        /\b(mein|main|me|hum|ham)\s*(to|toh?)?\s*.{0,20}\s*(se|sy|say)\s*(hu+n?|ho+n?|hain)\b/i.test(l) ||
        /\b(delivery|parcel|order)\s*.{0,10}\s*(mein|me|pe|par|ko)\b/i.test(l);
      if (isCityStatement) {
        const newCity = allCities.find(c => c.toLowerCase() !== currentCity);
        if (newCity) {
          return { intent: 'city_correction', extracted: { city: newCity } };
        }
      }
    }
    // Method 3: Customer just sends a city name (only) that's different from current
    // "Faisalabad" when current is "Lahore" — clearly a correction
    if (currentCity && allCities.length === 1 && msg.trim().split(/\s+/).length <= 3) {
      const mentionedCity = allCities[0].toLowerCase();
      if (mentionedCity !== currentCity) {
        return { intent: 'city_correction', extracted: { city: allCities[0] } };
      }
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

  // 4b1. "ALREADY TOLD" / "JUST LIKH DO" / "YEH ADDRESS HAI" in COLLECT_ADDRESS
  // Customer frustrated repeating OR says "this is the address" — accept what we have
  if (currentState === 'COLLECT_ADDRESS') {
    const isAlreadyTold = /\b(btaya|bata\s*di[ay]?|bta\s*di[ay]?|bta\s*to\s*d[ei]a|bata\s*to\s*d[ei]a|likh[a]?\s*(he|hai|h|dia|diya|do|dy)|upar\s*(likh|he|hai|dekh)|pehle\s*(bata|btaya|likha)|already\s*(told|given|sent))\b/i.test(l) ||
      /\b(bas\s*(itna|yahi|yehi|bs|likh)|itna\s*(he|hai|h|bas)|yahi\s*(he|hai|h)|yehi\s*(he|hai|h)|ho\s*gaya|enough|kafi)\b/i.test(l) ||
      /\b(ye+h?i?\s*(he|hai|h)\s*(jo|address|sab|sb)?|ya+h?i?\s*(he|hai|h)\s*(jo|address|sab|sb)?)\b/i.test(l) ||
      /\b(de?\s*to\s*d[ei]a|d[ei]a\s*(he|hai|h|to|na)|dey?\s*dia|dey?\s*diya)\b/i.test(l) ||
      /\b(rider\s*(call|puch|samajh)|aa\s*k[ae]r?\s*(puch|dekh|mil))\b/i.test(l) ||
      /\b(just\s*likh|sirf\s*likh|likh\s*d[eoy]|likh\s*dy)\b/i.test(l) ||
      /\b(aj[ay]+[ae]?g[ay]?|pohanch|pohch|aa?\s*ja[ey]+g[ay]?|mil\s*ja[ey]+g[ay]?)\b/i.test(l);
    if (isAlreadyTold) {
      return { intent: 'address_enough' };
    }
  }

  // 4b1b. "YEH DRESS/ADDRESS HAI" — customer confirms address ("yeah dress he" = "yeh address hai")
  if (currentState === 'COLLECT_ADDRESS') {
    const isThisAddress = /\b(ye+h?|ya+h?|yeah|yhi|yehi|yahi)\s*(dress|adress|address|ad+res+)\s*(he|hai|h|hae)?\b/i.test(l) ||
      /\b(dress|adress|address)\s*(ye+h?i?|ya+h?i?|bs|bas)\s*(he|hai|h|hae)?\b/i.test(l) ||
      /\b(ye+h?|ya+h?|yeah)\s*(he|hai|h|hae)\s*(dress|adress|address|mera\s*address)\b/i.test(l);
    if (isThisAddress) {
      return { intent: 'address_enough' };
    }
  }

  // Cancel/refusal detection in ALL address states (including confirming)
  if (currentState === 'COLLECT_ADDRESS') {
    const isOrderCancel = /\b(order|ordr)\s*(nai|nahi|nhi|ni|na|mat|cancel)\s*(kr|kar|karn[aie]|krn[aie])?\b/i.test(l) ||
      /\b(nai|nahi|nhi|ni|na|mat)\s*(order|ordr)\s*(kr|kar|karn[aie]|krn[aie])?\b/i.test(l) ||
      /\b(mjh[ey]?|mujh[ey]?)\s*(order|kuch)?\s*(nai|nahi|nhi|ni|na)\s*(kr|kar|karn[aie]|krn[aie]|chahiye|chaiye)\b/i.test(l) ||
      /\b(cancel|cancl)\s*(kr|kar|karo|krdo|kardo|order)?\b/i.test(l) ||
      /\b(nahi|nhi|ni|nai|mat)\s*(chahiye|chaiye|mangta|manga|lena)\b/i.test(l);
    const isInfoRefusal = /\b(nai|nahi|nhi|ni|na|mat)\s*(bta|btaon?g[aie]|batao?n?g[aie]|bataon?g[aie])\b/i.test(l) ||
      /\b(mai|mein|me|main)\s*(nai|nahi|nhi|ni)\s*(bta|btaon?g[aie]|batao?n?g[aie]|bataon?g[aie])\b/i.test(l) ||
      /\b(nai|nahi|nhi)\s*(bta|bat[ao])\s*(rh?a|rh?i|raha|rahi)\b/i.test(l);
    if (isOrderCancel) return { intent: 'no_order_now' };
    if (isInfoRefusal) return { intent: 'no_order_now' };
  }

  // 4b-CODE: CODE-FIRST ADDRESS EXTRACTION — extract address parts in code, skip AI
  // Runs all extractors on customer's message. If ANY part found, return it.
  // This handles 70-80% of address responses without AI cost.
  if (currentState === 'COLLECT_ADDRESS' && state && !state.address_confirming) {

    const ap = collected.address_parts || {};
    const city = collected.city || null;
    const parts = {};
    let foundAny = false;

    // Run all extractors on the raw message
    const detectedArea = extractArea(msg, city) || (city ? matchArea(l, city) : null);
    const detectedStreet = extractStreet(msg);
    const detectedHouse = extractHouse(msg);
    // Negation filter — "colony ni h", "block nahi hai", "street ni h" = customer saying it doesn't exist
    const isNegation = /\b(colony|block|sector|street|gali|galli|mohall[ae]h?|area|ilaq[ae])\s+(ni|nhi|nahi?|nai)\s*(h[ae]i?|he?|hota|hoti)?\s*$/i.test(l) ||
      /\b(koi|kio)\s+(colony|block|sector|street|gali|galli|mohall[ae]h?)\s+(ni|nhi|nahi?|nai)\b/i.test(l);
    const detectedLandmark = isNegation ? null : extractLandmark(msg);

    // "nahi pata" / "number nahi" / "pata nahi" for current step → set nahi_pata
    const isRefusal = /^(nahi?|nhi|no|ni|nope|na+h?|pata?\s*nahi?|nahi?\s*pata?|nahi?\s*he|number\s*nahi?|nahi?\s*number|ghar\s*(he|hai)\s*bas)\s*[.!]?\s*$/i.test(l);
    // "Area nahi lagta koi" / "koi area nahi" / "nahi pata area" / "area maloom nahi" / "colony ni h" = DON'T KNOW area
    const isDontKnowArea = /\b(area|ilaq[ae]|muhall[ae]|colony|sector|block|street|gali|galli)\s*(nh?|nahi?|nhi|ni|nai|maloom\s*nahi?|pata?\s*nahi?|lagta?\s*koi|nahi?\s*lagta?|nahi?\s*h[ae]i?|h[ae]i?\s*nahi?|ni\s*h[ae]i?|nhi\s*h[ae]i?)\b/i.test(l) ||
      /\b(nh?|nahi?|nhi|ni|nai)\s*(lagta|maloom|pata)\s*(koi|area|ilaq[ae])?\b/i.test(l) ||
      /\b(koi|kio)\s*(area|ilaq[ae])\s*(nh?|nahi?|nhi|ni|nai)\b/i.test(l) ||
      /\b(area|ilaq[ae]|muhall[ae]|colony|sector|block|street|gali|galli)\s+(ni|nhi|nahi?|nai)\s*(h[ae]i?|he?)?\s*$/i.test(l);

    // Fill only MISSING parts (don't overwrite existing)
    // Skip area detection if customer is saying "I don't know my area"
    if (!ap.area && detectedArea && !isDontKnowArea) { parts.area = detectedArea; foundAny = true; }
    if (!ap.street && detectedStreet) { parts.street = detectedStreet; foundAny = true; }
    if (!ap.house && detectedHouse) { parts.house = detectedHouse; foundAny = true; }
    if (!ap.landmark && detectedLandmark) { parts.landmark = detectedLandmark; foundAny = true; }

    // When area is extracted from message, check if remaining text contains landmark keywords
    // e.g. "New Karachi Kali market" → area=New Karachi, remaining "Kali market" → landmark
    if (detectedArea && !ap.landmark && !detectedLandmark && !parts.landmark) {
      const areaLower = detectedArea.toLowerCase();
      const remaining = l.replace(new RegExp(areaLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
      if (remaining.length >= 3) {
        const hasLandmarkKw = /\b(market|maarket|markit|bazar|bazaar|masjid|mosque|hospital|school|college|chowk|chouk|chowrangi|pump|petrol|station|stop|gate|darwaza|park|ground|maidan|plaza|tower|center|centre|mill|factory|godown|church|mandir|gurdwara|imambargah|dargah|hotel|restaurant|bakery|pharmacy|medical|clinic|shop|store|dukaan|complex)\b/i.test(remaining);
        if (hasLandmarkKw) {
          // Clean remaining text and save as landmark
          const cleanRemaining = remaining.replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();
          if (cleanRemaining.length >= 3) {
            parts.landmark = cleanRemaining.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            foundAny = true;
          }
        }
      }
    }

    // Handle refusal for current missing field
    if (isNegation && !foundAny) {
      // "colony ni h" / "block nahi hai" — mark current missing field as nahi_pata
      if (!ap.area) { parts.area = 'nahi_pata'; foundAny = true; }
      else if (ap.area && !ap.street) { parts.street = 'nahi_pata'; foundAny = true; }
      else if (ap.area && ap.street && !ap.house) { parts.house = 'nahi_pata'; foundAny = true; }
      else if (ap.area && (ap.house || ap.house === 'nahi_pata') && !ap.landmark) { parts.landmark = 'nahi_pata'; foundAny = true; }
    }
    if (isRefusal || isDontKnowArea) {
      if (!ap.area && isDontKnowArea) { parts.area = 'nahi_pata'; foundAny = true; }
      else if (ap.area && !ap.street) { parts.street = 'nahi_pata'; foundAny = true; }
      else if (ap.area && ap.street && !ap.house) { parts.house = 'nahi_pata'; foundAny = true; }
      else if (ap.area && (ap.house || ap.house === 'nahi_pata') && !ap.landmark) { parts.landmark = 'nahi_pata'; foundAny = true; }
    }

    // Short message (1-3 words) with no extraction and no refusal = likely area name or landmark
    // If we're waiting for area and message is short text → try as area name directly
    const wordCount = l.trim().split(/\s+/).length;
    // Garbage filter — common filler/question phrases that are NOT area names or landmarks
    const isGarbageText = /\b(kya|batao|btao|batadu|btadu|samjh|rider|call|phone|aap|ap|tum|mujhe|mjhe|bus|bas|bilkul|theek|thik|ok|done|achaaa*|sir|madam|bhai|behen|yaar|haan|han|ji|jee|nahi|nhi|kaise|kaisy|kesy|bataye|btaye|krna|karna|krdo|kardo|suno|sunno|agay|peechy|idhar|udhar|wahan|yahan|kuch|koi|pta|pata|maloom|samajh|aya|aaya|gaya|raha|rahi|araha|arahe)\b/i.test(l) ||
      /\b(order|delivery|deliver|product|price|payment|cod)\b/i.test(l);
    if (!foundAny && !isRefusal && wordCount <= 4 && /^[a-z\s]+$/i.test(l.trim()) && !isGarbageText) {
      if (!ap.area) {
        // Short text during area step → assume it's area name
        parts.area = msg.trim();
        foundAny = true;
      } else if (ap.area && !ap.landmark && (ap.house || ap.house === 'nahi_pata')) {
        // Have area+house, waiting for landmark → assume short text is landmark
        parts.landmark = msg.trim();
        foundAny = true;
      }
    }

    if (foundAny) {
      return { intent: 'address_part_extracted', extracted: { address_parts: parts } };
    }
    // If nothing found, fall through to AI
  }

  // 4b. ACKNOWLEDGMENT in collection states — "ok", "acha", "theek", "hmm" → re-ask current field
  // Also: "order krna he", "order karna hai" during collection = just acknowledging, re-ask field
  if (['COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_CITY', 'COLLECT_ADDRESS', 'COLLECT_DELIVERY_PHONE'].includes(currentState)) {
    const isAck = /^(ik|ok+|okay|acha+|ach+a|theek|thik|thk|tik|hmm+|hm+|g|k|jee?|ji|ha+n|haan|hn|yes+|yup|samajh\s*(aa?\s*ga[yi]?|aa?\s*gai)?)\s*[.!]?\s*$/i.test(l);
    // In COLLECT_ADDRESS: if address parts are substantially filled, "ok" = confirming address (not just acknowledging)
    // This handles case where address_confirming flag was lost (e.g. server restart)
    if (isAck && currentState === 'COLLECT_ADDRESS' && collected.address_parts) {
      const ap = collected.address_parts;
      const filledCount = [ap.area, ap.street, ap.house, ap.landmark].filter(v => v && v !== 'nahi_pata').length;
      const nahiCount = [ap.area, ap.street, ap.house, ap.landmark].filter(v => v === 'nahi_pata').length;
      if (filledCount + nahiCount >= 2) {
        // Enough address info exists — treat as address confirmation
        return { intent: 'address_confirm_yes' };
      }
    }
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

  // 4z. NAME + PHONE in PRODUCT_SELECTION — customer gives info before selecting product
  // e.g. "Aslam 03452198887" — store name+phone, then ask for product
  if (currentState === 'PRODUCT_SELECTION') {
    const phone = extractPhone(msg);
    if (phone) {
      const extracted = { phone };
      // Extract name: text before the phone number (e.g. "Aslam" from "Aslam 03452198887")
      const phonePart = msg.match(/0\d[\d\s-]{8,12}/)?.[0] || phone;
      const beforePhone = msg.replace(phonePart, '').trim();
      if (beforePhone && beforePhone.length >= 2 && beforePhone.length <= 40 &&
          !/\b(salam|assalam|walaikum|aoa|hi|hello|hey)\b/i.test(beforePhone) &&
          !/^\d+$/.test(beforePhone)) {
        extracted.name = beforePhone.replace(/[^a-zA-Z\s]/g, '').trim();
      }
      return { intent: 'info_before_product', extracted };
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
      // Use ambiguous products list if available (customer picking from shown list)
      const ambigList = state && state._ambiguous_products;
      if (ambigList && idx >= 0 && idx < ambigList.length) {
        return { intent: 'product_selected', extracted: { product: ambigList[idx] } };
      }
      // Fallback to global product list
      if (!ambigList && idx >= 0 && idx < PRODUCTS.length) {
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

  // 6z. WEBSITE/LINK REQUEST — "link bhejo", "website ka link", "link share karo"
  const isLinkRequest = /\b(link|website|web\s*site|url)\s*(share|bhej|de|do|send|dedo|bhejo|kar\s*do|batao|btao|dikhao)\b/i.test(l) ||
    /\b(share|bhej|de|send|dedo|bhejo)\s*(link|website)\b/i.test(l) ||
    /\b(apn[ia]|hamari|shop\s*ki|store\s*ki)\s*(website|link|site)\b/i.test(l);
  if (isLinkRequest) {
    return { intent: 'website_link' };
  }

  // 6z2. "ABHI ORDER NAHI" — customer explicitly refuses to order right now
  // "abhi nahi", "abhi order nahi", "baad mein", "jab chahiye hoga batata hun", "filhal nahi"
  const isNoOrder = /\b(abhi|ab|filhal|filhaal)\s*(koi|kio|kuch)?\s*(order|zaroorat|zarurat)?\s*(nahi|nhi|ni|na|nai)\b/i.test(l) ||
    /\b(abhi|ab)\s*(nahi|nhi|ni|nai)\s*(chahiye|chaiye|chaye)\b/i.test(l) ||
    /\b(baad|bad)\s*(mein|me|mai|m)\s*(bata|contact|rabta|call)\b/i.test(l) ||
    /\b(jab\s*(chahiye|chaiye|chaye|zaroorat|zarurat)\s*(hog[ai]|ho)\s*(to|toh?)?\s*(bata|contact|rabta))\b/i.test(l) ||
    /\b(jab\s*(order|zaroorat)\s*(chaya|chahiye|hog[ai])\s*(to|toh?)?\s*(rabta|contact|bata))\b/i.test(l) ||
    /\b(order|ordr)\s*(nai|nahi|nhi|ni|na|mat)\s*(kr|kar|karn[aie]|krn[aie])?\b/i.test(l) ||
    /\b(mjh[ey]?|mujh[ey]?)\s*(order|kuch)?\s*(nai|nahi|nhi|ni|na)\s*(kr|kar|karn[aie]|krn[aie]|chahiye|chaiye)\b/i.test(l) ||
    /\b(nai|nahi|nhi|ni|na|mat)\s*(chahiye|chaiye|mangta|manga|lena)\s*(order)?\b/i.test(l);
  if (isNoOrder && !['IDLE', 'GREETING'].includes(currentState)) {
    return { intent: 'no_order_now' };
  }

  // 6c. HAGGLE detection in PRODUCT_INQUIRY — "rate kam ho sakta?", "discount do", "price kam kro"
  // Must catch BEFORE order intent so "kam kro" is not confused with order
  if (currentState === 'PRODUCT_INQUIRY' && state.product) {
    const isHaggleInPI = /\b(disc?o?u?n?t|discoutn|disocunt|discont)\b/i.test(l) ||
      /\b(sast[aie]|ssta)\s*(kr[oa]?|kard?o?|do|dedo|de\s*do|mein|me|mai|m)\b/i.test(l) ||
      /\b(rate|price|qeemat|qimat|kimat|keemat)\s*(kuch+|thod[aie]?|thora)?\s*(kam|km)\s*(kr[oa]?|kard?o?|do|dedo|ho|hojaye?|hosakta|ho\s*sakta|hoskta)\b/i.test(l) ||
      /\b(kam|km)\s*(kr[oa]?|kard?o?|do|dedo)\s*(rate|price|qeemat)?\b/i.test(l) ||
      /\b(kuch+|thod[aie]?|thora)\s*(kam|km)\s*(ho|kr|kar|kro|karo|do)\b/i.test(l) ||
      /\b(offer|offr)\s*(hai|he|h|do|dedo|milega|milta)?\b/i.test(l) ||
      /\b(meh[ea]?n?g[aie]|bohot?\s*(meh[ea]?n?g|zyada))\b/i.test(l);
    if (isHaggleInPI) {
      return { intent: 'haggle' };
    }
    // Price question — "price kitni hai?", "is ki kimat kya hai?", "ye kitne ka hai?"
    // Customer asking about currently discussed product → repeat product info (saves AI call)
    const isPriceAskInPI = /\b(price|rate|qeemat|qimat|kimat|keemat)\s*(kya|kia|kitni|kitna|kitne|batao|btao|bta)\b/i.test(l) ||
      /\b(kitni|kitna|kitne|kitny)\s*(price|rate|qeemat|kimat|ki|ka|hai|he|h)\b/i.test(l) ||
      /\b(kitni|kitna|kitne|kitny)\s*(m|me|mein|mei|main|may)\s*(mil[ea]?g[aie]?|milta|milti|melega|mele)\b/i.test(l) ||
      /\b(is\s*k[aie]|isk[aie]|ye|yeh|iska|iski)\s*(price|rate|qeemat|kimat|kitni|kitna|kitne)\b/i.test(l) ||
      /\b(price|rate)\s*(hai|he|h|kya|kia)\b/i.test(l);
    if (isPriceAskInPI) {
      return { intent: 'product_selected', extracted: { product: state.product } };
    }
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

    const hasOrderAction = /\b(order|mangwa|mangana|book|chahiye|chahiya|chahya|chaiye|chaiya|chaye|chahea|chahye|chaea|chahe)\b/i.test(l);
    const hasOrderConfirm = /\b(kardo|kar\s*do|karna|krna|krdo|kr\s*do|kro|karo|kar|de\s*do|dedo|bhej\s*do|bhejdo|bhejwa\s*do|bhijwa\s*do|bhejwao|confirm|mangwao|mangwana)\b/i.test(l);
    const hasYesWord = /\b(ha+n|ji|yes|yup|theek|thik|thk|tik|ik|ok|done|bilkul|sahi|acha|accha|achha)\b/i.test(l);
    if ((hasOrderAction && hasOrderConfirm) || (hasYesWord && hasOrderConfirm)) {
      // Check if message ALSO has delivery/price questions — "prices aur delivery kharchain bataen taake order karna chahten"
      // Customer asking questions FIRST, order intent is conditional ("taake" = so that)
      const hasDeliveryPriceQ = /\b(price[s]?|rate[s]?|kharcha|kharchain|kharche|kharchay|charg[ei]s?|charges?|cost|kitna?\s*(lag|hog|pais)|delivery\s*(k[eaiy]+\s*)?(pais[ey]|charg|kharcha|free|kitna?)|pais[ey])\b/i.test(l);
      const hasAskingWord = /\b(bata[eoy]n?|btao|btaen|btaye|poch|puch|mukammal|detail|batana|btana)\b/i.test(l);
      if (hasDeliveryPriceQ && hasAskingWord) {
        // Prioritize the question — customer wants answers before ordering
        return { intent: 'delivery_charge_question', extracted: { has_order_intent: true } };
      }
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
    // BUT bare "ok"/"acha"/"hmm" ALONE = just acknowledging, NOT order intent
    const isBareAcknowledgment = /^(ok|o?k+a*y+|acha|achha|accha|hm+|theek|thik|thk|tik|alright)\s*[.!]?\s*$/i.test(l);
    if (isBareAcknowledgment && currentState === 'PRODUCT_INQUIRY') {
      return { intent: 'acknowledgment' };
    }
    const flexYes = hasYesWord && !/\b(nahi|nhi|no|galat|nope|na+h|mat|cancel)\b/i.test(l);
    if ((isYes(l) || flexYes) && !IS_FUNCTIONALITY_Q.test(l)) {
      return { intent: 'yes' };
    }
  }

  // 7a-x. DELIVERY PROCESS question — "kis trha deliver hoga", "delivery kaise hoti hai", "kaise bhejte ho"
  // Customer asking HOW delivery works (courier? TCS? process?) — not time or charges
  // Also catches direct courier company questions: "TCS available hai?", "Leopard se bhejoge?", "konsi company?"
  const isDeliveryProcessQ = /\b(kis\s*tr[ha]+|kais[ey]?|kidher\s*se|konsi?\s*(company|courier))\s*.*(delive?r|bhej|parcel|ship|courier|send)\b/i.test(l) ||
    /\b(delive?r|parcel|bhej|ship)\s*.*(kis\s*tr[ha]+|kais[ey]?|hot[ia]|hog[ia]|kart[ey]|krte?)\b/i.test(l) ||
    /\b(delive?r|parcel)\s*(ho\s*sakt[aie]|ho\s*jaye?g[aie]|ho\s*jayg[aie])\b/i.test(l) ||
    /\b(tcs|leopard|leopards|postex|call\s*courier|m\s*&?\s*p)\s*(se|say|sy|available|hai|he|h|hota|hoti|hoga|hogi|milta|milti|bhej|aata|aati|ata|ati|dete|krte|karte|through|use|wale|wali)\b/i.test(l) ||
    /\b(tcs|leopard|leopards|postex|call\s*courier|m\s*&?\s*p)\s*[?؟]\s*$/i.test(l) ||
    /\b(konsi?|kaun\s*si?|kis|which)\s*(courier|company|service)\b/i.test(l) ||
    /\b(courier|company|service)\s*(konsi?|kaun\s*si?|kya|kia|kon)\b/i.test(l);
  if (isDeliveryProcessQ) {
    const dpCity = extractCity(msg);
    return { intent: 'delivery_process_question', extracted: dpCity ? { city: dpCity } : {} };
  }

  // 7b. DELIVERY TIME question — check BEFORE charge to avoid "delivery kitne din" matching charge pattern
  const isDeliveryTimeQ = /\b(k[aeu]?b\s*(t[aeu]?k|aaye?|milega|ayga|ayega|ajayga|ajaye?ga|aye?\s*ga|pohch|pohnch))\b/i.test(l) ||
    /\b(kitn[ewy]?|katni|katny|katne)\s*(din|dino[nm]?|deno|days?|waqt|time)\b/i.test(l) ||
    /\b(k[aeu]b\s*(aaye|milega|ayega|ayga|ajayga|ajaye?ga|pohchega|deliver))\b/i.test(l) ||
    /\b(delivery\s*(time|din|days?|kitne?\s*din|kab|kb|kub))\b/i.test(l) ||
    /\b(kb\s*t[aeu]?k\s*(ayga|aayga|ajayga|ajaye?ga|milega|pohchega)?)\b/i.test(l) ||
    /\b(parcel|order)\s*(kab|kb|kub)\s*(aaye?ga|ajaye?ga|milega|pohche?ga)?\b/i.test(l) ||
    /\b(aa\s*jaye?\s*ga|mil\s*jaye?\s*ga|pohch\s*jaye?\s*ga)\b/i.test(l) ||
    /\b(katni|katny|katne)\s*(deno|dino|din)\s*(m|me|mein|mai)?\s*(mil|mily?|mileg[aie]?|ayg[aie]?|aayg[aie]?)\b/i.test(l) ||
    // Event-based delivery questions: "Eid se pehle delivery ho jayegi?", "kal tak mil jayega?"
    /\b(eid|kal|parso|parsoo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somo?war|mangal|budh|jumerat|juma|hafta|itwar|chand\s*raat)\s*(se|say|sy|s)?\s*(pehl[aey]|pahla?y?|pehla?y?)\s*(delivery|deliver|mil|pohch|aa|parcel)?\s*(ho|hoja|hojaye?|hojayeg[aie]?|mil|mileg[aie]?|milj[aie]?|pohch|aaj[aie]?|ajaye?g[aie]?|jayeg[aie]?|jay\s*g+[aie]?|ga|gi|ge)?\b/i.test(l) ||
    // "delivery ho jayegi/jaye gi/ho jaye ga" — general delivery completion question
    /\b(delivery|deliver|parcel|order)\s*(ho\s*jaye?\s*g[aie]+|hojaye?\s*g[aie]+|ho\s*jay\s*g+[aie]+|hojay\s*g+[aie]+)\b/i.test(l) ||
    // English delivery time patterns: "how much time", "how long will it take", "when will it be delivered"
    /\b(how\s*(much|long)\s*(time|days?)?)\b/i.test(l) && /\b(deliver|take|come|arrive|receive|get|ship)\b/i.test(l) ||
    /\b(when\s*will)\b/i.test(l) && /\b(deliver|receive|get|arrive|come|ship|reach)\b/i.test(l) ||
    /\b(time\s*to\s*deliver|delivery\s*period|shipping\s*time|estimated\s*delivery)\b/i.test(l);
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

  // 7b2. DELIVERY CHARGE/COST question — "delivery ke paise?", "delivery free hai?", "shipping charges?"
  const isDeliveryChargeQ = /\b(delivery|shipping|courier)\s*(ke|ki|ka|k|ky)?\s*(pais[ey]|charg[ei]s?|chages?|cost|rate|free|muft|patsy|kharcha|kharchain|kharche|kharchay)\b/i.test(l) ||
    /\b(pais[ey]|charg[ei]s?|chages?|cost|patsy|kharcha|kharchain|kharche)\s*(delivery|shipping)\b/i.test(l) ||
    /\b(delivery|shipping)\s*(free|muft)\s*(hai|he|h)?\b/i.test(l) ||
    /\bfree\s*(delivery|shipping)\b/i.test(l) ||
    /\bdelivery\b.*\b(patsy|paise|paisy|free|muft|charg|chage|kharcha|kharchain)\b/i.test(l) ||
    /\b(delivery|shipping)\s*(kia|kya|kaise|kaisy|kitni|kitny)\s*(hai|ha|he|h|hoti|hogi)?\b/i.test(l) ||
    /\bdelivery\s*(kitne?|kitni)\s*(pais[ey]|rupee?|rs)?\s*[?؟]?\s*$/i.test(l) ||
    /\bdelivery\s*\?\s*$/i.test(l) ||
    /\bdelivery\s+chag/i.test(l);
  // Skip delivery charge detection if this looks like a bulk info message
  // e.g. "Sheikh Shahzad\nHouse R-165\nkarachi\nCell phone 03113225358\nIncluding delivery charges"
  // "Including delivery charges" is a STATEMENT, not a question — don't let it hijack bulk extraction
  const isBulkMsg = msg.split(/\n/).filter(ln => ln.trim()).length >= 3 && extractPhone(msg) !== null && extractCity(msg) !== null;
  if (isDeliveryChargeQ && !isBulkMsg) {
    return { intent: 'delivery_charge_question' };
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
    const hasPhoneField = /\b(number|phone|mobile|whatsapp|nmbr|nomber|ph[\s.]*no)\b/i.test(l);
    const hasAddressField = /\b(addre(?:ss|es|s|e)|adre(?:ss|es|s|e)?|adrees|city|mohall?ah?|tehsil|tahseel|zilla|zilah|district|gali|street|sector|famous\s*jagah?|mashh?oor)\b/i.test(l);
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

      // Pre-process: normalize dots-as-spaces (common in caps text like "ALTAF.HUSSAIN.S.O.TAJ")
      // Only when dots are between UPPERCASE words (not normal sentences with periods)
      let normalizedMsg = msg;
      if (/^[A-Z0-9\s.,\-:\/()]+$/.test(msg.trim())) {
        // All-caps message — dots likely used as separators
        normalizedMsg = msg.replace(/\.+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      }

      // Detect "S.O." / "s/o" / "D.O." / "d/o" / "W.O." / "w/o" name pattern
      // "ALTAF HUSSAIN S/O TAJ MUHAMMAD" or "ALTAF.HUSSAIN S.O.TAJ MAHAMMAHD"
      if (!extracted.name) {
        const soMatch = normalizedMsg.match(/^([A-Za-z][A-Za-z\s]{1,30}?)\s+(?:S[\s./]*O[\s./]*|s\/o|D[\s./]*O[\s./]*|d\/o|W[\s./]*O[\s./]*|w\/o)\s*([A-Za-z][A-Za-z\s]{1,30}?)(?:\s+(?:DISTRICT|MAIN|PH|PHONE|CITY|ADDRESS|MOHALL|NEAR|BLOCK|SECTOR|HOUSE|FLAT|0\d)|\s*$)/i);
        if (soMatch) {
          const titleCase = (s) => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          extracted.name = titleCase(soMatch[1].trim());
          // Store father name as context (not used in order but useful)
        }
      }

      // Name — parenthesized name like (sultan) OR "name:eman" / "name: eman" colon format
      const parenName = msg.match(/\(([A-Za-z\s]{2,30})\)/);
      if (parenName) extracted.name = parenName[1].trim();
      if (!extracted.name) {
        const colonName = msg.match(/\b(?:na+me?|naam)\s*[:\.\-="']\s*"?\s*([A-Za-z\s]{2,30})/i);
        if (colonName) extracted.name = colonName[1].trim().replace(/["']+$/, '').split(/\n/)[0].trim();
      }
      // Conversational name (voice transcriptions) — "Abdul Manan mera naam hai" / "mera naam hai Abdul Manan"
      if (!extracted.name) {
        // Forward: "X mera naam hai"
        const nameForward = msg.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:mera|meri)\s+(?:naam|name)\s+(?:hai|he|h)\b/i);
        if (nameForward) {
          const candidate = nameForward[1].trim();
          const isNotName = /^(Assalam|Salam|Hello|Address|Office|House|Phone|Mobile|Mere|Mera)$/i.test(candidate.split(/\s+/)[0]);
          if (!isNotName && candidate.length >= 3) extracted.name = candidate;
        }
        // Reverse: "mera naam X hai" / "mera naam hai X"
        if (!extracted.name) {
          const nameReverse = msg.match(/\b(?:mera|meri)\s+(?:naam|name)\s+(?:hai\s+|he\s+|h\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s+(?:hai|he|h))?\b/i);
          if (nameReverse) {
            const candidate = nameReverse[1].trim();
            const isNotName = /^(Hai|He|Address|Phone|Mobile|Number|Ye|Yeh)$/i.test(candidate.split(/\s+/)[0]);
            if (!isNotName && candidate.length >= 3) extracted.name = candidate;
          }
        }
      }
      // Name before phone number — "Sardar Shaukat 03001234567 address here..."
      // Match 1-3 capitalized words right before phone number
      // Parcel-label format: "[Name] Number/No : [phone] Addrees/Address : [address] City : [city]"
      // Common in Pakistan courier labels — name at start, then labeled fields with ":"
      if (!extracted.name) {
        const parcelLabel = msg.match(/^(.+?)\s*(?:Number|No|Phone|Mobile)\s*[:\.\-]\s*(?:\+?92|0)?3\d{2}[\s\-]?\d{7}/i);
        if (parcelLabel) {
          let nameCandidate = parcelLabel[1].trim();
          // Strip single-letter prefix like "M " (Mr/Mrs abbreviation)
          nameCandidate = nameCandidate.replace(/^[A-Za-z][\.\s]\s*/, '').trim();
          const isAlpha = /^[A-Za-z\s]{2,40}$/.test(nameCandidate) && nameCandidate.split(/\s+/).length <= 4;
          const isNotAddr = !/\b(flat|house|block|street|gali|office|plot|floor|sector|phase|colony)\b/i.test(nameCandidate);
          if (isAlpha && isNotAddr && nameCandidate.length >= 3) {
            extracted.name = nameCandidate;
          }
        }
      }
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

      // Address text — "address:", "addrees:", "adres:", "mohallah:", "gali:", etc. (separator REQUIRED to avoid matching "address pe bhi call")
      // Also match voice transcription format: "address mera hai [text]" / "address ye hai [text]"
      const addrMatch = msg.match(/\b(?:addre(?:ss|es|s|e)|adre(?:ss|es|s|e)?|adrees)\s*[:\.\-=]\s*(.+)/i) ||
        msg.match(/\b(?:addre(?:ss|es|s|e)|adre(?:ss|es|s|e)?|adrees)\s+(?:mera|meri|hamara|hamari|ye|yeh|hai|he|h)\s+(?:hai\s+|he\s+|h\s+)?(.+)/i);
      if (addrMatch) {
        let addrText = addrMatch[1].trim().split(/\n/)[0].trim();
        // Strip everything from "City :" / "Phone :" / "Number :" onwards (label + value)
        addrText = addrText.replace(/\s*\b(city|phone|number|mobile|contact|naam|name|province|state)\s*[:\.\-=]\s*.*/i, '').trim();
        // Strip leading form template text
        addrText = addrText.replace(/^(for\s+order\s+kindly\s+.*?details\s*[:\.\-=]?\s*)/i, '').trim();
        addrText = addrText.replace(/^addre(?:ss|es|s)\s*[:\.\-=]\s*/i, '').trim();
        if (addrText.length > 3) extracted.address_text = addrText;
      }

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
          let cityVal = cityMatch[1].trim().split(/\n/)[0].trim();
          // Strip phone numbers that may trail city name (e.g. "farooqabad 03002978745")
          cityVal = cityVal.replace(/\s*(?:\+?92|0)?3\d{2}[\s\-]?\d{7}/g, '').trim();
          // Strip trailing labels (e.g. "Province : Punjab")
          cityVal = cityVal.replace(/\s*\b(province|state|district|tehsil)\s*[:\.\-=]\s*.*/i, '').trim();
          if (cityVal.length >= 2) extracted.city = normalizeCity(cityVal);
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
        // Use LAST occurrence of city — voice transcriptions often mention city twice:
        // "mein Sialkot se bol raha hoon... address mera hai Sialkot City Mola Baeli"
        // First "Sialkot" is in greeting, last one is in address context
        const cityIdx = l.lastIndexOf(cityLower);
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
          // Remove phone/mobile labels (but NOT "flat number 101" / "house number 5" type address numbers)
          beforeCity = beforeCity.replace(/\b(?:phone|mobile|mob)\s*(?:number|no|nmbr|nomber)?\s*[:\.\-="']?\s*\d*/gi, '').trim();
          beforeCity = beforeCity.replace(/\b(?:number|nmbr|nomber)\s*[:\.\-="']\s*0?3\d{9}/gi, '').trim();
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
            afterCity = afterCity.replace(/\b(?:phone|mobile|mob)\s*(?:number|no|nmbr|nomber)?\s*[:\.\-="']?\s*\d*/gi, '').trim();
            afterCity = afterCity.replace(/\b(?:number|nmbr|nomber)\s*[:\.\-="']\s*0?3\d{9}/gi, '').trim();
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

      // Clean address_text — strip greetings, filler, and non-address text (common in voice transcriptions)
      if (extracted.address_text) {
        // Strip greetings at start
        extracted.address_text = extracted.address_text
          // Strip greetings
          .replace(/^(assalam[uo]?\s*al[ae]ikum|aoa|salam|w[ao]l[ae]ikum\s*assalam|hello|hi)\s*[,.\s]*/gi, '')
          .replace(/^(syed|sir|madam|bhai|yaar|sahab|sahib|janab)\s*[,.\s]*/gi, '')
          // Strip voice filler — "mujhe aik X chahiye", "aik A1 machine cheez address hai"
          .replace(/^(mujhe|muje|mjhe|mje)\s+.{0,40}?(hai|he|h|chahiye|chahea)\b[.,\s]*/gi, '')
          .replace(/^(aik|ek|1)\s+.{0,30}?(hai|he|h|chahiye|chahea)\b[.,\s]*/gi, '')
          .replace(/^(ye|yeh|mera|meri|hamara|hamari|apna|apni)\s+(address|order|naam|name)\s*(hai|he|h|ye|yeh)?\s*[,.\s]*/gi, '')
          .replace(/^(address|addres|adres)\s*(hai|he|h|ye|yeh)?\s*[,.\s]*/gi, '')
          // Strip province/division/sooba prefixes
          .replace(/\b(sooba|soba|province|state)\s+[A-Za-z\s]+?\s*(division|zila|district|,)/gi, '$2')
          .replace(/\b(division)\s+[A-Za-z]+\s*,?\s*/gi, '')
          .replace(/\b(zila|zilah|district)\s+/gi, 'District ')
          .replace(/^[,.\s]+|[,.\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
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
  // SKIP: If message contains phone number → it's info submission (e.g. "Aslam 03452198887" = name + phone, not greeting)
  const isGreetingState = ['IDLE', 'GREETING', 'PRODUCT_SELECTION', 'PRODUCT_INQUIRY', 'HAGGLING'].includes(currentState);
  const isCollectState = currentState.startsWith('COLLECT_');
  if ((isGreetingState || isCollectState) && !hasPhoneNumber) {
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

  // 8b. YES in GREETING/PRODUCT_SELECTION → show product list
  // In PRODUCT_SELECTION: "hn" after "list dekhni hai?" = show products via template
  // BUT if a specific product is mentioned, skip to product detection instead
  if (currentState === 'PRODUCT_SELECTION') {
    const isShortYes = /^(ha+n|ji+|yes+|hn|hm+|g|ok|okay|jee|dikhao|dikhado|batao|dekhna)\s*[.!]?\s*$/i.test(l);
    if (isShortYes && !detectProduct(msg)) {
      return { intent: 'show_products' };
    }
  }
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
    const engOrderIntent = /\b(wan[nrt]?[aoe]?\s*(to\s*)?(order|ordr|ordeer|ordar|odr)|wanna\s*(order|ordr)|need\s*to\s*(order|ordr)|i\s*want\s*to\s*(order|ordr|buy)|want\s*to\s*(buy|order|ordr|purchase))\b/i.test(l) ||
      /\b(order|ordr|ordeer)\s*kr?n?a?\s*(hai|he|h|ha|chahta|chahti)?\b/i.test(l) ||
      /\b(order|ordr)\s*karb?a?\s*(hai|he|h|ha)?\b/i.test(l) ||
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

  // Product-like request but no match → "product not available"
  // Detect if customer is asking for a product we don't carry
  if (!product && !isCollectionState) {
    const isProductRequest = /\b(h[ae]?[iy]?\s*k[iy]?a?\s*$|milta|milt[ie]|available|stock|rakh?t[eiy]|pass|paas)\b/i.test(l) ||
      /\b(chahiye|chahea|order\s*kr|mangwa|lena|bhej\s*do)\b/i.test(l);
    const hasProductWord = /\b(roller|wax\s*roller|hair\s*dryer|dryer|blower|iron|straightener|curler|steamer|juicer|blender|mixer|fryer|toaster|kettle|heater|cooler|fan|camera|watch|phone|charger|cable|headphone|earphone|speaker|power\s*bank|led|bulb|torch|scale|thermometer)\b/i.test(l);
    if (hasProductWord || (isProductRequest && msg.split(/\s+/).length <= 8)) {
      return { intent: 'product_not_available' };
    }
  }

  // No match → let AI handle
  return null;
}

module.exports = { preCheck, isYes, isNo, isComplaint };
