// Emberreach (tier 3): black basalt split by lava cracks. Obsidian spires and brimstone vents gather at the
// cracks, ash trees keep their distance, cinderite in seams (DESIGN 4.2, 4.5). Lava tiles burn (30 dmg/s).

import { T } from '../../../shared/grid.js';
import { populateWith, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.55, stone: 0.35, ore: 0.55, plant: 0.4 },
  paint(ctx, P) {
    const { realm, plot, rng } = ctx;
    const cracks = plot.feature === 'wild' || plot.feature === 'vein' ? rng.int(1, 2) : rng.int(0, 1);
    for (let i = 0; i < cracks; i++) {
      const line = P.meander(rng, rng.int(6, 13), rng.int(6, 13), rng.float(0, Math.PI * 2), rng.int(5, 9), 1);
      P.paint(realm, plot, T.LAVA, line, { margin: 4 });
    }
  },
  affinity(def, tx, ty, realm) {
    const lava1 = nearGround(realm, tx, ty, 1, [T.LAVA]);
    const lava2 = lava1 || nearGround(realm, tx, ty, 2, [T.LAVA]);
    switch (def.id) {
      case 'obsidian_spire': return lava2 ? 3 : 0.5;
      case 'brimstone_vent': return lava1 ? 3.5 : lava2 ? 1.6 : 0.4;
      case 'ashwood_tree': return lava1 ? 0 : lava2 ? 0.4 : 1.4;
      case 'ashgrass_tuft': return lava1 ? 0.2 : 1;
      case 'cinderite_vein': return lava2 ? 1.3 : 1;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
