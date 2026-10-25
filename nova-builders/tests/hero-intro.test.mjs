import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/hero-intro.js', import.meta.url), 'utf8');
function fixture({ reduced = false, saveData = false, hash = '', unsupported = false } = {}) {
  const events = {}, timers = new Map(), classes = new Set();
  let id = 0, preloads = 0, focused = false;
  const state = { openingDownloaded: 0, openingDecoded: 0, displayed: -1 };
  const meter = { value: 0 }, percent = { textContent: '0%' };
  const skip = { addEventListener: (name, fn) => { events[`skip:${name}`] = fn; } };
  const dialog = {
    open: false, showModal() { this.open = true; }, close() { this.open = false; },
    addEventListener: (name, fn) => { events[name] = fn; },
    querySelector: selector => selector.includes('progress') ? meter : selector.includes('percent') ? percent : skip
  };
  const sequence = { preload() { preloads++; }, stats: () => state };
  const library = () => { throw new Error('Must reuse the existing controller without replacing its callbacks'); };
  library.peek = () => unsupported ? null : sequence;
  if (unsupported) library.peek = () => ({ preload() { throw new Error('Unavailable'); } });
  const body = {};
  const document = {
    body, activeElement: body, hidden: false,
    documentElement: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    querySelector: selector => selector === '[data-hero-loader]' ? dialog : selector === '.hero-canvas' ? {} :
      selector === '.hero-actions a' ? { focus() { focused = true; } } : null
  };
  runInNewContext(source, {
    document, navigator: { connection: { saveData } },
    window: { NovaHeroSequence: library, scrollY: 0, innerHeight: 800, location: { hash }, matchMedia: () => ({ matches: reduced }) },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: key => timers.delete(key)
  });
  const fire = delay => {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `Timer ${delay} exists`);
    timers.delete(entry[0]); entry[1].fn();
  };
  return { state, meter, percent, dialog, events, timers, classes, fire,
    preloads: () => preloads, focused: () => focused };
}

test('loader reports real opening-buffer progress and waits for decoded frames and a paint', () => {
  const p = fixture();
  assert.equal(p.dialog.open, true);
  assert.equal(p.preloads(), 1);
  p.state.openingDownloaded = 24; p.state.openingDecoded = 4;
  p.fire(100);
  assert.equal(p.percent.textContent, '50%');
  p.state.openingDownloaded = 48;
  p.fire(100);
  assert.equal(p.dialog.open, true, 'Downloads alone are insufficient');
  p.state.openingDecoded = 8; p.state.displayed = 0;
  p.fire(100);
  assert.equal(p.meter.value, 56);
  p.fire(150);
  assert.equal(p.dialog.open, false);
  assert.equal(p.classes.size, 0);
  assert.equal(p.focused(), true);
  assert.equal(p.timers.size, 0);
});

test('Skip intro and Escape reveal immediately without destroying the background loader', () => {
  for (const action of ['skip:click', 'cancel']) {
    const p = fixture();
    p.events[action]({ preventDefault() {} });
    assert.equal(p.dialog.open, false);
    assert.equal(p.classes.size, 0);
    assert.equal(p.timers.size, 0);
    assert.equal(p.meter.value, 0, 'Skip must not fabricate 100%');
  }
});

test('failed frames, unavailable renderer and stalled requests cannot trap the visitor', () => {
  for (const key of ['openingFailed', 'destroyed']) {
    const p = fixture(); p.state[key] = true; p.fire(100);
    assert.equal(p.dialog.open, false);
  }
  assert.equal(fixture({ unsupported: true }).dialog.open, false);
  const stalled = fixture(); stalled.fire(20000);
  assert.equal(stalled.dialog.open, false);
  assert.equal(stalled.percent.textContent, '0%');
});

test('reduced motion, data saver and direct section links bypass the gate', () => {
  for (const options of [{ reduced: true }, { saveData: true }, { hash: '#projects' }]) {
    const p = fixture(options);
    assert.equal(p.dialog.open, false);
    assert.equal(p.preloads(), 0);
    assert.equal(p.timers.size, 0);
  }
});
