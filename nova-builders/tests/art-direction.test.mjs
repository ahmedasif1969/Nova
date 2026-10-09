import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { parseRules } from '../scripts/build-critical-css.mjs';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
const script = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');

test('architectural palette stays warm outside the restored hero headline', () => {
  for (const colour of ['#222824', '#f5f2eb', '#e8e2d7', '#796449']) assert.ok(css.includes(colour));
  assert.doesNotMatch(css, /--plum|--lilac|--lavender|#796687|#ded5e5/);
  assert.equal((css.match(/#c9b9d7/g) || []).length, 1);
  assert.match(css, /\.hero h1 em \{ color: #c9b9d7; font-weight: 400; \}/);
  assert.doesNotMatch(script, /0xc5b3d5|0x9785a4|const purple/);
});

test('project-first layout has one featured development, useful facts and honest concept labels', () => {
  const ids = ['top', 'projects', 'legacy', 'living', 'approach', 'model-study', 'consultation'];
  const positions = ids.map(id => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])));
  assert.equal((html.match(/class="project-card featured-project/g) || []).length, 1);
  assert.equal((html.match(/class="project-facts"/g) || []).length, 3);
  assert.match(html, /Exceptional places\.<\/span><span><em>Extraordinary<\/em> living\./);
  assert.match(html, /All projects, specifications and timelines are portfolio concepts/);
  assert.doesNotMatch(html, /Since 2008|Years of thoughtful development|4\.2M/);
  assert.doesNotMatch(html, /<a class="hero-feature"|<a class="hero-scroll"/);
  assert.match(html, /03 \/ Planning/);
  assert.match(html, /04 \/ Design development/);
});

test('new image families have responsive WebP variants and below-fold images remain lazy', async () => {
  for (const name of ['aurelian-daylight', 'residence-interior', 'material-detail']) {
    const original = await stat(new URL(`../dist/assets/${name}.png`, import.meta.url));
    for (const width of [640, 960, 1536]) {
      const bytes = await readFile(new URL(`../dist/assets/${name}-detail-${width}.webp`, import.meta.url));
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.ok(bytes.length < original.size && bytes.length < 700000);
      assert.ok(html.includes(`${name}-detail-${width}.webp`));
    }
  }
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  for (const image of images.filter(image => !image.includes('hero-poster') && !image.includes('data-dialog-image'))) {
    assert.match(image, /loading="lazy"/);
    assert.match(image, /width="1536" height="1024"/);
  }
  assert.match(script, /image: 'aurelian-daylight'/);
  const hero = await stat(new URL('../dist/assets/aurelian-960.webp', import.meta.url));
  assert.ok(hero.size < 120000, 'The mobile hero must stay lightweight');
});

test('twilight hero and its preload agree while daylight project imagery stays unchanged', () => {
  const hero = html.match(/<img class="hero-poster"[^>]*>/)[0];
  const preload = html.match(/<link rel="preload" as="image"[^>]*>/)[0];
  assert.match(hero, /src="\.\/assets\/aurelian-1536\.webp"/);
  assert.doesNotMatch(hero, /daylight/);
  assert.equal(hero.match(/srcset="([^"]+)"/)[1], preload.match(/imagesrcset="([^"]+)"/)[1]);
  assert.equal(hero.match(/sizes="([^"]+)"/)[1], preload.match(/imagesizes="([^"]+)"/)[1]);
  assert.match(html, /src="\.\/assets\/aurelian-daylight-detail-1536\.webp"/);
  assert.match(css, /\.hero h1 \{[^}]*color: #f3f0eb;[^}]*clamp\(4rem,7\.8vw,8\.75rem\)\/\.96 var\(--display\)/);
  assert.match(css, /--display: "Cormorant Garamond", "Cormorant Fallback", Georgia, serif/);
});

test('landscape featured card and editorial image spread collapse to a phone-friendly column', () => {
  const rules = parseRules(css);
  const phone = rules.filter(rule => rule.header === '@media (max-width: 640px)').flatMap(rule => rule.children);
  assert.ok(phone.some(rule => rule.header.includes('.living-grid') && rule.body.includes('grid-template-columns: 1fr')));
  assert.ok(phone.some(rule => rule.header === '.project-card.featured-project .project-image' && rule.body.includes('4/3')));
  assert.ok(phone.some(rule => rule.header === '.project-list' && rule.body.includes('grid-template-columns: 1fr')));
  // The validated model fitting/rotation-pivot logic must survive the redesign.
  assert.match(script, /tower\.position\.copy\(towerCenter\)\.multiplyScalar\(-1\)/);
  assert.match(script, /const towerPivot = new THREE\.Group\(\)/);
});
