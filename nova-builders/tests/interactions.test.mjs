import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');
const textRevealSource = await readFile(new URL('../dist/text-reveal.js', import.meta.url), 'utf8');
const sectionRevealSource = await readFile(new URL('../dist/section-reveal.js', import.meta.url), 'utf8');

// Exercise the page's event handlers without a browser or animation CDNs.
function pageFixture({ reducedMotion = false, initialScroll = 0, deferStyles = false, frameCallbacks = true, motionLibrary = false, sectionLibrary = false, sequenceLibrary = false, width = 1440, height = 1000, pinnedHeight = 650 } = {}) {
  const nodes = new Map();
  const frames = new Map();
  const videoFrames = new Map();
  const timers = new Map();
  const groups = new Map();
  const observers = [];
  const motionCalls = [];
  const mediaRegistrations = [];
  const pins = [];
  let frameId = 0;
  let timerId = 0;
  let clock = 0;
  let document;
  class Element {
    constructor() {
      this.dataset = {}; this.style = { setProperty(key, value) { this[key] = value; } }; this.attributes = {}; this.listeners = {}; this.children = [];
      this.nodeType = 1;
      Object.defineProperty(this, 'childNodes', { get: () => this.children });
      this.hidden = false; this.open = false; this.value = ''; this.textContent = '';
      const classes = new Set();
      this.classList = { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on = !classes.has(c)) => { on ? classes.add(c) : classes.delete(c); return on; } };
    }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(listener => listener !== fn); }
    async emit(type, details = {}) { for (const fn of this.listeners[type] || []) await fn({ target: this, preventDefault() {}, ...details }); }
    querySelector(selector) { return nodes.get(selector) ?? groups.get(selector)?.[0] ?? null; }
    querySelectorAll(selector) { return groups.get(selector) ?? []; }
      matches(selector) { return selector.includes('[data-ui-reveal]') && 'uiReveal' in this.dataset; }
    closest(selector) { return selector === '[data-section-reveal]' && 'sectionReveal' in this.dataset ? this : null; }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    append(...children) { this.children.push(...children); }
    contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
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
  document.createDocumentFragment = () => new Element();
  document.createTextNode = text => ({ textContent: text });
  document.fonts = { ready: Promise.resolve() };
  if (deferStyles) {
    const stylesheet = new Element();
    stylesheet.media = 'print';
    nodes.set('[data-deferred-styles]', stylesheet);
  }
  const window = new Element();
  window.scrollY = initialScroll; window.innerHeight = height; window.innerWidth = width;
  let sequenceCallbacks;
  const sequenceCalls = [];
  if (sequenceLibrary) {
    window.NovaHeroSequence = options => {
      sequenceCallbacks = options;
      return { setProgress(p, active) { sequenceCalls.push({ p, active }); }, preload() { sequenceCalls.push({ preload: true }); }, resize() {} };
    };
  }
  const matchesMedia = query => {
    if (query.includes('prefers-reduced-motion: no-preference') && reducedMotion) return false;
    if (query.includes('prefers-reduced-motion: reduce') && !reducedMotion) return false;
    return [...query.matchAll(/\((min|max)-(width|height): (\d+)px\)/g)].every(([, bound, axis, value]) => {
      const size = axis === 'width' ? width : height;
      return bound === 'min' ? size >= Number(value) : size <= Number(value);
    });
  };
  window.matchMedia = query => ({ matches: matchesMedia(query), addEventListener() {} });
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
    trigger(target, isIntersecting = true) { this.callback([{ target, isIntersecting }]); }
  }
  window.IntersectionObserver = Observer;
  const materialAccordion = new Element();
  const materials = [0, 1, 2].map(() => {
    const panel = new Element(); const button = new Element(); const detail = new Element();
    panel.append(button, detail);
    panel.querySelector = selector => selector === '[data-material-toggle]' ? button : detail;
    return { panel, button, detail };
  });
  materialAccordion.append(...materials.map(material => material.panel));
  materialAccordion.querySelectorAll = () => materials.map(material => material.panel);
  nodes.set('[data-material-accordion]', materialAccordion);
  const marquee = new Element(); const marqueeTrack = new Element(); const marqueeToggle = new Element();
  marquee.querySelector = () => marqueeTrack;
  nodes.set('[data-principles-marquee]', marquee); nodes.set('[data-marquee-toggle]', marqueeToggle);
  const paragraph = new Element(); paragraph.textContent = 'The light. The proportions. The quiet details.';
  const paragraphText = { nodeType: 3, textContent: paragraph.textContent, parentElement: paragraph,
    replaceWith(fragment) { paragraph.replaceChildren(...fragment.children); } };
  paragraph.children = [paragraphText];
  groups.set('[data-word-reveal]', [paragraph]);
  const uiReveal = new Element();
  groups.set('[data-ui-reveal]', [uiReveal]);
  const approach = new Element(); const pinned = new Element(); const steps = new Element();
  pinned.offsetHeight = pinnedHeight; steps.offsetHeight = 1100;
  nodes.set('.approach', approach); nodes.set('.approach-sticky', pinned); nodes.set('.approach-steps', steps);
  let gsap; let ScrollTrigger;
  if (motionLibrary) {
    const tween = (target, config) => {
      const instance = { paused: !!config.paused, completions: 0, killed: false, progress(p) { if (p === 1) this.completions++; }, kill() { this.killed = true; }, play() { this.paused = false; }, pause() { this.paused = true; } };
      motionCalls.push({ target, config, instance }); return instance;
    };
    gsap = { registerPlugin() {}, from(target, config) { return tween(target, config); }, fromTo(target, from, config) {
      const instance = { completions: 0, killed: false, progress(p) { if (p === 1) this.completions++; }, kill() { this.killed = true; }, scrollTrigger: { kill() {} } };
      motionCalls.push({ target, from, config, instance }); return instance;
    }, to: tween, set() {}, killTweensOf() {}, timeline() { return { to() { return this; } }; }, matchMedia() { return { add(query, callback) { const registration = { query, cleanup: matchesMedia(query) ? callback() : undefined }; mediaRegistrations.push(registration); } }; } };
    ScrollTrigger = { refresh() {}, update() {}, create(config) { pins.push(config); return { kill() {} }; } };
    window.gsap = gsap; window.ScrollTrigger = ScrollTrigger;
  }
  const hero = nodes.get('[data-hero]'); hero.offsetTop = 0; hero.offsetHeight = 3000;
  const video = nodes.get('.hero-video');
  video.readyState = 0; video.duration = 10; video.seeking = false; video.pause = () => {};
  const videoSource = new Element(); videoSource.dataset.src = './assets/nova-construction-v2-scrub.mp4';
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
  if (sectionLibrary) {
    cards.forEach(card => {
      card.dataset.sectionReveal = '';
      card.append(new Element(), new Element());
      card.getBoundingClientRect = () => ({ top: 5000 });
        card.children.forEach(child => {
          child.getBoundingClientRect = () => ({ top: 5000 });
          child.querySelector = () => null;
        });
    });
    groups.set('[data-section-reveal]', cards);
    groups.set('.reveal-section', cards);
    nodes.get('#projects').append(...cards);
  }
  groups.set('#top, #legacy, #projects, #approach, #model-study, #consultation', ['top', 'legacy', 'projects', 'approach', 'model-study', 'consultation'].map(id => nodes.get(`#${id}`)));
  const form = nodes.get('[data-consultation-form]');
  form.elements = { name: new Element(), project: new Element() };
  const formData = { name: 'Guest Example', email: 'visitor@example.test', interest: 'Purchasing a residence', message: 'I would like a consultation.' };
  let clipboard = '';
  runInNewContext(textRevealSource, { window, document, getComputedStyle: () => ({ color: '#222824' }) });
  if (sectionLibrary) runInNewContext(sectionRevealSource, { window });
  runInNewContext(source, {
    window, document, gsap, ScrollTrigger, history: { replaceState() {} },
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
  return { nodes, filters, cards, projects, materials, materialAccordion, marquee, marqueeTrack, marqueeToggle, paragraph, motionCalls, mediaRegistrations, pins, window, document, video, videoSource, observers, frames, videoFrames, timers, flush, advance, presentFrame, sequenceCallbacks, sequenceCalls, clipboard: () => clipboard };
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

test('canvas is primary, copy follows painted frames and the poster cannot cover reverse catch-up', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  assert.equal(p.sequenceCalls.at(-1).active, false);
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.sequenceCalls.at(-1).active, true);
  assert.equal(p.video.loads, 0, 'Do not download the MP4 alongside image frames');
  assert.equal(p.video.seeks.length, 0);
  assert.equal(p.nodes.get('.hero-copy').style.opacity, '1', 'Keep copy at the opening until the first frame is painted');
  p.sequenceCallbacks.onDraw(.8, 234);
  assert.equal(p.nodes.get('.hero-copy').style.opacity, '0');
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0');
  p.window.scrollY = 0; await p.window.emit('scroll'); p.flush();
  assert.equal(p.sequenceCalls.at(-1).active, true, 'Continue reverse drawing even after the scroll stops at the top');
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0');
  p.sequenceCallbacks.onDraw(.01, 3);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0', 'Wait for actual frame zero');
  p.sequenceCallbacks.onDraw(0, 0);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0', 'Canvas frame zero replaces the poster');
  assert.equal(p.nodes.get('.hero-copy').style.opacity, '1');
  p.window.scrollY = 5000; await p.window.emit('scroll'); p.flush();
  assert.equal(p.sequenceCalls.at(-1).active, false);
});

