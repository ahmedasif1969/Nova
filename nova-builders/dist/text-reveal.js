/* Readable base text + an opacity-only ink layer, preserving authored markup. */
(function () {
  'use strict';
  window.NovaTextReveal = function ({ element, gsap }) {
    if (element.classList.contains('word-reveal-active') || element.querySelector('a, button, input, select, textarea')) return () => {};
    const nodes = [];
    const collect = parent => {
      Array.from(parent.childNodes).forEach(node => {
        if (node.nodeType === 3 && node.textContent.trim()) nodes.push(node);
        else if (node.nodeType === 1 && node.getAttribute('aria-hidden') !== 'true') collect(node);
      });
    };
    collect(element);
    if (!nodes.length) return () => {};
    // Read inherited colours before changing DOM. Italics retain their own ink.
    const colours = nodes.map(node => getComputedStyle(node.parentElement).color);
    const snapshots = new Map();
    nodes.forEach(node => {
      const parent = node.parentElement;
      if (!snapshots.has(parent)) snapshots.set(parent, Array.from(parent.childNodes));
    });
    const inks = [];
    nodes.forEach((node, index) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(token => {
        if (!token) return;
        if (/^\s+$/.test(token)) { fragment.append(document.createTextNode(token)); return; }
        const word = document.createElement('span');
        word.classList.add('reveal-word');
        word.style.setProperty('--word-ink', colours[index]);
        word.textContent = token;
        const ink = document.createElement('span');
        ink.classList.add('reveal-word-ink');
        ink.textContent = token;
        ink.setAttribute('aria-hidden', 'true');
        word.append(ink);
        fragment.append(word);
        inks.push(ink);
      });
      node.replaceWith(fragment);
    });
    element.classList.add('word-reveal-active');
    // Keep every not-yet-highlighted word dim through ScrollTrigger refreshes.
    // A staggered fromTo can revert untouched words to their CSS opacity (1).
    gsap.set(inks, { opacity: 0 });
    const tween = gsap.to(inks, {
      opacity: 1, duration: .18, stagger: .18, ease: 'none',
      scrollTrigger: { trigger: element, start: 'top 78%', end: 'bottom 35%', scrub: .2 }
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      snapshots.forEach((children, parent) => parent.replaceChildren(...children));
      element.classList.remove('word-reveal-active');
    };
  };
})();
