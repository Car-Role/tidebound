// WP11: main chain (world, auto-tracked), castaway side quests (per player, turned in at the giver) and the
// Tide Board (3 repeatable contracts per in-game day, per-player progress). DESIGN 16, TECH_SPEC 7 (quests.js).
// Also: pacing telemetry flags (TECH_SPEC 12) and the scripted tutorial Mossback (DESIGN 23 step 2).
//
// self.quests = { active:[{id,type,name,giver,giverName,goals:[{label,have,n}],ready,reward}], done:[ids],
//                 pinned:[ids], board:{day,k,offers:[{id,name,goals,reward,taken,done}]}, markers:{npc:0|1|2}, lines:{npc:steps} }
// world.mainQuest = { id, n, name, goals:[{label,have,n}], done, total, complete, reward }
// world.telemetry = [{ gate, label, t }]

import { REACH } from '../../../shared/config.js';
import { BIOME_TIER } from '../../../shared/grid.js';
import { FOOD_IDS, TONIC_IDS } from '../../../shared/data/registries.js';
import { createRng, hashString } from '../../../shared/rng.js';
import { ensureWp6 } from './progression.js';

const ST = new WeakMap();
export const st = (game) => ST.get(game);

export const MAIN_GLINT_CAP = 0.25;      // each main reward <= 25% of the next plot's cost (q01 exempt)
export const MAX_PINNED = 3;
export const MAX_BOARD_ACTIVE = 3;
// WP14 (BUILD_REVIEW P2-5): the Tide Board posts one shared set of 3 contracts every BOARD_REFRESH_DAYS in-game days,
// and each contract pays once per world (first crew member to turn it in). About 2.5 contracts per real hour per
// crew instead of 7.5 per player.
export const BOARD_REFRESH_DAYS = 3;
const boardPeriod = (day) => Math.floor((Math.max(1, day) - 1) / BOARD_REFRESH_DAYS) * BOARD_REFRESH_DAYS + 1;
export const TALK_RANGE = 4.5;           // tiles from the giver / board to accept or turn in
const BIOME_NAME = { greenmarrow: 'Greenmarrow', saltfen: 'Saltfen', emberreach: 'Emberreach', glasswaste: 'Glasswaste', hoarfrost: 'Hoarfrost', umbral: 'Umbral' };
const LEGENDARY = new Set(['old_whiskers', 'bog_sovereign', 'kiln_koi', 'sun_sturgeon', 'glacier_maw', 'moon_leviathan']);
const COUNTER_LABEL = {
  sluice_items: (n) => `Move ${n} items by Sluice`,
  autobench_crafts: (n) => `Have Autobenches craft ${n} items`,
  gull_deliveries: (n) => `Deliver ${n} items by Gull`,
  relics_found: (n) => `Find ${n} relics`,
  tide_caches: (n) => `Open ${n} tide caches`,
};
const LABEL_OVERRIDE = {
  s_brannick_3: ['Craft a tier-3 hook or weapon'],
  s_ysolde_1: ['Build 10 Tide Lamps on Hoarfrost plots'],
};

// ------------------------------------------------------------------ helpers

