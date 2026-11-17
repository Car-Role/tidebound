// Machine drawer (WP8): every machine structure except Sluices (Burrows, movers, Splitter, Hopper, Autobenches, Drill,
// Tiller Bot, producers, Gull Roost, Ledger Post, Mint, Echo Chamber, generators, turrets), plus the WP7 world pieces
// that have no sprite of their own: puzzle-shrine pieces, the shrine altar's solved glow and dig spots.
//
// Reads public keys: `on` (0/1), `p` (progress 0-255), `it` (item shown), `lv` status bits from systems/machines.js:
// 1 untended (blinking wrench), 2 low Flux, 4 working (animates), 8 off/disabled, 16 output full, 32 no input.
// Uses WP3 sprites `struct.<kind>` (and `.r<rot>` variants) when present, a procedural fallback otherwise.

import { content } from '../../../shared/data/index.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { weatherAt } from '../lighting.js';

const SLUICES = new Set(['sluice_1', 'sluice_2', 'sluice_3']);
const KINDS = content.structures.filter((s) => s.machine && !SLUICES.has(s.id)).map((s) => s.id);
const ST = { UNTENDED: 1, LOWFLUX: 2, WORKING: 4, OFF: 8, BLOCKED: 16, NOINPUT: 32 };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const C = (ramp, i) => PAL[RAMPS[ramp][i]];

// ---------------------------------------------------------------- procedural fallbacks

const FALLBACK_COLORS = {
  burrow: ['brown', 'sand'], hopper: ['stone', 'brown'], mover: ['stone', 'gold'], splitter: ['brown', 'teal'],
  autobench: ['stone', 'gold'], drill: ['stone', 'ember'], tiller: ['grass', 'stone'], producer: ['brown', 'teal'],
  courier: ['brown', 'stone'], seller: ['gold', 'brown'], echo: ['violet', 'ink'], generator: ['sea', 'ice'], turret: ['stone', 'ember'],
};

function fallback(ctx, e, def, sx, sy, time, working) {
  const w = (def.w ?? 1) * 16, h = (def.h ?? 1) * 16 + 6;
  const [a, b] = FALLBACK_COLORS[def.machine?.type] ?? ['stone', 'brown'];
  const x0 = sx - w / 2, y0 = sy - h;
  ctx.fillStyle = C(a, 0); ctx.fillRect(x0, y0 + 2, w, h - 2);
  ctx.fillStyle = C(a, 2); ctx.fillRect(x0 + 1, y0 + 3, w - 2, h - 5);
  ctx.fillStyle = C(a, 3); ctx.fillRect(x0 + 1, y0 + 3, w - 2, 2);
  ctx.fillStyle = C(b, working ? 4 : 2);
  const bw = Math.max(4, Math.round(w / 3));
  ctx.fillRect(sx - bw / 2, y0 + h / 2 - 2, bw, 4);
  if (working) {
    ctx.fillStyle = C('gold', 4);
    const k = Math.floor(time * 8) % 4;
    ctx.fillRect(sx - bw / 2 + k, y0 + h / 2 - 3, 1, 1);
  }
}

// ---------------------------------------------------------------- shrine pieces (WP7)

