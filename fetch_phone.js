const https = require('https');
const BASE = 'https://wa.nuvenza.shop';

function request(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = { ...opts, rejectUnauthorized: false, hostname: url.hostname, path: url.pathname + url.search, port: 443 };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  const cookies = loginRes.headers['set-cookie'];
  const sessionCookie = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

  function api(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE);
      https.get(url, { headers: { Cookie: sessionCookie }, rejectUnauthorized: false }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
  }

  const convs = await api('/api/conversations');
  // Search by phone in JSON and also in messages
  const match = convs.filter(c => {
    const json = JSON.stringify(c);
    return json.includes('2432578') || json.includes('3452432578');
  });
  console.log(`Found ${match.length} conversations in conv data`);
  
  for (const conv of match) {
    console.log(`\n=== CHAT #${conv.id} === Phone: ${conv.phone} | State: ${conv.state} | Msgs: ${conv.message_count} | Name: ${conv.customer_name} | Created: ${conv.created_at}`);
    console.log('Collected:', conv.collected_json);
    const msgs = await api(`/api/conversations/${conv.id}/messages`);
    for (const m of msgs) {
      const who = m.direction === 'incoming' ? 'USER' : 'BOT';
      const txt = (m.body || m.content || '').substring(0, 800);
      const src = m.source ? ` [${m.source}]` : '';
      const dbg = m.debug_json ? JSON.parse(m.debug_json) : null;
      const intent = dbg?.detected_intent ? ` intent=${dbg.detected_intent}` : (m.intent ? ` intent=${m.intent}` : '');
      if (txt.trim()) console.log(`${who}${src}${intent}: ${txt}`);
    }
  }
  
  if (match.length === 0) {
    // Search in messages
    console.log('Searching in messages...');
    for (const conv of convs.slice(-200)) {
      const msgs = await api(`/api/conversations/${conv.id}/messages`);
      const allText = msgs.map(m => (m.body || m.content || '')).join(' ');
      if (allText.includes('2432578')) {
        console.log(`\nFOUND in CHAT #${conv.id} | State: ${conv.state} | Msgs: ${conv.message_count}`);
        for (const m of msgs) {
          const who = m.direction === 'incoming' ? 'USER' : 'BOT';
          const txt = (m.body || m.content || '').substring(0, 800);
          if (txt.trim()) console.log(`${who}: ${txt}`);
        }
        break;
      }
    }
  }
}
main().catch(console.error);
