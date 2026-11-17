// WP6a: proc runtime (TECH_SPEC 7.1 proc ids). Every id in registries.PROCS has an implementation in IMPL below.
//
// Procs come from cards (incl. set bonuses), skills, gear/trinkets and any other registered source
// (`game.procs.addSource(name, fn(player) -> proc[])`, e.g. WP10 blessings). A proc is { on, id, p, src?, key? }.
// Triggers are wired from the bus (mob.hit, mob.killed, node.hit, node.broken, player.hurt, player.dodge, crop.harvested,
// fish.caught, item.crafted, machine.output, glint.changed), from WP6b (cast, abilityHit) and a 20 Hz `tick`.
// Other packages can fire a trigger themselves with `game.procs.fire(trigger, player, ctx)` (e.g. WP4/WP5 loot rolls fire
// 'drop' with a mutable ctx { item, qty } so Jackpot and Golden Tide apply). Proc damage never re-triggers procs.
//
// Combat helpers used by WP6b abilities are exported from here (foesNear, dealDamage, applyStatus, hasStatus, ...).

import { PROCS, DEBUFFS, STATUSES } from '../../../shared/data/registries.js';
import { TIER_MATS } from '../../../shared/data/items.js';
import { STATE } from '../../../shared/protocol.js';
import { REACH } from '../../../shared/config.js';
import { ensureWp6, asPlayer, timeInfo } from './progression.js';
import { cardState } from './cards.js';
import { weaponDamage, hookDamage, hookStats, weaponStats } from './gear.js';
import { addSurge, spawnZone, spawnSummon, later } from './abilities.js';

const TAU = Math.PI * 2;
const KILN_PAIRS_CACHE = new WeakMap();

// ---------------------------------------------------------------- combat helpers (shared with WP6b)

export const isFoe = (e) => !!e && !e.removed && (e.type === 'mob' || e.type === 'boss') && e.hp > 0;

export function foesNear(game, realmId, x, y, r, exclude = null) {
  const realm = game.realms.get(realmId);
  if (!realm) return [];
  return realm.query(x, y, r, [], (e) => isFoe(e) && e !== exclude && Math.hypot(e.x - x, e.y - y) <= r + (e.radius || 0.4));
}

