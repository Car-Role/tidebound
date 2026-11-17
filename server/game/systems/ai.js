// WP5 AI runner. Each enemy's `ai` archetype is a module in server/game/ai/<id>.js (loaded by loader.js into
// game.modules.ai) exporting { id, init?(game, mob, k), tick(game, mob, dt, k), onHit?(...), onDeath?(...) }.
// The runner owns target selection, telegraphed actions ("acts"), movement integration with tile collision,
// separation, leashing, sleeping far from players and Tidebreak raid marching. Archetypes only decide.

import { STATE } from '../../../shared/protocol.js';
import { T, FLAG, isWater } from '../../../shared/grid.js';
import { START_PLOT, PLOT } from '../../../shared/config.js';
const START_X0 = START_PLOT.px * PLOT, START_Y0 = START_PLOT.py * PLOT;
import { dealDamage, livePlayers, teamOf, alive } from './combat.js';
import { spawnProjectile, spawnZone, telegraph, shapeHit, inShape } from './projectiles.js';
import { hasStatus, canAct, moveFactor, applyStatusImpl } from './status.js';
import { spawnMob, enemyDef } from './mobs.js';
import { isDowned } from './death.js';

const SLEEP_DIST = 40;
const RETARGET_S = 0.4;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the kit handed to archetypes

