// WP9 market: Market Stall selling and buying, saturation (x0.99 per unit, floor 0.05, +0.02 per minute of connected
// play toward 1.0, x2 recovery with G8 satRecover), castaway shop stock (restock each in-game day, 40 per material,
// x2 with G8) and transactions (DESIGN 15, A.6; shared/rules/market.js). Services sellItems and shopStock.
// sellItems never removes items: callers hand over what they sell (market.sell removes from the player first).

import { REACH } from '../../../shared/config.js';
import { isInt } from '../../../shared/protocol.js';
import { BIOME_TIER } from '../../../shared/grid.js';
import { sell as sellRule, recover, unitPrice } from '../../../shared/rules/market.js';
import { shopPrice } from '../../../shared/rules/costs.js';
import { SHOP_STOCK, MARKET_SELL_BEACON } from '../../../shared/rules/constants.js';
import { createRng, hashString } from '../../../shared/rng.js';
import { itemDef, effectsOf, edgeDist, worldSkill, sendInv } from './inventory.js';

const TRADE_RANGE = REACH + 2.5;
const SEND_EVERY = 5;

function state(game) {
  return (game._market ||= { sat: {}, shops: { day: null, left: {}, picks: {} }, sentAt: -1e9, dirty: true });
}

function sellMultOf(game, player) {
  return player ? (game.stats.of(player).sellMult ?? 0) : 0;
}

// Value of one unit for this seller (Regent Signet doubles fish value).
function valueFor(game, player, item) {
  const def = itemDef(game, item);
  if (!def || !(def.value > 0)) return 0;
  let v = def.value;
  if (player && def.cat === 'fish') for (const e of effectsOf(game, player)) if (e.id === 'fish_value') v *= e.mult ?? 1;
  return v;
}

function publish(game, force = false) {
  const st = state(game);
  if (!force && (!st.dirty || game.now - st.sentAt < SEND_EVERY)) return;
  st.dirty = false; st.sentAt = game.now;
  const out = {};
  for (const [k, v] of Object.entries(st.sat)) if (v < 0.9995) out[k] = Math.round(v * 1000) / 1000;
  game.sendWorld('market', out);
}

function currentDay(game) { return game.call('timeInfo')?.day ?? game.world.day ?? 1; }

// ---------------------------------------------------------------- castaway shops

function npcShop(game, npcId) {
  return game.content.shops.find((s) => s.npc === npcId) ?? null;
}

function lineDone(game, npcId) {
  const npc = game.content.npcs.byId[npcId];
  const last = npc?.quests?.[npc.quests.length - 1];
  return last ? !!game.call('hasUnlock', 'quest:' + last, null) : false;
}

function restockIfNewDay(game) {
  const st = state(game);
  const day = currentDay(game);
  if (st.shops.day === day) return;
  st.shops.day = day;
  st.shops.left = {};
  st.shops.picks = {};
  const mult = worldSkill(game, 'G8') ? 2 : 1;
  const pools = game.content.modules.shops?.SHOP_POOLS ?? {};
  for (const shop of game.content.shops) {
    const left = (st.shops.left[shop.npc] = {});
    shop.stock.forEach((line, i) => {
      let item = line.item;
      if (line.pool) {
        const pool = pools[line.pool] ?? [];
        const rng = createRng((game.seed ^ hashString(shop.npc + ':' + day)) >>> 0);
        item = pool.length ? pool[rng.int(0, pool.length - 1)] : null;
        if (item) st.shops.picks[shop.npc + ':' + i] = item;
      }
      if (item) left[item] = (line.stock ?? SHOP_STOCK) * mult;
    });
  }
  // Market Stall: previous-tier raw materials at 3x value, 40 per item per day
  const stall = (st.shops.left.stall = {});
  for (const l of stallLines(game)) stall[l.item] = SHOP_STOCK * mult;
}

