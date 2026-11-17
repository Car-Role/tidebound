// WP6b: equipment slots, gear stats, armour set bonuses, tempering (DESIGN 6.4, 13.4).
//
// player.gear (saved verbatim by WP1 in the profile): { hook, weapon, weapon2, helm, coat, boots, rod, pack, trinket1,
//   trinket2, lantern, temper: { <itemId>: level } }. Values are item ids. `weapon2` needs skill C11 (`second_weapon`).
// Tempering (+1..+10 at a Tempering Forge): each level +6% of the item's base stats. Cost for level n: n*2 bars and
// n rares of the item's tier + 25 * tier * n^2 Glint. Success 100% to +5, then 90/80/70/60/50%; failure keeps the level.
//
// Services (for WP4 gathering and WP5 combat): weaponStats(player) and hookStats(player) return the tempered numbers.

import { TIER_MATS, ARMOR_SETS } from '../../../shared/data/items.js';
import { TEMPER_MAX, TEMPER_STAT_PER_LEVEL, TEMPER_GLINT, TEMPER_SUCCESS, FAVOURED_WEAPON_BONUS } from '../../../shared/rules/constants.js';
import { ensureWp6, nearStructure } from './progression.js';

export const GEAR_SLOTS = Object.freeze(['hook', 'weapon', 'weapon2', 'helm', 'coat', 'boots', 'rod', 'pack', 'trinket1', 'trinket2', 'lantern']);
const ARMOR_SLOTS = ['helm', 'coat', 'boots'];
const procList = (p) => (!p ? [] : Array.isArray(p) ? p : [p]);
const FIST = { dmg: 4, rate: 2.0, wtype: 'blade', reach: 1.5, arc: 100, tier: 0 };

export const itemDef = (game, id) => (id ? game.content.items.byId[id] ?? null : null);
export const temperOf = (player, itemId) => (itemId ? player.gear?.temper?.[itemId] ?? 0 : 0);
export const temperMult = (lv) => 1 + TEMPER_STAT_PER_LEVEL * lv;

// Equipped items that count (weapon2 is a spare until swapped in).
function equipped(player) {
  const out = [];
  for (const s of GEAR_SLOTS) {
    if (s === 'weapon2') continue;
    const id = player.gear?.[s];
    if (id) out.push([s, id]);
  }
  return out;
}

// Tier used for tempering costs; trinkets take the tier of their source.
export function gearTier(game, def) {
  if (!def) return 1;
  if (def.tier > 0) return Math.min(6, def.tier);
  const src = String(def.source || '');
  const [kind, arg] = src.split(':');
  if (kind === 'boss') return Math.max(1, Math.min(6, game.content.bosses.byId[arg]?.k || 1));
  if (kind === 'trench') return 6;
  if (kind === 'quest') return 4;
  return 3;
}

export function weaponStats(game, player) {
  const id = player?.gear?.weapon;
  const def = itemDef(game, id);
  const g = def?.gear?.slot === 'weapon' ? def.gear : null;
  const base = g || FIST;
  const t = temperOf(player, id);
  const cls = player?.classState?.id ? game.content.classes.byId[player.classState.id] : null;
  const favoured = !!(cls && g && cls.favoured === g.wtype);
  return {
    item: g ? id : null, wtype: base.wtype, tier: base.tier ?? 0, dmg: base.dmg * temperMult(t), rate: base.rate,
    reach: base.reach, arc: base.arc, range: base.range, splash: base.splash, element: base.element || 'none', pierce: base.pierce,
    favoured, favouredMult: favoured ? 1 + FAVOURED_WEAPON_BONUS : 1, temper: t,
  };
}

export function hookStats(game, player) {
  const id = player?.gear?.hook;
  const def = itemDef(game, id);
  const g = def?.gear?.slot === 'hook' ? def.gear : { power: 0.5, tier: 0, maxNode: 0 };
  const t = temperOf(player, id);
  return { item: def ? id : null, power: g.power * temperMult(t), tier: g.tier, maxNode: g.maxNode, temper: t };
}

// "X% weapon damage" base used by abilities and procs: weapon dmg x (1 + power) x favoured (WP5's damage adds dmgWorld).
export function weaponDamage(game, player) {
  if (!player) return 0;
  const w = weaponStats(game, player);
  const s = game.stats.of(player);
  return Math.max(4, w.dmg) * (1 + (s.power || 0)) * w.favouredMult;
}

// Hook damage per swing (DESIGN 5.2 gather hit).
export function hookDamage(game, player) {
  const h = hookStats(game, player);
  return Math.max(0.5, h.power) * (1 + (game.stats.of(player).gatherPower || 0));
}

// ---------------------------------------------------------------- stat sources

