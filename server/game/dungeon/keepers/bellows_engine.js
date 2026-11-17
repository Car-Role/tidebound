// Keeper 3 - The Bellows Engine: flame_jet (3 rotating jets) and slag_drop (4 ground markers); P2 conveyor
// (floor belts push toward the jets, direction flips every 10 s); P3 overheat (all jets vent at once, then the
// core is exposed for 4 s).
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'bellows_engine',
  script: {
    radius: 1.6, speed: 0, range: 0, movement: 'stationary', fxHit: 'hit_armor', blood: 'orange', armor: 25, gcd: 0.9,
    phases: [{ at: 1, moves: ['flame_jet', 'slag_drop'] }, { at: 0.66, moves: ['conveyor'] }, { at: 0.33, moves: ['overheat'] }],
    onStart(game, b) { b.data.static = true; },
    tick(game, b, dt, k) {
      const d = b.data;
      if (!d.belt) return;
      if (game.now >= d.belt.flipAt) { d.belt.flipAt = game.now + 10; d.belt.dir = -d.belt.dir; b.set('cv', d.belt.dir); k.fx(b, 'keeper_bellows', { flip: d.belt.dir }); }
      // belts carry everyone toward (dir 1) or away from (dir -1) the engine
      const realm = k.realm(b);
      for (const p of k.allPlayers(b, 20)) {
        const dx = b.x - p.x, dy = b.y - p.y, l = Math.hypot(dx, dy) || 1;
        if (l < b.radius + 1) continue;
        const nx = p.x + (dx / l) * 1.4 * dt * d.belt.dir, ny = p.y + (dy / l) * 1.4 * dt * d.belt.dir;
        if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(p, nx, ny);
      }
    },
    moves: {
      flame_jet: {
        windup: 1.0, cooldown: 8, aim: 'self',
        zones: (game, b, t, k, aim) => [0, 1, 2].map((i) => ({ shape: 'line', x: b.x, y: b.y, a: aim.a + (i / 3) * Math.PI * 2, len: 11, w: 1.3 })),
        run(game, b, t, k, aim) {
          b.data.armA = aim.a; b.data.armAcc = 0; b.data.armDir = game.bossRng.next() < 0.5 ? -1 : 1;
          k.arms(b, aim.a, 3, 11);
          return 4;
        },
        update(game, b, dt, k) {
          b.data.armA += b.data.armDir * 0.8 * dt;
          k.arms(b, b.data.armA, 3, 11);
          b.data.armAcc += dt;
          if (b.data.armAcc >= 0.2) {
            b.data.armAcc -= 0.2;
            for (let i = 0; i < 3; i++) {
              const a = b.data.armA + (i / 3) * Math.PI * 2;
              k.lineHits(b, b.x, b.y, a, 11, 1.3, 0.22, { knock: 0.4, element: 'ember', status: { id: 'burn', dur: 2, power: k.dmg(b, 0.08) } });
              k.fx(b, 'keeper_bellows', { a: r2(a), len: 11 });
            }
          }
        },
        end(game, b, k) { k.arms(b, 0, 0); },
      },
      slag_drop: {
        windup: 0.9, cooldown: 5, aim: 'self',
        zones: (game, b, t, k) => {
          const out = [];
          const ps = k.allPlayers(b, 20);
          for (let i = 0; i < 4; i++) {
            const p = ps[i % Math.max(1, ps.length)] ?? b;
            out.push({ shape: 'circle', x: p.x + game.bossRng.float(-1.5, 1.5), y: p.y + game.bossRng.float(-1.5, 1.5), r: 1.4 });
          }
          return out;
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) {
            k.hit(b, z, 1.0, { knock: 0.8, fx: 'burn_explode', melee: false, element: 'ember' });
            k.zoneAt(b, { kind: 'fire', x: z.x, y: z.y, r: 1.1, dur: 4, dps: k.dmg(b, 0.2), tick: 0.5 });
          }
        },
      },
      conveyor: {
        windup: 0.8, cooldown: 999, aim: 'self',
        telegraph: { shape: 'ring', r: 10, r2: 9 },
        run(game, b, t, k) {
          b.data.belt = { dir: 1, flipAt: game.now + 10 };
          b.set('cv', 1);
          k.fx(b, 'keeper_bellows', { belts: 1 });
        },
      },
      overheat: {
        windup: 1.4, cooldown: 14, aim: 'self',
        zones: (game, b, t, k, aim) => Array.from({ length: 8 }, (_, i) => ({ shape: 'line', x: b.x, y: b.y, a: aim.a + (i / 8) * Math.PI * 2, len: 13, w: 1.6 })),
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) { k.lineHits(b, z.x, z.y, z.a, z.len, z.w, 1.3, { knock: 1.2, element: 'ember' }); k.fx(b, 'keeper_bellows', { a: r2(z.a), len: z.len, vent: 1 }); }
          b.data.dmgMult = 2;
          b.set('cx', 1);
          return 4;
        },
        end(game, b) { b.data.dmgMult = null; b.set('cx', 0); },
      },
    },
    onEnd(game, b, reason, k) { k.arms(b, 0, 0); b.data.belt = null; },
  },
};
