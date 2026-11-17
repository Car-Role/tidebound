// diver: circles at `circleDist`, then dive-bombs along a telegraphed line through the target.
// `fromOffscreen` (Stillwing): stays hidden high above until its shadow telegraph appears.
export default {
  id: 'diver',
  init(game, m) { if (m.data.aiParams.fromOffscreen) m.set('iv', 4); },
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.dive) {
      const D = ai.dive;
      D.t += dt;
      k.move(m, Math.cos(D.a), Math.sin(D.a), 12 / Math.max(0.1, m.data.speed));
      for (const pl of k.players(m, m.radius + 1)) {
        if (D.hit.includes(pl.id) || k.dist(m, pl) > m.radius + pl.radius + 0.3) continue;
        D.hit.push(pl.id);
        k.damage(pl, k.dmg(m), { source: m, knock: 1.4, melee: true });
      }
      if (D.t >= D.dur) { ai.dive = null; k.stop(m); if (p.fromOffscreen) m.set('iv', 4); }
      return;
    }
    if (!t || k.busy(m)) return;
    ai.dir ??= 1;
    k.orbit(m, t.x, t.y, p.circleDist ?? 5, ai.dir, 1);
    if (!k.ready(m) || k.dist(m, t) > (p.circleDist ?? 5) + 3) return;
    const len = p.lineLen ?? 7;
    const a = k.ang(m, t);
    const sx = t.x - Math.cos(a) * len / 2, sy = t.y - Math.sin(a) * len / 2;
    k.act(m, 'dive', {
      windup: 0.9, recover: 0.3, cd: p.diveCd ?? 4,
      tg: { shape: 'line', x: sx, y: sy, a, len, w: 1.1 },
      fire: () => {
        if (k.walkable(m, sx, sy)) k.realm(m).move(m, sx, sy);
        if (p.fromOffscreen) m.set('iv', 0);
        ai.dive = { a, t: 0, dur: len / 12, hit: [] };
        ai.dir = -ai.dir;
        k.fx(m, 'whoosh', { a: Math.round(a * 100) / 100 });
      },
    });
  },
};
