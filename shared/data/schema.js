// Content validation (TECH_SPEC 7, 7.1). Plain ES module, no Node-only imports.
//
// API
//   validateContent(content, extras?) -> string[]   schema + cross-reference errors (empty array = valid)
//   validateTable(name, rows, content?) -> string[] one table's schema errors (content enables reference checks)
//   assertValid(content, extras?)                    throws Error listing every problem
//   TABLE_NAMES                                      the content tables, named like their files in shared/data
// `content` is { items: [...], recipes: [...], ... } (arrays, as default-exported by each data file).
// `extras` holds the named exports that carry content: { GROUPS, TAG_SETS, TIDEGATE_STAGES, FEATURES, ARMOR_SETS }.
import * as REG from './registries.js';

export const TABLE_NAMES = Object.freeze([
  'items', 'recipes', 'structures', 'nodes', 'biomes', 'enemies', 'bosses', 'cards', 'skills', 'classes', 'abilities',
  'crops', 'fish', 'weather', 'dungeons', 'blessings', 'quests', 'npcs', 'archive', 'deeds', 'rebirth', 'affixes', 'shops',
]);

const has = (arr, v) => arr.indexOf(v) >= 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isArr = Array.isArray;
const isObj = (v) => v !== null && typeof v === 'object' && !isArr(v);
const optKeys = (spec) => spec.filter((k) => k.endsWith('?')).map((k) => k.slice(0, -1));
const reqKeys = (spec) => spec.filter((k) => !k.endsWith('?'));

function ctxOf(content = {}, extras = {}) {
  const ids = (t) => new Set((content[t] || []).map((r) => r.id));
  return {
    content, extras,
    items: ids('items'), structures: ids('structures'), nodes: ids('nodes'), enemies: ids('enemies'), bosses: ids('bosses'),
    cards: ids('cards'), skills: ids('skills'), classes: ids('classes'), abilities: ids('abilities'), crops: ids('crops'),
    fish: ids('fish'), quests: ids('quests'), npcs: ids('npcs'), dungeons: ids('dungeons'), recipes: ids('recipes'),
    groups: new Set(Object.keys(extras.GROUPS || {})),
    structById: new Map((content.structures || []).map((s) => [s.id, s])),
    full: !!content.items,
  };
}

// ---------------------------------------------------------------- shared validators
function checkKeys(o, allowed, where, errs) {
  for (const k of Object.keys(o)) if (!has(allowed, k)) errs.push(`${where}: unknown key '${k}'`);
}

function checkMods(list, where, errs, { allowMul = false, world = false, mulTag = null } = {}) {
  if (list == null) return;
  if (!isArr(list)) { errs.push(`${where}: mods must be an array`); return; }
  list.forEach((m, i) => {
    const w = `${where}.mods[${i}]`;
    if (!isObj(m)) { errs.push(`${w}: not an object`); return; }
    checkKeys(m, ['stat', 'op', 'v', 'when'], w, errs);
    const statOk = world ? has(REG.WORLD_STAT_IDS, m.stat) : has(REG.STAT_IDS, m.stat);
    if (!statOk) errs.push(`${w}: unknown ${world ? 'world ' : ''}stat '${m.stat}'`);
    if (!has(REG.MOD_OPS, m.op)) errs.push(`${w}: bad op '${m.op}'`);
    if (m.op === 'mul' && !allowMul && !(mulTag && has(REG.MUL_EXCEPTIONS, mulTag))) errs.push(`${w}: op 'mul' not allowed here`);
    if (!isNum(m.v)) errs.push(`${w}: v must be a number`);
    if (m.when != null && !has(REG.CONDITION_IDS, m.when)) errs.push(`${w}: unknown condition '${m.when}'`);
  });
}

function checkProc(proc, where, errs, ctx) {
  if (proc == null) return;
  if (isArr(proc)) { proc.forEach((p, i) => checkProc(p, `${where}[${i}]`, errs, ctx)); return; }
  if (!isObj(proc)) { errs.push(`${where}: proc must be an object`); return; }
  checkKeys(proc, ['on', 'id', 'p', ...REG.PROC_EXTRA_KEYS], where, errs);
  if (!has(REG.PROC_TRIGGERS, proc.on)) errs.push(`${where}: unknown proc trigger '${proc.on}'`);
  const spec = REG.PROCS[proc.id];
  if (!spec) { errs.push(`${where}: unknown proc id '${proc.id}'`); return; }
  const p = proc.p || {};
  const allowed = [...reqKeys(spec), ...optKeys(spec)];
  for (const k of Object.keys(p)) if (!has(allowed, k)) errs.push(`${where}: proc '${proc.id}' does not take param '${k}'`);
  for (const k of reqKeys(spec)) if (!(k in p)) errs.push(`${where}: proc '${proc.id}' missing param '${k}'`);
  if ('status' in p && !has(REG.STATUSES, p.status)) errs.push(`${where}: unknown status '${p.status}'`);
  if ('stat' in p && !has(REG.STAT_IDS, p.stat)) errs.push(`${where}: unknown stat '${p.stat}'`);
  if ('cls' in p && !has(REG.NODE_CLASSES, p.cls)) errs.push(`${where}: unknown node class '${p.cls}'`);
  if ('mods' in p) checkMods(p.mods, where + '.p', errs);
  if ('item' in p && ctx.full && p.item !== 'rare_of_tier' && !ctx.items.has(p.item)) errs.push(`${where}: unknown item '${p.item}'`);
  if (proc.scale != null) {
    if (!isArr(proc.scale)) errs.push(`${where}: scale must be an array of param names`);
    else for (const k of proc.scale) if (!(k in p)) errs.push(`${where}: scale names missing param '${k}'`);
  }
}

function checkFlags(flags, where, errs) {
  if (flags == null) return;
  if (!isArr(flags)) { errs.push(`${where}: flags must be an array`); return; }
  for (const f of flags) if (!has(REG.FLAG_IDS, f)) errs.push(`${where}: unknown flag '${f}'`);
}

