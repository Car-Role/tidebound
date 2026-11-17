// WP5 combat core: the `damage` / `heal` services, weapon attacks (`attack` action), crits, knockback,
// i-frames, HP regen, lava, kill credit. Target-side mitigation lives here so every source (weapons,
// abilities, procs, turrets, mobs, bosses) goes through one pipeline.
//
// `damage(target, amount, opts)` contract (see docs/notes/WP5-WP10.md):
//   amount  = attacker-side damage (weapon/ability base x power x crit x roll). damage() applies the target
//             side: armor (hollow ignores 30%), weak/resist, mark, shields, guard/vulnerability windows,
//             player dmgTaken/elemResist, plus the attacking player's bossDmg/eliteDmg/dmgWorld.
//   opts    = { source?, element?, crit?, knock?, noProcs?, raw? (skip all mitigation), melee?, ability?,
//               unavoidable? (ignores dodge i-frames), kx?, ky? (knock origin), tag? }

import { STATE, facingFromVector } from '../../../shared/protocol.js';
import { PARTY_RANGE, POS_QUANT } from '../../../shared/config.js';
import { T } from '../../../shared/grid.js';
import { armorFactor, elemMult as ruleElemMult } from '../../../shared/rules/combat.js';
import { HOLLOW_ARMOR_IGNORE, DMG_ROLL, LIFESTEAL_CAP } from '../../../shared/rules/constants.js';
import { STATUSES } from '../../../shared/data/registries.js';
import { hasStatus, statusPower, applyStatusImpl, clearStatusImpl, consumeShield, canAct, setDamageFn } from './status.js';
import { spawnProjectile, burstZonesInArc } from './projectiles.js';
import { onMobDamaged, onMobKilled } from './mobs.js';
import { onBossDamaged, onBossKilled } from './bosses.js';
import { onPlayerLethal, isDowned } from './death.js';

export const FIST = Object.freeze({ id: null, wtype: 'fist', dmg: 3, rate: 2.0, reach: 1.4, arc: 100, tier: 0, pattern: 'arc', element: 'none' });
const HIT_STUN = 0.12;
const OUT_OF_COMBAT_S = 5;
const LAVA_DPS = 30;
const SWING_ANIM_S = 0.22;
const CD_TOLERANCE = 0.06;   // client sends one attack per 0.5 s; allow a little network jitter

// ---------------------------------------------------------------- helpers

export const isPlayerE = (e) => e?.type === 'player';
export const isEnemyE = (e) => e?.type === 'mob' || e?.type === 'boss';
export const alive = (e) => !!e && !e.removed && e.hp > 0;

export function playerOfE(game, e) { return e?.type === 'player' ? game.players.get(e.id) ?? null : null; }

// Entity -> owning player for summons/projectiles (`data.ownerId`), else the player itself.
export function creditPlayer(game, src) {
  if (!src) return null;
  if (src.type === 'player') return game.players.get(src.id) ?? null;
  const oid = src.data?.ownerId;
  if (oid) { const p = game.players.get(oid); if (p) return p; }
  return null;
}

// Hostility: players + their summons vs mobs + bosses. Clones and mobs never hurt each other.
export function teamOf(e) {
  if (!e) return null;
  if (e.type === 'player' || e.type === 'summon') return 'player';
  if (e.type === 'mob' || e.type === 'boss') return 'enemy';
  if (e.type === 'zone' || e.type === 'proj' || e.type === 'structure' || e.type === 'drop' || e.type === 'chest') return null;
  return e.data?.team ?? null;
}

export function mobArmor(e) {
  let a = e.data?.armor ?? 0;
  return a;
}

export function inArc(ox, oy, ang, arcDeg, tx, ty) {
  const a = Math.atan2(ty - oy, tx - ox);
  let d = a - ang;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= (arcDeg * Math.PI) / 360;
}

// Players that are alive (not downed/dead) in a realm, optionally within r of (x, y).
export function livePlayers(game, realmId, x = null, y = null, r = Infinity) {
  const out = [];
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== realmId || e.hp <= 0 || e.state === STATE.DEAD || e.state === STATE.DOWN) continue;
    if (x != null && (e.x - x) ** 2 + (e.y - y) ** 2 > r * r) continue;
    out.push(p);
  }
  return out;
}

export function playersNear(game, realmId, x, y, r = PARTY_RANGE) {
  const out = [];
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== realmId) continue;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) out.push(p);
  }
  return out;
}

