# NC Mesh Parts Page v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the NC Mesh parts page from a 40KB monolithic server.js into a static frontend + Express API with guided wizard, product cards, community reviews, comparison/wishlist, and price alerts.

**Architecture:** Vanilla HTML/CSS/JS frontend served as static files by a slim Express API backend. SQLite for reviews and alerts. Single container, deployed to forge K3s (primary) with Cloud Run failover via Cloudflare DNS.

**Tech Stack:** Node.js, Express 5, better-sqlite3, Resend (email), Cheerio (scraping), vanilla JS (no framework)

**Source of truth:** `/home/paschal/mnt/forge/ai/ncmesh-parts-app/`

**Design doc:** `docs/plans/2026-02-21-ncmesh-parts-redesign-design.md`

---

## Phase 1: Foundation

### Task 1: Project Structure + Dependencies

**Files:**
- Modify: `package.json`
- Create: `src/server.js` (new slim API server)
- Create: `src/db.js` (SQLite setup)
- Create: `src/routes/parts.js`
- Create: `src/routes/reviews.js`
- Create: `src/routes/alerts.js`
- Create: `src/routes/images.js`
- Create: `public/index.html` (empty shell)
- Create: `public/css/styles.css` (empty)
- Create: `public/js/app.js` (empty)

**Step 1: Create directory structure**

```bash
cd /home/paschal/mnt/forge/ai/ncmesh-parts-app
mkdir -p src/routes public/css public/js public/img data
```

**Step 2: Update package.json**

```json
{
  "name": "ncmesh-parts-app",
  "version": "2.0.0",
  "description": "NC Mesh Meshtastic parts catalog",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/**/*.test.js",
    "price-check": "node price-checker.js"
  },
  "type": "commonjs",
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cheerio": "^1.2.0",
    "csv-parse": "^6.1.0",
    "express": "^5.2.1",
    "express-rate-limit": "^8.2.1",
    "helmet": "^8.1.0",
    "node-fetch": "^3.3.2",
    "resend": "^4.0.0"
  },
  "devDependencies": {}
}
```

**Step 3: Install new dependencies**

Run: `npm install better-sqlite3 resend`
Expected: Package lock updated, node_modules updated

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold v2 project structure and add dependencies"
```

---

### Task 2: SQLite Database Module

**Files:**
- Create: `src/db.js`
- Create: `tests/db.test.js`

**Step 1: Write the failing test**

```javascript
// tests/db.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, 'test.db');

