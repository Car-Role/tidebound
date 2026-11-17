// Balance knobs (PACING section 9, DESIGN formulas). WP14 tunes these; everything else reads them from here.

// ---------------------------------------------------------------- land and Ballast
export const LAND_BASE = 50;
export const LAND_GROWTH = 1.08;
export const LAND_ROUND = 5;
export const LAND_PLOTS = 80;
export const LAND_DISCOUNT_CAP = 0.2;
// Ballast per plot: Greenmarrow is 10 * ordinal of ballast_1; the rest are flat per biome.
export const BALLAST_PER_PLOT = Object.freeze({
  greenmarrow: { item: 'ballast_1', perOrdinal: 10 },
  saltfen: { item: 'ballast_1', qty: 90 },
  emberreach: { item: 'ballast_2', qty: 160 },
  glasswaste: { item: 'ballast_3', qty: 200 },
  hoarfrost: { item: 'ballast_4', qty: 380 },
  umbral: { item: 'ballast_5', qty: 1000 },
});
export const GATE_COST_MULT = 1.0;

// ---------------------------------------------------------------- co-op
export const COOP_SCALE_PER_PLAYER = 0.7;    // coopScale = 1 + 0.7 * (S - 1)
export const ENEMY_HP_PER_PLAYER = 0.6;      // x(1 + 0.6 * (n - 1))
export const BOSS_HP_PER_PLAYER = 0.8;
export const NODE_RESPAWN_PER_PLAYER = 0.6;  // interval / (1 + 0.6 * (S - 1))
export const KILL_XP_PER_PLAYER = 0.6;       // each contributor: xp * (1 + 0.6 * (n - 1)) / n
export const PARTY_RANGE = 24;
export const MAX_BOUND = 8;
export const WAKE_LEVEL_GAP = 5;
export const WAKE_XP_BONUS = 1.0;

// ---------------------------------------------------------------- XP
export const XP_BASE = 30;
export const XP_EXP = 1.9;
export const XP_ROUND = 5;
export const LEVEL_CAP = 100;
export const CRAFT_XP_PER_VALUE = 0.4;
export const MASTERY_XP_BASE = 600;
export const MASTERY_MAX = 20;
export const NIGHT_KILL_XP = 0.25;
export const RESTED_XP = 0.25;
export const RESTED_MINUTES_PER_4H = 30;
export const RESTED_CAP_MINUTES = 120;
export const ARCHIVE_XP_BASE = 50;
export const BEACON_XP_WORLD = 0.05;
export const TIDEGATE_STAGE_XP = 150000;
export const LEVEL_UP = Object.freeze({ maxHp: 8, power: 0.01, gatherPower: 0.01, drafts: 1, skillPoints: 1 });

// ---------------------------------------------------------------- caps (DESIGN 5.1)
export const YIELD_CAP = 3.0;          // total yield multiplier
export const XP_MULT_CAP = 2.5;
export const MACHINE_SPEED_CAP = 3.0;
export const STRUCT_DISCOUNT_CAP = 0.25;
export const CDR_CAP = 0.5;
export const LIFESTEAL_CAP = 0.15;
export const CRIT_CHANCE_CAP = 0.75;

// ---------------------------------------------------------------- structures
export const REFUND_FRACTION = 0.75;   // floor(paid * 0.75); exactly paid with F4

// ---------------------------------------------------------------- nodes and gathering
export const NODE_RESPAWN_S = 6;
export const NODE_HP = Object.freeze({ 1: 3, 2: 7, 3: 16, 4: 36, 5: 80, 6: 176 });
export const BIG_NODE_MULT = 3;
export const TOO_TOUGH_DAMAGE = 0.1;
export const GEM_NODE_CHANCE = 0.03;
export const GEM_NODE_CHANCE_PROSPECTOR = 0.06;
export const TIDAL_SPAWN_S = 10;
export const TIDAL_CAP = 8;
export const TIDE_CACHE_SHARE = 0.04;

// ---------------------------------------------------------------- machines
export const MACHINE_CAP = 8;
export const SCUTTLER_RATE = 1.0;
export const SCUTTLER_PLUS_ONE = 0.33;
export const BURROW_RARE = 0.005;
export const DRILL_RARE = 0.01;
export const TEND_MINUTES = 30;
export const UNTENDED_SPEED = 0.1;
export const TEND_RADIUS = 12;

