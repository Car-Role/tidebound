// WP4 building: build.place / build.remove, the placeStructure / removeStructure / canPlace services and the WP4
// place validators (bounds, terrain, ownership, overlap, unlock, cost) (DESIGN 7, CRITIQUE B2; TECH_SPEC 5.5).
// Each structure stores what was actually paid (`data.paid`, `data.glintPaid`); deconstruct refunds
// floor(paid * 0.75) per item, or exactly `paid` with F4 (`refund_full`), so no discount can ever create items.
// Structure-cost discounts are additive, capped at 25%, and never apply to world (W) structures.

import { REACH } from '../../../shared/config.js';
import { T, FLAG, BIOME_TIER, isWater } from '../../../shared/grid.js';
import { isInt } from '../../../shared/protocol.js';
import { structureCost, refund as refundOf } from '../../../shared/rules/costs.js';
import { STRUCT_DISCOUNT_CAP } from '../../../shared/rules/constants.js';
import { createEntity } from '../entities.js';
import { hasUnlockAll, missingUnlocks, unlockText, edgeDist, sendInv } from './inventory.js';
import { burstDrops } from './gathering.js';

export const BUILD_RANGE = REACH + 4;            // tiles from the player to the footprint edge
const GRIEF_GUARD_S = 600;                       // another player's fresh structure needs their consent (DESIGN 22)
const LAND_TILES = new Set([T.SAND, T.GREENMARROW, T.SALTFEN, T.EMBERREACH, T.GLASSWASTE, T.HOARFROST, T.UMBRAL, T.SOIL, T.PATH, T.ICE, T.INK]);

const realmOf = (game, r) => (typeof r === 'string' ? game.realms.get(r) : r);

// Footprint size for a rotation (odd rotations swap width and height).
export function footprint(def, rot = 0) {
  const w = def?.w ?? 1, h = def?.h ?? 1;
  return (rot & 1) ? { w: h, h: w } : { w, h };
}

// Discount fraction (positive) for a player: -structCost, capped at 25%.
export function discountOf(game, player) {
  if (!player) return 0;
  const s = game.stats.of(player);
  return Math.min(STRUCT_DISCOUNT_CAP, Math.max(0, -(s.structCost ?? 0)));
}

// Resolve dynamic group lines (Waystone: "4 rare of the plot's tier").
function resolveCostLines(game, def, realm, tx, ty) {
  const mats = game.content.modules.items?.TIER_MATS;
  return (def.cost ?? []).map((c) => {
    if (c.item) return c;
    if (c.group === 'rare_plot_tier') {
      const f = game.call('featureAt', realm, tx, ty);
      const tier = BIOME_TIER[f?.biome] ?? 1;
      return { item: mats?.[tier]?.rare ?? 'shell', qty: c.qty };
    }
    const g = game.content.modules.recipes?.GROUPS?.[c.group];
    return { item: g ? Object.keys(g)[0] : c.group, qty: c.qty };
  });
}

// Actual cost for this player at this spot: { items: [{item, qty}], glint }.
export function costFor(game, def, player, realm, tx, ty) {
  const lines = resolveCostLines(game, def, realm, tx, ty);
  const coop = def.world ? (game.call('coopScale') ?? 1) : 1;
  const tideHeight = game.world?.tideHeight ?? 0;
  // WP14 (BUILD_REVIEW P2-24): WP6b's structureDiscount (class passive never on world structures, cap 25%) when present.
  const discount = player && game.services.has('structureDiscount') ? Math.min(STRUCT_DISCOUNT_CAP, Number(game.call('structureDiscount', player, def.id)) || 0) : discountOf(game, player);
  const items = structureCost(lines, { world: !!def.world, coop, discount, tideHeight });
  const glint = def.glint ? Math.ceil(def.glint * (def.world ? coop : 1)) : 0;
  return { items, glint };
}

function tileOk(def, realm, x, y) {
  const g = realm.groundAt(x, y);
  const on = def.place?.on ?? ['land'];
  if (on.includes('water')) return g === T.DEEP || g === T.SHALLOW;
  if (on.includes('soil')) return g === T.SOIL;
  if (g === T.SOIL && def.cat !== 'farming') return false;   // never build over farmland except farm gear
  if (g === T.LAVA) return false;
  return LAND_TILES.has(g);
}

