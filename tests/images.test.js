const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Use random ports and test env
process.env.PORT = '0';
process.env.HEALTH_PORT = '0';
process.env.NODE_ENV = 'test';
const TEST_DB_PATH = path.join(__dirname, 'test-images.db');
process.env.DB_PATH = TEST_DB_PATH;

// Clear require cache so modules pick up new env vars
delete require.cache[require.resolve('../src/server')];
delete require.cache[require.resolve('../src/db')];

const { start } = require('../src/server');
const { initDB } = require('../src/db');

/**
 * Helper to make HTTP requests. Does NOT follow redirects so we can assert
 * the redirect Location header.
 */
function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Amazon Image Proxy', () => {
  let appServer;
  let healthServer;
  let port;
  let db;

  before(async () => {
    // Clean up any leftover test DB
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    const servers = await start();
    appServer = servers.app;
    healthServer = servers.health;
    port = appServer.address().port;
    // Open a separate DB handle to seed test data
    db = initDB(TEST_DB_PATH);
  });

  after(() => {
    if (db) db.close();
    if (appServer) appServer.close();
    if (healthServer) healthServer.close();
    // Clean up test database
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('redirects to cached image URL when cache hit exists', async () => {
    const asin = 'B0CACHED01';
    const cachedUrl = 'https://m.media-amazon.com/images/I/test-cached.jpg';

    // Seed the cache
    db.prepare(
      'INSERT OR REPLACE INTO image_cache (asin, image_url, cached_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(asin, cachedUrl);

    const res = await request(port, 'GET', `/api/images/${asin}`);

    assert.equal(res.status, 302, 'should redirect');
    assert.equal(res.headers.location, cachedUrl, 'should redirect to cached URL');
  });

  it('redirects to placeholder for invalid ASIN format (special characters)', async () => {
    const res = await request(port, 'GET', '/api/images/invalid!xx');

    assert.equal(res.status, 302, 'should redirect');
    assert.ok(res.headers.location.includes('/img/placeholder.svg'), 'should redirect to placeholder');
  });

  it('redirects to placeholder for ASIN that is too short', async () => {
    const res = await request(port, 'GET', '/api/images/B0SHORT');

    assert.equal(res.status, 302, 'should redirect');
    assert.ok(res.headers.location.includes('/img/placeholder.svg'), 'should redirect to placeholder');
  });

  it('redirects to placeholder for ASIN that is too long', async () => {
    const res = await request(port, 'GET', '/api/images/B0TOOLONG1234');

    assert.equal(res.status, 302, 'should redirect');
    assert.ok(res.headers.location.includes('/img/placeholder.svg'), 'should redirect to placeholder');
  });

  it('falls back to placeholder when Amazon fetch fails (no network in tests)', async () => {
    // Valid ASIN format but not in cache — will try to fetch Amazon, which
    // should fail or return no usable image in a test environment
    const res = await request(port, 'GET', '/api/images/B0NOTCACHD');

    assert.equal(res.status, 302, 'should redirect');
    assert.ok(res.headers.location.includes('/img/placeholder.svg'), 'should fall back to placeholder');
  });

  it('does not use expired cache entries (older than 24h)', async () => {
    const asin = 'B0EXPIRED1';
    const expiredUrl = 'https://m.media-amazon.com/images/I/expired.jpg';

    // Insert a cache entry with a timestamp > 24h ago
    db.prepare(
      "INSERT OR REPLACE INTO image_cache (asin, image_url, cached_at) VALUES (?, ?, datetime('now', '-2 days'))"
    ).run(asin, expiredUrl);

    const res = await request(port, 'GET', `/api/images/${asin}`);

    assert.equal(res.status, 302, 'should redirect');
    // Should NOT redirect to the expired URL — should fall back to placeholder
    // (Amazon fetch will fail in test env)
    assert.ok(
      res.headers.location.includes('/img/placeholder.svg'),
      'should not use expired cache, should fall back to placeholder'
    );
  });
});
