// WP3 boss sprites. Per boss and phase: 'boss.<id>' (phase 1), 'boss.<id>.p2', 'boss.<id>.p3', each with anims
// idle (2), attack (2), hit (1); facing right, mirror: true. Phases escalate the look (damage, glow, rage colours).
// Wardens are 64x64 (Glacier Antler 72x72), Keepers 48-56 px, the Drowned Moon 80x80.

import { Px, R, INK, done, band } from '../gen/paint.js';
import { glow, flame, rune } from '../gen/build.js';
import BOSSES from '../../../shared/data/bosses.js';

const W = '#';

function eyes(p, pts, s, ph, c = W, rage = R.ember[4]) {
  for (const [x, y] of pts) {
    if (s.hurt) { p.hline(x - 1, x + 1, y, INK); continue; }
    p.rect(x - 1, y - 1, 3, 2, ph >= 2 || s.atk ? rage : c); p.set(x, y, INK);
  }
}
function cracks(p, n, ramp, seed, test = null) {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < n; k++) {
    let x = Math.floor(rnd() * p.w), y = Math.floor(rnd() * p.h);
    if (!p.filled(x, y)) continue;
    for (let i = 0; i < 6; i++) { if (p.filled(x, y) && (!test || test(p.get(x, y)))) p.put(x, y, i % 2 ? ramp[3] : ramp[4]); x += rnd() < 0.5 ? 1 : -1; y += 1; }
  }
}

// ------------------------------------------------------------------ wardens

