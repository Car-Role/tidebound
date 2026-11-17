// WP4 inventory system: services giveItem / takeItems / countItem and the inventory intents
// inv.move, inv.drop, inv.sort, inv.hotbar (TECH_SPEC 5.5, 6.3).
// Also exports the small helpers the other WP4/WP9 systems share (gear lookup, effects, unlocks, containers, gain feed).

import { REACH } from '../../../shared/config.js';
import { isInt } from '../../../shared/protocol.js';

// ---------------------------------------------------------------- shared helpers (WP4 / WP9)

export const itemDef = (game, id) => game.content.items.byId[id] ?? null;
export const realmOf = (game, p) => game.realms.get(p?.entity?.realm) ?? null;

export function sendInv(game, player) {
  game.sendSelf(player, 'inv', game.invView(player));
}

// Gain feed ("+12 Driftwood", DESIGN 19): batched per tick, sent as self key `gain` = { k, l: [[item, qty], ...] }.
export function noteGain(player, item, qty) {
  if (!player || !(qty > 0)) return;
  const g = (player._gains ||= new Map());
  g.set(item, (g.get(item) || 0) + qty);
}
export function flushGains(game) {
  for (const p of game.players.values()) {
    if (!p._gains || p._gains.size === 0) continue;
    p._gainK = (p._gainK || 0) + 1;
    game.sendSelf(p, 'gain', { k: p._gainK, l: [...p._gains] });
    p._gains.clear();
  }
}

// Every item id referenced from player.gear (strings, { item } objects, arrays), regardless of WP6b's exact shape.
export function gearItems(game, player) {
  const out = [];
  const walk = (v, depth) => {
    if (depth > 3 || v == null) return;
    if (typeof v === 'string') { if (game.content.items.byId[v]) out.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === 'object') {
      if (typeof v.item === 'string' || typeof v.id === 'string') walk(v.item ?? v.id, depth + 1);
      else for (const k of Object.keys(v)) if (k !== 'temper') walk(v[k], depth + 1);
    }
  };
  walk(player?.gear, 0);
  return out;
}

// Item id in a gear slot ('hook', 'rod', ...), or null.
export function gearInSlot(game, player, slot) {
  const v = player?.gear?.[slot];
  const id = typeof v === 'string' ? v : (v && typeof v === 'object' ? (v.item ?? v.id) : null);
  return id && game.content.items.byId[id] ? id : null;
}

// Best tool of a gear slot: the equipped one, else the best one carried, else the fallback (hook_1 is the start hook).
export function toolFor(game, player, slot, fallback = null) {
  const eq = gearInSlot(game, player, slot);
  if (eq) return itemDef(game, eq);
  let best = null;
  for (const s of player?.inv?.slots ?? []) {
    if (!s) continue;
    const d = itemDef(game, s[0]);
    if (d?.gear?.slot === slot && (!best || (d.gear.tier ?? d.tier) > (best.gear.tier ?? best.tier))) best = d;
  }
  return best ?? (fallback ? itemDef(game, fallback) : null);
}

export function hasUnlockAll(game, list, player) {
  for (const u of list ?? []) if (!game.call('hasUnlock', u, player)) return false;
  return true;
}

const UNLOCK_TEXT = {
  level: (a) => `Reach level ${a}`, skill: (a) => `Learn skill ${a}`, beacon: (a) => `Light Beacon ${a}`,
  quest: (a) => `Complete quest ${a}`, boss: (a) => `Defeat ${a.replace(/_/g, ' ')}`, vault: (a) => `Clear Vault ${a}`,
};
export function unlockText(u) {
  const [k, a] = String(u).split(':');
  return UNLOCK_TEXT[k] ? UNLOCK_TEXT[k](a ?? '') : u;
}
export function missingUnlocks(game, list, player) {
  return (list ?? []).filter((u) => !game.call('hasUnlock', u, player));
}

