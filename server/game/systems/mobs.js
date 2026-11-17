// WP5 mobs: the `spawnMob` service, overworld spawn rules (DESIGN 11, CRITIQUE I2: only the player's plot and
// its 4 neighbours, per-plot cap 2 + tier, per-player cap 6 + 4 * tier, lamp/Beacon/Garrison exclusions),
// elites and the 6 affixes, co-op HP scaling, death -> personal loot, Glint and the HP-normalised kill-XP split.

import { createEntity } from '../entities.js';
import { STATE } from '../../../shared/protocol.js';
import { PARTY_RANGE, PLOT, START_PLOT } from '../../../shared/config.js';
import { T, FLAG, BIOME_TIER, biomeOf, plotIndex, plotOfTile, inPlotBounds, N4, isWater } from '../../../shared/grid.js';
import { enemyHpScale, tideHeightMods } from '../../../shared/rules/scaling.js';
import { rollTable, mobGlint, yieldMult } from '../../../shared/rules/loot.js';
import { ELITE_CHANCE, ELITE_MULT, KILL_XP_PER_PLAYER, NIGHT_KILL_XP } from '../../../shared/rules/constants.js';
import { AFFIX_IDS } from '../../../shared/data/registries.js';
import { dealDamage, playersNear, livePlayers } from './combat.js';
import { telegraph, shapeHit } from './projectiles.js';
import { clearStatusImpl } from './status.js';

const DESPAWN_FAR = 48;          // tiles from every player
const DESPAWN_AFTER = 20;        // seconds
const SPAWN_MIN_DIST = 7;        // never spawn on top of a player
const LAMP_RADIUS = 6;

// Synthetic enemies that DESIGN references but does not list (shards, summons).
export const EXTRA_ENEMIES = Object.freeze({
  glass_shard: { id: 'glass_shard', name: 'Glass Shard', tier: 4, biome: 'glasswaste', hp: 140, dmg: 40, speed: 4.8, xp: 0, armor: 0,
    ai: 'skirmisher', aiParams: { zigzag: 1.0, stabCd: 1.4 }, weak: 'storm', resist: 'frost', radius: 0.3, night: false, loot: [], glint: [0, 0], blood: 'white', fxHit: 'hit_armor' },
  choir_singer: { id: 'choir_singer', name: 'Hollow Singer', tier: 6, biome: 'umbral', hp: 1000, dmg: 0, speed: 0, xp: 0, armor: 0,
    ai: 'none', aiParams: {}, weak: 'storm', resist: 'hollow', radius: 0.8, night: false, loot: [], glint: [0, 0], blood: 'violet', fxHit: 'hit_null' },
  lens: { id: 'lens', name: 'Lens', tier: 4, biome: 'glasswaste', hp: 1000, dmg: 0, speed: 0, xp: 0, armor: 0,
    ai: 'none', aiParams: {}, weak: 'hollow', resist: 'storm', radius: 0.8, night: false, loot: [], glint: [0, 0], blood: 'white', fxHit: 'hit_armor' },
  prism_clone: { id: 'prism_clone', name: 'Mirror Image', tier: 4, biome: 'glasswaste', hp: 600, dmg: 60, speed: 2.2, xp: 0, armor: 0,
    ai: 'kiter', aiParams: { keepDist: 6, shotCd: 2.2, proj: 'prism_shard' }, weak: 'hollow', resist: 'storm', radius: 1.0, night: false, loot: [], glint: [0, 0], blood: 'white', fxHit: 'hit_armor' },
  pylon: { id: 'pylon', name: 'Tether Pylon', tier: 7, biome: null, hp: 1000, dmg: 0, speed: 0, xp: 0, armor: 0,
    ai: 'none', aiParams: {}, weak: 'none', resist: 'none', radius: 0.7, night: false, loot: [], glint: [0, 0], blood: 'white', fxHit: 'hit_armor' },
});

export function enemyDef(game, kind) {
  return game.content.enemies.byId[kind] ?? EXTRA_ENEMIES[kind] ?? null;
}

const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- spawnMob

