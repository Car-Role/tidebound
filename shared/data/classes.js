// Classes (DESIGN 10). Chosen at the Calling Shrine from level 10; switching free, 10 min cooldown.
// Mastery 1-20 per class, XP for level m = 600 * m^2; each level +1% to the primary stat.
// Passive structure discounts apply only to non-world structures placed while the class is active.
const m = (stat, v, op = 'add') => ({ stat, op, v });

export default [
  { id: 'bulwark', name: 'Bulwark', role: 'front-line protector', favoured: 'blade', primary: 'maxHp', color: 'steel',
    passive: { name: 'Seawall', text: '+20% max HP, +20 armor, generates 2x threat', mods: [m('maxHp', 0.2, 'mul'), m('armor', 20), m('threat', 1.0, 'mul')], flags: [] },
    abilities: ['breakwater', 'anchor_slam', 'rally_horn', 'unmoored'] },
  { id: 'squallblade', name: 'Squallblade', role: 'mobile critical striker', favoured: 'blade', primary: 'critMult', color: 'gale',
    passive: { name: 'Slipstream', text: '+10% move speed, +10% crit chance; dodging through an enemy guarantees the next crit', mods: [m('moveSpeed', 0.10), m('critChance', 0.10)], flags: ['dodge_crit'] },
    abilities: ['gale_step', 'crosscurrent', 'riptide_mark', 'tempest'] },
  { id: 'brinesinger', name: 'Brinesinger', role: 'ranged caster and healer', favoured: 'staff', primary: 'abilityPower', color: 'brine',
    passive: { name: 'Deepsong', text: '+30 max Surge, +15% ability damage; ability kills restore 10 Surge', mods: [m('maxSurge', 30), m('abilityPower', 0.15)], flags: ['ability_kill_surge'] },
    abilities: ['brine_bolt', 'undertow', 'tidepool', 'kingwave'] },
  { id: 'gearwright', name: 'Gearwright', role: 'engineer', favoured: 'bow', primary: 'craftSpeed', color: 'brass',
    passive: { name: 'Tinkersense', text: 'machines within 8 tiles +10% speed; structures you place cost 10% less; turrets and summons scale with your power', mods: [m('machineNear', 0.10), m('structCost', -0.10)], flags: ['summons_scale_power'], effects: [{ id: 'machine_near_radius', radius: 8 }] },
    abilities: ['pocket_turret', 'overclock', 'magnet_coil', 'clockwork_legion'] },
  { id: 'prospector', name: 'Prospector', role: 'master gatherer', favoured: 'blade', primary: 'gatherPower', color: 'ochre',
    passive: { name: 'Lodesense', text: '+20% gather power, +10% yields; gem node spawn chance 6% instead of 3% on the plot you stand on', mods: [m('gatherPower', 0.20), m('yieldAll', 0.10)], flags: ['gem_spawn_boost'] },
    abilities: ['seismic_strike', 'vein_sense', 'blast_charge', 'motherlode'] },
  { id: 'greenwarden', name: 'Greenwarden', role: 'grower and summoner', favoured: 'staff', primary: 'yieldAll', color: 'moss',
    passive: { name: 'Rootbond', text: 'crops +20% growth near you (6 tiles); +1 HP/s to allies within 6; summons +30% HP', mods: [], flags: ['crop_aura', 'ally_regen', 'summon_hp'] },
    abilities: ['thornlash', 'quickgrow', 'sproutling', 'verdant_tide'] },
];

export const CLASS_RULES = Object.freeze({
  minLevel: 10, switchCooldown: 600, masteryMax: 20, masteryXp: (m) => 600 * m * m, masteryPrimary: 0.01,
  upgradeAt: { 0: 10, 1: 10, 2: 20, 3: 20 }, upgradeBonus: 0.25, favouredBonus: 0.15,
});
