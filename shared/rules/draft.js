// Card draft generation (DESIGN 9.1). Pure and seeded: all randomness comes from `rand` ([0,1), e.g. rng.next).
import { RARITY_BANDS, LUCK_DRAFT, DRAFT_PITY, MYTHIC_PER_LEVELS, DRAFT_OFFER, DRAFT_OFFER_MAX } from './constants.js';

export const RARITY_ORDER = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
const RANK = Object.fromEntries(RARITY_ORDER.map((r, i) => [r, i]));
export const rarityAtLeast = (r, min) => RANK[r] >= RANK[min];

export function bandFor(level) {
  return (RARITY_BANDS.find((b) => level >= b.from && level <= b.to) || (level < 2 ? RARITY_BANDS[0] : RARITY_BANDS[RARITY_BANDS.length - 1])).w;
}

// Rarity weights (sum 100) for a level, shifted by luck (every 10 luck: 1 point Common -> Rare, 0.5 Uncommon -> Epic)
// and by draftRarePlus (fraction; 0.05 = 5 percentage points moved from Common to Rare).
export function rarityWeights(level, { luck = 0, rarePlus = 0 } = {}) {
  const w = { ...bandFor(level) };
  const steps = Math.max(0, luck) / LUCK_DRAFT.per;
  const toRare = Math.min(w.common, steps * LUCK_DRAFT.commonToRare + rarePlus * 100);
  w.common -= toRare; w.rare += toRare;
  const toEpic = Math.min(w.uncommon, steps * LUCK_DRAFT.uncommonToEpic);
  w.uncommon -= toEpic; w.epic += toEpic;
  return w;
}

export const mythicLimit = (level) => Math.floor(level / MYTHIC_PER_LEVELS);
export const offerSize = (draftOffers = DRAFT_OFFER) => Math.max(1, Math.min(DRAFT_OFFER_MAX, Math.round(draftOffers)));

// Cards still in the player's pool.
export function draftPool(cards, { level = 1, owned = {}, banished = [], tag = null } = {}) {
  const ban = new Set(banished);
  const mythicsOwned = cards.filter((c) => c.rarity === 'mythic' && (owned[c.id] || 0) > 0).length;
  const mythicOk = mythicsOwned < mythicLimit(level);
  return cards.filter((c) => !ban.has(c.id) && (owned[c.id] || 0) < c.max && (!tag || c.tag === tag) && (c.rarity !== 'mythic' || mythicOk));
}

function pickRarity(weights, available, rand) {
  const rs = RARITY_ORDER.filter((r) => available[r] > 0);
  if (!rs.length) return null;
  let total = 0;
  for (const r of rs) total += weights[r] || 0;
  if (total <= 0) return rs[Math.floor(rand() * rs.length)];
  let x = rand() * total;
  for (const r of rs) { x -= weights[r] || 0; if (x < 0) return r; }
  return rs[rs.length - 1];
}

// Generate one offer. Returns { offer: [card ids], pity: new pity counter, guaranteed: bool }.
// pity = consecutive drafts that showed no Rare or better; at DRAFT_PITY the next offer guarantees one.
// minRarity: bonus drafts ('rare' after a Warden first kill, 'uncommon' after a Vault first clear) and fusion.
export function generateOffer(cards, { level = 2, owned = {}, banished = [], pity = 0, size = DRAFT_OFFER, luck = 0, rarePlus = 0, minRarity = null, tag = null, rand }) {
  if (typeof rand !== 'function') throw new Error('generateOffer needs rand()');
  let pool = draftPool(cards, { level, owned, banished, tag });
  if (minRarity) pool = pool.filter((c) => rarityAtLeast(c.rarity, minRarity));
  const weights = rarityWeights(level, { luck, rarePlus });
  const n = Math.min(offerSize(size), pool.length);
  const offer = [];
  const guaranteed = pity >= DRAFT_PITY;
  for (let i = 0; i < n; i++) {
    let slotPool = pool;
    if (i === 0 && guaranteed) {
      const rp = pool.filter((c) => rarityAtLeast(c.rarity, 'rare'));
      if (rp.length) slotPool = rp;
    }
    const avail = {};
    for (const c of slotPool) avail[c.rarity] = (avail[c.rarity] || 0) + 1;
    const r = pickRarity(weights, avail, rand);
    const choices = slotPool.filter((c) => c.rarity === r);
    const card = choices[Math.floor(rand() * choices.length)];
    offer.push(card.id);
    pool = pool.filter((c) => c.id !== card.id);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const sawRare = offer.some((id) => rarityAtLeast(byId.get(id).rarity, 'rare'));
  return { offer, pity: sawRare ? 0 : pity + 1, guaranteed };
}

// Distinct cards owned per tag and the active set thresholds (3/5/7).
export function setTiers(cards, owned) {
  const counts = {};
  for (const c of cards) if ((owned[c.id] || 0) > 0) counts[c.tag] = (counts[c.tag] || 0) + 1;
  const active = {};
  for (const [tag, n] of Object.entries(counts)) active[tag] = [3, 5, 7].filter((t) => n >= t);
  return { counts, active };
}

// Resolve a card's mods at a rank (linear per rank unless perRank is given).
export function cardAtRank(card, rank) {
  if (rank <= 0) return { mods: [], worldMods: [], proc: null, effects: [], flags: [] };
  if (card.perRank) {
    const r = card.perRank[Math.min(rank, card.perRank.length) - 1];
    return { mods: r.mods || [], worldMods: r.worldMods || [], proc: r.proc || null, effects: r.effects || [], flags: card.flags || [] };
  }
  const scaleMods = (ms) => (ms || []).map((m) => ({ ...m, v: m.v * rank }));
  const scaleProc = (p) => {
    if (!p) return null;
    if (Array.isArray(p)) return p.map(scaleProc);
    const params = { ...p.p };
    for (const k of p.scale || []) {
      if (typeof params[k] === 'number') params[k] *= rank;
      else if (Array.isArray(params[k])) params[k] = scaleMods(params[k]);
    }
    return { ...p, p: params };
  };
  return { mods: scaleMods(card.mods), worldMods: scaleMods(card.worldMods), proc: scaleProc(card.proc), effects: card.effects || [], flags: card.flags || [] };
}
