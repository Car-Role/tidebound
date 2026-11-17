// Quests (DESIGN 16): 24 main (world, auto-tracked), 33 side (per player; a line counts for the Beacon as soon as any
// player finishes it), 8 Tide Board templates. Goal: { kind, target?, n, ...filters }. target: id or array of ids (any of).
// Goal kinds per registries.QUEST_GOAL_KINDS. reach targets: level | flux | trench | tidegate.
// Board templates use formulas in k (highest unlocked tier): n = {base, perK}; rewards {perPow2} = value * 2^k.

const Q = [];
const main = (n, id, name, goals, rewards) => Q.push({ id, type: 'main', n, name, giver: null, prereq: n === 1 ? null : 'q' + String(n - 1).padStart(2, '0'), goals, rewards: { glint: 0, xp: 0, items: [], ...rewards } });
const G = (kind, target, n = 1, extra = {}) => ({ kind, target, n, ...extra });

main(1, 'q01', 'Dry Land', [G('build', 'workbench'), G('build', 'kiln')], { glint: 60, xp: 50, capExempt: true });
main(2, 'q02', 'The Tidestone Wakes', [G('raise', null, 1)], { glint: 15, items: [{ item: 'tide_token', qty: 1 }] });
main(3, 'q03', 'Something Below', [G('clear', 'rootbound_vault')], { xp: 300, showRecipes: ['r_hook_2'] });
main(4, 'q04', 'First Light', [G('kill', 'thornmother'), G('build', 'beacon_1')], { glint: 25, xp: 1000 });
main(5, 'q05', 'West Wind', [G('raise', null, 3, { biome: 'saltfen' })], { glint: 30 });
main(6, 'q06', 'Little Helpers', [G('build', ['burrow_1', 'burrow_2', 'burrow_3'])], { xp: 2000, items: [{ item: 'iron_plate', qty: 10 }] });
main(7, 'q07', 'The Cistern', [G('clear', 'sunken_cistern')], { xp: 4000 });
main(8, 'q08', 'Second Light', [G('kill', 'mire_regent'), G('build', 'beacon_2')], { glint: 75, xp: 8000 });
main(9, 'q09', 'Where the Sea Boils', [G('raise', null, 3, { biome: 'emberreach' })], { glint: 85 });
main(10, 'q10', 'Let It Flow', [G('counter', 'sluice_items', 200)], { xp: 12000, items: [{ item: 'sluice_board', qty: 20 }] });
main(11, 'q11', 'Slag and Cinder', [G('clear', 'slagworks')], { xp: 20000 });
main(12, 'q12', 'Third Light', [G('kill', 'kilnheart'), G('build', 'beacon_3')], { glint: 250, xp: 40000 });
// DESIGN prints "Raise 300 Glasswaste plots | 3,000 G": Glasswaste has 15 plots and PACING totals 14,140 main-quest Glint,
// which only adds up with 3 plots and 300 G (digits swapped). See INTEGRATION_NOTES.
main(13, 'q13', 'The Bright Wastes', [G('raise', null, 3, { biome: 'glasswaste' })], { glint: 300 });
main(14, 'q14', 'Hands Off', [G('counter', 'autobench_crafts', 100)], { xp: 30000, items: [{ item: 'prism_circuit', qty: 5 }] });
main(15, 'q15', 'Hall of Selves', [G('clear', 'refraction_hall')], { xp: 40000 });
main(16, 'q16', 'Fourth Light', [G('kill', 'prismarch'), G('build', 'beacon_4')], { glint: 800, xp: 60000 });
main(17, 'q17', 'North', [G('raise', null, 3, { biome: 'hoarfrost' })], { glint: 1000 });
main(18, 'q18', 'The Sky Carries', [G('counter', 'gull_deliveries', 500)], { xp: 50000, items: [{ item: 'cryo_cell', qty: 5 }] });
main(19, 'q19', 'What the Ice Kept', [G('clear', 'frozen_reliquary')], { xp: 60000 });
main(20, 'q20', 'Fifth Light', [G('kill', 'glacier_antler'), G('build', 'beacon_5')], { glint: 2500, xp: 100000 });
main(21, 'q21', 'The Corners of the World', [G('raise', null, 3, { biome: 'umbral' })], { glint: 3000 });
main(22, 'q22', 'Sixth Light', [G('clear', 'the_inkwell'), G('kill', 'hollow_choir'), G('build', 'beacon_6')], { glint: 6000, xp: 300000 });
main(23, 'q23', 'The Tidegate', [G('reach', 'tidegate', 5)], { moonShards: 2 });
main(24, 'q24', 'Moonfall', [G('kill', 'drowned_moon')], { credits: true, rebirth: true });

