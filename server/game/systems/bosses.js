// WP5 boss framework: registerBossScript / startBoss, phases at the data thresholds, telegraphed moves (>= 0.6 s),
// enrage, hard mode, co-op HP scaling, personal loot, first-kill XP, the `boss.summon` action and the Warden
// altar (`arena`) interaction. Warden scripts live in server/game/bosses/*.js; Keepers (WP10) and the Drowned
// Moon register through the same service.
//
// BossScript (TECH_SPEC 5.5) plus optional extensions used here:
//   { phases:[{at, moves[]}], moves:{ name:{ windup, cooldown, telegraph?, run(game, boss, target, k, aim),
//     aim?: 'target'|'self', track?: bool, recover?, weight?, minDist?, maxDist?, zones?(game,boss,target,k) -> specs,
//     update?(game, boss, dt, k, target) (while channelling: run() returning a number of seconds) } },
//     onPhase?(game, boss, i, k), onStart?(game, boss, k), tick?(game, boss, dt, k, target), onHit?(...),
//     onEnd?(game, boss, reason, k), movement?: 'chase'|'stationary'|'hover', range?, speed?, radius?, gcd? }

import { createEntity } from '../entities.js';
import { STATE } from '../../../shared/protocol.js';
import { PARTY_RANGE } from '../../../shared/config.js';
import { bossHpScale, tideHeightMods } from '../../../shared/rules/scaling.js';
import { rollTable, yieldMult } from '../../../shared/rules/loot.js';
import { KILL_XP_PER_PLAYER } from '../../../shared/rules/constants.js';
import { livePlayers, playersNear, alive } from './combat.js';
import { makeKit, integrate } from './ai.js';
import { telegraph, ringWave, spawnZone } from './projectiles.js';
import { clearStatusImpl } from './status.js';

const MIN_WINDUP = 0.6;
const DESPAWN_EMPTY_S = 25;
const WARDEN_LEVEL = [10, 22, 36, 50, 64, 78];
const KEEPER_LEVEL = [8, 18, 30, 44, 58, 72];
const r2 = (v) => Math.round(v * 100) / 100;

export function bossXp(game, def) {
  if (!def || def.kind === 'final') return 0;
  const lv = (def.kind === 'keeper' ? KEEPER_LEVEL : WARDEN_LEVEL)[Math.max(0, Math.min(5, (def.k ?? 1) - 1))];
  return Math.round(0.25 * game.xpToNext(lv));
}

// ---------------------------------------------------------------- start

export function startBoss(game, realm, bossId, x, y, opts = {}) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const def = game.content.bosses.byId[bossId];
  if (!def) { console.warn(`[tb:bosses] unknown boss '${bossId}'`); return null; }
  const script = game.services.bossScripts.get(def.script ?? bossId) ?? game.services.bossScripts.get(bossId) ?? GENERIC;
  const n = Number.isFinite(opts.scaleN) ? Math.max(1, opts.scaleN) : Math.max(1, playersNear(game, realm.id, x, y, PARTY_RANGE).length);
  const th = tideHeightMods(game.world?.tideHeight ?? 0);
  const hard = !!opts.hard;
  const hp = Math.round(def.hp * bossHpScale(n) * (hard ? 2 : 1) * th.hp * (opts.hpMult ?? 1));
  const dmg = def.dmg * (hard ? 1.25 : 1) * th.dmg * (opts.dmgMult ?? 1);
  const count = Math.max(1, def.count ?? 1);
  const group = [];
  const encounter = {
    id: ++game.bossSeq, bossId, def, hard, startAt: game.now, players: new Set(), dmgBy: {}, members: group, adds: new Set(),
    arena: opts.arena ?? { x, y, r: 12 }, instance: opts.instance ?? null, realmId: realm.id, emptySince: null,
    extraRolls: opts.extraRolls ?? null, noLoot: !!opts.noLoot, trench: opts.trench ?? 0, tiles: new Map(), ended: false,
    onEnd: opts.onEnd ?? null, onDefeat: opts.onDefeat ?? null, scaleN: n, xpMult: opts.xpMult ?? 1,
  };
  for (let i = 0; i < count; i++) {
    const ox = count > 1 ? (i - (count - 1) / 2) * 4 : 0;
    const e = createEntity(game, {
      type: 'boss', kind: bossId, x: x + ox, y, hp, maxHp: hp, radius: script.radius ?? 1.1, facing: 2,
      data: {
        def, script, scriptId: def.script ?? bossId, phase: 0, dmg, speed: (script.speed ?? 2.0) * (opts.speedMult ?? 1), armor: script.armor ?? 0,
        weak: script.weak ?? null, resist: script.resist ?? null, enraged: false, enrageAt: def.enragePhase ? Infinity : game.now + (def.enrage ?? 360),
        cds: {}, gcd: game.now + 1.5, act: null, ai: {}, enc: encounter, index: i, timers: [], fxHit: script.fxHit ?? 'hit_flesh',
        blood: script.blood ?? null, team: 'enemy', lastMove: null, dmgBy: {}, ccImmune: true, noKnock: true, instance: opts.instance ?? null,
        tier: def.k ?? 1, lastHurtAt: -99,
      },
      pub: { el: 0, st: 0, tg: 0, ph: 0, en: 0, gi: i, gn: count },
    });
    realm.add(e);
    group.push(e);
    game.bossesLive.add(e);
  }
  const k = game.bossKit;
  for (const b of group) { try { script.onStart?.(game, b, k); } catch (err) { console.error(`[tb:bosses] ${bossId} onStart threw:`, err); } }
  game.fx(realm, 'boss_phase', x, y, { start: 1, k: bossId, i: group[0].id });
  for (const p of playersNear(game, realm.id, x, y, PARTY_RANGE * 1.5)) game.toast(p, `${def.name} rises!`, 'warn');
  return group[0];
}

