const path = require('path');
const db = require(path.join(__dirname, 'src/database'));

async function count() {
  const total = await db.get('SELECT COUNT(*) as c FROM conversations');
  const meaningful = await db.get(`
    SELECT COUNT(*) as c FROM conversations 
    WHERE id IN (SELECT conversation_id FROM messages GROUP BY conversation_id HAVING COUNT(*) >= 3)
  `);
  const latest = await db.get('SELECT MAX(created_at) as d FROM messages');
  
  console.log('Total conversations:', total.c);
  console.log('Meaningful (3+ msgs):', meaningful.c);
  console.log('Latest message:', latest.d);
  console.log('Analyzed so far: 118');
  console.log('Remaining:', meaningful.c - 118);
}
count();
