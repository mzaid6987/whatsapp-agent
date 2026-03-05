// ========================================
// WhatsApp Agent Dashboard — Frontend JS
// ========================================

// Auth check (all pages except login)
if (!window.location.pathname.includes('login')) {
  fetch('/api/auth/check').then(r => r.json()).then(d => {
    if (!d.authenticated) window.location.href = '/admin/login.html';
  }).catch(() => window.location.href = '/admin/login.html');
}

// ---- GLOBAL STATE ----
let conversations = [];
let currentChatId = null;
let botEnabled = true;

// ---- UTILS ----
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  const days = Math.floor(hrs / 24);
  return days + ' day ago';
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(n) {
  return 'Rs.' + n.toLocaleString();
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatPhone(phone) {
  if (!phone) return '';
  // 923001234567 → 0300-1234567
  if (phone.startsWith('92')) phone = '0' + phone.slice(2);
  if (phone.length === 11) return phone.slice(0, 4) + '-' + phone.slice(4);
  return phone;
}

// ---- API HELPERS ----
async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...opts.headers }
  });
  if (res.status === 401) {
    window.location.href = '/admin/login.html';
    return null;
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Session expired — please login again');
  }
  return res.json();
}

// ---- AUTH ----
async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

// ---- BOT STATUS ----
async function toggleBot() {
  const data = await api('/api/bot/toggle', { method: 'POST' });
  if (data) updateBotUI(data.enabled);
}

function updateBotUI(enabled) {
  botEnabled = enabled;
  const el = document.getElementById('botStatus');
  const txt = document.getElementById('botStatusText');
  if (!el) return;
  el.className = 'bot-status ' + (enabled ? 'on' : 'off');
  txt.textContent = enabled ? 'BOT ON' : 'BOT OFF';
}

// ---- CHATS PAGE ----
async function loadChats() {
  const listEl = document.getElementById('chatListItems');
  if (!listEl) return;

  conversations = await api('/api/conversations') || [];

  // Update badges
  const unreplied = conversations.filter(c => c.unreplied);
  const complaints = conversations.filter(c => c.complaint_flag);

  const unrepliedBadge = document.getElementById('unrepliedBadge');
  const complaintBadge = document.getElementById('complaintBadge');
  if (unrepliedBadge) {
    unrepliedBadge.style.display = unreplied.length > 0 ? 'flex' : 'none';
    document.getElementById('unrepliedCount').textContent = unreplied.length;
  }
  if (complaintBadge) {
    complaintBadge.style.display = complaints.length > 0 ? 'flex' : 'none';
    document.getElementById('complaintCount').textContent = complaints.length;
  }

  renderChatList(conversations);
}

