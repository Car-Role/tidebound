// WP3 decor, helpers, summons, chests, projectiles and FX sprites.
// Ids follow the generic drawer pattern '<type>.<kind>' where an entity type has no art of its own:
//   helper.scuttler / helper.gull (anims), summon.<kind>, chest.<kind> (anims closed/open), proj.<kind> (facing east),
//   bobber.bobber; 'decor.*' are ground dressing, decals and the small FX sprites used by particle presets
//   (decor.crab, gull, leaf, feather, coin, gear, note, flake, fish_sil, bubble, banner, chain), scuttler hats.

import { Px, R, INK, done, band } from '../gen/paint.js';
import { flame, glow } from '../gen/build.js';

const W = '#';
const out = {};
// Decals lie flat on the ground: no ink outline.
const FLAT = /^decor\.(footprint|scorch|crack|puddle|wet|splat_|ink_puddle|ember_crack)/;
const one = (id, p, anchor) => { out[id] = { w: p.w, h: p.h, anchor: anchor ?? [p.w / 2, p.h], px: done(p, !FLAT.test(id)) }; };
const anim = (id, w, h, anims, fps = 6, extra = {}) => {
  out[id] = { w, h, fps, anchor: [w / 2, h], ...extra, anims: Object.fromEntries(Object.entries(anims).map(([k, list]) => [k, list.map((p) => done(p))])) };
};

// ------------------------------------------------------------------ critters

function crab(f, ramp = R.ember, hat = null) {
  const p = new Px(12, 10);
  const b = f % 2;
  for (let k = 0; k < 3; k++) { p.set(3 + k * 2 + (b ? 1 : 0), 9, ramp[1]); p.set(3 + k * 2 - (b ? 0 : 1) + 1, 8, ramp[1]); }
  p.ellipse(6, 6 - b * 0, 4, 2.6, (x, y, nx, ny) => band(ramp, 0.65 - nx * 0.2 - ny * 0.45));
  p.ellipse(1.5, 4 - (f === 2 ? 1 : 0), 1.5, 1.3, ramp[3]); p.ellipse(10.5, 4 - (f === 3 ? 1 : 0), 1.5, 1.3, ramp[3]);
  p.set(5, 3, W); p.set(7, 3, W); p.set(5, 2, ramp[1]); p.set(7, 2, ramp[1]);
  if (hat) hat(p);
  return p;
}
function gull(f) {
  const p = new Px(16, 12);
  const up = [0, -3, 0, 2][f % 4];
  p.poly([[8, 6], [1, 6 + up], [4, 8]], W); p.poly([[8, 6], [15, 6 + up], [12, 8]], R.ice[4]);
  p.set(1, 6 + up, R.stone[2]); p.set(15, 6 + up, R.stone[2]);
  p.ellipse(8, 7, 3, 1.8, W); p.ellipse(10.5, 6, 1.5, 1.3, W); p.set(11, 5, INK); p.set(12, 6, R.gold[3]); p.set(13, 6, R.gold[3]);
  p.rect(5, 8, 2, 1, R.stone[3]);
  return p;
}
function gullSit(f) {
  const p = new Px(16, 12);
  p.ellipse(8, 7, 4, 2.6, W); p.ellipse(6, 7, 3, 1.6, R.stone[3]); p.ellipse(11, 4 - (f % 2), 1.8, 1.6, W);
  p.set(12, 3 - (f % 2), INK); p.set(13, 4 - (f % 2), R.gold[3]); p.vline(7, 10, 11, R.gold[2]); p.vline(9, 10, 11, R.gold[2]);
  return p;
}
const crabAnims = (ramp, hat) => ({ idle: [crab(0, ramp, hat), crab(1, ramp, hat)], walk: [0, 1, 2, 3].map((f) => crab(f, ramp, hat)), carry: [crab(0, ramp, hat), crab(1, ramp, hat)] });
anim('decor.crab', 12, 10, crabAnims(R.ember), 8, { mirror: true });
anim('helper.scuttler', 12, 10, crabAnims(R.flesh), 8, { mirror: true });
anim('decor.gull', 16, 12, { fly: [0, 1, 2, 3].map(gull), idle: [gullSit(0), gullSit(1)] }, 8, { mirror: true });
anim('helper.gull', 16, 12, { fly: [0, 1, 2, 3].map(gull), idle: [gullSit(0), gullSit(1)] }, 8, { mirror: true });

