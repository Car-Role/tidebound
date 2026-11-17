// Room code for a browser-hosted world (GitHub Pages Host): a small box at the bottom right with the code and a
// Copy button; hover for how many friends are connected. Only the host sees it (store.room set by client/main.js).

import { UI_COLORS } from '../widgets.js';
import { copyText } from '../clipboard.js';

const st = { copiedAt: 0, failed: false };

export default {
  id: 'room',
  anchor: 'top-left',
  order: 12,
  draw(ui, store) {
    const room = store.room;
    if (!store.myId || room?.role !== 'host' || !room.code || ui.ui.isOpen('title')) return;
    const w = 112, h = 13, x = ui.w - w - 4, y = ui.h - 7 - 4 - h;      // bottom right, above the XP bar
    ui.rect(x, y, w, h, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, w - 2, h - 2, UI_COLORS.bg);
    ui.label(x + 4, y + 3, 'Room', { color: UI_COLORS.dim });
    ui.label(x + 34, y + 3, room.code, { color: UI_COLORS.accent });
    const recent = performance.now() - st.copiedAt < 1500;
    if (ui.button(x + w - 29, y + 1, recent ? (st.failed ? 'Fail' : 'Done') : 'Copy', { key: 'roomcopy', w: 27, h: 11, tooltip: 'Copy the room code' })) {
      copyText(room.code).then((ok) => { st.failed = !ok; st.copiedAt = performance.now(); });
    }
    if (ui.hover(x, y, w - 30, h)) {
      const n = window.__tb?.host?.peerCount?.() ?? 0;
      ui.tooltip(`Friends open this page, click Join and type ${room.code}.\n${n} friend${n === 1 ? '' : 's'} connected over WebRTC.\nThe world runs in this tab: keep it open.`);
    }
  },
};
