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
    hostname: 'wa.nuvenza.shop', path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'admin123' }));
  const sessionCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ');
  const msgRes = await request({
    hostname: 'wa.nuvenza.shop', path: '/api/conversations/557/messages', method: 'GET',
    headers: { Cookie: sessionCookie }
  });
  const msgs = JSON.parse(msgRes.data);
  // Show messages around city detection with debug_json
  msgs.forEach(m => {
    const who = m.direction === 'inbound' ? 'CUSTOMER' : 'BOT';
    const txt = (m.content || '').substring(0, 200);
    const debug = m.debug_json ? JSON.parse(m.debug_json) : null;
    console.log(`[${m.created_at}] ${who}(${m.source}): ${txt}`);
    if (debug) {
      if (debug.collected) console.log('  collected.address_parts:', JSON.stringify(debug.collected.address_parts));
      if (debug.address_parts) console.log('  address_parts:', JSON.stringify(debug.address_parts));
      if (debug.state_before) console.log('  state_before:', debug.state_before);
      if (debug.path) console.log('  path:', debug.path);
      if (debug.detected_intent) console.log('  intent:', debug.detected_intent);
      if (debug.ai_extracted) console.log('  ai_extracted:', JSON.stringify(debug.ai_extracted));
    }
  });
}
main().catch(console.error);
