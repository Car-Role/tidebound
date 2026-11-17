// WP4 inventory panel (Tab) plus the client helpers shared by the WP4/WP9 panels and HUD widgets:
// item names and tooltips, an item slot with drag / split / quick-move / drop-to-world, world <-> UI mapping.
//
// Slot controls: LMB drag moves a stack; RMB drag takes half; Shift+click quick-moves to the open container
// (or back); dropping outside every panel drops the stack on the ground; hover a slot and press 1-8 to put it on the
// hotbar. Sort button merges and orders stacks.

import { content } from '../../../shared/data/index.js';
import { TILE } from '../../../shared/config.js';
import { UI_COLORS } from '../widgets.js';
import { drawText, measure } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';

// ------------------------------------------------------------------ shared helpers

export const C = Object.freeze({
  ...UI_COLORS,
  gold: PAL[RAMPS.gold[3]], goldLight: PAL[RAMPS.gold[4]], sea: PAL[RAMPS.sea[3]], seaLight: PAL[RAMPS.sea[4]],
  teal: PAL[RAMPS.teal[3]], grass: PAL[RAMPS.grass[3]], grassLight: PAL[RAMPS.grass[4]], ember: PAL[RAMPS.ember[3]],
  violet: PAL[RAMPS.violet[3]], stone: PAL[RAMPS.stone[2]], ink0: PAL[RAMPS.ink[0]], ink1: PAL[RAMPS.ink[1]], ink2: PAL[RAMPS.ink[2]],
  ink3: PAL[RAMPS.ink[3]], sand: PAL[RAMPS.sand[3]], brown: PAL[RAMPS.brown[2]], ice: PAL[RAMPS.ice[3]],
});
export const RARITY_COLOR = { common: '#ffffff', uncommon: C.grassLight, rare: C.seaLight, legendary: C.goldLight };

export const itemDef = (id) => content.items.byId[id] ?? null;
export const itemName = (id) => itemDef(id)?.name ?? String(id).replace(/_/g, ' ');
export const structName = (id) => content.structures.byId[id]?.name ?? String(id).replace(/_/g, ' ');
export const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));

const UNLOCK_TEXT = {
  level: (a) => `Reach level ${a}`, skill: (a) => `Learn skill ${a}`, beacon: (a) => `Light Beacon ${a}`,
  quest: (a) => `Quest: ${content.quests.byId?.[a]?.name ?? a}`, boss: (a) => `Defeat ${content.bosses.byId?.[a]?.name ?? a}`, vault: (a) => `Clear Vault ${a}`,
};
export const unlockText = (u) => { const [k, a] = String(u).split(':'); return UNLOCK_TEXT[k] ? UNLOCK_TEXT[k](a ?? '') : u; };

export function invCount(store, item) {
  let n = 0;
  for (const s of store.self.inv?.slots ?? []) if (s && s[0] === item) n += s[1];
  return n;
}

export function sellPrice(store, item) {
  const d = itemDef(item);
  if (!d?.value) return 0;
  const sat = store.world.market?.[item] ?? 1;
  const sm = Math.min(0.5, store.self.stats?.sellMult ?? 0);
  return d.value * (1 + sm) * sat;
}

const CAT_LABEL = { material: 'Material', component: 'Component', tool: 'Tool', weapon: 'Weapon', armor: 'Armor', trinket: 'Trinket',
  rod: 'Rod', pack: 'Pack', lantern: 'Lantern', food: 'Food', tonic: 'Tonic', seed: 'Seed', fish: 'Fish', placeable: 'Placeable',
  key: 'Key', trophy: 'Trophy', relic: 'Relic', misc: 'Item' };

