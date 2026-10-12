import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const root = new URL('../dist/', import.meta.url);
const source = await readFile(new URL('text-reveal.js', root), 'utf8');
const css = await readFile(new URL('styles.css', root), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');

// A small DOM model exercises text-node replacement, semantic markup and
// restoration. GSAP configuration is tested, not actual browser painting.
class Node {
  constructor(tag = '', data = '') {
    this.tag = tag; this.data = data; this.nodeType = tag === '#text' ? 3 : tag === '#fragment' ? 11 : 1;
    this.childNodes = []; this.parentElement = null; this.attributes = {};
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { if (this.nodeType === 3) this.data = value; else this.replaceChildren(new Node('#text', value)); }
  append(...children) {
    for (const child of children) {
      if (child.nodeType === 11) { this.append(...[...child.childNodes]); continue; }
      if (child.parentElement) child.parentElement.childNodes.splice(child.parentElement.childNodes.indexOf(child), 1);
      this.childNodes.push(child); child.parentElement = this;
    }
  }
  replaceChildren(...children) {
    this.childNodes.forEach(child => { child.parentElement = null; }); this.childNodes = []; this.append(...children);
  }
  replaceWith(fragment) {
    const parent = this.parentElement;
    const index = parent.childNodes.indexOf(this);
    const replacement = fragment.nodeType === 11 ? [...fragment.childNodes] : [fragment];
    parent.childNodes.splice(index, 1, ...replacement);
    replacement.forEach(child => { child.parentElement = parent; });
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) {
    const tags = selector.split(',').map(tag => tag.trim());
    const search = parent => {
      for (const node of parent.childNodes) {
        if (tags.includes(node.tag)) return node;
        const result = search(node); if (result) return result;
      }
      return null;
    };
    return search(this);
  }
}
const text = value => new Node('#text', value);
const accessibleText = node => node.getAttribute('aria-hidden') === 'true' ? '' : node.nodeType === 3 ? node.data : node.tag === 'br' ? '\n' : node.childNodes.map(accessibleText).join('');

function fixture() {
  const window = {}, calls = [];
  const document = { createElement: tag => new Node(tag), createTextNode: text, createDocumentFragment: () => new Node('#fragment') };
  runInNewContext(source, { window, document, getComputedStyle: node => ({ color: node.tag === 'i' ? 'rgb(121, 100, 73)' : 'rgb(34, 40, 36)' }) });
  const gsap = { fromTo(target, from, config) {
    const tween = { killed: false, triggerKilled: false,
      kill() { this.killed = true; }, scrollTrigger: { kill() { tween.triggerKilled = true; } },
      progress(p) {
        const duration = config.duration + (target.length - 1) * config.stagger;
        target.forEach((ink, index) => { ink.style.opacity = Math.max(0, Math.min(1, (p * duration - index * config.stagger) / config.duration)); });
      }
    };
    calls.push({ target, from, config, tween }); tween.progress(0); return tween;
  } };
  return { window, gsap, calls };
}

test('word highlight preserves whitespace, punctuation, line breaks and italic ink without double speech', () => {
  const p = fixture(), quote = new Node('blockquote'), italic = new Node('i'), br = new Node('br');
  const opening = text('“Great buildings make an impression.');
  const ending = text('”');
  italic.append(text('Exceptional ones make a difference.'));
  const italicNodes = [...italic.childNodes];
  quote.append(opening, br, italic, ending);
  const originalNodes = [...quote.childNodes], original = accessibleText(quote);
  const restore = p.window.NovaTextReveal({ element: quote, gsap: p.gsap });
  assert.equal(accessibleText(quote), original);
  assert.equal(quote.querySelector('br'), br);
  assert.equal(quote.querySelector('i'), italic);
  const inks = p.calls[0].target;
  assert.equal(inks.length, 11);
  assert.ok(inks.every(ink => ink.getAttribute('aria-hidden') === 'true'));
  assert.ok(inks.slice(5, 10).every(ink => ink.parentElement.style['--word-ink'] === 'rgb(121, 100, 73)'));
  const count = p.calls.length;
  p.window.NovaTextReveal({ element: quote, gsap: p.gsap });
  assert.equal(p.calls.length, count, 'Do not wrap the same content twice');
  restore();
  assert.deepEqual(quote.childNodes, originalNodes);
  assert.deepEqual(italic.childNodes, italicNodes);
  assert.equal(accessibleText(quote), original);
  assert.equal(p.calls[0].tween.killed, true);
  assert.equal(p.calls[0].tween.triggerKilled, true);
  assert.equal(quote.classList.contains('word-reveal-active'), false);
});

test('highlight has a reversible sequential opacity timeline and never moves glyphs or hides base text', () => {
  const p = fixture(), paragraph = new Node('p');
  paragraph.append(text('A place  should feel right.\nThe light. The proportions.'));
  const original = accessibleText(paragraph);
  p.window.NovaTextReveal({ element: paragraph, gsap: p.gsap });
  const { from, config, tween, target } = p.calls[0];
  assert.equal(from.opacity, 0); assert.equal(config.opacity, 1);
  assert.equal(config.scrollTrigger.scrub, .2);
  assert.equal(config.duration, .18);
  assert.equal(config.stagger, config.duration, 'Only one word changes at a time');
  assert.equal(config.scrollTrigger.start, 'top 78%');
  assert.equal(config.scrollTrigger.end, 'bottom 35%');
  assert.equal(config.scrollTrigger.once, undefined, 'Reversing scroll reverses the highlight');
  assert.equal(config.scrollTrigger.invalidateOnRefresh, true);
  assert.equal(config.y, undefined); assert.equal(config.color, undefined);
  tween.progress(.5);
  assert.equal(target[0].style.opacity, 1);
  assert.equal(target.at(-1).style.opacity, 0);
  tween.progress(1); assert.ok(target.every(ink => Math.abs(ink.style.opacity - 1) < 1e-9));
  tween.progress(0); assert.ok(target.every(ink => ink.style.opacity === 0));
  assert.equal(accessibleText(paragraph), original, 'A fully readable base remains when the ink layer is dim');
});

test('interactive text is not split or replaced', () => {
  const p = fixture(), heading = new Node('h2'), link = new Node('a');
  link.append(text('Explore the collection')); heading.append(link);
  p.window.NovaTextReveal({ element: heading, gsap: p.gsap });
  assert.equal(p.calls.length, 0); assert.equal(heading.childNodes[0], link);
});

test('selective motion stays below the hero, supports reduced motion and uses accessible palette tones', () => {
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf('<section class="projects'));
  assert.doesNotMatch(hero, /data-word-reveal|data-ui-reveal/);
  assert.equal((html.match(/data-word-reveal/g) || []).length, 4);
  assert.equal((html.match(/data-ui-reveal/g) || []).length, 4);
  assert.ok(html.indexOf('defer src="./text-reveal.js"') < html.indexOf('defer src="./script.js"'));
  assert.match(css, /\.reveal-word-ink \{[^}]*pointer-events: none; user-select: none/);
  assert.match(css, /\.reveal-word \{[^}]*white-space: nowrap/);
  assert.match(css, /\.reveal-word-ink \{ opacity: 1 !important; \}/);
  assert.match(css, /\[data-ui-reveal\] \{ opacity: 1 !important; transform: none !important; \}/);
  const luminance = hex => {
    const channels = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  for (const [foreground, background] of [['7d8177', 'f5f2eb'], ['7d8177', 'e8e2d7'], ['7e877a', '222824'], ['7e877a', '2a302c']]) {
    const a = luminance(foreground), b = luminance(background);
    const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(contrast >= 3, `Large reveal text must remain readable: ${foreground}/${background} = ${contrast}`);
  }
});