// Scuttler hats (deed cosmetics with cosmeticKind 'scuttler_hat'): helper sprite with a tiny hat, by cosmetic id.
const SCUTTLER_HATS = {
  cos_d_machines: (p) => { p.rect(4, 0, 4, 2, R.gold[3]); }, cos_d_burrow: (p) => { p.rect(4, 0, 4, 2, R.brown[2]); p.hline(3, 8, 2, R.brown[1]); },
  cos_d_sluice: (p) => { p.rect(4, 0, 4, 2, R.sea[3]); }, cos_d_gulls: (p) => { p.line(4, 1, 2, 0, W); p.line(7, 1, 9, 0, W); },
  cos_d_auto: (p) => { p.rect(5, 0, 2, 2, R.stone[3]); p.set(6, 0, R.ember[4]); }, cos_d_flux: (p) => { p.set(5, 1, R.sea[4]); p.set(6, 0, R.sea[4]); p.set(7, 1, R.sea[4]); },
  cos_d_sold: (p) => { p.ellipse(6, 1, 2, 1.2, R.gold[4]); }, cos_d_glint: (p) => { p.set(6, 0, R.gold[4]); p.set(5, 1, R.gold[3]); p.set(7, 1, R.gold[3]); },
  cos_d_mint: (p) => { p.poly([[3, 2], [6, 0], [9, 2]], R.gold[3]); }, cos_d_tend: (p) => { p.rect(4, 0, 4, 2, R.grass[3]); p.set(6, 0, R.ember[3]); },
};
for (const [id, hat] of Object.entries(SCUTTLER_HATS)) anim('helper.scuttler.' + id, 12, 10, crabAnims(R.flesh, hat), 8, { mirror: true });

// ------------------------------------------------------------------ fx sprites

function leaf(ramp = R.grass) { const p = new Px(5, 4); p.poly([[0, 3], [2, 0], [5, 1], [3, 4]], ramp[3]); p.line(0, 3, 4, 1, ramp[1]); return p; }
one('decor.leaf', leaf(), [2, 2]);
one('decor.leaf_gold', leaf(R.gold), [2, 2]); one('decor.leaf_ash', leaf(R.stone), [2, 2]); one('decor.leaf_ink', leaf(R.violet), [2, 2]);
{ const p = new Px(6, 4); p.line(0, 3, 5, 0, R.stone[3]); p.line(1, 2, 4, 0, W); p.set(2, 3, W); one('decor.feather', p, [3, 2]); }
{ const p = new Px(5, 5); p.ball(2.5, 2.5, 2.5, 2.5, R.gold, { spec: W }); p.set(2, 2, R.gold[2]); one('decor.coin', p, [2, 2]); }
{ const p = new Px(7, 7); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.set(3.5 + Math.cos(a) * 3, 3.5 + Math.sin(a) * 3, R.gold[3]); } p.ellipse(3.5, 3.5, 2.4, 2.4, R.gold[3]); p.set(3, 3, R.gold[1]); one('decor.gear', p, [3, 3]); }
{ const p = new Px(5, 7); p.vline(3, 0, 5, R.violet[4]); p.ellipse(1.8, 5.5, 1.8, 1.4, R.violet[4]); p.set(4, 0, R.violet[4]); p.set(4, 1, R.violet[4]); one('decor.note', p, [2, 3]); }
{ const p = new Px(5, 5); p.hline(0, 4, 2, W); p.vline(2, 0, 4, W); p.set(1, 1, R.ice[4]); p.set(3, 3, R.ice[4]); p.set(3, 1, R.ice[4]); p.set(1, 3, R.ice[4]); one('decor.flake', p, [2, 2]); }
{ const p = new Px(9, 5); p.ellipse(5, 2.5, 3.5, 2, R.sea[1]); p.poly([[1, 2], [0, 0], [0, 4]], R.sea[1]); one('decor.fish_sil', p, [4, 3]); }
{ const p = new Px(5, 5); p.ellipse(2.5, 2.5, 2.4, 2.4, R.ice[3]); p.cut(2.5, 2.5, 1.4, 1.4); p.set(1, 1, W); one('decor.bubble', p, [2, 2]); }
{ const p = new Px(8, 10); p.vline(0, 0, 9, R.brown[2]); p.rect(1, 0, 7, 6, R.ember[3]); p.poly([[1, 6], [8, 6], [5, 8], [1, 8]], R.ember[2]); p.hline(1, 7, 0, R.ember[4]); p.set(4, 3, R.gold[4]); one('decor.banner', p, [0, 9]); }
{ const p = new Px(4, 6); p.ellipse(2, 1.5, 1.8, 1.5, R.stone[3]); p.cut(2, 1.5, 0.8, 0.6); p.ellipse(2, 4.5, 1.8, 1.5, R.stone[2]); p.cut(2, 4.5, 0.8, 0.6); one('decor.chain', p, [2, 3]); }
{ const p = new Px(7, 7); p.hline(0, 6, 3, R.gold[4]); p.vline(3, 0, 6, R.gold[4]); p.set(3, 3, W); p.set(2, 2, R.gold[3]); p.set(4, 4, R.gold[3]); one('decor.glint', p, [3, 3]); }
{ const p = new Px(7, 8); p.vline(1, 2, 7, R.stone[3]); p.rect(2, 0, 5, 3, R.stone[2]); p.set(5, 1, R.ember[4]); one('decor.wrench', p, [3, 4]); }

