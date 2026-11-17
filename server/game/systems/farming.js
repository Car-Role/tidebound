// WP9 farming: soil tiles, crops, watering (by hand, rain, Sprinkler 5x5, Drip Collector), growth stages, night-only
// crops, heatwave (water lasts half a stage), wither after 2 unwatered days (not with H11 / no_wither), daily pest
// events (Scarecrow 7x7 protects), crop auras (Hum Hive, Greenwarden, cropGrowth), and the farmTend / growCrops
// services (DESIGN 14.1, 7.2; TECH_SPEC 5.5). Soil is a tile (id 10), crops are `crop` entities saved by this system.

import { REACH } from '../../../shared/config.js';
import { T, FLAG } from '../../../shared/grid.js';
import { isInt } from '../../../shared/protocol.js';
import { yieldMult, dropQty } from '../../../shared/rules/loot.js';
import { createEntity } from '../entities.js';
import { itemDef, worldSkill } from './inventory.js';
import { burstDrops } from './gathering.js';

const FARM_REACH = REACH + 1.5;
const DAY_S = 24 * 60;
const BIOME_GROUND = new Set([T.GREENMARROW, T.SALTFEN, T.EMBERREACH, T.GLASSWASTE, T.HOARFROST, T.UMBRAL]);
const PLAYER_AURA_R = 6;
const CLUSTER_LINK = 2;

const cropsMap = (game) => (game._crops ||= new Map());     // key "realm:tx,ty" -> entity
const keyOf = (realmId, tx, ty) => realmId + ':' + tx + ',' + ty;

export function cropAt(game, realm, tx, ty) {
  const e = cropsMap(game).get(keyOf(realm.id, tx, ty));
  return e && !e.removed ? e : null;
}

const cropDef = (game, kind) => game.content.crops.byId[kind];
const isRipe = (game, e) => !e.data.withered && e.data.stage >= (cropDef(game, e.kind)?.stages ?? 4);

function timeInfo(game, x, y) { return (Number.isFinite(x) ? game.call('timeInfo', x, y) : game.call('timeInfo')) || {}; }
const weatherDef = (game, ti) => game.content.weather.byId?.[ti.weather] ?? null;
// Weather where a crop stands (WP7 timeInfo(x, y) is per biome), cached per plot within one slow tick.
function ctxAt(game, cache, x, y) {
  const k = (Math.floor(x / 20) * 64 + Math.floor(y / 20));
  let c = cache.get(k);
  if (!c) {
    const ti = timeInfo(game, x, y);
    c = { wet: !!weatherDef(game, ti)?.flags?.includes('wet'), heatwave: ti.weather === 'heatwave', night: !!ti.isNight, ti };
    cache.set(k, c);
  }
  return c;
}
const isHeatwaveAt = (game, x, y) => timeInfo(game, x, y).weather === 'heatwave';

function syncPub(game, e) {
  const d = e.data;
  const st = d.withered ? -1 : d.stage;
  if (e.pub.st !== st) e.set('st', st);
  const w = d.wet > 0 ? 1 : 0;
  if (e.pub.w !== w) {
    e.set('w', w);
    game.realms.get(e.realm)?.setFlag(d.tx, d.ty, FLAG.WATERED, !!w);
  }
}

function spawnCrop(game, realm, kind, tx, ty, data = {}) {
  const def = cropDef(game, kind);
  if (!def) return null;
  const e = createEntity(game, {
    type: 'crop', kind, x: tx + 0.5, y: ty + 0.5, hp: 1, radius: 0.4,
    data: { tx, ty, stage: 0, prog: 0, wet: 0, dry: 0, withered: false, planter: null, ...data },
    pub: { st: 0, w: 0 },
  });
  realm.add(e);
  cropsMap(game).set(keyOf(realm.id, tx, ty), e);
  syncPub(game, e);
  return e;
}

function removeCrop(game, e) {
  const realm = game.realms.get(e.realm);
  cropsMap(game).delete(keyOf(e.realm, e.data.tx, e.data.ty));
  if (realm) { realm.remove(e); realm.setFlag(e.data.tx, e.data.ty, FLAG.WATERED, false); }
}

function water(game, e) {
  const def = cropDef(game, e.kind);
  if (!def || isRipe(game, e) || e.data.withered) return false;
  if (e.data.wet > 0) return false;
  e.data.wet = def.stageTime;
  e.data.dry = 0;
  syncPub(game, e);
  return true;
}

function structuresNear(realm, x, y, r, kinds) {
  return realm.query(x, y, r + 1.5, [], (o) => o.type === 'structure' && kinds.has(o.kind) && !o.removed);
}

