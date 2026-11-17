// WP3 large-sprite generators: the six Beacons, the Tidestone, the Archive, the Tidegate site and its five
// construction stages, the arena, Vault and Trench entrances, puzzle shrines and dig spots.
// Export LANDMARKS: { <structure id>: [drawFn(frame) -> Px, frameCount, fps], __extra: { spriteId: def } }.

import { Px, R, INK, done, band } from './paint.js';
import { W, masonry, gable, post, flame, glow, band2, rivets, footShadow, rune, planks } from './build.js';

const BIOME_STONE = [null, R.stone, R.teal, R.ink, R.sand, R.ice, R.violet];
const BIOME_FIRE = [null, R.grass, R.teal, R.ember, R.violet, R.ice, R.violet];
const BIOME_TRIM = [null, R.grass, R.sea, R.ember, R.gold, R.sea, R.teal];

// ------------------------------------------------------------------ beacons

function beacon(k, f) {
  const p = new Px(48, 84);
  const st = BIOME_STONE[k], fire = BIOME_FIRE[k], trim = BIOME_TRIM[k];
  footShadow(p, 24, 79, 23, 4);
  // stepped plinth
  masonry(p, 2, 68, 44, 12, st, 8, 4);
  p.rect(1, 66, 46, 3, st[4]); p.hline(1, 46, 68, st[2]);
  masonry(p, 8, 58, 32, 9, st, 8, 3);
  p.rect(7, 56, 34, 3, st[3]); p.hline(7, 40, 56, st[4]);
  // tower (tapering)
  for (let y = 22; y < 57; y++) {
    const hw = Math.round(9 + (y - 22) * 0.12);
    for (let x = 24 - hw; x < 24 + hw; x++) {
      const t = (x - (24 - hw)) / (2 * hw);
      let c = t < 0.15 ? st[3] : t < 0.55 ? st[2] : t < 0.85 ? st[1] : st[0];
      if ((y - 22) % 5 === 0) c = st[0];
      else if (((x + (Math.floor((y - 22) / 5) % 2) * 3) % 7) === 0) c = st[1];
      p.set(x, y, c);
    }
  }
  // trim bands and glyph
  band2(p, 14, 30, 20, trim); band2(p, 13, 48, 22, trim);
  rune(p, 22, 37, ['', 'star', 'wave', 'eye', 'star', 'moon', 'eye'][k], fire[4]);
  // door
  p.rect(20, 58, 8, 9, INK); p.ellipse(24, 58, 4, 3, INK); p.rect(21, 61, 6, 6, fire[1]);
  // brazier bowl + crown
  p.poly([[11, 16], [37, 16], [33, 23], [15, 23]], st[2]); p.hline(11, 37, 16, st[4]); p.hline(15, 33, 23, st[0]);
  for (const x of [12, 20, 28, 35]) p.poly([[x - 1, 16], [x + 1, 11], [x + 2, 16]], trim[3]);
  // flame / crystal
  const flick = [0, 1, 2][f % 3];
  if (k === 4 || k === 5) {
    // glass prism or ice crystal burning with light
    p.poly([[18, 16], [20, 4 - flick], [24, 0], [28, 4 - flick], [30, 16]], fire[3]);
    p.poly([[18, 16], [20, 4 - flick], [24, 0], [24, 16]], fire[4]);
    p.line(24, 2, 24, 15, W);
  } else {
    flame(p, 24, 15, 15 + flick, f, fire, k === 3 ? R.gold : fire);
    flame(p, 19, 15, 8, f + 1, fire, fire); flame(p, 29, 15, 8, f + 2, fire, fire);
  }
  glow(p, 24, 9, 12, fire);
  return p;
}

// ------------------------------------------------------------------ world landmarks

