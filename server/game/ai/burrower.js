// burrower: digs under (untargetable), tunnels to the player, dust telegraph, erupts, then sits exposed.
import { STATE } from '../../../shared/protocol.js';

export default {
  id: 'burrower',
  init(game, m) { m.data.ai.phase = 'surface'; m.data.ai.phaseT = 1.5; },
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    ai.phaseT = (ai.phaseT ?? 0) - dt;
    if (k.busy(m)) return;
    if (ai.phase === 'under') {
      if (!t) { surface(m, k); return; }
      k.toward(m, t.x, t.y, 1.5);
      if (k.dist(m, t) < 0.8 || ai.phaseT <= 0) {
        const x = t.x, y = t.y;
        k.act(m, 'erupt', {
          windup: p.windup ?? 0.8, recover: 0.4, tg: { shape: 'circle', x, y, r: 1.3 },
          fire: (spec) => {
            k.realm(m).move(m, x, y);
            surface(m, k);
            k.fx(m, 'break_stone', { dust: 1 });
            k.hit(m, spec, 1, { knock: 1.0, fx: false });
            ai.phase = 'surface'; ai.phaseT = 2.2;
          },
        });
      }
      return;
    }
    // surfaced: nibble if close, then dive again
    if (!t) return;
    const d = k.dist(m, t);
    if (d < 1.2 + t.radius && k.ready(m, 'nip')) {
      k.act(m, 'nip', { windup: 0.4, recover: 0.3, cd: 1.2, cdKey: 'nip', tg: { shape: 'cone', x: m.x, y: m.y, r: 1.4, a: k.ang(m, t), arc: 90 }, fire: (s) => k.hit(m, s, 0.6) });
      return;
    }
    k.stop(m);
    if (ai.phaseT <= 0 && k.ready(m)) {
      k.cd(m, 'atk', p.cd ?? 4);
      ai.phase = 'under'; ai.phaseT = p.hideTime ?? 2;
      k.setIv(m, 3); m.data.untargetable = true; m.data.dmgMult = 0; m.state = STATE.IDLE;
      k.fx(m, 'break_stone', { dust: 1 });
    }
  },
};

function surface(m, k) {
  k.setIv(m, 0);
  m.data.untargetable = false;
  m.data.dmgMult = null;
  m.data.ai.phase = 'surface';
}
