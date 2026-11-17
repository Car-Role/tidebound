// Skill tree "the Chart" (DESIGN 9.2): 5 branches x 12 nodes, cost = row (1/2/3), 120 points.
// Row 2 needs 3 row-1 nodes of the branch and level 20; row 3 needs 3 row-2 nodes and level 50.
// Structure unlocks live on the structures (`unlock: ['skill:F5', ...]`); `unlocks` here lists those structure ids for the UI
// and is checked for consistency in test/data.test.js. worldMods go to the world sheet as soon as any bound player owns the node.
const m = (stat, v, op = 'add') => ({ stat, op, v });
const BR = { H: 'harvest', F: 'forge', C: 'fray', T: 'tide', G: 'fortune' };
const K = [];
const sk = (id, name, text, extra = {}) => {
  const n = Number(id.slice(1));
  const row = Math.ceil(n / 4);
  K.push({ id, branch: BR[id[0]], row, col: (n - 1) % 4, cost: row, name, text, mods: [], unlocks: [], proc: null, ...extra });
};

sk('H1', 'Strong Back', '+10% gather power', { mods: [m('gatherPower', 0.10)] });
sk('H2', 'Wide Swing', 'Tidehook hits every node in a 1.2-tile arc', { proc: { on: 'swing', id: 'wide_swing', p: { arc: 1.2 } } });
sk('H3', 'Forester', '+15% wood yield; unlocks Sap Tap', { mods: [m('yieldWood', 0.15)], unlocks: ['sap_tap'] });
sk('H4', 'Rockhound', '+15% stone and ore yield; ore nodes on minimap', { mods: [m('yieldStone', 0.15), m('yieldOre', 0.15)], flags: ['ore_minimap'] });
sk('H5', 'Tidewalker', 'tidal nodes +50% yield; no slow in shallows', { mods: [m('yieldTidal', 0.50)], flags: ['no_shallows_slow'] });
sk('H6', 'Regrowth', 'nodes respawn 20% faster on all plots', { worldMods: [m('nodeRespawn', 0.20)] });
sk('H7', 'Almanac', 'crops +15% yield; unlocks Sprinkler, Scarecrow', { mods: [m('yieldCrop', 0.15)], unlocks: ['sprinkler', 'scarecrow'] });
sk('H8', 'Master Angler', 'rare fish +25%; Creels hold 10 fish and fill 50% faster', { effects: [{ id: 'rare_fish', v: 0.25 }, { id: 'creel_bonus', cap: 10, speed: 0.5 }] });
sk('H9', 'Geode Splitter', "ore nodes 5% chance to drop the tier's rare", { proc: { on: 'nodeBreak', id: 'node_bonus_drop', p: { cls: 'ore', item: 'rare_of_tier', chance: 0.05 } } });
sk('H10', 'Twin Harvest', '12% chance of double drops', { proc: { on: 'nodeBreak', id: 'double_drop', p: { chance: 0.12 } } });
sk('H11', 'Evergreen', 'crops never wither; unlocks Tiller Bot', { flags: ['no_wither'], unlocks: ['tiller_bot'] });
sk('H12', 'Worldroot', '+25% gather power; 10% of nodes you break respawn instantly', { mods: [m('gatherPower', 0.25)], proc: { on: 'nodeBreak', id: 'node_regrow', p: { chance: 0.10 } } });

