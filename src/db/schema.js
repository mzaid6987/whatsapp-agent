/**
 * SQLite schema — all CREATE TABLE statements
 */

const SCHEMA = `
-- Customers (one per phone number)
CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT,
  gender          TEXT CHECK(gender IN ('male','female','unknown')) DEFAULT 'unknown',
  city            TEXT,
  last_address    TEXT,
  total_orders    INTEGER DEFAULT 0,
  total_spent     INTEGER DEFAULT 0,
  is_blocked      INTEGER DEFAULT 0,
  needs_human     INTEGER DEFAULT 0,
  notes           TEXT,
  first_seen_at   TEXT DEFAULT (datetime('now','localtime')),
  last_active_at  TEXT DEFAULT (datetime('now','localtime')),
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Conversations (multiple per customer, 24h session window)
CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  store_name      TEXT DEFAULT 'nureva',
  state           TEXT DEFAULT 'IDLE',
  product_id      INTEGER,
  product_json    TEXT,
  products_json   TEXT DEFAULT '[]',
  collected_json  TEXT DEFAULT '{}',
  haggle_round    INTEGER DEFAULT 0,
  discount_percent INTEGER DEFAULT 0,
  upsell_json     TEXT DEFAULT '[]',
  unknown_count   INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  needs_human     INTEGER DEFAULT 0,
  complaint_flag  INTEGER DEFAULT 0,
  admin_unread    INTEGER DEFAULT 1,
  last_message    TEXT,
  last_message_at TEXT,
  message_count   INTEGER DEFAULT 0,
  ai_tokens_used  INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_conv_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conv_active ON conversations(is_active, last_message_at);

-- Messages (every message logged)
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  direction       TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
  sender          TEXT NOT NULL CHECK(sender IN ('customer','bot','human')),
  content         TEXT NOT NULL,
  intent          TEXT,
  source          TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  response_ms     INTEGER DEFAULT 0,
  wa_message_id   TEXT,
  wa_status       TEXT DEFAULT 'sent' CHECK(wa_status IN ('sent','delivered','read')),
  debug_json      TEXT,
  admin_feedback  TEXT,
  created_at      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL UNIQUE,
  conversation_id INTEGER REFERENCES conversations(id),
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  store_name      TEXT DEFAULT 'nureva',
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  delivery_phone  TEXT,
  customer_city   TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items_json      TEXT NOT NULL,
  subtotal        INTEGER NOT NULL,
  delivery_fee    INTEGER DEFAULT 0,
  discount_percent INTEGER DEFAULT 0,
  discount_total  INTEGER DEFAULT 0,
  grand_total     INTEGER NOT NULL,
  status          TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed','processing','shipped','delivered','returned','cancelled')),
  source          TEXT DEFAULT 'bot',
  portal_synced   INTEGER DEFAULT 0,
  portal_response TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  price           INTEGER NOT NULL,
  upsell_price    INTEGER,
  keywords        TEXT NOT NULL,
  feature_1       TEXT,
  feature_2       TEXT,
  upsell_with     TEXT DEFAULT '[]',
  is_active       INTEGER DEFAULT 1,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

-- Stores
CREATE TABLE IF NOT EXISTS stores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  brand_name      TEXT NOT NULL,
  order_prefix    TEXT NOT NULL,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now','localtime'))
);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

-- Response cache
CREATE TABLE IF NOT EXISTS response_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key       TEXT NOT NULL UNIQUE,
  intent          TEXT NOT NULL,
  state           TEXT NOT NULL,
  product_id      INTEGER,
  response_text   TEXT NOT NULL,
  variables_json  TEXT,
  hit_count       INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  last_used_at    TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_cache_key ON response_cache(cache_key);

-- Auto-learned templates (Sonnet patterns saved for reuse)
CREATE TABLE IF NOT EXISTS auto_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  state           TEXT NOT NULL,
  product_id      INTEGER,
  keywords        TEXT NOT NULL,
  response        TEXT NOT NULL,
  times_seen      INTEGER DEFAULT 1,
  times_used      INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  last_used_at    TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_auto_tpl_state ON auto_templates(state, product_id);

CREATE TABLE IF NOT EXISTS processed_webhooks (
  message_id      TEXT PRIMARY KEY,
  created_at      TEXT DEFAULT (datetime('now','localtime'))
);
`;

module.exports = { SCHEMA };
