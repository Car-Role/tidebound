// WP5 status effects (TECH_SPEC 7.1): burn, bleed, chill, slow, freeze, stun, root, mark, blind, silence,
// shield, taunt, haste, invuln, unstoppable, downed. Stored on entity.data.status = { id: {t, p, n, src} };
// the public `st` key is a bitmask in registry order. Players get movement penalties through a stat source
// ('status') so client prediction stays in step with the server.

import { STATUSES, DEBUFFS } from '../../../shared/data/registries.js';

const BIT = Object.fromEntries(STATUSES.map((s, i) => [s, 1 << i]));
const CC = new Set(['stun', 'freeze', 'root']);
const MOVE_STATUSES = new Set(['chill', 'slow', 'freeze', 'stun', 'root', 'haste']);
const BOSS_IMMUNE = new Set(['stun', 'freeze', 'root']);
const UNSTOPPABLE_BLOCKS = new Set(['stun', 'freeze', 'root', 'slow', 'chill', 'taunt']);
const DOT_TICK = 0.5;
export const CHILL_MAX = 5;

export const hasStatus = (e, id) => !!e?.data?.status?.[id];
export const statusPower = (e, id) => e?.data?.status?.[id]?.p ?? 0;
export const statusStacks = (e, id) => e?.data?.status?.[id]?.n ?? 0;

export function canAct(e) {
  const s = e?.data?.status;
  if (!s) return true;
  return !s.stun && !s.freeze && !s.downed;
}
export function canMove(e) {
  const s = e?.data?.status;
  if (!s) return true;
  return !s.stun && !s.freeze && !s.root && !s.downed;
}

// Movement multiplier for non-player entities (players use the stat source).
export function moveFactor(e) {
  const s = e?.data?.status;
  if (!s) return 1;
  if (s.stun || s.freeze || s.root || s.downed) return 0;
  let slow = 0;
  if (s.chill) slow += (s.chill.p || 0.1) * (s.chill.n || 1);
  if (s.slow) slow = Math.max(slow, s.slow.p || 0.3);
  let f = Math.max(0.15, 1 - Math.min(0.85, slow));
  if (s.haste) f *= 1 + (s.haste.p || 0.2);
  return f;
}

function publish(game, e) {
  const s = e.data.status;
  let mask = 0;
  if (s) for (const k in s) mask |= BIT[k] || 0;
  if ((e.pub.st ?? 0) !== mask) e.set('st', mask);
}

function playerOf(game, e) { return e?.type === 'player' ? game.players.get(e.id) ?? null : null; }

function invalidateMove(game, e, id) {
  if (e.type !== 'player' || !MOVE_STATUSES.has(id)) return;
  const p = playerOf(game, e);
  if (p) game.stats.invalidate(p);
}

const IMMUNE_FLAG = { burn: 'burn_immune', chill: 'chill_immune', freeze: 'freeze_immune' };

