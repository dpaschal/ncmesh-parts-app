const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Google Sheets published CSV URL
const GOOGLE_SHEET_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6heV4SwmFTDup6g4DDCLd7mXE1nToDl0tEWqI9DDcY9Hb-Lpttml1iG7X2tdb5jbij4EnN1pUG-qQ/pub?output=csv';

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Amazon Associates affiliate tag
const AFFILIATE_TAG = 'dpaschal26-20';

// Category definitions with emoji and color
const CATEGORIES = {
  'Node':       { emoji: '\u{1F4E1}', color: '#4CAF50' },
  'Antenna':    { emoji: '\u{1F4F6}', color: '#2196F3' },
  'Cable':      { emoji: '\u{1F50C}', color: '#FF9800' },
  'Adapter':    { emoji: '\u{1F517}', color: '#9C27B0' },
  'Connector':  { emoji: '\u{1F517}', color: '#9C27B0' },
  'Power':      { emoji: '\u{1F50B}', color: '#F44336' },
  'Enclosure':  { emoji: '\u{1F4E6}', color: '#795548' },
  'Mounting':   { emoji: '\u{1F529}', color: '#607D8B' },
  'Hardware':   { emoji: '\u{1F527}', color: '#607D8B' },
  'Radio':      { emoji: '\u{1F4FB}', color: '#E91E63' },
  'Tools':      { emoji: '\u{1F6E0}\uFE0F', color: '#FF5722' },
  'Electronics': { emoji: '\u26A1',   color: '#FFEB3B' },
  'Network':    { emoji: '\u{1F310}', color: '#00BCD4' },
  'Reference':  { emoji: '\u{1F4DA}', color: '#3F51B5' },
  'Emergency':  { emoji: '\u{1F6A8}', color: '#F44336' },
  'Materials':  { emoji: '\u{1F9F1}', color: '#8D6E63' },
  'Grounding':  { emoji: '\u26A1',   color: '#FFC107' }
};

// In-memory cache
let cache = { data: null, timestamp: 0 };

/**
 * Fetch parts from Google Sheets CSV, parse, group by category.
 * Results are cached for CACHE_TTL milliseconds.
 */
async function fetchParts() {
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

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

    const item = row.Item || '';

    // Generate a stable ID from the item name
    const id = item
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);

    // Amazon search URL with affiliate tag
    const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(item)}&tag=${AFFILIATE_TAG}`;

    grouped[category].push({
      id,
      item,
      price: row.Price || '',
      notes: row.Notes || '',
      category,
      categoryInfo: CATEGORIES[category] || { emoji: '\u{1F4CB}', color: '#666' },
      amazonUrl,
      asin: row.ASIN || null
    });
  });

  cache = { data: grouped, timestamp: now };
  return grouped;
}

/**
 * Mount parts-related API routes on the Express app.
 */
function mount(app) {
  // GET /api/parts — returns grouped parts JSON
  app.get('/api/parts', async (req, res) => {
    try {
      const parts = await fetchParts();
      res.json(parts);
    } catch (error) {
      console.error('Error fetching parts:', error);
      res.status(500).json({ error: 'Failed to fetch parts' });
    }
  });

  // GET /api/prices — returns prices.json from project root
  app.get('/api/prices', (req, res) => {
    try {
      const pricesPath = path.join(__dirname, '..', '..', 'prices.json');
      const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
      res.json(data);
    } catch (error) {
      console.error('Error reading prices.json:', error);
      res.status(500).json({ error: 'Failed to load prices' });
    }
  });
}

module.exports = { mount, fetchParts, CATEGORIES, AFFILIATE_TAG };
