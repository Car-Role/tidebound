// WP6a: Tide Draft panel (DESIGN 9.1). Opened from the pulsing deck badge or V while drafts are pending.
// Cards deal face-down and flip one by one (rarity glow, Rare+ flare); click (or 1-5) to pick, Reroll, Banish, Skip.
// Also exports the small WP6 UI kit (colours, tag glyphs, card faces, text wrap) used by the deck and skill panels.

import { content } from '../../../shared/data/index.js';
import { drawText, measure } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { UI_COLORS } from '../widgets.js';

// ---------------------------------------------------------------- UI kit

const P = (ramp, i) => PAL[RAMPS[ramp][i]];
export const K = Object.freeze({
  ink0: P('ink', 0), ink1: P('ink', 1), ink2: P('ink', 2), ink3: P('ink', 3), ink4: P('ink', 4),
  text: '#ffffff', dim: P('stone', 3), faint: P('stone', 1), gold: P('gold', 3), goldLight: P('gold', 4), goldDark: P('gold', 1),
  good: P('grass', 4), bad: P('ember', 3), sea: P('sea', 3), seaLight: P('sea', 4), seaDark: P('sea', 1),
});

export const RARITY = Object.freeze({
  common: { name: 'Common', color: P('stone', 3), dark: P('stone', 1), gems: 0 },
  uncommon: { name: 'Uncommon', color: P('grass', 3), dark: P('grass', 1), gems: 1 },
  rare: { name: 'Rare', color: P('sea', 4), dark: P('sea', 2), gems: 2 },
  epic: { name: 'Epic', color: P('violet', 3), dark: P('violet', 1), gems: 3 },
  mythic: { name: 'Mythic', color: P('gold', 3), dark: P('gold', 1), gems: 4 },
});
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'mythic'];

export const TAGS = Object.freeze({
  tide: { name: 'Tide', color: P('sea', 3), light: P('sea', 4) },
  ember: { name: 'Ember', color: P('ember', 3), light: P('ember', 4) },
  frost: { name: 'Frost', color: P('ice', 3), light: P('ice', 4) },
  storm: { name: 'Storm', color: P('violet', 3), light: P('violet', 4) },
  bloom: { name: 'Bloom', color: P('grass', 3), light: P('grass', 4) },
  gear: { name: 'Gear', color: P('brown', 4), light: P('sand', 4) },
  fortune: { name: 'Fortune', color: P('gold', 3), light: P('gold', 4) },
  fang: { name: 'Fang', color: P('ember', 2), light: P('flesh', 3) },
});

// 8x8 glyphs for card tags and skill branches.
const GLYPHS = {
  tide: ['........', '.##..##.', '#..##..#', '........', '.##..##.', '#..##..#', '........', '........'],
  ember: ['...#....', '...##...', '..###.#.', '.####.#.', '.######.', '########', '.######.', '..####..'],
  frost: ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'],
  storm: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
  bloom: ['.....##.', '...####.', '..#####.', '.######.', '.#####..', '.####...', '#.##....', '#.......'],
  gear: ['..#..#..', '.######.', '##.##.##', '.##..##.', '.##..##.', '##.##.##', '.######.', '..#..#..'],
  fortune: ['..####..', '.######.', '###..###', '##.##.##', '##.##.##', '###..###', '.######.', '..####..'],
  fang: ['#......#', '##....##', '###..###', '.##..##.', '.##..##.', '..#..#..', '..#..#..', '........'],
  fray: ['.......#', '......##', '.....##.', '#...##..', '.#.##...', '..##....', '.##.#...', '#....#..'],
  lock: ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '........'],
  star: ['...#....', '...#....', '.#####..', '..###...', '..#.#...', '.#...#..', '........', '........'],
};
export const BRANCH_GLYPH = { harvest: 'bloom', forge: 'gear', fray: 'fray', tide: 'tide', fortune: 'fortune' };

