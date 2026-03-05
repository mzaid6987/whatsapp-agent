/**
 * Product model — query products, keyword search
 */
const { getDb } = require('../index');

function getAll() {
  return getDb().prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY sort_order ASC').all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function findByKeywords(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = getAll();
  return rows.filter(p => {
    const kw = (p.keywords || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return words.some(w => kw.includes(w) || name.includes(w));
  });
}

function update(id, fields) {
  const allowed = ['name', 'short_name', 'price', 'upsell_price', 'keywords', 'feature_1', 'feature_2', 'upsell_with', 'is_active', 'sort_order'];
  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key) && val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  values.push(id);
  getDb().prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function create(data) {
  const result = getDb().prepare(`
    INSERT INTO products (name, short_name, price, upsell_price, keywords, feature_1, feature_2, upsell_with, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.short_name, data.price, data.upsell_price || null,
    data.keywords, data.feature_1 || null, data.feature_2 || null,
    data.upsell_with || '[]', data.sort_order || 0
  );
  return findById(result.lastInsertRowid);
}

module.exports = { getAll, findById, findByKeywords, update, create };
