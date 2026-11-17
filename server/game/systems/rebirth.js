// WP11: Rebirth, "the Turning" (DESIGN 18.2). Vote, reset, Moon Shards, Moon Chart (20 perks).
//
// Available after the Drowned Moon (flag `moon:beaten`). Every bound player (game.world.bound; if nobody is bound
// yet, every connected player) must vote yes with `rebirth.vote {yes}` while connected (near the Tidestone when one
// exists). A unanimous yes starts a COUNTDOWN_S countdown, then the Turning:
//   resets: plots, structures, inventories, Glint, level, cards, skill points, gear, quests (main, side, board,
//           Tidegate, finale) and the per-run world flags;
//   keeps:  Archive, Logbook (deeds, counters), cosmetics, class Mastery, bestiary, Moon Chart, recipe flags
//           (`quest:s_*`), Trench record, bound list.
// Moon Shards per player = 5 (final boss) + floor(average level / 100) + 1 per completed Archive wing
//   + floor(deepest Trench floor / 10) + quest bonuses (q23: 2 for every bound player; Nix's line: +3 personal).
// Tide Height +1 (max 10). Bus `rebirth {tideHeight}` is emitted AFTER the world reset: systems with per-player
// state that resets (cards, skills, gear, consumables, machines, nodes, ...) clear it for connected players; for
// offline profiles this system drops profile.sys.{cards, skills, gear, consumables, abilities, dungeons, quests}.
//
// self.moon = { shards, perks:{id:rank}, turnings, preview }   world.rebirth = { available, needed:[names],
//   votes:{name:bool}, offline:[names], countdown, tideHeight, turnings }

import { START_PLOT } from '../../../shared/config.js';
import { plotIndex } from '../../../shared/grid.js';
import { createOverworld, populatePlot } from '../worldgen/index.js';
import { stampFeature } from '../worldgen/features.js';
import { resize as resizeInv } from '../inventory.js';
import { st as questState, pq } from './quests.js';
import { wingsComplete } from './archive.js';
import { ensureWp6 } from './progression.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);
export const COUNTDOWN_S = 5;
export const MAX_TIDE_HEIGHT = 10;
const VOTE_RANGE = 10;
const RESET_SYS = ['cards', 'skills', 'gear', 'consumables', 'abilities', 'dungeons'];
const KEEP_FLAG = (k) => k.startsWith('wing:') || k.startsWith('quest:s_') || k === 'moon:beaten';

// ------------------------------------------------------------------ Moon Chart data per profile

function moonOf(profile) {
  const sys = (profile.sys ||= {});
  const m = (sys.rebirth ||= {});
  m.shards ||= 0;
  m.perks ||= {};
  m.turnings ||= 0;
  return m;
}
const moon = (player) => moonOf(player.profile);

export function perkRank(player, id) { return player ? (moon(player).perks[id] || 0) : 0; }

function scaledMods(list, rank) { return (list || []).map((m) => ({ ...m, v: m.v * rank })); }

// ------------------------------------------------------------------ voters and shards

function voterTokens(game) {
  const bound = (game.world.bound || []).filter((t) => game.profiles.has(t) || [...game.players.values()].some((p) => p.token === t));
  if (bound.length) return bound;
  return [...game.players.values()].map((p) => p.token);
}
const nameOfToken = (game, tok) => [...game.players.values()].find((p) => p.token === tok)?.name ?? game.profiles.get(tok)?.name ?? '?';
const onlineByToken = (game, tok) => [...game.players.values()].find((p) => p.token === tok) ?? null;

function trenchDeepest(game) {
  let m = questState(game)?.world?.record?.trench || 0;
  for (const p of game.players.values()) m = Math.max(m, p.counters?.trench_deepest || 0);
  for (const prof of game.profiles.values()) m = Math.max(m, prof.counters?.trench_deepest || 0);
  return m;
}

function levelOf(game, tok) {
  const p = onlineByToken(game, tok);
  return p ? p.level : (game.profiles.get(tok)?.level ?? 1);
}

