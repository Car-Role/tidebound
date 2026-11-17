// WP11: the finale (DESIGN 12.3, 16.1 q24). Flow, arena realm, the `drowned_moon` BossScript, victory, credits.
// The boss framework itself (phases, telegraphs, enrage, HP scaling) is WP5's `startBoss`; this file registers the
// `drowned_moon` script (only if no other package registered one) and owns everything around the fight.
//
// Flow: Tidegate stage 5 sets flag `moon:open` -> a player at the gate sends `tidegate.deliver {stage: 6}` ->
// everyone within PARTY_RANGE of the gate descends into realm 'moon' (circular 40x40 sea-floor arena) ->
// 'intro' (cinematic captions, INTRO_S) -> 'fight' (startBoss) -> 'victory' (rewards, VICTORY_S) -> players return
// to the overworld -> 'credits' (clients roll the credits; the Rebirth vote opens, see rebirth.js).
// A wipe (no player left in the arena) resets to 'ready'.
//
// State is published inside world.tidegate.finale = { stage, t, party, beaten, wins, caption } and changes emit the
// internal bus event `finale.changed`.

import { PARTY_RANGE } from '../../../shared/config.js';
import { T } from '../../../shared/grid.js';
import { Realm } from '../realm.js';
import { telemetryGate } from './quests.js';
import { wingsComplete } from './archive.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);
export const MOON_REALM = 'moon';
export const ARENA = 40;
const CX = 20, CY = 20, R_FLOOR = 18;
export const INTRO_S = 8;
export const VICTORY_S = 10;
export const CREDITS_S = 120;
const WIPE_GRACE_S = 3;

const CAPTIONS = {
  intro: [
    'The water parts. The sea floor is dry for the first time in an age.',
    'Something enormous turns over in the dark. It has a face like a tide pool at midnight.',
    'The Drowned Moon rises.',
  ],
  victory: [
    'The Moon breaks apart into a thousand pale shards.',
    'Far above, the tide sighs, and for the first time it does not come back up.',
  ],
};

// ------------------------------------------------------------------ arena

function buildArena(game) {
  // the sea floor, with the water held back in a ring around it
  const realm = new Realm({ id: MOON_REALM, w: ARENA, h: ARENA, kind: 'moon', fill: T.DEEP });
  for (let y = 0; y < ARENA; y++) {
    for (let x = 0; x < ARENA; x++) {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      if (d < R_FLOOR) realm.stamp(x, y, T.SAND, 0);
      else if (d < R_FLOOR + 1.6) realm.stamp(x, y, T.SHALLOW, 0);
    }
  }
  game.realms.set(MOON_REALM, realm);
  return realm;
}

function arenaPlayers(game) {
  const out = [];
  for (const p of game.players.values()) if (p.entity && p.entity.realm === MOON_REALM) out.push(p);
  return out;
}

function alive(p) { return p.entity && p.entity.hp > 0 && p.entity.state !== 4 && p.entity.state !== 5; }

// ------------------------------------------------------------------ boss script (DESIGN 12.3)

function hitPlayers(game, boss, pred, mult = 1, element = 'tide') {
  const def = game.content.bosses.byId.drowned_moon;
  const dmg = (def?.dmg ?? 420) * mult;
  let n = 0;
  for (const p of arenaPlayers(game)) {
    if (!alive(p) || !pred(p.entity)) continue;
    game.call('damage', p.entity, dmg, { source: boss, element });
    n++;
  }
  return n;
}

function pull(game, toX, toY, dist) {
  const realm = game.realms.get(MOON_REALM);
  for (const p of arenaPlayers(game)) {
    if (!alive(p)) continue;
    const e = p.entity;
    const dx = toX - e.x, dy = toY - e.y, d = Math.hypot(dx, dy);
    if (d < 0.5) continue;
    const s = Math.min(dist, d - 0.5);
    const nx = e.x + (dx / d) * s, ny = e.y + (dy / d) * s;
    if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) { realm.move(e, nx, ny); p.body.x = nx; p.body.y = ny; }
  }
}

const targetPos = (boss, target) => {
  const t = target?.entity ?? target;
  return t && Number.isFinite(t.x) ? { x: t.x, y: t.y } : { x: boss.x, y: boss.y + 4 };
};

