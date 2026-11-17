// Plot features (DESIGN 4.4, A.5, A.9) and the shared populator engine used by populate-*.js (WP7).
//
// assignFeatures(seed)          -> 81 feature ids (plotIndex order), seeded shuffle within each biome.
// stampFeature(game, realm, p)  -> stamps the feature of a freshly raised plot (natural structures, tiles, clearings).
//                                  Called by worldgen/index.js raisePlot() before the populator; the start plot is
//                                  never raised, so its populator calls ensureStamped() first.
// populateWith(ctx, style)      -> biome-specific terrain painting + clustered, affinity-driven node placement.
//
// Terrain written here uses realm.setGround / realm.setFlag (persistent tile patches), because populators are not
// re-run when a save is loaded (TECH_SPEC 12: the overworld is regenerated from seed + owned plots, then patches).

import { PLOT, WORLD_PLOTS, START_PLOT } from '../../../shared/config.js';
import { T, FLAG, BIOMES, BIOME_TIER, biomeOf, plotIndex, isWater } from '../../../shared/grid.js';
import { createRng, hashString, seededShuffle, hash2D } from '../../../shared/rng.js';
import { createEntity } from '../entities.js';

// ---------------------------------------------------------------- feature tables (DESIGN 4.4)

export const FEATURE_COUNTS = Object.freeze({
  greenmarrow: { start: 1, archive: 1, vault: 1, arena: 1, castaway: 1, shrine: 1, lagoon: 1, wild: 2 },
  saltfen: { vault: 1, arena: 1, castaway: 2, shrine: 2, lagoon: 1, vein: 1, grove: 1, dig: 1, wild: 5 },
  emberreach: { vault: 1, arena: 1, castaway: 2, shrine: 2, lagoon: 1, vein: 1, grove: 1, dig: 1, wild: 5 },
  glasswaste: { vault: 1, arena: 1, castaway: 2, shrine: 2, lagoon: 1, vein: 1, grove: 1, dig: 1, wild: 5 },
  hoarfrost: { vault: 1, arena: 1, castaway: 2, shrine: 2, lagoon: 1, vein: 1, grove: 1, dig: 1, wild: 5 },
  umbral: { vault: 1, arena: 1, castaway: 2, shrine: 2, vein: 1, gate_site: 1, wild: 4 },
});

// Node cap per plot (DESIGN 4.5): 22 wild, 30 grove/vein, 12 other feature plots. Workshop charter -8 (A.9).
export const NODE_CAPS = Object.freeze({ wild: 22, grove: 30, vein: 30 });
export const FEATURE_NODE_CAP = 12;

export const WARDENS = Object.freeze(['thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir']);
export const VAULTS = Object.freeze(['rootbound_vault', 'sunken_cistern', 'slagworks', 'refraction_hall', 'frozen_reliquary', 'the_inkwell']);

const plotsOfBiome = (biome) => {
  const out = [];
  for (let py = 0; py < WORLD_PLOTS; py++) for (let px = 0; px < WORLD_PLOTS; px++) if (biomeOf(px, py) === biome) out.push(plotIndex(px, py));
  return out;
};

export function assignFeatures(seed) {
  const out = new Array(WORLD_PLOTS * WORLD_PLOTS).fill('wild');
  const startIdx = plotIndex(START_PLOT.px, START_PLOT.py);
  for (const biome of BIOMES) {
    const idx = plotsOfBiome(biome).filter((i) => i !== startIdx);
    const bag = [];
    for (const [f, n] of Object.entries(FEATURE_COUNTS[biome])) {
      if (f === 'start') continue;
      for (let k = 0; k < n; k++) bag.push(f);
    }
    const shuffled = seededShuffle(bag, (seed ^ hashString('features:' + biome)) >>> 0);
    idx.forEach((pi, k) => { out[pi] = shuffled[k] ?? 'wild'; });
  }
  out[startIdx] = 'start';
  return out;
}

// Castaway NPC living on a castaway plot (deterministic, so every system can ask without saved state).
export function castawayOf(game, px, py) {
  const plot = game.world.plots[plotIndex(px, py)];
  if (!plot || plot.feature !== 'castaway') return null;
  const npcs = (game.content.npcs || []).filter((n) => n.biome === plot.biome).map((n) => n.id);
  // same rule as WP11 npcs.js castawayAssignments(): castaway plots in plot-index order get the biome's NPCs in data order
  const order = game.world.plots.filter((p) => p.biome === plot.biome && p.feature === 'castaway').map((p) => plotIndex(p.px, p.py)).sort((a, b) => a - b);
  const k = order.indexOf(plotIndex(px, py));
  return npcs[k] ?? npcs[0] ?? null;
}

