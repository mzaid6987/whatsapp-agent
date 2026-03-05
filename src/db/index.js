/**
 * SQLite database connection + initialization
 */
const Database = require('better-sqlite3');
const path = require('path');
const { SCHEMA } = require('./schema');

const DB_PATH = path.join(__dirname, '../../data/agent.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

function initDb() {
  const conn = getDb();
  // Run schema (all IF NOT EXISTS — safe to re-run)
  conn.exec(SCHEMA);
  // Migrations — add columns if missing
  try { conn.exec('ALTER TABLE conversations ADD COLUMN spam_flag INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
  try { conn.exec('ALTER TABLE messages ADD COLUMN debug_json TEXT'); } catch (e) { /* already exists */ }
  try { conn.exec('ALTER TABLE messages ADD COLUMN admin_feedback TEXT'); } catch (e) { /* already exists */ }
  try { conn.exec('ALTER TABLE conversations ADD COLUMN admin_unread INTEGER DEFAULT 1'); } catch (e) { /* already exists */ }
  try { conn.exec('ALTER TABLE messages ADD COLUMN wa_message_id TEXT'); } catch (e) { /* already exists */ }
  try { conn.exec('ALTER TABLE messages ADD COLUMN wa_status TEXT DEFAULT \'sent\''); } catch (e) { /* already exists */ }
  try { conn.exec('CREATE INDEX IF NOT EXISTS idx_msg_waid ON messages(wa_message_id)'); } catch (e) { /* already exists */ }
  console.log('[DB] SQLite initialized at', DB_PATH);
  return conn;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, initDb, closeDb };