function renderChatList(convos) {
  const listEl = document.getElementById('chatListItems');
  if (!listEl) return;

  listEl.innerHTML = convos.map(c => {
    const phone = formatPhone(c.phone || c.customer?.phone || '');
    const custName = c.customer_name || c.customer?.name || '';
    const name = custName ? `${custName} (${phone})` : (phone || 'Unknown');
    const initials = getInitials(name);
    const isOrderState = ['ORDER_CONFIRMED', 'UPSELL_HOOK', 'UPSELL_SHOW'].includes(c.state);
    const statusIcon = c.needs_human ? '<span class="status-icon">&#128100;</span>' :
                       isOrderState ? '<span class="status-icon">&#9989;</span>' :
                       '<span class="status-icon">&#129302;</span>';

    let labels = [];
    const isComplaint = !!(c.complaint_flag || c.state === 'COMPLAINT');
    if (c.spam_flag) labels.push('<span class="label-badge label-spam">SPAM</span>');
    if (isComplaint) labels.push('<span class="label-badge label-complaint">COMPLAINT</span>');
    if (c.needs_human && !c.spam_flag && !isComplaint) labels.push('<span class="label-badge label-human">HUMAN</span>');
    if (isOrderState) labels.push('<span class="label-badge label-order">ORDER</span>');
    if (c.state === 'CANCEL_AFTER_CONFIRM') labels.push('<span class="label-badge label-cancel">CANCEL</span>');
    if (c.unreplied && !labels.length) labels.push(`<span class="label-badge label-unreplied">UNREPLIED ${Math.floor((c.unreplied_since || 0) / 60)}m</span>`);
    const labelHtml = labels.join(' ');

    const itemClass = [
      'chat-item',
      c.id === currentChatId ? 'active' : '',
      c.unreplied ? 'has-unreplied' : '',
      c.complaint_flag ? 'has-complaint' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="${itemClass}" onclick="openChat(${c.id})" data-id="${c.id}"
           data-filter-bot="${!c.needs_human && !c.spam_flag && !isComplaint}" data-filter-human="${!!c.needs_human && !isComplaint}"
           data-filter-order="${isOrderState}" data-filter-complaint="${isComplaint}"
           data-filter-cancel="${c.state === 'CANCEL_AFTER_CONFIRM'}"
           data-filter-unreplied="${!!c.unreplied}" data-filter-spam="${!!c.spam_flag}" data-name="${name.toLowerCase()}" data-phone="${c.phone || c.customer?.phone || ''}" data-date="${(c.created_at || '').slice(0, 10)}">
        <div class="chat-avatar">${initials}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${statusIcon} ${name}</span>
            <span class="chat-item-time">${timeAgo(c.last_message_at)}</span>
          </div>
          ${labelHtml ? '<div class="chat-item-labels">' + labelHtml + '</div>' : ''}
          <div class="chat-item-preview">${c.last_message || ''}</div>
        </div>
        ${c.admin_unread ? '<div class="unread-dot"></div>' : ''}
      </div>
    `;
  }).join('');
}

// Chat filters
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('filter-chip')) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    const filter = e.target.dataset.filter;
    filterChats(filter);
  }
});

function filterChats(filter) {
  const items = document.querySelectorAll('.chat-item');
  items.forEach(item => {
    if (filter === 'all') {
      item.style.display = '';
    } else {
      item.style.display = item.dataset[`filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`] === 'true' ? '' : 'none';
    }
  });
}

// Chat search
const chatSearchEl = document.getElementById('chatSearch');
if (chatSearchEl) {
  chatSearchEl.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(item => {
      const name = item.dataset.name || '';
      const phone = item.dataset.phone || '';
      item.style.display = (name.includes(q) || phone.includes(q)) ? '' : 'none';
    });
  });
}

// Date filter for chats
const chatDateEl = document.getElementById('chatDateFilter');
const chatDateClearEl = document.getElementById('chatDateClear');
if (chatDateEl) {
  chatDateEl.addEventListener('change', () => {
    const d = chatDateEl.value; // YYYY-MM-DD
    if (chatDateClearEl) chatDateClearEl.style.display = d ? '' : 'none';
    document.querySelectorAll('.chat-item').forEach(item => {
      if (!d) { item.style.display = ''; return; }
      item.style.display = (item.dataset.date === d) ? '' : 'none';
    });
  });
}
if (chatDateClearEl) {
  chatDateClearEl.addEventListener('click', () => {
    chatDateEl.value = '';
    chatDateClearEl.style.display = 'none';
    document.querySelectorAll('.chat-item').forEach(item => { item.style.display = ''; });
  });
}

// Open a chat
let _openChatSeq = 0; // Race condition guard
async function openChat(chatId) {
  const seq = ++_openChatSeq;
  currentChatId = chatId;

  // Highlight in list
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === chatId);
  });

  const conv = conversations.find(c => c.id === chatId);
  if (!conv) return;

  // Mark as read by admin
  if (conv.admin_unread) {
    conv.admin_unread = 0;
    api(`/api/conversations/${chatId}/read`, { method: 'PUT' });
    // Remove unread dot from chat list item
    const chatEl = document.querySelector(`.chat-item[data-id="${chatId}"] .unread-dot`);
    if (chatEl) chatEl.remove();
  }

  // Show chat view
  const viewEmpty = document.getElementById('chatViewEmpty');
  const viewContent = document.getElementById('chatViewContent');
  const chatViewEl = document.getElementById('chatView');

  if (viewEmpty) viewEmpty.style.display = 'none';
  if (viewContent) viewContent.style.display = 'flex';
  if (chatViewEl) chatViewEl.classList.add('show'); // mobile

  // Update header
  document.getElementById('chatViewAvatar').textContent = getInitials(conv.customer_name || conv.customer?.name);
  document.getElementById('chatViewName').textContent = conv.customer_name || conv.customer?.name || formatPhone(conv.phone || '') || 'Unknown';
  document.getElementById('chatViewMeta').textContent =
    formatPhone(conv.phone || conv.customer?.phone) + ' - ' +
    (conv.needs_human ? 'Human Assigned' : 'Bot Handling') +
    ' - ' + (conv.state === 'CANCEL_AFTER_CONFIRM' ? 'CANCEL AFTER CONFIRMATION' : conv.state);

  // Take over / resume buttons
  const btnTakeOver = document.getElementById('btnTakeOver');
  const btnResumeBot = document.getElementById('btnResumeBot');
  if (conv.needs_human) {
    btnTakeOver.classList.add('hidden');
    btnResumeBot.classList.remove('hidden');
  } else {
    btnTakeOver.classList.remove('hidden');
    btnResumeBot.classList.add('hidden');
  }

  // Enable/disable input
  const inputArea = document.getElementById('chatInputArea');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (conv.needs_human) {
    chatInput.disabled = false;
    chatInput.placeholder = 'Type reply as human agent...';
    sendBtn.disabled = false;
    inputArea.classList.remove('disabled');
  } else {
    chatInput.disabled = true;
    chatInput.placeholder = 'Bot handling this chat...';
    sendBtn.disabled = true;
    inputArea.classList.add('disabled');
  }

  // Fetch model info (cached)
  if (!window._aiModel) {
    try { window._aiModel = await api('/api/model'); } catch(e) { window._aiModel = { name: 'AI', pricing: { input: 0.25, output: 1.25 } }; }
  }
  const _m = window._aiModel;

  // Clear old messages immediately so user sees loading
  const msgsEl = document.getElementById('chatMessages');
  msgsEl.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Loading...</div>';

  // Load messages (with cache-busting)
  try {
    const msgs = await api(`/api/conversations/${chatId}/messages?t=${Date.now()}`) || [];

    // Race condition guard: if user clicked another chat while loading, discard
    if (seq !== _openChatSeq) return;

    msgsEl.innerHTML = msgs.map(m => {
      const isOut = m.direction === 'outgoing';
      const senderLabel = m.sender === 'bot' ? 'Bot' : m.sender === 'human' ? 'Human Agent' : '';
      const senderClass = m.sender === 'bot' ? 'bot-sender' : m.sender === 'human' ? 'human-sender' : 'customer-sender';
      const bubbleClass = isOut ? `msg-outgoing${m.sender === 'human' ? ' human' : ''}` : 'msg-incoming';

      // Source badge: T = template, A = AI (only for bot outgoing messages)
      // Pure AI = 'ai' only. Everything else (template, pre-check, ai→template, ai→confirm, smart-fill) = T
      const isAiSource = m.source === 'ai';
      // Use stored cost from debug_json if available, else calculate dynamically
      let debugObj = null;
      try { debugObj = m.debug_json ? JSON.parse(m.debug_json) : null; } catch(e) {}
      const storedCost = debugObj?._cost_rs;
      const aiCostPkr = isAiSource && (m.tokens_in || m.tokens_out)
        ? (storedCost != null ? storedCost : ((m.tokens_in || 0) * _m.pricing.input + (m.tokens_out || 0) * _m.pricing.output) / 1000000 * 300).toFixed(2)
        : null;
      const storedModel = debugObj?._model;
      const costLabel = aiCostPkr ? ` <span class="ai-cost-badge">Rs.${aiCostPkr}</span>` : '';
      const modelLabel = storedModel || (isAiSource ? _m.name : 'T');
      const srcBadge = (isOut && m.sender === 'bot' && m.source)
        ? `<span class="msg-source-badge ${isAiSource ? 'src-ai' : 'src-tpl'}">${modelLabel}</span>${costLabel}`
        : '';
      // Media cost badge for incoming messages (image/voice)
      const mediaCostRs = debugObj?._media_cost_rs;
      const mediaType = debugObj?._media_type;
      const mediaModel = debugObj?._media_model;
      const mediaBadge = (!isOut && mediaCostRs != null)
        ? `<span class="msg-source-badge src-ai" style="font-size:10px;">${mediaType === 'voice' ? '🎤' : '🖼️'} ${mediaModel || 'Media'}</span> <span class="ai-cost-badge">Rs.${mediaCostRs.toFixed(2)}</span>`
        : '';

      // Feedback button + display (all messages — bot + customer)
      const feedbackHtml = `
        ${m.admin_feedback ? `<div class="msg-feedback-text" id="fb-text-${m.id}">${escHtml(m.admin_feedback)}</div>` : ''}
        <div class="msg-feedback-row">
          <div class="msg-time">${formatTime(m.created_at)}</div>
          <button class="msg-feedback-btn${m.admin_feedback ? ' has-feedback' : ''}" onclick="toggleFeedback(${m.id})" title="${m.admin_feedback ? 'Edit feedback' : 'Add feedback'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        <div class="msg-feedback-form" id="fb-form-${m.id}" style="display:none">
          <textarea id="fb-input-${m.id}" placeholder="Feedback likho...">${m.admin_feedback ? escHtml(m.admin_feedback) : ''}</textarea>
          <div class="msg-feedback-actions">
            <button class="fb-save-btn" onclick="saveFeedback(${m.id})">Save</button>
            <button class="fb-cancel-btn" onclick="toggleFeedback(${m.id})">Cancel</button>
          </div>
        </div>
      `;

      // WhatsApp-style ticks for outgoing messages
      const tickHtml = isOut ? (() => {
        const st = m.wa_status || 'sent';
        if (st === 'read') return '<span class="msg-ticks read" title="Read">&#10003;&#10003;</span>';
        if (st === 'delivered') return '<span class="msg-ticks delivered" title="Delivered">&#10003;&#10003;</span>';
        return '<span class="msg-ticks sent" title="Sent">&#10003;</span>';
      })() : '';

      return `
        <div class="msg-bubble ${bubbleClass}" data-msg-id="${m.id}" data-wa-id="${m.wa_message_id || ''}">
          ${senderLabel ? `<div class="msg-sender ${senderClass}">${senderLabel}${srcBadge}</div>` : ''}
          ${mediaBadge ? `<div style="margin-bottom:4px">${mediaBadge}</div>` : ''}
          <div>${m.content}</div>
          ${feedbackHtml}
          ${tickHtml}
        </div>
      `;
    }).join('');

    if (!msgs.length) {
      msgsEl.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">No messages yet</div>';
    }

    // Calculate total AI cost for this chat (uses stored cost when available + media costs)
    const totalAiCost = msgs.reduce((sum, m) => {
      let debugObj = null;
      try { debugObj = m.debug_json ? JSON.parse(m.debug_json) : null; } catch(e) {}
      // Add media processing cost (image/voice) from incoming messages
      if (m.direction === 'incoming' && debugObj?._media_cost_rs) {
        sum += debugObj._media_cost_rs;
      }
      // Add AI response cost from outgoing messages
      if (m.source === 'ai' && (m.tokens_in || m.tokens_out)) {
        const storedCost = debugObj?._cost_rs;
        sum += storedCost != null ? storedCost : ((m.tokens_in || 0) * _m.pricing.input + (m.tokens_out || 0) * _m.pricing.output) / 1000000 * 300;
      }
      return sum;
    }, 0);
    const costEl = document.getElementById('chatAiCost');
    if (costEl) costEl.textContent = totalAiCost > 0 ? `AI Cost: Rs.${totalAiCost.toFixed(2)}` : '';
    // Show current AI model in header
    try {
      const modelEl = document.getElementById('chatAiModel');
      if (modelEl && _m) modelEl.textContent = `Model: ${_m.name} (${_m.model})`;
    } catch(e) {}
  } catch (err) {
    if (seq !== _openChatSeq) return;
    msgsEl.innerHTML = '<div style="text-align:center;color:#c00;padding:20px;">Failed to load messages</div>';
    console.error('openChat messages error:', err);
  }

  // Scroll to bottom
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function closeChatView() {
  const chatViewEl = document.getElementById('chatView');
  if (chatViewEl) chatViewEl.classList.remove('show');
  currentChatId = null;
}

function downloadDebugLog() {
  if (!currentChatId) return;
  window.open(`/api/conversations/${currentChatId}/debug-export`, '_blank');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function toggleFeedback(msgId) {
  const form = document.getElementById(`fb-form-${msgId}`);
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveFeedback(msgId) {
  const input = document.getElementById(`fb-input-${msgId}`);
  if (!input) return;
  const feedback = input.value.trim();
  try {
    await api(`/api/messages/${msgId}/feedback`, { method: 'PUT', body: JSON.stringify({ feedback }), headers: { 'Content-Type': 'application/json' } });
    // Update UI
    const form = document.getElementById(`fb-form-${msgId}`);
    if (form) form.style.display = 'none';
    let textEl = document.getElementById(`fb-text-${msgId}`);
    if (feedback) {
      if (!textEl) {
        textEl = document.createElement('div');
        textEl.className = 'msg-feedback-text';
        textEl.id = `fb-text-${msgId}`;
        form.parentElement.insertBefore(textEl, form.parentElement.querySelector('.msg-feedback-row'));
      }
      textEl.textContent = feedback;
      textEl.style.display = '';
      // Mark button as has-feedback
      const btn = form.parentElement.querySelector('.msg-feedback-btn');
      if (btn) btn.classList.add('has-feedback');
    } else {
      if (textEl) { textEl.style.display = 'none'; textEl.textContent = ''; }
      const btn = form.parentElement.querySelector('.msg-feedback-btn');
      if (btn) btn.classList.remove('has-feedback');
    }
  } catch (e) {
    console.error('Save feedback error:', e);
  }
}

async function takeOverChat() {
  if (!currentChatId) return;
  const conv = conversations.find(c => c.id === currentChatId);
  if (conv) {
    conv.needs_human = true;
    openChat(currentChatId);
    renderChatList(conversations);
  }
}

async function resumeBot() {
  if (!currentChatId) return;
  const conv = conversations.find(c => c.id === currentChatId);
  if (conv) {
    conv.needs_human = false;
    openChat(currentChatId);
    renderChatList(conversations);
  }
}

async function sendManualReply() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  const sendBtn = document.getElementById('chatSendBtn');
  input.disabled = true;
  sendBtn.disabled = true;

  try {
    const result = await api(`/api/conversations/${currentChatId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (result?.success) {
      input.value = '';
      // Reload messages to show saved message from DB
      openChat(currentChatId);
    } else {
      alert('Failed to send: ' + (result?.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Error sending message: ' + e.message);
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// Enter key to send
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'chatInput') {
    sendManualReply();
  }
});

// ---- LOAD SETTINGS (for bot status) ----
async function loadSettings() {
  const settings = await api('/api/settings');
  if (settings) updateBotUI(settings.bot_enabled);
}

// ---- WEBSOCKET ----
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'bot_status') updateBotUI(data.enabled);
    if (data.type === 'new_message') {
      loadChats();
      if (currentChatId) openChat(currentChatId);
    }
    if (data.type === 'msg_status') {
      // Update tick marks in real-time
      const bubble = document.querySelector(`.msg-bubble[data-wa-id="${data.wa_message_id}"]`);
      if (bubble) {
        const oldTick = bubble.querySelector('.msg-ticks');
        if (oldTick) oldTick.remove();
        const tick = document.createElement('span');
        tick.className = `msg-ticks ${data.status}`;
        tick.title = data.status.charAt(0).toUpperCase() + data.status.slice(1);
        tick.innerHTML = data.status === 'sent' ? '&#10003;' : '&#10003;&#10003;';
        bubble.appendChild(tick);
      }
    }
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  connectWebSocket();

  // Page-specific init
  const path = window.location.pathname;
  if (path === '/admin/' || path === '/admin/index.html') {
    loadChats();
  } else if (path.includes('customers')) {
    loadCustomers();
  } else if (path.includes('orders')) {
    loadOrders();
  } else if (path.includes('stats')) {
    loadStats();
  } else if (path.includes('products')) {
    loadProducts();
  } else if (path.includes('settings')) {
    loadSettingsPage();
  }
});

// ============================================
// CUSTOMERS PAGE
// ============================================
async function loadCustomers() {
  const customers = await api('/api/customers') || [];
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  tbody.innerHTML = customers.map(c => {
    const statusClass = c.is_blocked ? 'status-cancelled' : c.needs_human ? 'status-shipped' : 'status-delivered';
    const statusText = c.is_blocked ? 'Blocked' : c.needs_human ? 'Human' : 'Bot';
    const btnText = c.is_blocked ? 'Unblock' : c.needs_human ? 'Switch to Bot' : 'Switch to Human';
    const btnClass = c.needs_human ? 'btn-green' : 'btn-outline';

    return `<tr>
      <td><strong>${c.name || 'N/A'}</strong></td>
      <td>${formatPhone(c.phone)}</td>
      <td>${c.city || '-'}</td>
      <td>${c.total_orders}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td><button class="btn btn-sm ${btnClass}" onclick="toggleCustomer(${c.id})">${btnText}</button></td>
    </tr>`;
  }).join('');

  document.getElementById('customerCount').textContent = `Total: ${customers.length} customers`;
}

async function toggleCustomer(id) {
  await api(`/api/customers/${id}/toggle`, { method: 'POST' });
  loadCustomers();
}

// ============================================
// ORDERS PAGE
// ============================================
async function loadOrders() {
  const orders = await api('/api/orders') || [];
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;

  let totalRevenue = 0;

  tbody.innerHTML = orders.map(o => {
    totalRevenue += o.grand_total;
    const statusClass = `status-${o.status}`;
    const statusText = o.status.charAt(0).toUpperCase() + o.status.slice(1);
    const sourceIcon = o.source === 'bot' ? '&#129302;' : '&#128100;';
    const products = o.items.map(i => `${i.name}${i.quantity > 1 ? ' x' + i.quantity : ''}`).join(', ');
    const sheetSync = o.google_sheet_synced ? '<span class="sync-icon sync-ok">&#10004;</span>' : '<span class="sync-icon sync-fail">&#10008;</span>';
    const portalSync = o.portal_synced ? '<span class="sync-icon sync-ok">&#10004;</span>' : '<span class="sync-icon sync-fail">&#10008;</span>';

    return `<tr>
      <td><strong>${o.order_id}</strong><br><small class="text-muted">${sourceIcon} ${o.source}</small></td>
      <td>${o.customer_name}<br><small class="text-muted">${o.customer_city}</small></td>
      <td>${products}</td>
      <td>${formatPrice(o.grand_total)}${o.discount_total > 0 ? `<br><small class="text-muted">-${formatPrice(o.discount_total)} disc</small>` : ''}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>Sheet ${sheetSync}<br>Portal ${portalSync}</td>
      <td><small>${formatDate(o.created_at)}</small></td>
    </tr>`;
  }).join('');

  document.getElementById('ordersSummary').textContent =
    `${orders.length} orders | ${formatPrice(totalRevenue)} revenue`;
}

// ============================================
// STATS PAGE
// ============================================
async function loadStats() {
  const stats = await api('/api/stats');
  if (!stats) return;

  // Update cards
  const el = (id) => document.getElementById(id);
  if (el('statChats')) el('statChats').textContent = stats.total_conversations;
  if (el('statOrders')) el('statOrders').textContent = stats.total_orders;
  if (el('statConversion')) el('statConversion').textContent = stats.conversion_rate + '%';
  if (el('statRevenue')) el('statRevenue').textContent = formatPrice(stats.total_revenue);

  // Chart
  if (typeof Chart !== 'undefined' && document.getElementById('statsChart')) {
    const ctx = document.getElementById('statsChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: stats.chart_labels,
        datasets: [
          {
            label: 'Conversations',
            data: stats.chart_conversations,
            backgroundColor: '#075E54',
            borderRadius: 4
          },
          {
            label: 'Orders',
            data: stats.chart_orders,
            backgroundColor: '#25D366',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ============================================
// PRODUCTS PAGE
// ============================================
async function loadProducts() {
  const products = await api('/api/products') || [];
  const allProducts = await api('/api/products') || [];
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  grid.innerHTML = products.map(p => {
    const upsellNames = (p.upsell_with || []).map(id => {
      const up = allProducts.find(x => x.id === id);
      return up ? up.short_name : '';
    }).filter(Boolean).join(', ');

    return `
    <div class="product-card">
      <div class="product-img">${p.images?.length ? '<img>' : 'No Image'}</div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-meta">
          <span>Price: ${formatPrice(p.whatsapp_price)}</span>
          <span>Status: ${p.is_active ? '&#10004; Active' : 'Hidden'}</span>
          ${p.is_upsell_eligible ? `<span>Upsell: ON | ${formatPrice(p.upsell_price || 0)}</span>` : '<span>Upsell: OFF</span>'}
        </div>
        ${upsellNames ? `<div style="font-size:12px;color:#667781;">Suggest with: ${upsellNames}</div>` : ''}
        <div class="product-actions mt-8">
          <button class="btn btn-sm btn-outline">Edit</button>
          <button class="btn btn-sm btn-outline">${p.is_active ? 'Hide' : 'Show'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================
// SETTINGS PAGE
// ============================================
async function loadSettingsPage() {
  const settings = await api('/api/settings');
  if (!settings) return;

  // Bot status
  updateBotUI(settings.bot_enabled);

  // Fill form values
  const fields = [
    'haggle_max_discount', 'haggle_first_discount', 'haggle_max_rounds',
    'followup_r1_hours', 'followup_r2_hours', 'followup_r3_before_close',
    'upsell_discount_percent',
    'meta_whatsapp_token', 'meta_phone_number_id', 'meta_verify_token', 'meta_app_secret',
    'claude_api_key', 'openai_api_key', 'google_maps_api_key',
    'google_sheets_url', 'portal_webhook_url'
  ];

  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el && settings[f] !== undefined) {
      el.value = settings[f];
    }
  });
}

async function saveSettings(section) {
  const fields = document.querySelectorAll(`[data-section="${section}"]`);
  const data = {};
  fields.forEach(el => {
    data[el.id] = el.type === 'number' ? Number(el.value) : el.value;
  });

  await api('/api/settings', { method: 'POST', body: JSON.stringify(data) });

  // Show saved feedback
  const btn = document.querySelector(`[data-save="${section}"]`);
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Saved!';
    btn.classList.add('btn-green');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('btn-green'); }, 2000);
  }
}

function togglePasswordVisibility(inputId) {
  const el = document.getElementById(inputId);
  el.type = el.type === 'password' ? 'text' : 'password';
}