// ---------------------------------------------------------------- natural structures

// Places a world-generated structure (structures.js `natural: true` or any id) directly, bypassing build validators.
export function placeNatural(game, realm, kind, tx, ty, data = {}, pub = {}) {
  const def = game.content.structures.byId[kind];
  const w = data.w ?? def?.w ?? 1, h = data.h ?? def?.h ?? 1;
  const solid = data.solid ?? def?.solid ?? true;
  const e = createEntity(game, {
    type: 'structure', kind, x: tx + w / 2, y: ty + h / 2, hp: def?.hp || 1, radius: Math.max(w, h) / 2, solid,
    data: { tx, ty, w, h, owner: null, paid: [], natural: true, ...data },
    pub: { rot: 0, own: 0, on: 1, ...pub },
  });
  realm.add(e);
  if (solid) for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) realm.setFlag(x, y, FLAG.SOLID, true);
  // Not announced as structure.placed: natural pieces are not player builds (quests/deeds count those).
  game.bus.emit('natural.placed', { structure: e });
  return e;
}

// ---------------------------------------------------------------- tile helpers (persistent)

const inPlot = (plot, tx, ty) => tx >= plot.px * PLOT && ty >= plot.py * PLOT && tx < (plot.px + 1) * PLOT && ty < (plot.py + 1) * PLOT;
const isLandTile = (g) => g >= T.SAND && g !== T.EMPTY && g !== T.DUNGEON_WALL;
const biomeGroundOf = (plot) => T.GREENMARROW + BIOMES.indexOf(plot.biome);

// Clears a rectangle (relative to the plot) of spawns: NO_SPAWN flag (persistent).
export function reserve(realm, plot, lx, ly, w, h, pad = 1) {
  const x0 = plot.px * PLOT, y0 = plot.py * PLOT;
  for (let y = ly - pad; y < ly + h + pad; y++) {
    for (let x = lx - pad; x < lx + w + pad; x++) {
      if (x < 0 || y < 0 || x >= PLOT || y >= PLOT) continue;
      realm.setFlag(x0 + x, y0 + y, FLAG.NO_SPAWN, true);
    }
  }
}

// Paints biome-ground tiles of the plot with `g` where mask(lx, ly) is true. Only interior land is touched.
function paint(realm, plot, g, mask, { margin = 3, onlyGround = true } = {}) {
  const x0 = plot.px * PLOT, y0 = plot.py * PLOT, base = biomeGroundOf(plot);
  let n = 0;
  for (let ly = margin; ly < PLOT - margin; ly++) {
    for (let lx = margin; lx < PLOT - margin; lx++) {
      const tx = x0 + lx, ty = y0 + ly;
      const cur = realm.groundAt(tx, ty);
      if (onlyGround && cur !== base) continue;
      if (realm.hasFlag(tx, ty, FLAG.SOLID) || realm.hasFlag(tx, ty, FLAG.NO_SPAWN)) continue;
      if (!mask(lx, ly)) continue;
      realm.setGround(tx, ty, g);
      n++;
    }
  }
  return n;
}

function blob(cx, cy, r, seed, rough = 0.35) {
  return (lx, ly) => {
    const dx = lx + 0.5 - cx, dy = ly + 0.5 - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const n = hash2D(Math.round(lx * 3), Math.round(ly * 3), seed) - 0.5;
    return d < r * (1 + n * rough * 2);
  };
}

// Meandering line of tiles from (ax, ay) heading `ang`, `len` steps; returns a mask set.
function meander(rng, ax, ay, ang, len, width = 1) {
  const set = new Set();
  let x = ax, y = ay;
  for (let i = 0; i < len; i++) {
    for (let w = 0; w < width; w++) set.add(Math.round(x + (w ? Math.cos(ang + Math.PI / 2) : 0)) + ',' + Math.round(y + (w ? Math.sin(ang + Math.PI / 2) : 0)));
    ang += rng.float(-0.6, 0.6);
    x += Math.cos(ang); y += Math.sin(ang);
  }
  return (lx, ly) => set.has(lx + ',' + ly);
}

export const painters = { paint, blob, meander, reserve };

// ---------------------------------------------------------------- feature stamping

const center = (plot, rng, jitter = 2) => ({ lx: 10 + rng.int(-jitter, jitter), ly: 10 + rng.int(-jitter, jitter) });

