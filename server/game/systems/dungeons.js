// WP10 dungeon instances: the 6 Vaults (3 generated floors each, Keeper on floor 3) and the endless Trench, as
// separate realms entered through the `vault_entrance` / `trench_entrance` world structures. Owns instance
// lifecycle (create, enter with keys, leave, wipe, cleanup), room activation (locked doors, telegraphed waves),
// puzzles, treasure, blessing altars, stairs, Keeper fights, rewards and the `dungeon` self key.
// Services: createInstance(kind, params) -> Realm, rollVaultLoot(k) -> [{item, qty}], checkWipe(realm).

import { Realm } from '../realm.js';
import { createEntity } from '../entities.js';
import { STATE } from '../../../shared/protocol.js';
import { PARTY_RANGE, REACH } from '../../../shared/config.js';
import { T, FLAG, BIOME_TIER, biomeOf } from '../../../shared/grid.js';
import { createRng, hashString } from '../../../shared/rng.js';
import { generateFloor, roomMap, floorConnected } from '../dungeon/gen.js';
import { setupPuzzle, usePuzzle, tickPuzzle, tickTrap, PUZZLE_KINDS } from '../dungeon/puzzles.js';
import { rollOffer, installBlessings, grantBlessing, clearBlessings, extraKeeperRolls } from '../dungeon/blessings.js';
import trench from '../dungeon/trench.js';
import { spawnMob } from './mobs.js';
import { startBoss, endEncounter } from './bosses.js';
import { telegraph, shapeHit, spawnZone } from './projectiles.js';
import { livePlayers } from './combat.js';
import { revivePlayer, respawn, isDowned } from './death.js';

const IDLE_DESTROY_S = 45;
const WIPE_HOLD_S = 300;
const ENTER_REACH = REACH + 3;
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- instance creation

let instSeq = 0;

function newRealm(game, kind, w, h) {
  const id = `${kind}:${++instSeq}`;
  const realm = new Realm({ id, w, h, kind, fill: T.EMPTY });
  game.realms.set(id, realm);
  return realm;
}

function stampGround(realm, ground) {
  realm.ground.set(ground);
  realm.flags.fill(0);
  realm.patches.clear();
  realm.tileEvents.length = 0;
}

function clearRealm(game, realm, keepPlayers = true) {
  for (const e of [...realm.entities.values()]) {
    if (keepPlayers && e.type === 'player') continue;
    if (e.type === 'boss' && e.data?.enc && !e.data.enc.ended) endEncounter(game, e.data.enc, 'reset');
    if (!e.removed) realm.remove(e);
    game.mobsLive?.delete(e);
  }
}

export function createInstance(game, kind, params = {}) {
  const party = params.party ?? [];
  if (kind === 'trench') {
    const floor = Math.max(1, params.floor ?? 1);
    const L = trench.arenaLayout(game.seed, floor);
    const realm = newRealm(game, 'trench', L.w, L.h);
    const inst = baseInstance(game, realm, 'trench', { k: 0, floor, floors: Infinity, entrance: params.entrance });
    loadTrenchFloor(game, inst, floor);
    for (const p of party) inst.partyIds.add(p.id);
    return realm;
  }
  if (kind === 'moon') {
    const R = 20, w = 44, h = 44;
    const realm = newRealm(game, 'moon', w, h);
    const ground = new Uint8Array(w * h).fill(T.EMPTY);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
      ground[y * w + x] = d <= R ? T.DUNGEON_FLOOR : d <= R + 1.2 ? T.DUNGEON_WALL : T.DEEP;
    }
    stampGround(realm, ground);
    const inst = baseInstance(game, realm, 'moon', { k: 7, floor: 1, floors: 1, entrance: params.entrance });
    inst.start = { x: w / 2, y: h / 2 + 12 };
    for (const p of party) inst.partyIds.add(p.id);
    return realm;
  }
  // vault
  const def = game.content.dungeons.find((d) => d.k === params.k) ?? game.content.dungeons[0];
  const probe = generateFloor({ floor: 1, floors: def.floors, seed: 1, rooms: def.rooms, roomWeights: def.roomWeights, grid: def.grid, roomSize: def.roomSize });
  const realm = newRealm(game, 'vault', probe.w, probe.h);
  const inst = baseInstance(game, realm, 'vault', { k: def.k, def, floor: params.floor ?? 1, floors: def.floors, entrance: params.entrance });
  const clears = (game.world.counters?.['vault_clears_' + def.k] ?? 0);
  inst.seed = (game.seed ^ hashString(`${def.id}:${clears}`)) >>> 0;
  loadVaultFloor(game, inst, inst.floor);
  for (const p of party) inst.partyIds.add(p.id);
  return realm;
}

function baseInstance(game, realm, kind, o) {
  const inst = {
    id: realm.id, kind, realm, k: o.k ?? 0, def: o.def ?? null, floor: o.floor ?? 1, floors: o.floors ?? 1,
    seed: (game.seed ^ hashString(realm.id)) >>> 0, createdAt: game.now, startedAt: game.now,
    blessings: new Map(), offers: new Map(), partyIds: new Set(), emptySince: null, ended: false,
    entrance: o.entrance ?? null, rooms: [], layout: null, roomOf: null, results: new Map(), rng: game.rng.fork(realm.id),
    tr: kind === 'trench' ? { state: 'intro', waves: [], mobs: new Set(), introAt: game.now + 2.5, boss: null } : null,
    dark: o.def?.mechanic === 'darkness', darkUntil: 0, darkR: 0, wipedAt: null, cleared: false,
  };
  game.instances.set(realm.id, inst);
  return inst;
}

// ---------------------------------------------------------------- vault floors

