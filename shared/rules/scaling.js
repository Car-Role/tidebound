// Enemy, boss and world scaling (DESIGN 11, 13.3, 18.2, 22; PACING 8.1). Pure functions.
import { ENEMY_HP_PER_PLAYER, BOSS_HP_PER_PLAYER, NODE_RESPAWN_PER_PLAYER, TIDE_HEIGHT, TRENCH_SCALE, NODE_RESPAWN_S } from './constants.js';
import { coopScale } from './costs.js';

export { coopScale };

// Enemy HP x (1 + 0.6 * (n - 1)), n = players within PARTY_RANGE at spawn.
export const enemyHpScale = (n = 1) => 1 + ENEMY_HP_PER_PLAYER * (Math.max(1, n) - 1);
// Boss and Keeper HP x (1 + 0.8 * (n - 1)).
export const bossHpScale = (n = 1) => 1 + BOSS_HP_PER_PLAYER * (Math.max(1, n) - 1);
// Node respawn interval divided by (1 + 0.6 * (S - 1)).
export const nodeRespawnInterval = (S = 1, bonus = 0) => NODE_RESPAWN_S / ((1 + NODE_RESPAWN_PER_PLAYER * (Math.max(1, S) - 1)) * (1 + Math.min(0.5, bonus)));

// Tide Height (Rebirth, max 10): enemies +40% HP and +25% damage per Height; land and world-structure costs +15%.
export function tideHeightMods(h = 0) {
  const H = Math.max(0, Math.min(TIDE_HEIGHT.max, h));
  return { hp: 1 + TIDE_HEIGHT.enemyHp * H, dmg: 1 + TIDE_HEIGHT.enemyDmg * H, cost: 1 + TIDE_HEIGHT.costs * H, secondAffix: H >= 3, newRaids: H >= 5 };
}

// Trench: enemy stats scale 1.12^floor from tier-3 baselines; floor rare tier = min(partyTier, 3 + floor(floor / 8)).
export const trenchScale = (floor) => Math.pow(TRENCH_SCALE, floor);
export const trenchRareTier = (partyTier, floor) => Math.min(partyTier, 3 + Math.floor(floor / 8));

// Full enemy stat scaling.
export function scaleEnemy(base, { n = 1, boss = false, tideHeight = 0, trenchFloor = 0 } = {}) {
  const th = tideHeightMods(tideHeight);
  const t = trenchFloor > 0 ? trenchScale(trenchFloor) : 1;
  return { hp: base.hp * (boss ? bossHpScale(n) : enemyHpScale(n)) * th.hp * t, dmg: base.dmg * th.dmg * t };
}

// Machine speed = min(3.0, 1 + sum of bonuses) * fluxRatio * tendFactor.
export const machineSpeed = (bonusSum = 0, fluxRatio = 1, tended = true, untended = 0.1) => Math.min(3, 1 + bonusSum) * Math.min(1, fluxRatio) * (tended ? 1 : untended);
export const fluxRatio = (supply, demand) => (demand <= 0 ? 1 : Math.min(1, supply / demand));
