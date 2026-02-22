#!/usr/bin/env node
/**
 * Price checker for NC Mesh parts.
 * Reads prices.json, scrapes current prices, updates the file.
 * Outputs "PRICES_CHANGED" if any price changed >5%.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const { Resend } = require('resend');

const PRICES_FILE = path.join(__dirname, 'prices.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
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
  // Try common Seeed price selectors
  const selectors = [
    '.product-price .price', '.pro-price', '#product_price',
    '[data-product-price]', '.price--main .money', '.product__price',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/\$?([\d,]+\.?\d*)/);
    if (match) return parseFloat(match[1].replace(',', ''));
  }
  // Regex fallback on raw HTML
  const priceMatch = html.match(/\$\s*([\d,]+\.\d{2})/);
  if (priceMatch) return parseFloat(priceMatch[1].replace(',', ''));
  return null;
}

function extractGenericPrice(html) {
  // Generic price extractor for manufacturer sites (Heltec, LILYGO, RAK, etc.)
  const $ = cheerio.load(html);
  // Common e-commerce price selectors
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
  // Regex fallback — find first reasonable dollar amount
  const matches = [...html.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  const prices = matches.map(m => parseFloat(m[1].replace(',', ''))).filter(p => p > 5 && p < 500);
  if (prices.length > 0) return Math.min(...prices); // lowest reasonable price
  return null;
}

function extractAmazonPrice(html) {
  const $ = cheerio.load(html);
  // Search results price selectors
  const selectors = [
    '.a-price .a-offscreen', '.a-price-whole', '.a-color-price',
    '[data-a-color="price"] .a-offscreen',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/\$?([\d,]+\.?\d*)/);
    if (match) return parseFloat(match[1].replace(',', ''));
  }
  // Regex fallback
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
  const productId = product.id || product.name;
  const pctDrop = pctChange * 100;

  const subscribers = db.prepare(
    'SELECT * FROM price_alerts WHERE product_id = ? AND active = 1 AND threshold_pct <= ?'
  ).all(productId, pctDrop);

  if (subscribers.length === 0) {
    console.log(`  📭 No subscribers matched for ${product.name} (${pctDrop.toFixed(1)}% drop)`);
    return;
  }

  // Build affiliate link
  let buyUrl = product.url;
  if (!buyUrl.includes('tag=')) {
    buyUrl += (buyUrl.includes('?') ? '&' : '?') + 'tag=dpaschal26-20';
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
      // heltec, lilygo, rakwireless, etc.
      newPrice = extractGenericPrice(html);
    }

    if (newPrice && newPrice > 0) {
      const oldPrice = product.price;
      const pctChange = Math.abs(newPrice - oldPrice) / oldPrice;
      const changed = pctChange > 0.05;

      if (changed) {
        console.log(`📊 ${product.name}: $${oldPrice} → $${newPrice} (${(pctChange * 100).toFixed(1)}% change)`);
        product.price = newPrice;
        product.priceDisplay = newPrice >= 100 ? `~$${Math.round(newPrice)}` : newPrice % 1 === 0 ? `~$${newPrice}` : `$${newPrice.toFixed(2)}`;
        product.lastChanged = now;

        // Notify subscribers on price DROPS only
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

async function main() {
  if (!fs.existsSync(PRICES_FILE)) {
    console.error('prices.json not found!');
    process.exit(1);
  }

  // Open the database for price alert subscriber lookups
  const DB_PATH = path.join(__dirname, 'data', 'ncmesh.db');
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

  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  let anyChanged = false;

  console.log(`\n🔍 Checking ${data.products.length} products...\n`);

  try {
    for (const product of data.products) {
      const changed = await checkProduct(product, db);
      if (changed) anyChanged = true;
      // Small delay between requests
      await new Promise(r => setTimeout(r, 1500));
    }
  } finally {
    if (db) db.close();
  }

  data.lastRun = new Date().toISOString();
  fs.writeFileSync(PRICES_FILE, JSON.stringify(data, null, 2) + '\n');

  console.log(`\n✨ Done. prices.json updated (lastRun: ${data.lastRun})`);
  if (anyChanged) {
    console.log('\nPRICES_CHANGED');
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
