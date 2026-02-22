const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Use random ports and test env
process.env.PORT = '0';
process.env.HEALTH_PORT = '0';
process.env.NODE_ENV = 'test';
const TEST_DB_PATH = path.join(__dirname, 'test-alerts.db');
process.env.DB_PATH = TEST_DB_PATH;

// Clear require cache so modules pick up new env vars
delete require.cache[require.resolve('../src/server')];
delete require.cache[require.resolve('../src/db')];

const { start } = require('../src/server');

/**
 * Helper to make HTTP requests (supports GET and POST with JSON body).
 */
function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {}
    };

    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Price Alerts API', () => {
  let appServer;
  let healthServer;
  let port;

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
  });

  after(() => {
    if (appServer) appServer.close();
    if (healthServer) healthServer.close();
    // Clean up test database
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('POST /api/alerts creates an alert and returns 201 with id and unsubscribe_token', async () => {
    const res = await request(port, 'POST', '/api/alerts', {
      product_id: 'B0TEST001',
      email: 'test@example.com',
      threshold_pct: 10.0
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.ok(res.body.id > 0, 'id should be a positive integer');
    assert.equal(typeof res.body.unsubscribe_token, 'string');
    assert.equal(res.body.unsubscribe_token.length, 32, 'token should be 32 hex chars');
  });

  it('POST /api/alerts uses default threshold_pct of 5.0 when not provided', async () => {
    const res = await request(port, 'POST', '/api/alerts', {
      product_id: 'B0TEST002',
      email: 'default@example.com'
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.equal(typeof res.body.unsubscribe_token, 'string');
  });

  it('POST /api/alerts returns 400 when product_id is missing', async () => {
    const res = await request(port, 'POST', '/api/alerts', {
      email: 'test@example.com'
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('product_id'));
  });

  it('POST /api/alerts returns 400 when email is missing', async () => {
    const res = await request(port, 'POST', '/api/alerts', {
      product_id: 'B0TEST003'
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('email'));
  });

  it('POST /api/alerts returns 400 for invalid email (no @ or .)', async () => {
    const res = await request(port, 'POST', '/api/alerts', {
      product_id: 'B0TEST004',
      email: 'not-an-email'
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('email'), 'error should mention email');
  });

  it('GET /api/alerts/unsubscribe/:token returns 200 for valid token', async () => {
    // First create an alert to get a valid token
    const createRes = await request(port, 'POST', '/api/alerts', {
      product_id: 'B0UNSUB01',
      email: 'unsub@example.com'
    });
    assert.equal(createRes.status, 201);
    const { unsubscribe_token } = createRes.body;

    // Now unsubscribe
    const res = await request(port, 'GET', `/api/alerts/unsubscribe/${unsubscribe_token}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.message.includes('Unsubscribed'));
  });

  it('GET /api/alerts/unsubscribe/:token returns 404 for invalid token', async () => {
    const res = await request(port, 'GET', '/api/alerts/unsubscribe/deadbeefdeadbeefdeadbeefdeadbeef');

    assert.equal(res.status, 404);
    assert.ok(res.body.error.includes('not found'));
  });
});
