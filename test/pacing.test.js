// WP14 pacing test (PACING.md section 10).
// 1. The ported model (shared/rules/pacing.js) over the REAL data: every band of section 10.
// 2. The pacing bot (test/bot/pacing-bot.js) on the real server simulation:
//    - always: the first plot is raised before minute 30 (short run);
//    - with `npm run test:pacing` (filter "pacing") or TB_PACING_BOT=1: the full solo run to the Drowned Moon,
//      asserting no Beacon earlier than 85% of its PACING hour, the critical path >= 85 h, and the idle check.
//      TB_PACING_COOP=1 adds the 2- and 4-player runs (co-op critical path within 70-95 h).

import { ok, eq } from './assert.js';
import { simulate, expand, TARGET_PHASE_END } from '../shared/rules/pacing.js';
import { runPacingBot, formatReport } from './bot/pacing-bot.js';
import { content } from '../shared/data/index.js';

const FULL = process.argv[2] === 'pacing' || process.env.TB_PACING_BOT === '1';

export default async function (t) {
  t.test('model: section 10 bands hold with requirements expanded from shared/data', () => {
    const r = simulate();
    eq(r.totals.landTotal, 317910, 'land total');
    eq(r.totals.totalXp, 6432785, 'total XP');
    ok(r.totals.critical >= 85, 'critical path >= 85 h: ' + r.totals.critical.toFixed(2));
    ok(r.totals.full >= 95 && r.totals.full <= 105, 'full model 95-105 h: ' + r.totals.full.toFixed(2));
    for (const row of r.rows.slice(1)) ok(row.ratioInc >= 0.8 && row.ratioInc <= 1.3, `income ratio phase ${row.p}: ${row.ratioInc.toFixed(2)}`);
    for (const row of r.rows.slice(1)) ok(row.ratioXp >= 0.85 && row.ratioXp <= 1.25, `XP ratio phase ${row.p}: ${row.ratioXp.toFixed(2)}`);
    for (const row of r.rows.slice(2, 7)) ok(row.ratioRare >= 0.9 && row.ratioRare <= 1.5, `rare ratio phase ${row.p}: ${row.ratioRare.toFixed(2)}`);
    for (const c of r.coop.slice(1)) ok(c.total >= 70 && c.total <= 95, `co-op S=${c.S}: ${c.total.toFixed(1)} h`);
    ok(r.totals.efficient >= 75, 'efficient player >= 75 h: ' + r.totals.efficient.toFixed(2));
    ok(r.checks.rareCumulative, 'cumulative rare supply >= demand');
  });

  t.test('model: a recipe change moves the requirement (expansion reads the real recipes)', () => {
    const base = expand({ beacon_probe: 0, copper_bar: 150 }, content);
    ok(base.raw.copper_ore === 300 && base.fuel === 150, 'copper_bar = 2 copper_ore + 1 fuel');
    const r = simulate();
    ok(r.rows[1].gates > 1000, 'Beacon 1 expands to raw drops');
  });

  t.test('bot: first plot raised before minute 30 on the real server simulation', async () => {
    const r = await runPacingBot({ players: 1, seed: 1, maxHours: 1.5, quiet: true });
    ok(r.firstPlotMin != null && r.firstPlotMin < 30, 'first plot at minute ' + r.firstPlotMin);
  });

  t.test('idle check: 8 h holding primary next to a Burrow cluster < 1.5 h of active play (PACING 7)', async () => {
    const { createHarness } = await import('./harness.js');
    const { rt } = await import('../server/game/systems/machines.js');
    const { PLOT } = await import('../shared/config.js');
    const { BUTTON } = await import('../shared/protocol.js');
    const h = await createHarness({ seed: 9, players: 1 });
    const g = h.game, p = h.player(0);
    const realm = g.realms.get('overworld');
    const plot = g.world.plots.find((x) => x.biome === 'greenmarrow' && x.feature === 'wild');
    h.raise(plot.px, plot.py);
    g.world.flags['beacon:1'] = true;
    const burrows = [];
    for (const [dx, dy] of [[4, 4], [14, 4], [4, 14], [14, 14]]) {
      const b = g.call('placeStructure', realm, 'burrow_1', plot.px * PLOT + dx, plot.py * PLOT + dy, 0, p, { free: true, force: true });
      if (b) burrows.push(b);
    }
    ok(burrows.length >= 2, 'burrows placed');
    realm.move(p.entity, plot.px * PLOT + 10, plot.py * PLOT + 10);
    const made = () => burrows.reduce((n, b) => n + (rt(g, b).made ?? 0), 0);
    // one hour of active play next to the cluster (the player keeps doing things: activity every minute)
    let m0 = made();
    for (let i = 0; i < 60; i++) { g.markActive(p, 'test'); for (let k = 0; k < 60; k++) g.tick(1); for (const b of burrows) g.call('extractFrom', b, null, 999); }
    const activeHour = made() - m0;
    // 8 hours holding primary fire, no other input
    h.input(p, { b: BUTTON.PRIMARY });
    m0 = made();
    for (let i = 0; i < 8 * 60; i++) { h.step(0.05); for (let k = 0; k < 60; k++) g.tick(1); for (const b of burrows) g.call('extractFrom', b, null, 999); }
    const idle = made() - m0;
    ok(activeHour > 0, 'machines produce while tended: ' + activeHour);
    ok(idle < 1.5 * activeHour, `8 h idle made ${idle} units = ${(idle / activeHour).toFixed(2)} h of active output`);
  });

  if (!FULL) return;

  t.test('bot: solo run to the Drowned Moon (PACING 10.2)', async () => {
    const r = await runPacingBot({ players: 1, seed: 1, maxHours: 200, quiet: true });
    console.log('\n' + formatReport(r) + '\n');
    ok(r.finished, 'the bot finishes the game');
    for (let k = 1; k <= 6; k++) {
      const end = r.phases[k].end;
      ok(end != null && end >= 0.85 * TARGET_PHASE_END[k], `Beacon ${k} at ${end?.toFixed(1)} h, not before 85% of ${TARGET_PHASE_END[k]} h`);
    }
    ok(r.hours >= 85, 'critical path >= 85 h: ' + r.hours.toFixed(1));
  });

  if (process.env.TB_PACING_COOP !== '1') return;
  for (const n of [2, 4]) {
    t.test(`bot: ${n}-player crew (co-op critical path 70-95 h)`, async () => {
      const r = await runPacingBot({ players: n, seed: 1, maxHours: 200, quiet: true });
      console.log('\n' + formatReport(r) + '\n');
      ok(r.finished, 'finished');
      ok(r.hours >= 70 && r.hours <= 95, `${n} players: ${r.hours.toFixed(1)} h`);
    });
  }
}
