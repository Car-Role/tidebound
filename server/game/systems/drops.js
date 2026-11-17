// WP4 drops: ground items. Service dropItem; pop velocity on spawn ("drops burst outward in arcs"), magnet toward
// the nearest player with room after 0.25 s, pickup, per-player pickup locks (just-dropped items), merging of nearby
// identical stacks, 5 minute despawn (DESIGN 19, TECH_SPEC 5.5).

import { createEntity } from '../entities.js';
import { flushGains, noteGain, sendInv } from './inventory.js';

const MAGNET_DELAY = 0.25;
const DESPAWN_S = 300;
const MAGNET_ACCEL = 40;       // tiles/s^2
const MAGNET_MAX = 14;         // tiles/s
const PICKUP_DIST = 0.5;
const POP_DRAG = 6;            // 1/s
const MERGE_DIST = 0.7;

const realmOf = (game, r) => (typeof r === 'string' ? game.realms.get(r) : r);

export default {
  name: 'drops',

  init(game) {
    game.services.register('dropItem', (realm, x, y, itemId, qty, opts = {}) => {
      realm = realmOf(game, realm);
      qty = Math.floor(qty);
      if (!realm || !(qty > 0) || !game.content.items.byId[itemId]) return null;
      const locks = {};
      for (const id of opts.lockFor ?? []) locks[id] = game.now + (opts.lockS ?? 1.5);
      const cx = Math.max(0.3, Math.min(realm.w - 0.3, x)), cy = Math.max(0.3, Math.min(realm.h - 0.3, y));
      const e = createEntity(game, {
        type: 'drop', kind: 'drop', x: cx, y: cy, radius: 0.25,
        data: { owner: opts.owner ?? 0, t: game.now, vx: opts.vx ?? 0, vy: opts.vy ?? 0, locks },
        pub: { it: itemId, q: qty },
      });
      realm.add(e);
      if (e.data.vx || e.data.vy) (game._movingDrops ||= new Set()).add(e);
      if (!opts.quiet) game.fx(realm, 'drop_pop', cx, cy, { item: itemId });
      return e;
    });
  },

  tick(game, dt) {
    const moving = (game._movingDrops ||= new Set());
    // 1) magnet + pickup per player (nearest player with room wins a drop)
    const claimed = new Map();      // drop id -> { player, d }
    for (const player of game.players.values()) {
      const pe = player.entity;
      if (!pe || pe.state === 5 || pe.state === 4) continue;   // dead / downed
      const realm = game.realms.get(pe.realm);
      if (!realm) continue;
      const radius = game.stats.of(player).pickupRadius;
      for (const drop of realm.query(pe.x, pe.y, radius, [], (o) => o.type === 'drop')) {
        if (game.now - drop.data.t < MAGNET_DELAY) continue;
        const lock = drop.data.locks?.[player.id];
        if (lock && lock > game.now) continue;
        if (game.inv.spaceFor(player.inv, drop.pub.it) <= 0) continue;
        const d = Math.hypot(pe.x - drop.x, pe.y - drop.y);
        const c = claimed.get(drop.id);
        if (!c || d < c.d) claimed.set(drop.id, { player, d, drop, realm });
      }
    }
    for (const { player, d, drop, realm } of claimed.values()) {
      const pe = player.entity;
      if (d < PICKUP_DIST) {
        const item = drop.pub.it, qty = drop.pub.q;
        const left = game.inv.add(player.inv, item, qty);
        if (left === qty) continue;
        sendInv(game, player);
        noteGain(player, item, qty - left);
        if (left > 0) drop.set('q', left); else realm.remove(drop);
        game.fx(realm, 'pickup_flash', pe.x, pe.y, { item });
        game.bus.emit('item.pickup', { player, item, qty: qty - left });
        continue;
      }
      // accelerate toward the player
      const dx = pe.x - drop.x, dy = pe.y - drop.y;
      const sp0 = Math.hypot(drop.data.vx || 0, drop.data.vy || 0);
      const sp = Math.min(MAGNET_MAX, Math.max(sp0, 2) + MAGNET_ACCEL * dt);
      drop.data.vx = (dx / d) * sp; drop.data.vy = (dy / d) * sp;
      drop.data.mag = true;
      moving.add(drop);
      if (!drop.data.trail) { drop.data.trail = true; game.fx(realm, 'pickup_trail', drop.x, drop.y, { item: drop.pub.it, follow: drop.id }); }
      const step = Math.min(d, sp * dt);
      realm.move(drop, drop.x + (dx / d) * step, drop.y + (dy / d) * step);
    }

    // 2) free drops: pop velocity with drag (only drops that still move)
    for (const e of moving) {
      const realm = game.realms.get(e.realm);
      if (e.removed || !realm) { moving.delete(e); continue; }
      const dd = e.data;
      if (dd.mag) { if (!claimed.has(e.id)) { dd.mag = false; dd.vx = 0; dd.vy = 0; moving.delete(e); } continue; }
      const k = Math.exp(-POP_DRAG * dt);
      dd.vx *= k; dd.vy *= k;
      if (Math.abs(dd.vx) < 0.05 && Math.abs(dd.vy) < 0.05) { dd.vx = 0; dd.vy = 0; moving.delete(e); continue; }
      let nx = e.x + dd.vx * dt, ny = e.y + dd.vy * dt;
      nx = Math.max(0.3, Math.min(realm.w - 0.3, nx)); ny = Math.max(0.3, Math.min(realm.h - 0.3, ny));
      // bounce off solid tiles instead of sliding into structures or water
      if (!realm.isWalkable(Math.floor(nx), Math.floor(ny)) && realm.isWalkable(Math.floor(e.x), Math.floor(e.y))) { dd.vx = -dd.vx * 0.3; dd.vy = -dd.vy * 0.3; continue; }
      realm.move(e, nx, ny);
    }
    flushGains(game);
  },

  slowTick(game) {
    for (const realm of game.realms.values()) {
      const drops = [];
      for (const e of realm.entities.values()) {
        if (e.type !== 'drop') continue;
        if (game.now - e.data.t > DESPAWN_S) { realm.remove(e); continue; }
        drops.push(e);
      }
      // merge identical resting stacks that sit close together (fewer entities, bigger counts)
      if (drops.length < 2) continue;
      for (const a of drops) {
        if (a.removed || a.data.mag || a.data.vx || a.data.vy) continue;
        const near = realm.query(a.x, a.y, MERGE_DIST, [], (o) => o.type === 'drop' && o !== a && !o.removed && o.pub.it === a.pub.it && !o.data.mag);
        for (const b of near) {
          const max = game.content.items.byId[a.pub.it]?.stack ?? 999;
          if (a.pub.q + b.pub.q > max) continue;
          a.set('q', a.pub.q + b.pub.q);
          a.data.t = Math.max(a.data.t, b.data.t);
          a.data.locks ||= {};
          for (const [pid, t] of Object.entries(b.data.locks || {})) a.data.locks[pid] = Math.max(a.data.locks[pid] || 0, t);
          realm.remove(b);
        }
      }
    }
  },
};
