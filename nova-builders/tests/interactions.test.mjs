import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');

// Exercise the page's event handlers without a browser or animation CDNs.
function pageFixture({ reducedMotion = false, initialScroll = 0, deferStyles = false, frameCallbacks = true } = {}) {
  const nodes = new Map();
  const frames = new Map();
  const videoFrames = new Map();
  const timers = new Map();
  const groups = new Map();
  const observers = [];
  let frameId = 0;
  let timerId = 0;
  let clock = 0;
  let document;
  class Element {
    constructor() {
      this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = {}; this.children = [];
      this.hidden = false; this.open = false; this.value = ''; this.textContent = '';
      const classes = new Set();
      this.classList = { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on = !classes.has(c)) => { on ? classes.add(c) : classes.delete(c); return on; } };
    }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    async emit(type, details = {}) { for (const fn of this.listeners[type] || []) await fn({ target: this, preventDefault() {}, ...details }); }
    querySelector(selector) { return nodes.get(selector) ?? groups.get(selector)?.[0] ?? null; }
    querySelectorAll(selector) { return groups.get(selector) ?? []; }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    showModal() { this.open = true; }
    close() { this.open = false; queueMicrotask(() => this.emit('close')); }
    scrollIntoView() { this.scrolledTo = true; }
    getBoundingClientRect() { return { top: 100, left: 100, right: 800, bottom: 900 }; }
  }
  const selectors = ['.hero-video', '[data-header]', '.progress span', '[data-menu-toggle]', '[data-mobile-menu]', '[data-consultation-form]', '[data-project-dialog]', '[data-hero]', '.hero-poster', '.hero-copy', '[data-build-progress]', '[data-build-phase]', '[data-project-count]', '.project-list', '[data-dialog-title]', '[data-dialog-location]', '[data-dialog-description]', '[data-dialog-status]', '[data-dialog-image]', '[data-dialog-specs]', '[data-dialog-features]', '[data-dialog-close]', '[data-dialog-enquire]', '[data-enquiry-result]', '#enquiry-draft', '[data-form-note]', '[data-copy-enquiry]', '#building-model', '.model-stage', '[data-model-hint]', '#top', '#legacy', '#projects', '#approach', '#model-study', '#consultation'];
  selectors.forEach(selector => nodes.set(selector, new Element()));
  document = new Element();
  document.body = new Element();
  document.head = new Element();
  document.documentElement = { scrollHeight: 10000 };
  document.getElementById = id => nodes.get(`#${id}`);
  document.createElement = () => new Element();
  if (deferStyles) {
    const stylesheet = new Element();
    stylesheet.media = 'print';
    nodes.set('[data-deferred-styles]', stylesheet);
  }
  const window = new Element();
  window.scrollY = initialScroll; window.innerHeight = 1000;
  window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion') && reducedMotion, addEventListener() {} });
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
    trigger(target, isIntersecting = true) { this.callback([{ target, isIntersecting }]); }
  }
  window.IntersectionObserver = Observer;
  const hero = nodes.get('[data-hero]'); hero.offsetTop = 0; hero.offsetHeight = 3000;
  const video = nodes.get('.hero-video');
  video.readyState = 0; video.duration = 10; video.seeking = false; video.pause = () => {};
  const videoSource = new Element(); videoSource.dataset.src = './assets/nova-construction-scrub.mp4';
  nodes.set('source[data-src]', videoSource);
  video.loads = 0; video.load = () => { video.loads++; };
  let currentTime = 0;
  video.seeks = [];
  Object.defineProperty(video, 'currentTime', { get: () => currentTime, set: time => { currentTime = time; video.seeking = true; video.seeks.push(time); } });
  if (frameCallbacks) {
    video.requestVideoFrameCallback = callback => { videoFrames.set(++frameId, callback); return frameId; };
    video.cancelVideoFrameCallback = id => videoFrames.delete(id);
  }
  const filters = ['all', 'residential', 'mixed'].map(value => { const node = new Element(); node.dataset.filter = value; return node; });
  const cards = ['residential', 'residential', 'mixed'].map(value => { const node = new Element(); node.dataset.category = value; return node; });
  const projects = ['aurelian', 'vela', 'meridian'].map(value => { const node = new Element(); node.dataset.project = value; return node; });
  const links = ['projects', 'approach', 'model-study', 'legacy'].map(id => { const node = new Element(); node.hash = `#${id}`; node.setAttribute('href', node.hash); return node; });
  groups.set('a', links); groups.set('nav a', links); groups.set('a[href^="#"]', links);
  groups.set('[data-filter]', filters); groups.set('.project-card', cards); groups.set('[data-project]', projects);
  groups.set('#top, #legacy, #projects, #approach, #model-study, #consultation', ['top', 'legacy', 'projects', 'approach', 'model-study', 'consultation'].map(id => nodes.get(`#${id}`)));
  const form = nodes.get('[data-consultation-form]');
  form.elements = { name: new Element(), project: new Element() };
  const formData = { name: 'Guest Example', email: 'visitor@example.test', interest: 'Purchasing a residence', message: 'I would like a consultation.' };
  let clipboard = '';
  runInNewContext(source, {
    window, document, history: { replaceState() {} },
    navigator: { clipboard: { writeText: async text => { clipboard = text; } } },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, at: clock + delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    IntersectionObserver: Observer,
    FormData: class { get(key) { return key === 'project' ? form.elements.project.value : formData[key]; } },
  });
  const advance = milliseconds => {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
  };
  const flush = (milliseconds = 1000 / 60) => { advance(milliseconds); const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(clock)); };
  const presentFrame = (mediaTime = Math.floor(currentTime * 24 + 1e-8) / 24) => {
    const pending = [...videoFrames.values()]; videoFrames.clear();
    pending.forEach(callback => callback(clock, { mediaTime }));
  };
  return { nodes, filters, cards, projects, window, document, video, videoSource, observers, frames, videoFrames, timers, flush, advance, presentFrame, clipboard: () => clipboard };
}

