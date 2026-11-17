// Generic structure drawer (type-level fallback for `structure`): sprite + progress bar + off-state dimming.

import { PAL, RAMPS } from '../../art/palette.js';

export default {
  kinds: [],
  types: ['structure'],
  draw(ctx, e, time, view) {
    const def = view.content.structures.byId[e.k];
    const w = (def?.w ?? 1) * 16, h = (def?.h ?? 1) * 16;
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y) + h / 2;
    let id = 'struct.' + e.k, pinned = e.on === 0;
    if (e.k === 'gate_site') {
      // Tidegate: the ruined site until stage 1 is done, then WP3's stage art s1..s5 (s5 animates the portal)
      const stage = Math.min(5, view.store.world.tidegate?.stage ?? 0);
      if (stage > 0 && view.sprites.has('struct.gate_site.s' + stage)) { id = 'struct.gate_site.s' + stage; pinned = false; }
    }
    if (view.sprites.has(id)) {
      view.sprites.draw(ctx, id, sx, sy, { time, alpha: pinned ? 0.7 : 1, frame: pinned ? 0 : undefined });
    } else {
      ctx.fillStyle = PAL[RAMPS.brown[1]];
      ctx.fillRect(sx - w / 2, sy - h, w, h);
      ctx.fillStyle = PAL[RAMPS.brown[2]];
      ctx.fillRect(sx - w / 2 + 1, sy - h + 1, w - 2, h - 3);
      view.sprites.draw(ctx, id, sx, sy - (h - 16) / 2 - 1, {});
    }
    if (e.p > 0 && e.p < 255) {
      ctx.fillStyle = PAL[RAMPS.ink[0]];
      ctx.fillRect(sx - 8, sy + 1, 16, 3);
      ctx.fillStyle = PAL[RAMPS.gold[3]];
      ctx.fillRect(sx - 7, sy + 2, Math.round((14 * e.p) / 255), 1);
    }
  },
};
