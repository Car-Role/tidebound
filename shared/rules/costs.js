// Costs (DESIGN 4.3, 6.4, 7, 9.1, 9.2, 18; PACING 4.1, 8.1). Pure functions.
import {
  LAND_BASE, LAND_GROWTH, LAND_ROUND, LAND_PLOTS, LAND_DISCOUNT_CAP, BALLAST_PER_PLOT, COOP_SCALE_PER_PLAYER,
  STRUCT_DISCOUNT_CAP, REFUND_FRACTION, TEMPER_GLINT, TEMPER_SUCCESS, TEMPER_MAX, TIDE_HEIGHT, MACHINE_CAP,
  RESPEC_GLINT_PER_LEVEL, REROLL_GLINT_BASE, SHOP_MARKUP, GATE_COST_MULT,
} from './constants.js';

const round5 = (x) => Math.round(x / LAND_ROUND) * LAND_ROUND;

// coopScale = 1 + 0.7 * (S - 1), S = bound players (1..8).
export const coopScale = (S = 1) => 1 + COOP_SCALE_PER_PLAYER * (Math.max(1, S) - 1);

// Base land cost of purchase ordinal n (1..80), solo, no discount: round5(50 * 1.08^n).
export const landBase = (n) => round5(LAND_BASE * Math.pow(LAND_GROWTH, n));

// Full land cost: base * coopScale * (1 - min(0.2, discount)) * (1 + 0.15 * tideHeight), rounded to whole Glint.
export function landCost(n, { coop = 1, discount = 0, tideHeight = 0 } = {}) {
  const d = Math.min(LAND_DISCOUNT_CAP, Math.max(0, discount));
  return Math.round(landBase(n) * coop * (1 - d) * (1 + TIDE_HEIGHT.costs * tideHeight));
}

export function landTotal(plots = LAND_PLOTS) { let s = 0; for (let n = 1; n <= plots; n++) s += landBase(n); return s; }

// Ballast for raising a plot of `biome` as purchase ordinal n; scales by coopScale, never discounted.
export function ballastFor(biome, ordinal, { coop = 1, tideHeight = 0 } = {}) {
  const b = BALLAST_PER_PLOT[biome];
  if (!b) return null;
  const base = b.perOrdinal ? b.perOrdinal * ordinal : b.qty;
  return { item: b.item, qty: Math.ceil(base * coop * (1 + TIDE_HEIGHT.costs * tideHeight) - 1e-9) };
}

// Structure cost: world structures scale by coopScale (and Tide Height) and never take discounts; other structures take
// the additive discount (negative structCost sum, capped at 25%). Each line keeps at least 1 unit.
export function structureCost(cost, { world = false, coop = 1, discount = 0, tideHeight = 0, gate = false } = {}) {
  return cost.map((c) => {
    let q = c.qty;
    if (world) q = Math.ceil(q * coop * (1 + TIDE_HEIGHT.costs * tideHeight) * (gate ? GATE_COST_MULT : 1) - 1e-9);
    else {
      const d = Math.min(STRUCT_DISCOUNT_CAP, Math.max(0, discount));
      q = Math.max(1, Math.round(q * (1 - d)));
    }
    return { ...c, qty: q };
  });
}

// Deconstruct refund from what was actually paid: floor(paid * 0.75), or exactly paid with F4.
export const refund = (paid, full = false) => paid.map((c) => ({ ...c, qty: full ? c.qty : Math.floor(c.qty * REFUND_FRACTION) }));

// Machine cap per plot, multiplied by coopScale (rounded).
export const machineCap = (bonus = 0, coop = 1) => Math.round((MACHINE_CAP + bonus) * coop);

// Tempering to level n (1..10) of an item of `tier`: n*2 bars, n rares, 25 * tier * n^2 Glint; success chance.
export function temperCost(n, tier, { glintDiscount = 0 } = {}) {
  if (n < 1 || n > TEMPER_MAX) return null;
  return { bars: 2 * n, rares: n, glint: Math.round(TEMPER_GLINT * tier * n * n * (1 - glintDiscount)), success: TEMPER_SUCCESS[n - 1] };
}

export const respecCost = (level) => RESPEC_GLINT_PER_LEVEL * level;
// Reroll bought with Glint: 50 * level * 2^(rerolls already bought in this draft).
export const rerollCost = (level, boughtThisDraft = 0) => REROLL_GLINT_BASE * level * Math.pow(2, boughtThisDraft);
export const shopPrice = (value) => SHOP_MARKUP * value;