// ------------------------------------------------------------------ ground dressing

const FLOWERS = { greenmarrow: [R.gold, '#', R.violet], saltfen: [R.ice, R.sand, R.teal], emberreach: [R.ember, R.gold, R.ember], glasswaste: [R.violet, R.ice, R.gold], hoarfrost: [R.ice, R.sea, '#'], umbral: [R.teal, R.violet, R.teal] };
for (const [biome, cols] of Object.entries(FLOWERS)) {
  cols.forEach((c, i) => {
    const p = new Px(8, 8);
    p.line(4, 7, 4 - (i - 1), 3, R.grass[2]); p.set(5, 5, R.grass[3]);
    const col = typeof c === 'string' ? [c, c, c, c, c] : c;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) p.set(4 - (i - 1) + dx, 2 + dy, col[3]);
    p.set(4 - (i - 1), 2, R.gold[4]);
    one(`decor.flower_${biome}_${i}`, p);
  });
  const g = new Px(10, 7);
  const gr = { greenmarrow: R.grass, saltfen: R.teal, emberreach: R.stone, glasswaste: R.sand, hoarfrost: R.ice, umbral: R.violet }[biome];
  for (let k = 0; k < 5; k++) g.line(1 + k * 2, 6, 1 + k * 2 + (k - 2) * 0.6, 1 + (k % 2) * 2, gr[k % 2 ? 2 : 3]);
  one('decor.tuft_' + biome, g);
}
{ const p = new Px(8, 5); p.ball(2.5, 3, 2.2, 1.8, R.stone); p.ball(6, 3.5, 1.6, 1.3, R.stone); one('decor.pebbles', p); }
{ const p = new Px(8, 6); p.ellipse(4, 3.5, 3.5, 2.5, R.flesh[3]); for (let k = 0; k < 4; k++) p.line(4, 6, 1 + k * 2, 1, R.flesh[2]); one('decor.shell', p); }
{ const p = new Px(16, 6); p.line(1, 4, 14, 2, R.stone[3], 2); p.line(1, 3, 14, 1, R.stone[4]); p.line(9, 2, 12, 0, R.stone[2]); one('decor.driftwood', p); }
{ const p = new Px(12, 6); p.line(1, 4, 10, 2, R.sand[4], 2); p.ellipse(1, 4, 1.5, 1.5, R.sand[4]); p.ellipse(10.5, 2, 1.5, 1.5, R.sand[4]); p.line(3, 5, 6, 5, R.sand[3]); one('decor.bones', p); }
{ const p = new Px(8, 8); p.rect(3, 4, 2, 4, R.sand[3]); p.ellipse(4, 4, 3.5, 2.2, (x, y, nx, ny) => (ny > 0.3 ? null : R.ember[3])); p.set(3, 3, W); one('decor.mushroom', p); }
{ const p = new Px(8, 10); p.poly([[2, 9], [3, 2], [4, 0], [5, 9]], R.ice[3]); p.poly([[5, 9], [6, 4], [7, 9]], R.ice[2]); p.vline(3, 3, 8, R.ice[4]); one('decor.ice_crystal', p); }
{ const p = new Px(8, 8); p.poly([[1, 7], [3, 1], [4, 7]], R.ice[3]); p.poly([[4, 7], [6, 3], [7, 7]], R.violet[3]); p.set(3, 2, W); one('decor.glass_shard', p); }
{ const p = new Px(12, 8); p.ellipse(6, 4, 5.5, 3, R.violet[0]); p.ellipse(5, 3.5, 3, 1.5, R.ink[2]); p.set(4, 3, R.teal[3]); p.set(8, 5, R.violet[3]); one('decor.ink_puddle', p); }
{ const p = new Px(12, 8); for (let k = 0; k < 4; k++) p.line(6, 4, 6 + Math.cos(k * 1.7) * 5, 4 + Math.sin(k * 1.7) * 3, k % 2 ? R.ember[2] : R.ember[3]); p.set(6, 4, R.gold[4]); one('decor.ember_crack', p); }

