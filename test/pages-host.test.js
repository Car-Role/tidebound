// Browser-hosted multiplayer (GitHub Pages): transport adapters, frame splitting, browser save store, module
// manifest, and the rule that nothing on the browser path imports node:* or ws.

import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, eq } from './assert.js';
import { createHarness } from './harness.js';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
import { content } from '../shared/data/index.js';
import { Game } from '../server/game/game.js';
import { attachSocket, createLoopbackPair, peerSocket, wsSocket } from '../server/net/transport.js';
import { packFrames, FrameAssembler } from '../shared/frames.js';
import { createBrowserStore } from '../server/persistence/browser-store.js';
import { setSaveStore, saveToDisk, loadSave, backupPath, getSaveStore } from '../server/persistence/save.js';
import { WILDCARD_FILES } from '../server/game/modules.manifest.js';
import { scanWildcards } from '../scripts/gen-module-manifest.js';
import { toBase64, toBase64Browser } from '../server/game/realm.js';
import { resolveStatic, handleStatic } from '../server/http-static.js';
import { NetClient } from '../client/net/client.js';
import { normalizeRoomCode, isRoomCode, randomRoomCode } from '../client/net/peer-client.js';
import { DATA_FILES } from '../shared/data/index.js';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const tick = () => new Promise((r) => setTimeout(r, 0));
const hello = (i = 0) => JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token: `pages-test-${i}`, name: `Peer${i}`, color: i });

async function newGame(seed = 5) {
  const game = new Game({ seed, content });
  await game.init(null);
  return game;
}

// A PeerJS DataConnection stand-in: two of them linked back to back.
class FakeDC extends EventEmitter {
  constructor() { super(); this.open = true; this.sent = []; this.other = null; this.closed = false; }
  send(d) { if (this.closed) throw new Error('closed'); this.sent.push(d); const o = this.other; if (o) queueMicrotask(() => o.emit('data', d)); }
  close() { if (this.closed) return; this.closed = true; this.open = false; this.emit('close'); if (this.other && !this.other.closed) { this.other.closed = true; this.other.emit('close'); } }
}

