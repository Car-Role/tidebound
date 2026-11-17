// Items (DESIGN 6, 13.4, 14, A.1, A.5, A.6). Stack: 999 materials, 99 consumables, 1 gear.
// Values given by DESIGN are used verbatim; values DESIGN does not give are filled in by WP2 and listed in
// docs/INTEGRATION_NOTES.md (ballast, seeds, dishes, tonics, gear, keys).
import FISH from './fish.js';
import CROPS from './crops.js';

const items = [];
const add = (o) => { items.push({ stack: 999, value: 0, ...o }); return o; };
const title = (id) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const mod = (stat, v, op = 'add', when) => (when ? { stat, op, v, when } : { stat, op, v });

// ---------------------------------------------------------------- raw tier matrix (6.1)
export const TIER_MATS = Object.freeze([
  null,
  { wood: 'driftwood', stone: 'fieldstone', ore: 'copper_ore', fiber: 'reedfiber', rare: 'shell', mob: 'chitin', bar: 'copper_bar' },
  { wood: 'stiltwood', stone: 'clay', ore: 'bog_iron_ore', fiber: 'kelp', rare: 'pearl', mob: 'fen_slime', bar: 'iron_bar' },
  { wood: 'ashwood', stone: 'obsidian', ore: 'cinderite_ore', fiber: 'ashgrass', rare: 'magma_core', mob: 'ember_scale', bar: 'cindersteel_bar' },
  { wood: 'spinewood', stone: 'sunsand', ore: 'prismite_ore', fiber: 'needlesilk', rare: 'amber', mob: 'mirage_dust', bar: 'prism_alloy' },
  { wood: 'palewood', stone: 'everice', ore: 'rime_ore', fiber: 'frostmoss', rare: 'aurora_shard', mob: 'frost_pelt', bar: 'rimesteel_bar' },
  { wood: 'gloomwood', stone: 'nullsilt', ore: 'umbrite_ore', fiber: 'inkweed', rare: 'echoglass', mob: 'gloom_heart', bar: 'umbral_alloy' },
]);
const RAW_VALUE = [0, 1, 2, 4, 8, 16, 32];
const RAW_NAMES = {
  driftwood: 'Driftwood', fieldstone: 'Fieldstone', copper_ore: 'Copper Ore', reedfiber: 'Reedfiber', shell: 'Shell', chitin: 'Chitin',
  stiltwood: 'Stiltwood', clay: 'Clay', bog_iron_ore: 'Bog-Iron Ore', kelp: 'Kelp', pearl: 'Pearl', fen_slime: 'Fen Slime',
  ashwood: 'Ashwood', obsidian: 'Obsidian', cinderite_ore: 'Cinderite Ore', ashgrass: 'Ashgrass', magma_core: 'Magma Core', ember_scale: 'Ember Scale',
  spinewood: 'Spinewood', sunsand: 'Sunsand', prismite_ore: 'Prismite Ore', needlesilk: 'Needlesilk', amber: 'Amber', mirage_dust: 'Mirage Dust',
  palewood: 'Palewood', everice: 'Everice', rime_ore: 'Rime Ore', frostmoss: 'Frostmoss', aurora_shard: 'Aurora Shard', frost_pelt: 'Frost Pelt',
  gloomwood: 'Gloomwood', nullsilt: 'Nullsilt', umbrite_ore: 'Umbrite Ore', inkweed: 'Inkweed', echoglass: 'Echoglass', gloom_heart: 'Gloom Heart',
};
for (let t = 1; t <= 6; t++) {
  const m = TIER_MATS[t];
  for (const kind of ['wood', 'stone', 'ore', 'fiber', 'rare', 'mob']) {
    const id = m[kind];
    const o = { id, name: RAW_NAMES[id], cat: 'material', tier: t, value: RAW_VALUE[t] * (kind === 'rare' ? 10 : 1), kind };
    if (id === 'magma_core') o.fuel = 40;
    add(o);
  }
}
// other raw (6.1)
add({ id: 'brimstone', name: 'Brimstone', cat: 'material', tier: 3, value: 4, fuel: 4, kind: 'other' });
add({ id: 'sand', name: 'Sand', cat: 'material', tier: 1, value: 1, kind: 'other' });
add({ id: 'peat', name: 'Peat', cat: 'material', tier: 1, value: 1, fuel: 1, kind: 'other' });
add({ id: 'salt', name: 'Salt', cat: 'material', tier: 2, value: 2, kind: 'other' });
add({ id: 'resin', name: 'Resin', cat: 'material', tier: 1, value: 2, kind: 'other' });
add({ id: 'honeycomb', name: 'Honeycomb', cat: 'material', tier: 2, value: 6, kind: 'other' });
add({ id: 'glintstone', name: 'Glintstone', cat: 'material', tier: 1, value: 25, kind: 'other', sellOnly: true });
add({ id: 'relic_fragment', name: 'Relic Fragment', cat: 'material', tier: 2, value: 0, kind: 'other' });

