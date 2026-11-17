// WP3 item sprites: one 16x16 sprite per item id in shared/data/items.js ('item.<id>').
// Every sprite is generated in code from the master palette with shared archetypes (logs, chunks, ingots,
// gems, bundles, gear, food, fish...), shaded from the top-left and outlined in ink for readability.

import { Px, R, INK, T, solid, done, TIER_METAL, rnd, seedOf, band } from '../gen/paint.js';

const P = () => new Px(16, 16);
const W = '#';

// ------------------------------------------------------------------ raw materials

function log(p, x0, y0, len, bark, core, th = 4) {
  for (let j = 0; j < th; j++) {
    const c = j === 0 ? bark[3] : j === th - 1 ? bark[0] : j === 1 ? bark[2] : bark[1];
    p.hline(x0, x0 + len - 1, y0 + j, c);
  }
  for (let k = x0 + 2; k < x0 + len - 2; k += 3) p.set(k, y0 + 1 + (k % 2), bark[1]);
  p.ellipse(x0 + len - 0.5, y0 + th / 2, 1.6, th / 2, core[3]);
  p.set(x0 + len - 1, y0 + Math.floor(th / 2) - 1, core[4]);
  p.set(x0 + len, y0 + Math.floor(th / 2), core[1]);
  p.set(x0 - 1, y0 + 1, bark[2]);
}
function logs(bark, core, knot) {
  const p = P();
  log(p, 2, 9, 11, bark, core);
  log(p, 4, 4, 10, bark, core);
  if (knot) { p.set(7, 6, knot); p.set(6, 11, knot); p.set(10, 10, knot); }
  return p;
}