function checkEffects(effects, where, errs, ctx) {
  if (effects == null) return;
  if (!isArr(effects)) { errs.push(`${where}: effects must be an array`); return; }
  effects.forEach((e, i) => {
    const w = `${where}.effects[${i}]`;
    const spec = REG.EFFECTS[e && e.id];
    if (!spec) { errs.push(`${w}: unknown effect '${e && e.id}'`); return; }
    const allowed = [...reqKeys(spec), ...optKeys(spec)];
    for (const k of Object.keys(e)) if (k !== 'id' && !has(allowed, k)) errs.push(`${w}: effect '${e.id}' does not take '${k}'`);
    for (const k of reqKeys(spec)) if (!(k in e)) errs.push(`${w}: effect '${e.id}' missing '${k}'`);
    if ('item' in e && ctx.full && !ctx.items.has(e.item)) errs.push(`${w}: unknown item '${e.item}'`);
    if ('stat' in e && !has(REG.STAT_IDS, e.stat)) errs.push(`${w}: unknown stat '${e.stat}'`);
  });
}

// Bonus bundle used by cards, sets, skills, blessings, perks, line rewards: mods/worldMods/proc/flags/effects.
function checkBundle(o, where, errs, ctx, opts = {}) {
  checkMods(o.mods, where, errs, opts);
  checkMods(o.worldMods, where + '.world', errs, { ...opts, world: true });
  checkProc(o.proc, where + '.proc', errs, ctx);
  checkFlags(o.flags, where, errs);
  checkEffects(o.effects, where, errs, ctx);
}

export function checkUnlock(u, where, errs, ctx) {
  if (!isArr(u)) { errs.push(`${where}: unlock must be an array`); return; }
  for (const s of u) {
    if (!isStr(s) || s.indexOf(':') < 0) { errs.push(`${where}: bad unlock '${s}'`); continue; }
    const [kind, val] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)];
    if (!has(REG.UNLOCK_KINDS, kind)) { errs.push(`${where}: unknown unlock kind '${kind}'`); continue; }
    if (kind === 'level' && !(Number(val) >= 1 && Number(val) <= 100)) errs.push(`${where}: bad level '${val}'`);
    if ((kind === 'beacon' || kind === 'vault') && !(Number(val) >= 1 && Number(val) <= 6)) errs.push(`${where}: bad ${kind} '${val}'`);
    if (!ctx.full) continue;
    if (kind === 'skill' && !ctx.skills.has(val)) errs.push(`${where}: unknown skill '${val}'`);
    if (kind === 'quest' && !ctx.quests.has(val)) errs.push(`${where}: unknown quest '${val}'`);
    if (kind === 'boss' && !ctx.bosses.has(val)) errs.push(`${where}: unknown boss '${val}'`);
  }
}

function checkCost(list, where, errs, ctx) {
  if (!isArr(list)) { errs.push(`${where}: cost must be an array`); return; }
  list.forEach((c, i) => {
    const w = `${where}[${i}]`;
    if (!isNum(c.qty) || c.qty <= 0) errs.push(`${w}: qty must be > 0`);
    if (c.item != null) { if (ctx.full && !ctx.items.has(c.item)) errs.push(`${w}: unknown item '${c.item}'`); }
    else if (c.group != null) { if (ctx.full && !ctx.groups.has(c.group)) errs.push(`${w}: unknown group '${c.group}'`); }
    else errs.push(`${w}: needs item or group`);
  });
}

const checkFx = (name, where, errs) => { if (name != null && !has(REG.FX_PRESETS, name)) errs.push(`${where}: unknown fx preset '${name}'`); };
const req = (o, keys, where, errs) => { for (const k of keys) if (o[k] === undefined) errs.push(`${where}: missing '${k}'`); };
const refItem = (id, where, errs, ctx) => { if (ctx.full && !ctx.items.has(id)) errs.push(`${where}: unknown item '${id}'`); };

// ---------------------------------------------------------------- per-table validators
const V = {};

V.items = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'cat', 'tier', 'value', 'stack', 'fuel', 'gear', 'mods', 'proc', 'flags', 'effects', 'use', 'places',
    'kind', 'bar', 'crop', 'rarity', 'source', 'found', 'sellOnly', 'cosmetic'], w, errs);
  req(o, ['id', 'name', 'cat', 'tier', 'value', 'stack'], w, errs);
  if (!has(REG.ITEM_CATS, o.cat)) errs.push(`${w}: unknown cat '${o.cat}'`);
  if (!isNum(o.value) || o.value < 0) errs.push(`${w}: bad value`);
  if (o.fuel != null && !(o.fuel > 0)) errs.push(`${w}: bad fuel`);
  if (o.gear) {
    if (!has(REG.GEAR_SLOTS, o.gear.slot)) errs.push(`${w}: unknown gear slot '${o.gear.slot}'`);
    if (o.gear.wtype && !has(REG.WEAPON_TYPES, o.gear.wtype)) errs.push(`${w}: unknown weapon type`);
    if (o.gear.element && !has(REG.ELEMENTS, o.gear.element)) errs.push(`${w}: unknown element`);
    if (o.stack !== 1) errs.push(`${w}: gear must stack 1`);
  }
  checkBundle(o, w, errs, ctx, { mulTag: 'item:' + o.id });
  if (o.use) {
    if (!has(REG.USE_KINDS, o.use.kind)) errs.push(`${w}: unknown use kind '${o.use.kind}'`);
    if (o.use.buff) {
      if (!has(REG.BUFF_IDS, o.use.buff.id)) errs.push(`${w}: unknown buff id '${o.use.buff.id}'`);
      checkMods(o.use.buff.mods, w + '.buff', errs);
      checkFlags(o.use.buff.flags, w + '.buff', errs);
    }
    if (o.use.boss && ctx.full && !ctx.bosses.has(o.use.boss)) errs.push(`${w}: unknown boss '${o.use.boss}'`);
    if (o.use.node && ctx.full && !ctx.nodes.has(o.use.node)) errs.push(`${w}: unknown node '${o.use.node}'`);
  }
  if (o.places && ctx.full && !ctx.structures.has(o.places)) errs.push(`${w}: places unknown structure '${o.places}'`);
  if (o.cat === 'placeable' && !o.places) errs.push(`${w}: placeable without places`);
};

