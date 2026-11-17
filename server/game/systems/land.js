// Land (WP7): plots, raising (Glint + Ballast, adjacency, biome gates), the shared Treasury, Beacons and their
// attunement, plot charters, pacing telemetry for the first plot and each Beacon (DESIGN 4.2-4.4, 7.3, 15, A.9).
//
// Services (TECH_SPEC 5.5): addGlint, spendGlint, landCostNext, ballastFor, featureAt.
// Extras: attunement(k), landDiscount(), lineDone(npcId), highestTier().
// Actions: land.raise {px, py}, charter.set {px, py, charter}.  Interaction: tidestone (opens the map).
// World keys: landNext, beacons, charters, attune, mapReveal, telemetry (+ glint, plots, unlocks).

import { PLOT, WORLD_PLOTS, START_PLOT } from '../../../shared/config.js';
import { FLAG, BIOMES, BIOME_TIER, biomeOf, plotIndex, plotOfTile, inPlotBounds, neighbours4 } from '../../../shared/grid.js';
import { isInt, sanitizeText } from '../../../shared/protocol.js';
import { landCost, ballastFor as ballastCalc } from '../../../shared/rules/costs.js';
import { LAND_DISCOUNT_CAP, SPEND_ANNOUNCE_PER_TIER } from '../../../shared/rules/constants.js';
import { raisePlot } from '../worldgen/index.js';
import { featureAnchor, castawayOf, placeNatural } from '../worldgen/features.js';

const CHARTER_IDS = ['quarry', 'orchard', 'workshop', 'garrison'];
const FEATURE_NAMES = {
  start: 'Tidestone', archive: 'The Archive', vault: 'Vault entrance', arena: 'Warden altar', castaway: 'Castaway camp',
  shrine: 'Puzzle shrine', lagoon: 'Lagoon', vein: 'Rich vein', grove: 'Grove', dig: 'Dig site', gate_site: 'Tidegate site', wild: 'Wild land',
};

const GAMES = new WeakMap();
const L = (game) => GAMES.get(game);

// ---------------------------------------------------------------- helpers

const overworld = (game) => game.realms.get('overworld');
const plotOf = (game, px, py) => (inPlotBounds(px, py) ? game.world.plots[plotIndex(px, py)] : null);
const ownedCount = (game) => game.world.plots.reduce((n, p) => n + (p.owned ? 1 : 0), 0);

export function highestTier(game) {
  let t = 1;
  for (const p of game.world.plots) if (p.owned) t = Math.max(t, BIOME_TIER[p.biome] ?? 1);
  return t;
}

export function landDiscount(game) {
  let d = game.stats.world().landDiscountWorld ?? 0;
  for (const p of game.players.values()) d += game.stats.of(p).landDiscount ?? 0;
  return Math.min(LAND_DISCOUNT_CAP, Math.max(0, d));
}

const coop = (game) => Math.max(1, game.call('coopScale') || 1);

export function landCostNext(game) {
  const ordinal = ownedCount(game);           // the start plot is ordinal 0, so the next purchase is #owned
  const discount = landDiscount(game);
  const scale = coop(game);
  return { ordinal, glint: landCost(ordinal, { coop: scale, discount, tideHeight: game.world.tideHeight ?? 0 }), discount, coop: scale };
}

export function ballastFor(game, px, py) {
  const biome = inPlotBounds(px, py) ? biomeOf(px, py) : 'greenmarrow';
  const b = ballastCalc(biome, ownedCount(game), { coop: coop(game), tideHeight: game.world.tideHeight ?? 0 });
  return b ?? { item: 'ballast_1', qty: 0 };
}

export function lineDone(game, npcId) {
  if (game.world.flags['line:' + npcId]) return true;
  const npc = game.content.npcs.byId[npcId];
  const last = npc?.quests?.[npc.quests.length - 1];
  return !!last && !!game.call('hasUnlock', 'quest:' + last);
}

const shrineSolved = (game, p) => !!game.world.flags[`shrine:${p.px},${p.py}`];

// Attunement for Beacon k (DESIGN 4.3): every plot, castaway line and shrine of biome k.
export function attunement(game, k) {
  const biome = BIOMES[k - 1];
  const plots = game.world.plots.filter((p) => p.biome === biome);
  const npcs = game.content.npcs.filter((n) => n.biome === biome);
  const shrines = plots.filter((p) => p.feature === 'shrine');
  const r = {
    k, biome,
    plots: [plots.filter((p) => p.owned).length, plots.length],
    lines: [npcs.filter((n) => lineDone(game, n.id)).length, npcs.length],
    shrines: [shrines.filter((p) => shrineSolved(game, p)).length, shrines.length],
    lit: !!game.world.flags['beacon:' + k],
  };
  r.ok = r.plots[0] === r.plots[1] && r.lines[0] === r.lines[1] && r.shrines[0] === r.shrines[1];
  return r;
}

