/**
 * Response Generator — 3-layer response decision
 * Layer 1: Template (from state-machine) — free, fast
 * Layer 2: Cache lookup — free, fast
 * Layer 3: AI call — costs tokens, slow
 *
 * After AI call, response is cached for future use.
 */
const cacheModel = require('../db/models/cache');

/**
 * Try cache before calling AI
 * @param {string} intent
 * @param {string} state
 * @param {number|null} productId
 * @returns {object|null} { text, fromCache: true } or null
 */
function tryCache(intent, state, productId) {
  const cached = cacheModel.lookup(intent, state, productId);
  if (cached) {
    return { text: cached.text, fromCache: true };
  }
  return null;
}

/**
 * Save AI response to cache for future reuse
 * @param {string} intent
 * @param {string} state
 * @param {number|null} productId
 * @param {string} responseText
 */
function saveToCache(intent, state, productId, responseText) {
  // Only cache for specific intents (not generic UNKNOWN or address collection)
  const cacheable = ['PRODUCT_INQUIRY', 'TRUST_QUESTION', 'DELIVERY_QUERY', 'HAGGLE'];
  if (!cacheable.includes(intent)) return;

  try {
    cacheModel.store(intent, state, productId, responseText);
  } catch (e) {
    console.error('[Cache] Save error:', e.message);
  }
}

module.exports = { tryCache, saveToCache };
