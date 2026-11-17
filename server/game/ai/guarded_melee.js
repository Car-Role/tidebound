// guarded_melee: armored front (frontBlock, applied by the damage pipeline), turns slowly so flanking works,
// side-steps around the player, then a telegraphed claw.
export default {
  id: 'guarded_melee',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t) return;
    // slow turning toward the target: the shell faces one way at a time
    const want = k.ang(m, t);
    ai.heading ??= want;
    let diff = want - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = 2.2 * dt;
    ai.heading += Math.max(-turn, Math.min(turn, diff));
    k.faceAngle(m, ai.heading);
    if (k.busy(m)) return;
    const d = k.dist(m, t), range = (p.range ?? 1.2) + t.radius;
    if (d > range + 0.4) {
      ai.side ??= 1;
      if ((ai.sideAt ?? 0) <= game.now) { ai.sideAt = game.now + 1.2; ai.side = -ai.side; }
      // crab walk: approach with a sideways component
      const px = -Math.sin(want) * ai.side, py = Math.cos(want) * ai.side;
      k.move(m, Math.cos(want) + px * 0.6, Math.sin(want) + py * 0.6, 1);
      return;
    }
    k.stop(m);
    if (!k.ready(m) || Math.abs(diff) > 0.9) return;
    k.act(m, 'claw', {
      windup: p.windup ?? 0.6, recover: 0.45, cd: p.cd ?? 1.6,
      tg: { shape: 'cone', x: m.x, y: m.y, r: range + 0.5, a: ai.heading, arc: 100 },
      fire: (s) => k.hit(m, s, 1, { knock: 0.9, fx: 'hit_armor' }),
    });
  },
};