const SPRINKLER = new Set(['sprinkler']);
const DRIP = new Set(['drip_collector']);
const HIVE = new Set(['hum_hive']);
const SCARE = new Set(['scarecrow']);

// Automatic water source for a crop tile: Sprinkler (5x5) or a Drip Collector next to it that is not on the shore.
function autoWatered(game, realm, tx, ty) {
  for (const s of structuresNear(realm, tx + 0.5, ty + 0.5, 3, SPRINKLER)) {
    const r = game.content.structures.byId[s.kind]?.waters ?? 2;
    if (Math.abs(s.data.tx - tx) <= r && Math.abs(s.data.ty - ty) <= r) return true;
  }
  for (const s of structuresNear(realm, tx + 0.5, ty + 0.5, 1.5, DRIP)) {
    const adj = Math.abs(s.data.tx - tx) + Math.abs(s.data.ty - ty) === 1;
    if (!adj) continue;
    let shore = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const g = realm.groundAt(s.data.tx + dx, s.data.ty + dy); if (g <= T.TIDAL) shore = true; }
    if (!shore) return true;
  }
  return false;
}

function growthRate(game, realm, e) {
  const { tx, ty } = e.data;
  let bonus = game.stats.world().cropGrowthWorld ?? 0;
  for (const h of structuresNear(realm, tx + 0.5, ty + 0.5, 3, HIVE)) {
    const a = game.content.structures.byId[h.kind]?.cropAura;
    if (a && Math.max(Math.abs(h.data.tx - tx), Math.abs(h.data.ty - ty)) <= a.radius) bonus += a.v;
  }
  let best = 0;
  for (const p of game.players.values()) {
    const pe = p.entity;
    if (!pe || pe.realm !== realm.id || Math.hypot(pe.x - e.x, pe.y - e.y) > PLAYER_AURA_R) continue;
    const s = game.stats.of(p);
    best = Math.max(best, (s.cropGrowth ?? 0) + (game.stats.hasFlag(p, 'crop_aura') ? 0.2 : 0));
  }
  return 1 + bonus + best;
}

function noWither(game, e) {
  if (worldSkill(game, 'H11')) return true;
  for (const p of game.players.values()) if (p.token === e.data.planter && game.stats.hasFlag(p, 'no_wither')) return true;
  return false;
}

// Advance one crop by dt seconds of world time.
function growCrop(game, realm, e, dt, ctx) {
  const d = e.data;
  const def = cropDef(game, e.kind);
  if (!def || d.withered || isRipe(game, e)) return;
  if (d.wet <= 0 && (ctx.wet || autoWatered(game, realm, d.tx, d.ty))) d.wet = def.stageTime;
  if (def.nightOnly && !ctx.night) { syncPub(game, e); return; }
  if (d.wet > 0) {
    d.prog += growthRate(game, realm, e) * dt;
    d.wet -= dt * (ctx.heatwave ? 2 : 1);
    d.dry = 0;
    if (d.prog >= def.stageTime) {
      d.prog = 0;
      d.stage = Math.min(def.stages, d.stage + 1);
      d.wet = 0;                                   // water once per stage
      game.fx(realm, 'crop_grow', e.x, e.y - 0.3, { ripe: d.stage >= def.stages ? 1 : 0 });
    }
  } else {
    d.dry += dt;
    if (d.dry >= 2 * DAY_S && !noWither(game, e)) {
      d.withered = true;
      game.fx(realm, 'break_plant', e.x, e.y, { wither: 1 });
    }
  }
  syncPub(game, e);
}

// Harvest a ripe crop. Returns the items (not yet given or dropped).
function harvestItems(game, e, player) {
  const def = cropDef(game, e.kind);
  const heat = isHeatwaveAt(game, e.x, e.y) && def.heatwaveYield;
  const [a, b] = heat ? def.heatwaveYield : def.yield;
  const rng = game.rng;
  let mult = 1;
  if (player) { const s = game.stats.of(player); mult = yieldMult(s.yieldAll ?? 0, s.yieldCrop ?? 0); }
  const qty = Math.max(1, dropQty(rng.int(a, b), mult, () => rng.float(0, 1)));
  const out = [{ item: e.kind, qty }];
  if (def.seedReturn && rng.float(0, 1) < def.seedReturn) out.push({ item: def.seed, qty: 1 });
  return out;
}

function finishHarvest(game, realm, e) {
  const def = cropDef(game, e.kind);
  if (def.regrows) {
    e.data.stage = Math.max(0, def.stages - 2);
    e.data.prog = 0; e.data.wet = 0; e.data.dry = 0;
    syncPub(game, e);
  } else removeCrop(game, e);
}

