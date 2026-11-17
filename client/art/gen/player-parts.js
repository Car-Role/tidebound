// WP3 layered player parts. Every part shares the anim names and frame counts of 'pl.body' so it can be drawn
// with the same opts (anim, time, flip, scale) right over the body:
//   idle_down|up|side (2), run_down|up|side (4), swing_down|up|side (3), roll_down|up|side (4); 16x20, anchor [8,19].
// Parts are derived from the body frames themselves (shirt / head bounds are measured per frame), so they stay
// aligned through breathing and running bobs.
//   'pl.body'                      core body + swing/roll anims (overrides the core definition, same variants)
//   'pl.outfit.<classId>'          6 class outfits (bulwark, squallblade, brinesinger, gearwright, prospector, greenwarden)
//   'pl.hat.<cosmeticId>'          20 deed hats (cos_d_*) + moon_shard_crown
//   'pl.hook.<1..7>' / 'pl.hook.hook_<n>' / 'pl.hook.<hookSkinCosmetic>'   hook in hand
//   'pl.weapon.<blade|bow|staff>.<1..7>'                                   weapon carried on the back

import { Px, R, INK, TIER_METAL } from './paint.js';
import core from '../sprites/core.js';

const W = '#';
const BODY = core['pl.body'];
const SHIRT = new Set([R.teal[2], R.teal[3], R.teal[4]]);
const HAIR = new Set([R.brown[2], R.brown[3]]);
const SKIN = new Set([R.flesh[2], R.flesh[3]]);
const DIRS = ['down', 'up', 'side'];

// ------------------------------------------------------------------ body anims (swing / roll)

const shift = (rows, dx, dy) => Px.from(rows).shift(dx, dy).rows();
function swingFrames(dir) {
  const base = BODY.anims['idle_' + dir][0];
  if (dir === 'side') return [shift(base, -1, 0), base, shift(base, 1, 0)];
  if (dir === 'down') return [shift(base, 0, -1), base, shift(base, 0, 1)];
  return [shift(base, 0, 1), base, shift(base, 0, -1)];
}
function rollFrames(dir) {
  const base = Px.from(BODY.anims['idle_' + dir][0]).scale(1, 0.72, 8, 19);
  return [0, 1, 2, 3].map((k) => base.rotate((k * Math.PI) / 2 * (dir === 'side' ? 1 : 0.25), 8, 14).rows());
}
const ANIMS = { ...BODY.anims };
for (const d of DIRS) { ANIMS['swing_' + d] = swingFrames(d); ANIMS['roll_' + d] = rollFrames(d); }

// ------------------------------------------------------------------ frame analysis

function analyse(rows) {
  const h = rows.length, w = rows[0].length;
  let headTop = -1, shirtTop = -1, shirtBot = -1, sx0 = 99, sx1 = -1, hx0 = 99, hx1 = -1, faceY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (c !== '.' && headTop < 0) headTop = y;
    if (SHIRT.has(c)) { if (shirtTop < 0) shirtTop = y; shirtBot = y; sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x); }
    if (HAIR.has(c) || SKIN.has(c)) { if (y < (shirtTop < 0 ? 99 : shirtTop)) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); } }
    if (SKIN.has(c) && faceY < 0 && shirtTop < 0) faceY = y;
  }
  if (shirtTop < 0) { shirtTop = 9; shirtBot = 12; sx0 = 4; sx1 = 11; }
  if (hx1 < 0) { hx0 = 4; hx1 = 11; }
  return { headTop: Math.max(0, headTop), shirtTop, shirtBot, sx0, sx1, hx0, hx1, hcx: (hx0 + hx1) / 2, faceY, rows };
}
const isBody = (a, x, y) => a.rows[y]?.[x] && a.rows[y][x] !== '.';

// Build a part sprite: fn(p, a, dir, anim, frameIndex) draws into a 16x20 Px.
function part(fn) {
  const anims = {};
  for (const [name, frames] of Object.entries(ANIMS)) {
    const dir = name.split('_')[1];
    anims[name] = frames.map((rows, i) => {
      const p = new Px(16, 20);
      fn(p, analyse(rows), dir, name, i);
      return p.rows();
    });
  }
  return { w: 16, h: 20, fps: BODY.fps ?? 8, anchor: [8, 19], mirror: true, anims };
}

// ------------------------------------------------------------------ class outfits

