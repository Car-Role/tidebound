// WP4 tests: gathering, drops, inventory, crafting, stations, building, storage (TECH_SPEC 14 WP4).

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { T, FLAG } from '../shared/grid.js';

// A free, owned, buildable w x h spot near the player (no solids, no entities, plain biome ground).
function freeSpot(h, p, w = 1, hh = 1, opts = {}) {
  const realm = h.game.realms.get('overworld');
  const cx = Math.floor(p.entity.x), cy = Math.floor(p.entity.y);
  const okTile = (x, y) => {
    const g = realm.groundAt(x, y);
    if (!(g >= T.GREENMARROW && g <= T.UMBRAL) && g !== T.SAND) return false;
    if (!realm.hasFlag(x, y, FLAG.OWNED) || realm.hasFlag(x, y, FLAG.SOLID)) return false;
    if (realm.entityAtTile(x, y)) return false;
    if (Math.abs(x + 0.5 - p.entity.x) < 1.2 && Math.abs(y + 0.5 - p.entity.y) < 1.2) return false;
    return true;
  };
  for (let r = opts.minR ?? 1; r < 9; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      let all = true;
      for (let j = 0; j < hh && all; j++) for (let i = 0; i < w && all; i++) if (!okTile(x + i, y + j)) all = false;
      if (all) return { tx: x, ty: y };
    }
  }
  return null;
}

function clearAround(h, p, r = 6) {
  const realm = h.game.realms.get('overworld');
  for (const e of realm.query(p.entity.x, p.entity.y, r, [], (o) => o.type === 'node' || o.type === 'drop')) realm.remove(e);
}

const totalItems = (h, p) => p.inv.slots.reduce((m, s) => { if (s) m[s[0]] = (m[s[0]] || 0) + s[1]; return m; }, {});

async function setup(seed, n = 1) {
  const h = await createHarness({ seed, players: n });
  const p = h.player(0);
  h.setLevel(p, 30);
  clearAround(h, p, 7);
  h.step(0.05);
  return { h, p, realm: h.game.realms.get('overworld') };
}