// ---------------------------------------------------------------- processed (6.2)
add({ id: 'plank', name: 'Plank', cat: 'material', tier: 1, value: 3 });
add({ id: 'brick', name: 'Brick', cat: 'material', tier: 1, value: 3 });
add({ id: 'charcoal', name: 'Charcoal', cat: 'material', tier: 1, value: 2, fuel: 2 });
add({ id: 'rope', name: 'Rope', cat: 'material', tier: 1, value: 4 });
add({ id: 'cloth', name: 'Cloth', cat: 'material', tier: 1, value: 6 });
add({ id: 'leather', name: 'Leather', cat: 'material', tier: 2, value: 8 });
add({ id: 'glass', name: 'Glass', cat: 'material', tier: 1, value: 4 });
add({ id: 'copper_bar', name: 'Copper Bar', cat: 'material', tier: 1, value: 4, bar: true });
add({ id: 'iron_bar', name: 'Iron Bar', cat: 'material', tier: 2, value: 8, bar: true });
add({ id: 'cindersteel_bar', name: 'Cindersteel Bar', cat: 'material', tier: 3, value: 20, bar: true });
add({ id: 'prism_alloy', name: 'Prism Alloy', cat: 'material', tier: 4, value: 36, bar: true });
add({ id: 'rimesteel_bar', name: 'Rimesteel Bar', cat: 'material', tier: 5, value: 70, bar: true });
add({ id: 'umbral_alloy', name: 'Umbral Alloy', cat: 'material', tier: 6, value: 140, bar: true });
// Ballast (4.3, A.6): values filled = input value (see notes)
[[1, 8], [2, 15], [3, 33], [4, 61], [5, 119]].forEach(([k, v]) => add({ id: 'ballast_' + k, name: 'Ballast ' + ['I', 'II', 'III', 'IV', 'V'][k - 1], cat: 'material', tier: k, value: v }));

// ---------------------------------------------------------------- components (6.3)
add({ id: 'gear_part', name: 'Gear Part', cat: 'component', tier: 1, value: 3 });
add({ id: 'nail', name: 'Nail', cat: 'component', tier: 2, value: 3 });
add({ id: 'iron_plate', name: 'Iron Plate', cat: 'component', tier: 2, value: 18 });
add({ id: 'sluice_board', name: 'Sluice Board', cat: 'component', tier: 1, value: 9 });
add({ id: 'flux_coil', name: 'Flux Coil', cat: 'component', tier: 3, value: 55 });
add({ id: 'lens', name: 'Lens', cat: 'component', tier: 4, value: 95 });
add({ id: 'prism_circuit', name: 'Prism Circuit', cat: 'component', tier: 4, value: 210 });
add({ id: 'cryo_cell', name: 'Cryo Cell', cat: 'component', tier: 5, value: 380 });
add({ id: 'hollow_core', name: 'Hollow Core', cat: 'component', tier: 6, value: 1300 });

