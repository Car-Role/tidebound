// Engine constants (TECH_SPEC section 4). Frozen after WP1; balance knobs live in shared/rules/constants.js.

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_HZ = 20;
export const SLOW_TICK_HZ = 1;
export const INPUT_HZ = 20;
export const INPUT_STEP_MS = 1000 / INPUT_HZ;
export const INTERP_DELAY_MS = 100;

export const TILE = 16;                 // px per tile (source art)
export const PLOT = 20;                 // tiles per plot edge
export const WORLD_PLOTS = 9;           // plots per world edge
export const WORLD_TILES = PLOT * WORLD_PLOTS;
export const START_PLOT = Object.freeze({ px: 4, py: 4 });
export const CHUNK = PLOT;              // network/render chunk = one plot

export const INTEREST_RADIUS = 28;      // tiles: entities enter interest at 28 ...
export const INTEREST_DROP = 32;        // ... and leave at 32 (hysteresis)

export const MAX_PLAYERS = 8;
export const AUTOSAVE_S = 60;
export const BACKUPS = 5;
export const BACKUP_INTERVAL_S = 600;
export const POS_QUANT = 32;            // positions on the wire = tiles * 32, integers

export const PLAYER_RADIUS = 0.3;
export const REACH = 2.5;
export const MAX_MSG_BYTES = 16384;
export const RATE_LIMIT = 60;           // messages per second per socket
export const PARTY_RANGE = 24;
export const TEND_RADIUS = 12;

// Movement (TECH_SPEC 6.6, DESIGN 5.1)
export const BASE_MOVE_SPEED = 5.0;     // tiles/s; sheet moveSpeed is a fraction over this
export const MOVE_ACCEL = 60;
export const MOVE_FRICTION = 50;
export const DODGE_SPEED = 10;
export const DODGE_TIME = 0.35;
export const DODGE_RECHARGE_S = 2.5;

export const DEFAULT_PORT = 8080;
