// WP6b: consumables and timed buffs (DESIGN 6.5). Services addBuff / removeBuff; action item.use.
//
// item.use { slot, ax, ay }: slot = inventory slot index; ax/ay = aim in tiles x POS_QUANT (bombs, planting).
// Kinds: food (heal x (1 + foodHeal), buff), tonic (buff), restore_surge, bandage (heal over time), bomb (thrown, fused),
// lure (forwards to WP5's boss.summon, which consumes the Lure), token (rerolls the oldest pending draft),
// plant_node (plants the node at the aimed tile).
// Only one food buff and one tonic buff at a time; a new one replaces the old. Durations x (1 + buffDuration) plus the
// food_duration / tonic_duration effects (Salt Idol, Ember Flask). Tidewright Feast is shared with allies within 8 tiles.
//
// self key `buffs`: { t: server seconds, list: [{ id, until, dur, kind, stacks }] } (until = null for permanent).

import { POS_QUANT, REACH } from '../../../shared/config.js';
import { ensureWp6 } from './progression.js';
import { addSurge } from './abilities.js';
import { foesNear, dealDamage, nodesNear, hitNodeFor, healPlayer } from './procs.js';

const USE_CD = 0.4;

export function buffMap(player) { return (player.buffs ||= new Map()); }

export function sendBuffs(game, player) {
  const list = [];
  for (const [id, b] of buffMap(player)) {
    list.push({ id, until: Number.isFinite(b.until) ? +b.until.toFixed(2) : null, dur: Number.isFinite(b.dur) ? +b.dur.toFixed(1) : null, kind: b.kind, stacks: b.stacks || 1 });
  }
  game.sendSelf(player, 'buffs', { t: +game.now.toFixed(2), list });
}

export function addBuff(game, player, id, opts = {}) {
  if (!player || typeof id !== 'string') return;
  const map = buffMap(player);
  const kind = opts.kind || 'buff';
  if (kind === 'food' || kind === 'tonic') for (const [k, b] of map) if (b.kind === kind && k !== id) map.delete(k);
  const dur = opts.duration ?? 10;
  const prev = map.get(id);
  map.set(id, {
    kind, dur, until: dur === Infinity ? Infinity : game.now + dur, mods: opts.mods || [], flags: opts.flags || [],
    stacks: Math.max(1, Math.min(99, opts.stacks ?? prev?.stacks ?? 1)), hot: opts.hot || null, src: opts.src || null,
  });
  game.stats.invalidate(player);
  sendBuffs(game, player);
}

export function removeBuff(game, player, id) {
  if (!player || !buffMap(player).delete(id)) return;
  game.stats.invalidate(player);
  sendBuffs(game, player);
}

const hasBuff = (player, id) => buffMap(player).has(id);

function buffMods(player) {
  const out = [];
  for (const b of buffMap(player).values()) {
    const k = b.stacks || 1;
    for (const m of b.mods) out.push(k === 1 ? m : { ...m, v: m.v * k });
    for (const f of b.flags) out.push({ flag: f });
  }
  return out;
}

function durationFor(game, player, base, kind) {
  const s = game.stats.of(player);
  let mult = 1 + (s.buffDuration || 0);
  if (kind === 'food') mult += game.effects.sum(player, 'food_duration', 'v');
  if (kind === 'tonic') mult += game.effects.sum(player, 'tonic_duration', 'v');
  return base * mult;
}

function aimOf(player, d) {
  const e = player.entity;
  if (Number.isFinite(d?.ax) && Number.isFinite(d?.ay)) return { x: d.ax / POS_QUANT, y: d.ay / POS_QUANT };
  return { x: e.x, y: e.y };
}

