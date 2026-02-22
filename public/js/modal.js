/**
 * Product Detail Modal — opens on card click, shows full product info.
 * Exposed as window.ProductModal IIFE.
 */
window.ProductModal = (function () {
  'use strict';

  var AFFILIATE_TAG = 'dpaschal26-20';

  // ── State ──
  var allItems = [];

  // ── DOM refs ──
  var modalEl = null;
  var modalBodyEl = null;
  var backdropEl = null;
  var closeBtn = null;

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
   * Build the Amazon affiliate search URL for an item name.
   */
  function buildAmazonUrl(itemName) {
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(itemName) + '&tag=' + AFFILIATE_TAG;
  }

  /**
   * Get the image source for an item.
   */
  function getImageSrc(item) {
    if (item.asin) {
      return '/api/images/' + encodeURIComponent(item.asin);
    }
    return '/img/placeholder.svg';
  }

  // ── Related Items ──

  /**
   * Find up to 4 items from the same category, excluding the current item.
   */
  function findRelatedItems(item) {
    var related = [];
    for (var i = 0; i < allItems.length; i++) {
      if (related.length >= 4) break;
      var candidate = allItems[i];
      if (candidate.id === item.id) continue;
      if (candidate.category === item.category) {
        related.push(candidate);
      }
    }
    return related;
  }

  /**
   * Create a small clickable card for a related item.
   */
  function createRelatedCard(item) {
    var card = document.createElement('div');
    card.className = 'modal-related-card';
    card.style.cssText = 'display:flex;gap:0.75rem;padding:0.75rem;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:all 0.2s;';

    // Image
    var img = document.createElement('img');
    img.src = getImageSrc(item);
    img.alt = item.item;
    img.loading = 'lazy';
    img.style.cssText = 'width:48px;height:48px;object-fit:contain;border-radius:6px;flex-shrink:0;background:rgba(255,255,255,0.04);';
    img.onerror = function () {
      this.onerror = null;
      this.src = '/img/placeholder.svg';
    };
    card.appendChild(img);

    // Text container
    var textDiv = document.createElement('div');
    textDiv.style.cssText = 'min-width:0;flex:1;';

    var name = document.createElement('div');
    name.style.cssText = 'font-size:0.82rem;font-weight:600;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    name.textContent = item.item;
    textDiv.appendChild(name);

    if (item.price && item.price !== '-') {
      var price = document.createElement('div');
      price.style.cssText = 'font-size:0.78rem;color:var(--green);margin-top:0.15rem;';
      price.textContent = item.price;
      textDiv.appendChild(price);
    }

    card.appendChild(textDiv);

    // Hover effect
    card.addEventListener('mouseenter', function () {
      card.style.borderColor = 'var(--border-hover)';
      card.style.background = 'rgba(255,255,255,0.06)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.borderColor = 'var(--border)';
      card.style.background = 'rgba(255,255,255,0.03)';
    });

    // Click to open that item in the modal
    card.addEventListener('click', function () {
      open(item);
    });

    return card;
  }

  // ── Modal Content Builder ──

  /**
   * Build the full modal body content for a given item.
   */
  function buildModalContent(item) {
    var frag = document.createDocumentFragment();
    var info = item.categoryInfo || { emoji: '', color: '#666' };

    // ── Large product image ──
    var imageWrap = document.createElement('div');
    imageWrap.style.cssText = 'text-align:center;margin-bottom:1.5rem;';
    var img = document.createElement('img');
    img.src = getImageSrc(item);
    img.alt = item.item;
    img.style.cssText = 'max-width:100%;max-height:280px;object-fit:contain;border-radius:var(--radius);background:rgba(255,255,255,0.04);';
    img.onerror = function () {
      this.onerror = null;
      this.src = '/img/placeholder.svg';
    };
    imageWrap.appendChild(img);
    frag.appendChild(imageWrap);

    // ── Product name ──
    var h2 = document.createElement('h2');
    h2.style.cssText = 'font-size:1.3rem;font-weight:700;color:var(--text-bright);margin-bottom:0.75rem;';
    h2.textContent = item.item;
    frag.appendChild(h2);

    // ── Category badge ──
    var catBadge = document.createElement('span');
    catBadge.style.cssText = 'display:inline-block;padding:0.25rem 0.75rem;border-radius:var(--radius-full);font-size:0.78rem;font-weight:600;margin-bottom:1rem;background:' + escapeHtml(info.color) + '22;color:' + escapeHtml(info.color) + ';border:1px solid ' + escapeHtml(info.color) + '44;';
    catBadge.textContent = info.emoji + ' ' + item.category;
    frag.appendChild(catBadge);

    // ── Price ──
    if (item.price && item.price !== '-') {
      var priceDiv = document.createElement('div');
      priceDiv.style.cssText = 'font-size:1.5rem;font-weight:700;color:var(--green);margin:0.75rem 0 1rem;';
      priceDiv.textContent = item.price;
      frag.appendChild(priceDiv);
    }

    // ── Full notes (no truncation) ──
    if (item.notes) {
      var notesP = document.createElement('p');
      notesP.style.cssText = 'color:var(--text);line-height:1.7;margin-bottom:1.25rem;font-size:0.92rem;';
      notesP.textContent = item.notes;
      frag.appendChild(notesP);
    }

    // ── Action buttons row ──
    var actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.5rem;';

    // Amazon buy button (large, prominent)
    var buyBtn = document.createElement('a');
    buyBtn.href = item.amazonUrl || buildAmazonUrl(item.item || '');
    buyBtn.target = '_blank';
    buyBtn.rel = 'noopener noreferrer';
    buyBtn.className = 'btn btn-primary';
    buyBtn.style.cssText = 'flex:1;min-width:180px;padding:0.7rem 1.5rem;font-size:0.95rem;font-weight:700;text-decoration:none;';
    var buyUrl = item.amazonUrl || '';
    if (buyUrl.indexOf('amazon.com') !== -1) {
      buyBtn.textContent = 'Buy on Amazon';
    } else if (buyUrl.indexOf('seeedstudio.com') !== -1) {
      buyBtn.textContent = 'Buy on Seeed';
    } else if (buyUrl.indexOf('rakwireless.com') !== -1) {
      buyBtn.textContent = 'Buy on RAK';
    } else if (buyUrl.indexOf('uniteng.com') !== -1) {
      buyBtn.textContent = 'Buy on Unit Eng';
    } else {
      buyBtn.textContent = 'View Product';
    }
    actionsRow.appendChild(buyBtn);

    // Compare button
    var compareBtn = document.createElement('button');
    compareBtn.className = 'btn btn-ghost btn-compare';
    compareBtn.setAttribute('data-id', item.id || '');
    compareBtn.textContent = '\u2696\uFE0F Compare';
    actionsRow.appendChild(compareBtn);

    // Add to List button
    var wishlistBtn = document.createElement('button');
    wishlistBtn.className = 'btn btn-ghost btn-wishlist';
    wishlistBtn.setAttribute('data-id', item.id || '');
    wishlistBtn.textContent = '\uD83D\uDCCB Add to List';
    actionsRow.appendChild(wishlistBtn);

    // Watch Price bell icon button (placeholder for alerts.js)
    var watchBtn = document.createElement('button');
    watchBtn.className = 'btn-icon btn-watch-price';
    watchBtn.setAttribute('data-id', item.id || '');
    watchBtn.title = 'Watch Price';
    watchBtn.innerHTML = '\uD83D\uDD14';
    actionsRow.appendChild(watchBtn);

    frag.appendChild(actionsRow);

    // ── Divider ──
    var divider1 = document.createElement('hr');
    divider1.style.cssText = 'border:none;border-top:1px solid var(--border);margin:1.5rem 0;';
    frag.appendChild(divider1);

    // ── Reviews section (placeholder for reviews.js) ──
    var reviewsDiv = document.createElement('div');
    reviewsDiv.id = 'modal-reviews';
    reviewsDiv.setAttribute('data-product-id', item.id || '');
    frag.appendChild(reviewsDiv);

    // ── Divider ──
    var divider2 = document.createElement('hr');
    divider2.style.cssText = 'border:none;border-top:1px solid var(--border);margin:1.5rem 0;';
    frag.appendChild(divider2);

    // ── Related items section ──
    var relatedDiv = document.createElement('div');
    relatedDiv.id = 'modal-related';

    var relatedItems = findRelatedItems(item);
    if (relatedItems.length > 0) {
      var relatedHeading = document.createElement('h3');
      relatedHeading.style.cssText = 'font-size:0.95rem;font-weight:600;color:var(--text-bright);margin-bottom:0.75rem;';
      relatedHeading.textContent = 'Related Items';
      relatedDiv.appendChild(relatedHeading);

      var relatedGrid = document.createElement('div');
      relatedGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.5rem;';

      for (var i = 0; i < relatedItems.length; i++) {
        relatedGrid.appendChild(createRelatedCard(relatedItems[i]));
      }
      relatedDiv.appendChild(relatedGrid);
    }

    frag.appendChild(relatedDiv);

    return frag;
  }

  // ── Public Methods ──

  /**
   * Store a reference to all items (for related items lookups).
   */
  function setAllItems(items) {
    allItems = items || [];
  }

  /**
   * Open the modal with full product details for the given item.
   */
  function open(item) {
    if (!item) return;

    // Resolve DOM refs lazily
    if (!modalEl) {
      modalEl = document.getElementById('product-modal');
      modalBodyEl = document.getElementById('modal-body');
      backdropEl = modalEl ? modalEl.querySelector('.modal-backdrop') : null;
      closeBtn = modalEl ? modalEl.querySelector('.modal-close') : null;

      // Wire event listeners once
      if (backdropEl) {
        backdropEl.addEventListener('click', close);
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', close);
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          close();
        }
      });
    }

    if (!modalEl || !modalBodyEl) return;

    // Populate modal body
    modalBodyEl.innerHTML = '';
    modalBodyEl.appendChild(buildModalContent(item));

    // Show the modal
    modalEl.classList.remove('hidden');

    // Prevent background scroll
    document.body.style.overflow = 'hidden';

    // Scroll modal content to top
    var contentEl = modalEl.querySelector('.modal-content');
    if (contentEl) {
      contentEl.scrollTop = 0;
    }

    // Load reviews into the modal
    if (window.Reviews) {
      var reviewsContainer = document.getElementById('modal-reviews');
      if (reviewsContainer) {
        window.Reviews.load(reviewsContainer.dataset.productId, reviewsContainer);
      }
    }
  }

  /**
   * Close the modal.
   */
  function close() {
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
    if (modalBodyEl) {
      modalBodyEl.innerHTML = '';
    }

    // Restore background scroll
    document.body.style.overflow = '';
  }

  // ── Public API ──
  return {
    open: open,
    close: close,
    setAllItems: setAllItems
  };
})();
