// Crops (DESIGN 14.1). stageTime in seconds; yield [min, max]; seed item is seed_<id>.
// Extra keys: value (crop item value), seedSource (text), extra effects (heatwaveYield, seedReturn, smeltsTo, fuel).

export default [
  { id: 'tidewheat', name: 'Tidewheat', tier: 1, seed: 'seed_tidewheat', stages: 4, stageTime: 60, yield: [2, 3], regrows: false, nightOnly: false, value: 3, seedSource: 'castaway shop 2 G' },
  { id: 'marrowberry', name: 'Marrowberry', tier: 1, seed: 'seed_marrowberry', stages: 4, stageTime: 75, yield: [2, 2], regrows: true, nightOnly: false, value: 1, seedSource: 'from berries' },
  { id: 'mudroot', name: 'Mudroot', tier: 2, seed: 'seed_mudroot', stages: 4, stageTime: 90, yield: [2, 2], regrows: false, nightOnly: false, value: 6, seedSource: 'Saltfen grass drops (kelp_tangle 5%)' },
  { id: 'saltbloom', name: 'Saltbloom', tier: 2, seed: 'seed_saltbloom', stages: 5, stageTime: 80, yield: [1, 2], regrows: false, nightOnly: false, value: 10, seedSource: 'Saltfen shop 8 G' },
  { id: 'scorchpepper', name: 'Scorchpepper', tier: 3, seed: 'seed_scorchpepper', stages: 5, stageTime: 100, yield: [2, 2], regrows: false, nightOnly: false, value: 16, seedSource: 'Emberreach shop 25 G' },
  { id: 'cindercap', name: 'Cindercap', tier: 3, seed: 'seed_cindercap', stages: 4, stageTime: 120, yield: [1, 2], regrows: false, nightOnly: false, value: 22, fuel: 6, seedSource: 'ashwood drops 5%' },
  { id: 'sunmelon', name: 'Sunmelon', tier: 4, seed: 'seed_sunmelon', stages: 6, stageTime: 110, yield: [1, 1], heatwaveYield: [3, 3], regrows: false, nightOnly: false, value: 60, seedSource: 'Glasswaste shop 60 G' },
  { id: 'glassgourd', name: 'Glassgourd', tier: 4, seed: 'seed_glassgourd', stages: 6, stageTime: 120, yield: [1, 2], regrows: false, nightOnly: false, value: 70, smeltsTo: { item: 'glass', qty: 2 }, seedSource: 'dig spots' },
  { id: 'snowberry', name: 'Snowberry', tier: 5, seed: 'seed_snowberry', stages: 5, stageTime: 150, yield: [2, 2], regrows: true, nightOnly: false, value: 90, seedSource: 'Hoarfrost shop 150 G' },
  { id: 'pinecone_pale', name: 'Pale Cone', tier: 5, seed: 'seed_pinecone_pale', stages: 6, stageTime: 150, yield: [1, 1], regrows: false, nightOnly: false, value: 120, plantsNode: 'palewood_pine', seedSource: 'palewood drops 5%' },
  { id: 'inkcap', name: 'Inkcap', tier: 6, seed: 'seed_inkcap', stages: 6, stageTime: 180, yield: [1, 2], regrows: false, nightOnly: false, value: 240, seedSource: 'Umbral shop 400 G' },
  { id: 'moonpetal', name: 'Moonpetal', tier: 6, seed: 'seed_moonpetal', stages: 8, stageTime: 180, yield: [1, 1], regrows: false, nightOnly: true, value: 600, seedReturn: 0.5, seedSource: '5 seed_moonpetal at Trench floors 10, 20, 30...' },
];

// Pest event (DESIGN 14.1): daily chance per unprotected farm cluster; share of crops eaten; spawns Burrowgrubs.
export const PESTS = Object.freeze({ chancePerDay: 0.15, share: 0.2, spawns: 'burrowgrub', witherDays: 2 });
