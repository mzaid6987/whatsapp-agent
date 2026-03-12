/**
 * AI Fallback: reduced prompt builder + call decision logic
 * Only called for address collection and ambiguous messages
 */
const { chat } = require('../ai/claude');
const { PRODUCTS, fmtPrice } = require('./data');

// ============= REDUCED SYSTEM PROMPT =============
// ~1,800 tokens instead of ~3,500 — only state-relevant rules
function buildReducedPrompt(storeName, currentState, collected, product) {
  const productInfo = product ? `${product.short}: Rs.${product.price}` : 'none';

  const productCatalog = PRODUCTS.map(p => `- ${p.short}: ${fmtPrice(p.price)} — ${p.f1}${p.desc ? '. ' + p.desc : ''}`).join('\n');

  let stateRules = '';

  if (currentState === 'COLLECT_ADDRESS') {
    const ap = collected.address_parts || {};
    stateRules = `
## ADDRESS COLLECTION (FULL AI MODE)
Customer ka city: ${collected.city || 'unknown'}
Address parts collected so far:
- area: ${ap.area || 'MISSING'}
- street/gali/block: ${ap.street || 'MISSING'}
- house number: ${ap.house === 'nahi_pata' ? 'customer ko nahi pata' : (ap.house || 'MISSING')}
- landmark: ${ap.landmark || 'MISSING'}

TERA KAAM: Customer ka message parse kar, address parts extract kar, aur NEXT missing part naturally pucho.

STEP-BY-STEP RULES:
1. Message se jo bhi address info mile — extract karke collected.address_parts mein update kar
2. Har message ke baad dekh: kya area + (house OR named landmark) mil gaya?
3. Agar MISSING hai kuch → naturally pucho (ek waqt mein SIRF ek cheez)
4. Agar "nahi pata" / "pta nhi" bole house ke liye → house = "nahi_pata", phir landmark LAZMI pucho
5. Generic landmark ("masjid ke paas") → "Konsi masjid? Naam bata dein" pucho
6. Named landmark ("Bilal Masjid ke paas") → accept karo

PRIORITY ORDER: area → street → house → landmark
- Area PEHLE chahiye — bina area ke aage mat badho
- Street optional but pucho agar area mil gaye
- House number ya named landmark mein se ek LAZMI

COMPLETENESS = area + (house OR named_landmark)
Jab COMPLETE ho → collected.address_parts mein sab update kar, aur collected.address_complete = true set kar

STRICT:
- State HAMESHA "COLLECT_ADDRESS" rakhna — KABHI ORDER_SUMMARY/ORDER_CONFIRMED mat set karo
- SIRF address collect karo — order confirm/upsell/COD KABHI mat bolo
- Ek message mein SIRF ek kaam karo
- Reply CHHOTA rakho — 1-2 sentences max
- Customer ki city ke hisab se area names samjho (har city ke apne areas hain)
- CITY CHANGE NAHI: collected.city ko KABHI change mat kar. Agar customer ne city "${collected.city || '?'}" di hai to wohi rakhni hai. Agar customer KHUD city change karna chahe to state "COLLECT_CITY" set kar — lekin tu apni taraf se koi city guess/invent mat kar.

RESPONSE FORMAT mein collected.address_parts LAZMI update karo:
"collected": { ...existing, "address_parts": {"area":"...","street":"...","house":"...","landmark":"..."}, "address_complete": true/false }`;
  } else {
    // General handling for UNKNOWN intent in non-address states
    stateRules = `
## GENERAL HANDLING
Customer ka message samajh kar Roman Urdu mein jawab de. Helpful aur friendly reh.

Available products:
${productCatalog}

GOALS:
- Agar product ke baare mein pooch raha hai → product info de (price + features), phir order ke liye pooch
- Agar order karna chahta hai → product select karne mein help kar
- Agar koi sawal hai (COD, delivery, quality, exchange) → jawab de
- Agar haggle kar raha hai → politely handle kar, COD advantage mention kar
- Conversation ko sale ki taraf guide kar — lekin forceful mat ho

STATE GUIDE:
- Agar customer ne product select kiya aur order chahta hai → state = "COLLECT_NAME", collected mein product set kar
- Agar sirf product info di hai → state = "PRODUCT_INQUIRY"
- Agar general baat ho rahi hai → state = "GREETING"
- Jis state mein hai usi mein reh agar koi transition nahi banta
- KABHI ORDER_CONFIRMED ya ORDER_SUMMARY state set mat karo — yeh state machine ka kaam hai
- Tu SIRF ek step handle kar — ek message mein multiple steps (order confirm + upsell) KABHI mat kar
- KABHI "order save/confirm ho gaya" mat bol — order confirm karna tera kaam nahi

CASUAL GREETINGS (kya haal hai, kaise ho, etc):
- Tu sales agent hai, insaan NAHI. "main theek hoon" ya "Alhamdulillah" KABHI mat bol.
- Casual greetings ka jawab: seedha product/order ki taraf redirect kar.
- Example: "kya haal he" → "Ji sir/madam! Koi product dekhna hai ya order karna hai?"
- KABHI "aap kaise ho" wapas mat pucho`;
  }

  return `Tu ${storeName || 'hamari shop'} ka WhatsApp sales assistant hai. Roman Urdu mein jawab de.

RULES:
- Max 2-3 sentences. "aap" use kar. "sir" ya "madam" use kar (naam se gender detect kar).
- KABHI "bhai/yaar/baji" mat bolo.
- Emoji NAHI. Banned: "premium", "high", "ultra", "best", "order ready hai"
- HAMESHA "aap" — KABHI "tum/tujhe" nahi
- "Hamare paas" bolo — KABHI "hum ke paas" mat bolo (grammatically galat hai)
- "Hamari" bolo — KABHI "hum ki" mat bolo
- Generic questions NAHI jaise "konsi pasand aayegi?", "kya chahiye aapko?". Direct bolo jaise "order karun?", "detail batau?"
- Delivery bilkul FREE hai — koi charges nahi. Cash on Delivery (COD) hai.
- Discount available hai agar customer pooche — "order karein to discount milega" bolo. KABHI "mujhe pata nahi" mat bolo discount ke baare mein.

Current state: ${currentState}
Product: ${productInfo}
Collected: ${JSON.stringify(collected)}

${stateRules}

RESPONSE FORMAT (STRICT):
{"reply":"...","state":"${currentState}","collected":${JSON.stringify(collected)},"needs_human":false}

STATE values: IDLE, GREETING, PRODUCT_INQUIRY, PRODUCT_SELECTION, COLLECT_NAME, COLLECT_PHONE, COLLECT_DELIVERY_PHONE, COLLECT_CITY, COLLECT_ADDRESS, ORDER_SUMMARY, UPSELL_HOOK, UPSELL_SHOW, ORDER_CONFIRMED, HAGGLING, COMPLAINT

IMPORTANT: "collected" mein jo data ab tak mila hai woh UPDATE karo. Address partial ho to jo mila hai woh rakho, bina missing fields ke.
Address ke liye: address_parts update karo aur address_complete flag set karo jab complete ho. State COLLECT_ADDRESS hi rakhna.`;
}

// ============= SHOULD USE AI? =============
function shouldUseAI(intent, currentState, unknownCount, messageLength) {
  // Always use AI for address collection
  if (currentState === 'COLLECT_ADDRESS') return true;

  // Any UNKNOWN intent → AI handles it
  if (intent === 'UNKNOWN') return true;

  return false;
}

// ============= CALL AI =============
async function callAI(apiKey, message, state, storeName, lastMessages) {
  const prompt = buildReducedPrompt(
    storeName,
    state.current,
    state.collected,
    state.product
  );

  // Only send last 3 messages for context (not full history)
  const recentMessages = (lastMessages || []).slice(-3);
  recentMessages.push({ role: 'user', content: message });

  const startTime = Date.now();
  const result = await chat(apiKey, prompt, recentMessages);
  const responseMs = Date.now() - startTime;

  if (!result) {
    return {
      reply: 'Ji, kuch samajh nahi aaya. Dobara bata dein?',
      state: state.current,
      collected: state.collected,
      needs_human: false,
      tokens_in: 0,
      tokens_out: 0,
      response_ms: responseMs,
    };
  }

  return {
    ...result,
    response_ms: responseMs,
  };
}

module.exports = { buildReducedPrompt, shouldUseAI, callAI };
