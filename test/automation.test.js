// WP8 automation tests: Flux, caps, speed cap, Tending, Burrows, Sluices, movers into a Kiln, Splitter, Autobench,
// Drill, Gulls, Ledger Post, Mint, Echo Chamber.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { FLAG, BIOMES, plotIndex } from '../shared/grid.js';
import { PLOT } from '../shared/config.js';
import { clockState } from '../server/game/systems/clock.js';
import { M, machineSpeed, rt, TEND_S } from '../server/game/systems/machines.js';
import { rollUnit, burrowRate } from '../server/game/systems/scuttlers.js';
import { drillPick } from '../server/game/systems/producers.js';

const WORK = [4, 5];          // plot used as the factory floor
const POWER = [4, 3];         // plot used for generators

async function factory(seed = 31, { players = 1, feature = 'wild' } = {}) {
  const h = await createHarness({ seed, players });
  const g = h.game;
  const st = clockState(g);
  for (const b of BIOMES) { st.weather[b].cur.id = 'clear'; st.weather[b].left = 1e9; }
  for (const [px, py] of [WORK, POWER]) {
    g.world.plots[plotIndex(px, py)].feature = (px === WORK[0] && py === WORK[1]) ? feature : 'wild';
    h.raise(px, py);
  }
  const realm = g.realms.get('overworld');
  // an empty, spawn-free factory floor
  for (const [px, py] of [WORK, POWER]) {
    for (const e of [...realm.entities.values()]) if (e.type === 'node' && Math.floor(e.x / PLOT) === px && Math.floor(e.y / PLOT) === py) realm.remove(e);
    for (let y = py * PLOT; y < (py + 1) * PLOT; y++) for (let x = px * PLOT; x < (px + 1) * PLOT; x++) realm.setFlag(x, y, FLAG.NO_SPAWN, true);
  }
  const p = h.player(0);
  const place = (kind, tx, ty, rot = 0) => {
    const e = g.call('placeStructure', realm, kind, tx, ty, rot, p, { free: true });
    if (!e) throw new Error(`could not place ${kind} at ${tx},${ty}: ${JSON.stringify(g.call('canPlace', kind, realm, tx, ty, p))}`);
    return e;
  };
  const W = (dx, dy) => [WORK[0] * PLOT + dx, WORK[1] * PLOT + dy];
  const power = (echoglass = 5) => {
    const r = place('umbral_reactor', POWER[0] * PLOT + 8, POWER[1] * PLOT + 8);
    g.call('insertInto', r, 'echoglass', echoglass);
    return r;
  };
  const stand = (x, y) => { realm.move(p.entity, x, y); p.entity.vx = 0; p.entity.vy = 0; };
  return { h, g, realm, p, place, W, power, stand };
}

const inv = (g, e) => g.call('containerOf', e);
const count = (g, e, item) => { const i = inv(g, e); return i ? g.inv.count(i, item) : 0; };

function stubService(g, name, fn) {
  const prev = g.services.currentSystem;
  g.services.currentSystem = 'test';
  g.services.register(name, fn);
  g.services.currentSystem = prev;
}