// Shards a token would receive at a Turning now.
export function shardPreview(game, tok) {
  const toks = voterTokens(game);
  const avg = toks.length ? toks.reduce((a, t) => a + levelOf(game, t), 0) / toks.length : 1;
  const qs = questState(game);
  const p = onlineByToken(game, tok);
  const effects = p ? pq(p).effects : (game.profiles.get(tok)?.sys?.quests?.effects ?? []);
  const personal = effects.filter((e) => e.id === 'moon_shards_next').reduce((a, e) => a + (e.n || 0), 0);
  const parts = {
    finalBoss: game.world.flags['moon:beaten'] ? 5 : 0,
    levels: Math.floor(avg / 100),
    wings: wingsComplete(game),
    trench: Math.floor(trenchDeepest(game) / 10),
    quests: (qs?.world?.shardBank || 0) + personal,
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

// ------------------------------------------------------------------ publishing

function publishWorld(game) {
  const s = st(game);
  const toks = voterTokens(game);
  const view = {
    available: !!game.world.flags['moon:beaten'],
    needed: toks.map((t) => nameOfToken(game, t)),
    votes: Object.fromEntries(Object.entries(s.votes).map(([t, v]) => [nameOfToken(game, t), v])),
    offline: toks.filter((t) => !onlineByToken(game, t)).map((t) => nameOfToken(game, t)),
    countdown: s.countdownAt != null ? Math.max(0, Math.ceil(COUNTDOWN_S - (game.now - s.countdownAt))) : null,
    tideHeight: game.world.tideHeight || 0,
    turnings: s.data.turnings || 0,
  };
  const json = JSON.stringify(view);
  if (json !== s.json) { s.json = json; game.sendWorld('rebirth', view); }
}

function sendMoon(game, player) {
  const m = moon(player);
  game.sendSelf(player, 'moon', { shards: m.shards, perks: m.perks, turnings: m.turnings, preview: shardPreview(game, player.token) });
}

// ------------------------------------------------------------------ voting

function vote(game, player, yes) {
  const s = st(game);
  if (!game.world.flags['moon:beaten']) return { ok: false, err: 'locked' };
  const toks = voterTokens(game);
  if (!toks.includes(player.token)) return { ok: false, err: 'denied' };
  const stone = tidestone(game);
  if (stone && (player.entity.realm !== stone.realm || Math.hypot(player.entity.x - stone.x, player.entity.y - stone.y) > VOTE_RANGE)) {
    return { ok: false, err: 'range', d: { reason: 'Vote at the Tidestone' } };
  }
  s.votes[player.token] = !!yes;
  if (!yes) {
    if (s.countdownAt != null) game.toast(null, `${player.name} called off the Turning.`, 'warn');
    s.countdownAt = null;
  } else {
    game.toast(null, `${player.name} is ready to Turn the tide.`, 'info');
  }
  checkVotes(game);
  publishWorld(game);
  return { ok: true, d: { yes: !!yes } };
}

function checkVotes(game) {
  const s = st(game);
  const toks = voterTokens(game);
  const all = toks.length > 0 && toks.every((t) => s.votes[t] === true && onlineByToken(game, t));
  if (all && s.countdownAt == null) {
    s.countdownAt = game.now;
    game.toast(null, `Everyone agrees. The Turning begins in ${COUNTDOWN_S} seconds...`, 'quest');
  } else if (!all && s.countdownAt != null) s.countdownAt = null;
}

function tidestone(game) {
  for (const e of game.realms.get('overworld')?.entities.values() ?? []) if (e.type === 'structure' && e.kind === 'tidestone') return e;
  return null;
}

// ------------------------------------------------------------------ the Turning

export function performTurning(game) {
  const s = st(game);
  const c = game.content;
  const toks = new Set(voterTokens(game));
  for (const p of game.players.values()) toks.add(p.token);
  const height = Math.min(MAX_TIDE_HEIGHT, (game.world.tideHeight || 0) + 1);

  // 1. shards (computed before anything resets)
  const award = new Map();
  for (const t of toks) award.set(t, shardPreview(game, t));

  // 2. world: Glint, plots, flags, Tide Height
  game.world.glint = 0;
  for (const p of game.world.plots) {
    const start = p.px === START_PLOT.px && p.py === START_PLOT.py;
    p.owned = start; p.ordinal = start ? 0 : null; p.known = start;
  }
  const telemetry = {};
  for (const k of Object.keys(game.world.flags)) {
    if (k.startsWith('gate:')) telemetry[k.slice(5)] = game.world.flags[k];
    if (!KEEP_FLAG(k)) delete game.world.flags[k];
  }
  s.data.history.push({ tideHeight: game.world.tideHeight || 0, playtimeS: Math.round(game.playtimeS), telemetry });
  game.world.tideHeight = height;
  const qs = questState(game);
  if (qs) {
    qs.world.main = { done: [], inst: {} };
    qs.world.board = { day: null, offers: [] };
    qs.world.lines = {};
    qs.world.shardBank = 0;
    qs.world.tut = { mossback: true };
  }

  // 3. rebuild the overworld (structures, nodes, drops and tile edits are gone)
  const old = game.realms.get('overworld');
  const fresh = createOverworld(game.world);
  const players = [...game.players.values()];
  for (const p of players) {
    const r = game.realms.get(p.entity.realm);
    r?.remove(p.entity);
  }
  for (const [id, r] of [...game.realms]) if (id !== 'overworld') game.realms.delete(id);
  game.realms.set('overworld', fresh);
  const startPlot = game.world.plots[plotIndex(START_PLOT.px, START_PLOT.py)];
  try { stampFeature(game, fresh, startPlot); } catch (err) { console.error('[tb:rebirth] stampFeature', err); }
  populatePlot(game, fresh, START_PLOT.px, START_PLOT.py);
  const spawn = game.spawnPoint();
  for (const p of players) {
    fresh.add(p.entity);
    p.entity.hp = p.entity.maxHp;
    game.movePlayer(p, 'overworld', spawn.x, spawn.y);
    if (p.body) { p.body.x = spawn.x; p.body.y = spawn.y; }
  }
  void old;

  // 4. players: online records and offline profiles
  for (const p of players) resetPlayer(game, p, award.get(p.token));
  for (const [tok, prof] of game.profiles) {
    if (players.some((p) => p.token === tok)) continue;
    resetProfile(game, prof, award.get(tok));
    prof.counters ||= {};
    prof.counters.rebirths = (prof.counters.rebirths || 0) + 1;
  }

  // 5. Moon Chart starting effects that act on the world
  if (players.some((p) => perkRank(p, 'moon_beacon') > 0)) game.world.flags['beacon:1'] = true;

  s.data.turnings = (s.data.turnings || 0) + 1;
  s.votes = {};
  s.countdownAt = null;
  game.stats.invalidateWorld();

  game.sendWorld('glint', 0);
  game.sendWorld('plots', game.plotsView());
  game.sendWorld('tideHeight', height);
  game.sendWorld('unlocks', game.world.flags);
  try { game.sendWorld('landNext', game.call('landCostNext')); } catch { /* WP7 */ }
  game.bus.emit('rebirth', { tideHeight: height });

  // starting kit after other systems reset theirs
  for (const p of players) giveStartKit(game, p);
  for (const p of players) {
    game.fx('overworld', 'moon_shards', p.entity.x, p.entity.y, { turning: 1 });
    sendMoon(game, p);
  }
  game.toast(null, `The tide turns. Tide Height is now ${height}. The sea remembers you, and comes back stronger.`, 'quest');
  publishWorld(game);
  return true;
}

function resetPlayer(game, p, shards) {
  const m = moon(p);
  m.shards += shards?.total || 0;
  m.turnings += 1;
  p.level = 1; p.xp = 0;
  p.entity.set('lv', 1);
  p.inv.slots.fill(null);
  p.hotbar.fill(null);
  p.gear = {};
  const keepMet = pq(p).met || [];
  p._quests = { met: keepMet };
  pq(p);
  // WP14 (BUILD_REVIEW P0-3, moon_keep): keep up to rank-many chosen cards (m.keep, else the highest ranks).
  const kept = keptCards(p.cardState?.owned || p.profile?.sys?.cards?.owned || {}, m.keep, perkRank(p, 'moon_keep'));
  for (const name of RESET_SYS) delete p.profile.sys?.[name];
  // WP14: connected players' live per-system state must reset too (it is not re-read from the profile).
  delete p.cardState; delete p.skillState; delete p.abState; delete p.dungeon; delete p.gearInit;
  p.buffs?.clear?.();
  if (Object.keys(kept).length) {
    for (const sys of game.systems ?? []) if (sys.name === 'cards') sys.loadProfile?.(game, p, { owned: kept });
  }
  game.stats.invalidate(p);
  const stats = game.stats.of(p);
  resizeInv(p.inv, Math.max(24, stats.invSlots || 24));
  p.entity.maxHp = stats.maxHp; p.entity.hp = stats.maxHp;
  game.sendSelf(p, 'inv', game.invView(p));
  game.sendSelf(p, 'gear', p.gear);
  game.sendSelf(p, 'xp', { level: 1, xp: 0, next: game.xpToNext(1) });
  game.sendSelf(p, 'stats', stats);
  game.toast(p, `The Turning: +${shards?.total || 0} Moon Shards (${shards ? `boss ${shards.finalBoss}, levels ${shards.levels}, wings ${shards.wings}, Trench ${shards.trench}, quests ${shards.quests}` : ''}).`, 'quest');
}

function resetProfile(game, prof, shards) {
  const m = moonOf(prof);
  m.shards += shards?.total || 0;
  m.turnings += 1;
  prof.level = 1; prof.xp = 0; prof.hp = null;
  prof.inv = []; prof.hotbar = new Array(8).fill(null); prof.gear = {};
  prof.x = null; prof.y = null; prof.realm = 'overworld';
  const met = prof.sys?.quests?.met || [];
  prof.sys ||= {};
  prof.sys.quests = { met };
  const kept = keptCards(prof.sys.cards?.owned || {}, m.keep, m.perks?.moon_keep || 0);
  for (const name of RESET_SYS) delete prof.sys[name];
  if (Object.keys(kept).length) prof.sys.cards = { owned: kept };
  m.pendingKit = true;
}

// Cards kept through a Turning (moon_keep): the player's chosen ids first (moon.keep action), then highest rank.
function keptCards(owned, chosen, n) {
  const out = {};
  if (!n || !owned) return out;
  const ids = Object.keys(owned).filter((id) => owned[id] > 0);
  const order = [...(chosen || []).filter((id) => ids.includes(id)), ...ids.sort((a, b) => owned[b] - owned[a] || (a < b ? -1 : 1))];
  for (const id of order) { if (Object.keys(out).length >= n) break; if (!(id in out)) out[id] = owned[id]; }
  return out;
}

function giveStartKit(game, p) {
  const m = moon(p);
  m.pendingKit = false;
  for (const perk of game.content.rebirth) {
    const rank = m.perks[perk.id] || 0;
    if (!rank) continue;
    for (const e of perk.effects || []) {
      if (e.id === 'start_item' && game.content.items.byId[e.item]) game.call('giveItem', p, e.item, e.qty || 1);
      if (e.id === 'start_tokens_per_levels') game.call('giveItem', p, 'tide_token', rank);
    }
    if ((perk.flags || []).includes('start_burrow')) {
      const item = game.content.items.find((it) => it.places === 'burrow_1')?.id ?? (game.content.items.byId.burrow_1 ? 'burrow_1' : null);
      if (item) game.call('giveItem', p, item, 1);
    }
  }
}

// ------------------------------------------------------------------ system

export default {
  name: 'rebirth',

  init(game) {
    ST.set(game, { data: { turnings: 0, history: [] }, votes: {}, countdownAt: null, json: '' });
    const c = game.content;
    game.stats.addSource('moon', (player) => {
      const out = [];
      for (const perk of c.rebirth) {
        const r = perkRank(player, perk.id);
        if (r) out.push(...scaledMods(perk.mods, r));
      }
      return out;
    });
    // world mods (Remembered Gears): the highest rank among connected players
    game.stats.addWorldSource('moon', (g) => {
      const out = [];
      for (const perk of c.rebirth) {
        if (!perk.worldMods?.length) continue;
        let r = 0;
        for (const p of g.players.values()) r = Math.max(r, perkRank(p, perk.id));
        if (r) out.push(...scaledMods(perk.worldMods, r));
      }
      return out;
    });
    game.stats.addFlagSource?.('moon', (player) => {
      const out = [];
      for (const perk of c.rebirth) if (perkRank(player, perk.id)) out.push(...(perk.flags || []));
      return out;
    });
    // Extra service (not in 5.5): Moon Chart rank of a perk for a player (WP6a keep_card / draft_offer_tens,
    // WP5 boss_trinkets, WP8 scuttler_tier, ...).
    game.services.register('moonRank', (player, perkId) => perkRank(player, perkId));
    // WP14 (BUILD_REVIEW P0-3): Moon Chart effects join the effects pipeline (numeric params scale with rank).
    ensureWp6(game);
    game.effects.addSource('moon', (player) => {
      const out = [];
      if (!player) return out;
      for (const perk of c.rebirth) {
        const r = perkRank(player, perk.id);
        if (!r) continue;
        for (const e of perk.effects || []) out.push({ ...e, n: (e.n ?? 1) * r, rank: r, src: 'moon:' + perk.id });
      }
      return out;
    });
    game.bus.on('finale.changed', () => publishWorld(game));
    game.bus.on('player.levelup', ({ player }) => { if (player?.token) st(game).moonDirty = true; });
  },

  load(game, data) {
    const s = st(game);
    const d = data && typeof data === 'object' ? structuredClone(data) : {};
    d.turnings ||= 0;
    d.history ||= [];
    s.data = d;
    s.json = '';
    publishWorld(game);
  },

  save(game) { return st(game).data; },

  onJoin(game, player) {
    const m = moon(player);
    if (m.pendingKit) giveStartKit(game, player);
    game.stats.invalidate(player);
    game.stats.invalidateWorld();
    sendMoon(game, player);
    publishWorld(game);
  },

  onLeave(game, player) {
    const s = st(game);
    if (s.countdownAt != null) { s.countdownAt = null; game.toast(null, `${player.name} left; the Turning is on hold.`, 'warn'); }
    s.leftDirty = true;
  },

  slowTick(game) {
    const s = st(game);
    if (s.leftDirty) { s.leftDirty = false; checkVotes(game); }
    if (s.countdownAt != null && game.now - s.countdownAt >= COUNTDOWN_S) performTurning(game);
    publishWorld(game);
    if (s.moonDirty || (s.tick = (s.tick || 0) + 1) % 10 === 0) {
      s.moonDirty = false;
      for (const p of game.players.values()) sendMoon(game, p);
    }
  },

  handlers: {
    'rebirth.vote': (game, player, d) => vote(game, player, !!d?.yes),
    'moon.buy': (game, player, d) => {
      const perk = game.content.rebirth.byId[d?.perk];
      if (!perk) return { ok: false, err: 'invalid' };
      const m = moon(player);
      const r = m.perks[perk.id] || 0;
      if (r >= perk.ranks) return { ok: false, err: 'full' };
      const cost = perk.cost[r] ?? perk.cost[perk.cost.length - 1];
      if (m.shards < cost) return { ok: false, err: 'cost' };
      m.shards -= cost;
      m.perks[perk.id] = r + 1;
      game.stats.invalidate(player);
      if (perk.worldMods?.length) game.stats.invalidateWorld();
      if (player.entity) game.fx(player.entity.realm, 'moon_shards', player.entity.x, player.entity.y, { small: 1 });
      game.toast(player, `Moon Chart: ${perk.name} rank ${r + 1}`, 'good');
      sendMoon(game, player);
      return { ok: true, d: { perk: perk.id, rank: r + 1, shards: m.shards } };
    },
    // WP14: choose the cards Keepsake (moon_keep) carries through the next Turning. d.ids: card ids, in priority order.
    'moon.keep': (game, player, d) => {
      const ids = Array.isArray(d?.ids) ? d.ids.filter((x) => typeof x === 'string' && x.length < 40).slice(0, 8) : null;
      if (!ids) return { ok: false, err: 'invalid' };
      moon(player).keep = ids;
      sendMoon(game, player);
      return { ok: true, d: { keep: ids } };
    },
  },
};

export { vote, publishWorld as publishRebirth };
