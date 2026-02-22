/**
 * Price Alerts module — watch price drops via bell icon + subscribe popover.
 * Exposed as window.Alerts IIFE.
 */
window.Alerts = (function () {
  'use strict';

  var STORAGE_KEY = 'ncmesh-watching';
  var EMAIL_KEY = 'ncmesh-alert-email';
  var watchingSet = new Set(); // product IDs being watched
  var activePopover = null;   // reference to currently open popover

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
   * Load watching IDs from localStorage into the Set.
   */
  function loadWatching() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(data)) {
        data.forEach(function (id) { watchingSet.add(id); });
      }
    } catch (e) {
      // ignore corrupt data
    }
  }

  /**
   * Persist watching IDs to localStorage.
   */
  function saveWatching() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(watchingSet)));
  }

  /**
   * Get the last-used email from localStorage.
   */
  function getSavedEmail() {
    try {
      return localStorage.getItem(EMAIL_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Save the email to localStorage for auto-fill.
   */
  function saveEmail(email) {
    try {
      localStorage.setItem(EMAIL_KEY, email);
    } catch (e) {
      // ignore
    }
  }

  // ── Bell Button Injection ──

  /**
   * Add a bell button to a card-actions container if it doesn't already have one.
   */
  function addBellToCard(actionsEl, productId) {
    // Skip if already has a bell button
    if (actionsEl.querySelector('.btn-watch-price')) return;

    var btn = document.createElement('button');
    btn.className = 'btn-icon btn-watch-price';
    btn.setAttribute('data-id', productId);
    btn.title = 'Watch Price';
    btn.innerHTML = '\uD83D\uDD14'; // bell emoji

    if (watchingSet.has(productId)) {
      btn.classList.add('watching');
    }

    actionsEl.appendChild(btn);
  }

  /**
   * Scan all product cards and inject bell buttons where missing.
   */
  function injectBellButtons() {
    var cards = document.querySelectorAll('.product-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var productId = card.getAttribute('data-id');
      var actions = card.querySelector('.card-actions');
      if (actions && productId) {
        addBellToCard(actions, productId);
      }
    }
  }

  // ── Bell State ──

  /**
   * Update all bell buttons to reflect current watching state.
   */
  function updateBellStates() {
    var buttons = document.querySelectorAll('.btn-watch-price');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var id = btn.getAttribute('data-id');
      if (id && watchingSet.has(id)) {
        btn.classList.add('watching');
      } else {
        btn.classList.remove('watching');
      }
    }
  }

  // ── Popover ──

  /**
   * Close the currently open popover, if any.
   */
  function closePopover() {
    if (activePopover && activePopover.parentNode) {
      activePopover.parentNode.removeChild(activePopover);
    }
    activePopover = null;
  }

  /**
   * Create and show the subscribe popover anchored near the given button.
   */
  function showPopover(bellBtn) {
    // Only one popover at a time
    closePopover();

    var productId = bellBtn.getAttribute('data-id');
    if (!productId) return;

    var popover = document.createElement('div');
    popover.className = 'alert-popover';

    var title = document.createElement('p');
    title.className = 'alert-popover-title';
    title.textContent = 'Watch Price';
    popover.appendChild(title);

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'your@email.com';
    emailInput.className = 'alert-email';
    emailInput.required = true;
    emailInput.value = getSavedEmail();
    popover.appendChild(emailInput);

    var thresholdInput = document.createElement('input');
    thresholdInput.type = 'number';
    thresholdInput.placeholder = '5';
    thresholdInput.className = 'alert-threshold';
    thresholdInput.min = '1';
    thresholdInput.max = '50';
    thresholdInput.step = '1';
    popover.appendChild(thresholdInput);

    var thresholdLabel = document.createElement('p');
    thresholdLabel.className = 'alert-threshold-label';
    thresholdLabel.textContent = '% drop to notify';
    popover.appendChild(thresholdLabel);

    var subscribeBtn = document.createElement('button');
    subscribeBtn.className = 'btn btn-subscribe';
    subscribeBtn.textContent = 'Subscribe';
    popover.appendChild(subscribeBtn);

    var feedback = document.createElement('p');
    feedback.className = 'alert-feedback';
    popover.appendChild(feedback);

    // Position the popover relative to the bell button
    // We use the bell button's offset parent or body
    var rect = bellBtn.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.zIndex = '1000';

    // Place above the button by default, fall back below if near top
    var top = rect.top - 10; // will adjust after render
    var left = rect.left + (rect.width / 2);
    popover.style.left = left + 'px';
    popover.style.transform = 'translateX(-50%)';

    document.body.appendChild(popover);
    activePopover = popover;

    // Measure and position: prefer above, fall back to below
    var popRect = popover.getBoundingClientRect();
    if (rect.top - popRect.height - 10 > 0) {
      // Place above
      popover.style.top = (rect.top - popRect.height - 10) + 'px';
    } else {
      // Place below
      popover.style.top = (rect.bottom + 10) + 'px';
    }

    // Keep within viewport horizontally
    var finalRect = popover.getBoundingClientRect();
    if (finalRect.right > window.innerWidth - 10) {
      popover.style.left = (window.innerWidth - finalRect.width - 10) + 'px';
      popover.style.transform = 'none';
    }
    if (finalRect.left < 10) {
      popover.style.left = '10px';
      popover.style.transform = 'none';
    }

    // Focus email input
    emailInput.focus();

    // ── Subscribe handler ──
    subscribeBtn.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!email) {
        feedback.textContent = 'Email is required';
        feedback.className = 'alert-feedback alert-feedback-error';
        return;
      }

      var thresholdVal = parseInt(thresholdInput.value, 10);
      var threshold = (isNaN(thresholdVal) || thresholdVal < 1) ? 5 : thresholdVal;

      // Disable button while submitting
      subscribeBtn.disabled = true;
      subscribeBtn.textContent = 'Subscribing...';
      feedback.textContent = '';
      feedback.className = 'alert-feedback';

      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          email: email,
          threshold_pct: threshold
        })
      })
      .then(function (res) {
        if (res.status === 201) {
          return res.json().then(function () {
            // Success
            watchingSet.add(productId);
            saveWatching();
            saveEmail(email);
            updateBellStates();

            feedback.textContent = "You'll be notified when price drops!";
            feedback.className = 'alert-feedback alert-feedback-success';

            // Close popover after a short delay
            setTimeout(function () {
              closePopover();
            }, 1500);
          });
        } else {
          return res.json().then(function (data) {
            feedback.textContent = data.error || 'Something went wrong';
            feedback.className = 'alert-feedback alert-feedback-error';
            subscribeBtn.disabled = false;
            subscribeBtn.textContent = 'Subscribe';
          });
        }
      })
      .catch(function () {
        feedback.textContent = 'Network error, please try again';
        feedback.className = 'alert-feedback alert-feedback-error';
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = 'Subscribe';
      });
    });

    // Allow Enter key to submit
    popover.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        subscribeBtn.click();
      }
    });
  }

  // ── Click Outside Handler ──

  /**
   * Close popover when clicking outside of it (but not the bell button).
   */
  function handleDocumentClick(e) {
    if (!activePopover) return;

    // If the click is inside the popover, do nothing
    if (activePopover.contains(e.target)) return;

    // If the click is on a bell button, the delegation handler will manage it
    if (e.target.closest('.btn-watch-price')) return;

    closePopover();
  }

  // ── Initialization ──

  /**
   * Initialize the alerts module.
   * @param {Array} items — flat array of all catalog items (unused but follows pattern)
   */
  function init(items) {
    // Load watching state from localStorage
    loadWatching();

    // Inject bell buttons into existing cards
    injectBellButtons();

    // Update bell states for any pre-existing buttons (e.g. in modal)
    updateBellStates();

    // Event delegation for bell button clicks
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-watch-price');
      if (!btn) return;

      e.stopPropagation();
      e.preventDefault();

      // If popover is already open for this button, close it
      if (activePopover && activePopover._bellBtn === btn) {
        closePopover();
        return;
      }

      showPopover(btn);
      // Store reference to the bell button on the popover for toggle detection
      if (activePopover) {
        activePopover._bellBtn = btn;
      }
    });

    // Close popover on click outside
    document.addEventListener('mousedown', handleDocumentClick);

    // Close popover on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePopover();
      }
    });

    // Observe DOM mutations to inject bell buttons into newly rendered cards
    // (handles re-renders from search/filter/sort)
    var gridEl = document.getElementById('catalog-grid');
    if (gridEl && typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        injectBellButtons();
        updateBellStates();
      });
      observer.observe(gridEl, { childList: true });
    }
  }

  // ── Public API ──
  return {
    init: init,
    closePopover: closePopover
  };
})();
