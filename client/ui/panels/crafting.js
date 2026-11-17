// WP4 crafting panel (C, or "use" a Workbench). Recipe list with have/need counts, lock reasons, clickable ingredients
// (jump to the recipe that makes them), craft x1 / x5 / max, pin, and the personal craft queue with live progress.
// Tabs: Craft (hand + bench recipes) and Stations (what every Kiln/Loom/Anvil/... makes, for reference).
// Keys: PgUp/PgDn select, [ ] switch tab, G craft 1 (Shift+G x5).

import { content } from '../../../shared/data/index.js';
import { drawText, measure } from '../../render/text.js';
import { C, itemName, structName, invCount, unlockText, itemTooltip, myPos } from './inventory.js';

const GROUPS = content.modules.recipes?.GROUPS ?? {};
const TIERS = content.modules.recipes?.STATION_TIERS ?? {};
const GROUP_LABEL = { wood: 'Any wood', any_wood: 'Any wood', fiber: 'Any fiber', mob_t12: 'Chitin/Fen Slime', fish_any: 'Any fish',
  fish_t2: 'Tier-2 fish', fish_t3: 'Tier-3 fish', fish_t6: 'Tier-6 fish', fish_legendary: 'Legendary fish' };
const groupLabel = (g) => GROUP_LABEL[g] ?? (g.startsWith('crop_t') ? `Tier-${g.slice(6)} crop` : g.replace(/_/g, ' '));

const isBench = (r) => r.station === 'hand' || !!content.structures.byId[r.station]?.station?.hand;
function chainFrom(station) {
  for (const chain of Object.values(TIERS)) { const i = chain.indexOf(station); if (i >= 0) return chain.slice(i); }
  return [station];
}
export function stationLabel(st) { return st === 'hand' ? 'By hand' : structName(st); }

// Client mirror of the server's group resolution: pick a member with enough (first), else the most plentiful.
function resolve(store, r, times = 1) {
  const take = [];
  let mult = 1, ok = true;
  for (const inp of r.in) {
    const need = inp.qty * times;
    if (inp.item) { const have = invCount(store, inp.item); take.push({ item: inp.item, label: itemName(inp.item), need, have }); if (have < need) ok = false; continue; }
    const g = GROUPS[inp.group] || {};
    const members = Object.keys(g);
    let pick = members.find((m) => invCount(store, m) >= need);
    if (!pick) pick = members.reduce((a, m) => (invCount(store, m) > invCount(store, a) ? m : a), members[0]);
    if (invCount(store, pick) < need) ok = false;
    mult = Math.max(mult, g[pick] || 1);
    take.push({ item: pick, label: groupLabel(inp.group), need, have: invCount(store, pick), group: inp.group });
  }
  return { ok, take, outQty: r.out.qty * mult };
}
export function craftableCount(store, r, cap = 999) {
  if (!resolve(store, r, 1).ok) return 0;
  let lo = 1, hi = cap;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (resolve(store, r, mid).ok) lo = mid; else hi = mid - 1; }
  return lo;
}

function benchNear(store, station) {
  if (station === 'hand') return true;
  const me = myPos(store);
  if (!me) return false;
  const kinds = new Set(chainFrom(station));
  for (const e of store.entities.values()) {
    if (e.ty !== 'structure' || !kinds.has(e.k)) continue;
    const d = content.structures.byId[e.k];
    const w = d?.w ?? 1, h = d?.h ?? 1;
    const dx = Math.max(Math.abs(e.x - me.x) - w / 2, 0), dy = Math.max(Math.abs(e.y - me.y) - h / 2, 0);
    if (Math.hypot(dx, dy) <= 4) return true;
  }
  return false;
}

