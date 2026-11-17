// Warden 1 - Old Thornmother (DESIGN 12.2): root line sweeps; seed-pod volley; P2 calls 3 Thistlewisps;
// P3 a ring of thorns closes in (dodge-roll through it).
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'thornmother',
  script: {
    radius: 1.3, speed: 1.6, range: 2.6, movement: 'chase', fxHit: 'hit_plant', blood: 'green', gcd: 0.9,
    phases: [{ at: 1, moves: ['root_sweep', 'seed_volley'] }, { at: 0.66, moves: ['call_thistlewisps'] }, { at: 0.33, moves: ['thorn_ring'] }],
    moves: {
      root_sweep: {
        windup: 0.9, cooldown: 4.5,
        telegraph: { shape: 'line', len: 9, w: 1.4 },
        zones: (game, b, t, k, aim) => b.data.phase >= 1
          ? [-0.45, 0.45].map((o) => ({ shape: 'line', x: b.x, y: b.y, a: aim.a + o, len: 8, w: 1.2 }))
          : [],
        run(game, b, t, k, aim) {
          const lines = [{ a: aim.a, len: 9, w: 1.4 }, ...(aim.zones ?? []).map((z) => ({ a: z.a, len: z.len, w: z.w }))];
          for (const L of lines) {
            k.lineHits(b, aim.spec.x, aim.spec.y, L.a, L.len, L.w, 1.1, { knock: 1.2 });
            k.fx(b, 'boss_thornmother', { a: r2(L.a), len: L.len }, aim.spec.x, aim.spec.y);
          }
        },
      },
      seed_volley: {
        windup: 0.75, cooldown: 4, aim: 'self', track: true,
        telegraph: { shape: 'cone', r: 7, arc: 70 },
        run(game, b, t, k, aim) {
          const n = b.data.phase >= 2 ? 9 : 7;
          for (let i = 0; i < n; i++) k.shoot(b, 'seed', aim.a + (i - (n - 1) / 2) * 0.17, { speed: 6.5, range: 11, mult: 0.7 });
          k.fx(b, 'hit_plant', { burst: 1 });
        },
      },
      call_thistlewisps: {
        windup: 1.0, cooldown: 16, aim: 'self',
        telegraph: { shape: 'circle', r: 2.2 },
        run(game, b, t, k) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.4;
            const x = b.x + Math.cos(a) * 3, y = b.y + Math.sin(a) * 3;
            const m = k.addSpawn(b, 'thistlewisp', k.walkable(b, x, y) ? x : b.x, k.walkable(b, x, y) ? y : b.y);
            if (m) k.fx(b, 'sproutling', {}, m.x, m.y);
          }
        },
      },
      thorn_ring: {
        windup: 1.0, cooldown: 11, aim: 'self',
        telegraph: { shape: 'ring', r: 9.5, r2: 8.3 },
        run(game, b, t, k) {
          const a = k.arena(b);
          k.ring(b, { x: a.x, y: a.y, from: 9.5, to: 1.2, dur: 3.2, width: 1.2, mult: 1.2, kind: 'thornring', color: 1, knock: 0.6 });
          k.fx(b, 'boss_thornmother', { ring: 1, r: 9.5 }, a.x, a.y);
          return 1.0;
        },
      },
    },
  },
};
