const data = require('./tmp_prod_convs.json');
const done = new Set([551,557,519,579,538,593,592,233,455,472,81,309,133,350,238,266,479,183,396,345,330,374,235,292,109,589,518,393,228,36,563,432,259,299,347,368,131,221,604,602,601,598,487,594,475,586,477,582]);
const remaining = data.filter(c => c.message_count >= 3 && !done.has(c.id)).sort((a,b) => b.message_count - a.message_count);
console.log('Remaining meaningful:', remaining.length);
const batch = remaining.slice(0, 10);
batch.forEach(c => console.log('ID:', c.id, '| msgs:', c.message_count, '| phone:', c.customer_phone, '| state:', c.current_state));
console.log('\nIDs:', batch.map(c => c.id).join(','));