async function startScrub(p, scroll = 400) {
  p.video.readyState = 2;
  await p.video.emit('loadedmetadata'); await p.video.emit('loadeddata');
  p.window.scrollY = scroll; await p.window.emit('scroll'); p.flush(); p.flush();
}

async function settleScrub(p, cycles = 250) {
  for (let i = 0; i < cycles; i++) {
    if (p.video.seeking) { p.video.seeking = false; await p.video.emit('seeked'); }
    p.presentFrame(); p.flush();
  }
}

test('CDN failures preserve project filtering and the architectural fallback', async () => {
  const p = pageFixture();
  assert.equal(p.document.head.children.length, 0, 'Three.js must not download at startup');
  const observer = p.observers.find(observer => observer.options.rootMargin === '300px');
  observer.trigger(p.nodes.get('#model-study'));
  await p.document.head.children[0].emit('error');
  assert.equal(p.nodes.get('#building-model').hidden, true);
  assert.equal(p.nodes.get('[data-model-hint]').textContent, 'Architectural concept view');
  await p.filters[2].emit('click');
  assert.deepEqual(p.cards.map(card => card.hidden), [true, true, false]);
  assert.equal(p.nodes.get('[data-project-count]').textContent, '01 development');
  await p.filters[0].emit('click');
  assert.ok(p.cards.every(card => !card.hidden));
});

