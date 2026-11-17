// WP4 gathering: Tidehook swings vs nodes and the hitNode service (DESIGN 4.5, 5.2, 19; TECH_SPEC 5.5).
// Gather hit = hookPower * (1 + gatherPower); hook tier below the node tier -> x0.1 damage and no drops (grey clink).
// Drops: floor(base * yieldMult + rand) with yieldAll + class yield capped at x3 total, big nodes x3, weather and
// tide-turn bonuses; special drops for tide caches, gem nodes and vault crystals. XP goes to the player who broke it.

import { REACH } from '../../../shared/config.js';
import { BIOME_TIER } from '../../../shared/grid.js';
import { rollTable, yieldMult, cacheGlint } from '../../../shared/rules/loot.js';
import { TOO_TOUGH_DAMAGE, BIG_NODE_MULT } from '../../../shared/rules/constants.js';
import { toolFor, effectsOf, edgeDist } from './inventory.js';

const BASE_SWING_RATE = 2.0;        // swings per second (DESIGN 5.1)
const SWING_ANIM_S = 0.22;
const CD_TOLERANCE = 0.06;          // one tick of network jitter
const CLS_YIELD = { wood: 'yieldWood', stone: 'yieldStone', ore: 'yieldOre', plant: 'yieldPlant', tidal: 'yieldTidal' };
const CLS_WORLD = { wood: 'yieldWoodWorld', stone: 'yieldStoneWorld' };

export function nodeTier(game, node) {
  const t = Number(node?.data?.tier);
  if (Number.isFinite(t) && t > 0) return t;
  const def = game.content.nodes.byId[node?.kind];
  if (Number.isFinite(def?.tier)) return def.tier;
  const f = game.call('featureAt', node.realm, node.x, node.y);
  return BIOME_TIER[f?.biome] ?? 1;
}

export function hookOf(game, player) {
  const d = toolFor(game, player, 'hook', 'hook_1');
  return { id: d?.id ?? 'hook_1', power: d?.gear?.power ?? 1, maxNode: d?.gear?.maxNode ?? d?.gear?.tier ?? 1 };
}

// Rolled drops of a broken node (no spawning).
function rollDrops(game, node, def, tier, opts) {
  const rng = game.rng;
  const rand = () => rng.float(0, 1);
  const player = opts.player ?? null;
  let bonus = 0, luck = 0;
  const cls = def?.cls;
  if (player) {
    const s = game.stats.of(player);
    luck = (s.luck ?? 0) + (s.luckWorld ?? 0);
    bonus = (s[CLS_YIELD[cls]] ?? 0) + (s[CLS_WORLD[cls]] ?? 0);
    for (const e of effectsOf(game, player)) if (e.id === 'hook_yield') bonus += e.v ?? 0;
    if (cls === 'tidal') for (const e of effectsOf(game, player)) if (e.id === 'low_tide_yield') bonus += (e.mult ?? 1) - 1;
    bonus = yieldMult(s.yieldAll ?? 0, bonus);
  } else bonus = 1;
  let mult = bonus * (opts.yieldMult ?? 1) * (node.pub?.big ? BIG_NODE_MULT : 1);
  const ti = game.call('timeInfo') || {};
  const w = game.content.weather.byId?.[ti.weather];
  const wy = w?.params?.nodeYield?.[node.kind];
  if (wy) mult *= 1 + wy;
  if (cls === 'tidal' && ti.turning) mult *= 2;          // A.9 tide-turn gamble
  const out = rollTable(def?.drops ?? [], { rand, mult, luck });
  const mats = game.content.modules.items?.TIER_MATS;
  const tierMats = mats?.[Math.min(6, tier)];
  if (def?.glintPerTier) {
    // WP14 (BUILD_REVIEW P1-12): a cache that carries its own amount pays exactly that (first tide cache = 15 G).
    const g = Number.isFinite(node.data?.glint) ? node.data.glint : cacheGlint(tier, rand);
    if (g > 0) game.call('addGlint', g, 'tide_cache', player);
    game.fx(node.realm, 'glint_burst', node.x, node.y, { amount: g });
  }
  if (def?.rawOfTier && tierMats) {
    const kinds = ['wood', 'stone', 'ore', 'fiber'];
    out.push({ item: tierMats[kinds[rng.int(0, kinds.length - 1)]], qty: def.rawOfTier });
  }
  if (def?.tokenChance && rand() < def.tokenChance) out.push({ item: 'tide_token', qty: 1 });
  if (def?.rareOfTier) {
    const gem = game.content.modules.nodes?.GEM_RARE?.[Math.min(6, tier)];
    if (def.cls === 'gem' && def.id === 'gem_node') { if (gem) out.push({ item: gem, qty: Math.max(1, Math.round(mult)) }); }
    else if (tierMats && rand() < def.rareOfTier) out.push({ item: tierMats.rare, qty: 1 });
  }
  if (def?.oreOfTier && tierMats) {
    const [a, b] = def.oreOfTier;
    out.push({ item: tierMats.ore, qty: Math.max(1, Math.floor((a + rng.int(0, b - a)) * mult)) });
  }
  // WP14 (BUILD_REVIEW P2-11): loot code fires 'drop' itself, so Jackpot / Golden Tide apply to every node stack.
  if (player && game.procs?.fire) {
    game.procs.dropHooked = true;
    for (const d of out) { const ctx = { item: d.item, qty: d.qty, source: 'node' }; game.procs.fire('drop', player, ctx); d.qty = Math.max(0, Math.round(ctx.qty)); }
  }
  return out.filter((d) => d.qty > 0 && game.content.items.byId[d.item]);
}

