// Machines (WP8, DESIGN 8.0, 8.3): registry of every machine structure, the world Flux pool, per-plot machine caps,
// Tending, enable/disable, the machine panel (self key `machine`) and its Factory Report (world key `report`).
//
// Rules implemented here:
//  - speed = min(3, 1 + world machineSpeed (+ scuttlerRate for Burrows) + proximity bonus) * fluxRatio * tendFactor
//  - Flux: supply = sum of generator outputs (computed by producers.js), demand = sum of consumers that want to run;
//    when demand > supply every consumer runs at supply/demand
//  - Tending: 30 min meter, drains while the machine works, refills only on `player.active` within 12 tiles,
//    10% speed at 0; nothing runs while no player is connected (empty --persist server)
//  - machine cap per plot = round((8 + world machineCap + workshop charter 2) * coopScale), countsToCap structures only
//
// Services: machineSpeed, disableMachine, machineClusters, refillTend (TECH_SPEC 5.5).
// Actions: machine.config {id, on?, recipe?, filter?, tag?, k?, take?, put?}, burrow.rename {id, name, hat}.
// Public structure keys used: `on` (0/1), `p` (progress 0-255), `it` (displayed item), `lv` (status bits below).

import { PLOT } from '../../../shared/config.js';
import { BIOME_TIER, plotOfTile, inPlotBounds, plotIndex } from '../../../shared/grid.js';
import { isInt, sanitizeName } from '../../../shared/protocol.js';
import { MACHINE_SPEED_CAP, TEND_MINUTES, UNTENDED_SPEED, TEND_RADIUS, BURROW_WORLD_BASE, BURROW_PER_BEACON, DRILL_PER_BEACON, PRODUCERS_PER_PLOT, CAPPED_PRODUCERS } from '../../../shared/rules/constants.js';
import { machineCap as capFormula } from '../../../shared/rules/costs.js';

export const TEND_S = TEND_MINUTES * 60;
export const STATUS = Object.freeze({ UNTENDED: 1, LOWFLUX: 2, WORKING: 4, OFF: 8, BLOCKED: 16, NOINPUT: 32 });
// Scuttler hats are the automation Logbook cosmetics (sprites helper.scuttler.<id>); 'none' = bare shell.
export const HATS = Object.freeze(['none', 'cos_d_machines', 'cos_d_burrow', 'cos_d_sluice', 'cos_d_gulls', 'cos_d_auto', 'cos_d_flux', 'cos_d_sold', 'cos_d_glint', 'cos_d_mint', 'cos_d_tend']);
const WANT_WINDOW = 2;          // seconds a "want to run" mark counts toward Flux demand
const VIEW_RANGE = 6;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // rot 0 = east, 1 = south, 2 = west, 3 = north

const GAMES = new WeakMap();
export const M = (game) => GAMES.get(game);

// ---------------------------------------------------------------- definitions and geometry

export const defOf = (game, e) => game.content.structures.byId[e?.kind] ?? null;
export const machineOf = (game, e) => defOf(game, e)?.machine ?? null;
export const typeOf = (game, e) => machineOf(game, e)?.type ?? null;
export const dirVec = (rot) => DIRS[((rot ?? 0) % 4 + 4) % 4];

// Tile in front of / behind a 1x1 machine (larger ones use the edge tile at the centre of that side).
export function frontTile(e, rot = e.pub.rot ?? 0) {
  const [dx, dy] = dirVec(rot);
  const w = e.data.w ?? 1, h = e.data.h ?? 1;
  const cx = e.data.tx + Math.floor((w - 1) / 2), cy = e.data.ty + Math.floor((h - 1) / 2);
  return [dx > 0 ? e.data.tx + w : dx < 0 ? e.data.tx - 1 : cx, dy > 0 ? e.data.ty + h : dy < 0 ? e.data.ty - 1 : cy];
}
export const backTile = (e) => frontTile(e, (e.pub.rot ?? 0) + 2);
export const leftTile = (e) => frontTile(e, (e.pub.rot ?? 0) + 3);
export const rightTile = (e) => frontTile(e, (e.pub.rot ?? 0) + 1);

export function structAt(game, realm, tx, ty) {
  return realm.entityAtTile(tx, ty, 'structure');
}

