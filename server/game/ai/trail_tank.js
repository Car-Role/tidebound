// trail_tank: slow armored bruiser that leaves a trail (fire burns, ice chills) and bites; with `slamCd` it
// also ground-slams with radial ice spikes.
export default {
  id: 'trail_tank',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    // trail drops every ~0.8 tiles travelled
    ai.lx ??= m.x; ai.ly ??= m.y;
    if (Math.hypot(m.x - ai.lx, m.y - ai.ly) >= 0.8) {
      ai.lx = m.x; ai.ly = m.y;
      const ice = p.trail === 'ice';
      k.zone(m, {
        kind: ice ? 'frost' : 'fire', x: m.x, y: m.y, r: 0.7, dur: p.trailDur ?? 4, dps: ice ? 0 : k.dmg(m, 0.2), tick: 0.5,
        status: ice ? { id: 'chill', dur: 1.5, power: 0.1 } : { id: 'burn', dur: 2, power: k.dmg(m, 0.1) },
      });
    }
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (p.slamCd && k.ready(m, 'slam') && d < 3.5) {
      k.stop(m);
      k.act(m, 'slam', {
        windup: 1.0, recover: 0.7, cd: p.slamCd, cdKey: 'slam',
        tg: { shape: 'circle', x: m.x, y: m.y, r: 3 },
        fire: (s) => {
          k.hit(m, s, 1.2, { knock: 1.5, fx: 'freeze_shatter', status: { id: 'chill', dur: 2, power: 0.15 } });
          for (let i = 0; i < 8; i++) k.shoot(m, 'ice_spike', (i / 8) * Math.PI * 2, { speed: 7, range: 6, mult: 0.5 });
        },
      });
      return;
    }
    if (d > 1.5 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    k.act(m, 'bite', {
      windup: 0.7, recover: 0.5, cd: 1.8,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 1.9, a: k.ang(m, t), arc: 100 },
      fire: (s) => k.hit(m, s, 1, { knock: 1.2 }),
    });
  },
};
