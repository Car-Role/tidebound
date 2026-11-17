// WP9 tests: farming, fishing, market (TECH_SPEC 14 WP9).

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { T, FLAG } from '../shared/grid.js';
import { createEntity } from '../server/game/entities.js';
import { zoneAt, reelStep, zoneParams, PITY, REEL } from '../server/game/systems/fishing.js';
import { createRng } from '../shared/rng.js';

let clock = { day: 1, phase: 'day', isNight: false, lowTide: false, turning: false, weather: 'clear', forecast: [] };
const useClock = (h) => h.game.services.register('timeInfo', () => ({ ...clock }));
const setClock = (o) => { clock = { ...clock, ...o }; };

function groundTiles(h, p, n, r0 = 2) {
  const realm = h.game.realms.get('overworld');
  const out = [];
  const cx = Math.floor(p.entity.x), cy = Math.floor(p.entity.y);
  for (let r = r0; r < 9 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy, g = realm.groundAt(x, y);
      if (g < T.GREENMARROW || g > T.UMBRAL || !realm.hasFlag(x, y, FLAG.OWNED) || realm.hasFlag(x, y, FLAG.SOLID) || realm.entityAtTile(x, y)) continue;
      out.push({ tx: x, ty: y });
    }
  }
  return out;
}

async function setup(seed, players = 1) {
  const h = await createHarness({ seed, players });
  const p = h.player(0);
  h.setLevel(p, 30);
  const realm = h.game.realms.get('overworld');
  for (const e of realm.query(p.entity.x, p.entity.y, 8, [], (o) => o.type === 'node' || o.type === 'drop')) realm.remove(e);
  clock = { day: 1, phase: 'day', isNight: false, lowTide: false, turning: false, weather: 'clear', forecast: [] };
  useClock(h);
  return { h, p, realm };
}

// Stand on a land tile next to water; returns a water tile within cast range.
function goFishing(h, p) {
  const realm = h.game.realms.get('overworld');
  for (let y = 70; y < 110; y++) for (let x = 70; x < 110; x++) {
    const g = realm.groundAt(x, y);
    if (g !== T.SHALLOW && g !== T.DEEP) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!realm.isWalkable(x + dx * 2, y + dy * 2) || realm.groundAt(x + dx * 2, y + dy * 2) < T.SAND) continue;
      realm.move(p.entity, x + dx * 2 + 0.5, y + dy * 2 + 0.5);
      return { tx: x, ty: y };
    }
  }
  return null;
}

