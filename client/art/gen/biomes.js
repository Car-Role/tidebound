// WP3 ground tile generators per ground type (all TILE_NAMES) plus dungeon tilesets.
// Contract (tilegen.js): tiles[groundName] = (g, rng) => void, drawing one 16x16 tile.
//   g: { set(x, y, ch), fill(ch), noise(x, y, scale), dither(x, y, a, b, p) }; rng: shared/rng createRng.
// The base texture of each ground uses a fixed-seed tileable field shared by all 4 variants, so neighbouring tiles
// join without seams; the variants differ in sprinkled details (flowers, pebbles, cracks, shards).

import { RAMPS } from '../palette.js';
import { hash2D } from '../../../shared/rng.js';

const R = RAMPS;
const N = 16;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Tileable value noise with period 16 px. Lattice points on the tile border use the fixed seed (so every
// variant joins every other one seamlessly); interior lattice points also mix in the per-variant seed VSEED,
// which breaks up the 16 px repetition across the 4 variants.
let VSEED = 0;
function tnoise(x, y, scale, seed) {
  const p = N / scale, fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const h = (a, b) => {
    const ia = ((a % p) + p) % p, ib = ((b % p) + p) % p;
    return hash2D(ia, ib, ia === 0 || ib === 0 ? seed : seed + VSEED * 7919);
  };
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y, seed) => tnoise(x, y, 8, seed) * 0.6 + tnoise(x, y, 4, seed + 1) * 0.3 + tnoise(x, y, 2, seed + 2) * 0.1;

// Base: 3 shades from a ramp, dithered by fbm (lo, mid, hi indexes).
function base(g, ramp, seed, [lo, mid, hi] = [1, 2, 3], spread = 1) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = (fbm(x, y, seed) - 0.5) * spread + 0.5;
    const t = bay(x, y);
    const ch = n < 0.36 ? (n + t * 0.12 < 0.33 ? ramp[lo] : ramp[mid]) : n > 0.64 ? (n - t * 0.12 > 0.67 ? ramp[hi] : ramp[mid]) : ramp[mid];
    g.set(x, y, typeof ch === 'string' ? ch : ramp[mid]);
  }
}
const wrap = (v) => ((v % N) + N) % N;
const put = (g, x, y, c) => g.set(wrap(x), wrap(y), c);

function blades(g, rng, n, dark, light) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    put(g, x, y, dark); put(g, x, y - 1, light);
    if (rng.chance(0.4)) put(g, x + 1, y, dark);
  }
}
function flower(g, x, y, petal, center) {
  put(g, x, y - 1, petal); put(g, x - 1, y, petal); put(g, x + 1, y, petal); put(g, x, y + 1, petal); put(g, x, y, center);
}
function pebble(g, x, y, r) { put(g, x, y, r[3]); put(g, x + 1, y, r[2]); put(g, x, y + 1, r[1]); put(g, x + 1, y + 1, r[1]); put(g, x, y - 0, r[4]); }

