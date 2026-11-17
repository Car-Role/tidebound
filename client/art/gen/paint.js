// WP3 pixel painter: a tiny char-grid canvas used by every generated sprite (items, nodes, structures, mobs,
// bosses, NPCs, icons, decor). Pure JS (runs in Node for tests and in the browser at boot).
// Coordinates are integer pixels, light comes from the top-left. Colours are palette characters.

import { RAMPS, shade } from '../palette.js';
import { hash2D } from '../../../shared/rng.js';

export const R = RAMPS;
export const INK = R.ink[0];
export const T = '.';
const LIGHT = norm3(-0.55, -0.7, 0.75);

function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Pick a ramp shade from a light intensity in [0,1] (5 bands, optional dither between bands).
export function band(ramp, i, x = 0, y = 0, dither = false) {
  let v = Math.max(0, Math.min(0.999, i)) * 5;
  if (dither) v += (bayer(x, y) - 0.5) * 0.6;
  return ramp[Math.max(0, Math.min(4, Math.floor(v)))];
}

export class Px {
  constructor(w, h, fill = T) {
    this.w = w; this.h = h;
    this.d = new Array(w * h).fill(fill);
  }
  static from(rows) {
    const p = new Px(rows[0].length, rows.length);
    rows.forEach((r, y) => { for (let x = 0; x < p.w; x++) p.d[y * p.w + x] = r[x] ?? T; });
    return p;
  }
  clone() { const p = new Px(this.w, this.h); p.d = this.d.slice(); return p; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.d[y * this.w + x] : T; }
  filled(x, y) { return this.get(x, y) !== T; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (c && c !== T && this.in(x, y)) this.d[y * this.w + x] = c;
    return this;
  }
  put(x, y, c) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.d[y * this.w + x] = c; return this; }
  erase(x, y) { return this.put(x, y, T); }
  // c: char or fn(x, y) -> char
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j, i, j) : c);
    return this;
  }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); return this; }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); return this; }
  box(x, y, w, h, c) { this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c); this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c); return this; }
  // Filled ellipse centred at (cx, cy) (may be .5), c: char or fn(x, y, nx, ny, d)
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny, d) : c);
      }
    }
    return this;
  }
  // Erase a filled ellipse (holes, crescents).
  cut(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny < 1) this.put(x, y, T);
    }
    return this;
  }
  // Shaded sphere / blob using a 5-shade ramp; opts: { light, rim (outer band char), spec, dither, ambient }
  ball(cx, cy, rx, ry, ramp, opts = {}) {
    const L = opts.light ?? LIGHT, amb = opts.ambient ?? 0.18;
    return this.ellipse(cx, cy, rx, ry, (x, y, nx, ny, d) => {
      const nz = Math.sqrt(Math.max(0, 1 - d));
      let i = amb + (1 - amb) * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      if (opts.rim && d > 0.86) return opts.rim;
      if (opts.spec && i > 0.97) return opts.spec;
      return band(ramp, i * 1.05, x, y, opts.dither);
    });
  }
  line(x0, y0, x1, y1, c, thick = 1) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + (dx * k) / n), y = Math.round(y0 + (dy * k) / n);
      const ch = typeof c === 'function' ? c(x, y, k / n) : c;
      if (thick <= 1) this.set(x, y, ch);
      else this.rect(x - (thick >> 1), y - (thick >> 1), thick, thick, ch);
    }
    return this;
  }
  // Polyline through points [[x,y],...]
  path(pts, c, thick = 1) { for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, thick); return this; }
  // Scanline polygon fill (pixel centres). c: char or fn(x, y)
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
      }
    }
    return this;
  }
  // Recolour every filled pixel: fn(ch, x, y) -> ch | null (null keeps)
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x, c = this.d[i];
      if (c === T) continue;
      const n = fn(c, x, y);
      if (n) this.d[i] = n;
    }
    return this;
  }
  swap(map) { return this.map((c) => map[c] ?? null); }
  // Mask of filled pixels.
  mask() { return this.d.map((c) => c !== T); }
  // Bevel: light top/left edges, darken bottom/right edges of every filled region (same-ramp shades).
  bevel(hi = 1, lo = -1, onlyChars = null) {
    const m = this.mask(), w = this.w, out = this.d.slice();
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < this.h ? m[y * w + x] : false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i] || (onlyChars && !onlyChars.includes(this.d[i]))) continue;
      const up = !at(x, y - 1), left = !at(x - 1, y), down = !at(x, y + 1), right = !at(x + 1, y);
      if ((up || left) && !(down || right) && hi) out[i] = shade(this.d[i], hi);
      else if ((down || right) && !(up || left) && lo) out[i] = shade(this.d[i], lo);
    }
    this.d = out;
    return this;
  }
  // 1 px outline around the filled shape (in transparent pixels). diag adds corners. Colour fn(neighbourChar) allowed.
  outline(c = INK, diag = false) {
    const out = this.d.slice(), w = this.w;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      if (this.d[y * w + x] !== T) continue;
      let nb = null;
      for (const [dx, dy] of diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = this.get(x + dx, y + dy);
        if (v !== T) { nb = v; break; }
      }
      if (nb) out[y * w + x] = typeof c === 'function' ? c(nb) : c;
    }
    this.d = out;
    return this;
  }
  // Selective outline: darkest shade of the touching colour's ramp (softer than ink, still readable).
  selout() { return this.outline((nb) => shade(nb, -4) === nb ? INK : shade(nb, -3)); }
  // Copy non-transparent pixels of src at (dx, dy).
  blit(src, dx = 0, dy = 0, flipX = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.d[y * src.w + (flipX ? src.w - 1 - x : x)];
      if (c !== T) this.set(dx + x, dy + y, c);
    }
    return this;
  }
  flipX() { const p = new Px(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.d[y * this.w + x] = this.d[y * this.w + this.w - 1 - x]; return p; }
  shift(dx, dy) { const p = new Px(this.w, this.h); p.blit(this, dx, dy); return p; }
  // Make the right half a mirror of the left half (symmetric sprites).
  mirror() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w >> 1; x++) this.d[y * this.w + this.w - 1 - x] = this.d[y * this.w + x];
    return this;
  }
  // Squash/stretch around the bottom-centre (nearest neighbour).
  scale(sx, sy, ax = this.w / 2, ay = this.h) {
    const p = new Px(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ux = Math.floor((x + 0.5 - ax) / sx + ax), uy = Math.floor((y + 0.5 - ay) / sy + ay);
      p.d[y * this.w + x] = this.get(ux, uy);
    }
    return p;
  }
  // Rotate around a centre by `a` radians (nearest neighbour); used for weapon swings and rolls.
  rotate(a, cx = this.w / 2, cy = this.h / 2) {
    const p = new Px(this.w, this.h), c = Math.cos(-a), s = Math.sin(-a);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      p.d[y * this.w + x] = this.get(Math.floor(cx + dx * c - dy * s), Math.floor(cy + dx * s + dy * c));
    }
    return p;
  }
  // Brighten (+) or darken (-) every pixel within its ramp.
  tone(d) { return this.map((c) => shade(c, d)); }
  // Resize canvas (anchored at offset), returns new Px.
  pad(w, h, dx = 0, dy = 0) { const p = new Px(w, h); p.blit(this, dx, dy); return p; }
  // Sprinkle: n deterministic pixels of chars inside the shape (seeded).
  speckle(chars, density, seed = 1, test = null) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.filled(x, y) || (test && !test(this.get(x, y), x, y))) continue;
      const r = hash2D(x, y, seed);
      if (r < density) this.put(x, y, chars[Math.floor(hash2D(y, x, seed + 7) * chars.length)]);
    }
    return this;
  }
  rows() {
    const out = [];
    for (let y = 0; y < this.h; y++) out.push(this.d.slice(y * this.w, y * this.w + this.w).join(''));
    return out;
  }
}

