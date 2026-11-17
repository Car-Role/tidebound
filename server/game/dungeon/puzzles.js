// WP10 Vault puzzles, one per signature mechanic (DESIGN 13.1), plus trap gauntlets.
//  spores       burst every spore pod within 8 s of the first (they regrow otherwise)
//  water_level  pull the levers in the order they flash to drain the basin
//  conveyors    step on the pressure plates in the order they flash while flame jets sweep the room
//  mirrors      rotate the mirrors to route the beam from the emitter into the receiver
//  ice_blocks   push the ice blocks onto the frost marks
//  darkness     light every brazier (each one toggles its neighbours) in the dark
// Puzzle pieces are `structure` entities (kinds below) that the dungeon drawer claims; the instance owner
// (systems/dungeons.js) routes `use` here and spawns the reward chest when `room.solved` flips.

import { createEntity } from '../entities.js';
import { T, FLAG } from '../../../shared/grid.js';

export const PUZZLE_KINDS = Object.freeze(['lever', 'plate', 'mirror', 'beam_emitter', 'beam_receiver', 'ice_block', 'ice_mark', 'brazier']);

function piece(game, realm, inst, room, kind, tx, ty, pub = {}, data = {}, solid = false) {
  const e = createEntity(game, {
    type: 'structure', kind, x: tx + 0.5, y: ty + 0.5, hp: 0, radius: 0.5, solid,
    data: { tx, ty, w: 1, h: 1, puzzle: true, inst: inst.id, room: room.id, ...data }, pub: { rot: 0, own: 0, on: 1, ...pub },
  });
  realm.add(e);
  if (solid) realm.setFlag(tx, ty, FLAG.SOLID, true);
  room.pieces.push(e);
  return e;
}

const seqPerm = (rng, n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function setupPuzzle(game, realm, inst, room, mechanic, rng) {
  room.pieces = [];
  room.solved = false;
  const P = room.puzzle = { mechanic, t: 0, step: 0 };
  const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
  switch (mechanic) {
    case 'spores': {
      P.pods = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P.pods.push({ x: cx + 0.5 + Math.cos(a) * 4.5, y: cy + 0.5 + Math.sin(a) * 3.5, z: null });
      }
      P.windowS = 8;
      break;
    }
    case 'water_level': {
      // a drained basin hides the reward; three levers along the top wall
      P.water = [];
      for (let y = cy - 1; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) { realm.setGround(x, y, T.SHALLOW, { persist: false }); P.water.push([x, y]); }
      P.order = seqPerm(rng, 3);
      P.levers = [0, 1, 2].map((i) => piece(game, realm, inst, room, 'lever', cx - 4 + i * 4, room.y + 1, { it: 0 }, { i }, true));
      break;
    }
    case 'conveyors': {
      P.order = seqPerm(rng, 4);
      P.plates = [[-5, -3], [5, -3], [-5, 3], [5, 3]].map(([dx, dy], i) => piece(game, realm, inst, room, 'plate', cx + dx, cy + dy, { it: 0 }, { i }));
      P.jetAt = 0;
      break;
    }
    case 'mirrors': {
      const yA = room.y + 2, yB = room.y + room.h - 3;
      const x1 = room.x + 4, x2 = room.x + room.w - 5;
      P.emitter = piece(game, realm, inst, room, 'beam_emitter', room.x, yA, { rot: 0, bp: [] }, {}, true);
      P.receiver = piece(game, realm, inst, room, 'beam_receiver', x2, room.y, { it: 0 }, {}, true);
      const solution = [1, 1, 0];
      P.mirrors = [[x1, yA], [x1, yB], [x2, yB]].map(([x, y], i) => {
        let rot = solution[i];
        if (rng.next() < 0.75) rot = 1 - rot;
        return piece(game, realm, inst, room, 'mirror', x, y, { rot }, { i }, true);
      });
      if (P.mirrors.every((m, i) => m.pub.rot === solution[i])) P.mirrors[1].set('rot', 1 - P.mirrors[1].pub.rot);
      traceBeam(realm, P);
      break;
    }
    case 'ice_blocks': {
      P.marks = [[cx - 3, cy - 2], [cx + 3, cy + 2]].map(([x, y], i) => piece(game, realm, inst, room, 'ice_mark', x, y, { it: 0 }, { i }));
      P.blocks = [[cx - 1, cy + 2], [cx + 2, cy - 2]].map(([x, y], i) => piece(game, realm, inst, room, 'ice_block', x, y, {}, { i }, true));
      P.bounds = { x0: room.x + 1, y0: room.y + 1, x1: room.x + room.w - 2, y1: room.y + room.h - 2 };
      break;
    }
    case 'darkness': {
      P.braziers = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        P.braziers.push(piece(game, realm, inst, room, 'brazier', Math.round(cx + Math.cos(a) * 4.5), Math.round(cy + Math.sin(a) * 3.5), { on: 0 }, { i }, true));
      }
      // scramble from solved with a few toggles so it is always solvable
      const lit = [1, 1, 1, 1, 1];
      for (let n = 0; n < 3; n++) { const i = Math.floor(rng.next() * 5); for (const j of [i - 1, i, i + 1]) lit[(j + 5) % 5] ^= 1; }
      if (lit.every((v) => v)) lit[0] = 0, lit[1] = 0, lit[4] = 0;
      P.braziers.forEach((b, i) => b.set('on', lit[i]));
      room.dark = true;
      break;
    }
    default:
      room.solved = true;
  }
  return P;
}

