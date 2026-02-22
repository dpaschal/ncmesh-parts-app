const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load dynamic prices from prices.json (falls back to hardcoded values)
function loadPrices() {
  try {
    const pricesPath = path.join(__dirname, 'prices.json');
    if (fs.existsSync(pricesPath)) {
      const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
      const map = {};
      data.products.forEach(p => { map[p.name] = p.priceDisplay; });
      return map;
    }
  } catch (e) {
    console.warn('Could not load prices.json, using defaults:', e.message);
  }
  return null;
}

const dynamicPrices = loadPrices();

// Amazon Associates affiliate tag
const AFFILIATE_TAG = 'dpaschal26-20';

const app = express();
const PORT = process.env.PORT || 3000;
const HEALTH_PORT = process.env.HEALTH_PORT || 9090;

// Trust proxy (required for rate limiting behind Traefik)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cdn.buymeacoffee.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Disable X-Powered-By header
app.disable('x-powered-by');

// Configuration
const GOOGLE_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6heV4SwmFTDup6g4DDCLd7mXE1nToDl0tEWqI9DDcY9Hb-Lpttml1iG7X2tdb5jbij4EnN1pUG-qQ/pub?output=csv';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache
let cache = { data: null, timestamp: 0 };

// Category emojis and colors
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

// Fetch and parse CSV
async function fetchParts() {
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  try {
    const response = await fetch(GOOGLE_SHEET_CSV);
    const csvText = await response.text();

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true
    });

    // Group by category
    const grouped = {};
    records.forEach(row => {
      const category = row.Category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }

      // Generate Amazon search URL
      const searchQuery = encodeURIComponent(row.Item || '');
      const amazonUrl = `https://www.amazon.com/s?k=${searchQuery}&tag=${AFFILIATE_TAG}`;

      grouped[category].push({
        item: row.Item || '',
        price: row.Price || '',
        notes: row.Notes || '',
        amazonUrl
      });
    });

    cache = { data: grouped, timestamp: now };
    return grouped;
  } catch (error) {
    console.error('Error fetching parts:', error);
    throw error;
  }
}

