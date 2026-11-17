// WP9 bobber drawer (kind `bobber`; public keys own = angler id, b = 0 waiting / 1 bite / 2 reeling).
// Draws the fishing line from the angler's rod tip, a red-and-white float that bobs on the water, ripples, a dip on
// the bite and a taut, twitching line while reeling.

import { PAL, RAMPS } from '../../art/palette.js';

const RED = PAL[RAMPS.ember[3]], WHITE = '#ffffff', LINE = 'rgba(235,235,235,0.75)', RIPPLE = PAL[RAMPS.sea[4]];

export default {
  kinds: ['bobber'],
  types: [],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    const state = e.b ?? 0;
    const bite = state === 1, reel = state === 2;
    const dip = bite ? (Math.sin(time * 30) > 0 ? 2 : 1) : reel ? Math.round(Math.sin(time * 18) * 1.5) : Math.round(Math.sin(time * 2.4 + e.i) * 1);
    // ripples
    const rp = (time * (bite ? 2.5 : 0.8) + e.i * 0.13) % 1;
    ctx.globalAlpha = (1 - rp) * (bite ? 0.9 : 0.5);
    ctx.strokeStyle = RIPPLE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(sx + 0.5, sy + 1.5, 2 + rp * (bite ? 9 : 6), 1 + rp * (bite ? 3 : 2), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // line from the angler
    const owner = view.store.entities.get(e.own);
    if (owner) {
      const ox = Math.round((owner.rx ?? owner.x) * 16 - view.x) + ((owner.f ?? 2) >= 3 && (owner.f ?? 2) <= 5 ? -7 : 7);
      const oy = Math.round((owner.ry ?? owner.y) * 16 - view.y) - 18;
      ctx.strokeStyle = LINE; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + 0.5, oy + 0.5);
      const mx = (ox + sx) / 2, my = (oy + sy) / 2 + (reel ? 0 : 10);
      ctx.quadraticCurveTo(mx, my + (reel ? Math.sin(time * 40) * 1.5 : 0), sx + 0.5, sy - 3 + dip);
      ctx.stroke();
    }
    // float
    const y = sy - 4 + dip;
    ctx.fillStyle = RED; ctx.fillRect(sx - 1, y, 3, 2);
    ctx.fillStyle = WHITE; ctx.fillRect(sx - 1, y + 2, 3, 2);
    ctx.fillStyle = PAL[RAMPS.ink[0]]; ctx.fillRect(sx, y - 2, 1, 2);
    if (bite) { ctx.fillStyle = WHITE; ctx.fillRect(sx - 3, y + 3, 1, 1); ctx.fillRect(sx + 3, y + 3, 1, 1); }
  },
};