// Spawn drops as small stacks that burst outward (juice: "drops burst outward in arcs then magnet after 0.25 s").
export function burstDrops(game, realm, x, y, drops, opts = {}) {
  const rng = game.rng;
  for (const { item, qty } of drops) {
    const pieces = Math.min(qty, opts.maxPieces ?? 4);
    let left = qty;
    for (let i = 0; i < pieces; i++) {
      const n = i === pieces - 1 ? left : Math.max(1, Math.floor(qty / pieces));
      left -= n;
      const a = (opts.dir ?? rng.float(0, Math.PI * 2)) + rng.float(-1.3, 1.3);
      const sp = rng.float(2.2, 4.2);
      game.call('dropItem', realm, x + Math.cos(a) * 0.15, y + Math.sin(a) * 0.15, item, n,
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, quiet: i > 0, owner: opts.owner ?? 0 });
    }
  }
}

function nodeXp(game, def, tier) {
  if (Number.isFinite(def?.xp) && def.xp > 0) return def.xp;
  return (def?.xpPerTier ?? 1) * tier;
}

export default {
  name: 'gathering',

  init(game) {
    game.services.register('hitNode', (node, dmg, opts = {}) => {
      const none = { broken: false, drops: [] };
      if (!node || node.removed || node.type !== 'node' || !(dmg >= 0)) return none;
      if (node.data?.tapped && !opts.byMachine) return none;          // tapped trees are not cut (P1-12)
      const realm = game.realms.get(node.realm);
      if (!realm) return none;
      const def = game.content.nodes.byId[node.kind];
      const tier = nodeTier(game, node);
      const player = opts.player ?? null;
      let tooWeak = false;
      if (player && !opts.ignoreTier && !opts.byMachine) {
        const hook = hookOf(game, player);
        if (hook.maxNode < tier) tooWeak = true;
      }
      if (!node.maxHp) node.maxHp = Math.max(1, node.hp);
      if (def?.hits) dmg = Math.max(dmg, node.maxHp / def.hits + 1e-6);   // plants break in a fixed number of hits
      if (tooWeak) dmg *= TOO_TOUGH_DAMAGE;
      node.hp = Math.max(0, node.hp - dmg);
      game.bus.emit('node.hit', { player, node, dmg });
      const dir = opts.dir;
      if (node.hp > 1e-6) {
        game.fx(realm, tooWeak ? 'hit_clink' : (def?.fx?.hit ?? 'hit_wood'), node.x, node.y, dir != null ? { dir: +dir.toFixed(2) } : undefined);
        return { broken: false, drops: [], tooWeak };
      }
      const drops = tooWeak ? [] : rollDrops(game, node, def, tier, opts);
      realm.remove(node);
      const collect = opts.collect ?? !!opts.byMachine;
      if (!collect && drops.length) burstDrops(game, realm, node.x, node.y, drops, { dir });
      game.fx(realm, def?.fx?.brk ?? 'break_wood', node.x, node.y, dir != null ? { dir: +dir.toFixed(2) } : undefined);
      if (player && !tooWeak) game.call('grantXp', player, nodeXp(game, def, tier), 'gather');
      // WP14 (P1-4): working a tidal node during a king tide counts once per king tide per player.
      if (player && def?.cls === 'tidal') {
        const ti = game.call('timeInfo') || {};
        const day = game.world?.day ?? 0;
        if (ti.kingTide && player._kingTideDay !== day) { player._kingTideDay = day; game.call('counter', player, 'king_tides_worked', 1); }
      }
      game.bus.emit('node.broken', {
        player, node, kind: node.kind, tier, x: node.x, y: node.y, byMachine: !!opts.byMachine,
      });
      return { broken: true, drops, tooWeak };
    });
  },

  tick(game) {
    for (const p of game.players.values()) {
      if (p._swingAnimUntil && p._swingAnimUntil <= game.now) {
        p._swingAnimUntil = 0;
        if (p.entity?.pub.a === 'swing') p.entity.set('a', 'idle');
      }
    }
  },

  handlers: {
    'gather.swing': (game, player, d) => {
      const pe = player.entity;
      const realm = game.realms.get(pe.realm);
      if (!realm) return { ok: false, err: 'invalid' };
      let node = Number.isInteger(d.id) ? realm.entities.get(d.id) : null;
      if (!node && Number.isInteger(d.tx) && Number.isInteger(d.ty)) node = realm.entityAtTile(d.tx, d.ty, 'node');
      if (!node || node.type !== 'node' || node.removed) return { ok: false, err: 'invalid' };
      if (edgeDist(node, pe.x, pe.y) > REACH + 0.6) return { ok: false, err: 'range' };
      // WP14 (BUILD_REVIEW P1-12): a tree with a Sap Tap on it cannot be cut.
      if (node.data?.tapped) return { ok: false, err: 'locked' };
      const s = game.stats.of(player);
      const interval = 1 / (BASE_SWING_RATE * (1 + (s.swingSpeed ?? 0)));
      if ((player.nextSwing ?? 0) > game.now + CD_TOLERANCE) return { ok: false, err: 'cooldown' };
      player.nextSwing = Math.max(game.now, player.nextSwing ?? 0) + interval;
      const dx = node.x - pe.x, dy = node.y - pe.y;
      const dir = Math.atan2(dy, dx);
      pe.facing = ((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8;
      pe.set('a', 'swing');
      pe.set('at', (pe.pub.at + 37) & 255);
      player._swingAnimUntil = game.now + SWING_ANIM_S;
      game.fx(realm, 'swing_arc', pe.x, pe.y, { dir: +dir.toFixed(2), own: player.id });
      const hook = hookOf(game, player);
      const dmg = hook.power * (1 + (s.gatherPower ?? 0));
      const res = game.call('hitNode', node, dmg, { player, dir });
      return { ok: true, d: { broken: !!res?.broken, weak: !!res?.tooWeak } };
    },
  },
};
