// Local player prediction and reconciliation (TECH_SPEC 6.6).
// Every input sent to the server is also applied here with the same shared step(); on each snapshot the
// body is reset to the server state at `ack` and the still-unacknowledged inputs are replayed.

import { step, createBody, copyBody, LOCAL_BODY_KEYS } from '../../shared/rules/movement.js';
import { POS_QUANT } from '../../shared/config.js';

const MAX_PENDING = 120;
const AGREE_EPS = 0.05;        // tiles: below this the prediction is considered correct
const SMOOTH_LIMIT = 0.5;      // tiles: corrections under this are smoothed, larger ones snap
const SMOOTH_TIME = 0.1;       // seconds

export class Prediction {
  constructor({ isWalkable, groundAt = null }) {
    this.isWalkable = isWalkable;
    this.groundAt = groundAt;
    this.body = createBody();
    this.prev = { x: 0, y: 0 };
    this.pending = [];              // [{ n, mx, my, b, dt, after }]
    this.acked = null;              // record of the latest acknowledged input
    this.renderOffsetX = 0;
    this.renderOffsetY = 0;
    this.corrections = 0;
  }

  reset(x, y) {
    this.body = createBody(x, y);
    this.prev.x = x; this.prev.y = y;
    this.pending.length = 0;
    this.acked = null;
    this.renderOffsetX = this.renderOffsetY = 0;
  }

  // Apply one input locally (same dt as sent to the server).
  apply(input, stats) {
    this.prev.x = this.body.x; this.prev.y = this.body.y;
    step(this.body, input, stats, input.dt / 1000, this.isWalkable, this.groundAt);
    this.pending.push({ n: input.n, mx: input.mx, my: input.my, b: input.b, dt: input.dt, after: copyBody(this.body) });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  // me = [x, y, vx, vy] in wire units (x32); ack = last input processed by the server.
  reconcile(me, ack, stats) {
    while (this.pending.length && this.pending[0].n <= ack) this.acked = this.pending.shift();
    const sx = me[0] / POS_QUANT, sy = me[1] / POS_QUANT;
    const ref = this.acked && this.acked.n === ack ? this.acked.after : null;
    if (ref && Math.abs(ref.x - sx) < AGREE_EPS && Math.abs(ref.y - sy) < AGREE_EPS) return false;
    if (!ref && !this.pending.length && Math.abs(this.body.x - sx) < AGREE_EPS && Math.abs(this.body.y - sy) < AGREE_EPS) return false;

    const oldX = this.body.x, oldY = this.body.y;
    const b = createBody(sx, sy);
    b.vx = me[2] / POS_QUANT; b.vy = me[3] / POS_QUANT;
    const local = ref || this.body;
    for (const k of LOCAL_BODY_KEYS) b[k] = local[k];
    for (const p of this.pending) {
      step(b, p, stats, p.dt / 1000, this.isWalkable, this.groundAt);
      copyBody(b, p.after);
    }
    this.body = b;
    const dx = oldX - b.x, dy = oldY - b.y;
    this.prev.x -= dx; this.prev.y -= dy;
    if (Math.abs(dx) < SMOOTH_LIMIT && Math.abs(dy) < SMOOTH_LIMIT) {
      this.renderOffsetX += dx; this.renderOffsetY += dy;
    } else {
      this.renderOffsetX = this.renderOffsetY = 0;
      this.prev.x = b.x; this.prev.y = b.y;
    }
    this.corrections++;
    return true;
  }

  // Decay the visual correction offset; call once per frame.
  smooth(dt) {
    const k = Math.max(0, 1 - dt / SMOOTH_TIME);
    this.renderOffsetX *= k; this.renderOffsetY *= k;
    if (Math.abs(this.renderOffsetX) < 1e-3) this.renderOffsetX = 0;
    if (Math.abs(this.renderOffsetY) < 1e-3) this.renderOffsetY = 0;
  }

  // Render position between the previous and current step (alpha 0..1), plus smoothing offset.
  renderPos(alpha, out) {
    out.x = this.prev.x + (this.body.x - this.prev.x) * alpha + this.renderOffsetX;
    out.y = this.prev.y + (this.body.y - this.prev.y) * alpha + this.renderOffsetY;
    return out;
  }
}
