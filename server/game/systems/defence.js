// WP5 defence (DESIGN 8.4): Bolt Turret (9 tiles, 40 x plot tier, 2 shots/s), Spike Trap (25 on step, 2 s
// rearm), Arc Spire (chains 400 to 4 enemies every 1.5 s, range 8), Palisade walls with HP. Turrets need power:
// they fire only while switched on, not disabled, and scaled by WP8's machineSpeed (Flux ratio, Tending).
// Also the `disableStructure` service and `raidHitStructure` (raid enemies break walls, disable machines 60 s).

import { BIOME_TIER, biomeOf, plotOfTile } from '../../../shared/grid.js';
import { dealDamage, hostilesInRadius } from './combat.js';
import { spawnProjectile } from './projectiles.js';

const DEF_KINDS = new Set(['bolt_turret', 'arc_spire', 'spike_trap', 'wall']);
const RAID_DISABLE_S = 60;

function track(game, s) { if (s && DEF_KINDS.has(s.kind)) game.defence.add(s); }

function plotTier(x, y) {
  const { px, py } = plotOfTile(Math.floor(x), Math.floor(y));
  return BIOME_TIER[biomeOf(px, py)] ?? 1;
}

function powerFactor(game, s) {
  if (s.pub.on === 0) return 0;
  if (s.data.disabledUntil && game.now < s.data.disabledUntil) return 0;
  if (!game.services.has('machineSpeed')) return 1;
  const v = Number(game.call('machineSpeed', s));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

function nearestEnemy(game, realm, x, y, range) {
  let best = null, bd = Infinity;
  for (const e of hostilesInRadius(game, realm, 'player', x, y, range)) {
    if (e.data?.untargetable) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function tickTurret(game, realm, s, dt) {
  const def = game.content.structures.byId[s.kind];
  const m = def?.machine ?? {};
  const pf = powerFactor(game, s);
  if (pf <= 0) return;
  s.data.cd = (s.data.cd ?? 0) - dt * pf;
  if (s.data.cd > 0) return;
  const range = m.range ?? 9;
  const target = nearestEnemy(game, realm, s.x, s.y, range);
  if (!target) { s.data.cd = 0.25; return; }
  s.data.cd = 1 / Math.max(0.1, m.rate ?? 2);
  if (s.kind === 'arc_spire') {
    // chain lightning: 400 to up to 4 enemies
    const hit = [target];
    let cur = target;
    while (hit.length < (m.chain || 4)) {
      const next = hostilesInRadius(game, realm, 'player', cur.x, cur.y, 4).filter((e) => !hit.includes(e) && !e.data?.untargetable)
        .sort((a, b) => ((a.x - cur.x) ** 2 + (a.y - cur.y) ** 2) - ((b.x - cur.x) ** 2 + (b.y - cur.y) ** 2))[0];
      if (!next) break;
      hit.push(next); cur = next;
    }
    let px = s.x, py = s.y - 1;
    for (const e of hit) {
      game.fx(realm, 'spark_chain', px, py, { x2: Math.round(e.x * 100) / 100, y2: Math.round((e.y - 0.3) * 100) / 100 });
      dealDamage(game, e, m.dmg ?? 400, { source: s, element: 'storm', noProcs: true, tag: 'turret' });
      px = e.x; py = e.y - 0.3;
    }
    s.set('p', 255);
    return;
  }
  const dmg = (m.dmg ?? 40) * (m.dmgPerPlotTier ? plotTier(s.x, s.y) : 1);
  const a = Math.atan2(target.y - s.y, target.x - s.x);
  spawnProjectile(game, realm, {
    kind: 'bolt', x: s.x + Math.cos(a) * 0.5, y: s.y - 0.4 + Math.sin(a) * 0.5, angle: a, speed: 16, range: range + 1,
    dmg, source: s, team: 'player', knock: 0.3, radius: 0.2, noProcs: true,
  });
  s.set('a', Math.round(a * 100) / 100);
  game.fx(realm, 'turret_shot', s.x, s.y - 0.5, { a: Math.round(a * 100) / 100 });
}

function tickTrap(game, realm, s, dt) {
  const def = game.content.structures.byId[s.kind];
  const trap = def?.trap ?? { dmg: 25, rearm: 2 };
  if ((s.data.armAt ?? 0) > game.now) {
    const k = 1 - (s.data.armAt - game.now) / (trap.rearm ?? 2);
    const p = Math.round(Math.max(0, Math.min(1, k)) * 254);
    if (Math.abs((s.pub.p ?? 0) - p) > 40) s.set('p', p);
    return;
  }
  if (s.pub.p !== 255) s.set('p', 255);
  const victims = hostilesInRadius(game, realm, 'player', s.x, s.y, 0.45).filter((e) => e.type === 'mob' && !e.data?.flying);
  if (!victims.length) return;
  for (const v of victims) dealDamage(game, v, trap.dmg ?? 25, { source: s, raw: false, noProcs: true, tag: 'trap' });
  s.data.armAt = game.now + (trap.rearm ?? 2);
  s.set('p', 0);
  game.fx(realm, 'hit_armor', s.x, s.y, { spikes: 1 });
}

// Raid enemies strike the structures in their way: walls lose HP and break, machines are disabled for 60 s.
export function raidHitStructure(game, mob, s) {
  if (!s || s.removed) return;
  const realm = game.realms.get(s.realm);
  const def = game.content.structures.byId[s.kind];
  s.data.raidHitAt = game.now;
  if (s.kind === 'wall' || (def?.cat === 'defence' && !def?.machine && s.kind !== 'spike_trap')) {
    const dmg = Math.max(5, (mob.data?.dmg ?? 10) * 0.5);
    s.hp = Math.max(0, s.hp - dmg);
    game.fx(realm, 'hit_wood', s.x, s.y, { d: Math.round(dmg) });
    if (s.hp <= 0) {
      game.fx(realm, 'break_wood', s.x, s.y);
      game.call('removeStructure', s, {});
      game.defence.delete(s);
    }
    return;
  }
  if (def?.natural || def?.world) return;
  if (game.services.has('disableMachine')) game.call('disableMachine', s, RAID_DISABLE_S);
  else disableStructure(game, s, RAID_DISABLE_S);
  game.fx(realm, 'flux_arc', s.x, s.y, { disabled: 1 });
}

export function disableStructure(game, s, seconds) {
  if (!s || s.removed) return;
  if (s.pub.on !== 0) s.data.reEnable = true;
  s.set('on', 0);
  s.data.disabledUntil = Math.max(s.data.disabledUntil ?? 0, game.now + seconds);
  game.disabled.add(s);
}

export default {
  name: 'defence',
  init(game) {
    game.defence = new Set();
    game.disabled = new Set();
    game.services.register('disableStructure', (s, seconds) => disableStructure(game, s, seconds));
    game.services.register('raidHitStructure', (mob, s) => raidHitStructure(game, mob, s));
    game.bus.on('structure.placed', ({ structure }) => track(game, structure));
    game.bus.on('structure.removed', ({ structure }) => { game.defence.delete(structure); game.disabled.delete(structure); });
  },
  load(game) {
    const realm = game.realms.get('overworld');
    if (realm) for (const e of realm.entities.values()) if (e.type === 'structure') track(game, e);
  },
  tick(game, dt) {
    for (const s of game.defence) {
      if (s.removed) { game.defence.delete(s); continue; }
      const realm = game.realms.get(s.realm);
      if (!realm) continue;
      if (s.kind === 'bolt_turret' || s.kind === 'arc_spire') tickTurret(game, realm, s, dt);
      else if (s.kind === 'spike_trap') tickTrap(game, realm, s, dt);
    }
  },
  slowTick(game) {
    for (const s of game.disabled) {
      if (s.removed) { game.disabled.delete(s); continue; }
      if (game.now >= (s.data.disabledUntil ?? 0)) {
        game.disabled.delete(s);
        s.data.disabledUntil = 0;
        if (s.data.reEnable) { s.data.reEnable = false; s.set('on', 1); }
      }
    }
  },
};
