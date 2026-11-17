// Moon Chart (DESIGN 18.2): 20 perks; 3 ranks costing 1/2/3 Moon Shards unless marked "(1 rank)" (cost [1]).
// mods/worldMods/effects are per rank (multiplied by rank). op:'mul' is allowed here (DESIGN 5.1).
const add = (stat, v) => ({ stat, op: 'add', v });
const mul = (stat, v) => ({ stat, op: 'mul', v });
const R3 = { ranks: 3, cost: [1, 2, 3] };
const R1 = { ranks: 1, cost: [1] };
const p = (id, name, text, ranks, extra) => ({ id, name, text, ...ranks, mods: [], ...extra });

export default [
  p('moon_xp', 'Bright Wake', '+10% XP', R3, { mods: [mul('xpMult', 0.10)] }),
  p('moon_yield', 'Full Nets', '+10% yields', R3, { mods: [mul('yieldAll', 0.10)] }),
  p('moon_glint', 'Silver Tide', '+10% Glint', R3, { mods: [mul('glintMult', 0.10)] }),
  p('moon_land', 'Shallow Claim', '-5% land cost', R3, { mods: [add('landDiscount', 0.05)] }),
  p('moon_hook', 'Old Hook', 'start with hook_2', R3, { effects: [{ id: 'start_item', item: 'hook_2', qty: 1 }] }),
  p('moon_burrow', 'Old Friends', 'start with 1 Scuttler Burrow', R3, { flags: ['start_burrow'] }),
  p('moon_draft', 'Tenfold', '+1 draft offer on levels divisible by 10', R3, { effects: [{ id: 'draft_offer_tens', n: 1 }] }),
  p('moon_dmg', 'Moon Edge', '+5% damage', R3, { mods: [mul('power', 0.05), mul('abilityPower', 0.05)] }),
  p('moon_hp', 'Moon Hide', '+5% max HP', R3, { mods: [mul('maxHp', 0.05)] }),
  p('moon_tokens', 'Token Purse', '+1 starting tide_token per 5 levels', R3, { effects: [{ id: 'start_tokens_per_levels', every: 5, n: 1 }] }),
  p('moon_kiln', 'Banked Coals', 'kilns +15%', R3, { mods: [mul('kilnSpeed', 0.15)] }),
  p('moon_machines', 'Remembered Gears', 'machines +10%', R3, { worldMods: [add('machineSpeed', 0.10)] }),
  p('moon_dodge', 'Light Step', '+1 dodge charge (1 rank)', R1, { mods: [add('dodgeCharges', 1)] }),
  p('moon_keep', 'Keepsake', 'keep 1 chosen card per rank across Rebirths', R3, { effects: [{ id: 'keep_card', n: 1 }] }),
  p('moon_eclipse', 'Eclipse Deck', 'unlock Mythic-plus "Eclipse" card variants (1 rank)', R1, { flags: ['eclipse_cards'] }),
  p('moon_move', 'Moon Legs', '+10% move speed', R3, { mods: [mul('moveSpeed', 0.10)] }),
  p('moon_rows', 'Deep Pack', '+2 inventory rows', R3, { mods: [add('invSlots', 16)] }),
  p('moon_scuttler', 'Bred Scuttlers', 'Scuttlers +1 tier', R3, { effects: [{ id: 'scuttler_tier', n: 1 }] }),
  p('moon_trinkets', 'Twin Spoils', 'bosses drop 2 trinkets', R3, { effects: [{ id: 'boss_trinkets', n: 2 }] }),
  p('moon_beacon', 'First Light Kept', 'start with Beacon 1 lit (1 rank)', R1, { effects: [{ id: 'start_beacon', k: 1 }] }),
];

// Rebirth rules (18.2)
export const REBIRTH = Object.freeze({
  resets: ['plots', 'structures', 'inventories', 'glint', 'level', 'cards', 'skillPoints', 'gear', 'quests'],
  keeps: ['archive', 'logbook', 'cosmetics', 'mastery', 'bestiary', 'moonChart', 'recipes', 'trenchRecord'],
  shards: { finalBoss: 5, perHundredAvgLevels: 1, perWing: 1, perTenTrenchFloors: 1 },
  tideHeight: { max: 10, enemyHp: 0.4, enemyDmg: 0.25, costs: 0.15, secondAffixAt: 3, newRaidsAt: 5 },
  vote: 'all bound players',
});