function biomeUnlocked(game, biome) {
  const k = BIOME_TIER[biome] ?? 1;
  return k <= 1 || !!game.world.flags['beacon:' + (k - 1)];
}

export function featureAt(game, realm, x, y) {
  const r = typeof realm === 'string' ? game.realms.get(realm) : realm;
  if (r && r.kind !== 'overworld') return null;
  const { px, py } = plotOfTile(Math.floor(x), Math.floor(y));
  if (!inPlotBounds(px, py)) return null;
  const p = game.world.plots[plotIndex(px, py)];
  return {
    px, py, biome: p.biome, tier: BIOME_TIER[p.biome] ?? 1, feature: p.feature ?? 'wild', owned: !!p.owned,
    charter: game.world.charters?.[px + ',' + py]?.id ?? null,
    npc: p.feature === 'castaway' ? castawayOf(game, px, py) : null,
    anchor: featureAnchor(game, p),
  };
}

// ---------------------------------------------------------------- Treasury

function addGlint(game, amount, source, player = null) {
  if (!Number.isFinite(amount) || amount === 0) return;
  let a = amount;
  if (a > 0 && player) a *= 1 + (game.stats.of(player).glintMult ?? 0);
  a = a > 0 ? Math.max(1, Math.round(a)) : Math.round(a);
  game.world.glint = Math.max(0, Math.round((game.world.glint || 0) + a));
  game.sendWorld('glint', game.world.glint);
  game.bus.emit('glint.changed', { delta: a, source, player });
  if (a >= 10 && player?.entity) game.fx(player.entity.realm, 'glint_burst', player.entity.x, player.entity.y, { n: a });
}

function capOf(game, player) {
  if (game.services.has('spendCap')) { const c = game.call('spendCap', player); if (Number.isFinite(c)) return c; }
  const c = game.world.spendCaps?.[player?.token];
  return Number.isFinite(c) && c >= 0 ? c : null;
}

export function spentToday(game, player) {
  const s = L(game).spent[player?.token];
  return s && s.day === game.world.day ? s.amt : 0;
}

function spendGlint(game, amount, source, player) {
  amount = Math.round(amount);
  if (!(amount > 0)) return amount === 0;
  if ((game.world.glint || 0) < amount) return false;
  const personal = source !== 'land';
  if (personal && player) {
    const cap = capOf(game, player);
    if (cap != null && spentToday(game, player) + amount > cap) return false;
  }
  game.world.glint -= amount;
  game.sendWorld('glint', game.world.glint);
  if (personal && player) {
    const st = L(game).spent;
    const cur = st[player.token]?.day === game.world.day ? st[player.token].amt : 0;
    st[player.token] = { day: game.world.day, amt: cur + amount };
    if (amount > SPEND_ANNOUNCE_PER_TIER * highestTier(game)) {
      game.broadcast({ t: 'chat', from: 'Treasury', text: sanitizeText(`${player.name} spent ${amount.toLocaleString('en-US')} on ${source}`, 160), color: 7 });
    }
  }
  game.bus.emit('glint.changed', { delta: -amount, source, player });
  return true;
}

// ---------------------------------------------------------------- Ballast stores

// Containers on the start plot that Ballast may be drawn from (DESIGN 4.3: "any Stockpile on the start plot").
function startStores(game) {
  const realm = overworld(game);
  const x0 = START_PLOT.px * PLOT, y0 = START_PLOT.py * PLOT;
  const out = [];
  for (const e of realm.query(x0 + PLOT / 2, y0 + PLOT / 2, PLOT * 0.75)) {
    if (e.type !== 'structure' || e.x < x0 || e.y < y0 || e.x >= x0 + PLOT || e.y >= y0 + PLOT) continue;
    const def = game.content.structures.byId[e.kind];
    if (!def?.container) continue;
    const inv = game.call('containerOf', e);
    if (inv?.slots) out.push(inv);
  }
  return out;
}

function ballastHave(game, player, item) {
  let n = game.call('countItem', player, item) || 0;
  for (const inv of startStores(game)) n += game.inv.count(inv, item);
  return n;
}

