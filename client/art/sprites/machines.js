// WP3 machine sprites ('struct.<id>'): automation, Flux generators and turrets. Frame 0 is the idle look, the
// other frames animate while the machine runs (`on` = 1). Directional machines (sluices, spillway, grabbers,
// splitter) also get rotated copies 'struct.<id>.r0'..'.r3' (r0 = facing/flowing east, r1 south, r2 west, r3 north).

import { Px, R, INK, done, band } from '../gen/paint.js';
import { W, planks, masonry, post, flame, glow, band2, rivets, pipe, crate, footShadow, rune } from '../gen/build.js';
import { buildStructures } from './structures.js';
import STRUCTS from '../../../shared/data/structures.js';

const TIERS = [null, { a: R.brown, m: R.stone }, { a: R.stone, m: R.stone }, { a: R.gold, m: R.gold }];

function burrow(t, f) {
  const p = new Px(32, 40);
  const { a, m } = TIERS[t];
  footShadow(p, 16, 37, 15, 2.5);
  p.ellipse(16, 28, 15, 11, (x, y, nx, ny) => (y > 38 ? null : band(R.brown, 0.55 - nx * 0.3 - ny * 0.35)));
  p.speckle([R.grass[2], R.grass[3]], 0.08, 4, (c, x, y) => y < 24);
  p.ellipse(16, 31, 7, 5.5, (x, y) => (y > 37 ? null : INK));
  // frame around the hole
  if (t === 1) { post(p, 8, 24, 37, a); post(p, 22, 24, 37, a); p.rect(7, 22, 18, 3, a[3]); p.hline(7, 24, 22, a[4]); }
  if (t >= 2) { for (let k = 0; k < 9; k++) { const ang = Math.PI + (k / 8) * Math.PI; p.ball(16 + Math.cos(ang) * 8.5, 31 + Math.sin(ang) * 7, 1.8, 1.6, m); } }
  if (t === 3) { pipe(p, 26, 14, 26, 30, R.gold); p.rect(24, 12, 6, 3, R.gold[3]); p.set(27, 11 - (f % 2), R.stone[4]); band2(p, 6, 36, 20, R.gold); }
  // little sign
  p.rect(3, 16, 7, 5, R.sand[3]); post(p, 6, 21, 27, R.brown, 1); p.set(5, 18, R.ember[3]); p.set(7, 18, R.ember[3]);
  // scuttler eyes peeking
  if (f) { p.set(14, 30 + (f % 2), W); p.set(18, 30 + (f % 2), W); p.set(14, 31 + (f % 2), INK); p.set(18, 31 + (f % 2), INK); }
  return p;
}
function hopper() {
  const p = new Px(16, 22);
  footShadow(p, 8, 19, 7, 2);
  post(p, 2, 12, 20, R.stone, 1); post(p, 13, 12, 20, R.stone, 1);
  p.poly([[0, 3], [16, 3], [11, 14], [5, 14]], R.stone[2]); p.poly([[0, 3], [5, 14], [8, 14], [5, 3]], R.stone[3]);
  p.rect(0, 2, 16, 2, R.stone[4]); p.ellipse(8, 4, 6.5, 1.4, INK);
  p.rect(6, 14, 4, 3, R.stone[1]); band2(p, 1, 7, 14, R.gold);
  return p;
}
function spillway() {
  const p = new Px(16, 16);
  p.poly([[0, 4], [16, 7], [16, 13], [0, 10]], R.brown[2]);
  p.poly([[0, 4], [16, 7], [16, 8], [0, 5]], R.brown[4]);
  p.poly([[1, 6], [15, 9], [15, 11], [1, 9]], R.sea[3]); p.line(2, 7, 14, 9, R.ice[4]);
  p.line(9, 9, 13, 10, W); p.poly([[11, 6], [14, 8], [11, 10]], R.gold[3]);
  return p;
}
function sluice(t, f) {
  const p = new Px(16, 16);
  const wall = [null, R.brown, R.stone, R.gold][t];
  p.rect(0, 3, 16, 3, (x, y, i, j) => (j === 0 ? wall[4] : j === 1 ? wall[3] : wall[1]));
  p.rect(0, 12, 16, 3, (x, y, i, j) => (j === 0 ? wall[3] : j === 1 ? wall[2] : wall[0]));
  p.rect(0, 6, 16, 6, R.sea[2]);
  for (let x = 0; x < 16; x++) { const k = (x + f * 2) % 8; if (k < 3) p.set(x, 7 + (k === 1 ? 1 : 0), R.sea[4]); if ((x + f * 2 + 4) % 8 < 2) p.set(x, 10, R.sea[3]); }
  if (t >= 2) for (let x = 2; x < 16; x += 6) { p.set(x, 4, wall[4]); p.set(x, 13, wall[4]); }
  if (t === 3) { p.hline(0, 15, 5, R.gold[2]); p.set(7, 9, W); }
  return p;
}
function grabber(f, filter = false) {
  const p = new Px(16, 22);
  footShadow(p, 8, 19, 7, 2);
  p.rect(2, 15, 12, 5, R.stone[2]); p.hline(2, 13, 15, R.stone[4]); p.hline(2, 13, 19, R.stone[0]);
  p.ellipse(8, 15, 3, 1.6, R.stone[3]);
  const ang = [-2.6, -1.57, -0.55][f % 3];
  const ex = 8 + Math.round(Math.cos(ang) * 7), ey = 13 + Math.round(Math.sin(ang) * 7);
  p.line(8, 14, 8, 9, R.gold[3], 2); p.line(8, 9, ex, ey - 3, R.gold[3], 2);
  p.ball(8, 9, 1.6, 1.6, R.stone);
  p.path([[ex, ey - 3], [ex - 2, ey - 1]], R.stone[4]); p.path([[ex, ey - 3], [ex + 2, ey - 1]], R.stone[4]);
  if (filter) { p.rect(3, 16, 4, 3, R.violet[3]); p.set(4, 17, W); p.rect(9, 16, 4, 3, R.teal[3]); }
  else p.poly([[10, 16], [13, 17], [10, 18]], R.gold[4]);
  return p;
}
function splitter() {
  const p = new Px(16, 16);
  p.rect(2, 2, 12, 12, R.stone[2]); p.box(2, 2, 12, 12, R.stone[1]); p.hline(2, 13, 2, R.stone[4]);
  p.rect(5, 5, 6, 6, R.stone[1]); p.ball(8, 8, 2, 2, R.gold);
  p.poly([[11, 6], [15, 8], [11, 10]], R.gold[3]); p.poly([[6, 5], [8, 1], [10, 5]], R.teal[3]); p.poly([[6, 11], [8, 15], [10, 11]], R.teal[3]);
  return p;
}
function autobench(t, f) {
  const p = new Px(32, 40);
  const metal = [null, R.brown, R.stone, R.gold][t];
  footShadow(p, 16, 37, 15, 2.5);
  crate(p, 1, 20, 30, 16, 5, R.stone, R.stone);
  masonry(p, 1, 25, 30, 11, R.stone, 6, 4);
  p.rect(4, 27, 8, 6, INK); p.rect(5, 28, 6, 4, f ? R.gold[3] : R.ink[2]);
  p.rect(20, 27, 8, 6, R.stone[1]); for (let k = 0; k < 3; k++) p.hline(21, 26, 28 + k * 2, R.stone[3]);
  // gantry and arm
  post(p, 2, 4, 20, metal, 2); post(p, 28, 4, 20, metal, 2);
  p.rect(2, 3, 28, 3, metal[3]); p.hline(2, 29, 3, metal[4]);
  const ax = [10, 16, 22][f % 3];
  p.rect(ax - 2, 5, 5, 3, metal[2]); p.line(ax, 8, ax, 15 + (f % 2), R.stone[3], 2);
  p.poly([[ax - 2, 16 + (f % 2)], [ax + 3, 16 + (f % 2)], [ax, 19 + (f % 2)]], R.stone[4]);
  if (f) { p.set(ax + 3, 20, R.gold[4]); p.set(ax - 2, 21, W); }
  // gears
  p.ball(26, 14, 3, 3, R.stone); p.set(26, 14, INK); p.ball(6, 12, 2.4, 2.4, R.stone); p.set(6, 12, INK);
  if (t === 3) { p.ball(16, 24, 1.6, 1.6, R.violet, { spec: W }); rivets(p, [[3, 21], [28, 21]], R.gold[4]); }
  return p;
}
function drill(f) {
  const p = new Px(32, 56);
  footShadow(p, 16, 53, 15, 2.5);
  masonry(p, 2, 40, 28, 14, R.stone, 7, 4);
  p.rect(1, 38, 30, 3, R.stone[4]);
  // derrick
  p.line(4, 39, 13, 2, R.ember[2], 2); p.line(28, 39, 19, 2, R.ember[2], 2);
  for (let y = 8; y < 38; y += 7) { const hw = 3 + (y / 39) * 9; p.hline(16 - hw, 16 + hw, y, R.ember[1]); p.line(16 - hw, y, 16 + hw - 2, y + 6, R.ember[1]); }
  p.rect(11, 0, 10, 3, R.stone[3]);
  // bit
  p.rect(14, 3, 4, 34, R.stone[2]); p.vline(14, 3, 36, R.stone[4]);
  for (let y = 10 + (f % 3) * 2; y < 36; y += 6) p.line(14, y, 17, y + 2, R.stone[1]);
  p.poly([[13, 37], [19, 37], [16, 42]], R.stone[4]);
  if (f) { p.set(10, 41, R.gold[4]); p.set(22, 40 + (f % 2), R.gold[4]); p.set(12 - f, 39, R.stone[3]); }
  p.rect(23, 30, 7, 7, R.gold[2]); p.box(23, 30, 7, 7, R.gold[1]); p.set(26, 33, f ? R.ember[4] : R.ink[2]);
  return p;
}
function tillerBot(f) {
  const p = new Px(16, 18);
  footShadow(p, 8, 16, 6, 1.5);
  p.rect(3, 6, 10, 8, R.gold[2]); p.hline(3, 12, 6, R.gold[4]); p.vline(3, 6, 13, R.gold[3]); p.hline(3, 12, 13, R.gold[0]);
  p.rect(5, 8, 6, 3, INK); p.set(6, 9, R.teal[4]); p.set(9, 9, R.teal[4]);
  p.ball(4, 15, 2, 1.6, R.ink); p.ball(12, 15, 2, 1.6, R.ink);
  p.line(13, 10, 15, 13 + (f % 2), R.stone[3]); p.hline(14, 15, 14 + (f % 2), R.stone[4]);
  p.vline(8, 3, 6, R.stone[3]); p.set(8, 2, f ? R.ember[4] : R.ember[2]);
  return p;
}
function trawlBuoy(f) {
  const p = new Px(16, 22);
  const b = f % 2;
  p.ellipse(8, 18, 7, 2, R.sea[2]); p.hline(2, 13, 18, R.ice[4]);
  p.ball(8, 13 + b, 5, 4.6, R.ember, { spec: W });
  p.rect(3, 12 + b, 10, 2, W);
  p.rect(7, 3 + b, 2, 6, R.stone[3]); p.rect(6, 1 + b, 4, 2, R.gold[3]); p.set(7, 1 + b, R.gold[4]);
  for (let x = 1; x < 15; x += 2) p.set(x, 20, R.sand[3]);
  return p;
}
function gullRoost(f) {
  const p = new Px(32, 52);
  footShadow(p, 16, 49, 14, 2.5);
  post(p, 5, 18, 50, R.brown); post(p, 25, 18, 50, R.brown);
  p.line(7, 48, 25, 22, R.brown[1]); p.line(25, 48, 7, 22, R.brown[1]);
  planks(p, 2, 14, 28, 6, R.brown, 3);
  for (const x of [5, 13, 21]) { p.rect(x, 7, 7, 7, R.brown[2]); p.box(x, 7, 7, 7, R.brown[1]); p.ellipse(x + 3.5, 11, 1.6, 1.6, INK); p.poly([[x - 1, 7], [x + 3.5, 3], [x + 8, 7]], R.ember[2]); }
  // the gull on top
  const gy = f % 2;
  p.ellipse(16, 2 + gy, 3, 1.6, W); p.set(19, 1 + gy, R.gold[3]); p.set(17, 1 + gy, INK); p.line(13, 2 + gy, 11, 0 + gy, R.stone[3]);
  return p;
}
function ledgerPost(f) {
  const p = new Px(16, 30);
  footShadow(p, 8, 27, 6, 1.5);
  post(p, 7, 10, 28, R.brown, 2);
  p.rect(2, 4, 12, 9, R.teal[2]); p.box(2, 4, 12, 9, R.teal[1]); p.hline(2, 13, 4, R.teal[4]);
  p.rect(4, 6, 8, 5, R.sand[4]); p.vline(8, 6, 10, R.sand[1]); p.hline(5, 7, 8, R.ink[3]); p.hline(9, 11, 7, R.ink[3]);
  p.rect(6, 1, 4, 3, R.gold[2]); p.hline(7, 8, 2, INK);
  if (f) { p.ball(8, f === 1 ? 0 : -1, 1.4, 1.4, R.gold); }
  return p;
}
function mint(f) {
  const p = new Px(32, 44);
  footShadow(p, 16, 41, 15, 2.5);
  masonry(p, 2, 24, 28, 18, R.stone, 7, 4);
  p.rect(1, 22, 30, 3, R.stone[4]);
  post(p, 4, 2, 22, R.stone, 3); post(p, 25, 2, 22, R.stone, 3);
  p.rect(3, 1, 26, 4, R.gold[2]); p.hline(3, 28, 1, R.gold[4]);
  const py = [8, 12, 15][f % 3];
  p.rect(13, 5, 6, py - 5, R.stone[2]); p.rect(10, py, 12, 4, R.gold[3]); p.hline(10, 21, py, R.gold[4]);
  p.rect(10, 19, 12, 3, R.stone[1]);
  for (const [x, y] of [[6, 31], [9, 33], [22, 32], [25, 30], [16, 34]]) { p.ball(x, y, 1.8, 1.4, R.gold, { spec: W }); }
  if (f === 2) { p.set(9, 18, W); p.set(22, 18, W); }
  return p;
}
function echoChamber(f) {
  const p = new Px(48, 64);
  footShadow(p, 24, 61, 23, 3);
  masonry(p, 3, 48, 42, 14, R.violet, 7, 4, R.ink[1]);
  p.rect(2, 46, 44, 3, R.violet[3]);
  // spiral shell horn
  p.ellipse(24, 30, 18, 17, (x, y, nx, ny) => band(R.violet, 0.6 - nx * 0.3 - ny * 0.35));
  for (let k = 0; k < 4; k++) p.ellipse(24 + k * 2, 30 - k, 15 - k * 4, 14 - k * 3.6, k % 2 ? R.violet[1] : R.violet[2]);
  p.ellipse(32, 26, 4, 4, INK); p.ellipse(32, 26, 2, 2, [R.teal[2], R.teal[3], R.teal[4]][f % 3]);
  for (let r = 0; r < 3; r++) { const rr = 6 + ((r * 6 + f * 2) % 18); for (let a = 0; a < 16; a++) if ((a + f) % 2) p.set(32 + Math.round(Math.cos(a / 2.5) * rr * 0.4), 26 + Math.round(Math.sin(a / 2.5) * rr * 0.3) - 14, R.teal[3]); }
  rune(p, 22, 52, 'eye', R.teal[4]);
  return p;
}

