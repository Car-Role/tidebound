// Lighting (WP7): day/night darkness from the 24-minute clock, weather dimming, punched light sources (players,
// lamps, fires, Beacons, lava and ink, working machines), warm additive glows and the Beacon light pillars.
// draw(ctx, view, store, time) runs after the world particles (TECH_SPEC 8.1 step 8); ctx is the internal game canvas.
//
// Also exports the client clock helpers used by weather.js and the HUD: clockNow(store), weatherAt(store, x, y),
// biomeAtTile(x, y), darknessAt(store, x, y).

import { TILE, PLOT, WORLD_PLOTS } from '../../shared/config.js';
import { T, biomeOf } from '../../shared/grid.js';

export const DAY_LEN = 1440;
const NIGHT = 0.74;
const WEATHER_DIM = { storm: 0.24, rain: 0.1, fog: 0.08, ashfall: 0.14, blizzard: 0.14, heatwave: -0.02, eclipse: 0, clear: 0, king_tide: 0 };
const DARK_RGB = { night: [8, 10, 32], eclipse: [24, 8, 40], storm: [14, 18, 30], ash: [26, 18, 14] };
const MOB_GLOW = new Set(['lantern_moth', 'bogwisp', 'emberwraith', 'gloom_lantern', 'cinderling', 'abyss_eye']);

// ---------------------------------------------------------------- clock helpers (shared with weather.js and HUD)

let lastClock = null, recvAt = 0;

export function clockNow(store) {
  const c = store.world.clock;
  if (!c) return null;
  const now = performance.now();
  if (c !== lastClock) { lastClock = c; recvAt = now; }
  const dt = Math.min(30, (now - recvAt) / 1000);
  const t = ((c.t + dt) % DAY_LEN + DAY_LEN) % DAY_LEN;
  return { ...c, t, tideLeft: Math.max(0, (c.left ?? 0) - dt), since: dt };
}

export function phaseOf(t) {
  if (t < 120) return 'dawn';
  if (t < 840) return 'day';
  if (t < 960) return 'dusk';
  return 'night';
}

export function biomeAtTile(x, y) {
  const px = Math.floor(x / PLOT), py = Math.floor(y / PLOT);
  if (px < 0 || py < 0 || px >= WORLD_PLOTS || py >= WORLD_PLOTS) return null;
  return biomeOf(px, py);
}

export function weatherAt(store, x, y) {
  const c = store.world.clock;
  if (!c) return 'clear';
  if (store.realm.kind !== 'overworld') return 'clear';
  const b = biomeAtTile(x, y) ?? 'greenmarrow';
  return c.w?.[b]?.[0] ?? c.weather ?? 'clear';
}

export function nightLevel(t) {
  if (t < 120) return NIGHT * (1 - t / 120);
  if (t < 840) return 0;
  if (t < 960) return NIGHT * ((t - 840) / 120);
  return NIGHT + 0.08 * Math.sin(Math.PI * (t - 960) / 480);
}

export function darknessAt(store, x, y) {
  const c = clockNow(store);
  const kind = store.realm.kind;
  if (kind !== 'overworld') return kind === 'moon' ? 0.45 : 0.32;
  if (!c) return 0;
  const w = weatherAt(store, x, y);
  let d = nightLevel(c.t) + (WEATHER_DIM[w] ?? 0);
  if (w === 'eclipse') d = Math.max(d, 0.84);
  return Math.max(0, Math.min(0.92, d));
}

// ---------------------------------------------------------------- light sprites (pre-rendered, dithered bands)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const spriteCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// Radial falloff quantised to 4 bands with ordered dithering between them: reads as pixel art, not a smooth blob.
function lightSprite(rPx, rgb = null) {
  const r = Math.max(4, Math.round(rPx / 2) * 2);
  const key = r + (rgb ? ':' + rgb.join(',') : '');
  let c = spriteCache.get(key);
  if (c) return c;
  const size = r * 2;
  c = makeCanvas(size, size);
  const cx = c.getContext('2d');
  const img = cx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (dist >= 1) continue;
      let a = Math.pow(1 - dist, 0.75);
      const thr = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const band = Math.floor(a * 4 + (thr - 0.5) * 0.9) / 4;
      a = Math.max(0, Math.min(1, band + 0.12 * (a > 0.05 ? 1 : 0)));
      const i = (y * size + x) * 4;
      d[i] = rgb ? rgb[0] : 255; d[i + 1] = rgb ? rgb[1] : 255; d[i + 2] = rgb ? rgb[2] : 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  spriteCache.set(key, c);
  return c;
}

