# Nova: gpt-taste refinement

Applied to the existing local HTML/CSS/GSAP project on 11 October 2026. No Sites migration, hosting change or automatic push.

## Design selection

The task phrase has 86 characters. A Python `random.Random(86)` selection produced:

- Cinematic Center hero; Outfit supporting typography.
- Typographic marquee, inline typography image, horizontal accordion.
- Scrubbing text reveal and pinned split chapter.

The component pool excludes testimonials because this is a fictional brand, and the motion pool excludes stacked cards because this project needs separate, non-overlapping studies. The requested original hero image, Cormorant headline and headline colours take precedence over replacing the brand display font. Outfit is used for supporting type only.

## Implementation

- Attention: minimal split navigation, centred two-line headline, two high-contrast actions. Mobile sizing removes the previous narrow heading widths.
- Interest: dense two-column project grid with no gaps between cells. Full collection spans are `[2, 1, 1]`; residential filter `[1, 1]`; mixed-use filter `[2]`. No empty final cell.
- Desire: a clean text-only philosophy heading, sequential word-opacity scrub, a restrained principles marquee and expandable material images. The initially selected inline image was removed at the user's request; this visual treatment should not be reintroduced. Existing contextual WebP assets are reused instead of random stock photos.
- Action: a spacious contrasting consultation chapter and clear links back to the collection. The form still creates a local draft only.
- The material accordion supports click, keyboard focus, wrapping arrow navigation, Home and End. Touch does not trigger incidental hover changes. Without GSAP it remains interactive; without JavaScript all three descriptions remain visible.
- Marquee motion pauses offscreen, in hidden tabs and on user request. Reduced motion removes the moving text and word-opacity effects. Media-query cleanup removes added listeners and restores the unsplit paragraph.
- Pinning requires width at least 1101 px, height at least 900 px, no reduced-motion preference and sufficient room for the pinned panel. Its end is computed from the actual steps/panel height difference. The blueprint drawing and 3D model remain separate.
- No changes to the video bytes, scrubbing scheduler, reverse-cover protection, model rotation pivot or camera-fit calculations. Only the construction-phase labels lose their numbering.

## Font provenance

Outfit Latin variable WOFF2 (32,292 bytes) is self-hosted with its OFL licence. Source stylesheet: `https://fonts.googleapis.com/css2?family=Outfit:wght@400..700&display=swap`; binary: `https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2`; licence: `https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt`. No Google Fonts requests are used at runtime. Existing Cormorant preloads and font-display settings are preserved.

## Verification

Following the separate canvas-hero upgrade, 60 deterministic/static/HTTP checks pass, including original video reversal tests, bounded image-cache lifecycle and stale-decode checks, retained pixels on resize, canvas/poster integration, material controls, marquee pause/cleanup, pinning guards, grid cell coverage, local assets/IDs, font signature and responsive CSS fidelity. Generated CSS is current: critical 3,892 bytes gzip and deferred 5,769 bytes gzip. JavaScript syntax and `git diff --check` pass.

No accessible local browser tab was available for screenshot or actual playback inspection. These checks do not establish perceptual smoothness or replace a real desktop/mobile visual review. The HTTP preview suite has now been rerun successfully, including delivery of the canvas script and first/last desktop/mobile frame assets.
