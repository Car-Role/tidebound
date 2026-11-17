// lunger: telegraphed lunge; on contact it latches for `latchTime`, draining HP and healing itself.
// A dodge roll or a heavy hit shakes it off.
export default {
  id: 'lunger',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.latch) {
      const L = ai.latch;
      const tgt = k.realm(m).entities.get(L.id);
      const pl = tgt ? game.players.get(tgt.id) : null;
      L.t += dt;
      if (!tgt || tgt.hp <= 0 || L.t >= (p.latchTime ?? 2) || pl?.body?.dodgeT > 0 || L.shook) { release(m, k); return; }
      k.realm(m).move(m, tgt.x + Math.cos(L.a) * 0.5, tgt.y + Math.sin(L.a) * 0.5);
      L.acc += dt;
      if (L.acc >= 0.5) {
        L.acc -= 0.5;
        const dealt = k.damage(tgt, k.dmg(m, 0.25), { source: m, raw: false, melee: true });
        if (dealt > 0) {
          const heal = m.maxHp * (p.heal ?? 0.05);
          m.hp = Math.min(m.maxHp, m.hp + heal);
          k.fx(m, 'heal', { h: Math.round(heal), i: m.id });
          k.fx(m, 'hit_flesh', { b: 'teal' }, tgt.x, tgt.y);
        }
      }
      k.stop(m);
      return;
    }
    if (ai.lunge) {
      ai.lunge.t += dt;
      k.move(m, Math.cos(ai.lunge.a), Math.sin(ai.lunge.a), 9 / Math.max(0.1, m.data.speed));
      if (t && k.dist(m, t) < m.radius + t.radius + 0.25) {
        const dealt = k.damage(t, k.dmg(m), { source: m, knock: 0, melee: true });
        ai.lunge = null; k.stop(m);
        if (dealt > 0) { ai.latch = { id: t.id, t: 0, acc: 0, a: Math.atan2(m.y - t.y, m.x - t.x) }; k.fx(m, 'hit_flesh', { latch: 1 }); }
        return;
      }
      if (ai.lunge.t > ai.lunge.dur || m.data.blocked) { ai.lunge = null; k.stop(m); }
      return;
    }
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t), reach = p.lungeDist ?? 4;
    if (d > reach || !k.ready(m)) { k.toward(m, t.x, t.y, d > reach ? 1 : 0.5); return; }
    const a = k.ang(m, t);
    k.face(m, t.x, t.y);
    k.act(m, 'lunge', {
      windup: 0.55, recover: 0, cd: p.cd ?? 4,
      tg: { shape: 'line', x: m.x, y: m.y, a, len: reach + 0.5, w: 0.8 },
      fire: () => { ai.lunge = { a, t: 0, dur: (reach + 0.5) / 9 }; },
    });
  },
  onHit(game, m, dealt, src, k) {
    if (m.data.ai.latch && dealt >= m.maxHp * 0.1) m.data.ai.latch.shook = true;
  },
};

function release(m, k) {
  m.data.ai.latch = null;
  k.cd(m, 'atk', m.data.aiParams.cd ?? 4);
  const realm = k.realm(m);
  const a = k.rng.float(0, Math.PI * 2);
  const x = m.x + Math.cos(a) * 1.2, y = m.y + Math.sin(a) * 1.2;
  if (k.walkable(m, x, y)) realm.move(m, x, y);
}
