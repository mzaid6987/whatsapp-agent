const https = require('https');
const fs = require('fs');

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
  
  const chatIds = [770, 769, 766, 765, 763, 761, 760, 758, 755, 753];
  let results = {};
  let done = 0;
  
  chatIds.forEach(id => {
    https.get({
      hostname: 'wa.nuvenza.shop',
      path: '/api/conversations/' + id + '/messages',
      headers: {Cookie: cookie}
    }, (res2) => {
      let d = '';
      res2.on('data', c => d += c);
      res2.on('end', () => {
        try {
          const data = JSON.parse(d);
          // data might be {conversation, messages} or just array
          const msgs = data.messages || data;
          const convo = data.conversation || {};
          results[id] = {convo, msgs};
        } catch(e) {
          results[id] = {error: d.substring(0, 200)};
        }
        done++;
        if (done === chatIds.length) {
          // Format output
          let out = '';
          chatIds.forEach(id => {
            const r = results[id];
            if (r.error) {
              out += '\n=== CHAT #' + id + ' === ERROR: ' + r.error + '\n';
              return;
            }
            const c = r.convo;
            out += '\n=== CHAT #' + id + ' === Phone: ' + (c.customer_phone||'?') + ' | State: ' + (c.current_state||'?') + ' | Msgs: ' + r.msgs.length + '\n';
            r.msgs.forEach(m => {
              const dir = m.direction === 'outbound' ? 'BOT' : 'USER';
              const content = (m.content || '').substring(0, 300);
              out += dir + ': ' + content + '\n';
            });
          });
          fs.writeFileSync('tmp_batch14_chats.txt', out);
          console.log('Written to tmp_batch14_chats.txt, size:', out.length);
        }
      });
    });
  });
});
loginReq.write(loginData);
loginReq.end();