export default async function (t) {
  t.test('Flux: demand above supply slows every consumer to supply/demand', async () => {
    const { h, g, place, W } = await factory(31);
    place('prism_array', POWER[0] * PLOT + 8, POWER[1] * PLOT + 8);
    const benches = [];
    for (let i = 0; i < 7; i++) {
      const b = place('autobench_1', ...W(3 + (i % 4) * 3, 4 + Math.floor(i / 4) * 4));
      b.data.recipe = 'r_plank';
      g.call('insertInto', b, 'driftwood', 8);
      benches.push(b);
    }
    h.step(3);
    eq(g.worldState.flux.supply, 30);
    eq(g.worldState.flux.demand, 35);
    near(M(g).flux.ratio, 30 / 35, 1e-6);
    near(machineSpeed(g, benches[0]), 30 / 35, 1e-6);
    clockState(g).t = 1000;                                   // night: the Prism Array stops
    h.step(2.5);
    eq(g.worldState.flux.supply, 0);
    eq(machineSpeed(g, benches[0]), 0);
  });

  t.test('machine cap per plot counts only cap machines and scales with coopScale', async () => {
    const { g, realm, place, W } = await factory(32);
    for (let i = 0; i < 8; i++) place('tiller_bot', ...W(2 + i * 2, 4));
    const r = g.call('canPlace', 'tiller_bot', realm, ...W(2, 8), null);
    eq(r.ok, false); eq(r.err, 'full');
    for (let i = 0; i < 12; i++) place('sluice_1', ...W(2 + i, 10), 0);   // Sluices never count
    stubService(g, 'coopScale', () => 1.7);
    eq(g.call('machineCapAt', WORK[0], WORK[1]), 14);
    for (let i = 0; i < 6; i++) place('tiller_bot', ...W(2 + i * 2, 13));
    eq(g.call('canPlace', 'tiller_bot', realm, ...W(2, 16), null).err, 'full');
  });

  t.test('machine speed is capped at 3.0', async () => {
    const { h, g, p, place, W } = await factory(33);
    const b = place('burrow_1', ...W(8, 8));
    g.stats.addWorldSource('test_speed', () => [{ stat: 'machineSpeed', op: 'add', v: 5 }]);
    eq(machineSpeed(g, b), 3);
    g.stats.addSource('test_near', () => [{ stat: 'machineNear', op: 'add', v: 1 }]);
    h.step(1.1);
    ok(rt(g, b).near > 0 || Math.hypot(p.entity.x - b.x, p.entity.y - b.y) > 6, 'proximity source read');
    eq(machineSpeed(g, b), 3, 'still 3.0 with every bonus');
  });

  t.test('Tending: 30 min meter, 10% untended, refills only on player.active within 12 tiles; empty --persist pauses', async () => {
    const { h, g, realm, p, place, W, stand } = await factory(34);
    const b = place('burrow_1', ...W(8, 8));
    for (const [x, y] of [[6, 6], [11, 6], [6, 11], [11, 11]]) g.call('spawnNode', realm, 'copper_vein', ...W(x, y));
    eq(b.data.tend, TEND_S);
    eq(TEND_S, 1800);
    h.step(10.05);
    near(b.data.tend, 1790, 1.01, 'drains while working');
    b.data.tend = 3;
    h.step(4);
    eq(b.data.tend, 0);
    near(machineSpeed(g, b), 0.1, 1e-9, '10% when untended');
    ok(b.pub.lv & 1, 'untended status bit');
    // held input against a wall is not activity (teleporting there counts as movement, so let that window pass)
    const [wx, wy] = W(4, 4);
    place('stockpile', wx + 1, wy);
    stand(wx + 0.5, wy + 0.5);
    h.step(11);
    b.data.tend = 0;
    h.input(p, { mx: 1, my: 0 });
    h.step(15);
    eq(b.data.tend, 0, 'no refill from held input');
    // real movement near the machine refills it
    h.input(p, { mx: 0, my: 1 });
    h.step(1.6);
    h.input(p, {});
    h.step(1.1);
    near(b.data.tend, TEND_S, 1.01, 'refilled by player.active within 12 tiles');
    // far away activity does not refill
    b.data.tend = 0;
    stand(4 * PLOT + 10, 4 * PLOT + 2);
    eq(h.do(p, 'charter.set', { px: WORK[0], py: WORK[1], charter: 'quarry' }).ok, true);
    h.step(1.1);
    eq(b.data.tend, 0, 'player.active 20+ tiles away');
    // empty --persist server: clock runs, machines pause
    b.data.tend = 900;
    const made = rt(g, b).made ?? 0;
    const t0 = clockState(g).t;
    g.opts.persist = true;
    h.leave(p);
    h.step(60);
    eq(b.data.tend, 900, 'tend paused');
    eq(rt(g, b).made ?? 0, made, 'production paused');
    near(clockState(g).t, t0 + 60, 0.2, 'the clock keeps running');
  });

  t.test('Burrow rule: full rate with need nodes, linear below, nodes untouched, nearest Burrow, 0.5% rares', async () => {
    const { h, g, realm, place, W } = await factory(35);
    const b = place('burrow_1', ...W(4, 8));
    const nodes = [[2, 6], [7, 6], [2, 11], [7, 11]].map(([x, y]) => g.call('spawnNode', realm, 'copper_vein', ...W(x, y)));
    ok(nodes.every(Boolean));
    const ids = nodes.map((n) => n.id).sort();
    h.step(600);
    const units = b.data.out.slots.filter(Boolean).reduce((s, x) => s + x[1], 0);
    near(units, 60, 3, '6 units/min for 10 minutes');
    eq(nodes.filter((n) => !n.removed).map((n) => n.id).sort(), ids, 'no node removed');
    // half the nodes: half the rate
    const b2 = place('burrow_1', ...W(11, 8));
    for (const [x, y] of [[13, 6], [13, 11]]) g.call('spawnNode', realm, 'copper_vein', ...W(x, y));
    h.step(1.1);
    near(burrowRate(g, b2), 3, 1e-9);
    h.step(600);
    const u2 = b2.data.out.slots.filter(Boolean).reduce((s, x) => s + x[1], 0);
    near(u2, 30, 2, 'linear below need');
    // a node between two Burrows counts once (nearest Burrow first)
    const shared = g.call('spawnNode', realm, 'copper_vein', ...W(8, 8));
    ok(shared, 'shared node placed');
    h.step(1.1);
    const counted = (rt(g, b).nodes ?? []).filter((n) => n === shared).length + (rt(g, b2).nodes ?? []).filter((n) => n === shared).length;
    eq(counted, 1);
    // rare share
    const rng = g.rng.fork('rare-test');
    let rare = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) if (rollUnit(g, nodes, rng) === 'glintstone') rare++;
    near(rare / N, 0.005, 0.0008, '0.5% rare of the highest tier');
  });

  t.test('Sluices move 1/2/4 tiles/s; contents are tile `it` patches, not entities', async () => {
    for (const [kind, speed] of [['sluice_1', 1], ['sluice_2', 2], ['sluice_3', 4]]) {
      const { h, g, realm, p, place, W, stand } = await factory(36);
      stand(...W(10, 12));
      const line = [];
      for (let i = 0; i < 5; i++) line.push(place(kind, ...W(4 + i, 9), 0));
      const box = place('stockpile', ...W(9, 9));
      const before = realm.entities.size;
      h.step(0.1);
      h.clear(p);
      eq(g.call('insertInto', line[0], 'copper_bar', 1), 1);
      eq(line[0].pub.it, 'copper_bar');
      let t = 0;
      while (count(g, box, 'copper_bar') === 0 && t < 10) { h.step(0.05); t += 0.05; }
      near(t, 5 / speed, 0.11, `${kind} travel time`);
      eq(realm.entities.size, before, 'no entities were created for sluice contents');
      const patches = h.messages(p, 'snap').flatMap((m) => m.upd).filter((u) => u[6] && 'it' in u[6]);
      ok(patches.some((u) => u[0] === line[2].id && u[6].it === 'copper_bar'), 'it patched on the middle tile');
      eq(line.every((s) => !s.data.item), true);
    }
  });

  t.test('Spillway into a Kiln, Grabber out of it: ore in, bars out', async () => {
    const { h, g, place, W, power } = await factory(37);
    power();
    if (!g.services.io.has('kiln')) {
      // WP4 not loaded: a minimal smelter IO so the logistics path is still exercised
      g.call('registerIO', 'kiln', {
        insert(e, item, qty) { if (item !== 'copper_ore') return 0; e.data.ore = (e.data.ore ?? 0) + qty; return qty; },
        extract(e, f, max) { const n = Math.floor((e.data.ore ?? 0) / 2); if (!n) return null; e.data.ore -= 2; return { item: 'copper_bar', qty: 1 }; },
      });
    }
    const a = place('stockpile', ...W(4, 8));
    place('spillway', ...W(5, 8), 0);
    const kiln = place('kiln', ...W(6, 8));
    place('grabber', ...W(8, 8), 0);
    const b = place('stockpile', ...W(9, 8));
    g.inv.add(inv(g, a), 'copper_ore', 8);
    g.inv.add(inv(g, a), 'peat', 6);
    h.step(90);
    ok(count(g, b, 'copper_bar') >= 2, `bars delivered: ${count(g, b, 'copper_bar')}`);
    ok(count(g, a, 'copper_ore') < 8, 'ore left the input stockpile');
    void kiln;
  });

  t.test('Splitter alternates fairly between left, right and forward', async () => {
    const { h, g, place, W } = await factory(38);
    const feed = place('sluice_2', ...W(6, 9), 0);
    place('splitter', ...W(7, 9), 0);
    const fwd = place('stockpile', ...W(8, 9));
    const left = place('stockpile', ...W(7, 8));
    const right = place('stockpile', ...W(7, 10));
    let sent = 0;
    for (let i = 0; i < 400 && sent < 30; i++) {
      if (!feed.data.item) { g.call('insertInto', feed, 'plank', 1); sent++; }
      h.step(0.05);
    }
    h.step(3);
    eq([count(g, left, 'plank'), count(g, right, 'plank'), count(g, fwd, 'plank')], [10, 10, 10]);
  });

  t.test('Autobench loop: selected recipe, tier limit, inputs by IO, byMachine crafts', async () => {
    const { h, g, p, place, W, power, stand } = await factory(39);
    power();
    const bench = place('autobench_1', ...W(8, 8));
    stand(...W(8, 11));
    eq(h.do(p, 'machine.config', { id: bench.id, recipe: 'r_lens' }).err, 'locked', 'tier 4 needs Autobench II');
    eq(h.do(p, 'machine.config', { id: bench.id, recipe: 'r_plank' }).ok, true);
    let crafted = 0;
    g.bus.on('item.crafted', (e) => { if (e.byMachine && e.item === 'plank') crafted += e.qty; });
    eq(g.call('insertInto', bench, 'fieldstone', 5), 0, 'only recipe inputs are accepted');
    eq(g.call('insertInto', bench, 'driftwood', 6), 6);
    h.step(60);
    eq(count(g, bench, 'plank'), 0, 'machines are not containers');
    eq(crafted, 3, '3 crafts of 2 wood');
    eq(bench.data.out.slots.filter(Boolean)[0], ['plank', 3]);
    g.call('insertInto', bench, 'stiltwood', 2);
    h.step(10);
    eq(bench.data.out.slots.filter(Boolean)[0], ['plank', 5], 'group multiplier: tier-2 wood gives 2 planks');
    const got = g.call('extractFrom', bench, null, 99);
    eq(got, { item: 'plank', qty: 5 });
    eq(h.do(p, 'machine.config', { id: bench.id, take: 'out' }).ok, true);
  });

  t.test('Drill: vein plots only (max 6), 10 units/min, 1% rare', async () => {
    const { h, g, realm, place, W, power } = await factory(40, { feature: 'vein' });
    power();
    // WP14 (P1-1): Drills <= 2 x lit Beacons world-wide
    eq(g.call('canPlace', 'drill', realm, ...W(2, 2), null).err, 'full', 'no Drill without lit Beacons');
    for (let k = 1; k <= 3; k++) g.world.flags['beacon:' + k] = true;
    eq(g.call('canPlace', 'drill', realm, POWER[0] * PLOT + 2, POWER[1] * PLOT + 2, null).ok, false, 'not on a wild plot');
    const d = place('drill', ...W(2, 2));
    for (let i = 1; i < 6; i++) place('drill', ...W(2 + i * 3, 2));
    eq(g.call('canPlace', 'drill', realm, ...W(2, 8), null).err, 'full', 'max 6 per vein plot');
    for (const e of M(g).byType.get('drill')) if (e !== d) e.data.on = false;
    h.step(60.5);
    const units = d.data.out.slots.filter(Boolean).reduce((s, x) => s + x[1], 0);
    near(units, 10, 1, '10 units/min');
    eq(d.data.out.slots.filter(Boolean)[0][0], 'copper_ore', "that biome's ore");
    const rng = g.rng.fork('drill-test');
    let rare = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) if (drillPick(g, 'greenmarrow', rng) === 'glintstone') rare++;
    near(rare / N, 0.01, 0.0015, '1% rare');
  });

  t.test('Gulls carry from Supply to Request containers', async () => {
    const { h, g, p, place, W, power, stand } = await factory(41);
    power();
    const roost = place('gull_roost', ...W(8, 8));
    const sup = place('stockpile', ...W(2, 2));
    const req = place('stockpile', ...W(16, 16));
    g.inv.add(inv(g, sup), 'copper_ore', 40);
    g.inv.add(inv(g, sup), 'plank', 10);
    stand(...W(8, 11));
    eq(h.do(p, 'machine.config', { id: sup.id, tag: 'supply' }).ok, true, 'tagged from the roost panel');
    eq(h.do(p, 'machine.config', { id: req.id, tag: 'request', filter: ['copper_ore'] }).ok, true);
    let delivered = 0;
    g.bus.on('gull.delivered', (e) => { delivered += e.count; });
    h.step(12);
    eq(count(g, req, 'copper_ore'), 40, 'all ore delivered (16 per trip)');
    eq(count(g, req, 'plank'), 0, 'filter respected');
    eq(delivered, 40);
    ok([...g.realms.get('overworld').entities.values()].filter((e) => e.kind === 'gull').length <= 4, 'at most 4 Gulls');
    void roost;
  });

  t.test('Ledger Post sells 20/min at 70% through the market; Mint 30/min at 60% via one "mint" entry', async () => {
    const { h, g, place, W, power } = await factory(42);
    power();
    const calls = [];
    stubService(g, 'sellItems', (player, item, qty, opts) => { calls.push({ player, item, qty, ...opts }); return 7; });
    const box = place('stockpile', ...W(4, 4));
    place('ledger_post', ...W(5, 4), 0);
    g.inv.add(inv(g, box), 'copper_bar', 100);
    g.inv.add(inv(g, box), 'vault_key_1', 2);      // value 0: never sold
    h.step(60.02);
    const ledger = calls.filter((c) => c.satKey == null);
    near(ledger.length, 20, 1, '20 items per minute');
    ok(ledger.every((c) => c.rate === 0.7 && c.player === null && c.item === 'copper_bar'));
    eq(count(g, box, 'vault_key_1'), 2);
    const mint = place('mint', ...W(10, 10));
    eq(g.call('insertInto', mint, 'copper_bar', 50), 50);
    eq(g.call('insertInto', mint, 'driftwood', 5), 0, 'Mint takes bars and glintstone only');
    calls.length = 0;
    h.step(60.02);
    const minted = calls.filter((c) => c.satKey === 'mint');
    near(minted.length, 30 + 20 * 0 , 1, '30 items per minute');
    ok(minted.every((c) => c.rate === 0.6));
  });

  t.test('Echo Chamber: every 20 min one key becomes two Vault loot rolls without cores', async () => {
    const { h, g, p, place, W, power, stand } = await factory(43);
    power(8);
    stubService(g, 'rollVaultLoot', (k) => [{ item: 'vault_core_' + k, qty: 1 }, { item: 'shell', qty: 3 }]);
    g.world.flags['vault:1'] = true;
    const ec = place('echo_chamber', ...W(8, 8));
    stand(...W(9, 12));
    eq(h.do(p, 'machine.config', { id: ec.id, k: 2 }).err, 'locked', 'Vault 2 not cleared');
    eq(h.do(p, 'machine.config', { id: ec.id, k: 1 }).ok, true);
    eq(g.call('insertInto', ec, 'vault_key_2', 1), 0, 'wrong key');
    eq(g.call('insertInto', ec, 'vault_key_1', 2), 2);
    h.step(1195);
    eq(ec.data.out.slots.filter(Boolean).length, 0, 'not yet');
    h.step(10);
    eq(ec.data.out.slots.filter(Boolean), [['shell', 6]]);
    eq(g.inv.count(ec.data.in, 'vault_key_1'), 1);
  });
}