// Generate Amazon affiliate search URL
function generateAmazonUrl(itemName) {
  const searchQuery = encodeURIComponent(itemName);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${AFFILIATE_TAG}`;
}

// Kit definitions - match items by partial name substring
const KITS = [
  {
    id: 'quick-start',
    emoji: '🚀',
    name: 'Just Get Me Running!',
    desc: 'The bare minimum to get a Meshtastic node on the air. Budget-friendly, plug-and-play.',
    color: '#67EA94',
    items: [
      { match: 'Heltec Mesh Node T114', cat: 'Node' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'chenyang USB C Short Flat', cat: 'Cable' },
    ]
  },
  {
    id: 'solar-node',
    emoji: '☀️',
    name: 'Solar Node Kit',
    desc: 'Everything for a self-sustaining solar-powered node. Set it and forget it.',
    color: '#FBBF24',
    items: [
      { match: 'LILYGO T-Beam Meshtastic LORA32', cat: 'Node' },
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'Voltaic Systems V50', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
    ]
  },
  {
    id: 'poe-node',
    emoji: '🔌',
    name: 'PoE Powered Node',
    desc: 'For permanent installations with Ethernet available. Rock-solid reliability.',
    color: '#60A5FA',
    items: [
      { match: 'Heltec Mesh Node T114', cat: 'Node' },
      { match: 'Gigabit Type C PoE Splitter', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'XRDS -RF SMA to N Cable', cat: 'Cable' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
    ]
  },
  {
    id: 'turnkey',
    emoji: '🎁',
    name: 'Turn-Key Solutions',
    desc: 'Ready-to-go nodes — pick one, power on, and you\'re on the mesh. Each is a standalone option.',
    color: '#EC4899',
    hardcoded: true,
    standalone: true,
    hardcodedItems: [
      { name: 'SenseCAP Card Tracker T1000-E for Meshtastic', price: dynamicPrices?.['SenseCAP Card Tracker T1000-E for Meshtastic'] || '~$40', url: `https://www.amazon.com/s?k=${encodeURIComponent('SenseCAP Card Tracker T1000-E Meshtastic')}&tag=${AFFILIATE_TAG}`, notes: 'Credit card sized tracker, GPS, BLE. Perfect pocket node.' },
      { name: 'Seeed SenseCAP P1-Pro Solar Meshtastic Node', price: dynamicPrices?.['Seeed SenseCAP P1-Pro Solar Meshtastic Node'] || '~$99', url: `https://www.amazon.com/s?k=${encodeURIComponent('SenseCAP P1-Pro Solar Meshtastic Node')}&tag=${AFFILIATE_TAG}`, notes: 'Solar-powered, weatherproof, built-in antenna. True set-and-forget.' },
      { name: 'Heltec MeshPocket Meshtastic Node', price: dynamicPrices?.['Heltec MeshPocket Meshtastic Node'] || '~$35', url: `https://www.amazon.com/s?k=${encodeURIComponent('Heltec MeshPocket Meshtastic')}&tag=${AFFILIATE_TAG}`, notes: 'Pocket-sized with e-ink display, battery, and BLE. Great starter.' },
      { name: 'LILYGO T-Deck Meshtastic Keyboard', price: dynamicPrices?.['LILYGO T-Deck Meshtastic Keyboard'] || '~$43', url: `https://www.amazon.com/s?k=${encodeURIComponent('LILYGO T-Deck Meshtastic')}&tag=${AFFILIATE_TAG}`, notes: 'Full keyboard + screen + LoRa. Standalone messaging device.' },
      { name: 'RAK WisBlock Meshtastic Starter Kit', price: dynamicPrices?.['RAK WisBlock Meshtastic Starter Kit'] || '~$25', url: `https://www.amazon.com/s?k=${encodeURIComponent('RAK WisBlock Meshtastic Starter Kit')}&tag=${AFFILIATE_TAG}`, notes: 'Modular platform, nRF52840 based. Excellent battery life.' },
    ]
  },
  {
    id: 'solar-starter',
    emoji: '⚡',
    name: 'Solar Starter - Bolt & Go!',
    desc: 'Our top recommendation for newcomers. Use the SenseCAP as a regular node now, then bolt it onto the solar panel when you\'re ready to deploy outdoors. No soldering, no fuss.',
    color: '#10B981',
    hardcoded: true,
    hardcodedItems: [
      { name: 'Seeed SenseCAP P1-Pro Solar Meshtastic Node', price: dynamicPrices?.['Seeed SenseCAP P1-Pro Solar Meshtastic Node'] || '~$99', url: `https://www.amazon.com/s?k=${encodeURIComponent('SenseCAP P1-Pro Solar Meshtastic Node')}&tag=${AFFILIATE_TAG}`, notes: 'Pre-flashed with Meshtastic. Built-in LoRa, BLE, battery slots for 4x 18650s, and 5W solar panel. Weatherproof. Just configure and go.' },
      { name: 'Samsung 18650 Rechargeable Batteries (4-pack)', price: dynamicPrices?.['Samsung 18650 Rechargeable Batteries (4-pack)'] || '$19.99', url: `https://www.amazon.com/s?k=${encodeURIComponent('samsung 18650 rechargeable battery 4 pack')}&tag=${AFFILIATE_TAG}`, notes: 'High-capacity cells for the SenseCAP battery slots. Powers the node overnight.' },
    ],
    recommended: true
  },
  {
    id: 'diy-solar',
    emoji: '🏗️',
    name: 'Build Your Own Solar',
    desc: 'DIY solar setup for people who want to customize. Individual components to mix and match.',
    color: '#F97316',
    items: [
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'MakerHawk 3.7V 5000mAh LiPo', cat: 'Power' },
      { match: 'KOOBOOK 10pcs 3A BMS Protection Board', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'Zulkit Junction Box Mounting Plates', cat: 'Enclosure' },
      { match: 'smseace 30PCS JST ph2.0', cat: 'Connector' },
      { match: 'QIANRENON USB-C Quick Connect', cat: 'Connector' },
      { match: 'Male to Female Thread Spacer Screws Brass', cat: 'Hardware' },
    ]
  },
  {
    id: 'high-perf',
    emoji: '📡',
    name: 'High-Performance Relay',
    desc: 'For hilltop and tower installations. Maximum range, maximum reliability.',
    color: '#A78BFA',
    items: [
      { match: 'LILYGO T-BeamSUPREME', cat: 'Node' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'XRDS -RF SMA to N Cable', cat: 'Cable' },
      { match: 'Eightwood N Male to N Male Jumper', cat: 'Cable' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (10.2', cat: 'Enclosure' },
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'Voltaic Systems V50', cat: 'Power' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
      { match: 'GOUNENGNAIL 4ft Grounding Rod', cat: 'Grounding' },
    ]
  }
];

// HTML Template
function renderHTML(parts) {
  const categories = Object.keys(parts).sort();
  const totalItems = Object.values(parts).reduce((sum, items) => sum + items.length, 0);

  // Build a flat lookup for kit matching
  const allItems = [];
  Object.entries(parts).forEach(([cat, items]) => {
    items.forEach(item => allItems.push({ ...item, category: cat }));
  });

  // Render kits
  let kitsHTML = '';
  KITS.forEach(kit => {
    let kitItemsHTML = '';
    let totalPrice = 0;
    let hasUnpriced = false;
    let itemCount = 0;

    if (kit.hardcoded && kit.hardcodedItems) {
      kit.hardcodedItems.forEach(item => {
        itemCount++;
        const price = item.price;
        if (price) {
          totalPrice += parseFloat(price.replace('$', '').replace(',', ''));
        } else {
          hasUnpriced = true;
        }
        const priceSpan = price
          ? '<span class="kit-item-price">' + price + '</span>'
          : '<span class="kit-item-price tbd">TBD</span>';
        const notesSpan = item.notes ? '<span class="kit-item-notes">' + escapeHtml(item.notes) + '</span>' : '';
        kitItemsHTML += '<li class="kit-item turnkey-item">'
          + '<div class="kit-item-main">'
          + '<a href="' + item.url + '" target="_blank" rel="noopener noreferrer">'
          + '<span class="kit-item-name">' + escapeHtml(item.name) + '</span>'
          + '<svg class="link-arrow" viewBox="0 0 20 20" width="12" height="12"><path fill="currentColor" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"/></svg>'
          + '</a>' + priceSpan + '</div>'
          + notesSpan + '</li>';
      });
    } else {
      kit.items.forEach(spec => {
        const found = allItems.find(i => i.item.includes(spec.match));
        if (!found) return;
        itemCount++;
        const price = found.price && found.price !== '-' && found.price !== '$-' ? found.price : null;
        if (price) {
          totalPrice += parseFloat(price.replace('$', '').replace(',', ''));
        } else {
          hasUnpriced = true;
        }
        const priceSpan = price
          ? '<span class="kit-item-price">' + price + '</span>'
          : '<span class="kit-item-price tbd">TBD</span>';
        kitItemsHTML += '<li class="kit-item">'
          + '<a href="' + found.amazonUrl + '" target="_blank" rel="noopener noreferrer">'
          + '<span class="kit-item-name">' + escapeHtml(found.item) + '</span>'
          + '<svg class="link-arrow" viewBox="0 0 20 20" width="12" height="12"><path fill="currentColor" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"/></svg>'
          + '</a>' + priceSpan + '</li>';
      });
    }

    let priceLabel;
    if (kit.standalone) {
      // For standalone kits (like Turn-Key), show price range not total
      const prices = (kit.hardcodedItems || [])
        .map(i => i.price ? parseFloat(i.price.replace(/[~$,]/g, '')) : null)
        .filter(p => p !== null);
      if (prices.length > 0) {
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        priceLabel = '$' + minP.toFixed(0) + ' – $' + maxP.toFixed(0) + ' each';
      } else {
        priceLabel = 'See items';
      }
    } else {
      priceLabel = totalPrice > 0
        ? (hasUnpriced ? '~$' + totalPrice.toFixed(0) + '+' : '~$' + totalPrice.toFixed(0))
        : 'See items';
    }

    kitsHTML += '<div class="kit-card' + (kit.recommended ? ' recommended' : '') + '" style="--kit-color: ' + kit.color + '">'
      + '<div class="kit-header">'
      + (kit.recommended ? '<span class="kit-badge">⭐ RECOMMENDED</span>' : '')
      + '<div class="kit-title-row">'
      + '<span class="kit-emoji">' + kit.emoji + '</span>'
      + '<div class="kit-title-text">'
      + '<h3 class="kit-name">' + kit.name + '</h3>'
      + '<p class="kit-desc">' + kit.desc + '</p>'
      + '</div>'
      + '<div class="kit-meta">'
      + '<span class="kit-price-tag">' + priceLabel + '</span>'
      + '<span class="kit-count">' + itemCount + ' items</span>'
      + '</div>'
      + '<svg class="kit-chevron" viewBox="0 0 20 20" width="20" height="20"><path fill="currentColor" d="M6.22 8.72a.75.75 0 011.06 0L10 11.44l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L6.22 9.78a.75.75 0 010-1.06z"/></svg>'
      + '</div></div>'
      + '<ul class="kit-items">' + kitItemsHTML + '</ul>'
      + '</div>';
  });

  // Category nav pills
  let categoryPills = categories.map(cat => {
    const catInfo = CATEGORIES[cat] || { emoji: '📋', color: '#666' };
    return `<a href="#cat-${cat.replace(/\s+/g, '-')}" class="cat-pill" style="--pill-color: ${catInfo.color}">${catInfo.emoji} ${cat}</a>`;
  }).join('');

  let categoryCards = '';

  categories.forEach(category => {
    const items = parts[category];
    const catInfo = CATEGORIES[category] || { emoji: '📋', color: '#666' };

    let itemRows = '';
    items.forEach(item => {
      const priceDisplay = item.price && item.price !== '-' && item.price !== '$-'
        ? `<span class="price">${item.price}</span>`
        : '';

      itemRows += `
        <tr class="item-row" data-search="${escapeHtml(item.item.toLowerCase())} ${escapeHtml(item.notes.toLowerCase())} ${category.toLowerCase()}">
          <td class="item-name">
            <a href="${item.amazonUrl}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(item.item)}
              <svg class="link-arrow" viewBox="0 0 20 20" width="14" height="14"><path fill="currentColor" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"/></svg>
            </a>
          </td>
          <td class="item-price">${priceDisplay}</td>
          <td class="item-notes">${escapeHtml(item.notes)}</td>
        </tr>
      `;
    });

    categoryCards += `
      <div class="category-card" id="cat-${category.replace(/\s+/g, '-')}" data-category="${category.toLowerCase()}">
        <div class="category-header" style="--cat-color: ${catInfo.color}">
          <span class="category-emoji">${catInfo.emoji}</span>
          <span class="category-name">${category}</span>
          <span class="category-count">${items.length}</span>
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NC Mesh - Parts List</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0e17;
      min-height: 100vh;
      color: #c8d6e5;
    }

    /* Mesh grid background */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        linear-gradient(rgba(103,234,148,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(103,234,148,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
      z-index: 0;
    }

    body::after {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at 20% 0%, rgba(103,234,148,0.08) 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 100%, rgba(103,234,148,0.05) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
      position: relative;
      z-index: 1;
    }

    /* ── Header ── */
    header {
      text-align: center;
      margin-bottom: 1rem;
      padding: 0.6rem 1.2rem;
      background: linear-gradient(135deg, rgba(103,234,148,0.08) 0%, rgba(16,24,40,0.9) 50%, rgba(103,234,148,0.05) 100%);
      border-radius: 20px;
      border: 1px solid rgba(103,234,148,0.2);
      position: relative;
      overflow: hidden;
    }

    header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(103,234,148,0.06), transparent);
      animation: headerShimmer 8s ease-in-out infinite;
    }

    @keyframes headerShimmer {
      0%, 100% { transform: translateX(-100%); }
      50% { transform: translateX(100%); }
    }

    .header-content { position: relative; z-index: 1; }

    /* Mesh network SVG icon */
    .mesh-icon {
      width: 28px;
      height: 28px;
      margin: 0 auto 0.2rem;
      filter: drop-shadow(0 0 12px rgba(103,234,148,0.5));
    }

    h1 {
      font-size: 1.4rem;
      font-weight: 900;
      background: linear-gradient(135deg, #67EA94 0%, #4ade80 40%, #a7f3d0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.2rem;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: #6b7b8d;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 0.4rem;
    }

    .stat {
      background: linear-gradient(135deg, rgba(103,234,148,0.12), rgba(103,234,148,0.04));
      padding: 0.3rem 1.2rem;
      border-radius: 12px;
      border: 1px solid rgba(103,234,148,0.25);
      box-shadow: 0 4px 24px rgba(103,234,148,0.08);
    }

    .stat-value {
      font-size: 1.2rem;
      font-weight: 800;
      color: #67EA94;
      text-shadow: 0 0 20px rgba(103,234,148,0.4);
    }

    .stat-label {
      font-size: 0.8rem;
      color: #6b7b8d;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
    }

    /* ── Search Bar ── */
    .search-wrap {
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 1rem 0;
      background: rgba(10,14,23,0.85);
      backdrop-filter: blur(16px);
      margin-bottom: 1rem;
    }

    .search-bar {
      display: flex;
      align-items: center;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(103,234,148,0.2);
      border-radius: 14px;
      padding: 0.6rem 1.2rem;
      gap: 0.75rem;
      transition: border-color 0.3s, box-shadow 0.3s;
    }

    .search-bar:focus-within {
      border-color: rgba(103,234,148,0.5);
      box-shadow: 0 0 20px rgba(103,234,148,0.1);
    }

    .search-bar svg { color: #67EA94; flex-shrink: 0; }

    .search-bar input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: #e0e8f0;
      font-size: 1rem;
      font-family: inherit;
    }

    .search-bar input::placeholder { color: #4a5568; }

    .search-count {
      color: #4a5568;
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }

    /* ── Category Nav Pills ── */
    .cat-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 2rem;
      justify-content: center;
    }

    .cat-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 1rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      color: #c8d6e5;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      transition: all 0.2s;
    }

    .cat-pill:hover {
      background: color-mix(in srgb, var(--pill-color) 20%, transparent);
      border-color: var(--pill-color);
      color: #fff;
      box-shadow: 0 0 12px color-mix(in srgb, var(--pill-color) 30%, transparent);
    }

    /* ── Category Cards ── */
    .category-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      border-radius: 16px;
      margin-bottom: 1.5rem;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.07);
      transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
    }

    .category-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 30px rgba(103,234,148,0.06);
      border-color: rgba(103,234,148,0.15);
    }

    .category-card.hidden { display: none; }

    .category-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.5rem;
      background: linear-gradient(90deg, color-mix(in srgb, var(--cat-color) 15%, transparent), transparent);
      border-left: 4px solid var(--cat-color);
      gap: 0.75rem;
    }

    .category-emoji { font-size: 1.5rem; }

    .category-name {
      font-weight: 700;
      font-size: 1.3rem;
      flex-grow: 1;
      color: #f0f4f8;
    }

    .category-count {
      background: color-mix(in srgb, var(--cat-color) 20%, transparent);
      color: var(--cat-color);
      padding: 0.2rem 0.8rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      border: 1px solid color-mix(in srgb, var(--cat-color) 30%, transparent);
    }

    /* ── Table ── */
    .items-table { width: 100%; border-collapse: collapse; }

    .items-table th {
      text-align: left;
      padding: 0.75rem 1.5rem;
      background: rgba(0,0,0,0.3);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #5a6b7d;
    }

    .items-table td {
      padding: 0.9rem 1.5rem;
      border-top: 1px solid rgba(255,255,255,0.04);
    }

    .items-table tr:hover td { background: rgba(103,234,148,0.03); }
    .items-table tr.hidden { display: none; }

    .item-name { width: 50%; }

    .item-name a {
      color: #67EA94;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .item-name a:hover {
      color: #a7f3d0;
      text-shadow: 0 0 12px rgba(103,234,148,0.3);
    }

    .link-arrow {
      opacity: 0;
      transform: translateX(-4px);
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .item-name a:hover .link-arrow {
      opacity: 1;
      transform: translateX(0);
    }

    .item-price { width: 15%; }

    .price {
      display: inline-block;
      background: linear-gradient(135deg, rgba(103,234,148,0.2), rgba(103,234,148,0.08));
      color: #67EA94;
      padding: 0.3rem 0.9rem;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.85rem;
      border: 1px solid rgba(103,234,148,0.2);
      text-shadow: 0 0 8px rgba(103,234,148,0.3);
    }

    .item-notes {
      width: 35%;
      color: #6b7b8d;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    /* ── BMAC Banner ── */
    .bmac-banner {
      text-align: center;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
      background: linear-gradient(135deg, rgba(255,180,60,0.08), rgba(255,100,50,0.05));
      border: 1px solid rgba(255,180,60,0.2);
      border-radius: 16px;
    }

    .bmac-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f0d9a0;
      margin-bottom: 0.3rem;
    }

    .bmac-sub {
      font-size: 0.85rem;
      color: #7a6f5f;
      margin-bottom: 1rem;
    }

    .bmac-link {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      transition: transform 0.2s;
    }

    .bmac-link:hover { transform: scale(1.05); }

    .bmac-link img { border-radius: 8px; }

    .bmac-thanks {
      background: rgba(255,180,60,0.15);
      color: #f0d9a0;
      padding: 0.3rem 0.8rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      border: 1px solid rgba(255,180,60,0.25);
    }

    .gh-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.75rem;
      color: #5a6b7d;
      text-decoration: none;
      font-size: 0.78rem;
      font-weight: 500;
      transition: color 0.2s;
    }

    .gh-link:hover { color: #c8d6e5; }

    /* ── Kits Section ── */
    .kits-section {
      margin-bottom: 2.5rem;
    }

    .kits-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .kits-title {
      font-size: 1.8rem;
      font-weight: 800;
      color: #f0f4f8;
      margin-bottom: 0.3rem;
    }

    .kits-subtitle {
      color: #5a6b7d;
      font-size: 0.95rem;
    }

    .kits-grid {
      display: grid;
      gap: 1rem;
    }

    .kit-card.recommended {
      border: 2px solid color-mix(in srgb, var(--kit-color) 60%, transparent);
      box-shadow: 0 0 20px color-mix(in srgb, var(--kit-color) 15%, transparent);
    }

    .kit-badge {
      display: inline-block;
      background: linear-gradient(135deg, #10B981, #059669);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      margin-bottom: 0.5rem;
    }

    .kit-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      border: 1px solid color-mix(in srgb, var(--kit-color) 25%, transparent);
      border-radius: 16px;
      overflow: hidden;
      transition: box-shadow 0.3s, border-color 0.3s;
    }

    .kit-card:hover {
      border-color: color-mix(in srgb, var(--kit-color) 45%, transparent);
      box-shadow: 0 0 30px color-mix(in srgb, var(--kit-color) 10%, transparent);
    }

    .kit-header {
      padding: 1.2rem 1.5rem;
      cursor: pointer;
      background: linear-gradient(90deg, color-mix(in srgb, var(--kit-color) 10%, transparent), transparent);
      user-select: none;
    }

    .kit-title-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .kit-emoji { font-size: 2rem; flex-shrink: 0; }

    .kit-title-text { flex: 1; min-width: 0; }

    .kit-name {
      font-size: 1.2rem;
      font-weight: 700;
      color: #f0f4f8;
      margin-bottom: 0.15rem;
    }

    .kit-desc {
      font-size: 0.85rem;
      color: #6b7b8d;
      line-height: 1.4;
    }

    .kit-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.4rem;
      flex-shrink: 0;
    }

    .kit-price-tag {
      background: linear-gradient(135deg, color-mix(in srgb, var(--kit-color) 25%, transparent), color-mix(in srgb, var(--kit-color) 10%, transparent));
      color: var(--kit-color);
      padding: 0.3rem 1rem;
      border-radius: 999px;
      font-weight: 800;
      font-size: 0.95rem;
      border: 1px solid color-mix(in srgb, var(--kit-color) 30%, transparent);
      white-space: nowrap;
    }

    .kit-count {
      font-size: 0.75rem;
      color: #5a6b7d;
      font-weight: 600;
    }

    .kit-chevron {
      color: #5a6b7d;
      flex-shrink: 0;
      transition: transform 0.3s;
    }

    .kit-card.expanded .kit-chevron { transform: rotate(180deg); }

    .kit-items {
      list-style: none;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease;
      border-top: 1px solid transparent;
    }

    .kit-card.expanded .kit-items {
      max-height: 600px;
      border-top-color: rgba(255,255,255,0.06);
    }

    .kit-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 1.5rem 0.65rem 4.5rem;
      border-top: 1px solid rgba(255,255,255,0.03);
    }

    .kit-item:first-child { border-top: none; }

    .turnkey-item { flex-direction: column; align-items: flex-start; }
    .turnkey-item .kit-item-main { display: flex; align-items: center; justify-content: space-between; width: 100%; }
    .kit-item-notes { font-size: 0.78rem; color: #6b7b8d; margin-top: 0.2rem; font-style: italic; }

    .kit-item a {
      color: #67EA94;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.9rem;
      font-weight: 500;
      transition: color 0.2s;
      min-width: 0;
    }

    .kit-item a:hover { color: #a7f3d0; }

    .kit-item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .kit-item-price {
      font-weight: 700;
      font-size: 0.85rem;
      color: #67EA94;
      white-space: nowrap;
      margin-left: 1rem;
    }

    .kit-item-price.tbd { color: #5a6b7d; }

    .parts-divider {
      text-align: center;
      margin: 2.5rem 0 1.5rem;
      position: relative;
    }

    .parts-divider::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(103,234,148,0.2), transparent);
    }

    .parts-divider span {
      background: #0a0e17;
      padding: 0 1.5rem;
      position: relative;
      font-size: 1.4rem;
      font-weight: 700;
      color: #8899aa;
    }

    /* ── Footer ── */
    footer {
      text-align: center;
      margin-top: 3rem;
      padding: 2rem;
      color: #3d4f5f;
      font-size: 0.875rem;
      border-top: 1px solid rgba(255,255,255,0.05);
    }

    footer a {
      color: #67EA94;
      text-decoration: none;
      font-weight: 600;
    }

    footer a:hover { text-decoration: underline; }

    .update-time {
      margin-top: 0.5rem;
      font-size: 0.75rem;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .container { padding: 1rem; }
      h1 { font-size: 1.8rem; }
      .stats { flex-direction: column; gap: 0.75rem; align-items: center; }
      .stat { padding: 0.75rem 1.5rem; }
      .items-table th, .items-table td { padding: 0.7rem 1rem; }
      .item-notes { display: none; }
      .item-name { width: 65%; }
      .item-price { width: 35%; }
      .cat-nav { gap: 0.35rem; }
      .cat-pill { font-size: 0.7rem; padding: 0.3rem 0.7rem; }
      .kit-title-row { flex-wrap: wrap; }
      .kit-desc { display: none; }
      .kit-item { padding-left: 1.5rem; }
      .kit-item-name { max-width: 200px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-content">
        <svg class="mesh-icon" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="20" r="8" fill="#67EA94" opacity="0.9"/>
          <circle cx="20" cy="55" r="8" fill="#67EA94" opacity="0.7"/>
          <circle cx="80" cy="55" r="8" fill="#67EA94" opacity="0.7"/>
          <circle cx="35" cy="82" r="6" fill="#67EA94" opacity="0.5"/>
          <circle cx="65" cy="82" r="6" fill="#67EA94" opacity="0.5"/>
          <circle cx="50" cy="50" r="5" fill="#67EA94" opacity="0.4"/>
          <line x1="50" y1="20" x2="20" y2="55" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="50" y1="20" x2="80" y2="55" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="20" y1="55" x2="80" y2="55" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="20" y1="55" x2="35" y2="82" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="80" y1="55" x2="65" y2="82" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="35" y1="82" x2="65" y2="82" stroke="#67EA94" stroke-width="1.5" opacity="0.3"/>
          <line x1="50" y1="50" x2="50" y2="20" stroke="#67EA94" stroke-width="1" opacity="0.2"/>
          <line x1="50" y1="50" x2="20" y2="55" stroke="#67EA94" stroke-width="1" opacity="0.2"/>
          <line x1="50" y1="50" x2="80" y2="55" stroke="#67EA94" stroke-width="1" opacity="0.2"/>
        </svg>
        <h1>NC Mesh Parts List</h1>
        <p class="subtitle">Recommended parts for building Meshtastic nodes in North Carolina</p>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${totalItems}</div>
            <div class="stat-label">Total Items</div>
          </div>
          <div class="stat">
            <div class="stat-value">${categories.length}</div>
            <div class="stat-label">Categories</div>
          </div>
        </div>
      </div>
    </header>

    <div class="search-wrap">
      <div class="search-bar">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" stroke-width="2"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" id="searchInput" placeholder="Search parts, categories, notes..." autocomplete="off">
        <span class="search-count" id="searchCount">${totalItems} items</span>
      </div>
    </div>

    <div class="bmac-banner">
      <p class="bmac-title">☕ Buy me Claude Code credits or support a project! ☕</p>
      <p class="bmac-sub">Every donation keeps the code flowing — these tools are built with your support.</p>
      <a href="https://buymeacoffee.com/dpaschal" target="_blank" rel="noopener noreferrer" class="bmac-link">
        <img src="https://cdn.buymeacoffee.com/buttons/v2/default-red.png" alt="Buy Me A Coffee" height="50">
        <span class="bmac-thanks">Thanks! 💛</span>
      </a>
      <a href="https://github.com/dpaschal" target="_blank" rel="noopener noreferrer" class="gh-link">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        dpaschal on GitHub
      </a>
    </div>

    <section class="kits-section">
      <div class="kits-header">
        <h2 class="kits-title">⚡ Quick Start Kits</h2>
        <p class="kits-subtitle">Curated bundles to get you started fast — click to expand</p>
      </div>
      <div class="kits-grid">
        ${kitsHTML}
      </div>
    </section>

    <h2 class="parts-divider"><span>📋 Full Parts List</span></h2>

    <nav class="cat-nav">
      ${categoryPills}
    </nav>

    <main>
      ${categoryCards}
    </main>

    <footer>
      <p>Click any item to search on Amazon · Prices are approximate</p>
      <p>Maintained by <a href="https://paschal-engineering.com">Paschal Engineering</a> for the NC Mesh community</p>
      <p class="update-time">Data refreshes every 5 minutes · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
    </footer>
  </div>

  <script>
    document.querySelectorAll('.kit-header').forEach(function(header) {
      header.addEventListener('click', function() {
        this.closest('.kit-card').classList.toggle('expanded');
      });
    });

    const input = document.getElementById('searchInput');
    const countEl = document.getElementById('searchCount');
    const rows = document.querySelectorAll('.item-row');
    const cards = document.querySelectorAll('.category-card');

    input.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      let visible = 0;

      cards.forEach(card => {
        const cardRows = card.querySelectorAll('.item-row');
        let cardVisible = 0;
        cardRows.forEach(row => {
          const match = !q || row.dataset.search.includes(q);
          row.classList.toggle('hidden', !match);
          if (match) { cardVisible++; visible++; }
        });
        card.classList.toggle('hidden', cardVisible === 0);
      });

      countEl.textContent = visible + ' item' + (visible !== 1 ? 's' : '');
    });
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Routes
app.get('/', async (req, res) => {
  try {
    const parts = await fetchParts();
    res.send(renderHTML(parts));
  } catch (error) {
    res.status(500).send('Error loading parts list');
  }
});

app.get('/api/parts', async (req, res) => {
  try {
    const parts = await fetchParts();
    res.json(parts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

// Start main application server
app.listen(PORT, () => {
  console.log(`NC Mesh Parts List running on http://localhost:${PORT}`);
});

// Dedicated health server on separate port (internal only, no rate limiting)
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz' || req.url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`Health server running on http://localhost:${HEALTH_PORT}`);
});