function gearMods(game, player) {
  const out = [];
  const tiers = {};
  for (const [slot, id] of equipped(player)) {
    const def = itemDef(game, id);
    if (!def) continue;
    const k = temperMult(temperOf(player, id));
    const g = def.gear || {};
    if (g.armor) out.push({ stat: 'armor', op: 'add', v: g.armor * k });
    if (g.hp) out.push({ stat: 'maxHp', op: 'add', v: g.hp * k });
    for (const m of def.mods || []) out.push({ ...m, v: m.stat === 'invSlots' ? m.v : m.v * k });
    for (const f of def.flags || []) out.push({ flag: f });
    if (ARMOR_SLOTS.includes(slot) && g.set) tiers[g.set] = (tiers[g.set] || 0) + 1;
  }
  for (const [tier, n] of Object.entries(tiers)) {
    if (n < 3) continue;
    const set = ARMOR_SETS[tier];
    for (const m of set?.mods || []) out.push(m);
    for (const f of set?.flags || []) out.push({ flag: f });
  }
  return out;
}

export function armorSet(game, player) {
  const tiers = {};
  for (const s of ARMOR_SLOTS) { const t = itemDef(game, player.gear?.[s])?.gear?.set; if (t) tiers[t] = (tiers[t] || 0) + 1; }
  for (const [t, n] of Object.entries(tiers)) if (n >= 3) return Number(t);
  return 0;
}

function gearEffects(game, player) {
  const out = [];
  for (const [, id] of equipped(player)) for (const e of itemDef(game, id)?.effects || []) out.push({ ...e, src: 'item:' + id });
  return out;
}

function gearProcs(game, player) {
  const out = [];
  for (const [slot, id] of equipped(player)) procList(itemDef(game, id)?.proc).forEach((p, i) => out.push({ ...p, src: 'item', key: `item:${slot}:${id}:${i}` }));
  return out;
}

// ---------------------------------------------------------------- client state

export function sendGear(game, player) {
  const gear = {};
  for (const s of GEAR_SLOTS) gear[s] = player.gear?.[s] ?? null;
  game.sendSelf(player, 'gear', { ...gear, temper: { ...(player.gear?.temper || {}) }, set: armorSet(game, player) });
  const e = player.entity;
  if (e) e.set('g', [player.gear?.hook || 0, player.gear?.weapon || 0, player.gear?.helm || 0, player.gear?.coat || 0]);
}

function changed(game, player) {
  game.stats.invalidate(player);
  game.procs?.invalidate(player);
  const s = game.stats.of(player);
  if (player.inv.slots.length !== s.invSlots) {
    const spill = game.inv.resize(player.inv, s.invSlots);
    const e = player.entity;
    for (const [item, qty] of spill) if (e) game.call('dropItem', e.realm, e.x, e.y, item, qty, { owner: player.id });
    game.sendSelf(player, 'inv', game.invView(player));
  }
  sendGear(game, player);
}

// ---------------------------------------------------------------- handlers

function slotFor(player, def, want) {
  const s = def?.gear?.slot;
  if (!s) return null;
  if (s === 'trinket') {
    if (want === 'trinket1' || want === 'trinket2') return want;
    if (!player.gear.trinket1) return 'trinket1';
    if (!player.gear.trinket2) return 'trinket2';
    return 'trinket1';
  }
  if (s === 'weapon' && want === 'weapon2') return 'weapon2';
  return GEAR_SLOTS.includes(s) ? s : null;
}

function equip(game, player, d) {
  player.gear ||= {};
  if (d?.swap === true) {
    if (!game.stats.hasFlag(player, 'second_weapon')) return { ok: false, err: 'locked' };
    [player.gear.weapon, player.gear.weapon2] = [player.gear.weapon2 || null, player.gear.weapon || null];
    changed(game, player);
    return { ok: true };
  }
  const i = d?.slot;
  if (!Number.isInteger(i) || i < 0 || i >= player.inv.slots.length) return { ok: false, err: 'invalid' };
  const stack = player.inv.slots[i];
  if (!stack) return { ok: false, err: 'invalid' };
  const def = itemDef(game, stack[0]);
  const target = slotFor(player, def, d.to);
  if (!target) return { ok: false, err: 'invalid' };
  if (target === 'weapon2' && !game.stats.hasFlag(player, 'second_weapon')) return { ok: false, err: 'locked' };
  if (def.gear.slot === 'trinket') {
    const other = target === 'trinket1' ? 'trinket2' : 'trinket1';
    if (player.gear[other] === def.id) return { ok: false, err: 'invalid' };    // no two copies of one trinket
  }
  const old = player.gear[target] || null;
  if (stack[1] > 1) {
    stack[1]--;
    if (old && game.inv.add(player.inv, old, 1) > 0) { stack[1]++; return { ok: false, err: 'full' }; }
  } else player.inv.slots[i] = old ? [old, 1] : null;
  player.gear[target] = def.id;
  game.sendSelf(player, 'inv', game.invView(player));
  const e = player.entity;
  if (e) game.fx(e.realm, 'build_place', e.x, e.y, { equip: def.id });
  changed(game, player);
  return { ok: true, d: { slot: target, item: def.id } };
}

