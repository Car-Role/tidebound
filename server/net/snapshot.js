// Interest management and add/upd/rem delta builder (TECH_SPEC 6.2, 6.5).
// Per client: `known` maps entity id -> record of what that client last received.

import { INTEREST_RADIUS, INTEREST_DROP, CHUNK } from '../../shared/config.js';
import { projectAdd, projectPatch, quant, currentChange } from '../game/entities.js';

const ADD2 = INTEREST_RADIUS * INTEREST_RADIUS;
const CHUNK_MARGIN = INTEREST_DROP + 4;
const scratch = [];

function syncChunks(player, realm) {
  const e = player.entity;
  const cx0 = Math.max(0, Math.floor((e.x - CHUNK_MARGIN) / CHUNK)), cx1 = Math.min(realm.chunksX - 1, Math.floor((e.x + CHUNK_MARGIN) / CHUNK));
  const cy0 = Math.max(0, Math.floor((e.y - CHUNK_MARGIN) / CHUNK)), cy1 = Math.min(realm.chunksY - 1, Math.floor((e.y + CHUNK_MARGIN) / CHUNK));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy;
      if (player.knownChunks.has(key)) continue;
      player.knownChunks.add(key);
      player.conn.send(realm.chunkMessage(cx, cy));
    }
  }
}

function buildSnap(game, player, realm) {
  const me = player.entity;
  const add = [], upd = [], rem = [];
  const tick = game.tickCount;
  const clock = currentChange();
  scratch.length = 0;
  realm.query(me.x, me.y, INTEREST_DROP, scratch);
  for (const e of scratch) {
    let k = player.known.get(e.id);
    if (!k) {
      const dx = e.x - me.x, dy = e.y - me.y;
      if (dx * dx + dy * dy > ADD2) continue;
      const o = projectAdd(e);
      add.push(o);
      player.known.set(e.id, { v: clock, x: o.x, y: o.y, f: o.f, s: o.s, hp: o.hp, mh: o.mh, seen: tick });
      continue;
    }
    k.seen = tick;
    const x = quant(e.x), y = quant(e.y), hp = Math.ceil(e.hp), mh = Math.ceil(e.maxHp);
    let patch = projectPatch(e, k.v);
    if (mh !== k.mh) { (patch ||= {}).mh = mh; k.mh = mh; }
    const self = e === me;
    const moved = !self && (x !== k.x || y !== k.y);
    if (moved || e.facing !== k.f || e.state !== k.s || hp !== k.hp || patch) {
      const entry = [e.id, x, y, e.facing, e.state, hp !== k.hp ? hp : null];
      if (patch) entry.push(patch);
      upd.push(entry);
      k.f = e.facing; k.s = e.state; k.hp = hp;
    }
    k.x = x; k.y = y; k.v = clock;
  }
  for (const [id, k] of player.known) {
    if (k.seen !== tick) { rem.push(id); player.known.delete(id); }
  }
  return {
    t: 'snap', k: tick, ack: player.ack,
    me: [quant(me.x), quant(me.y), quant(me.vx), quant(me.vy)],
    add, upd, rem,
  };
}

export function sendSnapshots(game) {
  for (const player of game.players.values()) {
    if (player.joining || !player.entity || !player.conn) continue;
    const realm = game.realms.get(player.entity.realm);
    if (!realm) continue;

    // wholesale chunk resends first, then new chunks, then small tile patches
    for (const key of realm.dirtyChunks) {
      if (!player.knownChunks.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      player.conn.send(realm.chunkMessage(cx, cy));
    }
    syncChunks(player, realm);
    if (realm.tileEvents.length) {
      const p = realm.tileEvents.filter(([tx, ty]) => player.knownChunks.has(Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK)));
      if (p.length) player.conn.send({ t: 'tiles', realm: realm.id, p });
    }

    player.conn.send(buildSnap(game, player, realm));

    const fx = game.fxQueue.get(realm.id);
    if (fx && fx.length) {
      const me = player.entity, r2 = INTEREST_DROP * INTEREST_DROP;
      const e = fx.filter((f) => (f[1] - me.x) ** 2 + (f[2] - me.y) ** 2 <= r2);
      if (e.length) player.conn.send({ t: 'fx', e });
    }
  }
  for (const realm of game.realms.values()) {
    realm.dirtyChunks.clear();
    realm.tileEvents.length = 0;
    realm.removedIds.length = 0;
  }
  game.fxQueue.clear();
}
