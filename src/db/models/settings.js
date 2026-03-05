/**
 * Settings model — key-value config store
 */
const { getDb } = require('../index');

function get(key, defaultValue = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function set(key, value) {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
  `).run(key, String(value));
}

function getAll() {
  const rows = getDb().prepare('SELECT * FROM settings ORDER BY key').all();
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

function getNumber(key, defaultValue = 0) {
  const val = get(key);
  return val !== null ? Number(val) : defaultValue;
}

function getBoolean(key, defaultValue = false) {
  const val = get(key);
  if (val === null) return defaultValue;
  return val === 'true' || val === '1';
}

module.exports = { get, set, getAll, getNumber, getBoolean };