function rockPoly(seed, cx = 8, cy = 9, rx = 6, ry = 5, n = 7) {
  const r = rnd(seed), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.5;
    const k = 0.78 + r() * 0.28;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
function chunk(ramp, seed, { cracks = true, rx = 6, ry = 5, cy = 9 } = {}) {
  const p = P();
  const pts = rockPoly(seed, 8, cy, rx, ry);
  solid(p, (m) => m.poly(pts, 'x'), ramp);
  // facet: a lighter wedge top-left
  p.poly([[pts[0][0], pts[0][1] + 1], [pts[pts.length - 1][0] + 1, pts[pts.length - 1][1] + 1], [8, cy]], (x, y) => (p.filled(x, y) ? ramp[3] : null));
  if (cracks) { p.line(9, cy - 1, 11, cy + 2, ramp[1]); p.set(7, cy + 2, ramp[1]); }
  return p;
}
function ore(rock, oreR, seed) {
  const p = chunk(rock, seed, { cracks: false });
  const r = rnd(seed + 3);
  for (let k = 0; k < 4; k++) {
    const x = r.int(4, 10), y = r.int(6, 11);
    if (!p.filled(x, y) || !p.filled(x + 1, y + 1)) continue;
    p.set(x, y, oreR[4]); p.set(x + 1, y, oreR[3]); p.set(x, y + 1, oreR[2]); p.set(x + 1, y + 1, oreR[1]);
  }
  return p;
}
function pile(ramp, grains, seed) {
  const p = P();
  p.ellipse(8, 12, 6.5, 4.5, (x, y, nx, ny) => (ny < -0.0 || y < 13 ? band(ramp, 0.55 - nx * 0.3 - ny * 0.35) : null));
  p.rect(2, 12, 13, 2, (x) => band(ramp, 0.4 - (x - 8) / 20));
  p.ellipse(8, 9.5, 4.5, 3.8, (x, y, nx, ny) => band(ramp, 0.65 - nx * 0.35 - ny * 0.4));
  p.speckle(grains, 0.12, seed);
  return p;
}
function cube(ramp, glint = W) {
  const p = P();
  p.poly([[8, 2], [14, 5], [8, 8], [2, 5]], ramp[4]);
  p.poly([[2, 5], [8, 8], [8, 15], [2, 12]], ramp[2]);
  p.poly([[8, 8], [14, 5], [14, 12], [8, 15]], ramp[1]);
  p.line(3, 5, 7, 3, glint); p.line(3, 7, 3, 10, ramp[3]);
  p.vline(8, 8, 14, ramp[3]);
  return p;
}
function bundle(ramp, tie, { wavy = false, tips = null } = {}) {
  const p = P();
  for (let k = 0; k < 6; k++) {
    const x0 = 3 + k * 2, top = 2 + (k % 3), c = ramp[[1, 3, 2, 4, 2, 1][k]];
    for (let y = top; y < 15; y++) {
      const dx = wavy ? Math.round(Math.sin(y * 0.8 + k) * 0.8) : Math.round((y - 9) * (k - 2.5) * -0.06);
      p.set(x0 + dx, y, c); p.set(x0 + dx + 1, y, y > 12 ? ramp[0] : ramp[[2, 2, 1, 3, 1, 0][k]]);
    }
    if (tips) p.set(x0 + 1, top, tips);
  }
  p.rect(3, 9, 11, 2, tie[2]); p.hline(3, 13, 9, tie[3]); p.set(8, 10, tie[1]);
  return p;
}
function gem(ramp, { w = 5, h = 6, cy = 8 } = {}) {
  const p = P();
  const top = cy - h, mid = cy - 1;
  p.poly([[8 - w + 1, mid], [8 - 2, top], [8 + 2, top], [8 + w, mid], [8, cy + h - 1]], ramp[2]);
  p.poly([[8 - w + 1, mid], [8, cy + h - 1], [8, mid]], ramp[3]);
  p.poly([[8 - 2, top], [8 + 2, top], [8 + 1, mid], [8 - 1, mid]], ramp[4]);
  p.poly([[8, mid], [8 + w, mid], [8, cy + h - 1]], ramp[1]);
  p.set(7, top + 1, W); p.set(6, top + 2, W);
  return p;
}
function crystal(ramp, seed) {
  const p = P(), r = rnd(seed);
  const spikes = [[8, 2, 3, 13], [5, 6, 2, 13], [11, 5, 2, 13], [3, 9, 2, 14], [13, 9, 2, 14]];
  for (const [x, top, hw, bot] of spikes) {
    p.poly([[x - hw, bot], [x - hw, top + hw], [x, top], [x + hw, top + hw], [x + hw, bot]], ramp[2]);
    p.poly([[x - hw, bot], [x - hw, top + hw], [x, top], [x, bot]], ramp[3]);
    p.vline(x - hw, top + hw, bot - 1, ramp[4]);
  }
  p.set(7, 4, W); p.set(r.int(4, 6), 8, W);
  return p;
}
function orb(ramp, { r = 5, cy = 8, spec = W, rim = null } = {}) {
  const p = P();
  p.ball(8, cy, r, r, ramp, { spec, rim });
  return p;
}
function drop(ramp) {
  const p = P();
  p.poly([[8, 2], [12, 9], [8, 14], [4, 9]], ramp[2]);
  p.ball(8, 10, 4.2, 4, ramp);
  p.line(8, 3, 6, 7, ramp[3]); p.set(6, 8, W); p.set(7, 9, ramp[4]);
  return p;
}
function shellSpiral(ramp, accent) {
  const p = P();
  p.ball(8, 9, 6, 5, ramp);
  for (let k = 0; k < 5; k++) p.line(8, 14, 3 + k * 2.5, 5 + Math.abs(k - 2), ramp[1]);
  p.rect(6, 13, 5, 2, accent); p.set(8, 4, ramp[4]);
  return p;
}
function plate(ramp, rivet) {
  const p = P();
  solid(p, (m) => m.rect(2, 4, 12, 9, 'x'), ramp);
  for (const [x, y] of [[3, 5], [12, 5], [3, 11], [12, 11]]) { p.set(x, y, rivet[4]); }
  p.line(5, 6, 9, 6, ramp[4]);
  return p;
}
function blob(ramp, seed, { cy = 10, rx = 6, ry = 4.5 } = {}) {
  const p = P();
  p.ball(8, cy, rx, ry, ramp, { spec: W });
  p.ellipse(5, cy - 3, 2, 2, ramp[2]); p.set(4, cy - 4, ramp[4]);
  const r = rnd(seed);
  p.set(r.int(9, 11), cy + 2, ramp[1]);
  return p;
}

// ------------------------------------------------------------------ processed

function planks(ramp) {
  const p = P();
  for (const [y, dx] of [[10, 0], [6, 1], [2, 2]]) {
    p.rect(2 + dx, y, 12, 4, (x, yy, i, j) => (j === 0 ? ramp[3] : j === 3 ? ramp[1] : ramp[2]));
    p.set(4 + dx + (y % 5), y + 1, ramp[1]); p.hline(8 + dx, 11 + dx, y + 2, ramp[1]);
    p.vline(2 + dx, y, y + 3, ramp[1]); p.vline(13 + dx, y, y + 3, ramp[0]);
  }
  return p;
}
function bricks(ramp) {
  const p = P();
  const brick = (x, y) => { p.rect(x, y, 7, 4, (xx, yy, i, j) => (j === 0 ? ramp[3] : i === 6 || j === 3 ? ramp[1] : ramp[2])); p.set(x + 1, y + 1, ramp[4]); };
  brick(1, 10); brick(8, 10); brick(4, 6);
  return p;
}
function ingot(m, hi = m) {
  const p = P();
  p.poly([[1, 14], [2, 9], [14, 9], [15, 14]], m[2]);
  p.poly([[2, 9], [4, 5], [12, 5], [14, 9]], m[3]);
  p.hline(4, 11, 5, m[4]); p.line(4, 6, 3, 8, m[4]);
  p.hline(1, 15, 14, m[1]); p.hline(2, 14, 9, m[1]);
  p.poly([[12, 5], [14, 9], [15, 14], [14, 14], [13, 9]], m[1]);
  p.line(5, 6, 8, 6, hi[4] === m[4] ? W : hi[4]);
  p.line(3, 11, 6, 11, m[3]);
  return p;
}
function coil(ramp) {
  const p = P();
  for (let k = 0; k < 3; k++) p.ellipse(8, 9 - k * 0, 6 - k * 1.6, 4.6 - k * 1.2, k % 2 ? ramp[1] : ramp[k === 0 ? 2 : 3]);
  p.cut(8, 9, 1.4, 1);
  p.line(12, 9, 14, 14, ramp[2]); p.set(14, 14, ramp[1]);
  for (let x = 3; x < 13; x += 2) p.set(x, 6 + (x % 4 === 1 ? 0 : 1), ramp[4]);
  return p;
}
function cloth(ramp) {
  const p = P();
  solid(p, (m) => m.poly([[2, 5], [13, 3], [14, 12], [3, 14]], 'x'), ramp);
  p.line(3, 9, 13, 7, ramp[1]); p.line(3, 10, 13, 8, ramp[3]);
  p.speckle([ramp[3]], 0.08, 4);
  return p;
}
function hide(ramp) {
  const p = P();
  solid(p, (m) => m.poly([[4, 2], [8, 4], [12, 2], [14, 7], [12, 9], [14, 14], [8, 12], [2, 14], [4, 9], [2, 7]], 'x'), ramp);
  p.ellipse(8, 8, 2.5, 3, ramp[3]);
  return p;
}
function pane(ramp) {
  const p = P();
  p.rect(2, 3, 12, 11, ramp[2]);
  p.box(2, 3, 12, 11, ramp[3]);
  p.line(4, 11, 9, 5, ramp[4]); p.line(6, 12, 11, 6, W); p.line(9, 12, 12, 9, ramp[4]);
  p.hline(2, 13, 13, ramp[1]); p.vline(13, 3, 13, ramp[1]);
  return p;
}
function ballast(stone, band2, tier) {
  const p = P();
  solid(p, (m) => m.rect(2, 4, 12, 10, 'x'), stone);
  p.poly([[2, 4], [5, 2], [15, 2], [13, 4]], stone[4]);
  p.poly([[13, 4], [15, 2], [15, 12], [13, 13]], stone[1]);
  p.rect(2, 7, 12, 2, band2[2]); p.hline(2, 13, 7, band2[3]); p.rect(13, 6, 2, 2, band2[1]);
  for (let k = 0; k < tier; k++) p.set(4 + k * 2, 11, band2[4]);
  return p;
}

// ------------------------------------------------------------------ crops / produce

function sheaf(ramp, tie) {
  const p = P();
  for (let k = 0; k < 5; k++) {
    const x = 4 + k * 2;
    p.line(8, 14, x, 5, ramp[1]);
    p.ellipse(x, 4, 1.2, 2.4, ramp[k % 2 ? 3 : 4]);
    p.set(x, 2, ramp[2]);
  }
  p.rect(6, 10, 5, 2, tie[2]); p.hline(6, 10, 10, tie[3]);
  return p;
}
function root(ramp, leaf) {
  const p = P();
  solid(p, (m) => m.poly([[5, 6], [11, 6], [10, 11], [8, 15], [6, 11]], 'x'), ramp);
  for (let y = 7; y < 13; y += 2) p.set(9, y, ramp[1]);
  for (const [x, y] of [[6, 5], [8, 4], [10, 5]]) p.line(8, 6, x, y - 3, leaf[3]);
  p.set(6, 2, leaf[4]); p.set(10, 2, leaf[2]);
  return p;
}
function flower(petal, center, stem) {
  const p = P();
  p.line(8, 9, 8, 15, stem[2]); p.line(8, 12, 11, 10, stem[3]); p.set(11, 9, stem[4]);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.ball(8 + Math.cos(a) * 3.2, 6 + Math.sin(a) * 3, 1.9, 1.9, petal); }
  p.ball(8, 6, 1.6, 1.6, center);
  return p;
}
function pepper(ramp, stem) {
  const p = P();
  p.poly([[4, 4], [11, 4], [12, 7], [10, 12], [6, 15], [7, 11], [4, 7]], ramp[2]);
  p.ball(8, 6, 3.6, 2.6, ramp);
  p.line(6, 6, 6, 11, ramp[3]); p.set(5, 5, W);
  p.rect(6, 2, 4, 2, stem[2]); p.set(8, 1, stem[3]);
  return p;
}
function mushroom(cap, stem, spots) {
  const p = P();
  p.rect(6, 8, 4, 7, (x) => (x === 6 ? stem[3] : x === 9 ? stem[1] : stem[2]));
  p.ellipse(8, 7, 6.5, 4.5, (x, y, nx, ny) => (ny > 0.5 ? null : band(cap, 0.6 - nx * 0.3 - ny * 0.4)));
  p.hline(2, 13, 8, cap[1]);
  if (spots) for (const [x, y] of [[5, 5], [9, 4], [11, 6], [7, 6]]) p.set(x, y, spots);
  return p;
}
function melon(ramp, stripe) {
  const p = P();
  p.ball(8, 9, 6, 5, ramp, { spec: ramp[4] });
  for (let x = 4; x < 13; x += 3) for (let y = 5; y < 14; y++) if (p.filled(x + Math.round(Math.sin(y * 0.6)), y)) p.set(x + Math.round(Math.sin(y * 0.6)), y, stripe);
  p.rect(7, 3, 2, 2, R.brown[2]);
  return p;
}
function gourd(ramp) {
  const p = P();
  p.ball(8, 11, 5, 4, ramp, { spec: W });
  p.ball(8, 6, 3, 3, ramp, { spec: W });
  p.rect(7, 1, 2, 2, R.brown[2]);
  return p;
}
function berries(ramp, leaf) {
  const p = P();
  for (const [x, y] of [[6, 9], [10, 9], [8, 12], [5, 13], [11, 13], [8, 7]]) { p.ball(x, y, 2.2, 2.2, ramp); p.set(x - 1, y - 1, W); }
  p.poly([[6, 3], [10, 2], [12, 5], [8, 6]], leaf[3]); p.line(6, 3, 10, 5, leaf[2]);
  return p;
}
function pinecone(ramp) {
  const p = P();
  p.ellipse(8, 9, 4.5, 6, ramp[1]);
  for (let y = 4; y < 15; y += 2) for (let x = 4 + (y % 4 ? 1 : 0); x < 13; x += 2) if (p.filled(x, y)) { p.set(x, y, ramp[3]); p.set(x, y + 1, ramp[2]); }
  p.rect(7, 1, 2, 2, R.grass[2]);
  return p;
}
function petal(ramp, glow) {
  const p = P();
  p.poly([[8, 1], [13, 7], [8, 15], [3, 7]], ramp[3]);
  p.poly([[8, 1], [8, 15], [3, 7]], ramp[4]);
  p.line(8, 3, 8, 13, glow); p.set(6, 6, W); p.set(10, 9, ramp[2]);
  return p;
}

// ------------------------------------------------------------------ components

function cog(ramp, hole = INK) {
  const p = P();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.rect(Math.round(8 + Math.cos(a) * 5.6) - 1, Math.round(8 + Math.sin(a) * 5.6) - 1, 2, 2, ramp[2]); }
  p.ball(8, 8, 5, 5, ramp);
  p.ellipse(8, 8, 1.6, 1.6, hole);
  return p;
}
function nails(ramp) {
  const p = P();
  for (const [x, y] of [[3, 3], [7, 2], [9, 6]]) {
    p.line(x, y, x + 5, y + 8, ramp[2]); p.line(x + 1, y, x + 6, y + 8, ramp[3]);
    p.rect(x - 1, y - 1, 3, 2, ramp[4]);
  }
  return p;
}
function canister(body, glass, cap) {
  const p = P();
  p.rect(4, 3, 8, 11, (x) => (x < 6 ? body[3] : x > 10 ? body[1] : body[2]));
  p.rect(6, 5, 4, 6, glass[3]); p.vline(6, 5, 10, glass[4]); p.set(7, 6, W);
  p.rect(5, 1, 6, 2, cap[2]); p.rect(5, 14, 6, 1, cap[1]);
  return p;
}

