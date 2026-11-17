// Hoarfrost Verge (tier 5): blue snow and pale pines. Slippery ice sheets with everice blocks frozen at their
// edges, dense pine stands, frostmoss in the shelter of the trees, rime veins on open snow (DESIGN 4.2).

import { T } from '../../../shared/grid.js';
import { populateWith, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.75, stone: 0.4, ore: 0.45, plant: 0.6 },
  paint(ctx, P) {
    const { realm, plot, rng, game } = ctx;
    const seed = (game.world.seed ^ (plot.px * 4099 + plot.py * 57)) >>> 0;
    const sheets = plot.feature === 'grove' ? 1 : rng.int(1, 2);
    for (let i = 0; i < sheets; i++) {
      P.paint(realm, plot, T.ICE, P.blob(rng.float(5, 15), rng.float(5, 15), rng.float(1.8, 3), seed + i, 0.3), { margin: 3 });
    }
  },
  affinity(def, tx, ty, realm) {
    const ice = nearGround(realm, tx, ty, 1, [T.ICE]);
    switch (def.id) {
      case 'everice_block': return ice ? 3.5 : 0.35;
      case 'palewood_pine': return ice ? 0.3 : 1.4;
      case 'frostmoss_patch': return ice ? 0.4 : 1.2;
      case 'rime_vein': return ice ? 0.6 : 1.1;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
