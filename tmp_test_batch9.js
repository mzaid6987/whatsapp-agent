const { preCheck } = require('./src/hybrid/pre-check');
const { handleTemplateState } = require('./src/hybrid/state-machine');

// Test nhe with proper collected data
const collected = { name: 'Test', phone: '0300', city: 'Karachi', address: 'Test addr' };
const r1 = preCheck('Nhe sai address', 'ORDER_SUMMARY', collected);
console.log('nhe sai address (ORDER_SUMMARY):', r1 ? r1.intent : 'null');

// Test address_enough vs delivery time
const r2 = preCheck('kab tak aayega', 'COLLECT_ADDRESS', { address_parts: { area: 'Test' } });
console.log('kab tak aayega (COLLECT_ADDRESS):', r2 ? r2.intent : 'null');
const r3 = preCheck('bas yehi address hai', 'COLLECT_ADDRESS', { address_parts: { area: 'Test' } });
console.log('bas yehi address hai (COLLECT_ADDRESS):', r3 ? r3.intent : 'null');

// Test rider call in address
const r4 = preCheck('Aap Rider ko bolna call kar lena', 'COLLECT_ADDRESS', {});
console.log('rider ko call kar lena (COLLECT_ADDRESS):', r4 ? r4.intent : 'null');
const r5 = preCheck('call karo', 'IDLE', {});
console.log('call karo (IDLE):', r5 ? r5.intent : 'null');

// Test Urdu connector as name
const r6 = preCheck('Rani ke bachon', 'COLLECT_NAME', {});
console.log('Rani ke bachon (COLLECT_NAME):', r6 ? r6.intent : 'null');
const r7 = preCheck('Ali Khan', 'COLLECT_NAME', {});
console.log('Ali Khan (COLLECT_NAME):', r7 ? r7.intent : 'null');

// Test Sure in flexYes
const state = { collected: { name: 'Test', phone: '0300' }, _active_product: { name: 'Test', price: 100 } };
const r8 = handleTemplateState('Sure', 'UPSELL_HOOK', state, 'store');
console.log('Sure in UPSELL_HOOK state:', r8 ? r8.state : 'null');
