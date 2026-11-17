// WP4 station panel (opened by using a Kiln, Loom, Anvil, Cookpot, Still or Campfire). Input slots, fuel slot with
// its meter, live progress arrow, output slots, the station's recipe list with have/need and queue buttons
// (+1 / +5 / max: loads the ingredients and fuel from your pack), the queue with cancel, Take all, Add fuel.
// Drag stacks between this panel and the inventory (Shift+click quick-moves).

import { content } from '../../../shared/data/index.js';
import { drawText, measure } from '../../render/text.js';
import { C, itemName, structName, invCount, itemSlot, itemTooltip, unlockText } from './inventory.js';
import { craftableCount } from './crafting.js';

const TIERS = content.modules.recipes?.STATION_TIERS ?? {};
function chainFrom(station) {
  for (const chain of Object.values(TIERS)) { const i = chain.indexOf(station); if (i >= 0) return chain.slice(i); }
  return [station];
}
const recipeCache = new Map();
function recipesFor(kind) {
  if (!recipeCache.has(kind)) recipeCache.set(kind, content.recipes.filter((r) => r.station !== 'hand' && chainFrom(r.station).includes(kind)));
  return recipeCache.get(kind);
}
const STATUS = {
  idle: ['Idle', 'dim'], work: ['Working', 'good'], nofuel: ['Needs fuel', 'bad'],
  full: ['Output full - take it out', 'bad'], need: ['Waiting for ingredients', 'bad'], disabled: ['Disabled', 'bad'],
};
const isFuel = (id) => (content.items.byId[id]?.fuel ?? 0) > 0;

const S = { id: null, recvAt: 0, bound: false, sel: null };