describe('Database', () => {
  let db;

  before(() => {
    // Clean up any previous test DB
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    const { initDB } = require('../src/db');
    db = initDB(TEST_DB);
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('creates reviews table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'").get();
    assert.ok(tables, 'reviews table should exist');
  });

  it('creates price_alerts table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='price_alerts'").get();
    assert.ok(tables, 'price_alerts table should exist');
  });

  it('creates image_cache table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='image_cache'").get();
    assert.ok(tables, 'image_cache table should exist');
  });

  it('inserts and retrieves a review', () => {
    const stmt = db.prepare(`INSERT INTO reviews (product_id, display_name, rating, body, ip_hash)
                             VALUES (?, ?, ?, ?, ?)`);
    stmt.run('test-product', 'TestUser', 5, 'Great product!', 'abc123hash');

    const review = db.prepare('SELECT * FROM reviews WHERE product_id = ?').get('test-product');
    assert.equal(review.display_name, 'TestUser');
    assert.equal(review.rating, 5);
    assert.equal(review.approved, 1); // auto-approved
  });

  it('enforces rating range 1-5', () => {
    const stmt = db.prepare(`INSERT INTO reviews (product_id, display_name, rating, body, ip_hash)
                             VALUES (?, ?, ?, ?, ?)`);
    assert.throws(() => stmt.run('x', 'User', 0, 'bad', 'hash'), /CHECK/);
    assert.throws(() => stmt.run('x', 'User', 6, 'bad', 'hash'), /CHECK/);
  });

  it('inserts and retrieves a price alert', () => {
    const stmt = db.prepare(`INSERT INTO price_alerts (product_id, email, unsubscribe_token)
                             VALUES (?, ?, ?)`);
    stmt.run('test-product', 'test@example.com', 'tok123');

    const alert = db.prepare('SELECT * FROM price_alerts WHERE product_id = ?').get('test-product');
    assert.equal(alert.email, 'test@example.com');
    assert.equal(alert.active, 1);
    assert.equal(alert.threshold_pct, 5.0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/paschal/mnt/forge/ai/ncmesh-parts-app && mkdir -p tests && node --test tests/db.test.js`
Expected: FAIL — `Cannot find module '../src/db'`

**Step 3: Write the implementation**

```javascript
// src/db.js
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

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  db.exec(SCHEMA);

  return db;
}

module.exports = { initDB };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/db.test.js`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: add SQLite database module with reviews, alerts, image_cache tables"
```

---

### Task 3: API Server Skeleton

**Files:**
- Create: `src/server.js`
- Create: `src/routes/parts.js`
- Create: `tests/server.test.js`

**Step 1: Write the failing test**

```javascript
// tests/server.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

describe('Server', () => {
  let server;

  before(async () => {
    // Use random ports for testing
    process.env.PORT = '0';
    process.env.HEALTH_PORT = '0';
    process.env.NODE_ENV = 'test';
    const { start } = require('../src/server');
    server = await start();
  });

  after(() => {
    server.app.close();
    server.health.close();
  });

  it('serves static index.html at /', async () => {
    const res = await get(server.app.address().port, '/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<!DOCTYPE html>'), 'Should serve HTML');
  });

  it('returns JSON from /api/parts', async () => {
    const res = await get(server.app.address().port, '/api/parts');
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object', 'Should return JSON object');
  });

  it('health check returns ok', async () => {
    const res = await get(server.health.address().port, '/health');
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.status, 'ok');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/server.test.js`
Expected: FAIL — `Cannot find module '../src/server'`

**Step 3: Write the parts route**

```javascript
// src/routes/parts.js
const { parse } = require('csv-parse/sync');

const GOOGLE_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6heV4SwmFTDup6g4DDCLd7mXE1nToDl0tEWqI9DDcY9Hb-Lpttml1iG7X2tdb5jbij4EnN1pUG-qQ/pub?output=csv';
const CACHE_TTL = 5 * 60 * 1000;
const AFFILIATE_TAG = 'dpaschal26-20';

const CATEGORIES = {
  'Node': { emoji: '📡', color: '#4CAF50' },
  'Antenna': { emoji: '📶', color: '#2196F3' },
  'Cable': { emoji: '🔌', color: '#FF9800' },
  'Adapter': { emoji: '🔗', color: '#9C27B0' },
  'Connector': { emoji: '🔗', color: '#9C27B0' },
  'Power': { emoji: '🔋', color: '#F44336' },
  'Enclosure': { emoji: '📦', color: '#795548' },
  'Mounting': { emoji: '🔩', color: '#607D8B' },
  'Hardware': { emoji: '🔧', color: '#607D8B' },
  'Radio': { emoji: '📻', color: '#E91E63' },
  'Tools': { emoji: '🛠️', color: '#FF5722' },
  'Electronics': { emoji: '⚡', color: '#FFEB3B' },
  'Network': { emoji: '🌐', color: '#00BCD4' },
  'Reference': { emoji: '📚', color: '#3F51B5' },
  'Emergency': { emoji: '🚨', color: '#F44336' },
  'Materials': { emoji: '🧱', color: '#8D6E63' },
  'Grounding': { emoji: '⚡', color: '#FFC107' }
};

let cache = { data: null, timestamp: 0 };

async function fetchParts() {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  const response = await fetch(GOOGLE_SHEET_CSV);
  const csvText = await response.text();
  const records = parse(csvText, { columns: true, skip_empty_lines: true });

  const grouped = {};
  records.forEach(row => {
    const category = row.Category || 'Other';
    if (!grouped[category]) grouped[category] = [];

    const searchQuery = encodeURIComponent(row.Item || '');
    const amazonUrl = `https://www.amazon.com/s?k=${searchQuery}&tag=${AFFILIATE_TAG}`;

    grouped[category].push({
      id: (row.Item || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      item: row.Item || '',
      price: row.Price || '',
      notes: row.Notes || '',
      category,
      categoryInfo: CATEGORIES[category] || { emoji: '📋', color: '#666' },
      amazonUrl,
      asin: row.ASIN || null
    });
  });

  cache = { data: grouped, timestamp: now };
  return grouped;
}

function mount(app) {
  app.get('/api/parts', async (req, res) => {
    try {
      const parts = await fetchParts();
      res.json(parts);
    } catch (error) {
      console.error('Error fetching parts:', error);
      res.status(500).json({ error: 'Failed to fetch parts' });
    }
  });

  app.get('/api/prices', (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const pricesPath = path.join(__dirname, '..', '..', 'prices.json');
      if (fs.existsSync(pricesPath)) {
        const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
        res.json(data);
      } else {
        res.json({ products: [] });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to load prices' });
    }
  });
}

module.exports = { mount, fetchParts, CATEGORIES, AFFILIATE_TAG };
```

**Step 4: Write the server**

```javascript
// src/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const partsRoutes = require('./routes/parts');

const app = express();
const PORT = process.env.PORT || 3000;
const HEALTH_PORT = process.env.HEALTH_PORT || 9090;

// Trust proxy (required behind Traefik)
app.set('trust proxy', 1);

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.buymeacoffee.com", "https://m.media-amazon.com", "https://images-na.ssl-images-amazon.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
if (process.env.NODE_ENV !== 'test') {
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  }));
}

app.disable('x-powered-by');

// Parse JSON bodies for POST routes
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount API routes
partsRoutes.mount(app);