const WARM = [255, 168, 72], COOL = [120, 200, 255], VIOLET = [190, 120, 255], GOLD = [255, 226, 120];

// ---------------------------------------------------------------- collection

const lights = [];      // reused: { x, y, r, glow }
let lightCount = 0;
function pushLight(x, y, r, glow = null, glowA = 0.3) {
  let L = lights[lightCount];
  if (!L) { L = {}; lights[lightCount] = L; }
  L.x = x; L.y = y; L.r = r; L.glow = glow; L.ga = glowA;
  lightCount++;
}

function collect(view, store, time) {
  lightCount = 0;
  const content = view.content;
  const sheet = store.world.sheet || {};
  const x0 = view.x - 160, y0 = view.y - 160, x1 = view.x + view.w + 160, y1 = view.y + view.h + 160;
  const myStats = store.self.stats || {};
  for (const e of store.entities.values()) {
    const px = (e.rx ?? e.x) * TILE, py = (e.ry ?? e.y) * TILE;
    if (px < x0 || py < y0 || px > x1 || py > y1) continue;
    const sx = px - view.x, sy = py - view.y;
    if (e.ty === 'player') {
      const r = e.isSelf ? (myStats.lightRadius ?? 5) : 5;
      pushLight(sx, sy - 6, r * TILE, null);
    } else if (e.ty === 'structure') {
      const def = content.structures.byId[e.k];
      let r = def?.light ?? 0;
      if (e.k === 'lamp') r += sheet.lampRadius ?? 0;
      if (r > 0) {
        const flick = e.k === 'campfire' ? Math.sin(time * 9 + e.i) * 0.25 + Math.sin(time * 23) * 0.12 : 0;
        const warm = e.k === 'campfire' || e.k.startsWith('kiln') || e.k === 'lamp' || e.k === 'tempering_forge';
        pushLight(sx, sy - 8, (r + flick) * TILE, warm ? WARM : def?.beacon ? GOLD : COOL, warm ? 0.32 : 0.22);
      } else if ((e.lv & 4) && def?.machine) {
        pushLight(sx, sy - 8, 1.8 * TILE, def.machine.type === 'generator' ? COOL : WARM, 0.18);
      }
      if (e.k === 'shrine_piece' && e.it === 'brazier' && e.on) pushLight(sx, sy - 10, 2.6 * TILE, WARM, 0.35);
    } else if (e.ty === 'node' && e.k === 'gem_node') {
      pushLight(sx, sy - 4, 1.4 * TILE, GOLD, 0.2);
    } else if (e.ty === 'mob' && MOB_GLOW.has(e.k)) {
      pushLight(sx, sy - 6, 1.8 * TILE, e.k === 'emberwraith' || e.k === 'cinderling' ? WARM : VIOLET, 0.25);
    }
  }
  // glowing ground: lava and ink
  if (store.realm.kind === 'overworld') {
    const tx0 = Math.floor(view.x / TILE) - 1, ty0 = Math.floor(view.y / TILE) - 1;
    const tx1 = Math.ceil((view.x + view.w) / TILE) + 1, ty1 = Math.ceil((view.y + view.h) / TILE) + 1;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const g = store.groundAt(tx, ty);
        if (g === T.LAVA && ((tx + ty) & 1) === 0) pushLight((tx + 0.5) * TILE - view.x, (ty + 0.5) * TILE - view.y, 2.2 * TILE, WARM, 0.3);
        else if (g === T.INK && ((tx * 3 + ty) % 3) === 0) pushLight((tx + 0.5) * TILE - view.x, (ty + 0.5) * TILE - view.y, 1.3 * TILE, VIOLET, 0.16);
      }
    }
  }
}