function loadVaultFloor(game, inst, floor) {
  const def = inst.def;
  const realm = inst.realm;
  clearRealm(game, realm, true);
  const layout = generateFloor({ floor, floors: def.floors, rooms: def.rooms, roomWeights: def.roomWeights, grid: def.grid, roomSize: def.roomSize, seed: (inst.seed + floor * 7919) >>> 0 });
  stampGround(realm, layout.ground);
  inst.layout = layout;
  inst.floor = floor;
  inst.roomOf = roomMap(layout);
  inst.rooms = layout.rooms;
  const rng = createRng((inst.seed ^ (floor * 104729)) >>> 0);
  const tmpl = game.modules?.rooms?.get('rooms-' + def.biome);
  const set = (x, y, g) => realm.stamp(x, y, g);
  const get = (x, y) => realm.groundAt(x, y);
  for (const room of inst.rooms) {
    room.state = room.type === 'start' ? 'cleared' : 'idle';
    room.mobs = new Set();
    room.waves = [];
    room.pieces = [];
    room.seen = room.type === 'start';
    if (tmpl && ['combat', 'trap', 'stairs', 'keeper', 'blessing', 'start'].includes(room.type)) {
      try { tmpl.decorate({ set, get, room, rng, T, kind: room.type, mechanic: def.mechanic }); } catch (err) { console.error('[tb:dungeons] room template threw:', err); }
    }
  }
  // safety: undo decoration if it ever disconnects the floor
  if (!floorConnected({ ...layout, ground: realm.ground })) stampGround(realm, layout.ground);
  for (const room of inst.rooms) setupRoom(game, inst, room, rng);
  const s = inst.rooms[layout.startId];
  inst.start = { x: s.cx, y: s.cy };
}

function setupRoom(game, inst, room, rng) {
  const realm = inst.realm;
  const k = inst.k || 3;
  const def = inst.def;
  switch (room.type) {
    case 'combat':
    case 'stairs': {
      const n = 3 + inst.floor + Math.floor(rng.next() * 3);
      const kinds = def?.mobs ?? ['mossback'];
      const waves = room.type === 'stairs' || inst.floor >= 2 ? 2 : 1;
      for (let w = 0; w < waves; w++) {
        const list = [];
        for (let i = 0; i < n - w; i++) list.push(kinds[Math.floor(rng.next() * kinds.length)]);
        room.waves.push(list);
      }
      break;
    }
    case 'puzzle':
      setupPuzzle(game, realm, inst, room, def?.mechanic ?? 'darkness', rng);
      break;
    case 'treasure':
      makeChest(game, inst, room.cx, room.cy, 'treasure');
      break;
    case 'trap':
      makeChest(game, inst, room.cx, room.cy, 'trap');
      break;
    case 'blessing':
      makePiece(game, inst, 'blessing_altar', room.cx, room.cy - 0.5, { room: room.id });
      break;
    default:
  }
  void k;
}

function makePiece(game, inst, kind, x, y, data = {}, pub = {}) {
  const e = createEntity(game, {
    type: 'structure', kind, x, y, hp: 0, radius: 0.6,
    data: { tx: Math.floor(x), ty: Math.floor(y), w: 1, h: 1, inst: inst.id, ...data }, pub: { rot: 0, own: 0, on: 1, ...pub },
  });
  inst.realm.add(e);
  return e;
}

function makeChest(game, inst, x, y, source) {
  const e = createEntity(game, { type: 'chest', kind: 'vault_chest', x, y, radius: 0.5, data: { inst: inst.id, opened: [], source, k: inst.k }, pub: { own: 0 } });
  inst.realm.add(e);
  return e;
}

// ---------------------------------------------------------------- trench floors

function loadTrenchFloor(game, inst, floor) {
  const realm = inst.realm;
  clearRealm(game, realm, true);
  const L = trench.arenaLayout(inst.seed, floor);
  stampGround(realm, L.ground);
  inst.floor = floor;
  inst.start = L.start;
  inst.arena = { x: L.cx, y: L.cy, r: 14 };
  inst.tr = { state: 'intro', waves: [], mobs: new Set(), introAt: game.now + 2.5, boss: null };
  inst.rooms = [{ id: 0, x: 1, y: 1, w: L.w - 2, h: L.h - 2, cx: L.cx, cy: L.cy, type: trench.isKeeperFloor(floor) ? 'keeper' : 'combat', state: 'idle', seen: true, doors: [], mobs: new Set(), waves: [] }];
  inst.roomOf = null;
}

function startTrenchFloor(game, inst) {
  const tr = inst.tr;
  const n = members(game, inst).length;
  if (trench.isKeeperFloor(inst.floor)) {
    const id = trench.keeperFor(inst.floor);
    const m = trench.keeperMults(game, id, inst.floor);
    tr.state = 'boss';
    tr.boss = startBoss(game, inst.realm, id, inst.arena.x, inst.arena.y - 3, {
      instance: inst.id, arena: inst.arena, hpMult: m.hpMult, dmgMult: m.dmgMult, scaleN: n, trench: inst.floor, noLoot: true, xpMult: 0.5,
      onDefeat: () => trenchFloorCleared(game, inst),
    });
    return;
  }
  tr.state = 'fight';
  tr.waves = trench.floorWaves(game, inst.floor, n, inst.rng);
  spawnTrenchWave(game, inst);
}

function spawnTrenchWave(game, inst) {
  const tr = inst.tr;
  const list = tr.waves.shift();
  if (!list) return false;
  const realm = inst.realm;
  for (const kind of list) {
    const def = game.content.enemies.byId[kind];
    if (!def) continue;
    const m = trench.trenchMults(game, def, inst.floor);
    const spot = spawnSpot(game, inst, inst.rooms[0], 4);
    if (!spot) continue;
    telegraph(game, realm, { shape: 'circle', x: spot.x, y: spot.y, r: 0.8 }, 0.8, () => {
      if (inst.ended) return;
      const mob = spawnMob(game, realm, kind, spot.x, spot.y, {
        instance: inst.id, room: 0, hpMult: m.hpMult, dmgMult: m.dmgMult, xpMult: m.xpMult, rollElite: true,
        eliteChance: Math.min(0.3, 0.06 + inst.floor * 0.01), leash: 40, aggro: 30, trench: inst.floor, scaleN: members(game, inst).length,
      });
      if (mob) { tr.mobs.add(mob); game.fx(realm, 'summon_puff', spot.x, spot.y, { big: 1 }); }
    });
  }
  tr.pending = game.now + 1.0;
  return true;
}

