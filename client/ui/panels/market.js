// WP9 market panel: Market Stall (use the stall) and castaway shops (opened by the NPC dialog with { npc }).
// Sell: every sellable stack you carry, the live unit price (value x sell bonus x market saturation), the saturation
// bar and the exact payout of selling 1 / 10 / all (saturation drops x0.99 per unit and recovers over time).
// Buy: today's stock with prices and units left (shops restock each in-game day).

import { content } from '../../../shared/data/index.js';
import { drawText, measure } from '../../render/text.js';
import { C, itemName, itemTooltip, fmt, itemDef } from './inventory.js';

const S = { tab: 0, args: null, stock: [], src: 'stall', loading: false, msg: null, fetchedAt: 0, bound: false };

function payout(store, item, qty) {
  const d = itemDef(item);
  if (!d?.value) return 0;
  const sm = Math.min(0.5, store.self.stats?.sellMult ?? 0);
  let sat = store.world.market?.[item] ?? 1, g = 0;
  for (let i = 0; i < qty; i++) { g += d.value * (1 + sm) * sat; sat = Math.max(0.05, sat * 0.99); }
  return Math.round(g);
}

function refresh(mgr) {
  S.loading = true;
  const p = S.src === 'stall' ? mgr.net.do('market.buy', { qty: 0 }) : mgr.net.do('shop.buy', { npc: S.src, qty: 0 });
  p.then((r) => { S.loading = false; if (r.ok && r.d?.stock) S.stock = r.d.stock; S.fetchedAt = performance.now(); });
}

const npcName = (id) => content.npcs.byId?.[id]?.name ?? 'Shop';