// ---------------------------------------------------------------- per-tick

function encounterFrac(enc) {
  let hp = 0, mh = 0;
  for (const b of enc.members) { mh += b.maxHp; hp += b.removed ? 0 : Math.max(0, b.hp); }
  return mh > 0 ? hp / mh : 0;
}

function phaseFor(def, frac) {
  const ph = def.phases ?? [1, 0.66, 0.33];
  let i = 0;
  for (let j = 1; j < ph.length; j++) if (frac <= ph[j]) i = j;
  return i;
}

function movesForPhase(script, phase) {
  const out = [];
  for (let i = 0; i <= phase && i < (script.phases?.length ?? 0); i++) for (const m of script.phases[i].moves ?? []) out.push(m);
  return out;
}

function chooseMove(game, b, target) {
  const script = b.data.script;
  const names = movesForPhase(script, b.data.phase).filter((n) => script.moves?.[n] && game.now >= (b.data.cds[n] ?? 0));
  if (!names.length) return null;
  const d = target ? Math.hypot(target.x - b.x, target.y - b.y) : 0;
  const ok = names.filter((n) => {
    const mv = script.moves[n];
    if (mv.minDist != null && d < mv.minDist) return false;
    if (mv.maxDist != null && d > mv.maxDist) return false;
    if (mv.when && !mv.when(game, b, target)) return false;
    return true;
  });
  const pool = ok.length ? ok : [];
  if (!pool.length) return null;
  const fresh = pool.length > 1 ? pool.filter((n) => n !== b.data.lastMove) : pool;
  let total = 0;
  for (const n of fresh) total += script.moves[n].weight ?? 1;
  let r = game.bossRng.next() * total;
  for (const n of fresh) { r -= script.moves[n].weight ?? 1; if (r <= 0) return n; }
  return fresh[fresh.length - 1];
}

function aimFor(b, mv, target, game, k) {
  const t = target ?? { x: b.x + 1, y: b.y };
  const a = Math.atan2(t.y - b.y, t.x - b.x);
  let spec = null;
  if (typeof mv.telegraph === 'function') spec = mv.telegraph(game, b, target, k);
  else if (mv.telegraph) {
    const tg = mv.telegraph;
    const atSelf = mv.aim === 'self' || tg.shape === 'ring' || tg.shape === 'cone' || tg.shape === 'line';
    spec = { ...tg, x: atSelf ? b.x : t.x, y: atSelf ? b.y : t.y, a };
  }
  return { spec, a, tx: t.x, ty: t.y };
}

