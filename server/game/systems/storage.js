// WP4 storage: Stockpiles (24 shared slots, +8 with F3) and Brinelockers (every locker of one colour tag shares a
// single 60-slot inventory; 8 colours) (DESIGN 7.1). containerOf + IO providers for both kinds; storage views.
// Brinelocker colour is chosen with build.place { colour } and changed with inv.sort { src: lockerId, colour }.

import { isInt } from '../../../shared/protocol.js';
import { containerAdapters, inReach, sortSlots, worldSkill } from './inventory.js';

const VIEW_RANGE = 7;
const COLOURS = 8;
const STOCKPILE_BASE = 24;

const isStorage = (kind) => kind === 'stockpile' || kind === 'brine_locker';

function lockers(game) {
  if (!game._lockers) game._lockers = Array.from({ length: COLOURS }, () => ({ slots: new Array(60).fill(null), ver: 1 }));
  return game._lockers;
}

function stockpileSize(game) {
  let extra = 0;
  // F3 Packrat: Stockpiles +8 slots (world skill)
  for (const sk of game.content.skills ?? []) {
    for (const ef of sk.effects ?? []) if (ef.id === 'stockpile_slots' && worldSkill(game, sk.id)) extra = Math.max(extra, ef.n ?? 8);
  }
  return STOCKPILE_BASE + extra;
}

export function containerOfStructure(game, e) {
  if (!e || e.removed) return null;
  if (e.kind === 'stockpile') {
    const n = game.content.structures.byId.stockpile?.container?.slots ?? STOCKPILE_BASE;
    if (!e.data.inv || !Array.isArray(e.data.inv.slots)) e.data.inv = { slots: new Array(n).fill(null), ver: 1 };
    return e.data.inv;
  }
  if (e.kind === 'brine_locker') {
    const c = isInt(e.data.colour, 0, COLOURS - 1) ? e.data.colour : 0;
    return lockers(game)[c];
  }
  return e.data?.inv && Array.isArray(e.data.inv.slots) ? e.data.inv : null;
}

const bump = (inv) => { inv.ver = (inv.ver || 0) + 1; };

function viewOf(game, e, inv) {
  return { id: e.id, kind: e.kind, colour: e.kind === 'brine_locker' ? (e.data.colour ?? 0) : null, slots: inv.slots, ver: inv.ver };
}

export default {
  name: 'storage',

  init(game) {
    lockers(game);
    game.services.register('containerOf', (structure) => containerOfStructure(game, structure));
    const io = {
      insert(e, itemId, qty) {
        const inv = containerOfStructure(game, e);
        if (!inv || !(qty > 0)) return 0;
        const n = qty - game.inv.add(inv, itemId, qty);
        if (n > 0) bump(inv);
        return n;
      },
      extract(e, filter, max) {
        const inv = containerOfStructure(game, e);
        if (!inv) return null;
        for (const s of inv.slots) {
          if (s && (!filter || filter(s[0]))) {
            const item = s[0];
            const qty = game.inv.remove(inv, item, Math.min(max, s[1]));
            if (qty > 0) { bump(inv); return { item, qty }; }
          }
        }
        return null;
      },
    };
    const open = (g, player, e) => {
      const inv = containerOfStructure(g, e);
      if (!inv) return { ok: false, err: 'invalid' };
      player._view = e.id;
      player._viewVer = inv.ver;
      g.sendSelf(player, 'ui', { kind: 'storage', id: e.id, station: e.kind, n: (player._uiN = (player._uiN || 0) + 1) });
      g.sendSelf(player, 'container', viewOf(g, e, inv));
      g.fx(e.realm, 'chest_open', e.x, e.y, { small: 1 });
      return { ok: true };
    };
    for (const kind of ['stockpile', 'brine_locker']) {
      game.call('registerIO', kind, io);
      game.call('registerInteract', kind, open);
      containerAdapters.set(kind, (g, e) => {
        const inv = containerOfStructure(g, e);
        if (!inv) return null;
        return {
          inv,
          accept: () => true,
          changed: () => bump(inv),
          sort: (d) => {
            if (e.kind === 'brine_locker' && isInt(d?.colour, 0, COLOURS - 1)) {
              e.data.colour = d.colour;
              e.set('lv', d.colour);
              const nv = containerOfStructure(g, e);
              bump(nv);
              return;
            }
            sortSlots(g, inv.slots);
          },
        };
      });
    }
    game.bus.on('structure.placed', ({ structure }) => {
      if (structure.kind === 'stockpile') { containerOfStructure(game, structure); game.inv.resize(structure.data.inv, stockpileSize(game)); }
      if (structure.kind === 'brine_locker') structure.set('lv', structure.data.colour ?? 0);
    });
  },

  slowTick(game) {
    const n = stockpileSize(game);
    if (n === game._stockpileSize) return;
    game._stockpileSize = n;
    for (const realm of game.realms.values()) {
      for (const e of realm.entities.values()) {
        if (e.kind !== 'stockpile' || e.type !== 'structure') continue;
        const inv = containerOfStructure(game, e);
        if (inv.slots.length < n) { game.inv.resize(inv, n); bump(inv); }
      }
    }
  },

  tick(game) {
    for (const p of game.players.values()) {
      if (!p._view) continue;
      const e = game.realms.get(p.entity?.realm)?.entities.get(p._view);
      if (!e || !isStorage(e.kind)) continue;
      if (e.removed || !inReach(p, e, VIEW_RANGE)) {
        game.sendSelf(p, 'ui', { kind: 'close', id: p._view, n: (p._uiN = (p._uiN || 0) + 1) });
        p._view = null;
        continue;
      }
      const inv = containerOfStructure(game, e);
      if (inv && inv.ver !== p._viewVer) { p._viewVer = inv.ver; game.sendSelf(p, 'container', viewOf(game, e, inv)); }
    }
  },

  save(game) {
    return { lockers: lockers(game).map((l) => l.slots.map((s) => (s ? [s[0], s[1]] : null))) };
  },

  load(game, data) {
    const L = lockers(game);
    if (!Array.isArray(data?.lockers)) return;
    data.lockers.slice(0, COLOURS).forEach((slots, c) => {
      if (!Array.isArray(slots)) return;
      L[c].slots = new Array(60).fill(null);
      slots.slice(0, 60).forEach((s, i) => { if (Array.isArray(s) && game.content.items.byId[s[0]] && s[1] > 0) L[c].slots[i] = [s[0], Math.floor(s[1])]; });
      bump(L[c]);
    });
  },
};