function nearWaterOrLand(realm, x, y, wantWater) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const g = realm.groundAt(x + dx, y + dy);
    if (wantWater ? isWater(g) && g !== T.TIDAL : LAND_TILES.has(g)) return true;
  }
  return false;
}

// WP4's own checks. Returns null (ok) or { ok:false, err, why }.
export function wp4Check(game, kind, realm, tx, ty, player, opts = {}) {
  const def = game.content.structures.byId[kind];
  if (!def) return { ok: false, err: 'invalid', why: 'Unknown structure' };
  if (!realm) return { ok: false, err: 'invalid', why: 'No realm' };
  const rot = opts.rot ?? 0;
  const { w, h } = footprint(def, rot);
  if (realm.kind !== 'overworld' && !def.natural && !opts.free) return { ok: false, err: 'denied', why: 'Cannot build here' };
  let anyShoreLand = false, anyAdjLand = false;
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      if (!realm.inBounds(x, y)) return { ok: false, err: 'invalid', why: 'Out of bounds' };
      if (!def.natural && realm.kind === 'overworld' && !realm.hasFlag(x, y, FLAG.OWNED)) return { ok: false, err: 'denied', why: 'Not your land' };
      if (!def.natural && !tileOk(def, realm, x, y)) return { ok: false, err: 'invalid', why: 'Bad ground' };
      if (realm.hasFlag(x, y, FLAG.SOLID)) return { ok: false, err: 'busy', why: 'Blocked' };
      const occ = realm.entityAtTile(x, y);
      if (occ && (occ.type === 'structure' || occ.type === 'node' || occ.type === 'crop' || occ.type === 'chest' || occ.type === 'npc')) {
        return { ok: false, err: 'busy', why: occ.type === 'node' ? 'Clear the node first' : 'Occupied' };
      }
      if (def.place?.on?.includes('shore') && nearWaterOrLand(realm, x, y, true)) anyShoreLand = true;
      if (def.place?.on?.includes('water') && nearWaterOrLand(realm, x, y, false)) anyAdjLand = true;
    }
  }
  if (def.place?.on?.includes('shore') && !anyShoreLand) return { ok: false, err: 'invalid', why: 'Must touch water' };
  if (def.place?.on?.includes('water') && !anyAdjLand) return { ok: false, err: 'invalid', why: 'Must be next to land' };
  if (def.place?.needs) {
    const f = game.call('featureAt', realm, tx, ty);
    if (f?.biome !== def.place.needs) return { ok: false, err: 'invalid', why: `Only in ${def.place.needs}` };
  }
  if (def.solid !== false) {
    // never trap a body inside a solid footprint
    const bodies = realm.query(tx + w / 2, ty + h / 2, Math.max(w, h) + 1, [], (o) => o.type === 'player' || o.type === 'mob' || o.type === 'boss');
    for (const b of bodies) {
      const r = b.radius ?? 0.3;
      if (b.x + r > tx && b.x - r < tx + w && b.y + r > ty && b.y - r < ty + h) return { ok: false, err: 'busy', why: 'Someone is standing there' };
    }
  }
  if (player && !opts.free) {
    if (def.natural) return { ok: false, err: 'denied', why: 'Natural structure' };
    const miss = opts.unlockFree ? [] : missingUnlocks(game, def.unlock, player);
    if (miss.length) return { ok: false, err: 'locked', why: unlockText(miss[0]) };
    if (!opts.noCost) {
      const cost = opts.cost ?? costFor(game, def, player, realm, tx, ty);
      for (const c of cost.items) if (game.inv.count(player.inv, c.item) < c.qty) return { ok: false, err: 'cost', why: 'Missing materials' };
      if (cost.glint > (game.world.glint ?? 0)) return { ok: false, err: 'cost', why: 'Not enough Glint' };
    }
  }
  return null;
}

function canPlaceFull(game, kind, realm, tx, ty, player, opts = {}) {
  realm = realmOf(game, realm);
  const r = wp4Check(game, kind, realm, tx, ty, player, opts);
  if (r) return r;
  for (const v of game.services.placeValidators) {
    try {
      const res = v(kind, realm, tx, ty, player, opts);
      if (res && res.ok === false) return res;
    } catch (err) {
      console.error('[tb:building] place validator threw:', err);
      return { ok: false, err: 'invalid' };
    }
  }
  return { ok: true };
}

