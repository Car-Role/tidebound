// Chunk canvases (one per 20x20 chunk), autotile foam edges, animated water background and sunken-plot silhouettes.

import { CHUNK, PLOT, WORLD_PLOTS } from '../../shared/config.js';
import { T, isWater } from '../../shared/grid.js';
import { RAMPS, PAL } from '../art/palette.js';
import { TILE_PX } from '../art/tilegen.js';

const CHUNK_PX = CHUNK * TILE_PX;
const MAX_REBUILDS_PER_FRAME = 6;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export class Tilemap {
  constructor(store, tileset) {
    this.store = store;
    this.tiles = tileset;
    this.chunks = new Map();          // key -> { cx, cy, canvas, dirty }
    this.lowTide = false;
    this.waterPatterns = null;
    store.on('chunk', ({ cx, cy }) => this.markDirty(cx, cy, true));
    store.on('tiles', (list) => {
      for (const [tx, ty] of list) this.markDirty(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK), (tx % CHUNK === 0 || ty % CHUNK === 0 || tx % CHUNK === CHUNK - 1 || ty % CHUNK === CHUNK - 1));
    });
    store.on('realm', () => this.chunks.clear());
  }

  markDirty(cx, cy, neighbours = false) {
    const mark = (x, y) => {
      const c = this.chunks.get(x + ',' + y);
      if (c) c.dirty = true;
      else if (this.store.chunks.has(x + ',' + y)) this.chunks.set(x + ',' + y, { cx: x, cy: y, canvas: null, dirty: true });
    };
    mark(cx, cy);
    if (neighbours) { mark(cx + 1, cy); mark(cx - 1, cy); mark(cx, cy + 1); mark(cx, cy - 1); }
  }

  isWaterAt(g) {
    return g === T.DEEP || g === T.SHALLOW || (g === T.TIDAL && !this.lowTide);
  }

  rebuild(c) {
    c.canvas ||= makeCanvas(CHUNK_PX, CHUNK_PX);
    const ctx = c.canvas.getContext('2d');
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const s = this.store, ts = this.tiles;
    const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = x0 + lx, ty = y0 + ly;
        const g = s.groundAt(tx, ty);
        const px = lx * TILE_PX, py = ly * TILE_PX;
        if (g === T.DEEP || g === T.EMPTY) continue;
        if (g === T.SHALLOW) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = PAL[RAMPS.sea[4]];
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
          ctx.globalAlpha = 1;
          continue;
        }
        const variant = ts.variantAt(tx, ty);
        if (g === T.TIDAL && !this.lowTide) {        // submerged flat: turquoise shallows over sand
          ctx.globalAlpha = 0.25;
          ctx.drawImage(ts.ground[T.SAND][variant], px, py);
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = PAL[RAMPS.teal[3]];
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.drawImage((ts.ground[g] || ts.ground[T.EMPTY])[variant], px, py);
        if (isWater(g) && g !== T.TIDAL) continue;
        // foam lip on edges facing water
        const n = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (let d = 0; d < 4; d++) {
          const ng = s.groundAt(tx + n[d][0], ty + n[d][1]);
          if (ng !== T.EMPTY && this.isWaterAt(ng)) ctx.drawImage(ts.edges[d], px, py);
        }
      }
    }
    c.dirty = false;
  }

  // Background: deep water pattern scrolled with time, plus silhouettes of unraised plots.
  drawWater(ctx, view, time) {
    if (!this.waterPatterns) this.waterPatterns = this.tiles.water.map((w) => ctx.createPattern(w, 'repeat'));
    const frame = Math.floor(time * 1.6) % 2;
    const pat = this.waterPatterns[frame];
    const ox = Math.round(time * 3) % 64;
    ctx.save();
    const mx = (((view.x - ox) % 64) + 64) % 64, my = ((view.y % 64) + 64) % 64;
    ctx.translate(-mx - 64, -my - 64);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, view.w + 128, view.h + 128);
    ctx.restore();

    const plots = this.store.world.plots;
    if (!plots || this.store.realm.kind !== 'overworld') return;
    ctx.fillStyle = PAL[RAMPS.sea[0]];
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < plots.length; i++) {
      if (plots[i].owned) continue;
      const px = (i % WORLD_PLOTS) * PLOT * TILE_PX - view.x, py = Math.floor(i / WORLD_PLOTS) * PLOT * TILE_PX - view.y;
      if (px > view.w || py > view.h || px + PLOT * TILE_PX < 0 || py + PLOT * TILE_PX < 0) continue;
      const inset = 3 * TILE_PX, size = PLOT * TILE_PX - inset * 2;
      ctx.fillRect(px + inset + 8, py + inset, size - 16, size);
      ctx.fillRect(px + inset, py + inset + 8, size, size - 16);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx, view) {
    const low = !!this.store.world.clock?.low;
    if (low !== this.lowTide) {
      this.lowTide = low;
      for (const c of this.chunks.values()) c.dirty = true;
    }
    const cx0 = Math.floor(view.x / CHUNK_PX), cx1 = Math.floor((view.x + view.w) / CHUNK_PX);
    const cy0 = Math.floor(view.y / CHUNK_PX), cy1 = Math.floor((view.y + view.h) / CHUNK_PX);
    let budget = MAX_REBUILDS_PER_FRAME;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(cx + ',' + cy);
        if (!c) continue;
        if (c.dirty && (budget-- > 0 || !c.canvas)) this.rebuild(c);
        if (c.canvas) ctx.drawImage(c.canvas, cx * CHUNK_PX - view.x, cy * CHUNK_PX - view.y);
      }
    }
  }
}
