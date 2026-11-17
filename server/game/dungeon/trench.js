// WP10 The Trench (DESIGN 13.3): endless single-arena floors. Enemy stats scale 1.12^floor from tier-3
// baselines (every enemy is normalised to the tier-3 average, so the whole bestiary appears); every 5th floor
// is a Keeper remix; a blessing altar every 3 floors. Each cleared floor pays Glint, a chance of a relic
// fragment and one rare of tier min(party tier, 3 + floor(floor / 8)); floors 10, 20, 30... also give 5
// moonpetal seeds, and the first clear of floors 10/20/30/40 gives that Trench trinket.

import { createRng, hashString } from '../../../shared/rng.js';
import { T } from '../../../shared/grid.js';
import { trenchScale, trenchRareTier } from '../../../shared/rules/scaling.js';
import { TRENCH } from '../../../shared/data/dungeons.js';
import { TRENCH_TRINKETS } from '../../../shared/data/items.js';

export const ARENA_W = 34, ARENA_H = 26;
export const KEEPER_CYCLE = Object.freeze(['sporeking', 'barnacle_bell', 'bellows_engine', 'twin_lenses', 'thawless_knight', 'scribe']);
const STATIC_AI = new Set(['turret_lobber', 'support_shield']);

export function tierAverages(game) {
  if (game._trenchAvg) return game._trenchAvg;
  const acc = {};
  for (const e of game.content.enemies) {
    const a = (acc[e.tier] ||= { hp: 0, dmg: 0, xp: 0, n: 0 });
    a.hp += e.hp; a.dmg += e.dmg || 0; a.xp += e.xp; a.n++;
  }
  for (const t in acc) { acc[t].hp /= acc[t].n; acc[t].dmg /= acc[t].n; acc[t].xp /= acc[t].n; }
  game._trenchAvg = acc;
  return acc;
}

// HP/damage/XP multipliers that bring enemy `def` to the tier-3 baseline scaled by 1.12^floor.
export function trenchMults(game, def, floor) {
  const avg = tierAverages(game);
  const base = avg[3], own = avg[def.tier] ?? base;
  const s = trenchScale(floor);
  return {
    hpMult: (base.hp / own.hp) * s,
    dmgMult: (base.dmg / Math.max(1, own.dmg)) * s,
    xpMult: (base.xp / own.xp) * s,
  };
}

export function keeperFor(floor) { return KEEPER_CYCLE[(Math.floor(floor / 5) - 1 + KEEPER_CYCLE.length) % KEEPER_CYCLE.length]; }
export const isKeeperFloor = (floor) => floor > 0 && floor % (TRENCH.keeperEvery ?? 5) === 0;
export const hasBlessing = (floor) => floor > 0 && floor % (TRENCH.blessingEvery ?? 3) === 0;

// Keeper remix: stats normalised to the Bellows Engine (Keeper 3) and scaled by 1.12^floor.
export function keeperMults(game, id, floor) {
  const def = game.content.bosses.byId[id];
  const ref = game.content.bosses.byId.bellows_engine;
  const s = trenchScale(floor);
  const count = def.count ?? 1;
  return { hpMult: (ref.hp / (def.hp * count)) * s * 0.6, dmgMult: (ref.dmg / def.dmg) * s * 0.75 };
}

export function arenaLayout(seed, floor) {
  const rng = createRng((seed ^ hashString('trench:' + floor)) >>> 0);
  const w = ARENA_W + 2, h = ARENA_H + 2;
  const ground = new Uint8Array(w * h).fill(T.DUNGEON_WALL);
  for (let y = 1; y <= ARENA_H; y++) for (let x = 1; x <= ARENA_W; x++) ground[y * w + x] = T.DUNGEON_FLOOR;
  // pillars and hazards that never touch the centre cross
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const variant = Math.floor(rng.next() * 4);
  const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
  const put = (x, y, g) => { if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) ground[y * w + x] = g; };
  if (variant === 0) quad((sx, sy) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put(cx + sx * (7 + i), cy + sy * (5 + j), T.DUNGEON_WALL); });
  else if (variant === 1) quad((sx, sy) => { for (let i = 4; i < 10; i++) put(cx + sx * i, cy + sy * 7, T.DUNGEON_WALL); });
  else if (variant === 2) quad((sx, sy) => { for (let i = 5; i < 9; i++) for (let j = 4; j < 7; j++) put(cx + sx * i, cy + sy * j, T.INK); });
  else quad((sx, sy) => { put(cx + sx * 5, cy + sy * 4, T.DUNGEON_WALL); put(cx + sx * 11, cy + sy * 8, T.DUNGEON_WALL); put(cx + sx * 11, cy + sy * 3, T.DUNGEON_WALL); });
  return { w, h, ground, cx: w / 2, cy: h / 2, start: { x: w / 2, y: h - 3.5 } };
}

// Enemy roster for a floor: everything that can walk (turrets excluded at first), more and tougher deeper.
export function floorWaves(game, floor, partySize, rng) {
  const pool = game.content.enemies.filter((e) => floor > 6 || !STATIC_AI.has(e.ai));
  const waves = floor >= 10 ? 3 : 2;
  const per = Math.min(14, 4 + Math.floor(floor / 2) + Math.max(0, partySize - 1));
  const out = [];
  for (let w = 0; w < waves; w++) {
    const list = [];
    // each wave draws from 2-3 kinds so packs read as a theme
    const kinds = [];
    for (let i = 0; i < 3; i++) kinds.push(pool[Math.floor(rng.next() * pool.length)].id);
    for (let i = 0; i < per; i++) list.push(kinds[i % kinds.length]);
    out.push(list);
  }
  return out;
}

export function floorRewards(game, floor, partyTier, rng) {
  const tier = trenchRareTier(partyTier, floor);
  const rare = game.content.items.find((i) => i.kind === 'rare' && i.tier === tier)?.id ?? null;
  const out = { glint: Math.round(20 * floor * (1 + floor / 10)), items: [] };
  if (rare) out.items.push({ item: rare, qty: 1 });
  if (rng.next() < 0.25 + Math.min(0.25, floor * 0.01)) out.items.push({ item: 'relic_fragment', qty: 1 });
  if (floor % (TRENCH.moonpetalSeeds?.every ?? 10) === 0) out.items.push({ item: TRENCH.moonpetalSeeds?.item ?? 'seed_moonpetal', qty: TRENCH.moonpetalSeeds?.qty ?? 5 });
  out.trinket = TRENCH_TRINKETS[floor] ?? null;
  return out;
}

export default { arenaLayout, floorWaves, floorRewards, trenchMults, keeperMults, keeperFor, isKeeperFloor, hasBlessing, tierAverages, KEEPER_CYCLE };