function pathRing(realm, plot, lx, ly, w, h, pad = 1) {
  const x0 = plot.px * PLOT, y0 = plot.py * PLOT, base = biomeGroundOf(plot);
  for (let y = ly - pad; y < ly + h + pad; y++) {
    for (let x = lx - pad; x < lx + w + pad; x++) {
      const tx = x0 + x, ty = y0 + y;
      if (x >= lx && x < lx + w && y >= ly && y < ly + h) continue;
      if (realm.groundAt(tx, ty) === base) realm.setGround(tx, ty, T.PATH);
    }
  }
}

function stampLagoon(game, realm, plot, rng) {
  const cx = 10 + rng.float(-1.5, 1.5), cy = 10 + rng.float(-1.5, 1.5);
  const seed = (game.world.seed ^ plotIndex(plot.px, plot.py) * 977) >>> 0;
  const deep = blob(cx, cy, 2.6, seed, 0.25), shallow = blob(cx, cy, 3.8, seed ^ 0x55, 0.3), sand = blob(cx, cy, 4.8, seed ^ 0x77, 0.3);
  paint(realm, plot, T.SAND, sand, { margin: 3 });
  paint(realm, plot, T.SHALLOW, shallow, { margin: 3, onlyGround: false });
  paint(realm, plot, T.DEEP, deep, { margin: 4, onlyGround: false });

}

function stampDig(game, realm, plot, rng) {
  const site = game.content.modules.biomes?.DIG_SITES?.[plot.biome];
  if (!site) return;
  const spots = [];
  const tries = [];
  for (let ly = 4; ly <= 15; ly++) for (let lx = 4; lx <= 15; lx++) tries.push([lx, ly]);
  rng.shuffle(tries);
  for (const [lx, ly] of tries) {
    if (spots.length >= 6) break;
    if (spots.some(([x, y]) => Math.abs(x - lx) + Math.abs(y - ly) < 4)) continue;
    const tx = plot.px * PLOT + lx, ty = plot.py * PLOT + ly;
    if (realm.groundAt(tx, ty) !== biomeGroundOf(plot) || realm.hasFlag(tx, ty, FLAG.SOLID)) continue;
    spots.push([lx, ly]);
  }
  const [fragSpots, fragQty] = site.fragments ?? [4, 2];
  const contents = [...site.relics.map((r) => [{ item: r, qty: 1 }])];
  for (let i = 0; i < fragSpots; i++) {
    const c = [{ item: 'relic_fragment', qty: fragQty }];
    if (site.extra) c.push({ item: site.extra.item, qty: site.extra.qty });
    contents.push(c);
  }
  const order = rng.shuffle(contents.slice());
  spots.forEach(([lx, ly], i) => {
    const tx = plot.px * PLOT + lx, ty = plot.py * PLOT + ly;
    placeNatural(game, realm, 'dig_spot', tx, ty, { solid: false, hits: 0, need: 10, loot: order[i] ?? [], biome: plot.biome }, { p: 0 });
    reserve(realm, plot, lx, ly, 1, 1, 1);
  });
}

// Where a plot's feature sits (tile coordinates of its centre), recomputed from the same seeded draws that
// stampFeature uses, so no state needs saving. Castaways stand here; NPC systems may use it.
export function featureAnchor(game, plot) {
  if (!plot) return null;
  const rng = createRng((game.world.seed ^ hashString(`feature:${plot.px},${plot.py}`)) >>> 0);
  const ox = plot.px * PLOT, oy = plot.py * PLOT;
  switch (plot.feature) {
    case 'start': return { x: ox + 10, y: oy + 7 };
    case 'archive': case 'arena': case 'shrine': { const c = center(plot, rng, 1); return { x: ox + c.lx + 0.5, y: oy + c.ly + 0.5 }; }
    case 'vault': { const c = center(plot, rng, 2); return { x: ox + c.lx + 0.5, y: oy + c.ly + 0.5 }; }
    case 'castaway': return { x: ox + 12.5, y: oy + 11.5 };
    case 'lagoon': return { x: ox + 10 + rng.float(-1.5, 1.5), y: oy + 10 + rng.float(-1.5, 1.5) };
    case 'gate_site': return { x: ox + 10, y: oy + 10 };
    default: return { x: ox + 10, y: oy + 10 };
  }
}

export function ensureStamped(game, realm, plot) {
  if (!plot.stamped) stampFeature(game, realm, plot);
}

