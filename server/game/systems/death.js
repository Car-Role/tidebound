// WP5 player death (DESIGN 5.3): overworld death drops a Sea Chest with 50% of every material stack and
// respawns the player after 5 s at the last used Hammock or the Tidestone. Inside instances (Vaults, the Trench,
// the Moon) players go down for 20 s and any ally can revive them in 3 s (`revive` action, or by standing next
// to them); when everyone is down the instance owner (WP10) ejects the party.
// Extra service: registerDeathGuard(fn(player, src) -> true to cancel death) for cheat_death / revive procs.

import { createEntity } from '../entities.js';
import { STATE } from '../../../shared/protocol.js';
import { DEATH_CHEST_SHARE } from '../../../shared/rules/constants.js';
import { INSTANCE_RULES } from '../../../shared/data/dungeons.js';
import { applyStatusImpl, clearStatusImpl } from './status.js';

const RESPAWN_S = 5;
const CHEST_LIFE_S = 20 * 60;
const REVIVE_RANGE = 1.8;
const REVIVE_HP = 0.3;

export const isDowned = (e) => e?.type === 'player' && (e.state === STATE.DOWN || !!e.data?.status?.downed);
export const isInstanceRealm = (realm) => !!realm && realm.kind !== 'overworld';

function deathState(player) {
  player.death ||= { respawnAt: 0, downAt: 0, downUntil: 0, reviveBy: 0, reviveT: 0, spawn: null, dead: false };
  return player.death;
}

// ---------------------------------------------------------------- lethal damage

export function onPlayerLethal(game, player, src, opts = {}) {
  const e = player.entity;
  if (!e) return;
  // guards (cheat_death, revive procs, blessings) may cancel the death
  for (const fn of game.deathGuards) {
    let saved = false;
    try { saved = !!fn(player, src); } catch (err) { console.error('[tb:death] death guard threw:', err); }
    if (saved) {
      if (e.hp <= 0) e.hp = Math.max(1, Math.round(e.maxHp * 0.3));
      const realm = game.realms.get(e.realm);
      if (realm) game.fx(realm, 'revive', e.x, e.y, { i: e.id });
      return;
    }
  }
  const realm = game.realms.get(e.realm);
  const ds = deathState(player);
  e.hp = 0;
  e.vx = 0; e.vy = 0;
  if (player.body) player.body.dodgeT = 0;
  clearStatusImpl(game, e, 'debuffs');
  if (isInstanceRealm(realm)) {
    // downed: allies have INSTANCE_RULES.downedS seconds to revive
    e.state = STATE.DOWN;
    e.set('a', 'down');
    applyStatusImpl(game, e, 'downed', { duration: INSTANCE_RULES.downedS ?? 20 });
    ds.downAt = game.now;
    ds.downUntil = game.now + (INSTANCE_RULES.downedS ?? 20);
    ds.dead = false;
    ds.reviveT = 0;
    game.fx(realm, 'death_poof', e.x, e.y, { down: 1, i: e.id });
    game.toast(player, 'You are down! An ally can revive you.', 'warn');
    for (const p of game.players.values()) if (p !== player && p.entity?.realm === e.realm) game.toast(p, `${player.name} is down - stand beside them to revive!`, 'warn');
    sendDeath(game, player);
    game.bus.emit('player.downed', { player });
    game.call('checkWipe', realm);
    return;
  }
  // overworld death
  e.state = STATE.DEAD;
  e.set('a', 'down');
  ds.dead = true;
  ds.respawnAt = game.now + RESPAWN_S;
  if (realm) {
    game.fx(realm, 'death_poof', e.x, e.y, { i: e.id });
    dropSeaChest(game, player, realm, e.x, e.y);
  }
  sendDeath(game, player);
  game.bus.emit('player.died', { player });
}

