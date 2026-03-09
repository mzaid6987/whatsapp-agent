/**
 * Conversation model — active session management
 */
const { getDb } = require('../index');

function findActive(customerId) {
  return getDb().prepare(`
    SELECT * FROM conversations
    WHERE customer_id = ? AND is_active = 1
    ORDER BY last_message_at DESC LIMIT 1
  `).get(customerId);
}

function findById(id) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function create(customerId, storeName = 'nureva') {
  // Deactivate old conversations
  getDb().prepare('UPDATE conversations SET is_active = 0 WHERE customer_id = ? AND is_active = 1').run(customerId);

  const result = getDb().prepare(`
    INSERT INTO conversations (customer_id, store_name, state, collected_json, last_message_at)
    VALUES (?, ?, 'IDLE', '{}', datetime('now','localtime'))
  `).run(customerId, storeName);
  return findById(result.lastInsertRowid);
}

function getOrCreateActive(customerId, storeName) {
  const active = findActive(customerId);
  if (active) return active;
  return create(customerId, storeName);
}

function updateState(id, state, productJson, productsJson, collectedJson, haggleRound, discountPercent, upsellJson, unknownCount) {
  getDb().prepare(`
    UPDATE conversations SET
      state = ?, product_json = ?, products_json = ?, collected_json = ?,
      haggle_round = ?, discount_percent = ?, upsell_json = ?, unknown_count = ?,
      last_message_at = datetime('now','localtime'),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(state, productJson, productsJson, collectedJson, haggleRound, discountPercent, upsellJson, unknownCount, id);
}

function updateLastMessage(id, message) {
  getDb().prepare(`
    UPDATE conversations SET
      last_message = ?, last_message_at = datetime('now','localtime'),
      message_count = message_count + 1, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(message, id);
}

function addTokens(id, tokensIn, tokensOut) {
  getDb().prepare('UPDATE conversations SET ai_tokens_used = ai_tokens_used + ? + ? WHERE id = ?').run(tokensIn, tokensOut, id);
}

function setNeedsHuman(id, value) {
  getDb().prepare('UPDATE conversations SET needs_human = ?, complaint_flag = ? WHERE id = ?').run(value ? 1 : 0, value ? 1 : 0, id);
}

function setHumanOnly(id, value) {
  getDb().prepare('UPDATE conversations SET needs_human = ? WHERE id = ?').run(value ? 1 : 0, id);
}

function setSpam(id, value) {
  getDb().prepare('UPDATE conversations SET spam_flag = ? WHERE id = ?').run(value ? 1 : 0, id);
}

function setAdminUnread(id, value) {
  getDb().prepare('UPDATE conversations SET admin_unread = ? WHERE id = ?').run(value ? 1 : 0, id);
}

function getAll(limit = 100) {
  return getDb().prepare(`
    SELECT c.*, cu.phone, cu.name as customer_name, cu.wa_profile_name,
      (SELECT direction FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg_direction,
      (SELECT sender FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg_sender,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg_time
    FROM conversations c
    JOIN customers cu ON cu.id = c.customer_id
    ORDER BY c.last_message_at DESC LIMIT ?
  `).all(limit);
}

function getActive() {
  return getDb().prepare(`
    SELECT c.*, cu.phone, cu.name as customer_name, cu.wa_profile_name
    FROM conversations c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.is_active = 1
    ORDER BY c.last_message_at DESC
  `).all();
}

module.exports = { findActive, findById, create, getOrCreateActive, updateState, updateLastMessage, addTokens, setNeedsHuman, setHumanOnly, setSpam, setAdminUnread, getAll, getActive };