test('opening buffer starts after the cover loads without waiting for page load', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  assert.ok(!p.sequenceCalls.some(call => call.preload));
  await p.nodes.get('.hero-poster').emit('load'); p.flush();
  assert.equal(p.sequenceCalls.filter(call => call.preload).length, 1);
  p.sequenceCallbacks.onDraw(0, 0);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0', 'Warm-up uncovers frame zero before scrolling');
  assert.equal(p.video.loads, 0);
  assert.equal(p.video.seeks.length, 0);
  for (const options of [{ initialScroll: 5000 }, { reducedMotion: true }, { initialScroll: 400 }]) {
    const quiet = pageFixture({ ...options, sequenceLibrary: true });
    await quiet.nodes.get('.hero-poster').emit('load'); quiet.flush();
    assert.ok(!quiet.sequenceCalls.some(call => call.preload));
  }
});

test('cold first frame uncovers construction without waiting for 26 painted frames', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  p.window.scrollY = 800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.nodes.get('[data-build-phase]').textContent, 'Loading construction…');
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
  p.sequenceCallbacks.onDraw(1 / 191, 1);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0');
  assert.equal(p.nodes.get('[data-build-phase]').textContent, 'The vision');
});

test('canvas failure enables the preserved MP4, and direct jumps/reduced motion remain lazy', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  p.window.scrollY = 400; await p.window.emit('scroll'); p.flush();
  p.sequenceCallbacks.onError(new Error('Frame failed')); p.flush();
  assert.equal(p.video.loads, 1);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
  await startScrub(p); await settleScrub(p);
  assert.ok(p.video.seeks.length > 0);
  for (const options of [{ initialScroll: 5000 }, { reducedMotion: true }]) {
    const quiet = pageFixture({ ...options, sequenceLibrary: true });
    assert.ok(quiet.sequenceCalls.every(call => !call.active));
    assert.equal(quiet.video.loads, 0);
  }
});

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
  assert.equal(p.videoSource.src, './assets/nova-construction-v2-scrub.mp4');
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

