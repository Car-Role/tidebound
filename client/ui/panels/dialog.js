// WP11: NPC dialogue (castaways). Opened by the server through self.ui = { panel:'dialog', npc, id, node }.
// Choices go to `npc.talk {id, choice}`; the reply's `d` is the next node. A node may ask to open another panel
// (`open: { panel:'market', npc }` for the shop, WP9) or to close (`close: true`).
// Keys 1-4 pick an option, Esc closes (handled by the panel manager).

import { UI_COLORS } from '../widgets.js';
import { measure } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';

const TYPE_CPS = 70;          // typewriter characters per second
const W = 330, H = 128;

// Greedy word wrap for the 5x7 pixel font. Exported for the other WP11/WP13 panels.
export function wrapText(text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (measure(next) <= maxW || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

const state = { node: null, shown: 0, busy: false, err: null, openedAt: 0, entity: null };

function choose(ui, id) {
  const p = ui.ui;
  if (!state.node || state.busy) return;
  if (id === 'bye') { p.close('dialog'); return; }
  state.busy = true;
  p.net.do('npc.talk', { id: state.node.id, choice: id }).then((res) => {
    state.busy = false;
    if (!res.ok) { state.err = res.err === 'range' ? 'You walked too far away.' : 'They did not understand.'; if (res.err === 'range') p.close('dialog'); return; }
    const n = res.d;
    if (n?.open?.panel) {
      if (p.get(n.open.panel)) p.open(n.open.panel, { npc: n.open.npc });
      p.close('dialog');
      return;
    }
    if (n?.close) { p.close('dialog'); return; }
    setNode(n);
    if (n?.node === 'thanks') p.sound('quest_done');
  });
}

function setNode(n) {
  state.node = n;
  state.shown = 0;
  state.err = null;
}

export default {
  id: 'dialog',
  key: null,
  modal: false,
  w: W, h: H, anchor: 'bottom',

  open(store, args) {
    const n = args?.node ?? store.self.ui?.node ?? null;
    setNode(n ? { ...n, id: n.id ?? args?.id } : null);
    state.openedAt = performance.now();
  },
  close() { state.node = null; },

  draw(ui, store) {
    const n = state.node;
    ui.frame('');
    if (!n) { ui.label(8, 8, '...', { color: UI_COLORS.dim }); return; }
    const t = (performance.now() - state.openedAt) / 1000;

    // portrait
    ui.rect(6, 6, 46, 52, UI_COLORS.borderDark);
    ui.rect(7, 7, 44, 50, PAL[RAMPS.sea[1]]);
    ui.rect(7, 40, 44, 17, PAL[RAMPS.sand[2]]);
    const bob = Math.round(Math.sin(t * 2.2) * 1);
    ui.ui.sprites?.draw(ui.ctx, 'npc.' + n.npc, ui.x + 29, ui.y + 52 + bob, { scaleX: 2, scaleY: 2 });
    ui.label(29, 60, n.name.split(' ')[0], { color: UI_COLORS.accent, align: 'center' });

    // name and role
    ui.label(58, 6, n.name, { color: UI_COLORS.accent });
    if (n.role) ui.label(58 + measure(n.name) + 6, 6, n.role, { color: UI_COLORS.dim });

    // text with typewriter reveal (click skips)
    state.shown = Math.min((n.text || '').length, state.shown + TYPE_CPS / 60);
    const full = n.text || '';
    const shown = full.slice(0, Math.floor(state.shown));
    const textW = n.quest ? 146 : W - 66;
    const lines = wrapText(shown, textW);
    lines.slice(0, 6).forEach((l, i) => ui.label(58, 17 + i * 9, l));
    if (state.shown < full.length && ui.ui.mouse.pressed && ui.hover(0, 0, W, H)) state.shown = full.length;

    // quest card
    if (n.quest) {
      const q = n.quest;
      const qx = 212, qy = 16, qw = 112;
      ui.rect(qx, qy, qw, 70, UI_COLORS.borderDark);
      ui.rect(qx + 1, qy + 1, qw - 2, 68, UI_COLORS.bgLight);
      ui.label(qx + 4, qy + 3, q.name, { color: UI_COLORS.accent });
      let y = qy + 13;
      for (const g of q.goals.slice(0, 2)) {
        const gl = wrapText(g.label + (g.n > 1 && q.active ? ` (${Math.min(g.have, g.n)}/${g.n})` : ''), qw - 8).slice(0, 2);
        gl.forEach((l, i) => ui.label(qx + 4, y + i * 9, l, { color: g.have >= g.n ? UI_COLORS.good : UI_COLORS.text }));
        y += gl.length * 9;
        if (q.active) { ui.bar(qx + 4, y, qw - 8, 3, g.have, g.n, g.have >= g.n ? UI_COLORS.good : UI_COLORS.accent); y += 5; }
        y += 1;
      }
      wrapText('Reward: ' + q.reward, qw - 8).slice(0, 2).forEach((l, i) => ui.label(qx + 4, qy + 50 + i * 9, l, { color: UI_COLORS.dim }));
    }

    // options
    const opts = n.options || [];
    let oy = H - 6 - opts.length * 12;
    oy = Math.max(oy, 72);
    opts.forEach((o, i) => {
      const label = `${i + 1}. ${o.label}`;
      const hot = ui.hover(56, oy, 200, 11);
      if (hot) ui.rect(56, oy, Math.min(200, measure(label) + 6), 11, UI_COLORS.slotHover);
      ui.label(59, oy + 2, label, { color: hot ? UI_COLORS.accent : o.id === 'turnin' ? UI_COLORS.good : UI_COLORS.text });
      if (hot && ui.ui.mouse.released) { ui.ui.consumeClick(); ui.ui.sound('ui_click'); choose(ui, o.id); }
      oy += 12;
    });
    const inp = ui.ui.input;
    for (let i = 0; i < Math.min(4, opts.length); i++) if (inp.pressed('hotbar' + (i + 1))) choose(ui, opts[i].id);
    if (state.err) ui.label(W - 8, H - 12, state.err, { color: UI_COLORS.bad, align: 'right' });
    if (state.busy) ui.label(W - 8, 6, '...', { color: UI_COLORS.dim, align: 'right' });

    // walk away -> close
    const me = store.me();
    const npcE = store.entities.get(n.id);
    if (me && npcE && Math.hypot(me.x - npcE.x, me.y - npcE.y) > 6) ui.ui.close('dialog');
  },
};
