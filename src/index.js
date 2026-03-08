// Force Pakistan Standard Time (UTC+5) — server may be in US timezone
process.env.TZ = 'Asia/Karachi';
// Polyfill globalThis.File for Node 18 (openai SDK v6 needs it for file uploads)
if (!globalThis.File) {
  try { globalThis.File = require('node:buffer').File; } catch (e) { /* Node < 18.13 */ }
}
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const hybrid = require('./hybrid');
const { webhookVerify, webhookHandler, setBroadcast } = require('./whatsapp/webhook');
const { sendMessage, toInternational } = require('./whatsapp/sender');

// DB modules
const { initDb, getDb } = require('./db');
const { seedAll } = require('./db/seed');
const customerModel = require('./db/models/customer');
const conversationModel = require('./db/models/conversation');
const messageModel = require('./db/models/message');
const orderModel = require('./db/models/order');
const productModel = require('./db/models/product');
const settingsModel = require('./db/models/settings');
const cacheModel = require('./db/models/cache');
const mediaModel = require('./db/models/media');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Dashboard WebSocket connected');
  ws.on('close', () => console.log('Dashboard WebSocket disconnected'));
});

// Broadcast to all connected dashboard clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(data));
  });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Admin password (from env or default for dev)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const AUTH_SECRET = process.env.SESSION_SECRET || 'whatsapp-agent-secret-key-change-me';

// Simple signed-cookie auth (survives server restarts — no memory sessions)
const crypto = require('crypto');
function signToken(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64').toString()); } catch { return null; }
}

// Auth middleware
function requireAuth(req, res, next) {
  // Check signed cookie token (persistent) OR legacy session
  const token = req.cookies?.auth_token;
  if (token && verifyToken(token)) return next();
  if (req.session && req.session.authenticated) return next();
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/admin/login.html');
}

