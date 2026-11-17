// WP4 stations: timed stations (Kiln chain, Loom, Anvil chain, Cookpot, Still, Campfire) with input slots, a fuel
// slot + fuel meter, output slots and a recipe queue (DESIGN 6.2 Kiln rules, 7.1; TECH_SPEC 5.5 IO providers).
// A station runs the head of its queue (a queued recipe is "pinned"), else the first recipe in data order whose
// inputs are all present. Listed times are base times; station speed (Kiln II x2, Kiln III x4) divides them.
// All state lives in structure.data.st (saved verbatim with the structure).

import { isInt } from '../../../shared/protocol.js';
import { itemDef, containerAdapters, inReach, sendInv, hasUnlockAll, effectsOf, moveStack } from './inventory.js';
import { stationsFor, resolveInputs, maxCraftable, groupsOf, craftXp } from './crafting.js';

const VIEW_RANGE = 7;
const DEFAULT_DISTINCT = 3;     // recipes a non-Kiln station can hold queued
const KILN_DISTINCT = 1;        // Kilns hold 1 (2 with F2 kiln_queue)

const isKilnKind = (kind) => kind === 'kiln' || kind === 'kiln_2' || kind === 'kiln_3';

// Per-kind recipe lists (data order) and the set of items accepted in input slots.
function kindInfo(game, kind) {
  const cache = (game._stationInfo ||= new Map());
  let info = cache.get(kind);
  if (info) return info;
  const groups = groupsOf(game);
  const recipes = game.content.recipes.filter((r) => r.station !== 'hand' && stationsFor(game, r.station).includes(kind));
  const inputs = new Set();
  for (const r of recipes) for (const i of r.in) {
    if (i.item) inputs.add(i.item);
    else for (const m of Object.keys(groups[i.group] || {})) inputs.add(m);
  }
  info = { recipes, inputs, byId: new Set(recipes.map((r) => r.id)) };
  cache.set(kind, info);
  return info;
}

const stationDef = (game, kind) => {
  const d = game.content.structures.byId[kind];
  return d?.station && !d.station.hand ? d : null;
};

export function stationState(game, e) {
  const def = stationDef(game, e.kind);
  if (!def) return null;
  const sd = def.station;
  let st = e.data.st;
  const nIn = sd.inSlots ?? 1, nOut = sd.outSlots ?? 1, hasFuel = !!sd.fuel;
  const size = nIn + (hasFuel ? 1 : 0) + nOut;
  if (!st || !Array.isArray(st.slots) || st.slots.length !== size) {
    const old = Array.isArray(st?.slots) ? st.slots.filter(Boolean) : [];
    st = { slots: new Array(size).fill(null), meter: st?.meter ?? 0, queue: [], cur: null, loader: null, ver: 1 };
    // keep anything that was in a malformed state as overflow in the output side
    for (const s of old) { const i = st.slots.indexOf(null); if (i >= 0 && Array.isArray(s)) st.slots[i] = s; }
    e.data.st = st;
  }
  st.nIn = nIn; st.fuelIdx = hasFuel ? nIn : -1; st.outIdx = nIn + (hasFuel ? 1 : 0); st.nOut = nOut;
  st.queue = Array.isArray(st.queue) ? st.queue.filter((q) => q && kindInfo(game, e.kind).byId.has(q.r) && q.left > 0) : [];
  return st;
}

const fuelOf = (game, item) => itemDef(game, item)?.fuel ?? 0;

function countIn(st, item) {
  let n = 0;
  for (let i = 0; i < st.nIn; i++) { const s = st.slots[i]; if (s && s[0] === item) n += s[1]; }
  return n;
}
function removeIn(st, item, qty) {
  let left = qty;
  for (let i = st.nIn - 1; i >= 0 && left > 0; i--) {
    const s = st.slots[i];
    if (!s || s[0] !== item) continue;
    const n = Math.min(left, s[1]);
    s[1] -= n; left -= n;
    if (s[1] <= 0) st.slots[i] = null;
  }
  return qty - left;
}
// Room for `qty` of item across a slot range (merge, then empty).
function roomIn(game, st, from, to, item) {
  const max = itemDef(game, item)?.stack ?? 999;
  let room = 0;
  for (let i = from; i < to; i++) { const s = st.slots[i]; if (!s) room += max; else if (s[0] === item) room += max - s[1]; }
  return room;
}
function addIn(game, st, from, to, item, qty) {
  const max = itemDef(game, item)?.stack ?? 999;
  let left = qty;
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (let i = from; i < to && left > 0; i++) {
      const s = st.slots[i];
      if (pass === 0 && s && s[0] === item && s[1] < max) { const n = Math.min(left, max - s[1]); s[1] += n; left -= n; }
      else if (pass === 1 && !s) { const n = Math.min(left, max); st.slots[i] = [item, n]; left -= n; }
    }
  }
  return qty - left;
}