test('project enquiries retain their selection and produce a copyable local draft', async () => {
  const p = pageFixture();
  await p.projects[1].emit('click');
  assert.equal(p.nodes.get('[data-project-dialog]').open, true);
  assert.equal(p.nodes.get('[data-dialog-title]').textContent, 'Vela Residences');
  assert.equal(p.nodes.get('[data-dialog-image]').src, './assets/vela-detail-1536.webp');
  assert.match(p.nodes.get('[data-dialog-image]').srcset, /vela-detail-1536\.webp 1536w/);
  assert.equal(p.nodes.get('[data-dialog-features]').children.length, 3);
  await p.nodes.get('[data-dialog-enquire]').emit('click');
  const form = p.nodes.get('[data-consultation-form]');
  assert.equal(form.elements.project.value, 'Vela Residences');
  assert.equal(p.nodes.get('#consultation').scrolledTo, true);
  await form.emit('submit');
  assert.match(p.nodes.get('#enquiry-draft').value, /Project: Vela Residences/);
  assert.equal(p.nodes.get('[data-enquiry-result]').hidden, false);
  await p.nodes.get('[data-copy-enquiry]').emit('click');
  assert.match(p.clipboard(), /Guest Example/);
});

test('Escape restores the mobile menu’s focus and scrolling state', async () => {
  const p = pageFixture();
  await p.nodes.get('[data-menu-toggle]').emit('click');
  assert.equal(p.nodes.get('[data-mobile-menu]').inert, false);
  assert.equal(p.document.body.classList.contains('menu-open'), true);
  await p.document.emit('keydown', { key: 'Escape' });
  assert.equal(p.nodes.get('[data-mobile-menu]').inert, true);
  assert.equal(p.document.body.classList.contains('menu-open'), false);
  assert.equal(p.document.activeElement, p.nodes.get('[data-menu-toggle]'));
});

test('rapid scrolling catches up in bounded steps after both decoding and presentation', async () => {
  const p = pageFixture();
  await startScrub(p);
  assert.equal(p.video.seeks.length, 1);
  assert.ok(Math.floor(p.video.seeks[0] * 24) <= 3, 'Do not jump more than three source frames toward the destination');
  p.window.scrollY = 1000; await p.window.emit('scroll'); p.flush();
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.video.seeks.length, 1, 'Do not interrupt an in-flight decode');
  p.video.seeking = false; await p.video.emit('seeked');
  assert.equal(p.video.seeks.length, 1, 'Seeked alone must not chain a new seek');
  p.presentFrame(0);
  assert.equal(p.video.seeks.length, 1, 'A stale compositor frame must not release the pending seek');
  p.presentFrame(); p.flush();
  assert.equal(p.video.seeks.length, 2);
  assert.ok(p.video.seeks[1] - p.video.seeks[0] <= 3 / 24 + 1e-9);
  await settleScrub(p);
  assert.ok(p.video.currentTime > 8 && p.video.currentTime < 10, 'Eventually reach the latest destination, even after scrolling stops');
  for (let i = 1; i < p.video.seeks.length; i++) assert.ok(p.video.seeks[i] - p.video.seeks[i - 1] <= 3 / 24 + 1e-9);
  assert.equal(p.frames.size + p.videoFrames.size + p.timers.size, 0, 'Settled video must not keep polling');
  await p.video.emit('error'); p.flush();
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
});

test('seeks select the interior of a source frame instead of an ambiguous frame boundary', async () => {
  const p = pageFixture(); await startScrub(p, 1000);
  await settleScrub(p);
  assert.ok(p.video.seeks.length > 5);
  for (const time of p.video.seeks) {
    const fraction = time * 24 - Math.floor(time * 24);
    assert.ok(Math.abs(fraction - .5) < 1e-8, `Seek ${time} must land inside a frame, not on its edge`);
  }
});

