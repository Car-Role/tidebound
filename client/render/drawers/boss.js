// WP5 boss drawer: the 6 Wardens, 6 Keepers and the Drowned Moon (sprite `boss.<kind>` from WP3 when present,
// otherwise a large procedural figure per boss), plus the boss-part mobs (Choir singers, Prismarch's mirror
// images, the Moon's tether pylons). Shows windup glow, phase tint, enrage pulse, exposed core (`cx`), shields
// (`sh`), conveyor belts (`cv`), rotating arms (`arm`/`arms`/`al`) and the ground telegraph (`tg`).

import { PAL, RAMPS } from '../../art/palette.js';
import { ensurePasses, ground, registerGround, drawEntityTelegraph, drawArms, C } from './zone.js';

const TAU = Math.PI * 2;
const BOSS_RAMP = {
  thornmother: 'grass', mire_regent: 'teal', kilnheart: 'stone', prismarch: 'ice', glacier_antler: 'ice', hollow_choir: 'violet',
  sporeking: 'grass', barnacle_bell: 'brown', bellows_engine: 'stone', twin_lenses: 'ice', thawless_knight: 'ice', scribe: 'ink', drowned_moon: 'sea',
};
const ARM_RAMP = { kilnheart: 'ember', bellows_engine: 'ember', prismarch: 'ice', drowned_moon: 'sea' };

function circle(ctx, x, y, r, color, alpha = 1) { ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
function ell(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); ctx.fill(); }

