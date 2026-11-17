// Fish (DESIGN 14.2): 30 fish, 5 per biome. Values: common 4*tier, uncommon 15*tier, rare 60*tier, legendary 400*tier.
// weight = catch share in percent (60 / 25 / 10 / 4 / 1). cond: conditions that must all hold (phase, weather, tide, time).
// difficulty (0..1) drives the reel minigame (catch meter 2-6 s by rarity); filled in by WP2.

const BIOMES = ['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
const ROWS = [
  // common, common, uncommon, [rare, cond], [legendary, cond]
  ['pebble_minnow', 'reed_perch', 'marrow_carp', ['dawn_darter', { phase: 'dawn' }], ['old_whiskers', { weather: 'rain' }]],
  ['mud_skipper', 'salt_sprat', 'fen_eel', ['pearl_gar', { tide: 'low' }], ['bog_sovereign', { weather: 'fog' }]],
  ['ash_guppy', 'cinder_bass', 'lava_loach', ['obsidian_pike', { phase: 'night' }], ['kiln_koi', { weather: 'ashfall' }]],
  ['sand_dab', 'glassfin', 'prism_ray', ['mirage_angel', { weather: 'heatwave' }], ['sun_sturgeon', { time: 'noon' }]],
  ['ice_smelt', 'frost_char', 'rime_cod', ['aurora_trout', { phase: 'night', weather: 'clear' }], ['glacier_maw', { weather: 'blizzard' }]],
  ['ink_fry', 'gloom_tetra', 'null_lamprey', ['echo_ray', { weather: 'eclipse' }], ['moon_leviathan', { weather: 'king_tide' }]],
];
const NAMES = {
  pebble_minnow: 'Pebble Minnow', reed_perch: 'Reed Perch', marrow_carp: 'Marrow Carp', dawn_darter: 'Dawn Darter', old_whiskers: 'Old Whiskers',
  mud_skipper: 'Mud Skipper', salt_sprat: 'Salt Sprat', fen_eel: 'Fen Eel', pearl_gar: 'Pearl Gar', bog_sovereign: 'Bog Sovereign',
  ash_guppy: 'Ash Guppy', cinder_bass: 'Cinder Bass', lava_loach: 'Lava Loach', obsidian_pike: 'Obsidian Pike', kiln_koi: 'Kiln Koi',
  sand_dab: 'Sand Dab', glassfin: 'Glassfin', prism_ray: 'Prism Ray', mirage_angel: 'Mirage Angel', sun_sturgeon: 'Sun Sturgeon',
  ice_smelt: 'Ice Smelt', frost_char: 'Frost Char', rime_cod: 'Rime Cod', aurora_trout: 'Aurora Trout', glacier_maw: 'Glacier Maw',
  ink_fry: 'Ink Fry', gloom_tetra: 'Gloom Tetra', null_lamprey: 'Null Lamprey', echo_ray: 'Echo Ray', moon_leviathan: 'Moon Leviathan',
};
const SLOT = [
  { rarity: 'common', weight: 60, mult: 4, difficulty: 0.2 },
  { rarity: 'common', weight: 25, mult: 4, difficulty: 0.25 },
  { rarity: 'uncommon', weight: 10, mult: 15, difficulty: 0.4 },
  { rarity: 'rare', weight: 4, mult: 60, difficulty: 0.6 },
  { rarity: 'legendary', weight: 1, mult: 400, difficulty: 0.85 },
];

const FISH = [];
ROWS.forEach((row, bi) => {
  const tier = bi + 1;
  row.forEach((entry, si) => {
    const [id, cond] = Array.isArray(entry) ? entry : [entry, null];
    const s = SLOT[si];
    FISH.push({ id, name: NAMES[id], biome: BIOMES[bi], tier, rarity: s.rarity, weight: s.weight, value: s.mult * tier, cond, difficulty: s.difficulty });
  });
});

// Rod tier needed per fish tier (rod_1: biomes 1-2, rod_2: 3, rod_3: 4-5, rod_4: 6).
export const ROD_FOR_FISH_TIER = Object.freeze({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4 });

export default FISH;
