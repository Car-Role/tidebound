// WP13: the title screen. main.js opens it before connecting with args { profile:{name,color}, onDone } and waits.
// One server runs one world, so there is no world select: the screen shows that world (name, playtime, crew - as last
// seen from this browser, cached in localStorage by hud/toasts.js) and offers:
//   Continue (the character this tab already has), New castaway (a fresh character in this world), Join by address
//   (another server), Host a new world (how to start one), Settings.
// Text fields use input.textCapture.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';
import { measure } from '../../render/text.js';
import { loadSettings, applyEverywhere } from './settings.js';
import { wrapText } from './dialog.js';
import { Widgets } from '../widgets.js';
import settingsPanel from './settings.js';
import { drawText } from '../../render/text.js';

const COLOR_NAMES = ['Teal', 'Ember', 'Gold', 'Violet', 'Sea', 'Moss', 'Coral', 'Slate'];
const st = { view: 'main', args: null, name: '', color: 0, addr: '', field: null, t0: 0, err: '', hasChar: false, done: false };

export function worldCacheKey(host = (typeof location !== 'undefined' ? location.host : 'local')) { return 'tb.world.' + host; }
const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} m`;

function readWorld() {
  try { return JSON.parse(localStorage.getItem(worldCacheKey()) || 'null'); } catch { return null; }
}
function recentHosts() {
  try { return JSON.parse(localStorage.getItem('tb.recentHosts') || '[]').slice(0, 4); } catch { return []; }
}
function rememberHost(h) {
  try { localStorage.setItem('tb.recentHosts', JSON.stringify([h, ...recentHosts().filter((x) => x !== h)].slice(0, 6))); } catch { /* ignore */ }
}

function capture(ui, field) {
  const input = ui.ui.input;
  st.field = field;
  input.textCapture = (e) => {
    if (e.type && e.type !== 'keydown') return;
    const cur = st[field];
    const max = field === 'name' ? 16 : 64;
    if (e.key === 'Backspace') st[field] = cur.slice(0, -1);
    else if (e.key === 'Enter') { release(ui); submit(ui); }
    else if (e.key === 'Escape') release(ui);
    else if (e.key === 'Tab') release(ui);
    else if (e.key && e.key.length === 1 && /[\x20-\x7e]/.test(e.key) && cur.length < max) st[field] = cur + e.key;
  };
}
function release(ui) {
  if (ui.ui.input.textCapture) ui.ui.input.textCapture = null;
  st.field = null;
}

function finish(ui, profile) {
  if (st.done) return;
  st.done = true;
  release(ui);
  ui.ui.sound('ui_click');
  st.args?.onDone?.(profile);
}

function submit(ui) {
  if (st.view === 'new') {
    const name = st.name.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) { st.err = 'Give your castaway a name.'; return; }
    finish(ui, { name, color: st.color });
  } else if (st.view === 'join') {
    const a = st.addr.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[A-Za-z0-9.\-[\]:]+$/.test(a)) { st.err = 'Use host or host:port, e.g. 192.168.1.20:8080'; return; }
    rememberHost(a);
    location.href = `${location.protocol}//${a}/`;
  }
}