test('material chapters support click, touch and wrapping keyboard navigation without GSAP', async () => {
  const p = pageFixture();
  const expanded = () => p.materials.map(({ button }) => button.getAttribute('aria-expanded'));
  assert.deepEqual(expanded(), ['true', 'false', 'false']);
  assert.equal(p.materialAccordion.classList.contains('has-interacted'), false, 'Initial collapse must not animate after scroll measurements');
  await p.materials[2].button.emit('click');
  assert.equal(p.materialAccordion.classList.contains('has-interacted'), true, 'User selections still animate');
  assert.deepEqual(expanded(), ['false', 'false', 'true']);
  assert.deepEqual(p.materials.map(({ detail }) => detail.hidden), [true, true, false]);
  await p.materials[2].button.emit('keydown', { key: 'ArrowRight' });
  assert.deepEqual(expanded(), ['true', 'false', 'false']);
  assert.equal(p.document.activeElement, p.materials[0].button);
  await p.materials[1].panel.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(expanded()[0], 'true', 'Hover cannot collapse a keyboard-focused chapter');
  await p.materials[0].button.emit('keydown', { key: 'End' });
  assert.equal(expanded()[2], 'true');
  await p.materials[0].panel.emit('pointerenter', { pointerType: 'touch' });
  assert.equal(expanded()[2], 'true', 'Touch uses explicit selection, not incidental hover');
  await p.materials[2].button.emit('keydown', { key: 'Home' });
  assert.equal(expanded()[0], 'true');
  assert.equal(p.marqueeToggle.hidden, true, 'No pause control for a static CDN fallback');
});

test('section reveals mount once, project filters finish pending entrances, and media cleanup restores content', async () => {
  const p = pageFixture({ motionLibrary: true, sectionLibrary: true });
  const entries = p.motionCalls.filter(call => typeof call.config.onComplete === 'function');
  assert.equal(entries.length, 6);
  assert.ok(entries.every(call => call.config.paused && !call.config.scrollTrigger));
  assert.ok(entries.every(call => call.target.length === 1));
  assert.ok(!p.motionCalls.some(call => call.config.y === 16), 'Do not run old and new entry tweens together');
  await p.filters[2].emit('click');
  assert.deepEqual(p.cards.map(card => card.hidden), [true, true, false]);
  assert.ok(entries.every(call => call.instance.completions === 1 && call.instance.killed));
  await p.filters[0].emit('click');
  assert.ok(p.cards.every(card => !card.hidden));
  assert.ok(entries.every(call => call.instance.completions === 1));
  p.mediaRegistrations.find(entry => entry.query === '(prefers-reduced-motion: no-preference)').cleanup();
  assert.ok(p.cards.every(card => card.listeners.focusin.length === 0));
  assert.ok(p.cards.every(card => card.children.every(child => !child.classList.contains('section-reveal-item'))));
  assert.equal(p.video.loads, 0, 'New chapter motion must not trigger hero downloads');
});

