// WP6b: the Calling Shrine (class select, DESIGN 10). Six classes with passive, mastery and abilities; choose /
// switch (10-minute cooldown), Second Calling (skill T9), Signature picks at levels 70 / 80 / 90, and the shrine's
// other services: Chart respec and card fusion.

import { content } from '../../../shared/data/index.js';
import { drawText } from '../../render/text.js';
import { K, wrap, glow, ERR_TEXT, fmtGlint } from './draft.js';
import { CLASS_STYLE, drawAbilityIcon, abilityTooltip, ABILITY_TEXT } from '../hud/abilities.js';

const LV = [10, 20, 35, 60];
const PRIMARY = { maxHp: 'max HP', critMult: 'crit damage', abilityPower: 'ability damage', craftSpeed: 'craft speed', gatherPower: 'gather power', yieldAll: 'yields' };
const S = { sel: null, msg: '', msgAt: 0, flash: 0, busy: false };
const now = () => performance.now() / 1000;

function act(mgr, a, d, okMsg) {
  if (S.busy) return;
  S.busy = true;
  mgr.net.do(a, d).then((res) => {
    S.busy = false;
    if (!res.ok) { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); return; }
    S.flash = now();
    if (okMsg) { S.msg = okMsg; S.msgAt = now(); }
    mgr.sound('skill_buy');
  });
}

