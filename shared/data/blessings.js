// Blessings (DESIGN A.2): run-only dungeon upgrades, 20. A blessing room offers 3 not already held; all lost on exit.
const m = (stat, v) => ({ stat, op: 'add', v });

export default [
  { id: 'bl_swift', name: 'Racing Tide', text: '+40% swing speed', mods: [m('swingSpeed', 0.4)], proc: null },
  { id: 'bl_chain', name: 'Forked Current', text: 'attacks chain to 1 extra enemy for 50%', mods: [], proc: { on: 'hit', id: 'ricochet', p: { chance: 1, dmg: 0.5 } } },
  { id: 'bl_revive', name: 'Second Breath', text: 'revive once at 50% HP', mods: [], proc: { on: 'death', id: 'revive', p: { hp: 0.5, cd: 0 } }, once: true },
  { id: 'bl_orbs', name: 'Kind Water', text: 'enemies have a 15% chance to drop an orb that heals 8% max HP', mods: [], proc: { on: 'kill', id: 'heal_orb', p: { chance: 0.15, pct: 0.08 } } },
  { id: 'bl_crit', name: 'Keen Tide', text: '+20% crit chance', mods: [m('critChance', 0.2)], proc: null },
  { id: 'bl_power', name: 'Heavy Water', text: '+30% damage', mods: [m('power', 0.3), m('abilityPower', 0.3)], proc: null },
  { id: 'bl_armor', name: 'Shellback', text: '+60 armor', mods: [m('armor', 60)], proc: null },
  { id: 'bl_surge', name: 'Deep Well', text: 'Surge regen +100%', mods: [m('surgeRegen', 5)], proc: null },
  { id: 'bl_cdr', name: 'Quick Eddy', text: '-25% ability cooldowns', mods: [m('cdr', 0.25)], proc: null },
  { id: 'bl_burn', name: 'Hot Spring', text: 'hits burn for 50% over 3 s', mods: [], proc: { on: 'hit', id: 'burn', p: { chance: 1, dmg: 0.5, dur: 3 } } },
  { id: 'bl_chill', name: 'Cold Seep', text: 'hits Chill 10%; 5 stacks freeze 1.5 s', mods: [], proc: [{ on: 'hit', id: 'chill', p: { slow: 0.1, dur: 2, max: 5 } }, { on: 'hit', id: 'chill_freeze', p: { stacks: 5, dur: 1.5, icd: 0 } }] },
  { id: 'bl_spark', name: 'Storm Glass', text: '20% on hit: lightning for 120%', mods: [], proc: { on: 'hit', id: 'spark', p: { chance: 0.2, dmg: 1.2, range: 3 } } },
  { id: 'bl_dodge', name: 'Slipwater', text: '+2 dodge charges', mods: [m('dodgeCharges', 2)], proc: null },
  { id: 'bl_thorns', name: 'Urchin', text: 'reflect 40% of melee damage taken', mods: [m('thorns', 0.4)], proc: null },
  { id: 'bl_leech', name: 'Red Tide', text: '5% lifesteal', mods: [m('lifesteal', 0.05)], proc: null },
  { id: 'bl_gold', name: 'Glint Wake', text: '+100% Glint found in this run', mods: [m('glintMult', 1.0)], proc: null },
  { id: 'bl_loot', name: 'Full Nets', text: '+1 loot roll from the Keeper', mods: [], proc: null, effects: [{ id: 'keeper_loot_rolls', n: 1 }] },
  { id: 'bl_glass', name: 'Glass Tide', text: '+60% damage dealt, +30% damage taken', mods: [m('power', 0.6), m('abilityPower', 0.6), m('dmgTaken', 0.3)], proc: null },
  { id: 'bl_pup', name: 'Tide Pup', text: 'a companion crab fights beside you (60% damage, 2 hits/s)', mods: [], proc: { on: 'tick', id: 'companion', p: { kind: 'tide_pup' } } },
  { id: 'bl_nova', name: 'Breaking Wave', text: 'every 10 s release a wave: 200%, radius 3', mods: [], proc: { on: 'tick', id: 'periodic_wave', p: { interval: 10, dmg: 2, radius: 3 } } },
];
