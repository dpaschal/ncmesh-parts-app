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

    // Give the product modal access to all items (for related items section)
    if (window.ProductModal) {
      window.ProductModal.setAllItems(allItems);
    }

    // Initialize comparison view (side-by-side product compare)
    if (window.Compare) {
      window.Compare.init(allItems);
    }

    // Initialize wizard (guided node builder)
    if (window.Wizard) {
      window.Wizard.init();
    }

    // Handle wizard-complete event — resolve match-based kit items against catalog
    var wizardEl = document.getElementById('wizard');
    if (wizardEl) {
      wizardEl.addEventListener('wizard-complete', function (e) {
        var kitId = e.detail && e.detail.kitId;
        if (!kitId || !window.KITS) return;

        // Find the kit
        var kit = null;
        for (var k = 0; k < window.KITS.length; k++) {
          if (window.KITS[k].id === kitId) { kit = window.KITS[k]; break; }
        }
        if (!kit || !kit.items) return;

        // Resolve each kit item against allItems by partial name match
        var resolvedItems = [];
        for (var i = 0; i < kit.items.length; i++) {
          var matchStr = kit.items[i].match.toLowerCase();
          for (var j = 0; j < allItems.length; j++) {
            var itemName = (allItems[j].item || '').toLowerCase();
            if (itemName.indexOf(matchStr.toLowerCase()) !== -1) {
              // Enrich with price from priceLookup if available
              var enriched = allItems[j];
              var lookup = priceLookup[allItems[j].item];
              if (lookup && lookup.priceDisplay && (!enriched.price || enriched.price === '-')) {
                enriched = Object.assign({}, allItems[j], { price: lookup.priceDisplay });
              }
              resolvedItems.push(enriched);
              break;
            }
          }
        }

        // Render the result via the Wizard module
        if (window.Wizard && typeof window.Wizard.renderMatchResult === 'function') {
          window.Wizard.renderMatchResult(kit, resolvedItems);
        }
      });
    }

    // Initialize wishlist (localStorage persistence, event listeners)
    if (window.Wishlist) {
      window.Wishlist.init(allItems);
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
