// charger: walks in, telegraphs a line, charges along it hitting everything on the way, then recovers
// (open to punishment). `burrow: true` (Dune Maw) travels underground, surfaces under the target first.
import { STATE } from '../../../shared/protocol.js';

export default {
  id: 'charger',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    if (ai.charge) {
      const c = ai.charge;
      c.t += dt;
      k.move(m, Math.cos(c.a), Math.sin(c.a), (p.chargeSpeed ?? 6) / Math.max(0.1, m.data.speed));
      for (const pl of k.players(m, m.radius + 1)) {
        if (c.hit.includes(pl.id) || k.dist(m, pl) > m.radius + pl.radius + 0.2) continue;
        c.hit.push(pl.id);
        k.damage(pl, k.dmg(m, 1.2), { source: m, knock: 1.6, melee: true });
      }
      if (c.t >= c.dur || m.data.blocked) {
        ai.charge = null; k.stop(m);
        k.fx(m, 'hit_stone', { small: 1 });
        m.state = STATE.ACT;
        ai.recoverUntil = game.now + 0.8;   // dizzy after a charge
      }
      return;
    }
    if (ai.recoverUntil && game.now < ai.recoverUntil) { k.stop(m); return; }
    if (ai.recoverUntil) { ai.recoverUntil = 0; m.state = STATE.IDLE; }
    if (p.burrow && ai.under) {
      // underground approach: fast, untargetable
      if (!t) { ai.under = false; k.setIv(m, 0); m.data.untargetable = false; m.data.dmgMult = null; return; }
      k.toward(m, t.x, t.y, 1.4);
      if (k.dist(m, t) < 1.2 && !k.busy(m)) {
        const x = t.x, y = t.y;
        k.act(m, 'surface', {
          windup: 0.8, recover: 0.5, tg: { shape: 'circle', x, y, r: 1.6 },
          fire: (spec) => {
            ai.under = false; k.setIv(m, 0); m.data.untargetable = false; m.data.dmgMult = null;
            k.realm(m).move(m, x, y);
            k.fx(m, 'break_stone', { big: 1 });
            k.hit(m, spec, 1.1, { knock: 1.4, fx: false });
            k.cd(m, 'burrow', 8);
          },
        });
      }
      return;
    }
    if (!t || k.busy(m)) return;
    const d = k.dist(m, t);
    if (p.burrow && d > 4 && k.ready(m, 'burrow')) {
      ai.under = true; k.setIv(m, 3); m.data.untargetable = true; m.data.dmgMult = 0;
      k.fx(m, 'break_stone', { dust: 1 });
      return;
    }
    const reach = (p.chargeDist ?? 5);
    if (d > reach) { k.toward(m, t.x, t.y); return; }
    if (!k.ready(m)) {
      // short bite while charge cools down
      if (d < 1.3 + t.radius && k.ready(m, 'bite')) {
        k.act(m, 'bite', { windup: 0.4, recover: 0.3, cd: 1.2, cdKey: 'bite', tg: { shape: 'cone', x: m.x, y: m.y, r: 1.5, a: k.ang(m, t), arc: 90 }, fire: (s) => k.hit(m, s, 0.7) });
      } else k.toward(m, t.x, t.y, 0.6);
      return;
    }
    const a = k.ang(m, t);
    k.face(m, t.x, t.y);
    k.act(m, 'charge', {
      windup: p.windup ?? 0.6, recover: 0, cd: p.cd ?? 3,
      tg: { shape: 'line', x: m.x, y: m.y, a, len: reach + 1, w: m.radius * 2 + 0.6 },
      fire: () => { ai.charge = { a, t: 0, dur: (reach + 1) / (p.chargeSpeed ?? 6), hit: [] }; k.fx(m, 'footstep_dust', { burst: 1 }); },
    });
  },
};
