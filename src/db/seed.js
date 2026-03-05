/**
 * Seed database with initial data from data.js
 */
const { getDb } = require('./index');

function seedProducts(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (count > 0) return; // Already seeded

  const PRODUCTS = [
    { id:1, name:'T9 Vintage Professional Trimmer', short:'T9 Trimmer', price:1299, kw:'t9,trimmer,shaver,hair cut,baal', f1:'Metal body trimmer hai', f2:'battery 90 min chalti hai', upsell:'[2,5]' },
    { id:2, name:'5-in-1 Blackhead Remover', short:'Blackhead Remover', price:1700, kw:'blackhead,pore,acne,face clean,black head', f1:'5 heads hain har type ki skin ke liye', f2:'USB rechargeable hai', upsell:'[7,1]' },
    { id:3, name:'Wooden Cutting Board Set', short:'Cutting Board', price:1499, kw:'cutting board,chopping,wooden board', f1:'Stainless steel ka hai', f2:'scratch proof aur easy to clean', upsell:'[6,4]' },
    { id:4, name:'Oil Spray Bottle', short:'Oil Spray', price:599, kw:'oil spray,spray bottle,cooking spray', f1:'Glass body hai, mist spray karta hai', f2:'cooking mein oil kam lagta hai', upsell:'[3,6]' },
    { id:5, name:'Ear Wax Cleaning Kit', short:'Ear Wax Kit', price:899, kw:'ear,wax,ear clean,kaan', f1:'Stainless steel ke 6 tools hain', f2:'Buy 1 Get 1 Free — 2 sets milein ge', upsell:'[1,7]' },
    { id:6, name:'Electric Vegetable Cutter 4-in-1', short:'Vegetable Cutter', price:2099, kw:'vegetable,cutter,chopper,slicer,sabzi', f1:'4-in-1 hai — sabzi, pyaaz, garlic sab kaat ta hai', f2:'USB rechargeable hai', upsell:'[3,4]' },
    { id:7, name:'2-in-1 Facial Hair Remover', short:'Facial Hair Remover', price:1299, kw:'facial,eyebrow,face hair,hair remover,brow,face remover', f1:'Chehre ke baal aur eyebrows dono ke liye', f2:'painless hai aur rechargeable', upsell:'[2]' },
    { id:8, name:'Portable Nebulizer Machine', short:'Nebulizer', price:1999, kw:'nebulizer,inhaler,breathing,saans', f1:'Silent operation hai, bachy bhi use kar sakte hain', f2:'portable hai USB se charge hota hai', upsell:'[]' },
    { id:9, name:'Knee Support Sleeve', short:'Knee Sleeve', price:999, kw:'knee,sleeve,support,joint,ghutna', f1:'Breathable lycra material hai', f2:'Buy 1 Get 1 Free — dono knees cover', upsell:'[]' },
    { id:10, name:'Grey Duster Cleaning Kit', short:'Duster Kit', price:1150, kw:'duster,cleaning kit,dust,safai', f1:'8 feet tak extend hota hai', f2:'washable microfiber head hai', upsell:'[3,6]' },
  ];

  const insert = db.prepare(`
    INSERT INTO products (id, name, short_name, price, keywords, feature_1, feature_2, upsell_with, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const p of PRODUCTS) {
      insert.run(p.id, p.name, p.short, p.price, p.kw, p.f1, p.f2, p.upsell, p.id);
    }
  });
  tx();
  console.log('[DB] Seeded', PRODUCTS.length, 'products');
}

function seedStores(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM stores').get().c;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO stores (name, brand_name, order_prefix) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    insert.run('nureva', 'Nureva', 'NRV');
    insert.run('shrine', 'Shrine Store', 'SHR');
  });
  tx();
  console.log('[DB] Seeded stores');
}

function seedSettings(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
  if (count > 0) return;

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    insert.run('bot_enabled', 'true');
    insert.run('claude_api_key', '');
    insert.run('max_discount_percent', '10');
    insert.run('haggle_rounds', '3');
    insert.run('session_timeout_hours', '24');
  });
  tx();
  console.log('[DB] Seeded settings');
}

function seedAll() {
  const db = getDb();
  seedProducts(db);
  seedStores(db);
  seedSettings(db);
}

module.exports = { seedAll };
