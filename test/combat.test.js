// WP5 combat tests (TECH_SPEC 14): damage formula, statuses, spawn rules, elites, co-op scaling, kill-XP split,
// all 23 AI archetypes vs a dummy, boss phases / enrage / hard mode, personal loot, Sea Chest, raids, defence.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { systems as allSystems } from '../server/game/systems/index.js';
import { createEntity } from '../server/game/entities.js';
import { STATE } from '../shared/protocol.js';
import { PLOT, PARTY_RANGE } from '../shared/config.js';
import { plotIndex, BIOME_TIER, biomeOf } from '../shared/grid.js';
import { STATUSES, AI_IDS, AFFIX_IDS } from '../shared/data/registries.js';
import { content } from '../shared/data/index.js';
import { killXpShare } from '../server/game/systems/mobs.js';
import { startRaid } from '../server/game/systems/raids.js';

// The clock (weather lightning, night) is left out so fights are deterministic.
const SYSTEMS = allSystems.filter((s) => s.name !== 'clock');
const fresh = (players = 1, seed = 7) => createHarness({ seed, players, systems: SYSTEMS });

function clearMobs(g) {
  for (const m of [...g.mobsLive]) { g.realms.get(m.realm)?.remove(m); g.mobsLive.delete(m); }
  for (const b of [...g.bossesLive]) g.call('endBoss', b, 'reset');
  for (const z of [...g.zoneActive]) { g.realms.get(z.realm)?.remove(z); } g.zoneActive.clear();
  for (const p of [...g.projActive]) { g.realms.get(p.realm)?.remove(p); } g.projActive.clear();
}

function godMode(g, p) { p.entity.hp = p.entity.maxHp; g.call('applyStatus', p.entity, 'invuln', { duration: 0.2 }); }

// open ground near the player for spawning test enemies
function spotNear(g, e, dx, dy) {
  const realm = g.realms.get(e.realm);
  for (let r = 0; r < 6; r++) {
    for (const [ox, oy] of [[dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy], [dy, dx]]) {
      const x = e.x + ox * (1 + r * 0.2), y = e.y + oy * (1 + r * 0.2);
      if (realm.isWalkable(Math.floor(x), Math.floor(y))) return { x, y };
    }
  }
  return { x: e.x + dx, y: e.y + dy };
}