// Numeric content effects ({ id, ...params }, registries.EFFECTS) active for a player.
// WP14 (BUILD_REVIEW P0-2): one pipeline. When the WP6 effects registry exists (cards, sets, class, gear, skills,
// castaway lines, Moon Chart...) it is the source; skills unlocked in the world by another bound player are added
// on top (skill unlocks are world flags, TECH_SPEC 7.1). The gear + skills body stays as the fallback.
export function effectsOf(game, player) {
  if (game.effects?.of && player) {
    const out = game.effects.of(player).slice();
    const seen = new Set(out.map((e) => e.src).filter(Boolean));
    for (const sk of game.content.skills ?? []) {
      if (!sk.effects?.length || seen.has('skill:' + sk.id)) continue;
      if (game.call('hasUnlock', 'skill:' + sk.id, player)) for (const e of sk.effects) out.push({ ...e, src: 'skill:' + sk.id });
    }
    return out;
  }
  const out = [];
  for (const id of gearItems(game, player)) for (const e of itemDef(game, id)?.effects ?? []) out.push(e);
  for (const sk of game.content.skills ?? []) {
    if (!sk.effects?.length) continue;
    if (game.call('hasUnlock', 'skill:' + sk.id, player)) for (const e of sk.effects) out.push(e);
  }
  return out;
}
export function effect(game, player, id) {
  return effectsOf(game, player).filter((e) => e.id === id);
}
// Any bound player owning a skill counts (world rule); used for world-scope effects.
export function worldSkill(game, skillId) {
  return !!game.call('hasUnlock', 'skill:' + skillId, null);
}

export function distTo(entity, x, y) { return Math.hypot(entity.x - x, entity.y - y); }

// Distance from a point to the nearest edge of a tile-anchored entity (structure footprint or node tile).
export function edgeDist(e, x, y) {
  const tx = e.data?.tx ?? Math.floor(e.x), ty = e.data?.ty ?? Math.floor(e.y);
  const w = e.data?.w ?? 1, h = e.data?.h ?? 1;
  const dx = Math.max(tx - x, 0, x - (tx + w)), dy = Math.max(ty - y, 0, y - (ty + h));
  return Math.hypot(dx, dy);
}

export function inReach(player, e, extra = 0) {
  if (!player?.entity || !e || e.removed || e.realm !== player.entity.realm) return false;
  return edgeDist(e, player.entity.x, player.entity.y) <= REACH + 0.6 + extra;
}

// ---------------------------------------------------------------- containers
// Adapters let inv.move address stations and storage uniformly:
// adapter = { inv: { slots }, accept(slot, item) -> bool, changed(), view? }
export const containerAdapters = new Map();   // structure kind -> fn(game, structure, player) -> adapter | null

function selfAdapter(game, player) {
  return { inv: player.inv, self: true, accept: () => true, changed: () => sendInv(game, player) };
}

export function containerFor(game, player, ref) {
  if (ref === 'self' || ref === undefined || ref === null) return selfAdapter(game, player);
  if (!Number.isInteger(ref)) return null;
  const realm = realmOf(game, player);
  const e = realm?.entities.get(ref);
  if (!e) return null;
  const fn = containerAdapters.get(e.kind);
  if (!fn || !inReach(player, e, 2.5)) return null;
  return fn(game, e, player);
}

const stackOf = (game, item) => game.content.items.byId[item]?.stack ?? 999;