// decals
{ const p = new Px(6, 6); p.ellipse(2, 3, 1.4, 2, R.ice[2]); p.ellipse(4.5, 2, 1.2, 1.6, R.ice[2]); one('decor.footprint_snow', p, [3, 3]); }
{ const p = new Px(6, 6); p.ellipse(2, 3, 1.4, 2, R.sand[1]); p.ellipse(4.5, 2, 1.2, 1.6, R.sand[1]); one('decor.footprint', p, [3, 3]); }
{ const p = new Px(16, 10); p.ellipse(8, 5, 7.5, 4.5, (x, y, nx, ny, d) => ((x + y) % 2 && d > 0.6 ? null : d < 0.4 ? R.ink[0] : R.ink[2])); one('decor.scorch', p, [8, 5]); }
{ const p = new Px(16, 10); p.path([[1, 5], [5, 4], [8, 6], [11, 3], [15, 5]], R.ink[1]); p.path([[8, 6], [9, 9]], R.ink[1]); p.path([[5, 4], [4, 1]], R.ink[1]); one('decor.crack', p, [8, 5]); }
{ const p = new Px(14, 8); p.ellipse(7, 4, 6.5, 3.5, R.sea[2]); p.ellipse(6, 3, 3, 1.4, R.sea[3]); p.set(4, 2, R.ice[4]); one('decor.puddle', p, [7, 4]); }
{ const p = new Px(14, 8); p.ellipse(7, 4, 6.5, 3.5, (x, y) => ((x + y) % 3 ? R.brown[0] : null)); one('decor.wet', p, [7, 4]); }
for (const [name, ramp] of Object.entries({ green: R.grass, teal: R.teal, orange: R.ember, violet: R.violet, red: R.ember, blue: R.sea })) {
  const p = new Px(10, 8);
  p.ellipse(5, 4, 3, 2.2, ramp[name === 'red' ? 1 : 2]); for (const [x, y] of [[1, 2], [8, 1], [9, 6], [2, 7], [6, 7]]) p.set(x, y, ramp[2]); p.set(4, 3, ramp[3]);
  one('decor.splat_' + name, p, [5, 4]);
}

// ------------------------------------------------------------------ chests

