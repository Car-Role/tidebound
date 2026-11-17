// Keeper 1 - Sporeking Bulb (DESIGN A.4): spore_lob (3 arcing pods leave clouds, 10 dmg/s for 6 s; hits burst
// them) and root_jab (6-tile line stab); P2 sporeling_call (4 Burrowgrubs); P3 bloom (ring of 8 pods every 8 s).
const PER_S = 10 / 12;   // 10 dmg/s relative to its 12 hit damage (scales with Trench remixes)

function pod(k, b, x, y) {
  k.lob(b, 'spore_pod', x, y, {
    r: 1.1, mult: 0.5, time: 1.0,
    zone: { kind: 'spore', r: 1.6, dur: 6, dps: k.dmg(b, PER_S), tick: 0.5, burstable: true, status: { id: 'slow', dur: 0.6, power: 0.2 } },
  });
}

export default {
  id: 'sporeking',
  script: {
    radius: 1.3, speed: 0, range: 0, movement: 'stationary', fxHit: 'hit_plant', blood: 'green', gcd: 0.9,
    phases: [{ at: 1, moves: ['spore_lob', 'root_jab'] }, { at: 0.66, moves: ['sporeling_call'] }, { at: 0.33, moves: ['bloom'] }],
    onStart(game, b) { b.data.static = true; },
    moves: {
      spore_lob: {
        windup: 0.8, cooldown: 4, aim: 'self',
        telegraph: { shape: 'circle', r: 1.6 },
        run(game, b, t, k) {
          const ps = k.allPlayers(b, 20);
          for (let i = 0; i < 3; i++) {
            const p = ps[i % Math.max(1, ps.length)] ?? t ?? b;
            const s = k.spotNear(b, p.x, p.y, 0, 2.2) ?? { x: p.x, y: p.y };
            pod(k, b, s.x, s.y);
          }
          k.fx(b, 'keeper_sporeking', { lob: 1 });
        },
      },
      root_jab: {
        windup: 0.7, cooldown: 3.5, track: true,
        telegraph: { shape: 'line', len: 6, w: 1.1 },
        run(game, b, t, k, aim) {
          k.lineHits(b, b.x, b.y, aim.a, 6, 1.1, 1.0, { knock: 1.0 });
          k.fx(b, 'boss_thornmother', { a: Math.round(aim.a * 100) / 100, len: 6, jab: 1 });
        },
      },
      sporeling_call: {
        windup: 1.0, cooldown: 15, aim: 'self',
        telegraph: { shape: 'circle', r: 2.5 },
        run(game, b, t, k) {
          for (let i = 0; i < 4; i++) {
            const s = k.spotNear(b, b.x, b.y, 2.5, 5);
            if (s) { k.addSpawn(b, 'burrowgrub', s.x, s.y, { hpMult: b.data.enc.trench ? Math.pow(1.12, b.data.enc.trench) : 1 }); k.fx(b, 'break_stone', { dust: 1 }, s.x, s.y); }
          }
        },
      },
      bloom: {
        windup: 1.0, cooldown: 8, aim: 'self',
        zones: (game, b) => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { shape: 'circle', x: b.x + Math.cos(a) * 4, y: b.y + Math.sin(a) * 4, r: 1.1 }; }),
        run(game, b, t, k, aim) { for (const z of aim.zones ?? []) pod(k, b, z.x, z.y); },
      },
    },
  },
};