// ------------------------------------------------------------------ Flux generators

function tideWheel(f) {
  const p = new Px(32, 44);
  footShadow(p, 16, 41, 15, 2.5);
  p.rect(0, 34, 32, 8, R.sea[2]); for (let x = 0; x < 32; x += 3) p.set(x + (f % 3), 35, R.ice[4]);
  post(p, 2, 10, 40, R.brown); post(p, 28, 10, 40, R.brown);
  p.ellipse(16, 22, 13, 13, R.brown[1]); p.ellipse(16, 22, 11, 11, (x, y) => null);
  for (let y = 0; y < 44; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 22); if (d < 11.2 && d > 2) p.erase(x, y); }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + f * (Math.PI / 12);
    p.line(16, 22, 16 + Math.cos(a) * 12, 22 + Math.sin(a) * 12, R.brown[3]);
    p.rect(16 + Math.round(Math.cos(a) * 12) - 1, 22 + Math.round(Math.sin(a) * 12) - 1, 3, 3, R.brown[2]);
  }
  p.ball(16, 22, 2.5, 2.5, R.stone);
  p.rect(26, 18, 6, 7, R.gold[2]); p.set(29, 21, f ? R.sea[4] : R.ink[2]);
  return p;
}
function emberBoiler(f) {
  const p = new Px(32, 52);
  footShadow(p, 16, 49, 15, 2.5);
  masonry(p, 2, 38, 28, 12, R.ink, 7, 4);
  p.rect(9, 41, 10, 7, INK); if (f) { p.rect(10, 44, 8, 4, R.ember[3]); flame(p, 14, 47, 4, f); }
  // tank
  p.rect(3, 16, 26, 22, (x, y, i) => (i < 3 ? R.ember[3] : i < 12 ? R.ember[2] : i < 22 ? R.ember[1] : R.ember[0]));
  p.ellipse(16, 16, 13, 3, R.ember[3]); band2(p, 3, 22, 26, R.stone); band2(p, 3, 32, 26, R.stone);
  rivets(p, [[5, 27], [10, 27], [15, 27], [20, 27], [25, 27]], R.gold[4]);
  // stack
  p.rect(20, 0, 6, 16, (x, y, i) => (i < 2 ? R.stone[3] : R.stone[1])); p.rect(19, 0, 8, 2, R.stone[4]);
  pipe(p, 2, 24, 2, 38, R.stone);
  p.rect(6, 18, 6, 5, R.ice[3]); p.set(9, 20, f ? R.ember[4] : R.ink[2]);
  return p;
}
function prismArray(f) {
  const p = new Px(32, 40);
  footShadow(p, 16, 37, 15, 2.5);
  p.rect(2, 30, 28, 8, R.stone[2]); p.hline(2, 29, 30, R.stone[4]);
  for (let k = 0; k < 3; k++) {
    const x = 3 + k * 9;
    p.poly([[x, 28], [x + 3, 10 - (k % 2) * 4], [x + 8, 12 - (k % 2) * 4], [x + 7, 28]], R.ice[3]);
    p.line(x, 28, x + 3, 10 - (k % 2) * 4, W);
    p.line(x + 2, 26, x + 6, 14 - (k % 2) * 4, R.violet[3]);
    post(p, x + 3, 28, 30, R.stone, 1);
  }
  if (f) { const cols = [R.ember[4], R.gold[4], R.grass[4], R.sea[4], R.violet[4]]; for (let k = 0; k < 5; k++) p.set(4 + ((k * 6 + f * 3) % 26), 6 + (k % 3) * 6, cols[(k + f) % 5]); }
  return p;
}
function rimeTurbine(f) {
  const p = new Px(32, 56);
  footShadow(p, 16, 53, 12, 2.5);
  masonry(p, 8, 44, 16, 10, R.ice, 4, 4, R.sea[1]);
  p.poly([[13, 44], [15, 16], [17, 16], [19, 44]], R.ice[3]); p.line(13, 44, 15, 16, R.ice[4]);
  const a0 = f * (Math.PI / 9);
  for (let k = 0; k < 3; k++) {
    const a = a0 + (k / 3) * Math.PI * 2;
    const x1 = 16 + Math.cos(a) * 14, y1 = 15 + Math.sin(a) * 14;
    p.line(16, 15, x1, y1, R.ice[4], 2); p.line(16 + Math.cos(a + 0.2) * 3, 15 + Math.sin(a + 0.2) * 3, x1, y1, R.ice[2]);
  }
  p.ball(16, 15, 3, 3, R.sea, { spec: W });
  p.speckle([W], 0.1, 5, (c, x, y) => y > 44);
  return p;
}
function umbralReactor(f) {
  const p = new Px(32, 48);
  footShadow(p, 16, 45, 15, 2.5);
  masonry(p, 2, 34, 28, 12, R.ink, 7, 4);
  p.rect(1, 32, 30, 3, R.violet[2]);
  for (const x of [3, 25]) { post(p, x, 6, 32, R.violet, 4); p.rect(x - 1, 4, 6, 3, R.violet[4]); }
  p.ellipse(16, 18, 10, 12, R.ink[1]);
  const c = [R.violet, R.teal, R.violet][f % 3];
  p.ball(16, 18, 6 + (f % 2), 7 + (f % 2), c, { spec: W });
  p.ellipse(16, 18, 12, 3, (x, y, nx, ny) => (Math.abs(ny) > 0.55 ? R.gold[3] : null));
  if (f) glow(p, 16, 18, 13, c);
  rune(p, 14, 38, 'eye', R.teal[4]);
  return p;
}

