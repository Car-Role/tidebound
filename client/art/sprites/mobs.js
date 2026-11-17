// WP3 enemy sprites ('mob.<id>'): 16x16 (radius >= 0.6 -> 24x24, frostbulk 32x32), facing right, mirror: true.
// Anims: idle (2), walk (4), windup (2), attack (2), hit (1). Each mob is a body-plan archetype (quadruped, crab,
// floater, worm, flyer, biped, mound) with its own palette and features, drawn per pose:
//   s = { leg: -1..1 walk phase, bob: 0|1, lean: -1..1 (back..forward), open: 0|1 mouth/claws, glow: 0|1, hurt }.

import { Px, R, INK, done, band } from '../gen/paint.js';
import { glow as glowFx, flame } from '../gen/build.js';
import ENEMIES from '../../../shared/data/enemies.js';

const W = '#';

// ------------------------------------------------------------------ archetypes

function quad(p, s, o) {
  const S = p.w / 16, by = p.h - 3 * S - s.bob;
  const bx = p.w / 2 + s.lean * S;
  const legC = o.leg ?? o.body;
  // legs (back pair darker)
  const lx = [bx - 4 * S, bx - 1.5 * S, bx + 1.5 * S, bx + 4 * S];
  lx.forEach((x, i) => {
    const ph = (i % 2 ? 1 : -1) * s.leg;
    const lift = Math.max(0, Math.round(ph * S));
    p.rect(Math.round(x + ph * S * 0.7), Math.round(by), Math.max(1, Math.round(S * 1.5)), Math.round(3 * S) - lift, i < 2 ? legC[1] : legC[2]);
  });
  // tail
  if (o.tail) p.line(bx - o.bw * S, by - o.bh * S * 0.6, bx - (o.bw + 3) * S, by - (o.bh + 2) * S * 0.6 - s.bob, o.tail);
  // body
  p.ellipse(bx, by - o.bh * S * 0.45, o.bw * S, o.bh * S * 0.55, (x, y, nx, ny) => band(o.body, 0.62 - nx * 0.25 - ny * 0.4));
  if (o.back) o.back(p, bx, by - o.bh * S * 0.6, S, s);
  // head
  const hx = bx + (o.bw - 0.5) * S + s.lean * S, hy = by - o.bh * S * (o.headY ?? 0.75);
  p.ellipse(hx, hy, o.hr * S, o.hr * S * 0.85, (x, y, nx, ny) => band(o.head ?? o.body, 0.66 - nx * 0.2 - ny * 0.4));
  if (o.snout) p.rect(Math.round(hx + o.hr * S * 0.6), Math.round(hy), Math.round(2 * S), Math.round(1.5 * S), (o.head ?? o.body)[2]);
  if (o.ears) { p.poly([[hx - S, hy - o.hr * S * 0.6], [hx - 0.5 * S, hy - (o.hr + 2.5) * S], [hx + S * 0.5, hy - o.hr * S * 0.7]], (o.head ?? o.body)[3]); }
  if (s.open) { p.rect(Math.round(hx + o.hr * S * 0.5), Math.round(hy + S), Math.round(2 * S), Math.round(S), INK); p.set(Math.round(hx + o.hr * S * 0.6), Math.round(hy + S), W); }
  eye(p, Math.round(hx + o.hr * S * 0.35), Math.round(hy - S * 0.5), s, o.eye);
}
function crab(p, s, o) {
  const S = p.w / 16, bx = p.w / 2 + s.lean * S, by = p.h - 4 * S - s.bob;
  for (let k = 0; k < 3; k++) {
    const ph = (k % 2 ? 1 : -1) * s.leg;
    p.line(bx - 2 * S + k * 2 * S, by, bx - 4 * S + k * 3 * S + ph * S, by + 3 * S, o.body[1]);
  }
  p.ellipse(bx, by - 1.5 * S, 5.5 * S, 3.6 * S, (x, y, nx, ny) => band(o.body, 0.65 - nx * 0.25 - ny * 0.45));
  if (o.spikes) for (let k = -2; k <= 2; k++) p.poly([[bx + k * 2 * S - S, by - 4 * S], [bx + k * 2 * S, by - 7 * S - Math.abs(k) * -S], [bx + k * 2 * S + S, by - 4 * S]], o.spikes[3 + (k % 2 ? 0 : 1)]);
  // claws
  const cl = o.claw ?? o.body;
  const big = o.bigClaw ? 1.4 : 1;
  const cx = bx + 6 * S + s.lean * S * 1.5, cy = by - 4 * S - (s.open ? S : 0);
  p.line(bx + 3 * S, by - 2 * S, cx - S, cy + S, cl[2], Math.round(S));
  p.ellipse(cx, cy, 2.4 * S * big, 1.8 * S * big, (x, y, nx, ny) => band(cl, 0.65 - nx * 0.2 - ny * 0.4));
  if (s.open) p.line(cx, cy, cx + 2 * S * big, cy - S, INK);
  // second (rear) claw raised
  const rx = bx - 5.5 * S - s.lean * S * 0.5, ry = by - 4.5 * S - (s.open ? S : 0);
  p.line(bx - 3 * S, by - 2 * S, rx + S, ry + S, cl[1], Math.round(S));
  p.ellipse(rx, ry, 1.9 * S, 1.5 * S, (x, y, nx, ny) => band(cl, 0.5 - nx * 0.2 - ny * 0.4));
  p.set(Math.round(rx - S), Math.round(ry - S), INK);
  p.vline(Math.round(bx), Math.round(by - 6 * S), Math.round(by - 4 * S), o.body[1]); p.vline(Math.round(bx + 2 * S), Math.round(by - 6 * S), Math.round(by - 4 * S), o.body[1]);
  eye(p, Math.round(bx - 0.5 * S), Math.round(by - 6.5 * S), s, o.eye);
  eye(p, Math.round(bx + 1.5 * S), Math.round(by - 6.5 * S), s, o.eye);
}
function floater(p, s, o) {
  const S = p.w / 16, cx = p.w / 2 + s.lean * S, cy = p.h / 2 - 1 * S + (s.bob ? S : 0) - (o.lift ?? 0) * S;
  if (o.under) o.under(p, cx, cy, S, s);
  if (o.spiky) for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + s.leg * 0.2; p.line(cx, cy, cx + Math.cos(a) * o.r * S * 1.45, cy + Math.sin(a) * o.r * S * 1.45, o.body[k % 2 ? 4 : 3]); }
  p.ball(cx, cy, o.r * S, o.r * S * (o.squat ?? 1), o.body, { spec: o.spec ?? null });
  if (o.over) o.over(p, cx, cy, S, s);
  if (o.eyeBig) {
    p.ellipse(cx + S, cy, o.eyeBig * S, o.eyeBig * S, W);
    p.ellipse(cx + S * (1.5 + s.lean), cy, o.eyeBig * S * 0.55, o.eyeBig * S * 0.55, s.glow ? R.ember[3] : o.eye ?? R.violet[2]);
    p.set(Math.round(cx + S * (1.5 + s.lean)), Math.round(cy), INK);
  } else {
    eye(p, Math.round(cx + S), Math.round(cy - S), s, o.eye); eye(p, Math.round(cx + 3 * S), Math.round(cy - S), s, o.eye);
  }
  if (s.open && !o.eyeBig) p.rect(Math.round(cx + S), Math.round(cy + 2 * S), Math.round(2 * S), Math.round(S), INK);
  if (o.aura && s.glow) glowFx(p, cx, cy, o.r * S * 1.8, o.aura);
}
function worm(p, s, o) {
  const S = p.w / 16, n = o.seg ?? 5;
  const base = p.h - 2 * S;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = p.w * 0.18 + t * p.w * 0.58 + s.lean * S * t;
    const y = base - (o.rise ?? 0) * t * S - Math.sin(t * Math.PI + s.leg * 1.2) * 1.5 * S - (s.bob && k % 2 ? S : 0);
    const r = (o.r0 + (o.r1 - o.r0) * t) * S;
    p.ball(x, y - r, r, r * 0.9, k === n - 1 ? (o.head ?? o.body) : o.body, {});
    if (k < n - 1 && o.band) p.set(Math.round(x), Math.round(y - r * 1.6), o.band);
  }
  const t = 1, hx = p.w * 0.18 + t * p.w * 0.58 + s.lean * S, hr = o.r1 * S;
  const hy = base - (o.rise ?? 0) * S - hr - Math.sin(Math.PI + s.leg * 1.2) * 1.5 * S - (s.bob ? S : 0);
  if (o.maw) {
    p.ellipse(hx + hr * 0.4, hy, hr * 0.6, hr * (s.open ? 0.7 : 0.35), INK);
    for (let k = -2; k <= 2; k++) p.set(Math.round(hx + hr * 0.4 + k * S * 0.6), Math.round(hy - hr * (s.open ? 0.6 : 0.3)), W);
  } else eye(p, Math.round(hx + hr * 0.4), Math.round(hy - hr * 0.3), s, o.eye);
}
function flyer(p, s, o) {
  const S = p.w / 16, cx = p.w / 2 + s.lean * S, cy = p.h / 2 + (s.bob ? S : 0) - S;
  const flap = s.leg; // -1..1 wing phase
  const wingY = cy - (flap > 0 ? 4 : flap < 0 ? -1 : 2) * S;
  for (const side of [-1, 1]) {
    const tipX = cx + side * 7 * S, tipY = wingY;
    p.poly([[cx, cy - S], [tipX, tipY], [cx + side * 4 * S, cy + 2 * S]], side < 0 ? o.wing[2] : o.wing[3]);
    p.line(cx, cy - S, tipX, tipY, o.wing[4]);
    if (o.wingTip) p.set(Math.round(tipX), Math.round(tipY), o.wingTip);
  }
  p.ball(cx, cy + S, 2.2 * S, 3 * S, o.body, {});
  if (o.abdomen) p.ball(cx - S, cy + 4 * S, 1.8 * S, 2 * S, o.abdomen, { spec: W });
  if (o.beak) p.poly([[cx + 2 * S, cy - S], [cx + 5 * S, cy], [cx + 2 * S, cy + S]], o.beak);
  eye(p, Math.round(cx + S), Math.round(cy - S), s, o.eye);
}
function biped(p, s, o) {
  const S = p.w / 16, bx = p.w / 2 + s.lean * S * 0.5, foot = p.h - 1 - s.bob * 0;
  const legH = (o.legH ?? 4) * S, bodyH = (o.bodyH ?? 6) * S, bw = (o.bw ?? 3) * S;
  if (o.float) {
    // ghost tail instead of legs
    for (let y = 0; y < legH + 2 * S; y++) {
      const hw = bw * (1 - y / (legH + 3 * S));
      const wob = Math.sin(y * 0.8 + s.leg * 2) * S;
      p.hline(Math.round(bx - hw + wob), Math.round(bx + hw * 0.6 + wob), Math.round(foot - legH - 2 * S + y - s.bob), (y % 3 ? o.body[2] : o.body[1]));
    }
  } else {
    for (const side of [-1, 1]) {
      const ph = side * s.leg;
      const x = bx + side * bw * 0.45 + ph * S;
      p.rect(Math.round(x - S * 0.5), Math.round(foot - legH), Math.max(1, Math.round(S * 1.4)), Math.round(legH - Math.max(0, ph) * S), side < 0 ? (o.legs ?? o.body)[1] : (o.legs ?? o.body)[2]);
    }
  }
  const top = foot - legH - bodyH - s.bob;
  p.ellipse(bx, top + bodyH / 2, bw, bodyH / 2, (x, y, nx, ny) => band(o.body, 0.62 - nx * 0.25 - ny * 0.35));
  if (o.chest) o.chest(p, bx, top, S, s);
  // arms
  const armA = s.open ? -0.4 : s.lean < 0 ? -1.4 : 0.9;
  const ax = bx + bw * 0.8, ay = top + bodyH * 0.35;
  const len = (o.armLen ?? 4) * S;
  p.line(ax, ay, ax + Math.cos(armA) * len, ay + Math.sin(armA) * len, (o.arm ?? o.body)[2], Math.max(1, Math.round(S)));
  if (o.weapon) o.weapon(p, ax + Math.cos(armA) * len, ay + Math.sin(armA) * len, armA, S, s);
  p.line(bx - bw * 0.8, ay, bx - bw * 0.8 - S, ay + len * 0.8, (o.arm ?? o.body)[1], Math.max(1, Math.round(S)));
  // head
  const hr = (o.hr ?? 2.6) * S, hx = bx + S * 0.5 + s.lean * S, hy = top - hr * 0.6;
  p.ellipse(hx, hy, hr, hr * 0.9, (x, y, nx, ny) => band(o.head ?? o.body, 0.66 - nx * 0.25 - ny * 0.4));
  if (o.hat) o.hat(p, hx, hy, hr, S, s);
  eye(p, Math.round(hx + hr * 0.35), Math.round(hy - S * 0.3), s, o.eye);
  if (o.eye2) eye(p, Math.round(hx - hr * 0.25), Math.round(hy - S * 0.3), s, o.eye);
  if (s.open && o.mouth !== false) p.set(Math.round(hx + hr * 0.4), Math.round(hy + hr * 0.5), INK);
}
function mound(p, s, o) {
  const S = p.w / 16, cx = p.w / 2, by = p.h - 1;
  const h = (o.h ?? 8) * S * (s.lean < 0 ? 0.85 : 1);
  p.ellipse(cx, by - h * 0.5, 7 * S, h * 0.6, (x, y, nx, ny) => (y > by ? null : band(o.body, 0.55 - nx * 0.3 - ny * 0.4)));
  if (o.cracks) for (let k = 0; k < 4; k++) p.line(cx - 5 * S + k * 3 * S, by - S, cx - 4 * S + k * 3 * S + S, by - h * 0.7, o.cracks[s.glow ? 4 : 3]);
  const mo = s.open ? 2.4 : s.glow ? 1.2 : 0.6;
  p.ellipse(cx + S, by - h * 0.85, 2.6 * S, mo * S, INK);
  if (s.open || s.glow) p.ellipse(cx + S, by - h * 0.85, 1.6 * S, mo * S * 0.5, o.mawGlow ?? R.ember[4]);
  eye(p, Math.round(cx - 2 * S), Math.round(by - h * 0.95), s, o.eye); eye(p, Math.round(cx + 4 * S), Math.round(by - h * 0.95), s, o.eye);
}

