// XP curve and related XP formulas (DESIGN 5.2, 9, 10, 17.1; PACING 6.1). Pure functions.
import {
  XP_BASE, XP_EXP, XP_ROUND, LEVEL_CAP, CRAFT_XP_PER_VALUE, MASTERY_XP_BASE, MASTERY_MAX, ARCHIVE_XP_BASE,
  XP_MULT_CAP, KILL_XP_PER_PLAYER, SIDE_QUEST_XP, NIGHT_KILL_XP,
} from './constants.js';

export const round5 = (x) => Math.round(x / XP_ROUND) * XP_ROUND;

// XP needed to go from level L to L + 1 (L = 1..99). Level 100 is the cap: 0.
export function xpToNext(L) {
  if (L < 1 || L >= LEVEL_CAP) return 0;
  return round5(XP_BASE * Math.pow(L, XP_EXP));
}

const CUM = [0, 0];
for (let L = 1; L < LEVEL_CAP; L++) CUM[L + 1] = CUM[L] + xpToNext(L);

// Total XP needed to reach level L from level 1 (totalXp(1) = 0, totalXp(100) = 6,432,785).
export function totalXp(L) {
  if (L <= 1) return 0;
  return CUM[Math.min(L, LEVEL_CAP)];
}

// Level for a cumulative XP amount, plus progress into the level.
export function levelFromXp(xp) {
  let L = 1;
  while (L < LEVEL_CAP && xp >= CUM[L + 1]) L++;
  const into = xp - CUM[L];
  const need = xpToNext(L);
  return { level: L, into, need, frac: need ? into / need : 1 };
}

export const craftXp = (itemValue) => Math.ceil(itemValue * CRAFT_XP_PER_VALUE);

// Mastery: XP for mastery level m is 600 * m^2; masteryTotal(m) = sum over 1..m.
export const masteryXp = (m) => (m < 1 || m > MASTERY_MAX ? 0 : MASTERY_XP_BASE * m * m);
export function masteryTotal(m) { let s = 0; for (let i = 1; i <= Math.min(m, MASTERY_MAX); i++) s += masteryXp(i); return s; }
export function masteryFromXp(xp) { let m = 0; while (m < MASTERY_MAX && xp >= masteryTotal(m + 1)) m++; return m; }

export const archiveXp = (tier) => ARCHIVE_XP_BASE * tier * tier;
export const sideQuestXp = (tier) => SIDE_QUEST_XP * tier * tier;

// xpMult (fraction over 1.0, plus world xpWorld) capped at total x2.5.
export const xpMultiplier = (xpMultFrac = 0) => Math.min(XP_MULT_CAP, 1 + xpMultFrac);

// Final XP gain: baseXp * xpMult * restedMult * nightMult (DESIGN 5.2).
export function xpGain(baseXp, { xpMult = 0, rested = false, night = false, nightXp = 0, kill = false, wake = false } = {}) {
  const nightMult = night ? 1 + (kill ? NIGHT_KILL_XP : 0) + nightXp : 1;
  return baseXp * xpMultiplier(xpMult) * (rested ? 1.25 : 1) * nightMult * (wake ? 2 : 1);
}

// Kill XP per contributor: xp * (1 + 0.6 * (n - 1)) / n.
export const killXpShare = (xp, n) => (n <= 1 ? xp : xp * (1 + KILL_XP_PER_PLAYER * (n - 1)) / n);
