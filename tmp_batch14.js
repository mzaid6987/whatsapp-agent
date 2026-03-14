const https = require('https');

const loginData = JSON.stringify({password:'admin123'});
const loginOpts = {
  hostname: 'wa.nuvenza.shop',
  path: '/api/auth/login',
  method: 'POST',
  headers: {'Content-Type':'application/json','Content-Length':loginData.length}
};

const loginReq = https.request(loginOpts, (res) => {
  const cookies = res.headers['set-cookie'];
  const cookie = cookies ? cookies.map(c=>c.split(';')[0]).join('; ') : '';
  
  https.get({
    hostname: 'wa.nuvenza.shop',
    path: '/api/conversations?limit=1000',
    headers: {Cookie: cookie}
  }, (res2) => {
    let d = '';
    res2.on('data', c => d += c);
    res2.on('end', () => {
      const convos = JSON.parse(d);
      const analyzed = new Set([551,557,519,579,538,593,592,233,455,472,81,309,133,350,238,266,479,183,396,345,330,374,235,292,109,589,518,393,228,36,563,432,259,299,347,368,131,221,604,602,601,598,487,594,475,586,477,582,132,116,38,444,379,317,118,86,307,181,170,106,103,521,373,260,418,416,30,85,164,74,409,353,509,403,351,208,129,176,343,171,439,391,364,344,272,342,290,281,544,506,126,503,399,389,286,125,184,346,736,280,610,692,662,616,697,751,711,733,613,653]);
      
      const remaining = convos.filter(c => c.message_count >= 3 && !analyzed.has(c.id))
        .sort((a,b) => b.id - a.id);
      
      console.log('Remaining meaningful chats:', remaining.length);
      const batch = remaining.slice(0, 10);
      console.log('Batch 14 IDs:', batch.map(c => '#' + c.id).join(', '));
      batch.forEach(c => console.log('#' + c.id, '|', c.customer_phone, '| msgs:', c.message_count, '| state:', c.current_state));
    });
  });
});
loginReq.write(loginData);
loginReq.end();