const panel = {
  id: 'station',
  key: null,
  modal: false,
  w: 226, h: 214, anchor: 'right',
  containerId: () => S.id,
  open(store, args) {
    S.id = args?.id ?? null;
    if (!S.bound) { S.bound = true; store.on('change:self.station', () => { S.recvAt = performance.now(); }); }
    S.recvAt = performance.now();
  },
  close() {
    S.id = null;
    const mgr = globalThis.__tb?.ui;
    if (mgr && !mgr.isOpen('storage') && !mgr.isOpen('market')) mgr.close('inventory');
  },
  draw(ui, store) {
    const mgr = ui.ui;
    const v = store.self.station;
    if (!v || v.id !== S.id) { ui.frame('Station'); ui.label(10, 20, 'Loading...', { color: C.dim }); return; }
    const def = content.structures.byId[v.kind];
    ui.frame(structName(v.kind) + (def?.station?.speed > 1 ? `  x${def.station.speed}` : ''));
    const [stText, stCol] = STATUS[v.status] ?? STATUS.idle;
    ui.label(ui.w - 8, 4, stText, { color: C[stCol] ?? C.dim, align: 'right' });

    // ---- slots row
    const y = 20;
    let x = 8;
    for (let i = 0; i < v.nIn; i++) {
      itemSlot(ui, x, y, v.slots[i], { src: v.id, idx: i });
      x += 19;
    }
    if (v.fuelIdx >= 0) {
      x += 4;
      itemSlot(ui, x, y, v.slots[v.fuelIdx], { src: v.id, idx: v.fuelIdx }, { placeholder: 'item.peat', accent: C.ember });
      // fuel meter: units stored + units in the slot
      const slotUnits = v.slots[v.fuelIdx] ? v.slots[v.fuelIdx][1] * (content.items.byId[v.slots[v.fuelIdx][0]]?.fuel ?? 0) : 0;
      const total = v.meter + slotUnits;
      ui.bar(x, y + 20, 18, 4, Math.min(1, v.meter / 4), 1, C.ember);
      if (ui.hover(x, y, 18, 24)) ui.tooltip(`Fuel ${v.meter} in the burner, ${total} total\nPeat 1, Charcoal 2, Brimstone 4, Magma Core 40`);
      x += 19;
    }
    // progress arrow
    const since = (performance.now() - S.recvAt) / 1000;
    const p = v.cur ? Math.min(1, (v.cur.t + since) / Math.max(0.05, v.cur.dur)) : 0;
    const outX0 = ui.w - 8 - 19 * (v.slots.length - v.outIdx) + 1;
    const ax = x + 4, aw = Math.max(16, outX0 - 10 - ax);
    ui.rect(ax, y + 7, aw, 5, C.borderDark);
    ui.rect(ax + 1, y + 8, Math.round((aw - 2) * p), 3, C.gold);
    ui.rect(ax + aw, y + 5, 2, 9, C.borderDark); ui.rect(ax + aw + 2, y + 7, 2, 5, C.borderDark);
    if (v.cur) {
      mgr.sprites?.draw(ui.ctx, 'item.' + v.cur.out, ui.x + ax + aw / 2, ui.y + y + 4, { scaleX: 0.6, scaleY: 0.6, alpha: 0.8 });
      drawText(ui.ctx, `${Math.max(0, v.cur.dur - v.cur.t - since).toFixed(1)}s`, ui.x + ax + aw / 2, ui.y + y + 14, { align: 'center', color: C.dim, outline: false });
    }
    let ox = outX0;
    for (let i = v.outIdx; i < v.slots.length; i++) {
      itemSlot(ui, ox, y, v.slots[i], { src: v.id, idx: i }, { accent: C.gold });
      ox += 19;
    }
    // buttons
    const by = y + 28;
    if (ui.button(8, by, 'Take all', { w: 50, disabled: !v.slots.slice(v.outIdx).some(Boolean) })) mgr.net.do('station.take', { id: v.id });
    if (v.fuelIdx >= 0) {
      const hasFuel = (store.self.inv?.slots ?? []).some((s) => s && isFuel(s[0]));
      if (ui.button(62, by, 'Add fuel', { w: 50, disabled: !hasFuel, tooltip: 'Loads your cheapest fuel' })) mgr.net.do('station.fuel', { id: v.id });
    }
    // ---- queue
    const qx = 118;
    ui.label(qx, by + 3, 'Queue', { color: C.dim });
    const queued = v.queue.reduce((a, q) => a + q.left, 0);
    ui.label(ui.w - 8, by + 3, `${queued}/${v.maxQueue}`, { color: C.dim, align: 'right' });
    v.queue.slice(0, 3).forEach((q, i) => {
      const x2 = qx + 32 + i * 26;
      ui.rect(x2, by, 24, 13, C.borderDark); ui.rect(x2 + 1, by + 1, 22, 11, i === 0 ? C.bgLight : C.slot);
      const r = content.recipes.byId[q.r];
      mgr.sprites?.draw(ui.ctx, 'item.' + r?.out.item, ui.x + x2 + 6, ui.y + by + 11, { scaleX: 0.55, scaleY: 0.55 });
      drawText(ui.ctx, String(q.left), ui.x + x2 + 22, ui.y + by + 3, { align: 'right', color: C.text, outline: false });
      if (ui.hover(x2, by, 24, 13)) {
        ui.tooltip(`${itemName(r?.out.item)} x${q.left}\nClick to cancel (ingredients stay in the slots)`);
        if (mgr.mouse.released) { mgr.net.do('station.queue', { id: v.id, cancel: i }); mgr.consumeClick(); mgr.sound('ui_click'); }
      }
    });

    // ---- recipes
    const known = new Set(store.self.recipes ?? []);
    const list = recipesFor(v.kind);
    const LY = by + 18, LH = ui.h - LY - 8;
    ui.rect(7, LY - 1, ui.w - 14, LH + 2, C.borderDark);
    const slotHave = (it) => v.slots.slice(0, v.nIn).reduce((a, s) => a + (s && s[0] === it ? s[1] : 0), 0);
    const storeLike = { self: { inv: { slots: [...(store.self.inv?.slots ?? []), ...v.slots.slice(0, v.nIn)] } } };
    ui.list(8, LY, ui.w - 16, LH, list, 14, (r, ry, hov) => {
      const locked = !known.has(r.id);
      const can = locked ? 0 : craftableCount(storeLike, r, 99);
      if (hov) ui.rect(8, ry, ui.w - 16, 14, C.bgLight);
      mgr.sprites?.draw(ui.ctx, 'item.' + r.out.item, ui.x + 15, ui.y + ry + 13, { scaleX: 0.65, scaleY: 0.65, alpha: locked ? 0.4 : 1 });
      let name = itemName(r.out.item) + (r.out.qty > 1 ? ' x' + r.out.qty : '');
      while (measure(name) > 92 && name.length > 4) name = name.slice(0, -2);
      drawText(ui.ctx, name, ui.x + 24, ui.y + ry + 3, { color: locked ? C.dim : can ? C.text : C.stone, outline: false });
      // ingredient mini icons
      let ix = 120;
      for (const inp of r.in.slice(0, 4)) {
        const it = inp.item ?? Object.keys(content.modules.recipes?.GROUPS?.[inp.group] ?? {})[0];
        const have = inp.item ? invCount(store, it) + slotHave(it) : 0;
        mgr.sprites?.draw(ui.ctx, 'item.' + it, ui.x + ix + 3, ui.y + ry + 12, { scaleX: 0.5, scaleY: 0.5 });
        drawText(ui.ctx, String(inp.qty), ui.x + ix + 8, ui.y + ry + 4, { color: !inp.item || have >= inp.qty ? C.dim : C.bad, outline: false });
        ix += 16;
      }
      if (r.fuel) drawText(ui.ctx, 'f' + r.fuel, ui.x + ix + 2, ui.y + ry + 4, { color: C.ember, outline: false });
      if (locked) {
        if (hov) ui.tooltip('Locked: ' + (r.unlock ?? []).map(unlockText).join(', '));
        return;
      }
      if (hov) ui.tooltip(itemTooltip(store, r.out.item) + `\n${r.time}s base${r.fuel ? ', fuel ' + r.fuel : ''}\nClick +1, Shift +5, Ctrl max`);
      const bx = ui.w - 30;
      const okBtn = can > 0;
      ui.rect(bx, ry + 1, 20, 12, okBtn ? (hov ? C.good : C.border) : C.bg);
      drawText(ui.ctx, okBtn ? '+' + Math.min(can, 99) : '-', ui.x + bx + 10, ui.y + ry + 3, { align: 'center', color: okBtn ? C.text : C.dim, outline: false });
      if (hov && mgr.mouse.released && !okBtn) { mgr.consumeClick(); mgr.sound('deny'); }
      // only queue what the pack can actually load (P2-17: the counter rose on clicks that loaded nothing)
      if (hov && mgr.mouse.released && okBtn) {
        const sh = mgr.input.down.has('ShiftLeft') || mgr.input.down.has('ShiftRight');
        const ct = mgr.input.down.has('ControlLeft') || mgr.input.down.has('ControlRight');
        mgr.net.do('station.queue', { id: v.id, recipe: r.id, qty: ct ? 'max' : sh ? 5 : 1 }).then((x) => { if (!x.ok) mgr.sound('deny'); });
        mgr.consumeClick(); mgr.sound('ui_click');
      }
    }, 'st:' + v.kind);
  },
};

export default panel;
