// WP6a: the Chart (K). 5 branches x 3 rows x 4 nodes. Owned nodes glow in their branch colour, buyable nodes pulse,
// locked nodes say exactly what they need (row gate, level, points). Structure unlocks are listed on each node.
// Respec (100 Glint per level) works at a Calling Shrine.

import { content } from '../../../shared/data/index.js';
import { drawText } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { K, drawGlyph, drawIcon, glow, wrap, BRANCH_GLYPH, ERR_TEXT, fmtGlint } from './draft.js';

const P = (r, i) => PAL[RAMPS[r][i]];
const BRANCHES = [
  { id: 'harvest', name: 'Harvest', color: P('grass', 3), light: P('grass', 4), dark: P('grass', 0) },
  { id: 'forge', name: 'Forge', color: P('brown', 4), light: P('sand', 4), dark: P('brown', 0) },
  { id: 'fray', name: 'Fray', color: P('ember', 3), light: P('ember', 4), dark: P('ember', 0) },
  { id: 'tide', name: 'Tide', color: P('sea', 3), light: P('sea', 4), dark: P('sea', 0) },
  { id: 'fortune', name: 'Fortune', color: P('gold', 3), light: P('gold', 4), dark: P('gold', 0) },
];
const ROW_RULES = { 2: { prev: 3, level: 20 }, 3: { prev: 3, level: 50 } };
const S = { msg: '', msgAt: 0, flash: {}, busy: false, hover: null };
const now = () => performance.now() / 1000;

function why(sk, owned, level, points) {
  if (owned.includes(sk.id)) return null;
  const rule = ROW_RULES[sk.row];
  const out = [];
  if (rule) {
    const prev = owned.filter((o) => { const s = content.skills.byId[o]; return s?.branch === sk.branch && s.row === sk.row - 1; }).length;
    if (prev < rule.prev) out.push(`Needs ${rule.prev} row-${sk.row - 1} nodes in this branch (${prev}/${rule.prev})`);
    if (level < rule.level) out.push(`Needs level ${rule.level}`);
  }
  if (points < sk.cost) out.push(`Needs ${sk.cost} point${sk.cost > 1 ? 's' : ''} (you have ${points})`);
  return out;
}

