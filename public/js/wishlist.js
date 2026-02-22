/**
 * Wishlist module — shopping list with localStorage persistence and shareable URLs.
 * Exposed as window.Wishlist IIFE.
 */
window.Wishlist = (function () {
  'use strict';

  var STORAGE_KEY = 'ncmesh-wishlist';

  // ── State ──
  var items = [];
  var allItems = [];

  // ── Helpers ──

  /**
   * Escape HTML to prevent XSS.
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
   * Find an item from allItems by its ID.
   */
  function findItemById(id) {
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].id === id) return allItems[i];
    }
    return null;
  }

  /**
   * Check if an item is already in the wishlist.
   */
  function isInList(itemId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) return true;
    }
    return false;
  }

  /**
   * Show a brief flash message near the wishlist toggle button.
   */
  function showFlash(msg) {
    var existing = document.getElementById('wishlist-flash');
    if (existing) existing.remove();

    var flash = document.createElement('div');
    flash.id = 'wishlist-flash';
    flash.textContent = msg;
    flash.style.cssText =
      'position:fixed;bottom:80px;right:24px;' +
      'background:rgba(103,234,148,0.95);color:#0a0f0d;padding:0.5rem 1.25rem;' +
      'border-radius:var(--radius-sm,6px);font-size:0.85rem;font-weight:600;' +
      'z-index:200;pointer-events:none;animation:fadeInOut 2s ease forwards;';
    document.body.appendChild(flash);

    setTimeout(function () {
      if (flash.parentNode) flash.remove();
    }, 2000);
  }

  // ── Persistence ──

  /**
   * Save wishlist to localStorage.
   */
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  /**
   * Load wishlist from localStorage.
   */
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  // ── Core Actions ──

  /**
   * Add an item to the wishlist by its ID.
   */
  function add(itemId) {
    if (isInList(itemId)) return;

    var item = findItemById(itemId);
    if (!item) return;

    items.push({
      id: item.id,
      item: item.item,
      price: item.price || '-',
      amazonUrl: item.amazonUrl || '',
      qty: 1
    });

    save();
    render();
    updateButtonStates();
    showFlash('Added to list!');
  }

  /**
   * Remove an item from the wishlist by its ID.
   */
  function remove(itemId) {
    items = items.filter(function (entry) {
      return entry.id !== itemId;
    });
    save();
    render();
    updateButtonStates();
  }

  /**
   * Change quantity of a wishlist item (+1 or -1, minimum 1).
   */
  function updateQty(itemId, delta) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        items[i].qty = Math.max(1, items[i].qty + delta);
        break;
      }
    }
    save();
    render();
  }

  // ── Button State ──

  /**
   * Update all .btn-wishlist buttons to reflect current wishlist state.
   */
  function updateButtonStates() {
    var buttons = document.querySelectorAll('.btn-wishlist');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var id = btn.getAttribute('data-id');
      if (id && isInList(id)) {
        btn.classList.add('in-list');
      } else {
        btn.classList.remove('in-list');
      }
    }
  }

  // ── Rendering ──

  /**
   * Render the wishlist panel contents, total, and badge.
   */
  function render() {
    var container = document.getElementById('wishlist-items');
    var totalEl = document.getElementById('wishlist-total');
    var badgeEl = document.getElementById('wishlist-badge');

    // Render items
    if (container) {
      container.innerHTML = '';
      var fragment = document.createDocumentFragment();

      for (var i = 0; i < items.length; i++) {
        var entry = items[i];

        var row = document.createElement('div');
        row.className = 'wishlist-item';

        var info = document.createElement('div');
        info.className = 'wishlist-item-info';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'wishlist-item-name';
        nameSpan.textContent = escapeHtml(entry.item);
        info.appendChild(nameSpan);

        var priceSpan = document.createElement('span');
        priceSpan.className = 'wishlist-item-price';
        priceSpan.textContent = escapeHtml(entry.price);
        info.appendChild(priceSpan);

        row.appendChild(info);

        var controls = document.createElement('div');
        controls.className = 'wishlist-item-controls';

        var minusBtn = document.createElement('button');
        minusBtn.className = 'btn-icon qty-btn';
        minusBtn.setAttribute('data-id', entry.id);
        minusBtn.setAttribute('data-delta', '-1');
        minusBtn.innerHTML = '&minus;';
        controls.appendChild(minusBtn);

        var qtySpan = document.createElement('span');
        qtySpan.className = 'qty';
        qtySpan.textContent = entry.qty;
        controls.appendChild(qtySpan);

        var plusBtn = document.createElement('button');
        plusBtn.className = 'btn-icon qty-btn';
        plusBtn.setAttribute('data-id', entry.id);
        plusBtn.setAttribute('data-delta', '1');
        plusBtn.innerHTML = '+';
        controls.appendChild(plusBtn);

        var removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon remove-btn';
        removeBtn.setAttribute('data-id', entry.id);
        removeBtn.innerHTML = '&times;';
        controls.appendChild(removeBtn);

        row.appendChild(controls);
        fragment.appendChild(row);
      }

      container.appendChild(fragment);
    }

    // Calculate and display total
    var total = 0;
    for (var t = 0; t < items.length; t++) {
      total += parsePrice(items[t].price) * items[t].qty;
    }
    if (totalEl) {
      totalEl.textContent = 'Total: $' + total.toFixed(2);
    }

    // Update badge
    var count = 0;
    for (var c = 0; c < items.length; c++) {
      count += items[c].qty;
    }
    if (badgeEl) {
      badgeEl.textContent = count;
      if (count > 0) {
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.classList.add('hidden');
      }
    }
  }

  // ── Panel Toggle ──

  /**
   * Show or hide the wishlist panel and overlay.
   */
  function togglePanel() {
    var panel = document.getElementById('wishlist-panel');
    var overlay = document.getElementById('wishlist-overlay');

    if (panel) panel.classList.toggle('hidden');
    if (overlay) overlay.classList.toggle('hidden');
  }

  // ── Share / Export ──

  /**
   * Generate a shareable URL with ?list= param and copy to clipboard.
   */
  function shareURL() {
    if (items.length === 0) {
      showFlash('List is empty!');
      return;
    }

    var ids = items.map(function (entry) {
      return entry.id;
    }).join(',');

    var url = window.location.origin + window.location.pathname + '?list=' + encodeURIComponent(ids);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showFlash('Link copied!');
      }, function () {
        showFlash('Could not copy link');
      });
    } else {
      // Fallback for older browsers
      var input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showFlash('Link copied!');
    }
  }

  /**
   * Open each item's Amazon URL in a new tab with 200ms stagger.
   */
  function buyAll() {
    if (items.length === 0) return;

    for (var i = 0; i < items.length; i++) {
      (function (index) {
        setTimeout(function () {
          var url = items[index] && items[index].amazonUrl;
          if (url) {
            window.open(url, '_blank');
          }
        }, index * 200);
      })(i);
    }
  }

  /**
   * Build a markdown text list of wishlist items and copy to clipboard.
   */
  function exportText() {
    if (items.length === 0) {
      showFlash('List is empty!');
      return;
    }

    var total = 0;
    var lines = ['NC Mesh Shopping List'];

    for (var i = 0; i < items.length; i++) {
      var entry = items[i];
      var price = entry.price && entry.price !== '-' ? ' (' + entry.price + ')' : '';
      var qty = entry.qty > 1 ? ' x' + entry.qty : '';
      lines.push('- ' + entry.item + price + qty);
      total += parsePrice(entry.price) * entry.qty;
    }

    lines.push('Total: ~$' + total.toFixed(2));

    var text = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showFlash('List copied!');
      }, function () {
        showFlash('Could not copy list');
      });
    } else {
      var input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showFlash('List copied!');
    }
  }

  // ── URL Loading ──

  /**
   * If URL has ?list=id1,id2,id3, add those items to the wishlist.
   */
  function loadFromURL(allItemsRef) {
    if (allItemsRef) allItems = allItemsRef;

    var params = new URLSearchParams(window.location.search);
    var listParam = params.get('list');
    if (!listParam) return;

    var ids = listParam.split(',');
    var added = false;

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i].trim();
      if (id && !isInList(id)) {
        var item = findItemById(id);
        if (item) {
          items.push({
            id: item.id,
            item: item.item,
            price: item.price || '-',
            amazonUrl: item.amazonUrl || '',
            qty: 1
          });
          added = true;
        }
      }
    }

    if (added) {
      save();
      render();
      updateButtonStates();
    }
  }

  // ── Initialization ──

  /**
   * Initialize the wishlist module.
   * @param {Array} itemsRef — flat array of all catalog items
   */
  function init(itemsRef) {
    allItems = itemsRef || [];

    // Load persisted wishlist from localStorage
    items = load();

    // ── Event delegation for .btn-wishlist clicks (catalog grid and modal) ──
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-wishlist');
      if (btn) {
        e.stopPropagation();
        var id = btn.getAttribute('data-id');
        if (id) {
          if (isInList(id)) {
            remove(id);
          } else {
            add(id);
          }
        }
        return;
      }
    });

    // ── Panel toggle buttons ──
    var toggleBtn = document.getElementById('wishlist-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        togglePanel();
      });
    }

    var closeBtn = document.getElementById('wishlist-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        togglePanel();
      });
    }

    var overlay = document.getElementById('wishlist-overlay');
    if (overlay) {
      overlay.addEventListener('click', function () {
        togglePanel();
      });
    }

    // ── Footer action buttons ──
    var buyAllBtn = document.getElementById('wishlist-buy-all');
    if (buyAllBtn) {
      buyAllBtn.addEventListener('click', function () {
        buyAll();
      });
    }

    var shareBtn = document.getElementById('wishlist-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        shareURL();
      });
    }

    var exportBtn = document.getElementById('wishlist-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportText();
      });
    }

    // ── Event delegation inside #wishlist-items for qty and remove buttons ──
    var wishlistContainer = document.getElementById('wishlist-items');
    if (wishlistContainer) {
      wishlistContainer.addEventListener('click', function (e) {
        var qtyBtn = e.target.closest('.qty-btn');
        if (qtyBtn) {
          var id = qtyBtn.getAttribute('data-id');
          var delta = parseInt(qtyBtn.getAttribute('data-delta'), 10);
          if (id && !isNaN(delta)) {
            updateQty(id, delta);
          }
          return;
        }

        var removeBtn = e.target.closest('.remove-btn');
        if (removeBtn) {
          var removeId = removeBtn.getAttribute('data-id');
          if (removeId) {
            remove(removeId);
          }
          return;
        }
      });
    }

    // Initial render (from localStorage data)
    render();
    updateButtonStates();
  }

  // ── Public API ──
  return {
    init: init,
    loadFromURL: loadFromURL,
    add: add,
    remove: remove,
    updateQty: updateQty,
    togglePanel: togglePanel,
    shareURL: shareURL,
    buyAll: buyAll,
    exportText: exportText,
    render: render,
    isInList: isInList
  };
})();
