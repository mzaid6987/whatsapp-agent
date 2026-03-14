const data = require('./tmp_prod_convs.json');
const done = new Set([551,557,519,579,538,593,592,233,455,472,81,309,133,350,238,266,479,183,396,345,330,374,235,292,109,589,518,393,228,36,563,432,259,299,347,368,131,221,604,602,601,598,487,594,475,586,477,582,132,116,38,444,379,317,118,86,307,181,544,506,126,503,399,389,286,125,184,346,343,171,439,391,364,344,272,342,290,281,164,74,409,353,509,403,351,208,129,176]);
const remaining = data.filter(c => c.message_count >= 3 && !done.has(c.id)).sort((a,b) => b.message_count - a.message_count);
console.log('Remaining meaningful:', remaining.length);
const batch = remaining.slice(0, 10);
batch.forEach(c => console.log('ID:', c.id, '| msgs:', c.message_count));
console.log('\nIDs:', batch.map(c => c.id).join(','));
