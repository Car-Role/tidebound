// Particle engine (TECH_SPEC 10.1): struct-of-arrays pool of 4,096, oldest recycled when full.
// Positions are in tiles; draw() converts to source pixels with the view. No allocation per particle.

import { TILE } from '../../shared/config.js';
import { PAL } from '../art/palette.js';
import { textCanvas } from '../render/text.js';

export const CAPACITY = 4096;
const LAYERS = ['ground', 'world', 'overlay', 'ui'];
const SHAPES = ['px', 'circle', 'ring', 'spark', 'shard', 'leaf', 'star', 'plus', 'glyph', 'streak', 'sprite'];
const LAYER_ID = Object.fromEntries(LAYERS.map((l, i) => [l, i]));
const SHAPE_ID = Object.fromEntries(SHAPES.map((s, i) => [s, i]));
const F_ADD = 1, F_RAMP = 2, F_SEEK = 4, F_DEATHSUB = 8;

const x = new Float32Array(CAPACITY), y = new Float32Array(CAPACITY);
const vx = new Float32Array(CAPACITY), vy = new Float32Array(CAPACITY);
const life = new Float32Array(CAPACITY), maxLife = new Float32Array(CAPACITY);
const size0 = new Float32Array(CAPACITY), size1 = new Float32Array(CAPACITY);
const rot = new Float32Array(CAPACITY), vr = new Float32Array(CAPACITY);
const gravity = new Float32Array(CAPACITY), drag = new Float32Array(CAPACITY);
const sway = new Float32Array(CAPACITY), phase = new Float32Array(CAPACITY);
const tx = new Float32Array(CAPACITY), ty = new Float32Array(CAPACITY), seekAfter = new Float32Array(CAPACITY);
const colorIdx = new Uint8Array(CAPACITY), shape = new Uint8Array(CAPACITY), layer = new Uint8Array(CAPACITY);
const flags = new Uint8Array(CAPACITY), presetIdx = new Uint16Array(CAPACITY);
let count = 0, recycle = 0;

const presets = [];            // compiled presets by index
const byName = new Map();
const emitters = new Set();
let spriteBank = null;
let hooks = { shake: null, flash: null, decal: null };
export let timeScale = 1;

const rand = (a, b) => a + Math.random() * (b - a);
const range = (v, d) => (Array.isArray(v) ? v : [v ?? d, v ?? d]);

const GENERIC = { count: [5, 7], life: [0.25, 0.45], speed: [1, 2.5], spread: 6.283, gravity: 0, drag: 4, size: [2, 0], colors: ['b', 'c', 'd'], shape: 'px', layer: 'world' };

function compile(name, p) {
  const colors = (p.colors && p.colors.length ? p.colors : ['#']).map((c) => (c.startsWith?.('#') && c.length === 7 ? c : PAL[c] ?? '#ffffff'));
  return {
    name, raw: p,
    count: range(p.count, 1), rate: p.rate ?? 0, life: range(p.life, 0.5), speed: range(p.speed, 1),
    angle: p.angle ?? 0, spread: p.spread ?? Math.PI * 2, relDir: !!p.relDir,
    gravity: p.gravity ?? 0, drag: p.drag ?? 0, size: range(p.size, 1), colors,
    ramp: p.colorMode === 'ramp', shape: SHAPE_ID[p.shape] ?? 0, add: p.blend === 'add',
    layer: LAYER_ID[p.layer] ?? 1, spin: range(p.spin, 0), sway: p.sway ?? 0, area: p.area ?? [0, 0],
    seek: p.seek ?? null, sub: p.sub ?? [], shake: p.shake ?? 0, flash: p.flash ?? null, decal: p.decal ?? null,
    sprite: p.sprite ?? null, glyph: p.glyph ?? '+',
  };
}

export function define(name, preset) {
  const c = compile(name, preset);
  if (byName.has(name)) presets[byName.get(name)] = c;
  else { byName.set(name, presets.length); presets.push(c); }
}
define('__generic', GENERIC);

export const has = (name) => byName.has(name);
export function setSpriteBank(bank) { spriteBank = bank; }
export function setHooks(h) { hooks = { ...hooks, ...h }; }
export function setTimeScale(s) { timeScale = s; }
export const liveCount = () => count;
export function clear() { count = 0; emitters.clear(); }

