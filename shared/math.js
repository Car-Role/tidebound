export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const round5 = (v) => Math.round(v / 5) * 5;

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Move v toward target by at most step.
export function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

// Frame-rate independent exponential smoothing factor: `rate` is the fraction per 1/60 s.
export const damp = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

// Axis-aligned boxes as {x, y, w, h}.
export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function pointInRect(px, py, r) {
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}

// Distance from point to an axis-aligned rect (0 inside).
export function distToRect(px, py, x, y, w, h) {
  const cx = clamp(px, x, x + w), cy = clamp(py, y, y + h);
  return dist(px, py, cx, cy);
}
