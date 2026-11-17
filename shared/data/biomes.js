// Biomes (DESIGN 4.1-4.4, 4.6, A.5, A.9). ground = tile id (4..9). weather weights out of 100 per re-roll (DESIGN 4.6).

export default [
  {
    id: 'greenmarrow', tier: 1, name: 'Greenmarrow', ground: 4, plots: 9, ordinals: [1, 8],
    weather: { clear: 60, rain: 25, storm: 15 },
    nodeTable: ['bentwood_tree', 'fieldstone_rock', 'copper_vein', 'reed_clump', 'marrowberry_bush', 'peat_mound'],
    mobs: { day: ['mossback', 'thistlewisp', 'burrowgrub'], night: ['lantern_moth'] },
    music: 'greenmarrow', ambient: ['fireflies', 'leaf_fall'], palette: 'greenmarrow',
    ballast: { item: 'ballast_1', perOrdinal: 10 }, rare: 'shell', look: 'soft meadow, bentwood trees, yellow reeds',
  },
  {
    id: 'saltfen', tier: 2, name: 'Saltfen', ground: 5, plots: 15, ordinals: [9, 23],
    weather: { clear: 50, rain: 25, storm: 10, fog: 15 },
    nodeTable: ['stiltwood_tree', 'clay_bank', 'bogiron_vein', 'kelp_tangle', 'salt_pan'],
    mobs: { day: ['clatterclaw', 'fenleech', 'reedstalker', 'bogwisp'], night: ['brine_shambler'] },
    music: 'saltfen', ambient: ['fireflies', 'water_ripple'], palette: 'saltfen',
    ballast: { item: 'ballast_1', qty: 90 }, rare: 'pearl', look: 'teal marsh, stilt-root trees, salt pans',
  },
  {
    id: 'emberreach', tier: 3, name: 'Emberreach', ground: 6, plots: 15, ordinals: [24, 38],
    weather: { clear: 50, storm: 15, ashfall: 35 },
    nodeTable: ['ashwood_tree', 'obsidian_spire', 'cinderite_vein', 'brimstone_vent', 'ashgrass_tuft'],
    mobs: { day: ['cinderling', 'slagback', 'ashwing', 'magmaw'], night: ['emberwraith'] },
    music: 'emberreach', ambient: ['kiln_smoke', 'footstep_ash'], palette: 'emberreach',
    ballast: { item: 'ballast_2', qty: 160 }, rare: 'magma_core', look: 'black basalt, lava cracks, ash trees',
  },
  {
    id: 'glasswaste', tier: 4, name: 'Glasswaste', ground: 7, plots: 15, ordinals: [39, 53],
    weather: { clear: 60, heatwave: 40 },
    nodeTable: ['spinewood_cactus', 'sunsand_dune', 'prismite_vein', 'needlesilk_bloom'],
    mobs: { day: ['shardscuttle', 'mirage_stalker', 'dune_maw', 'prism_sentinel'], night: ['glass_revenant'] },
    music: 'glasswaste', ambient: ['gem_sparkle', 'heat_shimmer'], palette: 'glasswaste',
    ballast: { item: 'ballast_3', qty: 200 }, rare: 'amber', look: 'pale sand, fused glass spires, prisms',
  },
  {
    id: 'hoarfrost', tier: 5, name: 'Hoarfrost Verge', ground: 8, plots: 15, ordinals: [54, 68],
    weather: { clear: 50, fog: 20, blizzard: 30 },
    nodeTable: ['palewood_pine', 'everice_block', 'rime_vein', 'frostmoss_patch'],
    mobs: { day: ['rimewolf', 'frostbulk', 'stillwing', 'sleetspitter'], night: ['pale_shade'] },
    music: 'hoarfrost', ambient: ['snow', 'footstep_snow'], palette: 'hoarfrost',
    ballast: { item: 'ballast_4', qty: 380 }, rare: 'aurora_shard', look: 'blue snow, pale pines, ice sheets',
  },
  {
    id: 'umbral', tier: 6, name: 'The Umbral Deep', ground: 9, plots: 12, ordinals: [69, 80],
    weather: { clear: 40, rain: 20, storm: 15, fog: 15, eclipse: 10 },
    nodeTable: ['gloomwood_tree', 'nullsilt_heap', 'umbrite_vein', 'inkweed_frond'],
    mobs: { day: ['hollowling', 'inkmaw', 'refrain_knight', 'gloom_lantern', 'abyss_eye'], night: ['tidewraith'] },
    music: 'umbral', ambient: ['eclipse_motes', 'water_ripple'], palette: 'umbral',
    ballast: { item: 'ballast_5', qty: 1000 }, rare: 'echoglass', look: 'violet-black silt, glowing ink pools',
  },
];

// Eclipse can replace any night roll in biomes 1-5 with this chance; king tide every third day (DESIGN 4.6).
export const NIGHT_ECLIPSE_CHANCE = 0.05;
export const KING_TIDE_EVERY_DAYS = 3;