// Animated night sea with a rising island and the moon; drawn full screen in UI space.
export function drawSea(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, PAL[RAMPS.ink[0]]);
  sky.addColorStop(0.55, PAL[RAMPS.sea[0]]);
  sky.addColorStop(1, PAL[RAMPS.sea[1]]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = (i * 131 + 17) % W, y = (i * 71) % Math.floor(H * 0.5);
    const tw = Math.sin(t * 1.3 + i * 1.7);
    ctx.fillStyle = tw > 0.5 ? '#ffffff' : tw > -0.2 ? PAL[RAMPS.ice[3]] : PAL[RAMPS.ink[3]];
    ctx.fillRect(x, y, 1, 1);
  }
  // the Drowned Moon, half under the horizon line
  const mx = Math.round(W * 0.76), my = Math.round(H * 0.5), r = Math.round(Math.min(W, H) * 0.14);
  ctx.fillStyle = PAL[RAMPS.violet[1]];
  ctx.beginPath(); ctx.arc(mx, my, r + 3, Math.PI, 0); ctx.fill();
  ctx.fillStyle = PAL[RAMPS.ice[4]];
  ctx.beginPath(); ctx.arc(mx, my, r, Math.PI, 0); ctx.fill();
  ctx.fillStyle = PAL[RAMPS.ice[2]];
  for (const [dx, dy, cr] of [[-0.4, -0.35, 0.16], [0.25, -0.55, 0.1], [0.45, -0.2, 0.08]]) { ctx.beginPath(); ctx.arc(mx + dx * r, my + dy * r, cr * r, 0, Math.PI * 2); ctx.fill(); }
  // sea bands
  const horizon = Math.round(H * 0.5);
  for (let y = horizon; y < H; y += 3) {
    const k = (y - horizon) / (H - horizon);
    ctx.fillStyle = k < 0.3 ? PAL[RAMPS.sea[1]] : k < 0.65 ? PAL[RAMPS.sea[2]] : PAL[RAMPS.teal[1]];
    ctx.fillRect(0, y, W, 3);
    const off = Math.round(Math.sin(t * 0.9 + y * 0.21) * 6 + t * 10 * (0.3 + k));
    ctx.fillStyle = PAL[RAMPS.sea[3]];
    for (let x = ((off % 23) + 23) % 23 - 23; x < W; x += 23 + Math.floor(k * 20)) ctx.fillRect(x, y, 4 + Math.floor(k * 6), 1);
  }
  // moon path glitter
  for (let i = 0; i < 26; i++) {
    const y = horizon + 3 + i * 5;
    if (y >= H) break;
    const w = 3 + i * 1.5 + Math.sin(t * 3 + i) * 3;
    ctx.fillStyle = i % 2 ? PAL[RAMPS.ice[4]] : PAL[RAMPS.ice[3]];
    ctx.fillRect(Math.round(mx - w / 2 + Math.sin(t * 2 + i) * 2), y, Math.round(w), 1);
  }
  // the island, rising and settling with the swell
  const ix = Math.round(W * 0.26), iy = horizon + 14 + Math.round(Math.sin(t * 0.8) * 1.5);
  ctx.fillStyle = PAL[RAMPS.sand[2]];
  ctx.beginPath(); ctx.ellipse(ix, iy, 46, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = PAL[RAMPS.grass[2]];
  ctx.beginPath(); ctx.ellipse(ix - 4, iy - 3, 34, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = PAL[RAMPS.brown[1]];
  ctx.fillRect(ix - 15, iy - 25, 3, 16);
  ctx.fillStyle = PAL[RAMPS.grass[3]];
  for (const [dx, dy] of [[-22, -27], [-15, -31], [-8, -27], [-14, -25]]) { ctx.beginPath(); ctx.ellipse(ix + dx, iy + dy, 7, 3, 0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = PAL[RAMPS.stone[3]];
  ctx.fillRect(ix + 10, iy - 17, 6, 9);
  ctx.fillStyle = PAL[RAMPS.teal[4]];
  ctx.fillRect(ix + 12, iy - 15, 2, 2 + Math.round((Math.sin(t * 2) + 1)));
  // foam ring
  ctx.fillStyle = '#ffffff';
  for (let a = 0; a < 18; a++) {
    const ang = (a / 18) * Math.PI + Math.PI + Math.sin(t + a) * 0.05;
    ctx.fillRect(Math.round(ix + Math.cos(ang) * 50), Math.round(iy + 2 + Math.sin(ang) * -2), 2, 1);
  }
}

function field(ui, x, y, w, key, placeholder) {
  const active = st.field === key;
  const hot = ui.hover(x, y, w, 13);
  ui.rect(x, y, w, 13, UI_COLORS.borderDark);
  ui.rect(x + 1, y + 1, w - 2, 11, active ? UI_COLORS.slotHover : UI_COLORS.slot);
  const text = st[key];
  ui.label(x + 4, y + 3, text || placeholder, { color: text ? UI_COLORS.text : UI_COLORS.dim });
  if (active && Math.floor(performance.now() / 450) % 2) ui.rect(x + 5 + measure(text), y + 3, 1, 7, UI_COLORS.accent);
  if (hot && ui.ui.mouse.released) { ui.ui.consumeClick(); capture(ui, key); }
}

function drawMain(ui) {
  const w = readWorld();
  const cx = ui.w / 2;
  let y = 64;
  ui.rect(14, y, ui.w - 28, 34, UI_COLORS.bgLight);
  if (w) {
    ui.label(20, y + 4, `World: ${w.worldName ?? 'world'}`, { color: UI_COLORS.accent });
    ui.label(ui.w - 20, y + 4, `${hm(w.playtimeS ?? 0)} played`, { color: UI_COLORS.dim, align: 'right' });
    const crew = (w.bound?.length ? w.bound : w.online ?? []).slice(0, 6).join(', ');
    ui.label(20, y + 14, crew ? `Crew: ${crew}` : 'No crew bound yet.', { color: UI_COLORS.text });
    ui.label(20, y + 24, `Crew size ${w.S ?? 1}${w.max ? ` - up to ${w.max} castaways` : ''}`, { color: UI_COLORS.dim });
  } else {
    ui.label(20, y + 5, 'A shore you have not landed on yet.', { color: UI_COLORS.text });
    ui.label(20, y + 16, `Server: ${typeof location !== 'undefined' ? location.host : ''}`, { color: UI_COLORS.dim });
  }
  y += 42;
  const bw = 150, bx = cx - bw / 2;
  if (st.hasChar) {
    if (ui.button(bx, y, `Continue as ${st.args?.profile?.name ?? ''}`, { w: bw, key: 'cont' })) finish(ui, st.args.profile);
    y += 17;
    if (ui.button(bx, y, 'New castaway', { w: bw, key: 'new' })) {
      try { sessionStorage.removeItem('tb.token'); sessionStorage.setItem('tb.newchar', '1'); } catch { /* ignore */ }
      location.reload();
    }
  } else if (ui.button(bx, y, 'New castaway', { w: bw, key: 'new' })) { st.view = 'new'; st.err = ''; capture(ui, 'name'); }
  y += 17;
  if (ui.button(bx, y, 'Join by address', { w: bw, key: 'join' })) { st.view = 'join'; st.err = ''; capture(ui, 'addr'); }
  y += 17;
  if (ui.button(bx, y, 'Host a new world', { w: bw, key: 'host' })) { st.view = 'host'; release(ui); }
  y += 17;
  if (ui.button(bx, y, 'Settings', { w: bw, key: 'settings' })) ui.ui.open('settings');
}

function drawNew(ui) {
  const t = (performance.now() - st.t0) / 1000;
  ui.label(16, 64, 'Name your castaway', { color: UI_COLORS.accent });
  field(ui, 16, 76, 150, 'name', 'type a name');
  ui.label(16, 100, `Colour: ${COLOR_NAMES[st.color]}`, { color: UI_COLORS.accent });
  for (let i = 0; i < 8; i++) {
    const x = 16 + i * 19, y = 112, sel = i === st.color, hot = ui.hover(x, y, 16, 16);
    ui.rect(x, y, 16, 16, sel ? '#ffffff' : UI_COLORS.borderDark);
    ui.rect(x + 2, y + 2, 12, 12, playerColor(i));
    if (hot && ui.ui.mouse.released) { st.color = i; ui.ui.consumeClick(); ui.ui.sound('ui_click'); }
  }
  // preview
  const px = ui.w - 56, py = 128;
  ui.rect(px - 34, 62, 68, 76, UI_COLORS.bgLight);
  ui.ctx.save();
  const sprites = ui.ui.sprites;
  sprites?.drawShadow?.(ui.ctx, ui.x + px, ui.y + py, 14);
  const anim = Math.floor(t / 2) % 2 ? 'run_down' : 'idle_down';
  sprites?.draw(ui.ctx, 'pl.body', ui.x + px, ui.y + py, { anim, time: t, variant: (st.color & 7) + 1, scaleX: 3, scaleY: 3 });
  ui.ctx.restore();
  ui.label(px, 64, st.name || '...', { color: playerColor(st.color), align: 'center', outline: true });
  if (st.err) ui.label(16, 138, st.err, { color: UI_COLORS.bad });
  if (ui.button(16, 150, 'Set sail', { w: 80, key: 'sail' })) submit(ui);
  if (ui.button(102, 150, 'Back', { key: 'back' })) { st.view = 'main'; release(ui); }
}

function drawJoin(ui) {
  ui.label(16, 64, 'Join a friend\'s world', { color: UI_COLORS.accent });
  ui.label(16, 76, 'The host sees the address when they start the server.', { color: UI_COLORS.dim });
  field(ui, 16, 88, ui.w - 32, 'addr', '192.168.1.20:8080');
  recentHosts().forEach((h, i) => {
    if (ui.button(16 + i * 74, 106, h.length > 11 ? h.slice(0, 10) + '.' : h, { key: 'rh' + i, w: 70 })) { st.addr = h; }
  });
  if (st.err) ui.label(16, 126, st.err, { color: UI_COLORS.bad });
  if (ui.button(16, 150, 'Join', { w: 80, key: 'go' })) submit(ui);
  if (ui.button(102, 150, 'Back', { key: 'back' })) { st.view = 'main'; release(ui); }
}

function drawHost(ui) {
  ui.label(16, 64, 'Host a new world', { color: UI_COLORS.accent });
  const text = 'Each Tidebound server runs one world. To start another, run it on the host computer with a new world name:\n\nnpm start -- --world myisland --port 8081\n\nThe server prints the address friends type here (LAN, or your public IP with a port forward). Add --persist to keep time running while nobody is online.';
  wrapText(text, ui.w - 32).forEach((l, i) => ui.label(16, 76 + i * 9, l, { color: l.startsWith('npm') ? UI_COLORS.good : UI_COLORS.text }));
  if (ui.button(16, 160, 'Back', { key: 'back' })) st.view = 'main';
}

// ---------------------------------------------------------------- self-hosting
// client/main.js awaits the title before it starts the frame loop, so the panel manager never draws it. While the
// title is open and the manager has not drawn it recently, this host runs its own requestAnimationFrame loop on the
// game canvas with its own mouse/keyboard capture (capture-phase listeners that stop the events, so the game's
// Input does not see keys typed into the name field). If the manager draws the title itself, the host steps aside.

const host = { on: false, raf: 0, store: null, mgr: null, listeners: [], sprites: null, audio: null, settingsOpen: false, input: null };

function makeInput() {
  let bindings = {};
  try { bindings = JSON.parse(localStorage.getItem('tb.binds') || '{}'); } catch { bindings = {}; }
  return {
    textCapture: null, down: new Set(),
    bindings: new Proxy(bindings, { get: (o, k) => o[k] ?? DEFAULT_BINDS[k] ?? [] }),
    setBinding(action, codes) { bindings[action] = codes; try { localStorage.setItem('tb.binds', JSON.stringify(bindings)); } catch { /* ignore */ } },
    resetBindings() { for (const k of Object.keys(bindings)) delete bindings[k]; try { localStorage.removeItem('tb.binds'); } catch { /* ignore */ } },
    pressed: () => false, held: () => false, released: () => false,
  };
}
let DEFAULT_BINDS = {};

function uiScale() {
  const s = loadSettings().uiScale;
  return s || (innerHeight < 700 ? 1 : 2);
}

function startHost(mod, store) {
  if (host.on || typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  const canvas = document.getElementById('game');
  if (!canvas) return;
  host.on = true;
  host.store = store;
  host.input = makeInput();
  import('../../input/input.js').then((m) => { DEFAULT_BINDS = m.DEFAULT_BINDINGS; }).catch(() => {});
  import('../../audio/audio.js').then((m) => { host.audio = m.default; applyEverywhere(loadSettings(), { audio: host.audio, store }); }).catch(() => {});
  // the player preview needs sprites; the boot bank is not reachable from here, so build a private one
  setTimeout(() => {
    Promise.all([import('../../art/spritegen.js'), import('../../art/sprites/index.js')])
      .then(([g, d]) => { if (host.on) host.sprites = new g.SpriteBank().build(d.default); }).catch(() => {});
  }, 50);
  const mouse = { x: 0, y: 0, down: false, pressed: false, released: false, wheel: 0 };
  const mgr = {
    mouse, activeKey: null, lastHoverKey: null, scroll: new Map(), drag: null, pendingTooltip: null, clickConsumed: false,
    W: 0, H: 0, scale: 2, store, net: null, input: host.input,
    get sprites() { return host.sprites; },
    get audio() { return host.audio; },
    sound(name) { host.audio?.play(name, {}); },
    consumeClick() { this.clickConsumed = true; },
    beginDrag() {}, endDrag() {}, drawDragGhost() {},
    get(id) { return id === 'settings' ? settingsPanel : id === 'title' ? mod : null; },
    isOpen(id) { return id === 'title' ? host.on : id === 'settings' ? host.settingsOpen : false; },
    open(id) { if (id === 'settings') { host.settingsOpen = true; settingsPanel.open(store); } },
    close(id) { if (id === 'settings') { host.settingsOpen = false; settingsPanel.close(); } },
    toggle(id) { if (this.isOpen(id)) this.close(id); else this.open(id); },
  };
  host.mgr = mgr;
  const toUi = (e) => { mouse.x = e.clientX / mgr.scale; mouse.y = e.clientY / mgr.scale; };
  const managed = () => performance.now() - st.managed < 250;
  const add = (target, type, fn) => { target.addEventListener(type, fn, true); host.listeners.push([target, type, fn]); };
  add(window, 'mousemove', (e) => { toUi(e); });
  add(window, 'mousedown', (e) => { if (managed()) return; toUi(e); if (e.button === 0) { mouse.down = true; mouse.pressed = true; } e.stopImmediatePropagation(); e.preventDefault(); host.audioUnlock?.(); });
  add(window, 'mouseup', (e) => { if (managed()) return; toUi(e); if (e.button === 0) { mouse.down = false; mouse.released = true; } e.stopImmediatePropagation(); });
  add(window, 'wheel', (e) => { if (managed()) return; mouse.wheel += Math.sign(e.deltaY); });
  add(window, 'keydown', (e) => {
    if (managed()) return;
    if (host.input.textCapture) host.input.textCapture(e);
    else if (e.key === 'Escape' && host.settingsOpen) mgr.close('settings');
    else if (e.key === 'Enter' && st.view === 'main' && st.hasChar) finish({ ui: mgr }, st.args.profile);
    host.input.down.add(e.code);
    e.stopImmediatePropagation();
    if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
  });
  add(window, 'keyup', (e) => { if (managed()) return; host.input.down.delete(e.code); e.stopImmediatePropagation(); });

  const frame = () => {
    if (!host.on) return;
    host.raf = requestAnimationFrame(frame);
    if (managed()) return;
    const ctx = canvas.getContext('2d');
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
    mgr.scale = uiScale();
    mgr.W = Math.ceil(canvas.width / mgr.scale); mgr.H = Math.ceil(canvas.height / mgr.scale);
    mgr.clickConsumed = false;
    mgr.pendingTooltip = null;
    if (!mouse.down && !mouse.released) mgr.activeKey = null;
    const w = new Widgets(mgr);
    ctx.save();
    ctx.setTransform(mgr.scale, 0, 0, mgr.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const r = { x: Math.round((mgr.W - mod.w) / 2), y: Math.round((mgr.H - mod.h) / 2), w: mod.w, h: mod.h };
    st.inHost = true;
    try {
      mod.draw(w.bind(ctx, r, 'title'), store);
      if (host.settingsOpen) {
        ctx.fillStyle = 'rgba(13,10,20,0.55)';
        ctx.fillRect(0, 0, mgr.W, mgr.H);
        const sr = { x: Math.round((mgr.W - settingsPanel.w) / 2), y: Math.round((mgr.H - settingsPanel.h) / 2), w: settingsPanel.w, h: settingsPanel.h };
        settingsPanel.draw(w.bind(ctx, sr, 'settings'), store);
      }
      if (mgr.pendingTooltip) {
        const lines = String(mgr.pendingTooltip).split('\n');
        const tw = Math.max(...lines.map(measure)) + 8, th = lines.length * 9 + 5;
        const tx = Math.min(mgr.W - tw - 2, mouse.x + 8), ty = Math.min(mgr.H - th - 2, mouse.y + 8);
        ctx.fillStyle = UI_COLORS.borderDark; ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = UI_COLORS.bg; ctx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
        drawText(ctx, mgr.pendingTooltip, tx + 4, ty + 3, { outline: false });
      }
    } catch (err) { console.error('[tb:title] draw', err); }
    st.inHost = false;
    ctx.restore();
    mouse.pressed = false; mouse.released = false; mouse.wheel = 0;
  };
  host.raf = requestAnimationFrame(frame);
  host.audioUnlock = () => { host.audio?.unlock?.(); host.audioUnlock = null; };
}

function stopHost() {
  if (!host.on) return;
  host.on = false;
  cancelAnimationFrame(host.raf);
  for (const [t, type, fn] of host.listeners) t.removeEventListener(type, fn, true);
  host.listeners = [];
  host.settingsOpen = false;
  host.sprites = null;
}

export default {
  id: 'title',
  key: null,
  modal: true,
  auto: false,
  w: 260, h: 178, anchor: 'center',

  open(store, args) {
    st.args = args;
    st.t0 = performance.now();
    st.done = false;
    st.err = '';
    st.managed = 0;
    st.color = args?.profile?.color ?? 0;
    let newChar = false;
    try { newChar = sessionStorage.getItem('tb.newchar') === '1'; sessionStorage.removeItem('tb.newchar'); } catch { /* ignore */ }
    let token = null;
    try { token = sessionStorage.getItem('tb.token'); } catch { token = null; }
    let savedName = null;
    try { savedName = token ? localStorage.getItem('tb.name.' + token) : null; } catch { savedName = null; }
    st.hasChar = !newChar && !!savedName;
    st.name = st.hasChar ? (args?.profile?.name ?? '') : '';
    st.view = newChar ? 'new' : 'main';
    applyEverywhere(loadSettings(), { audio: null, store });
    startHost(this, store);
  },
  close() {
    st.field = null;
    if (host.input) host.input.textCapture = null;
    stopHost();
  },

  draw(ui) {
    // the main menu with "Continue as" has five buttons: grow the frame so the last one stays inside (P2-18)
    this.h = st.view === 'main' && st.hasChar ? 196 : 178;
    if (!st.inHost) st.managed = performance.now();
    if (st.view === 'new' && !st.field && !st.done && st.autoFocus !== st.t0) { st.autoFocus = st.t0; capture(ui, 'name'); }
    const t = (performance.now() - st.t0) / 1000;
    const W = ui.ui.W, H = ui.ui.H;
    // full-screen backdrop (UI space), then the logo
    const c = ui.ctx;
    c.save();
    drawSea(c, W, H, t);
    c.restore();
    const bob = Math.round(Math.sin(t * 1.2) * 2);
    ui.label(ui.w / 2, 4 + bob, 'TIDEBOUND', { color: PAL[RAMPS.gold[4]], align: 'center', scale: 4, outline: true });
    ui.label(ui.w / 2, 40, 'raise the land - outlast the sea', { color: PAL[RAMPS.ice[4]], align: 'center', outline: true });
    if (st.view === 'main' && st.field) release(ui);
    ui.rect(8, 56, ui.w - 16, ui.h - 60, 'rgba(13,10,20,0.78)');
    switch (st.view) {
      case 'new': drawNew(ui); break;
      case 'join': drawJoin(ui); break;
      case 'host': drawHost(ui); break;
      default: drawMain(ui); break;
    }
    ui.label(ui.w / 2, ui.h + 8, 'v0.1 - co-op for 1 to 8 castaways', { color: UI_COLORS.dim, align: 'center', outline: true });
  },
};