function trenchFloorCleared(game, inst) {
  const tr = inst.tr;
  if (tr.state === 'cleared') return;
  tr.state = 'cleared';
  const realm = inst.realm;
  const ps = members(game, inst);
  const partyTier = highestBiomeTier(game);
  const rew = trench.floorRewards(game, inst.floor, partyTier, inst.rng);
  game.call('addGlint', rew.glint, 'trench', ps[0] ?? null);
  for (const p of ps) {
    if (p.entity.state === STATE.DEAD || isDowned(p.entity)) revivePlayer(game, p, { hpFrac: 0.3 });
    for (const it of rew.items) game.call('giveItem', p, it.item, it.qty);
    const st = dstate(p);
    if (rew.trinket && !st.trenchTrinkets[inst.floor]) { st.trenchTrinkets[inst.floor] = true; game.call('giveItem', p, rew.trinket, 1); game.toast(p, `Trench floor ${inst.floor}: ${game.content.items.byId[rew.trinket]?.name ?? rew.trinket}!`, 'good'); }
    if (inst.floor > st.deepest) st.deepest = inst.floor;
    game.toast(p, `Floor ${inst.floor} cleared! +${rew.glint} Glint`, 'good');
  }
  game.bus.emit('trench.floor', { floor: inst.floor, participants: ps });
  game.fx(realm, 'quest_done', inst.arena.x, inst.arena.y, { floor: inst.floor });
  makePiece(game, inst, 'trench_portal', inst.arena.x, inst.arena.y, {});
  makePiece(game, inst, 'trench_exit', inst.arena.x + 4, inst.arena.y + 3, {});
  if (trench.hasBlessing(inst.floor)) makePiece(game, inst, 'blessing_altar', inst.arena.x - 4, inst.arena.y + 3, { room: 0 });
  sendAll(game, inst);
}

function highestBiomeTier(game) {
  let t = 1;
  for (const p of game.world.plots ?? []) if (p.owned) t = Math.max(t, BIOME_TIER[p.biome ?? biomeOf(p.px, p.py)] ?? 1);
  return t;
}

// ---------------------------------------------------------------- members, views

export function members(game, inst) {
  const out = [];
  for (const p of game.players.values()) if (p.entity?.realm === inst.id) out.push(p);
  return out;
}

function dstate(player) {
  player.dungeon ||= { entered: {}, clears: {}, deepest: 0, trenchTrinkets: {}, returnTo: null, last: null };
  return player.dungeon;
}

function view(game, player) {
  const e = player.entity;
  const inst = e ? game.instances.get(e.realm) : null;
  const st = dstate(player);
  if (!inst) return { in: false, entry: st.entry ?? null, results: st.last ?? null, deepest: st.deepest };
  const curRoom = inst.roomOf ? inst.roomOf[Math.floor(e.y) * inst.realm.w + Math.floor(e.x)] : 0;
  const offer = inst.offers.get(player.id) ?? null;
  return {
    in: true, kind: inst.kind, id: inst.id, k: inst.k, name: inst.kind === 'trench' ? 'The Trench' : inst.kind === 'moon' ? 'The Drowned Moon' : inst.def?.name,
    floor: inst.floor, floors: Number.isFinite(inst.floors) ? inst.floors : null, since: Math.round(inst.startedAt * 10) / 10, now: Math.round(game.now * 10) / 10,
    blessings: inst.blessings.get(player.id) ?? [], offer: offer ? { altar: offer.altar, choices: offer.choices } : null,
    rooms: inst.kind === 'vault' ? inst.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, t: r.type, s: r.state === 'cleared' ? 2 : r.state === 'active' ? 1 : 0, v: r.seen ? 1 : 0 })) : null,
    room: curRoom >= 0 ? curRoom : null, w: inst.realm.w, h: inst.realm.h,
    dark: inst.dark || game.now < inst.darkUntil ? { r: game.now < inst.darkUntil ? inst.darkR : null, until: inst.darkUntil > game.now ? r1(inst.darkUntil) : null } : null,
    trench: inst.kind === 'trench' ? { floor: inst.floor, deepest: st.deepest, state: inst.tr?.state } : null,
    results: inst.results.get(player.id) ?? null, mechanic: inst.def?.mechanic ?? null,
  };
}

function send(game, player) { game.sendSelf(player, 'dungeon', view(game, player)); }
function sendAll(game, inst) { for (const p of members(game, inst)) send(game, p); }

// ---------------------------------------------------------------- enter / leave

function entranceDef(game, entity) {
  const fa = game.call('featureAt', game.realms.get(entity.realm), entity.x, entity.y);
  const biome = fa?.biome ?? biomeOf(Math.floor(entity.x / 20), Math.floor(entity.y / 20));
  return game.content.dungeons.find((d) => d.biome === biome) ?? null;
}

function returnPoint(entity) { return { x: entity.x, y: entity.y + (entity.data?.h ?? 2) / 2 + 1.2 }; }

function onEntrance(game, player, entity) {
  const st = dstate(player);
  if (entity.kind === 'trench_entrance') {
    const unlocked = game.call('hasUnlock', 'beacon:3', player) || game.world.flags['beacon:3'];
    st.entry = { kind: 'trench', id: entity.id, name: 'The Trench', locked: !unlocked, deepest: st.deepest, cost: null, have: 0 };
  } else {
    const def = entranceDef(game, entity);
    if (!def) return { ok: false, err: 'invalid' };
    const active = [...game.instances.values()].find((i) => i.kind === 'vault' && i.k === def.k && !i.ended);
    const free = !st.entered[def.k];
    st.entry = {
      kind: 'vault', id: entity.id, k: def.k, name: def.name, keeper: game.content.bosses.byId[def.keeper]?.name ?? def.keeper,
      mechanic: def.mechanic, floors: def.floors, cost: free || active ? null : def.key, have: game.call('countItem', player, def.key) ?? 0,
      active: active ? { floor: active.floor, players: members(game, active).length } : null, clears: st.clears[def.k] ?? 0, free,
    };
  }
  st.entry.at = game.now;
  send(game, player);
  return { ok: true };
}

