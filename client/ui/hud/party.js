// WP13: party frames (left side, under the HP/Surge bars): name, class icon, level, HP for every other player,
// from world.party (2 Hz). Shows DOWN / far-away realm states, host marker and a direction arrow to off-screen allies.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';

const CLASS_SHORT = { bulwark: 'BW', squallblade: 'SQ', brinesinger: 'BR', gearwright: 'GW', prospector: 'PR', greenwarden: 'GR' };
const REALM_NAME = (r) => (r === 'overworld' ? '' : r === 'moon' ? 'the Moon' : r?.startsWith('vault') ? 'a Vault' : r?.startsWith('trench') ? 'the Trench' : 'away');
const ARROWS = ['→', '↓', '←', '↑'];   // the pixel font has the four cardinal arrows

export default {
  id: 'party',
  anchor: 'left',
  order: 30,
  draw(ui, store) {
    const party = (store.world.party ?? []).filter((p) => p.id !== store.myId);
    if (!party.length) return;
    const me = store.me();
    const t = performance.now() / 1000;
    let y = 28;
    for (const p of party.slice(0, 7)) {
      const w = 92, h = 21, x = 6;
      const down = p.st === 4 || p.st === 5 || p.hp <= 0;
      ui.rect(x, y, w, h, UI_COLORS.borderDark);
      ui.rect(x + 1, y + 1, w - 2, h - 2, UI_COLORS.bg);
      ui.rect(x + 1, y + 1, 2, h - 2, playerColor(p.color ?? 0));
      // class badge
      const cls = typeof p.class === 'string' ? p.class : null;
      if (cls && ui.ui.sprites?.has?.('icon.class_' + cls)) ui.ui.sprites.draw(ui.ctx, 'icon.class_' + cls, ui.x + x + 11, ui.y + y + 17, { scaleX: 0.75, scaleY: 0.75 });
      else ui.label(x + 6, y + 3, cls ? CLASS_SHORT[cls] ?? cls.slice(0, 2).toUpperCase() : '--', { color: UI_COLORS.dim });
      let name = p.name;
      while (name.length > 3 && name.length * 6 > 50) name = name.slice(0, -1);
      ui.label(x + 20, y + 3, name + (p.host ? '*' : ''), { color: playerColor(p.color ?? 0) });
      ui.label(x + w - 4, y + 3, String(p.level), { color: UI_COLORS.accent, align: 'right' });
      if (down) {
        const blink = Math.floor(t * 3) % 2;
        ui.label(x + 20, y + 12, 'DOWN', { color: blink ? UI_COLORS.bad : PAL[RAMPS.ember[4]] });
      } else ui.bar(x + 20, y + 13, w - 26, 5, p.hp, p.mh || 1, UI_COLORS.hp, { light: UI_COLORS.hpLight });
      const where = REALM_NAME(p.realm);
      if (where && (!me || p.realm !== store.realm.id)) ui.label(x + w + 3, y + 7, `in ${where}`, { color: UI_COLORS.dim, outline: true });
      else if (me) {
        const dx = p.x - me.x, dy = p.y - me.y, d = Math.hypot(dx, dy);
        if (d > 14) {
          const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 2)) % 4) + 4) % 4;
          ui.label(x + w + 3, y + 7, `${ARROWS[i]} ${Math.round(d)}`, { color: UI_COLORS.dim, outline: true });
        }
      }
      if (ui.hover(x, y, w, h)) ui.tooltip(`${p.name}${p.host ? ' (host)' : ''}\nLevel ${p.level}${cls ? ' ' + cls : ''}\nHP ${p.hp}/${p.mh}${where ? '\nIn ' + where : ''}`);
      y += h + 2;
    }
  },
};
