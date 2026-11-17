// Tidebound pacing model. Run: node docs/pacing-model.mjs
// Every table in PACING.md is printed by this file. WP14 ports it to shared/rules/pacing.js
// and test/pacing.test.js asserts the bands at the bottom.

// ---------- recipes (DESIGN 6.2, 6.3) ----------
const R = {
  plank: { o: 1, i: { wood: 2 } }, brick: { o: 1, i: { stone: 2 }, f: 1 }, rope: { o: 1, i: { fiber: 3 } },
  cloth: { o: 1, i: { fiber: 4 } }, glass: { o: 1, i: { sand: 2 }, f: 1 },
  copper_bar: { o: 1, i: { ore1: 2 }, f: 1 }, iron_bar: { o: 1, i: { ore2: 2 }, f: 1 },
  cindersteel_bar: { o: 1, i: { ore3: 2, iron_bar: 1 }, f: 2 }, prism_alloy: { o: 1, i: { ore4: 2, glass: 1 }, f: 3 },
  rimesteel_bar: { o: 1, i: { ore5: 2, everice: 1 }, f: 4 }, umbral_alloy: { o: 1, i: { ore6: 2, nullsilt: 1 }, f: 6 },
  gear_part: { o: 2, i: { copper_bar: 1 } }, iron_plate: { o: 1, i: { iron_bar: 2 } },
  sluice_board: { o: 1, i: { plank: 2, resin: 1 } },
  flux_coil: { o: 1, i: { cindersteel_bar: 2, copper_bar: 1, brimstone: 1 } },
  lens: { o: 2, i: { glass: 2, amber: 1 } },
  prism_circuit: { o: 1, i: { prism_alloy: 1, lens: 1, flux_coil: 1 } },
  cryo_cell: { o: 1, i: { rimesteel_bar: 2, everice: 2, aurora_shard: 1 } },
  hollow_core: { o: 1, i: { umbral_alloy: 2, echoglass: 1, cryo_cell: 1, prism_circuit: 1 } },
  ballast_1: { o: 1, i: { stone: 3, copper_bar: 1 }, f: 1 }, ballast_2: { o: 1, i: { stone: 3, iron_bar: 1 }, f: 1 },
  ballast_3: { o: 1, i: { stone: 3, cindersteel_bar: 1 }, f: 1 }, ballast_4: { o: 1, i: { stone: 3, prism_alloy: 1 }, f: 1 },
  ballast_5: { o: 1, i: { stone: 3, rimesteel_bar: 1 }, f: 1 },
};
const RARES = ['pearl', 'magma_core', 'amber', 'aurora_shard', 'echoglass'];
function expand(cost, acc = {}) {
  for (const [k, q] of Object.entries(cost)) {
    const r = R[k];
    if (!r) { acc[k] = (acc[k] || 0) + q; continue; }
    const n = q / r.o;
    if (r.f) acc.fuel = (acc.fuel || 0) + n * r.f;
    const sub = {}; for (const [a, b] of Object.entries(r.i)) sub[a] = b * n;
    expand(sub, acc);
  }
  return acc;
}
const ru = (c) => Math.round(Object.values(expand(c)).reduce((a, b) => a + b, 0));
const merge = (list) => list.reduce((a, [c, n = 1]) => { for (const k in c) a[k] = (a[k] || 0) + c[k] * n; return a; }, {});
const f = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- gates (DESIGN 7.3, 18.1) ----------
const BEACON = [
  { copper_bar: 150, plank: 150, brick: 150 },
  { iron_bar: 150, iron_plate: 60, rope: 40, pearl: 100 },
  { cindersteel_bar: 300, flux_coil: 60, stone: 150, magma_core: 90 },
  { prism_alloy: 500, prism_circuit: 80, glass: 200, amber: 100 },
  { rimesteel_bar: 1600, cryo_cell: 200, everice: 600, aurora_shard: 150 },
  { umbral_alloy: 3000, hollow_core: 300, nullsilt: 1000, echoglass: 150 },
];
const TIDEGATE = [
  { brick: 5000, plank: 3000, iron_plate: 2000 }, { cindersteel_bar: 2500, prism_alloy: 1500, flux_coil: 600 },
  { lens: 400, prism_circuit: 300, glass: 2000 }, { cryo_cell: 250, rimesteel_bar: 2000, everice: 500 },
  { hollow_core: 200, umbral_alloy: 2500, gloom_heart: 100 },
];
// ballast per plot (DESIGN 4.3): Greenmarrow 10*ordinal of ballast_1; then flat per biome, made from the previous tier
const BALLAST = [
  { ballast_1: 10 },                          // phase 0: ordinal 1 (q01 60 Glint + guaranteed 15-Glint cache pay for it)
  { ballast_1: 20 + 30 + 40 + 50 + 60 + 70 + 80 }, // phase 1: ordinals 2-8
  { ballast_1: 90 * 15 }, { ballast_2: 160 * 15 }, { ballast_3: 200 * 15 }, { ballast_4: 380 * 15 }, { ballast_5: 1000 * 12 }, {},
];
const BARS = ['copper_bar', 'iron_bar', 'cindersteel_bar', 'prism_alloy', 'rimesteel_bar', 'umbral_alloy'];
const gear = (k) => ({ [BARS[k - 1]]: (8 + 4 * k) + (10 + 5 * k) + 3 * (6 + 3 * k), wood: 6, [RARES[k - 2] || 'shell']: 3, drop: 23, fiber: 30 });

