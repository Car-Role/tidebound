// WP6b: ability cast pipeline (DESIGN 10): Surge, cooldowns, charges, targeting, mastery upgrades and Signatures,
// plus the shared runtimes abilities need: delayed actions, zones (type 'zone') and summons (type 'summon').
// Also owns Surge regeneration (`surgeRegen`); HP regeneration is WP5's (combat.js). Ally auras (Greenwarden +1 HP/s,
// Warlord +5% damage) are added to the allies' stat sheets here.
//
// ability.cast { slot, ax, ay }: slot 0..3 = Q/E/R/F of the active class, 4..5 = Z/X (Second Calling, first two
// abilities of the second class). ax/ay = aim position in tiles x POS_QUANT (same as `attack`).
// Ability behaviour lives in server/game/abilities/<class>.js: { id: <class>, abilities: { <id>: { cast(c), init?(game) } } }.
//
// self keys: `surge` { cur, max } (bars.js), `cooldowns` { t: server seconds, list: { <ability>: [readyAt, dur, charges, maxCharges] } }.

import abilityList from '../../../shared/data/abilities.js';
import { ABILITY_LEVELS } from '../../../shared/data/registries.js';
import { POS_QUANT } from '../../../shared/config.js';
import { STATE } from '../../../shared/protocol.js';
import { createEntity } from '../entities.js';
import { ensureWp6, asPlayer } from './progression.js';
import { weaponDamage, hookDamage } from './gear.js';
import { classState, upgraded, signed, slotAbilities } from './classes.js';
import {
  foesNear, nearestFoe, alliesNear, dealDamage, applyStatus, hasStatus, healPlayer, isFoe, hitNodeFor, nodesNear,
  freezeTarget, burnTarget,
} from './procs.js';

export const ABILITIES = new Map(abilityList.map((a) => [a.id, a]));

export function abState(player) {
  return (player.abState ||= { surge: null, cd: {}, charges: {}, mem: {}, sentSurge: -1, sentAt: -1, castN: 0 });
}

const rt = (game) => (game.abil ||= { timers: [], zones: [], summons: [], impls: new Map(), castN: 0 });

// ---------------------------------------------------------------- Surge

export function maxSurge(game, player) { return game.stats.of(player).maxSurge || 100; }

export function surgeOf(game, player) {
  const st = abState(player);
  if (st.surge == null) st.surge = maxSurge(game, player);
  return st.surge;
}

export function addSurge(game, player, amount) {
  if (!player) return 0;
  const st = abState(player);
  const max = maxSurge(game, player);
  const before = surgeOf(game, player);
  st.surge = Math.max(0, Math.min(max, before + amount));
  sendSurge(game, player, true);
  return st.surge - before;
}

function sendSurge(game, player, force = false) {
  const st = abState(player);
  const cur = Math.floor(surgeOf(game, player));
  const max = Math.round(maxSurge(game, player));
  if (!force && cur === st.sentSurge && max === st.sentMax) return;
  if (!force && game.now - st.sentAt < 0.2) return;
  st.sentSurge = cur; st.sentMax = max; st.sentAt = game.now;
  game.sendSelf(player, 'surge', { cur, max });
}

// ---------------------------------------------------------------- shared runtimes

export function later(game, delay, fn) { rt(game).timers.push({ at: game.now + Math.max(0, delay), fn }); }

// Zone entity: type 'zone', kind, pub { r, t (remaining x10), own }. tick(z, foes, allies) runs every `every` seconds.
export function spawnZone(game, player, o) {
  const e0 = player.entity;
  const realm = game.realms.get(o.realm ?? e0.realm);
  if (!realm) return null;
  const e = createEntity(game, {
    type: 'zone', kind: o.kind, x: o.x, y: o.y, radius: o.r, hp: 1,
    data: { owner: player.token, ownerId: player.id }, pub: { r: +o.r.toFixed(2), t: Math.round(o.dur * 10), own: player.id },
  });
  realm.add(e);
  const z = { e, player, until: game.now + o.dur, every: o.every ?? 1, acc: o.instant ? o.every ?? 1 : 0, r: o.r, tick: o.tick, follow: o.follow, onEnd: o.onEnd, lastT: -1 };
  rt(game).zones.push(z);
  return z;
}

