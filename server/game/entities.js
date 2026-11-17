// Entity factory, id allocator and public-field projection (TECH_SPEC 6.5).
// Public keys are written through entity.set(key, value), which stamps a change version so the
// snapshot builder can send each client only the keys dirtied since it last saw the entity.

import { POS_QUANT } from '../../shared/config.js';

let changeClock = 0;
export const nextChange = () => ++changeClock;
export const currentChange = () => changeClock;

export class Entity {
  constructor(id, type, kind, realm, x, y) {
    this.id = id;
    this.type = type;
    this.kind = kind;
    this.realm = realm;          // realm id
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 2;
    this.state = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.radius = 0.4;
    this.solid = false;
    this.data = {};              // private server state; must stay JSON-serialisable for structures
    this.pub = {};               // public projection (short keys, section 6.5)
    this.keyVer = {};            // key -> change version
    this.removed = false;
    this._cell = -1;
  }

  // Set a public key; marks it dirty when the value changes (objects always count as a change).
  set(key, value) {
    const old = this.pub[key];
    if (old === value && (value === null || typeof value !== 'object')) return this;
    this.pub[key] = value;
    this.keyVer[key] = nextChange();
    return this;
  }

  get(key) { return this.pub[key]; }

  // Mark a public key dirty after mutating an object value in place.
  touch(key) { this.keyVer[key] = nextChange(); return this; }
}

export function createEntity(game, spec) {
  const id = game.allocId();
  const e = new Entity(id, spec.type, spec.kind ?? spec.type, spec.realm ?? 'overworld', spec.x ?? 0, spec.y ?? 0);
  if (spec.hp != null) e.hp = spec.hp;
  e.maxHp = spec.maxHp ?? e.hp;
  if (spec.radius != null) e.radius = spec.radius;
  if (spec.solid != null) e.solid = spec.solid;
  if (spec.facing != null) e.facing = spec.facing;
  if (spec.state != null) e.state = spec.state;
  if (spec.data) e.data = spec.data;
  if (spec.pub) for (const k of Object.keys(spec.pub)) e.set(k, spec.pub[k]);
  return e;
}

export const quant = (v) => Math.round(v * POS_QUANT);

// Full public projection for `snap.add`.
export function projectAdd(e) {
  const o = {
    i: e.id, ty: e.type, k: e.kind, x: quant(e.x), y: quant(e.y),
    f: e.facing, s: e.state, hp: Math.ceil(e.hp), mh: Math.ceil(e.maxHp),
  };
  for (const k in e.pub) o[k] = e.pub[k];
  return o;
}

// Public keys changed after version `since`, or null.
export function projectPatch(e, since) {
  let patch = null;
  for (const k in e.keyVer) {
    if (e.keyVer[k] > since) { (patch ||= {})[k] = e.pub[k]; }
  }
  return patch;
}
