// Gull Roosts (WP8, DESIGN 8.2): 4 courier Gulls per Roost carry up to 16 items per trip, anywhere in the overworld,
// from containers tagged Supply to containers tagged Request (a Request names up to 4 items it wants). Tags are set
// with machine.config {id, tag, filter} on a container (Stockpile, Brinelocker, Tidegate site), from the container or
// from any Gull Roost's panel. Gulls are `helper` entities (kind `gull`, pub `it` = carried item) that fly straight at
// 8 tiles/s x Roost speed; they rest on the Roost when idle.

import { STATE } from '../../../shared/protocol.js';
import { createEntity } from '../entities.js';
import { M, machinesOfType, machineSpeed, isOn, running, want, rt, machineOf } from './machines.js';

const GAMES = new WeakMap();
const GU = (game) => GAMES.get(game);
const PERCH = [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.1], [0.6, 0.1]];

function tagged(game, tag) {
  const realm = game.realms.get('overworld');
  const out = [];
  for (const e of realm?.entities.values() ?? []) if (e.type === 'structure' && e.data.gull?.tag === tag) out.push(e);
  return out;
}

function countIn(game, e, item) {
  const inv = game.call('containerOf', e);
  return inv?.slots ? game.inv.count(inv, item) : 0;
}

function spaceIn(game, e, item) {
  const inv = game.call('containerOf', e);
  if (inv?.slots) return game.inv.spaceFor(inv, item);
  return 16;                                  // IO-only targets (Tidegate site): let the delivery decide
}

function ensureGulls(game, roost) {
  const st = GU(game);
  let list = st.gulls.get(roost.id);
  if (list) return list;
  const realm = game.realms.get(roost.realm);
  const n = Math.min(4, machineOf(game, roost).gulls ?? 4);
  list = [];
  for (let i = 0; i < n; i++) {
    const [ox, oy] = PERCH[i];
    const e = createEntity(game, { type: 'helper', kind: 'gull', x: roost.x + ox, y: roost.y + oy, radius: 0.2, state: STATE.IDLE, pub: { it: 0 } });
    realm.add(e);
    list.push({ e, i, phase: 'idle', job: null, carry: null });
  }
  st.gulls.set(roost.id, list);
  return list;
}

function removeGulls(game, roost) {
  const st = GU(game);
  const realm = game.realms.get(roost.realm);
  for (const g of st.gulls.get(roost.id) ?? []) {
    if (g.carry && realm) game.call('dropItem', realm, g.e.x, g.e.y, g.carry.item, g.carry.qty, {});
    realm?.remove(g.e);
  }
  st.gulls.delete(roost.id);
}

// Pick a job: a Request item that some Supply holds, not already being fetched by another Gull.
function findJob(game, roost) {
  const st = GU(game);
  const reqs = tagged(game, 'request');
  const sups = tagged(game, 'supply');
  if (!reqs.length || !sups.length) return null;
  const start = (roost.data.rr ?? 0) % reqs.length;
  for (let k = 0; k < reqs.length; k++) {
    const req = reqs[(start + k) % reqs.length];
    for (const item of req.data.gull.filter ?? []) {
      const key = req.id + ':' + item;
      const space = spaceIn(game, req, item) - (st.reserved.get(key) ?? 0);
      if (space <= 0) continue;
      const sup = sups.find((s) => s !== req && countIn(game, s, item) > 0);
      if (!sup) continue;
      roost.data.rr = (start + k + 1) % reqs.length;
      return { sup: sup.id, req: req.id, item, want: Math.min(machineOf(game, roost).carry ?? 16, space), key };
    }
  }
  return null;
}

function flyTo(game, realm, g, x, y, speed, dt) {
  const e = g.e;
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  e.state = STATE.MOVE;
  if (d < 0.15) return true;
  const k = Math.min(1, (speed * dt) / d);
  realm.move(e, e.x + dx * k, e.y + dy * k);
  e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 4) : (dy > 0 ? 2 : 6);
  return false;
}

