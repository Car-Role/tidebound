// illusionist: conjures 1-HP mirror clones that mimic it, then shuffles places with one of them.
export default {
  id: 'illusionist',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t || k.busy(m)) return;
    if (!m.data.clone && k.ready(m, 'clone') && k.dist(m, t) < 9) {
      k.act(m, 'mirror', {
        windup: 0.7, recover: 0.3, cd: p.cloneCd ?? 10, cdKey: 'clone',
        tg: { shape: 'circle', x: m.x, y: m.y, r: 1.4 },
        fire: () => {
          const spots = [];
          for (let i = 0; i < (p.clones ?? 2); i++) {
            const s = k.spotNear(m, m.x, m.y, 1.5, 3);
            if (!s) continue;
            const c = k.spawn(m, m.kind, s.x, s.y, { clone: true, noElite: true, hpAbs: 1, xpMult: 0, dmgMult: 0.25, scaleN: 1 });
            if (c) { c.data.xp = 0; c.data.ai.target = t.id; c.data.ai.cds = { clone: Infinity }; c.data.dieAt = game.now + 12; spots.push(c); }
          }
          k.fx(m, 'eclipse_motes', { mirror: 1 });
          // swap with a clone so the player has to find the real one
          const c = spots[Math.floor(k.rng.next() * spots.length)];
          if (c) { const x = m.x, y = m.y; k.realm(m).move(m, c.x, c.y); k.realm(c).move(c, x, y); }
        },
      });
      return;
    }
    if (m.data.clone && m.data.dieAt && game.now > m.data.dieAt) { k.damage(m, 10, { raw: true }); return; }
    const d = k.dist(m, t);
    if (d > 1.5 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    k.act(m, 'slash', {
      windup: 0.5, recover: 0.35, cd: 1.4,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 1.8, a: k.ang(m, t), arc: 110 },
      fire: (s) => k.hit(m, s, 1, { knock: 0.7 }),
    });
  },
};
