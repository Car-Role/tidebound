// WP11: Goal Tracker (right side, under the minimap; DESIGN 21): the current main quest, up to two pinned side
// quests / contracts, and the next plot cost against the Treasury. Bars ease toward their value and a goal that
// completes flashes green. Click the tracker to open the Journal; the header collapses it.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { measure } from '../../render/text.js';

const W = 156, X_MARGIN = 4, TOP = 112;
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const st = { shown: new Map(), flash: new Map(), collapsed: false, lastMain: null, mainFlash: 0 };

function clip(text, w) {
  if (measure(text) <= w) return text;
  let s = text;
  while (s.length > 2 && measure(s + '.') > w) s = s.slice(0, -1);
  return s.trimEnd() + '.';
}

function goalRow(ui, x, y, key, g, now) {
  const done = g.have >= g.n;
  const target = Math.min(1, g.n ? g.have / g.n : 0);
  const cur = st.shown.get(key) ?? target;
  const next = cur + (target - cur) * 0.15;
  st.shown.set(key, Math.abs(next - target) < 0.002 ? target : next);
  if (done && !st.flash.has(key)) st.flash.set(key, now);
  if (!done) st.flash.delete(key);
  const f = st.flash.get(key);
  const glow = f && now - f < 900 ? 1 - (now - f) / 900 : 0;
  if (glow > 0) ui.rect(x - 2, y - 1, W - 4, 15, `rgba(120,220,120,${0.35 * glow})`);
  const count = g.n > 1 ? `${fmt(Math.min(g.have, g.n))}/${fmt(g.n)}` : '';
  ui.label(x, y, clip(g.label, W - 14 - (count ? measure(count) + 6 : 0)), { color: done ? UI_COLORS.good : '#ffffff', outline: true });
  if (count) ui.label(x + W - 10, y, count, { color: done ? UI_COLORS.good : UI_COLORS.dim, align: 'right', outline: true });
  ui.bar(x, y + 9, W - 10, 3, st.shown.get(key), 1, done ? UI_COLORS.good : UI_COLORS.accent);
  return y + 15;
}

export default {
  id: 'goals',
  anchor: 'right',
  order: 60,
  draw(ui, store) {
    if (!store.myId || ui.ui.isOpen('title')) return;
    const now = performance.now();
    const x0 = ui.w - W - X_MARGIN;
    let y = TOP;
    const hot = ui.hover(x0, y, W, 10);
    ui.label(x0 + W - 2, y, st.collapsed ? 'Goals +' : 'Goals -', { color: hot ? UI_COLORS.accent : UI_COLORS.dim, align: 'right', outline: true });
    if (hot && ui.ui.mouse.released) { ui.ui.consumeClick(); st.collapsed = !st.collapsed; ui.ui.sound('ui_click'); }
    if (hot) ui.tooltip('Goal Tracker (J opens the Journal)');
    y += 11;
    if (st.collapsed) return;
    const top = y;

    // main quest
    const mq = store.world.mainQuest;
    if (mq) {
      if (st.lastMain && st.lastMain !== mq.id) st.mainFlash = now;
      st.lastMain = mq.id;
      const fl = now - st.mainFlash < 1500 ? 1 - (now - st.mainFlash) / 1500 : 0;
      ui.rect(x0 - 3, y - 2, W + 2, 12, `rgba(13,10,20,${0.45 + fl * 0.3})`);
      if (fl > 0) ui.rect(x0 - 3, y - 2, Math.round((W + 2) * (1 - fl)), 1, PAL[RAMPS.gold[4]]);
      ui.label(x0, y, clip(mq.complete ? mq.name : `${mq.n}. ${mq.name}`, W - 4), { color: PAL[RAMPS.gold[4]], outline: true });
      y += 11;
      for (const [i, g] of (mq.goals || []).entries()) y = goalRow(ui, x0, y, `m:${mq.id}:${i}`, g, now);
    }

    // pinned side quests and contracts
    const q = store.self.quests;
    const pinned = (q?.pinned ?? []).map((id) => q.active?.find((a) => a.id === id)).filter(Boolean).slice(0, 2);
    for (const a of pinned) {
      y += 2;
      ui.label(x0, y, clip(a.name, W - 4), { color: a.type === 'board' ? PAL[RAMPS.sea[4]] : '#ffffff', outline: true });
      y += 10;
      if (a.ready) {
        const blink = Math.floor(now / 500) % 2;
        ui.label(x0, y, clip(`Return to ${a.giverName || 'the giver'}`, W - 4), { color: blink ? UI_COLORS.good : PAL[RAMPS.grass[3]], outline: true });
        y += 11;
      } else for (const [i, g] of a.goals.slice(0, 2).entries()) y = goalRow(ui, x0, y, `p:${a.id}:${i}`, g, now);
    }

    // next plot
    const ln = store.world.landNext;
    if (ln && Number.isFinite(ln.glint)) {
      y += 2;
      const have = store.world.glint ?? 0;
      const ok = have >= ln.glint;
      ui.label(x0, y, `Next plot: ${fmt(ln.glint)} G`, { color: ok ? UI_COLORS.good : '#ffffff', outline: true });
      if (ln.ballast?.item) ui.label(x0 + W - 10, y, `+${fmt(ln.ballast.qty)} Ballast`, { color: UI_COLORS.dim, align: 'right', outline: true });
      ui.bar(x0, y + 9, W - 10, 3, Math.min(have, ln.glint), ln.glint || 1, ok ? UI_COLORS.good : PAL[RAMPS.gold[3]]);
      y += 15;
    }
    if (ui.hover(x0 - 3, top, W + 2, y - top) && ui.ui.mouse.released && !ui.ui.clickConsumed) {
      ui.ui.consumeClick();
      ui.ui.open('journal', { tab: 'quests' });
    }
  },
};
