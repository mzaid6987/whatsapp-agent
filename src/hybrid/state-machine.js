/**
 * State Machine — Simplified for AI-first mode
 *
 * Handles ONLY template-only states (ORDER_SUMMARY, UPSELL, ORDER_CONFIRMED)
 * and utility functions (nextMissingState, buildVars, buildOrderSummary, confirmOrder)
 *
 * AI handles: GREETING, PRODUCT_INQUIRY, COLLECT_NAME, COLLECT_ADDRESS, HAGGLING
 * Code handles: ORDER_SUMMARY, UPSELL_HOOK, UPSELL_SHOW, ORDER_CONFIRMED
 */

const { fillTemplate } = require('./templates');
const { validatePhone, extractCity, detectProduct, buildAddressString } = require('./extractors');
const { PRODUCTS, UPSELL_MAP, getHonorific, deliveryTime, fmtPrice, productList } = require('./data');
const { isYes, isNo } = require('./pre-check');
const { getAreaSuggestions } = require('./city-areas');

// DB models for order persistence
const orderModel = require('../db/models/order');
const customerModel = require('../db/models/customer');

// ============= NEXT MISSING FIELD =============
function nextMissingState(collected) {
  if (!collected.name) return 'COLLECT_NAME';
  if (!collected.phone) return 'COLLECT_PHONE';
  if (collected.delivery_phone === null) return 'COLLECT_DELIVERY_PHONE';
  if (!collected.city) return 'COLLECT_CITY';
  if (!collected.address) return 'COLLECT_ADDRESS';
  return 'ORDER_SUMMARY';
}

// ============= BUILD VARS FOR TEMPLATES =============
function buildVars(state, storeName) {
  const c = state.collected;
  const product = state.product;
  const honorific = getHonorific(c.name, state.gender);
  const items = (state.products || []).length ? state.products : (product ? [product] : []);
  let total = items.reduce((s, p) => s + p.price, 0);
  // Haggle discount applies ONLY to main product, not upsell items
  if (state.discount_percent && product) total -= Math.round(product.price * state.discount_percent / 100);

  // Alt phone: if delivery_phone is a different number (not "same"), include it
  const altPhone = (c.delivery_phone && c.delivery_phone !== 'same' && c.delivery_phone !== c.phone) ? c.delivery_phone : '';
  // Phone display: show both if alt exists
  const phoneDisplay = altPhone ? `${c.phone || ''} / ${altPhone}` : (c.phone || '');

  return {
    store_name: storeName || 'hamari shop',
    name: c.name || '',
    honorific,
    phone: phoneDisplay,
    main_phone: c.phone || '',
    alt_phone: altPhone,
    city: c.city || '',
    address: c.address || '',
    delivery_time: deliveryTime(c.city),
    product_name: product ? product.name : '',
    product_short: product ? product.short : '',
    price: product ? product.price.toLocaleString() : '',
    f1: product ? product.f1 : '',
    f2: product ? product.f2 : '',
    desc: product ? (product.desc || '') : '',
    product_list: productList(),
    items_list: items.map(p => {
      // Show discounted price for main product if haggle discount exists
      const isMainProduct = state.product && p.short === state.product.short && p.price === state.product.price;
      const dp = isMainProduct && state.discount_percent ? Math.round(p.price * (1 - state.discount_percent / 100)) : p.price;
      return `- ${p.short}: ${fmtPrice(dp)}`;
    }).join('\n'),
    total: total.toLocaleString(),
    discount_percent: state.discount_percent || 0,
    discounted_price: product ? Math.round(product.price * (1 - (state.discount_percent || 0) / 100)).toLocaleString() : '',
    discount_amount: product ? Math.round(product.price * (state.discount_percent || 0) / 100) : 0,
    area_suggestions: getAreaSuggestions(c.city) || '',
    city_hint: state._cityHint || '',
  };
}

// ============= ORDER SUMMARY =============
function buildOrderSummary(state, storeName) {
  state.current = 'ORDER_SUMMARY';
  const vars = buildVars(state, storeName);
  return { reply: fillTemplate('ORDER_SUMMARY', vars), state: 'ORDER_SUMMARY' };
}