export function drawGlyph(ctx, name, x, y, s, color, shadow = K.ink0) {
  const g = GLYPHS[name];
  if (!g) return;
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass ? color : shadow;
    const o = pass ? 0 : s >= 2 ? 1 : 0;
    if (!pass && !o) continue;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] === '#') ctx.fillRect(Math.round(x + c * s + o), Math.round(y + r * s + o), s, s);
  }
}

// Greedy word wrap for the 5x7 font.
export function wrap(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (measure(t) > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// Draw a sprite centred in a size x size box, honouring its anchor (WP3 icons are 16x16, anchor top-left).
export function drawIcon(ctx, sprites, id, x, y, size = 16) {
  const e = sprites?.entries?.get?.(id);
  if (!e) return false;
  sprites.draw(ctx, id, Math.round(x + (size - e.w) / 2 + e.anchor[0]), Math.round(y + (size - e.h) / 2 + e.anchor[1]), {});
  return true;
}

export function box(ctx, x, y, w, h, fill, border, inner) {
  ctx.fillStyle = border; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = inner ?? fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (inner) { ctx.fillStyle = fill; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); }
}

export function glow(ctx, x, y, w, h, color, a, spread = 6) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = spread; i >= 1; i -= 2) {
    ctx.globalAlpha = a * (1 - i / (spread + 2)) * 0.35;
    ctx.fillStyle = color;
    ctx.fillRect(x - i, y - i, w + i * 2, h + i * 2);
  }
  ctx.restore();
}

function rarityGems(ctx, rarity, x, y, color) {
  const n = RARITY[rarity]?.gems ?? 0;
  if (n === 4) { drawGlyph(ctx, 'star', x - 4, y - 1, 1, color); return; }
  for (let i = 0; i < n; i++) {
    const gx = x + (i - (n - 1) / 2) * 5;
    ctx.fillStyle = K.ink0; ctx.fillRect(gx - 1, y, 3, 3);
    ctx.fillStyle = color; ctx.fillRect(gx - 1, y + 1, 3, 1); ctx.fillRect(gx, y, 1, 3);
  }
}

export const CW = 84, CH = 150;

export function drawCardBack(ctx, x, y, w = CW, h = CH, t = 0) {
  box(ctx, x, y, w, h, K.ink1, K.ink0, K.seaDark);
  ctx.fillStyle = K.ink2;
  for (let r = 0; r < h - 8; r += 6) {
    const off = Math.round(Math.sin(r * 0.4 + t * 2) * 2);
    for (let c = 4 + ((r / 6) % 2) * 3 + off; c < w - 6; c += 7) ctx.fillRect(x + c, y + 4 + r, 3, 1);
  }
  ctx.fillStyle = K.seaDark; ctx.fillRect(x + w / 2 - 14, y + h / 2 - 14, 28, 28);
  drawGlyph(ctx, 'tide', x + w / 2 - 12, y + h / 2 - 12, 3, K.sea);
}

