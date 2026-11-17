// Boot: sprites -> audio unlock -> title -> connect -> loop. Also the gameplay controller:
// fixed 50 ms input steps (sent and predicted identically), primary swing / interact, server message routing.

import { content } from '../shared/data/index.js';
import { INPUT_STEP_MS, POS_QUANT, REACH } from '../shared/config.js';
import { BUTTON } from '../shared/protocol.js';
import spriteDefs from './art/sprites/index.js';
import { SpriteBank } from './art/spritegen.js';
import { TileSet } from './art/tilegen.js';
import { Store } from './state/store.js';
import { Input } from './input/input.js';
import { NetClient, acquireToken } from './net/client.js';
import { Prediction } from './net/prediction.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/ui.js';
import * as particles from './fx/particles.js';
import juice from './fx/juice.js';
import presets from './fx/presets.js';
import router from './fx/router.js';
import audio from './audio/audio.js';

const BASE_SWING_RATE = 2.0;     // gathering swings per second (server gathering.js), times (1 + swingSpeed)
const FIST_RATE = 2.0;           // unarmed attack rate (server combat.js FIST)
const RATE_SLACK = 0.02;         // s added per swing so a held button never runs ahead of the server cooldown
const REVIVE_RESEND_S = 0.35;    // the server keeps a revive channel alive for 0.6 s per request
const MAX_INPUT_BACKLOG_MS = 250;

// 'ws' when the page is served by the Node server (direct WebSocket), 'p2p' on a static host such as GitHub Pages
// (browser Host / Join). ?net=ws or ?net=p2p overrides.
async function detectNetMode() {
  const forced = new URLSearchParams(location.search).get('net');
  if (forced === 'ws' || forced === 'p2p') return forced;
  try {
    const r = await fetch('server-info.json', { cache: 'no-store' });
    if (r.ok && (await r.json())?.ws) return 'ws';
  } catch { /* static host */ }
  return 'p2p';
}

function takeNotice() {
  try { const n = sessionStorage.getItem('tb.notice'); sessionStorage.removeItem('tb.notice'); return n; } catch { return null; }
}

// Back to the title with a message (host left, room not found...): the title shows it on the next load.
function backToTitle(renderer, text, delayMs = 2500) {
  renderer.status = text + '  Returning to the title...';
  try { sessionStorage.setItem('tb.notice', text); } catch { /* ignore */ }
  setTimeout(() => location.reload(), delayMs);
}

function loadProfile(token) {
  let name = null, color = null;
  try { name = localStorage.getItem('tb.name.' + token); color = Number(localStorage.getItem('tb.color.' + token)); } catch { /* ignore */ }
  if (!name) name = 'Castaway ' + token.slice(0, 3).toUpperCase();
  if (!Number.isInteger(color) || color < 0 || color > 7) color = parseInt(token.slice(0, 2), 16) % 8 || 0;
  return { name, color };
}