sk('F1', 'Tinkerer', '+15% hand craft speed', { mods: [m('craftSpeed', 0.15)] });
sk('F2', 'Kiln Master', 'kilns +20% speed and hold 2 recipes queued', { mods: [m('kilnSpeed', 0.20)], effects: [{ id: 'kiln_queue', n: 2 }] });
sk('F3', 'Packrat', 'Stockpiles +8 slots; unlocks Brinelocker; at level 26 unlocks Hopper and Spillway', { effects: [{ id: 'stockpile_slots', n: 8 }], unlocks: ['brine_locker', 'hopper', 'spillway'] });
sk('F4', 'Builder', 'structures cost 8% less; deconstruct refunds 100%', { mods: [m('structCost', -0.08)], flags: ['refund_full'] });
sk('F5', 'Scuttler Keeper', 'unlocks Scuttler Burrows (I at once, II with Beacon 2, III with Beacon 4)', { unlocks: ['burrow_1', 'burrow_2', 'burrow_3'] });
sk('F6', 'Sluicewright', 'unlocks Sluice, Grabber Arm, Filter Arm, Splitter (with Beacon 2)', { unlocks: ['sluice_1', 'sluice_2', 'grabber', 'filter_grabber', 'splitter'] });
sk('F7', 'Fluxworks', 'unlocks Flux generators (Tide Wheel and Ember Boiler with Beacon 2, Prism Array with 3, Rime Turbine with 4)', { unlocks: ['tide_wheel', 'ember_boiler', 'prism_array', 'rime_turbine'] });
sk('F8', 'Autobench', 'unlocks Autobench I with Beacon 2 and Autobench II with Beacon 3', { unlocks: ['autobench_1', 'autobench_2'] });
sk('F9', 'Logistics', 'unlocks Gull Roost and Sluice III', { unlocks: ['gull_roost', 'sluice_3'] });
sk('F10', 'Overdrive', 'machines +20% speed; +2 machine cap per plot', { worldMods: [m('machineSpeed', 0.20), m('machineCap', 2)] });
sk('F11', 'Deep Drilling', 'unlocks Lodestone Drill', { unlocks: ['drill'] });
sk('F12', 'Grand Foundry', 'unlocks Autobench III, Umbral Reactor, Echo Chamber', { unlocks: ['autobench_3', 'umbral_reactor', 'echo_chamber'] });

sk('C1', 'Brawler', '+10% weapon damage', { mods: [m('power', 0.10)] });
sk('C2', 'Toughness', '+15% max HP', { mods: [m('maxHp', 0.15, 'mul')] });
sk('C3', 'Footwork', '+1 dodge charge', { mods: [m('dodgeCharges', 1)] });
sk('C4', 'Field Medic', 'food heals +30%; revive allies 50% faster', { mods: [m('foodHeal', 0.30), m('reviveSpeed', 0.50)] });
sk('C5', 'Critical Eye', '+8% crit chance', { mods: [m('critChance', 0.08)] });
sk('C6', 'Ironclad', '+25 armor; no knockback while attacking', { mods: [m('armor', 25)], flags: ['no_knockback_attacking'] });
sk('C7', 'Trophy Hunter', 'elites +50% loot; unlocks Bolt Turret and Spike Trap', { effects: [{ id: 'elite_loot', v: 0.5 }], unlocks: ['bolt_turret', 'spike_trap'] });
sk('C8', 'Adrenaline', 'kills grant +20% swing speed for 4 s', { proc: { on: 'kill', id: 'stack_buff', p: { stat: 'swingSpeed', per: 0.20, max: 1, decay: 4 } } });
sk('C9', 'Giant Slayer', '+20% damage vs bosses', { mods: [m('bossDmg', 0.20)] });
sk('C10', 'Last Stand', 'a lethal hit leaves you at 1 HP, once per 3 min', { proc: { on: 'death', id: 'cheat_death', p: { cd: 180 } } });
sk('C11', 'Arsenal', 'second weapon slot (swap with mouse wheel); unlocks Arc Spire', { flags: ['second_weapon'], unlocks: ['arc_spire'] });
sk('C12', 'Warlord', '+15% damage; allies within 10 tiles +5% damage', { mods: [m('power', 0.15)], effects: [{ id: 'ally_aura', radius: 10, stat: 'power', v: 0.05 }] });

