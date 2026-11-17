// WP10 dungeon tests (TECH_SPEC 14): floor connectivity for 200 seeds per Vault, room distribution, keys,
// first-clear rewards once, all 20 blessings apply and vanish, wipe ejects, every Keeper move, Trench scaling and
// rewards, instance cleanup, realm messages, puzzles, no building inside.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { systems as allSystems } from '../server/game/systems/index.js';
import { createEntity } from '../server/game/entities.js';
import { STATE } from '../shared/protocol.js';
import { content } from '../shared/data/index.js';
import { generateFloor, floorConnected } from '../server/game/dungeon/gen.js';
import trench from '../server/game/dungeon/trench.js';
import { usePuzzle } from '../server/game/dungeon/puzzles.js';

const SYSTEMS = allSystems.filter((s) => s.name !== 'clock');
const fresh = (players = 1, seed = 11) => createHarness({ seed, players, systems: SYSTEMS });

function entrance(g, p, kind = 'vault_entrance') {
  const ow = g.realms.get('overworld');
  const e = p.entity;
  const ent = createEntity(g, { type: 'structure', kind, x: e.x + 1.5, y: e.y - 1, hp: 0, radius: 1.5, data: { tx: Math.floor(e.x), ty: Math.floor(e.y) - 2, w: 3, h: 2 }, pub: { rot: 0, own: 0, on: 1 } });
  ow.add(ent);
  return ent;
}

function god(g, p) { if (p.entity.hp > 0 && p.entity.state !== STATE.DOWN) { p.entity.hp = p.entity.maxHp; g.call('applyStatus', p.entity, 'invuln', { duration: 0.3 }); } }

