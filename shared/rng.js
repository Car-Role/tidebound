// Deterministic randomness. All gameplay randomness on the server derives from the world seed via fork().

export function hashString(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mix32(a) {
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}

// Stateless integer hash of a 2D lattice point -> [0, 1).
export function hash2D(x, y, seed = 0) {
  let h = mix32((x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2246822519);
  return h / 4294967296;
}

// Smooth value noise in [0, 1) built on hash2D, bilinear with smoothstep.
export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2D(x0, y0, seed), b = hash2D(x0 + 1, y0, seed);
  const c = hash2D(x0, y0 + 1, seed), d = hash2D(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded RNG stream with helpers. fork(name) derives an independent child stream.
export function createRng(seed) {
  const base = seed >>> 0;
  const next = mulberry32(base);
  const rng = {
    seed: base,
    next,
    float: (min = 0, max = 1) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),   // inclusive
    chance: (p) => next() < p,
    pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    sign: () => (next() < 0.5 ? -1 : 1),
    shuffle: (arr) => shuffle(arr, next),
    weighted: (items, weightOf) => weightedPick(items, weightOf, next),
    fork: (name) => createRng(mix32(base ^ hashString(String(name)))),
  };
  return rng;
}

// In-place Fisher-Yates shuffle with a [0,1) source.
export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function seededShuffle(arr, seed) {
  return shuffle(arr.slice(), mulberry32(seed));
}

// weightOf: function(item) -> weight, or a property name. Returns undefined for an empty or zero-weight list.
export function weightedPick(items, weightOf = 'weight', rand = Math.random) {
  const w = typeof weightOf === 'function' ? weightOf : (it) => it[weightOf];
  let total = 0;
  for (const it of items) total += Math.max(0, w(it) || 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const it of items) {
    r -= Math.max(0, w(it) || 0);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
