// WP6a tests: levels and XP, Rested and Wake, Tide Card drafts (pick/reroll/banish/skip/fuse, ranks, pity, sets),
// card stats in the sheet, all 64 procs, the skill Chart and unlock flags.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { createEntity } from '../server/game/entities.js';
import { totalXp, xpToNext } from '../shared/rules/xp.js';
import { PROC_IDS, STATS } from '../shared/data/registries.js';
import { cardAtRank } from '../shared/rules/draft.js';
import { content } from '../shared/data/index.js';
import { IMPL } from '../server/game/systems/procs.js';
import { cardState, queueDraft } from '../server/game/systems/cards.js';
import { skillState } from '../server/game/systems/skills.js';

// Harness with deterministic WP5 combat doubles (damage / status / heal) so WP6 logic is tested on its own.
async function rig(players = 1, seed = 11) {
  const h = await createHarness({ seed, players });
  const g = h.game;
  const p = h.player(0);
  const log = { dmg: [], status: [], nodeHits: [], inserts: [] };
  g.services.register('damage', (t, amt, o = {}) => {
    if (!t || t.removed || !(amt > 0)) return 0;
    log.dmg.push({ t, amt, o });
    const d = Math.min(t.hp, amt);
    t.hp -= d;
    if (t.type === 'player') g.bus.emit('player.hurt', { player: g.playerOfEntity(t), source: o.source ?? null, dmg: d });
    else if (t.hp <= 0) {
      g.bus.emit('mob.killed', { killer: o.source ?? null, mob: t, kind: t.kind, tier: 1, elite: false, participants: [] });
      g.realms.get(t.realm)?.remove(t);
    }
    return d;
  });
  g.services.register('applyStatus', (t, id, o = {}) => {
    log.status.push({ t, id, o });
    (t.data.statuses ||= {})[id] = { until: g.now + (o.duration || 0), power: o.power };
    return true;
  });
  g.services.register('hasStatus', (t, id) => (t?.data?.statuses?.[id]?.until ?? 0) > g.now);
  g.services.register('clearStatus', (t, id) => { if (t.data.statuses) delete t.data.statuses[id]; return 1; });
  const realHitNode = g.services.get('hitNode');
  g.services.register('hitNode', (node, dmg, o) => { log.nodeHits.push({ node, dmg, o }); return realHitNode(node, dmg, o); });
  const realInsert = g.services.get('insertInto');
  g.services.register('insertInto', (s, item, qty, o) => { log.inserts.push({ s, item, qty }); return realInsert(s, item, qty, o); });
  const realm = g.realms.get(p.entity.realm);
  const mob = (dx = 1.5, dy = 0, hp = 1000, kind = 'mossback') => {
    const e = createEntity(g, { type: 'mob', kind, x: p.entity.x + dx, y: p.entity.y + dy, hp, radius: 0.4, data: { tier: 1 }, pub: { el: 0, st: 0 } });
    return realm.add(e);
  };
  const node = (dx, dy, kind = 'bentwood_tree', hp = 50) => {
    const tx = Math.floor(p.entity.x + dx), ty = Math.floor(p.entity.y + dy);
    const e = createEntity(g, { type: 'node', kind, x: tx + 0.5, y: ty + 0.5, hp, radius: 0.45, data: { tx, ty, tier: 1 }, pub: { v: 0, big: 0 } });
    return realm.add(e);
  };
  let testProcs = [];
  g.procs.addSource('test', () => testProcs);
  const procs = (list, who = p) => { testProcs = list.map((x, i) => ({ src: 'card', key: 'test:' + i, ...x })); g.procs.invalidate(who); g.stats.invalidate(who); };
  const hit = (t, dmg = 10, crit = false, who = p) => g.bus.emit('mob.hit', { attacker: who.entity, mob: t, dmg, crit, element: 'none' });
  const dmgTo = (t) => log.dmg.filter((x) => x.t === t).reduce((s, x) => s + x.amt, 0);
  const statusOn = (t, id) => log.status.filter((x) => x.t === t && x.id === id);
  const count = (item, who = p) => g.call('countItem', who, item);
  const dropsOf = (item) => [...realm.entities.values()].filter((e) => e.type === 'drop' && e.pub.it === item);
  return { h, g, p, log, realm, mob, node, procs, hit, dmgTo, statusOn, count, dropsOf };
}

const shrineNear = (g, p, kind = 'calling_shrine') => {
  const realm = g.realms.get(p.entity.realm);
  const tx = Math.floor(p.entity.x) + 1, ty = Math.floor(p.entity.y);
  return realm.add(createEntity(g, { type: 'structure', kind, x: tx + 1, y: ty + 1, hp: 100, radius: 1, data: { tx, ty, w: 2, h: 2, owner: p.token }, pub: { rot: 0, own: p.id, on: 1 } }));
};

// ---------------------------------------------------------------- proc cases: every registry id

