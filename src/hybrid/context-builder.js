/**
 * Context Builder — builds rich AI context from DB
 * Includes: customer profile, past orders, recent messages
 */
const customerModel = require('../db/models/customer');
const messageModel = require('../db/models/message');

/**
 * Build context for AI about a customer
 * @param {string} phone - Customer phone
 * @param {number|null} conversationId - Current conversation ID
 * @returns {object} { isReturning, profile, orderHistory, recentMessages }
 */
function buildContext(phone, conversationId) {
  const customer = customerModel.findByPhone(phone);

  if (!customer) {
    return { isReturning: false, profile: null, orderHistory: [], recentMessages: [] };
  }

  // Get order history
  const orders = customerModel.getOrderHistory(customer.id);

  // Get recent messages from current conversation
  let recentMessages = [];
  if (conversationId) {
    recentMessages = messageModel.getAiContext(conversationId, 6);
  }

  return {
    isReturning: customer.total_orders > 0,
    profile: {
      name: customer.name,
      gender: customer.gender,
      city: customer.city,
      lastAddress: customer.last_address,
      totalOrders: customer.total_orders,
      totalSpent: customer.total_spent,
    },
    orderHistory: orders.slice(0, 5).map(o => ({
      orderId: o.order_id,
      items: o.items_json ? JSON.parse(o.items_json) : [],
      total: o.grand_total,
      status: o.status,
      date: o.created_at,
    })),
    recentMessages,
  };
}

/**
 * Build a text summary for AI prompt
 */
function buildContextSummary(phone, conversationId) {
  const ctx = buildContext(phone, conversationId);
  if (!ctx.isReturning) return '';

  const p = ctx.profile;
  let summary = `\n## RETURNING CUSTOMER`;
  summary += `\nName: ${p.name || 'Unknown'}`;
  if (p.city) summary += ` | City: ${p.city}`;
  summary += ` | Orders: ${p.totalOrders} | Spent: Rs.${p.totalSpent?.toLocaleString() || 0}`;

  if (ctx.orderHistory.length) {
    summary += '\nPast orders:';
    for (const o of ctx.orderHistory) {
      const items = o.items.map(i => i.name).join(', ');
      summary += `\n- ${items} (Rs.${o.total}) — ${o.status}`;
    }
  }

  return summary;
}

/**
 * Get pre-fill data for returning customer (smart-skip)
 */
function getSmartFill(phone) {
  const customer = customerModel.findByPhone(phone);
  if (!customer || customer.total_orders === 0) return null;

  return {
    name: customer.name,
    city: customer.city,
    address: customer.last_address,
    phone: customer.phone,
  };
}

module.exports = { buildContext, buildContextSummary, getSmartFill };
