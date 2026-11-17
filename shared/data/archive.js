// The Archive (DESIGN 17.1): 8 wings x 12 items = 96 donations. Each donation gives 50 * itemTier^2 XP (fixed).
// Completion rewards are permanent and world-wide (world sheet) plus 1 skill point. The Archive survives Rebirth.
const w = (stat, v) => ({ stat, op: 'add', v });

export default [
  { id: 'wing_timber', name: 'Timber', items: ['driftwood', 'stiltwood', 'ashwood', 'spinewood', 'palewood', 'gloomwood', 'plank', 'charcoal', 'resin', 'rope', 'cloth', 'sluice_board'],
    reward: { worldMods: [w('yieldWoodWorld', 0.10)], skillPoint: 1, text: '+10% wood yield' } },
  { id: 'wing_stone', name: 'Stone', items: ['fieldstone', 'clay', 'obsidian', 'sunsand', 'everice', 'nullsilt', 'brick', 'glass', 'sand', 'salt', 'peat', 'lens'],
    reward: { worldMods: [w('yieldStoneWorld', 0.10)], skillPoint: 1, text: '+10% stone yield' } },
  { id: 'wing_metal', name: 'Metals', items: ['copper_ore', 'bog_iron_ore', 'cinderite_ore', 'prismite_ore', 'rime_ore', 'umbrite_ore', 'copper_bar', 'iron_bar', 'cindersteel_bar', 'prism_alloy', 'rimesteel_bar', 'umbral_alloy'],
    reward: { worldMods: [w('kilnSpeedWorld', 0.15)], skillPoint: 1, text: 'kilns +15% speed' } },
  { id: 'wing_harvest', name: 'Harvest', items: ['tidewheat', 'marrowberry', 'mudroot', 'saltbloom', 'scorchpepper', 'cindercap', 'sunmelon', 'glassgourd', 'snowberry', 'pinecone_pale', 'inkcap', 'moonpetal'],
    reward: { worldMods: [w('cropGrowthWorld', 0.10)], skillPoint: 1, text: 'crops +10% growth' } },
  { id: 'wing_angler', name: 'Angler', items: ['marrow_carp', 'fen_eel', 'lava_loach', 'prism_ray', 'rime_cod', 'null_lamprey', 'dawn_darter', 'pearl_gar', 'obsidian_pike', 'mirage_angel', 'aurora_trout', 'echo_ray'],
    reward: { worldMods: [w('fishBiteWorld', -0.15)], skillPoint: 1, text: 'fish bite 15% faster' } },
  { id: 'wing_bestiary', name: 'Bestiary', items: ['chitin', 'fen_slime', 'ember_scale', 'mirage_dust', 'frost_pelt', 'gloom_heart', 'trophy_thornmother', 'trophy_regent', 'trophy_kilnheart', 'trophy_prismarch', 'trophy_antler', 'trophy_choir'],
    reward: { worldMods: [w('dmgWorld', 0.05)], skillPoint: 1, text: '+5% damage' } },
  { id: 'wing_relic', name: 'Relics', items: ['relic_01', 'relic_02', 'relic_03', 'relic_04', 'relic_05', 'relic_06', 'relic_07', 'relic_08', 'relic_09', 'relic_10', 'relic_11', 'relic_12'],
    reward: { worldMods: [w('luckWorld', 10)], skillPoint: 1, text: '+10 luck' } },
  { id: 'wing_works', name: 'Works', items: ['gear_part', 'nail', 'iron_plate', 'flux_coil', 'prism_circuit', 'cryo_cell', 'hollow_core', 'reed_bread', 'fen_stew', 'ember_curry', 'glass_noodles', 'frost_sorbet'],
    reward: { worldMods: [w('machineSpeed', 0.10)], skillPoint: 1, text: 'machines +10% speed' } },
];

export const DONATION_XP = (tier) => 50 * tier * tier;
