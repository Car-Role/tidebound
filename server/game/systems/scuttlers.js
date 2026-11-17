// Scuttler Burrows (WP8, DESIGN 8.2): Burrows are producers, not harvesters. While at least `need` harvestable nodes
// (tier <= maxTier) stand in radius, a Burrow makes `rate` units/min; with fewer it scales linearly. Each unit is a
// weighted roll over the drop tables of the nodes it counts; 0.5% of units are the rare of the highest-tier node in
// radius. Each node counts toward only one Burrow (the nearest), and nodes are never removed.
// Scuttlers are `helper` entities (kind `scuttler`, at most 3 per Burrow) that only animate: they walk to the
// counted nodes, rummage and carry an item home. Their state id encodes the Burrow's hat: s = base + 16 * hatIndex.

import { STATE } from '../../../shared/protocol.js';
import { BURROW_RARE, SCUTTLER_RATE, SCUTTLER_PLUS_ONE } from '../../../shared/rules/constants.js';
import { createEntity } from '../entities.js';
import { M, machinesOfType, machineSpeed, isOn, running, want, rt, outAdd, machineOf, HATS } from './machines.js';

const GEM_RARE_FALLBACK = { 1: 'glintstone', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' };
const WALK = 2.6;
const ACTIVE_VIEW = 40;
const GAMES = new WeakMap();
const B = (game) => GAMES.get(game);

const tierOf = (n) => Number(n.data?.tier) || 1;

// WP14 (BUILD_REVIEW P0-3): Bred Scuttlers (moon_scuttler) raise the tier cap by the owner's rank.
function burrowMaxTier(game, b, m) {
  let bonus = 0;
  const owner = b.data?.owner;
  if (owner && game.services.has('moonRank')) {
    const p = [...game.players.values()].find((q) => q.token === owner);
    const prof = p ?? (game.profiles?.get?.(owner) ? { profile: game.profiles.get(owner), token: owner } : null);
    try { bonus = Number(game.call('moonRank', prof, 'moon_scuttler')) || 0; } catch { bonus = 0; }
  }
  return (m.maxTier ?? 1) + bonus;
}

// Assign every eligible node to its nearest Burrow (DESIGN 8.2: "nearest Burrow first").
export function assignNodes(game) {
  const burrows = [...machinesOfType(game, 'burrow')].filter((b) => isOn(game, b) && !b.removed);
  const claim = new Map();      // node id -> { b, d2, node }
  for (const b of burrows) {
    const m = machineOf(game, b);
    const nodes = game.call('nodesInRadius', b.realm, b.x, b.y, m.radius, burrowMaxTier(game, b, m)) || [];
    for (const n of nodes) {
      // WP14 (pacing bot finding): gem nodes are not Burrow ground. Counted as a node they made 1/N of ALL output
      // the tier's rare (thousands of magma cores per hour); Burrows give rares only through BURROW_RARE (PACING 5).
      if (n.kind === 'gem_node' || game.content.nodes.byId[n.kind]?.cls === 'gem') continue;
      const d2 = (n.x - b.x) ** 2 + (n.y - b.y) ** 2;
      const cur = claim.get(n.id);
      if (!cur || d2 < cur.d2 || (d2 === cur.d2 && b.id < cur.b.id)) claim.set(n.id, { b, d2, node: n });
    }
  }
  for (const b of machinesOfType(game, 'burrow')) rt(game, b).nodes = [];
  for (const { b, node } of claim.values()) rt(game, b).nodes.push(node);
  return claim.size;
}

export function burrowRate(game, b) {
  const m = machineOf(game, b);
  const nodes = rt(game, b).nodes ?? [];
  const fill = Math.min(1, nodes.length / Math.max(1, m.need));
  return m.rate * fill * SCUTTLER_RATE * machineSpeed(game, b);     // units per minute
}

// One produced unit: 0.5% the rare of the highest-tier counted node, else a weighted roll over their drop tables.
export function rollUnit(game, nodes, rng) {
  if (!nodes.length) return null;
  const gemRare = game.content.modules.nodes?.GEM_RARE ?? GEM_RARE_FALLBACK;
  if (rng.chance(BURROW_RARE)) {
    let t = 1;
    for (const n of nodes) t = Math.max(t, tierOf(n));
    return gemRare[t] ?? 'glintstone';
  }
  const n = rng.pick(nodes);
  const def = game.content.nodes.byId[n.kind];
  if (!def) return null;
  if (n.kind === 'gem_node' || (!def.drops?.length && def.rareOfTier)) return gemRare[tierOf(n)] ?? 'glintstone';
  const table = (def.drops ?? []).map((d) => ({ item: d.item, w: (d.p ?? 1) * ((d.min ?? 1) + (d.max ?? d.min ?? 1)) / 2 }));
  return rng.weighted(table, (x) => x.w)?.item ?? null;
}

function produce(game, b, dt) {
  const st = B(game);
  const r = rt(game, b);
  const nodes = r.nodes ?? [];
  if (!nodes.length || !isOn(game, b)) { r.noInput = nodes.length === 0; return; }
  r.noInput = false;
  want(game, b);
  r.acc = (r.acc ?? 0) + (burrowRate(game, b) / 60) * dt;
  r.blocked = false;
  while (r.acc >= 1) {
    const item = rollUnit(game, nodes, st.rng);
    if (!item) { r.acc = 0; break; }
    if (outAdd(game, b, item, 1) > 0) { r.blocked = true; r.acc = Math.min(r.acc, 1); break; }
    r.acc -= 1;
    r.made = (r.made ?? 0) + 1;
  }
}

// ---------------------------------------------------------------- Scuttler helpers (animation only)

function wantedHelpers(game, b) {
  if (!isOn(game, b) || !(rt(game, b).nodes?.length)) return 0;
  const extra = Math.floor(((game.stats.world().scuttlerRate ?? 0) + 1e-6) / SCUTTLER_PLUS_ONE);
  return Math.min(3, 1 + Math.max(0, extra));
}

function hatIndex(b) { return Math.max(0, HATS.indexOf(b.data.hat ?? 'none')); }

function syncHelpers(game, b) {
  const st = B(game);
  const realm = game.realms.get(b.realm);
  let list = st.helpers.get(b.id) ?? [];
  const n = wantedHelpers(game, b);
  while (list.length > n) { const h = list.pop(); realm.remove(h.e); game.fx(realm, 'summon_puff', h.e.x, h.e.y); }
  while (list.length < n) {
    const e = createEntity(game, { type: 'helper', kind: 'scuttler', x: b.x, y: b.y + 0.8, radius: 0.25, state: STATE.IDLE + 16 * hatIndex(b), pub: { it: 0 } });
    realm.add(e);
    list.push({ e, phase: 'rest', t: st.rng.float(0, 1.5), to: null, item: 0 });
    game.fx(realm, 'summon_puff', e.x, e.y);
  }
  st.helpers.set(b.id, list);
}

function removeHelpers(game, b) {
  const st = B(game);
  const realm = game.realms.get(b.realm);
  for (const h of st.helpers.get(b.id) ?? []) realm?.remove(h.e);
  st.helpers.delete(b.id);
}

function stepHelper(game, realm, b, h, dt) {
  const st = B(game);
  const e = h.e;
  const hat = 16 * hatIndex(b);
  const moveTo = (tx, ty, speed) => {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 0.08) return true;
    const k = Math.min(1, (speed * dt) / d);
    realm.move(e, e.x + dx * k, e.y + dy * k);
    e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 4) : (dy > 0 ? 2 : 6);
    return false;
  };
  const speed = WALK * Math.max(0.4, Math.min(2, machineSpeed(game, b)));
  h.t -= dt;
  switch (h.phase) {
    case 'rest':
      e.state = STATE.IDLE + hat;
      if (h.t <= 0) {
        const nodes = rt(game, b).nodes ?? [];
        const n = nodes.length ? st.rng.pick(nodes) : null;
        if (!n || n.removed) { h.t = 1; break; }
        h.to = { x: n.x + st.rng.float(-0.4, 0.4), y: n.y + 0.55, kind: n.kind };
        h.phase = 'out';
      }
      break;
    case 'out':
      e.state = STATE.MOVE + hat;
      if (moveTo(h.to.x, h.to.y, speed)) { h.phase = 'work'; h.t = 1.2; }
      break;
    case 'work':
      e.state = STATE.ACT + hat;
      if (h.t <= 0) {
        const def = game.content.nodes.byId[h.to.kind];
        const it = def?.drops?.[0]?.item ?? 0;
        e.set('it', it);
        h.phase = 'back';
      }
      break;
    case 'back': {
      e.state = STATE.MOVE + hat;
      if (moveTo(b.x, b.y + 0.7, speed)) { e.set('it', 0); h.phase = 'rest'; h.t = st.rng.float(0.4, 1.6); }
      break;
    }
    default: h.phase = 'rest';
  }
}

