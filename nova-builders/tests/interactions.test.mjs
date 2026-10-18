import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');
const textRevealSource = await readFile(new URL('../dist/text-reveal.js', import.meta.url), 'utf8');
const sectionRevealSource = await readFile(new URL('../dist/section-reveal.js', import.meta.url), 'utf8');

// Exercise the page's event handlers without a browser or animation CDNs.
function pageFixture({ reducedMotion = false, initialScroll = 0, deferStyles = false, motionLibrary = false, sectionLibrary = false, sequenceLibrary = false, width = 1440, height = 1000, pinnedHeight = 650 } = {}) {
  const nodes = new Map();
  const frames = new Map();
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
  const selectors = ['[data-header]', '.progress span', '[data-menu-toggle]', '[data-mobile-menu]', '[data-consultation-form]', '[data-project-dialog]', '[data-hero]', '.hero-poster', '.hero-copy', '[data-build-progress]', '[data-build-phase]', '[data-project-count]', '.project-list', '[data-dialog-title]', '[data-dialog-location]', '[data-dialog-description]', '[data-dialog-status]', '[data-dialog-image]', '[data-dialog-specs]', '[data-dialog-features]', '[data-dialog-close]', '[data-dialog-enquire]', '[data-enquiry-result]', '#enquiry-draft', '[data-form-note]', '[data-copy-enquiry]', '#building-model', '.model-stage', '[data-model-hint]', '#top', '#legacy', '#projects', '#approach', '#model-study', '#consultation'];
  selectors.forEach(selector => nodes.set(selector, new Element()));
  const heroStory = new Element(); heroStory.hidden = true;
  const heroChapters = Array.from({ length: 3 }, () => { const panel = new Element(); panel.hidden = true; return panel; });
  nodes.set('[data-hero-story]', heroStory);
  groups.set('[data-hero-chapter]', heroChapters);
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
  return { nodes, heroStory, heroChapters, filters, cards, projects, materials, materialAccordion, marquee, marqueeTrack, marqueeToggle, paragraph, motionCalls, mediaRegistrations, pins, window, document, observers, frames, timers, flush, advance, sequenceCallbacks, sequenceCalls, clipboard: () => clipboard };
}

test('canvas is primary, copy follows painted frames and the poster cannot cover reverse catch-up', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  assert.equal(p.sequenceCalls.at(-1).active, false);
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.sequenceCalls.at(-1).active, true);
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

test('hero chapters follow painted frames, reverse with the building, and disappear on failure', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.heroStory.hidden, true, 'A distant scroll target must not advance the copy before its frame');
  for (const [progress, chapter] of [[.35, 0], [.65, 1], [.9, 2], [.65, 1], [.35, 0]]) {
    p.sequenceCallbacks.onDraw(progress, Math.round(progress * 191));
    assert.equal(p.heroStory.hidden, false);
    assert.deepEqual(p.heroChapters.map(panel => panel.hidden), [0, 1, 2].map(index => index !== chapter));
    assert.equal(p.heroChapters[chapter].style.opacity, '1');
    assert.equal(p.nodes.get('.hero-copy').style.opacity, '0');
  }
  p.sequenceCallbacks.onDraw(0, 0);
  assert.equal(p.heroStory.hidden, true);
  assert.equal(p.nodes.get('.hero-copy').style.opacity, '1');
  p.sequenceCallbacks.onDraw(.9, 172);
  p.sequenceCallbacks.onError(new Error('Canvas failed'));
  assert.equal(p.heroStory.hidden, true);
  assert.ok(p.heroChapters.every(panel => panel.hidden));
});

test('hero keeps advancing until just before the sticky section ends', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  // Fixture hero is 3000px tall with a 1000px viewport: 2000px sticky travel.
  p.window.scrollY = 1640; await p.window.emit('scroll'); p.flush();
  assert.ok(p.sequenceCalls.at(-1).p > .75 && p.sequenceCalls.at(-1).p < 1,
    'The animation must still be advancing where it used to finish');
  p.window.scrollY = 1970; await p.window.emit('scroll'); p.flush();
  assert.equal(p.sequenceCalls.at(-1).p, 1);
  assert.equal(p.sequenceCalls.at(-1).active, true);
  assert.ok(p.window.scrollY < 2000);
  p.window.scrollY = 820; await p.window.emit('scroll'); p.flush();
  assert.ok(p.sequenceCalls.at(-1).p > .35 && p.sequenceCalls.at(-1).p < .45);
});

test('canvas failure restores a static poster immediately and keeps it on subsequent scrolls', async () => {
  const p = pageFixture({ sequenceLibrary: true });
  p.sequenceCallbacks.onDraw(.8, 153);
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '0');
  p.sequenceCallbacks.onError(new Error('Frame failed'));
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
  assert.equal(p.nodes.get('.hero-copy').style.opacity, '1');
  for (const y of [1800, 5000, 0]) {
    p.window.scrollY = y; await p.window.emit('scroll'); p.flush();
    assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
    assert.equal(p.nodes.get('.hero-copy').style.opacity, '1');
    assert.equal(p.nodes.get('[data-build-phase]').textContent, 'The vision');
  }
});

test('missing canvas support and reduced motion retain the still hero through scroll and visibility changes', async () => {
  for (const options of [{}, { sequenceLibrary: true, reducedMotion: true }]) {
    const p = pageFixture(options);
    for (const y of [0, 1800, 5000, 0]) {
      p.window.scrollY = y; await p.window.emit('scroll'); p.flush();
      p.document.hidden = true; await p.document.emit('visibilitychange'); p.flush();
      p.document.hidden = false; await p.document.emit('visibilitychange'); p.flush();
      assert.equal(p.nodes.get('.hero-poster').style.opacity ?? '1', '1');
      assert.ok(p.sequenceCalls.every(call => !call.active));
      assert.equal(p.heroStory.hidden, true);
    }
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
});
