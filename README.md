# Nova Builders & Developers

A luxury real estate portfolio concept with a scroll-driven construction film, animated architectural blueprint, interactive 3D tower, filterable project collection, and accessible project details.

## Local preview

Use Node.js 20 or later. No dependencies need to be installed.

```powershell
cd nova-builders
npm run dev
```

Open http://127.0.0.1:4173/. The preview is local only. It supports byte ranges for preserved archival media; the page does not use MP4 playback.

```powershell
npm run check
```

The website source is in `nova-builders/dist/`. Pinned GSAP and Lenis files are served locally from `assets/vendor/`. Three.js downloads only when the design studio is within 300 px of the viewport. If Three.js is unavailable, the page remains readable and the 3D stage displays a concept image. Outfit and Cormorant Garamond are served locally as WOFF2 files; their licenses are in `dist/assets/fonts/`. The former Manrope assets are preserved but no longer requested.

### Asset loading

Compression-only baseline: tag checkpoint/live-before-compression-2026-10-16 preserves the previously live commit 9156b9f. This change only compresses the frames; resolution, frame count, playback, opening buffer, scheduling and caching stay at that checkpoint.

- Responsive WebP images replace PNGs throughout the page and project dialogs. The twilight Aurelian poster has a matching responsive preload and remains eagerly loaded. Its 800px option uses quality 72; the other sizes use quality 78. Project cards offer an 800px quality-80 option alongside the existing quality-95 `*-detail-*.webp` sizes. All are generated from the original PNGs. Cards use generous landscape frames, with a full-width featured development and two supporting projects.
- Original PNGs are preserved but are no longer requested by the page. Regenerate the WebP sizes with `python nova-builders/scripts/optimize-images.py` after installing Pillow (`python -m pip install Pillow`). The preview itself still needs no installed dependencies.
- The construction hero uses all 192 source frames from the replacement 8-second, 24 fps clip. A 100 ms eased catch-up loop advances at most one source frame per draw, following scroll progress without skipping intermediate frames or using MP4. Cold playback starts at frame zero even if the visitor scrolls before warm-up; fast scrolling can create a longer catch-up delay. Copy and construction labels follow painted frames. Missing frames pause advancement while keeping the last frame visible. Asynchronous completions cannot paint an obsolete destination.
- The sticky hero spans 600 viewport heights on desktop and 640 on phones. Its requested sequence reaches the final frame at 98.5% of sticky travel, so frames keep advancing until just before the next section. Three short heading/subheading chapters follow actual painted frame progress, reverse with playback, and finish with a link to the project collection. Reduced motion and canvas failure keep the opening text and still poster. Extra space improves pacing but does not lock scrolling or guarantee completion after an arbitrarily fast flick.
- A local hero bootstrap runs before animation libraries and paints frame zero as soon as it can decode after the poster loads, without waiting for scroll or window.load. Main initialization adopts that same controller, buffers and painted frame without duplicate requests. Canvas replaces the poster after its first actual paint and remains visible at frame zero on return. Required-frame errors or unavailable canvas support restore the static poster. Reduced motion also keeps a static poster. No MP4 element, download or seek controller is used by the page.
- Download and decode queues are independent: 4 concurrent downloads (3 low-memory), versus 3 concurrent decodes on desktop and 2 on phones/low-memory devices. The next 8 eased paint steps (6 low-memory) are decoded first, beginning at the displayed timeline position. The rest of the sequence downloads in the background. Compressed blobs are retained within a 24 MiB limit, enough for either complete active sequence. Future larger sets evict outside the immediate decode window without speculative refetch loops. Leaving the hero releases decoded pixels while downloads continue and compressed data stays reusable. Hidden tabs pause new downloads while retaining in-flight results; visibility resumes the queue. Decoded capacity is 12 frames, or 10 low-memory. Desktop downloads 1280×720 frames at WebP quality 65 (17.6 MB); portrait phones download a 512×720 center crop at WebP quality 85 (14.3 MB). Both retain all 192 frames. The previous quality-65 portrait set (9.2 MB) remains archived for comparison. The canvas caps density at 1.5× and 4 million pixels (2 million low-memory).
- Approximate desktop decoded pixel buffers: 44.2 MB cache, or 36.9 MB low-memory, plus up to 11.1 MB transient decodes and 16 MB canvas (8 MB low-memory). The portrait cache and transient decodes use fewer pixels. Compressed frames add 17.6 MB on desktop or 14.3 MB on portrait phones. Browser/decoder/GPU overhead is additional.
- The active sequence totals 17,554,384 bytes (~17.6 MB), 10.3% smaller than quality 75. Normal visits at the hero now download the complete set in the background even without scrolling. Data saver skips speculative warm-up and fetches the immediate playback window on demand. Direct section visits, hidden tabs and reduced motion skip initial speculative warm-up. Previous frame folders are preserved but not requested. Slow connections can still pause while frames arrive.
- To regenerate frames with FFmpeg: `node scripts/build-hero-frames.mjs <path-to-ffmpeg> [desktop|mobile-portrait|mobile-portrait-q85]` from `nova-builders`. Output folders must be empty; the script refuses to overwrite assets. The optional variant regenerates only that folder and preserves the other manifest entries. Active media provenance and counts are recorded in `dist/assets/hero-frames-q65/manifest.json`.
- Model construction and the Three.js download are delayed until the studio approaches the viewport. The fallback stays visible during loading or failure.
- The normal and italic heading fonts are preloaded in the HTML. Cormorant remains the brand font, with `font-display: swap` and a locally available Times fallback whose width/baseline metrics are adjusted to reduce the visual jump. Systems without that local face retain Georgia/serif fallback.
- First-screen styles (including responsive hero/header/mobile-menu rules and font definitions) are inlined. The remaining styles load through `deferred.css` using a non-blocking print-media link that activates on load. Browsers without JavaScript use the complete `styles.css` file. Page interactions initialize after the deferred CSS is available so scroll measurements use the intended layout. Headline motion is a small translation only, never an opacity gate; ScrollTrigger refresh hooks remain intact.
- `styles.css` is the editable source of truth. Run `npm run build:css` from `nova-builders` after CSS changes to regenerate inline critical CSS and `deferred.css`. `npm run check` also checks that those generated outputs are current.

