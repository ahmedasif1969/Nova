import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(filePath), 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

// Byte-range support lets the browser seek the construction video without
// downloading it again. This preview binds to loopback only.
export function createPreviewServer(root = defaultRoot) {
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const path = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      const localPath = relative(root, path);
      if (localPath.startsWith('..') || isAbsolute(localPath) || !types[extname(path)]) {
        response.writeHead(404).end();
        return;
      }
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const headers = { 'Content-Type': types[extname(path)], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
      let start = 0;
      let end = info.size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }).end(); return;
        }
        if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
        else {
          start = Number(range[1]);
          if (range[2]) end = Math.min(end, Number(range[2]));
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }).end(); return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = String(info.size === 0 ? 0 : end - start + 1);
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || info.size === 0) { response.end(); return; }
      const stream = createReadStream(path, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === filePath) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createPreviewServer();
  server.on('error', error => { console.error(`Preview could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Nova local preview: http://127.0.0.1:${port}/`));
}
