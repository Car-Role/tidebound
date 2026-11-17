// swarm: flutters in loose loops; drawn to light at night (lamps, campfires); darts in for quick touches.
export default {
  id: 'swarm',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    ai.phase = (ai.phase ?? k.rng.float(0, 6)) + dt * 3;
    if (!t) {
      if (p.lightSeek) {
        if ((ai.lightAt ?? 0) <= game.now) {
          ai.lightAt = game.now + 2;
          const lights = k.realm(m).query(m.x, m.y, 10, [], (e) => e.type === 'structure' && (e.kind === 'lamp' || e.kind === 'campfire'));
          ai.light = lights[0] ? { x: lights[0].x, y: lights[0].y } : null;
        }
        if (ai.light) { k.orbit(m, ai.light.x, ai.light.y, 1.5, 1, 0.5); return; }
      }
      return;
    }
    if (k.busy(m)) return;
    const d = k.dist(m, t);
    if (ai.dart) {
      k.toward(m, t.x, t.y, 1.6);
      if (k.touch(m, t, 1, { every: 1.0, knock: 0.3 }) > 0 || game.now > ai.dart) { ai.dart = 0; k.cd(m, 'atk', 1.4); }
      return;
    }
    if (d > 3) { k.move(m, t.x - m.x + Math.cos(ai.phase) * 2, t.y - m.y + Math.sin(ai.phase) * 2, 1); return; }
    k.orbit(m, t.x, t.y, 2.2, Math.sin(ai.phase * 0.3) > 0 ? 1 : -1, 0.8);
    if (k.ready(m)) {
      k.act(m, 'dart', { windup: 0.35, recover: 0, cd: 1.6, tg: { shape: 'line', x: m.x, y: m.y, a: k.ang(m, t), len: d + 0.5, w: 0.5 }, sfx: false, fire: () => { ai.dart = game.now + 0.6; } });
    }
  },
};
