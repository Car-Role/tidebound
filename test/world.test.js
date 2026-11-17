// WP7 world tests: features, raising, Ballast, Treasury, Beacons, tides, nodes, weather forecast, shrines, charters.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { T, FLAG, BIOMES, biomeOf, plotIndex } from '../shared/grid.js';
import { PLOT } from '../shared/config.js';
import { landCost, landBase } from '../shared/rules/costs.js';
import { assignFeatures, FEATURE_COUNTS } from '../server/game/worldgen/features.js';
import { clockState } from '../server/game/systems/clock.js';
import { moveBlock, pieceOf, toggleBraziers } from '../server/game/systems/shrines.js';

const GM_RING = [[4, 3], [3, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5], [5, 5]];

function setWeatherAll(game, id) {
  const st = clockState(game);
  for (const b of BIOMES) st.weather[b].cur.id = id;
}

async function fresh(seed = 11, players = 1) {
  const h = await createHarness({ seed, players });
  setWeatherAll(h.game, 'clear');
  return h;
}

const overworld = (h) => h.game.realms.get('overworld');
const nodesOnPlot = (h, px, py, f = () => true) => [...overworld(h).entities.values()].filter((e) => e.type === 'node'
  && e.x >= px * PLOT && e.y >= py * PLOT && e.x < (px + 1) * PLOT && e.y < (py + 1) * PLOT && f(e));

function standAt(h, p, x, y) {
  overworld(h).move(p.entity, x, y);
  p.entity.vx = 0; p.entity.vy = 0;
}

