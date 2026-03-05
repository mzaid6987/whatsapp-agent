/**
 * Customer model — find, create, update by phone
 */
const { getDb } = require('../index');

function normalizePhone(phone) {
  if (!phone) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) digits = '0' + digits.slice(2);
  if (digits.startsWith('3') && digits.length === 10) digits = '0' + digits;
  return digits;
}

function findByPhone(phone) {
  return getDb().prepare('SELECT * FROM customers WHERE phone = ?').get(normalizePhone(phone));
}

function findById(id) {
  return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

function create(phone) {
  const result = getDb().prepare(
    'INSERT INTO customers (phone) VALUES (?)'
  ).run(normalizePhone(phone));
  return findById(result.lastInsertRowid);
}

function findOrCreate(phone) {
  const normalized = normalizePhone(phone);
  const existing = findByPhone(normalized);
  if (existing) {
    getDb().prepare('UPDATE customers SET last_active_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(existing.id);
    return existing;
  }
  return create(normalized);
}

function update(id, fields) {
  const allowed = ['name', 'gender', 'city', 'last_address', 'total_orders', 'total_spent', 'is_blocked', 'needs_human', 'notes'];
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
  getDb().prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function incrementOrders(id, amount) {
  getDb().prepare(
    'UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?'
  ).run(amount, id);
}

function getAll(limit = 100) {
  return getDb().prepare('SELECT * FROM customers ORDER BY last_active_at DESC LIMIT ?').all(limit);
}

function getOrderHistory(customerId) {
  return getDb().prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
}

module.exports = { findByPhone, findById, create, findOrCreate, update, incrementOrders, getAll, getOrderHistory };