// ---------------------------------------------------------------- Beacon pillars

function drawBeacons(ctx, view, store, time, dark) {
  for (const e of store.entities.values()) {
    if (e.ty !== 'structure' || !e.k.startsWith('beacon_')) continue;
    const sx = Math.round((e.rx ?? e.x) * TILE - view.x), sy = Math.round((e.ry ?? e.y) * TILE - view.y);
    if (sx < -60 || sx > view.w + 60) continue;
    const top = sy - 72;
    if (top < 0) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.1 + dark * 0.25 + pulse * 0.05;
    for (const [w, al] of [[22, a * 0.35], [12, a * 0.6], [4, a]]) {
      ctx.globalAlpha = al;
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(sx - w / 2, 0, w, top);
    }
    // slow rotating rays at the crown
    ctx.globalAlpha = 0.18 + dark * 0.2;
    ctx.fillStyle = '#ffe58a';
    for (let k = 0; k < 4; k++) {
      const ang = time * 0.6 + (k * Math.PI) / 2;
      ctx.save();
      ctx.translate(sx, top);
      ctx.rotate(ang);
      ctx.fillRect(0, -1, 26, 2);
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- draw

let dark = null, dctx = null;

export default {
  draw(ctx, view, store, time) {
    if (!view.content) return;
    const me = store.me();
    const cx = me ? me.rx ?? me.x : (view.x + view.w / 2) / TILE;
    const cy = me ? me.ry ?? me.y : (view.y + view.h / 2) / TILE;
    const d = darknessAt(store, cx, cy);
    const w = weatherAt(store, cx, cy);
    if (d > 0.015) {
      if (!dark || dark.width !== view.w || dark.height !== view.h) { dark = makeCanvas(view.w, view.h); dctx = dark.getContext('2d'); }
      collect(view, store, time);
      const rgb = w === 'eclipse' ? DARK_RGB.eclipse : w === 'storm' ? DARK_RGB.storm : w === 'ashfall' ? DARK_RGB.ash : DARK_RGB.night;
      dctx.globalCompositeOperation = 'copy';
      dctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${d.toFixed(3)})`;
      dctx.fillRect(0, 0, view.w, view.h);
      dctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < lightCount; i++) {
        const L = lights[i];
        if (L.x + L.r < 0 || L.y + L.r < 0 || L.x - L.r > view.w || L.y - L.r > view.h) continue;
        const s = lightSprite(L.r);
        dctx.drawImage(s, Math.round(L.x - s.width / 2), Math.round(L.y - s.height / 2));
      }
      dctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(dark, 0, 0);
      // warm/cool glows on top, strongest at night
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lightCount; i++) {
        const L = lights[i];
        if (!L.glow) continue;
        const r = L.r * 0.7;
        if (L.x + r < 0 || L.y + r < 0 || L.x - r > view.w || L.y - r > view.h) continue;
        const s = lightSprite(r, L.glow);
        ctx.globalAlpha = Math.min(1, L.ga * d * 1.6);
        ctx.drawImage(s, Math.round(L.x - s.width / 2), Math.round(L.y - s.height / 2));
      }
      ctx.restore();
    }
    // dawn and dusk warm the colours a little
    const c = clockNow(store);
    if (c && store.realm.kind === 'overworld') {
      const t = c.t;
      let warm = 0;
      if (t < 160) warm = 1 - Math.abs(t - 80) / 80;
      else if (t > 800 && t < 1000) warm = 1 - Math.abs(t - 900) / 100;
      if (warm > 0) {
        ctx.save();
        ctx.globalAlpha = 0.12 * warm;
        ctx.fillStyle = t < 400 ? '#ff9a5a' : '#ff6a5a';
        ctx.fillRect(0, 0, view.w, view.h);
        ctx.restore();
      }
    }
    if (store.realm.kind === 'overworld') drawBeacons(ctx, view, store, time, d);
  },
};
