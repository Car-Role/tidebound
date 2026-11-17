// Pixel-map parser, atlas, derived variants, placeholder (TECH_SPEC 9.2, 9.4).
// parseSprite/resolveDefs are pure (testable in Node); SpriteBank needs a canvas (browser).

import { CHAR_INDEX, RGBA, PALETTE_CHARS, RAMPS } from './palette.js';
import { textCanvas } from '../render/text.js';
import { hashString } from '../../shared/rng.js';

const OUTLINE_INDEX = CHAR_INDEX[RAMPS.ink[0]];
const WHITE_INDEX = CHAR_INDEX['#'];

const swapRows = (rows, swap) => rows.map((r) => (swap ? [...r].map((c) => swap[c] ?? c).join('') : r));

function swapDef(def, swap) {
  if (!swap) return def;
  const out = { ...def };
  if (def.px) out.px = swapRows(def.px, swap);
  if (def.frames) out.frames = def.frames.map((f) => swapRows(f, swap));
  if (def.anims) out.anims = Object.fromEntries(Object.entries(def.anims).map(([k, fr]) => [k, fr.map((f) => swapRows(f, swap))]));
  return out;
}

// Resolve `ref` + `swap` chains into standalone definitions. Unresolvable refs are dropped (placeholder at draw).
export function resolveDefs(defs) {
  const out = {};
  const resolving = new Set();
  const resolve = (id) => {
    if (out[id]) return out[id];
    const def = defs[id];
    if (!def || resolving.has(id)) return null;
    if (!def.ref) { out[id] = def; return def; }
    resolving.add(id);
    const base = resolve(def.ref);
    resolving.delete(id);
    if (!base) return null;
    const { ref, swap, ...rest } = def;
    out[id] = { ...swapDef(base, swap), ...rest };
    return out[id];
  };
  for (const id of Object.keys(defs)) resolve(id);
  return out;
}

function rowsToIndices(rows, w, h, id) {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const idx = CHAR_INDEX[row[x] ?? '.'];
      if (idx === undefined) throw new Error(`sprite ${id}: unknown palette char '${row[x]}'`);
      data[y * w + x] = idx;
    }
  }
  return data;
}

// Parse a resolved definition into palette-index frames: { w, h, fps, mirror, anchor, frames: { anim: Uint8Array[] } }
export function parseSprite(def, id = '?') {
  const w = def.w, h = def.h;
  if (!(w > 0 && h > 0)) throw new Error(`sprite ${id}: missing size`);
  const frames = {};
  if (def.px) frames.default = [rowsToIndices(def.px, w, h, id)];
  if (def.frames) frames.default = def.frames.map((f) => rowsToIndices(f, w, h, id));
  if (def.anims) for (const [k, list] of Object.entries(def.anims)) frames[k] = list.map((f) => rowsToIndices(f, w, h, id));
  const names = Object.keys(frames);
  if (!names.length) throw new Error(`sprite ${id}: no pixels`);
  return {
    w, h, fps: def.fps ?? 6, mirror: !!def.mirror,
    anchor: def.anchor ?? [w / 2, h],
    defaultAnim: frames.default ? 'default' : names[0],
    frames,
  };
}

// Derived pixel data (pure): outline adds a 1 px dark border (size w+2 x h+2).
export function deriveOutline(data, w, h) {
  const W = w + 2, H = h + 2;
  const out = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[y * w + x]) continue;
    for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) out[(y + dy) * W + x + dx] = OUTLINE_INDEX;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) out[(y + 1) * W + x + 1] = data[y * w + x];
  return out;
}
export const deriveFlat = (data, index) => data.map((v) => (v ? index : 0));

