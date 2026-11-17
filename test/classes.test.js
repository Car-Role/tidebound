// WP6b tests: classes and mastery, all 24 abilities (cast, Surge, cooldowns, unlock levels, upgrades, Signatures,
// Second Calling), gear slots and armour sets, tempering, consumables and buffs, Lures, bombs, regeneration.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { createEntity } from '../server/game/entities.js';
import { masteryTotal } from '../shared/rules/xp.js';
import { content } from '../shared/data/index.js';
import { classState, masteryLevel, slotAbilities } from '../server/game/systems/classes.js';
import { resolveAbility, abState } from '../server/game/systems/abilities.js';
import { temperCost, weaponStats } from '../server/game/systems/gear.js';
import { TEMPER_SUCCESS } from '../shared/rules/constants.js';

async function rig(players = 1, seed = 21) {
  const h = await createHarness({ seed, players });
  const g = h.game;
  const p = h.player(0);
  const log = { dmg: [], status: [] };
  g.services.register('damage', (t, amt, o = {}) => {
    if (!t || t.removed || !(amt > 0)) return 0;
    log.dmg.push({ t, amt, o });
    const d = Math.min(t.hp, amt);
    t.hp -= d;
    if (t.type === 'player') g.bus.emit('player.hurt', { player: g.playerOfEntity(t), source: o.source ?? null, dmg: d });
    else if (t.hp <= 0) { g.bus.emit('mob.killed', { killer: o.source ?? null, mob: t, kind: t.kind }); g.realms.get(t.realm)?.remove(t); }
    return d;
  });
  g.services.register('applyStatus', (t, id, o = {}) => { log.status.push({ t, id, o }); (t.data.statuses ||= {})[id] = { until: g.now + (o.duration || 0) }; return true; });
  g.services.register('hasStatus', (t, id) => (t?.data?.statuses?.[id]?.until ?? 0) > g.now);
  g.services.register('clearStatus', () => 0);
  const realm = g.realms.get(p.entity.realm);
  const home = { x: p.entity.x, y: p.entity.y };
  const mob = (dx = 2, dy = 0, hp = 1e6) => realm.add(createEntity(g, { type: 'mob', kind: 'mossback', x: home.x + dx, y: home.y + dy, hp, radius: 0.4, data: { tier: 1 }, pub: { el: 0, st: 0 } }));
  const node = (dx, dy, kind = 'bentwood_tree') => {
    const tx = Math.floor(home.x + dx), ty = Math.floor(home.y + dy);
    return realm.add(createEntity(g, { type: 'node', kind, x: tx + 0.5, y: ty + 0.5, hp: 1e6, radius: 0.45, data: { tx, ty, tier: 1 }, pub: { v: 0, big: 0 } }));
  };
  const structure = (kind, dx = 1, dy = 0) => {
    const tx = Math.floor(home.x + dx), ty = Math.floor(home.y + dy);
    return realm.add(createEntity(g, { type: 'structure', kind, x: tx + 1, y: ty + 1, hp: 100, radius: 1, data: { tx, ty, w: 2, h: 2, owner: p.token }, pub: { rot: 0, own: p.id, on: 1 } }));
  };
  const goHome = (who = p) => { realm.move(who.entity, home.x, home.y); who.body.x = home.x; who.body.y = home.y; };
  const dmgTo = (t) => log.dmg.filter((x) => x.t === t).reduce((s, x) => s + x.amt, 0);
  const slotOf = (item, who = p) => who.inv.slots.findIndex((s) => s && s[0] === item);
  return { h, g, p, log, realm, home, mob, node, structure, goHome, dmgTo, slotOf };
}

const aimAt = (e) => ({ ax: Math.round(e.x * 32), ay: Math.round(e.y * 32) });