function tidestone(f) {
  const p = new Px(32, 56);
  footShadow(p, 16, 52, 15, 3);
  p.ellipse(16, 50, 14, 4, (x, y, nx) => band(R.stone, 0.5 - nx * 0.3));
  p.poly([[7, 50], [8, 12], [12, 4], [20, 4], [24, 12], [25, 50]], (x) => (x < 12 ? R.stone[3] : x < 19 ? R.stone[2] : x < 23 ? R.stone[1] : R.stone[0]));
  p.line(8, 12, 12, 4, R.stone[4]); p.hline(12, 19, 4, R.stone[4]);
  // carved rings
  const c = f === 0 ? R.teal[2] : f === 1 ? R.teal[3] : R.teal[4];
  p.ellipse(16, 22, 5, 5, c); p.ellipse(16, 22, 3.6, 3.6, R.stone[2]); p.ellipse(16, 22, 2, 2, c);
  rune(p, 14, 32, 'wave', c); rune(p, 14, 40, 'moon', c);
  p.speckle([R.grass[2], R.grass[3]], 0.08, 7, (ch, x, y) => y > 40);
  if (f) glow(p, 16, 22, 9, R.teal);
  return p;
}
function archive() {
  const p = new Px(64, 76);
  footShadow(p, 32, 72, 31, 4);
  // steps
  for (let k = 0; k < 3; k++) p.rect(4 + k * 2, 66 + k * 3 - 6, 56 - k * 4, 3, (x, y, i, j) => (j === 0 ? R.sand[4] : R.sand[2]));
  p.rect(2, 66, 60, 9, (x, y, i, j) => (j === 0 ? R.sand[4] : j < 4 ? R.sand[3] : R.sand[1]));
  // main hall
  masonry(p, 6, 30, 52, 30, R.sand, 8, 4, R.sand[0]);
  // columns
  for (const x of [8, 18, 40, 50]) { p.rect(x, 30, 6, 30, (xx, yy, i) => (i === 0 ? R.ice[4] : i < 3 ? R.ice[3] : i < 5 ? R.ice[2] : R.ice[1])); p.rect(x - 1, 29, 8, 2, R.ice[4]); p.rect(x - 1, 58, 8, 2, R.ice[2]); }
  // doors
  p.rect(26, 40, 12, 20, INK); p.ellipse(32, 40, 6, 5, INK);
  p.rect(28, 44, 8, 16, R.brown[1]); p.vline(32, 44, 59, R.brown[0]); p.set(30, 52, R.gold[4]); p.set(34, 52, R.gold[4]);
  // pediment and dome
  p.poly([[2, 30], [32, 16], [62, 30]], (x, y) => (y > 27 ? R.sand[1] : x < 32 ? R.sand[3] : R.sand[2]));
  p.line(2, 30, 32, 16, R.sand[4]);
  p.ellipse(32, 16, 12, 11, (x, y, nx, ny) => (y > 16 ? null : band(R.teal, 0.6 - nx * 0.3 - ny * 0.3)));
  for (let x = 22; x < 43; x += 4) p.vline(x, 8, 16, R.teal[1]);
  p.rect(31, 2, 2, 4, R.gold[3]); p.ball(32, 2, 1.5, 1.5, R.gold, { spec: W });
  rune(p, 30, 22, 'eye', R.gold[3]);
  // windows
  for (const x of [13, 46]) { p.rect(x - 1, 38, 4, 7, R.ink[2]); p.set(x, 39, R.gold[3]); }
  return p;
}
function tideBoard() {
  const p = new Px(16, 30);
  footShadow(p, 8, 27, 7, 1.5);
  post(p, 2, 6, 28, R.brown); post(p, 12, 6, 28, R.brown);
  p.rect(1, 6, 14, 12, R.brown[2]); p.box(1, 6, 14, 12, R.brown[1]); p.hline(1, 14, 6, R.brown[4]);
  p.rect(0, 4, 16, 2, R.brown[3]);
  p.rect(3, 8, 4, 5, R.sand[4]); p.rect(8, 9, 5, 4, R.ice[4]); p.rect(5, 13, 4, 4, R.sand[3]);
  for (const [x, y] of [[4, 9], [10, 10], [6, 14]]) p.set(x, y, R.ember[3]);
  p.hline(4, 6, 11, R.ink[2]); p.hline(9, 12, 11, R.ink[2]);
  return p;
}

