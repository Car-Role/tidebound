// Ground texture + autotile generator engine (TECH_SPEC 9.3).
// Builds 4 variants per ground id from seeded noise + ordered dithering between ramp shades,
// edge overlays (foam lip) for the 4 directions, and a 2-frame water pattern.
// Biome generators from art/gen/biomes.js (WP3) override the defaults by ground name.

import { RAMPS, CHAR_INDEX, RGBA } from './palette.js';
import { tiles as biomeGens } from './gen/biomes.js';
import { TILE_NAMES, T } from '../../shared/grid.js';
import { hash2D, valueNoise, createRng } from '../../shared/rng.js';

export const TILE_PX = 16;
export const VARIANTS = 4;
const R = RAMPS;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Tile painter handed to generators: works on a 16x16 index buffer.
export function makePainter(seed) {
  const data = new Uint8Array(TILE_PX * TILE_PX);
  const g = {
    data,
    set(x, y, ch) { if (x >= 0 && y >= 0 && x < TILE_PX && y < TILE_PX) data[y * TILE_PX + x] = CHAR_INDEX[ch] ?? 0; },
    fill(ch) { data.fill(CHAR_INDEX[ch] ?? 0); },
    // Tileable value noise in [0,1): wraps every 16 px so neighbouring tiles join.
    noise(x, y, scale = 4) {
      const p = TILE_PX / scale;
      const fx = x / scale, fy = y / scale;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const h = (a, b) => hash2D(((a % p) + p) % p, ((b % p) + p) % p, seed);
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    },
    // Ordered dither: returns `a` with probability ~p (by Bayer threshold), else `b`.
    dither(x, y, a, b, p) { return BAYER[(y & 3) * 4 + (x & 3)] < p ? a : b; },
  };
  return g;
}

// Default ground painter: base/alt shades dithered by noise, plus sparse details.
function basic(base, alt, detail = [], detailChance = 0.03) {
  return (g, rng) => {
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = g.noise(x, y, 8) * 0.7 + g.noise(x, y, 4) * 0.3;
      g.set(x, y, g.dither(x, y, alt, base, (n - 0.35) * 1.6));
    }
    const count = Math.round(TILE_PX * TILE_PX * detailChance);
    for (let i = 0; i < count && detail.length; i++) {
      const x = rng.int(0, 15), y = rng.int(0, 15);
      g.set(x, y, rng.pick(detail));
    }
  };
}

function grassy(g, rng) {
  basic(R.grass[2], R.grass[3], [R.grass[1], R.grass[1], R.grass[4]], 0.05)(g, rng);
  if (rng.chance(0.35)) {                        // a small flower
    const x = rng.int(2, 13), y = rng.int(2, 13), c = rng.pick([R.gold[4], '#', R.violet[4], R.ember[4]]);
    g.set(x, y, c); g.set(x - 1, y, R.grass[4]); g.set(x + 1, y, R.grass[4]); g.set(x, y + 1, R.grass[1]);
  }
  for (let i = 0; i < 4; i++) {                  // grass blades
    const x = rng.int(0, 15), y = rng.int(1, 15);
    g.set(x, y, R.grass[4]); g.set(x, y - 1, R.grass[3]);
  }
}

function soil(g) {
  for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
    const furrow = y % 4 === 3;
    g.set(x, y, furrow ? R.brown[0] : g.dither(x, y, R.brown[2], R.brown[1], g.noise(x, y, 4) * 0.6));
  }
}

function cobbles(base, mortar, light) {
  return (g) => {
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const row = y >> 2, off = row & 1 ? 2 : 0;
      const edge = y % 4 === 0 || (x + off) % 6 === 0;
      g.set(x, y, edge ? mortar : g.dither(x, y, light, base, g.noise(x, y, 4) * 0.5));
    }
  };
}

function lava(g, rng) {
  basic(R.ember[2], R.ember[3], [R.ember[4], R.gold[4]], 0.06)(g, rng);
}

