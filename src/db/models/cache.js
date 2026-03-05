/**
 * Response cache model — cache AI responses by intent+state+product
 */
const { getDb } = require('../index');

function buildKey(intent, state, productId) {
  return `${intent}|${state}|${productId || 'none'}`;
}

function lookup(intent, state, productId) {
  const key = buildKey(intent, state, productId);
  const row = getDb().prepare('SELECT * FROM response_cache WHERE cache_key = ?').get(key);
  if (row) {
    // Update hit count and last_used
    getDb().prepare("UPDATE response_cache SET hit_count = hit_count + 1, last_used_at = datetime('now','localtime') WHERE id = ?").run(row.id);
    return {
      text: row.response_text,
      variables: row.variables_json ? JSON.parse(row.variables_json) : null
    };
  }
  return null;
}

function store(intent, state, productId, responseText, variables = null) {
  const key = buildKey(intent, state, productId);
  getDb().prepare(`
    INSERT INTO response_cache (cache_key, intent, state, product_id, response_text, variables_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      response_text = excluded.response_text,
      variables_json = excluded.variables_json,
      last_used_at = datetime('now','localtime')
  `).run(key, intent, state, productId || null, responseText, variables ? JSON.stringify(variables) : null);
}

function cleanup(daysOld = 30) {
  const result = getDb().prepare(`
    DELETE FROM response_cache
    WHERE last_used_at < datetime('now','localtime', '-' || ? || ' days')
  `).run(daysOld);
  return result.changes;
}

function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM response_cache').get().c;
  const totalHits = db.prepare('SELECT COALESCE(SUM(hit_count), 0) as h FROM response_cache').get().h;
  return { total, totalHits };
}

module.exports = { lookup, store, cleanup, getStats };