// Weapon profile of a player's equipped weapon (gear.weapon item id, tempered via gear.temper).
export function weaponOf(game, player) {
  const id = player?.gear?.weapon;
  const def = id ? game.content.items.byId[id] : null;
  const g = def?.gear;
  if (!g || g.slot !== 'weapon') return FIST;
  const temper = Number(player.gear?.temper?.[id]) || 0;
  const pattern = g.wtype === 'bow' ? 'projectile' : g.wtype === 'staff' ? 'orb' : 'arc';
  return {
    id, wtype: g.wtype, tier: g.tier ?? def.tier ?? 1, dmg: (g.dmg ?? 5) * (1 + 0.06 * temper), rate: g.rate ?? 2,
    reach: g.reach ?? 1.8, arc: g.arc ?? 100, range: g.range ?? 8, splash: g.splash ?? 0, pierce: g.pierce ?? 0,
    element: g.element ?? 'none', pattern,
  };
}

export function classOf(game, player) {
  const id = player?.classState?.id ?? player?.selfState?.class?.id ?? player?.classId ?? null;
  return id ? game.content.classes.byId[id] ?? null : null;
}

// Attacker-side damage roll for a player: base * (1 + power) * favoured * roll * crit.
export function rollPlayerDamage(game, player, base, { abilityMult = 1, ability = false, wtype = null, forceCrit = false } = {}) {
  const s = game.stats.of(player);
  const rng = game.combatRng;
  const cls = classOf(game, player);
  const fav = wtype && cls?.favoured === wtype ? 1.15 : 1;
  const crit = forceCrit || rng.next() < Math.min(0.75, s.critChance ?? 0.05);
  const roll = DMG_ROLL[0] + (DMG_ROLL[1] - DMG_ROLL[0]) * rng.next();
  const power = ability ? (s.abilityPower ?? 0) + (s.power ?? 0) : (s.power ?? 0);
  const amount = base * (1 + power) * abilityMult * fav * roll * (crit ? (s.critMult ?? 1.5) : 1);
  return { amount, crit };
}

// ---------------------------------------------------------------- knockback

export function knockback(game, e, fromX, fromY, dist) {
  if (!e || e.removed || !(dist > 0)) return;
  if (e.type === 'boss' || e.data?.noKnock || e.data?.static) return;
  if (hasStatus(e, 'unstoppable')) return;
  let dx = e.x - fromX, dy = e.y - fromY;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const T_KNOCK = 0.16;
  const v = dist / T_KNOCK;
  e.data.kb = { vx: dx * v, vy: dy * v, t: T_KNOCK };
  game.combatKnocked.add(e);
}

function stepKnock(game, e, dt) {
  const kb = e.data.kb;
  if (!kb || e.removed) return false;
  const realm = game.realms.get(e.realm);
  if (!realm) return false;
  const step = Math.min(dt, kb.t);
  const nx = e.x + kb.vx * step, ny = e.y + kb.vy * step;
  const walk = (x, y) => {
    const r = e.radius * 0.8;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
      if (e.data?.flying ? !realm.inBounds(tx, ty) || realm.groundAt(tx, ty) === T.DUNGEON_WALL || realm.groundAt(tx, ty) === T.EMPTY : !realm.isWalkable(tx, ty)) return false;
    }
    return true;
  };
  let x = e.x, y = e.y;
  if (walk(nx, y)) x = nx;
  if (walk(x, ny)) y = ny;
  realm.move(e, x, y);
  kb.t -= step;
  if (kb.t <= 0) { e.data.kb = null; return false; }
  return true;
}

// ---------------------------------------------------------------- the damage pipeline

