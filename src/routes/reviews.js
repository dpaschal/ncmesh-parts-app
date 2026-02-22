const crypto = require('crypto');

function mount(app, db) {
  // GET /api/reviews/:productId — get reviews for a product
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

  // POST /api/reviews — submit a review
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

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
}

module.exports = { mount };