const OUTFITS = {
  bulwark(p, a, dir) {
    const m = R.stone;
    for (const x of [a.sx0 - 1, a.sx1 - 1]) { p.rect(x, a.shirtTop - 1, 3, 2, m[3]); p.hline(x, x + 2, a.shirtTop - 1, m[4]); p.set(x + 1, a.shirtTop, m[1]); }
    if (dir !== 'up') { p.rect(a.sx0 + 2, a.shirtTop + 1, a.sx1 - a.sx0 - 3, a.shirtBot - a.shirtTop - 1, m[2]); p.vline(a.sx0 + 2, a.shirtTop + 1, a.shirtBot - 1, m[4]); p.set(Math.round((a.sx0 + a.sx1) / 2), a.shirtTop + 2, R.gold[3]); }
    else p.rect(a.sx0 + 1, a.shirtTop + 1, a.sx1 - a.sx0 - 1, 2, m[1]);
    p.hline(a.sx0, a.sx1, a.shirtBot, R.brown[1]);
  },
  squallblade(p, a, dir) {
    const g = R.grass;
    p.hline(a.sx0, a.sx1, a.shirtTop, g[3]); p.hline(a.sx0 + 1, a.sx1 - 1, a.shirtTop - 1, g[4]);
    const tailX = dir === 'side' ? a.sx0 - 1 : a.sx1 + 1;
    p.line(tailX, a.shirtTop, tailX - (dir === 'side' ? 2 : -1), a.shirtTop + 3, g[2]);
    if (dir !== 'up') p.line(a.sx0, a.shirtTop + 1, a.sx1, a.shirtBot, g[2]);
    p.hline(a.sx0, a.sx1, a.shirtBot, R.ink[3]);
  },
  brinesinger(p, a, dir) {
    const s = R.sea;
    for (let y = a.shirtBot; y <= Math.min(18, a.shirtBot + 5); y++) {
      const grow = Math.floor((y - a.shirtBot) / 2);
      p.hline(a.sx0 - grow, a.sx1 + grow, y, y === a.shirtBot ? s[4] : (y + (dir === 'side' ? 1 : 0)) % 2 ? s[2] : s[3]);
    }
    p.hline(a.sx0, a.sx1, a.shirtTop, R.teal[4]);
    if (dir !== 'up') p.vline(Math.round((a.sx0 + a.sx1) / 2), a.shirtTop + 1, a.shirtBot + 4, R.ice[4]);
  },
  gearwright(p, a, dir) {
    const g = R.gold;
    const gy = a.headTop + 2;
    if (dir === 'down') { p.rect(a.hx0 + 1, gy, 3, 2, g[3]); p.rect(a.hx1 - 3, gy, 3, 2, g[3]); p.set(a.hx0 + 2, gy, R.ice[4]); p.set(a.hx1 - 2, gy, R.ice[4]); p.hline(a.hx0, a.hx1, gy + 1, R.brown[1]); }
    else if (dir === 'side') { p.rect(a.hx1 - 3, gy, 3, 2, g[3]); p.set(a.hx1 - 2, gy, R.ice[4]); p.hline(a.hx0, a.hx1 - 3, gy + 1, R.brown[1]); }
    else p.hline(a.hx0, a.hx1, gy + 1, R.brown[1]);
    p.hline(a.sx0, a.sx1, a.shirtBot, R.brown[1]); p.set(Math.round((a.sx0 + a.sx1) / 2), a.shirtBot, g[4]);
    for (let x = a.sx0 + 1; x < a.sx1; x += 3) p.set(x, a.shirtBot - 1, R.stone[3]);
  },
  prospector(p, a, dir) {
    const v = R.gold;
    for (let y = a.shirtTop; y <= a.shirtBot; y++) { p.set(a.sx0, y, v[1]); p.set(a.sx0 + 1, y, v[2]); p.set(a.sx1, y, v[0]); p.set(a.sx1 - 1, y, v[1]); }
    if (dir !== 'up') p.set(a.sx0 + 1, a.shirtTop + 2, R.stone[4]);
    p.rect(a.hx0, a.headTop, a.hx1 - a.hx0 + 1, 2, R.brown[2]); p.hline(a.hx0 - 1, a.hx1 + 1, a.headTop + 2, R.brown[1]);
    if (dir === 'down') p.set(Math.round(a.hcx), a.headTop + 1, R.gold[4]);
    if (dir === 'side') p.set(a.hx1, a.headTop + 1, R.gold[4]);
  },
  greenwarden(p, a, dir) {
    const g = R.grass;
    for (let y = a.shirtTop - 1; y <= a.shirtBot + 3; y++) {
      const hw = dir === 'up' ? 1 : 0;
      const l = a.sx0 - 1 - Math.floor((y - a.shirtTop) / 3), r = a.sx1 + 1 + Math.floor((y - a.shirtTop) / 3);
      if (dir === 'up' || hw) p.hline(l, r, y, (y % 2) ? g[2] : g[1]);
      else { p.set(l, y, g[2]); p.set(r, y, g[1]); }
    }
    p.hline(a.sx0, a.sx1, a.shirtTop - 1, g[3]);
    p.set(Math.round(a.hcx) + 1, a.headTop - 1, g[4]); p.set(Math.round(a.hcx) + 2, a.headTop - 2, g[3]);
  },
};

