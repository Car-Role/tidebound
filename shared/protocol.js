// Wire protocol (TECH_SPEC section 6): message names, action names, state keys, validators.
// Frozen after WP1. Every inbound message passes through a validator below before any system sees it.

import { MAX_PLAYERS } from './config.js';

export const PROTOCOL_VERSION = 1;

export const C2S = Object.freeze({ HELLO: 'hello', INPUT: 'in', DO: 'do', PING: 'ping' });

export const S2C = Object.freeze({
  WELCOME: 'welcome', REJECT: 'reject', CHUNK: 'chunk', TILES: 'tiles', SNAP: 'snap',
  SELF: 'self', WORLD: 'world', FX: 'fx', RES: 'res', TOAST: 'toast', CHAT: 'chat',
  PONG: 'pong', REALM: 'realm', KICKED: 'kicked',
});

export const REJECT_REASONS = Object.freeze(['full', 'version', 'name']);
export const TOAST_KINDS = Object.freeze(['info', 'good', 'warn', 'quest']);

// Button bitmask in `in.b`. Dodge is edge-triggered: the client sets it only on the input in which it was pressed.
export const BUTTON = Object.freeze({ PRIMARY: 1, SECONDARY: 2, DODGE: 4 });

// `do.a` action names (section 6.3), with owning package.
export const ACTION_OWNERS = Object.freeze({
  'gather.swing': 'WP4',
  'inv.move': 'WP4', 'inv.drop': 'WP4', 'inv.sort': 'WP4', 'inv.hotbar': 'WP4',
  'craft.make': 'WP4',
  'station.queue': 'WP4', 'station.take': 'WP4', 'station.fuel': 'WP4',
  'build.place': 'WP4', 'build.remove': 'WP4',
  'use': 'WP1',
  'attack': 'WP5', 'revive': 'WP5', 'boss.summon': 'WP5',
  'card.pick': 'WP6a', 'card.reroll': 'WP6a', 'card.banish': 'WP6a', 'card.skip': 'WP6a', 'card.fuse': 'WP6a',
  'skill.buy': 'WP6a', 'skill.respec': 'WP6a',
  'class.choose': 'WP6b', 'ability.cast': 'WP6b', 'ability.signature': 'WP6b',
  'gear.equip': 'WP6b', 'gear.unequip': 'WP6b', 'gear.temper': 'WP6b', 'item.use': 'WP6b',
  'land.raise': 'WP7', 'waystone.go': 'WP7', 'shrine.act': 'WP7', 'charter.set': 'WP7',
  'machine.config': 'WP8', 'burrow.rename': 'WP8',
  'farm.till': 'WP9', 'farm.plant': 'WP9', 'farm.water': 'WP9', 'farm.harvest': 'WP9',
  'fish.cast': 'WP9', 'fish.reel': 'WP9', 'fish.cancel': 'WP9',
  'market.sell': 'WP9', 'market.buy': 'WP9', 'shop.buy': 'WP9',
  'dungeon.enter': 'WP10', 'dungeon.leave': 'WP10', 'blessing.pick': 'WP10',
  'quest.accept': 'WP11', 'quest.turnin': 'WP11', 'quest.pin': 'WP11',
  'npc.talk': 'WP11', 'archive.donate': 'WP11', 'tidegate.deliver': 'WP11',
  'rebirth.vote': 'WP11', 'moon.buy': 'WP11', 'moon.keep': 'WP14',
  'chat.say': 'WP13', 'ping.mark': 'WP13',
  'coop.kick': 'WP13', 'coop.unbind': 'WP13', 'coop.spendcap': 'WP13',
  'settings.set': 'WP13',
  'cosmetic.equip': 'WP14',
});
export const ACTIONS = Object.freeze(Object.keys(ACTION_OWNERS));
const ACTION_SET = new Set(ACTIONS);

// Actions accepted while the player's entity is downed or dead.
export const DEAD_ALLOWED = Object.freeze(new Set([
  'chat.say', 'ping.mark', 'settings.set', 'quest.pin', 'rebirth.vote',
  'coop.kick', 'coop.unbind', 'coop.spendcap', 'inv.sort', 'inv.hotbar',
]));

export const ERR = Object.freeze({
  RANGE: 'range', COOLDOWN: 'cooldown', COST: 'cost', LOCKED: 'locked', FULL: 'full',
  INVALID: 'invalid', BUSY: 'busy', DEAD: 'dead', DENIED: 'denied',
});

export const SELF_KEYS = Object.freeze([
  'recipes', 'sig', 'inv', 'gear', 'stats', 'xp', 'cards', 'skills', 'class', 'cooldowns',
  'buffs', 'quests', 'deeds', 'fish', 'ui', 'dungeon', 'prefs',
]);
export const WORLD_KEYS = Object.freeze([
  'clock', 'glint', 'plots', 'landNext', 'unlocks', 'beacons', 'flux', 'party', 'archive',
  'mainQuest', 'tidegate', 'market', 'coop', 'raid', 'rebirth', 'tideHeight', 'sheet',
  'charters', 'telemetry',
]);

