# Nova Builders & Developers

A luxury real estate portfolio concept with a scroll-driven construction film, animated architectural blueprint, interactive 3D tower, filterable project collection, and accessible project details.

## Local preview

Use Node.js 20 or later. No dependencies need to be installed.

```powershell
cd nova-builders
npm run dev
```

Open http://127.0.0.1:4173/. The preview is local only and supports MP4 byte ranges for video scrubbing.

```powershell
npm run check
```

The website source is in `nova-builders/dist/`. GSAP and Lenis load from their existing CDNs. Three.js downloads only when the design studio is within 300 px of the viewport. If those services are unavailable, the page remains readable and the 3D stage displays a concept image. Manrope and Cormorant Garamond are served locally as WOFF2 files; their licenses are in `dist/assets/fonts/`.

### Asset loading

- Responsive WebP images replace PNGs throughout the page and project dialogs. The original twilight Aurelian hero uses its separate quality-78 set with a matching responsive preload and remains eagerly loaded. Project cards, dialogs, interior/material studies, and the studio fallback use quality-95 `*-detail-*.webp` files generated from the source PNGs. Cards now use generous landscape frames, with a full-width featured development and two supporting projects.
- Original PNGs are preserved but are no longer requested by the page. Regenerate the WebP sizes with `python nova-builders/scripts/optimize-images.py` after installing Pillow (`python -m pip install Pillow`). The preview itself still needs no installed dependencies.
- The construction video's source is attached only after scrolling inside the hero. A direct jump to a later section, a reduced-motion preference, or a media error retains the static image without an initial video download.
- Model construction and the Three.js download are delayed until the studio approaches the viewport. The fallback stays visible during loading or failure.
- The normal and italic heading fonts are preloaded in the HTML. Cormorant remains the brand font, with `font-display: swap` and a locally available Times fallback whose width/baseline metrics are adjusted to reduce the visual jump. Systems without that local face retain Georgia/serif fallback.
- First-screen styles (including responsive hero/header/mobile-menu rules and font definitions) are inlined. The remaining styles load through `deferred.css` using a non-blocking print-media link that activates on load. Browsers without JavaScript use the complete `styles.css` file. Page interactions initialize after the deferred CSS is available so scroll measurements use the intended layout. Headline motion is a small translation only, never an opacity gate; ScrollTrigger refresh hooks remain intact.
- `styles.css` is the editable source of truth. Run `npm run build:css` from `nova-builders` after CSS changes to regenerate inline critical CSS and `deferred.css`. `npm run check` also checks that those generated outputs are current.

### Hero video provenance

The preserved `nova-construction.mp4` is byte-for-byte identical to the supplied original: 1344×768, 24 fps, approximately 12.25 seconds. The displayed `nova-construction-scrub.mp4` was re-encoded earlier with H.264/x264 CRF 22 and a keyframe every two frames, versus the original's CRF 20 and two keyframes across the clip. It retains the same resolution/frame rate but is a lossy derivative optimized for seeking, not a lossless copy. The recent image/font/CSS changes have not re-encoded either video. The hero now uses natural colour with no saturation filter, lighter localized shading for text contrast, and a subtle headline shadow. Full-screen cover cropping/enlargement still affects perceived sharpness.

### SEO status

Existing basics: page title and description, semantic headings/sections, descriptive project image alternatives, and responsive layouts. This is not a complete SEO implementation.

Still pending: canonical URL, sitemap/robots files, social-preview metadata/image, suitable structured data, standalone project pages if search visibility is desired, and a live SEO/accessibility audit. Search Console verification and indexing status require access to the owner's Google account. Do not add fabricated LocalBusiness details for this fictional portfolio concept.

All company details, project names, specifications, and imagery are fictional portfolio content. The consultation form prepares a copyable enquiry draft locally; it does not send messages or store information.

### Interactions

- Scroll through the hero to scrub the construction film.
- Filter the collection and select a project to open its details.
- Drag the tower, use the arrow keys, pause rotation, reset the view, or switch to wireframe.
- Prepare a consultation draft with the selected project already filled in.
- Reduced motion uses a static hero and pauses the tower’s automatic rotation.

### Architectural redesign

Warm ivory, charcoal, stone and restrained bronze replace the purple theme below the hero. At the user's request, the hero retains the original twilight Aurelian image and original Cormorant headline styling: ivory text, lilac italic emphasis, and the original sizing. The page now leads with projects, then philosophy, interior/material studies, planning (blueprint), design development (interactive model), a compact promise, and consultation. Invented corporate history/track-record figures are replaced by labelled concept counts. The complete company name and paired quotation marks remain intact.

Three new concept images were produced using the built-in image generator following the imagegen skill. Source paths and full prompts are recorded in `nova-builders/ART-DIRECTION.md`. Original imagery and both videos are preserved. New detail images are lazy-loaded; no video was re-encoded in this redesign.

No public hosting or deployment is performed by the local preview workflow.