export function nearestFoe(game, realmId, x, y, r, exclude = null) {
  let best = null, bd = Infinity;
  for (const e of foesNear(game, realmId, x, y, r, exclude)) {
    if (exclude && (Array.isArray(exclude) ? exclude.includes(e) : exclude === e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function alliesNear(game, realmId, x, y, r) {
  const out = [];
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== realmId || e.state === STATE.DEAD) continue;
    if (Math.hypot(e.x - x, e.y - y) <= r) out.push(p);
  }
  return out;
}

// Status query: a WP5 `hasStatus` service if present, then common entity shapes, then the public `st` bitmask
// (bit i = registries.STATUSES[i]), then the applications WP6 made itself.
export function hasStatus(game, e, id) {
  if (!e) return false;
  if (game.services.has('hasStatus')) { try { return !!game.call('hasStatus', e, id); } catch { /* fall through */ } }
  const s = e.data?.statuses ?? e.data?.status ?? e.statuses;
  if (s) {
    const v = s instanceof Map ? s.get(id) : s[id];
    if (v) return typeof v === 'object' && Number.isFinite(v.until) ? v.until > game.now : true;
  }
  const bit = STATUSES.indexOf(id);
  if (bit >= 0 && typeof e.pub?.st === 'number' && (e.pub.st & (1 << bit))) return true;
  const mine = e.wpStatus?.[id];
  return !!mine && mine > game.now;
}

export function applyStatus(game, target, id, opts) {
  if (!target || target.removed) return false;
  const ok = !!game.call('applyStatus', target, id, opts);
  (target.wpStatus ||= {})[id] = Math.max(target.wpStatus[id] || 0, game.now + (opts.duration || 0));
  return ok;
}

// Attacker-side damage from a WP6 source (ability, proc, summon). WP5's `damage` applies the target side (armor,
// elements, marks, shields) and the attacking player's bossDmg / eliteDmg / dmgWorld (found through opts.source).
export function dealDamage(game, player, target, amount, opts = {}) {
  if (!isFoe(target) || !(amount > 0) || !player?.entity) return 0;
  const amt = amount;
  const P = game.procs;
  P.depth++;
  let dealt = 0;
  try {
    dealt = game.call('damage', target, amt, { source: opts.source ?? player.entity, element: opts.element ?? 'none', crit: !!opts.crit, knock: opts.knock, noProcs: true, ability: !!opts.ability, melee: !!opts.melee }) || 0;
  } finally { P.depth--; }
  player.lastHitAt = game.now;
  return dealt;
}

export function healPlayer(game, p, amount, source) {
  const e = p?.entity;
  if (!e || e.state === STATE.DEAD || !(amount > 0)) return 0;
  const h = game.call('heal', e, amount, source) || 0;
  return h;
}

// Freeze (Absolute Zero extends it; bosses are slowed instead).
export function freezeTarget(game, player, target, dur) {
  const ext = game.procs.params(player, 'freeze_extend')[0];
  if (ext) {
    if (target.type === 'boss') return applyStatus(game, target, 'slow', { duration: ext.dur, power: ext.bossSlow, source: player.entity });
    dur = Math.max(dur, ext.dur);
  }
  if (game.realms.get(target.realm)) game.fx(target.realm, 'chill', target.x, target.y, { freeze: 1 });
  return applyStatus(game, target, 'freeze', { duration: dur, source: player.entity });
}

// Burn with Heart of the Caldera stacking and burnDmg.
export function burnTarget(game, player, target, dps, dur) {
  const s = game.stats.of(player);
  const bs = game.procs.params(player, 'burn_stack')[0];
  const b = (target.wpBurn ||= { n: 0, until: 0 });
  if (b.until < game.now) b.n = 0;
  if (bs) { b.n = Math.min(bs.max || 5, b.n + 1); dur = 9999; dps *= 1 + (bs.mult || 1); } else b.n = 1;
  b.until = game.now + dur;
  game.fx(target.realm, 'burn', target.x, target.y);
  return applyStatus(game, target, 'burn', { duration: dur, power: dps * b.n * (1 + (s.burnDmg || 0)), stacks: b.n, source: player.entity });
}

export function chillTarget(game, player, target, slow, dur, max = 5) {
  const s = game.stats.of(player);
  const c = (target.wpChill ||= { n: 0, until: 0 });
  if (c.until < game.now) c.n = 0;
  c.n = Math.min(max, c.n + 1);
  c.until = game.now + dur;
  applyStatus(game, target, 'chill', { duration: dur, power: slow * (1 + (s.slowPotency || 0)), stacks: 1, source: player.entity });
  return c.n;
}

// Lightning or spark that chains with Chain Lightning / the Storm 5-set.
export function chainFrom(game, player, first, amount, fxName = 'spark_chain', exclude = []) {
  const chains = game.procs.params(player, 'chain_extra');
  const n = chains.reduce((s, p) => s + (p.n || 0), 0);
  if (!n) return;
  const mult = Math.max(...chains.map((p) => p.mult || 0.7));
  const hit = [first, ...exclude];
  let from = first;
  for (let i = 0; i < n; i++) {
    const next = nearestFoe(game, first.realm, from.x, from.y, 5, hit);
    if (!next) break;
    hit.push(next);
    game.fx(first.realm, fxName, from.x, from.y, { x2: +next.x.toFixed(2), y2: +next.y.toFixed(2) });
    dealDamage(game, player, next, amount * mult, { element: 'storm' });
    from = next;
  }
}

export function lightning(game, player, target, amount) {
  if (!isFoe(target)) return;
  game.fx(target.realm, 'lightning_strike', target.x, target.y);
  dealDamage(game, player, target, amount, { element: 'storm' });
  chainFrom(game, player, target, amount, 'spark_chain');
}

// Hook hit on behalf of the player by a proc or ability. WP4's hitNode grants the node XP itself when a player breaks a
// node; the WP1 default does not, so XP is granted here only while the default is installed.
export function hitNodeFor(game, player, node, dmg, opts = {}) {
  if (!node || node.removed || node.type !== 'node') return { broken: false, drops: [] };
  const res = game.call('hitNode', node, dmg, { player, ...opts }) || { broken: false, drops: [] };
  if (res.broken && game.services.owner.get('hitNode') === 'default') {
    const def = game.content.nodes.byId[node.kind];
    const tier = node.data?.tier ?? 1;
    const xp = (def?.xp || 0) + (def?.xpPerTier || 0) * tier;
    if (xp > 0) game.call('grantXp', player, xp, 'gather');
  }
  return res;
}

export function nodesNear(game, realmId, x, y, r, maxTier = 99) {
  const realm = game.realms.get(realmId);
  if (!realm) return [];
  return realm.query(x, y, r + 0.5, [], (e) => e.type === 'node' && !e.removed && (e.data?.tier ?? 1) <= maxTier && Math.hypot(e.x - x, e.y - y) <= r + 0.45);
}

// Re-roll a node's drop table at its position (double drops, jackpot, motherlode).
export function spawnNodeDrops(game, player, nodeKind, tier, x, y, realmId, times = 1) {
  const def = game.content.nodes.byId[nodeKind];
  if (!def) return 0;
  const rng = game.procs.rng;
  let n = 0;
  for (let k = 0; k < times; k++) {
    for (const d of def.drops || []) {
      if (d.p != null && !game.procs.luckRoll(player, d.p)) continue;
      const q = rng.int(d.min ?? 1, d.max ?? d.min ?? 1);
      if (q <= 0) continue;
      const a = rng.float(0, TAU), r = rng.float(0.2, 0.7);
      game.call('dropItem', realmId, x + Math.cos(a) * r, y + Math.sin(a) * r, d.item, q, {});
      n += q;
    }
    if (def.rareOfTier && TIER_MATS[tier]) {
      game.call('dropItem', realmId, x, y, TIER_MATS[tier].rare, Math.max(1, Math.round(def.rareOfTier)), {});
      n++;
    }
  }
  return n;
}

const chance = (game, player, p) => game.procs.luckRoll(player, p);

// ---------------------------------------------------------------- implementations
// impl.run(game, P, ctx) runs when the proc's `on` matches the trigger; impl.on_<trigger> runs for every trigger of
// that name while the proc is owned (used for secondary behaviour). Modifier-only procs (chain_extra, freeze_extend,
// burn_stack, ability_crit, luck_twice) are read by the helpers above through game.procs.params(player, id).

export const IMPL = {
  // ---- on hit
  chill: { run(game, { player, p }, ctx) { chillTarget(game, player, ctx.target, p.slow, p.dur, p.max); } },
  spark: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const t = nearestFoe(game, ctx.target.realm, ctx.target.x, ctx.target.y, p.range || 3, ctx.target);
      if (!t) return;
      const amt = p.dmg * weaponDamage(game, player);
      game.fx(t.realm, 'spark_chain', ctx.target.x, ctx.target.y, { x2: +t.x.toFixed(2), y2: +t.y.toFixed(2) });
      dealDamage(game, player, t, amt, { element: 'storm' });
      chainFrom(game, player, t, amt, 'spark_chain', [ctx.target]);
    },
  },
  burn: { run(game, { player, p }, ctx) { if (chance(game, player, p.chance)) burnTarget(game, player, ctx.target, (p.dmg * weaponDamage(game, player)) / p.dur, p.dur); } },
  ricochet: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const t = nearestFoe(game, ctx.target.realm, ctx.target.x, ctx.target.y, 4, ctx.target);
      if (!t) return;
      game.fx(t.realm, 'spark_chain', ctx.target.x, ctx.target.y, { x2: +t.x.toFixed(2), y2: +t.y.toFixed(2), ricochet: 1 });
      dealDamage(game, player, t, p.dmg * ctx.dmg);
    },
  },
  dmg_vs_status: {
    run(game, { p }, ctx) {
      if (p.critOnly && !ctx.crit) return;
      const has = hasStatus(game, ctx.target, p.status) || (p.status === 'slow' && (hasStatus(game, ctx.target, 'chill') || hasStatus(game, ctx.target, 'freeze')));
      if (has) ctx.bonus += p.bonus;
    },
  },
  dmg_vs_hp: {
    run(game, { p }, ctx) {
      const t = ctx.target;
      const frac = t.maxHp > 0 ? (t.hp + ctx.dmg) / t.maxHp : 1;
      if (p.below != null && frac < p.below) ctx.bonus += p.bonus;
      else if (p.above != null && frac >= p.above - 1e-6) ctx.bonus += p.bonus;
    },
  },
  dmg_per_debuff: { run(game, { p }, ctx) { ctx.bonus += p.bonus * DEBUFFS.filter((d) => hasStatus(game, ctx.target, d)).length; } },
  nth_hit_wave: {
    run(game, { player, p, st }, ctx) {
      st.n = (st.n || 0) + 1;
      if (st.n % p.n) return;
      const e = player.entity;
      const a = Math.atan2(ctx.target.y - e.y, ctx.target.x - e.x);
      game.fx(e.realm, 'tide_wave', e.x, e.y, { a: +a.toFixed(3), len: p.len });
      const dx = Math.cos(a), dy = Math.sin(a);
      for (const f of foesNear(game, e.realm, e.x + dx * p.len / 2, e.y + dy * p.len / 2, p.len / 2 + 1)) {
        const t = (f.x - e.x) * dx + (f.y - e.y) * dy, off = Math.abs((f.x - e.x) * dy - (f.y - e.y) * dx);
        if (t >= -0.5 && t <= p.len + 0.5 && off <= 1.2 + (f.radius || 0.4)) dealDamage(game, player, f, p.dmg * weaponDamage(game, player), { knock: 1.5, element: 'tide' });
      }
    },
  },
  chill_freeze: {
    run(game, { player, p }, ctx) {
      const t = ctx.target, c = t.wpChill;
      if (!c || c.until < game.now || c.n < p.stacks) return;
      const icd = (t.wpFreezeIcd ||= {});
      if ((icd[player.id] || 0) > game.now) return;
      icd[player.id] = game.now + p.icd;
      c.n = 0;
      game.fx(t.realm, 'freeze_shatter', t.x, t.y);
      freezeTarget(game, player, t, p.dur);
    },
  },
  projectile_split: {
    run(game, { player, p }, ctx) {
      if (weaponStats(game, player).wtype === 'blade' || ctx.ability) return;
      const t = nearestFoe(game, ctx.target.realm, ctx.target.x, ctx.target.y, 3, ctx.target);
      if (!t) return;
      game.fx(t.realm, 'spark_chain', ctx.target.x, ctx.target.y, { x2: +t.x.toFixed(2), y2: +t.y.toFixed(2), split: 1 });
      dealDamage(game, player, t, p.mult * ctx.dmg);
    },
  },
  chain_extra: { run() { /* modifier: read by chainFrom() for sparks and lightning */ } },
  freeze_extend: { run() { /* modifier: read by freezeTarget() */ } },
  burn_stack: { run() { /* modifier: read by burnTarget() */ } },
  stack_buff: {
    run(game, { player, p, st }) {
      st.stacks = Math.min(p.max || 1, (st.stacks || 0) + 1);
      st.until = game.now + (p.decay || 3);
      st.mods = [{ stat: p.stat, op: 'add', v: p.per * st.stacks }];
      game.procs.statsDirty(player);
    },
  },
  periodic_lightning: {
    // on:'tick' -> every `interval` s (range > 0 strikes a random foe in range; range 0 arms the next hit);
    // on:'hit'  -> every `interval`-th hit strikes the target.
    run(game, { player, p, st }, ctx) {
      if (ctx.trigger === 'hit') {
        st.n = (st.n || 0) + 1;
        if (st.n % p.interval === 0) lightning(game, player, ctx.target, p.dmg * weaponDamage(game, player));
        return;
      }
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < p.interval) return;
      st.t = 0;
      const e = player.entity;
      if (!p.range) { st.armed = true; game.fx(e.realm, 'spark_chain', e.x, e.y - 0.6, { armed: 1 }); return; }
      const list = foesNear(game, e.realm, e.x, e.y, p.range);
      if (list.length) lightning(game, player, list[game.procs.rng.int(0, list.length - 1)], p.dmg * weaponDamage(game, player));
    },
    on_hit(game, { player, p, st, pr }, ctx) {
      if (pr.on !== 'tick' || !st.armed) return;
      st.armed = false;
      lightning(game, player, ctx.target, p.dmg * weaponDamage(game, player));
    },
  },

  // ---- on crit
  crit_lightning: {
    run(game, { player, p, st }, ctx) {
      if ((st.readyAt || 0) > game.now) return;
      st.readyAt = game.now + p.icd;
      lightning(game, player, ctx.target, p.dmg * weaponDamage(game, player));
    },
  },
  blind_on_crit: { run(game, { player, p }, ctx) { applyStatus(game, ctx.target, 'blind', { duration: p.dur, source: player.entity }); } },

  // ---- on kill
  surge_on_kill: { run(game, { player, p }) { addSurge(game, player, p.amount); } },
  heal_on_kill: {
    run(game, { player, p }) {
      const e = player.entity;
      if (healPlayer(game, player, p.pct * e.maxHp) > 0) game.fx(e.realm, 'heal', e.x, e.y);
    },
  },
  heal_orb: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const t = ctx.target;
      game.fx(t.realm, 'heal', t.x, t.y, { orb: 1 });
      for (const a of alliesNear(game, t.realm, t.x, t.y, 6)) healPlayer(game, a, p.pct * a.entity.maxHp);
    },
  },
  death_explode: {
    run(game, { player, p, pr }, ctx) {
      const t = ctx.target;
      const burning = hasStatus(game, t, p.status) || (p.status === 'burn' && (t.wpBurn?.until ?? 0) > game.now);
      if (!burning) return;
      const amt = pr.src === 'set' ? p.dmg * (t.maxHp || 0) : p.dmg * weaponDamage(game, player);
      game.fx(t.realm, 'burn_explode', t.x, t.y, { r: p.radius });
      for (const f of foesNear(game, t.realm, t.x, t.y, p.radius, t)) dealDamage(game, player, f, amt, { element: 'ember' });
      if (pr.src === 'set') for (const e of game.effects.list(player, 'burn_kill_drop')) game.call('dropItem', t.realm, t.x, t.y, e.item, 1, {});
    },
  },
  kill_stack_perm: {
    run(game, { player, p }) {
      const st = cardState(game, player);
      const before = st.apex;
      st.apex = Math.min(p.cap, st.apex + p.per);
      if (st.apex !== before) game.procs.statsDirty(player);
    },
  },

  // ---- on hurt
  freeze_attacker: {
    run(game, { player, p }, ctx) {
      if (!isFoe(ctx.source) || !chance(game, player, p.chance)) return;
      freezeTarget(game, player, ctx.source, p.dur);
    },
  },
  burn_attacker: {
    run(game, { player, p }, ctx) {
      const s = ctx.source, e = player.entity;
      if (!isFoe(s) || Math.hypot(s.x - e.x, s.y - e.y) > 2.5 + (s.radius || 0.4)) return;
      burnTarget(game, player, s, (p.dmg * weaponDamage(game, player)) / p.dur, p.dur);
    },
  },

  // ---- on dodge
  dodge_shield: {
    run(game, { player, p }) {
      const e = player.entity;
      applyStatus(game, e, 'shield', { duration: p.dur, power: p.pct * e.maxHp, source: e });
      game.fx(e.realm, 'shield_pop', e.x, e.y, { frost: 1 });
    },
  },
  dodge_trail: {
    run(game, { p, st }) { st.until = game.now + p.dur; st.points = []; st.acc = 0; st.rec = 0; },
    on_tick(game, { player, p, st }, ctx) {
      if (!st.until || st.until <= game.now) { if (st.points?.length) st.points = []; return; }
      const e = player.entity;
      st.rec = (st.rec || 0) + ctx.dt;
      if (st.rec >= 0.1) {
        st.rec = 0;
        st.points.push([e.x, e.y, game.now + p.dur]);
        game.fx(e.realm, 'dodge_trail', e.x, e.y, { storm: 1 });
      }
      st.points = st.points.filter((q) => q[2] > game.now);
      st.acc += ctx.dt;
      if (st.acc < 0.5) return;
      st.acc = 0;
      const hit = new Set();
      for (const [x, y] of st.points) for (const f of foesNear(game, e.realm, x, y, 0.8)) hit.add(f);
      for (const f of hit) dealDamage(game, player, f, p.dmg * 0.5 * weaponDamage(game, player), { element: 'storm' });
    },
  },

  // ---- on cast / ability hit
  double_cast: {
    run(game, { p, st }, ctx) {
      if ((st.readyAt || 0) > game.now) return;
      st.readyAt = game.now + p.interval;
      ctx.twice = true;
      ctx.free = true;
    },
  },
  opener: {
    run(game, { player, p }, ctx) {
      const last = Math.max(player.lastHitAt ?? -1e9, player.lastHurtAt ?? -1e9);
      if (game.now - last >= p.idle) ctx.mult *= p.mult;
    },
  },
  ability_crit: { run() { /* modifier: abilities roll crits when owned */ } },
  ability_pull: {
    run(game, { p }, ctx) {
      const t = ctx.target;
      if (!isFoe(t) || ctx.x == null || t.type === 'boss') return;
      const dx = ctx.x - t.x, dy = ctx.y - t.y, d = Math.hypot(dx, dy);
      if (d < 0.3) return;
      const k = Math.min(p.dist, d - 0.3) / d;
      const realm = game.realms.get(t.realm);
      const nx = t.x + dx * k, ny = t.y + dy * k;
      if (realm?.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(t, nx, ny);
    },
  },
  puddle: {
    run(game, { player, p, st }, ctx) {
      if (st.cast === ctx.castId || ctx.x == null) return;
      st.cast = ctx.castId;
      spawnZone(game, player, { kind: 'puddle', x: ctx.x, y: ctx.y, r: 1.6, dur: p.dur, every: 0.5,
        tick: (z, foes) => { for (const f of foes) applyStatus(game, f, 'slow', { duration: 0.7, power: p.slow, source: player.entity }); } });
    },
  },
  ability_echo: {
    run(game, { player, p }, ctx) {
      if (ctx.echo) return;
      const t = ctx.target, amt = ctx.dmg * p.mult;
      later(game, p.delay, () => {
        if (!isFoe(t)) return;
        game.fx(t.realm, 'ability_cast', t.x, t.y, { echo: 1 });
        dealDamage(game, player, t, amt, { ability: true });
      });
    },
  },

  // ---- on swing (weapon swing that hit, or hook swing)
  double_swing: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      if (ctx.node && !ctx.node.removed) hitNodeFor(game, player, ctx.node, ctx.dmg);
      else if (isFoe(ctx.target)) dealDamage(game, player, ctx.target, ctx.dmg);
      const e = player.entity;
      game.fx(e.realm, 'swing_arc', e.x, e.y, { twin: 1 });
    },
  },
  wide_swing: {
    run(game, { player, p }, ctx) {
      if (!ctx.node) return;
      const e = player.entity, n = ctx.node;
      const maxTier = hookStats(game, player).maxNode || 1;
      for (const o of nodesNear(game, e.realm, n.x, n.y, p.arc, maxTier)) {
        if (o === n || Math.hypot(o.x - e.x, o.y - e.y) > REACH + 0.8) continue;
        hitNodeFor(game, player, o, ctx.dmg);
      }
    },
  },
  nth_swing_shockwave: {
    run(game, { player, p, st }) {
      st.n = (st.n || 0) + 1;
      if (st.n % p.n) return;
      const e = player.entity;
      game.fx(e.realm, 'swing_arc', e.x, e.y, { r: p.radius, wave: 1 });
      game.fx(e.realm, 'tide_wave', e.x, e.y, { r: p.radius });
      const wd = weaponDamage(game, player), hd = hookDamage(game, player);
      for (const f of foesNear(game, e.realm, e.x, e.y, p.radius)) dealDamage(game, player, f, p.dmg * wd);
      for (const nd of nodesNear(game, e.realm, e.x, e.y, p.radius, hookStats(game, player).maxNode || 1)) hitNodeFor(game, player, nd, p.dmg * hd);
    },
  },

  // ---- on node break
  splinter: {
    run(game, { player, p }, ctx) {
      if (ctx.cls !== p.cls || !chance(game, player, p.chance)) return;
      const near = nodesNear(game, ctx.realm, ctx.x, ctx.y, 2.5).filter((n) => n !== ctx.node && game.content.nodes.byId[n.kind]?.cls === p.cls);
      if (!near.length) return;
      near.sort((a, b) => Math.hypot(a.x - ctx.x, a.y - ctx.y) - Math.hypot(b.x - ctx.x, b.y - ctx.y));
      game.fx(ctx.realm, 'break_wood', near[0].x, near[0].y, { splinter: 1 });
      hitNodeFor(game, player, near[0], (player.lastNodeDmg || hookDamage(game, player)) * p.mult);
    },
  },
  chain_break: {
    run(game, { player, p }, ctx) {
      if (ctx.cls !== p.cls || !chance(game, player, p.chance)) return;
      game.fx(ctx.realm, 'burn_explode', ctx.x, ctx.y, { r: p.radius, ore: 1 });
      const dmg = (player.lastNodeDmg || hookDamage(game, player)) * p.mult;
      for (const n of nodesNear(game, ctx.realm, ctx.x, ctx.y, p.radius)) hitNodeFor(game, player, n, dmg);
    },
  },
  windfall: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const g = Math.round(2 * ctx.tier * (1 + player.level / 10));
      game.call('addGlint', g, 'windfall', player);
      game.fx(ctx.realm, 'glint_burst', ctx.x, ctx.y, { n: g });
    },
  },
  node_bonus_drop: {
    run(game, { player, p }, ctx) {
      if (ctx.cls !== p.cls || !chance(game, player, p.chance)) return;
      const item = p.item === 'rare_of_tier' ? TIER_MATS[Math.max(1, Math.min(6, ctx.tier))]?.rare : p.item;
      if (!item) return;
      game.call('dropItem', ctx.realm, ctx.x, ctx.y, item, 1, {});
      game.fx(ctx.realm, 'gem_sparkle', ctx.x, ctx.y);
    },
  },
  double_drop: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      spawnNodeDrops(game, player, ctx.kind, ctx.tier, ctx.x, ctx.y, ctx.realm, 1);
      game.fx(ctx.realm, 'drop_pop', ctx.x, ctx.y, { double: 1 });
    },
  },
  node_regrow: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance) || ctx.tx == null) return;
      later(game, 0.3, () => {
        const n = game.call('spawnNode', ctx.realm, ctx.kind, ctx.tx, ctx.ty);
        if (n) game.fx(ctx.realm, 'crop_grow', n.x, n.y, { regrow: 1 });
      });
    },
  },
  harvest_streak: {
    run(game, P, ctx) { if (ctx.cls === 'plant') IMPL.harvest_streak.count(game, P); },
    on_harvest(game, P) { IMPL.harvest_streak.count(game, P); },
    count(game, { player, p, st }) {
      st.times = (st.times || []).filter((t) => t > game.now - p.window);
      st.times.push(game.now);
      if (st.times.length < p.n) return;
      st.times = [];
      st.until = game.now + p.dur;
      st.mods = p.mods;
      game.procs.statsDirty(player);
      const e = player.entity;
      game.fx(e.realm, 'leaf_fall', e.x, e.y, { streak: 1 });
    },
  },

  // ---- on harvest / fish / craft / smelt / machine craft
  seed_return: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const crop = game.content.crops?.byId?.[ctx.crop];
      if (crop?.seed) game.call('giveItem', player, crop.seed, 1);
      if (ctx.crop && game.content.items.byId[ctx.crop]) game.call('giveItem', player, ctx.crop, 1);
      const e = player.entity;
      game.fx(e.realm, 'crop_grow', e.x, e.y);
    },
  },
  double_catch: { run(game, { player, p }, ctx) { if (ctx.fish && chance(game, player, p.chance)) { game.call('giveItem', player, ctx.fish, 1); game.fx(player.entity.realm, 'fish_splash', player.entity.x, player.entity.y, { double: 1 }); } } },
  fish_bonus: { run(game, { player, p }) { if (chance(game, player, p.chance)) { game.call('giveItem', player, p.item, 1); game.fx(player.entity.realm, 'gem_sparkle', player.entity.x, player.entity.y); } } },
  bonus_output: {
    run(game, { player, p }, ctx) {
      if (!ctx.item || !chance(game, player, p.chance)) return;
      game.call('giveItem', player, ctx.item, 1);
      game.fx(player.entity.realm, 'craft_done', player.entity.x, player.entity.y, { bonus: 1 });
    },
  },
  refund: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      const r = game.content.recipes.find((x) => x.out?.item === ctx.item && (!ctx.station || x.station === ctx.station || ctx.station === 'hand'));
      const ins = (r?.in || []).filter((i) => i.item);
      if (!ins.length) return;
      const pick = ins[game.procs.rng.int(0, ins.length - 1)];
      game.call('giveItem', player, pick.item, 1);
      game.toast(player, `Thrifty: refunded 1 ${game.content.items.byId[pick.item]?.name ?? pick.item}`, 'info');
    },
  },
  machine_free: {
    run(game, { player, p }, ctx) {
      const m = ctx.machine;
      if (!m || m.removed || !chance(game, player, p.chance)) return;
      const r = game.content.recipes.find((x) => x.out?.item === ctx.item);
      for (const i of r?.in || []) if (i.item) game.call('insertInto', m, i.item, i.qty, {});
      game.fx(m.realm, 'machine_work', m.x, m.y, { free: 1 });
    },
  },
  kiln_boost: {
    run(game, { player, p, st }) {
      st.until = game.now + p.dur;
      st.mods = [{ stat: 'kilnSpeed', op: 'add', v: p.bonus }];
      game.procs.statsDirty(player);
    },
  },

  // ---- on death (lethal hit)
  revive: {
    run(game, { player, p, st }, ctx) {
      const e = player.entity;
      if (ctx.saved || (st.readyAt || 0) > game.now) return;
      st.readyAt = game.now + p.cd;
      ctx.saved = true;
      e.hp = Math.max(1, p.hp * e.maxHp);
      game.fx(e.realm, 'burn_explode', e.x, e.y, { r: 3, phoenix: 1 });
      game.fx(e.realm, 'revive', e.x, e.y);
      const wd = weaponDamage(game, player);
      for (const f of foesNear(game, e.realm, e.x, e.y, 3)) { dealDamage(game, player, f, 2 * wd, { element: 'ember' }); burnTarget(game, player, f, 0.3 * wd, 3); }
      game.toast(player, 'Phoenix Ash: you rise from the flames!', 'good');
    },
  },
  cheat_death: {
    run(game, { player, p, st }, ctx) {
      const e = player.entity;
      if (ctx.saved || (st.readyAt || 0) > game.now) return;
      st.readyAt = game.now + p.cd;
      ctx.saved = true;
      e.hp = 1;
      game.fx(e.realm, 'shield_pop', e.x, e.y, { laststand: 1 });
      game.toast(player, 'Last Stand!', 'warn');
    },
  },

  // ---- on tick (20 Hz, ctx.dt)
  low_hp_buff: {
    run(game, { player, p, st }) {
      const e = player.entity;
      const on = e.maxHp > 0 && e.hp > 0 && e.hp < p.below * e.maxHp;
      if (on === !!st.on) return;
      st.on = on;
      st.mods = on ? p.mods : null;
      st.until = on ? Infinity : 0;
      game.procs.statsDirty(player);
      if (on) game.fx(e.realm, 'burn', e.x, e.y, { bloodtide: 1 });
    },
  },
  burn_spread: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < 1) return;
      st.t = 0;
      const e = player.entity;
      const wd = weaponDamage(game, player);
      for (const f of foesNear(game, e.realm, e.x, e.y, 12)) {
        if (!((f.wpBurn?.until ?? 0) > game.now || hasStatus(game, f, 'burn'))) continue;
        if (!chance(game, player, p.chance)) continue;
        const t = foesNear(game, e.realm, f.x, f.y, p.radius, f).find((o) => !((o.wpBurn?.until ?? 0) > game.now));
        if (t) burnTarget(game, player, t, (0.3 * wd) / 3, 3);
      }
    },
  },
  auto_swing: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < p.interval) return;
      st.t = 0;
      const e = player.entity;
      const maxTier = hookStats(game, player).maxNode || 1;
      let best = null, bd = Infinity;
      for (const n of nodesNear(game, e.realm, e.x, e.y, p.range, maxTier)) { const d = Math.hypot(n.x - e.x, n.y - e.y); if (d < bd) { bd = d; best = n; } }
      if (!best) return;
      game.fx(e.realm, 'swing_arc', best.x, best.y, { living: 1 });
      hitNodeFor(game, player, best, hookDamage(game, player));
    },
  },
  inv_smelt: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < p.interval) return;
      st.t = 0;
      for (const r of kilnPairs(game)) {
        const ore = r.in[0];
        if ((game.call('countItem', player, ore.item) || 0) < ore.qty) continue;
        if (!game.call('takeItems', player, [{ item: ore.item, qty: ore.qty }])) continue;
        game.call('giveItem', player, r.out.item, r.out.qty || 1);
        const e = player.entity;
        game.fx(e.realm, 'kiln_smoke', e.x, e.y - 0.5, { soul: 1 });
        game.procs.fire('smelt', player, { item: r.out.item, qty: r.out.qty || 1, station: 'kilnsoul' }, 1);
        return;
      }
    },
  },
  shallows_walk: {
    run(game, { player, p, st }, ctx) {
      player.walkShallows = game.now + 0.5;
      if (!p.highTideNodes || timeInfo(game).lowTide) return;
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < 10) return;
      st.t = 0;
      spawnHighTideNode(game, player, st);
    },
  },
  aura_slow: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < 0.5) return;
      st.t = 0;
      const e = player.entity;
      const s = game.stats.of(player);
      for (const f of foesNear(game, e.realm, e.x, e.y, p.radius)) applyStatus(game, f, 'slow', { duration: 0.8, power: p.slow * (1 + (s.slowPotency || 0)), source: e });
    },
    on_kill(game, { player, p }, ctx) {
      const t = ctx.target;
      if (!p.novaOnFrozenKill || !hasStatus(game, t, 'freeze')) return;
      game.fx(t.realm, 'freeze_shatter', t.x, t.y, { nova: 1, r: 3 });
      for (const f of foesNear(game, t.realm, t.x, t.y, 3, t)) freezeTarget(game, player, f, 1.5);
    },
  },
  sapling: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < 1) return;
      st.t = 0;
      const sap = findSapling(game, player, st);
      if (!sap) return;
      for (const a of alliesNear(game, sap.realm, sap.x, sap.y, p.radius)) healPlayer(game, a, p.regen);
      st.grow = (st.grow || 0) + p.growth / 60;    // +growth => one extra crop stage per 60/growth s
      if (st.grow >= 1) { st.grow -= 1; game.call('growCrops', sap.realm, sap.x, sap.y, p.radius, 1); game.fx(sap.realm, 'crop_grow', sap.x, sap.y, { r: p.radius }); }
      if ((st.leaf = (st.leaf || 0) + 1) % 4 === 0) game.fx(sap.realm, 'leaf_fall', sap.x, sap.y - 1);
    },
  },
  glint_echo: {
    run(game, { player, st }) {
      if (!(st.acc >= 1)) return;
      const n = Math.floor(st.acc);
      st.acc -= n;
      game.call('addGlint', n, 'glint_echo', player);
    },
  },
  companion: {
    run(game, { player, p, pr, st }) {
      if (st.ent && !st.ent.removed) return;
      const e = player.entity;
      st.ent = spawnSummon(game, player, { kind: p.kind || 'battle_scuttler', x: e.x + 0.8, y: e.y, dur: Infinity, dmg: 0.4, rate: 1.5, procKey: pr.key });
    },
  },
  periodic_wave: {
    run(game, { player, p, st }, ctx) {
      st.t = (st.t || 0) + ctx.dt;
      if (st.t < p.interval) return;
      st.t = 0;
      const e = player.entity;
      game.fx(e.realm, 'tide_wave', e.x, e.y, { r: p.radius, nova: 1 });
      for (const f of foesNear(game, e.realm, e.x, e.y, p.radius)) dealDamage(game, player, f, p.dmg * weaponDamage(game, player), { element: 'tide', knock: 1 });
    },
  },

  // ---- on drop (fired by loot code; ctx { item, qty } is mutable)
  luck_twice: { run(game, P, ctx) { ctx.luckTwice = true; } },
  jackpot: {
    run(game, { player, p }, ctx) {
      if (!chance(game, player, p.chance)) return;
      ctx.qty = Math.round((ctx.qty || 1) * p.mult);
      ctx.jackpot = true;
      const e = player.entity;
      if (e) game.fx(e.realm, 'glint_burst', e.x, e.y, { jackpot: 1 });
    },
    // Until loot code fires 'drop' itself (game.procs.dropHooked = true), node breaks roll the jackpot here.
    on_nodeBreak(game, { player, p }, ctx) {
      if (game.procs.dropHooked || !chance(game, player, p.chance)) return;
      spawnNodeDrops(game, player, ctx.kind, ctx.tier, ctx.x, ctx.y, ctx.realm, Math.max(1, p.mult - 1));
      game.fx(ctx.realm, 'glint_burst', ctx.x, ctx.y, { jackpot: 1 });
      game.toast(player, 'JACKPOT! x' + p.mult, 'good');
    },
  },
};

