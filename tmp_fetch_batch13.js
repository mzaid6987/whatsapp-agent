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
  
  // Get all conversations
  const resp = await fetch('https://wa.nuvenza.shop/api/conversations?page=1&limit=1000', {
    headers: { Cookie: cookie }
  });
  const data = JSON.parse(resp.body);
  const meaningful = data.filter(c => c.message_count >= 3);
  
  // Already analyzed IDs (batches 1-12 + per-phone + debug)
  const done = new Set([522,516,514,513,510,509,508,505,504,502,501,500,498,497,496,495,494,493,492,491,490,489,488,487,486,485,484,483,482,481,480,479,478,477,476,475,474,473,472,471,470,469,468,467,466,465,464,463,462,461,460,459,458,457,456,455,454,453,452,451,450,449,448,447,446,445,443,442,441,440,439,438,437,436,435,434,433,432,431,430,429,428,427,426,425,424,423,422,421,420,419,418,417,416,415,414,413,412,411,410,544,506,126,503,399,389,286,125,184,346,132,116,38,444,379,317,118,86,307,181,81,736,309,133,350,238,280,266,183,579,551,557,519,538,593,592,233,604,602,601,598,594,582,586,170,106,103,521,373,260,343,171,439,391,364,344,272,342,290,281,164,74,409,353,294,509,403,351,208,129,176,228,36,563,259,299,347,368,131,221,292,109,589,518,393,396,345,330,374,235,455,479,396]);
  
  const remaining = meaningful.filter(c => !done.has(c.id)).sort((a, b) => b.message_count - a.message_count);
  console.log('Remaining:', remaining.length);
  
  const batch = remaining.slice(0, 10);
  console.log('Batch 13 IDs:', batch.map(c => c.id).join(','));
  batch.forEach(c => console.log('  #' + c.id, '- msgs:', c.message_count, '- state:', c.state, '- name:', c.customer_name));
  
  // Fetch messages for each
  let output = '';
  for (const c of batch) {
    const msgResp = await fetch('https://wa.nuvenza.shop/api/conversations/' + c.id + '/messages', {
      headers: { Cookie: cookie }
    });
    const msgs = JSON.parse(msgResp.body);
    output += '\n=== CHAT #' + c.id + ' - ' + msgs.length + ' msgs - state: ' + c.state + ' - name: ' + c.customer_name + ' ===\n';
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
  
  fs.writeFileSync('tmp_batch13_chats.txt', output);
  console.log('Saved. Lines:', output.split('\n').length);
}
main().catch(console.error);
