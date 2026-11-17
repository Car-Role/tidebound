// turret_lobber: stationary; lobs arcing blobs at where the player is heading (ground marker telegraph for the
// whole flight). `pool: 'ink'` leaves ink pools (slow 40%, damage over time).
export default {
  id: 'turret_lobber',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams;
    k.stop(m);
    if (!t || k.busy(m) || !k.ready(m)) return;
    if (k.dist(m, t) > 11) return;
    k.face(m, t.x, t.y);
    k.act(m, 'lob', {
      windup: 0.5, recover: 0.4, cd: p.shotCd ?? 2.5,
      tg: { shape: 'circle', x: m.x, y: m.y, r: 0.9 },
      fire: () => {
        const lead = 0.5;
        const n = p.pool ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const tx = t.x + (t.vx ?? 0) * lead + (i ? k.rng.float(-1.5, 1.5) : 0);
          const ty = t.y + (t.vy ?? 0) * lead + (i ? k.rng.float(-1.5, 1.5) : 0);
          k.lob(m, p.proj ?? 'lava_blob', tx, ty, {
            r: 1.2, mult: i ? 0.6 : 1, element: p.pool ? 'none' : 'ember',
            zone: p.pool ? { kind: 'ink', r: 1.6, dur: 5, dps: k.dmg(m, 0.45), status: { id: 'slow', dur: 1, power: 0.4 } } : { kind: 'fire', r: 0.9, dur: 2.5, dps: k.dmg(m, 0.2) },
          });
        }
      },
    });
  },
};