function highestOwnedTier(game) {
  let t = 1;
  for (const p of game.world.plots ?? []) if (p.owned) { const b = game.call('featureAt', 'overworld', p.px * 20 + 10, p.py * 20 + 10)?.biome; t = Math.max(t, BIOME_TIER[b] ?? 1); }
  return t;
}

function stallLines(game) {
  const mats = game.content.modules.items?.TIER_MATS ?? [];
  const top = highestOwnedTier(game);
  const lines = [];
  for (let t = 1; t < top; t++) {
    for (const k of ['wood', 'stone', 'ore', 'fiber']) {
      const id = mats[t]?.[k];
      const def = itemDef(game, id);
      if (def) lines.push({ item: id, price: shopPrice(def.value) });
    }
  }
  return lines;
}

export function shopStockOf(game, npcId) {
  restockIfNewDay(game);
  const st = state(game);
  if (npcId === 'stall') {
    return stallLines(game).map((l) => ({ item: l.item, price: l.price, left: st.shops.left.stall?.[l.item] ?? SHOP_STOCK }));
  }
  const shop = npcShop(game, npcId);
  if (!shop) return [];
  const out = [];
  shop.stock.forEach((line, i) => {
    if (line.requires === 'line' && !lineDone(game, npcId)) return;
    const item = line.item ?? st.shops.picks[npcId + ':' + i];
    if (!item) return;
    out.push({ item, price: line.price, left: st.shops.left[npcId]?.[item] ?? 0 });
  });
  return out;
}

function nearNpc(game, player, npcId) {
  const pe = player.entity;
  const realm = game.realms.get(pe.realm);
  return realm?.query(pe.x, pe.y, TRADE_RANGE + 1, [], (o) => o.type === 'npc' && (o.kind === npcId || o.data?.npc === npcId)).length > 0;
}
function nearStall(game, player) {
  const pe = player.entity;
  const realm = game.realms.get(pe.realm);
  return realm?.query(pe.x, pe.y, TRADE_RANGE + 2, [], (o) => o.type === 'structure' && o.kind === 'market_stall' && edgeDist(o, pe.x, pe.y) <= TRADE_RANGE).length > 0;
}

function buy(game, player, src, d) {
  const stock = shopStockOf(game, src);
  if (!(d.qty > 0)) return { ok: true, d: { stock } };            // qty 0: just fetch the stock list
  const line = stock.find((l) => l.item === d.item);
  if (!line) return { ok: false, err: 'invalid' };
  const qty = Math.min(isInt(d.qty, 1, 999) ? d.qty : 1, line.left);
  if (qty <= 0) return { ok: false, err: 'full', d: { why: 'Sold out today' } };
  const room = game.inv.spaceFor(player.inv, d.item);
  if (room < qty) return { ok: false, err: 'full', d: { why: 'No room in your pack' } };
  const cost = line.price * qty;
  if (!game.call('spendGlint', cost, src === 'stall' ? 'market' : 'shop', player)) return { ok: false, err: 'cost', d: { why: 'Not enough Glint' } };
  const st = state(game);
  st.shops.left[src] ||= {};
  st.shops.left[src][d.item] = line.left - qty;
  game.call('giveItem', player, d.item, qty);
  game.fx(player.entity.realm, 'glint_burst', player.entity.x, player.entity.y, { amount: -cost });
  return { ok: true, d: { stock: shopStockOf(game, src), spent: cost } };
}