// ============= CONFIRM ORDER =============
function confirmOrder(state, storeName, prefix = '') {
  state.current = 'ORDER_CONFIRMED';
  state._thanked = false; // reset for post-order thanks tracking
  const items = (state.products || []).length ? state.products : [state.product];
  let subtotal = items.reduce((s, p) => s + p.price, 0);
  // Haggle discount applies ONLY to main product, not upsell items (they already have adjusted prices)
  const mainProductPrice = state.product ? state.product.price : subtotal;
  const discountTotal = state.discount_percent ? Math.round(mainProductPrice * state.discount_percent / 100) : 0;
  const grandTotal = subtotal - discountTotal;

  // If order already saved (from ORDER_SUMMARY yes), update it; otherwise create new
  let oid = state._saved_order_id;
  if (oid) {
    // Update existing order with upsell items/discount
    try {
      orderModel.updateOrder(oid, {
        items: items.map(p => ({ name: p.short, price: p.price, quantity: 1 })),
        subtotal, discount_percent: state.discount_percent || 0,
        discount_total: discountTotal, grand_total: grandTotal,
      });
      console.log('[Order] Updated:', oid);
    } catch (e) { console.error('[Order] Update error:', e.message); }
  } else {
    oid = orderModel.generateOrderId('NRV');
    try {
      // Use pre-attached DB IDs (set in index.js), fallback to phone lookup
      const customer = state._db_customer_id ? { id: state._db_customer_id } : (state.collected.phone ? customerModel.findByPhone(state.collected.phone) : null);
      if (!customer) {
        console.error('[Order] SKIP save — no customer found for phone:', state.collected.phone);
      }
      orderModel.create({
        order_id: oid,
        conversation_id: state._db_conversation_id || null,
        customer_id: customer?.id || null,
        store_name: storeName || 'nureva',
        customer_name: state.collected.name,
        customer_phone: state.collected.phone,
        delivery_phone: state.collected.delivery_phone || null,
        customer_city: state.collected.city,
        customer_address: state.collected.address,
        items: items.map(p => ({ name: p.short, price: p.price, quantity: 1 })),
        subtotal, delivery_fee: 0,
        discount_percent: state.discount_percent || 0,
        discount_total: discountTotal,
        grand_total: grandTotal,
        source: 'bot',
      });
      if (customer) {
        customerModel.incrementOrders(customer.id, grandTotal);
        customerModel.update(customer.id, { last_address: state.collected.address });
      }
      console.log('[Order] Saved:', oid);
    } catch (e) { console.error('[Order] DB save error:', e.message); }
  }

  const vars = buildVars(state, storeName);
  vars.order_id = oid;
  vars.total = grandTotal.toLocaleString();

  return { reply: prefix + fillTemplate('ORDER_CONFIRMED', vars), state: 'ORDER_CONFIRMED' };
}

