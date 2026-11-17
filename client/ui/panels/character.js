// WP6b: Character panel (opens beside the Inventory). Equipment slots (click to unequip), equippable items from the
// bag (click to equip), the armour set, class and mastery, and a stat summary with active immunities.

import { content } from '../../../shared/data/index.js';
import { drawText } from '../../render/text.js';
import { K, ERR_TEXT } from './draft.js';
import { CLASS_STYLE } from '../hud/abilities.js';

const SLOTS = [
  ['hook', 'Hook'], ['weapon', 'Weapon'], ['weapon2', 'Spare'], ['helm', 'Head'], ['coat', 'Body'], ['boots', 'Feet'],
  ['trinket1', 'Trinket'], ['trinket2', 'Trinket'], ['rod', 'Rod'], ['pack', 'Pack'], ['lantern', 'Lantern'],
];
const SET_TEXT = { 1: '+5% move speed', 2: '+10% gather power', 3: 'burn immunity', 4: '+10% crit damage', 5: 'chill immunity', 6: '+10% all damage' };
const S = { msg: '', msgAt: 0 };
const now = () => performance.now() / 1000;
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

function itemTip(id, temper) {
  const d = content.items.byId[id];
  if (!d) return id;
  const g = d.gear || {};
  const k = 1 + 0.06 * (temper || 0);
  const lines = [`${d.name}${temper ? ` +${temper}` : ''}`];
  if (g.dmg) lines.push(`${g.wtype} - ${Math.round(g.dmg * k)} damage, ${g.rate}/s${g.element && g.element !== 'none' ? ', ' + g.element : ''}`);
  if (g.power) lines.push(`Hook power ${+(g.power * k).toFixed(1)}, nodes up to tier ${g.maxNode >= 99 ? 'all' : g.maxNode}`);
  if (g.armor) lines.push(`Armor ${Math.round(g.armor * k)}, max HP +${Math.round(g.hp * k)}`);
  for (const m of d.mods || []) lines.push(`${m.v > 0 ? '+' : ''}${Math.abs(m.v) < 1 && m.stat !== 'luck' ? Math.round(m.v * 100) + '%' : m.v} ${m.stat}${m.when ? ' (' + m.when.replace(/_/g, ' ') + ')' : ''}`);
  if (d.proc) lines.push('Special: ' + (Array.isArray(d.proc) ? d.proc.map((p) => p.id).join(', ') : d.proc.id).replace(/_/g, ' '));
  for (const f of d.flags || []) lines.push(f.replace(/_/g, ' '));
  return lines.join('\n');
}

export default {
  id: 'character',
  key: null,
  modal: false,
  w: 180, h: 268, anchor: 'left',
  open() { S.msg = ''; },
  close() {},
  draw(ui, store) {
    const mgr = ui.ui, t = now();
    const gear = store.self.gear || {};
    const temper = gear.temper || {};
    const stats = store.self.stats || {};
    const cls = store.self.class || {};
    ui.frame('Character', { color: K.goldLight });
    // class line
    const c = cls.id ? content.classes.byId[cls.id] : null;
    const style = c ? CLASS_STYLE[c.id] : null;
    ui.label(6, 15, c ? `${c.name}  M${cls.mastery?.[c.id]?.lv ?? 0}` : 'No class yet', { color: style?.light ?? K.dim });
    ui.label(ui.w - 6, 15, `Lv ${store.self.xp?.level ?? 1}`, { color: K.goldLight, align: 'right' });
    // slots: 2 columns
    SLOTS.forEach(([slot, label], i) => {
      const x = 6 + (i % 2) * 80, y = 26 + Math.floor(i / 2) * 20;
      const id = gear[slot];
      ui.slot(x, y, id ? [id, 1] : null, {
        size: 18,
        tooltip: id ? itemTip(id, temper[id]) + '\nClick to unequip' : `${label} slot`,
        onClick: id ? () => mgr.net.do('gear.unequip', { slot }).then((r) => { if (!r.ok) { S.msg = ERR_TEXT[r.err] ?? r.err; S.msgAt = now(); mgr.sound('deny'); } }) : null,
      });
      ui.label(x + 21, y + 2, label, { color: id ? K.text : K.faint });
      if (id && temper[id]) ui.label(x + 21, y + 10, `+${temper[id]}`, { color: K.goldLight });
    });
    let y = 26 + 6 * 20 + 2;
    if (gear.set) { ui.label(6, y, `Set T${gear.set}: ${SET_TEXT[gear.set]}`, { color: K.good }); y += 10; }
    // equippable from the bag
    const inv = store.self.inv?.slots || [];
    const cand = [];
    inv.forEach((s, i) => { if (s && content.items.byId[s[0]]?.gear) cand.push([i, s]); });
    ui.label(6, y, cand.length ? 'In your bag (click to equip):' : 'No gear in your bag', { color: K.dim });
    y += 10;
    cand.slice(0, 16).forEach(([i, s], k) => {
      const x = 6 + (k % 8) * 20, yy = y + Math.floor(k / 8) * 20;
      ui.slot(x, yy, s, {
        size: 18, tooltip: itemTip(s[0], temper[s[0]]) + '\nClick to equip',
        onClick: () => mgr.net.do('gear.equip', { slot: i }).then((r) => { if (!r.ok) { S.msg = ERR_TEXT[r.err] ?? r.err; S.msgAt = now(); mgr.sound('deny'); } else mgr.sound('build_place'); }),
      });
    });
    y += cand.length > 8 ? 42 : cand.length ? 22 : 2;
    // stats
    const rows = [
      [`HP ${Math.round(stats.maxHp ?? 100)}`, `Armor ${Math.round(stats.armor ?? 0)}`],
      [`Power +${pct(stats.power)}`, `Ability +${pct(stats.abilityPower)}`],
      [`Crit ${pct(stats.critChance)} x${(stats.critMult ?? 1.5).toFixed(2)}`, `Gather +${pct(stats.gatherPower)}`],
      [`Move +${pct(stats.moveSpeed)}`, `Luck ${Math.round(stats.luck ?? 0)}`],
      [`XP +${pct((stats.xpMult ?? 0) + (stats.xpWorld ?? 0))}`, `CDR ${pct(stats.cdr)}`],
    ];
    for (const [a, b] of rows) {
      if (y > ui.h - 20) break;
      ui.label(6, y, a, { color: K.text });
      ui.label(96, y, b, { color: K.text });
      y += 9;
    }
    const imm = (stats.flags || []).filter((f) => f.endsWith('_immune'));
    if (imm.length && y < ui.h - 10) drawText(ui.ctx, 'Immune: ' + imm.map((f) => f.replace('_immune', '')).join(', '), ui.x + 6, ui.y + y, { color: K.seaLight, outline: false });
    if (S.msg && t - S.msgAt < 2.5) ui.label(6, ui.h - 11, S.msg, { color: K.bad });
  },
};
