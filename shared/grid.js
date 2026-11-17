// Tile ids, plot <-> tile helpers, biome rule (DESIGN 4.1/4.2, TECH_SPEC 5.3).

import { PLOT, WORLD_PLOTS, WORLD_TILES, START_PLOT, CHUNK } from './config.js';

export const T = Object.freeze({
  DEEP: 0, SHALLOW: 1, TIDAL: 2, SAND: 3,
  GREENMARROW: 4, SALTFEN: 5, EMBERREACH: 6, GLASSWASTE: 7, HOARFROST: 8, UMBRAL: 9,
  SOIL: 10, PATH: 11, LAVA: 12, ICE: 13, INK: 14, DUNGEON_FLOOR: 15, DUNGEON_WALL: 16, EMPTY: 17,
});
export const TILE_NAMES = Object.freeze([
  'deep', 'shallow', 'tidal', 'sand', 'greenmarrow', 'saltfen', 'emberreach', 'glasswaste',
  'hoarfrost', 'umbral', 'soil', 'path', 'lava', 'ice', 'ink', 'dungeon_floor', 'dungeon_wall', 'empty',
]);

// Base walkability; TIDAL is walkable only at low tide (handled by isGroundWalkable).
export const WALKABLE = Object.freeze([
  false, false, false, true, true, true, true, true, true, true, true, true, true, true, true, true, false, false,
]);
export const isWater = (g) => g <= T.TIDAL;

export const FLAG = Object.freeze({ SOLID: 1, OWNED: 2, NO_SPAWN: 4, LIT: 8, WATERED: 16 });

export function isGroundWalkable(g, lowTide = false) {
  if (g === T.TIDAL) return lowTide;
  return WALKABLE[g] === true;
}

// Speed and grip multipliers per ground (TECH_SPEC 5.3 notes).
export function groundSpeedMul(g) {
  if (g === T.PATH) return 1.1;
  if (g === T.INK) return 0.6;
  return 1;
}
export const groundGrip = (g) => (g === T.ICE ? 0.15 : 1);

export const BIOMES = Object.freeze(['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral']);
export const BIOME_TIER = Object.freeze({ greenmarrow: 1, saltfen: 2, emberreach: 3, glasswaste: 4, hoarfrost: 5, umbral: 6 });
export const biomeGround = (biome) => T.GREENMARROW + Math.max(0, BIOMES.indexOf(biome));

export function biomeOf(px, py) {
  const dx = px - START_PLOT.px, dy = py - START_PLOT.py;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const d = Math.max(adx, ady);
  if (d <= 1) return 'greenmarrow';
  if (adx === ady) return 'umbral';
  if (adx > ady) return dx < 0 ? 'saltfen' : 'glasswaste';
  return dy > 0 ? 'emberreach' : 'hoarfrost';
}

export const plotIndex = (px, py) => py * WORLD_PLOTS + px;
export const plotFromIndex = (i) => ({ px: i % WORLD_PLOTS, py: Math.floor(i / WORLD_PLOTS) });
export const inPlotBounds = (px, py) => px >= 0 && py >= 0 && px < WORLD_PLOTS && py < WORLD_PLOTS;
export const plotOfTile = (tx, ty) => ({ px: Math.floor(tx / PLOT), py: Math.floor(ty / PLOT) });
export const plotOrigin = (px, py) => ({ tx: px * PLOT, ty: py * PLOT });
export const plotCenter = (px, py) => ({ x: px * PLOT + PLOT / 2, y: py * PLOT + PLOT / 2 });
export const inWorld = (tx, ty, w = WORLD_TILES, h = WORLD_TILES) => tx >= 0 && ty >= 0 && tx < w && ty < h;

export const chunkOf = (tx, ty) => ({ cx: Math.floor(tx / CHUNK), cy: Math.floor(ty / CHUNK) });
export const chunkKey = (cx, cy) => cx + ',' + cy;

export const N4 = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
export const N8 = Object.freeze([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);

export function neighbours4(px, py) {
  const out = [];
  for (const [dx, dy] of N4) if (inPlotBounds(px + dx, py + dy)) out.push({ px: px + dx, py: py + dy });
  return out;
}
export function neighbours8(px, py) {
  const out = [];
  for (const [dx, dy] of N8) if (inPlotBounds(px + dx, py + dy)) out.push({ px: px + dx, py: py + dy });
  return out;
}
