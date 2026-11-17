// Player record, profile create/load/save (TECH_SPEC 12: top-level profile fields are owned here).

import { PLAYER_RADIUS, START_PLOT } from '../../shared/config.js';
import { plotCenter } from '../../shared/grid.js';
import { createBody } from '../../shared/rules/movement.js';
import { createEntity } from './entities.js';

export const HOTBAR_SIZE = 8;

export function newProfile(name, color) {
  return {
    name, color, playtimeS: 0, x: null, y: null, realm: 'overworld',
    level: 1, xp: 0, hp: null, inv: [], hotbar: new Array(HOTBAR_SIZE).fill(null), gear: {}, sys: {},
  };
}

export function createPlayer(game, conn, token, profile) {
  const body = createBody();
  return {
    id: 0,                       // = entity id, assigned on spawn
    token,
    name: profile.name,
    color: profile.color,
    conn,
    entity: null,
    level: profile.level ?? 1,
    xp: profile.xp ?? 0,
    inv: game.inv.fromJSON(profile.inv, Math.max(24, Array.isArray(profile.inv) ? profile.inv.length : 0)),
    hotbar: Array.isArray(profile.hotbar) ? profile.hotbar.slice(0, HOTBAR_SIZE) : new Array(HOTBAR_SIZE).fill(null),
    gear: profile.gear && typeof profile.gear === 'object' ? structuredClone(profile.gear) : {},
    counters: profile.counters ?? {},
    playtimeS: profile.playtimeS ?? 0,
    profile,
    body,                        // movement-only state (dodge, charges); position lives on the entity
    inputs: [],
    ack: 0,
    lastInput: null,
    moveBudget: 0.2,
    aimX: null, aimY: null,
    statsCache: null,
    selfState: Object.create(null),
    joining: true,
    known: new Map(),            // entity id -> change version last sent
    knownChunks: new Set(),
    activity: { samples: [], lastEmit: -Infinity },
  };
}

// Create the player's entity in its realm at its saved or default spawn position.
export function spawnPlayerEntity(game, player) {
  const p = player.profile;
  let realm = game.realms.get(p.realm) || game.realms.get('overworld');
  let x = p.x, y = p.y;
  if (realm.id !== p.realm || !Number.isFinite(x) || !Number.isFinite(y) || !realm.isWalkable(Math.floor(x), Math.floor(y))) {
    realm = game.realms.get('overworld');
    ({ x, y } = game.spawnPoint());
  }
  const stats = game.stats.of(player);
  const e = createEntity(game, {
    type: 'player', kind: 'player', x, y, radius: PLAYER_RADIUS,
    hp: Number.isFinite(p.hp) && p.hp > 0 ? Math.min(p.hp, stats.maxHp) : stats.maxHp, maxHp: stats.maxHp,
    pub: { n: player.name, c: player.color, cl: 0, lv: player.level, g: [0, 0, 0, 0], a: 'idle', at: 0 },
  });
  realm.add(e);
  player.entity = e;
  player.id = e.id;
  player.body.x = x; player.body.y = y;
  player.body.charges = stats.dodgeCharges;
  return e;
}

export function defaultSpawn() {
  return plotCenter(START_PLOT.px, START_PLOT.py);
}

// Profile written into the save: top-level fields + per-system data under sys.
export function snapshotProfile(game, player) {
  const e = player.entity;
  const sys = { ...(player.profile.sys || {}) };
  for (const s of game.systems) {
    if (typeof s.saveProfile !== 'function') continue;
    try {
      const d = s.saveProfile(game, player);
      if (d !== undefined) sys[s.name] = d;
    } catch (err) {
      console.error(`[tb:${s.name}] saveProfile threw:`, err);
    }
  }
  return {
    name: player.name, color: player.color, playtimeS: Math.round(player.playtimeS),
    x: e ? +e.x.toFixed(3) : player.profile.x, y: e ? +e.y.toFixed(3) : player.profile.y,
    realm: e ? e.realm : player.profile.realm,
    level: player.level, xp: player.xp, hp: e ? Math.ceil(e.hp) : player.profile.hp,
    inv: game.inv.toJSON(player.inv), hotbar: player.hotbar.slice(), gear: structuredClone(player.gear),
    counters: player.counters, sys,
  };
}