export function plotKeyOf(e) {
  const { px, py } = plotOfTile(e.data.tx ?? Math.floor(e.x), e.data.ty ?? Math.floor(e.y));
  return inPlotBounds(px, py) ? plotIndex(px, py) : -1;
}

// ---------------------------------------------------------------- inventories

export function invOf(e, key, size = 0) {
  let inv = e.data[key];
  if (!inv || !Array.isArray(inv.slots)) { inv = { slots: new Array(size).fill(null) }; e.data[key] = inv; }
  while (inv.slots.length < size) inv.slots.push(null);
  return inv;
}

const isEmptyInv = (inv) => !inv || inv.slots.every((s) => !s);

// Adds machine output; returns leftover. Emits machine.output and feeds the Factory Report.
export function outAdd(game, e, item, qty, key = 'out') {
  const inv = invOf(e, key);
  const left = game.inv.add(inv, item, qty);
  const added = qty - left;
  if (added > 0) {
    report(game, item, added, true);
    game.bus.emit('machine.output', { machine: e, item, qty: added });
    showItem(e, item);
  }
  return left;
}

export function showItem(e, item) { if (e.pub.it !== item) e.set('it', item); }

export function takeFrom(game, inv, filter, max) {
  if (!inv) return null;
  for (const s of inv.slots) {
    if (s && (!filter || filter(s[0]))) {
      const item = s[0];
      const qty = game.inv.remove(inv, item, Math.min(max, s[1]));
      return qty > 0 ? { item, qty } : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- runtime

export function rt(game, e) {
  const st = M(game);
  let r = st.rt.get(e.id);
  if (!r) { r = { wantAt: -1e9, near: 0, whistle: 0, acc: 0, cd: 0, status: 0, lastWarn: -1e9 }; st.rt.set(e.id, r); }
  return r;
}

export const want = (game, e) => { rt(game, e).wantAt = game.now; };
export const wanting = (game, e) => game.now - rt(game, e).wantAt <= WANT_WINDOW;
export const disabled = (game, e) => (e.data.disabledUntil ?? 0) > game.now;
export const isOn = (game, e) => e.data.on !== false && !disabled(game, e);
export const running = (game) => game.players.size > 0;       // DESIGN 8.0: nothing runs on an empty server

export function tendFactor(game, e) {
  const def = defOf(game, e);
  if (!def?.tend) return 1;
  return (e.data.tend ?? TEND_S) > 0 ? 1 : UNTENDED_SPEED;
}

export function fluxRatioFor(game, e) {
  const m = machineOf(game, e);
  if (!m || m.type === 'generator' || !(m.flux > 0)) return 1;
  return M(game).flux.ratio;
}

// Uncapped bonus sum for this machine (world sheet + proximity), before the 3.0 cap.
export function speedBonus(game, e) {
  const w = game.stats.world();
  const r = rt(game, e);
  let b = (w.machineSpeed ?? 0) + r.near;
  if (typeOf(game, e) === 'burrow') b += (w.scuttlerRate ?? 0) + r.whistle;
  return b;
}

export function machineSpeed(game, e) {
  if (!e || e.removed || !machineOf(game, e)) return 0;
  if (!isOn(game, e)) return 0;
  // Gearwright Overclock (WP6b): structure.data.overclock = { until, mult } in game time.
  // WP14 (BUILD_REVIEW P2-2): Overclock stays inside the x3.0 machine speed cap.
  const oc = e.data.overclock;
  const over = oc && game.now < oc.until && oc.mult > 0 ? oc.mult : 1;
  const base = Math.min(MACHINE_SPEED_CAP, (1 + speedBonus(game, e)) * over);
  return base * fluxRatioFor(game, e) * tendFactor(game, e);
}

export function report(game, item, qty, made) {
  const st = M(game);
  const bucket = made ? st.rep.cur.made : st.rep.cur.used;
  bucket[item] = (bucket[item] ?? 0) + qty;
}

// ---------------------------------------------------------------- registry

export function machinesOfType(game, type) { return M(game).byType.get(type) ?? new Set(); }

function ensureData(game, e) {
  const def = defOf(game, e);
  const m = def?.machine;
  if (!m) return;
  const d = e.data;
  if (d.on === undefined) d.on = true;
  if (def.tend && !Number.isFinite(d.tend)) d.tend = TEND_S;
  switch (m.type) {
    case 'burrow': invOf(e, 'out', m.slots ?? 12); d.name ??= ''; d.hat ??= 'none'; break;
    case 'hopper': invOf(e, 'out', m.slots ?? 8); break;
    case 'mover': d.hold ??= null; if (m.filter) d.filter ??= []; break;
    case 'sluice': d.item ??= null; d.prog ??= 0; break;
    case 'splitter': d.item ??= null; d.rr ??= 0; break;
    case 'autobench': invOf(e, 'in', m.inSlots ?? 6); invOf(e, 'out', m.outSlots ?? 2); d.recipe ??= null; d.prog ??= 0; break;
    case 'drill': invOf(e, 'out', 12); d.acc ??= 0; break;
    case 'tiller': invOf(e, 'in', 1); invOf(e, 'out', 8); d.acc ??= 0; break;
    case 'producer': invOf(e, 'out', m.slots ?? 4); d.acc ??= 0; break;
    case 'seller': if (e.kind === 'mint') invOf(e, 'in', 8); d.acc ??= 0; break;
    case 'echo': invOf(e, 'in', 4); invOf(e, 'out', 16); d.k ??= null; d.acc ??= 0; break;
    case 'generator': if ((m.fuelPer10s ?? 0) > 0 || def.consumes) invOf(e, 'fuel', 2); d.fuelT ??= 0; break;
    default: break;
  }
  e.set('on', isOn(game, e) ? 1 : 0);
  if (m.type === 'sluice' || m.type === 'splitter') e.set('it', d.item ?? 0);
  else if (m.type === 'mover') e.set('it', d.hold?.item ?? 0);
}

function register(game, e) {
  const m = machineOf(game, e);
  if (!m || e.realm !== 'overworld') return;
  const st = M(game);
  ensureData(game, e);
  st.list.set(e.id, e);
  let set = st.byType.get(m.type);
  if (!set) { set = new Set(); st.byType.set(m.type, set); }
  set.add(e);
  game.bus.emit('machine.registered', { machine: e, type: m.type });
}

function unregister(game, e) {
  const st = M(game);
  if (!st.list.delete(e.id)) return;
  st.byType.get(typeOf(game, e))?.delete(e);
  st.rt.delete(e.id);
  for (const [pid, mid] of st.viewers) if (mid === e.id) st.viewers.delete(pid);
}

// Contents of a removed machine spill as ground items (nothing is destroyed).
function spill(game, e) {
  const realm = game.realms.get(e.realm);
  if (!realm) return;
  const out = [];
  for (const k of ['in', 'out', 'fuel']) for (const s of e.data[k]?.slots ?? []) if (s) out.push(s);
  if (e.data.hold) out.push([e.data.hold.item, e.data.hold.qty ?? 1]);
  if (e.data.item) out.push([e.data.item, 1]);
  for (const [item, qty] of out) game.call('dropItem', realm, e.x, e.y, item, qty, {});
}

// ---------------------------------------------------------------- tending

export function refillTend(game, realm, x, y, r, player = null) {
  const id = typeof realm === 'string' ? realm : realm?.id;
  let refilled = 0;
  for (const e of M(game).list.values()) {
    if (e.realm !== id || !defOf(game, e)?.tend) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > r * r) continue;
    const was = e.data.tend ?? TEND_S;
    e.data.tend = TEND_S;
    if (was <= 0) updateStatus(game, e);
    if (was < TEND_S * 0.5) refilled++;
  }
  // WP14 (BUILD_REVIEW P1-4): Logbook counter, once per refill that brought at least one machine back from half.
  if (refilled && player) game.call('counter', player, 'tend_refills', 1);
  return refilled;
}

// ---------------------------------------------------------------- caps

function plotMachineCount(game, realm, px, py, pred) {
  const x0 = px * PLOT, y0 = py * PLOT;
  let n = 0;
  for (const e of realm.query(x0 + PLOT / 2, y0 + PLOT / 2, PLOT * 0.8, [], (s) => s.type === 'structure')) {
    if (e.data.tx < x0 || e.data.ty < y0 || e.data.tx >= x0 + PLOT || e.data.ty >= y0 + PLOT) continue;
    if (pred(e)) n++;
  }
  return n;
}

export function machineCapAt(game, px, py) {
  const w = game.stats.world();
  const charter = game.world.charters?.[px + ',' + py]?.id;
  return capFormula((w.machineCap ?? 0) + (charter === 'workshop' ? 2 : 0), Math.max(1, game.call('coopScale') || 1));
}

// WP14 (BUILD_REVIEW P1-1): world-wide automation ceilings that grow with lit Beacons (x coopScale, rounded).
export function litBeacons(game) {
  let n = 0;
  for (let k = 1; k <= 6; k++) if (game.world.flags?.['beacon:' + k]) n++;
  return n;
}
export function worldMachineCap(game, type) {
  const scale = Math.max(1, game.call('coopScale') || 1);
  const b = litBeacons(game);
  if (type === 'burrow') return Math.round((BURROW_WORLD_BASE + BURROW_PER_BEACON * b) * scale);
  if (type === 'drill') return Math.round(DRILL_PER_BEACON * b * scale);
  return Infinity;
}
function worldMachineCount(game, type) {
  let n = 0;
  for (const e of M(game).list.values()) if (!e.removed && typeOf(game, e) === type) n++;
  return n;
}

function placeValidator(game, kind, realm, tx, ty) {
  const def = game.content.structures.byId[kind];
  const m = def?.machine;
  if (!def || realm.kind !== 'overworld' || (!m && !def.countsToCap)) return null;
  const { px, py } = plotOfTile(tx, ty);
  if (!inPlotBounds(px, py)) return { ok: false, err: 'invalid' };
  if (m?.type === 'burrow' || m?.type === 'drill') {
    if (worldMachineCount(game, m.type) >= worldMachineCap(game, m.type)) return { ok: false, err: 'full' };
  }
  if (CAPPED_PRODUCERS.includes(kind)) {
    const cap = Math.round(PRODUCERS_PER_PLOT * Math.max(1, game.call('coopScale') || 1));
    if (plotMachineCount(game, realm, px, py, (e) => CAPPED_PRODUCERS.includes(e.kind)) >= cap) return { ok: false, err: 'full' };
  }
  if (def.countsToCap) {
    const used = plotMachineCount(game, realm, px, py, (e) => !!defOf(game, e)?.countsToCap);
    if (used >= machineCapAt(game, px, py)) return { ok: false, err: 'full' };
  }
  if (m?.type === 'drill') {
    const f = game.call('featureAt', realm, tx, ty);
    if (f?.feature !== 'vein') return { ok: false, err: 'invalid' };
    const drills = plotMachineCount(game, realm, px, py, (e) => e.kind === kind);
    if (drills >= (m.perPlot ?? 6)) return { ok: false, err: 'full' };
  }
  if (def.place?.needs) {
    const plot = game.world.plots[plotIndex(px, py)];
    if (plot?.biome !== def.place.needs) return { ok: false, err: 'invalid' };
  }
  if (m?.type === 'generator' && m.cond === 'shore') {
    let touch = false;
    for (let y = ty - 1; y <= ty + (def.h ?? 1) && !touch; y++) {
      for (let x = tx - 1; x <= tx + (def.w ?? 1); x++) {
        const g = realm.groundAt(x, y);
        if (g <= 2) { touch = true; break; }      // deep, shallow or tidal
      }
    }
    if (!touch) return { ok: false, err: 'invalid' };
  }
  if (m?.type === 'producer' && m.cond === 'tree') {
    const tree = realm.query(tx + 0.5, ty + 0.5, 1.2, [], (e) => e.type === 'node' && game.content.nodes.byId[e.kind]?.cls === 'wood');
    if (!tree.length) return { ok: false, err: 'invalid' };
  }
  return null;
}

// ---------------------------------------------------------------- status, flux, proximity

function updateStatus(game, e) {
  const r = rt(game, e);
  const def = defOf(game, e);
  let s = 0;
  if (!isOn(game, e)) s |= STATUS.OFF;
  if (def?.tend && (e.data.tend ?? TEND_S) <= 0) s |= STATUS.UNTENDED;
  if (fluxRatioFor(game, e) < 0.999 && wanting(game, e)) s |= STATUS.LOWFLUX;
  if (wanting(game, e) && isOn(game, e) && running(game)) s |= STATUS.WORKING;
  if (r.blocked) s |= STATUS.BLOCKED;
  if (r.noInput) s |= STATUS.NOINPUT;
  r.status = s;
  if (e.pub.lv !== s) e.set('lv', s);
  const on = isOn(game, e) ? 1 : 0;
  if (e.pub.on !== on) e.set('on', on);
}

function computeFlux(game) {
  const st = M(game);
  const w = game.stats.world();
  let supply = 0, demand = 0, gens = 0;
  for (const e of st.list.values()) {
    const m = machineOf(game, e);
    if (!m) continue;
    if (m.type === 'generator') { gens++; supply += isOn(game, e) ? (st.gen.get(e.id) ?? 0) : 0; continue; }
    if (!(m.flux > 0) || !isOn(game, e)) continue;
    if (m.type === 'turret' || wanting(game, e)) demand += m.flux;
  }
  demand *= Math.max(0.1, 1 + (w.fluxUse ?? 0));
  const ratio = demand > supply ? (demand > 0 ? supply / demand : 1) : 1;
  st.flux = { supply: Math.round(supply * 10) / 10, demand: Math.round(demand * 10) / 10, ratio, gens };
  const key = `${st.flux.supply}/${st.flux.demand}/${gens}`;
  if (key !== st.fluxKey) {
    st.fluxKey = key;
    game.sendWorld('flux', { supply: st.flux.supply, demand: st.flux.demand, ratio: Math.round(ratio * 1000) / 1000, gens });
  }
}

// machineNear stat of players within 6 tiles (8 for Gearwrights), and the Scuttler Whistle (+20% Burrows within 10).
function proximity(game) {
  const st = M(game);
  const ps = [];
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== 'overworld') continue;
    const s = game.stats.of(p);
    const radius = p.selfState?.class?.id === 'gearwright' ? 8 : 6;
    let whistle = 0;
    try { if (JSON.stringify(p.gear ?? {}).includes('"scuttler_whistle"')) whistle = 0.2; } catch { /* ignore */ }
    ps.push({ x: e.x, y: e.y, near: s.machineNear ?? 0, radius, whistle });
  }
  for (const e of st.list.values()) {
    const r = rt(game, e);
    let near = 0, wh = 0;
    for (const p of ps) {
      const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (p.near > 0 && d2 <= p.radius * p.radius) near = Math.max(near, p.near);
      if (p.whistle > 0 && d2 <= 100) wh = Math.max(wh, p.whistle);
    }
    r.near = near; r.whistle = wh;
  }
}

