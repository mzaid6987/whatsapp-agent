const https = require('https');

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data, cookies: (res.headers['set-cookie'] || []) }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  const loginRes = await request({
    hostname: 'wa.nuvenza.shop',
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'admin123' }));

  const sessionCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ');

  const msgRes = await request({
    hostname: 'wa.nuvenza.shop',
    path: '/api/conversations/551/messages',
    method: 'GET',
    headers: { Cookie: sessionCookie }
  });

  const msgs = JSON.parse(msgRes.data);
  // Print first message keys to see field names
  if (msgs.length > 0) console.log('KEYS:', Object.keys(msgs[0]).join(', '));

  msgs.forEach(m => {
    const who = m.direction === 'inbound' ? 'CUSTOMER' : (m.source !== 'admin' ? 'BOT' : 'ADMIN');
    const txt = (m.body || m.text || m.content || m.message || '').substring(0, 500);
    console.log(`[${m.created_at}] ${who}(${m.source}): ${txt}`);
  });
}
main().catch(console.error);
