// Core sprites (WP1b): player body (down/up/side x idle 2 + run 4, 8 colour variants), cursor, shadow,
// one tree, one rock, and water/grass/sand swatches. Authored with a readable legend, then mapped to palette chars.

import { RAMPS, PLAYER_RAMPS } from '../palette.js';
import { hash2D } from '../../../shared/rng.js';

const R = RAMPS;
const map = (rows, legend) => rows.map((r) => [...r].map((c) => legend[c] ?? c).join(''));

// ---------------------------------------------------------------- player
// legend: o outline, h hair, H hair light, s skin, k skin shade, e eye, c shirt, C shirt shade, L shirt light,
//         p pants, P pants shade, b boot
const PLAYER_LEGEND = {
  o: R.ink[0], h: R.brown[2], H: R.brown[3], s: R.flesh[3], k: R.flesh[2], e: R.ink[0],
  c: R.teal[3], C: R.teal[2], L: R.teal[4], p: R.sea[1], P: R.sea[0], b: R.brown[1],
};

const DOWN = [
  '................',
  '....oooooooo....',
  '...ohhHHHHhho...',
  '...ohHHHHHHho...',
  '...ohssssssho...',
  '...osesssseso...',
  '...okssssssko...',
  '....okkkkkko....',
  '...oCccccccCo...',
  '..osCccLLccCso..',
  '..osCccLLccCso..',
  '..okCccccccCko..',
  '...oCCCCCCCCo...',
  '...oppppppppo...',
  '...oppPppPppo...',
  '...oppo..oppo...',
  '...oppo..oppo...',
  '...obbo..obbo...',
  '...oooo..oooo...',
  '................',
];
const UP = [
  '................',
  '....oooooooo....',
  '...ohhHHHHhho...',
  '...ohHHHHHHho...',
  '...ohhHHHHhho...',
  '...ohhhhhhhho...',
  '...okhhhhhhko...',
  '....okkkkkko....',
  '...oCccccccCo...',
  '..osCccccccCso..',
  '..osCccccccCso..',
  '..okCccccccCko..',
  '...oCCCCCCCCo...',
  '...oppppppppo...',
  '...oppPppPppo...',
  '...oppo..oppo...',
  '...oppo..oppo...',
  '...obbo..obbo...',
  '...oooo..oooo...',
  '................',
];
const SIDE = [
  '................',
  '....oooooooo....',
  '...ohhHHHHhho...',
  '...ohHHHHHHho...',
  '...ohhhsssssoo..',
  '...ohhsssseso...',
  '...ohkssssssko..',
  '....okkkkkko....',
  '....oCcccccCo...',
  '....oCcLsccCo...',
  '....oCcLsccCo...',
  '....oCcccccCo...',
  '....oCCCCCCCo...',
  '....opppppppo...',
  '....opppPpppo...',
  '....oppooppo....',
  '....oppooppo....',
  '....obboobbo....',
  '....oooooooo....',
  '................',
];

const LEGS = { down: [[3, 6], [9, 12]], up: [[3, 6], [9, 12]], side: [[4, 7], [8, 11]] };
const LEG_TOP = 14, LEG_BOTTOM = 18;

const shiftUp = (rows) => [...rows.slice(1), '.'.repeat(16)];
function liftLeg(rows, [c0, c1]) {
  const g = rows.map((r) => [...r]);
  for (let r = LEG_TOP; r <= LEG_BOTTOM; r++) {
    for (let c = c0; c <= c1; c++) g[r][c] = r < LEG_BOTTOM ? rows[r + 1][c] : '.';
  }
  return g.map((r) => r.join(''));
}
function breathe(rows) {
  const out = rows.slice();
  for (let r = 11; r >= 2; r--) out[r] = rows[r - 1];
  out[1] = '.'.repeat(16);
  return out;
}

function playerAnims() {
  const anims = {};
  for (const [dir, base] of [['down', DOWN], ['up', UP], ['side', SIDE]]) {
    const [left, right] = LEGS[dir];
    anims[`idle_${dir}`] = [base, breathe(base)].map((f) => map(f, PLAYER_LEGEND));
    anims[`run_${dir}`] = [base, shiftUp(liftLeg(base, left)), base, shiftUp(liftLeg(base, right))].map((f) => map(f, PLAYER_LEGEND));
  }
  return anims;
}

