/**
 * Catalog module — product card grid, search, filtering, sort.
 * Exposed as window.Catalog IIFE.
 */
window.Catalog = (function () {
  'use strict';

  // ── State ──
  let allItems = [];
  let filteredItems = [];
  let activeCategory = null;
  let activeQuery = '';
  let currentSort = 'default';
  let partsDataRef = {};
  let priceLookupRef = {};

  // ── DOM refs (resolved once on init) ──
  let gridEl, searchInput, sortSelect, searchCountEl, categoryNav;

  // ── Helpers ──

  /**
   * Escape HTML to prevent XSS. Creates a text node and reads back the markup.
   */
  function escapeHtml(text) {
    if (text == null) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  /**
   * Extract a numeric price from a string like "$12.99", "~$40", "$1,299.00".
   * Returns 0 if unparseable.
   */
  function parsePrice(p) {
    if (p == null || p === '' || p === '-') return 0;
    var cleaned = String(p).replace(/[^0-9.]/g, '');
    var num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Get the best display price for an item — prefers priceLookup data, falls
   * back to the item's own price field.
   */
  function getDisplayPrice(item) {
    var lookup = priceLookupRef[item.item];
    if (lookup && lookup.priceDisplay) return lookup.priceDisplay;
    if (item.price && item.price !== '-') return item.price;
    return null;
  }

  /**
   * Get the numeric price for sorting — prefers priceLookup.
   */
  function getNumericPrice(item) {
    var lookup = priceLookupRef[item.item];
    if (lookup && typeof lookup.price === 'number') return lookup.price;
    return parsePrice(item.price);
  }

  // ── Category Pills ──

  function buildCategoryPills(partsData) {
    if (!categoryNav) return;
    categoryNav.innerHTML = '';

    // "All" pill
    var allPill = document.createElement('button');
    allPill.className = 'cat-pill active';
    allPill.textContent = 'All';
    allPill.setAttribute('data-category', '');
    allPill.style.setProperty('--pill-color', 'var(--green)');
    allPill.addEventListener('click', function () {
      filterByCategory(null);
    });
    categoryNav.appendChild(allPill);

    // One pill per category, sorted alphabetically
    var categories = Object.keys(partsData).sort();
    categories.forEach(function (cat) {
      var items = partsData[cat];
      if (!items || items.length === 0) return;
      var info = items[0].categoryInfo || { emoji: '', color: '#666' };

      var pill = document.createElement('button');
      pill.className = 'cat-pill';
      pill.setAttribute('data-category', cat);
      pill.style.setProperty('--pill-color', info.color);
      pill.textContent = info.emoji + ' ' + cat;
      pill.addEventListener('click', function () {
        filterByCategory(cat);
      });
      categoryNav.appendChild(pill);
    });
  }

  /**
   * Update pill highlight state to reflect activeCategory.
   */
  function updatePillHighlights() {
    if (!categoryNav) return;
    var pills = categoryNav.querySelectorAll('.cat-pill');
    pills.forEach(function (pill) {
      var pillCat = pill.getAttribute('data-category');
      if (activeCategory === null && pillCat === '') {
        pill.classList.add('active');
      } else if (activeCategory && pillCat === activeCategory) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // ── Card Creation ──

  /**
   * Create a product card DOM element for an item.
   */
  function createCard(item) {
    var card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-category', item.category || '');
    card.setAttribute('data-id', item.id || '');
    // Build searchable text (lowercase for fast matching)
    card.setAttribute('data-search', [
      item.item || '',
      item.notes || '',
      item.category || ''
    ].join(' ').toLowerCase());

    var info = item.categoryInfo || { emoji: '', color: '#666' };
    var displayPrice = getDisplayPrice(item);

    // Image / category hero
    var imageDiv = document.createElement('div');
    imageDiv.className = 'card-image';
    if (item.imageUrl) {
      // Direct Amazon image URL from ASIN map
      var img = document.createElement('img');
      img.src = item.imageUrl;
      img.alt = item.item;
      img.loading = 'lazy';
      img.onerror = function () {
        this.onerror = null;
        // Fall back to category emoji hero on image load failure
        this.remove();
        imageDiv.style.background = 'linear-gradient(135deg, ' + (info.color || '#666') + '30, ' + (info.color || '#666') + '18)';
        imageDiv.style.borderBottom = '2px solid ' + (info.color || '#666') + '55';
        var fallback = document.createElement('span');
        fallback.className = 'card-image-emoji';
        fallback.textContent = info.emoji || '\uD83D\uDCE6';
        imageDiv.appendChild(fallback);
      };
      imageDiv.appendChild(img);
    } else {
      // Category-colored hero with large emoji
      imageDiv.style.background = 'linear-gradient(135deg, ' + (info.color || '#666') + '30, ' + (info.color || '#666') + '18)';
      imageDiv.style.borderBottom = '2px solid ' + (info.color || '#666') + '55';
      var emojiSpan = document.createElement('span');
      emojiSpan.className = 'card-image-emoji';
      emojiSpan.textContent = info.emoji || '\uD83D\uDCE6';
      imageDiv.appendChild(emojiSpan);
    }
    card.appendChild(imageDiv);

    // Body
    var body = document.createElement('div');
    body.className = 'card-body';
    body.style.cursor = 'pointer';

    // Category badge
    var catSpan = document.createElement('span');
    catSpan.className = 'card-category';
    catSpan.style.setProperty('--cat-color', info.color);
    catSpan.textContent = info.emoji + ' ' + item.category;
    body.appendChild(catSpan);

    // Title
    var title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = item.item;
    body.appendChild(title);

    // Price (only if exists and isn't '-')
    if (displayPrice) {
      var priceSpan = document.createElement('span');
      priceSpan.className = 'card-price';
      priceSpan.textContent = displayPrice;
      body.appendChild(priceSpan);
    }

    // Notes
    if (item.notes) {
      var notesP = document.createElement('p');
      notesP.className = 'card-notes';
      notesP.textContent = item.notes;
      body.appendChild(notesP);
    }

    // Click body to open modal (if ProductModal exists)
    body.addEventListener('click', function () {
      if (window.ProductModal && typeof window.ProductModal.open === 'function') {
        window.ProductModal.open(item);
      }
    });

    card.appendChild(body);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'card-actions';

    // Buy on Amazon link
    var buyLink = document.createElement('a');
    buyLink.href = item.amazonUrl || '#';
    buyLink.target = '_blank';
    buyLink.rel = 'noopener noreferrer';
    buyLink.className = 'btn btn-buy';
    var url = item.amazonUrl || '';
    if (url.indexOf('amazon.com') !== -1) {
      buyLink.textContent = 'Buy on Amazon';
    } else if (url.indexOf('seeedstudio.com') !== -1) {
      buyLink.textContent = 'Buy on Seeed';
    } else if (url.indexOf('rakwireless.com') !== -1) {
      buyLink.textContent = 'Buy on RAK';
    } else if (url.indexOf('uniteng.com') !== -1) {
      buyLink.textContent = 'Buy on Unit Eng';
    } else {
      buyLink.textContent = 'View Product';
    }
    actions.appendChild(buyLink);

    // Compare button
    var compareBtn = document.createElement('button');
    compareBtn.className = 'btn-icon btn-compare';
    compareBtn.title = 'Compare';
    compareBtn.setAttribute('data-id', item.id || '');
    compareBtn.innerHTML = '\u2696\uFE0F';
    actions.appendChild(compareBtn);

    // Wishlist button
    var wishlistBtn = document.createElement('button');
    wishlistBtn.className = 'btn-icon btn-wishlist';
    wishlistBtn.title = 'Add to list';
    wishlistBtn.setAttribute('data-id', item.id || '');
    wishlistBtn.innerHTML = '\uD83D\uDCCB';
    actions.appendChild(wishlistBtn);

    // Watch Price bell button
    var watchBtn = document.createElement('button');
    watchBtn.className = 'btn-icon btn-watch-price';
    watchBtn.title = 'Watch Price';
    watchBtn.setAttribute('data-id', item.id || '');
    watchBtn.innerHTML = '\uD83D\uDD14';
    actions.appendChild(watchBtn);

    card.appendChild(actions);

    // Add-ons slide-out panel
    if (item.addons && item.addons.length > 0) {
      var addonsPanel = document.createElement('div');
      addonsPanel.className = 'card-addons';

      var addonsLabel = document.createElement('div');
      addonsLabel.className = 'card-addons-label';
      addonsLabel.textContent = 'Recommended Add-on';
      addonsPanel.appendChild(addonsLabel);

      // Store addon IDs for resolution after render
      addonsPanel.setAttribute('data-addon-ids', JSON.stringify(item.addons));

      card.appendChild(addonsPanel);
      card.classList.add('has-addons');
    }

    return card;
  }

  /**
   * Resolve add-on panels after all items are rendered.
   * Finds referenced items by ID and populates the slide-out content.
   */
  function resolveAddons() {
    var panels = document.querySelectorAll('.card-addons[data-addon-ids]');
    panels.forEach(function (panel) {
      var ids = JSON.parse(panel.getAttribute('data-addon-ids') || '[]');
      ids.forEach(function (addonId) {
        var addonItem = null;
        for (var i = 0; i < allItems.length; i++) {
          if (allItems[i].id === addonId) { addonItem = allItems[i]; break; }
        }
        if (!addonItem) return;

        var row = document.createElement('a');
        row.className = 'card-addon-item';
        row.href = addonItem.amazonUrl || '#';
        row.target = '_blank';
        row.rel = 'noopener noreferrer';

        if (addonItem.imageUrl) {
          var thumb = document.createElement('img');
          thumb.src = addonItem.imageUrl;
          thumb.alt = addonItem.item;
          thumb.className = 'card-addon-thumb';
          thumb.loading = 'lazy';
          row.appendChild(thumb);
        }

        var addonText = document.createElement('div');
        addonText.className = 'card-addon-text';

        var addonName = document.createElement('span');
        addonName.className = 'card-addon-name';
        addonName.textContent = addonItem.item;
        addonText.appendChild(addonName);

        if (addonItem.price) {
          var addonPrice = document.createElement('span');
          addonPrice.className = 'card-addon-price';
          addonPrice.textContent = addonItem.price;
          addonText.appendChild(addonPrice);
        }

        row.appendChild(addonText);
        panel.appendChild(row);
      });
    });
  }

  // ── Rendering ──

  /**
   * Clear the grid and render the given items array.
   */
  function render(items) {
    if (!gridEl) return;
    gridEl.innerHTML = '';

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      fragment.appendChild(createCard(item));
    });
    gridEl.appendChild(fragment);

    // Resolve add-on references
    resolveAddons();

    // Update search count
    if (searchCountEl) {
      searchCountEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');
    }
  }

  // ── Filtering ──

  /**
   * Apply the current search query and category filter, then sort and render.
   */
  function applyFilters() {
    var query = activeQuery.toLowerCase().trim();
    var tokens = query ? query.split(/\s+/) : [];

    filteredItems = allItems.filter(function (item) {
      // Category filter
      if (activeCategory && item.category !== activeCategory) return false;

      // Search filter — all tokens must match somewhere in item name, notes, or category
      if (tokens.length > 0) {
        var searchText = [
          item.item || '',
          item.notes || '',
          item.category || ''
        ].join(' ').toLowerCase();

        for (var i = 0; i < tokens.length; i++) {
          if (searchText.indexOf(tokens[i]) === -1) return false;
        }
      }

      return true;
    });

    // Apply sort
    applySort();

    render(filteredItems);
  }

  /**
   * Sort filteredItems in place based on currentSort.
   */
  function applySort() {
    switch (currentSort) {
      case 'name':
        filteredItems.sort(function (a, b) {
          return (a.item || '').localeCompare(b.item || '');
        });
        break;
      case 'price-asc':
        filteredItems.sort(function (a, b) {
          return getNumericPrice(a) - getNumericPrice(b);
        });
        break;
      case 'price-desc':
        filteredItems.sort(function (a, b) {
          return getNumericPrice(b) - getNumericPrice(a);
        });
        break;
      // 'default' — keep original order (no sorting needed)
    }
  }

  /**
   * Filter by search query. Called from external code or the search input handler.
   */
  function filterBySearch(query) {
    activeQuery = query || '';
    applyFilters();
  }

  /**
   * Filter by category. Updates pill highlights and re-applies filters.
   */
  function filterByCategory(category) {
    activeCategory = category || null;
    updatePillHighlights();
    applyFilters();
  }

  // ── Initialization ──

  /**
   * Initialize the catalog module.
   * @param {Array} items — flat array of all items
   * @param {Object} partsData — items grouped by category (from /api/parts)
   * @param {Object} priceLookup — map of item name to price data (from /api/prices)
   */
  function init(items, partsData, priceLookup) {
    allItems = items || [];
    partsDataRef = partsData || {};
    priceLookupRef = priceLookup || {};

    // Resolve DOM references
    gridEl = document.getElementById('catalog-grid');
    searchInput = document.getElementById('searchInput');
    sortSelect = document.getElementById('sortSelect');
    searchCountEl = document.getElementById('searchCount');
    categoryNav = document.getElementById('categoryNav');

    // Build category pills
    buildCategoryPills(partsDataRef);

    // Wire search input (debounced)
    if (searchInput) {
      var debounceTimer = null;
      searchInput.addEventListener('input', function () {
        var value = this.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          filterBySearch(value);
        }, 150);
      });
    }

    // Wire sort select
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        currentSort = this.value;
        applyFilters();
      });
    }

    // Initial render — show all items
    applyFilters();
  }

  // ── Public API ──
  return {
    init: init,
    filterBySearch: filterBySearch,
    filterByCategory: filterByCategory
  };
})();
