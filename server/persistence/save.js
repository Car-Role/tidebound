// World save: serialise/restore (TECH_SPEC 12), atomic write (.tmp then rename), rotating backups, load.
// Storage goes through a pluggable store (setSaveStore). In Node the default is the file store (fs-store.js, loaded
// lazily so this module never pulls node:* into a browser); the browser-hosted world installs browser-store.js
// (IndexedDB, localStorage fallback). Store interface, all paths are opaque strings:
//   existsSync(p) -> bool, readSync(p) -> string|null, writeSync(p, text), write(p, text) -> Promise,
//   renameSync(from, to), copySync(from, to)

import { BACKUPS, BACKUP_INTERVAL_S } from '../../shared/config.js';
import { FLAG } from '../../shared/grid.js';
import { Entity } from '../game/entities.js';
import { snapshotProfile } from '../game/player.js';
import { migrate } from './migrate.js';

export const SAVE_VERSION = 1;

const IS_NODE = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';
let store = IS_NODE ? (await import('./fs-store.js')).fsStore : null;

// Swap the storage backend (returns the previous one). The browser host calls this before Game.init.
export function setSaveStore(s) { const prev = store; store = s; return prev; }
export function getSaveStore() { return store; }
function requireStore() {
  if (!store) throw new Error('no save store installed (call setSaveStore)');
  return store;
}

export function serializeGame(game) {
  const w = game.world;
  const realm = game.realms.get('overworld');
  const nodes = [], structures = [], drops = [], chests = [];
  for (const e of realm.entities.values()) {
    if (e.type === 'node') nodes.push([e.kind, e.data.tx, e.data.ty, e.hp, e.pub.v ?? 0, e.pub.big ?? 0]);
    else if (e.type === 'structure') {
      structures.push({
        id: e.id, kind: e.kind, tx: e.data.tx, ty: e.data.ty, rot: e.pub.rot ?? 0,
        owner: e.data.owner ?? null, hp: e.hp, state: e.data,
      });
    } else if (e.type === 'drop') drops.push([e.pub.it, e.pub.q, +e.x.toFixed(2), +e.y.toFixed(2)]);
    else if (e.type === 'chest') chests.push({ id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, data: e.data, pub: e.pub });
  }
  const profiles = {};
  for (const [token, prof] of game.profiles) profiles[token] = prof;
  for (const p of game.players.values()) profiles[p.token] = snapshotProfile(game, p);

  const systems = {};
  for (const s of game.systems) {
    if (typeof s.save !== 'function') continue;
    try {
      const d = s.save(game);
      if (d !== undefined) systems[s.name] = d;
    } catch (err) {
      console.error(`[tb:${s.name}] save threw:`, err);
    }
  }

  return {
    version: SAVE_VERSION,
    seed: game.seed,
    createdAt: game.createdAt,
    playtimeS: Math.round(game.playtimeS),
    world: {
      time: w.time ?? 0, day: w.day ?? 1, glint: w.glint ?? 0, tideHeight: w.tideHeight ?? 0,
      plots: w.plots.map((p) => ({ px: p.px, py: p.py, owned: !!p.owned, ordinal: p.ordinal ?? null, feature: p.feature, known: !!p.known, biome: p.biome })),
      flags: w.flags ?? {}, bound: w.bound ?? [], counters: w.counters ?? {},
    },
    realms: {
      overworld: { tilePatches: [...realm.patches.values()], nodes, structures, drops, chests },
    },
    profiles,
    systems,
    nextEntityId: game.nextEntityId,
  };
}