export function applyStatusImpl(game, target, id, opts = {}) {
  if (!target || target.removed || !BIT[id]) return false;
  if (target.hp <= 0 && id !== 'downed') return false;
  const dur = Number(opts.duration);
  if (!(dur > 0)) return false;
  const st = (target.data.status ||= {});
  if (st.invuln && DEBUFFS.includes(id)) return false;
  if (st.unstoppable && UNSTOPPABLE_BLOCKS.has(id)) return false;
  if (target.type === 'player') {
    const p = playerOf(game, target);
    const flag = IMMUNE_FLAG[id];
    if (p && flag && game.stats.hasFlag(p, flag)) return false;
    if (p && id === 'chill' && game.stats.hasFlag(p, 'freeze_immune') && opts.freezeAt) opts = { ...opts, freezeAt: 0 };
  }
  if ((target.type === 'boss' || target.data.bossPart || target.data.ccImmune) && BOSS_IMMUNE.has(id)) {
    // bosses shrug off hard CC: convert to a short slow
    return applyStatusImpl(game, target, 'slow', { duration: Math.min(2, dur), power: 0.3, source: opts.source });
  }
  const cur = st[id];
  const power = Number.isFinite(opts.power) ? opts.power : defaultPower(id, target);
  const src = opts.source?.id ?? 0;
  if (id === 'chill') {
    const n = Math.min(opts.max ?? CHILL_MAX, (cur?.n ?? 0) + Math.max(1, opts.stacks ?? 1));
    st.chill = { t: Math.max(cur?.t ?? 0, dur), p: Math.max(cur?.p ?? 0, power || 0.1), n, src };
    if (opts.freezeAt && n >= opts.freezeAt) {
      delete st.chill;
      applyStatusImpl(game, target, 'freeze', { duration: opts.freezeDur ?? 1.5, source: opts.source });
    }
  } else if (id === 'shield') {
    const add = Math.max(0, power);
    st.shield = { t: Math.max(cur?.t ?? 0, dur), p: opts.stacks === 0 ? add : (opts.refresh ? Math.max(cur?.p ?? 0, add) : (cur?.p ?? 0) + add), n: 1, src, max: opts.max ?? null };
    if (st.shield.max) st.shield.p = Math.min(st.shield.max, st.shield.p);
    const realm = game.realms.get(target.realm);
    if (realm && !cur && !opts.quiet) game.fx(realm, 'shield_pop', target.x, target.y - 0.4, { in: 1, i: target.id });
  } else if (id === 'burn' || id === 'bleed') {
    // DoTs: refresh duration, keep the strongest dps
    st[id] = { t: Math.max(cur?.t ?? 0, dur), p: Math.max(cur?.p ?? 0, power), n: 1, src, acc: cur?.acc ?? 0 };
  } else {
    st[id] = { t: Math.max(cur?.t ?? 0, dur), p: Math.max(cur?.p ?? 0, power), n: Math.max(1, opts.stacks ?? 1), src };
  }
  if (CC.has(id) && target.type !== 'player') {
    target.data.ai && (target.data.ai.interrupted = true);
  }
  if (id === 'freeze') {
    const realm = game.realms.get(target.realm);
    if (realm) game.fx(realm, 'chill', target.x, target.y - 0.3, { i: target.id, frozen: 1 });
  }
  game.statusActive.add(target);
  publish(game, target);
  invalidateMove(game, target, id);
  if (target.type === 'player' && CC.has(id)) {
    target.data.pin = { x: target.x, y: target.y };
  }
  return true;
}

function defaultPower(id, target) {
  switch (id) {
    case 'chill': return 0.1;
    case 'slow': return 0.3;
    case 'mark': return 0.2;
    case 'haste': return 0.2;
    case 'burn': return Math.max(1, (target.maxHp || 100) * 0.02);
    case 'bleed': return Math.max(1, (target.maxHp || 100) * 0.015);
    default: return 0;
  }
}

export function clearStatusImpl(game, target, which) {
  const st = target?.data?.status;
  if (!st) return 0;
  let n = 0;
  const ids = which === 'debuffs' ? DEBUFFS : [which];
  for (const id of ids) {
    if (st[id]) {
      if (id === 'freeze') {
        const realm = game.realms.get(target.realm);
        if (realm) game.fx(realm, 'freeze_shatter', target.x, target.y - 0.3, { i: target.id });
      }
      delete st[id];
      n++;
      invalidateMove(game, target, id);
    }
  }
  if (n) publish(game, target);
  if (target.type === 'player' && !st.stun && !st.freeze && !st.root) target.data.pin = null;
  return n;
}

// Shield absorbs damage first; returns what is left to apply.
export function consumeShield(game, target, dmg) {
  const sh = target?.data?.status?.shield;
  if (!sh || !(sh.p > 0)) return dmg;
  const absorbed = Math.min(sh.p, dmg);
  sh.p -= absorbed;
  if (sh.p <= 0.5) {
    clearStatusImpl(game, target, 'shield');
    const realm = game.realms.get(target.realm);
    if (realm) game.fx(realm, 'shield_pop', target.x, target.y - 0.4, { out: 1, i: target.id });
  }
  return Math.round(dmg - absorbed);
}

