// Content index: imports every data file, builds id maps, freezes, and (server) validates.
// Usage: import { content } from 'shared/data/index.js';  content.items.byId.copper_bar, content.nodes.length
// Each content list is a frozen array with a non-enumerable `byId` map. Named exports of a data file
// (e.g. TAG_SETS in cards.js) are available as content.modules.<file>.<name>.
// Missing data files fall back to small built-in placeholders so the skeleton runs before WP2 lands.

import { hashString } from '../rng.js';

export const DATA_FILES = Object.freeze([
  'items', 'recipes', 'structures', 'nodes', 'biomes', 'enemies', 'bosses', 'cards', 'skills',
  'classes', 'abilities', 'crops', 'fish', 'weather', 'dungeons', 'blessings', 'quests', 'npcs',
  'archive', 'deeds', 'rebirth', 'affixes', 'shops',
]);

const PLACEHOLDER = {
  items: [
    { id: 'driftwood', name: 'Driftwood', cat: 'material', tier: 1, value: 1, stack: 999, fuel: 1 },
    { id: 'resin', name: 'Resin', cat: 'material', tier: 1, value: 3, stack: 999, fuel: 0 },
    { id: 'fieldstone', name: 'Fieldstone', cat: 'material', tier: 1, value: 1, stack: 999, fuel: 0 },
    { id: 'peat', name: 'Peat', cat: 'material', tier: 1, value: 1, stack: 999, fuel: 2 },
    { id: 'copper_ore', name: 'Copper Ore', cat: 'material', tier: 1, value: 2, stack: 999, fuel: 0 },
    { id: 'reedfiber', name: 'Reedfiber', cat: 'material', tier: 1, value: 1, stack: 999, fuel: 0 },
    { id: 'marrowberry', name: 'Marrowberry', cat: 'food', tier: 1, value: 1, stack: 999, fuel: 0 },
  ],
  nodes: [
    { id: 'bentwood_tree', biome: 'greenmarrow', tier: 1, hp: 3, cls: 'wood', drops: [{ item: 'driftwood', min: 2, max: 3 }, { item: 'resin', min: 0, max: 1 }], xp: 4, weight: 30, big: 0.05, fx: { hit: 'hit_wood', brk: 'break_wood' }, sfx: 'tap_wood' },
    { id: 'fieldstone_rock', biome: 'greenmarrow', tier: 1, hp: 3, cls: 'stone', drops: [{ item: 'fieldstone', min: 2, max: 3 }, { item: 'peat', min: 0, max: 1 }], xp: 4, weight: 24, big: 0.05, fx: { hit: 'hit_stone', brk: 'break_stone' }, sfx: 'tap_stone' },
    { id: 'copper_vein', biome: 'greenmarrow', tier: 1, hp: 3, cls: 'ore', drops: [{ item: 'copper_ore', min: 2, max: 2 }, { item: 'fieldstone', min: 1, max: 1 }], xp: 6, weight: 14, big: 0.05, fx: { hit: 'hit_stone', brk: 'break_stone' }, sfx: 'tap_stone' },
    { id: 'reed_clump', biome: 'greenmarrow', tier: 1, hp: 1, cls: 'plant', drops: [{ item: 'reedfiber', min: 1, max: 2 }], xp: 2, weight: 16, big: 0, fx: { hit: 'hit_plant', brk: 'break_plant' }, sfx: 'tap_plant' },
    { id: 'marrowberry_bush', biome: 'greenmarrow', tier: 1, hp: 1, cls: 'plant', drops: [{ item: 'marrowberry', min: 1, max: 2 }], xp: 2, weight: 10, big: 0, fx: { hit: 'hit_plant', brk: 'break_plant' }, sfx: 'tap_plant' },
  ],
  biomes: [
    { id: 'greenmarrow', tier: 1, name: 'Greenmarrow', ground: 4, weather: { clear: 70, rain: 30 }, nodeTable: ['bentwood_tree', 'fieldstone_rock', 'copper_vein', 'reed_clump', 'marrowberry_bush'], mobs: { day: [], night: [] }, music: 'greenmarrow', ambient: [], palette: 'greenmarrow' },
  ],
};

function indexList(name, list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const byId = Object.create(null);
  for (const entry of arr) {
    if (entry && typeof entry.id === 'string') byId[entry.id] = entry;
  }
  Object.defineProperty(arr, 'byId', { value: Object.freeze(byId), enumerable: false });
  return arr;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

async function tryImport(path) {
  try { return await import(path); } catch (err) {
    if (typeof process !== 'undefined' && process.env?.TB_VERBOSE) console.warn('[tb:data] missing', path, err.message);
    return null;
  }
}

export async function buildContent() {
  const modules = Object.create(null);
  const placeholders = [];
  const c = { modules, placeholders };
  for (const name of DATA_FILES) {
    const mod = await tryImport(`./${name}.js`);
    let list = mod && Array.isArray(mod.default) ? mod.default : null;
    if (!list) { list = PLACEHOLDER[name] || []; placeholders.push(name); }
    modules[name] = mod ? { ...mod } : {};
    c[name] = indexList(name, list);
  }
  c.registries = await tryImport('./registries.js');
  c.hash = (hashString(JSON.stringify(DATA_FILES.map((n) => c[n]))) >>> 0).toString(16);
  deepFreeze(c.modules);
  for (const name of DATA_FILES) deepFreeze(c[name]);
  return Object.freeze(c);
}

export const content = await buildContent();

// Lookup helper: get('items', 'copper_bar') -> entry or undefined.
export const get = (kind, id) => content[kind]?.byId?.[id];

/**
 * Validate content with shared/data/schema.js (WP2). Accepts a schema module exporting any of
 * validateContent(content) | validateAll(content) | validate(content) | default(content),
 * returning an array of error strings (or {errors}). Returns the error list ([] when the schema is absent).
 */
export async function validateContent(c = content) {
  const schema = await tryImport('./schema.js');
  if (!schema) return [];
  const fn = schema.validateContent || schema.validateAll || schema.validate || schema.default;
  if (typeof fn !== 'function') return [];
  try {
    const r = await fn(c);
    if (Array.isArray(r)) return r;
    if (r && Array.isArray(r.errors)) return r.errors;
    return [];
  } catch (err) {
    return [`schema threw: ${err.message}`];
  }
}