// Full card face. opts: { rank (owned), hover, dim, setCount, banish }
export function drawCardFace(ctx, card, x, y, opts = {}) {
  const rar = RARITY[card.rarity] ?? RARITY.common;
  const tag = TAGS[card.tag] ?? TAGS.tide;
  const w = CW, h = CH;
  box(ctx, x, y, w, h, K.ink1, K.ink0, opts.hover ? K.text : rar.color);
  // tag band
  ctx.fillStyle = rar.dark; ctx.fillRect(x + 2, y + 2, w - 4, 24);
  ctx.fillStyle = tag.color; ctx.fillRect(x + 2, y + 25, w - 4, 1);
  if (!drawIcon(ctx, opts.sprites, 'icon.card.' + card.id, x + w / 2 - 8, y + 5, 16)) drawGlyph(ctx, card.tag, x + w / 2 - 8, y + 5, 2, tag.light);
  if (opts.isNew) drawText(ctx, 'NEW', x + 4, y + 16, { color: K.goldLight, outline: K.ink0 });
  rarityGems(ctx, card.rarity, x + 9, y + 5, rar.color);
  rarityGems(ctx, card.rarity, x + w - 9, y + 5, rar.color);
  // name
  let cy = y + 29;
  for (const l of wrap(card.name, w - 8).slice(0, 2)) { drawText(ctx, l, x + w / 2, cy, { color: rar.color === RARITY.common.color ? K.text : rar.color, outline: K.ink0, align: 'center' }); cy += 9; }
  cy = Math.max(cy, y + 47);
  ctx.fillStyle = K.ink3; ctx.fillRect(x + 6, cy, w - 12, 1);
  cy += 4;
  for (const l of wrap(card.text, w - 9).slice(0, 9)) { drawText(ctx, l, x + 5, cy, { color: P('stone', 4), outline: false }); cy += 8; }
  // rank pips
  const rank = opts.rank ?? 0;
  const pw = 6, total = card.max * pw - 2;
  const px = x + Math.round((w - total) / 2), py = y + h - 21;
  for (let i = 0; i < card.max; i++) {
    const filled = i < rank, next = i === rank;
    ctx.fillStyle = K.ink0; ctx.fillRect(px + i * pw, py, 4, 4);
    ctx.fillStyle = filled ? rar.color : next ? (Math.sin(performance.now() / 150) > 0 ? K.goldLight : K.gold) : K.ink3;
    ctx.fillRect(px + i * pw, py, 4, 3);
  }
  // footer: tag + set progress
  const footer = opts.setCount != null ? `${tag.name} ${opts.setCount}` : tag.name;
  drawText(ctx, footer, x + w / 2, y + h - 12, { color: tag.light, outline: false, align: 'center' });
  if (opts.dim) { ctx.fillStyle = 'rgba(13,10,20,0.55)'; ctx.fillRect(x, y, w, h); }
  if (opts.banish) {
    ctx.fillStyle = 'rgba(196,68,30,0.35)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = K.bad; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 10, y + 10); ctx.lineTo(x + w - 10, y + h - 10); ctx.moveTo(x + w - 10, y + 10); ctx.lineTo(x + 10, y + h - 10); ctx.stroke();
  }
}

// Distinct cards per tag and the next set threshold, for "Gear 2/3" footers.
export function setProgress(owned, tag) {
  let n = 0;
  for (const [id, r] of Object.entries(owned || {})) if (r > 0 && content.cards.byId[id]?.tag === tag) n++;
  const next = [3, 5, 7].find((t) => t > n);
  return { n, next };
}

export const fmtGlint = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));

export const ERR_TEXT = {
  cost: 'Not enough', range: 'Stand at a Calling Shrine', locked: 'Locked', cooldown: 'Not ready',
  full: 'Already at max', invalid: 'Not possible', busy: 'Busy', dead: 'You are down',
};

// ---------------------------------------------------------------- panel

const SOURCE_TEXT = { level: 'Level-up draft', warden: 'Warden bonus: Rare or better', vault: 'Vault bonus: Uncommon or better', fusion: 'Fusion draft', bonus: 'Bonus draft' };
const FLIP_S = 0.28, STAGGER_S = 0.16;

const S = {
  key: null, revealAt: 0, flipped: new Set(), banishMode: false, pick: null, busy: false, msg: '', msgAt: 0, last: null,
};

function now() { return performance.now() / 1000; }

function reveal(draft) {
  S.key = draft.id + ':' + draft.offers.join(',');
  S.revealAt = now() + 0.15;
  S.flipped = new Set();
  S.banishMode = false;
}

function act(mgr, a, d, after) {
  if (S.busy) return;
  S.busy = true;
  mgr.net.do(a, d).then((res) => {
    S.busy = false;
    if (!res.ok) { S.msg = ERR_TEXT[res.err] ?? res.err; S.msgAt = now(); mgr.sound('deny'); }
    else after?.(res);
  });
}

