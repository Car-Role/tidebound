// Authoritative player movement: consumes queued `in` messages with the shared step() and acks them.
// Also tracks movement activity for the `player.active` event (net 4+ tiles within a rolling 10 s window).

import { step } from '../../../shared/rules/movement.js';
import { STATE, facingFromVector } from '../../../shared/protocol.js';
import { POS_QUANT } from '../../../shared/config.js';
import { T, FLAG } from '../../../shared/grid.js';

const MAX_BUDGET = 0.5;          // seconds of input a client may bank (absorbs network jitter)
const MAX_QUEUE = 30;
export const ACTIVE_WINDOW_S = 10;
export const ACTIVE_DIST = 4;

const LOCO_ANIMS = new Set(['idle', 'run', 'roll']);

function processInputs(game, player, dt) {
  const e = player.entity;
  const realm = game.realms.get(e.realm);
  if (e.state === STATE.DOWN || e.state === STATE.DEAD) {
    if (player.inputs.length) player.ack = player.inputs[player.inputs.length - 1].n;
    player.inputs.length = 0;
    e.vx = 0; e.vy = 0;
    return;
  }
  player.moveBudget = Math.min(player.moveBudget + dt, MAX_BUDGET);
  if (player.inputs.length > MAX_QUEUE) player.inputs.splice(0, player.inputs.length - MAX_QUEUE);
  const stats = game.stats.of(player);
  const b = player.body;
  b.x = e.x; b.y = e.y; b.vx = e.vx; b.vy = e.vy;
  // WP14 (WP6 need, BUILD_REVIEW P2-11): Shallows Walker (e12) makes shallow water (T.SHALLOW) walkable.
  const walkable = player.walkShallows > game.now
    ? (tx, ty) => realm.isWalkable(tx, ty) || (realm.groundAt(tx, ty) === T.SHALLOW && !realm.hasFlag(tx, ty, FLAG.SOLID))
    : realm.isWalkable;
  let processed = 0;
  while (player.inputs.length) {
    const inp = player.inputs[0];
    const sdt = inp.dt / 1000;
    if (sdt > player.moveBudget + 1e-6) break;
    player.inputs.shift();
    processed++;
    player.moveBudget -= sdt;
    step(b, inp, stats, sdt, walkable, realm.groundAt, e.radius);
    player.ack = inp.n;
    player.lastInput = inp;
    if (inp.ax != null && inp.ay != null) { player.aimX = inp.ax / POS_QUANT; player.aimY = inp.ay / POS_QUANT; }
  }
  if (processed) player.idleT = 0;
  else player.idleT = (player.idleT ?? 0) + dt;
  if (player.idleT > 0.3) { b.vx = 0; b.vy = 0; }       // client stopped sending (tab hidden): stand still
  e.vx = b.vx; e.vy = b.vy;
  if (b.x !== e.x || b.y !== e.y) realm.move(e, b.x, b.y);

  const speed = Math.hypot(e.vx, e.vy);
  const moving = speed > 0.3;
  let f = e.facing;
  if (player.aimX != null) f = facingFromVector(player.aimX - e.x, player.aimY - e.y, f);
  else if (moving) f = facingFromVector(e.vx, e.vy, f);
  e.facing = f;
  const dodging = b.dodgeT > 0;
  e.state = dodging ? STATE.DODGE : moving ? STATE.MOVE : STATE.IDLE;
  if (LOCO_ANIMS.has(e.pub.a)) e.set('a', dodging ? 'roll' : moving ? 'run' : 'idle');
}

function trackActivity(game, player) {
  const e = player.entity;
  const act = player.activity;
  act.samples.push([game.now, e.x, e.y]);
  while (act.samples.length && act.samples[0][0] < game.now - ACTIVE_WINDOW_S) act.samples.shift();
  for (const [, x, y] of act.samples) {
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy >= ACTIVE_DIST * ACTIVE_DIST) {
      game.markActive(player, 'move');
      return;
    }
  }
}

export default {
  name: 'movement',
  tick(game, dt) {
    for (const player of game.players.values()) if (player.entity) processInputs(game, player, dt);
  },
  slowTick(game) {
    for (const player of game.players.values()) if (player.entity) trackActivity(game, player);
  },
  onJoin(game, player) {
    player.activity.samples.length = 0;
  },
};
