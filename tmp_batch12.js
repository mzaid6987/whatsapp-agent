const https = require('https');
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers, cookies: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  // Login
  const login = await fetch('https://wa.nuvenza.shop/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  const cookie = login.cookies.find(c => c.startsWith('connect.sid')).split(';')[0];
  
  // Get all conversations
  const resp = await fetch('https://wa.nuvenza.shop/api/conversations?page=1&limit=1000', {
    headers: { Cookie: cookie }
  });
  const data = JSON.parse(resp.body);
  const meaningful = data.filter(c => c.message_count >= 3);
  
  // Already analyzed IDs
  const done = new Set([522,516,514,513,510,509,508,505,504,502,501,500,498,497,496,495,494,493,492,491,490,489,488,487,486,485,484,483,482,481,480,479,478,477,476,475,474,473,472,471,470,469,468,467,466,465,464,463,462,461,460,459,458,457,456,455,454,453,452,451,450,449,448,447,446,445,443,442,441,440,439,438,437,436,435,434,433,432,431,430,429,428,427,426,425,424,423,422,421,420,419,418,417,416,415,414,413,412,411,410,544,506,126,503,399,389,286,125,184,346,132,116,38,444,379,317,118,86,307,181]);
  
  const remaining = meaningful.filter(c => !done.has(c.id)).sort((a, b) => b.message_count - a.message_count);
  console.log('Remaining meaningful:', remaining.length);
  
  // Batch 12: next 10
  const batch = remaining.slice(0, 10);
  console.log('Batch 12 IDs:', batch.map(c => c.id).join(','));
  batch.forEach(c => console.log('  #' + c.id, '- msgs:', c.message_count, '- state:', c.state, '- name:', c.customer_name));
  
  // Now fetch messages for each
  for (const c of batch) {
    const msgResp = await fetch('https://wa.nuvenza.shop/api/conversations/' + c.id, {
      headers: { Cookie: cookie }
    });
    const conv = JSON.parse(msgResp.body);
    const msgs = conv.messages || [];
    console.log('\n=== CHAT #' + c.id + ' (' + c.customer_name + ') - ' + msgs.length + ' msgs - state: ' + c.state + ' ===');
    msgs.forEach(m => {
      const dir = m.direction === 'incoming' ? 'USER' : 'BOT';
      const path = m.path ? ' [' + m.path + ']' : '';
      console.log(dir + path + ': ' + (m.body || '').substring(0, 200));
    });
  }
}
main().catch(console.error);
