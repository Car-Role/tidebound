// Static file server: '/' redirects to /client/ (client/index.html), '/client/*', '/shared/*' only. Never serves
// outside them; /server/* is not served (the Node-served page connects by WebSocket, it never hosts in-tab).

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
  if (p === '/' || p === '/index.html' || p === '/client/') return join(ROOT, 'client', 'index.html');
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
  const path = (req.url || '/').split('?')[0].split('#')[0];
  // The client uses relative URLs (so it also works under a GitHub Pages sub-path): serve it from /client/.
  if (path === '/' || path === '/index.html' || path === '/client') {
    res.writeHead(302, { Location: '/client/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }).end();
    return;
  }
  // Tells the client it is served by the Node server (title screen: direct WebSocket connect). On a static
  // host (GitHub Pages) this file does not exist, and the client offers browser Host / Join instead.
  if (path === '/client/server-info.json') {
    const body = JSON.stringify({ server: 'tidebound-node', ws: true });
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' }).end(req.method === 'HEAD' ? undefined : body);
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
