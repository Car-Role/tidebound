// WP4 chest drawer (type `chest`: sea_chest, tide_cache, chest). Uses 'chest.<kind>' sprites when WP3 provides
// them, else a procedural chest (wood body, metal bands, lid). Bobs a little, glints, and pops its lid open
// (squash + light rays) when its state goes non-idle (opened by its owning system).

import { PAL, RAMPS } from '../../art/palette.js';

const STYLE = {
  sea_chest: { body: RAMPS.brown, band: RAMPS.stone, glint: RAMPS.ice },
  tide_cache: { body: RAMPS.teal, band: RAMPS.gold, glint: RAMPS.gold },
  chest: { body: RAMPS.brown, band: RAMPS.gold, glint: RAMPS.gold },
};
const c = (r, i) => PAL[r[i]];

export default {
  kinds: [],
  types: ['chest'],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y) + 5;
    const id = 'chest.' + e.k;
    const open = e.s !== 0 && e.s != null;
    view.sprites.drawShadow(ctx, sx, sy, 12);
    const sq = view.juice.squashOf(e.i);
    if (view.sprites.has(id)) {
      view.sprites.draw(ctx, id, sx, sy, { time, scaleX: sq.sx, scaleY: sq.sy, flash: e.flashUntil > view.now });
    } else {
      const st = STYLE[e.k] ?? STYLE.chest;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(sq.sx, sq.sy);
      // body
      ctx.fillStyle = c(RAMPS.ink, 0); ctx.fillRect(-7, -9, 14, 9);
      ctx.fillStyle = c(st.body, 1); ctx.fillRect(-6, -8, 12, 7);
      ctx.fillStyle = c(st.body, 2); ctx.fillRect(-6, -8, 12, 2);
      // lid
      const lift = open ? 4 : 0;
      ctx.fillStyle = c(RAMPS.ink, 0); ctx.fillRect(-7, -13 - lift, 14, 5);
      ctx.fillStyle = c(st.body, 2); ctx.fillRect(-6, -12 - lift, 12, 3);
      ctx.fillStyle = c(st.body, 3); ctx.fillRect(-6, -12 - lift, 12, 1);
      // bands and lock
      ctx.fillStyle = c(st.band, 2); ctx.fillRect(-4, -12 - lift, 2, 11 + lift); ctx.fillRect(2, -12 - lift, 2, 11 + lift);
      ctx.fillStyle = c(st.band, 4); ctx.fillRect(-1, -9, 2, 3);
      if (open) {
        ctx.globalAlpha = 0.35 + Math.sin(time * 6) * 0.1;
        ctx.fillStyle = c(RAMPS.gold, 4);
        ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(-11, -26); ctx.lineTo(-3, -26); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(11, -26); ctx.lineTo(3, -26); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // glint
      const ph = (time * 0.7 + e.i * 0.29) % 1;
      if (ph < 0.15) {
        ctx.globalAlpha = 1 - ph / 0.15;
        ctx.fillStyle = c(st.glint, 4);
        ctx.fillRect(sx + 4, sy - 14, 1, 3); ctx.fillRect(sx + 3, sy - 13, 3, 1);
        ctx.globalAlpha = 1;
      }
    }
  },
};
