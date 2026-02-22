const cheerio = require('cheerio');

function mount(app, db) {
  app.get('/api/images/:asin', async (req, res) => {
    const { asin } = req.params;

    // Validate ASIN format (10 alphanumeric characters)
    if (!/^[A-Z0-9]{10}$/i.test(asin)) {
      return res.redirect('/img/placeholder.svg');
    }

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
