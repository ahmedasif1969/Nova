import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/section-reveal.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');

function element(ui = false) {
  const classes = new Set(), listeners = new Map();
  return {
    dataset: {}, children: [], classes, listeners,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    matches: selector => selector === '[data-ui-reveal]' && ui,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event, callback) => { if (listeners.get(event) === callback) listeners.delete(event); }
  };
}

function fixture({ mobile = false, top = 5000, single = false } = {}) {
  const root = element(), calls = [], clears = [];
  root.children = [element(), element(true), element()];
  root.dataset.sectionReveal = single ? 'single' : '';
  root.getBoundingClientRect = () => ({ top });
  const window = { innerHeight: 1000, matchMedia: query => ({ matches: query === '(max-width: 900px)' && mobile }) };
  const gsap = {
    fromTo(targets, from, config) {
      const tween = { completions: 0, kills: 0, triggerKills: 0,
        progress(value) { assert.equal(value, 1); this.completions++; },
        kill() { this.kills++; }, scrollTrigger: { kill() { tween.triggerKills++; } }
      };
      calls.push({ targets, from, config, tween }); return tween;
    },
    set(targets, config) { clears.push({ targets, config }); }
  };
  runInNewContext(source, { window });
  const controller = window.NovaSectionReveal({ root, gsap });
  return { root, calls, clears, controller };
}

test('section entry staggers children with a stronger fade-up, without fighting UI scrubs', () => {
  const p = fixture(), { targets, from, config } = p.calls[0];
  assert.equal(targets.length, 2);
  assert.equal(targets[0], p.root.children[0]); assert.equal(targets[1], p.root.children[2]);
  assert.equal(from.y, 44); assert.equal(from.opacity, 0);
  assert.equal(config.y, 0); assert.equal(config.opacity, 1);
  assert.equal(config.duration, .95); assert.equal(config.stagger, .12);
  assert.equal(config.clearProps, 'transform,opacity');
  assert.equal(config.scrollTrigger.start, 'top 88%');
  assert.equal(config.scrollTrigger.once, true);
  assert.equal(config.scrollTrigger.trigger, p.root);
  assert.equal(config.scrollTrigger.pin, undefined);
  assert.ok(targets.every(target => target.classes.has('section-reveal-item')));
  assert.equal(p.root.children[1].classes.size, 0);
});

test('mobile entry uses smaller movement and single mode preserves panel internals', () => {
  const p = fixture({ mobile: true, single: true });
  assert.equal(p.calls[0].from.y, 28);
  assert.equal(p.calls[0].targets.length, 1);
  assert.equal(p.calls[0].targets[0], p.root);
  assert.ok(p.root.children.every(child => child.classes.size === 0));
});

test('visible and previously passed content is not hidden on refresh or direct anchors', () => {
  for (const top of [-3000, 0, 879, 880]) {
    const p = fixture({ top });
    assert.equal(p.controller, null); assert.equal(p.calls.length, 0);
    assert.equal(p.root.listeners.size, 0);
  }
  assert.equal(fixture({ top: 881 }).calls.length, 1);
});

test('keyboard focus and filter completion finish the entrance and cleanup is idempotent', () => {
  const p = fixture(), tween = p.calls[0].tween;
  p.root.listeners.get('focusin')();
  p.controller.complete(); p.controller.restore(); p.controller.restore();
  assert.equal(tween.completions, 1); assert.equal(tween.kills, 1); assert.equal(tween.triggerKills, 1);
  assert.equal(p.clears.length, 1); assert.equal(p.clears[0].config.clearProps, 'transform,opacity');
  assert.equal(p.root.listeners.size, 0);
  assert.ok(p.root.children.every(child => child.classes.size === 0));
});

test('all main chapters have reveal groups, with hero and model canvas left untouched', () => {
  assert.equal((html.match(/data-section-reveal/g) || []).length, 18);
  for (const id of ['projects', 'legacy', 'living', 'approach', 'model-study', 'consultation']) {
    const start = html.indexOf(`id="${id}"`);
    assert.ok(start > -1);
    assert.match(html.slice(start, html.indexOf('</section>', start)), /data-section-reveal/);
  }
  assert.doesNotMatch(html.slice(html.indexOf('<section class="hero"'), html.indexOf('<section class="projects')), /data-section-reveal/);
  assert.doesNotMatch(html, /<(?:canvas|div class="model-stage")[^>]*data-section-reveal/);
  assert.ok(html.indexOf('defer src="./section-reveal.js"') < html.indexOf('defer src="./script.js"'));
  assert.match(css, /\.section-reveal-item \{ opacity: 1 !important; transform: none !important; \}/);
});
