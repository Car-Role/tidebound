// phaser: drifts through structures, burns on touch, and periodically phase-dashes along a telegraphed line.
export default {
  id: 'phaser',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    const status = p.touchStatus ? { id: p.touchStatus, dur: 3, power: k.dmg(m, 0.15) } : null;
    if (ai.dash) {
      ai.dash.t += dt;
      k.move(m, Math.cos(ai.dash.a), Math.sin(ai.dash.a), 3);
      for (const pl of k.players(m, 1.5)) k.touch(m, pl, 0.8, { every: 0.6, status, element: 'ember' });
      if (ai.dash.t > 0.5) ai.dash = null;
      return;
    }
    if (!t) return;
    k.touch(m, t, 0.6, { every: 0.8, status, element: 'ember' });
    if (k.busy(m)) return;
    const d = k.dist(m, t);
    if (d < 6 && k.ready(m, 'dash')) {
      const a = k.ang(m, t);
      k.act(m, 'phase_dash', { windup: 0.6, recover: 0.2, cd: 4, cdKey: 'dash', tg: { shape: 'line', x: m.x, y: m.y, a, len: 5, w: 1.1 }, fire: () => { ai.dash = { a, t: 0 }; } });
      return;
    }
    k.toward(m, t.x, t.y, 1);
  },
};
