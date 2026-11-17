// WP5 projectiles and ground zones.
//  - Projectiles: entities of type 'proj' (pub `a` angle, `own` owner id; lobbed shots also publish `tx, ty, ft`).
//  - Zones: entities of type 'zone' (pub `r` radius, `t` remaining x10, plus shape keys) for lingering hazards
//    (fire trails, ink pools, spore clouds, floods, silence) and multi-marker telegraphs (kind 'telegraph').
// Extra services: spawnProjectile(realm, opts), spawnZone(realm, opts), telegraph(realm, spec, windup, onFire).

import { createEntity } from '../entities.js';
import { STATE } from '../../../shared/protocol.js';
import { T, FLAG } from '../../../shared/grid.js';
import { dealDamage, teamOf, hostilesInRadius, distToSeg, inArc, applyElementOnHit, creditPlayer, alive } from './combat.js';
import { applyStatusImpl } from './status.js';
import { isDowned } from './death.js';

const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- projectiles

export function spawnProjectile(game, realm, o) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const ang = o.angle ?? 0;
  const lob = o.lob ? { sx: o.x, sy: o.y, tx: o.lob.tx, ty: o.lob.ty, time: Math.max(0.3, o.lob.time ?? 0.9), t: 0 } : null;
  const src = o.source ?? null;
  const e = createEntity(game, {
    type: 'proj', kind: o.kind ?? 'arrow', x: o.x, y: o.y, radius: o.radius ?? 0.25,
    data: {
      vx: Math.cos(ang) * (o.speed ?? 10), vy: Math.sin(ang) * (o.speed ?? 10), speed: o.speed ?? 10,
      left: o.range ?? 8, life: o.life ?? 6, dmg: o.dmg ?? 0, crit: !!o.crit, srcId: src?.id ?? 0,
      ownerId: src?.type === 'player' ? src.id : (src?.data?.ownerId ?? 0),
      team: o.team ?? teamOf(src) ?? 'enemy', pierce: o.pierce ?? 0, splash: o.splash ?? 0, element: o.element ?? 'none',
      homing: o.homing ?? 0, targetId: o.target?.id ?? 0, knock: o.knock ?? 0, status: o.status ?? null,
      hit: [], lob, zone: o.zone ?? null, weapon: !!o.weapon, ability: !!o.ability, burstAtEnd: !!o.burstAtEnd,
      onHit: o.onHit ?? null, onEnd: o.onEnd ?? null, noProcs: !!o.noProcs, mult: o.mult ?? 1, ghost: !!o.ghost,
      wallPass: !!o.wallPass, aoeR: o.aoeR ?? 1.2,
    },
    pub: { a: r2(ang), own: src?.id ?? 0, ...(lob ? { tx: r2(lob.tx), ty: r2(lob.ty), ft: r2(lob.time) } : {}) },
  });
  realm.add(e);
  game.projActive.add(e);
  return e;
}

function blocked(realm, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!realm.inBounds(tx, ty)) return true;
  const g = realm.groundAt(tx, ty);
  if (g === T.DUNGEON_WALL || g === T.EMPTY) return true;
  return (realm.flagsAt(tx, ty) & FLAG.SOLID) !== 0;
}

function impact(game, realm, p, x, y, target) {
  const d = p.data;
  const src = realm.entities.get(d.srcId) ?? null;
  const owner = d.ownerId ? game.players.get(d.ownerId) : null;
  const hitOne = (t, mult = 1) => {
    if (!alive(t)) return 0;
    const dealt = dealDamage(game, t, d.dmg * d.mult * mult, {
      source: src ?? (owner?.entity ?? null), crit: d.crit, element: d.element, knock: d.knock, kx: x - Math.cos(p.pub.a) * 0.5,
      ky: y - Math.sin(p.pub.a) * 0.5, noProcs: d.noProcs, ability: d.ability,
    });
    if (dealt > 0) {
      if (d.status && t.hp > 0) applyStatusImpl(game, t, d.status.id, { duration: d.status.dur ?? 2, power: d.status.power, stacks: d.status.stacks, source: src, freezeAt: d.status.freezeAt });
      if (owner && d.weapon) applyElementOnHit(game, owner, t, d.element, dealt);
      d.onHit?.(game, p, t, dealt);
    }
    return dealt;
  };
  if (target) hitOne(target);
  if (d.splash > 0) {
    for (const t of hostilesInRadius(game, realm, d.team, x, y, d.splash)) if (t !== target) hitOne(t, 0.6);
  }
  if (d.zone) spawnZone(game, realm, { ...d.zone, x, y, team: d.team, source: src });
}

