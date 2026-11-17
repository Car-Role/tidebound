// mimic (Refrain Knight): remembers the last ability cast within `copyRange` and answers with its echo:
// point/aoe -> slam at the caster, dir -> lance line, self -> shield itself, enemy -> homing bolt.
export default {
  id: 'mimic',
  tick(game, m, dt, k, t) {
    const ai = m.data.ai;
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    const copied = ai.copied && game.now - ai.copied.at < 20 ? ai.copied : null;
    if (copied && k.ready(m, 'echo')) {
      const target = copied.target ?? abilityTarget(game, copied.id);
      k.cd(m, 'echo', 7);
      k.fx(m, 'ability_cast', { mimic: 1, ab: copied.id });
      if (target === 'self' || target === 'ally_or_machine') {
        k.act(m, 'echo_guard', { windup: 0.6, recover: 0.3, tg: { shape: 'circle', x: m.x, y: m.y, r: 1.2 }, fire: () => k.applyStatus(m, 'shield', { duration: 5, power: m.maxHp * 0.15, source: m }) });
      } else if (target === 'dir') {
        const a = k.ang(m, t);
        k.act(m, 'echo_lance', { windup: 0.8, recover: 0.5, tg: { shape: 'line', x: m.x, y: m.y, a, len: 7, w: 1.4 }, fire: (s) => k.hit(m, s, 1.3, { knock: 1.5, element: 'tide' }) });
      } else if (target === 'enemy') {
        k.act(m, 'echo_bolt', { windup: 0.6, recover: 0.3, tg: { shape: 'circle', x: m.x, y: m.y, r: 1 }, fire: () => k.shoot(m, 'bog_orb', k.ang(m, t), { speed: 6, homing: 0.8, target: t, mult: 1.1 }) });
      } else {
        const x = t.x, y = t.y;
        k.act(m, 'echo_slam', { windup: 1.0, recover: 0.5, tg: { shape: 'circle', x, y, r: 2.6 }, fire: (s) => k.hit(m, s, 1.4, { knock: 1.5, fx: 'anchor_slam' }) });
      }
      return;
    }
    if (d > 1.7 + t.radius) { k.toward(m, t.x, t.y); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    k.act(m, 'refrain', {
      windup: 0.65, recover: 0.45, cd: 1.8,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 2.1, a: k.ang(m, t), arc: 130 },
      fire: (s) => k.hit(m, s, 1, { knock: 1.0, fx: 'hit_armor' }),
    });
  },
};

function abilityTarget(game, id) {
  return game.content.abilities?.byId?.[id]?.target ?? 'point';
}
