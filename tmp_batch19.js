const https = require('https');
const fs = require('fs');
const loginData = JSON.stringify({password:'admin123'});
const loginOpts = { hostname: 'wa.nuvenza.shop', path: '/api/auth/login', method: 'POST', headers: {'Content-Type':'application/json','Content-Length':loginData.length} };
const loginReq = https.request(loginOpts, (res) => {
  const cookies = res.headers['set-cookie'];
  const cookie = cookies ? cookies.map(c=>c.split(';')[0]).join('; ') : '';
  https.get({ hostname: 'wa.nuvenza.shop', path: '/api/conversations?limit=1000', headers: {Cookie: cookie} }, (res2) => {
    let d = '';
    res2.on('data', c => d += c);
    res2.on('end', () => {
      const convos = JSON.parse(d);
      const analyzed = new Set([551,557,519,579,538,593,592,233,455,472,81,309,133,350,238,266,479,183,396,345,330,374,235,292,109,589,518,393,228,36,563,432,259,299,347,368,131,221,604,602,601,598,487,594,475,586,477,582,132,116,38,444,379,317,118,86,307,181,170,106,103,521,373,260,418,416,30,85,164,74,409,353,509,403,351,208,129,176,343,171,439,391,364,344,272,342,290,281,544,506,126,503,399,389,286,125,184,346,736,280,610,692,662,616,697,751,711,733,613,653,770,769,766,765,763,761,760,758,755,753,774,749,747,744,741,738,730,729,727,725,723,722,718,708,703,701,696,687,685,684,683,681,677,674,664,660,658,657,655,649,778,648,646,645,644,643,642,640,639,638]);
      const remaining = convos.filter(c => c.message_count >= 3 && !analyzed.has(c.id)).sort((a,b) => b.id - a.id);
      console.log('Remaining:', remaining.length);
      const batch = remaining.slice(0, 10);
      console.log('Batch 19:', batch.map(c => '#' + c.id).join(', '));
      let results = {}; let done = 0;
      const chatIds = batch.map(c => c.id);
      chatIds.forEach(id => {
        https.get({ hostname: 'wa.nuvenza.shop', path: '/api/conversations/' + id + '/messages', headers: {Cookie: cookie} }, (res3) => {
          let md = '';
          res3.on('data', c => md += c);
          res3.on('end', () => {
            try { const data = JSON.parse(md); results[id] = {convo: data.conversation || {}, msgs: data.messages || data}; }
            catch(e) { results[id] = {error: md.substring(0, 200)}; }
            done++;
            if (done === chatIds.length) {
              let out = '';
              chatIds.forEach(id => {
                const r = results[id];
                if (r.error) { out += '\n=== CHAT #' + id + ' === ERROR\n'; return; }
                const c = r.convo;
                out += '\n=== CHAT #' + id + ' === Phone: ' + (c.customer_phone||'?') + ' | State: ' + (c.state||'?') + ' | Msgs: ' + r.msgs.length + '\n';
                r.msgs.forEach(m => {
                  const dir = m.direction === 'outgoing' ? 'BOT' : 'USER';
                  out += dir + ': ' + (m.content || '').substring(0, 500) + '\n';
                });
              });
              fs.writeFileSync('tmp_batch19_chats.txt', out);
              console.log('Written, size:', out.length);
            }
          });
        });
      });
    });
  });
});
loginReq.write(loginData);
loginReq.end();
