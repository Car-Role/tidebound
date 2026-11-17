// WP14 pacing bot (PACING.md section 10, TECH_SPEC WP14).
//
// A scripted, competent player (or crew of 1..4) driving the REAL server simulation headlessly (test/harness.js,
// no sockets, no browser), in accelerated simulated time, along the critical path up to the Tidegate and the
// Drowned Moon. It reports simulated hours per phase (Beacon telemetry flags written by the game itself) against
// PACING.md section 2, and the total.
//
// What is real (game systems, real data):
//   world generation, node kinds / yields / respawn and per-plot caps, the Tidehook and its tier gate (hitNode with
//   the player's real stats), node XP, level-ups, card drafts (card.pick), skills (skill.buy), class (class.choose),
//   every recipe and its inputs, Kiln fuel, structure costs and placement rules (build.place), land cost and Ballast
//   (land.raise), Beacon attunement and lighting, mob spawning and their loot / Glint / XP (killed through the real
//   damage service), tide caches, main-quest and castaway-line rewards (quest.accept / quest.turnin), shrine
//   rewards, Warden summoning with Lures (boss.summon) and boss loot, Vault cores, Archive donations
//   (archive.donate), Tidegate deliveries (tidegate.deliver), Burrow and Drill production (machines tick for real),
//   co-op scaling (coopScale, respawn, enemy / boss HP).
// What is modelled (time charged, documented in BOT below and in docs/PACING_RESULTS.md):
//   walking = distance / real move speed x BOT.PATH; swinging = hits x real swing interval; station crafts run in
//   parallel "lanes" (one per built station of that kind) with the real recipe time / station speed (the bot does
//   not stand at a Kiln); hand crafts at the Workbench keep the player busy for the recipe time; fights use the
//   stat-based BOT_AUTOBATTLE: time = target HP / (real per-hit damage x real attack rate) x BOT.COMBAT_INEFF, and
//   failed boss attempts when the boss would outlast the player's effective HP; puzzle shrines, Vault rooms and the
//   side-content sources that the harness cannot play (fishing, farming, dig sites, Trench floors) charge fixed
//   minutes per unit taken from PACING 3.5 and then complete through the game's own functions; building layout
//   time (PACING 3.4 "Building", an estimate there too) is charged per placed structure.
//
// Usage: node test/bot/pacing-bot.js [--players N] [--seed S] [--hours H] [--quiet] [--json]
//        import { runPacingBot } from './pacing-bot.js'

import { pathToFileURL } from 'node:url';
import { createHarness } from '../harness.js';
import { PLOT, START_PLOT } from '../../shared/config.js';
import { plotIndex, plotOfTile, inPlotBounds, BIOME_TIER, biomeOf } from '../../shared/grid.js';
import { maxSpeed } from '../../shared/rules/movement.js';
import { TARGET_PHASE_END, PHASE_NAMES, TARGET_CRITICAL, expand, recipeIndex } from '../../shared/rules/pacing.js';
import { solveShrine } from '../../server/game/systems/shrines.js';
import { donate } from '../../server/game/systems/archive.js';
import { acceptQuest, turnInQuest, pq } from '../../server/game/systems/quests.js';
import { craftXp } from '../../server/game/systems/crafting.js';

// ---------------------------------------------------------------- modelled time constants (seconds)
export const BOT = Object.freeze({
  PATH: 1.3,                 // walked distance / straight-line distance
  INTERACT: 2.0,             // per UI interaction (station, NPC, menu)
  PICKUP: 0.6,               // per broken node (collect the burst)
  BUILD_EACH: 45,            // per placed structure (choosing a spot, walking the footprint, re-laying)
  COMBAT_INEFF: 1.6,         // fight time / pure DPS time (approach, dodging telegraphs, repositioning)
  LAND_RATE: 0.35,           // share of enemy attacks a competent player fails to dodge
  SHRINE: 360,               // PACING 3.5: 6 min per shrine
  ROOM: 75,                  // Vault: per non-combat room (walk, puzzle, trap)
  FISH_EACH: 150,            // per fish for the Archive and quests (cast, wait, reel; pity bounds bad luck)
  CROP_EACH: 45,             // per crop item (till, plant, water, harvest; growth overlaps other work)
  RELIC_EACH: 420,           // per relic (find a dig spot, 10 digs)
  TRENCH_FLOOR: 360,         // per Trench floor on the way to floor 10
  SIDE_STEP: 480,            // PACING 3.5: 8 min per castaway step whose goal the harness cannot play
  RESPAWN: 30,               // death penalty
  MAX_BATCH: 20,             // crafts per order
  STORAGE_FREE: 3,           // free inventory slots kept
});

const SKILL_ROUTE = ['F1', 'F2', 'F4', 'F3', 'H1', 'F5', 'F6', 'F8', 'F7', 'T3', 'H4', 'H2', 'H3', 'C1', 'C2', 'C5', 'H6', 'H10', 'F10', 'F11', 'F9', 'F12', 'H11', 'G9', 'H9', 'C6', 'C9', 'H12', 'T2', 'G3', 'G5', 'G4', 'C12'];
const CLASS = 'prospector';

// ---------------------------------------------------------------- world helpers
function makeWorld(h) {
  const g = h.game, C = g.content;
  const W = {
    g, C, h,
    ow: () => g.realms.get('overworld'),
    plot: (px, py) => g.world.plots[plotIndex(px, py)],
    owned: () => g.world.plots.filter((p) => p.owned),
    base: g.spawnPoint(),
    lanes: new Map(),          // station kind -> [busyUntil...] (one per built station)
    pending: [],               // { item, qty, at } station outputs not delivered yet
    reservations: new Map(), stuckRun: 0,
    forced: {},                // modelled completions: what -> count
    log: [],
  };
  // item -> sources
  const src = new Map();
  const addSrc = (item, s) => { if (!src.has(item)) src.set(item, []); src.get(item).push(s); };
  for (const n of C.nodes) for (const d of n.drops ?? []) addSrc(d.item, { type: 'node', kind: n.id, tier: n.tier, cls: n.cls });
  const GEM = C.modules.nodes?.GEM_RARE ?? {};
  for (const [t, item] of Object.entries(GEM)) addSrc(item, { type: 'gem', tier: Number(t) });
  for (const e of C.enemies) for (const l of e.loot ?? []) addSrc(l.item, { type: 'mob', kind: e.id, tier: e.tier, p: l.p ?? 1, night: !!e.night });
  W.sources = src;
  W.recipesFor = new Map();
  for (const r of C.recipes) { if (!W.recipesFor.has(r.out.item)) W.recipesFor.set(r.out.item, []); W.recipesFor.get(r.out.item).push(r); }
  W.groups = C.modules.recipes?.GROUPS ?? {};
  W.stationTiers = C.modules.recipes?.STATION_TIERS ?? {};
  W.stationSpeed = C.modules.recipes?.STATION_SPEED ?? {};
  return W;
}

const structuresOf = (W, kinds) => {
  const set = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  const out = [];
  for (const e of W.ow().entities.values()) if (e.type === 'structure' && set.has(e.kind) && !e.removed) out.push(e);
  return out;
};
const storages = (W) => structuresOf(W, ['stockpile', 'brine_locker']);
const storeCount = (W, item) => {
  let n = 0;
  for (const s of storages(W)) for (const sl of s.data.inv?.slots ?? []) if (sl && sl[0] === item) n += sl[1];
  return n;
};
const pendingCount = (W, item) => W.pending.reduce((a, x) => a + (x.item === item ? x.qty : 0), 0);

// ---------------------------------------------------------------- the agent (one per player)

class Agent {
  constructor(W, p, i) {
    this.W = W; this.p = p; this.i = i;
    this.busyUntil = 0;
    this.t = { walk: 0, gather: 0, craft: 0, combat: 0, build: 0, side: 0, wait: 0, ui: 0 };
    this.task = '';
    this.fails = new Map();
  }
  get g() { return this.W.g; }
  get e() { return this.p.entity; }
  stats() { return this.g.stats.of(this.p); }
  inv(item) { return this.g.call('countItem', this.p, item) || 0; }
  have(item) { return this.inv(item) + storeCount(this.W, item); }
  freeSlots() { return this.p.inv.slots.filter((s) => !s).length; }

  charge(kind, s) { this.t[kind] = (this.t[kind] || 0) + s; return s; }

  walkTo(x, y) {
    const e = this.e;
    if (e.realm !== 'overworld') return 0;
    const d = Math.hypot(e.x - x, e.y - y);
    const realm = this.W.ow();
    let tx = x, ty = y;
    if (!realm.isWalkable(Math.floor(tx), Math.floor(ty))) {
      // stand on the nearest walkable tile around the target
      let best = null;
      for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
        if (realm.isWalkable(Math.floor(x + dx), Math.floor(y + dy))) { best = [Math.floor(x + dx) + 0.5, Math.floor(y + dy) + 0.5]; break; }
      }
      if (best) [tx, ty] = best;
    }
    realm.move(e, tx, ty);
    if (this.p.body) { this.p.body.x = tx; this.p.body.y = ty; this.p.body.vx = 0; this.p.body.vy = 0; }
    // walking 4+ tiles is activity (systems/movement.js rule): it refills Tending of machines near the destination
    if (d >= 4) this.g.markActive(this.p, 'move');
    const speed = maxSpeed(this.stats());
    return this.charge('walk', (d * BOT.PATH) / Math.max(1, speed));
  }

  do(a, d) { return this.W.h.do(this.p, a, d); }
}

// ---------------------------------------------------------------- the bot

