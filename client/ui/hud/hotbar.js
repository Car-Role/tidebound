// WP4 hotbar (bottom-centre, 8 slots that reference inventory slots) and the client controller for WP4/WP9 panels:
// - 1-8 (or click) selects a slot: consumables are used, gear is equipped, seeds start planting, placeables start
//   placing, a rod is equipped (then aiming at water opens the cast overlay);
// - server `self.ui` { kind: craft | station | storage | market | close } opens and closes the matching panels;
// - finishes drags released over nothing (drop to the ground) and accepts drops onto hotbar slots.

import { content } from '../../../shared/data/index.js';
import { drawText } from '../../render/text.js';
import { C, itemDef, itemTooltip, finishDrags, quietOpen, quietClose, mouseWorld, myPos } from '../panels/inventory.js';

const N = 8, S = 20, GAP = 2;
const CAST_RANGE = 6;
const MY_KINDS = { craft: 'crafting', station: 'station', storage: 'storage', market: 'market' };

let bound = false;
let lastUiN = null;
let flash = new Array(N).fill(0);
let fishSuppress = false;
let lastT = 0;

function bind(mgr, store) {
  if (bound) return;
  bound = true;
  store.on('welcome', (m) => { lastUiN = m.self?.ui?.n ?? null; });
  store.on('change:self.ui', (u) => {
    if (!u || u.n === lastUiN) return;
    lastUiN = u.n;
    if (u.kind === 'close') {
      for (const id of ['station', 'storage', 'market', 'crafting']) {
        const p = mgr.panels.get(id);
        if (p?.open && p.args?.id === u.id) mgr.close(id);
      }
      return;
    }
    const panel = MY_KINDS[u.kind];
    if (!panel) return;
    if (panel === 'crafting' && mgr.isOpen('crafting')) mgr.close('crafting');
    mgr.open(panel, { ...u });
    if (panel === 'station' || panel === 'storage') mgr.open('inventory');
  });
}

function selectSlot(mgr, store, bar) {
  const inv = store.self.inv;
  const slot = inv?.hotbar?.[bar];
  const stack = slot != null ? inv.slots[slot] : null;
  store.hotSel = bar;
  flash[bar] = 0.25;
  if (!stack) return;
  const d = itemDef(stack[0]);
  if (!d) return;
  const aim = mouseWorld(mgr) || { x: 0, y: 0 };
  if (d.cat === 'seed' || d.use?.kind === 'plant_node') { mgr.open('build', { tool: 'plant', seed: d.id }); return; }
  if (d.places) { mgr.open('build', { tool: 'place', kind: d.places, item: d.id }); return; }
  if (d.gear) { mgr.net.do('gear.equip', { slot }).then((r) => { if (!r.ok) mgr.sound('deny'); }); return; }
  if (d.use) {
    mgr.net.do('item.use', { slot, ax: Math.round(aim.x * 32), ay: Math.round(aim.y * 32) }).then((r) => { if (!r.ok) mgr.sound('deny'); });
  }
}

// Rod equipped + aiming at water in range: open the fishing overlay so LMB casts instead of attacking.
function autoFishing(mgr, store) {
  const rod = store.self.gear?.rod;
  const fishing = store.self.fish && store.self.fish.st && !['idle', 'caught', 'lost', 'missed', 'snap', 'early'].includes(store.self.fish.st);
  const open = mgr.isOpen('fishing');
  let aimWater = false;
  if (rod && !mgr.anyModal()) {
    const a = mouseWorld(mgr), me = myPos(store);
    if (a && me) {
      const tx = Math.floor(a.x), ty = Math.floor(a.y);
      const g = store.groundAt(tx, ty);
      aimWater = (g === 0 || g === 1) && Math.hypot(tx + 0.5 - me.x, ty + 0.5 - me.y) <= CAST_RANGE + 0.5;
    }
  }
  const busyPanel = ['build', 'crafting', 'station', 'storage', 'market', 'inventory'].some((id) => mgr.isOpen(id));
  if (!aimWater) fishSuppress = false;
  if (fishWasOpen && !open && aimWater && !fishing) fishSuppress = true;   // closed with Esc while aiming: stay closed
  if (open) {
    const p = mgr.panels.get('fishing');
    if (p.args?.auto && !fishing && (!aimWater || busyPanel)) quietClose(mgr, 'fishing');
  } else if ((aimWater && !busyPanel && !fishSuppress) || (fishing && !fishSuppress)) {
    quietOpen(mgr, 'fishing', { auto: true });
  }
  fishWasOpen = mgr.isOpen('fishing');
}
let fishWasOpen = false;