export default async function (t) {
  t.test('class select: level 10, at the Calling Shrine, 10-minute switch cooldown, passive in the sheet', async () => {
    const { h, g, p, structure } = await rig();
    h.setLevel(p, 9);
    eq(h.do(p, 'class.choose', { class: 'bulwark' }).err, 'locked');
    h.setLevel(p, 10);
    eq(h.do(p, 'class.choose', { class: 'bulwark' }).err, 'range');
    structure('calling_shrine');
    const hp0 = g.stats.of(p).maxHp;
    ok(h.do(p, 'class.choose', { class: 'bulwark' }).ok);
    near(g.stats.of(p).maxHp, hp0 * 1.2, 1e-6);
    eq(g.stats.of(p).armor, 20);
    eq(g.stats.of(p).threat, 2);
    eq(p.entity.pub.cl, 'bulwark');
    ok(h.do(p, 'class.choose', { class: 'squallblade' }).ok, 'first switch is free');
    eq(h.do(p, 'class.choose', { class: 'prospector' }).err, 'cooldown');
    h.step(601);
    ok(h.do(p, 'class.choose', { class: 'prospector' }).ok);
    ok(g.stats.of(p).flags.includes('gem_spawn_boost'));
    near(g.stats.of(p).yieldAll, 0.10, 1e-9);
    eq(h.sent(p, 'self', 'class').d.id, 'prospector');
  });

  for (const cls of content.classes) {
    t.test(`all four ${cls.name} abilities cast, cost Surge and respect cooldowns`, async () => {
      const r = await rig(2, 31 + content.classes.indexOf(cls));
      const { h, g, p, mob, node, goHome, log, realm } = r;
      h.setLevel(p, 60);
      classState(p).id = cls.id;
      g.stats.invalidate(p);
      const m1 = mob(2, 0), m2 = mob(3, 1), m3 = mob(1, -2);
      node(-1, 1); node(1, 2);
      for (let slot = 0; slot < 4; slot++) {
        goHome();
        const def = content.abilities.byId[cls.abilities[slot]];
        const st = abState(p);
        const max = g.stats.of(p).maxSurge;
        st.surge = max;
        const nDmg = log.dmg.length, nEnt = realm.entities.size, nBuffs = p.buffs?.size ?? 0;
        const res = h.do(p, 'ability.cast', { slot, ...aimAt(m1) });
        ok(res.ok, `${def.id} cast: ${JSON.stringify(res)}`);
        near(st.surge, max - def.surge, 1e-6, `${def.id} costs ${def.surge} Surge`);
        eq(h.do(p, 'ability.cast', { slot, ...aimAt(m1) }).err, 'cooldown', `${def.id} cooldown`);
        h.step(1.5);
        const did = log.dmg.length > nDmg || realm.entities.size !== nEnt || (p.buffs?.size ?? 0) !== nBuffs || st.mem[def.id] != null;
        ok(did, `${def.id} had an effect`);
        h.step(def.cd + 1);
        ok(h.do(p, 'ability.cast', { slot, ...aimAt(m1) }).ok || def.id === 'riptide_mark', `${def.id} ready after its cooldown`);
        h.step(0.5);
      }
      ok(m1.hp < 1e6 || m2.hp < 1e6 || m3.hp < 1e6, 'enemies took damage');
      const cd = h.sent(p, 'self', 'cooldowns').d;
      ok(Object.keys(cd.list).length === 4, 'cooldowns sent for the 4 abilities');
    });
  }

  t.test('abilities unlock at levels 10 / 20 / 35 / 60', async () => {
    const { h, g, p, mob } = await rig();
    classState(p).id = 'brinesinger';
    const m = mob();
    for (const [lv, open] of [[9, 0], [10, 1], [20, 2], [35, 3], [60, 4]]) {
      h.setLevel(p, lv);
      const slots = slotAbilities(g, p);
      eq(slots.slice(0, 4).filter((s) => s.unlocked).length, open, `level ${lv}`);
    }
    h.setLevel(p, 34);
    eq(h.do(p, 'ability.cast', { slot: 2, ...aimAt(m) }).err, 'locked');
    h.setLevel(p, 35);
    ok(h.do(p, 'ability.cast', { slot: 2, ...aimAt(m) }).ok);
  });

  t.test('mastery: 600 * m^2 per level from XP while active; upgrades at 10 (Q/E) and 20 (R/F); +1% primary', async () => {
    const { h, g, p, mob, realm } = await rig();
    h.setLevel(p, 60);
    classState(p).id = 'bulwark';
    g.call('grantXp', p, masteryTotal(10) - 1, 'test');
    eq(masteryLevel(p, 'bulwark'), 9);
    eq(masteryLevel(p, 'squallblade'), 0, 'only the active class');
    g.call('grantXp', p, 1, 'test');
    eq(masteryLevel(p, 'bulwark'), 10);
    const def = (id) => content.abilities.byId[id];
    ok(resolveAbility(g, p, def('breakwater')).up && resolveAbility(g, p, def('anchor_slam')).up);
    ok(!resolveAbility(g, p, def('rally_horn')).up);
    g.stats.invalidate(p);
    const hpWith = g.stats.of(p).maxHp;
    classState(p).mastery.bulwark = 0;
    g.stats.invalidate(p);
    near(hpWith / g.stats.of(p).maxHp, 1.1, 1e-9, 'mastery 10 = +10% max HP');
    classState(p).mastery.bulwark = masteryTotal(20);
    ok(resolveAbility(g, p, def('unmoored')).up);
    eq(resolveAbility(g, p, def('unmoored')).params.dur, 14);
    // Upgraded Anchor Slam leaves a crater
    const m = mob(3, 0);
    ok(h.do(p, 'ability.cast', { slot: 1, ...aimAt(m) }).ok);
    ok([...realm.entities.values()].some((e) => e.type === 'zone' && e.kind === 'crater'), 'crater');
    eq(masteryTotal(10), 231000);
    eq(masteryTotal(20), 1722000);
  });

  t.test('Signatures: one pick each at levels 70, 80 and 90, from the current class', async () => {
    const { h, g, p, mob, realm, goHome } = await rig();
    classState(p).id = 'squallblade';
    h.setLevel(p, 69);
    eq(h.do(p, 'ability.signature', { ability: 'gale_step' }).err, 'locked');
    h.setLevel(p, 70);
    eq(h.do(p, 'ability.signature', { ability: 'breakwater' }).err, 'invalid', 'other class');
    ok(h.do(p, 'ability.signature', { ability: 'gale_step' }).ok);
    eq(h.do(p, 'ability.signature', { ability: 'tempest' }).err, 'locked');
    h.setLevel(p, 80);
    ok(h.do(p, 'ability.signature', { ability: 'tempest' }).ok);
    eq(h.do(p, 'ability.signature', { ability: 'tempest' }).err, 'invalid', 'no repeats');
    eq(h.sent(p, 'self', 'sig').d.squallblade, ['gale_step', 'tempest']);
    goHome();
    const m = mob(4, 0);
    ok(h.do(p, 'ability.cast', { slot: 0, ...aimAt(m) }).ok);
    ok([...realm.entities.values()].some((e) => e.kind === 'wind_wall'), 'signature wind wall');
    // picks are per class
    classState(p).id = 'bulwark';
    ok(h.do(p, 'ability.signature', { ability: 'anchor_slam' }).ok);
    eq(classState(p).sig.bulwark, ['anchor_slam']);
  });

  t.test('Second Calling: the first two abilities of a second class on Z / X', async () => {
    const { h, g, p, structure, mob } = await rig();
    h.setLevel(p, 60);
    structure('calling_shrine');
    ok(h.do(p, 'class.choose', { class: 'greenwarden' }).ok);
    eq(h.do(p, 'class.choose', { class: 'brinesinger', second: true }).err, 'locked');
    g.stats.addFlagSource('t9', () => ['second_calling']);
    g.stats.invalidate(p);
    eq(h.do(p, 'class.choose', { class: 'greenwarden', second: true }).err, 'invalid', 'not the primary');
    ok(h.do(p, 'class.choose', { class: 'brinesinger', second: true }).ok);
    const slots = slotAbilities(g, p);
    eq(slots.map((s) => s.ability), ['thornlash', 'quickgrow', 'sproutling', 'verdant_tide', 'brine_bolt', 'undertow']);
    const m = mob(3, 0);
    ok(h.do(p, 'ability.cast', { slot: 4, ...aimAt(m) }).ok, 'Z casts Brine Bolt');
    ok(m.hp < 1e6);
  });

  t.test('Riptide (T10) lets abilities crit; Leviathan\'s Call casts twice for free', async () => {
    const { h, g, p, mob, log } = await rig();
    h.setLevel(p, 60);
    classState(p).id = 'brinesinger';
    g.procs.addSource('t', () => [{ on: 'abilityHit', id: 'ability_crit', p: {}, key: 't:c' }, { on: 'cast', id: 'double_cast', p: { interval: 30 }, key: 't:d' }]);
    g.stats.addSource('crit', () => [{ stat: 'critChance', op: 'add', v: 1 }]);
    g.procs.invalidate(p); g.stats.invalidate(p);
    g.procs.rng.next = () => 0.1;
    const m = mob(3, 0);
    const s0 = abState(p).surge = 130;
    ok(h.do(p, 'ability.cast', { slot: 0, ...aimAt(m) }).ok);
    eq(abState(p).surge, s0, 'free');
    h.step(0.5);
    const hits = log.dmg.filter((x) => x.t === m && x.o.ability);
    eq(hits.length, 2, 'cast twice');
    ok(hits.every((x) => x.o.crit), 'crits');
  });

  t.test('class passive discounts never apply to world structures', async () => {
    const { h, g, p } = await rig();
    classState(p).id = 'gearwright';
    g.stats.invalidate(p);
    near(g.call('structureDiscount', p, 'workbench'), 0.10, 1e-9);
    const world = content.structures.find((s) => s.world);
    ok(world, 'a world structure exists');
    eq(g.call('structureDiscount', p, world.id), 0);
  });

  t.test('equip slots, armour stats and 3-piece set bonuses; trinkets; packs resize the inventory', async () => {
    const { h, g, p, slotOf } = await rig();
    const s0 = g.stats.of(p);
    for (const id of ['helm_1', 'coat_1', 'boots_1']) { h.give(p, id, 1); ok(h.do(p, 'gear.equip', { slot: slotOf(id) }).ok, id); }
    let s = g.stats.of(p);
    eq(s.armor - s0.armor, 21);
    eq(s.maxHp - s0.maxHp, 38);
    near(s.moveSpeed - s0.moveSpeed, 0.05, 1e-9, 'T1 set');
    eq(h.sent(p, 'self', 'gear').d.set, 1);
    ok(h.do(p, 'gear.unequip', { slot: 'boots' }).ok);
    near(g.stats.of(p).moveSpeed, s0.moveSpeed, 1e-9, 'set broken');
    ok(slotOf('boots_1') >= 0, 'back in the bag');
    h.give(p, 'helm_3', 1); h.give(p, 'coat_3', 1); h.give(p, 'boots_3', 1);
    for (const id of ['helm_3', 'coat_3', 'boots_3']) ok(h.do(p, 'gear.equip', { slot: slotOf(id) }).ok);
    ok(slotOf('helm_1') >= 0, 'swapped out');
    ok(g.stats.of(p).flags.includes('burn_immune'), 'T3 set');
    h.give(p, 'lucky_cork', 2);
    ok(h.do(p, 'gear.equip', { slot: slotOf('lucky_cork') }).ok);
    eq(h.do(p, 'gear.equip', { slot: slotOf('lucky_cork') }).err, 'invalid', 'no duplicate trinket');
    h.give(p, 'gull_feather', 1);
    ok(h.do(p, 'gear.equip', { slot: slotOf('gull_feather') }).ok);
    eq(p.gear.trinket2, 'gull_feather');
    eq(g.stats.of(p).luck, 15);
    const n0 = p.inv.slots.length;
    h.give(p, 'pack_1', 1);
    ok(h.do(p, 'gear.equip', { slot: slotOf('pack_1') }).ok);
    eq(p.inv.slots.length, n0 + 8);
    h.give(p, 'blade_2', 1);
    ok(h.do(p, 'gear.equip', { slot: slotOf('blade_2') }).ok);
    eq(weaponStats(g, p).dmg, 12);
    eq(p.entity.pub.g[1], 'blade_2');
    eq(h.do(p, 'gear.equip', { swap: true }).err, 'locked', 'second weapon needs Arsenal');
  });

  t.test('tempering: cost n*2 bars + n rares + 25 * tier * n^2 Glint; success table; failure keeps the level', async () => {
    const { h, g, p, slotOf, structure } = await rig();
    h.give(p, 'coat_2', 1);
    ok(h.do(p, 'gear.equip', { slot: slotOf('coat_2') }).ok);
    eq(h.do(p, 'gear.temper', { item: 'coat' }).err, 'range');
    structure('tempering_forge', 2, 0);
    eq(h.do(p, 'gear.temper', { item: 'coat' }).err, 'cost');
    g.world.glint = 1e7;
    h.give(p, 'iron_bar', 400); h.give(p, 'pearl', 200);
    const armor0 = g.stats.of(p).armor;
    for (let n = 1; n <= 5; n++) {
      const c = temperCost(g, p, 'coat_2');
      eq(c.items, [{ item: 'iron_bar', qty: n * 2 }, { item: 'pearl', qty: n }]);
      eq(c.glint, 25 * 2 * n * n);
      eq(c.chance, 1);
      const g0 = g.world.glint, bars0 = h.game.call('countItem', p, 'iron_bar');
      const r = h.do(p, 'gear.temper', { item: 'coat' });
      ok(r.ok && r.d.success, 'guaranteed to +5');
      eq(g0 - g.world.glint, c.glint);
      eq(bars0 - h.game.call('countItem', p, 'iron_bar'), n * 2);
    }
    near(g.stats.of(p).armor - armor0, 20 * 0.3, 1e-9, '+6% per level');
    eq(TEMPER_SUCCESS.slice(5), [0.9, 0.8, 0.7, 0.6, 0.5]);
    g.temperRng = { next: () => 0.95 };
    const bars = h.game.call('countItem', p, 'iron_bar');
    const r = h.do(p, 'gear.temper', { item: 'coat' });
    ok(r.ok && !r.d.success);
    eq(p.gear.temper.coat_2, 5, 'failure keeps level');
    eq(bars - h.game.call('countItem', p, 'iron_bar'), 12, 'materials consumed');
    g.temperRng = { next: () => 0.1 };
    ok(h.do(p, 'gear.temper', { item: 'coat' }).d.success);
    eq(p.gear.temper.coat_2, 6);
  });

  t.test('food and tonic buffs: one of each at a time, heal x foodHeal, durations, expiry', async () => {
    const { h, g, p, slotOf } = await rig();
    for (const id of ['reed_bread', 'fen_stew', 'tonic_haste', 'roast_berries']) h.give(p, id, 2);
    p.entity.hp = 10;
    ok(h.do(p, 'item.use', { slot: slotOf('reed_bread') }).ok);
    near(p.entity.hp, 90, 1e-9);
    ok(p.buffs.has('reed_bread'));
    near(g.stats.of(p).moveSpeed, 0.10, 1e-9);
    h.step(0.5);
    ok(h.do(p, 'item.use', { slot: slotOf('fen_stew') }).ok);
    ok(!p.buffs.has('reed_bread') && p.buffs.has('fen_stew'), 'food replaces food');
    h.step(0.5);
    ok(h.do(p, 'item.use', { slot: slotOf('tonic_haste') }).ok);
    ok(p.buffs.has('fen_stew') && p.buffs.has('tonic_haste'), 'tonic and food coexist');
    near(g.stats.of(p).swingSpeed, 0.25, 1e-9);
    eq(h.do(p, 'item.use', { slot: slotOf('roast_berries') }).err, 'cooldown');
    h.step(0.5);
    p.entity.hp = p.entity.maxHp;
    eq(h.do(p, 'item.use', { slot: slotOf('roast_berries') }).err, 'full', 'no waste at full HP');
    h.step(121);
    ok(!p.buffs.has('tonic_haste'), 'tonic expired after 2 min');
    near(g.stats.of(p).swingSpeed, 0, 1e-9);
    ok(p.buffs.has('fen_stew'));
    // buffDuration and foodHeal
    g.stats.addSource('t', () => [{ stat: 'buffDuration', op: 'add', v: 0.5 }, { stat: 'foodHeal', op: 'add', v: 0.3 }]);
    g.stats.invalidate(p);
    h.step(0.5);
    p.entity.maxHp = 500;
    p.entity.hp = 10;
    h.give(p, 'reed_bread', 1);
    ok(h.do(p, 'item.use', { slot: slotOf('reed_bread') }).ok);
    near(p.entity.hp, 10 + 80 * 1.3, 1e-9);
    near(p.buffs.get('reed_bread').dur, 270, 1e-9);
  });

  t.test('Lure use calls boss.summon; tokens reroll; bombs explode after a fuse', async () => {
    const { h, g, p, slotOf, mob, dmgTo } = await rig();
    const calls = [];
    g.handlers.set('boss.summon', (game, player, d) => { calls.push(d); return { ok: true }; });
    h.give(p, 'lure_1', 1);
    ok(h.do(p, 'item.use', { slot: slotOf('lure_1') }).ok);
    eq(calls[0].lure, 'lure_1');
    h.step(0.5);
    g.call('queueDraft', p, {});
    const before = p.cardState.drafts[0].rerolls;
    h.give(p, 'tide_token', 1);
    ok(h.do(p, 'item.use', { slot: slotOf('tide_token') }).ok);
    eq(p.cardState.drafts[0].rerolls, before + 1);
    h.step(0.5);
    const m = mob(3, 0);
    h.give(p, 'bomb', 1);
    ok(h.do(p, 'item.use', { slot: slotOf('bomb'), ...aimAt(m) }).ok);
    eq(dmgTo(m), 0, 'fuse');
    h.step(1);
    eq(dmgTo(m), 150);
  });

  t.test('Surge regenerates and drains; ally auras (Rootbond regen, Warlord damage) reach nearby allies', async () => {
    const { h, g, p } = await rig(2);
    const b = h.player(1);
    abState(p).surge = 0;
    h.step(2);
    near(abState(p).surge, 10, 0.3);
    ok(h.sent(p, 'self', 'surge').d.cur >= 9);
    g.call('drainSurge', p, 5);
    near(abState(p).surge, 5, 0.3);
    const base = g.stats.of(b);
    classState(p).id = 'greenwarden';
    g.stats.invalidate(p);
    g.effects.addSource('t', (q) => (q === p ? [{ id: 'ally_aura', radius: 10, stat: 'power', v: 0.05 }] : []));
    h.step(1.1);
    near(g.stats.of(b).hpRegen - base.hpRegen, 1, 1e-9, '+1 HP/s within 6');
    near(g.stats.of(b).power - base.power, 0.05, 1e-9, 'Warlord aura');
  });

  t.test('class, mastery, signatures, gear, temper, buffs and cooldowns survive save and reload', async () => {
    const { h, g, p, slotOf, mob } = await rig();
    h.setLevel(p, 70);
    classState(p).id = 'prospector';
    classState(p).mastery.prospector = masteryTotal(12);
    classState(p).sig.prospector = ['motherlode'];
    h.give(p, 'helm_2', 1);
    h.do(p, 'gear.equip', { slot: slotOf('helm_2') });
    p.gear.temper.helm_2 = 3;
    h.give(p, 'tonic_stone', 1);
    h.do(p, 'item.use', { slot: slotOf('tonic_stone') });
    abState(p).surge = 100;
    mob();
    ok(h.do(p, 'ability.cast', { slot: 3 }).ok);
    const token = p.token;
    h.leave(p);
    const h2 = await h.reload();
    const p2 = h2.addPlayer({ token });
    const cs = classState(p2);
    eq([cs.id, masteryLevel(p2, 'prospector'), cs.sig.prospector], ['prospector', 12, ['motherlode']]);
    eq(p2.gear.helm, 'helm_2');
    eq(p2.gear.temper.helm_2, 3);
    ok(p2.buffs.has('tonic_stone'));
    eq(h2.game.stats.of(p2).armor, Math.round(12 * 1.18 * 1e9) / 1e9 + 40);
    eq(h2.do(p2, 'ability.cast', { slot: 3 }).err, 'cooldown', 'cooldown persisted');
  });
}