export function itemTooltip(store, id, qty = 0) {
  const d = itemDef(id);
  if (!d) return String(id);
  const lines = [d.name + (qty > 1 ? `  x${qty}` : '')];
  lines.push(`${CAT_LABEL[d.cat] ?? d.cat}${d.tier ? '  T' + d.tier : ''}${d.rarity ? '  ' + d.rarity : ''}`);
  const g = d.gear;
  if (g?.slot === 'hook') lines.push(`Power ${g.power}  harvests T${g.maxNode >= 99 ? 'all' : '<=' + g.maxNode}`);
  if (g?.slot === 'weapon') lines.push(`${g.wtype} dmg ${g.dmg}  ${g.rate}/s`);
  if (g?.armor) lines.push(`Armor ${g.armor}  HP +${g.hp}`);
  if (g?.slot === 'rod') lines.push(`Catches fish up to T${g.maxFishTier}`);
  if (g?.slots) lines.push(`+${g.slots} inventory slots`);
  if (d.use?.heal) lines.push(`Heals ${d.use.heal}`);
  if (d.use?.buff?.dur) lines.push(`Buff ${Math.round(d.use.buff.dur / 60)} min`);
  if (d.fuel) lines.push(`Fuel ${d.fuel}`);
  if (d.cat === 'seed' && d.crop) { const c = content.crops.byId[d.crop]; if (c) lines.push(`Plant on soil: ${c.stages} stages x ${c.stageTime}s${c.nightOnly ? ' (night)' : ''}`); }
  if (d.places) lines.push(`Places: ${structName(d.places)}`);
  if (d.value > 0) lines.push(`Sells for ${Math.max(1, Math.round(sellPrice(store, id)))} G` + ((store.world.market?.[id] ?? 1) < 0.99 ? ` (${Math.round((store.world.market[id]) * 100)}% market)` : ''));
  else if (!g) lines.push('Cannot be sold');
  return lines.join('\n');
}

// World tile coordinates -> UI pixels (needs the camera from the debug handle; null before boot).
export function worldToUi(mgr, wx, wy, out = { x: 0, y: 0, s: 1 }) {
  const cam = globalThis.__tb?.camera;
  if (!cam) return null;
  const vx = Math.round(cam.x * TILE - cam.viewW / 2 + cam.shakeX), vy = Math.round(cam.y * TILE - cam.viewH / 2 + cam.shakeY);
  out.x = ((wx * TILE - vx) * cam.zoom) / mgr.scale;
  out.y = ((wy * TILE - vy) * cam.zoom) / mgr.scale;
  out.s = cam.zoom / mgr.scale;       // UI px per source px
  return out;
}
export function mouseWorld(mgr, out = { x: 0, y: 0 }) {
  const cam = globalThis.__tb?.camera;
  if (!cam) return null;
  return cam.screenToWorld(mgr.input.mouse.x, mgr.input.mouse.y, out);
}
export function myPos(store) {
  const me = store.me();
  if (!me) return null;
  return { x: me.rx ?? me.x, y: me.ry ?? me.y };
}

// Is the mouse over an open panel other than `id` (drawn above it)?
export function overOtherPanel(mgr, id) {
  const mx = mgr.mouse.x, my = mgr.mouse.y;
  for (const pid of mgr.order) {
    if (pid === id) continue;
    const p = mgr.panels.get(pid);
    if (p.mod.w < 2 || p.mod.h < 2) continue;
    const r = mgr.rectOf(p);
    if (mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h) return true;
  }
  return false;
}
export function overAnyPanel(mgr) {
  const mx = mgr.mouse.x, my = mgr.mouse.y;
  for (const pid of mgr.order) {
    const p = mgr.panels.get(pid);
    if (p.mod.fullscreen || p.mod.w < 2) continue;
    const r = mgr.rectOf(p);
    if (mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h) return true;
  }
  return false;
}

// Open/close without the open/close sounds (overlays that toggle on aim).
export function quietOpen(mgr, id, args) {
  const p = mgr.panels.get(id);
  if (!p || p.open) return;
  p.open = true; p.closing = false; p.t = 1; p.args = args;
  mgr.order.unshift(id);
  try { p.mod.open?.(mgr.store, args); } catch (err) { console.error('[tb:ui] open', id, err); }
}
export function quietClose(mgr, id) {
  const p = mgr.panels.get(id);
  if (!p || !p.open) return;
  p.open = false;
  mgr.order.splice(mgr.order.indexOf(id), 1);
  try { p.mod.close?.(); } catch (err) { console.error('[tb:ui] close', id, err); }
}

