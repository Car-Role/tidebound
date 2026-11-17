// Final boss - The Drowned Moon (DESIGN 12.3). WP11 owns the finale flow (realm, rewards, credits, Rebirth);
// this is the fight: it registers the 'drowned_moon' boss script.
//  P1 Crescent: tidal lanes sweep the arena; moon-shard rain; 4 tether pylons to break (the Moon is shielded
//               while any pylon stands).
//  P2 Half:     the arena alternates flooded/dry halves every 12 s; one mini echo of each Warden's signature.
//  P3 Full:     gravity pulls toward the centre; expanding ring waves with gaps; enrage at 10 min.
const r2 = (v) => Math.round(v * 100) / 100;

function spawnPylons(game, b, k) {
  const a = k.arena(b);
  b.data.pylons = [];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = a.x + Math.cos(ang) * 11, y = a.y + Math.sin(ang) * 11;
    const p = k.addSpawn(b, 'pylon', x, y, { hpAbs: Math.round(b.maxHp * 0.012), scaleN: 1, noElite: true });
    if (p) { p.data.static = true; p.data.bossPart = true; b.data.pylons.push(p); }
  }
  b.data.dmgMult = 0.1;
  b.set('sh', 1);
  k.fx(b, 'boss_moon', { pylons: 1 });
}

const ECHOES = ['root', 'flop', 'arms', 'lattice', 'charge', 'notes'];

