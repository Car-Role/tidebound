// WP3 resource nodes ('node.<id>', 16x16; trees and spires 16x32 / 16x24) and crops ('crop.<id>', one frame per
// growth stage: frame index = stage). Each node also carries 3 palette `variants` (opts.variant = e.v) so a plot of
// the same node kind does not look copy-pasted; the node drawer may also mirror by variant.

import { Px, R, INK, solid, done, rnd, seedOf, band, cyl } from '../gen/paint.js';
import NODES from '../../../shared/data/nodes.js';
import CROPS from '../../../shared/data/crops.js';

const W = '#';

// ------------------------------------------------------------------ trees

function canopy(p, blobs, ramp, seed, opts = {}) {
  const r = rnd(seed);
  for (const [x, y, rx, ry, back] of blobs) {
    p.ellipse(x, y, rx, ry, (xx, yy, nx, ny, d) => {
      let i = 0.55 - nx * 0.32 - ny * 0.42 + (r() - 0.5) * 0.18 - (back ? 0.22 : 0);
      if (d > 0.82 && ny > -0.2) i -= 0.25;
      return band(ramp, i);
    });
  }
  if (opts.speck) p.speckle(opts.speck, opts.density ?? 0.06, seed, (c) => c !== ramp[0]);
}
function trunk(p, x, y0, y1, bark, bend = 0, w = 3) {
  for (let y = y0; y <= y1; y++) {
    const bx = x + Math.round(Math.sin((y - y0) / 5) * bend);
    for (let i = 0; i < w; i++) p.set(bx + i, y, cyl(bark, i / (w - 1 || 1)));
    if (y % 4 === 0) p.set(bx + 1, y, bark[0]);
  }
  p.set(x - 1, y1, bark[1]); p.set(x + w, y1, bark[1]);
}