const CAT_ORDER = ['material', 'component', 'tool', 'weapon', 'armor', 'rod', 'pack', 'lantern', 'food', 'tonic', 'misc', 'seed', 'key', 'placeable'];
function sortKey(r) {
  const d = content.items.byId[r.out.item];
  return [CAT_ORDER.indexOf(d?.cat), d?.tier ?? 0, d?.name ?? r.id];
}
const ALL = content.recipes.slice().sort((a, b) => {
  const ka = sortKey(a), kb = sortKey(b);
  return (ka[0] - kb[0]) || (ka[1] - kb[1]) || String(ka[2]).localeCompare(String(kb[2]));
});

const S = { tab: 0, sel: null, onlyCan: false, station: null, args: null, recvAt: 0, pinned: null };
try { S.pinned = localStorage.getItem('tb.pin.recipe'); } catch { /* ignore */ }

function listFor(store) {
  const known = new Set(store.self.recipes ?? []);
  const benchTab = S.tab === 0;
  return ALL.filter((r) => {
    if (benchTab !== isBench(r)) return false;
    if (S.station && benchTab && r.station !== 'hand' && !chainFrom(r.station).includes(S.station)) return false;
    if (S.onlyCan && (!known.has(r.id) || craftableCount(store, r, 1) < 1)) return false;
    return true;
  });
}

function jumpTo(item) {
  const r = ALL.find((x) => x.out.item === item);
  if (!r) return false;
  S.tab = isBench(r) ? 0 : 1;
  S.onlyCan = false;
  S.station = null;
  S.sel = r.id;
  S.scrollTo = r.id;
  return true;
}

