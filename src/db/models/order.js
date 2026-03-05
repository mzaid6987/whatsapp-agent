/**
 * Order model — create, update status, query
 */
const { getDb } = require('../index');

function generateOrderId(prefix = 'NRV') {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-WA-${num}`;
}

function create(data) {
  const orderId = data.order_id || generateOrderId(data.prefix);
  const result = getDb().prepare(`
    INSERT INTO orders (
      order_id, conversation_id, customer_id, store_name,
      customer_name, customer_phone, delivery_phone, customer_city, customer_address,
      items_json, subtotal, delivery_fee, discount_percent, discount_total, grand_total,
      source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId, data.conversation_id || null, data.customer_id, data.store_name || 'nureva',
    data.customer_name, data.customer_phone, data.delivery_phone || null,
    data.customer_city, data.customer_address,
    JSON.stringify(data.items), data.subtotal, data.delivery_fee || 0,
    data.discount_percent || 0, data.discount_total || 0, data.grand_total,
    data.source || 'bot'
  );
  return { id: result.lastInsertRowid, order_id: orderId };
}

function findByOrderId(orderId) {
  return getDb().prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
}

function updateStatus(id, status) {
  getDb().prepare("UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, id);
}

function getByCustomer(customerId) {
  return getDb().prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
}

function getAll(limit = 100) {
  return getDb().prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const revenue = db.prepare('SELECT COALESCE(SUM(grand_total), 0) as r FROM orders').get().r;
  const confirmed = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'confirmed'").get().c;
  const shipped = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'shipped'").get().c;
  const delivered = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
  return { total, revenue, confirmed, shipped, delivered };
}

function updateOrder(orderId, data) {
  const sets = [];
  const vals = [];
  if (data.items) { sets.push('items_json = ?'); vals.push(JSON.stringify(data.items)); }
  if (data.subtotal !== undefined) { sets.push('subtotal = ?'); vals.push(data.subtotal); }
  if (data.discount_percent !== undefined) { sets.push('discount_percent = ?'); vals.push(data.discount_percent); }
  if (data.discount_total !== undefined) { sets.push('discount_total = ?'); vals.push(data.discount_total); }
  if (data.grand_total !== undefined) { sets.push('grand_total = ?'); vals.push(data.grand_total); }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now','localtime')");
  vals.push(orderId);
  getDb().prepare(`UPDATE orders SET ${sets.join(', ')} WHERE order_id = ?`).run(...vals);
}

module.exports = { generateOrderId, create, findByOrderId, updateOrder, updateStatus, getByCustomer, getAll, getStats };