function bentwood() {
  const p = new Px(16, 32);
  trunk(p, 7, 14, 30, R.brown, 1);
  p.line(9, 18, 12, 15, R.brown[2]);
  canopy(p, [[8, 8, 6.8, 5.5, 1], [4.5, 12, 4, 3.6], [11.5, 11.5, 4.2, 3.8], [8, 6, 5.2, 4.2], [7, 14, 4, 2.6]], R.grass, 3, { speck: [R.grass[4]] });
  p.set(5, 10, R.ember[3]); p.set(11, 8, R.gold[4]);
  return p;
}
function stiltwood() {
  const p = new Px(16, 32);
  // stilt roots: arches from a raised trunk base
  for (const [x0, x1] of [[2, 6], [5, 8], [10, 8], [13, 9]]) p.path([[x0, 30], [x0 + (x1 - x0) / 2, 24], [x1, 21]], R.brown[1]);
  p.path([[3, 30], [5, 24], [7, 21]], R.brown[3]);
  trunk(p, 7, 12, 22, R.brown, 0);
  canopy(p, [[8, 8, 7.2, 4.6, 1], [5, 10, 4.5, 3], [11, 10, 4.5, 3], [8, 6, 5, 3.2]], R.teal, 7, { speck: [R.teal[4], R.sand[4]] });
  for (const x of [3, 7, 12]) p.vline(x, 12, 15, R.teal[1]);
  return p;
}
function ashwood() {
  const p = new Px(16, 32);
  trunk(p, 7, 10, 30, R.ink, 1);
  p.path([[8, 16], [12, 11], [14, 8]], R.ink[2], 2); p.path([[8, 14], [4, 9], [2, 7]], R.ink[2], 2); p.path([[8, 11], [8, 4]], R.ink[2], 2);
  canopy(p, [[13, 7, 3, 2.4], [3, 6, 3.2, 2.4], [8, 4, 3.6, 2.8]], R.stone, 11);
  p.speckle([R.ember[3], R.ember[4], R.gold[4]], 0.14, 11, (c) => c !== R.ink[0]);
  for (const [x, y] of [[7, 20], [9, 26]]) { p.set(x, y, R.ember[3]); p.set(x, y + 1, R.ember[2]); }
  return p;
}
function prismTree() {
  // Glasswaste "spinewood": a fused-glass trunk carrying prism crystals.
  const p = new Px(16, 32);
  for (let y = 14; y <= 30; y++) { const w = y > 27 ? 4 : 2; const x0 = 8 - (w >> 1); for (let i = 0; i < w; i++) p.set(x0 + i, y, i === 0 ? R.sand[4] : R.sand[2]); }
  for (const [x, y] of [[7, 18], [8, 23], [7, 27]]) p.set(x, y, R.ice[4]);
  const prism = (cx, top, hw, bot, ramp) => {
    p.poly([[cx - hw, bot], [cx - hw, top + hw], [cx, top], [cx + hw, top + hw], [cx + hw, bot]], ramp[2]);
    p.poly([[cx - hw, bot], [cx - hw, top + hw], [cx, top], [cx, bot]], ramp[3]);
    p.vline(cx - hw, top + hw, bot - 1, ramp[4]);
  };
  p.line(8, 16, 3, 11, R.sand[2], 2); p.line(8, 15, 13, 9, R.sand[2], 2);
  prism(3, 4, 2, 13, R.ice); prism(13, 2, 2, 11, R.violet); prism(8, 1, 2, 14, R.ice); prism(5, 9, 1, 15, R.violet); prism(11, 8, 1, 15, R.sand);
  p.set(8, 3, W); p.set(2, 7, W); p.set(13, 4, R.gold[4]); p.set(12, 3, W);
  // spines
  for (const [x, y, dx] of [[6, 20, -1], [10, 22, 1], [6, 25, -1]]) { p.set(x, y, R.sand[4]); p.set(x + dx, y - 1, R.sand[4]); }
  return p;
}
function palePine() {
  const p = new Px(16, 32);
  trunk(p, 7, 22, 30, R.sand, 0, 2);
  const tiers = [[8, 2, 3, 8], [8, 6, 5, 13], [8, 11, 6.5, 18], [8, 16, 7.5, 24]];
  for (const [cx, top, hw, bot] of tiers) {
    p.poly([[cx, top], [cx + hw, bot], [cx - hw, bot]], (x, y) => band(R.teal, 0.55 - (x - cx) / (hw * 2.4) - (y - top) / 40));
    p.hline(Math.round(cx - hw + 1), Math.round(cx + hw - 1), bot - 1, R.teal[0]);
    // snow caps on the upper-left of each tier
    p.line(cx, top, cx - hw * 0.6, top + (bot - top) * 0.6, W);
    p.line(cx, top + 1, cx + hw * 0.4, top + (bot - top) * 0.45, R.ice[4]);
  }
  return p;
}
function gloomwood() {
  const p = new Px(16, 32);
  for (let y = 12; y <= 30; y++) { const bx = 7 + Math.round(Math.sin(y / 2.6) * 1.4); p.set(bx, y, R.violet[3]); p.set(bx + 1, y, R.violet[1]); p.set(bx + 2, y, R.ink[2]); }
  p.path([[3, 30], [6, 27]], R.violet[1]); p.path([[13, 30], [10, 27]], R.violet[1]);
  canopy(p, [[8, 7, 7, 5.5, 1], [4, 11, 3.6, 3], [12, 11, 3.6, 3], [8, 5, 4.8, 3.6]], R.violet, 17);
  for (const [x, y] of [[4, 13], [12, 14], [9, 15]]) { p.set(x, y, R.teal[4]); p.set(x, y + 1, R.teal[3]); }
  p.speckle([R.teal[4]], 0.04, 17, (c) => c !== R.violet[0]);
  return p;
}

// ------------------------------------------------------------------ rocks and ores

