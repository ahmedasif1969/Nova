import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generated media only; never rewrite either preserved MP4.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/assets');
const executable = process.argv[2] || 'ffmpeg';
const source = 'nova-construction-v2.mp4';
const sequenceFolder = 'hero-frames-v3';
const variants = [
  { name: 'desktop', width: 1280, height: 720, quality: 75 }
];
const counts = [];
for (const variant of variants) {
  const output = resolve(root, sequenceFolder, variant.name);
  await mkdir(output, { recursive: true });
  // Refuse an existing output rather than silently overwrite generated files.
  if ((await readdir(output)).length) throw new Error(`Output is not empty: ${output}`);
  await new Promise((accept, reject) => {
    const args = ['-hide_banner', '-nostdin', '-n', '-i', resolve(root, source),
      '-map', '0:v:0', '-an', '-vf', `scale=${variant.width}:${variant.height}`,
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
if (counts[0] !== 192) throw new Error(`Unexpected frame counts: ${counts}`);
await writeFile(resolve(root, sequenceFolder, 'manifest.json'), JSON.stringify({
  source, frameCount: counts[0], fps: 24,
  variants, note: 'All source frames at native resolution, lossy WebP quality 75. Original MP4s and quality-90 v2 frames preserved.'
}, null, 2) + '\n');
console.log('Hero sequence generated:', variants);
