// Entry point: args, content, world load, HTTP + WebSocket on one port, LAN URL print, graceful shutdown save.
// Usage: node server/main.js [--port N] [--world NAME] [--persist] [--admin TOKEN] [--seed N] [--verbose]

import http from 'node:http';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, MAX_MSG_BYTES } from '../shared/config.js';
import { content, validateContent } from '../shared/data/index.js';
import { Game } from './game/game.js';
import { handleStatic, ROOT } from './http-static.js';
import { Connection, startHeartbeat } from './net/connection.js';
import { routeMessage } from './net/router.js';
import { loadSave } from './persistence/save.js';

export function parseArgs(argv) {
  const out = { port: DEFAULT_PORT, world: 'world', persist: false, admin: null, seed: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--world') out.world = String(argv[++i] || 'world');
    else if (a === '--persist') out.persist = true;
    else if (a === '--admin') out.admin = String(argv[++i] || '');
    else if (a === '--seed') out.seed = Number(argv[++i]) >>> 0;
    else if (a === '--verbose') out.verbose = true;
  }
  out.world = out.world.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'world';
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) out.port = DEFAULT_PORT;
  return out;
}

function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${port}`);
  }
  return urls;
}

export async function startServer(args) {
  if (args.verbose) process.env.TB_VERBOSE = '1';
  const errors = await validateContent(content);
  if (errors.length) {
    console.warn(`[tb:data] ${errors.length} content validation error(s):`);
    for (const e of errors.slice(0, 20)) console.warn('  -', e);
  }
  if (content.placeholders.length) console.warn(`[tb:data] using placeholders for: ${content.placeholders.join(', ')}`);

  const savePath = join(ROOT, 'saves', `${args.world}.json`);
  const saveData = loadSave(savePath);
  const game = new Game({
    content, seed: args.seed ?? undefined, worldName: args.world, savePath,
    persist: args.persist, adminToken: args.admin, verbose: args.verbose,
  });
  await game.init(saveData);
  console.log(`[tb:main] world '${args.world}' ${saveData ? 'loaded' : 'created'} (seed ${game.seed})`);

  const server = http.createServer((req, res) => {
    handleStatic(req, res).catch(() => { try { res.writeHead(500).end(); } catch { /* closed */ } });
  });
  const wss = new WebSocketServer({ server, maxPayload: MAX_MSG_BYTES });
  const stopHeartbeat = startHeartbeat(wss);

  wss.on('connection', (ws, req) => {
    const conn = new Connection(ws, req.socket.remoteAddress);
    ws.conn = conn;
    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (raw, isBinary) => {
      conn.alive = true;
      const msg = conn.parse(raw, isBinary);
      if (!msg) return;
      try { routeMessage(game, conn, msg); } catch (err) { console.error('[tb:net] route error:', err); }
    });
    ws.on('close', () => {
      conn.closed = true;
      if (conn.player) game.leave(conn.player);
    });
    ws.on('error', () => {});
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, () => { server.off('error', reject); resolve(); });
  });
  game.start();

  console.log(`[tb:main] Tidebound running on http://localhost:${args.port}`);
  for (const u of lanUrls(args.port)) console.log(`[tb:main]   friends on your network: ${u}`);

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[tb:main] ${signal}: saving and shutting down`);
    game.stop();
    try { await game.saving; game.save({ sync: true }); } catch (err) { console.error('[tb:save] shutdown save failed:', err); }
    for (const p of game.players.values()) p.conn?.send({ t: 'kicked', reason: 'shutdown' });
    stopHeartbeat();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close();
    process.exit(0);
  };
  return { game, server, wss, shutdown };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  startServer(args).then(({ shutdown }) => {
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    if (process.platform === 'win32') process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }).catch((err) => {
    if (err?.code === 'EADDRINUSE') console.error(`[tb:main] port ${args.port} is already in use; try --port N`);
    else console.error('[tb:main] failed to start:', err);
    process.exit(1);
  });
}
