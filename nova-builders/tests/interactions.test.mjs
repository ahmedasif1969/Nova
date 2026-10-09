import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dist/script.js', import.meta.url), 'utf8');

// Exercise the page's event handlers without a browser or animation CDNs.
function pageFixture() {
  const nodes = new Map();
  const frames = new Map();
  const groups = new Map();
  let frameId = 0;
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
  document.documentElement = { scrollHeight: 10000 };
  document.getElementById = id => nodes.get(`#${id}`);
  document.createElement = () => new Element();
  const window = new Element();
  window.scrollY = 0; window.innerHeight = 1000;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const hero = nodes.get('[data-hero]'); hero.offsetTop = 0; hero.offsetHeight = 3000;
  const video = nodes.get('.hero-video');
  video.readyState = 0; video.duration = 10; video.seeking = false; video.pause = () => {};
  let currentTime = 0;
  video.seeks = [];
  Object.defineProperty(video, 'currentTime', { get: () => currentTime, set: time => { currentTime = time; video.seeking = true; video.seeks.push(time); } });
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
    IntersectionObserver: class { observe() {} },
    FormData: class { get(key) { return key === 'project' ? form.elements.project.value : formData[key]; } },
  });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  return { nodes, filters, cards, projects, window, document, video, flush, clipboard: () => clipboard };
}

test('CDN failures preserve project filtering and the architectural fallback', async () => {
  const p = pageFixture();
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

test('rapid scrolling waits for decoding and then seeks to the newest target', async () => {
  const p = pageFixture();
  p.video.readyState = 2;
  await p.video.emit('loadedmetadata'); await p.video.emit('loadeddata');
  p.window.scrollY = 400; await p.window.emit('scroll'); p.flush();
  assert.equal(p.video.seeks.length, 1);
  p.window.scrollY = 1000; await p.window.emit('scroll'); p.flush();
  p.window.scrollY = 1800; await p.window.emit('scroll'); p.flush();
  assert.equal(p.video.seeks.length, 1, 'Do not interrupt an in-flight decode');
  p.video.seeking = false; await p.video.emit('seeked');
  assert.equal(p.video.seeks.length, 2);
  assert.ok(p.video.seeks[1] > 8 && p.video.seeks[1] < 10, 'The latest scroll target must not be dropped');
  await p.video.emit('error'); p.flush();
  assert.equal(p.nodes.get('.hero-poster').style.opacity, '1');
});