export const DROWNED_MOON_SCRIPT = {
  phases: [
    { at: 1, moves: ['tidal_lanes', 'shard_rain', 'tether_pylons'] },
    { at: 0.75, moves: ['flood_halves', 'warden_echoes', 'shard_rain'] },
    { at: 0.4167, moves: ['gravity_well', 'ring_waves', 'tidal_lanes'] },
  ],
  moves: {
    // tidal lanes sweep the arena: three horizontal bands
    tidal_lanes: {
      windup: 1.4, cooldown: 7, telegraph: { shape: 'line', len: 36, w: 3 },
      run(game, boss) {
        const lanes = [];
        for (let i = 0; i < 3; i++) lanes.push(CY - 12 + game.rng.int(0, 24));
        for (const ly of lanes) for (let x = 4; x <= 36; x += 4) game.fx(MOON_REALM, 'boss_moon', x, ly);
        hitPlayers(game, boss, (e) => lanes.some((ly) => Math.abs(e.y - ly) < 1.6), 0.9);
      },
    },
    // moon-shard rain: impacts around the target
    shard_rain: {
      windup: 1.1, cooldown: 5, telegraph: { shape: 'circle', r: 2.5 },
      run(game, boss, target) {
        const c = targetPos(boss, target);
        const hits = [c];
        for (let i = 0; i < 5; i++) hits.push({ x: c.x + game.rng.float(-5, 5), y: c.y + game.rng.float(-5, 5) });
        for (const h of hits) game.fx(MOON_REALM, 'moon_shards', h.x, h.y, { small: 1 });
        hitPlayers(game, boss, (e) => hits.some((h) => Math.hypot(e.x - h.x, e.y - h.y) < 2.5), 0.6);
      },
    },
    // tether pylons: the Moon reels the party in along four tethers
    tether_pylons: {
      windup: 1.6, cooldown: 11, telegraph: { shape: 'ring', r: 7 },
      run(game, boss) {
        for (let i = 0; i < 4; i++) game.fx(MOON_REALM, 'spark_chain', boss.x + Math.cos(i * Math.PI / 2) * 7, boss.y + Math.sin(i * Math.PI / 2) * 7);
        pull(game, boss.x, boss.y, 3);
        hitPlayers(game, boss, (e) => Math.hypot(e.x - boss.x, e.y - boss.y) < 7, 0.5, 'hollow');
      },
    },
    // flooded / dry halves alternate (every cast; cooldown 12 s)
    flood_halves: {
      windup: 2, cooldown: 12, telegraph: { shape: 'line', len: 40, w: 20 },
      run(game, boss) {
        boss.data.flood = boss.data.flood ? 0 : 1;
        const left = boss.data.flood === 1;
        for (let y = 4; y <= 36; y += 4) game.fx(MOON_REALM, 'tide_wave', left ? 10 : 30, y);
        hitPlayers(game, boss, (e) => (left ? e.x < CX : e.x >= CX), 1.0);
      },
    },
    // a mini-version of each Warden's signature attack
    warden_echoes: {
      windup: 1.3, cooldown: 6, telegraph: { shape: 'circle', r: 3.5 },
      run(game, boss, target) {
        const echoes = ['boss_thornmother', 'boss_regent', 'boss_kilnheart', 'boss_prismarch', 'boss_antler', 'boss_choir'];
        boss.data.echo = ((boss.data.echo ?? -1) + 1) % echoes.length;
        const c = targetPos(boss, target);
        game.fx(MOON_REALM, echoes[boss.data.echo], c.x, c.y);
        hitPlayers(game, boss, (e) => Math.hypot(e.x - c.x, e.y - c.y) < 3.5, 0.8, ['none', 'tide', 'ember', 'storm', 'frost', 'hollow'][boss.data.echo]);
      },
    },
    // gravity pulls toward the centre
    gravity_well: {
      windup: 1.5, cooldown: 8, telegraph: { shape: 'circle', r: 4 },
      run(game, boss) {
        game.fx(MOON_REALM, 'undertow', CX, CY);
        pull(game, CX, CY, 2.5);
        hitPlayers(game, boss, (e) => Math.hypot(e.x - CX, e.y - CY) < 4, 0.7, 'hollow');
      },
    },
    // expanding ring waves with a gap
    ring_waves: {
      windup: 1.2, cooldown: 6, telegraph: { shape: 'ring', r: 10 },
      run(game, boss) {
        const r = [6, 10, 14][game.rng.int(0, 2)];
        const gap = game.rng.float(0, Math.PI * 2);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          if (Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55) continue;
          game.fx(MOON_REALM, 'boss_moon', boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, { ring: 1 });
        }
        hitPlayers(game, boss, (e) => {
          const d = Math.hypot(e.x - boss.x, e.y - boss.y);
          if (Math.abs(d - r) > 1.5) return false;
          const a = Math.atan2(e.y - boss.y, e.x - boss.x);
          return Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) >= 0.55;
        }, 1.0);
      },
    },
  },
  onPhase(game, boss, i) {
    const names = ['Crescent', 'Half', 'Full'];
    const s = st(game);
    if (s) { s.caption = `The Moon waxes: ${names[i] ?? ''}`; s.captionAt = game.now; emitChange(game); }
    game.fx(MOON_REALM, 'boss_phase', boss.x, boss.y, { phase: i });
  },
};

