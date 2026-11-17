// WP6a: the Deck (V). Owned cards by tag with set progress (3 / 5 / 7) and the active set bonuses, a hover preview of
// each card, and card fusion (two max-rank Commons of one tag -> an Uncommon+ draft of that tag, at a Calling Shrine).
// While drafts are pending, V opens the draft instead (the Deck button there leads back here).

import { content } from '../../../shared/data/index.js';
import { TAG_SETS } from '../../../shared/data/cards.js';
import { drawText } from '../../render/text.js';
import { K, RARITY, RARITY_ORDER, TAGS, drawGlyph, drawIcon, drawCardFace, box, glow, wrap, ERR_TEXT, CW } from './draft.js';

const TAG_LIST = Object.keys(TAGS);
const S = { view: false, sel: [], fuse: false, msg: '', msgAt: 0, hover: null };
const now = () => performance.now() / 1000;

export default {
  id: 'deck',
  key: 'panel.deck',
  modal: false,
  w: 452, h: 262, anchor: 'center',
  open(store, args) { S.view = !!args?.view; S.sel = []; S.fuse = false; S.msg = ''; },
  close() { S.fuse = false; },
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    const cards = store.self.cards || { owned: {}, drafts: [] };
    if (!S.view && cards.drafts?.length) { mgr.close('deck'); mgr.open('draft'); return; }
    const owned = cards.owned || {};
    const ids = Object.keys(owned).filter((id) => owned[id] > 0 && content.cards.byId[id]);
    const totalRanks = ids.reduce((s, id) => s + owned[id], 0);
    ui.frame(`Deck  -  ${ids.length} cards, ${totalRanks} ranks`, { color: K.goldLight });

    // ---- left: tags and sets
    const sets = cards.sets || {};
    let y = 16;
    S.hover = null;
    for (const tag of TAG_LIST) {
      const n = sets[tag] || 0;
      const T = TAGS[tag];
      const hot = ui.hover(4, y - 1, 150, 26);
      if (hot) ui.rect(4, y - 1, 150, 26, K.ink2);
      drawGlyph(ctx, tag, ui.x + 8, ui.y + y + 1, 1, n >= 3 ? T.light : K.faint);
      ui.label(19, y + 1, T.name, { color: n >= 3 ? T.light : K.dim });
      // 7 pips with the thresholds marked
      for (let i = 0; i < 7; i++) {
        const px = 64 + i * 8, th = i === 2 || i === 4 || i === 6;
        ui.rect(px, y + 2, 6, 6, th ? K.ink4 : K.ink0);
        ui.rect(px + 1, y + 3, 4, 4, i < n ? (th ? K.goldLight : T.color) : K.ink2);
      }
      ui.label(124, y + 1, `${n}/12`, { color: K.faint });
      const active = [3, 5, 7].filter((k) => n >= k);
      const next = [3, 5, 7].find((k) => n < k);
      const line = active.length ? `${active.at(-1)}: ${TAG_SETS[tag][active.at(-1)].text}` : `3: ${TAG_SETS[tag][3].text}`;
      ui.label(19, y + 11, wrap(line, 132)[0], { color: active.length ? K.text : K.faint });
      if (hot) {
        const tip = [`${T.name} set (${n} distinct cards)`];
        for (const k of [3, 5, 7]) tip.push(`${n >= k ? '[ON] ' : '[  ] '}${k}: ${TAG_SETS[tag][k].text}`);
        if (next) tip.push(`${next - n} more for the next bonus`);
        ui.tooltip(tip.join('\n'));
      }
      y += 28;
    }

    // ---- right: owned cards grid, by tag then rarity
    const gx = 160, gy = 16, cell = 26;
    const cols = Math.floor((ui.w - gx - 6) / cell);
    const sorted = ids.sort((a, b) => {
      const A = content.cards.byId[a], B = content.cards.byId[b];
      return TAG_LIST.indexOf(A.tag) - TAG_LIST.indexOf(B.tag) || RARITY_ORDER.indexOf(B.rarity) - RARITY_ORDER.indexOf(A.rarity) || a.localeCompare(b);
    });
    if (!sorted.length) ui.label(gx + 10, gy + 30, 'No cards yet. Each level-up deals a Tide Draft.', { color: K.dim });
    sorted.forEach((id, i) => {
      const c = content.cards.byId[id];
      const x = gx + (i % cols) * cell, yy = gy + Math.floor(i / cols) * 32;
      const r = RARITY[c.rarity], T = TAGS[c.tag];
      const hot = ui.hover(x, yy, 24, 30);
      const sel = S.sel.includes(id);
      const fusable = S.fuse && c.rarity === 'common' && owned[id] >= c.max;
      if (sel) glow(ctx, ui.x + x, ui.y + yy, 24, 30, K.goldLight, 1, 6);
      else if (fusable) glow(ctx, ui.x + x, ui.y + yy, 24, 30, T.color, 0.5 + 0.4 * Math.sin(t * 4), 4);
      box(ctx, ui.x + x, ui.y + yy, 24, 30, K.ink1, K.ink0, hot ? K.text : r.color);
      ctx.fillStyle = r.dark; ctx.fillRect(ui.x + x + 2, ui.y + yy + 2, 20, 13);
      if (!drawIcon(ctx, mgr.sprites, 'icon.card.' + c.id, ui.x + x + 4, ui.y + yy + 1, 16)) drawGlyph(ctx, c.tag, ui.x + x + 4, ui.y + yy + 3, 2, T.light);
      // rank pips
      for (let k = 0; k < c.max; k++) {
        ctx.fillStyle = k < owned[id] ? r.color : K.ink3;
        ctx.fillRect(ui.x + x + 3 + k * 4, ui.y + yy + 24, 3, 3);
      }
      drawText(ctx, id.toUpperCase(), ui.x + x + 12, ui.y + yy + 16, { align: 'center', color: K.dim, outline: false });
      if (hot) {
        S.hover = c;
        if (S.fuse && mgr.mouse.released) {
          mgr.consumeClick();
          if (!fusable) { S.msg = 'Fuse two max-rank Commons of one tag'; S.msgAt = t; mgr.sound('deny'); }
          else if (sel) S.sel = S.sel.filter((s) => s !== id);
          else {
            const first = S.sel[0] && content.cards.byId[S.sel[0]];
            if (first && first.tag !== c.tag) S.sel = [];
            S.sel = [...S.sel, id].slice(-2);
            mgr.sound('card_flip');
          }
        }
      }
    });
    // big preview of the hovered card
    if (S.hover) {
      const c = S.hover;
      const px = Math.min(ui.x + ui.w + 4, mgr.W - CW - 4);
      ctx.save();
      drawCardFace(ctx, c, px, ui.y + 20, { rank: owned[c.id] || 0, sprites: mgr.sprites });
      ctx.restore();
    }

    // ---- footer: fusion
    const fy = ui.h - 18;
    const canAny = TAG_LIST.some((tag) => content.cards.filter((c) => c.tag === tag && c.rarity === 'common' && (owned[c.id] || 0) >= c.max).length >= 2);
    if (!S.fuse) {
      if (ui.button(gx, fy, 'Card Fusion', { w: 70, disabled: !canAny, tooltip: 'At a Calling Shrine: sacrifice two max-rank Commons of one tag\nfor a draft of 3 Uncommon-or-better cards of that tag.' })) { S.fuse = true; S.sel = []; }
    } else {
      ui.label(gx, fy + 3, S.sel.length < 2 ? `Pick ${2 - S.sel.length} max-rank Common${S.sel.length ? '' : 's'} of one tag` : 'Ready to fuse', { color: K.goldLight });
      if (ui.button(ui.w - 130, fy, 'Fuse', { w: 44, disabled: S.sel.length < 2 })) {
        mgr.net.do('card.fuse', { a: S.sel[0], b: S.sel[1] }).then((res) => {
          if (!res.ok) { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); return; }
          S.fuse = false; S.sel = [];
          mgr.sound('card_mythic');
          mgr.close('deck'); mgr.open('draft');
        });
      }
      if (ui.button(ui.w - 82, fy, 'Cancel', { w: 44 })) { S.fuse = false; S.sel = []; }
    }
    if (cards.drafts?.length && ui.button(ui.w - 36, fy, 'Drafts', { w: 32 })) { mgr.close('deck'); mgr.open('draft'); }
    ui.label(gx + (S.fuse ? 0 : 76), fy - 9, `Tokens ${cards.tokens ?? 0}   Banishes ${cards.banishes ?? 0}${cards.apex ? `   Apex +${(cards.apex * 100).toFixed(2)}%` : ''}`, { color: K.faint });
    if (S.msg && t - S.msgAt < 2.5) ui.label(ui.w - 6, 4, S.msg, { color: K.bad, align: 'right' });
  },
};