export const tiles = {
  deep(g) { base(g, R.sea, 101, [0, 1, 2]); },
  shallow(g) { base(g, R.sea, 102, [2, 3, 4]); },

  tidal(g, rng) {
    base(g, R.sand, 103, [0, 1, 2]);
    // ripple lines of wet sand
    for (let y = 2; y < N; y += 5) for (let x = 0; x < N; x++) if (Math.sin(x * 0.8 + y) > 0.2) put(g, x, y + Math.round(Math.sin(x * 0.5) * 0.6), R.sand[0]);
    if (rng.chance(0.5)) { const x = rng.int(2, 12), y = rng.int(2, 12); for (let k = 0; k < 4; k++) put(g, x + k, y, k === 0 ? R.sea[4] : R.sea[3]); put(g, x + 1, y + 1, R.sea[2]); }
    if (rng.chance(0.3)) { const x = rng.int(1, 14), y = rng.int(1, 14); put(g, x, y, R.flesh[4]); put(g, x + 1, y, R.flesh[3]); }
  },

  sand(g, rng) {
    base(g, R.sand, 104, [1, 2, 3], 0.8);
    for (let y = 3; y < N; y += 6) for (let x = 0; x < N; x++) {
      const yy = y + Math.round(Math.sin((x + y) * 0.55) * 1.2);
      if (bay(x, yy) < 0.7) put(g, x, yy, R.sand[1]);
      put(g, x, yy - 1, R.sand[3]);
    }
    for (let i = 0; i < 3; i++) if (rng.chance(0.5)) put(g, rng.int(0, 15), rng.int(0, 15), rng.pick([R.sand[4], R.stone[3], R.flesh[4]]));
    if (rng.chance(0.25)) pebble(g, rng.int(1, 13), rng.int(1, 13), R.stone);
  },

  // Greenmarrow: soft meadow, light grass with clover, little flowers and yellow reeds.
  greenmarrow(g, rng) {
    base(g, R.grass, 105, [2, 2, 3], 1.2);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fbm(x, y, 205) > 0.68 && bay(x, y) < 0.5) g.set(x, y, R.grass[1]);
    blades(g, rng, 7, R.grass[1], R.grass[4]);
    if (rng.chance(0.45)) flower(g, rng.int(2, 13), rng.int(2, 13), rng.pick([R.gold[4], '#', R.violet[4], R.ember[4], R.flesh[4]]), R.gold[3]);
    if (rng.chance(0.3)) { const x = rng.int(1, 14), y = rng.int(3, 14); for (let k = 0; k < 3; k++) put(g, x + k, y - (k % 2), R.gold[3]); put(g, x + 1, y - 2, R.gold[4]); }
    if (rng.chance(0.2)) pebble(g, rng.int(1, 13), rng.int(1, 13), R.stone);
  },

  // Saltfen: teal marsh with mud, brackish puddles and salt crust.
  saltfen(g, rng) {
    base(g, R.teal, 106, [1, 2, 3]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const m = fbm(x, y, 306);
      if (m > 0.66) g.set(x, y, bay(x, y) < 0.6 ? R.brown[1] : R.teal[1]);
      if (m > 0.74) g.set(x, y, R.sea[1]);
      if (m > 0.74 && fbm(x, y - 1, 306) <= 0.74) g.set(x, y, R.sea[3]);
    }
    blades(g, rng, 4, R.teal[1], R.teal[4]);
    for (let i = 0; i < 4; i++) if (rng.chance(0.6)) put(g, rng.int(0, 15), rng.int(0, 15), rng.pick(['#', R.ice[4], R.sand[4]]));
    if (rng.chance(0.3)) { const x = rng.int(2, 13), y = rng.int(4, 14); put(g, x, y, R.sand[3]); put(g, x, y - 1, R.sand[3]); put(g, x, y - 2, R.brown[3]); }
  },

  // Emberreach: black basalt plates with glowing lava seams and ash.
  emberreach(g, rng) {
    base(g, R.ink, 107, [2, 3, 3], 0.9);
    // basalt plate seams (tileable cell edges)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = tnoise(x, y, 4, 407), b = tnoise(x + 1, y, 4, 407), c = tnoise(x, y + 1, 4, 407);
      if ((a > 0.5) !== (b > 0.5) || (a > 0.5) !== (c > 0.5)) g.set(x, y, R.ink[1]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fbm(x, y, 507) > 0.72) g.set(x, y, R.ink[4]);
    if (rng.chance(0.35)) {
      let x = rng.int(0, 15), y = rng.int(0, 15);
      for (let k = 0; k < 7; k++) { put(g, x, y, k % 3 === 1 ? R.ember[3] : R.ember[2]); x += rng.int(0, 1); y += rng.int(-1, 1) || 1; }
    }
    for (let i = 0; i < 3; i++) put(g, rng.int(0, 15), rng.int(0, 15), rng.pick([R.stone[1], R.stone[0], R.ember[1]]));
  },

  // Glasswaste: pale sand dusted with fused-glass shards and prism glints.
  glasswaste(g, rng) {
    base(g, R.sand, 108, [2, 3, 4], 0.9);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fbm(x, y, 308) > 0.7) g.set(x, y, bay(x, y) < 0.5 ? R.ice[3] : R.sand[4]);
    for (let i = 0; i < 3; i++) {
      if (!rng.chance(0.6)) continue;
      const x = rng.int(1, 14), y = rng.int(1, 14), c = rng.pick([R.ice, R.violet, R.ice]);
      put(g, x, y, c[4]); put(g, x + 1, y + 1, c[2]); put(g, x, y + 1, c[3]);
    }
    if (rng.chance(0.4)) put(g, rng.int(0, 15), rng.int(0, 15), '#');
    if (rng.chance(0.25)) { const x = rng.int(2, 13), y = rng.int(2, 13); put(g, x, y, R.gold[4]); put(g, x + 1, y, R.violet[4]); put(g, x + 2, y, R.teal[4]); }
  },

  // Hoarfrost: blue snow with soft drifts, sparkles and hairline ice cracks.
  hoarfrost(g, rng) {
    base(g, R.ice, 109, [3, 3, 4], 1.1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x, y, 309);
      if (n < 0.32) g.set(x, y, bay(x, y) < 0.5 ? R.ice[2] : R.ice[3]);
      if (n > 0.66 && fbm(x, y + 1, 309) <= 0.66) g.set(x, y, '#');
    }
    for (let i = 0; i < 3; i++) if (rng.chance(0.6)) put(g, rng.int(0, 15), rng.int(0, 15), '#');
    if (rng.chance(0.25)) { let x = rng.int(2, 12), y = rng.int(2, 12); for (let k = 0; k < 5; k++) { put(g, x, y, R.ice[2]); x += 1; y += rng.int(-1, 1); } }
    if (rng.chance(0.2)) { const x = rng.int(2, 13), y = rng.int(2, 13); put(g, x, y, R.teal[2]); put(g, x + 1, y, R.teal[3]); }
  },

  // Umbral: violet-black silt with faint glowing ink veins and motes.
  umbral(g, rng) {
    base(g, R.violet, 110, [0, 0, 1], 1.0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x, y, 310);
      if (n < 0.35 && bay(x, y) < 0.6) g.set(x, y, R.ink[2]);
      const v = tnoise(x, y, 4, 410);
      if (Math.abs(v - 0.5) < 0.025) g.set(x, y, R.violet[2]);
    }
    for (let i = 0; i < 3; i++) if (rng.chance(0.5)) put(g, rng.int(0, 15), rng.int(0, 15), rng.pick([R.teal[3], R.violet[3], R.violet[4]]));
    if (rng.chance(0.2)) { const x = rng.int(2, 12), y = rng.int(2, 12); put(g, x, y, R.teal[4]); put(g, x + 1, y, R.teal[2]); put(g, x, y + 1, R.teal[2]); }
  },

  soil(g, rng) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = y % 4;
      const n = tnoise(x, y, 4, 111);
      const ch = row === 3 ? R.brown[0] : row === 0 ? (n > 0.5 ? R.brown[3] : R.brown[2]) : bay(x, y) < n * 0.7 ? R.brown[2] : R.brown[1];
      g.set(x, y, ch);
    }
    for (let i = 0; i < 4; i++) put(g, rng.int(0, 15), rng.int(0, 15) | 1, rng.pick([R.brown[3], R.stone[2]]));
  },

  path(g, rng) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = y >> 2, off = row & 1 ? 3 : 0;
      const ex = (x + off) % 6, ey = y % 4;
      let ch;
      if (ey === 0 || ex === 0) ch = R.brown[1];
      else if (ey === 1 || ex === 1) ch = R.sand[3];
      else if (ey === 3 || ex === 5) ch = R.sand[1];
      else ch = bay(x, y) < 0.3 ? R.sand[1] : R.sand[2];
      g.set(x, y, ch);
    }
    if (rng.chance(0.3)) put(g, rng.int(0, 15), rng.int(0, 15), R.grass[2]);
  },

  lava(g, rng) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x, y, 112);
      g.set(x, y, n > 0.62 ? R.gold[4] : n > 0.5 ? R.ember[4] : n > 0.36 ? R.ember[3] : n > 0.27 ? R.ember[2] : R.ink[2]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (tnoise(x, y, 4, 212) > 0.74) g.set(x, y, bay(x, y) < 0.5 ? R.ink[1] : R.ink[2]);
    if (rng.chance(0.4)) put(g, rng.int(0, 15), rng.int(0, 15), '#');
  },

  ice(g, rng) {
    base(g, R.ice, 113, [2, 2, 3], 0.7);
    for (let k = 0; k < 2; k++) if (rng.chance(0.6)) { const x = rng.int(0, 15), y = rng.int(4, 15); for (let i = 0; i < 4; i++) put(g, x + i, y - i, R.ice[4]); }
    if (rng.chance(0.4)) { let x = rng.int(1, 13), y = rng.int(1, 13); for (let k = 0; k < 6; k++) { put(g, x, y, R.ice[1]); x += rng.int(0, 1); y += 1; } }
    if (rng.chance(0.3)) put(g, rng.int(0, 15), rng.int(0, 15), '#');
  },

  ink(g, rng) {
    base(g, R.ink, 114, [0, 1, 1], 1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = tnoise(x, y, 4, 214) * 0.7 + tnoise(x, y, 2, 215) * 0.3;
      if (Math.abs(v - 0.5) < 0.04) g.set(x, y, R.violet[1]);
      if (Math.abs(v - 0.3) < 0.025) g.set(x, y, R.teal[1]);
    }
    if (rng.chance(0.4)) { const x = rng.int(1, 13), y = rng.int(1, 13); put(g, x, y, R.teal[3]); put(g, x + 1, y, R.violet[3]); }
  },

  dungeon_floor(g, rng) { flagstones(g, rng, R.stone, R.ink[1], 115); },
  dungeon_wall(g, rng) { wall(g, rng, R.stone, R.ink, 116); },
  empty(g) { g.fill('0'); },
};