function enter(game, player, d) {
  const e = player.entity;
  if (game.instances.has(e.realm)) return { ok: false, err: 'busy' };
  const id = d?.id;
  if (!Number.isInteger(id)) return { ok: false, err: 'invalid' };
  const realm = game.realms.get(e.realm);
  const ent = realm?.entities.get(id);
  if (!ent || (ent.kind !== 'vault_entrance' && ent.kind !== 'trench_entrance')) return { ok: false, err: 'invalid' };
  if (Math.hypot(ent.x - e.x, ent.y - e.y) > ENTER_REACH + (ent.radius ?? 1)) return { ok: false, err: 'range' };
  const st = dstate(player);
  const back = returnPoint(ent);
  const party = livePlayers(game, realm.id, ent.x, ent.y, PARTY_RANGE).filter((p) => !game.instances.has(p.entity.realm));
  if (!party.includes(player)) party.unshift(player);
  let inst;
  if (ent.kind === 'trench_entrance') {
    if (!(game.call('hasUnlock', 'beacon:3', player) || game.world.flags['beacon:3'])) return { ok: false, err: 'locked' };
    // WP14 (BUILD_REVIEW P2-10): a run may start at floor 10 (d.start === 10) once floor 10 was reached in this world.
    // It costs one vault_key_6 unless the party carries Morrow's trench_no_key flag.
    let floor = 1;
    if (d?.start === 10) {
      const reached = !!game.world.flags['trench:10'] || party.some((q) => (dstate(q).deepest ?? 0) >= 10);
      if (!reached) return { ok: false, err: 'locked' };
      const free = party.some((q) => game.stats.hasFlag(q, 'trench_no_key'));
      if (!free && !game.call('takeItems', player, [{ item: 'vault_key_6', qty: 1 }])) return { ok: false, err: 'cost', d: { why: 'Needs a Vault key VI' } };
      floor = 10;
    }
    const r = createInstance(game, 'trench', { floor, party, entrance: back });
    inst = game.instances.get(r.id);
  } else {
    const def = entranceDef(game, ent);
    if (!def) return { ok: false, err: 'invalid' };
    const active = [...game.instances.values()].find((i) => i.kind === 'vault' && i.k === def.k && !i.ended);
    if (active) inst = active;
    else {
      if (st.entered[def.k]) {
        if ((game.call('countItem', player, def.key) ?? 0) < 1) return { ok: false, err: 'cost' };
        if (!game.call('takeItems', player, [{ item: def.key, qty: 1 }])) return { ok: false, err: 'cost' };
      }
      st.entered[def.k] = true;
      const r = createInstance(game, 'vault', { k: def.k, party, entrance: back });
      inst = game.instances.get(r.id);
    }
  }
  inst.entrance ||= back;
  inst.wipedAt = null;
  for (const p of party) bringIn(game, inst, p, back);
  game.fx(realm, 'waystone_warp', ent.x, ent.y, { out: 1 });
  return { ok: true, d: { realm: inst.id } };
}

function bringIn(game, inst, p, back) {
  const ds = dstate(p);
  ds.returnTo = back ?? inst.entrance;
  ds.entry = null;
  inst.partyIds.add(p.id);
  const s = inst.start;
  const jitter = (members(game, inst).length % 4) * 0.6 - 0.9;
  game.movePlayer(p, inst.id, s.x + jitter, s.y);
  game.fx(inst.realm, 'waystone_warp', s.x, s.y, { in: 1 });
  inst.emptySince = null;
  const welcome = inst.kind === 'trench' ? `The Trench - floor ${inst.floor}` : `${inst.def?.name} - floor ${inst.floor} of ${inst.floors}`;
  game.toast(p, welcome, 'quest');
  send(game, p);
}

export function ejectPlayer(game, inst, p, { hpFrac = null, quiet = false } = {}) {
  clearBlessings(game, inst, p);
  inst.offers.delete(p.id);
  const ds = dstate(p);
  const to = ds.returnTo ?? inst.entrance ?? game.spawnPoint();
  ds.returnTo = null;
  const e = p.entity;
  if (e && (e.state === STATE.DEAD || isDowned(e) || hpFrac != null)) respawn(game, p, { realmId: 'overworld', x: to.x, y: to.y, hpFrac: hpFrac ?? 0.5 });
  else game.movePlayer(p, 'overworld', to.x, to.y);
  if (!quiet) game.fx('overworld', 'waystone_warp', to.x, to.y, { in: 1 });
  if (inst.kind === 'trench') {
    const st = dstate(p);
    const reached = inst.tr?.state === 'cleared' ? inst.floor : inst.floor - 1;
    if (reached > st.deepest) st.deepest = reached;
  }
  send(game, p);
}

function leave(game, player) {
  const inst = game.instances.get(player.entity?.realm);
  if (!inst) return { ok: false, err: 'invalid' };
  ejectPlayer(game, inst, player);
  return { ok: true };
}

export function destroyInstance(game, inst) {
  if (inst.ended) return;
  inst.ended = true;
  for (const p of members(game, inst)) ejectPlayer(game, inst, p, { quiet: true });
  clearRealm(game, inst.realm, false);
  game.realms.delete(inst.id);
  game.instances.delete(inst.id);
}

// ---------------------------------------------------------------- wipes

export function checkWipe(game, realm) {
  const inst = realm ? game.instances.get(typeof realm === 'string' ? realm : realm.id) : null;
  if (!inst || inst.ended) return false;
  const ms = members(game, inst);
  if (!ms.length) return false;
  if (!ms.every((p) => p.entity.state === STATE.DEAD || isDowned(p.entity))) return false;
  wipe(game, inst);
  return true;
}

function wipe(game, inst) {
  const ms = members(game, inst);
  for (const p of ms) game.toast(p, 'The party has fallen. The tide carries you out.', 'warn');
  if (inst.kind === 'vault') {
    for (const p of ms) ejectPlayer(game, inst, p, { hpFrac: 0.5 });
    // the floor resets and waits for the party to return (no new key needed while it lasts)
    loadVaultFloor(game, inst, inst.floor);
    inst.wipedAt = game.now;
  } else if (inst.kind === 'trench') {
    for (const p of ms) ejectPlayer(game, inst, p, { hpFrac: 0.5 });
    destroyInstance(game, inst);
  } else {
    for (const p of ms) ejectPlayer(game, inst, p, { hpFrac: 0.5 });
    game.bus.emit('instance.wipe', { instance: inst.id, kind: inst.kind });
  }
}