// Summon entity: type 'summon', kinds turret_pocket / sproutling / battle_scuttler (TECH_SPEC 6.5).
export function spawnSummon(game, player, o) {
  const pe = player.entity;
  const realm = game.realms.get(pe.realm);
  const s = game.stats.of(player);
  const hpMult = game.stats.hasFlag(player, 'summon_hp') ? 1.3 : 1;
  const maxHp = Math.round((60 + 10 * player.level) * hpMult);
  let x = o.x, y = o.y;
  if (!realm.isWalkable(Math.floor(x), Math.floor(y))) { x = pe.x; y = pe.y; }
  const e = createEntity(game, {
    type: 'summon', kind: o.kind, x, y, hp: maxHp, radius: o.kind === 'turret_pocket' ? 0.4 : 0.35,
    data: { owner: player.token, ownerId: player.id, team: 'player' }, pub: { own: player.id },
  });
  realm.add(e);
  const dur = o.dur === Infinity ? Infinity : o.dur * (1 + (s.summonDuration || 0));
  const sm = {
    e, player, kind: o.kind, until: game.now + dur, dmg: o.dmg ?? 0.4, rate: o.rate ?? 1, acc: 0, tauntAcc: 99,
    flags: o.flags || new Set(), heal: o.heal || 0, healR: o.healR || 3, taunt: !!o.taunt, harvests: !!o.harvests,
    explode: o.explode || 0, procKey: o.procKey || null, ability: o.ability || null, mobile: o.kind !== 'turret_pocket',
  };
  rt(game).summons.push(sm);
  game.fx(realm, 'summon_puff', x, y, { kind: o.kind });
  return e;
}

function summonDamage(game, player, frac) {
  const s = game.stats.of(player);
  let base = weaponDamage(game, player);
  if (!game.stats.hasFlag(player, 'summons_scale_power')) base /= 1 + (s.power || 0);
  return base * frac * (1 + (s.summonPower || 0));
}

// ---------------------------------------------------------------- per-cast context

function lineFoes(game, realmId, x, y, dx, dy, len, width) {
  const out = [];
  for (const f of foesNear(game, realmId, x + dx * len / 2, y + dy * len / 2, len / 2 + width + 1)) {
    const t = (f.x - x) * dx + (f.y - y) * dy, off = Math.abs((f.x - x) * dy - (f.y - y) * dx);
    if (t >= -0.3 && t <= len + 0.3 && off <= width / 2 + (f.radius || 0.4)) out.push(f);
  }
  out.sort((a, b) => ((a.x - x) * dx + (a.y - y) * dy) - ((b.x - x) * dx + (b.y - y) * dy));
  return out;
}

function coneFoes(game, realmId, x, y, ang, arc, r) {
  return foesNear(game, realmId, x, y, r).filter((f) => {
    let d = Math.atan2(f.y - y, f.x - x) - ang;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d) <= arc / 2 || Math.hypot(f.x - x, f.y - y) < 0.8;
  });
}

// Furthest walkable point from (x, y) towards (tx, ty), stepping 0.25 tiles.
function walkTo(realm, x, y, tx, ty) {
  const d = Math.hypot(tx - x, ty - y);
  const n = Math.ceil(d / 0.25);
  let bx = x, by = y;
  for (let i = 1; i <= n; i++) {
    const px = x + ((tx - x) * i) / n, py = y + ((ty - y) * i) / n;
    if (!realm.isWalkable(Math.floor(px), Math.floor(py))) break;
    bx = px; by = py;
  }
  return { x: bx, y: by };
}

