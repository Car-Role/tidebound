// Warden 4 - The Prismarch: beam lattice; mirror clones (only the real one casts a shadow); P2 colour-coded
// safe zones; P3 full-arena refraction (8 rotating beams).
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'prismarch',
  script: {
    radius: 1.2, speed: 2.2, range: 6, movement: 'hover', fxHit: 'hit_armor', blood: 'white', gcd: 0.8,
    phases: [{ at: 1, moves: ['beam_lattice', 'mirror_clones'] }, { at: 0.66, moves: ['colour_zones'] }, { at: 0.33, moves: ['full_refraction'] }],
    moves: {
      beam_lattice: {
        windup: 1.1, cooldown: 6.5, aim: 'self',
        zones: (game, b, t, k) => {
          const a = k.arena(b);
          const n = b.data.phase >= 2 ? 6 : 4;
          const base = game.bossRng.float(0, Math.PI);
          const out = [];
          for (let i = 0; i < n; i++) {
            const ang = base + (i / n) * Math.PI;
            const off = game.bossRng.float(-4, 4);
            const cx = a.x + Math.cos(ang + Math.PI / 2) * off, cy = a.y + Math.sin(ang + Math.PI / 2) * off;
            out.push({ shape: 'line', x: cx - Math.cos(ang) * 12, y: cy - Math.sin(ang) * 12, a: ang, len: 24, w: 1.1 });
          }
          return out;
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) {
            k.lineHits(b, z.x, z.y, z.a, z.len, z.w, 1.0, { knock: 0.4 });
            k.fx(b, 'boss_prismarch', { a: r2(z.a), len: z.len }, z.x, z.y);
          }
        },
      },
      mirror_clones: {
        windup: 0.9, cooldown: 18, aim: 'self',
        telegraph: { shape: 'circle', r: 1.8 },
        run(game, b, t, k) {
          const spots = [];
          for (let i = 0; i < 2; i++) {
            const s = k.spotNear(b, k.arena(b).x, k.arena(b).y, 3, 7);
            if (!s) continue;
            const c = k.addSpawn(b, 'prism_clone', s.x, s.y, { hpAbs: Math.round(b.maxHp * 0.02), dmgMult: (b.data.dmg / 60) * 0.5 });
            if (c) { c.data.dieAt = game.now + 20; spots.push(c); }
          }
          // shuffle the real one among its images
          const c = spots[Math.floor(game.bossRng.next() * spots.length)];
          if (c) { const x = b.x, y = b.y; k.realm(b).move(b, c.x, c.y); k.realm(c).move(c, x, y); }
          k.fx(b, 'boss_prismarch', { mirror: 1 });
        },
      },
      colour_zones: {
        windup: 1.6, cooldown: 11, aim: 'self',
        zones: (game, b, t, k) => {
          const a = k.arena(b);
          const safe = Math.floor(game.bossRng.next() * 4);
          return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => ({ shape: 'rect', x: a.x + sx * 5.5, y: a.y + sy * 5.5, w: 11, h: 11, safe: i === safe, color: i + 1 }));
        },
        run(game, b, t, k, aim) {
          const zs = aim.zones ?? [];
          const safe = zs.find((z) => z.safe);
          for (const p of k.allPlayers(b, 30)) {
            if (safe && Math.abs(p.x - safe.x) <= safe.w / 2 && Math.abs(p.y - safe.y) <= safe.h / 2) continue;
            k.damage(p, k.dmg(b, 1.6), { source: b, knock: 0.6, kx: b.x, ky: b.y });
          }
          for (const z of zs) if (!z.safe) k.fx(b, 'boss_prismarch', { flash: 1, c: z.color }, z.x, z.y);
        },
      },
      full_refraction: {
        windup: 1.2, cooldown: 12, aim: 'self',
        zones: (game, b, t, k, aim) => Array.from({ length: 8 }, (_, i) => ({ shape: 'line', x: b.x, y: b.y, a: aim.a + (i / 8) * Math.PI * 2, len: 12, w: 1 })),
        run(game, b, t, k, aim) {
          b.data.armA = aim.a; b.data.armAcc = 0; b.data.armDir = game.bossRng.next() < 0.5 ? -1 : 1;
          k.arms(b, aim.a, 8, 12);
          return 3.2;
        },
        update(game, b, dt, k) {
          b.data.armA += b.data.armDir * 0.5 * dt;
          k.arms(b, b.data.armA, 8, 12);
          b.data.armAcc += dt;
          if (b.data.armAcc >= 0.25) {
            b.data.armAcc -= 0.25;
            for (let i = 0; i < 8; i++) k.lineHits(b, b.x, b.y, b.data.armA + (i / 8) * Math.PI * 2, 12, 1, 0.3, { knock: 0.3 });
          }
        },
        end(game, b, k) { k.arms(b, 0, 0); },
      },
    },
    tick(game, b, dt, k) {
      // fragile images fade after a while
      for (const a of b.data.enc.adds) if (!a.removed && a.kind === 'prism_clone' && a.data.dieAt && game.now > a.data.dieAt) k.damage(a, a.hp + 1, { raw: true, quiet: true });
    },
    onEnd(game, b, reason, k) { k.arms(b, 0, 0); },
  },
};
