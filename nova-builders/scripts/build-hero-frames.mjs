import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generated media only; never rewrite either preserved MP4.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/assets');
const executable = process.argv[2] || 'ffmpeg';
const source = 'nova-construction-v2.mp4';
const sequenceFolder = 'hero-frames-q65';
const variants = [
  { name: 'desktop', width: 1280, height: 720, quality: 65, filter: 'scale=1280:720' },
  { name: 'mobile-portrait', width: 512, height: 720, quality: 65, filter: 'crop=512:720:384:0' },
  { name: 'mobile-portrait-q85', width: 512, height: 720, quality: 85, filter: 'crop=512:720:384:0' }
];
const selected = process.argv[3] ? variants.filter(variant => variant.name === process.argv[3]) : variants;
if (!selected.length) throw new Error(`Unknown variant: ${process.argv[3]}`);
const counts = [];
for (const variant of selected) {
  const output = resolve(root, sequenceFolder, variant.name);
  await mkdir(output, { recursive: true });
  // Refuse an existing output rather than silently overwrite generated files.
  if ((await readdir(output)).length) throw new Error(`Output is not empty: ${output}`);
  await new Promise((accept, reject) => {
    const args = ['-hide_banner', '-nostdin', '-n', '-i', resolve(root, source),
      '-map', '0:v:0', '-an', '-vf', variant.filter,
      '-fps_mode', 'passthrough', '-c:v', 'libwebp', '-quality', String(variant.quality),
      '-compression_level', '5', '-start_number', '0', resolve(output, 'frame-%03d.webp')];
    const process = spawn(executable, args, { stdio: 'inherit' });
    process.on('error', reject);
    process.on('exit', code => code === 0 ? accept() : reject(new Error(`FFmpeg exited ${code}`)));
  });
  const files = (await readdir(output)).filter(name => /^frame-\d{3}\.webp$/.test(name)).sort();
  files.forEach((file, index) => {
    if (file !== `frame-${String(index).padStart(3, '0')}.webp`) throw new Error('Missing sequence frame');
  });
  counts.push(files.length);
  variant.bytes = (await Promise.all(files.map(async file => (await stat(resolve(output, file))).size))).reduce((a, b) => a + b, 0);
}
if (counts.some(count => count !== 192)) throw new Error(`Unexpected frame counts: ${counts}`);
const manifestPath = resolve(root, sequenceFolder, 'manifest.json');
const previous = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
const combined = variants.filter(variant => selected.some(item => item.name === variant.name) || previous?.variants.some(item => item.name === variant.name))
  .map(({ filter, ...variant }) => selected.some(item => item.name === variant.name)
    ? variant : previous.variants.find(item => item.name === variant.name));
await writeFile(manifestPath, JSON.stringify({
  source, frameCount: counts[0], fps: 24,
  variants: combined,
  note: 'Desktop uses native 1280x720 frames at WebP quality 65. Mobile portrait frames crop the original 512x720 center without resizing. Quality 65 is archived; quality 85 is active. Original MP4s are preserved.'
}, null, 2) + '\n');
console.log('Hero sequence generated:', selected);