// ---------------------------------------------------------------- side quests: each step gives 200 * tier^2 XP and 20 * 2^tier Glint
const TIER = { ferrin: 1, odalys: 2, brannick: 2, sootwren: 3, ashka: 3, lumen: 4, quill: 4, halvard: 5, ysolde: 5, nix: 6, morrow: 6 };
const side = (id, goals) => {
  const npc = id.split('_')[1], step = Number(id.split('_')[2]), t = TIER[npc];
  Q.push({ id, type: 'side', name: npc[0].toUpperCase() + npc.slice(1) + ' ' + ['I', 'II', 'III'][step - 1], giver: 'npc_' + npc, step,
    prereq: step === 1 ? null : 's_' + npc + '_' + (step - 1), goals, rewards: { glint: 20 * 2 ** t, xp: 200 * t * t, items: [] } });
};
const FISH_LEGENDARY = ['old_whiskers', 'bog_sovereign', 'kiln_koi', 'sun_sturgeon', 'glacier_maw', 'moon_leviathan'];
const DISHES = ['roast_berries', 'grilled_fish', 'reed_bread', 'fen_stew', 'ember_curry', 'glass_noodles', 'frost_sorbet', 'ink_broth', 'tidewright_feast'];
side('s_ferrin_1', [G('deliver', 'rope', 20)]);
side('s_ferrin_2', [G('deliver', 'plank', 10), G('deliver', 'brick', 10)]);
side('s_ferrin_3', [G('catch', null, 5)]);
side('s_odalys_1', [G('deliver', DISHES, 3)]);
side('s_odalys_2', [G('deliver', 'salt', 10), G('deliver', 'mudroot', 5)]);
side('s_odalys_3', [G('deliver', 'pearl_gar', 1)]);
side('s_brannick_1', [G('deliver', 'iron_bar', 20)]);
side('s_brannick_2', [G('kill', 'clatterclaw', 15)]);
side('s_brannick_3', [G('craft', ['hook_3', 'blade_3', 'bow_3', 'staff_3'], 1)]);
side('s_sootwren_1', [G('build', ['sluice_1', 'sluice_2', 'sluice_3'], 20)]);
side('s_sootwren_2', [G('deliver', 'flux_coil', 10)]);
side('s_sootwren_3', [G('reach', 'flux', 20)]);
side('s_ashka_1', [G('deliver', 'brimstone', 10)]);
side('s_ashka_2', [G('craft', ['tonic_haste', 'tonic_stone', 'tonic_fortune', 'tonic_surge'], 5)]);
side('s_ashka_3', [G('kill_elite', null, 3, { biome: 'emberreach' })]);
side('s_lumen_1', [G('deliver', 'glass', 30)]);
side('s_lumen_2', [G('deliver', 'lens', 6)]);
side('s_lumen_3', [G('counter', 'relics_found', 3)]);
side('s_quill_1', [G('raise', null, 5)]);
side('s_quill_2', [G('build', 'waystone', 3)]);
side('s_quill_3', [G('solve', null, 3)]);
side('s_halvard_1', [G('deliver', 'frost_pelt', 20)]);
side('s_halvard_2', [G('kill_elite', 'frostbulk', 1)]);
side('s_halvard_3', [G('temper', null, 3)]);
side('s_ysolde_1', [G('build', 'lamp', 10, { biome: 'hoarfrost' })]);
side('s_ysolde_2', [G('catch', 'aurora_trout', 1)]);
side('s_ysolde_3', [G('deliver', 'cryo_cell', 10)]);
side('s_nix_1', [G('donate', null, 60, { world: true })]);
side('s_nix_2', [G('catch', FISH_LEGENDARY, 1)]);
side('s_nix_3', [G('deliver', 'relic_fragment', 5)]);
side('s_morrow_1', [G('reach', 'trench', 5)]);
side('s_morrow_2', [G('deliver', 'gloom_heart', 10)]);
side('s_morrow_3', [G('reach', 'trench', 10)]);

// ---------------------------------------------------------------- Tide Board templates (16.3): 3 offered, refreshed daily
const board = (id, name, goal, rewards) => Q.push({ id, type: 'board', name, giver: 'tide_board', prereq: null, goals: [goal], rewards });
board('tb_gather', 'Gather', { kind: 'deliver', target: 'raw_tier_k', n: { base: 0, perK: 40 } }, { glint: { perPow2: 30 }, xp: { perPow2: 40 } });
board('tb_hunt', 'Hunt', { kind: 'kill', target: 'enemy_tier_k', n: { base: 8, perK: 2 } }, { glint: { perPow2: 30 }, xp: { perPow2: 40 }, items: [{ item: 'vault_key_k', qty: 1, p: 0.2 }] });
board('tb_craft', 'Craft', { kind: 'deliver', target: 'component_tier_k', n: { base: 0, perK: 5 } }, { glint: { perPow2: 60 } });
board('tb_fish', 'Fish', { kind: 'catch', target: 'uncommon_fish_tier_k', n: { base: 3, perK: 0 } }, { glint: { perPow2: 40 } });
board('tb_cook', 'Cook', { kind: 'deliver', target: 'dish', n: { base: 3, perK: 0 } }, { glint: { perPow2: 40 }, items: [{ item: 'random_tonic', qty: 1 }] });
board('tb_elite', 'Elite', { kind: 'kill_elite', target: null, n: { base: 1, perK: 0 } }, { glint: { perPow2: 80 }, items: [{ item: 'tide_token', qty: 1, p: 0.3 }] });
board('tb_vault', 'Vault Run', { kind: 'clear', target: 'vault_tier_k', n: { base: 1, perK: 0 }, underS: 900 }, { glint: { perPow2: 150 }, trinketRoll: 1 });
board('tb_tide', 'Tide', { kind: 'counter', target: 'tide_caches', n: { base: 3, perK: 0 } }, { glint: { perPow2: 50 } });
// Board placeholders resolved at offer time by WP11.
export const BOARD_PLACEHOLDERS = Object.freeze(['raw_tier_k', 'enemy_tier_k', 'component_tier_k', 'uncommon_fish_tier_k', 'dish', 'vault_tier_k', 'vault_key_k', 'random_tonic']);
export const BOARD_RULES = Object.freeze({ offers: 3, refresh: 'day' });

export default Q;