function kilnPairs(game) {
  let list = KILN_PAIRS_CACHE.get(game.content);
  if (!list) {
    list = game.content.recipes.filter((r) => r.station === 'kiln' && r.in?.length === 1 && r.in[0].item && /_ore$/.test(r.in[0].item) && r.out?.item);
    KILN_PAIRS_CACHE.set(game.content, list);
  }
  return list;
}

function findSapling(game, player, st) {
  const realm = game.realms.get(player.entity.realm);
  if (st.sap && !st.sap.removed) return st.sap;
  if ((st.scanAt || 0) > game.now) return null;
  st.scanAt = game.now + 10;
  for (const e of realm.entities.values()) {
    if (e.type === 'structure' && e.kind === 'sapling' && e.data?.owner === player.token) { st.sap = e; return e; }
  }
  return null;
}

function spawnHighTideNode(game, player, st) {
  st.nodes = (st.nodes || []).filter((n) => !n.removed);
  if (st.nodes.length >= 4) return;
  const e = player.entity;
  const realm = game.realms.get(e.realm);
  const kinds = game.content.nodes.filter((n) => n.cls === 'tidal' && (n.weight ?? 1) > 0 && !/cache/.test(n.id));
  if (!kinds.length || !realm) return;
  const rng = game.procs.rng;
  for (let i = 0; i < 16; i++) {
    const tx = Math.floor(e.x + rng.int(-6, 6)), ty = Math.floor(e.y + rng.int(-6, 6));
    if (realm.groundAt?.(tx, ty) !== 2) continue;    // tidal flat
    const n = game.call('spawnNode', realm, rng.pick(kinds).id, tx, ty);
    if (n) { st.nodes.push(n); game.fx(realm, 'tide_out', n.x, n.y, { shallows: 1 }); return; }
  }
}

