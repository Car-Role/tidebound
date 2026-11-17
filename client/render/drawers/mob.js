// WP5 mob drawer: sprite `mob.<kind>` when WP3 provides it, otherwise a procedural creature per enemy family.
// Adds: hit flash + squash, windup glow, elite gold outline + aura, status pips, HP bar when hurt, disguised /
// burrowed / shrouded states (pub `iv`), and the ground-pass telegraph (pub `tg`).

import { PAL, RAMPS } from '../../art/palette.js';
import { ensurePasses, ground, registerGround, drawEntityTelegraph, BIT, C } from './zone.js';

const TAU = Math.PI * 2;
// family look: [ramp, shape] ; shape: blob | bug | wisp | beast | knight | eye | lantern | wave | shard
const LOOK = {
  mossback: ['grass', 'bug'], thistlewisp: ['grass', 'wisp'], burrowgrub: ['brown', 'bug'], lantern_moth: ['gold', 'wisp'],
  clatterclaw: ['teal', 'bug'], fenleech: ['teal', 'blob'], reedstalker: ['grass', 'beast'], bogwisp: ['violet', 'wisp'], brine_shambler: ['teal', 'beast'],
  cinderling: ['ember', 'blob'], slagback: ['stone', 'bug'], ashwing: ['ember', 'wisp'], magmaw: ['ember', 'eye'], emberwraith: ['ember', 'wisp'],
  shardscuttle: ['ice', 'bug'], mirage_stalker: ['sand', 'beast'], dune_maw: ['sand', 'blob'], prism_sentinel: ['ice', 'eye'], glass_revenant: ['ice', 'knight'],
  rimewolf: ['ice', 'beast'], frostbulk: ['ice', 'blob'], stillwing: ['stone', 'wisp'], sleetspitter: ['ice', 'eye'], pale_shade: ['stone', 'wisp'],
  hollowling: ['violet', 'beast'], inkmaw: ['ink', 'eye'], refrain_knight: ['violet', 'knight'], gloom_lantern: ['violet', 'lantern'], abyss_eye: ['violet', 'eye'],
  tidewraith: ['sea', 'wave'], glass_shard: ['ice', 'shard'],
};

function statusPips(ctx, e, x, y) {
  const st = e.st | 0;
  if (!st) return;
  const pips = [];
  if (st & BIT.burn) pips.push(C('ember', 3));
  if (st & BIT.chill) pips.push(C('ice', 3));
  if (st & BIT.freeze) pips.push(C('ice', 4));
  if (st & BIT.stun) pips.push(C('gold', 4));
  if (st & BIT.slow) pips.push(C('sea', 3));
  if (st & BIT.mark) pips.push(C('ember', 1));
  if (st & BIT.bleed) pips.push(C('ember', 0));
  if (st & BIT.blind) pips.push(C('stone', 2));
  if (st & BIT.root) pips.push(C('brown', 3));
  if (st & BIT.shield) pips.push(C('sea', 4));
  if (st & BIT.haste) pips.push(C('grass', 4));
  let px = x - (pips.length * 4) / 2;
  for (const c of pips) { ctx.fillStyle = PAL[RAMPS.ink[0]]; ctx.fillRect(px - 1, y - 1, 4, 4); ctx.fillStyle = c; ctx.fillRect(px, y, 2, 2); px += 4; }
}

function hpBar(ctx, e, x, y, w) {
  if (!(e.mh > 0) || e.hp >= e.mh) return;
  ctx.fillStyle = PAL[RAMPS.ink[0]]; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
  ctx.fillStyle = PAL[RAMPS.ink[2]]; ctx.fillRect(x - w / 2, y, w, 2);
  ctx.fillStyle = e.el ? C('gold', 3) : C('ember', 3);
  ctx.fillRect(x - w / 2, y, Math.max(0, Math.round(w * e.hp / e.mh)), 2);
}