export const ENTITY_TYPES = Object.freeze([
  'player', 'mob', 'boss', 'node', 'drop', 'structure', 'proj', 'npc', 'summon', 'helper',
  'crop', 'zone', 'chest',
]);

// Public projection keys per type (section 6.5). Common keys i, ty, k, x, y, f, s, hp, mh are always present.
export const PUBLIC_KEYS = Object.freeze({
  player: ['n', 'c', 'cl', 'lv', 'g', 'a', 'at'],
  mob: ['el', 'st', 'tg'],
  boss: ['el', 'st', 'tg', 'ph'],
  node: ['v', 'big'],
  drop: ['it', 'q'],
  structure: ['rot', 'own', 'p', 'on', 'it', 'lv'],
  proj: ['a', 'own'],
  npc: ['q'],
  summon: ['own'],
  helper: ['it'],
  crop: ['st', 'w'],
  zone: ['r', 't'],
  chest: ['own'],
});

// `ping.mark` payload: {x, y, kind}.
export const PING_KINDS = Object.freeze(['need', 'danger', 'look', 'omw']);
export function validatePingMark(d) {
  if (!d || !isNum(d.x, -1e4, 1e4) || !isNum(d.y, -1e4, 1e4)) return null;
  return { x: d.x, y: d.y, kind: PING_KINDS.includes(d.kind) ? d.kind : 'look' };
}

// Successful actions that do NOT count as player activity for `player.active` (plain swings/attacks).
// WP14 (BUILD_REVIEW P2-1): UI-only actions do not count as activity for Tending.
export const PASSIVE_ACTIONS = Object.freeze(new Set(['gather.swing', 'attack', 'chat.say', 'settings.set', 'quest.pin', 'inv.sort', 'inv.hotbar', 'ping.mark']));

// Entity state ids (`s`). Systems may use values >= 16 for type-specific states.
export const STATE = Object.freeze({ IDLE: 0, MOVE: 1, ACT: 2, DODGE: 3, DOWN: 4, DEAD: 5, WINDUP: 6, OFF: 7, HIT: 8 });

export const PLAYER_ANIMS = Object.freeze(['idle', 'run', 'swing', 'roll', 'cast', 'fish', 'down']);

// Facing 0..7: 0 = east, 2 = south (+y), 4 = west, 6 = north.
export function facingFromVector(dx, dy, fallback = 2) {
  if (dx === 0 && dy === 0) return fallback;
  const a = Math.atan2(dy, dx);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
export function vectorFromFacing(f) {
  const a = (f & 7) * (Math.PI / 4);
  return [Math.cos(a), Math.sin(a)];
}

// ---- validators: return a normalised copy, or null when the message is malformed ----

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const isNum = (v, min = -Infinity, max = Infinity) => isFiniteNum(v) && v >= min && v <= max;
export const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
export const isStr = (v, maxLen = 256, minLen = 0) => typeof v === 'string' && v.length >= minLen && v.length <= maxLen;

export function sanitizeName(s) {
  if (typeof s !== 'string') return '';
  // printable ASCII only (the pixel font covers 32..126), collapse whitespace
  return s.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function sanitizeText(s, maxLen = 160) {
  if (typeof s !== 'string') return '';
  return s.replace(/[^\x20-\x7e]/g, '').slice(0, maxLen).trim();
}

export function validateHello(m) {
  if (!m || m.t !== C2S.HELLO) return { ok: false, reason: 'version' };
  if (m.v !== PROTOCOL_VERSION) return { ok: false, reason: 'version' };
  const name = sanitizeName(m.name);
  if (name.length < 1) return { ok: false, reason: 'name' };
  const token = typeof m.token === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(m.token) ? m.token : null;
  if (!token) return { ok: false, reason: 'version' };
  const color = isInt(m.color, 0, 7) ? m.color : 0;
  return { ok: true, hello: { token, name, color } };
}

export function validateInput(m) {
  if (!m || !isInt(m.n, 0, 2 ** 31)) return null;
  const clampAxis = (v) => (isFiniteNum(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return {
    n: m.n,
    mx: clampAxis(m.mx),
    my: clampAxis(m.my),
    ax: isInt(m.ax, -1e6, 1e6) ? m.ax : null,
    ay: isInt(m.ay, -1e6, 1e6) ? m.ay : null,
    b: isInt(m.b, 0, 255) ? m.b : 0,
    dt: isNum(m.dt, 0, 250) ? m.dt : 50,
  };
}

export function validateDo(m) {
  if (!m || !isInt(m.n, 0, 2 ** 31) || !isStr(m.a, 32, 1)) return null;
  if (!ACTION_SET.has(m.a)) return { n: m.n, a: m.a, d: {}, unknown: true };
  const d = m.d && typeof m.d === 'object' && !Array.isArray(m.d) ? m.d : {};
  return { n: m.n, a: m.a, d };
}

export function validatePing(m) {
  return m && isNum(m.c, 0, 1e15) ? { c: m.c } : null;
}

export { MAX_PLAYERS };