test('once the intended frame is selected, idle events do not trigger a final corrective seek', async () => {
  for (const position of [400, 405.2, 999.95, 1000.05, 1800]) {
    const p = pageFixture(); await startScrub(p, position); await settleScrub(p);
    const expected = Math.round(Math.max(0, (position / 2000 - .035) / .965) * 9.95 * 24);
    const displayed = Math.floor(p.video.currentTime * 24 + 1e-8);
    assert.equal(displayed, expected);
    const count = p.video.seeks.length;
    for (let tick = 0; tick < 12; tick++) {
      await p.video.emit('canplay'); await p.video.emit('seeked');
      await p.window.emit('scroll'); p.flush(); p.flush();
    }
    assert.equal(p.video.seeks.length, count, 'No terminal correction after the video is already resting');
    assert.equal(p.frames.size + p.videoFrames.size, 0);
  }
});

test('reversing direction smoothly reaches the new destination without a stale forward jump', async () => {
  const p = pageFixture(); await startScrub(p, 1600);
  await settleScrub(p, 15);
  const before = p.video.currentTime;
  assert.ok(before > 1);
  p.window.scrollY = 100; await p.window.emit('scroll'); p.flush();
  if (p.video.seeking) { p.video.seeking = false; await p.video.emit('seeked'); }
  p.presentFrame(); p.flush();
  assert.ok(p.video.currentTime < before);
  await settleScrub(p);
  assert.ok(p.video.currentTime < .2);
  for (let i = 1; i < p.video.seeks.length; i++) assert.ok(Math.abs(p.video.seeks[i] - p.video.seeks[i - 1]) <= 3 / 24 + 1e-9);
});

test('returning to the top keeps the reverse video visible until its opening frame is decoded', async () => {
  for (const frameCallbacks of [true, false]) {
    const p = pageFixture({ frameCallbacks });
    await startScrub(p, 1800); await settleScrub(p);
    const poster = p.nodes.get('.hero-poster');
    assert.equal(poster.style.opacity, '0');
    const previousTime = p.video.currentTime;
    p.window.scrollY = 0; await p.window.emit('scroll'); p.flush();
    assert.equal(poster.style.opacity, '0', 'Scroll position alone must not cover the unwinding video');
    for (let tick = 0; tick < 20; tick++) {
      if (p.video.seeking) { p.video.seeking = false; await p.video.emit('seeked'); }
      p.presentFrame(); p.flush();
      assert.equal(poster.style.opacity, '0', 'Keep later construction frames visible during reverse catch-up');
    }
    assert.ok(p.video.currentTime < previousTime && p.video.currentTime > 0.5);
    await settleScrub(p);
    assert.equal(Math.floor(p.video.currentTime * 24), 0);
    assert.equal(poster.style.opacity, '1', 'Restore the twilight cover only after the opening frame is selected');
    assert.equal(p.frames.size + p.videoFrames.size, 0);
  }
});

test('returning from another section reverses without reloading or restoring the poster early', async () => {
  const p = pageFixture(); await startScrub(p, 1800); await settleScrub(p);
  p.window.scrollY = 5000; await p.window.emit('scroll'); p.flush();
  p.window.scrollY = 150; await p.window.emit('scroll'); p.flush(); p.flush();
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0');
  await settleScrub(p);
  assert.ok(p.video.currentTime < 0.5);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0', 'Even near the top, video stays visible until fully rewound');
  assert.equal(p.video.loads, 1);
});

test('reversing an in-flight opening seek does not restore the cover before decoding finishes', async () => {
  const p = pageFixture(); await startScrub(p, 100);
  const poster = p.nodes.get('.hero-poster');
  const fadedOpacity = Number(poster.style.opacity);
  assert.ok(fadedOpacity > 0 && fadedOpacity < 1, 'Preserve the original opening crossfade');
  assert.equal(p.video.seeking, true);
  p.window.scrollY = 0; await p.window.emit('scroll'); p.flush();
  assert.equal(Number(poster.style.opacity), fadedOpacity);
  await settleScrub(p);
  assert.equal(poster.style.opacity, '1');
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush(); p.flush();
  await settleScrub(p);
  assert.equal(poster.style.opacity, '0');
  assert.ok(p.video.currentTime > 8);
  assert.equal(p.video.loads, 1, 'Forward scrolling after rewinding must reuse the video');
});

