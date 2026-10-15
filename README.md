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

The website source is in `nova-builders/dist/`. Pinned GSAP and Lenis files are served locally from `assets/vendor/`. Three.js downloads only when the design studio is within 300 px of the viewport. If Three.js is unavailable, the page remains readable and the 3D stage displays a concept image. Outfit and Cormorant Garamond are served locally as WOFF2 files; their licenses are in `dist/assets/fonts/`. The former Manrope assets are preserved but no longer requested.

### Asset loading

- Responsive WebP images replace PNGs throughout the page and project dialogs. The original twilight Aurelian hero uses its separate quality-78 set with a matching responsive preload and remains eagerly loaded. Project cards, dialogs, interior/material studies, and the studio fallback use quality-95 `*-detail-*.webp` files generated from the source PNGs. Cards now use generous landscape frames, with a full-width featured development and two supporting projects.
- Original PNGs are preserved but are no longer requested by the page. Regenerate the WebP sizes with `python nova-builders/scripts/optimize-images.py` after installing Pillow (`python -m pip install Pillow`). The preview itself still needs no installed dependencies.
- The construction hero draws all 192 frames from the replacement 8-second, 24 fps clip onto a canvas. A 100 ms eased catch-up loop, capped at four source frames per draw, follows scroll progress without MP4 seeking. Copy and construction labels follow painted frames. Missing frames pause advancement while keeping the last frame visible. Asynchronous completions cannot paint an obsolete destination.
- A local hero bootstrap runs before animation libraries and warms 12 opening frames (8 on low-memory devices) on the next animation frame after the cover image loads. It no longer waits for window.load or an extra 250ms. Main initialization adopts the same controller and downloaded/decoded buffers without duplicate requests. Data saver, direct section visits, hidden tabs and reduced motion skip speculative warm-up. The cover remains until a frame is painted, then fades according to user scroll instead of lagging painted progress. Reverse-to-cover still waits for actual frame zero. Required-frame errors activate the MP4 fallback.
- Network and decode queues are independent: 4 concurrent downloads (2 low-memory), versus 2 concurrent decodes. Directional download windows are 48 desktop / 32 mobile / 16 low-memory frames, including the current frame, plus immediate reverse neighbours. Compressed blobs are bounded to 16 / 12 / 6 MiB and at most lookahead plus decoded capacity; they can be reused on reversal. Leaving the hero aborts network activity and releases decoded pixels, retaining only bounded compressed data. Decoded capacity stays 12 desktop / 10 mobile / 8 low-memory. Source remains 1280×720, WebP quality 90, canvas up to 3× with the same pixel limits.
- Approximate decoded pixel buffers: 44.2 MB desktop cache, 36.9 MB mobile cache, 29.5 MB low-memory cache, plus up to 7.4 MB transient frames and 16 MB canvas (8 MB low-memory). Browser/decoder/GPU overhead is additional.
- The active sequence totals 35,832,892 bytes (~35.8 MB) if every frame downloads, not on initial page load. Previous frame folders are preserved but not requested. Slow connections can still pause while frames arrive.
- To regenerate frames with FFmpeg: `node scripts/build-hero-frames.mjs <path-to-ffmpeg>` from `nova-builders`. Output folders must be empty; the script refuses to overwrite assets. Active media provenance and counts are recorded in `dist/assets/hero-frames-v2/manifest.json`.
- Model construction and the Three.js download are delayed until the studio approaches the viewport. The fallback stays visible during loading or failure.
- The normal and italic heading fonts are preloaded in the HTML. Cormorant remains the brand font, with `font-display: swap` and a locally available Times fallback whose width/baseline metrics are adjusted to reduce the visual jump. Systems without that local face retain Georgia/serif fallback.
- First-screen styles (including responsive hero/header/mobile-menu rules and font definitions) are inlined. The remaining styles load through `deferred.css` using a non-blocking print-media link that activates on load. Browsers without JavaScript use the complete `styles.css` file. Page interactions initialize after the deferred CSS is available so scroll measurements use the intended layout. Headline motion is a small translation only, never an opacity gate; ScrollTrigger refresh hooks remain intact.
- `styles.css` is the editable source of truth. Run `npm run build:css` from `nova-builders` after CSS changes to regenerate inline critical CSS and `deferred.css`. `npm run check` also checks that those generated outputs are current.

### Hero video provenance

Active replacement (14 October 2026): `nova-construction-v2.mp4` is an unchanged copy of the supplied `Construction_timelapse_of_skyscr…_20261014163442.mp4`, SHA-256 `9ba8c3aa0a6233cc14924a2cbfb91c3a10411e88112054c0783b9de2ed8b1c08`. All 192 native 1280×720 frames are extracted at WebP quality 90, with no frame interpolation or resizing. The fallback `nova-construction-v2-scrub.mp4` is a silent H.264 CRF-18 all-intra derivative. The existing twilight poster is unchanged. The following original-video details describe preserved archival assets, not the active replacement.

Canvas settling uses frame identity without a terminal corrective jump. The retained MP4 fallback also settles by source-frame identity rather than exact timestamp equality; seeks target the middle of the frame interval, and only one seek may run at once. Both rendering paths are covered by deterministic tests, not confirmation of perceived browser playback.