// ------------------------------------------------------------------ gear

function hook(t) {
  const { m, hi } = TIER_METAL[t];
  const p = P();
  // handle (wood, wrapped)
  p.line(3, 14, 10, 5, R.brown[2], 2); p.line(3, 13, 9, 5, R.brown[3]);
  for (let k = 0; k < 3; k++) p.set(4 + k * 2, 12 - k * 2, R.brown[0]);
  // curved hook head
  const arc = [[8, 4], [9, 2], [11, 1], [13, 2], [14, 4], [14, 6], [13, 8]];
  p.path(arc, m[2], 2);
  p.path(arc.slice(0, 5), m[3]);
  p.set(13, 9, m[4]); p.set(12, 9, m[1]);
  p.rect(9, 4, 3, 2, m[1]); p.set(10, 2, hi[4]);
  if (t >= 4) p.set(14, 3, TIER_METAL[t].gem[4]);
  if (t >= 6) { p.set(12, 1, TIER_METAL[t].gem[3]); p.set(2, 14, TIER_METAL[t].gem[3]); }
  return p;
}
function blade(t) {
  const { m, hi, gem } = TIER_METAL[t];
  const p = P();
  p.line(5, 10, 13, 2, m[3], 2); p.line(6, 10, 13, 3, m[1]); p.line(5, 9, 12, 2, hi[4] === m[4] ? W : hi[4]);
  p.set(14, 1, m[4]);
  p.line(3, 8, 7, 12, t >= 4 ? R.gold[3] : R.gold[2], 2);
  p.line(2, 13, 4, 11, R.brown[2], 2);
  p.ball(1.5, 14.5, 1.2, 1.2, gem);
  return p;
}
function bow(t) {
  const { m, gem } = TIER_METAL[t];
  const p = P();
  const limb = t <= 2 ? R.brown : m;
  const pts = []; for (let k = 0; k <= 10; k++) { const a = -1.2 + (k / 10) * 2.4; pts.push([4 + Math.cos(a) * 9 - 3, 8 + Math.sin(a) * 7]); }
  p.path(pts, limb[2], 2); p.path(pts, limb[3]);
  p.line(pts[0][0], pts[0][1], pts[10][0], pts[10][1], R.stone[4]);
  p.rect(Math.round(pts[5][0]) - 1, 7, 2, 3, R.brown[1]);
  p.set(pts[0][0], pts[0][1], gem[3]); p.set(pts[10][0], pts[10][1], gem[3]);
  p.line(3, 8, 12, 8, R.brown[3]); p.poly([[12, 6], [15, 8], [12, 10]], m[3]);
  return p;
}
const ELEM = [null, R.stone, R.sea, R.ember, R.gold, R.ice, R.violet, R.violet];
function staff(t) {
  const { m } = TIER_METAL[t];
  const p = P();
  p.line(3, 15, 11, 5, R.brown[2], 2); p.line(3, 14, 10, 5, R.brown[3]);
  const e = ELEM[t];
  p.path([[9, 6], [9, 3], [12, 1], [14, 3], [13, 6]], m[2]);
  p.ball(11.5, 4.5, 2.6, 2.6, e, { spec: W });
  if (t >= 5) { p.set(15, 1, e[4]); p.set(8, 1, e[3]); }
  if (t === 7) p.set(11, 0, W);
  return p;
}
function helm(t) {
  const { m, gem } = TIER_METAL[t];
  const p = P();
  p.ellipse(8, 9, 6, 6, (x, y, nx, ny) => (y > 11 ? null : band(m, 0.62 - nx * 0.3 - ny * 0.35)));
  p.rect(2, 11, 12, 3, (x, y, i, j) => (j === 0 ? m[3] : m[1]));
  p.rect(5, 9, 6, 2, INK); p.hline(5, 10, 9, R.ink[2]);
  p.vline(8, 3, 8, m[4]);
  if (t >= 3) p.set(8, 2, gem[3]);
  if (t >= 5) { p.set(2, 6, m[4]); p.set(13, 6, m[4]); }
  return p;
}
function coat(t) {
  const { m, hi, gem } = TIER_METAL[t];
  const p = P();
  solid(p, (q) => q.poly([[3, 3], [6, 2], [8, 4], [10, 2], [13, 3], [14, 8], [12, 8], [12, 15], [4, 15], [4, 8], [2, 8]], 'x'), m);
  p.vline(8, 4, 14, m[1]); p.line(6, 2, 8, 5, hi[4] === m[4] ? m[4] : hi[3]); p.line(10, 2, 8, 5, m[1]);
  p.hline(4, 11, 10, R.brown[1]); p.set(8, 10, gem[3]);
  return p;
}
function boots(t) {
  const { m } = TIER_METAL[t];
  const p = P();
  const boot = (x) => {
    solid(p, (q) => { q.rect(x, 3, 4, 8, 'x'); q.rect(x, 10, 6, 4, 'x'); }, m);
    p.hline(x, x + 5, 13, R.ink[1]); p.hline(x, x + 3, 5, m[4]);
  };
  boot(1); boot(8);
  return p;
}
function rod(t) {
  const ramp = [null, R.brown, R.sand, R.stone, R.gold][t];
  const p = P();
  p.line(1, 15, 13, 1, ramp[2]); p.line(2, 15, 14, 1, ramp[1]);
  p.ball(4, 11, 1.8, 1.8, R.stone); p.set(5, 12, R.ink[1]);
  p.line(14, 1, 14, 10, R.stone[4]); p.set(14, 11, R.ember[3]); p.set(14, 12, '#');
  p.rect(1, 13, 2, 3, R.ink[2]);
  return p;
}
function pack(t) {
  const ramp = [null, R.brown, R.teal, R.ember, R.sand, R.ice][t];
  const p = P();
  solid(p, (q) => { q.rect(3, 4, 10, 11, 'x'); q.rect(4, 3, 8, 1, 'x'); }, ramp);
  p.rect(3, 4, 10, 4, ramp[3]); p.hline(3, 12, 8, ramp[1]);
  p.rect(7, 7, 2, 2, R.gold[3]); p.rect(4, 10, 3, 4, ramp[1]); p.rect(9, 10, 3, 4, ramp[1]);
  p.path([[5, 3], [6, 1], [10, 1], [11, 3]], R.brown[1]);
  for (let k = 1; k < t; k++) p.set(4 + k, 12, R.gold[4]);
  return p;
}
function lantern(glass, frame) {
  const p = P();
  p.rect(4, 5, 8, 9, glass[3]);
  p.ellipse(8, 10, 2.5, 3, glass[4]); p.set(8, 10, W);
  p.box(4, 5, 8, 9, frame[2]); p.vline(8, 5, 13, frame[1]);
  p.rect(5, 3, 6, 2, frame[3]); p.path([[6, 3], [6, 1], [10, 1], [10, 3]], frame[1]);
  p.rect(5, 14, 6, 1, frame[1]);
  return p;
}

// ------------------------------------------------------------------ consumables

