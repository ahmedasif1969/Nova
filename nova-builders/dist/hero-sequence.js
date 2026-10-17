/* Background compressed frames, bounded directional decoding, canvas playback. */
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
    const capacity = lowMemory ? 10 : 12;
    const decodeAhead = lowMemory ? 6 : 8;
    const decodeConcurrency = lowMemory || mobile ? 2 : 3;
    const downloadConcurrency = lowMemory ? 3 : 4;
    // The current complete sequence is 17.6 MB. Retain it without retaining
    // every decoded bitmap; guard against a future larger asset set as well.
    const compressedLimit = 24 * 1024 * 1024;
    const compressed = new Map(), downloads = new Map(), failed = new Set(), fetched = new Set();
    let compressedBytes = 0, downloadWanted = [], warming = false, prefetching = false;
    // Share original-resolution frames across devices. The smaller archive
    // softens fine building details on high-density phone displays.
    const variant = 'desktop';
    const maxCanvasPixels = lowMemory ? 2000000 : 4000000;
    const lastFrame = 191;
    const allFrames = Array.from({ length: lastFrame + 1 }, (_, index) => index);
    const cache = new Map();
    const pending = new Map();
    let active = false, destroyed = false;
    let target = 0, position = 0, displayed = -1, direction = 1;
    let raf = 0, previousTick = 0, generation = 0, wanted = [];
    let width = 0, height = 0, resizeNeeded = true;
    const bounded = value => Math.max(0, Math.min(lastFrame, value));
    const easedPosition = (cursor, destination, elapsed) => bounded(cursor +
      Math.max(-4, Math.min(4, (destination - cursor) * (1 - Math.exp(-elapsed / 100)))));
    const releaseDecoded = () => {
      generation++;
      warming = false;
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
      const bitmap = cache.get(index);
      if (!bitmap) return false;
      if (resizeNeeded) {
        sizeCanvas();
        resizeNeeded = false;
        displayed = -1;
      }
      if (displayed !== index) {
        const scale = Math.max(width / bitmap.width, height / bitmap.height);
        const dw = bitmap.width * scale, dh = bitmap.height * scale;
        context.drawImage(bitmap, (width - dw) / 2, (height - dh) / 2, dw, dh);
        displayed = index;
        canvas.hidden = false;
        onDraw(index / lastFrame, index);
      }
      return true;
    }
    function sizeCanvas() {
      const cssWidth = canvas.clientWidth || window.innerWidth;
      const cssHeight = canvas.clientHeight || window.innerHeight;
      // Limit repaint cost independently of the original-resolution downloads.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5,
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
    function plan(center, cursor = center) {
      const candidates = [], seen = new Set();
      const add = index => {
        index = bounded(index);
        if (!seen.has(index)) { seen.add(index); candidates.push(index); }
      };
      add(center);
      // Predict the same eased steps tick() will paint, starting at the next
      // displayed position, rather than decoding around the distant scroll target.
      if (active) {
        for (let step = 1; step < decodeAhead; step++) {
          if (Math.round(cursor) === Math.round(target)) break;
          cursor = easedPosition(cursor, target, 1000 / 60);
          add(Math.round(cursor));
        }
      }
      for (let offset = 1; candidates.length < decodeAhead; offset++) {
        const index = center + direction * offset;
        if (index < 0 || index > lastFrame) break;
        add(index);
      }
      if (displayed >= 0) add(displayed);
      for (let offset = 1; offset <= 3; offset++) add(center - direction * offset);
      for (let offset = 1; candidates.length < capacity && offset <= lastFrame; offset++) {
        add(center + offset); add(center - offset);
      }
      wanted = candidates.slice(0, capacity);
      const keep = new Set(wanted);
      cache.forEach((bitmap, index) => {
        if (!keep.has(index)) { bitmap.close(); cache.delete(index); }
      });
      pending.forEach((controller, index) => { if (!keep.has(index)) controller.abort(); });
      downloadWanted = [...new Set([...wanted, ...(prefetching ? allFrames : [])])];
      pump();
    }
    function download() {
      if ((!active && !warming && !prefetching) || destroyed || document.hidden) return;
      // Decoding and downloading have independent limits. Network can run ahead
      // without allocating a full pixel buffer for every downloaded image.
      for (const index of downloadWanted) {
        if (downloads.size >= downloadConcurrency) break;
        if (compressed.has(index) || downloads.has(index) || failed.has(index)) continue;
        // An evicted speculative frame must not create a refetch/evict loop.
        // Fetch it again only when it becomes part of the immediate window.
        if (fetched.has(index) && !wanted.includes(index)) continue;
        const controller = new AbortController();
        downloads.set(index, controller);
        fetch(`./assets/hero-frames-q65/${variant}/frame-${String(index).padStart(3, '0')}.webp`, {
          signal: controller.signal, cache: 'force-cache', priority: index === wanted[0] ? 'high' : 'low'
        })
          .then(response => {
            if (!response.ok) throw new Error(`Hero frame ${response.status}`);
            return response.blob();
          })
          .then(blob => {
            if (destroyed || controller.signal.aborted) return;
            compressed.set(index, blob);
            fetched.add(index);
            compressedBytes += blob.size || 0;
            // Retain the full sequence when it fits. If a future asset set is
            // larger, evict outside the imminent decode window without refetch loops.
            for (const [old, value] of compressed) {
              if (compressedBytes <= compressedLimit) break;
              if (wanted.includes(old)) continue;
              compressed.delete(old); compressedBytes -= value.size || 0;
            }
            if (compressedBytes > compressedLimit) {
              compressed.delete(index); compressedBytes -= blob.size || 0;
              failed.add(index);
            }
          })
          .catch(() => { if (!controller.signal.aborted && !destroyed) failed.add(index); })
          .finally(() => { downloads.delete(index); pump(); });
      }
    }
    function pump() {
      if (destroyed) return;
      download();
      if ((!active && !warming) || document.hidden) return;
      for (const index of wanted) {
        if (pending.size >= decodeConcurrency) break;
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
              if (warming && !active && index === 0) draw(0);
              else schedule();
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
      if (gap) direction = gap > 0 ? 1 : -1;
      const nextPosition = easedPosition(position, target, elapsed);
      const next = Math.round(nextPosition);
      plan(next, nextPosition);
      // Never advance the virtual timeline while its frame is missing. Last
      // painted pixels remain visible, and decoding wakes this loop again.
      if (!draw(next)) { previousTick = 0; return; }
      position = nextPosition;
      if (displayed === Math.round(target)) {
        position = target;
        previousTick = 0;
        return;
      }
      schedule();
    }
    const api = {
      attach(drawCallback, errorCallback) {
        onDraw = drawCallback; onError = errorCallback;
        if (displayed >= 0) onDraw(displayed / lastFrame, displayed);
      },
      suspendPreload() {
        if (!active && warming) releaseDecoded();
      },
      preload() {
        if (destroyed || active || warming || document.hidden || navigator.connection?.saveData) return;
        prefetching = true;
        warming = true;
        plan(0);
        draw(0);
      },
      setProgress(progress, enabled) {
        // Target a real frame, so easing cannot stall just below a half-frame
        // rounding boundary while repeatedly scheduling identical drawings.
        const next = Math.round(bounded(progress * lastFrame));
        if (next !== position) direction = next > position ? 1 : -1;
        target = next;
        if (!enabled || document.hidden) {
          if (raf) cancelAnimationFrame(raf);
          raf = previousTick = 0;
          active = false;
          if (prefetching && next === 0 && !document.hidden) {
            warming = true;
            plan(0);
            draw(0);
          } else {
            if (cache.size || pending.size || warming) releaseDecoded();
            pump();
          }
          return;
        }
        active = true;
        warming = false;
        if (!navigator.connection?.saveData) prefetching = true;
        schedule();
      },
      resize,
      destroy() {
        destroyed = true;
        active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        prefetching = false;
        downloads.forEach(controller => controller.abort());
        releaseDecoded();
        compressed.clear(); compressedBytes = 0;
        canvas.hidden = true;
        instances.delete(canvas);
      },
      // Lightweight diagnostics, containing counts only (not pixel buffers).
      stats: () => ({ capacity, decoded: cache.size, pending: pending.size, displayed, variant,
        decodeAhead, decodeConcurrency, downloadConcurrency, downloading: downloads.size,
        compressed: compressed.size, compressedBytes, compressedLimit })
    };
    instances.set(canvas, api);
    return api;
  };

  // This local module runs BEFORE third-party animation scripts. Prepare the
  // sequence after the cover can paint, without waiting for window.load.
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) earlySequence?.suspendPreload();
    else if (window.scrollY <= window.innerHeight) earlySequence?.preload();
  });
})();