export const px = (w, h) => new Px(w, h);

// Shaded solid shape: draw a mask with fn(mask) using any primitives (char ignored), then fill with the ramp
// using a bevel for volume. base = middle shade index.
export function solid(target, drawMask, ramp, { base = 2, hi = 1, lo = -1, light2 = true } = {}) {
  const m = new Px(target.w, target.h);
  drawMask(m, 'x');
  m.map(() => ramp[base]);
  m.bevel(hi, lo);
  if (light2) {
    // second highlight band on the top-left-most edge pixels
    const w = m.w;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < w; x++) {
      if (!m.filled(x, y)) continue;
      if (!m.filled(x - 1, y) && !m.filled(x, y - 1) && !m.filled(x - 1, y - 1)) m.put(x, y, ramp[Math.min(4, base + 2)]);
    }
  }
  target.blit(m);
  return target;
}

// Cylinder-ish horizontal shading across x (for trunks, poles, pipes): returns char for position t in [0,1].
export const cyl = (ramp, t) => (t < 0.18 ? ramp[3] : t < 0.42 ? ramp[2] : t < 0.78 ? ramp[1] : ramp[0]);

// Deterministic per-id pseudo-random helper.
export function rnd(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
export function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Finish a sprite: outline + rows.
export const done = (p, outline = true) => (outline ? p.outline() : p).rows();

// Metal / material ramps per gear tier (1..7): copper, bog iron, cindersteel, prismite, rimesteel, umbral, moon.
export const TIER_METAL = [
  null,
  { m: R.ember, hi: R.flesh, gem: R.teal },       // 1 copper
  { m: R.stone, hi: R.stone, gem: R.sea },        // 2 bog iron
  { m: R.ink, hi: R.ember, gem: R.ember },        // 3 cindersteel
  { m: R.violet, hi: R.ice, gem: R.gold },        // 4 prismite
  { m: R.ice, hi: R.ice, gem: R.sea },            // 5 rimesteel
  { m: R.violet, hi: R.violet, gem: R.teal },     // 6 umbral
  { m: R.gold, hi: R.gold, gem: R.ice },          // 7 moon / tidewright
];

// Swap map turning one 5-shade ramp into another (for palette-swapped tiers).
export function rampSwap(from, to, extra = {}) {
  const m = { ...extra };
  for (let i = 0; i < 5; i++) if (from[i] !== to[i]) m[from[i]] = to[i];
  return m;
}

// Biome ramps for tinting.
export const BIOME_RAMP = {
  greenmarrow: R.grass, saltfen: R.teal, emberreach: R.ember, glasswaste: R.sand, hoarfrost: R.ice, umbral: R.violet,
};
export const BIOME_TIER_RAMP = [null, R.grass, R.teal, R.ember, R.sand, R.ice, R.violet];
