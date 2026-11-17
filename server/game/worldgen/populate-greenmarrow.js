// Greenmarrow (tier 1): soft meadow. Winding dirt paths, bentwood groves, reeds and peat by the water,
// copper outcrops on dry ground, berry bushes at grove edges (DESIGN 4.2, 4.5).

import { T } from '../../../shared/grid.js';
import { populateWith, nearWater, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.6, stone: 0.3, ore: 0.5, plant: 0.35 },
  paint(ctx, P) {
    const { realm, plot, rng, feature } = ctx;
    if (feature === 'start' || !rng.chance(0.55)) return;
    const horizontal = rng.chance(0.5);
    const path = P.meander(rng, horizontal ? 3 : rng.int(6, 13), horizontal ? rng.int(6, 13) : 3, horizontal ? 0 : Math.PI / 2, 16, 1);
    P.paint(realm, plot, T.PATH, path, { margin: 3 });
  },
  // WP14 (BUILD_REVIEW P1-3): the start plot always has copper and stone for the Kiln and first Ballast.
  guarantee(ctx) {
    // first weapon: 8 reedfiber (2 rope by hand) + 10 fieldstone (Workbench 6 + blade 4); Kiln 20 fieldstone
    return ctx.feature === 'start' ? [{ id: 'copper_vein', n: 2 }, { id: 'fieldstone_rock', n: 4 }, { id: 'reed_clump', n: 4 }] : [];
  },
  affinity(def, tx, ty, realm) {
    const water = nearWater(realm, tx, ty, 2);
    switch (def.id) {
      case 'reed_clump': return water ? 3 : 0.25;
      case 'peat_mound': return water ? 1.8 : 0.7;
      case 'copper_vein': return water ? 0.3 : 1.4;
      case 'bentwood_tree': return nearGround(realm, tx, ty, 1, [T.PATH]) ? 0.2 : 1.2;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
