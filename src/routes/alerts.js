const crypto = require('crypto');

function mount(app, db) {
  // POST /api/alerts — subscribe to a price alert
  app.post('/api/alerts', (req, res) => {
    const { product_id, email, threshold_pct } = req.body;

    // Validation
    if (!product_id) {
      return res.status(400).json({ error: 'Missing required field: product_id' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Missing required field: email' });
    }
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const unsubscribe_token = crypto.randomBytes(16).toString('hex');
    const pct = threshold_pct != null ? threshold_pct : 5.0;

    const stmt = db.prepare(
      'INSERT INTO price_alerts (product_id, email, threshold_pct, unsubscribe_token) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(product_id, email, pct, unsubscribe_token);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      unsubscribe_token
    });
  });

  // GET /api/alerts/unsubscribe/:token — unsubscribe from a price alert
  app.get('/api/alerts/unsubscribe/:token', (req, res) => {
    const stmt = db.prepare(
      'UPDATE price_alerts SET active = 0 WHERE unsubscribe_token = ? AND active = 1'
    );
    const result = stmt.run(req.params.token);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ message: 'Unsubscribed successfully' });
  });
}

module.exports = { mount };
