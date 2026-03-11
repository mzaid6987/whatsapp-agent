/**
 * Quality Gate: banned words check, emoji strip, validation
 */

const BANNED_WORDS = [
  'premium', 'high-quality', 'ultra', 'best', 'top-notch', 'superior', 'excellent',
  'hamara product best', 'best price', 'sabse acha',
  'yaar', 'bhai', 'behn', 'baji', 'api', 'baho',
  'bata na', 'bol na', 'sun na',
  'order ready hai', 'delivery proper ho jaye',
  'tum ', 'tujhe', 'tumhe', 'tera ', 'teri ',
  'kya haal hai', 'kaise ho',
];

// Store/brand names that should NEVER appear in bot responses
// AI sometimes mentions the store name which looks unprofessional
const BRAND_NAMES_BANNED = ['nureva', 'thenureva', 'the nureva'];

// Emoji regex — matches most common emoji ranges
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

function qualityGate(response) {
  if (!response) return response;
  let text = response;

  // Garbage detection — AI sometimes returns empty whitespace/newlines (token waste)
  const stripped = text.replace(/[\s\r\n]+/g, '').trim();
  if (stripped.length < 3) {
    console.warn(`[QualityGate] Garbage response detected (${text.length} chars → ${stripped.length} meaningful)`);
    return null; // null = fallback to template
  }
  // Whitespace-heavy garbage — if >80% of chars are whitespace, it's garbage
  // AI sometimes produces 400 tokens of \n\s with a few real chars buried in it
  if (text.length > 50 && stripped.length / text.length < 0.2) {
    console.warn(`[QualityGate] Whitespace-heavy garbage (${stripped.length}/${text.length} = ${(stripped.length/text.length*100).toFixed(0)}% meaningful)`);
    return null;
  }
  // JSON fragment garbage — starts with { but isn't a complete readable response
  if (/^\s*\{/.test(text) && !/\breply\b/.test(text)) {
    console.warn(`[QualityGate] JSON fragment garbage detected`);
    return null;
  }

  // Keep emojis — they improve WhatsApp readability
  // (Previously stripped, but product list + responses need them)

  // Replace Arabic/Urdu script with Roman equivalents (AI sometimes mixes scripts)
  // Common Arabic letters → Roman Urdu sound
  const ARABIC_TO_ROMAN = {
    '\u0627': 'a',  // ا alef
    '\u0628': 'b',  // ب
    '\u067E': 'p',  // پ
    '\u062A': 't',  // ت
    '\u0679': 't',  // ٹ
    '\u062C': 'j',  // ج
    '\u0686': 'ch', // چ
    '\u062D': 'h',  // ح
    '\u062E': 'kh', // خ
    '\u062F': 'd',  // د
    '\u0688': 'd',  // ڈ
    '\u0631': 'r',  // ر
    '\u0691': 'r',  // ڑ
    '\u0632': 'z',  // ز
    '\u0698': 'zh', // ژ
    '\u0633': 's',  // س
    '\u0634': 'sh', // ش
    '\u0635': 's',  // ص
    '\u0636': 'z',  // ض
    '\u0637': 't',  // ط
    '\u0638': 'z',  // ظ
    '\u0639': 'a',  // ع
    '\u063A': 'gh', // غ
    '\u0641': 'f',  // ف
    '\u0642': 'q',  // ق
    '\u06A9': 'k',  // ک
    '\u06AF': 'g',  // گ
    '\u0644': 'l',  // ل
    '\u0645': 'm',  // م
    '\u0646': 'n',  // ن
    '\u0648': 'o',  // و
    '\u06C1': 'h',  // ہ
    '\u06CC': 'i',  // ی
    '\u06D2': 'e',  // ے
    '\u064A': 'y',  // ي
  };
  text = text.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, ch => ARABIC_TO_ROMAN[ch] || '').trim();

  // Check banned words (log warning but don't block — template responses are pre-checked)
  const l = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (l.includes(word.toLowerCase())) {
      console.warn(`[QualityGate] Banned word detected: "${word}" in response`);
    }
  }

  // Strip brand/store names from AI responses
  for (const brand of BRAND_NAMES_BANNED) {
    if (l.includes(brand)) {
      console.warn(`[QualityGate] Brand name stripped: "${brand}"`);
      text = text.replace(new RegExp(brand, 'gi'), 'hamari shop');
    }
  }

  // Clean up double spaces (but preserve newlines)
  text = text.replace(/ {2,}/g, ' ').trim();

  // Ensure no empty response
  if (!text) text = 'Ji sir, batayein kaise madad karun?';

  return text;
}

module.exports = { qualityGate };