// ------------------------------------------------------------------ hats

function hatShape(kind) {
  return (p, a, dir) => {
    const cx = Math.round(a.hcx), t = a.headTop, x0 = a.hx0, x1 = a.hx1;
    const side = dir === 'side';
    switch (kind) {
      case 'cap': p.rect(x0, t, x1 - x0 + 1, 2, R.brown[2]); p.hline(x0, x1, t, R.brown[3]); if (dir !== 'up') p.hline(side ? cx : x0, x1 + (side ? 2 : 0), t + 2, R.brown[1]); break;
      case 'bandana': p.rect(x0, t, x1 - x0 + 1, 2, R.ember[3]); p.set(x0 + 2, t, R.ember[4]); p.set(x0 - 1, t + 2, R.ember[2]); p.set(x0 - 2, t + 3, R.ember[2]); break;
      case 'goggles': p.rect(x0, t - 1, x1 - x0 + 1, 3, R.gold[2]); p.hline(x0, x1, t - 1, R.gold[4]); if (dir !== 'up') { p.set(cx - 2, t + 1, R.ice[4]); p.set(cx + 2, t + 1, R.ice[4]); } break;
      case 'chef': p.rect(x0 + 1, t - 5, x1 - x0 - 1, 6, W); p.ellipse(cx + 0.5, t - 5, 4, 2, W); p.hline(x0, x1, t + 1, R.ice[3]); p.set(cx - 1, t - 4, R.ice[3]); break;
      case 'witch': p.poly([[x0 - 1, t + 1], [cx + (side ? -2 : 0), t - 8], [x1 + 2, t + 1]], R.violet[2]); p.hline(x0 - 2, x1 + 2, t + 1, R.violet[1]); p.line(x0, t, cx, t - 7, R.violet[3]); p.set(cx, t - 2, R.gold[4]); break;
      case 'hardhat': p.ellipse(cx + 0.5, t + 1, (x1 - x0) / 2 + 1, 3, (x, y) => (y > t + 1 ? null : R.gold[3])); p.hline(x0 - 1, x1 + 1, t + 1, R.gold[2]); p.set(cx - 1, t - 1, R.gold[4]); break;
      case 'horned': p.rect(x0, t - 1, x1 - x0 + 1, 3, R.stone[3]); p.hline(x0, x1, t - 1, R.stone[4]); p.line(x0, t, x0 - 2, t - 3, R.sand[4]); p.line(x1, t, x1 + 2, t - 3, R.sand[4]); break;
      case 'sailor': p.rect(x0, t - 1, x1 - x0 + 1, 2, W); p.hline(x0, x1, t + 1, R.sea[2]); p.set(cx, t - 1, R.sea[3]); break;
      case 'propeller': p.rect(x0 + 1, t - 1, x1 - x0 - 1, 2, R.ember[3]); p.set(cx, t - 1, R.gold[3]); p.vline(cx, t - 3, t - 2, R.stone[3]); p.hline(cx - 3, cx + 3, t - 4, R.sea[4]); break;
      case 'straw': p.rect(x0, t - 1, x1 - x0 + 1, 2, R.sand[3]); p.hline(x0 - 2, x1 + 2, t + 1, R.sand[4]); p.hline(x0, x1, t, R.ember[2]); break;
      case 'hood': p.rect(x0 - 1, t - 1, x1 - x0 + 3, 4, R.violet[2]); p.hline(x0 - 1, x1 + 1, t - 1, R.violet[3]); if (dir === 'up') p.rect(x0, t + 2, x1 - x0 + 1, 4, R.violet[1]); break;
      case 'pith': p.ellipse(cx + 0.5, t, (x1 - x0) / 2, 2.5, (x, y) => (y > t ? null : R.sand[4])); p.hline(x0 - 2, x1 + 2, t + 1, R.sand[3]); p.hline(x0, x1, t, R.brown[2]); break;
      case 'diving': p.ellipse(cx + 0.5, t + 3, 6, 6, (x, y, nx, ny, d) => (d > 0.6 ? R.gold[3] : null)); if (dir !== 'up') p.ellipse(cx + 0.5, t + 3, 3, 3, (x, y, nx, ny, d) => (d > 0.7 ? R.gold[2] : null)); p.rect(cx - 1, t - 4, 3, 2, R.gold[2]); break;
      case 'fedora': p.rect(x0 + 1, t - 2, x1 - x0 - 1, 3, R.brown[2]); p.hline(x0 - 2, x1 + 2, t + 1, R.brown[1]); p.hline(x0 + 1, x1 - 1, t, R.ink[2]); p.set(cx, t - 2, R.brown[1]); break;
      case 'laurel': for (let x = x0 - 1; x <= x1 + 1; x++) p.set(x, t + ((x + 1) % 2), (x % 2) ? R.grass[3] : R.gold[3]); break;
      case 'mortar': p.rect(x0, t - 1, x1 - x0 + 1, 2, R.ink[2]); p.hline(x0 - 2, x1 + 2, t - 2, R.ink[3]); p.line(x1 + 2, t - 2, x1 + 2, t + 2, R.gold[3]); break;
      case 'feather': p.rect(x0, t - 1, x1 - x0 + 1, 2, R.ember[2]); p.hline(x0 - 1, x1 + 1, t + 1, R.ember[1]); p.line(x0 + 1, t - 1, x0 - 2, t - 5, W); p.set(x0 - 1, t - 3, R.ice[3]); break;
      case 'wayfarer': p.rect(x0 - 1, t - 1, x1 - x0 + 3, 3, R.teal[2]); p.hline(x0 - 1, x1 + 1, t - 1, R.teal[3]); p.line(x0 - 1, t + 2, x0 - 3, t + 5, R.teal[1]); break;
      case 'wizard': p.poly([[x0 - 1, t + 1], [cx + 2, t - 9], [x1 + 2, t + 1]], R.sea[2]); p.hline(x0 - 2, x1 + 2, t + 1, R.sea[1]); p.set(cx, t - 3, R.gold[4]); p.set(cx + 2, t - 6, W); break;
      case 'tricorn': p.poly([[x0 - 2, t + 1], [cx, t - 3], [x1 + 2, t + 1]], R.ink[2]); p.hline(x0 - 2, x1 + 2, t + 1, R.gold[3]); p.set(cx, t - 1, R.gold[4]); break;
      case 'moon': for (const [dx, h] of [[-3, 2], [-1, 3], [1, 4], [3, 2]]) p.vline(cx + dx, t - h, t, R.ice[4]); p.hline(x0, x1, t + 1, R.violet[3]); p.set(cx + 1, t - 4, R.violet[4]); break;
      default: p.hline(x0, x1, t, R.gold[3]);
    }
  };
}
const HATS = {
  cos_d_craft: 'cap', cos_d_bars: 'bandana', cos_d_gear: 'goggles', cos_d_dishes: 'chef', cos_d_tonics: 'witch', cos_d_build: 'hardhat',
  cos_d_temper: 'horned', cos_d_ballast: 'sailor', cos_d_parts: 'propeller', cos_d_plots: 'straw', cos_d_shrines: 'hood', cos_d_vaults: 'pith',
  cos_d_trench: 'diving', cos_d_relics: 'fedora', cos_d_legend: 'laurel', cos_d_archive: 'mortar', cos_d_quests: 'feather', cos_d_walk: 'wayfarer',
  cos_d_warp: 'wizard', cos_d_kingtide: 'tricorn', moon_shard_crown: 'moon',
};

