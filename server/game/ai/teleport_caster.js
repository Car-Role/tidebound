// teleport_caster: keeps its distance and fires slow homing orbs; blinks away when struck.
export default {
  id: 'teleport_caster',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    ai.bob = (ai.bob ?? 0) + dt;
    if (d < 4) k.away(m, t.x, t.y, 0.8);
    else if (d > 7) k.toward(m, t.x, t.y, 0.8);
    else k.orbit(m, t.x, t.y, 5.5, Math.sin(ai.bob * 0.7) > 0 ? 1 : -1, 0.5);
    if (d > 11 || !k.ready(m)) return;
    k.act(m, 'orb', {
      windup: 0.6, recover: 0.3, cd: p.shotCd ?? 2.5,
      tg: { shape: 'circle', x: m.x, y: m.y, r: 0.9 },
      fire: () => k.shoot(m, p.proj ?? 'bog_orb', k.ang(m, t), { speed: 4.2, range: 14, homing: p.homing ?? 0.5, target: t, radius: 0.35 }),
    });
  },
  onHit(game, m, dealt, src, k) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!p.blinkOnHit || game.now < (ai.blinkAt ?? 0) || m.hp <= 0) return;
    ai.blinkAt = game.now + 2.2;
    const from = src ?? m;
    const spot = k.spotNear(m, from.x, from.y, 4.5, 6.5);
    if (spot) { k.cancelAct(m); k.blink(m, spot.x, spot.y); }
  },
};