function doHarvest(game, player, e, { byMachine = false } = {}) {
  const realm = game.realms.get(e.realm);
  if (e.data.withered) {
    removeCrop(game, e);
    game.fx(realm, 'break_plant', e.x, e.y);
    return { items: [] };
  }
  if (!isRipe(game, e)) return null;
  const items = harvestItems(game, e, byMachine ? null : player);
  finishHarvest(game, realm, e);
  game.fx(realm, 'break_plant', e.x, e.y, { harvest: 1 });
  const qty = items.find((i) => i.item === e.kind)?.qty ?? 0;
  if (player && !byMachine) {
    const pe = player.entity;
    burstDrops(game, realm, e.x, e.y, items, { dir: Math.atan2(pe.y - e.y, pe.x - e.x), maxPieces: 3 });
    const val = itemDef(game, e.kind)?.value ?? 1;
    game.call('grantXp', player, Math.max(1, Math.ceil(val * 0.4)) * qty, 'harvest');
  }
  game.bus.emit('crop.harvested', { player: byMachine ? null : player, crop: e.kind, qty, byMachine });
  return { items };
}

function plantableTile(realm, tx, ty) {
  return realm.groundAt(tx, ty) === T.SOIL && !realm.hasFlag(tx, ty, FLAG.SOLID);
}

function tileInReach(player, tx, ty) {
  const pe = player.entity;
  return Math.hypot(tx + 0.5 - pe.x, ty + 0.5 - pe.y) <= FARM_REACH;
}

function plantAt(game, realm, tx, ty, seedItem, planter) {
  const sdef = itemDef(game, seedItem);
  const cropId = typeof sdef?.crop === 'string' ? sdef.crop : null;
  if (!cropId || !cropDef(game, cropId)) return null;
  if (!plantableTile(realm, tx, ty) || cropAt(game, realm, tx, ty) || realm.entityAtTile(tx, ty, 'structure')) return null;
  const wetTile = realm.hasFlag(tx, ty, FLAG.WATERED);
  const e = spawnCrop(game, realm, cropId, tx, ty, { planter: planter?.token ?? null, wet: wetTile ? cropDef(game, cropId).stageTime : 0 });
  game.fx(realm, 'crop_grow', tx + 0.5, ty + 0.5, { plant: 1 });
  return e;
}

// Connected crop clusters (crops within CLUSTER_LINK tiles of each other).
function clusters(list) {
  const seen = new Set(), out = [];
  for (const a of list) {
    if (seen.has(a)) continue;
    const group = [], stack = [a];
    seen.add(a);
    while (stack.length) {
      const c = stack.pop();
      group.push(c);
      for (const b of list) {
        if (seen.has(b)) continue;
        if (Math.max(Math.abs(b.data.tx - c.data.tx), Math.abs(b.data.ty - c.data.ty)) <= CLUSTER_LINK) { seen.add(b); stack.push(b); }
      }
    }
    out.push(group);
  }
  return out;
}

function pestEvent(game) {
  const PESTS = game.content.modules.crops?.PESTS ?? { chancePerDay: 0.15, share: 0.2, spawns: 'burrowgrub' };
  const rng = (game._farmRng ||= game.rng.fork('farming'));
  const byRealm = new Map();
  for (const e of cropsMap(game).values()) {
    if (e.removed || e.data.withered) continue;
    if (!byRealm.has(e.realm)) byRealm.set(e.realm, []);
    byRealm.get(e.realm).push(e);
  }
  let total = 0;
  for (const [rid, list] of byRealm) {
    const realm = game.realms.get(rid);
    if (!realm) continue;
    for (const group of clusters(list)) {
      const open = group.filter((c) => !structuresNear(realm, c.x, c.y, 3, SCARE).some((s) =>
        Math.max(Math.abs(s.data.tx - c.data.tx), Math.abs(s.data.ty - c.data.ty)) <= (game.content.structures.byId[s.kind]?.protects ?? 3)));
      if (!open.length || rng.float(0, 1) >= PESTS.chancePerDay) continue;
      const n = Math.max(1, Math.ceil(open.length * PESTS.share));
      rng.shuffle(open);
      const eaten = open.slice(0, n);
      for (const c of eaten) { game.fx(realm, 'break_plant', c.x, c.y, { pest: 1 }); removeCrop(game, c); }
      total += eaten.length;
      const at = eaten[0];
      for (let i = 0; i < Math.min(3, Math.ceil(eaten.length / 2)); i++) {
        try { game.call('spawnMob', realm, PESTS.spawns, at.x + rng.float(-1, 1), at.y + rng.float(-1, 1), {}); } catch { /* combat package optional */ }
      }
    }
  }
  if (total > 0) game.toast(null, `Burrowgrubs ate ${total} crop${total > 1 ? 's' : ''}! Scarecrows keep them away.`, 'warn');
  return total;
}