// Called by WP10 when a downed player's timer runs out inside an instance (they stay dead until revived,
// the floor is cleared or the party wipes).
export function killDowned(game, player) {
  const e = player.entity;
  if (!e) return;
  const ds = deathState(player);
  clearStatusImpl(game, e, 'downed');
  if (e.data.status?.downed) delete e.data.status.downed;
  e.state = STATE.DEAD;
  ds.dead = true;
  ds.downUntil = 0;
  ds.respawnAt = Infinity;
  sendDeath(game, player);
  game.bus.emit('player.died', { player });
  const realm = game.realms.get(e.realm);
  if (realm) game.call('checkWipe', realm);
}

function sendDeath(game, player) {
  const ds = deathState(player);
  const e = player.entity;
  game.sendSelf(player, 'death', {
    state: e?.state === STATE.DOWN ? 'down' : e?.state === STATE.DEAD ? 'dead' : 'alive',
    respawnIn: ds.dead && Number.isFinite(ds.respawnAt) ? Math.max(0, ds.respawnAt - game.now) : null,
    downIn: e?.state === STATE.DOWN ? Math.max(0, ds.downUntil - game.now) : null,
    revive: ds.reviveT > 0 ? Math.min(1, ds.reviveT / ds.reviveNeed) : 0,
    at: game.now,
  });
}

// ---------------------------------------------------------------- revive

export function revivePlayer(game, player, { hpFrac = REVIVE_HP, by = null } = {}) {
  const e = player.entity;
  if (!e) return false;
  const ds = deathState(player);
  clearStatusImpl(game, e, 'downed');
  if (e.data.status) delete e.data.status.downed;
  e.state = STATE.IDLE;
  e.set('a', 'idle');
  e.hp = Math.max(1, Math.round(e.maxHp * hpFrac));
  ds.dead = false; ds.downUntil = 0; ds.reviveT = 0; ds.reviveBy = 0; ds.respawnAt = 0;
  applyStatusImpl(game, e, 'invuln', { duration: 1.5 });
  const realm = game.realms.get(e.realm);
  if (realm) game.fx(realm, 'revive', e.x, e.y, { i: e.id });
  game.stats.invalidate(player);
  sendDeath(game, player);
  game.bus.emit('player.revived', { player, by });
  const reviver = by && by.token ? by : null;
  if (reviver && reviver !== player) game.call('counter', reviver, 'allies_revived', 1);   // WP14 (P1-4)
  return true;
}

function reviveAction(game, player, d) {
  const id = d?.id;
  if (!Number.isInteger(id)) return { ok: false, err: 'invalid' };
  const me = player.entity;
  const realm = game.realms.get(me.realm);
  const t = realm?.entities.get(id);
  const other = t ? game.players.get(t.id) : null;
  if (!other || other === player) return { ok: false, err: 'invalid' };
  if (!isDowned(t) && t.state !== STATE.DEAD) return { ok: false, err: 'invalid' };
  if (Math.hypot(t.x - me.x, t.y - me.y) > REVIVE_RANGE + 0.7) return { ok: false, err: 'range' };
  if (t.state === STATE.DEAD && !isInstanceRealm(realm)) return { ok: false, err: 'invalid' };
  const ds = deathState(other);
  ds.reviveBy = player.id;
  ds.reviveHeld = game.now + 0.6;
  return { ok: true };
}

