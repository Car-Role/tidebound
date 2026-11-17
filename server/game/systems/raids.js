// WP5 Tidebreak raids (DESIGN 8.4): from Beacon 2 on, each night has a 30% chance of a raid. 3 waves of the
// newest biome's enemies wade ashore at the coast nearest the target and march on machineClusters()[0] (the plot
// with the most machines). Machines they hit are disabled for 60 s (never destroyed); walls can break.
// Raid loot is x2; clearing the last wave drops a Vault key of the newest biome for every defender.

import { PLOT } from '../../../shared/config.js';
import { BIOME_TIER, BIOMES, biomeOf, isWater, N4, plotIndex } from '../../../shared/grid.js';
import { RAIDS } from '../../../shared/data/enemies.js';
import { spawnMob } from './mobs.js';
import { livePlayers, playersNear } from './combat.js';

const WAVE_GAP_S = 45;

function newestBiome(game) {
  let best = 1;
  for (const p of game.world.plots ?? []) if (p.owned) best = Math.max(best, BIOME_TIER[p.biome ?? biomeOf(p.px, p.py)] ?? 1);
  // the biome of the newest lit Beacon also counts
  for (let k = 6; k >= 1; k--) if (game.world.flags['beacon:' + k]) { best = Math.max(best, Math.min(6, k + 1)); break; }
  return BIOMES[Math.min(6, best) - 1];
}

export function raidTarget(game) {
  const clusters = game.services.has('machineClusters') ? game.call('machineClusters') ?? [] : [];
  const c = clusters[0];
  if (c && Number.isFinite(c.px)) return { px: c.px, py: c.py, x: c.px * PLOT + PLOT / 2, y: c.py * PLOT + PLOT / 2, count: c.count ?? 0 };
  // fallback: the owned plot with the most structures
  const realm = game.realms.get('overworld');
  let best = null, bestN = -1;
  for (const p of game.world.plots ?? []) {
    if (!p.owned) continue;
    const out = [];
    realm.spatial.queryRect(p.px * PLOT, p.py * PLOT, PLOT, PLOT, out);
    const n = out.filter((e) => e.type === 'structure').length;
    if (n > bestN) { bestN = n; best = p; }
  }
  if (!best) return null;
  return { px: best.px, py: best.py, x: best.px * PLOT + PLOT / 2, y: best.py * PLOT + PLOT / 2, count: bestN };
}

// Nearest walkable land tile next to water, searching outward from the target.
function shorePoint(game, realm, tx, ty) {
  let best = null, bd = Infinity;
  const R = 34;
  for (let y = Math.max(1, ty - R); y < Math.min(realm.h - 1, ty + R); y += 1) {
    for (let x = Math.max(1, tx - R); x < Math.min(realm.w - 1, tx + R); x += 1) {
      if (!realm.isWalkable(x, y) || isWater(realm.groundAt(x, y))) continue;
      let shore = false;
      for (const [dx, dy] of N4) if (isWater(realm.groundAt(x + dx, y + dy))) { shore = true; break; }
      if (!shore) continue;
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bd && d > 64) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
  }
  return best;
}

function publish(game) {
  const r = game.raid;
  game.sendWorld('raid', r ? { active: true, wave: r.wave, waves: r.waves, px: r.target.px, py: r.target.py, x: r.shore.x, y: r.shore.y, biome: r.biome, left: r.mobs.size, next: r.wave < r.waves ? Math.max(0, Math.round(r.nextWaveAt - game.now)) : null } : { active: false });
}

export function startRaid(game, opts = {}) {
  if (game.raid) return null;
  const realm = game.realms.get('overworld');
  const target = opts.target ?? raidTarget(game);
  if (!realm || !target) return null;
  const shore = opts.shore ?? shorePoint(game, realm, Math.floor(target.x), Math.floor(target.y));
  if (!shore) return null;
  const biome = opts.biome ?? newestBiome(game);
  game.raid = { target, shore, biome, wave: 0, waves: RAIDS.waves ?? 3, nextWaveAt: game.now + (opts.delay ?? 6), mobs: new Set(), defenders: new Set(), startedAt: game.now };
  game.toast(null, 'A Tidebreak raid is coming ashore!', 'warn');
  game.fx(realm, 'raid_horn', shore.x, shore.y, { px: target.px, py: target.py });
  publish(game);
  return game.raid;
}