export default {
  id: 'draft',
  key: null,
  modal: true,
  w: 476, h: 246, anchor: 'center',
  open() { S.key = null; S.pick = null; S.msg = ''; S.picked = false; },
  close() { S.banishMode = false; },
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    const cards = store.self.cards || { drafts: [] };
    let draft = cards.drafts?.[0];
    // keep animating the picked card after the server removed its draft
    if (S.pick && t - S.pick.t0 < 0.5) draft = S.pick.draft;
    else if (S.pick) { S.pick = null; S.picked = true; }
    ui.frame('Tide Draft', { color: K.goldLight });
    if (!draft) {
      // P2-16: after the last pick the panel closes itself instead of idling on "No drafts waiting"
      if (S.picked) { S.picked = false; mgr.close('draft'); return; }
      ui.label(ui.w / 2, 90, 'No drafts waiting. Level up to earn one!', { align: 'center', color: K.dim });
      if (ui.button(ui.w / 2 - 30, 130, 'Open Deck', { w: 60 })) { mgr.close('draft'); mgr.open('deck', { view: true }); }
      return;
    }
    if (!S.pick && S.key !== draft.id + ':' + draft.offers.join(',')) reveal(draft);
    const pending = cards.drafts?.length ?? 0;
    ui.label(8, 16, SOURCE_TEXT[draft.source] ?? 'Draft', { color: draft.minRarity ? RARITY[draft.minRarity].color : K.dim });
    ui.label(ui.w - 8, 16, pending > 1 ? `${pending} drafts waiting` : '1 draft waiting', { color: K.dim, align: 'right' });

    const n = draft.offers.length;
    const totalW = n * CW + (n - 1) * 8;
    const x0 = Math.round((ui.w - totalW) / 2), y0 = 32;
    const owned = cards.owned || {};
    for (let i = 0; i < n; i++) {
      const card = content.cards.byId[draft.offers[i]];
      if (!card) continue;
      let x = x0 + i * (CW + 8), y = y0;
      const start = S.revealAt + i * STAGGER_S;
      const k = Math.max(0, Math.min(1, (t - start) / FLIP_S));
      if (k >= 0.5 && !S.flipped.has(i)) {
        S.flipped.add(i);
        mgr.sound(card.rarity === 'mythic' ? 'card_mythic' : 'card_flip');
        if (RARITY_ORDER.indexOf(card.rarity) >= 2) S['flare' + i] = t;
      }
      const revealed = k >= 1;
      const hot = revealed && !S.pick && ui.hover(x, y, CW, CH);
      let lift = hot ? -4 : 0, alpha = 1, scale = 1;
      if (S.pick && S.pick.draft === draft) {
        const pk = Math.min(1, (t - S.pick.t0) / 0.45);
        if (i === S.pick.index) { lift = -4 - pk * 18; scale = 1 + pk * 0.08; } else { lift = pk * 20; alpha = 1 - pk; }
      }
      const sx = Math.abs(Math.cos(Math.PI * k)) * scale;
      const cx = ui.x + x + CW / 2, cy = ui.y + y + lift;
      ctx.save();
      ctx.globalAlpha = alpha;
      // rarity glow behind revealed rare+ cards; a flare when they flip
      const ri = RARITY_ORDER.indexOf(card.rarity);
      if (k >= 0.5 && ri >= 1) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 3 + i);
        glow(ctx, cx - (CW * sx) / 2, cy, CW * sx, CH * scale, RARITY[card.rarity].color, pulse * (0.4 + ri * 0.2), 4 + ri * 2);
      }
      const fl = S['flare' + i];
      if (fl && t - fl < 0.6) glow(ctx, cx - CW / 2, cy, CW, CH, RARITY[card.rarity].color, 1 - (t - fl) / 0.6, 18);
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.02, sx), scale);
      if (k < 0.5) drawCardBack(ctx, -CW / 2, 0, CW, CH, t);
      else {
        const sp = setProgress(owned, card.tag);
        const isNew = !(owned[card.id] > 0);
        drawCardFace(ctx, card, -CW / 2, 0, {
          rank: owned[card.id] || 0, hover: hot && !S.banishMode, banish: hot && S.banishMode,
          setCount: isNew && sp.next ? `${sp.n + 1}/${sp.next}` : sp.next ? `${sp.n}/${sp.next}` : `${sp.n}`,
          sprites: mgr.sprites, isNew,
        });
      }
      ctx.restore();
      if (hot) {
        const c2 = owned[card.id] ? `Rank ${owned[card.id]} -> ${owned[card.id] + 1} of ${card.max}` : `New card (max rank ${card.max})`;
        ui.tooltip(`${card.name} (${RARITY[card.rarity].name}, ${TAGS[card.tag].name})\n${card.text}\n${c2}${S.banishMode ? '\nClick to BANISH this card for good' : '\nClick or press ' + (i + 1) + ' to take it'}`);
      }
      if (hot && mgr.mouse.released && revealed) {
        mgr.consumeClick();
        if (S.banishMode) act(mgr, 'card.banish', { draft: draft.id, index: i }, () => { S.banishMode = false; });
        else { S.pick = { draft, index: i, t0: t }; mgr.sound('card_pick'); act(mgr, 'card.pick', { draft: draft.id, index: i }); }
      }
    }
    // number keys
    const allRevealed = t > S.revealAt + (n - 1) * STAGGER_S + FLIP_S;
    if (allRevealed && !S.pick && !S.banishMode) {
      for (let i = 0; i < n; i++) {
        if (mgr.input.pressedSet?.has('Digit' + (i + 1))) { S.pick = { draft, index: i, t0: t }; mgr.sound('card_pick'); act(mgr, 'card.pick', { draft: draft.id, index: i }); break; }
      }
    }
    if (S.pick) return;

    // controls
    const by = y0 + CH + 10;
    const tokens = cards.tokens ?? 0;
    const glint = store.world.glint ?? 0;
    const rerollLabel = tokens > 0 ? `Reroll (1 token, ${tokens} left)` : `Reroll (${fmtGlint(draft.rerollGlint)} G)`;
    const canReroll = tokens > 0 || glint >= draft.rerollGlint;
    let bx = 8;
    const bw1 = measure(rerollLabel) + 12;
    if (ui.button(bx, by, rerollLabel, { w: bw1, disabled: !canReroll || S.busy, tooltip: 'New offers for this draft. Tokens first, then Glint (price doubles each time).' })) act(mgr, 'card.reroll', { draft: draft.id });
    bx += bw1 + 6;
    const ban = cards.banishes ?? 0;
    const banLabel = S.banishMode ? 'Cancel banish' : `Banish (${ban})`;
    const bw2 = measure(banLabel) + 12;
    if (ui.button(bx, by, banLabel, { w: bw2, disabled: ban < 1 && !S.banishMode, tooltip: 'Remove one offered card from your pool for good (1 per 10 levels).' })) S.banishMode = !S.banishMode;
    bx += bw2 + 6;
    if (ui.button(bx, by, 'Skip (+1 token)', { w: 92, tooltip: 'Take a Tide Token instead of a card.' })) act(mgr, 'card.skip', { draft: draft.id });
    if (ui.button(ui.w - 58, by, 'Deck', { w: 50 })) { mgr.close('draft'); mgr.open('deck', { view: true }); }
    // footer
    const pityLeft = Math.max(0, 5 - (cards.pity ?? 0));
    const foot = `Pity: Rare+ guaranteed in ${pityLeft} draft${pityLeft === 1 ? '' : 's'}   Mythics ${cards.mythic?.owned ?? 0}/${cards.mythic?.limit ?? 0}`;
    ui.label(8, ui.h - 13, foot, { color: K.faint });
    if (S.banishMode) ui.label(ui.w / 2, by - 10 + 26, 'Choose a card to banish', { color: K.bad, align: 'center' });
    if (S.msg && t - S.msgAt < 2.5) ui.label(ui.w - 8, ui.h - 13, S.msg, { color: K.bad, align: 'right' });
  },
};
