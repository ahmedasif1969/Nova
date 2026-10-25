/* Opening-buffer gate. Progress comes from completed downloads and decodes. */
(function () {
  'use strict';
  const dialog = document.querySelector('[data-hero-loader]');
  const canvas = document.querySelector('.hero-canvas');
  if (!dialog || !canvas || typeof dialog.showModal !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      navigator.connection?.saveData || window.scrollY > 0 ||
      (window.location.hash && window.location.hash !== '#top' && window.location.hash !== '#main-content')) return;

  const meter = dialog.querySelector('[data-hero-loader-progress]');
  const percent = dialog.querySelector('[data-hero-loader-percent]');
  const skip = dialog.querySelector('[data-hero-loader-skip]');
  const previousFocus = document.activeElement;
  let sequence = null, closed = false, poll = 0, deadline = 0;
  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(poll);
    clearTimeout(deadline);
    document.documentElement.classList.remove('hero-loading');
    if (dialog.open) dialog.close();
    const focus = previousFocus && previousFocus !== document.body
      ? previousFocus : document.querySelector('.hero-actions a');
    focus?.focus({ preventScroll: true });
  }
  function update() {
    if (closed) return;
    if (window.scrollY > window.innerHeight) { finish(); return; }
    if (!document.hidden && window.NovaHeroSequence) {
      try {
        if (!sequence) {
          sequence = window.NovaHeroSequence.peek(canvas) || window.NovaHeroSequence({
            canvas, onDraw() {}, onError: finish
          });
          if (!sequence) { finish(); return; }
        }
        sequence.preload();
        const state = sequence.stats();
        if (state.destroyed || state.openingFailed) { finish(); return; }
        const completed = state.openingDownloaded + state.openingDecoded;
        meter.value = completed;
        percent.textContent = `${Math.floor(completed / 56 * 100)}%`;
        if (completed === 56 && state.displayed >= 0) {
          // Let the real completed state paint before uncovering the page.
          poll = setTimeout(finish, 150);
          return;
        }
      } catch { finish(); return; }
    }
    poll = setTimeout(update, 100);
  }
  skip.addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('close', finish);
  dialog.addEventListener('wheel', event => event.preventDefault(), { passive: false });
  dialog.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  document.querySelector('script[src="./hero-sequence.js"]')?.addEventListener('error', finish);
  try {
    dialog.showModal();
    document.documentElement.classList.add('hero-loading');
    // Always release the page on a stalled connection; never fake completion.
    deadline = setTimeout(finish, 20000);
    update();
  } catch { finish(); }
})();