// ---------------------------------------------------------------- runtime

function makeRuntime(game) {
  const R = {
    depth: 0,
    rng: game.rng.fork('procs'),
    dropHooked: false,
    sources: ensureWp6(game).procSources,
    addSource: (name, fn) => R.sources.add(name, fn),
    removeSource: (name) => R.sources.remove(name),
    invalidate(player) { if (player) player.procCache = null; },
    list(player) {
      if (!player) return [];
      const c = player.procCache;
      if (c && c.at > game.now - 1) return c.list;
      const list = R.sources.collect(player).filter((p) => p && IMPL[p.id]);
      list.forEach((p, i) => { p.key ||= `${p.src || 'x'}:${p.id}:${i}`; });
      list.sort((a, b) => (a.id === 'cheat_death') - (b.id === 'cheat_death'));
      player.procCache = { at: game.now, list };
      return list;
    },
    has: (player, id) => R.list(player).some((p) => p.id === id),
    params: (player, id) => R.list(player).filter((p) => p.id === id).map((p) => p.p || {}),
    stateOf(player, key) {
      const m = (player.procState ||= new Map());
      let s = m.get(key);
      if (!s) { s = {}; m.set(key, s); }
      return s;
    },
    statsDirty(player) { game.stats.invalidate(player); },
    // Luck roll; Golden Tide rolls twice and keeps the better.
    luckRoll(player, p) {
      if (p >= 1) return true;
      if (R.rng.next() < p) return true;
      return !!player && R.has(player, 'luck_twice') && R.rng.next() < p;
    },
    // Run a trigger for a player. maxDepth guards against proc chains re-entering themselves.
    fire(trigger, player, ctx = {}, maxDepth = 0) {
      if (!player?.entity || R.depth > maxDepth) return ctx;
      ctx.trigger = trigger;
      const list = R.list(player);
      if (!list.length) return ctx;
      R.depth++;
      try {
        for (const pr of list) {
          const impl = IMPL[pr.id];
          const P = { player, p: pr.p || {}, pr, st: R.stateOf(player, pr.key) };
          try {
            if (pr.on === trigger && impl.run) impl.run(game, P, ctx);
            const extra = impl['on_' + trigger];
            if (extra) extra(game, P, ctx);
          } catch (err) { console.error(`[tb:procs] ${pr.id} (${trigger}) threw:`, err); }
        }
      } finally { R.depth--; }
      return ctx;
    },
  };
  return R;
}