// ------------------------------------------------------------------ browser side

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function indicesToCanvas(data, w, h, tint = null) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (!p) continue;
    if (tint) { img.data.set(tint, i * 4); continue; }
    img.data[i * 4] = RGBA[p * 4]; img.data[i * 4 + 1] = RGBA[p * 4 + 1];
    img.data[i * 4 + 2] = RGBA[p * 4 + 2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const ATLAS_W = 1024;

export class SpriteBank {
  constructor() {
    this.entries = new Map();
    this.atlas = null;
    this.derived = new Map();
    this.placeholders = new Map();
    this.shadows = new Map();
    this.buildMs = 0;
  }

  // defs: merged sprite definition map. Packs every frame (and every palette variant) into one atlas.
  build(defs) {
    const t0 = performance.now();
    const resolved = resolveDefs(defs);
    const frames = [];
    for (const [id, def] of Object.entries(resolved)) {
      let parsed;
      try { parsed = parseSprite(def, id); } catch (err) { console.warn('[tb:sprites]', err.message); continue; }
      const variants = [parsed];
      for (const sw of def.variants ?? []) {
        try { variants.push(parseSprite(swapDef(def, sw), id)); } catch { /* skip bad variant */ }
      }
      const entry = { id, w: parsed.w, h: parsed.h, fps: parsed.fps, anchor: parsed.anchor, mirror: parsed.mirror, defaultAnim: parsed.defaultAnim, variants: [] };
      for (const v of variants) {
        const anims = {};
        for (const [name, list] of Object.entries(v.frames)) {
          anims[name] = list.map((data) => {
            const f = { data, x: 0, y: 0 };
            frames.push(f);
            return f;
          });
        }
        entry.variants.push(anims);
      }
      this.entries.set(id, entry);
    }
    // shelf packing
    let x = 0, y = 0, shelfH = 0;
    const items = [];
    for (const e of this.entries.values()) for (const anims of e.variants) for (const list of Object.values(anims)) for (const f of list) items.push([f, e.w, e.h]);
    items.sort((a, b) => b[2] - a[2]);
    for (const [f, w, h] of items) {
      if (x + w + 1 > ATLAS_W) { x = 0; y += shelfH + 1; shelfH = 0; }
      f.x = x; f.y = y;
      x += w + 1;
      shelfH = Math.max(shelfH, h);
    }
    const H = Math.max(1, y + shelfH);
    this.atlas = makeCanvas(ATLAS_W, H);
    const ctx = this.atlas.getContext('2d');
    const img = ctx.createImageData(ATLAS_W, H);
    for (const [f, w, h] of items) {
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const p = f.data[py * w + px];
        if (!p) continue;
        const o = ((f.y + py) * ATLAS_W + f.x + px) * 4;
        img.data[o] = RGBA[p * 4]; img.data[o + 1] = RGBA[p * 4 + 1]; img.data[o + 2] = RGBA[p * 4 + 2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.buildMs = performance.now() - t0;
    return this;
  }

  has(id) { return this.entries.has(id); }
  size(id) { const e = this.entries.get(id); return e ? { w: e.w, h: e.h } : { w: 16, h: 16 }; }
  anims(id) { const e = this.entries.get(id); return e ? Object.keys(e.variants[0]) : []; }

  frameOf(e, opts) {
    const anims = e.variants[opts.variant ?? 0] || e.variants[0];
    const list = anims[opts.anim] || anims[e.defaultAnim];
    const n = list.length;
    const i = opts.frame != null ? opts.frame % n : n > 1 ? Math.floor((opts.time ?? 0) * e.fps) % n : 0;
    return list[i];
  }

  /**
   * Draw sprite `id` with its anchor (default bottom-centre) at pixel (x, y).
   * opts: { anim, frame, time, flip, variant, scaleX, scaleY, alpha, flash, outline, silhouette (css colour) }
   */
  draw(ctx, id, x, y, opts = {}) {
    const e = this.entries.get(id);
    if (!e) { this.drawPlaceholder(ctx, id, x, y, opts); return; }
    const f = this.frameOf(e, opts);
    let src = this.atlas, sx = f.x, sy = f.y, w = e.w, h = e.h, ax = e.anchor[0], ay = e.anchor[1];
    if (opts.flash || opts.outline || opts.silhouette) {
      const kind = opts.flash ? 'flash' : opts.silhouette ? 'sil:' + opts.silhouette : 'outline';
      src = this.derivedCanvas(f, e, kind);
      sx = 0; sy = 0;
      if (kind === 'outline') { w += 2; h += 2; ax += 1; ay += 1; }
    }
    const sX = (opts.scaleX ?? 1) * (opts.flip ? -1 : 1), sY = opts.scaleY ?? 1;
    const alpha = opts.alpha ?? 1;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (sX === 1 && sY === 1) {
      ctx.drawImage(src, sx, sy, w, h, Math.round(x - ax), Math.round(y - ay), w, h);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(sX, sY);
      ctx.drawImage(src, sx, sy, w, h, -ax, -ay, w, h);
      ctx.restore();
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  derivedCanvas(f, e, kind) {
    let m = this.derived.get(f);
    if (!m) { m = new Map(); this.derived.set(f, m); }
    let c = m.get(kind);
    if (c) return c;
    if (kind === 'outline') c = indicesToCanvas(deriveOutline(f.data, e.w, e.h), e.w + 2, e.h + 2);
    else if (kind === 'flash') c = indicesToCanvas(deriveFlat(f.data, WHITE_INDEX), e.w, e.h);
    else {
      const hex = kind.slice(4);
      const rgba = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
      c = indicesToCanvas(f.data, e.w, e.h, rgba);
    }
    m.set(kind, c);
    return c;
  }

  // Small cached canvas of the first frame, for UI.
  icon(id, variant = 0) {
    const key = 'icon:' + id + ':' + variant;
    let c = this.placeholders.get(key);
    if (c) return c;
    const e = this.entries.get(id);
    if (!e) return this.placeholderCanvas(id);
    const f = this.frameOf(e, { variant, frame: 0 });
    c = indicesToCanvas(f.data, e.w, e.h);
    this.placeholders.set(key, c);
    return c;
  }

  placeholderCanvas(id) {
    let c = this.placeholders.get(id);
    if (c) return c;
    c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    const hue = hashString(id) % 360;
    ctx.fillStyle = `hsl(${hue} 45% 30%)`;
    ctx.fillRect(1, 0, 14, 16); ctx.fillRect(0, 1, 16, 14);
    ctx.fillStyle = `hsl(${hue} 55% 50%)`;
    ctx.fillRect(1, 1, 14, 14);
    const name = id.split('.').pop() || id;
    const label = (name[0] || '?').toUpperCase() + (name[1] || '');
    const t = textCanvas(label, '#ffffff', null);
    ctx.drawImage(t, Math.floor((16 - t.width) / 2), 4);
    this.placeholders.set(id, c);
    return c;
  }

  drawPlaceholder(ctx, id, x, y, opts = {}) {
    const c = this.placeholderCanvas(id);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(c, Math.round(x - 8), Math.round(y - 16));
    if (opts.alpha != null) ctx.globalAlpha = 1;
  }

  // Flattened ellipse shadow centred at (x, y), width w px.
  drawShadow(ctx, x, y, w = 10, alpha = 0.35) {
    w = Math.max(4, w | 0);
    let c = this.shadows.get(w);
    if (!c) {
      const h = Math.max(2, Math.round(w / 3));
      c = makeCanvas(w, h);
      const g = c.getContext('2d');
      g.fillStyle = '#0d0a14';
      for (let py = 0; py < h; py++) {
        const ny = (py + 0.5) / h * 2 - 1;
        const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - ny * ny)));
        g.fillRect(Math.round(w / 2 - half), py, half * 2, 1);
      }
      this.shadows.set(w, c);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
    ctx.globalAlpha = 1;
  }
}

export { PALETTE_CHARS };
