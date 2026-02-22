const fs = require('fs');
const path = require('path');

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
  'Grounding':  { emoji: '\u26A1',   color: '#FFC107' },
  'Solar':      { emoji: '\u2600\uFE0F', color: '#FF9800' },
  'Sensor':     { emoji: '\u{1F321}\uFE0F', color: '#00BCD4' }
};

// Load parts from local JSON file
let partsData = [];
try {
  const partsPath = path.join(__dirname, '..', '..', 'data', 'parts.json');
  partsData = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
} catch (e) {
  console.error('Failed to load data/parts.json:', e.message);
}

/**
 * Build grouped parts object from the local JSON data.
 */
function buildParts() {
  const grouped = {};

  partsData.forEach(entry => {
    const category = entry.category || 'Other';
    if (!grouped[category]) {
      grouped[category] = [];
    }

    const name = entry.name || '';
    const asin = entry.asin || null;

    // Generate a stable ID from the item name
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);

    // Use vendor URL if provided, otherwise Amazon affiliate link
    const amazonUrl = entry.url
      ? entry.url
      : asin
        ? `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`
        : `https://www.amazon.com/s?k=${encodeURIComponent(name)}&tag=${AFFILIATE_TAG}`;

    grouped[category].push({
      id,
      item: name,
      price: entry.price || '',
      notes: entry.notes || '',
      category,
      categoryInfo: CATEGORIES[category] || { emoji: '\u{1F4CB}', color: '#666' },
      amazonUrl,
      asin,
      imageUrl: entry.image || null,
      addons: entry.addons || null,
      community: entry.community || false,
      communityMaker: entry.communityMaker || null,
      communityLinks: entry.communityLinks || null
    });
  });

  return grouped;
}

/**
 * Mount parts-related API routes on the Express app.
 */
function mount(app) {
  // GET /api/parts — returns grouped parts JSON
  app.get('/api/parts', (req, res) => {
    try {
      const parts = buildParts();
      res.json(parts);
    } catch (error) {
      console.error('Error building parts:', error);
      res.status(500).json({ error: 'Failed to load parts' });
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

module.exports = { mount, buildParts, CATEGORIES, AFFILIATE_TAG };