// Tidegate: stage 0 = ruined site, stages 1..5 build up to a sea gate with a glowing tidal portal.
function tidegate(stage, f = 0) {
  const p = new Px(96, 88);
  footShadow(p, 48, 84, 47, 4);
  // foundation platform
  masonry(p, 2, 70, 92, 14, R.stone, 10, 4);
  p.rect(1, 68, 94, 3, R.stone[4]);
  const pillar = (x, top) => {
    masonry(p, x, top, 12, 68 - top, R.stone, 6, 4);
    p.rect(x - 1, top - 2, 14, 3, R.stone[4]);
    p.vline(x, top, 67, R.stone[3]);
  };
  if (stage === 0) {
    pillar(10, 52); pillar(74, 58);
    for (const [x, y] of [[30, 64], [56, 62], [44, 66]]) p.ball(x, y, 4, 3, R.stone);
    p.speckle([R.grass[2], R.teal[3]], 0.06, 3, (c, x, y) => y > 60);
    return p;
  }
  const h = [0, 52, 36, 22, 14, 14][stage];
  pillar(10, h); pillar(74, h);
  // scaffolding on unfinished stages
  if (stage < 5) {
    for (const x of [6, 26, 66, 90]) post(p, x, h - 4, 68, R.brown, 1);
    for (let y = h; y < 68; y += 10) p.hline(6, 90, y, R.brown[2]);
  }
  if (stage >= 3) {
    // arch
    for (let a = 0; a <= 40; a++) {
      const t = (a / 40) * Math.PI;
      const x = Math.round(48 - Math.cos(t) * 32), y = Math.round(h + 4 - Math.sin(t) * (stage >= 4 ? 14 : 8));
      p.rect(x - 2, y - 2, 5, 5, (xx, yy, i, j) => (j === 0 ? R.stone[4] : j === 4 ? R.stone[1] : R.stone[2]));
    }
  }
  if (stage >= 4) {
    for (const x of [16, 80]) { p.rect(x - 1, h - 10, 3, 8, R.gold[3]); p.ball(x, h - 11, 2, 2, R.gold, { spec: W }); }
    band2(p, 10, h + 10, 12, R.gold); band2(p, 74, h + 10, 12, R.gold);
  }
  if (stage === 5) {
    // the tidal portal
    for (let y = h + 6; y < 68; y++) for (let x = 23; x < 74; x++) {
      const nx = (x - 48) / 26, ny = (y - 42) / 30;
      if (nx * nx + ny * ny * 0.5 > 1) continue;
      const wave = Math.sin(Math.hypot(nx, ny * 0.8) * 9 - f * 1.6 + Math.atan2(ny, nx) * 2);
      p.set(x, y, wave > 0.6 ? R.ice[4] : wave > 0 ? R.sea[3] : wave > -0.6 ? R.sea[2] : R.teal[2]);
    }
    rune(p, 46, h - 2, 'moon', W);
  }
  return p;
}
function arena() {
  const p = new Px(48, 52);
  p.ellipse(24, 34, 23, 15, (x, y, nx, ny, d) => (d > 0.82 ? R.stone[1] : d > 0.7 ? R.stone[3] : ((x >> 2) + (y >> 2)) % 2 ? R.sand[2] : R.sand[3]));
  p.ellipse(24, 34, 6, 4, R.ember[2]); p.ellipse(24, 34, 4, 2.4, R.sand[2]);
  for (const [x, y] of [[4, 26], [44, 26], [8, 44], [40, 44]]) {
    p.rect(x - 2, y - 18, 5, 18, (xx, yy, i) => (i === 0 ? R.stone[4] : i < 3 ? R.stone[2] : R.stone[1]));
    p.rect(x - 3, y - 20, 7, 2, R.stone[4]);
    p.rect(x + 2, y - 17, 4, 7, R.ember[3]); p.set(x + 5, y - 10, R.ember[2]);
  }
  return p;
}
function vaultEntrance() {
  const p = new Px(48, 52);
  footShadow(p, 24, 49, 23, 3);
  masonry(p, 2, 20, 44, 30, R.stone, 8, 4);
  p.speckle([R.grass[2], R.grass[3], R.teal[2]], 0.07, 9, (c, x, y) => y > 22);
  // arch
  p.ellipse(24, 28, 13, 12, (x, y) => (y > 49 ? null : R.stone[3]));
  p.ellipse(24, 30, 10, 10, (x, y) => (y > 49 ? null : INK));
  for (let k = 0; k < 5; k++) p.rect(16 + k * 0, 40 + k * 2, 16, 2, k % 2 ? R.ink[2] : R.ink[1]);
  p.poly([[0, 22], [24, 6], [48, 22]], (x) => (x < 24 ? R.stone[3] : R.stone[2])); p.line(0, 22, 24, 6, R.stone[4]);
  rune(p, 22, 13, 'eye', R.teal[4]); glow(p, 24, 15, 4, R.teal);
  for (const x of [6, 40]) { p.rect(x, 26, 3, 6, R.gold[2]); p.set(x + 1, 25, R.ember[4]); }
  return p;
}
function trenchEntrance(f) {
  const p = new Px(48, 48);
  p.ellipse(24, 26, 22, 18, (x, y, nx, ny, d) => (d > 0.8 ? R.stone[2] : d > 0.6 ? R.ink[2] : d > 0.35 ? R.ink[1] : R.ink[0]));
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; p.ball(24 + Math.cos(a) * 21, 26 + Math.sin(a) * 17, 3, 2.4, R.stone); }
  for (const [x, y] of [[6, 12], [42, 12], [6, 40], [42, 40]]) { p.line(x, y, 24 + (x - 24) * 0.3, 26 + (y - 26) * 0.3, R.stone[1]); p.rect(x - 1, y - 6, 3, 7, R.stone[3]); }
  const g = [R.teal[2], R.teal[3], R.sea[3]][f % 3];
  p.ellipse(24, 26, 4, 3, g); p.set(24, 25, W);
  for (let k = 0; k < 6; k++) { const a = k + f * 0.7; p.set(24 + Math.round(Math.cos(a) * 8), 26 + Math.round(Math.sin(a) * 6), R.violet[3]); }
  return p;
}
function shrine(f) {
  const p = new Px(48, 56);
  footShadow(p, 24, 52, 23, 3);
  masonry(p, 3, 40, 42, 12, R.stone, 7, 4);
  p.rect(2, 38, 44, 3, R.stone[4]);
  for (const x of [5, 39]) { masonry(p, x, 12, 5, 27, R.stone, 5, 4); p.rect(x - 1, 10, 7, 2, R.stone[4]); p.ball(x + 2.5, 8, 2, 2, R.teal, { spec: W }); }
  p.rect(19, 26, 10, 13, (x, y, i) => (i === 0 ? R.stone[4] : i < 5 ? R.stone[3] : R.stone[1])); p.rect(17, 24, 14, 3, R.stone[4]);
  const c = [R.violet, R.teal, R.gold][f % 3];
  p.ball(24, 18, 4, 4, c, { spec: W }); glow(p, 24, 18, 8, c);
  rune(p, 22, 29, 'star', R.teal[3]);
  return p;
}
function digSpot(f) {
  const p = new Px(16, 16);
  p.ellipse(8, 11, 6.5, 3.6, (x, y, nx, ny) => band(R.brown, 0.5 - ny * 0.3 - nx * 0.2));
  p.line(5, 9, 11, 13, R.ember[2]); p.line(11, 9, 5, 13, R.ember[2]);
  p.speckle([R.brown[0], R.stone[2]], 0.12, 3);
  if (f) { p.set(12, 6 - (f % 2), W); p.set(11, 7, R.gold[4]); p.set(13, 7, R.gold[4]); p.set(12, 8 - (f % 2), R.gold[4]); }
  return p;
}

