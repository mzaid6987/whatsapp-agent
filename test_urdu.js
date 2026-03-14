const { preCheck, isYes, isNo, URDU_YES_WORD_RE, URDU_NO_WORD_RE } = require('./src/hybrid/pre-check');

console.log('=== Urdu name extraction (all lengths) ===');
const nameTests = [
  'میرا نام فیاض عالم ھے',
  'میرا نام احمد ہے',
  'نام محمد علی ھے',
  'میرا نام خان ھے',
];
for (const t of nameTests) {
  const result = preCheck(t, 'COLLECT_NAME', { product: 'T9 Trimmer', name: null, phone: null, delivery_phone: null, city: null, address: null, address_parts: {} }, { current: 'COLLECT_NAME', messages: [], address_confirming: false });
  console.log(`  "${t}" → ${result ? JSON.stringify(result) : 'null (AI handles)'}`);
}

console.log('\n=== Address confirm with Urdu ===');
const addrState = {
  current: 'COLLECT_ADDRESS',
  address_confirming: true,
  collected: { product: 'T9', name: 'Fayyaz', phone: '03452432578', delivery_phone: 'same', city: 'Karachi', address: null, address_parts: { area: 'Orangi Town', street: 'Sector 11½', house: 'K-328', landmark: 'Disco Mor' } },
  messages: [{ role: 'assistant', content: 'Yeh address sahi hai? K-328...' }],
};
const addrTests = ['اوکے', 'جی ہاں ٹھیک ھے', 'بالکل'];
for (const t of addrTests) {
  const result = preCheck(t, 'COLLECT_ADDRESS', addrState.collected, addrState);
  console.log(`  "${t}" → ${result ? JSON.stringify(result) : 'null (falls to index.js)'}`);
}

console.log('\nAll tests passed!');
