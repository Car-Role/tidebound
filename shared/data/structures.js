// Structures (DESIGN 7, 8.2-8.4, 18.1). Costs are solo; world:true structures scale by coopScale and never take discounts.
// Generators exist only as machine type 'generator' (machine.flux = OUTPUT); for every other machine machine.flux = demand.
// countsToCap: counts toward the per-plot machine cap (Sluices, Spillways, Grabbers, Splitters, Hoppers do not).
// tend: has a Tending meter (automation structures, generators, Ledger Post, Mint).
// natural: placed by world generation, never from the build menu.

const S = [];
const c = (item, qty) => ({ item, qty });
const st = (id, name, cat, w, h, cost, unlock, extra = {}) =>
  S.push({ id, name, cat, w, h, solid: true, cost, glint: 0, world: false, unlock, hp: 200, light: 0, countsToCap: false, place: { on: ['land'], needs: null }, ...extra });

// ---------------------------------------------------------------- 7.1 stations and utility
st('campfire', 'Campfire', 'station', 1, 1, [c('driftwood', 5), c('fieldstone', 3)], [], { light: 7, station: { inSlots: 1, fuel: false, outSlots: 1, queue: 5, speed: 1 } });
st('workbench', 'Workbench', 'station', 2, 1, [c('driftwood', 10), c('fieldstone', 6)], [], { station: { inSlots: 0, fuel: false, outSlots: 0, queue: 0, speed: 1, hand: true } });
st('workbench_2', "Fitter's Bench", 'station', 2, 1, [c('cindersteel_bar', 30), c('plank', 20), c('gear_part', 10)], ['beacon:3'], { station: { inSlots: 0, fuel: false, outSlots: 0, queue: 0, speed: 1, hand: true } });
st('workbench_3', 'Rime Bench', 'station', 2, 1, [c('rimesteel_bar', 40), c('prism_circuit', 10)], ['beacon:4'], { station: { inSlots: 0, fuel: false, outSlots: 0, queue: 0, speed: 1, hand: true } });
st('kiln', 'Clay Kiln', 'station', 2, 2, [c('fieldstone', 20), c('peat', 6)], ['level:2'], { light: 2, station: { inSlots: 3, fuel: true, outSlots: 1, queue: 20, speed: 1 } });
st('kiln_2', 'Blast Kiln', 'station', 2, 2, [c('brick', 40), c('iron_plate', 20), c('obsidian', 10)], ['beacon:2'], { light: 2, station: { inSlots: 3, fuel: true, outSlots: 1, queue: 20, speed: 2 } });
st('kiln_3', 'Rime Crucible', 'station', 2, 2, [c('prism_alloy', 60), c('flux_coil', 20), c('everice', 30)], ['beacon:4'], { light: 2, station: { inSlots: 3, fuel: true, outSlots: 1, queue: 20, speed: 4 } });
st('loom', 'Loom', 'station', 2, 1, [c('driftwood', 12), c('reedfiber', 10)], ['level:4'], { station: { inSlots: 2, fuel: false, outSlots: 1, queue: 20, speed: 1 } });
st('anvil', 'Anvil', 'station', 1, 1, [c('copper_bar', 15), c('fieldstone', 10)], ['level:6'], { station: { inSlots: 4, fuel: false, outSlots: 1, queue: 10, speed: 1 } });
st('anvil_2', 'Tempered Anvil', 'station', 1, 1, [c('cindersteel_bar', 30), c('magma_core', 4)], ['beacon:3'], { station: { inSlots: 4, fuel: false, outSlots: 1, queue: 10, speed: 1 } });
st('anvil_3', 'Umbral Anvil', 'station', 1, 1, [c('rimesteel_bar', 40), c('aurora_shard', 4)], ['beacon:5'], { station: { inSlots: 4, fuel: false, outSlots: 1, queue: 10, speed: 1 } });
st('cookpot', 'Cookpot', 'station', 1, 1, [c('copper_bar', 10), c('brick', 5)], ['level:8'], { station: { inSlots: 7, fuel: false, outSlots: 1, queue: 10, speed: 1 } });
st('still', 'Alchemy Still', 'station', 1, 1, [c('glass', 12), c('iron_bar', 8)], ['beacon:1'], { station: { inSlots: 3, fuel: false, outSlots: 1, queue: 10, speed: 1 } });
st('tempering_forge', 'Tempering Forge', 'station', 2, 2, [c('cindersteel_bar', 40), c('obsidian', 20), c('magma_core', 5)], ['beacon:2'], { light: 3 });
st('stockpile', 'Stockpile', 'storage', 1, 1, [c('plank', 12)], ['level:3'], { container: { slots: 24, shared: true } });
st('brine_locker', 'Brinelocker', 'storage', 2, 1, [c('plank', 30), c('iron_plate', 10)], ['skill:F3'], { container: { slots: 60, shared: true, colours: 8, network: true } });
st('hammock', 'Hammock', 'utility', 2, 1, [c('rope', 8), c('plank', 6)], ['level:5'], { solid: false, respawn: true });
st('lamp', 'Tide Lamp', 'utility', 1, 1, [c('copper_bar', 2), c('resin', 1)], ['level:6'], { light: 6, noSpawnRadius: 6 });
st('market_stall', 'Market Stall', 'utility', 2, 1, [c('plank', 20), c('rope', 10)], ['level:7']);
st('waystone', 'Waystone', 'utility', 1, 1, [c('brick', 20), { group: 'rare_plot_tier', qty: 4 }], ['skill:T3'], { world: true, channel: 2 });
st('wall', 'Palisade', 'defence', 1, 1, [c('plank', 2)], ['level:5'], { hp: 100 });
st('gate', 'Gate', 'defence', 1, 1, [c('plank', 4)], ['level:5'], { hp: 100, gate: true });
st('calling_shrine', 'Calling Shrine', 'utility', 2, 2, [c('brick', 30), c('copper_bar', 10), c('shell', 5)], ['level:10']);

