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
  
  const resp = await fetch('https://wa.nuvenza.shop/api/conversations/579/messages', {
    headers: { Cookie: cookie }
  });
  const msgs = JSON.parse(resp.body);
  console.log('Msg keys:', Object.keys(msgs[0]).join(', '));
  console.log('First msg full:', JSON.stringify(msgs[0]));
  console.log('Second msg full:', JSON.stringify(msgs[1]));
}
main().catch(console.error);