function useItem(game, player, d) {
  const i = d?.slot;
  if (!Number.isInteger(i) || i < 0 || i >= player.inv.slots.length) return { ok: false, err: 'invalid' };
  const stack = player.inv.slots[i];
  if (!stack) return { ok: false, err: 'invalid' };
  const def = game.content.items.byId[stack[0]];
  const use = def?.use;
  if (!use) return { ok: false, err: 'invalid' };
  if ((player.nextUseAt ?? 0) > game.now) return { ok: false, err: 'cooldown' };
  const e = player.entity;
  const consume = () => {
    const s2 = player.inv.slots[i];
    if (!s2 || s2[0] !== def.id) return false;
    if (--s2[1] <= 0) player.inv.slots[i] = null;
    game.sendSelf(player, 'inv', game.invView(player));
    return true;
  };
  const s = game.stats.of(player);
  let res = { ok: true };
  switch (use.kind) {
    case 'food': {
      if (!(use.heal > 0) && !use.buff) return { ok: false, err: 'invalid' };
      if (use.heal > 0 && !use.buff && e.hp >= e.maxHp) return { ok: false, err: 'full' };
      consume();
      if (use.heal > 0) healPlayer(game, player, use.heal * (1 + (s.foodHeal || 0)));
      if (use.buff) {
        const targets = [player];
        const party = (def.effects || []).find((x) => x.id === 'party_buff');
        if (party) for (const p of game.players.values()) if (p !== player && p.entity?.realm === e.realm && Math.hypot(p.entity.x - e.x, p.entity.y - e.y) <= party.radius) targets.push(p);
        for (const p of targets) {
          addBuff(game, p, use.buff.id, { kind: 'food', duration: durationFor(game, p, use.buff.dur, 'food'), mods: use.buff.mods, flags: use.buff.flags || def.flags || [] });
          if (p !== player) game.toast(p, `${player.name} shared a ${def.name}!`, 'good');
        }
      }
      game.fx(e.realm, use.heal > 0 ? 'heal' : 'pickup_flash', e.x, e.y, { food: def.id });
      break;
    }
    case 'tonic': {
      consume();
      addBuff(game, player, use.buff.id, { kind: 'tonic', duration: durationFor(game, player, use.buff.dur, 'tonic'), mods: use.buff.mods, flags: use.buff.flags || [] });
      game.fx(e.realm, 'pickup_flash', e.x, e.y, { tonic: def.id });
      break;
    }
    case 'restore_surge': {
      consume();
      addSurge(game, player, use.surge || 100);
      game.fx(e.realm, 'ability_cast', e.x, e.y, { surge: 1 });
      break;
    }
    case 'bandage': {
      if (e.hp >= e.maxHp) return { ok: false, err: 'full' };
      consume();
      const dur = use.dur || 4;
      addBuff(game, player, 'bandage', { kind: 'buff', duration: dur, hot: (use.heal * (1 + (s.foodHeal || 0))) / dur });
      game.fx(e.realm, 'heal', e.x, e.y, { bandage: 1 });
      break;
    }
    case 'bomb': {
      const a = aimOf(player, d);
      const dx = a.x - e.x, dy = a.y - e.y, dl = Math.hypot(dx, dy);
      const k = dl > 6 ? 6 / dl : 1;
      const bx = e.x + dx * k, by = e.y + dy * k;
      consume();
      game.fx(e.realm, 'blast_charge', bx, by, { fuse: 0.8, bomb: 1 });
      (game.bombs ||= []).push({ at: game.now + 0.8, player, realm: e.realm, x: bx, y: by, use });
      break;
    }
    case 'lure': {
      const fn = game.handlers.get('boss.summon');
      if (!fn) return { ok: false, err: 'invalid' };
      res = fn(game, player, { lure: def.id, hard: d.hard === true }) || { ok: false, err: 'invalid' };
      break;
    }
    case 'token': {
      const draft = player.cardState?.drafts?.[0];
      if (!draft) return { ok: false, err: 'invalid' };
      res = game.handlers.get('card.reroll')(game, player, { draft: draft.id });
      break;
    }
    case 'plant_node': {
      const a = aimOf(player, d);
      const tx = Math.floor(a.x), ty = Math.floor(a.y);
      if (Math.hypot(tx + 0.5 - e.x, ty + 0.5 - e.y) > REACH + 0.5) return { ok: false, err: 'range' };
      const n = game.call('spawnNode', e.realm, use.node, tx, ty);
      if (!n) return { ok: false, err: 'invalid' };
      consume();
      game.fx(e.realm, 'crop_grow', n.x, n.y, { plant: 1 });
      break;
    }
    default: return { ok: false, err: 'invalid' };
  }
  if (res.ok) player.nextUseAt = game.now + USE_CD;
  return res;
}

function tickBombs(game) {
  if (!game.bombs?.length) return;
  const due = game.bombs.filter((b) => b.at <= game.now);
  if (!due.length) return;
  game.bombs = game.bombs.filter((b) => b.at > game.now);
  for (const b of due) {
    const { player, use } = b;
    if (!player.entity) continue;
    const r = use.radius || 2;
    game.fx(b.realm, 'burn_explode', b.x, b.y, { r, bomb: 1 });
    for (const f of foesNear(game, b.realm, b.x, b.y, r)) dealDamage(game, player, f, use.dmg || 150, { element: 'ember', knock: 1.5 });
    for (const n of nodesNear(game, b.realm, b.x, b.y, r)) hitNodeFor(game, player, n, use.gather || 30);
  }
}

export default {
  name: 'consumables',

  init(game) {
    ensureWp6(game);
    game.services.register('addBuff', (player, id, opts) => addBuff(game, player, id, opts || {}));
    game.services.register('removeBuff', (player, id) => removeBuff(game, player, id));
    game.stats.addSource('buffs', buffMods);
  },

  handlers: {
    'item.use': useItem,
  },

  tick(game, dt) {
    tickBombs(game);
    for (const p of game.players.values()) {
      const map = p.buffs;
      if (!map?.size) continue;
      let changed = false;
      for (const [id, b] of map) {
        if (b.hot && p.entity?.hp > 0) p.entity.hp = Math.min(p.entity.maxHp, p.entity.hp + b.hot * dt);
        if (b.until <= game.now) {
          map.delete(id); changed = true;
          if (b.kind === 'food' || b.kind === 'tonic') game.toast(p, `${game.content.items.byId[id]?.name ?? id} wore off`, 'info');
        }
      }
      if (changed) { game.stats.invalidate(p); sendBuffs(game, p); }
    }
  },

  onJoin(game, player) { sendBuffs(game, player); },

  saveProfile(game, player) {
    const out = [];
    for (const [id, b] of buffMap(player)) {
      if (id === 'rested' || id === 'wake' || !Number.isFinite(b.until)) continue;
      const left = b.until - game.now;
      if (left > 1) out.push({ id, left: +left.toFixed(1), dur: b.dur, kind: b.kind, mods: b.mods, flags: b.flags, stacks: b.stacks, hot: b.hot });
    }
    return { list: out };
  },

  loadProfile(game, player, data) {
    const map = buffMap(player);
    for (const b of data?.list || []) {
      if (typeof b?.id !== 'string' || !(b.left > 0)) continue;
      map.set(b.id, { kind: b.kind || 'buff', dur: b.dur || b.left, until: game.now + b.left, mods: Array.isArray(b.mods) ? b.mods : [], flags: Array.isArray(b.flags) ? b.flags : [], stacks: b.stacks || 1, hot: b.hot || null });
    }
  },
};

export { hasBuff };