function bowl(contents, bowlR = R.brown, garnish = null) {
  const p = P();
  p.ellipse(8, 9, 6.5, 2.4, contents[3]);
  p.ellipse(8, 9, 4.5, 1.4, contents[2]);
  p.ellipse(8, 10, 6.5, 4.5, (x, y, nx, ny) => (y < 10 ? null : band(bowlR, 0.6 - nx * 0.3 - ny * 0.2)));
  p.hline(2, 14, 10, bowlR[4]);
  if (garnish) { p.set(6, 8, garnish); p.set(10, 9, garnish); p.set(8, 8, garnish); }
  p.set(5, 5, R.stone[4]); p.set(6, 4, R.stone[3]); p.set(10, 4, R.stone[4]); p.set(11, 3, R.stone[3]);
  return p;
}
function potion(liquid, cork = R.brown) {
  const p = P();
  p.ball(8, 10, 5, 4.6, R.ice, { spec: W });
  p.ellipse(8, 11, 4, 3.4, (x, y, nx, ny) => (ny < -0.2 ? null : band(liquid, 0.7 - nx * 0.3 - ny * 0.3)));
  p.rect(6, 3, 4, 3, R.ice[3]); p.vline(6, 3, 5, R.ice[4]);
  p.rect(6, 1, 4, 2, cork[2]); p.set(6, 1, cork[3]);
  p.set(6, 8, W);
  return p;
}
function lure(ramp, t) {
  const p = P();
  p.line(8, 1, 8, 4, R.stone[4]);
  p.ellipse(8, 8, 3.2, 4.4, ramp[2]); p.ellipse(7, 7, 1.6, 2.6, ramp[4]);
  p.set(8, 6, INK);
  p.path([[8, 12], [8, 14], [10, 15], [11, 13]], R.stone[3]);
  for (let k = 0; k < Math.min(3, t); k++) p.set(5 + k * 3, 4 + (k % 2), [R.ember[3], R.gold[4], R.teal[4]][k]);
  return p;
}
function coin(ramp, mark) {
  const p = P();
  p.ball(8, 8, 6, 6, ramp, { spec: W });
  p.ellipse(8, 8, 4, 4, ramp[2]); p.ellipse(8, 8, 3, 3, ramp[3]);
  if (mark) mark(p);
  return p;
}
function key(gemR, metal = R.gold) {
  const p = P();
  p.ellipse(4.5, 5, 3.5, 3.5, metal[3]); p.cut(4.5, 5, 1.7, 1.7);
  p.set(3, 3, metal[4]);
  p.line(7, 7, 13, 13, metal[2], 2); p.line(7, 6, 13, 12, metal[3]);
  p.rect(10, 13, 2, 2, metal[2]); p.rect(12, 11, 2, 2, metal[1]);
  p.ball(4.5, 5, 1.3, 1.3, gemR);
  return p;
}
function core(ramp, frame = R.gold) {
  const p = P();
  p.poly([[8, 1], [15, 8], [8, 15], [1, 8]], frame[2]);
  p.poly([[8, 1], [1, 8], [8, 15]], frame[3]);
  p.ball(8, 8, 4.4, 4.4, ramp, { spec: W });
  return p;
}
function seedPouch(ramp, seedC) {
  const p = P();
  solid(p, (q) => { q.ellipse(8, 10, 5, 4.5, 'x'); q.rect(6, 3, 4, 4, 'x'); }, R.sand);
  p.rect(5, 5, 6, 1, R.brown[1]);
  p.ellipse(8, 10.5, 2.6, 2.4, ramp[3]); p.set(8, 10, ramp[4]); p.set(9, 11, ramp[1]);
  for (const [x, y] of [[12, 14], [14, 13], [2, 14]]) { p.set(x, y, seedC[2]); p.set(x, y - 1, seedC[4]); }
  return p;
}

// ------------------------------------------------------------------ fish

function fish(o) {
  const p = P();
  const { len = 11, h = 5, body, belly = body, fin = body, tail = 'fork', pat = null, patC = null, shape = 'normal' } = o;
  const cx = 9, cy = 8;
  if (shape === 'eel') {
    for (let x = 1; x < 15; x++) {
      const y = cy + Math.round(Math.sin(x * 0.7) * 2);
      p.rect(x, y - 1, 1, 3, (xx, yy, i, j) => (j === 0 ? body[3] : j === 1 ? body[2] : belly[1]));
    }
    p.set(14, cy + Math.round(Math.sin(14 * 0.7) * 2) - 1, W); p.set(14, cy + Math.round(Math.sin(14 * 0.7) * 2) - 1, INK);
    p.rect(1, cy + Math.round(Math.sin(0.7) * 2) - 2, 2, 1, fin[3]);
    return p;
  }
  if (shape === 'ray') {
    p.poly([[8, 2], [15, 8], [8, 12], [1, 8]], body[2]);
    p.poly([[8, 2], [8, 12], [1, 8]], body[3]);
    p.line(8, 12, 8, 15, body[1]);
    p.set(6, 6, INK); p.set(10, 6, INK);
    if (pat) p.speckle([patC[4]], 0.15, len);
    return p;
  }
  const H = shape === 'tall' ? h + 3 : h;
  p.ellipse(cx, cy, len / 2, H / 2, (x, y, nx, ny) => (ny > 0.25 ? belly[3] : band(body, 0.62 - nx * 0.25 - ny * 0.4)));
  // tail
  const tx = cx - len / 2;
  if (tail === 'fork') p.poly([[tx + 1, cy], [tx - 3, cy - 3], [tx - 2, cy], [tx - 3, cy + 3]], fin[2]);
  else if (tail === 'fan') p.poly([[tx + 1, cy], [tx - 3, cy - 4], [tx - 3, cy + 4]], fin[3]);
  else p.ellipse(tx - 1, cy, 2, 2.5, fin[2]);
  // fins
  p.poly([[cx - 2, cy - H / 2 + 0.5], [cx + 1, cy - H / 2 - 2], [cx + 2, cy - H / 2 + 0.5]], fin[3]);
  p.set(cx, cy + Math.ceil(H / 2), fin[1]);
  if (pat === 'stripe') for (let x = cx - 3; x <= cx + 2; x += 2) for (let y = cy - 2; y <= cy + 1; y++) if (p.filled(x, y)) p.set(x, y, patC[1]);
  if (pat === 'spots') p.speckle([patC[4]], 0.12, len * 7 + h, (c, x, y) => y <= cy && x < cx + 3);
  if (pat === 'glow') { p.set(cx - 1, cy, patC[4]); p.set(cx + 2, cy - 1, patC[4]); p.set(cx - 3, cy - 1, patC[4]); }
  if (shape === 'pike') { p.poly([[cx + len / 2 - 1, cy - 1], [15, cy], [cx + len / 2 - 1, cy + 1]], body[2]); }
  if (shape === 'maw') { p.hline(cx + 2, cx + len / 2, cy + 1, INK); p.set(cx + 3, cy + 1, W); p.set(cx + 4, cy + 1, W); }
  const ex = Math.min(14, Math.round(cx + len / 2 - 2));
  p.set(ex, cy - 1, W); p.set(ex, cy - 1, shape === 'maw' ? R.ember[4] : INK);
  p.set(ex - 1, cy - 1 - (H > 6 ? 1 : 0), body[4]);
  return p;
}

const FISH = {
  pebble_minnow: { len: 8, h: 4, body: R.stone, tail: 'fork' },
  reed_perch: { len: 10, h: 6, body: R.grass, belly: R.sand, pat: 'stripe', patC: R.grass },
  marrow_carp: { len: 12, h: 7, body: R.gold, belly: R.sand, fin: R.ember, tail: 'fan' },
  dawn_darter: { len: 11, h: 4, body: R.flesh, belly: R.sand, fin: R.ember, pat: 'spots', patC: R.gold },
  old_whiskers: { len: 13, h: 7, body: R.brown, belly: R.sand, tail: 'round', shape: 'maw' },
  mud_skipper: { len: 10, h: 5, body: R.brown, belly: R.sand, pat: 'spots', patC: R.sand, tail: 'round' },
  salt_sprat: { len: 8, h: 4, body: R.ice, belly: R.ice, fin: R.stone },
  fen_eel: { body: R.teal, belly: R.sand, fin: R.teal, shape: 'eel' },
  pearl_gar: { len: 13, h: 4, body: R.teal, belly: R.ice, shape: 'pike', pat: 'spots', patC: R.ice },
  bog_sovereign: { len: 13, h: 8, body: R.teal, belly: R.sand, fin: R.gold, tail: 'fan', pat: 'glow', patC: R.gold },
  ash_guppy: { len: 8, h: 5, body: R.ink, belly: R.stone, fin: R.ember, tail: 'fan' },
  cinder_bass: { len: 12, h: 7, body: R.ember, belly: R.flesh, fin: R.ink, pat: 'stripe', patC: R.ink },
  lava_loach: { body: R.ember, belly: R.gold, fin: R.gold, shape: 'eel' },
  obsidian_pike: { len: 13, h: 4, body: R.ink, belly: R.violet, shape: 'pike', fin: R.ember },
  kiln_koi: { len: 12, h: 6, body: R.ember, belly: R.gold, fin: R.gold, tail: 'fan', pat: 'spots', patC: R.gold },
  sand_dab: { body: R.sand, pat: 'spots', patC: R.sand, shape: 'ray', len: 3 },
  glassfin: { len: 11, h: 6, body: R.ice, belly: R.ice, fin: R.violet, tail: 'fan', pat: 'glow', patC: R.ice },
  prism_ray: { body: R.violet, pat: 'spots', patC: R.ice, shape: 'ray', len: 5 },
  mirage_angel: { len: 9, h: 6, body: R.sand, belly: R.gold, fin: R.violet, shape: 'tall', pat: 'stripe', patC: R.violet },
  sun_sturgeon: { len: 14, h: 6, body: R.gold, belly: R.sand, fin: R.ember, shape: 'pike' },
  ice_smelt: { len: 8, h: 4, body: R.ice, fin: R.sea },
  frost_char: { len: 11, h: 5, body: R.sea, belly: R.ember, pat: 'spots', patC: R.ice },
  rime_cod: { len: 12, h: 7, body: R.stone, belly: R.ice, tail: 'round', pat: 'spots', patC: R.ice },
  aurora_trout: { len: 12, h: 6, body: R.teal, belly: R.violet, fin: R.grass, pat: 'glow', patC: R.teal },
  glacier_maw: { len: 14, h: 8, body: R.ice, belly: R.ice, fin: R.sea, shape: 'maw', tail: 'fan' },
  ink_fry: { len: 7, h: 4, body: R.ink, fin: R.violet, pat: 'glow', patC: R.violet },
  gloom_tetra: { len: 9, h: 6, body: R.violet, belly: R.ink, fin: R.teal, shape: 'tall', pat: 'glow', patC: R.teal },
  null_lamprey: { body: R.ink, belly: R.violet, fin: R.violet, shape: 'eel' },
  echo_ray: { body: R.ink, pat: 'spots', patC: R.violet, shape: 'ray', len: 7 },
  moon_leviathan: { len: 14, h: 9, body: R.sea, belly: R.ice, fin: R.violet, shape: 'maw', tail: 'fan', pat: 'glow', patC: R.ice },
};

