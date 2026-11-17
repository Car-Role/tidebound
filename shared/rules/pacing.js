// Pacing model (PACING.md sections 2-8, 10). WP14 port of docs/pacing-model.mjs.
//
// What is DERIVED from the real game data (so a data change that breaks pacing fails test/pacing.test.js):
//   - every material requirement: Beacon and Tidegate costs (shared/data/structures.js), gear recipes (hook k+1,
//     weapon k+1, armour k), machine and station costs, Ballast per plot (rules/constants.js BALLAST_PER_PLOT and
//     the Ballast recipes), expanded through the real recipe graph (shared/data/recipes.js) down to raw drops plus
//     Kiln fuel units;
//   - plots per biome (shared/grid.js biomeOf over the 9 x 9 world), land cost (rules/costs.js), the XP curve
//     (rules/xp.js), coopScale and the co-op HP / respawn multipliers (rules/constants.js).
// What is an ASSUMPTION (the PACING inputs, exported as PACING_INPUTS so they can be tuned or overridden):
//   throughput per phase, the installed machine base, fixed hours for combat / building / side content,
//   income-source rates and the selling rotation, per-phase XP sources, rare supply per hour.
//
// simulate(opts) -> { rows, totals, income, xp, rares, coop, efficient, checks }. Pure; no game state.

import { content as defaultContent } from '../data/index.js';
import { biomeOf } from '../grid.js';
import { START_PLOT } from '../config.js';
const START_PLOT_INDEX = START_PLOT.py * 9 + START_PLOT.px;
import { BALLAST_PER_PLOT, GATE_COST_MULT, COOP_SCALE_PER_PLAYER, NODE_RESPAWN_PER_PLAYER, BOSS_HP_PER_PLAYER } from './constants.js';
import { landBase } from './costs.js';
import { totalXp } from './xp.js';