V.recipes = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'out', 'in', 'fuel', 'station', 'time', 'unlock'], w, errs);
  req(o, ['id', 'out', 'in', 'station', 'time', 'unlock'], w, errs);
  if (!o.out || !isNum(o.out.qty) || o.out.qty <= 0) errs.push(`${w}: bad out`);
  else refItem(o.out.item, w + '.out', errs, ctx);
  checkCost(o.in || [], w + '.in', errs, ctx);
  if (!(o.time > 0)) errs.push(`${w}: time must be > 0`);
  checkUnlock(o.unlock || [], w, errs, ctx);
  if (o.station !== 'hand' && ctx.full) {
    const s = ctx.structById.get(o.station);
    if (!s) errs.push(`${w}: unknown station '${o.station}'`);
    else if (!s.station) errs.push(`${w}: '${o.station}' is not a station`);
    const isKiln = /^kiln(_\d)?$/.test(o.station);
    if (isKiln && !isNum(o.fuel)) errs.push(`${w}: Kiln recipe must list fuel explicitly`);
    if (!isKiln && o.fuel != null) errs.push(`${w}: fuel only on Kiln recipes`);
  }
};

V.structures = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'cat', 'w', 'h', 'solid', 'cost', 'glint', 'world', 'unlock', 'hp', 'light', 'countsToCap', 'tend', 'place',
    'station', 'container', 'machine', 'natural', 'beacon', 'respawn', 'noSpawnRadius', 'channel', 'gate', 'watersAdjacent', 'waters',
    'protects', 'cropAura', 'trap', 'tideBonus', 'blizzardMult', 'consumes', 'personal', 'hits'], w, errs);
  req(o, ['id', 'name', 'cat', 'w', 'h', 'cost', 'unlock'], w, errs);
  if (!has(REG.STRUCTURE_CATS, o.cat)) errs.push(`${w}: unknown cat '${o.cat}'`);
  checkCost(o.cost || [], w + '.cost', errs, ctx);
  checkUnlock(o.unlock || [], w, errs, ctx);
  if (o.place) for (const p of o.place.on || []) if (!has(REG.PLACE_ON, p)) errs.push(`${w}: bad place.on '${p}'`);
  if (o.place && o.place.needs != null && !has(REG.BIOME_IDS, o.place.needs)) errs.push(`${w}: bad place.needs`);
  if (o.machine) {
    const spec = REG.MACHINE_TYPES[o.machine.type];
    if (!spec) errs.push(`${w}: unknown machine type '${o.machine.type}'`);
    else {
      const allowed = ['type', 'flux', ...reqKeys(spec), ...optKeys(spec), 'filterSlots', 'dmgPerPlotTier'];
      for (const k of Object.keys(o.machine)) if (!has(allowed, k)) errs.push(`${w}: machine '${o.machine.type}' does not take '${k}'`);
      for (const k of reqKeys(spec)) if (!(k in o.machine)) errs.push(`${w}: machine missing '${k}'`);
      if (!isNum(o.machine.flux)) errs.push(`${w}: machine.flux must be a number`);
      if (o.machine.type === 'generator' && !has(REG.GENERATOR_CONDS, o.machine.cond)) errs.push(`${w}: bad generator cond`);
      if (o.machine.type === 'producer') {
        if (!has(REG.PRODUCER_CONDS, o.machine.cond)) errs.push(`${w}: bad producer cond`);
        if (o.machine.item) refItem(o.machine.item, w, errs, ctx);
        if (o.machine.table && !has(REG.PRODUCER_TABLES, o.machine.table)) errs.push(`${w}: bad producer table`);
        if (!o.machine.item && !o.machine.table) errs.push(`${w}: producer needs item or table`);
      }
    }
  }
};

V.nodes = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'biome', 'tier', 'hp', 'hits', 'cls', 'drops', 'xp', 'weight', 'big', 'fx', 'sfx', 'xpPerTier', 'glintPerTier',
    'rawOfTier', 'tokenChance', 'rareOfTier', 'hpMult', 'idleFx', 'oreOfTier'], w, errs);
  if (!has(REG.NODE_CLASSES, o.cls)) errs.push(`${w}: unknown cls '${o.cls}'`);
  if (!(has(REG.BIOME_IDS, o.biome) || has(['tidal', 'any', 'vault'], o.biome))) errs.push(`${w}: bad biome '${o.biome}'`);
  for (const d of o.drops || []) { refItem(d.item, w, errs, ctx); if (!(d.min <= d.max)) errs.push(`${w}: drop min > max`); if (d.p != null && !(d.p > 0 && d.p <= 1)) errs.push(`${w}: bad drop p`); }
  if (o.fx) { checkFx(o.fx.hit, w, errs); checkFx(o.fx.brk, w, errs); }
  checkFx(o.idleFx, w, errs);
};

V.biomes = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'tier', 'name', 'ground', 'plots', 'ordinals', 'weather', 'nodeTable', 'mobs', 'music', 'ambient', 'palette', 'ballast', 'rare', 'look'], w, errs);
  if (!has(REG.BIOME_IDS, o.id)) errs.push(`${w}: unknown biome id`);
  const ws = Object.entries(o.weather || {});
  for (const [k] of ws) if (!has(REG.WEATHER_IDS, k)) errs.push(`${w}: unknown weather '${k}'`);
  if (ws.reduce((a, [, v]) => a + v, 0) !== 100) errs.push(`${w}: weather weights must sum to 100`);
  if (ctx.full) {
    for (const n of o.nodeTable || []) if (!ctx.nodes.has(n)) errs.push(`${w}: unknown node '${n}'`);
    for (const e of [...(o.mobs?.day || []), ...(o.mobs?.night || [])]) if (!ctx.enemies.has(e)) errs.push(`${w}: unknown enemy '${e}'`);
    refItem(o.ballast?.item, w, errs, ctx); refItem(o.rare, w, errs, ctx);
  }
  for (const a of o.ambient || []) checkFx(a, w, errs);
  if (!has(REG.MUSIC_IDS, o.music)) errs.push(`${w}: unknown music '${o.music}'`);
};