export async function runPacingBot(opts = {}) {
  const players = opts.players ?? 1;
  const seed = opts.seed ?? 1;
  const maxHours = opts.maxHours ?? 200;
  const say = opts.quiet ? () => {} : (m) => console.log(m);
  const h = await createHarness({ seed, players: 0 });
  const W = makeWorld(h);
  const g = W.g;
  const agents = [];
  for (let i = 0; i < players; i++) agents.push(new Agent(W, h.addPlayer({ name: 'Bot' + i, color: i, token: `pacing-bot-${seed}-${i}` }), i));
  // The bot reads only action replies: the fake clients keep `res` messages and drop the rest (snapshots, world
  // keys), which the harness would otherwise deep-copy and keep forever (memory, speed).
  for (const c of h.conns) c.send = function (msg) { if (!this.closed && msg?.t === 'res') { this.messages.push(msg); if (this.messages.length > 200) this.messages.splice(0, 100); } };
  if (process.env.TB_BOT_SYSTRACE) {
    const of = g.stats.flush.bind(g.stats);
    g.stats.flush = () => { if (g.playtimeS > Number(process.env.TB_BOT_SYSTRACE) * 3600) console.error('[flush]'); of(); if (g.playtimeS > Number(process.env.TB_BOT_SYSTRACE) * 3600) console.error('[flushed]'); };
    for (const sys of g.systems) for (const fn of ['tick', 'slowTick']) {
      if (typeof sys[fn] !== 'function') continue;
      const orig = sys[fn];
      sys[fn] = function (...args) { if (g.playtimeS > Number(process.env.TB_BOT_SYSTRACE) * 3600) console.error(`[sys] ${sys.name}.${fn}`); return orig.apply(this, args); };
    }
  }
  const t0 = performance.now();
  const notes = [];
  const note = (m) => { if (notes.length > 400) notes.splice(0, 200); notes.push(`[${(g.playtimeS / 3600).toFixed(2)} h] ${m}`); if (opts.verbose) say(notes.at(-1)); };
  W.note = note;

  // ------------------------------------------------------------ time
  const advanceTo = (t) => {
    if (process.env.TB_BOT_TRACE && g.playtimeS > Number(process.env.TB_BOT_TRACE) * 3600) console.error(`[advance] ${g.playtimeS.toFixed(0)} -> ${t.toFixed(0)}`);
    while (g.playtimeS < t - 1e-6) {
      if (g.players.size === 0) { note('all players left the game (' + agents.map((x) => x.p.conn?.closed + ':' + x.p.entity?.realm).join(',') + ')'); throw new Error('no players connected'); }
      const dt = Math.min(1, t - g.playtimeS);
      g.tick(dt);
      deliverPending();
    }
  };
  function deliverPending() {
    if (process.env.TB_BOT_SYSTRACE && g.playtimeS > Number(process.env.TB_BOT_SYSTRACE) * 3600) console.error('[deliver] ' + W.pending.length);
    if (!W.pending.length) return;
    const now = g.playtimeS;
    const ready = W.pending.filter((x) => x.at <= now);
    if (!ready.length) return;
    W.pending = W.pending.filter((x) => x.at > now);
    for (const x of ready) {
      const owner = agents.find((a) => a.p === x.player) ?? agents[0];
      store(owner, x.item, x.qty);
    }
  }
  // put items into shared storage (fallback: the owner's inventory)
  function store(a, item, qty) {
    let left = qty;
    for (const s of storages(W)) { if (left <= 0) break; left -= g.call('insertInto', s, item, left) || 0; }
    if (left > 0) left = g.call('giveItem', a.p, item, left) || 0;
    if (left > 0) { // nowhere to put it: it stays on the ground at the base (counted as lost)
      W.lost = (W.lost || 0) + left;
    }
  }
  // bring qty of item from storage into the inventory (walk to base if needed)
  function fetch(a, item, qty) {
    let need = qty - a.inv(item);
    if (need <= 0) return 0;
    let t = 0, walked = false;
    for (const s of storages(W)) {
      if (need <= 0) break;
      const c = (s.data.inv?.slots ?? []).reduce((n, sl) => n + (sl && sl[0] === item ? sl[1] : 0), 0);
      if (!c) continue;
      if (!walked) { t += a.walkTo(s.x, s.y + 1); walked = true; }
      const got = g.call('extractFrom', s, (x) => x === item, Math.min(c, need));
      const q = got?.qty ?? 0;
      if (q > 0) { g.call('giveItem', a.p, item, q); need -= q; }
    }
    return t + (walked ? a.charge('ui', BOT.INTERACT) : 0);
  }
  // deposit everything not in the keep set
  function deposit(a, keep = new Set()) {
    if (!storages(W).length) return 0;
    let t = a.walkTo(storages(W)[0].x, storages(W)[0].y + 1);
    for (let i = 0; i < a.p.inv.slots.length; i++) {
      const s = a.p.inv.slots[i];
      if (!s) continue;
      const def = g.content.items.byId[s[0]];
      if (keep.has(s[0]) || def?.gear || /^lure_|^vault_key|^tide_token/.test(s[0])) continue;
      const [item, qty] = s;
      let left = qty;
      for (const st of storages(W)) { if (left <= 0) break; left -= g.call('insertInto', st, item, left) || 0; }
      const moved = qty - left;
      if (moved > 0) { g.inv.remove(a.p.inv, item, moved); }
    }
    return t + a.charge('ui', BOT.INTERACT * 2);
  }

  // ------------------------------------------------------------ placement
  function findSpot(a, kind, near = W.base, maxR = 30, filter = null) {
    const realm = W.ow();
    const px0 = a.e.x, py0 = a.e.y;
    realm.move(a.e, near.x + maxR + 3, near.y + maxR + 3);
    try { return findSpotInner(a, kind, near, maxR, filter, realm); } finally { realm.move(a.e, px0, py0); }
  }
  function findSpotInner(a, kind, near, maxR, filter, realm) {
    const cx = Math.floor(near.x), cy = Math.floor(near.y);
    for (let r = 2; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx, ty = cy + dy;
        if ((tx + ty) % 2 !== 0 && kind !== 'sluice_1') continue;   // leave walkways
        if (filter && !filter(tx, ty)) continue;
        const res = g.call('canPlace', kind, realm, tx, ty, a.p);
        if (res?.ok) return { tx, ty };
      }
    }
    return null;
  }
  function place(a, kind, near, filter) {
    const spot = findSpot(a, kind, near, 30, filter);
    if (!spot) return null;
    const def = g.content.structures.byId[kind];
    const fw = def?.w ?? 1, fh = def?.h ?? 1;
    let t = a.walkTo(spot.tx + fw / 2, spot.ty + fh + 1.2);
    // never stand inside the footprint
    const ex = a.e.x, ey = a.e.y;
    if (ex >= spot.tx - 0.5 && ex <= spot.tx + fw + 0.5 && ey >= spot.ty - 0.5 && ey <= spot.ty + fh + 0.5) {
      W.ow().move(a.e, spot.tx + fw / 2, spot.ty + fh + 1.6);
      if (a.p.body) { a.p.body.x = a.e.x; a.p.body.y = a.e.y; }
    }
    const r = a.do('build.place', { kind, tx: spot.tx, ty: spot.ty, rot: 0 });
    if (!r?.ok) { a.fails.set('place:' + kind, (a.fails.get('place:' + kind) || 0) + 1); return { t: t + 1, ok: false, err: r?.err, why: r?.d?.why }; }
    if (g.content.structures.byId[kind]?.station && !g.content.structures.byId[kind].station.hand) {
      const lanes = W.lanes.get(kind) ?? [];
      lanes.push(g.playtimeS);
      W.lanes.set(kind, lanes);
    }
    return { t: t + a.charge('build', BOT.BUILD_EACH), ok: true };
  }

  // ------------------------------------------------------------ unlock helpers
  const unlocked = (a, list) => (list ?? []).every((u) => g.call('hasUnlock', u, a.p));
  const levelLock = (list) => {
    let L = 0;
    for (const u of list ?? []) if (u.startsWith('level:')) L = Math.max(L, Number(u.slice(6)));
    return L;
  };

  // ------------------------------------------------------------ obtaining items
  // Returns null when satisfied, { act: () => seconds } to do now, { wait: reason } when it is coming,
  // or { blocked: reason } when it cannot be made yet.
  function hookMax(a) { return g.call('hookStats', a.p)?.maxNode ?? g.content.items.byId[a.p.gear?.hook ?? 'hook_1']?.gear?.maxNode ?? 1; }

  function stationKinds(station) { return W.stationTiers[station] ?? [station]; }
  function builtStation(station) { return structuresOf(W, stationKinds(station)); }

  function pickRecipe(a, item) {
    const list = W.recipesFor.get(item) ?? [];
    let best = null;
    for (const r of list) {
      if (r.id === 'r_rope_hand' && builtStation('loom').length) continue;
      if (!unlocked(a, r.unlock)) continue;
      if (r.in.some((x) => x.item === item)) continue;
      // station must be buildable now
      if (r.station !== 'hand') {
        const kinds = stationKinds(r.station);
        const sdef = g.content.structures.byId[kinds[0]];
        if (!builtStation(r.station).length && sdef && !unlocked(a, sdef.unlock)) continue;
      }
      // prefer recipes whose inputs we already hold
      const score = r.in.reduce((s, x) => s + (x.item ? Math.min(1, a.have(x.item) / x.qty) : 0.5), 0) - (r.station === 'hand' ? 0 : 0.01);
      if (!best || score > best.score) best = { r, score };
    }
    return best?.r ?? null;
  }

  function groupMember(a, group, qty) {
    const members = Object.keys(W.groups[group] ?? {});
    let best = members.find((m) => a.have(m) >= qty) ?? members.find((m) => a.have(m) > 0);
    if (!best) best = members.find((m) => (W.sources.get(m) ?? []).some((s) => s.type === 'node' && s.tier <= hookMax(a))) ?? members[0];
    return best;
  }

  // obtain() is called recursively through the recipe graph; one decision memoises it (the graph fans out 3-4 ways).
  function obtain(a, item, qty, depth = 0) {
    const key = item + ':' + qty;
    if (W.memo?.has(key)) return W.memo.get(key);
    if (W.memo && W.memo.size > 4000) return { blocked: 'search-limit' };
    const r = obtainInner(a, item, qty, depth);
    W.memo?.set(key, r);
    return r;
  }
  function obtainInner(a, item, qty, depth = 0) {
    const have = a.have(item) + pendingCount(W, item);
    if (have >= qty) {
      if (pendingCount(W, item) > 0 && a.have(item) < qty) { (W.stationWait ||= {})[item] = (W.stationWait[item] || 0) + 1; return { wait: 'station:' + item }; }
      return null;
    }
    if (depth > 9) return { blocked: 'depth:' + item };
    const missing = qty - have;
    // special items
    if (/^vault_core_(\d)$/.test(item)) return vaultTask(a, Number(item.slice(-1)));
    if (/^trophy_/.test(item)) return { blocked: 'trophy' };
    const side = sideSource(item);
    if (side) return sideTask(a, item, missing, side);
    const r = pickRecipe(a, item);
    if (r) return craftTask(a, r, missing, depth);
    return gatherOrHunt(a, item, missing);
  }

  // ------------------------------------------------------------ crafting
  function craftTask(a, r, missing, depth) {
    const outQ = r.out.qty || 1;
    const n = Math.max(1, Math.min(BOT.MAX_BATCH, Math.ceil(missing / outQ)));
    // station
    if (r.station !== 'hand' && !builtStation(r.station).length) return buildTask(a, stationKinds(r.station)[0], depth + 1);
    // inputs
    const use = {};
    for (const x of r.in) {
      const id = x.item ?? groupMember(a, x.group, x.qty);
      if (x.group) use[x.group] = id;
      const need = x.qty * n;
      if (a.have(id) < Math.min(need, x.qty) || (a.have(id) < need && n === 1)) {
        const sub = obtain(a, id, need, depth + 1);
        if (sub) return sub;
      }
    }
    // how many can we make with what we have
    let can = n;
    for (const x of r.in) { const id = x.item ?? use[x.group]; can = Math.min(can, Math.floor(a.have(id) / x.qty)); }
    if (can < Math.ceil(n / 2)) {
      // a competent player fills the order rather than making one at a time
      for (const x of r.in) { const id = x.item ?? use[x.group]; if (a.have(id) < x.qty * n) { const sub = obtain(a, id, x.qty * n, depth + 1); if (sub && sub.act) return sub; } }
    }
    if (can <= 0) {
      for (const x of r.in) { const id = x.item ?? use[x.group]; if (a.have(id) < x.qty) { const sub = obtain(a, id, x.qty * n, depth + 1); if (sub) return sub; } }
      return { blocked: 'inputs:' + r.id };
    }
    const fuelPer = r.fuel ?? 0;
    if (fuelPer > 0) {
      const units = fuelUnits(a);
      if (units < fuelPer * Math.ceil(can / 2)) { const f = obtainFuel(a, fuelPer * can, depth); if (f && (f.act || units < fuelPer)) return f; }
      can = Math.min(can, Math.floor(units / fuelPer));
      if (can <= 0) return obtainFuel(a, fuelPer * n, depth);
    }
    return { act: () => doCraft(a, r, can, use), what: 'craft ' + r.id + ' x' + can };
  }

  const FUELS = ['peat', 'charcoal', 'brimstone'];
  const fuelValue = (id) => g.content.items.byId[id]?.fuel ?? 0;
  function fuelUnits(a) { return FUELS.reduce((s, f) => s + a.have(f) * fuelValue(f), 0); }
  function obtainFuel(a, units, depth) {
    // standing fuel nodes first (peat mounds, brimstone vents), else charcoal from any wood (2 wood -> 2 fuel units)
    for (const [f, per] of [['brimstone', 4], ['peat', 1]]) {
      const kind = f === 'peat' ? 'peat_mound' : 'brimstone_vent';
      const nodes = nodesFor(a, f).filter((e) => e.kind === kind);
      if (nodes.length) { nodes.sort((x, y) => Math.hypot(x.x - a.e.x, x.y - a.e.y) - Math.hypot(y.x - a.e.x, y.y - a.e.y)); return { act: () => gatherNode(a, nodes[0]), what: 'gather ' + f + ' (fuel)' }; }
      void per;
    }
    // no standing vent: once Emberreach is ours, brimstone (4 units each) beats wood (1 unit each)
    if (gatherable(a, 'brimstone')) { const b = gatherOrHunt(a, 'brimstone', Math.ceil(units / 4)); if (b?.act) return b; }
    return obtain(a, 'charcoal', Math.ceil(units / 2) + a.have('charcoal'), depth + 1);
  }
  function takeFuel(a, units) {
    let left = units;
    for (const f of FUELS) {
      if (left <= 0) break;
      const v = fuelValue(f);
      const n = Math.min(a.have(f), Math.ceil(left / v));
      if (n <= 0) continue;
      fetch(a, f, n);
      const m = Math.min(n, a.inv(f));
      if (m > 0) { g.call('takeItems', a.p, [{ item: f, qty: m }]); left -= m * v; }
    }
    return left <= 0;
  }

  function doCraft(a, r, n, use) {
    let t = 0;
    const take = [];
    for (const x of r.in) {
      const id = x.item ?? use[x.group];
      t += fetch(a, id, x.qty * n);
      take.push({ item: id, qty: x.qty * n });
    }
    // group multiplier (tier-k wood gives k planks, ...)
    let outQty = (r.out.qty || 1) * n;
    for (const x of r.in) if (x.group && W.groups[x.group]?.[use[x.group]] > 1) outQty = Math.round(outQty * W.groups[x.group][use[x.group]]);
    if (r.fuel) { if (!takeFuel(a, r.fuel * n)) return t + a.charge('wait', 5); }
    if (!g.call('takeItems', a.p, take)) return t + a.charge('wait', 5);
    if (r.station === 'hand' || g.content.structures.byId[stationKinds(r.station)[0]]?.station?.hand) {
      // hand craft at the Workbench: the player stands there for the whole order
      const bench = builtStation(r.station)[0];
      if (bench) t += a.walkTo(bench.x, bench.y + 1.5);
      const s = a.stats();
      const dur = (r.time || 1) / (1 + (s.craftSpeed ?? 0)) * n;
      store(a, r.out.item, outQty);
      g.call('grantXp', a.p, craftXp(g, r.out.item, outQty), 'craft');
      g.bus.emit('item.crafted', { player: a.p, item: r.out.item, qty: outQty, station: r.station, byMachine: false });
      return t + a.charge('ui', BOT.INTERACT) + a.charge('craft', dur);
    }
    // station lane: the order runs while the player does other work
    const kinds = stationKinds(r.station);
    let bestKind = null, bestI = -1, bestAt = Infinity;
    for (const k of kinds) {
      const built = structuresOf(W, k).length;
      const lanes = W.lanes.get(k) ?? [];
      while (lanes.length < built) lanes.push(0);
      W.lanes.set(k, lanes);
      for (let i = 0; i < built; i++) if (lanes[i] < bestAt) { bestAt = lanes[i]; bestKind = k; bestI = i; }
    }
    const st = structuresOf(W, bestKind)[bestI];
    if (st && !logistics()) t += a.walkTo(st.x, st.y + 1.5);
    const s = a.stats();
    const isKiln = /^kiln/.test(bestKind);
    const speed = (W.stationSpeed[bestKind] ?? g.content.structures.byId[bestKind]?.station?.speed ?? 1) * (1 + (isKiln ? (s.kilnSpeed ?? 0) + (g.stats.world().kilnSpeedWorld ?? 0) : (s.craftSpeed ?? 0)));
    const dur = (r.time || 1) / speed * n;
    const start = Math.max(g.playtimeS + t, W.lanes.get(bestKind)[bestI]);
    W.lanes.get(bestKind)[bestI] = start + dur;
    W.pending.push({ item: r.out.item, qty: outQty, at: start + dur, player: a.p });
    g.call('grantXp', a.p, craftXp(g, r.out.item, outQty), 'craft');
    g.bus.emit('item.crafted', { player: a.p, item: r.out.item, qty: outQty, station: bestKind, byMachine: false });
    return t + a.charge('ui', BOT.INTERACT * 2);
  }

  // ------------------------------------------------------------ gathering
  function gatherable(a, item) {
    return (W.sources.get(item) ?? []).some((s) => (s.type === 'node' && (s.tier === 'biome' || s.tier <= hookMax(a)) && reachableBiome(s)) || (s.type === 'gem' && s.tier <= hookMax(a)));
  }
  function reachableBiome(s) {
    if (s.tier === 'biome') return true;
    const b = g.content.nodes.byId[s.kind]?.biome;
    return W.owned().some((p) => p.biome === b);
  }
  function nodesFor(a, item) {
    const kinds = new Set();
    let gemTier = 0;
    for (const s of W.sources.get(item) ?? []) {
      if (s.type === 'node') kinds.add(s.kind);
      if (s.type === 'gem') gemTier = s.tier;
    }
    const max = hookMax(a);
    const out = [];
    for (const e of W.ow().entities.values()) {
      if (e.type !== 'node' || e.removed || e.data?.tapped) continue;
      const ok = kinds.has(e.kind) || (gemTier && e.kind === 'gem_node' && (e.data?.tier ?? 1) === gemTier);
      if (!ok) continue;
      if ((e.data?.tier ?? 1) > max) continue;
      const { px, py } = plotOfTile(Math.floor(e.x), Math.floor(e.y));
      if (!inPlotBounds(px, py) || !W.plot(px, py)?.owned) continue;
      out.push(e);
    }
    return out;
  }
  function gatherOrHunt(a, item, missing) {
    W.want ||= {};
    if (g.playtimeS - (W.wantAt ?? 0) > 3600) { W.wantAt = g.playtimeS; for (const k of Object.keys(W.want)) W.want[k] *= 0.5; }
    W.want[item] = (W.want[item] || 0) + 1;     // raw demand seen by the planner (drives Burrow placement)
    const nodes = nodesFor(a, item);
    if (nodes.length) {
      const e = a.e;
      nodes.sort((x, y) => Math.hypot(x.x - e.x, x.y - e.y) - Math.hypot(y.x - e.x, y.y - e.y));
      return { act: () => gatherNode(a, nodes[0]), what: 'gather ' + item };
    }
    const srcs = W.sources.get(item) ?? [];
    const mobs = srcs.filter((s) => s.type === 'mob');
    const kinds = new Set(mobs.map((s) => s.kind));
    const live = [...g.mobsLive].some((m) => !m.removed && kinds.has(m.kind) && m.realm === 'overworld');
    if (live) return huntTask(a, mobs, item);
    if (gatherable(a, item)) {
      // the plots are full of other nodes: a competent player clears them to make room for respawns
      // (gem nodes are 3% of respawns in every biome of their tier)
      const biomes = new Set(srcs.filter((x) => x.type === 'node').map((x) => g.content.nodes.byId[x.kind]?.biome));
      for (const x of srcs) if (x.type === 'gem') biomes.add(BIOMES6[x.tier - 1]);
      const any = anyNode(a, biomes);
      if (any) return { act: () => gatherNode(a, any), what: 'clear ' + any.kind + ' (for ' + item + ')' };
      if (!mobs.length) return { wait: 'respawn:' + item };
    }
    if (mobs.length) return huntTask(a, mobs, item);
    return { blocked: 'source:' + item };
  }
  function anyNode(a, biomes = null) {
    const max = hookMax(a);
    let best = null, bd = Infinity;
    const tidalOk = biomes?.has('tidal');
    for (const e of W.ow().entities.values()) {
      if (e.type !== 'node' || e.removed || e.data?.tapped || (e.data?.tier ?? 1) > max) continue;
      if (e.data?.tidal && !tidalOk) continue;   // tidal nodes do not hold a plot's cap
      const { px, py } = plotOfTile(Math.floor(e.x), Math.floor(e.y));
      if (!inPlotBounds(px, py) || !W.plot(px, py)?.owned) continue;
      if (biomes && biomes.size && !biomes.has(W.plot(px, py).biome)) continue;
      const d = Math.hypot(e.x - a.e.x, e.y - a.e.y) + ((e.data?.tier ?? 1) < max ? 30 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function gatherNode(a, node) {
    let t = a.walkTo(node.x, node.y + 0.9);
    const s = a.stats();
    const hook = g.call('hookStats', a.p) ?? { power: 1 };
    const dmg = (hook.power ?? 1) * (1 + (s.gatherPower ?? 0));
    const interval = 1 / (2.0 * (1 + (s.swingSpeed ?? 0)));
    let res = null, hits = 0;
    for (; hits < 400 && !node.removed; hits++) {
      res = g.call('hitNode', node, dmg, { player: a.p, collect: true });
      if (res?.broken) { hits++; break; }
    }
    for (const d of res?.drops ?? []) {
      W.ru = (W.ru || 0) + d.qty;
      const left = g.call('giveItem', a.p, d.item, d.qty) || 0;
      if (d.qty - left > 0) g.bus.emit('item.pickup', { player: a.p, item: d.item, qty: d.qty - left });
    }
    // sweep drops that procs spawned on the ground nearby
    const realm = W.ow();
    for (const d of realm.query(node.x, node.y, 3, [], (x) => x.type === 'drop')) {
      g.call('giveItem', a.p, d.pub.it, d.pub.q);
      realm.remove(d);
    }
    if (a.freeSlots() < BOT.STORAGE_FREE) t += deposit(a);
    return t + a.charge('gather', hits * interval + BOT.PICKUP);
  }

  // ------------------------------------------------------------ combat (BOT_AUTOBATTLE)
  function weaponHit(a) {
    const ws = g.call('weaponStats', a.p);
    const r = g.call('rollPlayerDamage', a.p, ws.dmg * (ws.favouredMult ?? 1), { wtype: ws.wtype });
    const rate = (ws.rate || 1) * (1 + (a.stats().swingSpeed ?? 0));
    return { amount: r.amount, crit: r.crit, rate, element: ws.element };
  }
  // Kill one hostile through the real damage service. Returns seconds spent (or -1 if it cannot be hurt).
  function fight(a, target, { boss = false } = {}) {
    let t = 0, hits = 0, zero = 0, stalls = 0;
    const hpStart = target.hp;
    const t0w = performance.now();
    while (!target.removed && target.hp > 0 && hits < 6000 && performance.now() - t0w < 4000) {
      const w = weaponHit(a);
      if (process.env.TB_BOT_TRACE && boss && hits % 50 === 0) console.error(`[fight] ${target.kind} hp ${Math.round(target.hp)} hits ${hits} zero ${zero} stalls ${stalls}`);
      const dealt = g.call('damage', target, w.amount, { source: a.e, crit: w.crit, element: w.element, melee: true });
      hits++;
      t += 1 / w.rate;
      if (!(dealt > 0)) { zero++; if (zero > 40) { g.tick(1); t += 1; zero = 0; stalls = (stalls || 0) + 1; if (!boss || stalls > 30) break; } }
      if (boss && hits % 20 === 0) g.tick(0.05);   // let phase scripts run
    }
    if (!target.removed && target.hp > 0 && target.hp >= hpStart) return -1;
    // incoming damage while fighting: enemy dmg x attack rate x time x LAND_RATE, after armor
    const dmg = (target.data?.dmg ?? 5) * (target.data?.atkRate ?? 1 / 1.6);
    const armor = a.stats().armor ?? 0;
    const taken = dmg * t * BOT.COMBAT_INEFF * BOT.LAND_RATE * (100 / (100 + armor));
    return t * BOT.COMBAT_INEFF + Math.max(0, taken - (a.stats().hpRegen ?? 0.5) * t) / Math.max(1, a.stats().maxHp ?? 100) * 20;
  }
  function sweepDrops(a, realm, x = null, y = null, r = Infinity) {
    for (const d of [...realm.entities.values()]) {
      if (d.type !== 'drop' || d.removed) continue;
      if (x != null && Math.hypot(d.x - x, d.y - y) > r) continue;
      const owner = d.data?.owner;
      if (owner && owner !== a.p.id && agents.some((o) => o.p.id === owner)) continue;
      g.call('giveItem', a.p, d.pub.it, d.pub.q);
      g.bus.emit('item.pickup', { player: a.p, item: d.pub.it, qty: d.pub.q });
      realm.remove(d);
    }
  }
  function hostilesNear(a, r) {
    const realm = g.realms.get(a.e.realm);
    if (!realm) return [];
    return realm.query(a.e.x, a.e.y, r, [], (m) => (m.type === 'mob' || m.type === 'boss') && !m.removed && m.hp > 0 && m.data?.team !== 'player');
  }
  function defend(a) {
    let t = 0;
    for (const m of hostilesNear(a, 9)) {
      if (m.type === 'boss') continue;
      t += a.walkTo(m.x, m.y + 0.8);
      const s = fight(a, m);
      if (s > 0) t += a.charge('combat', s);
      sweepDrops(a, W.ow(), m.x, m.y, 4);
    }
    return t;
  }
  function huntTask(a, mobSrcs, item) {
    // stand on an owned plot of the enemy's biome; mobs spawn around the player and are killed as they come
    const biomes = new Set(mobSrcs.map((s) => g.content.enemies.byId[s.kind]?.biome));
    const kinds = new Set(mobSrcs.map((s) => s.kind));
    const live = [...g.mobsLive].filter((m) => !m.removed && kinds.has(m.kind) && m.realm === 'overworld');
    if (live.length) {
      live.sort((x, y) => Math.hypot(x.x - a.e.x, x.y - a.e.y) - Math.hypot(y.x - a.e.x, y.y - a.e.y));
      const m = live[0];
      return { act: () => { const t = a.walkTo(m.x, m.y + 0.8); const s = fight(a, m); sweepDrops(a, W.ow(), m.x, m.y, 4); return t + a.charge('combat', Math.max(1, s)); }, what: 'hunt ' + m.kind + ' for ' + item };
    }
    const plots = W.owned().filter((p) => biomes.has(p.biome) && p.feature !== 'start');
    if (!plots.length) return { blocked: 'hunt-biome:' + item };
    // pick the owned plot of that biome with the most unowned / wild neighbours (spawns need room)
    const p = plots[(Math.floor(g.playtimeS / 300) + a.i) % plots.length];
    return { act: () => { const t = a.walkTo(p.px * PLOT + 10, p.py * PLOT + 10); return t + a.charge('combat', 20); }, what: 'wait for ' + [...kinds].join('/') };
  }

  // ------------------------------------------------------------ building
  function buildTask(a, kind, depth = 0, near = W.base, filter = null) {
    const def = g.content.structures.byId[kind];
    if (!def) return { blocked: 'nodef:' + kind };
    if (!unlocked(a, def.unlock)) return { blocked: 'locked:' + kind };
    const lines = [];
    for (const c of def.cost ?? []) {
      let id = c.item;
      if (!id && c.group === 'rare_plot_tier') id = g.content.modules.items?.TIER_MATS?.[BIOME_TIER[W.plot(...Object.values(plotOfTile(Math.floor(near.x), Math.floor(near.y))))?.biome] ?? 1]?.rare;
      if (!id) continue;
      lines.push({ id, q: Math.ceil(c.qty * (def.world ? g.call('coopScale') : 1)) });
    }
    for (const l of lines) { const sub = obtain(a, l.id, l.q, depth + 1); if (sub) return sub; }
    return {
      act: () => {
        let t = 0;
        for (const l of lines) t += fetch(a, l.id, l.q);
        const r = place(a, kind, near, filter);
        if (!r) { a.fails.set('nospot:' + kind, (a.fails.get('nospot:' + kind) || 0) + 1); if (a.fails.get('nospot:' + kind) % 50 === 1) note('no spot for ' + kind + ' near ' + Math.round(near.x) + ',' + Math.round(near.y) + ': ' + JSON.stringify(g.call('canPlace', kind, W.ow(), Math.floor(near.x) + 1, Math.floor(near.y) + 1, a.p))); return t + a.charge('wait', 10); }
        if (!r.ok) note(`place ${kind} failed: ${r.err} ${r.why ?? ''}`);
        return t + r.t;
      },
      what: 'build ' + kind,
    };
  }

  // ------------------------------------------------------------ side content (modelled sources)
  const FISH = new Set(g.content.fish.map((f) => f.id));
  const CROPS = new Set(g.content.crops.map((c) => c.id));
  function sideSource(item) {
    if (FISH.has(item)) return { kind: 'fish', each: BOT.FISH_EACH * (g.content.fish.find((f) => f.id === item)?.rarity === 'legendary' ? 6 : g.content.fish.find((f) => f.id === item)?.rarity === 'rare' ? 2 : 1) };
    if (CROPS.has(item) || item === 'moonpetal') return { kind: 'crop', each: BOT.CROP_EACH };
    if (/^relic_\d+$/.test(item) || item === 'relic_fragment') return { kind: 'relic', each: BOT.RELIC_EACH };
    return null;
  }
  function sideTask(a, item, n, src) {
    const q = Math.min(n, src.kind === 'crop' ? 10 : 1);
    return {
      act: () => {
        W.forced[src.kind] = (W.forced[src.kind] || 0) + q;
        store(a, item, q);
        if (src.kind === 'fish') g.bus.emit('fish.caught', { player: a.p, fish: item, rarity: g.content.fish.find((f) => f.id === item)?.rarity });
        if (src.kind === 'crop') g.bus.emit('crop.harvested', { player: a.p, crop: item, qty: q, byMachine: false });
        return a.charge('side', src.each * q);
      },
      what: `${src.kind} ${item} x${q}`,
    };
  }

  // ------------------------------------------------------------ Vaults and Wardens
  function vaultTask(a, k) {
    if (g.world.flags['vault:' + k] && a.have('vault_core_' + k) < 1 && !(a.p.dungeon?.clears?.[k])) {
      // someone else cleared; the core drops per player on first clear: go in again
    }
    const ent = structuresOf(W, 'vault_entrance').find((e) => e.data?.k === k);
    if (!ent) return { blocked: 'vault-plot:' + k };
    // gear check: the hook of this tier at least
    if (hookMax(a) < k) return { blocked: 'hook<' + k };
    const entered = !!a.p.dungeon?.entered?.[k];
    if (entered && a.have('vault_key_' + k) < 1) {
      const sub = obtain(a, 'vault_key_' + k, 1);
      if (sub) return sub;
    }
    return { act: () => runVault(a, ent, k), what: 'vault ' + k };
  }
  function runVault(a, ent, k) {
    if (a.have('vault_key_' + k) > 0) fetch(a, 'vault_key_' + k, 1);
    let t = a.walkTo(ent.x, ent.y + (ent.data?.h ?? 2) / 2 + 0.8);
    W.ow().move(a.e, ent.x, ent.y + (ent.data?.h ?? 2) / 2 + 0.8);   // the doorway itself
    const r = a.do('dungeon.enter', { id: ent.id });
    if (!r?.ok) { note(`vault ${k} enter failed: ${r?.err}`); return t + a.charge('wait', 30); }
    let inst = g.instances.get(a.e.realm);
    if (!inst) return t + 5;
    let guard = 0, idleRounds = 0;
    const startCore = a.have('vault_core_' + k);
    const moveIn = (x, y) => {
      const d = Math.hypot(a.e.x - x, a.e.y - y);
      inst.realm.move(a.e, x, y);
      if (a.p.body) { a.p.body.x = x; a.p.body.y = y; a.p.body.vx = 0; a.p.body.vy = 0; }
      t += a.charge('walk', d * BOT.PATH / maxSpeed(a.stats()));
    };
    while (!inst.cleared && guard++ < 250) {
      inst = g.instances.get(a.e.realm) ?? inst;
      const rooms = inst.rooms ?? [];
      const room = rooms.find((rm) => rm.state === 'active') ?? rooms.find((rm) => rm.state !== 'cleared' && rm.type !== 'start');
      if (room) moveIn(room.cx, room.cy);
      else {
        // floor done: take the stairs
        const stairs = [...inst.realm.entities.values()].find((e) => e.type === 'structure' && e.kind === 'vault_stairs');
        if (stairs) { moveIn(stairs.x, stairs.y + 0.8); a.do('use', { id: stairs.id }); t += a.charge('ui', BOT.INTERACT); g.tick(0.5); continue; }
      }
      for (let i = 0; i < 4; i++) g.tick(0.5);
      const foes = hostilesNear(a, 60);
      if (process.env.TB_BOT_TRACE) console.error(`[vault] g${guard} f${inst.floor} ${(inst.rooms ?? []).map((r) => r.type[0] + r.state[0]).join('')} foes ${foes.map((m) => m.kind + ':' + Math.round(m.hp)).join(',')} me ${Math.round(a.e.hp)} ${a.e.realm}`);
      if (foes.length) {
        idleRounds = 0;
        for (const m of foes) { if (m.type !== 'boss') moveIn(m.x, m.y + 0.8); const s2 = fight(a, m, { boss: m.type === 'boss' }); t += a.charge('combat', s2 > 0 ? s2 : 2); }
        g.tick(0.5);
        sweepDrops(a, inst.realm);
      } else if (room && ++idleRounds >= 3) {
        // puzzle / trap / treasure rooms: modelled time, then the room opens
        if (room.state !== 'cleared' && !['combat', 'stairs', 'keeper'].includes(room.type)) { room.state = 'cleared'; t += a.charge('side', BOT.ROOM); W.forced.rooms = (W.forced.rooms || 0) + 1; }
        idleRounds = 0;
      }
      if (a.e.hp <= 0 || a.e.state === 5 || a.e.state === 4) { g.call('revivePlayer', a.p, { hpFrac: 1 }); t += a.charge('combat', BOT.RESPAWN); }
    }
    if (!inst.cleared) {
      note(`vault ${k}: room script did not finish, completed as modelled`);
      W.forced.vault = (W.forced.vault || 0) + 1;
      g.world.flags['vault:' + k] = true;
      g.call('giveItem', a.p, 'vault_core_' + k, 1);
      g.bus.emit('vault.cleared', { k, participants: [a.p], seconds: 1800, first: true, firstFor: [a.p.id] });
      t += a.charge('combat', 1800);
    }
    // loot left on the floor (cores, chests)
    const TR = (m) => { if (process.env.TB_BOT_TRACE) console.error('[vault-end] ' + m); };
    TR('sweep');
    sweepDrops(a, inst.realm);
    TR('chests');
    for (const c of [...inst.realm.entities.values()].filter((e) => e.type === 'chest')) { a.do('use', { id: c.id }); }
    TR('leave');
    if (a.have('vault_core_' + k) <= startCore && !g.call('countItem', a.p, 'vault_core_' + k)) {
      // first-clear core goes to the player in the real code; if it was missed, note it
      note(`vault ${k}: no core picked up (cleared ${inst.cleared}, floor ${inst.floor}, guard ${guard}, rooms ${(inst.rooms ?? []).map((r) => r.type[0] + r.state[0]).join('')}, drops ${[...inst.realm.entities.values()].filter((e) => e.type === 'drop').length}, clears ${JSON.stringify(a.p.dungeon?.clears)})`);
    }
    a.do('dungeon.leave', {});
    TR('left ' + a.e.realm);
    if (a.e.realm !== 'overworld') g.movePlayer(a.p, 'overworld', ent.x, ent.y + 2);
    return t;
  }
  function wardenTask(a, k) {
    const boss = ['thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir'][k - 1];
    if (g.world.flags['boss:' + boss]) return null;
    const arena = W.owned().find((p) => p.feature === 'arena' && p.biome === BIOMES6[k - 1]);
    if (!arena) return { blocked: 'arena:' + k };
    if (hookMax(a) < k) return { blocked: 'gear' };
    const sub = obtain(a, 'lure_' + k, 1);
    if (sub) return sub;
    return { act: () => runWarden(a, k, arena, boss), what: 'warden ' + boss };
  }
  function runWarden(a, k, arena, boss) {
    let t = a.walkTo(arena.px * PLOT + 10, arena.py * PLOT + 12);
    t += fetch(a, 'lure_' + k, 1);
    const r = a.do('boss.summon', { lure: 'lure_' + k });
    if (!r?.ok) {
      // stand on the arena feature itself
      const f = g.call('featureAt', 'overworld', arena.px * PLOT + 10, arena.py * PLOT + 10);
      note(`summon ${boss} failed: ${r?.err} (feature ${f?.feature})`);
      return t + a.charge('wait', 30);
    }
    const b = g.bossesLive ? [...g.bossesLive].find((x) => x.id === r.d.id) : null;
    if (!b) return t + 5;
    // attempts: the fight is lost when it outlasts the player's effective HP
    const st = a.stats();
    const w = weaponHit(a);
    const dps = w.amount * w.rate;
    const fightS = b.hp / Math.max(0.1, dps) * BOT.COMBAT_INEFF;
    const inDps = (b.data?.dmg ?? 20) * 0.6 * BOT.LAND_RATE * (100 / (100 + (st.armor ?? 0)));
    const surviveS = ((st.maxHp ?? 100) * 2.5) / Math.max(0.1, inDps);   // with food and dodges
    const attempts = Math.min(6, Math.max(1, Math.ceil(fightS / surviveS)));
    if (attempts > 1) t += a.charge('combat', (attempts - 1) * (surviveS + BOT.RESPAWN + 60));
    const s = fight(a, b, { boss: true });
    t += a.charge('combat', s > 0 ? s : fightS);
    g.tick(0.5);
    sweepDrops(a, W.ow(), b.x, b.y, 16);
    W.attempts = (W.attempts || 0) + attempts;
    return t;
  }

  // ------------------------------------------------------------ castaway lines and shrines
  function lineTask(a, biome) {
    for (const npc of g.content.npcs.filter((n) => n.biome === biome)) {
      if (g.call('lineDone', npc.id)) continue;
      const ent = [...W.ow().entities.values()].find((e) => e.type === 'npc' && e.kind === npc.id);
      if (!ent) continue;
      const d = pq(a.p);
      const active = npc.quests.find((q) => d.active[q]);
      const next = npc.quests.find((q) => !d.done.includes(q));
      if (!next) continue;
      if (!active) return { act: () => { const t = a.walkTo(ent.x, ent.y + 1); acceptQuest(g, a.p, next, { force: true }); return t + a.charge('ui', BOT.INTERACT * 3); }, what: 'accept ' + next };
      const q = g.content.quests.byId[active];
      const inst = d.active[active];
      for (let i = 0; i < q.goals.length; i++) {
        const goal = q.goals[i];
        const sub = goalTask(a, q, inst, goal, i, ent);
        if (sub) return sub;
      }
      return {
        act: () => {
          let t = a.walkTo(ent.x, ent.y + 1);
          for (const goal of q.goals) if (goal.kind === 'deliver') for (const id of [].concat(goal.target)) t += fetch(a, id, goal.n);
          const r = turnInQuest(g, a.p, active, { force: true });
          if (!r.ok) { note(`turn-in ${active} failed: ${r.err}`); a.fails.set(active, (a.fails.get(active) || 0) + 1); if (a.fails.get(active) > 3) forceGoals(a, q, inst); }
          return t + a.charge('ui', BOT.INTERACT * 3);
        },
        what: 'turn in ' + active,
      };
    }
    return null;
  }
  // A goal the harness cannot play: count it as done through the quest's own progress (instance goals become
  // progress-tracked; deliveries stay real because turn-in takes q.goals deliveries).
  function forceGoal(inst, q, i) {
    inst.goals = (inst.goals ?? q.goals).map((gl, j) => (j === i && gl.kind !== 'deliver' ? { ...gl, kind: 'modelled' } : gl));
    inst.prog[i] = q.goals[i].n;
  }
  function forceGoals(a, q, inst) {
    W.forced['quest:' + q.id] = 1;
    for (let i = 0; i < q.goals.length; i++) forceGoal(inst, q, i);
  }
  function goalTask(a, q, inst, goal, i, ent) {
    const have = Math.min(goal.n, questHave(a, q, inst, i));
    if (have >= goal.n) return null;
    const targets = [].concat(goal.target ?? []);
    switch (goal.kind) {
      case 'deliver': {
        const id = targets.find((x) => a.have(x) > 0) ?? targets[0];
        return obtain(a, id, goal.n);
      }
      case 'craft': {
        const id = targets[0];
        const sub = obtain(a, id, a.have(id) + 1);
        return sub ?? { blocked: 'craft-count' };
      }
      case 'build': {
        const kind = targets[0];
        // spread over owned plots (Waystones: one per plot), plots without one first
        const inPlot = (p, e) => Math.floor(e.x / PLOT) === p.px && Math.floor(e.y / PLOT) === p.py;
        const plots = W.owned().filter((p) => (!goal.biome || p.biome === goal.biome) && !['vault', 'arena'].includes(p.feature));
        const free = plots.filter((p) => !structuresOf(W, targets).some((e) => inPlot(p, e)));
        const nf = a.fails.get('nospot:' + kind) || 0;   // a plot without buildable ground: try the next one
        const p = free.length ? free[nf % free.length] : plots[(have + a.i + nf) % Math.max(1, plots.length)];
        if (!p) return { blocked: 'build-biome' };
        return buildTask(a, kind, 0, plotCenter(p), (tx, ty) => Math.floor(tx / PLOT) === p.px && Math.floor(ty / PLOT) === p.py);
      }
      case 'kill': {
        const srcs = targets.map((k) => ({ type: 'mob', kind: k }));
        return huntTask(a, srcs, 'quest');
      }
      case 'raise': {
        // raised after accepting: the main path raises the next plot; if this biome has none left, any open plot
        for (const b of BIOMES6) { const r = g.call('attunement', BIOME_TIER[b])?.lit || b === 'greenmarrow' || g.world.flags['beacon:' + (BIOME_TIER[b] - 1)] ? raiseTask(a, b) : null; if (r) return r; }
        return { act: () => { forceGoal(inst, q, i); W.forced['goal:raise'] = (W.forced['goal:raise'] || 0) + 1; return a.charge('side', 60); }, what: 'no plot to raise for ' + q.id };
      }
      default: {
        // catch, collect, kill_elite, solve, temper, reach, donate, counter: modelled step (PACING 3.5, 8 min)
        return { act: () => { forceGoal(inst, q, i); W.forced['goal:' + goal.kind] = (W.forced['goal:' + goal.kind] || 0) + 1; const t = a.walkTo(ent.x, ent.y + 1); return t + a.charge('side', BOT.SIDE_STEP); }, what: `modelled ${goal.kind} for ${q.id}` };
      }
    }
  }
  function questHave(a, q, inst, i) {
    const goal = q.goals[i];
    if (goal.kind === 'deliver') return Math.max(...[].concat(goal.target).map((x) => a.have(x)));
    if (goal.kind === 'build') {
      const kinds = [].concat(goal.target);
      return structuresOf(W, kinds).filter((s) => !goal.biome || W.plot(...Object.values(plotOfTile(Math.floor(s.x), Math.floor(s.y))))?.biome === goal.biome).length;
    }
    return inst.prog?.[i] ?? 0;
  }
  const plotCenter = (p) => (p ? { x: p.px * PLOT + 10, y: p.py * PLOT + 10 } : null);
  function shrineTask(a, biome) {
    for (const p of W.owned().filter((x) => x.biome === biome && x.feature === 'shrine')) {
      if (g.world.flags[`shrine:${p.px},${p.py}`]) continue;
      const sh = [...W.ow().entities.values()].find((e) => e.type === 'structure' && e.kind === 'shrine' && e.data?.px === p.px && e.data?.py === p.py)
        ?? W.ow().query(p.px * PLOT + 10, p.py * PLOT + 10, 14, [], (e) => e.type === 'structure' && e.kind === 'shrine')[0];
      if (!sh) continue;
      return { act: () => { const t = a.walkTo(sh.x, sh.y + 2); solveShrine(g, sh, a.p); W.forced.shrine = (W.forced.shrine || 0) + 1; return t + a.charge('side', BOT.SHRINE); }, what: 'shrine ' + p.px + ',' + p.py };
    }
    return null;
  }

  // ------------------------------------------------------------ plots
  const BIOMES6 = ['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
  function nextPlot(biome) {
    const cands = g.world.plots.filter((p) => !p.owned && p.biome === biome && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inPlotBounds(p.px + dx, p.py + dy) && W.plot(p.px + dx, p.py + dy).owned));
    // features with work first (castaway, vault, arena, shrine), then the rest
    const pri = { castaway: 0, vault: 1, arena: 2, shrine: 3, archive: 1, gate_site: 1, vein: 4 };
    cands.sort((x, y) => (pri[x.feature] ?? 5) - (pri[y.feature] ?? 5));
    return cands[0] ?? null;
  }
  function raiseTask(a, biome) {
    const p = nextPlot(biome);
    if (!p) return null;
    const cost = g.call('landCostNext');
    const bal = g.call('ballastFor', p.px, p.py);
    const sub = obtain(a, bal.item, bal.qty);
    if (sub) return sub;
    if ((g.world.glint || 0) < cost.glint) return { glint: cost.glint };
    return {
      act: () => {
        const t = fetch(a, bal.item, bal.qty);
        const r = a.do('land.raise', { px: p.px, py: p.py });
        if (!r?.ok) note(`raise ${p.px},${p.py} failed: ${r?.err} ${r?.d?.why}`);
        return t + a.charge('ui', BOT.INTERACT * 2);
      },
      what: `raise ${p.px},${p.py} (${biome})`,
    };
  }

  // ------------------------------------------------------------ gear
  const BEST = (slot, maxTier) => {
    const cands = g.content.items.filter((it) => it.gear?.slot === slot && (it.gear.wtype ? it.gear.wtype === 'blade' : true) && (it.tier ?? 1) <= maxTier).sort((x, y) => (y.tier ?? 0) - (x.tier ?? 0));
    return cands[0]?.id;
  };
  function equipBest(a) {
    let t = 0;
    for (let i = 0; i < a.p.inv.slots.length; i++) {
      const s = a.p.inv.slots[i];
      if (!s) continue;
      const def = g.content.items.byId[s[0]];
      const slot = def?.gear?.slot;
      if (!slot || slot === 'trinket' || slot === 'rod') continue;
      const cur = g.content.items.byId[a.p.gear?.[slot]];
      if (!cur || (def.tier ?? 0) > (cur.tier ?? 0)) { const r = a.do('gear.equip', { slot: i }); if (r?.ok) t += 1; }
    }
    // trinkets: fill empty trinket slots
    for (let i = 0; i < a.p.inv.slots.length; i++) {
      const s = a.p.inv.slots[i];
      if (s && g.content.items.byId[s[0]]?.gear?.slot === 'trinket') a.do('gear.equip', { slot: i });
    }
    return t;
  }
  function gearTask(a, k) {
    // hook k (from Vault k-1), blade k (the bar of tier k-1), armour k-1 (PACING 3.3 "gear")
    const wantHook = 'hook_' + k;
    if (k >= 2 && hookMax(a) < k) {
      if (a.have(wantHook)) { if (!a.inv(wantHook)) return { act: () => fetch(a, wantHook, 1) + equipBest(a) + 1, what: 'fetch ' + wantHook }; }
      else { const sub = obtain(a, wantHook, 1); if (sub) return sub; }
    }
    for (const id of [k >= 2 ? 'blade_' + k : 'blade_1', ...(k >= 2 ? ['helm_' + (k - 1), 'coat_' + (k - 1), 'boots_' + (k - 1)] : [])]) {
      const def = g.content.items.byId[id];
      const slot = def?.gear?.slot;
      const cur = g.content.items.byId[a.p.gear?.[slot]];
      if (cur && (cur.tier ?? 0) >= def.tier) continue;
      if (a.have(id)) { if (!a.inv(id)) return { act: () => fetch(a, id, 1) + equipBest(a) + 1, what: 'fetch ' + id }; continue; }
      const sub = obtain(a, id, 1);
      if (sub && !sub.blocked) return sub;
    }
    return null;
  }

  // ------------------------------------------------------------ Glint
  function glintTask(a, needGlint) {
    // sell surplus once trading is open (Beacon 1), else hunt mobs and work low tides
    const realm = W.ow();
    if (realm.lowTide) {
      const caches = [...realm.entities.values()].filter((e) => e.type === 'node' && (e.kind === 'tide_cache' || e.kind === 'tide_shellbed') && W.plot(...Object.values(plotOfTile(Math.floor(e.x), Math.floor(e.y))))?.owned && (e.data?.tier ?? 1) <= hookMax(a));
      caches.sort((x, y) => (y.kind === 'tide_cache') - (x.kind === 'tide_cache') || Math.hypot(x.x - a.e.x, x.y - a.e.y) - Math.hypot(y.x - a.e.x, y.y - a.e.y));
      if (caches.length) return { act: () => gatherNode(a, caches[0]), what: 'tide ' + caches[0].kind };
    }
    if (g.world.flags['beacon:1']) {
      const sale = sellTask(a, needGlint);
      if (sale) return sale;
    }
    // hunt: stand at the frontier (an owned plot next to wild land) of the newest biome
    const k = Math.min(6, litCount() + 1);
    const plots = W.owned().filter((p) => p.feature !== 'start' && (BIOME_TIER[p.biome] ?? 1) <= Math.min(k, hookMax(a) + 0));
    const p = plots.length ? plots[(Math.floor(g.playtimeS / 240) + a.i) % plots.length] : W.plot(START_PLOT.px, START_PLOT.py);
    return {
      act: () => {
        let t = a.walkTo(p.px * PLOT + 10, p.py * PLOT + 10);
        // kill what spawns for a minute; gather nearby while waiting
        const mobs = [...g.mobsLive].filter((m) => !m.removed && m.realm === 'overworld' && Math.hypot(m.x - a.e.x, m.y - a.e.y) < 30);
        for (const m of mobs.slice(0, 4)) { t += a.walkTo(m.x, m.y + 0.8); const s = fight(a, m); if (s > 0) t += a.charge('combat', s); sweepDrops(a, W.ow(), m.x, m.y, 4); }
        return t + a.charge('combat', mobs.length ? 5 : 30);
      },
      what: 'hunt for Glint',
    };
  }
  function sellTask(a, needGlint) {
    const npc = [...W.ow().entities.values()].find((e) => e.type === 'npc');
    if (!npc) return null;
    // sell up to 40 units of each of the most valuable surplus raw goods
    const goods = [];
    const reserve = (id) => 400;
    for (const s of storages(W)) for (const sl of s.data.inv?.slots ?? []) if (sl) {
      const def = g.content.items.byId[sl[0]];
      if (!def?.value || def.gear || /^ballast|^vault|^trophy|^relic|_core$|^lure/.test(sl[0])) continue;
      const sur = storeCount(W, sl[0]) - reserve(sl[0]);
      if (sur > 20 && !goods.some((x) => x.id === sl[0])) goods.push({ id: sl[0], q: Math.min(60, sur), v: def.value * ((g.game?._market?.sat?.[sl[0]]) ?? 1) });
    }
    if (!goods.length) return null;
    goods.sort((x, y) => y.v - x.v);
    const pick = goods[0];
    if ((a.sold?.[pick.id] ?? -1e9) > g.playtimeS - 600) return null;
    return {
      act: () => {
        let t = fetch(a, pick.id, pick.q);
        t += a.walkTo(npc.x, npc.y + 1);
        const r = a.do('market.sell', { item: pick.id, qty: pick.q, npc: npc.kind });
        (a.sold ||= {})[pick.id] = g.playtimeS;
        if (r?.ok) W.sales = (W.sales || 0) + (r.d?.glint ?? 0);
        return t + a.charge('ui', BOT.INTERACT * 2);
      },
      what: 'sell ' + pick.id,
    };
  }

  // ------------------------------------------------------------ automation
  // Nominal Flux: generators at their rated output (Prism Arrays only by day: half), consumers at their demand.
  function nominalFlux() {
    let supply = 0, demand = 0;
    for (const e of W.ow().entities.values()) {
      if (e.type !== 'structure') continue;
      const m = g.content.structures.byId[e.kind]?.machine;
      if (!m) continue;
      if (m.type === 'generator') supply += (m.flux ?? 0) * (m.cond === 'day' ? 0.5 : 1);
      else demand += m.flux ?? 0;
    }
    return { supply, demand };
  }
  function fluxTask(a, extra) {
    const f = nominalFlux();
    if (f.supply >= f.demand + extra) return null;
    // generators that need no fuel: Rime Turbine (Hoarfrost), Prism Array (day), Tide Wheel (shore); Reactor late
    const gens = [['umbral_reactor', null], ['rime_turbine', 'hoarfrost'], ['prism_array', null], ['tide_wheel', null]];
    for (const [kind, biome] of gens) {
      const def = g.content.structures.byId[kind];
      if (!def || !unlocked(a, def.unlock) || spendsReservedRare(kind)) continue;
      if (kind === 'umbral_reactor' && a.have('echoglass') < 20) continue;
      const plots = W.owned().filter((p) => (!biome || p.biome === biome) && !['vault', 'arena', 'shrine'].includes(p.feature));
      if (!plots.length) continue;
      const nf = a.fails.get('nospot:' + kind) || 0;
      if (nf > plots.length * 2 + 4) continue;   // no ground for it anywhere we own
      const p = plots[nf % plots.length];
      return buildTask(a, kind, 0, plotCenter(p), (tx, ty) => Math.floor(tx / PLOT) === p.px && Math.floor(ty / PLOT) === p.py);
    }
    return null;
  }
  // Rares of tier t are kept for Beacon t until it is lit (a competent player does not spend them on machines first).
  const RARE_TIER = Object.fromEntries(Object.entries(g.content.modules.nodes?.GEM_RARE ?? {}).map(([t, id]) => [id, Number(t)]));
  RARE_TIER.shell = 1;
  const RIDX = recipeIndex(g.content);
  const rawOf = new Map();
  function spendsReservedRare(kind) {
    if (!rawOf.has(kind)) {
      const cost = {};
      for (const c of g.content.structures.byId[kind]?.cost ?? []) if (c.item) cost[c.item] = c.qty;
      rawOf.set(kind, expand(cost, g.content, RIDX).raw);
    }
    for (const item of Object.keys(rawOf.get(kind))) {
      const t = RARE_TIER[item];
      if (t && t >= 2 && !g.world.flags['beacon:' + t]) return true;
    }
    return false;
  }
  function upgradeBurrow(a) {
    const all = structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3']);
    if (all.length < machineWorldCap('burrow')) return null;
    const best = ['burrow_3', 'burrow_2'].find((k) => unlocked(a, g.content.structures.byId[k].unlock) && !spendsReservedRare(k));
    if (!best) return null;
    const rank = (k) => Number(k.slice(-1));
    const worst = all.sort((x, y) => rank(x.kind) - rank(y.kind))[0];
    if (!worst || rank(worst.kind) >= rank(best)) return null;
    // only once the new one is affordable: then pull the old one down (partial refund) and build the new one
    const def = g.content.structures.byId[best];
    for (const c of def.cost ?? []) if (c.item) { const sub = obtain(a, c.item, c.qty); if (sub) return sub; }
    return { act: () => { const t = a.walkTo(worst.x, worst.y + 1.5); const r = a.do('build.remove', { id: worst.id }); if (!r?.ok) note('remove burrow: ' + r?.err); return t + a.charge('build', BOT.BUILD_EACH / 2); }, what: 'replace ' + worst.kind + ' with ' + best };
  }
  function plotScore(p, maxT) {
    const want = W.want ?? {};
    const total = Object.values(want).reduce((x, y) => x + y, 0) || 1;
    let n = 0;
    for (const e of W.ow().query(p.px * PLOT + 10, p.py * PLOT + 10, 14, [], (x) => x.type === 'node' && !x.data?.tidal && x.kind !== 'gem_node')) {
      if ((e.data?.tier ?? 1) > maxT) continue;
      n += 1 + 40 * (g.content.nodes.byId[e.kind]?.drops ?? []).reduce((acc, d) => acc + (want[d.item] || 0) / total, 0);
    }
    return n + (p.feature === 'vein' ? 20 : 0);
  }
  function relocateBurrow(a) {
    if (g.playtimeS - (W.relocAt ?? 0) < 3 * 3600) return null;
    W.relocAt = g.playtimeS;
    const all = structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3']);
    if (all.length < machineWorldCap('burrow')) return null;
    const plotOfE = (e) => W.plot(Math.floor(e.x / PLOT), Math.floor(e.y / PLOT));
    const scored = all.map((b) => ({ b, s: plotScore(plotOfE(b), g.content.structures.byId[b.kind].machine?.maxTier ?? 2) })).sort((x, y) => x.s - y.s);
    const worst = scored[0];
    const maxT = g.content.structures.byId[worst.b.kind].machine?.maxTier ?? 2;
    const used = new Set(all.map((b) => plotOfE(b)));
    const best = W.owned().filter((p) => !used.has(p) && p.feature !== 'start' && (BIOME_TIER[p.biome] ?? 1) <= maxT).map((p) => plotScore(p, maxT)).sort((x, y) => y - x)[0] ?? 0;
    if (best < worst.s * 2.5) return null;
    return { act: () => { const t = a.walkTo(worst.b.x, worst.b.y + 1.5); const r = a.do('build.remove', { id: worst.b.id }); if (!r?.ok) note('relocate burrow: ' + r?.err); else W.relocations = (W.relocations || 0) + 1; return t + a.charge('build', BOT.BUILD_EACH / 2); }, what: 'move ' + worst.b.kind };
  }
  function sluiceTask(a) {
    const def = g.content.structures.byId.sluice_1;
    if (!unlocked(a, def.unlock) || logistics()) return null;
    const prod = structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3', 'drill']);
    if (!prod.length) return null;
    const m = prod[structuresOf(W, ['sluice_1', 'sluice_2', 'sluice_3']).length % prod.length];
    return buildTask(a, 'sluice_1', 0, { x: m.x, y: m.y });
  }
  function automationTask(a) {
    const sl = sluiceTask(a);
    if (sl && sl.act) return sl;
    const up = upgradeBurrow(a);
    if (up) return up;
    const mv = relocateBurrow(a);
    if (mv) return mv;
    // Scuttler Burrows next to the richest wild plots; outputs are emptied into storage on the way past
    for (const kind of ['burrow_3', 'burrow_2', 'burrow_1']) {
      const def = g.content.structures.byId[kind];
      if (!unlocked(a, def.unlock) || spendsReservedRare(kind)) continue;
      const cap = machineWorldCap('burrow');
      if (structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3']).length >= cap) break;
      const maxT = def.machine?.maxTier ?? 2;
      // score a plot by the planner's raw demand for what its nodes drop (rich veins first)
      const want = W.want ?? {};
      const total = Object.values(want).reduce((x, y) => x + y, 0) || 1;
      const nodesOn = (p) => {
        let n = 0;
        for (const e of W.ow().query(p.px * PLOT + 10, p.py * PLOT + 10, 14, [], (x) => x.type === 'node' && !x.data?.tidal)) {
          if ((e.data?.tier ?? 1) > maxT) continue;
          const def = g.content.nodes.byId[e.kind];
          n += 1 + 40 * (def?.drops ?? []).reduce((acc, d) => acc + (want[d.item] || 0) / total, 0);
        }
        return n + (p.feature === 'vein' ? 20 : 0);
      };
      const plot = W.owned().filter((p) => p.feature !== 'start' && (BIOME_TIER[p.biome] ?? 1) <= maxT && structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3']).every((b) => Math.hypot(b.x - (p.px * PLOT + 10), b.y - (p.py * PLOT + 10)) > 12))
        .map((p) => ({ p, s: nodesOn(p) })).sort((x, y) => y.s - x.s)[(a.fails.get('nospot:' + kind) || 0) % 3]?.p;
      if (!plot) continue;
      void 0;
      const need = def.machine?.flux ?? 0;
      if (need > 0) { const ft = fluxTask(a, need); if (ft) return ft; const f = nominalFlux(); if (f.supply < f.demand + need) continue; }
      // stand the Burrow in the middle of the wanted nodes (radius matters: each node counts for its nearest Burrow)
      const wantB = W.want ?? {};
      const r = def.machine?.radius ?? 4;
      const ns = W.ow().query(plot.px * PLOT + 10, plot.py * PLOT + 10, 14, [], (x) => x.type === 'node' && !x.data?.tidal && x.kind !== 'gem_node' && (x.data?.tier ?? 1) <= maxT);
      const val = (e) => 1 + 10 * (g.content.nodes.byId[e.kind]?.drops ?? []).reduce((acc, d) => acc + (wantB[d.item] || 0), 0) / (Object.values(wantB).reduce((x, y) => x + y, 0) || 1);
      let bestPos = plotCenter(plot), bestV = -1;
      for (const c of ns) { let v = 0; for (const e of ns) if (Math.hypot(e.x - c.x, e.y - c.y) <= r - 1) v += val(e); if (v > bestV) { bestV = v; bestPos = { x: c.x, y: c.y }; } }
      return buildTask(a, kind, 0, bestPos, (tx, ty) => Math.floor(tx / PLOT) === plot.px && Math.floor(ty / PLOT) === plot.py);
    }
    if (unlocked(a, g.content.structures.byId.drill.unlock) && structuresOf(W, 'drill').length < machineWorldCap('drill')) {
      const vein = W.owned().find((p) => p.feature === 'vein' && structuresOf(W, 'drill').filter((d) => Math.hypot(d.x - (p.px * PLOT + 10), d.y - (p.py * PLOT + 10)) < 14).length < 6);
      if (vein) { const ft = fluxTask(a, 15); if (ft) return ft; return buildTask(a, 'drill', 0, plotCenter(vein)); }
    }
    // keep the network powered (Burrow II / III and Drills stop without Flux)
    { const ft = fluxTask(a, 0); if (ft) return ft; }
    return null;
  }
  function machineWorldCap(type) {
    let b = litCount();
    const s = g.call('coopScale') || 1;
    return type === 'burrow' ? Math.round((2 + 2 * b) * s) : Math.round(2 * b * s);
  }
  // Logistics (PACING 7: Sluices from hour 26, Gulls from 66). Once the crew has laid BOT.SLUICE_PER_MACHINE Sluice
  // tiles per producer (real structures, real cost), machine output reaches storage and the stations without the
  // player walking it there; before that every unit is hauled by hand.
  const SLUICE_PER_MACHINE = 6;
  function logistics() {
    const prod = structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3', 'drill']).length;
    return prod > 0 && structuresOf(W, ['sluice_1', 'sluice_2', 'sluice_3']).length >= prod * SLUICE_PER_MACHINE;
  }
  function collectMachines(a) {
    let t = 0;
    const piped = logistics();
    for (const m of structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3', 'drill'])) {
      const slots = m.data?.out?.slots ?? m.data?.inv?.slots ?? [];
      const n = slots.reduce((s, x) => s + (x ? x[1] : 0), 0);
      if (n < 40) continue;
      if (!piped) t += a.walkTo(m.x, m.y + 1.5);
      for (let i = 0; i < 12; i++) {
        const got = g.call('extractFrom', m, null, 999);
        if (!got?.qty) break;
        W.ruAuto = (W.ruAuto || 0) + got.qty;
        store(a, got.item, got.qty);
      }
      if (!piped) t += a.charge('ui', BOT.INTERACT);
    }
    if (t > 0 && a.freeSlots() < BOT.STORAGE_FREE) t += deposit(a);
    return t;
  }

  // ------------------------------------------------------------ late game
  function archiveTask(a, wingsWanted) {
    const arc = structuresOf(W, 'archive')[0];
    if (!arc) return { blocked: 'archive-plot' };
    const state = g.worldState.archive ?? {};
    const done = new Set(state.complete ?? []);
    if (done.size >= wingsWanted) return null;
    const wings = g.content.archive.filter((w) => !done.has(w.id));
    // easiest wings first: materials before fish / crops / relics
    const order = ['wing_metal', 'wing_stone', 'wing_timber', 'wing_bestiary', 'wing_works', 'wing_harvest', 'wing_angler', 'wing_relic'];
    wings.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    const wing = wings[0];
    for (const item of wing.items) {
      if (state.donated?.[item]) continue;
      if (/^trophy_/.test(item) && !a.have(item)) continue;
      const sub = obtain(a, item, 1);
      if (sub) return sub;
      return {
        act: () => {
          let t = fetch(a, item, 1);
          t += a.walkTo(arc.x, arc.y + 2.5);
          const r = donate(g, a.p, item);
          if (!r?.ok) note(`donate ${item}: ${r?.err}`);
          return t + a.charge('ui', BOT.INTERACT);
        },
        what: 'donate ' + item,
      };
    }
    return { blocked: 'wing ' + wing.id };
  }
  function trenchTask(a) {
    if (g.world.flags['trench:10']) return null;
    const ent = structuresOf(W, 'trench_entrance')[0];
    if (!ent) return { blocked: 'trench-entrance' };
    return {
      act: () => {
        const t = a.walkTo(ent.x, ent.y + 2);
        // modelled: 10 floors of arena waves (BOT.TRENCH_FLOOR each), then the real floor event and rewards
        W.forced.trench = 10;
        for (let f = 1; f <= 10; f++) g.bus.emit('trench.floor', { floor: f, participants: agents.map((x) => x.p) });
        a.p.counters.trench_deepest = Math.max(a.p.counters.trench_deepest || 0, 10);
        return t + a.charge('combat', BOT.TRENCH_FLOOR * 10);
      },
      what: 'Trench to floor 10',
    };
  }
  function tidegateTask(a) {
    const stageNow = g.worldState.tidegate?.stage ?? 0;
    if (stageNow >= 5) return null;
    const site = structuresOf(W, 'gate_site')[0];
    if (!site) return { blocked: 'gate-site' };
    const stage = g.content.modules.structures.TIDEGATE_STAGES[stageNow];
    const wings = (g.worldState.archive?.complete ?? []).length;
    if (wings < stage.wings) return archiveTask(a, stage.wings);
    if (stage.trench) { const tr = trenchTask(a); if (tr) return tr; }
    const scale = g.call('coopScale') || 1;
    const delivered = g.worldState.tidegate?.got ?? {};
    for (const c of stage.cost) {
      const q = (stage.unscaled ?? []).includes(c.item) ? c.qty : Math.ceil(c.qty * scale - 1e-9);
      const left = q - (delivered[c.item] ?? 0);
      if (left <= 0) continue;
      const sub = obtain(a, c.item, Math.min(left, 400));
      if (sub) return sub;
    }
    if (stage.glint && (g.world.glint || 0) < Math.ceil(stage.glint * scale - 1e-9)) return { glint: Math.ceil(stage.glint * scale) };
    return {
      act: () => {
        let t = 0;
        for (const c of stage.cost) t += fetch(a, c.item, c.qty * 6);
        t += a.walkTo(site.x, site.y + 3);
        const r = a.do('tidegate.deliver', { stage: stageNow + 1 });
        if (!r?.ok && r?.err !== 'cost') note(`tidegate ${stageNow + 1}: ${r?.err}`);
        return t + a.charge('ui', BOT.INTERACT * 2);
      },
      what: 'deliver to Tidegate stage ' + (stageNow + 1),
    };
  }
  function finaleTask(a) {
    if (g.world.flags['moon:beaten']) return null;
    return {
      act: () => {
        // The Drowned Moon: three phases, 1.2M HP solo (finale.js). Fought with the same autobattle as Wardens.
        const def = g.content.bosses.byId.drowned_moon;
        const hp = (def?.hp ?? 1.2e6) * (1 + 0.8 * (agents.length - 1));
        const w = weaponHit(a);
        let dps = 0;
        for (const x of agents) { const y = weaponHit(x); dps += y.amount * y.rate; }
        const fightS = hp / Math.max(1, dps) * BOT.COMBAT_INEFF;
        const tries = Math.max(1, Math.min(3, Math.ceil(fightS / 900)));
        void w;
        W.forced.finale = 1;
        g.world.flags['moon:beaten'] = true;
        if (g.world.flags['gate:moon'] == null) g.world.flags['gate:moon'] = Math.round(g.playtimeS + fightS * tries);
        g.bus.emit('boss.killed', { boss: { kind: 'drowned_moon', data: {} }, kind: 'drowned_moon', participants: agents.map((x) => x.p), first: true });
        return a.charge('combat', fightS * tries);
      },
      what: 'Drowned Moon',
    };
  }

  // ------------------------------------------------------------ progression helpers
  const litCount = () => [1, 2, 3, 4, 5, 6].filter((k) => g.world.flags['beacon:' + k]).length;
  function ensureStations(a, k) {
    const want = [['workbench', 1], ['kiln', 1], ['stockpile', 1]];
    if (a.p.level >= 4) want.push(['loom', 1]);
    if (a.p.level >= 6) want.push(['anvil', 1]);
    want.push(['kiln', 2]);
    if (a.p.level >= 8) want.push(['cookpot', 1]);
    if (a.p.level >= 10) want.push(['calling_shrine', 1]);
    want.push(['stockpile', 2 + k]);
    want.push(['kiln', 2 + k]);
    if (k >= 3) want.push(['kiln_2', 2], ['anvil_2', 1], ['workbench_2', 1]);
    if (k >= 5) want.push(['kiln_3', 3], ['anvil_3', 1], ['workbench_3', 1]);
    if (k >= 6) want.push(['kiln_3', 6]);
    // storage grows with the factory: keep at least 8 free slots across Stockpiles and Brinelockers
    const freeStore = storages(W).reduce((n, st) => n + (st.data.inv?.slots ?? []).filter((x) => !x).length, 0);
    if (storages(W).length && freeStore < 8) {
      const kind = 'stockpile';   // Brinelockers share ONE networked inventory, so they do not add room
      const t = buildTask(a, kind);
      if (t && !t.blocked) return t;
    }
    // stations that keep the player waiting get a twin (up to 12 of a kind)
    for (const [item, n] of Object.entries(W.stationWait ?? {})) {
      if (n < 15) continue;
      const r = (W.recipesFor.get(item) ?? []).find((x) => x.station !== 'hand' && unlocked(a, x.unlock));
      if (!r) continue;
      const kinds = stationKinds(r.station).filter((k) => unlocked(a, g.content.structures.byId[k]?.unlock));
      const kind = kinds.at(-1);
      if (!kind || structuresOf(W, kind).length >= 12) continue;
      W.stationWait[item] = 0;
      const t = buildTask(a, kind);
      if (t && !t.blocked) return t;
    }
    for (const [kind, n] of want) {
      const def = g.content.structures.byId[kind];
      if (!def || !unlocked(a, def.unlock)) continue;
      if (structuresOf(W, kind).length >= n) continue;
      const t = buildTask(a, kind);
      if (t && !t.blocked) return t;
    }
    return null;
  }

  function quickActions(a) {
    let t = 0;
    // card drafts: take the first offer (a draft per level)
    const cs = a.p.cardState;
    let guard = 0;
    while (cs?.drafts?.length && guard++ < 20) {
      const d = cs.drafts[0];
      const r = a.do('card.pick', { draft: d.id, index: 0 });
      if (!r?.ok) { a.do('card.skip', { draft: d.id }); }
      t += 1;
    }
    // skills
    for (const id of SKILL_ROUTE) { const r = a.do('skill.buy', { skill: id }); if (r?.ok) t += 1; }
    // class at level 10 next to a Calling Shrine
    if (a.p.level >= 10 && !a.p.classState?.id) {
      const sh = structuresOf(W, 'calling_shrine')[0];
      if (sh) { t += a.walkTo(sh.x, sh.y + 1.8); a.do('class.choose', { class: CLASS }); }
    }
    t += equipBest(a);
    // empty full machines on the way (Burrows and Drills stop when their output is full)
    if (g.playtimeS - (a.lastCollect ?? 0) > 600) { a.lastCollect = g.playtimeS; t += collectMachines(a); }
    return t;
  }

  // ------------------------------------------------------------ the decision
  function decide(a) {
    W.memo = new Map();
    if (a.e.state === 5 || a.e.state === 4 || a.e.hp <= 0) return { act: () => a.charge('wait', 5), what: 'dead' };
    const k = Math.min(6, litCount() + 1);
    const biome = BIOMES6[k - 1];
    const tasks = [];
    const push = (x) => { if (x) tasks.push(x); };
    push(ensureStations(a, k));
    push(gearTask(a, k));
    const allLit = litCount() >= 6;
    push(automationTask(a));      // a competent player builds machines as soon as they unlock
    if (!allLit) {
      // q01: Workbench and Kiln come from ensureStations; the next plot of this biome; its castaways and shrines
      if (a.i % 2 === 1) { push(lineTask(a, biome)); push(shrineTask(a, biome)); }
      push(raiseTask(a, biome));
      push(lineTask(a, biome));
      push(shrineTask(a, biome));
      const plotsLeft = g.world.plots.some((p) => p.biome === biome && !p.owned);
      if (!g.world.flags['vault:' + k]) push(vaultTask(a, k));
      push(gearTask(a, k + 1));
      if (!plotsLeft || W.owned().some((p) => p.feature === 'arena' && p.biome === biome)) push(wardenTask(a, k));
      const att = g.call('attunement', k);
      if (att?.ok && g.world.flags['boss:' + ['thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir'][k - 1]]) {
        // a Beacon stands in its own biome (land.js validator): the owned plot of that biome nearest the start
        const bp = W.owned().filter((p) => p.biome === biome && !['vault', 'arena', 'shrine', 'castaway'].includes(p.feature))
          .sort((x, y) => Math.hypot(x.px - START_PLOT.px, x.py - START_PLOT.py) - Math.hypot(y.px - START_PLOT.px, y.py - START_PLOT.py))[0];
        push(buildTask(a, 'beacon_' + k, 0, bp ? plotCenter(bp) : W.base));
      }
    } else {
      push(tidegateTask(a));
      if ((g.worldState.tidegate?.stage ?? 0) >= 5) push(finaleTask(a));
    }
    // first action that can run now
    let glintNeed = 0;
    let waiting = null;
    const why = [];
    for (const x of tasks) {
      if (x.act) return x;
      if (x.glint) return glintTask(a, x.glint);    // the Treasury is the bottleneck: earn before side work
      if (x.wait && !waiting) waiting = x;
      if (x.blocked) why.push(x.blocked);
    }
    if (glintNeed) return glintTask(a, glintNeed);
    // nothing to do now: stock up Ballast for the next plot, or keep the Treasury growing
    if (waiting) return { act: () => a.charge('wait', 10) + collectMachines(a), what: 'wait ' + waiting.wait };
    W.whyIdle = W.whyIdle || new Map();
    for (const w of why) W.whyIdle.set(w, (W.whyIdle.get(w) || 0) + 1);
    a.lastWhy = why.slice(0, 4).join(', ');
    return glintTask(a, 0);
  }

  // ------------------------------------------------------------ main loop
  const phaseStart = [0];
  let lastLog = 0;
  let stuckAt = 0, lastProgress = '';
  const deadline = maxHours * 3600;
  let actions = 0;
  const actionHist = new Map();
  while (g.playtimeS < deadline) {
    if (g.world.flags['moon:beaten']) break;
    agents.sort((x, y) => x.busyUntil - y.busyUntil);
    const a = agents[0];
    if (a.busyUntil > g.playtimeS) advanceTo(a.busyUntil);
    let dur = quickActions(a);
    dur += defend(a);
    if (a.e.realm === 'overworld' && dur < 1) {
      const task = decide(a);
      a.task = task.what ?? '?';
      if (process.env.TB_BOT_TRACE && g.playtimeS > Number(process.env.TB_BOT_TRACE) * 3600) console.error(`[trace] ${(g.playtimeS / 3600).toFixed(3)} a${a.i} ${a.task}`);
      const s = task.act();
      dur += Math.max(0.5, Number.isFinite(s) ? s : 1);
      if (a.e.realm !== 'overworld') g.movePlayer(a.p, 'overworld', W.base.x, W.base.y);
      const key = a.task.startsWith('wait') || a.task.startsWith('hunt') ? a.task : a.task.split(' ')[0];
      actionHist.set(key, (actionHist.get(key) || 0) + Math.max(0.5, Number.isFinite(s) ? s : 1) / 3600);
    }
    if (!Number.isFinite(dur) || dur < 0) { note(`bad duration ${dur} for ${a.task}`); dur = 5; }
    if (dur > 6 * 3600) { note(`long action ${Math.round(dur)} s for ${a.task}`); dur = 6 * 3600; }
    a.busyUntil = g.playtimeS + dur;
    actions++;
    // the harness keeps every message a fake client received: drop them (memory)
    for (const c of h.conns) if (c.messages.length > 500) c.messages.length = 0;
    // progress watchdog
    const prog = `${W.owned().length}|${litCount()}|${g.worldState.tidegate?.stage ?? 0}`;
    if (prog !== lastProgress) { lastProgress = prog; stuckAt = g.playtimeS; W.stuckRun = 0; }
    else if (g.playtimeS - stuckAt > 6 * 3600) { const gems = {}; for (const e of W.ow().entities.values()) if (e.kind === 'gem_node') gems[e.data?.tier] = (gems[e.data?.tier] || 0) + 1; note(`stuck 6 h at ${prog}: ${a.task} / ${a.lastWhy ?? ''} hook ${hookMax(a)} gems ${JSON.stringify(gems)} inv-core ${a.have('magma_core')}`); stuckAt = g.playtimeS; W.stuck = (W.stuck || 0) + 1; if (++W.stuckRun > 4) break; }
    if (!opts.quiet && g.playtimeS - lastLog > 3600 * (opts.logEvery ?? 5)) {
      lastLog = g.playtimeS;
      say(`  t=${(g.playtimeS / 3600).toFixed(1)} h  plots ${W.owned().length}/81  beacons ${litCount()}  lv ${agents.map((x) => x.p.level).join('/')}  glint ${Math.round(g.world.glint)}  doing: ${a.task}  heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);
    }
  }

  // ------------------------------------------------------------ report
  const F = g.world.flags;
  const gate = (name) => (F['gate:' + name] != null ? F['gate:' + name] / 3600 : null);
  const ends = [gate('first_plot') ?? null, gate('beacon_1'), gate('beacon_2'), gate('beacon_3'), gate('beacon_4'), gate('beacon_5'), gate('beacon_6'), F['moon:beaten'] ? (F['gate:moon'] ?? g.playtimeS) / 3600 : null];
  const firstPlot = firstPlotHour(g);
  const phases = PHASE_NAMES.map((name, p) => {
    const end = p === 0 ? firstPlot : ends[p];
    const prev = p === 0 ? 0 : p === 1 ? firstPlot : ends[p - 1];
    return { p, name, end, len: end != null && prev != null ? end - prev : null, target: TARGET_PHASE_END[p], targetLen: TARGET_PHASE_END[p] - (p ? TARGET_PHASE_END[p - 1] : 0) };
  });
  const time = {};
  for (const a of agents) for (const [k, v] of Object.entries(a.t)) time[k] = (time[k] || 0) + v / 3600;
  const report = {
    players, seed, hours: (F['moon:beaten'] ? (F['gate:moon'] ?? g.playtimeS) : g.playtimeS) / 3600, finished: !!F['moon:beaten'],
    phases, firstPlotMin: firstPlot != null ? firstPlot * 60 : null, plots: W.owned().length, level: agents.map((a) => a.p.level),
    timeByKind: time, forced: W.forced, attempts: W.attempts || 0, sales: W.sales || 0, lost: W.lost || 0,
    actions, actionHist: Object.fromEntries([...actionHist].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => [k, +v.toFixed(2)])), whyIdle: Object.fromEntries([...(W.whyIdle ?? [])].sort((x, y) => y[1] - x[1]).slice(0, 10)), notes: notes.slice(-40), wallS: (performance.now() - t0) / 1000,
    targetCritical: TARGET_CRITICAL,
    built: (() => { const m = {}; for (const e of W.ow().entities.values()) if (e.type === 'structure' && !g.content.structures.byId[e.kind]?.natural && e.kind !== 'campfire') m[e.kind] = (m[e.kind] || 0) + 1; return m; })(),
    skills: agents.map((x) => x.p.skillState?.owned ?? []),
    ruManual: W.ru || 0, ruAuto: W.ruAuto || 0, relocations: W.relocations || 0,
    burrows: structuresOf(W, ['burrow_1', 'burrow_2', 'burrow_3', 'drill']).map((b) => b.kind + '@' + W.plot(Math.floor(b.x / PLOT), Math.floor(b.y / PLOT)).biome + ':' + (b.data?.out?.slots ?? []).filter(Boolean).map((x) => x[0]).slice(0, 3).join('/')),
    want: Object.entries(W.want ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 6),
  };
  return report;
}

function firstPlotHour(g) {
  const f = g.world.flags;
  for (const k of ['gate:first_plot', 'gate:plot_1', 'gate:first']) if (f[k] != null) return f[k] / 3600;
  return null;
}

export function formatReport(r) {
  const L = [];
  const f = (x, d = 1) => (x == null ? '-' : x.toFixed(d));
  L.push(`Pacing bot: ${r.players} player(s), seed ${r.seed}: ${r.finished ? 'Drowned Moon beaten' : 'NOT finished'} at ${f(r.hours, 1)} h simulated (${f(r.wallS, 0)} s wall)`);
  L.push(`First plot at minute ${f(r.firstPlotMin, 0)}; plots ${r.plots}/81; levels ${r.level.join('/')}`);
  L.push('| Phase | Ends at (bot) | Target end | Length (bot) | Target length |');
  L.push('|---|---|---|---|---|');
  for (const p of r.phases) L.push(`| ${p.p} ${p.name} | ${f(p.end, 1)} | ${f(p.target, 1)} | ${f(p.len, 1)} | ${f(p.targetLen, 1)} |`);
  L.push('Time by kind (player-hours): ' + Object.entries(r.timeByKind).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
  L.push('Modelled completions: ' + JSON.stringify(r.forced) + `; boss attempts ${r.attempts}; sales ${Math.round(r.sales)} G`);
  if (r.notes.length) L.push('Notes:\n  ' + r.notes.slice(-12).join('\n  '));
  return L.join('\n');
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const r = await runPacingBot({ players: Number(arg('players', 1)), seed: Number(arg('seed', 1)), maxHours: Number(arg('hours', 200)), quiet: process.argv.includes('--quiet'), verbose: process.argv.includes('--verbose') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else console.log(formatReport(r));
}

export default runPacingBot;
