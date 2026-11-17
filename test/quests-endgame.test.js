// WP11 tests: quests, NPCs, Archive, Deeds, Tidegate, finale, Rebirth (TECH_SPEC 14, WP11 "Tests").

import { ok, eq } from './assert.js';
import { createHarness } from './harness.js';
import { content } from '../shared/data/index.js';
import { coopScale } from '../shared/rules/costs.js';
import { TIDEGATE_STAGES } from '../shared/data/structures.js';
import { acceptQuest, turnInQuest, st as questState, goalLabel } from '../server/game/systems/quests.js';
import { donate } from '../server/game/systems/archive.js';
import { completeStage, stageNeeds } from '../server/game/systems/tidegate.js';
import { INTRO_S, VICTORY_S, MOON_REALM } from '../server/game/systems/finale.js';
import { COUNTDOWN_S, shardPreview } from '../server/game/systems/rebirth.js';
import { spawnCastaways, DIALOG } from '../server/game/systems/npcs.js';
import quests from '../server/game/systems/quests.js';
import { Entity } from '../server/game/entities.js';

// A detached structure entity for synthetic structure.placed events (never added to a realm).
function fakeStructure(game, kind, x, y, owner) {
  const e = new Entity(game.allocId(), 'structure', kind, 'overworld', x, y);
  const def = content.structures.byId[kind];
  e.data = { tx: Math.floor(x), ty: Math.floor(y), w: def?.w ?? 1, h: def?.h ?? 1, owner: owner ?? null, paid: [], fake: true };
  e.set('rot', 0); e.set('own', 0); e.set('on', 1);
  e.removed = true;
  return e;
}

function biomePlots(game, biome) { return game.world.plots.filter((p) => p.biome === biome); }
function posIn(game, biome) { const p = biomePlots(game, biome)[0]; return { x: p.px * 20 + 10.5, y: p.py * 20 + 10.5 }; }

// Simulate everything a goal needs for player p (or the world when p is the only player).
function satisfy(h, p, g, quest) {
  const game = h.game, bus = game.bus;
  const first = Array.isArray(g.target) ? g.target[0] : g.target;
  const pos = g.biome ? posIn(game, g.biome) : { x: 90.5, y: 90.5 };
  switch (g.kind) {
    case 'deliver': h.give(p, first, g.n); break;
    case 'kill': {
      const boss = content.bosses.byId[first];
      for (let i = 0; i < g.n; i++) {
        if (boss) bus.emit('boss.killed', { boss: { kind: first, type: 'boss', realm: 'overworld', x: pos.x, y: pos.y, data: {}, pub: {} }, kind: first, participants: [p], first: true });
        else bus.emit('mob.killed', { killer: p.entity, mob: { kind: first, type: 'mob', realm: 'overworld', x: pos.x, y: pos.y, pub: {}, data: {} }, kind: first, tier: 1, elite: false, participants: [p] });
      }
      break;
    }
    case 'kill_elite':
      for (let i = 0; i < g.n; i++) bus.emit('mob.killed', { killer: p.entity, mob: { kind: first ?? 'mossback', type: 'mob', realm: 'overworld', x: pos.x, y: pos.y, pub: { el: 'swift' }, data: {} }, kind: first ?? 'mossback', tier: 1, elite: 'swift', participants: [p] });
      break;
    case 'craft': bus.emit('item.crafted', { player: p, item: first, qty: g.n, station: 'anvil', byMachine: false }); break;
    case 'collect': bus.emit('item.pickup', { player: p, item: first, qty: g.n }); break;
    case 'build':
      for (let i = 0; i < g.n; i++) bus.emit('structure.placed', { player: p, structure: fakeStructure(game, first, pos.x, pos.y, p.token) });
      break;
    case 'catch':
      for (let i = 0; i < g.n; i++) bus.emit('fish.caught', { player: p, fish: first ?? 'pebble_minnow', rarity: 'common' });
      break;
    case 'counter':
      if (['sluice_items'].includes(g.target)) bus.emit('sluice.moved', { count: g.n });
      else if (g.target === 'gull_deliveries') bus.emit('gull.delivered', { count: g.n });
      else if (g.target === 'autobench_crafts') bus.emit('machine.output', { machine: { kind: 'autobench_1' }, item: 'plank', qty: g.n });
      else game.call('counter', p, g.target, g.n);
      break;
    case 'reach':
      if (g.target === 'flux') game.sendWorld('flux', { supply: g.n, demand: 0 });
      else if (g.target === 'trench') bus.emit('trench.floor', { floor: g.n, participants: [p] });
      else if (g.target === 'level') h.setLevel(p, g.n);
      else if (g.target === 'tidegate') for (let s = 1; s <= g.n; s++) completeStage(game, s);
      break;
    case 'raise': {
      if (quest.type === 'main') {
        let need = g.n;
        for (const pl of game.world.plots) {
          if (need <= 0) break;
          if (pl.owned || (g.biome && pl.biome !== g.biome)) continue;
          h.raise(pl.px, pl.py); need--;
        }
      } else for (let i = 0; i < g.n; i++) bus.emit('land.raised', { player: p, px: 0, py: 0, biome: 'greenmarrow', ordinal: 1 });
      break;
    }
    case 'clear': {
      const k = content.dungeons.byId[g.target].k;
      bus.emit('vault.cleared', { k, participants: [p], seconds: 300, first: true });
      break;
    }
    case 'donate': {
      let n = 0;
      for (const w of content.archive) for (const it of w.items) {
        if (n >= g.n) break;
        if (questState(game) && game.worldState.archive?.donated?.[it]) { n++; continue; }
        h.give(p, it, 1);
        if (donate(game, p, it, { force: true }).ok) n++;
      }
      break;
    }
    case 'solve': for (let i = 0; i < g.n; i++) bus.emit('shrine.solved', { player: p, biome: 'greenmarrow', px: 0, py: 0 }); break;
    case 'temper': p.gear.temper = { hook_1: g.n }; break;
    default: throw new Error('unhandled goal kind ' + g.kind);
  }
}

