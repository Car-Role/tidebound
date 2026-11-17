// Camera: follow with 0.12 lerp (per 1/60 s), 1.5-tile mouse look-ahead, shake offset, clamp (DESIGN 3).

import { TILE } from '../../shared/config.js';
import { damp, clamp } from '../../shared/math.js';

const FOLLOW = 0.12;
const LOOK_AHEAD = 1.5;

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;            // centre in tiles
    this.zoom = 3;                     // integer screen pixels per source pixel
    this.viewW = 320; this.viewH = 180;   // internal resolution (source px)
    this.shakeX = 0; this.shakeY = 0;  // source px, set by juice
    this.worldW = 0; this.worldH = 0;  // tiles; 0 = no clamp
  }

  resize(screenW, screenH, zoom = this.zoom) {
    this.zoom = Math.max(1, Math.round(zoom));
    this.viewW = Math.ceil(screenW / this.zoom);
    this.viewH = Math.ceil(screenH / this.zoom);
  }

  snapTo(x, y) { this.x = x; this.y = y; }

  // target in tiles; aim in tiles (mouse world position) or null.
  follow(tx, ty, aim, dt) {
    let gx = tx, gy = ty;
    if (aim) {
      const dx = aim.x - tx, dy = aim.y - ty;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) { const k = Math.min(d / 6, 1) * LOOK_AHEAD / d; gx += dx * k; gy += dy * k; }
    }
    const a = damp(FOLLOW, dt);
    this.x += (gx - this.x) * a;
    this.y += (gy - this.y) * a;
    if (Math.abs(gx - this.x) > 20 || Math.abs(gy - this.y) > 20) this.snapTo(gx, gy);
    this.clamp();
  }

  clamp() {
    if (!this.worldW) return;
    const hw = this.viewW / TILE / 2, hh = this.viewH / TILE / 2;
    this.x = this.worldW * 1 <= hw * 2 ? this.worldW / 2 : clamp(this.x, hw, this.worldW - hw);
    this.y = this.worldH * 1 <= hh * 2 ? this.worldH / 2 : clamp(this.y, hh, this.worldH - hh);
  }

  // Top-left of the view in source pixels (integer), including shake. Writes into `view`.
  view(out) {
    out.x = Math.round(this.x * TILE - this.viewW / 2 + this.shakeX);
    out.y = Math.round(this.y * TILE - this.viewH / 2 + this.shakeY);
    out.w = this.viewW; out.h = this.viewH;
    return out;
  }

  screenToWorld(sx, sy, out = { x: 0, y: 0 }) {
    out.x = (this.x * TILE - this.viewW / 2 + sx / this.zoom) / TILE;
    out.y = (this.y * TILE - this.viewH / 2 + sy / this.zoom) / TILE;
    return out;
  }
}