// Move between two adapters with per-slot accept rules. Returns the quantity moved (0 = nothing).
export function moveStack(game, A, from, B, to, qty) {
  const sa = A.inv.slots, sb = B.inv.slots;
  if (!isInt(from, 0, sa.length - 1)) return 0;
  const a = sa[from];
  if (!a) return 0;
  const n = Math.min(a[1], qty > 0 ? Math.floor(qty) : a[1]);
  if (to === -1) {                                   // quick move: merge first, then empty slots
    let left = n;
    for (let pass = 0; pass < 2 && left > 0; pass++) {
      for (let i = 0; i < sb.length && left > 0; i++) {
        if (A === B && i === from) continue;
        const b = sb[i];
        if (pass === 0 ? !(b && b[0] === a[0]) : b) continue;
        if (!B.accept(i, a[0])) continue;
        const room = stackOf(game, a[0]) - (b ? b[1] : 0);
        const m = Math.min(room, left);
        if (m <= 0) continue;
        if (b) b[1] += m; else sb[i] = [a[0], m];
        left -= m;
      }
    }
    const moved = n - left;
    a[1] -= moved;
    if (a[1] <= 0) sa[from] = null;
    return moved;
  }
  if (!isInt(to, 0, sb.length - 1)) return 0;
  if (A === B && from === to) return 0;
  if (!B.accept(to, a[0])) return 0;
  const b = sb[to];
  if (!b) {
    sb[to] = [a[0], Math.min(n, stackOf(game, a[0]))];
    const m = sb[to][1];
    a[1] -= m;
    if (a[1] <= 0) sa[from] = null;
    return m;
  }
  if (b[0] === a[0]) {
    const m = Math.min(stackOf(game, a[0]) - b[1], n);
    if (m <= 0) return 0;
    b[1] += m; a[1] -= m;
    if (a[1] <= 0) sa[from] = null;
    return m;
  }
  if (n !== a[1] || !A.accept(from, b[0])) return 0;   // swap needs the whole stack and room for the other item
  sa[from] = b; sb[to] = a;
  return a[1];
}

// ---------------------------------------------------------------- sorting

const CAT_ORDER = ['tool', 'weapon', 'rod', 'armor', 'pack', 'lantern', 'trinket', 'placeable', 'food', 'tonic', 'misc',
  'seed', 'fish', 'material', 'component', 'key', 'trophy', 'relic'];
export function sortSlots(game, slots) {
  const merged = new Map();
  for (const s of slots) if (s) merged.set(s[0], (merged.get(s[0]) || 0) + s[1]);
  const ids = [...merged.keys()].sort((x, y) => {
    const a = itemDef(game, x), b = itemDef(game, y);
    const ca = CAT_ORDER.indexOf(a?.cat), cb = CAT_ORDER.indexOf(b?.cat);
    return (ca - cb) || ((a?.tier ?? 0) - (b?.tier ?? 0)) || String(x).localeCompare(String(y));
  });
  const out = new Array(slots.length).fill(null);
  let i = 0;
  for (const id of ids) {
    let left = merged.get(id);
    const max = stackOf(game, id);
    while (left > 0 && i < out.length) { const n = Math.min(max, left); out[i++] = [id, n]; left -= n; }
  }
  for (let k = 0; k < slots.length; k++) slots[k] = out[k];
}

// ---------------------------------------------------------------- hotbar refs follow moved stacks

function remapHotbar(player, from, to, swapped) {
  const hb = player.hotbar;
  for (let i = 0; i < hb.length; i++) {
    if (hb[i] === from) hb[i] = to;
    else if (swapped && hb[i] === to) hb[i] = from;
  }
}

// ---------------------------------------------------------------- system

const DROP_PICKUP_LOCK = 1.5;

