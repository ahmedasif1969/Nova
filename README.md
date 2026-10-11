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

The website source is in `nova-builders/dist/`. GSAP and Lenis load from their existing CDNs. Three.js downloads only when the design studio is within 300 px of the viewport. If those services are unavailable, the page remains readable and the 3D stage displays a concept image. Outfit and Cormorant Garamond are served locally as WOFF2 files; their licenses are in `dist/assets/fonts/`. The former Manrope assets are preserved but no longer requested.

### Asset loading

- Responsive WebP images replace PNGs throughout the page and project dialogs. The original twilight Aurelian hero uses its separate quality-78 set with a matching responsive preload and remains eagerly loaded. Project cards, dialogs, interior/material studies, and the studio fallback use quality-95 `*-detail-*.webp` files generated from the source PNGs. Cards now use generous landscape frames, with a full-width featured development and two supporting projects.
- Original PNGs are preserved but are no longer requested by the page. Regenerate the WebP sizes with `python nova-builders/scripts/optimize-images.py` after installing Pillow (`python -m pip install Pillow`). The preview itself still needs no installed dependencies.
- The construction hero now draws a WebP image sequence onto a canvas. All 294 frames from the original 24 fps clip are included. A 100 ms eased catch-up loop, capped at four source frames per draw, follows scroll progress without MP4 seeking. Copy and construction labels follow painted frames. A missing frame pauses advancement while keeping the last frame visible; asynchronous completions cannot paint an obsolete destination. This removes the video-seeking bottleneck, not network/decode delays.
- Frames are requested only after scrolling inside the hero, never on first paint or a direct jump to another chapter. Reduced motion retains the twilight image. Unsupported canvas/bitmap decoding or a frame-load error activates the preserved MP4 controller as a fallback; the sequence and MP4 are not downloaded together during normal operation.
- The decoded cache is capped at 12 desktop frames, 10 mobile frames, or 8 on devices reporting <=4 GB RAM, with at most two fetch/decode operations in flight. Evicted bitmaps are explicitly closed. Leaving the hero or hiding the tab releases the cache and aborts requests while retaining the last canvas pixels. The backing store is capped at approximately two million pixels, even on high-DPI screens.
- Approximate pixel-buffer budget: desktop cache ~49.5 MB, mobile cache ~21 MB, plus up to two transient decoded frames (~8.3/~4.2 MB) and a canvas up to ~8 MB. These are estimates for this hero, not measured total browser RAM; decoder temporaries, browser caching and GPU allocations add overhead. Keeping all desktop frames decoded would take about 1.2 GB, which this implementation avoids.
- Bandwidth trade-off: the complete high-detail desktop sequence is 78,321,562 bytes (~78.3 MB), mobile 46,792,728 bytes (~46.8 MB). These are totals if every frame downloads, not initial-page payloads. Only a nearby window is requested; HTTP cache may reuse compressed responses on reversal, but browsers control that cache. Cold/slow connections can still pause. Real desktop/mobile playback and network throttling must be reviewed before claiming perceptual smoothness.
- To regenerate frames with FFmpeg: `node scripts/build-hero-frames.mjs <path-to-ffmpeg>` from `nova-builders`. Output folders must be empty; the script refuses to overwrite assets. Media provenance and counts are recorded in `dist/assets/hero-frames/manifest.json`.
- Model construction and the Three.js download are delayed until the studio approaches the viewport. The fallback stays visible during loading or failure.
- The normal and italic heading fonts are preloaded in the HTML. Cormorant remains the brand font, with `font-display: swap` and a locally available Times fallback whose width/baseline metrics are adjusted to reduce the visual jump. Systems without that local face retain Georgia/serif fallback.
- First-screen styles (including responsive hero/header/mobile-menu rules and font definitions) are inlined. The remaining styles load through `deferred.css` using a non-blocking print-media link that activates on load. Browsers without JavaScript use the complete `styles.css` file. Page interactions initialize after the deferred CSS is available so scroll measurements use the intended layout. Headline motion is a small translation only, never an opacity gate; ScrollTrigger refresh hooks remain intact.
- `styles.css` is the editable source of truth. Run `npm run build:css` from `nova-builders` after CSS changes to regenerate inline critical CSS and `deferred.css`. `npm run check` also checks that those generated outputs are current.

### Hero video provenance

Canvas settling uses frame identity without a terminal corrective jump. The retained MP4 fallback also settles by source-frame identity rather than exact timestamp equality; seeks target the middle of the frame interval, and only one seek may run at once. Both rendering paths are covered by deterministic tests, not confirmation of perceived browser playback.

The twilight cover fades away during the initial forward scroll. On reverse, it cannot increase its opacity until the actual opening frame is painted and scroll also targets that frame. The MP4 fallback waits for its opening seek to finish instead. This keeps a fast return to the top from covering reverse catch-up with the still image.

The preserved `nova-construction.mp4` is byte-for-byte identical to the supplied original: 1344×768, 24 fps, approximately 12.25 seconds (SHA-256 `9e22851da39ac9eaca20594f562a1f5dc17d536d25c230b8be81d6436db6ada1`). The sequence is extracted directly from that original, not the previously re-encoded scrub derivative: desktop 1344×768, mobile 960×548, both WebP quality 90. WebP compression is lossy; it is not a pixel-identical/lossless copy. No frames were dropped or fabricated.

The fallback `nova-construction-scrub.mp4` was re-encoded earlier with H.264/x264 CRF 22 and a keyframe every two frames, versus the original's CRF 20 and two keyframes across the clip. It retains the same resolution/frame rate but is a lossy derivative optimized for seeking. Neither MP4 was modified by the canvas implementation. The hero uses natural colour with no saturation filter, lighter localized shading for text contrast, and a subtle headline shadow. Full-screen cover cropping/enlargement still affects perceived sharpness. Source imagery, including its existing watermark, is preserved.

### gpt-taste refinement

The existing static site uses the applicable ideas from the project skill, not Sites. The cinematic hero keeps its twilight image, serif headline, lilac accent and two actions; the subsequent canvas upgrade retains the old video controller only as a fallback. A continuous dense project grid leads into wide editorial typography, a clean text-only philosophy heading, a scroll-scrubbed philosophy paragraph and three keyboard/touch-accessible material chapters. The design-principles marquee has a pause control and stops when offscreen or hidden. The blueprint chapter is pinned only on tall desktop layouts where its contents fit; smaller screens and reduced motion retain normal flow. The 3D fitting/rotation logic is unchanged. See `nova-builders/TASTE-REFINEMENT.md` for selections and verification limits.

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
