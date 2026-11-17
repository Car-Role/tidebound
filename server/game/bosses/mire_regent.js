// Warden 2 - Gulchmaw, the Mire Regent: tongue grab; belly-flop shockwave; P2 floods the arena in tidal lanes;
// P3 spits Fenleech eggs.
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'mire_regent',
  script: {
    radius: 1.5, speed: 1.8, range: 3, movement: 'chase', fxHit: 'hit_flesh', blood: 'teal', gcd: 0.8,
    phases: [{ at: 1, moves: ['tongue_grab', 'belly_flop'] }, { at: 0.66, moves: ['flood_lanes'] }, { at: 0.33, moves: ['spit_fenleeches'] }],
    moves: {
      tongue_grab: {
        windup: 0.8, cooldown: 6, minDist: 2.5, track: true,
        telegraph: { shape: 'line', len: 8.5, w: 1.1 },
        run(game, b, t, k, aim) {
          const hits = k.lineHits(b, b.x, b.y, aim.a, 8.5, 1.1, 0.8, { knock: 0 });
          k.fx(b, 'boss_regent', { tongue: 1, a: r2(aim.a), len: 8.5 });
          const v = hits[0];
          if (v) {
            const realm = k.realm(b);
            const px = b.x + Math.cos(aim.a) * (b.radius + 0.7), py = b.y + Math.sin(aim.a) * (b.radius + 0.7);
            if (k.walkable(v, px, py) || realm.isWalkable(Math.floor(px), Math.floor(py))) realm.move(v, px, py);
            k.applyStatus(v, 'root', { duration: 0.6, source: b });
          }
        },
      },
      belly_flop: {
        windup: 1.0, cooldown: 6.5,
        telegraph: { shape: 'circle', r: 3 },
        run(game, b, t, k, aim) {
          const realm = k.realm(b);
          if (realm.isWalkable(Math.floor(aim.tx), Math.floor(aim.ty))) realm.move(b, aim.tx, aim.ty);
          k.hit(b, aim.spec, 1.3, { knock: 1.6, fx: 'boss_regent' });
          k.ring(b, { x: aim.tx, y: aim.ty, from: 3, to: 7, dur: 0.9, width: 1.0, mult: 0.6, kind: 'mudwave', color: 2 });
        },
      },
      flood_lanes: {
        windup: 1.2, cooldown: 12, aim: 'self',
        zones: (game, b, t, k) => {
          const a = k.arena(b);
          const off = game.bossRng.next() < 0.5 ? 0 : 3;
          return [-6, 0, 6].map((dy) => ({ shape: 'rect', x: a.x, y: a.y + dy + off - 1.5, w: 22, h: 2.8 }));
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) {
            k.zoneAt(b, { kind: 'flood', shape: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, r: z.w / 2, dur: 6, dps: k.dmg(b, 0.35), tick: 0.5, status: { id: 'slow', dur: 1, power: 0.5 } });
            k.fx(b, 'tide_wave', { lane: 1, w: z.w }, z.x, z.y);
          }
        },
      },
      spit_fenleeches: {
        windup: 0.9, cooldown: 15, aim: 'self',
        telegraph: { shape: 'circle', r: 2 },
        run(game, b, t, k) {
          const targets = k.allPlayers(b, 20);
          for (let i = 0; i < 3; i++) {
            const p = targets[i % Math.max(1, targets.length)] ?? b;
            const s = k.spotNear(b, p.x, p.y, 1.5, 3) ?? { x: b.x + 2, y: b.y };
            k.lob(b, 'pod', s.x, s.y, { r: 1, mult: 0.5, time: 1.1 });
            k.after(b, 1.15, () => k.addSpawn(b, 'fenleech', s.x, s.y));
          }
        },
      },
    },
  },
};