function spyService(game, name, fn) {
  const orig = game.services.get(name);
  const calls = [];
  game.services.register(name, (...args) => { calls.push(args); return fn ? fn(orig, ...args) : orig(...args); });
  return calls;
}

export default async function (t) {
  t.test('content: 24 main + 33 side quests, 8 board templates, 11 castaways with full dialogue', () => {
    eq(content.quests.filter((q) => q.type === 'main').length, 24);
    eq(content.quests.filter((q) => q.type === 'side').length, 33);
    eq(content.quests.filter((q) => q.type === 'board').length, 8);
    eq(content.npcs.length, 11);
    for (const npc of content.npcs) {
      const d = DIALOG[npc.id];
      ok(d && d.intro && d.lore.length >= 3 && d.lineDone, `dialogue for ${npc.id}`);
      for (const q of npc.quests) ok(d.quests[q]?.offer && d.quests[q]?.progress && d.quests[q]?.thanks, `quest text ${q}`);
    }
  });

  t.test('every goal kind has a readable label', async () => {
    const h = await createHarness({ seed: 5, players: 0 });
    const kinds = new Set();
    for (const q of content.quests) for (const g of q.goals) {
      if (typeof g.n === 'object') continue;
      kinds.add(g.kind);
      const l = goalLabel(h.game, g, q);
      ok(typeof l === 'string' && l.length > 4 && !/undefined|null|\[object/.test(l), `${q.id}: ${l}`);
    }
    for (const k of ['build', 'craft', 'deliver', 'kill', 'kill_elite', 'raise', 'clear', 'catch', 'donate', 'counter', 'reach', 'temper', 'solve']) ok(kinds.has(k), 'kind used: ' + k);
  });

  t.test('every goal kind completes from bus events (side quest instances)', async () => {
    const h = await createHarness({ seed: 6, players: 1 });
    const p = h.player(0);
    const kinds = ['build', 'craft', 'collect', 'deliver', 'kill', 'kill_elite', 'raise', 'clear', 'catch', 'donate', 'counter', 'reach', 'temper', 'solve'];
    for (const kind of kinds) {
      const pd = p._quests;
      const q = content.quests.find((x) => x.type === 'side' && !pd.done.includes(x.id) && x.goals.some((g) => g.kind === kind));
      if (!q) {   // `collect` is not used by any quest in the data: check it on a synthetic contract instance
        pd.board.tbX_0 = { prog: [0], base: [0], goals: [{ kind: 'collect', target: 'driftwood', n: 3 }], labels: ['Collect 3 Driftwood'], name: 'Synthetic', rewards: { glint: 1, xp: 0, items: [] } };
        h.game.bus.emit('item.pickup', { player: p, item: 'driftwood', qty: 3 });
        h.step(1);
        ok(p.selfState.quests.active.find((a) => a.id === 'tbX_0')?.ready, 'collect goal completes from item.pickup');
        delete pd.board.tbX_0;
        continue;
      }
      // fast-forward the line so this step is available
      for (let s = 1; s < q.step; s++) if (!pd.done.includes(`s_${q.giver.slice(4)}_${s}`)) pd.done.push(`s_${q.giver.slice(4)}_${s}`);
      eq(acceptQuest(h.game, p, q.id, { force: true }).ok, true, 'accept ' + q.id);
      for (const g of q.goals) satisfy(h, p, g, q);
      h.step(1);
      const view = p.selfState.quests.active.find((a) => a.id === q.id);
      ok(view?.ready, `${q.id} (${kind}) ready: ${JSON.stringify(view?.goals)}`);
      eq(turnInQuest(h.game, p, q.id, { force: true }).ok, true, 'turn in ' + q.id);
    }
  });

  t.test('all 33 side quests are completable; line completion feeds the Beacon check', async () => {
    const h = await createHarness({ seed: 7, players: 1 });
    const p = h.player(0);
    const lines = [];
    h.game.bus.on('questline.completed', (e) => lines.push(e.npc));
    for (const npc of content.npcs) {
      for (const qid of npc.quests) {
        const q = content.quests.byId[qid];
        const r = acceptQuest(h.game, p, qid, { force: true });
        eq(r.ok, true, 'accept ' + qid + ' ' + r.err);
        for (const g of q.goals) satisfy(h, p, g, q);
        h.step(1);
        const t2 = turnInQuest(h.game, p, qid, { force: true });
        eq(t2.ok, true, `turn in ${qid}: ${t2.err}`);
      }
      eq(h.game.world.flags[`line:${npc.id}`], true, 'line flag ' + npc.id);
    }
    eq(lines.length, 11);
    eq(p._quests.done.length, 33);
    eq(h.game.world.flags['quest:s_odalys_3'], true, 'recipe unlock flag for fen_stew');
    // world line rewards: Quill -3% land, Ysolde lamp radius; Morrow party flag
    const ws = h.game.stats.world();
    ok((ws.landDiscountWorld ?? 0) >= 0.03 - 1e-9, 'Quill land discount in world sheet');
    ok(h.game.stats.hasFlag(p, 'trench_no_key'), 'Morrow flag');
    ok(h.game.call('lineEffects', p).some((e) => e.id === 'temper_glint_discount'), 'Brannick effect');
  });

  t.test('side quests: accept needs the giver nearby; turn-in takes deliveries atomically', async () => {
    const h = await createHarness({ seed: 8, players: 1 });
    const p = h.player(0);
    const r = h.do(p, 'quest.accept', { quest: 's_ferrin_1' });
    eq(r.ok, false); eq(r.err, 'range');
    // place Ferrin next to the player
    const plot = h.game.world.plots.find((x) => x.biome === 'greenmarrow' && !x.owned);
    plot.feature = 'castaway';
    h.raise(plot.px, plot.py);
    spawnCastaways(h.game);
    const ferrin = [...h.game.realms.get('overworld').entities.values()].find((e) => e.type === 'npc' && e.kind === 'npc_ferrin');
    ok(ferrin, 'Ferrin spawned on his castaway plot');
    h.game.movePlayer(p, 'overworld', ferrin.x + 1, ferrin.y);
    const use = h.do(p, 'use', { id: ferrin.id });
    eq(use.ok, true);
    eq(p.selfState.ui.panel, 'dialog');
    const work = h.do(p, 'npc.talk', { id: ferrin.id, choice: 'work' });
    eq(work.d.quest.id, 's_ferrin_1');
    eq(h.do(p, 'npc.talk', { id: ferrin.id, choice: 'accept' }).ok, true);
    h.give(p, 'rope', 12);
    const early = h.do(p, 'npc.talk', { id: ferrin.id, choice: 'turnin' });
    eq(early.d.err, 'cost');
    eq(h.game.call('countItem', p, 'rope'), 12, 'nothing taken on a failed turn-in');
    h.give(p, 'rope', 10);
    h.step(1);
    eq(p.selfState.quests.markers.npc_ferrin, 2, 'turn-in marker');
    const done = h.do(p, 'npc.talk', { id: ferrin.id, choice: 'turnin' });
    eq(done.d.node, 'thanks');
    eq(h.game.call('countItem', p, 'rope'), 2);
    h.step(1);
    eq(ferrin.pub.q, 1, 'next step available marker');
    const trade = h.do(p, 'npc.talk', { id: ferrin.id, choice: 'trade' });
    eq(trade.d.open.panel, 'market');
  });

  t.test('main chain: strict order, auto-complete, Glint capped at 25% of the next plot (q01 exempt)', async () => {
    const h = await createHarness({ seed: 9, players: 1 });
    const p = h.player(0);
    const game = h.game;
    const paid = [];
    spyService(game, 'addGlint', (orig, amount, source, player) => {
      if (source === 'quest') paid.push({ amount, cap: Math.floor(game.call('landCostNext').glint * 0.25), main: questState(game).world.main.done.at(-1) });
      return orig(amount, source, player);
    });
    const order = [];
    game.bus.on('quest.completed', ({ quest }) => { if (/^q\d\d$/.test(quest)) order.push(quest); });
    // satisfying a later quest first must not complete it out of order
    satisfy(h, p, content.quests.byId.q03.goals[0], content.quests.byId.q03);
    h.step(1);
    eq(order.length, 0, 'q03 waits for q01/q02');
    for (const q of content.quests.filter((x) => x.type === 'main').sort((a, b) => a.n - b.n)) {
      if (q.id === 'q24') break;
      for (const g of q.goals) satisfy(h, p, g, q);
      h.step(1);
      ok(order.includes(q.id), `${q.id} completed (${JSON.stringify(game.worldState.mainQuest)})`);
    }
    satisfy(h, p, content.quests.byId.q24.goals[0], content.quests.byId.q24);
    h.step(1);
    eq(order, content.quests.filter((x) => x.type === 'main').sort((a, b) => a.n - b.n).map((q) => q.id), 'completion order');
    eq(paid[0].amount, 60, 'q01 pays 60 G (exempt)');
    for (const x of paid.slice(1)) ok(x.amount <= x.cap, `capped ${x.main}: ${x.amount} <= ${x.cap}`);
    eq(game.worldState.mainQuest.complete, true);
    eq(questState(game).world.shardBank, 2, 'q23 banks 2 Moon Shards');
  });

  t.test('Tide Board: 3 offers per 3 days, refresh on a new period, per-player progress and turn-in', async () => {
    const h = await createHarness({ seed: 10, players: 1 });
    const p = h.player(0);
    let day = 1;
    h.game.services.register('timeInfo', () => ({ day, phase: 'day', isNight: false, lowTide: false, turning: false, weather: 'clear', forecast: [] }));
    h.step(1);
    const b1 = p.selfState.quests.board;
    eq(b1.offers.length, 3);
    eq(new Set(b1.offers.map((o) => o.name)).size, 3, 'distinct templates');
    const offer = b1.offers[0];
    eq(h.do(p, 'quest.accept', { quest: offer.id }).ok, true);
    eq(h.do(p, 'quest.accept', { quest: offer.id }).ok, false, 'no double take');
    const inst = p._quests.board[offer.id];
    satisfy(h, p, inst.goals[0], { type: 'board' });
    h.step(1);
    ok(p.selfState.quests.active.find((a) => a.id === offer.id)?.ready, 'contract ready');
    const tr = h.do(p, 'quest.turnin', { quest: offer.id });
    eq(tr.ok, true, 'turn in contract ' + tr.err);
    // WP14 (P2-5): one shared set every BOARD_REFRESH_DAYS (3) in-game days
    day = 3;
    h.step(1);
    eq(p.selfState.quests.board.day, 1, 'same board until day 4');
    day = 4;
    h.step(1);
    const b2 = p.selfState.quests.board;
    eq(b2.day, 4);
    ok(b2.offers.every((o) => o.id.startsWith('tb4_')), 'new ids on a new board period');
  });

  t.test('Archive: fixed XP 50 * tier^2 per donation, wing reward into the world sheet + skill point', async () => {
    const h = await createHarness({ seed: 11, players: 1 });
    const p = h.player(0);
    const xp = spyService(h.game, 'grantXp', (orig, ...a) => orig(...a));
    const wing = content.archive.byId.wing_metal;
    const before = h.game.stats.world().kilnSpeedWorld ?? 0;
    // WP14 (P2-4): donations need the Archive structure in reach
    h.give(p, wing.items[0], 1);
    eq(h.do(p, 'archive.donate', { item: wing.items[0] }).err, 'range', 'no Archive, no donation');
    h.game.call('placeStructure', 'overworld', 'archive', Math.floor(p.entity.x) + 2, Math.floor(p.entity.y) - 1, 0, null, { force: true, free: true });
    for (const it of wing.items) {
      h.give(p, it, 1);
      const r = h.do(p, 'archive.donate', { item: it });
      eq(r.ok, true, 'donate ' + it + ' ' + r.err);
    }
    const archXp = xp.filter((c) => c[2] === 'archive').map((c) => c[1]);
    eq(archXp, wing.items.map((it) => 50 * content.items.byId[it].tier ** 2));
    eq(h.do(p, 'archive.donate', { item: 'copper_bar' }).ok, false, 'one of each');
    ok(h.game.worldState.archive.complete.includes('wing_metal'));
    const after = h.game.stats.world().kilnSpeedWorld ?? 0;
    ok(after - before >= 0.15 - 1e-9, `kilnSpeedWorld +0.15 (${before} -> ${after})`);
    eq(h.game.call('extraSkillPoints', p), 1, 'wing skill point');
    ok(h.game.wp6.worldPoints.includes('wing:wing_metal'), 'the wing point is granted on the Chart (WP14 P0-4)');
    eq(h.game.world.flags['wing:wing_metal'], true);
  });

  t.test('Deeds: all 60 counters increment and tiers pay a Tide Token each', async () => {
    const h = await createHarness({ seed: 12, players: 2 });
    const [p, q] = [h.player(0), h.player(1)];
    const g = h.game, bus = g.bus;
    const mob = { kind: 'mossback', type: 'mob', realm: 'overworld', x: 90, y: 90, pub: { el: 'swift' }, data: {} };
    bus.emit('node.broken', { player: p, node: {}, kind: 'bentwood_tree', tier: 1, x: 0, y: 0, byMachine: false });
    bus.emit('node.broken', { player: p, node: {}, kind: 'tide_cache', tier: 1, x: 0, y: 0, byMachine: false });
    const gem = content.nodes.find((n) => n.cls === 'gem');
    bus.emit('node.broken', { player: p, node: {}, kind: gem.id, tier: 1, x: 0, y: 0, byMachine: false });
    for (const it of ['driftwood', 'fieldstone', 'copper_ore', 'relic_01']) bus.emit('item.pickup', { player: p, item: it, qty: 3 });
    const plantItem = content.nodes.find((n) => n.cls === 'plant').drops[0].item;
    bus.emit('item.pickup', { player: p, item: plantItem, qty: 2 });
    bus.emit('crop.harvested', { player: p, crop: 'tidewheat', qty: 2, byMachine: false });
    bus.emit('fish.caught', { player: p, fish: 'old_whiskers', rarity: 'legendary' });
    for (const it of ['copper_bar', 'blade_1', 'reed_bread', 'tonic_haste', 'gear_part', 'ballast_1']) bus.emit('item.crafted', { player: p, item: it, qty: 1, station: 'x', byMachine: false });
    bus.emit('structure.placed', { player: p, structure: fakeStructure(g, 'burrow_1', 90, 90, p.token) });
    bus.emit('land.raised', { player: p, px: 5, py: 4, biome: 'greenmarrow', ordinal: 1 });
    bus.emit('mob.killed', { killer: p.entity, mob, kind: 'mossback', tier: 1, elite: 'swift', participants: [p, q] });
    bus.emit('boss.killed', { boss: { kind: 'thornmother', data: { hard: true } }, kind: 'thornmother', participants: [p], first: true });
    bus.emit('mob.hit', { attacker: p.entity, mob, dmg: 50, crit: true, element: 'none' });
    bus.emit('player.died', { player: p });
    bus.emit('ability.cast', { player: p, ability: 'x' });
    bus.emit('player.dodge', { player: p });
    bus.emit('shrine.solved', { player: p, biome: 'greenmarrow', px: 0, py: 0 });
    bus.emit('vault.cleared', { k: 1, participants: [p], seconds: 100, first: true });
    bus.emit('trench.floor', { floor: 3, participants: [p] });
    g.call('placeStructure', 'overworld', 'archive', Math.floor(p.entity.x) + 2, Math.floor(p.entity.y) - 1, 0, null, { force: true, free: true });
    h.give(p, 'chitin', 1); h.do(p, 'archive.donate', { item: 'chitin' });
    bus.emit('quest.completed', { player: p, quest: 's_ferrin_1' });
    bus.emit('card.picked', { player: p, card: 'c01', rank: 1 });
    bus.emit('skill.bought', { player: p, skill: 'H1' });
    bus.emit('item.sold', { player: p, item: 'plank', qty: 4, glint: 10 });
    bus.emit('glint.changed', { delta: 30, source: 'sell', player: p });
    bus.emit('sluice.moved', { count: 5 });
    bus.emit('gull.delivered', { count: 5 });
    bus.emit('machine.output', { machine: { kind: 'autobench_1' }, item: 'plank', qty: 2 });
    bus.emit('machine.output', { machine: { kind: 'burrow_1' }, item: 'driftwood', qty: 2 });
    bus.emit('machine.output', { machine: { kind: 'mint' }, item: 'glint', qty: 2 });
    g.sendWorld('flux', { supply: 12, demand: 3 });
    p.selfState.cards = { owned: { [content.cards.find((c) => c.rarity === 'mythic').id]: 1 } };
    p.selfState.class = { id: 'bulwark', mastery: { bulwark: 4 } };
    for (const id of ['tempers_done', 'rerolls_used', 'waystone_jumps', 'king_tides_worked', 'tend_refills', 'allies_revived']) g.call('counter', p, id, 1);
    g.call('counter', null, 'raids_survived', 1);
    bus.emit('rebirth', { tideHeight: 1 });
    g.movePlayer(p, 'overworld', 95, 90);
    h.step(1);
    g.movePlayer(p, 'overworld', 100, 90);
    // coop_minutes and pings_sent come from coop.js
    g.playtimeS += 61; h.step(1);
    h.do(p, 'ping.mark', { x: 90, y: 90, kind: 'look' });
    h.step(1);
    const missing = [];
    for (const d of content.deeds) {
      const v = d.world ? g.world.counters?.[d.counter] : p.counters?.[d.counter];
      if (!(v > 0)) missing.push(d.counter);
    }
    eq(missing, [], 'counters without increments');
    // tiers: Sea Tax (deaths) tier 1 at 1 death -> 1 Tide Token, toast
    eq(p._deeds.tiers.d_deaths, 1);
    ok(g.call('countItem', p, 'tide_token') >= 1, 'token paid');
    // world deed: raids_survived tier 1 reached for everyone online
    eq(q._deeds.tiers.d_raids, 1);
    eq(p.selfState.deeds.counters.deaths, 1);
  });

  t.test('Tidegate: requirements, hand / Sluice / Gull deliveries, coopScale, rewards and machine speed', async () => {
    const h = await createHarness({ seed: 13, players: 1 });
    const p = h.player(0);
    const g = h.game;
    let r = h.do(p, 'tidegate.deliver', { stage: 1 });
    eq(r.err, 'locked', 'needs Beacon 6');
    g.world.flags['beacon:6'] = true;
    r = h.do(p, 'tidegate.deliver', { stage: 1 });
    eq(r.err, 'locked', 'needs 4 wings');
    for (const w of content.archive.slice(0, 4)) for (const it of w.items) { h.give(p, it, 1); donate(g, p, it, { force: true }); }
    // hand delivery: partial then complete
    h.give(p, 'brick', 1000);
    r = h.do(p, 'tidegate.deliver', { stage: 1 });
    eq(r.ok, true, 'partial delivery ' + r.err);
    eq(g.call('countItem', p, 'brick'), 0);
    const xp = spyService(g, 'grantXp', (orig, ...a) => orig(...a));
    h.give(p, 'brick', 4000); h.give(p, 'plank', 3000); h.give(p, 'iron_plate', 2500);
    r = h.do(p, 'tidegate.deliver', { stage: 1 });
    eq(r.ok, true);
    eq(g.call('countItem', p, 'iron_plate'), 500, 'only what the stage needs is taken');
    eq(g.worldState.tidegate.stage, 1);
    ok(xp.some((c) => c[2] === 'tidegate' && c[1] === 150000), '150,000 XP per bound player');
    ok((g.stats.world().machineSpeed ?? 0) >= 0.1 - 1e-9, '+10% machine speed');
    ok(g.fxQueue.get('overworld')?.length >= 0);
    // Sluice and Gull deliveries go through insertInto on the gate_site structure
    const site = g.call('placeStructure', 'overworld', 'gate_site', 100, 100, 0, null, { force: true, free: true });
    ok(site, 'gate site');
    eq(g.call('insertInto', site, 'cindersteel_bar', 3000), 2500, 'Sluice insert accepts what is needed');
    eq(g.call('insertInto', site, 'prism_alloy', 1500), 1500, 'Gull insert');
    eq(g.call('insertInto', site, 'driftwood', 10), 0, 'refuses unneeded items');
    h.give(p, 'flux_coil', 600);
    h.game.movePlayer(p, 'overworld', 103, 106);
    eq(h.do(p, 'tidegate.deliver', { stage: 2 }).ok, true);
    eq(g.worldState.tidegate.stage, 2);
    // stage 3 wants 6 wings: still locked
    eq(h.do(p, 'tidegate.deliver', { stage: 3 }).err, 'locked');
    // coopScale multiplies item costs but not moonpetal (stage 5)
    g.world.bound = [p.token, 'b'.repeat(10)];        // crew = bound UNION online (WP14 P0-5)
    const s5 = stageNeeds(g, 5);
    const scale = coopScale(2);
    eq(s5.items.find((c) => c.item === 'moonpetal').qty, 20, 'moonpetal unscaled');
    eq(s5.items.find((c) => c.item === 'hollow_core').qty, Math.ceil(200 * scale - 1e-9));
    eq(s5.glint, Math.ceil(250000 * scale - 1e-9));
    void TIDEGATE_STAGES;
  });

  t.test('finale: descent to the Moon realm, victory, rewards, credits and telemetry', async () => {
    const h = await createHarness({ seed: 14, players: 2 });
    const [p, q] = [h.player(0), h.player(1)];
    const g = h.game;
    eq(h.do(p, 'tidegate.deliver', { stage: 6 }).err, 'locked');
    g.world.flags['beacon:6'] = true;
    for (const w of content.archive) for (const it of w.items) { h.give(p, it, 1); donate(g, p, it, { force: true }); }
    g.bus.emit('trench.floor', { floor: 12, participants: [p] });
    for (let s = 1; s <= 5; s++) completeStage(g, s);
    ok(g.world.flags['moon:open']);
    h.clear(p);
    const r = h.do(p, 'tidegate.deliver', { stage: 6 });
    eq(r.ok, true, 'descend ' + r.err);
    eq(p.entity.realm, MOON_REALM);
    eq(q.entity.realm, MOON_REALM, 'party member within range descends too');
    ok(h.messages(p, 'realm').some((m) => m.id === MOON_REALM && m.kind === 'moon'), 'realm message');
    eq(g.worldState.tidegate.finale.stage, 'intro');
    ok(g.worldState.tidegate.finale.caption, 'cinematic caption');
    h.step(INTRO_S + 0.2);
    eq(g.worldState.tidegate.finale.stage, 'fight');
    const boss = [...g.realms.get(MOON_REALM).entities.values()].find((e) => e.kind === 'drowned_moon');
    ok(boss, 'Drowned Moon spawned');
    ok(g.services.bossScripts.get('drowned_moon')?.moves?.ring_waves, 'script registered');
    g.bus.emit('boss.killed', { boss, kind: 'drowned_moon', participants: [p, q], first: true });
    h.step(0.5);
    eq(g.worldState.tidegate.finale.stage, 'victory');
    eq(g.call('countItem', p, 'moon_shard_crown'), 1, 'crown');
    h.step(VICTORY_S + 1);
    eq(p.entity.realm, 'overworld', 'back on the surface');
    ok(!g.realms.has(MOON_REALM), 'arena closed');
    eq(g.worldState.tidegate.finale.stage, 'credits');
    eq(p.selfState.ui.panel, 'rebirth');
    eq(p.selfState.ui.mode, 'credits');
    ok(Number.isFinite(g.world.flags['gate:final_boss']), 'telemetry flag');
    ok(g.worldState.telemetry.some((x) => x.gate === 'final_boss'));
    ok(g.worldState.rebirth.available, 'Rebirth unlocked');
  });

  t.test('finale: a wipe sends the party back and resets to ready', async () => {
    const h = await createHarness({ seed: 15, players: 1 });
    const p = h.player(0);
    const g = h.game;
    g.world.flags['moon:open'] = true;
    eq(h.do(p, 'tidegate.deliver', { stage: 6 }).ok, true);
    h.step(INTRO_S + 0.2);
    g.movePlayer(p, 'overworld', 90, 90);    // e.g. died and respawned
    h.step(4);
    eq(g.worldState.tidegate.finale.stage, 'ready');
    ok(!g.realms.has(MOON_REALM));
  });

  t.test('telemetry: first plot, Vault, Warden, Beacon, Tidegate stage gates are written once', async () => {
    const h = await createHarness({ seed: 16, players: 1 });
    const g = h.game;
    g.playtimeS = 1234;
    g.bus.emit('land.raised', { player: h.player(0), px: 5, py: 4, biome: 'greenmarrow', ordinal: 1 });
    g.bus.emit('vault.cleared', { k: 1, participants: [h.player(0)], seconds: 500, first: true });
    g.bus.emit('boss.killed', { boss: { kind: 'thornmother', data: {} }, kind: 'thornmother', participants: [h.player(0)], first: true });
    g.bus.emit('beacon.lit', { k: 1 });
    g.playtimeS = 9999;
    g.bus.emit('land.raised', { player: h.player(0), px: 6, py: 4, biome: 'greenmarrow', ordinal: 2 });
    completeStage(g, 1);
    for (const k of ['first_plot', 'vault_1', 'warden_thornmother', 'beacon_1']) eq(g.world.flags['gate:' + k], 1234, k);
    eq(g.world.flags['gate:tidegate_1'], 9999);
    const labels = g.worldState.telemetry.map((x) => x.label);
    ok(labels.includes('Beacon 1') && labels.includes('First plot'), labels.join(','));
  });

  t.test('Rebirth: unanimous vote, keep/reset lists, Moon Shard formula, Tide Height, Moon Chart', async () => {
    const h = await createHarness({ seed: 17, players: 1 });
    const p = h.player(0);
    const g = h.game;
    eq(h.do(p, 'rebirth.vote', { yes: true }).err, 'locked');
    // a finished run: 2 wings, Trench 23, q23 banked 2, Nix's line (+3 personal), level 60
    for (const w of content.archive.slice(0, 2)) for (const it of w.items) { h.give(p, it, 1); donate(g, p, it, { force: true }); }
    g.bus.emit('trench.floor', { floor: 23, participants: [p] });
    questState(g).world.shardBank = 2;
    p._quests.effects.push({ id: 'moon_shards_next', n: 3, npc: 'npc_nix' });
    h.setLevel(p, 60);
    g.world.flags['moon:beaten'] = true;
    g.world.flags['beacon:3'] = true;
    g.world.glint = 5000;
    h.raise(5, 4);
    h.give(p, 'copper_bar', 50);
    p.gear = { hook: 'hook_3' };
    g.call('counter', p, 'deaths', 4);
    const preview = shardPreview(g, p.token);
    eq(preview.total, 5 + 0 + 2 + 2 + 5, 'formula: 5 + floor(avgLevel/100) + wings + floor(trench/10) + quests');
    const rebirths = [];
    g.bus.on('rebirth', (e) => rebirths.push(e));
    eq(h.do(p, 'rebirth.vote', { yes: true }).ok, true);
    h.step(1);
    eq(g.worldState.rebirth.countdown != null, true, 'countdown started');
    h.step(COUNTDOWN_S + 1);
    eq(rebirths.length, 1);
    eq(rebirths[0].tideHeight, 1);
    // resets
    eq(p.level, 1); eq(g.world.glint, 0);
    eq(g.call('countItem', p, 'copper_bar'), 0);
    eq(Object.keys(p.gear).length, 0);
    eq(g.world.plots.filter((x) => x.owned).length, 1, 'only the start plot');
    ok(!g.world.flags['beacon:3'], 'Beacons reset');
    ok(g.world.flags['moon:beaten'], 'Moon victory remembered');
    eq(questState(g).world.main.done.length, 0, 'main chain reset');
    eq(p._quests.effects.length, 0);
    // keeps
    eq(g.worldState.archive.complete.length, 2, 'Archive kept');
    eq(p.counters.deaths, 4, 'Logbook counters kept');
    eq(g.world.tideHeight, 1);
    eq(p.selfState.moon.shards, 14);
    eq(p.counters.rebirths, 1);
    // Moon Chart: buy ranks, mods in the sheet
    const hp0 = g.stats.of(p).maxHp;
    eq(h.do(p, 'moon.buy', { perk: 'moon_hp' }).ok, true);
    eq(h.do(p, 'moon.buy', { perk: 'moon_hp' }).ok, true);
    eq(p.selfState.moon.shards, 14 - 1 - 2);
    ok(g.stats.of(p).maxHp > hp0, 'max HP perk applied');
    eq(h.do(p, 'moon.buy', { perk: 'moon_dodge' }).ok, true);
    eq(h.do(p, 'moon.buy', { perk: 'moon_dodge' }).err, 'full', '1-rank perk');
    eq(g.call('moonRank', p, 'moon_hp'), 2);
  });

  t.test('save/load round trip keeps quests, Archive, Tidegate and Moon Chart', async () => {
    const h = await createHarness({ seed: 18, players: 1 });
    const p = h.player(0);
    const g = h.game;
    acceptQuest(g, p, 's_ferrin_1', { force: true });
    h.give(p, 'copper_ore', 1); donate(g, p, 'copper_ore', { force: true });
    g.world.flags['beacon:6'] = true;
    h.step(1);
    const tok = p.token;
    const h2 = await h.reload();
    const p2 = h2.addPlayer({ token: tok });
    h2.step(1);
    ok(p2.selfState.quests.active.some((a) => a.id === 's_ferrin_1'), 'side quest survives');
    eq(h2.game.worldState.archive.donated.copper_ore, p.name);
    eq(h2.game.worldState.mainQuest.id, 'q01');
    void quests;
  });
}