async function boot() {
  const canvas = document.getElementById('game');
  canvas.focus();

  // sprites
  const sprites = new SpriteBank().build(spriteDefs);
  particles.setSpriteBank(sprites);
  for (const [name, p] of Object.entries(presets)) particles.define(name, p);
  const tileset = new TileSet(7).build();

  const store = new Store();
  const input = new Input(window, canvas);
  const camera = new Camera();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const prediction = new Prediction({ isWalkable: (x, y) => store.isWalkable(x, y), groundAt: (x, y) => store.groundAt(x, y) });
  const ui = new UI({ input, store, net: null, sprites, audio });
  const renderer = new Renderer(canvas, { store, sprites, tileset, camera, ui, content });
  renderer.resize();
  addEventListener('resize', () => renderer.resize());

  // audio unlock on the first gesture
  const unlock = () => { audio.unlock(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // main loop (started before the title so the panel manager draws the title screen itself, BUILD_REVIEW P2-14)
  let net = null, awaitingSpawn = true, stepInput = null, actions = null, inputAcc = 0;
  let last = performance.now(), time = 0;
  const axis = { x: 0, y: 0 }, aim = { x: 0, y: 0 }, selfPos = { x: 0, y: 0 };
  function frame() {
    const t = performance.now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    time += dt;
    ui.update(dt);
    if (net?.connected && !awaitingSpawn) {
      stepInput(dt * 1000);
      actions(dt);
      prediction.smooth(dt);
      prediction.renderPos(Math.min(1, inputAcc / INPUT_STEP_MS), selfPos);
      syncSelfAnim();
      renderer.frame(dt, t, time, selfPos, ui.wantsMouse ? null : aim);
    } else {
      renderer.frame(dt, t, time, null, null);
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__tb = { store, net: null, prediction, renderer, ui, sprites, particles, juice, input, camera, content };

  // title
  const token = acquireToken();
  let profile = loadProfile(token);
  const netMode = await detectNetMode();
  const notice = takeNotice();
  const title = ui.get('title');
  if (title && !title.auto) {
    profile = await new Promise((resolve) => ui.open('title', { profile, net: netMode, notice, onDone: resolve }));
    ui.close('title');
    try { localStorage.setItem('tb.name.' + token, profile.name); localStorage.setItem('tb.color.' + token, String(profile.color)); } catch { /* ignore */ }
  }

  // ---- networking ----
  const now = () => performance.now();
  renderer.status = 'Connecting...';
  const mode = netMode === 'ws' ? 'direct' : (profile.mode || 'host');
  store.room = null;
  let welcomeToast = null;
  if (mode === 'host') {
    try {
      const { startBrowserHost } = await import('./net/host.js');
      const host = await startBrowserHost({ onStatus: (s) => { renderer.status = s; } });
      store.room = { role: 'host', code: host.code, error: host.peerError };
      window.__tb.host = host;
      net = new NetClient(() => host.clientSocket(), { reconnect: false });
      welcomeToast = host.code ? { text: `Room code ${host.code}: friends click Join and type it.`, kind: 'good' }
        : { text: `Playing offline (no room code): ${host.peerError}`, kind: 'warn' };
    } catch (err) {
      console.error('[tb:host] failed to start', err);
      backToTitle(renderer, `Could not start the world: ${err.message}`, 4000);
      return;
    }
  } else if (mode === 'join') {
    const { PeerClientSocket } = await import('./net/peer-client.js');
    store.room = { role: 'join', code: profile.code };
    renderer.status = `Joining ${profile.code}...`;
    net = new NetClient(() => new PeerClientSocket(profile.code), { reconnect: false });
  } else {
    net = new NetClient(`${proto}//${location.host}`);
  }
  ui.net = net;
  window.__tb.net = net;
  net
    .on('welcome', (m) => {
      store.applyWelcome(m, now()); awaitingSpawn = true; renderer.status = '';
      if (welcomeToast) { const t = welcomeToast; welcomeToast = null; setTimeout(() => store.emit('toast', t), 1500); }
    })
    .on('reject', (m) => { renderer.status = `Cannot join: ${m.reason}`; })
    .on('kicked', (m) => {
      if (m.reason === 'host_left') backToTitle(renderer, 'The host left the game.');
      else renderer.status = `Disconnected: ${m.reason}`;
    })
    .on('close', (why) => {
      if (mode === 'direct') { if (!why || why.reason === 'shutdown') renderer.status = 'Reconnecting...'; return; }
      if (why) return;          // kicked / reject already handled
      const sock = net.ws;
      const r = sock?.closeReason;
      if (r === 'no_room') backToTitle(renderer, `No world with code ${profile.code}. Check it with the host.`, 3000);
      else if (r === 'host_left') backToTitle(renderer, 'The host left the game.');
      else if (r === 'closed') return;                                    // we left
      else backToTitle(renderer, mode === 'join' ? `Could not stay connected to the host. ${sock?.closeText || ''}`.trim() : 'The world stopped.', 3500);
    })
    .on('snap', (m) => {
      store.applySnap(m, now());
      if (awaitingSpawn) {
        awaitingSpawn = false;
        prediction.reset(m.me[0] / POS_QUANT, m.me[1] / POS_QUANT);
        camera.snapTo(prediction.body.x, prediction.body.y);
      } else {
        prediction.reconcile(m.me, m.ack, store.self.stats);
      }
    })
    .on('chunk', (m) => store.applyChunk(m))
    .on('tiles', (m) => store.applyTiles(m))
    .on('self', (m) => store.applySelf(m))
    .on('world', (m) => store.applyWorld(m))
    .on('fx', (m) => { for (const [name, x, y, params] of m.e) router.route(name, x, y, params); })
    .on('toast', (m) => store.emit('toast', m))
    .on('chat', (m) => store.emit('chat', m))
    .on('realm', (m) => {
      store.applyRealm(m);
      prediction.reset(m.x, m.y);
      camera.snapTo(m.x, m.y);
    });
  net.connect({ token, name: profile.name, color: profile.color });

  store.on('entity:hurt', ({ e }) => {
    juice.squash(e.i, 1.25, 0.8, 0.08);
    e.flashUntil = now() + 60;
    // getting hit yourself must read even mid-swing: a short red edge flash and a small shake
    if (e.i === store.myId) {
      juice.shake(3, 0.15);
      if (!store.settings?.reduceFlashing) juice.flash('x', 0.16, 0.12);
    }
  });

  // ---- input stepping ----
  let seq = 0, lastMx = 0, lastMy = 0, dodgeQueued = false;

  function sendStep(dtMs) {
    const b = (input.held('primary') && !ui.wantsMouse ? BUTTON.PRIMARY : 0)
      | (input.held('interact') && !ui.wantsMouse ? BUTTON.SECONDARY : 0)
      | (dodgeQueued ? BUTTON.DODGE : 0);
    dodgeQueued = false;
    const inp = { n: ++seq, mx: axis.x, my: axis.y, b, dt: dtMs, ax: Math.round(aim.x * POS_QUANT), ay: Math.round(aim.y * POS_QUANT) };
    prediction.apply(inp, store.self.stats);
    net.send({ t: 'in', ...inp });
    lastMx = axis.x; lastMy = axis.y;
  }

  stepInput = function (dtMs) {
    input.axis(axis);
    input.aimTile(camera, aim);
    if (input.pressed('dodge')) dodgeQueued = true;
    inputAcc = Math.min(inputAcc + dtMs, MAX_INPUT_BACKLOG_MS);
    if ((axis.x !== lastMx || axis.y !== lastMy || dodgeQueued) && inputAcc >= 8) { sendStep(inputAcc); inputAcc = 0; }
    while (inputAcc >= INPUT_STEP_MS) { sendStep(INPUT_STEP_MS); inputAcc -= INPUT_STEP_MS; }
  };

  // ---- primary / interact ----
  // Swing cadence follows the server: gathering 2/s and the weapon's `rate`/s, both times (1 + swingSpeed),
  // so bows and staves no longer collect `cooldown` replies while the button is held (BUILD_REVIEW P1-10).
  let swingCd = 0, reviveCd = 0;
  const stats = () => store.self.stats || {};
  function weaponRate() {
    const id = store.self.gear?.weapon;
    const g = id ? content.items.byId[id]?.gear : null;
    return g?.slot === 'weapon' ? (g.rate ?? 2) : FIST_RATE;
  }
  const attackInterval = () => 1 / Math.max(0.2, weaponRate() * (1 + (stats().swingSpeed ?? 0))) + RATE_SLACK;
  const gatherInterval = () => 1 / (BASE_SWING_RATE * (1 + (stats().swingSpeed ?? 0))) + RATE_SLACK;
  const inReach = (e, extra = 0.6) => Math.hypot(e.x - prediction.body.x, e.y - prediction.body.y) <= REACH + extra;
  const HOSTILE = new Set(['mob', 'boss']);

  function targetAt(maxDist, filter) {
    let best = null, bestD = maxDist;
    for (const e of store.entities.values()) {
      if (e.i === store.myId || !filter(e)) continue;
      const d = Math.hypot(e.x - aim.x, e.y - aim.y);
      if (d < bestD && inReach(e)) { best = e; bestD = d; }
    }
    return best;
  }
  // Gather targeting (BUILD_REVIEW P1-9): the node whose drawn sprite covers the cursor (tree canopies included),
  // else the closest node base near the cursor, else the nearest node in reach in the cursor's direction.
  function nodeUnderCursor() {
    let best = null, bestD = Infinity;
    for (const e of store.entities.values()) {
      if (e.ty !== 'node' || !inReach(e)) continue;
      const id = 'node.' + e.k;
      const sz = sprites.has(id) ? sprites.size(id) : { w: 16, h: 16 };
      const big = e.big ? 1.5 : 1;
      // the node drawer anchors the sprite bottom-centre 7 px below the entity position
      const hw = ((sz.w * big) / 32) * 0.85, bottom = e.y + 7 / 16, top = bottom - (sz.h * big) / 16 + 0.1;
      if (aim.x >= e.x - hw && aim.x <= e.x + hw && aim.y >= top && aim.y <= bottom) {
        const d = Math.abs(aim.x - e.x) + Math.abs(aim.y - e.y) * 0.25;
        if (d < bestD) { best = e; bestD = d; }
      }
    }
    return best || targetAt(1.2, (e) => e.ty === 'node');
  }
  function nodeTowardCursor() {
    const px = prediction.body.x, py = prediction.body.y;
    const ax = aim.x - px, ay = aim.y - py, al = Math.hypot(ax, ay) || 1;
    let best = null, bestD = Infinity;
    for (const e of store.entities.values()) {
      if (e.ty !== 'node' || !inReach(e, 0.3)) continue;
      const dx = e.x - px, dy = e.y - py, dl = Math.hypot(dx, dy) || 1;
      if ((dx * ax + dy * ay) / (dl * al) < 0.6) continue;     // within about 53 degrees of the cursor
      if (dl < bestD) { best = e; bestD = dl; }
    }
    return best;
  }
  const facingTo = (x, y) => (((Math.round(Math.atan2(y - prediction.body.y, x - prediction.body.x) / (Math.PI / 4)) % 8) + 8) % 8);
  function startSwing(x, y) {
    const me = store.me();
    if (!me) return;
    me._swingAt = now();
    me._swingF = facingTo(x, y);
  }

  // What the mouse points at, for target feedback (outline + "RMB" label drawn by the renderer).
  const USE_TYPES = new Set(['structure', 'npc', 'chest']);
  function hoverInfo() {
    const downed = targetAt(2.0, (e) => e.ty === 'player' && (e.s === 4 || e.a === 'down'));
    if (downed) return { i: downed.i, kind: 'revive' };
    if (targetAt(1.0, (e) => HOSTILE.has(e.ty) && e.hp > 0)) return null;
    const node = nodeUnderCursor();
    if (node) return { i: node.i, kind: 'gather' };
    const use = targetAt(1.5, (e) => USE_TYPES.has(e.ty));
    if (use) {
      const name = use.ty === 'npc' ? (use.n || content.npcs?.byId?.[use.k]?.name) : use.ty === 'chest' ? 'Open' : content.structures.byId[use.k]?.name;
      return { i: use.i, kind: 'use', label: name ? 'RMB  ' + name : null };
    }
    const toward = nodeTowardCursor();
    return toward ? { i: toward.i, kind: 'gather' } : null;
  }

  actions = function (dt) {
    swingCd -= dt;
    reviveCd -= dt;
    renderer.view.hover = ui.wantsMouse || ui.anyModal() ? null : hoverInfo();
    if (ui.wantsMouse || ui.clickConsumed) return;
    if (input.held('primary') && swingCd <= 0) {
      const hostileNear = targetAt(1.0, (e) => HOSTILE.has(e.ty) && e.hp > 0);
      const node = hostileNear ? null : nodeUnderCursor() || (targetAt(1.5, (e) => USE_TYPES.has(e.ty)) ? null : nodeTowardCursor());
      if (node) {
        swingCd = gatherInterval();
        startSwing(node.x, node.y);
        net.do('gather.swing', { id: node.i });
      } else {
        swingCd = attackInterval();
        startSwing(aim.x, aim.y);
        net.do('attack', { ax: Math.round(aim.x * POS_QUANT), ay: Math.round(aim.y * POS_QUANT) });
      }
    }
    // revive (BUILD_REVIEW P1-10): hold RMB on or next to a downed crewmate
    if (input.held('interact') && reviveCd <= 0) {
      const downed = targetAt(2.0, (e) => e.ty === 'player' && (e.s === 4 || e.a === 'down'));
      if (downed) { reviveCd = REVIVE_RESEND_S; net.do('revive', { id: downed.i }); return; }
    }
    if (input.pressed('interact')) {
      const target = targetAt(1.5, (e) => e.ty !== 'drop' && e.ty !== 'player');
      if (target) net.do('use', { id: target.i });
    }
  };

  // local feel: the self player's facing and dodge roll come from the predicted body, not the server echo
  function syncSelfAnim() {
    const me = store.me();
    if (!me) return;
    const b = prediction.body;
    me._dodgeT = b.dodgeT;
    if (Math.abs(b.fx) + Math.abs(b.fy) > 0.01) me._face = (((Math.round(Math.atan2(b.fy, b.fx) / (Math.PI / 4)) % 8) + 8) % 8);
  }
}

boot().catch((err) => {
  console.error('[tb:main] boot failed', err);
  document.body.textContent = 'Tidebound failed to start: ' + err.message;
});
