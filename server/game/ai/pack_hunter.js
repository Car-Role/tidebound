// pack_hunter: packs spread around the target (flanking slots), lunge-bite, and howl to haste the pack.
export default {
  id: 'pack_hunter',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (!t || k.busy(m)) return;
    const pack = k.realm(m).query(m.x, m.y, 10, [], (o) => o.type === 'mob' && o.kind === m.kind && !o.removed);
    pack.sort((a, b) => a.id - b.id);
    const slot = Math.max(0, pack.indexOf(m));
    if (p.howlCd && k.ready(m, 'howl') && slot === 0 && k.dist(m, t) < 9) {
      k.act(m, 'howl', {
        windup: 0.8, recover: 0.3, cd: p.howlCd, cdKey: 'howl', tg: { shape: 'circle', x: m.x, y: m.y, r: 8 },
        fire: () => {
          for (const o of pack) k.applyStatus(o, 'haste', { duration: 6, power: 0.2, source: m });
          k.fx(m, 'rally_horn', { howl: 1, r: 8 });
        },
      });
      return;
    }
    const d = k.dist(m, t);
    if (d > 2.4 + t.radius || !k.ready(m)) {
      if (p.flank && pack.length > 1) {
        const base = Math.atan2(m.y - t.y, m.x - t.x);
        const want = (slot / pack.length) * Math.PI * 2 + (ai.offs ??= k.rng.float(0, 1));
        const ring = d > 4 ? 2.6 : 2.0;
        const tx = t.x + Math.cos(want + base * 0.1) * ring, ty = t.y + Math.sin(want + base * 0.1) * ring;
        k.toward(m, tx, ty, 1);
      } else k.toward(m, t.x, t.y, 1);
      return;
    }
    const a = k.ang(m, t);
    k.act(m, 'lunge_bite', {
      windup: 0.45, recover: 0.4, cd: 1.6,
      tg: { shape: 'line', x: m.x, y: m.y, a, len: 2.8, w: 1 },
      fire: (s) => { k.realm(m).move(m, m.x + Math.cos(a) * 1, m.y + Math.sin(a) * 1); k.hit(m, s, 1, { knock: 0.8 }); },
    });
  },
};
