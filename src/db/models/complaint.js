/**
 * Complaint model — track & manage customer complaints
 */
const { getDb } = require('../index');

function create(data) {
  const result = getDb().prepare(`
    INSERT INTO complaints (conversation_id, customer_id, customer_name, customer_phone, product_name, description, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(data.conversation_id || null, data.customer_id || null, data.customer_name || null, data.customer_phone || null, data.product_name || null, data.description || null);
  return findById(result.lastInsertRowid);
}

function findById(id) {
  return getDb().prepare('SELECT * FROM complaints WHERE id = ?').get(id);
}

function findByConversation(conversationId) {
  return getDb().prepare('SELECT * FROM complaints WHERE conversation_id = ? ORDER BY created_at DESC').get(conversationId);
}

function getAll() {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM complaint_remarks WHERE complaint_id = c.id) as remark_count,
      (SELECT remark FROM complaint_remarks WHERE complaint_id = c.id ORDER BY created_at DESC LIMIT 1) as last_remark,
      (SELECT created_at FROM complaint_remarks WHERE complaint_id = c.id ORDER BY created_at DESC LIMIT 1) as last_remark_at,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.conversation_id AND sender = 'bot' AND created_at >= c.created_at) as bot_replies_after,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.conversation_id AND sender = 'human' AND created_at >= c.created_at) as human_replies_after,
      (SELECT content FROM messages WHERE conversation_id = c.conversation_id AND sender IN ('bot','human') AND created_at >= c.created_at ORDER BY created_at DESC LIMIT 1) as last_reply
    FROM complaints c
    ORDER BY
      CASE c.status WHEN 'active' THEN 0 ELSE 1 END,
      c.created_at DESC
  `).all();
}

function updateStatus(id, status) {
  getDb().prepare(`UPDATE complaints SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status, id);
}

function addRemark(complaintId, remark) {
  const result = getDb().prepare(`INSERT INTO complaint_remarks (complaint_id, remark) VALUES (?, ?)`).run(complaintId, remark);
  // Update complaint updated_at
  getDb().prepare(`UPDATE complaints SET updated_at = datetime('now','localtime') WHERE id = ?`).run(complaintId);
  return { id: result.lastInsertRowid, complaint_id: complaintId, remark, created_at: new Date().toLocaleString() };
}

function getRemarks(complaintId) {
  return getDb().prepare(`SELECT * FROM complaint_remarks WHERE complaint_id = ? ORDER BY created_at ASC`).all(complaintId);
}

function getStats() {
  const db = getDb();
  return {
    total: db.prepare('SELECT COUNT(*) as cnt FROM complaints').get()?.cnt || 0,
    active: db.prepare("SELECT COUNT(*) as cnt FROM complaints WHERE status = 'active'").get()?.cnt || 0,
    closed: db.prepare("SELECT COUNT(*) as cnt FROM complaints WHERE status = 'closed'").get()?.cnt || 0,
    unsolveable: db.prepare("SELECT COUNT(*) as cnt FROM complaints WHERE status = 'unsolveable'").get()?.cnt || 0,
    refund: db.prepare("SELECT COUNT(*) as cnt FROM complaints WHERE status = 'refund'").get()?.cnt || 0,
    exchange: db.prepare("SELECT COUNT(*) as cnt FROM complaints WHERE status = 'exchange'").get()?.cnt || 0,
  };
}

module.exports = { create, findById, findByConversation, getAll, updateStatus, addRemark, getRemarks, getStats };
