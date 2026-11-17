// Producers and generators (WP8, DESIGN 7.2, 8.2, 8.3):
//   Drip Collector  1 salt / 90 s on the shore, else fresh water that waters the 4 adjacent soil tiles
//   Sap Tap         1 resin / 60 s while attached to a tree (the tree is marked `data.tapped` and should not be cut)
//   Creel           1 biome common fish / 180 s on water (holds 5)        Trawl Buoy  4 common fish / min (Flux 5)
//   Hum Hive        1 honeycomb / 120 s with 4+ crops within 3 tiles
//   Lodestone Drill 10 units / min on a vein plot: 99% that biome's ore, 1% its rare (Flux 15)
//   Tiller Bot      one farm action (harvest, else water, else plant from its seed slot) per 2 s in 5x5 (farmTend)
//   Generators      Tide Wheel 5 (10 within 60 s around a tide change, +50% in storms), Ember Boiler 20 (1 fuel unit
//                   per 10 s), Prism Array 30 by day (+50% heatwave), Rime Turbine 40 on Hoarfrost (+50% blizzard),
//                   Umbral Reactor 150 (1 echoglass per 10 min). Untended generators give 10%.
// Generator output is written to machines.js's Flux table once per second.

import { T, FLAG, BIOME_TIER, plotOfTile, inPlotBounds, biomeOf, isWater } from '../../../shared/grid.js';
import { DRILL_RARE } from '../../../shared/rules/constants.js';
import { M, machinesOfType, machineSpeed, isOn, running, want, rt, machineOf, defOf, outAdd, invOf, report, tendFactor } from './machines.js';