// Refund list for a structure: floor(paid * 0.75) or exactly paid with F4; a placeable item comes back whole.
export function refundFor(game, structure, player) {
  const paid = Array.isArray(structure.data.paid) ? structure.data.paid : [];
  const full = !!player && game.stats.hasFlag(player, 'refund_full');
  const out = refundOf(paid.filter((p) => p && p.qty > 0), full);
  for (let i = 0; i < out.length; i++) {
    const def = game.content.items.byId[out[i].item];
    if (def?.places === structure.kind) out[i] = { ...out[i], qty: paid[i].qty };
  }
  const glint = Math.floor((structure.data.glintPaid ?? 0) * (full ? 1 : 0.75));
  return { items: out.filter((c) => c.qty > 0), glint };
}

export default {
  name: 'building',

  init(game) {
    const reg = (n, fn) => game.services.register(n, fn);

    reg('canPlace', (kind, realm, tx, ty, player, opts) => canPlaceFull(game, kind, realm, tx, ty, player, opts || {}));

    reg('placeStructure', (realm, kind, tx, ty, rot = 0, owner = null, opts = {}) => {
      realm = realmOf(game, realm);
      const def = game.content.structures.byId[kind];
      if (!def || !realm) return null;
      rot = (rot | 0) & 3;
      if (!opts.force) {
        const ok = canPlaceFull(game, kind, realm, tx, ty, owner, { rot, noCost: true, free: !!opts.free });
        if (!ok.ok) return null;
      }
      const { w, h } = footprint(def, rot);
      const paid = opts.paid ?? (opts.free ? [] : costFor(game, def, owner, realm, tx, ty).items);
      const e = createEntity(game, {
        type: 'structure', kind, x: tx + w / 2, y: ty + h / 2, hp: def.hp || 100, radius: Math.max(w, h) / 2,
        solid: def.solid ?? false,
        data: {
          tx, ty, w, h, owner: owner?.token ?? null, ownerName: owner?.name ?? null, paid: paid.map((c) => ({ item: c.item, qty: c.qty })),
          glintPaid: opts.glintPaid ?? 0, placedAt: Math.round(game.playtimeS ?? 0), ...(opts.data || {}),
        },
        pub: { rot, own: owner?.id ?? 0, on: 1 },
      });
      realm.add(e);
      if (e.solid) for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) realm.setFlag(x, y, FLAG.SOLID, true);
      if (!opts.quiet) game.fx(realm, 'build_place', e.x, e.y, { w, h, kind });
      game.bus.emit('structure.placed', { player: owner, structure: e });
      return e;
    });

    reg('removeStructure', (structure, opts = {}) => {
      if (!structure || structure.removed) return;
      const realm = game.realms.get(structure.realm);
      if (!realm) return;
      const { tx, ty, w = 1, h = 1 } = structure.data;
      // spill station slots and Stockpile contents (Brinelocker networks are shared and stay)
      const spill = [];
      for (const s of structure.data.st?.slots ?? []) if (s) spill.push({ item: s[0], qty: s[1] });
      if (structure.kind !== 'brine_locker') for (const s of structure.data.inv?.slots ?? []) if (s) spill.push({ item: s[0], qty: s[1] });
      if (structure.solid) for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) realm.setFlag(x, y, FLAG.SOLID, false);
      realm.remove(structure);
      const player = opts.refundTo ?? null;
      if (player) {
        const r = refundFor(game, structure, player);
        for (const c of r.items) game.call('giveItem', player, c.item, c.qty);
        if (r.glint > 0) game.call('addGlint', r.glint, 'refund', player);
      }
      if (spill.length) burstDrops(game, realm, structure.x, structure.y, spill, { maxPieces: 2 });
      game.fx(realm, 'build_remove', structure.x, structure.y, { w, h, to: player?.id ?? 0, kind: structure.kind });
      game.bus.emit('structure.removed', { player, structure });
    });
  },

  onJoin(game, player) { player._buildKey = null; this.publish(game, player); },

  // self.build: buildable structure ids + the numbers the client needs to show exact costs.
  publish(game, player) {
    const ids = [];
    for (const s of game.content.structures) if (!s.natural && hasUnlockAll(game, s.unlock, player)) ids.push(s.id);
    const msg = { ids, disc: +discountOf(game, player).toFixed(4), coop: game.call('coopScale') ?? 1, th: game.world?.tideHeight ?? 0, full: game.stats.hasFlag(player, 'refund_full') };
    const key = JSON.stringify(msg);
    if (key !== player._buildKey) { player._buildKey = key; game.sendSelf(player, 'build', msg); }
  },

  slowTick(game) { for (const p of game.players.values()) this.publish(game, p); },

  handlers: {
    'build.place': (game, player, d) => {
      const kind = typeof d.kind === 'string' ? d.kind : null;
      const def = kind ? game.content.structures.byId[kind] : null;
      if (!def || def.natural) return { ok: false, err: 'invalid' };
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5)) return { ok: false, err: 'invalid' };
      const rot = isInt(d.rot, 0, 3) ? d.rot : 0;
      const realm = game.realms.get(player.entity.realm);
      const { w, h } = footprint(def, rot);
      const fake = { data: { tx: d.tx, ty: d.ty, w, h }, x: d.tx + w / 2, y: d.ty + h / 2 };
      if (edgeDist(fake, player.entity.x, player.entity.y) > BUILD_RANGE) return { ok: false, err: 'range' };
      // placing from a placeable item (Autobench I from Sootwren, Grabber Arm, ...) costs exactly that item
      let cost;
      if (d.item) {
        const it = game.content.items.filter((i) => i.places === kind).find((i) => game.inv.count(player.inv, i.id) > 0);
        if (!it) return { ok: false, err: 'cost' };
        cost = { items: [{ item: it.id, qty: 1 }], glint: 0 };
      } else cost = costFor(game, def, player, realm, d.tx, d.ty);
      const chk = canPlaceFull(game, kind, realm, d.tx, d.ty, player, { rot, cost, unlockFree: !!d.item });
      if (!chk.ok) return { ok: false, err: chk.err, d: { why: chk.why } };   // a placeable item carries its own unlock
      if (!game.call('takeItems', player, cost.items)) return { ok: false, err: 'cost' };
      if (cost.glint > 0 && !game.call('spendGlint', cost.glint, 'build', player)) {
        for (const c of cost.items) game.call('giveItem', player, c.item, c.qty);
        return { ok: false, err: 'cost', d: { why: 'Not enough Glint' } };
      }
      const data = {};
      if (kind === 'brine_locker') data.colour = isInt(d.colour, 0, 7) ? d.colour : 0;
      const e = game.call('placeStructure', realm, kind, d.tx, d.ty, rot, player, { force: true, paid: cost.items, glintPaid: cost.glint, data });
      if (!e) {
        for (const c of cost.items) game.call('giveItem', player, c.item, c.qty);
        if (cost.glint > 0) game.call('addGlint', cost.glint, 'refund', player);
        return { ok: false, err: 'invalid' };
      }
      sendInv(game, player);
      return { ok: true, d: { id: e.id } };
    },

    'build.remove': (game, player, d) => {
      if (!Number.isInteger(d.id)) return { ok: false, err: 'invalid' };
      const realm = game.realms.get(player.entity.realm);
      const e = realm?.entities.get(d.id);
      if (!e || e.type !== 'structure') return { ok: false, err: 'invalid' };
      const def = game.content.structures.byId[e.kind];
      if (!def || def.world || def.natural) return { ok: false, err: 'denied', d: { why: 'World structures cannot be removed' } };
      if (edgeDist(e, player.entity.x, player.entity.y) > BUILD_RANGE) return { ok: false, err: 'range' };
      const mine = !e.data.owner || e.data.owner === player.token;
      const age = (game.playtimeS ?? 0) - (e.data.placedAt ?? -1e9);
      if (!mine && age < GRIEF_GUARD_S && !game.call('isHost', player)) {
        game.toast(player, `Placed by ${e.data.ownerName ?? 'another player'} less than 10 min ago`, 'warn');
        return { ok: false, err: 'denied', d: { why: 'Ask the builder first' } };
      }
      game.call('removeStructure', e, { refundTo: player });
      sendInv(game, player);
      return { ok: true };
    },
  },
};
