// Courier Gull drawer (WP8): perched on its Roost when idle, flying high with a ground shadow and a feather trail
// (`gull_trail` preset, emitted locally every 0.5 s) when moving; the carried item hangs below it.

import { PAL, RAMPS } from '../../art/palette.js';

const C = (ramp, i) => PAL[RAMPS[ramp][i]];
const ALT = 12;

function bird(ctx, sx, sy, time, flying, flip) {
  const flap = flying ? Math.floor(time * 10) % 2 : 0;
  ctx.fillStyle = C('stone', 4); ctx.fillRect(sx - 3, sy - 4, 6, 3);
  ctx.fillStyle = '#ffffff';
  if (flying) {
    ctx.fillRect(sx - 7, sy - 5 - (flap ? 2 : 0), 4, 1); ctx.fillRect(sx + 3, sy - 5 - (flap ? 2 : 0), 4, 1);
  } else ctx.fillRect(sx - 3, sy - 3, 5, 1);
  ctx.fillStyle = C('gold', 3); ctx.fillRect(flip ? sx - 5 : sx + 3, sy - 4, 2, 1);
}

export default {
  kinds: ['gull'],
  types: [],

  update(e, dt, view) {
    if (e.s !== 1) return;
    e._trail = (e._trail ?? 0) + dt;
    if (e._trail >= 0.5) {
      e._trail = 0;
      if (view.particles.has('gull_trail')) view.particles.emit('gull_trail', e.rx, e.ry - ALT / 16, {});
    }
  },

  draw(ctx, e, time, view) {
    const flying = e.s === 1;
    const sx = Math.round(e.rx * 16 - view.x), gy = Math.round(e.ry * 16 - view.y + 4);
    const sy = flying ? gy - ALT - Math.round(Math.sin(time * 3 + e.i) * 1.5) : gy;
    if (flying) view.sprites.drawShadow(ctx, sx, gy, 8, 0.22);
    const flip = e.f === 4;
    if (view.sprites.has('helper.gull')) view.sprites.draw(ctx, 'helper.gull', sx, sy, { anim: flying ? 'fly' : 'idle', time: time + e.i * 0.21, flip });
    else bird(ctx, sx, sy, time, flying, flip);
    if (e.it) view.sprites.draw(ctx, 'item.' + e.it, sx, sy + 7, { scaleX: 0.5, scaleY: 0.5 });
  },
};
