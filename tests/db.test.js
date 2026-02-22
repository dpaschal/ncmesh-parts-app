const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { initDB } = require('../src/db');

const TEST_DB_PATH = path.join(__dirname, 'test-ncmesh.db');

describe('Database Module', () => {
  let db;

  before(() => {
    // Remove any leftover test DB
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    db = initDB(TEST_DB_PATH);
  });

  after(() => {
    if (db) db.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  describe('Schema', () => {
    it('reviews table exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'"
      ).get();
      assert.ok(row, 'reviews table should exist');
      assert.equal(row.name, 'reviews');
    });

    it('price_alerts table exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='price_alerts'"
      ).get();
      assert.ok(row, 'price_alerts table should exist');
      assert.equal(row.name, 'price_alerts');
    });

    it('image_cache table exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='image_cache'"
      ).get();
      assert.ok(row, 'image_cache table should exist');
      assert.equal(row.name, 'image_cache');
    });
  });

  describe('Reviews', () => {
    it('can insert and retrieve a review', () => {
      const info = db.prepare(`
        INSERT INTO reviews (product_id, display_name, discord_handle, rating, title, body, ip_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('B0TEST123', 'Alice', 'alice#1234', 4, 'Great radio', 'Works perfectly on ncmesh.', 'abc123hash');

      assert.equal(info.changes, 1);

      const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
      assert.equal(review.product_id, 'B0TEST123');
      assert.equal(review.display_name, 'Alice');
      assert.equal(review.discord_handle, 'alice#1234');
      assert.equal(review.rating, 4);
      assert.equal(review.title, 'Great radio');
      assert.equal(review.body, 'Works perfectly on ncmesh.');
      assert.equal(review.ip_hash, 'abc123hash');
      assert.equal(review.approved, 1);
      assert.ok(review.created_at, 'created_at should be set');
    });

    it('rating CHECK constraint enforces 1-5 range (too low)', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO reviews (product_id, display_name, rating, body, ip_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run('B0TEST123', 'Bob', 0, 'Bad rating', 'hash1');
      }, /CHECK constraint failed/);
    });

    it('rating CHECK constraint enforces 1-5 range (too high)', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO reviews (product_id, display_name, rating, body, ip_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run('B0TEST123', 'Bob', 6, 'Bad rating', 'hash2');
      }, /CHECK constraint failed/);
    });
  });

  describe('Price Alerts', () => {
    it('can insert and retrieve a price alert with defaults', () => {
      const info = db.prepare(`
        INSERT INTO price_alerts (product_id, email, unsubscribe_token)
        VALUES (?, ?, ?)
      `).run('B0ALERT456', 'user@example.com', 'tok-abc-123');

      assert.equal(info.changes, 1);

      const alert = db.prepare('SELECT * FROM price_alerts WHERE id = ?').get(info.lastInsertRowid);
      assert.equal(alert.product_id, 'B0ALERT456');
      assert.equal(alert.email, 'user@example.com');
      assert.equal(alert.threshold_pct, 5.0);
      assert.equal(alert.active, 1);
      assert.equal(alert.unsubscribe_token, 'tok-abc-123');
      assert.equal(alert.last_notified, null);
      assert.ok(alert.created_at, 'created_at should be set');
    });
  });

  describe('Image Cache', () => {
    it('can insert and retrieve an image cache entry', () => {
      db.prepare(`
        INSERT INTO image_cache (asin, image_url) VALUES (?, ?)
      `).run('B0CACHE789', 'https://images-na.ssl-images-amazon.com/images/I/test.jpg');

      const entry = db.prepare('SELECT * FROM image_cache WHERE asin = ?').get('B0CACHE789');
      assert.equal(entry.asin, 'B0CACHE789');
      assert.equal(entry.image_url, 'https://images-na.ssl-images-amazon.com/images/I/test.jpg');
      assert.ok(entry.cached_at, 'cached_at should be set');
    });
  });
});