V.enemies = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'tier', 'biome', 'hp', 'dmg', 'speed', 'xp', 'armor', 'ai', 'aiParams', 'weak', 'resist', 'radius', 'night', 'loot', 'glint', 'blood', 'fxHit', 'raid'], w, errs);
  const spec = REG.AI_ARCHETYPES[o.ai];
  if (!spec) errs.push(`${w}: unknown AI archetype '${o.ai}'`);
  else {
    const allowed = [...reqKeys(spec), ...optKeys(spec)];
    for (const k of Object.keys(o.aiParams || {})) if (!has(allowed, k)) errs.push(`${w}: AI '${o.ai}' does not read '${k}'`);
    for (const k of reqKeys(spec)) if (!(k in (o.aiParams || {}))) errs.push(`${w}: AI '${o.ai}' missing '${k}'`);
  }
  if (!has(REG.ELEMENTS, o.weak)) errs.push(`${w}: bad weak element '${o.weak}'`);
  if (!has(REG.ELEMENTS, o.resist)) errs.push(`${w}: bad resist element '${o.resist}'`);
  if (!has(REG.BIOME_IDS, o.biome)) errs.push(`${w}: bad biome`);
  for (const l of o.loot || []) refItem(l.item, w, errs, ctx);
  checkFx(o.fxHit, w, errs);
};

V.bosses = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'kind', 'k', 'biome', 'hp', 'dmg', 'enrage', 'lure', 'phases', 'script', 'moves', 'fx', 'loot', 'music',
    'singers', 'count', 'phaseHp', 'enragePhase', 'arena', 'rewards'], w, errs);
  if (!has(REG.BOSS_KINDS, o.kind)) errs.push(`${w}: bad kind`);
  if (!has(REG.BOSS_SCRIPTS, o.script)) errs.push(`${w}: unknown boss script '${o.script}'`);
  if (o.kind === 'warden') refItem(o.lure, w, errs, ctx);
  for (const l of o.loot || []) refItem(l.item, w, errs, ctx);
  checkFx(o.fx, w, errs);
  if (!isArr(o.phases) || o.phases.length !== 3) errs.push(`${w}: needs 3 phases`);
};

V.cards = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'rarity', 'tag', 'max', 'text', 'mods', 'perRank', 'proc', 'flags', 'effects', 'worldMods', 'worldRule', 'grants'], w, errs);
  if (!has(REG.RARITIES, o.rarity)) errs.push(`${w}: bad rarity`);
  if (!has(REG.CARD_TAGS, o.tag)) errs.push(`${w}: bad tag '${o.tag}'`);
  const MAX = { common: 5, uncommon: 4, rare: 3, epic: 2, mythic: 1 };
  if (o.max !== MAX[o.rarity]) errs.push(`${w}: max rank must be ${MAX[o.rarity]}`);
  checkBundle(o, w, errs, ctx);
  if (o.perRank) {
    if (!isArr(o.perRank) || o.perRank.length !== o.max) errs.push(`${w}: perRank must have ${o.max} entries`);
    else o.perRank.forEach((r, i) => checkBundle(r, `${w}.perRank[${i}]`, errs, ctx));
  }
  for (const g of o.grants || []) refItem(g.item, w, errs, ctx);
};

V.skills = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'branch', 'row', 'col', 'cost', 'name', 'text', 'mods', 'unlocks', 'proc', 'flags', 'effects', 'worldMods'], w, errs);
  if (!has(REG.SKILL_BRANCHES, o.branch)) errs.push(`${w}: bad branch`);
  if (!(o.row >= 1 && o.row <= 3) || o.cost !== o.row) errs.push(`${w}: cost must equal row (1..3)`);
  checkBundle(o, w, errs, ctx, { mulTag: 'skill:' + o.id });
  if (ctx.full) for (const s of o.unlocks || []) {
    const st = ctx.structById.get(s);
    if (!st) errs.push(`${w}: unlocks unknown structure '${s}'`);
    else if (!(st.unlock || []).includes('skill:' + o.id)) errs.push(`${w}: structure '${s}' does not list skill:${o.id}`);
  }
};

V.classes = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'role', 'favoured', 'primary', 'color', 'passive', 'abilities'], w, errs);
  if (!has(REG.WEAPON_TYPES, o.favoured)) errs.push(`${w}: bad favoured weapon`);
  if (!has(REG.STAT_IDS, o.primary)) errs.push(`${w}: bad primary stat`);
  checkBundle(o.passive || {}, w + '.passive', errs, ctx, { allowMul: true });
  if (!isArr(o.abilities) || o.abilities.length !== 4) errs.push(`${w}: needs 4 abilities`);
  if (ctx.full) for (const a of o.abilities || []) if (!ctx.abilities.has(a)) errs.push(`${w}: unknown ability '${a}'`);
};

V.abilities = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'class', 'slot', 'level', 'name', 'surge', 'cd', 'target', 'range', 'params', 'upgrade', 'signature', 'text', 'fx', 'sfx', 'icon', 'flags'], w, errs);
  if (!has(REG.ABILITY_TARGETS, o.target)) errs.push(`${w}: bad target '${o.target}'`);
  if (o.level !== REG.ABILITY_LEVELS[o.slot]) errs.push(`${w}: level must be ${REG.ABILITY_LEVELS[o.slot]} for slot ${o.slot}`);
  const chkParams = (p, ww) => { for (const k of Object.keys(p || {})) if (!has(REG.ABILITY_PARAM_KEYS, k)) errs.push(`${ww}: param '${k}' not allowed`); };
  chkParams(o.params, w);
  for (const part of ['upgrade', 'signature']) {
    const u = o[part];
    if (!isObj(u)) { errs.push(`${w}: missing ${part}`); continue; }
    chkParams(u.params, `${w}.${part}`);
    for (const k of Object.keys(u)) if (!has(['params', 'flags', 'mastery'], k)) errs.push(`${w}.${part}: unknown key '${k}'`);
    if (!u.params && !(u.flags && u.flags.length)) errs.push(`${w}.${part}: empty`);
  }
  if (ctx.full && !ctx.classes.has(o.class)) errs.push(`${w}: unknown class`);
  checkFx(o.fx, w, errs);
};

