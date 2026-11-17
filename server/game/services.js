// Service registry (TECH_SPEC 5.5) plus a simple default for every service so the skeleton runs.
// Owning packages replace a default by calling game.services.register(name, fn) in their system init().

import { FLAG, T, plotOfTile, plotIndex, biomeOf, inPlotBounds } from '../../shared/grid.js';
import { REACH } from '../../shared/config.js';
import { round5 } from '../../shared/math.js';
import { createEntity } from './entities.js';
import { Realm } from './realm.js';

export const SERVICE_NAMES = Object.freeze([
  // combat (WP5)
  'damage', 'heal', 'applyStatus', 'clearStatus', 'spawnMob', 'registerBossScript', 'startBoss', 'disableStructure',
  // items, nodes, structures (WP4)
  'giveItem', 'takeItems', 'countItem', 'dropItem', 'hitNode', 'placeStructure', 'removeStructure', 'canPlace',
  'registerPlaceValidator', 'containerOf', 'insertInto', 'extractFrom', 'registerIO',
  // interaction (WP1a)
  'registerInteract',
  // world (WP7)
  'addGlint', 'spendGlint', 'landCostNext', 'ballastFor', 'featureAt', 'timeInfo', 'spawnNode', 'respawnNodes', 'nodesInRadius',
  // progression (WP6a / WP6b)
  'grantXp', 'queueDraft', 'hasUnlock', 'addBuff', 'removeBuff',
  // automation (WP8)
  'machineSpeed', 'disableMachine', 'machineClusters', 'refillTend',
  // farming, fishing, market (WP9)
  'farmTend', 'growCrops', 'rollFish', 'sellItems', 'shopStock',
  // dungeons (WP10)
  'createInstance', 'rollVaultLoot',
  // collections (WP11)
  'counter',
  // co-op (WP13)
  'coopScale', 'boundCount', 'partyAverageLevel', 'isHost',
  // core (WP1a)
  'movePlayer', 'toast', 'fx',
]);

export class Services {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.owner = new Map();            // name -> 'default' | system name, for diagnostics
    this.interactions = new Map();     // entity kind or type -> fn(game, player, entity)
    this.placeValidators = [];
    this.io = new Map();               // structure kind -> { insert, extract }
    this.bossScripts = new Map();
    this.currentSystem = 'default';
  }

  register(name, fn) {
    if (typeof fn !== 'function') throw new TypeError(`service '${name}' must be a function`);
    this.map.set(name, fn);
    this.owner.set(name, this.currentSystem);
  }

  has(name) { return this.map.has(name); }
  get(name) { return this.map.get(name); }

  call(name, ...args) {
    const fn = this.map.get(name);
    if (!fn) { console.warn(`[tb:services] unknown service '${name}'`); return undefined; }
    return fn(...args);
  }

  interactFor(entity) {
    return this.interactions.get(entity.kind) || this.interactions.get(entity.type) || null;
  }
}

// ---------------------------------------------------------------- defaults

