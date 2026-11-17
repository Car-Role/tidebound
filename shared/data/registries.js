// Closed vocabularies (TECH_SPEC 7.1). schema.js rejects any value not listed here.
// Plain ES module: no Node-only imports. Everything is frozen.

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
};

// ---------------------------------------------------------------- stats
// base: value at level 1; perLevel: added per level above 1; cap: clamp after aggregation.
// capMode 'max' = upper bound, 'min' = lower bound (for negative-is-better stats like cooldown fractions).
// Aggregation: final = (base + levelGain + sum(add)) * product(1 + mul), then the cap.
export const STATS = deepFreeze({
  maxHp: { base: 100, perLevel: 8 },
  hpRegen: { base: 0.5 },
  maxSurge: { base: 100 },
  surgeRegen: { base: 5 },
  surgeCost: { base: 0, cap: -0.5, capMode: 'min' },
  cdr: { base: 0, cap: 0.5 },
  power: { base: 0, perLevel: 0.01 },
  abilityPower: { base: 0 },
  summonPower: { base: 0 },
  summonDuration: { base: 0 },
  gatherPower: { base: 0, perLevel: 0.01 },
  swingSpeed: { base: 0, cap: 1.5 },
  critChance: { base: 0.05, cap: 0.75 },
  critMult: { base: 1.5 },
  armor: { base: 0 },
  dmgTaken: { base: 0, cap: -0.6, capMode: 'min' },
  elemResist: { base: 0, cap: 0.75 },
  lifesteal: { base: 0, cap: 0.15 },
  thorns: { base: 0, cap: 1.0 },
  bossDmg: { base: 0 },
  eliteDmg: { base: 0 },
  burnDmg: { base: 0 },
  slowPotency: { base: 0 },
  moveSpeed: { base: 0, cap: 0.8 },
  dodgeCharges: { base: 2, cap: 5 },
  dodgeRecharge: { base: 0, cap: -0.6, capMode: 'min' },
  luck: { base: 0, cap: 100 },
  xpMult: { base: 0, cap: 1.5 },
  nightXp: { base: 0 },
  yieldAll: { base: 0, yieldCap: true },
  yieldWood: { base: 0, yieldCap: true },
  yieldStone: { base: 0, yieldCap: true },
  yieldOre: { base: 0, yieldCap: true },
  yieldPlant: { base: 0, yieldCap: true },
  yieldTidal: { base: 0, yieldCap: true },
  yieldMob: { base: 0, yieldCap: true },
  yieldCrop: { base: 0, yieldCap: true },
  glintMult: { base: 0, cap: 1.0 },
  glintMob: { base: 0 },
  sellMult: { base: 0, cap: 0.5 },
  craftSpeed: { base: 0, cap: 2.0 },
  kilnSpeed: { base: 0, cap: 2.0 },
  structCost: { base: 0, cap: -0.25, capMode: 'min' },
  landDiscount: { base: 0, cap: 0.2, summedOverPlayers: true },
  pickupRadius: { base: 2.0, cap: 8 },
  invSlots: { base: 24, cap: 80 },
  fishBite: { base: 0, cap: -0.6, capMode: 'min' },
  cropGrowth: { base: 0, cap: 2.0 },
  buffDuration: { base: 0, cap: 1.0 },
  foodHeal: { base: 0, cap: 1.0 },
  reviveSpeed: { base: 0, cap: 1.0 },
  lightRadius: { base: 5, cap: 14 },
  tidalDuration: { base: 0, cap: 0.5 },
  draftOffers: { base: 3, cap: 5 },
  draftRarePlus: { base: 0, cap: 0.2 },
  machineNear: { base: 0 },
  threat: { base: 1 },
  // added per CRITIQUE R4 item 1
  cacheChance: { base: 0 },     // fraction added to the tide_cache share of tidal spawns (u14)
  chestLoot: { base: 0 },       // fraction extra chest loot (u22)
  weatherBonus: { base: 0 },    // T7: weather bonuses +x, penalties -x
});
export const STAT_IDS = Object.freeze(Object.keys(STATS));
// "sum of yieldAll + the class-specific one <= 2.0 (total x3.0)"
export const YIELD_BONUS_CAP = 2.0;

