const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');
const partsRoutes = require('./routes/parts');
const reviewsRoutes = require('./routes/reviews');

/**
 * Start the application. Returns a promise resolving to
 * { app: appServer, health: healthServer }.
 */
async function start() {
  const PORT = process.env.PORT || 3000;
  const HEALTH_PORT = process.env.HEALTH_PORT || 9090;
  const DB_PATH = process.env.DB_PATH || undefined;

  // Initialize database
  const db = initDB(DB_PATH);

  const app = express();

  // Trust proxy (required for rate limiting behind Traefik)
  app.set('trust proxy', 1);

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://cdn.buymeacoffee.com",
          "https://images-na.ssl-images-amazon.com",
          "https://m.media-amazon.com"
        ],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  // Rate limiting — 100 requests per 15 minutes per IP (skip in test env)
  if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });
    app.use(limiter);
  }

  // Parse JSON bodies
  app.use(express.json());

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Mount API routes
  partsRoutes.mount(app);
  reviewsRoutes.mount(app, db);

  // Fallback: serve index.html for any unmatched GET request (SPA support)
  // Express 5 requires named wildcard parameters
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Start main application server
  const appServer = await new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`NC Mesh Parts List running on http://localhost:${PORT}`);
      resolve(server);
    });
  });

  // Dedicated health server on separate port (internal only, no rate limiting)
  const healthServer = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/healthz' || req.url === '/ready') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(HEALTH_PORT, () => {
      console.log(`Health server running on http://localhost:${HEALTH_PORT}`);
      resolve(server);
    });
  });

  return { app: appServer, health: healthServer };
}

// Auto-start only when run directly
if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { start };
