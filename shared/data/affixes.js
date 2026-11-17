// Elite affixes (DESIGN A.3). params are read by WP5 mobs.js.
export default [
  { id: 'swift', name: 'Swift', text: '+60% move speed, +30% attack rate', params: { moveSpeed: 0.6, attackRate: 0.3 } },
  { id: 'plated', name: 'Plated', text: '+100 armor, immune to knockback', params: { armor: 100, noKnockback: true } },
  { id: 'volatile', name: 'Volatile', text: '1 s after death explodes for 150% of its damage, radius 2.5 (telegraphed)', params: { delay: 1, dmg: 1.5, radius: 2.5 } },
  { id: 'leeching', name: 'Leeching', text: 'heals 20% of damage it deals; each hit drains 10 Surge', params: { lifesteal: 0.2, surgeDrain: 10 } },
  { id: 'splitting', name: 'Splitting', text: 'on death splits into 2 non-elite copies with 40% HP (no loot from copies)', params: { count: 2, hp: 0.4, noLoot: true } },
  { id: 'shrouded', name: 'Shrouded', text: 'invisible beyond 4 tiles; its first hit from stealth deals +50%', params: { revealDist: 4, stealthBonus: 0.5 } },
];
// Tide Height 3+: elites gain a second affix (DESIGN 18.2)
export const SECOND_AFFIX_HEIGHT = 3;
