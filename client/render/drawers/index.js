// Drawer registry and dispatch (TECH_SPEC 8.1): a drawer whose `kinds` contains e.k wins, else the one whose
// `types` contains e.ty, else a generic placeholder drawer. Frozen after WP1: owners edit only their drawer file.
//
// Drawer: { kinds: [], types: [], draw(ctx, e, time, view), bounds?(e), update?(e, dt, view) }
//   e: store entity + render position e.rx, e.ry (tiles); e.isSelf for the local player.
//   view: { x, y, w, h (source px), time, sprites (SpriteBank), juice, particles, store, content }

import player from './player.js';
import node from './node.js';
import drop from './drop.js';
import structure from './structure.js';
import mob from './mob.js';
import boss from './boss.js';
import projectile from './projectile.js';
import zone from './zone.js';
import chest from './chest.js';
import summon from './summon.js';
import machine from './machine.js';
import sluice from './sluice.js';
import scuttler from './scuttler.js';
import gull from './gull.js';
import crop from './crop.js';
import bobber from './bobber.js';
import dungeon from './dungeon.js';
import npc from './npc.js';

export const DRAWERS = Object.freeze([
  player, node, drop, structure, mob, boss, projectile, zone, chest, summon,
  machine, sluice, scuttler, gull, crop, bobber, dungeon, npc,
]);

const byKind = new Map();
const byType = new Map();
for (const d of DRAWERS) {
  for (const k of d.kinds || []) byKind.set(k, d);
  for (const t of d.types || []) if (!byType.has(t)) byType.set(t, d);
}

const generic = {
  kinds: [], types: [],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    view.sprites.drawShadow(ctx, sx, sy, 10);
    view.sprites.draw(ctx, `${e.ty}.${e.k}`, sx, sy + 2, { time });
  },
};

export function drawerFor(e) {
  return byKind.get(e.k) || byType.get(e.ty) || generic;
}
