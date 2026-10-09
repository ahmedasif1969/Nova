import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRules, splitRules, renderRules } from '../scripts/build-critical-css.mjs';

const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const source = parseRules(css);
const { critical, deferred } = splitRules(source);
const inline = html.match(/<style id="critical-css">\s*([\s\S]*?)\s*<\/style>/)[1];

function flatten(nodes, context = '') {
  return nodes.flatMap(node => node.children ? flatten(node.children, `${context}/${node.header}`) : [`${context}/${node.header}/${node.body.replace(/\s+/g, ' ')}`]);
}

test('critical and deferred CSS preserve every source rule and media condition', () => {
  assert.deepEqual(flatten([...critical, ...deferred]).sort(), flatten(source).sort());
  assert.equal(inline, renderRules(critical));
  assert.match(inline, /\.hero-sticky/);
  assert.match(inline, /\.mobile-menu\.open/);
  assert.match(inline, /@media \(max-width: 640px\)/);
  assert.match(inline, /@media \(max-height: 520px\)/);
  assert.match(inline, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(inline, /\.project-image \{/);
  assert.doesNotMatch(inline, /\.model-stage \{/);
  assert.match(renderRules(deferred), /\.project-image \{/);
});

function mediaMatches(header, width, height, reducedMotion) {
  if (header.includes('prefers-reduced-motion')) return reducedMotion;
  return [...header.matchAll(/\((min|max)-(width|height): (\d+)px\)/g)].every(([, comparison, axis, value]) => comparison === 'min' ? (axis === 'width' ? width : height) >= Number(value) : (axis === 'width' ? width : height) <= Number(value));
}

function resolvedRules(nodes, width, height, reducedMotion, result = {}) {
  for (const node of nodes) {
    if (node.children) {
      if (mediaMatches(node.header, width, height, reducedMotion)) resolvedRules(node.children, width, height, reducedMotion, result);
    } else if (!node.header.startsWith('@')) {
      for (const selector of node.header.split(',').map(selector => selector.trim())) {
        const declarations = result[selector] ||= {};
        for (const declaration of node.body.split(';')) {
          const colon = declaration.indexOf(':');
          if (colon >= 0) declarations[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
        }
      }
    }
  }
  return result;
}

test('CSS splitting preserves final rule values across desktop, phone, short-screen and reduced-motion layouts', () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [820, 1180], [390, 844], [360, 640], [844, 390]]) {
    for (const reduced of [false, true]) {
      assert.deepEqual(resolvedRules([...critical, ...deferred], width, height, reduced), resolvedRules(source, width, height, reduced), `${width}×${height}, reduced motion: ${reduced}`);
    }
  }
});

test('heading fonts start from HTML and below-fold CSS does not block first paint', () => {
  const preloads = [...html.matchAll(/<link rel="preload" as="font"[^>]*>/g)].map(match => match[0]);
  assert.equal(preloads.length, 2);
  for (const preload of preloads) {
    assert.match(preload, /cormorant-garamond-latin-(normal|italic)\.woff2/);
    assert.match(preload, /type="font\/woff2" crossorigin/);
  }
  assert.match(inline, /font-display: swap/);
  assert.match(inline, /font-family: "Cormorant Fallback"/);
  assert.match(inline, /size-adjust: 94\.222%/);
  assert.match(inline, /size-adjust: 89\.401%/);
  const activeHtml = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const stylesheets = [...activeHtml.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(match => match[0]);
  assert.equal(stylesheets.length, 1);
  assert.match(stylesheets[0], /href="\.\/deferred\.css" media="print"/);
  assert.match(stylesheets[0], /onload="this\.media='all';this\.onload=null"/);
  assert.match(html, /<noscript><link rel="stylesheet" href="\.\/styles\.css" \/><\/noscript>/);
});

test('the explicitly excluded headline animation and ScrollTrigger refresh hooks remain unchanged', async () => {
  const script = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');
  assert.match(script, /gsap\.from\('\.hero h1 > span', \{ y: 36, opacity: 0, stagger: \.12, duration: 1\.15/);
  assert.match(script, /document\.fonts\.ready\.then\(\(\) => ScrollTrigger\.refresh\(\)\)/);
  assert.match(script, /window\.addEventListener\('load', \(\) => ScrollTrigger\.refresh\(\), \{ once: true \}\)/);
});
