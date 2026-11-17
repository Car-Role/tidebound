// Stat sheets (TECH_SPEC 5.6 / 7.1, plus the WP2 registry additions).
// Sources return Mod[] = [{ stat, op: 'add'|'mul', v, when? }] and may mix in { flag: '<FLAG id>' } entries.
// final = (base + levelGain + sum(add)) * product(1 + mul), then caps. Only the statbook applies caps.
// `when` (registries.CONDITIONS) is evaluated per player; condition results are re-checked at 1 Hz and
// on clock/weather/tide events, and a sheet is recomputed when any condition it used flips.
// Stat tables come from shared/data/registries.js (STATS / WORLD_STATS) when present; the built-in
// tables below are the fallback and match TECH_SPEC 7.1.

import { T } from '../../shared/grid.js';

// [base, perLevel, max, min]; null = uncapped. Negative caps are floors (min).
const FALLBACK_PLAYER = {
  maxHp: [100, 8, null, null], hpRegen: [0.5, 0, null, null], maxSurge: [100, 0, null, null],
  surgeRegen: [5, 0, null, null], surgeCost: [0, 0, null, -0.5], cdr: [0, 0, 0.5, null],
  power: [0, 0.01, null, null], abilityPower: [0, 0, null, null], summonPower: [0, 0, null, null],
  summonDuration: [0, 0, null, null], gatherPower: [0, 0.01, null, null], swingSpeed: [0, 0, 1.5, null],
  critChance: [0.05, 0, 0.75, null], critMult: [1.5, 0, null, null], armor: [0, 0, null, null],
  dmgTaken: [0, 0, null, -0.6], elemResist: [0, 0, 0.75, null], lifesteal: [0, 0, 0.15, null],
  thorns: [0, 0, 1.0, null], bossDmg: [0, 0, null, null], eliteDmg: [0, 0, null, null],
  burnDmg: [0, 0, null, null], slowPotency: [0, 0, null, null], moveSpeed: [0, 0, 0.8, null],
  dodgeCharges: [2, 0, 5, null], dodgeRecharge: [0, 0, null, -0.6], luck: [0, 0, 100, null],
  xpMult: [0, 0, 1.5, null], nightXp: [0, 0, null, null],
  yieldAll: [0, 0, 2.0, null], yieldWood: [0, 0, null, null], yieldStone: [0, 0, null, null],
  yieldOre: [0, 0, null, null], yieldPlant: [0, 0, null, null], yieldTidal: [0, 0, null, null],
  yieldMob: [0, 0, null, null], yieldCrop: [0, 0, null, null],
  glintMult: [0, 0, 1.0, null], glintMob: [0, 0, null, null], sellMult: [0, 0, 0.5, null],
  craftSpeed: [0, 0, 2.0, null], kilnSpeed: [0, 0, 2.0, null], structCost: [0, 0, null, -0.25],
  landDiscount: [0, 0, 0.2, null], pickupRadius: [2.0, 0, 8, null], invSlots: [24, 0, 80, null],
  fishBite: [0, 0, null, -0.6], cropGrowth: [0, 0, 2.0, null], buffDuration: [0, 0, 1.0, null],
  foodHeal: [0, 0, 1.0, null], reviveSpeed: [0, 0, 1.0, null], lightRadius: [5, 0, 14, null],
  tidalDuration: [0, 0, 0.5, null], draftOffers: [3, 0, 5, null], draftRarePlus: [0, 0, 0.2, null],
  machineNear: [0, 0, null, null], threat: [1, 0, null, null],
  cacheChance: [0, 0, null, null], chestLoot: [0, 0, null, null], weatherBonus: [0, 0, null, null],
};
const FALLBACK_WORLD = {
  machineSpeed: [0, 0, 2.0, null], scuttlerRate: [0, 0, null, null], machineCap: [0, 0, 6, null],
  fluxUse: [0, 0, null, -0.3], nodeRespawn: [0, 0, 0.5, null], kilnSpeedWorld: [0, 0, 1.0, null],
  cropGrowthWorld: [0, 0, 1.0, null], fishBiteWorld: [0, 0, null, -0.3], yieldWoodWorld: [0, 0, 0.1, null],
  yieldStoneWorld: [0, 0, 0.1, null], luckWorld: [0, 0, null, null], dmgWorld: [0, 0, null, null],
  xpWorld: [0, 0, 0.3, null], landDiscountWorld: [0, 0, 0.2, null], satRecover: [0, 0, 1.0, null],
  lampRadius: [0, 0, null, null],
};

export const YIELD_KEYS = Object.freeze(['yieldWood', 'yieldStone', 'yieldOre', 'yieldPlant', 'yieldTidal', 'yieldMob', 'yieldCrop']);