test('frame presentation before seeked still waits for the decode to finish', async () => {
  const p = pageFixture(); await startScrub(p);
  p.presentFrame(); p.flush();
  assert.equal(p.video.seeks.length, 1);
  p.video.seeking = false; await p.video.emit('seeked'); p.flush();
  assert.equal(p.video.seeks.length, 2);
});

test('browsers without frame callbacks leave a paint opportunity between seeks', async () => {
  const p = pageFixture({ frameCallbacks: false }); await startScrub(p);
  p.video.seeking = false; await p.video.emit('seeked');
  assert.equal(p.video.seeks.length, 1);
  p.flush(); assert.equal(p.video.seeks.length, 1);
  p.flush(); assert.equal(p.video.seeks.length, 2);
});

test('missing frame callbacks do not impose a 120 ms pause after every decoded frame', async () => {
  const p = pageFixture(); await startScrub(p, 1000);
  p.video.seeking = false; await p.video.emit('seeked');
  p.flush();
  assert.equal(p.video.seeks.length, 1, 'Leave one browser paint opportunity');
  p.flush();
  assert.equal(p.video.seeks.length, 2, 'Resume within two display ticks, without waiting for a missing callback');
});

test('missing compositor callbacks no longer throttle the controller to single-digit updates', async () => {
  const p = pageFixture(); await startScrub(p, 1800);
  const start = p.video.seeks.length;
  // Idealized fast decode, 60 Hz display, and no compositor callbacks. This
  // measures OUR scheduler's ceiling, not real device decode/render speed.
  for (let tick = 0; tick < 60; tick++) {
    if (p.video.seeking) { p.video.seeking = false; await p.video.emit('seeked'); }
    p.flush();
  }
  const updates = p.video.seeks.length - start;
  assert.ok(updates >= 24, `Expected at least 24 opportunities in one simulated second, got ${updates}`);
  assert.equal(p.timers.size, 0);
});

test('a missing paused-video callback cannot deadlock or interrupt an active seek', async () => {
  const p = pageFixture(); await startScrub(p);
  p.advance(1000); p.flush();
  assert.equal(p.video.seeks.length, 1, 'Paint fallback must never run while decoding');
  p.video.seeking = false; await p.video.emit('seeked');
  p.flush(); p.flush();
  assert.equal(p.video.seeks.length, 2);
  assert.ok(p.video.seeks[1] - p.video.seeks[0] <= 3 / 24 + 1e-9, 'A long pause must not turn into a large catch-up jump');
  assert.equal(p.videoFrames.size, 1, 'Abandoned frame callback must be cancelled');
});

test('leaving the hero or hiding the tab cancels video work and resumes safely on return', async () => {
  const p = pageFixture(); await startScrub(p);
  const oldCallback = [...p.videoFrames.values()][0];
  p.window.scrollY = 5000; await p.window.emit('scroll'); p.flush();
  assert.equal(p.videoFrames.size + p.timers.size + p.frames.size, 0);
  p.video.seeking = false; await p.video.emit('seeked'); p.flush();
  assert.equal(p.video.seeks.length, 1);
  p.window.scrollY = 800; await p.window.emit('scroll'); p.flush(); p.flush();
  assert.equal(p.video.seeks.length, 2);
  oldCallback(0, { mediaTime: p.video.currentTime }); p.flush();
  assert.equal(p.video.seeks.length, 2, 'A late cancelled callback must not unlock a newer seek');
  p.document.hidden = true; await p.document.emit('visibilitychange');
  assert.equal(p.videoFrames.size + p.timers.size + p.frames.size, 0);
  p.video.seeking = false; await p.video.emit('seeked');
  p.document.hidden = false; await p.document.emit('visibilitychange'); p.flush(); p.flush();
  assert.equal(p.video.seeks.length, 3);
});

