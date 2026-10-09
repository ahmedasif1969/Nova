(function initializeNova() {
  // Unlike a normal blocking stylesheet, deferred CSS doesn't hold up defer
  // scripts. Preserve correctly styled geometry before initializing the same
  // animations, anchor interactions, and model. The hero is already styled.
  const deferredStyles = document.querySelector('[data-deferred-styles]');
  if (deferredStyles && deferredStyles.media !== 'all') {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      deferredStyles.media = 'all';
      initializeNova();
    };
    deferredStyles.addEventListener('load', start, { once: true });
    deferredStyles.addEventListener('error', start, { once: true });
    return;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video = document.querySelector('.hero-video');
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('.progress span');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const form = document.querySelector('[data-consultation-form]');
  const projectDialog = document.querySelector('[data-project-dialog]');
  let lenis = null;

  const syncScrollLock = () => {
    const locked = mobileMenu.classList.contains('open') || projectDialog.open;
    if (lenis) locked ? lenis.stop() : lenis.start();
  };

  const setMenu = open => {
    mobileMenu.classList.toggle('open', open);
    header.classList.toggle('menu-active', open);
    document.body.classList.toggle('menu-open', open);
    mobileMenu.inert = !open;
    mobileMenu.setAttribute('aria-hidden', String(!open));
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    syncScrollLock();
    if (open) mobileMenu.querySelector('a').focus();
    else menuToggle.focus({ preventScroll: true });
  };
  menuToggle.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
  mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (!mobileMenu.classList.contains('open')) return;
    if (event.key === 'Escape') setMenu(false);
    if (event.key === 'Tab') {
      const links = [...mobileMenu.querySelectorAll('a')];
      const first = menuToggle;
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', event => {
    if (event.matches && mobileMenu.classList.contains('open')) setMenu(false);
  });

  const scrollTo = target => {
    if (lenis) lenis.scrollTo(target, { offset: -88 });
    else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href');
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      if (mobileMenu.classList.contains('open')) setMenu(false);
      history.replaceState(null, '', hash);
      scrollTo(target);
      if (link.classList.contains('skip-link')) target.focus({ preventScroll: true });
    });
  });

  // Scroll chooses a destination; a separate, bounded catch-up loop moves the
  // paused video toward it. A completed seek isn't necessarily a painted frame.
  const hero = document.querySelector('[data-hero]');
  const heroPoster = document.querySelector('.hero-poster');
  const heroCopy = document.querySelector('.hero-copy');
  const buildProgress = document.querySelector('[data-build-progress]');
  const buildPhase = document.querySelector('[data-build-phase]');
  let videoDuration = 0;
  let targetVideoTime = 0;
  let videoReady = false;
  let videoRequested = false;
  let scrollFrame = 0;
  const frameDuration = 1 / 24; // The unchanged source is 24 fps.
  const smoothingMs = 120;
  const maxSeekStep = 3 * frameDuration;
  let heroActive = false;
  let scrubTime = 0;
  let scrubFrame = 0;
  let lastScrubTick = 0;
  let awaitingFrame = false;
  let framePresented = false;
  let frameCallback = null;
  let paintFrame = 0;
  let seekGeneration = 0;
  let heroProgress = 0;
  let displayedVideoFrame = 0;
  let posterOpacity = 1;
  const clamp = value => Math.max(0, Math.min(1, value));
  const syncHeroPoster = () => {
    if (!videoReady || reducedMotion) posterOpacity = 1;
    else {
      const requestedOpacity = 1 - clamp((heroProgress - .035) / .13);
      const rewindComplete = targetVideoTime < frameDuration * .5 && displayedVideoFrame === 0 && !video.seeking && !awaitingFrame;
      // Scroll can reach the top before reverse decoding catches up. Keep the
      // video uncovered until the opening frame has actually completed its seek.
      // Preserve the initial forward fade and the cover on load/error.
      if (requestedOpacity <= posterOpacity || rewindComplete) posterOpacity = requestedOpacity;
    }
    heroPoster.style.opacity = String(posterOpacity);
  };
  const clearFrameWait = () => {
    seekGeneration++;
    if (frameCallback !== null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameCallback);
    if (paintFrame) cancelAnimationFrame(paintFrame);
    frameCallback = null;
    paintFrame = 0;
    awaitingFrame = framePresented = false;
  };
  const stopVideoScrub = () => {
    if (scrubFrame) cancelAnimationFrame(scrubFrame);
    scrubFrame = 0;
    lastScrubTick = 0;
    scrubTime = video.currentTime || 0;
    clearFrameWait();
  };
  const requestVideoUpdate = () => {
    if (!scrubFrame && heroActive && !document.hidden && videoReady && videoDuration && !reducedMotion && !awaitingFrame && !video.seeking) {
      scrubFrame = requestAnimationFrame(updateVideoScrub);
    }
  };
  const finishFrameWait = () => {
    displayedVideoFrame = Math.floor(video.currentTime / frameDuration + 1e-7);
    clearFrameWait();
    syncHeroPoster();
    // Don't count time spent decoding/waiting toward the next catch-up step.
    lastScrubTick = 0;
    requestVideoUpdate();
  };
  const waitForPaintFallback = () => {
    if (paintFrame) return;
    const generation = seekGeneration;
    // Race compositor acknowledgement against one paint opportunity AFTER
    // decoding. Never add a fixed timeout to every frame of a paused video.
    // The next seek is scheduled on the following RAF, after this paint.
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      if (generation === seekGeneration && awaitingFrame && !video.seeking) finishFrameWait();
    });
  };
  const seekVideo = time => {
    awaitingFrame = true;
    framePresented = false;
    const generation = ++seekGeneration;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = (now, metadata) => {
        if (generation !== seekGeneration || !awaitingFrame) return;
        frameCallback = null;
        // Ignore an old frame submitted just before this seek began.
        if (Math.abs(metadata.mediaTime - time) < frameDuration * .75) {
          framePresented = true;
          if (!video.seeking) finishFrameWait();
        } else frameCallback = video.requestVideoFrameCallback(onFrame);
      };
      frameCallback = video.requestVideoFrameCallback(onFrame);
    }
    try { video.currentTime = time; }
    catch {
      stopVideoScrub();
      videoReady = false;
      requestScrollUpdate();
    }
  };
  function updateVideoScrub(now) {
    scrubFrame = 0;
    if (!heroActive || document.hidden || !videoReady || reducedMotion) { stopVideoScrub(); return; }
    if (video.readyState < 2 || video.seeking || awaitingFrame) { lastScrubTick = 0; return; }
    const lastFrame = Math.max(0, Math.floor((videoDuration - .05) / frameDuration));
    const desiredFrame = Math.max(0, Math.min(lastFrame, Math.round(targetVideoTime / frameDuration)));
    const currentFrame = Math.floor(video.currentTime / frameDuration + 1e-7);
    if (currentFrame === desiredFrame) {
      // Settle by frame identity, not exact timestamp equality. Once this frame
      // is selected, don't issue a final corrective seek at the end of easing.
      scrubTime = targetVideoTime;
      lastScrubTick = 0;
      return;
    }
    const elapsed = lastScrubTick ? Math.max(0, Math.min(now - lastScrubTick, 50)) : 1000 / 60;
    lastScrubTick = now;
    const gap = targetVideoTime - scrubTime;
    const easedStep = gap * (1 - Math.exp(-elapsed / smoothingMs));
    scrubTime += Math.max(-maxSeekStep, Math.min(maxSeekStep, easedStep));
    const nextFrame = Math.max(0, Math.min(lastFrame, Math.round(scrubTime / frameDuration)));
    if (nextFrame !== currentFrame) {
      // Seek INSIDE the selected frame's interval. Exact frame boundaries can
      // resolve to a neighbouring frame due to timestamp/decoder precision.
      seekVideo(Math.min(videoDuration - .001, (nextFrame + .5) * frameDuration));
    } else requestVideoUpdate();
  }
  const requestHeroVideo = () => {
    if (videoRequested || reducedMotion) return;
    const source = video.querySelector('source[data-src]');
    if (!source || !source.dataset.src) return;
    videoRequested = true;
    source.src = source.dataset.src;
    video.preload = 'auto';
    video.load();
  };
  const updateScroll = () => {
    scrollFrame = 0;
    const y = window.scrollY;
    const viewport = window.innerHeight;
    const pageRange = Math.max(1, document.documentElement.scrollHeight - viewport);
    // Read geometry before writing styles, rather than forcing another layout.
    const heroTop = hero.offsetTop;
    const heroHeight = hero.offsetHeight;
    heroActive = y >= heroTop && y < heroTop + heroHeight;
    const p = clamp((y - heroTop) / Math.max(1, heroHeight - viewport));
    heroProgress = p;
    progress.style.transform = `scaleX(${clamp(y / pageRange)})`;
    header.classList.toggle('scrolled', y > 80);
    buildProgress.style.transform = `scaleX(${p})`;
    buildPhase.textContent = p < .2 ? '01 / The vision' : p < .65 ? '02 / Taking shape' : p < .94 ? '03 / Every detail' : '04 / A new landmark';
    if (!reducedMotion) {
      // No media URL is attached until the visitor scrolls inside the hero.
      // Jumping directly to another section must not start a 29 MB download.
      if (p > 0 && y < heroTop + heroHeight) requestHeroVideo();
      const copyOpacity = 1 - clamp((p - .12) / .38);
      heroCopy.style.opacity = String(copyOpacity);
      heroCopy.style.transform = `translateY(${-p * 36}px)`;
      heroCopy.inert = copyOpacity < .05;
      if (videoDuration) {
        const videoProgress = clamp((p - .035) / .965);
        const lastFrameTime = Math.floor((videoDuration - .05) / frameDuration) * frameDuration;
        targetVideoTime = Math.min(lastFrameTime, Math.round(videoProgress * (videoDuration - .05) / frameDuration) * frameDuration);
        if (heroActive) requestVideoUpdate();
        else stopVideoScrub();
      }
      syncHeroPoster();
    }
  };
  const requestScrollUpdate = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };
  const enableVideoScrub = () => {
    videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
    video.pause();
    requestScrollUpdate();
  };
  if (video.readyState >= 1) enableVideoScrub();
  else video.addEventListener('loadedmetadata', enableVideoScrub, { once: true });
  const markVideoReady = () => {
    videoReady = true;
    scrubTime = video.currentTime || 0;
    displayedVideoFrame = Math.floor(scrubTime / frameDuration + 1e-7);
    requestScrollUpdate();
  };
  if (video.readyState >= 2) markVideoReady();
  video.addEventListener('loadeddata', markVideoReady, { once: true });
  video.addEventListener('seeked', () => {
    if (!awaitingFrame) {
      displayedVideoFrame = Math.floor(video.currentTime / frameDuration + 1e-7);
      syncHeroPoster();
      requestVideoUpdate();
      return;
    }
    if (framePresented) finishFrameWait();
    else waitForPaintFallback();
  });
  video.addEventListener('canplay', requestVideoUpdate);
  video.addEventListener('error', () => { videoReady = false; stopVideoScrub(); requestScrollUpdate(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopVideoScrub();
    else requestScrollUpdate();
  });
  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate, { passive: true });
  updateScroll();

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    if (!reducedMotion && window.Lenis) {
      lenis = new Lenis({ duration: .9, smoothWheel: true, wheelMultiplier: .9 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }
    if (!reducedMotion) {
      if (window.scrollY < window.innerHeight) {
        // Keep the headline readable at first paint; motion should not gate LCP.
        gsap.from('.hero h1 > span', { y: 12, stagger: .08, duration: .65, ease: 'power3.out', clearProps: 'transform' });
      }
      document.querySelectorAll('.reveal-section').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * .9) return;
        gsap.from(el, { y: 16, opacity: 0, duration: .65, ease: 'power2.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });
      const blueprintTimeline = gsap.timeline({ scrollTrigger: { trigger: '.approach-visual', start: 'top 88%', end: 'bottom 40%', scrub: .6 } });
      document.querySelectorAll('.blueprint-line').forEach((line, index) => {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
        blueprintTimeline.to(line, { strokeDashoffset: 0, ease: 'none', duration: .7 }, index * .1);
      });
      document.querySelectorAll('[data-count]').forEach(el => {
        const target = Number(el.dataset.count);
        const value = { n: 0 };
        gsap.to(value, { n: target, duration: 1.5, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 95%', once: true }, onUpdate: () => {
          el.textContent = (Number.isInteger(target) ? Math.round(value.n) : value.n.toFixed(1)) + (el.dataset.suffix || '');
        } });
      });
    }
    document.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  }

  // Keep the navigation marker aligned with the section actually in view.
  const navLinks = [...header.querySelectorAll('nav a')];
  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        const active = link.hash === `#${entry.target.id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-20% 0px -55% 0px' });
  document.querySelectorAll('#top, #legacy, #projects, #approach, #model-study, #consultation').forEach(section => navObserver.observe(section));

  const cards = [...document.querySelectorAll('.project-card')];
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter => {
      const active = filter === button;
      filter.classList.toggle('active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    document.querySelector('.project-list').classList.toggle('filtered', category !== 'all');
    cards.forEach(card => { card.hidden = category !== 'all' && card.dataset.category !== category; });
    const count = cards.filter(card => !card.hidden).length;
    document.querySelector('[data-project-count]').textContent = `${String(count).padStart(2, '0')} ${count === 1 ? 'development' : 'developments'}`;
    // Filtering must not leave cards in the hidden initial state of a reveal.
    if (window.gsap) {
      gsap.killTweensOf(cards);
      gsap.set(cards, { clearProps: 'transform,opacity' });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }
    requestScrollUpdate();
  }));

  const projects = {
    aurelian: { title: 'The Aurelian', location: 'Clifton, Karachi / Private residences', image: 'aurelian-daylight', status: 'Under construction', description: 'A terraced residential tower with a landscaped arrival, deeply shaded balconies and homes planned around natural light. The concept pairs pale stone with bronze façade details and planting at the sky terraces.', specs: [['Collection', '28 levels'], ['Completion', '2027 (concept)'], ['Architecture', 'Terraced residential tower'], ['Setting', 'Clifton, Karachi']], features: ['Private terraces with skyline views', 'Resident lounge and wellness studio', 'Landscaped arrival and attentive concierge'] },
    vela: { title: 'Vela Residences', location: 'Dubai Maritime City / Waterfront living', image: 'vela', status: 'In development', description: 'Where the rhythm of the city meets the calm of the sea. Vela brings open-plan residences, deeply shaded balconies, and a considered collection of shared spaces to an extraordinary waterfront setting.', specs: [['Collection', '142 residences'], ['Completion', '2028'], ['Architecture', 'Waterfront apartments'], ['Setting', 'Dubai Maritime City']], features: ['Panoramic water views and shaded terraces', 'Infinity pool and private residents’ club', 'Waterfront promenade and wellness spaces'] },
    meridian: { title: 'Meridian One', location: 'Islamabad / A connected new district', image: 'meridian', status: 'Launching soon', description: 'A new perspective on city living. Meridian One brings homes, workspaces, and destination retail together in a single landmark, grounded by a welcoming public realm and framed by Islamabad’s green horizons.', specs: [['Collection', '41 storeys'], ['Status', 'Launching soon'], ['Architecture', 'Mixed-use landmark'], ['Setting', 'Islamabad']], features: ['Residences and flexible workspaces', 'Curated retail and neighbourhood dining', 'Planted public spaces and sky gardens'] }
  };
  let selectedProject = null;
  let dialogTrigger = null;
  let enquiring = false;
  document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
    const project = projects[button.dataset.project];
    if (!project) return;
    selectedProject = project;
    dialogTrigger = button;
    enquiring = false;
    projectDialog.querySelector('[data-dialog-title]').textContent = project.title;
    projectDialog.querySelector('[data-dialog-location]').textContent = project.location;
    projectDialog.querySelector('[data-dialog-description]').textContent = project.description;
    projectDialog.querySelector('[data-dialog-status]').textContent = project.status;
    const image = projectDialog.querySelector('[data-dialog-image]');
    // Account for the landscape image covering a tall desktop dialog panel.
    image.sizes = '(max-width: 900px) 92vw, 990px';
    image.srcset = [640, 960, 1536].map(width => `./assets/${project.image}-detail-${width}.webp ${width}w`).join(', ');
    image.src = `./assets/${project.image}-detail-1536.webp`;
    image.alt = `${project.title} architectural concept`;
    const specs = projectDialog.querySelector('[data-dialog-specs]');
    specs.replaceChildren(...project.specs.map(([label, value]) => {
      const group = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value;
      group.append(dt, dd); return group;
    }));
    projectDialog.querySelector('[data-dialog-features]').replaceChildren(...project.features.map(feature => {
      const li = document.createElement('li'); li.textContent = feature; return li;
    }));
    projectDialog.showModal();
    projectDialog.scrollTop = 0;
    document.body.classList.add('dialog-open');
    syncScrollLock();
  }));
  const closeProject = () => {
    projectDialog.close();
    document.body.classList.remove('dialog-open');
    syncScrollLock();
  };
  document.querySelector('[data-dialog-close]').addEventListener('click', closeProject);
  projectDialog.addEventListener('click', event => {
    if (event.target !== projectDialog) return;
    const rect = projectDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeProject();
  });
  projectDialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    syncScrollLock();
    if (!enquiring && dialogTrigger) dialogTrigger.focus({ preventScroll: true });
  });
  document.querySelector('[data-dialog-enquire]').addEventListener('click', () => {
    if (!selectedProject) return;
    form.elements.project.value = selectedProject.title;
    document.querySelector('[data-enquiry-result]').hidden = true;
    enquiring = true;
    closeProject();
    scrollTo(document.querySelector('#consultation'));
    form.elements.name.focus({ preventScroll: true });
  });

  const initBuildingModel = () => {
    const canvas = document.querySelector('#building-model');
    const stage = document.querySelector('.model-stage');
    const hint = document.querySelector('[data-model-hint]');
    if (!canvas || !window.THREE) {
      if (canvas) canvas.hidden = true;
      hint.textContent = 'Architectural concept view';
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    camera.position.set(9.1, 7.1, 11.4);
    camera.lookAt(0, 4.7, 0);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      canvas.hidden = true;
      hint.textContent = 'Architectural concept view';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .85;

    const tower = new THREE.Group();

    const glass = new THREE.MeshStandardMaterial({ color: 0x526071, metalness: .45, roughness: .2, transparent: true, opacity: .87 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xbfb8af, metalness: .08, roughness: .55 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x837466, metalness: .7, roughness: .3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x30333d, metalness: .5, roughness: .3 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3f4c43, metalness: .08, roughness: .8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xd8b883, emissive: 0x9c6530, emissiveIntensity: .72, metalness: .05, roughness: .45 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xa49a84, transparent: true, opacity: .2 });
    const geometryCache = new Map();
    const edgeCache = new Map();

    const addBlock = (size, position, material = glass, showEdges = true) => {
      const key = size.join(',');
      if (!geometryCache.has(key)) geometryCache.set(key, new THREE.BoxGeometry(...size));
      const geometry = geometryCache.get(key);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      tower.add(mesh);
      if (showEdges) {
        if (!edgeCache.has(key)) edgeCache.set(key, new THREE.EdgesGeometry(geometry));
        const edges = new THREE.LineSegments(edgeCache.get(key), edgeMaterial);
        edges.position.copy(mesh.position);
        tower.add(edges);
      }
      return mesh;
    };

    // Layered podium and illuminated arrival hall.
    addBlock([5.8, .22, 4.5], [0, .11, 0], dark);
    addBlock([5.05, .34, 3.85], [0, .39, 0], stone);
    addBlock([4.35, .22, 3.35], [0, .67, 0], bronze);
    addBlock([3.8, .95, 2.85], [-.2, 1.2, .08], glass);
    addBlock([2.35, .42, .26], [-.25, 1.05, 1.53], glow, false);
    [-1.55, -.78, 0, .78, 1.55].forEach(x => addBlock([.075, 1.15, .075], [x, 1.18, 1.55], bronze, false));

    // Four interlocking tower volumes create visible setbacks.
    addBlock([3.25, 4.2, 2.65], [-.46, 3.55, 0], glass);
    addBlock([1.58, 3.35, 2.28], [1.55, 2.72, .26], glass);
    addBlock([2.72, 3.55, 2.28], [.08, 7.35, -.1], glass);
    addBlock([2.08, 1.75, 1.86], [-.24, 10.0, -.12], glass);

    // Floor plates, projecting balconies and planted sky terraces.
    for (let floor = 0; floor < 27; floor += 1) {
      const y = 1.58 + floor * .34;
      let width = 3.52;
      let depth = 2.92;
      let centerX = -.46;
      if (y > 5.5) { width = 2.96; depth = 2.52; centerX = .08; }
      if (y > 8.95) { width = 2.32; depth = 2.08; centerX = -.24; }
      addBlock([width, .045, depth], [centerX, y, -.02], stone, false);

      if (floor % 2 === 0) {
        const shift = floor % 4 === 0 ? .24 : -.2;
        addBlock([width * .7, .055, .42], [centerX + shift, y + .025, depth / 2 + .16], stone, false);
        addBlock([width * .7, .15, .018], [centerX + shift, y + .125, depth / 2 + .36], glass, false);
        addBlock([width * .7, .014, .028], [centerX + shift, y + .2, depth / 2 + .36], bronze, false);
      }
      if (floor % 4 === 2) {
        addBlock([.44, .055, depth * .68], [centerX + width / 2 + .17, y + .025, .04], stone, false);
        addBlock([.14, .14, depth * .48], [centerX + width / 2 + .2, y + .12, .04], green, false);
      }
      if ([10, 19, 25].includes(floor)) {
        addBlock([width * .54, .16, .15], [centerX - width * .08, y + .12, depth / 2 + .17], green, false);
      }
    }

    // Deep façade fins and mullions give the elevations scale and rhythm.
    [-1.72, -1.29, -.86, -.43, 0, .43, .86].forEach((x, i) => addBlock([.045, 4.02, .16], [x, 3.58, 1.38], i % 3 === 0 ? bronze : dark, false));
    [-1.08, -.72, -.36, 0, .36, .72, 1.08].forEach((x, i) => addBlock([.04, 3.38, .14], [x + .08, 7.35, 1.11], i % 3 === 1 ? bronze : dark, false));
    [-.86, -.43, 0, .43].forEach((x, i) => addBlock([.045, 1.64, .14], [x - .24, 10.0, .83], i % 2 ? bronze : dark, false));
    for (let y = 1.65; y < 4.35; y += .68) addBlock([1.86, .045, 2.5], [1.55, y, .26], stone, false);
    // Continue the façade rhythm around the back and side elevations.
    [[3.58, 4.02, 3.25, 2.65, -.46, 0], [7.35, 3.38, 2.72, 2.28, .08, -.1], [10, 1.64, 2.08, 1.86, -.24, -.12]].forEach(([y, height, width, depth, x, z]) => {
      for (let i = 1; i < 6; i += 1) {
        const offset = -width / 2 + width * i / 6;
        addBlock([.04, height, .09], [x + offset, y, z - depth / 2 - .015], i % 2 ? bronze : dark, false);
      }
      for (const side of [-1, 1]) {
        for (let i = 1; i < 5; i += 1) {
          addBlock([.09, height, .035], [x + side * (width / 2 + .015), y, z - depth / 2 + depth * i / 5], bronze, false);
        }
      }
    });

    // Warm window lights appear irregularly across the three tower tiers.
    [2.1, 2.78, 3.46, 4.14, 4.82].forEach((y, row) => {
      [-1.42, -.98, -.54, -.1, .34].forEach((x, col) => {
        if ((row + col) % 3 !== 1) addBlock([.24, .12, .026], [x, y, 1.405], glow, false);
      });
    });
    [5.88, 6.56, 7.24, 7.92, 8.6].forEach((y, row) => {
      [-.88, -.5, -.12, .26, .64, 1.02].forEach((x, col) => {
        if ((row + col) % 4 === 0) addBlock([.2, .11, .024], [x, y, 1.18], glow, false);
      });
    });
    [9.3, 9.98, 10.66].forEach((y, row) => {
      [-.82, -.38, .06, .5].forEach((x, col) => {
        if ((row + col) % 2 === 0) addBlock([.22, .11, .024], [x, y, .94], glow, false);
      });
    });

    // Open crown frame, roof canopy and twin service cores.
    [-.98, .5].forEach(x => {
      [-.82, .58].forEach(z => addBlock([.07, 1.2, .07], [x, 11.15, z], bronze, false));
    });
    addBlock([1.58, .08, 1.48], [-.24, 11.76, -.12], bronze, false);
    addBlock([.3, 1.15, .46], [-.7, 10.55, -.12], dark, false);
    addBlock([.3, .92, .46], [.18, 10.43, -.12], dark, false);

    // Center the complete building inside a separate rotation pivot. Rotating the
    // asymmetric tower group directly around the scene origin made it visibly
    // orbit within the stage instead of turning in place.
    const towerBounds = new THREE.Box3().setFromObject(tower);
    const towerCenter = towerBounds.getCenter(new THREE.Vector3());
    const towerSphere = towerBounds.getBoundingSphere(new THREE.Sphere());
    const towerScale = .84;
    tower.position.copy(towerCenter).multiplyScalar(-1);

    const towerPivot = new THREE.Group();
    towerPivot.rotation.y = -.58;
    towerPivot.scale.setScalar(towerScale);
    towerPivot.add(tower);
    scene.add(towerPivot);

    const ground = new THREE.GridHelper(10, 16, 0x9c8968, 0x566052);
    ground.position.y = (towerBounds.min.y - towerCenter.y) * towerScale - .02;
    ground.material.transparent = true;
    ground.material.opacity = .22;
    scene.add(ground);

    scene.add(new THREE.HemisphereLight(0xf3eee7, 0x343d32, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(6, 10, 8);
    scene.add(key);
    const fillLight = new THREE.PointLight(0xe4decd, 1.7, 22);
    fillLight.position.set(-5, 4, 5);
    scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xd9a96f, 1.8, 10);
    warmLight.position.set(2, 2, 4);
    scene.add(warmLight);

    const modelSphere = new THREE.Sphere(new THREE.Vector3(), towerSphere.radius * towerScale);
    const cameraDirection = new THREE.Vector3(1.05, .22, 1.32).normalize();

    let visible = false;
    let autoRotate = !reducedMotion;
    let dragging = false;
    let lastX = 0;
    let dirty = true;
    let lastTime = 0;
    const rotateButton = document.querySelector('[data-model-rotate]');
    const resetButton = document.querySelector('[data-model-reset]');
    const wireButton = document.querySelector('[data-model-wireframe]');
    const updateRotateButton = () => {
      rotateButton.setAttribute('aria-pressed', String(autoRotate));
      rotateButton.textContent = autoRotate ? 'Pause rotation Ⅱ' : 'Auto rotate ↻';
    };
    const setAutoRotate = value => { autoRotate = value; dirty = true; updateRotateButton(); };
    updateRotateButton();
    [rotateButton, resetButton, wireButton].forEach(button => { button.disabled = false; });
    document.querySelector('.model-controls').hidden = false;
    stage.classList.add('ready');
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const limitingFov = Math.min(verticalFov, horizontalFov);
      const distance = modelSphere.radius / Math.sin(limitingFov / 2) * 1.08;
      camera.position.copy(modelSphere.center).add(cameraDirection.clone().multiplyScalar(distance));
      camera.lookAt(modelSphere.center);
      camera.near = Math.max(.1, distance / 100);
      camera.far = distance * 5;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    resize();
    new ResizeObserver(resize).observe(canvas.parentElement);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; dirty = true; }, { rootMargin: '120px' }).observe(canvas);
    rotateButton.addEventListener('click', () => setAutoRotate(!autoRotate));
    const resetView = () => { towerPivot.rotation.y = -.58; dirty = true; };
    resetButton.addEventListener('click', resetView);
    wireButton.addEventListener('click', () => {
      const wireframe = wireButton.getAttribute('aria-pressed') !== 'true';
      [glass, stone, bronze, dark, green, glow].forEach(material => { material.wireframe = wireframe; });
      wireButton.setAttribute('aria-pressed', String(wireframe));
      wireButton.textContent = wireframe ? 'Solid view' : 'Wireframe';
      dirty = true;
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      dragging = true; lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      setAutoRotate(false);
    });
    canvas.addEventListener('pointermove', event => {
      if (!dragging) return;
      towerPivot.rotation.y += (event.clientX - lastX) * .009;
      lastX = event.clientX;
      dirty = true;
    });
    const endDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    canvas.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', ' '].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        setAutoRotate(false);
        towerPivot.rotation.y += event.key === 'ArrowLeft' ? -.12 : .12;
        dirty = true;
      } else if (event.key === 'Home') resetView();
      else if (event.key === ' ') setAutoRotate(!autoRotate);
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      visible = false;
      stage.classList.remove('ready');
      hint.textContent = 'Architectural concept view';
    });
    canvas.addEventListener('webglcontextrestored', () => {
      stage.classList.add('ready');
      visible = true; dirty = true;
      hint.textContent = 'Drag to explore · ← → to rotate';
      resize();
    });
    document.addEventListener('visibilitychange', () => { lastTime = 0; dirty = true; });

    const render = time => {
      requestAnimationFrame(render);
      const delta = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0;
      lastTime = time;
      if (!visible || document.hidden) return;
      if (autoRotate && !dragging) { towerPivot.rotation.y += delta * .17; dirty = true; }
      if (dirty) { renderer.render(scene, camera); dirty = false; }
    };
    requestAnimationFrame(render);
  };

  // Download Three.js and construct the tower only near its own section.
  // A concept image remains available while loading or if WebGL/CDN fails.
  const modelSection = document.querySelector('#model-study');
  if (modelSection) {
    let modelRequested = false;
    const showModelFallback = () => {
      document.querySelector('#building-model').hidden = true;
      document.querySelector('.model-stage').classList.remove('ready');
      document.querySelector('[data-model-hint]').textContent = 'Architectural concept view';
    };
    const loadModel = () => {
      if (modelRequested) return;
      modelRequested = true;
      const startModel = () => {
        try { initBuildingModel(); }
        catch { showModelFallback(); }
      };
      if (window.THREE) { startModel(); return; }
      document.querySelector('[data-model-hint]').textContent = 'Loading architectural study…';
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
      script.async = true;
      script.addEventListener('load', startModel, { once: true });
      script.addEventListener('error', showModelFallback, { once: true });
      document.head.append(script);
    };
    if ('IntersectionObserver' in window) {
      const modelObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        modelObserver.disconnect();
        loadModel();
      }, { rootMargin: '300px' });
      modelObserver.observe(modelSection);
    } else {
      // Older browsers keep a working model without the loading optimization.
      loadModel();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const draft = `Consultation enquiry — Nova Builders & Developers\n\nName: ${data.get('name')}\nEmail: ${data.get('email')}\nInterest: ${data.get('interest')}\nProject: ${data.get('project') || 'Still exploring'}\n\n${data.get('message') || 'I would like to arrange a private consultation.'}`;
    document.querySelector('#enquiry-draft').value = draft;
    document.querySelector('[data-enquiry-result]').hidden = false;
    document.querySelector('[data-form-note]').textContent = 'Your enquiry is ready to copy. Nothing has been sent.';
    document.querySelector('#enquiry-draft').focus({ preventScroll: true });
  });
  document.querySelector('[data-copy-enquiry]').addEventListener('click', async () => {
    const draft = document.querySelector('#enquiry-draft');
    try {
      await navigator.clipboard.writeText(draft.value);
      document.querySelector('[data-form-note]').textContent = 'Enquiry copied to your clipboard.';
    } catch {
      draft.focus(); draft.select();
      document.querySelector('[data-form-note]').textContent = 'Select and copy the draft above with Ctrl+C or Command+C.';
    }
  });
})();