V.crops = (o, w, errs, ctx) => {
  refItem(o.seed, w, errs, ctx); refItem(o.id, w, errs, ctx);
  if (!isArr(o.yield) || o.yield.length !== 2) errs.push(`${w}: bad yield`);
  if (!(o.stages > 0 && o.stageTime > 0)) errs.push(`${w}: bad stages`);
};

V.fish = (o, w, errs, ctx) => {
  if (!has(REG.FISH_RARITIES, o.rarity)) errs.push(`${w}: bad rarity`);
  if (!has(REG.BIOME_IDS, o.biome)) errs.push(`${w}: bad biome`);
  for (const [k, v] of Object.entries(o.cond || {})) {
    if (!has(REG.FISH_CONDS, k)) errs.push(`${w}: bad cond key '${k}'`);
    if (k === 'weather' && !has(REG.WEATHER_IDS, v)) errs.push(`${w}: bad weather '${v}'`);
    if (k === 'phase' && !has(REG.DAY_PHASES, v)) errs.push(`${w}: bad phase '${v}'`);
  }
  refItem(o.id, w, errs, ctx);
};

V.weather = (o, w, errs, ctx) => {
  if (!has(REG.WEATHER_IDS, o.id)) errs.push(`${w}: unknown weather id`);
  checkMods(o.mods, w, errs); checkFlags(o.flags, w, errs); checkFx(o.fx, w, errs);
};

V.dungeons = (o, w, errs, ctx) => {
  if (!has(REG.DUNGEON_MECHANICS, o.mechanic)) errs.push(`${w}: unknown mechanic '${o.mechanic}'`);
  if (ctx.full) {
    const b = (ctx.content.bosses || []).find((x) => x.id === o.keeper);
    if (!b || b.kind !== 'keeper') errs.push(`${w}: keeper '${o.keeper}' is not a keeper boss`);
    for (const m of o.mobs || []) if (!ctx.enemies.has(m)) errs.push(`${w}: unknown mob '${m}'`);
  }
  refItem(o.key, w, errs, ctx);
  for (const r of o.firstReward || []) refItem(r.item, w, errs, ctx);
  if (o.relic) refItem(o.relic, w, errs, ctx);
};

V.blessings = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'text', 'mods', 'proc', 'flags', 'effects', 'once'], w, errs);
  if (!/^bl_/.test(o.id)) errs.push(`${w}: blessing ids start with bl_`);
  checkBundle(o, w, errs, ctx);
};

function checkGoal(g, w, errs, ctx) {
  if (!has(REG.QUEST_GOAL_KINDS, g.kind)) { errs.push(`${w}: unknown goal kind '${g.kind}'`); return; }
  if (!ctx.full || g.target == null || isObj(g.n)) return;   // board templates use placeholders
  const targets = isArr(g.target) ? g.target : [g.target];
  for (const t of targets) {
    let ok = true;
    switch (g.kind) {
      case 'build': ok = ctx.structures.has(t); break;
      case 'craft': case 'deliver': case 'collect': case 'donate': ok = ctx.items.has(t); break;
      case 'kill': ok = ctx.enemies.has(t) || ctx.bosses.has(t); break;
      case 'kill_elite': ok = ctx.enemies.has(t); break;
      case 'clear': ok = ctx.dungeons.has(t); break;
      case 'catch': ok = ctx.fish.has(t); break;
      case 'counter': ok = has(REG.COUNTERS, t); break;
      case 'reach': ok = has(REG.REACH_TARGETS, t); break;
      default: ok = true;
    }
    if (!ok) errs.push(`${w}: goal ${g.kind} target '${t}' does not exist`);
  }
  if (!(g.n > 0)) errs.push(`${w}: goal n must be > 0`);
}

V.quests = (o, w, errs, ctx) => {
  if (!has(REG.QUEST_TYPES, o.type)) errs.push(`${w}: bad type`);
  (o.goals || []).forEach((g, i) => checkGoal(g, `${w}.goals[${i}]`, errs, ctx));
  if (!(o.goals || []).length) errs.push(`${w}: no goals`);
  if (ctx.full && o.prereq && !ctx.quests.has(o.prereq)) errs.push(`${w}: unknown prereq '${o.prereq}'`);
  if (ctx.full && o.type === 'side' && !ctx.npcs.has(o.giver)) errs.push(`${w}: unknown giver`);
  for (const it of o.rewards?.items || []) if (o.type !== 'board') refItem(it.item, w, errs, ctx);
  if (ctx.full) for (const r of o.rewards?.showRecipes || []) if (!ctx.recipes.has(r)) errs.push(`${w}: unknown recipe '${r}'`);
};

V.npcs = (o, w, errs, ctx) => {
  if (!has(REG.BIOME_IDS, o.biome)) errs.push(`${w}: bad biome`);
  if (ctx.full) for (const q of o.quests || []) if (!ctx.quests.has(q)) errs.push(`${w}: unknown quest '${q}'`);
  for (const s of o.shop || []) if (s.item) refItem(s.item, w, errs, ctx);
  const lr = o.lineReward || {};
  for (const it of lr.items || []) refItem(it.item, w, errs, ctx);
  if (ctx.full) for (const r of lr.recipes || []) if (!ctx.recipes.has(r)) errs.push(`${w}: unknown recipe '${r}'`);
  checkBundle(lr, w + '.lineReward', errs, ctx);
};