function tickRevives(game, dt) {
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e) continue;
    const ds = deathState(p);
    const realm = game.realms.get(e.realm);
    if (e.state === STATE.DOWN) {
      // any living ally standing next to a downed player channels the revive
      let reviver = null;
      for (const q of game.players.values()) {
        if (q === p || !q.entity || q.entity.realm !== e.realm || q.entity.hp <= 0 || q.entity.state === STATE.DOWN || q.entity.state === STATE.DEAD) continue;
        const near = Math.hypot(q.entity.x - e.x, q.entity.y - e.y) <= REVIVE_RANGE;
        if (near && (ds.reviveBy === q.id || !reviver)) reviver = q;
      }
      if (reviver) {
        const speed = 1 + (game.stats.of(reviver).reviveSpeed ?? 0);
        ds.reviveNeed = (INSTANCE_RULES.reviveS ?? 3);
        ds.reviveT += dt * speed;
        reviver.entity.set('at', Math.min(255, Math.round((ds.reviveT / ds.reviveNeed) * 255)));
        if ((ds.reviveFxAt ?? 0) <= game.now) { ds.reviveFxAt = game.now + 0.5; if (realm) game.fx(realm, 'heal', e.x, e.y - 0.3, { revive: 1 }); sendDeath(game, p); }
        if (ds.reviveT >= ds.reviveNeed) { reviver.entity.set('at', 0); revivePlayer(game, p, { by: reviver }); }
      } else if (ds.reviveT > 0) {
        ds.reviveT = Math.max(0, ds.reviveT - dt * 2);
      }
      if (e.state === STATE.DOWN && game.now >= ds.downUntil) killDowned(game, p);
    } else if (e.state === STATE.DEAD && ds.dead && game.now >= ds.respawnAt) {
      respawn(game, p);
    }
  }
}

// ---------------------------------------------------------------- respawn

export function respawnPoint(game, player) {
  const ds = deathState(player);
  const realm = game.realms.get('overworld');
  if (ds.spawn && realm) {
    const h = realm.entities.get(ds.spawn.id);
    if (h && !h.removed && h.kind === 'hammock') return { x: h.x, y: h.y + 1 };
    if (Number.isFinite(ds.spawn.x)) {
      const found = realm.query(ds.spawn.x, ds.spawn.y, 1.5, [], (s) => s.type === 'structure' && s.kind === 'hammock')[0];
      if (found) return { x: found.x, y: found.y + 1 };
    }
  }
  if (realm) {
    const stone = [...realm.entities.values()].find((s) => s.type === 'structure' && s.kind === 'tidestone');
    if (stone) return { x: stone.x, y: stone.y + 1.6 };
  }
  return game.spawnPoint();
}

export function respawn(game, player, { realmId = 'overworld', x = null, y = null, hpFrac = 1 } = {}) {
  const e = player.entity;
  if (!e) return;
  const ds = deathState(player);
  const pt = x != null ? { x, y } : respawnPoint(game, player);
  clearStatusImpl(game, e, 'downed');
  if (e.data.status) { delete e.data.status.downed; }
  clearStatusImpl(game, e, 'debuffs');
  e.state = STATE.IDLE;
  e.set('a', 'idle');
  e.hp = Math.max(1, Math.round(e.maxHp * hpFrac));
  ds.dead = false; ds.respawnAt = 0; ds.downUntil = 0; ds.reviveT = 0;
  game.movePlayer(player, realmId, pt.x, pt.y);
  applyStatusImpl(game, e, 'invuln', { duration: 2 });
  const realm = game.realms.get(realmId);
  if (realm) game.fx(realm, 'revive', pt.x, pt.y, { respawn: 1, i: e.id });
  game.stats.invalidate(player);
  sendDeath(game, player);
  game.bus.emit('player.revived', { player, respawn: true });
}

// ---------------------------------------------------------------- Sea Chest

function isMaterial(def) { return !!def && (def.cat === 'material' || def.cat === 'component'); }