function boulder(ramp, seed, { cy = 10, rx = 6.6, ry = 5.2, h = 16 } = {}) {
  const p = new Px(16, h), r = rnd(seed), pts = [];
  const n = 8, cyy = cy + (h - 16);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.4;
    const k = 0.82 + r() * 0.22;
    pts.push([8 + Math.cos(a) * rx * k, cyy + Math.sin(a) * ry * k * (Math.sin(a) > 0 ? 0.85 : 1.15)]);
  }
  p.poly(pts, (x, y) => band(ramp, 0.62 - (x - 8) / 16 - (y - cyy) / 10 + (r() - 0.5) * 0.12));
  // top facet
  p.poly([[pts[7][0] + 1, pts[7][1] + 1], [pts[0][0], pts[0][1] + 1], [pts[1][0] - 1, pts[1][1] + 1], [8, cyy - 1]], ramp[3]);
  p.hline(Math.round(8 - rx * 0.7), Math.round(8 + rx * 0.7), Math.round(cyy + ry * 0.75), ramp[0]);
  return p;
}
function vein(rock, oreR, seed, glow = false) {
  const p = boulder(rock, seed);
  const r = rnd(seed * 3);
  for (let k = 0; k < 5; k++) {
    const x = r.int(4, 10), y = r.int(6, 11);
    if (!p.filled(x, y) || !p.filled(x + 1, y + 1)) continue;
    p.set(x, y, oreR[4]); p.set(x + 1, y, oreR[3]); p.set(x, y + 1, oreR[2]); p.set(x + 1, y + 1, oreR[glow ? 3 : 1]);
  }
  p.line(5, 9, 8, 11, oreR[2]);
  return p;
}
function crystalCluster(ramp, base, seed, h = 16) {
  const p = new Px(16, h), d = h - 16;
  p.ellipse(8, 13.5 + d, 6.5, 2.4, (x, y, nx) => band(base, 0.45 - nx * 0.3));
  const spikes = [[8, 2 + d, 2.5, 13 + d, ramp], [4, 7 + d, 1.6, 13 + d, ramp], [12, 5 + d, 1.8, 13 + d, ramp], [10, 9 + d, 1.2, 14 + d, ramp], [6, 9 + d, 1.2, 14 + d, ramp]];
  for (const [x, top, hw, bot, rr] of spikes) {
    p.poly([[x - hw, bot], [x - hw, top + hw], [x, top], [x + hw, top + hw], [x + hw, bot]], rr[2]);
    p.poly([[x - hw, bot], [x - hw, top + hw], [x, top], [x, bot]], rr[3]);
    p.set(x - Math.floor(hw), top + Math.ceil(hw), rr[4]);
  }
  p.set(7, 4 + d, W); p.set(11, 7 + d, W);
  return p;
}
function obsidianSpire() {
  const p = new Px(16, 24);
  p.poly([[3, 23], [6, 6], [8, 1], [10, 7], [13, 23]], (x, y) => band(R.ink, 0.5 - (x - 8) / 9));
  p.poly([[8, 1], [6, 6], [5, 14], [8, 10]], R.ink[3]);
  p.line(7, 4, 6, 12, R.violet[3]); p.set(7, 3, W);
  p.poly([[11, 23], [12, 14], [15, 23]], R.ink[1]); p.poly([[1, 23], [3, 17], [5, 23]], R.ink[2]);
  p.line(9, 15, 11, 20, R.ember[2]);
  return p;
}
function brimstoneVent() {
  const p = boulder(R.ink, 29);
  p.ellipse(8, 8, 2.4, 1.4, R.ink[0]); p.set(8, 8, R.ember[3]);
  for (const [x, y] of [[4, 10], [11, 11], [6, 12], [12, 8]]) { p.set(x, y, R.gold[4]); p.set(x, y - 1, R.gold[3]); p.set(x + 1, y, R.gold[2]); }
  return p;
}
function clayBank() {
  const p = new Px(16, 16);
  p.ellipse(8, 11, 7, 5, (x, y, nx, ny) => (y > 14 ? null : band(R.flesh, 0.55 - nx * 0.25 - ny * 0.35)));
  for (const y of [9, 12]) p.hline(2, 13, y, R.flesh[1]);
  p.speckle([R.brown[2]], 0.05, 5);
  p.set(4, 7, R.teal[3]); p.set(5, 6, R.teal[2]); p.set(11, 7, R.teal[3]);
  return p;
}
function saltPan() {
  const p = new Px(16, 16);
  p.ellipse(8, 12, 7.2, 3.4, (x, y, nx, ny) => band(R.ice, 0.75 - ny * 0.3 - nx * 0.15));
  p.hline(2, 13, 14, R.stone[2]);
  for (const [x, y] of [[5, 9], [9, 8], [11, 10]]) { p.poly([[x - 1, y + 2], [x, y - 2], [x + 1, y + 2]], W); p.set(x + 1, y + 1, R.ice[2]); }
  p.speckle([R.ice[2]], 0.06, 8, (c, x, y) => y > 11);
  return p;
}
function peatMound() {
  const p = new Px(16, 16);
  p.ellipse(8, 11, 6.8, 4.8, (x, y, nx, ny) => (y > 14 ? null : band(R.brown, 0.4 - nx * 0.25 - ny * 0.35)));
  p.speckle([R.brown[0], R.ink[2]], 0.12, 13);
  for (const x of [4, 6, 9, 11]) { p.set(x, 7, R.grass[3]); p.set(x, 6, R.grass[4]); p.set(x + 1, 7, R.grass[2]); }
  return p;
}
function dune() {
  const p = new Px(16, 16);
  p.poly([[1, 15], [6, 7], [10, 6], [15, 15]], (x, y) => band(R.sand, 0.7 - (x - 7) / 12 - (y - 8) / 18));
  p.line(6, 7, 10, 6, R.sand[4]); p.line(4, 12, 9, 10, R.sand[1]);
  // fused-glass shards poking out
  p.poly([[10, 10], [12, 3], [13, 10]], R.ice[3]); p.vline(11, 5, 9, R.ice[4]); p.set(12, 4, W);
  p.poly([[3, 13], [4, 9], [5, 13]], R.violet[3]);
  return p;
}
function iceBlock() {
  const p = new Px(16, 16);
  p.poly([[8, 2], [15, 6], [8, 9], [1, 6]], R.ice[4]);
  p.poly([[1, 6], [8, 9], [8, 15], [1, 12]], R.ice[2]);
  p.poly([[8, 9], [15, 6], [15, 12], [8, 15]], R.ice[1]);
  p.line(3, 6, 7, 4, W); p.line(2, 8, 2, 11, R.ice[3]); p.line(10, 10, 13, 9, R.ice[3]);
  p.line(4, 9, 6, 12, R.ice[1]); p.set(12, 5, R.sea[3]);
  return p;
}
function nullHeap() {
  const p = new Px(16, 16);
  p.ellipse(8, 11, 7, 4.8, (x, y, nx, ny) => (y > 14 ? null : band(R.violet, 0.42 - nx * 0.25 - ny * 0.35)));
  p.speckle([R.ink[1], R.violet[4]], 0.12, 21);
  for (const [x, y] of [[5, 4], [10, 3], [12, 6]]) p.set(x, y, R.teal[4]);
  return p;
}