V.archive = (o, w, errs, ctx) => {
  if (!isArr(o.items) || o.items.length !== 12) errs.push(`${w}: wing needs 12 items`);
  for (const it of o.items || []) refItem(it, w, errs, ctx);
  checkMods(o.reward?.worldMods, w + '.reward', errs, { world: true });
  if (o.reward?.skillPoint !== 1) errs.push(`${w}: wing reward gives 1 skill point`);
};

V.deeds = (o, w, errs) => {
  if (!has(REG.DEED_CATS, o.cat)) errs.push(`${w}: bad cat`);
  if (!has(REG.COUNTERS, o.counter)) errs.push(`${w}: unknown counter '${o.counter}'`);
  if (!isArr(o.tiers) || o.tiers.length !== 3 || !(o.tiers[0] < o.tiers[1] && o.tiers[1] < o.tiers[2])) errs.push(`${w}: tiers must be 3 ascending`);
};

V.rebirth = (o, w, errs, ctx) => {
  checkKeys(o, ['id', 'name', 'text', 'ranks', 'cost', 'mods', 'worldMods', 'effects', 'flags'], w, errs);
  if (!isArr(o.cost) || o.cost.length !== o.ranks) errs.push(`${w}: cost per rank`);
  checkBundle(o, w, errs, ctx, { allowMul: true });
};

V.affixes = (o, w, errs) => { if (!has(REG.AFFIX_IDS, o.id)) errs.push(`${w}: unknown affix id`); };

V.shops = (o, w, errs, ctx) => {
  if (ctx.full && !ctx.npcs.has(o.npc)) errs.push(`${w}: unknown npc '${o.npc}'`);
  for (const s of o.stock || []) {
    if (s.item) refItem(s.item, w, errs, ctx);
    else if (!s.pool) errs.push(`${w}: stock line needs item or pool`);
    if (!(s.price > 0 && s.stock > 0)) errs.push(`${w}: bad price/stock`);
  }
};

// ---------------------------------------------------------------- entry points
export function validateTable(name, rows, content = {}, extras = {}) {
  const errs = [];
  const v = V[name];
  if (!v) return [`unknown table '${name}'`];
  if (!isArr(rows)) return [`${name}: must export an array`];
  const ctx = ctxOf(content, extras);
  const seen = new Set();
  rows.forEach((o, i) => {
    const id = o.id || o.npc || i;
    const w = `${name}[${id}]`;
    if (o.id != null || name !== 'shops') {
      if (!isStr(o.id) && name !== 'shops') errs.push(`${w}: missing id`);
      if (seen.has(o.id)) errs.push(`${w}: duplicate id`);
      seen.add(o.id);
    }
    try { v(o, w, errs, ctx); } catch (e) { errs.push(`${w}: validator threw ${e.message}`); }
  });
  return errs;
}

// Named exports that carry content, taken from content.modules (shared/data/index.js) when not passed explicitly.
export function extrasFrom(content) {
  const m = content.modules || {};
  return {
    GROUPS: m.recipes?.GROUPS, STATION_TIERS: m.recipes?.STATION_TIERS, TAG_SETS: m.cards?.TAG_SETS,
    TIDEGATE_STAGES: m.structures?.TIDEGATE_STAGES, ARMOR_SETS: m.items?.ARMOR_SETS, DIG_SITES: m.biomes?.DIG_SITES,
    SHRINE_TRINKETS: m.items?.SHRINE_TRINKETS, TRENCH_TRINKETS: m.items?.TRENCH_TRINKETS,
  };
}

export function validateContent(content, extras = null) {
  if (!extras) extras = extrasFrom(content);
  const errs = [];
  for (const t of TABLE_NAMES) {
    if (!content[t]) { errs.push(`missing table '${t}'`); continue; }
    errs.push(...validateTable(t, content[t], content, extras));
  }
  const ctx = ctxOf(content, extras);
  // card set bonuses
  for (const [tag, sets] of Object.entries(extras.TAG_SETS || {})) {
    if (!has(REG.CARD_TAGS, tag)) errs.push(`TAG_SETS: unknown tag '${tag}'`);
    const ks = Object.keys(sets).map(Number).sort((a, b) => a - b);
    if (ks.join(',') !== '3,5,7') errs.push(`TAG_SETS.${tag}: thresholds must be 3/5/7`);
    for (const k of ks) checkBundle(sets[k], `TAG_SETS.${tag}.${k}`, errs, ctx, { allowMul: true });
  }
  for (const [g, members] of Object.entries(extras.GROUPS || {})) {
    for (const [it, mult] of Object.entries(members)) {
      if (!ctx.items.has(it)) errs.push(`GROUPS.${g}: unknown item '${it}'`);
      if (!(mult > 0)) errs.push(`GROUPS.${g}: bad multiplier`);
    }
    if (!Object.keys(members).length) errs.push(`GROUPS.${g}: empty`);
  }
  for (const s of extras.TIDEGATE_STAGES || []) {
    checkCost(s.cost, `TIDEGATE_STAGES[${s.stage}]`, errs, ctx);
    checkUnlock(s.unlock, `TIDEGATE_STAGES[${s.stage}]`, errs, ctx);
  }
  for (const [k, set] of Object.entries(extras.ARMOR_SETS || {})) checkBundle(set, `ARMOR_SETS.${k}`, errs, ctx);
  return errs;
}

export function assertValid(content, extras) {
  const errs = validateContent(content, extras);
  if (errs.length) throw new Error('Content validation failed:\n  ' + errs.join('\n  '));
  return true;
}