export default {
  name: 'farming',

  init(game) {
    const reg = (n, fn) => game.services.register(n, fn);
    reg('farmTend', (realm, tx, ty, r, seedItem) => {
      realm = typeof realm === 'string' ? game.realms.get(realm) : realm;
      const none = { did: null, items: [] };
      if (!realm) return none;
      r = Math.max(0, Math.min(8, Math.floor(r)));
      const tiles = [];
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) tiles.push([x, y]);
      for (const [x, y] of tiles) {
        const c = cropAt(game, realm, x, y);
        if (c && (isRipe(game, c) || c.data.withered)) return { did: 'harvest', items: doHarvest(game, null, c, { byMachine: true })?.items ?? [] };
      }
      for (const [x, y] of tiles) {
        const c = cropAt(game, realm, x, y);
        if (c && water(game, c)) { game.fx(realm, 'water_pour', c.x, c.y); return { did: 'water', items: [] }; }
      }
      if (seedItem) {
        for (const [x, y] of tiles) {
          if (plantAt(game, realm, x, y, seedItem, null)) return { did: 'plant', items: [] };
        }
      }
      return none;
    });
    reg('growCrops', (realm, x, y, r, stages) => {
      realm = typeof realm === 'string' ? game.realms.get(realm) : realm;
      if (!realm) return 0;
      let n = 0;
      for (const e of realm.query(x, y, r, [], (o) => o.type === 'crop')) {
        const def = cropDef(game, e.kind);
        if (!def || e.data.withered || isRipe(game, e)) continue;
        e.data.stage = Math.min(def.stages, e.data.stage + Math.max(1, Math.floor(stages)));
        e.data.prog = 0;
        syncPub(game, e);
        game.fx(realm, 'crop_grow', e.x, e.y - 0.3);
        n++;
      }
      return n;
    });
    game.call('registerInteract', 'crop', (g, player, e) => {
      if (isRipe(g, e) || e.data.withered) { doHarvest(g, player, e); return { ok: true }; }
      if (water(g, e)) { g.fx(e.realm, 'water_pour', e.x, e.y); return { ok: true }; }
      return { ok: false, err: 'busy' };
    });
  },

  slowTick(game) {
    const ti = timeInfo(game);
    const cache = new Map();
    for (const e of cropsMap(game).values()) {
      if (e.removed) { cropsMap(game).delete(keyOf(e.realm, e.data.tx, e.data.ty)); continue; }
      const realm = game.realms.get(e.realm);
      if (!realm) continue;
      // a crop whose soil was paved over goes away
      if (realm.groundAt(e.data.tx, e.data.ty) !== T.SOIL) { removeCrop(game, e); continue; }
      growCrop(game, realm, e, 1, ctxAt(game, cache, e.x, e.y));
    }
    const day = ti.day ?? game.world.day ?? 1;
    if (game._farmDay == null) game._farmDay = day;
    else if (day !== game._farmDay) { game._farmDay = day; pestEvent(game); }
  },

  handlers: {
    'farm.till': (game, player, d) => {
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5)) return { ok: false, err: 'invalid' };
      const realm = game.realms.get(player.entity.realm);
      if (!tileInReach(player, d.tx, d.ty)) return { ok: false, err: 'range' };
      const g = realm.groundAt(d.tx, d.ty);
      if (!BIOME_GROUND.has(g)) return { ok: false, err: 'invalid' };
      if (realm.kind === 'overworld' && !realm.hasFlag(d.tx, d.ty, FLAG.OWNED)) return { ok: false, err: 'denied' };
      if (realm.hasFlag(d.tx, d.ty, FLAG.SOLID) || realm.entityAtTile(d.tx, d.ty)) return { ok: false, err: 'busy' };
      if (!game.call('takeItems', player, [{ item: 'fieldstone', qty: 1 }])) return { ok: false, err: 'cost' };
      realm.setGround(d.tx, d.ty, T.SOIL);
      game.fx(realm, 'hit_plant', d.tx + 0.5, d.ty + 0.5, { till: 1 });
      return { ok: true };
    },

    'farm.plant': (game, player, d) => {
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5) || typeof d.seed !== 'string') return { ok: false, err: 'invalid' };
      const realm = game.realms.get(player.entity.realm);
      if (!tileInReach(player, d.tx, d.ty)) return { ok: false, err: 'range' };
      const sdef = itemDef(game, d.seed);
      if (!sdef) return { ok: false, err: 'invalid' };
      if (game.inv.count(player.inv, d.seed) < 1) return { ok: false, err: 'cost' };
      // Pale Cone: plants a palewood_pine node on free land
      if (sdef.use?.kind === 'plant_node') {
        if (realm.kind === 'overworld' && !realm.hasFlag(d.tx, d.ty, FLAG.OWNED)) return { ok: false, err: 'denied' };
        if (realm.groundAt(d.tx, d.ty) === T.SOIL) return { ok: false, err: 'invalid' };
        const n = game.call('spawnNode', realm, sdef.use.node, d.tx, d.ty);
        if (!n) return { ok: false, err: 'busy' };
        game.call('takeItems', player, [{ item: d.seed, qty: 1 }]);
        game.fx(realm, 'crop_grow', d.tx + 0.5, d.ty + 0.5, { plant: 1 });
        return { ok: true };
      }
      if (sdef.cat !== 'seed') return { ok: false, err: 'invalid' };
      if (!plantableTile(realm, d.tx, d.ty)) return { ok: false, err: 'invalid' };
      if (cropAt(game, realm, d.tx, d.ty)) return { ok: false, err: 'busy' };
      if (!game.call('takeItems', player, [{ item: d.seed, qty: 1 }])) return { ok: false, err: 'cost' };
      if (!plantAt(game, realm, d.tx, d.ty, d.seed, player)) { game.call('giveItem', player, d.seed, 1); return { ok: false, err: 'busy' }; }
      return { ok: true };
    },

    'farm.water': (game, player, d) => {
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5)) return { ok: false, err: 'invalid' };
      const realm = game.realms.get(player.entity.realm);
      if (!tileInReach(player, d.tx, d.ty)) return { ok: false, err: 'range' };
      const c = cropAt(game, realm, d.tx, d.ty);
      if (c) {
        if (!water(game, c)) return { ok: false, err: 'busy' };
        game.fx(realm, 'water_pour', c.x, c.y);
        return { ok: true };
      }
      if (realm.groundAt(d.tx, d.ty) !== T.SOIL) return { ok: false, err: 'invalid' };
      if (realm.hasFlag(d.tx, d.ty, FLAG.WATERED)) return { ok: false, err: 'busy' };
      realm.setFlag(d.tx, d.ty, FLAG.WATERED, true);
      game.fx(realm, 'water_pour', d.tx + 0.5, d.ty + 0.5);
      return { ok: true };
    },

    'farm.harvest': (game, player, d) => {
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5)) return { ok: false, err: 'invalid' };
      const realm = game.realms.get(player.entity.realm);
      if (!tileInReach(player, d.tx, d.ty)) return { ok: false, err: 'range' };
      const c = cropAt(game, realm, d.tx, d.ty);
      if (!c) return { ok: false, err: 'invalid' };
      const r = doHarvest(game, player, c);
      if (!r) return { ok: false, err: 'busy' };
      return { ok: true, d: { items: r.items } };
    },
  },

  save(game) {
    const crops = [];
    for (const e of cropsMap(game).values()) {
      if (e.removed || e.realm !== 'overworld') continue;
      const d = e.data;
      crops.push([e.kind, d.tx, d.ty, d.stage, +d.prog.toFixed(1), +Math.max(0, d.wet).toFixed(1), Math.round(d.dry), d.withered ? 1 : 0, d.planter ?? null]);
    }
    return { crops, day: game._farmDay ?? null };
  },

  load(game, data) {
    cropsMap(game).clear();
    const realm = game.realms.get('overworld');
    if (!realm || !Array.isArray(data?.crops)) return;
    for (const c of data.crops) {
      if (!Array.isArray(c)) continue;
      const [kind, tx, ty, stage = 0, prog = 0, wet = 0, dry = 0, withered = 0, planter = null] = c;
      if (!cropDef(game, kind) || !isInt(tx, 0, realm.w - 1) || !isInt(ty, 0, realm.h - 1)) continue;
      if (realm.groundAt(tx, ty) !== T.SOIL || cropAt(game, realm, tx, ty)) continue;
      spawnCrop(game, realm, kind, tx, ty, { stage, prog, wet, dry, withered: !!withered, planter });
    }
    if (data.day != null) game._farmDay = data.day;
  },
};

export { isRipe, pestEvent };