// ------------------------------------------------------------------ trinkets, trophies, relics

function ring(band2, gemR) {
  const p = P();
  p.ellipse(8, 10, 5, 4.5, band2[3]); p.cut(8, 10.5, 3, 2.6);
  p.hline(5, 11, 14, band2[1]);
  p.ball(8, 5, 3, 2.6, gemR, { spec: W });
  return p;
}
function amulet(chain, body) {
  const p = P();
  p.path([[3, 1], [5, 5], [8, 7], [11, 5], [13, 1]], chain[3]);
  body(p);
  return p;
}
function feather(ramp) {
  const p = P();
  p.poly([[13, 1], [15, 3], [7, 12], [4, 11]], ramp[3]);
  p.poly([[13, 1], [4, 11], [5, 8]], ramp[4]);
  p.line(14, 2, 2, 14, R.stone[2]);
  for (let k = 0; k < 4; k++) p.set(10 - k * 2, 6 + k * 2, ramp[2]);
  return p;
}
function bell(ramp, clap) {
  const p = P();
  p.poly([[5, 4], [11, 4], [13, 12], [3, 12]], ramp[2]);
  p.ellipse(8, 4.5, 3, 2.5, ramp[3]);
  p.rect(2, 12, 12, 2, ramp[1]); p.hline(3, 12, 12, ramp[3]);
  p.line(5, 5, 4, 11, ramp[4]); p.ball(8, 14.5, 1.4, 1.2, clap);
  p.rect(7, 1, 2, 2, ramp[1]);
  return p;
}
function vial(liquid, glow) {
  const p = P();
  p.rect(6, 4, 5, 10, R.ice[3]); p.rect(7, 7, 3, 7, liquid[3]); p.vline(7, 7, 13, liquid[4]);
  p.vline(6, 4, 13, R.ice[4]); p.rect(6, 2, 5, 2, R.brown[2]);
  if (glow) glow(p);
  return p;
}
function crown(ramp, gems) {
  const p = P();
  p.poly([[2, 13], [2, 6], [5, 9], [8, 3], [11, 9], [14, 6], [14, 13]], ramp[2]);
  p.poly([[2, 13], [2, 6], [5, 9], [8, 3], [8, 13]], ramp[3]);
  p.rect(2, 11, 13, 3, ramp[1]); p.hline(2, 14, 11, ramp[4]);
  p.set(8, 5, gems[4]); p.set(4, 12, gems[3]); p.set(8, 12, gems[3]); p.set(12, 12, gems[3]);
  return p;
}
function antler(ramp) {
  const p = P();
  p.path([[3, 15], [5, 10], [8, 6], [12, 2]], ramp[3], 2);
  p.path([[5, 10], [2, 6]], ramp[3], 2); p.path([[8, 6], [7, 2]], ramp[3], 2); p.path([[10, 4], [14, 5]], ramp[2], 2);
  p.path([[3, 15], [5, 10], [8, 6], [12, 2]], ramp[4]);
  return p;
}
function heart(ramp, glowC) {
  const p = P();
  p.ball(5.5, 6, 3.5, 3.5, ramp); p.ball(10.5, 6, 3.5, 3.5, ramp);
  p.poly([[2, 7], [14, 7], [8, 14]], ramp[2]);
  p.poly([[8, 7], [14, 7], [8, 14]], ramp[1]);
  if (glowC) { p.line(6, 6, 8, 9, glowC); p.line(8, 9, 10, 6, glowC); }
  p.set(4, 4, W);
  return p;
}
function mask(ramp, eye) {
  const p = P();
  solid(p, (q) => q.ellipse(8, 8, 6, 7, 'x'), ramp);
  p.rect(4, 6, 3, 2, eye); p.rect(9, 6, 3, 2, eye);
  p.ellipse(8, 11.5, 1.5, 2, INK);
  return p;
}
function idol(ramp) {
  const p = P();
  solid(p, (q) => { q.ellipse(8, 4.5, 3, 3, 'x'); q.poly([[5, 7], [11, 7], [12, 14], [4, 14]], 'x'); }, ramp);
  p.set(7, 4, INK); p.set(9, 4, INK); p.hline(4, 12, 14, ramp[0]);
  return p;
}
function tablet(ramp, rune) {
  const p = P();
  solid(p, (q) => q.poly([[3, 3], [12, 2], [13, 14], [4, 14]], 'x'), ramp);
  p.line(5, 5, 10, 5, rune); p.line(6, 8, 9, 10, rune); p.line(9, 8, 6, 10, rune); p.line(5, 12, 11, 12, rune);
  p.erase(12, 2); p.erase(13, 13);
  return p;
}
function urn(ramp, bandC) {
  const p = P();
  solid(p, (q) => { q.ellipse(8, 9.5, 5, 5, 'x'); q.rect(6, 2, 4, 4, 'x'); q.rect(5, 1, 6, 2, 'x'); }, ramp);
  p.hline(4, 12, 9, bandC); p.hline(4, 12, 11, bandC);
  return p;
}
function scroll(paper, seal) {
  const p = P();
  p.rect(3, 4, 10, 8, paper[3]); p.rect(2, 3, 2, 10, paper[2]); p.rect(12, 3, 2, 10, paper[2]);
  p.vline(2, 3, 12, paper[4]); p.hline(5, 10, 6, paper[1]); p.hline(5, 9, 8, paper[1]);
  p.ball(10, 11, 1.8, 1.8, seal);
  return p;
}
function compass(ramp, needle) {
  const p = coin(ramp, (q) => { q.ellipse(8, 8, 3.6, 3.6, R.sand[4]); q.line(8, 5, 8, 8, needle); q.line(8, 8, 8, 11, R.ink[2]); q.set(8, 8, R.ink[0]); });
  p.rect(7, 0, 2, 2, ramp[2]);
  return p;
}
function horn(ramp) {
  const p = P();
  p.path([[2, 12], [6, 13], [10, 11], [13, 6], [14, 2]], ramp[2], 3);
  p.path([[2, 11], [6, 12], [10, 10], [13, 5]], ramp[4]);
  p.ellipse(2.5, 12.5, 1.5, 2.5, ramp[1]);
  return p;
}
function figurine(ramp) {
  const p = P();
  solid(p, (q) => { q.ellipse(8, 3.5, 2.5, 2.5, 'x'); q.rect(6, 6, 4, 5, 'x'); q.rect(4, 7, 8, 2, 'x'); q.rect(6, 11, 2, 3, 'x'); q.rect(9, 11, 2, 3, 'x'); }, ramp);
  p.rect(4, 14, 9, 1, ramp[0]);
  return p;
}
function dial(ramp, mark) {
  const p = P();
  p.ellipse(8, 9, 6.5, 4, ramp[2]); p.ellipse(8, 8, 6.5, 4, ramp[3]);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 3, ramp[1]); }
  p.poly([[8, 2], [10, 8], [8, 8]], mark);
  return p;
}
function whistle(ramp) {
  const p = P();
  p.rect(2, 6, 9, 4, (x, y, i, j) => (j === 0 ? ramp[4] : j === 3 ? ramp[1] : ramp[2]));
  p.ball(11.5, 9, 3.5, 3.5, ramp);
  p.rect(4, 6, 2, 2, INK); p.rect(1, 7, 1, 2, ramp[1]);
  p.ellipse(11.5, 9, 1.2, 1.2, R.ember[3]);
  return p;
}
function purse(ramp, coinR) {
  const p = P();
  solid(p, (q) => { q.ellipse(8, 10.5, 5.5, 4.5, 'x'); q.poly([[6, 6], [10, 6], [12, 3], [4, 3]], 'x'); }, ramp);
  p.hline(5, 11, 6, R.gold[3]);
  p.ball(12, 13, 2, 2, coinR); p.ball(3.5, 13.5, 1.6, 1.6, coinR);
  return p;
}
function valve(ramp) {
  const p = P();
  p.rect(1, 9, 14, 4, (x, y, i, j) => (j === 0 ? R.stone[3] : j === 3 ? R.stone[1] : R.stone[2]));
  p.rect(7, 5, 2, 4, R.stone[2]);
  p.ellipse(8, 4, 5.5, 2.5, ramp[3]); p.cut(8, 4, 3.5, 1.3);
  p.line(3, 4, 13, 4, ramp[2]); p.line(8, 2, 8, 6, ramp[2]); p.set(8, 4, ramp[4]);
  return p;
}
function cork(ramp) {
  const p = P();
  solid(p, (q) => q.poly([[4, 4], [12, 4], [11, 13], [5, 13]], 'x'), ramp);
  p.ellipse(8, 4, 4, 1.6, ramp[4]); p.speckle([ramp[1], ramp[0]], 0.18, 9);
  p.set(7, 9, R.grass[4]); p.set(8, 8, R.grass[3]); p.set(9, 9, R.grass[4]); p.set(8, 10, R.grass[3]);
  return p;
}
function anklet(ramp, wing) {
  const p = P();
  p.ellipse(8, 10, 6, 3, ramp[3]); p.cut(8, 10, 4, 1.6);
  p.hline(3, 13, 12, ramp[1]);
  p.poly([[12, 8], [15, 3], [15, 7]], wing[4]); p.poly([[11, 8], [13, 3], [14, 7]], wing[3]);
  return p;
}
function quill(ramp) {
  const p = feather(ramp);
  p.rect(1, 13, 3, 3, R.ink[2]); p.set(2, 13, R.violet[3]);
  return p;
}
function shield(ramp, emb) {
  const p = P();
  solid(p, (q) => q.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], 'x'), ramp);
  p.line(8, 4, 8, 11, emb); p.line(5, 7, 11, 7, emb);
  return p;
}
function bomb() {
  const p = P();
  p.ball(7, 10, 5, 5, R.ink, { spec: R.stone[4] });
  p.rect(9, 4, 3, 2, R.stone[2]);
  p.path([[11, 4], [12, 2], [14, 2]], R.brown[3]);
  p.set(15, 1, R.gold[4]); p.set(14, 0, R.ember[4]); p.set(15, 2, R.ember[3]);
  return p;
}
function bandage() {
  const p = P();
  p.ellipse(7, 9, 5, 5, R.flesh[4]); p.ellipse(7, 9, 2, 2, R.flesh[2]); p.ellipse(7, 9, 1, 1, R.flesh[1]);
  p.ellipse(7, 9, 5, 5, (x, y, nx, ny) => (nx > 0.4 && ny > 0 ? R.flesh[3] : null));
  p.rect(10, 11, 5, 3, R.flesh[4]); p.hline(10, 14, 13, R.flesh[2]);
  p.rect(6, 5, 2, 1, R.ember[3]); p.rect(6, 4, 2, 3, R.ember[3]); p.rect(5, 5, 4, 1, R.ember[3]);
  return p;
}
function skewer(ramp) {
  const p = P();
  p.line(1, 15, 14, 2, R.brown[3]);
  for (const [x, y] of [[4, 11], [7, 8], [10, 5]]) { p.ball(x, y, 2.4, 2.4, ramp); p.set(x - 1, y - 1, R.gold[4]); p.set(x + 1, y + 1, R.ink[1]); }
  return p;
}
function plateFish() {
  const p = P();
  p.ellipse(8, 11, 7, 3.5, R.stone[4]); p.ellipse(8, 11, 5.5, 2.4, R.stone[3]);
  const f = fish({ len: 10, h: 4, body: R.ember, belly: R.flesh, fin: R.brown });
  p.blit(f, 0, 2);
  for (let x = 5; x < 12; x += 2) p.set(x, 9, R.brown[0]);
  return p;
}
function loaf(ramp) {
  const p = P();
  solid(p, (q) => q.ellipse(8, 10, 6.5, 4.5, 'x'), ramp);
  for (let k = 0; k < 3; k++) p.line(5 + k * 3, 7, 6 + k * 3, 9, ramp[4]);
  p.hline(3, 13, 13, ramp[1]);
  return p;
}
function sorbet() {
  const p = P();
  p.poly([[4, 9], [12, 9], [10, 15], [6, 15]], R.ice[2]); p.vline(5, 9, 12, R.ice[4]);
  p.ball(6, 7, 2.6, 2.6, R.ice, { spec: W }); p.ball(10, 7, 2.6, 2.6, R.violet, {}); p.ball(8, 4, 2.6, 2.6, R.flesh, { spec: W });
  p.set(9, 1, R.ember[3]);
  return p;
}
function feast() {
  const p = P();
  p.ellipse(8, 11, 7.5, 4, R.gold[2]); p.ellipse(8, 10.5, 6, 2.8, R.gold[4]);
  p.ball(6, 8, 3.5, 3, R.brown, { spec: R.flesh[4] }); p.line(3, 6, 2, 4, R.flesh[4]);
  p.ball(11, 8, 2, 2, R.ember); p.ball(12, 10, 1.5, 1.5, R.grass); p.ball(9, 6, 1.5, 1.5, R.gold);
  return p;
}
function grabberItem() {
  const p = P();
  p.rect(5, 11, 6, 4, R.stone[2]); p.hline(5, 10, 11, R.stone[4]);
  p.line(8, 11, 8, 6, R.gold[3], 2); p.line(8, 6, 12, 3, R.gold[3], 2);
  p.path([[12, 3], [14, 2], [15, 4]], R.stone[3]); p.path([[12, 3], [12, 1], [14, 0]], R.stone[3]);
  p.ball(8, 6, 1.5, 1.5, R.stone);
  return p;
}
function benchItem() {
  const p = P();
  p.rect(2, 7, 12, 3, R.brown[3]); p.hline(2, 13, 7, R.brown[4]);
  p.rect(3, 10, 2, 5, R.brown[1]); p.rect(11, 10, 2, 5, R.brown[1]);
  p.rect(6, 3, 4, 4, R.stone[2]); p.ball(8, 5, 1.6, 1.6, R.gold); p.line(10, 4, 13, 2, R.stone[3]);
  return p;
}
function sapling() {
  const p = P();
  p.poly([[4, 10], [12, 10], [11, 15], [5, 15]], R.ember[2]); p.hline(4, 12, 10, R.ember[3]);
  p.line(8, 10, 8, 4, R.brown[2]);
  p.ball(6, 4, 2.4, 2, R.grass); p.ball(10, 3, 2.4, 2, R.grass); p.ball(8, 2, 2, 1.6, R.teal);
  p.set(8, 1, R.gold[4]);
  return p;
}