// ---------------------------------------------------------------- rooms

function spawnSpot(game, inst, room, minPlayerDist = 4) {
  const realm = inst.realm;
  for (let i = 0; i < 40; i++) {
    const x = room.x + 1 + inst.rng.next() * (room.w - 2), y = room.y + 1 + inst.rng.next() * (room.h - 2);
    if (!realm.isWalkable(Math.floor(x), Math.floor(y))) continue;
    const g = realm.groundAt(Math.floor(x), Math.floor(y));
    if (g === T.LAVA || g === T.INK) continue;
    if (members(game, inst).some((p) => Math.hypot(p.entity.x - x, p.entity.y - y) < minPlayerDist)) continue;
    return { x, y };
  }
  return { x: room.cx, y: room.cy };
}

function setDoors(game, inst, room, closed) {
  const realm = inst.realm;
  for (const d of room.doors) {
    const other = inst.rooms[d.to];
    for (const [x, y] of d.tiles) {
      if (closed) {
        realm.setGround(x, y, T.DUNGEON_WALL, { persist: false });
      } else if (!(other && other.state === 'active' && other !== room)) {
        realm.setGround(x, y, T.DUNGEON_FLOOR, { persist: false });
      }
    }
    game.fx(realm, closed ? 'hit_stone' : 'break_stone', d.tiles[1][0] + 0.5, d.tiles[1][1] + 0.5, { door: closed ? 1 : 0 });
  }
  if (closed) {
    // anyone standing in a doorway is nudged into the room
    for (const p of members(game, inst)) {
      const e = p.entity;
      const onDoor = room.doors.some((d) => d.tiles.some(([x, y]) => Math.floor(e.x) === x && Math.floor(e.y) === y));
      if (!onDoor) continue;
      const nx = Math.max(room.x + 0.6, Math.min(room.x + room.w - 0.6, e.x)), ny = Math.max(room.y + 0.6, Math.min(room.y + room.h - 0.6, e.y));
      realm.move(e, nx, ny);
    }
  }
}

function activateRoom(game, inst, room) {
  const realm = inst.realm;
  room.state = 'active';
  if (room.type === 'combat' || room.type === 'stairs') {
    setDoors(game, inst, room, true);
    spawnRoomWave(game, inst, room);
    if (inst.def?.mechanic === 'spores') {
      for (let i = 0; i < 2; i++) {
        const s = spawnSpot(game, inst, room, 3);
        spawnZone(game, realm, { kind: 'spore', x: s.x, y: s.y, r: 1.4, dur: 60, dps: tierDmg(game, inst, 0.15), tick: 0.5, team: 'enemy', burstable: true, status: { id: 'slow', dur: 0.6, power: 0.2 } });
      }
    }
  } else if (room.type === 'keeper') {
    setDoors(game, inst, room, true);
    const def = inst.def;
    const n = members(game, inst).length;
    room.boss = startBoss(game, realm, def.keeper, room.cx, room.cy - 3, {
      instance: inst.id, arena: { x: room.cx, y: room.cy, r: 15 }, scaleN: n,
      extraRolls: (p) => extraKeeperRolls(game, inst, p),
      onDefeat: (g, enc, participants) => vaultCleared(game, inst, room, participants),
    });
    for (const p of members(game, inst)) game.toast(p, `${game.content.bosses.byId[def.keeper]?.name ?? 'The Keeper'} awakens!`, 'warn');
  } else if (room.type === 'trap') {
    for (const p of members(game, inst)) if (roomOfPlayer(inst, p) === room.id) game.toast(p, 'Trap gauntlet! Reach the chest.', 'warn');
  }
  sendAll(game, inst);
}

function spawnRoomWave(game, inst, room) {
  const list = room.waves.shift();
  if (!list) return false;
  const realm = inst.realm;
  const n = members(game, inst).length;
  room.pending = (room.pending ?? 0) + list.length;
  for (const kind of list) {
    const spot = spawnSpot(game, inst, room, 3.5);
    telegraph(game, realm, { shape: 'circle', x: spot.x, y: spot.y, r: 0.8 }, 0.8, () => {
      room.pending--;
      if (inst.ended || room.state !== 'active') return;
      const m = spawnMob(game, realm, kind, spot.x, spot.y, {
        instance: inst.id, room: room.id, scaleN: n, rollElite: true, eliteChance: 0.06 + 0.03 * inst.floor,
        hpMult: 1 + 0.1 * (inst.floor - 1), leash: 30, aggro: 22,
      });
      if (m) { room.mobs.add(m); game.fx(realm, 'summon_puff', spot.x, spot.y, { big: 1 }); }
    });
  }
  return true;
}

function roomOfPlayer(inst, p) {
  if (!inst.roomOf) return 0;
  const e = p.entity;
  return inst.roomOf[Math.floor(e.y) * inst.realm.w + Math.floor(e.x)];
}

function clearRoom(game, inst, room) {
  room.state = 'cleared';
  const realm = inst.realm;
  setDoors(game, inst, room, false);
  game.fx(realm, 'quest_done', room.cx, room.cy, { room: 1 });
  for (const p of members(game, inst)) {
    if (p.entity.state === STATE.DEAD || isDowned(p.entity)) revivePlayer(game, p, { hpFrac: 0.3 });
  }
  // crystal growths: the tier's ore and rares
  if (room.type === 'combat' && inst.rng.next() < 0.6) {
    const s = spawnSpot(game, inst, room, 1.5);
    const kind = game.content.nodes.byId.vault_crystal ? 'vault_crystal' : null;
    const oreNode = game.content.nodes.find((nd) => nd.biome === inst.def?.biome && nd.cls === 'ore')?.id;
    const node = kind ? game.call('spawnNode', realm, kind, Math.floor(s.x), Math.floor(s.y)) : null;
    if (!node && oreNode) game.call('spawnNode', realm, oreNode, Math.floor(s.x), Math.floor(s.y));
    else if (node) { node.data.tier = inst.k; node.data.vaultTier = inst.k; }
  }
  if (room.type === 'stairs') {
    makePiece(game, inst, 'vault_stairs', room.cx, room.cy, { room: room.id });
    for (const p of members(game, inst)) game.toast(p, 'The way down opens.', 'good');
  }
  sendAll(game, inst);
}

