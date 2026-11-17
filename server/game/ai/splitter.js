// splitter: heavy melee; on death it shatters into `count` smaller `into` enemies.
export default {
  id: 'splitter',
  tick(game, m, dt, k, t) {
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (d > 1.5 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    k.act(m, 'smash', {
      windup: 0.65, recover: 0.5, cd: 1.7,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 1.9, a: k.ang(m, t), arc: 120 },
      fire: (s) => k.hit(m, s, 1, { knock: 1.0, fx: 'hit_armor' }),
    });
  },
  onDeath(game, m, k) {
    if (m.data.clone) return;
    const p = m.data.aiParams;
    k.fx(m, 'break_crystal', { big: 1 });
    for (let i = 0; i < (p.count ?? 3); i++) {
      const a = (i / (p.count ?? 3)) * Math.PI * 2;
      const x = m.x + Math.cos(a) * 0.7, y = m.y + Math.sin(a) * 0.7;
      const s = k.spawn(m, p.into ?? 'glass_shard', k.walkable(m, x, y) ? x : m.x, k.walkable(m, x, y) ? y : m.y, {
        noLoot: true, noElite: true, natural: m.data.natural, plotIdx: m.data.plotIdx, hpMult: Math.max(1, m.data.trench ? 1.5 : 1),
      });
      if (s) { s.data.ai.target = m.data.ai.target; s.data.xp = Math.round((m.data.xp ?? 0) * 0.1); }
    }
  },
};