export default async function (t) {
  t.test('feature counts per biome hold for 20 seeds; start plot fixed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const f = assignFeatures(seed * 7919);
      eq(f.length, 81);
      eq(f[plotIndex(4, 4)], 'start');
      for (const biome of BIOMES) {
        const got = {};
        for (let i = 0; i < 81; i++) if (biomeOf(i % 9, Math.floor(i / 9)) === biome) got[f[i]] = (got[f[i]] ?? 0) + 1;
        const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
        eq(sorted(got), sorted(FEATURE_COUNTS[biome]), `seed ${seed} ${biome}`);
      }
    }
    ok(JSON.stringify(assignFeatures(5)) !== JSON.stringify(assignFeatures(6)), 'features depend on the seed');
  });

  t.test('start plot has the Tidestone; plots populate by feature caps', async () => {
    const h = await fresh(11);
    const kinds = [...overworld(h).entities.values()].filter((e) => e.type === 'structure').map((e) => e.kind);
    ok(kinds.includes('tidestone') && kinds.includes('campfire'), 'tidestone + campfire');
    h.game.world.glint = 1e6;
    h.give(h.player(0), 'ballast_1', 5000);
    for (const [px, py] of GM_RING) eq(h.do(h.player(0), 'land.raise', { px, py }).ok, true, `raise ${px},${py}`);
    for (const p of h.game.world.plots.filter((q) => q.owned)) {
      const n = nodesOnPlot(h, p.px, p.py).length;
      const cap = p.feature === 'wild' ? 22 : 12;
      ok(n <= cap && n >= cap * 0.6, `${p.feature} plot has ${n} nodes (cap ${cap})`);
    }
  });

  t.test('adjacency and biome gates', async () => {
    const h = await fresh(12);
    const p = h.player(0);
    h.game.world.glint = 1e6;
    h.give(p, 'ballast_1', 5000);
    eq(h.do(p, 'land.raise', { px: 4, py: 2 }).err, 'locked', 'not adjacent');
    eq(h.do(p, 'land.raise', { px: 4, py: 4 }).err, 'invalid', 'already owned');
    eq(h.do(p, 'land.raise', { px: 4, py: 3 }).ok, true);
    eq(h.do(p, 'land.raise', { px: 4, py: 2 }).err, 'locked', 'hoarfrost needs Beacon 4');
    eq(h.do(p, 'land.raise', { px: 3, py: 4 }).ok, true);
    const r = h.do(p, 'land.raise', { px: 2, py: 4 });
    eq(r.err, 'locked', 'saltfen needs Beacon 1');
    eq(r.d.why, 'beacon');
    h.game.world.flags['beacon:1'] = true;
    eq(h.do(p, 'land.raise', { px: 2, py: 4 }).ok, true, 'saltfen opens with Beacon 1');
  });

  t.test('cost by ordinal, additive discounts capped at 20%, coopScale', async () => {
    const h = await fresh(13, 2);
    const g = h.game;
    // WP14 (P0-5): two connected players are a crew of 2 at once
    near(g.call('coopScale'), 1.7);
    g.services.register('coopScale', () => 1);
    eq(g.call('landCostNext').ordinal, 1);
    eq(g.call('landCostNext').glint, landBase(1));
    eq(landBase(1), 55);
    g.stats.addSource('test_discount', () => [{ stat: 'landDiscount', op: 'add', v: 0.15 }]);
    eq(g.call('landDiscount'), 0.2, 'two players at 15% sum to 30%, capped at 20%');
    eq(g.call('landCostNext').glint, landCost(1, { discount: 0.2 }));
    g.services.register('coopScale', () => 1.7);
    const c = g.call('landCostNext');
    eq(c.glint, Math.round(55 * 1.7 * 0.8));
    eq(g.call('ballastFor', 4, 3), { item: 'ballast_1', qty: 17 }, 'Ballast scales with coopScale, never discounted');
    const p = h.player(0);
    g.world.glint = c.glint;
    h.give(p, 'ballast_1', 17);
    const r = h.do(p, 'land.raise', { px: 4, py: 3 });
    eq(r.ok, true);
    eq(g.world.glint, 0);
    eq(g.call('countItem', p, 'ballast_1'), 0);
    eq(g.call('landCostNext').ordinal, 2);
  });

  t.test('Ballast per biome and from start-plot Stockpiles', async () => {
    const h = await fresh(14);
    const g = h.game;
    for (let i = 0; i < 4; i++) g.world.plots[plotIndex(...GM_RING[i])].owned = true;   // ordinal 5 next
    eq(g.call('ballastFor', 5, 4), { item: 'ballast_1', qty: 50 });
    eq(g.call('ballastFor', 2, 4).qty, 90);
    eq(g.call('ballastFor', 4, 7), { item: 'ballast_2', qty: 160 });
    eq(g.call('ballastFor', 7, 4), { item: 'ballast_3', qty: 200 });
    eq(g.call('ballastFor', 4, 1), { item: 'ballast_4', qty: 380 });
    eq(g.call('ballastFor', 1, 1), { item: 'ballast_5', qty: 1000 });
    for (let i = 0; i < 4; i++) g.world.plots[plotIndex(...GM_RING[i])].owned = false;
    // a Stockpile on the start plot covers the shortfall
    const p = h.player(0);
    const sp = g.call('placeStructure', overworld(h), 'stockpile', 84, 92, 0, p, { free: true });
    const inv = g.call('containerOf', sp);
    if (inv) {
      g.inv.add(inv, 'ballast_1', 6);
      h.give(p, 'ballast_1', 4);
      g.world.glint = 100;
      eq(h.do(p, 'land.raise', { px: 4, py: 3 }).ok, true, 'inventory + stockpile');
      eq(g.inv.count(inv, 'ballast_1'), 0);
    }
  });

  t.test('raising re-stamps shared shorelines as solid land', async () => {
    const h = await fresh(15);
    const realm = overworld(h);
    const yEdge = 4 * PLOT;                      // boundary between (4,3) and (4,4)
    let tidal = 0;
    for (let x = 4 * PLOT + 3; x < 5 * PLOT - 3; x++) if (realm.groundAt(x, yEdge) <= T.TIDAL) tidal++;
    ok(tidal > 0, 'north shore of the start plot is water/flats before the raise');
    h.game.world.glint = 1000; h.give(h.player(0), 'ballast_1', 10);
    eq(h.do(h.player(0), 'land.raise', { px: 4, py: 3 }).ok, true);
    for (let x = 4 * PLOT + 3; x < 5 * PLOT - 3; x++) {
      ok(realm.groundAt(x, yEdge) > T.SAND, `edge tile ${x} is land`);
      ok(realm.groundAt(x, yEdge - 1) > T.SAND, `edge tile ${x} (north side) is land`);
    }
    ok(realm.hasFlag(4 * PLOT + 10, 3 * PLOT + 10, FLAG.OWNED));
  });

  t.test('tide cycle: flats walk only at low tide; first cache is exactly 15 Glint; tidal spawns 1/10 s cap 8', async () => {
    const h = await fresh(16);
    const g = h.game, realm = overworld(h);
    let flat = null;
    for (let y = 4 * PLOT; y < 5 * PLOT && !flat; y++) for (let x = 4 * PLOT; x < 5 * PLOT; x++) if (realm.groundAt(x, y) === T.TIDAL) { flat = [x, y]; break; }
    ok(flat, 'start plot has flats');
    eq(realm.isWalkable(...flat), false);
    h.step(239);
    eq(realm.lowTide, false);
    h.step(1.05);
    eq(realm.lowTide, true, 'low tide at minute 4');
    eq(realm.isWalkable(...flat), true);
    eq(g.worldState.clock.low, true);
    const caches = [...realm.entities.values()].filter((e) => e.kind === 'tide_cache');
    eq(caches.length, 1, 'guaranteed first cache');
    eq(caches[0].data.glint, 15);
    h.step(35);
    const tidal = nodesOnPlot(h, 4, 4, (e) => e.data.tidal).length;
    ok(tidal >= 3 && tidal <= 5, `~1 tidal node per 10 s (+ the cache): ${tidal}`);
    h.step(80);
    ok(nodesOnPlot(h, 4, 4, (e) => e.data.tidal).length <= 8, 'cap 8');
    ok(g.call('timeInfo').turning, 'tide turning warning in the last 10 s');
    h.step(6);
    eq(realm.lowTide, false, 'high tide after 2 minutes');
    eq(nodesOnPlot(h, 4, 4, (e) => e.data.tidal).length, 0, 'tidal nodes vanish');
    eq(realm.isWalkable(...flat), false);
  });

  t.test('player caught on a flat is carried to land when the tide returns', async () => {
    const h = await fresh(17);
    const realm = overworld(h), p = h.player(0);
    h.step(241);
    let flat = null;
    for (let y = 4 * PLOT; y < 5 * PLOT && !flat; y++) for (let x = 4 * PLOT; x < 5 * PLOT; x++) {
      if (realm.groundAt(x, y) === T.TIDAL && realm.isWalkable(x, y) && !realm.entityAtTile(x, y)) { flat = [x, y]; break; }
    }
    standAt(h, p, flat[0] + 0.5, flat[1] + 0.5);
    h.step(125);
    const g = realm.groundAt(Math.floor(p.entity.x), Math.floor(p.entity.y));
    ok(g !== T.TIDAL && g !== T.SHALLOW && g !== T.DEEP, 'on land again');
  });

  t.test('node respawn per plot and 3% gem share', async () => {
    const h = await fresh(18);
    const g = h.game, realm = overworld(h);
    for (const e of nodesOnPlot(h, 4, 4)) realm.remove(e);
    h.step(60);
    const n = nodesOnPlot(h, 4, 4).length;
    ok(n >= 8 && n <= 11, `about 1 node per 6 s: ${n}`);
    h.step(120);
    eq(nodesOnPlot(h, 4, 4, (e) => !e.data.tidal).length, 12, 'feature plot cap 12');
    // gem share over many natural spawns
    const plot = g.world.plots[plotIndex(4, 4)];
    const rng = g.rng.fork('gemtest');
    let free = null;
    for (let y = 4 * PLOT + 4; y < 5 * PLOT - 4 && !free; y++) for (let x = 4 * PLOT + 4; x < 5 * PLOT - 4; x++) if (realm.isWalkable(x, y) && !realm.entityAtTile(x, y)) { free = [x, y]; break; }
    let gems = 0, total = 0;
    for (let i = 0; i < 6000; i++) {
      const e = g.call('spawnNodeNatural', realm, plot, 'fieldstone_rock', free[0], free[1], rng);
      if (!e) continue;
      total++;
      if (e.kind === 'gem_node') gems++;
      realm.remove(e);
    }
    ok(total > 5000);
    near(gems / total, 0.03, 0.008, 'gem share 3%');
  });

  t.test('weather forecast is always true (three rolls ahead)', async () => {
    const h = await fresh(19, 1);
    const g = h.game;
    const st = clockState(g);
    for (const b of ['greenmarrow', 'umbral']) {
      const forecast = st.weather[b].queue.map((q) => q.id);
      const seen = [];
      let cur = st.weather[b].cur;
      for (let i = 0; i < 3; i++) {
        h.step(st.weather[b].left + 0.1);
        seen.push(st.weather[b].cur.id);
        ok(st.weather[b].cur !== cur, 'weather advanced');
        cur = st.weather[b].cur;
      }
      eq(seen, forecast, `forecast for ${b}`);
      eq(g.call('timeInfo', 4 * PLOT + 5, 4 * PLOT + 5).weather, b === 'greenmarrow' ? seen[2] : g.call('weatherOf', 'greenmarrow'));
    }
  });

  t.test('day/night phases and the clock world key', async () => {
    const h = await fresh(20);
    const g = h.game;
    // WP14 (P2-21): a new world opens in the morning (t = 150) with clear Greenmarrow weather
    eq(g.call('timeInfo').phase, 'day');
    eq(g.call('weatherOf', 'greenmarrow'), 'clear');
    clockState(g).t = 0;
    h.step(0.1);
    eq(g.call('timeInfo').phase, 'dawn');
    h.step(130);
    eq(g.call('timeInfo').phase, 'day');
    clockState(g).t = 959;
    h.step(1.5);
    eq(g.call('timeInfo').isNight, true);
    clockState(g).t = 1439.5;
    h.step(1);
    eq(g.call('timeInfo').day, 2);
    eq(g.call('timeInfo').phase, 'dawn');
    ok(g.worldState.clock.fc.greenmarrow.length === 3, 'forecast published');
  });

  t.test('Beacon needs every plot, castaway line and shrine of its biome', async () => {
    const h = await fresh(21);
    const g = h.game, realm = overworld(h);
    const clear = () => { for (const e of [...realm.entities.values()]) if (e.type === 'node' && e.x >= 4 * PLOT + 1 && e.x < 4 * PLOT + 6 && e.y >= 4 * PLOT + 13 && e.y < 4 * PLOT + 18) realm.remove(e); };
    const tryAt = () => { clear(); return g.call('canPlace', 'beacon_1', realm, 4 * PLOT + 2, 4 * PLOT + 14, null); };
    eq(tryAt().ok, false, 'no attunement yet');
    for (const [px, py] of GM_RING) h.raise(px, py);
    let a = g.call('attunement', 1);
    eq(a.plots, [9, 9]);
    eq(tryAt().ok, false, 'line and shrine missing');
    g.world.flags['line:npc_ferrin'] = true;
    eq(tryAt().ok, false, 'shrine missing');
    const shrinePlot = g.world.plots.find((p) => p.biome === 'greenmarrow' && p.feature === 'shrine');
    g.world.flags[`shrine:${shrinePlot.px},${shrinePlot.py}`] = true;
    a = g.call('attunement', 1);
    eq(a.ok, true);
    const r = tryAt();
    eq(r.ok, true, JSON.stringify(r));
    eq(g.call('canPlace', 'beacon_1', realm, 2 * PLOT + 8, 4 * PLOT + 8, null).ok, false, 'not on another biome');
    clear();
    const b = g.call('placeStructure', realm, 'beacon_1', 4 * PLOT + 2, 4 * PLOT + 14, 0, null, { force: true });
    ok(b, 'placed');
    eq(g.world.flags['beacon:1'], true, 'lit');
    near(g.stats.world().xpWorld, 0.05, 1e-9, '+5% world XP');
    ok(g.world.flags['gate:beacon_1'] != null, 'telemetry');
  });

  t.test('Treasury: glintMult, spend caps per day, big spends announced', async () => {
    const h = await fresh(22);
    const g = h.game, p = h.player(0);
    g.stats.addSource('test_glint', () => [{ stat: 'glintMult', op: 'add', v: 0.5 }]);
    g.call('addGlint', 100, 'test', p);
    eq(g.world.glint, 150);
    g.call('addGlint', 100, 'test', null);
    eq(g.world.glint, 250);
    g.world.spendCaps = { [p.token]: 100 };
    eq(g.call('spendGlint', 80, 'tempering', p), true);
    eq(g.call('spendGlint', 30, 'tempering', p), false, 'over the daily cap');
    eq(g.call('spendGlint', 30, 'land', p), true, 'land spending is not capped');
    clockState(g).day += 1;
    g.world.day += 1;
    eq(g.call('spendGlint', 30, 'tempering', p), true, 'cap resets each in-game day');
    eq(g.call('spendGlint', 1e9, 'tempering', p), false, 'treasury short');
    g.world.spendCaps = {};
    g.world.glint = 10000;
    h.clear(p);
    eq(g.call('spendGlint', 2500, 'tempering', p), true);
    ok(h.messages(p, 'chat').some((m) => /spent 2,500 on tempering/.test(m.text)), 'announced in chat');
  });

  t.test('charters: wild plots only, once per in-game day', async () => {
    const h = await fresh(23);
    const g = h.game, p = h.player(0);
    for (const [px, py] of GM_RING) h.raise(px, py);
    const wild = g.world.plots.find((q) => q.owned && q.feature === 'wild');
    const other = g.world.plots.find((q) => q.owned && q.feature !== 'wild');
    eq(h.do(p, 'charter.set', { px: other.px, py: other.py, charter: 'quarry' }).ok, false);
    eq(h.do(p, 'charter.set', { px: wild.px, py: wild.py, charter: 'nope' }).ok, false);
    eq(h.do(p, 'charter.set', { px: wild.px, py: wild.py, charter: 'workshop' }).ok, true);
    eq(g.call('featureAt', 'overworld', wild.px * PLOT + 5, wild.py * PLOT + 5).charter, 'workshop');
    eq(h.do(p, 'charter.set', { px: wild.px, py: wild.py, charter: 'garrison' }).err, 'cooldown');
    g.world.day += 1;
    eq(h.do(p, 'charter.set', { px: wild.px, py: wild.py, charter: 'garrison' }).ok, true);
  });

  t.test('every shrine puzzle type is solvable and pays once', async () => {
    const h = await fresh(24);
    const g = h.game, realm = overworld(h), p = h.player(0);
    const plots = [[4, 3], [3, 4], [5, 4], [4, 5], [5, 5]];
    const types = ['plates', 'braziers', 'blocks', 'tidelock', 'echo'];
    for (const [px, py] of plots) { g.world.plots[plotIndex(px, py)].feature = 'wild'; h.raise(px, py); }
    const shrines = types.map((type, i) => {
      const [px, py] = plots[i];
      const plot = g.world.plots[plotIndex(px, py)];
      for (const e of [...realm.entities.values()]) if (e.type === 'node' && Math.floor(e.x / PLOT) === px && Math.floor(e.y / PLOT) === py) realm.remove(e);
      return g.call('buildShrine', realm, plot, 10, 10, type);
    });
    const glint0 = g.world.glint;
    const use = (e) => { standAt(h, p, e.x, e.y + (e.data.solid ? 1.2 : 0)); return h.do(p, 'use', { id: e.id }); };
    // plates: step on them in the demonstrated order
    {
      const s = shrines[0];
      for (const i of s.data.seq) {
        const pl = pieceOf(g, s, i);
        standAt(h, p, pl.x, pl.y);
        h.step(0.15);
        standAt(h, p, pl.x, pl.y - 3);
        h.step(0.15);
      }
      eq(s.data.solved, true, 'plates');
    }
    // braziers: brute-force the lights-out solution
    {
      const s = shrines[1];
      const D = s.data, n = D.cols * D.rows;
      let sol = null;
      for (let mask = 0; mask < 1 << n && !sol; mask++) {
        const sim = { cols: D.cols, rows: D.rows, lit: D.lit.slice() };
        for (let i = 0; i < n; i++) if (mask & (1 << i)) toggleBraziers(sim, i);
        if (sim.lit.every(Boolean)) sol = mask;
      }
      ok(sol != null, 'brazier puzzle has a solution');
      for (let i = 0; i < n; i++) if (sol & (1 << i)) eq(use(pieceOf(g, s, i)).ok, true);
      eq(s.data.solved, true, 'braziers');
    }
    // blocks: replay the generator's pulls backwards as pushes
    {
      const s = shrines[2];
      ok(!s.data.solved);
      for (const [bi, dx, dy] of s.data.pulls.slice().reverse()) {
        const blk = pieceOf(g, s, 3 + bi);
        ok(moveBlock(g, s, blk, -dx, -dy), 'push');
      }
      eq(s.data.solved, true, 'blocks');
    }
    // tidelock: out of reach at high tide, reachable over the flats at low tide
    {
      const s = shrines[3];
      const ped = pieceOf(g, s, 0);
      standAt(h, p, ped.x, ped.y - 4.2);
      eq(h.do(p, 'use', { id: ped.id }).err, 'range');
      eq(realm.isWalkable(Math.floor(ped.x), Math.floor(ped.y) - 2), false, 'flats flooded');
      clockState(g).tide.left = 0.01;
      h.step(0.1);
      eq(realm.isWalkable(Math.floor(ped.x), Math.floor(ped.y) - 2), true, 'flats exposed');
      standAt(h, p, ped.x, ped.y - 1.2);
      eq(h.do(p, 'use', { id: ped.id }).ok, true);
      eq(s.data.solved, true, 'tidelock');
    }
    // echo: a wrong chime resets; the right sequence solves
    {
      const s = shrines[4];
      const wrong = (s.data.seq[0] + 1) % 5;
      use(pieceOf(g, s, wrong));
      eq(s.data.prog, 0);
      for (const i of s.data.seq) use(pieceOf(g, s, i));
      eq(s.data.solved, true, 'echo');
    }
    const tiers = shrines.map((s) => s.data.tier);
    eq(g.world.glint - glint0, tiers.reduce((a, t) => a + 100 * t * t, 0), 'Glint 100 * tier^2 each');
    ok(g.call('countItem', p, 'tide_token') >= 8, 'two tokens per shrine solved by the player (blocks were pushed by the test)');
    for (const s of shrines) ok(g.world.flags[`shrine:${s.data.px},${s.data.py}`]);
  });

  t.test('dig spots: 10 digs empty a spot; relics drop', async () => {
    const h = await fresh(25);
    const g = h.game, realm = overworld(h), p = h.player(0);
    h.raise(3, 4);
    g.world.flags['beacon:1'] = true;
    const plot = g.world.plots[plotIndex(2, 4)];
    plot.feature = 'dig';                         // a Saltfen dig site
    h.raise(2, 4);
    const spots = [...realm.entities.values()].filter((e) => e.kind === 'dig_spot');
    eq(spots.length, 6);
    const relics = spots.flatMap((s) => s.data.loot).filter((l) => l.item === 'relic_02' || l.item === 'relic_03');
    eq(relics.length, 2);
    const s = spots[0];
    standAt(h, p, s.x, s.y + 1);
    for (let i = 0; i < 10; i++) { h.do(p, 'use', { id: s.id }); h.step(0.35); }
    ok(s.removed, 'spot emptied');
    ok([...realm.entities.values()].some((e) => e.type === 'drop'), 'loot dropped');
  });

  t.test('waystones: 2 s channel, one per plot', async () => {
    const h = await fresh(26);
    const g = h.game, realm = overworld(h), p = h.player(0);
    h.raise(4, 3);
    const a = g.call('placeStructure', realm, 'waystone', 4 * PLOT + 4, 4 * PLOT + 15, 0, p, { free: true });
    const b = g.call('placeStructure', realm, 'waystone', 4 * PLOT + 10, 3 * PLOT + 10, 0, p, { free: true });
    ok(a && b, 'placed');
    eq(g.call('canPlace', 'waystone', realm, 4 * PLOT + 6, 4 * PLOT + 15, null).ok, false, 'one per plot');
    standAt(h, p, a.x, a.y + 1.2);
    eq(h.do(p, 'waystone.go', { id: b.id }).ok, true);
    h.step(1);
    ok(Math.abs(p.entity.y - (a.y + 1.2)) < 0.01, 'still channelling');
    h.step(1.2);
    ok(Math.hypot(p.entity.x - b.x, p.entity.y - b.y) < 2.5, 'arrived');
    standAt(h, p, 4 * PLOT + 10, 4 * PLOT + 2);
    eq(h.do(p, 'waystone.go', { id: a.id }).err, 'range', 'needs a Waystone (or Wayfarer)');
  });

  t.test('save and reload keep clock, charters, beacons and node tiers', async () => {
    const h = await fresh(27);
    const g = h.game;
    for (const [px, py] of GM_RING) h.raise(px, py);
    const wild = g.world.plots.find((q) => q.owned && q.feature === 'wild');
    h.do(h.player(0), 'charter.set', { px: wild.px, py: wild.py, charter: 'orchard' });
    h.step(250);                                // low tide with tidal nodes and a cache
    const st = clockState(g);
    const fc = st.weather.saltfen.queue.map((q) => q.id);
    const h2 = await h.reload();
    const g2 = h2.game;
    eq(clockState(g2).weather.saltfen.queue.map((q) => q.id), fc, 'forecast survives');
    near(clockState(g2).t, st.t, 0.05);
    eq(g2.world.charters[wild.px + ',' + wild.py].id, 'orchard');
    eq(g2.realms.get('overworld').lowTide, true);
    for (const e of g2.realms.get('overworld').entities.values()) if (e.type === 'node') ok(Number.isFinite(e.data.tier), `${e.kind} tier`);
    ok([...g2.realms.get('overworld').entities.values()].some((e) => e.kind === 'tidestone'), 'tidestone saved as a structure');
  });
}