function endProjectile(game, realm, p, x, y, why) {
  const d = p.data;
  if (d.lob) {
    // lobbed shots: area impact where they land
    const src = realm.entities.get(d.srcId) ?? null;
    for (const t of hostilesInRadius(game, realm, d.team, x, y, d.aoeR)) {
      dealDamage(game, t, d.dmg * d.mult, { source: src, element: d.element, knock: d.knock, kx: x, ky: y, noProcs: d.noProcs });
      if (d.status && t.hp > 0) applyStatusImpl(game, t, d.status.id, { duration: d.status.dur ?? 2, power: d.status.power, source: src });
    }
    if (d.zone) spawnZone(game, realm, { ...d.zone, x, y, team: d.team, source: src });
    game.fx(realm, impactFx(p.kind, true), x, y, { r: d.aoeR, k: p.kind });
  } else if (why !== 'hit') {
    if (d.burstAtEnd && (d.splash > 0 || d.zone)) impact(game, realm, p, x, y, null);
    game.fx(realm, impactFx(p.kind, false), x, y, { k: p.kind });
  }
  d.onEnd?.(game, p, x, y);
  realm.remove(p);
}

function impactFx(kind, lob) {
  if (kind.startsWith('orb_')) {
    const el = kind.slice(4);
    return el === 'ember' ? 'burn_explode' : el === 'frost' ? 'freeze_shatter' : el === 'storm' ? 'spark_chain' : el === 'hollow' ? 'hit_null' : 'tide_wave';
  }
  switch (kind) {
    case 'lava_blob': return 'burn_explode';
    case 'ink': return 'hit_null';
    case 'icicle': case 'ice_spike': return 'hit_ice';
    case 'seed': case 'pod': case 'spore_pod': return 'hit_plant';
    case 'bog_orb': return 'poison_bubble';
    case 'bolt': return 'hit_armor';
    default: return lob ? 'hit_stone' : 'hit_wood';
  }
}

function tickProjectile(game, p, dt) {
  const realm = game.realms.get(p.realm);
  if (!realm || p.removed) return false;
  const d = p.data;
  d.life -= dt;
  if (d.lob) {
    const L = d.lob;
    L.t += dt;
    const k = Math.min(1, L.t / L.time);
    realm.move(p, L.sx + (L.tx - L.sx) * k, L.sy + (L.ty - L.sy) * k);
    if (k >= 1) { endProjectile(game, realm, p, L.tx, L.ty, 'land'); return false; }
    return true;
  }
  if (d.homing > 0 && d.targetId) {
    const t = realm.entities.get(d.targetId);
    if (t && alive(t)) {
      const want = Math.atan2(t.y - p.y, t.x - p.x);
      let cur = Math.atan2(d.vy, d.vx);
      let diff = want - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = d.homing * dt * 3;
      cur += Math.max(-turn, Math.min(turn, diff));
      d.vx = Math.cos(cur) * d.speed; d.vy = Math.sin(cur) * d.speed;
      p.set('a', r2(cur));
    }
  }
  const steps = Math.max(1, Math.ceil((d.speed * dt) / 0.3));
  const sx = (d.vx * dt) / steps, sy = (d.vy * dt) / steps;
  for (let i = 0; i < steps; i++) {
    const nx = p.x + sx, ny = p.y + sy;
    if (!d.wallPass && blocked(realm, nx, ny)) { endProjectile(game, realm, p, p.x, p.y, 'wall'); return false; }
    realm.move(p, nx, ny);
    d.left -= Math.hypot(sx, sy);
    if (!d.ghost) {
      const cands = hostilesInRadius(game, realm, d.team, p.x, p.y, p.radius);
      for (const t of cands) {
        if (d.hit.includes(t.id)) continue;
        d.hit.push(t.id);
        impact(game, realm, p, p.x, p.y, t);
        if (d.pierce > 0) { d.pierce--; continue; }
        endProjectile(game, realm, p, p.x, p.y, 'hit');
        return false;
      }
      if (d.team === 'player' && burstZonesAt(game, realm, p.x, p.y, p.radius + 0.3, creditPlayer(game, p))) {
        endProjectile(game, realm, p, p.x, p.y, 'hit');
        return false;
      }
    }
    if (d.left <= 0 || d.life <= 0) { endProjectile(game, realm, p, p.x, p.y, 'range'); return false; }
  }
  return true;
}

// ---------------------------------------------------------------- zones