export function spawnMob(game, realm, kind, x, y, opts = {}) {
  if (typeof realm === 'string') realm = game.realms.get(realm);
  if (!realm) return null;
  const def = enemyDef(game, kind);
  if (!def) { console.warn(`[tb:mobs] unknown enemy '${kind}'`); return null; }
  const rng = game.mobRng;
  const n = Number.isFinite(opts.scaleN) ? Math.max(1, opts.scaleN) : Math.max(1, playersNear(game, realm.id, x, y, PARTY_RANGE).length);
  const th = tideHeightMods(game.world?.tideHeight ?? 0);
  // elite + affixes
  let elite = null;
  const affixes = [];
  if (!opts.noElite && !opts.clone) {
    let want = opts.elite;
    // WP14 (BUILD_REVIEW P0-1): no rolled elites while the crew owns fewer than 3 plots (start plot included).
    const ownedPlots = game.world?.plots ? game.world.plots.reduce((n, p) => n + (p.owned ? 1 : 0), 0) : 99;
    if (want === undefined && opts.rollElite && ownedPlots >= 3) {
      const eclipse = game.services.has('timeInfo') && game.call('timeInfo')?.weather === 'eclipse';
      if (eclipse || rng.next() < (opts.eliteChance ?? ELITE_CHANCE)) want = true;
    }
    if (want) {
      elite = typeof want === 'string' && AFFIX_IDS.includes(want) ? want : rng.pick(AFFIX_IDS);
      affixes.push(elite);
      if (th.secondAffix) {
        const second = rng.pick(AFFIX_IDS.filter((a) => a !== elite));
        if (second) affixes.push(second);
      }
    }
  }
  const eliteMul = elite ? ELITE_MULT.hp : 1;
  const hp = Math.max(1, Math.round(def.hp * enemyHpScale(n) * th.hp * (opts.hpMult ?? 1) * eliteMul));
  const maxHp = opts.hpAbs ?? hp;
  let speed = def.speed * (opts.speedMult ?? 1);
  let armor = (def.armor ?? 0) + (opts.armorAdd ?? 0);
  let atkRate = 1;
  if (affixes.includes('swift')) { speed *= 1.6; atkRate *= 1.3; }
  if (affixes.includes('plated')) armor += 100;
  const ai = def.aiParams ?? {};
  const e = createEntity(game, {
    type: 'mob', kind, x, y, hp: maxHp, maxHp, radius: def.radius ?? 0.4, facing: 2,
    data: {
      tier: def.tier ?? 1, dmg: def.dmg * th.dmg * (opts.dmgMult ?? 1) * (elite ? ELITE_MULT.dmg : 1), speed, armor, atkRate,
      xp: (def.xp ?? 0) * (opts.xpMult ?? 1) * (elite ? ELITE_MULT.xp : 1), weak: def.weak, resist: def.resist,
      elite, affixes, noLoot: !!opts.noLoot || !!opts.clone, raid: !!opts.raid, natural: !!opts.natural, plotIdx: opts.plotIdx ?? -1,
      home: { x, y }, leash: opts.leash ?? (realm.kind === 'overworld' ? 18 : 40), aggro: opts.aggro ?? 9,
      ai: {}, aiId: def.ai, aiParams: ai, blood: def.blood, fxHit: def.fxHit, dmgBy: {}, spawnedAt: game.now,
      noKnock: affixes.includes('plated') || !!opts.static, static: (def.speed ?? 0) === 0 && def.ai !== 'none' ? true : !!opts.static,
      flying: ['swarm', 'diver', 'kiter', 'teleport_caster', 'phaser'].includes(def.ai) && kind !== 'sleetspitter',
      clone: !!opts.clone, room: opts.room ?? null, owner: opts.owner ?? null, tutorial: !!opts.tutorial, trench: opts.trench ?? 0,
      lootMult: opts.lootMult ?? 1, frontBlock: def.ai === 'guarded_melee' ? (ai.frontBlock ?? 0.8) : 0, glintRange: def.glint,
      lastHurtAt: -99, untargetable: false, team: 'enemy', instance: opts.instance ?? null, stealthBonus: affixes.includes('shrouded') ? 0.5 : 0,
    },
    pub: { el: elite ?? 0, st: 0, tg: 0, iv: affixes.includes('shrouded') ? 2 : 0 },
  });
  if (def.ai === 'none') e.data.static = true;
  realm.add(e);
  game.mobsLive.add(e);
  game.call('aiInit', e);
  if (elite) game.fx(realm, 'elite_aura', x, y, { i: e.id, a: elite });
  return e;
}

// ---------------------------------------------------------------- spawn rules (overworld)

function plotInfo(game, px, py) {
  if (!inPlotBounds(px, py)) return null;
  const idx = plotIndex(px, py);
  const plot = game.world.plots?.[idx];
  if (!plot) return null;
  return { idx, plot, biome: plot.biome ?? biomeOf(px, py), px, py };
}

