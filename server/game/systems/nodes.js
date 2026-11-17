// Nodes (WP7): spawning with tiers and big variants, per-plot respawn (6 s, co-op and world-sheet scaled, paused on an
// empty server), gem nodes (3% of natural spawns, 6% on a plot a Prospector stands on), tidal nodes on the flats at low
// tide (1 per 10 s per plot, cap 8, vanish when the tide returns), the guaranteed 15-Glint first tide cache, and the
// special rewards of tier:'biome' nodes (tide caches, gem nodes) which have no static drop table (DESIGN 4.5, 4.6, A.9).
//
// Services: spawnNode, respawnNodes, nodesInRadius (TECH_SPEC 5.5); extras spawnNodeNatural, nodeTier.

import { PLOT } from '../../../shared/config.js';
import { T, FLAG, BIOMES, BIOME_TIER, plotIndex, plotOfTile, inPlotBounds, biomeOf } from '../../../shared/grid.js';
import { createEntity } from '../entities.js';
import { classWeights, nodeCapOf, clearOfStructures, ensureStamped } from '../worldgen/features.js';
import { kingRing } from './clock.js';
import { style as gmStyle } from '../worldgen/populate-greenmarrow.js';
import { style as sfStyle } from '../worldgen/populate-saltfen.js';
import { style as erStyle } from '../worldgen/populate-emberreach.js';
import { style as gwStyle } from '../worldgen/populate-glasswaste.js';
import { style as hfStyle } from '../worldgen/populate-hoarfrost.js';
import { style as umStyle } from '../worldgen/populate-umbral.js';

const STYLES = { greenmarrow: gmStyle, saltfen: sfStyle, emberreach: erStyle, glasswaste: gwStyle, hoarfrost: hfStyle, umbral: umStyle };
const NODE_HP = { 1: 3, 2: 7, 3: 16, 4: 36, 5: 80, 6: 176 };
const GEM_RARE_FALLBACK = { 1: 'glintstone', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' };

// Per-game state (several Game instances may live in one process, e.g. in tests).
const GAMES = new WeakMap();
const N = (game) => GAMES.get(game);

const realmOf = (game, r) => (typeof r === 'string' ? game.realms.get(r) : r);

export function tierAtTile(game, realm, tx, ty) {
  if (realm?.kind !== 'overworld') return realm?.tier ?? 1;
  const { px, py } = plotOfTile(tx, ty);
  return inPlotBounds(px, py) ? BIOME_TIER[biomeOf(px, py)] ?? 1 : 1;
}

function plotAt(game, tx, ty) {
  const { px, py } = plotOfTile(tx, ty);
  return inPlotBounds(px, py) ? game.world.plots[plotIndex(px, py)] : null;
}

// ---------------------------------------------------------------- spawning

export function spawnNode(game, realm, kind, tx, ty, opts = {}) {
  const { R } = N(game);
  realm = realmOf(game, realm);
  const def = game.content.nodes.byId[kind];
  if (!def || !realm || !realm.inBounds(tx, ty)) return null;
  if (!realm.isWalkable(tx, ty) || realm.entityAtTile(tx, ty)) return null;
  const tier = Number.isFinite(def.tier) ? def.tier : (opts.tier ?? tierAtTile(game, realm, tx, ty));
  let hp = def.hp ?? (NODE_HP[tier] ?? 3) * (def.hpMult ?? 1);
  const big = !opts.noBig && (def.big ?? 0) > 0 && R.chance(def.big) ? 1 : 0;
  if (big) hp *= 3;
  const { px, py } = plotOfTile(tx, ty);
  const data = { tx, ty, tier, plot: inPlotBounds(px, py) ? plotIndex(px, py) : -1, ...(opts.data || {}) };
  if (def.cls === 'tidal') data.tidal = true;
  if (kind === 'tide_cache' && data.glint == null) {
    const [a, b] = def.glintPerTier ?? [5, 15];
    data.glint = R.int(a, b) * tier;
  }
  const e = createEntity(game, {
    type: 'node', kind, x: tx + 0.5, y: ty + 0.5, hp, radius: 0.45,
    data, pub: { v: R.int(0, 3), big },
  });
  realm.add(e);
  return e;
}

function gemChance(game, plot) {
  const { K } = N(game);
  let c = K.gem;
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== 'overworld') continue;
    const pl = plotAt(game, Math.floor(e.x), Math.floor(e.y));
    if (pl !== plot) continue;
    if (p.selfState?.class?.id === 'prospector' || game.stats.hasFlag(p, 'gem_spawn_boost')) c = Math.max(c, K.gemProspector);
  }
  return c;
}

