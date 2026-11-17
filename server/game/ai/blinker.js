// blinker: walks in, then blinks to the player's back and strikes after a short tell.
export default {
  id: 'blinker',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams;
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (k.ready(m, 'blink') && d < 9 && d > 1.2) {
      // behind = opposite the way the target faces (or moves)
      const f = (t.facing & 7) * (Math.PI / 4);
      const back = p.behind ? f + Math.PI : k.ang(t, m);
      const x = t.x + Math.cos(back) * 1.3, y = t.y + Math.sin(back) * 1.3;
      if (k.walkable(m, x, y)) {
        k.cd(m, 'blink', p.blinkCd ?? 5);
        k.blink(m, x, y);
        const a = Math.atan2(t.y - y, t.x - x);
        k.face(m, t.x, t.y);
        k.act(m, 'backstab', {
          windup: 0.45, recover: 0.5, tg: { shape: 'cone', x, y, r: 2, a, arc: 100 },
          track: () => ({ shape: 'cone', x: m.x, y: m.y, r: 2, a: k.ang(m, t), arc: 100 }),
          fire: (s) => k.hit(m, s, 1.2, { knock: 1.0, element: 'hollow' }),
        });
        return;
      }
    }
    if (d > 1.6 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    k.act(m, 'claw', { windup: 0.5, recover: 0.4, cd: 1.5, tg: { shape: 'cone', x: m.x, y: m.y, r: 1.8, a: k.ang(m, t), arc: 100 }, fire: (s) => k.hit(m, s, 0.9) });
  },
};
