(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video = document.querySelector('.hero-video');
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('.progress span');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const form = document.querySelector('[data-consultation-form]');

  const setHeader = () => header.classList.toggle('scrolled', window.scrollY > window.innerHeight * .75);
  window.addEventListener('scroll', setHeader, { passive: true });
  setHeader();

  menuToggle.addEventListener('click', () => {
    const open = !mobileMenu.classList.contains('open');
    mobileMenu.classList.toggle('open', open);
    header.classList.toggle('menu-active', open);
    document.body.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => menuToggle.click()));

  // Drive the video from the real scroll position rather than repeatedly
  // tweening currentTime. This keeps seeks coalesced to one update per frame
  // and still works if the animation CDN is unavailable.
  const hero = document.querySelector('[data-hero]');
  let videoDuration = 0;
  let renderedFrame = -1;
  let videoFrameRequest = 0;

  const renderHeroFrame = () => {
    videoFrameRequest = 0;
    if (!videoDuration) return;
    const scrollRange = Math.max(1, hero.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, (window.scrollY - hero.offsetTop) / scrollRange));
    const frame = Math.round(progress * (videoDuration - .05) * 24);
    if (frame === renderedFrame) return;
    renderedFrame = frame;
    video.currentTime = Math.min(videoDuration - .05, frame / 24);
  };

  const requestHeroFrame = () => {
    if (videoFrameRequest) return;
    videoFrameRequest = requestAnimationFrame(renderHeroFrame);
  };

  const enableVideoScrub = () => {
    videoDuration = video.duration;
    video.pause();
    if (reducedMotion) {
      video.currentTime = .01;
      return;
    }
    requestHeroFrame();
  };

  if (video.readyState >= 1) enableVideoScrub();
  else video.addEventListener('loadedmetadata', enableVideoScrub, { once: true });
  if (!reducedMotion) {
    window.addEventListener('scroll', requestHeroFrame, { passive: true });
    window.addEventListener('resize', requestHeroFrame, { passive: true });
  }

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);

    if (!reducedMotion && window.Lenis) {
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true, wheelMultiplier: .9 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', event => {
          const target = document.querySelector(link.getAttribute('href'));
          if (target) { event.preventDefault(); lenis.scrollTo(target, { offset: -64 }); }
        });
      });
    }

    gsap.to(progress, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .2 } });

    if (!reducedMotion) {
      gsap.from('.hero h1 span, .hero h1 strong', { yPercent: 110, opacity: 0, stagger: .08, duration: 1.1, ease: 'power4.out', delay: .25 });
      gsap.from('.eyebrow, .hero-actions', { opacity: 0, y: 20, duration: .8, stagger: .15, delay: .7 });

      document.querySelectorAll('.reveal-section').forEach(el => {
        gsap.from(el, { y: 70, opacity: 0, duration: 1.05, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 84%', once: true } });
      });

      document.querySelectorAll('.blueprint-line').forEach((line, index) => {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(line, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.approach', start: 'top 82%', end: 'center 38%', scrub: .8 }, delay: index * .015 });
      });
      gsap.from('.model-stage', { opacity: 0, scale: .94, y: 36, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.model-showcase', start: 'top 76%', once: true } });
    }

    document.querySelectorAll('[data-count]').forEach(el => {
      const target = Number(el.dataset.count);
      const value = { n: 0 };
      gsap.to(value, { n: target, duration: 1.8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true }, onUpdate: () => { el.textContent = Number.isInteger(target) ? Math.round(value.n) : value.n.toFixed(1); } });
    });
  }

  const initBuildingModel = () => {
    const canvas = document.querySelector('#building-model');
    if (!canvas || !window.THREE) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    camera.position.set(9.1, 7.1, 11.4);
    camera.lookAt(0, 4.7, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .78;

    const tower = new THREE.Group();

    const glass = new THREE.MeshPhysicalMaterial({ color: 0x40516e, metalness: .3, roughness: .2, transparent: true, opacity: .78, transmission: .025 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xcac0d2, metalness: .08, roughness: .5 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x76516f, metalness: .78, roughness: .24 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d263d, metalness: .6, roughness: .3 });
    const green = new THREE.MeshStandardMaterial({ color: 0x36484d, metalness: .08, roughness: .8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xd8b883, emissive: 0x9c6530, emissiveIntensity: .72, metalness: .05, roughness: .45 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x333b59, transparent: true, opacity: .38 });

    const addBlock = (size, position, material = glass, showEdges = true) => {
      const geometry = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      tower.add(mesh);
      if (showEdges) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
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
    towerPivot.rotation.x = -.03;
    towerPivot.rotation.y = -.58;
    towerPivot.scale.setScalar(towerScale);
    towerPivot.add(tower);
    scene.add(towerPivot);

    const ground = new THREE.GridHelper(12, 18, 0x8d78a2, 0x343a54);
    ground.position.y = -towerCenter.y * towerScale - .02;
    ground.material.transparent = true;
    ground.material.opacity = .34;
    scene.add(ground);

    scene.add(new THREE.HemisphereLight(0xeee6f4, 0x202840, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.72);
    key.position.set(6, 10, 8);
    scene.add(key);
    const purple = new THREE.PointLight(0xb68bcb, 2.8, 22);
    purple.position.set(-5, 4, 5);
    scene.add(purple);
    const warmLight = new THREE.PointLight(0xd9a96f, 1.8, 10);
    warmLight.position.set(2, 2, 4);
    scene.add(warmLight);

    const modelSphere = new THREE.Sphere(new THREE.Vector3(), towerSphere.radius * towerScale);
    const cameraDirection = new THREE.Vector3(1.05, .3, 1.32).normalize();

    let visible = true;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const limitingFov = Math.min(verticalFov, horizontalFov);
      const distance = modelSphere.radius / Math.sin(limitingFov / 2) * 1.12;
      camera.position.copy(modelSphere.center).add(cameraDirection.clone().multiplyScalar(distance));
      camera.lookAt(modelSphere.center);
      camera.near = Math.max(.1, distance / 100);
      camera.far = distance * 5;
      camera.updateProjectionMatrix();
    };
    resize();
    new ResizeObserver(resize).observe(canvas.parentElement);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);

    const render = () => {
      requestAnimationFrame(render);
      if (!visible) return;
      if (!reducedMotion) towerPivot.rotation.y += .0028;
      renderer.render(scene, camera);
    };
    render();
  };

  initBuildingModel();

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const subject = encodeURIComponent(`Consultation request — ${data.get('interest')}`);
    const body = encodeURIComponent(`Name: ${data.get('name')}\nEmail: ${data.get('email')}\nInterest: ${data.get('interest')}\n\n${data.get('message') || 'I would like to arrange a consultation.'}`);
    window.location.href = `mailto:hello@novabuilders.dev?subject=${subject}&body=${body}`;
  });
})();