const panel = {
  id: 'market',
  key: null,
  modal: false,
  w: 228, h: 214, anchor: 'right',
  open(store, args) {
    S.args = args || {};
    S.src = S.args.npc ?? 'stall';
    S.tab = S.args.npc ? 1 : 0;
    S.stock = S.src === 'stall' ? (store.self.shop?.src === 'stall' ? store.self.shop.stock : []) : [];
    S.msg = null;
    if (!S.bound) {
      S.bound = true;
      store.on('change:self.shop', (m) => { if (m?.src === S.src) S.stock = m.stock; });
    }
    const mgr = globalThis.__tb?.ui;
    if (mgr) { refresh(mgr); mgr.open('inventory'); }
  },
  close() {
    const mgr = globalThis.__tb?.ui;
    if (mgr && !mgr.isOpen('station') && !mgr.isOpen('storage')) mgr.close('inventory');
  },
  draw(ui, store) {
    const mgr = ui.ui;
    const shop = S.src !== 'stall';
    ui.frame(shop ? npcName(S.src) : 'Market Stall');
    ui.label(ui.w - 8, 4, `${fmt(store.world.glint ?? 0)} G`, { color: C.gold, align: 'right' });
    const t = ui.tabs(8, 15, ['Sell', 'Buy'], S.tab);
    if (t !== S.tab) { S.tab = t; if (t === 1) refresh(mgr); }
    const LY = 30, LH = ui.h - LY - 22, RH = 20;
    ui.rect(7, LY - 1, ui.w - 14, LH + 2, C.borderDark);
    const act = (p, okText) => p.then((r) => {
      if (r.ok) { S.msg = { text: okText(r), good: true, t: 2 }; mgr.sound('glint'); if (S.tab === 1 && r.d?.stock) S.stock = r.d.stock; }
      else { S.msg = { text: r.d?.why ?? ({ range: 'Too far away', cost: 'Not enough', full: 'Sold out or no room' }[r.err] ?? 'Cannot'), good: false, t: 2 }; mgr.sound('deny'); }
    });

    if (S.tab === 0) {
      const counts = new Map();
      for (const s of store.self.inv?.slots ?? []) if (s && itemDef(s[0])?.value > 0) counts.set(s[0], (counts.get(s[0]) || 0) + s[1]);
      const rows = [...counts.entries()].sort((a, b) => payout(store, b[0], b[1]) - payout(store, a[0], a[1]));
      ui.list(8, LY, ui.w - 16, LH, rows, RH, ([item, n], ry, hov) => {
        if (hov) ui.rect(8, ry, ui.w - 16, RH, C.bgLight);
        mgr.sprites?.draw(ui.ctx, 'item.' + item, ui.x + 16, ui.y + ry + 17, { scaleX: 0.75, scaleY: 0.75 });
        let name = itemName(item);
        while (measure(name) > 84 && name.length > 4) name = name.slice(0, -2);
        drawText(ui.ctx, name, ui.x + 26, ui.y + ry + 2, { color: C.text, outline: false });
        const sat = store.world.market?.[item] ?? 1;
        const unit = payout(store, item, 1);
        drawText(ui.ctx, `x${n}  ${unit} G`, ui.x + 26, ui.y + ry + 11, { color: C.dim, outline: false });
        // saturation bar
        ui.rect(88, ry + 13, 22, 4, C.borderDark);
        ui.rect(89, ry + 14, Math.round(20 * sat), 2, sat > 0.7 ? C.good : sat > 0.35 ? C.gold : C.bad);
        if (ui.hover(86, ry + 10, 26, 10)) ui.tooltip(`Market demand ${Math.round(sat * 100)}%\nEach unit sold lowers it 1%; it recovers 2% per minute`);
        else if (hov) ui.tooltip(itemTooltip(store, item, n));
        let bx = 118;
        for (const [label, q] of [['1', 1], ['10', Math.min(10, n)], ['All', n]]) {
          const w = label === 'All' ? 30 : 20;
          const g = payout(store, item, q);
          if (ui.button(bx, ry + 4, label, { w, h: 12, key: item + label, tooltip: `Sell ${q} for ${g} G` })) {
            act(mgr.net.do('market.sell', { item, qty: label === 'All' ? 'all' : q, ...(shop ? { npc: S.src } : {}) }), (r) => `Sold ${r.d.qty} ${itemName(item)} for ${r.d.glint} G`);
          }
          bx += w + 2;
        }
      }, 'sell');
      if (!rows.length) ui.label(14, LY + 6, 'Nothing to sell', { color: C.dim });
    } else {
      const rows = S.stock;
      ui.list(8, LY, ui.w - 16, LH, rows, RH, (l, ry, hov) => {
        if (hov) ui.rect(8, ry, ui.w - 16, RH, C.bgLight);
        mgr.sprites?.draw(ui.ctx, 'item.' + l.item, ui.x + 16, ui.y + ry + 17, { scaleX: 0.75, scaleY: 0.75 });
        let name = itemName(l.item);
        while (measure(name) > 92 && name.length > 4) name = name.slice(0, -2);
        drawText(ui.ctx, name, ui.x + 26, ui.y + ry + 2, { color: l.left > 0 ? C.text : C.dim, outline: false });
        drawText(ui.ctx, `${fmt(l.price)} G  ${l.left} left`, ui.x + 26, ui.y + ry + 11, { color: l.left > 0 ? C.dim : C.bad, outline: false });
        if (hov) ui.tooltip(itemTooltip(store, l.item) + '\nRestocks every day');
        let bx = 136;
        for (const q of [1, 5, 10]) {
          const can = l.left >= q && (store.world.glint ?? 0) >= l.price * q;
          if (ui.button(bx, ry + 4, String(q), { w: 22, h: 12, key: l.item + q, disabled: !can, tooltip: `Buy ${q} for ${fmt(l.price * q)} G` })) {
            act(mgr.net.do(shop ? 'shop.buy' : 'market.buy', { item: l.item, qty: q, ...(shop ? { npc: S.src } : {}) }), () => `Bought ${q} ${itemName(l.item)}`);
          }
          bx += 24;
        }
      }, 'buy');
      if (!rows.length) ui.label(14, LY + 6, S.loading ? 'Loading...' : (shop ? 'Sold out today' : 'Wares appear as you reach new biomes'), { color: C.dim });
    }
    if (S.msg) {
      S.msg.t -= 1 / 60;
      if (S.msg.t <= 0) S.msg = null;
      else drawText(ui.ctx, S.msg.text, ui.x + ui.w / 2, ui.y + ui.h - 15, { align: 'center', color: S.msg.good ? C.good : C.bad, outline: false });
    }
    if (!S.msg) drawText(ui.ctx, shop ? 'Stock refreshes every day' : 'Flooding one good lowers its price', ui.x + ui.w / 2, ui.y + ui.h - 15, { align: 'center', color: C.dim, outline: false });
  },
};

export default panel;
