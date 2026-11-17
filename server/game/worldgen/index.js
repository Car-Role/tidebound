// Overworld creation, plot raise tile stamping, populator registry.
// WP7 owns features.js and populate-*.js; this file wires them in and must not need edits.

import { PLOT, WORLD_PLOTS, WORLD_TILES, START_PLOT } from '../../../shared/config.js';
import { T, FLAG, BIOMES, biomeOf, plotIndex, inPlotBounds, isWater } from '../../../shared/grid.js';
import { createRng, hashString } from '../../../shared/rng.js';
import { Realm } from '../realm.js';
import { plotGround } from './shape.js';
import { assignFeatures, stampFeature } from './features.js';
import populateGreenmarrow from './populate-greenmarrow.js';
import populateSaltfen from './populate-saltfen.js';
import populateEmberreach from './populate-emberreach.js';
import populateGlasswaste from './populate-glasswaste.js';
import populateHoarfrost from './populate-hoarfrost.js';
import populateUmbral from './populate-umbral.js';

export const POPULATORS = Object.freeze({
  greenmarrow: populateGreenmarrow, saltfen: populateSaltfen, emberreach: populateEmberreach,
  glasswaste: populateGlasswaste, hoarfrost: populateHoarfrost, umbral: populateUmbral,
});

// Fresh world state (the `world` object of the save).
export function createWorldState(seed) {
  const features = assignFeatures(seed);
  const plots = [];
  for (let py = 0; py < WORLD_PLOTS; py++) {
    for (let px = 0; px < WORLD_PLOTS; px++) {
      const start = px === START_PLOT.px && py === START_PLOT.py;
      plots.push({
        px, py, biome: biomeOf(px, py), owned: start, ordinal: start ? 0 : null,
        feature: features[plotIndex(px, py)] ?? (start ? 'start' : 'wild'), known: start,
      });
    }
  }
  return { seed, time: 0, day: 1, glint: 0, tideHeight: 0, plots, flags: {}, bound: [], counters: {} };
}

const ownedFn = (plots) => (px, py) => inPlotBounds(px, py) && !!plots[plotIndex(px, py)]?.owned;

export function createOverworld(world) {
  const realm = new Realm({ id: 'overworld', w: WORLD_TILES, h: WORLD_TILES, kind: 'overworld', fill: T.DEEP });
  for (const p of world.plots) if (p.owned) stampPlot(realm, world, p.px, p.py);
  stampShallows(realm, 0, 0, realm.w, realm.h);
  return realm;
}

// Stamp one plot's tiles from its mask; unraised plots become deep water.
export function stampPlot(realm, world, px, py) {
  const x0 = px * PLOT, y0 = py * PLOT;
  const owned = world.plots[plotIndex(px, py)].owned;
  if (!owned) {
    for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) realm.stamp(x0 + x, y0 + y, T.DEEP, 0);
    return;
  }
  const g = plotGround(world.seed, px, py, ownedFn(world.plots));
  for (let y = 0; y < PLOT; y++) {
    for (let x = 0; x < PLOT; x++) {
      const i = (y0 + y) * realm.w + x0 + x;
      realm.ground[i] = g[y * PLOT + x];
      realm.flags[i] = (realm.flags[i] & ~FLAG.OWNED) | FLAG.OWNED;
    }
  }
}

// Deep water next to any land/tidal tile becomes shallow (the 1-tile shallow ring).
export function stampShallows(realm, x0, y0, x1, y1) {
  for (let y = Math.max(0, y0); y < Math.min(realm.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(realm.w, x1); x++) {
      const i = y * realm.w + x;
      const g = realm.ground[i];
      if (g !== T.DEEP && g !== T.SHALLOW) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = realm.groundAt(x + dx, y + dy);
          if (n !== T.EMPTY && !isWater(n) || n === T.TIDAL) { near = true; break; }
        }
      }
      realm.ground[i] = near ? T.SHALLOW : T.DEEP;
    }
  }
}