export const BIOME_ORDER = ['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
export const PHASE_NAMES = ['Castaway', 'Greenmarrow', 'Saltfen', 'Emberreach', 'Glasswaste', 'Hoarfrost', 'Umbral Deep', 'Tidegate and Moonfall'];
// PACING section 2 targets (hours at the end of each phase, solo full model) used by the bot assertions.
export const TARGET_PHASE_END = [1.4, 8.6, 21.9, 39.0, 56.4, 72.9, 89.3, 98.2];
export const TARGET_CRITICAL = 85.79;

// ---------------------------------------------------------------- assumptions (PACING 3.2-3.5, 4.2, 5, 6.2)
export const PACING_INPUTS = Object.freeze({
  manual: [700, 900, 1100, 1300, 1500, 1700, 1900, 2000],               // RU/h by hand
  auto: [0, 150, 600, 2090, 6000, 16250, 37800, 45000],                 // RU/h from the installed base at full tend
  combatReq: [0.2, 0.9, 1.4, 1.7, 1.9, 2.0, 2.2, 1.45],
  combatOpt: [0, 0.3, 0.9, 1.5, 1.7, 1.9, 2.1, 0.5],
  build: [0.3, 1.0, 2.0, 3.0, 3.5, 3.6, 3.8, 2.6],
  sideReq: [0.1, 0.7, 1.8, 2.2, 2.2, 2.2, 2.2, 0.7],
  sideOpt: [0, 0.1, 0.4, 0.5, 0.5, 0.5, 0.4, 0.1],
  optRuH: [0, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0],
  starter: [500, 400, 300, 0, 0, 0, 0, 0],                             // hand-built stations, storage, lamps (RU)
  // machines built per phase (real structure ids)
  built: [
    {}, {}, { burrow_1: 2, hopper: 4 },
    { burrow_1: 2, burrow_2: 1, sluice_1: 40, grabber: 8, tide_wheel: 2, ember_boiler: 1, autobench_1: 2, kiln_2: 2, workbench_2: 1, anvil_2: 1 },
    { burrow_2: 3, autobench_2: 2, prism_array: 2, trawl_buoy: 1, grabber: 8, sluice_1: 60, kiln_3: 2, workbench_3: 1, bolt_turret: 2 },
    { burrow_3: 4, drill: 4, tiller_bot: 2, gull_roost: 1, rime_turbine: 3, anvil_3: 1, grabber: 12 },
    { burrow_3: 4, drill: 6, ledger_post: 2, mint: 1, autobench_3: 2, umbral_reactor: 1, rime_turbine: 4 },
    { burrow_3: 4, drill: 2 },
  ],
  // income
  killsPerHour: 100, eliteFactor: 1.32,
  tier: [1, 1, 2, 3, 4, 5, 6, 6],
  rawValue: [1, 1, 2, 4, 8, 16, 32, 32],
  rotation: [[0, 0], [0, 0], [0, 0], [1, 4], [4, 6], [8, 10], [16, 25], [20, 25]],
  // XP
  levelEnd: [8, 18, 32, 46, 60, 74, 90, 100],
  nodeXp: [4, 4, 10, 18, 26, 38, 54, 54], mobXp: [12, 12, 33, 62, 98, 136, 197, 197],
  craftXpH: [200, 600, 1900, 3600, 6000, 9500, 15000, 20000], lumpXpH: [100, 900, 1400, 4800, 8000, 12500, 17000, 75000],
  xpMult: [1.0, 1.1, 1.2, 1.3, 1.45, 1.6, 1.75, 1.75], nodesPerHour: 360, nightKill: 1.08,
  // rares (supply per hour of every rare per phase; current-tier sources)
  rareAll: [{}, {}, { pearl: 10.9 }, { magma_core: 9.1, pearl: 1 }, { amber: 14.9, magma_core: 4.8 },
    { aurora_shard: 42.7, amber: 21.6, magma_core: 4.8 }, { echoglass: 40.2, aurora_shard: 67.2, amber: 21.6 },
    { echoglass: 40.2, aurora_shard: 67.2, amber: 33.6 }],
  rareSrc: [null, null, 10.9, 9.1, 14.9, 42.7, 40.2],
});
const RARES = ['pearl', 'magma_core', 'amber', 'aurora_shard', 'echoglass'];
const BARS = ['copper_bar', 'iron_bar', 'cindersteel_bar', 'prism_alloy', 'rimesteel_bar', 'umbral_alloy'];

// ---------------------------------------------------------------- recipe expansion over the real data

// Canonical recipe per item: the first recipe in data order that makes it at a crafting station (not a cookpot,
// campfire or still) and does not consume the item itself.
export function recipeIndex(content = defaultContent) {
  const idx = new Map();
  for (const r of content.recipes) {
    const out = r.out?.item;
    if (!out || idx.has(out)) continue;
    if (['cookpot', 'campfire', 'still'].includes(r.station)) continue;
    if ((r.in ?? []).some((x) => x.item === out)) continue;
    idx.set(out, r);
  }
  return idx;
}

// Expand a cost map {item: qty} to raw drops + fuel: { raw: {item: qty}, fuel, ru }.
export function expand(cost, content = defaultContent, idx = recipeIndex(content), acc = { raw: {}, fuel: 0 }, depth = 0) {
  const groups = content.modules?.recipes?.GROUPS ?? {};
  for (const [item, qty] of Object.entries(cost)) {
    if (!(qty > 0)) continue;
    const r = depth < 12 ? idx.get(item) : null;
    if (!r) { acc.raw[item] = (acc.raw[item] || 0) + qty; continue; }
    const n = qty / (r.out.qty || 1);
    if (r.fuel) acc.fuel += n * r.fuel;
    const sub = {};
    for (const x of r.in ?? []) {
      let id = x.item;
      if (!id && x.group) id = Object.keys(groups[x.group] ?? {})[0] ?? x.group;
      if (id) sub[id] = (sub[id] || 0) + x.qty * n;
    }
    expand(sub, content, idx, acc, depth + 1);
  }
  acc.ru = Object.values(acc.raw).reduce((a, b) => a + b, 0) + acc.fuel;
  return acc;
}

const add = (a, b, n = 1) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] || 0) + v * n; return a; };
const costMap = (lines = []) => {
  const m = {};
  for (const c of lines) if (c.item) m[c.item] = (m[c.item] || 0) + c.qty;
  return m;
};

// Plots per biome in the real 9 x 9 layout (start plot excluded).
export function plotsPerBiome() {
  const out = Object.fromEntries(BIOME_ORDER.map((b) => [b, 0]));
  for (let py = 0; py < 9; py++) for (let px = 0; px < 9; px++) {
    if (py * 9 + px === START_PLOT_INDEX) continue;
    out[biomeOf(px, py)]++;
  }
  return out;
}

// Ballast cost map for the plots raised in a phase (ordinals are global purchase order).
function ballastFor(biome, fromOrdinal, toOrdinal) {
  const b = BALLAST_PER_PLOT[biome];
  if (!b || toOrdinal < fromOrdinal) return {};
  let qty = 0;
  for (let o = fromOrdinal; o <= toOrdinal; o++) qty += b.perOrdinal ? b.perOrdinal * o : b.qty;
  return { [b.item]: qty };
}

