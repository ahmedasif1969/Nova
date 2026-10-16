import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../dist/hero-sequence.js', import.meta.url), 'utf8');
function fixture({ bootstrap = false, deferAdoption = false, mobile = false, deviceMemory = 8, slowDecode = false, saveData = false, blobSize = 200000, fail = false, width = mobile ? 390 : 1440, height = mobile ? 844 : 900, dpr = 3 } = {}) {
  const frames = new Map(), requests = [], bitmaps = [], decodes = [];
  const painted = [], errors = [];
  let id = 0, time = 0, live = 0, peak = 0;
  const context = { drawImage(bitmap) { assert.equal(bitmap.closed, false); painted.push(bitmap.index); } };
  const canvas = { hidden: true, clientWidth: width, clientHeight: height, getContext: () => context };
  const document = { hidden: false };
  if (bootstrap) {
    document.querySelector = selector => selector === '.hero-canvas' ? canvas : { complete: true, naturalWidth: 1280 };
    document.addEventListener = () => {};
  }
  const bitmap = blob => {
    live++; peak = Math.max(peak, live);
    const image = { index: blob.index, width: 1344, height: 768, closed: false,
      close() { assert.equal(this.closed, false, 'Do not close a buffer twice'); this.closed = true; live--; } };
    bitmaps.push(image); return image;
  };
  const decode = blob => slowDecode ? new Promise(resolve => decodes.push(() => resolve(bitmap(blob)))) : Promise.resolve(bitmap(blob));
  const window = { createImageBitmap: decode, AbortController, devicePixelRatio: dpr, innerWidth: width, innerHeight: height,
    scrollY: 0, location: { hash: '' }, addEventListener() {},
    matchMedia: query => ({ matches: query.includes('max-width') && mobile }) };
  runInNewContext(source, { window, document, navigator: { deviceMemory, connection: { saveData } }, AbortController, DOMException, Promise,
    createImageBitmap: decode,
    fetch: async (url, { signal }) => {
      requests.push({ url, signal });
      return { ok: !fail, status: fail ? 404 : 200, blob: async () => ({ index: Number(url.match(/frame-(\d+)/)[1]), size: blobSize }) };
    },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id) });
  const callbacks = [];
  let api;
  const adopt = () => { api = window.NovaHeroSequence({ canvas, onDraw: (p, index) => callbacks.push({ p, index }), onError: error => errors.push(error) }); return api; };
  if (!deferAdoption) adopt();
  const microtasks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const tick = async () => {
    time += 1000 / 60;
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
    await microtasks();
  };
  const settle = async () => { for (let i = 0; i < 500; i++) { await tick(); if (!frames.size && !api.stats().pending) return; } throw new Error('Sequence did not settle'); };
  return { get api() { return api; }, adopt, canvas, context, document, requests, bitmaps, decodes, painted, errors, callbacks, frames, tick, settle, microtasks,
    live: () => live, peak: () => peak };
}

test('early loader downloads before main adoption and reuses the same buffer', async () => {
  const p = fixture({ bootstrap: true, deferAdoption: true });
  await p.tick();
  for (let i = 0; i < 10; i++) await p.microtasks();
  assert.equal(p.requests.length, 12, 'No main script or window load event needed');
  assert.equal(p.painted.length, 0);
  const api = p.adopt();
  assert.equal(p.adopt(), api, 'Main must reuse the early instance');
  api.preload(); await p.microtasks();
  assert.equal(p.requests.length, 12, 'No duplicate opening downloads');
  api.setProgress(.1, true); await p.settle();
  assert.ok(p.callbacks.length > 0);
  api.destroy(); await p.microtasks();
});

test('late warm-up cannot overwrite callbacks already attached by main', async () => {
  const p = fixture({ bootstrap: true });
  await p.tick();
  p.api.setProgress(.1, true); await p.settle();
  assert.ok(p.callbacks.length > 0, 'Poster and copy callbacks must survive bootstrap racing main');
  p.api.destroy(); await p.microtasks();
});

test('sequence is lazy, renders all the way forward and reverse, and stops without a final jump', async () => {
  const p = fixture();
  assert.equal(p.requests.length, 0);
  p.api.setProgress(0, false); await p.tick();
  assert.equal(p.requests.length, 0);
  p.api.setProgress(1, true); await p.settle();
  assert.equal(p.api.stats().displayed, 191);
  for (let i = 1; i < p.painted.length; i++) assert.ok(p.painted[i] - p.painted[i - 1] <= 4, 'Catch-up draws remain bounded');
  assert.equal(p.canvas.hidden, false);
  const count = p.painted.length;
  for (let i = 0; i < 10; i++) await p.tick();
  assert.equal(p.painted.length, count, 'No terminal correction after settling');
  p.api.setProgress(0, true); await p.settle();
  assert.equal(p.api.stats().displayed, 0);
  const reverse = p.painted.slice(count);
  for (let i = 1; i < reverse.length; i++) assert.ok(reverse[i] <= reverse[i - 1]);
  assert.equal(p.frames.size, 0);
});