// Re-apply persistent patches inside a tile rectangle (after a re-stamp).
function reapplyPatches(realm, x0, y0, x1, y1) {
  for (const p of realm.patches.values()) {
    if (p[0] >= x0 && p[0] < x1 && p[1] >= y0 && p[1] < y1) realm.applyPatch(p);
  }
}

/**
 * Raise plot (px, py): mark owned, re-stamp it and its neighbours so shores join seamlessly,
 * stamp its feature, populate it, and tell clients. Validation (cost, adjacency) is WP7's job.
 */
export function raisePlot(game, px, py, { ordinal = null, populate = true } = {}) {
  const world = game.world;
  const realm = game.realms.get('overworld');
  const plot = world.plots[plotIndex(px, py)];
  if (!plot || plot.owned) return false;
  plot.owned = true;
  plot.known = true;
  plot.ordinal = ordinal ?? world.plots.filter((p) => p.owned).length - 1;
  restampAround(realm, world, px, py);
  if (populate) {
    stampFeature(game, realm, plot);
    populatePlot(game, realm, px, py);
  }
  game.sendWorld('plots', game.plotsView());
  return true;
}

export function restampAround(realm, world, px, py) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inPlotBounds(px + dx, py + dy)) stampPlot(realm, world, px + dx, py + dy);
    }
  }
  const x0 = (px - 2) * PLOT, y0 = (py - 2) * PLOT, x1 = (px + 3) * PLOT, y1 = (py + 3) * PLOT;
  stampShallows(realm, x0, y0, x1, y1);
  reapplyPatches(realm, x0, y0, x1, y1);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (inPlotBounds(px + dx, py + dy)) realm.markChunkDirty(px + dx, py + dy);
    }
  }
}

// Builds the populator context and runs the biome populator for a plot.
export function populatePlot(game, realm, px, py) {
  const plot = game.world.plots[plotIndex(px, py)];
  const biome = plot.biome;
  const rng = createRng(game.world.seed ^ hashString(`plot:${px},${py}`));
  const x0 = px * PLOT, y0 = py * PLOT;
  const freeTiles = () => {
    const out = [];
    for (let y = 0; y < PLOT; y++) {
      for (let x = 0; x < PLOT; x++) {
        const tx = x0 + x, ty = y0 + y, g = realm.groundAt(tx, ty);
        if (g >= T.GREENMARROW && g <= T.UMBRAL && realm.isWalkable(tx, ty) && !realm.hasFlag(tx, ty, FLAG.NO_SPAWN)) out.push([tx, ty]);
      }
    }
    return out;
  };
  const spawnNode = (kind, tx, ty) => game.call('spawnNode', realm, kind, tx, ty);
  const nodeTable = () => {
    const b = game.content.biomes.byId[biome];
    const ids = b?.nodeTable ?? game.content.nodes.filter((n) => n.biome === biome).map((n) => n.id);
    return ids.map((id) => game.content.nodes.byId[id]).filter(Boolean);
  };
  const ctx = {
    game, realm, plot, px, py, biome, feature: plot.feature, rng, x0, y0,
    freeTiles, spawnNode, nodeTable,
    // Spawn n nodes from the biome's weighted table on free tiles, keeping a 1-tile gap from the start spawn.
    scatter(n, table = nodeTable()) {
      if (!table.length) return 0;
      const tiles = rng.shuffle(freeTiles());
      const spawn = game.spawnPoint();
      let placed = 0;
      for (const [tx, ty] of tiles) {
        if (placed >= n) break;
        if (Math.abs(tx + 0.5 - spawn.x) < 2.5 && Math.abs(ty + 0.5 - spawn.y) < 2.5) continue;
        const def = rng.weighted(table, (d) => d.weight ?? 1);
        if (def && spawnNode(def.id, tx, ty)) placed++;
      }
      return placed;
    },
  };
  const fn = POPULATORS[biome];
  try { fn?.(ctx); } catch (err) { console.error(`[tb:worldgen] populator ${biome} threw:`, err); }
}

export { BIOMES };
