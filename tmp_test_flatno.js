// Test: 'Flat No.A/518. Phase 3. Haroon Royal City.Block 17.Gulistan e Johar. Karachi'
const l = 'flat no.a/518. phase 3. haroon royal city.block 17.gulistan e johar. karachi';
const isAddressCorrection = /\b(house|ghar|makan|number|no|plot)\s*#?\s*\d+/i.test(l) ||
  /\b(flat|house|ghar|makan|plot|apartment|apt)\s*(no|number|#)?\s*\.?\s*[a-z0-9]/i.test(l) ||
  /\b\d+\s*(number|no|nmbr)\s*(h[ae]i?|he)\b/i.test(l);
const isConditionalNah = false;
const isFullAddress = l.length > 20 && /\b(flat|block|phase|sector|floor|road|street|gali|colony|town|mohall[ae]h?|near|masjid|school|hospital|chowk)\b/i.test(l) &&
  (/\b(no|number|#)\b/i.test(l) || /\d/.test(l));
const flexNo = /\b(nahi+|nhi*|nh|no+|galat|nope|na+h|mat|cancel)\b/i.test(l) && !isConditionalNah && !isAddressCorrection && !isFullAddress;
console.log('isAddressCorrection:', isAddressCorrection);
console.log('isFullAddress:', isFullAddress);
console.log('flexNo:', flexNo, '(should be false)');

// Test: actual 'No' rejection should still work
const l2 = 'no';
const isAC2 = /\b(flat|house|ghar|makan|plot|apartment|apt)\s*(no|number|#)?\s*\.?\s*[a-z0-9]/i.test(l2);
const isFA2 = l2.length > 20 && /\b(flat|block|phase)\b/i.test(l2);
const flexNo2 = /\b(no+)\b/i.test(l2) && !isAC2 && !isFA2;
console.log('Plain "No" flexNo:', flexNo2, '(should be true)');

// Test: "nahi galat hai" rejection should still work
const l3 = 'nahi galat hai';
const isAC3 = /\b(flat|house|ghar|makan|plot|apartment|apt)\s*(no|number|#)?\s*\.?\s*[a-z0-9]/i.test(l3);
const isFA3 = l3.length > 20 && /\b(flat|block|phase)\b/i.test(l3);
const flexNo3 = /\b(nahi+|nhi*|nh|no+|galat|nope|na+h|mat|cancel)\b/i.test(l3) && !isAC3 && !isFA3;
console.log('"nahi galat hai" flexNo:', flexNo3, '(should be true)');