export default {
  id: 'class',
  key: null,
  modal: true,
  w: 470, h: 272, anchor: 'center',
  open(store) { S.sel = store.self.class?.id ?? 'bulwark'; S.msg = ''; },
  close() {},
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    const cs = store.self.class || {};
    const level = store.self.xp?.level ?? 1;
    ui.frame('Calling Shrine', { color: K.goldLight });
    if (ui.button(ui.w - 18, 2, 'x', { w: 14, h: 10 })) { mgr.close('class'); return; }
    // ---- class tiles
    const tw = 74;
    content.classes.forEach((c, i) => {
      const x = 6 + i * (tw + 3), y = 16;
      const st = CLASS_STYLE[c.id];
      const hot = ui.hover(x, y, tw, 40);
      const active = cs.id === c.id, second = cs.second === c.id, sel = S.sel === c.id;
      if (active) glow(ctx, ui.x + x, ui.y + y, tw, 40, st.light, 0.6 + 0.3 * Math.sin(t * 3), 5);
      ui.rect(x, y, tw, 40, sel ? K.text : active ? K.goldLight : K.ink0);
      ui.rect(x + 1, y + 1, tw - 2, 38, hot || sel ? K.ink3 : K.ink2);
      ui.rect(x + 1, y + 1, tw - 2, 12, st.dark);
      drawAbilityIcon(ctx, null, c.abilities[0], ui.x + x + 3, ui.y + y + 15, 18);
      ui.label(x + 4, y + 3, c.name, { color: st.light });
      const m = cs.mastery?.[c.id]?.lv ?? 0;
      ui.label(x + 24, y + 17, `M${m}/20`, { color: m ? K.goldLight : K.faint });
      ui.label(x + 24, y + 27, active ? 'ACTIVE' : second ? 'SECOND' : c.favoured, { color: active ? K.good : second ? K.seaLight : K.dim });
      if (hot && mgr.mouse.released) { S.sel = c.id; mgr.consumeClick(); mgr.sound('ui_click'); }
    });
    const c = content.classes.byId[S.sel] ?? content.classes[0];
    const st = CLASS_STYLE[c.id];
    // ---- details
    let y = 62;
    ui.label(8, y, `${c.name}`, { color: st.light, scale: 1 });
    ui.label(8 + c.name.length * 6 + 6, y, `- ${c.role} (favoured weapon: ${c.favoured})`, { color: K.dim });
    y += 11;
    for (const l of wrap(`${c.passive.name}: ${c.passive.text}`, ui.w - 16).slice(0, 2)) { ui.label(8, y, l, { color: K.text }); y += 9; }
    const ms = cs.mastery?.[c.id] || { lv: 0, into: 0, need: 600 };
    ui.label(8, y + 1, `Mastery ${ms.lv}/20`, { color: K.goldLight });
    ui.bar(90, y + 1, 130, 6, ms.need ? ms.into : 1, ms.need || 1, st.color);
    ui.label(228, y + 1, `+${ms.lv}% ${PRIMARY[c.primary] ?? c.primary}   Q/E upgrade at 10, R/F at 20`, { color: K.dim });
    y += 12;
    // ---- abilities
    const picks = store.self.sig?.[c.id] || [];
    const sigFree = cs.id === c.id && (cs.sigSlots ?? 0) > picks.length;
    c.abilities.forEach((id, i) => {
      const def = content.abilities.byId[id];
      const ry = y + i * 30;
      const unlocked = level >= LV[i];
      const up = ms.lv >= def.upgrade.mastery;
      const sig = picks.includes(id);
      const hot = ui.hover(6, ry, ui.w - 12, 28);
      ui.rect(6, ry, ui.w - 12, 28, hot ? K.ink2 : K.ink1);
      drawAbilityIcon(ctx, mgr.sprites, id, ui.x + 9, ui.y + ry + 4, 20, { dim: !unlocked, signature: sig });
      ui.label(34, ry + 3, `${'QERF'[i]}  ${def.name}`, { color: unlocked ? K.text : K.dim });
      ui.label(150, ry + 3, `Lv ${LV[i]}   ${def.surge} Surge   ${def.cd} s`, { color: level >= LV[i] ? K.faint : K.bad });
      ui.label(34, ry + 12, wrap(def.text, 300)[0], { color: K.dim });
      const [upT, sigT] = ABILITY_TEXT[id] || ['', ''];
      ui.label(34, ry + 20, `${up ? '+' : '-'} M${def.upgrade.mastery}: ${upT}`, { color: up ? K.good : K.faint });
      ui.label(250, ry + 20, `${sig ? '*' : '-'} Sig: ${wrap(sigT, 150)[0]}`, { color: sig ? K.goldLight : K.faint });
      if (sigFree && !sig && ui.button(ui.w - 66, ry + 3, 'Signature', { w: 56, tooltip: 'Make this ability\'s Signature permanent' })) act(mgr, 'ability.signature', { ability: id }, `Signature: ${def.name}`);
      if (hot) ui.tooltip(abilityTooltip(store, id));
    });
    // ---- actions
    const by = ui.h - 18;
    const readyIn = cs.switchReadyAt ? cs.switchReadyAt - (store.serverTime?.(performance.now()) ?? 0) / 1000 : 0;
    if (cs.id === c.id) ui.label(8, by + 3, sigFree ? 'Active - pick a Signature above' : 'Your active class', { color: K.good });
    else {
      const locked = level < 10;
      const cool = cs.id && readyIn > 0;
      const label = locked ? 'Reach level 10' : cool ? `Switch in ${Math.floor(readyIn / 60)}:${String(Math.floor(readyIn % 60)).padStart(2, '0')}` : cs.id ? `Switch to ${c.name}` : `Answer the call: ${c.name}`;
      if (ui.button(8, by, label, { w: 150, disabled: locked || cool })) act(mgr, 'class.choose', { class: c.id });
      if (cs.secondCalling && cs.second !== c.id && ui.button(164, by, 'Second Calling', { w: 84, tooltip: 'Equip this class\'s first two abilities on Z and X' })) act(mgr, 'class.choose', { class: c.id, second: true });
    }
    const respec = store.self.skills?.respecCost ?? level * 100;
    const rl = `Respec Chart ${fmtGlint(respec)} G`;
    if (ui.button(ui.w - 92 - rl.length * 6, by, rl, { w: rl.length * 6 + 10, disabled: !(store.self.skills?.owned?.length) })) act(mgr, 'skill.respec', {}, 'Chart reset: points refunded');
    if (ui.button(ui.w - 78, by, 'Card Fusion', { w: 70 })) { mgr.close('class'); mgr.open('deck', { view: true }); }
    if (S.flash && t - S.flash < 0.4) { ctx.fillStyle = `rgba(255,240,138,${0.25 * (1 - (t - S.flash) / 0.4)})`; ctx.fillRect(ui.x, ui.y, ui.w, ui.h); }
    if (S.msg && t - S.msgAt < 3) drawText(ctx, S.msg, ui.x + ui.w / 2, ui.y + by - 10, { align: 'center', color: K.goldLight });
  },
};