export default {
  name: 'inventory',

  init(game) {
    const reg = (n, fn) => game.services.register(n, fn);
    reg('giveItem', (player, itemId, qty) => {
      qty = Math.floor(qty);
      if (!player || !(qty > 0) || !itemDef(game, itemId)) return 0;
      const left = game.inv.add(player.inv, itemId, qty);
      if (left < qty) { sendInv(game, player); noteGain(player, itemId, qty - left); }
      if (left > 0 && player.entity) {
        game.call('dropItem', player.entity.realm, player.entity.x, player.entity.y + 0.3, itemId, left, { owner: player.id, lockFor: [player.id], lockS: 2 });
        game.toast(player, 'Inventory full', 'warn');
      }
      return left;
    });
    reg('takeItems', (player, list) => {
      if (!player || !Array.isArray(list)) return false;
      const clean = list.filter((e) => e && e.qty > 0).map((e) => ({ item: e.item, qty: Math.floor(e.qty) }));
      const ok = game.inv.removeAll(player.inv, clean);
      if (ok) sendInv(game, player);
      return ok;
    });
    reg('countItem', (player, itemId) => (player ? game.inv.count(player.inv, itemId) : 0));
  },

  onJoin(game, player) {
    const n = game.stats.of(player).invSlots;
    if (player.inv.slots.length < n) game.inv.resize(player.inv, n);
    while (player.hotbar.length < 8) player.hotbar.push(null);
    sendInv(game, player);
  },

  slowTick(game) {
    // packs and cards raise invSlots; grow inventories to match (never shrink here: no item loss)
    for (const p of game.players.values()) {
      const n = game.stats.of(p).invSlots;
      if (p.inv.slots.length < n) { game.inv.resize(p.inv, n); sendInv(game, p); }
    }
  },

  handlers: {
    'inv.move': (game, player, d) => {
      const A = containerFor(game, player, d.src ?? 'self');
      const B = containerFor(game, player, d.dst ?? 'self');
      if (!A || !B) return { ok: false, err: 'range' };
      const to = d.to === -1 ? -1 : d.to;
      if (!isInt(d.from, 0, 999) || !(to === -1 || isInt(to, 0, 999))) return { ok: false, err: 'invalid' };
      const qty = isInt(d.qty, 1, 1e6) ? d.qty : 0;
      const before = A.inv.slots[d.from] ? [...A.inv.slots[d.from]] : null;
      const beforeTo = to >= 0 && B.inv.slots[to] ? [...B.inv.slots[to]] : null;
      const moved = moveStack(game, A, d.from, B, to, qty);
      if (!moved) return { ok: false, err: 'full' };
      if (A.self && B.self && to >= 0 && before) {
        const swapped = beforeTo && beforeTo[0] !== before[0];
        if (swapped || !A.inv.slots[d.from]) remapHotbar(player, d.from, to, swapped);
      }
      A.changed(); if (B !== A) B.changed();
      if (!A.self || !B.self) sendInv(game, player);
      return { ok: true, d: { moved } };
    },

    'inv.drop': (game, player, d) => {
      if (!isInt(d.slot, 0, player.inv.slots.length - 1)) return { ok: false, err: 'invalid' };
      const s = player.inv.slots[d.slot];
      if (!s) return { ok: false, err: 'invalid' };
      const n = isInt(d.qty, 1, s[1]) ? d.qty : s[1];
      const item = s[0];
      s[1] -= n;
      if (s[1] <= 0) player.inv.slots[d.slot] = null;
      const e = player.entity;
      const f = e.facing ?? 2;
      const a = (f & 7) * (Math.PI / 4);
      game.call('dropItem', e.realm, e.x + Math.cos(a) * 0.6, e.y + Math.sin(a) * 0.6, item, n,
        { owner: player.id, lockFor: [player.id], lockS: DROP_PICKUP_LOCK, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 });
      sendInv(game, player);
      return { ok: true };
    },

    'inv.sort': (game, player, d) => {
      const A = containerFor(game, player, d.src ?? 'self');
      if (!A) return { ok: false, err: 'range' };
      if (A.sort) A.sort(d);
      else {
        // hotbar refs follow their item through a sort
        const refItems = A.self ? player.hotbar.map((i) => (i == null ? null : player.inv.slots[i]?.[0] ?? null)) : null;
        sortSlots(game, A.inv.slots);
        if (refItems) {
          player.hotbar = refItems.map((id, i) => {
            if (id == null) return player.hotbar[i] ?? null;
            const idx = player.inv.slots.findIndex((s) => s && s[0] === id);
            return idx >= 0 ? idx : null;
          });
        }
      }
      A.changed();
      return { ok: true };
    },

    'inv.hotbar': (game, player, d) => {
      if (!isInt(d.bar, 0, 7)) return { ok: false, err: 'invalid' };
      const slot = isInt(d.slot, 0, player.inv.slots.length - 1) ? d.slot : null;
      for (let i = 0; i < player.hotbar.length; i++) if (slot != null && player.hotbar[i] === slot) player.hotbar[i] = null;
      player.hotbar[d.bar] = slot;
      sendInv(game, player);
      return { ok: true };
    },
  },
};

export { DROP_PICKUP_LOCK };