// ------------------------------------------------------------------ plants

function reeds(stalk, tip, seed) {
  const p = new Px(16, 16), r = rnd(seed);
  for (let k = 0; k < 7; k++) {
    const x = 2 + k * 2, top = r.int(1, 6), lean = r() < 0.5 ? -1 : 1;
    p.path([[x, 15], [x + lean, top + 3]], stalk[[1, 2, 3][k % 3]]);
    p.rect(x + lean, top, 1, 3, tip[k % 2 ? 2 : 3]); p.set(x + lean, top, tip[4]);
  }
  return p;
}
function bush(ramp, fruit, seed) {
  const p = new Px(16, 16);
  canopy(p, [[8, 9, 7, 5.5, 1], [5, 10, 4, 3.6], [11, 10, 4, 3.6], [8, 7, 4.6, 3.6]], ramp, seed);
  if (fruit) for (const [x, y] of [[4, 9], [7, 6], [10, 10], [12, 7], [6, 12], [9, 13]]) { p.set(x, y, fruit[3]); p.set(x + 1, y, fruit[2]); p.set(x, y - 1, fruit[4]); }
  return p;
}
function fronds(ramp, tip, seed, wavy = true) {
  const p = new Px(16, 16), r = rnd(seed);
  for (let k = 0; k < 6; k++) {
    const x0 = 3 + k * 2, top = r.int(1, 5);
    for (let y = 15; y >= top; y--) {
      const x = x0 + Math.round((wavy ? Math.sin(y * 0.7 + k) : (15 - y) * (k - 2.5) * 0.08) * 1.2);
      p.set(x, y, ramp[y < top + 3 ? 3 : k % 2 ? 2 : 1]);
      if (y % 3 === 0) p.set(x + 1, y, ramp[2]);
    }
    if (tip) p.set(x0 + Math.round((wavy ? Math.sin(top * 0.7 + k) : 0) * 1.2), top, tip);
  }
  return p;
}
function spikyBloom() {
  const p = new Px(16, 16);
  for (let k = 0; k < 9; k++) { const a = -Math.PI + (k / 8) * Math.PI; p.line(8, 12, 8 + Math.cos(a) * 7, 12 + Math.sin(a) * 9, k % 2 ? R.flesh[3] : R.flesh[2]); }
  p.ball(8, 9, 3, 3, R.flesh, { spec: W });
  for (let k = 0; k < 9; k++) { const a = -Math.PI + (k / 8) * Math.PI; p.set(8 + Math.cos(a) * 7, 12 + Math.sin(a) * 9, W); }
  p.rect(5, 13, 6, 3, R.grass[1]); p.hline(5, 10, 13, R.grass[2]);
  return p;
}
function mossPatch() {
  const p = new Px(16, 16);
  p.ellipse(8, 12, 7, 3.6, (x, y, nx, ny) => band(R.teal, 0.6 - ny * 0.4 - nx * 0.2));
  p.ellipse(6, 10, 3.6, 2.4, (x, y, nx, ny) => band(R.ice, 0.6 - ny * 0.4));
  p.speckle([W, R.ice[4], R.teal[4]], 0.15, 23);
  return p;
}