function chestPx(ramp, trim, open) {
  const p = new Px(16, 16);
  p.rect(2, 7, 12, 8, (x, y, i, j) => (j === 7 ? ramp[0] : i === 0 ? ramp[3] : ramp[2]));
  for (let y = 9; y < 15; y += 3) p.hline(2, 13, y, ramp[1]);
  if (open) { p.rect(2, 2, 12, 4, ramp[1]); p.hline(2, 13, 2, ramp[3]); p.rect(3, 6, 10, 2, R.gold[4]); p.set(6, 5, W); glow(p, 8, 4, 5, R.gold); }
  else { p.poly([[2, 7], [3, 3], [13, 3], [14, 7]], ramp[3]); p.hline(3, 12, 3, ramp[4]); }
  p.vline(4, open ? 7 : 3, 14, trim[2]); p.vline(11, open ? 7 : 3, 14, trim[2]);
  p.rect(7, 7, 2, 3, trim[4]);
  return p;
}
for (const [kind, ramp, trim] of [['chest', R.brown, R.gold], ['sea_chest', R.teal, R.gold], ['tide_cache', R.brown, R.sea]]) {
  anim('chest.' + kind, 16, 16, { closed: [chestPx(ramp, trim, false)], open: [chestPx(ramp, trim, true)] }, 1);
}

// ------------------------------------------------------------------ summons

function pocketTurret(f) {
  const p = new Px(12, 12);
  p.rect(2, 8, 8, 4, R.stone[2]); p.hline(2, 9, 8, R.stone[4]);
  p.rect(4, 4, 5, 4, R.gold[3]); p.hline(4, 8, 4, R.gold[4]); p.rect(8, 5, 4 - (f % 2), 2, R.stone[3]);
  if (f) p.set(11, 5, R.gold[4]);
  p.set(5, 5, R.ice[4]);
  return p;
}
function sproutling(f) {
  const p = new Px(12, 14);
  const b = f % 2;
  p.ellipse(6, 10 + b, 4, 3.5, (x, y, nx, ny) => band(R.brown, 0.6 - nx * 0.2 - ny * 0.4));
  p.set(5, 9 + b, INK); p.set(7, 9 + b, INK);
  p.line(6, 7 + b, 6, 3 + b, R.grass[2]); p.ellipse(4, 3 + b, 2, 1.2, R.grass[3]); p.ellipse(8, 2 + b, 2, 1.2, R.grass[4]);
  p.vline(4, 13, 13, R.brown[1]); p.vline(8, 13, 13, R.brown[1]);
  return p;
}
function tidePup(f) {
  const p = new Px(14, 12);
  const b = f % 2;
  p.ellipse(7, 8 + b, 5, 3, (x, y, nx, ny) => band(R.sea, 0.6 - ny * 0.4));
  p.ellipse(10, 5 + b, 2.6, 2.4, R.sea[3]); p.set(11, 4 + b, INK); p.set(12, 6 + b, R.ice[4]);
  p.poly([[2, 7 + b], [0, 5], [0, 9]], R.sea[2]);
  return p;
}
anim('summon.turret_pocket', 12, 12, { idle: [pocketTurret(0)], attack: [pocketTurret(1), pocketTurret(0)] }, 6, { mirror: true });
anim('summon.sproutling', 12, 14, { idle: [sproutling(0), sproutling(1)], walk: [sproutling(0), sproutling(1)] }, 4, { mirror: true });
anim('summon.battle_scuttler', 12, 10, { idle: [crab(0, R.stone), crab(1, R.stone)], walk: [0, 1, 2, 3].map((f) => crab(f, R.stone)) }, 8, { mirror: true });
anim('summon.tide_pup', 14, 12, { idle: [tidePup(0), tidePup(1)], walk: [tidePup(0), tidePup(1)] }, 6, { mirror: true });

// ------------------------------------------------------------------ projectiles (facing east)

