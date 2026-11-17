// shambler: lurches out of the water in groups and slams the ground in front of it.
export default {
  id: 'shambler',
  tick(game, m, dt, k, t) {
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (d > 1.5 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    const a = k.ang(m, t);
    const x = m.x + Math.cos(a) * 1.1, y = m.y + Math.sin(a) * 1.1;
    k.act(m, 'slam', {
      windup: 0.7, recover: 0.6, cd: 1.8,
      tg: { shape: 'circle', x, y, r: 1.25 },
      fire: (s) => { k.hit(m, s, 1, { knock: 1.0, fx: 'footstep_splash' }); },
    });
  },
};