export default async function (t) {
  // ------------------------------------------------------------------ farming
  t.test('farm.till costs 1 fieldstone and turns biome ground into soil (tile 10)', async () => {
    const { h, p, realm } = await setup(201);
    const [a] = groundTiles(h, p, 1);
    eq(h.do(p, 'farm.till', a).err, 'cost');
    h.give(p, 'fieldstone', 1);
    eq(h.do(p, 'farm.till', a).ok, true);
    eq(realm.groundAt(a.tx, a.ty), T.SOIL);
    eq(h.game.inv.count(p.inv, 'fieldstone'), 0);
    h.step(0.05);
    ok(h.messages(p, 'tiles').some((m) => m.p.some(([x, y, g]) => x === a.tx && y === a.ty && g === T.SOIL)), 'tile patch sent');
    eq(h.do(p, 'farm.till', a).err, 'invalid', 'already soil');
    eq(h.do(p, 'farm.till', { tx: 2, ty: 2 }).err, 'range');
  });

  t.test('crop stages advance only while watered; water once per stage; rain and sprinklers water', async () => {
    const { h, p, realm } = await setup(202);
    const tiles = groundTiles(h, p, 3);
    h.give(p, 'fieldstone', 3); h.give(p, 'seed_tidewheat', 3);
    for (const a of tiles) { h.do(p, 'farm.till', a); eq(h.do(p, 'farm.plant', { ...a, seed: 'seed_tidewheat' }).ok, true); }
    const crops = tiles.map((a) => realm.entityAtTile(a.tx, a.ty, 'crop'));
    ok(crops.every(Boolean));
    h.step(65);
    eq(crops[0].pub.st, 0, 'dry crop pauses');
    eq(h.do(p, 'farm.water', tiles[0]).ok, true);
    eq(crops[0].pub.w, 1);
    ok(realm.hasFlag(tiles[0].tx, tiles[0].ty, FLAG.WATERED), 'soil darkens');
    h.step(61);
    eq(crops[0].pub.st, 1, 'one stage per watering');
    eq(crops[0].pub.w, 0, 'needs water again');
    h.step(61);
    eq(crops[0].pub.st, 1);
    // sprinkler 5x5
    h.game.world.flags['skill:H7'] = true;
    const sp = tiles[2];
    const spot = groundTiles(h, p, 40).find((g) => Math.max(Math.abs(g.tx - sp.tx), Math.abs(g.ty - sp.ty)) <= 2);
    ok(h.game.call('placeStructure', realm, 'sprinkler', spot.tx, spot.ty, 0, p, { free: true }), 'sprinkler placed');
    const st0 = crops[2].pub.st;
    h.step(61);
    eq(crops[2].pub.st, st0 + 1, 'sprinkler waters');
    // rain waters everything
    setClock({ weather: 'rain' });
    h.step(60 * 4 + 5);
    eq(crops[1].pub.st, 4, 'rain grows to ripe');
    setClock({ weather: 'clear' });
    // harvest ripe
    const r = h.do(p, 'farm.harvest', tiles[1]);
    eq(r.ok, true);
    ok(r.d.items[0].qty >= 2 && r.d.items[0].qty <= 3);
    ok(crops[1].removed, 'non-regrowing crop removed');
    h.step(1.5);
    ok(h.game.inv.count(p.inv, 'tidewheat') >= 2, 'harvest drops picked up');
  });

  t.test('wither after 2 unwatered days, not with H11; night-only crops; heatwave water lasts half a stage', async () => {
    const { h, p, realm } = await setup(203);
    const tiles = groundTiles(h, p, 3);
    h.give(p, 'fieldstone', 3); h.give(p, 'seed_tidewheat', 1); h.give(p, 'seed_moonpetal', 1); h.give(p, 'seed_saltbloom', 1);
    for (const a of tiles) h.do(p, 'farm.till', a);
    h.do(p, 'farm.plant', { ...tiles[0], seed: 'seed_tidewheat' });
    const c = realm.entityAtTile(tiles[0].tx, tiles[0].ty, 'crop');
    const farm = h.game.systems.find((s) => s.name === 'farming');
    for (let i = 0; i < 2 * 1440 - 2; i++) farm.slowTick(h.game);
    eq(c.pub.st, 0, 'not yet withered');
    for (let i = 0; i < 4; i++) farm.slowTick(h.game);
    eq(c.pub.st, -1, 'withered after 2 days dry');
    eq(h.do(p, 'farm.harvest', tiles[0]).ok, true, 'clearing a withered crop');
    ok(c.removed);
    // H11: no wither
    h.game.world.flags['skill:H11'] = true;
    h.give(p, 'seed_tidewheat', 1);
    h.do(p, 'farm.plant', { ...tiles[0], seed: 'seed_tidewheat' });
    const c2 = realm.entityAtTile(tiles[0].tx, tiles[0].ty, 'crop');
    for (let i = 0; i < 3 * 1440; i++) farm.slowTick(h.game);
    eq(c2.pub.st, 0, 'H11 keeps it alive');
    // night only
    h.do(p, 'farm.plant', { ...tiles[1], seed: 'seed_moonpetal' });
    const m = realm.entityAtTile(tiles[1].tx, tiles[1].ty, 'crop');
    h.do(p, 'farm.water', tiles[1]);
    for (let i = 0; i < 200; i++) farm.slowTick(h.game);
    eq(m.pub.st, 0, 'moonpetal does not grow by day');
    setClock({ phase: 'night', isNight: true });
    for (let i = 0; i < 181; i++) farm.slowTick(h.game);
    eq(m.pub.st, 1, 'grows at night');
    setClock({ phase: 'day', isNight: false, weather: 'heatwave' });
    // heatwave: a watering lasts half a stage
    h.do(p, 'farm.plant', { ...tiles[2], seed: 'seed_saltbloom' });
    const s = realm.entityAtTile(tiles[2].tx, tiles[2].ty, 'crop');
    h.do(p, 'farm.water', tiles[2]);
    for (let i = 0; i < 80; i++) farm.slowTick(h.game);
    eq(s.pub.st, 0, 'half a stage per watering in a heatwave');
    near(s.data.prog, 40, 1.01);
    h.do(p, 'farm.water', tiles[2]);
    for (let i = 0; i < 41; i++) farm.slowTick(h.game);
    eq(s.pub.st, 1);
  });

  t.test('pests eat 20% of an unprotected cluster and spawn Burrowgrubs; Scarecrows protect 7x7', async () => {
    const { h, p, realm } = await setup(204);
    const spawned = [];
    h.game.services.register('spawnMob', (r, kind) => { spawned.push(kind); return null; });
    const tiles = groundTiles(h, p, 10);
    h.give(p, 'fieldstone', 10); h.give(p, 'seed_tidewheat', 10);
    for (const a of tiles) { h.do(p, 'farm.till', a); h.do(p, 'farm.plant', { ...a, seed: 'seed_tidewheat' }); }
    const { pestEvent } = await import('../server/game/systems/farming.js');
    let eaten = 0;
    for (let d = 0; d < 60 && !eaten; d++) eaten = pestEvent(h.game);
    ok(eaten >= 2, 'pest event ate crops (20% of 10)');
    eq(spawned[0], 'burrowgrub');
    // all crops protected by a scarecrow: never eaten
    h.game.world.flags['skill:H7'] = true;
    const left = [...realm.entities.values()].filter((e) => e.type === 'crop');
    const cx = Math.round(left.reduce((a, c) => a + c.data.tx, 0) / left.length), cy = Math.round(left.reduce((a, c) => a + c.data.ty, 0) / left.length);
    const spot = groundTiles(h, p, 40).find((g) => Math.abs(g.tx - cx) <= 1 && Math.abs(g.ty - cy) <= 1) ?? groundTiles(h, p, 40)[0];
    h.game.call('placeStructure', realm, 'scarecrow', spot.tx, spot.ty, 0, p, { free: true, force: true });
    const covered = left.filter((c) => Math.max(Math.abs(c.data.tx - spot.tx), Math.abs(c.data.ty - spot.ty)) <= 3);
    for (const c of left) if (!covered.includes(c)) realm.remove(c);
    let after = 0;
    for (let d = 0; d < 40; d++) after += pestEvent(h.game);
    eq(after, 0, 'scarecrow protects');
  });

  t.test('farmTend: one action per call (harvest ripe, else water dry, else plant); growCrops', async () => {
    const { h, p, realm } = await setup(205);
    const all = groundTiles(h, p, 30);
    const first = all.find((a) => all.some((b) => b !== a && Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty)) === 1));
    const tiles = [first, all.find((b) => b !== first && Math.max(Math.abs(first.tx - b.tx), Math.abs(first.ty - b.ty)) === 1)];
    h.give(p, 'fieldstone', 2); h.give(p, 'seed_tidewheat', 1);
    for (const a of tiles) eq(h.do(p, 'farm.till', a).ok, true);
    h.do(p, 'farm.plant', { ...tiles[0], seed: 'seed_tidewheat' });
    const c = realm.entityAtTile(tiles[0].tx, tiles[0].ty, 'crop');
    const tend = (seed) => h.game.call('farmTend', realm, tiles[0].tx, tiles[0].ty, 2, seed);
    eq(tend(null).did, 'water');
    const r2 = tend('seed_tidewheat');
    eq(r2.did, 'plant');
    eq(tend(null).did, 'water', 'waters the new one');
    eq(tend(null).did, null, 'nothing to do');
    eq(h.game.call('growCrops', realm, c.x, c.y, 0.6, 9), 1);
    eq(c.pub.st, 4, 'ripe after growCrops');
    const r = tend(null);
    eq(r.did, 'harvest');
    ok(r.items.some((i) => i.item === 'tidewheat' && i.qty >= 2), 'items returned to the machine');
    ok(c.removed);
  });

  t.test('crops are saved and restored with stage and water', async () => {
    const { h, p, realm } = await setup(206);
    const [a] = groundTiles(h, p, 1);
    h.give(p, 'fieldstone', 1); h.give(p, 'seed_marrowberry', 1);
    h.do(p, 'farm.till', a); h.do(p, 'farm.plant', { ...a, seed: 'seed_marrowberry' });
    const c = realm.entityAtTile(a.tx, a.ty, 'crop');
    h.game.call('growCrops', realm, c.x, c.y, 0.6, 2);
    h.do(p, 'farm.water', a);
    const h2 = await h.reload();
    const r2 = h2.game.realms.get('overworld');
    eq(r2.groundAt(a.tx, a.ty), T.SOIL);
    const c2 = r2.entityAtTile(a.tx, a.ty, 'crop');
    ok(c2, 'crop restored');
    eq([c2.kind, c2.pub.st, c2.pub.w], ['marrowberry', 2, 1]);
  });

  // ------------------------------------------------------------------ fishing
  t.test('fish table by biome, rod tier and conditions; rollFish commonOnly', async () => {
    const { h } = await setup(207);
    const roll = (b, o) => h.game.call('rollFish', b, o);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(roll('greenmarrow', { rodTier: 1 }));
    ok(seen.has('pebble_minnow') && seen.has('reed_perch') && seen.has('marrow_carp'));
    ok(!seen.has('dawn_darter') && !seen.has('old_whiskers'), 'conditional fish need their condition');
    setClock({ phase: 'dawn' });
    let dawn = 0;
    for (let i = 0; i < 3000; i++) if (roll('greenmarrow', { rodTier: 1 }) === 'dawn_darter') dawn++;
    ok(dawn > 50 && dawn < 220, `dawn darter about 4% at dawn (${dawn})`);
    eq(roll('emberreach', { rodTier: 1 }), null, 'rod_1 cannot fish Emberreach');
    ok(h.game.content.fish.byId[roll('emberreach', { rodTier: 2 })].biome === 'emberreach');
    for (let i = 0; i < 300; i++) eq(h.game.content.fish.byId[roll('saltfen', { commonOnly: true })].rarity, 'common');
  });

  t.test('fishing loop: cast, bite window, reel minigame catches with a steady hand, loses when idle', async () => {
    const { h, p, realm } = await setup(208);
    const w = goFishing(h, p);
    ok(w, 'found water');
    eq(h.do(p, 'fish.cast', w).err, 'locked', 'no rod');
    h.give(p, 'rod_1', 1);
    eq(h.do(p, 'fish.cast', w).ok, true);
    eq(h.do(p, 'fish.cast', w).err, 'busy');
    const bob = [...realm.entities.values()].find((e) => e.kind === 'bobber');
    ok(bob && bob.pub.own === p.id, 'bobber entity');
    eq(p.entity.pub.a, 'fish');
    // wait for the bite (4..10 s)
    let s = 0;
    while (p.fishing?.st === 'wait' && s < 12) { h.step(0.1); s += 0.1; }
    eq(p.fishing.st, 'bite');
    ok(s >= 3.9 && s <= 10.2, `bite after ${s.toFixed(1)} s`);
    eq(h.do(p, 'fish.reel', { hold: true }).ok, true);
    eq(p.fishing.st, 'reel');
    // a simple controller: hold while the marker is below the zone centre
    let guard = 0;
    while (p.fishing && guard++ < 1200) {
      const f = p.fishing;
      const c = zoneAt(f.z, f.g.t);
      const want = f.g.m < c - 0.02 || (f.g.v < -0.4 && f.g.m < c + 0.05);
      if (want !== f.hold) h.do(p, 'fish.reel', { hold: want });
      h.step(0.05);
    }
    const last = h.sent(p, 'self', 'fish').d;
    eq(last.st, 'caught', JSON.stringify(last));
    ok(h.game.content.fish.byId[last.fish].biome === 'greenmarrow');
    eq(h.game.inv.count(p.inv, last.fish), 1);
    ok(bob.removed, 'bobber removed');
    eq(h.sent(p, 'self', 'fishlog').d[last.fish], 1);
    // missing the bite window
    h.do(p, 'fish.cast', w);
    while (p.fishing?.st === 'wait') h.step(0.1);
    h.step(1.6);
    eq(h.sent(p, 'self', 'fish').d.st, 'missed');
    // idle reel loses the fish
    h.do(p, 'fish.cast', w);
    while (p.fishing?.st === 'wait') h.step(0.1);
    h.do(p, 'fish.reel', { hold: true }); h.do(p, 'fish.reel', { hold: false });
    for (let i = 0; i < 400 && p.fishing; i++) h.step(0.05);
    eq(h.sent(p, 'self', 'fish').d.st, 'lost');
    // walking away snaps the line
    h.do(p, 'fish.cast', w);
    realm.move(p.entity, p.entity.x + 2, p.entity.y);
    h.step(0.1);
    eq(h.sent(p, 'self', 'fish').d.st, 'snap');
  });

  t.test('reel physics is deterministic and shared with the client', () => {
    const z = zoneParams(createRng(5), 0.6);
    const a = { m: 0.15, v: 0, meter: REEL.start, t: 0 }, b = { ...a };
    for (let i = 0; i < 60; i++) { reelStep(a, z, i % 7 < 4, 0.05, 4.5); reelStep(b, z, i % 7 < 4, 0.05, 4.5); }
    eq(a, b);
    ok(z.zw < 0.3 && z.zw > 0.15, 'harder fish, narrower zone');
  });

  t.test('pity: a rare by the 20th cast under its condition, a legendary by the 60th, reset on catch', async () => {
    const { h, p } = await setup(209);
    const w = goFishing(h, p);
    h.give(p, 'rod_1', 1);
    setClock({ phase: 'dawn', weather: 'rain' });       // dawn_darter (rare, dawn) + old_whiskers (legendary, rain)
    // casting and reeling in without a catch keeps counting; only a catch resets
    const fishOn = [];
    for (let i = 1; i <= 60; i++) {
      eq(h.do(p, 'fish.cast', w).ok, true);
      fishOn.push(p.fishing.fish);
      h.do(p, 'fish.cancel', {});
    }
    eq(p.fishPity.dawn_darter, 60);
    eq(fishOn[19], 'dawn_darter', 'rare forced on cast 20');
    eq(p.fishPity.old_whiskers, 60);
    eq(fishOn[59], 'old_whiskers', 'legendary forced on cast 60');
    // catching resets the counter
    p.fishing = null;
    h.do(p, 'fish.cast', w);
    p.fishing.fish = 'old_whiskers';
    p.fishing.st = 'reel'; p.fishing.z = zoneParams(createRng(1), 0.85); p.fishing.catchT = 6; p.fishing.g = { m: 0.5, v: 0, meter: 0.999, t: 0 };
    p.fishing.z.zw = 2;   // impossible to miss
    h.step(0.1);
    eq(h.sent(p, 'self', 'fish').d.st, 'caught');
    eq(p.fishPity.old_whiskers, 0, 'reset on catch');
    // the counters persist with the profile
    const prof = h.game.systems.find((s) => s.name === 'fishing').saveProfile(h.game, p);
    eq(prof.pity.old_whiskers, 0);
    ok(prof.pity.dawn_darter >= 1);
  });

  // ------------------------------------------------------------------ market
  t.test('market saturation: x0.99 per unit, floor 0.05, +0.02/min recovery (x2 with G8), sellMult', async () => {
    const { h, p, realm } = await setup(210);
    const spot = groundTiles(h, p, 30).find((g) => !realm.entityAtTile(g.tx + 1, g.ty) && realm.groundAt(g.tx + 1, g.ty) >= T.GREENMARROW);
    const stall = h.game.call('placeStructure', realm, 'market_stall', spot.tx, spot.ty, 0, p, { free: true, force: true });
    realm.move(p.entity, stall.x, stall.y + 1.6);
    eq(h.do(p, 'use', { id: stall.id }).ok, true);
    eq(h.sent(p, 'self', 'ui').d.kind, 'market');
    h.give(p, 'copper_ore', 100);
    const g0 = h.game.world.glint;
    eq(h.do(p, 'market.sell', { item: 'copper_ore', qty: 1 }).err, 'locked', 'selling opens with Beacon 1 (WP14 P1-2)');
    h.game.world.flags['beacon:1'] = true;
    const r = h.do(p, 'market.sell', { item: 'copper_ore', qty: 100 });
    eq(r.ok, true);
    let expect = 0, s = 1;
    for (let i = 0; i < 100; i++) { expect += 1 * s; s *= 0.99; }
    eq(h.game.world.glint - g0, Math.round(expect));
    near(r.d.sat, Math.pow(0.99, 100), 1e-9);
    eq(h.game.inv.count(p.inv, 'copper_ore'), 0);
    const mk = h.game.systems.find((x) => x.name === 'market');
    const sat0 = h.game._market.sat.copper_ore;
    for (let i = 0; i < 60; i++) mk.slowTick(h.game);
    near(h.game._market.sat.copper_ore, sat0 + 0.02, 1e-9, '+0.02 per minute');
    h.game.stats.addWorldSource('g8', () => [{ stat: 'satRecover', op: 'add', v: 1.0 }]);
    h.game.stats.invalidateWorld();
    for (let i = 0; i < 60; i++) mk.slowTick(h.game);
    near(h.game._market.sat.copper_ore, sat0 + 0.06, 1e-9, '+0.04 per minute with G8');
    // floor
    h.game.call('sellItems', null, 'shell', 2000);
    near(h.game._market.sat.shell, 0.01, 1e-12);   // WP14 P2-9: floor 0.01
    // sellMult and the published world key
    h.step(0.1);
    ok(h.sent(p, 'world', 'market').d.copper_ore < 1);
    eq(h.do(p, 'market.sell', { item: 'vault_key_1', qty: 1 }).err, 'invalid', 'value-0 items cannot be sold');
  });

  t.test('steady state: one good earns about 120 * value Glint per hour', async () => {
    const { h } = await setup(211);
    const mk = h.game.systems.find((x) => x.name === 'market');
    const value = 4;             // copper_bar
    let lastHour = 0;
    for (let m = 0; m < 6 * 60; m++) {
      const g = h.game.call('sellItems', null, 'copper_bar', 12);
      if (m >= 5 * 60) lastHour += g;
      for (let s = 0; s < 60; s++) mk.slowTick(h.game);
    }
    near(lastHour, 120 * value, 120 * value * 0.1, 'within 10%');
  });

  t.test('castaway shops: stock 40 per material per day, Glint spend, sold out, daily restock, Market Stall stock', async () => {
    const { h, p, realm } = await setup(212);
    const npc = createEntity(h.game, { type: 'npc', kind: 'npc_ferrin', x: p.entity.x + 1, y: p.entity.y, hp: 1, pub: { q: 0 } });
    realm.add(npc);
    const stock = h.game.call('shopStock', 'npc_ferrin');
    eq(stock.find((l) => l.item === 'rope'), { item: 'rope', price: 12, left: 40 });
    eq(stock.find((l) => l.item === 'seed_tidewheat').left, 20);
    ok(!stock.some((l) => l.item === 'pack_1'), 'pack only after the line');
    eq(h.do(p, 'shop.buy', { npc: 'npc_ferrin', item: 'rope', qty: 0 }).d.stock.length, stock.length, 'qty 0 fetches stock');
    eq(h.do(p, 'shop.buy', { npc: 'npc_ferrin', item: 'rope', qty: 5 }).err, 'cost');
    h.game.world.glint = 10000;
    eq(h.do(p, 'shop.buy', { npc: 'npc_ferrin', item: 'rope', qty: 40 }).ok, true);
    eq(h.game.world.glint, 10000 - 480);
    eq(h.game.inv.count(p.inv, 'rope'), 40);
    eq(h.do(p, 'shop.buy', { npc: 'npc_ferrin', item: 'rope', qty: 1 }).err, 'full', 'sold out');
    setClock({ day: 2 });
    eq(h.game.call('shopStock', 'npc_ferrin').find((l) => l.item === 'rope').left, 40, 'restocked next day');
    h.game.world.flags['skill:G8'] = true;
    setClock({ day: 3 });
    eq(h.game.call('shopStock', 'npc_ferrin').find((l) => l.item === 'rope').left, 80, 'G8 doubles stock');
    h.game.world.flags['quest:s_ferrin_3'] = true;
    ok(h.game.call('shopStock', 'npc_ferrin').some((l) => l.item === 'pack_1'), 'pack after the line');
    const q = h.game.call('shopStock', 'npc_quill');
    eq(q.length, 1); eq(q[0].price, 32000);
    ok(h.game.content.modules.shops.SHOP_POOLS.shrine_trinkets.includes(q[0].item), 'daily trinket from the pool');
    realm.move(npc, npc.x + 20, npc.y);
    eq(h.do(p, 'shop.buy', { npc: 'npc_ferrin', item: 'plank', qty: 1 }).err, 'range');
    // Market Stall sells previous-tier materials once a tier-2 plot is owned
    eq(h.game.call('shopStock', 'stall').length, 0, 'nothing below tier 1');
  });
}
