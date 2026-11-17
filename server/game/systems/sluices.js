// Item logistics (WP8, DESIGN 8.2): Sluices (belts), Splitters, Spillways / Grabber Arms / Filter Arms (movers) and
// Hoppers. Sluice contents are not entities: each Sluice tile is one structure whose public key `it` is the item on it
// (0 when empty), patched only when the item changes; the client slides it along locally at the Sluice speed
// (TECH_SPEC 6.5). Directions: rot 0 = east, 1 = south, 2 = west, 3 = north; movers take from behind, give in front.

import { M, machinesOfType, machineSpeed, isOn, running, want, rt, machineOf, frontTile, backTile, leftTile, rightTile, structAt, typeOf, report, invOf } from './machines.js';

const GAMES = new WeakMap();
const S = (game) => GAMES.get(game);

const isSluice = (game, e) => typeOf(game, e) === 'sluice';

// Does sluice `s` point at tile (tx, ty)? (then it is an input, never an output)
function pointsAt(s, tx, ty) {
  const [fx, fy] = frontTile(s);
  return fx === tx && fy === ty;
}

function setItem(e, item) {
  e.data.item = item;
  e.set('it', item ?? 0);
}

// Deliver one item into whatever stands on (tx, ty): a Sluice (if empty and not pointing back at `from`) or any
// structure with an IO provider. Returns true when the item was accepted.
function deliver(game, realm, from, tx, ty, item, carry = 0) {
  const target = structAt(game, realm, tx, ty);
  if (!target || target === from) return false;
  if (isSluice(game, target)) {
    if (target.data.item || !isOn(game, target)) return false;
    if (from && from.data.tx !== undefined && pointsAt(target, from.data.tx, from.data.ty)) return false;
    setItem(target, item);
    target.data.prog = Math.max(0, Math.min(0.5, carry));
    target.data.movedTick = game.tickCount;
    S(game).moved++;
    return true;
  }
  if (typeOf(game, target) === 'splitter') {
    if (target.data.item) return false;
    setItem(target, item);
    target.data.movedTick = game.tickCount;
    return true;
  }
  return (game.call('insertInto', target, item, 1, {}) || 0) > 0;   // the target's IO decides input vs fuel slot
}

// ---------------------------------------------------------------- sluices

function tickSluices(game, dt) {
  const set = machinesOfType(game, 'sluice');
  if (!set.size) return;
  for (const e of set) {
    if (!e.data.item || e.removed || !isOn(game, e)) continue;
    if (e.data.movedTick === game.tickCount) continue;
    const m = machineOf(game, e);
    e.data.prog = (e.data.prog ?? 0) + m.speed * dt;
    if (e.data.prog < 1) continue;
    const realm = game.realms.get(e.realm);
    const [fx, fy] = frontTile(e);
    if (deliver(game, realm, e, fx, fy, e.data.item, e.data.prog - 1)) { setItem(e, null); e.data.prog = 0; rt(game, e).blocked = false; }
    else { e.data.prog = 1; rt(game, e).blocked = true; }
  }
}

// ---------------------------------------------------------------- splitters (left, right, forward in turn)

