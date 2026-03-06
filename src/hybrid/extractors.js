/**
 * Data extractors: phone, city, name, product, address detection
 */
const { PRODUCTS, CITY_ABBR, ALL_CITIES, REGIONS, REGION_EXAMPLES } = require('./data');
const { CITY_ALIASES } = require('./city-areas');
const { getAllAreas, matchArea, getCityAreas } = require('./city-areas');

// ============= PRODUCT DETECTION =============
function detectProduct(msg) {
  const l = msg.toLowerCase();

  // URL slug match — if thenureva.shop URL, parse slug for accurate match
  const urlMatch = l.match(/thenureva\.shop\/product\/([a-z0-9\-]+)/);
  if (urlMatch) {
    const slug = urlMatch[1].replace(/-/g, ' ');
    let bestProduct = null, bestScore = 0;
    for (const p of PRODUCTS) {
      let score = 0;
      for (const k of p.kw) {
        if (slug.includes(k)) score++;
      }
      // Also check product name
      const nameLower = p.name.toLowerCase();
      const nameWords = nameLower.split(/\s+/);
      for (const w of nameWords) {
        if (w.length > 2 && slug.includes(w)) score++;
      }
      if (score > bestScore) { bestScore = score; bestProduct = p; }
    }
    if (bestProduct) return bestProduct;
  }

  // Feminine qualifier + trimmer → Facial Hair Remover (ladies trimmer)
  const isFeminineQ = /\b(lark[ioy]+|ladki|ladies|lady|girls?|women|female|aurat|aurton|khawateen)\b/i.test(l);
  const isTrimmerQ = /\b(trim+e?r|trime?r|shav[ei]r|hair\s*(cut|remov))\b/i.test(l);
  if (isFeminineQ && isTrimmerQ) {
    const fhr = PRODUCTS.find(p => p.id === 7); // Facial Hair Remover
    if (fhr) return fhr;
  }
  // Masculine qualifier + trimmer → T9 Trimmer
  const isMasculineQ = /\b(lark[oe]+|gents|boys?|men|mard|mardon)\b/i.test(l);
  if (isMasculineQ && isTrimmerQ) {
    const t9 = PRODUCTS.find(p => p.id === 1); // T9 Trimmer
    if (t9) return t9;
  }

  // Score-based matching — count keyword hits per product, return highest
  let bestProduct = null, bestScore = 0;
  for (const p of PRODUCTS) {
    let score = 0;
    for (const k of p.kw) {
      if (k.length <= 3) {
        const re = new RegExp(`\\b${k}\\b`, 'i');
        if (re.test(l)) score++;
      } else {
        if (l.includes(k)) score++;
      }
    }
    if (score > bestScore) { bestScore = score; bestProduct = p; }
  }
  if (bestProduct) return bestProduct;

  // Check by number (1-10)
  const m = l.match(/^(\d{1,2})$/);
  if (m) {
    const i = parseInt(m[1]) - 1;
    if (i >= 0 && i < PRODUCTS.length) return PRODUCTS[i];
  }
  return null;
}

