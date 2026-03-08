/**
 * Product Media model — images/videos per product
 */
const { getDb } = require('../index');

function getByProduct(productId, type = null) {
  if (type) {
    return getDb().prepare('SELECT * FROM product_media WHERE product_id = ? AND type = ? ORDER BY sort_order ASC').all(productId, type);
  }
  return getDb().prepare('SELECT * FROM product_media WHERE product_id = ? ORDER BY sort_order ASC').all(productId);
}

function getAll() {
  return getDb().prepare('SELECT * FROM product_media ORDER BY product_id ASC, sort_order ASC').all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM product_media WHERE id = ?').get(id);
}

function create(data) {
  const result = getDb().prepare(`
    INSERT INTO product_media (product_id, type, filename, original_name, caption, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.product_id, data.type, data.filename,
    data.original_name || null, data.caption || null, data.sort_order || 0
  );
  return findById(result.lastInsertRowid);
}

function remove(id) {
  const media = findById(id);
  if (media) {
    getDb().prepare('DELETE FROM product_media WHERE id = ?').run(id);
  }
  return media;
}

function updateCaption(id, caption) {
  getDb().prepare('UPDATE product_media SET caption = ? WHERE id = ?').run(caption, id);
}

module.exports = { getByProduct, getAll, findById, create, remove, updateCaption };
