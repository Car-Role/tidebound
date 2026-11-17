// Recipes (DESIGN 6.2-6.5, 12.2, A.6).
// { id, out:{item, qty}, in:[{item|group, qty}], fuel (Kiln recipes only, explicit, 0 allowed), station, time, unlock:[] }
// station: 'hand' or a structure id. A recipe can be made at its station or any higher station of the same chain
// (STATION_TIERS); higher Kilns divide time by their speed.
// Kiln first-match: a Kiln runs the first recipe in data order whose inputs are all present, so multi-input
// recipes (Ballast, alloys) are listed before the simple ones that share an input.
import FISH from './fish.js';
import CROPS from './crops.js';

// 'any wood' style inputs. Each group maps item -> output multiplier (tier k wood gives k planks; tier k fiber gives k cloth).
// Groups with every multiplier 1 are plain "any of" groups.
export const GROUPS = {
  wood: { driftwood: 1, stiltwood: 2, ashwood: 3, spinewood: 4, palewood: 5, gloomwood: 6 },
  any_wood: { driftwood: 1, stiltwood: 1, ashwood: 1, spinewood: 1, palewood: 1, gloomwood: 1 },
  fiber: { reedfiber: 1, kelp: 2, ashgrass: 3, needlesilk: 4, frostmoss: 5, inkweed: 6 },
  mob_t12: { chitin: 1, fen_slime: 1 },
  fish_any: Object.fromEntries(FISH.map((f) => [f.id, 1])),
  fish_t2: Object.fromEntries(FISH.filter((f) => f.tier === 2).map((f) => [f.id, 1])),
  fish_t3: Object.fromEntries(FISH.filter((f) => f.tier === 3).map((f) => [f.id, 1])),
  fish_t6: Object.fromEntries(FISH.filter((f) => f.tier === 6).map((f) => [f.id, 1])),
  fish_legendary: Object.fromEntries(FISH.filter((f) => f.rarity === 'legendary').map((f) => [f.id, 1])),
  dish: { roast_berries: 1, grilled_fish: 1, reed_bread: 1, fen_stew: 1, ember_curry: 1, glass_noodles: 1, frost_sorbet: 1, ink_broth: 1, tidewright_feast: 1 },
  tonic: { tonic_haste: 1, tonic_stone: 1, tonic_fortune: 1, tonic_surge: 1 },
  // "4 rare of the plot's tier" (Waystone): resolved by the building system to the rare of the plot's biome tier
  rare_plot_tier: { shell: 1, pearl: 1, magma_core: 1, amber: 1, aurora_shard: 1, echoglass: 1 },
};
for (let t = 1; t <= 6; t++) GROUPS['crop_t' + t] = Object.fromEntries(CROPS.filter((c) => c.tier === t).map((c) => [c.id, 1]));
// Groups whose member is chosen by context rather than by the player.
export const DYNAMIC_GROUPS = Object.freeze({ rare_plot_tier: 'plot_tier' });

// A recipe for station X may run at any station later in X's chain.
export const STATION_TIERS = Object.freeze({
  workbench: ['workbench', 'workbench_2', 'workbench_3'],
  kiln: ['kiln', 'kiln_2', 'kiln_3'],
  anvil: ['anvil', 'anvil_2', 'anvil_3'],
});
export const STATION_SPEED = Object.freeze({ kiln: 1, kiln_2: 2, kiln_3: 4 });

const R = [];
const r = (id, out, qty, inputs, station, time, extra = {}) => R.push({ id, out: { item: out, qty }, in: inputs, station, time, unlock: [], ...extra });
const i = (item, qty) => ({ item, qty });
const g = (group, qty) => ({ group, qty });
const kiln = (id, out, qty, inputs, fuel, station, time) => r(id, out, qty, inputs, station, time, { fuel });

