/**
 * Reviews Module — fetches, displays, and submits product reviews.
 * Exposed as window.Reviews IIFE.
 */
window.Reviews = (function () {
  'use strict';

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
   * Render star HTML for a given rating.
   * Supports decimals: 4.5 shows 4 full + 1 half.
   * @param {number} rating - The rating value
   * @param {number} [max=5] - Maximum number of stars
   * @returns {string} HTML string of filled/half/empty stars
   */
  function renderStars(rating, max) {
    if (max == null) max = 5;
    var html = '';
    for (var i = 1; i <= max; i++) {
      if (rating >= i) {
        html += '<span class="star-filled">\u2605</span>';
      } else if (rating >= i - 0.5) {
        html += '<span class="star-half">\u2605</span>';
      } else {
        html += '<span class="star-empty">\u2606</span>';
      }
    }
    return html;
  }

  /**
   * Format a date string to locale display.
   */
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // ── Rendering ──

  /**
   * Build the summary header element.
   */
  function buildSummary(averageRating, total) {
    var div = document.createElement('div');
    div.className = 'reviews-summary';

    if (total === 0 || averageRating == null) {
      div.innerHTML = '<p class="reviews-empty">No reviews yet &mdash; be the first!</p>';
      return div;
    }

    div.innerHTML =
      '<span class="reviews-avg-stars">' + renderStars(averageRating) + '</span>' +
      '<span class="reviews-avg-number">' + escapeHtml(String(averageRating)) + '</span>' +
      '<span class="reviews-count">(' + escapeHtml(String(total)) + ' review' + (total !== 1 ? 's' : '') + ')</span>';

    return div;
  }

  /**
   * Build a single review element.
   */
  function buildReview(review) {
    var div = document.createElement('div');
    div.className = 'review';

    var headerHtml =
      '<div class="review-header">' +
        '<span class="review-author">' + escapeHtml(review.display_name) + '</span>' +
        '<span class="review-stars">' + renderStars(review.rating) + '</span>' +
        '<span class="review-date">' + escapeHtml(formatDate(review.created_at)) + '</span>' +
      '</div>';

    var titleHtml = review.title
      ? '<h4 class="review-title">' + escapeHtml(review.title) + '</h4>'
      : '';

    var bodyHtml = '<p class="review-body">' + escapeHtml(review.body) + '</p>';

    div.innerHTML = headerHtml + titleHtml + bodyHtml;
    return div;
  }

  /**
   * Build the review list container.
   */
  function buildReviewList(reviews) {
    var div = document.createElement('div');
    div.className = 'reviews-list';

    for (var i = 0; i < reviews.length; i++) {
      div.appendChild(buildReview(reviews[i]));
    }

    return div;
  }

  // ── Star Picker ──

  /**
   * Build the interactive star picker.
   * Returns { element, getValue }
   */
  function buildStarPicker() {
    var selectedRating = 0;
    var wrapper = document.createElement('div');
    wrapper.className = 'star-picker';

    var stars = [];
    for (var i = 1; i <= 5; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'star-picker-btn';
      btn.setAttribute('data-value', String(i));
      btn.textContent = '\u2606';
      btn.setAttribute('aria-label', i + ' star' + (i !== 1 ? 's' : ''));
      stars.push(btn);
      wrapper.appendChild(btn);
    }

    function highlight(upTo) {
      for (var j = 0; j < stars.length; j++) {
        if (j < upTo) {
          stars[j].textContent = '\u2605';
          stars[j].classList.add('star-active');
        } else {
          stars[j].textContent = '\u2606';
          stars[j].classList.remove('star-active');
        }
      }
    }

    wrapper.addEventListener('mouseover', function (e) {
      var btn = e.target.closest('.star-picker-btn');
      if (!btn) return;
      var val = parseInt(btn.getAttribute('data-value'), 10);
      highlight(val);
    });

    wrapper.addEventListener('mouseleave', function () {
      highlight(selectedRating);
    });

    wrapper.addEventListener('click', function (e) {
      var btn = e.target.closest('.star-picker-btn');
      if (!btn) return;
      selectedRating = parseInt(btn.getAttribute('data-value'), 10);
      highlight(selectedRating);
    });

    return {
      element: wrapper,
      getValue: function () { return selectedRating; },
      reset: function () { selectedRating = 0; highlight(0); }
    };
  }

  // ── Form ──

  /**
   * Build the review submission form.
   */
  function buildForm(productId, container) {
    var formDiv = document.createElement('div');
    formDiv.className = 'review-form';

    var heading = document.createElement('h3');
    heading.textContent = 'Write a Review';
    formDiv.appendChild(heading);

    // Star picker
    var picker = buildStarPicker();
    formDiv.appendChild(picker.element);

    // Name input
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Your name';
    nameInput.className = 'review-input review-name-input';
    nameInput.required = true;
    formDiv.appendChild(nameInput);

    // Discord input
    var discordInput = document.createElement('input');
    discordInput.type = 'text';
    discordInput.placeholder = 'Discord handle (optional)';
    discordInput.className = 'review-input review-discord-input';
    formDiv.appendChild(discordInput);

    // Title input
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Review title (optional)';
    titleInput.className = 'review-input review-title-input';
    formDiv.appendChild(titleInput);

    // Body textarea
    var bodyInput = document.createElement('textarea');
    bodyInput.placeholder = 'Your review...';
    bodyInput.className = 'review-input review-body-input';
    bodyInput.required = true;
    bodyInput.rows = 4;
    formDiv.appendChild(bodyInput);

    // Submit button
    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn-primary review-submit';
    submitBtn.textContent = 'Submit Review';
    formDiv.appendChild(submitBtn);

    // Message area
    var messageDiv = document.createElement('div');
    messageDiv.className = 'review-message';
    formDiv.appendChild(messageDiv);

    // Submit handler
    submitBtn.addEventListener('click', function () {
      var rating = picker.getValue();
      var displayName = nameInput.value.trim();
      var body = bodyInput.value.trim();
      var title = titleInput.value.trim();
      var discordHandle = discordInput.value.trim();

      // Client-side validation
      if (!displayName) {
        showMessage(messageDiv, 'Please enter your name.', 'error');
        return;
      }
      if (rating < 1) {
        showMessage(messageDiv, 'Please select a star rating.', 'error');
        return;
      }
      if (!body) {
        showMessage(messageDiv, 'Please write a review.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      var payload = {
        product_id: productId,
        display_name: displayName,
        rating: rating,
        body: body
      };
      if (title) payload.title = title;
      if (discordHandle) payload.discord_handle = discordHandle;

      fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Review';

          if (result.ok) {
            // Clear form
            nameInput.value = '';
            discordInput.value = '';
            titleInput.value = '';
            bodyInput.value = '';
            picker.reset();
            showMessage(messageDiv, 'Review submitted!', 'success');
            // Re-fetch and re-render reviews
            load(productId, container);
          } else {
            showMessage(messageDiv, result.data.error || 'Something went wrong.', 'error');
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Review';
          showMessage(messageDiv, 'Network error. Please try again.', 'error');
        });
    });

    return formDiv;
  }

  /**
   * Show a success or error message.
   */
  function showMessage(el, text, type) {
    el.textContent = text;
    el.className = 'review-message review-message-' + type;

    // Auto-clear success messages
    if (type === 'success') {
      setTimeout(function () {
        el.textContent = '';
        el.className = 'review-message';
      }, 4000);
    }
  }

  // ── Public API ──

  /**
   * Fetch reviews for a product and render them into the container.
   * @param {string} productId - The product ID
   * @param {Element} container - The DOM element to render into
   */
  function load(productId, container) {
    if (!productId || !container) return;

    fetch('/api/reviews/' + encodeURIComponent(productId))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch reviews');
        return res.json();
      })
      .then(function (data) {
        container.innerHTML = '';

        // Section heading
        var heading = document.createElement('h3');
        heading.className = 'reviews-heading';
        heading.textContent = 'Reviews';
        container.appendChild(heading);

        // Summary
        container.appendChild(buildSummary(data.average_rating, data.total));

        // Review list
        if (data.reviews && data.reviews.length > 0) {
          container.appendChild(buildReviewList(data.reviews));
        }

        // Form
        container.appendChild(buildForm(productId, container));
      })
      .catch(function () {
        container.innerHTML = '';
        var err = document.createElement('p');
        err.className = 'reviews-error';
        err.textContent = 'Could not load reviews.';
        container.appendChild(err);
      });
  }

  return {
    load: load,
    renderStars: renderStars
  };
})();