function startMove(game, b, name, target, k) {
  const script = b.data.script;
  const mv = script.moves[name];
  const windup = Math.max(MIN_WINDUP, mv.windup ?? 0.8) / (b.data.enraged ? 1.15 : 1);
  const aim = aimFor(b, mv, target, game, k);
  b.data.act = { name, phase: 'windup', t: 0, windup, aim, targetId: target?.id ?? 0, chan: 0 };
  b.data.lastMove = name;
  b.data.cds[name] = game.now + (mv.cooldown ?? 4) / (b.data.enraged ? 1.3 : 1);
  b.state = STATE.WINDUP;
  publishTg(game, b, aim.spec, windup);
  if (mv.zones) {
    let specs = [];
    try { specs = mv.zones(game, b, target, k, aim) ?? []; } catch (err) { console.error(`[tb:bosses] ${name}.zones threw:`, err); }
    aim.zones = specs;
    const realm = game.realms.get(b.realm);
    for (const s of specs) telegraph(game, realm, s, windup + (s.extra ?? 0), null, { source: b, color: s.color ?? null });
  }
  game.fx(b.realm, 'boss_telegraph', b.x, b.y - 1, { i: b.id, mv: name, t: r2(windup) });
}

function publishTg(game, b, spec, t) {
  if (!spec) { if (b.pub.tg) b.set('tg', 0); return; }
  game.tgSeq = ((game.tgSeq ?? 0) + 1) & 0xffff;
  const tg = { shape: spec.shape ?? 'circle', x: r2(spec.x ?? b.x), y: r2(spec.y ?? b.y), r: r2(spec.r ?? 2), t: r2(t), n: game.tgSeq };
  for (const key of ['len', 'w', 'a', 'r2', 'h']) if (spec[key] != null) tg[key] = r2(spec[key]);
  if (spec.arc != null) tg.arc = Math.round(spec.arc);
  if (spec.gap) tg.gap = { a: r2(spec.gap.a), arc: Math.round(spec.gap.arc) };
  b.set('tg', tg);
}

