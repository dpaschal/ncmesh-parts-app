#!/usr/bin/env node
/**
 * Price checker for NC Mesh parts.
 * Auto-builds product list from parts.json (all items with ASIN or scrapable URL).
 * Scrapes current prices, updates prices.json history, and syncs changes back to parts.json.
 * Outputs "PRICES_CHANGED" if any price changed >5%.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const { Resend } = require('resend');

const DATA_DIR = path.join(__dirname, 'data');
const PARTS_FILE = path.join(DATA_DIR, 'parts.json');
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');
const AFFILIATE_TAG = 'dpaschal26-20';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Detect source from URL hostname.
 */
function detectSource(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('amazon.com')) return 'amazon';
    if (host.includes('seeedstudio.com')) return 'seeed';
    if (host.includes('heltec.org')) return 'heltec';
    if (host.includes('lilygo.cc')) return 'lilygo';
    if (host.includes('rakwireless.com')) return 'rakwireless';
    if (host.includes('elecrow.com')) return 'elecrow';
    if (host.includes('rokland.com')) return 'rokland';
    if (host.includes('uniteng.com')) return 'uniteng';
    if (host.includes('muzi.works')) return 'muzi';
    return 'generic';
  } catch {
    return 'generic';
  }
}

/**
 * Check if a parts.json item should be skipped for price checking.
 */
function shouldSkip(item) {
  // Skip "From $X" variant pricing
  if (item.price && item.price.startsWith('From')) return true;
  // Skip non-product URLs (Discord, etc.)
  if (item.url) {
    try {
      const host = new URL(item.url).hostname;
      if (host.includes('discord.com') || host.includes('discord.gg')) return true;
    } catch { /* skip malformed URLs */ }
  }
  // Skip "Contact on Discord" prices
  if (item.price && item.price.toLowerCase().includes('contact')) return true;
  // Must have ASIN or URL
  if (!item.asin && !item.url) return true;
  return false;
}

/**
 * Parse a parts.json price string like "$36.50" into a number.
 */
function parsePartsPrice(priceStr) {
  if (!priceStr) return null;
  const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
  if (match) return parseFloat(match[1].replace(',', ''));
  return null;
}

/**
 * Convert a numeric price to a parts.json display string.
 */