// World sheet (game.stats.world()).
export const WORLD_STATS = deepFreeze({
  machineSpeed: { base: 0, cap: 2.0 },
  scuttlerRate: { base: 0 },          // inside the machine speed cap
  machineCap: { base: 0, cap: 6 },
  fluxUse: { base: 0, cap: -0.3, capMode: 'min' },
  nodeRespawn: { base: 0, cap: 0.5 },
  kilnSpeedWorld: { base: 0, cap: 1.0 },
  cropGrowthWorld: { base: 0, cap: 1.0 },
  fishBiteWorld: { base: 0, cap: -0.3, capMode: 'min' },
  yieldWoodWorld: { base: 0, cap: 0.1 },
  yieldStoneWorld: { base: 0, cap: 0.1 },
  luckWorld: { base: 0 },
  dmgWorld: { base: 0 },
  xpWorld: { base: 0, cap: 0.3 },
  landDiscountWorld: { base: 0, cap: 0.2 },  // joins the player land-discount cap of 0.2
  satRecover: { base: 0, cap: 1.0 },          // +1.0 = x2 recovery
  lampRadius: { base: 0 },
});
export const WORLD_STAT_IDS = Object.freeze(Object.keys(WORLD_STATS));

export const MOD_OPS = Object.freeze(['add', 'mul']);
// Tables in which op:'mul' is allowed (DESIGN 5.1 stacking rule) plus the two documented exceptions
// (skill C2 and trinket thawless_plate, both "+15% max HP"; see INTEGRATION_NOTES WP2).
export const MUL_ALLOWED = Object.freeze(['classes', 'cardSets', 'rebirth']);
export const MUL_EXCEPTIONS = Object.freeze(['skill:C2', 'item:thawless_plate']);

// Conditions registry (CRITIQUE R4 item 1): a Mod may carry optional `when: <condition id>`.
// The statbook re-evaluates `when` mods on clock.phase, weather.change, tide.change and at 1 Hz.
export const CONDITIONS = deepFreeze({
  night: 'clock phase is night',
  day: 'clock phase is dawn, day or dusk',
  rain: 'weather is rain or storm',
  shallows: 'player stands on shallow water or a tidal flat',
  shallows_or_rain: 'shallows or rain',
  low_tide: 'tide is low',
  low_hp: 'player HP under 40%',
  in_dungeon: 'player is inside a Vault or the Trench',
});
export const CONDITION_IDS = Object.freeze(Object.keys(CONDITIONS));

// ---------------------------------------------------------------- procs
export const PROC_TRIGGERS = Object.freeze([
  'hit', 'crit', 'kill', 'hurt', 'dodge', 'cast', 'abilityHit', 'swing', 'nodeHit', 'nodeBreak',
  'harvest', 'fishCatch', 'craft', 'smelt', 'machineCraft', 'tick', 'death', 'drop',
]);

