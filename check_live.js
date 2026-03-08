const https = require('https');

const cookie = process.argv[2];
const options = {
  hostname: 'wa.nuvenza.shop',
  path: '/api/auto-templates',
  headers: { 'Cookie': cookie }
};

https.get(options, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const live = JSON.parse(body);
    const states = {};
    live.forEach(t => { states[t.state] = (states[t.state] || 0) + 1; });
    console.log('Live templates by state:', JSON.stringify(states, null, 2));
    console.log('Total:', live.length);

    // Find complaint one
    const complaint = live.filter(t => t.response && t.response.includes('03701'));
    console.log('\nComplaint templates:', complaint.length);
    complaint.forEach(t => {
      console.log('  State:', t.state, '| Keywords:', t.keywords);
      console.log('  Response:', t.response.substring(0, 250));
    });

    // Find COLLECT_ and COMPLAINT states
    const special = live.filter(t => t.state.startsWith('COLLECT') || t.state === 'COMPLAINT');
    console.log('\nCOLLECT/COMPLAINT templates:', special.length);
    special.forEach(t => {
      console.log('  [' + t.state + '] kw:', t.keywords, '| resp:', t.response?.substring(0, 120));
    });
  });
});