function eye(p, x, y, s, c, stalk = false) {
  if (s.hurt) { p.set(x, y, INK); p.set(x - 1, y, INK); return; }
  if (stalk) { p.set(x, y + 1, R.stone[3]); }
  p.set(x, y, s.glow ? R.ember[4] : c ?? W);
  p.set(x + 1, y, s.glow ? R.gold[4] : INK);
}

// ------------------------------------------------------------------ mobs

const MOBS = {
  mossback: [quad, { body: R.grass, head: R.brown, leg: R.brown, bw: 5.5, bh: 7, hr: 2.2, snout: true, tail: R.brown[2],
    back: (p, x, y, S) => { p.ellipse(x - S, y - S, 5 * S, 3 * S, (xx, yy, nx, ny) => band(R.grass, 0.7 - nx * 0.2 - ny * 0.5)); p.speckle([R.grass[4], R.gold[4]], 0.08, 3, (c, xx, yy) => yy < y); } }],
  thistlewisp: [floater, { body: R.violet, r: 3.2, spiky: true, eye: W, lift: 1, under: (p, x, y, S) => p.line(x, y + 3 * S, x - S, y + 6 * S, R.grass[2]) }],
  burrowgrub: [worm, { body: R.flesh, head: R.brown, r0: 2, r1: 3, seg: 5, band: R.flesh[1], eye: INK }],
  lantern_moth: [flyer, { body: R.brown, wing: R.sand, abdomen: R.gold, wingTip: R.gold[4], eye: R.ember[4] }],
  clatterclaw: [crab, { body: R.teal, claw: R.ember, bigClaw: true, eye: W }],
  fenleech: [worm, { body: R.teal, head: R.ink, r0: 1.6, r1: 2.6, seg: 6, maw: true }],
  reedstalker: [biped, { body: R.sand, legs: R.grass, arm: R.grass, head: R.grass, bw: 2, bodyH: 6, legH: 5, armLen: 5, hr: 2, eye: R.gold[4],
    weapon: (p, x, y, a, S) => { p.line(x, y, x + Math.cos(a - 0.9) * 3 * S, y + Math.sin(a - 0.9) * 3 * S, R.grass[4]); },
    hat: (p, x, y, r, S) => { p.line(x - r, y - r, x - r - 2 * S, y - r - 3 * S, R.gold[3]); p.line(x, y - r, x + S, y - r - 3 * S, R.gold[3]); } }],
  bogwisp: [floater, { body: R.teal, r: 3, eye: W, spec: W, aura: R.teal,
    over: (p, x, y, S, s) => { flame(p, Math.round(x), Math.round(y - 2 * S), Math.round(5 * S), s.leg > 0 ? 1 : 0, R.teal, R.ice); },
    under: (p, x, y, S) => { p.line(x, y + 2 * S, x - 2 * S, y + 5 * S, R.teal[2]); } }],
  brine_shambler: [biped, { body: R.teal, legs: R.teal, head: R.sand, bw: 4.2, bodyH: 6, legH: 3, armLen: 5, hr: 2.4, eye: R.gold[4],
    chest: (p, x, y, S) => { p.speckle([W, R.sand[4], R.grass[2]], 0.15, 9, (c, xx, yy) => yy > y); } }],
  cinderling: [floater, { body: R.ember, r: 3.4, squat: 0.9, eye: W, aura: R.ember, lift: -1,
    over: (p, x, y, S, s) => { p.line(x, y - 3 * S, x + S, y - 5 * S, R.ink[3]); flame(p, Math.round(x + S), Math.round(y - 5 * S), Math.round(3 * S + (s.glow ? 2 : 0)), s.leg > 0 ? 1 : 0); } }],
  slagback: [quad, { body: R.ink, head: R.ink, leg: R.ink, bw: 6, bh: 7, hr: 2.4, eye: R.ember[4],
    back: (p, x, y, S, s) => { for (let k = -2; k <= 2; k++) p.poly([[x + k * 2.2 * S - S, y + S], [x + k * 2.2 * S, y - 3 * S], [x + k * 2.2 * S + S, y + S]], s.glow ? R.gold[4] : R.ember[3]); p.speckle([R.ember[2]], 0.08, 5); } }],
  ashwing: [flyer, { body: R.ink, wing: R.stone, wingTip: R.ember[4], beak: R.ember[3], eye: R.ember[4] }],
  magmaw: [mound, { body: R.ink, cracks: R.ember, h: 9, eye: R.ember[4] }],
  emberwraith: [biped, { body: R.ember, head: R.violet, float: true, bw: 3, bodyH: 5, legH: 4, hr: 2.4, armLen: 4, eye: R.gold[4], eye2: true, mouth: false,
    hat: (p, x, y, r, S, s) => flame(p, Math.round(x), Math.round(y - r + S), Math.round(4 * S), s.leg > 0 ? 1 : 2, R.violet, R.ember) }],
  shardscuttle: [crab, { body: R.sand, claw: R.ice, spikes: R.ice, eye: W }],
  mirage_stalker: [quad, { body: R.sand, head: R.sand, leg: R.sand, bw: 5, bh: 5.5, hr: 2.2, ears: true, tail: R.violet[3], eye: R.violet[4],
    back: (p, x, y, S) => { for (let k = -1; k <= 1; k++) p.line(x + k * 2.5 * S, y - S, x + k * 2.5 * S + S, y + 2 * S, R.violet[3]); } }],
  dune_maw: [worm, { body: R.sand, head: R.sand, r0: 2.4, r1: 4.2, seg: 5, rise: 4, maw: true, band: R.sand[1] }],
  prism_sentinel: [floater, { body: R.violet, r: 3.2, eyeBig: 1.8, eye: R.ice[2], lift: 1,
    over: (p, x, y, S) => { p.poly([[x - 3 * S, y - 2 * S], [x, y - 7 * S], [x + 3 * S, y - 2 * S]], R.ice[3]); p.line(x - S, y - 5 * S, x, y - 7 * S, W); },
    under: (p, x, y, S) => { p.poly([[x - 2 * S, y + 2 * S], [x, y + 6 * S], [x + 2 * S, y + 2 * S]], R.violet[1]); } }],
  glass_revenant: [biped, { body: R.ice, head: R.ice, legs: R.ice, arm: R.violet, bw: 3, bodyH: 6, legH: 4, hr: 2.4, eye: R.violet[4], eye2: true,
    chest: (p, x, y, S) => { p.line(x - S, y + S, x + S, y + 4 * S, W); p.set(Math.round(x), Math.round(y + 3 * S), R.violet[3]); },
    weapon: (p, x, y, a, S) => p.poly([[x, y], [x + Math.cos(a) * 4 * S, y + Math.sin(a) * 4 * S - S], [x + S, y + S]], R.violet[3]) }],
  rimewolf: [quad, { body: R.ice, head: R.ice, leg: R.ice, bw: 5.5, bh: 5.5, hr: 2.3, snout: true, ears: true, tail: R.ice[4], eye: R.sea[1] }],
  frostbulk: [biped, { body: R.ice, head: R.ice, legs: R.ice, arm: R.ice, bw: 4.6, bodyH: 6.5, legH: 3, armLen: 5.5, hr: 2.4, eye: R.sea[1],
    chest: (p, x, y, S) => p.ellipse(x + S, y + 4 * S, 2.5 * S, 2.5 * S, R.stone[3]),
    hat: (p, x, y, r, S) => { p.poly([[x - r, y - r * 0.5], [x - r - S, y - r - 2 * S], [x - r * 0.3, y - r * 0.8]], R.sand[4]); } }],
  stillwing: [flyer, { body: R.ice, wing: R.ice, wingTip: W, beak: R.gold[3], eye: R.sea[0] }],
  sleetspitter: [floater, { body: R.sea, r: 4, squat: 0.75, eye: W, lift: -2,
    under: (p, x, y, S, s) => { for (const k of [-1, 1]) { p.rect(Math.round(x + k * 3 * S - S), Math.round(y + 2 * S), Math.round(2 * S), Math.round(2 * S), R.sea[1]); p.hline(Math.round(x + k * 3 * S - 2 * S), Math.round(x + k * 3 * S + S), Math.round(y + 4 * S - 1), R.ice[3]); } },
    over: (p, x, y, S, s) => { p.ellipse(x - S, y - 3 * S, 2 * S, 1.5 * S, R.sea[3]); p.ellipse(x + 2 * S, y - 3 * S, 2 * S, 1.5 * S, R.sea[3]); p.hline(Math.round(x - 2 * S), Math.round(x + 4 * S), Math.round(y + S), s.open ? INK : R.sea[0]); if (s.open) p.set(Math.round(x + 5 * S), Math.round(y + S), R.ice[4]); p.speckle([R.ice[4]], 0.1, 7); } }],
  pale_shade: [biped, { body: R.stone, head: R.ice, float: true, bw: 3.2, bodyH: 6, legH: 4, armLen: 6, hr: 2.4, eye: R.ink[0], eye2: true, mouth: false,
    weapon: (p, x, y, a, S) => { for (let k = 0; k < 3; k++) p.line(x, y, x + Math.cos(a + k * 0.3 - 0.3) * 2 * S, y + Math.sin(a + k * 0.3 - 0.3) * 2 * S, R.ice[4]); } }],
  hollowling: [biped, { body: R.ink, head: R.ink, legs: R.ink, bw: 2.4, bodyH: 4, legH: 3, hr: 2.8, eye: R.violet[4], eye2: true,
    hat: (p, x, y, r, S) => { p.poly([[x - r, y - r * 0.4], [x - r - S, y - r - 2 * S], [x - r * 0.4, y - r * 0.8]], R.violet[2]); p.poly([[x + r, y - r * 0.4], [x + r + S, y - r - 2 * S], [x + r * 0.4, y - r * 0.8]], R.violet[2]); } }],
  inkmaw: [mound, { body: R.violet, cracks: R.teal, h: 8, eye: R.teal[4], mawGlow: R.teal[4] }],
  refrain_knight: [biped, { body: R.violet, legs: R.ink, head: R.stone, arm: R.stone, bw: 3.2, bodyH: 6, legH: 4, hr: 2.4, eye: R.teal[4], mouth: false,
    chest: (p, x, y, S) => { p.line(x, y + S, x, y + 5 * S, R.gold[3]); p.line(x - 2 * S, y + 3 * S, x + 2 * S, y + 3 * S, R.gold[3]); },
    hat: (p, x, y, r, S) => { p.rect(Math.round(x - r), Math.round(y - r), Math.round(2 * r), Math.round(r * 0.7), R.stone[3]); p.line(x - r * 0.4, y - r, x - r * 0.4 - S, y - r - 3 * S, R.ember[3]); },
    weapon: (p, x, y, a, S) => { p.line(x, y, x + Math.cos(a - 1.2) * 6 * S, y + Math.sin(a - 1.2) * 6 * S, R.ice[4]); p.line(x - S, y + S, x + S, y - S, R.gold[3]); } }],
  gloom_lantern: [floater, { body: R.violet, r: 2.8, eye: R.teal[4], spec: W, aura: R.teal,
    over: (p, x, y, S) => { p.rect(Math.round(x - 2 * S), Math.round(y - 4 * S), Math.round(4 * S), Math.round(S), R.ink[3]); p.line(x, y - 4 * S, x, y - 6 * S, R.ink[3]); p.ball(x, y + S, 1.5 * S, 1.5 * S, R.teal, { spec: W }); } }],
  abyss_eye: [floater, { body: R.ink, r: 5.2, eyeBig: 3.4, eye: R.violet[2],
    under: (p, x, y, S, s) => { for (let k = 0; k < 5; k++) { const a = Math.PI * 0.2 + (k / 4) * Math.PI * 0.6; p.path([[x, y], [x + Math.cos(a) * 5 * S, y + Math.sin(a) * 5 * S], [x + Math.cos(a) * 7 * S + s.leg * S, y + Math.sin(a) * 8 * S]], R.violet[k % 2 ? 1 : 2], Math.max(1, Math.round(S * 0.8))); } } }],
  tidewraith: [biped, { body: R.sea, head: R.ice, float: true, bw: 3.2, bodyH: 5.5, legH: 4, hr: 2.4, armLen: 5, eye: R.teal[4], eye2: true, mouth: false,
    chest: (p, x, y, S, s) => { for (let k = 0; k < 6; k++) p.set(Math.round(x - 5 * S + k * 2 * S), Math.round(p.h - 2 - Math.sin(k + s.leg) * S), R.ice[4]); },
    weapon: (p, x, y, a, S) => { p.line(x, y, x + Math.cos(a - 1) * 6 * S, y + Math.sin(a - 1) * 6 * S, R.brown[3]); p.path([[x + Math.cos(a - 1) * 6 * S - S, y + Math.sin(a - 1) * 6 * S], [x + Math.cos(a - 1) * 6 * S + S, y + Math.sin(a - 1) * 6 * S - 2 * S]], R.ice[4]); } }],
};