export function dealDamage(game, target, amount, opts = {}) {
  if (!target || target.removed || !(amount > 0) || !(target.hp > 0)) return 0;
  const realm = game.realms.get(target.realm);
  if (!realm) return 0;
  const src = opts.source ?? null;
  const srcPlayer = creditPlayer(game, src);
  const element = opts.element && opts.element !== 'none' ? opts.element : 'none';
  const isPlayer = target.type === 'player';
  const tPlayer = isPlayer ? game.players.get(target.id) : null;

  // immunity / i-frames
  if (hasStatus(target, 'invuln')) return 0;
  if (isPlayer) {
    if (target.state === STATE.DEAD || isDowned(target)) return 0;
    if (!opts.unavoidable && !opts.raw && tPlayer?.body?.dodgeT > 0) {
      game.fx(realm, 'dodge_trail', target.x, target.y, { i: target.id, miss: 1 });
      return 0;
    }
  }
  // blind: the blinded attacker misses its next hit
  if (src && src.data?.status?.blind && teamOf(src) !== teamOf(target) && !opts.raw) {
    clearStatusImpl(game, src, 'blind');   // consumed
    game.fx(realm, 'hit_clink', target.x, target.y, { miss: 1 });
    return 0;
  }

  let dmg = amount;
  if (!opts.raw) {
    if (srcPlayer && isEnemyE(target)) {
      const s = game.stats.of(srcPlayer);
      let bonus = s.dmgWorld ?? 0;
      if (target.type === 'boss' || target.data?.bossPart) bonus += s.bossDmg ?? 0;
      if (target.data?.elite) bonus += s.eliteDmg ?? 0;
      dmg *= 1 + bonus;
    }
    if (isEnemyE(target)) {
      const def = target.data;
      const armor = mobArmor(target) * (element === 'hollow' ? 1 - HOLLOW_ARMOR_IGNORE : 1);
      dmg *= armorFactor(armor);
      dmg *= ruleElemMult(element, { weak: def.weak, resist: def.resist });
      // guarded front (clatterclaw): hits from the front are blocked
      if (def.frontBlock && src) {
        const fa = (target.facing & 7) * (Math.PI / 4);
        if (inArc(target.x, target.y, fa, 120, src.x, src.y)) {
          dmg *= 1 - def.frontBlock;
          game.fx(realm, 'hit_armor', target.x, target.y, { block: 1 });
        }
      }
      if (def.dmgMult != null) dmg *= def.dmgMult;          // vulnerability / invulnerability windows
    } else if (isPlayer && tPlayer) {
      const s = game.stats.of(tPlayer);
      dmg *= armorFactor(s.armor ?? 0);
      if (element !== 'none') dmg *= 1 - Math.min(0.75, s.elemResist ?? 0);
      dmg *= Math.max(0.4, 1 + (s.dmgTaken ?? 0));
    }
    const mark = statusPower(target, 'mark');
    if (mark > 0) dmg *= 1 + mark;
  }
  if (!(dmg > 0)) {
    if (isEnemyE(target) && target.data?.dmgMult === 0) game.fx(realm, 'hit_clink', target.x, target.y, { immune: 1 });
    return 0;
  }
  dmg = Math.max(1, Math.round(dmg));
  dmg = consumeShield(game, target, dmg);
  if (dmg <= 0) return 0;

  const dealt = Math.min(target.hp, dmg);
  target.hp -= dealt;
  target.data.lastHurtAt = game.now;

  // presentation
  const crit = !!opts.crit;
  if (isEnemyE(target)) {
    if (src) { target.set('hb', src.data?.ownerId ?? src.id); if (!opts.quiet) target.set('hd', ((target.pub.hd ?? 0) + 1) & 255); }
    if (crit) target.set('hc', ((target.pub.hc ?? 0) + 1) & 255);
    if (!opts.quiet) {
      game.fx(realm, target.data.fxHit ?? 'hit_flesh', target.x, target.y - 0.3, { d: dealt, c: crit ? 1 : 0, b: target.data.blood ?? null, i: target.id });
      if (crit) game.fx(realm, 'crit_spark', target.x, target.y - 0.4, { i: target.id });
    }
    if (target.type === 'mob' && !target.data.static) target.data.hitstun = Math.max(target.data.hitstun ?? 0, HIT_STUN);
  } else if (isPlayer) {
    if (!opts.quiet) game.fx(realm, 'hit_flesh', target.x, target.y - 0.4, { d: dealt, p: 1, i: target.id });
    if (tPlayer) ensureCombatState(tPlayer).lastHurt = game.now;
  }

  // knockback
  const knock = opts.knock ?? 0;
  if (knock > 0 && target.hp > 0) {
    const kx = opts.kx ?? src?.x ?? target.x - 0.01, ky = opts.ky ?? src?.y ?? target.y;
    knockback(game, target, kx, ky, knock);
  }

  // attacker-side reactions
  if (srcPlayer && isEnemyE(target)) {
    const s = game.stats.of(srcPlayer);
    const ls = Math.min(LIFESTEAL_CAP, s.lifesteal ?? 0);
    if (ls > 0 && srcPlayer.entity) dealHeal(game, srcPlayer.entity, dealt * ls, null, { quiet: true });
    target.data.dmgBy ||= {};
    target.data.dmgBy[srcPlayer.id] = (target.data.dmgBy[srcPlayer.id] ?? 0) + dealt;
  }
  if (isPlayer && src && isEnemyE(src)) {
    // elite leeching: heal 20% of damage dealt, drain 10 Surge
    if (src.data?.affixes?.includes('leeching')) {
      dealHeal(game, src, dealt * 0.2, null, { quiet: true });
      if (tPlayer) drainSurge(game, tPlayer, 10);
    }
    // thorns (melee reflect)
    if (opts.melee && tPlayer) {
      const th = Math.min(1, game.stats.of(tPlayer).thorns ?? 0);
      if (th > 0 && alive(src)) dealDamage(game, src, dealt * th, { source: target, raw: true, noProcs: true, quiet: false });
    }
  }

  // bus + per-type hooks
  if (isEnemyE(target)) {
    game.bus.emit('mob.hit', {
      attacker: srcPlayer, mob: target, dmg: dealt, crit, element, source: src, noProcs: !!opts.noProcs,
      ability: !!opts.ability, melee: !!opts.melee, tag: opts.tag ?? null,
    });
    if (target.type === 'mob') onMobDamaged(game, target, dealt, src, opts);
    else onBossDamaged(game, target, dealt, src, opts);
  } else if (isPlayer && tPlayer) {
    game.bus.emit('player.hurt', { player: tPlayer, source: src, dmg: dealt });
  }

  // death
  if (target.hp <= 0) {
    target.hp = 0;
    if (target.type === 'mob') onMobKilled(game, target, srcPlayer, src, opts);
    else if (target.type === 'boss') onBossKilled(game, target, srcPlayer, src, opts);
    else if (isPlayer && tPlayer) onPlayerLethal(game, tPlayer, src, opts);
    else if (target.type === 'summon' || target.data?.team) realm.remove(target);
  }
  return dealt;
}

