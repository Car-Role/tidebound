// Flux (WP8, DESIGN 8.3/21): supply / demand under the clock once the first generator exists; red when demand
// exceeds supply (every consumer then runs at supply/demand). Also opens the machine panel when the server sends
// self.machine with open: true (using a machine).

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { HUD_RIGHT, HUD_W } from './treasury.js';

const C = (ramp, i) => PAL[RAMPS[ramp][i]];
let subscribed = false;
let lastSeq = 0;

function subscribe(ui, store) {
  if (subscribed) return;
  subscribed = true;
  const mgr = ui.ui;
  store.on('change:self.machine', (d) => {
    if (!d || d.n <= lastSeq) return;
    lastSeq = d.n;
    if (d.open) mgr.open('machine', { id: d.id });
  });
}

export default {
  id: 'flux',
  anchor: 'top-right',
  order: 52,
  draw(ui, store) {
    if (!store.myId || ui.ui.isOpen('title')) return;
    subscribe(ui, store);
    const f = store.world.flux;
    if (!f || !(f.gens > 0)) return;
    const x0 = ui.w - HUD_RIGHT - HUD_W, y0 = 50, w = HUD_W, h = 12;
    const short = f.demand > f.supply + 1e-6;
    const now = performance.now();
    ui.rect(x0, y0, w, h, UI_COLORS.borderDark);
    ui.rect(x0 + 1, y0 + 1, w - 2, h - 2, UI_COLORS.bg);
    if (ui.ui.sprites?.has('icon.ui.flux')) ui.ui.sprites.draw(ui.ctx, 'icon.ui.flux', ui.x + x0 + 1, ui.y + y0 - 2, { scaleX: 0.75, scaleY: 0.75 });
    const bx = x0 + 14, bw = w - 17;
    const used = f.supply > 0 ? Math.min(1, f.demand / f.supply) : f.demand > 0 ? 1 : 0;
    ui.bar(bx, y0 + 2, bw, 4, used, 1, short ? (Math.floor(now / 250) % 2 ? UI_COLORS.bad : C('ember', 2)) : C('ice', 3));
    ui.label(bx + bw, y0 + 5, `${Math.round(f.demand)}/${Math.round(f.supply)}`, { color: short ? UI_COLORS.bad : UI_COLORS.dim, align: 'right', scale: 1 });
    if (ui.hover(x0, y0, w, h)) {
      ui.tooltip(`Flux: demand ${f.demand} / supply ${f.supply}` + (short ? `\nShort! Machines run at ${Math.round((f.ratio ?? 0) * 100)}%` : '\nAll machines fully powered') + `\nGenerators: ${f.gens}`);
    }
  },
};