const bump = (st) => { st.ver = (st.ver || 0) + 1; };

function speedOf(game, e, st) {
  const def = stationDef(game, e.kind);
  const base = def?.station?.speed ?? 1;
  const loader = st.loader ? [...game.players.values()].find((p) => p.token === st.loader) : null;
  const ls = loader ? game.stats.of(loader) : null;
  if (isKilnKind(e.kind)) return base * (1 + (ls?.kilnSpeed ?? 0) + (game.stats.world().kilnSpeedWorld ?? 0));
  return base * (1 + (ls?.craftSpeed ?? 0));
}

function pickRecipe(game, e, st) {
  const info = kindInfo(game, e.kind);
  const have = (it) => countIn(st, it);
  if (st.queue.length) {
    const r = game.content.recipes.byId[st.queue[0].r];
    return r && resolveInputs(game, r, have, 1, st.queue[0].use) ? { r, use: st.queue[0].use } : null;   // pinned: wait for its inputs
  }
  for (const r of info.recipes) {
    if (!hasUnlockAll(game, r.unlock.filter((u) => !u.startsWith('level:')), null)) continue;
    if (resolveInputs(game, r, have, 1)) return { r, use: null };
  }
  return null;
}

function setStatus(e, st, status) {
  if (st.status !== status) { st.status = status; bump(st); }
}

function tickStation(game, e, dt) {
  const st = stationState(game, e);
  if (!st) return;
  if (e.data.disabledUntil && e.data.disabledUntil > game.now) { setStatus(e, st, 'disabled'); return; }
  if (!st.cur) {
    const pick = pickRecipe(game, e, st);
    if (!pick) { setStatus(e, st, st.queue.length ? 'need' : 'idle'); if (e.pub.it) e.set('it', 0); if (e.pub.p) e.set('p', 0); return; }
    const { r } = pick;
    const res = resolveInputs(game, r, (it) => countIn(st, it), 1, pick.use);
    const outItem = r.out.item, outQty = res.outQty;
    if (roomIn(game, st, st.outIdx, st.outIdx + st.nOut, outItem) < outQty) { setStatus(e, st, 'full'); return; }
    const fuel = r.fuel ?? 0;
    if (fuel > 0) {
      while (st.meter < fuel && st.fuelIdx >= 0 && st.slots[st.fuelIdx]) {
        const s = st.slots[st.fuelIdx];
        st.meter += fuelOf(game, s[0]);
        s[1] -= 1;
        if (s[1] <= 0) st.slots[st.fuelIdx] = null;
        bump(st);
      }
      if (st.meter < fuel) { setStatus(e, st, 'nofuel'); return; }
      st.meter -= fuel;
    }
    for (const t of res.take) removeIn(st, t.item, t.qty);
    st.cur = { r: r.id, t: 0, dur: Math.max(0.2, (r.time || 1) / speedOf(game, e, st)), out: outItem, qty: outQty, at: game.now };
    setStatus(e, st, 'work');
    bump(st);
    e.set('it', outItem);
  }
  const c = st.cur;
  c.t += dt;
  const p = Math.min(254, Math.max(1, Math.floor((c.t / c.dur) * 255)));
  if (Math.abs((e.pub.p || 0) - p) >= 8) e.set('p', p);
  if (c.t + 1e-9 < c.dur) return;
  // finished: output, XP to the loader, queue bookkeeping
  addIn(game, st, st.outIdx, st.outIdx + st.nOut, c.out, c.qty);
  const head = st.queue[0];
  if (head && head.r === c.r) { head.left -= 1; if (head.left <= 0) st.queue.shift(); }
  const loader = st.loader ? [...game.players.values()].find((pl) => pl.token === st.loader) : null;
  if (loader && !st.byMachine) game.call('grantXp', loader, craftXp(game, c.out, c.qty), 'craft');
  game.bus.emit('item.crafted', { player: loader && !st.byMachine ? loader : null, item: c.out, qty: c.qty, station: e.kind, byMachine: !!st.byMachine || !loader });
  game.fx(e.realm, 'craft_done', e.x, e.y - 0.5, { item: c.out, station: e.kind });
  st.cur = null;
  e.set('p', 0);
  bump(st);
}