const projs = {
  arrow: () => { const p = new Px(10, 3); p.hline(0, 7, 1, R.brown[3]); p.poly([[7, 0], [10, 1.5], [7, 3]], R.stone[4]); p.set(0, 0, W); p.set(0, 2, W); return p; },
  bolt: () => { const p = new Px(8, 3); p.hline(0, 5, 1, R.stone[3]); p.poly([[5, 0], [8, 1.5], [5, 3]], R.gold[4]); return p; },
  seed: () => { const p = new Px(4, 4); p.ball(2, 2, 1.8, 1.6, R.grass, { spec: W }); return p; },
  thorn: () => { const p = new Px(6, 3); p.poly([[0, 0], [6, 1.5], [0, 3]], R.brown[3]); return p; },
  rock: () => { const p = new Px(5, 5); p.ball(2.5, 2.5, 2.4, 2.2, R.stone); return p; },
  prism_shard: () => { const p = new Px(7, 4); p.poly([[0, 2], [3, 0], [7, 2], [3, 4]], R.violet[3]); p.line(1, 2, 5, 2, W); return p; },
  lava_blob: () => { const p = new Px(6, 6); p.ball(3, 3, 3, 3, R.ember, { spec: R.gold[4] }); return p; },
  ink: () => { const p = new Px(6, 6); p.ball(3, 3, 2.8, 2.8, R.violet); p.set(2, 2, R.teal[4]); return p; },
  icicle: () => { const p = new Px(8, 3); p.poly([[0, 0], [8, 1.5], [0, 3]], R.ice[3]); p.hline(0, 5, 1, W); return p; },
  sleet: () => { const p = new Px(5, 5); p.ball(2.5, 2.5, 2, 2, R.ice, { spec: W }); return p; },
  bog_orb: () => { const p = new Px(6, 6); p.ball(3, 3, 2.8, 2.8, R.teal, { spec: W }); return p; },
  brine_bolt: () => { const p = new Px(10, 4); p.ball(7, 2, 2.2, 2, R.sea, { spec: W }); for (let x = 0; x < 5; x++) p.set(x, 1 + (x % 2), x % 2 ? R.ice[4] : R.sea[3]); return p; },
  spark: () => { const p = new Px(6, 5); p.path([[0, 2], [2, 0], [3, 4], [6, 2]], R.gold[4]); return p; },
  note: () => { const p = new Px(5, 7); p.vline(3, 0, 5, R.violet[4]); p.ellipse(1.8, 5.5, 1.8, 1.4, R.violet[4]); return p; },
  bomb: () => { const p = new Px(6, 7); p.ball(3, 4, 2.8, 2.8, R.ink, { spec: R.stone[4] }); p.set(4, 0, R.ember[4]); return p; },
};
for (const el of ['none', 'ember', 'frost', 'storm', 'tide', 'hollow']) {
  const ramp = { none: R.stone, ember: R.ember, frost: R.ice, storm: R.gold, tide: R.sea, hollow: R.violet }[el];
  projs['orb_' + el] = () => { const p = new Px(8, 8); glow(p, 4, 4, 4, ramp); p.ball(4, 4, 2.5, 2.5, ramp, { spec: W }); return p; };
}
for (const [k, fn] of Object.entries(projs)) { const p = fn(); out['proj.' + k] = { w: p.w, h: p.h, anchor: [p.w / 2, p.h / 2], px: done(p) }; }

// fishing bobber (bob / bite frames)
{
  const mk = (dy, bite) => { const p = new Px(6, 8); p.ball(3, 4 + dy, 2.5, 2.5, R.ember, { spec: W }); p.hline(1, 4, 4 + dy, W); p.vline(3, 0, 1 + dy, R.stone[3]); if (bite) p.set(0, 7, R.ice[4]); return p; };
  anim('bobber.bobber', 6, 8, { idle: [mk(0), mk(1)], bite: [mk(2, true), mk(0, true)] }, 3);
}

// tiny campfire flame decal for lights (used by lamps/torches if wanted)
{ const p = new Px(6, 8); flame(p, 3, 7, 7, 0); one('decor.flame', p); }

export default out;