function tierDmg(game, inst, mult) {
  const tier = inst.k || 3;
  const avg = trench.tierAverages(game)[tier] ?? trench.tierAverages(game)[3];
  const scale = inst.kind === 'trench' ? Math.pow(1.12, inst.floor) * (trench.tierAverages(game)[3].dmg / avg.dmg) : 1 + 0.1 * (inst.floor - 1);
  return avg.dmg * mult * scale;
}

function roomApi(game, inst) {
  return inst.api ||= {
    rng: inst.rng,
    telegraph: (spec, windup, onFire) => telegraph(game, inst.realm, spec, windup, onFire),
    hit: (spec, dmg, element) => shapeHit(game, inst.realm, spec, dmg, { team: 'enemy', element, knock: 0.6 }),
    tierDmg: (mult) => tierDmg(game, inst, mult),
    zone: (o) => spawnZone(game, inst.realm, o),
    membersIn: (room) => members(game, inst).filter((p) => roomOfPlayer(inst, p) === room.id && p.entity.hp > 0),
  };
}

function tickVault(game, inst, dt) {
  const api = roomApi(game, inst);
  const ms = members(game, inst);
  const occupied = new Map();
  for (const p of ms) {
    const rid = roomOfPlayer(inst, p);
    if (rid < 0) continue;
    const room = inst.rooms[rid];
    if (!room.seen) { room.seen = true; sendAll(game, inst); }
    if (p.entity.hp > 0 && p.entity.state !== STATE.DEAD && !isDowned(p.entity)) occupied.set(rid, true);
    if (p.dungeonRoom !== rid) { p.dungeonRoom = rid; send(game, p); }
  }
  for (const room of inst.rooms) {
    if (room.state === 'idle' && occupied.get(room.id)) {
      // step fully inside before the doors slam
      const inside = ms.some((p) => roomOfPlayer(inst, p) === room.id && insideMargin(room, p.entity, 1.2));
      if (['combat', 'stairs', 'keeper'].includes(room.type) && inside) activateRoom(game, inst, room);
      else if (room.type === 'trap' && inside) activateRoom(game, inst, room);
      else if (room.type === 'puzzle' || room.type === 'treasure' || room.type === 'blessing') room.state = room.type === 'puzzle' ? 'active' : 'cleared';
    }
    if (room.state !== 'active') continue;
    if (room.type === 'combat' || room.type === 'stairs') {
      for (const m of room.mobs) if (m.removed) room.mobs.delete(m);
      if (room.mobs.size === 0 && !(room.pending > 0)) {
        if (!spawnRoomWave(game, inst, room)) clearRoom(game, inst, room);
      }
      if (inst.def?.mechanic === 'conveyors' && occupied.get(room.id)) {
        room.jetT = (room.jetT ?? 3) - dt;
        if (room.jetT <= 0) { room.jetT = 5; tickTrap(game, inst.realm, inst, room, 99, api); }
      }
    } else if (room.type === 'puzzle') {
      if (occupied.get(room.id)) tickPuzzle(game, inst.realm, inst, room, dt, api);
      if (room.solved) {
        room.state = 'cleared';
        makeChest(game, inst, room.cx, room.cy, 'puzzle');
        game.fx(inst.realm, 'chest_open', room.cx, room.cy, { appear: 1 });
        for (const p of api.membersIn(room)) game.toast(p, 'Puzzle solved!', 'good');
        if (room.dark) room.dark = false;
        sendAll(game, inst);
      }
    } else if (room.type === 'trap') {
      if (occupied.get(room.id)) tickTrap(game, inst.realm, inst, room, dt, api);
    }
  }
}

function insideMargin(room, e, m) {
  return e.x >= room.x + m && e.y >= room.y + m && e.x <= room.x + room.w - m && e.y <= room.y + room.h - m;
}

function tickTrench(game, inst) {
  const tr = inst.tr;
  if (!tr) return;
  if (tr.state === 'intro' && game.now >= tr.introAt && members(game, inst).length) startTrenchFloor(game, inst);
  else if (tr.state === 'fight') {
    for (const m of tr.mobs) if (m.removed) tr.mobs.delete(m);
    if (tr.mobs.size === 0 && game.now >= (tr.pending ?? 0)) {
      if (!spawnTrenchWave(game, inst)) trenchFloorCleared(game, inst);
    }
  }
}

// ---------------------------------------------------------------- Keeper defeat / Vault clear

function vaultCleared(game, inst, room, participantsFromBoss) {
  if (inst.cleared) return;
  inst.cleared = true;
  room.state = 'cleared';
  const realm = inst.realm;
  const k = inst.k;
  const ps = members(game, inst);
  const seconds = Math.round(game.now - inst.startedAt);
  const worldFirst = !game.world.flags['vault:' + k];
  game.world.flags['vault:' + k] = true;
  const gate = 'gate:vault_' + k;
  if (game.world.flags[gate] == null) game.world.flags[gate] = Math.round(game.playtimeS);
  game.world.counters ||= {};
  game.world.counters['vault_clears_' + k] = (game.world.counters['vault_clears_' + k] ?? 0) + 1;
  game.sendWorld('unlocks', game.world.flags);
  const firstFor = [];
  for (const p of ps) {
    const st = dstate(p);
    const first = !st.clears[k];
    st.clears[k] = (st.clears[k] ?? 0) + 1;
    if (first) firstFor.push(p.id);
    if (p.entity.state === STATE.DEAD || isDowned(p.entity)) revivePlayer(game, p, { hpFrac: 0.5 });
    inst.results.set(p.id, { cleared: true, k, name: inst.def.name, seconds, first, keeper: inst.def.keeper, clears: st.clears[k] });
    st.last = inst.results.get(p.id);
  }
  setDoors(game, inst, room, false);
  makePiece(game, inst, 'vault_exit', room.cx, room.cy + 2, { room: room.id });
  game.fx(realm, 'gate_stage', room.cx, room.cy, { vault: k });
  game.bus.emit('vault.cleared', { k, participants: ps, seconds, first: worldFirst, firstFor });
  sendAll(game, inst);
  void participantsFromBoss;
}

