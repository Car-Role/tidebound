// WP6a: Tide Cards (DESIGN 9.1, A.9 card fusion). Draft queue, offers, pick / reroll / banish / skip / fuse,
// ranks, set bonuses at 3/5/7 distinct cards per tag, tide_token grants, bonus drafts, card stat/world/proc sources.
//
// Per-player state (saved under profiles[token].sys.cards):
//   { owned: {id: rank}, banished: [id], drafts: [{ id, offers, minRarity, tag, source, size, rerolls, glintRerolls, sawRare }],
//     pity, seed, n (rng draws), tokensGranted, banishUsed, nextDraftId, bonus: { 'boss:<id>': 1, 'vault:<k>': 1 }, apex }
// Offers are generated when a draft is queued (not when viewed), so reconnecting never re-rolls an offer.
// Reroll costs 1 `tide_token` item; without one (or with d.glint) it costs 50 * level * 2^(Glint rerolls in this draft).

import cardList, { TAG_SETS, SET_THRESHOLDS } from '../../../shared/data/cards.js';
import { generateOffer, draftPool, cardAtRank, setTiers, rarityAtLeast, mythicLimit, offerSize } from '../../../shared/rules/draft.js';
import { REROLL_GLINT_BASE, FREE_TOKEN_EVERY, BANISH_EVERY } from '../../../shared/rules/constants.js';
import { mix32, hashString } from '../../../shared/rng.js';
import { ensureWp6, nearStructure, asPlayer } from './progression.js';

const TOKEN = 'tide_token';
const byId = new Map(cardList.map((c) => [c.id, c]));
export const CARDS = cardList;

export function cardState(game, player) {
  if (!player.cardState) {
    player.cardState = {
      owned: {}, banished: [], drafts: [], pity: 0, seed: (mix32(hashString(player.token || 'p') ^ game.seed) >>> 0), n: 0,
      tokensGranted: 0, banishUsed: 0, nextDraftId: 1, bonus: {}, apex: 0, fused: 0,
    };
  }
  return player.cardState;
}