// id -> allowed param keys; a trailing '?' marks an optional key.
export const PROCS = deepFreeze({
  chill: ['slow', 'dur', 'max'],
  spark: ['chance', 'dmg', 'range'],
  burn: ['chance', 'dmg', 'dur'],
  splinter: ['chance', 'mult', 'cls'],
  chain_break: ['chance', 'radius', 'mult', 'cls'],
  double_catch: ['chance'],
  ricochet: ['chance', 'dmg'],
  dmg_vs_status: ['status', 'bonus', 'critOnly?'],
  burn_spread: ['chance', 'radius'],
  stack_buff: ['stat', 'per', 'max', 'decay'],
  seed_return: ['chance'],
  windfall: ['chance'],
  dodge_shield: ['pct', 'dur'],
  dmg_vs_hp: ['below?', 'above?', 'bonus'],
  bonus_output: ['chance'],
  refund: ['chance'],
  freeze_attacker: ['chance', 'dur'],
  surge_on_kill: ['amount'],
  nth_hit_wave: ['n', 'dmg', 'len'],
  death_explode: ['status', 'dmg', 'radius'],
  chill_freeze: ['stacks', 'dur', 'icd'],
  crit_lightning: ['dmg', 'icd'],
  node_bonus_drop: ['cls', 'item', 'chance'],
  low_hp_buff: ['below', 'mods'],
  double_swing: ['chance'],
  harvest_streak: ['n', 'window', 'mods', 'dur'],
  machine_free: ['chance'],
  dmg_per_debuff: ['bonus'],
  burn_attacker: ['dmg', 'dur'],
  dodge_trail: ['dmg', 'dur'],
  fish_bonus: ['item', 'chance'],
  ability_pull: ['dist'],
  revive: ['hp', 'cd'],
  freeze_extend: ['dur', 'bossSlow'],
  chain_extra: ['n', 'mult'],
  sapling: ['radius', 'growth', 'regen'],
  kill_stack_perm: ['per', 'cap'],
  nth_swing_shockwave: ['n', 'dmg', 'radius'],
  auto_swing: ['interval', 'range'],
  inv_smelt: ['interval'],
  shallows_walk: ['highTideNodes'],
  double_cast: ['interval'],
  burn_stack: ['max', 'mult'],
  aura_slow: ['radius', 'slow', 'novaOnFrozenKill'],
  periodic_lightning: ['interval', 'dmg', 'range'],
  node_regrow: ['chance'],
  luck_twice: [],
  glint_echo: ['pct'],
  heal_on_kill: ['pct'],
  wide_swing: ['arc'],
  double_drop: ['chance'],
  cheat_death: ['cd'],
  ability_crit: [],
  opener: ['idle', 'mult'],
  jackpot: ['chance', 'mult'],
  blind_on_crit: ['dur'],
  ability_echo: ['mult', 'delay'],
  projectile_split: ['mult'],
  kiln_boost: ['bonus', 'dur'],
  puddle: ['slow', 'dur'],
  heal_orb: ['chance', 'pct'],
  companion: ['kind'],
  periodic_wave: ['interval', 'dmg', 'radius'],
});
export const PROC_IDS = Object.freeze(Object.keys(PROCS));
// Keys a proc object may have besides on/id/p.
export const PROC_EXTRA_KEYS = Object.freeze(['scale']);

// ---------------------------------------------------------------- flags (CRITIQUE R4 item 2)
// Non-numeric effects carried in a `flags: string[]` field on cards, card sets, skills, items (trinkets, gear,
// food), blessings, classes, rebirth perks, weather and NPC line rewards. game.stats.hasFlag(player, flag) reads them.
export const FLAGS = deepFreeze({
  dig_minimap: 'u22 rank 1: dig spots shown on the minimap',
  crit_overflow: 'm04: crit chance above the cap converts to crit damage',
  fire_immune: 'Ember 5-set: immune to fire damage',
  ore_minimap: 'H4: ore nodes on the minimap',
  no_shallows_slow: 'H5: no slow in shallows',
  no_wither: 'H11: crops never wither',
  refund_full: 'F4: deconstruct refunds exactly what was paid',
  no_knockback_attacking: 'C6: no knockback while attacking',
  second_weapon: 'C11: second weapon slot (swap with mouse wheel)',
  map_reveal: 'T3: map shows the feature of unraised plots adjacent to owned ones',
  hud_timers: 'T4: tide and weather timers on the HUD',
  second_calling: 'T9: equip the first two abilities of a second class (Z, X)',
  wayfarer: 'T11: teleport to any Waystone from anywhere (cooldown in effect wayfarer_cd)',
  lava_immune: 'kiln_ember: immune to lava tiles',
  chill_immune: 'immune to Chill (antler_tine, frost_sorbet, armor T5 set)',
  freeze_immune: 'thawless_plate: cannot be frozen',
  burn_immune: 'armor T3 set: immune to burn',
  cache_minimap: 'tide_compass: tide caches shown on the minimap',
  reveal_ambushers: 'lantern_2: reveals ambushers',
  dodge_crit: 'Squallblade: dodging through an enemy guarantees the next crit',
  ability_kill_surge: 'Brinesinger: ability kills restore 10 Surge',
  summons_scale_power: 'Gearwright: turrets and summons scale with power',
  gem_spawn_boost: 'Prospector: gem node chance 6% on the plot the player stands on',
  ally_regen: 'Greenwarden: +1 HP/s to allies within 6 tiles',
  summon_hp: 'Greenwarden: summons +30% HP',
  crop_aura: 'Greenwarden: crops +20% growth within 6 tiles',
  start_burrow: 'Moon Chart: start with one Scuttler Burrow',
  eclipse_cards: 'Moon Chart: Mythic-plus "Eclipse" card variants',
  trench_no_key: 'Morrow line: Trench entry no longer needs a key above floor 10',
  lightning: 'weather storm: lightning strikes a random node/enemy every 8 s',
  wet: 'weather rain: crops auto-watered',
  low_visibility: 'weather fog: view radius 7 tiles',
  chill_meter: 'weather blizzard: chill meter',
  elites_guaranteed: 'weather eclipse: elites guaranteed',
  king_tide: 'weather king_tide: low tide lasts 4 min and exposes a second tidal ring',
  mirage_spawns: 'weather heatwave: mirage enemies spawn',
  storm_fish: 'weather storm: storm-only fish',
  dig_glow: 'weather fog: relic dig spots glow',
  ambush_x2: 'weather fog: ambush enemies x2',
});
export const FLAG_IDS = Object.freeze(Object.keys(FLAGS));

