// wave_rider (Tidewraith): rides a moving wave toward the player (immune while riding, the wave hurts on
// contact), crashes down at the end, and is only vulnerable for `vulnWindow` seconds afterwards.
export default {
  id: 'wave_rider',
  init(game, m) { ride(m, true); },
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.vulnUntil) {
      k.stop(m);
      if (game.now >= ai.vulnUntil) { ai.vulnUntil = 0; ride(m, true); }
      return;
    }
    if (!t || k.busy(m)) return;
    if (ai.wave) {
      const W = ai.wave;
      W.t += dt;
      k.move(m, Math.cos(W.a), Math.sin(W.a), (p.waveSpeed ?? 6) / Math.max(0.1, m.data.speed));
      for (const pl of k.players(m, 2)) {
        if (W.hit.includes(pl.id) || k.dist(m, pl) > 1.4) continue;
        W.hit.push(pl.id);
        k.damage(pl, k.dmg(m, 0.6), { source: m, knock: 2, element: 'tide' });
      }
      if (W.t >= W.dur || m.data.blocked) {
        ai.wave = null;
        const x = m.x + Math.cos(W.a) * 1.2, y = m.y + Math.sin(W.a) * 1.2;
        k.act(m, 'crash', {
          windup: 0.6, recover: 0, tg: { shape: 'circle', x, y, r: 2.4 },
          fire: (s) => {
            k.hit(m, s, 1, { knock: 2, fx: 'tide_wave', element: 'tide' });
            ride(m, false);
            ai.vulnUntil = game.now + (p.vulnWindow ?? 1.5) + 0.6;
          },
        });
      }
      return;
    }
    if (!k.ready(m)) { k.orbit(m, t.x, t.y, 6, 1, 0.6); return; }
    const a = k.ang(m, t);
    const len = Math.min(9, k.dist(m, t) + 1.5);
    k.act(m, 'surge', {
      windup: 0.7, recover: 0, cd: 3.5, tg: { shape: 'line', x: m.x, y: m.y, a, len, w: 2.2 },
      fire: () => { ai.wave = { a, t: 0, dur: len / (p.waveSpeed ?? 6), hit: [] }; k.fx(m, 'tidebreak_wave', { a: Math.round(a * 100) / 100 }); },
    });
  },
};

function ride(m, on) {
  m.data.dmgMult = on ? 0 : 1.5;
  if ((m.pub.iv ?? 0) !== (on ? 5 : 0)) m.set('iv', on ? 5 : 0);
}