// The raw requirement of each phase, from the real data.
export function phaseRequirements(content = defaultContent, inputs = PACING_INPUTS) {
  const idx = recipeIndex(content);
  const S = content.structures.byId;
  const plots = plotsPerBiome();
  const rows = [];
  // plot ordinals per phase: phase 0 = ordinal 1; phase k (1..6) = the rest of biome k
  let ord = 0;
  const ballast = [];
  const plotsEnd = [];
  for (let p = 0; p < 8; p++) {
    if (p === 0) { ballast.push(ballastFor('greenmarrow', 1, 1)); ord = 1; }
    else if (p <= 6) {
      const biome = BIOME_ORDER[p - 1];
      const n = plots[biome] - (p === 1 ? 1 : 0);
      ballast.push(ballastFor(biome, ord + 1, ord + n));
      ord += n;
    } else ballast.push({});
    plotsEnd.push(ord);
  }
  for (let p = 0; p < 8; p++) {
    let gates = {};
    if (p >= 1 && p <= 6) gates = costMap(S['beacon_' + p]?.cost);
    else if (p === 7) for (const st of content.modules?.structures?.TIDEGATE_STAGES ?? []) add(gates, costMap(st.cost));
    for (const k of Object.keys(gates)) gates[k] *= GATE_COST_MULT;
    let gear = {};
    if (p >= 1 && p <= 6) {
      for (const id of ['hook_' + (p + 1), 'blade_' + (p + 1), 'helm_' + p, 'coat_' + p, 'boots_' + p]) {
        const r = content.recipes.find((x) => x.out.item === id);
        if (r) add(gear, costMap(r.in));
      }
    }
    const mach = {};
    for (const [id, n] of Object.entries(inputs.built[p] ?? {})) add(mach, costMap(S[id]?.cost), n);
    const eg = expand(gates, content, idx), eb = expand(ballast[p], content, idx), eGear = expand(gear, content, idx), em = expand(mach, content, idx);
    const demand = add(add(add({}, eg.raw), em.raw), eGear.raw);
    rows.push({
      p, gatesCost: gates, ballastCost: ballast[p], gearCost: gear, machCost: mach,
      gates: Math.round(eg.ru), ballast: Math.round(eb.ru), gear: Math.round(eGear.ru), mach: Math.round(em.ru) + inputs.starter[p],
      fuel: Math.round(eg.fuel + eb.fuel), demand, plotsEnd: plotsEnd[p],
    });
  }
  return rows;
}

// ---------------------------------------------------------------- the model

const curve = (h) => Math.min(150 * Math.pow(1.07, h), 40000);
const curveInt = (a, b) => { let s = 0; const N = 2000; for (let i = 0; i < N; i++) s += curve(a + (b - a) * (i + 0.5) / N); return s * (b - a) / N; };

export function income(p, inputs = PACING_INPUTS) {
  const k = inputs.tier[p];
  const drops = p === 0 ? 0 : inputs.killsPerHour * k * inputs.eliteFactor;
  const caches = 20 * k;
  const contracts = p === 0 ? 0 : 30 * Math.pow(2, k);
  const [n, v] = inputs.rotation[p];
  const sales = 120 * n * v * (p >= 6 ? 0.7 : 1);
  return { drops, caches, contracts, sales, total: drops + caches + contracts + sales };
}