export function resolveAbility(game, player, def) {
  const up = upgraded(game, player, def);
  const sig = signed(player, def);
  const params = { ...def.params, ...(up ? def.upgrade?.params : null), ...(sig ? def.signature?.params : null) };
  const flags = new Set([...(def.flags || []), ...(up ? def.upgrade?.flags || [] : []), ...(sig ? def.signature?.flags || [] : [])]);
  return { up, sig, params, flags, eff: up ? 1.25 : 1 };
}

function makeCtx(game, player, def, aimX, aimY, castCtx) {
  const e = player.entity;
  const realm = game.realms.get(e.realm);
  const { up, sig, params, flags, eff } = resolveAbility(game, player, def);
  let ax = aimX, ay = aimY;
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) { const v = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][e.facing & 7]; ax = e.x + v[0]; ay = e.y + v[1]; }
  let dx = ax - e.x, dy = ay - e.y;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  const range = def.range || params.range || 0;
  if (def.target === 'point' && range > 0 && dl > range) { ax = e.x + dx * range; ay = e.y + dy * range; }
  const st = abState(player);
  const mem = (st.mem[def.id] ||= {});
  const castId = ++rt(game).castN;
  const s = game.stats.of(player);
  const c = {
    game, player, e, realm, realmId: e.realm, def, params, flags, eff, up, sig, mem, castId, stats: s,
    mult: castCtx.mult || 1, aim: { x: ax, y: ay }, dir: { x: dx, y: dy }, angle: Math.atan2(dy, dx),
    base: weaponDamage(game, player),
    kills: 0, hits: 0,
    foes: (x, y, r, ex) => foesNear(game, e.realm, x, y, r, ex),
    nearestFoe: (x, y, r, ex) => nearestFoe(game, e.realm, x, y, r, ex),
    allies: (x, y, r) => alliesNear(game, e.realm, x, y, r),
    nodes: (x, y, r) => nodesNear(game, e.realm, x, y, r),
    line: (x, y, ddx, ddy, len, width) => lineFoes(game, e.realm, x, y, ddx, ddy, len, width),
    cone: (x, y, ang, arc, r) => coneFoes(game, e.realm, x, y, ang, arc, r),
    fx: (name, x, y, p) => game.fx(e.realm, name, x, y, p),
    later: (delay, fn) => later(game, delay, () => { if (player.entity && !player.entity.removed) withAbility(game, fn); }),
    status: (t, id, o) => applyStatus(game, t, id, { source: e, ...o }),
    hasStatus: (t, id) => hasStatus(game, t, id),
    freeze: (t, dur) => freezeTarget(game, player, t, dur),
    burn: (t, dps, dur) => burnTarget(game, player, t, dps, dur),
    heal: (p, amt) => healPlayer(game, p, amt, e),
    buff: (p, id, o) => game.call('addBuff', p, id, o),
    surge: (n) => addSurge(game, player, n),
    zone: (o) => spawnZone(game, player, o),
    summon: (o) => spawnSummon(game, player, { ability: def.id, flags, ...o }),
    walkTo: (tx, ty) => walkTo(realm, e.x, e.y, tx, ty),
    teleport(x, y) {
      realm.move(e, x, y);
      player.body.x = x; player.body.y = y; player.body.vx = 0; player.body.vy = 0;
      e.vx = 0; e.vy = 0;
    },
    gather(node, frac) { return hitNodeFor(game, player, node, hookDamage(game, player) * frac * eff); },
    // Ability damage to one foe: base x frac x effect x (1 + abilityPower) x cast multiplier; may crit with Riptide (T10).
    hit(t, frac, o = {}) {
      if (!isFoe(t)) return 0;
      let amt = c.base * frac * eff * c.mult * (1 + (s.abilityPower || 0));
      let crit = !!o.crit;
      if (!crit && game.procs.has(player, 'ability_crit')) crit = game.procs.rng.next() < Math.min(0.75, s.critChance || 0);
      if (crit) amt *= o.critMult ?? (s.critMult || 1.5);
      const dealt = dealDamage(game, player, t, amt, { ability: true, crit, element: o.element ?? 'tide', knock: o.knock });
      c.hits++;
      if (t.hp <= 0 || t.removed) {
        c.kills++;
        if (game.stats.hasFlag(player, 'ability_kill_surge')) addSurge(game, player, 10);
        o.onKill?.(t);
      }
      game.procs.fire('abilityHit', player, { target: t, dmg: dealt, x: o.x ?? c.aim.x, y: o.y ?? c.aim.y, castId, ability: def.id, echo: !!o.echo });
      return dealt;
    },
    hitAll(list, frac, o) { let n = 0; for (const t of list) if (c.hit(t, frac, o) > 0) n++; return n; },
  };
  return c;
}