// ------------------------------------------------------------------ dungeon tilesets

function flagstones(g, rng, ramp, grout, seed) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const bx = y < 8 ? x : (x + 4) % N;
    const edge = y % 8 === 0 || bx % 8 === 0;
    const hi = y % 8 === 1 || bx % 8 === 1;
    const lo = y % 8 === 7 || bx % 8 === 7;
    const n = tnoise(x, y, 4, seed);
    g.set(x, y, edge ? grout : hi ? ramp[2] : lo ? ramp[0] : bay(x, y) < n * 0.6 ? ramp[2] : ramp[1]);
  }
  if (rng.chance(0.35)) { let x = rng.int(2, 13), y = rng.int(2, 13); for (let k = 0; k < 4; k++) { put(g, x, y, grout); x += rng.int(-1, 1); y += 1; } }
}
function wall(g, rng, ramp, dark, seed) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = y >> 2, off = row & 1 ? 4 : 0;
    const ex = (x + off) % 8, ey = y % 4;
    const n = tnoise(x, y, 4, seed);
    g.set(x, y, ey === 3 || ex === 7 ? dark[0] : ey === 0 ? ramp[2] : bay(x, y) < n * 0.5 ? ramp[1] : ramp[0]);
  }
  for (let x = 0; x < N; x++) g.set(x, 15, dark[0]);
  if (rng.chance(0.3)) put(g, rng.int(0, 15), rng.int(0, 14), dark[1]);
}
function overlay(g, rng, chars, p) {
  for (let i = 0; i < 6; i++) if (rng.chance(p)) put(g, rng.int(0, 15), rng.int(0, 15), rng.pick(chars));
}