function formatPartsPrice(price) {
  if (price >= 100) return `$${price.toFixed(2)}`;
  if (price % 1 === 0) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

/**
 * Build the product URL for an item.
 */
function buildUrl(item) {
  if (item.url) return item.url;
  if (item.asin) return `https://www.amazon.com/dp/${item.asin}?tag=${AFFILIATE_TAG}`;
  return null;
}

/**
 * Build the check list from parts.json, merging with existing prices.json history.
 */
function buildProductList(partsData, existingPrices) {
  // Index existing prices by a key (ASIN or URL)
  const priceHistory = {};
  for (const p of (existingPrices.products || [])) {
    const key = p.asin || p.url;
    if (key) priceHistory[key] = p;
  }

  const products = [];
  for (const item of partsData) {
    if (shouldSkip(item)) continue;

    const url = buildUrl(item);
    if (!url) continue;

    const source = item.asin ? 'amazon' : detectSource(url);
    const key = item.asin || url;
    const existing = priceHistory[key];
    const price = parsePartsPrice(item.price);

    if (price === null) continue;

    products.push({
      name: item.name,
      price: existing ? existing.price : price,
      priceDisplay: existing ? existing.priceDisplay : item.price,
      url,
      source,
      asin: item.asin || null,
      lastChecked: existing ? existing.lastChecked : null,
      lastChanged: existing ? existing.lastChanged : null,
    });
  }

  return products;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function extractSeeedPrice(html) {
  const $ = cheerio.load(html);
  const selectors = [
    '.product-price .price', '.pro-price', '#product_price',
    '[data-product-price]', '.price--main .money', '.product__price',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/\$?([\d,]+\.?\d*)/);
    if (match) return parseFloat(match[1].replace(',', ''));
  }
  const priceMatch = html.match(/\$\s*([\d,]+\.\d{2})/);
  if (priceMatch) return parseFloat(priceMatch[1].replace(',', ''));
  return null;
}

function extractGenericPrice(html) {
  const $ = cheerio.load(html);
  const selectors = [
    '.price', '.product-price', '.current-price', '.sale-price',
    '[data-product-price]', '.money', '.ProductPrice',
    '.price--main', '.price-item--regular', '.price-item--sale',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/\$\s*([\d,]+\.?\d*)/);
    if (match) return parseFloat(match[1].replace(',', ''));
  }
  const matches = [...html.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  const prices = matches.map(m => parseFloat(m[1].replace(',', ''))).filter(p => p > 5 && p < 500);
  if (prices.length > 0) return Math.min(...prices);
  return null;
}

function extractAmazonPrice(html) {
  const $ = cheerio.load(html);
  const selectors = [
    '.a-price .a-offscreen', '.a-price-whole', '.a-color-price',
    '[data-a-color="price"] .a-offscreen',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/\$?([\d,]+\.?\d*)/);
    if (match) return parseFloat(match[1].replace(',', ''));
  }
  const matches = [...html.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  if (matches.length > 0) return parseFloat(matches[0][1].replace(',', ''));
  return null;
}

/**
 * Send email notifications to subscribers whose threshold is met by this price drop.
 */
async function notifySubscribers(product, oldPrice, newPrice, pctChange, db) {
  if (!process.env.RESEND_API_KEY) {
    console.log('  ⚠️  RESEND_API_KEY not set — skipping email notifications');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const productId = product.asin || product.name;
  const pctDrop = pctChange * 100;

  const subscribers = db.prepare(
    'SELECT * FROM price_alerts WHERE product_id = ? AND active = 1 AND threshold_pct <= ?'
  ).all(productId, pctDrop);

  if (subscribers.length === 0) {
    console.log(`  📭 No subscribers matched for ${product.name} (${pctDrop.toFixed(1)}% drop)`);
    return;
  }

  let buyUrl = product.url;
  if (!buyUrl.includes('tag=')) {
    buyUrl += (buyUrl.includes('?') ? '&' : '?') + `tag=${AFFILIATE_TAG}`;
  }

  let sent = 0;
  const updateStmt = db.prepare(
    "UPDATE price_alerts SET last_notified = datetime('now') WHERE id = ?"
  );

  for (const sub of subscribers) {
    const unsubUrl = `https://node-parts.paschal.ai/api/alerts/unsubscribe/${sub.unsubscribe_token}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#1a1a2e; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#16213e; border-radius:8px; overflow:hidden;">
        <tr><td style="background:#0f3460; padding:24px 32px;">
          <h1 style="margin:0; color:#e94560; font-size:24px;">Price Drop Alert</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="color:#eee; margin:0 0 16px 0; font-size:20px;">${product.name}</h2>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr>
              <td style="color:#999; font-size:14px; padding-right:12px;">Was:</td>
              <td style="color:#999; font-size:18px; text-decoration:line-through;">$${oldPrice.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color:#4ecca3; font-size:14px; padding-right:12px;">Now:</td>
              <td style="color:#4ecca3; font-size:24px; font-weight:bold;">$${newPrice.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color:#e94560; font-size:14px; padding-right:12px;">Save:</td>
              <td style="color:#e94560; font-size:16px; font-weight:bold;">${pctDrop.toFixed(1)}% off</td>
            </tr>
          </table>
          <a href="${buyUrl}" style="display:inline-block; background:#e94560; color:#fff; text-decoration:none; padding:14px 32px; border-radius:6px; font-size:16px; font-weight:bold;">Buy Now</a>
        </td></tr>
        <tr><td style="padding:16px 32px; border-top:1px solid #0f3460;">
          <p style="color:#666; font-size:12px; margin:0;">
            You received this because you subscribed to price alerts on
            <a href="https://node-parts.paschal.ai" style="color:#4ecca3;">NC Mesh Parts</a>.
            <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    try {
      await resend.emails.send({
        from: 'NC Mesh Parts <alerts@paschal.ai>',
        to: sub.email,
        subject: `Price Drop: ${product.name} — $${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)}`,
        html,
      });
      updateStmt.run(sub.id);
      sent++;
    } catch (err) {
      console.log(`  ❌ Failed to send to ${sub.email}: ${err.message}`);
    }
  }

  console.log(`  📧 Sent ${sent}/${subscribers.length} price alert notifications`);
}

async function checkProduct(product, db) {
  const now = new Date().toISOString();
  try {
    const html = await fetchPage(product.url);
    let newPrice = null;

    if (product.source === 'seeed') {
      newPrice = extractSeeedPrice(html);
    } else if (product.source === 'amazon') {
      newPrice = extractAmazonPrice(html);
    } else {
      newPrice = extractGenericPrice(html);
    }

    if (newPrice && newPrice > 0) {
      const oldPrice = product.price;
      const pctChange = Math.abs(newPrice - oldPrice) / oldPrice;
      const changed = pctChange > 0.05;

      if (changed) {
        console.log(`📊 ${product.name}: $${oldPrice} → $${newPrice} (${(pctChange * 100).toFixed(1)}% change)`);
        product.price = newPrice;
        product.priceDisplay = formatPartsPrice(newPrice);
        product.lastChanged = now;
        product._pctChange = pctChange;

        if (newPrice < oldPrice && db) {
          await notifySubscribers(product, oldPrice, newPrice, pctChange, db);
        }
      } else {
        console.log(`✅ ${product.name}: $${oldPrice} (unchanged)`);
      }
      product.lastChecked = now;
      return changed;
    } else {
      console.log(`⚠️  ${product.name}: Could not extract price, keeping cached $${product.price}`);
      product.lastChecked = now;
      return false;
    }
  } catch (e) {
    console.log(`❌ ${product.name}: ${e.message} — keeping cached $${product.price}`);
    return false;
  }
}

/**
 * Sync price changes from the checked products back into parts.json.
 * Returns the number of items updated.
 */
function syncBackToParts(partsData, changedProducts) {
  if (changedProducts.length === 0) return 0;

  // Filter out changes > 80% — almost certainly scraper errors
  const MAX_CHANGE = 0.80;
  const reliable = changedProducts.filter(p => {
    if (p._pctChange > MAX_CHANGE) {
      console.log(`  ⚠️  Skipping sync for ${p.name}: ${(p._pctChange * 100).toFixed(1)}% change exceeds ${MAX_CHANGE * 100}% cap (likely scraper error)`);
      return false;
    }
    return true;
  });

  if (reliable.length === 0) return 0;

  // Build lookup: ASIN → new price, URL → new price
  const byAsin = {};
  const byUrl = {};
  for (const p of reliable) {
    if (p.asin) byAsin[p.asin] = p.price;
    else byUrl[p.url] = p.price;
  }

  let updated = 0;
  for (const item of partsData) {
    let newPrice = null;
    if (item.asin && byAsin[item.asin] !== undefined) {
      newPrice = byAsin[item.asin];
    } else if (item.url && byUrl[item.url] !== undefined) {
      newPrice = byUrl[item.url];
    }

    if (newPrice !== null) {
      item.price = formatPartsPrice(newPrice);
      updated++;
    }
  }

  return updated;
}

async function main() {
  // Read parts.json — the source of truth for the product catalog
  if (!fs.existsSync(PARTS_FILE)) {
    console.error('parts.json not found at', PARTS_FILE);
    process.exit(1);
  }
  const partsData = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));

  // Load existing prices.json for history (if it exists)
  let existingPrices = { products: [], lastRun: null };
  if (fs.existsSync(PRICES_FILE)) {
    try {
      existingPrices = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
    } catch { /* start fresh */ }
  }

  // Build the product check list
  const products = buildProductList(partsData, existingPrices);

  const amazonCount = products.filter(p => p.source === 'amazon').length;
  const otherCount = products.length - amazonCount;
  const estimatedTime = Math.ceil((amazonCount * 3 + otherCount * 1.5) / 60);
  console.log(`\n🔍 Checking ${products.length} products (${amazonCount} Amazon, ${otherCount} other)`);
  console.log(`⏱️  Estimated time: ~${estimatedTime} minutes\n`);

  // Open the database for price alert subscriber lookups
  const DB_PATH = path.join(DATA_DIR, 'ncmesh.db');
  let db = null;
  if (fs.existsSync(DB_PATH)) {
    try {
      db = new Database(DB_PATH);
      console.log('📂 Opened alert subscriber database');
    } catch (err) {
      console.log(`⚠️  Could not open database: ${err.message} — notifications disabled`);
    }
  } else {
    console.log('⚠️  Database not found at data/ncmesh.db — notifications disabled');
  }

  const changedProducts = [];
  let checked = 0;

  try {
    for (const product of products) {
      checked++;
      const prefix = `[${checked}/${products.length}]`;
      process.stdout.write(`${prefix} `);

      const changed = await checkProduct(product, db);
      if (changed) changedProducts.push(product);

      // Rate limiting: 3s for Amazon, 1.5s for others
      const delay = product.source === 'amazon' ? 3000 : 1500;
      await new Promise(r => setTimeout(r, delay));
    }
  } finally {
    if (db) db.close();
  }

  // Write updated prices.json
  const pricesData = {
    products,
    lastRun: new Date().toISOString(),
  };
  fs.writeFileSync(PRICES_FILE, JSON.stringify(pricesData, null, 2) + '\n');
  console.log(`\n✨ prices.json updated (${products.length} products, lastRun: ${pricesData.lastRun})`);

  // Sync price changes back to parts.json
  if (changedProducts.length > 0) {
    const synced = syncBackToParts(partsData, changedProducts);
    fs.writeFileSync(PARTS_FILE, JSON.stringify(partsData, null, 2) + '\n');
    console.log(`📝 Synced ${synced} price changes back to parts.json`);
    console.log('\nPRICES_CHANGED');
  } else {
    console.log('\n✅ No price changes detected');
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