function withAbility(game, fn) {
  const R = game.procs;
  R.abilityDepth = (R.abilityDepth || 0) + 1;
  try { return fn(); } finally { R.abilityDepth--; }
}

// ---------------------------------------------------------------- cooldowns and charges

function maxCharges(params) { return Math.max(1, params.charges || 1); }

function readyInfo(game, player, def) {
  const st = abState(player);
  const { params } = resolveAbility(game, player, def);
  const max = maxCharges(params);
  const ch = (st.charges[def.id] ||= { n: max, next: 0, dur: 0 });
  if (ch.n > max) ch.n = max;
  while (ch.n < max && ch.next > 0 && game.now >= ch.next) {
    ch.n++;
    ch.next = ch.n < max ? ch.next + ch.dur : 0;
  }
  return { ch, max };
}

export function cooldownOf(game, player, def) {
  const s = game.stats.of(player);
  return def.cd * (1 - Math.min(0.5, s.cdr || 0));
}

function startCooldown(game, player, def) {
  const { ch, max } = readyInfo(game, player, def);
  const dur = cooldownOf(game, player, def);
  ch.n = Math.max(0, ch.n - 1);
  ch.dur = dur;
  if (!ch.next || ch.next < game.now) ch.next = game.now + dur;
  if (max === 1) ch.next = game.now + dur;
}

// Reduce (or reset with Infinity) an ability's remaining cooldown.
export function reduceCooldown(game, player, abilityId, seconds) {
  const def = ABILITIES.get(abilityId);
  if (!def) return;
  const { ch, max } = readyInfo(game, player, def);
  if (ch.n >= max) return;
  if (seconds === Infinity) { ch.n = max; ch.next = 0; }
  else { ch.next -= seconds; readyInfo(game, player, def); }
  sendCooldowns(game, player);
}

export function sendCooldowns(game, player) {
  const list = {};
  for (const id of slotAbilities(game, player).map((x) => x.ability).filter(Boolean)) {
    const def = ABILITIES.get(id);
    const { ch, max } = readyInfo(game, player, def);
    list[id] = [+(ch.next || 0).toFixed(2), +(ch.dur || cooldownOf(game, player, def)).toFixed(2), ch.n, max];
  }
  game.sendSelf(player, 'cooldowns', { t: +game.now.toFixed(2), list });
}

// ---------------------------------------------------------------- cast

