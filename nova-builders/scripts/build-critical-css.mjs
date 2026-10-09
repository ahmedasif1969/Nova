import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const globals = new Set([':root', '*', '*::before', '*::after', 'html', 'body', 'body.menu-open', 'body.dialog-open', 'main', 'section[id]', 'a', 'button', 'input', 'textarea', 'select', 'img', 'video', 'button[hidden]', '[hidden]', '::selection', ':focus-visible']);
const firstScreenClass = /\.(?:site-header|brand|header-cta|menu-toggle|mobile-menu|skip-link|grain|progress|hero(?:-[\w-]+)?|eyebrow|status-dot|button(?:-primary)?|text-link|timeline-track|section-kicker)(?![\w-])/;

// Small, strict parser for this repository's rule/@media/@font-face stylesheet.
// Quotes and escaped characters are respected (including the SVG data URL).
// Unsupported block at-rules fail the build instead of silently losing styles.
export function parseRules(css) {
  const nodes = [];
  let position = 0;
  while (position < css.length) {
    if (/\s/.test(css[position])) { position++; continue; }
    if (css.startsWith('/*', position)) {
      const end = css.indexOf('*/', position + 2);
      if (end < 0) throw new Error('Unclosed CSS comment');
      position = end + 2; continue;
    }
    const start = position;
    let quote = '';
    while (position < css.length) {
      const character = css[position];
      if (character === '\\') { position += 2; continue; }
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '{') break;
      else if (character === ';') throw new Error('Statement at-rules are not supported');
      position++;
    }
    if (position >= css.length) throw new Error('Missing CSS rule block');
    const header = css.slice(start, position).trim();
    const bodyStart = ++position;
    let depth = 1;
    quote = '';
    while (position < css.length && depth) {
      const character = css[position];
      if (character === '\\') { position += 2; continue; }
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (css.startsWith('/*', position)) {
        const end = css.indexOf('*/', position + 2);
        if (end < 0) throw new Error('Unclosed CSS comment');
        position = end + 2; continue;
      } else if (character === '{') depth++;
      else if (character === '}') depth--;
      position++;
    }
    if (depth) throw new Error(`Unclosed CSS block: ${header}`);
    const body = css.slice(bodyStart, position - 1).trim();
    if (header.startsWith('@media')) nodes.push({ header, children: parseRules(body) });
    else {
      if (header.startsWith('@') && !header.startsWith('@font-face')) throw new Error(`Unsupported CSS block: ${header}`);
      nodes.push({ header, body });
    }
  }
  return nodes;
}

export function splitRules(nodes) {
  const critical = [];
  const deferred = [];
  for (const node of nodes) {
    if (node.children) {
      const split = splitRules(node.children);
      if (split.critical.length) critical.push({ header: node.header, children: split.critical });
      if (split.deferred.length) deferred.push({ header: node.header, children: split.deferred });
    } else {
      const needed = node.header.startsWith('@font-face') || node.header.split(',').some(selector => globals.has(selector.trim()) || firstScreenClass.test(selector));
      (needed ? critical : deferred).push(node);
    }
  }
  return { critical, deferred };
}

export function renderRules(nodes) {
  return nodes.map(node => `${node.header} { ${node.children ? renderRules(node.children) : node.body} }`).join('\n');
}

export async function buildCriticalCss({ check = false } = {}) {
  const css = await readFile(resolve(root, 'styles.css'), 'utf8');
  const { critical, deferred } = splitRules(parseRules(css));
  const criticalCss = renderRules(critical);
  const deferredCss = `/* Generated from styles.css. Run npm run build:css; do not edit. */\n${renderRules(deferred)}\n`;
  if (criticalCss.includes('</style')) throw new Error('Unsafe inline CSS');
  const htmlPath = resolve(root, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const marker = /<style id="critical-css">[\s\S]*?<\/style>/;
  if (!marker.test(html)) throw new Error('Missing critical-css block in index.html');
  const builtHtml = html.replace(marker, () => `<style id="critical-css">\n${criticalCss}\n  </style>`);
  if (check) {
    if (builtHtml !== html || await readFile(resolve(root, 'deferred.css'), 'utf8') !== deferredCss) throw new Error('CSS output is stale: run npm run build:css');
  } else {
    await writeFile(htmlPath, builtHtml);
    await writeFile(resolve(root, 'deferred.css'), deferredCss);
  }
  console.log(`CSS ${check ? 'verified' : 'built'}: critical ${gzipSync(criticalCss).length} bytes gzip; deferred ${gzipSync(deferredCss).length} bytes gzip`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCriticalCss({ check: process.argv.includes('--check') });
}
