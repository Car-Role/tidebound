// Weather (DESIGN 4.6). dur: [min, max] seconds before the next re-roll. mods apply to players in the biome.
// params: numeric effects read by the owning systems (clock, machines, farming, fishing, nodes, mobs).
const m = (stat, v) => ({ stat, op: 'add', v });

export default [
  { id: 'clear', name: 'Clear', biomes: [1, 2, 3, 4, 5, 6], dur: [360, 600], mods: [], flags: [], params: {}, fx: null, sfx: null },
  { id: 'rain', name: 'Rain', biomes: [1, 2, 6], dur: [360, 600], mods: [m('fishBite', -0.25)], flags: ['wet'], params: { fireDmg: -0.2 }, fx: 'rain', sfx: 'amb_rain' },
  { id: 'storm', name: 'Storm', biomes: [1, 2, 3, 6], dur: [360, 600], mods: [], flags: ['lightning', 'wet', 'storm_fish'], params: { lightningEvery: 8, lightningDropMult: 2, tideWheelFlux: 1.5 }, fx: 'storm_rain', sfx: 'amb_storm' },
  { id: 'fog', name: 'Fog', biomes: [2, 5, 6], dur: [360, 600], mods: [], flags: ['low_visibility', 'ambush_x2', 'dig_glow'], params: { viewRadius: 7, ambushMult: 2 }, fx: 'fog_bank', sfx: 'amb_fog' },
  { id: 'ashfall', name: 'Ashfall', biomes: [3], dur: [360, 600], mods: [m('moveSpeed', -0.1), m('kilnSpeed', 0.2)], flags: [], params: { nodeYield: { ashwood_tree: 0.5 }, outdoorsOnly: true }, fx: 'ashfall', sfx: 'amb_ash' },
  { id: 'heatwave', name: 'Heatwave', biomes: [4], dur: [360, 600], mods: [], flags: ['mirage_spawns'], params: { prismArrayFlux: 1.5, cropWater: 2 }, fx: 'heat_shimmer', sfx: 'amb_heat' },
  { id: 'blizzard', name: 'Blizzard', biomes: [5], dur: [360, 600], mods: [], flags: ['chill_meter'], params: { chillAfter: 40, chillDps: 3, nodeYield: { everice_block: 0.5 }, rimeTurbineFlux: 1.5 }, fx: 'blizzard', sfx: 'amb_wind' },
  { id: 'eclipse', name: 'Eclipse', biomes: [6], dur: [360, 600], mods: [m('xpMult', 0.5)], flags: ['elites_guaranteed'], params: { tokenChanceMult: 3, nightChanceAnywhere: 0.05 }, fx: 'eclipse_motes', sfx: 'amb_eclipse' },
  { id: 'king_tide', name: 'King Tide', biomes: [1, 2, 3, 4, 5, 6], dur: [240, 240], mods: [], flags: ['king_tide'], params: { everyDays: 3, lowTide: 240, cacheMult: 4, secondRing: true, overlay: true }, fx: 'tide_out', sfx: 'amb_surf' },
];
