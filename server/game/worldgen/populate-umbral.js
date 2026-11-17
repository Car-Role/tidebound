// The Umbral Deep (tier 6): violet-black silt with glowing ink pools (ink slows by 40%). Inkweed fringes the
// pools, nullsilt heaps drift beside them, gloomwood groves stand apart, umbrite in dark seams (DESIGN 4.2).

import { T } from '../../../shared/grid.js';
import { populateWith, nearGround } from './features.js';

export const style = {
  cluster: { wood: 0.6, stone: 0.45, ore: 0.5, plant: 0.55 },
  paint(ctx, P) {
    const { realm, plot, rng, game } = ctx;
    const seed = (game.world.seed ^ (plot.px * 2741 + plot.py * 389)) >>> 0;
    const pools = plot.feature === 'gate_site' ? 1 : rng.int(2, 3);
    for (let i = 0; i < pools; i++) {
      P.paint(realm, plot, T.INK, P.blob(rng.float(5, 15), rng.float(5, 15), rng.float(1.3, 2.4), seed + i, 0.45), { margin: 4 });
    }
  },
  affinity(def, tx, ty, realm) {
    const ink1 = nearGround(realm, tx, ty, 1, [T.INK]);
    const ink2 = ink1 || nearGround(realm, tx, ty, 2, [T.INK]);
    switch (def.id) {
      case 'inkweed_frond': return ink1 ? 3.5 : ink2 ? 1.5 : 0.3;
      case 'nullsilt_heap': return ink2 ? 1.8 : 0.8;
      case 'gloomwood_tree': return ink1 ? 0.2 : 1.3;
      case 'umbrite_vein': return ink2 ? 0.6 : 1.2;
      default: return 1;
    }
  },
};

export default function populate(ctx) {
  return populateWith(ctx, style);
}