// ------------------------------------------------------------------ flow

function emitChange(game) { game.bus.emit('finale.changed', { stage: st(game).data.stage }); }

function setStage(game, stage) {
  const s = st(game);
  s.data.stage = stage;
  s.stageAt = game.now;
  s.caption = null;
  emitChange(game);
}

export function finaleView(game) {
  const s = st(game);
  if (!s) return null;
  const capList = CAPTIONS[s.data.stage];
  const t = game.now - (s.stageAt ?? game.now);
  let caption = s.caption && game.now - s.captionAt < 4 ? s.caption : null;
  if (!caption && capList) {
    const per = (s.data.stage === 'intro' ? INTRO_S : VICTORY_S) / capList.length;
    caption = capList[Math.min(capList.length - 1, Math.floor(t / per))];
  }
  return {
    stage: s.data.stage, t: Math.round(t * 10) / 10, party: arenaPlayers(game).map((p) => p.name),
    beaten: !!s.data.beaten, wins: s.data.wins || 0, caption,
    boss: s.boss && !s.boss.removed ? { hp: s.boss.hp, mh: s.boss.maxHp } : null,
  };
}

function gatePoint(game) {
  for (const e of game.realms.get('overworld')?.entities.values() ?? []) {
    if (e.type === 'structure' && e.kind === 'gate_site') return { x: e.x, y: e.y + (e.data?.h ?? 4) / 2 + 1.5 };
  }
  return game.spawnPoint();
}

export function descend(game, player) {
  const s = st(game);
  if (!game.world.flags['moon:open']) return { ok: false, err: 'locked', d: { reason: 'Complete all five Tidegate stages first' } };
  const stage = s.data.stage;
  if (stage === 'victory') return { ok: false, err: 'busy' };
  let realm = game.realms.get(MOON_REALM);
  const fresh = !realm;
  if (!realm) realm = buildArena(game);
  // the party: the requester plus everyone near them in the overworld
  const party = [player];
  if (fresh) {
    for (const p of game.players.values()) {
      if (p === player || !p.entity || p.entity.realm !== player.entity.realm) continue;
      if (Math.hypot(p.entity.x - player.entity.x, p.entity.y - player.entity.y) <= PARTY_RANGE) party.push(p);
    }
  }
  party.forEach((p, i) => {
    const x = CX - (party.length - 1) * 0.75 + i * 1.5, y = CY + 13;
    game.movePlayer(p, MOON_REALM, x, y);
    if (p.body) { p.body.x = x; p.body.y = y; }
  });
  if (fresh) {
    setStage(game, 'intro');
    game.toast(null, `${player.name} leads the descent beneath the Tidegate.`, 'quest');
  }
  game.fx(MOON_REALM, 'waystone_warp', CX, CY + 13);
  return { ok: true, d: { realm: MOON_REALM, party: party.map((p) => p.name) } };
}

function startFight(game) {
  const s = st(game);
  const realm = game.realms.get(MOON_REALM);
  if (!realm) return;
  setStage(game, 'fight');
  s.boss = game.call('startBoss', realm, 'drowned_moon', CX, CY - 4, {}) ?? null;
  if (s.boss) s.boss.data.finale = true;
  game.fx(MOON_REALM, 'boss_moon', CX, CY - 4, { rise: 1 });
  game.toast(null, 'The Drowned Moon rises!', 'warn');
}

function closeArena(game) {
  const s = st(game);
  const realm = game.realms.get(MOON_REALM);
  const back = gatePoint(game);
  for (const p of arenaPlayers(game)) {
    game.movePlayer(p, 'overworld', back.x, back.y);
    if (p.body) { p.body.x = back.x; p.body.y = back.y; }
  }
  if (realm) {
    for (const e of [...realm.entities.values()]) realm.remove(e);
    game.realms.delete(MOON_REALM);
  }
  s.boss = null;
}