export function charterOf(game, idx, px, py) {
  const plot = game.world.plots?.[idx];
  if (plot?.charter) return typeof plot.charter === 'string' ? plot.charter : plot.charter.id ?? null;
  for (const src of [game.world.charters, game.worldState?.charters]) {
    if (!src) continue;
    const v = Array.isArray(src) ? src[idx] : src[idx] ?? src[`${px},${py}`];
    if (v) return typeof v === 'string' ? v : v.charter ?? v.id ?? null;
  }
  return null;
}

function structuresOnPlot(realm, px, py, filter) {
  const out = [];
  realm.spatial.queryRect(px * PLOT, py * PLOT, PLOT, PLOT, out);
  return out.filter((e) => e.type === 'structure' && filter(e));
}

export function plotAllowsSpawns(game, realm, px, py) {
  const info = plotInfo(game, px, py);
  if (!info || !info.plot.owned) return false;
  if (info.plot.feature === 'start' || (px === START_PLOT.px && py === START_PLOT.py)) return false;
  if (charterOf(game, info.idx, px, py) === 'garrison') return false;
  const beacons = structuresOnPlot(realm, px, py, (s) => s.kind.startsWith('beacon_') && s.pub.on !== 0);
  if (beacons.length) return false;
  const lamps = structuresOnPlot(realm, px, py, (s) => s.kind === 'lamp');
  if (lamps.length >= 4) return false;
  return true;
}

function lampRadius(game) { return LAMP_RADIUS + (game.stats.world().lampRadius ?? 0); }

function spawnTileOk(game, realm, tx, ty, players, lampR) {
  if (!realm.isWalkable(tx, ty)) return false;
  const g = realm.groundAt(tx, ty);
  if (isWater(g) || g === T.LAVA) return false;
  if (realm.flagsAt(tx, ty) & FLAG.NO_SPAWN) return false;
  const x = tx + 0.5, y = ty + 0.5;
  for (const p of players) if ((p.entity.x - x) ** 2 + (p.entity.y - y) ** 2 < SPAWN_MIN_DIST * SPAWN_MIN_DIST) return false;
  const near = realm.query(x, y, lampR, [], (e) => e.type === 'structure' && (e.kind === 'lamp' || e.kind === 'campfire'));
  if (near.length) return false;
  return true;
}

function shoreTile(realm, tx, ty) {
  for (const [dx, dy] of N4) if (isWater(realm.groundAt(tx + dx, ty + dy))) return true;
  return false;
}