// ---------------------------------------------------------------- numeric effects (WP2 extension)
// Parameterised content effects that are neither a stat mod, a proc nor a flag. Shape: { id, ...params }.
export const EFFECTS = deepFreeze({
  shellbed_pearl_mult: ['v'],        // r18
  token_per_levels: ['every', 'n'],  // r16, G7
  banish_per_levels: ['every', 'n'], // G7
  elite_spawn: ['v'],                // m08
  elite_glint: ['mult'],             // e07
  low_tide_yield: ['mult'],          // Tide 7-set
  burn_kill_drop: ['item'],          // Ember 7-set
  regen_per_levels: ['every', 'v'],  // Bloom 5-set
  crop_double: ['chance'],           // Bloom 7-set
  rare_fish: ['v'],                  // H8, Ysolde
  creel_bonus: ['cap', 'speed'],     // H8
  kiln_queue: ['n'],                 // F2
  stockpile_slots: ['n'],            // F3
  elite_loot: ['v'],                 // C7
  ally_aura: ['radius', 'stat', 'v'],// C12
  wayfarer_cd: ['cd'],               // T11
  dig_spots: ['mult'],               // G6
  archive_xp: ['mult'],              // G6
  shop_restock: ['mult'],            // G8
  fish_value: ['mult'],              // regent_signet
  bonus_draft_offer: ['n'],          // scribe_quill
  food_duration: ['v'],              // salt_idol
  tonic_duration: ['v'],             // ember_flask
  burrow_near: ['radius', 'v'],      // scuttler_whistle
  keeper_loot_rolls: ['n'],          // bl_loot
  temper_glint_discount: ['v'],      // Brannick line
  moon_shards_next: ['n'],           // Nix line
  party_buff: ['radius'],            // tidewright_feast
  start_item: ['item', 'qty'],       // Moon Chart
  draft_offer_tens: ['n'],           // Moon Chart
  start_tokens_per_levels: ['every', 'n'], // Moon Chart
  keep_card: ['n'],                  // Moon Chart
  scuttler_tier: ['n'],              // Moon Chart
  boss_trinkets: ['n'],              // Moon Chart
  start_beacon: ['k'],               // Moon Chart
  hook_yield: ['v'],                 // hook_7 +25% yield
  rod_rare_fish: ['item', 'v'],      // Ysolde line
  free_item: ['item', 'qty'],        // Sootwren line
  machine_near_radius: ['radius'],   // r06 (6), Gearwright (8)
  wild_weight: ['v'],                // reserved for charters
});
export const EFFECT_IDS = Object.freeze(Object.keys(EFFECTS));

// ---------------------------------------------------------------- statuses, elements, affixes
export const STATUSES = Object.freeze([
  'burn', 'bleed', 'chill', 'slow', 'freeze', 'stun', 'root', 'mark', 'blind', 'silence',
  'shield', 'taunt', 'haste', 'invuln', 'unstoppable', 'downed',
]);
export const DEBUFFS = Object.freeze(['burn', 'bleed', 'chill', 'slow', 'freeze', 'stun', 'root', 'mark', 'blind', 'silence']);
export const ELEMENTS = Object.freeze(['none', 'ember', 'frost', 'storm', 'tide', 'hollow']);
export const AFFIX_IDS = Object.freeze(['swift', 'plated', 'volatile', 'leeching', 'splitting', 'shrouded']);