// ------------------------------------------------------------------ tidal / gems

function shellbed() {
  const p = new Px(16, 16);
  p.ellipse(8, 12, 7.2, 3.6, (x, y, nx, ny) => band(R.sand, 0.5 - ny * 0.4 - nx * 0.15));
  for (const [x, y, c] of [[4, 11, R.flesh], [9, 10, R.ice], [12, 12, R.flesh], [7, 13, R.sand]]) {
    p.ball(x, y, 2, 1.6, c); p.set(x, y + 1, c[1]); p.set(x - 1, y - 1, W);
  }
  p.set(11, 9, R.sea[4]); p.set(3, 13, R.sea[4]);
  return p;
}
function sandbar() {
  const p = new Px(16, 16);
  p.ellipse(8, 11.5, 7.5, 4, (x, y, nx, ny) => band(R.sand, 0.65 - ny * 0.4 - nx * 0.2));
  p.line(3, 10, 8, 8, R.sand[4]); p.hline(2, 13, 14, R.sand[0]);
  p.set(10, 11, R.sea[4]); p.set(11, 11, R.sea[3]); p.set(5, 12, R.stone[3]);
  p.path([[11, 10], [12, 7], [14, 6]], R.brown[2]);
  return p;
}
function tideCache() {
  const p = new Px(16, 16);
  p.ellipse(8, 13, 7.5, 2.6, R.sand[2]);
  p.rect(3, 6, 10, 7, (x, y, i, j) => (j === 0 ? R.brown[3] : j === 3 ? R.gold[2] : x === 3 ? R.brown[3] : R.brown[2]));
  p.poly([[3, 6], [5, 3], [11, 3], [13, 6]], R.brown[3]); p.hline(5, 10, 3, R.brown[4]);
  p.vline(4, 3, 12, R.gold[2]); p.vline(11, 3, 12, R.gold[2]);
  p.rect(7, 8, 2, 2, R.gold[4]);
  p.hline(2, 13, 12, R.sand[3]); p.set(12, 11, R.teal[3]); p.set(13, 10, R.teal[2]);
  return p;
}

// ------------------------------------------------------------------ table