// A natural (generation or respawn) spawn: 3% of them become gem nodes.
function spawnNatural(game, realm, plot, kind, tx, ty, rng = N(game).R) {
  if (plot && rng.chance(gemChance(game, plot))) kind = 'gem_node';
  return spawnNode(game, realm, kind, tx, ty);
}

const spawnableGround = (g) => g >= T.GREENMARROW && g <= T.UMBRAL;

function tileFree(game, realm, tx, ty) {
  if (!spawnableGround(realm.groundAt(tx, ty)) || !realm.isWalkable(tx, ty)) return false;
  if (realm.hasFlag(tx, ty, FLAG.NO_SPAWN) || !clearOfStructures(realm, tx, ty)) return false;
  const near = realm.query(tx + 0.5, ty + 0.5, 1.6);
  for (const e of near) {
    if (e.type === 'structure') return false;
    if ((e.type === 'node' || e.type === 'crop') && Math.floor(e.x) === tx && Math.floor(e.y) === ty) return false;
    if (e.type === 'player' && Math.abs(e.x - tx - 0.5) < 1.5 && Math.abs(e.y - ty - 0.5) < 1.5) return false;
  }
  return !realm.entityAtTile(tx, ty);
}

function plotNodes(realm, plot, filter) {
  const cx = plot.px * PLOT + PLOT / 2, cy = plot.py * PLOT + PLOT / 2;
  const x0 = plot.px * PLOT, y0 = plot.py * PLOT;
  return realm.query(cx, cy, PLOT * 0.75, [], (e) => e.type === 'node' && e.x >= x0 && e.y >= y0 && e.x < x0 + PLOT && e.y < y0 + PLOT && filter(e));
}

function biomeTable(game, plot) {
  const b = game.content.biomes.byId[plot.biome];
  const w = classWeights(game, plot);
  return (b?.nodeTable ?? []).map((id) => game.content.nodes.byId[id]).filter(Boolean)
    .map((def) => ({ def, w: (def.weight ?? 1) * (w[def.cls] ?? 1) })).filter((t) => t.w > 0);
}

// Respawn one node on a plot (best of a few random free tiles by the biome's affinity rules).
function respawnOne(game, realm, plot, inRect = null) {
  const { R } = N(game);
  const table = biomeTable(game, plot);
  if (!table.length) return null;
  const def = R.weighted(table, (t) => t.w).def;
  const style = STYLES[plot.biome];
  let best = null, bestS = 0;
  for (let i = 0; i < 10; i++) {
    let tx, ty;
    if (inRect) { tx = R.int(inRect[0], inRect[2]); ty = R.int(inRect[1], inRect[3]); }
    else { tx = plot.px * PLOT + R.int(1, PLOT - 2); ty = plot.py * PLOT + R.int(1, PLOT - 2); }
    if (plotAt(game, tx, ty) !== plot || !tileFree(game, realm, tx, ty)) continue;
    const s = (style?.affinity ? style.affinity(def, tx, ty, realm) : 1) * (0.5 + R.next());
    if (s > bestS) { bestS = s; best = [tx, ty]; }
  }
  return best ? spawnNatural(game, realm, plot, def.id, best[0], best[1]) : null;
}

function respawnNodes(game, realm, x, y, r) {
  realm = realmOf(game, realm);
  if (!realm || realm.kind !== 'overworld') return 0;
  let n = 0;
  const seen = new Set();
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty += 4) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx += 4) {
      const p = plotAt(game, tx, ty);
      if (!p || !p.owned || seen.has(p)) continue;
      seen.add(p);
      let have = plotNodes(realm, p, (e) => !e.data.tidal).length;
      const cap = nodeCapOf(game, p);
      const rect = [Math.max(p.px * PLOT, Math.floor(x - r)), Math.max(p.py * PLOT, Math.floor(y - r)),
        Math.min(p.px * PLOT + PLOT - 1, Math.floor(x + r)), Math.min(p.py * PLOT + PLOT - 1, Math.floor(y + r))];
      for (let tries = 0; tries < cap * 2 && have < cap; tries++) {
        const e = respawnOne(game, realm, p, rect);
        if (e) { have++; n++; }
      }
    }
  }
  return n;
}

function nodesInRadius(game, realm, x, y, r, maxTier = 99) {
  realm = realmOf(game, realm);
  if (!realm) return [];
  return realm.query(x, y, r, [], (e) => e.type === 'node' && !e.data.tidal && (Number(e.data.tier) || 1) <= maxTier);
}

// ---------------------------------------------------------------- tidal nodes

