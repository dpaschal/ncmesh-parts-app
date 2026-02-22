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

    // Initialize price alerts (bell icons, subscribe popover)
    if (window.Alerts) {
      window.Alerts.init(allItems);
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


// __ Populate Community Featured Section __
(function () {
  fetch('/api/parts')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var communityItems = [];
      var categories = Object.keys(data);
      for (var c = 0; c < categories.length; c++) {
        var items = data[categories[c]];
        for (var i = 0; i < items.length; i++) {
          if (items[i].community) communityItems.push(items[i]);
        }
      }
      if (communityItems.length === 0) return;

      var section = document.getElementById('community-featured');
      var grid = document.getElementById('community-featured-grid');
      if (!section || !grid) return;

      section.style.display = '';

      for (var j = 0; j < communityItems.length; j++) {
        var item = communityItems[j];
        var card = document.createElement('div');
        card.className = 'community-featured-card';

        var info = document.createElement('div');
        info.className = 'community-featured-card-info';

        var name = document.createElement('div');
        name.className = 'community-featured-card-name';
        name.textContent = item.item;
        info.appendChild(name);

        if (item.communityMaker) {
          var maker = document.createElement('div');
          maker.className = 'community-featured-card-maker';
          maker.textContent = 'by ' + item.communityMaker;
          info.appendChild(maker);
        }

        if (item.notes) {
          var desc = document.createElement('div');
          desc.className = 'community-featured-card-desc';
          desc.textContent = item.notes;
          info.appendChild(desc);
        }

        card.appendChild(info);

        if (item.communityLinks) {
          var links = document.createElement('div');
          links.className = 'community-featured-card-links';

          if (item.communityLinks.discord) {
            var dLink = document.createElement('a');
            dLink.href = item.communityLinks.discord;
            dLink.target = '_blank';
            dLink.rel = 'noopener noreferrer';
            dLink.className = 'community-link-discord';
            dLink.textContent = 'Discord';
            links.appendChild(dLink);
          }

          if (item.communityLinks.github) {
            var gLink = document.createElement('a');
            gLink.href = item.communityLinks.github;
            gLink.target = '_blank';
            gLink.rel = 'noopener noreferrer';
            gLink.className = 'community-link-github';
            gLink.textContent = 'GitHub';
            links.appendChild(gLink);
          }

          card.appendChild(links);
        }

        grid.appendChild(card);
      }
    });
})();