export default async function (t) {
  t.test('damage formula: armor, weak/resist, hollow pierce, crit marker, mark, shield, i-frames', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get(e.realm);
    const s = spotNear(g, e, 3, 0);
    const m = g.call('spawnMob', realm, 'slagback', s.x, s.y, { scaleN: 1, noElite: true, hpAbs: 100000 });   // armor 40, weak frost, resist ember
    m.data.ai.asleep = true;
    const hp0 = m.hp;
    eq(g.call('damage', m, 100, { source: e }), Math.round(100 * 100 / 140), 'armor 40');
    eq(g.call('damage', m, 100, { source: e, element: 'frost' }), Math.round(150 * 100 / 140), 'weak x1.5');
    eq(g.call('damage', m, 100, { source: e, element: 'ember' }), Math.round(50 * 100 / 140), 'resist x0.5');
    eq(g.call('damage', m, 100, { source: e, element: 'hollow' }), Math.round(100 * 100 / 128), 'hollow ignores 30% armor');
    const hc = m.pub.hc ?? 0;
    g.call('damage', m, 10, { source: e, crit: true });
    eq(m.pub.hc, (hc + 1) & 255, 'crit counter published');
    eq(m.pub.hb, e.id, 'attacker published');
    g.call('applyStatus', m, 'mark', { duration: 5, power: 0.5 });
    eq(g.call('damage', m, 100, { source: e, raw: true }), 100, 'raw skips mitigation');
    eq(g.call('damage', m, 140, { source: e }), Math.round(140 * 100 / 140 * 1.5), 'mark +50%');
    g.call('applyStatus', m, 'shield', { duration: 5, power: 30 });
    const before = m.hp;
    g.call('damage', m, 140, { source: e });
    eq(before - m.hp, Math.round(140 * 100 / 140 * 1.5) - 30, 'shield absorbs first');
    ok(m.hp < hp0, 'took damage');
    // player side: dodge i-frames, invuln, dmgTaken
    p.body.dodgeT = 0.2;
    eq(g.call('damage', e, 50, { source: m }), 0, 'dodging ignores the hit');
    p.body.dodgeT = 0;
    eq(g.call('damage', e, 20, { source: m }), 20, 'no armor: full damage');
    g.call('applyStatus', e, 'invuln', { duration: 1 });
    eq(g.call('damage', e, 20, { source: m }), 0, 'invuln');
  });

  t.test('attack action: blade arc, cooldown, bow projectile, staff splash, knockback', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    // open, flat floor (the start plot has the Tidestone and campfire in the way)
    const realm = g.call('createInstance', 'moon', { party: [p] });
    g.movePlayer(p, realm.id, 16, 22);
    const s = { x: 17.2, y: 22 };
    const m = g.call('spawnMob', realm, 'frostbulk', s.x, s.y, { scaleN: 1, noElite: true });
    m.data.ai.asleep = true; m.data.static = true;
    p.gear.weapon = 'blade_3';
    const aim = { ax: Math.round(m.x * 32), ay: Math.round(m.y * 32) };
    const r1 = h.do(p, 'attack', aim);
    ok(r1.ok && r1.d.hits === 1, 'blade hits the mob in the arc: ' + JSON.stringify(r1));
    const r2 = h.do(p, 'attack', aim);
    eq(r2.err, 'cooldown', 'swing rate enforced');
    ok(m.hp < m.maxHp, 'mob damaged');
    // bow
    clearMobs(g);
    const s2 = { x: 21, y: 22 };
    const m2 = g.call('spawnMob', realm, 'frostbulk', s2.x, s2.y, { scaleN: 1, noElite: true });
    m2.data.ai.asleep = true; m2.data.static = true;
    p.gear.weapon = 'bow_3';
    h.step(1);
    const hp = m2.hp;
    ok(h.do(p, 'attack', { ax: Math.round(m2.x * 32), ay: Math.round(m2.y * 32) }).ok, 'bow fires');
    h.step(0.6);
    ok(m2.hp < hp, 'arrow landed');
    // staff splash hits two
    clearMobs(g);
    const a = g.call('spawnMob', realm, 'frostbulk', s2.x, s2.y, { scaleN: 1, noElite: true });
    const b = g.call('spawnMob', realm, 'frostbulk', s2.x, s2.y + 0.8, { scaleN: 1, noElite: true });
    for (const x of [a, b]) { x.data.ai.asleep = true; x.data.static = true; }
    p.gear.weapon = 'staff_3';
    h.step(1.2);
    ok(h.do(p, 'attack', { ax: Math.round(a.x * 32), ay: Math.round(a.y * 32) }).ok, 'staff casts');
    h.step(1);
    ok(a.hp < a.maxHp && b.hp < b.maxHp, 'orb splash hit both');
  });

  t.test('every status applies, publishes its bit and expires; DoTs tick; CC stops acting', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get(e.realm);
    for (const [i, id] of STATUSES.entries()) {
      const s = spotNear(g, e, 6, 0);
      const target = id === 'downed' ? e : g.call('spawnMob', realm, 'frostbulk', s.x, s.y, { scaleN: 1, noElite: true });
      if (target.data.ai) target.data.ai.asleep = true;
      ok(g.call('applyStatus', target, id, { duration: 0.5, power: id === 'shield' ? 50 : undefined }), `${id} applied`);
      ok((target.pub.st & (1 << i)) !== 0, `${id} bit set`);
      h.step(0.7);
      ok(!target.data.status?.[id], `${id} expired`);
      if (id === 'downed') { e.state = STATE.IDLE; e.hp = e.maxHp; }
      else { realm.remove(target); g.mobsLive.delete(target); }
    }
    const s = spotNear(g, e, 6, 0);
    const m = g.call('spawnMob', realm, 'frostbulk', s.x, s.y, { scaleN: 1, noElite: true });
    m.data.ai.asleep = true;
    g.call('applyStatus', m, 'burn', { duration: 2, power: 20 });
    const hp = m.hp;
    h.step(2.1);
    near(hp - m.hp, 40, 1, 'burn 20/s for 2 s');
    for (let k = 0; k < 7; k++) g.call('applyStatus', m, 'chill', { duration: 3, power: 0.1, stacks: 1 });
    eq(m.data.status.chill.n, 5, 'chill stacks cap at 5');
    eq(g.call('clearStatus', m, 'debuffs'), 1, 'clearStatus debuffs');
    g.call('applyStatus', m, 'stun', { duration: 1 });
    ok(m.data.status.stun, 'stunned');
    // players: slow lowers the move-speed stat; freeze immunity flag blocks
    g.call('applyStatus', e, 'slow', { duration: 1, power: 0.4 });
    g.stats.flush();
    ok(g.stats.of(p).moveSpeed < -0.3, 'slow reaches the player stat sheet');
    // bosses convert hard CC into a slow
    const boss = g.call('startBoss', realm, 'thornmother', e.x + 8, e.y, { scaleN: 1 });
    g.call('applyStatus', boss, 'stun', { duration: 2 });
    ok(!boss.data.status?.stun && boss.data.status?.slow, 'bosses are not stunned');
  });

  t.test('spawn rule: player plot + 4 neighbours, owned non-start, caps, lamp/Beacon/Garrison exclusion', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get('overworld');
    // start plot only: nothing spawns
    for (let i = 0; i < 5; i++) g.call('runSpawnRules', { force: true });
    eq(g.mobsLive.size, 0, 'no spawns while only the start plot is owned');
    // raise (5,4) and (6,4); stand on (5,4)
    h.raise(5, 4); h.raise(6, 4); h.raise(5, 5); h.raise(4, 3);
    realm.move(e, 5 * PLOT + 10, 4 * PLOT + 10);
    for (let i = 0; i < 12; i++) g.call('runSpawnRules', { force: true });
    ok(g.mobsLive.size > 0, 'spawns on owned neighbours');
    const allowed = new Set([plotIndex(5, 4), plotIndex(6, 4), plotIndex(5, 5), plotIndex(4, 4), plotIndex(5, 3)]);
    for (const m of g.mobsLive) {
      ok(allowed.has(m.data.plotIdx), 'mob on the player plot or a neighbour');
      ok(m.data.plotIdx !== plotIndex(4, 4), 'never on the start plot');
      ok(m.data.plotIdx !== plotIndex(4, 3), '(4,3) is not adjacent to (5,4)');
    }
    const per = new Map();
    for (const m of g.mobsLive) per.set(m.data.plotIdx, (per.get(m.data.plotIdx) ?? 0) + 1);
    const tier = BIOME_TIER[biomeOf(5, 4)];
    for (const [, n] of per) ok(n <= 2 + tier + 3, 'per-plot cap 2 + tier (groups may round up)');
    ok(g.mobsLive.size <= 6 + 4 * tier, `per-player cap 6 + 4*tier (${g.mobsLive.size})`);
    // flood guard: hammering the rule never exceeds the cap
    for (let i = 0; i < 40; i++) g.call('runSpawnRules', { force: true });
    ok(g.mobsLive.size <= 6 + 4 * tier, 'still capped after 40 forced rolls');
    // exclusions
    clearMobs(g);
    const lamp = (tx, ty) => realm.add(createEntity(g, { type: 'structure', kind: 'lamp', x: tx + 0.5, y: ty + 0.5, data: { tx, ty, w: 1, h: 1 }, pub: { on: 1 } }));
    for (let i = 0; i < 4; i++) lamp(5 * PLOT + 2 + i * 4, 4 * PLOT + 2);
    g.world.charters ||= {};
    g.world.charters['6,4'] = { id: 'garrison' };
    realm.add(createEntity(g, { type: 'structure', kind: 'beacon_1', x: 5 * PLOT + 10.5, y: 5 * PLOT + 10.5, data: { tx: 5 * PLOT + 9, ty: 5 * PLOT + 9, w: 3, h: 3 }, pub: { on: 1 } }));
    for (let i = 0; i < 12; i++) g.call('runSpawnRules', { force: true });
    for (const m of g.mobsLive) {
      ok(![plotIndex(5, 4), plotIndex(6, 4), plotIndex(5, 5)].includes(m.data.plotIdx), 'no spawns on a 4-lamp, Garrison or Beacon plot');
    }
    // a single lamp clears a 6-tile radius
    clearMobs(g);
    g.world.charters = {};
    for (const l of [...realm.entities.values()]) if (l.kind === 'lamp' || l.kind === 'beacon_1') realm.remove(l);
    lamp(5 * PLOT + 10, 4 * PLOT + 10);
    for (let i = 0; i < 20; i++) g.call('runSpawnRules', { force: true });
    for (const m of g.mobsLive) ok(Math.hypot(m.x - (5 * PLOT + 10.5), m.y - (4 * PLOT + 10.5)) > 5.5, 'nothing within 6 of a lamp');
  });

  t.test('elites x4 HP x1.5 dmg and all 6 affixes behave', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get(e.realm);
    const def = content.enemies.byId.rimewolf;
    const at = spotNear(g, e, 4, 0);
    const mk = (affix) => { const m = g.call('spawnMob', realm, 'rimewolf', at.x, at.y, { scaleN: 1, elite: affix }); m.data.ai.asleep = true; return m; };
    for (const a of AFFIX_IDS) {
      const m = mk(a);
      eq(m.pub.el, a, a + ' published');
      eq(m.maxHp, def.hp * 4, a + ' x4 HP');
      near(m.data.dmg, def.dmg * 1.5, 1e-6, a + ' x1.5 dmg');
      realm.remove(m); g.mobsLive.delete(m);
    }
    const swift = mk('swift'); near(swift.data.speed, def.speed * 1.6, 1e-6, 'swift speed'); near(swift.data.atkRate, 1.3, 1e-6, 'swift attack rate');
    const plated = mk('plated'); eq(plated.data.armor, (def.armor ?? 0) + 100, 'plated armor'); ok(plated.data.noKnock, 'plated ignores knockback');
    const shroud = mk('shrouded'); eq(shroud.pub.iv, 2, 'shrouded is hidden'); near(shroud.data.stealthBonus, 0.5, 1e-9, 'first strike +50%');
    // leeching heals 20% of what it deals
    const leech = mk('leeching');
    leech.hp = leech.maxHp - 500;
    const hp = leech.hp;
    const dealt = g.call('damage', e, 50, { source: leech, melee: true });
    near(leech.hp - hp, dealt * 0.2, 1e-6, 'leech heal');
    // splitting: 2 copies at 40% HP, no loot
    clearMobs(g);
    const split = mk('splitting');
    g.call('damage', split, split.hp + 10, { source: e, raw: true });
    const copies = [...g.mobsLive].filter((m) => m.kind === 'rimewolf');
    eq(copies.length, 2, 'two copies');
    for (const c of copies) { near(c.maxHp, def.hp * 4 * 0.4, 2, 'copy at 40%'); ok(c.data.noLoot && !c.data.elite, 'copies: no loot, not elite'); }
    // volatile: telegraphed explosion 1 s after death
    clearMobs(g);
    e.hp = e.maxHp;
    const vol = mk('volatile');
    realm.move(vol, e.x + 1, e.y);
    g.call('damage', vol, vol.hp + 10, { source: e, raw: true });
    const tg = [...realm.entities.values()].find((z) => z.type === 'zone' && z.kind === 'telegraph');
    ok(tg && tg.pub.r === 2.5, 'volatile telegraph r2.5');
    const before = e.hp;
    h.step(1.2);
    ok(e.hp < before, 'volatile blast hurts');
  });

  t.test('co-op HP scaling: x(1 + 0.6(n-1)) within PARTY_RANGE, bosses x(1 + 0.8(n-1))', async () => {
    const h = await fresh(3);
    const g = h.game;
    const [a, b, c] = [h.player(0), h.player(1), h.player(2)];
    const realm = g.realms.get('overworld');
    realm.move(b.entity, a.entity.x + 3, a.entity.y);
    realm.move(c.entity, a.entity.x + PARTY_RANGE + 10, a.entity.y);
    const m = g.call('spawnMob', realm, 'mossback', a.entity.x + 1, a.entity.y, { noElite: true });
    eq(m.maxHp, Math.round(content.enemies.byId.mossback.hp * 1.6), 'two players in range');
    const boss = g.call('startBoss', realm, 'thornmother', a.entity.x + 2, a.entity.y, {});
    eq(boss.maxHp, Math.round(1500 * 1.8), 'boss x1.8 for two');
    realm.move(c.entity, a.entity.x + 5, a.entity.y);
    const m3 = g.call('spawnMob', realm, 'mossback', a.entity.x + 1, a.entity.y, { noElite: true });
    eq(m3.maxHp, Math.round(content.enemies.byId.mossback.hp * 2.2), 'three players in range');
  });

  t.test('kill XP: each contributor gets xp * (1 + 0.6(n-1)) / n; non-contributors get none', async () => {
    eq(killXpShare(100, 1), 100);
    eq(killXpShare(100, 2), 80);
    near(killXpShare(100, 4), 100 * 2.8 / 4, 1e-9);
    const h = await fresh(3);
    const g = h.game;
    const [a, b, c] = [h.player(0), h.player(1), h.player(2)];
    const got = new Map();
    g.services.register('grantXp', (player, amount) => { got.set(player.id, (got.get(player.id) ?? 0) + amount); return amount; });
    const realm = g.realms.get('overworld');
    realm.move(b.entity, a.entity.x + 2, a.entity.y);
    realm.move(c.entity, a.entity.x - 2, a.entity.y);
    const m = g.call('spawnMob', realm, 'slagback', a.entity.x + 1, a.entity.y, { scaleN: 1, noElite: true });
    m.data.ai.asleep = true;
    g.call('damage', m, 30, { source: a.entity, raw: true });
    g.call('damage', m, m.hp + 5, { source: b.entity, raw: true });
    const xp = content.enemies.byId.slagback.xp;
    eq(got.get(a.id), Math.round(xp * 1.6 / 2), 'contributor a');
    eq(got.get(b.id), Math.round(xp * 1.6 / 2), 'contributor b');
    ok(!got.get(c.id), 'bystander gets nothing');
  });

  t.test('all 23 AI archetypes reach and hurt a dummy (support_shield shields its allies)', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get(e.realm);
    const byAi = new Map();
    for (const d of content.enemies) if (!byAi.has(d.ai)) byAi.set(d.ai, d.id);
    eq(byAi.size, AI_IDS.length, 'every archetype has an enemy');
    for (const ai of AI_IDS) ok(g.modules.ai.has(ai), `ai/${ai}.js loaded`);
    const failures = [];
    const home = { x: e.x, y: e.y };
    const alive = () => { if (e.state === STATE.DEAD || e.hp <= 0) g.call('respawnPlayer', p, { realmId: 'overworld', x: home.x, y: home.y }); e.hp = e.maxHp; };
    for (const [ai, kind] of byAi) {
      clearMobs(g);
      alive();
      realm.move(e, home.x, home.y);
      const d0 = ai === 'ambusher' ? 2 : 4;
      const s = spotNear(g, e, d0, 0.5);
      const m = g.call('spawnMob', realm, kind, s.x, s.y, { scaleN: 1, noElite: true });
      if (ai === 'support_shield') {
        const ally = g.call('spawnMob', realm, 'mossback', m.x, m.y, { scaleN: 1, noElite: true });
        let shielded = false;
        for (let i = 0; i < 80 && !shielded; i++) { h.step(0.05); shielded = !!ally.data.status?.shield; e.hp = e.maxHp; }
        if (!shielded) failures.push(ai);
        continue;
      }
      let hurt = 0;
      for (let i = 0; i < 400 && !hurt; i++) {
        const hp = e.hp;
        h.step(0.05);
        if (e.hp < hp) hurt = hp - e.hp;
        if (e.hp < e.maxHp * 0.5 || e.state === STATE.DEAD) alive();
      }
      if (!hurt) failures.push(`${ai}(${kind})`);
      void m;
    }
    eq(failures.join(','), '', 'archetypes that never landed a hit');
  });

  t.test('boss framework: phases at 66/33%, telegraphs >= 0.6 s, 6/8-minute enrage, hard mode', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get(e.realm);
    const b = g.call('startBoss', realm, 'thornmother', e.x + 6, e.y, { scaleN: 1 });
    eq(b.pub.ph, 0);
    g.call('damage', b, b.maxHp * 0.36, { source: e, raw: true });
    h.step(0.1);
    eq(b.pub.ph, 1, 'phase 2 below 66%');
    g.call('damage', b, b.maxHp * 0.32, { source: e, raw: true });
    h.step(0.1);
    eq(b.pub.ph, 2, 'phase 3 below 33%');
    let minWind = Infinity;
    for (let i = 0; i < 300; i++) { godMode(g, p); h.step(0.05); if (b.data.act?.phase === 'windup') minWind = Math.min(minWind, b.data.act.windup); }
    ok(minWind >= 0.6 - 1e-9, 'telegraph windups >= 0.6 s: ' + minWind);
    ok(!b.data.enraged, 'not enraged yet');
    b.data.enrageAt = g.now + 0.01;   // fast-forward the 6-minute clock
    h.step(0.1);
    ok(b.data.enraged && b.pub.en === 1, 'enraged');
    near(g.aiKit.dmg(b), b.data.dmg * 1.5, 1e-6, '+50% damage');
    clearMobs(g);
    const early = g.call('startBoss', realm, 'kilnheart', e.x + 6, e.y, { scaleN: 1 });
    near(early.data.enrageAt - g.now, 360, 0.01, 'Warden 3 enrages at 6 min');
    clearMobs(g);
    const late = g.call('startBoss', realm, 'prismarch', e.x + 6, e.y, { scaleN: 1 });
    near(late.data.enrageAt - g.now, 480, 0.01, 'Warden 4 enrages at 8 min');
    clearMobs(g);
    const hard = g.call('startBoss', realm, 'thornmother', e.x + 6, e.y, { scaleN: 1, hard: true });
    eq(hard.maxHp, 3000, 'hard: +100% HP');
    near(hard.data.dmg, 14 * 1.25, 1e-6, 'hard: +25% damage');
  });

  t.test('every Warden and the Drowned Moon performs every move of its data', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const missing = [];
    for (const def of content.bosses.filter((b) => b.kind !== 'keeper')) {
      clearMobs(g);
      let realm = g.realms.get('overworld');
      if (def.kind === 'final') { realm = g.call('createInstance', 'moon', { party: [p] }); g.movePlayer(p, realm.id, 22, 30); }
      else if (e.realm !== 'overworld') g.movePlayer(p, 'overworld', 90, 90);
      const x = def.kind === 'final' ? 22 : e.x + 5, y = def.kind === 'final' ? 22 : e.y;
      const b = g.call('startBoss', realm, def.id, x, y, { scaleN: 1 });
      ok(b, def.id + ' started');
      const want = new Set(def.moves.flat());
      const did = new Set();
      for (let i = 0; i < 3200 && did.size < want.size; i++) {
        godMode(g, p);
        if (i === 40) for (const m of [...g.bossesLive]) m.data.phase = 2, m.set('ph', 2);
        h.step(0.05);
        for (const m of g.bossesLive) if (m.data.act) did.add(m.data.act.name);
        if (b.data.pylons?.length && i === 60) for (const py of b.data.pylons) g.call('damage', py, 1e9, { raw: true });
      }
      for (const mv of want) if (!did.has(mv)) missing.push(`${def.id}.${mv}`);
      if (def.kind === 'final') { clearMobs(g); g.call('destroyInstance', realm.id); }
    }
    eq(missing.join(','), '', 'moves never used');
  });

  t.test('personal boss loot and first-kill flags', async () => {
    const h = await fresh(2);
    const g = h.game;
    const [a, b] = [h.player(0), h.player(1)];
    const realm = g.realms.get('overworld');
    realm.move(b.entity, a.entity.x + 1, a.entity.y);
    let ev = null;
    g.bus.on('boss.killed', (x) => { ev = x; });
    const boss = g.call('startBoss', realm, 'thornmother', a.entity.x + 4, a.entity.y, {});
    g.call('damage', boss, 100, { source: b.entity, raw: true });
    g.call('damage', boss, boss.hp + 1, { source: a.entity, raw: true });
    ok(ev && ev.first && ev.participants.length === 2, 'boss.killed with both participants, first kill');
    ok(g.world.flags['boss:thornmother'], 'unlock flag set');
    const trophies = [...realm.entities.values()].filter((d) => d.type === 'drop' && d.pub.it === 'trophy_thornmother');
    eq(trophies.length, 2, 'one trophy per participant');
    eq(new Set(trophies.map((d) => d.data.owner)).size, 2, 'owned per player');
  });

  t.test('Warden summon: arena feature, matching Lure, hard mode takes 2', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    g.services.register('featureAt', () => ({ px: 4, py: 4, biome: 'greenmarrow', feature: 'arena', owned: true }));
    eq(h.do(p, 'boss.summon', { lure: 'lure_1' }).err, 'cost', 'needs a Lure');
    h.give(p, 'lure_1', 2);
    const r = h.do(p, 'boss.summon', { lure: 'lure_1', hard: true });
    ok(r.ok, 'summoned ' + JSON.stringify(r));
    eq(g.call('countItem', p, 'lure_1'), 0, 'hard mode consumed 2 Lures');
    const boss = [...g.bossesLive][0];
    ok(boss.data.enc.hard && boss.kind === 'thornmother', 'hard Thornmother');
    eq(h.do(p, 'boss.summon', { lure: 'lure_2' }).err, 'denied', 'wrong biome Lure');
    void e;
  });

  t.test('overworld death: Sea Chest with 50% of materials, respawn after 5 s, owner recovers it', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    h.give(p, 'copper_ore', 10);
    h.give(p, 'blade_1', 1);
    g.call('damage', e, e.hp + 50, { raw: true });
    eq(e.state, STATE.DEAD, 'dead');
    eq(g.call('countItem', p, 'copper_ore'), 5, 'kept half');
    eq(g.call('countItem', p, 'blade_1'), 1, 'gear kept');
    const realm = g.realms.get('overworld');
    const chest = [...realm.entities.values()].find((c) => c.type === 'chest' && c.kind === 'sea_chest');
    ok(chest, 'Sea Chest dropped');
    eq(JSON.stringify(chest.data.items), JSON.stringify([['copper_ore', 5]]));
    h.step(5.2);
    ok(e.state !== STATE.DEAD && e.hp === e.maxHp, 'respawned at full HP');
    realm.move(e, chest.x + 0.5, chest.y);
    ok(h.do(p, 'use', { id: chest.id }).ok, 'opened');
    eq(g.call('countItem', p, 'copper_ore'), 10, 'recovered');
    ok(chest.removed, 'chest gone');
  });

  t.test('downed in an instance; an ally revives within 3 s', async () => {
    const h = await fresh(2);
    const g = h.game;
    const [a, b] = [h.player(0), h.player(1)];
    const realm = g.call('createInstance', 'moon', { party: [a, b] });
    g.movePlayer(a, realm.id, 22, 22); g.movePlayer(b, realm.id, 23, 22);
    g.call('damage', a.entity, a.entity.hp + 10, { raw: true });
    eq(a.entity.state, STATE.DOWN, 'downed, not dead');
    ok(realm.id === a.entity.realm, 'still inside');
    eq(h.do(b, 'revive', { id: a.entity.id }).ok, true);
    h.step(3.2);
    ok(a.entity.state !== STATE.DOWN && a.entity.hp > 0, 'revived by standing beside');
  });

  t.test('raid targets machineClusters()[0] and marches there; repelling it drops keys', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0);
    h.raise(5, 4);
    g.services.register('machineClusters', () => [{ px: 5, py: 4, count: 6 }, { px: 4, py: 4, count: 2 }]);
    g.world.flags['beacon:2'] = true;
    const r = startRaid(g, { delay: 0 });
    ok(r, 'raid started');
    eq(r.target.px, 5); eq(r.target.py, 4);
    h.step(1.2);
    ok(r.mobs.size > 0, 'wave 1 landed');
    for (const m of r.mobs) {
      ok(m.data.raid && m.data.raidGoal, 'raiders have a goal');
      ok(Math.floor(m.data.raidGoal.x / PLOT) === 5 || Math.abs(m.data.raidGoal.x - (5 * PLOT + 10)) <= 3, 'goal is the cluster plot');
    }
    eq(g.worldState.raid.active, true, 'world.raid published');
    // kill every wave
    for (let w = 0; w < 4 && g.raid; w++) {
      for (const m of [...g.raid.mobs]) g.call('damage', m, m.hp + 1, { source: p.entity, raw: true });
      h.step(9);
    }
    ok(!g.raid, 'raid over');
    eq(g.worldState.raid.active, false);
  });

  t.test('defence: bolt turret shoots, spike trap rearms, raid hits disable machines and break walls', async () => {
    const h = await fresh();
    const g = h.game, p = h.player(0), e = p.entity;
    const realm = g.realms.get('overworld');
    const mk = (kind, x, y, extra = {}) => {
      const s = createEntity(g, { type: 'structure', kind, x, y, hp: content.structures.byId[kind]?.hp ?? 100, data: { tx: Math.floor(x), ty: Math.floor(y), w: 1, h: 1 }, pub: { on: 1, ...extra } });
      realm.add(s); g.bus.emit('structure.placed', { player: null, structure: s }); return s;
    };
    const tur = mk('bolt_turret', e.x - 3, e.y);
    const s = spotNear(g, e, 3, 2);
    const m = g.call('spawnMob', realm, 'frostbulk', s.x, s.y, { scaleN: 1, noElite: true });
    m.data.ai.asleep = true; m.data.static = true;
    h.step(1.5);
    ok(m.hp < m.maxHp, 'turret bolts hit');
    void tur;
    const trap = mk('spike_trap', m.x, m.y);
    h.step(0.1);
    eq(trap.pub.p, 0, 'trap fired');
    realm.move(m, m.x + 4, m.y);
    h.step(2.2);
    eq(trap.pub.p, 255, 'trap rearmed');
    const wall = mk('wall', e.x + 6, e.y);
    const hp = wall.hp;
    g.call('raidHitStructure', m, wall);
    ok(wall.hp < hp, 'wall damaged');
    const kiln = mk('kiln', e.x + 7, e.y);
    g.call('raidHitStructure', m, kiln);
    eq(kiln.pub.on, 0, 'machine disabled');
    ok(!kiln.removed, 'never destroyed');
  });
}
