const https = require('https');
const fs = require('fs');

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
  let output = '';
  
  for (const id of ids) {
    const resp = await fetch('https://wa.nuvenza.shop/api/conversations/' + id + '/messages', {
      headers: { Cookie: cookie }
    });
    const msgs = JSON.parse(resp.body);
    
    // Also get conversation metadata
    const listResp = await fetch('https://wa.nuvenza.shop/api/conversations?page=1&limit=1000', {
      headers: { Cookie: cookie }
    });
    const allConvs = JSON.parse(listResp.body);
    const conv = allConvs.find(c => c.id === id);
    
    output += '\n=== CHAT #' + id + ' - ' + msgs.length + ' msgs - state: ' + (conv ? conv.state : '?') + ' - name: ' + (conv ? conv.customer_name : '?') + ' ===\n';
    msgs.forEach(m => {
      const dir = m.direction === 'incoming' ? 'USER' : 'BOT';
      let debug = '';
      if (m.debug_json) {
        try {
          const d = JSON.parse(m.debug_json);
          const parts = [];
          if (d.path) parts.push(d.path);
          if (d.state_before) parts.push(d.state_before + '->' + d.state_after);
          if (d.intent) parts.push('intent:' + d.intent);
          debug = ' [' + parts.join(' | ') + ']';
        } catch(e) {}
      }
      output += dir + debug + ': ' + (m.content || '').substring(0, 300) + '\n';
    });
  }
  
  fs.writeFileSync('tmp_batch12_chats.txt', output);
  console.log('Saved to tmp_batch12_chats.txt');
  console.log('Lines:', output.split('\n').length);
}
main().catch(console.error);