// Plot -> biome rule (DESIGN 4.2). dx = px-4, dy = py-4, d = max(|dx|,|dy|).
export function plotBiome(px, py) {
  const dx = px - 4, dy = py - 4, ax = Math.abs(dx), ay = Math.abs(dy), d = Math.max(ax, ay);
  if (d <= 1) return 'greenmarrow';
  if (ax === ay) return 'umbral';
  if (ax > ay) return dx < 0 ? 'saltfen' : 'glasswaste';
  return dy > 0 ? 'emberreach' : 'hoarfrost';
}

// Plot features (DESIGN 4.4): count per biome. nodeCap per feature (4.5): 22 wild, 30 grove/vein, 12 other feature plots.
export const FEATURES = [
  { id: 'start', name: 'Tidestone', counts: { greenmarrow: 1, saltfen: 0, emberreach: 0, glasswaste: 0, hoarfrost: 0, umbral: 0 }, nodeCap: 12 },
  { id: 'archive', name: 'The Archive', counts: { greenmarrow: 1, saltfen: 0, emberreach: 0, glasswaste: 0, hoarfrost: 0, umbral: 0 }, nodeCap: 12 },
  { id: 'vault', name: 'Vault entrance', counts: { greenmarrow: 1, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 1 }, nodeCap: 12 },
  { id: 'arena', name: 'Warden altar', counts: { greenmarrow: 1, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 1 }, nodeCap: 12 },
  { id: 'castaway', name: 'Castaway', counts: { greenmarrow: 1, saltfen: 2, emberreach: 2, glasswaste: 2, hoarfrost: 2, umbral: 2 }, nodeCap: 12 },
  { id: 'shrine', name: 'Puzzle shrine', counts: { greenmarrow: 1, saltfen: 2, emberreach: 2, glasswaste: 2, hoarfrost: 2, umbral: 2 }, nodeCap: 12 },
  { id: 'lagoon', name: 'Lagoon', counts: { greenmarrow: 1, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 0 }, nodeCap: 12 },
  { id: 'vein', name: 'Rich vein', counts: { greenmarrow: 0, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 1 }, nodeCap: 30, oreMult: 3 },
  { id: 'grove', name: 'Grove', counts: { greenmarrow: 0, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 0 }, nodeCap: 30 },
  { id: 'dig', name: 'Dig site', counts: { greenmarrow: 0, saltfen: 1, emberreach: 1, glasswaste: 1, hoarfrost: 1, umbral: 0 }, nodeCap: 12, digSpots: 6 },
  { id: 'gate_site', name: 'Tidegate site', counts: { greenmarrow: 0, saltfen: 0, emberreach: 0, glasswaste: 0, hoarfrost: 0, umbral: 1 }, nodeCap: 12 },
  { id: 'wild', name: 'Wild', counts: { greenmarrow: 2, saltfen: 5, emberreach: 5, glasswaste: 5, hoarfrost: 5, umbral: 4 }, nodeCap: 22, charter: true },
];

// Node rules (DESIGN 4.5)
export const NODE_RULES = Object.freeze({ respawnS: 6, tidalEveryS: 10, tidalCap: 8, gemChance: 0.03, gemChanceProspector: 0.06, structureClearance: 1, tooToughDamage: 0.1 });

// Dig spots (A.5): each dig plot has 6 spots, 2 hold the biome's relics, 4 hold 2 relic_fragment each; 10 hook hits; no respawn.
// Glassgourd seeds are found "at dig spots" (14.1): WP2 places 1 seed_glassgourd in each Glasswaste fragment spot (fill-in).
export const DIG_SITES = Object.freeze({
  saltfen: { relics: ['relic_02', 'relic_03'], fragments: [4, 2] },
  emberreach: { relics: ['relic_04', 'relic_05'], fragments: [4, 2] },
  glasswaste: { relics: ['relic_06', 'relic_07'], fragments: [4, 2], extra: { item: 'seed_glassgourd', qty: 1 } },
  hoarfrost: { relics: ['relic_08', 'relic_09'], fragments: [4, 2] },
});
export const DIG_HITS = 10;

// Plot charters (A.9): one free charter per owned wild plot, changeable once per in-game day.
export const CHARTER_DEFS = Object.freeze({
  quarry: { boost: ['stone', 'ore'], mult: 1.25, others: 0.5 },
  orchard: { boost: ['wood', 'plant'], mult: 1.25, others: 0.5 },
  workshop: { machineCap: 2, nodeCap: -8 },
  garrison: { noSpawns: true },
});

// Time and tide (DESIGN 4.6), seconds of real time.
export const CLOCK = Object.freeze({
  dayLength: 1440, phases: { dawn: 120, day: 720, dusk: 120, night: 480 },
  tideLength: 360, highTide: 240, lowTide: 120, turningWarning: 10,
  weatherReroll: [360, 600], kingTideLow: 240, firstCacheGlint: 15,
});
