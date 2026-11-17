// WP3 building toolkit: planks, masonry, roofs, posts, flames, glows, pipes and metal fittings for structures,
// machines and world landmarks. All helpers draw into a Px (gen/paint.js) with top-left lighting.

import { Px, R, INK, band, cyl } from './paint.js';

export const W = '#';

// Horizontal plank wall/floor (boards `bh` px tall) with nail dots and grain.
export function planks(p, x, y, w, h, ramp = R.brown, bh = 3, vertical = false) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = vertical ? i : j;
    const r = k % bh;
    const ch = r === 0 ? ramp[3] : r === bh - 1 ? ramp[1] : ramp[2];
    p.set(x + i, y + j, ch);
  }
  for (let j = 0; j < h; j += bh) for (let i = 2 + (j % 5); i < w - 1; i += 6) p.set(x + i + (vertical ? 0 : 0), y + j + 1, ramp[1]);
  return p;
}
// Masonry blocks (bw x bh) with mortar lines and a lit top edge per block.
export function masonry(p, x, y, w, h, ramp = R.stone, bw = 6, bh = 4, mortar = null) {
  const m = mortar ?? ramp[0];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const row = Math.floor(j / bh), off = row % 2 ? bw >> 1 : 0;
    const bx = (i + off) % bw, by = j % bh;
    let ch = bx === 0 || by === bh - 1 ? m : by === 0 ? ramp[3] : bx === 1 ? ramp[3] : ramp[2];
    if (ch === ramp[2] && ((i * 7 + j * 3) % 11 === 0)) ch = ramp[1];
    p.set(x + i, y + j, ch);
  }
  return p;
}
// Gable roof: triangle from (x, y+h) to apex, shingle rows.
export function gable(p, x, y, w, h, ramp = R.ember) {
  const cx = x + w / 2;
  p.poly([[x - 1, y + h], [cx, y], [x + w + 1, y + h]], (xx, yy) => {
    const row = (yy - y) % 3;
    const left = xx < cx;
    return row === 2 ? ramp[0] : left ? ramp[row === 0 ? 3 : 2] : ramp[row === 0 ? 2 : 1];
  });
  p.line(x - 1, y + h, cx, y, ramp[4]);
  return p;
}
// Flat sloped roof (shed) with shingles.
export function shedRoof(p, x, y, w, h, ramp = R.brown) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const row = j % 3;
    p.set(x + i, y + j, row === 2 ? ramp[0] : (i + (j >> 1) * 2) % 5 === 0 ? ramp[1] : ramp[row === 0 ? 3 : 2]);
  }
  p.hline(x, x + w - 1, y, ramp[4]);
  return p;
}
export function post(p, x, y0, y1, ramp = R.brown, w = 2) {
  for (let y = y0; y <= y1; y++) for (let i = 0; i < w; i++) p.set(x + i, y, cyl(ramp, w > 1 ? i / (w - 1) : 0.3));
  p.hline(x, x + w - 1, y0, ramp[4]);
  return p;
}
// Flame of height h rising from base (cx, by). frame shifts the flicker.
export function flame(p, cx, by, h, frame = 0, ramp = R.ember, core = R.gold) {
  const wob = [0, 1, -1, 0][frame % 4];
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const hw = Math.max(0, Math.round((1 - t) * (h * 0.38) + Math.sin(t * 3 + frame) * 0.6));
    const xo = Math.round(wob * t * 1.5);
    for (let i = -hw; i <= hw; i++) {
      const edge = Math.abs(i) === hw;
      const inner = Math.abs(i) < hw * 0.5 && t < 0.6;
      p.set(cx + i + xo, by - y, inner ? (t < 0.3 ? W : core[4]) : edge ? ramp[2] : t > 0.7 ? ramp[3] : ramp[4]);
    }
  }
  p.set(cx + wob, by - h, ramp[3]);
  return p;
}
// Soft radial glow made of dithered rings (only paints over transparent pixels when `under`).
export function glow(p, cx, cy, r, ramp, under = true) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    if (under && p.filled(x, y)) continue;
    if ((x + y) % 2 && d > 0.6) continue;
    p.set(x, y, d < 0.35 ? ramp[4] : d < 0.7 ? ramp[3] : ramp[2]);
  }
  return p;
}
// Metal band / bracket across a rect.
export function band2(p, x, y, w, ramp = R.stone) { p.hline(x, x + w - 1, y, ramp[3]); p.hline(x, x + w - 1, y + 1, ramp[1]); for (let i = x + 1; i < x + w; i += 4) p.set(i, y, ramp[4]); return p; }
export function rivets(p, pts, c = R.stone[4]) { for (const [x, y] of pts) p.set(x, y, c); return p; }
// Pipe from (x0,y0) to (x1,y1) (axis aligned), 2 px thick.
export function pipe(p, x0, y0, x1, y1, ramp = R.stone) {
  if (y0 === y1) { p.hline(x0, x1, y0, ramp[3]); p.hline(x0, x1, y0 + 1, ramp[1]); }
  else { p.vline(x0, y0, y1, ramp[3]); p.vline(x0 + 1, y0, y1, ramp[1]); }
  return p;
}
// Shaded box with a lighter top face (pseudo 3/4 view): front face h, top face th.
export function crate(p, x, y, w, h, th, ramp = R.brown, top = null) {
  const t = top ?? ramp;
  p.rect(x, y, w, th, (xx, yy, i, j) => (j === 0 ? t[4] : t[3]));
  p.rect(x, y + th, w, h, (xx, yy, i, j) => (i === 0 ? ramp[3] : i === w - 1 ? ramp[1] : j === h - 1 ? ramp[1] : ramp[2]));
  return p;
}
// Wooden crate with cross braces.
export function boxCrate(p, x, y, s, ramp = R.brown) {
  crate(p, x, y, s, s - 3, 3, ramp);
  p.line(x + 1, y + 4, x + s - 2, y + s - 2, ramp[1]); p.line(x + s - 2, y + 4, x + 1, y + s - 2, ramp[1]);
  p.box(x, y + 3, s, s - 3, ramp[1]);
  return p;
}
// Dithered ground shadow ellipse under a structure (ink, sparse) so buildings sit on the ground.
export function footShadow(p, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1 && !p.filled(x, y) && (x + y) % 2 === 0) p.put(x, y, R.ink[1]);
  }
  return p;
}
// Glyph in a 3x5-ish rune style, for stones, shrines and waystones.
export function rune(p, x, y, kind, c) {
  const G = {
    wave: [[0, 2], [1, 1], [2, 2], [3, 1], [4, 2], [0, 4], [1, 3], [2, 4], [3, 3], [4, 4]],
    eye: [[1, 1], [2, 0], [3, 1], [0, 2], [2, 2], [4, 2], [1, 3], [2, 4], [3, 3]],
    star: [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4], [1, 1], [3, 3]],
    moon: [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4], [3, 4], [3, 0]],
    card: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1], [0, 2], [1, 2], [3, 2], [0, 3], [3, 3], [0, 4], [1, 4], [2, 4], [3, 4]],
  };
  for (const [dx, dy] of G[kind] || G.star) p.set(x + dx, y + dy, c);
  return p;
}
export { Px, R, INK, band, cyl };
