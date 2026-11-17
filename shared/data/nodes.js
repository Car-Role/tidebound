// Resource nodes (DESIGN 4.5). hp by tier: T1 3, T2 7, T3 16, T4 36, T5 80, T6 176 (large variants x3 HP, x3 drops).
// hits: fixed number of hits instead of HP (plants). drops: {item, min, max, p?}. weight: spawn weight in the biome table (WP2 fill-in).
// Tidal and gem nodes have tier:'biome' (they take the tier of the biome they spawn in); special drops are described by
// rareOfTier / rawOfTier / glintPerTier / tokenChance; xpPerTier multiplies by that tier.

export const NODE_HP = Object.freeze({ 1: 3, 2: 7, 3: 16, 4: 36, 5: 80, 6: 176 });
const BIOMES = [null, 'greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
const FX = {
  wood: { hit: 'hit_wood', brk: 'break_wood' }, stone: { hit: 'hit_stone', brk: 'break_stone' }, ore: { hit: 'hit_stone', brk: 'break_stone' },
  plant: { hit: 'hit_plant', brk: 'break_plant' }, tidal: { hit: 'hit_stone', brk: 'break_stone' }, gem: { hit: 'hit_stone', brk: 'break_crystal' },
};
const SFX = { wood: 'tap_wood', stone: 'tap_stone', ore: 'tap_stone', plant: 'tap_plant', tidal: 'tap_stone', gem: 'tap_stone' };
const WEIGHT = { wood: 14, stone: 12, ore: 10, plant: 10 };
const d = (item, min, max = min, p) => (p == null ? { item, min, max } : { item, min, max, p });

const N = [];
const node = (id, tier, cls, drops, xp, extra = {}) => {
  let fx = FX[cls];
  if (tier === 5 && cls !== 'plant') fx = { hit: 'hit_ice', brk: cls === 'stone' ? 'break_crystal' : fx.brk };
  if (tier === 6) fx = { hit: 'hit_null', brk: fx.brk };
  N.push({ id, biome: BIOMES[tier], tier, hp: NODE_HP[tier], hits: null, cls, drops, xp, weight: WEIGHT[cls], big: 0.08, fx, sfx: SFX[cls], ...extra });
};

// Greenmarrow (T1)
node('bentwood_tree', 1, 'wood', [d('driftwood', 2, 3), d('resin', 1, 1, 0.2)], 4);
node('fieldstone_rock', 1, 'stone', [d('fieldstone', 2, 3), d('peat', 1, 1, 0.25)], 4);
// WP14 (BUILD_REVIEW P1-3): copper is the first bottleneck (Kiln, gear parts, Ballast I); weight 10 -> 17.
node('copper_vein', 1, 'ore', [d('copper_ore', 2), d('fieldstone', 1)], 6, { weight: 17 });
node('reed_clump', 1, 'plant', [d('reedfiber', 1, 2)], 2, { hits: 1 });
node('marrowberry_bush', 1, 'plant', [d('marrowberry', 1, 2)], 2, { hits: 1, weight: 6 });
node('peat_mound', 1, 'stone', [d('peat', 2, 3)], 4, { weight: 8 });
// Saltfen (T2)
node('stiltwood_tree', 2, 'wood', [d('stiltwood', 2, 3), d('resin', 1, 1, 0.2)], 10);
node('clay_bank', 2, 'stone', [d('clay', 2, 3)], 10);
node('bogiron_vein', 2, 'ore', [d('bog_iron_ore', 2)], 14);
// "Saltfen grass drops" is the mudroot seed source; Saltfen's only grass-like node is kelp (WP2 fill-in: 5%).
node('kelp_tangle', 2, 'plant', [d('kelp', 2), d('seed_mudroot', 1, 1, 0.05)], 5, { hits: 2 });
node('salt_pan', 2, 'stone', [d('salt', 2)], 10, { weight: 8 });
// Emberreach (T3)
node('ashwood_tree', 3, 'wood', [d('ashwood', 2, 3), d('charcoal', 1, 1, 0.3), d('seed_cindercap', 1, 1, 0.05)], 18);
node('obsidian_spire', 3, 'stone', [d('obsidian', 2, 3)], 18);
node('cinderite_vein', 3, 'ore', [d('cinderite_ore', 2)], 25);
node('brimstone_vent', 3, 'stone', [d('brimstone', 2)], 18);
node('ashgrass_tuft', 3, 'plant', [d('ashgrass', 2)], 9, { hits: 2 });
// Glasswaste (T4)
node('spinewood_cactus', 4, 'wood', [d('spinewood', 2, 3), d('needlesilk', 1)], 26);
node('sunsand_dune', 4, 'stone', [d('sunsand', 3)], 26);
node('prismite_vein', 4, 'ore', [d('prismite_ore', 2)], 36);
node('needlesilk_bloom', 4, 'plant', [d('needlesilk', 2)], 13, { hits: 2 });
// Hoarfrost (T5)
node('palewood_pine', 5, 'wood', [d('palewood', 2, 3), d('seed_pinecone_pale', 1, 1, 0.05)], 38);
node('everice_block', 5, 'stone', [d('everice', 2, 3)], 38);
node('rime_vein', 5, 'ore', [d('rime_ore', 2)], 52);
node('frostmoss_patch', 5, 'plant', [d('frostmoss', 2)], 19, { hits: 2 });
// Umbral (T6)
node('gloomwood_tree', 6, 'wood', [d('gloomwood', 2, 3)], 54);
node('nullsilt_heap', 6, 'stone', [d('nullsilt', 3)], 54);
node('umbrite_vein', 6, 'ore', [d('umbrite_ore', 2)], 75);
node('inkweed_frond', 6, 'plant', [d('inkweed', 2)], 27, { hits: 2 });

// Tidal nodes: any tidal flat, tier of the biome; spawn only at low tide (1 per 10 s per plot, cap 8)
const tidal = (id, drops, extra) => N.push({ id, biome: 'tidal', tier: 'biome', hp: null, hits: null, cls: 'tidal', drops, xp: 0, weight: 48, big: 0, fx: FX.tidal, sfx: SFX.tidal, ...extra });
tidal('tide_shellbed', [d('shell', 2), d('pearl', 1, 1, 0.03)], { xpPerTier: 3 });
tidal('tide_sandbar', [d('sand', 3)], { xpPerTier: 3 });
tidal('tide_cache', [], { hits: 1, weight: 4, xpPerTier: 10, glintPerTier: [5, 15], rawOfTier: 1, tokenChance: 0.05, fx: { hit: 'hit_wood', brk: 'chest_open' } });
// Gem nodes: replace 3% of normal spawns in every biome (6% on the plot a Prospector stands on); x2 HP of the biome tier
N.push({ id: 'gem_node', biome: 'any', tier: 'biome', hp: null, hpMult: 2, hits: null, cls: 'gem', drops: [], rareOfTier: 1, xp: 0, xpPerTier: 10, weight: 0, big: 0, fx: FX.gem, sfx: SFX.gem, idleFx: 'gem_sparkle' });
// Crystal growths inside Vaults give the tier's ore and rares (13.1)
N.push({ id: 'vault_crystal', biome: 'vault', tier: 'biome', hp: null, hits: null, cls: 'gem', drops: [], oreOfTier: [2, 3], rareOfTier: 0.1, xp: 0, xpPerTier: 6, weight: 0, big: 0, fx: FX.gem, sfx: SFX.gem });

// Rare of each tier given by gem nodes (T1 gives glintstone).
export const GEM_RARE = Object.freeze({ 1: 'glintstone', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' });
export const TIDAL_SHARES = Object.freeze({ cachePct: 0.04 });

export default N;