const NODE_ART = {
  bentwood_tree: [bentwood, [[R.grass, R.teal], [R.grass, R.gold]], 31],
  stiltwood_tree: [stiltwood, [[R.teal, R.grass], [R.brown, R.stone]], 31],
  ashwood_tree: [ashwood, [[R.ember, R.gold]], 31],
  spinewood_cactus: [prismTree, [[R.violet, R.teal], [R.ice, R.sand]], 31],
  palewood_pine: [palePine, [[R.teal, R.sea]], 31],
  gloomwood_tree: [gloomwood, [[R.teal, R.sea]], 31],
  fieldstone_rock: [() => boulder(R.stone, 11), [[R.stone, R.brown]]],
  clay_bank: [clayBank, [[R.flesh, R.ember]]],
  salt_pan: [saltPan, []],
  peat_mound: [peatMound, [[R.grass, R.teal]]],
  obsidian_spire: [obsidianSpire, [[R.violet, R.sea]], 23],
  brimstone_vent: [brimstoneVent, [[R.gold, R.ember]]],
  sunsand_dune: [dune, [[R.ice, R.teal]]],
  everice_block: [iceBlock, [[R.ice, R.sea]]],
  nullsilt_heap: [nullHeap, [[R.teal, R.violet]]],
  copper_vein: [() => vein(R.stone, R.ember, 41), [[R.stone, R.brown]]],
  bogiron_vein: [() => vein(R.brown, R.stone, 43), [[R.brown, R.ink]]],
  cinderite_vein: [() => vein(R.ink, R.ember, 47, true), [[R.ember, R.gold]]],
  prismite_vein: [() => { const p = vein(R.sand, R.violet, 53); p.poly([[10, 8], [11, 4], [12, 8]], R.violet[3]); p.set(11, 5, W); return p; }, [[R.violet, R.ice]]],
  rime_vein: [() => vein(R.ice, R.sea, 59), [[R.sea, R.teal]]],
  umbrite_vein: [() => vein(R.ink, R.teal, 61, true), [[R.teal, R.violet]]],
  reed_clump: [() => reeds(R.sand, R.gold, 3), [[R.gold, R.brown]]],
  marrowberry_bush: [() => bush(R.grass, R.ember, 5), [[R.ember, R.violet]]],
  kelp_tangle: [() => fronds(R.teal, R.sand[4], 7), [[R.teal, R.grass]]],
  ashgrass_tuft: [() => fronds(R.stone, R.ember[4], 9, false), [[R.ember, R.gold]]],
  needlesilk_bloom: [spikyBloom, [[R.flesh, R.violet]]],
  frostmoss_patch: [mossPatch, [[R.teal, R.grass]]],
  inkweed_frond: [() => fronds(R.violet, R.teal[4], 13), [[R.teal, R.sea]]],
  tide_shellbed: [shellbed, [[R.flesh, R.ember]]],
  tide_sandbar: [sandbar, []],
  tide_cache: [tideCache, []],
  gem_node: [() => crystalCluster(R.gold, R.stone, 3), [[R.gold, R.teal], [R.gold, R.violet]]],
  vault_crystal: [() => crystalCluster(R.violet, R.ink, 5, 24), [[R.violet, R.teal], [R.violet, R.ember]]],
};

function swapFor(from, to) { const m = {}; for (let i = 0; i < 5; i++) m[from[i]] = to[i]; return m; }
function tintVariants(alts) {
  const out = alts.map(([a, b]) => swapFor(a, b));
  while (out.length < 3) out.push(out.length ? {} : {});
  return out.slice(0, 3);
}

// ------------------------------------------------------------------ crops

const CROP_LOOK = {
  tidewheat: { leaf: R.grass, fruit: R.gold, kind: 'grain' },
  marrowberry: { leaf: R.grass, fruit: R.ember, kind: 'berry' },
  mudroot: { leaf: R.teal, fruit: R.brown, kind: 'root' },
  saltbloom: { leaf: R.teal, fruit: R.ice, kind: 'flower' },
  scorchpepper: { leaf: R.grass, fruit: R.ember, kind: 'pod' },
  cindercap: { leaf: R.stone, fruit: R.ember, kind: 'cap' },
  sunmelon: { leaf: R.grass, fruit: R.gold, kind: 'melon' },
  glassgourd: { leaf: R.teal, fruit: R.ice, kind: 'melon' },
  snowberry: { leaf: R.sea, fruit: R.ice, kind: 'berry' },
  pinecone_pale: { leaf: R.teal, fruit: R.sand, kind: 'pine' },
  inkcap: { leaf: R.violet, fruit: R.ink, kind: 'cap' },
  moonpetal: { leaf: R.violet, fruit: R.ice, kind: 'flower', glow: true },
};