function viewOf(game, e, st) {
  return {
    id: e.id, kind: e.kind, slots: st.slots, nIn: st.nIn, fuelIdx: st.fuelIdx, outIdx: st.outIdx, meter: st.meter,
    queue: st.queue.map((q) => ({ r: q.r, left: q.left })), status: st.status ?? 'idle',
    cur: st.cur ? { r: st.cur.r, t: +st.cur.t.toFixed(3), dur: +st.cur.dur.toFixed(3), out: st.cur.out } : null,
    at: +game.now.toFixed(3), maxQueue: stationDef(game, e.kind)?.station?.queue ?? 10,
  };
}

function distinctCap(game, player, kind) {
  if (!isKilnKind(kind)) return DEFAULT_DISTINCT;
  let n = KILN_DISTINCT;
  for (const ef of effectsOf(game, player)) if (ef.id === 'kiln_queue') n = Math.max(n, ef.n ?? 2);
  return n;
}

function findStation(game, player, id) {
  if (!Number.isInteger(id)) return null;
  const e = game.realms.get(player.entity.realm)?.entities.get(id);
  if (!e || !stationDef(game, e.kind)) return null;
  return e;
}

// Fuel items a player carries, cheapest fuel first (keeps magma cores for last).
function playerFuels(game, player) {
  const seen = new Map();
  for (const s of player.inv.slots) if (s && fuelOf(game, s[0]) > 0) seen.set(s[0], (seen.get(s[0]) || 0) + s[1]);
  return [...seen.entries()].sort((a, b) => fuelOf(game, a[0]) - fuelOf(game, b[0]));
}

function loadFuel(game, player, st, unitsWanted, onlyItem = null) {
  if (st.fuelIdx < 0) return 0;
  let units = 0;
  for (const [item, have] of playerFuels(game, player)) {
    if (onlyItem && item !== onlyItem) continue;
    const cur = st.slots[st.fuelIdx];
    if (cur && cur[0] !== item) continue;
    const per = fuelOf(game, item);
    const room = (itemDef(game, item)?.stack ?? 999) - (cur ? cur[1] : 0);
    const n = Math.min(have, room, unitsWanted === Infinity ? have : Math.ceil((unitsWanted - units) / per));
    if (n <= 0) continue;
    game.inv.remove(player.inv, item, n);
    if (cur) cur[1] += n; else st.slots[st.fuelIdx] = [item, n];
    units += n * per;
    if (units >= unitsWanted) break;
  }
  return units;
}

