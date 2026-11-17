// WP13: minimap, top-right corner, 96x96 UI px (DESIGN 21): terrain from the loaded chunks (unloaded overworld plots
// fall back to plot colours), the camera view, crew dots, pings (from chat.js), bosses, Sea Chests and castaways
// with quests. Click opens the world map panel ('map', WP7).
// Layout contract: occupies x in [W-100, W-4], y in [4, 100] of the HUD; WP7's Treasury/Clock sit left of it.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';
import { CHUNK, TILE } from '../../../shared/config.js';
import { biomeOf } from '../../../shared/grid.js';
import { recentPings, PING_WHEEL } from './chat.js';

const SIZE = 96, PAD = 2;
const BIOME_COL = { greenmarrow: PAL[RAMPS.grass[2]], saltfen: PAL[RAMPS.teal[1]], emberreach: PAL[RAMPS.ember[1]], glasswaste: PAL[RAMPS.sand[3]], hoarfrost: PAL[RAMPS.ice[3]], umbral: PAL[RAMPS.violet[1]] };

// ground id -> [r, g, b] (TECH_SPEC 5.3 tile table)
function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const GROUND = [
  PAL[RAMPS.sea[0]], PAL[RAMPS.sea[2]], PAL[RAMPS.sand[1]], PAL[RAMPS.sand[3]],
  PAL[RAMPS.grass[2]], PAL[RAMPS.teal[2]], PAL[RAMPS.ember[1]], PAL[RAMPS.sand[2]], PAL[RAMPS.ice[3]], PAL[RAMPS.violet[1]],
  PAL[RAMPS.brown[2]], PAL[RAMPS.sand[4]], PAL[RAMPS.ember[3]], PAL[RAMPS.ice[4]], PAL[RAMPS.ink[1]],
  PAL[RAMPS.stone[2]], PAL[RAMPS.stone[0]], '#0d0a14',
].map((c) => hexRgb(c ?? '#000000'));
const SOLID_RGB = hexRgb(PAL[RAMPS.brown[1]]);

const mm = { store: null, canvas: null, ctx: null, img: null, realmId: null, w: 0, h: 0, dirty: new Set(), all: true };

function ensureCanvas(store) {
  const r = store.realm;
  if (mm.canvas && mm.realmId === r.id && mm.w === r.w && mm.h === r.h) return;
  mm.realmId = r.id; mm.w = r.w || 1; mm.h = r.h || 1;
  mm.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(mm.w, mm.h) : Object.assign(document.createElement('canvas'), { width: mm.w, height: mm.h });
  mm.ctx = mm.canvas.getContext('2d');
  mm.img = mm.ctx.createImageData(CHUNK, CHUNK);
  mm.dirty.clear();
  mm.all = true;
}

function hook(store) {
  if (mm.store === store) return;
  mm.store = store;
  store.on('chunk', ({ cx, cy }) => mm.dirty.add(cx + ',' + cy));
  store.on('tiles', (list) => { for (const [tx, ty] of list) mm.dirty.add(Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK)); });
  store.on('realm', () => { mm.realmId = null; });
  store.on('welcome', () => { mm.realmId = null; });
  store.on('change:world.plots', () => { mm.all = true; });
}

function paintChunk(store, key) {
  const c = store.chunks.get(key);
  if (!c) return;
  const [cx, cy] = key.split(',').map(Number);
  const d = mm.img.data;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const g = c.g[i];
    const rgb = (c.f[i] & 1) ? SOLID_RGB : (GROUND[g] ?? GROUND[17]);
    d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255;
  }
  mm.ctx.putImageData(mm.img, cx * CHUNK, cy * CHUNK);
}

function repaint(store) {
  if (mm.all) {
    mm.all = false;
    mm.ctx.fillStyle = store.realm.kind === 'overworld' ? PAL[RAMPS.sea[0]] : '#0d0a14';
    mm.ctx.fillRect(0, 0, mm.w, mm.h);
    if (store.realm.kind === 'overworld') {
      (store.world.plots ?? []).forEach((p, i) => {
        if (!p.owned) return;
        const px = i % 9, py = Math.floor(i / 9);
        mm.ctx.fillStyle = BIOME_COL[biomeOf(px, py)] ?? PAL[RAMPS.grass[2]];
        mm.ctx.fillRect(px * CHUNK, py * CHUNK, CHUNK, CHUNK);
      });
    }
    for (const key of store.chunks.keys()) mm.dirty.add(key);
  }
  let n = 0;
  for (const key of mm.dirty) {
    paintChunk(store, key);
    mm.dirty.delete(key);
    if (++n >= 6) break;
  }
}

// Square window (tiles) to show: in the overworld the owned plots plus one plot of sea around them (at least 3x3
// plots), so the island fills the map early on and the whole archipelago fits later; other realms fit whole.
function viewBox(store) {
  if (store.realm.kind !== 'overworld') { const size = Math.max(mm.w, mm.h); return { x: (mm.w - size) / 2, y: (mm.h - size) / 2, size }; }
  let x0 = 9, y0 = 9, x1 = -1, y1 = -1;
  (store.world.plots ?? []).forEach((p, i) => {
    if (!p.owned) return;
    const px = i % 9, py = Math.floor(i / 9);
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  });
  if (x1 < 0) { x0 = y0 = 3; x1 = y1 = 5; }
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const n = Math.max(3, x1 - x0 + 1, y1 - y0 + 1);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  return { x: (cx - n / 2) * CHUNK, y: (cy - n / 2) * CHUNK, size: n * CHUNK };
}