// ---------------------------------------------------------------- reachability and unlock order
// Phase-end player levels from PACING section 2 (Beacon k is built at the end of phase k).
export const GATE_LEVELS = Object.freeze({ 1: 18, 2: 32, 3: 46, 4: 60, 5: 74, 6: 90, tidegate: 100 });
const SKILL_ROW_LEVEL = { 1: 1, 2: 20, 3: 50 };
const BIOME_TIER = { greenmarrow: 1, saltfen: 2, emberreach: 3, glasswaste: 4, hoarfrost: 5, umbral: 6 };
const RARE_OF = { 1: 'shell', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' };
const GEM_OF = { 1: 'glintstone', 2: 'pearl', 3: 'magma_core', 4: 'amber', 5: 'aurora_shard', 6: 'echoglass' };
const ORE_OF = { 1: 'copper_ore', 2: 'bog_iron_ore', 3: 'cinderite_ore', 4: 'prismite_ore', 5: 'rime_ore', 6: 'umbrite_ore' };
const ROD_FOR_FISH = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4 };
// Counter goals that need a structure to advance at all.
const COUNTER_NEEDS = { sluice_items: ['sluice_1', 'sluice_2', 'sluice_3'], autobench_crafts: ['autobench_1', 'autobench_2', 'autobench_3'], gull_deliveries: ['gull_roost'], burrow_units: ['burrow_1', 'burrow_2', 'burrow_3'], minted: ['mint'] };
// Quest rewards of bulk goods (a handful of plates or cells) are not a source; unique rewards (packs, trinkets, tokens) are.
const BULK_CATS = ['material', 'component'];

// Closure of everything obtainable in a world state.
// state: { beacons: Beacons lit (0..6), level: player level, trench: deepest Trench floor reachable (Trench opens at Beacon 3) }.
// Combat outcomes are assumed possible once their inputs exist (a Lure for a Warden, an unlocked biome for a Vault);
// raw drops need a hook of the node's tier; fish need the rod tier; crops need their seed.
// extras: { GROUPS, STATION_TIERS, DIG_SITES, SHRINE_TRINKETS, TRENCH_TRINKETS }.
export function reachability(content, extras = {}, state = {}) {
  const lit = state.beacons ?? 6, level = state.level ?? 100;
  const tierMax = Math.min(6, lit + 1);
  const trenchFloor = lit >= 3 ? (state.trench ?? 50) : 0;
  const O = new Set(['hook_1']), B = new Set(), bosses = new Set(), vaults = new Set(), quests = new Set(), lines = new Set();
  const skillsOk = new Set((content.skills || []).filter((s) => level >= SKILL_ROW_LEVEL[s.row]).map((s) => s.id));
  const items = new Map((content.items || []).map((i) => [i.id, i]));
  const enemies = content.enemies || [], npcs = content.npcs || [];
  const groups = extras.GROUPS || {};
  const biomeOk = (b) => !!BIOME_TIER[b] && BIOME_TIER[b] <= tierMax;
  const has1 = (c) => (c.item ? O.has(c.item) : Object.keys(groups[c.group] || {}).some((m) => O.has(m)));
  const gearMax = (slot, key) => Math.max(0, ...[...O].map((id) => items.get(id)).filter((i) => i && i.gear && i.gear.slot === slot).map((i) => i.gear[key]));
  const unlockOk = (u) => (u || []).every((s) => {
    const i = s.indexOf(':'), kind = s.slice(0, i), val = s.slice(i + 1);
    if (kind === 'level') return level >= Number(val);
    if (kind === 'beacon') return lit >= Number(val);
    if (kind === 'skill') return skillsOk.has(val);
    if (kind === 'boss') return bosses.has(val);
    if (kind === 'vault') return vaults.has(Number(val));
    if (kind === 'quest') return quests.has(val);
    return false;
  });
  const stationOk = (st) => {
    if (st === 'hand') return true;
    for (const chain of Object.values(extras.STATION_TIERS || {})) if (chain.includes(st)) return chain.slice(chain.indexOf(st)).some((x) => B.has(x));
    return B.has(st);
  };
  let changed = false;
  const add = (id) => { if (id && !O.has(id)) { O.add(id); changed = true; } };
  const mark = (set, v) => { if (!set.has(v)) { set.add(v); changed = true; } };
  const goalOk = (g) => {
    const t = g.target == null ? [] : Array.isArray(g.target) ? g.target : [g.target];
    switch (g.kind) {
      case 'deliver': case 'craft': case 'collect': return t.length === 0 || t.some((x) => O.has(x));
      case 'build': return t.some((x) => B.has(x));
      case 'catch': return t.length === 0 ? gearMax('rod', 'maxFishTier') > 0 : t.some((x) => O.has(x));
      case 'kill': return t.every((x) => bosses.has(x) || enemies.some((e) => e.id === x && biomeOk(e.biome)));
      case 'kill_elite': return t.length === 0 || t.some((x) => enemies.some((e) => e.id === x && biomeOk(e.biome)));
      case 'clear': return t.every((x) => { const d = (content.dungeons || []).find((v) => v.id === x); return !!d && vaults.has(d.k); });
      case 'reach':
        if (g.target === 'flux') return (content.structures || []).some((s) => s.machine && s.machine.type === 'generator' && s.machine.flux >= g.n && B.has(s.id));
        if (g.target === 'trench') return trenchFloor >= g.n;
        if (g.target === 'tidegate') return false;
        return true;
      case 'temper': return B.has('tempering_forge');
      case 'counter': { const need = COUNTER_NEEDS[g.target]; return !need || need.some((x) => B.has(x)); }
      default: return true;   // donate, solve, raise: activity available in the biome
    }
  };

  let guard = 0;
  do {
    changed = false;
    const ht = gearMax('hook', 'maxNode'), rt = gearMax('rod', 'maxFishTier');
    for (const n of content.nodes || []) if (biomeOk(n.biome) && ht >= n.tier) for (const d of n.drops) add(d.item);
    for (let t = 1; t <= tierMax; t++) {                       // tidal nodes, tide caches, gem nodes
      if (ht < t) continue;
      ['shell', 'pearl', 'sand', 'tide_token', GEM_OF[t]].forEach(add);
    }
    for (const e of enemies) if (biomeOk(e.biome)) for (const l of e.loot) add(l.item);
    for (const d of content.dungeons || []) {                  // Vault first entry is free
      if (!biomeOk(d.biome)) continue;
      mark(vaults, d.k);
      d.firstReward.forEach((r) => add(r.item));
      if (d.relic) add(d.relic);
      add(RARE_OF[d.k]); add(ORE_OF[d.k]);                     // crystal growths
      const keeper = (content.bosses || []).find((b) => b.id === d.keeper);
      if (keeper) { mark(bosses, keeper.id); keeper.loot.forEach((l) => add(l.item)); }
    }
    for (const b of content.bosses || []) {
      if (b.kind !== 'warden' || !biomeOk(b.biome) || !O.has(b.lure)) continue;
      mark(bosses, b.id); b.loot.forEach((l) => add(l.item));
    }
    for (const s of content.shops || []) {
      const npc = npcs.find((n) => n.id === s.npc);
      if (npc && biomeOk(npc.biome)) for (const line of s.stock) if (line.item && (line.requires !== 'line' || lines.has(npc.id))) add(line.item);
    }
    for (const [b, site] of Object.entries(extras.DIG_SITES || {})) {
      if (!biomeOk(b)) continue;
      site.relics.forEach(add); add('relic_fragment');
      if (site.extra) add(site.extra.item);
    }
    ['relic_01', ...(extras.SHRINE_TRINKETS || [])].forEach(add);
    for (const f of content.fish || []) if (biomeOk(f.biome) && rt >= ROD_FOR_FISH[f.tier]) add(f.id);
    if (O.has('fieldstone')) for (const c of content.crops || []) if (O.has(c.seed)) add(c.id);
    if (trenchFloor > 0) {
      for (let t = 1; t <= tierMax; t++) add(RARE_OF[t]);
      add('relic_fragment');
      if (trenchFloor >= 10) add('seed_moonpetal');
      for (const [f, it] of Object.entries(extras.TRENCH_TRINKETS || {})) if (trenchFloor >= Number(f)) add(it);
    }
    for (const s of content.structures || []) if (!s.natural && !B.has(s.id) && unlockOk(s.unlock) && s.cost.every(has1)) mark(B, s.id);
    for (const s of content.structures || []) if (B.has(s.id) && s.machine && s.machine.type === 'producer' && s.machine.item) add(s.machine.item);
    for (const c of content.cards || []) for (const g of c.grants || []) add(g.item);   // granted on pick
    for (const r of content.recipes || []) if (!O.has(r.out.item) && stationOk(r.station) && unlockOk(r.unlock) && r.in.every(has1)) add(r.out.item);
    for (const q of content.quests || []) {
      if (quests.has(q.id) || q.type === 'board' || (q.prereq && !quests.has(q.prereq))) continue;
      if (q.type === 'side') { const npc = npcs.find((n) => n.id === q.giver); if (!npc || !biomeOk(npc.biome)) continue; }
      if (!q.goals.every(goalOk)) continue;
      mark(quests, q.id);
      (q.rewards?.items || []).filter((it) => !BULK_CATS.includes(items.get(it.item)?.cat)).forEach((it) => add(it.item));
      if (q.type === 'side' && q.step === 3) {
        mark(lines, q.giver);
        (npcs.find((n) => n.id === q.giver)?.lineReward?.items || []).filter((it) => !BULK_CATS.includes(items.get(it.item)?.cat)).forEach((it) => add(it.item));
      }
    }
  } while (changed && ++guard < 500);
  return { items: O, structures: B, bosses, vaults, quests, lines, tierMax, trenchFloor };
}

