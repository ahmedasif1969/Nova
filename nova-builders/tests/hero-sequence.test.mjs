import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../dist/hero-sequence.js', import.meta.url), 'utf8');
function fixture({ mobile = false, deviceMemory = 8, slowDecode = false, fail = false, width = mobile ? 390 : 1440, height = mobile ? 844 : 900, dpr = 3 } = {}) {
  const frames = new Map(), requests = [], bitmaps = [], decodes = [];
  const painted = [], errors = [];
  let id = 0, time = 0, live = 0, peak = 0;
  const context = { drawImage(bitmap) { assert.equal(bitmap.closed, false); painted.push(bitmap.index); } };
  const canvas = { hidden: true, clientWidth: width, clientHeight: height, getContext: () => context };
  const document = { hidden: false };
  const bitmap = blob => {
    live++; peak = Math.max(peak, live);
    const image = { index: blob.index, width: 1344, height: 768, closed: false,
      close() { assert.equal(this.closed, false, 'Do not close a buffer twice'); this.closed = true; live--; } };
    bitmaps.push(image); return image;
  };
  const decode = blob => slowDecode ? new Promise(resolve => decodes.push(() => resolve(bitmap(blob)))) : Promise.resolve(bitmap(blob));
  const window = { createImageBitmap: decode, AbortController, devicePixelRatio: dpr, innerWidth: width, innerHeight: height,
    matchMedia: () => ({ matches: mobile }) };
  runInNewContext(source, { window, document, navigator: { deviceMemory }, AbortController, DOMException,
    createImageBitmap: decode,
    fetch: async (url, { signal }) => {
      requests.push({ url, signal });
      return { ok: !fail, status: fail ? 404 : 200, blob: async () => ({ index: Number(url.match(/frame-(\d+)/)[1]) }) };
    },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id) });
  const callbacks = [];
  const api = window.NovaHeroSequence({ canvas, onDraw: (p, index) => callbacks.push({ p, index }), onError: error => errors.push(error) });
  const microtasks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const tick = async () => {
    time += 1000 / 60;
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
    await microtasks();
  };
  const settle = async () => { for (let i = 0; i < 500; i++) { await tick(); if (!frames.size && !api.stats().pending) return; } throw new Error('Sequence did not settle'); };
  return { api, canvas, context, document, requests, bitmaps, decodes, painted, errors, callbacks, frames, tick, settle, microtasks,
    live: () => live, peak: () => peak };
}

test('sequence is lazy, renders all the way forward and reverse, and stops without a final jump', async () => {
  const p = fixture();
  assert.equal(p.requests.length, 0);
  p.api.setProgress(0, false); await p.tick();
  assert.equal(p.requests.length, 0);
  p.api.setProgress(1, true); await p.settle();
  assert.equal(p.api.stats().displayed, 293);
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
    assert.equal(p.api.stats().displayed, Math.round(target * 293));
    assert.equal(p.frames.size, 0);
  }
  p.api.destroy(); await p.microtasks();
});

test('offscreen/hidden suspension releases images and closes late decodes without resurrecting work', async () => {
  const p = fixture({ slowDecode: true });
  p.api.setProgress(.9, true); await p.tick();
  assert.equal(p.decodes.length, 2);
  p.api.setProgress(0, false);
  assert.ok(p.requests.every(request => request.signal.aborted));
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks();
  assert.equal(p.live(), 0);
  assert.equal(p.api.stats().pending, 0);
  assert.equal(p.frames.size, 0);
  p.api.setProgress(0, true); await p.tick();
  p.decodes.splice(0).forEach(complete => complete()); await p.microtasks(); await p.tick();
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
  assert.equal(p.api.stats().displayed, Math.round(.3 * 293));
  p.api.destroy(); await p.microtasks();
});

test('both sequences contain all 294 real WebP frames and the original MP4 is unchanged', async () => {
  const root = new URL('../dist/assets/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('hero-frames/manifest.json', root), 'utf8'));
  assert.equal(manifest.frameCount, 294);
  assert.equal(manifest.fps, 24);
  for (const variant of manifest.variants) {
    const folder = new URL(`hero-frames/${variant.name}/`, root);
    const files = (await readdir(folder)).sort();
    assert.equal(files.length, 294);
    let total = 0;
    for (let index = 0; index < 294; index++) {
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
  }
  const original = await readFile(new URL('nova-construction.mp4', root));
  assert.equal(createHash('sha256').update(original).digest('hex'), '9e22851da39ac9eaca20594f562a1f5dc17d536d25c230b8be81d6436db6ada1');
});