// ---------------------------------------------------------------- Factory Report (last 10 minutes, per minute)

function rollReport(game) {
  const st = M(game);
  if (game.now - st.rep.t0 < 60) return;
  st.rep.hist.push(st.rep.cur);
  if (st.rep.hist.length > 10) st.rep.hist.shift();
  st.rep.cur = { made: {}, used: {} };
  st.rep.t0 = game.now;
}

function reportView(game) {
  const st = M(game);
  const span = st.rep.hist.length + Math.min(1, (game.now - st.rep.t0) / 60);
  const sum = (key) => {
    const o = {};
    for (const b of [...st.rep.hist, st.rep.cur]) for (const [k, v] of Object.entries(b[key])) o[k] = (o[k] ?? 0) + v;
    for (const k of Object.keys(o)) o[k] = Math.round((o[k] / Math.max(1 / 6, span)) * 10) / 10;
    return o;
  };
  return { made: sum('made'), used: sum('used'), minutes: Math.round(span * 10) / 10 };
}

// ---------------------------------------------------------------- panel view and config

export function viewOf(game, e, open = false) {
  const st = M(game);
  const m = machineOf(game, e);
  const def = defOf(game, e);
  const inv = (k) => (e.data[k]?.slots ?? null);
  const v = {
    n: ++st.seq, open, id: e.id, kind: e.kind, type: m?.type ?? (def?.container ? 'container' : null),
    on: isOn(game, e), disabled: disabled(game, e), status: rt(game, e).status,
    speed: Math.round(machineSpeed(game, e) * 100) / 100, bonus: Math.round(speedBonus(game, e) * 100) / 100,
    tend: def?.tend ? Math.round(e.data.tend ?? TEND_S) : null, tendMax: TEND_S,
    flux: m?.flux ?? 0, fluxRatio: Math.round(st.flux.ratio * 1000) / 1000,
    in: inv('in'), out: inv('out'), fuel: inv('fuel'), hold: e.data.hold ?? null, item: e.data.item ?? null,
    recipe: e.data.recipe ?? null, prog: e.data.prog ?? 0, filter: e.data.filter ?? e.data.gull?.filter ?? null,
    tag: e.data.gull?.tag ?? null, name: e.data.name ?? null, hat: e.data.hat ?? null, k: e.data.k ?? null,
  };
  for (const fn of st.viewExtras) { try { Object.assign(v, fn(e, v) || {}); } catch (err) { console.error('[tb:machines] view extra', err); } }
  return v;
}

