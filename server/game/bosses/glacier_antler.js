// Warden 5 - The Glacier Antler: charge lanes; antler ice-shard fans; P2 blizzard chill meter (stand by the
// warm braziers or freeze); P3 the arena freezes into ice (momentum movement).
import { T } from '../../../shared/grid.js';
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'glacier_antler',
  script: {
    radius: 1.5, speed: 2.4, range: 2.8, movement: 'chase', fxHit: 'hit_ice', blood: 'blue', armor: 30, gcd: 0.8,
    phases: [{ at: 1, moves: ['charge_lanes', 'shard_fans'] }, { at: 0.66, moves: ['blizzard_chill'] }, { at: 0.33, moves: ['ice_floor'] }],
    moves: {
      charge_lanes: {
        windup: 1.0, cooldown: 6, track: true,
        telegraph: { shape: 'line', len: 14, w: 2.4 },
        run(game, b, t, k, aim) {
          b.data.charge = { a: aim.a, t: 0, hit: [] };
          k.fx(b, 'boss_antler', { a: r2(aim.a), len: 14 });
          return 14 / 16;
        },
        update(game, b, dt, k) {
          const c = b.data.charge;
          if (!c) return;
          const realm = k.realm(b);
          const nx = b.x + Math.cos(c.a) * 16 * dt, ny = b.y + Math.sin(c.a) * 16 * dt;
          if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(b, nx, ny);
          for (const p of k.allPlayers(b, 3)) {
            if (c.hit.includes(p.id) || Math.hypot(p.x - b.x, p.y - b.y) > b.radius + 0.6) continue;
            c.hit.push(p.id);
            k.damage(p, k.dmg(b, 1.3), { source: b, knock: 2.2, kx: b.x, ky: b.y, element: 'frost' });
          }
          k.zoneAt(b, { kind: 'frost', x: b.x, y: b.y, r: 0.8, dur: 3, status: { id: 'chill', dur: 1.5, power: 0.1 } });
        },
        end(game, b) { b.data.charge = null; },
      },
      shard_fans: {
        windup: 0.8, cooldown: 4.5, aim: 'self', track: true,
        telegraph: { shape: 'cone', r: 8, arc: 80 },
        run(game, b, t, k, aim) {
          const n = 9;
          for (let i = 0; i < n; i++) k.shoot(b, 'icicle', aim.a + (i - (n - 1) / 2) * 0.17, { speed: 8.5, range: 12, mult: 0.6, status: { id: 'chill', dur: 2.5, power: 0.1 } });
        },
      },
      blizzard_chill: {
        windup: 1.0, cooldown: 14, aim: 'self', moveWhile: true,
        telegraph: { shape: 'circle', r: 2 },
        run(game, b, t, k) {
          const a = k.arena(b);
          b.data.warm = [];
          for (let i = 0; i < 2; i++) {
            const s = k.spotNear(b, a.x, a.y, 3, 8) ?? { x: a.x, y: a.y };
            b.data.warm.push(s);
            k.zoneAt(b, { kind: 'warm', x: s.x, y: s.y, r: 2.2, dur: 8, team: 'none', noDamagePlayers: true });
          }
          b.data.blizAcc = 0;
          k.fx(b, 'blizzard', { boss: 1 });
          return 7;
        },
        update(game, b, dt, k) {
          b.data.blizAcc += dt;
          if (b.data.blizAcc < 1) return;
          b.data.blizAcc -= 1;
          for (const p of k.allPlayers(b, 30)) {
            if ((b.data.warm ?? []).some((s) => Math.hypot(p.x - s.x, p.y - s.y) <= 2.4)) continue;
            k.applyStatus(p, 'chill', { duration: 3, power: 0.1, stacks: 1, freezeAt: 5, freezeDur: 1.5, source: b });
            k.fx(b, 'chill', { i: p.id }, p.x, p.y);
          }
        },
        end(game, b) { b.data.warm = null; },
      },
      ice_floor: {
        windup: 1.0, cooldown: 26, aim: 'self',
        telegraph: { shape: 'circle', r: 10 },
        run(game, b, t, k) {
          const a = k.arena(b);
          const realm = k.realm(b);
          const until = game.now + 15;
          for (let y = Math.floor(a.y - 10); y <= Math.ceil(a.y + 10); y++) {
            for (let x = Math.floor(a.x - 10); x <= Math.ceil(a.x + 10); x++) {
              if (Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) > 10) continue;
              if (!realm.isWalkable(x, y)) continue;
              const g = realm.groundAt(x, y);
              if (g === T.LAVA || g <= T.TIDAL) continue;
              k.tempGround(b, x, y, T.ICE, until);
            }
          }
          k.fx(b, 'boss_antler', { floor: 1, r: 10 }, a.x, a.y);
        },
      },
    },
  },
};