export function makeKit(game) {
  const k = {
    game,
    get rng() { return game.aiRng; },
    realm: (m) => game.realms.get(m.realm),
    dist: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
    ang: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    target: (m) => {
      const id = m.data.ai.target;
      if (!id) return null;
      const t = game.realms.get(m.realm)?.entities.get(id);
      if (!t || t.removed || t.hp <= 0 || t.state === STATE.DEAD || isDowned(t)) { m.data.ai.target = 0; return null; }
      return t;
    },
    dmg: (m, mult = 1) => (m.data.dmg ?? 0) * mult * (m.data.enraged ? 1.5 : 1),
    move: (m, dx, dy, mul = 1) => {
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) { m.data.mv = null; return; }
      m.data.mv = { x: dx / l, y: dy / l, mul };
    },
    toward: (m, x, y, mul = 1) => k.move(m, x - m.x, y - m.y, mul),
    away: (m, x, y, mul = 1) => k.move(m, m.x - x, m.y - y, mul),
    orbit: (m, x, y, radius, dir = 1, mul = 1) => {
      const a = Math.atan2(m.y - y, m.x - x);
      const d = Math.hypot(m.x - x, m.y - y);
      const tx = x + Math.cos(a + 0.6 * dir) * radius, ty = y + Math.sin(a + 0.6 * dir) * radius;
      k.move(m, tx - m.x + (d - radius) * -0.2 * Math.cos(a), ty - m.y + (d - radius) * -0.2 * Math.sin(a), mul);
    },
    stop: (m) => { m.data.mv = null; },
    face: (m, x, y) => {
      const a = Math.atan2(y - m.y, x - m.x);
      m.facing = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    },
    faceAngle: (m, a) => { m.facing = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; },
    ready: (m, key = 'atk') => game.now >= (m.data.ai.cds?.[key] ?? 0),
    cd: (m, key, sec) => { (m.data.ai.cds ||= {})[key] = game.now + sec / (m.data.atkRate ?? 1) / (m.data.enraged ? 1.3 : 1); },
    busy: (m) => !!m.data.ai.act,
    // Telegraphed action: windup (tg published, state WINDUP) -> fire() -> recover (state ACT).
    act: (m, name, o) => {
      if (m.data.ai.act) return false;
      const spec = typeof o.tg === 'function' ? o.tg() : o.tg ?? null;
      const windup = Math.max(0, o.windup ?? 0.5);
      m.data.ai.act = { name, phase: 'windup', t: 0, windup, recover: o.recover ?? 0.35, fire: o.fire, spec, track: o.track ?? null, moveMul: o.moveMul ?? 0, onRecover: o.onRecover ?? null };
      if (o.cd != null) k.cd(m, o.cdKey ?? 'atk', o.cd);
      m.state = STATE.WINDUP;
      k.publishTg(m, spec, windup);
      if (o.sfx !== false) game.fx(m.realm, 'boss_telegraph', m.x, m.y - 0.4, { i: m.id, small: 1 });
      return true;
    },
    publishTg: (m, spec, t) => {
      if (!spec) { if (m.pub.tg) m.set('tg', 0); return; }
      game.tgSeq = (game.tgSeq + 1) & 0xffff;
      const tg = { shape: spec.shape ?? 'circle', x: r2(spec.x ?? m.x), y: r2(spec.y ?? m.y), r: r2(spec.r ?? 1), t: r2(t), n: game.tgSeq };
      if (spec.len != null) tg.len = r2(spec.len);
      if (spec.w != null) tg.w = r2(spec.w);
      if (spec.a != null) tg.a = r2(spec.a);
      if (spec.arc != null) tg.arc = Math.round(spec.arc);
      if (spec.r2 != null) tg.r2 = r2(spec.r2);
      m.set('tg', tg);
    },
    cancelAct: (m) => {
      if (!m.data.ai.act) return;
      m.data.ai.act = null;
      if (m.pub.tg) m.set('tg', 0);
      if (m.state === STATE.WINDUP || m.state === STATE.ACT) m.state = STATE.IDLE;
    },
    // Area hit from a mob (players are the victims). First hit from stealth gets the shrouded bonus.
    hit: (m, spec, mult = 1, o = {}) => {
      const realm = game.realms.get(m.realm);
      if (!realm) return [];
      let dmg = k.dmg(m, mult);
      if (m.data.stealthBonus > 0 && m.pub.iv === 2 && !m.data.ai.stealthUsed) { dmg *= 1 + m.data.stealthBonus; m.data.ai.stealthUsed = true; }
      const hits = shapeHit(game, realm, spec, dmg, { team: 'enemy', source: m, knock: o.knock ?? 0.6, kx: m.x, ky: m.y, element: o.element, status: o.status, melee: o.melee ?? true });
      if (o.fx !== false) game.fx(realm, o.fx ?? 'swing_arc', spec.x, spec.y, { a: r2(spec.a ?? 0), mob: 1, sh: spec.shape });
      return hits;
    },
    touch: (m, t, mult = 1, o = {}) => {
      if (!t || !alive(t)) return 0;
      const key = 'touch:' + t.id;
      if (!k.ready(m, key)) return 0;
      if (k.dist(m, t) > (m.radius + t.radius + (o.reach ?? 0.25))) return 0;
      (m.data.ai.cds ||= {})[key] = game.now + (o.every ?? 0.8);
      const dealt = dealDamage(game, t, k.dmg(m, mult), { source: m, knock: o.knock ?? 0.5, melee: true, element: o.element });
      if (dealt > 0 && o.status) applyStatusImpl(game, t, o.status.id, { duration: o.status.dur ?? 2, power: o.status.power, source: m });
      return dealt;
    },
    shoot: (m, kind, angle, o = {}) => spawnProjectile(game, game.realms.get(m.realm), {
      kind, x: m.x + Math.cos(angle) * (m.radius + 0.2), y: m.y + Math.sin(angle) * (m.radius + 0.2) - 0.2, angle,
      speed: o.speed ?? 7, range: o.range ?? 10, dmg: k.dmg(m, o.mult ?? 1), source: m, team: 'enemy', homing: o.homing ?? 0,
      target: o.target ?? null, status: o.status ?? null, knock: o.knock ?? 0.3, radius: o.radius ?? 0.25, zone: o.zone ?? null, element: o.element,
    }),
    lob: (m, kind, tx, ty, o = {}) => {
      const realm = game.realms.get(m.realm);
      const time = o.time ?? Math.max(0.7, Math.hypot(tx - m.x, ty - m.y) / 7);
      const aoeR = o.r ?? 1.2;
      telegraph(game, realm, { shape: 'circle', x: tx, y: ty, r: aoeR }, time, null);
      return spawnProjectile(game, realm, {
        kind, x: m.x, y: m.y - 0.3, angle: Math.atan2(ty - m.y, tx - m.x), lob: { tx, ty, time }, dmg: k.dmg(m, o.mult ?? 1),
        source: m, team: 'enemy', aoeR, zone: o.zone ?? null, status: o.status ?? null, knock: o.knock ?? 0.4, element: o.element,
      });
    },
    zone: (m, o) => spawnZone(game, game.realms.get(m.realm), { team: 'enemy', source: m, ...o }),
    telegraph: (m, spec, windup, onFire) => telegraph(game, game.realms.get(m.realm), spec, windup, onFire, { source: m }),
    spawn: (m, kind, x, y, o = {}) => spawnMob(game, game.realms.get(m.realm), kind, x, y, {
      instance: m.data.instance, room: m.data.room, natural: false, noLoot: o.noLoot ?? true, scaleN: o.scaleN, ...o,
    }),
    blink: (m, x, y) => {
      const realm = game.realms.get(m.realm);
      if (!realm || !k.walkable(m, x, y)) return false;
      game.fx(realm, 'waystone_warp', m.x, m.y, { out: 1, small: 1 });
      realm.move(m, x, y);
      game.fx(realm, 'waystone_warp', x, y, { in: 1, small: 1 });
      return true;
    },
    walkable: (m, x, y) => tileOk(game.realms.get(m.realm), m, Math.floor(x), Math.floor(y)),
    fx: (m, name, params, x = m.x, y = m.y) => game.fx(m.realm, name, x, y, params),
    setIv: (m, v) => { if ((m.pub.iv ?? 0) !== v) m.set('iv', v); },
    players: (m, r = 12) => livePlayers(game, m.realm, m.x, m.y, r).map((p) => p.entity),
    // A free spot near (x, y) at distance d (tries angles).
    spotNear: (m, x, y, dmin, dmax) => {
      for (let i = 0; i < 16; i++) {
        const a = game.aiRng.float(0, Math.PI * 2), d = game.aiRng.float(dmin, dmax);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (k.walkable(m, px, py)) return { x: px, y: py };
      }
      return null;
    },
    inShape,
    applyStatus: (t, id, o) => applyStatusImpl(game, t, id, o),
    damage: (t, amount, o) => dealDamage(game, t, amount, o),
    hasStatus,
  };
  return k;
}