// ---------------------------------------------------------------- Kiln (data order = first-match order)
kiln('r_ballast_1', 'ballast_1', 1, [i('fieldstone', 3), i('copper_bar', 1)], 1, 'kiln', 6);
kiln('r_ballast_2', 'ballast_2', 1, [i('clay', 3), i('iron_bar', 1)], 1, 'kiln', 6);
kiln('r_ballast_3', 'ballast_3', 1, [i('obsidian', 3), i('cindersteel_bar', 1)], 1, 'kiln_2', 6);
kiln('r_ballast_4', 'ballast_4', 1, [i('sunsand', 3), i('prism_alloy', 1)], 1, 'kiln_2', 6);
kiln('r_ballast_5', 'ballast_5', 1, [i('everice', 3), i('rimesteel_bar', 1)], 1, 'kiln_3', 6);
kiln('r_umbral_alloy', 'umbral_alloy', 1, [i('umbrite_ore', 2), i('nullsilt', 1)], 6, 'kiln_3', 24);
kiln('r_rimesteel_bar', 'rimesteel_bar', 1, [i('rime_ore', 2), i('everice', 1)], 4, 'kiln_3', 20);
kiln('r_prism_alloy', 'prism_alloy', 1, [i('prismite_ore', 2), i('glass', 1)], 3, 'kiln_2', 16);
kiln('r_cindersteel_bar', 'cindersteel_bar', 1, [i('cinderite_ore', 2), i('iron_bar', 1)], 2, 'kiln_2', 12);
kiln('r_iron_bar', 'iron_bar', 1, [i('bog_iron_ore', 2)], 1, 'kiln', 8);
kiln('r_copper_bar', 'copper_bar', 1, [i('copper_ore', 2)], 1, 'kiln', 4);
kiln('r_glass', 'glass', 1, [i('sand', 2)], 1, 'kiln', 4);
kiln('r_glass_sunsand', 'glass', 2, [i('sunsand', 1)], 1, 'kiln', 4);
kiln('r_glass_gourd', 'glass', 2, [i('glassgourd', 1)], 1, 'kiln', 4);
kiln('r_brick', 'brick', 1, [i('fieldstone', 2)], 1, 'kiln', 4);
kiln('r_brick_clay', 'brick', 1, [i('clay', 1)], 1, 'kiln', 4);
kiln('r_charcoal', 'charcoal', 1, [g('any_wood', 2)], 0, 'kiln', 4);

// ---------------------------------------------------------------- Workbench, Loom (6.2, 6.3)
r('r_plank', 'plank', 1, [g('wood', 2)], 'workbench', 2);
r('r_gear_part', 'gear_part', 2, [i('copper_bar', 1)], 'workbench', 2);
r('r_sluice_board', 'sluice_board', 1, [i('plank', 2), i('resin', 1)], 'workbench', 3);
r('r_lens', 'lens', 2, [i('glass', 2), i('amber', 1)], 'workbench_2', 4);
r('r_prism_circuit', 'prism_circuit', 1, [i('prism_alloy', 1), i('lens', 1), i('flux_coil', 1)], 'workbench_2', 6);
r('r_cryo_cell', 'cryo_cell', 1, [i('rimesteel_bar', 2), i('everice', 2), i('aurora_shard', 1)], 'workbench_3', 8);
r('r_hollow_core', 'hollow_core', 1, [i('umbral_alloy', 2), i('echoglass', 1), i('cryo_cell', 1), i('prism_circuit', 1)], 'workbench_3', 10);
r('r_rope', 'rope', 1, [i('reedfiber', 3)], 'loom', 3);
// WP14 (BUILD_REVIEW P0-1): a slower hand-twist at the Workbench so the tier-1 weapon does not need the Loom (level 4).
r('r_rope_hand', 'rope', 1, [i('reedfiber', 4)], 'workbench', 4);
r('r_rope_kelp', 'rope', 1, [i('kelp', 2)], 'loom', 3);
r('r_cloth', 'cloth', 1, [g('fiber', 4)], 'loom', 5);
r('r_leather', 'leather', 1, [g('mob_t12', 2), i('salt', 1)], 'loom', 5);
// Anvil components
r('r_nail', 'nail', 4, [i('iron_bar', 1)], 'anvil', 3);
r('r_iron_plate', 'iron_plate', 1, [i('iron_bar', 2)], 'anvil', 4);
r('r_flux_coil', 'flux_coil', 1, [i('cindersteel_bar', 2), i('copper_bar', 1), i('brimstone', 1)], 'anvil', 6);

