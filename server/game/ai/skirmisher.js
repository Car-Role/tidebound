// skirmisher: fast zig-zag approach, quick tail stab, hops back out.
export default {
  id: 'skirmisher',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t || k.busy(m)) return;
    ai.z = (ai.z ?? 0) + dt * 4;
    const d = k.dist(m, t);
    if (ai.hopUntil && game.now < ai.hopUntil) { k.away(m, t.x, t.y, 1.2); return; }
    if (d > 1.7 + t.radius) {
      const a = k.ang(m, t);
      const zz = Math.sin(ai.z) * (p.zigzag ?? 1.5);
      k.move(m, Math.cos(a) - Math.sin(a) * zz, Math.sin(a) + Math.cos(a) * zz, 1);
      return;
    }
    if (!k.ready(m)) { k.away(m, t.x, t.y, 0.6); return; }
    const a = k.ang(m, t);
    k.act(m, 'stab', {
      windup: 0.38, recover: 0.2, cd: p.stabCd ?? 1.5,
      tg: { shape: 'line', x: m.x, y: m.y, a, len: 2.2, w: 0.8 },
      fire: (s) => { k.hit(m, s, 1, { knock: 0.6, fx: 'hit_armor' }); ai.hopUntil = game.now + 0.5; },
    });
  },
};
