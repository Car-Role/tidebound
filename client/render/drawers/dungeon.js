// WP10 dungeon drawer: Vault and Trench entrances (swirling portals), puzzle pieces (levers, pressure plates,
// mirrors + the live beam path, ice blocks and frost marks, braziers), blessing altars, stairs, exits, Trench
// portals, Vault chests, Keeper props (flood levers, mirrors, warm braziers) and the Tide Pup companion.

import { PAL, RAMPS } from '../../art/palette.js';
import { ensurePasses, ground, registerGround, C } from './zone.js';

const TAU = Math.PI * 2;
const KINDS = ['vault_entrance', 'trench_entrance', 'lever', 'flood_lever', 'plate', 'mirror', 'keeper_mirror', 'beam_emitter', 'beam_receiver',
  'ice_block', 'ice_mark', 'brazier', 'keeper_brazier', 'blessing_altar', 'vault_stairs', 'vault_exit', 'trench_portal', 'trench_exit', 'vault_chest', 'tide_pup'];

function portal(ctx, x, y, r, time, ramp, depth = 1) {
  for (let i = 0; i < 5; i++) {
    const rr = r * (1 - i * 0.18);
    ctx.globalAlpha = 0.35 + i * 0.12;
    ctx.fillStyle = C(ramp, Math.min(4, i));
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const a = time * (1.5 + depth) + i * 1.05;
    const rr = r * (0.3 + ((time * 0.6 + i * 0.17) % 1) * 0.6);
    ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.55), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function dungeonGround(ctx, e, view) {
  const x = e.rx * 16 - view.x, y = e.ry * 16 - view.y;
  switch (e.k) {
    case 'plate': {
      ctx.fillStyle = PAL[RAMPS.stone[0]]; ctx.fillRect(Math.round(x) - 7, Math.round(y) - 7, 14, 14);
      ctx.fillStyle = e.it ? C('grass', 3) : e.p === 2 ? C('gold', 4) : C('stone', 2);
      ctx.fillRect(Math.round(x) - 6, Math.round(y) - 6 + (e.it ? 1 : 0), 12, 12);
      break;
    }
    case 'ice_mark': {
      ctx.globalAlpha = e.it ? 0.9 : 0.55 + 0.2 * Math.sin(view.time * 3);
      ctx.strokeStyle = e.it ? C('grass', 4) : C('ice', 4);
      ctx.strokeRect(Math.round(x) - 7.5, Math.round(y) - 7.5, 15, 15);
      ctx.fillStyle = C('ice', 3); ctx.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 8); ctx.fillRect(Math.round(x) - 4, Math.round(y) - 1, 8, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'beam_emitter': {
      const bp = e.bp ?? [];
      if (bp.length > 1) {
        ctx.save();
        for (const [w, c, a] of [[5, C('ember', 3), 0.35], [3, C('gold', 4), 0.8], [1, '#ffffff', 1]]) {
          ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(view.time * 25)); ctx.strokeStyle = c; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(bp[0][0] * 16 - view.x, bp[0][1] * 16 - view.y - 4);
          for (let i = 1; i < bp.length; i++) ctx.lineTo(bp[i][0] * 16 - view.x, bp[i][1] * 16 - view.y - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case 'vault_entrance': case 'trench_entrance': case 'trench_portal': {
      const r = e.k === 'trench_portal' ? 14 : 22;
      portal(ctx, x, y + (e.k === 'vault_entrance' ? 4 : 0), r, view.time, e.k === 'vault_entrance' ? 'violet' : 'sea', e.k === 'vault_entrance' ? 0.5 : 1.5);
      break;
    }
    case 'blessing_altar': {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(view.time * 2.5); ctx.fillStyle = C('gold', 4);
      ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 8, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      break;
    }
    case 'keeper_brazier': case 'brazier': {
      if (e.k === 'brazier' && !e.on) break;
      ctx.globalAlpha = 0.18 + 0.06 * Math.sin(view.time * 7 + e.i); ctx.fillStyle = C('ember', 4);
      ctx.beginPath(); ctx.ellipse(x, y, 40, 28, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      break;
    }
    default:
  }
}
registerGround('structure', dungeonGround);
registerGround('chest', () => {});
registerGround('summon', () => {});

export default {
  kinds: KINDS,
  types: [],
  update(e, dt, view) {
    ensurePasses(view);
    ground(e);
  },
  draw(ctx, e, time, view) {
    const x = Math.round(e.rx * 16 - view.x), y = Math.round(e.ry * 16 - view.y);
    const has = (id) => view.sprites.has(id);
    switch (e.k) {
      case 'vault_entrance': case 'trench_entrance': {
        const id = 'struct.' + e.k;
        if (has(id)) view.sprites.draw(ctx, id, x, y + 8, { time });
        else if (e.k === 'vault_entrance') {
          ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 24, y - 26, 8, 30); ctx.fillRect(x + 16, y - 26, 8, 30); ctx.fillRect(x - 24, y - 32, 48, 8);
          ctx.fillStyle = C('stone', 3); ctx.fillRect(x - 22, y - 30, 44, 3);
          ctx.fillStyle = C('violet', 4); ctx.fillRect(x - 2, y - 30, 4, 3);
        }
        break;
      }
      case 'lever': case 'flood_lever': {
        ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 4, y - 4, 8, 5);
        const up = !e.it;
        ctx.fillStyle = e.p === 2 ? C('gold', 4) : C('brown', 3);
        ctx.save(); ctx.translate(x, y - 3); ctx.rotate(up ? -0.6 : 0.6); ctx.fillRect(-1, -10, 2, 10); ctx.restore();
        ctx.fillStyle = e.p === 2 ? '#ffffff' : C('ember', 3);
        ctx.fillRect(x + (up ? -7 : 5), y - 12, 3, 3);
        break;
      }
      case 'mirror': case 'keeper_mirror': {
        ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 3, y - 2, 6, 3);
        ctx.save(); ctx.translate(x, y - 8); ctx.rotate(e.k === 'keeper_mirror' ? time * 0.4 : (e.rot ? Math.PI / 4 : -Math.PI / 4));
        ctx.fillStyle = C('ice', 4); ctx.fillRect(-7, -1, 14, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(-5, -1, 4, 1);
        ctx.restore();
        break;
      }
      case 'beam_emitter': case 'beam_receiver': {
        ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 6, y - 12, 12, 13);
        const lit = e.k === 'beam_emitter' || e.it;
        ctx.fillStyle = lit ? C('gold', 4) : C('stone', 3); ctx.fillRect(x - 3, y - 9, 6, 6);
        if (lit) { ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 9); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 8, 4, 4); ctx.globalAlpha = 1; }
        break;
      }
      case 'ice_block': {
        ctx.fillStyle = C('ice', 1); ctx.fillRect(x - 8, y - 14, 16, 15);
        ctx.fillStyle = C('ice', 3); ctx.fillRect(x - 7, y - 13, 14, 12);
        ctx.fillStyle = C('ice', 4); ctx.fillRect(x - 6, y - 12, 5, 2); ctx.fillRect(x + 3, y - 6, 2, 3);
        break;
      }
      case 'brazier': case 'keeper_brazier': {
        ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 5, y - 6, 10, 7); ctx.fillStyle = C('stone', 3); ctx.fillRect(x - 6, y - 8, 12, 2);
        if (e.on || e.k === 'keeper_brazier') {
          for (let i = 0; i < 4; i++) {
            const h = 4 + ((time * 14 + i * 3) % 6);
            ctx.fillStyle = C('ember', 2 + (i % 3)); ctx.fillRect(x - 3 + i * 2, y - 8 - h, 2, h);
          }
        } else { ctx.fillStyle = C('ink', 2); ctx.fillRect(x - 4, y - 10, 8, 2); }
        break;
      }
      case 'blessing_altar': {
        const used = false;
        ctx.fillStyle = C('stone', 1); ctx.fillRect(x - 9, y - 6, 18, 7); ctx.fillStyle = C('stone', 3); ctx.fillRect(x - 10, y - 8, 20, 3);
        const bob = Math.sin(time * 2.5) * 2;
        ctx.globalAlpha = used ? 0.3 : 1;
        ctx.fillStyle = C('gold', 4); ctx.beginPath(); ctx.moveTo(x, y - 22 + bob); ctx.lineTo(x + 5, y - 15 + bob); ctx.lineTo(x, y - 9 + bob); ctx.lineTo(x - 5, y - 15 + bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 18 + bob, 2, 2);
        ctx.globalAlpha = 1;
        break;
      }
      case 'vault_stairs': {
        for (let i = 0; i < 4; i++) { ctx.fillStyle = C('ink', i); ctx.fillRect(x - 10 + i * 2, y - 8 + i * 3, 20 - i * 4, 3); }
        ctx.fillStyle = C('gold', 4); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 4); ctx.fillRect(x - 1, y - 14, 2, 4); ctx.globalAlpha = 1;
        break;
      }
      case 'vault_exit': case 'trench_exit': {
        portal(ctx, x, y, 10, time, 'gold', 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 16 - Math.round(Math.sin(time * 3) * 2), 2, 6);
        break;
      }
      case 'trench_portal': {
        ctx.fillStyle = C('sea', 4); ctx.fillRect(x - 1, y - 18 - Math.round(Math.sin(time * 3) * 2), 2, 6);
        break;
      }
      case 'vault_chest': {
        const opened = (e.own ?? 0) > 0;
        if (has('struct.chest')) { view.sprites.draw(ctx, 'struct.chest', x, y + 2, { time }); break; }
        view.sprites.drawShadow(ctx, x, y + 1, 16);
        ctx.fillStyle = C('brown', 1); ctx.fillRect(x - 8, y - 10, 16, 11);
        ctx.fillStyle = C('brown', 3); ctx.fillRect(x - 7, y - 9, 14, 9);
        ctx.fillStyle = C('gold', 3); ctx.fillRect(x - 8, y - 6, 16, 2); ctx.fillRect(x - 1, y - 7, 2, 4);
        if (!opened) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 5); ctx.fillStyle = C('gold', 4); ctx.fillRect(x + 6, y - 14, 1, 1); ctx.fillRect(x - 7, y - 12, 1, 1); ctx.globalAlpha = 1; }
        break;
      }
      case 'tide_pup': {
        const hop = Math.abs(Math.sin(time * 9 + e.i)) * 2;
        view.sprites.drawShadow(ctx, x, y, 9);
        ctx.fillStyle = C('ember', 2); ctx.fillRect(x - 4, y - 5 - hop, 8, 4);
        ctx.fillStyle = C('ember', 3); ctx.fillRect(x - 3, y - 6 - hop, 6, 2);
        ctx.fillStyle = C('ember', 1); ctx.fillRect(x - 6, y - 7 - hop, 2, 2); ctx.fillRect(x + 4, y - 7 - hop, 2, 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 8 - hop, 1, 1); ctx.fillRect(x + 1, y - 8 - hop, 1, 1);
        break;
      }
      default:
    }
  },
};