export const DEFAULT_GENERATORS = {
  deep: basic(R.sea[1], R.sea[2]),
  shallow: basic(R.sea[2], R.sea[3]),
  tidal: basic(R.sand[1], R.sand[0], [R.sea[3], R.sand[2]], 0.04),
  sand: basic(R.sand[2], R.sand[3], [R.sand[1], R.sand[4], '#'], 0.04),
  greenmarrow: grassy,
  saltfen: basic(R.teal[2], R.teal[1], [R.sand[4], R.teal[3]], 0.05),
  emberreach: basic(R.ink[2], R.ink[3], [R.ember[2], R.ember[3], R.stone[0]], 0.05),
  glasswaste: basic(R.sand[3], R.sand[4], [R.ice[3], R.violet[4], '#'], 0.04),
  hoarfrost: basic(R.ice[3], R.ice[4], [R.ice[2], '#'], 0.04),
  umbral: basic(R.violet[0], R.ink[2], [R.violet[3], R.violet[2]], 0.04),
  soil,
  path: cobbles(R.sand[1], R.brown[1], R.sand[2]),
  lava,
  ice: basic(R.ice[2], R.ice[3], ['#', R.ice[4]], 0.05),
  ink: basic(R.ink[1], R.violet[0], [R.violet[2]], 0.03),
  dungeon_floor: cobbles(R.stone[1], R.stone[0], R.stone[2]),
  dungeon_wall: basic(R.ink[2], R.stone[0], [R.stone[1]], 0.05),
  empty: (g) => g.fill('0'),
};

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toCanvas(data, w = TILE_PX, h = TILE_PX) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (!p) continue;
    img.data[i * 4] = RGBA[p * 4]; img.data[i * 4 + 1] = RGBA[p * 4 + 1]; img.data[i * 4 + 2] = RGBA[p * 4 + 2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class TileSet {
  constructor(seed = 1) {
    this.seed = seed;
    this.ground = [];       // ground id -> canvas[VARIANTS]
    this.edges = [];        // dir 0..3 (E, S, W, N) -> foam overlay canvas
    this.water = [];        // 2 frames, 64x64
  }

  build() {
    TILE_NAMES.forEach((name, id) => {
      const gen = biomeGens[name] || DEFAULT_GENERATORS[name] || DEFAULT_GENERATORS.empty;
      const list = [];
      for (let v = 0; v < VARIANTS; v++) {
        const g = makePainter(this.seed * 31 + id * 7 + v);
        try { gen(g, createRng(this.seed ^ (id * 977 + v * 131))); } catch (err) { console.warn('[tb:tilegen]', name, err); }
        list.push(toCanvas(g.data));
      }
      this.ground[id] = list;
    });
    this.buildEdges();
    this.buildWater();
    return this;
  }

  // Foam lip along one edge: dir 0 = east, 1 = south, 2 = west, 3 = north (the side facing water).
  buildEdges() {
    for (let dir = 0; dir < 4; dir++) {
      const data = new Uint8Array(TILE_PX * TILE_PX);
      for (let i = 0; i < TILE_PX; i++) {
        const wob = hash2D(i, dir, 5) > 0.6 ? 1 : 0;
        for (let d = 0; d < 2 + wob; d++) {
          const ch = d === 0 ? '#' : d === 1 ? R.ice[4] : R.sand[4];
          let x, y;
          if (dir === 0) { x = TILE_PX - 1 - d; y = i; }
          else if (dir === 1) { x = i; y = TILE_PX - 1 - d; }
          else if (dir === 2) { x = d; y = i; }
          else { x = i; y = d; }
          data[y * TILE_PX + x] = CHAR_INDEX[ch];
        }
      }
      this.edges[dir] = toCanvas(data);
    }
  }

  // 2-frame deep-water pattern with scrolling highlight dashes (64x64, tileable).
  buildWater() {
    for (let f = 0; f < 2; f++) {
      const S = 64;
      const data = new Uint8Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = valueNoise((x % S) / 9, y / 9, 17 + f) * 0.5 + 0.25;
        data[y * S + x] = CHAR_INDEX[BAYER[(y & 3) * 4 + (x & 3)] < n * 0.5 ? R.sea[2] : R.sea[1]];
      }
      const rng = createRng(99 + f);
      for (let i = 0; i < 14; i++) {
        const x0 = rng.int(0, S - 1), y0 = rng.int(0, S - 1), len = rng.int(2, 5);
        for (let k = 0; k < len; k++) data[y0 * S + ((x0 + k) % S)] = CHAR_INDEX[k === 0 || k === len - 1 ? R.sea[3] : R.sea[4]];
      }
      this.water[f] = toCanvas(data, S, S);
    }
  }

  variantAt(tx, ty) { return Math.floor(hash2D(tx, ty, this.seed) * VARIANTS); }
}

export { T };
