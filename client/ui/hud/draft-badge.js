// WP6a HUD: the pulsing deck badge above the hotbar (pending drafts; click or V opens the draft), an unspent
// skill-point pip (K), and the level-up fanfare: banner with rays, 150 ms slow-motion of local particles, gold flash.

import { drawText } from '../../render/text.js';
import juice from '../../fx/juice.js';
import { K, drawCardBack, glow, drawGlyph } from '../panels/draft.js';

const ABILITY_LEVELS = [10, 20, 35, 60];
const SIG_LEVELS = [70, 80, 90];
const st = { level: null, banner: null, drafts: 0, pulseAt: 0, bound: false };
const now = () => performance.now() / 1000;
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

function bind(mgr, store) {
  if (st.bound) return;
  st.bound = true;
  store.on('welcome', (m) => { st.level = m.self?.xp?.level ?? null; st.drafts = m.self?.cards?.drafts?.length ?? 0; });
  store.on('change:self.xp', (x) => {
    if (!x) return;
    if (st.level != null && x.level > st.level) {
      const gained = x.level - st.level;
      const lines = [gained > 1 ? `+${gained} Tide Drafts   +${gained} Skill Points` : '+1 Tide Draft   +1 Skill Point'];
      for (let L = st.level + 1; L <= x.level; L++) {
        if (ABILITY_LEVELS.includes(L)) lines.push(L === 10 ? 'Choose a class at a Calling Shrine!' : 'New ability unlocked!');
        if (SIG_LEVELS.includes(L)) lines.push('A Signature awaits at the Calling Shrine');
        if (L % 5 === 0) lines.push('+1 Tide Token');
      }
      st.banner = { level: x.level, t0: now(), lines };
      juice.slowmo(0.35, 0.15);
      juice.flash('#fff08a', 0.22, 0.3);
      juice.shake(3, 0.25);
      mgr.sound('levelup');
    }
    st.level = x.level;
  });
  store.on('change:self.cards', (c) => {
    const n = c?.drafts?.length ?? 0;
    if (n > st.drafts) st.pulseAt = now();
    st.drafts = n;
  });
}

function drawBanner(ui, t) {
  const b = st.banner;
  if (!b) return;
  const age = t - b.t0;
  const HOLD = 2.4, OUT = 0.6;
  if (age > HOLD + OUT) { st.banner = null; return; }
  const ctx = ui.ctx;
  const a = age > HOLD ? 1 - (age - HOLD) / OUT : 1;
  const k = Math.min(1, age / 0.32);
  const sc = 0.4 + 0.6 * easeOutBack(k);
  const cx = ui.x + ui.w / 2, cy = ui.y + Math.round(ui.h * 0.26);
  ctx.save();
  ctx.globalAlpha = a;
  // rays
  ctx.save();
  ctx.translate(cx, cy + 6);
  ctx.rotate(age * 0.6);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = i % 2 ? 'rgba(236,201,74,0.16)' : 'rgba(255,240,138,0.10)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -70 * sc); ctx.lineTo(7, -70 * sc); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // plate
  const w = 150, h = 22 + b.lines.length * 9;
  ctx.fillStyle = 'rgba(13,10,20,0.78)';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + 22), w, h - 18);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  drawText(ctx, 'LEVEL ' + b.level, 1, -8, { color: K.goldDark, outline: false, align: 'center', scale: 3 });
  drawText(ctx, 'LEVEL ' + b.level, 0, -9, { color: K.goldLight, outline: K.ink0, align: 'center', scale: 3 });
  ctx.restore();
  b.lines.forEach((l, i) => drawText(ctx, l, cx, cy + 25 + i * 9, { color: i === 0 ? K.text : K.goldLight, align: 'center' }));
  ctx.restore();
}

export default {
  id: 'draft-badge',
  anchor: 'bottom',
  order: 22,
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    bind(mgr, store);
    drawBanner(ui, t);
    const drafts = store.self.cards?.drafts?.length ?? 0;
    const points = store.self.skills?.points ?? 0;
    const hotbarW = 8 * 20 + 7 * 2;
    const y0 = ui.h - 39 - 34;
    const x = Math.round(ui.w / 2 + hotbarW / 2 - 22);
    if (drafts > 0) {
      const hot = ui.hover(x - 2, y0 - 2, 22, 30);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      const pop = Math.max(0, 1 - (t - st.pulseAt) / 0.5);
      glow(ctx, ui.x + x, ui.y + y0, 18, 26, K.gold, 0.5 + pulse * 0.5 + pop, 6 + pop * 8);
      ctx.save();
      ctx.translate(ui.x + x + 9, ui.y + y0 + 13);
      const s = 1 + pop * 0.25 + (hot ? 0.06 : 0);
      ctx.scale(s, s);
      drawCardBack(ctx, -9, -13, 18, 26, t);
      ctx.restore();
      ctx.fillStyle = K.ink0; ctx.fillRect(ui.x + x + 11, ui.y + y0 - 4, 11, 9);
      ctx.fillStyle = K.bad; ctx.fillRect(ui.x + x + 12, ui.y + y0 - 3, 9, 7);
      drawText(ctx, String(Math.min(99, drafts)), ui.x + x + 17, ui.y + y0 - 3, { align: 'center', outline: false });
      if (hot) ui.tooltip(`${drafts} Tide Draft${drafts > 1 ? 's' : ''} waiting\nClick or press V`);
      if (hot && mgr.mouse.released) { mgr.consumeClick(); mgr.open('draft'); }
    }
    if (points > 0) {
      const sx = x - 22, hot = ui.hover(sx, y0 + 6, 16, 16);
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + 1);
      glow(ctx, ui.x + sx, ui.y + y0 + 6, 16, 16, K.seaLight, 0.35 + 0.4 * pulse, 5);
      ctx.fillStyle = K.ink0; ctx.fillRect(ui.x + sx, ui.y + y0 + 6, 16, 16);
      ctx.fillStyle = K.seaDark; ctx.fillRect(ui.x + sx + 1, ui.y + y0 + 7, 14, 14);
      drawGlyph(ctx, 'star', ui.x + sx + 4, ui.y + y0 + 10, 1, K.seaLight);
      drawText(ctx, String(points), ui.x + sx + 15, ui.y + y0 + 15, { align: 'right', color: K.text });
      if (hot) ui.tooltip(`${points} skill point${points > 1 ? 's' : ''} to spend\nClick or press K`);
      if (hot && mgr.mouse.released) { mgr.consumeClick(); mgr.open('skills'); }
    }
  },
};
