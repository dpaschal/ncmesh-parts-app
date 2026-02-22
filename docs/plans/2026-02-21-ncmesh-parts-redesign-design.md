# NC Mesh Parts Page v2 — Redesign

**Date:** 2026-02-21
**Status:** Approved
**Thread:** cortex #24 (ncmesh-parts-page)

## Goals

Full redesign of the NC Mesh parts page — visual overhaul, architecture refactor, and new features. Serve both newcomers (guided experience) and experienced members (fast catalog access).

## Architecture

### Static Frontend + Express API

Split the current 40KB monolithic `server.js` into two concerns:

**Frontend** — Vanilla HTML/CSS/JS served as static files
- `public/index.html` — main page shell
- `public/css/styles.css` — all styles
- `public/js/app.js` — main application logic
- `public/js/wizard.js` — guided kit selector
- `public/js/catalog.js` — product card grid, filtering, search
- `public/js/compare.js` — comparison view
- `public/js/wishlist.js` — shopping list management
- `public/js/reviews.js` — community reviews UI
- `public/js/alerts.js` — price alert subscription UI

**API** — Express backend (slim)
- `GET /api/parts` — parts catalog from Google Sheets CSV (5-min cache)
- `GET /api/prices` — dynamic pricing from prices.json
- `GET /api/images/:asin` — proxy Amazon product images (avoids CORS)
- `GET /api/reviews/:productId` — fetch reviews for a product
- `POST /api/reviews` — submit a review (authenticated)
- `GET /api/alerts` — list user's price alert subscriptions
- `POST /api/alerts` — subscribe to a price alert
- `DELETE /api/alerts/:id` — unsubscribe
- Health endpoints on `:9090` (unchanged)

Single Express server serves both static files and API routes. Single container image.

### Data Storage

- **Google Sheets CSV** — source of truth for parts catalog (unchanged)
- **prices.json** — dynamic pricing cache from price-checker.js (unchanged)
- **SQLite** (via `better-sqlite3`) — reviews, ratings, price alert subscriptions
- **localStorage** — wishlist/comparison state (client-side, no account needed)

## Deployment

### Primary: Forge (K3s)

- Domain: `node-parts.paschal.ai`
- Served via Cloudflare Tunnel → Traefik → K3s pod
- Same namespace (`monitoring`), same resource profile

### Failover: Cloud Run (GCP)

- Same container image deployed to Cloud Run (paschal-homelab project, us-east1)
- Cloudflare DNS health-check failover: if forge tunnel goes down, Cloudflare routes traffic to Cloud Run
- Zero cost during normal operation — Cloud Run only serves when forge is unreachable

### Failover Mechanism

Cloudflare health checks poll `node-parts.paschal.ai` on forge. On failure:
1. Cloudflare detects tunnel/origin is down
2. DNS automatically fails over to Cloud Run origin
3. When forge recovers, traffic returns to primary

## Frontend Design

### Visual Style

- **Dark theme** — kept, with #67EA94 green accents (Meshtastic brand)
- **Modernized** — better typography (system font stack), more whitespace, card-based layout
- Subtle borders and shadows on cards, no heavy gradients
- Mesh grid background simplified/toned down from current animated version
- Mobile-first responsive design

### Page Sections

#### 1. Hero + Guided Wizard

Top of page. "Find Your Perfect Node" heading.

3-4 step wizard flow:
1. **What's your budget?** — Under $50 / $50-150 / $150+ / No limit
2. **What's the use case?** — Portable (EDC/hiking) / Solar (permanent outdoor) / Relay (hilltop/tower) / Home/desk / PoE (wired install)
3. **Experience level?** — First node / Have a few nodes / Building infrastructure

Based on answers, recommend a curated kit with:
- List of items with individual prices
- Total kit price
- "Buy All" button (opens Amazon links)
- "Add to List" button

"Skip to catalog →" link visible throughout for experienced users.

#### 2. Product Catalog

Grid of product cards below the wizard.

**Each card contains:**
- Amazon product image (via `/api/images/:asin` proxy)
- Product name
- Price (dynamic from prices.json where available, otherwise from Google Sheet)
- Category badge (colored pill)
- Star rating (average from community reviews)
- "Buy" button (Amazon affiliate link)
- "Compare" checkbox
- "Add to List" button

**Filtering/Search:**
- Sticky search bar at top of catalog section
- Category filter pills (existing 18 categories with emoji)
- Sort dropdown: Price (low/high), Rating, Name
- Live count of matching items

