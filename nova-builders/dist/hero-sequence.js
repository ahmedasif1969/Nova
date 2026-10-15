/* A bounded, lazy image sequence. No MP4 seeks on the primary rendering path. */
(function () {
  'use strict';
  const instances = new WeakMap();
  window.NovaHeroSequence = function ({ canvas, onDraw, onError }) {
    const existing = canvas && instances.get(canvas);
    if (existing) { existing.attach(onDraw, onError); return existing; }
    if (!canvas || !window.createImageBitmap || !window.AbortController) return null;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
    const capacity = lowMemory ? 8 : mobile ? 10 : 12;
    const connection = navigator.connection;
    const slowNetwork = connection?.saveData || /(^|-)2g$|3g/.test(connection?.effectiveType || '') ||
      (connection?.downlink > 0 && connection.downlink < 5);
    const downloadAhead = slowNetwork ? 12 : lowMemory ? 16 : mobile ? 32 : 48;
    const openingFrames = lowMemory ? 8 : 12;
    const downloadConcurrency = lowMemory ? 2 : 6;
    const compressedLimit = (lowMemory ? 6 : mobile ? 12 : 16) * 1024 * 1024;
    const compressed = new Map(), downloads = new Map(), failed = new Set(), fetched = new Set();
    let compressedBytes = 0, downloadWanted = [], warming = false, requiredFrame = 0;
    // Small motion frames avoid making every scroll step wait for a large
    // image. Upgrade only the settled view to native resolution.
    const variant = 'preview';
    const maxCanvasPixels = lowMemory ? 2000000 : 4000000;
    const lastFrame = 191;
    const cache = new Map();
    const pending = new Map();
    let active = false, destroyed = false, started = false;
    let target = 0, position = 0, displayed = -1, direction = 1;
    let raf = 0, previousTick = 0, generation = 0, wanted = [];
    let width = 0, height = 0, resizeNeeded = false;
    let detailTimer = 0, detailController = null, detailBitmap = null, detailIndex = -1, displayedDetail = false, detailBusy = false;
    function cancelDetail() {
      if (detailTimer) clearTimeout(detailTimer);
      detailTimer = 0;
      detailController?.abort();
      detailController = null;
      detailBitmap?.close();
      detailBitmap = null;
      detailIndex = -1;
    }
    function sharpen() {
      if (detailTimer || detailBusy || detailIndex === target || target === 0 || connection?.saveData) return;
      detailTimer = setTimeout(async () => {
        detailTimer = 0;
        if (!active || destroyed || document.hidden || displayed !== target) return;
        const index = target, epoch = generation, controller = new AbortController();
        detailController = controller;
        detailBusy = true;
        let bitmap;
        try {
          const response = await fetch(`./assets/hero-frames-v3/desktop/frame-${String(index).padStart(3, '0')}.webp`, {
            signal: controller.signal, cache: 'force-cache', priority: 'low'
          });
          if (!response.ok) return;
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          bitmap = await createImageBitmap(blob);
          if (controller.signal.aborted || destroyed || !active || document.hidden || epoch !== generation || target !== index || displayed !== index) return;
          detailBitmap = bitmap;
          bitmap = null;
          detailIndex = index;
          draw(index);
        } catch { /* Optional detail failure must not interrupt motion. */ }
        finally {
          bitmap?.close();
          detailBusy = false;
          if (detailController === controller) detailController = null;
        }
      }, 180);
    }
    const bounded = value => Math.max(0, Math.min(lastFrame, value));
    const release = () => {
      generation++;
      cancelDetail();
      warming = false;
      downloads.forEach(controller => controller.abort());
      pending.forEach(controller => controller.abort());
      cache.forEach(bitmap => bitmap.close());
      cache.clear();
      // Do not clear pending: cancelled decodes still count towards concurrency
      // until they settle. A late bitmap must be closed, never resurrected.
    };
    const schedule = () => {
      if (active && !destroyed && !raf) raf = requestAnimationFrame(tick);
    };
    function draw(index) {
      const isDetail = detailIndex === index && !!detailBitmap;
      const bitmap = isDetail ? detailBitmap : cache.get(index);
      if (!bitmap) return false;
      if (resizeNeeded) {
        sizeCanvas();
        resizeNeeded = false;
        displayed = -1;
      }
      if (displayed !== index || displayedDetail !== isDetail) {
        const scale = Math.max(width / bitmap.width, height / bitmap.height);
        const dw = bitmap.width * scale, dh = bitmap.height * scale;
        context.drawImage(bitmap, (width - dw) / 2, (height - dh) / 2, dw, dh);
        displayed = index;
        displayedDetail = isDetail;
        canvas.hidden = false;
        onDraw(index / lastFrame, index);
      }
      return true;
    }
    function sizeCanvas() {
      const cssWidth = canvas.clientWidth || window.innerWidth;
      const cssHeight = canvas.clientHeight || window.innerHeight;
      // Preserve phone display density without unbounded high-DPI/4K buffers.
      const ratio = Math.min(window.devicePixelRatio || 1, 3,
        Math.sqrt(maxCanvasPixels / Math.max(1, cssWidth * cssHeight)));
      const nextWidth = Math.max(1, Math.floor(cssWidth * ratio));
      const nextHeight = Math.max(1, Math.floor(cssHeight * ratio));
      width = canvas.width = nextWidth;
      height = canvas.height = nextHeight;
      // Resizing resets context state. Request quality resampling each time.
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
    }
    const resize = () => {
      // Defer clearing the canvas until a bitmap can replace its pixels. This
      // preserves the last painted frame across offscreen/orientation changes.
      resizeNeeded = true;
      const old = displayed;
      draw(old);
    };
    function plan(center) {
      requiredFrame = center;
      const candidates = [center];
      // Most prefetch is ahead of movement, with enough behind for reversal.
      for (let offset = 1; candidates.length < capacity; offset++) {
        candidates.push(bounded(center + direction * offset));
        if (offset <= 3) candidates.push(bounded(center - direction * offset));
      }
      wanted = [...new Set(candidates)].slice(0, warming ? openingFrames : capacity);
      const keep = new Set(wanted);
      cache.forEach((bitmap, index) => {
        if (!keep.has(index)) { bitmap.close(); cache.delete(index); }
      });
      pending.forEach((controller, index) => { if (!keep.has(index)) controller.abort(); });
      const ahead = Array.from({ length: warming ? openingFrames : downloadAhead }, (_, offset) => bounded(center + direction * offset));
      downloadWanted = [...new Set([...wanted, ...ahead])];
      downloads.forEach((controller, index) => { if (!downloadWanted.includes(index)) controller.abort(); });
      // A full speculative queue must not block the frame that can unblock
      // painting. Cancel one speculative request; its finalizer frees the slot.
      if (!compressed.has(center) && !downloads.has(center) && downloads.size >= downloadConcurrency) {
        const speculative = [...downloads].reverse().find(([index, controller]) =>
          index !== center && !controller.signal.aborted);
        speculative?.[1].abort();
      }
      pump();
    }
    function download() {
      if ((!active && !warming) || destroyed) return;
      // Decoding and downloading have independent limits. Network can run ahead
      // without allocating a full pixel buffer for every downloaded image.
      for (const index of downloadWanted) {
        if (downloads.size >= downloadConcurrency) break;
        if (compressed.has(index) || downloads.has(index) || failed.has(index)) continue;
        // An evicted speculative frame must not create a refetch/evict loop.
        // Fetch it again only when it becomes part of the immediate window.
        if (fetched.has(index) && !wanted.includes(index)) continue;
        const controller = new AbortController(), epoch = generation;
        downloads.set(index, controller);
        fetch(`./assets/hero-frames-v4/${variant}/frame-${String(index).padStart(3, '0')}.webp`, {
          signal: controller.signal, cache: 'force-cache', priority: index === requiredFrame ? 'high' : 'low'
        })
          .then(response => {
            if (!response.ok) throw new Error(`Hero frame ${response.status}`);
            return response.blob();
          })
          .then(blob => {
            if (destroyed || controller.signal.aborted || epoch !== generation) return;
            compressed.set(index, blob);
            fetched.add(index);
            compressedBytes += blob.size || 0;
            // Keep the small compressed preview for reversal when it fits the
            // byte budget; decoded pixel buffers still use the short window.
            for (const [old, value] of compressed) {
              if (compressedBytes <= compressedLimit && compressed.size <= lastFrame + 1) break;
              if (wanted.includes(old)) continue;
              compressed.delete(old); compressedBytes -= value.size || 0;
            }
          })
          .catch(() => { if (!controller.signal.aborted && epoch === generation) failed.add(index); })
          .finally(() => {
            if (downloads.get(index) === controller) downloads.delete(index);
            pump();
          });
      }
    }
    function pump() {
      if ((!active && !warming) || destroyed) return;
      download();
      for (const index of wanted) {
        if (pending.size >= 2) break;
        if (cache.has(index) || pending.has(index)) continue;
        if (failed.has(index)) { api.destroy(); onError(new Error(`Hero frame ${index} unavailable`)); return; }
        if (!compressed.has(index)) continue;
        const controller = new AbortController();
        const epoch = generation;
        pending.set(index, controller);
        Promise.resolve(compressed.get(index))
          .then(blob => {
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            return createImageBitmap(blob);
          })
          .then(bitmap => {
            if (destroyed || (!active && !warming) || controller.signal.aborted || epoch !== generation || !wanted.includes(index)) bitmap.close();
            else {
              cache.set(index, bitmap);
              schedule();
            }
          })
          .catch(error => {
            if (!controller.signal.aborted && epoch === generation && !destroyed) {
              api.destroy();
              onError(error);
            }
          })
          .finally(() => { pending.delete(index); pump(); });
      }
    }
    function tick(now) {
      raf = 0;
      if (!active || destroyed) return;
      const elapsed = previousTick ? Math.min(50, Math.max(0, now - previousTick)) : 1000 / 60;
      previousTick = now;
      const gap = target - position;
      const step = Math.max(-4, Math.min(4, gap * (1 - Math.exp(-elapsed / 100))));
      const nextPosition = bounded(position + step);
      const next = Math.round(nextPosition);
      plan(next);
      // Never advance the virtual timeline while its frame is missing. Last
      // painted pixels remain visible, and decoding wakes this loop again.
      if (!draw(next)) { previousTick = 0; return; }
      position = nextPosition;
      if (displayed === Math.round(target)) {
        position = target;
        previousTick = 0;
        sharpen();
        return;
      }
      schedule();
    }
    const api = {
      attach(drawCallback, errorCallback) { onDraw = drawCallback; onError = errorCallback; },
      suspendPreload() {
        if (!active && warming) release();
      },
      preload() {
        if (destroyed || active || warming || document.hidden || navigator.connection?.saveData) return;
        warming = true;
        plan(0);
      },
      setProgress(progress, enabled) {
        // Target a real frame, so easing cannot stall just below a half-frame
        // rounding boundary while repeatedly scheduling identical drawings.
        const next = Math.round(bounded(progress * lastFrame));
        if (next !== target) cancelDetail();
        if (Math.abs(next - target) > .001) direction = next > target ? 1 : -1;
        target = next;
        if (!enabled || document.hidden) {
          if (warming && next === 0 && !document.hidden) return;
          if (raf) cancelAnimationFrame(raf);
          raf = previousTick = 0;
          active = false;
          if (cache.size || pending.size || downloads.size || warming) release();
          return;
        }
        active = true;
        warming = false;
        if (!started) { started = true; resize(); }
        schedule();
      },
      resize,
      destroy() {
        destroyed = true;
        active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        release();
        compressed.clear(); compressedBytes = 0;
        canvas.hidden = true;
        instances.delete(canvas);
      },
      // Lightweight diagnostics, containing counts only (not pixel buffers).
      stats: () => ({ capacity, decoded: cache.size, pending: pending.size, displayed, variant,
        downloadAhead, openingFrames, downloadConcurrency, downloading: downloads.size,
        compressed: compressed.size, compressedBytes, compressedLimit, detailIndex,
        detailLoading: detailBusy })
    };
    instances.set(canvas, api);
    return api;
  };

  // This local module runs BEFORE third-party animation scripts. Prepare the
  // opening buffer after the cover can paint, without waiting for window.load.
  // Main initialization adopts this exact instance (no duplicate downloads).
  const poster = document.querySelector?.('.hero-poster');
  const canvas = document.querySelector?.('.hero-canvas');
  if (!poster || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let earlySequence = null;
  const start = () => requestAnimationFrame(() => {
    if (document.hidden || window.scrollY > window.innerHeight ||
        (window.location.hash && !['#top', '#main-content'].includes(window.location.hash))) return;
    earlySequence = instances.get(canvas) || window.NovaHeroSequence({ canvas, onDraw() {}, onError() {} });
    earlySequence?.preload();
  });
  if (poster.complete && poster.naturalWidth > 0) start();
  else poster.addEventListener('load', start, { once: true });
  const suspend = () => {
    if (document.hidden || window.scrollY > window.innerHeight) earlySequence?.suspendPreload();
  };
  window.addEventListener('scroll', suspend, { passive: true });
  document.addEventListener('visibilitychange', suspend);
})();