function thornmother(p, s, ph) {
  const b = s.bob, cx = 30 + s.lean;
  // root arms
  const reach = s.atk ? 8 : 0;
  p.path([[cx - 8, 44 + b], [cx - 20, 50], [cx - 26 - reach, 60]], R.brown[1], 3);
  p.path([[cx + 8, 44 + b], [cx + 20, 48 - reach / 2], [cx + 28 + reach, 56 - reach]], R.brown[2], 3);
  // bramble body
  p.ellipse(cx, 42 + b, 20, 18, (x, y, nx, ny) => (y > 62 ? null : band(R.grass, 0.55 - nx * 0.25 - ny * 0.35)));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.line(cx + Math.cos(a) * 14, 42 + b + Math.sin(a) * 12, cx + Math.cos(a) * 22, 42 + b + Math.sin(a) * 19, R.brown[k % 2 ? 1 : 2]); }
  p.speckle([R.grass[1], R.brown[1]], 0.08, 3, (c) => c !== R.brown[1]);
  // face of bark
  p.ellipse(cx + 4, 38 + b, 9, 8, (x, y, nx, ny) => band(R.brown, 0.55 - nx * 0.3 - ny * 0.4));
  eyes(p, [[cx + 1, 36 + b], [cx + 8, 36 + b]], s, ph, R.gold[4]);
  p.hline(cx, cx + 8, 42 + b, INK); if (s.atk) p.rect(cx + 1, 42 + b, 7, 3, INK);
  // flower crown (wilts to thorns in later phases)
  for (let k = 0; k < 5; k++) {
    const x = cx - 10 + k * 6, y = 22 + b - (k % 2) * 3;
    if (ph < 2) { p.ball(x, y, 3, 3, ph === 0 ? R.flesh : R.violet, { spec: W }); p.ball(x, y, 1.2, 1.2, R.gold); }
    else p.poly([[x - 2, y + 3], [x, y - 5], [x + 2, y + 3]], R.ember[2]);
  }
  if (ph >= 1) for (const [x, y] of [[cx - 12, 46], [cx + 14, 40], [cx - 4, 54]]) { p.set(x, y + b, R.ember[3]); p.set(x + 1, y + b, R.ember[4]); }
}
function mireRegent(p, s, ph) {
  const b = s.bob, cx = 32, sq = s.atk ? 3 : 0;
  // legs
  for (const x of [cx - 18, cx + 14]) p.ellipse(x, 58, 7, 4, (xx, yy, nx, ny) => band(R.teal, 0.4 - ny * 0.4));
  // body
  p.ellipse(cx, 44 + b + sq, 26, 17 - sq, (x, y, nx, ny) => band(R.teal, 0.6 - nx * 0.25 - ny * 0.4));
  p.ellipse(cx + 2, 50 + b + sq, 18, 9, (x, y, nx, ny) => band(R.sand, 0.65 - ny * 0.3));
  p.speckle([R.teal[1], R.grass[2]], 0.08, 7, (c) => c !== R.sand[2] && c !== R.sand[3]);
  // eyes on top bumps
  for (const x of [cx - 8, cx + 10]) { p.ball(x, 28 + b + sq, 5, 4.5, R.teal); }
  eyes(p, [[cx - 7, 28 + b + sq], [cx + 11, 28 + b + sq]], s, ph, R.gold[4]);
  // mouth
  p.hline(cx - 16, cx + 20, 40 + b + sq, R.teal[0]);
  if (s.atk) { p.ellipse(cx + 2, 42 + b + sq, 14, 4, INK); p.ellipse(cx + 2, 44 + b + sq, 8, 2, R.ember[2]); }
  // crown (slips in phase 2, broken in phase 3)
  const tilt = ph;
  const cy = 22 + b + sq + tilt;
  p.poly([[cx - 6 + tilt * 2, cy + 6], [cx - 6 + tilt * 2, cy], [cx - 3 + tilt * 2, cy + 3], [cx + tilt * 2, cy - 2], [cx + 3 + tilt * 2, cy + 3], [cx + 6 + tilt * 2, cy], [cx + 6 + tilt * 2, cy + 6]], ph === 2 ? R.stone[3] : R.gold[3]);
  p.set(cx + tilt * 2, cy + 3, R.teal[4]);
  if (ph >= 1) p.speckle([R.brown[1]], 0.06, 11, (c, x, y) => y > 50);
}
function kilnheart(p, s, ph) {
  const b = s.bob, cx = 32;
  // legs
  for (const x of [cx - 12, cx + 6]) p.rect(x, 50, 8, 13, (xx, yy, i) => (i < 2 ? R.ember[2] : R.ember[1]));
  // brick body
  p.rect(cx - 18, 20 + b, 36, 32, (x, y, i, j) => {
    const row = Math.floor(j / 4), bx = (i + (row % 2) * 3) % 6;
    return j % 4 === 3 || bx === 0 ? R.ember[0] : i < 4 ? R.ember[3] : i > 31 ? R.ember[1] : R.ember[2];
  });
  // arms
  const ar = s.atk ? -6 : 0;
  p.rect(cx - 26, 26 + b, 8, 16, (x, y, i) => (i < 2 ? R.ink[3] : R.ink[2])); p.rect(cx + 18, 26 + b + ar, 8, 16, (x, y, i) => (i < 2 ? R.ink[3] : R.ink[2]));
  p.ball(cx + 22, 44 + b + ar, 5, 4, R.ink, { spec: R.stone[3] }); p.ball(cx - 22, 44 + b, 5, 4, R.ink);
  // furnace heart
  const hc = ph === 2 ? R.gold : R.ember;
  p.ellipse(cx, 38 + b, 9, 8, INK); p.ball(cx, 38 + b, 7 + (s.atk ? 1 : 0), 6, hc, { spec: W });
  if (ph >= 1) glow(p, cx, 38 + b, 12, R.ember, false);
  // chimney head
  p.rect(cx - 7, 6 + b, 14, 15, (x, y, i) => (i < 3 ? R.stone[3] : i < 10 ? R.stone[2] : R.stone[1])); p.rect(cx - 9, 4 + b, 18, 3, R.stone[4]);
  eyes(p, [[cx - 3, 14 + b], [cx + 4, 14 + b]], s, ph, R.gold[4], R.gold[4]);
  flame(p, cx, 4 + b, 5 + ph * 2 + (s.atk ? 3 : 0), s.bob + s.atk);
  if (ph >= 1) cracks(p, 8 + ph * 6, R.gold, 77, (c) => c.startsWith && true);
}
function prismarch(p, s, ph) {
  const b = s.bob * 2, cx = 32, cy = 30 + b;
  // wings of glass
  const spread = s.atk ? 4 : 0;
  for (const side of [-1, 1]) {
    p.poly([[cx, cy], [cx + side * (28 + spread), cy - 16], [cx + side * (22 + spread), cy + 6], [cx + side * 10, cy + 10]], side < 0 ? R.ice[3] : R.ice[2]);
    p.line(cx, cy, cx + side * (28 + spread), cy - 16, W);
    p.line(cx + side * 6, cy + 4, cx + side * (20 + spread), cy - 6, R.violet[3]);
  }
  // body prism
  p.poly([[cx, cy - 22], [cx + 9, cy - 4], [cx + 6, cy + 20], [cx - 6, cy + 20], [cx - 9, cy - 4]], R.violet[2]);
  p.poly([[cx, cy - 22], [cx - 9, cy - 4], [cx - 6, cy + 20], [cx, cy + 20]], R.violet[3]);
  p.line(cx, cy - 22, cx, cy + 20, R.violet[4]);
  // crown shards
  for (let k = -2; k <= 2; k++) p.poly([[cx + k * 4 - 1, cy - 20], [cx + k * 4, cy - 27 - (2 - Math.abs(k)) * 3], [cx + k * 4 + 1, cy - 20]], k % 2 ? R.gold[4] : R.ice[4]);
  eyes(p, [[cx - 3, cy - 8], [cx + 3, cy - 8]], s, ph, R.ice[4]);
  // orbiting shards
  for (let k = 0; k < ph * 4; k++) { const a = (k / (ph * 4)) * Math.PI * 2 + s.bob * 0.4; const x = cx + Math.cos(a) * 26, y = cy + 12 + Math.sin(a) * 8; p.poly([[x - 1, y + 2], [x, y - 3], [x + 1, y + 2]], [R.ember[4], R.gold[4], R.grass[4], R.sea[4]][k % 4]); }
  if (s.atk) glow(p, cx + 14, cy - 8, 6, R.ice, false);
}
function glacierAntler(p, s, ph) {
  const b = s.bob, lean = s.atk ? 4 : 0, cx = 34;
  // legs
  for (const [x, d] of [[cx - 16, 0], [cx - 10, 1], [cx + 8, 0], [cx + 14, 1]]) p.rect(x + (d ? lean / 2 : 0), 52, 4, 19, (xx, yy, i) => (i === 0 ? R.ice[3] : R.ice[d ? 1 : 2]));
  // body
  p.ellipse(cx, 44 + b, 22, 12, (x, y, nx, ny) => band(R.ice, 0.65 - nx * 0.25 - ny * 0.45));
  p.ellipse(cx - 2, 50 + b, 16, 5, R.stone[3]);
  // neck/head
  const hx = cx + 20 + lean, hy = 30 + b + lean;
  p.poly([[cx + 10, 40 + b], [hx - 3, hy - 2], [hx + 2, hy + 6], [cx + 14, 50 + b]], R.ice[2]);
  p.ellipse(hx, hy, 7, 5, (x, y, nx, ny) => band(R.ice, 0.7 - nx * 0.2 - ny * 0.45));
  p.rect(hx + 4, hy, 5, 3, R.ice[3]); p.set(hx + 8, hy, INK);
  eyes(p, [[hx + 1, hy - 2]], s, ph, R.sea[1], R.sea[4]);
  // great antlers (crack in phase 2, aurora-lit in phase 3)
  const ant = ph === 2 ? R.violet : R.ice;
  const tines = [[[hx - 2, hy - 4], [hx - 8, hy - 16], [hx - 16, hy - 24], [hx - 26, hy - 26]], [[hx - 8, hy - 16], [hx - 2, hy - 26]], [[hx - 16, hy - 24], [hx - 14, hy - 30]], [[hx, hy - 5], [hx + 4, hy - 18], [hx + 12, hy - 26]], [[hx + 4, hy - 18], [hx + 12, hy - 18]]];
  for (const t of tines) { p.path(t, ant[2], 3); p.path(t, ant[4]); }
  if (ph >= 1) cracks(p, 6 + ph * 4, R.sea, 31, (c) => c === R.ice[2] || c === R.ice[3]);
  if (ph === 2) glow(p, hx - 6, hy - 18, 12, R.teal);
}
function hollowChoir(p, s, ph) {
  const b = s.bob, n = 3 + ph * 2;
  const pts = [[32, 22], [16, 30], [48, 30], [24, 44], [40, 44], [10, 46], [54, 46]].slice(0, n);
  // ring of light
  p.ellipse(32, 36 + b, 28, 22, (x, y, nx, ny, d) => (d > 0.9 ? R.violet[2] : null));
  for (const [i, [x, y]] of pts.entries()) {
    const yy = y + ((i + b) % 2);
    // hood
    p.poly([[x - 7, yy + 10], [x - 6, yy - 4], [x, yy - 9], [x + 6, yy - 4], [x + 7, yy + 10]], R.violet[i % 2 ? 1 : 2]);
    p.line(x - 6, yy - 4, x, yy - 9, R.violet[3]);
    // mask
    p.ellipse(x, yy, 4, 5, (xx, y2, nx, ny) => band(R.ice, 0.75 - ny * 0.3 - nx * 0.2));
    if (s.hurt) { p.hline(x - 2, x - 1, yy - 1, INK); p.hline(x + 1, x + 2, yy - 1, INK); }
    else { p.set(x - 2, yy - 1, INK); p.set(x + 2, yy - 1, INK); }
    p.ellipse(x, yy + 3, 1.4, s.atk || ph === 2 ? 2 : 1, INK);
  }
  if (s.atk) for (let k = 0; k < 5; k++) { const x = 44 + k * 4, y = 18 + Math.round(Math.sin(k) * 3); p.set(x, y, R.teal[4]); p.set(x + 1, y - 1, R.teal[4]); p.vline(x + 1, y - 4, y - 1, R.teal[3]); }
}