export function dealHeal(game, target, amount, source = null, opts = {}) {
  if (!target || target.removed || !(amount > 0) || target.hp <= 0) return 0;
  if (target.type === 'player' && (target.state === STATE.DEAD || isDowned(target))) return 0;
  // WP14 (BUILD_REVIEW P2-11): Riptide Mark's Signature blocks heals on the marked target until noHealUntil.
  if (target.data?.noHealUntil && game.now < target.data.noHealUntil) return 0;
  const healed = Math.max(0, Math.min(amount, target.maxHp - target.hp));
  if (healed <= 0) return 0;
  target.hp += healed;
  if (!opts.quiet && healed >= 1) {
    const realm = game.realms.get(target.realm);
    if (realm) game.fx(realm, 'heal', target.x, target.y - 0.5, { h: Math.round(healed), i: target.id });
  }
  return healed;
}

// Surge is WP6b's resource; drain it defensively through whatever shape it publishes.
export function drainSurge(game, player, n) {
  if (game.services.has('drainSurge')) { game.call('drainSurge', player, n); return; }
  const s = player.surge;
  if (s && typeof s === 'object' && Number.isFinite(s.cur)) { s.cur = Math.max(0, s.cur - n); game.sendSelf(player, 'surge', { cur: s.cur, max: s.max }); }
  else if (Number.isFinite(s)) player.surge = Math.max(0, s - n);
}

// ---------------------------------------------------------------- area helpers (player side)