// ---------- machines built on the critical path (DESIGN 8) ----------
const S = {
  burrow_1: { iron_plate: 12, gear_part: 20, plank: 30 }, burrow_2: { flux_coil: 20, iron_plate: 40, magma_core: 10 },
  burrow_3: { cryo_cell: 20, prism_circuit: 40 }, grabber: { flux_coil: 2, gear_part: 4 },
  autobench_1: { iron_plate: 30, flux_coil: 10, gear_part: 20 }, autobench_2: { prism_circuit: 20, cindersteel_bar: 30 },
  autobench_3: { hollow_core: 15, rimesteel_bar: 40 }, drill: { prism_circuit: 30, rimesteel_bar: 40, cryo_cell: 10 },
  tiller: { prism_circuit: 10, iron_plate: 20 }, gull: { cryo_cell: 20, cloth: 30, prism_circuit: 20 },
  ledger: { prism_circuit: 20, cryo_cell: 10 }, mint: { rimesteel_bar: 40, cryo_cell: 20 },
  tide_wheel: { plank: 20, iron_plate: 10, flux_coil: 4 }, boiler: { cindersteel_bar: 30, flux_coil: 10, brick: 20 },
  array: { prism_circuit: 10, glass: 20 }, turbine: { cryo_cell: 10, rimesteel_bar: 30 }, reactor: { hollow_core: 20, umbral_alloy: 60 },
  kiln_2: { brick: 40, iron_plate: 20, stone: 10 }, kiln_3: { prism_alloy: 60, flux_coil: 20, everice: 30 },
  wb2: { cindersteel_bar: 30, plank: 20, gear_part: 10 }, wb3: { rimesteel_bar: 40, prism_circuit: 10 },
  anvil_2: { cindersteel_bar: 30, magma_core: 4 }, anvil_3: { rimesteel_bar: 40, aurora_shard: 4 },
  sluice: { sluice_board: 1 }, trawl: { flux_coil: 15, rope: 30, glass: 10 }, turret: { flux_coil: 10, iron_plate: 20 },
  hopper: { plank: 6, iron_plate: 2 },
};
const BUILT = [
  {}, {}, { burrow_1: 2, hopper: 4 },
  { burrow_1: 2, burrow_2: 1, sluice: 40, grabber: 8, tide_wheel: 2, boiler: 1, autobench_1: 2, kiln_2: 2, wb2: 1, anvil_2: 1 },
  { burrow_2: 3, autobench_2: 2, array: 2, trawl: 1, grabber: 8, sluice: 60, kiln_3: 2, wb3: 1, turret: 2 },
  { burrow_3: 4, drill: 4, tiller: 2, gull: 1, turbine: 3, anvil_3: 1, grabber: 12 },
  { burrow_3: 4, drill: 6, ledger: 2, mint: 1, autobench_3: 2, reactor: 1, turbine: 4 },
  { burrow_3: 4, drill: 2 },
];
const STARTER = [500, 400, 300, 0, 0, 0, 0, 0];           // hand-built stations, storage, lamps (RU)

