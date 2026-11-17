// Vaults (DESIGN 13.1), shrines (13.2), the Trench (13.3).
const ROOMS = { combat: 55, puzzle: 15, treasure: 10, trap: 10, blessing: 10 };
const v = (id, k, name, biome, keeper, mobs, tileset, mechanic, relic) => ({
  id, k, name, biome, floors: 3, grid: [5, 5], roomSize: [16, 12], rooms: [7, 10], roomWeights: ROOMS, keeper, mobs, tileset, mechanic,
  key: 'vault_key_' + k, firstEntryFree: true,
  firstReward: [{ item: 'vault_core_' + k, qty: 1 }], skillPoint: 1, bonusDraft: 'uncommon',
  repeatCoreChance: 0.25, relic, time: { first: [25, 40], repeat: [12, 18] }, music: 'vault',
});

export default [
  v('rootbound_vault', 1, 'Rootbound Vault', 'greenmarrow', 'sporeking', ['mossback', 'thistlewisp', 'burrowgrub'], 'vault_root', 'spores', null),
  v('sunken_cistern', 2, 'Sunken Cistern', 'saltfen', 'barnacle_bell', ['clatterclaw', 'fenleech', 'reedstalker', 'bogwisp'], 'vault_cistern', 'water_level', 'relic_10'),
  v('slagworks', 3, 'The Slagworks', 'emberreach', 'bellows_engine', ['cinderling', 'slagback', 'ashwing', 'magmaw'], 'vault_slag', 'conveyors', null),
  v('refraction_hall', 4, 'Refraction Hall', 'glasswaste', 'twin_lenses', ['shardscuttle', 'mirage_stalker', 'dune_maw', 'prism_sentinel'], 'vault_prism', 'mirrors', 'relic_11'),
  v('frozen_reliquary', 5, 'Frozen Reliquary', 'hoarfrost', 'thawless_knight', ['rimewolf', 'frostbulk', 'stillwing', 'sleetspitter'], 'vault_ice', 'ice_blocks', null),
  v('the_inkwell', 6, 'The Inkwell', 'umbral', 'scribe', ['hollowling', 'inkmaw', 'refrain_knight', 'gloom_lantern', 'abyss_eye'], 'vault_ink', 'darkness', 'relic_12'),
];

// Downed and wipe rules inside instances (DESIGN 5.3)
export const INSTANCE_RULES = Object.freeze({ downedS: 20, reviveS: 3, wipeEjects: true });

// Puzzle shrines (13.2): 11 total (Greenmarrow 1, tiers 2-6 two each). Reward chest: 1 trinket roll, 2 tide_token, 100 * tier^2 Glint.
export const SHRINES = Object.freeze({
  total: 11,
  puzzles: ['plates', 'braziers', 'blocks', 'tidelock', 'echo'],
  echoNotes: [4, 7],
  reward: { trinketRolls: 1, tokens: 2, glintPerTierSq: 100 },
  firstGreenmarrowRelic: 'relic_01',
});

// The Trench (13.3)
export const TRENCH = Object.freeze({
  unlock: ['beacon:3'],
  scale: 1.12, baseTier: 3, keeperEvery: 5, blessingEvery: 3,
  rareTier: (partyTier, floor) => Math.min(partyTier, 3 + Math.floor(floor / 8)),
  trinkets: { 10: 'deep_lantern', 20: 'scuttler_whistle', 30: 'storm_vial', 40: 'moon_sliver' },
  floor50: 'second copy of any Trench trinket (cosmetic)',
  moonpetalSeeds: { every: 10, qty: 5, item: 'seed_moonpetal' },
  requiredFloor: 10,
  rewards: ['glint', 'rare', 'relic_fragment'],
  tuning: { 10: 80, 30: 100 },   // floor -> intended hour
});
