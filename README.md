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

- Responsive WebP images replace PNGs throughout the page and project dialogs. The hero has a matching responsive preload and remains eagerly loaded.
- Original PNGs are preserved but are no longer requested by the page. Regenerate the WebP sizes with `python nova-builders/scripts/optimize-images.py` after installing Pillow (`python -m pip install Pillow`). The preview itself still needs no installed dependencies.
- The construction video's source is attached only after scrolling inside the hero. A direct jump to a later section, a reduced-motion preference, or a media error retains the static image without an initial video download.
- Model construction and the Three.js download are delayed until the studio approaches the viewport. The fallback stays visible during loading or failure.

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

No public hosting or deployment is configured.