function tidalTilesOf(game, realm, plot) {
  const { st } = N(game);
  const idx = plotIndex(plot.px, plot.py);
  let list = st.tidalTiles.get(idx);
  if (list) return list;
  list = [];
  const x0 = plot.px * PLOT, y0 = plot.py * PLOT;
  for (let y = y0; y < y0 + PLOT; y++) for (let x = x0; x < x0 + PLOT; x++) if (realm.groundAt(x, y) === T.TIDAL) list.push([x, y]);
  for (const [x, y, pi] of kingRing(game)) if (pi === idx) list.push([x, y]);
  st.tidalTiles.set(idx, list);
  return list;
}

function cacheShare(game, plot, king) {
  const { K } = N(game);
  let share = K.cacheShare * (king ? K.kingCacheMult : 1);
  let bonus = 0;
  for (const p of game.players.values()) {
    const e = p.entity;
    if (e?.realm === 'overworld' && plotAt(game, Math.floor(e.x), Math.floor(e.y)) === plot) bonus = Math.max(bonus, game.stats.of(p).cacheChance ?? 0);
  }
  return Math.min(0.9, share + bonus);
}

function spawnTidal(game, realm, plot) {
  const { K, R } = N(game);
  const tiles = tidalTilesOf(game, realm, plot);
  if (!tiles.length) return null;
  const idx = plotIndex(plot.px, plot.py);
  const count = realm.query(plot.px * PLOT + PLOT / 2, plot.py * PLOT + PLOT / 2, PLOT, [], (e) => e.type === 'node' && e.data.tidal && e.data.plot === idx).length;
  if (count >= K.tidalCap) return null;
  const info = game.call('timeInfo');
  const kind = R.chance(cacheShare(game, plot, info.kingTide)) ? 'tide_cache' : (R.chance(0.5) ? 'tide_shellbed' : 'tide_sandbar');
  for (let i = 0; i < 8; i++) {
    const [tx, ty] = tiles[R.int(0, tiles.length - 1)];
    const e = spawnNode(game, realm, kind, tx, ty, { tier: BIOME_TIER[plot.biome], data: { plot: idx } });
    if (e) return e;
  }
  return null;
}

function firstCache(game, realm) {
  const { K, st } = N(game);
  if (st.firstCache) return;
  const sp = game.spawnPoint();
  const start = plotAt(game, Math.floor(sp.x), Math.floor(sp.y));
  if (!start) return;
  // start plot first; if its shore is already built over, the nearest flat of any owned plot
  let tiles = tidalTilesOf(game, realm, start).slice();
  if (!tiles.length) for (const p of game.world.plots) if (p.owned) tiles.push(...tidalTilesOf(game, realm, p));
  tiles.sort((a, b) => Math.hypot(a[0] - sp.x, a[1] - sp.y) - Math.hypot(b[0] - sp.x, b[1] - sp.y));
  for (const [tx, ty] of tiles) {
    const e = spawnNode(game, realm, 'tide_cache', tx, ty, { tier: 1, noBig: true, data: { glint: K.firstCacheGlint, first: true } });
    if (e) { st.firstCache = true; return e; }
  }
  return null;
}

function clearTidal(game, realm) {
  const gone = [];
  for (const e of realm.entities.values()) if (e.type === 'node' && e.data.tidal) gone.push(e);
  for (const e of gone) realm.remove(e);
  return gone.length;
}

// ---------------------------------------------------------------- break feedback
// Drops, Glint, raw-of-tier, tokens, gem rares, weather and tide-turn bonuses of every node (incl. the tier:'biome'
// tidal and gem nodes) are paid by WP4's hitNode (gathering.js). Tide caches spawned here carry data.glint (the first
// one exactly 15); hitNode should pay that value when present (see docs/notes/WP7-WP8.md).
function onBroken(game, { player, node, kind }) {
  if (kind !== 'tide_cache' || !node?.data?.first) return;
  game.toast(player ?? null, 'The first tide cache! Glint for the Treasury.', 'good');
}

// ---------------------------------------------------------------- system