// Fallback: serve index.html for SPA-like navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function start() {
  return new Promise((resolve) => {
    const appServer = app.listen(PORT === '0' ? 0 : PORT, () => {
      const port = appServer.address().port;
      console.log(`NC Mesh Parts v2 running on http://localhost:${port}`);
    });

    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/healthz' || req.url === '/ready') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    healthServer.listen(HEALTH_PORT === '0' ? 0 : HEALTH_PORT, () => {
      const hPort = healthServer.address().port;
      console.log(`Health server on http://localhost:${hPort}`);
      resolve({ app: appServer, health: healthServer });
    });
  });
}

// Auto-start if run directly (not imported by tests)
if (require.main === module) {
  start();
}

module.exports = { start };
```

**Step 5: Create minimal index.html**

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NC Mesh - Parts List</title>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <div id="app">Loading...</div>
  <script src="/js/app.js"></script>
</body>
</html>
```

**Step 6: Run tests**

Run: `node --test tests/server.test.js`
Expected: All 3 tests PASS

**Step 7: Commit**

```bash
git add src/server.js src/routes/parts.js public/index.html tests/server.test.js
git commit -m "feat: add Express API server with static file serving and parts route"
```

---

## Phase 2: Frontend Shell

### Task 4: HTML Structure + CSS Foundation

**Files:**
- Modify: `public/index.html`
- Create: `public/css/styles.css`

**Step 1: Write the full HTML shell**

Build `public/index.html` with all section containers:
- `<header>` — logo, title, stats
- `<section id="wizard">` — guided wizard container
- `<div class="search-wrap">` — sticky search bar
- `<nav class="cat-nav">` — category filter pills (populated by JS)
- `<section id="catalog">` — product card grid (populated by JS)
- `<div id="compare-bar">` — sticky comparison bar (hidden by default)
- `<div id="wishlist-panel">` — slide-out wishlist panel (hidden by default)
- `<div id="product-modal">` — product detail modal (hidden by default)
- `<div class="bmac-banner">` — Buy Me A Coffee (static)
- `<footer>` — attribution, timestamp

Key: All dynamic content injected by JS. HTML is just the shell + static elements.

**Step 2: Write CSS**

Port the dark theme from old `server.js` inline styles into `public/css/styles.css`. Modernize:
- Remove the animated header shimmer (simplify)
- Tone down mesh grid background opacity
- Add CSS custom properties for colors at `:root`
- Add product card styles (grid, hover, shadow)
- Add wizard step styles
- Add modal overlay styles
- Add comparison bar styles (sticky bottom)
- Add wishlist slide-out panel styles
- Mobile-first media queries

Root variables:
```css
:root {
  --green: #67EA94;
  --green-dim: rgba(103, 234, 148, 0.15);
  --bg: #0a0e17;
  --surface: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.07);
  --text: #c8d6e5;
  --text-dim: #6b7b8d;
  --text-bright: #f0f4f8;
  --radius: 12px;
}
```

**Step 3: Verify by running dev server**

Run: `cd /home/paschal/mnt/forge/ai/ncmesh-parts-app && node src/server.js`
Then: `curl http://localhost:3000/ | head -20`
Expected: HTML with linked stylesheet and JS

**Step 4: Commit**

```bash
git add public/index.html public/css/styles.css
git commit -m "feat: add HTML shell and CSS foundation with dark theme"
```

---

### Task 5: Core App JS — Fetch + Render Product Cards

**Files:**
- Create: `public/js/app.js`
- Create: `public/js/catalog.js`

**Step 1: Write app.js — main entry point**

```javascript
// public/js/app.js
// Main entry — fetches data, initializes all modules

(async function() {
  const partsRes = await fetch('/api/parts');
  const partsData = await partsRes.json();

  const pricesRes = await fetch('/api/prices');
  const pricesData = await pricesRes.json();

  // Build price lookup
  const priceLookup = {};
  if (pricesData.products) {
    pricesData.products.forEach(p => { priceLookup[p.name] = p; });
  }

  // Flatten all items into a single array
  const allItems = [];
  Object.entries(partsData).forEach(([category, items]) => {
    items.forEach(item => allItems.push(item));
  });

  // Update stats in header
  const totalEl = document.getElementById('total-items');
  const catEl = document.getElementById('total-categories');
  if (totalEl) totalEl.textContent = allItems.length;
  if (catEl) catEl.textContent = Object.keys(partsData).length;

  // Initialize catalog
  if (window.Catalog) {
    window.Catalog.init(allItems, partsData, priceLookup);
  }
})();
```

**Step 2: Write catalog.js — product card grid**

