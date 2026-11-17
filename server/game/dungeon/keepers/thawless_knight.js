// Keeper 5 - The Thawless Knight: cleave (180-degree arc) and shard_line (icicles erupt along a line); P2 ice_floor
// (the room turns to ice except around lit braziers); P3 glacier_drop (3 falling blocks that stay as walls) and
// frost_charge across the room.
import { createEntity } from '../../entities.js';
import { T } from '../../../../shared/grid.js';
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'thawless_knight',
  script: {
    radius: 1.2, speed: 2.4, range: 2.6, movement: 'chase', fxHit: 'hit_ice', blood: 'blue', armor: 40, gcd: 0.8,
    phases: [{ at: 1, moves: ['cleave', 'shard_line'] }, { at: 0.66, moves: ['ice_floor'] }, { at: 0.33, moves: ['glacier_drop', 'frost_charge'] }],
    onStart(game, b, k) {
      const a = b.data.enc.arena;
      const realm = k.realm(b);
      b.data.braziers = [[-11, -8], [11, -8], [-11, 8], [11, 8]].map(([dx, dy]) => {
        const x = a.x + dx, y = a.y + dy;
        const e = createEntity(game, { type: 'structure', kind: 'keeper_brazier', x, y, hp: 0, radius: 0.5, data: { tx: Math.floor(x), ty: Math.floor(y), w: 1, h: 1 }, pub: { rot: 0, own: 0, on: 1 } });
        realm.add(e);
        return e;
      });
    },
    moves: {
      cleave: {
        windup: 0.9, cooldown: 3.5, maxDist: 5, track: true,
        telegraph: { shape: 'cone', r: 3.4, arc: 180 },
        run(game, b, t, k, aim) { k.hit(b, aim.spec, 1.2, { knock: 1.4, fx: 'swing_arc', element: 'frost' }); },
      },
      shard_line: {
        windup: 0.8, cooldown: 5, track: true,
        telegraph: { shape: 'line', len: 11, w: 1.3 },
        run(game, b, t, k, aim) {
          k.lineHits(b, b.x, b.y, aim.a, 11, 1.3, 1.0, { knock: 0.8, element: 'frost', status: { id: 'chill', dur: 2.5, power: 0.15 } });
          k.fx(b, 'boss_antler', { a: r2(aim.a), len: 11, shards: 1 });
        },
      },
      ice_floor: {
        windup: 1.2, cooldown: 24, aim: 'self',
        telegraph: { shape: 'circle', r: 14 },
        run(game, b, t, k) {
          const a = b.data.enc.arena;
          const realm = k.realm(b);
          const until = game.now + 18;
          const warm = (b.data.braziers ?? []).filter((z) => !z.removed);
          for (let y = Math.floor(a.y - 13); y <= Math.ceil(a.y + 13); y++) {
            for (let x = Math.floor(a.x - 17); x <= Math.ceil(a.x + 17); x++) {
              if (realm.groundAt(x, y) !== T.DUNGEON_FLOOR) continue;
              if (warm.some((w) => Math.hypot(w.x - (x + 0.5), w.y - (y + 0.5)) <= 2.6)) continue;
              k.tempGround(b, x, y, T.ICE, until);
            }
          }
          k.fx(b, 'boss_antler', { floor: 1, r: 14 }, a.x, a.y);
        },
      },
      glacier_drop: {
        windup: 1.2, cooldown: 10, aim: 'self',
        zones: (game, b, t, k) => k.allPlayers(b, 20).concat(k.allPlayers(b, 20)).slice(0, 3).map((p, i) => ({ shape: 'circle', x: p.x + (i ? game.bossRng.float(-2, 2) : 0), y: p.y + (i ? game.bossRng.float(-2, 2) : 0), r: 1.3 })),
        run(game, b, t, k, aim) {
          const realm = k.realm(b);
          for (const z of aim.zones ?? []) {
            k.hit(b, z, 1.3, { knock: 1.8, fx: 'keeper_knight', melee: false, element: 'frost' });
            const tx = Math.floor(z.x), ty = Math.floor(z.y);
            k.after(b, 0.25, () => {
              const blocked = k.allPlayers(b, 40).some((p) => Math.floor(p.x) === tx && Math.floor(p.y) === ty);
              if (!blocked && realm.groundAt(tx, ty) !== T.DUNGEON_WALL) k.tempGround(b, tx, ty, T.DUNGEON_WALL, game.now + 12);
            });
          }
        },
      },
      frost_charge: {
        windup: 1.0, cooldown: 8, track: true,
        telegraph: { shape: 'line', len: 18, w: 2.4 },
        run(game, b, t, k, aim) { b.data.charge = { a: aim.a, hit: [] }; k.fx(b, 'boss_antler', { a: r2(aim.a), len: 18 }); return 18 / 15; },
        update(game, b, dt, k) {
          const c = b.data.charge;
          if (!c) return;
          const realm = k.realm(b);
          const nx = b.x + Math.cos(c.a) * 15 * dt, ny = b.y + Math.sin(c.a) * 15 * dt;
          if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(b, nx, ny);
          for (const p of k.allPlayers(b, 3)) {
            if (c.hit.includes(p.id) || Math.hypot(p.x - b.x, p.y - b.y) > b.radius + 0.6) continue;
            c.hit.push(p.id);
            k.damage(p, k.dmg(b, 1.4), { source: b, knock: 2, kx: b.x, ky: b.y, element: 'frost' });
          }
        },
        end(game, b) { b.data.charge = null; },
      },
    },
    onEnd(game, b) {
      for (const z of b.data.braziers ?? []) if (!z.removed) game.realms.get(b.realm)?.remove(z);
    },
  },
};
