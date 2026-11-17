// WP13 tests: co-op rules and shell helpers (TECH_SPEC 14, WP13 "Tests").

import { ok, eq, near } from './assert.js';
import { createHarness } from './harness.js';
import { MAX_PLAYERS } from '../shared/config.js';
import { coopScale } from '../shared/rules/costs.js';
import coop, { BOUND_MINUTES, CHAT_BURST, candidateBound } from '../server/game/systems/coop.js';
import { pingKindAt, PING_WHEEL } from '../client/ui/hud/chat.js';
import { DEFAULT_SETTINGS, normaliseSettings } from '../client/ui/panels/settings.js';
import { TUTORIAL_STEPS, tutorialStep } from '../client/ui/panels/tutorial.js';

// Advance world playtime by whole minutes and run coop's 1 Hz logic (the bound rule counts world-playtime minutes).
function minutes(h, n) {
  const g = h.game;
  for (let i = 0; i < n; i++) {
    g.playtimeS += 60;
    coop.slowTick(g);
  }
}

export default async function (t) {
  t.test('coopScale = 1 + 0.7 (S - 1); services boundCount / partyAverageLevel / isHost', async () => {
    near(coopScale(1), 1); near(coopScale(2), 1.7); near(coopScale(4), 3.1); near(coopScale(8), 5.9);
    const h = await createHarness({ seed: 21, players: 2 });
    const [a, b] = [h.player(0), h.player(1)];
    // WP14 (P0-5): connected players count immediately
    near(h.game.call('coopScale'), 1.7);
    eq(h.game.call('boundCount'), 2);
    h.setLevel(a, 10); h.setLevel(b, 20);
    eq(h.game.call('partyAverageLevel'), 15);
    // bound offline profiles add to the online ones (union)
    h.game.world.bound = ['x'.repeat(8), 'y'.repeat(8), 'z'.repeat(8)];
    near(h.game.call('coopScale'), coopScale(5));
    h.game.world.bound = [a.token, b.token, 'z'.repeat(8)];
    near(h.game.call('coopScale'), coopScale(3));
  });

  t.test('bound rule: 30 min in the last 10 h of world playtime, hourly recompute, announced an hour ahead', async () => {
    const h = await createHarness({ seed: 22, players: 2 });
    const g = h.game;
    const [a, b] = [h.player(0), h.player(1)];
    const changes = [];
    g.bus.on('coop.changed', (e) => changes.push(e));
    // both online for 29 minutes: nobody bound yet
    minutes(h, BOUND_MINUTES - 1);
    eq(candidateBound(g).length, 0, '29 minutes is not enough');
    minutes(h, 1);
    eq(candidateBound(g).length, 2, '30 minutes binds');
    eq(g.call('boundCount'), 2, 'online players count at once (WP14 P0-5)');
    eq(g.world.bound.length, 0, 'bound list not applied before the hourly recompute');
    // first hour boundary: the change is announced, not applied
    minutes(h, 30);
    // S is already 2 (both online), so the membership change is applied without an announcement
    eq(g.call('boundCount'), 2);
    near(g.call('coopScale'), 1.7);
    eq(changes.length, 0, 'no S change: it was 2 from the moment b joined');
    eq(g.worldState.coop.S, 2);
    ok(g.world.bound.includes(a.token) && g.world.bound.includes(b.token));
    // b leaves; after 10 hours of world playtime without b, b drops out (announced, then applied)
    h.leave(b);
    h.step(0.1);
    eq(g.call('boundCount'), 2, 'b stays bound while offline');
    minutes(h, 600);
    eq(candidateBound(g).length, 1);
    minutes(h, 60);
    eq(g.call('boundCount'), 1, 'S drops back by itself');
    ok(h.messages(a, 'chat').some((m) => m.sys && /in one hour/.test(m.text)), 'the drop was announced an hour ahead');
  });

  t.test('host detection: loopback and --admin token; host-only tools are denied to guests', async () => {
    const h = await createHarness({ seed: 23, players: 0 });
    const host = h.addPlayer({ name: 'Host', loopback: true });
    const guest = h.addPlayer({ name: 'Guest', loopback: false, token: 'guest-token-1' });
    const admin = h.addPlayer({ name: 'Admin', loopback: false, token: 'admin-token-1' });
    eq(h.game.call('isHost', host), true);
    eq(h.game.call('isHost', guest), false);
    eq(h.game.call('isHost', admin), false);
    h.game.opts.adminToken = 'admin-token-1';
    eq(h.game.call('isHost', admin), true);
    eq(h.do(guest, 'coop.kick', { id: host.id }).err, 'denied');
    eq(h.do(guest, 'coop.spendcap', { id: host.id, glint: 5 }).err, 'denied');
    eq(h.do(host, 'coop.kick', { id: admin.id }).err, 'denied', 'cannot kick another host');
  });

  t.test('kick sends `kicked` and removes the player; unbind clears crew time', async () => {
    const h = await createHarness({ seed: 24, players: 0 });
    const host = h.addPlayer({ name: 'Host' });
    const guest = h.addPlayer({ name: 'Guest', loopback: false, token: 'guest-token-2' });
    const conn = h.connOf(guest);
    const r = h.do(host, 'coop.kick', { id: guest.id });
    eq(r.ok, true);
    ok(conn.messages.some((m) => m.t === 'kicked' && m.reason === 'kicked'), 'kicked message');
    eq(conn.closed, true);
    ok(!h.game.players.has(guest.id), 'removed');
    // chat command form
    const g2 = h.addPlayer({ name: 'Second', loopback: false, token: 'guest-token-3' });
    h.game.world.bound = [host.token, g2.token];
    // WP14 (P0-5): an online player cannot be unbound
    eq(h.do(host, 'chat.say', { text: '/unbind Second' }).ok, false);
    eq(h.game.call('boundCount'), 2);
    h.leave(g2);
    h.step(0.1);
    eq(h.game.call('boundCount'), 2, 'offline bound player still counts');
    h.step(0.5);
    eq(h.do(host, 'chat.say', { text: '/unbind Second' }).ok, true);
    eq(h.game.world.bound.includes(g2.token), false);
    eq(h.game.call('boundCount'), 1);
    // cooldown between unbinds
    h.game.world.bound = [host.token, 'q'.repeat(8)];
    h.game.profiles.set('q'.repeat(8), { name: 'Quinn', sys: {} });
    h.step(0.5);
    eq(h.do(host, 'chat.say', { text: '/unbind Quinn' }).ok, false, 'unbind cooldown');
  });

  t.test('chat: sanitised, length-capped, rate-limited; commands; unknown text rejected', async () => {
    const h = await createHarness({ seed: 25, players: 2 });
    const [a, b] = [h.player(0), h.player(1)];
    eq(h.do(a, 'chat.say', { text: '  hi\u0007 <there>é\n ' }).ok, true);
    const last = h.messages(b, 'chat').at(-1);
    eq(last.text, 'hi <there>');
    eq(last.from, a.name);
    eq(h.do(a, 'chat.say', { text: 'too fast' }).err, 'cooldown', 'minimum gap between lines');
    h.step(0.5);
    eq(h.do(a, 'chat.say', { text: 'x'.repeat(500) }).ok, true);
    eq(h.messages(b, 'chat').at(-1).text.length, 160);
    eq(h.do(a, 'chat.say', { text: 123 }).err, 'invalid');
    eq(h.do(a, 'chat.say', { text: '\u0001\u0002' }).err, 'invalid');
    // burst limit
    h.step(10);
    let refused = 0;
    for (let i = 0; i < CHAT_BURST + 2; i++) { const r = h.do(a, 'chat.say', { text: 'spam ' + i }); if (!r.ok) refused++; h.step(0.5); }
    ok(refused >= 2, 'rate limit refuses the burst tail');
    h.step(10);
    eq(h.do(a, 'chat.say', { text: '/who' }).ok, true);
    ok(h.messages(a, 'chat').at(-1).text.startsWith('Online:'));
  });

  t.test('reconnect with the same token keeps the profile and replaces the old connection', async () => {
    const h = await createHarness({ seed: 26, players: 0 });
    const a = h.addPlayer({ name: 'Ada', token: 'ada-token-1' });
    eq(h.do(a, 'settings.set', { key: 'tutorial', value: 3 }).ok, true);
    h.game.call('counter', a, 'pings_sent', 2);
    const oldConn = h.connOf(a);
    const a2 = h.addPlayer({ name: 'Ada', token: 'ada-token-1' });
    ok(oldConn.messages.some((m) => m.t === 'kicked' && m.reason === 'replaced'), 'old socket told it was replaced');
    eq(h.game.players.size, 1);
    eq(a2.selfState.prefs.tutorial, 3, 'prefs survive');
    eq(a2.counters.pings_sent, 2, 'counters survive');
    eq(h.game.worldState.coop.players.length, 1);
  });

  t.test(`ninth player is rejected (max ${MAX_PLAYERS})`, async () => {
    const h = await createHarness({ seed: 27, players: MAX_PLAYERS });
    let err = null;
    try { h.addPlayer({ name: 'Ninth', token: 'ninth-token-1' }); } catch (e) { err = e; }
    ok(err && /full/.test(err.message), 'rejected with reason full');
    eq(h.game.players.size, MAX_PLAYERS);
  });

  t.test('ping wheel: four presets on the normal ping message; unknown kind -> look; cooldown; counter', async () => {
    eq(PING_WHEEL.map((p) => p.kind), ['need', 'danger', 'look', 'omw']);
    eq(pingKindAt(0, -30), 'need');      // up
    eq(pingKindAt(30, 0), 'danger');     // right
    eq(pingKindAt(0, 30), 'look');       // down
    eq(pingKindAt(-30, 0), 'omw');       // left
    eq(pingKindAt(1, 1), null, 'dead zone in the middle');
    const h = await createHarness({ seed: 28, players: 2 });
    const [a, b] = [h.player(0), h.player(1)];
    for (const kind of ['need', 'danger', 'look', 'omw']) {
      eq(h.do(a, 'ping.mark', { x: 91, y: 92, kind }).ok, true, kind);
      const m = h.messages(b, 'chat').at(-1);
      eq(m.ping.kind, kind);
      eq(m.ping.realm, 'overworld');
      h.step(1);
    }
    eq(h.do(a, 'ping.mark', { x: 91, y: 92, kind: 'bogus' }).d.kind, 'look');
    eq(h.do(a, 'ping.mark', { x: 91, y: 92, kind: 'look' }).err, 'cooldown');
    eq(h.do(a, 'ping.mark', { x: 'a' }).err, 'invalid');
    eq(a.counters.pings_sent, 5);
    ok(h.messages(b, 'fx').some((m) => m.e.some((e) => e[0] === 'ping')), 'ping fx sent');
  });

  t.test('spend caps: per player per day, land spends exempt, big spends logged to chat', async () => {
    const h = await createHarness({ seed: 29, players: 0 });
    const host = h.addPlayer({ name: 'Host' });
    const guest = h.addPlayer({ name: 'Guest', loopback: false, token: 'guest-token-4' });
    const g = h.game;
    g.call('addGlint', 50000, 'test', null);
    eq(h.do(host, 'coop.spendcap', { id: guest.id, glint: 1000 }).ok, true);
    eq(g.worldState.coop.caps[g.worldState.coop.players.find((p) => p.id === guest.id).uid], 1000);
    eq(g.call('spendGlint', 600, 'temper', guest), true);
    eq(g.call('spendGlint', 600, 'temper', guest), false, 'over the daily cap');
    eq(g.call('spendGlint', 600, 'land', guest), true, 'land is exempt');
    eq(g.call('spendGlint', 5000, 'temper', host), true);
    ok(h.messages(guest, 'chat').some((m) => m.sys && /Host spent 5,000/.test(m.text)), 'logged above 2,000 x tier');
    eq(h.do(host, 'chat.say', { text: '/spendcap Guest off' }).ok, true);
    eq(g.call('spendGlint', 600, 'temper', guest), true);
  });

  t.test('settings.set: per-profile prefs validated and saved', async () => {
    const h = await createHarness({ seed: 30, players: 1 });
    const p = h.player(0);
    eq(h.do(p, 'settings.set', { key: 'tutorial', value: 2 }).ok, true);
    eq(h.do(p, 'settings.set', { key: 'Bad Key!', value: 1 }).err, 'invalid');
    eq(h.do(p, 'settings.set', { key: 'obj', value: { a: 1 } }).err, 'invalid');
    eq(p.selfState.prefs.tutorial, 2);
    const h2 = await h.reload();
    const p2 = h2.addPlayer({ token: p.token });
    eq(p2.selfState.prefs.tutorial, 2);
  });

  t.test('party roster at 2 Hz and world.coop view (no tokens leak)', async () => {
    const h = await createHarness({ seed: 31, players: 2 });
    h.step(1);
    const party = h.game.worldState.party;
    eq(party.length, 2);
    for (const k of ['id', 'name', 'color', 'level', 'hp', 'mh', 'realm', 'x', 'y']) ok(k in party[0], 'party key ' + k);
    const json = JSON.stringify(h.game.worldState.coop) + JSON.stringify(party);
    for (const p of h.game.players.values()) ok(!json.includes(p.token), 'token not published');
  });

  t.test('shell helpers: settings defaults and tutorial steps per DESIGN 23', () => {
    const s = normaliseSettings({ master: 5, uiScale: 9, particles: 'lots', shake: 0 });
    eq(s.master, 1); eq(s.uiScale, DEFAULT_SETTINGS.uiScale); eq(s.particles, DEFAULT_SETTINGS.particles); eq(s.shake, false);
    eq(TUTORIAL_STEPS.length >= 6, true);
    ok(TUTORIAL_STEPS.some((x) => /Ballast/.test(x.text)), 'Ballast explained');
    ok(TUTORIAL_STEPS.some((x) => /60 Glint/.test(x.text)), 'q01 pays 60 Glint');
    // step logic: no driftwood -> step 0; 10 driftwood -> later step
    const st0 = { self: { inv: { slots: [] }, xp: { level: 1 } }, world: { mainQuest: { id: 'q01', goals: [{ have: 0 }, { have: 0 }] }, plots: [{ owned: true }] } };
    eq(tutorialStep(st0, 0).id, 'gather');
    // the Workbench needs 10 driftwood and 6 fieldstone (client tutorial follows the real cost)
    const st1 = { self: { inv: { slots: [['driftwood', 10], ['fieldstone', 6]] }, xp: { level: 1 } }, world: st0.world };
    eq(tutorialStep(st1, 0).id, 'workbench');
  });
}
