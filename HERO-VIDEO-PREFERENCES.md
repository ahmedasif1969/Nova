# Scroll hero pipeline for future projects

- **Canvas + WebP frames:** use an image sequence for scroll playback. No MP4 playback or seeking, including fallbacks.
- **Start loading on page entry:** once the opening poster is ready, fetch, decode, and paint frame zero immediately. Do not wait for scrolling. Keep the poster visible until the first canvas frame is painted.
- **Download the whole sequence:** continue fetching all frames for the selected device variant in the background, with 3–4 parallel requests. Prioritize frames needed for playback. Do not download both desktop and phone sets on a normal visit.
- **Buffer before revealing:** show a full-screen opening loader with actual frame readiness progress and a Skip intro button. Reveal once a useful opening buffer is downloaded and decoded, then keep downloading the rest. Skip, errors, or a safety timeout must release the page; never fake progress.
- **Keep downloaded frames:** retain compressed frame data within a reasonable memory budget so reverse scrolling does not repeatedly download it. Do not cancel the entire preload when the hero briefly leaves view. Release decoded images when needed; pause new requests while the tab is hidden. Respect data saver and reduced motion.
- **Decode ahead:** prepare the next 6–8 frames in the playback direction, starting from the displayed frame. Use up to 3 concurrent decodes on desktop and 2 on phones or low-memory devices.
- **Show every frame:** play consecutive frames forward and backward. No adaptive skipping. Hold the last image if the next frame is unavailable. Fast scrolling can create catch-up delay; allow enough scroll distance without a long idle stretch at the end.
- **Preserve sharpness:** optimize compression before lowering image dimensions. Explain changes to compression, downloaded resolution, or canvas resolution. Start with a 1.5× canvas density cap and adjust only after comparing sharpness and smoothness.
- **Support both screen shapes:** choose suitable desktop and phone frame sets. Phone crops should remove hidden sides without shrinking the remaining source pixels unnecessarily.
- **Link text to playback:** headings, subheadings, and progress indicators follow the frame actually displayed and reverse when scrolling back.
- **Use a still fallback:** show the poster for reduced motion or canvas failure.

Keep frame counts, dimensions, compression levels, and cache budgets appropriate to each project. Check fresh loading, forward/reverse playback, fast scrolling, and phone rotation before publishing.