// ---------------------------------------------------------------- gear (6.4)
const TIER_NAME = ['', 'Driftwood', 'Copper', 'Bog-Iron', 'Cindersteel', 'Prism', 'Rimesteel', 'Umbral'];
const gearValue = (tier) => 5 * Math.pow(2, tier);
// Tidehooks
[1, 2, 4, 8, 16, 32, 64].forEach((power, i) => {
  const k = i + 1;
  const o = { id: 'hook_' + k, name: TIER_NAME[k] + ' Hook', cat: 'tool', tier: k, value: gearValue(k), stack: 1, gear: { slot: 'hook', power, tier: k, maxNode: k === 7 ? 99 : k } };
  if (k === 7) o.effects = [{ id: 'hook_yield', v: 0.25 }];
  add(o);
});
// Weapons: three types per tier 1..7
export const WEAPON_STATS = Object.freeze({
  blade: { pattern: 'arc', arc: 100, reach: 1.8, rate: 2.0, dmg: [6, 12, 24, 46, 85, 150, 260] },
  bow: { pattern: 'projectile', range: 9, pierce: 0, rate: 1.5, dmg: [7, 14, 28, 54, 100, 176, 305] },
  staff: { pattern: 'orb', range: 7, splash: 1.2, rate: 1.0, dmg: [9, 18, 36, 70, 128, 225, 390] },
});
// Staff element by tier (DESIGN says "element by tier" without a table; filled by WP2 from the biome themes).
export const STAFF_ELEMENTS = Object.freeze(['none', 'tide', 'ember', 'storm', 'frost', 'hollow', 'hollow']);
for (const wtype of ['blade', 'bow', 'staff']) {
  const w = WEAPON_STATS[wtype];
  for (let k = 1; k <= 7; k++) {
    const g = { slot: 'weapon', wtype, tier: k, dmg: w.dmg[k - 1], rate: w.rate };
    if (w.reach) { g.reach = w.reach; g.arc = w.arc; }
    if (w.range) g.range = w.range;
    if (wtype === 'bow') g.pierce = 0;
    if (wtype === 'staff') { g.splash = w.splash; g.element = STAFF_ELEMENTS[k - 1]; }
    add({ id: wtype + '_' + k, name: TIER_NAME[k] + ' ' + title(wtype), cat: 'weapon', tier: k, value: gearValue(k), stack: 1, gear: g });
  }
}
// Armor tiers 1..6: armor 6k/10k/5k, max HP 10k/20k/8k
const ARMOR_NAME = ['', 'Copper', 'Bog-Iron', 'Cindersteel', 'Prism', 'Rimesteel', 'Umbral'];
for (let k = 1; k <= 6; k++) {
  for (const [slot, a, hp, nm] of [['helm', 6, 10, 'Helm'], ['coat', 10, 20, 'Coat'], ['boots', 5, 8, 'Boots']]) {
    add({ id: slot + '_' + k, name: ARMOR_NAME[k] + ' ' + nm, cat: 'armor', tier: k, value: gearValue(k), stack: 1, gear: { slot, tier: k, armor: a * k, hp: hp * k, set: k } });
  }
}
// 3 pieces of the same tier: set bonus
export const ARMOR_SETS = Object.freeze({
  1: { mods: [mod('moveSpeed', 0.05)] },
  2: { mods: [mod('gatherPower', 0.10)] },
  3: { flags: ['burn_immune'] },
  4: { mods: [mod('critMult', 0.10)] },
  5: { flags: ['chill_immune'] },
  6: { mods: [mod('power', 0.10), mod('abilityPower', 0.10)] },
});
// Rods: each +1 fish tier and -15% bite time (relative to rod_1)
[['Reed Rod', 2], ['Iron Reel', 3], ['Prism Caster', 5], ['Abyss Line', 6]].forEach(([name, maxFish], i) => {
  const k = i + 1;
  const o = { id: 'rod_' + k, name, cat: 'rod', tier: [1, 2, 4, 6][i], value: gearValue(k), stack: 1, gear: { slot: 'rod', tier: k, maxFishTier: maxFish } };
  if (k > 1) o.mods = [mod('fishBite', -0.15 * (k - 1))];
  add(o);
});
// Packs: +8 inventory slots each
['Reed Satchel', 'Leather Pack', 'Ashcloth Pack', 'Silk Pack', 'Frostmoss Pack'].forEach((name, i) => {
  add({ id: 'pack_' + (i + 1), name, cat: 'pack', tier: i + 1, value: gearValue(i + 1), stack: 1, gear: { slot: 'pack', tier: i + 1, slots: 8 }, mods: [mod('invSlots', 8)] });
});
// Lanterns
add({ id: 'lantern_1', name: 'Tide Lantern', cat: 'lantern', tier: 1, value: 20, stack: 1, gear: { slot: 'lantern', tier: 1, light: 6 }, mods: [mod('lightRadius', 1)] });
add({ id: 'lantern_2', name: 'Prism Lantern', cat: 'lantern', tier: 4, value: 160, stack: 1, gear: { slot: 'lantern', tier: 4, light: 9 }, mods: [mod('lightRadius', 4)], flags: ['reveal_ambushers'] });