// World values copied into every player sheet.
export const WORLD_TO_PLAYER = Object.freeze(['xpWorld', 'luckWorld', 'dmgWorld', 'yieldWoodWorld', 'yieldStoneWorld', 'cropGrowthWorld', 'fishBiteWorld']);

// Registry shape { base, perLevel?, cap?, capMode?: 'min' } -> [base, perLevel, max, min].
function fromRegistry(table) {
  const out = {};
  for (const [k, d] of Object.entries(table)) {
    const isMin = d.capMode === 'min';
    out[k] = [d.base ?? 0, d.perLevel ?? 0, d.cap != null && !isMin ? d.cap : null, d.cap != null && isMin ? d.cap : null];
  }
  return out;
}

const capValue = (v, max, min) => {
  if (max != null && v > max) v = max;
  if (min != null && v < min) v = min;
  return v;
};

export class StatBook {
  constructor(game) {
    this.game = game;
    const reg = game.content?.registries;
    this.playerTable = reg?.STATS ? fromRegistry(reg.STATS) : FALLBACK_PLAYER;
    this.worldTable = reg?.WORLD_STATS ? fromRegistry(reg.WORLD_STATS) : FALLBACK_WORLD;
    this.yieldCap = reg?.YIELD_BONUS_CAP ?? 2.0;
    this.sources = new Map();
    this.worldSources = new Map();
    this.flagSources = new Map();
    this.conditions = new Map();
    this.dirty = new Set();
    this.worldCache = null;
    this.worldConds = null;
    this.warned = new Set();
    this.registerDefaultConditions();
    for (const ev of ['clock.phase', 'weather.change', 'tide.change']) game.bus.on(ev, () => this.invalidateConditional());
  }

  // ---- registration ----
  addSource(name, fn) { this.sources.set(name, fn); this.invalidateAll(); }
  removeSource(name) { this.sources.delete(name); this.invalidateAll(); }
  addWorldSource(name, fn) { this.worldSources.set(name, fn); this.invalidateWorld(); }
  removeWorldSource(name) { this.worldSources.delete(name); this.invalidateWorld(); }
  // fn(player) -> string[] of registries.FLAGS ids. Mod sources may also return { flag } entries.
  addFlagSource(name, fn) { this.flagSources.set(name, fn); this.invalidateAll(); }
  removeFlagSource(name) { this.flagSources.delete(name); this.invalidateAll(); }
  // fn(game, player | null) -> boolean. Owners (e.g. WP7 clock) may replace the defaults.
  setCondition(id, fn) { this.conditions.set(id, fn); this.invalidateConditional(); }

  registerDefaultConditions() {
    const g = this.game;
    const info = () => g.services.has('timeInfo') ? g.call('timeInfo') : { isNight: false, weather: 'clear', lowTide: false };
    const tileOf = (p) => {
      const e = p?.entity;
      if (!e) return -1;
      return g.realms.get(e.realm)?.groundAt(Math.floor(e.x), Math.floor(e.y)) ?? -1;
    };
    const shallows = (p) => { const t = tileOf(p); return t === T.SHALLOW || t === T.TIDAL; };
    const rain = () => ['rain', 'storm'].includes(info().weather);
    this.conditions.set('night', () => !!info().isNight);
    this.conditions.set('day', () => !info().isNight);
    this.conditions.set('rain', rain);
    this.conditions.set('shallows', (game, p) => shallows(p));
    this.conditions.set('shallows_or_rain', (game, p) => shallows(p) || rain());
    this.conditions.set('low_tide', () => !!info().lowTide);
    this.conditions.set('low_hp', (game, p) => !!p?.entity && p.entity.maxHp > 0 && p.entity.hp < 0.4 * p.entity.maxHp);
    this.conditions.set('in_dungeon', (game, p) => {
      const kind = p?.entity ? g.realms.get(p.entity.realm)?.kind : null;
      return kind === 'vault' || kind === 'trench';
    });
  }

  evalCondition(id, player, memo) {
    if (memo.has(id)) return memo.get(id);
    const fn = this.conditions.get(id);
    let v = false;
    if (fn) { try { v = !!fn(this.game, player); } catch (err) { this.warnOnce('cond:' + id, `condition '${id}' threw: ${err.message}`); } }
    else this.warnOnce('cond:' + id, `unknown condition '${id}' (mod ignored)`);
    memo.set(id, v);
    return v;
  }

