// Castaway shop stock (DESIGN A.6). Restock each in-game day; prices in Glint; stock = units per in-game day.
// Rule behind material prices: previous-tier goods at 3x value, 40 units per item per day.
// requires: 'line' = only after that NPC's quest line is completed. pool: a random pick from a named pool, re-rolled daily.

export default [
  { npc: 'npc_ferrin', stock: [
    { item: 'seed_tidewheat', price: 2, stock: 20 }, { item: 'rope', price: 12, stock: 40 }, { item: 'plank', price: 9, stock: 40 },
    { item: 'pack_1', price: 150, stock: 1, requires: 'line' }] },
  { npc: 'npc_odalys', stock: [{ item: 'seed_saltbloom', price: 8, stock: 20 }, { item: 'salt', price: 6, stock: 40 }, { item: 'reed_bread', price: 30, stock: 5 }] },
  { npc: 'npc_brannick', stock: [{ item: 'copper_bar', price: 12, stock: 40 }, { item: 'nail', price: 9, stock: 40 }, { item: 'vault_key_1', price: 120, stock: 1 }] },
  { npc: 'npc_sootwren', stock: [{ item: 'gear_part', price: 9, stock: 40 }, { item: 'iron_plate', price: 54, stock: 40 }, { item: 'sluice_board', price: 27, stock: 40 }] },
  { npc: 'npc_ashka', stock: [{ item: 'seed_scorchpepper', price: 25, stock: 20 }, { item: 'tonic_haste', price: 80, stock: 3 }, { item: 'charcoal', price: 6, stock: 40 }] },
  { npc: 'npc_lumen', stock: [{ item: 'seed_sunmelon', price: 60, stock: 20 }, { item: 'glass', price: 12, stock: 40 }, { item: 'cindersteel_bar', price: 60, stock: 40 }] },
  { npc: 'npc_quill', stock: [{ pool: 'shrine_trinkets', price: 32000, stock: 1, reroll: 'daily' }] },
  { npc: 'npc_halvard', stock: [{ item: 'seed_snowberry', price: 150, stock: 20 }, { item: 'prism_alloy', price: 108, stock: 40 }, { item: 'vault_key_4', price: 2000, stock: 1 }] },
  { npc: 'npc_ysolde', stock: [{ item: 'tide_token', price: 4000, stock: 1 }, { item: 'lens', price: 285, stock: 40 }] },
  { npc: 'npc_nix', stock: [{ item: 'seed_inkcap', price: 400, stock: 20 }, { item: 'rimesteel_bar', price: 210, stock: 40 }] },
  { npc: 'npc_morrow', stock: [{ item: 'vault_key_6', price: 12000, stock: 1 }, { item: 'tonic_surge', price: 600, stock: 3 }] },
];

export const SHOP_RULES = Object.freeze({ materialMarkup: 3, materialStock: 40, restock: 'day' });
// Named pools a stock line may draw from.
export const SHOP_POOLS = Object.freeze({ shrine_trinkets: ['tide_compass', 'lucky_cork', 'gull_feather', 'salt_idol', 'miser_purse', 'runner_anklet'] });
