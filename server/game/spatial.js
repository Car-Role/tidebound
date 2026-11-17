// Uniform grid broadphase (cell = 4 tiles). Entities are bucketed by their position.

export const CELL = 4;

export class SpatialHash {
  constructor(w, h, cell = CELL) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.cells = new Map();
  }

  keyOf(x, y) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cols + cx;
  }

  insert(e) {
    const k = this.keyOf(e.x, e.y);
    e._cell = k;
    let set = this.cells.get(k);
    if (!set) { set = new Set(); this.cells.set(k, set); }
    set.add(e);
  }

  remove(e) {
    const set = this.cells.get(e._cell);
    if (set) { set.delete(e); if (set.size === 0) this.cells.delete(e._cell); }
    e._cell = -1;
  }

  update(e) {
    const k = this.keyOf(e.x, e.y);
    if (k === e._cell) return;
    this.remove(e);
    this.insert(e);
  }

  // Entities whose position lies within r of (x, y). Appends to `out` and returns it.
  query(x, y, r, out = [], filter = null) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.rows - 1, Math.floor((y + r) / c));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const set = this.cells.get(cy * this.cols + cx);
        if (!set) continue;
        for (const e of set) {
          const dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy <= r2 && (!filter || filter(e))) out.push(e);
        }
      }
    }
    return out;
  }

  // Entities whose position lies in the tile-space rectangle.
  queryRect(x, y, w, h, out = []) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor(x / c)), x1 = Math.min(this.cols - 1, Math.floor((x + w) / c));
    const y0 = Math.max(0, Math.floor(y / c)), y1 = Math.min(this.rows - 1, Math.floor((y + h) / c));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const set = this.cells.get(cy * this.cols + cx);
        if (!set) continue;
        for (const e of set) if (e.x >= x && e.y >= y && e.x < x + w && e.y < y + h) out.push(e);
      }
    }
    return out;
  }
}