export function dropSeaChest(game, player, realm, x, y) {
  const items = [];
  const slots = player.inv?.slots ?? [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    const def = game.content.items.byId[s[0]];
    if (!isMaterial(def)) continue;
    const take = Math.floor(s[1] * DEATH_CHEST_SHARE);
    if (take <= 0) continue;
    const removed = game.inv.remove(player.inv, s[0], take);
    if (removed > 0) items.push([s[0], removed]);
  }
  if (!items.length) return null;
  game.sendSelf(player, 'inv', game.invView(player));
  // merge duplicates
  const merged = new Map();
  for (const [it, q] of items) merged.set(it, (merged.get(it) ?? 0) + q);
  const chest = createEntity(game, {
    type: 'chest', kind: 'sea_chest', x, y, radius: 0.45,
    data: { owner: player.token, ownerName: player.name, items: [...merged.entries()], expiresAt: game.playtimeS + CHEST_LIFE_S },
    pub: { own: player.id },
  });
  realm.add(chest);
  game.toast(player, `Your Sea Chest holds ${items.length} stack${items.length > 1 ? 's' : ''}. It lasts 20 minutes.`, 'warn');
  game.fx(realm, 'chest_open', x, y, { thud: 1 });
  return chest;
}

function openSeaChest(game, player, chest) {
  const d = chest.data;
  if (d.owner && d.owner !== player.token) {
    game.toast(player, `This is ${d.ownerName ?? 'someone'}'s Sea Chest.`, 'info');
    return { ok: false, err: 'denied' };
  }
  for (const [it, q] of d.items ?? []) game.call('giveItem', player, it, q);
  const realm = game.realms.get(chest.realm);
  if (realm) { game.fx(realm, 'chest_open', chest.x, chest.y, {}); realm.remove(chest); }
  game.toast(player, 'Recovered your Sea Chest.', 'good');
  return { ok: true };
}

function expireChests(game) {
  const realm = game.realms.get('overworld');
  if (!realm) return;
  for (const e of realm.entities.values()) {
    if (e.type !== 'chest' || e.kind !== 'sea_chest') continue;
    if (!Number.isFinite(e.data.expiresAt)) e.data.expiresAt = game.playtimeS + CHEST_LIFE_S;
    if (game.playtimeS >= e.data.expiresAt) { game.fx(realm, 'summon_puff', e.x, e.y); realm.remove(e); }
  }
}

// ---------------------------------------------------------------- hammock

function useHammock(game, player, h) {
  const ds = deathState(player);
  ds.spawn = { id: h.id, x: h.x, y: h.y };
  game.toast(player, 'Respawn point set at this Hammock.', 'good');
  const realm = game.realms.get(h.realm);
  if (realm) game.fx(realm, 'pickup_flash', h.x, h.y);
  return { ok: true };
}

export default {
  name: 'death',
  init(game) {
    game.deathGuards = [];
    game.services.register('registerDeathGuard', (fn) => { if (typeof fn === 'function') game.deathGuards.push(fn); });
    game.services.register('revivePlayer', (player, opts) => revivePlayer(game, player, opts || {}));
    game.services.register('respawnPlayer', (player, opts) => respawn(game, player, opts || {}));
    game.services.register('killDowned', (player) => killDowned(game, player));
    if (!game.services.has('checkWipe')) game.services.register('checkWipe', () => false);
    game.call('registerInteract', 'sea_chest', openSeaChest);
    game.call('registerInteract', 'hammock', useHammock);
  },
  tick(game, dt) { tickRevives(game, dt); },
  slowTick(game) {
    expireChests(game);
    for (const p of game.players.values()) {
      const e = p.entity;
      if (e && (e.state === STATE.DEAD || e.state === STATE.DOWN)) sendDeath(game, p);
    }
  },
  handlers: { revive: reviveAction },
  onJoin(game, player) {
    deathState(player);
    // a player saved while dead comes back alive
    if (player.entity && player.entity.hp <= 0) { player.entity.hp = player.entity.maxHp; player.entity.state = STATE.IDLE; }
  },
  saveProfile(game, player) { const ds = deathState(player); return ds.spawn ? { spawn: { x: ds.spawn.x, y: ds.spawn.y } } : {}; },
  loadProfile(game, player, data) {
    const ds = deathState(player);
    if (data?.spawn && Number.isFinite(data.spawn.x)) ds.spawn = { id: 0, x: data.spawn.x, y: data.spawn.y };
  },
};
