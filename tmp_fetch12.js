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
    try {
      const resp = await fetch('https://wa.nuvenza.shop/api/conversations/' + id + '/messages', {
        headers: { Cookie: cookie }
      });
      if (resp.status !== 200) {
        // Try alternate endpoint
        const resp2 = await fetch('https://wa.nuvenza.shop/api/conversations/' + id, {
          headers: { Cookie: cookie }
        });
        const conv = JSON.parse(resp2.body);
        const msgs = conv.messages || conv.Messages || [];
        console.log('\n=== CHAT #' + id + ' - ' + msgs.length + ' msgs ===');
        msgs.forEach(m => {
          const dir = m.direction === 'incoming' ? 'USER' : 'BOT';
          const path = m.path ? ' [' + m.path + ']' : '';
          const debug = m.debug_json ? ' {debug}' : '';
          console.log(dir + path + debug + ': ' + (m.body || '').substring(0, 250));
        });
      } else {
        const msgs = JSON.parse(resp.body);
        console.log('\n=== CHAT #' + id + ' - ' + msgs.length + ' msgs ===');
        msgs.forEach(m => {
          const dir = m.direction === 'incoming' ? 'USER' : 'BOT';
          const path = m.path ? ' [' + m.path + ']' : '';
          const debug = m.debug_json ? ' {debug}' : '';
          console.log(dir + path + debug + ': ' + (m.body || '').substring(0, 250));
        });
      }
    } catch(e) {
      console.log('\n=== CHAT #' + id + ' - FETCH ERROR: ' + e.message + ' ===');
    }
  }
}
main().catch(console.error);