```javascript
// public/js/catalog.js
// Renders product cards, handles search and category filtering

window.Catalog = (function() {
  let allItems = [];
  let filteredItems = [];
  let activeCategory = null;

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.category = item.category.toLowerCase();
    card.dataset.search = `${item.item} ${item.notes} ${item.category}`.toLowerCase();
    card.dataset.id = item.id;

    const priceDisplay = item.price && item.price !== '-' && item.price !== '$-'
      ? `<span class="card-price">${escapeHtml(item.price)}</span>`
      : '';

    const imgSrc = item.asin
      ? `/api/images/${item.asin}`
      : `/img/placeholder-${item.category.toLowerCase()}.svg`;

    card.innerHTML = `
      <div class="card-image">
        <img src="${imgSrc}" alt="${escapeHtml(item.item)}" loading="lazy"
             onerror="this.src='/img/placeholder.svg'">
      </div>
      <div class="card-body">
        <span class="card-category" style="--cat-color: ${item.categoryInfo.color}">
          ${item.categoryInfo.emoji} ${item.category}
        </span>
        <h3 class="card-title">${escapeHtml(item.item)}</h3>
        ${priceDisplay}
        <p class="card-notes">${escapeHtml(item.notes)}</p>
      </div>
      <div class="card-actions">
        <a href="${item.amazonUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-buy">
          Buy on Amazon
        </a>
        <button class="btn-icon btn-compare" title="Compare" data-id="${item.id}">⚖️</button>
        <button class="btn-icon btn-wishlist" title="Add to list" data-id="${item.id}">📋</button>
      </div>
    `;

    // Click card body to open detail modal
    card.querySelector('.card-body').addEventListener('click', () => {
      if (window.ProductModal) window.ProductModal.open(item);
    });

    return card;
  }

  function render(items) {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    grid.innerHTML = '';
    items.forEach(item => grid.appendChild(createCard(item)));

    // Update count
    const countEl = document.getElementById('searchCount');
    if (countEl) countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  }

  function filterBySearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      filteredItems = activeCategory
        ? allItems.filter(i => i.category.toLowerCase() === activeCategory)
        : [...allItems];
    } else {
      filteredItems = allItems.filter(i => {
        const matchSearch = i.item.toLowerCase().includes(q) ||
                           i.notes.toLowerCase().includes(q) ||
                           i.category.toLowerCase().includes(q);
        const matchCat = !activeCategory || i.category.toLowerCase() === activeCategory;
        return matchSearch && matchCat;
      });
    }
    render(filteredItems);
  }

  function filterByCategory(category) {
    activeCategory = category;
    const searchInput = document.getElementById('searchInput');
    filterBySearch(searchInput ? searchInput.value : '');

    // Highlight active pill
    document.querySelectorAll('.cat-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.category === category);
    });
  }

  function buildCategoryPills(partsData) {
    const nav = document.querySelector('.cat-nav');
    if (!nav) return;

    // "All" pill
    const allPill = document.createElement('a');
    allPill.href = '#';
    allPill.className = 'cat-pill active';
    allPill.textContent = '🔎 All';
    allPill.addEventListener('click', (e) => {
      e.preventDefault();
      activeCategory = null;
      filterBySearch(document.getElementById('searchInput')?.value || '');
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      allPill.classList.add('active');
    });
    nav.appendChild(allPill);

    Object.keys(partsData).sort().forEach(cat => {
      const items = partsData[cat];
      const info = items[0]?.categoryInfo || { emoji: '📋', color: '#666' };
      const pill = document.createElement('a');
      pill.href = '#';
      pill.className = 'cat-pill';
      pill.dataset.category = cat.toLowerCase();
      pill.style.setProperty('--pill-color', info.color);
      pill.textContent = `${info.emoji} ${cat}`;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        filterByCategory(cat.toLowerCase());
      });
      nav.appendChild(pill);
    });
  }

  function init(items, partsData, priceLookup) {
    allItems = items;
    filteredItems = [...items];

    buildCategoryPills(partsData);
    render(filteredItems);

    // Wire up search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => filterBySearch(searchInput.value));
    }

    // Wire up sort
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const val = sortSelect.value;
        const sorted = [...filteredItems];
        if (val === 'price-asc') {
          sorted.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
        } else if (val === 'price-desc') {
          sorted.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
        } else if (val === 'name') {
          sorted.sort((a, b) => a.item.localeCompare(b.item));
        }
        render(sorted);
      });
    }
  }

  function parsePrice(p) {
    if (!p || p === '-') return 0;
    const match = p.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, filterBySearch, filterByCategory };
})();
```

**Step 3: Verify by running dev server and opening in browser**

Run: `node src/server.js`
Open: `http://localhost:3000`
Expected: Product cards render in a grid from live Google Sheets data

**Step 4: Commit**

```bash
git add public/js/app.js public/js/catalog.js
git commit -m "feat: add product card catalog with search and category filtering"
```

---

## Phase 3: Wizard

### Task 6: Guided Wizard

**Files:**
- Create: `public/js/wizard.js`
- Modify: `public/index.html` (add wizard section markup)

**Step 1: Define wizard logic**

The wizard has 3 steps. Each answer narrows down which kit to recommend. The kit mappings come from the existing KITS array (ported from old server.js).

Wizard decision tree:
- Budget < $50 → quick-start
- Budget $50-150 + Portable → solar-starter (recommended)
- Budget $50-150 + Solar → diy-solar
- Budget $50-150 + Home → turnkey
- Budget $150+ + Solar → solar-node
- Budget $150+ + Relay → high-perf
- Budget $150+ + PoE → poe-node
- First node + any → solar-starter (safe default)

**Step 2: Write wizard.js**

