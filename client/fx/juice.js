// Juice (TECH_SPEC 10.2): trauma shake, hitstop, flashes, squash, floating numbers, slow-motion, vignette.
// Accessibility: shake scaled by config.shakeScale; flashes respect config.reduceFlashing.

import { TILE } from '../../shared/config.js';
import { drawText } from '../render/text.js';
import { PAL, RAMPS } from '../art/palette.js';
import { setTimeScale, setHooks } from './particles.js';

export const config = { shakeScale: 1, reduceFlashing: false };

let trauma = 0, traumaPx = 0;
let hitstopLeft = 0;
let flashColor = '#ffffff', flashAlpha = 0, flashTime = 0, flashLeft = 0;
let slowFactor = 1, slowLeft = 0;
let vignetteColor = null, vignetteAlpha = 0;
const squashes = new Map();       // entity id -> { sx, sy, t, dur }
const numbers = [];               // { x, y, text, style, t, life }
const out = { sx: 1, sy: 1 };

const NUMBER_STYLES = {
  dmg: { color: '#ffffff', scale: 1, life: 0.7 },
  crit: { color: PAL[RAMPS.gold[4]], scale: 2, life: 0.9 },
  heal: { color: PAL[RAMPS.grass[4]], scale: 1, life: 0.8 },
  xp: { color: PAL[RAMPS.teal[4]], scale: 1, life: 0.9 },
  glint: { color: PAL[RAMPS.gold[3]], scale: 1, life: 0.9 },
  miss: { color: PAL[RAMPS.stone[3]], scale: 1, life: 0.6 },
};

export function shake(px, seconds = 0.25) {
  trauma = Math.min(1, trauma + Math.min(1, seconds * 3));
  traumaPx = Math.max(traumaPx * (trauma > 0.05 ? 1 : 0), px);
}
export function hitstop(ms) { hitstopLeft = Math.max(hitstopLeft, ms / 1000); }
export function flash(color = '#ffffff', alpha = 0.5, seconds = 0.12) {
  if (config.reduceFlashing) alpha *= 0.25;
  flashColor = PAL[color] ?? color; flashAlpha = alpha; flashTime = flashLeft = seconds;
}
export function squash(entityId, sx, sy, seconds = 0.08) { squashes.set(entityId, { sx, sy, t: 0, dur: seconds }); }
export function number(x, y, text, style = 'dmg') {
  if (numbers.length > 80) numbers.shift();
  const s = NUMBER_STYLES[style] || NUMBER_STYLES.dmg;
  numbers.push({ x: x + (Math.random() - 0.5) * 0.4, y, text: String(text), s, t: 0 });
}
export function slowmo(factor, seconds) { slowFactor = factor; slowLeft = seconds; setTimeScale(factor); }
export function vignette(color, alpha) { vignetteColor = color ? PAL[color] ?? color : null; vignetteAlpha = alpha; }

export const isHitstopped = () => hitstopLeft > 0;

// Squash scale for an entity this frame (1,1 when none).
export function squashOf(id) {
  const s = squashes.get(id);
  if (!s) { out.sx = 1; out.sy = 1; return out; }
  const k = 1 - s.t / s.dur;
  out.sx = 1 + (s.sx - 1) * k; out.sy = 1 + (s.sy - 1) * k;
  return out;
}

// Returns the shake offset in source px; call once per frame.
export function update(dt, offset = { x: 0, y: 0 }) {
  if (hitstopLeft > 0) hitstopLeft -= dt;
  if (slowLeft > 0) { slowLeft -= dt; if (slowLeft <= 0) { slowFactor = 1; setTimeScale(1); } }
  if (flashLeft > 0) flashLeft -= dt;
  for (const [id, s] of squashes) { s.t += dt; if (s.t >= s.dur) squashes.delete(id); }
  for (let i = numbers.length - 1; i >= 0; i--) {
    const n = numbers[i];
    n.t += dt;
    if (n.t >= n.s.life) numbers.splice(i, 1);
  }
  trauma = Math.max(0, trauma - dt * 1.6);
  const amt = trauma * trauma * traumaPx * config.shakeScale;
  offset.x = amt ? (Math.random() * 2 - 1) * amt : 0;
  offset.y = amt ? (Math.random() * 2 - 1) * amt : 0;
  return offset;
}

// Floating numbers in the world pass.
export function drawNumbers(ctx, view) {
  for (const n of numbers) {
    const k = n.t / n.s.life;
    const sx = n.x * TILE - view.x, sy = n.y * TILE - view.y - 10 - k * 14;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    drawText(ctx, n.text, sx, sy, { color: n.s.color, align: 'center', scale: n.s.scale });
  }
  ctx.globalAlpha = 1;
}

// Screen flash and vignette over the game view.
export function drawOverlay(ctx, w, h) {
  if (flashLeft > 0 && flashAlpha > 0) {
    ctx.globalAlpha = flashAlpha * (flashLeft / flashTime);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (vignetteColor && vignetteAlpha > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, vignetteColor);
    ctx.globalAlpha = vignetteAlpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

setHooks({ shake: (px, s) => shake(px, s), flash: (c, a, s) => flash(c, a, s) });

export default { config, shake, hitstop, flash, squash, number, slowmo, vignette, squashOf, update, drawNumbers, drawOverlay, isHitstopped };
