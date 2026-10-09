import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewServer } from '../serve.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const videoPath = resolve(root, 'assets/nova-construction-scrub.mp4');
const server = createPreviewServer(root);
let address;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('the complete landing page and its local asset references are available', async () => {
  const response = await fetch(address);
  assert.equal(response.status, 200);
  const html = await response.text();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique for navigation and dialog labelling');
  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing anchor: ${match[1]}`);
  const localAssets = [...html.matchAll(/\b(?:src|href)="\.\/([^"]+)"/g)].map(match => match[1]);
  for (const asset of new Set(localAssets)) assert.ok((await stat(resolve(root, asset))).isFile(), `Missing asset: ${asset}`);
  assert.match(html, /<dialog[^>]+aria-labelledby="project-dialog-title"/);
});

test('video seeking returns exactly the requested bytes, including suffix ranges', async () => {
  const video = await readFile(videoPath);
  for (const [range, expected] of [['bytes=100-163', video.subarray(100, 164)], ['bytes=-64', video.subarray(-64)]]) {
    const response = await fetch(`${address}/assets/nova-construction-scrub.mp4`, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-length'), '64');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
});

test('invalid and multi-part ranges are rejected, rather than downloading the full video', async () => {
  for (const range of ['bytes=999999999-', 'bytes=10-5', 'bytes=0-1,5-6', 'bytes=-0']) {
    const response = await fetch(`${address}/assets/nova-construction-scrub.mp4`, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.match(response.headers.get('content-range'), /^bytes \*\//);
  }
});

test('HEAD requests preserve range metadata without sending media', async () => {
  const response = await fetch(`${address}/assets/nova-construction-scrub.mp4`, { method: 'HEAD', headers: { Range: 'bytes=0-63' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-length'), '64');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('the static preview cannot accept forms or serve files outside dist', async () => {
  assert.equal((await fetch(address, { method: 'POST', body: 'test' })).status, 405);
  assert.equal((await fetch(`${address}/.git/config`)).status, 404);
  assert.equal((await fetch(`${address}/%2e%2e%5cpackage.json`)).status, 404);
});

test('initial HTML keeps heavy media out of the critical load', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  assert.doesNotMatch(html, /<script[^>]+three[^>]+>/);
  assert.doesNotMatch(html, /\.png["\s]/);
  const video = html.match(/<video\b[^>]*>([\s\S]*?)<\/video>/);
  assert.ok(video);
  assert.match(video[0], /preload="none"/);
  assert.doesNotMatch(video[0], /(?:\s|<)src="/);
  assert.match(video[0], /data-src="\.\/assets\/nova-construction-scrub\.mp4"/);
  const hero = html.match(/<img class="hero-poster"[^>]*>/)[0];
  const preload = html.match(/<link rel="preload" as="image"[^>]*>/)[0];
  assert.doesNotMatch(hero, /loading="lazy"/);
  assert.match(hero, /fetchpriority="high"/);
  assert.equal(hero.match(/\ssrcset="([^"]+)"/)[1], preload.match(/imagesrcset="([^"]+)"/)[1]);
  assert.equal(hero.match(/\ssizes="([^"]+)"/)[1], preload.match(/imagesizes="([^"]+)"/)[1]);
  assert.doesNotMatch(html.match(/<img data-dialog-image[^>]*>/)[0], /\ssrc="/);
});

test('responsive images are genuine WebP files and substantially smaller', async () => {
  for (const name of ['aurelian', 'vela', 'meridian']) {
    const original = await stat(resolve(root, `assets/${name}.png`));
    for (const width of [640, 960, 1536]) {
      const path = `assets/${name}-${width}.webp`;
      const response = await fetch(`${address}/${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.ok(bytes.length < original.size * .1, `${path} should be at least 90% smaller`);
    }
  }
});

test('high-detail project images are separate from the lightweight hero', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const hero = html.match(/<img class="hero-poster"[^>]*>/)[0];
  assert.doesNotMatch(hero, /-detail-/);
  const cards = [...html.matchAll(/<img[^>]*alt="(?:The Aurelian|Vela Residences|Meridian One)[^"]*"[^>]*>/g)];
  assert.equal(cards.length, 3);
  for (const [card] of cards) {
    assert.match(card, /-detail-1536\.webp/);
    assert.match(card, /loading="lazy"/);
    assert.match(card, /sizes="\(max-width: 640px\) 180vw/);
  }
  for (const name of ['aurelian', 'vela', 'meridian']) {
    const original = await stat(resolve(root, `assets/${name}.png`));
    for (const width of [640, 960, 1536]) {
      const response = await fetch(`${address}/assets/${name}-detail-${width}.webp`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      const lightweight = await stat(resolve(root, `assets/${name}-${width}.webp`));
      assert.ok(bytes.length > lightweight.size, 'Detail assets must not reuse the lower-quality encoding');
      assert.ok(bytes.length < original.size, 'Detail assets should still be smaller than the original PNG');
    }
  }
});

test('local font definitions point to real, correctly served WOFF2 files', async () => {
  const css = await readFile(resolve(root, 'styles.css'), 'utf8');
  const fonts = [...css.matchAll(/url\("\.\/(assets\/fonts\/[^\"]+\.woff2)"\)/g)];
  assert.equal(fonts.length, 3);
  assert.equal((css.match(/font-display: swap/g) || []).length, 3);
  for (const [, path] of fonts) {
    const response = await fetch(`${address}/${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'font/woff2');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
    assert.ok(bytes.length > 10000 && bytes.length < 50000);
  }
  for (const family of ['CormorantGaramond', 'Manrope']) {
    const license = await readFile(resolve(root, `assets/fonts/${family}-OFL.txt`), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/);
  }
});