// ---------------------------------------------------------------- gear (6.4): Anvil tier 1-3, Anvil II 4-5, Anvil III 6-7
const anvilFor = (tier) => (tier <= 3 ? 'anvil' : tier <= 5 ? 'anvil_2' : 'anvil_3');
const BAR = [null, 'copper_bar', 'iron_bar', 'cindersteel_bar', 'prism_alloy', 'rimesteel_bar', 'umbral_alloy'];
const WOOD = [null, 'driftwood', 'stiltwood', 'ashwood', 'spinewood', 'palewood', 'gloomwood'];
const FIBER = [null, 'reedfiber', 'kelp', 'ashgrass', 'needlesilk', 'frostmoss', 'inkweed'];
const RARE = [null, 'shell', 'pearl', 'magma_core', 'amber', 'aurora_shard', 'echoglass'];
const MOB = [null, 'chitin', 'fen_slime', 'ember_scale', 'mirage_dust', 'frost_pelt', 'gloom_heart'];
const HOOK_BARS = [null, null, 12, 16, 20, 24, 28, 32];
for (let k = 2; k <= 7; k++) {
  r('r_hook_' + k, 'hook_' + k, 1, [i(BAR[k - 1], HOOK_BARS[k]), i(k === 2 ? 'plank' : WOOD[k - 1], 6), i(RARE[k - 1], 2), i('vault_core_' + (k - 1), 1)], anvilFor(k), 6 + 2 * k);
}
for (const w of ['blade', 'bow', 'staff']) {
  // Tier 1 at the Workbench (DESIGN 23 onboarding: "Build Workbench. Craft Blade."); see INTEGRATION_NOTES.
  r('r_' + w + '_1', w + '_1', 1, [i('driftwood', 6), i('fieldstone', 4), i('rope', 2)], 'workbench', 6);
  for (let k = 1; k <= 6; k++) {
    r('r_' + w + '_' + (k + 1), w + '_' + (k + 1), 1, [i(BAR[k], 10 + 5 * k), i(MOB[k], 8), i(RARE[k], 1)], anvilFor(k + 1), 8 + 2 * k);
  }
}
for (let k = 1; k <= 6; k++) {
  for (const slot of ['helm', 'coat', 'boots']) {
    r('r_' + slot + '_' + k, slot + '_' + k, 1, [i(BAR[k], 6 + 3 * k), i(FIBER[k], 10), i(MOB[k], 5)], anvilFor(k), 8 + 2 * k);
  }
  // Vault keys (13.1, A.6): 10 bar of tier k + 2 rare of tier k (shell for k = 1); Anvil 1-3, Anvil II 4-5, Anvil III 6
  r('r_vault_key_' + k, 'vault_key_' + k, 1, [i(BAR[k], 10), i(RARE[k], 2)], anvilFor(k), 8);
}
// Rods, packs, lanterns (A.6)
r('r_rod_1', 'rod_1', 1, [i('driftwood', 4), i('rope', 2)], 'workbench', 4);
r('r_rod_2', 'rod_2', 1, [i('iron_bar', 8), i('rope', 4), i('gear_part', 2)], 'anvil', 8);
r('r_rod_3', 'rod_3', 1, [i('prism_alloy', 8), i('needlesilk', 6), i('lens', 1)], 'anvil_2', 10);
r('r_rod_4', 'rod_4', 1, [i('umbral_alloy', 8), i('inkweed', 6), i('echoglass', 1)], 'anvil_3', 12);
r('r_pack_1', 'pack_1', 1, [i('cloth', 6), i('rope', 4)], 'loom', 6);
r('r_pack_2', 'pack_2', 1, [i('leather', 8), i('kelp', 6)], 'loom', 6);
r('r_pack_3', 'pack_3', 1, [i('cloth', 10), i('ashgrass', 10), i('ember_scale', 4)], 'loom', 6);
r('r_pack_4', 'pack_4', 1, [i('cloth', 12), i('needlesilk', 12), i('mirage_dust', 4)], 'loom', 6);
r('r_pack_5', 'pack_5', 1, [i('cloth', 14), i('frostmoss', 14), i('frost_pelt', 4)], 'loom', 6);
r('r_lantern_1', 'lantern_1', 1, [i('copper_bar', 4), i('glass', 2), i('resin', 1)], 'workbench', 4);
r('r_lantern_2', 'lantern_2', 1, [i('prism_alloy', 6), i('lens', 2), i('amber', 1)], 'workbench_2', 6);

