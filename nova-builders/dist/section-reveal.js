/* Section entry choreography. Only transform/opacity; no hero or canvas move. */
(function () {
  'use strict';
  window.NovaSectionReveal = function ({ root, gsap, ScrollTrigger }) {
    // Begin just before entry; don't hide content already inside that range
    // on refresh, direct links or restored scroll.
    if (root.getBoundingClientRect().top <= window.innerHeight + 80) return null;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const candidates = root.dataset.sectionReveal === 'single' ? [root] : Array.from(root.children);
    // UI scrub owns its own transform. Don't attach two tweens to that property.
    const targets = candidates.filter(element => !element.matches('[data-ui-reveal]'));
    if (!targets.length) return null;
    targets.forEach(element => element.classList.add('section-reveal-item'));
    let completed = false;
    let trigger;
    let tween;
    const complete = () => {
      if (completed) return;
      completed = true;
      trigger?.kill();
      // Suppress callbacks when completing for focus, anchors or fast scrolling.
      tween.progress(1, true);
      tween.kill();
      gsap.set(targets, { clearProps: 'transform,opacity' });
    };
    // Keep the initial state separate from ScrollTrigger. A scrubbed fromTo
    // with clearProps can lose its initial styles during a refresh, then
    // reapply the offset to already-visible content when its trigger fires.
    gsap.set(targets, { y: mobile ? 18 : 24, opacity: 0 });
    tween = gsap.to(targets, {
      y: 0, opacity: 1, duration: .45, stagger: .04, ease: 'power2.out',
      paused: true, onComplete: complete
    });
    const play = () => { if (!completed) tween.play(); };
    trigger = ScrollTrigger.create({
      trigger: root, start: 'top bottom+=80', end: 'bottom top',
      onEnter: play, onEnterBack: play, onLeave: complete,
      onRefresh: self => { if (self.progress === 1) complete(); }
    });
    if (completed) trigger.kill();
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
