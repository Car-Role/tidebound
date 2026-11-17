// Warden 6 - The Hollow Choir: three singers that must all die within 10 s of each other (otherwise the fallen
// rise again at half health); note-wave rings with gaps; P2 silence zones (no abilities); P3 the arena shrinks.
// The Choir body itself is untouchable: its HP mirrors the singers' total so phases and the boss bar work.
const r2 = (v) => Math.round(v * 100) / 100;

function singers(b) { return (b.data.singers ?? []).map((s) => s.e).filter(Boolean); }

function spawnSinger(game, b, k, slot, hpFrac) {
  const a = k.arena(b);
  const ang = (slot / 3) * Math.PI * 2 - Math.PI / 2;
  const x = a.x + Math.cos(ang) * 5.5, y = a.y + Math.sin(ang) * 5.5;
  const each = Math.round(b.maxHp / 3);
  const s = k.addSpawn(b, 'choir_singer', x, y, { hpAbs: Math.max(1, Math.round(each * hpFrac)), scaleN: 1, noElite: true });
  if (!s) return null;
  s.maxHp = each;
  s.data.bossPart = true;
  s.data.static = true;
  s.data.xp = 0;
  s.set('gi', slot);
  k.fx(b, 'boss_choir', { singer: 1 }, x, y);
  return s;
}

export default {
  id: 'hollow_choir',
  script: {
    radius: 1.4, speed: 0, range: 0, movement: 'stationary', fxHit: 'hit_null', blood: 'violet', gcd: 1.0,
    phases: [{ at: 1, moves: ['three_singers', 'note_waves'] }, { at: 0.66, moves: ['silence_zones'] }, { at: 0.33, moves: ['arena_shrink'] }],
    onStart(game, b, k) {
      b.data.dmgMult = 0;
      b.data.static = true;
      b.data.singers = [0, 1, 2].map((i) => ({ e: spawnSinger(game, b, k, i, 1), deadAt: null }));
      b.data.window = game.content.bosses.byId.hollow_choir?.singers?.window ?? 10;
    },
    tick(game, b, dt, k) {
      const d = b.data;
      if (!d.singers) return;
      // track deaths, the 10 s window and revivals
      for (const s of d.singers) {
        if (s.e && (s.e.removed || s.e.hp <= 0)) { s.e = null; s.deadAt = game.now; k.fx(b, 'boss_choir', { fall: 1 }, b.x, b.y); }
        if (s.e) {
          for (const [pid, dmg] of Object.entries(s.e.data.dmgBy ?? {})) { d.enc.dmgBy[pid] = (d.enc.dmgBy[pid] ?? 0) + dmg; d.enc.players.add(Number(pid)); }
          s.e.data.dmgBy = {};
        }
      }
      const living = d.singers.filter((s) => s.e);
      if (living.length === 0) {
        if (!d.dying) {
          d.dying = true;
          d.dmgMult = null;
          b.hp = Math.max(1, b.hp);
          k.damage(b, b.hp + 1, { raw: true, quiet: true });
        }
        return;
      }
      for (const [i, s] of d.singers.entries()) {
        if (s.e || s.deadAt == null || game.now - s.deadAt <= d.window) continue;
        s.e = spawnSinger(game, b, k, i, 0.5);
        s.deadAt = null;
        for (const p of k.allPlayers(b, 40)) game.toast(game.players.get(p.id), 'A singer rises again - fell all three together!', 'warn');
      }
      b.hp = Math.max(1, Math.round(d.singers.reduce((sum, s) => sum + (s.e ? s.e.hp : 0), 0)));
      // the shrinking arena burns anyone outside the safe radius
      if (d.shrink) {
        const a = k.arena(b);
        const t = Math.min(1, (game.now - d.shrink.t0) / 20);
        const R = 12 - 6 * t;
        if (Math.abs((b.pub.sr ?? 0) - R) > 0.2) b.set('sr', r2(R));
        d.shrinkAcc = (d.shrinkAcc ?? 0) + dt;
        if (d.shrinkAcc >= 0.5) {
          d.shrinkAcc -= 0.5;
          for (const p of k.allPlayers(b, 40)) if (Math.hypot(p.x - a.x, p.y - a.y) > R) k.damage(p, k.dmg(b, 0.15), { source: b, raw: false, element: 'hollow' });
        }
      }
    },
    moves: {
      // the singers' chord: each living singer bursts a short ring around itself
      three_singers: {
        windup: 1.0, cooldown: 7, aim: 'self',
        zones: (game, b) => singers(b).map((s) => ({ shape: 'circle', x: s.x, y: s.y, r: 3 })),
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) {
            k.hit(b, z, 0.8, { knock: 1.5, fx: false, melee: false, element: 'hollow' });
            k.fx(b, 'boss_choir', { chord: 1, r: 3 }, z.x, z.y);
          }
        },
      },
      note_waves: {
        windup: 0.9, cooldown: 4, aim: 'self',
        telegraph: { shape: 'circle', r: 1.6 },
        run(game, b, t, k) {
          const from = singers(b);
          const src = from[Math.floor(game.bossRng.next() * from.length)] ?? b;
          const gapA = game.bossRng.float(0, Math.PI * 2);
          k.ring(b, { x: src.x, y: src.y, from: 0.8, to: 14, dur: 2.6, width: 1.0, mult: 0.9, kind: 'notewave', color: 4,
            gaps: [{ a: gapA, arc: 50 }, { a: gapA + Math.PI, arc: 50 }], element: 'hollow' });
          k.fx(b, 'boss_choir', { wave: 1 }, src.x, src.y);
          if (b.data.phase >= 1) k.after(b, 1.1, () => k.ring(b, { x: src.x, y: src.y, from: 0.8, to: 14, dur: 2.6, width: 1.0, mult: 0.9, kind: 'notewave', color: 4, gaps: [{ a: gapA + 1.2, arc: 55 }] }));
        },
      },
      silence_zones: {
        windup: 1.0, cooldown: 9, aim: 'self',
        zones: (game, b, t, k) => k.allPlayers(b, 30).slice(0, 4).map((p) => ({ shape: 'circle', x: p.x, y: p.y, r: 2.6 })),
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) k.zoneAt(b, { kind: 'silence', x: z.x, y: z.y, r: z.r, dur: 6, dps: k.dmg(b, 0.2), tick: 0.5, status: { id: 'silence', dur: 1.2 } });
        },
      },
      arena_shrink: {
        windup: 1.2, cooldown: 60, aim: 'self',
        telegraph: { shape: 'ring', r: 12, r2: 6 },
        run(game, b, t, k) {
          if (!b.data.shrink) b.data.shrink = { t0: game.now };
          k.fx(b, 'boss_choir', { shrink: 1 });
        },
      },
    },
    onEnd(game, b, reason, k) {
      for (const s of b.data.singers ?? []) if (s.e && !s.e.removed) { k.realm(b)?.remove(s.e); game.mobsLive.delete(s.e); }
    },
  },
};