function tickBoss(game, b, dt, k) {
  const realm = game.realms.get(b.realm);
  if (!realm) return;
  const d = b.data, enc = d.enc, script = d.script;
  // timers scheduled by scripts
  if (d.timers.length) {
    const due = d.timers.filter((t) => t.at <= game.now);
    if (due.length) {
      d.timers = d.timers.filter((t) => t.at > game.now);
      for (const t of due) { try { t.fn(); } catch (err) { console.error(`[tb:bosses] ${b.kind} timer threw:`, err); } if (b.removed) return; }
    }
  }
  // participants
  for (const p of playersNear(game, b.realm, b.x, b.y, PARTY_RANGE)) enc.players.add(p.id);
  // enrage
  if (!d.enraged && game.now >= d.enrageAt) setEnraged(game, b, true);
  // phases (shared across a group)
  const ph = phaseFor(d.def, encounterFrac(enc));
  if (ph > d.phase) {
    for (const m of enc.members) if (!m.removed && m.data.phase < ph) enterPhase(game, m, ph, k);
  }
  const target = pickTarget(game, b);
  try { script.tick?.(game, b, dt, k, target); } catch (err) { if (!d.tickErr) { d.tickErr = true; console.error(`[tb:bosses] ${b.kind}.tick threw:`, err); } }
  if (b.removed) return;
  if (d.frozen) { d.mv = null; return; }
  const act = d.act;
  if (act) {
    act.t += dt;
    const mv = script.moves[act.name];
    if (act.phase === 'windup') {
      d.mv = null;
      if (mv.track && act.t < act.windup - 0.3) {
        const t2 = realm.entities.get(act.targetId);
        if (t2 && alive(t2)) { act.aim = aimFor(b, mv, t2, game, k); publishTg(game, b, act.aim.spec, act.windup - act.t); }
      }
      if (act.t >= act.windup) {
        if (b.pub.tg) b.set('tg', 0);
        b.state = STATE.ACT;
        const t2 = realm.entities.get(act.targetId) ?? target;
        let ret;
        try { ret = mv.run(game, b, t2 && alive(t2) ? t2 : target, k, act.aim); } catch (err) { console.error(`[tb:bosses] ${b.kind}.${act.name} threw:`, err); }
        if (b.removed) return;
        if (Number.isFinite(ret) && ret > 0) { act.phase = 'channel'; act.t = 0; act.chan = ret; }
        else { act.phase = 'recover'; act.t = 0; }
      }
    } else if (act.phase === 'channel') {
      try { mv.update?.(game, b, dt, k, target, act); } catch (err) { console.error(`[tb:bosses] ${b.kind}.${act.name}.update threw:`, err); }
      if (b.removed) return;
      if (act.t >= act.chan) { act.phase = 'recover'; act.t = 0; mv.end?.(game, b, k, act); }
    } else if (act.t >= (mv.recover ?? 0.6)) {
      d.act = null;
      d.gcd = game.now + (script.gcd ?? 0.7) / (d.enraged ? 1.3 : 1);
      if (b.state === STATE.ACT) b.state = STATE.IDLE;
    }
  } else if (target && game.now >= d.gcd && !d.noMoves) {
    const name = chooseMove(game, b, target);
    if (name) startMove(game, b, name, target, k);
  }
  // movement
  if (!d.act || d.act.phase === 'channel' && script.moves[d.act.name]?.moveWhile) {
    const mode = script.movement ?? 'chase';
    const arena = enc.arena;
    if (mode === 'stationary' || !target) {
      if (arena && Math.hypot(b.x - arena.x, b.y - arena.y) > 1.5 && mode !== 'stationary') k.toward(b, arena.x, arena.y, 0.6);
      else k.stop(b);
    } else {
      const dist = Math.hypot(target.x - b.x, target.y - b.y);
      const range = script.range ?? 2.4;
      if (arena && Math.hypot(b.x - arena.x, b.y - arena.y) > arena.r) k.toward(b, arena.x, arena.y, 1);
      else if (mode === 'hover') {
        if (dist < range - 1) k.away(b, target.x, target.y, 0.8);
        else if (dist > range + 1.5) k.toward(b, target.x, target.y, 0.9);
        else k.orbit(b, target.x, target.y, range, 1, 0.5);
      } else if (dist > range) k.toward(b, target.x, target.y, 1);
      else k.stop(b);
    }
  } else if (d.act?.phase !== 'channel') d.mv = null;
  integrate(game, realm, b, dt);
  // abandoned fights despawn (overworld Wardens)
  if (!enc.instance) {
    const anyone = livePlayers(game, b.realm, enc.arena.x, enc.arena.y, 40).length > 0;
    if (anyone) enc.emptySince = null;
    else if (enc.emptySince == null) enc.emptySince = game.now;
    else if (game.now - enc.emptySince > DESPAWN_EMPTY_S) endEncounter(game, enc, 'abandoned');
  }
}

