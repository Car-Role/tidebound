// Static file server: '/' -> client/index.html, '/client/*', '/shared/*' only. Never serves outside them.

import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const ALLOWED = ['client', 'shared'];

export const MIME = Object.freeze({
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
});

// Maps a URL path to an absolute file path, or null when it is not servable.
export function resolveStatic(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (p.includes('\0') || p.includes('..') || p.includes('\\')) return null;
  if (p === '/' || p === '/index.html') return join(ROOT, 'client', 'index.html');
  const parts = p.split('/').filter(Boolean);
  if (parts.length < 2 || !ALLOWED.includes(parts[0])) return null;
  const full = normalize(join(ROOT, ...parts));
  if (!ALLOWED.some((d) => full.startsWith(join(ROOT, d) + sep))) return null;
  if (!MIME[extname(full)]) return null;
  return full;
}

export async function handleStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const file = resolveStatic(req.url || '/');
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)],
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}
