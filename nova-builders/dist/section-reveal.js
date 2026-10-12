/* Section entry choreography. Only transform/opacity; no hero or canvas move. */
(function () {
  'use strict';
  window.NovaSectionReveal = function ({ root, gsap, ScrollTrigger }) {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const candidates = (root.dataset.sectionReveal === 'single' ? [root] : Array.from(root.children))
      .flatMap(element => element.querySelector?.('[data-word-reveal]') ? Array.from(element.children) : [element]);
    // Each visual block owns its timing, not the top of its taller parent.
    // Word ink and blueprint lines already have their own scroll animation.
    const targets = candidates.filter(element => !element.matches('[data-ui-reveal], [data-word-reveal], .approach-visual') && element.getBoundingClientRect().top > window.innerHeight);
    if (!targets.length) return null;
    const entries = targets.map(element => {
      const targets = [element];
      element.classList.add('section-reveal-item');
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
      // Separate initial state prevents refresh from reapplying a visible offset.
      gsap.set(targets, { y: mobile ? 12 : 24, opacity: 0 });
      tween = gsap.to(targets, {
        y: 0, opacity: 1, duration: mobile ? .4 : .45, ease: 'power2.out',
        paused: true, onComplete: complete
      });
      const play = () => { if (!completed) tween.play(); };
      trigger = ScrollTrigger.create({
        trigger: element, start: 'top 88%', end: 'bottom top',
        onEnter: play, onEnterBack: play, onLeave: complete,
        onRefresh: self => { if (self.progress === 1) complete(); else if (self.progress > 0) play(); }
      });
      if (completed) trigger.kill();
      return { element, complete, restore() { complete(); element.classList.remove('section-reveal-item'); } };
    });
    const complete = () => entries.forEach(entry => entry.complete());
    // Keyboard users never land on an invisible control during its entrance.
    root.addEventListener('focusin', complete);
    return {
      complete,
      settleBefore(boundary) {
        entries.forEach(entry => { if (entry.element.getBoundingClientRect().top <= boundary) entry.complete(); });
      },
      restore() {
        complete();
        root.removeEventListener('focusin', complete);
        entries.forEach(entry => entry.restore());
      }
    };
  };
})();
