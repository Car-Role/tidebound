// Keeper 6 - Scribe of Nothing: ink_blot (3 pools, slow 40%, 100 dmg/s) and quill_dart (3 fast darts); P2 erase
// (6 floor tiles vanish for 8 s; falling costs 20% max HP and drops you at the room edge); P3 darkness (light
// radius 3 for 10 s while it teleports between attacks).
import { T } from '../../../../shared/grid.js';
const INK_PER_S = 100 / 280;

export default {
  id: 'scribe',
  script: {
    radius: 1.1, speed: 2.0, range: 5, movement: 'hover', fxHit: 'hit_null', blood: 'violet', armor: 30, gcd: 0.8,
    phases: [{ at: 1, moves: ['ink_blot', 'quill_dart'] }, { at: 0.66, moves: ['erase'] }, { at: 0.33, moves: ['darkness'] }],
    tick(game, b, dt, k) {
      const d = b.data;
      // falling through erased floor
      const realm = k.realm(b);
      for (const p of k.allPlayers(b, 40)) {
        if (realm.groundAt(Math.floor(p.x), Math.floor(p.y)) !== T.EMPTY) continue;
        const a = d.enc.arena;
        k.damage(p, p.maxHp * 0.2, { raw: true, source: b, tag: 'fall' });
        const ang = game.bossRng.float(0, Math.PI * 2);
        const s = k.spotNear(b, a.x + Math.cos(ang) * 12, a.y + Math.sin(ang) * 9, 0, 2) ?? { x: a.x, y: a.y + 10 };
        realm.move(p, s.x, s.y);
        k.fx(b, 'keeper_scribe', { fall: 1 }, s.x, s.y);
      }
      // while dark it teleports between attacks
      if (d.darkUntil && game.now < d.darkUntil && d.lastBlinkMove !== d.lastMove && !d.act) {
        d.lastBlinkMove = d.lastMove;
        const a = d.enc.arena;
        const s = k.spotNear(b, a.x, a.y, 3, 11);
        if (s) k.blink(b, s.x, s.y);
      }
    },
    moves: {
      ink_blot: {
        windup: 0.9, cooldown: 5, aim: 'self',
        zones: (game, b, t, k) => {
          const ps = k.allPlayers(b, 25);
          return [0, 1, 2].map((i) => { const p = ps[i % Math.max(1, ps.length)] ?? b; return { shape: 'circle', x: p.x + (i ? game.bossRng.float(-2, 2) : 0), y: p.y + (i ? game.bossRng.float(-2, 2) : 0), r: 1.6 }; });
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) k.zoneAt(b, { kind: 'ink', x: z.x, y: z.y, r: z.r, dur: 7, dps: k.dmg(b, INK_PER_S), tick: 0.5, status: { id: 'slow', dur: 0.7, power: 0.4 } });
          k.fx(b, 'keeper_scribe', { blot: 1 });
        },
      },
      quill_dart: {
        windup: 0.6, cooldown: 3, aim: 'self', track: true,
        telegraph: { shape: 'cone', r: 4, arc: 30 },
        run(game, b, t, k, aim) { for (let i = 0; i < 3; i++) k.after(b, i * 0.12, () => k.shoot(b, 'quill_dart', aim.a + (i - 1) * 0.06, { speed: 15, range: 20, mult: 0.55 })); },
      },
      erase: {
        windup: 1.2, cooldown: 12, aim: 'self',
        zones: (game, b, t, k) => {
          const out = [];
          const ps = k.allPlayers(b, 25);
          for (let i = 0; i < 6; i++) {
            const p = ps[i % Math.max(1, ps.length)] ?? b;
            out.push({ shape: 'rect', x: Math.floor(p.x + game.bossRng.float(-2.5, 2.5)) + 0.5, y: Math.floor(p.y + game.bossRng.float(-2.5, 2.5)) + 0.5, w: 1, h: 1 });
          }
          return out;
        },
        run(game, b, t, k, aim) {
          const realm = k.realm(b);
          for (const z of aim.zones ?? []) {
            const tx = Math.floor(z.x), ty = Math.floor(z.y);
            if (realm.groundAt(tx, ty) !== T.DUNGEON_FLOOR) continue;
            k.tempGround(b, tx, ty, T.EMPTY, game.now + 8);
            k.fx(b, 'keeper_scribe', { erase: 1 }, z.x, z.y);
          }
        },
      },
      darkness: {
        windup: 1.0, cooldown: 25, aim: 'self',
        telegraph: { shape: 'circle', r: 3 },
        run(game, b, t, k) {
          b.data.darkUntil = game.now + 10;
          game.call('instanceDarkness', b.realm, 3, 10);
          k.fx(b, 'eclipse_motes', { scribe: 1 });
        },
      },
    },
  },
};
