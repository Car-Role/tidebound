// Headless test harness (TECH_SPEC 13): a real Game with fake clients, no sockets, no timers.

import { TICK_DT, POS_QUANT } from '../shared/config.js';
import { PROTOCOL_VERSION, BUTTON } from '../shared/protocol.js';
import { content as defaultContent } from '../shared/data/index.js';
import { Game } from '../server/game/game.js';
import { routeMessage } from '../server/net/router.js';
import { raisePlot } from '../server/game/worldgen/index.js';

export class FakeConnection {
  constructor({ loopback = true } = {}) {
    this.messages = [];
    this.loopback = loopback;
    this.remoteAddress = loopback ? '127.0.0.1' : '10.0.0.2';
    this.player = null;
    this.closed = false;
  }
  // Messages are deep-copied so later mutation of live server objects does not rewrite history.
  send(msg) { if (!this.closed) this.messages.push(JSON.parse(JSON.stringify(msg))); }
  close() { this.closed = true; }
}

export async function createHarness({ seed = 1, players = 1, content = defaultContent, systems, save = null } = {}) {
  const game = new Game({ seed, content, systems });
  await game.init(save);
  const conns = [];
  let reqId = 0;

  const h = {
    game,
    conns,

    addPlayer({ name, color = 0, token, loopback = true } = {}) {
      const i = conns.length;
      const conn = new FakeConnection({ loopback });
      conn.seq = 0;
      conn.held = null;
      routeMessage(game, conn, { t: 'hello', v: PROTOCOL_VERSION, token: token ?? `test-token-${seed}-${i}`, name: name ?? `Tester${i}`, color });
      if (!conn.player) throw new Error(`join rejected: ${JSON.stringify(conn.messages.at(-1))}`);
      conns.push(conn);
      return conn.player;
    },

    player(i) { return conns[i]?.player; },
    connOf(p) { return conns.find((c) => c.player === p); },

    leave(p) {
      const c = h.connOf(p);
      game.leave(p);
      if (c) { c.closed = true; conns.splice(conns.indexOf(c), 1); }
    },

    // Sends a `do` and returns the matching `res` message.
    do(p, a, d = {}) {
      const c = h.connOf(p);
      const n = ++reqId;
      routeMessage(game, c, { t: 'do', n, a, d });
      return c.messages.findLast((m) => m.t === 'res' && m.n === n);
    },

    // Holds an input until changed; h.step() sends one `in` per tick. A dodge bit fires once.
    input(p, inp = {}) {
      const c = h.connOf(p);
      c.held = { mx: inp.mx ?? 0, my: inp.my ?? 0, b: inp.b ?? 0, ax: inp.ax, ay: inp.ay };
    },

    step(seconds = TICK_DT) {
      const ticks = Math.max(1, Math.round(seconds / TICK_DT));
      for (let i = 0; i < ticks; i++) {
        for (const c of conns) {
          if (!c.held || !c.player) continue;
          const m = { t: 'in', n: ++c.seq, mx: c.held.mx, my: c.held.my, b: c.held.b, dt: TICK_DT * 1000 };
          if (c.held.ax != null) { m.ax = Math.round(c.held.ax * POS_QUANT); m.ay = Math.round(c.held.ay * POS_QUANT); }
          routeMessage(game, c, m);
          c.held.b &= ~BUTTON.DODGE;
        }
        game.tick(TICK_DT);
      }
    },

    give(p, item, qty) { return game.call('giveItem', p, item, qty); },

    setLevel(p, level) {
      p.level = level;
      p.entity?.set('lv', level);
      game.stats.invalidate(p);
    },

    raise(px, py) { return raisePlot(game, px, py); },

    // Last message of type t (and key k for self/world), or undefined.
    sent(p, t, k) {
      const c = h.connOf(p);
      return c.messages.findLast((m) => m.t === t && (k === undefined || m.k === k));
    },
    messages(p, t) { const c = h.connOf(p); return t ? c.messages.filter((m) => m.t === t) : c.messages; },
    clear(p) { const c = h.connOf(p); c.messages.length = 0; },

    // Serialise and boot a fresh harness from the save (same content/systems), with no players connected.
    async reload() {
      const data = JSON.parse(JSON.stringify(game.serialize()));
      return createHarness({ seed, players: 0, content, systems, save: data });
    },
  };

  for (let i = 0; i < players; i++) h.addPlayer();
  return h;
}