// ------------------------------------------------------------------ turrets

function boltTurret(f) {
  const p = new Px(16, 24);
  footShadow(p, 8, 21, 7, 2);
  p.rect(3, 16, 10, 6, R.stone[2]); p.hline(3, 12, 16, R.stone[4]); p.hline(3, 12, 21, R.stone[0]);
  p.rect(6, 12, 4, 4, R.brown[2]);
  // crossbow
  p.rect(2, 8, 12, 4, R.brown[3]); p.hline(2, 13, 8, R.brown[4]);
  p.path([[1, 6], [4, 10], [12, 10], [15, 6]], R.stone[4]);
  p.line(8, 9, 8 + (f ? 0 : 0), f ? 2 : 4, R.stone[3]); p.set(8, f ? 1 : 3, R.gold[4]);
  if (f) { p.set(8, 0, W); }
  return p;
}
function arcSpire(f) {
  const p = new Px(16, 36);
  footShadow(p, 8, 33, 6, 2);
  p.rect(3, 29, 10, 5, R.stone[2]); p.hline(3, 12, 29, R.stone[4]);
  for (let y = 10; y < 29; y++) p.hline(6, 9, y, y % 3 === 0 ? R.ember[3] : R.stone[y % 3 === 1 ? 3 : 2]);
  p.ball(8, 6, 4, 4, R.sea, { spec: W });
  if (f) {
    const pts = [[8, 6], [4 + f, 2], [1, 4 - f]];
    p.path(pts, R.ice[4]); p.path([[8, 6], [12, 1 + f], [15, 3]], R.ice[4]); glow(p, 8, 6, 7, R.sea);
  }
  return p;
}

