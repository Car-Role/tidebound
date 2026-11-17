// WP4 pickup feed (bottom-left): merged "+12 Driftwood" lines for 3 s that slide in, bump when they merge and fade
// (DESIGN 19, 21), driven by self.gain. Also the gather overlay: HP bars over recently hit nodes (pip bar for
// fixed-hit plants), drawn in world space through the camera.

import { content } from '../../../shared/data/index.js';
import { drawText, measure } from '../../render/text.js';
import { C, itemName, worldToUi } from '../panels/inventory.js';

const LIFE = 3.0, MAX_LINES = 6, LINE_H = 12;
const lines = [];           // { item, qty, t, bump }
const hits = new Map();     // node id -> { t }
let bound = false, lastK = null, lastT = 0;
const tmp = { x: 0, y: 0, s: 1 };

function bind(store) {
  if (bound) return;
  bound = true;
  store.on('welcome', (m) => { lastK = m.self?.gain?.k ?? null; });
  store.on('change:self.gain', (g) => {
    if (!g || g.k === lastK) return;
    lastK = g.k;
    for (const [item, qty] of g.l ?? []) {
      const ex = lines.find((l) => l.item === item && l.t < LIFE - 0.4);
      if (ex) { ex.qty += qty; ex.t = 0; ex.bump = 0.18; }
      else { lines.unshift({ item, qty, t: 0, bump: 0.18, slide: 1 }); }
    }
    while (lines.length > MAX_LINES) lines.pop();
  });
  store.on('entity:hurt', ({ e }) => { if (e.ty === 'node') hits.set(e.i, { t: 0 }); });
  store.on('entity:rem', (e) => hits.delete(e.i));
}

function drawNodeBars(ui, store, dt) {
  const mgr = ui.ui;
  for (const [id, h] of hits) {
    h.t += dt;
    const e = store.entities.get(id);
    if (!e || h.t > 2.5) { hits.delete(id); continue; }
    if (!worldToUi(mgr, e.rx ?? e.x, (e.ry ?? e.y) - (e.big ? 1.6 : 1.15), tmp)) return;
    const def = content.nodes.byId[e.k];
    const alpha = h.t > 2 ? (2.5 - h.t) / 0.5 : 1;
    const ctx = ui.ctx;
    ctx.globalAlpha = alpha;
    const max = e.mh || def?.hp || 3;
    const frac = Math.max(0, Math.min(1, e.hp / max));
    if (def?.hits && def.hits > 1) {
      const n = def.hits, left = Math.ceil(frac * n - 1e-6);
      const w = n * 4 + 1;
      const x = Math.round(tmp.x - w / 2), y = Math.round(tmp.y);
      ctx.fillStyle = C.ink0; ctx.fillRect(x, y, w, 4);
      for (let i = 0; i < n; i++) { ctx.fillStyle = i < left ? C.grassLight : C.ink2; ctx.fillRect(x + 1 + i * 4, y + 1, 3, 2); }
    } else {
      const w = 18;
      const x = Math.round(tmp.x - w / 2), y = Math.round(tmp.y);
      ctx.fillStyle = C.ink0; ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = C.ink2; ctx.fillRect(x + 1, y + 1, w - 2, 2);
      ctx.fillStyle = frac > 0.5 ? C.grassLight : frac > 0.25 ? C.goldLight : C.ember;
      ctx.fillRect(x + 1, y + 1, Math.max(1, Math.round((w - 2) * frac)), 2);
    }
    ctx.globalAlpha = 1;
  }
}

export default {
  id: 'pickups',
  anchor: 'bottom-left',
  order: 30,
  draw(ui, store) {
    bind(store);
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, lastT ? now - lastT : 0);
    lastT = now;
    drawNodeBars(ui, store, dt);
    const ctx = ui.ctx;
    const baseY = ui.h - 46;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      l.t += dt; l.bump = Math.max(0, l.bump - dt); l.slide = Math.max(0, l.slide - dt * 6);
      if (l.t > LIFE) { lines.splice(i, 1); continue; }
    }
    lines.forEach((l, i) => {
      const a = l.t > LIFE - 0.5 ? (LIFE - l.t) / 0.5 : 1;
      const y = baseY - i * LINE_H;
      const x = 6 - Math.round(l.slide * 20);
      ctx.globalAlpha = Math.max(0, a);
      const text = `+${l.qty} ${itemName(l.item)}`;
      const w = measure(text) + 18;
      ctx.fillStyle = 'rgba(13,10,20,0.6)';
      ctx.fillRect(x - 2, y - 2, w + 4, LINE_H - 1);
      const sc = 1 + l.bump * 1.5;
      ui.ui.sprites?.draw(ctx, 'item.' + l.item, x + 6, y + 9, { scaleX: 0.6 * sc, scaleY: 0.6 * sc });
      drawText(ctx, text, x + 14, y, { color: l.bump > 0 ? C.goldLight : C.text });
      ctx.globalAlpha = 1;
    });
  },
};