function stepGull(game, roost, g, dt) {
  const st = GU(game);
  const realm = game.realms.get(roost.realm);
  const spd = (machineOf(game, roost).speed ?? 8) * Math.min(3, machineSpeed(game, roost));
  if (g.phase !== 'idle') want(game, roost);
  if (spd <= 0 && g.phase !== 'idle') return;
  switch (g.phase) {
    case 'idle': {
      const [ox, oy] = PERCH[g.i];
      if (Math.hypot(g.e.x - roost.x - ox, g.e.y - roost.y - oy) > 0.2) { flyTo(game, realm, g, roost.x + ox, roost.y + oy, Math.max(spd, 4), dt); break; }
      g.e.state = STATE.IDLE;
      break;
    }
    case 'toSupply': {
      const sup = realm.entities.get(g.job.sup);
      if (!sup) { st.reserved.set(g.job.key, Math.max(0, (st.reserved.get(g.job.key) ?? 0) - g.job.want)); g.phase = 'home'; break; }
      if (!flyTo(game, realm, g, sup.x, sup.y - 0.4, spd, dt)) break;
      let got = 0;
      while (got < g.job.want) {
        const r = game.call('extractFrom', sup, (it) => it === g.job.item, g.job.want - got);
        if (!r || !r.qty) break;
        got += r.qty;
      }
      if (got > 0) { g.carry = { item: g.job.item, qty: got }; g.e.set('it', g.job.item); g.phase = 'toRequest'; }
      else { st.reserved.set(g.job.key, Math.max(0, (st.reserved.get(g.job.key) ?? 0) - g.job.want)); g.phase = 'home'; }
      break;
    }
    case 'toRequest': {
      const req = realm.entities.get(g.job.req);
      if (!req) { g.phase = 'return'; break; }
      if (!flyTo(game, realm, g, req.x, req.y - 0.4, spd, dt)) break;
      let left = g.carry.qty;
      const accepted = game.call('insertInto', req, g.carry.item, left, {}) || 0;
      left -= accepted;
      st.reserved.set(g.job.key, Math.max(0, (st.reserved.get(g.job.key) ?? 0) - g.job.want));
      if (accepted > 0) {
        game.bus.emit('gull.delivered', { count: accepted, item: g.carry.item, to: req, roost });
        game.fx(realm, 'pickup_flash', req.x, req.y);
      }
      if (left > 0) { g.carry.qty = left; g.phase = 'return'; }
      else { g.carry = null; g.e.set('it', 0); g.phase = 'home'; }
      break;
    }
    case 'return': {                       // undeliverable remainder goes back to its Supply (or is dropped at the Roost)
      const sup = realm.entities.get(g.job.sup);
      const tx = sup ? sup.x : roost.x, ty = sup ? sup.y - 0.4 : roost.y;
      if (!flyTo(game, realm, g, tx, ty, spd, dt)) break;
      let left = g.carry.qty;
      if (sup) left -= game.call('insertInto', sup, g.carry.item, left, {}) || 0;
      if (left > 0) game.call('dropItem', realm, roost.x, roost.y + 1.2, g.carry.item, left, {});
      g.carry = null; g.e.set('it', 0); g.phase = 'home';
      break;
    }
    case 'home': {
      const [ox, oy] = PERCH[g.i];
      if (flyTo(game, realm, g, roost.x + ox, roost.y + oy, spd, dt)) { g.phase = 'idle'; g.job = null; }
      break;
    }
    default: g.phase = 'home';
  }
}

export default {
  name: 'gulls',

  init(game) {
    GAMES.set(game, { gulls: new Map(), reserved: new Map(), jobT: 0 });
    game.bus.on('structure.removed', ({ structure }) => { if (structure?.kind === 'gull_roost') removeGulls(game, structure); });
    M(game).viewExtras.push((e) => {
      if (machineOf(game, e)?.type !== 'courier') return null;
      const realm = game.realms.get(e.realm);
      const containers = [];
      for (const s of realm?.entities.values() ?? []) {
        if (s.type !== 'structure') continue;
        const def = game.content.structures.byId[s.kind];
        if (!def?.container && s.kind !== 'gate_site') continue;
        containers.push({ id: s.id, kind: s.kind, x: Math.round(s.x), y: Math.round(s.y), tag: s.data.gull?.tag ?? null, filter: s.data.gull?.filter ?? [] });
      }
      const gulls = (GU(game).gulls.get(e.id) ?? []).map((g) => ({ phase: g.phase, item: g.carry?.item ?? null }));
      return { containers: containers.slice(0, 40), gulls };
    });
  },

  load(game) { GU(game).gulls.clear(); GU(game).reserved.clear(); },

  tick(game, dt) {
    const st = GU(game);
    const roosts = machinesOfType(game, 'courier');
    if (!roosts.size || !running(game)) return;
    st.jobT += dt;
    const assign = st.jobT >= 0.5;
    if (assign) st.jobT = 0;
    for (const roost of roosts) {
      if (roost.removed) continue;
      const list = ensureGulls(game, roost);
      for (const g of list) {
        if (assign && g.phase === 'idle' && isOn(game, roost) && machineSpeed(game, roost) > 0) {
          const job = findJob(game, roost);
          if (job) {
            g.job = job; g.phase = 'toSupply';
            st.reserved.set(job.key, (st.reserved.get(job.key) ?? 0) + job.want);
            rt(game, roost).noInput = false;
          }
        }
        stepGull(game, roost, g, dt);
      }
    }
  },
};
