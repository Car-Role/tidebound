// WP6a: the Chart (DESIGN 9.2). Skill purchase, row gates, respec at the Calling Shrine, skill points from levels and
// bonus sources, world unlock flags (`skill:<id>` holds while any player owns the node), and the `hasUnlock` service.
//
// Points = (level - 1) + personal bonus points (first kill of each Warden, first clear of each Vault, the final boss)
//        + world bonus points (Archive wings, granted to everyone through the `grantSkillPoint` service) - spent.

import skillList, { SKILL_ROW_RULES } from '../../../shared/data/skills.js';
import { RESPEC_GLINT_PER_LEVEL } from '../../../shared/rules/constants.js';
import { ensureWp6, nearStructure, asPlayer } from './progression.js';

const byId = new Map(skillList.map((s) => [s.id, s]));
export const SKILLS = skillList;
const procList = (p) => (!p ? [] : Array.isArray(p) ? p : [p]);

// World bonus point source keys (granted to everyone, e.g. 'wing:wing_metal') live on game.wp6.worldPoints.
const wpOf = (game) => (ensureWp6(game).worldPoints ||= []);

export function skillState(player) {
  return (player.skillState ||= { owned: [], bonus: [] });
}

export const spentOf = (owned) => owned.reduce((s, id) => s + (byId.get(id)?.cost || 0), 0);

export function pointsOf(game, player) {
  const st = skillState(player);
  return Math.max(0, player.level - 1) + st.bonus.length + wpOf(game).length - spentOf(st.owned);
}

// Why a node cannot be bought right now (null = it can). Used by the handler and mirrored by the client panel.
export function blockReason(game, player, id) {
  const sk = byId.get(id);
  if (!sk) return 'invalid';
  const st = skillState(player);
  if (st.owned.includes(id)) return 'owned';
  const rule = SKILL_ROW_RULES[sk.row];
  if (rule) {
    const prev = st.owned.filter((o) => { const s = byId.get(o); return s && s.branch === sk.branch && s.row === sk.row - 1; }).length;
    if (prev < rule.prevRow) return 'locked';
    if (player.level < rule.level) return 'locked';
  }
  if (pointsOf(game, player) < sk.cost) return 'cost';
  return null;
}

// Every profile's owned skills: connected players live, offline players from their saved profile.
function allOwnedLists(game) {
  const out = [];
  const online = new Set();
  for (const p of game.players.values()) { online.add(p.token); out.push(skillState(p).owned); }
  for (const [token, prof] of game.profiles) if (!online.has(token) && Array.isArray(prof?.sys?.skills?.owned)) out.push(prof.sys.skills.owned);
  return out;
}

// Rebuild the world `skill:<id>` flags from every profile (after a respec someone else may still hold the node).
function rebuildFlags(game) {
  const flags = game.world.flags;
  const held = new Set();
  for (const list of allOwnedLists(game)) for (const id of list) held.add(id);
  let changed = false;
  for (const s of skillList) {
    const k = 'skill:' + s.id;
    if (held.has(s.id) && !flags[k]) { flags[k] = true; changed = true; }
    if (!held.has(s.id) && flags[k]) { delete flags[k]; changed = true; }
  }
  if (changed) game.sendWorld('unlocks', { ...flags });
  return changed;
}

export function hasUnlock(game, unlockId, player) {
  if (Array.isArray(unlockId)) return unlockId.every((u) => hasUnlock(game, u, player));
  if (typeof unlockId !== 'string' || !unlockId) return unlockId == null;
  const i = unlockId.indexOf(':');
  const kind = unlockId.slice(0, i), arg = unlockId.slice(i + 1);
  if (kind === 'level') {
    const n = Number(arg);
    if (player) return player.level >= n;
    for (const p of game.players.values()) if (p.level >= n) return true;
    return false;
  }
  return !!game.world.flags[unlockId];
}

export function sendSkills(game, player) {
  const st = skillState(player);
  game.sendSelf(player, 'skills', {
    points: pointsOf(game, player), owned: st.owned.slice(), bonus: st.bonus.length + wpOf(game).length,
    total: Math.max(0, player.level - 1) + st.bonus.length + wpOf(game).length, respecCost: RESPEC_GLINT_PER_LEVEL * player.level,
  });
}

function changed(game, player) {
  game.stats.invalidate(player);
  game.stats.invalidateWorld();
  game.procs?.invalidate(player);
  sendSkills(game, player);
}

function buy(game, player, d) {
  const id = d?.skill;
  const why = blockReason(game, player, id);
  if (why) return { ok: false, err: why === 'owned' ? 'invalid' : why };
  const sk = byId.get(id);
  skillState(player).owned.push(id);
  const flagKey = 'skill:' + id;
  const fresh = !game.world.flags[flagKey];
  game.world.flags[flagKey] = true;
  game.sendWorld('unlocks', { ...game.world.flags });
  const e = player.entity;
  if (e) game.fx(e.realm, 'skill_buy', e.x, e.y, { id, branch: sk.branch });
  if (fresh && sk.unlocks?.length) {
    const names = sk.unlocks.map((s) => game.content.structures.byId[s]?.name ?? s);
    game.toast(null, `${player.name} charted ${sk.name}: ${names.join(', ')} can now be built`, 'good');
  }
  changed(game, player);
  game.bus.emit('skill.bought', { player, skill: id });
  return { ok: true, d: { skill: id } };
}