### Hero video provenance

Active replacement (14 October 2026): `nova-construction-v2.mp4` is an unchanged copy of the supplied `Construction_timelapse_of_skyscr…_20261014163442.mp4`, SHA-256 `9ba8c3aa0a6233cc14924a2cbfb91c3a10411e88112054c0783b9de2ed8b1c08`. All 192 native 1280×720 desktop frames are extracted at WebP quality 65, with no frame interpolation or resizing. The portrait phone set crops the middle 512×720 pixels from the same source video without rescaling and uses WebP quality 85. That saves transfer while preserving the pixels phones already showed under center-cover; higher WebP quality reduces compression artifacts but cannot increase detail beyond the source. The archived `nova-construction-v2-scrub.mp4` is a silent H.264 CRF-18 all-intra derivative and is no longer referenced by the page. The twilight poster remains the still fallback. The following original-video details describe preserved archival assets, not the active replacement.

Canvas settling uses frame identity without a terminal corrective jump. Deterministic tests cover canvas playback, static fallback on failure, and absence of video markup or MP4 controller references. They do not confirm perceived browser playback.

The twilight cover is hidden after the first actual canvas paint, including frame zero during warm-up. It stays hidden during forward and reverse canvas playback and returns only on canvas failure. Unsupported browsers and reduced motion retain the still image throughout.

The preserved `nova-construction.mp4` is byte-for-byte identical to the supplied original: 1344×768, 24 fps, approximately 12.25 seconds (SHA-256 `9e22851da39ac9eaca20594f562a1f5dc17d536d25c230b8be81d6436db6ada1`). The sequence is extracted directly from that original, not the previously re-encoded scrub derivative: the active sequence is 1344×768 on every device, with a preserved unused 960×548 mobile variant, both WebP quality 90. WebP compression is lossy; it is not a pixel-identical/lossless copy. No frames were dropped or fabricated. A denser canvas avoids an additional resolution reduction but cannot recover detail absent from the source.

The archived `nova-construction-scrub.mp4` was re-encoded earlier with H.264/x264 CRF 22 and a keyframe every two frames, versus the original's CRF 20 and two keyframes across the clip. It retains the same resolution/frame rate but is a lossy derivative optimized for seeking. Neither MP4 was modified by the canvas implementation. The hero uses natural colour with no saturation filter, lighter localized shading for text contrast, and a subtle headline shadow. Full-screen cover cropping/enlargement still affects perceived sharpness. Source imagery, including its existing watermark, is preserved.

### gpt-taste refinement

The existing static site uses the applicable ideas from the project skill, not Sites. The cinematic hero keeps its twilight image, serif headline, lilac accent and two actions; the hero now uses canvas exclusively with a still image on failure. A continuous dense project grid leads into wide editorial typography, a clean text-only philosophy heading, a scroll-scrubbed philosophy paragraph and three keyboard/touch-accessible material chapters. The design-principles marquee has a pause control and stops when offscreen or hidden. The blueprint chapter is pinned only on tall desktop layouts where its contents fit; smaller screens and reduced motion retain normal flow. The 3D fitting/rotation logic is unchanged. See `nova-builders/TASTE-REFINEMENT.md` for selections and verification limits.

### Scroll-linked text and UI motion

The collection heading, philosophy paragraph, Nova promise and consultation heading now highlight word by word as the visitor scrolls, reversing on the return journey. Light sections move from readable muted stone to the existing charcoal/bronze ink; dark sections move from a muted neutral to the existing ivory. The effect uses an opacity-only duplicate ink layer over readable base text. Duplicate layers are hidden from assistive technology and excluded from text selection; authored spaces, line breaks, italics and paired quotation marks are preserved. No extra fonts, imagery or animation dependencies are introduced, and the hero canvas controller is unchanged by this typography work.

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