export function castAbility(game, player, d) {
  const e = player.entity;
  const slot = d?.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) return { ok: false, err: 'invalid' };
  const entry = slotAbilities(game, player)[slot];
  if (!entry?.ability) return { ok: false, err: 'locked' };
  if (!entry.unlocked) return { ok: false, err: 'locked' };
  const def = ABILITIES.get(entry.ability);
  const impl = rt(game).impls.get(def.id);
  if (!impl?.cast) return { ok: false, err: 'invalid' };
  if (hasStatus(game, e, 'silence') || hasStatus(game, e, 'stun') || hasStatus(game, e, 'freeze')) return { ok: false, err: 'busy' };
  const { ch } = readyInfo(game, player, def);
  if (ch.n < 1) return { ok: false, err: 'cooldown' };
  const s = game.stats.of(player);
  const mem = (abState(player).mem[def.id] ||= {});
  let cost = Math.round(def.surge * (1 + Math.max(-0.5, s.surgeCost || 0)));
  const sigFree = def.id === 'brine_bolt' && signed(player, def) && ((mem.bolts || 0) + 1) % 3 === 0;
  if (sigFree) cost = 0;
  if (surgeOf(game, player) < cost) return { ok: false, err: 'cost' };
  const aimX = Number.isFinite(d.ax) ? d.ax / POS_QUANT : NaN, aimY = Number.isFinite(d.ay) ? d.ay / POS_QUANT : NaN;
  const castCtx = game.procs.fire('cast', player, { ability: def.id, free: false, twice: false, mult: 1 });
  const c = makeCtx(game, player, def, aimX, aimY, castCtx);
  if (sigFree) { c.mult *= 1.5; c.sigBolt = true; }
  const r = withAbility(game, () => impl.cast(c));
  if (r && r.ok === false) return r;
  if (def.id === 'brine_bolt') mem.bolts = (mem.bolts || 0) + 1;
  if (!castCtx.free) addSurge(game, player, -cost);
  startCooldown(game, player, def);
  if (castCtx.twice) {
    later(game, 0.35, () => {
      if (!player.entity || player.entity.removed) return;
      const c2 = makeCtx(game, player, def, c.aim.x, c.aim.y, { mult: castCtx.mult });
      withAbility(game, () => impl.cast(c2));
      game.fx(e.realm, 'ability_cast', e.x, e.y, { echo: 1, ability: def.id });
    });
  }
  e.set('a', 'cast');
  e.set('at', 0);
  later(game, 0.35, () => { if (e.pub.a === 'cast') e.set('a', 'idle'); });
  game.fx(e.realm, 'ability_cast', e.x, e.y, { ability: def.id, cls: def.class });
  player.lastCastAt = game.now;
  game.bus.emit('ability.cast', { player, ability: def.id });
  sendCooldowns(game, player);
  return { ok: true, d: { ability: def.id } };
}

// ---------------------------------------------------------------- tick: timers, zones, summons, regen

function tickZones(game, dt) {
  const R = rt(game);
  R.zones = R.zones.filter((z) => {
    const e = z.e;
    if (e.removed) return false;
    if (game.now >= z.until || !z.player.entity || z.player.entity.removed) {
      if (z.onEnd && z.player.entity) withAbility(game, () => z.onEnd(z));
      game.realms.get(e.realm)?.remove(e);
      return false;
    }
    if (z.follow) {
      const p = z.follow(z, dt);
      if (p) game.realms.get(e.realm)?.move(e, p.x, p.y);
    }
    const t = Math.round((z.until - game.now) * 10);
    if (Math.abs(t - z.lastT) >= 5) { z.lastT = t; e.set('t', t); }
    z.acc += dt;
    if (z.tick && z.acc >= z.every) {
      z.acc -= z.every;
      const foes = foesNear(game, e.realm, e.x, e.y, z.r);
      const allies = alliesNear(game, e.realm, e.x, e.y, z.r);
      withAbility(game, () => z.tick(z, foes, allies));
    }
    return true;
  });
}