let dealDamageRef = null;
export function setDamageFn(fn) { dealDamageRef = fn; }

function tickEntity(game, e, dt) {
  const st = e.data.status;
  if (!st) return false;
  const realm = game.realms.get(e.realm);
  let changed = false;
  for (const id in st) {
    const s = st[id];
    if (id === 'burn' || id === 'bleed') {
      s.acc = (s.acc ?? 0) + dt;
      if (s.acc >= DOT_TICK - 1e-6) {
        s.acc -= DOT_TICK;
        const src = s.src ? (realm?.entities.get(s.src) ?? null) : null;
        if (dealDamageRef && e.hp > 0) {
          dealDamageRef(game, e, s.p * DOT_TICK, { source: src, raw: true, noProcs: true, quiet: true, element: id === 'burn' ? 'ember' : 'none', tag: id });
          if (realm) game.fx(realm, id === 'burn' ? 'burn' : 'poison_bubble', e.x, e.y - 0.3, { d: Math.round(s.p * DOT_TICK), dot: 1, i: e.id });
        }
        if (e.removed || !e.data.status) return false;
      }
    }
    s.t -= dt;
    if (s.t <= 1e-6) {
      if (id === 'freeze' && realm) game.fx(realm, 'freeze_shatter', e.x, e.y - 0.3, { i: e.id });
      delete st[id];
      changed = true;
      invalidateMove(game, e, id);
    }
  }
  // pinned players (stun/freeze/root) stay where they were
  if (e.type === 'player' && e.data.pin && (st.stun || st.freeze || st.root) && realm) {
    if (Math.abs(e.x - e.data.pin.x) > 0.01 || Math.abs(e.y - e.data.pin.y) > 0.01) realm.move(e, e.data.pin.x, e.data.pin.y);
    e.vx = 0; e.vy = 0;
  } else if (e.type === 'player') e.data.pin = null;
  if (changed) publish(game, e);
  let any = false;
  for (const _ in st) { any = true; break; }
  return any;
}

export default {
  name: 'status',
  init(game) {
    game.statusActive = new Set();
    game.services.register('applyStatus', (target, statusId, opts = {}) => applyStatusImpl(game, target, statusId, opts || {}));
    game.services.register('clearStatus', (target, statusId) => clearStatusImpl(game, target, statusId));
    game.services.register('hasStatus', (target, statusId) => hasStatus(target, statusId));
    // Player movement penalties as stat mods (moveSpeed is a fraction over 5 tiles/s; no lower cap).
    game.stats.addSource('status', (player) => {
      const e = player.entity;
      const s = e?.data?.status;
      if (!s) return [];
      if (s.stun || s.freeze || s.root || s.downed) return [{ stat: 'moveSpeed', op: 'add', v: -0.92 }];
      let slow = 0;
      if (s.chill) slow += (s.chill.p || 0.1) * (s.chill.n || 1);
      if (s.slow) slow = Math.max(slow, s.slow.p || 0.3);
      const out = [];
      if (slow > 0) out.push({ stat: 'moveSpeed', op: 'add', v: -Math.min(0.8, slow) });
      if (s.haste) out.push({ stat: 'moveSpeed', op: 'add', v: s.haste.p || 0.2 });
      return out;
    });
  },
  tick(game, dt) {
    for (const e of game.statusActive) {
      if (e.removed || !tickEntity(game, e, dt)) {
        game.statusActive.delete(e);
        if (!e.removed && e.data.status) { e.data.status = null; publish(game, e); }
      }
    }
  },
  onLeave(game, player) {
    if (player.entity) game.statusActive.delete(player.entity);
  },
};
