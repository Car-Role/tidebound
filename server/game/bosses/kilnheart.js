// Warden 3 - Kilnheart Colossus: fist slams; rotating flame arms; P2 vents erupt everywhere except the cool
// tiles; P3 its core is exposed for short windows (x2 damage taken).
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'kilnheart',
  script: {
    radius: 1.6, speed: 1.4, range: 2.8, movement: 'chase', fxHit: 'hit_armor', blood: 'orange', armor: 20, gcd: 0.9,
    phases: [{ at: 1, moves: ['fist_slam', 'flame_arms'] }, { at: 0.66, moves: ['vents'] }, { at: 0.33, moves: ['core_exposed'] }],
    moves: {
      fist_slam: {
        windup: 0.9, cooldown: 3.5, track: true,
        telegraph: { shape: 'circle', r: 2.4 },
        run(game, b, t, k, aim) {
          k.hit(b, aim.spec, 1.2, { knock: 1.6, fx: 'anchor_slam', element: 'ember' });
          if (b.data.phase >= 1) k.after(b, 0.5, () => k.ring(b, { x: aim.tx, y: aim.ty, from: 2.4, to: 5, dur: 0.6, width: 0.9, mult: 0.5, kind: 'firewave', color: 3 }));
        },
      },
      flame_arms: {
        windup: 1.0, cooldown: 9, aim: 'self',
        zones: (game, b, t, k, aim) => [0, Math.PI].map((o) => ({ shape: 'line', x: b.x, y: b.y, a: aim.a + o, len: 9, w: 1.3 })),
        run(game, b, t, k, aim) {
          b.data.armA = aim.a;
          b.data.armDir = game.bossRng.next() < 0.5 ? -1 : 1;
          b.data.armAcc = 0;
          k.arms(b, aim.a, 2, 9);
          return 4.5;
        },
        update(game, b, dt, k) {
          b.data.armA += b.data.armDir * 0.85 * dt * (b.data.enraged ? 1.3 : 1);
          k.arms(b, b.data.armA, 2, 9);
          b.data.armAcc += dt;
          if (b.data.armAcc >= 0.2) {
            b.data.armAcc -= 0.2;
            for (const o of [0, Math.PI]) {
              k.lineHits(b, b.x, b.y, b.data.armA + o, 9, 1.3, 0.25, { knock: 0.5, element: 'ember', status: { id: 'burn', dur: 2, power: k.dmg(b, 0.1) } });
              k.fx(b, 'boss_kilnheart', { arm: 1, a: r2(b.data.armA + o), len: 9 });
            }
          }
        },
        end(game, b, k) { k.arms(b, 0, 0); },
      },
      vents: {
        windup: 1.4, cooldown: 11, aim: 'self',
        zones: (game, b, t, k) => {
          const a = k.arena(b);
          const out = [{ shape: 'circle', x: a.x, y: a.y, r: 10.5 }];
          for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + game.bossRng.float(0, 1.5);
            const d = game.bossRng.float(3, 7);
            out.push({ shape: 'circle', x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d, r: 1.6, safe: true });
          }
          return out;
        },
        run(game, b, t, k, aim) {
          const zs = aim.zones ?? [];
          const big = zs[0];
          const safe = zs.filter((z) => z.safe);
          for (const p of k.allPlayers(b, 30)) {
            if (Math.hypot(p.x - big.x, p.y - big.y) > big.r) continue;
            if (safe.some((s) => Math.hypot(p.x - s.x, p.y - s.y) <= s.r + 0.2)) continue;
            k.damage(p, k.dmg(b, 1.4), { source: b, element: 'ember', knock: 0.8, kx: b.x, ky: b.y });
          }
          for (let i = 0; i < 10; i++) {
            const ang = game.bossRng.float(0, Math.PI * 2), d = game.bossRng.float(1, big.r);
            k.fx(b, 'boss_kilnheart', { vent: 1 }, big.x + Math.cos(ang) * d, big.y + Math.sin(ang) * d);
          }
          if (b.data.phase >= 2) k.after(b, 0.4, () => { b.data.cds.core_exposed = 0; });
        },
      },
      core_exposed: {
        windup: 0.8, cooldown: 14, aim: 'self',
        telegraph: { shape: 'circle', r: 1.8 },
        run(game, b, t, k) {
          b.data.dmgMult = 2;
          b.set('cx', 1);
          k.fx(b, 'boss_kilnheart', { core: 1 });
          return 4;
        },
        end(game, b) { b.data.dmgMult = null; b.set('cx', 0); },
      },
    },
    onEnd(game, b, reason, k) { k.arms(b, 0, 0); },
  },
};