// ---------------------------------------------------------------- interactions

function onChest(game, player, chest) {
  const inst = game.instances.get(chest.realm);
  if (!inst) return { ok: false, err: 'invalid' };
  if (chest.data.opened.includes(player.id)) { game.toast(player, 'Already looted.', 'info'); return { ok: true }; }
  chest.data.opened.push(player.id);
  const loot = rollVaultLoot(game, inst.k || Math.min(6, trenchTier(inst)), inst.rng);
  for (const it of loot) game.call('giveItem', player, it.item, it.qty);
  const s = game.stats.of(player);
  const glint = Math.round((inst.k || 3) * 15 * (1 + (s.chestLoot ?? 0)));
  game.call('addGlint', glint, 'vault_chest', player);
  game.fx(chest.realm, 'chest_open', chest.x, chest.y, { i: chest.id });
  chest.set('own', chest.data.opened.length);
  if (chest.data.source === 'trap' && inst.roomOf) {
    const rid = inst.roomOf[Math.floor(chest.y) * inst.realm.w + Math.floor(chest.x)];
    if (rid >= 0 && inst.rooms[rid].state !== 'cleared') { inst.rooms[rid].state = 'cleared'; sendAll(game, inst); }
  }
  game.toast(player, `Loot: ${loot.map((l) => `${l.qty} ${game.content.items.byId[l.item]?.name ?? l.item}`).join(', ')} +${glint} G`, 'good');
  return { ok: true };
}

function trenchTier(inst) { return 3 + Math.floor((inst.floor ?? 0) / 8); }

function onAltar(game, player, altar) {
  const inst = game.instances.get(altar.realm);
  if (!inst) return { ok: false, err: 'invalid' };
  altar.data.used ||= [];
  if (altar.data.used.includes(player.id)) { game.toast(player, 'The altar has already blessed you.', 'info'); return { ok: true }; }
  const held = inst.blessings.get(player.id) ?? [];
  let offer = inst.offers.get(player.id);
  if (!offer || offer.altar !== altar.id) {
    offer = { altar: altar.id, choices: rollOffer(game, held, inst.rng, 3) };
    inst.offers.set(player.id, offer);
  }
  game.fx(altar.realm, 'card_reveal', altar.x, altar.y, { blessing: 1 });
  send(game, player);
  return { ok: true, d: offer };
}

function pickBlessing(game, player, d) {
  const inst = game.instances.get(player.entity?.realm);
  const offer = inst?.offers.get(player.id);
  if (!inst || !offer) return { ok: false, err: 'invalid' };
  const i = d?.index;
  if (!Number.isInteger(i) || i < 0 || i >= offer.choices.length) return { ok: false, err: 'invalid' };
  const altar = inst.realm.entities.get(offer.altar);
  const id = offer.choices[i];
  grantBlessing(game, inst, player, id);
  inst.offers.delete(player.id);
  if (altar) { altar.data.used ||= []; altar.data.used.push(player.id); }
  const e = player.entity;
  game.fx(inst.realm, 'card_pick', e.x, e.y, { blessing: id });
  game.toast(player, `Blessing: ${game.content.blessings.byId[id]?.name ?? id}`, 'good');
  send(game, player);
  return { ok: true, d: { id } };
}

function onStairs(game, player, stairs) {
  const inst = game.instances.get(stairs.realm);
  if (!inst || inst.kind !== 'vault') return { ok: false, err: 'invalid' };
  const next = inst.floor + 1;
  if (next > inst.floors) return { ok: false, err: 'invalid' };
  loadVaultFloor(game, inst, next);
  const ms = members(game, inst);
  for (const p of ms) {
    if (p.entity.state === STATE.DEAD || isDowned(p.entity)) revivePlayer(game, p, { hpFrac: 0.3 });
    game.movePlayer(p, inst.id, inst.start.x + (ms.indexOf(p) % 3) * 0.7 - 0.7, inst.start.y);
    game.toast(p, `${inst.def.name} - floor ${next} of ${inst.floors}`, 'quest');
  }
  game.fx(inst.realm, 'waystone_warp', inst.start.x, inst.start.y, { in: 1 });
  sendAll(game, inst);
  return { ok: true };
}

function onTrenchPortal(game, player, portal) {
  const inst = game.instances.get(portal.realm);
  if (!inst || inst.kind !== 'trench' || inst.tr?.state !== 'cleared') return { ok: false, err: 'invalid' };
  loadTrenchFloor(game, inst, inst.floor + 1);
  for (const p of members(game, inst)) {
    if (p.entity.state === STATE.DEAD || isDowned(p.entity)) revivePlayer(game, p, { hpFrac: 0.3 });
    game.movePlayer(p, inst.id, inst.start.x + (p.id % 3) * 0.7 - 0.7, inst.start.y);
    game.toast(p, `The Trench - floor ${inst.floor}`, 'quest');
  }
  sendAll(game, inst);
  return { ok: true };
}

function onExit(game, player, ex) {
  const inst = game.instances.get(ex.realm);
  if (!inst) return { ok: false, err: 'invalid' };
  ejectPlayer(game, inst, player);
  return { ok: true };
}

function onPuzzlePiece(game, player, e) {
  const inst = game.instances.get(e.realm);
  const room = inst?.rooms?.[e.data.room];
  if (!room) return { ok: false, err: 'invalid' };
  return usePuzzle(game, inst.realm, inst, room, e, player);
}

// ---------------------------------------------------------------- loot

