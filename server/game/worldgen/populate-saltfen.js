// Saltfen (tier 2): teal marsh. Brackish pools, white salt flats, stilt-root trees and kelp crowding the water,
// clay banks at pool edges, bog-iron on the drier rises (DESIGN 4.2, 4.5).

import { T } from '../../../shared/grid.js';
import { populateWith, nearWater, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.5, stone: 0.45, ore: 0.4, plant: 0.55 },
  paint(ctx, P) {
    const { realm, plot, rng, game } = ctx;
    const seed = (game.world.seed ^ (plot.px * 131 + plot.py * 7919)) >>> 0;
    const pools = plot.feature === 'lagoon' ? 1 : rng.int(2, 3);
    for (let i = 0; i < pools; i++) {
      const cx = rng.float(5, 15), cy = rng.float(5, 15), r = rng.float(1.3, 2.3);
      P.paint(realm, plot, T.SHALLOW, P.blob(cx, cy, r, seed + i, 0.4), { margin: 4 });
    }
    const flats = rng.int(1, 2);
    for (let i = 0; i < flats; i++) {
      const cx = rng.float(5, 15), cy = rng.float(5, 15);
      P.paint(realm, plot, T.SAND, P.blob(cx, cy, rng.float(1.5, 2.4), seed ^ (0x9e37 + i), 0.45), { margin: 3 });
    }
  },
  affinity(def, tx, ty, realm) {
    const water = nearWater(realm, tx, ty, 2);
    switch (def.id) {
      case 'kelp_tangle': return water ? 3.5 : 0.15;
      case 'stiltwood_tree': return water ? 1.8 : 0.6;
      case 'clay_bank': return water ? 2 : 0.5;
      case 'salt_pan': return nearGround(realm, tx, ty, 1, [T.SAND]) ? 3 : 0.4;
      case 'bogiron_vein': return water ? 0.3 : 1.5;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
