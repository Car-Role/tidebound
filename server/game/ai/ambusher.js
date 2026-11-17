// ambusher: disguised (reed clump) or invisible until a player comes within `revealDist` (or a lantern with
// reveal_ambushers is near, or it is hit), then bursts forward; the first strike from hiding hits harder.
export default {
  id: 'ambusher',
  selfIdle: true,
  init(game, m) {
    m.data.ai.hidden = true;
    m.data.ai.noTarget = true;
    m.set('iv', m.data.aiParams.disguise === 'invisible' ? 2 : 1);
  },
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.hidden) {
      k.stop(m);
      const reveal = p.revealDist ?? 2.5;
      for (const pl of k.players(m, 9)) {
        const player = game.players.get(pl.id);
        const lantern = player && game.stats.hasFlag(player, 'reveal_ambushers');
        if (k.dist(m, pl) <= reveal || (lantern && k.dist(m, pl) <= 7)) { unveil(game, m, k, pl); break; }
      }
      return;
    }
    if (!t || k.busy(m)) return;
    const burst = game.now < (ai.burstUntil ?? 0) ? (p.burst ?? 1.5) : 1;
    const d = k.dist(m, t);
    if (d > 1.4 + t.radius) { k.toward(m, t.x, t.y, burst); return; }
    k.stop(m);
    if (!k.ready(m)) return;
    const first = !ai.struck;
    k.act(m, 'strike', {
      windup: first ? 0.35 : 0.5, recover: 0.45, cd: 1.5,
      tg: { shape: 'cone', x: m.x, y: m.y, r: 1.8, a: k.ang(m, t), arc: 110 },
      fire: (s) => { ai.struck = true; k.hit(m, s, first ? 1.5 : 1, { knock: 0.8 }); },
    });
  },
  onHit(game, m, dealt, src, k) {
    if (m.data.ai.hidden) unveil(game, m, k, src);
  },
};

function unveil(game, m, k, target) {
  const ai = m.data.ai;
  ai.hidden = false;
  ai.noTarget = false;
  ai.burstUntil = game.now + 2;
  m.set('iv', 0);
  if (target?.type === 'player') ai.target = target.id;
  k.fx(m, m.data.aiParams.disguise === 'invisible' ? 'eclipse_motes' : 'break_plant', { reveal: 1 });
}