// Timed proc modifiers (stack_buff, harvest_streak, kiln_boost, low_hp_buff).
function procMods(player) {
  const out = [];
  if (!player.procState) return out;
  for (const s of player.procState.values()) if (s.mods && (s.until ?? 0) > (player.procNow ?? 0)) for (const m of s.mods) out.push(m);
  return out;
}

// Weapon hit from WP5 (mob.hit). Ability and proc damage happen at depth > 0 and are skipped here.
function onMobHit(game, ev) {
  const R = game.procs;
  if (R.depth > 0 || R.abilityDepth > 0 || ev.noProcs || ev.ability) return;
  const player = asPlayer(game, ev.attacker);
  if (!player || !isFoe(ev.mob) && !(ev.mob && ev.mob.hp <= 0)) return;
  player.lastHitAt = game.now;
  const ctx = { target: ev.mob, dmg: ev.dmg || 0, crit: !!ev.crit, element: ev.element, bonus: 0 };
  R.fire('hit', player, ctx);
  if (ctx.crit) R.fire('crit', player, ctx);
  if (player.swingTick !== game.tickCount) { player.swingTick = game.tickCount; R.fire('swing', player, { target: ev.mob, dmg: ctx.dmg }); }
  if (ctx.bonus > 0 && isFoe(ev.mob)) dealDamage(game, player, ev.mob, ctx.dmg * ctx.bonus, { element: ev.element });
}