export function registerDefaults(game) {
  const s = game.services;
  const reg = (name, fn) => s.register(name, fn);
  const content = game.content;
  const realmOf = (r) => (typeof r === 'string' ? game.realms.get(r) : r);
  const sendInv = (p) => game.sendSelf(p, 'inv', game.invView(p));

  // ---- combat ----
  reg('damage', (target, amount, opts = {}) => {
    if (!target || target.removed || !(amount > 0)) return 0;
    const dealt = Math.min(target.hp, amount);
    target.hp -= dealt;
    const realm = game.realms.get(target.realm);
    if (target.type === 'player') {
      const player = game.playerOfEntity(target);
      game.bus.emit('player.hurt', { player, source: opts.source ?? null, dmg: dealt });
      if (target.hp <= 0) game.bus.emit('player.died', { player });
    } else if (target.hp <= 0 && realm) {
      if (target.type === 'mob' || target.type === 'boss') {
        game.bus.emit('mob.killed', { killer: opts.source ?? null, mob: target, kind: target.kind, tier: target.data.tier ?? 1, elite: false, participants: [] });
      }
      realm.remove(target);
    }
    return dealt;
  });
  reg('heal', (target, amount) => {
    if (!target || target.removed || !(amount > 0)) return 0;
    const healed = Math.max(0, Math.min(amount, target.maxHp - target.hp));
    target.hp += healed;
    return healed;
  });
  reg('applyStatus', () => false);
  reg('clearStatus', () => 0);
  reg('spawnMob', (realm, kind, x, y, opts = {}) => {
    realm = realmOf(realm);
    const def = content.enemies.byId[kind];
    const e = createEntity(game, {
      type: 'mob', kind, x, y, hp: def?.hp ?? 50, radius: def?.radius ?? 0.4,
      data: { tier: def?.tier ?? 1, noLoot: !!opts.noLoot }, pub: { el: 0, st: 0 },
    });
    return realm.add(e);
  });
  reg('registerBossScript', (id, script) => { s.bossScripts.set(id, script); });
  reg('startBoss', (realm, bossId, x, y) => {
    realm = realmOf(realm);
    const def = content.bosses.byId[bossId];
    const e = createEntity(game, {
      type: 'boss', kind: bossId, x, y, hp: def?.hp ?? 1000, radius: 1.2,
      data: { script: def?.script ?? bossId }, pub: { el: 0, st: 0, ph: 0 },
    });
    return realm.add(e);
  });
  reg('disableStructure', (structure, seconds) => {
    if (!structure) return;
    structure.set('on', 0);
    structure.data.disabledUntil = game.now + seconds;
  });

  // ---- items, nodes, structures ----
  reg('giveItem', (player, itemId, qty) => {
    const left = game.inv.add(player.inv, itemId, qty);
    if (left < qty) sendInv(player);
    if (left > 0 && player.entity) {
      s.call('dropItem', player.entity.realm, player.entity.x, player.entity.y, itemId, left, { owner: player.id });
    }
    return left;
  });
  reg('takeItems', (player, list) => {
    const ok = game.inv.removeAll(player.inv, list);
    if (ok) sendInv(player);
    return ok;
  });
  reg('countItem', (player, itemId) => game.inv.count(player.inv, itemId));
  reg('dropItem', (realm, x, y, itemId, qty, opts = {}) => {
    realm = realmOf(realm);
    const e = createEntity(game, {
      type: 'drop', kind: 'drop', x, y, radius: 0.25,
      data: { owner: opts.owner ?? 0, t: game.now }, pub: { it: itemId, q: qty },
    });
    return realm.add(e);
  });
  reg('hitNode', (node, dmg, opts = {}) => {
    const none = { broken: false, drops: [] };
    if (!node || node.removed || node.type !== 'node') return none;
    const realm = game.realms.get(node.realm);
    const def = content.nodes.byId[node.kind];
    node.hp -= Math.max(0, dmg);
    game.bus.emit('node.hit', { player: opts.player ?? null, node, dmg });
    if (node.hp > 0) {
      game.fx(realm, def?.fx?.hit ?? 'hit_wood', node.x, node.y);
      return none;
    }
    const drops = [];
    const mult = (opts.yieldMult ?? 1) * (node.pub.big ? 3 : 1);
    for (const d of def?.drops ?? []) {
      const q = Math.round(game.rng.int(d.min ?? 1, d.max ?? d.min ?? 1) * mult);
      if (q > 0) drops.push({ item: d.item, qty: q });
    }
    realm.remove(node);
    for (const d of drops) {
      const a = game.rng.float(0, Math.PI * 2), r = game.rng.float(0.2, 0.7);
      s.call('dropItem', realm, node.x + Math.cos(a) * r, node.y + Math.sin(a) * r, d.item, d.qty, {});
    }
    game.fx(realm, def?.fx?.brk ?? 'break_wood', node.x, node.y);
    game.bus.emit('node.broken', {
      player: opts.player ?? null, node, kind: node.kind, tier: def?.tier ?? 1, x: node.x, y: node.y, byMachine: !!opts.byMachine,
    });
    return { broken: true, drops };
  });

  reg('registerPlaceValidator', (fn) => { s.placeValidators.push(fn); });
  reg('canPlace', (kind, realm, tx, ty, player) => {
    realm = realmOf(realm);
    const def = content.structures.byId[kind];
    const w = def?.w ?? 1, h = def?.h ?? 1;
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) if (!realm.inBounds(x, y)) return { ok: false, err: 'invalid' };
    }
    for (const v of s.placeValidators) {
      try {
        const r = v(kind, realm, tx, ty, player);
        if (r && r.ok === false) return r;
      } catch (err) {
        console.error('[tb:services] place validator threw:', err);
        return { ok: false, err: 'invalid' };
      }
    }
    return { ok: true };
  });
  reg('placeStructure', (realm, kind, tx, ty, rot = 0, owner = null, opts = {}) => {
    realm = realmOf(realm);
    if (!s.call('canPlace', kind, realm, tx, ty, owner).ok && !opts.force) return null;
    const def = content.structures.byId[kind];
    const w = def?.w ?? 1, h = def?.h ?? 1;
    const e = createEntity(game, {
      type: 'structure', kind, x: tx + w / 2, y: ty + h / 2, hp: def?.hp ?? 100, radius: Math.max(w, h) / 2,
      solid: def?.solid ?? false,
      data: { tx, ty, w, h, owner: owner?.token ?? null, paid: opts.free ? [] : (def?.cost ?? []), ...(opts.data || {}) },
      pub: { rot: rot & 3, own: owner?.id ?? 0, on: 1 },
    });
    realm.add(e);
    if (e.solid) for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) realm.setFlag(x, y, FLAG.SOLID, true);
    game.bus.emit('structure.placed', { player: owner, structure: e });
    return e;
  });
  reg('removeStructure', (structure, opts = {}) => {
    if (!structure || structure.removed) return;
    const realm = game.realms.get(structure.realm);
    const { tx, ty, w = 1, h = 1 } = structure.data;
    if (structure.solid) for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) realm.setFlag(x, y, FLAG.SOLID, false);
    realm.remove(structure);
    game.bus.emit('structure.removed', { player: opts.refundTo ?? null, structure });
  });
  reg('containerOf', (structure) => structure?.data?.inv ?? null);
  reg('registerIO', (kind, io) => { s.io.set(kind, io); });
  reg('insertInto', (structure, itemId, qty, opts = {}) => {
    const io = s.io.get(structure?.kind);
    if (io) return io.insert(structure, itemId, qty, opts);
    const inv = s.call('containerOf', structure);
    return inv ? qty - game.inv.add(inv, itemId, qty) : 0;
  });
  reg('extractFrom', (structure, filter, max) => {
    const io = s.io.get(structure?.kind);
    if (io) return io.extract(structure, filter, max);
    const inv = s.call('containerOf', structure);
    if (!inv) return null;
    for (const slot of inv.slots) {
      if (slot && (!filter || filter(slot[0]))) {
        const item = slot[0];
        return { item, qty: game.inv.remove(inv, item, Math.min(max, slot[1])) };
      }
    }
    return null;
  });

  // ---- interaction ----
  reg('registerInteract', (kindOrType, fn) => { s.interactions.set(kindOrType, fn); });

  // ---- world ----
  reg('addGlint', (amount, source, player = null) => {
    game.world.glint = Math.max(0, (game.world.glint || 0) + amount);
    game.sendWorld('glint', game.world.glint);
    game.bus.emit('glint.changed', { delta: amount, source, player });
  });
  reg('spendGlint', (amount, source, player) => {
    if ((game.world.glint || 0) < amount) return false;
    game.world.glint -= amount;
    game.sendWorld('glint', game.world.glint);
    game.bus.emit('glint.changed', { delta: -amount, source, player });
    return true;
  });
  reg('landCostNext', () => {
    const ordinal = game.world.plots.filter((p) => p.owned).length;   // start plot is ordinal 0
    return { ordinal, glint: round5(50 * Math.pow(1.08, ordinal)) * s.call('coopScale') };
  });
  reg('ballastFor', () => ({ item: 'ballast_1', qty: 10 }));
  reg('featureAt', (realm, x, y) => {
    const { px, py } = plotOfTile(Math.floor(x), Math.floor(y));
    if (!inPlotBounds(px, py)) return null;
    const p = game.world.plots[plotIndex(px, py)];
    return { px, py, biome: biomeOf(px, py), feature: p?.feature ?? 'wild', owned: !!p?.owned };
  });
  reg('timeInfo', () => ({
    day: game.world.day ?? 1, phase: 'day', isNight: false,
    lowTide: !!game.realms.get('overworld')?.lowTide, turning: false, weather: 'clear', forecast: ['clear', 'clear', 'clear'],
  }));
  reg('spawnNode', (realm, kind, tx, ty) => {
    realm = realmOf(realm);
    const def = content.nodes.byId[kind];
    if (!def || !realm.isWalkable(tx, ty) || realm.entityAtTile(tx, ty)) return null;
    const e = createEntity(game, {
      type: 'node', kind, x: tx + 0.5, y: ty + 0.5, hp: def.hp ?? 3, radius: 0.45,
      data: { tx, ty, tier: def.tier ?? 1 }, pub: { v: game.rng.int(0, 3), big: 0 },
    });
    return realm.add(e);
  });
  reg('respawnNodes', () => 0);
  reg('nodesInRadius', (realm, x, y, r, maxTier = 99) =>
    realmOf(realm).query(x, y, r, [], (e) => e.type === 'node' && (e.data.tier ?? 1) <= maxTier));

  // ---- progression ----
  reg('grantXp', (player, amount, source) => {
    if (!player || !(amount > 0)) return 0;
    const amt = Math.round(amount);
    player.xp += amt;
    let next = game.xpToNext(player.level);
    while (player.xp >= next && player.level < 100) {
      player.xp -= next;
      player.level += 1;
      next = game.xpToNext(player.level);
      if (player.entity) player.entity.set('lv', player.level);
      game.stats.invalidate(player);
      game.bus.emit('player.levelup', { player, level: player.level });
    }
    game.bus.emit('xp.gained', { player, amount: amt, source });
    game.sendSelf(player, 'xp', { level: player.level, xp: player.xp, next });
    return amt;
  });
  reg('queueDraft', () => {});
  reg('hasUnlock', (unlockId, player) => {
    if (typeof unlockId !== 'string') return false;
    const [kind, arg] = unlockId.split(':');
    if (kind === 'level') return !!player && player.level >= Number(arg);
    return !!game.world.flags[unlockId];
  });
  reg('addBuff', () => {});
  reg('removeBuff', () => {});

  // ---- automation ----
  reg('machineSpeed', () => 1);
  reg('disableMachine', (structure, seconds) => s.call('disableStructure', structure, seconds));
  reg('machineClusters', () => []);
  reg('refillTend', () => {});

  // ---- farming, fishing, market ----
  reg('farmTend', () => ({ did: null, items: [] }));
  reg('growCrops', () => 0);
  reg('rollFish', (biome) => content.fish.find((f) => f.biome === biome)?.id ?? null);
  reg('sellItems', () => 0);
  reg('shopStock', () => []);

  // ---- dungeons ----
  reg('createInstance', (kind) => {
    const id = `${kind}:${game.allocId()}`;
    const realm = new Realm({ id, w: 40, h: 40, kind, fill: T.DUNGEON_FLOOR });
    game.realms.set(id, realm);
    return realm;
  });
  reg('rollVaultLoot', () => []);

  // ---- collections ----
  reg('counter', (player, counterId, delta) => {
    const bag = player ? (player.counters ||= {}) : (game.world.counters ||= {});
    bag[counterId] = (bag[counterId] || 0) + delta;
    return bag[counterId];
  });

  // ---- co-op ----
  reg('coopScale', () => 1);
  reg('boundCount', () => Math.max(1, game.players.size));
  reg('partyAverageLevel', () => {
    let n = 0, sum = 0;
    for (const p of game.players.values()) { n++; sum += p.level; }
    return n ? sum / n : 1;
  });
  reg('isHost', (player) => !!player && (!!player.conn?.loopback || (!!game.opts.adminToken && player.token === game.opts.adminToken)));

  // ---- core ----
  reg('movePlayer', (player, realmId, x, y) => game.movePlayer(player, realmId, x, y));
  reg('toast', (player, text, kind = 'info') => game.toast(player, text, kind));
  reg('fx', (realm, name, x, y, params) => game.fx(realm, name, x, y, params));
}

// Core `use` action: interact with an entity in reach, dispatched by kind then type.
export function useEntity(game, player, d) {
  const id = d?.id;
  if (!Number.isInteger(id)) return { ok: false, err: 'invalid' };
  const realm = game.realms.get(player.entity.realm);
  const e = realm?.entities.get(id);
  if (!e) return { ok: false, err: 'invalid' };
  const reach = REACH + (e.radius || 0.5);
  const dx = e.x - player.entity.x, dy = e.y - player.entity.y;
  if (dx * dx + dy * dy > reach * reach) return { ok: false, err: 'range' };
  const fn = game.services.interactFor(e);
  if (!fn) return { ok: false, err: 'invalid' };
  const r = fn(game, player, e);
  return r && typeof r === 'object' && 'ok' in r ? r : { ok: true };
}