function respec(game, player) {
  const st = skillState(player);
  if (!st.owned.length) return { ok: false, err: 'invalid' };
  if (!nearStructure(game, player, 'calling_shrine', 4)) return { ok: false, err: 'range' };
  const cost = RESPEC_GLINT_PER_LEVEL * player.level;
  if (!game.call('spendGlint', cost, 'respec', player)) return { ok: false, err: 'cost' };
  st.owned = [];
  rebuildFlags(game);
  const e = player.entity;
  if (e) game.fx(e.realm, 'skill_buy', e.x, e.y, { respec: 1 });
  changed(game, player);
  game.bus.emit('skill.respec', { player });
  return { ok: true, d: { points: pointsOf(game, player) } };
}

// Personal (player) or world-wide (player null) bonus point; source keys are unique.
export function grantSkillPoint(game, player, source) {
  if (typeof source !== 'string' || !source) return false;
  if (!player) {
    const wp = wpOf(game);
    if (wp.includes(source)) return false;
    wp.push(source);
    for (const p of game.players.values()) { sendSkills(game, p); game.toast(p, '+1 skill point (Chart)', 'good'); }
    return true;
  }
  const st = skillState(player);
  if (st.bonus.includes(source)) return false;
  st.bonus.push(source);
  sendSkills(game, player);
  game.toast(player, '+1 skill point (Chart)', 'good');
  return true;
}

// ---------------------------------------------------------------- sources

function skillMods(player) {
  const out = [];
  for (const id of skillState(player).owned) {
    const s = byId.get(id);
    if (!s) continue;
    for (const m of s.mods || []) out.push(m);
    for (const f of s.flags || []) out.push({ flag: f });
  }
  return out;
}

function skillWorldMods(game) {
  const held = new Set();
  for (const list of allOwnedLists(game)) for (const id of list) held.add(id);
  const out = [];
  for (const id of held) for (const m of byId.get(id)?.worldMods || []) out.push(m);
  return out;
}

function skillEffects(player) {
  const out = [];
  for (const id of skillState(player).owned) for (const e of byId.get(id)?.effects || []) out.push({ ...e, src: 'skill:' + id });
  return out;
}

function skillProcs(player) {
  const out = [];
  for (const id of skillState(player).owned) procList(byId.get(id)?.proc).forEach((p, i) => out.push({ ...p, src: 'skill', key: `skill:${id}:${i}` }));
  return out;
}

const participantsOf = (game, list) => (list || []).map((x) => asPlayer(game, x)).filter(Boolean);

export default {
  name: 'skills',

  init(game) {
    ensureWp6(game);
    game.services.register('hasUnlock', (unlockId, player) => hasUnlock(game, unlockId, player));
    game.services.register('grantSkillPoint', (player, source) => grantSkillPoint(game, player, source));
    game.stats.addSource('skills', skillMods);
    game.stats.addWorldSource('skills', () => skillWorldMods(game));
    game.wp6.effects.add('skills', skillEffects);
    game.wp6.procSources.add('skills', skillProcs);
    game.bus.on('player.levelup', ({ player }) => sendSkills(game, player));
    game.bus.on('boss.killed', ({ boss, kind, participants }) => {
      const id = kind || boss?.kind;
      const def = game.content.bosses?.byId?.[id];
      if (!def) return;
      const src = def.kind === 'warden' ? 'boss:' + id : def.kind === 'final' ? 'final' : null;
      if (src) for (const p of participantsOf(game, participants)) grantSkillPoint(game, p, src);
    });
    game.bus.on('vault.cleared', ({ k, participants }) => {
      for (const p of participantsOf(game, participants)) grantSkillPoint(game, p, 'vault:' + k);
    });
  },

  handlers: {
    'skill.buy': buy,
    'skill.respec': respec,
  },

  onJoin(game, player) {
    sendSkills(game, player);
    if (rebuildFlags(game)) game.stats.invalidateWorld();
  },

  save(game) { return { worldPoints: wpOf(game).slice() }; },
  load(game, data) {
    ensureWp6(game).worldPoints = Array.isArray(data?.worldPoints) ? data.worldPoints.filter((s) => typeof s === 'string') : [];
    // WP14 (P0-4): worlds saved before the fix completed wings without granting the point.
    for (const k of Object.keys(game.world?.flags ?? {})) if (k.startsWith('wing:') && game.world.flags[k] && !wpOf(game).includes(k)) wpOf(game).push(k);
    rebuildFlags(game);
  },

  saveProfile(game, player) {
    const st = skillState(player);
    return { owned: st.owned.slice(), bonus: st.bonus.slice() };
  },

  loadProfile(game, player, data) {
    const st = skillState(player);
    if (!data) return;
    st.owned = (data.owned || []).filter((id) => byId.has(id));
    st.bonus = (data.bonus || []).filter((s) => typeof s === 'string');
    // A save from an older ruleset could hold more than the points allow: drop the most expensive extras.
    while (pointsOf(game, player) < 0 && st.owned.length) st.owned.pop();
  },
};