// Applied by Game.init after the overworld has been regenerated from seed + owned plots.
export function restoreGame(game, data) {
  game.createdAt = data.createdAt ?? game.createdAt;
  game.playtimeS = data.playtimeS ?? 0;
  let maxId = 0;
  const realm = game.realms.get('overworld');
  const r = data.realms?.overworld ?? {};
  for (const p of r.tilePatches ?? []) if (Array.isArray(p) && p.length >= 4) realm.applyPatch(p);
  // WP14 (BUILD_REVIEW P2-13): fresh node/drop ids start above every saved id, so a restored structure or chest can
  // never collide with (and silently replace) a node restored before it.
  let savedMax = Number(data.nextEntityId) || 1;
  for (const s of r.structures ?? []) if (Number.isInteger(s.id)) savedMax = Math.max(savedMax, s.id + 1);
  for (const c of r.chests ?? []) if (Number.isInteger(c.id)) savedMax = Math.max(savedMax, c.id + 1);
  game.nextEntityId = Math.max(game.nextEntityId, savedMax);

  const mk = (id, type, kind, x, y) => {
    const e = new Entity(id ?? game.allocId(), type, kind, 'overworld', x, y);
    maxId = Math.max(maxId, e.id);
    return e;
  };
  for (const n of r.nodes ?? []) {
    const [kind, tx, ty, hp, v = 0, big = 0] = n;
    const def = game.content.nodes.byId[kind];
    if (!def) continue;
    const e = mk(null, 'node', kind, tx + 0.5, ty + 0.5);
    e.hp = hp; e.maxHp = def.hp ?? hp; e.radius = 0.45;
    e.data = { tx, ty, tier: def.tier ?? 1 };
    e.set('v', v); e.set('big', big);
    realm.add(e);
  }
  for (const s of r.structures ?? []) {
    const def = game.content.structures.byId[s.kind];
    const data = s.state && typeof s.state === 'object' ? s.state : {};
    const w = data.w ?? def?.w ?? 1, h = data.h ?? def?.h ?? 1;
    data.tx = s.tx; data.ty = s.ty; data.w = w; data.h = h;
    const e = mk(s.id, 'structure', s.kind, s.tx + w / 2, s.ty + h / 2);
    e.hp = s.hp ?? def?.hp ?? 100; e.maxHp = def?.hp ?? e.hp;
    e.radius = Math.max(w, h) / 2;
    e.solid = def?.solid ?? false;
    e.data = data;
    e.set('rot', s.rot ?? 0); e.set('own', 0); e.set('on', 1);
    realm.add(e);
    if (e.solid) for (let y = s.ty; y < s.ty + h; y++) for (let x = s.tx; x < s.tx + w; x++) realm.flags[y * realm.w + x] |= FLAG.SOLID;
  }
  for (const [item, qty, x, y] of r.drops ?? []) {
    const e = mk(null, 'drop', 'drop', x, y);
    e.radius = 0.25;
    e.data = { owner: 0, t: game.now };
    e.set('it', item); e.set('q', qty);
    realm.add(e);
  }
  for (const c of r.chests ?? []) {
    const e = mk(c.id, 'chest', c.kind, c.x, c.y);
    e.hp = c.hp ?? 1; e.maxHp = e.hp; e.data = c.data ?? {};
    for (const k of Object.keys(c.pub ?? {})) e.set(k, c.pub[k]);
    realm.add(e);
  }
  game.nextEntityId = Math.max(game.nextEntityId, data.nextEntityId ?? 1, maxId + 1);

  for (const [token, prof] of Object.entries(data.profiles ?? {})) game.profiles.set(token, prof);
  for (const s of game.systems) {
    if (typeof s.load !== 'function') continue;
    try { s.load(game, data.systems?.[s.name]); } catch (err) { console.error(`[tb:${s.name}] load threw:`, err); }
  }
}

export function backupPath(path, i) { return path.replace(/\.json$/, '') + `.bak${i}.json`; }

function rotateBackups(st, path) {
  if (!st.existsSync(path)) return;
  for (let i = BACKUPS - 1; i >= 1; i--) {
    const from = backupPath(path, i);
    if (st.existsSync(from)) st.renameSync(from, backupPath(path, i + 1));
  }
  st.copySync(path, backupPath(path, 1));
}

// Atomic write. Rotates backups at most every BACKUP_INTERVAL_S of simulated time.
export async function saveToDisk(path, data, { sync = false, game = null } = {}) {
  const st = requireStore();
  const json = JSON.stringify(data);
  const dueBackup = game && (game.lastBackupAt === undefined || game.now - game.lastBackupAt >= BACKUP_INTERVAL_S);
  if (dueBackup) { rotateBackups(st, path); game.lastBackupAt = game.now; }
  if (sync) st.writeSync(path, json);
  else await st.write(path, json);
  return json.length;
}

// Returns the parsed (migrated) save, falling back to the newest readable backup; null if none.
export function loadSave(path) {
  const st = requireStore();
  const candidates = [path];
  for (let i = 1; i <= BACKUPS; i++) candidates.push(backupPath(path, i));
  for (const p of candidates) {
    if (!st.existsSync(p)) continue;
    try {
      const data = JSON.parse(st.readSync(p));
      if (p !== path) console.warn(`[tb:save] main save unreadable, loaded backup ${p}`);
      return migrate(data);
    } catch (err) {
      console.error(`[tb:save] failed to read ${p}:`, err.message);
    }
  }
  return null;
}
