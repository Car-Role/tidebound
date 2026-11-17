// WP6b drawer for type 'summon' (turret_pocket, sproutling, battle_scuttler and proc companions).
// Uses WP3's 'summon.<kind>' sprite when one exists, else draws a small animated pixel figure from the palette.

import { PAL, RAMPS } from '../../art/palette.js';

const P = (r, i) => PAL[RAMPS[r][i]];
const C = {
  ink: P('ink', 0), brassD: P('gold', 1), brass: P('gold', 2), brassL: P('gold', 3), steel: P('stone', 2), steelL: P('stone', 4),
  leafD: P('grass', 1), leaf: P('grass', 3), leafL: P('grass', 4), stem: P('grass', 2), bud: P('flesh', 3), eye: '#ffffff', glow: P('teal', 4),
  hp: P('ember', 2), hpBg: P('ink', 1),
};
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function turret(ctx, x, y, e, t) {
  // tripod
  px(ctx, x - 5, y - 2, 2, 3, C.steel); px(ctx, x + 3, y - 2, 2, 3, C.steel); px(ctx, x - 1, y - 1, 2, 2, C.steel);
  // body
  px(ctx, x - 4, y - 9, 8, 7, C.ink); px(ctx, x - 3, y - 8, 6, 5, C.brass); px(ctx, x - 3, y - 8, 6, 1, C.brassL);
  // barrel toward facing
  const [dx, dy] = DIRS[(e.f ?? 0) & 7];
  for (let i = 1; i <= 5; i++) px(ctx, x + dx * i - 1, y - 6 + dy * i * 0.6 - 1, 2, 2, i === 5 ? C.ink : C.steelL);
  // blinking eye
  if (Math.sin(t * 6 + (e.i || 0)) > -0.6) px(ctx, x - 1, y - 7, 2, 2, C.glow);
}

function sproutling(ctx, x, y, e, t) {
  const bob = Math.round(Math.sin(t * 5 + (e.i || 0)) * 1);
  px(ctx, x - 1, y - 6 + bob, 2, 5, C.stem);
  // bulb
  px(ctx, x - 4, y - 11 + bob, 8, 6, C.ink); px(ctx, x - 3, y - 10 + bob, 6, 4, C.leaf); px(ctx, x - 3, y - 10 + bob, 6, 1, C.leafL);
  px(ctx, x - 2, y - 9 + bob, 1, 1, C.eye); px(ctx, x + 1, y - 9 + bob, 1, 1, C.eye);
  // leaves flap
  const flap = Math.sin(t * 8 + (e.i || 0)) > 0 ? 1 : 0;
  px(ctx, x - 7, y - 5 - flap, 5, 2, C.leafD); px(ctx, x - 6, y - 5 - flap, 3, 1, C.leaf);
  px(ctx, x + 2, y - 5 - (1 - flap), 5, 2, C.leafD); px(ctx, x + 3, y - 5 - (1 - flap), 3, 1, C.leaf);
  px(ctx, x - 1, y - 13 + bob, 2, 2, C.bud);
  // feet
  px(ctx, x - 3, y - 1, 2, 1, C.leafD); px(ctx, x + 1, y - 1, 2, 1, C.leafD);
}

function scuttler(ctx, x, y, e, t) {
  const moving = Math.abs((e.rx - (e._lx ?? e.rx))) + Math.abs((e.ry - (e._ly ?? e.ry))) > 0.001;
  e._lx = e.rx; e._ly = e.ry;
  const step = moving ? (Math.floor(t * 14 + (e.i || 0)) & 1) : 0;
  // legs
  for (let i = 0; i < 3; i++) {
    const up = (i + step) & 1;
    px(ctx, x - 7 + i * 2, y - 3 + up, 1, 3 - up, C.steel);
    px(ctx, x + 2 + i * 2, y - 3 + (1 - up), 1, 3 - (1 - up), C.steel);
  }
  // shell
  px(ctx, x - 6, y - 8, 12, 6, C.ink); px(ctx, x - 5, y - 7, 10, 4, C.brass); px(ctx, x - 5, y - 7, 10, 1, C.brassL);
  px(ctx, x - 1, y - 9, 2, 2, C.brassD);
  // claws
  const snap = Math.sin(t * 9 + (e.i || 0)) > 0.7 ? 1 : 0;
  px(ctx, x - 9, y - 7 - snap, 3, 2, C.brassL); px(ctx, x + 6, y - 7 - snap, 3, 2, C.brassL);
  // eyes
  px(ctx, x - 3, y - 10, 1, 2, C.ink); px(ctx, x + 2, y - 10, 1, 2, C.ink);
  px(ctx, x - 3, y - 10, 1, 1, C.glow); px(ctx, x + 2, y - 10, 1, 1, C.glow);
}

const FIGURES = { turret_pocket: turret, sproutling, battle_scuttler: scuttler };

export default {
  kinds: [],
  types: ['summon'],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    const spriteId = 'summon.' + e.k;
    view.sprites.drawShadow(ctx, sx, sy, e.k === 'turret_pocket' ? 10 : 12);
    if (view.sprites.entries?.has?.(spriteId)) view.sprites.draw(ctx, spriteId, sx, sy + 2, { time, flip: e.f >= 3 && e.f <= 5 });
    else (FIGURES[e.k] ?? scuttler)(ctx, sx, sy, e, time);
    // spawn pop-in
    e._born ??= time;
    const age = time - e._born;
    if (age < 0.3) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - age / 0.3)})`; ctx.fillRect(sx - 7, sy - 12, 14, 12); }
    // HP bar when hurt
    if (e.mh > 0 && e.hp < e.mh) {
      const w = 12, f = Math.max(0, Math.min(1, e.hp / e.mh));
      px(ctx, sx - w / 2, sy - 16, w, 2, C.hpBg);
      px(ctx, sx - w / 2, sy - 16, Math.round(w * f), 2, C.leafL);
    }
  },
};