export function rollVaultLoot(game, k, rng = game.dungeonRng) {
  const tier = Math.max(1, Math.min(6, k | 0 || 1));
  const items = game.content.items;
  const ore = items.find((i) => i.kind === 'ore' && i.tier === tier)?.id;
  const rare = items.find((i) => i.kind === 'rare' && i.tier === tier)?.id;
  const mob = items.find((i) => i.kind === 'mob' && i.tier === tier)?.id;
  const bar = items.find((i) => i.bar && i.tier === tier)?.id;
  const out = [];
  if (ore) out.push({ item: ore, qty: 4 + Math.floor(rng.next() * 5) });
  if (bar && rng.next() < 0.5) out.push({ item: bar, qty: 2 + Math.floor(rng.next() * 3) });
  if (mob && rng.next() < 0.6) out.push({ item: mob, qty: 2 + Math.floor(rng.next() * 3) });
  if (rare && rng.next() < 0.3) out.push({ item: rare, qty: 1 });
  if (rng.next() < 0.2) out.push({ item: 'relic_fragment', qty: 1 });
  return out;
}

// ---------------------------------------------------------------- system

export default {
  name: 'dungeons',
  init(game) {
    game.instances = new Map();
    game.dungeonRng = game.rng.fork('dungeons');
    game.services.register('createInstance', (kind, params = {}) => createInstance(game, kind, params || {}));
    game.services.register('rollVaultLoot', (k) => rollVaultLoot(game, k));
    game.services.register('checkWipe', (realm) => checkWipe(game, realm));
    game.services.register('instanceOf', (realmId) => game.instances.get(realmId) ?? null);
    game.services.register('ejectFromInstance', (player) => { const i = game.instances.get(player.entity?.realm); if (i) ejectPlayer(game, i, player); });
    game.services.register('destroyInstance', (realmId) => { const i = game.instances.get(realmId); if (i) destroyInstance(game, i); });
    // Keepers (server/game/dungeon/keepers/*.js) register through the WP5 boss framework.
    for (const [id, mod] of game.modules?.keepers ?? []) {
      const script = mod?.script ?? mod;
      if (script?.moves) game.call('registerBossScript', mod.id ?? id, script);
    }
    installBlessings(game);
    const reg = (kind, fn) => game.call('registerInteract', kind, fn);
    reg('vault_entrance', onEntrance);
    reg('trench_entrance', onEntrance);
    reg('vault_chest', onChest);
    reg('blessing_altar', onAltar);
    reg('vault_stairs', onStairs);
    reg('vault_exit', onExit);
    reg('trench_portal', onTrenchPortal);
    reg('trench_exit', onExit);
    for (const k of PUZZLE_KINDS) reg(k, onPuzzlePiece);
    // nothing can be built inside an instance
    game.call('registerPlaceValidator', (kind, realm) => (realm && realm.kind !== 'overworld' ? { ok: false, err: 'denied' } : null));
    // Scribe darkness and other Keeper effects talk to the instance through this hook
    game.services.register('instanceDarkness', (realmId, radius, seconds) => {
      const inst = game.instances.get(realmId);
      if (!inst) return;
      inst.darkR = radius; inst.darkUntil = game.now + seconds;
      sendAll(game, inst);
    });
    game.bus.on('player.leave', ({ player }) => {
      const inst = game.instances.get(player.entity?.realm);
      if (inst) { clearBlessings(game, inst, player); inst.offers.delete(player.id); }
    });
  },
  tick(game, dt) {
    // any realm change (Vault, Trench, Moon, respawn) refreshes the player's dungeon view
    for (const p of game.players.values()) {
      const r = p.entity?.realm;
      if (r && p.dungeonRealmSeen !== r) { p.dungeonRealmSeen = r; p.dungeonRoom = null; send(game, p); }
    }
    for (const inst of game.instances.values()) {
      if (inst.ended) continue;
      if (inst.kind === 'vault') tickVault(game, inst, dt);
      else if (inst.kind === 'trench') tickTrench(game, inst);
    }
  },
  slowTick(game) {
    for (const inst of [...game.instances.values()]) {
      if (inst.ended) continue;
      const ms = members(game, inst);
      if (ms.length) {
        inst.emptySince = null;
        checkWipe(game, inst.realm);
        if (inst.darkUntil && game.now >= inst.darkUntil) { inst.darkUntil = 0; sendAll(game, inst); }
      } else {
        inst.emptySince ??= game.now;
        const hold = inst.wipedAt != null ? WIPE_HOLD_S : (inst.kind === 'moon' ? 120 : IDLE_DESTROY_S);
        if (game.now - inst.emptySince > hold) destroyInstance(game, inst);
      }
    }
  },
  handlers: {
    'dungeon.enter': (game, player, d) => enter(game, player, d),
    'dungeon.leave': (game, player) => leave(game, player),
    'blessing.pick': (game, player, d) => pickBlessing(game, player, d),
  },
  onJoin(game, player) {
    const st = dstate(player);
    // a player saved inside an instance comes back at its entrance (instances are not saved)
    if (st.returnTo && player.entity && !game.instances.has(player.entity.realm)) {
      const to = st.returnTo;
      st.returnTo = null;
      const ow = game.realms.get('overworld');
      if (ow && player.entity.realm === 'overworld') { ow.move(player.entity, to.x, to.y); player.body.x = to.x; player.body.y = to.y; }
    }
    send(game, player);
  },
  saveProfile(game, player) {
    const st = dstate(player);
    return { entered: st.entered, clears: st.clears, deepest: st.deepest, trenchTrinkets: st.trenchTrinkets, returnTo: game.instances.has(player.entity?.realm) ? st.returnTo : null };
  },
  loadProfile(game, player, data) {
    const st = dstate(player);
    if (!data || typeof data !== 'object') return;
    st.entered = { ...(data.entered ?? {}) };
    st.clears = { ...(data.clears ?? {}) };
    st.deepest = Number(data.deepest) || 0;
    st.trenchTrinkets = { ...(data.trenchTrinkets ?? {}) };
    st.returnTo = data.returnTo && Number.isFinite(data.returnTo.x) ? data.returnTo : null;
  },
  save() { return {}; },
  load() {},
};