// ============= TEMPLATE-ONLY STATE HANDLER =============
// Handles ORDER_SUMMARY, UPSELL_HOOK, UPSELL_SHOW, ORDER_CONFIRMED, COMPLAINT
// These states don't need AI — fixed responses with yes/no logic
function handleTemplateState(message, state, storeName, preIntent) {
  const l = message.toLowerCase().trim();
  const vars = buildVars(state, storeName);
  // Use pre-detected intent if available, otherwise use strict detection
  const flexYes = /\b(ha+n|hm+|ji+|jee|g|yes+|yess+|shi|sai|sahi|bilkul|confir\w*|ik|o?k+a*y+|o?ki+|ok\s*ok|ok[zgky]?|done|theek|thik|thk|tik|zaroor|kr\s*do|kardo|krdo|kar\s*do|bhej\s*d[oae]|bhejd[oae]|bhij\s*d[oae]|bhijd[oae]|bhaj\s*d[oae]|bhajd[oae]|bhwj\s*d[oae]|bhwjd[oae]|bhjdo|bhjd[oae]|bhejwa\s*d[oae]|bhijwa\s*d[oae]|bhijwad[oae]|bhejwad[oae]|mangwa\s*d[oae]|mangwad[oae]|mngwa\s*d[oae]|mngwad[oae]|laga\s*d[oae]|lagad[oae]|lgad[oae]|lga\s*d[oae])\b/i.test(l);
  const flexNo = /\b(nahi|nhi|no|galat|nope|na+h|mat|cancel|rehne\s*do|bas|choro|chor\s*do|chod\s*do|chhoro|chhod\s*do|rhn\s*do|jane\s*do)\b/i.test(l);
  // Handle "kuch nahi sab sahi hai" = yes (nahi negates "change", not order)
  const negatedNo = /\b(kuch\s*nahi|koi\s*nahi|nahi\s*kuch|change\s*nahi|nahi\s*change)\b/i.test(l) && /\b(sahi|theek|thik|done|ok|confirm|bilkul)\b/i.test(l);
  const yes = preIntent === 'yes' || negatedNo || (flexYes && !flexNo) || isYes(l);
  const no = preIntent === 'no' || (!negatedNo && flexNo && !flexYes) || isNo(l);

  switch (state.current) {

    // ===== ORDER SUMMARY =====
    case 'ORDER_SUMMARY': {
      // Quality/reassurance questions — "kharab to nahi hoga?", "quality theek hai?", "original hai?"
      // These contain "nahi" but are NOT rejection — customer is just worried, reassure them
      // Patterns: "quality to khrab nahi hogi?", "kharab to nahi hoga?", "tootega to nahi?", "quality kaisi hai?"
      const hasWorryWord = /\b(kh?[au]?ra+b|khrab|khrb|toot|toote?g[aie]|break|quality|qlty|original|asli|fake|naqli|copy)\b/i.test(l);
      const hasNahi = /\b(nahi|nhi|na|ni)\b/i.test(l);
      const hasToNahi = /\b(to|toh?)\b/i.test(l) && hasNahi;
      const hasNahiVerb = /\b(nahi|nhi|na)\s*(hog[aie]|hota|hoti|ho|hoig)\b/i.test(l);
      const isQualityAsk = /\b(quality|qlty)\s*(kais[ie]|kesi|kaisi|theek|thik|achi|acha)\s*(h[ae]i?|he|hogi|hoga)?\s*[?؟]?\s*$/i.test(l) ||
        /\b(che+z|chij|product|item)\s*(kais[ie]|kesi|kaisi)\s*(h[ae]i?|he|hogi)?\s*[?؟]?\s*$/i.test(l) ||
        /\b(kais[ie]|kesi|kaisi)\s*(h[ae]i?|he)\s*(che+z|chij|product|quality|item)\b/i.test(l);
      const isReassurance = (hasWorryWord && (hasToNahi || hasNahiVerb)) || isQualityAsk;
      if (isReassurance) {
        const productDesc = state.product?.f2 || state.product?.f1 || '';
        const reassureReply = productDesc
          ? `Bilkul ${vars.honorific}, fikar na karein! ${productDesc}. Order confirm karein? ✅`
          : `Bilkul ${vars.honorific}, fikar na karein — product tested hai. Order confirm karein? ✅`;
        return { reply: reassureReply, state: 'ORDER_SUMMARY' };
      }
      if (yes) {
        // Save order to DB IMMEDIATELY so it's never lost (even if customer doesn't reply to upsell)
        const items = (state.products || []).length ? state.products : [state.product];
        let subtotal = items.reduce((s, p) => s + p.price, 0);
        const discountTotal = state.discount_percent ? Math.round(subtotal * state.discount_percent / 100) : 0;
        const grandTotal = subtotal - discountTotal;
        const oid = orderModel.generateOrderId('NRV');
        try {
          const customer = state._db_customer_id ? { id: state._db_customer_id } : (state.collected.phone ? customerModel.findByPhone(state.collected.phone) : null);
          orderModel.create({
            order_id: oid,
            conversation_id: state._db_conversation_id || null,
            customer_id: customer?.id || null,
            store_name: storeName || 'nureva',
            customer_name: state.collected.name,
            customer_phone: state.collected.phone,
            delivery_phone: state.collected.delivery_phone || null,
            customer_city: state.collected.city,
            customer_address: state.collected.address,
            items: items.map(p => ({ name: p.short, price: p.price, quantity: 1 })),
            subtotal, delivery_fee: 0,
            discount_percent: state.discount_percent || 0,
            discount_total: discountTotal,
            grand_total: grandTotal,
            source: 'bot',
          });
          if (customer) {
            customerModel.incrementOrders(customer.id, grandTotal);
            customerModel.update(customer.id, { last_address: state.collected.address });
          }
          console.log('[Order] Saved early:', oid);
        } catch (e) { console.error('[Order] Early save error:', e.message); }
        state._saved_order_id = oid;

        // Check upsell — show ALL products except the ones already ordered
        const ordered = items.map(p => p.id);
        state.upsell_candidates = PRODUCTS.filter(p => !ordered.includes(p.id));

        if (state.upsell_candidates.length) {
          state.current = 'UPSELL_HOOK';
          const hookVars = buildVars(state, storeName);
          return { reply: fillTemplate('UPSELL_HOOK', hookVars), state: 'UPSELL_HOOK' };
        }
        // No upsell candidates — just show confirmation (order already saved)
        state.current = 'ORDER_CONFIRMED';
        state._thanked = false;
        const cVars = buildVars(state, storeName);
        cVars.order_id = oid;
        cVars.total = grandTotal.toLocaleString();
        return { reply: fillTemplate('ORDER_CONFIRMED', cVars), state: 'ORDER_CONFIRMED' };
      }
      if (no) {
        state._no_count = (state._no_count || 0) + 1;
        if (state._no_count >= 3) {
          // 3 consecutive "no" — offer cancel or human
          state._no_count = 0;
          return { reply: 'Lagta hai kuch theek nahi. Order cancel karna hai ya kisi cheez mein madad chahiye? "Cancel" bolen ya kya change karna hai bata dein.', state: 'ORDER_SUMMARY' };
        }
        return { reply: fillTemplate('WHAT_TO_CHANGE', vars), state: 'ORDER_SUMMARY' };
      }
      // Change requests — but NOT "tumhara naam kya hai" / "what is your name" (bot identity)
      const isBotNameQ = /\b(tumhara|apka|aapka|tera|your)\s*(naam|name)\b/i.test(l) ||
        /\b(what\s*is\s*your|whats?\s*your)\s*name\b/i.test(l);
      if ((l.includes('naam') || l.includes('name')) && !isBotNameQ) {
        state.collected.name = null;
        state.current = 'COLLECT_NAME';
        return { reply: fillTemplate('CHANGE_NAME', vars), state: 'COLLECT_NAME' };
      }
      if (l.includes('phone') || l.includes('number') || l.includes('nmbr')) {
        state.collected.phone = null;
        state.current = 'COLLECT_PHONE';
        return { reply: fillTemplate('CHANGE_PHONE', vars), state: 'COLLECT_PHONE' };
      }
      if (l.includes('address') || l.includes('pata')) {
        state.collected.address = null;
        state.collected.address_parts = { area: null, street: null, house: null, landmark: null };
        state.address_step = null;
        state.address_confirming = false;
        state.current = 'COLLECT_ADDRESS';
        return { reply: fillTemplate('CHANGE_ADDRESS', vars), state: 'COLLECT_ADDRESS' };
      }
      if (l.includes('city') || l.includes('sheher') || l.includes('shehr') || l.includes('zila') || l.includes('zilla') || l.includes('tehsil')) {
        // Try to extract city name from the message itself
        const cityInMsg = extractCity(message);
        const tehsilInMsg = message.match(/\b(?:tehsil|city|sheher|shehr)\s*[:\s]\s*([A-Za-z\s]{2,25})/i);
        const zillaInMsg = message.match(/\b(?:zila|zilla|district)\s*[:\s]\s*([A-Za-z\s]{2,25})/i);
        // Tehsil = actual town, prefer over zilla
        const newCity = tehsilInMsg ? tehsilInMsg[1].trim() : (cityInMsg || (zillaInMsg ? zillaInMsg[1].trim() : null));
        if (newCity) {
          state.collected.city = newCity.charAt(0).toUpperCase() + newCity.slice(1);
          state.collected.address = null; // Reset address to rebuild with new city
          // Re-show order summary with new city
          const smResult = buildOrderSummary(state, storeName);
          state.current = smResult.state;
          return { reply: smResult.reply, state: smResult.state };
        }
        state.collected.city = null;
        state.collected.address = null;
        state.current = 'COLLECT_CITY';
        return { reply: fillTemplate('CHANGE_CITY', vars), state: 'COLLECT_CITY' };
      }
      // Delivery time question — answer it, then re-ask confirm
      if (/\b(k[ae]?b\s*(t[ae]?k|aaye?|milega|ayga|aye?\s*ga)|kitne?\s*din|delivery|tracking|kb\s*tk|kb\s*ayga)\b/i.test(l)) {
        const delReply = fillTemplate('DELIVERY_POST_ORDER', vars);
        return { reply: delReply + '\n\nOrder place kar dun? Haan bolen ya kuch change karna ho to bata dein.', state: 'ORDER_SUMMARY' };
      }
      return { reply: fillTemplate('CONFIRM_PROMPT', vars), state: 'ORDER_SUMMARY' };
    }

    // ===== UPSELL HOOK =====
    case 'UPSELL_HOOK': {
      // Delivery time query — answer it, then continue upsell
      if (/\b(k[ae]?b\s*(t[ae]?k|aaye?|milega|ayga|aye?\s*ga)|kitne?\s*din|delivery|tracking|kb\s*tk|kb\s*ayga)\b/i.test(l)) {
        const delReply = fillTemplate('DELIVERY_POST_ORDER', vars);
        return { reply: delReply + '\n\nWaise discount products dekhna chahein ge?', state: 'UPSELL_HOOK' };
      }
      if (yes || l.includes('dikhao') || l.includes('dikao') || l.includes('dikha') || l.includes('dekhao') || /\b(discount|offer|sast[ai])\b/i.test(l)) {
        state.current = 'UPSELL_SHOW';
        let uList = state.upsell_candidates.map((p, i) => {
          const upsellPrice = Math.max((p.upsell_price || p.price) - 500, 499);
          return `${i + 1}. ${p.short} — ${fmtPrice(upsellPrice)}`;
        }).join('\n');
        const uVars = { ...vars, upsell_list: uList };
        return { reply: fillTemplate('UPSELL_SHOW', uVars), state: 'UPSELL_SHOW' };
      }
      if (no) {
        return confirmOrder(state, storeName);
      }
      return { reply: fillTemplate('UPSELL_ASK_YESNO', vars), state: 'UPSELL_HOOK' };
    }

    // ===== UPSELL SHOW =====
    case 'UPSELL_SHOW': {
      if (no) {
        // If pending upsell and customer says no → skip just the pending, confirm order
        if (state._pending_upsell) {
          state._pending_upsell = null;
        }
        return confirmOrder(state, storeName);
      }
      // YES to pending upsell — add it to order
      if (yes && state._pending_upsell) {
        const up = state._pending_upsell;
        state._pending_upsell = null;
        if (!(state.products || []).length) state.products = [state.product];
        state.products.push(up);
        return confirmOrder(state, storeName, `Done! ${up.short} bhi add ho gaya.\n\n`);
      }
      // Discount/offer query OR price reduction — handle both together
      // Matches: discount/discoutn/disocunt/discont, offer, sasti, 75%, price km kro, mehngi, etc.
      const isDiscountAsk = /\b(disc?o?u?n?t|discoutn|disocunt|discont|disovutn|dicsount|dscount|discout|discoumt|dicount|discunt|discoynt|off|offer|sast[ai]|sasti\s*kr|kam\s*price|price\s*kam|75%?|percent)\b/i.test(l) ||
        /\b(price\s*km|km\s*kr|km\s*kro|km\s*price|mehn?g[aio]|mehng[aio]|zya+da|bohot?\s*(zya+da|mehn?g[aio])|rate\s*km|km\s*rate|pais[ey]\s*km|pesy\s*km|qeemat\s*km|daam\s*km|thora\s*km)\b/i.test(l) ||
        /\d{3,}\s*(ki|me|mein|mey|mai|ka|rs|rupay?|pe)\s*(de|do|dedo|de\s*do|kr|kro|kardo|rakh|rkh)/i.test(l);
      if (isDiscountAsk) {
        // If pending upsell product, give discount on THAT product
        if (state._pending_upsell) {
          const up = state._pending_upsell;
          const baseUpsellPrice = Math.max((up.upsell_price || up.price) - 500, 499);
          // Track upsell haggle rounds — give Rs.100 extra off on 2nd ask (max 1 extra)
          if (!state._upsell_haggle) state._upsell_haggle = 0;
          state._upsell_haggle++;
          const extraOff = state._upsell_haggle >= 2 ? 100 : 0;
          const finalPrice = Math.max(baseUpsellPrice - extraOff, 399);
          state._pending_upsell = up; // keep pending
          if (extraOff > 0) {
            return { reply: `Chalo ${getHonorific(state.collected.name)}, aapke liye Rs.${finalPrice.toLocaleString()} final — original Rs.${up.price.toLocaleString()} tha 🏷️ Add kar dun order mein? 😊`, state: 'UPSELL_SHOW' };
          }
          return { reply: `${up.short} already discounted price Rs.${finalPrice.toLocaleString()} pe mil raha hai — original Rs.${up.price.toLocaleString()} tha 🏷️ Add karna hai order mein? 😊`, state: 'UPSELL_SHOW' };
        }
        // No specific upsell product selected yet — ask customer to pick first
        let uList = state.upsell_candidates.map((p, i) =>
          `${i + 1}. ${p.short} — Rs.${Math.max((p.upsell_price || p.price) - 500, 499).toLocaleString()}`
        ).join('\n');
        return { reply: `Pehle batayein konsa product pasand aaya? Number ya naam bata dein 😊\n\n${uList}`, state: 'UPSELL_SHOW' };
      }
      // Number pick — "8", "8 wala", "8 number", "number 8", "# 8", "no 8"
      const nm = l.match(/^(\d)\s*(wala|vala|wali|number|no\.?|nmbr)?\s*$/i) ||
                 l.match(/^(?:number|no\.?|nmbr|#)\s*(\d)\s*(wala|vala)?\s*$/i);
      if (nm) {
        const digit = nm[1];
        const idx = parseInt(digit) - 1;
        if (idx >= 0 && idx < state.upsell_candidates.length) {
          const up = { ...state.upsell_candidates[idx] };
          const upsellPrice = Math.max((up.upsell_price || up.price) - 500, 499);
          // Ask before adding — don't auto-add
          state._pending_upsell = { ...up, price: upsellPrice };
          return { reply: `${up.short} — Rs.${upsellPrice.toLocaleString()} 🏷️ Add kar dun order mein? 😊`, state: 'UPSELL_SHOW' };
        }
      }
      // Product detection
      const sel = detectProduct(message);
      // Check if customer mentioned their already-ordered product
      const orderedIds = ((state.products || []).length ? state.products : [state.product]).map(p => p.id);
      if (sel && orderedIds.includes(sel.id)) {
        return { reply: `${sel.short} to aap already order kar chuke hain ${getHonorific(state.collected.name)}! In mein se koi aur add karna hai?`, state: 'UPSELL_SHOW' };
      }
      const uMatch = sel ? state.upsell_candidates.find(p => p.id === sel.id) : null;
      if (uMatch) {
        // Check if customer EXPLICITLY wants to add (vs just mentioning product name)
        const isExplicitAdd = /\b(add|bhi|daal|dal|laga|order|chahiye|chaiye|chahea|le\s*lo|le\s*lena|mangwa|yeh\s*bhi)\b/i.test(l);
        if (isExplicitAdd) {
          // Explicit add intent — add directly with upsell discounted price
          const addUp = { ...uMatch };
          addUp.price = Math.max((addUp.upsell_price || addUp.price) - 500, 499);
          if (!(state.products || []).length) state.products = [state.product];
          state.products.push(addUp);
          return confirmOrder(state, storeName, `Done! ${addUp.short} bhi add ho gaya.\n\n`);
        }
        // Just product name or inquiry — show info first with upsell discounted price, ask to add
        const upsellPrice = Math.max((uMatch.upsell_price || uMatch.price) - 500, 499);
        const infoReply = `${uMatch.name} — Rs.${upsellPrice.toLocaleString()} 🏷️ ${uMatch.f1} aur ${uMatch.f2}. Add karna hai order mein? 😊`;
        state._pending_upsell = uMatch;
        return { reply: infoReply, state: 'UPSELL_SHOW' };
      }
      // Quality/functionality question about pending upsell product
      // "kese kam krti he", "how does it work", "kya chez he"
      const isFuncQ = /\b(kam\s*kr[yta]*[aie]?|kaam\s*kr[yta]*[aie]?|kam\s*kar[tae]*[aie]?|kaam\s*kar[tae]*[aie]?|works?|kese|kaise|kaisy|kesy)\s*(kam|work|use|chalt?[aie]?)?\b/i.test(l) ||
        /\b(kya\s*(chez|cheez|chiz)|ye\s*kya\s*(hai|he|h)|batao\s*(is|iske?))\b/i.test(l);
      if (isFuncQ) {
        // If pending upsell, answer about that product
        const funcProduct = state._pending_upsell || (sel ? state.upsell_candidates.find(p => p.id === sel.id) : null);
        if (funcProduct) {
          const upsellPrice = Math.max((funcProduct.upsell_price || funcProduct.price) - 500, 499);
          const infoReply = `${funcProduct.name} — Rs.${upsellPrice.toLocaleString()}. ${funcProduct.f1} aur ${funcProduct.f2}. Add karna hai order mein?`;
          state._pending_upsell = funcProduct;
          return { reply: infoReply, state: 'UPSELL_SHOW' };
        }
      }
      // Pending upsell — customer said yes after seeing product info
      if (state._pending_upsell && yes) {
        const up = { ...state._pending_upsell };
        // Use haggled price if negotiated, else standard upsell price
        const baseUpsellP = Math.max((up.upsell_price || up.price) - 500, 499);
        const extraOff = (state._upsell_haggle >= 2) ? 100 : 0;
        up.price = Math.max(baseUpsellP - extraOff, 399);
        delete state._pending_upsell;
        delete state._upsell_haggle;
        if (!(state.products || []).length) state.products = [state.product];
        state.products.push(up);
        return confirmOrder(state, storeName, `Done! ${up.short} bhi add ho gaya.\n\n`);
      }
      if (state._pending_upsell && no) {
        delete state._pending_upsell;
        return { reply: fillTemplate('UPSELL_PICK', vars), state: 'UPSELL_SHOW' };
      }
      // YES = if only 1 candidate, auto-select. If 2+, ask to pick
      if (yes && state.upsell_candidates.length === 1) {
        const up = { ...state.upsell_candidates[0] };
        up.price = Math.max((up.upsell_price || up.price) - 500, 499);
        if (!(state.products || []).length) state.products = [state.product];
        state.products.push(up);
        return confirmOrder(state, storeName, `Done! ${up.short} bhi add ho gaya.\n\n`);
      }
      if (yes && state.upsell_candidates.length > 1) {
        return { reply: fillTemplate('UPSELL_PICK', vars), state: 'UPSELL_SHOW' };
      }
      return { reply: fillTemplate('UPSELL_PICK', vars), state: 'UPSELL_SHOW' };
    }

    // ===== ORDER CONFIRMED =====
    case 'ORDER_CONFIRMED': {
      // Cancel request after confirmation — parcel dispatch ho chuka
      const isCancel = /\b(cancel|cancl|cance?l|cansel)\b/i.test(l) ||
        /\b(order\s*)?(cancel|band|khatam|wapis|wapas|vapas|vapsi|return)\s*(kr|kar|karo|krdo|kardo|krna|karna)?\b/i.test(l) ||
        /\b(nahi|nhi|ni)\s*(chahiye|chaiye|mangta|manga)\b/i.test(l) ||
        /\bmat\s*(bhej|send|ship)\b/i.test(l);
      if (isCancel) {
        state.current = 'CANCEL_AFTER_CONFIRM';
        state._cancelTag = true;
        // Tag the order as cancel-requested in DB
        try {
          const custPhone = state.collected.phone;
          if (custPhone) {
            const cust = customerModel.findByPhone(custPhone);
            if (cust) {
              const orders = orderModel.getByCustomer(cust.id);
              if (orders.length > 0) {
                const latest = orders[0];
                orderModel.updateStatus(latest.id, 'cancel_requested');
              }
            }
          }
        } catch (e) { /* ignore DB errors */ }
        const honorific = getHonorific(state.collected.name);
        const reply = `${state.collected.name || ''} ${honorific}, aapka parcel dispatch ho chuka hai — ab cancel nahi ho sakta. Delivery ke waqt rider se mil jayega. Shukriya!`.trim();
        return { reply, state: 'CANCEL_AFTER_CONFIRM' };
      }
      if (/\b(k[ae]?b\s*(t[ae]?k|aaye?|milega|ayga|aye?\s*ga)|kitne?\s*din|delivery|tracking)\b/i.test(l)) {
        state._thanked = false; // reset so delivery Q gets reply
        return { reply: fillTemplate('DELIVERY_POST_ORDER', vars), state: 'ORDER_CONFIRMED' };
      }
      // Gratitude/bye — reply ONCE with THANKS_REPLY, then go silent
      const isGratitude = /\b(shukri?ya|thanks?|thank\s*you|bye|allah\s*hafiz|khuda\s*hafiz|khush\s*raho?)\b/i.test(l);
      if (isGratitude) {
        if (!state._thanked) {
          state._thanked = true;
          return { reply: fillTemplate('THANKS_REPLY', vars), state: 'ORDER_CONFIRMED' };
        }
        return { reply: null, state: 'ORDER_CONFIRMED' };
      }
      // Simple acknowledgments (ok, acha, theek, g, ji) — always silent, no response needed
      const isJustAck = /^(ik|ok+|okay|theek|thik|thk|tik|acha+|accha+|done|g+|ji|jee|hn|great|nice|good|nahi?|nhi|ni|no|nope|nai|bas|rehne\s*do)(\s*(he|hai|ha|h|bhai|sir))?\s*[.!]?\s*$/i.test(l);
      if (isJustAck) {
        return { reply: null, state: 'ORDER_CONFIRMED' };
      }
      // Discount/price reduction request after order confirmed — polite response
      const isPriceReq = /\b(disc?oun?t|discoutn|disocunt|discont|off|offer|sast[ai])\b/i.test(l) ||
        /\b(price\s*km|km\s*kr|km\s*kro|km\s*price|mehn?g[aio]|rate\s*km|km\s*rate|pais[ey]\s*km|qeemat\s*km|daam\s*km|thora\s*km)\b/i.test(l) ||
        /\b(price|rate|pais[ey])\s*(or|aur)?\s*(km|kam|kam\s*kr|karo|kro)\b/i.test(l) ||
        /\b(km|kam)\s*(kro|kr|kardo|kar\s*do|krdein|karden|nhi|nahi)\b/i.test(l) ||
        /\b(or|aur)\s*(km|kam)\b/i.test(l);
      if (isPriceReq) {
        state._thanked = false;
        const honorific = getHonorific(state.collected.name);
        return { reply: `${honorific === 'sir' ? 'Sir' : 'Madam'}, yeh already discounted price pe hai. COD hai — paisa delivery ke waqt dena hai, koi advance nahi. ${vars.delivery_time} mein delivery ho jaegi.`, state: 'ORDER_CONFIRMED' };
      }
      // New product inquiry after order
      const newProduct = detectProduct(message);
      if (newProduct) {
        state._thanked = false;
        state.product = newProduct;
        state.current = 'PRODUCT_INQUIRY';
        const nextVars = buildVars(state, storeName);
        return { reply: fillTemplate('PRODUCT_INQUIRY', nextVars), state: 'PRODUCT_INQUIRY' };
      }
      return { reply: fillTemplate('AFTER_ORDER', vars), state: 'ORDER_CONFIRMED' };
    }

    // ===== CANCEL AFTER CONFIRM — fully silent, no more replies =====
    case 'CANCEL_AFTER_CONFIRM': {
      return { reply: null, state: 'CANCEL_AFTER_CONFIRM' };
    }

    // ===== COMPLAINT =====
    case 'COMPLAINT': {
      if (!state._complaint_replied) {
        state._complaint_replied = true;
        return { reply: fillTemplate('COMPLAINT_FOLLOWUP', vars), state: 'COMPLAINT', needs_human: true };
      }
      // Already replied once — stay silent, keep needs_human flag
      return { reply: null, state: 'COMPLAINT', needs_human: true };
    }

    // ===== CONFIRM RURAL CITY =====
    case 'CONFIRM_RURAL_CITY': {
      if (yes) {
        // City confirmed, rural_part goes to address area
        state.collected.city = state._pending_city;
        state.collected.address_parts = state.collected.address_parts || { area: null, street: null, house: null, landmark: null };
        state.collected.address_parts.area = state._rural_part;
        state._is_rural = true; // Mark rural — skip street/house
        delete state._rural_part;
        delete state._rural_type;
        delete state._pending_city;
        state.current = 'COLLECT_ADDRESS';
        state.address_step = 'tcs_postoffice'; // Skip street/house, ask TCS/post office
        const nextVars = buildVars(state, storeName);
        return { reply: fillTemplate('ASK_RURAL_DELIVERY_POINT', nextVars), state: 'COLLECT_ADDRESS' };
      }
      if (no) {
        // Wrong city, ask again
        delete state._pending_city;
        state.current = 'COLLECT_CITY';
        return { reply: fillTemplate('RURAL_CITY_NO', { ...vars, rural_part: state._rural_part || '' }), state: 'COLLECT_CITY' };
      }
      // Re-ask
      return { reply: fillTemplate('ASK_RURAL_CONFIRM', { ...vars, city: state._pending_city || '', rural_part: state._rural_part || '' }), state: 'CONFIRM_RURAL_CITY' };
    }

    default:
      return null;
  }
}

// ============= ASK FOR NEXT MISSING FIELD (template prompts) =============
function askNextField(state, storeName) {
  const next = nextMissingState(state.collected);
  state.current = next;

  if (next === 'ORDER_SUMMARY') {
    return buildOrderSummary(state, storeName);
  }

  // For collection states, return a simple template prompt
  const vars = buildVars(state, storeName);
  switch (next) {
    case 'COLLECT_NAME': return { reply: fillTemplate('ASK_NAME', vars), state: next };
    case 'COLLECT_PHONE': return { reply: fillTemplate('ASK_PHONE', vars), state: next };
    case 'COLLECT_DELIVERY_PHONE': return { reply: fillTemplate('ASK_DELIVERY_PHONE', vars), state: next };
    case 'COLLECT_CITY': return { reply: fillTemplate('ASK_CITY', vars), state: next };
    case 'COLLECT_ADDRESS': {
      // Don't blindly reset to 'area' — check what's already collected
      const ap = state.collected.address_parts;
      // All 4 parts filled (including landmark) — address is complete, confirm it
      if (ap.area && (ap.street || ap.street === 'nahi_pata') && (ap.house || ap.house === 'nahi_pata') && (ap.landmark || ap.landmark === 'nahi_pata')) {
        const addrStr = buildAddressString(ap);
        state.collected.address = state.collected.city ? addrStr + ', ' + state.collected.city : addrStr;
        state.address_confirming = true;
        const confirmReply = fillTemplate('CONFIRM_ADDRESS', { ...vars, full_address: state.collected.address });
        return { reply: confirmReply, state: 'COLLECT_ADDRESS' };
      }
      if (ap.area && (ap.street || ap.street === 'nahi_pata') && (ap.house || ap.house === 'nahi_pata')) {
        state.address_step = 'landmark';
      } else if (ap.area && (ap.street || ap.street === 'nahi_pata')) {
        state.address_step = 'house';
      } else if (ap.area) {
        state.address_step = 'street';
      } else {
        state.address_step = 'area';
      }
      // Use step-specific template
      const stepTemplateMap = {
        area: 'ASK_ADDRESS',
        street: 'ASK_ADDRESS_STREET',
        house: 'ASK_ADDRESS_HOUSE',
        landmark: 'ASK_ADDRESS_LANDMARK',
      };
      // Add area to vars for street template
      if (ap.area) vars.area = ap.area;
      return { reply: fillTemplate(stepTemplateMap[state.address_step] || 'ASK_ADDRESS', vars), state: next };
    }
    default: return null;
  }
}

module.exports = {
  handleTemplateState,
  nextMissingState,
  buildVars,
  askNextField,
  buildOrderSummary,
  confirmOrder,
};
