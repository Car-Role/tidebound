// WP1 core tests: shared helpers, server skeleton, client pure modules.

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { createRng, hash2D, weightedPick, seededShuffle } from '../shared/rng.js';
import { step, createBody, copyBody } from '../shared/rules/movement.js';
import { T, biomeOf, isGroundWalkable } from '../shared/grid.js';
import { validatePingMark, validateHello, validateInput, PROTOCOL_VERSION, ACTIONS, facingFromVector } from '../shared/protocol.js';
import { SERVICE_NAMES } from '../server/game/services.js';
import * as invOps from '../server/game/inventory.js';
import { resolveStatic } from '../server/http-static.js';
import { systems as defaultSystems, SYSTEM_ORDER } from '../server/game/systems/index.js';
import { ACTIVE_DIST } from '../server/game/systems/movement.js';
import { content } from '../shared/data/index.js';
import { PAL, RAMPS, PALETTE_CHARS } from '../client/art/palette.js';
import { parseSprite, resolveDefs } from '../client/art/spritegen.js';
import coreSprites from '../client/art/sprites/core.js';
import { Prediction } from '../client/net/prediction.js';
import { InterpBuffer } from '../client/net/interp.js';
import { Store } from '../client/state/store.js';
import { GLYPHS } from '../client/render/text.js';
import { define, emit, update, liveCount } from '../client/fx/particles.js';

const openWorld = () => true;

