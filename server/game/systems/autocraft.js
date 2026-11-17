// Autobenches (WP8, DESIGN 8.2): craft one selected recipe on a loop. Autobench I: output tier <= 3 at 0.5x hand
// speed; II: tier <= 5 at 1x; III: all tiers at 2x. Eligible recipes are the hand / Workbench / Loom / Anvil recipes
// whose output is a material or component and whose world unlocks are met. 6 input slots, 2 output slots.
// Inputs arrive by Grabber, Spillway, Sluice, Gull or the panel; group inputs (any wood, fibre) use the group's
// output multiplier (DESIGN 6.2). Machine crafts give no XP (item.crafted carries byMachine: true).

import { M, machinesOfType, machineSpeed, isOn, running, want, rt, machineOf, outAdd, invOf, report } from './machines.js';

const BENCH_STATIONS = new Set(['hand', 'workbench', 'workbench_2', 'workbench_3', 'loom', 'anvil', 'anvil_2', 'anvil_3']);
const OUT_CATS = new Set(['material', 'component']);
const STOCK_CRAFTS = 4;           // inputs accepted: up to 4 crafts' worth of each ingredient

const GAMES = new WeakMap();
const A = (game) => GAMES.get(game);

const groupsOf = (game) => game.content.modules.recipes?.GROUPS ?? {};

export function eligibleRecipes(game, kind) {
  const st = A(game);
  if (st.eligible.has(kind)) return st.eligible.get(kind);
  const m = game.content.structures.byId[kind]?.machine;
  const items = game.content.items.byId;
  const list = game.content.recipes.filter((r) => {
    const out = items[r.out?.item];
    return out && BENCH_STATIONS.has(r.station) && OUT_CATS.has(out.cat) && (out.tier ?? 1) <= (m?.maxTier ?? 3);
  }).map((r) => r.id);
  st.eligible.set(kind, list);
  return list;
}

function unlocked(game, recipe) {
  for (const u of recipe.unlock ?? []) {
    if (String(u).startsWith('level:')) continue;          // a machine has no level
    if (!game.call('hasUnlock', u)) return false;
  }
  return true;
}

export function recipeOk(game, e, id) {
  const r = game.content.recipes.byId[id];
  return !!r && eligibleRecipes(game, e.kind).includes(id) && unlocked(game, r);
}

// What one craft would consume from `inv`, or null. Returns { take: [{item, qty}], mult }.
export function planCraft(game, inv, recipe) {
  const groups = groupsOf(game);
  const take = [];
  let mult = 1;
  const reserved = new Map();
  const have = (item) => game.inv.count(inv, item) - (reserved.get(item) ?? 0);
  for (const input of recipe.in) {
    if (input.item) {
      if (have(input.item) < input.qty) return null;
      take.push({ item: input.item, qty: input.qty });
      reserved.set(input.item, (reserved.get(input.item) ?? 0) + input.qty);
    } else if (input.group) {
      const g = groups[input.group] ?? {};
      let best = null;
      for (const item of Object.keys(g)) if (have(item) >= input.qty && (!best || have(item) > have(best))) best = item;
      if (!best) return null;
      take.push({ item: best, qty: input.qty });
      reserved.set(best, (reserved.get(best) ?? 0) + input.qty);
      mult = Math.max(mult, g[best] ?? 1);
    }
  }
  return { take, mult };
}

// Per-ingredient need of the recipe for `item` (direct or through a group), or 0 when it is not an input.
function needFor(game, recipe, item) {
  const groups = groupsOf(game);
  let n = 0;
  for (const input of recipe.in) {
    if (input.item === item) n += input.qty;
    else if (input.group && groups[input.group]?.[item] != null) n += input.qty;
  }
  return n;
}

function benchInsert(game, e, item, qty) {
  const recipe = game.content.recipes.byId[e.data.recipe];
  if (!recipe || !isOn(game, e)) return 0;
  const need = needFor(game, recipe, item);
  if (!need) return 0;
  const inv = invOf(e, 'in', machineOf(game, e).inSlots ?? 6);
  const room = Math.max(0, need * STOCK_CRAFTS - game.inv.count(inv, item));
  const n = Math.min(qty, room);
  if (n <= 0) return 0;
  const got = n - game.inv.add(inv, item, n);
  if (got > 0) want(game, e);
  return got;
}

function tickBench(game, e, dt) {
  const r = rt(game, e);
  const m = machineOf(game, e);
  const recipe = game.content.recipes.byId[e.data.recipe];
  if (!recipe) { r.noInput = false; return; }
  const inv = invOf(e, 'in', m.inSlots ?? 6);
  const out = invOf(e, 'out', m.outSlots ?? 2);
  const plan = planCraft(game, inv, recipe);
  r.noInput = !plan;
  if (!plan) { if (e.data.prog) { e.data.prog = 0; e.set('p', 0); } return; }
  const qty = (recipe.out.qty ?? 1) * plan.mult;
  if (game.inv.spaceFor(out, recipe.out.item) < qty) { r.blocked = true; return; }
  r.blocked = false;
  want(game, e);
  const spd = machineSpeed(game, e) * (m.speed ?? 1);
  if (spd <= 0) return;
  e.data.prog = (e.data.prog ?? 0) + spd * dt;
  const time = Math.max(0.1, recipe.time ?? 2);
  const pv = Math.min(255, Math.floor((e.data.prog / time) * 16) * 16);
  if (e.pub.p !== pv) e.set('p', pv);
  if (game.now - (r.fxAt ?? -9) > 2) { r.fxAt = game.now; game.fx(e.realm, 'machine_work', e.x, e.y - 0.5); }
  if (e.data.prog < time) return;
  e.data.prog -= time;
  for (const t of plan.take) { game.inv.remove(inv, t.item, t.qty); report(game, t.item, t.qty, false); }
  outAdd(game, e, recipe.out.item, qty);
  r.made = (r.made ?? 0) + qty;
  game.bus.emit('item.crafted', { player: null, item: recipe.out.item, qty, station: e.kind, byMachine: true, machine: e });
  game.fx(e.realm, 'craft_done', e.x, e.y - 0.5, { item: recipe.out.item });
}

export default {
  name: 'autocraft',

  init(game) {
    GAMES.set(game, { eligible: new Map() });
    const ms = M(game);
    ms.benchInsert = (e, item, qty) => benchInsert(game, e, item, qty);
    ms.recipeOk = (e, id) => recipeOk(game, e, id);
    ms.viewExtras.push((e) => {
      if (machineOf(game, e)?.type !== 'autobench') return null;
      const r = game.content.recipes.byId[e.data.recipe];
      return {
        recipes: eligibleRecipes(game, e.kind).filter((id) => unlocked(game, game.content.recipes.byId[id])),
        time: r ? Math.round((r.time / (machineOf(game, e).speed ?? 1)) * 10) / 10 : null, made: rt(game, e).made ?? 0,
      };
    });
  },

  tick(game, dt) {
    if (!running(game)) return;
    for (const e of machinesOfType(game, 'autobench')) if (!e.removed && isOn(game, e)) tickBench(game, e, dt);
  },
};