function nearEnough(player, e, r = VIEW_RANGE) {
  const p = player.entity;
  return p && p.realm === e.realm && Math.hypot(p.x - e.x, p.y - e.y) <= r + Math.max(e.data.w ?? 1, e.data.h ?? 1) / 2;
}

function openPanel(game, player, e) {
  M(game).viewers.set(player.id, e.id);
  game.sendSelf(player, 'machine', viewOf(game, e, true));
  return { ok: true };
}

// Insert from the player's inventory slot into a machine through its IO provider.
function putFrom(game, player, e, d) {
  const slot = d?.slot;
  if (!isInt(slot, 0, player.inv.slots.length - 1)) return { ok: false, err: 'invalid' };
  const s = player.inv.slots[slot];
  if (!s) return { ok: false, err: 'invalid' };
  const qty = isInt(d.qty, 1, 9999) ? Math.min(d.qty, s[1]) : s[1];
  const got = game.call('insertInto', e, s[0], qty, { slot: d.to === 'fuel' ? 'fuel' : 'in' }) || 0;
  if (got <= 0) return { ok: false, err: 'full' };
  game.inv.remove(player.inv, s[0], got);
  game.sendSelf(player, 'inv', game.invView(player));
  return { ok: true, d: { qty: got } };
}

function takeAll(game, player, e, key = 'out') {
  const keys = key === 'all' ? ['out', 'in', 'fuel'] : [key];
  let n = 0;
  for (const k of keys) {
    const inv = e.data[k];
    if (!inv?.slots) continue;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      const left = game.inv.add(player.inv, s[0], s[1]);
      n += s[1] - left;
      inv.slots[i] = left > 0 ? [s[0], left] : null;
    }
  }
  if (e.data.hold && key === 'all') {
    const left = game.inv.add(player.inv, e.data.hold.item, e.data.hold.qty ?? 1);
    if (left === 0) { e.data.hold = null; e.set('it', 0); }
  }
  if (n) game.sendSelf(player, 'inv', game.invView(player));
  return n;
}