const PROC_CASES = {
  chill: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'hit', id: 'chill', p: { slow: 0.04, dur: 1.5, max: 5 } }]); const m = mob(); hit(m); ok(statusOn(m, 'chill').length === 1, 'chill applied'); },
  spark: async ({ procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'spark', p: { chance: 1, dmg: 0.4, range: 3 } }]); const a = mob(); const b = mob(2.5, 0); hit(a); ok(dmgTo(b) > 0, 'spark hit the neighbour'); },
  burn: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'hit', id: 'burn', p: { chance: 1, dmg: 0.3, dur: 3 } }]); const m = mob(); hit(m); ok(statusOn(m, 'burn')[0]?.o.power > 0, 'burn with dps'); },
  ricochet: async ({ procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'ricochet', p: { chance: 1, dmg: 0.6 } }]); const a = mob(); const b = mob(3, 0); hit(a, 10); near(dmgTo(b), 6, 1e-6, 'ricochet 60%'); },
  dmg_vs_status: async ({ g, procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'dmg_vs_status', p: { status: 'slow', bonus: 0.5 } }]); const m = mob(); g.call('applyStatus', m, 'slow', { duration: 5 }); hit(m, 10); near(dmgTo(m), 5, 1e-6, 'bonus vs slowed'); const n = mob(0, 2); hit(n, 10); eq(dmgTo(n), 0, 'no bonus without status'); },
  dmg_vs_hp: async ({ procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'dmg_vs_hp', p: { below: 0.3, bonus: 0.5 } }]); const m = mob(); m.hp = 100; m.maxHp = 1000; hit(m, 10); near(dmgTo(m), 5, 1e-6); },
  dmg_per_debuff: async ({ g, procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'dmg_per_debuff', p: { bonus: 0.1 } }]); const m = mob(); g.call('applyStatus', m, 'burn', { duration: 5 }); g.call('applyStatus', m, 'mark', { duration: 5 }); hit(m, 10); near(dmgTo(m), 2, 1e-6, '2 debuffs x 10%'); },
  nth_hit_wave: async ({ procs, mob, hit, log }) => { procs([{ on: 'hit', id: 'nth_hit_wave', p: { n: 2, dmg: 1.2, len: 5 } }]); const m = mob(); hit(m); eq(log.dmg.length, 0); hit(m); ok(log.dmg.some((d) => d.o.knock), 'wave knockback on 2nd hit'); },
  chill_freeze: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'hit', id: 'chill', p: { slow: 0.04, dur: 3, max: 5 } }, { on: 'hit', id: 'chill_freeze', p: { stacks: 3, dur: 2, icd: 8 } }]); const m = mob(); hit(m); hit(m); eq(statusOn(m, 'freeze').length, 0); hit(m); eq(statusOn(m, 'freeze').length, 1, 'frozen at 3 stacks'); for (let i = 0; i < 4; i++) hit(m); eq(statusOn(m, 'freeze').length, 1, 'icd'); },
  projectile_split: async ({ p, g, procs, mob, hit, dmgTo }) => { p.gear.weapon = 'bow_1'; procs([{ on: 'hit', id: 'projectile_split', p: { mult: 0.6 } }]); const a = mob(); const b = mob(3, 0); hit(a, 10); near(dmgTo(b), 6, 1e-6); p.gear.weapon = 'blade_1'; const c = mob(0, 3); const d = mob(0, 5); hit(c, 10); eq(dmgTo(d), 0, 'blades do not split'); },
  chain_extra: async ({ procs, mob, hit, dmgTo }) => { procs([{ on: 'hit', id: 'spark', p: { chance: 1, dmg: 0.4, range: 3 } }, { on: 'hit', id: 'chain_extra', p: { n: 2, mult: 0.7 } }]); const a = mob(); const b = mob(2.5, 0); const c = mob(4.5, 0); const d = mob(6.5, 0); hit(a); ok(dmgTo(b) > 0 && dmgTo(c) > 0 && dmgTo(d) > 0, 'chained twice'); },
  freeze_extend: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'hit', id: 'chill', p: { slow: 0.04, dur: 3, max: 5 } }, { on: 'hit', id: 'chill_freeze', p: { stacks: 1, dur: 2, icd: 1 } }, { on: 'hit', id: 'freeze_extend', p: { dur: 4, bossSlow: 0.3 } }]); const m = mob(); hit(m); eq(statusOn(m, 'freeze')[0].o.duration, 4); const b = mob(0, 2, 5000, 'thornmother'); b.type = 'boss'; hit(b); eq(statusOn(b, 'freeze').length, 0, 'bosses not frozen'); near(statusOn(b, 'slow')[0].o.power, 0.3); },
  burn_stack: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'hit', id: 'burn', p: { chance: 1, dmg: 0.3, dur: 3 } }, { on: 'hit', id: 'burn_stack', p: { max: 5, mult: 1 } }]); const m = mob(); hit(m); hit(m); const s = statusOn(m, 'burn'); eq(s[1].o.stacks, 2); ok(s[1].o.duration > 1000, 'never expires'); near(s[1].o.power, s[0].o.power * 2, 1e-6); },
  stack_buff: async ({ h, g, p, procs, mob, hit }) => { procs([{ on: 'hit', id: 'stack_buff', p: { stat: 'swingSpeed', per: 0.01, max: 5, decay: 3 } }]); const m = mob(); hit(m); hit(m); hit(m); near(g.stats.of(p).swingSpeed, 0.03, 1e-9); h.step(3.5); near(g.stats.of(p).swingSpeed, 0, 1e-9, 'decayed'); },
  periodic_lightning: async ({ h, g, p, procs, mob, hit, dmgTo, log }) => { procs([{ on: 'hit', id: 'periodic_lightning', p: { interval: 2, dmg: 3, range: 0 } }]); const m = mob(); hit(m); eq(dmgTo(m), 0); hit(m); ok(dmgTo(m) > 0, 'every 2nd hit'); procs([{ on: 'tick', id: 'periodic_lightning', p: { interval: 1, dmg: 1, range: 8 } }]); const n = mob(0, 3); h.step(1.2); ok(dmgTo(n) > 0 || dmgTo(m) > 10, 'tick strike'); },
  crit_lightning: async ({ procs, mob, hit, dmgTo }) => { procs([{ on: 'crit', id: 'crit_lightning', p: { dmg: 1, icd: 2 } }]); const m = mob(); hit(m, 10, false); eq(dmgTo(m), 0); hit(m, 10, true); ok(dmgTo(m) > 0); const before = dmgTo(m); hit(m, 10, true); eq(dmgTo(m), before, 'icd'); },
  blind_on_crit: async ({ procs, mob, hit, statusOn }) => { procs([{ on: 'crit', id: 'blind_on_crit', p: { dur: 3 } }]); const m = mob(); hit(m, 10, true); eq(statusOn(m, 'blind').length, 1); },
  surge_on_kill: async ({ g, p, procs, mob }) => { procs([{ on: 'kill', id: 'surge_on_kill', p: { amount: 3 } }]); g.call('addSurge', p, -50); const m = mob(); g.bus.emit('mob.killed', { killer: p.entity, mob: m }); near(p.abState.surge, 53, 1e-6); },
  heal_on_kill: async ({ g, p, procs, mob }) => { procs([{ on: 'kill', id: 'heal_on_kill', p: { pct: 0.05 } }]); p.entity.hp = 10; g.bus.emit('mob.killed', { killer: p.entity, mob: mob() }); near(p.entity.hp, 10 + 0.05 * p.entity.maxHp, 1e-6); },
  heal_orb: async ({ g, p, procs, mob }) => { procs([{ on: 'kill', id: 'heal_orb', p: { chance: 1, pct: 0.1 } }]); p.entity.hp = 10; g.bus.emit('mob.killed', { killer: p.entity, mob: mob() }); ok(p.entity.hp > 10); },
  death_explode: async ({ g, p, procs, mob, dmgTo }) => { procs([{ on: 'kill', id: 'death_explode', p: { status: 'burn', dmg: 0.8, radius: 2 } }]); const a = mob(); const b = mob(2.5, 0); g.call('applyStatus', a, 'burn', { duration: 3 }); g.bus.emit('mob.killed', { killer: p.entity, mob: a }); ok(dmgTo(b) > 0, 'explosion'); },
  kill_stack_perm: async ({ g, p, procs, mob }) => { procs([{ on: 'kill', id: 'kill_stack_perm', p: { per: 0.01, cap: 0.02 } }]); const base = g.stats.of(p).power; for (let i = 0; i < 3; i++) g.bus.emit('mob.killed', { killer: p.entity, mob: mob() }); near(cardState(g, p).apex, 0.02, 1e-9, 'capped'); near(g.stats.of(p).power - base, 0.02, 1e-9); },
  freeze_attacker: async ({ g, p, procs, mob, statusOn }) => { procs([{ on: 'hurt', id: 'freeze_attacker', p: { chance: 1, dur: 1 } }]); const m = mob(); g.bus.emit('player.hurt', { player: p, source: m, dmg: 5 }); eq(statusOn(m, 'freeze').length, 1); },
  burn_attacker: async ({ g, p, procs, mob, statusOn }) => { procs([{ on: 'hurt', id: 'burn_attacker', p: { dmg: 0.3, dur: 3 } }]); const m = mob(1); const far = mob(8); g.bus.emit('player.hurt', { player: p, source: m, dmg: 5 }); g.bus.emit('player.hurt', { player: p, source: far, dmg: 5 }); eq(statusOn(m, 'burn').length, 1); eq(statusOn(far, 'burn').length, 0, 'melee only'); },
  dodge_shield: async ({ g, p, procs, statusOn }) => { procs([{ on: 'dodge', id: 'dodge_shield', p: { pct: 0.04, dur: 3 } }]); g.bus.emit('player.dodge', { player: p }); near(statusOn(p.entity, 'shield')[0].o.power, 0.04 * p.entity.maxHp, 1e-6); },
  dodge_trail: async ({ h, g, p, procs, mob, dmgTo }) => { procs([{ on: 'dodge', id: 'dodge_trail', p: { dmg: 0.6, dur: 2 } }]); const m = mob(0.2, 0); g.bus.emit('player.dodge', { player: p }); h.step(1); ok(dmgTo(m) > 0, 'trail damage'); },
  double_cast: async ({ g, p, procs }) => { procs([{ on: 'cast', id: 'double_cast', p: { interval: 30 } }]); const a = g.procs.fire('cast', p, { mult: 1 }); ok(a.twice && a.free); const b = g.procs.fire('cast', p, { mult: 1 }); ok(!b.twice, 'once per 30 s'); },
  opener: async ({ g, p, procs }) => { procs([{ on: 'cast', id: 'opener', p: { idle: 10, mult: 2 } }]); p.lastHitAt = -100; eq(g.procs.fire('cast', p, { mult: 1 }).mult, 2); p.lastHitAt = g.now; eq(g.procs.fire('cast', p, { mult: 1 }).mult, 1); },
  ability_crit: async ({ g, p, procs }) => { procs([{ on: 'abilityHit', id: 'ability_crit', p: {} }]); ok(g.procs.has(p, 'ability_crit')); },
  ability_pull: async ({ g, p, procs, mob }) => { procs([{ on: 'abilityHit', id: 'ability_pull', p: { dist: 1.5 } }]); const m = mob(4, 0); const x0 = m.x; g.procs.fire('abilityHit', p, { target: m, dmg: 5, x: p.entity.x, y: p.entity.y, castId: 1 }); near(x0 - m.x, 1.5, 1e-6); },
  puddle: async ({ g, p, procs, mob, realm }) => { procs([{ on: 'abilityHit', id: 'puddle', p: { slow: 0.2, dur: 3 } }]); const m = mob(); g.procs.fire('abilityHit', p, { target: m, dmg: 5, x: m.x, y: m.y, castId: 7 }); g.procs.fire('abilityHit', p, { target: m, dmg: 5, x: m.x, y: m.y, castId: 7 }); eq([...realm.entities.values()].filter((e) => e.kind === 'puddle').length, 1, 'one puddle per cast'); },
  ability_echo: async ({ h, g, p, procs, mob, dmgTo }) => { procs([{ on: 'abilityHit', id: 'ability_echo', p: { mult: 0.3, delay: 1 } }]); const m = mob(); g.procs.fire('abilityHit', p, { target: m, dmg: 10, castId: 2 }); eq(dmgTo(m), 0); h.step(1.1); near(dmgTo(m), 3, 1e-6); },
  double_swing: async ({ g, p, procs, node, log }) => { procs([{ on: 'swing', id: 'double_swing', p: { chance: 1 } }]); const n = node(1, 0); g.bus.emit('node.hit', { player: p, node: n, dmg: 2 }); eq(log.nodeHits.length, 1, 'repeated'); },
  wide_swing: async ({ g, p, procs, node, log }) => { procs([{ on: 'swing', id: 'wide_swing', p: { arc: 1.2 } }]); const a = node(1, 0); const b = node(1, 1); g.bus.emit('node.hit', { player: p, node: a, dmg: 2 }); ok(log.nodeHits.some((x) => x.node === b), 'neighbour hit'); },
  nth_swing_shockwave: async ({ g, p, procs, node, mob, dmgTo, log }) => { procs([{ on: 'swing', id: 'nth_swing_shockwave', p: { n: 2, dmg: 2, radius: 3 } }]); const n = node(1, 0); const m = mob(2, 0); g.bus.emit('node.hit', { player: p, node: n, dmg: 1 }); g.tickCount++; eq(log.nodeHits.length, 0); g.bus.emit('node.hit', { player: p, node: n, dmg: 1 }); ok(dmgTo(m) > 0 && log.nodeHits.length > 0, 'shockwave hit both'); },
  splinter: async ({ g, p, procs, node, log }) => { procs([{ on: 'nodeBreak', id: 'splinter', p: { chance: 1, mult: 3, cls: 'wood' } }]); const a = node(1, 0); const b = node(2, 0); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 1, x: a.x, y: a.y }); ok(log.nodeHits.some((x) => x.node === b)); },
  chain_break: async ({ g, p, procs, node, log }) => { procs([{ on: 'nodeBreak', id: 'chain_break', p: { chance: 1, radius: 2, mult: 1.5, cls: 'ore' } }]); const a = node(1, 0, 'copper_vein'); const b = node(2, 0, 'copper_vein'); const c = node(1, 1, 'fieldstone_rock'); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 1, x: a.x, y: a.y }); ok(log.nodeHits.some((x) => x.node === b) && log.nodeHits.some((x) => x.node === c)); },
  windfall: async ({ g, p, procs, node }) => { procs([{ on: 'nodeBreak', id: 'windfall', p: { chance: 1 } }]); const before = g.world.glint; const a = node(1, 0); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 2, x: a.x, y: a.y }); eq(g.world.glint - before, Math.round(2 * 2 * (1 + p.level / 10))); },
  node_bonus_drop: async ({ g, p, procs, node, dropsOf }) => { procs([{ on: 'nodeBreak', id: 'node_bonus_drop', p: { cls: 'ore', item: 'rare_of_tier', chance: 1 } }]); const a = node(1, 0, 'copper_vein'); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 1, x: a.x, y: a.y }); eq(dropsOf('shell').length, 1, 'tier 1 rare'); },
  double_drop: async ({ g, p, procs, node, dropsOf }) => { procs([{ on: 'nodeBreak', id: 'double_drop', p: { chance: 1 } }]); const a = node(1, 0); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 1, x: a.x, y: a.y }); ok(dropsOf('driftwood').length >= 1); },
  node_regrow: async ({ h, g, p, procs, realm }) => { procs([{ on: 'nodeBreak', id: 'node_regrow', p: { chance: 1 } }]); let tx = 0, ty = 0; for (let d = 2; d < 8; d++) { tx = Math.floor(p.entity.x) + d; ty = Math.floor(p.entity.y); if (realm.isWalkable(tx, ty) && !realm.entityAtTile(tx, ty)) break; } g.bus.emit('node.broken', { player: p, node: { realm: realm.id, data: { tx, ty, tier: 1 } }, kind: 'bentwood_tree', tier: 1, x: tx + 0.5, y: ty + 0.5 }); h.step(0.5); ok(realm.entityAtTile(tx, ty, 'node'), 'regrown'); },
  harvest_streak: async ({ g, p, procs, node }) => { procs([{ on: 'nodeBreak', id: 'harvest_streak', p: { n: 2, window: 5, mods: [{ stat: 'swingSpeed', op: 'add', v: 0.3 }], dur: 3 } }]); for (let i = 0; i < 2; i++) { const a = node(1, i, 'marrowberry_bush'); g.bus.emit('node.broken', { player: p, node: a, kind: a.kind, tier: 1, x: a.x, y: a.y }); } near(g.stats.of(p).swingSpeed, 0.3, 1e-9); },
  seed_return: async ({ g, p, procs, count }) => { procs([{ on: 'harvest', id: 'seed_return', p: { chance: 1 } }]); g.bus.emit('crop.harvested', { player: p, crop: 'tidewheat', qty: 2 }); eq(count('seed_tidewheat'), 1); eq(count('tidewheat'), 1); },
  double_catch: async ({ g, p, procs, count }) => { procs([{ on: 'fishCatch', id: 'double_catch', p: { chance: 1 } }]); g.bus.emit('fish.caught', { player: p, fish: 'pebble_minnow', rarity: 'common' }); eq(count('pebble_minnow'), 1); },
  fish_bonus: async ({ g, p, procs, count }) => { procs([{ on: 'fishCatch', id: 'fish_bonus', p: { item: 'pearl', chance: 1 } }]); g.bus.emit('fish.caught', { player: p, fish: 'pebble_minnow' }); eq(count('pearl'), 1); },
  bonus_output: async ({ g, p, procs, count }) => { procs([{ on: 'smelt', id: 'bonus_output', p: { chance: 1 } }]); g.bus.emit('item.crafted', { player: p, item: 'copper_bar', qty: 1, station: 'kiln' }); eq(count('copper_bar'), 1); },
  refund: async ({ g, p, procs, count }) => { procs([{ on: 'craft', id: 'refund', p: { chance: 1 } }]); g.bus.emit('item.crafted', { player: p, item: 'copper_bar', qty: 1, station: 'kiln' }); eq(count('copper_ore'), 1); },
  machine_free: async ({ g, p, procs, log }) => { procs([{ on: 'machineCraft', id: 'machine_free', p: { chance: 1 } }]); const m = { realm: p.entity.realm, x: 1, y: 1, kind: 'autobench_1', data: { owner: p.token } }; g.bus.emit('machine.output', { machine: m, item: 'copper_bar', qty: 1 }); ok(log.inserts.some((x) => x.item === 'copper_ore' && x.qty === 2), 'inputs returned'); },
  kiln_boost: async ({ g, p, procs }) => { procs([{ on: 'smelt', id: 'kiln_boost', p: { bonus: 0.3, dur: 60 } }]); g.bus.emit('item.crafted', { player: p, item: 'copper_bar', qty: 1, station: 'kiln' }); near(g.stats.of(p).kilnSpeed, 0.3, 1e-9); },
  revive: async ({ g, p, procs }) => { procs([{ on: 'death', id: 'revive', p: { hp: 0.4, cd: 600 } }]); g.call('damage', p.entity, 1e6, {}); near(p.entity.hp, 0.4 * p.entity.maxHp, 1e-6); g.call('damage', p.entity, 1e6, {}); eq(p.entity.hp, 0, 'cooldown'); },
  cheat_death: async ({ g, p, procs }) => { procs([{ on: 'death', id: 'cheat_death', p: { cd: 180 } }]); g.call('damage', p.entity, 1e6, {}); eq(p.entity.hp, 1); },
  low_hp_buff: async ({ h, g, p, procs }) => { procs([{ on: 'tick', id: 'low_hp_buff', p: { below: 0.4, mods: [{ stat: 'lifesteal', op: 'add', v: 0.03 }] } }]); p.entity.hp = p.entity.maxHp * 0.3; h.step(0.1); near(g.stats.of(p).lifesteal, 0.03, 1e-9); p.entity.hp = p.entity.maxHp; h.step(0.1); near(g.stats.of(p).lifesteal, 0, 1e-9); },
  burn_spread: async ({ h, g, procs, mob, statusOn }) => { procs([{ on: 'tick', id: 'burn_spread', p: { chance: 1, radius: 2 } }]); const a = mob(); const b = mob(2.5, 0); g.call('applyStatus', a, 'burn', { duration: 5 }); h.step(1.1); ok(statusOn(b, 'burn').length >= 1, 'spread'); },
  auto_swing: async ({ h, procs, node, log }) => { procs([{ on: 'tick', id: 'auto_swing', p: { interval: 0.5, range: 2 } }]); node(1, 0); h.step(0.6); ok(log.nodeHits.length >= 1); },
  inv_smelt: async ({ h, g, p, procs, count }) => { procs([{ on: 'tick', id: 'inv_smelt', p: { interval: 0.5 } }]); g.call('giveItem', p, 'copper_ore', 2); h.step(0.6); eq(count('copper_bar'), 1); eq(count('copper_ore'), 0); },
  shallows_walk: async ({ h, p, procs }) => { procs([{ on: 'tick', id: 'shallows_walk', p: { highTideNodes: false } }]); h.step(0.1); ok(p.walkShallows > 0); },
  aura_slow: async ({ h, g, p, procs, mob, statusOn, dmgTo }) => { procs([{ on: 'tick', id: 'aura_slow', p: { radius: 4, slow: 0.25, novaOnFrozenKill: true } }]); const m = mob(2); h.step(0.6); ok(statusOn(m, 'slow').length >= 1); const f = mob(0, 1); const n = mob(0, 2.5); g.call('applyStatus', f, 'freeze', { duration: 5 }); g.bus.emit('mob.killed', { killer: p.entity, mob: f }); ok(statusOn(n, 'freeze').length === 1, 'nova'); },
  sapling: async ({ h, g, p, procs, realm }) => { procs([{ on: 'tick', id: 'sapling', p: { radius: 6, growth: 0.2, regen: 2 } }]); realm.add(createEntity(g, { type: 'structure', kind: 'sapling', x: p.entity.x + 1, y: p.entity.y, hp: 50, data: { tx: 0, ty: 0, owner: p.token }, pub: { own: p.id } })); p.entity.hp = 10; h.step(1.1); ok(p.entity.hp > 10, 'regen aura'); },
  glint_echo: async ({ h, g, p, procs }) => { procs([{ on: 'tick', id: 'glint_echo', p: { pct: 0.01 } }]); const before = g.world.glint; g.call('addGlint', 1000, 'test', p); h.step(0.1); eq(g.world.glint - before, 1010); },
  companion: async ({ h, g, p, procs, realm }) => { procs([{ on: 'tick', id: 'companion', p: { kind: 'battle_scuttler' } }]); h.step(0.2); ok([...realm.entities.values()].some((e) => e.type === 'summon' && e.pub.own === p.id)); },
  periodic_wave: async ({ h, procs, mob, dmgTo }) => { procs([{ on: 'tick', id: 'periodic_wave', p: { interval: 1, dmg: 1, radius: 3 } }]); const m = mob(2); h.step(1.1); ok(dmgTo(m) > 0); },
  luck_twice: async ({ g, p, procs }) => { procs([{ on: 'drop', id: 'luck_twice', p: {} }]); ok(g.procs.fire('drop', p, { item: 'pearl', qty: 1 }).luckTwice); let n = 0; for (let i = 0; i < 2000; i++) if (g.procs.luckRoll(p, 0.1)) n++; ok(n > 300 && n < 460, 'about 19%: ' + n); },
  jackpot: async ({ g, p, procs }) => { procs([{ on: 'drop', id: 'jackpot', p: { chance: 1, mult: 10 } }]); eq(g.procs.fire('drop', p, { item: 'pearl', qty: 2 }).qty, 20); },
};