export default {
  id: 'drowned_moon',
  script: {
    radius: 2.6, speed: 0, range: 0, movement: 'stationary', fxHit: 'hit_null', blood: 'violet', gcd: 0.8, armor: 40,
    phases: [{ at: 1, moves: ['tidal_lanes', 'shard_rain', 'tether_pylons'] }, { at: 0.75, moves: ['flood_halves', 'warden_echoes'] }, { at: 0.4167, moves: ['gravity_well', 'ring_waves'] }],
    onStart(game, b, k) { b.data.static = true; spawnPylons(game, b, k); b.data.cds.tether_pylons = game.now + 60; },
    tick(game, b, dt, k) {
      const d = b.data;
      if (d.pylons?.length) {
        d.pylons = d.pylons.filter((p) => !p.removed && p.hp > 0);
        if (!d.pylons.length) { d.dmgMult = null; b.set('sh', 0); k.fx(b, 'boss_moon', { pylonsDown: 1 }); for (const p of k.allPlayers(b, 40)) game.toast(game.players.get(p.id), 'The tethers snap - the Moon is exposed!', 'good'); }
      }
      // P2: flooded / dry halves alternate every 12 s
      if (d.phase >= 1) {
        d.floodAt ??= game.now;
        if (game.now >= d.floodAt) {
          d.floodAt = game.now + 12;
          d.floodSide = d.floodSide === 1 ? -1 : 1;
          const a = k.arena(b);
          const x = a.x + d.floodSide * 10;
          k.telegraph(b, { shape: 'rect', x, y: a.y, w: 20, h: 40 }, 1.5, () => {
            k.zoneAt(b, { kind: 'flood', shape: 'rect', x, y: a.y, w: 20, h: 40, r: 20, dur: 10.5, dps: k.dmg(b, 0.15), tick: 0.5, status: { id: 'slow', dur: 1, power: 0.5 } });
          });
        }
      }
      // P3: gravity toward the centre
      if (d.phase >= 2) {
        const a = k.arena(b);
        const realm = k.realm(b);
        for (const p of k.allPlayers(b, 40)) {
          const dx = a.x - p.x, dy = a.y - p.y, l = Math.hypot(dx, dy);
          if (l < 3) continue;
          const nx = p.x + (dx / l) * 1.1 * dt, ny = p.y + (dy / l) * 1.1 * dt;
          if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(p, nx, ny);
        }
      }
    },
    moves: {
      tidal_lanes: {
        windup: 1.3, cooldown: 8, aim: 'self',
        zones: (game, b, t, k) => {
          const a = k.arena(b);
          const vertical = game.bossRng.next() < 0.5;
          const off = game.bossRng.next() < 0.5 ? -4 : 4;
          return [-12, 0, 12].map((o) => vertical
            ? { shape: 'rect', x: a.x + o + off, y: a.y, w: 4, h: 40 }
            : { shape: 'rect', x: a.x, y: a.y + o + off, w: 40, h: 4 });
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) {
            k.hit(b, z, 1.2, { knock: 2, fx: false, melee: false, element: 'tide' });
            k.fx(b, 'boss_moon', { lane: 1, w: z.w, h: z.h }, z.x, z.y);
          }
        },
      },
      shard_rain: {
        windup: 0.9, cooldown: 5, aim: 'self',
        zones: (game, b, t, k) => {
          const out = [];
          for (const p of k.allPlayers(b, 40)) for (let i = 0; i < 3; i++) out.push({ shape: 'circle', x: p.x + game.bossRng.float(-2.5, 2.5), y: p.y + game.bossRng.float(-2.5, 2.5), r: 1.6 });
          return out.slice(0, 14);
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) { k.hit(b, z, 0.9, { knock: 0.6, fx: false, melee: false }); k.fx(b, 'moon_shards', { rain: 1 }, z.x, z.y); }
        },
      },
      tether_pylons: {
        windup: 1.2, cooldown: 70, aim: 'self', when: (game, b) => !(b.data.pylons?.length),
        telegraph: { shape: 'circle', r: 3 },
        run(game, b, t, k) { spawnPylons(game, b, k); },
      },
      flood_halves: {
        windup: 0.8, cooldown: 9, aim: 'self',
        telegraph: { shape: 'ring', r: 6, r2: 3 },
        run(game, b, t, k) { k.ring(b, { x: b.x, y: b.y, from: 3, to: 18, dur: 2.2, width: 1.4, mult: 0.8, kind: 'tidewave', color: 5, element: 'tide' }); },
      },
      warden_echoes: {
        windup: 1.0, cooldown: 7, aim: 'self',
        zones: (game, b, t, k) => {
          const which = ECHOES[(b.data.echoI = ((b.data.echoI ?? -1) + 1) % ECHOES.length)];
          b.data.echo = which;
          const tgt = t ?? b;
          const a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          switch (which) {
            case 'root': return [-0.4, 0, 0.4].map((o) => ({ shape: 'line', x: b.x, y: b.y, a: a + o, len: 18, w: 1.4 }));
            case 'flop': return [{ shape: 'circle', x: tgt.x, y: tgt.y, r: 3.2 }];
            case 'arms': return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((o) => ({ shape: 'line', x: b.x, y: b.y, a: a + o, len: 18, w: 1.6 }));
            case 'lattice': return [0, 1, 2, 3].map((i) => { const ang = a + (i / 4) * Math.PI + 0.3; return { shape: 'line', x: tgt.x - Math.cos(ang) * 14, y: tgt.y - Math.sin(ang) * 14, a: ang, len: 28, w: 1.1 }; });
            case 'charge': return [{ shape: 'line', x: b.x, y: b.y, a, len: 20, w: 3 }];
            default: return [{ shape: 'circle', x: b.x, y: b.y, r: 2 }];
          }
        },
        run(game, b, t, k, aim) {
          const which = b.data.echo;
          if (which === 'notes') {
            const g = game.bossRng.float(0, Math.PI * 2);
            k.ring(b, { x: b.x, y: b.y, from: 2, to: 20, dur: 2.8, width: 1.1, mult: 0.9, kind: 'notewave', color: 4, gaps: [{ a: g, arc: 60 }] });
            return;
          }
          for (const z of aim.zones ?? []) k.hit(b, z, 1.1, { knock: 1.4, fx: false, melee: false });
          const fxName = { root: 'boss_thornmother', flop: 'boss_regent', arms: 'boss_kilnheart', lattice: 'boss_prismarch', charge: 'boss_antler' }[which] ?? 'boss_moon';
          for (const z of aim.zones ?? []) k.fx(b, fxName, { a: r2(z.a ?? 0), len: z.len ?? 0, echo: 1 }, z.x, z.y);
        },
      },
      gravity_well: {
        windup: 1.0, cooldown: 10, aim: 'self',
        telegraph: { shape: 'circle', r: 4 },
        run(game, b, t, k) {
          k.hit(b, { shape: 'circle', x: b.x, y: b.y, r: 4 }, 1.5, { knock: 2.5, fx: 'boss_moon', melee: false });
        },
      },
      ring_waves: {
        windup: 0.8, cooldown: 4.5, aim: 'self',
        telegraph: { shape: 'ring', r: 5, r2: 3.5 },
        run(game, b, t, k) {
          const g = game.bossRng.float(0, Math.PI * 2);
          k.ring(b, { x: b.x, y: b.y, from: 3, to: 21, dur: 3, width: 1.2, mult: 1.0, kind: 'tidewave', color: 5, gaps: [{ a: g, arc: 45 }, { a: g + 2.1, arc: 45 }, { a: g + 4.2, arc: 45 }] });
          k.after(b, 1.2, () => k.ring(b, { x: b.x, y: b.y, from: 3, to: 21, dur: 3, width: 1.2, mult: 1.0, kind: 'tidewave', color: 5, gaps: [{ a: g + 1, arc: 45 }, { a: g + 3.1, arc: 45 }, { a: g + 5.2, arc: 45 }] }));
        },
      },
    },
    onEnd(game, b, reason, k) {
      for (const p of b.data.pylons ?? []) if (!p.removed) { k.realm(b)?.remove(p); game.mobsLive.delete(p); }
    },
  },
};
