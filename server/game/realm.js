// Realm: tile layers, entity store, spatial hash, chunk serialisation (TECH_SPEC 5.3).

import { CHUNK } from '../../shared/config.js';
import { T, FLAG, isGroundWalkable } from '../../shared/grid.js';
import { SpatialHash } from './spatial.js';

// Flags that belong to the tile (saved in tilePatches). SOLID and OWNED are derived on load.
export const PERSIST_FLAGS = FLAG.NO_SPAWN | FLAG.LIT | FLAG.WATERED;

// Base64 of a byte array. Node has Buffer; the browser-hosted server (client/net/host.js) uses btoa.
export function toBase64Browser(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export const toBase64 = typeof Buffer !== 'undefined' ? (u8) => Buffer.from(u8).toString('base64') : toBase64Browser;

export class Realm {
  constructor({ id, w, h, kind = 'overworld', fill = T.DEEP }) {
    this.id = id;
    this.w = w;
    this.h = h;
    this.kind = kind;
    this.ground = new Uint8Array(w * h).fill(fill);
    this.flags = new Uint8Array(w * h);
    this.entities = new Map();
    this.spatial = new SpatialHash(w, h);
    this.lowTide = false;           // set by the clock system (WP7); gates TIDAL walkability
    this.patches = new Map();       // idx -> [tx, ty, ground, flags] tile edits made after generation
    this.tileEvents = [];           // [tx, ty, ground, flags] pending for clients this tick
    this.dirtyChunks = new Set();   // chunk keys to resend wholesale
    this.removedIds = [];           // entity ids removed this tick
    this.isWalkable = this.isWalkable.bind(this);
    this.groundAt = this.groundAt.bind(this);
  }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  idx(tx, ty) { return ty * this.w + tx; }

  groundAt(tx, ty) { return this.inBounds(tx, ty) ? this.ground[ty * this.w + tx] : T.EMPTY; }
  flagsAt(tx, ty) { return this.inBounds(tx, ty) ? this.flags[ty * this.w + tx] : 0; }
  hasFlag(tx, ty, bit) { return (this.flagsAt(tx, ty) & bit) !== 0; }

  isWalkable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    const i = ty * this.w + tx;
    return isGroundWalkable(this.ground[i], this.lowTide) && (this.flags[i] & FLAG.SOLID) === 0;
  }

  // Generation-time write: no patch, no network event.
  stamp(tx, ty, g, f = null) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    this.ground[i] = g;
    if (f != null) this.flags[i] = f;
  }

  // Gameplay write: recorded as a persistent patch and sent to clients as a `tiles` entry.
  setGround(tx, ty, g, { persist = true } = {}) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    if (this.ground[i] === g) return;
    this.ground[i] = g;
    if (persist) this.patches.set(i, [tx, ty, g, this.flags[i] & PERSIST_FLAGS]);
    this.tileEvents.push([tx, ty, g, this.flags[i]]);
  }

  setFlag(tx, ty, bit, on) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    const nf = on ? this.flags[i] | bit : this.flags[i] & ~bit;
    if (nf === this.flags[i]) return;
    this.flags[i] = nf;
    if (bit & PERSIST_FLAGS) this.patches.set(i, [tx, ty, this.ground[i], nf & PERSIST_FLAGS]);
    this.tileEvents.push([tx, ty, this.ground[i], nf]);
  }

  applyPatch([tx, ty, g, f]) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    this.ground[i] = g;
    this.flags[i] = (this.flags[i] & ~PERSIST_FLAGS) | (f & PERSIST_FLAGS);
    this.patches.set(i, [tx, ty, g, f & PERSIST_FLAGS]);
  }

  markChunkDirty(cx, cy) { this.dirtyChunks.add(cx + ',' + cy); }

  get chunksX() { return Math.ceil(this.w / CHUNK); }
  get chunksY() { return Math.ceil(this.h / CHUNK); }

  chunkBytes(cx, cy) {
    const g = new Uint8Array(CHUNK * CHUNK).fill(T.EMPTY);
    const f = new Uint8Array(CHUNK * CHUNK);
    for (let y = 0; y < CHUNK; y++) {
      const ty = cy * CHUNK + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < CHUNK; x++) {
        const tx = cx * CHUNK + x;
        if (tx < 0 || tx >= this.w) continue;
        g[y * CHUNK + x] = this.ground[ty * this.w + tx];
        f[y * CHUNK + x] = this.flags[ty * this.w + tx];
      }
    }
    return { g, f };
  }

  chunkMessage(cx, cy) {
    const { g, f } = this.chunkBytes(cx, cy);
    return { t: 'chunk', realm: this.id, cx, cy, g: toBase64(g), f: toBase64(f) };
  }

  // ---- entities ----
  add(e) {
    e.realm = this.id;
    e.removed = false;
    this.entities.set(e.id, e);
    this.spatial.insert(e);
    return e;
  }

  remove(e) {
    if (!this.entities.has(e.id)) return;
    this.entities.delete(e.id);
    this.spatial.remove(e);
    e.removed = true;
    this.removedIds.push(e.id);
  }

  move(e, x, y) {
    e.x = x; e.y = y;
    this.spatial.update(e);
  }

  query(x, y, r, out = [], filter = null) { return this.spatial.query(x, y, r, out, filter); }

  // Entities of a type within r; convenience for systems.
  queryType(type, x, y, r) { return this.spatial.query(x, y, r, [], (e) => e.type === type); }

  // Entity occupying a tile (structures and nodes are tile-anchored).
  entityAtTile(tx, ty, type = null) {
    const list = this.spatial.query(tx + 0.5, ty + 0.5, 2.5);
    for (const e of list) {
      if (type && e.type !== type) continue;
      const w = e.data?.w || 1, h = e.data?.h || 1;
      const ex = e.data?.tx ?? Math.floor(e.x), ey = e.data?.ty ?? Math.floor(e.y);
      if (tx >= ex && ty >= ey && tx < ex + w && ty < ey + h) return e;
    }
    return null;
  }
}