test('temporarily unavailable frames wait for canplay without busy polling', async () => {
  const p = pageFixture(); await startScrub(p);
  p.video.seeking = false; p.video.readyState = 1;
  await p.video.emit('seeked'); p.presentFrame(); p.flush();
  assert.equal(p.frames.size, 0);
  assert.equal(p.video.seeks.length, 1);
  p.video.readyState = 2; await p.video.emit('canplay'); p.flush();
  assert.equal(p.video.seeks.length, 2);
});

test('the video is requested once, only after scrolling inside the hero', async () => {
  const p = pageFixture();
  assert.equal(p.videoSource.src, undefined);
  assert.equal(p.video.loads, 0);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
  p.window.scrollY = 400; await p.window.emit('scroll'); p.flush();
  assert.equal(p.videoSource.src, './assets/nova-construction-scrub.mp4');
  assert.equal(p.video.preload, 'auto');
  assert.equal(p.video.loads, 1);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1', 'Keep cover until frames are decoded');
  p.window.scrollY = 800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.video.loads, 1, 'Scrolling must not repeatedly restart the download');
});

test('direct section jumps and reduced motion do not request the video', async () => {
  const jumped = pageFixture({ initialScroll: 5000 });
  assert.equal(jumped.video.loads, 0);
  jumped.window.scrollY = 800; await jumped.window.emit('scroll'); jumped.flush();
  assert.equal(jumped.video.loads, 1, 'Returning to the hero still enables scrubbing');
  const reduced = pageFixture({ reducedMotion: true });
  reduced.window.scrollY = 800; await reduced.window.emit('scroll'); reduced.flush();
  assert.equal(reduced.video.loads, 0);
  assert.equal(reduced.videoSource.src, undefined);
});

test('the model library loads once, near the studio, and failures retain a fallback', async () => {
  const p = pageFixture();
  const observer = p.observers.find(observer => observer.options.rootMargin === '300px');
  const section = p.nodes.get('#model-study');
  observer.trigger(section, false);
  assert.equal(p.document.head.children.length, 0);
  observer.trigger(section);
  assert.equal(observer.disconnected, true);
  const script = p.document.head.children[0];
  assert.match(script.src, /three@0\.149\.0/);
  assert.equal(script.async, true);
  assert.equal(p.nodes.get('[data-model-hint]').textContent, 'Loading architectural study…');
  observer.trigger(section);
  assert.equal(p.document.head.children.length, 1);
  // Even an apparent load that doesn't expose THREE must fail safely.
  await script.emit('load');
  assert.equal(p.nodes.get('#building-model').hidden, true);
  assert.equal(p.nodes.get('[data-model-hint]').textContent, 'Architectural concept view');
});

test('deferred CSS does not initialize scroll geometry or duplicate interactions before it is ready', async () => {
  const p = pageFixture({ deferStyles: true });
  const stylesheet = p.nodes.get('[data-deferred-styles]');
  assert.equal(p.observers.length, 0);
  assert.equal(p.nodes.get('[data-menu-toggle]').listeners.click, undefined);
  await stylesheet.emit('load');
  assert.equal(stylesheet.media, 'all');
  assert.equal(p.nodes.get('[data-menu-toggle]').listeners.click.length, 1);
  await stylesheet.emit('error');
  assert.equal(p.nodes.get('[data-menu-toggle]').listeners.click.length, 1);
  await p.filters[2].emit('click');
  assert.deepEqual(p.cards.map(card => card.hidden), [true, true, false]);
});

test('a stylesheet failure still enables the page interactions safely', async () => {
  const p = pageFixture({ deferStyles: true });
  await p.nodes.get('[data-deferred-styles]').emit('error');
  await p.nodes.get('[data-menu-toggle]').emit('click');
  assert.equal(p.nodes.get('[data-mobile-menu]').inert, false);
  assert.equal(p.video.loads, 0);
});