function takeBallast(game, player, item, qty) {
  const fromInv = Math.min(qty, game.call('countItem', player, item) || 0);
  if (fromInv > 0 && !game.call('takeItems', player, [{ item, qty: fromInv }])) return false;
  let left = qty - fromInv;
  for (const inv of startStores(game)) {
    if (left <= 0) break;
    left -= game.inv.remove(inv, item, left);
  }
  return left <= 0;
}

// ---------------------------------------------------------------- raising

function publishLand(game) {
  game.sendWorld('landNext', landCostNext(game));
  const att = {};
  for (let k = 1; k <= 6; k++) att[k] = attunement(game, k);
  game.sendWorld('attune', att);
  publishReveal(game);
}

function publishReveal(game) {
  let reveal = game.call('hasUnlock', 'skill:T3');
  for (const p of game.players.values()) if (game.stats.hasFlag(p, 'map_reveal')) reveal = true;
  const list = [];
  if (reveal) {
    for (const p of game.world.plots) {
      if (p.owned || p.known) continue;
      if (neighbours4(p.px, p.py).some((n) => plotOf(game, n.px, n.py)?.owned)) list.push([plotIndex(p.px, p.py), p.feature]);
    }
  }
  const key = JSON.stringify(list);
  if (key !== L(game).revealKey) { L(game).revealKey = key; game.sendWorld('mapReveal', list); }
}

function telemetry(game, gate) {
  const k = 'gate:' + gate;
  if (game.world.flags[k] != null) return;
  game.world.flags[k] = Math.round(game.playtimeS);
  const t = {};
  for (const [f, v] of Object.entries(game.world.flags)) if (f.startsWith('gate:')) t[f.slice(5)] = v;
  game.sendWorld('telemetry', t);
  game.sendWorld('unlocks', game.world.flags);
}

export function canRaise(game, player, px, py) {
  const plot = plotOf(game, px, py);
  if (!plot || plot.owned) return { ok: false, err: 'invalid', why: 'owned' };
  if (!neighbours4(px, py).some((n) => plotOf(game, n.px, n.py)?.owned)) return { ok: false, err: 'locked', why: 'adjacent' };
  if (!biomeUnlocked(game, plot.biome)) return { ok: false, err: 'locked', why: 'beacon', need: (BIOME_TIER[plot.biome] ?? 2) - 1 };
  const cost = landCostNext(game);
  const ballast = ballastFor(game, px, py);
  if ((game.world.glint || 0) < cost.glint) return { ok: false, err: 'cost', why: 'glint', cost, ballast };
  if (player && ballastHave(game, player, ballast.item) < ballast.qty) return { ok: false, err: 'cost', why: 'ballast', cost, ballast };
  return { ok: true, cost, ballast, plot };
}

function raise(game, player, d) {
  if (!d || !isInt(d.px, 0, WORLD_PLOTS - 1) || !isInt(d.py, 0, WORLD_PLOTS - 1)) return { ok: false, err: 'invalid' };
  if (player.entity?.realm !== 'overworld') return { ok: false, err: 'denied' };
  const chk = canRaise(game, player, d.px, d.py);
  if (!chk.ok) return { ok: false, err: chk.err, d: { why: chk.why, need: chk.need } };
  const { cost, ballast, plot } = chk;
  if (!takeBallast(game, player, ballast.item, ballast.qty)) return { ok: false, err: 'cost', d: { why: 'ballast' } };
  if (!spendGlint(game, cost.glint, 'land', player)) return { ok: false, err: 'cost', d: { why: 'glint' } };
  raisePlot(game, d.px, d.py, { ordinal: cost.ordinal });
  const realm = overworld(game);
  const cx = d.px * PLOT + PLOT / 2, cy = d.py * PLOT + PLOT / 2;
  game.fx(realm, 'plot_rise', cx, cy, { px: d.px, py: d.py, dur: 2.5 });
  for (const [ex, ey] of [[cx, d.py * PLOT], [cx, d.py * PLOT + PLOT], [d.px * PLOT, cy], [d.px * PLOT + PLOT, cy]]) game.fx(realm, 'plot_rise', ex, ey, { px: d.px, py: d.py, edge: 1 });
  const bname = game.content.biomes.byId[plot.biome]?.name ?? plot.biome;
  game.toast(null, `${player.name} raised a ${bname} plot: ${FEATURE_NAMES[plot.feature] ?? plot.feature}!`, 'good');
  game.bus.emit('land.raised', { player, px: d.px, py: d.py, biome: plot.biome, ordinal: cost.ordinal, feature: plot.feature });
  if (cost.ordinal === 1) telemetry(game, 'first_plot');
  publishLand(game);
  return { ok: true, d: { px: d.px, py: d.py, ordinal: cost.ordinal, glint: cost.glint, ballast } };
}

