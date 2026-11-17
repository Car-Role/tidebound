// Plot land mask with organic shoreline (TECH_SPEC 5.3).
// A plot's interior is always land. Edges facing an unraised neighbour (incl. world edge) get a
// noise-wobbled shore: tidal flat at the rim, then sand, then biome ground. The noise is sampled in
// world tile coordinates so shores of adjacent plots line up.

import { PLOT, WORLD_PLOTS } from '../../../shared/config.js';
import { T, N8, biomeGround, biomeOf } from '../../../shared/grid.js';
import { valueNoise } from '../../../shared/rng.js';

export const TIDAL_DEPTH = 1.0;
export const SAND_DEPTH = 2.0;
export const WOBBLE = 1.2;

// Returns a Uint8Array(PLOT*PLOT) of ground ids for plot (px, py).
// isOwned(px, py) tells whether a neighbour plot is raised (out-of-world counts as unraised).
export function plotGround(seed, px, py, isOwned) {
  const out = new Uint8Array(PLOT * PLOT);
  const land = biomeGround(biomeOf(px, py));
  const open = [];
  for (const [dx, dy] of N8) {
    const nx = px + dx, ny = py + dy;
    const inside = nx >= 0 && ny >= 0 && nx < WORLD_PLOTS && ny < WORLD_PLOTS;
    if (!inside || !isOwned(nx, ny)) open.push([dx, dy]);
  }
  for (let ly = 0; ly < PLOT; ly++) {
    for (let lx = 0; lx < PLOT; lx++) {
      let d = Infinity;
      const cx = lx + 0.5, cy = ly + 0.5;
      for (const [dx, dy] of open) {
        // distance from tile centre to the neighbour plot's rectangle in local coordinates
        const rx0 = dx * PLOT, ry0 = dy * PLOT;
        const qx = cx < rx0 ? rx0 - cx : cx > rx0 + PLOT ? cx - rx0 - PLOT : 0;
        const qy = cy < ry0 ? ry0 - cy : cy > ry0 + PLOT ? cy - ry0 - PLOT : 0;
        const dd = Math.sqrt(qx * qx + qy * qy);
        if (dd < d) d = dd;
      }
      let g = land;
      if (d < Infinity) {
        const wx = px * PLOT + lx, wy = py * PLOT + ly;
        const w = valueNoise(wx / 4.5, wy / 4.5, seed) * 0.7 + valueNoise(wx / 1.7, wy / 1.7, seed ^ 0x5bd1) * 0.3;
        const c = d - w * WOBBLE;
        if (c < TIDAL_DEPTH) g = T.TIDAL;
        else if (c < SAND_DEPTH) g = T.SAND;
      }
      out[ly * PLOT + lx] = g;
    }
  }
  return out;
}