function config(game, player, d) {
  if (!d || !isInt(d.id, 1, 2 ** 31)) return { ok: false, err: 'invalid' };
  const realm = game.realms.get(player.entity.realm);
  const e = realm?.entities.get(d.id);
  if (!e || e.type !== 'structure') return { ok: false, err: 'invalid' };
  const st = M(game);
  const def = defOf(game, e);
  const m = def?.machine;
  // containers may be tagged for Gulls from any Gull Roost's panel
  const viaRoost = !m && def?.container && realm.query(player.entity.x, player.entity.y, VIEW_RANGE + 1, [], (s) => s.kind === 'gull_roost').length > 0;
  if (!nearEnough(player, e) && !viaRoost) return { ok: false, err: 'range' };
  if (!m && !def?.container && e.kind !== 'gate_site') return { ok: false, err: 'invalid' };
  const items = game.content.items.byId;
  let changed = false;
  if (typeof d.on === 'boolean' && m) {
    e.data.on = d.on; changed = true;
    game.fx(realm, d.on ? 'build_place' : 'build_remove', e.x, e.y, { soft: 1 });
  }
  if ('recipe' in d && m?.type === 'autobench') {
    const r = d.recipe == null ? null : String(d.recipe);
    if (r && !(st.recipeOk?.(e, r))) return { ok: false, err: 'locked' };
    if (r !== e.data.recipe) { e.data.recipe = r; e.data.prog = 0; changed = true; }
  }
  if ('filter' in d) {
    const list = Array.isArray(d.filter) ? [...new Set(d.filter.filter((x) => typeof x === 'string' && items[x]))].slice(0, 4) : [];
    if (m?.type === 'mover' && m.filter) { e.data.filter = list; changed = true; }
    else if (!m || e.kind === 'gate_site') { e.data.gull = { ...(e.data.gull ?? {}), filter: list }; changed = true; }
  }
  if ('tag' in d && (!m || e.kind === 'gate_site')) {
    const tag = d.tag === 'supply' || d.tag === 'request' ? d.tag : null;
    e.data.gull = { ...(e.data.gull ?? {}), tag };
    changed = true;
    game.bus.emit('gull.tags', { structure: e, tag });
  }
  if ('k' in d && m?.type === 'echo') {
    const k = d.k == null ? null : Number(d.k);
    if (k != null && (!isInt(k, 1, 6) || !game.call('hasUnlock', 'vault:' + k))) return { ok: false, err: 'locked' };
    e.data.k = k; e.data.acc = 0; changed = true;
  }
  if (d.take) { takeAll(game, player, e, d.take === 'all' ? 'all' : d.take === 'in' ? 'in' : d.take === 'fuel' ? 'fuel' : 'out'); changed = true; }
  if (d.put) { const r = putFrom(game, player, e, d.put); if (!r.ok) return r; changed = true; }
  if (changed) updateStatus(game, e);
  if (m) st.viewers.set(player.id, e.id);
  return { ok: true, d: m ? viewOf(game, e) : { id: e.id, gull: e.data.gull ?? null } };
}