The twilight cover fades away during the initial forward scroll. On reverse, it cannot increase its opacity until the actual opening frame is painted and scroll also targets that frame. The MP4 fallback waits for its opening seek to finish instead. This keeps a fast return to the top from covering reverse catch-up with the still image.

The preserved `nova-construction.mp4` is byte-for-byte identical to the supplied original: 1344×768, 24 fps, approximately 12.25 seconds (SHA-256 `9e22851da39ac9eaca20594f562a1f5dc17d536d25c230b8be81d6436db6ada1`). The sequence is extracted directly from that original, not the previously re-encoded scrub derivative: the active sequence is 1344×768 on every device, with a preserved unused 960×548 mobile variant, both WebP quality 90. WebP compression is lossy; it is not a pixel-identical/lossless copy. No frames were dropped or fabricated. A denser canvas avoids an additional resolution reduction but cannot recover detail absent from the source.

The fallback `nova-construction-scrub.mp4` was re-encoded earlier with H.264/x264 CRF 22 and a keyframe every two frames, versus the original's CRF 20 and two keyframes across the clip. It retains the same resolution/frame rate but is a lossy derivative optimized for seeking. Neither MP4 was modified by the canvas implementation. The hero uses natural colour with no saturation filter, lighter localized shading for text contrast, and a subtle headline shadow. Full-screen cover cropping/enlargement still affects perceived sharpness. Source imagery, including its existing watermark, is preserved.

### gpt-taste refinement

The existing static site uses the applicable ideas from the project skill, not Sites. The cinematic hero keeps its twilight image, serif headline, lilac accent and two actions; the subsequent canvas upgrade retains the old video controller only as a fallback. A continuous dense project grid leads into wide editorial typography, a clean text-only philosophy heading, a scroll-scrubbed philosophy paragraph and three keyboard/touch-accessible material chapters. The design-principles marquee has a pause control and stops when offscreen or hidden. The blueprint chapter is pinned only on tall desktop layouts where its contents fit; smaller screens and reduced motion retain normal flow. The 3D fitting/rotation logic is unchanged. See `nova-builders/TASTE-REFINEMENT.md` for selections and verification limits.

### Scroll-linked text and UI motion

The collection heading, philosophy paragraph, Nova promise and consultation heading now highlight word by word as the visitor scrolls, reversing on the return journey. Light sections move from readable muted stone to the existing charcoal/bronze ink; dark sections move from a muted neutral to the existing ivory. The effect uses an opacity-only duplicate ink layer over readable base text. Duplicate layers are hidden from assistive technology and excluded from text selection; authored spaces, line breaks, italics and paired quotation marks are preserved. No extra fonts, imagery or animation dependencies are introduced, and the hero canvas/video controller is unchanged.

The highlight has stronger dim-to-full-ink contrast and changes one word at a time, across a longer scroll range (top 78% to bottom 35% of the viewport). Base text remains readable at a minimum 3:1 contrast for these large text elements.

Eighteen below-hero containers nominate visual blocks for independent entrances. Each block triggers at 88% of viewport height, rather than the top of its entire parent section. Desktop uses a 24px/0.45s fade-up; phones use 12px/0.4s. Word-highlight text and the blueprint are excluded from entrance fades, because they own separate scroll animations. Initial styles are applied separately from paused tweens; completion clears styles and disconnects each trigger permanently. Already-visible blocks stay visible on reload. Anchor navigation settles only blocks in the landing viewport, leaving later blocks animated. Keyboard focus and project filtering can also complete pending entrances. Hero and 3D canvas are unchanged. Word highlighting initializes ink opacity separately from its tween so refreshes cannot uncover upcoming words.

Mobile layout must settle before scroll geometry is measured: the initial material accordion setup does not transition its height. Only subsequent user selections enable panel transitions. This avoids the initial 580px collapse leaving all downstream triggers late. The phone blueprint draws as its top travels from 85% to 35% of viewport height, using direct scrub without catch-up delay; desktop retains its longer drawing animation.

The collection filters, collection note, concept metrics and consultation note stay fixed in place; their former reversible vertical scrub was removed to prevent movement while reading. Buttons retain arrow/focus feedback and a gentle press state; filter underlines transition to show selection. No extra manual scroll listeners or layout-property animation are added. Reduced-motion visitors see fully highlighted, static text/UI; GSAP media-query cleanup restores the original text nodes and section styles. Missing GSAP/ScrollTrigger or the optional motion modules leaves the content readable. Existing chapter pinning and media loading remain intact.

Design-taste preservation read: luxury real-estate portfolio, editorial architecture language, existing native CSS + GSAP. `DESIGN_VARIANCE: 6` and `VISUAL_DENSITY: 3` are preserved; `MOTION_INTENSITY: 7` is a small increase for sequential storytelling and interaction feedback. This is a motion-only enhancement: no layout, palette, typography, routes, brand, media or content overhaul. Existing greenfield design-rule exceptions remain intentionally unchanged. Automated coverage checks splitting/restoration, screen-reader text, whitespace, italic ink, reverse timeline configuration, reduced-motion integration and large-text contrast. Real-browser visual review and a fresh Lighthouse run are still pending because no local browser surface was accessible in the previous review.

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
