/**
 * Wizard module — 3-step guided flow that recommends a Meshtastic node kit.
 * Exposed as window.Wizard IIFE.
 */
window.Wizard = (function () {
  'use strict';

  var AFFILIATE_TAG = 'dpaschal26-20';

  // ── Step definitions ──

  var steps = [
    {
      key: 'budget',
      question: "What's your budget?",
      options: [
        { value: 'low',  icon: '\uD83D\uDCB0', label: 'Under $50' },
        { value: 'mid',  icon: '\uD83D\uDCB5', label: '$50 \u2013 $150' },
        { value: 'high', icon: '\uD83D\uDC8E', label: '$150+' },
        { value: 'high', icon: '\uD83D\uDE80', label: 'No limit' },
      ]
    },
    {
      key: 'usecase',
      question: "What's the use case?",
      options: [
        { value: 'portable', icon: '\uD83C\uDF92', label: 'Portable / EDC' },
        { value: 'solar',    icon: '\u2600\uFE0F', label: 'Solar (outdoor)' },
        { value: 'relay',    icon: '\uD83D\uDCE1', label: 'Relay (hilltop)' },
        { value: 'home',     icon: '\uD83C\uDFE0', label: 'Home / desk' },
        { value: 'poe',      icon: '\uD83D\uDD0C', label: 'PoE (wired)' },
      ]
    },
    {
      key: 'experience',
      question: 'Experience level?',
      options: [
        { value: 'beginner',     icon: '\uD83C\uDF31', label: 'First node ever' },
        { value: 'intermediate', icon: '\uD83D\uDD27', label: 'Have a few nodes' },
        { value: 'advanced',     icon: '\uD83C\uDFD7\uFE0F', label: 'Building infra' },
      ]
    }
  ];

  // ── State ──

  var wizardEl = null;
  var currentStep = 0;
  var answers = {};

  // ── Recommendation logic ──

  function recommend(ans) {
    var budget = ans.budget;
    var usecase = ans.usecase;
    var experience = ans.experience;

    if (experience === 'beginner') return 'solar-starter';
    if (budget === 'low') return 'quick-start';
    if (budget === 'mid') {
      if (usecase === 'solar') return 'diy-solar';
      if (usecase === 'portable') return 'solar-starter';
      return 'turnkey';
    }
    // high budget
    if (usecase === 'relay') return 'high-perf';
    if (usecase === 'solar') return 'solar-node';
    if (usecase === 'poe') return 'poe-node';
    return 'solar-node';
  }

  // ── Helpers ──

  function escapeHtml(text) {
    if (text == null) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function amazonSearchUrl(name) {
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(name) + '&tag=' + AFFILIATE_TAG;
  }

  function findKit(kitId) {
    if (!window.KITS) return null;
    for (var i = 0; i < window.KITS.length; i++) {
      if (window.KITS[i].id === kitId) return window.KITS[i];
    }
    return null;
  }

  // ── Rendering ──

  /**
   * Render a wizard step into the wizard container.
   */
  function renderStep(stepIndex) {
    if (!wizardEl) return;

    var step = steps[stepIndex];
    var totalSteps = steps.length;

    var html = '<div class="wizard-step">';

    // Progress dots
    html += '<div class="wizard-progress">';
    for (var d = 0; d < totalSteps; d++) {
      var dotClass = 'dot';
      if (d < stepIndex) dotClass += ' completed';
      else if (d === stepIndex) dotClass += ' active';
      html += '<span class="' + dotClass + '"></span>';
    }
    html += '</div>';

    // Question
    html += '<div class="wizard-question">' + escapeHtml(step.question) + '</div>';

    // Options
    html += '<div class="wizard-options">';
    for (var o = 0; o < step.options.length; o++) {
      var opt = step.options[o];
      html += '<button class="wizard-option" data-key="' + escapeHtml(step.key) + '" data-value="' + escapeHtml(opt.value) + '">';
      html += '<span class="option-icon">' + opt.icon + '</span>';
      html += '<span class="option-label">' + escapeHtml(opt.label) + '</span>';
      html += '</button>';
    }
    html += '</div>';

    // Skip link
    html += '<button class="wizard-skip">Skip to catalog \u2192</button>';

    html += '</div>';
    wizardEl.innerHTML = html;

    // Wire option buttons
    var optionBtns = wizardEl.querySelectorAll('.wizard-option');
    for (var b = 0; b < optionBtns.length; b++) {
      optionBtns[b].addEventListener('click', handleOptionClick);
    }

    // Wire skip button
    var skipBtn = wizardEl.querySelector('.wizard-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        wizardEl.innerHTML = '';
      });
    }
  }

  /**
   * Handle clicking a wizard option button.
   */
  function handleOptionClick(e) {
    var btn = e.currentTarget;
    var key = btn.getAttribute('data-key');
    var value = btn.getAttribute('data-value');

    // Record answer
    answers[key] = value;

    // Visual feedback — briefly highlight selected
    btn.classList.add('selected');

    // Advance to next step or show result
    setTimeout(function () {
      currentStep++;
      if (currentStep < steps.length) {
        renderStep(currentStep);
      } else {
        var kitId = recommend(answers);
        showResult(kitId);
      }
    }, 200);
  }

  /**
   * Show the recommended kit result.
   */
  function showResult(kitId) {
    var kit = findKit(kitId);
    if (!kit || !wizardEl) return;

    // For match-based kits, dispatch event for app.js to resolve items
    if (kit.items && !kit.hardcodedItems) {
      var event = new CustomEvent('wizard-complete', {
        detail: { kitId: kitId }
      });
      wizardEl.dispatchEvent(event);
      return;
    }

    // For hardcoded kits, render directly
    renderHardcodedResult(kit);
  }

  /**
   * Render a kit result that uses hardcodedItems (no catalog lookup needed).
   */
  function renderHardcodedResult(kit) {
    if (!wizardEl) return;

    var html = '<div class="wizard-step">';

    // Kit header
    html += '<div style="font-size:2.5rem;margin-bottom:0.5rem;">' + kit.emoji + '</div>';
    html += '<div class="wizard-question" style="margin-bottom:0.5rem;">' + escapeHtml(kit.name) + '</div>';
    if (kit.recommended) {
      html += '<div style="display:inline-block;background:rgba(16,185,129,0.15);color:#10B981;padding:0.25rem 0.75rem;border-radius:999px;font-size:0.8rem;font-weight:700;margin-bottom:0.75rem;border:1px solid rgba(16,185,129,0.3);">Recommended for Beginners</div>';
    }
    html += '<p style="color:var(--text-dim);font-size:0.95rem;max-width:600px;margin:0 auto 1.5rem;">' + escapeHtml(kit.desc) + '</p>';

    // Items list
    html += '<div style="max-width:600px;margin:0 auto;text-align:left;">';
    var items = kit.hardcodedItems;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:0.5rem;">';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-weight:700;color:var(--text-bright);font-size:0.9rem;">' + escapeHtml(item.name) + '</div>';
      if (item.notes) {
        html += '<div style="font-size:0.8rem;color:var(--text-dim);margin-top:0.2rem;">' + escapeHtml(item.notes) + '</div>';
      }
      html += '</div>';
      html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem;flex-shrink:0;">';
      if (item.defaultPrice) {
        html += '<span style="color:var(--green);font-weight:700;font-size:0.85rem;">' + escapeHtml(item.defaultPrice) + '</span>';
      }
      html += '<a href="' + amazonSearchUrl(item.name) + '" target="_blank" rel="noopener noreferrer" class="btn btn-buy" style="padding:0.3rem 0.7rem;font-size:0.75rem;">Amazon</a>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    // Actions
    html += '<div style="display:flex;gap:0.75rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;">';
    html += '<button class="btn btn-primary wizard-add-all">Add All to List</button>';
    html += '<button class="btn btn-ghost wizard-start-over">Start Over</button>';
    html += '</div>';

    html += '</div>';
    wizardEl.innerHTML = html;

    // Wire "Start Over"
    var startOverBtn = wizardEl.querySelector('.wizard-start-over');
    if (startOverBtn) {
      startOverBtn.addEventListener('click', function () {
        init();
      });
    }

    // Wire "Add All to List"
    var addAllBtn = wizardEl.querySelector('.wizard-add-all');
    if (addAllBtn) {
      addAllBtn.addEventListener('click', function () {
        if (window.Wishlist && typeof window.Wishlist.addByName === 'function') {
          var items = kit.hardcodedItems;
          for (var i = 0; i < items.length; i++) {
            window.Wishlist.addByName(items[i].name);
          }
        }
      });
    }
  }

  /**
   * Render a match-based kit result (called by app.js after resolving items).
   * @param {Object} kit — the kit definition
   * @param {Array} resolvedItems — array of catalog items matching the kit
   */
  function renderMatchResult(kit, resolvedItems) {
    if (!wizardEl) return;

    var html = '<div class="wizard-step">';

    // Kit header
    html += '<div style="font-size:2.5rem;margin-bottom:0.5rem;">' + kit.emoji + '</div>';
    html += '<div class="wizard-question" style="margin-bottom:0.5rem;">' + escapeHtml(kit.name) + '</div>';
    html += '<p style="color:var(--text-dim);font-size:0.95rem;max-width:600px;margin:0 auto 1.5rem;">' + escapeHtml(kit.desc) + '</p>';

    // Items list
    html += '<div style="max-width:600px;margin:0 auto;text-align:left;">';
    var totalPrice = 0;
    for (var i = 0; i < resolvedItems.length; i++) {
      var item = resolvedItems[i];
      var price = item.price || '';
      var numPrice = parseFloat(String(price).replace(/[^0-9.]/g, ''));
      if (!isNaN(numPrice)) totalPrice += numPrice;

      html += '<div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:0.5rem;">';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-weight:700;color:var(--text-bright);font-size:0.9rem;">' + escapeHtml(item.item) + '</div>';
      if (item.category) {
        html += '<div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.15rem;">' + escapeHtml(item.category) + '</div>';
      }
      if (item.notes) {
        html += '<div style="font-size:0.8rem;color:var(--text-dim);margin-top:0.2rem;">' + escapeHtml(item.notes) + '</div>';
      }
      html += '</div>';
      html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem;flex-shrink:0;">';
      if (price && price !== '-') {
        html += '<span style="color:var(--green);font-weight:700;font-size:0.85rem;">' + escapeHtml(price) + '</span>';
      }
      var buyUrl = item.amazonUrl || amazonSearchUrl(item.item);
      html += '<a href="' + buyUrl + '" target="_blank" rel="noopener noreferrer" class="btn btn-buy" style="padding:0.3rem 0.7rem;font-size:0.75rem;">Amazon</a>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    // Total price
    if (totalPrice > 0) {
      html += '<div style="text-align:center;margin-top:1rem;font-size:1.1rem;font-weight:800;color:var(--green);">Estimated Total: $' + totalPrice.toFixed(2) + '</div>';
    }

    // Unresolved items warning
    var unresolvedCount = kit.items.length - resolvedItems.length;
    if (unresolvedCount > 0) {
      html += '<div style="text-align:center;margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim);">' + unresolvedCount + ' item' + (unresolvedCount !== 1 ? 's' : '') + ' not found in current catalog</div>';
    }

    // Actions
    html += '<div style="display:flex;gap:0.75rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;">';
    html += '<button class="btn btn-primary wizard-add-all">Add All to List</button>';
    html += '<button class="btn btn-ghost wizard-start-over">Start Over</button>';
    html += '</div>';

    html += '</div>';
    wizardEl.innerHTML = html;

    // Wire "Start Over"
    var startOverBtn = wizardEl.querySelector('.wizard-start-over');
    if (startOverBtn) {
      startOverBtn.addEventListener('click', function () {
        init();
      });
    }

    // Wire "Add All to List"
    var addAllBtn = wizardEl.querySelector('.wizard-add-all');
    if (addAllBtn) {
      addAllBtn.addEventListener('click', function () {
        if (window.Wishlist && typeof window.Wishlist.addItem === 'function') {
          for (var i = 0; i < resolvedItems.length; i++) {
            window.Wishlist.addItem(resolvedItems[i]);
          }
        }
      });
    }
  }

  // ── Public API ──

  /**
   * Initialize (or reset) the wizard — renders step 1.
   */
  function init() {
    wizardEl = document.getElementById('wizard');
    if (!wizardEl) return;

    currentStep = 0;
    answers = {};
    renderStep(0);
  }

  return {
    init: init,
    renderMatchResult: renderMatchResult
  };
})();