export default {
  name: 'nodes',

  init(game) {
    const R = game.rng.fork('nodes');
    const st = { firstCache: false, acc: new Map(), tidalAcc: new Map(), tidalTiles: new Map() };
    const consts = game.content.modules.biomes?.NODE_RULES ?? {};
    const tidal = game.content.modules.biomes?.CLOCK ?? {};
    const K = {
      respawnS: consts.respawnS ?? 6, tidalEveryS: consts.tidalEveryS ?? 10, tidalCap: consts.tidalCap ?? 8,
      gem: consts.gemChance ?? 0.03, gemProspector: consts.gemChanceProspector ?? 0.06,
      cacheShare: game.content.modules.nodes?.TIDAL_SHARES?.cachePct ?? 0.04, kingCacheMult: 4,
      firstCacheGlint: tidal.firstCacheGlint ?? 15,
      gemRare: game.content.modules.nodes?.GEM_RARE ?? GEM_RARE_FALLBACK,
      rawOfTier: {},
    };
    GAMES.set(game, { K, R, st });
    for (const n of game.content.nodes) {
      if (!Number.isFinite(n.tier) || n.biome === 'vault') continue;
      for (const d of n.drops ?? []) {
        if (d.p != null || String(d.item).startsWith('seed_')) continue;
        (K.rawOfTier[n.tier] ||= []).includes(d.item) || K.rawOfTier[n.tier].push(d.item);
      }
    }
    const svc = game.services;
    svc.register('spawnNode', (realm, kind, tx, ty, opts) => spawnNode(game, realm, kind, tx, ty, opts));
    svc.register('respawnNodes', (realm, x, y, r) => respawnNodes(game, realm, x, y, r));
    svc.register('nodesInRadius', (realm, x, y, r, maxTier) => nodesInRadius(game, realm, x, y, r, maxTier));
    svc.register('spawnNodeNatural', (realm, plot, kind, tx, ty, rng) => spawnNatural(game, realmOf(game, realm), plot, kind, tx, ty, rng));
    svc.register('nodeTier', (realm, tx, ty) => tierAtTile(game, realmOf(game, realm), tx, ty));

    game.bus.on('node.broken', (ev) => onBroken(game, ev));
    game.bus.on('land.raised', () => N(game).st.tidalTiles.clear());
    game.bus.on('tide.change', ({ low }) => {
      const realm = game.realms.get('overworld');
      const { st } = N(game);
      st.tidalTiles.clear();
      st.tidalAcc.clear();
      if (low) firstCache(game, realm);
      else clearTidal(game, realm);
    });
  },

  load(game, data) {
    const { st } = N(game);
    st.firstCache = !!data?.firstCache;
    st.acc.clear(); st.tidalAcc.clear(); st.tidalTiles.clear();
    const realm = game.realms.get('overworld');
    if (!realm) return;
    // restored nodes carry their definition's tier; tier:'biome' nodes need the tier of where they stand
    const low = !!realm.lowTide;
    const stale = [];
    for (const e of realm.entities.values()) {
      if (e.type !== 'node') continue;
      const def = game.content.nodes.byId[e.kind];
      if (!Number.isFinite(Number(e.data.tier)) || !Number.isFinite(def?.tier)) e.data.tier = tierAtTile(game, realm, e.data.tx, e.data.ty);
      const { px, py } = plotOfTile(e.data.tx, e.data.ty);
      e.data.plot = inPlotBounds(px, py) ? plotIndex(px, py) : -1;
      if (def?.cls === 'tidal') { e.data.tidal = true; if (!low) stale.push(e); }
    }
    for (const e of stale) realm.remove(e);
    // a world whose start plot was populated before features existed still gets its Tidestone
    for (const p of game.world.plots) if (p.owned && p.feature === 'start' && !data) ensureStamped(game, realm, p);
  },

  save(game) { return { firstCache: N(game).st.firstCache }; },

  slowTick(game) {
    const { K, st } = N(game);
    if (game.players.size === 0) return;                     // DESIGN 8.0: empty --persist server pauses respawns
    const realm = game.realms.get('overworld');
    if (!realm) return;
    const S = Math.max(1, game.call('boundCount') || 1);
    const per = game.content.modules.rules?.NODE_RESPAWN_PER_PLAYER ?? 0.6;
    const world = game.stats.world();
    // WP14 (BUILD_REVIEW P2-7): same formula as rules/scaling.js nodeRespawnInterval, including the 0.5 bonus cap.
    const interval = K.respawnS / (1 + per * (S - 1)) / (1 + Math.min(0.5, world.nodeRespawn ?? 0));
    const low = realm.lowTide;
    for (const plot of game.world.plots) {
      if (!plot.owned) continue;
      const idx = plotIndex(plot.px, plot.py);
      let acc = (st.acc.get(idx) ?? 0) + 1;
      if (acc >= interval) {
        acc -= interval;
        if (acc > interval) acc = interval;                   // no burst after a long pause
        const cap = nodeCapOf(game, plot);
        if (plotNodes(realm, plot, (e) => !e.data.tidal).length < cap) respawnOne(game, realm, plot);
      }
      st.acc.set(idx, acc);
      if (low) {
        let ta = (st.tidalAcc.get(idx) ?? 0) + 1;
        if (ta >= K.tidalEveryS) { ta -= K.tidalEveryS; spawnTidal(game, realm, plot); }
        st.tidalAcc.set(idx, ta);
      }
    }
  },
};

export { BIOMES };
