const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Use random ports and test env
process.env.PORT = '0';
process.env.HEALTH_PORT = '0';
process.env.NODE_ENV = 'test';
// Use a temp DB path so we don't clobber real data
const TEST_DB_PATH = path.join(__dirname, 'test-server.db');
process.env.DB_PATH = TEST_DB_PATH;

const { start } = require('../src/server');

/**
 * Simple helper to make HTTP GET requests.
 */
function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
  });
}

describe('Server', () => {
  let appServer;
  let healthServer;
  let appPort;
  let healthPort;

  before(async () => {
    const servers = await start();
    appServer = servers.app;
    healthServer = servers.health;
    appPort = appServer.address().port;
    healthPort = healthServer.address().port;
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

  it('GET / returns 200 with HTML', async () => {
    const res = await get(appPort, '/');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'), 'Should return HTML');
    assert.ok(res.body.includes('NC Mesh'), 'HTML should contain app name');
  });

  it('GET /api/parts returns 200 with JSON object', async () => {
    const res = await get(appPort, '/api/parts');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('application/json'), 'Should return JSON');
    const data = JSON.parse(res.body);
    assert.equal(typeof data, 'object', 'Should return an object');
  });

  it('Health check returns {status: "ok"}', async () => {
    const res = await get(healthPort, '/health');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, 'ok');
    assert.ok(data.timestamp, 'Should have a timestamp');
  });
});