// ------------------------------------------------------------------ hook in hand / weapon on back

function handOf(a, dir, anim, i) {
  const swing = anim.startsWith('swing');
  const roll = anim.startsWith('roll');
  if (roll) return null;
  const hy = a.shirtBot - 1;
  if (dir === 'side') return { x: a.sx1 + 1 + (swing ? i - 1 : 0), y: hy - (swing ? [3, 1, -1][i] : 0) };
  if (dir === 'down') return { x: a.sx1 + 1, y: hy - (swing ? [3, 1, -1][i] : 0) };
  return { x: a.sx0 - 2, y: hy - 1, behind: true };
}
function hookPart(metal, gem) {
  return (p, a, dir, anim, i) => {
    const h = handOf(a, dir, anim, i);
    if (!h) return;
    const up = anim.startsWith('swing') ? [0.9, 0, -0.9][i] : 0;
    const len = 5;
    const ex = h.x + Math.round(Math.sin(up) * len), ey = h.y - Math.round(Math.cos(up) * len);
    const put = (x, y, c) => { if (!h.behind || !isBody(a, x, y)) p.set(x, y, c); };
    // handle
    for (let k = 0; k <= len; k++) put(Math.round(h.x + (ex - h.x) * (k / len)), Math.round(h.y + (ey - h.y) * (k / len)), R.brown[k % 2 ? 2 : 3]);
    // head
    put(ex, ey, metal[3]); put(ex + 1, ey, metal[3]); put(ex + 2, ey + 1, metal[2]); put(ex - 1, ey, metal[4]); put(ex + 2, ey + 2, metal[1]);
    if (gem) put(ex, ey - 1, gem);
  };
}
function weaponPart(type, t) {
  const { m, gem } = TIER_METAL[t];
  return (p, a, dir, anim) => {
    if (anim.startsWith('roll')) return;
    const put = (x, y, c) => { if (dir === 'up' || !isBody(a, x, y)) p.set(x, y, c); };
    const x0 = a.sx0, y0 = a.shirtBot, x1 = a.sx1 + 1, y1 = a.headTop - 1;
    const pts = [];
    const n = 12;
    for (let k = 0; k <= n; k++) pts.push([Math.round(x0 + (x1 - x0) * (k / n)), Math.round(y0 + (y1 - y0) * (k / n))]);
    pts.forEach(([x, y], k) => {
      let c;
      if (type === 'blade') c = k < 3 ? R.brown[2] : k === 3 ? R.gold[3] : k > n - 1 ? m[4] : m[3];
      else if (type === 'bow') c = k % 3 === 0 ? (t <= 2 ? R.brown[3] : m[3]) : t <= 2 ? R.brown[2] : m[2];
      else c = k > n - 2 ? gem[4] : R.brown[k % 2 ? 2 : 3];
      put(x, y, c);
    });
    if (type === 'staff') { put(x1, y1 - 1, gem[3]); put(x1 + 1, y1, gem[2]); }
    if (type === 'bow') { put(x0 - 1, y0 - 2, R.stone[4]); }
  };
}