function spawnWave(game) {
  const r = game.raid;
  const realm = game.realms.get('overworld');
  r.wave++;
  const b = game.content.biomes.byId[r.biome];
  let kinds = [...(b?.mobs?.day ?? [])];
  if (BIOME_TIER[r.biome] === 6) kinds.push('tidewraith');
  kinds = kinds.filter((k) => game.content.enemies.byId[k] && !['magmaw', 'inkmaw', 'prism_sentinel', 'abyss_eye', 'gloom_lantern'].includes(k) || k === 'tidewraith');
  if (!kinds.length) kinds = ['mossback'];
  const players = Math.max(1, livePlayers(game, 'overworld').length);
  const count = 3 + r.wave * 2 + Math.min(4, players - 1);
  const rng = game.mobRng;
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(kinds);
    let x = r.shore.x + rng.float(-2, 2), y = r.shore.y + rng.float(-2, 2);
    if (!realm.isWalkable(Math.floor(x), Math.floor(y))) { x = r.shore.x; y = r.shore.y; }
    const m = spawnMob(game, realm, kind, x, y, { raid: true, rollElite: true, eliteChance: 0.08 + r.wave * 0.04, leash: 0 });
    if (!m) continue;
    m.data.raidGoal = { x: r.target.x + rng.float(-3, 3), y: r.target.y + rng.float(-3, 3) };
    m.data.aggro = 7;
    m.data.leash = 0;
    r.mobs.add(m);
  }
  game.fx(realm, 'tidebreak_wave', r.shore.x, r.shore.y, { wave: r.wave });
  game.toast(null, `Tidebreak wave ${r.wave} of ${r.waves}!`, 'warn');
  r.nextWaveAt = game.now + WAVE_GAP_S;
  publish(game);
}

export function endRaid(game, won) {
  const r = game.raid;
  if (!r) return;
  game.raid = null;
  const realm = game.realms.get('overworld');
  if (won) {
    const k = BIOME_TIER[r.biome] ?? 1;
    const defenders = [...r.defenders].map((id) => game.players.get(id)).filter(Boolean);
    for (const p of defenders.length ? defenders : playersNear(game, 'overworld', r.target.x, r.target.y, 40)) {
      game.call('dropItem', realm, p.entity.x, p.entity.y, 'vault_key_' + k, 1, { owner: p.id });
      game.toast(p, 'The Tidebreak is repelled! A Vault key washes up.', 'good');
    }
    game.bus.emit('raid.ended', { won: true, biome: r.biome, seconds: Math.round(game.now - r.startedAt) });
    game.call('counter', null, 'raids_survived', 1);                    // WP14 (P1-4), world counter
  } else {
    // raiders retreat into the sea
    for (const m of r.mobs) if (!m.removed) { game.fx(realm, 'footstep_splash', m.x, m.y); realm.remove(m); game.mobsLive.delete(m); }
    game.toast(null, 'The Tidebreak recedes with the dawn.', 'info');
    game.bus.emit('raid.ended', { won: false, biome: r.biome });
  }
  publish(game);
}

export default {
  name: 'raids',
  init(game) {
    game.raid = null;
    game.raidRng = game.rng.fork('raids');
    game.services.register('startRaid', (opts) => startRaid(game, opts || {}));
    game.bus.on('clock.phase', ({ phase }) => {
      if (phase === 'night') {
        if (!game.world.flags['beacon:' + (RAIDS.fromBeacon ?? 2)] || game.raid) return;
        if (game.raidRng.next() < (RAIDS.nightChance ?? 0.3)) startRaid(game);
      } else if (phase === 'dawn' || phase === 'day') {
        if (game.raid) endRaid(game, false);
      }
    });
    game.bus.on('mob.killed', ({ mob, participants }) => {
      const r = game.raid;
      if (!r || !r.mobs.has(mob)) return;
      r.mobs.delete(mob);
      for (const p of participants ?? []) r.defenders.add(p.id);
      publish(game);
    });
  },
  slowTick(game) {
    const r = game.raid;
    if (!r) return;
    for (const m of r.mobs) if (m.removed) r.mobs.delete(m);
    if (r.wave < r.waves && (game.now >= r.nextWaveAt || (r.wave > 0 && r.mobs.size === 0 && game.now >= r.nextWaveAt - WAVE_GAP_S + 8))) spawnWave(game);
    else if (r.wave >= r.waves && r.mobs.size === 0) endRaid(game, true);
    else if (game.tickCount % 5 === 0) publish(game);
  },
  save(game) { return {}; },
  load(game) { game.raid = null; },
};

export { plotIndex };