// ---------------------------------------------------------------- AI archetypes
export const AI_ARCHETYPES = deepFreeze({
  charger: ['windup', 'chargeSpeed', 'chargeDist', 'cd', 'burrow?'],
  kiter: ['keepDist', 'shotCd', 'proj', 'fan?'],
  burrower: ['windup', 'cd', 'hideTime'],
  swarm: ['groupSize', 'lightSeek'],
  guarded_melee: ['frontBlock', 'windup', 'range', 'cd'],
  lunger: ['lungeDist', 'latchTime', 'heal', 'cd'],
  ambusher: ['disguise', 'revealDist', 'burst'],
  teleport_caster: ['shotCd', 'proj', 'homing', 'blinkOnHit'],
  shambler: ['groupSize', 'fromWater'],
  exploder: ['fuse', 'radius'],
  trail_tank: ['trail', 'trailDur', 'slamCd?'],
  diver: ['circleDist', 'diveCd', 'lineLen', 'fromOffscreen?'],
  turret_lobber: ['shotCd', 'proj', 'arc', 'pool?'],
  phaser: ['passStructures', 'touchStatus'],
  skirmisher: ['zigzag', 'stabCd'],
  illusionist: ['clones', 'cloneCd'],
  beam_turret: ['charge', 'sweep', 'dps', 'summons?'],
  splitter: ['into', 'count'],
  pack_hunter: ['packSize', 'flank', 'howlCd'],
  blinker: ['blinkCd', 'behind'],
  mimic: ['copyRange'],
  support_shield: ['radius'],
  wave_rider: ['waveSpeed', 'vulnWindow'],
});
export const AI_IDS = Object.freeze(Object.keys(AI_ARCHETYPES));

// ---------------------------------------------------------------- machines
export const MACHINE_TYPES = deepFreeze({
  burrow: ['rate', 'radius', 'maxTier', 'need', 'slots'],
  mover: ['interval', 'filter'],
  sluice: ['speed'],
  splitter: [],
  hopper: ['radius', 'slots'],
  autobench: ['maxTier', 'speed', 'inSlots', 'outSlots'],
  drill: ['rate', 'rareShare', 'perPlot'],
  tiller: ['radius', 'interval'],
  producer: ['item?', 'table?', 'interval', 'cond', 'slots'],
  courier: ['gulls', 'carry', 'speed'],
  seller: ['rate', 'pct', 'satKey?'],
  echo: ['interval'],
  generator: ['fuelPer10s', 'cond'],   // generators exist only as this machine type; machine.flux is their OUTPUT
  turret: ['range', 'dmg', 'rate', 'chain'],
});
export const MACHINE_TYPE_IDS = Object.freeze(Object.keys(MACHINE_TYPES));
export const GENERATOR_CONDS = Object.freeze(['none', 'shore', 'day', 'hoarfrost', 'echoglass']);
export const PRODUCER_CONDS = Object.freeze(['shore', 'tree', 'water', 'crops4']);
export const PRODUCER_TABLES = Object.freeze(['fish_common']);

// ---------------------------------------------------------------- abilities
export const ABILITY_TARGETS = Object.freeze(['self', 'point', 'dir', 'enemy', 'ally_or_machine']);
export const ABILITY_PARAM_KEYS = Object.freeze([
  'dmg', 'radius', 'range', 'len', 'width', 'dur', 'tick', 'hits', 'stun', 'slow', 'pull', 'heal', 'block',
  'reflect', 'armor', 'speed', 'count', 'max', 'summon', 'mark', 'charges', 'gather', 'yieldMult', 'xpMult', 'stages',
]);
export const ABILITY_LEVELS = Object.freeze([10, 20, 35, 60]);
export const SIGNATURE_LEVELS = Object.freeze([70, 80, 90]);

// ---------------------------------------------------------------- bosses, dungeons, quests
export const BOSS_SCRIPTS = Object.freeze([
  'thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir',
  'sporeking', 'barnacle_bell', 'bellows_engine', 'twin_lenses', 'thawless_knight', 'scribe',
  'drowned_moon',
]);
export const BOSS_KINDS = Object.freeze(['warden', 'keeper', 'final']);
export const DUNGEON_MECHANICS = Object.freeze(['spores', 'water_level', 'conveyors', 'mirrors', 'ice_blocks', 'darkness']);
export const QUEST_GOAL_KINDS = Object.freeze([
  'build', 'craft', 'collect', 'deliver', 'kill', 'kill_elite', 'raise', 'clear', 'catch', 'donate',
  'counter', 'reach', 'temper', 'solve',
]);
// targets for goal kind 'reach'. 'tidegate' is a WP2 extension for q23 (see INTEGRATION_NOTES).
export const REACH_TARGETS = Object.freeze(['level', 'flux', 'trench', 'tidegate']);
export const QUEST_TYPES = Object.freeze(['main', 'side', 'board']);
export const SHRINE_PUZZLES = Object.freeze(['plates', 'braziers', 'blocks', 'tidelock', 'echo']);

