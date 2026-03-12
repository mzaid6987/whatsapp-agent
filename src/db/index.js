/**
 * SQLite database via sql.js (pure JS — no native modules needed)
 * Wraps sql.js to provide better-sqlite3-compatible API
 */
// Use ASM.js (pure JS) instead of WASM to avoid Out-of-memory on shared hosting restarts
const initSqlJs = require('sql.js/dist/sql-asm.js');
const fs = require('fs');
const path = require('path');
const { SCHEMA } = require('./schema');

const DB_PATH = path.join(__dirname, '../../data/agent.db');
const DATA_DIR = path.join(__dirname, '../../data');

let db = null;
let rawDb = null;
let saveTimer = null;

// Auto-save to disk every 2 seconds after changes
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (rawDb) {
      try {
        const data = rawDb.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch (e) {
        console.error('[DB] Save error:', e.message);
      }
    }
  }, 2000);
}

// Force save now
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (rawDb) {
    const data = rawDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

/**
 * Statement wrapper — mimics better-sqlite3's prepare() return
 */
class StatementWrapper {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  run(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    this.database.run(this.sql, flatParams.length > 0 ? flatParams : undefined);
    scheduleSave();
    const info = {
      changes: this.database.getRowsModified(),
      lastInsertRowid: 0
    };
    try {
      const r = this.database.exec('SELECT last_insert_rowid() as id');
      if (r.length > 0 && r[0].values.length > 0) {
        info.lastInsertRowid = r[0].values[0][0];
      }
    } catch (e) {}
    return info;
  }

  get(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      const stmt = this.database.prepare(this.sql);
      if (flatParams.length > 0) stmt.bind(flatParams);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach((c, i) => row[c] = vals[i]);
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) {
      throw e;
    }
  }

  all(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      const results = this.database.exec(this.sql, flatParams.length > 0 ? flatParams : undefined);
      if (results.length === 0) return [];
      const cols = results[0].columns;
      return results[0].values.map(vals => {
        const row = {};
        cols.forEach((c, i) => row[c] = vals[i]);
        return row;
      });
    } catch (e) {
      throw e;
    }
  }
}

/**
 * Database wrapper — mimics better-sqlite3 instance
 */
class DatabaseWrapper {
  constructor(sqlDb) {
    this.sqlDb = sqlDb;
  }

  prepare(sql) {
    return new StatementWrapper(this.sqlDb, sql);
  }

  exec(sql) {
    this.sqlDb.run(sql);
    scheduleSave();
  }

  pragma(str) {
    try {
      this.sqlDb.run('PRAGMA ' + str);
    } catch (e) { /* ignore pragma errors */ }
  }

  transaction(fn) {
    return (...args) => {
      this.sqlDb.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        this.sqlDb.run('COMMIT');
        scheduleSave();
        return result;
      } catch (e) {
        this.sqlDb.run('ROLLBACK');
        throw e;
      }
    };
  }

  close() {
    saveNow();
    this.sqlDb.close();
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call await initDb() first.');
  }
  return db;
}

async function initDb() {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    rawDb = new SQL.Database(buffer);
  } else {
    rawDb = new SQL.Database();
  }

  db = new DatabaseWrapper(rawDb);
  db.pragma('foreign_keys = ON');

  // Run schema
  db.exec(SCHEMA);

  // Migrations
  try { db.exec('ALTER TABLE conversations ADD COLUMN spam_flag INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN debug_json TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN admin_feedback TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE conversations ADD COLUMN admin_unread INTEGER DEFAULT 1'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN wa_message_id TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN wa_status TEXT DEFAULT \'sent\''); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_msg_waid ON messages(wa_message_id)'); } catch (e) {}
  try { db.exec('ALTER TABLE auto_templates ADD COLUMN is_active INTEGER DEFAULT 1'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN media_type TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN media_url TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE conversations ADD COLUMN gift_card_flag INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE conversations ADD COLUMN voice_msg_flag INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE conversations ADD COLUMN address_incomplete INTEGER DEFAULT 0'); } catch (e) {}

  console.log('[DB] SQLite (sql.js) initialized at', DB_PATH);
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
    rawDb = null;
  }
}

module.exports = { getDb, initDb, closeDb };
