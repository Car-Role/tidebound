// Combat formulas (DESIGN 5.2, 6.4, 11, 12). Pure functions; randomness is passed in.
import { ARMOR_K, ELEM_WEAK, ELEM_RESIST, HOLLOW_ARMOR_IGNORE, DMG_ROLL, TOO_TOUGH_DAMAGE, CRIT_CHANCE_CAP, ENRAGE, ELITE_MULT, HARD_MODE } from './constants.js';

export const ELEMENTS = Object.freeze(['none', 'ember', 'frost', 'storm', 'tide', 'hollow']);
// What each element does on hit (DESIGN 5.2).
export const ELEMENT_EFFECT = Object.freeze({ none: null, ember: 'burn', frost: 'chill', storm: 'chain', tide: 'knockback', hollow: 'armor_ignore' });

export const armorReduction = (armor) => (armor <= 0 ? 0 : armor / (armor + ARMOR_K));
export const armorFactor = (armor) => ARMOR_K / (ARMOR_K + Math.max(0, armor));

// Element multiplier vs a target with weak/resist elements.
export function elemMult(element, target) {
  if (!element || element === 'none' || !target) return 1;
  if (target.weak === element) return ELEM_WEAK;
  if (target.resist === element) return ELEM_RESIST;
  return 1;
}

// Weapon hit: weaponBase * (1 + power) * abilityMult * (crit ? critMult : 1) * 100/(100 + armor) * elemMult * roll(0.9..1.1).
// roll01 in [0,1) maps to the 0.9..1.1 band. hollow ignores 30% of armor. bonus: extra additive damage fraction (bossDmg etc.).
export function weaponHit({ base, power = 0, abilityMult = 1, crit = false, critMult = 1.5, armor = 0, element = 'none', target = null, roll01 = 0.5, bonus = 0 }) {
  const effArmor = element === 'hollow' ? armor * (1 - HOLLOW_ARMOR_IGNORE) : armor;
  const roll = DMG_ROLL[0] + (DMG_ROLL[1] - DMG_ROLL[0]) * roll01;
  return base * (1 + power + bonus) * abilityMult * (crit ? critMult : 1) * armorFactor(effArmor) * elemMult(element, target) * roll;
}

// Gather hit: hookPower * (1 + gatherPower); hook tier below node tier => x0.1 and no drops.
export function gatherHit({ hookPower, gatherPower = 0, hookTier, nodeTier }) {
  const tooTough = hookTier < nodeTier;
  return { dmg: hookPower * (1 + gatherPower) * (tooTough ? TOO_TOUGH_DAMAGE : 1), drops: !tooTough };
}

// Damage taken by a player: enemyDmg * 100/(100 + armor) * (1 - elemResist) * (1 + dmgTaken).
export const damageTaken = (enemyDmg, { armor = 0, elemResist = 0, dmgTaken = 0, elemental = false } = {}) =>
  enemyDmg * armorFactor(armor) * (elemental ? 1 - Math.min(0.75, elemResist) : 1) * Math.max(0.4, 1 + dmgTaken);

export const rollCrit = (critChance, r01) => r01 < Math.min(CRIT_CHANCE_CAP, critChance);

// Favoured weapon type: +15% (DESIGN 6.4).
export const favouredMult = (classFavoured, wtype) => (classFavoured && classFavoured === wtype ? 1.15 : 1);

// Boss modifiers: enrage +50% damage +30% speed; hard mode +100% HP +25% damage.
export function bossMods({ enraged = false, hard = false } = {}) {
  return { hp: hard ? 1 + HARD_MODE.hp : 1, dmg: (enraged ? 1 + ENRAGE.dmg : 1) * (hard ? 1 + HARD_MODE.dmg : 1), speed: enraged ? 1 + ENRAGE.speed : 1 };
}
export const enrageTime = (k) => (k <= 3 ? ENRAGE.wardenEarly : ENRAGE.wardenLate);
export const eliteStats = (e) => ({ ...e, hp: e.hp * ELITE_MULT.hp, dmg: e.dmg * ELITE_MULT.dmg, xp: e.xp * ELITE_MULT.xp });

// Armor tempering: each level +6% of the item's base stats.
export const temperedStat = (base, level) => base * (1 + 0.06 * level);