// ---------------------------------------------------------------- Beacons

function beaconList(game) {
  const out = [];
  const realm = overworld(game);
  for (const e of realm?.entities.values() ?? []) {
    if (e.type !== 'structure') continue;
    const b = game.content.structures.byId[e.kind]?.beacon;
    if (b) out.push({ k: b.k, x: e.x, y: e.y, id: e.id });
  }
  for (let k = 1; k <= 6; k++) if (game.world.flags['beacon:' + k] && !out.some((b) => b.k === k)) out.push({ k, x: null, y: null });
  return out.sort((a, b) => a.k - b.k);
}

function litCount(game) {
  let n = 0;
  for (let k = 1; k <= 6; k++) if (game.world.flags['beacon:' + k]) n++;
  return n;
}

function ensureTrench(game) {
  if (!game.world.flags['beacon:3']) return;
  const realm = overworld(game);
  for (const e of realm.entities.values()) if (e.kind === 'trench_entrance') return;
  const x0 = START_PLOT.px * PLOT, y0 = START_PLOT.py * PLOT;
  placeNatural(game, realm, 'trench_entrance', x0 + 12, y0 + 12, { solid: false });
}

function lightBeacon(game, structure, player) {
  const b = game.content.structures.byId[structure.kind]?.beacon;
  if (!b || game.world.flags['beacon:' + b.k]) return;
  game.world.flags['beacon:' + b.k] = true;
  structure.set('on', 1);
  structure.set('lv', b.k);
  game.stats.invalidateWorld();
  const realm = game.realms.get(structure.realm);
  game.fx(realm, 'beacon_light', structure.x, structure.y, { k: b.k });
  const next = game.content.biomes.find((x) => x.tier === b.k + 1);
  game.toast(null, `Beacon ${b.k} is lit!${next ? ` ${next.name} can now be raised.` : ''}`, 'good');
  game.bus.emit('beacon.lit', { k: b.k, player: player ?? null, structure });
  telemetry(game, 'beacon_' + b.k);
  if (b.k === 3) ensureTrench(game);
  game.sendWorld('beacons', beaconList(game));
  game.sendWorld('unlocks', game.world.flags);
  publishLand(game);
}

// ---------------------------------------------------------------- placement rules (WP7 validators)

function tileOwned(realm, x, y) { return realm.hasFlag(x, y, FLAG.OWNED); }

function placeValidator(game, kind, realm, tx, ty, player) {
  const def = game.content.structures.byId[kind];
  if (!def) return null;
  if (def.natural) return player ? { ok: false, err: 'locked' } : null;
  if (realm.kind !== 'overworld') return { ok: false, err: 'denied' };
  const water = def.place?.on?.includes('water') || def.place?.on?.includes('shore');
  for (let y = ty; y < ty + (def.h ?? 1); y++) {
    for (let x = tx; x < tx + (def.w ?? 1); x++) {
      if (tileOwned(realm, x, y)) continue;
      if (water && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => tileOwned(realm, x + dx, y + dy))) continue;
      return { ok: false, err: 'invalid' };
    }
  }
  if (def.beacon) {
    const k = def.beacon.k;
    if (game.world.flags['beacon:' + k]) return { ok: false, err: 'locked' };
    const { px, py } = plotOfTile(tx, ty);
    if (!inPlotBounds(px, py) || biomeOf(px, py) !== def.beacon.biome) return { ok: false, err: 'invalid' };
    if (!attunement(game, k).ok) return { ok: false, err: 'locked' };
  }
  return null;
}

// ---------------------------------------------------------------- charters (DESIGN A.9)

