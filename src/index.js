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
const { sendMessage, sendImage, sendVideo, sendAudio, toInternational } = require('./whatsapp/sender');

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
const complaintModel = require('./db/models/complaint');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ---- SERVER MONITORING ----
const SERVER_START_TIME = Date.now();
const errorLog = []; // Keep last 50 errors in memory
const MAX_ERROR_LOG = 50;
const requestStats = { total: 0, slow: 0, errors: 0, lastHour: [] };

function logError(type, error) {
  const entry = {
    type,
    message: error.message || String(error),
    stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    time: new Date().toLocaleString(),
    timestamp: Date.now()
  };
  errorLog.unshift(entry);
  if (errorLog.length > MAX_ERROR_LOG) errorLog.pop();
  console.error(`[${type}] ${entry.message}`);
}

// Log unhandled rejections (don't catch uncaughtException — let hosting auto-restart)
process.on('unhandledRejection', (reason) => {
  logError('UNHANDLED_REJECTION', reason instanceof Error ? reason : new Error(String(reason)));
});

// Health check — public, no auth (for UptimeRobot etc.)
app.get('/health', (req, res) => {
  const uptime = Date.now() - SERVER_START_TIME;
  const mem = process.memoryUsage();
  let dbOk = false;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
  } catch (e) { /* db down */ }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    uptime_seconds: Math.floor(uptime / 1000),
    uptime_human: formatUptime(uptime),
    memory_mb: Math.round(mem.rss / 1024 / 1024),
    heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    db: dbOk ? 'connected' : 'error',
    errors_recent: errorLog.length,
    timestamp: new Date().toLocaleString()
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

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
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Lightweight request counter (no per-request overhead)
let _reqCount = 0;
app.use((req, res, next) => { _reqCount++; next(); });
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

// ---- SERVER MONITORING API ----
app.get('/api/monitoring', requireAuth, (req, res) => {
  const uptime = Date.now() - SERVER_START_TIME;
  const mem = process.memoryUsage();
  let dbOk = false, dbSize = 0;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
    // Get DB file size
    const dbPath = path.join(__dirname, '..', 'data', 'agent.db');
    if (fs.existsSync(dbPath)) dbSize = Math.round(fs.statSync(dbPath).size / 1024 / 1024 * 10) / 10;
  } catch (e) { /* */ }

  // Count today's conversations & messages
  let todayChats = 0, todayMessages = 0, totalConvos = 0, totalMessages = 0;
  try {
    const db = getDb();
    todayChats = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE date(created_at) = date('now','localtime')").get()?.c || 0;
    todayMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE date(created_at) = date('now','localtime')").get()?.c || 0;
    totalConvos = db.prepare("SELECT COUNT(*) as c FROM conversations").get()?.c || 0;
    totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages").get()?.c || 0;
  } catch (e) { /* DB not ready */ }

  res.json({
    server: {
      status: dbOk ? 'ok' : 'degraded',
      uptime_human: formatUptime(uptime),
      uptime_seconds: Math.floor(uptime / 1000),
      started_at: new Date(SERVER_START_TIME).toLocaleString(),
      node_version: process.version,
      platform: process.platform
    },
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024)
    },
    database: {
      connected: dbOk,
      size_mb: dbSize,
      total_conversations: totalConvos,
      total_messages: totalMessages
    },
    today: {
      chats: todayChats,
      messages: todayMessages,
      api_requests: _reqCount
    },
    performance: {
      total_requests: _reqCount,
      error_count: errorLog.length
    },
    errors: errorLog.slice(0, 20)
  });
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

