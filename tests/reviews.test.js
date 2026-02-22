const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Use random ports and test env
process.env.PORT = '0';
process.env.HEALTH_PORT = '0';
process.env.NODE_ENV = 'test';
const TEST_DB_PATH = path.join(__dirname, 'test-reviews.db');
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

describe('Reviews API', () => {
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

  it('POST /api/reviews creates a review and returns 201 with id', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST001',
      display_name: 'TestUser',
      discord_handle: 'testuser#1234',
      rating: 5,
      title: 'Excellent product',
      body: 'Works great on the mesh network.'
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.ok(res.body.id > 0, 'id should be a positive integer');
  });

  it('GET /api/reviews/:productId returns reviews with average_rating and total', async () => {
    // Submit a second review for the same product to have meaningful averages
    await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST002',
      display_name: 'User1',
      rating: 4,
      body: 'Pretty good.'
    });

    const res = await request(port, 'GET', '/api/reviews/B0TEST002');

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.reviews), 'reviews should be an array');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.average_rating, 4);
    assert.equal(res.body.reviews[0].display_name, 'User1');
    assert.equal(res.body.reviews[0].rating, 4);
    assert.equal(res.body.reviews[0].body, 'Pretty good.');
  });

  it('GET /api/reviews/:productId returns empty list for unknown product', async () => {
    const res = await request(port, 'GET', '/api/reviews/NONEXISTENT');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reviews, []);
    assert.equal(res.body.average_rating, null);
    assert.equal(res.body.total, 0);
  });

  it('POST /api/reviews rejects missing required fields with 400', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST003'
      // missing display_name, rating, body
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Missing required fields'));
  });

  it('POST /api/reviews rejects invalid rating with 400', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST004',
      display_name: 'BadRating',
      rating: 10,
      body: 'This rating is too high.'
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Rating must be 1-5'));
  });

  it('POST /api/reviews rejects rating of 0 with 400', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST005',
      display_name: 'ZeroRating',
      rating: 0,
      body: 'This rating is too low.'
    });

    // rating=0 is falsy, so it's caught by the required-fields check
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Missing required fields') || res.body.error.includes('Rating must be 1-5'));
  });

  it('POST /api/reviews rejects string rating with 400', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'B0TEST006',
      display_name: 'StringRating',
      rating: 'five',
      body: 'This rating is not a number.'
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Rating must be 1-5'));
  });
});