// Hostile targets of a team inside a circle.
export function hostilesInRadius(game, realm, team, x, y, r, out = []) {
  realm.query(x, y, r + 1.5, out, (e) => {
    if (e.hp <= 0 || e.removed) return false;
    const t = teamOf(e);
    if (!t || t === team) return false;
    if (e.type === 'player' && (e.state === STATE.DEAD || isDowned(e))) return false;
    if (e.data?.untargetable) return false;
    const rr = r + (e.radius ?? 0.4);
    return (e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr;
  });
  return out;
}

// Distance from point to segment.
export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

// ---------------------------------------------------------------- the `attack` action

function attack(game, player, d) {
  const e = player.entity;
  if (!e) return { ok: false, err: 'invalid' };
  if (!Number.isInteger(d?.ax) || !Number.isInteger(d?.ay)) return { ok: false, err: 'invalid' };
  if (!canAct(e)) return { ok: false, err: 'busy' };
  if (player.body?.dodgeT > 0) return { ok: false, err: 'busy' };
  const realm = game.realms.get(e.realm);
  if (!realm) return { ok: false, err: 'invalid' };
  const s = game.stats.of(player);
  const w = weaponOf(game, player);
  const rate = Math.max(0.2, w.rate * (1 + (s.swingSpeed ?? 0)));
  const c = ensureCombatState(player);
  if (game.now + CD_TOLERANCE < c.nextAttack) return { ok: false, err: 'cooldown' };
  c.nextAttack = game.now + 1 / rate;
  c.lastAttack = game.now;
  const ax = d.ax / POS_QUANT, ay = d.ay / POS_QUANT;
  let ang = Math.atan2(ay - e.y, ax - e.x);
  if (!Number.isFinite(ang)) ang = 0;
  e.facing = facingFromVector(Math.cos(ang), Math.sin(ang), e.facing);
  e.set('a', 'swing');
  c.animUntil = game.now + SWING_ANIM_S;
  game.bus.emit('player.swing', { player, weapon: w.id, wtype: w.wtype });

  let hits = 0;
  if (w.pattern === 'arc') {
    game.fx(realm, 'swing_arc', e.x + Math.cos(ang) * 0.6, e.y + Math.sin(ang) * 0.6 - 0.3, { a: +ang.toFixed(2), w: w.wtype, i: e.id });
    const reach = w.reach + 0.25;
    const list = hostilesInRadius(game, realm, 'player', e.x, e.y, reach);
    list.sort((a, b) => ((a.x - e.x) ** 2 + (a.y - e.y) ** 2) - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2));
    for (const t of list) {
      const close = (t.x - e.x) ** 2 + (t.y - e.y) ** 2 < (0.5 + t.radius) ** 2;
      if (!close && !inArc(e.x, e.y, ang, w.arc, t.x, t.y)) continue;
      if (hitWithWeapon(game, player, t, w, { melee: true, knock: 0.35 }) > 0) hits++;
      if (hits >= 6) break;
    }
    hits += burstZonesInArc(game, realm, e.x, e.y, ang, w.arc, reach, player);
  } else if (w.pattern === 'projectile') {
    game.fx(realm, 'swing_arc', e.x, e.y - 0.3, { a: +ang.toFixed(2), w: 'bow', i: e.id });
    const roll = rollPlayerDamage(game, player, w.dmg, { wtype: w.wtype });
    spawnProjectile(game, realm, {
      kind: 'arrow', x: e.x + Math.cos(ang) * 0.5, y: e.y + Math.sin(ang) * 0.5 - 0.1, angle: ang, speed: 18, range: w.range,
      dmg: roll.amount, crit: roll.crit, source: e, team: 'player', pierce: w.pierce, element: w.element, knock: 0.25,
      weapon: true, radius: 0.2,
    });
  } else {
    game.fx(realm, 'swing_arc', e.x, e.y - 0.3, { a: +ang.toFixed(2), w: 'staff', i: e.id });
    const roll = rollPlayerDamage(game, player, w.dmg, { wtype: w.wtype });
    const dist = Math.min(w.range, Math.hypot(ax - e.x, ay - e.y) + 0.5);
    spawnProjectile(game, realm, {
      kind: 'orb_' + (w.element || 'none'), x: e.x + Math.cos(ang) * 0.5, y: e.y + Math.sin(ang) * 0.5 - 0.2, angle: ang, speed: 9,
      range: Math.max(2, dist), dmg: roll.amount, crit: roll.crit, source: e, team: 'player', element: w.element, splash: w.splash,
      knock: w.element === 'tide' ? 1.2 : 0.2, weapon: true, radius: 0.3, burstAtEnd: true,
    });
  }
  return { ok: true, d: { hits } };
}

// One weapon hit on one target (melee or projectile impact). Element side effects included.
export function hitWithWeapon(game, player, target, w, { melee = false, knock = 0, roll = null, mult = 1 } = {}) {
  const r = roll ?? rollPlayerDamage(game, player, w.dmg, { wtype: w.wtype });
  const e = player.entity;
  const element = w.element ?? 'none';
  const dealt = dealDamage(game, target, r.amount * mult, {
    source: e, crit: r.crit, element, melee, knock: knock + (element === 'tide' ? 1.0 : 0), kx: e.x, ky: e.y,
  });
  if (dealt > 0) applyElementOnHit(game, player, target, element, dealt);
  return dealt;
}

