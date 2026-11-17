// Client mirror of server state: entities, chunks, self.*, world.*, with change events (TECH_SPEC 6.4).
// UI subscribes to `change:self.<k>` / `change:world.<k>`; nobody polls.

import { POS_QUANT, CHUNK, INTERP_DELAY_MS, TICK_HZ } from '../../shared/config.js';
import { T, FLAG, isGroundWalkable } from '../../shared/grid.js';
import { InterpBuffer } from '../net/interp.js';

const TICK_MS = 1000 / TICK_HZ;
const COMMON = new Set(['i', 'ty', 'k', 'x', 'y', 'f', 's', 'hp', 'mh']);

function decode64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Store {
  constructor() {
    this.listeners = new Map();
    this.reset();
    this.self = {};
    this.world = {};
    this.settings = {};
    this.myId = 0;
  }

  reset() {
    this.entities = new Map();
    this.chunks = new Map();
    this.realm = { id: 'overworld', w: 0, h: 0, kind: 'overworld' };
    this.timeOffset = null;
    this.serverTick = 0;
    this.lastSnapAt = 0;
  }

  // ---- events ----
  on(ev, fn) {
    let l = this.listeners.get(ev);
    if (!l) { l = new Set(); this.listeners.set(ev, l); }
    l.add(fn);
    return () => l.delete(fn);
  }
  off(ev, fn) { this.listeners.get(ev)?.delete(fn); }
  emit(ev, data) {
    const l = this.listeners.get(ev);
    if (!l) return;
    for (const fn of l) {
      try { fn(data); } catch (err) { console.error(`[tb:store] listener ${ev} threw`, err); }
    }
  }

  // ---- server time ----
  // Estimated server time in ms for a local timestamp; snapshots are stamped tick * 50 ms.
  serverTime(now) { return this.timeOffset == null ? 0 : now - this.timeOffset; }
  renderTime(now) { return this.serverTime(now) - INTERP_DELAY_MS; }

  noteTick(k, now) {
    const sample = now - k * TICK_MS;
    if (this.timeOffset == null || sample < this.timeOffset) this.timeOffset = sample;
    else this.timeOffset += (sample - this.timeOffset) * 0.02;
    this.serverTick = k;
    this.lastSnapAt = now;
  }

  // ---- messages ----
  applyWelcome(m, now) {
    this.reset();
    this.myId = m.id;
    this.realm = { ...m.realm };
    this.world = { ...(m.world || {}) };
    this.self = { ...(m.self || {}) };
    this.noteTick(m.tick ?? 0, now);
    this.emit('welcome', m);
    for (const k of Object.keys(this.world)) this.emit('change:world.' + k, this.world[k]);
    for (const k of Object.keys(this.self)) this.emit('change:self.' + k, this.self[k]);
  }

  applySelf(m) { this.self[m.k] = m.d; this.emit('change:self.' + m.k, m.d); }
  applyWorld(m) { this.world[m.k] = m.d; this.emit('change:world.' + m.k, m.d); }

  applySnap(m, now) {
    this.noteTick(m.k, now);
    const t = m.k * TICK_MS;
    for (const o of m.add) {
      const e = { buf: new InterpBuffer(), rx: o.x / POS_QUANT, ry: o.y / POS_QUANT, born: now };
      for (const key in o) if (!COMMON.has(key)) e[key] = o[key];
      e.i = o.i; e.ty = o.ty; e.k = o.k; e.f = o.f; e.s = o.s; e.hp = o.hp; e.mh = o.mh;
      e.x = o.x / POS_QUANT; e.y = o.y / POS_QUANT;
      e.buf.push(t, e.x, e.y);
      this.entities.set(e.i, e);
      this.emit('entity:add', e);
    }
    for (const u of m.upd) {
      const e = this.entities.get(u[0]);
      if (!e) continue;
      e.x = u[1] / POS_QUANT; e.y = u[2] / POS_QUANT; e.f = u[3];
      if (e.s !== u[4]) { e.s = u[4]; this.emit('entity:state', e); }
      if (u[5] !== null && u[5] !== undefined) {
        const prev = e.hp;
        e.hp = u[5];
        if (u[5] < prev) this.emit('entity:hurt', { e, dmg: prev - u[5] });
      }
      const patch = u[6];
      if (patch) {
        for (const key in patch) e[key] = patch[key];
        this.emit('entity:patch', { e, patch });
      }
      e.buf.push(t, e.x, e.y);
    }
    for (const id of m.rem) {
      const e = this.entities.get(id);
      if (!e) continue;
      this.entities.delete(id);
      this.emit('entity:rem', e);
    }
    this.emit('snap', m);
  }

  applyChunk(m) {
    if (m.realm !== this.realm.id) return;
    this.chunks.set(m.cx + ',' + m.cy, { g: decode64(m.g), f: decode64(m.f) });
    this.emit('chunk', { cx: m.cx, cy: m.cy });
  }

  applyTiles(m) {
    if (m.realm !== this.realm.id) return;
    const changed = [];
    for (const [tx, ty, g, f] of m.p) {
      const c = this.chunks.get(Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK));
      if (!c) continue;
      const i = (ty % CHUNK) * CHUNK + (tx % CHUNK);
      c.g[i] = g; c.f[i] = f;
      changed.push([tx, ty]);
    }
    if (changed.length) this.emit('tiles', changed);
  }

  applyRealm(m) {
    this.reset();
    this.realm = { id: m.id, w: m.w, h: m.h, kind: m.kind };
    this.serverTick = m.tick ?? 0;
    this.emit('realm', m);
  }

  // ---- tile queries ----
  groundAt(tx, ty) {
    if (tx < 0 || ty < 0) return T.EMPTY;
    const c = this.chunks.get(Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK));
    return c ? c.g[(ty % CHUNK) * CHUNK + (tx % CHUNK)] : T.EMPTY;
  }

  flagsAt(tx, ty) {
    if (tx < 0 || ty < 0) return 0;
    const c = this.chunks.get(Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK));
    return c ? c.f[(ty % CHUNK) * CHUNK + (tx % CHUNK)] : 0;
  }

  // Mirrors Realm.isWalkable on the server; unknown chunks are treated as blocked.
  isWalkable(tx, ty) {
    if (tx >= this.realm.w || ty >= this.realm.h) return false;
    const g = this.groundAt(tx, ty);
    return isGroundWalkable(g, !!this.world.clock?.low) && (this.flagsAt(tx, ty) & FLAG.SOLID) === 0;
  }

  me() { return this.entities.get(this.myId) || null; }
}