function spawnOne(pi, p, px, py, opts) {
  let i;
  if (count < CAPACITY) i = count++;
  else { i = recycle; recycle = (recycle + 1) % CAPACITY; }
  const scale = opts?.scale ?? 1;
  const base = p.relDir && opts?.dir != null ? opts.dir + p.angle : p.angle;
  const a = base + (Math.random() - 0.5) * p.spread;
  const sp = rand(p.speed[0], p.speed[1]) * scale;
  x[i] = px + (p.area[0] ? rand(-p.area[0], p.area[0]) : 0);
  y[i] = py + (p.area[1] ? rand(-p.area[1], p.area[1]) : 0);
  vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp;
  maxLife[i] = life[i] = rand(p.life[0], p.life[1]);
  size0[i] = p.size[0] * scale; size1[i] = p.size[1] * scale;
  rot[i] = Math.random() * Math.PI * 2; vr[i] = rand(p.spin[0], p.spin[1]);
  gravity[i] = p.gravity; drag[i] = p.drag;
  sway[i] = p.sway; phase[i] = Math.random() * 6.283;
  colorIdx[i] = opts?.colorIndex ?? Math.floor(Math.random() * p.colors.length);
  shape[i] = p.shape; layer[i] = p.layer; presetIdx[i] = pi;
  let f = 0;
  if (p.add) f |= F_ADD;
  if (p.ramp) f |= F_RAMP;
  if (p.seek && opts?.target) { f |= F_SEEK; tx[i] = opts.target.x; ty[i] = opts.target.y; seekAfter[i] = p.seek.after ?? 0.2; }
  if (p.sub.some((s) => s.at === 'death')) f |= F_DEATHSUB;
  flags[i] = f;
}

// Burst: world coords in tiles. opts: { dir, color, scale, count, target:{x,y}, follow }
export function emit(name, px, py, opts) {
  let pi = byName.get(name);
  if (pi === undefined) pi = 0;            // unknown names fall back to a generic puff, never an error
  const p = presets[pi];
  const n = opts?.count ?? Math.round(rand(p.count[0], p.count[1] + 0.999) - 0.5);
  const o = opts?.color ? { ...opts, colorIndex: Math.max(0, p.colors.indexOf(PAL[opts.color] ?? opts.color)) } : opts;
  for (let k = 0; k < n; k++) spawnOne(pi, p, px, py, o);
  for (const s of p.sub) if (s.at !== 'death') emit(s.preset, px, py, opts);
  if (p.shake && hooks.shake) hooks.shake(p.shake, 0.2);
  if (p.flash && hooks.flash) hooks.flash(p.flash, 0.3, 0.1);
  if (p.decal && hooks.decal) hooks.decal(p.decal, px, py);
}

// Continuous emitter: returns { stop(), move(x, y) }.
export function emitter(name, px, py, opts = {}) {
  const pi = byName.get(name) ?? 0;
  const h = { pi, x: px, y: py, opts, acc: 0, alive: true, stop() { this.alive = false; emitters.delete(this); }, move(nx, ny) { this.x = nx; this.y = ny; } };
  emitters.add(h);
  return h;
}