// ---------- throughput (PACING 4.2, 4.3) ----------
const MANUAL = [700, 900, 1100, 1300, 1500, 1700, 1900, 2000];
// installed base x base rate x typical speed bonus (x1.1 / 1.2 / 1.3 / 1.4 in phases 3-6: F10, wing_works, cards; phase 7 already includes x1.5)
const AUTO = [0, 150, 600, 2090, 6000, 16250, 37800, 45000];

// ---------- fixed-time content, hours per phase ----------
const COMBAT_REQ = [0.2, 0.9, 1.4, 1.7, 1.9, 2.0, 2.2, 1.45];   // Vault first clears, Wardens, mob drops, Trench 10, finale
const COMBAT_OPT = [0, 0.3, 0.9, 1.5, 1.7, 1.9, 2.1, 0.5];      // Vault repeats, extra Trench, elective fights
const BUILD = [0.3, 1.0, 2.0, 3.0, 3.5, 3.6, 3.8, 2.6];         // placing, routing, factory layout (required)
const SIDE_REQ = [0.1, 0.7, 1.8, 2.2, 2.2, 2.2, 2.2, 0.7];      // castaway lines, shrines, Archive wings (fish, crops, relics)
const SIDE_OPT = [0, 0.1, 0.4, 0.5, 0.5, 0.5, 0.4, 0.1];        // Tide Board contracts, Logbook hunting
const OPT_RU_H = [0, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0];          // tempering, decor, surplus food

// ---------- land (DESIGN 4.3) ----------
const land = (n) => Math.round(50 * Math.pow(1.08, n) / 5) * 5;
const cum = [0]; for (let n = 1; n <= 80; n++) cum[n] = cum[n - 1] + land(n);
const PLOTS_END = [1, 8, 23, 38, 53, 68, 80, 80];

// ---------- income sources, Glint per hour (DESIGN 11, 15, 16.3) ----------
const KILLS_H = 100, ELITE = 1.32;
const TIER = [1, 1, 2, 3, 4, 5, 6, 6];
const RAWV = [1, 1, 2, 4, 8, 16, 32, 32];
// goods kept in the selling rotation: [count, mean value]. Cap per good = 120 * value Glint/h (saturation steady state)
const ROTATION = [[0, 0], [0, 0], [0, 0], [1, 4], [4, 6], [8, 10], [16, 25], [20, 25]];
const curve = (h) => Math.min(150 * Math.pow(1.07, h), 40000);
const curveInt = (a, b) => { let s = 0; const N = 2000; for (let i = 0; i < N; i++) s += curve(a + (b - a) * (i + 0.5) / N); return s * (b - a) / N; };
function income(p) {
  const k = TIER[p];
  const drops = p === 0 ? 0 : KILLS_H * k * 1 * ELITE;   // tier * rand(0..2), mean = tier; no enemies spawn before the first plot
  const caches = 20 * k;                            // half of low tides worked, 4% caches at 10*tier
  const contracts = p === 0 ? 0 : 30 * Math.pow(2, k);   // one Tide Board contract per hour
  const sales = 120 * ROTATION[p][0] * ROTATION[p][1] * (p >= 6 ? 0.7 : 1);   // Ledger Posts pay 70%
  return { drops, caches, contracts, sales, total: drops + caches + contracts + sales };
}

