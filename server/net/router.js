// Dispatch of validated client messages: hello -> join, in -> input queue, do -> system handlers, ping -> pong.

import { validateHello, validateInput, validateDo, validatePing } from '../../shared/protocol.js';

const MAX_PENDING_INPUTS = 60;

export function routeMessage(game, conn, msg) {
  const player = conn.player;
  switch (msg.t) {
    case 'hello': {
      if (player) return;
      const v = validateHello(msg);
      if (!v.ok) { conn.send({ t: 'reject', reason: v.reason }); conn.close(4001, v.reason); return; }
      const r = game.join(conn, v.hello);
      if (!r.ok) { conn.send({ t: 'reject', reason: r.reason }); conn.close(4002, r.reason); }
      return;
    }
    case 'ping': {
      const v = validatePing(msg);
      if (v) conn.send({ t: 'pong', c: v.c, s: Math.round(game.now * 1000) });
      return;
    }
    case 'in': {
      if (!player) return;
      const v = validateInput(msg);
      if (!v || v.n <= player.ack) return;
      if (player.inputs.length >= MAX_PENDING_INPUTS) player.inputs.shift();
      player.inputs.push(v);
      return;
    }
    case 'do': {
      if (!player) return;
      const v = validateDo(msg);
      if (!v) return;
      const res = v.unknown ? { ok: false, err: 'invalid' } : game.handleAction(player, v.a, v.d);
      const out = { t: 'res', n: v.n, ok: !!res.ok };
      if (!res.ok) out.err = res.err || 'invalid';
      if (res.d !== undefined) out.d = res.d;
      conn.send(out);
      return;
    }
    default:
      // unknown `t` is ignored (TECH_SPEC 6)
  }
}