// ------------------------------------------------------------------ frames

const POSES = {
  idle: [{ bob: 0 }, { bob: 1 }],
  walk: [{ leg: 1, bob: 0 }, { leg: 0, bob: 1 }, { leg: -1, bob: 0 }, { leg: 0, bob: 1 }],
  windup: [{ lean: -1, glow: 1 }, { lean: -1.5, glow: 1, bob: 1 }],
  attack: [{ lean: 1.5, open: 1 }, { lean: 2, open: 1, leg: 1 }],
  hit: [{ lean: -1, hurt: 1 }],
};
const sizeOf = (e) => (e.id === 'frostbulk' ? 32 : (e.radius ?? 0.4) >= 0.6 ? 24 : 16);

export function mobFrames(fn, o, size) {
  const anims = {};
  for (const [name, list] of Object.entries(POSES)) {
    anims[name] = list.map((ps) => {
      const s = { leg: 0, bob: 0, lean: 0, open: 0, glow: 0, hurt: 0, ...ps };
      const p = new Px(size, size);
      fn(p, s, o);
      if (s.hurt) p.map((c) => (c === INK ? null : c)).tone(1);
      return done(p);
    });
  }
  return anims;
}

const out = {};
for (const e of ENEMIES) {
  const size = sizeOf(e);
  const [fn, o] = MOBS[e.id] ?? [quad, { body: R.stone, bw: 5, bh: 6, hr: 2.2 }];
  out['mob.' + e.id] = { w: size, h: size, fps: 6, mirror: true, anchor: [size / 2, size], anims: mobFrames(fn, o, size) };
}
export { MOBS };
export default out;