// ---------- XP (DESIGN 5.2) ----------
const xp = (L) => Math.round(30 * Math.pow(L, 1.9) / 5) * 5;
const cx = [0, 0]; for (let L = 1; L < 100; L++) cx[L + 1] = cx[L] + xp(L);
const LEVEL_END = [8, 18, 32, 46, 60, 74, 90, 100];
const NODE_XP = [4, 4, 10, 18, 26, 38, 54, 54], MOB_XP = [12, 12, 33, 62, 98, 136, 197, 197];
const CRAFT_XP = [200, 600, 1900, 3600, 6000, 9500, 15000, 20000], LUMP_XP = [100, 900, 1400, 4800, 8000, 12500, 17000, 75000];
const XPMULT = [1.0, 1.1, 1.2, 1.3, 1.45, 1.6, 1.75, 1.75];
const NODES_H = 360, NIGHT = 1.08;

// ---------- rares (DESIGN 4.5, 8.1): supply of the current tier's rare per hour ----------
// manual: 360 breaks/h * 70% on current tier * 3% gem nodes; mobs 1.5/h; burrows 0.5% of output; drills 1% of output
// supply per hour of EVERY rare per phase, including machines left running in older biomes (phase 7: its 2 new Drills go on the Glasswaste vein)
const RARE_ALL = [{}, {}, { pearl: 10.9 }, { magma_core: 9.1, pearl: 1 }, { amber: 14.9, magma_core: 4.8 },
  { aurora_shard: 42.7, amber: 21.6, magma_core: 4.8 }, { echoglass: 40.2, aurora_shard: 67.2, amber: 21.6 },
  { echoglass: 40.2, aurora_shard: 67.2, amber: 33.6 }];
const RARE_SRC = [null, null,
  { manual: 7.6, mobs: 1.5, tidal: 1.8, burrow: 0, drill: 0 },
  { manual: 7.6, mobs: 1.5, tidal: 0, burrow: 0, drill: 0 },
  { manual: 7.6, mobs: 1.5, tidal: 0, burrow: 2 * 4.8 * 0.6, drill: 0 },
  { manual: 7.6, mobs: 1.5, tidal: 0, burrow: 4 * 10.8 * 0.5, drill: 4 * 6 * 0.5 },
  { manual: 7.6, mobs: 2.0, tidal: 0, burrow: 4 * 10.8 * 0.5, drill: 3 * 6 * 0.5 }];

// ================= compute =================
const rows = []; let t = 0;
for (let p = 0; p < 8; p++) {
  const gates = p === 0 ? {} : p <= 6 ? BEACON[p - 1] : merge(TIDEGATE.map((x) => [x]));
  const mach = merge(Object.entries(BUILT[p]).map(([k, n]) => [S[k], n]));
  const g = p >= 1 && p <= 6 ? gear(p) : {};
  const inc = income(p);
  const r = { p, gates: ru(gates), ballast: ru(BALLAST[p]), gear: ru(g), mach: ru(mach) + STARTER[p], inc };
  r.demand = merge([[expand(gates)], [expand(mach)], [expand(g)]]);
  r.fuel = Math.round(expand(merge([[gates], [BALLAST[p]]])).fuel || 0);
  rows.push(r);
}
// two passes: phase length depends on sold RU, sold RU depends on phase length
for (const r of rows) {
  const p = r.p, thr = MANUAL[p] + AUTO[p];
  const fixedH = COMBAT_REQ[p] + COMBAT_OPT[p] + BUILD[p] + SIDE_REQ[p] + SIDE_OPT[p] + OPT_RU_H[p];
  const base = r.gates + r.ballast + r.gear + r.mach;
  const soldPerH = r.inc.sales / RAWV[p];
  r.len = (base / thr + fixedH) / (1 - soldPerH / thr);
  r.sold = Math.round(soldPerH * r.len);
  r.req = base + r.sold; r.gatherH = r.req / thr;
  r.crit = r.gatherH + COMBAT_REQ[p] + BUILD[p] + SIDE_REQ[p];
  r.full = r.len; r.start = t; t += r.len; r.end = t;
}
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const P = (...a) => console.log(a.join(' | '));