// ---------------------------------------------------------------- unlocks
// The `unlock` field is an array; every entry must hold.
export const UNLOCK_KINDS = Object.freeze(['level', 'skill', 'beacon', 'quest', 'boss', 'vault']);

// ---------------------------------------------------------------- items, structures, nodes
export const ITEM_CATS = Object.freeze([
  'material', 'component', 'tool', 'weapon', 'armor', 'trinket', 'rod', 'pack', 'lantern', 'food', 'tonic',
  'seed', 'fish', 'placeable', 'key', 'trophy', 'relic', 'misc',
]);
export const GEAR_SLOTS = Object.freeze(['hook', 'weapon', 'helm', 'coat', 'boots', 'rod', 'pack', 'trinket', 'lantern']);
export const WEAPON_TYPES = Object.freeze(['blade', 'bow', 'staff']);
export const USE_KINDS = Object.freeze(['food', 'tonic', 'bandage', 'bomb', 'lure', 'token', 'plant_node', 'restore_surge']);
export const STRUCTURE_CATS = Object.freeze(['station', 'storage', 'farming', 'automation', 'flux', 'defence', 'utility', 'world', 'decor']);
export const PLACE_ON = Object.freeze(['land', 'water', 'shore', 'soil', 'vein']);
export const NODE_CLASSES = Object.freeze(['wood', 'stone', 'ore', 'plant', 'tidal', 'gem']);
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
export const FISH_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'legendary']);
export const CARD_TAGS = Object.freeze(['tide', 'ember', 'frost', 'storm', 'bloom', 'gear', 'fortune', 'fang']);
export const SKILL_BRANCHES = Object.freeze(['harvest', 'forge', 'fray', 'tide', 'fortune']);
export const DEED_CATS = Object.freeze(['gather', 'craft', 'fight', 'explore', 'automate', 'crew']);
export const BIOME_IDS = Object.freeze(['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral']);
export const FEATURE_IDS = Object.freeze(['start', 'archive', 'vault', 'arena', 'castaway', 'shrine', 'lagoon', 'vein', 'grove', 'dig', 'gate_site', 'wild']);
export const WEATHER_IDS = Object.freeze(['clear', 'rain', 'storm', 'fog', 'ashfall', 'heatwave', 'blizzard', 'eclipse', 'king_tide']);
export const CHARTERS = Object.freeze(['quarry', 'orchard', 'workshop', 'garrison']);
export const FISH_CONDS = Object.freeze(['phase', 'weather', 'tide', 'time']);
export const DAY_PHASES = Object.freeze(['dawn', 'day', 'dusk', 'night']);

// ---------------------------------------------------------------- buffs
export const FOOD_IDS = Object.freeze(['roast_berries', 'grilled_fish', 'reed_bread', 'fen_stew', 'ember_curry', 'glass_noodles', 'frost_sorbet', 'ink_broth', 'tidewright_feast']);
export const TONIC_IDS = Object.freeze(['tonic_haste', 'tonic_stone', 'tonic_fortune', 'tonic_surge']);
export const BUFF_IDS = Object.freeze([
  ...FOOD_IDS, ...TONIC_IDS, 'bandage', 'bomb', 'tide_token',
  ...[1, 2, 3, 4, 5, 6].map((k) => 'lure_' + k),
  'rested', 'wake', 'overclock', 'rally', 'motherlode', 'vein_sense', 'unmoored',
  ...CARD_TAGS.map((t) => 'set_' + t),
]);