export default async function (t) {
  t.test('Vault floors are connected for 200 seeds per Vault; 7-10 rooms; start + end; keeper hall on floor 3', () => {
    for (const d of content.dungeons) {
      for (let seed = 0; seed < 200; seed++) {
        for (let f = 1; f <= d.floors; f++) {
          const L = generateFloor({ floor: f, floors: d.floors, rooms: d.rooms, roomWeights: d.roomWeights, seed: seed * 31 + d.k });
          if (!floorConnected(L)) throw new Error(`${d.id} seed ${seed} floor ${f} disconnected`);
          const n = L.rooms.length;
          ok(n >= 7 && n <= 10, `${d.id} room count ${n}`);
          ok(L.rooms.some((r) => r.type === 'start'), 'start room');
          if (f === d.floors) ok(L.keeperId != null && L.rooms[L.keeperId].type === 'keeper', 'keeper hall');
          else ok(L.rooms.some((r) => r.type === 'stairs'), 'stairs room');
        }
      }
    }
  });

  t.test('room distribution follows the weights (combat 55 / puzzle 15 / treasure 10 / trap 10 / blessing 10)', () => {
    const count = { combat: 0, puzzle: 0, treasure: 0, trap: 0, blessing: 0 };
    let floors = 0;
    for (let seed = 0; seed < 600; seed++) {
      const L = generateFloor({ floor: 1 + (seed % 2), floors: 3, seed });
      floors++;
      ok(L.rooms.some((r) => r.type === 'blessing'), 'every floor has a blessing room');
      for (const r of L.rooms) if (r.type in count) count[r.type]++;
    }
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    const share = (k) => count[k] / total;
    ok(share('combat') > 0.42 && share('combat') < 0.62, 'combat ~55%: ' + share('combat'));
    for (const k of ['puzzle', 'treasure', 'trap']) ok(share(k) > 0.05 && share(k) < 0.2, `${k} ~10-15%: ${share(k)}`);
    ok(share('blessing') > 0.08 && share('blessing') < 0.25, 'blessing ~10%+: ' + share('blessing'));
    void floors;
  });

  t.test('enter/leave send realm messages; first entry free, repeats cost one key; instance cleanup', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const ent = entrance(g, p);
    ok(h.do(p, 'use', { id: ent.id }).ok, 'entrance opens the panel');
    eq(h.sent(p, 'self', 'dungeon').d.entry.free, true);
    h.clear(p);
    ok(h.do(p, 'dungeon.enter', { id: ent.id }).ok, 'first entry');
    const m = h.sent(p, 'realm');
    ok(m && m.kind === 'vault' && m.id === p.entity.realm, 'realm message on enter');
    const id = p.entity.realm;
    eq(m.w, g.realms.get(id).w);
    h.clear(p);
    ok(h.do(p, 'dungeon.leave', {}).ok);
    eq(h.sent(p, 'realm').id, 'overworld', 'realm message on leave');
    h.step(50);
    ok(!g.realms.has(id) && !g.instances.has(id), 'empty instance destroyed');
    eq(h.do(p, 'dungeon.enter', { id: ent.id }).err, 'cost', 'second entry needs a key');
    h.give(p, 'vault_key_1', 2);
    ok(h.do(p, 'dungeon.enter', { id: ent.id }).ok, 'entry with a key');
    eq(g.call('countItem', p, 'vault_key_1'), 1, 'exactly one key consumed');
  });

  t.test('party: allies in range enter together; no building inside', async () => {
    const h = await fresh(2);
    const g = h.game;
    const [a, b] = [h.player(0), h.player(1)];
    const ent = entrance(g, a);
    ok(h.do(a, 'dungeon.enter', { id: ent.id }).ok);
    eq(b.entity.realm, a.entity.realm, 'ally pulled in');
    const r = g.call('canPlace', 'workbench', g.realms.get(a.entity.realm), Math.floor(a.entity.x), Math.floor(a.entity.y), a);
    eq(r.ok, false, 'canPlace denied inside');
  });

  t.test('combat rooms lock, spawn telegraphed waves and reopen when cleared', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const realm = g.call('createInstance', 'vault', { k: 2, party: [p] });
    const inst = g.instances.get(realm.id);
    g.movePlayer(p, realm.id, inst.start.x, inst.start.y);
    const room = inst.rooms.find((r) => r.type === 'combat');
    realm.move(p.entity, room.cx, room.cy);
    h.step(0.1);
    eq(room.state, 'active');
    for (const d of room.doors) for (const [x, y] of d.tiles) eq(realm.groundAt(x, y), 16, 'door closed');
    h.step(1);
    ok(room.mobs.size > 0, 'wave spawned after its telegraph');
    for (let i = 0; i < 300 && room.state !== 'cleared'; i++) {
      god(g, p);
      for (const m of room.mobs) if (!m.removed) g.call('damage', m, m.hp + 1, { source: p.entity, raw: true });
      h.step(0.1);
    }
    eq(room.state, 'cleared');
    for (const d of room.doors) ok(d.tiles.some(([x, y]) => realm.groundAt(x, y) === 15), 'door open');
  });

  t.test('every Keeper performs every move of DESIGN A.4; clear rewards; first clear once per player', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const cleared = [];
    g.bus.on('vault.cleared', (ev) => cleared.push(ev));
    const missing = [];
    for (const d of content.dungeons) {
      const keeper = content.bosses.byId[d.keeper];
      const realm = g.call('createInstance', 'vault', { k: d.k, party: [p], floor: 3 });
      const inst = g.instances.get(realm.id);
      inst.entrance = { x: 90, y: 92 };
      g.movePlayer(p, realm.id, inst.start.x, inst.start.y);
      const room = inst.rooms.find((r) => r.type === 'keeper');
      realm.move(p.entity, room.cx, room.cy + 5);
      const want = new Set(keeper.moves.flat());
      const did = new Set();
      for (let i = 0; i < 4000 && did.size < want.size; i++) {
        god(g, p);
        if (i === 30) for (const b of g.bossesLive) if (b.realm === realm.id) { b.data.phase = 2; b.set('ph', 2); }
        h.step(0.05);
        for (const b of g.bossesLive) if (b.realm === realm.id && b.data.act) did.add(b.data.act.name);
      }
      for (const mv of want) if (!did.has(mv)) missing.push(`${d.keeper}.${mv}`);
      // kill it: every body of the encounter
      for (let i = 0; i < 40 && room.state !== 'cleared'; i++) {
        god(g, p);
        for (const b of [...g.bossesLive]) if (b.realm === realm.id && !b.removed) g.call('damage', b, b.maxHp + 1, { source: p.entity, raw: true });
        h.step(0.1);
      }
      eq(room.state, 'cleared', d.id + ' cleared');
      ok([...realm.entities.values()].some((e) => e.kind === 'vault_exit'), 'exit portal');
      g.call('destroyInstance', realm.id);
    }
    eq(missing.join(','), '', 'Keeper moves never used');
    eq(cleared.length, 6);
    ok(cleared.every((c) => c.firstFor.includes(p.id) && c.first), 'first clears');
    ok(g.world.flags['vault:6'] && g.world.flags['gate:vault_1'] != null, 'unlock + telemetry flags');
    // clear vault 1 again: no second first-clear, core only by the 25% repeat roll
    const realm = g.call('createInstance', 'vault', { k: 1, party: [p], floor: 3 });
    const inst = g.instances.get(realm.id);
    g.movePlayer(p, realm.id, inst.start.x, inst.start.y);
    const room = inst.rooms.find((r) => r.type === 'keeper');
    realm.move(p.entity, room.cx, room.cy + 5);
    h.step(0.2);
    for (let i = 0; i < 20 && room.state !== 'cleared'; i++) {
      god(g, p);
      for (const b of [...g.bossesLive]) if (b.realm === realm.id && !b.removed) g.call('damage', b, b.maxHp + 1, { source: p.entity, raw: true });
      h.step(0.1);
    }
    eq(cleared.length, 7);
    eq(cleared[6].firstFor.length, 0, 'repeat clear is not a first clear');
    eq(p.dungeon.clears[1], 2);
  });

  t.test('all 20 blessings apply in the instance and vanish on exit', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const ent = entrance(g, p);
    ok(h.do(p, 'dungeon.enter', { id: ent.id }).ok);
    const inst = g.instances.get(p.entity.realm);
    const base = g.stats.of(p);
    eq(content.blessings.length, 20);
    for (const b of content.blessings) {
      inst.blessings.set(p.id, [b.id]);
      g.stats.invalidate(p);
      if (g.procs?.invalidate) g.procs.invalidate(p);
      const s = g.stats.of(p);
      for (const m of b.mods) ok(s[m.stat] !== base[m.stat], `${b.id} changes ${m.stat}`);
      if (b.proc && g.procs?.list) {
        const ids = g.procs.list(p).map((x) => x.id);
        for (const pr of Array.isArray(b.proc) ? b.proc : [b.proc]) ok(ids.includes(pr.id), `${b.id} proc ${pr.id} registered`);
      }
    }
    // pick through an altar, then leave
    inst.blessings.set(p.id, []);
    const altarRoom = inst.rooms.find((r) => r.type === 'blessing');
    g.realms.get(inst.id).move(p.entity, altarRoom.cx, altarRoom.cy + 1);
    const altar = [...g.realms.get(inst.id).entities.values()].find((e) => e.kind === 'blessing_altar' && e.data.room === altarRoom.id);
    const offer = h.do(p, 'use', { id: altar.id }).d;
    eq(offer.choices.length, 3);
    ok(h.do(p, 'blessing.pick', { index: 1 }).ok);
    eq(h.sent(p, 'self', 'dungeon').d.blessings[0], offer.choices[1]);
    eq(h.do(p, 'use', { id: altar.id }).ok, true);
    eq(inst.blessings.get(p.id).length, 1, 'one pick per altar');
    inst.blessings.set(p.id, ['bl_crit']);
    g.stats.invalidate(p);
    near(g.stats.of(p).critChance, base.critChance + 0.2, 1e-9);
    h.do(p, 'dungeon.leave', {});
    near(g.stats.of(p).critChance, base.critChance, 1e-9, 'gone after leaving');
  });

  t.test('a full wipe ejects the party to the entrance and resets the floor', async () => {
    const h = await fresh(2);
    const g = h.game;
    const [a, b] = [h.player(0), h.player(1)];
    const ent = entrance(g, a);
    ok(h.do(a, 'dungeon.enter', { id: ent.id }).ok);
    const id = a.entity.realm;
    g.call('damage', a.entity, 1e6, { raw: true });
    eq(a.entity.state, STATE.DOWN);
    eq(a.entity.realm, id, 'one down: still inside');
    g.call('damage', b.entity, 1e6, { raw: true });
    eq(a.entity.realm, 'overworld', 'wipe ejects');
    eq(b.entity.realm, 'overworld');
    ok(a.entity.hp > 0 && a.entity.state !== STATE.DOWN, 'alive outside');
    ok(Math.hypot(a.entity.x - ent.x, a.entity.y - ent.y) < 4, 'at the entrance');
    ok(g.instances.has(id), 'floor kept for a retry');
    ok(h.do(a, 'dungeon.enter', { id: ent.id }).ok, 're-enter without a key');
  });

  t.test('Trench: 1.12^floor scaling, rare tier rule, moonpetal at 10/20/30, Keeper every 5th, blessing every 3rd', async () => {
    const h = await fresh(1);
    const g = h.game;
    const def = content.enemies.byId.cinderling;   // a tier-3 enemy: pure 1.12^floor
    const m5 = trench.trenchMults(g, def, 5), m6 = trench.trenchMults(g, def, 6);
    near(m6.hpMult / m5.hpMult, 1.12, 1e-9, 'x1.12 per floor');
    const avg = trench.tierAverages(g);
    near(trench.trenchMults(g, def, 0).hpMult, avg[3].hp / avg[3].hp, 1e-9);
    const t6 = trench.trenchMults(g, content.enemies.byId.hollowling, 4);
    near(t6.hpMult * avg[6].hp, avg[3].hp * Math.pow(1.12, 4), 1e-6, 'tier 6 normalised to the tier-3 baseline');
    const rng = { next: () => 0.99 };
    const tierOf = (r) => content.items.byId[r.items[0].item].tier;
    eq(tierOf(trench.floorRewards(g, 1, 6, rng)), 3, 'floor 1 -> tier 3');
    eq(tierOf(trench.floorRewards(g, 16, 6, rng)), 5, 'floor 16 -> 3 + 2');
    eq(tierOf(trench.floorRewards(g, 30, 4, rng)), 4, 'capped by party tier');
    for (const f of [10, 20, 30]) ok(trench.floorRewards(g, f, 6, rng).items.some((i) => i.item === 'seed_moonpetal' && i.qty === 5), `moonpetal at ${f}`);
    ok(!trench.floorRewards(g, 7, 6, rng).items.some((i) => i.item === 'seed_moonpetal'), 'not at 7');
    eq(trench.floorRewards(g, 10, 6, rng).trinket, 'deep_lantern');
    ok(trench.isKeeperFloor(5) && trench.isKeeperFloor(10) && !trench.isKeeperFloor(7));
    ok(trench.hasBlessing(3) && trench.hasBlessing(6) && !trench.hasBlessing(4));
  });

  t.test('Trench run: floors clear, rewards and deepest floor recorded, locked before Beacon 3', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const floors = [];
    g.bus.on('trench.floor', (e) => floors.push(e.floor));
    const ent = entrance(g, p, 'trench_entrance');
    eq(h.do(p, 'dungeon.enter', { id: ent.id }).err, 'locked');
    g.world.flags['beacon:3'] = true;
    ok(h.do(p, 'dungeon.enter', { id: ent.id }).ok);
    const inst = g.instances.get(p.entity.realm);
    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < 1200 && inst.tr.state !== 'cleared'; i++) {
        god(g, p);
        h.step(0.05);
        if (i % 10 === 0) {
          for (const m of [...g.mobsLive]) if (!m.removed && m.realm === inst.id) g.call('damage', m, m.hp + 1, { source: p.entity, raw: true });
          for (const b of [...g.bossesLive]) if (!b.removed && b.realm === inst.id) g.call('damage', b, b.maxHp * 0.3, { source: p.entity, raw: true });
        }
      }
      eq(inst.tr.state, 'cleared', 'floor ' + inst.floor);
      if (f === 2) ok([...g.realms.get(inst.id).entities.values()].some((e) => e.kind === 'blessing_altar'), 'altar after floor 3');
      if (f < 4) {
        const portal = [...g.realms.get(inst.id).entities.values()].find((e) => e.kind === 'trench_portal');
        g.realms.get(inst.id).move(p.entity, portal.x, portal.y + 0.5);
        ok(h.do(p, 'use', { id: portal.id }).ok);
      }
    }
    eq(floors.join(','), '1,2,3,4,5', 'five floors (5th is a Keeper remix)');
    eq(p.dungeon.deepest, 5);
    ok(h.do(p, 'dungeon.leave', {}).ok);
    eq(p.entity.realm, 'overworld');
  });

  t.test('puzzles are solvable: mirrors, braziers, levers, ice blocks', async () => {
    const h = await fresh(1);
    const g = h.game, p = h.player(0);
    const solve = {};
    for (const d of content.dungeons) {
      for (let seed = 0; seed < 40 && !solve[d.mechanic]; seed++) {
        g.world.counters ||= {};
        g.world.counters['vault_clears_' + d.k] = seed;
        const realm = g.call('createInstance', 'vault', { k: d.k, party: [p], floor: 1 + (seed % 2) });
        const inst = g.instances.get(realm.id);
        const room = inst.rooms.find((r) => r.type === 'puzzle');
        if (!room) { g.call('destroyInstance', realm.id); continue; }
        const P = room.puzzle;
        g.movePlayer(p, realm.id, room.cx, room.cy);
        const use = (e) => usePuzzle(g, realm, inst, room, e, p);
        if (d.mechanic === 'mirrors') {
          const sol = [1, 1, 0];
          P.mirrors.forEach((m, i) => { if (m.pub.rot !== sol[i]) use(m); });
        } else if (d.mechanic === 'darkness') {
          // brute force the 5-brazier lights-out (32 subsets)
          const start = P.braziers.map((b) => b.pub.on);
          for (let mask = 0; mask < 32 && !room.solved; mask++) {
            P.braziers.forEach((b, i) => b.set('on', start[i]));
            for (let i = 0; i < 5; i++) if (mask & (1 << i)) use(P.braziers[i]);
          }
        } else if (d.mechanic === 'water_level') {
          for (const i of P.order) use(P.levers[i]);
        } else if (d.mechanic === 'ice_blocks') {
          // push each block toward its mark by standing on the far side
          for (let n = 0; n < 40 && !room.solved; n++) {
            for (const [bi, blk] of P.blocks.entries()) {
              const mk = P.marks[bi];
              const dx = Math.sign(mk.data.tx - blk.data.tx), dy = Math.sign(mk.data.ty - blk.data.ty);
              if (!dx && !dy) continue;
              const [px, py] = dx ? [blk.x - dx, blk.y] : [blk.x, blk.y - dy];
              realm.move(p.entity, px, py);
              use(blk);
            }
          }
        } else if (d.mechanic === 'conveyors') {
          for (const i of P.order) { const pl = P.plates[i]; realm.move(p.entity, pl.x, pl.y); god(g, p); h.step(0.05); }
        } else if (d.mechanic === 'spores') {
          h.step(0.1);
          for (const pod of P.pods) if (pod.z && !pod.z.removed) g.call('spawnProjectile', realm, { kind: 'arrow', x: pod.x - 0.6, y: pod.y, angle: 0, speed: 10, range: 2, team: 'player', source: p.entity, dmg: 1 });
          h.step(0.4);
        }
        h.step(0.1);
        solve[d.mechanic] = room.solved || room.state === 'cleared';
        g.call('destroyInstance', realm.id);
      }
    }
    for (const m of ['mirrors', 'darkness', 'water_level', 'ice_blocks', 'conveyors', 'spores']) ok(solve[m], m + ' solved');
  });

  t.test('rollVaultLoot gives the tier ore', async () => {
    const h = await fresh(1);
    for (let k = 1; k <= 6; k++) {
      const loot = h.game.call('rollVaultLoot', k);
      ok(loot.some((l) => content.items.byId[l.item].kind === 'ore' && content.items.byId[l.item].tier === k), 'tier ore ' + k);
    }
  });
}