test('anchor navigation does not finish offscreen content farther down the destination', async () => {
  const p = pageFixture({ motionLibrary: true, sectionLibrary: true });
  const entries = p.motionCalls.filter(call => typeof call.config.onComplete === 'function');
  const target = p.nodes.get('#projects');
  let checked = false;
  target.scrollIntoView = () => {
    assert.ok(entries.every(call => call.instance.completions === 0));
    checked = true;
  };
  await p.document.querySelectorAll('a[href^="#"]')[0].emit('click');
  assert.equal(checked, true);
});

test('section reveals do not hide content with reduced motion or a missing animation CDN', () => {
  for (const options of [{ motionLibrary: true, reducedMotion: true }, { motionLibrary: false }]) {
    const p = pageFixture({ ...options, sectionLibrary: true });
    assert.ok(!p.motionCalls.some(call => call.from?.opacity === 0));
    assert.ok(p.cards.every(card => card.children.every(child => !child.classList.contains('section-reveal-item'))));
    assert.ok(p.cards.every(card => !card.hidden));
  }
});

test('editorial motion scrubs words and pauses the marquee offscreen, hidden or by choice', async () => {
  const p = pageFixture({ motionLibrary: true });
  const reveal = p.motionCalls.find(call => call.config.scrollTrigger?.scrub === .2);
  assert.equal(reveal.config.opacity, 1);
  assert.equal(reveal.config.scrollTrigger.scrub, .2);
  assert.ok(reveal.target.every(word => word.getAttribute('aria-hidden') === 'true'));
  assert.ok(!p.motionCalls.some(call => call.from?.y === 14), 'Supporting UI must not translate back and forth during scrolling');
  assert.equal(p.paragraph.children.filter(child => child.textContent !== ' ').length, 7);
  const marquee = p.motionCalls.find(call => call.target === p.marqueeTrack);
  assert.equal(marquee.config.xPercent, -50);
  assert.equal(marquee.instance.paused, true);
  const observer = p.observers.find(observer => observer.options.rootMargin === '100px');
  observer.trigger(p.marquee); assert.equal(marquee.instance.paused, false);
  await p.marqueeToggle.emit('click'); assert.equal(marquee.instance.paused, true);
  assert.equal(p.marqueeToggle.getAttribute('aria-pressed'), 'true');
  observer.trigger(p.marquee, false); observer.trigger(p.marquee);
  assert.equal(marquee.instance.paused, true, 'Returning onscreen must respect the user pause');
  await p.marqueeToggle.emit('click'); assert.equal(marquee.instance.paused, false);
  p.document.hidden = true; await p.document.emit('visibilitychange');
  assert.equal(marquee.instance.paused, true);
  const registration = p.mediaRegistrations.find(entry => entry.query === '(prefers-reduced-motion: no-preference)');
  registration.cleanup();
  assert.equal(observer.disconnected, true);
  assert.equal(p.marqueeToggle.hidden, true);
  assert.equal(p.marqueeToggle.listeners.click.length, 0);
  assert.equal(p.paragraph.textContent, 'The light. The proportions. The quiet details.');
});

test('chapter pinning is limited to fitting, tall desktop layouts and reduced motion stays static', () => {
  const desktop = pageFixture({ motionLibrary: true });
  assert.equal(desktop.pins.length, 1);
  assert.equal(desktop.pins[0].pinSpacing, false);
  assert.equal(desktop.pins[0].invalidateOnRefresh, true);
  assert.equal(desktop.pins[0].end(), '+=450');
  desktop.mediaRegistrations.find(entry => entry.query.includes('min-width')).cleanup();
  assert.equal(desktop.nodes.get('.approach').classList.contains('motion-pinned'), false);
  for (const options of [{ width: 390 }, { height: 768 }, { pinnedHeight: 900 }, { reducedMotion: true }]) {
    const p = pageFixture({ motionLibrary: true, ...options });
    assert.equal(p.pins.length, 0);
    if (options.reducedMotion) {
      assert.equal(p.motionCalls.length, 0);
      assert.equal(p.marqueeToggle.hidden, true);
    }
  }
});

test('a single filtered development occupies the whole grid without reloading hero media', async () => {
  const p = pageFixture(); await p.filters[2].emit('click');
  assert.equal(p.nodes.get('.project-list').dataset.visibleCount, '1');
  await p.filters[0].emit('click');
  assert.equal(p.nodes.get('.project-list').dataset.visibleCount, '3');
  assert.equal(p.video.loads, 0);
});
