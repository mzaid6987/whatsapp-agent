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
  
  // Just fetch chat #81 to inspect structure
  const resp = await fetch('https://wa.nuvenza.shop/api/conversations/81', {
    headers: { Cookie: cookie }
  });
  const conv = JSON.parse(resp.body);
  
  // Show first message structure
  if (conv.messages && conv.messages.length > 0) {
    console.log('Message keys:', Object.keys(conv.messages[0]).join(', '));
    console.log('First 3 messages:');
    conv.messages.slice(0, 3).forEach(m => console.log(JSON.stringify(m).substring(0, 300)));
  } else {
    console.log('Conv keys:', Object.keys(conv).join(', '));
    console.log('Raw (first 500):', JSON.stringify(conv).substring(0, 500));
  }
}
main().catch(console.error);