class MemStorage {
  constructor(limit = Infinity) { this.m = new Map(); this.limit = limit; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    const used = [...this.m.entries()].reduce((n, [a, b]) => n + (a === k ? 0 : a.length + b.length), 0);
    if (used + k.length + String(v).length > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
}
class MemKv {
  constructor() { this.m = new Map(); this.puts = 0; }
  async getAll() { return [...this.m.entries()]; }
  async put(k, v) { this.puts++; this.m.set(k, structuredClone(v)); }
  async delete(k) { this.m.delete(k); }
}

export default async function (t) {
  // ------------------------------------------------------------ frames

  t.test('frames: small messages pass through, large ones split and reassemble (surrogates kept whole)', () => {
    eq(packFrames('{"t":"x"}', 100), ['{"t":"x"}']);
    const big = JSON.stringify({ t: 'chat', text: 'a\u{1F30A}b'.repeat(4000) + 'x'.repeat(50001) });
    const parts = packFrames(big, 1000);
    ok(parts.length > 10 && parts.every((p) => p.startsWith('~')), 'split into frames');
    for (const p of parts) {
      const body = p.slice(p.indexOf('|') + 1);
      const last = body.charCodeAt(body.length - 1);
      ok(!(last >= 0xd800 && last <= 0xdbff), 'no frame ends on a high surrogate');
    }
    const asm = new FrameAssembler();
    let out = null;
    for (const p of parts) out = asm.push(p) ?? out;
    eq(out, big);
    // a stray frame does not poison the next message
    eq(asm.push(parts[3]), null);
    eq(asm.push('{"t":"ping"}'), '{"t":"ping"}');
  });

  // ------------------------------------------------------------ loopback

  t.test('loopback: the in-tab host player joins through attachSocket and is the host', async () => {
    const game = await newGame();
    const { server, client } = createLoopbackPair();
    const conn = attachSocket(game, server, { remoteAddress: 'loopback', loopback: true });
    const got = [];
    client.onmessage = (ev) => { eq(typeof ev.data, 'string'); got.push(JSON.parse(ev.data)); };
    let opened = false;
    client.onopen = () => { opened = true; };
    await tick();
    ok(opened, 'opened asynchronously');
    client.send(hello(0));
    await tick();
    const w = got.find((m) => m.t === 'welcome');
    ok(w, 'welcome received');
    ok(conn.player && conn.loopback, 'joined as loopback');
    eq(game.call('isHost', conn.player), true, 'loopback player is the host');
    game.tick();
    await tick();
    ok(got.some((m) => m.t === 'snap') && got.some((m) => m.t === 'chunk'), 'snapshots and chunks flow');
    let closed = null;
    client.onclose = (ev) => { closed = ev; };
    client.close();
    await tick();
    ok(closed, 'client onclose fired');
    eq(game.players.size, 0, 'player left the game on close');
  });

  t.test('NetClient runs unchanged over the loopback socket (welcome, snap, do/res, no reconnect)', async () => {
    const game = await newGame(6);
    const { server, client } = createLoopbackPair();
    attachSocket(game, server, { remoteAddress: 'loopback', loopback: true });
    const net = new NetClient(() => client, { reconnect: false });
    const seen = { welcome: 0, snap: 0 };
    net.on('welcome', () => seen.welcome++).on('snap', () => seen.snap++);
    net.connect({ token: 'pages-net-0', name: 'Hosty', color: 2 });
    await tick(); await tick();
    eq(seen.welcome, 1);
    game.tick(); game.tick();
    await tick();
    ok(seen.snap >= 2, 'snapshots');
    const res = await Promise.race([net.do('inv.sort', {}), new Promise((r) => setTimeout(() => r('timeout'), 500))]);
    ok(res !== 'timeout' && res.t === 'res', 'do resolves with res');
    let closeCalls = 0;
    net.on('close', () => closeCalls++);
    client.close();
    await tick(); await tick();
    eq(closeCalls, 1);
    eq(net.connected, false);
    clearInterval(net.pingTimer);
    eq(game.players.size, 0);
  });

  // ------------------------------------------------------------ PeerJS adapter

  t.test('peerSocket: a joiner over a data channel is not host; large messages are framed; close leaves', async () => {
    const game = await newGame(7);
    const hostEnd = new FakeDC(), joinEnd = new FakeDC();
    hostEnd.other = joinEnd; joinEnd.other = hostEnd;
    const sock = peerSocket(hostEnd, { frameBytes: 2000 });
    const conn = attachSocket(game, sock, { remoteAddress: 'peer:abc', loopback: false });
    const asm = new FrameAssembler();
    const got = [];
    joinEnd.on('data', (d) => { const whole = asm.push(d); if (whole !== null) got.push(JSON.parse(whole)); });
    joinEnd.send(hello(1));
    await tick(); await tick();
    const w = got.find((m) => m.t === 'welcome');
    ok(w, 'welcome reassembled from frames');
    ok(hostEnd.sent.some((d) => d.startsWith('~')), 'the welcome was split into frames');
    ok(conn.player, 'joined');
    eq(game.call('isHost', conn.player), false, 'a peer is not the host');
    // binary data is ignored like a binary WebSocket frame
    joinEnd.send(new Uint8Array([1, 2, 3]));
    await tick();
    eq(game.players.size, 1);
    joinEnd.close();
    await tick();
    eq(game.players.size, 0, 'channel close removes the player');
    eq(sock.readyState, 3);
  });

  t.test('peerSocket: an idle peer is dropped; send after close is a no-op', async () => {
    const game = await newGame(8);
    const dc = new FakeDC();
    const sock = peerSocket(dc, { idleMs: 30 });
    attachSocket(game, sock, { remoteAddress: 'peer:idle' });
    dc.emit('data', hello(2));
    await tick();
    eq(game.players.size, 1);
    await new Promise((r) => setTimeout(r, 120));
    eq(game.players.size, 0, 'idle peer removed');
    ok(dc.closed, 'channel closed');
    sock.send('{"t":"x"}');
  });

  t.test('wsSocket: the Node WebSocket path goes through the same adapter', async () => {
    const game = await newGame(9);
    const ws = new EventEmitter();
    ws.readyState = 1; ws.out = [];
    ws.send = (s) => ws.out.push(JSON.parse(s));
    ws.close = () => { ws.readyState = 3; ws.emit('close'); };
    const conn = attachSocket(game, wsSocket(ws), { remoteAddress: '10.0.0.9' });
    ws.emit('message', Buffer.from(hello(3)), false);
    ok(ws.out.some((m) => m.t === 'welcome'));
    eq(conn.loopback, false);
    ws.emit('message', Buffer.from('not json'), false);
    ws.emit('error', new Error('x'));
    ws.emit('close');
    eq(game.players.size, 0);
  });

  t.test('room codes: normalised, validated, random codes valid', () => {
    eq(normalizeRoomCode(' k7q-m2x '), 'K7QM2X');
    eq(isRoomCode('K7QM2X'), true);
    eq(isRoomCode('K7QM2'), false);
    eq(isRoomCode('K7QM20'), false, 'no zero in the alphabet');
    for (let i = 0; i < 50; i++) ok(isRoomCode(randomRoomCode()));
  });

  // ------------------------------------------------------------ browser save store

  t.test('browser store: save.js API round trip through IndexedDB-style storage', async () => {
    const kv = new MemKv(), ls = new MemStorage();
    const store = await createBrowserStore({ kv, localStorage: ls });
    eq(store.kind, 'indexeddb');
    const prev = setSaveStore(store);
    try {
      const h = await createHarness({ seed: 31 });
      h.addPlayer({ name: 'Saver' });
      h.step?.(2);
      const data = h.game.serialize();
      const path = 'tidebound/world.json';
      eq(loadSave(path), null, 'nothing saved yet');
      await saveToDisk(path, data, { game: h.game });
      ok(kv.m.has(path), 'written to IndexedDB');
      eq(ls.length, 0, 'async saves do not use localStorage');
      const back = loadSave(path);
      eq(back.seed, data.seed);
      eq(JSON.stringify(back.world.plots), JSON.stringify(data.world.plots));
      // a reopened store (next page load) sees the same save
      const store2 = await createBrowserStore({ kv, localStorage: ls });
      setSaveStore(store2);
      eq(loadSave(path).seed, data.seed);
      // and a Game restores from it
      const g2 = new Game({ content });
      await g2.init(loadSave(path));
      eq(g2.seed, data.seed);
    } finally { setSaveStore(prev); }
  });

  t.test('browser store: the pagehide (sync) save survives even when IndexedDB never finishes', async () => {
    const kv = new MemKv(), ls = new MemStorage();
    const store = await createBrowserStore({ kv, localStorage: ls });
    await store.write('w.json', '{"v":1}');
    // IndexedDB that hangs forever, as if the tab died mid-transaction
    const hung = { getAll: kv.getAll.bind(kv), put: () => new Promise(() => {}), delete: async () => {} };
    const s2 = await createBrowserStore({ kv: hung, localStorage: ls });
    s2.writeSync('w.json', '{"v":2}');
    ok(ls.getItem('tb.save.w.json'), 'synchronous copy in localStorage');
    const s3 = await createBrowserStore({ kv, localStorage: ls });
    eq(s3.readSync('w.json'), '{"v":2}', 'newer localStorage copy wins on load');
    await s3.flush();
    eq(JSON.parse(kv.m.get('w.json').text).v, 2, 'and is moved into IndexedDB');
    eq(ls.getItem('tb.save.w.json'), null, 'then dropped from localStorage');
    // a stale localStorage copy (older than IndexedDB) is ignored and removed
    ls.setItem('tb.save.w.json', JSON.stringify({ text: '{"v":0}', at: 1 }));
    const s4 = await createBrowserStore({ kv, localStorage: ls });
    eq(s4.readSync('w.json'), '{"v":2}');
    eq(ls.getItem('tb.save.w.json'), null);
  });

  t.test('browser store: rotating backups and fallback to the newest readable backup', async () => {
    const kv = new MemKv(), ls = new MemStorage();
    const store = await createBrowserStore({ kv, localStorage: ls });
    const prev = setSaveStore(store);
    try {
      const path = 'tidebound/bk.json';
      const game = { now: 0, lastBackupAt: undefined };
      await saveToDisk(path, { seed: 1, n: 1 }, { game });
      game.now = 10000;
      await saveToDisk(path, { seed: 1, n: 2 }, { game });
      game.now = 20000;
      await saveToDisk(path, { seed: 1, n: 3 }, { game });
      await store.flush();
      eq(JSON.parse(store.readSync(backupPath(path, 1))).n, 2);
      eq(JSON.parse(store.readSync(backupPath(path, 2))).n, 1);
      ok(kv.m.has(backupPath(path, 2)), 'backups persisted');
      await store.write(path, '{ broken');
      const old = console.warn; console.warn = () => {};
      const oldE = console.error; console.error = () => {};
      try { eq(loadSave(path).n, 2, 'falls back to .bak1'); } finally { console.warn = old; console.error = oldE; }
    } finally { setSaveStore(prev); }
  });

  t.test('browser store: localStorage-only fallback, and a full localStorage is reported not thrown', async () => {
    const ls = new MemStorage(200);
    const quiet = { warn: () => {} };
    const store = await createBrowserStore({ indexedDB: null, localStorage: ls, log: quiet });
    eq(store.kind, 'localStorage');
    await store.write('a.json', '{"x":1}');
    eq((await createBrowserStore({ indexedDB: null, localStorage: ls, log: quiet })).readSync('a.json'), '{"x":1}');
    let rejected = false;
    try { await store.write('a.json', 'y'.repeat(500)); } catch { rejected = true; }
    ok(rejected, 'async write rejects when it does not fit');
    store.writeSync('a.json', 'z'.repeat(500));          // must not throw (pagehide)
    eq((await createBrowserStore({ indexedDB: null, localStorage: ls, log: quiet })).readSync('a.json'), '{"x":1}', 'last stored copy kept');
  });

  t.test('save.js keeps the Node file store by default', () => {
    eq(getSaveStore()?.kind, 'fs');
  });

  // ------------------------------------------------------------ browser path hygiene

  t.test('module manifest matches the wildcard folders (run npm run manifest after adding a file)', () => {
    eq(JSON.stringify(WILDCARD_FILES), JSON.stringify(scanWildcards()));
  });

  t.test('chunk base64 encoder matches Buffer for the browser branch', () => {
    for (const n of [0, 1, 400, 70000]) {
      const u8 = new Uint8Array(n).map((_, i) => (i * 37) & 255);
      eq(toBase64Browser(u8), Buffer.from(u8).toString('base64'), `length ${n}`);
      eq(toBase64(u8), toBase64Browser(u8));
    }
  });

  t.test('nothing the browser loads imports node:* or ws (client + browser host import graph)', () => {
    const NODE_ONLY = new Set(['server/persistence/fs-store.js']);      // reached only under Node (save.js IS_NODE)
    const seen = new Set();
    const bad = [];
    const queue = ['client/main.js', 'client/net/host.js'];
    const add = (from, spec) => {
      if (!spec.startsWith('.')) { bad.push(`${from} -> ${spec}`); return; }
      const p = relative(ROOT, normalize(join(ROOT, dirname(from), spec))).split(sep).join('/');
      if (p.startsWith('..')) { bad.push(`${from} -> ${spec} (outside the repo)`); return; }
      if (!NODE_ONLY.has(p)) queue.push(p);
    };
    while (queue.length) {
      const f = queue.shift();
      if (seen.has(f)) continue;
      seen.add(f);
      ok(existsSync(join(ROOT, f)), `missing module ${f}`);
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) add(f, m[1]);
      for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) add(f, m[1]);
      for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) add(f, m[1]);
      // template-literal imports: loader.js (manifest) and shared/data/index.js (DATA_FILES)
      if (f === 'server/game/loader.js') for (const [key, files] of Object.entries(WILDCARD_FILES)) for (const x of files) add(f, `./${{ ai: 'ai', bosses: 'bosses', abilities: 'abilities', keepers: 'dungeon/keepers', rooms: 'dungeon' }[key]}/${x}`);
      if (f === 'shared/data/index.js') for (const n of [...DATA_FILES, 'registries', 'schema']) if (existsSync(join(ROOT, 'shared/data', n + '.js'))) add(f, `./${n}.js`);
    }
    eq(bad, [], 'bare or node: imports on the browser path');
    ok(seen.has('server/game/game.js') && seen.has('server/net/transport.js') && seen.has('server/game/ai/charger.js'), 'graph covers the server sim');
    // and the browser path never names an absolute URL
    for (const f of seen) if (f.startsWith('client/')) ok(!/(?:from\s+|import\()\s*['"]\//.test(readFileSync(join(ROOT, f), 'utf8')), `absolute import in ${f}`);
  });

  t.test('page HTML and CSS use relative URLs (GitHub Pages sub-path)', () => {
    for (const f of ['index.html', 'client/index.html', 'client/style.css']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      ok(!/(?:href|src)\s*=\s*["']\/(?!\/)/.test(src) && !/url\(\s*['"]?\/(?!\/)/.test(src), `absolute URL in ${f}`);
    }
    ok(existsSync(join(ROOT, '.nojekyll')), '.nojekyll present');
  });

  t.test('Node static server: / redirects to /client/, server-info.json marks the WebSocket server', async () => {
    ok(resolveStatic('/client/').endsWith('index.html'));
    const call = async (url) => {
      const res = { code: 0, headers: null, body: '', writeHead(c, h) { this.code = c; this.headers = h; return this; }, end(b) { this.body = b ? String(b) : ''; return this; } };
      await handleStatic({ method: 'GET', url }, res);
      return res;
    };
    const r1 = await call('/');
    eq(r1.code, 302); eq(r1.headers.Location, '/client/');
    eq((await call('/?net=p2p')).headers.Location, '/client/?net=p2p');
    const r2 = await call('/client/server-info.json');
    eq(r2.code, 200); eq(JSON.parse(r2.body).ws, true);
    eq((await call('/server/game/game.js')).code, 404, 'server code is not served by the Node server');
  });
}