test('decoded cache, decode concurrency and backing store stay bounded on desktop/mobile', async () => {
  for (const options of [{}, { mobile: true }, { mobile: true, deviceMemory: 4 }, { width: 3840, height: 2160 }]) {
    const p = fixture(options);
    for (const target of [1, 0, .7, .2, .95, .01]) {
      p.api.setProgress(target, true);
      for (let i = 0; i < 80; i++) {
        await p.tick();
        assert.ok(p.api.stats().decoded <= p.api.stats().capacity);
        assert.ok(p.api.stats().pending <= 2);
      }
    }
    assert.ok(p.peak() <= p.api.stats().capacity + 2, 'Include transient decoding buffers in the bound');
    assert.ok(p.canvas.width * p.canvas.height <= (options.deviceMemory === 4 ? 2000000 : 4000000), 'Backing store respects the device pixel budget');
    assert.equal(p.api.stats().capacity, options.deviceMemory === 4 ? 8 : options.mobile ? 10 : 12);
    assert.ok(p.requests.every(request => request.url.includes('/desktop/')), 'Phones also download the original-resolution frames');
    p.api.destroy(); await p.microtasks();
    assert.equal(p.live(), 0);
  }
});

test('opening buffer warms without drawing or downloading the entire clip', async () => {
  for (const options of [{}, { mobile: true }, { deviceMemory: 4 }]) {
    const p = fixture(options);
    p.api.preload();
    for (let i = 0; i < 30; i++) await p.microtasks();
    assert.equal(p.requests.length, options.deviceMemory === 4 ? 8 : 12);
    assert.equal(p.painted.length, 0);
    assert.equal(p.canvas.hidden, true);
    assert.ok(p.api.stats().decoded <= p.api.stats().capacity);
    const requests = p.requests.length;
    p.api.setProgress(0, true); await p.tick();
    assert.equal(p.api.stats().displayed, 0);
    assert.ok(p.requests.slice(requests).every(r => !r.url.endsWith('frame-000.webp')), 'Opening frame is reused');
    p.api.destroy(); await p.microtasks();
  }
  const saver = fixture({ saveData: true }); saver.api.preload(); await saver.microtasks();
  assert.equal(saver.requests.length, 0);
  const hidden = fixture(); hidden.document.hidden = true; hidden.api.preload(); await hidden.microtasks();
  assert.equal(hidden.requests.length, 0);
});

test('network runs ahead independently of two slow decodes with bounded compressed storage', async () => {
  for (const options of [{}, { mobile: true }, { deviceMemory: 4 }]) {
    const p = fixture({ ...options, slowDecode: true });
    p.api.setProgress(.5, true); await p.tick();
    for (let i = 0; i < 30; i++) await p.microtasks();
    const stats = p.api.stats();
    assert.equal(stats.downloadAhead, options.deviceMemory === 4 ? 16 : options.mobile ? 32 : 48);
    assert.equal(stats.downloadConcurrency, options.deviceMemory === 4 ? 2 : 4);
    assert.equal(p.decodes.length, 2);
    assert.ok(p.requests.length >= stats.downloadAhead, 'Downloads continue while decoders are occupied');
    assert.ok(stats.compressedBytes <= stats.compressedLimit);
    p.api.destroy(); p.decodes.splice(0).forEach(done => done()); await p.microtasks();
    assert.equal(p.live(), 0); assert.equal(p.api.stats().compressedBytes, 0);
  }
});

test('compressed byte eviction does not continuously redownload speculative frames', async () => {
  const p = fixture({ mobile: true, blobSize: 1000000 });
  p.api.setProgress(.3, true); await p.settle();
  for (let i = 0; i < 30; i++) await p.microtasks();
  const count = p.requests.length;
  for (let i = 0; i < 30; i++) await p.microtasks();
  assert.equal(p.requests.length, count);
  assert.ok(p.api.stats().compressedBytes <= p.api.stats().compressedLimit);
  p.api.destroy(); await p.microtasks();
});

test('phone canvas preserves 2x/3x pixel dimensions after rotation', async () => {
  for (const dpr of [2, 3]) {
    const p = fixture({ mobile: true, dpr });
    p.api.setProgress(.5, true); await p.settle();
    assert.equal(p.canvas.width, 390 * dpr);
    assert.equal(p.canvas.height, 844 * dpr);
    assert.equal(p.context.imageSmoothingEnabled, true);
    assert.equal(p.context.imageSmoothingQuality, 'high');
    const frame = p.api.stats().displayed;
    p.canvas.clientWidth = 844; p.canvas.clientHeight = 390;
    p.api.resize();
    assert.equal(p.canvas.width, 844 * dpr);
    assert.equal(p.canvas.height, 390 * dpr);
    assert.equal(p.api.stats().displayed, frame);
    assert.equal(p.canvas.hidden, false);
    p.api.destroy(); await p.microtasks();
    assert.equal(p.live(), 0);
  }
});

test('exact half-frame targets settle from either direction without an idle redraw loop', async () => {
  const p = fixture({ mobile: true });
  for (const target of [0, .5, 1, .5]) {
    p.api.setProgress(target, true); await p.settle();
    assert.equal(p.api.stats().displayed, Math.round(target * 191));
    assert.equal(p.frames.size, 0);
  }
  p.api.destroy(); await p.microtasks();
});

