const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('./data/agent.db');
  const db = new SQL.Database(buf);

  // Get all existing template responses (normalized)
  const templates = db.exec('SELECT response FROM auto_templates');
  const existingResponses = new Set();
  if (templates.length) {
    templates[0].values.forEach(r => {
      if (r[0]) existingResponses.add(r[0].trim().toLowerCase().substring(0, 80));
    });
  }
  console.log('Existing templates:', existingResponses.size);

  // Find all unique bot/AI outgoing messages with their conversation context
  const msgs = db.exec(`
    SELECT m.content, c.state, c.product_id, COUNT(*) as cnt
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'outgoing'
      AND m.source IN ('ai', 'template', 'bot')
      AND m.content IS NOT NULL
      AND length(m.content) > 15
    GROUP BY m.content
    ORDER BY cnt DESC
  `);

  console.log('\n=== BOT RESPONSES NOT IN TEMPLATES ===\n');
  let missing = 0;
  if (msgs.length) {
    msgs[0].values.forEach(r => {
      const [body, state, productId, count] = r;
      const key = body.trim().toLowerCase().substring(0, 80);
      if (!existingResponses.has(key)) {
        missing++;
        console.log(`#${missing} [${state}] (product:${productId || 'none'}) x${count}`);
        console.log(`  "${body.substring(0, 150)}"`);
        console.log('');
      }
    });
  }
  console.log('Total missing responses:', missing);
  console.log('Total existing templates:', existingResponses.size);

  // Also check: the specific complaint template user mentioned
  const complaint = db.exec(`
    SELECT m.content, c.state, c.product_id, m.source
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.content LIKE '%03701337838%'
    LIMIT 5
  `);
  if (complaint.length) {
    console.log('\n=== COMPLAINT TEMPLATE (03701337838) ===');
    complaint[0].values.forEach(r => {
      console.log('State:', r[1], '| Product:', r[2], '| Source:', r[3]);
      console.log('Body:', r[0]?.substring(0, 200));
    });
  }
})();