```javascript
// public/js/wizard.js
window.Wizard = (function() {
  const steps = [
    {
      question: "What's your budget?",
      options: [
        { label: 'Under $50', value: 'low', icon: '💰' },
        { label: '$50 – $150', value: 'mid', icon: '💵' },
        { label: '$150+', value: 'high', icon: '💎' },
        { label: 'No limit', value: 'high', icon: '🚀' }
      ]
    },
    {
      question: "What's the use case?",
      options: [
        { label: 'Portable / EDC', value: 'portable', icon: '🎒' },
        { label: 'Solar (outdoor)', value: 'solar', icon: '☀️' },
        { label: 'Relay (hilltop)', value: 'relay', icon: '📡' },
        { label: 'Home / desk', value: 'home', icon: '🏠' },
        { label: 'PoE (wired)', value: 'poe', icon: '🔌' }
      ]
    },
    {
      question: 'Experience level?',
      options: [
        { label: 'First node ever', value: 'beginner', icon: '🌱' },
        { label: 'Have a few nodes', value: 'intermediate', icon: '🔧' },
        { label: 'Building infra', value: 'advanced', icon: '🏗️' }
      ]
    }
  ];

  // Kit ID recommendations based on answers
  function recommend(answers) {
    const { budget, usecase, experience } = answers;
    if (experience === 'beginner') return 'solar-starter';
    if (budget === 'low') return 'quick-start';
    if (budget === 'mid') {
      if (usecase === 'solar') return 'diy-solar';
      if (usecase === 'portable') return 'solar-starter';
      return 'turnkey';
    }
    // budget high
    if (usecase === 'relay') return 'high-perf';
    if (usecase === 'solar') return 'solar-node';
    if (usecase === 'poe') return 'poe-node';
    return 'solar-node';
  }

  let currentStep = 0;
  let answers = {};
  const answerKeys = ['budget', 'usecase', 'experience'];

  function renderStep() {
    const container = document.getElementById('wizard');
    if (!container) return;

    if (currentStep >= steps.length) {
      showResult();
      return;
    }

    const step = steps[currentStep];
    container.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-progress">
          ${steps.map((_, i) => `<div class="wizard-dot ${i <= currentStep ? 'active' : ''}"></div>`).join('')}
        </div>
        <h2 class="wizard-question">${step.question}</h2>
        <div class="wizard-options">
          ${step.options.map(opt => `
            <button class="wizard-option" data-value="${opt.value}">
              <span class="wizard-option-icon">${opt.icon}</span>
              <span>${opt.label}</span>
            </button>
          `).join('')}
        </div>
        <a href="#catalog" class="wizard-skip">Skip to catalog →</a>
      </div>
    `;

    container.querySelectorAll('.wizard-option').forEach(btn => {
      btn.addEventListener('click', () => {
        answers[answerKeys[currentStep]] = btn.dataset.value;
        currentStep++;
        renderStep();
      });
    });
  }

  function showResult() {
    const kitId = recommend(answers);
    const container = document.getElementById('wizard');
    // Emit custom event so app.js can render the kit
    container.dispatchEvent(new CustomEvent('wizard-complete', { detail: { kitId, answers } }));
  }

  function init() {
    currentStep = 0;
    answers = {};
    renderStep();
  }

  return { init };
})();
```

**Step 3: Wire wizard into app.js**

Add to `app.js` init:
```javascript
if (window.Wizard) {
  window.Wizard.init();
  document.getElementById('wizard')?.addEventListener('wizard-complete', (e) => {
    // Render recommended kit result
    renderKitRecommendation(e.detail.kitId, allItems, priceLookup);
  });
}
```

The `renderKitRecommendation()` function renders the selected kit's items as a card with total price and "Buy All" links. Port the kit definitions from old `server.js` KITS array into a `kits.js` data file.

**Step 4: Commit**

```bash
git add public/js/wizard.js
git commit -m "feat: add guided wizard with 3-step flow and kit recommendations"
```

---

## Phase 4: Interactive Features

### Task 7: Product Detail Modal

**Files:**
- Create: `public/js/modal.js`

**Step 1: Write modal.js**

Product detail modal that opens when clicking a product card body. Shows:
- Large image, full notes, price, affiliate buy link
- Reviews section (fetches from `/api/reviews/:productId`)
- "Write a Review" form
- Related items (same category, max 4)
- "Watch Price" button for alerts

Modal is a full-screen overlay with close button and Escape key dismiss.

**Step 2: Commit**

```bash
git add public/js/modal.js
git commit -m "feat: add product detail modal with reviews and related items"
```

---

### Task 8: Comparison View

**Files:**
- Create: `public/js/compare.js`

**Step 1: Write compare.js**

- Manages a `Set` of selected product IDs (max 4)
- When 2+ items selected, shows sticky bottom bar: "Compare (N items)"
- Clicking "Compare" opens a side-by-side table overlay
- Columns: image, name, price, category, notes
- "Clear All" and "Add All to List" actions
- State lives in memory only (not persisted)

**Step 2: Commit**

```bash
git add public/js/compare.js
git commit -m "feat: add product comparison view with sticky bottom bar"
```

---

### Task 9: Wishlist / Shopping List

**Files:**
- Create: `public/js/wishlist.js`

**Step 1: Write wishlist.js**

- Uses localStorage key `ncmesh-wishlist` to persist `[{id, item, price, amazonUrl, qty}]`
- Slide-out panel from right side (toggled by nav icon)
- Shows item list with +/- quantity, remove button
- Total price calculation at bottom
- "Share List" generates URL: `?list=id1,id2,id3` — on page load, auto-populate wishlist from URL
- "Buy All on Amazon" opens each affiliate link in new tabs (with 200ms delay between tabs to avoid popup blocking)
- "Export as Text" copies markdown list to clipboard

**Step 2: Commit**

```bash
git add public/js/wishlist.js
git commit -m "feat: add wishlist with localStorage persistence and shareable URLs"
```

---

## Phase 5: Community Features

### Task 10: Reviews API

**Files:**
- Create: `src/routes/reviews.js`
- Create: `tests/reviews.test.js`

**Step 1: Write the failing test**

```javascript
// tests/reviews.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, 'test-reviews.db');

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const options = { method, hostname: 'localhost', port, path, headers: {} };
    if (body) {
      const json = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(json);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Reviews API', () => {
  let server;
  let port;

  before(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    process.env.DB_PATH = TEST_DB;
    process.env.PORT = '0';
    process.env.HEALTH_PORT = '0';
    process.env.NODE_ENV = 'test';

    // Clear require cache to pick up new env
    delete require.cache[require.resolve('../src/server')];
    delete require.cache[require.resolve('../src/db')];

    const { start } = require('../src/server');
    server = await start();
    port = server.app.address().port;
  });

  after(() => {
    server.app.close();
    server.health.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('POST /api/reviews creates a review', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'heltec-mesh-node-t114',
      display_name: 'MeshFan',
      rating: 5,
      body: 'Works great out of the box!'
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id, 'Should return review ID');
  });

  it('GET /api/reviews/:productId returns reviews', async () => {
    const res = await request(port, 'GET', '/api/reviews/heltec-mesh-node-t114');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.reviews));
    assert.equal(res.body.reviews.length, 1);
    assert.equal(res.body.reviews[0].display_name, 'MeshFan');
    assert.equal(res.body.average_rating, 5);
  });

  it('rejects review with missing fields', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'test',
      rating: 3
      // missing display_name and body
    });
    assert.equal(res.status, 400);
  });

  it('rejects review with invalid rating', async () => {
    const res = await request(port, 'POST', '/api/reviews', {
      product_id: 'test',
      display_name: 'User',
      rating: 10,
      body: 'Bad rating'
    });
    assert.equal(res.status, 400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/reviews.test.js`
Expected: FAIL

**Step 3: Write reviews route**

```javascript
// src/routes/reviews.js
const crypto = require('crypto');

function mount(app, db) {
  // Get reviews for a product
  app.get('/api/reviews/:productId', (req, res) => {
    const reviews = db.prepare(
      'SELECT id, display_name, discord_handle, rating, title, body, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC'
    ).all(req.params.productId);

    const avgRow = db.prepare(
      'SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = ? AND approved = 1'
    ).get(req.params.productId);

    res.json({
      reviews,
      average_rating: avgRow.avg ? Math.round(avgRow.avg * 10) / 10 : null,
      total: avgRow.count
    });
  });

  // Submit a review
  app.post('/api/reviews', (req, res) => {
    const { product_id, display_name, discord_handle, rating, title, body } = req.body;

    // Validation
    if (!product_id || !display_name || !body || !rating) {
      return res.status(400).json({ error: 'Missing required fields: product_id, display_name, rating, body' });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    // Rate limit: 1 review per product per IP per 24h
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ipHash = crypto.createHash('sha256').update(ip + product_id).digest('hex').slice(0, 16);

    const existing = db.prepare(
      "SELECT id FROM reviews WHERE ip_hash = ? AND created_at > datetime('now', '-1 day')"
    ).get(ipHash);

    if (existing) {
      return res.status(429).json({ error: 'You already reviewed this product recently' });
    }

    const stmt = db.prepare(
      'INSERT INTO reviews (product_id, display_name, discord_handle, rating, title, body, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(product_id, display_name, discord_handle || null, rating, title || null, body, ipHash);

    res.status(201).json({ id: result.lastInsertRowid });
  });
}

module.exports = { mount };
```

**Step 4: Wire into server.js**

Add to `src/server.js`:
```javascript
const { initDB } = require('./db');
const reviewsRoutes = require('./routes/reviews');

const db = initDB(process.env.DB_PATH);
reviewsRoutes.mount(app, db);
```

**Step 5: Run tests**

Run: `node --test tests/reviews.test.js`
Expected: All 4 tests PASS

**Step 6: Commit**

```bash
git add src/routes/reviews.js tests/reviews.test.js src/server.js
git commit -m "feat: add reviews API with rate limiting and validation"
```

---

### Task 11: Reviews Frontend

**Files:**
- Create: `public/js/reviews.js`

**Step 1: Write reviews.js**

- Fetches reviews for a product via `GET /api/reviews/:productId`
- Renders star display (filled/empty stars), average rating, review count
- Renders review list: author, rating, date, body
- "Write a Review" form: display name, Discord handle (optional), star picker, title, body
- On submit: `POST /api/reviews` → on success, re-fetch and re-render
- Star picker: 5 clickable star icons, highlights on hover

**Step 2: Integrate into modal.js**

Call `Reviews.load(productId)` when product modal opens.

**Step 3: Commit**

```bash
git add public/js/reviews.js
git commit -m "feat: add reviews frontend with star picker and submission form"
```

---

### Task 12: Price Alerts API

**Files:**
- Create: `src/routes/alerts.js`
- Create: `tests/alerts.test.js`

**Step 1: Write failing test**

Test `POST /api/alerts` (subscribe), `GET /api/alerts?email=x` (list), `DELETE /api/alerts/unsubscribe/:token` (unsubscribe).

**Step 2: Write alerts route**

```javascript
// src/routes/alerts.js
const crypto = require('crypto');

function mount(app, db) {
  app.post('/api/alerts', (req, res) => {
    const { product_id, email, threshold_pct } = req.body;
    if (!product_id || !email) {
      return res.status(400).json({ error: 'product_id and email required' });
    }
    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const threshold = threshold_pct || 5.0;

    const stmt = db.prepare(
      'INSERT INTO price_alerts (product_id, email, threshold_pct, unsubscribe_token) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(product_id, email, threshold, token);

    res.status(201).json({ id: result.lastInsertRowid, unsubscribe_token: token });
  });

  app.get('/api/alerts/unsubscribe/:token', (req, res) => {
    const result = db.prepare('UPDATE price_alerts SET active = 0 WHERE unsubscribe_token = ?').run(req.params.token);
    if (result.changes > 0) {
      res.json({ message: 'Unsubscribed successfully' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  });
}

module.exports = { mount };
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/routes/alerts.js tests/alerts.test.js
git commit -m "feat: add price alerts API with subscribe/unsubscribe"
```

---

### Task 13: Price Alerts Email Integration

**Files:**
- Modify: `price-checker.js`

**Step 1: Add alert notification to price-checker**

After detecting a price drop >= threshold, query `price_alerts` table for matching subscriptions. Send email via Resend API to each subscriber.

Email template includes:
- Product name, old price → new price, % change
- Amazon affiliate buy link
- Unsubscribe link: `https://node-parts.paschal.ai/api/alerts/unsubscribe/{token}`

Resend API key: retrieve from KeePass at runtime via environment variable `RESEND_API_KEY`.

**Step 2: Commit**

```bash
git add price-checker.js
git commit -m "feat: integrate price alerts email notifications into price-checker"
```

---

### Task 14: Price Alerts Frontend

**Files:**
- Create: `public/js/alerts.js`

**Step 1: Write alerts.js**

- "Watch Price" bell icon on each product card
- Click opens a small popover: email input, optional threshold %, "Subscribe" button
- On submit: `POST /api/alerts`
- Success feedback: "You'll be notified when price drops!"
- Store subscribed product IDs in localStorage to show "Watching" state

**Step 2: Commit**

```bash
git add public/js/alerts.js
git commit -m "feat: add price alerts frontend with bell icon and subscribe popover"
```

---

## Phase 6: Amazon Images

### Task 15: Image Proxy

**Files:**
- Create: `src/routes/images.js`
- Create: `tests/images.test.js`

**Step 1: Write image proxy route**

```javascript
// src/routes/images.js
const cheerio = require('cheerio');

function mount(app, db) {
  app.get('/api/images/:asin', async (req, res) => {
    const { asin } = req.params;

    // Check cache first (24h TTL)
    const cached = db.prepare(
      "SELECT image_url FROM image_cache WHERE asin = ? AND cached_at > datetime('now', '-1 day')"
    ).get(asin);

    if (cached) {
      return res.redirect(cached.image_url);
    }

    try {
      // Fetch Amazon product page
      const response = await fetch(`https://www.amazon.com/dp/${asin}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NCMeshBot/1.0)' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract main product image
      let imageUrl = null;
      const imgEl = $('#landingImage, #imgBlkFront, .a-dynamic-image').first();
      if (imgEl.length) {
        imageUrl = imgEl.attr('data-old-hires') || imgEl.attr('src');
      }

      if (imageUrl) {
        db.prepare('INSERT OR REPLACE INTO image_cache (asin, image_url, cached_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
          .run(asin, imageUrl);
        return res.redirect(imageUrl);
      }

      // Fallback to placeholder
      res.redirect('/img/placeholder.svg');
    } catch (err) {
      console.error(`Image fetch failed for ${asin}:`, err.message);
      res.redirect('/img/placeholder.svg');
    }
  });
}

module.exports = { mount };
```

**Step 2: Create placeholder SVG**

Create `public/img/placeholder.svg` — simple gray box with mesh icon.

**Step 3: Commit**

```bash
git add src/routes/images.js public/img/placeholder.svg
git commit -m "feat: add Amazon image proxy with 24h cache and placeholder fallback"
```

---

## Phase 7: Deployment

### Task 16: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

**Step 1: Update Dockerfile for v2 structure**

```dockerfile
FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Remove build tools after native module compilation
RUN apk del python3 make g++

COPY src/ ./src/
COPY public/ ./public/
COPY prices.json ./
COPY price-checker.js ./

# Create data directory for SQLite (writable by app)
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/health || exit 1

CMD ["node", "src/server.js"]
```

**Step 2: Build and test locally**

```bash
ssh paschal@10.0.10.11 "cd /work/ai/ncmesh-parts-app && sudo nerdctl build -t ncmesh-parts:v2 ."
```

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore: update Dockerfile for v2 structure with better-sqlite3"
```

---

### Task 17: K3s Deployment (Forge — Primary)

**Files:**
- Modify: `k8s/deployment.yaml`

**Step 1: Update K8s manifest**

Key changes:
- Image: `ncmesh-parts:v2`
- Add `volumeMount` for `/app/data` (persistent SQLite via PVC or hostPath)
- Keep existing security context, resource limits, health probes
- Add `RESEND_API_KEY` from K8s secret

**Step 2: Build, import, and deploy**

```bash
ssh paschal@10.0.10.11
cd /work/ai/ncmesh-parts-app
sudo nerdctl build -t ncmesh-parts:v2 .
sudo nerdctl save ncmesh-parts:v2 | sudo k3s ctr images import -
sudo k3s kubectl apply -f k8s/deployment.yaml
sudo k3s kubectl rollout status deployment/ncmesh-parts -n monitoring
```

**Step 3: Verify**

```bash
curl -s https://node-parts.paschal.ai/api/parts | head -c 200
curl -s https://node-parts.paschal.ai/ | head -c 200
```

**Step 4: Commit**

```bash
git add k8s/deployment.yaml
git commit -m "chore: update K8s deployment for v2 with SQLite volume"
```

---

### Task 18: Cloud Run Deployment (Failover)

**Step 1: Build and push to GCR/Artifact Registry**

```bash
# From terminus or forge
gcloud builds submit --tag gcr.io/paschal-homelab/ncmesh-parts:v2
gcloud run deploy ncmesh-parts --image gcr.io/paschal-homelab/ncmesh-parts:v2 \
  --region us-east1 --platform managed --allow-unauthenticated \
  --set-env-vars RESEND_API_KEY=<from-keepass> \
  --port 3000
```

**Step 2: Verify Cloud Run is serving**

```bash
curl -s <cloud-run-url>/api/parts | head -c 200
```

**Step 3: Note Cloud Run URL for Cloudflare failover config (next task)**

---

### Task 19: Cloudflare DNS Failover

**Step 1: Configure Cloudflare load balancer**

In Cloudflare dashboard for `paschal.ai`:
1. Create an origin pool "forge-primary" pointing to the Cloudflare Tunnel origin
2. Create an origin pool "cloudrun-failover" pointing to the Cloud Run URL
3. Create a load balancer for `node-parts.paschal.ai`:
   - Primary pool: forge-primary
   - Failover pool: cloudrun-failover
   - Health check: HTTP GET `/health` on port 9090 (or 443 via tunnel)
   - Interval: 60s, threshold: 2 consecutive failures to failover

**Step 2: Test failover**

Stop the K3s pod on forge, verify Cloudflare routes to Cloud Run within ~2 minutes. Restart pod, verify traffic returns to forge.

**Step 3: Document the failover configuration**

Add notes to design doc or CLAUDE.md about the failover setup.

---

### Task 20: Retire Old server.js

**Step 1: Verify everything works on v2**

- All 108+ affiliate links present
- Wizard recommends kits correctly
- Product cards render with images
- Reviews can be submitted and viewed
- Price alerts subscribe/unsubscribe works
- Comparison and wishlist work
- Mobile responsive

**Step 2: Move old server.js to archive**

```bash
mv server.js server.js.v1-archived
git add -A
git commit -m "chore: archive v1 monolithic server.js, v2 is now live"
```

---

## Testing Summary

Run all tests before each deployment:
```bash
node --test tests/*.test.js
```

Expected test files:
- `tests/db.test.js` — SQLite schema and CRUD
- `tests/server.test.js` — API server basics
- `tests/reviews.test.js` — Reviews CRUD and validation
- `tests/alerts.test.js` — Price alerts CRUD

Manual testing checklist:
- [ ] Page loads < 2s
- [ ] Wizard completes in 3 clicks → shows recommended kit
- [ ] "Skip to catalog" works
- [ ] Search filters cards in real-time
- [ ] Category pills filter correctly
- [ ] Product cards show images (or placeholders)
- [ ] Clicking card opens detail modal
- [ ] Reviews: submit, display, star rating
- [ ] Compare: select 2+, compare view opens
- [ ] Wishlist: add, remove, share URL, buy all
- [ ] Price alerts: subscribe, unsubscribe via email link
- [ ] Mobile: all features usable on phone
- [ ] All Amazon links include `tag=dpaschal26-20`
- [ ] BMAC banner visible and linked
