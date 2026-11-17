// beam_turret: charges a beam (line telegraph), then sweeps it `sweep` degrees, dealing `dps` along its length.
// `summons` (Abyss Eye): calls 2 of that enemy once at 50% HP.
export default {
  id: 'beam_turret',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.beam) {
      const B = ai.beam;
      B.t += dt;
      const a = B.a0 + B.dir * ((p.sweep ?? 90) * Math.PI / 180) * Math.min(1, B.t / B.dur);
      k.publishTg(m, { shape: 'line', x: m.x, y: m.y, a, len: 10, w: 0.9 }, 0);
      B.acc += dt;
      if (B.acc >= 0.2) {
        B.acc -= 0.2;
        const dps = (p.dps ?? m.data.dmg) * (m.data.dmg / Math.max(1, k.game.content.enemies.byId[m.kind]?.dmg ?? m.data.dmg));
        k.hit(m, { shape: 'line', x: m.x, y: m.y, a, len: 10, w: 0.9 }, (dps * 0.2) / Math.max(1, m.data.dmg), { knock: 0, fx: false, melee: false, element: 'none' });
        k.fx(m, 'boss_prismarch', { a: Math.round(a * 100) / 100, len: 10, beam: 1 });
      }
      ai.beamFacing = a;
      k.faceAngle(m, a);
      if (B.t >= B.dur) { ai.beam = null; m.set('tg', 0); k.cd(m, 'atk', 2.5); }
      return;
    }
    if (p.summons && !ai.summoned && m.hp <= m.maxHp * 0.5) {
      ai.summoned = true;
      k.cancelAct(m);
      for (let i = 0; i < 2; i++) {
        const s = k.spotNear(m, m.x, m.y, 1.5, 3);
        if (s) { k.spawn(m, p.summons, s.x, s.y, { noLoot: false }); k.fx(m, 'waystone_warp', { in: 1 }, s.x, s.y); }
      }
    }
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (d > 8) k.toward(m, t.x, t.y, 1);
    else if (d < 3) k.away(m, t.x, t.y, 0.7);
    else k.stop(m);
    if (!k.ready(m) || d > 10) return;
    const dir = k.rng.next() < 0.5 ? -1 : 1;
    const half = ((p.sweep ?? 90) * Math.PI / 180) / 2;
    const a0 = k.ang(m, t) - dir * half;
    k.act(m, 'charge', {
      windup: Math.max(0.6, p.charge ?? 1.2), recover: 0, cd: 6,
      tg: { shape: 'line', x: m.x, y: m.y, a: a0, len: 10, w: 0.9 },
      fire: () => { ai.beam = { a0, dir, t: 0, dur: 2, acc: 0 }; },
    });
  },
};