  warnOnce(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[tb:statbook] ${msg}`);
  }

  // ---- invalidation ----
  invalidate(player) { if (player) { player.statsCache = null; player.flagCache = null; this.dirty.add(player); } }
  invalidateAll() { for (const p of this.game.players.values()) this.invalidate(p); }
  invalidateWorld() { this.worldCache = null; this.worldDirty = true; this.invalidateAll(); }
  invalidateConditional() {
    if (this.worldConds && this.worldConds.size) this.invalidateWorld();
    for (const p of this.game.players.values()) if (p.statConds && p.statConds.size) this.invalidate(p);
  }

  // 1 Hz: recompute sheets whose `when` conditions changed value (shallows, low_hp, in_dungeon, ...).
  checkConditions() {
    const changed = (conds, player) => {
      if (!conds || !conds.size) return false;
      const memo = new Map();
      for (const [id, v] of conds) if (this.evalCondition(id, player, memo) !== v) return true;
      return false;
    };
    if (changed(this.worldConds, null)) this.invalidateWorld();
    for (const p of this.game.players.values()) if (changed(p.statConds, p)) this.invalidate(p);
  }

  // ---- aggregation ----
  collect(map, arg, label) {
    const out = [];
    for (const [name, fn] of map) {
      try {
        const r = fn(arg);
        if (Array.isArray(r)) for (const m of r) out.push(m);
      } catch (err) {
        console.error(`[tb:statbook] ${label} source '${name}' threw:`, err);
      }
    }
    return out;
  }

  aggregate(table, entries, levelGainOf, player, condsOut, flagsOut) {
    const add = Object.create(null), mul = Object.create(null);
    const memo = new Map();
    for (const m of entries) {
      if (!m) continue;
      if (m.flag) { flagsOut?.add(m.flag); continue; }
      if (m.when) {
        const v = this.evalCondition(m.when, player, memo);
        condsOut.set(m.when, v);
        if (!v) continue;
      }
      if (!(m.stat in table)) { if (m.stat) this.warnOnce('stat:' + m.stat, `unknown stat '${m.stat}' ignored`); continue; }
      if (!Number.isFinite(m.v)) continue;
      if (m.op === 'mul') mul[m.stat] = (mul[m.stat] ?? 1) * (1 + m.v);
      else add[m.stat] = (add[m.stat] ?? 0) + m.v;
    }
    const out = {};
    for (const k in table) {
      out[k] = capValue((table[k][0] + levelGainOf(k) + (add[k] ?? 0)) * (mul[k] ?? 1), table[k][2], table[k][3]);
    }
    return out;
  }

  world() {
    if (this.worldCache) return this.worldCache;
    const conds = new Map();
    const raw = this.aggregate(this.worldTable, this.collect(this.worldSources, this.game, 'world'), () => 0, null, conds, null);
    this.worldConds = conds;
    this.worldCache = Object.freeze(raw);
    return this.worldCache;
  }

  of(player) {
    if (player.statsCache) return player.statsCache;
    const level = Math.max(1, player.level || 1);
    const conds = new Map();
    const flags = new Set();
    const table = this.playerTable;
    const s = this.aggregate(table, this.collect(this.sources, player, 'player'), (k) => table[k][1] * (level - 1), player, conds, flags);
    for (const k of YIELD_KEYS) if (k in s) s[k] = Math.min(s[k], Math.max(0, this.yieldCap - (s.yieldAll ?? 0)));
    for (const k of ['dodgeCharges', 'invSlots', 'draftOffers']) if (k in s) s[k] = Math.round(s[k]);
    const w = this.world();
    for (const k of WORLD_TO_PLAYER) s[k] = w[k] ?? 0;
    for (const f of this.collect(this.flagSources, player, 'flag')) if (typeof f === 'string') flags.add(f);
    s.flags = Object.freeze([...flags].sort());
    player.statConds = conds;
    player.flagCache = flags;
    player.statsCache = Object.freeze(s);
    return player.statsCache;
  }

  hasFlag(player, flag) {
    if (!player) return false;
    if (!player.flagCache) this.of(player);
    return player.flagCache.has(flag);
  }

  // Called once per tick by the game: recompute invalidated sheets and push them to their owners.
  flush() {
    if (this.worldDirty) {
      this.worldDirty = false;
      this.game.sendWorld('sheet', this.world());
    }
    if (this.dirty.size === 0) return;
    for (const p of this.dirty) {
      if (!this.game.players.has(p.id)) continue;
      const s = this.of(p);
      if (p.entity) {
        const ratio = p.entity.maxHp > 0 ? p.entity.hp / p.entity.maxHp : 1;
        p.entity.maxHp = s.maxHp;
        p.entity.hp = Math.min(s.maxHp, Math.max(0, ratio * s.maxHp));
      }
      this.game.sendSelf(p, 'stats', s);
    }
    this.dirty.clear();
  }
}