// ---------------------------------------------------------------- movement

function tileOk(realm, m, tx, ty) {
  if (!realm || !realm.inBounds(tx, ty)) return false;
  const g = realm.groundAt(tx, ty);
  if (g === T.DUNGEON_WALL || g === T.EMPTY) return false;
  // WP14 (BUILD_REVIEW P2-22): wild mobs stay off the start plot (the safe camp); raiders and tutorial mobs may enter.
  if (realm.kind === 'overworld' && !m.data.raid && !m.data.tutorial && tx >= START_X0 && tx < START_X0 + PLOT && ty >= START_Y0 && ty < START_Y0 + PLOT) return false;
  if (m.data.flying) return true;
  if (g === T.DEEP || g === T.SHALLOW) return false;
  if (g === T.TIDAL && !realm.lowTide) return !!m.data.aiParams?.fromWater;
  const solid = (realm.flagsAt(tx, ty) & FLAG.SOLID) !== 0;
  if (solid && !m.data.aiParams?.passStructures) return false;
  return true;
}

function bodyFits(realm, m, x, y) {
  const r = Math.min(0.45, m.radius * 0.85);
  return tileOk(realm, m, Math.floor(x - r), Math.floor(y - r)) && tileOk(realm, m, Math.floor(x + r), Math.floor(y - r))
    && tileOk(realm, m, Math.floor(x - r), Math.floor(y + r)) && tileOk(realm, m, Math.floor(x + r), Math.floor(y + r));
}