// ---------------------------------------------------------------- consumables (6.5)
r('r_roast_berries', 'roast_berries', 1, [i('marrowberry', 3)], 'campfire', 4);
r('r_grilled_fish', 'grilled_fish', 1, [g('fish_any', 1)], 'campfire', 4);
r('r_reed_bread', 'reed_bread', 1, [i('tidewheat', 2), i('salt', 1)], 'cookpot', 6);
r('r_fen_stew', 'fen_stew', 1, [g('fish_t2', 1), i('mudroot', 2), i('kelp', 1)], 'cookpot', 6, { unlock: ['quest:s_odalys_3'] });
r('r_ember_curry', 'ember_curry', 1, [i('scorchpepper', 2), g('fish_t3', 1), i('salt', 1)], 'cookpot', 6, { unlock: ['quest:s_ashka_3'] });
r('r_glass_noodles', 'glass_noodles', 1, [i('needlesilk', 2), i('sunmelon', 1)], 'cookpot', 6);
r('r_frost_sorbet', 'frost_sorbet', 1, [i('everice', 2), i('snowberry', 2)], 'cookpot', 6);
r('r_ink_broth', 'ink_broth', 1, [i('inkcap', 1), g('fish_t6', 1)], 'cookpot', 6);
r('r_tidewright_feast', 'tidewright_feast', 1, [1, 2, 3, 4, 5, 6].map((t) => g('crop_t' + t, 1)).concat([g('fish_legendary', 1)]), 'cookpot', 10);
r('r_tonic_haste', 'tonic_haste', 1, [i('kelp', 2), i('brimstone', 1)], 'still', 8);
r('r_tonic_stone', 'tonic_stone', 1, [i('obsidian', 2), i('fen_slime', 1)], 'still', 8);
r('r_tonic_fortune', 'tonic_fortune', 1, [i('pearl', 1), i('amber', 1)], 'still', 8);
r('r_tonic_surge', 'tonic_surge', 1, [i('inkweed', 2), i('salt', 1)], 'still', 8);
r('r_bandage', 'bandage', 1, [i('cloth', 2)], 'hand', 2);
r('r_bomb', 'bomb', 1, [i('brimstone', 2), i('clay', 1)], 'workbench', 3);
// Lures (12.2), Cookpot
r('r_lure_1', 'lure_1', 1, [i('marrowberry', 10), i('resin', 10), i('chitin', 5)], 'cookpot', 10);
r('r_lure_2', 'lure_2', 1, [i('fen_slime', 12), g('fish_t2', 5), i('pearl', 2)], 'cookpot', 10);
r('r_lure_3', 'lure_3', 1, [i('ember_scale', 15), i('charcoal', 20), i('magma_core', 2)], 'cookpot', 10);
r('r_lure_4', 'lure_4', 1, [i('mirage_dust', 20), i('lens', 10)], 'cookpot', 10);
r('r_lure_5', 'lure_5', 1, [i('frost_pelt', 20), i('cryo_cell', 10)], 'cookpot', 10);
r('r_lure_6', 'lure_6', 1, [i('gloom_heart', 20), i('hollow_core', 5)], 'cookpot', 10);
// Seeds (A.6): 1 crop -> 2 seeds at the Workbench
for (const c of CROPS) r('r_' + c.seed, c.seed, 2, [i(c.id, 1)], 'workbench', 2);
// Placeable grabber item used by filter_grabber's cost (WP2 fill-in; same inputs and unlock as the structure)
r('r_grabber', 'grabber', 1, [i('flux_coil', 2), i('gear_part', 4)], 'anvil', 4, { unlock: ['skill:F6', 'beacon:2'] });

export default R;