function unequip(game, player, d) {
  const slot = d?.slot;
  if (!GEAR_SLOTS.includes(slot) || !player.gear?.[slot]) return { ok: false, err: 'invalid' };
  const id = player.gear[slot];
  if (slot === 'pack') {
    const def = itemDef(game, id);
    const lose = (def?.mods || []).filter((m) => m.stat === 'invSlots').reduce((s, m) => s + m.v, 0);
    const keep = player.inv.slots.length - lose;
    if (player.inv.slots.slice(keep).some(Boolean)) return { ok: false, err: 'full' };
  }
  if (game.inv.add(player.inv, id, 1) > 0) return { ok: false, err: 'full' };
  player.gear[slot] = null;
  game.sendSelf(player, 'inv', game.invView(player));
  changed(game, player);
  return { ok: true };
}

export function temperCost(game, player, itemId) {
  const def = itemDef(game, itemId);
  if (!def?.gear) return null;
  const n = temperOf(player, itemId) + 1;
  if (n > TEMPER_MAX) return { max: true, level: n - 1 };
  const tier = gearTier(game, def);
  const mats = TIER_MATS[tier];
  const discount = Math.min(0.9, game.effects.sum(player, 'temper_glint_discount', 'v'));
  return {
    level: n, tier, chance: TEMPER_SUCCESS[n - 1],
    items: [{ item: mats.bar, qty: n * 2 }, { item: mats.rare, qty: n }],
    glint: Math.round(TEMPER_GLINT * tier * n * n * (1 - discount)),
  };
}

function temper(game, player, d) {
  if (!nearStructure(game, player, 'tempering_forge', 4)) return { ok: false, err: 'range' };
  let itemId = d?.item;
  if (GEAR_SLOTS.includes(itemId)) itemId = player.gear?.[itemId];
  const isEquipped = GEAR_SLOTS.some((s) => player.gear?.[s] === itemId);
  if (!itemId || !isEquipped) return { ok: false, err: 'invalid' };
  const cost = temperCost(game, player, itemId);
  if (!cost) return { ok: false, err: 'invalid' };
  if (cost.max) return { ok: false, err: 'full' };
  for (const c of cost.items) if ((game.call('countItem', player, c.item) || 0) < c.qty) return { ok: false, err: 'cost' };
  if (!game.call('spendGlint', cost.glint, 'temper', player)) return { ok: false, err: 'cost' };
  if (!game.call('takeItems', player, cost.items)) { game.call('addGlint', cost.glint, 'refund', player); return { ok: false, err: 'cost' }; }
  const rng = (game.temperRng ||= game.rng.fork('temper'));
  const success = rng.next() < cost.chance;
  const e = player.entity;
  if (success) {
    player.gear.temper ||= {};
    player.gear.temper[itemId] = cost.level;
    if (e) game.fx(e.realm, 'temper_success', e.x, e.y, { item: itemId, lv: cost.level });
    game.toast(player, `${itemDef(game, itemId).name} tempered to +${cost.level}!`, 'good');
  } else {
    if (e) game.fx(e.realm, 'temper_fail', e.x, e.y, { item: itemId });
    game.toast(player, `The temper cracked. ${itemDef(game, itemId).name} stays at +${cost.level - 1}`, 'warn');
  }
  game.bus.emit('gear.tempered', { player, item: itemId, level: temperOf(player, itemId), success });
  if (success) game.call('counter', player, 'tempers_done', 1);        // WP14 (P1-4)
  changed(game, player);
  return { ok: true, d: { success, level: temperOf(player, itemId) } };
}

export default {
  name: 'gear',

  init(game) {
    ensureWp6(game);
    game.services.register('weaponStats', (player) => weaponStats(game, player));
    game.services.register('hookStats', (player) => hookStats(game, player));
    game.stats.addSource('gear', (p) => gearMods(game, p));
    game.wp6.effects.add('gear', (p) => gearEffects(game, p));
    game.wp6.procSources.add('gear', (p) => gearProcs(game, p));
    game.call('registerInteract', 'tempering_forge', (g, player, ent) => {
      g.sendSelf(player, 'ui', { kind: 'temper', id: ent.id, n: 1e6 + (player.uiSeq = (player.uiSeq || 0) + 1) });
      return { ok: true };
    });
  },

  handlers: {
    'gear.equip': equip,
    'gear.unequip': unequip,
    'gear.temper': temper,
  },

  onJoin(game, player) {
    player.gear ||= {};
    player.gear.temper ||= {};
    if (!player.gearInit) {
      player.gearInit = true;
      // First join: a Driftwood Hook in hand (taken from the inventory if a start kit put one there).
      if (!player.gear.hook) {
        const i = player.inv.slots.findIndex((s) => s && s[0] === 'hook_1');
        if (i >= 0) { if (--player.inv.slots[i][1] <= 0) player.inv.slots[i] = null; game.sendSelf(player, 'inv', game.invView(player)); }
        player.gear.hook = 'hook_1';
      }
    }
    // drop slots that refer to unknown items (content changes)
    for (const s of GEAR_SLOTS) if (player.gear[s] && !itemDef(game, player.gear[s])) player.gear[s] = null;
    changed(game, player);
  },

  saveProfile(game, player) { return { init: !!player.gearInit }; },
  loadProfile(game, player, data) { player.gearInit = !!data?.init; },
};
