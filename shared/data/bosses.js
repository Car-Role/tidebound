// Bosses (DESIGN 12, 13.1, A.4). Phases at 100/66/33% HP. Enrage at 6 min (Wardens and Keepers 1-3) or 8 min (4-6).
// Wardens: loot rolled per participant; trinket guaranteed in hard mode (2 Lures: +100% HP, +25% damage).
// moves: per phase, the moves added in that phase (earlier moves are kept).
const P = [1, 0.66, 0.33];

export default [
  // ---------------------------------------------------------------- Wardens (12.2)
  { id: 'thornmother', name: 'Old Thornmother', kind: 'warden', k: 1, biome: 'greenmarrow', hp: 1500, dmg: 14, enrage: 360, lure: 'lure_1', phases: P, script: 'thornmother',
    moves: [['root_sweep', 'seed_volley'], ['call_thistlewisps'], ['thorn_ring']], fx: 'boss_thornmother',
    loot: [{ item: 'trophy_thornmother', p: 1 }, { item: 'thorn_locket', p: 0.5, trinket: true }, { item: 'blade_2', p: 0.3 }, { item: 'vault_key_1', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },
  { id: 'mire_regent', name: 'Gulchmaw, the Mire Regent', kind: 'warden', k: 2, biome: 'saltfen', hp: 6000, dmg: 30, enrage: 360, lure: 'lure_2', phases: P, script: 'mire_regent',
    moves: [['tongue_grab', 'belly_flop'], ['flood_lanes'], ['spit_fenleeches']], fx: 'boss_regent',
    loot: [{ item: 'trophy_regent', p: 1 }, { item: 'regent_signet', p: 0.5, trinket: true }, { item: 'vault_key_2', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },
  { id: 'kilnheart', name: 'Kilnheart Colossus', kind: 'warden', k: 3, biome: 'emberreach', hp: 20000, dmg: 60, enrage: 360, lure: 'lure_3', phases: P, script: 'kilnheart',
    moves: [['fist_slam', 'flame_arms'], ['vents'], ['core_exposed']], fx: 'boss_kilnheart',
    loot: [{ item: 'trophy_kilnheart', p: 1 }, { item: 'kiln_ember', p: 0.5, trinket: true }, { item: 'vault_key_3', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },
  { id: 'prismarch', name: 'The Prismarch', kind: 'warden', k: 4, biome: 'glasswaste', hp: 60000, dmg: 110, enrage: 480, lure: 'lure_4', phases: P, script: 'prismarch',
    moves: [['beam_lattice', 'mirror_clones'], ['colour_zones'], ['full_refraction']], fx: 'boss_prismarch',
    loot: [{ item: 'trophy_prismarch', p: 1 }, { item: 'prism_eye', p: 0.5, trinket: true }, { item: 'vault_key_4', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },
  { id: 'glacier_antler', name: 'The Glacier Antler', kind: 'warden', k: 5, biome: 'hoarfrost', hp: 120000, dmg: 190, enrage: 480, lure: 'lure_5', phases: P, script: 'glacier_antler',
    moves: [['charge_lanes', 'shard_fans'], ['blizzard_chill'], ['ice_floor']], fx: 'boss_antler',
    loot: [{ item: 'trophy_antler', p: 1 }, { item: 'antler_tine', p: 0.5, trinket: true }, { item: 'vault_key_5', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },
  { id: 'hollow_choir', name: 'The Hollow Choir', kind: 'warden', k: 6, biome: 'umbral', hp: 400000, dmg: 320, enrage: 480, lure: 'lure_6', phases: P, script: 'hollow_choir',
    moves: [['three_singers', 'note_waves'], ['silence_zones'], ['arena_shrink']], fx: 'boss_choir', singers: { count: 3, window: 10 },
    loot: [{ item: 'trophy_choir', p: 1 }, { item: 'choir_bell', p: 0.5, trinket: true }, { item: 'vault_key_6', qty: 2, p: 1, repeatOnly: true }], music: 'boss' },

  // ---------------------------------------------------------------- Keepers (13.1, A.4); vault_core 100% first clear, 25% repeat
  { id: 'sporeking', name: 'Sporeking Bulb', kind: 'keeper', k: 1, biome: 'greenmarrow', hp: 900, dmg: 12, enrage: 360, phases: P, script: 'sporeking',
    moves: [['spore_lob', 'root_jab'], ['sporeling_call'], ['bloom']], fx: 'keeper_sporeking',
    loot: [{ item: 'vault_core_1', p: 1, firstOnly: true }, { item: 'vault_core_1', p: 0.25, repeatOnly: true }, { item: 'spore_pouch', p: 0.5, trinket: true }], music: 'boss' },
  { id: 'barnacle_bell', name: 'The Barnacle Bell', kind: 'keeper', k: 2, biome: 'saltfen', hp: 3500, dmg: 26, enrage: 360, phases: P, script: 'barnacle_bell',
    moves: [['toll', 'barnacle_spit'], ['flood'], ['clapper_swing']], fx: 'keeper_bell',
    loot: [{ item: 'vault_core_2', p: 1, firstOnly: true }, { item: 'vault_core_2', p: 0.25, repeatOnly: true }, { item: 'barnacle_charm', p: 0.5, trinket: true }], music: 'boss' },
  { id: 'bellows_engine', name: 'The Bellows Engine', kind: 'keeper', k: 3, biome: 'emberreach', hp: 12000, dmg: 52, enrage: 360, phases: P, script: 'bellows_engine',
    moves: [['flame_jet', 'slag_drop'], ['conveyor'], ['overheat']], fx: 'keeper_bellows',
    loot: [{ item: 'vault_core_3', p: 1, firstOnly: true }, { item: 'vault_core_3', p: 0.25, repeatOnly: true }, { item: 'bellows_valve', p: 0.5, trinket: true }], music: 'boss' },
  { id: 'twin_lenses', name: 'The Twin Lenses', kind: 'keeper', k: 4, biome: 'glasswaste', hp: 18000, count: 2, dmg: 95, enrage: 480, phases: P, script: 'twin_lenses',
    moves: [['beam', 'swap'], ['refract'], ['focus']], fx: 'keeper_lenses',
    loot: [{ item: 'vault_core_4', p: 1, firstOnly: true }, { item: 'vault_core_4', p: 0.25, repeatOnly: true }, { item: 'twin_lens', p: 0.5, trinket: true }], music: 'boss' },
  { id: 'thawless_knight', name: 'The Thawless Knight', kind: 'keeper', k: 5, biome: 'hoarfrost', hp: 95000, dmg: 165, enrage: 480, phases: P, script: 'thawless_knight',
    moves: [['cleave', 'shard_line'], ['ice_floor'], ['glacier_drop', 'frost_charge']], fx: 'keeper_knight',
    loot: [{ item: 'vault_core_5', p: 1, firstOnly: true }, { item: 'vault_core_5', p: 0.25, repeatOnly: true }, { item: 'thawless_plate', p: 0.5, trinket: true }], music: 'boss' },
  { id: 'scribe', name: 'Scribe of Nothing', kind: 'keeper', k: 6, biome: 'umbral', hp: 240000, dmg: 280, enrage: 480, phases: P, script: 'scribe',
    moves: [['ink_blot', 'quill_dart'], ['erase'], ['darkness']], fx: 'keeper_scribe',
    loot: [{ item: 'vault_core_6', p: 1, firstOnly: true }, { item: 'vault_core_6', p: 0.25, repeatOnly: true }, { item: 'scribe_quill', p: 0.5, trinket: true }], music: 'boss' },

  // ---------------------------------------------------------------- Final boss (12.3)
  { id: 'drowned_moon', name: 'The Drowned Moon', kind: 'final', k: 7, biome: null, hp: 1200000, phaseHp: [300000, 400000, 500000], dmg: 420, enrage: 600, enragePhase: 3,
    phases: [1, 0.75, 0.4167], script: 'drowned_moon', arena: 40,
    moves: [['tidal_lanes', 'shard_rain', 'tether_pylons'], ['flood_halves', 'warden_echoes'], ['gravity_well', 'ring_waves']], fx: 'boss_moon',
    loot: [{ item: 'moon_shard_crown', p: 1, firstOnly: true }], rewards: { skillPoint: 1, moonShards: 5, credits: true, rebirth: true }, music: 'moon' },
];

// Boss fight rules (DESIGN 12.1, A.9)
export const BOSS_RULES = Object.freeze({ minTelegraph: 0.6, enrageDmg: 0.5, enrageSpeed: 0.3, hardHp: 1.0, hardDmg: 0.25, hardLures: 2 });
