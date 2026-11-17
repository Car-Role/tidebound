// Castaways (DESIGN 16.2): 11 NPCs, one per castaway plot. Shop stock comes from shops.js (single source).
// lineReward is granted after step 3; `world` parts apply to the whole world, the rest to the finishing player.
// Dialogue lines are original WP2 filler text for WP11.
import SHOPS from './shops.js';

const shop = (id) => (SHOPS.find((s) => s.npc === id) || { stock: [] }).stock;
const n = (id, name, biome, tier, role, lineReward, lines) => ({
  id, name, biome, tier, role, quests: [1, 2, 3].map((i) => 's_' + id.slice(4) + '_' + i), shop: shop(id), lineReward, lines,
});

export default [
  n('npc_ferrin', 'Ferrin the Ropewalker', 'greenmarrow', 1, 'general trader', { items: [{ item: 'pack_1', qty: 1 }] },
    { greet: ['Dry feet! Rarer than pearls, these days.', 'Need rope? I always need rope.'], idle: ['The tide hums when it turns. Listen for it.'] }),
  n('npc_odalys', 'Odalys Saltmother', 'saltfen', 2, 'cook', { recipes: ['r_fen_stew'], items: [{ item: 'tonic_fortune', qty: 3 }] },
    { greet: ['Sit. Eat. Then talk.'], idle: ['Salt keeps everything. Even memories.'] }),
  n('npc_brannick', 'Brannick Half-Anchor', 'saltfen', 2, 'smith', { items: [{ item: 'pack_2', qty: 1 }], effects: [{ id: 'temper_glint_discount', v: 0.1 }] },
    { greet: ['Mind the anvil. It bites.'], idle: ['Bog iron is ugly iron. Ugly iron holds.'] }),
  n('npc_sootwren', 'Sootwren', 'emberreach', 3, 'engineer', { items: [{ item: 'autobench_1', qty: 1 }] },
    { greet: ['Everything wants to move. You just give it a slope.'], idle: ['Count the gears. Then count them again.'] }),
  n('npc_ashka', 'Ashka of the Vents', 'emberreach', 3, 'alchemist', { recipes: ['r_ember_curry'], items: [{ item: 'ember_flask', qty: 1 }] },
    { greet: ['Breathe through the cloth. The vents are generous today.'], idle: ['Brimstone remembers being fire.'] }),
  n('npc_lumen', 'Lumen-of-Many-Faces', 'glasswaste', 4, 'glassmaker', { items: [{ item: 'pack_3', qty: 1 }, { item: 'lantern_2', qty: 1 }] },
    { greet: ['Which of me are you speaking to?'], idle: ['Sand is only glass that has not decided yet.'] }),
  n('npc_quill', 'Quill the Surveyor', 'glasswaste', 4, 'cartographer', { worldMods: [{ stat: 'landDiscountWorld', op: 'add', v: 0.03 }] },
    { greet: ['Hold still, you are standing on an unmapped bit.'], idle: ['Every shore is a line someone forgot to finish.'] }),
  n('npc_halvard', 'Halvard Frostbeard', 'hoarfrost', 5, 'hunter', { items: [{ item: 'pack_4', qty: 1 }, { item: 'frost_bead', qty: 1 }] },
    { greet: ['Quiet. The wolves count footsteps.'], idle: ['Cold is honest. It tells you exactly how long you have.'] }),
  n('npc_ysolde', 'Ysolde Lanternwright', 'hoarfrost', 5, 'lamplighter and angler',
    { effects: [{ id: 'rod_rare_fish', item: 'rod_3', v: 0.1 }], worldMods: [{ stat: 'lampRadius', op: 'add', v: 2 }] },
    { greet: ['A light for the dark, a line for the deep.'], idle: ['Fish rise to lanterns. So do worse things.'] }),
  n('npc_nix', 'Nix, Who Remembers', 'umbral', 6, 'archivist', { items: [{ item: 'pack_5', qty: 1 }], effects: [{ id: 'moon_shards_next', n: 3 }] },
    { greet: ['I have met you before. You were drier.'], idle: ['The Archive forgets nothing. That is its curse.'] }),
  n('npc_morrow', 'Morrow the Unmoored', 'umbral', 6, 'deep diver', { items: [{ item: 'deep_lantern', qty: 1 }], flags: ['trench_no_key'] },
    { greet: ['Down is the only direction that never ends.'], idle: ['The Trench breathes. Time your dives to it.'] }),
];
