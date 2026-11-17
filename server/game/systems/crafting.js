// WP4 crafting: hand recipes and bench recipes (Workbench chain, `station.hand`), crafted from a per-player timed
// queue (DESIGN 21: craft x1/x5/max). Inputs are taken atomically per craft when it starts; cancelling the running
// craft refunds them. Craft XP = ceil(value * 0.4) per item (DESIGN 5.2). Also publishes self.recipes (TECH_SPEC 6.4).

import { REACH } from '../../../shared/config.js';
import { isInt } from '../../../shared/protocol.js';
import { CRAFT_XP_PER_VALUE } from '../../../shared/rules/constants.js';
import { itemDef, hasUnlockAll, edgeDist, sendInv } from './inventory.js';

const MAX_QUEUE = 8;
const MAX_PER_ENTRY = 999;
const BENCH_RANGE = REACH + 1.6;

export const groupsOf = (game) => game.content.modules.recipes?.GROUPS ?? {};
export const stationTiers = (game) => game.content.modules.recipes?.STATION_TIERS ?? {};

// Station kinds that can run a recipe made for `station` (the station itself and every higher tier of its chain).
export function stationsFor(game, station) {
  for (const chain of Object.values(stationTiers(game))) {
    const i = chain.indexOf(station);
    if (i >= 0) return chain.slice(i);
  }
  return [station];
}

// Resolve a recipe's inputs for `times` crafts against have(item) -> count.
// Groups pick the preferred member (prefer[group]) or the first member with enough; the chosen member's output
// multiplier applies (tier k wood gives k planks). Returns { take: [{item, qty}], outQty } or null.
export function resolveInputs(game, recipe, have, times = 1, prefer = {}) {
  const groups = groupsOf(game);
  const used = new Map();
  const left = (item) => have(item) - (used.get(item) || 0);
  const take = [];
  let mult = 1;
  for (const inp of recipe.in) {
    const need = inp.qty * times;
    let item = inp.item;
    if (!item && inp.group) {
      const g = groups[inp.group] || {};
      const members = Object.keys(g);
      const pref = prefer?.[inp.group];
      item = pref && g[pref] && left(pref) >= need ? pref : members.find((m) => left(m) >= need);
      if (!item) return null;
      mult = Math.max(mult, g[item] || 1);
    }
    if (left(item) < need) return null;
    used.set(item, (used.get(item) || 0) + need);
    take.push({ item, qty: need });
  }
  return { take, outQty: recipe.out.qty * mult };
}