export default {
  name: 'stations',

  init(game) {
    game._stationSet = new Set();
    const isStation = (k) => !!stationDef(game, k);
    game.bus.on('structure.placed', ({ structure }) => { if (isStation(structure.kind)) { stationState(game, structure); game._stationSet.add(structure); } });
    game.bus.on('structure.removed', ({ structure }) => game._stationSet.delete(structure));

    const open = (g, player, e) => {
      const st = stationState(g, e);
      player._view = e.id; player._viewVer = -1;
      g.sendSelf(player, 'ui', { kind: 'station', id: e.id, station: e.kind, n: (player._uiN = (player._uiN || 0) + 1) });
      g.sendSelf(player, 'station', viewOf(g, e, st));
      player._viewVer = st.ver;
      return { ok: true };
    };
    const io = {
      insert(e, itemId, qty, opts = {}) {
        const st = stationState(game, e);
        if (!st || !(qty > 0)) return 0;
        const info = kindInfo(game, e.kind);
        const wantsFuel = opts.slot === 'fuel' || (opts.slot !== 'in' && fuelOf(game, itemId) > 0 && !info.inputs.has(itemId));
        let n = 0;
        if (wantsFuel) {
          if (st.fuelIdx < 0 || fuelOf(game, itemId) <= 0) return 0;
          n = addIn(game, st, st.fuelIdx, st.fuelIdx + 1, itemId, qty);
        } else {
          if (!info.inputs.has(itemId)) return 0;
          n = addIn(game, st, 0, st.nIn, itemId, qty);
        }
        if (n > 0) { st.byMachine = true; bump(st); }
        return n;
      },
      extract(e, filter, max) {
        const st = stationState(game, e);
        if (!st) return null;
        for (let i = st.outIdx; i < st.outIdx + st.nOut; i++) {
          const s = st.slots[i];
          if (!s || (filter && !filter(s[0]))) continue;
          const n = Math.min(max, s[1]);
          s[1] -= n;
          const item = s[0];
          if (s[1] <= 0) st.slots[i] = null;
          bump(st);
          return { item, qty: n };
        }
        return null;
      },
    };
    for (const s of game.content.structures) {
      if (!s.station || s.station.hand) continue;
      game.call('registerInteract', s.id, open);
      game.call('registerIO', s.id, io);
      containerAdapters.set(s.id, (g, e, player) => {
        const st = stationState(g, e);
        if (!st) return null;
        const info = kindInfo(g, e.kind);
        return {
          inv: { slots: st.slots },
          accept: (i, item) => (i < st.nIn ? info.inputs.has(item) : i === st.fuelIdx ? fuelOf(g, item) > 0 : false),
          changed: () => { st.loader = player.token; st.byMachine = false; bump(st); },
          sort: () => {},
        };
      });
    }
  },

  tick(game, dt) {
    if (!game._stationScanned) {
      game._stationScanned = true;
      for (const realm of game.realms.values()) {
        for (const e of realm.entities.values()) if (e.type === 'structure' && stationDef(game, e.kind)) game._stationSet.add(e);
      }
    }
    for (const e of game._stationSet) {
      if (e.removed) { game._stationSet.delete(e); continue; }
      try { tickStation(game, e, dt); } catch (err) { console.error('[tb:stations] station', e.id, err); }
    }
    // push station views to players looking at them
    for (const p of game.players.values()) {
      if (!p._view) continue;
      const e = game.realms.get(p.entity?.realm)?.entities.get(p._view);
      if (!e || e.removed || !inReach(p, e, VIEW_RANGE)) {
        if (e && stationDef(game, e.kind)) game.sendSelf(p, 'ui', { kind: 'close', id: p._view, n: (p._uiN = (p._uiN || 0) + 1) });
        if (!e || stationDef(game, e.kind)) p._view = null;
        continue;
      }
      if (!stationDef(game, e.kind)) continue;
      const st = e.data.st;
      if (st && st.ver !== p._viewVer) { p._viewVer = st.ver; game.sendSelf(p, 'station', viewOf(game, e, st)); }
    }
  },

  handlers: {
    'station.queue': (game, player, d) => {
      const e = findStation(game, player, d.id);
      if (!e) return { ok: false, err: 'invalid' };
      if (!inReach(player, e, 2.5)) return { ok: false, err: 'range' };
      const st = stationState(game, e);
      if (d.cancel !== undefined) {
        if (!isInt(d.cancel, 0, st.queue.length - 1)) return { ok: false, err: 'invalid' };
        st.queue.splice(d.cancel, 1);
        bump(st);
        return { ok: true };
      }
      const r = typeof d.recipe === 'string' ? game.content.recipes.byId[d.recipe] : null;
      if (!r || !kindInfo(game, e.kind).byId.has(r.id)) return { ok: false, err: 'invalid' };
      if (!hasUnlockAll(game, r.unlock, player)) return { ok: false, err: 'locked' };
      const def = stationDef(game, e.kind);
      const queued = st.queue.reduce((a, q) => a + q.left, 0);
      const cap = Math.max(0, (def.station.queue ?? 10) - queued);
      if (cap <= 0) return { ok: false, err: 'full' };
      const use = d.use && typeof d.use === 'object' ? Object.fromEntries(Object.entries(d.use).filter(([, v]) => typeof v === 'string').slice(0, 4)) : undefined;
      // ingredients already in the slots count toward the order
      const have = (it) => game.inv.count(player.inv, it) + countIn(st, it);
      const can = maxCraftable(game, r, have, use, cap);
      if (can <= 0) return { ok: false, err: 'cost' };
      let qty = d.qty === 'max' ? can : isInt(d.qty, 1, 999) ? Math.min(d.qty, can) : 1;
      // load the missing ingredients; shrink the order until everything fits in the input slots
      let plan = null;
      for (; qty > 0; qty--) {
        const res = resolveInputs(game, r, have, qty, use);
        const need = res.take.map((t) => ({ item: t.item, qty: Math.max(0, t.qty - countIn(st, t.item)) })).filter((t) => t.qty > 0);
        // simulate fitting
        const sim = st.slots.map((s) => (s ? [...s] : null));
        const fake = { ...st, slots: sim };
        let fits = true;
        for (const t of need) if (addIn(game, fake, 0, st.nIn, t.item, t.qty) < t.qty) { fits = false; break; }
        if (fits) { plan = need; break; }
      }
      if (!plan) return { ok: false, err: 'full' };
      if (!game.call('takeItems', player, plan)) return { ok: false, err: 'cost' };
      for (const t of plan) addIn(game, st, 0, st.nIn, t.item, t.qty);
      // fuel for the whole order
      let fuelNote = null;
      if ((r.fuel ?? 0) > 0 && st.fuelIdx >= 0) {
        const s = st.slots[st.fuelIdx];
        const have = st.meter + (s ? s[1] * fuelOf(game, s[0]) : 0);
        const want = r.fuel * qty - have;
        if (want > 0) {
          const got = loadFuel(game, player, st, want);
          if (got < want) fuelNote = 'Needs more fuel';
        }
        sendInv(game, player);
      }
      const head = st.queue.find((q) => q.r === r.id);
      if (head) head.left += qty;
      else {
        const distinct = new Set(st.queue.map((q) => q.r)).size;
        if (distinct >= distinctCap(game, player, e.kind)) {
          // replacing the pin: the newest order takes over (ingredients stay in the slots)
          if (isKilnKind(e.kind) && distinct === 1) st.queue.length = 0;
          else return { ok: false, err: 'full' };
        }
        st.queue.push({ r: r.id, left: qty, ...(use ? { use } : {}) });
      }
      st.loader = player.token; st.byMachine = false;
      bump(st);
      if (fuelNote) game.toast(player, fuelNote, 'warn');
      return { ok: true, d: { queued: qty } };
    },

    'station.take': (game, player, d) => {
      const e = findStation(game, player, d.id);
      if (!e) return { ok: false, err: 'invalid' };
      if (!inReach(player, e, 2.5)) return { ok: false, err: 'range' };
      const st = stationState(game, e);
      const self = { inv: player.inv, accept: () => true };
      const src = { inv: { slots: st.slots }, accept: () => false };
      const slots = isInt(d.slot, 0, st.slots.length - 1) ? [d.slot] : Array.from({ length: st.nOut }, (_, i) => st.outIdx + i);
      let moved = 0;
      for (const i of slots) {
        const s = st.slots[i];
        if (!s) continue;
        const item = s[0];
        const n = moveStack(game, src, i, self, -1, 0);
        if (n > 0) { moved += n; if (i >= st.outIdx) { const p = player; (p._gains ||= new Map()).set(item, (p._gains.get(item) || 0) + n); } }
      }
      if (!moved) return { ok: false, err: 'full' };
      bump(st);
      sendInv(game, player);
      return { ok: true, d: { moved } };
    },

    'station.fuel': (game, player, d) => {
      const e = findStation(game, player, d.id);
      if (!e) return { ok: false, err: 'invalid' };
      if (!inReach(player, e, 2.5)) return { ok: false, err: 'range' };
      const st = stationState(game, e);
      if (st.fuelIdx < 0) return { ok: false, err: 'invalid' };
      const item = typeof d.item === 'string' && fuelOf(game, d.item) > 0 ? d.item : null;
      const units = isInt(d.qty, 1, 999) ? d.qty * (item ? fuelOf(game, item) : 1) : Infinity;
      const got = loadFuel(game, player, st, units, item);
      if (!got) return { ok: false, err: 'cost' };
      st.loader = player.token;
      bump(st);
      sendInv(game, player);
      return { ok: true, d: { units: got } };
    },
  },
};