function integrate(game, realm, m, dt) {
  const d = m.data;
  if (d.static || d.kb) return;
  let mv = d.mv;
  if (!mv) { if (m.state === STATE.MOVE) m.state = STATE.IDLE; return; }
  let speed = (d.speed ?? 2) * (mv.mul ?? 1) * moveFactor(m) * (d.enraged ? 1.3 : 1) * (d.speedBuff ?? 1);
  if (d.hitstun > 0) speed *= 0.25;
  if (speed <= 0) return;
  // separation from other mobs
  let sx = 0, sy = 0;
  const near = realm.query(m.x, m.y, 1.2, [], (o) => o !== m && (o.type === 'mob') && !o.removed);
  for (const o of near) {
    const dx = m.x - o.x, dy = m.y - o.y;
    const dd = Math.hypot(dx, dy) || 0.01;
    const minD = m.radius + o.radius;
    if (dd < minD) { sx += (dx / dd) * (minD - dd); sy += (dy / dd) * (minD - dd); }
  }
  let vx = mv.x * speed + sx * 3, vy = mv.y * speed + sy * 3;
  const nx = m.x + vx * dt, ny = m.y + vy * dt;
  let x = m.x, y = m.y, blockedX = false, blockedY = false;
  if (!bodyFits(realm, m, m.x, m.y)) {
    // embedded in something solid (spawned on a structure, pushed into a wall): let it walk out
    realm.move(m, nx, ny);
    d.blocked = false;
    return;
  }
  if (bodyFits(realm, m, nx, y)) x = nx; else blockedX = true;
  if (bodyFits(realm, m, x, ny)) y = ny; else blockedY = true;
  // slide around corners: if fully blocked, try a perpendicular nudge
  if (blockedX && blockedY) {
    const px = -mv.y, py = mv.x;
    const side = (m.id & 1) ? 1 : -1;
    const tx = m.x + px * side * speed * dt, ty = m.y + py * side * speed * dt;
    if (bodyFits(realm, m, tx, ty)) { x = tx; y = ty; }
    d.stuckT = (d.stuckT ?? 0) + dt;
  } else d.stuckT = 0;
  if (x !== m.x || y !== m.y) {
    realm.move(m, x, y);
    if (m.state === STATE.IDLE) m.state = STATE.MOVE;
    if (!d.ai.act) m.facing = ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8;
  }
  d.blocked = blockedX || blockedY;
}

// ---------------------------------------------------------------- target selection