export default async function (t) {
  // ------------------------------------------------------------ shared

  t.test('rng is deterministic and forks independently', () => {
    const a = createRng(42), b = createRng(42);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    eq(sa, sb);
    const f1 = createRng(42).fork('mobs'), f2 = createRng(42).fork('mobs'), f3 = createRng(42).fork('loot');
    eq(f1.next(), f2.next());
    ok(f1.next() !== f3.next(), 'different fork names differ');
    eq(hash2D(3, 7, 9), hash2D(3, 7, 9));
    for (let i = 0; i < 200; i++) { const v = a.int(2, 5); ok(v >= 2 && v <= 5); }
    eq(seededShuffle([1, 2, 3, 4, 5], 7), seededShuffle([1, 2, 3, 4, 5], 7));
    eq(weightedPick([{ id: 'a', weight: 0 }, { id: 'b', weight: 1 }], 'weight', () => 0.5).id, 'b');
  });

  t.test('biome rule matches DESIGN 4.2 counts', () => {
    const counts = {};
    for (let py = 0; py < 9; py++) for (let px = 0; px < 9; px++) counts[biomeOf(px, py)] = (counts[biomeOf(px, py)] || 0) + 1;
    eq(Object.fromEntries(Object.entries(counts).sort()), { emberreach: 15, glasswaste: 15, greenmarrow: 9, hoarfrost: 15, saltfen: 15, umbral: 12 });
    ok(!isGroundWalkable(T.TIDAL, false) && isGroundWalkable(T.TIDAL, true), 'tidal walkable only at low tide');
  });

  t.test('movement step is deterministic and respects max speed', () => {
    const a = createBody(10, 10), b = createBody(10, 10);
    const inputs = [];
    const r = createRng(5);
    for (let i = 0; i < 100; i++) inputs.push({ mx: r.int(-1, 1), my: r.int(-1, 1), b: r.chance(0.05) ? 4 : 0, dt: r.int(16, 60) });
    for (const inp of inputs) { step(a, inp, null, inp.dt / 1000, openWorld); step(b, inp, null, inp.dt / 1000, openWorld); }
    eq(copyBody(a), copyBody(b));
    const c = createBody(0, 0);
    for (let i = 0; i < 40; i++) step(c, { mx: 1, my: 1, b: 0 }, null, 0.05, openWorld);
    near(Math.hypot(c.vx, c.vy), 5, 1e-9, 'diagonal speed normalised to 5');
    const d = createBody(0, 0);
    step(d, { mx: 1, my: 0, b: 0 }, { moveSpeed: 0.5 }, 1, openWorld);
    near(d.vx, 7.5, 1e-9, 'moveSpeed fraction');
  });

  t.test('collision keeps the body out of blocked tiles', () => {
    const wall = (tx) => tx < 5;            // tiles x >= 5 are blocked
    const body = createBody(3, 3.5);
    for (let i = 0; i < 60; i++) step(body, { mx: 1, my: 0.3, b: 0 }, null, 0.05, (tx) => wall(tx));
    ok(body.x <= 5 - 0.3 + 1e-9, `x stays left of wall (x=${body.x})`);
    ok(body.y > 3.5, 'slides along the wall');
    const dodge = createBody(3, 3.5);
    step(dodge, { mx: 1, my: 0, b: 4 }, null, 0.05, (tx) => wall(tx));
    for (let i = 0; i < 10; i++) step(dodge, { mx: 1, my: 0, b: 0 }, null, 0.05, (tx) => wall(tx));
    ok(dodge.x <= 4.7 + 1e-9, 'dodge cannot tunnel');
  });

  t.test('protocol validators', () => {
    eq(validatePingMark({ x: 1, y: 2, kind: 'danger' }).kind, 'danger');
    eq(validatePingMark({ x: 1, y: 2, kind: 'nope' }).kind, 'look');
    eq(validatePingMark({ x: 'a', y: 2 }), null);
    ok(ACTIONS.includes('ping.mark') && ACTIONS.includes('use'));
    eq(validateHello({ t: 'hello', v: PROTOCOL_VERSION, token: 'abcdefgh12', name: '  Ada  ', color: 9 }).hello, { token: 'abcdefgh12', name: 'Ada', color: 0 });
    eq(validateHello({ t: 'hello', v: 999, token: 'abcdefgh12', name: 'x' }).reason, 'version');
    eq(validateHello({ t: 'hello', v: PROTOCOL_VERSION, token: 'abcdefgh12', name: '\u0001' }).reason, 'name');
    eq(validateInput({ n: 3, mx: 5, my: -0.5, dt: 50 }).mx, 1);
    eq(facingFromVector(0, 1), 2);
    eq(facingFromVector(-1, 0), 4);
  });

  t.test('static server never leaves client/ and shared/', () => {
    ok(resolveStatic('/').endsWith('index.html'));
    ok(resolveStatic('/client/main.js'));
    ok(resolveStatic('/shared/config.js'));
    eq(resolveStatic('/server/main.js'), null);
    eq(resolveStatic('/client/../server/main.js'), null);
    eq(resolveStatic('/client/%2e%2e/server/main.js'), null);
    eq(resolveStatic('/package.json'), null);
  });

  t.test('inventory ops', () => {
    const stack = (id) => (id === 'big' ? 999 : 10);
    const inv = invOps.createInventory(3);
    eq(invOps.add(inv, 'a', 25, stack), 0);
    eq(invOps.count(inv, 'a'), 25);
    eq(invOps.add(inv, 'b', 5, stack), 5, 'no room left');
    eq(invOps.firstFit(inv, 'a', stack), 2);
    ok(invOps.has(inv, [{ item: 'a', qty: 20 }]));
    ok(!invOps.removeAll(inv, [{ item: 'a', qty: 20 }, { item: 'b', qty: 1 }]), 'atomic remove fails');
    eq(invOps.count(inv, 'a'), 25, 'nothing removed on failure');
    eq(invOps.remove(inv, 'a', 7), 7);
    eq(invOps.count(inv, 'a'), 18);
    const other = invOps.createInventory(2);
    ok(invOps.move(inv, 0, other, 1, 4, stack));
    eq(invOps.count(other, 'a'), 4);
    eq(invOps.toJSON(invOps.fromJSON(invOps.toJSON(inv), 3)), invOps.toJSON(inv));
  });

  // ------------------------------------------------------------ server

  t.test('every system is listed in order and every service has a default', async () => {
    eq(defaultSystems.map((s) => s.name), [...SYSTEM_ORDER]);
    const h = await createHarness({ seed: 3, players: 0 });
    for (const name of SERVICE_NAMES) ok(h.game.services.has(name), `service ${name}`);
    const spec = ['damage', 'heal', 'applyStatus', 'clearStatus', 'spawnMob', 'registerBossScript', 'startBoss', 'disableStructure',
      'giveItem', 'takeItems', 'countItem', 'dropItem', 'hitNode', 'placeStructure', 'removeStructure', 'canPlace',
      'registerPlaceValidator', 'containerOf', 'insertInto', 'extractFrom', 'registerIO', 'registerInteract', 'addGlint',
      'spendGlint', 'landCostNext', 'ballastFor', 'featureAt', 'timeInfo', 'spawnNode', 'respawnNodes', 'nodesInRadius',
      'grantXp', 'queueDraft', 'hasUnlock', 'addBuff', 'removeBuff', 'machineSpeed', 'disableMachine', 'machineClusters',
      'refillTend', 'farmTend', 'growCrops', 'rollFish', 'sellItems', 'shopStock', 'createInstance', 'rollVaultLoot',
      'counter', 'coopScale', 'boundCount', 'partyAverageLevel', 'isHost', 'movePlayer', 'toast'];
    for (const name of spec) ok(h.game.services.has(name), `spec service ${name}`);
  });

  t.test('starting island: land in the middle, water around, nodes populated', async () => {
    const h = await createHarness({ seed: 11, players: 0 });
    const realm = h.game.realms.get('overworld');
    eq(realm.groundAt(90, 90), T.GREENMARROW);
    eq(realm.groundAt(10, 10), T.DEEP);
    eq(realm.groundAt(80, 90) === T.TIDAL || realm.groundAt(80, 90) === T.SAND, true, 'shore at plot edge');
    let shallow = 0;
    for (let x = 75; x < 80; x++) if (realm.groundAt(x, 90) === T.SHALLOW) shallow++;
    eq(shallow, 1, 'one shallow tile ring');
    const nodes = [...realm.entities.values()].filter((e) => e.type === 'node');
    ok(nodes.length >= 6, 'nodes spawned on the start plot');
    ok(h.raise(3, 4), 'raise neighbour');
    ok(realm.isWalkable(80, 90), 'shared edge re-stamped as land');
  });

  t.test('server movement acks inputs and blocks water', async () => {
    const h = await createHarness({ seed: 2, players: 1 });
    const p = h.player(0);
    h.input(p, { mx: 1, my: 0 });
    h.step(1);
    eq(p.ack, 20);
    near(p.entity.x, 90 + 4.9, 0.11);
    h.step(10);
    const realm = h.game.realms.get('overworld');
    ok(realm.isWalkable(Math.floor(p.entity.x + 0.29), Math.floor(p.entity.y)), 'stopped before water');
    const snap = h.sent(p, 'snap');
    eq(snap.ack, p.ack);
    eq(snap.me[0], Math.round(p.entity.x * 32));
  });

  t.test('two fake clients see each other', async () => {
    const h = await createHarness({ seed: 4, players: 2 });
    h.step(0.1);
    const [p, q] = [h.player(0), h.player(1)];
    const addsP = h.messages(p, 'snap').flatMap((m) => m.add);
    const addsQ = h.messages(q, 'snap').flatMap((m) => m.add);
    ok(addsP.some((e) => e.i === q.id && e.ty === 'player' && e.n === q.name), 'p sees q');
    ok(addsQ.some((e) => e.i === p.id && e.ty === 'player'), 'q sees p');
    h.input(q, { mx: 0, my: 1 });
    h.step(0.5);
    const upd = h.messages(p, 'snap').flatMap((m) => m.upd).filter((u) => u[0] === q.id);
    ok(upd.length > 0, 'p receives q movement updates');
  });

  t.test('snapshot add / upd patch / rem with interest hysteresis', async () => {
    const h = await createHarness({ seed: 5, players: 2 });
    const [p, q] = [h.player(0), h.player(1)];
    const realm = h.game.realms.get('overworld');
    h.step(0.05);
    ok(p.known.has(q.id));
    q.entity.set('lv', 7);
    h.clear(p); h.step(0.05);
    const u = h.sent(p, 'snap').upd.find((e) => e[0] === q.id);
    eq(u[6], { lv: 7 }, 'patch holds only the changed key');
    h.clear(p); h.step(0.05);
    eq(h.sent(p, 'snap').upd.find((e) => e[0] === q.id), undefined, 'unchanged entity omitted');
    realm.move(q.entity, p.entity.x + 30, p.entity.y);
    h.clear(p); h.step(0.05);
    eq(h.sent(p, 'snap').rem.includes(q.id), false, 'still known at 30 tiles');
    realm.move(q.entity, p.entity.x + 33, p.entity.y);
    h.clear(p); h.step(0.05);
    ok(h.sent(p, 'snap').rem.includes(q.id), 'removed beyond 32');
    realm.move(q.entity, p.entity.x + 30, p.entity.y);
    h.clear(p); h.step(0.05);
    eq(h.sent(p, 'snap').add.some((e) => e.i === q.id), false, 'not re-added at 30');
    realm.move(q.entity, p.entity.x + 27, p.entity.y);
    h.clear(p); h.step(0.05);
    ok(h.sent(p, 'snap').add.some((e) => e.i === q.id), 're-added within 28');
    const drop = h.game.call('dropItem', realm, p.entity.x + 5, p.entity.y, 'driftwood', 3);
    h.clear(p); h.step(0.05);
    ok(h.sent(p, 'snap').add.some((e) => e.i === drop.id && e.it === 'driftwood' && e.q === 3));
    realm.remove(drop);
    h.clear(p); h.step(0.05);
    ok(h.sent(p, 'snap').rem.includes(drop.id));
  });

  t.test('movePlayer sends the realm message and resets interest', async () => {
    const h = await createHarness({ seed: 6, players: 1 });
    const p = h.player(0);
    h.step(0.1);
    const inst = h.game.call('createInstance', 'vault', { k: 1, party: [p] });
    h.clear(p);
    h.game.call('movePlayer', p, inst.id, 5, 5);
    const m = h.sent(p, 'realm');
    eq([m.id, m.w, m.h, m.kind, m.x, m.y], [inst.id, inst.w, inst.h, 'vault', 5, 5]);   // WP10 sizes vaults per k (P2-15)
    h.step(0.05);
    ok(h.messages(p, 'chunk').every((c) => c.realm === inst.id), 'chunks of the new realm');
    eq(p.entity.realm, inst.id);
  });

  t.test('gather a node, pick up drops into the inventory', async () => {
    const h = await createHarness({ seed: 7, players: 1 });
    const p = h.player(0);
    const realm = h.game.realms.get('overworld');
    const node = h.game.call('spawnNode', realm, 'fieldstone_rock', 92, 90) || [...realm.entities.values()].find((e) => e.type === 'node');
    realm.move(p.entity, node.x - 1, node.y);
    let res;
    for (let i = 0; i < 10 && !node.removed; i++) { res = h.do(p, 'gather.swing', { id: node.id }); h.step(0.5); }
    ok(node.removed, 'node broke');
    h.step(1.5);
    const inv = h.sent(p, 'self', 'inv').d;
    ok(inv.slots.some((s) => s && s[1] > 0), 'items picked up');
    ok(h.messages(p, 'fx').length > 0, 'fx sent');
  });

  t.test('player.active: movement window and actions, not plain swings or held buttons', async () => {
    const h = await createHarness({ seed: 8, players: 1 });
    const p = h.player(0);
    const events = [];
    h.game.bus.on('player.active', (e) => events.push(e));
    h.input(p, { mx: 0, my: 0, b: 1 });
    h.step(12);
    eq(events.length, 0, 'holding a button alone is not activity');
    const realm = h.game.realms.get('overworld');
    const node = [...realm.entities.values()].find((e) => e.type === 'node');
    realm.move(p.entity, node.x - 1, node.y);
    events.length = 0;
    h.do(p, 'gather.swing', { id: node.id });
    eq(events.length, 0, 'plain swing is not activity');
    h.step(0.2);
    events.length = 0;
    h.input(p, { mx: 0, my: 1 });
    h.step(ACTIVE_DIST / 5 + 1.2);
    ok(events.length > 0 && events[0].playerId === p.id, 'walking 4+ tiles is activity');
    events.length = 0;
    h.game.services.call('registerInteract', 'node', () => ({ ok: true }));
    const n2 = [...realm.entities.values()].find((e) => e.type === 'node' && !e.removed);
    realm.move(p.entity, n2.x - 1, n2.y);
    h.input(p, {});
    eq(h.do(p, 'use', { id: n2.id }).ok, true);
    ok(events.some((e) => e.reason === 'use'), 'successful use action is activity');
    events.length = 0;
    eq(h.do(p, 'use', { id: 999999 }).ok, false);
    eq(events.length, 0, 'failed action is not activity');
  });

  t.test('save -> load round trip with structure data and per-profile system data', async () => {
    const probe = {
      name: 'probe',
      loaded: undefined,
      profileLoads: [],
      save() { return { counter: 42 }; },
      load(game, data) { probe.loaded = data; },
      saveProfile(game, player) { return { favourite: `fav-${player.name}` }; },
      loadProfile(game, player, data) { probe.profileLoads.push(data); },
    };
    const systems = [...defaultSystems, probe];
    const h = await createHarness({ seed: 9, players: 1, systems });
    const p = h.player(0);
    h.give(p, 'driftwood', 17);
    const realm = h.game.realms.get('overworld');
    const s = h.game.call('placeStructure', realm, 'workbench', 86, 86, 1, p, { force: true });
    s.data.paid = [{ item: 'driftwood', qty: 4 }];
    s.data.station = { queue: [{ recipe: 'r_x', left: 2 }] };
    realm.setGround(85, 85, T.PATH);
    h.input(p, { mx: 1, my: 0 }); h.step(0.5);
    h.game.world.glint = 1234;
    const data = JSON.parse(JSON.stringify(h.game.serialize()));
    eq(data.version, 1);
    eq(data.systems.probe, { counter: 42 });
    eq(data.profiles[p.token].sys.probe, { favourite: 'fav-Tester0' });

    probe.profileLoads = [];
    const h2 = await createHarness({ seed: 9, players: 0, systems, save: data });
    eq(probe.loaded, { counter: 42 });
    const r2 = h2.game.realms.get('overworld');
    const s2 = r2.entities.get(s.id);
    ok(s2, 'structure restored with the same id');
    eq(s2.data.paid, [{ item: 'driftwood', qty: 4 }]);
    eq(s2.data.station, { queue: [{ recipe: 'r_x', left: 2 }] });
    eq(s2.pub.rot, 1);
    eq(r2.groundAt(85, 85), T.PATH, 'tile patch restored');
    eq(h2.game.world.glint, 1234);
    const nodes1 = [...realm.entities.values()].filter((e) => e.type === 'node').length;
    const nodes2 = [...r2.entities.values()].filter((e) => e.type === 'node').length;
    eq(nodes2, nodes1, 'nodes restored');
    ok(h2.game.nextEntityId > s.id, 'ids never reused');
    const p2 = h2.addPlayer({ token: p.token, name: 'Tester0' });
    eq(h2.game.inv.count(p2.inv, 'driftwood'), 17);
    near(p2.entity.x, p.entity.x, 0.01);
    eq(probe.profileLoads.at(-1), { favourite: 'fav-Tester0' });
  });

  t.test('statbook applies level gains, sources and caps', async () => {
    const h = await createHarness({ seed: 10, players: 1 });
    const p = h.player(0);
    h.setLevel(p, 11);
    eq(h.game.stats.of(p).maxHp, 180);
    h.game.stats.addSource('test', () => [{ stat: 'moveSpeed', op: 'add', v: 2 }, { stat: 'yieldAll', op: 'add', v: 1.5 }, { stat: 'yieldWood', op: 'add', v: 1 }]);
    const s = h.game.stats.of(p);
    eq(s.moveSpeed, 0.8, 'moveSpeed cap');
    near(s.yieldWood, 0.5, 1e-9, 'yieldAll + yieldWood <= 2.0');
    h.step(0.05);
    ok(h.sent(p, 'self', 'stats').d.moveSpeed === 0.8, 'sheet sent on recompute');
  });

  t.test('statbook: when-conditions, flags, mul, registry stats', async () => {
    const h = await createHarness({ seed: 12, players: 1 });
    const p = h.player(0);
    let night = false;
    h.game.stats.setCondition('night', () => night);
    h.game.stats.addSource('cond', () => [
      { stat: 'luck', op: 'add', v: 10, when: 'night' },
      { stat: 'maxHp', op: 'mul', v: 0.5 },
      { flag: 'lava_immune' },
    ]);
    h.game.stats.addFlagSource('extra', () => ['dodge_crit']);
    let s = h.game.stats.of(p);
    eq(s.luck, 0, 'day: conditional mod inactive');
    eq(s.maxHp, 150, 'mul applies after add');
    ok(h.game.stats.hasFlag(p, 'lava_immune') && h.game.stats.hasFlag(p, 'dodge_crit') && !h.game.stats.hasFlag(p, 'wet'));
    eq(s.flags, ['dodge_crit', 'lava_immune']);
    ok('cacheChance' in s && 'weatherBonus' in s, 'registry-added stats present');
    night = true;
    h.step(1.05);
    eq(h.game.stats.of(p).luck, 10, '1 Hz re-check picks up the flipped condition');
    night = false;
    h.game.bus.emit('clock.phase', { phase: 'day' });
    eq(h.game.stats.of(p).luck, 0, 'clock.phase invalidates conditional sheets');
  });

  t.test('content index tolerates missing data files', () => {
    ok(Array.isArray(content.items) && content.items.byId);
    ok(content.nodes.length > 0 && content.biomes.byId.greenmarrow);
    ok(typeof content.hash === 'string');
  });

  // ------------------------------------------------------------ client (pure modules)

  t.test('palette: 63 colours + transparent, 12 ramps of 5', () => {
    eq(Object.keys(RAMPS).length, 12);
    for (const r of Object.values(RAMPS)) eq(r.length, 5);
    eq(PALETTE_CHARS.length, 64);
    for (const ch of PALETTE_CHARS) ok(ch === '.' || /^#[0-9a-f]{6}$/.test(PAL[ch]), `colour for ${ch}`);
    const all = Object.values(RAMPS).flat();
    eq(new Set(all).size, 60, 'ramp chars unique');
  });

  t.test('pixel-map parser: sizes, refs, swaps, anims', () => {
    const defs = resolveDefs({
      'a': { w: 2, h: 2, px: ['1.', '.2'] },
      'b': { ref: 'a', swap: { '1': '3' } },
      'c': { w: 1, h: 1, fps: 4, anims: { idle: [['1'], ['2']] } },
    });
    const a = parseSprite(defs.a);
    eq([a.w, a.h, a.frames.default.length], [2, 2, 1]);
    eq(Array.from(a.frames.default[0]).map((i) => PALETTE_CHARS[i]), ['1', '.', '.', '2']);
    const b = parseSprite(defs.b);
    eq(PALETTE_CHARS[b.frames.default[0][0]], '3');
    const c = parseSprite(defs.c);
    eq(c.frames.idle.length, 2);
    for (const [id, def] of Object.entries(resolveDefs(coreSprites))) {
      const s = parseSprite(def);
      ok(s.w > 0 && s.h > 0, `core sprite ${id}`);
    }
  });

  t.test('pixel font covers printable ASCII', () => {
    for (let c = 32; c <= 126; c++) ok(GLYPHS[String.fromCharCode(c)], `glyph ${c}`);
  });

  t.test('prediction replays unacknowledged inputs after a snapshot', () => {
    const pred = new Prediction({ isWalkable: openWorld, groundAt: null });
    pred.reset(10, 10);
    const server = createBody(10, 10);
    const inputs = [];
    for (let n = 1; n <= 10; n++) {
      const inp = { n, mx: 1, my: n > 5 ? 1 : 0, b: 0, dt: 50 };
      inputs.push(inp);
      pred.apply(inp, null);
    }
    for (const inp of inputs.slice(0, 6)) step(server, inp, null, 0.05, openWorld);
    const before = { x: pred.body.x, y: pred.body.y };
    pred.reconcile([Math.round(server.x * 32), Math.round(server.y * 32), Math.round(server.vx * 32), Math.round(server.vy * 32)], 6, null);
    near(pred.body.x, before.x, 0.05, 'no visible correction when in agreement');
    eq(pred.pending.length, 4);
    pred.reconcile([Math.round((server.x + 2) * 32), Math.round(server.y * 32), 0, 0], 6, null);
    ok(Math.abs(pred.body.x - (before.x + 2)) < 0.3, 'large server correction is applied');
    eq(pred.renderOffsetX, 0, 'corrections >= 0.5 tiles snap');
  });

  t.test('interpolation buffer lerps at now - delay and snaps on teleports', () => {
    const b = new InterpBuffer();
    b.push(1000, 0, 0);
    b.push(1050, 1, 2);
    const out = {};
    b.sample(1025, out);
    near(out.x, 0.5); near(out.y, 1);
    b.push(1100, 10, 2);
    b.sample(1075, out);
    eq(out.x, 10, 'jump over 3 tiles snaps');
    b.sample(5000, out);
    eq(out.x, 10, 'holds last sample');
  });

  t.test('store applies add / upd patches / rem and resets on realm', () => {
    const store = new Store();
    store.applyWelcome({ id: 5, world: { glint: 3 }, self: { inv: { slots: [] } }, realm: { id: 'overworld', w: 180, h: 180, kind: 'overworld' }, tick: 1 }, 0);
    eq(store.world.glint, 3);
    store.applySnap({ t: 'snap', k: 2, ack: 0, me: [64, 64, 0, 0], add: [{ i: 9, ty: 'node', k: 'copper_vein', x: 320, y: 320, f: 0, s: 0, hp: 3, mh: 3, v: 1, big: 0 }], upd: [], rem: [] }, 100);
    eq(store.entities.get(9).x, 10);
    store.applySnap({ t: 'snap', k: 3, ack: 0, me: [64, 64, 0, 0], add: [], upd: [[9, 352, 320, 2, 8, 2, { v: 3 }]], rem: [] }, 150);
    const e = store.entities.get(9);
    eq([e.hp, e.v, e.f, e.s], [2, 3, 2, 8]);
    store.applySnap({ t: 'snap', k: 4, ack: 0, me: [64, 64, 0, 0], add: [], upd: [[9, 352, 320, 2, 8, null]], rem: [] }, 200);
    eq(store.entities.get(9).hp, 2, 'null hp means unchanged');
    const seen = [];
    store.on('change:self.inv', (d) => seen.push(d));
    store.applySelf({ k: 'inv', d: { slots: [['x', 1]] } });
    eq(seen.length, 1);
    store.applyChunk({ realm: 'overworld', cx: 0, cy: 0, g: Buffer.from(new Uint8Array(400).fill(4)).toString('base64'), f: Buffer.from(new Uint8Array(400)).toString('base64') });
    eq(store.groundAt(3, 3), 4);
    store.applySnap({ t: 'snap', k: 5, ack: 0, me: [64, 64, 0, 0], add: [], upd: [], rem: [9] }, 250);
    eq(store.entities.has(9), false);
    store.applySnap({ t: 'snap', k: 6, ack: 0, me: [64, 64, 0, 0], add: [{ i: 11, ty: 'drop', k: 'drop', x: 0, y: 0, f: 0, s: 0, hp: 0, mh: 0 }], upd: [], rem: [] }, 300);
    store.applyRealm({ id: 'vault:1', w: 40, h: 40, kind: 'vault', x: 3, y: 4, tick: 7 });
    eq(store.entities.size, 0);
    eq(store.chunks.size, 0);
    eq(store.realm.id, 'vault:1');
  });

  t.test('particle engine emits, updates and recycles', () => {
    define('test_puff', { count: [5, 5], life: [0.2, 0.2], speed: [1, 1], colors: ['1'] });
    const before = liveCount();
    emit('test_puff', 0, 0);
    eq(liveCount(), before + 5);
    emit('no_such_preset', 0, 0);
    ok(liveCount() > before + 5, 'unknown preset falls back to a puff');
    update(1);
    eq(liveCount(), 0);
  });
}