// Procedural fallback creature; px size scales with radius.
export function drawCreature(ctx, e, x, y, view, opts = {}) {
  const [ramp, shape] = LOOK[e.k] ?? ['stone', 'blob'];
  const r = Math.max(4, Math.round((e._rad ?? 0.4) * 16));
  const t = view.time + e.i * 0.37;
  const moving = e.s === 1;
  const bob = moving ? Math.abs(Math.sin(t * 10)) * 1.5 : Math.sin(t * 2) * 0.6;
  const flash = opts.flash;
  const body = flash ? '#ffffff' : C(ramp, 2), dark = flash ? '#ffffff' : C(ramp, 1), light = flash ? '#ffffff' : C(ramp, 4);
  const eye = flash ? '#ffffff' : (e.s === 6 ? C('ember', 4) : '#ffffff');
  const flip = e.f >= 3 && e.f <= 5 ? -1 : 1;
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(flip * (opts.sx ?? 1), opts.sy ?? 1);
  switch (shape) {
    case 'wisp': {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -r - 2, r * 0.8, r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -r - 3, r * 0.6, r * 0.55, 0, 0, TAU); ctx.fill();
      const wing = Math.sin(t * 16) * 3;
      ctx.fillStyle = light; ctx.globalAlpha = 0.6;
      ctx.fillRect(-r - 2, -r - 4 - wing, 3, 2); ctx.fillRect(r - 1, -r - 4 + wing, 3, 2);
      ctx.globalAlpha = 1; ctx.fillStyle = eye; ctx.fillRect(1, -r - 4, 2, 2);
      break;
    }
    case 'bug': {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r, r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-1, -r * 0.8, r * 0.8, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(-r * 0.5, -r * 1.2, r * 0.6, 1);
      const leg = moving ? Math.sin(t * 20) * 1.5 : 0;
      ctx.fillStyle = dark; for (const lx of [-r * 0.6, 0, r * 0.6]) ctx.fillRect(Math.round(lx + leg), -2, 1, 2);
      ctx.fillStyle = eye; ctx.fillRect(r * 0.6, -r * 0.9, 2, 2);
      break;
    }
    case 'beast': {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -r * 0.8, r * 1.1, r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-1, -r * 0.9, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(r * 0.9, -r * 1.2, r * 0.5, r * 0.45, 0, 0, TAU); ctx.fill();
      const leg = moving ? Math.sin(t * 16) * 2 : 0;
      ctx.fillStyle = dark; ctx.fillRect(-r * 0.6 + leg, -3, 2, 3); ctx.fillRect(r * 0.4 - leg, -3, 2, 3);
      ctx.fillStyle = eye; ctx.fillRect(r * 1.0, -r * 1.35, 2, 1);
      break;
    }
    case 'knight': {
      ctx.fillStyle = dark; ctx.fillRect(-r * 0.6, -r * 2.2, r * 1.2, r * 2.2);
      ctx.fillStyle = body; ctx.fillRect(-r * 0.5, -r * 2.1, r, r * 1.6);
      ctx.fillStyle = light; ctx.fillRect(-r * 0.4, -r * 2.3, r * 0.8, r * 0.5);
      ctx.fillStyle = eye; ctx.fillRect(0, -r * 2.05, 3, 1);
      ctx.fillStyle = C('stone', 4); ctx.fillRect(r * 0.5, -r * 1.8, 1, r * 1.6);
      break;
    }
    case 'eye': {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -r, r, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -r, r * 0.8, r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(r * 0.15, -r, r * 0.45, r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = e.s === 6 ? C('ember', 3) : PAL[RAMPS.ink[0]]; ctx.fillRect(r * 0.2, -r - 1, 2, 3);
      break;
    }
    case 'lantern': {
      ctx.fillStyle = dark; ctx.fillRect(-r * 0.5, -r * 2.2, r, r * 1.6);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); ctx.fillStyle = C('violet', 4); ctx.fillRect(-r * 0.3, -r * 2, r * 0.6, r * 1.1);
      ctx.globalAlpha = 1; ctx.fillStyle = light; ctx.fillRect(-1, -r * 2.5, 2, 3);
      break;
    }
    case 'wave': {
      ctx.fillStyle = C('sea', 2); ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 1.3, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * 3, -r * 1.1 + Math.sin(t * 8 + i) * 1.5, 2, 1);
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -r * 1.5, r * 0.6, r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = eye; ctx.fillRect(1, -r * 1.7, 2, 1);
      break;
    }
    case 'shard': {
      ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(0, -r * 2); ctx.lineTo(r * 0.7, -r * 0.6); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.7, -r * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = body; ctx.fillRect(-1, -r * 1.4, 2, r);
      break;
    }
    default: {
      const sq = 1 + Math.sin(t * 6) * 0.06;
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -r * 0.8, r * sq, r * 0.8 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-1, -r * 0.9, r * 0.75 * sq, r * 0.6 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(-r * 0.4, -r * 1.3, 2, 1);
      ctx.fillStyle = eye; ctx.fillRect(r * 0.3, -r, 2, 2); ctx.fillRect(-r * 0.1, -r, 2, 2);
    }
  }
  ctx.restore();
}