function victory(game) {
  const s = st(game);
  if (s.data.stage === 'victory' || s.data.stage === 'credits') return;
  const firstEver = !s.data.beaten;
  s.data.beaten = true;
  s.data.wins = (s.data.wins || 0) + 1;
  game.world.flags['boss:drowned_moon'] = true;
  game.world.flags['moon:beaten'] = true;
  telemetryGate(game, 'final_boss');
  for (const p of arenaPlayers(game)) {
    s.data.runKills[p.token] = true;
    const got = (s.data.crowns ||= []);
    if (!got.includes(p.token)) {
      got.push(p.token);
      game.call('giveItem', p, 'moon_shard_crown', 1);
    }
    game.toast(p, 'The Drowned Moon is broken. +1 skill point, Moon Shard Crown. Moon Shards await at the Turning.', 'quest');
    game.fx(MOON_REALM, 'moon_shards', p.entity.x, p.entity.y);
    game.bus.emit('skillpoint.granted', { player: p, n: 1, source: 'drowned_moon' });
  }
  game.sendWorld('unlocks', game.world.flags);
  setStage(game, 'victory');
  if (firstEver) game.toast(null, 'Moonfall. The world is yours to Turn.', 'quest');
}

// ------------------------------------------------------------------ system

export default {
  name: 'finale',

  init(game) {
    ST.set(game, { data: { stage: 'locked', beaten: false, wins: 0, runKills: {}, crowns: [] }, stageAt: 0, boss: null, wipeAt: null });
    if (!game.services.bossScripts.has('drowned_moon')) game.call('registerBossScript', 'drowned_moon', DROWNED_MOON_SCRIPT);
    const onKill = ({ kind, mob, boss }) => {
      const k = kind ?? mob?.kind ?? boss?.kind;
      const e = boss ?? mob;
      if (k === 'drowned_moon' && (!e || e.realm === MOON_REALM || e.data?.finale)) victory(game);
    };
    game.bus.on('boss.killed', onKill);
    game.bus.on('mob.killed', onKill);
    game.bus.on('tidegate.stage', ({ stage }) => {
      if (stage >= 5 && st(game).data.stage === 'locked') setStage(game, 'ready');
    });
    game.bus.on('rebirth', () => {
      const s = st(game);
      closeArena(game);
      s.data.stage = 'locked';
      s.data.runKills = {};
      s.stageAt = game.now;
      emitChange(game);
    });
    // Extra service (not in 5.5): skill points granted by WP11 sources, for WP6a's point total:
    // 1 per completed Archive wing (world, survives Rebirth) + 1 for this run's Drowned Moon kill.
    game.services.register('extraSkillPoints', (player) => wingsComplete(game) + (player && st(game).data.runKills[player.token] ? 1 : 0));
  },

  load(game, data) {
    const s = st(game);
    const d = data && typeof data === 'object' ? structuredClone(data) : {};
    d.runKills ||= {};
    d.crowns ||= [];
    d.wins ||= 0;
    // an interrupted fight or cinematic resumes at a safe point (instances are not saved)
    if (!['locked', 'ready', 'credits', 'done'].includes(d.stage)) d.stage = d.beaten ? 'credits' : (game.world.flags['moon:open'] ? 'ready' : 'locked');
    if (d.stage === 'locked' && game.world.flags['moon:open']) d.stage = 'ready';
    s.data = d;
    s.stageAt = game.now;
  },

  save(game) { return st(game).data; },

  tick(game) {
    const s = st(game);
    const stage = s.data.stage;
    if (stage === 'intro' && game.now - s.stageAt >= INTRO_S) startFight(game);
    if (stage === 'intro' || stage === 'fight') {
      const living = arenaPlayers(game).filter(alive);
      if (!living.length) {
        s.wipeAt ??= game.now;
        if (game.now - s.wipeAt >= WIPE_GRACE_S) {
          closeArena(game);
          setStage(game, 'ready');
          game.toast(null, 'The party is swept back to the surface. The Drowned Moon sinks into the dark, waiting.', 'warn');
        }
      } else s.wipeAt = null;
      if (stage === 'fight' && s.boss?.removed && !s.data.beaten) victory(game);   // killed by a path that emitted no event
    }
    if (stage === 'victory' && game.now - s.stageAt >= VICTORY_S) {
      closeArena(game);
      setStage(game, 'credits');
      for (const p of game.players.values()) game.sendSelf(p, 'ui', { panel: 'rebirth', mode: 'credits', t: game.now });
    }
    if (stage === 'credits' && game.now - s.stageAt >= CREDITS_S) setStage(game, 'done');
  },

  slowTick(game) {
    const s = st(game);
    if ((s.data.stage === 'intro' || s.data.stage === 'fight' || s.data.stage === 'victory')) emitChange(game);
  },
};

export { victory, closeArena, CAPTIONS };