export function simulate(opts = {}) {
  const content = opts.content ?? defaultContent;
  const I = { ...PACING_INPUTS, ...(opts.inputs ?? {}) };
  const autoMult = opts.autoMult ?? 1, buildMult = opts.buildMult ?? 1;
  const rows = phaseRequirements(content, I);
  let t = 0;
  for (const r of rows) {
    const p = r.p;
    r.inc = income(p, I);
    const thr = I.manual[p] + I.auto[p] * autoMult;
    const fixedH = I.combatReq[p] + I.combatOpt[p] + I.build[p] * buildMult + I.sideReq[p] + I.sideOpt[p] + I.optRuH[p];
    const base = r.gates + r.ballast + r.gear + r.mach;
    const soldPerH = r.inc.sales / I.rawValue[p];
    r.len = (base / thr + fixedH) / (1 - soldPerH / thr);
    r.sold = Math.round(soldPerH * r.len);
    r.req = base + r.sold;
    r.gatherH = r.req / thr;
    r.crit = r.gatherH + I.combatReq[p] + I.build[p] * buildMult + I.sideReq[p];
    r.full = r.len;
    r.start = t; t += r.len; r.end = t;
  }
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);

  // Glint vs curve (B)
  let prev = 0;
  for (const r of rows) {
    const c = curveInt(r.start, r.end);
    const m = r.inc.total * r.len + (r.p === 0 ? 75 : 0);
    let land = 0;
    for (let n = prev + 1; n <= r.plotsEnd; n++) land += landBase(n);
    prev = r.plotsEnd;
    Object.assign(r, { curveGlint: c, modelGlint: m, ratioInc: m / c, landSpend: land });
  }
  // XP (C)
  let L0 = 1;
  for (const r of rows) {
    const p = r.p, need = totalXp(I.levelEnd[p]) - totalXp(L0), reqH = need / r.len;
    const node = I.nodesPerHour * I.nodeXp[p], kill = I.killsPerHour * I.mobXp[p] * I.eliteFactor * I.nightKill;
    const sup = (node + kill + I.craftXpH[p]) * I.xpMult[p] + I.lumpXpH[p];
    Object.assign(r, { xpNeed: need, xpReqH: reqH, xpSupH: sup, ratioXp: sup / reqH });
    L0 = I.levelEnd[p];
  }
  // Rares (D)
  let rareOk = true;
  const cs = {}, cd = {};
  for (const r of rows) {
    if (r.p >= 2 && r.p <= 6) {
      const name = RARES[r.p - 2];
      r.rare = name;
      r.rareDemand = r.demand[name] || 0;
      r.ratioRare = (I.rareSrc[r.p] * r.len) / Math.max(1, r.rareDemand);
    }
    for (const n of RARES) {
      cs[n] = (cs[n] || 0) + (I.rareAll[r.p][n] || 0) * r.len;
      cd[n] = (cd[n] || 0) + (r.demand[n] || 0);
      if (cd[n] > 0 && cs[n] < cd[n]) rareOk = false;
    }
  }
  // efficient player
  let eff = 0;
  for (const r of rows) eff += r.req / (I.manual[r.p] + I.auto[r.p] * 1.25 * autoMult) + I.combatReq[r.p] + I.build[r.p] * 0.8 * buildMult + I.sideReq[r.p];
  // co-op (E)
  const solo = sum('crit');
  const coop = [];
  for (const Sn of [1, 2, 3, 4, 6, 8]) {
    const C = 1 + COOP_SCALE_PER_PLAYER * (Sn - 1), M = 1 + NODE_RESPAWN_PER_PLAYER * (Sn - 1);
    let g = 0;
    for (const r of rows) g += r.req * C / (I.manual[r.p] * M + I.auto[r.p] * autoMult * C);
    const combat = I.combatReq.reduce((a, b) => a + b) * (1 + BOSS_HP_PER_PLAYER * (Sn - 1)) / Sn;
    const build = I.build.reduce((a, b) => a + b) * buildMult * C / Sn;
    const side = I.sideReq.reduce((a, b) => a + b) / Math.pow(Sn, 0.7);
    coop.push({ S: Sn, scale: C, gather: g, combat, build, side, total: g + combat + build + side, vsSolo: (g + combat + build + side) / solo });
  }
  let landTotal = 0;
  for (let n = 1; n <= 80; n++) landTotal += landBase(n);
  const totals = { critical: solo, full: sum('full'), gather: sum('gatherH'), required: sum('req'), landTotal, totalXp: totalXp(100), efficient: eff };
  const checks = {
    landTotal: landTotal === 317910,
    totalXp: totals.totalXp === 6432785,
    critical: solo >= 85,
    full: totals.full >= 95 && totals.full <= 105,
    income: rows.slice(1).every((r) => r.ratioInc >= 0.8 && r.ratioInc <= 1.3),
    xp: rows.slice(1).every((r) => r.ratioXp >= 0.85 && r.ratioXp <= 1.25),
    rare: rows.slice(2, 7).every((r) => r.ratioRare >= 0.9 && r.ratioRare <= 1.5),
    coop: coop.slice(1).every((c) => c.total >= 70 && c.total <= 95),
    efficient: eff >= 75,
    rareCumulative: rareOk,
  };
  return { hours: solo, rows, totals, coop, checks, phases: rows.map((r) => ({ p: r.p, name: PHASE_NAMES[r.p], len: r.len, crit: r.crit, end: r.end })) };
}

export default { simulate, expand, recipeIndex, phaseRequirements, plotsPerBiome, PACING_INPUTS, TARGET_PHASE_END };
