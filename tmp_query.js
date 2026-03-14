const preCheck = require('./src/hybrid/pre-check');

const tests = [
  // Should be REJECTED as names (bugs found)
  { msg: 'I Went This', state: 'PRODUCT_INQUIRY', expect: 'NOT name', desc: '#439 I Went This' },
  { msg: 'Is Ki', state: 'PRODUCT_INQUIRY', expect: 'NOT name', desc: '#455 Is Ki' },
  { msg: 'Kuch Gunjaish', state: 'COLLECT_NAME', expect: 'NOT name', desc: '#464 Kuch Gunjaish' },
  { msg: 'Kitne ka hai', state: 'COLLECT_NAME', expect: 'NOT name', desc: '#467 Kitne ka hai' },
  { msg: 'Tobha H', state: 'COLLECT_NAME', expect: 'NOT name', desc: '#472 Tobha H' },
  { msg: 'Don G Bhai', state: 'COLLECT_NAME', expect: 'NOT name', desc: '#475 Don G Bhai' },
  { msg: 'Bata Diya', state: 'COLLECT_NAME', expect: 'NOT name', desc: '#479 Bata Diya' },
  { msg: 'Yes Ok', state: 'PRODUCT_INQUIRY', expect: 'NOT name', desc: '#519 Yes Ok' },
  { msg: 'Name Arshad Luck', state: 'COLLECT_NAME', expect: 'name=Arshad', desc: '#487 Name prefix' },
  // Should STILL be captured as names (real names)
  { msg: 'Shazia Gull', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Shazia Gull' },
  { msg: 'Asim Riaz', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Asim Riaz' },
  { msg: 'Waqar Tahir', state: 'PRODUCT_INQUIRY', expect: 'name', desc: 'Real name Waqar Tahir PI' },
  { msg: 'Danish', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Danish' },
  { msg: 'Saddam Hussain', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Saddam Hussain' },
  { msg: 'Paras Shah', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Paras Shah' },
  { msg: 'Misri Khan', state: 'COLLECT_NAME', expect: 'name', desc: 'Real name Misri Khan' },
];

const product = { id: 6, short: 'Vegetable Cutter', price: 2099 };
const collected = { product: 'Vegetable Cutter', name: null, phone: null, city: null, address: null, address_parts: {} };

let pass = 0, fail = 0;
for (const t of tests) {
  const state = { current: t.state, product, collected: { ...collected } };
  const result = preCheck.preCheck(t.msg, t.state, state.collected, state, '923001234567');
  const isName = result && (result.intent === 'name_given' || result.intent === 'name_in_product_inquiry');
  const extractedName = result?.extracted?.name || '';

  let ok = false;
  if (t.expect === 'NOT name') ok = !isName;
  else if (t.expect === 'name') ok = isName;
  else if (t.expect.startsWith('name=')) ok = isName && extractedName.includes(t.expect.split('=')[1]);

  const status = ok ? 'PASS' : 'FAIL';
  if (ok) pass++; else fail++;
  console.log(`[${status}] ${t.desc}: intent=${result?.intent || 'null'} name="${extractedName}" (expected: ${t.expect})`);
}
console.log(`\n${pass}/${tests.length} passed, ${fail} failed`);