// ------------------------------------------------------------------ table

const BIO = [null, R.grass, R.teal, R.ember, R.sand, R.ice, R.violet];
const BIOSTONE = [null, R.stone, R.flesh, R.ink, R.sand, R.ice, R.violet];

const B = {
  // wood
  driftwood: () => logs(R.stone, R.sand),
  stiltwood: () => logs(R.teal, R.sand, R.teal[0]),
  ashwood: () => logs(R.ink, R.ember, R.ember[3]),
  spinewood: () => { const p = logs(R.sand, R.gold); for (const [x, y] of [[5, 3], [9, 3], [7, 8], [11, 8]]) p.set(x, y, R.sand[4]); return p; },
  palewood: () => logs(R.ice, R.sand),
  gloomwood: () => logs(R.violet, R.teal, R.teal[4]),
  // stone
  fieldstone: () => chunk(R.stone, 11),
  clay: () => blob(R.flesh, 5),
  obsidian: () => { const p = chunk(R.ink, 23); p.line(5, 6, 8, 5, R.violet[3]); p.set(6, 7, W); return p; },
  sunsand: () => pile(R.sand, [R.gold[4], R.sand[4]], 3),
  everice: () => cube(R.ice),
  nullsilt: () => pile(R.violet, [R.ink[1], R.violet[4]], 9),
  // ore
  copper_ore: () => ore(R.stone, R.ember, 31),
  bog_iron_ore: () => ore(R.brown, R.stone, 37),
  cinderite_ore: () => ore(R.ink, R.ember, 41),
  prismite_ore: () => ore(R.sand, R.violet, 43),
  rime_ore: () => ore(R.stone, R.ice, 47),
  umbrite_ore: () => ore(R.ink, R.teal, 53),
  // fiber
  reedfiber: () => bundle(R.sand, R.brown, { tips: R.gold[4] }),
  kelp: () => bundle(R.teal, R.brown, { wavy: true }),
  ashgrass: () => bundle(R.stone, R.ember, { tips: R.ember[4] }),
  needlesilk: () => bundle(R.flesh, R.violet, { tips: W }),
  frostmoss: () => { const p = blob(R.ice, 7, { cy: 10, rx: 6, ry: 4 }); p.speckle([R.teal[3], W], 0.2, 7); return p; },
  inkweed: () => bundle(R.violet, R.ink, { wavy: true, tips: R.teal[4] }),
  // rare
  shell: () => shellSpiral(R.flesh, R.flesh[2]),
  pearl: () => orb(R.ice, { r: 4.5 }),
  magma_core: () => { const p = orb(R.ember, { r: 5.5 }); p.line(5, 6, 9, 10, R.gold[4]); p.line(9, 10, 12, 8, R.gold[4]); p.line(7, 12, 9, 10, R.gold[3]); return p; },
  amber: () => { const p = drop(R.gold); p.set(9, 11, R.brown[1]); p.set(10, 11, R.brown[1]); return p; },
  aurora_shard: () => { const p = gem(R.teal, { w: 4, h: 7 }); p.line(7, 4, 9, 8, R.violet[4]); return p; },
  echoglass: () => crystal(R.violet, 61),
  // mob drops
  chitin: () => { const p = P(); solid(p, (q) => q.poly([[2, 10], [5, 3], [11, 3], [14, 10], [8, 14]], 'x'), R.grass); p.line(5, 6, 11, 6, R.grass[1]); p.line(4, 9, 12, 9, R.grass[1]); return p; },
  fen_slime: () => blob(R.teal, 13),
  ember_scale: () => { const p = P(); solid(p, (q) => q.poly([[8, 2], [14, 7], [8, 14], [2, 7]], 'x'), R.ember); p.line(8, 4, 8, 12, R.gold[4]); p.line(5, 7, 8, 11, R.ember[1]); return p; },
  mirage_dust: () => { const p = pile(R.violet, [R.gold[4], W, R.ice[4]], 17); return p; },
  frost_pelt: () => { const p = hide(R.ice); p.speckle([W, R.ice[2]], 0.15, 19); return p; },
  gloom_heart: () => heart(R.violet, R.teal[4]),
  // other
  brimstone: () => crystal(R.gold, 71),
  sand: () => pile(R.sand, [R.sand[1], R.sand[4]], 21),
  peat: () => { const p = P(); solid(p, (q) => q.rect(3, 5, 10, 8, 'x'), R.brown, { base: 1 }); p.speckle([R.grass[1], R.brown[0]], 0.15, 3); p.poly([[3, 5], [5, 3], [15, 3], [13, 5]], R.brown[2]); p.poly([[13, 5], [15, 3], [15, 11], [13, 12]], R.brown[0]); return p; },
  salt: () => { const p = pile(R.ice, [W, R.ice[4]], 23); p.set(8, 6, W); return p; },
  resin: () => drop(R.gold),
  honeycomb: () => { const p = P(); solid(p, (q) => q.poly([[3, 4], [13, 4], [14, 12], [2, 12]], 'x'), R.gold); for (let y = 5; y < 12; y += 3) for (let x = 4 + (y % 2) * 2; x < 13; x += 4) { p.rect(x, y, 2, 2, R.gold[1]); p.set(x, y, R.brown[1]); } return p; },
  glintstone: () => gem(R.gold),
  relic_fragment: () => { const p = chunk(R.stone, 77, { cracks: false }); p.line(6, 8, 10, 8, R.teal[4]); p.line(8, 6, 8, 11, R.teal[4]); return p; },
  marrowberry: () => berries(R.ember, R.grass),
  // processed
  plank: () => planks(R.brown),
  brick: () => bricks(R.ember),
  charcoal: () => { const p = P(); for (const [x, y, r] of [[5, 10, 3.6], [11, 11, 3.2], [8, 6, 3.4]]) p.ball(x, y, r, r * 0.8, R.ink, { spec: R.stone[3] }); p.set(10, 12, R.ember[3]); return p; },
  rope: () => coil(R.sand),
  cloth: () => cloth(R.ice),
  leather: () => hide(R.brown),
  glass: () => pane(R.ice),
  copper_bar: () => ingot(R.ember, R.flesh),
  iron_bar: () => ingot(R.stone),
  cindersteel_bar: () => { const p = ingot(R.ink, R.ember); p.line(4, 11, 7, 11, R.ember[3]); return p; },
  prism_alloy: () => { const p = ingot(R.violet, R.ice); p.set(10, 10, R.gold[4]); return p; },
  rimesteel_bar: () => ingot(R.ice),
  umbral_alloy: () => { const p = ingot(R.violet); p.line(4, 11, 7, 11, R.teal[4]); return p; },
  ballast_1: () => ballast(R.stone, R.brown, 1),
  ballast_2: () => ballast(R.flesh, R.stone, 2),
  ballast_3: () => ballast(R.ink, R.ember, 3),
  ballast_4: () => ballast(R.sand, R.violet, 4),
  ballast_5: () => ballast(R.ice, R.sea, 5),
  // produce
  tidewheat: () => sheaf(R.gold, R.brown),
  mudroot: () => root(R.brown, R.teal),
  saltbloom: () => flower(R.ice, R.sand, R.teal),
  scorchpepper: () => pepper(R.ember, R.grass),
  cindercap: () => mushroom(R.ember, R.sand, R.gold[4]),
  sunmelon: () => melon(R.gold, R.grass[2]),
  glassgourd: () => gourd(R.ice),
  snowberry: () => berries(R.ice, R.sea),
  pinecone_pale: () => pinecone(R.sand),
  inkcap: () => mushroom(R.ink, R.stone, R.violet[4]),
  moonpetal: () => petal(R.violet, R.ice[4]),
  // components
  gear_part: () => cog(R.stone),
  nail: () => nails(R.stone),
  iron_plate: () => plate(R.stone, R.stone),
  sluice_board: () => { const p = planks(R.brown); p.rect(3, 7, 11, 2, R.sea[3]); p.hline(3, 13, 7, R.sea[4]); return p; },
  flux_coil: () => { const p = canister(R.stone, R.sea, R.stone); for (let y = 4; y < 13; y += 2) p.hline(4, 11, y, R.ember[3]); p.line(7, 6, 9, 9, R.sea[4]); p.line(9, 9, 7, 11, R.sea[4]); return p; },
  lens: () => { const p = P(); p.ellipse(8, 8, 6, 6, R.gold[2]); p.ball(8, 8, 4.6, 4.6, R.ice, { spec: W }); p.rect(13, 12, 2, 3, R.gold[1]); return p; },
  prism_circuit: () => { const p = P(); p.rect(3, 3, 10, 10, R.grass[1]); p.box(3, 3, 10, 10, R.grass[2]); for (let k = 4; k < 13; k += 2) { p.set(k, 2, R.gold[3]); p.set(k, 13, R.gold[3]); p.set(2, k, R.gold[3]); p.set(13, k, R.gold[3]); } p.poly([[8, 5], [11, 10], [5, 10]], R.violet[3]); p.line(8, 5, 6, 9, W); p.hline(4, 6, 11, R.gold[4]); return p; },
  cryo_cell: () => canister(R.stone, R.ice, R.sea),
  hollow_core: () => { const p = orb(R.violet, { r: 4.5 }); p.box(2, 2, 12, 12, R.gold[2]); p.line(2, 2, 13, 13, R.gold[1]); p.ball(8, 8, 2, 2, R.teal, { spec: W }); return p; },
  // misc
  bandage, bomb,
  tide_token: () => coin(R.sea, (q) => { q.path([[5, 9], [7, 7], [9, 9], [11, 7]], R.ice[4]); }),
  // placeables
  grabber: grabberItem, autobench_1: benchItem, worldseed_sapling: sapling,
  // food
  roast_berries: () => skewer(R.ember),
  grilled_fish: plateFish,
  reed_bread: () => loaf(R.gold),
  fen_stew: () => bowl(R.teal, R.brown, R.ember[3]),
  ember_curry: () => bowl(R.ember, R.stone, R.gold[4]),
  glass_noodles: () => { const p = bowl(R.ice, R.violet); p.path([[6, 9], [6, 5], [8, 3]], R.sand[4]); p.path([[9, 9], [9, 5], [11, 3]], R.sand[4]); return p; },
  frost_sorbet: sorbet,
  ink_broth: () => bowl(R.violet, R.ink, R.teal[4]),
  tidewright_feast: feast,
  // tonics
  tonic_haste: () => potion(R.grass),
  tonic_stone: () => potion(R.stone),
  tonic_fortune: () => potion(R.gold),
  tonic_surge: () => potion(R.sea),
  // trinkets
  thorn_locket: () => amulet(R.gold, (p) => { p.blit(heart(R.gold, R.grass[3]).scale(0.7, 0.7, 8, 16), 0, 0); p.line(4, 9, 12, 13, R.grass[2]); p.set(5, 10, R.grass[4]); p.set(11, 12, R.grass[4]); }),
  regent_signet: () => ring(R.gold, R.teal),
  kiln_ember: () => { const p = orb(R.ember, { r: 4.5, cy: 9 }); p.box(3, 4, 11, 11, R.stone[1]); p.vline(8, 4, 14, R.stone[2]); p.set(7, 6, R.gold[4]); return p; },
  prism_eye: () => { const p = P(); p.ellipse(8, 8, 7, 4.5, R.ice[4]); p.ball(8, 8, 3.5, 3.5, R.violet, { spec: W }); p.ellipse(8, 8, 1.2, 2, INK); p.set(1, 8, R.gold[3]); p.set(14, 8, R.gold[3]); return p; },
  antler_tine: () => antler(R.sand),
  choir_bell: () => bell(R.violet, R.gold),
  spore_pouch: () => { const p = purse(R.grass, R.gold); p.speckle([R.gold[4]], 0.08, 4); p.set(4, 2, R.gold[4]); p.set(12, 1, R.gold[3]); return p; },
  barnacle_charm: () => amulet(R.brown, (p) => { p.blit(shellSpiral(R.stone, R.stone[1]).scale(0.75, 0.75, 8, 15), 0, 0); }),
  bellows_valve: () => valve(R.gold),
  twin_lens: () => { const p = P(); p.ellipse(4.5, 9, 3.5, 3.5, R.gold[2]); p.ellipse(11.5, 9, 3.5, 3.5, R.gold[2]); p.ball(4.5, 9, 2.4, 2.4, R.ice, { spec: W }); p.ball(11.5, 9, 2.4, 2.4, R.ice, { spec: W }); p.hline(7, 9, 7, R.gold[3]); return p; },
  thawless_plate: () => shield(R.ice, R.sea[2]),
  scribe_quill: () => quill(R.violet),
  tide_compass: () => compass(R.gold, R.ember[3]),
  lucky_cork: () => cork(R.brown),
  gull_feather: () => feather(R.ice),
  salt_idol: () => idol(R.ice),
  miser_purse: () => purse(R.brown, R.gold),
  runner_anklet: () => anklet(R.gold, R.ice),
  ember_flask: () => potion(R.ember, R.stone),
  frost_bead: () => amulet(R.stone, (p) => { p.ball(8, 10, 3.8, 3.8, R.ice, { spec: W }); p.set(7, 8, R.sea[2]); }),
  deep_lantern: () => lantern(R.teal, R.stone),
  scuttler_whistle: () => whistle(R.gold),
  storm_vial: () => vial(R.sea, (p) => { p.line(9, 7, 7, 10, R.gold[4]); p.line(7, 10, 9, 12, R.gold[4]); }),
  moon_sliver: () => { const p = P(); p.ellipse(8, 8, 6, 6, R.ice[4]); p.cut(10.5, 6.5, 5, 5); p.map((c, x, y) => (x + y < 12 ? W : x + y > 18 ? R.violet[3] : null)); return p; },
  // trophies
  trophy_thornmother: () => { const p = crown(R.brown, R.grass); p.set(3, 5, R.grass[4]); p.set(13, 5, R.grass[4]); p.set(8, 2, R.ember[3]); return p; },
  trophy_regent: () => crown(R.gold, R.teal),
  trophy_kilnheart: () => heart(R.ember, R.gold[4]),
  trophy_prismarch: () => { const p = gem(R.violet, { w: 6, h: 7 }); p.line(4, 7, 12, 7, R.gold[4]); return p; },
  trophy_antler: () => antler(R.ice),
  trophy_choir: () => mask(R.violet, R.teal[4]),
  moon_shard_crown: () => crown(R.ice, R.violet),
  // misc lures etc. filled below
};
// hooks, weapons, armor, rods, packs, lanterns, lures, keys, cores, relics, seeds, fish
for (let t = 1; t <= 7; t++) { B['hook_' + t] = () => hook(t); B['blade_' + t] = () => blade(t); B['bow_' + t] = () => bow(t); B['staff_' + t] = () => staff(t); }
for (let t = 1; t <= 6; t++) { B['helm_' + t] = () => helm(t); B['coat_' + t] = () => coat(t); B['boots_' + t] = () => boots(t); }
for (let t = 1; t <= 4; t++) B['rod_' + t] = () => rod(t);
for (let t = 1; t <= 5; t++) B['pack_' + t] = () => pack(t);
B.lantern_1 = () => lantern(R.gold, R.ember);
B.lantern_2 = () => lantern(R.teal, R.stone);
for (let t = 1; t <= 6; t++) {
  B['lure_' + t] = () => lure(BIO[t], t);
  B['vault_key_' + t] = () => key(BIO[t]);
  B['vault_core_' + t] = () => core(BIO[t]);
}
const RELIC_SHAPES = [
  (r) => coin(r, (q) => { q.set(8, 8, INK); q.line(6, 6, 10, 10, r[1]); }),
  (r) => idol(r), (r) => tablet(r, R.teal[4]), (r) => mask(r, R.gold[4]), (r) => urn(r, R.gold[3]),
  (r) => amulet(R.gold, (p) => p.ball(8, 10, 3.6, 3.6, r, { spec: W })), (r) => figurine(r), (r) => scroll(R.sand, r),
  (r) => dial(r, R.gold[4]), (r) => horn(r), (r) => compass(r, R.teal[4]), (r) => key(r, R.stone),
];
for (let i = 1; i <= 12; i++) {
  const id = 'relic_' + String(i).padStart(2, '0');
  B[id] = (tier) => RELIC_SHAPES[i - 1](BIOSTONE[Math.max(1, Math.min(6, tier || 1))]);
}
const SEED_COLORS = {
  tidewheat: [R.gold, R.sand], marrowberry: [R.ember, R.brown], mudroot: [R.brown, R.brown], saltbloom: [R.ice, R.sand],
  scorchpepper: [R.ember, R.gold], cindercap: [R.ember, R.ink], sunmelon: [R.gold, R.grass], glassgourd: [R.ice, R.ice],
  snowberry: [R.ice, R.sea], pinecone_pale: [R.sand, R.brown], inkcap: [R.violet, R.ink], moonpetal: [R.violet, R.ice],
};
for (const [crop, [a, b]] of Object.entries(SEED_COLORS)) B['seed_' + crop] = () => seedPouch(a, b);
for (const [id, o] of Object.entries(FISH)) B[id] = () => fish(o);