export default {
  id: 'skills',
  key: 'panel.skills',
  modal: false,
  w: 474, h: 262, anchor: 'center',
  open() { S.msg = ''; },
  close() {},
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    const sk = store.self.skills || { points: 0, owned: [] };
    const owned = sk.owned || [];
    const level = store.self.xp?.level ?? 1;
    const points = sk.points ?? 0;
    ui.frame('The Chart', { color: K.seaLight });
    ui.label(ui.w - 8, 3, `${points} point${points === 1 ? '' : 's'} to spend   ${owned.length}/60 charted`, { color: points ? K.goldLight : K.dim, align: 'right' });
    S.hover = null;
    const colW = 92, top = 18;
    BRANCHES.forEach((b, bi) => {
      const x0 = 6 + bi * colW;
      const n = owned.filter((id) => content.skills.byId[id]?.branch === b.id).length;
      ui.rect(x0, top, colW - 4, 18, b.dark);
      drawGlyph(ctx, BRANCH_GLYPH[b.id], ui.x + x0 + 3, ui.y + top + 5, 1, b.light);
      ui.label(x0 + 14, top + 5, b.name, { color: b.light });
      ui.label(x0 + colW - 8, top + 5, `${n}/12`, { color: K.faint, align: 'right' });
      for (let row = 1; row <= 3; row++) {
        const ry = top + 24 + (row - 1) * 50;
        const rule = ROW_RULES[row];
        const prev = rule ? owned.filter((o) => { const s = content.skills.byId[o]; return s?.branch === b.id && s.row === row - 1; }).length : 0;
        const open = !rule || (prev >= rule.prev && level >= rule.level);
        // connector from the row above
        if (row > 1) {
          for (let k = 0; k < 4; k++) ui.rect(x0 + 11 + k * 21, ry - 12, 1, 10, open ? b.color : K.ink3);
          if (!open) ui.label(x0 + colW - 8, ry - 11, `Lv${rule.level}  ${Math.min(prev, rule.prev)}/${rule.prev}`, { color: level >= rule.level ? K.faint : K.bad, align: 'right' });
        }
        for (let col = 0; col < 4; col++) {
          const s = content.skills.find((q) => q.branch === b.id && q.row === row && q.col === col);
          if (!s) continue;
          const nx = x0 + 2 + col * 21, ny = ry;
          const has = owned.includes(s.id);
          const blocks = why(s, owned, level, points);
          const can = !has && blocks && blocks.length === 0;
          const hot = ui.hover(nx, ny, 19, 19);
          const fl = S.flash[s.id];
          if (fl && t - fl < 0.7) glow(ctx, ui.x + nx, ui.y + ny, 19, 19, b.light, 1 - (t - fl) / 0.7, 14);
          if (has) glow(ctx, ui.x + nx, ui.y + ny, 19, 19, b.color, 0.45, 4);
          else if (can) glow(ctx, ui.x + nx, ui.y + ny, 19, 19, K.goldLight, 0.35 + 0.35 * Math.sin(t * 5 + col), 4);
          ui.rect(nx, ny, 19, 19, K.ink0);
          ui.rect(nx + 1, ny + 1, 17, 17, has ? b.color : can ? K.goldDark : open ? K.ink2 : K.ink1);
          if (hot) ui.rect(nx + 1, ny + 1, 17, 1, K.text);
          if (!has && !open) drawGlyph(ctx, 'lock', ui.x + nx + 5, ui.y + ny + 5, 1, K.faint, null);
          else if (!drawIcon(ctx, mgr.sprites, 'icon.skill.' + s.id, ui.x + nx + 1, ui.y + ny + 1, 17)) drawText(ctx, s.id, ui.x + nx + 10, ui.y + ny + 6, { align: 'center', color: has ? K.ink0 : can ? K.goldLight : K.text, outline: false });
          if (!has && open) { ctx.fillStyle = 'rgba(13,10,20,' + (can ? 0.15 : 0.45) + ')'; ctx.fillRect(ui.x + nx + 1, ui.y + ny + 1, 17, 17); }
          // cost pips (top-right)
          for (let c = 0; c < s.cost; c++) { ctx.fillStyle = K.ink0; ctx.fillRect(ui.x + nx + 15, ui.y + ny + 1 + c * 3, 3, 3); ctx.fillStyle = has ? b.light : K.gold; ctx.fillRect(ui.x + nx + 16, ui.y + ny + 2 + c * 3, 2, 2); }
          if (hot) {
            S.hover = { s, has, blocks, b };
            if (mgr.mouse.released) {
              mgr.consumeClick();
              if (has) { /* owned */ } else if (!can) { mgr.sound('deny'); S.msg = blocks[0]; S.msgAt = t; } else if (!S.busy) {
                S.busy = true;
                mgr.net.do('skill.buy', { skill: s.id }).then((res) => {
                  S.busy = false;
                  if (res.ok) { S.flash[s.id] = now(); mgr.sound('skill_buy'); } else { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); }
                });
              }
            }
          }
        }
      }
    });
    // detail pane
    const dy = top + 24 + 3 * 50 - 4;
    ui.rect(6, dy, ui.w - 12, ui.h - dy - 6, K.ink1);
    const h = S.hover;
    if (h) {
      const { s, has, blocks, b } = h;
      ui.label(10, dy + 4, `${s.id}  ${s.name}`, { color: b.light });
      ui.label(ui.w - 10, dy + 4, has ? 'Charted' : `Cost ${s.cost}`, { color: has ? K.good : K.goldLight, align: 'right' });
      let ly = dy + 14;
      for (const l of wrap(s.text, ui.w - 124).slice(0, 2)) { ui.label(10, ly, l, { color: K.text }); ly += 9; }
      if (s.unlocks?.length) { ui.label(10, ly, 'Unlocks: ' + s.unlocks.map((id) => content.structures.byId[id]?.name ?? id).join(', '), { color: K.seaLight }); ly += 9; }
      if (!has && blocks?.length) ui.label(10, ly, blocks.join('; '), { color: K.bad });
    } else {
      ui.label(10, dy + 4, 'Hover a node to read it. Structure unlocks apply to the whole crew.', { color: K.dim });
      ui.label(10, dy + 14, 'Row 2 opens at level 20 with 3 row-1 nodes; row 3 at level 50 with 3 row-2 nodes.', { color: K.faint });
    }
    const cost = sk.respecCost ?? level * 100;
    if (ui.button(ui.w - 104, dy + 26, `Respec (${fmtGlint(cost)} G)`, { w: 96, disabled: !owned.length, tooltip: 'Refund every point. Only at a Calling Shrine.' })) {
      mgr.net.do('skill.respec', {}).then((res) => {
        if (!res.ok) { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); } else mgr.sound('skill_buy');
      });
    }
    if (S.msg && t - S.msgAt < 3) ui.label(10, ui.h - 15, S.msg, { color: K.bad });
  },
};