export function stampFeature(game, realm, plot) {
  if (!plot || plot.stamped) return;
  plot.stamped = true;
  const rng = createRng((game.world.seed ^ hashString(`feature:${plot.px},${plot.py}`)) >>> 0);
  const tier = BIOME_TIER[plot.biome] ?? 1;
  const ox = plot.px * PLOT, oy = plot.py * PLOT;
  const at = (lx, ly) => [ox + lx, oy + ly];
  switch (plot.feature) {
    case 'start': {
      // Tidestone north of the spawn point, campfire beside it, Tide Board to the west (WP11 interaction).
      const [tx, ty] = at(9, 6);
      placeNatural(game, realm, 'tidestone', tx, ty);
      pathRing(realm, plot, 9, 6, 2, 2, 1);
      placeNatural(game, realm, 'campfire', ...at(13, 12));
      placeNatural(game, realm, 'tide_board', ...at(6, 12));
      reserve(realm, plot, 5, 5, 10, 9, 0);
      reserve(realm, plot, 12, 12, 3, 3, 1);       // future Trench whirlpool (Beacon 3)
      break;
    }
    case 'archive': {
      const { lx, ly } = center(plot, rng, 1);
      placeNatural(game, realm, 'archive', ...at(lx - 2, ly - 1));
      pathRing(realm, plot, lx - 2, ly - 1, 4, 3, 1);
      reserve(realm, plot, lx - 4, ly - 3, 8, 7, 0);
      break;
    }
    case 'vault': {
      const { lx, ly } = center(plot, rng, 2);
      placeNatural(game, realm, 'vault_entrance', ...at(lx - 1, ly - 1), { k: tier, dungeon: VAULTS[tier - 1] });
      pathRing(realm, plot, lx - 1, ly - 1, 3, 2, 1);
      reserve(realm, plot, lx - 3, ly - 3, 7, 6, 0);
      break;
    }
    case 'arena': {
      const { lx, ly } = center(plot, rng, 1);
      placeNatural(game, realm, 'arena', ...at(lx - 1, ly - 1), { k: tier, boss: WARDENS[tier - 1] });
      const seed = (game.world.seed ^ 0xa5e) >>> 0;
      paint(realm, plot, T.PATH, (x, y) => { const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly); return d > 4.2 && d < 5.2 && hash2D(x, y, seed) > 0.25; }, { margin: 2 });
      reserve(realm, plot, lx - 5, ly - 5, 11, 11, 0);
      break;
    }
    case 'castaway': {
      // camp in the plot centre; WP11 stands the castaway at centre + (2, 1), beside the fire
      const lx = 10, ly = 10;
      pathRing(realm, plot, lx - 1, ly - 1, 3, 3, 1);
      placeNatural(game, realm, 'campfire', ...at(lx, ly));
      reserve(realm, plot, lx - 3, ly - 3, 7, 7, 0);

      break;
    }
    case 'shrine': {
      const { lx, ly } = center(plot, rng, 1);
      game.services.has('buildShrine') && game.call('buildShrine', realm, plot, lx, ly);
      break;
    }
    case 'lagoon': stampLagoon(game, realm, plot, rng); break;
    case 'dig': stampDig(game, realm, plot, rng); break;
    case 'gate_site': {
      placeNatural(game, realm, 'gate_site', ...at(7, 8));
      pathRing(realm, plot, 7, 8, 6, 4, 1);
      reserve(realm, plot, 5, 6, 10, 8, 0);
      break;
    }
    default: break;
  }
  game.bus.emit('feature.stamped', { plot, px: plot.px, py: plot.py, feature: plot.feature });
}

// ---------------------------------------------------------------- populator engine

// Weight multipliers by node class for a plot (feature + charter, DESIGN 4.4 and A.9).
export function classWeights(game, plot) {
  const w = { wood: 1, stone: 1, ore: 1, plant: 1, gem: 0, tidal: 0 };
  if (plot.feature === 'vein') w.ore = 3;
  if (plot.feature === 'grove') { w.wood = 2.5; w.plant = 2; w.stone = 0.4; w.ore = 0.4; }
  const charter = game.world.charters?.[plot.px + ',' + plot.py]?.id;
  const def = charter && game.content.modules.biomes?.CHARTER_DEFS?.[charter];
  if (def?.boost) for (const k of Object.keys(w)) if (k !== 'gem' && k !== 'tidal') w[k] *= def.boost.includes(k) ? def.mult : def.others;
  return w;
}

export function nodeCapOf(game, plot) {
  let cap = NODE_CAPS[plot.feature] ?? FEATURE_NODE_CAP;
  const charter = game.world.charters?.[plot.px + ',' + plot.py]?.id;
  if (charter === 'workshop') cap = Math.max(4, cap - 8);
  return cap;
}

// Counts ground of `kinds` within r of (tx, ty).
export function nearGround(realm, tx, ty, r, kinds) {
  let n = 0;
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (kinds.includes(realm.groundAt(x, y))) n++;
  return n;
}
export const nearWater = (realm, tx, ty, r = 2) => {
  let n = 0;
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) { const g = realm.groundAt(x, y); if (g !== T.EMPTY && isWater(g)) n++; }
  return n;
};