console.log('\n== A. Required raw units and hours per phase ==');
P('phase', 'gates', 'ballast', 'gear', 'machines', 'sold', 'required RU', 'manual/h', 'auto/h', 'gather h', 'combat req', 'build', 'side req', 'CRITICAL h', 'optional h', 'FULL h', 'start-end');
for (const r of rows) P(r.p, f(r.gates), f(r.ballast), f(r.gear), f(r.mach), f(r.sold), f(r.req), MANUAL[r.p], f(AUTO[r.p]), f(r.gatherH, 2), COMBAT_REQ[r.p], BUILD[r.p], SIDE_REQ[r.p], f(r.crit, 2), f(r.full - r.crit, 2), f(r.full, 2), f(r.start, 1) + '-' + f(r.end, 1));
P('TOTAL', '', '', '', '', '', f(sum('req')), '', '', f(sum('gatherH'), 2), f(COMBAT_REQ.reduce((a, b) => a + b), 2), f(BUILD.reduce((a, b) => a + b), 1), f(SIDE_REQ.reduce((a, b) => a + b), 1), f(sum('crit'), 2), f(sum('full') - sum('crit'), 2), f(sum('full'), 2));
console.log('fuel units inside gates+ballast per phase:', rows.map((r) => f(r.fuel)).join(', '));

console.log('\n== B. Land and Glint ==');
P('phase', 'hours', 'curve Glint', 'modelled Glint', 'ratio', 'drops/h', 'caches/h', 'contracts/h', 'sales/h', 'land spend', 'land share of modelled');
let prevPlots = 0;
for (const r of rows) {
  const c = curveInt(r.start, r.end), m = r.inc.total * r.len + (r.p === 0 ? 75 : 0), l = cum[PLOTS_END[r.p]] - cum[prevPlots]; prevPlots = PLOTS_END[r.p];
  r.ratioInc = m / c;
  P(r.p, f(r.start, 1) + '-' + f(r.end, 1), f(c), f(m), f(m / c, 2), f(r.inc.drops), f(r.inc.caches), f(r.inc.contracts), f(r.inc.sales), f(l), f(l / m * 100) + '%');
}
console.log('land total', f(cum[80]), ' samples', [1, 2, 8, 9, 23, 24, 38, 39, 53, 54, 68, 69, 80].map((n) => n + ':' + land(n)).join(' '));

console.log('\n== C. XP ==');
P('phase', 'levels', 'XP needed', 'hours', 'required/h', 'node', 'kill', 'craft', 'lump', 'mult', 'supply/h', 'ratio');
let L0 = 1;
for (const r of rows) {
  const p = r.p, need = cx[LEVEL_END[p]] - cx[L0], reqH = need / r.len;
  const node = NODES_H * NODE_XP[p], kill = KILLS_H * MOB_XP[p] * ELITE * NIGHT;
  const sup = (node + kill + CRAFT_XP[p]) * XPMULT[p] + LUMP_XP[p];
  r.ratioXp = sup / reqH;
  P(p, L0 + '->' + LEVEL_END[p], f(need), f(r.len, 1), f(reqH), f(node), f(kill), f(CRAFT_XP[p]), f(LUMP_XP[p]), XPMULT[p], f(sup), f(sup / reqH, 2));
  L0 = LEVEL_END[p];
}
console.log('total XP', f(cx[100]), ' mastery 10/20 at 600*m^2:', f(600 * 385), f(600 * 2870));

