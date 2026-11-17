// WP11: castaway NPCs. Sprite 'npc.<kind>' (WP3; placeholder until then) with an idle breath and a walk bob,
// flipped by facing, a name tag when the local player is close, and a bouncing quest marker:
// '!' gold = a quest step is available to you, '?' green = ready to turn in (from self.quests.markers, falling back
// to the shared public key `q`).

import { drawText } from '../text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { content } from '../../../shared/data/index.js';

const NAME_RANGE = 5;      // tiles

export default {
  kinds: [],
  types: ['npc'],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    const walking = e.s === 1;
    const phase = (e.i % 7) * 0.9;
    const bob = walking ? Math.round(Math.abs(Math.sin(time * 9 + phase)) * -1.5) : 0;
    const breathe = walking ? 1 : 1 + Math.sin(time * 2.1 + phase) * 0.03;
    view.sprites.drawShadow(ctx, sx, sy, 12);
    const sq = view.juice?.squashOf?.(e.i) ?? { sx: 1, sy: 1 };
    view.sprites.draw(ctx, 'npc.' + e.k, sx, sy + 2 + bob, {
      time, anim: walking ? 'walk' : 'idle', flip: e.f >= 3 && e.f <= 5, scaleX: sq.sx, scaleY: sq.sy * breathe,
    });

    const store = view.store;
    const marker = store?.self?.quests?.markers?.[e.k] ?? e.q ?? 0;
    const me = store?.me?.();
    const near = me && Math.hypot((me.rx ?? me.x) - e.rx, (me.ry ?? me.y) - e.ry) < NAME_RANGE;
    const headY = sy - 26;
    if (marker) {
      const b = Math.round(Math.sin(time * 4 + phase) * 2);
      const col = marker === 2 ? PAL[RAMPS.grass[4]] : PAL[RAMPS.gold[4]];
      const my = headY - 8 + b;
      ctx.fillStyle = PAL[RAMPS.ink[0]];
      ctx.fillRect(sx - 4, my - 1, 9, 11);
      ctx.fillStyle = col;
      ctx.fillRect(sx - 3, my, 7, 9);
      drawText(ctx, marker === 2 ? '?' : '!', sx - 2, my + 1, { color: PAL[RAMPS.ink[0]], outline: false });
    }
    if (near) {
      const def = content.npcs.byId[e.k];
      const name = def ? def.name.split(/[,]/)[0] : e.k;
      drawText(ctx, name, sx, headY + (marker ? -20 : 0), { color: PAL[RAMPS.sand[4]], align: 'center' });
    }
  },
};