function pickKind(game, biome, night, rng, weather) {
  const b = game.content.biomes.byId[biome];
  if (!b) return null;
  const list = [...(b.mobs?.day ?? []), ...(night ? b.mobs?.night ?? [] : [])];
  const weights = list.map((id) => {
    const d = game.content.enemies.byId[id];
    let w = 1;
    if (d?.night) w = 1.4;
    if (weather === 'fog' && d?.ai === 'ambusher') w *= 2;
    if (weather === 'heatwave' && id === 'mirage_stalker') w *= 2;
    return w;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}

function countNatural(game, realm) {
  const perPlot = new Map();
  let total = 0;
  for (const m of game.mobsLive) {
    if (m.removed || m.realm !== realm.id || !m.data.natural) continue;
    total++;
    perPlot.set(m.data.plotIdx, (perPlot.get(m.data.plotIdx) ?? 0) + 1);
  }
  return { perPlot, total };
}

export function runSpawnRules(game, { force = false } = {}) {
  const realm = game.realms.get('overworld');
  if (!realm) return 0;
  const players = livePlayers(game, 'overworld');
  if (!players.length) return 0;
  const ti = game.services.has('timeInfo') ? game.call('timeInfo') ?? {} : {};
  const night = !!ti.isNight;
  const weather = ti.weather ?? 'clear';
  const rng = game.mobRng;
  const { perPlot } = countNatural(game, realm);
  let spawned = 0;
  const lampR = lampRadius(game);
  const seen = new Set();
  // global cap: sum of per-player caps (6 + 4 * tier of the plot each player stands on)
  let globalCap = 0;
  for (const p of players) {
    const { px, py } = plotOfTile(Math.floor(p.entity.x), Math.floor(p.entity.y));
    globalCap += 6 + 4 * (BIOME_TIER[biomeOf(px, py)] ?? 1);
  }
  let total = 0;
  for (const m of game.mobsLive) if (!m.removed && m.realm === realm.id && (m.data.natural || m.data.raid)) total++;

  for (const p of players) {
    const { px, py } = plotOfTile(Math.floor(p.entity.x), Math.floor(p.entity.y));
    const myTier = BIOME_TIER[biomeOf(px, py)] ?? 1;
    const myCap = 6 + 4 * myTier;
    let nearMe = 0;
    for (const m of game.mobsLive) {
      if (m.removed || m.realm !== realm.id || !(m.data.natural || m.data.raid)) continue;
      if ((m.x - p.entity.x) ** 2 + (m.y - p.entity.y) ** 2 <= (PARTY_RANGE * 1.5) ** 2) nearMe++;
    }
    for (const [dx, dy] of [[0, 0], ...N4]) {
      const qx = px + dx, qy = py + dy;
      if (!inPlotBounds(qx, qy)) continue;
      const idx = plotIndex(qx, qy);
      if (seen.has(idx)) continue;
      seen.add(idx);
      if (!plotAllowsSpawns(game, realm, qx, qy)) continue;
      const due = game.mobSpawnAt.get(idx) ?? (game.now + (night ? 5 : 10));
      if (!game.mobSpawnAt.has(idx)) game.mobSpawnAt.set(idx, due);
      if (!force && game.now < due) continue;
      game.mobSpawnAt.set(idx, game.now + (night ? 10 : 20));
      const plot = game.world.plots[idx];
      const biome = plot.biome ?? biomeOf(qx, qy);
      const tier = BIOME_TIER[biome] ?? 1;
      const plotCap = 2 + tier;
      const onPlot = perPlot.get(idx) ?? 0;
      if (onPlot >= plotCap || nearMe >= myCap || total >= globalCap) continue;
      const kind = pickKind(game, biome, night, rng, weather);
      const def = kind && enemyDef(game, kind);
      if (!def) continue;
      const group = Math.max(1, def.aiParams?.groupSize ?? def.aiParams?.packSize ?? 1);
      const room = Math.min(group, plotCap - onPlot + (group > 1 ? group - 1 : 0), myCap - nearMe, globalCap - total);
      if (room <= 0) continue;
      // find a tile (shamblers prefer the shoreline)
      let spot = null;
      for (let tries = 0; tries < 30 && !spot; tries++) {
        const tx = qx * PLOT + rng.int(1, PLOT - 2), ty = qy * PLOT + rng.int(1, PLOT - 2);
        if (!spawnTileOk(game, realm, tx, ty, players, lampR)) continue;
        if (def.aiParams?.fromWater && tries < 25 && !shoreTile(realm, tx, ty)) continue;
        spot = { x: tx + 0.5, y: ty + 0.5 };
      }
      if (!spot) continue;
      for (let i = 0; i < room; i++) {
        const ox = i === 0 ? 0 : rng.float(-1.2, 1.2), oy = i === 0 ? 0 : rng.float(-1.2, 1.2);
        let x = spot.x + ox, y = spot.y + oy;
        if (!realm.isWalkable(Math.floor(x), Math.floor(y))) { x = spot.x; y = spot.y; }
        const m = spawnMob(game, realm, kind, x, y, { natural: true, plotIdx: idx, rollElite: true, groupId: group > 1 ? spot : null });
        if (m) {
          if (def.aiParams?.fromWater) game.fx(realm, 'footstep_splash', x, y);
          spawned++; total++; nearMe++;
          perPlot.set(idx, (perPlot.get(idx) ?? 0) + 1);
        }
      }
    }
  }
  return spawned;
}

// ---------------------------------------------------------------- despawn

function runDespawn(game) {
  const ti = game.services.has('timeInfo') ? game.call('timeInfo') ?? {} : {};
  for (const m of game.mobsLive) {
    if (m.removed) { game.mobsLive.delete(m); continue; }
    if (!m.data.natural) continue;
    const near = playersNear(game, m.realm, m.x, m.y, DESPAWN_FAR).length > 0;
    if (near) m.data.farSince = null;
    else if (m.data.farSince == null) m.data.farSince = game.now;
    let gone = !near && game.now - m.data.farSince >= DESPAWN_AFTER;
    // night-only enemies sink away after dawn when out of combat
    const def = enemyDef(game, m.kind);
    if (!gone && def?.night && !ti.isNight && game.now - (m.data.lastHurtAt ?? -99) > 10 && !m.data.ai?.target) {
      m.data.dayT = (m.data.dayT ?? 0) + 1;
      if (m.data.dayT > 8) gone = true;
    }
    if (gone) removeMob(game, m, true);
  }
}

export function removeMob(game, m, quiet = false) {
  const realm = game.realms.get(m.realm);
  if (realm && !m.removed) {
    if (!quiet) game.fx(realm, 'summon_puff', m.x, m.y);
    realm.remove(m);
  }
  game.mobsLive.delete(m);
}

// ---------------------------------------------------------------- damage / death hooks (called by combat)

export function onMobDamaged(game, mob, dealt, src, opts) {
  mob.data.ai ||= {};
  if (src && (src.type === 'player' || src.data?.ownerId)) {
    mob.data.ai.provokedBy = src.data?.ownerId ?? src.id;
    mob.data.ai.provokedAt = game.now;
  }
  if (mob.pub.iv === 2 && mob.data.affixes?.includes('shrouded')) { /* stays shrouded; reveal handled by distance */ }
  game.call('aiOnHit', mob, dealt, src);
}

// Kill-XP split (DESIGN 5.2 / CRITIQUE B7): each contributor gets xp * (1 + 0.6 (n - 1)) / n.
export function killXpShare(xp, n) {
  if (n <= 0) return 0;
  return (xp * (1 + KILL_XP_PER_PLAYER * (n - 1))) / n;
}

export function contributorsOf(game, mob) {
  const out = [];
  for (const [pid, dmg] of Object.entries(mob.data.dmgBy ?? {})) {
    if (!(dmg > 0)) continue;
    const p = game.players.get(Number(pid));
    if (!p?.entity || p.entity.realm !== mob.realm) continue;
    if ((p.entity.x - mob.x) ** 2 + (p.entity.y - mob.y) ** 2 > PARTY_RANGE * PARTY_RANGE) continue;
    out.push(p);
  }
  return out;
}

export function onMobKilled(game, mob, killer, src, opts = {}) {
  const realm = game.realms.get(mob.realm);
  if (!realm || mob.data.dead) return;
  mob.data.dead = true;
  const def = enemyDef(game, mob.kind);
  const participants = contributorsOf(game, mob);
  const elite = !!mob.data.elite;
  mob.state = STATE.DEAD;
  clearStatusImpl(game, mob, 'debuffs');
  game.fx(realm, elite ? 'elite_death' : 'enemy_death', mob.x, mob.y - 0.2, { b: mob.data.blood ?? null, k: mob.kind, i: mob.id });

  // archetype / affix death hooks
  game.call('aiOnDeath', mob);
  const affixes = mob.data.affixes ?? [];
  if (affixes.includes('volatile')) {
    const x = mob.x, y = mob.y, dmg = mob.data.dmg * 1.5;
    telegraph(game, realm, { shape: 'circle', x, y, r: 2.5 }, 1.0, (g, R) => {
      shapeHit(g, R, { shape: 'circle', x, y, r: 2.5 }, dmg, { team: 'enemy', knock: 1.2, kx: x, ky: y });
      g.fx(R, 'burn_explode', x, y, { r: 2.5 });
    });
  }
  if (affixes.includes('splitting') && !mob.data.clone) {
    for (let i = 0; i < 2; i++) {
      const a = game.mobRng.float(0, Math.PI * 2);
      const c = spawnMob(game, realm, mob.kind, mob.x + Math.cos(a) * 0.6, mob.y + Math.sin(a) * 0.6, {
        noElite: true, noLoot: true, hpAbs: Math.max(1, Math.round(mob.maxHp * 0.4)), scaleN: 1,
        natural: mob.data.natural, plotIdx: mob.data.plotIdx, room: mob.data.room, instance: mob.data.instance, xpMult: 0,
      });
      if (c) { c.data.xp = 0; c.data.splitCopy = true; }
    }
  }

  // XP: HP-normalised split among contributors in PARTY_RANGE
  if (participants.length && mob.data.xp > 0) {
    const ti = game.services.has('timeInfo') ? game.call('timeInfo') ?? {} : {};
    const nightBonus = realm.kind === 'overworld' && ti.isNight ? NIGHT_KILL_XP : 0;
    const share = killXpShare(mob.data.xp, participants.length);
    for (const p of participants) {
      const extra = nightBonus > 0 ? nightBonus + (game.stats.of(p).nightXp ?? 0) : 0;
      game.call('grantXp', p, Math.max(1, Math.round(share * (1 + extra))), 'kill');
    }
  }

  // Loot: rolled per participant (personal), Glint once into the Treasury
  if (!mob.data.noLoot) {
    const lootRng = game.lootRng;
    const table = def?.loot ?? [];
    const lootPlayers = participants.length ? participants : (mob.data.raid ? playersNear(game, realm.id, mob.x, mob.y, PARTY_RANGE) : []);
    for (const p of lootPlayers) {
      const s = game.stats.of(p);
      const drops = rollTable(table, {
        rand: lootRng.next, mult: yieldMult(s.yieldAll ?? 0, s.yieldMob ?? 0) * (mob.data.lootMult ?? 1) * (mob.data.raid ? 2 : 1),
        luck: (s.luck ?? 0) + (s.luckWorld ?? 0), elite,
      });
      for (const d of drops) {
        // WP14 (BUILD_REVIEW P2-11): 'drop' procs (Jackpot, Golden Tide) see every personal loot stack
        if (game.procs?.fire) { const ctx = { item: d.item, qty: d.qty, source: 'mob' }; game.procs.fire('drop', p, ctx); d.qty = Math.max(0, Math.round(ctx.qty)); if (!d.qty) continue; }
        const a = lootRng.float(0, Math.PI * 2), r = lootRng.float(0.2, 0.8);
        game.call('dropItem', realm, mob.x + Math.cos(a) * r, mob.y + Math.sin(a) * r, d.item, d.qty, { owner: p.id });
      }
    }
    const payer = killer ?? participants[0] ?? null;
    let glint = 0;
    if (mob.data.tutorial) glint = 5;
    else if (payer || mob.data.raid) {
      const s = payer ? game.stats.of(payer) : {};
      glint = mobGlint(mob.data.tier ?? 1, lootRng.next, { elite, glintMob: s.glintMob ?? 0, glintMult: 0 }) /* glintMult is applied once, in land.js addGlint (P2-3) */ * (mob.data.raid ? 2 : 1);
      glint = Math.round(glint * (mob.data.glintMult ?? 1));
    }
    if (glint > 0) {
      game.call('addGlint', glint, 'mob', payer);
      game.fx(realm, 'glint_burst', mob.x, mob.y - 0.3, { g: glint });
    }
  }

  game.bus.emit('mob.killed', { killer, mob, kind: mob.kind, tier: mob.data.tier ?? 1, elite, participants, raid: !!mob.data.raid, instance: mob.data.instance ?? null });
  realm.remove(mob);
  game.mobsLive.delete(mob);
}

// ---------------------------------------------------------------- tutorial spawn (DESIGN 23 step 2)

function onCrafted(game, { player, item }) {
  const def = game.content.items.byId[item];
  if (!player?.entity || def?.cat !== 'weapon' || game.world.flags.tutorial_mossback) return;
  const realm = game.realms.get(player.entity.realm);
  if (!realm || realm.id !== 'overworld') return;
  game.world.flags.tutorial_mossback = true;
  const e = player.entity;
  for (let i = 0; i < 24; i++) {
    const a = game.mobRng.float(0, Math.PI * 2), d = game.mobRng.float(5, 7);
    const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
    if (!realm.isWalkable(Math.floor(x), Math.floor(y)) || isWater(realm.groundAt(Math.floor(x), Math.floor(y)))) continue;
    const m = spawnMob(game, realm, 'mossback', x, y, { tutorial: true, noElite: true, scaleN: 1 });
    if (m) { game.fx(realm, 'summon_puff', x, y); game.toast(player, 'Something stirs in the grass. Hold LMB to fight!', 'warn'); }
    return;
  }
}

export default {
  name: 'mobs',
  init(game) {
    game.mobRng = game.rng.fork('mobs');
    game.lootRng = game.rng.fork('loot');
    game.mobsLive = new Set();
    game.mobSpawnAt = new Map();
    game.services.register('spawnMob', (realm, kind, x, y, opts = {}) => spawnMob(game, realm, kind, x, y, opts || {}));
    game.services.register('runSpawnRules', (opts) => runSpawnRules(game, opts || {}));
    game.services.register('enemyDef', (kind) => enemyDef(game, kind));
    game.bus.on('item.crafted', (ev) => onCrafted(game, ev));
  },
  slowTick(game) {
    runSpawnRules(game);
    runDespawn(game);
  },
};

export { r2 };
