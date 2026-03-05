/**
 * Message model — log all incoming/outgoing messages
 */
const { getDb } = require('../index');

function create(conversationId, direction, sender, content, extra = {}) {
  const result = getDb().prepare(`
    INSERT INTO messages (conversation_id, direction, sender, content, intent, source, tokens_in, tokens_out, response_ms, debug_json, wa_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId, direction, sender, content,
    extra.intent || null, extra.source || null,
    extra.tokens_in || 0, extra.tokens_out || 0, extra.response_ms || 0,
    extra.debug_json ? (typeof extra.debug_json === 'string' ? extra.debug_json : JSON.stringify(extra.debug_json)) : null,
    extra.wa_message_id || null
  );
  return result.lastInsertRowid;
}

function getRecent(conversationId, limit = 10) {
  return getDb().prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(conversationId, limit).reverse(); // Reverse to get chronological order
}

function getForConversation(conversationId) {
  return getDb().prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);
}

function getAiContext(conversationId, limit = 6) {
  const rows = getDb().prepare(`
    SELECT direction, sender, content FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(conversationId, limit).reverse();

  return rows.map(r => ({
    role: r.direction === 'incoming' ? 'user' : 'assistant',
    content: r.content
  }));
}

function updateFeedback(messageId, feedback) {
  return getDb().prepare('UPDATE messages SET admin_feedback = ? WHERE id = ?').run(feedback || null, messageId);
}

module.exports = { create, getRecent, getForConversation, getAiContext, updateFeedback };