function tickSplitters(game) {
  for (const e of machinesOfType(game, 'splitter')) {
    if (!e.data.item || e.removed || !isOn(game, e) || e.data.movedTick === game.tickCount) continue;
    const realm = game.realms.get(e.realm);
    const outs = [leftTile(e), rightTile(e), frontTile(e)];
    const start = e.data.rr ?? 0;
    for (let k = 0; k < 3; k++) {
      const i = (start + k) % 3;
      const [tx, ty] = outs[i];
      const t = structAt(game, realm, tx, ty);
      if (!t || (isSluice(game, t) && pointsAt(t, e.data.tx, e.data.ty))) continue;   // never back into a feeder
      if (deliver(game, realm, e, tx, ty, e.data.item)) {
        setItem(e, null);
        e.data.rr = (i + 1) % 3;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- movers (Spillway, Grabber Arm, Filter Arm)

function moverFilter(game, e) {
  const m = machineOf(game, e);
  if (!m.filter) return null;
  const list = e.data.filter ?? [];
  return (item) => list.includes(item);
}

function tickMovers(game, dt) {
  for (const e of machinesOfType(game, 'mover')) {
    if (e.removed) continue;
    const r = rt(game, e);
    const realm = game.realms.get(e.realm);
    const [bx, by] = backTile(e);
    const [fx, fy] = frontTile(e);
    const src = structAt(game, realm, bx, by);
    const dst = structAt(game, realm, fx, fy);
    if (e.data.hold || (src && dst)) want(game, e);
    const spd = machineSpeed(game, e);
    if (spd <= 0) continue;
    r.acc = (r.acc ?? 0) + spd * dt;
    const m = machineOf(game, e);
    if (r.acc < m.interval) continue;
    r.acc = 0;
    if (!e.data.hold && src && dst) {
      const filt = moverFilter(game, e);
      const got = game.call('extractFrom', src, filt, 1);
      if (got && got.qty > 0) { e.data.hold = { item: got.item, qty: got.qty }; e.set('it', got.item); }
    }
    if (e.data.hold && dst) {
      let left = e.data.hold.qty;
      while (left > 0 && deliver(game, realm, e, fx, fy, e.data.hold.item)) left--;
      e.data.hold.qty = left;
      if (left <= 0) { e.data.hold = null; e.set('it', 0); r.blocked = false; } else r.blocked = true;
    }
  }
}

// ---------------------------------------------------------------- hoppers

function tickHoppers(game) {
  for (const e of machinesOfType(game, 'hopper')) {
    if (e.removed || !isOn(game, e)) continue;
    const realm = game.realms.get(e.realm);
    const m = machineOf(game, e);
    const inv = invOf(e, 'out', m.slots ?? 8);
    const drops = realm.query(e.x, e.y, m.radius ?? 3, [], (d) => d.type === 'drop');
    for (const d of drops) {
      const item = d.pub.it, qty = d.pub.q ?? 1;
      const left = game.inv.add(inv, item, qty);
      if (left === qty) { rt(game, e).blocked = true; continue; }
      want(game, e);
      if (left > 0) d.set('q', left);
      else realm.remove(d);
      game.fx(realm, 'pickup_flash', e.x, e.y);
      e.set('it', item);
    }
  }
}

// ---------------------------------------------------------------- IO providers

function registerIO(game) {
  const sluiceIO = {
    insert(e, item, qty) {
      if (!(qty >= 1) || e.data.item || !isOn(game, e)) return 0;
      setItem(e, item); e.data.prog = 0; e.data.movedTick = game.tickCount;
      S(game).moved++;
      return 1;
    },
    extract(e, filter, max) {
      if (!e.data.item || max < 1 || (filter && !filter(e.data.item))) return null;
      const item = e.data.item;
      setItem(e, null); e.data.prog = 0;
      return { item, qty: 1 };
    },
  };
  const splitterIO = {
    insert(e, item, qty) {
      if (!(qty >= 1) || e.data.item || !isOn(game, e)) return 0;
      setItem(e, item); e.data.movedTick = game.tickCount;
      return 1;
    },
    extract() { return null; },
  };
  const moverIO = { insert() { return 0; }, extract() { return null; } };
  for (const def of game.content.structures) {
    const t = def.machine?.type;
    if (t === 'sluice') game.call('registerIO', def.id, sluiceIO);
    else if (t === 'splitter') game.call('registerIO', def.id, splitterIO);
    else if (t === 'mover') game.call('registerIO', def.id, moverIO);
  }
}

// ---------------------------------------------------------------- system

export default {
  name: 'sluices',

  init(game) {
    GAMES.set(game, { moved: 0, hopAcc: 0 });
    registerIO(game);
    void report;
  },

  tick(game, dt) {
    if (!running(game)) return;
    tickMovers(game, dt);
    tickSplitters(game);
    tickSluices(game, dt);
    const st = S(game);
    st.hopAcc += dt;
    if (st.hopAcc >= 0.5) { st.hopAcc = 0; tickHoppers(game); }
  },

  slowTick(game) {
    const st = S(game);
    if (st.moved > 0) { game.bus.emit('sluice.moved', { count: st.moved }); st.moved = 0; }
  },
};

export { deliver };