// ---------------------------------------------------------------- mirrors

export function traceBeam(realm, P) {
  const e = P.emitter;
  let x = e.data.tx, y = e.data.ty, dx = 1, dy = 0;
  const pts = [[x + 0.5, y + 0.5]];
  const mirrorAt = new Map(P.mirrors.map((m) => [m.data.tx + ',' + m.data.ty, m]));
  let hit = false;
  for (let i = 0; i < 80; i++) {
    x += dx; y += dy;
    if (x === P.receiver.data.tx && y === P.receiver.data.ty) { hit = true; pts.push([x + 0.5, y + 0.5]); break; }
    const m = mirrorAt.get(x + ',' + y);
    if (m) {
      pts.push([x + 0.5, y + 0.5]);
      if (m.pub.rot === 0) { const t = dx; dx = -dy; dy = -t; } else { const t = dx; dx = dy; dy = t; }
      continue;
    }
    const g = realm.groundAt(x, y);
    if (g === T.DUNGEON_WALL || g === T.EMPTY) { pts.push([x + 0.5 - dx * 0.5, y + 0.5 - dy * 0.5]); break; }
  }
  e.set('bp', pts.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]));
  P.receiver.set('it', hit ? 1 : 0);
  return hit;
}

// ---------------------------------------------------------------- use

export function usePuzzle(game, realm, inst, room, e, player) {
  const P = room.puzzle;
  if (!P || room.solved) return { ok: false, err: 'invalid' };
  switch (e.kind) {
    case 'lever': {
      if (e.pub.it) return { ok: true };
      if (P.order[P.step] === e.data.i) {
        e.set('it', 1);
        P.step++;
        game.fx(realm, 'hit_armor', e.x, e.y, { lever: 1 });
        if (P.step >= P.order.length) {
          for (const [x, y] of P.water) realm.setGround(x, y, T.DUNGEON_FLOOR, { persist: false });
          game.fx(realm, 'tide_out', room.cx, room.cy, { drain: 1 });
          room.solved = true;
        }
      } else {
        P.step = 0;
        for (const l of P.levers) l.set('it', 0);
        game.fx(realm, 'fish_splash', e.x, e.y + 2, { wrong: 1 });
        game.toast(player, 'The water surges back. Watch the levers flash.', 'warn');
      }
      return { ok: true };
    }
    case 'mirror': {
      e.set('rot', 1 - (e.pub.rot ?? 0));
      game.fx(realm, 'hit_armor', e.x, e.y, { mirror: 1 });
      if (traceBeam(realm, P)) {
        game.fx(realm, 'keeper_lenses', P.receiver.x, P.receiver.y, { lit: 1 });
        room.solved = true;
      }
      return { ok: true };
    }
    case 'ice_block': {
      const pe = player.entity;
      let dx = e.x - pe.x, dy = e.y - pe.y;
      if (Math.abs(dx) >= Math.abs(dy)) { dx = Math.sign(dx); dy = 0; } else { dy = Math.sign(dy); dx = 0; }
      const nx = e.data.tx + dx, ny = e.data.ty + dy;
      const B = P.bounds;
      const onMark = P.marks.some((m) => m.data.tx === nx && m.data.ty === ny);
      const edge = nx <= B.x0 || ny <= B.y0 || nx >= B.x1 || ny >= B.y1;
      if (nx < B.x0 || ny < B.y0 || nx > B.x1 || ny > B.y1 || (edge && !onMark)) { game.fx(realm, 'hit_ice', e.x, e.y, { stuck: 1 }); return { ok: false, err: 'invalid' }; }
      if (!realm.isWalkable(nx, ny) || P.blocks.some((b) => b !== e && b.data.tx === nx && b.data.ty === ny)) return { ok: false, err: 'invalid' };
      const occupied = realm.query(nx + 0.5, ny + 0.5, 0.7, [], (o) => o.type === 'player' || o.type === 'mob');
      if (occupied.length) return { ok: false, err: 'busy' };
      realm.setFlag(e.data.tx, e.data.ty, FLAG.SOLID, false);
      e.data.tx = nx; e.data.ty = ny;
      realm.move(e, nx + 0.5, ny + 0.5);
      realm.setFlag(nx, ny, FLAG.SOLID, true);
      game.fx(realm, 'hit_ice', e.x, e.y, { push: 1 });
      for (const m of P.marks) m.set('it', P.blocks.some((b) => b.data.tx === m.data.tx && b.data.ty === m.data.ty) ? 1 : 0);
      if (P.marks.every((m) => m.pub.it)) { room.solved = true; game.fx(realm, 'break_crystal', room.cx, room.cy, { solved: 1 }); }
      return { ok: true };
    }
    case 'ice_mark': {
      // reset: blocks return to their start (escape hatch for stuck layouts)
      return { ok: true };
    }
    case 'brazier': {
      const n = P.braziers.length;
      for (const j of [e.data.i - 1, e.data.i, e.data.i + 1]) { const b = P.braziers[(j + n) % n]; b.set('on', b.pub.on ? 0 : 1); }
      game.fx(realm, 'burn', e.x, e.y - 0.3, { brazier: 1 });
      if (P.braziers.every((b) => b.pub.on)) { room.solved = true; room.dark = false; game.fx(realm, 'beacon_light', room.cx, room.cy, { small: 1 }); }
      return { ok: true };
    }
    default:
      return { ok: false, err: 'invalid' };
  }
}

