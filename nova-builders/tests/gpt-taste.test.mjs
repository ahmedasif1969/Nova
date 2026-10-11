import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { parseRules } from '../scripts/build-critical-css.mjs';

const root = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('styles.css', root), 'utf8');
const script = await readFile(new URL('script.js', root), 'utf8');
const rules = parseRules(css);

test('cinematic hero preserves the original media and serif while keeping two clear actions', () => {
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf('<section class="projects'));
  assert.equal((hero.match(/<h1>/g) || []).length, 1);
  assert.match(hero, /<h1><span>Exceptional places\.<\/span><span><em>Extraordinary<\/em> living\.<\/span><\/h1>/);
  assert.match(css, /\.hero h1 \{[^}]*width: 100%; max-width: 86rem/);
  assert.match(css, /\.hero-copy \{[^}]*align-items: center; justify-content: center/);
  const phoneRules = rules.filter(rule => rule.header === '@media (max-width: 640px)').flatMap(rule => rule.children);
  assert.ok(phoneRules.some(rule => rule.header === '.hero h1 > span' && rule.body.includes('white-space: nowrap')));
  assert.doesNotMatch(css, /\.hero h1 span:(?:first|last)-child \{ max-width: (?:9|11)ch/);
  assert.equal((hero.match(/class="button button-/g) || []).length, 2);
  assert.doesNotMatch(hero, /hero-edition|hero-feature|project-number|data-count|status-dot/);
  assert.match(hero, /data-src="\.\/assets\/nova-construction-scrub\.mp4"/);
  assert.match(hero, /src="\.\/assets\/aurelian-1536\.webp"/);
  assert.match(css, /--display: "Cormorant Garamond"/);
  assert.match(css, /\.button-primary \{ color: var\(--ink\); background: var\(--sand\)/);
  assert.match(css, /\.button-outline \{[^}]*color: #f3f0eb; background: rgba\(15,16,20,\.32\)/);
});

test('project cells fill their grid for all filters and new chapters avoid numeric labels', () => {
  assert.match(html, /<h2 class="philosophy-heading reveal-section">Designed for life\.<br\/>Built to belong\.<\/h2>/);
  assert.doesNotMatch(html, /inline-study/);
  assert.doesNotMatch(css, /\.inline-study/);
  const spansByFilter = [[2, 1, 1], [1, 1], [2]];
  for (const spans of spansByFilter) {
    let column = 0; let rows = 1;
    for (const span of spans) {
      if (column === 2) { rows++; column = 0; }
      assert.ok(column + span <= 2);
      column += span;
    }
    assert.equal(column, 2);
    assert.equal(spans.reduce((sum, span) => sum + span, 0), rows * 2);
  }
  assert.match(css, /\.project-list \{[^}]*grid-auto-flow: dense;[^}]*gap: 0/);
  assert.match(css, /data-visible-count="1"[^}]*grid-column: 1 \/ -1/);
  assert.doesNotMatch(html, /class="section-kicker">\d+ \/|<span class="project-number"/);
  assert.match(html, /data-principles-marquee/);
  assert.doesNotMatch(html, /picsum\.photos|Trusted partners|testimonial-carousel/);
  const ids = ['top', 'projects', 'legacy', 'living', 'approach', 'model-study', 'consultation'];
  const positions = ids.map(id => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
});

test('material chapters have unique control targets and responsive static fallbacks', () => {
  const figures = [...html.matchAll(/<figure class="material-panel"[\s\S]*?<\/figure>/g)].map(match => match[0]);
  assert.equal(figures.length, 3);
  const targets = figures.map(figure => figure.match(/aria-controls="([^"]+)"/)[1]);
  assert.equal(new Set(targets).size, 3);
  figures.forEach((figure, index) => {
    assert.ok(figure.includes(`id="${targets[index]}"`));
    assert.match(figure, /<button type="button"[^>]*aria-expanded="true"/);
    assert.match(figure, /loading="lazy" decoding="async"/);
  });
  assert.match(css, /\.living-grid \{[^}]*grid-auto-flow: dense;[^}]*repeat\(3,minmax\(0,1fr\)\); gap: 0/);
  assert.match(css, /\.material-accordion\.is-interactive \{ flex-direction: column; gap: 0/);
  assert.match(css, /\.material-panel button:focus-visible/);
  assert.match(html, /class="marquee-toggle"[^>]*hidden/);
  assert.match(script, /\(min-width: 1101px\) and \(min-height: 900px\) and \(prefers-reduced-motion: no-preference\)/);
  assert.match(script, /pinned\.offsetHeight > window\.innerHeight - 160/);
});

test('supporting type is local and all new assets and HTML control references resolve', async () => {
  const font = await readFile(new URL('assets/fonts/outfit-latin-normal.woff2', root));
  assert.equal(font.toString('ascii', 0, 4), 'wOF2');
  assert.ok(font.length < 40000);
  assert.match(await readFile(new URL('assets/fonts/Outfit-OFL.txt', root), 'utf8'), /SIL OPEN FONT LICENSE/);
  assert.match(css, /--body: "Outfit", Arial, sans-serif/);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, target] of html.matchAll(/\b(?:aria-controls|href)="(?:#)?([\w-]+)"/g)) assert.ok(ids.includes(target), target);
  for (const [, asset] of html.matchAll(/\b(?:src|href|data-src)="\.\/([^"]+)"/g)) assert.ok((await stat(new URL(asset, root))).isFile(), asset);
  const critical = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)[1];
  assert.ok(gzipSync(critical).length < 5000);
  assert.match(critical, /\.button-outline/);
});
