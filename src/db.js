const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    product_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    discord_handle TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title TEXT,
    body TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_ip ON reviews(ip_hash, product_id);

  CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY,
    product_id TEXT NOT NULL,
    email TEXT NOT NULL,
    threshold_pct REAL DEFAULT 5.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_notified DATETIME,
    active INTEGER DEFAULT 1,
    unsubscribe_token TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_product ON price_alerts(product_id, active);
  CREATE INDEX IF NOT EXISTS idx_alerts_token ON price_alerts(unsubscribe_token);

  CREATE TABLE IF NOT EXISTS image_cache (
    asin TEXT PRIMARY KEY,
    image_url TEXT NOT NULL,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

function initDB(dbPath) {
  const defaultPath = dbPath || path.join(__dirname, '..', 'data', 'ncmesh.db');
  const db = new Database(defaultPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { initDB };
