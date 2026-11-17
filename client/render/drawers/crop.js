// WP9 crop drawer (type `crop`, public keys st = stage (-1 withered), w = watered). Uses WP3's 'crop.<id>' frames
// (one per growth stage) when present, else a procedural sprout -> plant -> fruit drawing. Ripe crops bob and
// glint; a stage-up pops (squash); watered crops show a dark wet ring; withered crops turn brown and droop.

import { PAL, RAMPS } from '../../art/palette.js';

const FRUIT = {
  tidewheat: RAMPS.gold, marrowberry: RAMPS.violet, mudroot: RAMPS.brown, saltbloom: RAMPS.ice, scorchpepper: RAMPS.ember,
  cindercap: RAMPS.ember, sunmelon: RAMPS.gold, glassgourd: RAMPS.teal, snowberry: RAMPS.ice, pinecone_pale: RAMPS.sand,
  inkcap: RAMPS.ink, moonpetal: RAMPS.violet,
};
const col = (ramp, i) => PAL[ramp[Math.max(0, Math.min(4, i))]];
const pops = new Map();       // entity id -> { st, t } (cleared when it grows large)

function frameFor(e, stages) {
  if (e.st < 0) return stages - 1;
  if (e.st >= stages) return stages - 1;
  return Math.min(stages - 2, Math.max(e.st > 0 ? 1 : 0, Math.floor((e.st * (stages - 1)) / stages)));
}

function procedural(ctx, e, sx, sy, stages, time) {
  const ripe = e.st >= stages, dead = e.st < 0;
  const k = dead ? 0.7 : Math.min(1, (Math.max(0, e.st) + 1) / (stages + 1));
  const leaf = dead ? RAMPS.brown : RAMPS.grass;
  const h = Math.round(3 + 9 * k);
  const sway = dead ? 2 : Math.round(Math.sin(time * 1.6 + e.i) * (k > 0.5 ? 1 : 0));
  ctx.fillStyle = col(leaf, 1);
  ctx.fillRect(sx, sy - h, 1, h);
  ctx.fillRect(sx + sway, sy - h - 1, 1, 2);
  // leaves
  for (let i = 0; i < Math.min(4, 1 + Math.floor(k * 4)); i++) {
    const ly = sy - 2 - i * 3;
    const side = i % 2 ? 1 : -1;
    ctx.fillStyle = col(leaf, 2 + (i % 2));
    ctx.fillRect(sx + side * 1 + (side < 0 ? -2 : 0) + (dead ? side : 0), ly, 3, 1);
    ctx.fillRect(sx + side * 3 + (side < 0 ? -1 : 0), ly - 1 + (dead ? 2 : 0), 1, 1);
  }
  if (ripe || k > 0.75) {
    const fr = FRUIT[e.k] ?? RAMPS.ember;
    const fy = sy - h - 1;
    ctx.fillStyle = col(fr, ripe ? 3 : 1);
    ctx.fillRect(sx - 2 + sway, fy, 2, 2);
    ctx.fillRect(sx + 1 + sway, fy + 2, 2, 2);
    if (ripe) { ctx.fillStyle = col(fr, 4); ctx.fillRect(sx - 2 + sway, fy, 1, 1); ctx.fillRect(sx + 1 + sway, fy + 2, 1, 1); }
  }
}

export default {
  kinds: [],
  types: ['crop'],
  update(e, dt) {
    const p = pops.get(e.i);
    if (!p) { if (pops.size > 4000) pops.clear(); pops.set(e.i, { st: e.st, t: 1 }); return; }
    if (p.st !== e.st) { p.st = e.st; p.t = 0; }
    p.t = Math.min(1, p.t + dt * 4);
  },
  draw(ctx, e, time, view) {
    const def = view.content.crops.byId[e.k];
    const stages = def?.stages ?? 4;
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y) + 6;
    const ripe = e.st >= stages, dead = e.st < 0;
    // wet soil ring
    if (e.w) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PAL[RAMPS.sea[0]];
      ctx.fillRect(sx - 6, sy - 2, 12, 3);
      ctx.fillRect(sx - 4, sy - 3, 8, 5);
      ctx.globalAlpha = 1;
    }
    const p = pops.get(e.i);
    const pop = p && p.t < 1 ? Math.sin(p.t * Math.PI) * 0.35 : 0;
    const bob = ripe ? Math.round(Math.sin(time * 3 + e.i) * 1) : 0;
    const id = 'crop.' + e.k;
    if (view.sprites.has(id)) {
      view.sprites.draw(ctx, id, sx, sy + 1 + bob, {
        frame: frameFor(e, stages), scaleX: 1 - pop * 0.5, scaleY: 1 + pop,
        alpha: dead ? 0.75 : 1, silhouette: dead ? '#6b4a2c' : undefined,
      });
    } else {
      ctx.save();
      ctx.translate(sx, sy + bob);
      ctx.scale(1 - pop * 0.5, 1 + pop);
      procedural(ctx, e, 0, 0, stages, time);
      ctx.restore();
    }
    if (ripe && !dead) {
      // a slow glint so ripe crops read at a glance
      const ph = (time * 0.8 + e.i * 0.37) % 1;
      if (ph < 0.18) {
        const a = 1 - ph / 0.18;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx + 3, sy - 13, 1, 3); ctx.fillRect(sx + 2, sy - 12, 3, 1);
        ctx.globalAlpha = 1;
      }
    }
  },
};
