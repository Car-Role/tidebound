// Loot rolls (DESIGN 4.5, 5.1, 5.2, 11). Pure: every random draw comes from the `rand` function argument ([0,1)).
import { YIELD_CAP, LUCK_RARE_PER_POINT, ELITE_MULT, MOB_GLINT_PER_TIER } from './constants.js';

// Yield multiplier: 1 + min(2.0, yieldAll + class-specific yield), so the total is at most x3.0.
export const yieldMult = (yieldAll = 0, yieldClass = 0) => 1 + Math.min(YIELD_CAP - 1, Math.max(-1, yieldAll + yieldClass));

// Drop quantity: floor(base * yieldMult + rand()) (the fractional part is a chance).
export const dropQty = (base, mult, rand) => Math.floor(base * mult + rand());

// Luck: each point +0.5% rare-drop chance multiplier.
export const luckChance = (p, luck = 0) => Math.min(1, p * (1 + LUCK_RARE_PER_POINT * Math.max(0, luck)));

// Roll a drop table [{item, min, max, p?}]. Chances below 1 count as "rare" and get the luck multiplier;
// luckTwice (m07) rolls each chance twice. elite multiplies quantities x5.
export function rollTable(table, { rand, mult = 1, luck = 0, elite = false, luckTwice = false } = {}) {
  const out = [];
  for (const e of table) {
    const p = e.p == null ? 1 : e.p;
    if (p < 1) {
      const pc = luckChance(p, luck);
      const hit = rand() < pc || (luckTwice && rand() < pc);
      if (!hit) continue;
    }
    const min = e.min == null ? (e.qty || 1) : e.min, max = e.max == null ? min : e.max;
    const base = min + Math.floor(rand() * (max - min + 1));
    const qty = dropQty(base * (elite ? ELITE_MULT.loot : 1), mult, rand);
    if (qty > 0) out.push({ item: e.item, qty });
  }
  return out;
}

// Enemy Glint: tier * rand(0..2), elites x5, plus glintMob / glintMult fractions.
export function mobGlint(tier, rand, { elite = false, glintMob = 0, glintMult = 0 } = {}) {
  const base = tier * (MOB_GLINT_PER_TIER[0] + (MOB_GLINT_PER_TIER[1] - MOB_GLINT_PER_TIER[0]) * rand());
  return Math.round(base * (elite ? ELITE_MULT.glint : 1) * (1 + glintMob + Math.min(1, glintMult)));
}

// Tide cache Glint: 5-15 x tier.
export const cacheGlint = (tier, rand) => tier * (5 + Math.floor(rand() * 11));

// Weighted pick from [{..., weight}] using rand.
export function weighted(list, rand, w = (x) => x.weight) {
  let total = 0;
  for (const x of list) total += Math.max(0, w(x));
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const x of list) { r -= Math.max(0, w(x)); if (r < 0) return x; }
  return list[list.length - 1];
}

// Burrow unit roll: rare of highest tier with BURROW_RARE share, else a weighted node drop.
export const burrowRate = (rate, count, need) => rate * Math.min(1, count / need);
