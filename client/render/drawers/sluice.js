// Sluice drawer (WP8): water channel tile flowing along its rotation (WP3 `struct.sluice_k.r<rot>` sprites, procedural
// fallback), and the item riding on it. The server only patches `it` when the tile's item changes (TECH_SPEC 6.5);
// the item is slid across the tile locally at the Sluice speed (1/2/4 tiles/s) from the moment the patch arrives.

import { PAL, RAMPS } from '../../art/palette.js';

const SPEED = { sluice_1: 1, sluice_2: 2, sluice_3: 4 };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const C = (ramp, i) => PAL[RAMPS[ramp][i]];

function channel(ctx, sx, sy, rot, time, speed) {
  const [dx, dy] = DIRS[rot & 3];
  const x0 = sx - 8, y0 = sy - 16;
  ctx.fillStyle = C('brown', 1); ctx.fillRect(x0, y0 + 1, 16, 15);
  ctx.fillStyle = C('brown', 3);
  if (dx) { ctx.fillRect(x0, y0 + 2, 16, 2); ctx.fillRect(x0, y0 + 13, 16, 2); }
  else { ctx.fillRect(x0 + 1, y0 + 1, 2, 15); ctx.fillRect(x0 + 13, y0 + 1, 2, 15); }
  ctx.fillStyle = C('sea', 2);
  if (dx) ctx.fillRect(x0, y0 + 4, 16, 9); else ctx.fillRect(x0 + 3, y0 + 1, 10, 15);
  ctx.fillStyle = C('sea', 4);
  const phase = (time * speed * 16) % 16;
  for (let k = 0; k < 3; k++) {
    const o = (phase + k * 6) % 16;
    if (dx) ctx.fillRect(dx > 0 ? x0 + o : x0 + 15 - o, y0 + 6 + k * 2, 2, 1);
    else ctx.fillRect(x0 + 5 + k * 2, dy > 0 ? y0 + 1 + o : y0 + 15 - o, 1, 2);
  }
}

export default {
  kinds: ['sluice_1', 'sluice_2', 'sluice_3'],
  types: [],

  update(e, dt, view) {
    if (e._it !== e.it) { e._it = e.it; e._itT = view.now; }
  },

  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y + 8);
    const rot = (e.rot ?? 0) & 3;
    const speed = SPEED[e.k] ?? 1;
    const id = `struct.${e.k}.r${rot}`;
    if (view.sprites.has(id)) {
      const flowing = e.on !== 0;
      view.sprites.draw(ctx, id, sx, sy, { frame: flowing ? Math.floor(time * 6 * speed) % 4 : 0, alpha: flowing ? 1 : 0.7 });
    } else channel(ctx, sx, sy, rot, e.on === 0 ? 0 : time, speed);
    if (!e.it) return;
    const [dx, dy] = DIRS[rot];
    const prog = Math.min(1, ((view.now - (e._itT ?? view.now)) / 1000) * speed);
    const off = (prog - 0.5) * 14;
    const bob = Math.round(Math.sin(time * 7 + e.i) * 0.6);
    view.sprites.draw(ctx, 'item.' + e.it, sx + dx * off, sy - 5 + dy * off + bob, { scaleX: 0.62, scaleY: 0.62 });
  },
};