function mobGround(ctx, e, view) {
  drawEntityTelegraph(ctx, view, e);
  if (e.el && e.iv !== 1 && e.iv !== 3) {
    // gold elite ring on the ground
    const x = e.rx * 16 - view.x, y = e.ry * 16 - view.y;
    const r = Math.max(6, (e._rad ?? 0.4) * 16 + 3);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(view.time * 5);
    ctx.strokeStyle = C('gold', 3); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
registerGround('mob', mobGround);

export default {
  kinds: [],
  types: ['mob'],
  update(e, dt, view) {
    ensurePasses(view);
    if (e._rad == null) e._rad = view.content?.enemies?.byId?.[e.k]?.radius ?? 0.4;
    ground(e);
    // continuous status / elite particles (only when WP12 defines the preset)
    e._pt = (e._pt ?? 0) - dt;
    if (e._pt <= 0) {
      e._pt = 0.2;
      const P = view.particles;
      if (e.el && P.has?.('elite_aura')) P.emit('elite_aura', e.rx, e.ry - 0.5, { count: 1 });
      if ((e.st & BIT.burn) && P.has?.('burn')) P.emit('burn', e.rx, e.ry - 0.4, { count: 1 });
      if ((e.st & BIT.chill) && P.has?.('chill')) P.emit('chill', e.rx, e.ry - 0.6, { count: 1 });
    }
  },
  draw(ctx, e, time, view) {
    const x = Math.round(e.rx * 16 - view.x), y = Math.round(e.ry * 16 - view.y);
    const me = view.store.me?.();
    const dist = me ? Math.hypot(me.rx - e.rx, me.ry - e.ry) : 0;
    let alpha = 1;
    if (e.iv === 2) alpha = dist <= 4 ? 0.9 : 0.12;                  // shrouded / invisible
    if (e.iv === 3) {                                                  // burrowed: a moving dirt mound
      ctx.fillStyle = C('brown', 2); ctx.fillRect(x - 5, y - 2, 10, 3);
      ctx.fillStyle = C('brown', 3); ctx.fillRect(x - 3, y - 3, 6, 1);
      return;
    }
    if (e.iv === 4) {                                                  // high above: only its shadow
      view.sprites.drawShadow(ctx, x, y, 14, 0.25 + 0.1 * Math.sin(time * 3));
      return;
    }
    if (e.iv === 1) {                                                  // disguised as a reed clump
      ctx.fillStyle = C('grass', 2);
      for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 2, y - 7 - Math.abs(i), 1, 7 + Math.abs(i) - (i & 1));
      ctx.fillStyle = C('grass', 4); ctx.fillRect(x - 1, y - 9, 1, 2);
      return;
    }
    const sq = view.juice.squashOf(e.i);
    const flash = (e._flash ?? 0) > performance.now();
    const windup = e.s === 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    view.sprites.drawShadow(ctx, x, y, Math.max(10, (e._rad ?? 0.4) * 32));
    if (e.el) {
      // gold outline: draw a slightly larger gold silhouette behind
      if (view.sprites.has('mob.' + e.k)) view.sprites.draw(ctx, 'mob.' + e.k, x, y + 2, { time, silhouette: C('gold', 3), scaleX: 1.12 * sq.sx, scaleY: 1.08 * sq.sy, flip: e.f >= 3 && e.f <= 5 });
      else drawCreature(ctx, e, x, y + 1, view, { flash: true, sx: 1.15, sy: 1.1 });
    }
    if (view.sprites.has('mob.' + e.k)) {
      const anim = flash ? 'hit' : windup ? 'windup' : e.s === 2 ? 'attack' : e.s === 1 ? 'walk' : 'idle';
      view.sprites.draw(ctx, 'mob.' + e.k, x, y + 2, { time, anim, flip: e.f >= 3 && e.f <= 5, scaleX: sq.sx, scaleY: sq.sy });
    } else drawCreature(ctx, e, x, y, view, { flash, sx: sq.sx * (windup ? 1.08 : 1), sy: sq.sy * (windup ? 0.92 : 1) });
    if (windup) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 30);
      ctx.fillStyle = C('ember', 4);
      ctx.fillRect(x - 1, y - Math.max(14, (e._rad ?? 0.4) * 40) - 5, 2, 3);
    }
    ctx.restore();
    if (e.iv !== 2 || dist <= 4) {
      const top = y - Math.max(16, (e._rad ?? 0.4) * 40);
      hpBar(ctx, e, x, top, Math.max(12, Math.round((e._rad ?? 0.4) * 36)));
      statusPips(ctx, e, x, top - 5);
    }
  },
};