function figure(ctx, e, x, y, t, flash) {
  const k = e.k;
  const ramp = BOSS_RAMP[k] ?? 'stone';
  const c = (i) => (flash ? '#ffffff' : C(ramp, i));
  const windup = e.s === 6;
  const breathe = Math.sin(t * 2) * 1.2 + (windup ? Math.sin(t * 30) * 1 : 0);
  switch (k) {
    case 'thornmother': {
      ell(ctx, x, y - 12, 22, 14 + breathe, c(1)); ell(ctx, x, y - 15, 18, 10 + breathe, c(2));
      ctx.fillStyle = flash ? '#fff' : C('brown', 2);
      for (let i = 0; i < 9; i++) { const a = -Math.PI + (i / 8) * Math.PI; ctx.fillRect(Math.round(x + Math.cos(a) * 20), Math.round(y - 14 + Math.sin(a) * 13), 2, 4); }
      ell(ctx, x - 6, y - 20, 3, 3, flash ? '#fff' : C('flesh', 4)); ell(ctx, x + 6, y - 20, 3, 3, flash ? '#fff' : C('flesh', 4));
      circle(ctx, x - 6, y - 20, 1, windup ? C('ember', 4) : '#000'); circle(ctx, x + 6, y - 20, 1, windup ? C('ember', 4) : '#000');
      break;
    }
    case 'mire_regent': {
      ell(ctx, x, y - 12, 26, 14 + breathe, c(1)); ell(ctx, x, y - 15, 22, 11 + breathe, c(2));
      ell(ctx, x, y - 8, 18, 4, c(4));
      ell(ctx, x - 12, y - 26, 5, 5, c(3)); ell(ctx, x + 12, y - 26, 5, 5, c(3));
      circle(ctx, x - 12, y - 26, 2, '#000'); circle(ctx, x + 12, y - 26, 2, '#000');
      break;
    }
    case 'kilnheart': {
      ctx.fillStyle = c(1); ctx.fillRect(x - 16, y - 40, 32, 34); ctx.fillStyle = c(2); ctx.fillRect(x - 13, y - 37, 26, 28);
      ctx.fillStyle = c(1); ctx.fillRect(x - 26, y - 30 + breathe, 9, 16); ctx.fillRect(x + 17, y - 30 - breathe, 9, 16);
      const core = e.cx ? 1 : 0.55 + 0.25 * Math.sin(t * 6);
      circle(ctx, x, y - 24, 7, C('ember', 3), core); circle(ctx, x, y - 24, 4, C('gold', 4), core);
      ctx.fillStyle = C('ember', 4); ctx.fillRect(x - 7, y - 34, 4, 2); ctx.fillRect(x + 3, y - 34, 4, 2);
      break;
    }
    case 'prismarch': case 'prism_clone': {
      const hover = Math.sin(t * 3) * 3;
      ctx.save(); ctx.translate(x, y - 26 + hover);
      ctx.fillStyle = c(3); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, 0); ctx.lineTo(0, 18); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : C('violet', 4); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, 0); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -8, 4, 4);
      for (let i = 0; i < 4; i++) { const a = t * 1.5 + i * 1.57; ctx.fillStyle = [C('ember', 4), C('gold', 4), C('grass', 4), C('sea', 4)][i]; ctx.fillRect(Math.round(Math.cos(a) * 20), Math.round(Math.sin(a) * 8), 2, 2); }
      ctx.restore();
      break;
    }
    case 'glacier_antler': {
      ell(ctx, x, y - 16, 20, 11, c(2)); ell(ctx, x + 16, y - 24, 8, 7, c(3));
      ctx.fillStyle = c(1); for (const lx of [-12, -4, 6, 12]) ctx.fillRect(x + lx, y - 8, 3, 8);
      ctx.fillStyle = flash ? '#fff' : C('ice', 4);
      for (const s of [-1, 1]) { ctx.fillRect(x + 14 + s * 3, y - 40, 2, 12); ctx.fillRect(x + 14 + s * 7, y - 44, 2, 8); ctx.fillRect(x + 14 + s * 3, y - 40, s * 6, 2); }
      ctx.fillStyle = windup ? C('ember', 4) : '#000'; ctx.fillRect(x + 19, y - 26, 2, 2);
      break;
    }
    case 'hollow_choir': {
      ctx.globalAlpha = 0.85;
      ell(ctx, x, y - 24, 14, 22, c(0)); ell(ctx, x, y - 30, 10, 12, c(2));
      ctx.globalAlpha = 1; ctx.fillStyle = C('violet', 4);
      for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; ctx.fillRect(Math.round(x + Math.cos(a) * 16), Math.round(y - 30 + Math.sin(a) * 6), 2, 3); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, y - 32, 2, 1); ctx.fillRect(x + 2, y - 32, 2, 1);
      break;
    }
    case 'choir_singer': {
      const sway = Math.sin(t * 3 + e.gi) * 2;
      ell(ctx, x + sway, y - 14, 7, 13, c(1)); ell(ctx, x + sway, y - 22, 5, 5, c(3));
      ctx.fillStyle = '#000'; ctx.fillRect(x + sway - 2, y - 20, 4, 3);
      ctx.fillStyle = C('violet', 4); ctx.fillRect(x + sway + 6, y - 28 - ((t * 10) % 8), 2, 3);
      break;
    }
    case 'pylon': {
      ctx.fillStyle = c(1); ctx.fillRect(x - 5, y - 26, 10, 26); ctx.fillStyle = c(3); ctx.fillRect(x - 3, y - 24, 6, 22);
      circle(ctx, x, y - 30, 4, C('violet', 4), 0.6 + 0.4 * Math.sin(t * 5));
      break;
    }
    case 'sporeking': {
      ell(ctx, x, y - 14, 16, 15 + breathe, c(2)); ell(ctx, x, y - 18, 12, 10 + breathe, c(3));
      ctx.fillStyle = flash ? '#fff' : C('gold', 4);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; ctx.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y - 18 + Math.sin(a) * 7), 2, 2); }
      ell(ctx, x, y - 32, 6, 5, flash ? '#fff' : C('ember', 3));
      break;
    }
    case 'barnacle_bell': {
      const swing = Math.sin(t * 1.6) * 0.15 + (windup ? Math.sin(t * 20) * 0.1 : 0);
      ctx.save(); ctx.translate(x, y - 40); ctx.rotate(swing);
      ctx.fillStyle = flash ? '#fff' : C('gold', 1); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(16, 30); ctx.lineTo(-16, 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : C('gold', 2); ctx.fillRect(-14, 26, 28, 4);
      ctx.fillStyle = C('stone', 3); for (let i = 0; i < 6; i++) ctx.fillRect(-10 + i * 4, 12 + (i % 2) * 6, 2, 2);
      ctx.fillStyle = C('stone', 1); ctx.fillRect(-2, 30, 4, 6);
      ctx.restore();
      break;
    }
    case 'bellows_engine': {
      ctx.fillStyle = c(1); ctx.fillRect(x - 20, y - 36, 40, 32); ctx.fillStyle = c(2); ctx.fillRect(x - 17, y - 33, 34, 26);
      const puff = Math.abs(Math.sin(t * 2.5)) * 5;
      ctx.fillStyle = C('brown', 2); ctx.fillRect(x - 28, y - 30 + puff / 2, 8, 18 - puff); ctx.fillRect(x + 20, y - 30 + puff / 2, 8, 18 - puff);
      circle(ctx, x, y - 20, 7, C('ember', 3), e.cx ? 1 : 0.6); circle(ctx, x, y - 20, 3, C('gold', 4), 1);
      ctx.fillStyle = C('stone', 0); ctx.fillRect(x - 3, y - 46, 6, 10);
      break;
    }
    case 'twin_lenses': {
      const hover = Math.sin(t * 2 + (e.gi ?? 0) * 3) * 3;
      circle(ctx, x, y - 22 + hover, 13, c(1)); circle(ctx, x, y - 22 + hover, 10, flash ? '#fff' : C('ice', 4));
      circle(ctx, x + 2, y - 22 + hover, 5, (e.gi ?? 0) ? C('ember', 3) : C('sea', 3)); circle(ctx, x + 2, y - 22 + hover, 2, '#000');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 5, y - 28 + hover, 2, 2);
      break;
    }
    case 'thawless_knight': {
      ctx.fillStyle = c(1); ctx.fillRect(x - 10, y - 40, 20, 38); ctx.fillStyle = c(2); ctx.fillRect(x - 8, y - 38, 16, 30);
      ctx.fillStyle = c(4); ctx.fillRect(x - 9, y - 46, 18, 9); ctx.fillStyle = C('ice', 0); ctx.fillRect(x - 6, y - 42, 12, 2);
      ctx.fillStyle = windup ? C('ember', 4) : C('ice', 4); ctx.fillRect(x - 4, y - 42, 2, 2); ctx.fillRect(x + 2, y - 42, 2, 2);
      ctx.fillStyle = C('ice', 4); ctx.fillRect(x + 12, y - 44 + breathe, 3, 36);
      break;
    }
    case 'scribe': {
      const hover = Math.sin(t * 2.2) * 3;
      ctx.globalAlpha = 0.9; ell(ctx, x, y - 24 + hover, 11, 20, C('ink', 1)); ctx.globalAlpha = 1;
      ctx.fillStyle = flash ? '#fff' : C('flesh', 4); ctx.fillRect(x - 9, y - 22 + hover, 18, 12);
      ctx.fillStyle = C('ink', 0); for (let i = 0; i < 4; i++) ctx.fillRect(x - 7, y - 20 + i * 3 + hover, 14 - (i % 2) * 4, 1);
      ctx.fillStyle = C('violet', 4); ctx.fillRect(x + 10, y - 38 + hover, 2, 14); ctx.fillRect(x + 9, y - 40 + hover, 4, 3);
      break;
    }
    case 'drowned_moon': {
      const R = 40;
      circle(ctx, x, y - R - 6, R, c(1)); circle(ctx, x - 6, y - R - 10, R - 6, c(2)); circle(ctx, x - 12, y - R - 16, R - 18, c(3));
      for (const [ox, oy, r] of [[14, -8, 7], [-10, 10, 5], [6, 18, 4], [-18, -12, 4]]) circle(ctx, x + ox, y - R - 6 + oy, r, C('sea', 0), 0.6);
      if (e.sh) { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4); ctx.strokeStyle = C('violet', 4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - R - 6, R + 6, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1; }
      break;
    }
    default:
      ell(ctx, x, y - 16, 20, 16, c(2));
  }
}