// ---------------------------------------------------------------- trinkets (13.4, A.1): 24
const trinket = (id, name, source, extra) => add({ id, name, cat: 'trinket', tier: 0, value: 0, stack: 1, gear: { slot: 'trinket' }, source, ...extra });
trinket('thorn_locket', 'Thorn Locket', 'boss:thornmother', { mods: [mod('thorns', 0.15), mod('maxHp', 20)] });
trinket('regent_signet', 'Regent Signet', 'boss:mire_regent', { mods: [mod('sellMult', 0.15)], effects: [{ id: 'fish_value', mult: 2 }] });
trinket('kiln_ember', 'Kiln Ember', 'boss:kilnheart', { proc: { on: 'hit', id: 'burn', p: { chance: 1, dmg: 0.4, dur: 3 } }, flags: ['lava_immune'] });
trinket('prism_eye', 'Prism Eye', 'boss:prismarch', { mods: [mod('critChance', 0.12)], proc: { on: 'crit', id: 'blind_on_crit', p: { dur: 3 } } });
trinket('antler_tine', 'Antler Tine', 'boss:glacier_antler', { proc: { on: 'hit', id: 'dmg_vs_status', p: { status: 'slow', bonus: 0.2 } }, flags: ['chill_immune'] });
trinket('choir_bell', 'Choir Bell', 'boss:hollow_choir', { proc: { on: 'abilityHit', id: 'ability_echo', p: { mult: 0.3, delay: 1 } } });
trinket('spore_pouch', 'Spore Pouch', 'boss:sporeking', { mods: [mod('yieldPlant', 0.2)] });
trinket('barnacle_charm', 'Barnacle Charm', 'boss:barnacle_bell', { mods: [mod('armor', 30, 'add', 'shallows_or_rain')] });
trinket('bellows_valve', 'Bellows Valve', 'boss:bellows_engine', { proc: { on: 'smelt', id: 'kiln_boost', p: { bonus: 0.3, dur: 60 } } });
trinket('twin_lens', 'Twin Lens', 'boss:twin_lenses', { proc: { on: 'hit', id: 'projectile_split', p: { mult: 0.6 } } });
trinket('thawless_plate', 'Thawless Plate', 'boss:thawless_knight', { mods: [mod('maxHp', 0.15, 'mul')], flags: ['freeze_immune'] });
trinket('scribe_quill', 'Scribe Quill', 'boss:scribe', { mods: [mod('xpMult', 0.1)], effects: [{ id: 'bonus_draft_offer', n: 1 }] });
trinket('tide_compass', 'Tide Compass', 'shrine', { mods: [mod('yieldTidal', 0.25)], flags: ['cache_minimap'] });
trinket('lucky_cork', 'Lucky Cork', 'shrine', { mods: [mod('luck', 15)] });
trinket('gull_feather', 'Gull Feather', 'shrine', { mods: [mod('moveSpeed', 0.12)] });
trinket('salt_idol', 'Salt Idol', 'shrine', { mods: [mod('hpRegen', 0.1)], effects: [{ id: 'food_duration', v: 0.2 }] });
trinket('miser_purse', 'Miser Purse', 'shrine', { mods: [mod('glintMult', 0.15)] });
trinket('runner_anklet', 'Runner Anklet', 'shrine', { mods: [mod('dodgeRecharge', -0.2)] });
trinket('ember_flask', 'Ember Flask', 'quest:s_ashka_3', { effects: [{ id: 'tonic_duration', v: 0.5 }] });
trinket('frost_bead', 'Frost Bead', 'quest:s_halvard_3', { proc: { on: 'hit', id: 'chill', p: { slow: 0.1, dur: 2, max: 5 } } });
trinket('deep_lantern', 'Deep Lantern', 'quest:s_morrow_3', { mods: [mod('lightRadius', 4), mod('power', 0.15, 'add', 'in_dungeon')] });
trinket('scuttler_whistle', 'Scuttler Whistle', 'trench:20', { effects: [{ id: 'burrow_near', radius: 10, v: 0.2 }] });
trinket('storm_vial', 'Storm Vial', 'trench:30', { proc: { on: 'tick', id: 'periodic_lightning', p: { interval: 5, dmg: 1.5, range: 0 } } });
trinket('moon_sliver', 'Moon Sliver', 'trench:40', { mods: [mod('yieldAll', 0.1), mod('xpMult', 0.1)] });
export const SHRINE_TRINKETS = Object.freeze(['tide_compass', 'lucky_cork', 'gull_feather', 'salt_idol', 'miser_purse', 'runner_anklet']);
export const TRENCH_TRINKETS = Object.freeze({ 10: 'deep_lantern', 20: 'scuttler_whistle', 30: 'storm_vial', 40: 'moon_sliver' });

