/**
 * NC Mesh Parts List — Main entry point.
 * Fetches data from the API, then initializes all UI modules.
 */
(async function () {
  'use strict';

  try {
    // Fetch parts and prices in parallel
    var results = await Promise.all([
      fetch('/api/parts'),
      fetch('/api/prices')
    ]);

    var partsRes = results[0];
    var pricesRes = results[1];

    if (!partsRes.ok) throw new Error('Failed to fetch parts: ' + partsRes.status);

    var partsData = await partsRes.json();
    var pricesData = pricesRes.ok ? await pricesRes.json() : {};

    // Build price lookup map: item name -> price object
    var priceLookup = {};
    if (pricesData.products) {
      pricesData.products.forEach(function (p) {
        priceLookup[p.name] = p;
      });
    }

    // Flatten all items into a single array (preserving original order)
    var allItems = [];
    Object.entries(partsData).forEach(function (entry) {
      var items = entry[1];
      items.forEach(function (item) {
        allItems.push(item);
      });
    });

    // Update header stats
    var totalEl = document.getElementById('total-items');
    var catEl = document.getElementById('total-categories');
    if (totalEl) totalEl.textContent = allItems.length;
    if (catEl) catEl.textContent = Object.keys(partsData).length;

    // Initialize catalog (product cards, search, filtering)
    if (window.Catalog) {
      window.Catalog.init(allItems, partsData, priceLookup);
    }

    // Initialize wizard (guided node builder)
    if (window.Wizard) {
      window.Wizard.init();
    }

    // Parse URL for shared wishlist
    if (window.Wishlist) {
      window.Wishlist.loadFromURL(allItems);
    }
  } catch (err) {
    console.error('NC Mesh app initialization failed:', err);

    // Show a user-visible error in the grid area
    var grid = document.getElementById('catalog-grid');
    if (grid) {
      grid.innerHTML =
        '<div style="text-align:center;padding:3rem;color:#ef4444;">' +
        '<p style="font-size:1.1rem;font-weight:700;">Failed to load parts data</p>' +
        '<p style="margin-top:0.5rem;color:#6b7b8d;">Please refresh the page or try again later.</p>' +
        '</div>';
    }
  }
})();