// Detect ALL matching products with scores — for ambiguity detection
function detectAllProducts(msg) {
  const l = msg.toLowerCase();

  // Number pick — always unambiguous
  const m = l.match(/^(\d{1,2})$/);
  if (m) {
    const i = parseInt(m[1]) - 1;
    if (i >= 0 && i < PRODUCTS.length) return [{ product: PRODUCTS[i], score: 100 }];
    return [];
  }

  const results = [];
  for (const p of PRODUCTS) {
    let score = 0;
    for (const k of p.kw) {
      if (k.length <= 3) {
        const re = new RegExp(`\\b${k}\\b`, 'i');
        if (re.test(l)) score++;
      } else {
        if (l.includes(k)) score++;
      }
    }
    if (score > 0) results.push({ product: p, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ============= PHONE EXTRACTION =============
function extractPhone(msg) {
  const m = msg.match(/(?:\+?92|0)3\d{2}[\s\-]?\d{7}/);
  return m ? m[0].replace(/[\s\-]/g, '') : null;
}

function validatePhone(phone) {
  if (!phone) return { valid: false, error: 'Phone number nahi mila' };
  const clean = phone.replace(/[\s\-]/g, '');
  // +92 format
  if (/^\+923\d{9}$/.test(clean)) return { valid: true, phone: clean };
  // 03xx format (11 digits)
  if (/^03\d{9}$/.test(clean)) return { valid: true, phone: clean };
  // Too short
  if (/^03\d{0,8}$/.test(clean)) return { valid: false, error: 'incomplete' };
  // Doesn't start with 03 or +92
  return { valid: false, error: 'format' };
}

// Urdu script → English city name mapping
const URDU_CITIES = {
  'اسلام آباد': 'Islamabad', 'اسلامباد': 'Islamabad', 'اسلام اباد': 'Islamabad',
  'لاہور': 'Lahore', 'کراچی': 'Karachi', 'کراچى': 'Karachi',
  'راولپنڈی': 'Rawalpindi', 'راولپنڈي': 'Rawalpindi',
  'فیصل آباد': 'Faisalabad', 'فیصلآباد': 'Faisalabad',
  'ملتان': 'Multan', 'پشاور': 'Peshawar',
  'گوجرانوالہ': 'Gujranwala', 'سیالکوٹ': 'Sialkot',
  'حیدرآباد': 'Hyderabad', 'حیدرباد': 'Hyderabad',
  'کوئٹہ': 'Quetta', 'بہاولپور': 'Bahawalpur',
  'ساہیوال': 'Sahiwal', 'سرگودھا': 'Sargodha',
  'جہلم': 'Jhelum', 'گجرات': 'Gujrat',
  'لاركانہ': 'Larkana', 'سکھر': 'Sukkur',
  'مردان': 'Mardan', 'ایبٹ آباد': 'Abbottabad',
  'رحیم یار خان': 'Rahim Yar Khan', 'ڈیرہ غازی خان': 'Dera Ghazi Khan',
  'میرپور': 'Mirpur', 'مظفرآباد': 'Muzaffarabad',
  'بنوں': 'Bannu', 'سوات': 'Swat',
  'ٹیکسلا': 'Taxila', 'واہ': 'Wah',
  'چنیوٹ': 'Chiniot', 'خانیوال': 'Khanewal',
  'وہاڑی': 'Vehari', 'ڈسکہ': 'Daska',
  'قصور': 'Kasur', 'شیخوپورہ': 'Sheikhupura',
  'نوشہرہ': 'Nowshera', 'سوابی': 'Swabi',
  'چکوال': 'Chakwal', 'اٹک': 'Attock',
};

// ============= CITY EXTRACTION =============
function extractCity(msg) {
  // Check Urdu script cities first
  for (const [urdu, english] of Object.entries(URDU_CITIES)) {
    if (msg.includes(urdu)) return english;
  }

  const l = msg.toLowerCase().trim();
  const words = l.split(/\s+/);

  // Check abbreviations first
  for (const [abbr, full] of Object.entries(CITY_ABBR)) {
    if (words.includes(abbr)) return full;
  }

  // Check full city names (word-boundary to avoid partial matches like "raja" → "rajanpur")
  for (const c of ALL_CITIES) {
    if (new RegExp('\\b' + c + '\\b').test(l)) return c.charAt(0).toUpperCase() + c.slice(1);
  }

  // Check misspelling aliases (lahire→lahore, faislabad→faisalabad, etc.)
  for (const word of words) {
    if (CITY_ALIASES[word]) {
      const correct = CITY_ALIASES[word];
      return correct.charAt(0).toUpperCase() + correct.slice(1);
    }
  }

  return null;
}

// Extract ALL cities from message (for multi-city detection)
function extractAllCities(msg) {
  const l = msg.toLowerCase().trim();
  const words = l.split(/\s+/);
  const found = [];
  const seen = new Set();

  // Check Urdu script cities
  for (const [urdu, english] of Object.entries(URDU_CITIES)) {
    if (msg.includes(urdu) && !seen.has(english.toLowerCase())) {
      found.push(english);
      seen.add(english.toLowerCase());
    }
  }

  // Check abbreviations
  for (const [abbr, full] of Object.entries(CITY_ABBR)) {
    if (words.includes(abbr) && !seen.has(full.toLowerCase())) {
      found.push(full);
      seen.add(full.toLowerCase());
    }
  }

  // Check full city names (word-boundary to avoid partial matches)
  for (const c of ALL_CITIES) {
    if (new RegExp('\\b' + c + '\\b').test(l) && !seen.has(c)) {
      found.push(c.charAt(0).toUpperCase() + c.slice(1));
      seen.add(c);
    }
  }

  // Check misspelling aliases (per word)
  for (const word of words) {
    if (CITY_ALIASES[word] && !seen.has(CITY_ALIASES[word])) {
      const correct = CITY_ALIASES[word];
      found.push(correct.charAt(0).toUpperCase() + correct.slice(1));
      seen.add(correct);
    }
  }

  // Fuzzy match: remove spaces, collapse repeated vowels, then check
  // Catches: "gujran walaaan" → "gujranwala", "islama bad" → "islamabad"
  if (found.length === 0) {
    const collapsed = l.replace(/\s+/g, '').replace(/(.)\1+/g, '$1'); // "gujranwalaaan" → "gujranwalan" hmm
    const norm = l.replace(/\s+/g, '').replace(/a{2,}/g, 'a').replace(/e{2,}/g, 'e').replace(/i{2,}/g, 'i').replace(/o{2,}/g, 'o').replace(/u{2,}/g, 'u');
    for (const c of ALL_CITIES) {
      const normCity = c.replace(/\s+/g, '');
      // Short city names (< 5 chars like "wah", "hub") must NOT use substring match on full message
      // — "wahan" (meaning "there") would false-positive match "wah" city
      const isShortCity = normCity.length < 5;
      if ((norm === normCity || (!isShortCity && norm.length >= 4 && norm.includes(normCity)) || (norm.length >= 4 && normCity.includes(norm))) && !seen.has(c)) {
        found.push(c.charAt(0).toUpperCase() + c.slice(1));
        seen.add(c);
        break;
      }
    }
    // Also check aliases with joined input
    if (found.length === 0) {
      const joined = l.replace(/\s+/g, '');
      if (CITY_ALIASES[joined] && !seen.has(CITY_ALIASES[joined])) {
        const correct = CITY_ALIASES[joined];
        found.push(correct.charAt(0).toUpperCase() + correct.slice(1));
        seen.add(correct);
      }
      // Try normalized version in aliases
      if (found.length === 0 && CITY_ALIASES[norm] && !seen.has(CITY_ALIASES[norm])) {
        const correct = CITY_ALIASES[norm];
        found.push(correct.charAt(0).toUpperCase() + correct.slice(1));
        seen.add(correct);
      }
    }
  }

  return found;
}

// Check if the input is a region (not a city)
function isRegion(msg) {
  const l = msg.toLowerCase().trim();
  for (const r of REGIONS) {
    if (l.includes(r)) {
      return { isRegion: true, region: r, examples: REGION_EXAMPLES[r] || '' };
    }
  }
  return { isRegion: false };
}

// ============= NAME EXTRACTION =============
function extractNameFromFullMsg(msg) {
  // Extract name when phone is also present (full-details message)
  const ph = msg.match(/(?:\+?92|0)3\d{2}[\s\-]?\d{7}/);
  if (!ph) return null;
  const before = msg.substring(0, msg.indexOf(ph[0])).trim();
  // Remove common prefixes like "order kardo", "confirm", etc.
  const cleaned = before.replace(/^(order\s*(kardo|krdo|kar\s*do|karna)\s*)/i, '').trim();
  return (cleaned && /^[A-Za-z\s]{2,40}$/.test(cleaned)) ? cleaned : null;
}

// Simple name check: is this text likely a name?
function isLikelyName(msg) {
  const trimmed = msg.trim();
  // 1-4 words, only letters and spaces, no numbers
  return /^[A-Za-z\s]{2,50}$/.test(trimmed) && trimmed.split(/\s+/).length <= 4;
}

// ============= ADDRESS KEYWORDS =============
const ADDRESS_KEYWORDS = [
  'house','ghar','gali','street','block','sector','phase','colony','town','mohalla',
  'near','nazd','road','chowk','bazaar','market','scheme','flat','floor','plaza',
  'nmbr','number','plot','apartment','society','nagar','abad','pura','gunj','gate',
  'stop','chowrangi','ke samne','ke pass','ke qareeb','wali gali','wala mohalla',
  'masjid','school','hospital','dukaan','hotel','mosque','park','ground','stadium',
  'thana','police','post office','dak khana','address'
];

function hasAddressKeywords(msg) {
  const l = msg.toLowerCase();
  return ADDRESS_KEYWORDS.some(k => l.includes(k));
}

// ============= ADDRESS PARTS EXTRACTION =============

// House number patterns
function extractHouse(msg) {
  const l = msg.toLowerCase();
  const patterns = [
    /(?:house|ghar|flat|apartment|apt|plot|makan)\s*(?:no\.?|number|nmbr|#)?\s*(\d+[a-z]?(?:[-\/]\d+)?)/i,
    /(?:no\.?|number|nmbr|#)\s*(\d+[a-z]?)\s*(?:house|ghar|flat|makan)?/i,
    /^(\d{1,4}[a-z]?)\s*(?:,|\s|$)/i,  // starts with number like "45, block 3" or "56 k 10/I"
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) return m[1];
  }
  return null;
}

// Street/block/sector patterns
function extractStreet(msg) {
  const patterns = [
    /(?:street|st|gali|galli)\s*(?:no\.?|number|nmbr|#)?\s*(\d+[a-z]?)/i,
    /(?:block|blk)\s*([a-z0-9]{1,3})/i,
    /(?:sector|sec)\s*([a-z]?[-]?\d+[a-z]?)/i,
    /(?:phase)\s*(\d+[a-z]?)/i,
    /(?:lane)\s*(?:no\.?|number|nmbr|#)?\s*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) {
      const full = m[0].trim();
      return full.charAt(0).toUpperCase() + full.slice(1).toLowerCase();
    }
  }

  // Islamabad-style compact sector: "10/I" → "Sector I-10", "F/8" → "Sector F-8"
  const isbCompact = msg.match(/(\d{1,2})\s*[\/\\]\s*([a-zA-Z])/);
  if (isbCompact) {
    return 'Sector ' + isbCompact[2].toUpperCase() + '-' + isbCompact[1];
  }
  // Reverse format: "I/10", "F/8"
  const isbReverse = msg.match(/([a-zA-Z])\s*[\/\\-]\s*(\d{1,2})/);
  if (isbReverse) {
    return 'Sector ' + isbReverse[1].toUpperCase() + '-' + isbReverse[2];
  }

  // Single letter block after house number: "56 k" → Block K
  const singleBlock = msg.match(/^\d+\s+([a-zA-Z])\s/);
  if (singleBlock) {
    return 'Block ' + singleBlock[1].toUpperCase();
  }

  return null;
}

// Area/mohalla patterns
// Build KNOWN_AREAS from city-areas.js data + static extras
// Sorted longest-first to match "gulshan e johar" before "gulshan"
const _staticAreas = [
  // Extras not in city-areas.js
  'pir mahal','toba tek singh','defence phase','dha phase',
  'shadbagh','wahdat',
  // Islamabad sector variants
  'e-8','e-10','i-15','i-16',
];
const _allCityAreas = getAllAreas();
const KNOWN_AREAS = [...new Set([..._allCityAreas, ..._staticAreas])]
  .sort((a, b) => b.length - a.length); // longest first for greedy matching

// ============= RURAL ADDRESS DETECTION =============
/**
 * Detect rural address keywords (chak, village, gaon, goth, killi, dhoke, mauza)
 * @param {string} msg
 * @returns {{ isRural: boolean, type: string, ruralPart: string } | null}
 */
function detectRuralAddress(msg) {
  const l = msg.toLowerCase().trim();

  // Chak pattern: "chak 203 rb", "chak no 5 jb", "chak number 77 gb"
  const chakMatch = l.match(/\b(chak\s*(?:no\.?\s*|number\s*)?\d+[\s/-]?[a-z]{0,3})\b/i);
  if (chakMatch) return { isRural: true, type: 'chak', ruralPart: chakMatch[1].trim() };

  // Rural keyword patterns — both "keyword + name" AND "name + keyword"
  // e.g. "gaon miani" AND "miani gaon", "goth ibrahim" AND "ibrahim goth"
  const RURAL_KEYWORDS = ['village', 'gaon', 'gao', 'goth', 'killi', 'dhoke', 'dhok', 'mauza', 'mouza', 'dehat'];
  const ruralPatterns = [
    // keyword FIRST: "gaon miani", "goth ibrahim jokhio"
    { regex: /\b(village\s+[a-z\s]{2,30})/i, type: 'village' },
    { regex: /\b(gaon?\s+[a-z\s]{2,30})/i, type: 'gaon' },
    { regex: /\b(goth\s+[a-z\s]{2,30})/i, type: 'goth' },
    { regex: /\b(killi\s+[a-z\s]{2,30})/i, type: 'killi' },
    { regex: /\b(dhoke?\s+[a-z\s]{2,30})/i, type: 'dhoke' },
    { regex: /\b(mauza\s+[a-z\s]{2,30})/i, type: 'mauza' },
    { regex: /\b(mouza\s+[a-z\s]{2,30})/i, type: 'mauza' },
    { regex: /\b(dehat\s+[a-z\s]{2,30})/i, type: 'dehat' },
    // keyword LAST: "miani gaon", "ibrahim goth", "xyz village"
    { regex: /\b([a-z]{2,20}\s+village)\b/i, type: 'village' },
    { regex: /\b([a-z]{2,20}\s+gaon?)\b/i, type: 'gaon' },
    { regex: /\b([a-z]{2,20}\s+goth)\b/i, type: 'goth' },
    { regex: /\b([a-z]{2,20}\s+killi)\b/i, type: 'killi' },
    { regex: /\b([a-z]{2,20}\s+dhoke?)\b/i, type: 'dhoke' },
    { regex: /\b([a-z]{2,20}\s+mauza)\b/i, type: 'mauza' },
    { regex: /\b([a-z]{2,20}\s+mouza)\b/i, type: 'mauza' },
    { regex: /\b([a-z]{2,20}\s+dehat)\b/i, type: 'dehat' },
  ];

  for (const p of ruralPatterns) {
    const m = l.match(p.regex);
    if (m) {
      // Trim trailing city names from the rural part
      let rural = m[1].trim();
      // Remove any known city from the end
      const cities = extractAllCities(rural);
      if (cities.length) {
        for (const c of cities) {
          rural = rural.replace(new RegExp('\\s*' + c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
        }
      }
      return { isRural: true, type: p.type, ruralPart: rural };
    }
  }

  return null;
}

function extractArea(msg, city) {
  const l = msg.toLowerCase();

  // Islamabad-style sector detection: "10/I", "I-10", "i10", "F/8", "g9" etc.
  const isbCompact = msg.match(/(\d{1,2})\s*[\/\\]\s*([a-zA-Z])/);
  if (isbCompact) {
    const sector = isbCompact[2].toUpperCase() + '-' + isbCompact[1];
    if (KNOWN_AREAS.includes(sector.toLowerCase())) return sector;
  }
  const isbDash = msg.match(/\b([a-zA-Z])\s*[-\/\\]\s*(\d{1,2})\b/);
  if (isbDash) {
    const sector = isbDash[1].toUpperCase() + '-' + isbDash[2];
    if (KNOWN_AREAS.includes(sector.toLowerCase())) return sector;
  }
  // "i10", "g9" (no separator)
  const isbJoined = l.match(/\b([efghij])(\d{1,2})\b/);
  if (isbJoined) {
    const sector = isbJoined[1].toUpperCase() + '-' + isbJoined[2];
    if (KNOWN_AREAS.includes(sector.toLowerCase())) return sector;
  }

  // City-specific matching: if city is known, check its areas first (more accurate)
  if (city) {
    const cityMatch = matchArea(l, city);
    if (cityMatch) return cityMatch;
  }

  // Check known area names (global — all cities, word-boundary match)
  for (const area of KNOWN_AREAS) {
    if (new RegExp('\\b' + area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l)) {
      return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Generic chak pattern (any chak number, not just hardcoded ones)
  const chakMatch = l.match(/\b(chak\s*(?:no\.?\s*|number\s*)?\d+[\s/-]?[a-z]{0,3})\b/i);
  if (chakMatch) return chakMatch[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // Generic patterns: X colony, X town, X nagar, X abad, etc.
  const genericPatterns = [
    /([a-z\s]{2,25})\s*(?:colony|town|nagar|abad|pura|gunj|society|scheme|housing|villas|heights|enclave|residencia|residency)/i,
    /(?:colony|town|nagar|abad|pura|gunj|society|scheme)\s+([a-z\s]{2,25})/i,
  ];
  for (const re of genericPatterns) {
    const m = msg.match(re);
    if (m) return m[0].trim();
  }

  // "gulshan e johar" style — multi-word with "e" connector
  const eStyle = msg.match(/([a-z]+\s+e\s+[a-z]+)/i);
  if (eStyle) {
    const matched = eStyle[1].trim();
    return matched.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return null;
}

// Landmark extraction + classification
const LANDMARK_TYPES = ['masjid','mosque','school','hospital','dukaan','shop','hotel','park','ground','stadium','thana','police','chowk','bazaar','market','stop','church','mandir','temple','plaza','mall','bank','atm','pump','petrol'];
const GENERIC_LANDMARKS = ['masjid','mosque','school','hospital','dukaan','shop','hotel','park','chowk','bazaar','market','stop','church','mandir','temple','plaza','mall','bank','pump','petrol'];

function extractLandmark(msg) {
  const l = msg.toLowerCase();

  // "near X" / "X ke paas" / "X ke qareeb" / "X ke samne"
  const nearPatterns = [
    /(?:near|nazd[ei]k|ke?\s*(?:paas|pass|qareeb|samne|saamne))\s+(.{3,40}?)(?:\.|,|$)/i,
    /(.{3,40}?)\s+(?:ke?\s*(?:paas|pass|qareeb|samne|saamne))/i,
  ];

  for (const re of nearPatterns) {
    const m = msg.match(re);
    if (m) {
      const raw = m[1].trim();
      return classifyLandmark(raw);
    }
  }

  return null;
}

function classifyLandmark(text) {
  const l = text.toLowerCase().trim();

  // Check if it's a generic type without a name
  for (const type of GENERIC_LANDMARKS) {
    if (l === type || l === type + ' ke paas' || l === type + ' ke pass') {
      return { text, isNamed: false, type };
    }
  }

  // Has a proper name before/after the type? e.g. "Al-Noor Masjid", "Bilal School"
  for (const type of LANDMARK_TYPES) {
    if (l.includes(type)) {
      // Remove the type word and see if anything remains
      const withoutType = l.replace(new RegExp(type, 'gi'), '').trim();
      if (withoutType.length >= 2) {
        return { text, isNamed: true, type };
      }
      return { text, isNamed: false, type };
    }
  }

  // No landmark type found — treat as named (could be "Jinnah Tower" etc.)
  if (l.length >= 3) return { text, isNamed: true, type: null };

  return null;
}

// "Nahi pata" detection for house number
function isHouseUnknown(msg) {
  const l = msg.toLowerCase().trim();
  return /\b(nahi\s*(?:pata|pta|maloom)|pta\s*nhi|nhi\s*(?:pata|pta)|pata\s*nahi|maloom\s*nahi|yaad\s*nahi|nahi\s*hai|nhi\s*hai|nahi\s*yaad)\b/i.test(l);
}

// Build address string from parts
// Normalize address text — fix common misspellings from customer input
function normalizeAddressText(text) {
  return text
    // Number words → digits
    .replace(/\b(one)\b/gi, '1').replace(/\b(two)\b/gi, '2').replace(/\b(three)\b/gi, '3')
    .replace(/\b(four)\b/gi, '4').replace(/\b(five)\b/gi, '5').replace(/\b(six)\b/gi, '6')
    .replace(/\b(seven)\b/gi, '7').replace(/\b(eight)\b/gi, '8').replace(/\b(nine)\b/gi, '9')
    .replace(/\b(ten)\b/gi, '10')
    // Common misspellings
    .replace(/\b(flat|flet)\s*(nomber|number|numbr|nmber|nmbr|nom|no\.?)\s*/gi, 'Flat ')
    .replace(/\b(house|hous)\s*(nomber|number|numbr|nmber|nmbr|nom|no\.?)\s*/gi, 'House ')
    .replace(/\b(gate|gat)\s*(nomber|number|numbr|nmber|nmbr|nom|no\.?)\s*/gi, 'Gate ')
    .replace(/\b(bloc?k?)\s*/gi, 'Block ')
    .replace(/\bappaa?rtm[ei]nt\b/gi, 'Apartment').replace(/\bappart[a-z]*\b/gi, 'Apartment')
    .replace(/\bfloor\b/gi, 'Floor')
    .replace(/\bnomber\b/gi, 'No.').replace(/\bnmbr\b/gi, 'No.').replace(/\bnumbr\b/gi, 'No.')
    // Capitalize first letter of each word
    .replace(/\b[a-z]/g, c => c.toUpperCase())
    // Clean double spaces
    .replace(/\s{2,}/g, ' ').trim();
}

function buildAddressString(parts) {
  const skip = v => !v || v === 'nahi_pata' || ['null', 'undefined', 'none', 'n/a', 'missing'].includes(String(v).toLowerCase().trim());
  const pieces = [];
  if (parts.house && !skip(parts.house)) {
    // Normalize and clean house text
    let h = normalizeAddressText(parts.house.toString());
    // Remove duplicate block info if street already has it
    if (parts.street && /^block\s/i.test(parts.street)) {
      h = h.replace(/\s*Block\s*\d+\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    if (/^(House|Flat|Plot|Makan|Apartment)\s/i.test(h)) {
      pieces.push(h);
    } else {
      pieces.push('House ' + h);
    }
  }
  if (parts.street && !skip(parts.street) && !/^(nahi?|nhi|no|none|nope)([_\s]*(he|hai|h|pata))?$/i.test(parts.street.trim())) {
    const st = parts.street.toString();
    // If street is just a number, prefix with "Gali" (Pakistan convention)
    if (/^\d+$/.test(st.trim())) {
      pieces.push('Gali ' + st);
    } else if (/^(gali|street|st)\s/i.test(st)) {
      pieces.push(st);
    } else {
      pieces.push(st);
    }
  }
  // Landmark: delivery points (Dak Khana/TCS) go FIRST, then area; urban landmarks go after area
  let landmarkText = null;
  let isDeliveryPoint = false;
  if (parts.landmark && !skip(parts.landmark)) {
    const lm = parts.landmark.toString();
    isDeliveryPoint = /\b(dak\s*khana|post\s*office|tcs|leopard|call\s*courier)\b/i.test(lm);
    if (isDeliveryPoint) {
      landmarkText = lm.replace(/\b[a-z]/g, c => c.toUpperCase());
    } else if (/^near\s/i.test(lm)) {
      landmarkText = lm;
    } else {
      landmarkText = 'near ' + lm;
    }
  }
  if (isDeliveryPoint && landmarkText) pieces.push(landmarkText);
  if (parts.area) pieces.push(parts.area);
  if (!isDeliveryPoint && landmarkText) pieces.push(landmarkText);
  // Tehsil & Zilla — for village/gaon/chak customers
  if (parts.tehsil) pieces.push('Tehsil ' + parts.tehsil);
  if (parts.zilla) pieces.push('Zilla ' + parts.zilla);
  return pieces.join(', ');
}

// Full extraction from single message
function extractAddressParts(msg, city) {
  return {
    house: extractHouse(msg),
    street: extractStreet(msg),
    area: extractArea(msg, city),
    landmark: extractLandmark(msg),
  };
}

// ============= SMART FILL =============
// Extract all possible fields from a single message
function smartFill(msg, collected) {
  const result = {};
  const product = detectProduct(msg);
  const phone = extractPhone(msg);
  const city = extractCity(msg);
  const name = extractNameFromFullMsg(msg);

  if (product && !collected.product) result.product = product;
  if (phone && !collected.phone) result.phone = phone;
  if (city && !collected.city) result.city = city;
  if (name && !collected.name) result.name = name;
  // Address detection is more nuanced — handled by AI or state machine
  if (hasAddressKeywords(msg) && !collected.address) result.address_hint = msg.trim();

  return result;
}

module.exports = {
  detectProduct, detectAllProducts, extractPhone, validatePhone, extractCity, extractAllCities, isRegion,
  extractNameFromFullMsg, isLikelyName, hasAddressKeywords, smartFill,
  extractAddressParts, extractArea, classifyLandmark, isHouseUnknown, buildAddressString,
  detectRuralAddress,
};