export const LANDMARKS = {
  beacon_1: [(f) => beacon(1, f), 3], beacon_2: [(f) => beacon(2, f), 3], beacon_3: [(f) => beacon(3, f), 3],
  beacon_4: [(f) => beacon(4, f), 3], beacon_5: [(f) => beacon(5, f), 3], beacon_6: [(f) => beacon(6, f), 3],
  tidestone: [tidestone, 3, 3], archive: [archive], tide_board: [tideBoard], gate_site: [() => tidegate(0)],
  arena: [arena], vault_entrance: [vaultEntrance], trench_entrance: [trenchEntrance, 3, 4], shrine: [shrine, 3, 3], dig_spot: [digSpot, 3, 3],
  __extra: {},
};
for (let s = 1; s <= 5; s++) {
  const n = s === 5 ? 4 : 1;
  const frames = []; for (let f = 0; f < n; f++) frames.push(done(tidegate(s, f)));
  LANDMARKS.__extra['struct.gate_site.s' + s] = n > 1 ? { w: 96, h: 88, fps: 4, anchor: [48, 88], frames } : { w: 96, h: 88, anchor: [48, 88], px: frames[0] };
}
// Unlit beacon look (for a Beacon structure placed but not yet lit, if a drawer wants it).
for (let k = 1; k <= 6; k++) {
  const p = beacon(k, 0);
  const st = BIOME_STONE[k];
  p.map((c, x, y) => (y < 24 ? (y > 15 ? null : '.') : null));
  p.d = p.d.map((c, i) => (Math.floor(i / 48) < 16 && c !== '.' && c !== INK ? '.' : c));
  p.poly([[11, 16], [37, 16], [33, 23], [15, 23]], st[2]); p.hline(11, 37, 16, st[4]);
  LANDMARKS.__extra['struct.beacon_' + k + '.unlit'] = { w: 48, h: 84, anchor: [24, 84], px: done(p) };
}

export default LANDMARKS;