console.log('\n== D. Rares: current-tier rare, demand vs supply per phase ==');
P('phase', 'rare', 'demand', 'supply/h', 'supply', 'ratio');
for (let p = 2; p <= 6; p++) {
  const r = rows[p], name = RARES[p - 2], s = Object.values(RARE_SRC[p]).reduce((a, b) => a + b, 0);
  r.ratioRare = s * r.len / r.demand[name];
  P(p, name, f(r.demand[name]), f(s, 1), f(s * r.len), f(r.ratioRare, 2));
}
const tg = expand(merge(TIDEGATE.map((x) => [x])));
console.log('Tidegate rares:', RARES.map((n) => n + ' ' + f(tg[n] || 0)).join(', '));
console.log('older-tier rare demand per phase:', rows.map((r) => r.p + ':' + RARES.filter((n) => r.demand[n]).map((n) => n + ' ' + f(r.demand[n])).join('/')).join('  '));

console.log('cumulative supply / demand of every rare at each phase end:');
let rareOk = true; const cs = {}, cd = {};
for (const r of rows) {
  for (const n of RARES) { cs[n] = (cs[n] || 0) + (RARE_ALL[r.p][n] || 0) * r.len; cd[n] = (cd[n] || 0) + (r.demand[n] || 0); if (cd[n] > 0 && cs[n] < cd[n]) rareOk = false; }
  if (r.p >= 2) P(r.p, RARES.filter((n) => cd[n]).map((n) => n + ' ' + f(cs[n]) + '/' + f(cd[n])).join(', '));
}
// efficient-player variant: AUTO x1.25, BUILD x0.8
let eff = 0; for (const r of rows) eff += r.req / (MANUAL[r.p] + AUTO[r.p] * 1.25) + COMBAT_REQ[r.p] + BUILD[r.p] * 0.8 + SIDE_REQ[r.p];
console.log('efficient-player critical path (AUTO x1.25, BUILD x0.8):', f(eff, 2));

console.log('\n== E. Co-op (critical path) ==');
P('S', 'coopScale', 'gather h', 'combat h', 'build h', 'side h', 'critical h', 'vs solo');
const solo = sum('crit'); const coop = [];
for (const Sn of [1, 2, 3, 4, 6, 8]) {
  const C = 1 + 0.7 * (Sn - 1), M = 1 + 0.6 * (Sn - 1);
  let g = 0; for (const r of rows) g += r.req * C / (MANUAL[r.p] * M + AUTO[r.p] * C);
  const combat = COMBAT_REQ.reduce((a, b) => a + b) * (1 + 0.8 * (Sn - 1)) / Sn;
  const build = BUILD.reduce((a, b) => a + b) * C / Sn;
  const side = SIDE_REQ.reduce((a, b) => a + b) / Math.pow(Sn, 0.7);
  const tot = g + combat + build + side;
  coop.push(tot);
  P(Sn, C.toFixed(1), f(g, 1), f(combat, 1), f(build, 1), f(side, 1), f(tot, 1), f(tot / solo * 100) + '%');
}

console.log('\n== F. Assertions ==');
const check = (name, ok) => console.log((ok ? 'PASS ' : 'FAIL ') + name);
check('land total = 317,910', cum[80] === 317910);
check('total XP = 6,432,785', cx[100] === 6432785);
check('critical path >= 85 h (' + f(sum('crit'), 2) + ')', sum('crit') >= 85);
check('full model 95-105 h (' + f(sum('full'), 2) + ')', sum('full') >= 95 && sum('full') <= 105);
check('income ratio 0.8-1.3 in phases 1-7', rows.slice(1).every((r) => r.ratioInc >= 0.8 && r.ratioInc <= 1.3));
check('XP ratio 0.85-1.25 in phases 1-7', rows.slice(1).every((r) => r.ratioXp >= 0.85 && r.ratioXp <= 1.25));
check('rare ratio 0.9-1.5 in phases 2-6', rows.slice(2, 7).every((r) => r.ratioRare >= 0.9 && r.ratioRare <= 1.5));
check('co-op critical path 70-95 h for S = 2..8', coop.slice(1).every((h) => h >= 70 && h <= 95));
check('efficient-player critical path >= 75 h (' + f(eff, 2) + ')', eff >= 75);
check('cumulative supply of every rare >= cumulative demand at each phase end', rareOk);