function drawPiece(ctx, e, sx, sy, time) {
  const flash = e.on === 2 && Math.floor(time * 10) % 2 === 0;
  switch (e.it) {
    case 'plate': {
      ctx.fillStyle = C('stone', 0); ctx.fillRect(sx - 7, sy - 8, 14, 9);
      ctx.fillStyle = e.on === 1 ? C('teal', 4) : e.on === 2 ? (flash ? '#ffffff' : C('teal', 3)) : C('stone', 2);
      ctx.fillRect(sx - 6, sy - 7, 12, 7);
      ctx.fillStyle = e.on ? C('ice', 4) : C('stone', 1);
      ctx.fillRect(sx - 2, sy - 5, 4, 1); ctx.fillRect(sx - 1, sy - 6, 2, 3);
      break;
    }
    case 'mark': {
      ctx.fillStyle = e.on ? C('gold', 4) : C('gold', 2);
      ctx.fillRect(sx - 7, sy - 9, 14, 1); ctx.fillRect(sx - 7, sy - 1, 14, 1);
      ctx.fillRect(sx - 7, sy - 9, 1, 9); ctx.fillRect(sx + 6, sy - 9, 1, 9);
      if (e.on) { ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time * 4); ctx.fillRect(sx - 6, sy - 8, 12, 7); ctx.globalAlpha = 1; }
      break;
    }
    case 'block': {
      ctx.fillStyle = C('stone', 0); ctx.fillRect(sx - 7, sy - 15, 14, 15);
      ctx.fillStyle = C('stone', 2); ctx.fillRect(sx - 6, sy - 14, 12, 12);
      ctx.fillStyle = C('stone', 3); ctx.fillRect(sx - 6, sy - 14, 12, 3);
      ctx.fillStyle = C('violet', 3); ctx.fillRect(sx - 2, sy - 9, 4, 4);
      break;
    }
    case 'brazier': {
      ctx.fillStyle = C('stone', 0); ctx.fillRect(sx - 5, sy - 6, 10, 6);
      ctx.fillStyle = C('stone', 2); ctx.fillRect(sx - 4, sy - 5, 8, 4);
      ctx.fillStyle = C('stone', 1); ctx.fillRect(sx - 6, sy - 8, 12, 2);
      if (e.on) {
        for (let i = 0; i < 5; i++) {
          const fh = 3 + ((Math.sin(time * 12 + i * 1.7) + 1) * 2.5) | 0;
          ctx.fillStyle = i % 2 ? C('ember', 4) : C('gold', 4);
          ctx.fillRect(sx - 4 + i * 2, sy - 8 - fh, 2, fh);
        }
      } else {
        ctx.fillStyle = C('ink', 3); ctx.fillRect(sx - 4, sy - 9, 8, 1);
      }
      break;
    }
    case 'chime': {
      const hue = ['ember', 'gold', 'grass', 'teal', 'sea', 'violet'][e.lv % 6];
      const sway = Math.round(Math.sin(time * 2 + e.lv) * (e.on === 2 ? 2 : 0.6));
      ctx.fillStyle = C('brown', 1); ctx.fillRect(sx - 6, sy - 20, 12, 2); ctx.fillRect(sx - 6, sy - 20, 1, 20); ctx.fillRect(sx + 5, sy - 20, 1, 20);
      ctx.fillStyle = e.on === 2 || e.on === 1 && flash ? '#ffffff' : C(hue, e.on ? 4 : 3);
      ctx.fillRect(sx - 2 + sway, sy - 17, 4, 9);
      ctx.fillStyle = C(hue, 1); ctx.fillRect(sx - 2 + sway, sy - 9, 4, 1);
      break;
    }
    case 'pedestal': {
      ctx.fillStyle = C('stone', 1); ctx.fillRect(sx - 4, sy - 12, 8, 12);
      ctx.fillStyle = C('stone', 3); ctx.fillRect(sx - 5, sy - 13, 10, 2);
      ctx.fillStyle = e.on ? C('teal', 4) : C('sea', 3);
      const bob = Math.round(Math.sin(time * 2.4) * 1.5);
      ctx.fillRect(sx - 2, sy - 18 + bob, 4, 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy - 18 + bob, 1, 1);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- status glyphs

function wrench(ctx, view, x, y, time) {
  if (Math.floor(time * 2.5) % 2) return;
  if (view.sprites.has('decor.wrench')) view.sprites.draw(ctx, 'decor.wrench', x, y, {});
  else { ctx.fillStyle = C('gold', 4); ctx.fillRect(x - 3, y - 6, 2, 6); ctx.fillRect(x - 4, y - 7, 4, 2); }
}

function bolt(ctx, x, y) {
  ctx.fillStyle = C('ember', 3);
  ctx.fillRect(x, y, 2, 3); ctx.fillRect(x - 1, y + 3, 3, 1); ctx.fillRect(x - 1, y + 4, 2, 3);
}

function itemPop(ctx, view, e, sx, top) {
  if (!e.it || !e._itT) return;
  const age = (view.now - e._itT) / 1000;
  if (age > 1.1) return;
  const y = top - 4 - age * 10;
  view.sprites.draw(ctx, 'item.' + e.it, sx, y, { alpha: Math.max(0, 1 - age), scaleX: 0.6, scaleY: 0.6 });
}

export default {
  kinds: [...KINDS, 'shrine_piece', 'shrine', 'dig_spot'],
  types: [],

  update(e, dt, view) {
    if (e._lastIt !== e.it) { e._lastIt = e.it; e._itT = view.now; }
  },

  draw(ctx, e, time, view) {
    const def = view.content.structures.byId[e.k];
    const tw = def?.w ?? 1, th = def?.h ?? 1;
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y + (th * 16) / 2);
    if (e.k === 'shrine_piece') { drawPiece(ctx, e, sx, sy, time); return; }
    if (e.k === 'dig_spot') {
      const fr = e.p > 170 ? 2 : e.p > 60 ? 1 : 0;
      view.sprites.draw(ctx, 'struct.dig_spot', sx, sy, { frame: fr });
      if (weatherAt(view.store, e.rx, e.ry) === 'fog' || Math.floor(time * 1.3 + e.i) % 5 === 0) {
        ctx.fillStyle = '#fff08a';
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 6 + e.i);
        ctx.fillRect(sx - 1 + (e.i % 5) - 2, sy - 9, 2, 2);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (e.k === 'shrine') {
      const solved = e.p >= 255;
      view.sprites.draw(ctx, 'struct.shrine', sx, sy, { frame: solved ? 2 : Math.floor(time * 1.5) % 2 });
      if (solved) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(time * 2);
        ctx.fillStyle = C('teal', 4);
        ctx.fillRect(sx - 10, sy - 50, 20, 40);
        ctx.restore();
      }
      return;
    }

    const m = def?.machine;
    const lv = e.lv | 0;
    const working = (lv & ST.WORKING) !== 0 && e.on !== 0;
    const off = e.on === 0 || (lv & ST.OFF) !== 0;
    const sprites = view.sprites;
    view.sprites.drawShadow(ctx, sx, sy - 1, Math.round(tw * 14), 0.3);
    let id = 'struct.' + e.k;
    const rid = id + '.r' + ((e.rot ?? 0) & 3);
    if (sprites.has(rid)) id = rid;
    let topY = sy - th * 16 - 6;
    if (sprites.has(id)) {
      const n = sprites.entries.get(id)?.variants?.[0]?.[sprites.entries.get(id)?.defaultAnim]?.length ?? 1;
      const spd = m?.type === 'generator' ? 6 : 8;
      const frame = working && n > 1 ? 1 + (Math.floor(time * spd + e.i) % (n - 1)) : 0;
      const sq = view.juice.squashOf(e.i);
      sprites.draw(ctx, id, sx, sy, { frame, alpha: off ? 0.65 : 1, scaleX: sq.sx, scaleY: sq.sy });
      topY = sy - sprites.size(id).h;
    } else {
      fallback(ctx, e, def ?? { w: 1, h: 1 }, sx, sy, time, working);
    }

    // movers carry their item between the tiles behind and in front
    if (m?.type === 'mover' && e.it) {
      const [dx, dy] = DIRS[(e.rot ?? 0) & 3];
      const k = working ? Math.sin(time * 6 + e.i) * 4 : 0;
      sprites.draw(ctx, 'item.' + e.it, sx + dx * k, sy - 9 + dy * k, { scaleX: 0.6, scaleY: 0.6 });
    } else if (m?.type === 'splitter' && e.it) {
      sprites.draw(ctx, 'item.' + e.it, sx, sy - 7, { scaleX: 0.55, scaleY: 0.55 });
    } else if (m && m.type !== 'generator') {
      itemPop(ctx, view, e, sx, topY);
    }

    // progress bar for crafters and slow producers
    if (e.p > 0 && e.p < 255 && m && m.type !== 'generator') {
      ctx.fillStyle = C('ink', 0); ctx.fillRect(sx - 8, sy + 1, 16, 3);
      ctx.fillStyle = C('gold', 3); ctx.fillRect(sx - 7, sy + 2, Math.round((14 * e.p) / 255), 1);
    }
    // generator output meter
    if (m?.type === 'generator' && e.p > 0) {
      ctx.fillStyle = C('ink', 0); ctx.fillRect(sx - 8, sy + 1, 16, 3);
      ctx.fillStyle = C('ice', 4); ctx.fillRect(sx - 7, sy + 2, Math.round((14 * e.p) / 255), 1);
      if (working && Math.floor(time * 12 + e.i) % 9 === 0) { ctx.fillStyle = '#dcf2fa'; ctx.fillRect(sx - 3 + (e.i % 7), topY + 4, 1, 3); }
    }

    // status glyphs
    let gx = sx + tw * 8 - 4;
    const gy = topY - 2;
    if (lv & ST.UNTENDED) { wrench(ctx, view, sx, gy, time); }
    if (lv & ST.LOWFLUX) { bolt(ctx, gx, gy - 6); gx -= 5; }
    if (off) { ctx.fillStyle = C('ember', 2); ctx.fillRect(gx - 1, gy - 5, 4, 1); ctx.fillRect(gx - 1, gy - 2, 4, 1); gx -= 5; }
    if (lv & ST.BLOCKED && !off) { ctx.fillStyle = C('gold', 4); ctx.fillRect(gx, gy - 6, 1, 4); ctx.fillRect(gx, gy - 1, 1, 1); }
  },
};