function rename(game, player, d) {
  if (!d || !isInt(d.id, 1, 2 ** 31)) return { ok: false, err: 'invalid' };
  const e = game.realms.get(player.entity.realm)?.entities.get(d.id);
  if (!e || typeOf(game, e) !== 'burrow') return { ok: false, err: 'invalid' };
  if (!nearEnough(player, e)) return { ok: false, err: 'range' };
  if (d.name != null) e.data.name = sanitizeName(String(d.name));
  if (d.hat != null) {
    if (!HATS.includes(d.hat)) return { ok: false, err: 'invalid' };
    e.data.hat = d.hat;
    game.bus.emit('burrow.hat', { burrow: e, hat: d.hat });
  }
  return { ok: true, d: viewOf(game, e) };
}

// ---------------------------------------------------------------- generic IO for inventory machines

function genericIO(game) {
  const items = game.content.items.byId;
  return {
    insert(e, item, qty, opts = {}) {
      const m = machineOf(game, e);
      const def = defOf(game, e);
      if (!m || !items[item]) return 0;
      let inv = null;
      switch (m.type) {
        case 'generator':
          if (def.consumes ? item === def.consumes.item : (items[item].fuel ?? 0) > 0 && (m.fuelPer10s ?? 0) > 0) inv = invOf(e, 'fuel', 2);
          break;
        case 'tiller': if (items[item].cat === 'seed') inv = invOf(e, 'in', 1); break;
        case 'echo': {
          const k = e.data.k;
          if (/^vault_key_\d$/.test(item) && (k == null || item === 'vault_key_' + k)) inv = invOf(e, 'in', 4);
          break;
        }
        case 'seller': if (e.kind === 'mint' && (item === 'glintstone' || items[item].bar)) inv = invOf(e, 'in', 8); break;
        case 'hopper': inv = invOf(e, 'out', m.slots ?? 8); break;
        case 'autobench': return M(game).benchInsert?.(e, item, qty) ?? 0;
        default: return 0;
      }
      if (!inv) return 0;
      const got = qty - game.inv.add(inv, item, qty);
      if (got > 0) want(game, e);
      return got;
    },
    extract(e, filter, max) {
      const r = takeFrom(game, e.data.out, filter, max);
      if (r && e.data.out?.slots.every((s) => !s)) e.set('it', 0);
      return r;
    },
  };
}