// Per-Vault tilesets (dungeons.js `tileset`): { floor, wall } painters with the same (g, rng) contract.
// WP10 can build them with tilegen's makePainter(seed) + these functions (see docs/notes/WP3-WP12.md).
export const dungeonTiles = {
  vault_root: {
    floor: (g, rng) => { flagstones(g, rng, R.brown, R.ink[1], 120); overlay(g, rng, [R.grass[2], R.grass[3]], 0.5); if (rng.chance(0.4)) { const x = rng.int(0, 12); for (let k = 0; k < 4; k++) put(g, x + k, 6 + (k % 2), R.grass[1]); } },
    wall: (g, rng) => { wall(g, rng, R.brown, R.ink, 121); overlay(g, rng, [R.grass[2], R.grass[3], R.grass[1]], 0.7); },
  },
  vault_cistern: {
    floor: (g, rng) => { flagstones(g, rng, R.teal, R.ink[1], 122); overlay(g, rng, [R.sea[3], R.teal[4]], 0.4); },
    wall: (g, rng) => { wall(g, rng, R.teal, R.ink, 123); overlay(g, rng, [R.sea[2], R.ice[4]], 0.3); },
  },
  vault_slag: {
    floor: (g, rng) => { flagstones(g, rng, R.ink, R.ember[1], 124); overlay(g, rng, [R.ember[2], R.ember[3]], 0.4); },
    wall: (g, rng) => { wall(g, rng, R.ink, R.ink, 125); overlay(g, rng, [R.ember[2], R.gold[3]], 0.3); },
  },
  vault_prism: {
    floor: (g, rng) => { flagstones(g, rng, R.sand, R.violet[1], 126); overlay(g, rng, [R.ice[4], R.violet[4], '#'], 0.4); },
    wall: (g, rng) => { wall(g, rng, R.violet, R.ink, 127); overlay(g, rng, [R.ice[4], R.violet[4]], 0.5); },
  },
  vault_ice: {
    floor: (g, rng) => { flagstones(g, rng, R.ice, R.sea[1], 128); overlay(g, rng, ['#'], 0.4); },
    wall: (g, rng) => { wall(g, rng, R.ice, R.sea, 129); overlay(g, rng, ['#', R.ice[4]], 0.4); },
  },
  vault_ink: {
    floor: (g, rng) => { flagstones(g, rng, R.ink, R.violet[0], 130); overlay(g, rng, [R.violet[3], R.teal[3]], 0.35); },
    wall: (g, rng) => { wall(g, rng, R.violet, R.ink, 131); overlay(g, rng, [R.teal[2], R.violet[3]], 0.3); },
  },
  trench: {
    floor: (g, rng) => { flagstones(g, rng, R.sea, R.ink[0], 132); overlay(g, rng, [R.teal[3], R.ice[4]], 0.3); },
    wall: (g, rng) => { wall(g, rng, R.sea, R.ink, 133); overlay(g, rng, [R.teal[2]], 0.3); },
  },
};

// Seed each call with a per-variant value (drawn from the variant's rng) before painting.
function seeded(fn) { return (g, rng) => { VSEED = rng.int(1, 999983); fn(g, rng); }; }
for (const k of Object.keys(tiles)) tiles[k] = seeded(tiles[k]);
for (const set of Object.values(dungeonTiles)) { set.floor = seeded(set.floor); set.wall = seeded(set.wall); }

export default tiles;
