// WP11: the Archive (DESIGN 17.1). 8 wings x 12 items. One donation of each listed item, world-wide.
// Each donation: fixed XP 50 * itemTier^2 to the donor, `donate_confetti`, bus `archive.donated`.
// A completed wing adds its reward mods to the world sheet (stat source 'archive') and 1 skill point
// (see `extraSkillPoints` service). The Archive survives Rebirth.
//
// world.archive = { donated:{ item: donorName }, wings:{ wingId: count }, complete:[wingIds], total, max }
// Action: archive.donate { item }  (item '*' donates every eligible item the player carries).
// Interaction: `use` on the `archive` structure opens the journal on the Archive tab.

import { st as questState } from './quests.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);
const DONATE_RANGE = 8;     // tiles from the Archive structure

export function archiveState(game) { return st(game)?.data ?? null; }
export function wingsComplete(game) { return st(game)?.data?.complete?.length ?? 0; }

function wingOf(game, item) {
  return st(game).itemWing.get(item) ?? null;
}

function nearArchive(game, player) {
  const realm = game.realms.get(player.entity?.realm);
  if (!realm) return false;
  let any = false;
  for (const e of realm.entities.values()) {
    if (e.type !== 'structure' || e.kind !== 'archive') continue;
    any = true;
    const hw = (e.data?.w ?? 4) / 2, hh = (e.data?.h ?? 3) / 2;
    const dx = Math.max(0, Math.abs(player.entity.x - e.x) - hw), dy = Math.max(0, Math.abs(player.entity.y - e.y) - hh);
    if (Math.hypot(dx, dy) <= DONATE_RANGE) return true;
  }
  // WP14 (BUILD_REVIEW P2-4): donations need the Archive itself (its plot must be raised); no remote donating.
  return false;
}

function publish(game) {
  const d = st(game).data;
  game.sendWorld('archive', { donated: d.donated, wings: d.wings, complete: d.complete, total: Object.keys(d.donated).length, max: st(game).max });
}

export function donate(game, player, item, { force = false } = {}) {
  const s = st(game);
  const d = s.data;
  if (typeof item !== 'string' || item.length > 40) return { ok: false, err: 'invalid' };
  const wing = wingOf(game, item);
  if (!wing) return { ok: false, err: 'invalid' };
  if (d.donated[item]) return { ok: false, err: 'invalid' };
  if (!force && !nearArchive(game, player)) return { ok: false, err: 'range' };
  if (!game.call('takeItems', player, [{ item, qty: 1 }])) return { ok: false, err: 'cost' };
  d.donated[item] = player.name;
  d.wings[wing.id] = (d.wings[wing.id] || 0) + 1;
  const tier = Math.max(1, game.content.items.byId[item]?.tier || 1);
  const xp = 50 * tier * tier;
  game.call('grantXp', player, xp, 'archive');
  const at = archiveEntity(game) ?? player.entity;
  if (at) game.fx(at.realm, 'donate_confetti', at.x, at.y, { item });
  game.bus.emit('archive.donated', { player, item, wing: wing.id });
  let completed = false;
  if (d.wings[wing.id] >= wing.items.length && !d.complete.includes(wing.id)) {
    d.complete.push(wing.id);
    completed = true;
    game.world.flags[`wing:${wing.id}`] = true;
    game.stats.invalidateWorld();
    for (const p of game.players.values()) game.stats.invalidate(p);
    game.toast(null, `Archive wing complete: ${wing.name} - ${wing.reward?.text ?? ''}, +1 skill point`, 'quest');
    // WP14 (BUILD_REVIEW P0-4): the announced world skill point is actually granted (every bound player, survives Rebirth).
    game.call('grantSkillPoint', null, 'wing:' + wing.id);
    game.bus.emit('skillpoint.granted', { player: null, n: wing.reward?.skillPoint ?? 1, source: `archive:${wing.id}` });
    for (const p of game.players.values()) if (p.entity) game.fx(p.entity.realm, 'quest_done', p.entity.x, p.entity.y, { wing: wing.id });
    game.sendWorld('unlocks', game.world.flags);
  } else {
    game.toast(player, `Donated ${game.content.items.byId[item]?.name ?? item} to ${wing.name} (${d.wings[wing.id]}/${wing.items.length}) +${xp} XP`, 'good');
  }
  publish(game);
  return { ok: true, d: { item, wing: wing.id, xp, completed } };
}

function archiveEntity(game) {
  for (const e of game.realms.get('overworld')?.entities.values() ?? []) if (e.type === 'structure' && e.kind === 'archive') return e;
  return null;
}

export default {
  name: 'archive',

  init(game) {
    const itemWing = new Map();
    let max = 0;
    for (const w of game.content.archive) { for (const it of w.items) itemWing.set(it, w); max += w.items.length; }
    const s = { data: { donated: {}, wings: {}, complete: [] }, itemWing, max };
    ST.set(game, s);
    const qs = questState(game);
    if (qs) qs.archiveTotal = () => Object.keys(st(game).data.donated).length;

    game.stats.addWorldSource('archive', () => {
      const mods = [];
      for (const id of st(game).data.complete) {
        const w = game.content.archive.byId[id];
        for (const m of w?.reward?.worldMods ?? w?.reward?.mods ?? []) mods.push(m);
      }
      return mods;
    });
    game.call('registerInteract', 'archive', (g, player) => {
      g.sendSelf(player, 'ui', { panel: 'journal', tab: 'archive', t: g.now });
      return { ok: true };
    });
  },

  load(game, data) {
    const s = st(game);
    const d = data && typeof data === 'object' ? structuredClone(data) : {};
    d.donated ||= {};
    d.wings ||= {};
    d.complete ||= [];
    // recount from the donation list so content changes cannot desync the tallies
    d.wings = {};
    for (const it of Object.keys(d.donated)) { const w = s.itemWing.get(it); if (w) d.wings[w.id] = (d.wings[w.id] || 0) + 1; }
    d.complete = game.content.archive.filter((w) => (d.wings[w.id] || 0) >= w.items.length).map((w) => w.id);
    s.data = d;
    game.stats.invalidateWorld();
    publish(game);
  },

  save(game) { return st(game).data; },

  handlers: {
    'archive.donate': (game, player, d) => {
      const item = d?.item;
      if (item === '*') {
        const s = st(game);
        if (!nearArchive(game, player)) return { ok: false, err: 'range' };
        const done = [];
        for (const it of s.itemWing.keys()) {
          if (s.data.donated[it]) continue;
          if ((game.call('countItem', player, it) || 0) < 1) continue;
          const r = donate(game, player, it);
          if (r.ok) done.push(it);
        }
        return done.length ? { ok: true, d: { items: done } } : { ok: false, err: 'cost' };
      }
      return donate(game, player, item);
    },
  },
};