const shiftHeld = (mgr) => mgr.input.down.has('ShiftLeft') || mgr.input.down.has('ShiftRight');

// Where a quick move from `src` goes: the open container for 'self', 'self' for a container.
export function quickTarget(mgr, src) {
  if (src !== 'self') return 'self';
  for (const id of ['storage', 'station']) {
    const p = mgr.panels.get(id);
    if (p?.open && p.mod.containerId?.()) return p.mod.containerId();
  }
  return null;
}

/**
 * Item slot with full drag-and-drop. ref = { src: 'self' | containerId, idx }.
 * opts: { size, selected, accent, ghost (show dim stack), tooltip, locked (no interaction), onClick }
 */
export function itemSlot(ui, x, y, stack, ref, opts = {}) {
  const mgr = ui.ui, s = opts.size ?? 18;
  const hot = ui.hover(x, y, s, s) && !opts.locked;
  const dragging = mgr.drag?.payload?.kind === 'item';
  ui.rect(x, y, s, s, C.borderDark);
  let bg = opts.selected ? C.accent : hot ? C.slotHover : C.slot;
  if (dragging && hot) bg = C.border;
  ui.rect(x + 1, y + 1, s - 2, s - 2, bg);
  if (opts.accent) { ui.rect(x + 1, y + s - 2, s - 2, 1, opts.accent); }
  if (stack) {
    const beingDragged = dragging && mgr.drag.payload.src === ref.src && mgr.drag.payload.from === ref.idx;
    const left = beingDragged ? stack[1] - (mgr.drag.payload.qty ?? stack[1]) : stack[1];
    mgr.sprites?.draw(ui.ctx, 'item.' + stack[0], ui.x + x + s / 2, ui.y + y + s / 2 + 8, { alpha: beingDragged && left <= 0 ? 0.25 : opts.ghost ? 0.45 : 1 });
    if (left > 1 || (beingDragged && left > 0 && left !== stack[1])) drawText(ui.ctx, String(left), ui.x + x + s - 1, ui.y + y + s - 8, { align: 'right' });
  } else if (opts.placeholder) {
    mgr.sprites?.draw(ui.ctx, opts.placeholder, ui.x + x + s / 2, ui.y + y + s / 2 + 8, { alpha: 0.18 });
  }
  if (opts.locked) return;
  const inp = mgr.input;
  if (hot) {
    mgr._hoverSlot = { ref, stack };
    if (stack && !dragging && opts.tooltip !== false) ui.tooltip(opts.tooltip ?? itemTooltip(mgr.store, stack[0], stack[1]) + (ref.src === 'self' ? '\n1-8: put on hotbar' : ''));
    if (!dragging && stack && inp.mousePressed(0) && !shiftHeld(mgr)) mgr.beginDrag({ kind: 'item', src: ref.src, from: ref.idx }, stack);
    if (!dragging && stack && inp.mousePressed(2)) {
      const half = Math.ceil(stack[1] / 2);
      mgr.beginDrag({ kind: 'item', src: ref.src, from: ref.idx, qty: half, rmb: true }, [stack[0], half]);
    }
    const released = inp.mouseReleased(0) || inp.mouseReleased(2);
    if (released && dragging) {
      const pl = mgr.drag.payload;
      if (!(pl.src === ref.src && pl.from === ref.idx)) {
        if (opts.onDrop) opts.onDrop(pl);
        else mgr.net.do('inv.move', { src: pl.src, from: pl.from, dst: ref.src, to: ref.idx, ...(pl.qty ? { qty: pl.qty } : {}) }).then((r) => { if (!r.ok) mgr.sound('deny'); });
        mgr.sound('ui_click');
      }
      mgr._pendingDrop = null;
      mgr.endDrag();
      mgr.consumeClick();
    } else if (!dragging && inp.mouseReleased(0) && stack && shiftHeld(mgr)) {
      const dst = opts.quickDst !== undefined ? opts.quickDst : quickTarget(mgr, ref.src);
      if (dst != null) { mgr.net.do('inv.move', { src: ref.src, from: ref.idx, dst, to: -1 }); mgr.sound('ui_click'); }
      mgr.consumeClick();
    } else if (!dragging && inp.mouseReleased(0) && opts.onClick) { opts.onClick(); mgr.consumeClick(); }
  }
}