// ---------------------------------------------------------------- market
export const SAT_DECAY = 0.99;
export const SAT_FLOOR = 0.01;          // WP14 (BUILD_REVIEW P2-9): was 0.05, which let one good earn 1.66x the cap at 60 units/min
export const SAT_RECOVER_PER_MIN = 0.02;
export const LEDGER_PCT = 0.7;
export const LEDGER_RATE = 20;
export const MINT_PCT = 0.6;
export const MINT_RATE = 30;
export const SHOP_MARKUP = 3;
export const SHOP_STOCK = 40;
export const SPEND_ANNOUNCE_PER_TIER = 2000;

// ---------------------------------------------------------------- combat
export const ARMOR_K = 100;            // reduction = armor / (armor + 100)
export const ELEM_WEAK = 1.5;
export const ELEM_RESIST = 0.5;
export const HOLLOW_ARMOR_IGNORE = 0.3;
export const DMG_ROLL = Object.freeze([0.9, 1.1]);
export const FAVOURED_WEAPON_BONUS = 0.15;
export const ELITE_CHANCE = 0.08;
export const ELITE_MULT = Object.freeze({ hp: 4, dmg: 1.5, xp: 5, loot: 5, glint: 5 });
export const ENRAGE = Object.freeze({ dmg: 0.5, speed: 0.3, wardenEarly: 360, wardenLate: 480 });
export const HARD_MODE = Object.freeze({ hp: 1.0, dmg: 0.25 });
export const MOB_GLINT_PER_TIER = Object.freeze([0, 2]);   // tier * rand(0..2)
export const LUCK_RARE_PER_POINT = 0.005;                  // +0.5% rare-drop chance multiplier per luck
export const DEATH_CHEST_SHARE = 0.5;

// ---------------------------------------------------------------- tempering
export const TEMPER_MAX = 10;
export const TEMPER_STAT_PER_LEVEL = 0.06;
export const TEMPER_GLINT = 25;                             // 25 * tier * n^2
export const TEMPER_SUCCESS = Object.freeze([1, 1, 1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5]);   // index = level - 1

// ---------------------------------------------------------------- draft
export const DRAFT_OFFER = 3;
export const DRAFT_OFFER_MAX = 5;
export const DRAFT_PITY = 5;
export const MYTHIC_PER_LEVELS = 20;
export const REROLL_GLINT_BASE = 50;                        // 50 * level * 2^n
export const FREE_TOKEN_EVERY = 5;
export const BANISH_EVERY = 10;
export const RARITY_BANDS = Object.freeze([
  { from: 2, to: 15, w: { common: 70, uncommon: 25, rare: 5, epic: 0, mythic: 0 } },
  { from: 16, to: 35, w: { common: 55, uncommon: 30, rare: 12, epic: 3, mythic: 0 } },
  { from: 36, to: 60, w: { common: 40, uncommon: 32, rare: 18, epic: 8, mythic: 2 } },
  { from: 61, to: 100, w: { common: 30, uncommon: 30, rare: 22, epic: 13, mythic: 5 } },
]);
// every 10 luck moves 1 point Common -> Rare and 0.5 Uncommon -> Epic
export const LUCK_DRAFT = Object.freeze({ per: 10, commonToRare: 1, uncommonToEpic: 0.5 });

// ---------------------------------------------------------------- Tide Height (Rebirth)
export const TIDE_HEIGHT = Object.freeze({ max: 10, enemyHp: 0.4, enemyDmg: 0.25, costs: 0.15 });
export const TRENCH_SCALE = 1.12;

// ---------------------------------------------------------------- misc
export const RESPEC_GLINT_PER_LEVEL = 100;
export const SIDE_QUEST_XP = 200;     // 200 * tier^2
export const SIDE_QUEST_GLINT = 20;   // 20 * 2^tier
export const SHRINE_GLINT = 100;      // 100 * tier^2
export const INCOME_CURVE = Object.freeze({ base: 150, growth: 1.07, cap: 40000 });

// WP14 (BUILD_REVIEW P1-1, P2-8): world ceilings on automation, scaled by coopScale (rounded).
// Burrows <= BURROW_WORLD_BASE + BURROW_PER_BEACON x lit Beacons; Drills <= DRILL_PER_BEACON x lit Beacons;
// untended producers (Drip Collector, Sap Tap, Creel, Hum Hive) <= PRODUCERS_PER_PLOT per plot.
export const BURROW_WORLD_BASE = 2;
export const BURROW_PER_BEACON = 2;
export const DRILL_PER_BEACON = 2;
export const PRODUCERS_PER_PLOT = 4;
export const CAPPED_PRODUCERS = Object.freeze(['drip_collector', 'sap_tap', 'creel', 'hum_hive']);
// WP14 (BUILD_REVIEW P1-2): selling opens with this Beacon, so Ballast and capped income are the early Glint clocks
// (PACING 4.2 models no sales before hour 22).
export const MARKET_SELL_BEACON = 1;
