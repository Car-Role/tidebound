// WP4 storage panel (Stockpile, Brinelocker). Shared container grid next to the inventory: drag stacks either way,
// Shift+click quick-moves, Take all, Deposit matching (stacks the container already holds), Sort, and the
// Brinelocker colour tag (every locker of one colour shares one inventory).

import { drawText } from '../../render/text.js';
import { C, structName, itemSlot } from './inventory.js';

const COLS = 10, CELL = 19, PAD = 8, TOP = 30;
export const LOCKER_COLOURS = ['#e8c170', '#d4553a', '#5aa45a', '#3c78c8', '#8d5ac8', '#e0e0e0', '#2fb3a6', '#e078b4'];
const COLOUR_NAMES = ['Gold', 'Red', 'Green', 'Blue', 'Violet', 'White', 'Teal', 'Pink'];

const S = { id: null };

const panel = {
  id: 'storage',
  key: null,
  modal: false,
  w: COLS * CELL + PAD * 2 - 1, h: 120, anchor: 'right',
  containerId: () => S.id,
  open(store, args) { S.id = args?.id ?? null; },
  close() {
    S.id = null;
    const mgr = globalThis.__tb?.ui;
    if (mgr && !mgr.isOpen('station') && !mgr.isOpen('market')) mgr.close('inventory');
  },
  draw(ui, store) {
    const mgr = ui.ui;
    const v = store.self.container;
    if (!v || v.id !== S.id) { ui.frame('Storage'); ui.label(10, 20, 'Loading...', { color: C.dim }); return; }
    const n = v.slots.length;
    const rows = Math.ceil(n / COLS);
    panel.h = TOP + rows * CELL + 8;
    ui.frame(structName(v.kind) + (v.kind === 'brine_locker' ? ` - ${COLOUR_NAMES[v.colour ?? 0]} network` : ''));
    const used = v.slots.filter(Boolean).length;
    ui.label(ui.w - 8, 4, `${used}/${n}`, { color: used >= n ? C.bad : C.dim, align: 'right' });
    // toolbar
    let bx = PAD;
    if (ui.button(bx, 15, 'Take all', { w: 52, disabled: used === 0 })) {
      v.slots.forEach((s, i) => { if (s) mgr.net.do('inv.move', { src: v.id, from: i, dst: 'self', to: -1 }); });
    }
    bx += 54;
    const have = new Set(v.slots.filter(Boolean).map((s) => s[0]));
    const matching = (store.self.inv?.slots ?? []).map((s, i) => [s, i]).filter(([s]) => s && have.has(s[0]));
    if (ui.button(bx, 15, 'Deposit', { w: 48, disabled: !matching.length, tooltip: 'Store every stack this container already holds' })) {
      for (const [, i] of matching) mgr.net.do('inv.move', { src: 'self', from: i, dst: v.id, to: -1 });
    }
    bx += 50;
    if (ui.button(bx, 15, 'Sort', { w: 30 })) mgr.net.do('inv.sort', { src: v.id });
    if (v.kind === 'brine_locker') {
      for (let c = 0; c < 8; c++) {
        const x = ui.w - PAD - (8 - c) * 10, y = 17;
        const hot = ui.hover(x - 1, y - 1, 10, 10);
        ui.rect(x - 1, y - 1, 10, 10, c === v.colour ? '#ffffff' : hot ? C.border : C.borderDark);
        ui.rect(x, y, 8, 8, LOCKER_COLOURS[c]);
        if (hot) {
          ui.tooltip(`Switch this locker to the ${COLOUR_NAMES[c]} network`);
          if (mgr.mouse.released && c !== v.colour) { mgr.net.do('inv.sort', { src: v.id, colour: c }); mgr.consumeClick(); mgr.sound('ui_click'); }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      itemSlot(ui, PAD + (i % COLS) * CELL, TOP + Math.floor(i / COLS) * CELL, v.slots[i], { src: v.id, idx: i });
    }
    if (used === 0) drawText(ui.ctx, 'Drag items here', ui.x + ui.w / 2, ui.y + TOP + 5, { align: 'center', color: C.dim, outline: false });
  },
};

export default panel;