// ============= CHAT DIAGNOSTICS =============
app.get('/api/diagnostics', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days) || 7;
    const issues = [];

    // 1. STUCK CONVERSATIONS — same state repeated 3+ times in bot messages
    const stuckRows = db.prepare(`
      SELECT c.id, cu.phone, cu.name, c.state, c.message_count,
        c.collected_json, c.created_at
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.is_active = 1
        AND c.state NOT IN ('ORDER_CONFIRMED','IDLE','COMPLAINT')
        AND c.spam_flag = 0
    `).all();
    for (const row of stuckRows) {
      const msgs = db.prepare(`
        SELECT m.content, m.direction, m.source,
          json_extract(m.debug_json, '$.state_before') as state_before,
          json_extract(m.debug_json, '$.state_after') as state_after
        FROM messages m WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC
      `).all(row.id);
      // Count consecutive same-state bot replies
      let maxRepeat = 0, curRepeat = 0, lastState = null;
      for (const m of msgs) {
        if (m.direction === 'outgoing') {
          const st = m.state_after || m.state_before;
          if (st === lastState) { curRepeat++; maxRepeat = Math.max(maxRepeat, curRepeat); }
          else { curRepeat = 1; lastState = st; }
        }
      }
      if (maxRepeat >= 3) {
        issues.push({ type: 'stuck_loop', severity: 'high', conv_id: row.id,
          phone: row.phone, name: row.name, state: row.state,
          repeat_count: maxRepeat, msg_count: row.message_count,
          detail: `Bot repeated same state ${maxRepeat}x — customer likely frustrated` });
      }
    }

    // 2. ADDRESS FORMAT ISSUES — city duplicated, "near" on shops, "Pur" leak etc.
    const addrRows = db.prepare(`
      SELECT c.id, cu.phone, cu.name, c.collected_json, c.state
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.spam_flag = 0
        AND c.collected_json LIKE '%address_parts%'
    `).all();
    for (const row of addrRows) {
      try {
        const col = JSON.parse(row.collected_json || '{}');
        const ap = col.address_parts || {};
        const city = (col.city || '').toLowerCase();
        // Check city duplicated in area
        if (ap.area && city && ap.area.toLowerCase() === city) {
          issues.push({ type: 'address_city_as_area', severity: 'medium', conv_id: row.id,
            phone: row.phone, name: row.name,
            detail: `Area "${ap.area}" = City "${col.city}" — area should be specific locality` });
        }
        // Check landmark has city words leaking
        if (ap.landmark && city) {
          const cityWords = city.split(/\s+/);
          const lmLower = ap.landmark.toLowerCase();
          for (const w of cityWords) {
            if (w.length >= 3 && lmLower.startsWith(w) && !lmLower.startsWith(city)) {
              issues.push({ type: 'address_city_leak', severity: 'high', conv_id: row.id,
                phone: row.phone, name: row.name,
                detail: `Landmark "${ap.landmark}" has city word "${w}" leaked — city is "${col.city}"` });
              break;
            }
          }
        }
        // Check "near" on shop delivery
        if (col.address && /near\s+.*\b(fabric|shop|store|dukaan|bakery|cloth)\b/i.test(col.address)) {
          issues.push({ type: 'address_near_shop', severity: 'medium', conv_id: row.id,
            phone: row.phone, name: row.name,
            detail: `Address has "near" before shop name: "${col.address}" — shops should be first without "near"` });
        }
        // Check incomplete address for non-terminal states
        if (['COLLECT_ADDRESS'].includes(row.state) && !ap.area && !ap.landmark) {
          issues.push({ type: 'address_empty', severity: 'low', conv_id: row.id,
            phone: row.phone, name: row.name,
            detail: `Still in COLLECT_ADDRESS with no area or landmark collected` });
        }
      } catch (e) { /* skip bad JSON */ }
    }

    // 3. DROP-OFF ANALYSIS — where customers stopped (not spam, not completed)
    const dropoffs = db.prepare(`
      SELECT c.state, COUNT(*) as cnt
      FROM conversations c
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.spam_flag = 0
        AND c.state NOT IN ('ORDER_CONFIRMED','IDLE')
        AND c.is_active = 1
      GROUP BY c.state
      ORDER BY cnt DESC
    `).all();

    // 4. HIGH AI COST CHATS — above Rs.2 per conversation
    const costRows = db.prepare(`
      SELECT c.id, cu.phone, cu.name, c.message_count, c.state,
        SUM(COALESCE(json_extract(m.debug_json, '$._cost_rs'), 0)) +
        SUM(COALESCE(json_extract(m.debug_json, '$._media_cost_rs'), 0)) as total_cost
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.spam_flag = 0
      GROUP BY c.id
      HAVING total_cost > 2
      ORDER BY total_cost DESC
      LIMIT 20
    `).all();
    for (const row of costRows) {
      issues.push({ type: 'high_cost', severity: 'medium', conv_id: row.id,
        phone: row.phone, name: row.name, state: row.state,
        detail: `AI cost Rs.${row.total_cost.toFixed(2)} for ${row.message_count} msgs — state: ${row.state}` });
    }

    // 5. CUSTOMER FRUSTRATION — repeated similar messages from customer
    const frustRows = db.prepare(`
      SELECT c.id, cu.phone, cu.name, c.state, c.message_count
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.spam_flag = 0 AND c.message_count >= 6
    `).all();
    for (const row of frustRows) {
      const custMsgs = db.prepare(`
        SELECT content FROM messages
        WHERE conversation_id = ? AND direction = 'incoming'
        ORDER BY created_at ASC
      `).all(row.id).map(m => m.content.toLowerCase().trim());
      // Check if customer repeated similar message 3+ times
      const seen = {};
      for (const msg of custMsgs) {
        const key = msg.replace(/[^a-z0-9\s]/g, '').substring(0, 30);
        seen[key] = (seen[key] || 0) + 1;
      }
      const maxRepeat = Math.max(0, ...Object.values(seen));
      if (maxRepeat >= 3) {
        const repeatedMsg = Object.entries(seen).find(([k, v]) => v === maxRepeat)?.[0];
        issues.push({ type: 'customer_frustrated', severity: 'high', conv_id: row.id,
          phone: row.phone, name: row.name, state: row.state,
          detail: `Customer repeated "${repeatedMsg}" ${maxRepeat}x — likely frustrated/stuck` });
      }
    }

    // 6. AI OVERUSE — template could have handled but AI was called
    const aiOveruse = db.prepare(`
      SELECT c.id, cu.phone, cu.name,
        SUM(CASE WHEN m.source = 'ai' THEN 1 ELSE 0 END) as ai_count,
        SUM(CASE WHEN m.source = 'template' THEN 1 ELSE 0 END) as tmpl_count,
        c.message_count
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      JOIN messages m ON m.conversation_id = c.id AND m.direction = 'outgoing'
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
        AND c.spam_flag = 0 AND c.message_count >= 4
      GROUP BY c.id
      HAVING ai_count > tmpl_count * 2 AND ai_count >= 5
      ORDER BY ai_count DESC
      LIMIT 10
    `).all();
    for (const row of aiOveruse) {
      issues.push({ type: 'ai_overuse', severity: 'low', conv_id: row.id,
        phone: row.phone, name: row.name,
        detail: `${row.ai_count} AI calls vs ${row.tmpl_count} templates in ${row.message_count} msgs — template ratio low` });
    }

    // 7. SUMMARY STATS
    const totalChats = db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE created_at >= datetime('now','localtime','-${days} days') AND spam_flag = 0`).get().c;
    const totalOrders = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE created_at >= datetime('now','localtime','-${days} days')`).get().c;
    const totalAICost = db.prepare(`
      SELECT COALESCE(SUM(COALESCE(json_extract(m.debug_json, '$._cost_rs'), 0)) +
        SUM(COALESCE(json_extract(m.debug_json, '$._media_cost_rs'), 0)), 0) as cost
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.created_at >= datetime('now','localtime','-${days} days') AND c.spam_flag = 0
    `).get().cost;
    const avgMsgsPerOrder = db.prepare(`
      SELECT AVG(c.message_count) as avg_msgs
      FROM conversations c
      JOIN orders o ON o.conversation_id = c.id
      WHERE c.created_at >= datetime('now','localtime','-${days} days')
    `).get().avg_msgs || 0;

    res.json({
      period_days: days,
      summary: {
        total_chats: totalChats,
        total_orders: totalOrders,
        conversion_rate: totalChats > 0 ? ((totalOrders / totalChats) * 100).toFixed(1) : 0,
        total_ai_cost: totalAICost.toFixed(2),
        avg_msgs_per_order: avgMsgsPerOrder.toFixed(1),
      },
      dropoffs,
      issues: issues.sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 };
        return (sev[a.severity] || 3) - (sev[b.severity] || 3);
      }),
      issue_counts: {
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length,
      }
    });
  } catch (e) {
    console.error('[API] Diagnostics error:', e.message);
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

// Get order for a conversation
app.get('/api/conversations/:id/order', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const convId = parseInt(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId);
    if (!order) return res.json(null);
    order.items = order.items_json ? JSON.parse(order.items_json) : [];
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update order details
app.patch('/api/orders/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { customer_name, customer_phone, delivery_phone, customer_city, customer_address, items, grand_total, notes, status } = req.body;
    const updates = [];
    const params = [];
    if (customer_name !== undefined) { updates.push('customer_name = ?'); params.push(customer_name); }
    if (customer_phone !== undefined) { updates.push('customer_phone = ?'); params.push(customer_phone); }
    if (delivery_phone !== undefined) { updates.push('delivery_phone = ?'); params.push(delivery_phone); }
    if (customer_city !== undefined) { updates.push('customer_city = ?'); params.push(customer_city); }
    if (customer_address !== undefined) { updates.push('customer_address = ?'); params.push(customer_address); }
    if (items !== undefined) { updates.push('items_json = ?'); params.push(JSON.stringify(items)); }
    if (grand_total !== undefined) { updates.push('grand_total = ?'); params.push(grand_total); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (updates.length === 0) return res.json({ ok: true });
    updates.push("updated_at = datetime('now','localtime')");
    params.push(id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (order) order.items = order.items_json ? JSON.parse(order.items_json) : [];
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create order from admin (manual order taking)
app.post('/api/orders/create', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { conversation_id, customer_name, customer_phone, customer_city, customer_address, grand_total, items } = req.body;
    const conv = conversation_id ? db.prepare('SELECT customer_id FROM conversations WHERE id = ?').get(conversation_id) : null;
    const customerId = conv?.customer_id;
    const order = orderModel.create({
      conversation_id: conversation_id || null,
      customer_id: customerId || 0,
      customer_name: customer_name || '',
      customer_phone: customer_phone || '',
      customer_city: customer_city || '',
      customer_address: customer_address || '',
      items: items,
      subtotal: grand_total || 0,
      grand_total: grand_total || 0,
      source: 'admin',
    });
    // Update conversation state to ORDER_CONFIRMED
    if (conversation_id) {
      db.prepare("UPDATE conversations SET state = 'ORDER_CONFIRMED', updated_at = datetime('now','localtime') WHERE id = ?").run(conversation_id);
    }
    res.json(order);
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
    report += `Export Time: ${new Date().toLocaleString()}\n`;
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

// Toggle human takeover on conversation — bot stops/resumes responding
app.post('/api/conversations/:id/human', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const convo = db.prepare('SELECT needs_human FROM conversations WHERE id = ?').get(id);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    const newVal = convo.needs_human ? 0 : 1;
    db.prepare('UPDATE conversations SET needs_human = ? WHERE id = ?').run(newVal, id);
    res.json({ success: true, needs_human: !!newVal });
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


// Toggle follow-up on conversation — manually stop or re-enable follow-up voice note
app.post('/api/conversations/:id/followup', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const convo = db.prepare('SELECT followup_sent FROM conversations WHERE id = ?').get(id);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    const newVal = convo.followup_sent ? 0 : 1;
    db.prepare('UPDATE conversations SET followup_sent = ? WHERE id = ?').run(newVal, id);
    console.log(`[FOLLOWUP] Manual toggle: conv #${id} → followup_sent=${newVal}`);
    res.json({ success: true, followup_sent: newVal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send complaint voice note + number text manually (same sequence as auto-complaint)
app.post('/api/conversations/:id/send-complaint', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const conv = db.prepare('SELECT c.*, cu.phone FROM conversations c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ?').get(id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (!conv.phone) return res.status(400).json({ error: 'No phone number' });

    // Guard: only allow ONE manual complaint message per conversation (ever)
    const alreadySent = db.prepare(
      "SELECT id FROM messages WHERE conversation_id = ? AND source IN ('manual_complaint_voice','manual_complaint_text') LIMIT 1"
    ).get(id);
    if (alreadySent) {
      return res.json({ success: false, error: 'Complaint message pehle se bheja ja chuka hai. Sirf 1 baar bhej sakte hain.' });
    }

    const accessToken = settingsModel.get('meta_whatsapp_token', '');
    const phoneNumberId = settingsModel.get('meta_phone_number_id', '');
    if (!accessToken || !phoneNumberId) return res.status(500).json({ error: 'WhatsApp credentials not configured' });

    const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
    const intlPhone = toInternational(conv.phone);
    const complaintText = 'Sir, aap is number pe WhatsApp message bhej dein — 03701337838 🙏 InshaAllah aapka masla resolve ho jayega ✅';

    // Check 24-hour window — use customer's LAST INCOMING message (not bot messages)
    let windowWarning = null;
    const lastCustomerMsg = db.prepare(
      "SELECT created_at FROM messages WHERE conversation_id = ? AND direction = 'incoming' ORDER BY created_at DESC LIMIT 1"
    ).get(id);
    if (lastCustomerMsg && lastCustomerMsg.created_at) {
      const timeStr = lastCustomerMsg.created_at.includes('+') ? lastCustomerMsg.created_at : lastCustomerMsg.created_at + '+05:00';
      const lastTime = new Date(timeStr).getTime();
      const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
      if (hoursSince > 23) {
        console.log('[MANUAL-COMPLAINT] 24h window expired (' + Math.round(hoursSince) + 'h) for ' + conv.phone + ' — BLOCKED');
        return res.json({ success: false, error: 'Customer ka last message ' + Math.round(hoursSince) + 'h pehle tha — 24h window khatam. Message deliver nahi ho sakta.' });
      }
    }

    // Step 1: Send voice note immediately
    const audioUrl = `${serverUrl}/media/complaint-voice.mp3`;
    const audioResult = await sendAudio(intlPhone, audioUrl, phoneNumberId, accessToken);
    console.log(`[MANUAL-COMPLAINT] Voice note ${audioResult.success ? 'sent' : 'FAILED'} to ${conv.phone}`);

    if (!audioResult.success) {
      return res.json({ success: false, error: 'Voice note send failed: ' + (audioResult.error || 'unknown'), warning: windowWarning });
    }

    messageModel.create(id, 'outgoing', 'bot', '[🎤 Complaint Voice Note]', { source: 'manual_complaint_voice', media_type: 'audio', media_url: '/media/complaint-voice.mp3' });
    conversationModel.updateLastMessage(id, '[🎤 Voice Note]');
    broadcast({ type: 'new_message', conversationId: id });

    // Step 2: Send number text after 30s delay
    setTimeout(async () => {
      try {
        const sendResult = await sendMessage(intlPhone, complaintText, phoneNumberId, accessToken);
        console.log(`[MANUAL-COMPLAINT] Number text ${sendResult.success ? 'sent' : 'FAILED'} to ${conv.phone}`);
        if (sendResult.success) {
          messageModel.create(id, 'outgoing', 'bot', complaintText, { source: 'manual_complaint_text' });
          conversationModel.updateLastMessage(id, complaintText);
          broadcast({ type: 'new_message', conversationId: id });
        }
      } catch (err) {
        console.error('[MANUAL-COMPLAINT] Text error:', err.message);
      }
    }, 30 * 1000);

    // Also mark as complaint + human assigned
    db.prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1, state = ? WHERE id = ?').run('COMPLAINT', id);

    res.json({ success: true, warning: windowWarning });
  } catch (e) {
    console.error('[MANUAL-COMPLAINT] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin send media (image/video/voice) from dashboard ----
const CHAT_MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'chat-media');
if (!fs.existsSync(CHAT_MEDIA_DIR)) fs.mkdirSync(CHAT_MEDIA_DIR, { recursive: true });

// Inline multipart parser (no multer needed)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
    if (!boundaryMatch) return reject(new Error('No boundary'));
    const boundary = boundaryMatch[1];
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const parts = {};
      const sep = Buffer.from('--' + boundary);
      let pos = 0;
      while (pos < buf.length) {
        const start = buf.indexOf(sep, pos);
        if (start === -1) break;
        const nextStart = buf.indexOf(sep, start + sep.length + 2);
        if (nextStart === -1) break;
        const part = buf.slice(start + sep.length + 2, nextStart - 2); // skip \r\n
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) { pos = nextStart; continue; }
        const headers = part.slice(0, headerEnd).toString();
        const body = part.slice(headerEnd + 4);
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        if (nameMatch) {
          if (filenameMatch) {
            parts[nameMatch[1]] = { buffer: body, filename: filenameMatch[1] };
          } else {
            parts[nameMatch[1]] = body.toString();
          }
        }
        pos = nextStart;
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

app.post('/api/conversations/:id/send-media', requireAuth, async (req, res) => {
  try {
    const convId = parseInt(req.params.id);
    let type, caption, filePath, mediaFilename;

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      // FormData upload (for videos/large files)
      const parts = await parseMultipart(req);
      type = parts.type;
      caption = parts.caption || '';
      if (!parts.media?.buffer) return res.status(400).json({ error: 'No file uploaded' });
      const ext = path.extname(parts.media.filename || '') || '.bin';
      mediaFilename = `admin_${Date.now()}${ext}`;
      filePath = path.join(CHAT_MEDIA_DIR, mediaFilename);
      fs.writeFileSync(filePath, parts.media.buffer);
    } else {
      // JSON base64 upload (for images/small files)
      const { base64, filename } = req.body;
      type = req.body.type;
      caption = req.body.caption || '';
      if (!base64) return res.status(400).json({ error: 'No file data' });
      const ext = path.extname(filename || '') || (type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : '.mp3');
      mediaFilename = `admin_${Date.now()}${ext}`;
      filePath = path.join(CHAT_MEDIA_DIR, mediaFilename);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    }

    if (!['image', 'video', 'audio'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const conv = conversationModel.findById(convId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const customer = customerModel.findById(conv.customer_id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const accessToken = settingsModel.get('meta_whatsapp_token', '');
    const phoneNumberId = settingsModel.get('meta_phone_number_id', '');
    if (!accessToken || !phoneNumberId) return res.status(500).json({ error: 'WhatsApp credentials not configured' });

    const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
    const intlPhone = toInternational(customer.phone);
    const publicUrl = `${serverUrl}/chat-media/${mediaFilename}`;

    // Send via WhatsApp API
    let sendResult;
    let contentText;
    if (type === 'image') {
      sendResult = await sendImage(intlPhone, publicUrl, caption || '', phoneNumberId, accessToken);
      contentText = caption ? `[📷 Image: ${caption}]` : '[📷 Image]';
    } else if (type === 'video') {
      sendResult = await sendVideo(intlPhone, publicUrl, caption || '', phoneNumberId, accessToken);
      contentText = caption ? `[🎥 Video: ${caption}]` : '[🎥 Video]';
    } else {
      sendResult = await sendAudio(intlPhone, publicUrl, phoneNumberId, accessToken);
      contentText = '[🎤 Voice Note]';
    }

    if (!sendResult.success) {
      try { fs.unlinkSync(filePath); } catch (e) {}
      return res.status(500).json({ error: 'WhatsApp send failed: ' + sendResult.error });
    }

    // Save to DB
    const msgId = messageModel.create(convId, 'outgoing', 'human', contentText, {
      source: 'admin_media',
      media_type: type,
      media_url: mediaFilename,
      wa_message_id: sendResult.messageId || null
    });
    conversationModel.updateLastMessage(convId, contentText);
    conversationModel.setHumanOnly(convId, true);

    // Mark as read
    try {
      const lastIncoming = getDb().prepare(
        "SELECT wa_message_id FROM messages WHERE conversation_id = ? AND direction = 'incoming' ORDER BY created_at DESC LIMIT 1"
      ).get(convId);
      if (lastIncoming?.wa_message_id) {
        const { markAsRead } = require('./whatsapp/sender');
        markAsRead(lastIncoming.wa_message_id, phoneNumberId, accessToken);
      }
    } catch (e) { /* non-critical */ }

    broadcast({ type: 'new_message', conversationId: convId });
    console.log(`[ADMIN-MEDIA] Sent ${type} to ${customer.phone} (conv #${convId})`);
    res.json({ success: true });
  } catch (e) {
    console.error('[ADMIN-MEDIA] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Mark conversation as complaint (manual) + create complaint tracker entry
app.post('/api/conversations/:id/complaint', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    db.prepare('UPDATE conversations SET complaint_flag = 1, needs_human = 1, state = ? WHERE id = ?').run('COMPLAINT', id);
    // Also create complaint tracker entry
    const existing = complaintModel.findByConversation(id);
    if (!existing) {
      const conv = db.prepare('SELECT c.*, cu.name, cu.phone FROM conversations c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ?').get(id);
      if (conv) {
        const prod = conv.product_json ? JSON.parse(conv.product_json) : null;
        complaintModel.create({
          conversation_id: id,
          customer_id: conv.customer_id,
          customer_name: conv.name || null,
          customer_phone: conv.phone || null,
          product_name: prod?.name || prod?.short || null,
          description: conv.last_message || null,
        });
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Undo complaint — remove complaint flag + delete from tracker
app.post('/api/conversations/:id/undo-complaint', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    // Restore correct state — ORDER_CONFIRMED if order exists, otherwise IDLE
    const hasOrder = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE conversation_id = ?').get(id)?.cnt > 0;
    const newState = hasOrder ? 'ORDER_CONFIRMED' : 'IDLE';
    db.prepare('UPDATE conversations SET complaint_flag = 0, state = ? WHERE id = ?').run(newState, id);
    // Remove from complaints tracker
    const complaint = complaintModel.findByConversation(id);
    if (complaint) {
      db.prepare('DELETE FROM complaint_remarks WHERE complaint_id = ?').run(complaint.id);
      db.prepare('DELETE FROM complaints WHERE id = ?').run(complaint.id);
    }
    res.json({ success: true, state: newState });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fix conversations with orders but wrong state
app.post('/api/fix-order-states', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const fixed = db.prepare(`
      UPDATE conversations SET state = 'ORDER_CONFIRMED'
      WHERE id IN (SELECT DISTINCT conversation_id FROM orders)
      AND state NOT IN ('ORDER_CONFIRMED','CANCEL_AFTER_CONFIRM')
      AND complaint_flag = 0
    `).run();
    res.json({ success: true, fixed: fixed.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============= COMPLAINTS MANAGEMENT =============

// List all complaints
app.get('/api/complaints', requireAuth, (req, res) => {
  try {
    const complaints = complaintModel.getAll();
    const stats = complaintModel.getStats();
    res.json({ complaints, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update complaint status
app.patch('/api/complaints/:id/status', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!['active', 'closed', 'unsolveable', 'refund', 'exchange'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    complaintModel.updateStatus(id, status);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add remark to complaint
app.post('/api/complaints/:id/remarks', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    if (!remark || !remark.trim()) return res.status(400).json({ error: 'Remark required' });
    const result = complaintModel.addRemark(id, remark.trim());
    res.json({ success: true, remark: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get remarks for a complaint
app.get('/api/complaints/:id/remarks', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const remarks = complaintModel.getRemarks(id);
    res.json({ remarks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Backfill complaints from existing conversations with complaint_flag=1
app.post('/api/complaints/backfill', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const convos = db.prepare(`
      SELECT c.id as conv_id, c.customer_id, c.last_message, c.created_at,
        cu.name, cu.phone,
        (SELECT p.name FROM products p WHERE p.id = c.product_id) as product_name
      FROM conversations c
      LEFT JOIN customers cu ON cu.id = c.customer_id
      WHERE c.complaint_flag = 1
    `).all();

    let added = 0;
    for (const conv of convos) {
      const existing = complaintModel.findByConversation(conv.conv_id);
      if (!existing) {
        complaintModel.create({
          conversation_id: conv.conv_id,
          customer_id: conv.customer_id,
          customer_name: conv.name || null,
          customer_phone: conv.phone || null,
          product_name: conv.product_name || null,
          description: conv.last_message || null,
        });
        added++;
      }
    }
    res.json({ success: true, total_flagged: convos.length, added });
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
    // If customer has no other conversations left, delete the customer record entirely
    // Otherwise just clear stale data fields
    if (convo?.customer_id) {
      const otherConvos = db.prepare('SELECT COUNT(*) as cnt FROM conversations WHERE customer_id = ?').get(convo.customer_id)?.cnt || 0;
      if (otherConvos === 0) {
        db.prepare('DELETE FROM customers WHERE id = ?').run(convo.customer_id);
        console.log(`[Delete] Customer #${convo.customer_id} deleted (no conversations left)`);
      } else {
        // Has other conversations — just clear name/city/stats for this deleted chat
        if (orderCount > 0) {
          db.prepare('UPDATE customers SET total_orders = MAX(0, total_orders - ?), total_revenue = MAX(0, total_revenue - ?) WHERE id = ?')
            .run(orderCount, orderTotal, convo.customer_id);
        }
        db.prepare('UPDATE customers SET name = NULL, city = NULL, last_address = NULL, wa_profile_name = NULL WHERE id = ?').run(convo.customer_id);
      }
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

// Toggle customer bot/human — sets BOTH customer AND active conversation
app.post('/api/customers/:id/toggle', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = customerModel.findById(id);
    if (customer) {
      const newVal = customer.needs_human ? 0 : 1;
      customerModel.update(id, { needs_human: newVal });
      // Also update the active conversation so webhook check works
      const convo = conversationModel.findActive(customer.id);
      if (convo) {
        getDb().prepare('UPDATE conversations SET needs_human = ? WHERE id = ?').run(newVal, convo.id);
      }
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

// Copy bundled assets (complaint voice note etc.) to media dir if not present
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (fs.existsSync(ASSETS_DIR)) {
  for (const file of fs.readdirSync(ASSETS_DIR)) {
    const dest = path.join(MEDIA_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(ASSETS_DIR, file), dest);
      console.log(`[Assets] Copied ${file} to media/`);
    }
  }
}

// Serve media files publicly (WhatsApp needs to access these URLs)
app.use('/media', express.static(MEDIA_DIR));

// Serve chat media (incoming customer images/voice for dashboard preview)
app.use('/chat-media', express.static(CHAT_MEDIA_DIR));

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

// Hardcoded templates from templates.js
app.get('/api/hardcoded-templates', requireAuth, (req, res) => {
  try {
    const { T } = require('./hybrid/templates');
    const result = [];
    for (const [key, variations] of Object.entries(T)) {
      variations.forEach((text, i) => {
        result.push({ key, index: i, response: text, variations: variations.length });
      });
    }
    res.json(result);
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
      server_started: new Date(SERVER_START_TIME).toISOString(),
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

// ---- SILENT FOLLOW-UP SCHEDULER ----
// Sends a one-time voice note follow-up after 6 hours of customer silence
// IMPORTANT: Only sends to conversations created AFTER the feature was activated (followup_activated_at)
const FOLLOWUP_INTERVAL_MS = 60 * 1000;   // Check every 60 seconds
const FOLLOWUP_SILENCE_MIN = 360;          // Trigger after 360 minutes (6 hours) silent
const FOLLOWUP_VOICE_FILE = 'followup-voice.mp3';
const SILENT_EXCLUDE_STATES_FU = ['ORDER_CONFIRMED', 'CANCEL_AFTER_CONFIRM', 'COMPLAINT', 'IDLE', 'UPSELL_HOOK', 'UPSELL_SHOW'];

function startFollowUpScheduler() {
  // Record activation timestamp — only conversations created AFTER this time get follow-ups
  // This prevents flooding old silent chats when the feature is first deployed
  let activatedAt = settingsModel.get('followup_activated_at', '');
  if (!activatedAt) {
    activatedAt = new Date().toISOString();
    settingsModel.set('followup_activated_at', activatedAt);
    console.log(`[FOLLOWUP] Feature activated at ${activatedAt} — only new chats will get follow-ups`);
  }
  const activatedMs = new Date(activatedAt).getTime();

  console.log('[FOLLOWUP] Scheduler started — checking every 30s for 3min+ silent chats (since ' + activatedAt + ')');

  setInterval(async () => {
    try {
      const db = getDb();
      const accessToken = settingsModel.get('meta_whatsapp_token', '');
      const phoneNumberId = settingsModel.get('meta_phone_number_id', '');
      const serverUrl = settingsModel.get('server_url', 'https://wa.nuvenza.shop');
      if (!accessToken || !phoneNumberId) return;

      // Get all active conversations with last outgoing message
      const convos = db.prepare(`
        SELECT c.id, c.state, c.spam_flag, c.complaint_flag, c.needs_human,
               c.followup_sent, c.created_at as conv_created_at, cu.phone,
               (SELECT direction FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg_direction,
               (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg_time
        FROM conversations c
        JOIN customers cu ON cu.id = c.customer_id
        WHERE c.is_active = 1
      `).all();

      const now = Date.now();

      for (const c of convos) {
        // Skip: already followed up, spam, complaint, human takeover, excluded states
        if (c.followup_sent) continue;
        if (c.spam_flag || c.complaint_flag || c.needs_human) continue;
        if (SILENT_EXCLUDE_STATES_FU.includes(c.state)) continue;
        if (c.last_msg_direction !== 'outgoing') continue;
        if (!c.last_msg_time) continue;

        // Skip conversations created BEFORE follow-up feature was activated
        if (c.conv_created_at) {
          const convTimeStr = c.conv_created_at.includes('+') ? c.conv_created_at : c.conv_created_at + '+05:00';
          const convCreated = new Date(convTimeStr).getTime();
          if (!isNaN(convCreated) && convCreated < activatedMs) continue;
        }

        // Calculate silence duration
        const timeStr = c.last_msg_time.includes('+') ? c.last_msg_time : c.last_msg_time + '+05:00';
        const lastTime = new Date(timeStr).getTime();
        if (isNaN(lastTime)) continue;

        const minutesSilent = (now - lastTime) / (1000 * 60);
        if (minutesSilent < FOLLOWUP_SILENCE_MIN) continue;

        // Don't send if customer was silent for too long (>60 min) — likely abandoned
        // Don't send if customer was silent for too long (>24 hours) — likely abandoned
        if (minutesSilent > 1440) {
          db.prepare('UPDATE conversations SET followup_sent = 1 WHERE id = ?').run(c.id);
          continue;
        }

        // Send voice note follow-up (one time only)
        const intlPhone = toInternational(c.phone);
        const audioUrl = `${serverUrl}/media/${FOLLOWUP_VOICE_FILE}`;

        console.log(`[FOLLOWUP] Sending voice note to ${c.phone} (silent ${Math.round(minutesSilent)}min, state: ${c.state}, conv #${c.id})`);
        const result = await sendAudio(intlPhone, audioUrl, phoneNumberId, accessToken);

        if (result.success) {
          // Mark as followed up so it won't send again
          db.prepare('UPDATE conversations SET followup_sent = 1 WHERE id = ?').run(c.id);
          // Save message to DB
          messageModel.create(c.id, 'outgoing', 'bot', '[🎤 Voice Follow-up Sent]', { source: 'followup_scheduler', media_type: 'audio', media_url: `/media/${FOLLOWUP_VOICE_FILE}` });
          conversationModel.updateLastMessage(c.id, '[Voice Follow-up]');
          broadcast({ type: 'new_message', conversationId: c.id });
          console.log(`[FOLLOWUP] Sent successfully to ${c.phone}`);
        } else {
          console.error(`[FOLLOWUP] Failed for ${c.phone}:`, result.error);
        }
      }
    } catch (err) {
      console.error('[FOLLOWUP] Scheduler error:', err.message);
    }
  }, FOLLOWUP_INTERVAL_MS);
}

// Initialize DB (async) then start server
(async () => {
  try {
    await initDb();
    seedAll();

    // Add followup_sent column if not exists
    try {
      getDb().prepare("ALTER TABLE conversations ADD COLUMN followup_sent INTEGER DEFAULT 0").run();
      console.log('[DB] Added followup_sent column');
    } catch (e) { /* column already exists */ }

    // Add wa_profile_name column to customers if not exists
    try {
      getDb().prepare("ALTER TABLE customers ADD COLUMN wa_profile_name TEXT DEFAULT NULL").run();
      console.log('[DB] Added wa_profile_name column');
    } catch (e) { /* column already exists */ }

    // Migration: move WhatsApp profile names from customer.name to wa_profile_name
    // If customer has name but their conversation's collected_json shows name=null, it came from WhatsApp profile
    try {
      const db = getDb();
      const migrated = db.prepare(`
        UPDATE customers SET wa_profile_name = name, name = NULL
        WHERE name IS NOT NULL AND wa_profile_name IS NULL
        AND id IN (
          SELECT c.customer_id FROM conversations c
          WHERE c.collected_json LIKE '%"name":null%'
          OR c.collected_json LIKE '%"name": null%'
        )
      `).run();
      if (migrated.changes > 0) console.log(`[DB] Migrated ${migrated.changes} WhatsApp profile names from customer.name to wa_profile_name`);
    } catch (e) { console.error('[DB] wa_profile_name migration error:', e.message); }

    // Fix conversations with orders stuck in wrong state
    try {
      const db = getDb();
      const fixed = db.prepare(`
        UPDATE conversations SET state = 'ORDER_CONFIRMED'
        WHERE id IN (SELECT DISTINCT conversation_id FROM orders)
        AND state NOT IN ('ORDER_CONFIRMED','CANCEL_AFTER_CONFIRM')
        AND complaint_flag = 0
      `).run();
      if (fixed.changes > 0) console.log(`[DB] Fixed ${fixed.changes} order conversation states`);
    } catch (e) { /* ignore */ }

    console.log('[DB] Ready');

    // Start follow-up scheduler
    startFollowUpScheduler();

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