sk('T1', 'Attuned', '+20 max Surge', { mods: [m('maxSurge', 20)] });
sk('T2', 'Swift Current', '+8% move speed', { mods: [m('moveSpeed', 0.08)] });
sk('T3', 'Cartographer', 'map shows the feature of unraised plots adjacent to owned ones; unlocks Waystone', { flags: ['map_reveal'], unlocks: ['waystone'] });
sk('T4', 'Tidereader', 'tide and weather timers on HUD; low tide +20% duration', { mods: [m('tidalDuration', 0.20)], flags: ['hud_timers'] });
sk('T5', 'Channeling', '-12% ability cooldowns', { mods: [m('cdr', 0.12)] });
sk('T6', 'Deepcall', '+15% ability damage', { mods: [m('abilityPower', 0.15)] });
sk('T7', 'Stormwise', 'weather bonuses +50%; weather penalties -50%', { mods: [m('weatherBonus', 0.50)] });
sk('T8', 'Moonlit', '+15% XP at night; light radius +3', { mods: [m('nightXp', 0.15), m('lightRadius', 3)] });
sk('T9', 'Second Calling', 'equip the first two abilities of a second class (keys Z, X)', { flags: ['second_calling'] });
sk('T10', 'Riptide', 'abilities can crit', { proc: { on: 'abilityHit', id: 'ability_crit', p: {} } });
sk('T11', 'Wayfarer', 'teleport to any Waystone from anywhere (5 min cooldown)', { flags: ['wayfarer'], effects: [{ id: 'wayfarer_cd', cd: 300 }] });
sk('T12', 'Tidelord', 'Surge regen +100%; first ability after 10 s out of combat deals double', { mods: [m('surgeRegen', 5)], proc: { on: 'cast', id: 'opener', p: { idle: 10, mult: 2 } } });

sk('G1', 'Barter', '+10% sell prices', { mods: [m('sellMult', 0.10)] });
sk('G2', 'Lucky', '+8 luck', { mods: [m('luck', 8)] });
sk('G3', 'Quick Study', '+10% XP', { mods: [m('xpMult', 0.10)] });
sk('G4', 'Scavenger', 'mobs drop +20% Glint', { mods: [m('glintMob', 0.20)] });
sk('G5', 'Surveyor', 'land costs -5%', { mods: [m('landDiscount', 0.05)] });
sk('G6', 'Collector', 'dig spots x2; Archive donations give double XP', { effects: [{ id: 'dig_spots', mult: 2 }, { id: 'archive_xp', mult: 2 }] });
sk('G7', 'Card Shark', '+1 tide_token per 5 levels (retroactive); +1 banish per 10 levels', { effects: [{ id: 'token_per_levels', every: 5, n: 1 }, { id: 'banish_per_levels', every: 10, n: 1 }] });
sk('G8', 'Merchant Prince', 'market saturation recovers twice as fast (+0.04 per minute); castaway shops restock x2', { worldMods: [m('satRecover', 1.0)], effects: [{ id: 'shop_restock', mult: 2 }] });
sk('G9', 'Ledgerkeeper', 'unlocks Ledger Post and Mint', { unlocks: ['ledger_post', 'mint'] });
sk('G10', 'High Roller', 'drafts offer 4 cards', { mods: [m('draftOffers', 1)] });
sk('G11', 'Jackpot', '2% chance any drop is multiplied x10', { proc: { on: 'drop', id: 'jackpot', p: { chance: 0.02, mult: 10 } } });
sk('G12', 'Tycoon', 'land costs a further -10%; +15% Glint', { mods: [m('landDiscount', 0.10), m('glintMult', 0.15)] });

// Skill-point sources (9.2): 99 levels + 6 Wardens + 6 Vault first clears + 8 Archive wings + 1 final boss = 120
export const SKILL_POINT_SOURCES = Object.freeze({ levels: 99, wardens: 6, vaults: 6, wings: 8, finalBoss: 1 });
export const SKILL_ROW_RULES = Object.freeze({ 2: { prevRow: 3, level: 20 }, 3: { prevRow: 3, level: 50 } });
export const RESPEC_GLINT_PER_LEVEL = 100;

export default K;