function cropFrame(look, stage, stages) {
  const p = new Px(16, 16);
  const t = stage / Math.max(1, stages - 1);
  // soil mound
  p.ellipse(8, 14, 5, 1.8, (x, y, nx) => band(R.brown, 0.45 - nx * 0.25));
  if (stage === 0) { p.set(7, 12, look.leaf[3]); p.set(8, 11, look.leaf[4]); p.set(9, 12, look.leaf[2]); return p; }
  const h = Math.round(3 + t * 9), L = look.leaf, F = look.fruit;
  const ripe = stage === stages - 1;
  if (look.kind === 'cap') {
    const n = 1 + Math.round(t * 2);
    for (let k = 0; k < n; k++) {
      const x = [8, 4, 12][k], hh = Math.round(2 + t * 6) - k;
      p.rect(x - 1, 13 - hh, 2, hh, R.sand[3]);
      p.ellipse(x, 13 - hh, 2 + t * 2.2, 1.2 + t * 1.4, (xx, yy, nx, ny) => (ny > 0.3 ? null : band(ripe ? F : L, 0.6 - nx * 0.3 - ny * 0.3)));
    }
    return p;
  }
  if (look.kind === 'pine') {
    p.vline(8, 13 - h, 13, R.brown[2]);
    for (let k = 0; k < 3; k++) { const y = 13 - h + k * Math.max(1, h / 3); p.poly([[8, y - 1], [8 + 2 + k + t * 2, y + 3], [8 - 2 - k - t * 2, y + 3]], L[2 + (k === 0 ? 1 : 0)]); }
    if (ripe) { p.ball(5, 10, 1.3, 1.8, F); p.ball(11, 9, 1.3, 1.8, F); }
    return p;
  }
  // stem + leaves
  p.vline(8, 13 - h, 13, L[1]);
  for (let k = 1; k <= Math.min(4, stage + 1); k++) {
    const y = 13 - Math.round((k / 5) * h) - 1, side = k % 2 ? -1 : 1, len = 2 + Math.round(t * 2);
    p.line(8, y + 1, 8 + side * len, y - 1, L[3]); p.set(8 + side * len, y - 1, L[4]); p.set(8 + side, y + 1, L[2]);
  }
  if (look.kind === 'grain') {
    for (const dx of [-2, 0, 2]) { p.vline(8 + dx, 13 - h, 13, L[2]); if (t > 0.5) p.rect(8 + dx, 13 - h - 2, 1, 3, ripe ? F[3] : L[4]); }
    if (ripe) for (const dx of [-2, 0, 2]) p.set(8 + dx, 13 - h - 2, F[4]);
  } else if (look.kind === 'berry') {
    p.ellipse(8, 12 - h / 2, 2 + t * 4, 1.5 + t * 3, (x, y, nx, ny) => band(L, 0.55 - nx * 0.3 - ny * 0.35));
    if (ripe) for (const [x, y] of [[5, 9], [9, 7], [11, 10], [7, 11]]) { p.set(x, y, F[3]); p.set(x, y - 1, F[4]); }
  } else if (look.kind === 'root') {
    if (ripe) { p.ellipse(8, 13, 2.4, 1.6, F[3]); p.set(7, 12, F[4]); }
  } else if (look.kind === 'flower') {
    if (t > 0.6) {
      const c = 13 - h - 1;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; p.set(8 + Math.round(Math.cos(a) * 1.6), c + Math.round(Math.sin(a) * 1.6), ripe ? F[4] : F[2]); }
      p.set(8, c, look.glow ? R.gold[4] : R.gold[3]);
      if (ripe && look.glow) { p.set(5, c - 2, F[4]); p.set(11, c - 1, F[4]); }
    }
  } else if (look.kind === 'pod') {
    if (t > 0.5) for (const [x, y] of [[6, 13 - h + 3], [10, 13 - h + 5]]) { p.rect(x, y, 2, 3 + (ripe ? 1 : 0), ripe ? F[3] : L[3]); p.set(x, y, ripe ? F[4] : L[4]); }
  } else if (look.kind === 'melon') {
    p.line(8, 12, 13, 12, L[2]);
    if (t > 0.4) p.ball(11, 11, 1.5 + t * 2.2, 1.3 + t * 1.8, ripe ? F : L, { spec: W });
  }
  return p;
}

// ------------------------------------------------------------------ build

const out = {};
for (const n of NODES) {
  const art = NODE_ART[n.id];
  const [fn, alts, tall] = art ?? [() => boulder(R.stone, seedOf(n.id)), []];
  const p = fn();
  out['node.' + n.id] = { w: p.w, h: p.h, anchor: [8, p.h - 1], px: done(p), variants: tintVariants(alts) };
  void tall;
}
for (const c of CROPS) {
  const look = CROP_LOOK[c.id] ?? { leaf: R.grass, fruit: R.gold, kind: 'berry' };
  const frames = [];
  for (let s = 0; s < c.stages; s++) frames.push(done(cropFrame(look, s, c.stages)));
  out['crop.' + c.id] = { w: 16, h: 16, anchor: [8, 15], frames, fps: 0 };
}

export const NODE_IDS = Object.keys(NODE_ART);
export default out;
