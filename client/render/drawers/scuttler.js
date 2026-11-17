// Scuttler drawer (WP8): the Burrow helpers. State id = base state + 16 * hat index (hats are Logbook cosmetics with
// sprites helper.scuttler.<id>); base 1 walking, 2 rummaging at a node, 0 resting. Carried item rides on the shell.

import { PAL, RAMPS } from '../../art/palette.js';

const HATS = ['none', 'cos_d_machines', 'cos_d_burrow', 'cos_d_sluice', 'cos_d_gulls', 'cos_d_auto', 'cos_d_flux', 'cos_d_sold', 'cos_d_glint', 'cos_d_mint', 'cos_d_tend'];
const C = (ramp, i) => PAL[RAMPS[ramp][i]];

function crab(ctx, sx, sy, time, walking) {
  const leg = walking ? Math.floor(time * 12) % 2 : 0;
  ctx.fillStyle = C('ember', 1);
  ctx.fillRect(sx - 5, sy - 3 + leg, 2, 2); ctx.fillRect(sx + 3, sy - 3 + (1 - leg), 2, 2);
  ctx.fillStyle = C('ember', 2); ctx.fillRect(sx - 4, sy - 7, 8, 5);
  ctx.fillStyle = C('ember', 3); ctx.fillRect(sx - 3, sy - 7, 6, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 2, sy - 9, 1, 2); ctx.fillRect(sx + 1, sy - 9, 1, 2);
}

export default {
  kinds: ['scuttler'],
  types: [],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y + 4);
    const base = (e.s ?? 0) % 16;
    const hat = HATS[Math.floor((e.s ?? 0) / 16)] ?? 'none';
    const walking = base === 1;
    const working = base === 2;
    view.sprites.drawShadow(ctx, sx, sy, 8, 0.3);
    let id = hat !== 'none' && view.sprites.has('helper.scuttler.' + hat) ? 'helper.scuttler.' + hat : 'helper.scuttler';
    const hop = working ? -Math.abs(Math.round(Math.sin(time * 14) * 1.5)) : 0;
    if (view.sprites.has(id)) {
      view.sprites.draw(ctx, id, sx, sy + hop, { anim: e.it ? 'carry' : walking ? 'walk' : 'idle', time: time + e.i * 0.13, flip: e.f === 4 });
    } else crab(ctx, sx, sy + hop, time, walking);
    if (e.it) view.sprites.draw(ctx, 'item.' + e.it, sx, sy - 7 + hop, { scaleX: 0.5, scaleY: 0.5 });
    if (working && Math.floor(time * 6 + e.i) % 3 === 0) {
      ctx.fillStyle = C('sand', 4);
      ctx.fillRect(sx - 5 + (Math.floor(time * 20) % 10), sy - 2, 1, 1);
    }
    void id;
  },
};