function onDodge(game, player) {
  if (!player || (player.lastDodgeProc ?? -1) > game.now - 0.3) return;
  player.lastDodgeProc = game.now;
  game.procs.fire('dodge', player, {});
}

function onNodeHit(game, { player, node, dmg }) {
  const R = game.procs;
  if (!player || R.depth > 0 || R.abilityDepth > 0) return;
  player.lastNodeDmg = dmg;
  R.fire('nodeHit', player, { node, dmg });
  if (player.swingTick !== game.tickCount) { player.swingTick = game.tickCount; R.fire('swing', player, { node, dmg }); }
}

function onNodeBroken(game, { player, node, kind, tier, x, y, byMachine }) {
  if (!player || byMachine) return;
  const def = game.content.nodes.byId[kind];
  game.procs.fire('nodeBreak', player, {
    node, kind, tier: tier === 'biome' ? node?.data?.tier ?? 1 : (Number(tier) || node?.data?.tier || 1), x, y, cls: def?.cls,
    realm: node?.realm ?? player.entity?.realm, tx: node?.data?.tx ?? Math.floor(x), ty: node?.data?.ty ?? Math.floor(y),
  }, 1);
}

// Lethal hit: give revive/cheat-death procs a chance before death is processed. Also exposed as the
// `cheatDeath(player)` service so WP5 can ask explicitly (returns true when the player was saved).
function tryCheatDeath(game, player) {
  const e = player?.entity;
  if (!e || e.hp > 0) return false;
  const ctx = game.procs.fire('death', player, { saved: false }, 3);
  if (ctx.saved && e.hp > 0) { e.lastSaved = game.now; return true; }
  return false;
}