const ART = {
  burrow_1: [(f) => burrow(1, f), 3, 4], burrow_2: [(f) => burrow(2, f), 3, 4], burrow_3: [(f) => burrow(3, f), 3, 4],
  hopper: [hopper], spillway: [spillway],
  sluice_1: [(f) => sluice(1, f), 4, 6], sluice_2: [(f) => sluice(2, f), 4, 10], sluice_3: [(f) => sluice(3, f), 4, 16],
  grabber: [(f) => grabber(f), 3, 4], filter_grabber: [(f) => grabber(f, true), 3, 4], splitter: [splitter],
  autobench_1: [(f) => autobench(1, f), 4, 5], autobench_2: [(f) => autobench(2, f), 4, 7], autobench_3: [(f) => autobench(3, f), 4, 9],
  drill: [drill, 4, 8], tiller_bot: [tillerBot, 3, 4], trawl_buoy: [trawlBuoy, 3, 2], gull_roost: [gullRoost, 3, 3],
  ledger_post: [ledgerPost, 3, 3], mint: [mint, 4, 5], echo_chamber: [echoChamber, 4, 4],
  tide_wheel: [tideWheel, 4, 5], ember_boiler: [emberBoiler, 3, 6], prism_array: [prismArray, 4, 4], rime_turbine: [rimeTurbine, 4, 8], umbral_reactor: [umbralReactor, 3, 3],
  bolt_turret: [boltTurret, 2, 3], arc_spire: [arcSpire, 3, 8],
};

const sprites = buildStructures(ART, STRUCTS);

// Rotated directional copies (16x16 footprint machines; taller ones rotate the 16x16 bottom square only).
const DIRECTIONAL = ['sluice_1', 'sluice_2', 'sluice_3', 'spillway', 'splitter'];
for (const id of DIRECTIONAL) {
  const [fn, n = 1, fps = 6] = ART[id];
  for (let r = 0; r < 4; r++) {
    const frames = [];
    for (let f = 0; f < n; f++) frames.push(done(fn(f).rotate((r * Math.PI) / 2, 8, 8)));
    sprites[`struct.${id}.r${r}`] = n > 1 ? { w: 16, h: 16, fps, anchor: [8, 16], frames } : { w: 16, h: 16, anchor: [8, 16], px: frames[0] };
  }
}
for (const id of ['grabber', 'filter_grabber']) for (let r = 0; r < 4; r++) sprites[`struct.${id}.r${r}`] = { ref: 'struct.' + id };

export default sprites;