#### 3. Product Detail (Modal/Expandable)

Clicking a card opens a detail view:
- Larger product image
- Full description and notes from Google Sheet
- Community reviews and ratings
- Star breakdown (5/4/3/2/1 distribution)
- "Write a Review" form
- Related items (same category)
- Direct affiliate buy link

#### 4. Comparison View

Triggered when 2+ items are checked for comparison:
- Sticky comparison bar at bottom: "Compare (N items)" button
- Opens side-by-side table: name, image, price, category, rating, notes
- Highlight differences
- "Clear" and "Add to List" actions

#### 5. Wishlist / Shopping List

- Saved in localStorage (no account needed)
- Accessible via nav icon (cart/list icon)
- Shows all saved items with quantities
- Total price calculation
- "Share List" — generates URL with item IDs encoded in hash fragment
- "Buy All on Amazon" — opens all affiliate links
- Export as text (for Discord/sharing)

#### 6. Price Alerts

- Available per-product on the product card ("Watch Price" bell icon)
- Enter email address to subscribe
- Notifications sent via Resend API when price-checker detects >5% drop
- Simple unsubscribe link in email
- Alert subscriptions stored in SQLite

## Reviews System

### Authentication

Simple approach — no full user accounts:
- Submit review with a display name + optional Discord handle
- Anti-spam: rate limit (1 review per product per IP per 24h), honeypot field
- Optional future enhancement: Discord OAuth for verified reviews

### Review Schema (SQLite)

```sql
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    product_id TEXT NOT NULL,        -- matches Google Sheet item identifier
    display_name TEXT NOT NULL,
    discord_handle TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title TEXT,
    body TEXT NOT NULL,
    ip_hash TEXT NOT NULL,           -- hashed IP for rate limiting
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved INTEGER DEFAULT 1       -- moderation flag
);
```

### Moderation

- Auto-approve by default (community is small and trusted)
- Admin endpoint to flag/remove reviews if needed
- Rate limiting prevents spam

## Price Alerts System

### Subscription Schema (SQLite)

```sql
CREATE TABLE price_alerts (
    id INTEGER PRIMARY KEY,
    product_id TEXT NOT NULL,
    email TEXT NOT NULL,
    threshold_pct REAL DEFAULT 5.0,  -- notify on this % drop
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_notified DATETIME,
    active INTEGER DEFAULT 1,
    unsubscribe_token TEXT NOT NULL
);
```

### Flow

1. User clicks "Watch Price" on a product card
2. Enters email, optional threshold (default 5%)
3. `POST /api/alerts` creates subscription
4. `price-checker.js` runs daily, detects price changes
5. If price drops >= threshold, sends email via Resend API with:
   - Product name, old price, new price, % change
   - Direct affiliate buy link
   - Unsubscribe link

## Amazon Product Images

### Approach: Server-Side Proxy

`GET /api/images/:asin` endpoint:
1. Fetch Amazon product page server-side
2. Extract primary product image URL from page HTML (Cheerio)
3. Cache image URL in memory (or SQLite) with TTL (24h)
4. Redirect or proxy the image bytes to the client

Fallback: if ASIN not available or scrape fails, serve a category-specific placeholder icon.

### ASIN Mapping

Add an `asin` column to the Google Sheet. For items without ASINs (non-Amazon products), use category placeholder images.

## Dependencies

### Existing (kept)
- express ^5.2.1
- helmet ^8.1.0
- csv-parse ^6.1.0
- cheerio ^1.2.0
- node-fetch ^3.3.2
- express-rate-limit ^8.2.1

### New
- better-sqlite3 — reviews and alerts storage
- resend — email notifications for price alerts
- crypto (built-in) — unsubscribe tokens, IP hashing

## Migration Path

1. Create new file structure (`public/`, `src/`) alongside existing `server.js`
2. Build new frontend and API incrementally
3. Test on forge K3s first
4. Deploy to Cloud Run
5. Configure Cloudflare failover health checks
6. Retire old monolithic `server.js`

## Success Criteria

- Page loads in <2s on mobile
- Wizard recommends appropriate kit in 3 clicks
- All 108+ affiliate links preserved with dpaschal26-20 tag
- Reviews submittable without creating an account
- Price alerts deliver email within 1 hour of price-checker detecting a drop
- Cloudflare failover switches to Cloud Run within 60s of forge outage
- Mobile-responsive — usable on phone screens