export default {
  id: 'minimap',
  anchor: 'top-right',
  order: 40,
  draw(ui, store) {
    if (!store.myId || ui.ui.isOpen('title')) return;
    hook(store);
    ensureCanvas(store);
    repaint(store);
    const x0 = ui.w - SIZE - 4, y0 = 4;
    ui.rect(x0, y0, SIZE, SIZE, UI_COLORS.borderDark);
    ui.rect(x0 + 1, y0 + 1, SIZE - 2, SIZE - 2, UI_COLORS.border);
    const inner = SIZE - PAD * 2 - 2;
    const vb = viewBox(store);
    const s = inner / vb.size;
    const ox = x0 + PAD + 1 - vb.x * s, oy = y0 + PAD + 1 - vb.y * s;
    const c = ui.ctx;
    c.save();
    c.imageSmoothingEnabled = false;
    c.beginPath(); c.rect(ui.x + x0 + 2, ui.y + y0 + 2, SIZE - 4, SIZE - 4); c.clip();
    c.fillStyle = store.realm.kind === 'overworld' ? PAL[RAMPS.sea[0]] : '#0d0a14';
    c.fillRect(ui.x + x0 + 2, ui.y + y0 + 2, SIZE - 4, SIZE - 4);
    c.drawImage(mm.canvas, 0, 0, mm.w, mm.h, ui.x + ox, ui.y + oy, mm.w * s, mm.h * s);
    const P = (tx, ty) => [ox + tx * s, oy + ty * s];
    const now = performance.now();
    // camera view
    const view = typeof window !== 'undefined' ? window.__tb?.renderer?.view : null;
    if (view && view.w) {
      const [vx, vy] = P(view.x / TILE, view.y / TILE);
      const vw = (view.w / TILE) * s, vh = (view.h / TILE) * s;
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 1 / (ui.ui.scale || 1);
      c.strokeRect(ui.x + vx, ui.y + vy, vw, vh);
    }
    // entities known to the client: bosses, Sea Chests, castaways with quests
    const markers = store.self.quests?.markers ?? {};
    for (const e of store.entities.values()) {
      if (e.ty === 'boss') { const [bx, by] = P(e.x, e.y); ui.rect(bx - 2, by - 2, 4, 4, PAL[RAMPS.ember[3]]); }
      else if (e.k === 'sea_chest' && (e.own === store.myId || !e.own)) { const [bx, by] = P(e.x, e.y); ui.rect(bx - 1, by - 1, 3, 3, PAL[RAMPS.gold[4]]); }
      else if (e.ty === 'npc') {
        const m = markers[e.k] ?? e.q ?? 0;
        const [bx, by] = P(e.x, e.y);
        ui.rect(bx - 1, by - 1, 3, 3, m === 2 ? UI_COLORS.good : m === 1 ? PAL[RAMPS.gold[4]] : PAL[RAMPS.flesh[3]]);
      }
    }
    // pings
    for (const p of recentPings) {
      if (p.realm !== store.realm.id) continue;
      const age = (now - p.t) / 1000;
      const [bx, by] = P(p.x, p.y);
      const col = PING_WHEEL.find((w) => w.kind === p.kind)?.color ?? '#ffffff';
      const r = 2 + Math.round((Math.sin(age * 8) + 1) * 1.2);
      ui.rect(bx - r, by, r * 2 + 1, 1, col);
      ui.rect(bx, by - r, 1, r * 2 + 1, col);
    }
    // crew
    for (const p of store.world.party ?? []) {
      if (p.realm !== store.realm.id || p.id === store.myId) continue;
      const [bx, by] = P(p.x, p.y);
      ui.rect(bx - 2, by - 2, 4, 4, UI_COLORS.borderDark);
      ui.rect(bx - 1, by - 1, 2, 2, playerColor(p.color ?? 0));
    }
    const me = store.me();
    if (me) {
      const [bx, by] = P(me.rx ?? me.x, me.ry ?? me.y);
      ui.rect(bx - 2, by - 2, 5, 5, UI_COLORS.borderDark);
      ui.rect(bx - 1, by - 1, 3, 3, Math.floor(now / 350) % 2 ? '#ffffff' : playerColor(me.c ?? 0));
    }
    c.restore();
    const label = store.realm.kind === 'overworld' ? null : store.realm.kind === 'moon' ? 'The Moon' : store.realm.kind[0].toUpperCase() + store.realm.kind.slice(1);
    if (label) ui.label(x0 + SIZE / 2, y0 + SIZE + 2, label, { color: UI_COLORS.dim, align: 'center', outline: true });
    if (ui.hover(x0, y0, SIZE, SIZE)) {
      ui.tooltip('Minimap - click for the world map\nHold T to ping');
      if (ui.ui.mouse.released && ui.ui.get('map')) { ui.ui.consumeClick(); ui.ui.toggle('map'); }
    }
  },
};