// ---------------------------------------------------------------- consumables (6.5)
const food = (id, name, tier, value, heal, buff, extra = {}) => add({ id, name, cat: 'food', tier, value, stack: 99, use: { kind: 'food', heal, ...(buff ? { buff: { id, ...buff } } : {}) }, ...extra });
food('roast_berries', 'Roast Berries', 1, 4, 25);
food('grilled_fish', 'Grilled Fish', 1, 8, 60);
food('reed_bread', 'Reed Bread', 1, 10, 80, { dur: 180, mods: [mod('moveSpeed', 0.10)] });
food('fen_stew', 'Fen Stew', 2, 25, 150, { dur: 300, mods: [mod('hpRegen', 1)] });
food('ember_curry', 'Ember Curry', 3, 50, 0, { dur: 300, mods: [mod('power', 0.15)] });
food('glass_noodles', 'Glass Noodles', 4, 80, 0, { dur: 300, mods: [mod('gatherPower', 0.15)] });
food('frost_sorbet', 'Frost Sorbet', 5, 140, 0, { dur: 300, mods: [mod('surgeRegen', 1)], flags: ['chill_immune'] });
food('ink_broth', 'Ink Broth', 6, 300, 0, { dur: 600, mods: [mod('xpMult', 0.10)] });
food('tidewright_feast', 'Tidewright Feast', 6, 2000, 0, {
  dur: 900,
  mods: [mod('moveSpeed', 0.05), mod('hpRegen', 0.5), mod('power', 0.075), mod('gatherPower', 0.075), mod('surgeRegen', 0.5), mod('xpMult', 0.05)],
  flags: ['chill_immune'],
}, { effects: [{ id: 'party_buff', radius: 8 }] });
const tonic = (id, name, tier, value, use) => add({ id, name, cat: 'tonic', tier, value, stack: 99, use });
tonic('tonic_haste', 'Tonic of Haste', 2, 27, { kind: 'tonic', buff: { id: 'tonic_haste', dur: 120, mods: [mod('swingSpeed', 0.25)] } });
tonic('tonic_stone', 'Tonic of Stone', 3, 30, { kind: 'tonic', buff: { id: 'tonic_stone', dur: 120, mods: [mod('armor', 40)] } });
tonic('tonic_fortune', 'Tonic of Fortune', 4, 60, { kind: 'tonic', buff: { id: 'tonic_fortune', dur: 300, mods: [mod('luck', 25)] } });
tonic('tonic_surge', 'Tonic of Surge', 6, 200, { kind: 'restore_surge', surge: 100 });
add({ id: 'bandage', name: 'Bandage', cat: 'misc', tier: 1, value: 12, stack: 99, use: { kind: 'bandage', heal: 40, dur: 4 } });
add({ id: 'bomb', name: 'Bomb', cat: 'misc', tier: 2, value: 10, stack: 99, use: { kind: 'bomb', dmg: 150, gather: 30, radius: 2 } });
const WARDENS = ['thornmother', 'mire_regent', 'kilnheart', 'prismarch', 'glacier_antler', 'hollow_choir'];
WARDENS.forEach((boss, i) => add({ id: 'lure_' + (i + 1), name: 'Lure ' + ['I', 'II', 'III', 'IV', 'V', 'VI'][i], cat: 'misc', tier: i + 1, value: 0, stack: 99, use: { kind: 'lure', boss } }));
add({ id: 'tide_token', name: 'Tide Token', cat: 'misc', tier: 0, value: 0, stack: 99, use: { kind: 'token' } });