export default {
  name: 'procs',

  init(game) {
    ensureWp6(game);
    const R = makeRuntime(game);
    R.abilityDepth = 0;
    R.hurtHooks = [];
    game.procs = R;
    game.services.register('cheatDeath', (player) => tryCheatDeath(game, player));
    // WP5 death guard: lethal damage asks the death procs first (Phoenix Ash, Last Stand, blessings).
    if (game.services.has('registerDeathGuard')) {
      game.call('registerDeathGuard', (player) => {
        const e = player?.entity;
        if (!e) return false;
        const ctx = R.fire('death', player, { saved: false }, 3);
        return !!ctx.saved;
      });
    }
    game.services.register('procFire', (trigger, player, ctx) => R.fire(trigger, player, ctx || {}));
    game.stats.addSource('procs', (p) => { p.procNow = game.now; return procMods(p); });

    const bus = game.bus;
    bus.on('mob.hit', (ev) => onMobHit(game, ev));
    bus.on('node.hit', (ev) => onNodeHit(game, ev));
    bus.on('node.broken', (ev) => onNodeBroken(game, ev));
    bus.on('mob.killed', ({ killer, mob }) => {
      const p = asPlayer(game, killer);
      if (p) R.fire('kill', p, { target: mob, x: mob?.x, y: mob?.y }, 3);
    });
    bus.on('player.hurt', ({ player, source, dmg }) => {
      if (!player?.entity) return;
      player.lastHurtAt = game.now;
      // Pre-death hooks (Breakwater guard etc.) may restore part of the hit before death is checked.
      for (const h of R.hurtHooks) { try { h(player, source, dmg); } catch (err) { console.error('[tb:procs] hurt hook threw:', err); } }
      if (player.entity.hp <= 0) tryCheatDeath(game, player);
      if (player.entity.hp > 0) R.fire('hurt', player, { source, dmg }, 3);
    });
    bus.on('player.dodge', ({ player }) => onDodge(game, player));
    bus.on('crop.harvested', ({ player, crop, qty, byMachine }) => { if (player && !byMachine) R.fire('harvest', player, { crop, qty }); });
    bus.on('fish.caught', ({ player, fish, rarity }) => { if (player) R.fire('fishCatch', player, { fish, rarity }); });
    bus.on('item.crafted', ({ player, item, qty, station, byMachine }) => {
      if (!player || byMachine) return;
      R.fire('craft', player, { item, qty, station });
      if (typeof station === 'string' && station.startsWith('kiln')) R.fire('smelt', player, { item, qty, station });
    });
    bus.on('machine.output', ({ machine, item, qty }) => {
      const owner = machine?.data?.owner;
      let p = [...game.players.values()].find((x) => x.token === owner);
      if (!p) p = [...game.players.values()].find((x) => R.has(x, 'machine_free'));
      if (p) R.fire('machineCraft', p, { machine, item, qty });
    });
    bus.on('glint.changed', ({ delta, source }) => {
      if (!(delta > 0) || source === 'glint_echo') return;
      for (const p of game.players.values()) {
        for (const pr of R.list(p)) if (pr.id === 'glint_echo') { const st = R.stateOf(p, pr.key); st.acc = (st.acc || 0) + delta * (pr.p.pct || 0.01); }
      }
    });
  },

  tick(game, dt) {
    const R = game.procs;
    for (const p of game.players.values()) {
      const e = p.entity;
      if (!e || e.state === STATE.DEAD) continue;
      // dodge start (movement owns the dodge; WP5 may also emit player.dodge, deduplicated above)
      const dodging = (p.body?.dodgeT ?? 0) > 0;
      if (dodging && !p.wasDodging) onDodge(game, p);
      p.wasDodging = dodging;
      R.fire('tick', p, { dt });
      // expire timed proc modifiers
      if (p.procState) {
        for (const s of p.procState.values()) {
          if (s.mods && s.until !== Infinity && (s.until ?? 0) <= game.now) { s.mods = null; s.stacks = 0; game.stats.invalidate(p); }
        }
      }
      if (p.walkShallows && p.walkShallows < game.now) p.walkShallows = 0;
    }
  },

  slowTick(game) {
    // Remove companions whose proc is gone.
    for (const p of game.players.values()) {
      if (!p.procState) continue;
      const keys = new Set(game.procs.list(p).map((x) => x.key));
      for (const [k, s] of p.procState) {
        if (keys.has(k)) continue;
        if (s.ent && !s.ent.removed) game.realms.get(s.ent.realm)?.remove(s.ent);
        p.procState.delete(k);
      }
    }
  },

  onLeave(game, player) {
    if (!player.procState) return;
    for (const s of player.procState.values()) if (s.ent && !s.ent.removed) game.realms.get(s.ent.realm)?.remove(s.ent);
    player.procState.clear();
  },
};

export const PROC_IMPL_IDS = Object.freeze(Object.keys(IMPL));
export { PROCS };