// Category fallbacks so that any item id (including ones added later to items.js) still gets real art.
const CAT_FALLBACK = {
  material: (it) => chunk(BIO[it.tier || 1] || R.stone, seedOf(it.id)),
  component: () => cog(R.stone), tool: (it) => hook(Math.min(7, it.tier || 1)), weapon: (it) => blade(Math.min(7, it.tier || 1)),
  armor: (it) => helm(Math.min(6, it.tier || 1)), trinket: (it) => ring(R.gold, BIO[(seedOf(it.id) % 6) + 1]),
  rod: () => rod(1), pack: () => pack(1), lantern: () => lantern(R.gold, R.ember), food: () => bowl(R.ember),
  tonic: () => potion(R.violet), seed: () => seedPouch(R.grass, R.brown), fish: (it) => fish({ len: 10, h: 5, body: BIO[it.tier || 1] }),
  placeable: () => benchItem(), key: (it) => key(BIO[it.tier || 1]), trophy: () => crown(R.gold, R.ember),
  relic: (it) => idol(BIOSTONE[it.tier || 1]), misc: () => coin(R.gold),
};

export const ITEM_BUILDERS = B;

// Build the sprite map for a list of items ({ id, cat, tier }); exported for tests and for content added later.
export function buildItems(list) {
  const out = {};
  for (const it of list) {
    const fn = B[it.id];
    const p = fn ? fn(it.tier, it) : (CAT_FALLBACK[it.cat] || CAT_FALLBACK.material)(it);
    out['item.' + it.id] = { w: 16, h: 16, anchor: [8, 15], px: done(p) };
  }
  return out;
}

// The item table is imported statically (shared/data/items.js is plain data, loads in browser and Node).
import ITEMS from '../../../shared/data/items.js';
const sprites = buildItems(ITEMS);
export default sprites;