function pickTarget(game, b) {
  const d = b.data;
  if ((d.ai.retargetAt ?? 0) > game.now) {
    const t = game.realms.get(b.realm)?.entities.get(d.ai.target);
    if (t && alive(t) && t.state !== STATE.DOWN && t.state !== STATE.DEAD) return t;
  }
  d.ai.retargetAt = game.now + 1.2;
  const taunt = d.status?.taunt;
  if (taunt?.src) {
    const t = game.realms.get(b.realm)?.entities.get(taunt.src);
    if (t && alive(t)) { d.ai.target = t.id; return t; }
  }
  let best = null, bestScore = Infinity;
  for (const p of livePlayers(game, b.realm, b.x, b.y, 34)) {
    const e = p.entity;
    const threat = Math.max(0.1, game.stats.of(p).threat ?? 1);
    const dmg = d.enc.dmgBy[p.id] ?? 0;
    const score = Math.hypot(e.x - b.x, e.y - b.y) / threat - Math.min(4, dmg / Math.max(1, b.maxHp) * 20) - (d.ai.target === e.id ? 2 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  d.ai.target = best?.id ?? 0;
  return best;
}

export function setEnraged(game, b, on) {
  b.data.enraged = on;
  b.set('en', on ? 1 : 0);
  if (on) {
    game.fx(b.realm, 'boss_phase', b.x, b.y, { enrage: 1, i: b.id });
    for (const p of playersNear(game, b.realm, b.x, b.y, PARTY_RANGE * 1.5)) game.toast(p, `${b.data.def.name} is enraged!`, 'warn');
  }
}

function enterPhase(game, b, ph, k) {
  b.data.phase = ph;
  b.set('ph', ph);
  if (b.data.act && b.data.act.phase === 'windup') { b.data.act = null; if (b.pub.tg) b.set('tg', 0); }
  b.data.gcd = game.now + 1.2;
  b.data.frozen = false;
  if (b.data.def.enragePhase && ph + 1 >= b.data.def.enragePhase && b.data.enrageAt === Infinity) b.data.enrageAt = game.now + (b.data.def.enrage ?? 600);
  game.fx(b.realm, 'boss_phase', b.x, b.y, { ph, i: b.id, k: b.kind });
  try { b.data.script.onPhase?.(game, b, ph, k); } catch (err) { console.error(`[tb:bosses] ${b.kind}.onPhase threw:`, err); }
}

// ---------------------------------------------------------------- damage / death hooks

export function onBossDamaged(game, b, dealt, src, opts) {
  const enc = b.data.enc;
  if (!enc) return;
  const pid = src?.type === 'player' ? src.id : src?.data?.ownerId;
  if (pid) { enc.dmgBy[pid] = (enc.dmgBy[pid] ?? 0) + dealt; enc.players.add(pid); }
  try { b.data.script.onHit?.(game, b, dealt, src, game.bossKit); } catch (err) { console.error(`[tb:bosses] ${b.kind}.onHit threw:`, err); }
}

export function onBossKilled(game, b, killer, src, opts) {
  const enc = b.data.enc;
  const realm = game.realms.get(b.realm);
  if (!enc || !realm || b.data.dead) return;
  b.data.dead = true;
  b.state = STATE.DEAD;
  const others = enc.members.filter((m) => m !== b && !m.removed && m.hp > 0);
  if (others.length) {
    // one body of a group falls (Twin Lenses): the rest fight on
    game.fx(realm, 'boss_death', b.x, b.y, { part: 1, i: b.id, k: b.kind });
    try { b.data.script.onPartDeath?.(game, b, others, game.bossKit); } catch (err) { console.error(err); }
    realm.remove(b);
    game.bossesLive.delete(b);
    return;
  }
  game.fx(realm, 'boss_death', b.x, b.y, { i: b.id, k: b.kind, r: b.radius });
  endEncounter(game, enc, 'killed', b);
}

export function endEncounter(game, enc, reason, last = null) {
  if (enc.ended) return;
  enc.ended = true;
  const k = game.bossKit;
  const realm = game.realms.get(enc.realmId);
  const lead = last ?? enc.members[0];
  for (const b of enc.members) {
    try { b.data.script.onEnd?.(game, b, reason, k); } catch (err) { console.error(`[tb:bosses] ${b.kind}.onEnd threw:`, err); }
    b.data.timers = [];
    game.bossesLive.delete(b);
    if (!b.removed && realm) {
      if (reason !== 'killed') game.fx(realm, 'summon_puff', b.x, b.y, { big: 1 });
      realm.remove(b);
    }
  }
  restoreTiles(game, enc);
  // adds vanish with their master
  for (const a of enc.adds) if (!a.removed && realm) { game.fx(realm, 'summon_puff', a.x, a.y); realm.remove(a); game.mobsLive?.delete(a); }
  if (reason === 'killed') awardBoss(game, enc, lead);
  else if (realm) {
    for (const p of playersNear(game, realm.id, enc.arena.x, enc.arena.y, 40)) game.toast(p, `${enc.def.name} sinks back beneath the tide.`, 'info');
  }
  try { enc.onEnd?.(game, enc, reason); } catch (err) { console.error('[tb:bosses] encounter onEnd threw:', err); }
}

function awardBoss(game, enc, lead) {
  const def = enc.def;
  const realm = game.realms.get(enc.realmId);
  const x = lead?.x ?? enc.arena.x, y = lead?.y ?? enc.arena.y;
  const ids = new Set(enc.players);
  for (const id of Object.keys(enc.dmgBy)) ids.add(Number(id));
  const participants = [...ids].map((id) => game.players.get(id)).filter((p) => p?.entity && p.entity.realm === enc.realmId
    && Math.hypot(p.entity.x - x, p.entity.y - y) <= PARTY_RANGE * 1.5);
  const worldFirst = !game.world.flags['boss:' + def.id];
  game.world.flags['boss:' + def.id] = true;
  if (def.kind === 'warden') {
    const gate = 'gate:warden_' + def.k;
    if (game.world.flags[gate] == null) game.world.flags[gate] = Math.round(game.playtimeS);
  }
  game.sendWorld('unlocks', game.world.flags);
  const xpFull = bossXp(game, def) * (enc.xpMult ?? 1);
  const repeatShare = participants.length ? (xpFull * 0.2 * (1 + KILL_XP_PER_PLAYER * (participants.length - 1))) / participants.length : 0;
  const lootRng = game.lootRng ?? game.bossRng;
  const firstFor = [];
  for (const p of participants) {
    const rec = (p.bossKills ||= {});
    const prior = rec[def.id] ?? 0;
    rec[def.id] = prior + 1;
    if (prior === 0) firstFor.push(p.id);
    // XP: first kill full for everyone, repeats share 20% by the kill formula
    const xp = prior === 0 ? xpFull : repeatShare;
    if (xp > 0) game.call('grantXp', p, Math.round(xp), prior === 0 ? 'boss_first' : 'boss');
    if (enc.noLoot) continue;
    const rolls = 1 + (enc.extraRolls?.(p) ?? 0);
    const s = game.stats.of(p);
    for (let roll = 0; roll < rolls; roll++) {
      const table = (def.loot ?? []).filter((l) => (!l.firstOnly || prior === 0) && (!l.repeatOnly || prior > 0) && !(roll > 0 && (l.firstOnly || l.item?.startsWith('trophy_'))))
        .map((l) => ({ item: l.item, min: l.qty ?? 1, max: l.qty ?? 1, p: l.trinket && enc.hard ? 1 : (l.p ?? 1), trinket: !!l.trinket }));
      const drops = rollTable(table, { rand: lootRng.next, mult: 1, luck: (s.luck ?? 0) + (s.luckWorld ?? 0) });
      // WP14 (BUILD_REVIEW P0-3): Twin Spoils (moon_trinkets) rolls the trinket entries once more per rank.
      const twin = game.services.has('moonRank') ? Number(game.call('moonRank', p, 'moon_trinkets')) || 0 : 0;
      for (let k = 0; k < twin; k++) {
        const tt = table.filter((l) => l.trinket);
        if (tt.length) drops.push(...rollTable(tt, { rand: lootRng.next, mult: 1, luck: (s.luck ?? 0) + (s.luckWorld ?? 0) }));
      }
      for (const dr of drops) {
        const a = lootRng.float(0, Math.PI * 2), r = lootRng.float(0.5, 1.6);
        game.call('dropItem', realm, x + Math.cos(a) * r, y + Math.sin(a) * r, dr.item, dr.qty, { owner: p.id });
      }
    }
    game.toast(p, `${def.name} defeated!`, 'good');
  }
  game.bus.emit('boss.killed', { boss: lead, kind: def.id, participants, first: worldFirst, firstFor, hard: enc.hard, instance: enc.instance, seconds: Math.round(game.now - enc.startAt) });
  try { enc.onDefeat?.(game, enc, participants, firstFor); } catch (err) { console.error('[tb:bosses] onDefeat threw:', err); }
}

// Temporary tile changes made by bosses (ice floors, erased tiles, glacier blocks) are restored at the end.
export function setTempGround(game, b, tx, ty, g, until = null) {
  const realm = game.realms.get(b.realm);
  const enc = b.data.enc;
  if (!realm || !realm.inBounds(tx, ty)) return;
  const key = ty * realm.w + tx;
  if (!enc.tiles.has(key)) enc.tiles.set(key, { tx, ty, g: realm.groundAt(tx, ty), until });
  else if (until != null) enc.tiles.get(key).until = until;
  realm.setGround(tx, ty, g, { persist: false });
}

export function restoreTiles(game, enc, filter = null) {
  const realm = game.realms.get(enc.realmId);
  if (!realm) { enc.tiles.clear(); return; }
  for (const [key, t] of enc.tiles) {
    if (filter && !filter(t)) continue;
    realm.setGround(t.tx, t.ty, t.g, { persist: false });
    enc.tiles.delete(key);
  }
}

function tickTiles(game) {
  for (const b of game.bossesLive) {
    const enc = b.data.enc;
    if (!enc?.tiles.size || b.data.index !== 0) continue;
    restoreTiles(game, enc, (t) => t.until != null && t.until <= game.now);
  }
}

// ---------------------------------------------------------------- boss kit (AI kit + boss helpers)

function makeBossKit(game) {
  const k = makeKit(game);
  k.after = (b, sec, fn) => { b.data.timers.push({ at: game.now + sec, fn }); };
  k.addSpawn = (b, kind, x, y, o = {}) => {
    const m = k.spawn(b, kind, x, y, { noLoot: true, scaleN: b.data.enc.scaleN, ...o });
    if (m) { b.data.enc.adds.add(m); m.data.leash = 40; m.data.home = { x: b.data.enc.arena.x, y: b.data.enc.arena.y }; m.data.aggro = 30; }
    return m;
  };
  k.arena = (b) => b.data.enc.arena;
  k.tempGround = (b, tx, ty, g, until) => setTempGround(game, b, tx, ty, g, until);
  k.restoreGround = (b, filter) => restoreTiles(game, b.data.enc, filter);
  k.tgPub = (b, spec, t) => publishTg(game, b, spec, t);
  k.enrage = (b, on = true) => setEnraged(game, b, on);
  k.members = (b) => b.data.enc.members.filter((m) => !m.removed);
  k.allPlayers = (b, r = 40) => livePlayers(game, b.realm, b.x, b.y, r).map((p) => p.entity);
  k.clearDebuffs = (e) => clearStatusImpl(game, e, 'debuffs');
  k.ring = (b, o) => ringWave(game, game.realms.get(b.realm), { source: b, dmg: k.dmg(b, o.mult ?? 1), ...o });
  // Lines from the boss (rotating arms / beams) are published as pub `arm` (angle) + `arms` (count) + `al` (length).
  k.arms = (b, a, n = 0, len = 9) => { if (n) { b.set('arm', r2(a)); if (b.pub.arms !== n) b.set('arms', n); if (b.pub.al !== len) b.set('al', len); } else if (b.pub.arms) { b.set('arms', 0); } };
  k.lineHits = (b, x, y, a, len, w, mult, o = {}) => k.hit(b, { shape: 'line', x, y, a, len, w }, mult, { fx: false, melee: false, knock: o.knock ?? 0.4, element: o.element, status: o.status });
  k.zoneAt = (b, o) => spawnZone(game, game.realms.get(b.realm), { team: 'enemy', source: b, ...o });
  return k;
}

// Fallback script: chase + slam + spit, used when a script id is missing.
const GENERIC = {
  phases: [{ at: 1, moves: ['slam'] }, { at: 0.66, moves: ['spit'] }, { at: 0.33, moves: ['ring'] }],
  moves: {
    slam: { windup: 0.9, cooldown: 3, telegraph: { shape: 'circle', r: 2.2 }, run: (g, b, t, k, aim) => k.hit(b, aim.spec, 1, { knock: 1.4, fx: 'anchor_slam' }) },
    spit: { windup: 0.7, cooldown: 4, telegraph: { shape: 'cone', r: 6, arc: 50 }, run: (g, b, t, k, aim) => { for (let i = -2; i <= 2; i++) k.shoot(b, 'seed', aim.a + i * 0.16, { speed: 7, mult: 0.6 }); } },
    ring: { windup: 1.0, cooldown: 7, telegraph: { shape: 'ring', r: 6, r2: 3 }, run: (g, b, t, k, aim) => k.hit(b, aim.spec, 1.2, { knock: 1.5 }) },
  },
};

// ---------------------------------------------------------------- summon action + altar

function arenaCenter(game, realm, fa) {
  const x0 = fa.px * 20, y0 = fa.py * 20;
  const altar = [];
  realm.spatial.queryRect(x0, y0, 20, 20, altar);
  const a = altar.find((e) => e.type === 'structure' && e.kind === 'arena');
  return a ? { x: a.x, y: a.y + 3.5 } : { x: x0 + 10, y: y0 + 10 };
}

export function summonWarden(game, player, lureId, hard) {
  const e = player.entity;
  const realm = game.realms.get(e?.realm);
  if (!realm || realm.id !== 'overworld') return { ok: false, err: 'denied' };
  const item = game.content.items.byId[lureId];
  const bossId = item?.use?.kind === 'lure' ? item.use.boss : null;
  const def = bossId && game.content.bosses.byId[bossId];
  if (!def) return { ok: false, err: 'invalid' };
  const fa = game.call('featureAt', realm, e.x, e.y);
  if (!fa || fa.feature !== 'arena') return { ok: false, err: 'range' };
  if (!fa.owned) return { ok: false, err: 'locked' };
  if (def.biome && fa.biome && fa.biome !== def.biome) return { ok: false, err: 'denied' };
  for (const b of game.bossesLive) if (b.realm === realm.id && !b.removed && b.data.enc && !b.data.enc.instance) {
    const a = b.data.enc.arena;
    if (Math.hypot(a.x - e.x, a.y - e.y) < 30) return { ok: false, err: 'busy' };
  }
  const need = hard ? 2 : 1;
  if ((game.call('countItem', player, lureId) ?? 0) < need) return { ok: false, err: 'cost' };
  if (!game.call('takeItems', player, [{ item: lureId, qty: need }])) return { ok: false, err: 'cost' };
  const c = arenaCenter(game, realm, fa);
  const boss = startBoss(game, realm, bossId, c.x, c.y, { hard, arena: { x: c.x, y: c.y, r: 11 } });
  if (!boss) return { ok: false, err: 'invalid' };
  game.fx(realm, 'boss_phase', c.x, c.y, { summon: 1, k: bossId });
  return { ok: true, d: { id: boss.id, boss: bossId, hard } };
}

function onAltar(game, player, entity) {
  const realm = game.realms.get(entity.realm);
  const fa = game.call('featureAt', realm, entity.x, entity.y);
  const biome = fa?.biome;
  const def = game.content.bosses.find((b) => b.kind === 'warden' && b.biome === biome);
  if (!def) return { ok: false, err: 'invalid' };
  const lure = def.lure;
  const have = game.call('countItem', player, lure) ?? 0;
  if (have < 1) {
    game.toast(player, `The altar hums. Offer a ${game.content.items.byId[lure]?.name ?? lure} to call ${def.name}.`, 'info');
    return { ok: true };
  }
  return summonWarden(game, player, lure, false);
}

export default {
  name: 'bosses',
  init(game) {
    game.bossRng = game.rng.fork('bosses');
    game.bossesLive = new Set();
    game.bossSeq = 0;
    game.bossKit = makeBossKit(game);
    game.services.register('registerBossScript', (id, script) => { game.services.bossScripts.set(id, script); });
    game.services.register('startBoss', (realm, bossId, x, y, opts = {}) => startBoss(game, realm, bossId, x, y, opts || {}));
    game.services.register('endBoss', (boss, reason = 'reset') => { if (boss?.data?.enc) endEncounter(game, boss.data.enc, reason); });
    game.services.register('bossXp', (bossId) => bossXp(game, game.content.bosses.byId[bossId]));
    game.call('registerInteract', 'arena', onAltar);
    // Wardens (and anything else in server/game/bosses/) self-describe: { id, script } or a BossScript with id.
    for (const [id, mod] of game.modules?.bosses ?? []) {
      const script = mod?.script ?? mod;
      if (script?.moves) game.services.bossScripts.set(mod.id ?? id, script);
    }
  },
  tick(game, dt) {
    const k = game.bossKit;
    for (const b of game.bossesLive) {
      if (b.removed) { game.bossesLive.delete(b); continue; }
      tickBoss(game, b, dt, k);
    }
  },
  slowTick(game) { tickTiles(game); },
  handlers: {
    'boss.summon': (game, player, d) => {
      if (typeof d?.lure !== 'string') return { ok: false, err: 'invalid' };
      return summonWarden(game, player, d.lure, !!d.hard);
    },
  },
  saveProfile(game, player) { return { kills: player.bossKills ?? {} }; },
  loadProfile(game, player, data) { player.bossKills = data?.kills && typeof data.kills === 'object' ? { ...data.kills } : {}; },
};