const GEM_RARE_FALLBACK = { 1: 'glintstone', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' };
const TIDE_WINDOW = 30;

const GAMES = new WeakMap();
const P = (game) => GAMES.get(game);

function biomeAt(e) {
  const { px, py } = plotOfTile(e.data.tx, e.data.ty);
  return inPlotBounds(px, py) ? biomeOf(px, py) : 'greenmarrow';
}

function touchesWater(realm, e, r = 1) {
  for (let y = e.data.ty - r; y < e.data.ty + (e.data.h ?? 1) + r; y++) {
    for (let x = e.data.tx - r; x < e.data.tx + (e.data.w ?? 1) + r; x++) {
      const g = realm.groundAt(x, y);
      if (g !== T.EMPTY && isWater(g)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- generators

export function generatorOutput(game, e) {
  const def = defOf(game, e);
  const m = def.machine;
  const weather = game.call('weatherAt', e.x, e.y);
  const wparams = game.content.weather.byId[weather]?.params ?? {};
  let out = 0;
  switch (m.cond) {
    case 'shore': {
      out = m.flux;
      const c = game.call('clockState');
      if (c?.tide) {
        const len = c.tide.low ? (c.tide.king ? 240 : 120) : 240;
        if (len - c.tide.left <= TIDE_WINDOW || c.tide.left <= TIDE_WINDOW) out = def.tideBonus?.flux ?? m.flux * 2;
      }
      if (weather === 'storm') out *= wparams.tideWheelFlux ?? 1.5;
      break;
    }
    case 'none': out = (e.data.fuelT ?? 0) > 0 ? m.flux : 0; break;
    case 'day': {
      const ti = game.call('timeInfo');
      out = ti.isNight ? 0 : m.flux;
      if (weather === 'heatwave') out *= wparams.prismArrayFlux ?? 1.5;
      break;
    }
    case 'hoarfrost':
      out = biomeAt(e) === 'hoarfrost' ? m.flux : 0;
      if (weather === 'blizzard') out *= def.blizzardMult ?? wparams.rimeTurbineFlux ?? 1.5;
      break;
    case 'echoglass': out = (e.data.fuelT ?? 0) > 0 ? m.flux : 0; break;
    default: out = m.flux;
  }
  return out * tendFactor(game, e);
}

// Burn fuel for one second of running (Ember Boiler: fuel units, 1 per 10 s; Umbral Reactor: 1 echoglass per 600 s).
function burn(game, e) {
  const def = defOf(game, e);
  const m = def.machine;
  const r = rt(game, e);
  if (m.cond !== 'none' && m.cond !== 'echoglass') return;
  if ((e.data.fuelT ?? 0) > 0) { e.data.fuelT -= 1; r.noInput = false; return; }
  const fuel = invOf(e, 'fuel', 2);
  const items = game.content.items.byId;
  for (const s of fuel.slots) {
    if (!s) continue;
    let secs = 0;
    if (m.cond === 'echoglass') { if (s[0] !== (def.consumes?.item ?? 'echoglass')) continue; secs = def.consumes?.every ?? 600; }
    else { const units = items[s[0]]?.fuel ?? 0; if (!units) continue; secs = (units * 10) / Math.max(0.01, m.fuelPer10s || 1); }
    game.inv.remove(fuel, s[0], 1);
    report(game, s[0], 1, false);
    e.data.fuelT = secs - 1;
    r.noInput = false;
    return;
  }
  r.noInput = true;
}

function tickGenerators(game) {
  const ms = M(game);
  for (const e of machinesOfType(game, 'generator')) {
    if (e.removed) continue;
    if (!running(game) || !isOn(game, e)) { ms.gen.set(e.id, 0); continue; }
    burn(game, e);
    const out = generatorOutput(game, e);
    ms.gen.set(e.id, out);
    if (out > 0) want(game, e);
    const pv = Math.min(255, Math.round((out / Math.max(1, machineOf(game, e).flux * 1.5)) * 255));
    if (e.pub.p !== pv) e.set('p', pv);
  }
}

// ---------------------------------------------------------------- producers

function cropsNear(realm, x, y, r) {
  return realm.query(x, y, r, [], (c) => c.type === 'crop').length;
}

function treeOf(game, realm, e) {
  if (e.data.tree) {
    const t = realm.entities.get(e.data.tree);
    if (t && !t.removed) return t;
  }
  const t = realm.query(e.x, e.y, 1.6, [], (n) => n.type === 'node' && game.content.nodes.byId[n.kind]?.cls === 'wood')[0] ?? null;
  e.data.tree = t?.id ?? null;
  if (t) t.data.tapped = e.id;
  return t;
}

function waterSoil(game, realm, e) {
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = e.data.tx + dx, y = e.data.ty + dy;
    if (realm.groundAt(x, y) !== T.SOIL) continue;
    realm.setFlag(x, y, FLAG.WATERED, true);
    n++;
  }
  if (n) { game.fx(realm, 'water_pour', e.x, e.y); game.bus.emit('soil.watered', { by: e, n }); }
  return n;
}

function producerItem(game, realm, e) {
  const m = machineOf(game, e);
  if (m.table === 'fish_common') return game.call('rollFish', biomeAt(e), { commonOnly: true });
  return m.item ?? null;
}

function tickProducer(game, e, dt) {
  const realm = game.realms.get(e.realm);
  const m = machineOf(game, e);
  const r = rt(game, e);
  // condition
  let item = null, ok = true, waterMode = false;
  switch (m.cond) {
    case 'shore': waterMode = !touchesWater(realm, e, 1); item = waterMode ? null : m.item; break;
    case 'tree': ok = !!treeOf(game, realm, e); item = m.item; break;
    case 'crops4': ok = cropsNear(realm, e.x, e.y, 3) >= 4; item = m.item; break;
    case 'water': ok = touchesWater(realm, e, 0) || touchesWater(realm, e, 1); item = m.table ? '?' : m.item; break;
    default: item = m.item;
  }
  r.noInput = !ok;
  if (!ok) return;
  const out = invOf(e, 'out', m.slots ?? 4);
  if (item && item !== '?' && game.inv.spaceFor(out, item) < 1) { r.blocked = true; return; }
  if (item === '?' && out.slots.every((s) => s)) { r.blocked = true; return; }
  r.blocked = false;
  want(game, e);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  const pv = Math.min(255, Math.floor((e.data.acc / m.interval) * 16) * 16);
  if (e.pub.p !== pv) e.set('p', pv);
  if (e.data.acc < m.interval) return;
  e.data.acc -= m.interval;
  if (waterMode) { waterSoil(game, realm, e); return; }
  const got = item === '?' ? producerItem(game, realm, e) : item;
  if (!got) return;
  if (outAdd(game, e, got, 1) > 0) r.blocked = true;
}

function biomeOre(game, biome) {
  const st = P(game);
  if (st.ore.has(biome)) return st.ore.get(biome);
  const b = game.content.biomes.byId[biome];
  let ore = null;
  for (const id of b?.nodeTable ?? []) {
    const n = game.content.nodes.byId[id];
    if (n?.cls === 'ore') { ore = n.drops?.[0]?.item ?? null; break; }
  }
  st.ore.set(biome, ore);
  return ore;
}

// One Drill unit: 99% the biome's ore, 1% (DRILL_RARE) the biome's rare.
export function drillPick(game, biome, rng, share = DRILL_RARE) {
  const ore = biomeOre(game, biome);
  const rare = (game.content.modules.nodes?.GEM_RARE ?? GEM_RARE_FALLBACK)[BIOME_TIER[biome] ?? 1];
  return rng.chance(share ?? DRILL_RARE) && rare ? rare : ore;
}

function tickDrill(game, e, dt) {
  const m = machineOf(game, e);
  const r = rt(game, e);
  const biome = biomeAt(e);
  const ore = biomeOre(game, biome);
  if (!ore) { r.noInput = true; return; }
  const out = invOf(e, 'out', 12);
  if (game.inv.spaceFor(out, ore) < 1) { r.blocked = true; return; }
  r.blocked = false; r.noInput = false;
  want(game, e);
  const interval = 60 / (m.rate || 10);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  if (e.data.acc < interval) return;
  e.data.acc -= interval;
  outAdd(game, e, drillPick(game, biome, P(game).rng, m.rareShare), 1);
  if (game.now - (r.fxAt ?? -9) > 3) { r.fxAt = game.now; game.fx(e.realm, 'machine_work', e.x, e.y); }
}

function tickTiller(game, e, dt) {
  const m = machineOf(game, e);
  const r = rt(game, e);
  const out = invOf(e, 'out', 8);
  if (out.slots.every((s) => s)) { r.blocked = true; return; }
  r.blocked = false;
  want(game, e);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  if (e.data.acc < (m.interval ?? 2)) return;
  e.data.acc = 0;
  const seeds = invOf(e, 'in', 1);
  const seed = seeds.slots[0]?.[0] ?? null;
  const res = game.call('farmTend', e.realm, e.data.tx, e.data.ty, m.radius ?? 2, seed) || { did: null, items: [] };
  r.noInput = !res.did;
  if (res.did === 'plant' && seed) { game.inv.remove(seeds, seed, 1); report(game, seed, 1, false); }
  for (const { item, qty } of res.items ?? []) {
    const left = outAdd(game, e, item, qty);
    if (left > 0) game.call('dropItem', e.realm, e.x, e.y + 1, item, left, {});
  }
  if (res.did) game.fx(e.realm, res.did === 'water' ? 'water_pour' : res.did === 'harvest' ? 'crop_grow' : 'build_place', e.x, e.y, { soft: 1 });
}

// ---------------------------------------------------------------- system

export default {
  name: 'producers',

  init(game) {
    GAMES.set(game, { rng: game.rng.fork('producers'), ore: new Map() });
    M(game).viewExtras.push((e, v) => {
      const m = machineOf(game, e);
      if (!m) return null;
      if (m.type === 'generator') return { output: Math.round((M(game).gen.get(e.id) ?? 0) * 10) / 10, fuelT: Math.max(0, Math.round(e.data.fuelT ?? 0)), cond: m.cond };
      if (m.type === 'drill') return { ore: biomeOre(game, biomeAt(e)) };
      if (m.type === 'producer') return { interval: m.interval, acc: Math.round((e.data.acc ?? 0) * 10) / 10 };
      return v ? null : null;
    });
    // A tapped tree is protected while its Sap Tap stands (WP4 hitNode should honour node.data.tapped).
    game.bus.on('structure.removed', ({ structure }) => {
      if (structure?.kind !== 'sap_tap' || !structure.data.tree) return;
      const t = game.realms.get(structure.realm)?.entities.get(structure.data.tree);
      if (t && t.data.tapped === structure.id) delete t.data.tapped;
    });
  },

  slowTick(game) {
    tickGenerators(game);
    if (!running(game)) return;
    for (const e of machinesOfType(game, 'producer')) if (!e.removed && isOn(game, e)) tickProducer(game, e, 1);
    for (const e of machinesOfType(game, 'drill')) if (!e.removed && isOn(game, e)) tickDrill(game, e, 1);
  },

  tick(game, dt) {
    if (!running(game)) return;
    for (const e of machinesOfType(game, 'tiller')) if (!e.removed && isOn(game, e)) tickTiller(game, e, dt);
  },
};