// ---------------------------------------------------------------- tick (flashing hints, plates, pods, jets)

export function tickPuzzle(game, realm, inst, room, dt, api) {
  const P = room.puzzle;
  if (!P || room.solved) return;
  P.t += dt;
  switch (P.mechanic) {
    case 'water_level':
    case 'conveyors': {
      const list = P.mechanic === 'water_level' ? P.levers : P.plates;
      // hint: pieces flash in order every 5 s (0.6 s each)
      const cyc = P.t % 5;
      const k = Math.floor(cyc / 0.6);
      for (const [i, pc] of list.entries()) {
        const want = k < P.order.length && P.order[k] === i && !pc.pub.it ? 2 : (pc.pub.it ? 1 : 0);
        if ((pc.pub.p ?? 0) !== want) pc.set('p', want);
      }
      if (P.mechanic === 'conveyors') {
        for (const pl of api.membersIn(room)) {
          const plate = P.plates.find((pc) => Math.floor(pl.entity.x) === pc.data.tx && Math.floor(pl.entity.y) === pc.data.ty);
          if (!plate || plate.pub.it) continue;
          if (P.order[P.step] === plate.data.i) {
            plate.set('it', 1); P.step++;
            game.fx(realm, 'hit_armor', plate.x, plate.y, { plate: 1 });
            if (P.step >= P.order.length) room.solved = true;
          } else {
            P.step = 0;
            for (const pc of P.plates) pc.set('it', 0);
            game.fx(realm, 'burn_explode', plate.x, plate.y, { small: 1 });
          }
        }
        // flame jets sweep across rows
        if (P.t >= P.jetAt) {
          P.jetAt = P.t + 3.2;
          const row = room.y + 1 + Math.floor(api.rng.next() * (room.h - 2));
          api.telegraph({ shape: 'rect', x: room.cx, y: row + 0.5, w: room.w, h: 1.2 }, 1.0, (g, R, spec) => {
            api.hit(spec, api.tierDmg(0.6), 'ember');
            g.fx(R, 'keeper_bellows', spec.x, spec.y, { jet: 1, w: spec.w });
          });
        }
      }
      break;
    }
    case 'spores': {
      // (re)grow pods
      for (const pod of P.pods) {
        if (pod.z && !pod.z.removed) continue;
        if (pod.z && pod.z.removed && !pod.burst) pod.z = null;
        if (!pod.z && !pod.burst) {
          pod.z = api.zone({ kind: 'spore_pod', x: pod.x, y: pod.y, r: 0.6, dur: 1e6, team: 'none', burstable: true,
            onBurst: () => { pod.burst = true; if (P.firstAt == null) P.firstAt = P.t; } });
        }
      }
      if (P.firstAt != null) {
        if (P.pods.every((p) => p.burst)) { room.solved = true; game.fx(realm, 'keeper_sporeking', room.cx, room.cy, { solved: 1 }); }
        else if (P.t - P.firstAt > P.windowS) {
          P.firstAt = null;
          for (const pod of P.pods) { pod.burst = false; pod.z = null; }
          game.fx(realm, 'break_plant', room.cx, room.cy, { regrow: 1 });
        }
      }
      break;
    }
    default:
  }
}

// ---------------------------------------------------------------- trap gauntlets

export function tickTrap(game, realm, inst, room, dt, api) {
  room.trapT = (room.trapT ?? 0) - dt;
  if (room.trapT > 0) return;
  room.trapT = 2.2;
  const vertical = api.rng.next() < 0.5;
  const n = 2 + Math.floor(api.rng.next() * 2);
  for (let i = 0; i < n; i++) {
    const spec = vertical
      ? { shape: 'rect', x: room.x + 1 + Math.floor(api.rng.next() * (room.w - 2)) + 0.5, y: room.cy, w: 1.2, h: room.h }
      : { shape: 'rect', x: room.cx, y: room.y + 1 + Math.floor(api.rng.next() * (room.h - 2)) + 0.5, w: room.w, h: 1.2 };
    api.telegraph(spec, 0.9, (g, R, s) => {
      api.hit(s, api.tierDmg(0.5), 'none');
      g.fx(R, 'hit_armor', s.x, s.y, { spikes: 1, w: s.w, h: s.h });
    });
  }
}

export default { setupPuzzle, usePuzzle, tickPuzzle, tickTrap, traceBeam, PUZZLE_KINDS };
