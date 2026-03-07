/**
 * Pre-written Roman Urdu response templates with multiple variations
 * Variables use {curly_braces} — substituted at runtime
 */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const T = {
  // ==========================================
  // GREETINGS
  // ==========================================
  GREETING_SALAM: [
    "Walaikum Assalam {honorific}! 😊 Khush aamdeed. Aap kis product ke baare mein information lena chahein ge?",
    "Walaikum Assalam {honorific}! 😊 Khush aamdeed. Batayein kaise madad karun?",
    "Walaikum Assalam {honorific}! 😊 Khush aamdeed. Kisi cheez ki talash hai ya trending products dikhau?",
  ],
  GREETING_CASUAL: [
    "Ji {honorific}, khush aamdeed! 😊 Aap kis product ke baare mein information lena chahein ge?",
    "Ji {honorific}! 😊 Batayein kaise help karun?",
    "Ji {honorific}! 😊 Aaj kya dekhna pasand karein ge?",
  ],
  GREETING_HOWRU: [
    "Alhamdulillah {honorific}, sab theek hai! 😊 Batayein kaise madad karun?",
    "Alhamdulillah {honorific}! 😊 Kuch dekhna hai ya kisi cheez mein help chahiye?",
  ],
  GREETING_RETURNING_SALAM: [
    "Walaikum Assalam {name} {honorific}! 😊 Acha laga dobara sun ke. Kuch naya dekhna hai ya phir se wohi mangwana hai?",
    "Walaikum Assalam {name} {honorific}! 😊 Wapas aane ka shukriya. Aaj kya dekhein ge?",
  ],
  GREETING_RETURNING_CASUAL: [
    "{name} {honorific}! 😊 Acha laga dobara sun ke. Kuch naya dikhau ya koi specific cheez chahiye?",
    "Ji {name} {honorific}! 😊 Wapas aane ka shukriya. Batayein kya chahiye aaj?",
  ],

  // ==========================================
  // PRODUCT INQUIRY
  // ==========================================
  PRODUCT_INQUIRY: [
    "{product_name} ki price Rs.{price} hai 🏷️ {f1} aur {f2}. Order karna hai?",
    "Ji {honorific}, {product_name} Rs.{price} ki hai 🏷️ {f1}, {f2}. Order karna hai?",
    "{product_name} Rs.{price} ki hai 🏷️ {f1} aur {f2}. Order karna hai {honorific}?",
  ],
  PRODUCT_WITH_PRICE: [
    "{product_name} ki price Rs.{price} hai 🏷️ {f1} aur {f2}. Order karna hai?",
    "Ji {honorific}, {product_name} Rs.{price} ki hai 🏷️ {f1}, {f2}. Order karna hai?",
  ],
  PRODUCT_WITH_ORDER: [
    "Bilkul {honorific}! ✅\n\n📦 {product_name}\n💰 Rs.{price}\n\n{f1}. {f2}.\n\nApna naam bata dein?",
  ],
  PRODUCT_WITH_ORDER_KNOWN_NAME: [
    "Bilkul {name} {honorific}! ✅\n\n📦 {product_name}\n💰 Rs.{price}\n\n{f1}. {f2}.\n\nPhone number bata dein?",
  ],

  // ==========================================
  // PRODUCT LIST
  // ==========================================
  PRODUCT_LIST: [
    "Yeh hain hamare products 📦\n\n{product_list}\n\nIn mein se konsa product order karna pasand karein ge {honorific}?",
    "Ji {honorific}! Yeh products available hain 📦\n\n{product_list}\n\nIn mein se konsa product pasand aaya? Number ya naam bata dein.",
  ],
  PRODUCT_AMBIGUOUS: [
    "Hamare pas yeh milte hain:\n\n{matching_products}\n\nIn me se konsa pasand aaya {honorific}? 😊",
    "{honorific}, yeh dono available hain:\n\n{matching_products}\n\nKonsa order karna hai? Number ya naam bata dein 😊",
  ],
  ORDER_WITHOUT_PRODUCT: [
    "Zaroor {honorific}! 😊 Konsa product order karna chahein ge?\n\n{product_list}\n\nNumber ya naam bata dein.",
    "Ji {honorific}! 😊 Yeh hain hamare products:\n\n{product_list}\n\nIn mein se konsa chahiye?",
  ],
  REORDER_NO_DATA: [
    "{honorific}, pichla data mil nahi raha lekin koi masle ki baat nahi 😊 Dubara order le leta hun! Konsa product chahiye?\n\n{product_list}",
    "{honorific}, sorry pichla record nahi mil raha 🙏 Lekin koi baat nahi, dubara order laga deta hun! Konsa product chahiye?\n\n{product_list}",
  ],
  REORDER_WITH_DATA: [
    "{name} {honorific}! 😊 Wahi product dubara mangwana hai? Pichla order: {last_order}. Wohi bhej dun ya kuch aur chahiye?",
    "{name} {honorific}! 😊 Dubara order karna hai? Pichle dafa {last_order} mangwaya tha. Same bhej dun?",
  ],

  // ==========================================
  // COLLECT NAME
  // ==========================================
  ASK_NAME: [
    "Bilkul {honorific}! 😊 Apna naam bata dein?",
    "Zaroor {honorific}! 😊 Apna naam bata dein?",
    "Ji {honorific}! 😊 Apna naam bata dein?",
  ],

  // ==========================================
  // COLLECT PHONE
  // ==========================================
  ASK_PHONE: [
    "{name} {honorific}, phone number bata dein? 📱",
    "{name} {honorific}, apna phone number bata dein? 📱",
  ],
  PHONE_INVALID_INCOMPLETE: [
    "{name} {honorific}, yeh number incomplete lag raha hai 🤔 11 digit ka number bata dein jo 03 se start ho.",
  ],
  PHONE_INVALID_FORMAT: [
    "{name} {honorific}, sahi phone number chahiye 📱 03 se start hona chahiye, 11 digits.",
  ],

  // ==========================================
  // COLLECT DELIVERY PHONE
  // ==========================================
  ASK_DELIVERY_PHONE: [
    "Rider aapko isi number ({phone}) pe call karega 📞 Call receive kar lein ge?",
    "Delivery ke waqt rider {phone} pe call karega 📞 Receive kar lein ge ya koi aur number dein?",
  ],
  ASK_DELIVERY_PHONE_NEW: [
    "Konsa number dein rider ke liye?",
  ],

  // ==========================================
  // COLLECT CITY
  // ==========================================
  ASK_CITY: [
    "City bata dein — delivery kahan karni hai? 🚚",
    "{name} {honorific}, konsi city mein delivery chahiye? 🚚",
    "{name} {honorific}, delivery konsi city mein karni hai? {city_hint} 🚚",
  ],
  REGION_NOT_CITY: [
    "{name} {honorific}, {region} mein konsa shehar? Jaise {examples}.",
    "{region} ek region hai — konsi city mein delivery karni hai? Jaise {examples}.",
  ],
  UNKNOWN_CITY_ABBR: [
    "{honorific}, city ka poora naam bata dein?",
  ],
  ASK_RURAL_CITY: [
    "{honorific}, {rural_part} konsi city/tehsil mein ata hai?",
    "{rural_part} — yeh konsi city/tehsil mein hai {honorific}?",
  ],
  ASK_RURAL_CONFIRM: [
    "{honorific}, {rural_part} — yeh {city} ke andar ata hai?",
    "Kya {rural_part} {city} mein hai {honorific}?",
  ],
  RURAL_CITY_NO: [
    "Achha — to batayein {rural_part} konsi city/tehsil mein ata hai?",
  ],
  ASK_RURAL_DELIVERY_POINT: [
    "{honorific}, wahan TCS office hai ya post office? Agar wahan bhijwa dein to wahan se pick kar lein ge.",
    "{honorific}, qareeb mein TCS ya post office hai? Wahan bhijwa dein ge to pick kar lein ge.",
  ],
  ASK_RURAL_DELIVERY_INSIST: [
    "{honorific}, courier rural area mein ghar tak deliver nahi kar pata — TCS ya post office batayein jahan parcel bhijwa sakein?",
  ],
  ASK_RURAL_NEARBY_REFERENCE: [
    "{honorific}, {generic_place} to kaafi bara area hai — qareeb koi masjid, kiryana store ya mashoor jagah ka naam bata dein taake rider ko aasani ho.",
    "{honorific}, {generic_place} mein rider dhundne mein mushkil hogi — paas mein koi masjid, dukaan ya koi aisi jagah ka naam bata dein jo sab ko pata ho.",
  ],
  ASK_ZILLA: [
    "{honorific}, yeh konse zille mein ata hai?",
    "{honorific}, zilla bata dein — delivery ke liye zaroori hai.",
  ],

  // ==========================================
  // COLLECT ADDRESS (step-by-step sub-part collection)
  // ==========================================
  ASK_ADDRESS: [
    "{city} mein konsa area hai? 📍 {area_suggestions}",
    "{name} {honorific}, {city} mein konsa area hai? 📍 {area_suggestions}",
  ],
  ASK_ADDRESS_AREA: [
    "{city} mein konsa area ya mohalla hai? 📍 {area_suggestions}",
    "{name} {honorific}, {city} mein konsa area hai? 📍 {area_suggestions}",
  ],
  ASK_ADDRESS_STREET: [
    "{area} mein block aur gali/street number bata dein? 🏘️",
    "{area} mein konsa block hai aur gali/street number? 🏘️",
  ],
  ASK_ADDRESS_HOUSE: [
    "House number ya flat number? 🏠",
    "House number bata dein? 🏠",
  ],
  ASK_ADDRESS_LANDMARK: [
    "Qareeb koi landmark/mashoor jagah hai? 📍 Masjid, school ya dukaan ka naam bata dein taake rider ko aasan ho.",
    "Rider ke liye reference — qareeb koi landmark/mashoor jagah (masjid, hospital, school ya market) ka naam bata dein 📍",
  ],
  ASK_ADDRESS_LANDMARK_NAME: [
    "Konsi {landmark_type}? Naam bata dein 📍",
  ],
  ASK_ADDRESS_HOUSE_OR_LANDMARK: [
    "Koi baat nahi — qareeb koi landmark/mashoor jagah (masjid, school ya dukaan) hai? Naam bata dein 📍",
  ],
  CONFIRM_ADDRESS: [
    "📍 Aapka address: {full_address}. Sahi hai? ✅",
    "📍 Yeh address sahi hai? {full_address} ✅",
  ],

  // ==========================================
  // ORDER SUMMARY
  // ==========================================
  ORDER_SUMMARY: [
    "📋 Order details:\n{items_list}\n🚚 Delivery: FREE\n💰 Total: Rs.{total}\n\nNaam: {name}\nPhone: {phone}\nCity: {city}\nAddress: {address}\nDelivery: {delivery_time}\n\nSab theek hai to haan bol dein, order laga deta hun ✅",
  ],

  // ==========================================
  // UPSELL
  // ==========================================
  UPSELL_HOOK: [
    "Shukriya {name} {honorific}! ✅ Order note ho gaya. Waise 75% tak discount wale products bhi hain jo kaafi log mangwa rahe hain — dikhadu? Sath mein aa jayega aur delivery bhi free rahegi 🚚",
    "{name} {honorific}, order save ho gaya ✅ Waise 75% tak discount wale products hain abhi — dikhadu aapko? Sath mein aa jayein ge, delivery free rahegi 🚚",
  ],
  UPSELL_SHOW: [
    "Yeh dekhen 👇\n\n{upsell_list}\n\nIn mein se konsa product bhi order mein add kardu?",
  ],
  UPSELL_ADDED: [
    "Done! ✅ {upsell_product} bhi add ho gaya. Ab aapka order: {all_items} = Rs.{new_total}. Rider sath mein le aayega 🚚",
  ],
  UPSELL_ASK_YESNO: [
    "Dekhna chahein ge?",
  ],
  UPSELL_PICK: [
    "Konsa pasand aaya? Number ya naam bata dein.",
  ],
  UPSELL_DISCOUNT: [
    "Aapke liye {discount_percent}% discount 🎁 {product_short} ab Rs.{discounted_price} mein! Aur yeh products bhi discounted hain:\n\n{upsell_list}\n\nIn mein se konsa product bhi order mein add kardu?",
    "{honorific}, aapke liye special {discount_percent}% off 🎁 {product_short} Rs.{discounted_price}. Yeh discounted products bhi dekh lein:\n\n{upsell_list}\n\nKonsa add karun?",
    "{product_short} pe {discount_percent}% adjust kiya — ab Rs.{discounted_price} 🎁 Yeh bhi available hain:\n\n{upsell_list}\n\nKonsa pasand aaya?",
  ],

  // ==========================================
  // ORDER CONFIRMED
  // ==========================================
  ORDER_CONFIRMED: [
    "🎉 Order confirm ho gaya! Order ID: {order_id}\n{items_list}\n💰 Total: Rs.{total} | 🚚 Delivery: FREE\n{name} | {phone}\n📍 {address} — {delivery_time}\nPaisa delivery ke waqt dena hai. Shukriya {honorific}! 😊",
  ],

  // ==========================================
  // HAGGLING (3 rounds)
  // ==========================================
  HAGGLE_ROUND_1: [
    "Yeh price already achi hai {honorific} 😊 Paisa delivery ke waqt dena hai, pehle check kar sakte hain. Plus 7 din exchange bhi hai. {product_short} Rs.{price} mein value for money hai.",
    "{honorific}, paisa delivery ke waqt dena hai — pehle check kar sakte hain 😊 Plus 7 din exchange bhi hai. Rs.{price} fair price hai.",
  ],
  HAGGLE_ROUND_2: [
    "Aapke liye {discount_percent}% adjust kar deta hun 🎁 Rs.{discounted_price} final. Order karna hai?",
    "{honorific}, special aapke liye Rs.{discount_amount} off 🎁 Rs.{discounted_price} mein de deta hun. Done?",
  ],
  HAGGLE_ROUND_3: [
    "Yeh bilkul last price hai — Rs.{discounted_price} 🙏 Isse kam mein possible nahi hai.",
    "Rs.{discounted_price} se kam nahi ho sakta {honorific} 🙏 Yeh already adjusted price hai.",
  ],
  HAGGLE_FINAL: [
    "{honorific}, yeh last price hai — isse kam nahi ho sakti 😊 Jab order karna ho to bata dein!",
    "{honorific}, samajh aata hai. Lekin yeh final price hai. Jab chahein order kar sakte hain 😊",
  ],
  HAGGLE_NO_PRODUCT: [
    "Pehle product select karein — yeh hain hamari items:\n\n{product_list}",
  ],

  // ==========================================
  // TRUST BUILDING
  // ==========================================
  TRUST_COD: [
    "Ji {honorific}, paisa delivery ke waqt dena hai 💵 Pehle parcel check karein phir paisa dein.",
    "Bilkul {honorific}, Cash on Delivery hai 💵 Rider aayega, aap check kar ke phir payment karein.",
  ],
  TRUST_QUALITY: [
    "{honorific}, 7 din exchange guarantee hai ✅ Agar koi masla ho to replace kar dein ge. Delivery pe pehle check karein.",
    "Ji {honorific}, agar koi issue ho to 7 din ke andar exchange ho jayega ✅",
  ],
  QUALITY_REASSURANCE: [
    "{honorific}, quality bilkul achi hai 👍 Daily customers order kar rahe hain aur satisfied hain. Plus delivery pe pehle check karein, phir paisa dein. 7 din exchange guarantee bhi hai.",
    "Ji {honorific}, quality zabardast hai 👍 Rozana orders aa rahe hain aur log khush hain. Aap delivery pe check kar sakte hain, 7 din exchange bhi hai.",
    "{honorific}, quality ki fikar mat karein 😊 Customers satisfied hain. COD hai, pehle check karein phir payment. 7 din exchange guarantee.",
  ],
  TRUST_GENERAL: [
    "{honorific}, paisa delivery ke waqt dena hai 💵 7 din exchange guarantee ✅ FREE delivery 🚚 Aap check karke paisa dein.",
  ],

  // ==========================================
  // DELIVERY QUERY
  // ==========================================
  DELIVERY_WITH_CITY: [
    "{city} mein {delivery_time} mein pohch jayega 🚚 Rider call karega delivery se pehle.",
    "Delivery {delivery_time} hogi {city} ke liye 🚚 Rider aapko call karega.",
  ],
  DELIVERY_GENERAL: [
    "Karachi/Lahore/Islamabad: 2-3 din. Baqi cities: 3-6 din 🚚 Rider call karega delivery se pehle.",
  ],
  DELIVERY_POST_ORDER: [
    "{city} mein {delivery_time} mein delivery ho jaegi {honorific} 🚚 Rider call karega delivery se pehle.",
    "Ji {honorific}, {city} mein estimated {delivery_time} lagein ge 🚚 Rider delivery se pehle call karega.",
  ],

  // ==========================================
  // COMPLAINT
  // ==========================================
  COMPLAINT: [
    "{honorific}, aapka masla samajh aata hai 🙏 Aap 03701337838 pe WhatsApp message bhej dein — yeh hamari complaint department hai, woh aapki complaint resolve kar dein ge.",
  ],
  COMPLAINT_FOLLOWUP: [
    "Aap 03701337838 pe WhatsApp message bhej dein, yeh complaint department hai — woh aapki help kar dein ge 👍",
  ],

  // ==========================================
  // THANKS
  // ==========================================
  THANKS_REPLY: [
    "Shukriya {honorific}! 😊 Kuch aur chahiye ho to kabhi bhi message karein.",
    "Ji {honorific}, shukriya aapka 😊 Kuch zaroorat ho to bata dein.",
  ],

  // ==========================================
  // ORDER CONFIRMED — post queries
  // ==========================================
  AFTER_ORDER: [
    "Aapka order already confirm hai {honorific} ✅ Kuch aur chahiye to bata dein!",
  ],

  // ==========================================
  // CHANGE REQUEST (ORDER_SUMMARY state)
  // ==========================================
  WHAT_TO_CHANGE: [
    "Kya change karna hai {honorific}? Naam, phone, address ya product?",
  ],
  CHANGE_NAME: ["Naya naam bata dein?"],
  CHANGE_PHONE: ["Naya phone number bata dein?"],
  CHANGE_ADDRESS: ["Naya address bata dein?"],
  CHANGE_CITY: ["City bata dein?"],
  CONFIRM_PROMPT: [
    "Sab theek hai to haan bol dein, order laga deta hun. Kuch change karna ho to bata dein.",
    "Order place kar dun? Haan bolen ya kuch change karna ho to bata dein.",
  ],

  // ==========================================
  // FALLBACK
  // ==========================================
  FALLBACK: [
    "{honorific}, order karna ho to bata dein 😊 Ya koi aur product dekhna hai?",
    "Kuch aur puchna ho to batayein {honorific} 😊 Products dekhne hain ya order karna hai?",
  ],
};

// ============= TEMPLATE FILLER =============
function fillTemplate(templateKey, vars = {}) {
  const templates = T[templateKey];
  if (!templates || !templates.length) return null;

  let text = pick(templates);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, value != null ? String(value) : '');
  }
  return text;
}

module.exports = { T, fillTemplate, pick };