// ---------------------------------------------------------------- system

export default {
  name: 'machines',

  init(game) {
    GAMES.set(game, {
      list: new Map(), byType: new Map(), rt: new Map(), gen: new Map(), viewers: new Map(), viewExtras: [],
      flux: { supply: 0, demand: 0, ratio: 1, gens: 0 }, fluxKey: '', seq: 0, tick: 0,
      rep: { t0: 0, cur: { made: {}, used: {} }, hist: [] },
      benchInsert: null, recipeOk: null,
    });
    const svc = game.services;
    svc.register('machineSpeed', (e) => machineSpeed(game, e));
    svc.register('disableMachine', (e, seconds) => {
      if (!e || e.removed) return;
      e.data.disabledUntil = Math.max(e.data.disabledUntil ?? 0, game.now + Math.max(0, seconds));
      updateStatus(game, e);
      game.fx(e.realm, 'tend_warning', e.x, e.y, { disabled: 1 });
    });
    svc.register('machineClusters', () => {
      const counts = new Map();
      for (const e of M(game).list.values()) {
        if (!defOf(game, e)?.countsToCap) continue;
        const k = plotKeyOf(e);
        if (k >= 0) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts].map(([k, count]) => ({ px: k % 9, py: Math.floor(k / 9), count })).sort((a, b) => b.count - a.count || a.py - b.py || a.px - b.px);
    });
    svc.register('refillTend', (realm, x, y, r, player) => refillTend(game, realm, x, y, r, player ?? null));
    svc.register('machineCapAt', (px, py) => machineCapAt(game, px, py));
    svc.register('machineView', (e) => viewOf(game, e));

    game.call('registerPlaceValidator', (kind, realm, tx, ty) => placeValidator(game, kind, realm, tx, ty));
    const io = genericIO(game);
    for (const def of game.content.structures) {
      const t = def.machine?.type;
      if (['burrow', 'hopper', 'autobench', 'drill', 'tiller', 'producer', 'seller', 'echo', 'generator'].includes(t)) game.call('registerIO', def.id, io);
      if (def.machine && t !== 'turret') game.call('registerInteract', def.id, (g, player, e) => openPanel(g, player, e));
    }

    game.bus.on('structure.placed', ({ structure }) => { if (structure && machineOf(game, structure)) register(game, structure); });
    game.bus.on('structure.removed', ({ structure }) => {
      if (!structure || !M(game).list.has(structure.id)) return;
      unregister(game, structure);
      spill(game, structure);
    });
    // Tending refills only from the player.active rule (TECH_SPEC 5.4), never from raw input.
    game.bus.on('player.active', ({ player }) => {
      const e = player?.entity;
      if (e) refillTend(game, e.realm, e.x, e.y, TEND_RADIUS, player);
    });
  },

  load(game) {
    const st = M(game);
    st.list.clear(); st.byType.clear(); st.rt.clear();
    const realm = game.realms.get('overworld');
    for (const e of realm?.entities.values() ?? []) if (e.type === 'structure' && machineOf(game, e)) register(game, e);
    for (const e of st.list.values()) updateStatus(game, e);
    computeFlux(game);
  },

  handlers: {
    'machine.config': (game, player, d) => config(game, player, d),
    'burrow.rename': (game, player, d) => rename(game, player, d),
  },

  slowTick(game) {
    const st = M(game);
    st.tick++;
    const live = running(game);
    if (live) {
      proximity(game);
      // Tending drains while a machine works (generators: while producing)
      for (const e of st.list.values()) {
        const def = defOf(game, e);
        if (!def?.tend || !isOn(game, e)) continue;
        const working = def.machine?.type === 'generator' ? (st.gen.get(e.id) ?? 0) > 0 : (def.machine?.type === 'turret' || wanting(game, e));
        if (!working) continue;
        const was = e.data.tend ?? TEND_S;
        e.data.tend = Math.max(0, was - 1);
        if (was > 0 && e.data.tend <= 0) game.fx(e.realm, 'tend_warning', e.x, e.y);
      }
    }
    computeFlux(game);
    for (const e of st.list.values()) {
      if (e.data.disabledUntil && e.data.disabledUntil <= game.now) delete e.data.disabledUntil;
      updateStatus(game, e);
      const r = rt(game, e);
      if (live && (r.status & STATUS.UNTENDED) && game.now - r.lastWarn >= 4) { r.lastWarn = game.now; game.fx(e.realm, 'tend_warning', e.x, e.y); }
    }
    if (live && st.flux.ratio < 1 && st.tick % 5 === 0) {
      for (const e of machinesOfType(game, 'generator')) game.fx(e.realm, 'flux_arc', e.x, e.y, { low: 1 });
    }
    rollReport(game);
    if (st.list.size && st.tick % 10 === 0) game.sendWorld('report', reportView(game));
    // live machine panel updates
    if (st.viewers.size) {
      for (const [pid, mid] of st.viewers) {
        const player = game.players.get(pid);
        const e = st.list.get(mid);
        if (!player || !e || !nearEnough(player, e, VIEW_RANGE + 4)) { st.viewers.delete(pid); continue; }
        game.sendSelf(player, 'machine', viewOf(game, e, false));
      }
    }
  },

  onLeave(game, player) { M(game).viewers.delete(player.id); },
};

export { reportView, updateStatus, computeFlux, isEmptyInv, BIOME_TIER };