function anyPlayerNear(game, x, y, r) {
  for (const p of game.players.values()) {
    const e = p.entity;
    if (e && e.realm === 'overworld' && Math.abs(e.x - x) < r && Math.abs(e.y - y) < r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- system

export default {
  name: 'scuttlers',

  init(game) {
    GAMES.set(game, { rng: game.rng.fork('scuttlers'), helpers: new Map(), assignT: 0 });
    game.bus.on('structure.removed', ({ structure }) => { if (structure?.kind?.startsWith('burrow_')) removeHelpers(game, structure); });
    game.bus.on('machine.registered', ({ machine, type }) => { if (type === 'burrow') B(game).assignT = 1; });
    M(game).viewExtras.push((e) => {
      if (machineOf(game, e)?.type !== 'burrow') return null;
      const m = machineOf(game, e);
      return { nodes: rt(game, e).nodes?.length ?? 0, need: m.need, radius: m.radius, maxTier: m.maxTier, rate: Math.round(burrowRate(game, e) * 10) / 10, baseRate: m.rate, made: rt(game, e).made ?? 0 };
    });
  },

  load(game) {
    const st = B(game);
    st.helpers.clear();
    st.assignT = 1;
  },

  slowTick(game) {
    const st = B(game);
    if (!machinesOfType(game, 'burrow').size) return;
    assignNodes(game);           // nodes come and go (players chop, respawns): re-assign every second
    if (!running(game)) return;
    for (const b of machinesOfType(game, 'burrow')) {
      if (b.removed) continue;
      produce(game, b, 1);
      syncHelpers(game, b);
    }
    st.assignT = 0;
  },

  tick(game, dt) {
    const st = B(game);
    if (!st.helpers.size || !running(game)) return;
    for (const [bid, list] of st.helpers) {
      const b = M(game).list.get(bid);
      if (!b) { st.helpers.delete(bid); continue; }
      if (!anyPlayerNear(game, b.x, b.y, ACTIVE_VIEW)) continue;
      const realm = game.realms.get(b.realm);
      for (const h of list) stepHelper(game, realm, b, h, dt);
    }
  },
};
