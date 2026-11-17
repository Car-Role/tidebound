// kiter: holds `keepDist`, strafes, fires `proj` every `shotCd` (optional `fan`). Icicles chill.
export default {
  id: 'kiter',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t), keep = p.keepDist ?? 5;
    ai.strafe ??= k.rng.next() < 0.5 ? 1 : -1;
    if ((ai.flipAt ?? 0) <= game.now) { ai.flipAt = game.now + k.rng.float(1.5, 3); ai.strafe = -ai.strafe; }
    if (d < keep - 1) k.away(m, t.x, t.y, 1);
    else if (d > keep + 2) k.toward(m, t.x, t.y, 1);
    else k.orbit(m, t.x, t.y, keep, ai.strafe, 0.6);
    if (d > keep + 6 || !k.ready(m)) return;
    const fan = p.fan ?? 1;
    const a = k.ang(m, t);
    k.face(m, t.x, t.y);
    const icicle = p.proj === 'icicle';
    k.act(m, 'shoot', {
      windup: 0.45, recover: 0.25, cd: p.shotCd ?? 2, moveMul: 0,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 2, a, arc: fan > 1 ? 50 : 20 },
      track: () => ({ shape: 'cone', x: m.x, y: m.y, r: 2, a: k.ang(m, t), arc: fan > 1 ? 50 : 20 }),
      fire: (spec) => {
        const base = spec?.a ?? a;
        for (let i = 0; i < fan; i++) {
          const off = fan > 1 ? (i - (fan - 1) / 2) * 0.22 : 0;
          k.shoot(m, p.proj ?? 'seed', base + off, { speed: icicle ? 9 : 7, range: keep + 6, status: icicle ? { id: 'chill', dur: 2.5, power: 0.1 } : null });
        }
      },
    });
  },
};
