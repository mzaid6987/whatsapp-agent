const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, cookies: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  const login = await fetch('https://wa.nuvenza.shop/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  const cookie = login.cookies.find(c => c.startsWith('connect.sid')).split(';')[0];
  
  const ids = [81,736,309,133,350,238,280,266,183,579];
  
  for (const id of ids) {
    const resp = await fetch('https://wa.nuvenza.shop/api/conversations/' + id + '/messages', {
      headers: { Cookie: cookie }
    });
    const msgs = JSON.parse(resp.body);
    console.log('\n=== CHAT #' + id + ' - ' + msgs.length + ' msgs ===');
    msgs.forEach(m => {
      const dir = m.direction === 'incoming' ? 'USER' : 'BOT';
      const path = m.path ? ' [' + m.path + ']' : '';
      const debug = m.debug_json ? ' {DBG:' + (JSON.parse(m.debug_json).state || '') + '}' : '';
      console.log(dir + path + debug + ': ' + (m.body || '').substring(0, 200));
    });
  }
}
main().catch(console.error);
