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
  const meaningful = convs.filter(c => c.message_count >= 3);
  
  const analyzed = new Set([
    551,557,519,579,538,593,592,233,
    455,472,81,309,133,350,238,266,479,183,
    396,345,330,374,235,292,109,589,518,393,
    228,36,563,432,259,299,347,368,131,221,
    604,602,601,598,487,594,475,586,477,582,
    132,116,38,444,379,317,118,86,307,181,
    170,106,103,521,373,260,418,416,30,85,
    164,74,409,353,509,403,351,208,129,176,
    343,171,439,391,364,344,272,342,290,281,
    736,280,
    544,506,126,503,399,389,286,125,184,346,
    610,692,662,616,697,751,711,733,613,653,
    770,769,766,765,763,761,760,758,755,753,
    774,749,747,744,741,738,730,729,727,725,
    723,722,718,708,703,701,696,687,685,684,
    683,681,677,674,664,660,658,657,655,649,
    778,648,646,645,644,643,642,640,639,638,
    637,630,629,628,626,624,623,622,619,618,
    786, // complaint phone analysis
  ]);
  
  const remaining = meaningful.filter(c => !analyzed.has(c.id));
  
  // Check which have actual message content
  let withContent = 0;
  let withoutContent = 0;
  let newWithContent = [];
  
  for (const conv of remaining) {
    const msgs = await api(`/api/conversations/${conv.id}/messages`);
    const hasContent = msgs.some(m => m.body && m.body.trim().length > 0) || 
                       msgs.some(m => m.content && m.content.trim().length > 0);
    if (hasContent) {
      withContent++;
      newWithContent.push({ id: conv.id, msgs: conv.message_count, state: conv.state, created: conv.created_at });
    } else {
      withoutContent++;
    }
  }
  
  console.log(`Total conversations: ${convs.length}`);
  console.log(`Meaningful (3+ msgs): ${meaningful.length}`);
  console.log(`Already analyzed: ${analyzed.size}`);
  console.log(`Remaining: ${remaining.length}`);
  console.log(`  - With message content (analyzable): ${withContent}`);
  console.log(`  - Empty bodies (old, not analyzable): ${withoutContent}`);
  
  if (newWithContent.length > 0) {
    console.log(`\nNew analyzable chats:`);
    for (const c of newWithContent) {
      console.log(`  #${c.id} | Msgs: ${c.msgs} | State: ${c.state} | Created: ${c.created}`);
    }
  }
}
main().catch(console.error);