function pickTarget(game, m) {
  const ai = m.data.ai;
  // taunt
  const taunt = m.data.status?.taunt;
  if (taunt?.src) {
    const t = game.realms.get(m.realm)?.entities.get(taunt.src);
    if (t && alive(t)) { ai.target = t.id; return; }
  }
  if (ai.noTarget) { ai.target = 0; return; }
  const provoked = ai.provokedAt != null && game.now - ai.provokedAt < 6;
  const aggro = provoked ? Math.max(14, m.data.aggro ?? 9) : (m.data.aggro ?? 9);
  const home = m.data.home;
  const players = livePlayers(game, m.realm, m.x, m.y, aggro + 4);
  let best = null, bestScore = Infinity;
  for (const p of players) {
    const e = p.entity;
    const dist = Math.hypot(e.x - m.x, e.y - m.y);
    if (dist > aggro && !(provoked && ai.provokedBy === e.id)) continue;
    if (home && m.data.leash && Math.hypot(e.x - home.x, e.y - home.y) > m.data.leash + 6) continue;
    const threat = Math.max(0.1, game.stats.of(p).threat ?? 1);
    const score = dist / threat - (ai.target === e.id ? 1.5 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  ai.target = best ? best.id : 0;
}

// ---------------------------------------------------------------- raid marching

function raidStep(game, realm, m, k) {
  const d = m.data;
  const goal = d.raidGoal;
  if (!goal) return;
  if (k.busy(m)) return;
  const dist = Math.hypot(goal.x - m.x, goal.y - m.y);
  // structures in the way (or at the goal): walls take damage, machines are disabled for 60 s
  if (d.blocked || dist < 2.5) {
    const s = realm.query(m.x, m.y, 2.2, [], (e) => e.type === 'structure' && !e.removed && !(e.data?.raidHitAt > game.now - 1.2))[0];
    if (s && k.ready(m, 'raidhit')) {
      k.act(m, 'raid_strike', {
        windup: 0.6, recover: 0.4, cd: 1.6, cdKey: 'raidhit',
        tg: { shape: 'circle', x: s.x, y: s.y, r: 0.8 },
        fire: () => game.call('raidHitStructure', m, s),
      });
      return;
    }
  }
  if (dist > 1.5) k.toward(m, goal.x, goal.y, 1);
  else k.stop(m);
}

// ---------------------------------------------------------------- runner

function tickMob(game, m, dt, k) {
  const realm = game.realms.get(m.realm);
  if (!realm) return;
  const d = m.data;
  const ai = d.ai;
  ai.t = (ai.t ?? 0) + dt;
  if (d.hitstun > 0) d.hitstun -= dt;
  const mod = game.modules?.ai?.get(d.aiId) ?? FALLBACK;
  // sleep far from players (raid marchers keep walking)
  if (!d.raid && (ai.sleepCheck ?? 0) <= game.now) {
    ai.sleepCheck = game.now + 1;
    ai.asleep = livePlayers(game, m.realm, m.x, m.y, SLEEP_DIST).length === 0;
  }
  if (ai.asleep) { d.mv = null; return; }
  if (!canAct(m)) {
    if (ai.act) k.cancelAct(m);
    d.mv = null;
    return;
  }
  if ((ai.retargetAt ?? 0) <= game.now) { ai.retargetAt = game.now + RETARGET_S; pickTarget(game, m); }
  // act progression
  const act = ai.act;
  if (act) {
    act.t += dt;
    if (act.phase === 'windup') {
      if (act.track && act.t < act.windup - 0.25) {
        const spec = act.track();
        if (spec) { act.spec = spec; k.publishTg(m, spec, act.windup - act.t); }
      }
      d.mv = act.moveMul > 0 ? d.mv : null;
      if (act.t >= act.windup) {
        act.phase = 'recover'; act.t = 0;
        if (m.pub.tg) m.set('tg', 0);
        m.state = STATE.ACT;
        try { act.fire?.(act.spec); } catch (err) { console.error(`[tb:ai] ${d.aiId}.${act.name} fire threw:`, err); }
        if (m.removed) return;
      }
    } else if (act.phase === 'recover') {
      if (act.t >= act.recover) {
        ai.act = null;
        act.onRecover?.();
        if (m.state === STATE.ACT) m.state = STATE.IDLE;
      }
    }
  }
  // leash: chase too far from home -> return
  const home = d.home;
  if (home && d.leash && !d.raid && !ai.act) {
    const fromHome = Math.hypot(m.x - home.x, m.y - home.y);
    if (fromHome > d.leash) { ai.target = 0; ai.returning = true; }
    if (ai.returning) {
      if (fromHome < 2) { ai.returning = false; m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25); }
      else { k.toward(m, home.x, home.y, 1.2); integrate(game, realm, m, dt); return; }
    }
  }
  const target = k.target(m);
  if (d.raid && !target && !ai.act) raidStep(game, realm, m, k);
  else {
    try { mod.tick(game, m, dt, k, target); } catch (err) {
      if (!ai.errLogged) { ai.errLogged = true; console.error(`[tb:ai] ${d.aiId} tick threw:`, err); }
    }
  }
  if (m.removed) return;
  if (!target && !d.raid && !ai.act && !mod.selfIdle) wander(game, m, k);
  if (ai.act && ai.act.phase === 'windup' && !ai.act.moveMul) d.mv = null;
  integrate(game, realm, m, dt);
}

function wander(game, m, k) {
  const ai = m.data.ai;
  if (m.data.static) return;
  if ((ai.wanderAt ?? 0) <= game.now) {
    ai.wanderAt = game.now + k.rng.float(2.5, 6);
    const home = m.data.home ?? { x: m.x, y: m.y };
    ai.wanderTo = k.rng.next() < 0.35 ? null : { x: home.x + k.rng.float(-4, 4), y: home.y + k.rng.float(-4, 4) };
  }
  if (ai.wanderTo && Math.hypot(ai.wanderTo.x - m.x, ai.wanderTo.y - m.y) > 0.5) k.toward(m, ai.wanderTo.x, ai.wanderTo.y, 0.45);
  else k.stop(m);
}

// Fallback archetype: walk up and bite.
const FALLBACK = {
  id: 'fallback',
  tick(game, m, dt, k, t) {
    if (!t) return;
    const dist = k.dist(m, t);
    if (k.busy(m)) return;
    if (dist > 1.3 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    const a = k.ang(m, t);
    k.face(m, t.x, t.y);
    k.act(m, 'bite', {
      windup: 0.45, recover: 0.35, cd: 1.4,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 1.6, a, arc: 90 },
      fire: (spec) => k.hit(m, spec, 1, { knock: 0.6 }),
    });
  },
};

export const NOOP = { id: 'none', selfIdle: true, tick() {} };

export default {
  name: 'ai',
  init(game) {
    game.aiRng = game.rng.fork('ai');
    game.tgSeq = 0;
    const k = makeKit(game);
    game.aiKit = k;
    if (game.modules?.ai && !game.modules.ai.has('none')) game.modules.ai.set('none', NOOP);
    game.services.register('aiInit', (m) => {
      const mod = game.modules?.ai?.get(m.data.aiId);
      m.data.ai ||= {};
      try { mod?.init?.(game, m, k); } catch (err) { console.error(`[tb:ai] ${m.data.aiId} init threw:`, err); }
    });
    game.services.register('aiOnHit', (m, dealt, src) => {
      const mod = game.modules?.ai?.get(m.data.aiId);
      m.data.ai.asleep = false;
      try { mod?.onHit?.(game, m, dealt, src, k); } catch (err) { console.error(`[tb:ai] ${m.data.aiId} onHit threw:`, err); }
    });
    game.services.register('aiOnDeath', (m) => {
      const mod = game.modules?.ai?.get(m.data.aiId);
      try { mod?.onDeath?.(game, m, k); } catch (err) { console.error(`[tb:ai] ${m.data.aiId} onDeath threw:`, err); }
    });
    game.bus.on('ability.cast', (ev) => {
      // mimics (Refrain Knight) remember the last ability cast near them
      const e = ev.player?.entity;
      if (!e) return;
      for (const m of game.mobsLive) {
        if (m.removed || m.realm !== e.realm || m.data.aiId !== 'mimic') continue;
        if (Math.hypot(m.x - e.x, m.y - e.y) <= (m.data.aiParams?.copyRange ?? 10)) m.data.ai.copied = { id: ev.ability?.id ?? ev.ability, at: game.now, target: ev.ability?.target ?? null };
      }
    });
  },
  tick(game, dt) {
    const k = game.aiKit;
    for (const m of game.mobsLive) {
      if (m.removed) { game.mobsLive.delete(m); continue; }
      tickMob(game, m, dt, k);
    }
  },
};

export { tileOk, bodyFits, integrate, teamOf, enemyDef, isWater, hasStatus };