// ---------------------------------------------------------------- deeds counters (DESIGN A.7, exactly 60)
export const COUNTERS = Object.freeze([
  'nodes_broken', 'wood_gathered', 'stone_gathered', 'ore_gathered', 'plants_gathered', 'tidal_nodes', 'tide_caches',
  'gem_nodes', 'crops_harvested', 'fish_caught', 'items_crafted', 'bars_smelted', 'gear_crafted', 'dishes_cooked',
  'tonics_brewed', 'structures_built', 'tempers_done', 'ballast_made', 'components_made', 'plots_raised',
  'mobs_killed', 'elites_killed', 'bosses_killed', 'wardens_hard', 'damage_dealt', 'deaths', 'crits_landed',
  'abilities_cast', 'raids_survived', 'dodges', 'shrines_solved', 'vaults_cleared', 'trench_deepest', 'relics_found',
  'legendary_fish', 'archive_donations', 'quests_done', 'distance_walked', 'waystone_jumps', 'king_tides_worked',
  'machines_built', 'burrow_units', 'sluice_items', 'gull_deliveries', 'autobench_crafts', 'flux_peak', 'items_sold',
  'glint_earned', 'minted', 'tend_refills', 'allies_revived', 'coop_minutes', 'pings_sent', 'shared_kills',
  'cards_picked', 'mythics_owned', 'rerolls_used', 'skills_bought', 'mastery_levels', 'rebirths',
]);

// ---------------------------------------------------------------- fx presets (DESIGN 19.1 = 89, A.8 = 37; total 126)
export const FX_PRESETS_CORE = Object.freeze([
  'hit_wood', 'hit_stone', 'hit_plant', 'hit_ice', 'hit_null', 'hit_clink', 'break_wood', 'break_stone', 'break_plant',
  'break_crystal', 'gem_sparkle', 'drop_pop', 'pickup_trail', 'pickup_flash', 'xp_mote', 'level_up', 'card_reveal',
  'card_pick', 'skill_buy', 'footstep_dust', 'footstep_splash', 'footstep_snow', 'footstep_ash', 'dodge_trail',
  'swing_arc', 'hit_flesh', 'hit_armor', 'crit_spark', 'enemy_death', 'elite_aura', 'elite_death', 'burn',
  'burn_explode', 'chill', 'freeze_shatter', 'spark_chain', 'lightning_strike', 'tide_wave', 'heal', 'shield_pop',
  'poison_bubble', 'ability_cast', 'anchor_slam', 'gale_step', 'undertow', 'tidepool', 'overclock', 'seismic',
  'motherlode', 'verdant_tide', 'summon_puff', 'boss_telegraph', 'boss_phase', 'boss_death', 'plot_rise', 'tide_out',
  'tide_in', 'water_ripple', 'fish_splash', 'rain', 'storm_rain', 'snow', 'blizzard', 'ashfall', 'fog_bank',
  'heat_shimmer', 'eclipse_motes', 'fireflies', 'leaf_fall', 'kiln_smoke', 'craft_done', 'machine_work', 'sluice_flow',
  'flux_arc', 'build_place', 'build_remove', 'crop_grow', 'water_pour', 'glint_burst', 'chest_open', 'beacon_light',
  'gate_stage', 'waystone_warp', 'revive', 'death_poof', 'quest_done', 'donate_confetti', 'ping', 'moon_shards',
]);
export const FX_PRESETS_EXTRA = Object.freeze([
  'breakwater', 'rally_horn', 'unmoored', 'crosscurrent', 'riptide_mark', 'tempest', 'brine_bolt', 'kingwave',
  'pocket_turret', 'magnet_coil', 'clockwork_legion', 'vein_sense', 'blast_charge', 'thornlash', 'quickgrow',
  'sproutling', 'boss_thornmother', 'boss_regent', 'boss_kilnheart', 'boss_prismarch', 'boss_antler', 'boss_choir',
  'boss_moon', 'keeper_sporeking', 'keeper_bell', 'keeper_bellows', 'keeper_lenses', 'keeper_knight', 'keeper_scribe',
  'raid_horn', 'tidebreak_wave', 'set_proc', 'temper_success', 'temper_fail', 'mint_coin', 'gull_trail', 'tend_warning',
]);
export const FX_PRESETS = Object.freeze([...FX_PRESETS_CORE, ...FX_PRESETS_EXTRA]);

// Music track ids referenced by content (12 tracks: 6 biomes, night variant handled by the sequencer, vault, boss, title...).
export const MUSIC_IDS = Object.freeze(['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral', 'vault', 'boss', 'title', 'trench', 'tidegate', 'moon']);