export default async function (t) {
  // ------------------------------------------------------------------ gathering
  t.test('hook tier gating: too-weak hook does 10% damage and drops nothing', async () => {
    const { h, p, realm } = await setup(101);
    const spot = freeSpot(h, p);
    const node = h.game.call('spawnNode', realm, 'bogiron_vein', spot.tx, spot.ty);
    ok(node, 'node spawned');
    node.hp = 0.15; node.maxHp = 7;       // nearly broken
    const before = [...realm.entities.values()].filter((e) => e.type === 'drop').length;
    const r = h.game.call('hitNode', node, 1, { player: p });
    near(node.hp, 0.05, 1e-6, '0.1 x damage');
    eq(r.broken, false);
    const r2 = h.game.call('hitNode', node, 1, { player: p });
    eq(r2.broken, true);
    eq(r2.drops.length, 0, 'no drops with a weak hook');
    eq([...realm.entities.values()].filter((e) => e.type === 'drop').length, before);
    h.step(0.05);
    ok(h.messages(p, 'fx').some((m) => m.e.some((x) => x[0] === 'hit_clink')), 'clink fx');
    // with the right hook it drops ore
    p.gear.hook = 'hook_3';
    const n2 = h.game.call('spawnNode', realm, 'bogiron_vein', spot.tx, spot.ty);
    const r3 = h.game.call('hitNode', n2, 99, { player: p });
    ok(r3.broken && r3.drops.some((d) => d.item === 'bog_iron_ore'), 'drops with hook_3');
  });

  t.test('gather.swing: reach, cooldown, swing anim, XP on break', async () => {
    const { h, p, realm } = await setup(102);
    const spot = freeSpot(h, p);
    const node = h.game.call('spawnNode', realm, 'fieldstone_rock', spot.tx, spot.ty);
    realm.move(p.entity, node.x - 1, node.y);
    const xp0 = p.xp + p.level * 1e6;
    eq(h.do(p, 'gather.swing', { id: node.id }).ok, true);
    eq(p.entity.pub.a, 'swing');
    eq(h.do(p, 'gather.swing', { id: node.id }).err, 'cooldown');
    h.step(0.5);
    eq(p.entity.pub.a, 'idle', 'swing anim ends');
    for (let i = 0; i < 6 && !node.removed; i++) { h.do(p, 'gather.swing', { id: node.id }); h.step(0.5); }
    ok(node.removed, 'broken in 3 hits');
    ok(p.xp + p.level * 1e6 > xp0, 'xp granted');
    realm.move(p.entity, node.x + 8, node.y);
    const far = h.game.call('spawnNode', realm, 'fieldstone_rock', spot.tx, spot.ty);
    eq(h.do(p, 'gather.swing', { id: far.id }).err, 'range');
  });

  t.test('drop quantities follow floor(base*yield+rand) and the x3 yield cap', async () => {
    const { h, p, realm } = await setup(103);
    h.game.stats.addSource('t-yield', (pl) => (pl === p ? [{ stat: 'yieldAll', op: 'add', v: 5 }, { stat: 'yieldWood', op: 'add', v: 5 }] : []));
    h.game.stats.invalidate(p);
    const spot = freeSpot(h, p);
    let total = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const node = h.game.call('spawnNode', realm, 'bentwood_tree', spot.tx, spot.ty);
      node.set('big', 0);
      const r = h.game.call('hitNode', node, 99, { player: p, collect: true });
      const dw = r.drops.find((d) => d.item === 'driftwood');
      ok(dw.qty >= 6 && dw.qty <= 9, `capped at x3 (got ${dw.qty})`);
      total += dw.qty; n++;
    }
    near(total / n, 7.5, 0.6, 'mean 2.5 * 3');
    // big node x3 drops
    const big = h.game.call('spawnNode', realm, 'copper_vein', spot.tx, spot.ty);
    big.set('big', 1);
    const rb = h.game.call('hitNode', big, 99, { player: p, collect: true });
    eq(rb.drops.find((d) => d.item === 'copper_ore').qty, 2 * 3 * 3, 'big x3 on top of yield x3');
  });

  t.test('hitNode on behalf of a machine (collect, no XP) and of an ability (player, ignoreTier)', async () => {
    const { h, p, realm } = await setup(104);
    const spot = freeSpot(h, p);
    const events = [];
    h.game.bus.on('node.broken', (e) => events.push(e));
    const n1 = h.game.call('spawnNode', realm, 'copper_vein', spot.tx, spot.ty);
    const drops0 = [...realm.entities.values()].filter((e) => e.type === 'drop').length;
    const xp0 = p.xp;
    const r1 = h.game.call('hitNode', n1, 99, { byMachine: true });
    ok(r1.broken && r1.drops.length > 0);
    eq([...realm.entities.values()].filter((e) => e.type === 'drop').length, drops0, 'machine collects, no ground drops');
    eq(events.at(-1).byMachine, true);
    eq(p.xp, xp0);
    const n2 = h.game.call('spawnNode', realm, 'rime_vein', spot.tx, spot.ty);
    const r2 = h.game.call('hitNode', n2, 999, { player: p, ignoreTier: true, yieldMult: 2 });
    ok(r2.broken && r2.drops.find((d) => d.item === 'rime_ore').qty >= 4, 'ability ignores tier and doubles');
    ok([...realm.entities.values()].filter((e) => e.type === 'drop').length > drops0, 'ability drops spawn on the ground');
    eq(events.at(-1).player, p);
  });

  t.test('drops burst, magnet to the nearest player after 0.25 s, pick up into the inventory', async () => {
    const { h, p, realm } = await setup(105);
    const d = h.game.call('dropItem', realm, p.entity.x + 1.6, p.entity.y, 'driftwood', 5, { vx: 3, vy: 0 });
    const x0 = d.x;
    h.step(0.1);
    ok(d.x > x0, 'pop velocity moves it outward');
    eq(h.game.inv.count(p.inv, 'driftwood'), 0, 'not before the magnet delay');
    h.step(1.0);
    ok(d.removed, 'absorbed');
    eq(h.game.inv.count(p.inv, 'driftwood'), 5);
    const gain = h.sent(p, 'self', 'gain');
    ok(gain && gain.d.l.some(([it, q]) => it === 'driftwood' && q === 5), 'gain feed');
    // a just-dropped stack is locked for the dropper
    const slot = p.inv.slots.findIndex((s) => s && s[0] === 'driftwood');
    eq(h.do(p, 'inv.drop', { slot, qty: 2 }).ok, true);
    h.step(0.6);
    eq(h.game.inv.count(p.inv, 'driftwood'), 3, 'dropper cannot re-grab immediately');
    h.step(2.0);
    eq(h.game.inv.count(p.inv, 'driftwood'), 5, 'picked up after the lock');
    // full inventory: no magnet
    for (let i = 0; i < p.inv.slots.length; i++) p.inv.slots[i] = ['plank', 999];
    const d2 = h.game.call('dropItem', realm, p.entity.x + 1, p.entity.y, 'shell', 1);
    h.step(1);
    ok(!d2.removed, 'stays on the ground when full');
  });

  t.test('identical resting drops merge; drops despawn after 5 minutes', async () => {
    const { h, p, realm } = await setup(106);
    realm.move(p.entity, p.entity.x - 6, p.entity.y);
    const a = h.game.call('dropItem', realm, p.entity.x + 6, p.entity.y, 'resin', 2);
    const b = h.game.call('dropItem', realm, p.entity.x + 6.3, p.entity.y, 'resin', 3);
    h.step(1.1);
    eq(a.removed !== b.removed, true, 'one merged into the other');
    eq((a.removed ? b : a).pub.q, 5);
    h.step(301);
    ok(a.removed && b.removed, 'despawned');
  });

  // ------------------------------------------------------------------ inventory
  t.test('inventory: move, split, merge, swap, hotbar refs follow, sort', async () => {
    const { h, p } = await setup(107);
    h.give(p, 'driftwood', 30); h.give(p, 'fieldstone', 10);
    const s0 = p.inv.slots.findIndex((s) => s && s[0] === 'driftwood');
    eq(h.do(p, 'inv.hotbar', { slot: s0, bar: 2 }).ok, true);
    eq(p.hotbar[2], s0);
    eq(h.do(p, 'inv.move', { from: s0, to: 20, qty: 10 }).ok, true, 'split');
    eq(p.inv.slots[s0][1], 20); eq(p.inv.slots[20], ['driftwood', 10]);
    eq(h.do(p, 'inv.move', { from: s0, to: 15 }).ok, true, 'full move');
    eq(p.hotbar[2], 15, 'hotbar ref followed the stack');
    eq(h.do(p, 'inv.move', { from: 20, to: 15 }).ok, true, 'merge');
    eq(p.inv.slots[15], ['driftwood', 30]);
    const fs = p.inv.slots.findIndex((s) => s && s[0] === 'fieldstone');
    eq(h.do(p, 'inv.move', { from: fs, to: 15 }).ok, true, 'swap');
    eq(p.inv.slots[15][0], 'fieldstone'); eq(p.hotbar[2], fs, 'swapped ref');
    eq(h.do(p, 'inv.sort', {}).ok, true);
    eq(p.inv.slots[p.hotbar[2]][0], 'driftwood', 'ref follows item through sort');
    eq(h.do(p, 'inv.move', { from: 99, to: 1 }).ok, false);
  });

  // ------------------------------------------------------------------ crafting
  t.test('hand and bench crafting: atomic, queued, needs the bench, XP and item.crafted', async () => {
    const { h, p, realm } = await setup(108);
    const crafted = [];
    h.game.bus.on('item.crafted', (e) => crafted.push(e));
    h.give(p, 'cloth', 3);
    eq(h.do(p, 'craft.make', { recipe: 'r_bandage', qty: 5 }).ok, true);
    h.step(10);
    eq(h.game.inv.count(p.inv, 'bandage'), 1, 'only what the inputs allowed');
    eq(h.game.inv.count(p.inv, 'cloth'), 1, 'leftover cloth untouched');
    // bench recipe needs a Workbench nearby
    h.give(p, 'stiltwood', 4);
    eq(h.do(p, 'craft.make', { recipe: 'r_plank', qty: 1 }).err, 'range');
    const spot = freeSpot(h, p, 2, 1);
    h.give(p, 'driftwood', 10); h.give(p, 'fieldstone', 6);
    eq(h.do(p, 'build.place', { kind: 'workbench', tx: spot.tx, ty: spot.ty, rot: 0 }).ok, true);
    eq(h.do(p, 'craft.make', { recipe: 'r_plank', qty: 2 }).ok, true);
    h.step(5);
    eq(h.game.inv.count(p.inv, 'plank'), 4, 'tier-2 wood gives 2 planks each');
    ok(crafted.some((c) => c.item === 'plank' && c.qty === 2 && c.player === p));
    // cancel refunds the running craft
    h.give(p, 'copper_bar', 1);
    h.do(p, 'craft.make', { recipe: 'r_gear_part', qty: 1 });
    h.step(0.5);
    eq(h.game.inv.count(p.inv, 'copper_bar'), 0, 'inputs taken when the craft starts');
    eq(h.do(p, 'craft.make', { cancel: 0 }).ok, true);
    eq(h.game.inv.count(p.inv, 'copper_bar'), 1, 'refunded');
    eq(h.do(p, 'craft.make', { recipe: 'r_hook_2', qty: 1 }).err, 'invalid', 'anvil recipes are not bench crafts');
  });

  t.test('self.recipes lists recipes whose unlocks hold', async () => {
    const h = await createHarness({ seed: 109, players: 1 });
    const p = h.player(0);
    const r = h.sent(p, 'welcome').self.recipes;
    ok(r.includes('r_plank') && r.includes('r_copper_bar'));
    ok(!r.includes('r_fen_stew'), 'quest-locked recipe hidden');
    h.game.world.flags['quest:s_odalys_3'] = true;
    h.step(1.1);
    ok(h.sent(p, 'self', 'recipes').d.includes('r_fen_stew'), 'recomputed after unlock');
  });

  // ------------------------------------------------------------------ stations
  t.test('Kiln: 3 inputs + fuel meter, first-match in data order, pinned recipe, output', async () => {
    const { h, p, realm } = await setup(110);
    const spot = freeSpot(h, p, 2, 2);
    h.give(p, 'fieldstone', 20); h.give(p, 'peat', 6);
    eq(h.do(p, 'build.place', { kind: 'kiln', tx: spot.tx, ty: spot.ty, rot: 0 }).ok, true);
    const kiln = realm.entityAtTile(spot.tx, spot.ty, 'structure');
    // first-match: ballast_1 (fieldstone 3 + copper bar) wins over brick (fieldstone 2) and copper bar
    eq(h.game.call('insertInto', kiln, 'fieldstone', 3), 3);
    eq(h.game.call('insertInto', kiln, 'copper_bar', 1), 1);
    eq(h.game.call('insertInto', kiln, 'copper_ore', 2), 2);
    eq(h.game.call('insertInto', kiln, 'shell', 1), 0, 'non-input rejected');
    h.step(3);
    eq(kiln.data.st.cur, null, 'no fuel, no smelt');
    eq(kiln.data.st.status, 'nofuel');
    eq(h.game.call('insertInto', kiln, 'charcoal', 2, { slot: 'fuel' }), 2);
    h.step(6.2);
    const out = h.game.call('extractFrom', kiln, null, 99);
    eq(out, { item: 'ballast_1', qty: 1 }, 'first match');
    eq(kiln.data.st.meter, 1, 'charcoal = 2 units, 1 used');
    // pinned: queue copper bars even though brick inputs are present
    h.game.call('insertInto', kiln, 'fieldstone', 2);
    h.give(p, 'copper_ore', 2);
    realm.move(p.entity, kiln.x - 2, kiln.y);
    eq(h.do(p, 'station.queue', { id: kiln.id, recipe: 'r_copper_bar', qty: 2 }).ok, true);
    h.step(8.3);
    eq(h.game.call('extractFrom', kiln, null, 99), { item: 'copper_bar', qty: 2 }, 'pinned recipe ran first');
    eq(kiln.data.st.queue.length, 0, 'queue drained, back to first-match');
  });

  t.test('Kiln II / III divide base times by 2 / 4', async () => {
    const { h, p, realm } = await setup(111);
    h.game.world.flags['beacon:2'] = true; h.game.world.flags['beacon:4'] = true;
    const times = {};
    for (const kind of ['kiln', 'kiln_2', 'kiln_3']) {
      const spot = freeSpot(h, p, 2, 2);
      const k = h.game.call('placeStructure', realm, kind, spot.tx, spot.ty, 0, p, { free: true });
      ok(k, kind + ' placed');
      h.game.call('insertInto', k, 'peat', 5, { slot: 'fuel' });
      h.game.call('insertInto', k, 'copper_ore', 2);
      let t0 = 0;
      while (!k.data.st.slots[k.data.st.outIdx] && t0 < 10) { h.step(0.05); t0 += 0.05; }
      times[kind] = t0;
    }
    near(times.kiln, 4, 0.11); near(times.kiln_2, 2, 0.11); near(times.kiln_3, 1, 0.11);
  });

  t.test('insertInto / extractFrom on every station kind', async () => {
    const { h, p, realm } = await setup(112);
    for (const f of ['beacon:1', 'beacon:2', 'beacon:3', 'beacon:4', 'beacon:5']) h.game.world.flags[f] = true;
    const stations = h.game.content.structures.filter((s) => s.station && !s.station.hand);
    for (const def of stations) {
      const spot = freeSpot(h, p, def.w, def.h);
      const e = h.game.call('placeStructure', realm, def.id, spot.tx, spot.ty, 0, p, { free: true });
      ok(e, def.id + ' placed');
      const r = h.game.content.recipes.find((rc) => rc.station === def.id && rc.in.every((i) => i.item) && !(rc.unlock || []).length);
      ok(r, 'a recipe for ' + def.id);
      for (const i of r.in) eq(h.game.call('insertInto', e, i.item, i.qty), i.qty, `${def.id} accepts ${i.item}`);
      if (r.fuel) h.game.call('insertInto', e, 'brimstone', 10, { slot: 'fuel' });
      h.step(r.time / (def.station.speed || 1) + 0.3);
      const out = h.game.call('extractFrom', e, (it) => it === r.out.item, 99);
      eq(out?.item, r.out.item, `${def.id} produced ${r.out.item}`);
      h.game.call('removeStructure', e, {});
    }
  });

  // ------------------------------------------------------------------ building
  t.test('placement validators are chained: terrain, ownership, overlap, cost, unlock, extra validators', async () => {
    const { h, p, realm } = await setup(113);
    h.give(p, 'driftwood', 50); h.give(p, 'fieldstone', 50);
    const spot = freeSpot(h, p, 2, 1);
    let calls = 0;
    h.game.call('registerPlaceValidator', (kind) => { calls++; return kind === 'campfire' ? { ok: false, err: 'denied' } : null; });
    eq(h.game.call('canPlace', 'workbench', realm, spot.tx, spot.ty, p).ok, true);
    ok(calls > 0, 'extra validator consulted');
    eq(h.game.call('canPlace', 'campfire', realm, spot.tx, spot.ty, p).err, 'denied', 'extra validator can veto');
    eq(h.game.call('canPlace', 'workbench', realm, 1, 1, p).err, 'denied', 'unowned water');
    eq(h.game.call('canPlace', 'stockpile', realm, spot.tx, spot.ty, p).err, 'cost', 'no planks');
    h.setLevel(p, 1);
    eq(h.game.call('canPlace', 'kiln', realm, spot.tx, spot.ty, p).err, 'locked', 'kiln needs level 2');
    h.setLevel(p, 30);
    eq(h.do(p, 'build.place', { kind: 'workbench', tx: spot.tx, ty: spot.ty, rot: 0 }).ok, true);
    eq(h.game.call('canPlace', 'workbench', realm, spot.tx, spot.ty, p).err, 'busy', 'overlap');
    const node = h.game.call('spawnNode', realm, 'reed_clump', spot.tx, spot.ty - 1) ?? h.game.call('spawnNode', realm, 'reed_clump', spot.tx, spot.ty + 1);
    if (node) eq(h.game.call('canPlace', 'campfire', realm, node.data.tx, node.data.ty, p).err, 'busy');
    // rotation swaps the footprint
    const v = freeSpot(h, p, 1, 2, { minR: 2 });
    const res = h.do(p, 'build.place', { kind: 'workbench', tx: v.tx, ty: v.ty, rot: 1 });
    eq(res.ok, true, JSON.stringify(res));
    const wb = realm.entityAtTile(v.tx, v.ty + 1, 'structure');
    ok(wb && wb.data.w === 1 && wb.data.h === 2, 'rotated 1x2');
    ok(realm.hasFlag(v.tx, v.ty + 1, FLAG.SOLID));
  });

  t.test('place + remove with every discount active never increases any item count (B2)', async () => {
    const { h, p, realm } = await setup(114);
    h.game.stats.addSource('t-disc', (pl) => (pl === p ? [{ stat: 'structCost', op: 'add', v: -0.9 }] : []));
    let full = false;
    h.game.stats.addFlagSource('t-f4', (pl) => (pl === p && full ? ['refund_full'] : []));
    h.game.stats.invalidate(p);
    for (const f of ['beacon:1', 'beacon:2', 'beacon:3', 'beacon:4', 'beacon:5', 'skill:F3', 'skill:H7']) h.game.world.flags[f] = true;
    const kinds = ['campfire', 'workbench', 'kiln', 'loom', 'anvil', 'stockpile', 'cookpot', 'lamp', 'wall', 'scarecrow', 'kiln_2', 'brine_locker'];
    for (const fullRefund of [false, true]) {
      full = fullRefund; h.game.stats.invalidate(p);
      for (const kind of kinds) {
        const def = h.game.content.structures.byId[kind];
        for (const c of def.cost) h.give(p, c.item, c.qty * 3);
        const before = totalItems(h, p);
        const spot = freeSpot(h, p, def.w, def.h);
        const res = h.do(p, 'build.place', { kind, tx: spot.tx, ty: spot.ty, rot: 0 });
        eq(res.ok, true, kind + ' ' + JSON.stringify(res));
        const e = realm.entityAtTile(spot.tx, spot.ty, 'structure');
        for (const c of e.data.paid) eq(c.qty, Math.max(1, Math.round(def.cost.find((x) => x.item === c.item).qty * 0.75)), kind + ' discount capped at 25%');
        eq(h.do(p, 'build.remove', { id: e.id }).ok, true);
        const after = totalItems(h, p);
        for (const [item, q] of Object.entries(after)) ok(q <= (before[item] || 0), `${kind}: ${item} ${q} <= ${before[item] || 0}`);
        if (fullRefund) for (const c of def.cost) eq(after[c.item], before[c.item], `${kind} F4 refund is exact`);
      }
    }
  });

  t.test('world structures cannot be removed; grief guard on fresh structures of others', async () => {
    const { h, p, realm } = await setup(115, 2);
    const q = h.player(1);
    realm.move(q.entity, p.entity.x + 0.5, p.entity.y);
    const spot = freeSpot(h, p);
    const w = h.game.call('placeStructure', realm, 'waystone', spot.tx, spot.ty, 0, p, { free: true });
    eq(h.do(p, 'build.remove', { id: w.id }).err, 'denied');
    ok(!w.removed);
    const s2 = freeSpot(h, p);
    h.give(p, 'plank', 12);
    eq(h.do(p, 'build.place', { kind: 'stockpile', tx: s2.tx, ty: s2.ty }).ok, true);
    const sp = realm.entityAtTile(s2.tx, s2.ty, 'structure');
    h.connOf(q).loopback = false; q.conn.loopback = false;
    eq(h.do(q, 'build.remove', { id: sp.id }).err, 'denied', 'other player within 10 min');
    h.game.playtimeS += 601;
    eq(h.do(q, 'build.remove', { id: sp.id }).ok, true, 'allowed later');
    eq(h.game.inv.count(q.inv, 'plank'), 9, 'refund goes to the remover (75%)');
  });

  t.test('Waystone pays rares of the plot tier and scales with coopScale', async () => {
    const { h, p } = await setup(116);
    h.game.world.flags['skill:T3'] = true;
    h.game.services.register('coopScale', () => 1.7);
    h.give(p, 'brick', 40); h.give(p, 'shell', 10);
    const spot = freeSpot(h, p);
    const res = h.do(p, 'build.place', { kind: 'waystone', tx: spot.tx, ty: spot.ty });
    eq(res.ok, true, JSON.stringify(res));
    eq(h.game.inv.count(p.inv, 'brick'), 40 - 34, 'ceil(20 * 1.7)');
    eq(h.game.inv.count(p.inv, 'shell'), 10 - 7, 'ceil(4 * 1.7) shells');
  });

  // ------------------------------------------------------------------ storage
  t.test('Stockpile shared container via inv.move; Brinelocker colour networks share one inventory', async () => {
    const { h, p, realm } = await setup(117, 2);
    const q = h.player(1);
    realm.move(q.entity, p.entity.x, p.entity.y + 0.5);
    h.game.world.flags['skill:F3'] = true;
    h.give(p, 'plank', 200); h.give(p, 'iron_plate', 30);
    const s1 = freeSpot(h, p);
    eq(h.do(p, 'build.place', { kind: 'stockpile', tx: s1.tx, ty: s1.ty }).ok, true);
    const sp = realm.entityAtTile(s1.tx, s1.ty, 'structure');
    h.step(1.1);
    eq(h.game.call('containerOf', sp).slots.length, 32, 'F3 +8 slots');
    eq(h.do(p, 'use', { id: sp.id }).ok, true);
    eq(h.sent(p, 'self', 'ui').d.kind, 'storage');
    const ps = p.inv.slots.findIndex((s) => s && s[0] === 'plank');
    eq(h.do(p, 'inv.move', { src: 'self', from: ps, dst: sp.id, to: -1, qty: 5 }).ok, true);
    eq(h.game.call('containerOf', sp).slots[0], ['plank', 5]);
    h.do(q, 'use', { id: sp.id });
    eq(h.do(q, 'inv.move', { src: sp.id, from: 0, dst: 'self', to: -1 }).ok, true, 'other player takes');
    eq(h.game.inv.count(q.inv, 'plank'), 5);
    // Brinelockers
    const a = freeSpot(h, p, 2, 1);
    eq(h.do(p, 'build.place', { kind: 'brine_locker', tx: a.tx, ty: a.ty, colour: 3 }).ok, true);
    const la = realm.entityAtTile(a.tx, a.ty, 'structure');
    const b = freeSpot(h, p, 2, 1);
    eq(h.do(p, 'build.place', { kind: 'brine_locker', tx: b.tx, ty: b.ty, colour: 3 }).ok, true);
    const lb = realm.entityAtTile(b.tx, b.ty, 'structure');
    const c = freeSpot(h, p, 2, 1);
    eq(h.do(p, 'build.place', { kind: 'brine_locker', tx: c.tx, ty: c.ty, colour: 5 }).ok, true);
    const lc = realm.entityAtTile(c.tx, c.ty, 'structure');
    eq(h.game.call('insertInto', la, 'pearl', 7), 7);
    eq(h.game.call('containerOf', lb).slots.find(Boolean), ['pearl', 7], 'same colour shares');
    eq(h.game.call('containerOf', lc).slots.find(Boolean), undefined, 'other colour is separate');
    eq(h.game.call('containerOf', la).slots.length, 60);
    eq(h.do(p, 'inv.sort', { src: lc.id, colour: 3 }).ok, true, 'recolour');
    eq(h.game.call('extractFrom', lc, null, 99), { item: 'pearl', qty: 7 });
    // removing a locker keeps the network contents; removing a stockpile spills
    h.game.call('insertInto', sp, 'resin', 4);
    h.do(p, 'build.remove', { id: sp.id });
    h.step(0.1);
    ok([...realm.entities.values()].some((e) => e.type === 'drop' && e.pub.it === 'resin'), 'stockpile contents spill');
  });

  t.test('station and storage state survive save -> load', async () => {
    const { h, p, realm } = await setup(118);
    h.game.world.flags['skill:F3'] = true;
    const spot = freeSpot(h, p, 2, 2);
    const k = h.game.call('placeStructure', realm, 'kiln', spot.tx, spot.ty, 0, p, { free: true });
    h.game.call('insertInto', k, 'copper_ore', 6); h.game.call('insertInto', k, 'peat', 3, { slot: 'fuel' });
    h.step(1);
    const s2 = freeSpot(h, p, 2, 1);
    const lk = h.game.call('placeStructure', realm, 'brine_locker', s2.tx, s2.ty, 0, p, { free: true, data: { colour: 2 } });
    h.game.call('insertInto', lk, 'amber', 9);
    const h2 = await h.reload();
    const k2 = h2.game.realms.get('overworld').entities.get(k.id);
    ok(k2 && k2.data.st.slots.some((s) => s && s[0] === 'copper_ore'), 'kiln slots restored');
    const lk2 = h2.game.realms.get('overworld').entities.get(lk.id);
    eq(h2.game.call('containerOf', lk2).slots.find(Boolean), ['amber', 9], 'locker network restored');
    h2.addPlayer({ token: p.token });
    h2.step(8.5);
    ok(k2.data.st.slots[k2.data.st.outIdx], 'kiln keeps working after load');
  });
}