// Unlock-order test (TECH_SPEC 14 WP2): for every gate k (Beacon 1..6, Tidegate stages 1..5) everything it needs is
// obtainable using only unlocks from earlier gates. Returns a list of problems (empty = no softlock).
export function checkUnlockOrder(content, extras = {}) {
  const errs = [];
  const BIOMES = ['greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
  for (let k = 1; k <= 6; k++) {
    // Trench floor 10 is tuned for hour 80 (between Beacon 5 and Beacon 6); floor 5 is assumed reachable from Beacon 3.
    const R = reachability(content, extras, { beacons: k - 1, level: GATE_LEVELS[k], trench: k - 1 >= 5 ? 10 : k - 1 >= 3 ? 5 : 0 });
    const beacon = (content.structures || []).find((s) => s.id === 'beacon_' + k);
    if (!beacon) { errs.push(`beacon_${k} missing`); continue; }
    if (!R.structures.has(beacon.id)) {
      const missing = beacon.cost.filter((c) => !R.items.has(c.item)).map((c) => c.item);
      const unmet = beacon.unlock.filter((u) => (u.startsWith('boss:') ? !R.bosses.has(u.slice(5)) : u.startsWith('beacon:') ? Number(u.slice(7)) > k - 1 : false));
      errs.push(`gate Beacon ${k}: not buildable with earlier gates (missing items: ${missing.join(', ') || '-'}; unmet unlocks: ${unmet.join(', ') || '-'})`);
    }
    for (const npc of npcs(content).filter((n) => n.biome === BIOMES[k - 1])) if (!R.lines.has(npc.id)) errs.push(`gate Beacon ${k}: castaway line ${npc.id} not completable`);
    // the hook that harvests biome k must exist before Beacon k (dungeon k-1 -> hook k -> biome k nodes)
    if (!R.items.has('hook_' + k) && k > 1) errs.push(`gate Beacon ${k}: hook_${k} not craftable`);
  }
  const R = reachability(content, extras, { beacons: 6, level: GATE_LEVELS.tidegate, trench: 10 });
  const wingsDone = (content.archive || []).filter((w) => w.items.every((i) => R.items.has(i))).length;
  for (const s of extras.TIDEGATE_STAGES || []) {
    const missing = s.cost.filter((c) => !R.items.has(c.item)).map((c) => c.item);
    if (missing.length) errs.push(`gate Tidegate ${s.stage}: missing ${missing.join(', ')}`);
    if (wingsDone < s.wings) errs.push(`gate Tidegate ${s.stage}: only ${wingsDone} Archive wings completable, needs ${s.wings}`);
  }
  for (const w of content.archive || []) {
    const miss = w.items.filter((i) => !R.items.has(i));
    if (miss.length) errs.push(`Archive ${w.id}: unobtainable ${miss.join(', ')}`);
  }
  return errs;
}
const npcs = (content) => content.npcs || [];