export default async function (t) {
  // ------------------------------------------------------------ levels and XP

  t.test('XP thresholds level exactly at totalXp(L) and every level-up heals and announces', async () => {
    const { g, p, h } = await rig();
    let ups = 0;
    g.bus.on('player.levelup', () => ups++);
    g.call('grantXp', p, totalXp(10) - 1, 'test');
    eq(p.level, 9);
    eq(p.xp, xpToNext(9) - 1);
    p.entity.hp = 1;
    g.call('grantXp', p, 1, 'test');
    eq(p.level, 10);
    eq(ups, 9);
    eq(p.entity.hp, g.stats.of(p).maxHp, 'full heal');
    eq(g.stats.of(p).maxHp, 100 + 8 * 9);
    const x = h.sent(p, 'self', 'xp').d;
    eq([x.level, x.xp, x.next], [10, 0, xpToNext(10)]);
    g.call('grantXp', p, totalXp(100), 'test');
    eq(p.level, 100);
    eq(p.xp, 0, 'cap');
  });

  t.test('xpMult is capped at x2.5 and night XP applies', async () => {
    const { g, p } = await rig();
    g.stats.addSource('xptest', () => [{ stat: 'xpMult', op: 'add', v: 5 }]);
    g.stats.invalidate(p);
    eq(g.call('grantXp', p, 100, 'test'), 250);
    g.stats.removeSource('xptest');
    g.services.register('timeInfo', () => ({ isNight: true, phase: 'night' }));
    g.stats.addSource('xptest', () => [{ stat: 'nightXp', op: 'add', v: 0.15 }]);
    eq(g.call('grantXp', p, 100, 'kill'), 140, 'night kill: 1 + 0.15 + 0.25');
  });

  t.test('Wake bonus: more than 5 levels below the party average doubles XP', async () => {
    const { h, g } = await rig(2);
    const [a, b] = [h.player(0), h.player(1)];
    h.setLevel(a, 30);
    g.bus.emit('player.levelup', { player: a, level: 30 });
    ok(b.prog.wake, 'b is waking');
    ok(!a.prog.wake);
    eq(g.call('grantXp', b, 100, 'test'), 200);
    eq(g.call('grantXp', a, 100, 'test'), 100);
    ok(h.sent(b, 'self', 'buffs').d.list.some((x) => x.id === 'wake'));
    h.setLevel(b, 28);
    g.bus.emit('player.levelup', { player: b, level: 28 });
    ok(!b.prog.wake, 'within 5 levels: no Wake');
  });

  t.test('Rested: logging out near a Hammock gives +25% XP, 30 min per 4 h offline, cap 2 h', async () => {
    const { h, g, p } = await rig();
    shrineNear(g, p, 'hammock');
    let wall = 1_000_000;
    g.wallNow = () => wall;
    const token = p.token;
    h.leave(p);
    wall += 8 * 3600 * 1000;
    const p2 = h.addPlayer({ token });
    near(p2.prog.restedS, 3600, 1e-6, '60 min');
    eq(g.call('grantXp', p2, 100, 'test'), 125);
    ok(p2.selfState.buffs.list.some((x) => x.id === 'rested'));
    h.leave(p2);
    wall += 100 * 3600 * 1000;
    const p3 = h.addPlayer({ token });
    eq(p3.prog.restedS, 7200, 'cap 2 h');
  });

  // ------------------------------------------------------------ drafts

  t.test('one draft per level, offers have no duplicates, tokens every 5 levels', async () => {
    const { g, p, h, count } = await rig();
    g.call('grantXp', p, totalXp(11), 'test');
    eq(p.level, 11);
    const st = cardState(g, p);
    eq(st.drafts.length, 10);
    for (const d of st.drafts) { eq(new Set(d.offers).size, d.offers.length); eq(d.offers.length, 3); }
    eq(count('tide_token'), 2, 'levels 5 and 10');
    eq(h.sent(p, 'self', 'cards').d.drafts.length, 10);
  });

  t.test('pick raises rank; rank caps; pending offers stay legal', async () => {
    const { g, p } = await rig();
    h1: {
      const st = cardState(g, p);
      st.owned.c01 = 4;
      st.drafts.push({ id: 900, offers: ['c01', 'c02', 'c03'], minRarity: null, tag: null, source: 'level', rerolls: 0, glintRerolls: 0, sawRare: false });
      st.drafts.push({ id: 901, offers: ['c01', 'c04', 'c05'], minRarity: null, tag: null, source: 'level', rerolls: 0, glintRerolls: 0, sawRare: false });
      const g0 = g.stats.of(p).gatherPower;
      const r = g.handlers.get('card.pick')(g, p, { draft: 900, index: 0 });
      ok(r.ok);
      eq(st.owned.c01, 5);
      near(g.stats.of(p).gatherPower - g0, 0.06, 1e-9);
      ok(!st.drafts.find((d) => d.id === 901).offers.includes('c01'), 'maxed card replaced in pending draft');
      st.drafts.push({ id: 902, offers: ['c01'], minRarity: null, tag: null, source: 'level', rerolls: 0, glintRerolls: 0, sawRare: false });
      eq(g.handlers.get('card.pick')(g, p, { draft: 902, index: 0 }).err, 'full');
      break h1;
    }
  });

  t.test('reroll: token first, then Glint at 50 * level * 2^n; skip gives a token; banish per 10 levels', async () => {
    const { g, p, h, count } = await rig();
    h.setLevel(p, 12);
    g.world.glint = 100000;
    const d = queueDraft(g, p, {});
    g.call('giveItem', p, 'tide_token', 1);
    ok(h.do(p, 'card.reroll', { draft: d.id }).ok);
    eq(count('tide_token'), 0, 'token used');
    let before = g.world.glint;
    ok(h.do(p, 'card.reroll', { draft: d.id }).ok);
    eq(before - g.world.glint, 50 * 12);
    before = g.world.glint;
    ok(h.do(p, 'card.reroll', { draft: d.id }).ok);
    eq(before - g.world.glint, 50 * 12 * 2, 'price doubles');
    g.world.glint = 10;
    eq(h.do(p, 'card.reroll', { draft: d.id }).err, 'cost');
    // banish
    const victim = d.offers[1];
    ok(h.do(p, 'card.banish', { draft: d.id, index: 1 }).ok);
    ok(!d.offers.includes(victim));
    ok(cardState(g, p).banished.includes(victim));
    eq(h.do(p, 'card.banish', { draft: d.id, index: 0 }).err, 'cost', '1 banish at level 12');
    for (let i = 0; i < 30; i++) ok(!queueDraft(g, p, {}).offers.includes(victim), 'banished card never offered');
    // skip
    const n0 = cardState(g, p).drafts.length;
    ok(h.do(p, 'card.skip', { draft: d.id }).ok);
    eq(count('tide_token'), 1);
    eq(cardState(g, p).drafts.length, n0 - 1);
  });

  t.test('pity guarantees a Rare after 5 drafts without one; Mythic limit per 20 levels', async () => {
    const { g, p, h } = await rig();
    h.setLevel(p, 10);
    const st = cardState(g, p);
    st.pity = 5;
    const d = queueDraft(g, p, {});
    ok(d.offers.some((id) => ['rare', 'epic', 'mythic'].includes(content.cards.byId[id].rarity)), 'guaranteed rare');
    g.handlers.get('card.skip')(g, p, { draft: d.id });
    eq(st.pity, 0);
    h.setLevel(p, 39);
    st.drafts = [];
    for (let i = 0; i < 300; i++) queueDraft(g, p, { minRarity: 'mythic' });
    eq(st.drafts.length, 300, 'mythics available at 39 (limit 1)');
    st.owned.m01 = 1;
    st.drafts = [];
    eq(queueDraft(g, p, { minRarity: 'mythic' }), null, 'limit reached: no mythic offered');
  });

  t.test('bonus drafts: first Warden kill Rare+, first Vault clear Uncommon+, once per player', async () => {
    const { g, p } = await rig();
    g.bus.emit('boss.killed', { boss: { kind: 'thornmother' }, kind: 'thornmother', participants: [p], first: true });
    g.bus.emit('boss.killed', { boss: { kind: 'thornmother' }, kind: 'thornmother', participants: [p], first: false });
    g.bus.emit('vault.cleared', { k: 1, participants: [p], first: true });
    const st = cardState(g, p);
    eq(st.drafts.length, 2);
    ok(st.drafts[0].offers.every((id) => ['rare', 'epic', 'mythic'].includes(content.cards.byId[id].rarity)));
    ok(st.drafts[1].offers.every((id) => content.cards.byId[id].rarity !== 'common'));
    eq(skillState(p).bonus.length, 2, 'skill points from Warden and Vault');
  });

  t.test('card fusion: two max Commons of a tag -> Uncommon+ draft of that tag, at the Calling Shrine', async () => {
    const { g, p, h } = await rig();
    h.setLevel(p, 30);
    const st = cardState(g, p);
    st.owned.c01 = 5; st.owned.c02 = 5;
    eq(h.do(p, 'card.fuse', { a: 'c01', b: 'c02' }).err, 'range');
    shrineNear(g, p);
    ok(h.do(p, 'card.fuse', { a: 'c01', b: 'c02' }).ok);
    ok(!st.owned.c01 && !st.owned.c02, 'sacrificed');
    const d = st.drafts.at(-1);
    eq(d.offers.length, 3);
    ok(d.offers.every((id) => content.cards.byId[id].tag === 'gear' && content.cards.byId[id].rarity !== 'common'));
    st.owned.c03 = 5; st.owned.c05 = 5;
    eq(h.do(p, 'card.fuse', { a: 'c03', b: 'c05' }).err, 'invalid', 'different tags');
  });

  t.test('set bonuses activate at 3, 5 and 7 distinct cards of a tag', async () => {
    const { g, p } = await rig();
    const st = cardState(g, p);
    const fang = content.cards.filter((c) => c.tag === 'fang' && !c.mods.some((m) => m.stat === 'power' || m.stat === 'lifesteal' || m.stat === 'eliteDmg'));
    const base = g.stats.of(p);
    for (const c of fang.slice(0, 3)) st.owned[c.id] = 1;
    g.stats.invalidate(p);
    near(g.stats.of(p).power - base.power, 0.05, 1e-9, '3-set');
    for (const c of fang.slice(3, 5)) st.owned[c.id] = 1;
    g.stats.invalidate(p);
    near(g.stats.of(p).lifesteal - base.lifesteal, 0.03 + (st.owned.u05 ? 0.008 : 0), 1e-9, '5-set');
    for (const c of fang.slice(5, 7)) st.owned[c.id] = 1;
    g.stats.invalidate(p);
    ok(Object.keys(st.owned).length >= 7);
    ok(g.stats.of(p).eliteDmg >= 0.15, '7-set');
    // gear 5-set goes to the world sheet
    const gear = content.cards.filter((c) => c.tag === 'gear' && !c.worldMods).slice(0, 5);
    for (const c of gear) st.owned[c.id] = 1;
    g.stats.invalidateWorld();
    near(g.stats.world().machineSpeed, 0.10, 1e-9, 'gear 5-set machines +10%');
  });

  t.test("every card's mods appear in the stat sheet at every rank and respect caps", async () => {
    const { g, p } = await rig();
    const st = cardState(g, p);
    const caps = Object.fromEntries(Object.entries(STATS).map(([k, d]) => [k, d]));
    for (const c of content.cards) {
      for (let rank = 1; rank <= c.max; rank++) {
        for (const k of Object.keys(st.owned)) delete st.owned[k];
        g.stats.invalidate(p);
        const base = g.stats.of(p);
        st.owned[c.id] = rank;
        g.stats.invalidate(p);
        const s = g.stats.of(p);
        const r = cardAtRank(c, rank);
        const sum = {};
        for (const m of r.mods) if (!m.when || m.when === 'day') sum[m.stat] = (sum[m.stat] || 0) + m.v;
        for (const [stat, v] of Object.entries(sum)) {
          let want = base[stat] + v;
          const d = caps[stat];
          if (d?.cap != null) want = d.capMode === 'min' ? Math.max(d.cap, want) : Math.min(d.cap, want);
          if (stat === 'invSlots' || stat === 'dodgeCharges' || stat === 'draftOffers') want = Math.round(want);
          near(s[stat], want, 1e-9, `${c.id} r${rank} ${stat}`);
        }
        for (const f of r.flags || []) ok(s.flags.includes(f), `${c.id} flag ${f}`);
      }
    }
    st.owned = {};
    for (const k of Object.keys(st.owned)) delete st.owned[k];
    // caps: crit chance from cards cannot exceed 0.75
    g.stats.addSource('critflood', () => [{ stat: 'critChance', op: 'add', v: 2 }]);
    g.stats.invalidate(p);
    eq(g.stats.of(p).critChance, 0.75);
  });

  t.test('world card mods: Efficient Design uses the highest rank plus 1% per other holder', async () => {
    const { h, g } = await rig(2);
    const [a, b] = [h.player(0), h.player(1)];
    cardState(g, a).owned.u12 = 3;
    cardState(g, b).owned.u12 = 1;
    g.stats.invalidateWorld();
    near(g.stats.world().machineSpeed, 0.12 + 0.01, 1e-9);
    cardState(g, a).owned.e06 = 2;
    g.stats.invalidateWorld();
    eq(g.stats.world().machineCap, 4);
    near(g.stats.world().fluxUse, -0.3, 1e-9);
  });

  // ------------------------------------------------------------ procs

  t.test('every proc id in the registry has an implementation and a test case', () => {
    for (const id of PROC_IDS) {
      ok(IMPL[id], `implementation for ${id}`);
      ok(PROC_CASES[id], `test case for ${id}`);
    }
    eq(PROC_IDS.length, Object.keys(PROC_CASES).length);
  });

  for (const id of PROC_IDS) {
    t.test(`proc ${id}`, async () => {
      const r = await rig(1, 100 + PROC_IDS.indexOf(id));
      await PROC_CASES[id](r);
    });
  }

  t.test('real content procs are collected from cards, sets, skills and trinkets', async () => {
    const { g, p } = await rig();
    cardState(g, p).owned.r03 = 2;
    skillState(p).owned.push('H2');
    p.gear.trinket1 = 'kiln_ember';
    g.procs.invalidate(p);
    const ids = g.procs.list(p).map((x) => x.id);
    for (const id of ['chill_freeze', 'wide_swing', 'burn']) ok(ids.includes(id), id);
    eq(g.procs.params(p, 'chill_freeze')[0].icd, 6, 'rank 2 of Glacial Core');
  });

  // ------------------------------------------------------------ skills

  t.test('skill rows, costs and gates', async () => {
    const { g, p, h } = await rig();
    h.setLevel(p, 19);
    eq(h.do(p, 'skill.buy', { skill: 'H5' }).err, 'locked', 'row 2 needs 3 row-1 nodes');
    for (const id of ['H1', 'H2', 'H3']) ok(h.do(p, 'skill.buy', { skill: id }).ok, id);
    eq(h.sent(p, 'self', 'skills').d.points, 18 - 3);
    eq(h.do(p, 'skill.buy', { skill: 'H5' }).err, 'locked', 'row 2 needs level 20');
    h.setLevel(p, 20);
    ok(h.do(p, 'skill.buy', { skill: 'H5' }).ok);
    eq(h.sent(p, 'self', 'skills').d.points, 19 - 5);
    eq(h.do(p, 'skill.buy', { skill: 'H5' }).err, 'invalid', 'owned');
    ok(g.stats.of(p).flags.includes('no_shallows_slow'));
    near(g.stats.of(p).yieldWood, 0.15, 1e-9);
    h.setLevel(p, 3);
    eq(h.do(p, 'skill.buy', { skill: 'G1' }).err, 'cost', 'not enough points');
    eq(content.skills.reduce((s, k) => s + k.cost, 0), 120);
  });

  t.test('skill unlock flags reach the world; arrays need every entry; respec at the shrine', async () => {
    const { g, p, h } = await rig(2);
    const b = h.player(1);
    h.setLevel(p, 30);
    ok(!g.call('hasUnlock', content.structures.byId.burrow_1.unlock, b));
    for (const id of ['F1', 'F2', 'F3']) h.do(p, 'skill.buy', { skill: id });
    ok(h.do(p, 'skill.buy', { skill: 'F5' }).ok);
    ok(g.world.flags['skill:F5']);
    ok(g.call('hasUnlock', content.structures.byId.burrow_1.unlock, b), 'world unlock for the other player');
    ok(h.sent(b, 'world', 'unlocks').d['skill:F5']);
    const hop = content.structures.byId.hopper.unlock;
    h.setLevel(b, 20);
    ok(!g.call('hasUnlock', hop, b), 'level:26 also required');
    h.setLevel(b, 26);
    ok(g.call('hasUnlock', hop, b));
    ok(g.call('hasUnlock', 'level:26', b) && !g.call('hasUnlock', 'level:27', b));
    // respec
    g.world.glint = 5000;
    eq(h.do(p, 'skill.respec', {}).err, 'range');
    shrineNear(g, p);
    ok(h.do(p, 'skill.respec', {}).ok);
    eq(g.world.glint, 5000 - 100 * 30);
    ok(!g.world.flags['skill:F5'], 'flag cleared when nobody owns it');
    eq(h.sent(p, 'self', 'skills').d.points, 29);
  });

  t.test('world skill mods and bonus points', async () => {
    const { g, p, h } = await rig();
    h.setLevel(p, 60);
    for (const id of ['F1', 'F2', 'F3', 'F5', 'F6', 'F7', 'F10']) ok(h.do(p, 'skill.buy', { skill: id }).ok, id);
    near(g.stats.world().machineSpeed, 0.2, 1e-9);
    eq(g.stats.world().machineCap, 2);
    ok(g.call('grantSkillPoint', null, 'wing:wing_metal'));
    ok(!g.call('grantSkillPoint', null, 'wing:wing_metal'), 'once');
    eq(h.sent(p, 'self', 'skills').d.points, 59 + 1 - (3 + 6 + 3));
  });

  t.test('cards, skills and progression survive save and reload', async () => {
    const { h, g, p } = await rig();
    g.call('grantXp', p, totalXp(25), 'test');
    const st = cardState(g, p);
    const d = st.drafts[0];
    h.do(p, 'card.pick', { draft: d.id, index: 1 });
    for (const id of ['T1', 'T2']) h.do(p, 'skill.buy', { skill: id });
    const owned = { ...st.owned };
    const pending = st.drafts.map((x) => x.offers.join());
    const token = p.token;
    h.leave(p);
    const h2 = await h.reload();
    const p2 = h2.addPlayer({ token });
    eq(p2.level, 25);
    eq(cardState(h2.game, p2).owned, owned);
    eq(cardState(h2.game, p2).drafts.map((x) => x.offers.join()), pending, 'offers do not re-roll on reconnect');
    eq(skillState(p2).owned, ['T1', 'T2']);
    ok(h2.game.world.flags['skill:T1']);
  });
}