// opts: { kind, x, y, r, dur, dps, tick, team, status:{id, dur, power, stacks}, source, shape:'circle'|'rect'|'ring',
//         w, h, r2, delay, burstable, hp, onTick, onExpire, onBurst, pub, slowPct, followId, hitOnce }
export function spawnZone(game, realm, o) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const pub = { r: r2(o.r ?? 1.5), t: Math.round((o.dur ?? 3) * 10), ...(o.pub || {}) };
  if (o.shape && o.shape !== 'circle') pub.sh = o.shape;
  if (o.w != null) pub.w = r2(o.w);
  if (o.h != null) pub.h = r2(o.h);
  if (o.r2 != null) pub.r2 = r2(o.r2);
  if (o.delay) pub.dl = Math.round(o.delay * 10);
  const e = createEntity(game, {
    type: 'zone', kind: o.kind ?? 'fire', x: o.x, y: o.y, hp: o.hp ?? 1, radius: o.r ?? 1.5,
    data: {
      until: game.now + (o.dur ?? 3), armAt: game.now + (o.delay ?? 0), dps: o.dps ?? 0, tickEvery: o.tick ?? 0.5,
      acc: 0, team: o.team ?? 'enemy', status: o.status ?? null, srcId: o.source?.id ?? 0, shape: o.shape ?? 'circle',
      w: o.w ?? 0, h: o.h ?? 0, r2: o.r2 ?? 0, burstable: !!o.burstable, onTick: o.onTick ?? null, onExpire: o.onExpire ?? null,
      onBurst: o.onBurst ?? null, followId: o.followId ?? 0, lastPub: game.now, hitOnce: !!o.hitOnce, hitIds: [],
      affectsAllies: !!o.affectsAllies, raw: !!o.raw, zoneTag: o.tag ?? null, extra: o.data ?? null, noDamagePlayers: !!o.noDamagePlayers,
    },
    pub,
  });
  e.data.team = o.team ?? 'enemy';
  realm.add(e);
  game.zoneActive.add(e);
  return e;
}

export function inZone(z, x, y, extra = 0) {
  const d = z.data;
  if (d.shape === 'rect') return Math.abs(x - z.x) <= d.w / 2 + extra && Math.abs(y - z.y) <= d.h / 2 + extra;
  const dist = Math.hypot(x - z.x, y - z.y);
  if (d.shape === 'ring') return dist <= z.radius + extra && dist >= d.r2 - extra;
  return dist <= z.radius + extra;
}

// Entities inside zone z that it affects (hostile to its team).
export function zoneVictims(game, realm, z) {
  const out = [];
  const R = z.data.shape === 'rect' ? Math.hypot(z.data.w, z.data.h) / 2 : z.radius;
  realm.query(z.x, z.y, R + 1, out, (e) => {
    if (e.removed || e.hp <= 0) return false;
    const t = teamOf(e);
    if (!t) return false;
    if (!z.data.affectsAllies && t === z.data.team) return false;
    if (e.type === 'player' && (e.state === STATE.DEAD || isDowned(e))) return false;
    if (e.type === 'player' && z.data.noDamagePlayers) return false;
    return inZone(z, e.x, e.y, (e.radius ?? 0.3) * 0.5);
  });
  return out;
}

function tickZone(game, z, dt) {
  const realm = game.realms.get(z.realm);
  if (!realm || z.removed) return false;
  const d = z.data;
  if (d.followId) {
    const f = realm.entities.get(d.followId);
    if (f && !f.removed) realm.move(z, f.x, f.y);
  }
  if (game.now >= d.until) {
    d.onExpire?.(game, z, realm);
    if (!z.removed) realm.remove(z);
    return false;
  }
  if (game.now - d.lastPub >= 1) { d.lastPub = game.now; z.set('t', Math.round((d.until - game.now) * 10)); }
  if (game.now < d.armAt) return true;
  d.acc += dt;
  if (d.acc >= d.tickEvery) {
    d.acc -= d.tickEvery;
    const src = d.srcId ? realm.entities.get(d.srcId) ?? null : null;
    for (const v of zoneVictims(game, realm, z)) {
      if (d.hitOnce) { if (d.hitIds.includes(v.id)) continue; d.hitIds.push(v.id); }
      if (d.dps > 0) dealDamage(game, v, d.dps * d.tickEvery, { source: src, raw: !!d.raw, noProcs: true, quiet: false, unavoidable: false, tag: 'zone:' + z.kind });
      if (d.status && v.hp > 0) applyStatusImpl(game, v, d.status.id, { duration: d.status.dur ?? 1, power: d.status.power, stacks: d.status.stacks, source: src, max: d.status.max });
    }
    d.onTick?.(game, z, realm);
  }
  return !z.removed;
}

