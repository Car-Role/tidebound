// exploder: sprints at the player, stops, fuse (radius telegraph), detonates and dies (no loot if it blows).
export default {
  id: 'exploder',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams;
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (d > 1.4 + t.radius) { k.toward(m, t.x, t.y, 1); return; }
    k.stop(m);
    const r = p.radius ?? 2;
    k.act(m, 'fuse', {
      windup: p.fuse ?? 1, recover: 0,
      tg: { shape: 'circle', x: m.x, y: m.y, r },
      track: () => ({ shape: 'circle', x: m.x, y: m.y, r }),
      fire: () => {
        const spec = { shape: 'circle', x: m.x, y: m.y, r };
        k.hit(m, spec, 1, { knock: 1.8, fx: 'burn_explode', melee: false, element: 'ember' });
        m.data.noLoot = true;
        m.data.dmgBy = {};
        m.data.xp = 0;
        k.damage(m, m.hp + 1, { raw: true, quiet: true });
      },
    });
  },
};
