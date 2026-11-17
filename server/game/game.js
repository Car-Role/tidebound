// Game: realms, players, systems, fixed-step loop, facade methods (TECH_SPEC 5.1).

import { TICK_DT, SLOW_TICK_HZ, MAX_PLAYERS, AUTOSAVE_S, START_PLOT } from '../../shared/config.js';
import { PROTOCOL_VERSION, DEAD_ALLOWED, PASSIVE_ACTIONS, STATE, TOAST_KINDS, sanitizeText } from '../../shared/protocol.js';
import { plotCenter } from '../../shared/grid.js';
import { createRng } from '../../shared/rng.js';
import { Bus } from './bus.js';
import { Services, registerDefaults, useEntity } from './services.js';
import { StatBook } from './statbook.js';
import { bindInventory, resize as resizeInv } from './inventory.js';
import { createPlayer, newProfile, spawnPlayerEntity, snapshotProfile } from './player.js';
import { loadWildcards } from './loader.js';
import { createWorldState, createOverworld, populatePlot } from './worldgen/index.js';
import { systems as defaultSystems } from './systems/index.js';
import { sendSnapshots } from '../net/snapshot.js';
import { serializeGame, restoreGame, saveToDisk } from '../persistence/save.js';

const fallbackXpToNext = (level) => Math.round(100 * Math.pow(level, 1.5));

export class Game {
  constructor(opts = {}) {
    this.opts = {
      seed: opts.seed ?? ((Date.now() ^ (Math.random() * 2 ** 31)) >>> 0),
      worldName: opts.worldName ?? 'world',
      savePath: opts.savePath ?? null,          // null = never write (harness)
      persist: !!opts.persist,
      adminToken: opts.adminToken ?? null,
      verbose: !!opts.verbose,
    };
    this.content = opts.content;
    this.systems = opts.systems ?? defaultSystems;
    this.seed = this.opts.seed >>> 0;
    this.rng = createRng(this.seed);
    this.now = 0;                    // simulated seconds since process start
    this.tickCount = 0;
    this.playtimeS = 0;              // world playtime (accumulates while anyone is connected)
    this.createdAt = Date.now();
    this.nextEntityId = 1;
    this.realms = new Map();
    this.players = new Map();
    this.profiles = new Map();
    this.worldState = Object.create(null);
    this.fxQueue = new Map();
    this.handlers = new Map();
    this.bus = new Bus();
    this.services = new Services(this);
    this.stats = new StatBook(this);
    this.slowAcc = 0;
    this.lastSaveAt = 0;
    this.timer = null;
    this.saving = null;
  }

  log(...a) { if (this.opts.verbose) console.log('[tb:game]', ...a); }

  allocId() { return this.nextEntityId++; }

  async init(saveData = null) {
    const items = this.content.items.byId;
    this.inv = bindInventory((id) => items[id]?.stack ?? 999);
    this.modules = await loadWildcards();
    try {
      const xp = await import('../../shared/rules/xp.js');
      this.xpToNext = typeof xp.xpToNext === 'function' ? xp.xpToNext : fallbackXpToNext;
    } catch { this.xpToNext = fallbackXpToNext; }

    if (saveData && Number.isFinite(saveData.seed)) {
      this.seed = saveData.seed >>> 0;
      this.rng = createRng(this.seed);
    }
    this.world = saveData?.world ? { ...createWorldState(this.seed), ...saveData.world, seed: this.seed } : createWorldState(this.seed);
    this.world.flags ||= {};
    this.realms.set('overworld', createOverworld(this.world));

    registerDefaults(this);
    this.handlers.set('use', useEntity);
    for (const s of this.systems) {
      this.services.currentSystem = s.name;
      try { s.init?.(this); } catch (err) { console.error(`[tb:${s.name}] init threw:`, err); }
      for (const [a, fn] of Object.entries(s.handlers || {})) this.handlers.set(a, fn);
    }
    this.services.currentSystem = 'default';

    if (saveData) restoreGame(this, saveData);
    else {
      const realm = this.realms.get('overworld');
      for (const p of this.world.plots) if (p.owned) populatePlot(this, realm, p.px, p.py);
      for (const s of this.systems) this.safe(s, 'load', () => s.load?.(this, undefined));
    }

    this.sendWorld('glint', this.world.glint);
    this.sendWorld('plots', this.plotsView());
    this.sendWorld('unlocks', this.world.flags);
    this.sendWorld('tideHeight', this.world.tideHeight ?? 0);
    this.sendWorld('sheet', this.stats.world());
    if (!('clock' in this.worldState)) {
      this.sendWorld('clock', { day: this.world.day ?? 1, t: 0, phase: 'day', tideT: 0, low: false, weather: 'clear', nextWeather: 'clear' });
    }
    if (!('landNext' in this.worldState)) this.sendWorld('landNext', this.call('landCostNext'));
    return this;
  }

