// WP6b: Tempering Forge (DESIGN 6.4). Pick an equipped piece; cost (n*2 bars, n rares of its tier, 25 * tier * n^2
// Glint), success chance (100% to +5, then 90/80/70/60/50%), and a hammer-strike result: gold sparks or a crack.

import { content } from '../../../shared/data/index.js';
import { TIER_MATS } from '../../../shared/data/items.js';
import { TEMPER_MAX, TEMPER_GLINT, TEMPER_SUCCESS, TEMPER_STAT_PER_LEVEL } from '../../../shared/rules/constants.js';
import { drawText } from '../../render/text.js';
import { K, glow, ERR_TEXT, fmtGlint } from './draft.js';

const SLOTS = ['weapon', 'hook', 'helm', 'coat', 'boots', 'trinket1', 'trinket2', 'rod', 'pack', 'lantern', 'weapon2'];
const S = { sel: null, busy: false, result: null, msg: '', msgAt: 0 };
const now = () => performance.now() / 1000;

function tierOf(def) {
  if (def.tier > 0) return Math.min(6, def.tier);
  const [kind, arg] = String(def.source || '').split(':');
  if (kind === 'boss') return Math.max(1, Math.min(6, content.bosses.byId[arg]?.k || 1));
  if (kind === 'trench') return 6;
  if (kind === 'quest') return 4;
  return 3;
}

export function temperCostClient(itemId, level) {
  const def = content.items.byId[itemId];
  if (!def?.gear) return null;
  const n = level + 1;
  if (n > TEMPER_MAX) return { max: true };
  const tier = tierOf(def), m = TIER_MATS[tier];
  return { n, tier, chance: TEMPER_SUCCESS[n - 1], items: [{ item: m.bar, qty: n * 2 }, { item: m.rare, qty: n }], glint: TEMPER_GLINT * tier * n * n };
}

function have(store, item) {
  let n = 0;
  for (const s of store.self.inv?.slots || []) if (s && s[0] === item) n += s[1];
  return n;
}

export default {
  id: 'temper',
  key: null,
  modal: false,
  w: 300, h: 214, anchor: 'center',
  open(store) { S.sel = SLOTS.find((s) => store.self.gear?.[s]) ?? null; S.result = null; S.msg = ''; },
  close() {},
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    const gear = store.self.gear || {};
    const temper = gear.temper || {};
    ui.frame('Tempering Forge', { color: K.goldLight });
    if (ui.button(ui.w - 18, 2, 'x', { w: 14, h: 10 })) { mgr.close('temper'); return; }
    // equipped list
    let y = 16;
    for (const slot of SLOTS) {
      const id = gear[slot];
      if (!id) continue;
      const def = content.items.byId[id];
      const lv = temper[id] || 0;
      const hot = ui.hover(6, y, 120, 17), sel = S.sel === slot;
      ui.rect(6, y, 120, 17, sel ? K.ink3 : hot ? K.ink2 : K.ink1);
      ui.slot(7, y - 0.5, [id, 1], { size: 17 });
      ui.label(27, y + 5, def?.name ?? id, { color: K.text });
      ui.label(124, y + 5, lv ? `+${lv}` : '', { color: K.goldLight, align: 'right' });
      if (hot && mgr.mouse.released) { S.sel = slot; S.result = null; mgr.consumeClick(); mgr.sound('ui_click'); }
      y += 18;
      if (y > ui.h - 20) break;
    }
    if (y === 16) ui.label(10, 24, 'Equip gear to temper it.', { color: K.dim });
    // selected piece
    const id = S.sel && gear[S.sel];
    if (!id) return;
    const def = content.items.byId[id];
    const lv = temper[id] || 0;
    const px = 136;
    ui.label(px, 18, def.name, { color: K.goldLight });
    // level pips
    for (let i = 0; i < TEMPER_MAX; i++) {
      ui.rect(px + i * 15, 30, 13, 6, K.ink0);
      ui.rect(px + i * 15 + 1, 31, 11, 4, i < lv ? K.gold : i < 5 ? K.ink3 : K.ink2);
    }
    ui.label(px, 40, `+${lv} : +${Math.round(lv * TEMPER_STAT_PER_LEVEL * 100)}% base stats`, { color: K.text });
    const cost = temperCostClient(id, lv);
    if (cost?.max) { ui.label(px, 60, 'Fully tempered!', { color: K.good }); }
    else if (cost) {
      ui.label(px, 54, `To +${cost.n}:  ${Math.round(cost.chance * 100)}% success`, { color: cost.chance < 1 ? K.bad : K.good });
      ui.cost(px, 66, cost.items, (it) => have(store, it), (it) => content.items.byId[it]?.name ?? it);
      const glint = store.world.glint ?? 0;
      ui.label(px, 92, `${fmtGlint(cost.glint)} Glint (Treasury ${fmtGlint(glint)})`, { color: glint >= cost.glint ? K.text : K.bad });
      if (cost.chance < 1) ui.label(px, 102, 'Failure consumes materials, keeps the level', { color: K.faint });
      const can = glint >= cost.glint && cost.items.every((c) => have(store, c.item) >= c.qty);
      if (ui.button(px, 116, S.busy ? 'Hammering...' : `Temper to +${cost.n}`, { w: 100, disabled: !can || S.busy })) {
        S.busy = true;
        mgr.net.do('gear.temper', { item: S.sel }).then((res) => {
          S.busy = false;
          if (!res.ok) { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); return; }
          S.result = { ok: res.d.success, t0: now(), lv: res.d.level };
          mgr.sound(res.d.success ? 'craft_done' : 'shatter');
        });
      }
    }
    // result
    const r = S.result;
    if (r && t - r.t0 < 2.2) {
      const k = (t - r.t0) / 2.2;
      const cx = ui.x + px + 80, cy = ui.y + 160;
      if (r.ok) {
        glow(ctx, cx - 30, cy - 10, 60, 20, K.goldLight, 1 - k, 12);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + r.t0, d = 6 + k * 40;
          ctx.fillStyle = i % 2 ? K.goldLight : K.gold;
          ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.6), 2, 2);
        }
        drawText(ctx, `+${r.lv}!`, cx, cy - 6 - k * 6, { align: 'center', scale: 2, color: K.goldLight });
      } else {
        ctx.strokeStyle = K.bad; ctx.lineWidth = 1; ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.moveTo(cx - 12, cy - 10); ctx.lineTo(cx - 2, cy); ctx.lineTo(cx - 6, cy + 4); ctx.lineTo(cx + 10, cy + 12); ctx.stroke();
        ctx.globalAlpha = 1;
        drawText(ctx, 'Cracked', cx, cy - 18, { align: 'center', color: K.bad });
      }
    }
    if (S.msg && t - S.msgAt < 2.5) ui.label(px, ui.h - 14, S.msg, { color: K.bad });
  },
};
