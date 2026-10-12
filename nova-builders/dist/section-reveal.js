/* Section entry choreography. Only transform/opacity; no hero or canvas move. */
(function () {
  'use strict';
  window.NovaSectionReveal = function ({ root, gsap }) {
    // Begin just before entry; don't hide content already inside that range
    // on refresh, direct links or restored scroll.
    if (root.getBoundingClientRect().top <= window.innerHeight + 80) return null;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const candidates = root.dataset.sectionReveal === 'single' ? [root] : Array.from(root.children);
    // UI scrub owns its own transform. Don't attach two tweens to that property.
    const targets = candidates.filter(element => !element.matches('[data-ui-reveal]'));
    if (!targets.length) return null;
    targets.forEach(element => element.classList.add('section-reveal-item'));
    const tween = gsap.fromTo(targets, { y: mobile ? 28 : 44, opacity: 0 }, {
      y: 0, opacity: 1, duration: .6, stagger: .06, ease: 'power3.out',
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: root, start: 'top bottom+=80', once: true, invalidateOnRefresh: true }
    });
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      tween.progress(1);
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(targets, { clearProps: 'transform,opacity' });
    };
    // Keyboard users never land on an invisible control during its entrance.
    root.addEventListener('focusin', complete);
    return {
      complete,
      restore() {
        complete();
        root.removeEventListener('focusin', complete);
        targets.forEach(element => element.classList.remove('section-reveal-item'));
      }
    };
  };
})();