// True when no structure (solid flag) sits within 1 tile of (tx, ty) (DESIGN 4.5).
export function clearOfStructures(realm, tx, ty) {
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (realm.hasFlag(x, y, FLAG.SOLID)) return false;
  return true;
}

/**
 * Spec-driven population:
 *   style.paint(ctx, P)                      terrain painting (P = painters)
 *   style.affinity(def, tx, ty, realm, ctx)  tile preference multiplier (>= 0) for a node kind
 *   style.cluster { wood: 0.6, ... }         chance to place a node next to one of its own class
 *   style.density                            multiplier on the plot's node cap for the initial fill (default 1)
 */
export function populateWith(ctx, style = {}) {
  const { game, realm, plot, rng } = ctx;
  ensureStamped(game, realm, plot);
  if (style.paint) style.paint(ctx, painters);

  const weights = classWeights(game, plot);
  const table = ctx.nodeTable().map((d) => ({ def: d, w: (d.weight ?? 1) * (weights[d.cls] ?? 1) })).filter((t) => t.w > 0);
  if (!table.length) return 0;
  const cap = Math.round(nodeCapOf(game, plot) * (style.density ?? 1));
  const spawn = game.spawnPoint();
  const free = ctx.freeTiles().filter(([tx, ty]) => clearOfStructures(realm, tx, ty)
    && !(Math.abs(tx + 0.5 - spawn.x) < 2.5 && Math.abs(ty + 0.5 - spawn.y) < 2.5));
  const freeSet = new Set(free.map(([x, y]) => x + ',' + y));
  const placed = [];
  const cluster = style.cluster ?? { wood: 0.55, stone: 0.3, ore: 0.45, plant: 0.4 };

  const pickTile = (def) => {
    const cands = [];
    if (placed.length && rng.chance(cluster[def.cls] ?? 0)) {
      const mates = placed.filter((p) => p.cls === def.cls);
      if (mates.length) {
        const m = rng.pick(mates);
        for (let i = 0; i < 6; i++) {
          const x = m.tx + rng.int(-2, 2), y = m.ty + rng.int(-2, 2);
          if (freeSet.has(x + ',' + y)) cands.push([x, y]);
        }
      }
    }
    for (let i = 0; i < 8 && free.length; i++) {
      const [x, y] = free[rng.int(0, free.length - 1)];
      if (freeSet.has(x + ',' + y)) cands.push([x, y]);
    }
    let best = null, bestS = -1;
    for (const [x, y] of cands) {
      const a = style.affinity ? style.affinity(def, x, y, realm, ctx) : 1;
      const s = a * (0.5 + rng.next());
      if (s > bestS) { best = [x, y]; bestS = s; }
    }
    return bestS > 0 ? best : null;
  };

  let n = 0;
  // WP14 (BUILD_REVIEW P1-3): a style may guarantee some nodes first (start plot: copper veins and rocks).
  const must = typeof style.guarantee === 'function' ? style.guarantee(ctx) : (style.guarantee ?? []);
  for (const { id, n: want } of must) {
    const def = game.content.nodes.byId[id];
    if (!def) continue;
    for (let k = 0, tries = 0; k < want && n < cap && freeSet.size && tries < want * 6; tries++) {
      const tile = pickTile(def);
      if (!tile) continue;
      const [tx, ty] = tile;
      const e = game.services.has('spawnNodeNatural') ? game.call('spawnNodeNatural', realm, plot, id, tx, ty, rng) : ctx.spawnNode(id, tx, ty);
      freeSet.delete(tx + ',' + ty);
      if (!e) continue;
      placed.push({ tx, ty, cls: def.cls });
      n++; k++;
    }
  }
  for (let i = 0; i < cap * 3 && n < cap && freeSet.size; i++) {
    const t = rng.weighted(table, (e) => e.w);
    const tile = pickTile(t.def);
    if (!tile) continue;
    const [tx, ty] = tile;
    const e = game.services.has('spawnNodeNatural')
      ? game.call('spawnNodeNatural', realm, plot, t.def.id, tx, ty, rng)
      : ctx.spawnNode(t.def.id, tx, ty);
    if (!e) { freeSet.delete(tx + ',' + ty); continue; }
    freeSet.delete(tx + ',' + ty);
    placed.push({ tx, ty, cls: t.def.cls });
    n++;
  }
  return n;
}

export { BIOMES, BIOME_TIER, isLandTile };