// ------------------------------------------------------------------ keepers

function sporeking(p, s, ph) {
  const b = s.bob, cx = 24;
  p.rect(cx - 6, 26 + b, 12, 20, (x, y, i) => (i < 3 ? R.sand[4] : i < 9 ? R.sand[3] : R.sand[2]));
  p.ellipse(cx, 46, 9, 2.5, R.sand[1]);
  eyes(p, [[cx - 2, 34 + b], [cx + 3, 34 + b]], s, ph, INK, R.ember[4]);
  if (s.atk) p.ellipse(cx + 1, 40 + b, 2, 2, INK);
  const cap = ph === 2 ? R.violet : R.ember;
  p.ellipse(cx, 22 + b, 21, 12, (x, y, nx, ny) => (ny > 0.35 ? null : band(cap, 0.6 - nx * 0.3 - ny * 0.4)));
  p.hline(cx - 19, cx + 19, 26 + b, cap[1]);
  for (const [x, y] of [[cx - 10, 15], [cx + 2, 12], [cx + 12, 17], [cx - 3, 19], [cx + 16, 22]]) p.ellipse(x, y + b, 2.4, 1.6, R.sand[4]);
  // crown
  p.poly([[cx - 5, 12 + b], [cx - 5, 6 + b], [cx - 2, 9 + b], [cx, 4 + b], [cx + 2, 9 + b], [cx + 5, 6 + b], [cx + 5, 12 + b]], R.gold[3]);
  for (let k = 0; k < 4 + ph * 4; k++) p.set(4 + ((k * 13) % 40), 4 + ((k * 7) % 20), R.gold[4]);
}
function barnacleBell(p, s, ph) {
  const b = s.atk ? 2 : 0, sw = s.bob ? 1 : -1;
  p.rect(22, 0, 4, 6, R.stone[2]);
  p.poly([[14 + sw, 8], [34 + sw, 8], [42 + sw, 38], [6 + sw, 38]], (x) => band(R.gold, 0.7 - x / 52));
  p.ellipse(24 + sw, 8, 10, 4, R.gold[3]);
  p.rect(4 + sw, 36, 40, 4, R.gold[1]); p.hline(5 + sw, 42 + sw, 36, R.gold[4]);
  p.speckle([R.stone[4], R.stone[3], R.teal[2]], 0.04 + ph * 0.03, 5);
  // gap in ring (phase look: a crack)
  if (ph >= 1) p.line(30 + sw, 12, 34 + sw, 36, INK);
  // tentacle clapper
  for (let k = 0; k < 3; k++) p.path([[20 + k * 4, 38], [18 + k * 5 + sw * 2, 42 + b], [16 + k * 6, 46 + b]], R.violet[2 + (k % 2)], 2);
  eyes(p, [[18 + sw, 24], [30 + sw, 24]], s, ph, R.teal[4]);
}
function bellowsEngine(p, s, ph) {
  const b = s.bob, cx = 28;
  p.rect(6, 34, 44, 12, (x, y, i, j) => (j === 0 ? R.stone[4] : R.stone[2])); for (const x of [10, 44]) p.ball(x, 46, 4, 3, R.ink);
  // bellows
  const pump = s.bob ? 2 : 0;
  p.poly([[8, 14 + pump], [30, 18], [30, 32], [8, 34 - pump]], R.brown[2]);
  for (let k = 0; k < 4; k++) p.line(8 + k * 5, 15 + pump - k * 0.2, 8 + k * 5, 33 - pump, R.brown[0]);
  p.line(8, 14 + pump, 30, 18, R.brown[4]);
  // engine block
  p.rect(30, 12, 20, 22, (x, y, i) => (i < 3 ? R.stone[3] : i < 14 ? R.stone[2] : R.stone[1]));
  p.ball(40, 22, 5, 5, ph === 2 ? R.gold : R.ember, { spec: W });
  eyes(p, [[36, 16], [44, 16]], s, ph, R.gold[4]);
  // nozzle and flame jet
  p.rect(48, 22, 6, 4, R.ink[3]);
  if (s.atk) for (let k = 0; k < 3; k++) flame(p, 54 + k * 0, 24 + k, 2, k);
  if (s.atk) { p.rect(50, 21, 6, 6, R.gold[4]); p.hline(50, 55, 23, W); }
  // stacks
  for (const x of [32, 42]) { p.rect(x, 2, 4, 10, R.stone[1]); p.set(x + 1, 1 - b, R.stone[3]); p.set(x + 2, 0, R.stone[2]); }
  if (ph >= 1) cracks(p, 6 * ph, R.ember, 13);
}
function twinLenses(p, s, ph) {
  const b = s.bob;
  p.path([[14, 24 + b], [28, 20], [42, 24 - b]], R.gold[2], 2);
  for (const [x, y] of [[13, 24 + b], [43, 24 - b]]) {
    p.ellipse(x, y, 11, 11, R.gold[2]); p.ellipse(x, y, 9, 9, R.gold[1]);
    p.ball(x, y, 8, 8, R.ice, { spec: W });
    p.ellipse(x + 1, y, 3.2, 3.2, ph === 2 ? R.ember[3] : R.violet[3]); p.ellipse(x + 1.5, y, 1.5, 1.5, s.hurt ? R.violet[3] : INK);
    if (s.atk) glow(p, x + 9, y, 5, R.ice, false);
  }
  if (ph >= 1) cracks(p, 4 * ph, R.ice, 21, (c) => c.length === 1);
  for (let k = 0; k < 6; k++) p.set(6 + k * 8, 40 + (k % 2) * 2, R.violet[3]);
}
function thawlessKnight(p, s, ph) {
  const b = s.bob, cx = 22;
  // legs
  for (const x of [cx - 6, cx + 2]) p.rect(x, 40, 5, 15, (xx, yy, i) => (i === 0 ? R.ice[4] : R.ice[2]));
  // torso armour
  p.rect(cx - 10, 18 + b, 20, 23, (x, y, i) => (i < 3 ? R.ice[4] : i < 12 ? R.ice[3] : i < 17 ? R.ice[2] : R.ice[1]));
  p.ellipse(cx - 11, 20 + b, 5, 4, R.ice[3]); p.ellipse(cx + 11, 20 + b, 5, 4, R.ice[2]);
  p.line(cx, 20 + b, cx, 38 + b, R.sea[2]);
  // helm
  p.rect(cx - 6, 4 + b, 12, 13, (x, y, i) => (i < 2 ? R.ice[4] : i < 8 ? R.ice[3] : R.ice[1]));
  p.hline(cx - 4, cx + 5, 10 + b, INK); if (!s.hurt) { p.set(cx - 2, 10 + b, R.sea[4]); p.set(cx + 3, 10 + b, R.sea[4]); }
  p.poly([[cx - 2, 4 + b], [cx, 0 + b], [cx + 2, 4 + b]], R.sea[3]);
  // greatsword
  const a = s.atk ? -0.3 : -1.25;
  const hx = cx + 14, hy = 30 + b;
  p.line(hx, hy, hx + Math.cos(a) * 30, hy + Math.sin(a) * 30, R.ice[4], 3);
  p.line(hx, hy, hx + Math.cos(a) * 30, hy + Math.sin(a) * 30, W);
  p.line(hx - 3, hy + 2, hx + 3, hy - 2, R.gold[3], 2);
  if (ph >= 1) cracks(p, 5 * ph, R.sea, 19, (c) => c === R.ice[3] || c === R.ice[2]);
  if (ph === 2) glow(p, cx, 28 + b, 14, R.sea);
}
function scribe(p, s, ph) {
  const b = s.bob, cx = 22;
  // robe
  p.poly([[cx - 12, 54], [cx - 8, 14 + b], [cx + 8, 14 + b], [cx + 12, 54]], (x) => band(R.violet, 0.6 - (x - cx) / 28));
  p.ellipse(cx, 14 + b, 9, 8, R.violet[2]); p.ellipse(cx, 16 + b, 6, 5, INK);
  eyes(p, [[cx - 2, 16 + b], [cx + 3, 16 + b]], s, ph, R.teal[4]);
  // giant quill
  const a = s.atk ? -0.2 : -1.0;
  p.line(cx + 10, 32 + b, cx + 10 + Math.cos(a) * 22, 32 + b + Math.sin(a) * 22, R.ice[4], 3);
  p.line(cx + 10, 32 + b, cx + 10 + Math.cos(a) * 22, 32 + b + Math.sin(a) * 22, R.ice[2]);
  p.rect(cx + 8, 30 + b, 4, 6, INK);
  // floating pages
  for (let k = 0; k < 2 + ph * 2; k++) { const x = 4 + ((k * 11) % 40), y = 36 + ((k * 7 + b * 2) % 16); p.rect(x, y, 5, 6, R.sand[4]); p.hline(x + 1, x + 3, y + 2, R.ink[3]); p.hline(x + 1, x + 3, y + 4, R.ink[3]); }
  if (ph >= 1) p.speckle([INK, R.violet[0]], 0.05 * ph, 41, (c, x, y) => y > 44);
}
function drownedMoon(p, s, ph) {
  const b = s.bob, cx = 40, cy = 36 + b;
  // dripping tide
  for (let k = 0; k < 9; k++) { const x = cx - 24 + k * 6; const len = 6 + ((k * 7) % 9) + b; p.vline(x, cy + 16, cy + 18 + len, R.sea[3]); p.set(x, cy + 19 + len, R.ice[4]); }
  p.ball(cx, cy, 30, 30, R.ice, { spec: W });
  p.ellipse(cx + 8, cy - 6, 30, 30, (x, y, nx, ny, d) => null);
  // maria (dark seas) as drowned features
  for (const [x, y, r] of [[cx - 12, cy - 10, 6], [cx + 10, cy + 8, 8], [cx - 6, cy + 14, 4], [cx + 14, cy - 14, 4]]) p.ellipse(x, y, r, r * 0.8, R.ice[2]);
  // face
  eyes(p, [[cx - 9, cy - 2], [cx + 9, cy - 2]], s, ph, R.sea[1], R.violet[4]);
  p.ellipse(cx, cy + 10, 7, s.atk ? 4 : 1.5, R.sea[1]);
  // phases: crack open to a violet core
  if (ph >= 1) cracks(p, 10 + ph * 10, R.violet, 99, (c) => c.length === 1 && c !== INK);
  if (ph === 2) { p.ellipse(cx, cy, 10, 10, (x, y, nx, ny, d) => (d < 0.6 ? R.violet[4] : null)); glow(p, cx, cy, 36, R.violet); }
  // seaweed crown
  for (let k = 0; k < 5; k++) p.path([[cx - 16 + k * 8, cy - 26], [cx - 18 + k * 8, cy - 32], [cx - 15 + k * 8, cy - 36]], R.teal[2], 2);
}