// Burstable zones (spore clouds/pods): weapon swings and shots pop them.
export function burstZonesInArc(game, realm, x, y, ang, arcDeg, reach, player) {
  let n = 0;
  for (const z of realm.query(x, y, reach + 2, [], (e) => e.type === 'zone' && e.data?.burstable)) {
    const dist = Math.hypot(z.x - x, z.y - y) - Math.min(z.radius, 1);
    if (dist > reach) continue;
    if (!inArc(x, y, ang, arcDeg + 30, z.x, z.y) && dist > 0.8) continue;
    burstZone(game, realm, z, player);
    n++;
  }
  return n;
}

export function burstZonesAt(game, realm, x, y, r, player) {
  let n = 0;
  for (const z of realm.query(x, y, r + 2, [], (e) => e.type === 'zone' && e.data?.burstable)) {
    if (Math.hypot(z.x - x, z.y - y) > r + Math.min(z.radius, 1)) continue;
    burstZone(game, realm, z, player);
    n++;
  }
  return n;
}

export function burstZone(game, realm, z, player) {
  if (z.removed) return;
  z.data.onBurst?.(game, z, realm, player);
  game.fx(realm, 'keeper_sporeking', z.x, z.y, { burst: 1, r: z.radius });
  realm.remove(z);
  game.zoneActive.delete(z);
}

// ---------------------------------------------------------------- telegraph zones (delayed area attacks)

// spec: { shape: 'circle'|'line'|'cone'|'ring'|'rect', x, y, r, len, w, a, r2, arc, h }
// After `windup` seconds `onFire(game, realm, spec)` runs (usually an area hit). Returns the zone entity.
export function telegraph(game, realm, spec, windup, onFire, { source = null, color = null } = {}) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const pub = { sh: spec.shape ?? 'circle' };
  if (spec.len != null) pub.l = r2(spec.len);
  if (spec.w != null) pub.w = r2(spec.w);
  if (spec.a != null) pub.a = r2(spec.a);
  if (spec.r2 != null) pub.r2 = r2(spec.r2);
  if (spec.arc != null) pub.arc = Math.round(spec.arc);
  if (spec.h != null) pub.h = r2(spec.h);
  if (spec.safe) pub.sf = 1;
  if (color) pub.c = color;
  pub.wd = Math.round(windup * 10);
  const z = spawnZone(game, realm, {
    kind: 'telegraph', x: spec.x, y: spec.y, r: spec.r ?? 1, dur: windup, team: 'none', pub,
    onExpire: (g, zone, R) => { try { onFire?.(g, R, spec); } catch (err) { console.error('[tb:projectiles] telegraph onFire threw:', err); } },
    source,
  });
  return z;
}

// Expanding (or closing) ring wave: a zone whose radius moves from `from` to `to` over `dur`; anyone the band
// passes over is hit once (dodge i-frames apply). `gaps`: [{a, arc}] openings that are safe.
export function ringWave(game, realm, o) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const width = o.width ?? 1.2;
  const gaps = o.gaps ?? [];
  const start = game.now;
  const z = spawnZone(game, realm, {
    kind: o.kind ?? 'ringwave', x: o.x, y: o.y, r: o.from ?? 0.5, r2: Math.max(0, (o.from ?? 0.5) - width), shape: 'ring', dur: o.dur ?? 2,
    team: o.team ?? 'enemy', tick: 0.05, source: o.source, pub: { gp: gaps.map((g) => [r2(g.a), Math.round(g.arc)]), c: o.color ?? 0 },
    onTick: (g, zone, R) => {
      const k = Math.min(1, (g.now - start) / (o.dur ?? 2));
      const rad = (o.from ?? 0.5) + ((o.to ?? 10) - (o.from ?? 0.5)) * k;
      zone.radius = rad;
      zone.data.r2 = Math.max(0, rad - width);
      zone.set('r', r2(rad));
      zone.set('r2', r2(zone.data.r2));
      const src = zone.data.srcId ? R.entities.get(zone.data.srcId) ?? null : null;
      for (const t of hostilesInRadius(g, R, zone.data.team, zone.x, zone.y, rad + 0.5)) {
        if (zone.data.hitIds.includes(t.id)) continue;
        const d = Math.hypot(t.x - zone.x, t.y - zone.y);
        if (Math.abs(d - (rad - width / 2)) > width / 2 + (t.radius ?? 0.3) * 0.5) continue;
        if (gaps.some((gp) => inArc(zone.x, zone.y, gp.a, gp.arc, t.x, t.y))) continue;
        zone.data.hitIds.push(t.id);
        dealDamage(g, t, o.dmg ?? 10, { source: src, knock: o.knock ?? 1.2, kx: zone.x, ky: zone.y, element: o.element, noProcs: true });
        if (o.status && t.hp > 0) applyStatusImpl(g, t, o.status.id, { duration: o.status.dur ?? 2, power: o.status.power, source: src });
      }
    },
  });
  return z;
}

