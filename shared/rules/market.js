// Market saturation (DESIGN 15, PACING 4.2). Pure functions.
// Each unit sold multiplies saturation by 0.99 (floor 0.05); it recovers +0.02 per real minute (x2 with G8) toward 1.0.
// Steady state: one kind of item earns at most 60 * recover / (1 - decay) * value = 120 * value Glint per hour.
import { SAT_DECAY, SAT_FLOOR, SAT_RECOVER_PER_MIN } from './constants.js';

export const recoverRate = (satRecover = 0) => SAT_RECOVER_PER_MIN * (1 + satRecover);

export function recover(sat, minutes, satRecover = 0) {
  return Math.min(1, sat + recoverRate(satRecover) * Math.max(0, minutes));
}

// Price of one unit: value * (1 + sellMult) * saturation * rate (rate: 0.7 Ledger Post, 0.6 Mint, 1 Market Stall).
export const unitPrice = (value, sat, { sellMult = 0, rate = 1 } = {}) => value * (1 + Math.min(0.5, sellMult)) * sat * rate;

// Sell qty units one at a time. Returns { glint (float), sat (after) }. Callers round the Glint they pay.
export function sell(value, qty, sat, opts = {}) {
  let glint = 0, s = sat;
  for (let i = 0; i < qty; i++) {
    glint += unitPrice(value, s, opts);
    s = Math.max(SAT_FLOOR, s * SAT_DECAY);
  }
  return { glint, sat: s };
}

// Theoretical per-good income cap per hour.
export const incomeCapPerHour = (value, { satRecover = 0, rate = 1 } = {}) => 60 * recoverRate(satRecover) / (1 - SAT_DECAY) * value * rate;

// Simulate selling `perMin` units every minute for `hours` (after a warm-up); returns Glint per hour in the last hour.
export function simulateSteady(value, perMin, hours = 6, opts = {}) {
  let sat = 1, lastHour = 0;
  const minutes = hours * 60;
  for (let m = 0; m < minutes; m++) {
    const r = sell(value, perMin, sat, opts);
    sat = recover(r.sat, 1, opts.satRecover || 0);
    if (m >= minutes - 60) lastHour += r.glint;
  }
  return lastHour;
}