const panel = {
  id: 'crafting',
  key: 'panel.crafting',
  modal: false,
  w: 318, h: 214, anchor: 'center',
  open(store, args) {
    S.args = args;
    S.station = args?.station ?? null;
    if (S.station) S.tab = 0;
    if (!S.bound) { S.bound = true; S.recvAt = performance.now(); store.on('change:self.craft', () => { S.recvAt = performance.now(); }); }
  },
  close() { S.station = null; },
  draw(ui, store) {
    const mgr = ui.ui, inp = mgr.input;
    ui.frame(S.station ? structName(S.station) : 'Crafting');
    const tab = ui.tabs(8, 15, ['Craft', 'Stations'], S.tab);
    if (tab !== S.tab) { S.tab = tab; S.sel = null; }
    if (inp.pressedSet.has('BracketLeft') || inp.pressedSet.has('BracketRight')) { S.tab = 1 - S.tab; S.sel = null; }
    // filter toggle
    const fx = 112;
    ui.rect(fx, 16, 9, 9, C.borderDark); ui.rect(fx + 1, 17, 7, 7, S.onlyCan ? C.good : C.slot);
    ui.label(fx + 12, 17, 'Can make', { color: C.dim });
    if (ui.hover(fx, 15, 60, 11) && mgr.mouse.released) { S.onlyCan = !S.onlyCan; mgr.consumeClick(); mgr.sound('ui_click'); }
    if (S.station && ui.button(ui.w - 58, 14, 'Show all', { w: 50, h: 11 })) S.station = null;

    const list = listFor(store);
    const known = new Set(store.self.recipes ?? []);
    if (!S.sel || !list.some((r) => r.id === S.sel)) S.sel = list[0]?.id ?? null;
    // keyboard selection
    const idx = list.findIndex((r) => r.id === S.sel);
    if (inp.pressedSet.has('PageDown') && idx < list.length - 1) { S.sel = list[idx + 1].id; S.scrollTo = S.sel; }
    if (inp.pressedSet.has('PageUp') && idx > 0) { S.sel = list[idx - 1].id; S.scrollTo = S.sel; }
    const LX = 8, LY = 29, LW = 132, LH = 150, RH = 12;
    if (S.scrollTo) {
      const i = list.findIndex((r) => r.id === S.scrollTo);
      const sk = ui.id + ':recipes';
      const cur = mgr.scroll.get(sk) ?? 0;
      if (i >= 0 && (i * RH < cur || i * RH > cur + LH - RH)) mgr.scroll.set(sk, Math.max(0, i * RH - LH / 2));
      S.scrollTo = null;
    }
    ui.rect(LX - 1, LY - 1, LW + 2, LH + 2, C.borderDark);
    ui.list(LX, LY, LW, LH, list, RH, (r, ry, hov) => {
      const sel = r.id === S.sel;
      const locked = !known.has(r.id);
      const can = locked ? 0 : craftableCount(store, r, 99);
      if (sel) ui.rect(LX, ry, LW, RH, C.border); else if (hov) ui.rect(LX, ry, LW, RH, C.bgLight);
      mgr.sprites?.draw(ui.ctx, 'item.' + r.out.item, ui.x + LX + 6, ui.y + ry + 11, { scaleX: 0.6, scaleY: 0.6, alpha: locked ? 0.4 : 1 });
      let name = itemName(r.out.item);
      while (measure(name) > LW - 30 && name.length > 4) name = name.slice(0, -2);
      drawText(ui.ctx, name, ui.x + LX + 13, ui.y + ry + 2, { color: locked ? C.dim : can > 0 ? C.text : C.stone, outline: false });
      if (!locked && can > 0) drawText(ui.ctx, String(can), ui.x + LX + LW - 4, ui.y + ry + 2, { color: C.good, outline: false, align: 'right' });
      if (locked) drawText(ui.ctx, 'x', ui.x + LX + LW - 4, ui.y + ry + 2, { color: C.bad, outline: false, align: 'right' });
      if (S.pinned === r.id) ui.rect(LX, ry + 1, 2, RH - 2, C.gold);
      if (hov && mgr.mouse.released) { S.sel = r.id; mgr.consumeClick(); mgr.sound('ui_click'); }
    }, 'recipes');
    if (!list.length) ui.label(LX + 4, LY + 6, S.onlyCan ? 'Nothing you can make' : 'No recipes', { color: C.dim });

    // ---- detail
    const r = content.recipes.byId[S.sel];
    const DX = 148;
    if (r) {
      const out = content.items.byId[r.out.item];
      const res = resolve(store, r, 1);
      ui.rect(DX, LY - 1, 22, 22, C.borderDark); ui.rect(DX + 1, LY, 20, 20, C.slot);
      mgr.sprites?.draw(ui.ctx, 'item.' + r.out.item, ui.x + DX + 11, ui.y + LY + 18, {});
      if (ui.hover(DX, LY - 1, 22, 22)) ui.tooltip(itemTooltip(store, r.out.item));
      ui.label(DX + 26, LY, `${out?.name ?? r.out.item}${res.outQty > 1 ? ' x' + res.outQty : ''}`, { color: C.accent });
      const near = isBench(r) ? benchNear(store, r.station) : false;
      const stTxt = stationLabel(r.station) + (r.station !== 'hand' && isBench(r) ? (near ? '  (near)' : '  (go to it)') : '');
      ui.label(DX + 26, LY + 10, stTxt, { color: isBench(r) && !near ? C.bad : C.dim });
      let cy = LY + 26;
      ui.label(DX, cy, `Needs  (${r.time}s${r.fuel ? ', fuel ' + r.fuel : ''})`, { color: C.dim }); cy += 11;
      for (const t of res.take) {
        const hov = ui.hover(DX, cy - 1, 160, 11);
        if (hov) ui.rect(DX, cy - 1, 160, 11, C.bgLight);
        mgr.sprites?.draw(ui.ctx, 'item.' + t.item, ui.x + DX + 5, ui.y + cy + 9, { scaleX: 0.6, scaleY: 0.6 });
        drawText(ui.ctx, `${t.label}`, ui.x + DX + 12, ui.y + cy, { color: C.text, outline: false });
        drawText(ui.ctx, `${t.have}/${t.need}`, ui.x + DX + 158, ui.y + cy, { color: t.have >= t.need ? C.good : C.bad, outline: false, align: 'right' });
        if (hov) {
          ui.tooltip(itemTooltip(store, t.item) + (ALL.some((x) => x.out.item === t.item) ? '\nClick: show its recipe' : ''));
          if (mgr.mouse.released && jumpTo(t.item)) { mgr.consumeClick(); mgr.sound('ui_click'); }
        }
        cy += 11;
      }
      const missing = r.unlock ?? [];
      const by = LY + 118;
      if (!known.has(r.id)) {
        ui.label(DX, by - 12, 'Locked: ' + (missing.length ? missing.map(unlockText).join(', ') : 'not yet'), { color: C.bad });
      } else if (isBench(r)) {
        const can = craftableCount(store, r, 999);
        const disabled = can < 1 || !near;
        if (ui.button(DX, by, 'Craft', { w: 40, disabled }) || (!disabled && inp.pressedSet.has('KeyG') && !inp.textCapture)) {
          const five = inp.down.has('ShiftLeft') || inp.down.has('ShiftRight');
          mgr.net.do('craft.make', { recipe: r.id, qty: five ? 5 : 1 }).then((x) => { if (!x.ok) mgr.sound('deny'); });
        }
        if (ui.button(DX + 44, by, 'x5', { w: 24, disabled: can < 2 || !near })) mgr.net.do('craft.make', { recipe: r.id, qty: 5 });
        if (ui.button(DX + 72, by, `Max ${can > 0 ? can : ''}`, { w: 46, disabled })) mgr.net.do('craft.make', { recipe: r.id, qty: 'max' });
      } else {
        ui.label(DX, by + 3, `Made at the ${stationLabel(r.station)}`, { color: C.dim });
      }
      if (ui.button(DX + 122, by, S.pinned === r.id ? 'Unpin' : 'Pin', { w: 36 })) {
        S.pinned = S.pinned === r.id ? null : r.id;
        try { if (S.pinned) localStorage.setItem('tb.pin.recipe', S.pinned); else localStorage.removeItem('tb.pin.recipe'); } catch { /* ignore */ }
        store.pinnedRecipe = S.pinned;
        store.emit('pin:recipe', S.pinned);
      }
    }

    // ---- queue
    const q = store.self.craft?.q ?? [];
    const qy = LY + LH + 6;
    ui.label(LX, qy + 3, q.length ? 'Queue' : 'G craft  Shift+G x5  [ ] tabs  PgUp/PgDn', { color: C.dim });
    const since = (performance.now() - S.recvAt) / 1000;
    q.slice(0, 6).forEach((c, i) => {
      const x = LX + 36 + i * 46;
      ui.rect(x, qy, 44, 16, C.borderDark); ui.rect(x + 1, qy + 1, 42, 14, i === 0 ? C.bgLight : C.slot);
      mgr.sprites?.draw(ui.ctx, 'item.' + (content.recipes.byId[c.r]?.out.item ?? ''), ui.x + x + 8, ui.y + qy + 14, { scaleX: 0.7, scaleY: 0.7 });
      drawText(ui.ctx, 'x' + c.left, ui.x + x + 16, ui.y + qy + 2, { color: C.text, outline: false });
      if (i === 0 && c.active) {
        const p = Math.min(1, (c.t + (c.paused ? 0 : since)) / Math.max(0.01, c.dur));
        ui.rect(x + 1, qy + 13, Math.round(42 * p), 2, c.paused ? C.bad : C.gold);
      }
      if (c.paused && i === 0) drawText(ui.ctx, '!', ui.x + x + 38, ui.y + qy + 2, { color: C.bad, outline: false });
      if (ui.hover(x, qy, 44, 16)) {
        ui.tooltip(`${itemName(content.recipes.byId[c.r]?.out.item)} x${c.left}${c.paused ? '\nPaused: go back to the bench' : ''}\nClick to cancel`);
        if (mgr.mouse.released) { mgr.net.do('craft.make', { cancel: i }); mgr.consumeClick(); mgr.sound('ui_click'); }
      }
    });
  },
};

export default panel;