// Per-player deterministic stream (survives save/load because seed and n are saved).
function randOf(st) {
  return () => {
    st.n = (st.n + 1) >>> 0;
    return (mix32(st.seed ^ mix32(st.n * 0x9e3779b1)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- resolved card effects

export function ownedResolved(owned) {
  const out = [];
  for (const [id, rank] of Object.entries(owned || {})) {
    const c = byId.get(id);
    if (c && rank > 0) out.push({ card: c, rank, r: cardAtRank(c, Math.min(rank, c.max)) });
  }
  return out;
}

export function activeSets(owned) {
  const { counts, active } = setTiers(cardList, owned || {});
  const list = [];
  for (const [tag, tiers] of Object.entries(active)) for (const t of tiers) list.push({ tag, tier: t, def: TAG_SETS[tag]?.[t] });
  return { counts, list };
}

const procList = (p) => (!p ? [] : Array.isArray(p) ? p : [p]);

function tokensEntitled(game, player) {
  const L = player.level;
  let n = Math.floor(L / FREE_TOKEN_EVERY);
  for (const e of game.effects.list(player, 'token_per_levels')) n += Math.floor(L / (e.every || 5)) * (e.n || 1);
  return n;
}

function banishesTotal(game, player) {
  const L = player.level;
  let n = Math.floor(L / BANISH_EVERY);
  for (const e of game.effects.list(player, 'banish_per_levels')) n += Math.floor(L / (e.every || 10)) * (e.n || 1);
  return n;
}

const banishesLeft = (game, player) => Math.max(0, banishesTotal(game, player) - cardState(game, player).banishUsed);
const tokenCount = (game, player) => game.call('countItem', player, TOKEN) || 0;
export const rerollGlintCost = (player, draft) => REROLL_GLINT_BASE * Math.max(1, player.level) * Math.pow(2, draft.glintRerolls || 0);

// ---------------------------------------------------------------- draft generation

function offersFor(game, player, draft, { exclude = [], count = null } = {}) {
  const st = cardState(game, player);
  const s = game.stats.of(player);
  let size = draft.size ?? s.draftOffers;
  if (draft.minRarity && draft.source !== 'fusion') size += game.effects.sum(player, 'bonus_draft_offer', 'n');
  // WP14 (BUILD_REVIEW P0-3): Tenfold (moon_draft) adds offers on level drafts at levels divisible by 10.
  if (draft.source === 'level' && draft.level && draft.level % 10 === 0) size += game.effects.sum(player, 'draft_offer_tens', 'n');
  size = offerSize(size);
  if (count != null) size = count;
  const pending = st.drafts.filter((d) => d !== draft && !d.sawRare).length;
  const banished = [...st.banished, ...exclude];
  const res = generateOffer(cardList, {
    level: Math.max(2, player.level), owned: st.owned, banished, pity: st.pity + pending, size,
    luck: (s.luck || 0) + (s.luckWorld || 0), rarePlus: s.draftRarePlus || 0, minRarity: draft.minRarity, tag: draft.tag, rand: randOf(st),
  });
  return res.offer;
}

function markRare(draft) {
  if (draft.offers.some((id) => rarityAtLeast(byId.get(id)?.rarity ?? 'common', 'rare'))) draft.sawRare = true;
}

export function queueDraft(game, player, opts = {}) {
  if (!player) return null;
  const st = cardState(game, player);
  const draft = {
    id: st.nextDraftId++, offers: [], minRarity: opts.minRarity || null, tag: opts.tag || null,
    source: opts.source || (opts.minRarity ? 'bonus' : 'level'), size: opts.size ?? null, rerolls: 0, glintRerolls: 0, sawRare: false,
    level: opts.level ?? player.level ?? 1,
  };
  draft.offers = offersFor(game, player, draft);
  if (!draft.offers.length) {
    // Everything maxed (or nothing matches): the draft becomes a token.
    game.call('giveItem', player, TOKEN, 1);
    sendCards(game, player);
    return null;
  }
  markRare(draft);
  st.drafts.push(draft);
  if (draft.minRarity && player.entity) game.fx(player.entity.realm, 'card_reveal', player.entity.x, player.entity.y, { r: draft.minRarity });
  sendCards(game, player);
  return draft;
}

// After a pick, offers in other pending drafts may have become illegal (maxed card, Mythic limit): replace them.
function refreshStale(game, player) {
  const st = cardState(game, player);
  for (const d of st.drafts) {
    const legal = new Set(draftPool(cardList, { level: Math.max(2, player.level), owned: st.owned, banished: st.banished, tag: d.tag }).map((c) => c.id));
    for (let i = 0; i < d.offers.length; i++) {
      if (legal.has(d.offers[i])) continue;
      const [fresh] = offersFor(game, player, d, { exclude: d.offers, count: 1 });
      if (fresh) d.offers[i] = fresh; else { d.offers.splice(i, 1); i--; }
    }
    markRare(d);
  }
  st.drafts = st.drafts.filter((d) => d.offers.length > 0);
}

function resolveDraft(game, player, draft) {
  const st = cardState(game, player);
  st.drafts = st.drafts.filter((d) => d !== draft);
  if (draft.source === 'level') st.pity = draft.sawRare ? 0 : st.pity + 1;
  else if (draft.sawRare) st.pity = 0;
}

// ---------------------------------------------------------------- tokens

export function grantTokens(game, player, quiet = false) {
  const st = cardState(game, player);
  const due = tokensEntitled(game, player) - st.tokensGranted;
  if (due > 0) {
    st.tokensGranted += due;
    game.call('giveItem', player, TOKEN, due);
    if (!quiet) game.toast(player, `+${due} Tide Token${due > 1 ? 's' : ''}`, 'good');
  }
}

// ---------------------------------------------------------------- client state

export function sendCards(game, player) {
  const st = cardState(game, player);
  const { counts } = activeSets(st.owned);
  let mythics = 0;
  for (const id of Object.keys(st.owned)) if (byId.get(id)?.rarity === 'mythic') mythics++;
  game.sendSelf(player, 'cards', {
    owned: { ...st.owned },
    drafts: st.drafts.map((d) => ({
      id: d.id, offers: d.offers.slice(), minRarity: d.minRarity, tag: d.tag, source: d.source,
      rerollGlint: rerollGlintCost(player, d), rerolls: d.rerolls,
    })),
    tokens: tokenCount(game, player), banishes: banishesLeft(game, player), banished: st.banished.slice(),
    pity: st.pity, sets: counts, mythic: { owned: mythics, limit: mythicLimit(player.level) }, apex: +st.apex.toFixed(4),
  });
}

function changed(game, player) {
  game.stats.invalidate(player);
  game.stats.invalidateWorld();
  game.procs?.invalidate(player);
  sendCards(game, player);
}

// ---------------------------------------------------------------- handlers

const findDraft = (st, d) => st.drafts.find((x) => x.id === d?.draft) ?? null;
const validIndex = (draft, i) => Number.isInteger(i) && i >= 0 && i < draft.offers.length;

function pick(game, player, d) {
  const st = cardState(game, player);
  const draft = findDraft(st, d);
  if (!draft || !validIndex(draft, d.index)) return { ok: false, err: 'invalid' };
  const id = draft.offers[d.index];
  const card = byId.get(id);
  const rank = (st.owned[id] || 0) + 1;
  if (!card || rank > card.max) return { ok: false, err: 'full' };
  const setsBefore = activeSets(st.owned).list.map((x) => x.tag + x.tier);
  st.owned[id] = rank;
  resolveDraft(game, player, draft);
  if (rank === 1) for (const g of card.grants || []) game.call('giveItem', player, g.item, g.qty);
  refreshStale(game, player);
  const e = player.entity;
  if (e) game.fx(e.realm, 'card_pick', e.x, e.y, { r: card.rarity, id, rank });
  for (const s of activeSets(st.owned).list) {
    if (setsBefore.includes(s.tag + s.tier)) continue;
    if (e) game.fx(e.realm, 'set_proc', e.x, e.y, { tag: s.tag, tier: s.tier });
    game.toast(player, `${s.tag[0].toUpperCase() + s.tag.slice(1)} set (${s.tier}): ${s.def?.text ?? ''}`, 'good');
  }
  game.bus.emit('card.picked', { player, card: id, rank });
  grantTokens(game, player);
  changed(game, player);
  return { ok: true, d: { card: id, rank } };
}

function reroll(game, player, d) {
  const st = cardState(game, player);
  const draft = findDraft(st, d);
  if (!draft) return { ok: false, err: 'invalid' };
  const useGlint = d.glint === true || tokenCount(game, player) < 1;
  if (useGlint) {
    const cost = rerollGlintCost(player, draft);
    if (!game.call('spendGlint', cost, 'reroll', player)) return { ok: false, err: 'cost' };
    draft.glintRerolls++;
  } else if (!game.call('takeItems', player, [{ item: TOKEN, qty: 1 }])) return { ok: false, err: 'cost' };
  draft.rerolls++;
  game.call('counter', player, 'rerolls_used', 1);     // WP14 (P1-4)
  const offers = offersFor(game, player, draft);
  if (offers.length) draft.offers = offers;
  markRare(draft);
  const e = player.entity;
  if (e) game.fx(e.realm, 'card_reveal', e.x, e.y, { reroll: 1 });
  sendCards(game, player);
  return { ok: true, d: { offers: draft.offers.slice() } };
}

function banish(game, player, d) {
  const st = cardState(game, player);
  const draft = findDraft(st, d);
  if (!draft || !validIndex(draft, d.index)) return { ok: false, err: 'invalid' };
  if (banishesLeft(game, player) < 1) return { ok: false, err: 'cost' };
  const id = draft.offers[d.index];
  st.banished.push(id);
  st.banishUsed++;
  const [fresh] = offersFor(game, player, draft, { exclude: draft.offers, count: 1 });
  if (fresh) draft.offers[d.index] = fresh; else draft.offers.splice(d.index, 1);
  markRare(draft);
  if (!draft.offers.length) { resolveDraft(game, player, draft); game.call('giveItem', player, TOKEN, 1); }
  const e = player.entity;
  if (e) game.fx(e.realm, 'card_reveal', e.x, e.y, { banish: id });
  sendCards(game, player);
  return { ok: true, d: { banished: id, offers: draft.offers.slice() } };
}

function skip(game, player, d) {
  const st = cardState(game, player);
  const draft = findDraft(st, d);
  if (!draft) return { ok: false, err: 'invalid' };
  resolveDraft(game, player, draft);
  game.call('giveItem', player, TOKEN, 1);
  sendCards(game, player);
  return { ok: true, d: { token: 1 } };
}

// Two max-rank Commons of the same tag -> one draft of 3 Uncommon-or-better cards of that tag (at the Calling Shrine).
function fuse(game, player, d) {
  const st = cardState(game, player);
  const a = byId.get(d?.a), b = byId.get(d?.b);
  if (!a || !b || a.id === b.id) return { ok: false, err: 'invalid' };
  if (a.rarity !== 'common' || b.rarity !== 'common' || a.tag !== b.tag) return { ok: false, err: 'invalid' };
  if ((st.owned[a.id] || 0) < a.max || (st.owned[b.id] || 0) < b.max) return { ok: false, err: 'invalid' };
  if (!nearStructure(game, player, 'calling_shrine', 4)) return { ok: false, err: 'range' };
  const pool = draftPool(cardList, { level: Math.max(2, player.level), owned: { ...st.owned, [a.id]: 0, [b.id]: 0 }, banished: st.banished, tag: a.tag })
    .filter((c) => rarityAtLeast(c.rarity, 'uncommon'));
  if (!pool.length) return { ok: false, err: 'full' };
  delete st.owned[a.id];
  delete st.owned[b.id];
  st.fused++;
  changed(game, player);
  const e = player.entity;
  if (e) game.fx(e.realm, 'set_proc', e.x, e.y, { tag: a.tag, fuse: 1 });
  queueDraft(game, player, { minRarity: 'uncommon', tag: a.tag, size: 3, source: 'fusion' });
  return { ok: true };
}

// ---------------------------------------------------------------- stat, world, effect and proc sources

function cardMods(game, player) {
  const st = cardState(game, player);
  const out = [];
  for (const { card, r } of ownedResolved(st.owned)) {
    for (const m of r.mods) out.push(m);
    for (const f of r.flags || []) out.push({ flag: f });
  }
  for (const { def } of activeSets(st.owned).list) {
    for (const m of def?.mods || []) out.push(m);
    for (const f of def?.flags || []) out.push({ flag: f });
    for (const e of def?.effects || []) {
      if (e.id === 'regen_per_levels') out.push({ stat: 'hpRegen', op: 'add', v: Math.floor(player.level / (e.every || 10)) * (e.v || 1) });
    }
  }
  if (st.apex > 0) out.push({ stat: 'power', op: 'add', v: st.apex });
  return out;
}

// Every profile's card state: connected players live, offline players from their saved profile.
function allOwned(game) {
  const out = [];
  const online = new Set();
  for (const p of game.players.values()) { online.add(p.token); out.push(cardState(game, p).owned); }
  for (const [token, prof] of game.profiles) if (!online.has(token) && prof?.sys?.cards?.owned) out.push(prof.sys.cards.owned);
  return out;
}

function worldMods(game) {
  const out = [];
  const highest = new Map();   // card id -> [best rank, holders]
  const setsSeen = new Set();
  for (const owned of allOwned(game)) {
    for (const { card, rank, r } of ownedResolved(owned)) {
      if (!r.worldMods?.length) continue;
      if (card.worldRule?.mode === 'highest') {
        const h = highest.get(card.id) || [0, 0];
        highest.set(card.id, [Math.max(h[0], rank), h[1] + 1]);
        continue;
      }
      for (const m of r.worldMods) out.push(m);
    }
    for (const { tag, tier, def } of activeSets(owned).list) {
      if (!def?.worldMods || setsSeen.has(tag + tier)) continue;
      setsSeen.add(tag + tier);
      for (const m of def.worldMods) out.push(m);
    }
  }
  for (const [id, [rank, holders]] of highest) {
    const c = byId.get(id);
    const others = (c.worldRule.others || 0) * Math.max(0, holders - 1);
    for (const m of cardAtRank(c, rank).worldMods) out.push({ ...m, v: m.v + (m.stat === c.worldMods[0].stat ? others : 0) });
  }
  return out;
}

function cardEffects(game, player) {
  const st = cardState(game, player);
  const out = [];
  for (const { card, r } of ownedResolved(st.owned)) for (const e of r.effects || []) out.push({ ...e, src: 'card:' + card.id });
  for (const { tag, tier, def } of activeSets(st.owned).list) for (const e of def?.effects || []) out.push({ ...e, src: `set:${tag}:${tier}` });
  return out;
}

function cardProcs(game, player) {
  const st = cardState(game, player);
  const out = [];
  for (const { card, rank, r } of ownedResolved(st.owned)) procList(r.proc).forEach((p, i) => out.push({ ...p, src: 'card', key: `card:${card.id}:${i}`, rank }));
  for (const { tag, tier, def } of activeSets(st.owned).list) procList(def?.proc).forEach((p, i) => out.push({ ...p, src: 'set', key: `set:${tag}:${tier}:${i}` }));
  return out;
}

// ---------------------------------------------------------------- bus

function onBossKilled(game, { boss, kind, participants }) {
  const id = kind || boss?.kind;
  const def = game.content.bosses?.byId?.[id];
  if (!def || def.kind !== 'warden') return;
  for (const x of participants || []) {
    const p = asPlayer(game, x) || (x?.player ? x.player : null);
    if (!p) continue;
    const st = cardState(game, p);
    if (st.bonus['boss:' + id]) continue;
    st.bonus['boss:' + id] = 1;
    queueDraft(game, p, { minRarity: 'rare', source: 'warden' });
    game.toast(p, `First ${def.name} kill: a Rare draft!`, 'good');
  }
}

function onVaultCleared(game, { k, participants }) {
  for (const x of participants || []) {
    const p = asPlayer(game, x);
    if (!p) continue;
    const st = cardState(game, p);
    if (st.bonus['vault:' + k]) continue;
    st.bonus['vault:' + k] = 1;
    queueDraft(game, p, { minRarity: 'uncommon', source: 'vault' });
  }
}

export default {
  name: 'cards',

  init(game) {
    ensureWp6(game);
    game.services.register('queueDraft', (player, opts = {}) => { queueDraft(game, player, opts || {}); });
    game.stats.addSource('cards', (p) => cardMods(game, p));
    game.stats.addWorldSource('cards', () => worldMods(game));
    game.wp6.effects.add('cards', (p) => cardEffects(game, p));
    game.wp6.procSources.add('cards', (p) => cardProcs(game, p));
    game.bus.on('player.levelup', ({ player, level }) => {
      queueDraft(game, player, { source: 'level', level });
      grantTokens(game, player, true);
    });
    game.bus.on('boss.killed', (ev) => onBossKilled(game, ev));
    game.bus.on('vault.cleared', (ev) => onVaultCleared(game, ev));
    game.bus.on('item.pickup', ({ player, item }) => { if (item === TOKEN && player) sendCards(game, player); });
    game.bus.on('skill.bought', ({ player }) => { grantTokens(game, player); sendCards(game, player); });
  },

  handlers: {
    'card.pick': pick,
    'card.reroll': reroll,
    'card.banish': banish,
    'card.skip': skip,
    'card.fuse': fuse,
  },

  onJoin(game, player) {
    grantTokens(game, player);
    sendCards(game, player);
    game.stats.invalidateWorld();
  },

  onLeave(game) { game.stats.invalidateWorld(); },

  saveProfile(game, player) {
    const st = cardState(game, player);
    return {
      owned: { ...st.owned }, banished: st.banished.slice(), drafts: st.drafts.map((d) => ({ ...d, offers: d.offers.slice() })),
      pity: st.pity, seed: st.seed, n: st.n, tokensGranted: st.tokensGranted, banishUsed: st.banishUsed,
      nextDraftId: st.nextDraftId, bonus: { ...st.bonus }, apex: st.apex, fused: st.fused,
    };
  },

  loadProfile(game, player, data) {
    const st = cardState(game, player);
    if (!data || typeof data !== 'object') return;
    for (const [id, r] of Object.entries(data.owned || {})) {
      const c = byId.get(id);
      if (c && Number.isInteger(r) && r > 0) st.owned[id] = Math.min(r, c.max);
    }
    st.banished = (data.banished || []).filter((id) => byId.has(id));
    st.drafts = (data.drafts || []).filter((d) => d && Array.isArray(d.offers)).map((d) => ({
      id: d.id, offers: d.offers.filter((id) => byId.has(id)), minRarity: d.minRarity ?? null, tag: d.tag ?? null, source: d.source || 'level',
      size: d.size ?? null, rerolls: d.rerolls || 0, glintRerolls: d.glintRerolls || 0, sawRare: !!d.sawRare,
    })).filter((d) => d.offers.length);
    for (const k of ['pity', 'n', 'tokensGranted', 'banishUsed', 'apex', 'fused']) if (Number.isFinite(data[k])) st[k] = data[k];
    if (Number.isFinite(data.seed)) st.seed = data.seed >>> 0;
    st.nextDraftId = Math.max(Number(data.nextDraftId) || 1, ...st.drafts.map((d) => d.id + 1));
    st.bonus = data.bonus && typeof data.bonus === 'object' ? { ...data.bonus } : {};
  },
};