export function update(dtReal) {
  const dt = dtReal * timeScale;
  for (const h of emitters) {
    const p = presets[h.pi];
    h.acc += dt * (p.rate || 10);
    while (h.acc >= 1) { h.acc -= 1; spawnOne(h.pi, p, h.x, h.y, h.opts); }
  }
  let i = 0;
  while (i < count) {
    life[i] -= dt;
    if (life[i] <= 0) {
      if (flags[i] & F_DEATHSUB) for (const s of presets[presetIdx[i]].sub) if (s.at === 'death') emit(s.preset, x[i], y[i]);
      const last = --count;
      if (i !== last) {
        x[i] = x[last]; y[i] = y[last]; vx[i] = vx[last]; vy[i] = vy[last]; life[i] = life[last]; maxLife[i] = maxLife[last];
        size0[i] = size0[last]; size1[i] = size1[last]; rot[i] = rot[last]; vr[i] = vr[last]; gravity[i] = gravity[last];
        drag[i] = drag[last]; sway[i] = sway[last]; phase[i] = phase[last]; tx[i] = tx[last]; ty[i] = ty[last];
        seekAfter[i] = seekAfter[last]; colorIdx[i] = colorIdx[last]; shape[i] = shape[last]; layer[i] = layer[last];
        flags[i] = flags[last]; presetIdx[i] = presetIdx[last];
      }
      continue;
    }
    if (flags[i] & F_SEEK && maxLife[i] - life[i] > seekAfter[i]) {
      const dx = tx[i] - x[i], dy = ty[i] - y[i];
      const k = Math.min(1, dt * 8);
      vx[i] += (dx * 12 - vx[i]) * k; vy[i] += (dy * 12 - vy[i]) * k;
    } else {
      vy[i] += gravity[i] * dt;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vx[i] *= dr; vy[i] *= dr;
    }
    x[i] += vx[i] * dt + (sway[i] ? Math.cos(phase[i] + life[i] * 6) * sway[i] * dt : 0);
    y[i] += vy[i] * dt;
    rot[i] += vr[i] * dt;
    i++;
  }
}

function drawOne(ctx, i, sx, sy) {
  const t = 1 - life[i] / maxLife[i];
  const p = presets[presetIdx[i]];
  const s = size0[i] + (size1[i] - size0[i]) * t;
  if (s <= 0.05 && shape[i] !== 2) return;
  const ci = flags[i] & F_RAMP ? Math.min(p.colors.length - 1, Math.floor(t * p.colors.length)) : colorIdx[i] % p.colors.length;
  const col = p.colors[ci];
  ctx.fillStyle = col;
  const r = Math.max(1, Math.round(s));
  switch (shape[i]) {
    case 0: case 5: ctx.fillRect(sx - (r >> 1), sy - (r >> 1), r, r); break;   // px, leaf
    case 1: ctx.fillRect(sx - r, sy - (r >> 1), r * 2, r); ctx.fillRect(sx - (r >> 1), sy - r, r, r * 2); break;
    case 2: {                                                                  // ring
      const rr = Math.max(1, s);
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx + 0.5, sy + 0.5, rr, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 3: case 9: {                                                          // spark, streak: line along velocity
      const len = shape[i] === 9 ? 3 : 1.5;
      const ex = sx - vx[i] * len, ey = sy - vy[i] * len;
      ctx.strokeStyle = col; ctx.lineWidth = r;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      break;
    }
    case 4: ctx.fillRect(sx - r, sy, r * 2, Math.max(1, r >> 1)); break;     // shard
    case 6: ctx.fillRect(sx - r, sy, r * 2 + 1, 1); ctx.fillRect(sx, sy - r, 1, r * 2 + 1); ctx.fillRect(sx - 1, sy - 1, 3, 3); break;
    case 7: ctx.fillRect(sx - r, sy, r * 2 + 1, 1); ctx.fillRect(sx, sy - r, 1, r * 2 + 1); break;
    case 8: { const c = textCanvas(p.glyph, col, null); ctx.drawImage(c, sx - (c.width >> 1), sy - (c.height >> 1)); break; }
    case 10: if (spriteBank && p.sprite) spriteBank.draw(ctx, p.sprite, sx, sy, { alpha: 1 - t * 0.5 }); break;
    default: ctx.fillRect(sx, sy, r, r);
  }
}

// Draw one layer. view: { x, y } top-left in source px.
export function draw(ctx, layerName, view) {
  const L = LAYER_ID[layerName] ?? 1;
  for (let pass = 0; pass < 2; pass++) {
    let started = false;
    for (let i = 0; i < count; i++) {
      if (layer[i] !== L || ((flags[i] & F_ADD) ? 1 : 0) !== pass) continue;
      if (!started) { ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over'; started = true; }
      const sx = Math.round(x[i] * TILE - view.x), sy = Math.round(y[i] * TILE - view.y);
      if (sx < -16 || sy < -16 || sx > view.w + 16 || sy > view.h + 16) continue;
      ctx.globalAlpha = Math.min(1, (life[i] / maxLife[i]) * 3);
      drawOne(ctx, i, sx, sy);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export default { define, emit, emitter, update, draw, has, clear, liveCount, setSpriteBank, setHooks, setTimeScale, CAPACITY };