// Keep express-session for backwards compat (existing logged-in users)
app.use(session({
  secret: AUTH_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ---- AUTH API ----
app.post('/api/auth/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    // Also set signed cookie (survives restarts, 30 days)
    const token = signToken({ auth: true, t: Date.now() });
    res.cookie('auth_token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('auth_token');
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const tokenValid = !!(req.cookies?.auth_token && verifyToken(req.cookies.auth_token));
  const sessionValid = !!(req.session && req.session.authenticated);
  res.json({ authenticated: tokenValid || sessionValid });
});

// ---- API ROUTES (Real DB) ----

// Current AI model info
app.get('/api/model', requireAuth, (req, res) => {
  const { getActiveModel, getModelInfo, MODEL_OPTIONS } = require('./ai/claude');
  const active = getActiveModel();
  const info = getModelInfo(active);
  res.json({ model: active, name: info.name, pricing: { input: info.input, output: info.output }, options: MODEL_OPTIONS });
});

// Stats
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const orderStats = orderModel.getStats();
    const totalConversations = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
    const activeChats = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE is_active = 1').get().c;
    const pendingHuman = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE needs_human = 1 AND is_active = 1').get().c;
    const complaints = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE complaint_flag = 1 AND is_active = 1').get().c;
    const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = date('now','localtime')").get().c;
    const todayRevenue = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as r FROM orders WHERE date(created_at) = date('now','localtime')").get().r;

    // Last 7 days chart data
    const days = [];
    const labels = [];
    const chartConversations = [];
    const chartOrders = [];
    for (let i = 6; i >= 0; i--) {
      const d = db.prepare(`SELECT date('now','localtime','-${i} days') as d`).get().d;
      days.push(d);
      labels.push(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getDay()]);
      chartConversations.push(db.prepare("SELECT COUNT(*) as c FROM conversations WHERE date(created_at) = ?").get(d).c);
      chartOrders.push(db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(d).c);
    }

    res.json({
      total_conversations: totalConversations,
      total_orders: todayOrders,
      total_revenue: todayRevenue,
      conversion_rate: totalConversations > 0 ? ((orderStats.total / totalConversations) * 100).toFixed(1) : 0,
      active_chats: activeChats,
      pending_human: pendingHuman,
      unreplied: 0,
      complaints,
      chart_labels: labels,
      chart_conversations: chartConversations,
      chart_orders: chartOrders,
      all_time_orders: orderStats.total,
      all_time_revenue: orderStats.revenue,
    });
  } catch (e) {
    console.error('[API] Stats error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Analytics (comprehensive)
app.get('/api/analytics', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { date, month } = req.query;

    // Date filter logic
    let chatWhere, orderWhere, msgWhere, dateVal;
    if (date) {
      chatWhere = "date(c.created_at) = ?";
      orderWhere = "date(o.created_at) = ?";
      msgWhere = "date(m.created_at) = ?";
      dateVal = date;
    } else if (month) {
      chatWhere = "strftime('%Y-%m', c.created_at) = ?";
      orderWhere = "strftime('%Y-%m', o.created_at) = ?";
      msgWhere = "strftime('%Y-%m', m.created_at) = ?";
      dateVal = month;
    } else {
      // Default: today
      chatWhere = "date(c.created_at) = date('now','localtime')";
      orderWhere = "date(o.created_at) = date('now','localtime')";
      msgWhere = "date(m.created_at) = date('now','localtime')";
      dateVal = null;
    }
    const chatParams = dateVal ? [dateVal] : [];
    const orderParams = dateVal ? [dateVal] : [];
    const msgParams = dateVal ? [dateVal] : [];

    // 1. CHAT METRICS
    const totalChats = db.prepare(`SELECT COUNT(*) as c FROM conversations c WHERE ${chatWhere}`).get(...chatParams).c;
    const spamChats = db.prepare(`SELECT COUNT(*) as c FROM conversations c WHERE ${chatWhere} AND c.spam_flag = 1`).get(...chatParams).c;
    const humanChats = db.prepare(`SELECT COUNT(*) as c FROM conversations c WHERE ${chatWhere} AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'human')`).get(...chatParams).c;
    const botOnlyChats = totalChats - humanChats;

    // 2. ORDER METRICS
    const orderTotals = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(o.grand_total), 0) as revenue FROM orders o WHERE ${orderWhere}`).get(...orderParams);
    const ordersByStatus = db.prepare(`SELECT o.status, COUNT(*) as count FROM orders o WHERE ${orderWhere} GROUP BY o.status`).all(...orderParams);
    const ordersBySource = db.prepare(`SELECT o.source, COUNT(*) as count FROM orders o WHERE ${orderWhere} GROUP BY o.source`).all(...orderParams);

    // 3. MESSAGE SOURCE BREAKDOWN
    const msgSources = db.prepare(`SELECT m.source, COUNT(*) as count FROM messages m WHERE ${msgWhere} AND m.sender = 'bot' GROUP BY m.source`).all(...msgParams);
    const totalBotMsgs = msgSources.reduce((s, r) => s + r.count, 0);
    const templateMsgs = msgSources.filter(r => r.source === 'template' || r.source === 'pre-check' || r.source === 'auto-template').reduce((s, r) => s + r.count, 0);
    const aiMsgs = msgSources.filter(r => r.source === 'ai').reduce((s, r) => s + r.count, 0);
    const humanMsgs = db.prepare(`SELECT COUNT(*) as c FROM messages m WHERE ${msgWhere} AND m.sender = 'human'`).get(...msgParams).c;

    // 4. AI COST
    const aiTokens = db.prepare(`SELECT COALESCE(SUM(m.tokens_in), 0) as tin, COALESCE(SUM(m.tokens_out), 0) as tout FROM messages m WHERE ${msgWhere} AND m.sender = 'bot' AND m.source = 'ai'`).get(...msgParams);
    // Parse costs from debug_json
    const costRows = db.prepare(`SELECT m.debug_json FROM messages m WHERE ${msgWhere} AND m.sender = 'bot' AND m.debug_json IS NOT NULL`).all(...msgParams);
    let totalAiCost = 0, totalMediaCost = 0;
    for (const row of costRows) {
      try {
        const d = JSON.parse(row.debug_json);
        if (d._cost_rs) totalAiCost += d._cost_rs;
        if (d._media_cost_rs) totalMediaCost += d._media_cost_rs;
      } catch {}
    }

    // 5. FUNNEL — count how many conversations reached each state (using max state reached)
    // We track by current state of conversations that started on this date
    const funnelStates = db.prepare(`SELECT c.state, COUNT(*) as count FROM conversations c WHERE ${chatWhere} GROUP BY c.state`).all(...chatParams);

    // Build funnel: order of states matters
    const FUNNEL_ORDER = ['GREETING', 'PRODUCT_INQUIRY', 'PRODUCT_SELECTION', 'COLLECT_NAME', 'COLLECT_PHONE', 'COLLECT_DELIVERY_PHONE', 'COLLECT_CITY', 'COLLECT_ADDRESS', 'ORDER_SUMMARY', 'UPSELL_HOOK', 'UPSELL_SHOW', 'ORDER_CONFIRMED'];
    const stateMap = {};
    for (const r of funnelStates) stateMap[r.state] = r.count;

    // Count conversations that REACHED each stage (current state = stopped here, or went past)
    // For accurate funnel, count orders as having passed through all stages
    const ordersCount = orderTotals.count;
    const funnel = FUNNEL_ORDER.map((state, i) => {
      // Conversations currently AT this state + all conversations past this state
      let reached = 0;
      for (let j = i; j < FUNNEL_ORDER.length; j++) {
        reached += stateMap[FUNNEL_ORDER[j]] || 0;
      }
      // Also add HAGGLING (can appear at various points)
      if (i <= FUNNEL_ORDER.indexOf('COLLECT_NAME')) reached += stateMap['HAGGLING'] || 0;
      return { state, count: reached };
    });

    // 6. DISCOUNT STATS
    const discountStats = db.prepare(`SELECT COUNT(*) as count, COALESCE(AVG(o.discount_percent), 0) as avg_pct, COALESCE(SUM(o.discount_total), 0) as total_disc FROM orders o WHERE ${orderWhere} AND o.discount_percent > 0`).get(...orderParams);

    // 7. COMPLAINTS
    const totalComplaints = db.prepare(`SELECT COUNT(*) as c FROM conversations c WHERE ${chatWhere} AND c.complaint_flag = 1`).get(...chatParams).c;
    const humanResolved = db.prepare(`SELECT COUNT(*) as c FROM conversations c WHERE ${chatWhere} AND c.complaint_flag = 1 AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'human')`).get(...chatParams).c;
    const complaintList = db.prepare(`SELECT c.id, c.state, c.last_message, c.last_message_at, cu.name, cu.phone FROM conversations c LEFT JOIN customers cu ON c.customer_id = cu.id WHERE ${chatWhere} AND c.complaint_flag = 1 ORDER BY c.last_message_at DESC`).all(...chatParams);

    // 8. LOST CUSTOMERS — conversations that didn't reach ORDER_CONFIRMED
    const lostCustomers = db.prepare(`SELECT c.id, c.state, c.last_message, c.last_message_at, c.created_at, cu.name, cu.phone FROM conversations c LEFT JOIN customers cu ON c.customer_id = cu.id WHERE ${chatWhere} AND c.state NOT IN ('ORDER_CONFIRMED', 'IDLE') AND c.spam_flag = 0 ORDER BY c.last_message_at DESC LIMIT 100`).all(...chatParams);

    // Map lost customer reason
    const lostWithReason = lostCustomers.map(lc => {
      let reason = 'Unknown';
      if (lc.state === 'GREETING') reason = 'Product nahi dekha';
      else if (lc.state === 'PRODUCT_INQUIRY' || lc.state === 'PRODUCT_SELECTION') reason = 'Product dekha lekin order nahi kiya';
      else if (lc.state === 'HAGGLING') reason = 'Price pe agree nahi hua';
      else if (lc.state === 'COLLECT_NAME') reason = 'Naam nahi diya';
      else if (lc.state === 'COLLECT_PHONE') reason = 'Phone nahi diya';
      else if (lc.state === 'COLLECT_CITY') reason = 'City nahi batai';
      else if (lc.state === 'COLLECT_ADDRESS') reason = 'Address nahi diya';
      else if (lc.state === 'COLLECT_DELIVERY_PHONE') reason = 'Delivery phone nahi diya';
      else if (lc.state === 'ORDER_SUMMARY') reason = 'Summary pe confirm nahi kiya';
      else if (lc.state === 'UPSELL_HOOK' || lc.state === 'UPSELL_SHOW') reason = 'Upsell pe ruk gaya';
      else if (lc.state === 'COMPLAINT') reason = 'Complaint ki';
      return { ...lc, reason };
    });

    // 9. FOLLOW-UP STATUS — non-completed chats, check if human sent a message after customer's last msg
    const followUp = db.prepare(`
      SELECT c.id, c.state, c.last_message_at, cu.name, cu.phone,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'human') as human_msgs,
        (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'human') as last_human_at
      FROM conversations c LEFT JOIN customers cu ON c.customer_id = cu.id
      WHERE ${chatWhere} AND c.state NOT IN ('ORDER_CONFIRMED', 'IDLE') AND c.spam_flag = 0
      ORDER BY c.last_message_at DESC LIMIT 100
    `).all(...chatParams);
    const followUpList = followUp.map(f => ({
      ...f,
      followed_up: f.human_msgs > 0,
      follow_up_date: f.last_human_at || null,
    }));

    // 10. CHART DATA — daily breakdown for trend
    const chartDays = month ? 30 : 7;
    const chartLabels = [], chartChats = [], chartOrders = [];
    const baseDate = date || (month ? month + '-01' : null);
    for (let i = chartDays - 1; i >= 0; i--) {
      let d;
      if (month) {
        d = db.prepare(`SELECT date('${month}-01', '+' || ? || ' days') as d`).get(chartDays - 1 - i).d;
      } else {
        const ref = date || "date('now','localtime')";
        d = db.prepare(`SELECT date(${date ? '?' : ref}, '-' || ? || ' days') as d`).get(...(date ? [date, i] : [i])).d;
      }
      chartLabels.push(d.slice(5)); // MM-DD
      chartChats.push(db.prepare("SELECT COUNT(*) as c FROM conversations WHERE date(created_at) = ?").get(d).c);
      chartOrders.push(db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(d).c);
    }

    // 11. CANCELLATIONS
    const cancellations = db.prepare(`SELECT COUNT(*) as c FROM orders o WHERE ${orderWhere} AND o.status = 'cancelled'`).get(...orderParams).c;

    const conversionRate = totalChats > 0 ? ((orderTotals.count / totalChats) * 100).toFixed(1) : '0.0';
    const templatePct = totalBotMsgs > 0 ? ((templateMsgs / totalBotMsgs) * 100).toFixed(0) : '0';

    res.json({
      // KPI
      total_chats: totalChats,
      spam_chats: spamChats,
      bot_only_chats: botOnlyChats,
      human_chats: humanChats,
      total_orders: orderTotals.count,
      total_revenue: orderTotals.revenue,
      conversion_rate: conversionRate,
      template_pct: templatePct,
      cancellations,
      // Orders
      orders_by_status: ordersByStatus,
      orders_by_source: ordersBySource,
      // Messages
      msg_sources: msgSources,
      template_msgs: templateMsgs,
      ai_msgs: aiMsgs,
      human_msgs: humanMsgs,
      total_bot_msgs: totalBotMsgs,
      // AI Cost
      ai_tokens_in: aiTokens.tin,
      ai_tokens_out: aiTokens.tout,
      ai_cost_rs: Math.round(totalAiCost * 100) / 100,
      media_cost_rs: Math.round(totalMediaCost * 100) / 100,
      total_cost_rs: Math.round((totalAiCost + totalMediaCost) * 100) / 100,
      avg_cost_per_chat: totalChats > 0 ? Math.round(((totalAiCost + totalMediaCost) / totalChats) * 100) / 100 : 0,
      // Discount
      discount_stats: discountStats,
      // Funnel
      funnel,
      // Complaints
      total_complaints: totalComplaints,
      complaints_human_resolved: humanResolved,
      complaints_pending: totalComplaints - humanResolved,
      complaint_list: complaintList,
      // Lost customers
      lost_customers: lostWithReason,
      // Follow-up
      follow_up_list: followUpList,
      // Charts
      chart_labels: chartLabels,
      chart_chats: chartChats,
      chart_orders: chartOrders,
    });
  } catch (e) {
    console.error('[API] Analytics error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Conversations
app.get('/api/conversations', requireAuth, (req, res) => {
  try {
    const convos = conversationModel.getAll();
    const now = Date.now();
    // Excluded states for silent tracking
    const SILENT_EXCLUDE_STATES = ['ORDER_CONFIRMED', 'CANCEL_AFTER_CONFIRM', 'COMPLAINT'];
    for (const c of convos) {
      c.silent_hours = null;
      c.is_24h_silent = false;
      // Skip: spam, complaint, human takeover, excluded states
      if (c.spam_flag || c.complaint_flag || c.needs_human || SILENT_EXCLUDE_STATES.includes(c.state)) continue;
      // If last message was outgoing (bot/human sent) and customer hasn't replied
      if (c.last_msg_direction === 'outgoing' && c.last_msg_time) {
        // SQLite stores localtime (PKT = UTC+5), append timezone for correct parsing
        const timeStr = c.last_msg_time.includes('+') ? c.last_msg_time : c.last_msg_time + '+05:00';
        const lastTime = new Date(timeStr).getTime();
        if (!isNaN(lastTime)) {
          const hoursSince = (now - lastTime) / (1000 * 60 * 60);
          c.silent_hours = Math.round(hoursSince * 10) / 10;
          c.is_24h_silent = hoursSince >= 24;
        }
      }
    }
    res.json(convos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Messages for a conversation
app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
  try {
    const msgs = messageModel.getForConversation(parseInt(req.params.id));
    res.json(msgs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark conversation as read by admin
app.put('/api/conversations/:id/read', requireAuth, (req, res) => {
  try {
    conversationModel.setAdminUnread(parseInt(req.params.id), false);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save admin feedback on a message
app.put('/api/messages/:id/feedback', requireAuth, (req, res) => {
  try {
    const msgId = parseInt(req.params.id);
    const { feedback } = req.body;
    messageModel.updateFeedback(msgId, feedback);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download chat debug log
app.get('/api/conversations/:id/debug-export', requireAuth, (req, res) => {
  try {
    const convId = parseInt(req.params.id);
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
    const msgs = messageModel.getForConversation(convId);
    const customer = conv?.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(conv.customer_id) : null;

    const { AI_MODEL, AI_MODEL_NAME, AI_PRICING } = require('./ai/claude');
    let report = '=== CHAT DEBUG LOG ===\n';
    report += `Export Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n`;
    report += `AI Model: ${AI_MODEL_NAME} (${AI_MODEL})\n`;
    report += `Customer: ${customer?.name || 'Unknown'} | Phone: ${customer?.phone || 'N/A'}\n`;
    report += `State: ${conv?.state || 'N/A'} | Messages: ${msgs.length}\n`;
    report += `Product: ${conv?.product_json ? JSON.parse(conv.product_json)?.short || 'N/A' : 'N/A'}\n`;
    report += `Collected: ${conv?.collected_json || 'N/A'}\n`;

    // Conversation duration
    const firstMsg = msgs[0]?.created_at;
    const lastMsg = msgs[msgs.length - 1]?.created_at;
    if (firstMsg && lastMsg) {
      const durationMs = new Date(lastMsg) - new Date(firstMsg);
      const durationMin = Math.round(durationMs / 60000);
      report += `Duration: ${durationMin} min (${firstMsg} → ${lastMsg})\n`;
    }
    report += '='.repeat(60) + '\n\n';

    let totalAiCost = 0;
    let aiCount = 0;
    let templateCount = 0;
    let prevTime = null;

    msgs.forEach((m, i) => {
      const time = m.created_at || '';
      const dir = m.direction === 'incoming' ? '>>> CUSTOMER' : '<<< BOT';
      const source = m.source ? ` [${m.source.toUpperCase()}]` : '';

      // Time gap between messages (only for incoming — shows customer response delay)
      let gapStr = '';
      if (m.direction === 'incoming' && prevTime && time) {
        const gapMs = new Date(time) - new Date(prevTime);
        const gapSec = Math.round(gapMs / 1000);
        if (gapSec > 5) {
          gapStr = gapSec >= 60 ? ` (${Math.round(gapSec / 60)}m ${gapSec % 60}s gap)` : ` (${gapSec}s gap)`;
        }
      }
      if (time) prevTime = time;

      report += `--- Message ${i + 1} | ${time}${gapStr} ---\n`;
      report += `${dir}${source}\n`;
      report += `${m.content}\n`;

      // Show media processing cost on incoming messages (image/voice)
      if (m.direction === 'incoming' && m.debug_json) {
        try {
          const mediaDebug = JSON.parse(m.debug_json);
          if (mediaDebug._media_type) {
            const mediaCostRs = mediaDebug._media_cost_rs || 0;
            totalAiCost += mediaCostRs;
            report += `  📎 Media: ${mediaDebug._media_type} | Model: ${mediaDebug._media_model} | Cost: Rs.${mediaCostRs.toFixed(2)} | Time: ${mediaDebug._media_response_ms || 0}ms\n`;
          }
        } catch(e) {}
      }

      if (m.direction === 'outgoing') {
        const isAi = m.source === 'ai' || (m.source && m.source.includes('ai'));
        if (isAi && (m.tokens_in || m.tokens_out)) {
          aiCount++;
          // Use stored cost if available (accurate per-message), else calculate with current pricing
          let debugObj = null;
          try { debugObj = m.debug_json ? JSON.parse(m.debug_json) : null; } catch(e) {}
          const storedCost = debugObj?._cost_rs;
          const storedModel = debugObj?._model;
          const cost = storedCost != null ? storedCost : ((m.tokens_in || 0) * AI_PRICING.input + (m.tokens_out || 0) * AI_PRICING.output) / 1000000 * 300;
          totalAiCost += cost;
          const modelTag = storedModel ? ` [${storedModel}]` : '';
          report += `  Tokens: ${m.tokens_in || 0} in / ${m.tokens_out || 0} out | Cost: Rs.${cost.toFixed(2)}${modelTag} | Time: ${m.response_ms || 0}ms\n`;
        } else {
          templateCount++;
          report += `  Cost: Rs.0 (template)\n`;
        }

        if (m.debug_json) {
          try {
            const debug = JSON.parse(m.debug_json);
            report += `  PATH: ${debug.path || 'N/A'}\n`;
            if (debug.state_before) report += `  State: ${debug.state_before} → ${debug.state_after || debug.state || 'same'}\n`;
            if (debug.intent) report += `  Intent detected: ${debug.intent}\n`;
            if (debug.ai_intent) report += `  AI Intent: ${debug.ai_intent}\n`;
            if (debug.ai_extracted) report += `  AI Extracted: ${JSON.stringify(debug.ai_extracted)}\n`;
            if (debug.extracted) report += `  Pre-check Extracted: ${JSON.stringify(debug.extracted)}\n`;
            if (debug.smart_fill) {
              if (typeof debug.smart_fill === 'object') {
                report += `  Smart Fill: ${debug.smart_fill.ran ? 'YES' : 'NO'} (trigger: ${debug.smart_fill.trigger || 'none'})\n`;
                if (debug.smart_fill.raw_result) report += `  Smart Fill Extracted: ${JSON.stringify(debug.smart_fill.raw_result)}\n`;
              } else {
                report += `  Smart Fill: ${debug.smart_fill}\n`;
              }
            }
            if (debug.pre_check_result) report += `  Pre-check Result: ${JSON.stringify(debug.pre_check_result)}\n`;
            if (debug.collected_before) report += `  Collected BEFORE: ${JSON.stringify(debug.collected_before)}\n`;
            if (debug.address_parts_before) report += `  Address Parts BEFORE: ${JSON.stringify(debug.address_parts_before)}\n`;
            if (debug.collected) report += `  Collected AFTER: ${JSON.stringify(debug.collected)}\n`;
            if (debug.address_parts) report += `  Address Parts AFTER: ${JSON.stringify(debug.address_parts)}\n`;
            if (debug.address_hint) report += `  Address Hint: ${debug.address_hint}\n`;
            if (debug.is_rural) report += `  Rural: YES\n`;
            if (debug.haggle_round) report += `  Haggle Round: ${debug.haggle_round}\n`;
            if (debug.template_used) report += `  Template: ${debug.template_used}\n`;
            if (debug.product) report += `  Product: ${debug.product}\n`;
            if (debug.ai_raw_response) {
              report += `\n  === AI RAW RESPONSE ===\n`;
              report += `  ${JSON.stringify(debug.ai_raw_response, null, 2).split('\n').join('\n  ')}\n`;
            }
            if (debug.context_messages) {
              report += `\n  === CONTEXT MESSAGES SENT TO AI (${debug.context_messages.length}) ===\n`;
              debug.context_messages.forEach((cm, ci) => {
                report += `  [${ci + 1}] ${cm.role}: ${cm.content}\n`;
              });
            }
            if (debug.system_prompt) {
              report += `\n  === SYSTEM PROMPT (${debug.system_prompt.length} chars) ===\n`;
              report += `  ${debug.system_prompt.split('\n').join('\n  ')}\n`;
            }
          } catch (e) { /* ignore parse errors */ }
        }

      }

      // Admin feedback (on any message — bot or customer)
      if (m.admin_feedback) {
        report += `  >> ADMIN FEEDBACK: ${m.admin_feedback}\n`;
      }
      report += '\n';
    });

    const feedbackCount = msgs.filter(m => m.admin_feedback).length;

    report += '='.repeat(60) + '\n';
    report += `SUMMARY\n`;
    report += `Total Messages: ${msgs.length} (${msgs.filter(m => m.direction === 'incoming').length} customer, ${msgs.filter(m => m.direction === 'outgoing').length} bot)\n`;
    report += `AI Responses: ${aiCount} | Template Responses: ${templateCount}\n`;
    if (feedbackCount > 0) report += `Admin Feedback: ${feedbackCount} message(s) have feedback\n`;
    report += `Total AI Cost: Rs.${totalAiCost.toFixed(2)}\n`;
    report += `Template Ratio: ${templateCount + aiCount > 0 ? Math.round(templateCount / (templateCount + aiCount) * 100) : 0}%\n`;

    const filename = `chat-debug-${customer?.phone || convId}-${new Date().toISOString().slice(0, 10)}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Human agent reply — send WhatsApp message + save to DB
app.post('/api/conversations/:id/reply', requireAuth, async (req, res) => {
  console.log('[API] Reply endpoint hit, convId:', req.params.id, 'body:', req.body);
  try {
    const convId = parseInt(req.params.id);
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text required' });

    // Get conversation + customer phone
    const conv = conversationModel.findById(convId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const customer = customerModel.findById(conv.customer_id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Get WhatsApp credentials
    const accessToken = settingsModel.get('meta_whatsapp_token', '');
    const phoneNumberId = settingsModel.get('meta_phone_number_id', '');
    if (!accessToken || !phoneNumberId) {
      return res.status(500).json({ error: 'WhatsApp credentials not configured' });
    }

    // Send via WhatsApp
    const intlPhone = toInternational(customer.phone);
    const sendResult = await sendMessage(intlPhone, text.trim(), phoneNumberId, accessToken);
    if (!sendResult.success) {
      return res.status(500).json({ error: 'Failed to send: ' + sendResult.error });
    }

    // Mark customer's last message as read in WhatsApp (blue ticks)
    try {
      const lastIncoming = getDb().prepare(
        "SELECT wa_message_id FROM messages WHERE conversation_id = ? AND direction = 'incoming' ORDER BY created_at DESC LIMIT 1"
      ).get(convId);
      if (lastIncoming?.wa_message_id) {
        const { markAsRead } = require('./whatsapp/sender');
        markAsRead(lastIncoming.wa_message_id, phoneNumberId, accessToken);
      }
    } catch (e) { /* non-critical */ }

    // Save to DB + mark as human-handled
    const msgId = messageModel.create(convId, 'outgoing', 'human', text.trim(), { source: 'admin' });
    // Store wa_message_id for read receipt tracking
    if (sendResult.messageId) {
      try { getDb().prepare('UPDATE messages SET wa_message_id = ? WHERE id = ?').run(sendResult.messageId, msgId); } catch (e) { /* non-critical */ }
    }
    conversationModel.updateLastMessage(convId, text.trim());
    conversationModel.setHumanOnly(convId, true);

    // Broadcast to websocket clients
    broadcast({ type: 'new_message', conversationId: convId });

    res.json({ success: true });
  } catch (e) {
    console.error('[API] Reply error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Customers
app.get('/api/customers', requireAuth, (req, res) => {
  try {
    res.json(customerModel.getAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle block (spam_flag) on conversation — bot stops responding but number not blocked
app.post('/api/conversations/:id/block', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const convo = db.prepare('SELECT spam_flag FROM conversations WHERE id = ?').get(id);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    const newVal = convo.spam_flag ? 0 : 1;
    db.prepare('UPDATE conversations SET spam_flag = ? WHERE id = ?').run(newVal, id);
    res.json({ success: true, spam_flag: newVal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark conversation as complaint (manual)
app.post('/api/conversations/:id/complaint', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    db.prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1, state = ? WHERE id = ?').run('COMPLAINT', id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete conversation (keeps orders + auto_templates/learnings)
app.delete('/api/conversations/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    // Get customer phone before deleting — needed to clear in-memory state
    const convo = db.prepare('SELECT customer_id FROM conversations WHERE id = ?').get(id);
    let customerPhone = null;
    if (convo?.customer_id) {
      const cust = db.prepare('SELECT phone FROM customers WHERE id = ?').get(convo.customer_id);
      customerPhone = cust?.phone;
    }
    // Count orders being deleted to adjust customer stats
    const orderCount = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE conversation_id = ?').get(id)?.cnt || 0;
    const orderTotal = db.prepare('SELECT COALESCE(SUM(grand_total),0) as total FROM orders WHERE conversation_id = ?').get(id)?.total || 0;
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM orders WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    // Decrement customer order stats so smartfill doesn't prefill stale data
    if (convo?.customer_id && orderCount > 0) {
      db.prepare('UPDATE customers SET total_orders = MAX(0, total_orders - ?), total_revenue = MAX(0, total_revenue - ?) WHERE id = ?')
        .run(orderCount, orderTotal, convo.customer_id);
    }
    // Clear in-memory conversation state so bot doesn't remember old data
    if (customerPhone) {
      const { clearConv } = require('./hybrid/index');
      clearConv(customerPhone);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle customer bot/human
app.post('/api/customers/:id/toggle', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = customerModel.findById(id);
    if (customer) {
      const newVal = customer.needs_human ? 0 : 1;
      customerModel.update(id, { needs_human: newVal });
      res.json({ success: true, needs_human: !!newVal });
    } else {
      res.status(404).json({ error: 'Customer not found' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Orders
app.get('/api/orders', requireAuth, (req, res) => {
  try {
    const db = getDb();
    // Enhanced query: join conversations for AI cost, template count, timestamps
    const orders = db.prepare(`
      SELECT o.*,
        c.created_at as chat_started_at,
        c.message_count,
        c.ai_tokens_used,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = o.conversation_id AND m.source = 'template') as template_count,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = o.conversation_id AND m.source IN ('ai','gpt-4o-mini','gpt-4o')) as ai_count,
        (SELECT GROUP_CONCAT(DISTINCT m.source) FROM messages m WHERE m.conversation_id = o.conversation_id AND m.direction = 'outgoing') as sources_used
      FROM orders o
      LEFT JOIN conversations c ON c.id = o.conversation_id
      ORDER BY o.created_at DESC LIMIT 200
    `).all();
    // Batch AI cost calculation — one query for all conversation IDs
    const convIds = [...new Set(orders.map(o => o.conversation_id).filter(Boolean))];
    const costMap = {};
    if (convIds.length) {
      const allMsgs = db.prepare(`SELECT conversation_id, debug_json FROM messages WHERE conversation_id IN (${convIds.map(() => '?').join(',')}) AND debug_json IS NOT NULL`).all(...convIds);
      allMsgs.forEach(m => {
        try {
          const d = JSON.parse(m.debug_json);
          if (!costMap[m.conversation_id]) costMap[m.conversation_id] = 0;
          if (d._cost_rs) costMap[m.conversation_id] += d._cost_rs;
          if (d._media_cost_rs) costMap[m.conversation_id] += d._media_cost_rs;
        } catch (e) { /* ignore */ }
      });
    }
    res.json(orders.map(o => {
      const items = o.items_json ? JSON.parse(o.items_json) : [];
      const hasUpsell = items.length > 1;
      const aiCostRs = Math.round((costMap[o.conversation_id] || 0) * 100) / 100;
      return {
        ...o, items, has_upsell: hasUpsell, ai_cost_rs: aiCostRs,
        template_count: o.template_count || 0, ai_count: o.ai_count || 0,
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Products
app.get('/api/products', requireAuth, (req, res) => {
  try {
    res.json(productModel.getAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stores
app.get('/api/stores', requireAuth, (req, res) => {
  try {
    const stores = getDb().prepare('SELECT * FROM stores').all();
    res.json(stores);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Settings
app.get('/api/settings', requireAuth, (req, res) => {
  try {
    const settings = settingsModel.getAll();
    // Show env key if no DB override set
    if (!settings.openai_api_key && process.env.OPENAI_API_KEY) {
      settings.openai_api_key = process.env.OPENAI_API_KEY;
    }
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', requireAuth, (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      settingsModel.set(key, value);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Diagnostic: LIVE test of Whisper API using temp file (Node < 20 compatible)
app.get('/api/test-voice', requireAuth, async (req, res) => {
  const results = { version: 'v4-tempfile', steps: {} };
  const fs = require('fs');
  const tempFile = path.join(__dirname, '..', 'temp', `test_${Date.now()}.wav`);
  try {
    const OpenAI = require('openai');
    const dbKey = settingsModel.get('openai_api_key', '');
    const envKey = process.env.OPENAI_API_KEY;
    const key = dbKey || envKey;
    results.steps.key = key ? `${key.slice(0,8)}...` : 'MISSING';
    results.steps.node_version = process.version;

    const client = new OpenAI({ apiKey: key });
    results.steps.client = 'OK';

    // Create tiny WAV (1 sec silence)
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + 8000, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(8000, 24);
    header.writeUInt32LE(8000, 28);
    header.writeUInt16LE(1, 32);
    header.writeUInt16LE(8, 34);
    header.write('data', 36);
    header.writeUInt32LE(8000, 40);
    const wavBuffer = Buffer.concat([header, Buffer.alloc(8000, 128)]);

    // Write to temp file
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(tempFile, wavBuffer);
    results.steps.temp_file = `written ${wavBuffer.length} bytes`;

    // Call Whisper with createReadStream
    const startMs = Date.now();
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
    });
    results.steps.whisper = `OK (${Date.now() - startMs}ms) — "${transcription.text}"`;
    results.success = true;

  } catch (e) {
    results.success = false;
    results.error = e.message;
    results.stack = e.stack?.split('\n').slice(0, 5);
  } finally {
    try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
  }
  res.json(results);
});

// Bot toggle
app.post('/api/bot/toggle', requireAuth, (req, res) => {
  try {
    const current = settingsModel.getBoolean('bot_enabled', true);
    settingsModel.set('bot_enabled', (!current).toString());
    broadcast({ type: 'bot_status', enabled: !current });
    res.json({ success: true, enabled: !current });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CSV Upload — block pre-activation numbers
app.post('/api/csv-upload', requireAuth, (req, res) => {
  try {
    const { phones } = req.body;
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: 'No phone numbers provided' });
    }
    let added = 0, updated = 0;
    for (const raw of phones) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 10) continue;
      // Normalize: 923001234567 → 03001234567
      let phone = digits;
      if (phone.startsWith('92') && phone.length === 12) phone = '0' + phone.slice(2);
      if (phone.startsWith('3') && phone.length === 10) phone = '0' + phone;
      const existing = customerModel.findByPhone(phone);
      if (existing) {
        if (!existing.is_blocked) {
          customerModel.update(existing.id, { is_blocked: 1 });
          updated++;
        }
      } else {
        const created = customerModel.create(phone);
        customerModel.update(created.id, { is_blocked: 1 });
        added++;
      }
    }
    res.json({ success: true, added, updated, total: added + updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Blocked customers list
app.get('/api/blocked-customers', requireAuth, (req, res) => {
  try {
    const rows = getDb().prepare('SELECT id, phone, name FROM customers WHERE is_blocked = 1 ORDER BY phone').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unblock customer
app.post('/api/customers/:id/unblock', requireAuth, (req, res) => {
  try {
    customerModel.update(parseInt(req.params.id), { is_blocked: 0 });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cache stats
app.get('/api/cache/stats', requireAuth, (req, res) => {
  try {
    res.json(cacheModel.getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- PRODUCT MEDIA API ----
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'media');
// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Serve media files publicly (WhatsApp needs to access these URLs)
app.use('/media', express.static(MEDIA_DIR));

// List all media (grouped by product)
app.get('/api/media', requireAuth, (req, res) => {
  try {
    const all = mediaModel.getAll();
    res.json(all);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get media for specific product
app.get('/api/media/product/:id', requireAuth, (req, res) => {
  try {
    const media = mediaModel.getByProduct(parseInt(req.params.id));
    res.json(media);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload media file
app.post('/api/media/upload', requireAuth, (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data required' });
    }

    // Parse multipart manually using raw buffer
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) return res.status(400).json({ error: 'No boundary found' });

        // Parse parts
        const parts = parseMultipart(buf, boundary);
        const filePart = parts.find(p => p.filename);
        const productId = parts.find(p => p.name === 'product_id')?.data?.toString().trim();
        const mediaType = parts.find(p => p.name === 'type')?.data?.toString().trim();
        const caption = parts.find(p => p.name === 'caption')?.data?.toString().trim() || '';

        if (!filePart || !productId || !mediaType) {
          return res.status(400).json({ error: 'Missing file, product_id, or type' });
        }
        if (!['image', 'video'].includes(mediaType)) {
          return res.status(400).json({ error: 'type must be image or video' });
        }

        // Generate unique filename
        const ext = path.extname(filePart.filename).toLowerCase() || (mediaType === 'image' ? '.jpg' : '.mp4');
        const filename = `p${productId}_${Date.now()}${ext}`;
        const filepath = path.join(MEDIA_DIR, filename);

        // Write file
        fs.writeFileSync(filepath, filePart.data);

        // Save to DB
        const media = mediaModel.create({
          product_id: parseInt(productId),
          type: mediaType,
          filename,
          original_name: filePart.filename,
          caption: caption || null,
        });

        res.json({ success: true, media });
      } catch (e) {
        console.error('[Media Upload] Parse error:', e.message);
        res.status(500).json({ error: e.message });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete media
app.delete('/api/media/:id', requireAuth, (req, res) => {
  try {
    const media = mediaModel.remove(parseInt(req.params.id));
    if (media) {
      // Delete file from disk
      const filepath = path.join(MEDIA_DIR, media.filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update media caption
app.put('/api/media/:id', requireAuth, (req, res) => {
  try {
    const { caption } = req.body;
    mediaModel.updateCaption(parseInt(req.params.id), caption || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Simple multipart parser (no external dependency)
function parseMultipart(buf, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  const endBuf = Buffer.from('--' + boundary + '--');

  let pos = 0;
  // Skip preamble — find first boundary
  pos = bufIndexOf(buf, boundaryBuf, pos);
  if (pos === -1) return parts;
  pos += boundaryBuf.length + 2; // skip boundary + \r\n

  while (pos < buf.length) {
    // Check for end boundary
    if (buf.slice(pos - 2, pos - 2 + endBuf.length).equals(endBuf)) break;

    // Find header end (\r\n\r\n)
    const headerEnd = bufIndexOf(buf, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headers = buf.slice(pos, headerEnd).toString();
    const dataStart = headerEnd + 4;

    // Find next boundary
    const nextBoundary = bufIndexOf(buf, boundaryBuf, dataStart);
    if (nextBoundary === -1) break;

    const data = buf.slice(dataStart, nextBoundary - 2); // -2 for \r\n before boundary

    // Parse headers
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    parts.push({
      name: nameMatch?.[1] || null,
      filename: filenameMatch?.[1] || null,
      data,
    });

    pos = nextBoundary + boundaryBuf.length + 2; // skip boundary + \r\n
  }
  return parts;
}

function bufIndexOf(buf, search, start) {
  for (let i = start || 0; i <= buf.length - search.length; i++) {
    if (buf.slice(i, i + search.length).equals(search)) return i;
  }
  return -1;
}

// ---- AUTO-TEMPLATES (AI-learned response patterns) ----

app.get('/api/auto-templates', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const templates = db.prepare('SELECT * FROM auto_templates ORDER BY times_seen DESC, times_used DESC').all();
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/auto-templates/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { response, is_active } = req.body;
    if (response !== undefined) {
      db.prepare('UPDATE auto_templates SET response = ? WHERE id = ?').run(response, req.params.id);
    }
    if (is_active !== undefined) {
      db.prepare('UPDATE auto_templates SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/auto-templates/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM auto_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auto-templates/bulk-import', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const templates = req.body;
    if (!Array.isArray(templates)) return res.status(400).json({ error: 'Array expected' });
    let added = 0, skipped = 0;
    const insert = db.prepare('INSERT INTO auto_templates (state, product_id, keywords, response, times_seen, times_used, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const check = db.prepare('SELECT id FROM auto_templates WHERE state = ? AND keywords = ? AND (product_id = ? OR (product_id IS NULL AND ? IS NULL))');
    for (const t of templates) {
      const existing = check.get(t.state, t.keywords, t.product_id, t.product_id);
      if (existing) { skipped++; continue; }
      insert.run(t.state, t.product_id || null, t.keywords, t.response, t.times_seen || 1, t.times_used || 0, t.is_active !== undefined ? t.is_active : 1);
      added++;
    }
    res.json({ success: true, added, skipped, total: added + skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TEST CHAT (Hybrid: Template + AI Fallback) ----

app.post('/api/test-chat', requireAuth, async (req, res) => {
  try {
    const { message, store, phone } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const key = phone || 'default';
    const stores = getDb().prepare('SELECT * FROM stores').all();
    const storeObj = stores.find(s => s.name === store) || stores[0];
    const apiKey = process.env.OPENAI_API_KEY || '';

    const result = await hybrid.handleMessage(message, key, storeObj?.brand_name || '', apiKey || undefined);

    // Broadcast to dashboard
    broadcast({ type: 'new_message', phone: key, result });

    res.json(result);
  } catch (err) {
    console.error('Test chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Clear test chat history
app.delete('/api/test-chat/history', requireAuth, (req, res) => {
  const phone = req.query.phone || 'default';
  hybrid.clearHistory(phone);
  res.json({ success: true });
});

// ---- WHATSAPP CLOUD API WEBHOOK (NO auth — Meta needs open access) ----
app.get('/webhook', webhookVerify);
app.post('/webhook', webhookHandler);

// Inject broadcast function into webhook module
setBroadcast(broadcast);

// ---- STATIC FILES ----
// Login page accessible without auth
app.use('/admin/login.html', express.static(path.join(__dirname, 'admin/public/login.html')));
app.use('/admin/style.css', express.static(path.join(__dirname, 'admin/public/style.css')));
app.use('/admin/app.js', express.static(path.join(__dirname, 'admin/public/app.js')));

// All other admin pages require auth (handled in frontend JS)
app.use('/admin', express.static(path.join(__dirname, 'admin/public')));

// Root redirect
app.get('/', (req, res) => res.redirect('/admin/'));

// ---- DEPLOY INFO ENDPOINT ----
const { execSync } = require('child_process');
const SERVER_START_TIME = new Date().toISOString();

app.get('/api/deploy-info', requireAuth, (req, res) => {
  try {
    const appRoot = path.join(__dirname, '..');
    const commitHash = execSync('git log -1 --format=%h', { cwd: appRoot }).toString().trim();
    const commitMsg = execSync('git log -1 --format=%s', { cwd: appRoot }).toString().trim();
    const commitDate = execSync('git log -1 --format=%ci', { cwd: appRoot }).toString().trim();
    const commitAuthor = execSync('git log -1 --format=%an', { cwd: appRoot }).toString().trim();
    const totalCommits = execSync('git rev-list --count HEAD', { cwd: appRoot }).toString().trim();
    res.json({
      commit_hash: commitHash,
      commit_message: commitMsg,
      commit_date: commitDate,
      commit_author: commitAuthor,
      total_commits: totalCommits,
      server_started: SERVER_START_TIME,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ---- AUTO-DEPLOY ENDPOINT ----
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'nuvenza-deploy-2026';

// Support both GET and POST for deploy (LiteSpeed blocks POST on some setups)
app.all('/deploy', (req, res) => {
  const token = req.query.token || req.headers['x-deploy-token'];
  if (token !== DEPLOY_SECRET) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  try {
    const appRoot = path.join(__dirname, '..');
    const pullResult = execSync('git pull origin main', { cwd: appRoot, timeout: 30000 }).toString();
    console.log('[DEPLOY] git pull:', pullResult);

    res.json({ success: true, output: pullResult, restarting: true });

    // Kill process after response sent — Passenger auto-respawns with new code
    setTimeout(() => {
      console.log('[DEPLOY] Restarting via process.exit()...');
      process.exit(0);
    }, 500);
  } catch (err) {
    console.error('[DEPLOY] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Initialize DB (async) then start server
(async () => {
  try {
    await initDb();
    seedAll();
    console.log('[DB] Ready');

    const PORT = process.env.PORT || 3010;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`WhatsApp Agent Dashboard running on http://localhost:${PORT}/admin/`);
      console.log(`Mobile: http://192.168.0.237:${PORT}/admin/`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start:', err);
    process.exit(1);
  }
})();