  safe(system, what, fn) {
    try { return fn(); } catch (err) { console.error(`[tb:${system.name}] ${what} threw:`, err); return undefined; }
  }

  call(name, ...args) { return this.services.call(name, ...args); }

  spawnPoint() { return plotCenter(START_PLOT.px, START_PLOT.py); }

  plotsView() {
    return this.world.plots.map((p) => (p.known ? { owned: !!p.owned, feature: p.feature, known: true } : { owned: !!p.owned, known: false }));
  }

  invView(player) { return { slots: player.inv.slots, hotbar: player.hotbar }; }

  playerOfEntity(e) { return this.players.get(e.id) ?? null; }

  // ---------------------------------------------------------------- messaging facade

  sendSelf(player, key, data) {
    player.selfState[key] = data;
    if (!player.joining) player.conn?.send({ t: 'self', k: key, d: data });
  }

  sendWorld(key, data) {
    this.worldState[key] = data;
    this.broadcast({ t: 'world', k: key, d: data });
  }

  broadcast(msg, filter = null) {
    for (const p of this.players.values()) if (!p.joining && (!filter || filter(p))) p.conn?.send(msg);
  }

  toast(player, text, kind = 'info') {
    const msg = { t: 'toast', text: sanitizeText(String(text), 200), kind: TOAST_KINDS.includes(kind) ? kind : 'info' };
    if (player) player.conn?.send(msg); else this.broadcast(msg);
  }

  // Queue a feedback event for clients in interest range of (x, y). `realm` is a Realm or realm id.
  fx(realm, name, x, y, params) {
    const id = typeof realm === 'string' ? realm : realm?.id;
    if (!id) return;
    let q = this.fxQueue.get(id);
    if (!q) { q = []; this.fxQueue.set(id, q); }
    q.push(params === undefined ? [name, +x.toFixed(2), +y.toFixed(2)] : [name, +x.toFixed(2), +y.toFixed(2), params]);
  }

  markActive(player, reason) {
    this.bus.emit('player.active', { playerId: player.id, player, reason });
  }

  // ---------------------------------------------------------------- players

  // Returns { ok, player } or { ok:false, reason }.
  join(conn, hello) {
    const existing = [...this.players.values()].find((p) => p.token === hello.token);
    if (existing) {
      existing.conn?.send({ t: 'kicked', reason: 'replaced' });
      const old = existing.conn;
      this.leave(existing);
      old?.close?.(4000, 'replaced');
    }
    if (this.players.size >= MAX_PLAYERS) return { ok: false, reason: 'full' };

    let profile = this.profiles.get(hello.token);
    if (!profile) { profile = newProfile(hello.name, hello.color); this.profiles.set(hello.token, profile); }
    profile.name = hello.name;
    profile.color = hello.color;

    const player = createPlayer(this, conn, hello.token, profile);
    resizeInv(player.inv, Math.max(player.inv.slots.length, this.stats.of(player).invSlots));
    player.statsCache = null;
    spawnPlayerEntity(this, player);
    this.players.set(player.id, player);
    conn.player = player;

    for (const s of this.systems) {
      if (s.loadProfile) this.safe(s, 'loadProfile', () => s.loadProfile(this, player, profile.sys?.[s.name]));
    }
    this.sendSelf(player, 'inv', this.invView(player));
    this.sendSelf(player, 'xp', { level: player.level, xp: player.xp, next: this.xpToNext(player.level) });
    this.sendSelf(player, 'gear', player.gear);
    this.stats.invalidate(player);
    this.sendSelf(player, 'stats', this.stats.of(player));
    for (const s of this.systems) if (s.onJoin) this.safe(s, 'onJoin', () => s.onJoin(this, player));
    this.bus.emit('player.join', { player });

    const realm = this.realms.get(player.entity.realm);
    conn.send({
      t: 'welcome', id: player.id, v: PROTOCOL_VERSION, contentHash: this.content.hash,
      world: { ...this.worldState }, self: { ...player.selfState },
      realm: { id: realm.id, w: realm.w, h: realm.h, kind: realm.kind }, tick: this.tickCount,
    });
    player.joining = false;
    this.log(`join ${player.name} (#${player.id})`);
    return { ok: true, player };
  }