function setCharter(game, player, d) {
  if (!d || !isInt(d.px, 0, WORLD_PLOTS - 1) || !isInt(d.py, 0, WORLD_PLOTS - 1)) return { ok: false, err: 'invalid' };
  const charter = d.charter == null || d.charter === '' ? null : String(d.charter);
  if (charter && !CHARTER_IDS.includes(charter)) return { ok: false, err: 'invalid' };
  const plot = plotOf(game, d.px, d.py);
  if (!plot?.owned || plot.feature !== 'wild') return { ok: false, err: 'invalid' };
  const key = d.px + ',' + d.py;
  const cur = game.world.charters[key];
  if ((cur?.id ?? null) === charter) return { ok: true };
  if (cur && cur.day === game.world.day) return { ok: false, err: 'cooldown' };
  if (charter) game.world.charters[key] = { id: charter, day: game.world.day };
  else delete game.world.charters[key];
  game.sendWorld('charters', game.world.charters);
  game.bus.emit('charter.changed', { px: d.px, py: d.py, charter, player });
  return { ok: true };
}

// ---------------------------------------------------------------- system

export default {
  name: 'land',

  init(game) {
    GAMES.set(game, { spent: {}, revealKey: null, seq: 0 });
    // WP14 (BUILD_REVIEW P2-13): save.js now sets nextEntityId before it restores nodes. Worlds saved before that
    // carry a 'sys:nextId' flag; honour it once and drop it.
    const hw = Number(game.world.flags?.['sys:nextId']);
    if (Number.isFinite(hw) && hw > game.nextEntityId) game.nextEntityId = hw;
    if (game.world.flags) delete game.world.flags['sys:nextId'];
    game.world.charters ||= {};
    // saved plots carry no biome (save.js writes px, py, owned, ordinal, feature, known): restore it from the rule
    for (const p of game.world.plots) if (!p.biome) p.biome = biomeOf(p.px, p.py);
    const svc = game.services;
    svc.register('addGlint', (amount, source, player) => addGlint(game, amount, source, player));
    svc.register('spendGlint', (amount, source, player) => spendGlint(game, amount, source, player));
    svc.register('landCostNext', () => landCostNext(game));
    svc.register('ballastFor', (px, py) => ballastFor(game, px, py));
    svc.register('featureAt', (realm, x, y) => featureAt(game, realm, x, y));
    svc.register('attunement', (k) => attunement(game, k));
    svc.register('landDiscount', () => landDiscount(game));
    svc.register('lineDone', (npc) => lineDone(game, npc));
    svc.register('highestTier', () => highestTier(game));
    game.call('registerPlaceValidator', (kind, realm, tx, ty, player) => placeValidator(game, kind, realm, tx, ty, player));
    game.call('registerInteract', 'tidestone', (g, player) => {
      g.sendSelf(player, 'mapOpen', { n: ++L(g).seq, tab: 'map' });
      return { ok: true };
    });
    game.stats.addWorldSource('beacons', () => {
      const n = litCount(game);
      return n ? [{ stat: 'xpWorld', op: 'add', v: 0.05 * n }] : [];
    });
    game.bus.on('structure.placed', ({ structure, player }) => {
      if (game.content.structures.byId[structure?.kind]?.beacon) lightBeacon(game, structure, player);
    });
    game.bus.on('questline.completed', ({ npc }) => {
      if (!npc) return;
      const id = typeof npc === 'string' ? npc : npc.id;
      if (!id || game.world.flags['line:' + id]) return;
      game.world.flags['line:' + id] = true;
      game.sendWorld('unlocks', game.world.flags);
      publishLand(game);
    });
    game.bus.on('shrine.solved', () => publishLand(game));
    game.bus.on('coop.changed', () => publishLand(game));
    game.bus.on('skill.bought', () => publishReveal(game));
  },

  load(game, data) {
    const st = L(game);
    st.spent = data?.spent && typeof data.spent === 'object' ? data.spent : {};
    game.world.charters = data?.charters && typeof data.charters === 'object' ? data.charters : (game.world.charters || {});
    ensureTrench(game);
    game.sendWorld('beacons', beaconList(game));
    game.sendWorld('charters', game.world.charters);
    const t = {};
    for (const [f, v] of Object.entries(game.world.flags)) if (f.startsWith('gate:')) t[f.slice(5)] = v;
    game.sendWorld('telemetry', t);
    publishLand(game);
  },

  save(game) {
    const st = L(game);
    return { spent: st.spent, charters: game.world.charters };
  },

  handlers: {
    'land.raise': (game, player, d) => raise(game, player, d),
    'charter.set': (game, player, d) => setCharter(game, player, d),
  },

  onJoin(game) { publishLand(game); },

  slowTick(game) {
    const st = L(game);
    st.tick = (st.tick || 0) + 1;
    if (st.tick % 10 === 0) publishReveal(game);
    if (st.tick % 30 === 0) game.sendWorld('landNext', landCostNext(game));
  },
};

export { FEATURE_NAMES };