test('offscreen/hidden suspension releases images and closes late decodes without resurrecting work', async () => {
  const p = fixture({ slowDecode: true });
  p.api.setProgress(.9, true); await p.tick();
  assert.equal(p.decodes.length, 2);
  p.api.setProgress(0, false);
  const stoppedRequests = p.requests.length;
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks();
  assert.equal(p.live(), 0);
  assert.equal(p.api.stats().pending, 0);
  assert.equal(p.frames.size, 0);
  assert.equal(p.api.stats().downloading, 0);
  assert.equal(p.requests.length, stoppedRequests, 'Suspension must stop background downloads');
  p.api.setProgress(0, true); await p.tick();
  for (let i = 0; i < 5 && p.api.stats().displayed !== 0; i++) {
    p.decodes.splice(0).forEach(complete => complete()); await p.microtasks(); await p.tick();
  }
  assert.equal(p.api.stats().displayed, 0);
  p.document.hidden = true;
  p.api.setProgress(.5, true);
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks();
  assert.equal(p.live(), 0);
  assert.equal(p.frames.size, 0);
});

test('rapid reversal does not draw an obsolete asynchronously decoded forward frame', async () => {
  const p = fixture({ slowDecode: true });
  p.api.setProgress(1, true); await p.tick();
  const oldDecodes = p.decodes.splice(0);
  p.api.setProgress(0, true); await p.tick();
  oldDecodes.forEach(complete => complete()); await p.microtasks();
  assert.equal(p.painted.length, 0);
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks(); await p.tick();
  assert.deepEqual(p.painted, [0]);
  p.api.destroy();
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks();
  assert.equal(p.live(), 0);
});

test('network/decode failure relinquishes canvas once for MP4 fallback', async () => {
  const p = fixture({ fail: true });
  p.api.setProgress(.5, true); await p.tick();
  assert.equal(p.errors.length, 1);
  assert.equal(p.canvas.hidden, true);
  assert.equal(p.frames.size, 0);
  assert.equal(p.live(), 0);
});

test('offscreen resize retains pixels until a replacement bitmap is ready', async () => {
  const p = fixture();
  p.api.setProgress(.3, true); await p.settle();
  p.api.setProgress(.3, false);
  const width = p.canvas.width;
  p.canvas.clientWidth = 640;
  p.api.resize();
  assert.equal(p.canvas.hidden, false);
  assert.equal(p.canvas.width, width, 'Do not clear retained pixels without a replacement');
  p.api.setProgress(.3, true); await p.settle();
  assert.equal(p.canvas.width, 1686);
  assert.equal(p.api.stats().displayed, Math.round(.3 * 191));
  p.api.destroy(); await p.microtasks();
});

test('active sequence contains all 192 new source frames and the previous original is preserved', async () => {
  const root = new URL('../dist/assets/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('hero-frames-q65/manifest.json', root), 'utf8'));
  assert.equal(manifest.frameCount, 192);
  assert.equal(manifest.fps, 24);
  assert.equal(manifest.source, 'nova-construction-v2.mp4');
  const replacement = await readFile(new URL(manifest.source, root));
  assert.equal(createHash('sha256').update(replacement).digest('hex'), '9ba8c3aa0a6233cc14924a2cbfb91c3a10411e88112054c0783b9de2ed8b1c08');
  for (const variant of manifest.variants) {
    assert.equal(variant.width, 1280);
    assert.equal(variant.height, 720);
    assert.equal(variant.quality, 65);
    const folder = new URL(`hero-frames-q65/${variant.name}/`, root);
    const files = (await readdir(folder)).sort();
    assert.equal(files.length, 192);
    let total = 0;
    for (let index = 0; index < 192; index++) {
      const name = `frame-${String(index).padStart(3, '0')}.webp`;
      assert.equal(files[index], name);
      const bytes = await readFile(new URL(name, folder));
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(bytes.toString('ascii', 12, 16), 'VP8 ');
      assert.equal(bytes.readUInt16LE(26) & 0x3fff, variant.width);
      assert.equal(bytes.readUInt16LE(28) & 0x3fff, variant.height);
      total += (await stat(new URL(name, folder))).size;
    }
    assert.equal(total, variant.bytes);
    const previous = JSON.parse(await readFile(new URL('hero-frames-v3/manifest.json', root), 'utf8'));
    assert.ok(total < previous.variants[0].bytes * .95, 'Stronger compression reduces transfer at unchanged resolution');
    const checkpoint = JSON.parse(await readFile(new URL('hero-frames-v2/manifest.json', root), 'utf8'));
    assert.ok(total < checkpoint.variants[0].bytes * .6, 'Compression saves at least 40% without resizing or dropping frames');
  }
  const original = await readFile(new URL('nova-construction.mp4', root));
  assert.equal(createHash('sha256').update(original).digest('hex'), '9e22851da39ac9eaca20594f562a1f5dc17d536d25c230b8be81d6436db6ada1');
});
