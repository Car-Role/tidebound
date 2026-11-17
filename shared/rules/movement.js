// Deterministic movement step shared by the server and client prediction (TECH_SPEC 6.6).
// Both sides must call step() with identical (body, input, stats, dt) to stay in lockstep.

import {
  BASE_MOVE_SPEED, MOVE_ACCEL, MOVE_FRICTION, DODGE_SPEED, DODGE_TIME, DODGE_RECHARGE_S, PLAYER_RADIUS,
} from '../config.js';
import { BUTTON } from '../protocol.js';
import { groundSpeedMul, groundGrip } from '../grid.js';

const MAX_SUBSTEP = 0.25; // tiles per collision sub-step
const EPS = 1e-6;         // touching (not overlapping) a blocked tile along the other axis is not a hit

export function createBody(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0, dodgeT: 0, ddx: 0, ddy: 1, charges: 2, rechargeT: 0, fx: 0, fy: 1 };
}

// Fields that are not on the wire (`me` carries only x, y, vx, vy); prediction restores these from its own record.
export const LOCAL_BODY_KEYS = Object.freeze(['dodgeT', 'ddx', 'ddy', 'charges', 'rechargeT', 'fx', 'fy']);

export function copyBody(src, dst = {}) {
  dst.x = src.x; dst.y = src.y; dst.vx = src.vx; dst.vy = src.vy;
  for (const k of LOCAL_BODY_KEYS) dst[k] = src[k];
  return dst;
}

// Sheet `moveSpeed` is a fraction over BASE_MOVE_SPEED, capped by the statbook at 0.8.
export function maxSpeed(stats) {
  const f = stats && Number.isFinite(stats.moveSpeed) ? stats.moveSpeed : 0;
  return BASE_MOVE_SPEED * Math.max(0.1, 1 + f);
}

/**
 * Advance a body by dt seconds.
 * @param body   {x, y, vx, vy, dodgeT, ddx, ddy, charges, rechargeT, fx, fy} (mutated)
 * @param input  {mx, my, b}
 * @param stats  player stat sheet (moveSpeed, dodgeCharges, dodgeRecharge) or null for defaults
 * @param isWalkable (tx, ty) => boolean
 * @param groundAt optional (tx, ty) => ground id, for speed/grip modifiers
 */
export function step(body, input, stats, dt, isWalkable, groundAt = null, radius = PLAYER_RADIUS) {
  if (!(dt > 0)) return body;
  const b = body;

  // dodge charges
  const maxCharges = Math.max(0, Math.round(stats?.dodgeCharges ?? 2));
  const recharge = DODGE_RECHARGE_S * Math.max(0.1, 1 + (stats?.dodgeRecharge ?? 0));
  if (b.charges >= maxCharges) { b.charges = maxCharges; b.rechargeT = 0; }
  else {
    b.rechargeT += dt;
    while (b.rechargeT >= recharge && b.charges < maxCharges) { b.rechargeT -= recharge; b.charges++; }
  }

  let mx = input.mx || 0, my = input.my || 0;
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (ml > 0.01) { const fl = Math.sqrt(mx * mx + my * my); b.fx = mx / fl; b.fy = my / fl; }

  if ((input.b & BUTTON.DODGE) && b.dodgeT <= 0 && b.charges >= 1) {
    b.charges -= 1;
    b.dodgeT = DODGE_TIME;
    const fl = Math.sqrt(b.fx * b.fx + b.fy * b.fy) || 1;
    b.ddx = b.fx / fl; b.ddy = b.fy / fl;
  }

  if (b.dodgeT > 0) {
    b.vx = b.ddx * DODGE_SPEED;
    b.vy = b.ddy * DODGE_SPEED;
    b.dodgeT = Math.max(0, b.dodgeT - dt);
  } else {
    const g = groundAt ? groundAt(Math.floor(b.x), Math.floor(b.y)) : -1;
    const spd = maxSpeed(stats) * groundSpeedMul(g);
    const grip = groundGrip(g);
    const tx = mx * spd, ty = my * spd;
    const dvx = tx - b.vx, dvy = ty - b.vy;
    const dl = Math.sqrt(dvx * dvx + dvy * dvy);
    const rate = (ml > 0.01 ? MOVE_ACCEL : MOVE_FRICTION) * grip * dt;
    if (dl <= rate) { b.vx = tx; b.vy = ty; }
    else { b.vx += (dvx / dl) * rate; b.vy += (dvy / dl) * rate; }
  }

  const dx = b.vx * dt, dy = b.vy * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_SUBSTEP));
  for (let i = 0; i < n; i++) {
    b.x += dx / n;
    resolveAxis(b, radius, isWalkable, true);
    b.y += dy / n;
    resolveAxis(b, radius, isWalkable, false);
  }
  return b;
}

// Circle-vs-tile resolution along one axis: push the circle out of every blocked tile it overlaps.
function resolveAxis(b, r, isWalkable, alongX) {
  const minTx = Math.floor(b.x - r), maxTx = Math.floor(b.x + r);
  const minTy = Math.floor(b.y - r), maxTy = Math.floor(b.y + r);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isWalkable(tx, ty)) continue;
      if (alongX) {
        const cy = b.y < ty ? ty : b.y > ty + 1 ? ty + 1 : b.y;
        const oy = b.y - cy;
        if (Math.abs(oy) >= r - EPS) continue;
        const gap = Math.sqrt(r * r - oy * oy);
        const left = b.vx > 0 || (b.vx === 0 && b.x < tx + 0.5);
        if (left) { const lim = tx - gap; if (b.x > lim) { b.x = lim; if (b.vx > 0) b.vx = 0; } }
        else { const lim = tx + 1 + gap; if (b.x < lim) { b.x = lim; if (b.vx < 0) b.vx = 0; } }
      } else {
        const cx = b.x < tx ? tx : b.x > tx + 1 ? tx + 1 : b.x;
        const ox = b.x - cx;
        if (Math.abs(ox) >= r - EPS) continue;
        const gap = Math.sqrt(r * r - ox * ox);
        const up = b.vy > 0 || (b.vy === 0 && b.y < ty + 0.5);
        if (up) { const lim = ty - gap; if (b.y > lim) { b.y = lim; if (b.vy > 0) b.vy = 0; } }
        else { const lim = ty + 1 + gap; if (b.y < lim) { b.y = lim; if (b.vy < 0) b.vy = 0; } }
      }
    }
  }
}