// ---------------------------------------------------------------- 7.3 Beacons (W)
const WARDEN = ['thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir'];
const BEACON_COST = [
  [c('copper_bar', 150), c('plank', 150), c('brick', 150)],
  [c('iron_bar', 150), c('iron_plate', 60), c('rope', 40), c('pearl', 100)],
  [c('cindersteel_bar', 300), c('flux_coil', 60), c('obsidian', 150), c('magma_core', 90)],
  [c('prism_alloy', 500), c('prism_circuit', 80), c('glass', 200), c('amber', 100)],
  [c('rimesteel_bar', 1600), c('cryo_cell', 200), c('everice', 600), c('aurora_shard', 150)],
  [c('umbral_alloy', 3000), c('hollow_core', 300), c('nullsilt', 1000), c('echoglass', 150)],
];
// Attunement (all plots of biome k, every castaway line of biome k, every shrine of biome k) is checked by WP7 land.js.
const BIOME = ['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
const TROPHY = ['trophy_thornmother', 'trophy_regent', 'trophy_kilnheart', 'trophy_prismarch', 'trophy_antler', 'trophy_choir'];
for (let k = 1; k <= 6; k++) {
  st('beacon_' + k, 'Beacon ' + k, 'world', 3, 3, BEACON_COST[k - 1], [...(k > 1 ? ['beacon:' + (k - 1)] : []), 'boss:' + WARDEN[k - 1]],
    { world: true, hp: 0, light: 12, beacon: { k, biome: BIOME[k - 1], trophy: TROPHY[k - 1], attunement: true, xpWorld: 0.05 } });
}

// ---------------------------------------------------------------- 7.2 farming, fishing, passive producers
st('drip_collector', 'Drip Collector', 'farming', 1, 1, [c('plank', 8), c('rope', 4)], ['level:9'],
  { machine: { type: 'producer', flux: 0, item: 'salt', interval: 90, cond: 'shore', slots: 4 }, watersAdjacent: 4 });
st('sap_tap', 'Sap Tap', 'farming', 1, 1, [c('copper_bar', 4), c('rope', 2)], ['skill:H3'],
  { machine: { type: 'producer', flux: 0, item: 'resin', interval: 60, cond: 'tree', slots: 4 } });
st('creel', 'Creel', 'farming', 1, 1, [c('rope', 10), c('plank', 6)], ['level:12'],
  { machine: { type: 'producer', flux: 0, table: 'fish_common', interval: 180, cond: 'water', slots: 5 }, place: { on: ['water'], needs: null } });
st('sprinkler', 'Sprinkler', 'farming', 1, 1, [c('iron_bar', 6), c('gear_part', 2)], ['skill:H7'], { waters: 2 });
st('scarecrow', 'Scarecrow', 'farming', 1, 1, [c('plank', 6), c('cloth', 4)], ['skill:H7'], { protects: 3 });
st('hum_hive', 'Hum Hive', 'farming', 1, 1, [c('plank', 12), c('resin', 6)], ['beacon:1'],
  { machine: { type: 'producer', flux: 0, item: 'honeycomb', interval: 120, cond: 'crops4', slots: 4 }, cropAura: { radius: 3, v: 0.1 } });

// ---------------------------------------------------------------- 8.2 automation
const auto = (id, name, w, h, cost, unlock, machine, extra = {}) =>
  st(id, name, 'automation', w, h, cost, unlock, { machine, countsToCap: true, tend: true, ...extra });
auto('burrow_1', 'Scuttler Burrow I', 2, 2, [c('iron_plate', 12), c('gear_part', 20), c('plank', 30)], ['skill:F5'],
  { type: 'burrow', flux: 0, rate: 6, radius: 4, maxTier: 2, need: 4, slots: 12 });
auto('burrow_2', 'Scuttler Burrow II', 2, 2, [c('flux_coil', 20), c('iron_plate', 40), c('magma_core', 10)], ['skill:F5', 'beacon:2'],
  { type: 'burrow', flux: 4, rate: 16, radius: 6, maxTier: 4, need: 8, slots: 12 });
auto('burrow_3', 'Scuttler Burrow III', 2, 2, [c('cryo_cell', 20), c('prism_circuit', 40)], ['skill:F5', 'beacon:4'],
  { type: 'burrow', flux: 12, rate: 36, radius: 8, maxTier: 6, need: 12, slots: 12 });
auto('hopper', 'Hopper', 1, 1, [c('plank', 6), c('iron_plate', 2)], ['skill:F3', 'level:26'], { type: 'hopper', flux: 0, radius: 3, slots: 8 }, { countsToCap: false, tend: false });
auto('spillway', 'Spillway', 1, 1, [c('plank', 10), c('iron_plate', 4)], ['skill:F3', 'level:26'], { type: 'mover', flux: 0, interval: 3, filter: false }, { countsToCap: false, tend: false });
auto('sluice_1', 'Sluice I', 1, 1, [c('sluice_board', 1)], ['skill:F6', 'beacon:2'], { type: 'sluice', flux: 0, speed: 1 }, { countsToCap: false, tend: false, solid: false });
auto('sluice_2', 'Sluice II', 1, 1, [c('sluice_board', 1), c('iron_plate', 1)], ['skill:F6', 'beacon:3'], { type: 'sluice', flux: 0, speed: 2 }, { countsToCap: false, tend: false, solid: false });
auto('sluice_3', 'Sluice III', 1, 1, [c('sluice_board', 1), c('prism_alloy', 1)], ['skill:F9', 'beacon:4'], { type: 'sluice', flux: 0, speed: 4 }, { countsToCap: false, tend: false, solid: false });
auto('grabber', 'Grabber Arm', 1, 1, [c('flux_coil', 2), c('gear_part', 4)], ['skill:F6', 'beacon:2'], { type: 'mover', flux: 1, interval: 1.5, filter: false }, { countsToCap: false, tend: false });
auto('filter_grabber', 'Filter Arm', 1, 1, [c('grabber', 1), c('lens', 1)], ['skill:F6', 'beacon:3'], { type: 'mover', flux: 1, interval: 1.5, filter: true, filterSlots: 4 }, { countsToCap: false, tend: false });
auto('splitter', 'Splitter', 1, 1, [c('sluice_board', 4), c('gear_part', 2)], ['skill:F6', 'beacon:2'], { type: 'splitter', flux: 0 }, { countsToCap: false, tend: false });
auto('autobench_1', 'Autobench I', 2, 2, [c('iron_plate', 30), c('flux_coil', 10), c('gear_part', 20)], ['skill:F8', 'beacon:2'],
  { type: 'autobench', flux: 5, maxTier: 3, speed: 0.5, inSlots: 6, outSlots: 2 });
auto('autobench_2', 'Autobench II', 2, 2, [c('prism_circuit', 20), c('cindersteel_bar', 30)], ['skill:F8', 'beacon:3'],
  { type: 'autobench', flux: 10, maxTier: 5, speed: 1, inSlots: 6, outSlots: 2 });
auto('autobench_3', 'Autobench III', 2, 2, [c('hollow_core', 15), c('rimesteel_bar', 40)], ['skill:F12', 'beacon:5'],
  { type: 'autobench', flux: 25, maxTier: 7, speed: 2, inSlots: 6, outSlots: 2 });
auto('drill', 'Lodestone Drill', 2, 2, [c('prism_circuit', 30), c('rimesteel_bar', 40), c('cryo_cell', 10)], ['skill:F11', 'beacon:4'],
  { type: 'drill', flux: 15, rate: 10, rareShare: 0.01, perPlot: 6 }, { place: { on: ['vein'], needs: null } });
auto('tiller_bot', 'Tiller Bot', 1, 1, [c('prism_circuit', 10), c('iron_plate', 20)], ['skill:H11', 'beacon:3'], { type: 'tiller', flux: 6, radius: 2, interval: 2 });
auto('trawl_buoy', 'Trawl Buoy', 1, 1, [c('flux_coil', 15), c('rope', 30), c('glass', 10)], ['beacon:3'],
  { type: 'producer', flux: 5, table: 'fish_common', interval: 15, cond: 'water', slots: 8 }, { place: { on: ['water'], needs: null } });
auto('gull_roost', 'Gull Roost', 2, 2, [c('cryo_cell', 20), c('cloth', 30), c('prism_circuit', 20)], ['skill:F9', 'beacon:4'], { type: 'courier', flux: 10, gulls: 4, carry: 16, speed: 8 });
auto('ledger_post', 'Ledger Post', 1, 1, [c('prism_circuit', 20), c('cryo_cell', 10)], ['skill:G9', 'beacon:5'], { type: 'seller', flux: 5, rate: 20, pct: 0.7 }, { glint: 500 });
auto('mint', 'Mint', 2, 2, [c('rimesteel_bar', 40), c('cryo_cell', 20)], ['skill:G9', 'beacon:5'], { type: 'seller', flux: 15, rate: 30, pct: 0.6, satKey: 'mint' });
auto('echo_chamber', 'Echo Chamber', 3, 3, [c('hollow_core', 30), c('umbral_alloy', 100)], ['skill:F12', 'beacon:5'], { type: 'echo', flux: 40, interval: 1200 });

// ---------------------------------------------------------------- 8.3 Flux generators
const gen = (id, name, w, h, cost, unlock, flux, fuelPer10s, cond, extra = {}) =>
  st(id, name, 'flux', w, h, cost, unlock, { machine: { type: 'generator', flux, fuelPer10s, cond }, countsToCap: true, tend: true, ...extra });
gen('tide_wheel', 'Tide Wheel', 2, 2, [c('plank', 20), c('iron_plate', 10), c('flux_coil', 4)], ['skill:F7', 'beacon:2'], 5, 0, 'shore', { tideBonus: { flux: 10, window: 60 }, place: { on: ['shore'], needs: null } });
gen('ember_boiler', 'Ember Boiler', 2, 2, [c('cindersteel_bar', 30), c('flux_coil', 10), c('brick', 20)], ['skill:F7', 'beacon:2'], 20, 1, 'none');
gen('prism_array', 'Prism Array', 2, 2, [c('prism_circuit', 10), c('glass', 20)], ['skill:F7', 'beacon:3'], 30, 0, 'day');
gen('rime_turbine', 'Rime Turbine', 2, 2, [c('cryo_cell', 10), c('rimesteel_bar', 30)], ['skill:F7', 'beacon:4'], 40, 0, 'hoarfrost', { blizzardMult: 1.5, place: { on: ['land'], needs: 'hoarfrost' } });
gen('umbral_reactor', 'Umbral Reactor', 2, 2, [c('hollow_core', 20), c('umbral_alloy', 60)], ['skill:F12', 'beacon:5'], 150, 0, 'echoglass', { consumes: { item: 'echoglass', qty: 1, every: 600 } });

// ---------------------------------------------------------------- 8.4 defence
st('bolt_turret', 'Bolt Turret', 'defence', 1, 1, [c('flux_coil', 10), c('iron_plate', 20)], ['skill:C7', 'beacon:3'],
  { machine: { type: 'turret', flux: 2, range: 9, dmg: 40, rate: 2, chain: 0, dmgPerPlotTier: true }, countsToCap: true, tend: true });
st('spike_trap', 'Spike Trap', 'defence', 1, 1, [c('iron_bar', 6)], ['skill:C7'], { solid: false, trap: { dmg: 25, rearm: 2 } });
st('arc_spire', 'Arc Spire', 'defence', 1, 1, [c('cryo_cell', 10), c('prism_circuit', 20)], ['skill:C11', 'beacon:5'],
  { machine: { type: 'turret', flux: 8, range: 8, dmg: 400, rate: 1 / 1.5, chain: 4 }, countsToCap: true, tend: true });

// ---------------------------------------------------------------- world-generated (natural) structures and placeables
const nat = (id, name, w, h, extra = {}) => st(id, name, 'world', w, h, [], [], { natural: true, world: true, hp: 0, ...extra });
nat('tidestone', 'Tidestone', 2, 2, { light: 4 });
nat('archive', 'The Archive', 4, 3);
nat('tide_board', 'Tide Board', 1, 1);
nat('gate_site', 'Tidegate Site', 6, 4);
nat('arena', 'Warden Altar', 3, 3);
nat('vault_entrance', 'Vault Entrance', 3, 2);
nat('trench_entrance', 'The Trench', 3, 3, { solid: false, unlock: ['beacon:3'] });
nat('shrine', 'Puzzle Shrine', 3, 3);
nat('dig_spot', 'Dig Spot', 1, 1, { solid: false, hits: 10 });
st('sapling', 'Worldseed Sapling', 'decor', 1, 1, [], [], { natural: true, personal: true });

// ---------------------------------------------------------------- 18.1 Tidegate stages (W, delivered at gate_site)
// coopScale applies to items and Glint, not to moonpetal or the wing/Trench requirements.
export const TIDEGATE_STAGES = Object.freeze([
  { stage: 1, name: 'Foundation', cost: [c('brick', 5000), c('plank', 3000), c('iron_plate', 2000)], glint: 0, wings: 4, trench: 0 },
  { stage: 2, name: 'Frame', cost: [c('cindersteel_bar', 2500), c('prism_alloy', 1500), c('flux_coil', 600)], glint: 0, wings: 4, trench: 0 },
  { stage: 3, name: 'Lensworks', cost: [c('lens', 400), c('prism_circuit', 300), c('glass', 2000)], glint: 0, wings: 6, trench: 0 },
  { stage: 4, name: 'Cold Heart', cost: [c('cryo_cell', 250), c('rimesteel_bar', 2000), c('everice', 500)], glint: 0, wings: 6, trench: 0 },
  { stage: 5, name: 'Hollow Crown', cost: [c('hollow_core', 200), c('umbral_alloy', 2500), c('gloom_heart', 100), c('moonpetal', 20)], glint: 250000, wings: 8, trench: 10, unscaled: ['moonpetal'] },
].map((s) => ({ ...s, unlock: ['beacon:6'], xpEach: 150000, machineSpeedWorld: 0.1 })));

export default S;
