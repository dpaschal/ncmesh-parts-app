#!/usr/bin/env node
/**
 * Price checker for NC Mesh parts.
 * Reads prices.json, scrapes current prices, updates the file.
 * Outputs "PRICES_CHANGED" if any price changed >5%.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

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

async function checkProduct(product) {
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

  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  let anyChanged = false;

  console.log(`\n🔍 Checking ${data.products.length} products...\n`);

  for (const product of data.products) {
    const changed = await checkProduct(product);
    if (changed) anyChanged = true;
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1500));
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