function bossGround(ctx, e, view) {
  drawEntityTelegraph(ctx, view, e);
  drawArms(ctx, view, e, ARM_RAMP[e.k] ?? 'violet');
  const x = e.rx * 16 - view.x, y = e.ry * 16 - view.y;
  if (e.cv) {
    // conveyor belts: chevrons flowing toward (cv 1) or away from (cv -1) the engine
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = C('gold', 3);
    for (let ring = 3; ring <= 11; ring += 2) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const rr = ring * 16 - ((view.time * 22 * e.cv) % 32 + 32) % 32;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.75), 3, 1);
      }
    }
    ctx.restore();
  }
  if (e.sr) {
    // Hollow Choir: shrinking safe circle
    ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = C('violet', 4); ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(x, y, e.sr * 16, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (e.ty === 'boss' && e.en) {
    ctx.save(); ctx.globalAlpha = 0.25 + 0.2 * Math.sin(view.time * 12); ctx.fillStyle = C('ember', 2);
    ctx.beginPath(); ctx.ellipse(x, y, 30, 12, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
}
registerGround('boss', bossGround);
registerGround('mob_boss_part', bossGround);

export default {
  kinds: ['choir_singer', 'prism_clone', 'pylon'],
  types: ['boss'],
  update(e, dt, view) {
    ensurePasses(view);
    ground(e);
    if (e.ph !== e._ph) {
      if (e._ph !== undefined && e.ph > e._ph) { view.juice.hitstop(300); view.juice.flash('#ffffff', 0.35, 0.25); view.juice.shake(10, 0.4); }
      e._ph = e.ph;
    }
  },
  draw(ctx, e, time, view) {
    const x = Math.round(e.rx * 16 - view.x), y = Math.round(e.ry * 16 - view.y);
    const flash = (e._flash ?? 0) > performance.now();
    const sq = view.juice.squashOf(e.i);
    const shadowless = e.k === 'prism_clone';
    const big = e.k === 'drowned_moon' ? 90 : e.ty === 'boss' ? 46 : 20;
    if (!shadowless) view.sprites.drawShadow(ctx, x, y, big, 0.4);
    ctx.save();
    if (e.k === 'prism_clone') ctx.globalAlpha = 0.8;
    if (sq.sx !== 1 || sq.sy !== 1) { ctx.translate(x, y); ctx.scale(Math.min(1.12, sq.sx), Math.max(0.9, sq.sy)); ctx.translate(-x, -y); }
    const base = 'boss.' + e.k;
    const phased = (e.ph ?? 0) > 0 ? `${base}.p${(e.ph ?? 0) + 1}` : base;
    const id = view.sprites.has(phased) ? phased : base;
    const anim = flash ? 'hit' : (e.s === 6 || e.s === 2) ? 'attack' : 'idle';
    if (view.sprites.has(id)) view.sprites.draw(ctx, id, x, y + 2, { time, flash: false, anim, flip: e.f >= 3 && e.f <= 5 });
    else figure(ctx, e, x, y, time + e.i * 0.1, flash);
    if (e.en) { ctx.globalAlpha = 0.18 + 0.12 * Math.sin(time * 10); ctx.fillStyle = C('ember', 3); ctx.fillRect(x - 24, y - 50, 48, 50); }
    ctx.restore();
    // small bars for multi-body bosses and boss parts (the HUD bar shows the encounter)
    if (e.ty !== 'boss' || (e.gn ?? 1) > 1) {
      const w = 26, top = y - (e.ty === 'boss' ? 54 : 36);
      ctx.fillStyle = PAL[RAMPS.ink[0]]; ctx.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
      ctx.fillStyle = C('violet', 3); ctx.fillRect(x - w / 2, top, Math.max(0, Math.round(w * e.hp / Math.max(1, e.mh))), 2);
    }
  },
};
