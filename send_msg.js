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

  const res = await request('/api/conversations/662/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      text: "Assalam o Alaikum Fayyaz Alam sir! Bohat maafi chahta hun aapka time waste hua 🙏\n\nHamari system mein ek technical error tha — aap Urdu mein likh rahe thay \"اوکے\" aur system sirf English samajh raha tha, is liye baar baar wahi address confirm puchta raha. Aapki galti bilkul nahi thi, humari taraf se masla tha.\n\nHum ne abhi fix kar diya hai — ab Urdu mein bhi \"اوکے\" ya \"جی ہاں\" likhein ge to system samajh jayega ✅\n\nAapka order abhi bhi pending hai:\n- T9 Vintage Professional Trimmer: Rs.1,399\n- Address: House K-328, Sector 11½, Orangi Town, near Disco Mor Water Pump, Karachi\n\nKya main order confirm kar dun? Bas \"haan\" bol dein 😊"
    })
  });
  console.log('Status:', res.status);
  console.log('Response:', res.body);
}
main().catch(console.error);
