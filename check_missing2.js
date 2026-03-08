const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('./data/agent.db');
  const db = new SQL.Database(buf);

  // Check complaint template
  const complaint = db.exec("SELECT m.content, c.state, c.product_id, m.source FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content LIKE '%03701337838%' LIMIT 5");
  if (complaint.length) {
    console.log('=== COMPLAINT TEMPLATE (03701337838) ===');
    complaint[0].values.forEach(r => {
      console.log('State:', r[1], '| Product:', r[2], '| Source:', r[3]);
      console.log('Body:', r[0]?.substring(0, 250));
    });
  } else {
    console.log('No messages found with 03701337838 in local DB');
  }

  // Check conversation states without templates
  const states = db.exec('SELECT DISTINCT state FROM conversations ORDER BY state');
  const tplStates = db.exec('SELECT DISTINCT state FROM auto_templates');
  const tplSet = new Set(tplStates.length ? tplStates[0].values.map(r => r[0]) : []);

  console.log('\n=== ALL CONVERSATION STATES ===');
  if (states.length) {
    states[0].values.forEach(r => {
      const has = tplSet.has(r[0]) ? 'HAS templates' : 'NO templates';
      console.log(` ${r[0]}: ${has}`);
    });
  }

  // Check hardcoded template responses in the hybrid system
  // Count AI responses per state that are NOT in auto_templates
  const aiByState = db.exec(`
    SELECT c.state, c.product_id, COUNT(DISTINCT m.content) as unique_responses, COUNT(*) as total
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'outgoing'
      AND m.source = 'ai'
      AND m.content IS NOT NULL
      AND length(m.content) > 15
    GROUP BY c.state
    ORDER BY unique_responses DESC
  `);

  console.log('\n=== AI RESPONSES PER STATE ===');
  if (aiByState.length) {
    aiByState[0].values.forEach(r => {
      console.log(` ${r[0]}: ${r[2]} unique responses (${r[3]} total)`);
    });
  }

  // Find the complaint/needs_human responses
  const humanNeeded = db.exec(`
    SELECT m.content, c.state, m.source
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE (m.content LIKE '%agent%' OR m.content LIKE '%complaint%' OR m.content LIKE '%03701%')
      AND m.direction = 'outgoing'
    GROUP BY m.content
    LIMIT 20
  `);

  console.log('\n=== AGENT/COMPLAINT RESPONSES ===');
  if (humanNeeded.length) {
    humanNeeded[0].values.forEach(r => {
      console.log(` [${r[1]}] (${r[2]}): ${r[0]?.substring(0, 150)}`);
    });
  }
})();