export function applyElementOnHit(game, player, target, element, dealt) {
  if (!target || target.removed) return;
  const realm = game.realms.get(target.realm);
  switch (element) {
    case 'ember': {
      const s = game.stats.of(player);
      if (target.hp > 0) applyStatusImpl(game, target, 'burn', { duration: 3, power: (dealt * 0.2) * (1 + (s.burnDmg ?? 0)), source: player.entity });
      break;
    }
    case 'frost':
      if (target.hp > 0) applyStatusImpl(game, target, 'chill', { duration: 2, power: 0.1, stacks: 1, source: player.entity });
      break;
    case 'storm': {
      const others = hostilesInRadius(game, realm, 'player', target.x, target.y, 3).filter((o) => o !== target);
      if (others.length) {
        others.sort((a, b) => ((a.x - target.x) ** 2 + (a.y - target.y) ** 2) - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2));
        const o = others[0];
        game.fx(realm, 'spark_chain', target.x, target.y - 0.3, { x2: +o.x.toFixed(2), y2: +(o.y - 0.3).toFixed(2) });
        dealDamage(game, o, dealt * 0.5, { source: player.entity, element: 'storm', noProcs: true });
      }
      break;
    }
    default:
  }
}

// ---------------------------------------------------------------- per-tick upkeep

function tickPlayers(game, dt) {
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e) continue;
    const c = ensureCombatState(p);
    // swing animation reset
    if (c.animUntil && game.now >= c.animUntil) {
      c.animUntil = 0;
      if (e.pub.a === 'swing') e.set('a', e.state === STATE.MOVE ? 'run' : 'idle');
    }
    // dodge detection (movement consumed a charge this tick)
    const ch = p.body?.charges ?? 0;
    if (c.lastCharges != null && ch < c.lastCharges && p.body.dodgeT > 0) {
      game.bus.emit('player.dodge', { player });
      const realm = game.realms.get(e.realm);
      if (realm) game.fx(realm, 'dodge_trail', e.x, e.y, { i: e.id, a: +Math.atan2(p.body.ddy, p.body.ddx).toFixed(2) });
    }
    c.lastCharges = ch;
    if (e.hp <= 0 || e.state === STATE.DEAD || isDowned(e)) continue;
    // HP regen: x4 out of combat (5 s without damage)
    const s = game.stats.of(p);
    if (e.hp < e.maxHp) {
      const ooc = game.now - (c.lastHurt ?? -99) >= OUT_OF_COMBAT_S;
      const regen = (s.hpRegen ?? 0.5) * (ooc ? 4 : 1);
      e.hp = Math.min(e.maxHp, e.hp + regen * dt);
    }
    // lava tiles (30 dmg/s) unless lava_immune
    const realm = game.realms.get(e.realm);
    if (realm && realm.groundAt(Math.floor(e.x), Math.floor(e.y)) === T.LAVA && !(p.body?.dodgeT > 0)) {
      if (!game.stats.hasFlag(p, 'lava_immune')) {
        c.lavaAcc = (c.lavaAcc ?? 0) + dt;
        if (c.lavaAcc >= 0.5) {
          c.lavaAcc -= 0.5;
          dealDamage(game, e, LAVA_DPS * 0.5, { raw: true, element: 'ember', tag: 'lava' });
          game.fx(realm, 'burn', e.x, e.y);
        }
      }
    } else c.lavaAcc = 0;
  }
}

export function ensureCombatState(player) {
  player.combat ||= { nextAttack: 0, lastAttack: -99, lastHurt: -99, animUntil: 0, lastCharges: null, lavaAcc: 0 };
  return player.combat;
}

export default {
  name: 'combat',
  init(game) {
    game.combatRng = game.rng.fork('combat');
    game.combatKnocked = new Set();
    setDamageFn(dealDamage);
    game.services.register('damage', (target, amount, opts = {}) => dealDamage(game, target, amount, opts || {}));
    game.services.register('heal', (target, amount, source) => dealHeal(game, target, amount, source));
    // Extra (non-spec) helpers other packages may call through game.call:
    game.services.register('weaponOf', (player) => weaponOf(game, player));
    game.services.register('rollPlayerDamage', (player, base, opts) => rollPlayerDamage(game, player, base, opts || {}));
    game.services.register('knockback', (e, fromX, fromY, dist) => knockback(game, e, fromX, fromY, dist));
    game.services.register('hostilesInRadius', (realm, team, x, y, r) => {
      const R = typeof realm === 'string' ? game.realms.get(realm) : realm;
      return R ? hostilesInRadius(game, R, team, x, y, r) : [];
    });
  },
  tick(game, dt) {
    for (const e of game.combatKnocked) if (!stepKnock(game, e, dt)) game.combatKnocked.delete(e);
    tickPlayers(game, dt);
  },
  handlers: { attack },
  onJoin(game, player) { ensureCombatState(player); },
};

export { STATUSES };
