// WP6b: classes (DESIGN 10). Class select at the Calling Shrine from level 10 (switch free, 10-minute cooldown),
// Mastery 1-20 per class (XP while active, 600 * m^2 per level, +1% primary stat per level), mastery upgrades
// (abilities 1-2 at mastery 10, 3-4 at mastery 20), Signatures at levels 70/80/90 (picked per class) and
// Second Calling (skill T9: the first two abilities of a second class on Z / X).
//
// self keys: `class` { id, second, mastery: { <cls>: { lv, xp, into, need } }, switchReadyAt, t, slots: [...6] },
//            `sig` { <cls>: [abilityIds] }.

import { masteryFromXp, masteryTotal, masteryXp } from '../../../shared/rules/xp.js';
import { ABILITY_LEVELS, SIGNATURE_LEVELS } from '../../../shared/data/registries.js';
import { CLASS_RULES } from '../../../shared/data/classes.js';
import { MASTERY_MAX } from '../../../shared/rules/constants.js';
import { ensureWp6, nearStructure } from './progression.js';
import { sendCooldowns } from './abilities.js';

export function classState(player) {
  return (player.classState ||= { id: null, second: null, mastery: {}, switchAt: -Infinity, sig: {} });
}

export const masteryLevel = (player, cls) => masteryFromXp(classState(player).mastery[cls] || 0);

// Mastery upgrade: abilities 1-2 (slots 0-1) at mastery 10, 3-4 at mastery 20 of the ability's class.
export function upgraded(game, player, def) {
  const need = def.upgrade?.mastery ?? CLASS_RULES.upgradeAt[def.slot] ?? 10;
  return masteryLevel(player, def.class) >= need;
}

export const signed = (player, def) => (classState(player).sig[def.class] || []).includes(def.id);

// The six ability keys: Q E R F (active class), Z X (second class with Second Calling).
export function slotAbilities(game, player) {
  const st = classState(player);
  const out = [];
  const cls = st.id ? game.content.classes.byId[st.id] : null;
  for (let i = 0; i < 4; i++) {
    const id = cls?.abilities?.[i] ?? null;
    out.push({ ability: id, unlocked: !!id && player.level >= ABILITY_LEVELS[i], level: ABILITY_LEVELS[i], key: 'QERF'[i] });
  }
  const sec = st.second && game.stats.hasFlag(player, 'second_calling') ? game.content.classes.byId[st.second] : null;
  for (let i = 0; i < 2; i++) {
    const id = sec?.abilities?.[i] ?? null;
    out.push({ ability: id, unlocked: !!id && player.level >= ABILITY_LEVELS[i], level: ABILITY_LEVELS[i], key: 'ZX'[i], second: true });
  }
  return out;
}

export function sendClass(game, player) {
  const st = classState(player);
  const mastery = {};
  for (const c of game.content.classes) {
    const xp = st.mastery[c.id] || 0;
    const lv = masteryFromXp(xp);
    mastery[c.id] = { lv, xp: Math.floor(xp), into: Math.floor(xp - masteryTotal(lv)), need: lv >= MASTERY_MAX ? 0 : masteryXp(lv + 1) };
  }
  game.sendSelf(player, 'class', {
    id: st.id, second: st.second, mastery, t: +game.now.toFixed(2),
    switchReadyAt: Number.isFinite(st.switchAt) ? +(st.switchAt + CLASS_RULES.switchCooldown).toFixed(2) : 0,
    slots: slotAbilities(game, player), secondCalling: game.stats.hasFlag(player, 'second_calling'),
    sigSlots: SIGNATURE_LEVELS.filter((l) => player.level >= l).length,
  });
  game.sendSelf(player, 'sig', Object.fromEntries(Object.entries(st.sig).map(([k, v]) => [k, v.slice()])));
}

function changed(game, player) {
  game.stats.invalidate(player);
  game.procs?.invalidate(player);
  player.entity?.set('cl', classState(player).id || 0);
  sendClass(game, player);
  sendCooldowns(game, player);
}

function choose(game, player, d) {
  const cls = game.content.classes.byId[d?.class];
  if (!cls) return { ok: false, err: 'invalid' };
  if (player.level < CLASS_RULES.minLevel) return { ok: false, err: 'locked' };
  if (!nearStructure(game, player, 'calling_shrine', 4)) return { ok: false, err: 'range' };
  const st = classState(player);
  if (d.second === true) {
    if (!game.stats.hasFlag(player, 'second_calling')) return { ok: false, err: 'locked' };
    if (cls.id === st.id || cls.id === st.second) return { ok: false, err: 'invalid' };
    st.second = cls.id;
  } else {
    if (cls.id === st.id) return { ok: false, err: 'invalid' };
    if (st.id && game.now < st.switchAt + CLASS_RULES.switchCooldown) return { ok: false, err: 'cooldown' };
    if (st.id) st.switchAt = game.now;
    st.id = cls.id;
    if (st.second === cls.id) st.second = null;
  }
  const e = player.entity;
  if (e) game.fx(e.realm, 'level_up', e.x, e.y, { calling: cls.id });
  game.toast(player, d.second ? `Second Calling: ${cls.name}` : `You answer the call of the ${cls.name}`, 'good');
  changed(game, player);
  game.bus.emit('class.changed', { player, class: cls.id, second: !!d.second });
  return { ok: true, d: { class: cls.id } };
}