export default {
  id: 'hotbar',
  anchor: 'bottom',
  order: 20,
  draw(ui, store) {
    const mgr = ui.ui;
    bind(mgr, store);
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, lastT ? now - lastT : 0);
    lastT = now;
    const inv = store.self.inv;
    const W = N * S + (N - 1) * GAP;
    const x0 = Math.round((ui.w - W) / 2), y0 = ui.h - 7 - S - 12;
    const hoverInvSlot = !!mgr._hoverSlot;          // last frame: a panel slot was hovered (digits assign there)
    mgr._overHud = ui.hover(x0 - 2, y0 - 2, W + 4, S + 4);
    finishDrags(mgr);

    // backing plate
    ui.rect(x0 - 3, y0 - 3, W + 6, S + 6, 'rgba(13,10,20,0.55)');
    for (let b = 0; b < N; b++) {
      const x = x0 + b * (S + GAP);
      const slot = inv?.hotbar?.[b];
      const stack = slot != null ? inv.slots[slot] : null;
      const sel = store.hotSel === b;
      const hot = ui.hover(x, y0, S, S);
      flash[b] = Math.max(0, flash[b] - dt);
      const lift = flash[b] > 0 ? -2 : 0;
      ui.rect(x, y0 + lift, S, S, sel ? C.accent : C.borderDark);
      ui.rect(x + 1, y0 + 1 + lift, S - 2, S - 2, hot ? C.slotHover : C.slot);
      if (stack) {
        mgr.sprites?.draw(ui.ctx, 'item.' + stack[0], ui.x + x + S / 2, ui.y + y0 + S / 2 + 8 + lift, {});
        if (stack[1] > 1) drawText(ui.ctx, String(stack[1]), ui.x + x + S - 1, ui.y + y0 + S - 8 + lift, { align: 'right' });
        if (hot && !mgr.drag) ui.tooltip(itemTooltip(store, stack[0], stack[1]));
      }
      drawText(ui.ctx, String(b + 1), ui.x + x + 2, ui.y + y0 + 1 + lift, { color: sel ? C.goldLight : C.dim, outline: true });
      // drop an inventory stack onto the hotbar
      if (hot && mgr.drag?.payload?.kind === 'item' && (mgr.input.mouseReleased(0) || mgr.input.mouseReleased(2))) {
        const pl = mgr.drag.payload;
        if (pl.src === 'self') { mgr.net.do('inv.hotbar', { slot: pl.from, bar: b }); mgr.sound('ui_click'); }
        mgr._pendingDrop = null;
        mgr.endDrag();
        mgr.consumeClick();
      } else if (hot && mgr.input.mouseReleased(0) && !mgr.drag) { selectSlot(mgr, store, b); mgr.consumeClick(); }
      else if (hot && mgr.input.mousePressed(2) && slot != null) { mgr.net.do('inv.hotbar', { slot: null, bar: b }); mgr.sound('ui_click'); }
    }
    // keys 1-8 (unless a panel slot is hovered: the inventory uses them to assign)
    if (!hoverInvSlot && !mgr.input.textCapture) {
      for (let b = 0; b < N; b++) if (mgr.input.pressed('hotbar' + (b + 1))) selectSlot(mgr, store, b);
    }
    autoFishing(mgr, store);
    // selected item label
    const sel = store.hotSel;
    const st = sel != null && inv?.hotbar?.[sel] != null ? inv.slots[inv.hotbar[sel]] : null;
    if (st) {
      const d = content.items.byId[st[0]];
      drawText(ui.ctx, d?.name ?? st[0], ui.x + ui.w / 2, ui.y + y0 - 10, { align: 'center', color: C.text });
    }
  },
};