const asList = (t) => (t == null ? null : Array.isArray(t) ? t : [t]);
export const matchTarget = (target, id) => target == null || (Array.isArray(target) ? target.includes(id) : target === id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function playerOf(game, ref) {
  if (!ref) return null;
  if (ref.token && 'entity' in ref) return ref;
  if (typeof ref === 'number') return game.players.get(ref) ?? null;
  if (ref.type === 'player') return game.playerOfEntity(ref);
  return null;
}
function involved(game, list, extra) {
  const out = new Set();
  for (const r of list || []) { const p = playerOf(game, r); if (p) out.add(p); }
  const k = playerOf(game, extra); if (k) out.add(k);
  return out;
}

function nameOf(game, id) {
  const c = game.content;
  return c.items.byId[id]?.name ?? c.structures.byId[id]?.name ?? c.enemies.byId[id]?.name ?? c.bosses.byId[id]?.name
    ?? c.dungeons.byId[id]?.name ?? c.fish.byId?.[id]?.name ?? id;
}
function targetName(game, target, plural = false) {
  const list = asList(target);
  if (!list) return null;
  if (list.every((x) => FOOD_IDS.includes(x))) return 'cooked dishes (any)';
  if (list.every((x) => TONIC_IDS.includes(x))) return 'tonics (any)';
  if (list.every((x) => LEGENDARY.has(x))) return 'legendary fish';
  if (list.length > 1 && list.every((x) => /^sluice_\d$/.test(x))) return 'Sluice tiles';
  if (list.length > 1 && list.every((x) => /^burrow_\d$/.test(x))) return 'Scuttler Burrow';
  const n = nameOf(game, list[0]);
  return list.length === 1 ? n : `${n} (or similar)`;
}

export function goalLabel(game, g, quest) {
  const n = g.n;
  const t = targetName(game, g.target);
  const where = g.biome ? ` in ${BIOME_NAME[g.biome] ?? g.biome}` : '';
  switch (g.kind) {
    case 'build': return n > 1 ? `Build ${n} ${t}${where}` : `Build a ${t}${where}`;
    case 'craft': return n > 1 ? `Craft ${n} ${t}` : `Craft ${t}`;
    case 'collect': return `Collect ${n} ${t}`;
    case 'deliver': return `Deliver ${n} ${t}`;
    case 'kill': return game.content.bosses.byId[asList(g.target)?.[0]] ? `Defeat ${t}` : `Kill ${n} ${t}`;
    case 'kill_elite': return `Kill ${n > 1 ? n + ' elites' : 'an elite'}${t ? ' ' + t : ''}${where}`;
    case 'raise': return `Raise ${n > 1 ? n + ' ' : 'a '}${g.biome ? BIOME_NAME[g.biome] + ' ' : ''}plot${n > 1 ? 's' : ''}`;
    case 'clear': return `Clear the ${t}${g.underS ? ` in under ${Math.round(g.underS / 60)} min` : ''}`;
    case 'catch': return t ? (n > 1 ? `Catch ${n} ${t}` : `Catch a ${t}`) : `Catch ${n} fish`;
    case 'donate': return `Donate ${n} Archive items${g.world ? ' (world)' : ''}`;
    case 'counter': return COUNTER_LABEL[g.target]?.(n) ?? `${String(g.target).replace(/_/g, ' ')}: ${n}`;
    case 'reach':
      if (g.target === 'level') return `Reach level ${n}`;
      if (g.target === 'flux') return `Reach ${n} Flux supply`;
      if (g.target === 'trench') return `Reach Trench floor ${n}`;
      if (g.target === 'tidegate') return `Complete all ${n} Tidegate stages`;
      return `Reach ${g.target} ${n}`;
    case 'temper': return `Temper any item to +${n}`;
    case 'solve': return `Solve ${n} shrine${n > 1 ? 's' : ''}`;
    default: return `${g.kind} ${n}`;
  }
}

function labelsFor(game, q, goals) {
  const over = LABEL_OVERRIDE[q.id];
  return goals.map((g, i) => over?.[i] ?? goalLabel(game, g, q));
}

export function rewardText(game, r) {
  if (!r) return '';
  const parts = [];
  if (r.glint) parts.push(`${fmt(r.glint)} G`);
  if (r.xp) parts.push(`${fmt(r.xp)} XP`);
  for (const it of r.items || []) parts.push(`${it.qty} ${nameOf(game, it.item)}${it.p ? ` (${Math.round(it.p * 100)}%)` : ''}`);
  if (r.moonShards) parts.push(`${r.moonShards} Moon Shards`);
  if (r.trinketRoll) parts.push('trinket roll');
  if (r.credits) parts.push('the ending');
  return parts.join(', ');
}

// ------------------------------------------------------------------ world state queries

function structureIndex(game) {
  const s = st(game);
  if (s.structIdx && s.structIdxAt === game.tickCount) return s.structIdx;
  const idx = new Map();
  const realm = game.realms.get('overworld');
  for (const e of realm?.entities.values() ?? []) {
    if (e.type !== 'structure') continue;
    let l = idx.get(e.kind);
    if (!l) { l = []; idx.set(e.kind, l); }
    l.push(e);
  }
  s.structIdx = idx; s.structIdxAt = game.tickCount;
  return idx;
}

function biomeAt(game, realm, x, y) {
  try { return game.call('featureAt', realm, x, y)?.biome ?? null; } catch { return null; }
}

function countStructures(game, target, biome, ownerToken) {
  const idx = structureIndex(game);
  let n = 0;
  for (const kind of asList(target) ?? []) {
    for (const e of idx.get(kind) ?? []) {
      if (ownerToken && e.data?.owner !== ownerToken) continue;
      if (biome && biomeAt(game, 'overworld', e.x, e.y) !== biome) continue;
      n++;
    }
  }
  return n;
}

function ownedPlots(game, biome) {
  let n = 0;
  for (const p of game.world.plots) if (p.owned && (!biome || p.biome === biome)) n++;
  return biome ? n : Math.max(0, n - 1);   // the start plot is not "raised"
}

export function highestTier(game) {
  let k = 1;
  for (const p of game.world.plots) if (p.owned) k = Math.max(k, BIOME_TIER[p.biome] ?? 1);
  return k;
}

function counterValue(game, player, id) {
  const worldCounter = game.content.deeds.some((d) => d.counter === id && d.world);
  if (worldCounter || !player) return game.world.counters?.[id] || 0;
  return player.counters?.[id] || 0;
}

function maxTemper(player) {
  let m = 0;
  const t = player?.gear?.temper;
  if (t && typeof t === 'object') for (const v of Object.values(t)) m = Math.max(m, Number(v) || 0);
  return m;
}

function invCount(game, player, target) {
  if (!player) return 0;
  let n = 0;
  for (const id of asList(target) ?? []) n += game.call('countItem', player, id) || 0;
  return n;
}

// Progress of goal i for an instance (inst.prog / inst.base); player null = world (main chain).
export function goalHave(game, g, inst, i, player) {
  const s = st(game);
  const prog = inst.prog?.[i] || 0;
  const rec = s.world.record;
  switch (g.kind) {
    case 'build': return Math.max(prog, countStructures(game, g.target, g.biome, player?.token ?? null));
    case 'kill': {
      const ids = asList(g.target) ?? [];
      if (!player && ids.some((id) => rec.bosses[id] || game.world.flags[`boss:${id}`])) return g.n;
      return prog;
    }
    case 'clear': {
      if (!player && !g.underS) {
        const k = game.content.dungeons.byId[g.target]?.k;
        if (k && (rec.vaults[k] || game.world.flags[`vault:${k}`])) return g.n;
      }
      return prog;
    }
    case 'raise': return player ? prog : ownedPlots(game, g.biome);
    case 'deliver': return invCount(game, player, g.target);
    case 'counter': return Math.max(0, counterValue(game, player, g.target) - (inst.base?.[i] || 0));
    case 'donate': return g.world ? (s.archiveTotal?.() ?? prog) : prog;
    case 'temper': return maxTemper(player);
    case 'reach': {
      if (g.target === 'level') {
        if (player) return player.level;
        let m = 0; for (const p of game.players.values()) m = Math.max(m, p.level); return m;
      }
      if (g.target === 'flux') return Math.max(Math.floor(game.worldState.flux?.supply || 0), rec.fluxPeak || 0);
      if (g.target === 'trench') return Math.max(rec.trench || 0, player?.counters?.trench_deepest || 0);
      if (g.target === 'tidegate') return s.tidegateStage?.() ?? 0;
      return 0;
    }
    default: return prog;   // craft, collect, kill_elite, catch, solve
  }
}

function instGoals(game, q, inst) { return inst.goals ?? q.goals; }

export function questProgress(game, q, inst, player) {
  const goals = instGoals(game, q, inst);
  const labels = inst.labels ?? labelsFor(game, q, goals);
  const out = goals.map((g, i) => ({ label: labels[i], have: Math.min(g.n, goalHave(game, g, inst, i, player)), n: g.n, kind: g.kind }));
  return { goals: out, ready: out.every((g) => g.have >= g.n) };
}

// ------------------------------------------------------------------ profile data

export function pq(player) {
  const sys = (player.profile.sys ||= {});
  const d = (player._quests ||= sys.quests && typeof sys.quests === 'object' ? sys.quests : {});
  d.active ||= {};
  d.done ||= [];
  d.pinned ||= [];
  d.board ||= {};
  d.boardDone ||= [];
  d.effects ||= [];
  d.flags ||= [];
  d.bank ||= 0;
  return d;
}

function newInst(game, q, player, goals = null) {
  const gl = goals ?? q.goals;
  return {
    prog: gl.map(() => 0),
    base: gl.map((g) => (g.kind === 'counter' ? counterValue(game, player, g.target) : 0)),
    at: Math.round(game.playtimeS),
  };
}

// ------------------------------------------------------------------ side quests (castaways)

export function sideStatus(game, player, npcId) {
  const npc = game.content.npcs.byId[npcId];
  if (!npc) return null;
  const d = pq(player);
  let done = 0;
  for (const qid of npc.quests) if (d.done.includes(qid)) done++;
  const activeId = npc.quests.find((qid) => d.active[qid]);
  const nextId = activeId ? null : npc.quests.find((qid) => !d.done.includes(qid));
  const q = activeId ? game.content.quests.byId[activeId] : null;
  const ready = q ? questProgress(game, q, d.active[activeId], player).ready : false;
  return { npc, done, activeId, nextId: nextId ?? null, ready, lineDone: done >= npc.quests.length };
}

function nearEntity(game, player, pred, range = TALK_RANGE) {
  const e = player.entity;
  const realm = game.realms.get(e?.realm);
  if (!realm) return null;
  const list = realm.query(e.x, e.y, range + 2, [], pred);
  let best = null, bd = Infinity;
  for (const x of list) {
    const d = Math.hypot(x.x - e.x, x.y - e.y) - (x.radius || 0.5);
    if (d <= range && d < bd) { best = x; bd = d; }
  }
  return best;
}
export const nearNpc = (game, player, npcId) => nearEntity(game, player, (x) => x.type === 'npc' && x.kind === npcId);
const nearBoard = (game, player) => {
  const has = structureIndex(game).get('tide_board')?.length;
  if (!has) return true;                 // no board placed yet (WP7 features pending): accept anywhere
  return !!nearEntity(game, player, (x) => x.type === 'structure' && x.kind === 'tide_board', TALK_RANGE + 1);
};

export function acceptQuest(game, player, qid, { force = false } = {}) {
  const c = game.content;
  const d = pq(player);
  if (typeof qid !== 'string') return { ok: false, err: 'invalid' };
  if (qid.startsWith('tb')) return acceptBoard(game, player, qid);
  const q = c.quests.byId[qid];
  if (!q || q.type !== 'side') return { ok: false, err: 'invalid' };
  if (d.active[qid] || d.done.includes(qid)) return { ok: false, err: 'invalid' };
  if (q.prereq && !d.done.includes(q.prereq)) return { ok: false, err: 'locked' };
  if (!force && !nearNpc(game, player, q.giver)) return { ok: false, err: 'range' };
  d.active[qid] = newInst(game, q, player);
  if (d.pinned.length < MAX_PINNED && !d.pinned.includes(qid)) d.pinned.push(qid);
  game.toast(player, `New quest: ${q.name} - ${labelsFor(game, q, q.goals).join(', ')}`, 'quest');
  markDirty(game, player);
  return { ok: true, d: { quest: qid } };
}

function grantRewards(game, player, r, source) {
  const out = { glint: 0, xp: 0, items: [] };
  if (r.glint > 0) { game.call('addGlint', r.glint, source, player); out.glint = r.glint; }
  if (r.xp > 0) out.xp = game.call('grantXp', player, r.xp, source) ?? r.xp;
  for (const it of r.items || []) {
    if (it.p != null && game.rng.float(0, 1) >= it.p) continue;
    if (!game.content.items.byId[it.item]) continue;
    game.call('giveItem', player, it.item, it.qty);
    out.items.push(it);
  }
  return out;
}

export function turnInQuest(game, player, qid, { force = false } = {}) {
  const c = game.content;
  const d = pq(player);
  if (typeof qid !== 'string') return { ok: false, err: 'invalid' };
  if (qid.startsWith('tb')) return turnInBoard(game, player, qid, { force });
  const q = c.quests.byId[qid];
  const inst = d.active[qid];
  if (!q || !inst) return { ok: false, err: 'invalid' };
  if (!force && !nearNpc(game, player, q.giver)) return { ok: false, err: 'range' };
  const prog = questProgress(game, q, inst, player);
  if (!prog.ready) return { ok: false, err: 'cost' };
  if (!takeDeliveries(game, player, q.goals)) return { ok: false, err: 'cost' };
  delete d.active[qid];
  d.done.push(qid);
  d.pinned = d.pinned.filter((x) => x !== qid);
  const got = grantRewards(game, player, q.rewards, 'quest');
  setFlag(game, `quest:${qid}`);
  game.toast(player, `Quest complete: ${q.name} (${rewardText(game, q.rewards)})`, 'quest');
  if (player.entity) game.fx(player.entity.realm, 'quest_done', player.entity.x, player.entity.y);
  game.bus.emit('quest.completed', { player, quest: qid });
  const npc = c.npcs.byId[q.giver];
  if (npc && npc.quests.every((x) => d.done.includes(x))) completeLine(game, player, npc);
  markDirty(game, player);
  return { ok: true, d: { quest: qid, rewards: got } };
}

// Deliver goals are taken atomically (array targets draw from any listed item, in list order).
function takeDeliveries(game, player, goals) {
  const take = [];
  const have = new Map();
  for (const g of goals) {
    if (g.kind !== 'deliver') continue;
    let need = g.n;
    for (const id of asList(g.target) ?? []) {
      if (need <= 0) break;
      const avail = (have.has(id) ? have.get(id) : game.call('countItem', player, id) || 0);
      const n = Math.min(avail, need);
      if (n > 0) { take.push({ item: id, qty: n }); have.set(id, avail - n); need -= n; }
    }
    if (need > 0) return false;
  }
  if (!take.length) return true;
  return !!game.call('takeItems', player, take);
}

function completeLine(game, player, npc) {
  const s = st(game);
  const d = pq(player);
  const r = npc.lineReward || {};
  for (const it of r.items || []) game.call('giveItem', player, it.item, it.qty);
  for (const e of r.effects || []) d.effects.push({ ...e, npc: npc.id });
  for (const f of r.flags || []) if (!d.flags.includes(f)) d.flags.push(f);
  if (r.worldMods?.length || r.flags?.length) {
    s.world.lines[npc.id] = true;
    game.stats.invalidateWorld?.();
    for (const p of game.players.values()) game.stats.invalidate(p);
  }
  for (const rid of r.recipes || []) {
    const rec = game.content.recipes.byId[rid];
    game.toast(player, `Recipe learned: ${nameOf(game, rec?.out?.item ?? rid)}`, 'good');
  }
  const first = !game.world.flags[`line:${npc.id}`];
  setFlag(game, `line:${npc.id}`);
  game.toast(null, `${player.name} completed ${npc.name}'s line.`, 'quest');
  if (first) game.bus.emit('questline.completed', { npc: npc.id, biome: npc.biome, player });
}

// ------------------------------------------------------------------ Tide Board

const boardKey = (day) => `tb${day}`;

function boardOffers(game) {
  const s = st(game);
  const day = boardPeriod(currentDay(game));
  if (s.world.board.day === day && s.world.board.offers.length) return s.world.board;
  s.world.boardClaimed = [];
  const k = highestTier(game);
  const rng = createRng((hashString(`board:${day}`) ^ game.seed) >>> 0);
  const templates = game.content.quests.filter((q) => q.type === 'board');
  const picked = [];
  const pool = templates.slice();
  while (picked.length < 3 && pool.length) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const offers = picked.map((tpl, i) => resolveBoard(game, tpl, k, rng, `${boardKey(day)}_${i}`)).filter(Boolean);
  s.world.board = { day, k, offers };
  return s.world.board;
}

function resolveBoard(game, tpl, k, rng, id) {
  const c = game.content;
  const pick = (arr) => (arr.length ? arr[rng.int(0, arr.length - 1)] : null);
  const g0 = tpl.goals[0];
  const n = typeof g0.n === 'object' ? Math.max(1, (g0.n.base || 0) + (g0.n.perK || 0) * k) : g0.n;
  let target = g0.target;
  switch (target) {
    case 'raw_tier_k': {
      const raws = new Set();
      for (const nd of c.nodes) if (nd.tier === k && ['wood', 'stone', 'ore', 'plant'].includes(nd.cls) && nd.drops?.[0]) raws.add(nd.drops[0].item);
      target = pick([...raws]); break;
    }
    case 'enemy_tier_k': target = pick(c.enemies.filter((e) => e.tier === k && !e.night).map((e) => e.id)) ?? pick(c.enemies.filter((e) => e.tier === k).map((e) => e.id)); break;
    case 'component_tier_k': {
      let list = [];
      for (let t = k; t >= 1 && !list.length; t--) list = c.items.filter((it) => it.cat === 'component' && it.tier === t).map((it) => it.id);
      target = pick(list); break;
    }
    case 'uncommon_fish_tier_k': target = c.fish.filter((f) => f.tier === k && f.rarity === 'uncommon').map((f) => f.id); if (!target.length) target = null; break;
    case 'dish': target = pick(FOOD_IDS.filter((f) => (c.items.byId[f]?.tier ?? 1) <= k)) ?? 'roast_berries'; break;
    case 'vault_tier_k': target = c.dungeons.find((d) => d.k === k)?.id ?? null; break;
    default: break;
  }
  if (target === undefined) return null;
  const goal = { kind: g0.kind, target, n, ...(g0.underS ? { underS: g0.underS } : {}) };
  const pw = 2 ** k;
  const r = tpl.rewards;
  const rewards = { glint: (r.glint?.perPow2 || 0) * pw, xp: (r.xp?.perPow2 || 0) * pw, items: [] };
  for (const it of r.items || []) {
    let item = it.item;
    if (item === 'vault_key_k') item = `vault_key_${k}`;
    if (item === 'random_tonic') item = pick([...TONIC_IDS]);
    if (c.items.byId[item]) rewards.items.push({ item, qty: it.qty, ...(it.p != null ? { p: it.p } : {}) });
  }
  if (r.trinketRoll) rewards.trinketRoll = r.trinketRoll;
  const q = { id, type: 'board', tpl: tpl.id, name: `${tpl.name} (tier ${k})`, goals: [goal], rewards };
  q.labels = labelsFor(game, q, q.goals);
  return q;
}

function currentDay(game) {
  try { return game.call('timeInfo')?.day ?? game.world.day ?? 1; } catch { return game.world.day ?? 1; }
}

function acceptBoard(game, player, id) {
  const d = pq(player);
  const board = boardOffers(game);
  const offer = board.offers.find((o) => o.id === id);
  if (!offer) return { ok: false, err: 'invalid' };
  if (d.board[id] || d.boardDone.includes(id)) return { ok: false, err: 'invalid' };
  if ((st(game).world.boardClaimed || []).includes(id)) return { ok: false, err: 'invalid' };
  if (Object.keys(d.board).length >= MAX_BOARD_ACTIVE) return { ok: false, err: 'full' };
  if (!nearBoard(game, player)) return { ok: false, err: 'range' };
  d.board[id] = { ...newInst(game, offer, player, offer.goals), goals: offer.goals, labels: offer.labels, name: offer.name, rewards: offer.rewards, tpl: offer.tpl };
  if (d.pinned.length < MAX_PINNED) d.pinned.push(id);
  game.toast(player, `Contract taken: ${offer.labels[0]}`, 'quest');
  markDirty(game, player);
  return { ok: true, d: { quest: id } };
}

function turnInBoard(game, player, id, { force = false } = {}) {
  const d = pq(player);
  const inst = d.board[id];
  if (!inst) return { ok: false, err: 'invalid' };
  if (!force && !nearBoard(game, player)) return { ok: false, err: 'range' };
  const q = { id, type: 'board', goals: inst.goals };
  if (!questProgress(game, q, inst, player).ready) return { ok: false, err: 'cost' };
  const sw = st(game).world;
  if ((sw.boardClaimed ||= []).includes(id)) { delete d.board[id]; markDirty(game, player); return { ok: false, err: 'invalid' }; }
  if (!takeDeliveries(game, player, inst.goals)) return { ok: false, err: 'cost' };
  delete d.board[id];
  d.boardDone.push(id);
  sw.boardClaimed.push(id);
  for (const o of game.players.values()) {
    if (o === player || !o._quests?.board?.[id]) continue;
    delete o._quests.board[id];
    game.toast(o, `${player.name} completed the contract "${inst.name ?? id}" for the crew.`, 'quest');
    markDirty(game, o);
  }
  d.pinned = d.pinned.filter((x) => x !== id);
  const got = grantRewards(game, player, inst.rewards, 'quest');
  if (inst.rewards.trinketRoll && game.rng.float(0, 1) < 0.5) {
    const k = highestTier(game);
    const pool = game.content.items.filter((it) => it.cat === 'trinket' && (it.tier ?? 1) <= k);
    if (pool.length) { const t = pool[game.rng.int(0, pool.length - 1)]; game.call('giveItem', player, t.id, 1); got.items.push({ item: t.id, qty: 1 }); }
  }
  game.toast(player, `Contract complete: ${inst.name} (${rewardText(game, { ...inst.rewards, items: got.items })})`, 'quest');
  if (player.entity) game.fx(player.entity.realm, 'quest_done', player.entity.x, player.entity.y);
  game.bus.emit('quest.completed', { player, quest: id });
  markDirty(game, player);
  return { ok: true, d: { quest: id, rewards: got } };
}

// ------------------------------------------------------------------ main chain

function mainList(game) { return game.content.quests.filter((q) => q.type === 'main').sort((a, b) => a.n - b.n); }

function currentMain(game) {
  const s = st(game);
  return mainList(game).find((q) => !s.world.main.done.includes(q.id)) ?? null;
}

function ensureMainInst(game, q) {
  const m = st(game).world.main;
  if (!m.inst[q.id]) m.inst[q.id] = newInst(game, q, null);
  return m.inst[q.id];
}

function checkMain(game, lastPlayer = null) {
  const s = st(game);
  for (let guard = 0; guard < 30; guard++) {
    const q = currentMain(game);
    if (!q) break;
    const inst = ensureMainInst(game, q);
    if (!questProgress(game, q, inst, null).ready) break;
    completeMain(game, q, lastPlayer);
  }
  publishMain(game);
  s.lastPlayer = null;
}

function completeMain(game, q, lastPlayer) {
  const s = st(game);
  const m = s.world.main;
  m.done.push(q.id);
  delete m.inst[q.id];
  const r = q.rewards || {};
  let glint = r.glint || 0;
  if (glint > 0 && !r.capExempt) {
    const next = game.call('landCostNext')?.glint;
    if (Number.isFinite(next) && next > 0) glint = Math.min(glint, Math.floor(next * MAIN_GLINT_CAP));
  }
  if (glint > 0) game.call('addGlint', glint, 'quest', lastPlayer ?? null);
  for (const p of game.players.values()) {
    if (r.xp > 0) game.call('grantXp', p, r.xp, 'quest');
    for (const it of r.items || []) if (game.content.items.byId[it.item]) game.call('giveItem', p, it.item, it.qty);
    if (p.entity) game.fx(p.entity.realm, 'quest_done', p.entity.x, p.entity.y, { main: q.id });
  }
  // bound players who are offline get the XP when they next join
  if (r.xp > 0) {
    const online = new Set([...game.players.values()].map((p) => p.token));
    for (const tok of game.world.bound || []) if (!online.has(tok)) s.world.pendingXp[tok] = (s.world.pendingXp[tok] || 0) + r.xp;
  }
  if (r.moonShards) s.world.shardBank = (s.world.shardBank || 0) + r.moonShards;
  setFlag(game, `quest:${q.id}`);
  const shown = { ...r, glint };
  game.toast(null, `Main quest complete: ${q.name}${rewardText(game, shown) ? ' (' + rewardText(game, shown) + ')' : ''}`, 'quest');
  for (const rid of r.showRecipes || []) game.toast(null, `New recipe shown: ${nameOf(game, game.content.recipes.byId[rid]?.out?.item ?? rid)}`, 'good');
  game.bus.emit('quest.completed', { player: lastPlayer ?? null, quest: q.id });
  const next = currentMain(game);
  if (next) {
    ensureMainInst(game, next);
    game.toast(null, `Next: ${next.name} - ${labelsFor(game, next, next.goals).join(', ')}`, 'quest');
  }
}

function publishMain(game) {
  const s = st(game);
  const q = currentMain(game);
  const total = mainList(game).length;
  let view;
  if (!q) view = { id: null, name: 'The tide is yours', goals: [], done: total, total, complete: true, reward: '' };
  else {
    const inst = ensureMainInst(game, q);
    const prog = questProgress(game, q, inst, null);
    view = { id: q.id, n: q.n, name: q.name, goals: prog.goals.map(({ label, have, n }) => ({ label, have, n })), done: s.world.main.done.length, total, complete: false, reward: rewardText(game, q.rewards) };
  }
  const json = JSON.stringify(view);
  if (json !== s.mainJson) { s.mainJson = json; game.sendWorld('mainQuest', view); }
}

// ------------------------------------------------------------------ events -> progress

function bumpGoals(game, kind, match, players, qty = 1, worldToo = true) {
  const s = st(game);
  let any = false;
  if (worldToo) {
    const q = currentMain(game);
    if (q) {
      const inst = ensureMainInst(game, q);
      q.goals.forEach((g, i) => { if (g.kind === kind && match(g)) { inst.prog[i] = (inst.prog[i] || 0) + qty; any = true; } });
      if (any) s.mainDirty = true;
    }
  }
  for (const p of players) {
    const d = pq(p);
    const scan = (inst, goals) => goals.forEach((g, i) => {
      if (g.kind === kind && match(g)) { inst.prog[i] = (inst.prog[i] || 0) + qty; markDirty(game, p); }
    });
    for (const [qid, inst] of Object.entries(d.active)) { const q = game.content.quests.byId[qid]; if (q) scan(inst, q.goals); }
    for (const inst of Object.values(d.board)) scan(inst, inst.goals);
  }
}

function setFlag(game, flag, value = true) {
  if (game.world.flags[flag]) return;
  game.world.flags[flag] = value;
  st(game).flagsDirty = true;
}

export function markDirty(game, player) { st(game).dirty.add(player); }

function markers(game, player) {
  const out = {};
  for (const npc of game.content.npcs) {
    const s = sideStatus(game, player, npc.id);
    out[npc.id] = s.ready ? 2 : s.nextId ? 1 : 0;
  }
  return out;
}

function sendQuests(game, player) {
  const s = st(game);
  const c = game.content;
  const d = pq(player);
  const active = [];
  for (const [qid, inst] of Object.entries(d.active)) {
    const q = c.quests.byId[qid];
    if (!q) continue;
    const prog = questProgress(game, q, inst, player);
    active.push({ id: qid, type: q.type, name: q.name, giver: q.giver, giverName: c.npcs.byId[q.giver]?.name ?? '', goals: prog.goals.map(({ label, have, n }) => ({ label, have, n })), ready: prog.ready, reward: rewardText(game, q.rewards) });
  }
  for (const [id, inst] of Object.entries(d.board)) {
    const q = { id, type: 'board', goals: inst.goals };
    const prog = questProgress(game, q, inst, player);
    active.push({ id, type: 'board', name: inst.name, giver: 'tide_board', giverName: 'Tide Board', goals: prog.goals.map(({ label, have, n }) => ({ label, have, n })), ready: prog.ready, reward: rewardText(game, inst.rewards) });
  }
  const board = boardOffers(game);
  const lines = {};
  for (const npc of c.npcs) lines[npc.id] = npc.quests.filter((x) => d.done.includes(x)).length;
  const view = {
    active, done: d.done.slice(), pinned: d.pinned.slice(),
    board: { day: board.day, k: board.k, offers: board.offers.map((o) => ({ id: o.id, name: o.name, goals: o.labels, reward: rewardText(game, o.rewards), taken: !!d.board[o.id], done: d.boardDone.includes(o.id) })) },
    markers: markers(game, player), lines,
  };
  const json = JSON.stringify(view);
  if (json === s.sentJson.get(player)) return;
  s.sentJson.set(player, json);
  game.sendSelf(player, 'quests', view);
}

function updateNpcMarkers(game) {
  for (const realm of game.realms.values()) {
    for (const e of realm.entities.values()) {
      if (e.type !== 'npc') continue;
      let m = 0;
      for (const p of game.players.values()) m = Math.max(m, sideStatus(game, p, e.kind)?.ready ? 2 : sideStatus(game, p, e.kind)?.nextId ? 1 : 0);
      if (e.pub.q !== m) e.set('q', m);
    }
  }
}

// ------------------------------------------------------------------ telemetry (TECH_SPEC 12, DESIGN A.9)

const GATE_LABELS = {
  first_plot: 'First plot', final_boss: 'Drowned Moon',
};
function gateLabel(game, gate) {
  if (GATE_LABELS[gate]) return GATE_LABELS[gate];
  let m;
  if ((m = /^vault_(\d)$/.exec(gate))) return `Vault ${m[1]} cleared (${game.content.dungeons.find((d) => d.k === +m[1])?.name ?? ''})`;
  if ((m = /^beacon_(\d)$/.exec(gate))) return `Beacon ${m[1]}`;
  if ((m = /^tidegate_(\d)$/.exec(gate))) return `Tidegate stage ${m[1]}`;
  if ((m = /^warden_(\w+)$/.exec(gate))) return game.content.bosses.byId[m[1]]?.name ?? m[1];
  return gate;
}
export function telemetryGate(game, gate) {
  const key = `gate:${gate}`;
  if (game.world.flags[key] != null) return;
  game.world.flags[key] = Math.round(game.playtimeS);
  st(game).flagsDirty = true;
  publishTelemetry(game);
}
function publishTelemetry(game) {
  const list = [];
  for (const [k, v] of Object.entries(game.world.flags)) {
    if (!k.startsWith('gate:') || typeof v !== 'number') continue;
    const gate = k.slice(5);
    list.push({ gate, label: gateLabel(game, gate), t: v });
  }
  list.sort((a, b) => a.t - b.t);
  game.sendWorld('telemetry', list);
}

// ------------------------------------------------------------------ system

export default {
  name: 'quests',

  init(game) {
    const s = {
      world: null, dirty: new Set(), sentJson: new WeakMap(), mainJson: '', mainDirty: false, flagsDirty: false,
      structIdx: null, structIdxAt: -1, archiveTotal: null, tidegateStage: null,
    };
    ST.set(game, s);
    const c = game.content;
    const on = (ev, fn) => game.bus.on(ev, fn);

    on('structure.placed', ({ player, structure }) => {
      const p = playerOf(game, player);
      const biome = biomeAt(game, structure.realm, structure.x, structure.y);
      const m = (g) => matchTarget(g.target, structure.kind) && (!g.biome || g.biome === biome);
      bumpGoals(game, 'build', m, p ? [p] : [], 1, true);
      s.mainDirty = true;
    });
    on('item.crafted', ({ player, item, qty = 1, byMachine }) => {
      const p = playerOf(game, player);
      if (byMachine || !p) return;
      bumpGoals(game, 'craft', (g) => matchTarget(g.target, item), [p], qty);
      // DESIGN 23 step 2: the first weapon wakes one scripted Mossback (5 Glint)
      if (/^(blade|bow|staff)_1$/.test(item)) spawnTutorialMossback(game, p);
    });
    on('item.pickup', ({ player, item, qty = 1 }) => {
      const p = playerOf(game, player);
      if (p) bumpGoals(game, 'collect', (g) => matchTarget(g.target, item), [p], qty);
    });
    const killed = ({ killer, mob, kind, elite, participants }) => {
      const ps = [...involved(game, participants, killer)];
      const k = kind ?? mob?.kind;
      bumpGoals(game, 'kill', (g) => matchTarget(g.target, k), ps, 1);
      if (elite || mob?.pub?.el) {
        const biome = mob ? biomeAt(game, mob.realm, mob.x, mob.y) : null;
        bumpGoals(game, 'kill_elite', (g) => matchTarget(g.target, k) && (!g.biome || g.biome === biome), ps, 1);
      }
      if (mob?.data?.tutorial) {
        game.call('addGlint', 5, 'tutorial', ps[0] ?? null);
        game.fx(mob.realm, 'glint_burst', mob.x, mob.y);
      }
    };
    on('mob.killed', (ev) => { if (ev.mob?.type !== 'boss') killed(ev); });
    on('boss.killed', ({ boss, kind, participants }) => {
      const k = kind ?? boss?.kind;
      s.world.record.bosses[k] = true;
      killed({ kind: k, participants, mob: boss });
      const def = c.bosses.byId[k];
      if (def?.kind === 'warden') telemetryGate(game, `warden_${k}`);
      if (def?.kind === 'final') telemetryGate(game, 'final_boss');
      s.mainDirty = true;
    });
    on('land.raised', ({ player }) => {
      bumpGoals(game, 'raise', () => true, [...game.players.values()], 1, false);
      telemetryGate(game, 'first_plot');
      s.mainDirty = true;
    });
    on('vault.cleared', ({ k, participants, seconds }) => {
      s.world.record.vaults[k] = true;
      const id = c.dungeons.find((dd) => dd.k === k)?.id;
      bumpGoals(game, 'clear', (g) => g.target === id && (!g.underS || (Number.isFinite(seconds) && seconds <= g.underS)), [...involved(game, participants)], 1, false);
      telemetryGate(game, `vault_${k}`);
      s.mainDirty = true;
    });
    on('fish.caught', ({ player, fish }) => {
      const p = playerOf(game, player);
      if (p) bumpGoals(game, 'catch', (g) => matchTarget(g.target, fish), [p], 1);
    });
    on('archive.donated', ({ player }) => {
      const p = playerOf(game, player);
      bumpGoals(game, 'donate', (g) => !g.world, p ? [p] : [], 1);
      for (const pl of game.players.values()) markDirty(game, pl);
    });
    on('shrine.solved', ({ player }) => {
      const p = playerOf(game, player);
      bumpGoals(game, 'solve', () => true, p ? [p] : [], 1);
    });
    on('trench.floor', ({ floor }) => {
      if (floor > (s.world.record.trench || 0)) { s.world.record.trench = floor; s.mainDirty = true; }
      if (floor >= 10 && !game.world.flags['trench:10']) game.world.flags['trench:10'] = true;     // WP14: start-at-10 gate
    });
    on('beacon.lit', ({ k }) => { telemetryGate(game, `beacon_${k}`); s.mainDirty = true; });
    on('tidegate.stage', ({ stage }) => { telemetryGate(game, `tidegate_${stage}`); s.mainDirty = true; });
    on('player.levelup', ({ player }) => { const p = playerOf(game, player); if (p) markDirty(game, p); });

    // Line rewards: world stat mods, per-player and party flags.
    game.stats.addWorldSource?.('lines', () => {
      const mods = [];
      for (const npc of c.npcs) if (s.world?.lines?.[npc.id]) for (const m of npc.lineReward?.worldMods || []) mods.push(m);
      return mods;
    });
    game.stats.addFlagSource?.('lines', (player) => {
      const out = new Set(player?._quests?.flags || []);
      // Morrow's line: the whole party may start Trench runs at floor 10
      for (const npc of c.npcs) if (s.world?.lines?.[npc.id]) for (const f of npc.lineReward?.flags || []) out.add(f);
      return [...out];
    });
    // Extra services (not in 5.5) for packages that read castaway line rewards:
    //   lineEffects(player) -> [{ id, ...params, npc }]  e.g. temper_glint_discount (WP6b), rod_rare_fish (WP9), moon_shards_next
    //   questDone(player|null, questId) -> boolean
    game.services.register('lineEffects', (player) => (player ? pq(player).effects.slice() : []));
    // WP14 (BUILD_REVIEW P0-2): castaway line effects join the single effects pipeline.
    ensureWp6(game);
    game.effects.addSource('lines', (p) => (p ? pq(p).effects.map((e) => ({ ...e, src: 'line:' + e.npc })) : []));
    game.services.register('questDone', (player, qid) => (player ? pq(player).done.includes(qid) : st(game).world.main.done.includes(qid) || !!game.world.flags[`quest:${qid}`]));
    game.services.register('questAccept', (player, qid) => acceptQuest(game, player, qid, { force: true }));

    game.call('registerInteract', 'tide_board', (g, player) => {
      boardOffers(g);
      sendQuests(g, player);
      g.sendSelf(player, 'ui', { panel: 'journal', tab: 'board', t: g.now });
      return { ok: true };
    });
  },

  load(game, data) {
    const s = st(game);
    const w = data && typeof data === 'object' ? structuredClone(data) : {};
    w.main ||= {};
    w.main.done ||= [];
    w.main.inst ||= {};
    w.record ||= {};
    w.record.vaults ||= {};
    w.record.bosses ||= {};
    w.record.trench ||= 0;
    w.board ||= { day: null, offers: [] };
    w.boardClaimed ||= [];
    w.lines ||= {};
    w.tut ||= {};
    w.pendingXp ||= {};
    w.shardBank ||= 0;
    s.world = w;
    s.mainJson = '';
    const q = currentMain(game);
    if (q) ensureMainInst(game, q);
    publishMain(game);
    publishTelemetry(game);
    game.stats.invalidateWorld?.();
  },

  save(game) { return st(game).world; },

  loadProfile(game, player, data) {
    player._quests = data && typeof data === 'object' ? structuredClone(data) : {};
    pq(player);
  },
  saveProfile(game, player) { return pq(player); },

  onJoin(game, player) {
    const s = st(game);
    const xp = s.world.pendingXp[player.token];
    if (xp > 0) {
      delete s.world.pendingXp[player.token];
      game.call('grantXp', player, xp, 'quest');
      game.toast(player, `While you were away the crew finished main quests: +${fmt(xp)} XP`, 'quest');
    }
    // drop board contracts from earlier days that were never taken... taken ones stay until turned in
    const d = pq(player);
    d.boardDone = d.boardDone.filter((id) => id.startsWith(boardKey(boardPeriod(currentDay(game))) + '_'));
    s.sentJson.delete(player);
    sendQuests(game, player);
  },

  onLeave(game, player) { st(game).dirty.delete(player); },

  slowTick(game) {
    const s = st(game);
    // record flux peak for reach goals
    const sup = game.worldState.flux?.supply;
    if (Number.isFinite(sup) && sup > (s.world.record.fluxPeak || 0)) s.world.record.fluxPeak = Math.floor(sup);
    // a new day refreshes the board
    const day = currentDay(game);
    if (s.world.board.day !== day) {
      boardOffers(game);
      for (const p of game.players.values()) markDirty(game, p);
      if (game.players.size) game.toast(null, 'The Tide Board has new contracts.', 'info');
    }
    checkMain(game);
    for (const p of game.players.values()) sendQuests(game, p);
    s.dirty.clear();
    updateNpcMarkers(game);
    if (s.flagsDirty) { s.flagsDirty = false; game.sendWorld('unlocks', game.world.flags); }
  },

  handlers: {
    'quest.accept': (game, player, d) => acceptQuest(game, player, d?.quest),
    'quest.turnin': (game, player, d) => {
      const r = turnInQuest(game, player, d?.quest);
      if (r.ok) sendQuests(game, player);
      return r;
    },
    'quest.pin': (game, player, d) => {
      const qid = d?.quest;
      if (typeof qid !== 'string' || qid.length > 24) return { ok: false, err: 'invalid' };
      const q = pq(player);
      if (q.pinned.includes(qid)) q.pinned = q.pinned.filter((x) => x !== qid);
      else {
        if (!q.active[qid] && !q.board[qid]) return { ok: false, err: 'invalid' };
        if (q.pinned.length >= MAX_PINNED) q.pinned.shift();
        q.pinned.push(qid);
      }
      sendQuests(game, player);
      return { ok: true, d: { pinned: q.pinned.slice() } };
    },
  },
};

function spawnTutorialMossback(game, player) {
  const s = st(game);
  if (s.world.tut.mossback || !player.entity || player.entity.realm !== 'overworld') return;
  s.world.tut.mossback = true;
  const e = player.entity;
  const realm = game.realms.get('overworld');
  for (let i = 0; i < 12; i++) {
    const a = game.rng.float(0, Math.PI * 2);
    const x = e.x + Math.cos(a) * 5, y = e.y + Math.sin(a) * 5;
    if (!realm.isWalkable(Math.floor(x), Math.floor(y))) continue;
    const mob = game.call('spawnMob', realm, 'mossback', x, y, { noLoot: true });
    if (mob) {
      mob.data.tutorial = true;
      game.fx(realm, 'summon_puff', x, y);
      game.toast(player, 'Something stirs in the grass. Try your new weapon (LMB).', 'info');
    }
    return;
  }
}

export { boardOffers, sendQuests, currentMain, publishMain, checkMain, setFlag, REACH };