export default {
  name: 'market',

  init(game) {
    state(game);
    game.services.register('sellItems', (player, itemId, qty, opts = {}) => {
      qty = Math.floor(qty);
      if (!(qty > 0)) return 0;
      const value = valueFor(game, player, itemId);
      if (!value) return 0;
      const st = state(game);
      const key = opts.satKey ?? itemId;
      const sat = st.sat[key] ?? 1;
      const r = sellRule(value, qty, sat, { sellMult: sellMultOf(game, player), rate: opts.rate ?? 1 });
      st.sat[key] = r.sat;
      st.dirty = true;
      const glint = Math.round(r.glint);
      if (glint > 0) game.call('addGlint', glint, opts.source ?? 'sell', player ?? undefined);
      game.bus.emit('item.sold', { player: player ?? null, item: itemId, qty, glint });
      publish(game, !!player);
      return glint;
    });
    game.services.register('shopStock', (npcId) => shopStockOf(game, npcId));
    game.call('registerInteract', 'market_stall', (g, player, e) => {
      g.sendSelf(player, 'ui', { kind: 'market', id: e.id, n: (player._uiN = (player._uiN || 0) + 1) });
      g.sendSelf(player, 'shop', { src: 'stall', stock: shopStockOf(g, 'stall') });
      return { ok: true };
    });
  },

  onJoin(game) { publish(game, true); },

  slowTick(game) {
    const st = state(game);
    // recovery only while someone is connected (DESIGN 15, 22)
    if (game.players.size > 0) {
      const satRecover = game.stats.world().satRecover ?? 0;
      for (const [k, v] of Object.entries(st.sat)) {
        const nv = recover(v, 1 / 60, satRecover);
        if (nv >= 1) delete st.sat[k]; else st.sat[k] = nv;
        st.dirty = true;
      }
    }
    restockIfNewDay(game);
    publish(game);
  },

  handlers: {
    'market.sell': (game, player, d) => {
      const item = typeof d.item === 'string' ? d.item : null;
      if (!item || !itemDef(game, item)) return { ok: false, err: 'invalid' };
      const npc = typeof d.npc === 'string' ? d.npc : null;
      if (npc ? !nearNpc(game, player, npc) : !nearStall(game, player)) return { ok: false, err: 'range' };
      if (MARKET_SELL_BEACON > 0 && !game.world.flags?.['beacon:' + MARKET_SELL_BEACON]) {
        return { ok: false, err: 'locked', d: { why: `Traders buy once Beacon ${MARKET_SELL_BEACON} is lit` } };
      }
      if (!(valueFor(game, player, item) > 0)) return { ok: false, err: 'invalid', d: { why: 'Nobody buys that' } };
      const have = game.inv.count(player.inv, item);
      const qty = d.qty === 'all' ? have : Math.min(have, isInt(d.qty, 1, 1e6) ? d.qty : 1);
      if (qty <= 0) return { ok: false, err: 'cost' };
      game.inv.remove(player.inv, item, qty);
      sendInv(game, player);
      const glint = game.call('sellItems', player, item, qty, { source: npc ? 'shop' : 'market' });
      game.fx(player.entity.realm, 'glint_burst', player.entity.x, player.entity.y, { amount: glint });
      return { ok: true, d: { glint, qty, sat: state(game).sat[item] ?? 1 } };
    },

    'market.buy': (game, player, d) => {
      if (!nearStall(game, player)) return { ok: false, err: 'range' };
      return buy(game, player, 'stall', d);
    },

    'shop.buy': (game, player, d) => {
      const npc = typeof d.npc === 'string' ? d.npc : null;
      if (!npc || !npcShop(game, npc)) return { ok: false, err: 'invalid' };
      if (!nearNpc(game, player, npc)) return { ok: false, err: 'range' };
      return buy(game, player, npc, d);
    },
  },

  save(game) {
    const st = state(game);
    return { sat: st.sat, shops: st.shops };
  },

  load(game, data) {
    const st = state(game);
    st.sat = {};
    for (const [k, v] of Object.entries(data?.sat ?? {})) if (Number.isFinite(v) && v > 0 && v < 1) st.sat[k] = v;
    if (data?.shops && typeof data.shops === 'object') st.shops = { day: data.shops.day ?? null, left: data.shops.left ?? {}, picks: data.shops.picks ?? {} };
    st.dirty = true;
  },
};

export { unitPrice };