function signature(game, player, d) {
  const st = classState(player);
  const def = game.content.abilities.byId[d?.ability];
  if (!def || !st.id || def.class !== st.id) return { ok: false, err: 'invalid' };
  const picks = (st.sig[st.id] ||= []);
  if (picks.includes(def.id)) return { ok: false, err: 'invalid' };
  const allowed = SIGNATURE_LEVELS.filter((l) => player.level >= l).length;
  if (picks.length >= allowed) return { ok: false, err: 'locked' };
  picks.push(def.id);
  const e = player.entity;
  if (e) game.fx(e.realm, 'card_pick', e.x, e.y, { r: 'mythic', signature: def.id });
  game.toast(player, `Signature: ${def.name}`, 'good');
  changed(game, player);
  return { ok: true, d: { ability: def.id } };
}

// ---------------------------------------------------------------- stat sources

function classMods(game, player) {
  const st = classState(player);
  const out = [];
  const cls = st.id ? game.content.classes.byId[st.id] : null;
  if (!cls) return out;
  for (const m of cls.passive?.mods || []) out.push(m);
  for (const f of cls.passive?.flags || []) out.push({ flag: f });
  const m = masteryLevel(player, cls.id);
  if (m > 0) {
    const v = CLASS_RULES.masteryPrimary * m;
    out.push(cls.primary === 'maxHp' ? { stat: 'maxHp', op: 'mul', v } : { stat: cls.primary, op: 'add', v });
  }
  return out;
}

function classEffects(game, player) {
  const st = classState(player);
  const cls = st.id ? game.content.classes.byId[st.id] : null;
  return (cls?.passive?.effects || []).map((e) => ({ ...e, src: 'class:' + cls.id }));
}

function onXp(game, { player, amount }) {
  const st = classState(player);
  if (!st.id || !(amount > 0)) return;
  const before = masteryLevel(player, st.id);
  st.mastery[st.id] = Math.min(masteryTotal(MASTERY_MAX), (st.mastery[st.id] || 0) + amount);
  const after = masteryLevel(player, st.id);
  if (after > before) {
    const cls = game.content.classes.byId[st.id];
    const e = player.entity;
    if (e) game.fx(e.realm, 'skill_buy', e.x, e.y, { mastery: after });
    let msg = `${cls.name} Mastery ${after}`;
    if (after === 10) msg += ': abilities 1-2 upgraded!';
    if (after === 20) msg += ': abilities 3-4 upgraded!';
    game.toast(player, msg, 'good');
    changed(game, player);
  } else if ((player.masterySendAt ?? -1) < game.now - 2) {
    player.masterySendAt = game.now;
    sendClass(game, player);
  }
}

export default {
  name: 'classes',

  init(game) {
    ensureWp6(game);
    game.stats.addSource('class', (p) => classMods(game, p));
    game.wp6.effects.add('class', (p) => classEffects(game, p));
    game.bus.on('xp.gained', (ev) => onXp(game, ev));
    game.bus.on('player.levelup', ({ player }) => {
      if (SIGNATURE_LEVELS.includes(player.level) && classState(player).id) game.toast(player, 'A Signature awaits at the Calling Shrine', 'quest');
      sendClass(game, player);
    });
    game.bus.on('skill.bought', ({ player, skill }) => { if (skill === 'T9') sendClass(game, player); });
    game.bus.on('skill.respec', ({ player }) => sendClass(game, player));
    // Structure cost discount for a placement (WP4): all structCost sources capped at 25%, except that the class
    // passive part never applies to world structures (DESIGN 10).
    game.services.register('structureDiscount', (player, kind) => {
      const def = game.content.structures.byId[kind];
      if (!player || !def) return 0;
      let d = -(game.stats.of(player).structCost || 0);
      if (def.world || def.natural) {
        const cls = classState(player).id ? game.content.classes.byId[classState(player).id] : null;
        for (const m of cls?.passive?.mods || []) if (m.stat === 'structCost') d += m.v;
      }
      return Math.max(0, Math.min(0.25, d));
    });
    game.call('registerInteract', 'calling_shrine', (g, player, ent) => {
      g.sendSelf(player, 'ui', { kind: 'class', id: ent.id, n: 1e6 + (player.uiSeq = (player.uiSeq || 0) + 1) });
      return { ok: true };
    });
  },

  handlers: {
    'class.choose': choose,
    'ability.signature': signature,
  },

  onJoin(game, player) {
    player.entity?.set('cl', classState(player).id || 0);
    sendClass(game, player);
  },

  saveProfile(game, player) {
    const st = classState(player);
    const left = Number.isFinite(st.switchAt) ? Math.max(0, st.switchAt + CLASS_RULES.switchCooldown - game.now) : 0;
    return { id: st.id, second: st.second, mastery: { ...st.mastery }, switchLeft: Math.round(left), sig: structuredClone(st.sig) };
  },

  loadProfile(game, player, data) {
    const st = classState(player);
    if (!data) return;
    const ok = (id) => !!game.content.classes.byId[id];
    st.id = ok(data.id) ? data.id : null;
    st.second = ok(data.second) ? data.second : null;
    for (const [k, v] of Object.entries(data.mastery || {})) if (ok(k) && Number.isFinite(v)) st.mastery[k] = Math.max(0, v);
    if (data.switchLeft > 0) st.switchAt = game.now - CLASS_RULES.switchCooldown + data.switchLeft;
    for (const [k, v] of Object.entries(data.sig || {})) if (ok(k) && Array.isArray(v)) st.sig[k] = v.filter((a) => game.content.abilities.byId[a]?.class === k).slice(0, 3);
  },
};
