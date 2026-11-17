// Entity interpolation buffer (TECH_SPEC 6.6): render remote entities at server time - 100 ms,
// linear interpolation between snapshots; a jump over 3 tiles snaps instead of sliding.

export const SNAP_DIST = 3;
const SIZE = 8;

export class InterpBuffer {
  constructor() {
    this.t = new Float64Array(SIZE);
    this.x = new Float64Array(SIZE);
    this.y = new Float64Array(SIZE);
    this.n = 0;          // samples held
    this.head = 0;       // index of the newest sample
  }

  clear() { this.n = 0; }

  push(t, x, y) {
    if (this.n > 0) {
      const lx = this.x[this.head], ly = this.y[this.head];
      if (Math.abs(x - lx) > SNAP_DIST || Math.abs(y - ly) > SNAP_DIST) this.n = 0;
      else if (t <= this.t[this.head]) { this.x[this.head] = x; this.y[this.head] = y; return; }
    }
    this.head = (this.head + 1) % SIZE;
    this.t[this.head] = t; this.x[this.head] = x; this.y[this.head] = y;
    if (this.n < SIZE) this.n++;
  }

  // Writes the interpolated position at time t into out {x, y}. Holds the oldest/newest sample outside the range.
  sample(t, out) {
    if (this.n === 0) return false;
    let newer = this.head;
    for (let k = 0; k < this.n; k++) {
      const i = (this.head - k + SIZE) % SIZE;
      if (this.t[i] <= t) {
        if (i === newer) { out.x = this.x[i]; out.y = this.y[i]; return true; }
        const span = this.t[newer] - this.t[i];
        const a = span > 0 ? (t - this.t[i]) / span : 1;
        out.x = this.x[i] + (this.x[newer] - this.x[i]) * a;
        out.y = this.y[i] + (this.y[newer] - this.y[i]) * a;
        return true;
      }
      newer = i;
    }
    out.x = this.x[newer]; out.y = this.y[newer];   // older than every sample
    return true;
  }
}
