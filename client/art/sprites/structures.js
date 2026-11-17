// WP3 structure sprites ('struct.<id>'): stations, storage, utility, defence, farming and decor structures.
// Size: (w*16) x (h*16 + extra) px, anchored bottom-centre on the footprint. Animated structures use `frames`:
// frame 0 is the idle / off look (the structure drawer pins frame 0 when `on` is 0), the rest cycle while working.
// Automation and Flux machines are in machines.js; Beacons, the Tidegate and world landmarks come from gen/big.js.

import { Px, R, INK, done, band } from '../gen/paint.js';
import { W, planks, masonry, gable, shedRoof, post, flame, glow, band2, rivets, pipe, crate, boxCrate, footShadow, rune } from '../gen/build.js';
import { LANDMARKS } from '../gen/big.js';
import STRUCTS from '../../../shared/data/structures.js';

const TIER = [null, { wood: R.brown, metal: R.stone, trim: R.ember }, { wood: R.brown, metal: R.stone, trim: R.stone }, { wood: R.ink, metal: R.gold, trim: R.violet }];

// ------------------------------------------------------------------ stations

function campfire(f) {
  const p = new Px(16, 24);
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; p.ball(8 + Math.cos(a) * 5.5, 19 + Math.sin(a) * 2.6, 1.6, 1.3, R.stone); }
  p.line(4, 20, 12, 17, R.brown[2], 2); p.line(4, 17, 12, 20, R.brown[3], 2);
  if (f > 0) { flame(p, 8, 17, 9 + (f % 2), f); glow(p, 8, 14, 7, R.gold); }
  else { p.set(8, 17, R.stone[2]); p.set(7, 16, R.stone[1]); p.set(9, 15, R.ink[3]); }
  return p;
}
function workbench(t) {
  const { wood, metal, trim } = TIER[t];
  const p = new Px(32, 24);
  footShadow(p, 16, 21, 15, 2.6);
  // legs
  post(p, 3, 14, 22, wood); post(p, 27, 14, 22, wood);
  if (t >= 2) { p.line(5, 20, 26, 20, metal[2]); }
  // top
  crate(p, 1, 9, 30, 5, 4, wood);
  planks(p, 1, 9, 30, 4, t === 3 ? R.violet : wood, 2, true);
  p.hline(1, 30, 13, wood[0]);
  // tools: saw, hammer, vise
  p.line(5, 8, 12, 5, metal[3]); p.line(5, 9, 12, 6, metal[1]); p.rect(4, 7, 2, 3, R.brown[2]);
  p.rect(15, 6, 3, 2, metal[2]); p.line(16, 8, 18, 4, R.brown[3]);
  p.rect(23, 4, 5, 5, metal[2]); p.rect(24, 3, 3, 1, metal[4]); p.hline(22, 28, 8, metal[1]); p.set(27, 5, trim[3]);
  if (t >= 2) rivets(p, [[2, 10], [29, 10], [16, 10]], metal[4]);
  if (t === 3) { p.ball(20, 7, 1.6, 1.6, R.violet, { spec: W }); p.set(9, 11, R.gold[4]); }
  return p;
}
function kiln(t, f) {
  const p = new Px(32, 44);
  const brick = t === 1 ? R.ember : t === 2 ? R.stone : R.ink;
  footShadow(p, 16, 40, 15, 3);
  // dome body
  p.ellipse(16, 26, 13, 15, (x, y, nx, ny) => (y > 41 ? null : band(brick, 0.55 - nx * 0.3 - ny * 0.25)));
  for (let y = 14; y < 41; y += 4) for (let x = 3; x < 30; x++) if (p.filled(x, y) && p.filled(x, y - 1)) p.set(x, y, brick[0]);
  for (let y = 14; y < 41; y++) for (let x = 3; x < 30; x++) if (p.filled(x, y) && (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0 && y % 4 !== 0) p.set(x, y, brick[1]);
  // chimney
  masonry(p, 20, 2, 6, 12, brick, 3, 3);
  p.rect(19, 1, 8, 2, brick[3]);
  if (t >= 2) { band2(p, 4, 30, 25, R.stone); band2(p, 19, 6, 8, R.stone); }
  if (t === 3) { for (const [x, y] of [[7, 22], [24, 24], [11, 18]]) p.set(x, y, R.ember[3]); }
  // mouth
  p.ellipse(16, 35, 6, 5, (x, y) => (y > 39 ? null : INK));
  p.hline(10, 22, 40, brick[0]);
  if (f > 0) {
    p.ellipse(16, 37, 5, 3, (x, y, nx, ny) => (y > 39 ? null : ny < -0.2 ? R.ember[3] : R.gold[f % 2 ? 4 : 3]));
    flame(p, 15 + (f % 2), 39, 6, f);
    p.set(23, 0, R.stone[3]); p.set(21 + f, 0, R.stone[2]);
  }
  return p;
}
function loom() {
  const p = new Px(32, 30);
  footShadow(p, 16, 27, 15, 2.5);
  post(p, 2, 4, 28, R.brown); post(p, 28, 4, 28, R.brown);
  p.rect(2, 3, 28, 2, R.brown[3]); p.hline(2, 29, 3, R.brown[4]);
  p.rect(4, 20, 24, 2, R.brown[2]);
  for (let x = 5; x < 28; x += 2) p.vline(x, 5, 19, R.ice[x % 4 === 1 ? 4 : 3]);
  p.rect(5, 12, 22, 8, (x, y) => ((x + y) % 2 ? R.teal[3] : R.teal[2]));
  p.hline(5, 26, 12, R.teal[4]); p.hline(5, 26, 16, R.gold[3]);
  p.rect(10, 23, 12, 3, R.brown[1]); p.hline(10, 21, 23, R.brown[3]);
  return p;
}
function anvil(t) {
  const m = t === 1 ? R.stone : t === 2 ? R.stone : R.ink;
  const p = new Px(16, 20);
  footShadow(p, 8, 17, 7.5, 2);
  p.rect(4, 13, 8, 6, (x, y, i) => cyl3(R.brown, i / 7));
  p.hline(4, 11, 13, R.brown[4]); p.hline(4, 11, 15, R.brown[1]);
  p.poly([[1, 6], [15, 6], [13, 9], [10, 9], [11, 13], [5, 13], [6, 9], [3, 9]], m[2]);
  p.hline(1, 15, 6, m[4]); p.hline(2, 14, 7, m[3]);
  p.poly([[1, 6], [0, 5], [3, 5]], m[3]);
  p.hline(3, 13, 9, m[0]);
  if (t >= 2) rivets(p, [[6, 11], [9, 11]], R.gold[3]);
  if (t === 3) { p.hline(4, 11, 7, R.ember[3]); p.set(8, 7, R.gold[4]); }
  p.rect(10, 3, 2, 3, R.brown[2]); p.rect(9, 2, 4, 2, m[3]);
  return p;
}
function cyl3(ramp, t) { return t < 0.2 ? ramp[3] : t < 0.6 ? ramp[2] : ramp[1]; }
function cookpot(f) {
  const p = new Px(16, 24);
  footShadow(p, 8, 21, 7.5, 2);
  p.line(2, 22, 5, 10, R.brown[2]); p.line(14, 22, 11, 10, R.brown[2]); p.hline(4, 12, 9, R.brown[1]);
  p.line(8, 9, 8, 11, R.stone[2]);
  p.ball(8, 15, 5.5, 4.5, R.ink, { spec: R.stone[3] });
  p.ellipse(8, 11.5, 5, 1.6, R.ink[2]); p.ellipse(8, 11.5, 3.6, 1, f ? R.ember[3] : R.brown[2]);
  if (f) { flame(p, 8, 22, 3, f); for (let k = 0; k < 3; k++) p.set(6 + k * 2 + (f % 2), 7 - k - f, R.stone[4]); }
  else { p.set(7, 21, R.stone[1]); p.set(9, 21, R.ink[3]); }
  return p;
}
function still(f) {
  const p = new Px(16, 26);
  footShadow(p, 8, 23, 7.5, 2);
  p.ball(6, 18, 4.5, 4.5, R.ember, { spec: W });
  p.rect(4, 8, 4, 6, R.ember[3]); p.vline(4, 8, 13, R.ember[4]); p.ellipse(6, 7, 2.2, 1.4, R.ember[2]);
  p.path([[7, 7], [10, 4], [13, 6], [13, 12]], R.ember[3]);
  for (let y = 12; y < 18; y += 2) p.hline(11, 14, y, R.ember[2]);
  p.rect(11, 19, 4, 4, R.ice[3]); p.rect(12, 20, 2, 3, f ? R.grass[3] : R.grass[2]);
  if (f) { p.set(13, 17 + (f % 2), R.grass[4]); glow(p, 6, 23, 3, R.ember); }
  p.rect(2, 22, 9, 2, R.stone[2]);
  return p;
}
function temperingForge(f) {
  const p = new Px(32, 44);
  footShadow(p, 16, 40, 15, 3);
  masonry(p, 2, 16, 28, 25, R.stone, 7, 4);
  p.rect(1, 14, 30, 3, R.stone[3]); p.hline(1, 30, 14, R.stone[4]);
  p.rect(9, 24, 14, 10, INK);
  p.rect(10, 29, 12, 5, f ? R.ember[3] : R.ink[2]);
  if (f) { flame(p, 13, 33, 6, f); flame(p, 19, 33, 5, f + 1); glow(p, 16, 20, 6, R.ember, false); }
  // hood + chimney
  p.poly([[6, 14], [10, 6], [22, 6], [26, 14]], R.ink[3]); p.line(6, 14, 10, 6, R.ink[4]);
  masonry(p, 13, 0, 6, 7, R.ink, 3, 3);
  // bellows
  p.poly([[25, 30], [31, 26], [31, 36]], R.brown[2]); p.line(25, 30, 31, 26, R.brown[3]);
  p.rect(3, 33, 5, 4, R.ink[2]); p.rect(3, 31, 5, 2, R.stone[4]);
  return p;
}

// ------------------------------------------------------------------ storage, utility, defence

function stockpile() {
  const p = new Px(16, 22);
  footShadow(p, 8, 19, 7.5, 2);
  boxCrate(p, 1, 10, 9, R.brown);
  p.ball(12, 16, 3.5, 3.6, R.sand); p.rect(11, 12, 2, 2, R.brown[1]);
  boxCrate(p, 4, 3, 8, R.brown);
  p.rect(6, 1, 4, 3, R.stone[2]); p.hline(6, 9, 1, R.stone[4]);
  return p;
}
function brineLocker() {
  const p = new Px(32, 24);
  footShadow(p, 16, 21, 15, 2);
  crate(p, 1, 6, 30, 15, 5, R.teal);
  planks(p, 1, 11, 30, 10, R.brown, 3);
  p.box(1, 11, 30, 10, R.teal[1]);
  band2(p, 1, 10, 30, R.gold); p.vline(8, 6, 20, R.gold[2]); p.vline(23, 6, 20, R.gold[2]);
  p.rect(14, 12, 4, 4, R.gold[3]); p.set(15, 14, INK); p.set(16, 14, INK);
  p.speckle([R.ice[4]], 0.04, 5, (c, x, y) => y < 11);
  return p;
}
function hammock() {
  const p = new Px(32, 24);
  post(p, 1, 2, 22, R.brown); post(p, 29, 2, 22, R.brown);
  p.path([[3, 6], [10, 13], [22, 13], [29, 6]], R.sand[2]);
  for (let x = 6; x < 27; x++) { const y = Math.round(6 + Math.sin(((x - 3) / 26) * Math.PI) * 8); p.vline(x, y - 1, y + 1, x % 4 < 2 ? R.ember[3] : R.sand[4]); }
  p.path([[3, 5], [10, 12], [22, 12], [29, 5]], R.sand[4]);
  return p;
}
function lamp(f) {
  const p = new Px(16, 30);
  footShadow(p, 8, 27, 4, 1.5);
  p.rect(5, 26, 6, 3, R.stone[2]); p.hline(5, 10, 26, R.stone[4]);
  post(p, 7, 8, 26, R.ink, 2);
  p.rect(4, 2, 8, 2, R.ink[3]); p.rect(5, 4, 6, 7, f ? R.gold[4] : R.gold[2]); p.box(5, 4, 6, 7, R.ink[2]);
  p.vline(8, 4, 10, R.ink[2]); p.set(6, 5, W);
  if (f) glow(p, 8, 7, 7, R.gold);
  return p;
}
function marketStall() {
  const p = new Px(32, 36);
  footShadow(p, 16, 33, 15, 2);
  post(p, 2, 8, 34, R.brown); post(p, 28, 8, 34, R.brown);
  crate(p, 1, 22, 30, 11, 3, R.brown);
  planks(p, 1, 25, 30, 8, R.brown, 4, true);
  for (let x = 2; x < 30; x++) p.vline(x, 4, 10, Math.floor(x / 4) % 2 ? R.ember[3] : '#');
  for (let x = 2; x < 30; x += 4) p.ellipse(x + 2, 11, 2, 1.5, Math.floor(x / 4) % 2 ? R.ember[2] : R.ice[3]);
  p.hline(1, 30, 4, R.ember[1]);
  p.ball(7, 20, 2.2, 2, R.ember); p.ball(12, 20, 2.2, 2, R.gold); p.ball(20, 20, 2.2, 2, R.grass); p.ball(25, 20, 2.2, 2, R.violet);
  p.rect(14, 26, 4, 4, R.gold[3]);
  return p;
}
function waystone(f) {
  const p = new Px(16, 34);
  footShadow(p, 8, 31, 7, 2);
  p.rect(3, 28, 10, 4, R.stone[1]); p.hline(3, 12, 28, R.stone[3]);
  p.poly([[4, 28], [5, 6], [8, 2], [11, 6], [12, 28]], (x) => (x < 7 ? R.stone[3] : x < 10 ? R.stone[2] : R.stone[1]));
  p.line(5, 6, 8, 2, R.stone[4]);
  const c = f ? (f === 1 ? R.teal[4] : R.teal[3]) : R.teal[1];
  rune(p, 6, 10, 'eye', c); rune(p, 6, 18, 'wave', c);
  if (f) glow(p, 8, 14, 6, R.teal);
  return p;
}
function wall() {
  const p = new Px(16, 26);
  masonry(p, 0, 6, 16, 18, R.stone, 6, 4);
  p.rect(0, 4, 16, 3, R.stone[4]); p.hline(0, 15, 6, R.stone[2]);
  for (let x = 0; x < 16; x += 6) p.rect(x, 2, 3, 2, R.stone[3]);
  p.hline(0, 15, 24, R.stone[0]); p.hline(0, 15, 25, R.ink[1]);
  return p;
}
function gate() {
  const p = new Px(16, 26);
  post(p, 0, 2, 24, R.stone, 3); post(p, 13, 2, 24, R.stone, 3);
  planks(p, 3, 6, 10, 18, R.brown, 3, true);
  band2(p, 3, 9, 10, R.stone); band2(p, 3, 18, 10, R.stone);
  p.set(11, 14, R.gold[4]);
  return p;
}
function callingShrine(f) {
  const p = new Px(32, 44);
  footShadow(p, 16, 40, 15, 3);
  masonry(p, 3, 30, 26, 10, R.stone, 6, 3);
  p.rect(2, 28, 28, 3, R.stone[4]);
  for (const x of [4, 24]) { masonry(p, x, 8, 4, 20, R.stone, 4, 4); p.rect(x - 1, 6, 6, 2, R.stone[4]); }
  p.poly([[2, 6], [16, 0], [30, 6]], R.violet[2]); p.line(2, 6, 16, 0, R.violet[4]);
  // floating card
  const cy = 14 + (f % 2);
  p.rect(12, cy, 8, 11, R.sand[4]); p.box(12, cy, 8, 11, R.gold[3]);
  rune(p, 14, cy + 3, 'star', R.violet[3]);
  if (f) glow(p, 16, cy + 5, 8, R.violet);
  p.ball(16, 29, 2.5, 1.4, R.violet, { spec: W });
  return p;
}

// ------------------------------------------------------------------ farming

function dripCollector(f) {
  const p = new Px(16, 22);
  footShadow(p, 8, 19, 7, 2);
  p.rect(3, 9, 10, 11, (x, y, i) => cyl3(R.brown, i / 9)); band2(p, 3, 11, 10, R.stone); band2(p, 3, 17, 10, R.stone);
  p.ellipse(8, 9, 5, 1.6, R.sea[3]);
  p.poly([[2, 2], [14, 2], [9, 7], [7, 7]], R.ice[3]); p.line(2, 2, 7, 7, R.ice[4]);
  if (f) p.set(8, 8 - (f % 2), R.sea[4]);
  p.rect(10, 13, 4, 3, W); p.set(11, 14, R.ice[3]);
  return p;
}
function sapTap(f) {
  const p = new Px(16, 22);
  footShadow(p, 8, 19, 7, 2);
  p.rect(3, 4, 10, 16, (x, y, i) => cyl3(R.brown, i / 9)); p.ellipse(8, 4, 5, 2, R.sand[3]); p.ellipse(8, 4, 3, 1, R.sand[1]);
  for (let y = 7; y < 19; y += 3) p.set(4 + (y % 5), y, R.brown[0]);
  p.rect(11, 9, 4, 2, R.stone[3]);
  p.rect(10, 14, 5, 5, R.stone[2]); p.hline(10, 14, 14, R.gold[3]);
  if (f) p.set(13, 12 + (f % 2), R.gold[4]);
  return p;
}
function creel(f) {
  const p = new Px(16, 18);
  p.ellipse(8, 11, 7, 5, (x, y) => ((x + y) % 2 ? R.sand[2] : R.sand[3]));
  for (let x = 2; x < 15; x += 3) p.vline(x, 7, 15, R.brown[2]);
  p.ellipse(4, 11, 2.2, 3, INK); p.ellipse(4, 11, 1, 1.6, R.sea[1]);
  p.hline(2, 14, 14, R.brown[1]);
  p.ball(13, 4 - (f % 2), 2, 2, R.ember, { spec: W }); p.line(13, 6, 11, 8, R.stone[4]);
  return p;
}
function sprinkler(f) {
  const p = new Px(16, 20);
  footShadow(p, 8, 17, 5, 1.5);
  p.rect(6, 12, 4, 6, R.stone[2]); p.hline(6, 9, 12, R.stone[4]);
  pipe(p, 7, 6, 7, 12, R.stone);
  const a = f * 0.9;
  p.line(8, 6, 8 + Math.round(Math.cos(a) * 4), 6 + Math.round(Math.sin(a) * 2), R.gold[3]);
  p.ball(8, 6, 1.6, 1.6, R.gold);
  if (f) for (let k = 0; k < 6; k++) { const b = a + k * 1.05; p.set(8 + Math.round(Math.cos(b) * 6), 6 + Math.round(Math.sin(b) * 3), R.sea[4]); }
  return p;
}
function scarecrow() {
  const p = new Px(16, 30);
  footShadow(p, 8, 27, 5, 1.5);
  post(p, 7, 6, 28, R.brown);
  p.rect(1, 11, 14, 2, R.brown[2]);
  p.rect(4, 11, 8, 9, R.teal[2]); p.box(4, 11, 8, 9, R.teal[1]); p.rect(6, 14, 2, 2, R.ember[3]);
  for (const x of [1, 14]) { p.set(x, 13, R.gold[3]); p.set(x, 14, R.gold[4]); }
  p.ball(8, 7, 3.5, 3.2, R.sand); p.set(7, 7, INK); p.set(9, 7, INK); p.hline(7, 9, 9, R.brown[1]);
  p.poly([[2, 5], [14, 5], [8, 0]], R.gold[2]); p.hline(2, 13, 5, R.gold[4]);
  return p;
}
function humHive(f) {
  const p = new Px(16, 24);
  footShadow(p, 8, 21, 7, 2);
  p.rect(5, 17, 6, 5, R.brown[1]);
  for (let k = 0; k < 4; k++) p.rect(2 + (k === 0 ? 1 : 0), 6 + k * 3, 12 - (k === 0 ? 2 : 0), 3, (x, y, i, j) => (j === 0 ? R.gold[4] : j === 2 ? R.gold[1] : R.gold[3]));
  p.poly([[3, 6], [8, 2], [13, 6]], R.brown[3]); p.ellipse(8, 14, 1.6, 1.2, INK);
  for (let k = 0; k < 3; k++) { const x = 3 + ((k * 5 + f * 3) % 11), y = 2 + ((k * 3 + f * 2) % 6); p.set(x, y, R.gold[4]); p.set(x + 1, y, INK); }
  return p;
}

// ------------------------------------------------------------------ defence (non-machine)

function spikeTrap(f) {
  const p = new Px(16, 16);
  p.rect(1, 3, 14, 12, R.stone[1]); p.box(1, 3, 14, 12, R.stone[0]); p.hline(1, 14, 3, R.stone[3]);
  for (let y = 5; y < 14; y += 4) for (let x = 3; x < 14; x += 4) {
    if (f) { p.vline(x, y - 3, y, R.stone[4]); p.set(x, y - 4, W); } else { p.set(x, y, INK); p.set(x, y - 1, R.stone[3]); }
  }
  return p;
}

// ------------------------------------------------------------------ decor

function sapling() {
  const p = new Px(16, 26);
  footShadow(p, 8, 23, 6, 1.5);
  p.ellipse(8, 22, 5, 2, R.brown[2]);
  p.line(8, 22, 8, 9, R.brown[3]); p.line(8, 15, 11, 12, R.brown[2]);
  p.ball(6, 9, 3.6, 3, R.grass); p.ball(11, 8, 3.6, 3, R.grass); p.ball(8, 5, 3.4, 3, R.teal);
  p.set(8, 3, R.gold[4]); p.set(11, 6, R.gold[4]);
  return p;
}

// ------------------------------------------------------------------ table

const ART = {
  campfire: [campfire, 3],
  workbench: [() => workbench(1)], workbench_2: [() => workbench(2)], workbench_3: [() => workbench(3)],
  kiln: [(f) => kiln(1, f), 3], kiln_2: [(f) => kiln(2, f), 3], kiln_3: [(f) => kiln(3, f), 3],
  loom: [loom], anvil: [() => anvil(1)], anvil_2: [() => anvil(2)], anvil_3: [() => anvil(3)],
  cookpot: [cookpot, 3], still: [still, 3], tempering_forge: [temperingForge, 3],
  stockpile: [stockpile], brine_locker: [brineLocker], hammock: [hammock], lamp: [lamp, 3], market_stall: [marketStall],
  waystone: [waystone, 3], wall: [wall], gate: [gate], calling_shrine: [callingShrine, 3],
  drip_collector: [dripCollector, 3], sap_tap: [sapTap, 3], creel: [creel, 3], sprinkler: [sprinkler, 4], scarecrow: [scarecrow], hum_hive: [humHive, 4],
  spike_trap: [spikeTrap, 2], sapling: [sapling],
};

export function buildStructures(art, list) {
  const out = {};
  for (const s of list) {
    const a = art[s.id];
    if (!a) continue;
    const [fn, n = 1, fps = 6] = a;
    const frames = [];
    for (let f = 0; f < n; f++) frames.push(fn(f));
    const w = frames[0].w, h = frames[0].h;
    out['struct.' + s.id] = n > 1
      ? { w, h, fps, anchor: [w / 2, h], frames: frames.map((p) => done(p)) }
      : { w, h, anchor: [w / 2, h], px: done(frames[0]) };
  }
  return out;
}

const sprites = { ...buildStructures(ART, STRUCTS), ...buildStructures(LANDMARKS, STRUCTS) };
// Extra landmark art not tied to a structure id (Tidegate stages etc.).
for (const [id, def] of Object.entries(LANDMARKS.__extra ?? {})) sprites[id] = def;
export default sprites;