// Colour variants 0..7 swap the shirt ramp (teal) for each player ramp.
const shirtVariants = PLAYER_RAMPS.map((name) => ({
  [R.teal[2]]: R[name][2], [R.teal[3]]: R[name][3], [R.teal[4]]: R[name][4],
}));

// ---------------------------------------------------------------- generated shapes

function grid(w, h, fn) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += fn(x, y) ?? '.';
    rows.push(s);
  }
  return rows;
}

// Bentwood tree: rounded canopy with top-left light, curved trunk.
function tree() {
  const g = R.grass, b = R.brown;
  const canopy = (x, y) => {
    const dx = (x + 0.5 - 8) / 7.5, dy = (y + 0.5 - 9) / 8.5;
    const d = dx * dx + dy * dy + (hash2D(x, y, 3) - 0.5) * 0.18;
    if (d > 1) return null;
    if (d > 0.82) return g[0];
    const light = -dx * 0.6 - dy * 0.8 + (hash2D(x, y, 7) - 0.5) * 0.5;
    return light > 0.75 ? g[4] : light > 0.25 ? g[3] : light > -0.35 ? g[2] : g[1];
  };
  return grid(16, 32, (x, y) => {
    if (y < 19) { const c = canopy(x, y); if (c) return c; }
    const bend = Math.round(Math.sin(y / 5) * 0.8);
    const tx = 7 + bend;
    if (y >= 15 && y <= 30 && x >= tx - 1 && x <= tx + 2) {
      if (x === tx - 1 || x === tx + 2) return b[0];
      return x === tx ? b[3] : b[2];
    }
    if (y === 30 && (x === tx - 2 || x === tx + 3)) return b[1];
    if (y >= 15 && y < 19) return canopy(x, y);
    return null;
  });
}

function rock() {
  const s = R.stone;
  return grid(16, 16, (x, y) => {
    const dx = (x + 0.5 - 8) / 7, dy = (y + 0.5 - 10) / 5.5;
    const d = dx * dx + dy * dy + (hash2D(x, y, 11) - 0.5) * 0.15;
    if (d > 1) return null;
    if (d > 0.8) return s[0];
    const light = -dx * 0.7 - dy * 0.9 + (hash2D(x >> 1, y >> 1, 5) - 0.5) * 0.4;
    if ((x + y * 3) % 11 === 0 && d < 0.5) return s[1];
    return light > 0.7 ? s[4] : light > 0.1 ? s[3] : light > -0.5 ? s[2] : s[1];
  });
}

function swatch(ramp, seed) {
  return grid(16, 16, (x, y) => {
    const n = hash2D(x, y, seed);
    return n > 0.9 ? ramp[3] : n > 0.55 ? ramp[2] : ramp[1];
  });
}

const W = R.ink[0], Y = R.gold[4];
const CURSOR = map([
  'oo..........oo..',
  'oWo........oWo..',
  '.o..........o...',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.o..........o...',
  'oWo........oWo..',
  'oo..........oo..',
  '................',
], { o: W, W: Y });

export default {
  'pl.body': { w: 16, h: 20, fps: 8, anchor: [8, 19], mirror: true, anims: playerAnims(), variants: shirtVariants },
  'core.cursor': { w: 16, h: 16, anchor: [0, 0], px: CURSOR },
  'core.shadow': { w: 12, h: 4, anchor: [6, 2], px: map(['..oooooooo..', '.oooooooooo.', '.oooooooooo.', '..oooooooo..'], { o: R.ink[1] }) },
  'core.tree': { w: 16, h: 32, anchor: [8, 30], px: tree() },
  'core.rock': { w: 16, h: 16, anchor: [8, 15], px: rock() },
  'core.water': { w: 16, h: 16, anchor: [0, 0], px: swatch(R.sea, 21) },
  'core.grass': { w: 16, h: 16, anchor: [0, 0], px: swatch(R.grass, 22) },
  'core.sand': { w: 16, h: 16, anchor: [0, 0], px: swatch(R.sand, 23) },
};
