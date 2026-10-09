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