// Called once per frame from a HUD widget (drawn before panels): finishes drags that were released over no slot.
export function finishDrags(mgr) {
  const inp = mgr.input;
  const pend = mgr._pendingDrop;
  if (pend) {
    mgr._pendingDrop = null;
    if (pend.payload.src === 'self' && !pend.overPanel && !pend.overHud) {
      mgr.net.do('inv.drop', { slot: pend.payload.from, ...(pend.payload.qty ? { qty: pend.payload.qty } : {}) });
      mgr.sound('ui_click');
    }
    if (mgr.drag && mgr.drag.payload === pend.payload) mgr.endDrag();
  }
  if (mgr.drag?.payload?.kind === 'item' && (inp.mouseReleased(0) || inp.mouseReleased(2))) {
    mgr._pendingDrop = { payload: mgr.drag.payload, overPanel: overAnyPanel(mgr), overHud: !!mgr._overHud };
  }
  mgr._hoverSlot = null;
  mgr._overHud = false;
}

// ------------------------------------------------------------------ panel

const COLS = 8, CELL = 19, PAD = 8, TOP = 18;
let sortFlash = 0;

const panel = {
  id: 'inventory',
  key: 'panel.inventory',
  modal: false,
  w: COLS * CELL + PAD * 2 - 1, h: 140, anchor: 'center',
  open() {},
  close() {},
  draw(ui, store) {
    const mgr = ui.ui;
    // pair with an open container panel: inventory moves left
    // with the character sheet open on the left the inventory stays centred, otherwise it docks left
    panel.anchor = ['storage', 'station', 'market'].some((id) => mgr.isOpen(id)) && !mgr.isOpen('character') ? 'left' : 'center';
    const inv = store.self.inv || { slots: [], hotbar: [] };
    const n = inv.slots.length;
    const rows = Math.max(1, Math.ceil(n / COLS));
    panel.h = TOP + rows * CELL + 36;
    ui.frame('Inventory');
    const used = inv.slots.filter(Boolean).length;
    ui.label(ui.w - 8, 4, `${used}/${n}`, { color: used >= n ? C.bad : C.dim, align: 'right' });
    const hotbarOf = new Map();
    (inv.hotbar || []).forEach((slot, bar) => { if (slot != null) hotbarOf.set(slot, bar); });
    for (let i = 0; i < n; i++) {
      const x = PAD + (i % COLS) * CELL, y = TOP + Math.floor(i / COLS) * CELL;
      itemSlot(ui, x, y, inv.slots[i], { src: 'self', idx: i }, { accent: hotbarOf.has(i) ? C.gold : null });
      if (hotbarOf.has(i)) drawText(ui.ctx, String(hotbarOf.get(i) + 1), ui.x + x + 2, ui.y + y + 1, { color: C.gold });
      // hover + 1..8 assigns to the hotbar
      if (ui.hover(x, y, 18, 18)) {
        for (let b = 0; b < 8; b++) if (mgr.input.pressedSet.has('Digit' + (b + 1))) { mgr.net.do('inv.hotbar', { slot: i, bar: b }); mgr._hotbarAssigned = true; }
      }
    }
    const by = TOP + rows * CELL + 4;
    if (ui.button(PAD, by, 'Sort', { w: 34 })) { mgr.net.do('inv.sort', {}); sortFlash = 0.3; }
    const glint = store.world.glint ?? 0;
    ui.label(PAD + 40, by + 3, `${fmt(glint)} G`, { color: C.gold });
    drawText(ui.ctx, 'RMB half  Shift move', ui.x + PAD, ui.y + by + 17, { color: C.dim, outline: false });
    if (sortFlash > 0) { sortFlash -= 1 / 60; ui.rect(PAD, TOP - 1, COLS * CELL, 1, C.gold); }
  },
};

export default panel;
export { measure };
