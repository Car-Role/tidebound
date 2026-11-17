// WP5 projectile drawer: arrows, element orbs, seeds, homing bog orbs, icicles, darts, turret bolts, lobbed blobs
// (drawn on a parabola with a ground shadow; pub `tx, ty, ft`), with short motion trails.

import { C } from './zone.js';

const TAU = Math.PI * 2;
const ORB = { none: 'stone', tide: 'sea', ember: 'ember', storm: 'gold', frost: 'ice', hollow: 'violet' };
const LOBBED = new Set(['lava_blob', 'ink', 'pod', 'spore_pod']);

function glow(ctx, x, y, r, color, a) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

export default {
  kinds: [],
  types: ['proj'],
  update(e, dt) {
    // remember a short trail of render positions
    const tr = (e._trail ||= []);
    tr.push(e.rx, e.ry);
    if (tr.length > 8) tr.splice(0, tr.length - 8);
    if (e._sx == null) { e._sx = e.rx; e._sy = e.ry; }
  },
  draw(ctx, e, time, view) {
    const x = e.rx * 16 - view.x, y = e.ry * 16 - view.y;
    const a = e.a ?? 0;
    const k = e.k;
    ctx.save();
    if (LOBBED.has(k) && e.tx != null) {
      const total = Math.hypot(e.tx - e._sx, e.ty - e._sy) || 1;
      const p = Math.min(1, Math.hypot(e.rx - e._sx, e.ry - e._sy) / total);
      const h = 4 * 28 * p * (1 - p);
      view.sprites.drawShadow(ctx, x, y, 8, 0.3 + 0.3 * p);
      const col = k === 'lava_blob' ? 'ember' : k === 'ink' ? 'violet' : 'grass';
      glow(ctx, x, y - h - 2, 5, C(col, 2), 0.6);
      glow(ctx, x, y - h - 2, 3, C(col, 4), 1);
      ctx.restore();
      return;
    }
    // trail
    const tr = e._trail ?? [];
    for (let i = 0; i + 1 < tr.length; i += 2) {
      const tx = tr[i] * 16 - view.x, ty = tr[i + 1] * 16 - view.y;
      ctx.globalAlpha = 0.08 + (i / tr.length) * 0.3;
      ctx.fillStyle = k.startsWith('orb_') ? C(ORB[k.slice(4)] ?? 'stone', 3) : k === 'bog_orb' ? C('violet', 3) : '#ffffff';
      ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 3, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (view.sprites.has('proj.' + k)) {
      ctx.translate(Math.round(x), Math.round(y) - 3); ctx.rotate(a);
      view.sprites.draw(ctx, 'proj.' + k, 0, 0, { time });
      ctx.restore();
      return;
    }
    ctx.translate(Math.round(x), Math.round(y) - 3);
    if (k.startsWith('orb_')) {
      const col = ORB[k.slice(4)] ?? 'stone';
      const pulse = 1 + 0.15 * Math.sin(time * 20);
      glow(ctx, 0, 0, 5 * pulse, C(col, 2), 0.45); glow(ctx, 0, 0, 3, C(col, 4), 1); glow(ctx, -1, -1, 1, '#ffffff', 1);
    } else switch (k) {
      case 'arrow':
        ctx.rotate(a); ctx.fillStyle = C('brown', 3); ctx.fillRect(-6, 0, 9, 1); ctx.fillStyle = C('stone', 4); ctx.fillRect(3, -1, 2, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(-7, -1, 2, 3);
        break;
      case 'bolt':
        ctx.rotate(a); glow(ctx, 0, 0, 3, C('gold', 3), 0.5); ctx.globalAlpha = 1; ctx.fillStyle = C('gold', 4); ctx.fillRect(-4, 0, 8, 1);
        break;
      case 'seed':
        glow(ctx, 0, 0, 2.5, C('grass', 2), 1); ctx.fillStyle = C('grass', 4); ctx.fillRect(-1, -1, 1, 1);
        break;
      case 'bog_orb':
        glow(ctx, 0, 0, 6 + Math.sin(time * 9), C('violet', 2), 0.45); glow(ctx, 0, 0, 3.5, C('grass', 3), 0.9); glow(ctx, -1, -1, 1.2, '#ffffff', 1);
        break;
      case 'icicle': case 'ice_spike':
        ctx.rotate(a); ctx.fillStyle = C('ice', 4); ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -1, 3, 1);
        break;
      case 'quill_dart':
        ctx.rotate(a); ctx.fillStyle = C('ink', 0); ctx.fillRect(-6, -1, 10, 2); ctx.fillStyle = C('violet', 4); ctx.fillRect(3, -1, 2, 2);
        break;
      case 'barnacle':
        glow(ctx, 0, 0, 3, C('stone', 3), 1); ctx.fillStyle = C('stone', 1); ctx.fillRect(-1, -1, 2, 2);
        break;
      case 'prism_shard':
        ctx.rotate(time * 8); ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -2, 4, 4); ctx.fillStyle = C('violet', 4); ctx.fillRect(-1, -3, 2, 1);
        break;
      default:
        glow(ctx, 0, 0, 3, C('stone', 4), 1);
    }
    ctx.restore();
  },
};
