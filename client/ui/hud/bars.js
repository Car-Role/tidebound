// HP and Surge bars (top-left), XP bar (bottom, full width, 6 px) with the level number.
// Surge reads store.self.surge ({ cur, max }) when a package publishes it; otherwise shows full.

import { UI_COLORS } from '../widgets.js';

export default {
  id: 'bars',
  anchor: 'top-left',
  order: 10,
  draw(ui, store) {
    const me = store.me();
    const stats = store.self.stats || {};
    const hp = me?.hp ?? 0, mh = me?.mh || stats.maxHp || 100;
    const surgeMax = store.self.surge?.max ?? stats.maxSurge ?? 100;
    const surge = store.self.surge?.cur ?? surgeMax;
    const w = 96;
    ui.bar(6, 6, w, 7, hp, mh, UI_COLORS.hp, { light: UI_COLORS.hpLight, segments: Math.min(10, Math.ceil(mh / 50)) });
    ui.bar(6, 15, Math.round(w * 0.8), 5, surge, surgeMax, UI_COLORS.surge, { light: UI_COLORS.surgeLight });
    if (ui.hover(6, 6, w, 14)) ui.tooltip(`HP ${Math.ceil(hp)}/${Math.ceil(mh)}\nSurge ${Math.floor(surge)}/${surgeMax}`);

    const xp = store.self.xp || { level: 1, xp: 0, next: 1 };
    const y = ui.h - 7;
    ui.bar(0, y, ui.w, 7, xp.xp, xp.next || 1, UI_COLORS.xp);
    ui.label(3, y - 9, `Lv ${xp.level}`, { color: UI_COLORS.accent, outline: true });
    if (ui.hover(0, y, ui.w, 7)) ui.tooltip(`XP ${xp.xp} / ${xp.next}`);
  },
};