const BOSS_ART = {
  thornmother: [thornmother, 64], mire_regent: [mireRegent, 64], kilnheart: [kilnheart, 64], prismarch: [prismarch, 64],
  glacier_antler: [glacierAntler, 72], hollow_choir: [hollowChoir, 64],
  sporeking: [sporeking, 48], barnacle_bell: [barnacleBell, 48], bellows_engine: [bellowsEngine, 56], twin_lenses: [twinLenses, 56],
  thawless_knight: [thawlessKnight, 56], scribe: [scribe, 56], drowned_moon: [drownedMoon, 80],
};

const POSES = { idle: [{ bob: 0 }, { bob: 1 }], attack: [{ atk: 1, lean: 1 }, { atk: 1, bob: 1, lean: 2 }], hit: [{ hurt: 1 }] };

function frames(fn, size, ph) {
  const anims = {};
  for (const [name, list] of Object.entries(POSES)) {
    anims[name] = list.map((ps) => {
      const s = { bob: 0, atk: 0, lean: 0, hurt: 0, ...ps };
      const p = new Px(size, size);
      fn(p, s, ph);
      if (ph === 2) p.map((c) => (c === INK ? null : null));
      if (s.hurt) p.tone(1);
      return done(p);
    });
  }
  return anims;
}

const out = {};
for (const bdef of BOSSES) {
  const [fn, size] = BOSS_ART[bdef.id] ?? [sporeking, 48];
  for (let ph = 0; ph < 3; ph++) {
    const id = 'boss.' + bdef.id + (ph ? '.p' + (ph + 1) : '');
    out[id] = { w: size, h: size, fps: 4, mirror: true, anchor: [size / 2, size - 1], anims: frames(fn, size, ph) };
  }
}
export default out;