// How many times a recipe can be made from have().
export function maxCraftable(game, recipe, have, prefer, cap = MAX_PER_ENTRY) {
  if (!resolveInputs(game, recipe, have, 1, prefer)) return 0;
  let lo = 1, hi = cap;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (resolveInputs(game, recipe, have, mid, prefer)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// WP14 (BUILD_REVIEW P2-6): Ballast gives half craft XP (it is a material sink; full XP was ~576k at tier 5 vs 247k modelled).
export const BALLAST_XP_MULT = 0.5;
export const craftXp = (game, item, qty) => Math.ceil((itemDef(game, item)?.value ?? 0) * CRAFT_XP_PER_VALUE * (/^ballast_/.test(item) ? BALLAST_XP_MULT : 1)) * qty;

function isBenchRecipe(game, recipe) {
  if (recipe.station === 'hand') return true;
  const def = game.content.structures.byId[recipe.station];
  return !!def?.station?.hand;
}

function nearBench(game, player, recipe) {
  if (recipe.station === 'hand') return true;
  const kinds = new Set(stationsFor(game, recipe.station));
  const pe = player.entity;
  const realm = game.realms.get(pe?.realm);
  if (!realm) return false;
  for (const e of realm.query(pe.x, pe.y, BENCH_RANGE + 2, [], (o) => o.type === 'structure' && kinds.has(o.kind))) {
    if (edgeDist(e, pe.x, pe.y) <= BENCH_RANGE) return true;
  }
  return false;
}

function sendQueue(game, player) {
  const q = (player.craftQ ||= []);
  game.sendSelf(player, 'craft', {
    at: +game.now.toFixed(3),
    q: q.map((c) => ({ r: c.r, left: c.left, dur: +c.dur.toFixed(3), t: +c.t.toFixed(3), paused: !!c.paused, active: !!c.paid })),
  });
}

function craftDuration(game, player, recipe) {
  const s = game.stats.of(player);
  return Math.max(0.25, (recipe.time || 1) / (1 + (s.craftSpeed ?? 0)));
}

export default {
  name: 'crafting',

  init(game) {
    const openCraft = (g, player, e) => {
      g.sendSelf(player, 'ui', { kind: 'craft', id: e.id, station: e.kind, n: (player._uiN = (player._uiN || 0) + 1) });
      return { ok: true };
    };
    for (const s of game.content.structures) if (s.station?.hand) game.call('registerInteract', s.id, openCraft);
  },

  onJoin(game, player) {
    player.craftQ ||= [];
    player._recipesKey = null;
    this.publishRecipes(game, player);
    sendQueue(game, player);
  },

  onLeave(game, player) {
    // refund the running craft so nothing is lost on disconnect
    const c = player.craftQ?.[0];
    if (c?.paid) { for (const t of c.paid) game.inv.add(player.inv, t.item, t.qty); c.paid = null; c.t = 0; }
  },

  publishRecipes(game, player) {
    const ids = [];
    for (const r of game.content.recipes) if (hasUnlockAll(game, r.unlock, player)) ids.push(r.id);
    const key = ids.join(',');
    if (key !== player._recipesKey) {
      player._recipesKey = key;
      game.sendSelf(player, 'recipes', ids);
    }
  },

  slowTick(game) {
    for (const p of game.players.values()) this.publishRecipes(game, p);
  },

  tick(game, dt) {
    for (const player of game.players.values()) {
      const q = player.craftQ;
      if (!q || q.length === 0) continue;
      const c = q[0];
      const recipe = game.content.recipes.byId[c.r];
      if (!recipe) { q.shift(); sendQueue(game, player); continue; }
      const near = nearBench(game, player, recipe);
      if (!near) {
        if (!c.paused) { c.paused = true; sendQueue(game, player); }
        continue;
      }
      if (c.paused) { c.paused = false; sendQueue(game, player); }
      if (!c.paid) {
        const res = resolveInputs(game, recipe, (it) => game.inv.count(player.inv, it), 1, c.use);
        if (!res || !game.call('takeItems', player, res.take)) {
          q.shift();
          game.toast(player, `Out of materials for ${itemDef(game, recipe.out.item)?.name ?? recipe.out.item}`, 'warn');
          sendQueue(game, player);
          continue;
        }
        c.paid = res.take; c.outQty = res.outQty; c.t = 0; c.dur = craftDuration(game, player, recipe);
        sendQueue(game, player);
      }
      c.t += dt;
      if (c.t + 1e-9 < c.dur) continue;
      // complete one craft
      const item = recipe.out.item, qty = c.outQty || recipe.out.qty;
      game.call('giveItem', player, item, qty);
      game.call('grantXp', player, craftXp(game, item, qty), 'craft');
      game.bus.emit('item.crafted', { player, item, qty, station: recipe.station, byMachine: false });
      game.fx(player.entity.realm, 'craft_done', player.entity.x, player.entity.y - 0.6, { item });
      c.paid = null; c.left -= 1; c.t = 0;
      if (c.left <= 0) q.shift();
      sendQueue(game, player);
    }
  },

  handlers: {
    'craft.make': (game, player, d) => {
      const q = (player.craftQ ||= []);
      if (d.cancel !== undefined) {
        const i = isInt(d.cancel, 0, q.length - 1) ? d.cancel : -1;
        if (i < 0) return { ok: false, err: 'invalid' };
        const [c] = q.splice(i, 1);
        if (c?.paid) { for (const t of c.paid) game.call('giveItem', player, t.item, t.qty); sendInv(game, player); }
        sendQueue(game, player);
        return { ok: true };
      }
      const recipe = typeof d.recipe === 'string' ? game.content.recipes.byId[d.recipe] : null;
      if (!recipe || !isBenchRecipe(game, recipe)) return { ok: false, err: 'invalid' };
      if (!hasUnlockAll(game, recipe.unlock, player)) return { ok: false, err: 'locked' };
      if (!nearBench(game, player, recipe)) return { ok: false, err: 'range' };
      const use = d.use && typeof d.use === 'object' ? Object.fromEntries(Object.entries(d.use).filter(([k, v]) => typeof k === 'string' && typeof v === 'string').slice(0, 4)) : {};
      const have = (it) => game.inv.count(player.inv, it);
      const can = maxCraftable(game, recipe, have, use);
      if (can <= 0) return { ok: false, err: 'cost' };
      const want = d.qty === 'max' ? can : isInt(d.qty, 1, MAX_PER_ENTRY) ? Math.min(d.qty, MAX_PER_ENTRY) : 1;
      const last = q[q.length - 1];
      if (last && last.r === recipe.id && JSON.stringify(last.use || {}) === JSON.stringify(use)) {
        last.left = Math.min(MAX_PER_ENTRY, last.left + want);
      } else {
        if (q.length >= MAX_QUEUE) return { ok: false, err: 'full' };
        q.push({ r: recipe.id, left: want, t: 0, dur: craftDuration(game, player, recipe), paid: null, use });
      }
      sendQueue(game, player);
      return { ok: true, d: { queued: want } };
    },
  },

  saveProfile(game, player) {
    // queued crafts persist; the running craft's inputs are refunded into the queue head (re-taken on resume)
    const q = (player.craftQ || []).map((c) => ({ r: c.r, left: c.left, use: c.use || {}, ...(c.paid ? { paid: c.paid } : {}) }));
    return q.length ? { q } : undefined;
  },

  loadProfile(game, player, data) {
    // inputs held by a craft that was running at an autosave come back to the inventory
    for (const c of Array.isArray(data?.q) ? data.q : []) {
      for (const t of Array.isArray(c?.paid) ? c.paid : []) if (game.content.items.byId[t?.item] && t.qty > 0) game.inv.add(player.inv, t.item, t.qty | 0);
    }
    player.craftQ = Array.isArray(data?.q)
      ? data.q.filter((c) => game.content.recipes.byId[c?.r] && c.left > 0).slice(0, MAX_QUEUE)
        .map((c) => ({ r: c.r, left: Math.min(MAX_PER_ENTRY, c.left | 0), t: 0, dur: 1, paid: null, use: c.use || {} }))
      : [];
  },
};
