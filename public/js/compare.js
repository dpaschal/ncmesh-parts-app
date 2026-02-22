/**
 * Compare module — select items to compare side-by-side in a table.
 * Exposed as window.Compare IIFE.
 */
window.Compare = (function () {
  'use strict';

  var MAX_ITEMS = 4;

  // ── State ──
  var selectedIds = new Set();
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
   * Get the image source for an item (mirrors modal.js pattern).
   */
  function getImageSrc(item) {
    if (item.asin) {
      return '/api/images/' + encodeURIComponent(item.asin);
    }
    return '/img/placeholder.svg';
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
   * Show a brief flash message near the compare bar.
   */
  function showFlashMessage(msg) {
    var existing = document.getElementById('compare-flash');
    if (existing) existing.remove();

    var flash = document.createElement('div');
    flash.id = 'compare-flash';
    flash.textContent = msg;
    flash.style.cssText =
      'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
      'background:rgba(239,68,68,0.9);color:#fff;padding:0.5rem 1.25rem;' +
      'border-radius:var(--radius-sm,6px);font-size:0.85rem;font-weight:600;' +
      'z-index:200;pointer-events:none;animation:fadeInOut 2s ease forwards;';
    document.body.appendChild(flash);

    setTimeout(function () {
      if (flash.parentNode) flash.remove();
    }, 2000);
  }

  // ── Compare Bar ──

  /**
   * Show/hide the compare bar based on selection count.
   */
  function updateBar() {
    var bar = document.getElementById('compare-bar');
    var countEl = document.getElementById('compare-count');
    if (!bar) return;

    var count = selectedIds.size;
    if (count >= 2) {
      bar.classList.remove('hidden');
      if (countEl) {
        countEl.textContent = count + ' item' + (count !== 1 ? 's' : '') + ' selected';
      }
    } else {
      bar.classList.add('hidden');
    }
  }

  // ── Button State ──

  /**
   * Update all .btn-compare buttons to reflect current selection state.
   */
  function updateButtonStates() {
    var buttons = document.querySelectorAll('.btn-compare');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var id = btn.getAttribute('data-id');
      if (id && selectedIds.has(id)) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    }
  }

  // ── Toggle ──

  /**
   * Add or remove an item from the comparison set.
   */
  function toggle(itemId) {
    if (!itemId) return;

    if (selectedIds.has(itemId)) {
      // Remove
      selectedIds.delete(itemId);
    } else {
      // Add — enforce max
      if (selectedIds.size >= MAX_ITEMS) {
        showFlashMessage('Max ' + MAX_ITEMS + ' items for comparison');
        return;
      }
      selectedIds.add(itemId);
    }

    updateBar();
    updateButtonStates();
  }

  // ── Comparison Table ──

  /**
   * Build and show the comparison table in the compare modal.
   */
  function showComparison() {
    var container = document.getElementById('compare-table-container');
    var modal = document.getElementById('compare-modal');
    if (!container || !modal) return;

    // Gather selected items
    var items = [];
    selectedIds.forEach(function (id) {
      var item = findItemById(id);
      if (item) items.push(item);
    });

    if (items.length < 2) return;

    // Build table
    var table = document.createElement('table');

    // Row 1: Image
    var imgRow = document.createElement('tr');
    var imgHeader = document.createElement('th');
    imgHeader.textContent = '';
    imgRow.appendChild(imgHeader);
    for (var i = 0; i < items.length; i++) {
      var imgTd = document.createElement('td');
      imgTd.style.textAlign = 'center';
      var img = document.createElement('img');
      img.src = getImageSrc(items[i]);
      img.alt = escapeHtml(items[i].item);
      img.style.cssText = 'max-width:120px;max-height:100px;object-fit:contain;border-radius:6px;';
      img.loading = 'lazy';
      img.onerror = function () {
        this.onerror = null;
        this.src = '/img/placeholder.svg';
      };
      imgTd.appendChild(img);
      imgRow.appendChild(imgTd);
    }
    table.appendChild(imgRow);

    // Row 2: Name
    var nameRow = document.createElement('tr');
    var nameHeader = document.createElement('th');
    nameHeader.textContent = 'Name';
    nameRow.appendChild(nameHeader);
    for (var n = 0; n < items.length; n++) {
      var nameTd = document.createElement('td');
      nameTd.style.fontWeight = '600';
      nameTd.style.color = 'var(--text-bright)';
      nameTd.textContent = escapeHtml(items[n].item);
      nameRow.appendChild(nameTd);
    }
    table.appendChild(nameRow);

    // Row 3: Price
    var priceRow = document.createElement('tr');
    var priceHeader = document.createElement('th');
    priceHeader.textContent = 'Price';
    priceRow.appendChild(priceHeader);
    for (var p = 0; p < items.length; p++) {
      var priceTd = document.createElement('td');
      var priceVal = items[p].price && items[p].price !== '-' ? items[p].price : '--';
      priceTd.textContent = escapeHtml(priceVal);
      priceTd.style.color = 'var(--green)';
      priceTd.style.fontWeight = '600';
      priceRow.appendChild(priceTd);
    }
    table.appendChild(priceRow);

    // Row 4: Category
    var catRow = document.createElement('tr');
    var catHeader = document.createElement('th');
    catHeader.textContent = 'Category';
    catRow.appendChild(catHeader);
    for (var c = 0; c < items.length; c++) {
      var catTd = document.createElement('td');
      var info = items[c].categoryInfo || { emoji: '' };
      catTd.textContent = (info.emoji ? info.emoji + ' ' : '') + escapeHtml(items[c].category);
      catRow.appendChild(catTd);
    }
    table.appendChild(catRow);

    // Row 5: Notes
    var notesRow = document.createElement('tr');
    var notesHeader = document.createElement('th');
    notesHeader.textContent = 'Notes';
    notesRow.appendChild(notesHeader);
    for (var t = 0; t < items.length; t++) {
      var notesTd = document.createElement('td');
      notesTd.textContent = escapeHtml(items[t].notes || '--');
      notesRow.appendChild(notesTd);
    }
    table.appendChild(notesRow);

    // Insert into container
    container.innerHTML = '';
    container.appendChild(table);

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  // ── Clear ──

  /**
   * Clear all selections and reset UI.
   */
  function clear() {
    selectedIds.clear();
    updateBar();
    updateButtonStates();
  }

  /**
   * Hide the compare modal.
   */
  function hideModal() {
    var modal = document.getElementById('compare-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
  }

  // ── Initialization ──

  /**
   * Initialize the compare module.
   * @param {Array} items — flat array of all catalog items
   */
  function init(items) {
    allItems = items || [];

    // Event delegation for .btn-compare clicks (catalog grid + modal)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-compare');
      if (btn) {
        e.stopPropagation();
        var id = btn.getAttribute('data-id');
        if (id) toggle(id);
        return;
      }
    });

    // Compare bar buttons
    var compareBtn = document.getElementById('compare-btn');
    if (compareBtn) {
      compareBtn.addEventListener('click', function () {
        showComparison();
      });
    }

    var clearBtn = document.getElementById('compare-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clear();
      });
    }

    // Compare modal close handlers
    var modal = document.getElementById('compare-modal');
    if (modal) {
      var closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          hideModal();
        });
      }

      var backdrop = modal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', function () {
          hideModal();
        });
      }
    }
  }

  // ── Public API ──
  return {
    init: init,
    toggle: toggle,
    clear: clear,
    showComparison: showComparison
  };
})();