// ---------------------------------------------------------------- keys, cores, trophies, relics
for (let k = 1; k <= 6; k++) {
  add({ id: 'vault_key_' + k, name: 'Vault Key ' + k, cat: 'key', tier: k, value: 0, stack: 99 });
  add({ id: 'vault_core_' + k, name: 'Vault Core ' + k, cat: 'key', tier: k, value: 0, stack: 99 });
}
[['trophy_thornmother', 'Thornmother Trophy'], ['trophy_regent', 'Regent Trophy'], ['trophy_kilnheart', 'Kilnheart Trophy'],
  ['trophy_prismarch', 'Prismarch Trophy'], ['trophy_antler', 'Antler Trophy'], ['trophy_choir', 'Choir Trophy']]
  .forEach(([id, name], i) => add({ id, name, cat: 'trophy', tier: i + 1, value: 0, stack: 99 }));
add({ id: 'moon_shard_crown', name: 'Moon Shard Crown', cat: 'trophy', tier: 6, value: 0, stack: 1, cosmetic: true });
export const RELICS = Object.freeze([
  ['relic_01', 'Barnacled Compass', 1, 'Greenmarrow shrine chest (guaranteed first)'],
  ['relic_02', 'Salt-Glazed Bowl', 2, 'Saltfen dig plot'],
  ['relic_03', "Ropewalker's Knot", 2, 'Saltfen dig plot'],
  ['relic_04', 'Cinder Tablet', 3, 'Emberreach dig plot'],
  ['relic_05', 'Kiln-God Figurine', 3, 'Emberreach dig plot'],
  ['relic_06', 'Mirror Shard of the First Lens', 4, 'Glasswaste dig plot'],
  ['relic_07', 'Sand-Clock', 4, 'Glasswaste dig plot'],
  ['relic_08', 'Frozen Lantern', 5, 'Hoarfrost dig plot'],
  ['relic_09', 'Antler Flute', 5, 'Hoarfrost dig plot'],
  ['relic_10', 'Tide-Table Slate', 2, 'Sunken Cistern treasure room (guaranteed first clear)'],
  ['relic_11', 'Bell Without a Voice', 4, 'Refraction Hall treasure room (guaranteed first clear)'],
  ['relic_12', 'The Blank Page', 6, 'The Inkwell treasure room (guaranteed first clear)'],
]);
for (const [id, name, tier, found] of RELICS) add({ id, name, cat: 'relic', tier, value: 0, stack: 1, found });

// ---------------------------------------------------------------- crops, seeds, fish
// marrowberry is both a raw drop (6.1, value 1) and a crop
add({ id: 'marrowberry', name: 'Marrowberry', cat: 'material', tier: 1, value: 1, crop: true, kind: 'other' });
for (const c of CROPS) {
  if (!items.find((i) => i.id === c.id)) {
    const o = { id: c.id, name: c.name, cat: 'material', tier: c.tier, value: c.value, crop: true };
    if (c.fuel) o.fuel = c.fuel;
    if (c.plantsNode) o.use = { kind: 'plant_node', node: c.plantsNode };
    add(o);
  } else {
    const o = items.find((i) => i.id === c.id);
    o.crop = true;
  }
  add({ id: c.seed, name: c.name + ' Seed', cat: 'seed', tier: c.tier, value: Math.max(1, Math.floor(c.value / 3)), crop: c.id });
}
for (const f of FISH) add({ id: f.id, name: f.name, cat: 'fish', tier: f.tier, value: f.value, rarity: f.rarity });

// ---------------------------------------------------------------- placeables
// filter_grabber's cost includes a `grabber` item (DESIGN 8.2), Sootwren gives "one free autobench_1 item" (16.2),
// and e05 places a personal sapling from the hotbar (9.1).
add({ id: 'grabber', name: 'Grabber Arm', cat: 'placeable', tier: 3, value: 0, stack: 99, places: 'grabber' });
add({ id: 'autobench_1', name: 'Autobench I', cat: 'placeable', tier: 3, value: 0, stack: 99, places: 'autobench_1' });
add({ id: 'worldseed_sapling', name: 'Worldseed Sapling', cat: 'placeable', tier: 0, value: 0, stack: 1, places: 'sapling' });

export default items;