function moveToward(game, e, tx, ty, speed, dt, stop) {
  const realm = game.realms.get(e.realm);
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d <= stop) { e.vx = 0; e.vy = 0; return; }
  const step = Math.min(d - stop, speed * dt);
  const nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
  if (!realm.isWalkable(Math.floor(nx), Math.floor(ny))) { e.vx = 0; e.vy = 0; return; }
  e.vx = (dx / d) * speed; e.vy = (dy / d) * speed;
  e.facing = Math.round(((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) & 7;
  realm.move(e, nx, ny);
}

function tickSummons(game, dt) {
  const R = rt(game);
  R.summons = R.summons.filter((sm) => {
    const e = sm.e, p = sm.player, pe = p.entity;
    const gone = e.removed || !pe || pe.removed || game.now >= sm.until || e.realm !== pe.realm;
    if (gone) {
      if (!e.removed) {
        if (sm.explode && pe) withAbility(game, () => {
          game.fx(e.realm, 'burn_explode', e.x, e.y, { r: 2, scuttler: 1 });
          for (const f of foesNear(game, e.realm, e.x, e.y, 2)) dealDamage(game, p, f, summonDamage(game, p, sm.explode), { ability: true });
        });
        game.fx(e.realm, 'summon_puff', e.x, e.y, { out: 1 });
        game.realms.get(e.realm)?.remove(e);
      }
      return false;
    }
    const range = sm.mobile ? 8 : 7;
    const target = nearestFoe(game, e.realm, e.x, e.y, range);
    // taunt nearby foes every 2 s
    if (sm.taunt && (sm.tauntAcc += dt) >= 2) {
      sm.tauntAcc = 0;
      for (const f of foesNear(game, e.realm, e.x, e.y, 5)) applyStatus(game, f, 'taunt', { duration: 2.2, source: e });
    }
    if (sm.heal > 0) {
      sm.healAcc = (sm.healAcc || 0) + dt;
      if (sm.healAcc >= 1) { sm.healAcc = 0; for (const a of alliesNear(game, e.realm, e.x, e.y, sm.healR)) healPlayer(game, a, sm.heal * a.entity.maxHp, e); }
    }
    sm.acc += dt;
    if (target) {
      if (sm.mobile) moveToward(game, e, target.x, target.y, 4.2, dt, 0.9 + (target.radius || 0.4));
      const inReach = !sm.mobile || Math.hypot(target.x - e.x, target.y - e.y) <= 1.3 + (target.radius || 0.4);
      if (inReach && sm.acc >= 1 / sm.rate) {
        sm.acc = 0;
        const amt = summonDamage(game, p, sm.dmg);
        withAbility(game, () => {
          if (sm.kind === 'turret_pocket') {
            game.fx(e.realm, 'pocket_turret', e.x, e.y, { x2: +target.x.toFixed(2), y2: +target.y.toFixed(2) });
            if (sm.flags.has('piercing_bolts')) {
              const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
              for (const f of lineFoes(game, e.realm, e.x, e.y, dx / d, dy / d, 7, 0.8)) dealDamage(game, p, f, amt, { ability: true, source: e });
            } else dealDamage(game, p, target, amt, { ability: true, source: e });
          } else {
            game.fx(e.realm, 'hit_flesh', target.x, target.y, { summon: sm.kind });
            dealDamage(game, p, target, amt, { ability: true, source: e, melee: true });
          }
        });
      }
    } else if (sm.mobile) {
      if (sm.harvests && sm.acc >= 1.5) {
        const plant = nodesNear(game, e.realm, e.x, e.y, 3).find((n) => game.content.nodes.byId[n.kind]?.cls === 'plant');
        if (plant) {
          sm.acc = 0;
          moveToward(game, e, plant.x, plant.y, 3.5, dt, 0.8);
          if (Math.hypot(plant.x - e.x, plant.y - e.y) < 1.4) withAbility(game, () => hitNodeFor(game, p, plant, hookDamage(game, p)));
          return true;
        }
      }
      moveToward(game, e, pe.x + (e.id % 3 - 1) * 1.2, pe.y + 1, 5, dt, 1.6);
    }
    return true;
  });
}

function tickRegen(game, dt) {
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.state === STATE.DEAD || e.state === STATE.DOWN || e.hp <= 0) continue;
    const s = game.stats.of(p);
    // Surge
    const st = abState(p);
    const max = s.maxSurge || 100;
    if (st.surge == null) st.surge = max;
    if (st.surge < max) st.surge = Math.min(max, st.surge + (s.surgeRegen || 0) * dt);
    else if (st.surge > max) st.surge = max;
    sendSurge(game, p);
  }
}