// ------------------------------------------------------------------ export

const out = {};
out['pl.body'] = { ...BODY, anims: ANIMS };
for (const [id, fn] of Object.entries(OUTFITS)) out['pl.outfit.' + id] = part(fn);
for (const [id, kind] of Object.entries(HATS)) out['pl.hat.' + id] = part(hatShape(kind));
for (let t = 1; t <= 7; t++) {
  const { m, gem } = TIER_METAL[t];
  const def = part(hookPart(m, t >= 4 ? gem[4] : null));
  out['pl.hook.' + t] = def;
  out['pl.hook.hook_' + t] = { ref: 'pl.hook.' + t };
  for (const type of ['blade', 'bow', 'staff']) out[`pl.weapon.${type}.${t}`] = part(weaponPart(type, t));
}
const HOOK_SKINS = { cos_d_nodes: R.gold, cos_d_wood: R.brown, cos_d_stone: R.stone, cos_d_ore: R.ember, cos_d_plants: R.grass, cos_d_tidal: R.sea, cos_d_caches: R.gold, cos_d_gems: R.violet, cos_d_crops: R.grass, cos_d_fish: R.teal };
for (const [id, ramp] of Object.entries(HOOK_SKINS)) out['pl.hook.' + id] = part(hookPart(ramp, id === 'cos_d_gems' || id === 'cos_d_caches' ? W : null));

export const PLAYER_ANIMS = Object.keys(ANIMS);
export { analyse, hatShape, ANIMS, BODY };
export default out;
