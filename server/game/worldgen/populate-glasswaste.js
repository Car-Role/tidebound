// Glasswaste (tier 4): pale sand and fused glass. Dune fields of loose sand, sunsand heaped at their rims,
// prismite veins in glittering clusters, sparse spinewood cactus with needlesilk blooms nearby (DESIGN 4.2).

import { T } from '../../../shared/grid.js';
import { populateWith, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.25, stone: 0.5, ore: 0.65, plant: 0.5 },
  paint(ctx, P) {
    const { realm, plot, rng, game } = ctx;
    const seed = (game.world.seed ^ (plot.px * 7333 + plot.py * 13)) >>> 0;
    const dunes = rng.int(2, 3);
    for (let i = 0; i < dunes; i++) {
      const cx = rng.float(5, 15), cy = rng.float(5, 15);
      // elongated dune: two overlapping blobs along a wind direction
      const a = rng.float(-0.4, 0.4), len = rng.float(1.5, 2.5);
      const b1 = P.blob(cx - Math.cos(a) * len, cy - Math.sin(a) * len, rng.float(1.4, 2.2), seed + i * 3, 0.35);
      const b2 = P.blob(cx + Math.cos(a) * len, cy + Math.sin(a) * len, rng.float(1.4, 2.2), seed + i * 3 + 1, 0.35);
      P.paint(realm, plot, T.SAND, (x, y) => b1(x, y) || b2(x, y), { margin: 3 });
    }
  },
  affinity(def, tx, ty, realm) {
    const sand = nearGround(realm, tx, ty, 1, [T.SAND]);
    switch (def.id) {
      case 'sunsand_dune': return sand ? 3.5 : 0.3;
      case 'spinewood_cactus': return sand ? 0.6 : 1.2;
      case 'needlesilk_bloom': return sand ? 0.5 : 1.3;
      case 'prismite_vein': return sand ? 0.7 : 1.2;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