  leave(player) {
    if (!this.players.has(player.id)) return;
    for (const s of this.systems) if (s.onLeave) this.safe(s, 'onLeave', () => s.onLeave(this, player));
    this.bus.emit('player.leave', { player });
    this.profiles.set(player.token, snapshotProfile(this, player));
    const realm = this.realms.get(player.entity?.realm);
    if (realm && player.entity) realm.remove(player.entity);
    this.players.delete(player.id);
    if (player.conn) player.conn.player = null;
    this.log(`leave ${player.name} (#${player.id})`);
    if (this.players.size === 0 && this.opts.savePath) {
      this.save().catch((err) => console.error('[tb:save] save on last leave failed:', err));
    }
  }

  // Move a player to another realm (or teleport within one) and send the `realm` message.
  movePlayer(player, realmId, x, y) {
    const to = this.realms.get(realmId);
    const e = player.entity;
    if (!to || !e) return false;
    const from = this.realms.get(e.realm);
    if (from && from !== to) { from.remove(e); to.add(e); }
    to.move(e, x, y);
    e.vx = 0; e.vy = 0;
    player.inputs.length = 0;
    player.body.dodgeT = 0;
    player.known.clear();
    player.knownChunks.clear();
    player.conn?.send({ t: 'realm', id: to.id, w: to.w, h: to.h, kind: to.kind, x, y, tick: this.tickCount });
    return true;
  }

  // ---------------------------------------------------------------- actions

  handleAction(player, a, d) {
    if (!player.entity) return { ok: false, err: 'invalid' };
    const st = player.entity.state;
    if ((st === STATE.DEAD || st === STATE.DOWN) && !DEAD_ALLOWED.has(a)) return { ok: false, err: 'dead' };
    const fn = this.handlers.get(a);
    if (!fn) return { ok: false, err: 'invalid' };
    let r;
    try { r = fn(this, player, d); } catch (err) {
      console.error(`[tb:action] '${a}' threw:`, err);
      return { ok: false, err: 'invalid' };
    }
    const res = r && typeof r === 'object' ? r : { ok: r !== false };
    if (res.ok && !PASSIVE_ACTIONS.has(a)) this.markActive(player, a);
    return res;
  }

  // ---------------------------------------------------------------- loop

  tick(dt = TICK_DT) {
    this.now += dt;
    this.tickCount++;
    const active = this.players.size > 0 || this.opts.persist;
    if (this.players.size > 0) {
      this.playtimeS += dt;
      for (const p of this.players.values()) p.playtimeS += dt;
    }
    if (active) {
      for (const s of this.systems) {
        if (s.tick) { try { s.tick(this, dt); } catch (err) { console.error(`[tb:${s.name}] tick threw:`, err); } }
      }
      this.slowAcc += dt;
      while (this.slowAcc >= 1 / SLOW_TICK_HZ - 1e-9) {
        this.slowAcc -= 1 / SLOW_TICK_HZ;
        this.slowTick();
      }
    }
    this.stats.flush();
    sendSnapshots(this);
  }

  slowTick() {
    this.stats.checkConditions();
    for (const s of this.systems) {
      if (s.slowTick) { try { s.slowTick(this); } catch (err) { console.error(`[tb:${s.name}] slowTick threw:`, err); } }
    }
    if (this.opts.savePath && this.now - this.lastSaveAt >= AUTOSAVE_S) {
      this.lastSaveAt = this.now;
      this.save().catch((err) => console.error('[tb:save] autosave failed:', err));
    }
  }

  // Fixed-timestep real-time loop with drift correction; drops backlog beyond 250 ms (no spiral).
  // `timers` swaps the timer source: the browser host passes worker-backed timers so a hidden tab keeps 20 Hz.
  start(timers = null) {
    const setT = timers?.setTimeout ?? setTimeout;
    this.clearT = timers?.clearTimeout ?? clearTimeout;
    let last = performance.now();
    let acc = 0;
    const loop = () => {
      const t = performance.now();
      acc += (t - last) / 1000;
      last = t;
      if (acc > 0.25) acc = TICK_DT;
      while (acc >= TICK_DT) { this.tick(TICK_DT); acc -= TICK_DT; }
      this.timer = setT(loop, Math.max(1, (TICK_DT - acc) * 1000));
    };
    this.timer = setT(loop, TICK_DT * 1000);
  }

  stop() { if (this.timer) (this.clearT ?? clearTimeout)(this.timer); this.timer = null; }

  // ---------------------------------------------------------------- persistence

  serialize() { return serializeGame(this); }

  async save({ sync = false } = {}) {
    if (!this.opts.savePath) return null;
    const data = this.serialize();
    if (sync) return saveToDisk(this.opts.savePath, data, { sync: true, game: this });
    if (this.saving) return this.saving;
    this.saving = saveToDisk(this.opts.savePath, data, { game: this }).finally(() => { this.saving = null; });
    return this.saving;
  }
}

export { STATE };
