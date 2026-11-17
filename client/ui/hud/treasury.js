// Treasury (WP7, DESIGN 15/21): the shared Glint counter at the top right (left of the minimap), with rolling digits
// and floating +N / -N on every change. Clicking it opens the map (where land is bought).

import { UI_COLORS } from '../widgets.js';
import { measure } from '../../render/text.js';

export const HUD_RIGHT = 104;        // the minimap (WP13) owns the top-right 100 px
export const HUD_W = 100;

const st = { shown: null, last: null, floats: [], t: 0 };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export default {
  id: 'treasury',
  anchor: 'top-right',
  order: 50,
  draw(ui, store) {
    if (!store.myId || ui.ui.isOpen('title')) return;
    const glint = store.world.glint ?? 0;
    const now = performance.now();
    if (st.shown === null) { st.shown = glint; st.last = glint; st.t = now; }
    const dt = Math.min(0.1, (now - st.t) / 1000);
    st.t = now;
    if (glint !== st.last) {
      const d = glint - st.last;
      st.floats.push({ text: (d > 0 ? '+' : '-') + fmt(Math.abs(d)), good: d > 0, t: now });
      if (st.floats.length > 4) st.floats.shift();
      st.last = glint;
    }
    // rolling digits: close 12% of the gap per frame-ish, at least 1 per frame
    const gap = glint - st.shown;
    // land exactly on the value (it used to overshoot sub-1 gaps and read 1 off the Inventory, P2-18)
    if (Math.abs(gap) <= 1) st.shown = glint;
    else st.shown += Math.sign(gap) * Math.max(1, Math.min(Math.abs(gap), Math.abs(gap) * 10 * dt));
    const x0 = ui.w - HUD_RIGHT - HUD_W, y0 = 4, w = HUD_W, h = 14;
    ui.rect(x0, y0, w, h, UI_COLORS.borderDark);
    ui.rect(x0 + 1, y0 + 1, w - 2, h - 2, UI_COLORS.bg);
    const pulse = st.floats.length && now - st.floats[st.floats.length - 1].t < 300;
    if (pulse) ui.rect(x0 + 1, y0 + 1, w - 2, h - 2, st.floats[st.floats.length - 1].good ? 'rgba(236,201,74,0.25)' : 'rgba(196,68,30,0.25)');
    ui.ui.sprites?.draw(ui.ctx, 'icon.ui.glint', ui.x + x0 + 3, ui.y + y0 - 1, { scaleX: 0.75, scaleY: 0.75 });
    if (!ui.ui.sprites?.has('icon.ui.glint')) ui.rect(x0 + 4, y0 + 4, 6, 6, UI_COLORS.accent);
    ui.label(x0 + w - 4, y0 + 4, fmt(st.shown), { color: UI_COLORS.accent, align: 'right' });
    for (let i = st.floats.length - 1; i >= 0; i--) {
      const f = st.floats[i];
      const age = (now - f.t) / 1000;
      if (age > 1.4) { st.floats.splice(i, 1); continue; }
      ui.ctx.globalAlpha = Math.max(0, 1 - age / 1.4);
      ui.label(x0 - 3 - measure(f.text), y0 + 4 - age * 6 + (st.floats.length - 1 - i) * 8, f.text, { color: f.good ? UI_COLORS.good : UI_COLORS.bad, outline: true });
      ui.ctx.globalAlpha = 1;
    }
    if (ui.hover(x0, y0, w, h)) {
      const next = store.world.landNext;
      ui.tooltip(`Treasury: ${fmt(glint)} Glint (shared)${next ? `\nNext plot: ${fmt(next.glint)} Glint (#${next.ordinal})` : ''}\nClick: open the map`);
      if (ui.ui.mouse.released) { ui.ui.consumeClick(); ui.ui.open('map', { tab: 'map' }); }
    }
  },
};