// Generic shape hit used by telegraphs, bosses and AI: returns the list of entities hit.
export function shapeHit(game, realm, spec, dmg, opts = {}) {
  const team = opts.team ?? 'enemy';
  const R = spec.shape === 'line' ? (spec.len ?? 4) + 1 : spec.shape === 'rect' ? Math.hypot(spec.w ?? 2, spec.h ?? 2) : (spec.r ?? 1) + 1;
  const cx = spec.shape === 'line' ? spec.x + Math.cos(spec.a ?? 0) * (spec.len ?? 4) / 2 : spec.x;
  const cy = spec.shape === 'line' ? spec.y + Math.sin(spec.a ?? 0) * (spec.len ?? 4) / 2 : spec.y;
  const cands = hostilesInRadius(game, realm, team, cx, cy, R);
  const hit = [];
  for (const t of cands) {
    if (!inShape(spec, t.x, t.y, t.radius ?? 0.3)) continue;
    if (spec.safe) continue;
    const dealt = dealDamage(game, t, dmg, { source: opts.source ?? null, element: opts.element, knock: opts.knock ?? 0, kx: opts.kx ?? spec.x, ky: opts.ky ?? spec.y, unavoidable: !!opts.unavoidable, melee: !!opts.melee, noProcs: true });
    if (dealt > 0 || opts.statusEvenIfDodged) {
      if (opts.status && t.hp > 0 && dealt > 0) applyStatusImpl(game, t, opts.status.id, { duration: opts.status.dur ?? 2, power: opts.status.power, stacks: opts.status.stacks, source: opts.source, freezeAt: opts.status.freezeAt });
      hit.push(t);
    }
  }
  return hit;
}

export function inShape(spec, x, y, pad = 0) {
  switch (spec.shape) {
    case 'line': {
      const a = spec.a ?? 0, len = spec.len ?? 4;
      return distToSeg(x, y, spec.x, spec.y, spec.x + Math.cos(a) * len, spec.y + Math.sin(a) * len) <= (spec.w ?? 1) / 2 + pad;
    }
    case 'cone': {
      const d = Math.hypot(x - spec.x, y - spec.y);
      return d <= (spec.r ?? 2) + pad && (d < 0.4 || inArc(spec.x, spec.y, spec.a ?? 0, spec.arc ?? 90, x, y));
    }
    case 'ring': {
      const d = Math.hypot(x - spec.x, y - spec.y);
      if (d > (spec.r ?? 3) + pad || d < (spec.r2 ?? 0) - pad) return false;
      if (spec.gap) {
        // gap: { a, arc } safe opening
        if (inArc(spec.x, spec.y, spec.gap.a, spec.gap.arc, x, y)) return false;
      }
      return true;
    }
    case 'rect':
      return Math.abs(x - spec.x) <= (spec.w ?? 2) / 2 + pad && Math.abs(y - spec.y) <= (spec.h ?? 2) / 2 + pad;
    default:
      return Math.hypot(x - spec.x, y - spec.y) <= (spec.r ?? 1) + pad;
  }
}

export default {
  name: 'projectiles',
  init(game) {
    game.projActive = new Set();
    game.zoneActive = new Set();
    game.services.register('spawnProjectile', (realm, opts) => spawnProjectile(game, realm, opts || {}));
    game.services.register('spawnZone', (realm, opts) => spawnZone(game, realm, opts || {}));
    game.services.register('telegraph', (realm, spec, windup, onFire, opts) => telegraph(game, realm, spec, windup, onFire, opts || {}));
    game.services.register('ringWave', (realm, opts) => ringWave(game, realm, opts || {}));
    game.services.register('shapeHit', (realm, spec, dmg, opts) => {
      const R = typeof realm === 'string' ? game.realms.get(realm) : realm;
      return R ? shapeHit(game, R, spec, dmg, opts || {}) : [];
    });
  },
  tick(game, dt) {
    for (const p of game.projActive) if (p.removed || !tickProjectile(game, p, dt)) game.projActive.delete(p);
    for (const z of game.zoneActive) if (z.removed || !tickZone(game, z, dt)) game.zoneActive.delete(z);
  },
};