// 1 Hz: ally auras (Greenwarden +1 HP/s within 6; Warlord C12 +5% damage within 10).
function refreshAuras(game) {
  const list = [...game.players.values()].filter((p) => p.entity);
  for (const p of list) {
    let regen = 0;
    const auras = [];
    for (const q of list) {
      if (q.entity.realm !== p.entity.realm) continue;
      const d = Math.hypot(q.entity.x - p.entity.x, q.entity.y - p.entity.y);
      if (game.stats.hasFlag(q, 'ally_regen') && d <= 6) regen += 1;
      if (q !== p) for (const a of game.effects.list(q, 'ally_aura')) if (d <= (a.radius || 10)) auras.push({ stat: a.stat, op: 'add', v: a.v });
    }
    if (regen > 0) auras.push({ stat: 'hpRegen', op: 'add', v: regen });
    const key = JSON.stringify(auras);
    if (key !== p.auraKey) { p.auraKey = key; p.auraMods = auras; game.stats.invalidate(p); }
  }
}

export default {
  name: 'abilities',

  init(game) {
    ensureWp6(game);
    const R = rt(game);
    for (const [, mod] of game.modules?.abilities ?? []) {
      for (const [id, impl] of Object.entries(mod?.abilities || {})) {
        R.impls.set(id, impl);
        try { impl.init?.(game); } catch (err) { console.error(`[tb:abilities] init ${id} threw:`, err); }
      }
    }
    for (const a of abilityList) if (!R.impls.has(a.id)) console.warn(`[tb:abilities] no implementation for ${a.id}`);
    game.stats.addSource('auras', (p) => p.auraMods || []);
    game.services.register('addSurge', (player, n) => addSurge(game, player, n));
    game.services.register('drainSurge', (player, n) => addSurge(game, player, -Math.abs(n || 0)));
    game.bus.on('player.levelup', ({ player }) => {
      addSurge(game, player, 1e9);
      const i = ABILITY_LEVELS.indexOf(player.level);
      const cls = classState(player).id;
      if (i >= 0 && cls) {
        const id = game.content.classes.byId[cls]?.abilities?.[i];
        const def = ABILITIES.get(id);
        if (def) game.toast(player, `New ability: ${def.name} (${'QERF'[i]})`, 'good');
      }
      sendCooldowns(game, player);
    });
  },

  handlers: {
    'ability.cast': castAbility,
  },

  tick(game, dt) {
    const R = rt(game);
    if (R.timers.length) {
      const due = R.timers.filter((t) => t.at <= game.now);
      if (due.length) {
        R.timers = R.timers.filter((t) => t.at > game.now);
        for (const t of due) { try { withAbility(game, t.fn); } catch (err) { console.error('[tb:abilities] timer threw:', err); } }
      }
    }
    tickZones(game, dt);
    tickSummons(game, dt);
    tickRegen(game, dt);
  },

  slowTick(game) {
    refreshAuras(game);
    if (game.tickCount % 40 < 20) game.veinPulse?.();
  },

  onJoin(game, player) {
    surgeOf(game, player);
    sendSurge(game, player, true);
    sendCooldowns(game, player);
  },

  onLeave(game, player) {
    const R = rt(game);
    for (const z of R.zones) if (z.player === player) z.until = 0;
    for (const sm of R.summons) if (sm.player === player) sm.until = 0;
    tickZones(game, 0);
    tickSummons(game, 0);
  },

  saveProfile(game, player) {
    const st = abState(player);
    const cd = {};
    for (const [id, ch] of Object.entries(st.charges)) if (ch.next > game.now) cd[id] = [ch.n, +(ch.next - game.now).toFixed(1), ch.dur];
    return { surge: Math.round(surgeOf(game, player)), cd, mem: { bolts: st.mem.brine_bolt?.bolts || 0 } };
  },

  loadProfile(game, player, data) {
    const st = abState(player);
    if (!data) return;
    if (Number.isFinite(data.surge)) st.surge = data.surge;
    for (const [id, v] of Object.entries(data.cd || {})) {
      if (!ABILITIES.has(id) || !Array.isArray(v)) continue;
      st.charges[id] = { n: v[0] | 0, next: game.now + (Number(v[1]) || 0), dur: Number(v[2]) || 0 };
    }
    if (data.mem?.bolts) st.mem.brine_bolt = { bolts: data.mem.bolts };
  },
};

export { isFoe, hasStatus };
