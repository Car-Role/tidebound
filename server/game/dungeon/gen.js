// WP10 Vault floor generator (DESIGN 13.1): a 5x5 grid of 16x12-tile rooms, 7-10 rooms connected as a
// random spanning tree with 3-wide doors; floor 3 reserves a 2x2 block for the Keeper hall. Pure and seeded.
//
// generateFloor({ floor, floors, rooms:[min,max], roomWeights, seed, grid:[5,5], roomSize:[16,12] })
//  -> { w, h, ground: Uint8Array, rooms: Room[], startId, endId, keeperId|null, links: [[a,b]] }
// Room: { id, gx, gy, gw, gh, x, y, w, h (interior tiles), type, depth, doors: [{ tiles:[[tx,ty]], to }], cx, cy }

import { createRng } from '../../../shared/rng.js';
import { T } from '../../../shared/grid.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function floorSize(grid = [5, 5], roomSize = [16, 12]) {
  return { w: grid[0] * (roomSize[0] + 1) + 1, h: grid[1] * (roomSize[1] + 1) + 1, pw: roomSize[0] + 1, ph: roomSize[1] + 1 };
}

function pickType(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng.next() * total;
  for (const k in weights) { r -= weights[k]; if (r < 0) return k; }
  return 'combat';
}

export function generateFloor(params = {}) {
  const grid = params.grid ?? [5, 5];
  const size = params.roomSize ?? [16, 12];
  const { w, h, pw, ph } = floorSize(grid, size);
  const rng = createRng((params.seed ?? 1) >>> 0);
  const floor = params.floor ?? 1;
  const floors = params.floors ?? 3;
  const [minR, maxR] = params.rooms ?? [7, 10];
  const keeperFloor = floor >= floors;
  const GX = grid[0], GY = grid[1];
  const cell = new Array(GX * GY).fill(-1);
  const rooms = [];
  const links = [];
  const idx = (gx, gy) => gy * GX + gx;
  const free = (gx, gy) => gx >= 0 && gy >= 0 && gx < GX && gy < GY && cell[idx(gx, gy)] === -1;

  // keeper hall: a 2x2 block in a corner
  let keeper = null;
  if (keeperFloor) {
    const corners = [[0, 0], [GX - 2, 0], [0, GY - 2], [GX - 2, GY - 2]];
    const [kx, ky] = corners[Math.floor(rng.next() * 4)];
    keeper = { id: 0, gx: kx, gy: ky, gw: 2, gh: 2, type: 'keeper' };
    rooms.push(keeper);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) cell[idx(kx + x, ky + y)] = 0;
  }
  // start: the corner farthest from the keeper hall (or a random edge cell)
  let sx, sy;
  if (keeper) {
    sx = keeper.gx === 0 ? GX - 1 : 0;
    sy = keeper.gy === 0 ? GY - 1 : 0;
  } else {
    const edge = [];
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) if (gx === 0 || gy === 0 || gx === GX - 1 || gy === GY - 1) edge.push([gx, gy]);
    [sx, sy] = edge[Math.floor(rng.next() * edge.length)];
  }
  const start = { id: rooms.length, gx: sx, gy: sy, gw: 1, gh: 1, type: 'start' };
  rooms.push(start);
  cell[idx(sx, sy)] = start.id;

  const target = minR + Math.floor(rng.next() * (maxR - minR + 1));
  const normalCount = () => rooms.filter((r) => r !== keeper).length + (keeper ? 1 : 0);
  const adjacentToKeeper = (gx, gy) => keeper && DIRS.some(([dx, dy]) => {
    const nx = gx + dx, ny = gy + dy;
    return nx >= keeper.gx && nx < keeper.gx + 2 && ny >= keeper.gy && ny < keeper.gy + 2;
  });
  let keeperLinked = false;
  // keeper floors: carve the main path to the keeper hall first so branches stay within the room budget
  if (keeper) {
    let cur = start;
    for (let step = 0; step < 12 && !adjacentToKeeper(cur.gx, cur.gy); step++) {
      const tx = keeper.gx + 0.5, ty = keeper.gy + 0.5;
      const opts = DIRS.map(([dx, dy]) => [cur.gx + dx, cur.gy + dy]).filter(([x, y]) => free(x, y))
        .sort((a, b) => (Math.abs(a[0] - tx) + Math.abs(a[1] - ty)) - (Math.abs(b[0] - tx) + Math.abs(b[1] - ty)) || (rng.next() - 0.5));
      if (!opts.length) break;
      const [gx, gy] = opts[0];
      const r = { id: rooms.length, gx, gy, gw: 1, gh: 1, type: 'combat' };
      rooms.push(r);
      cell[idx(gx, gy)] = r.id;
      links.push([cur.id, r.id]);
      cur = r;
    }
    if (adjacentToKeeper(cur.gx, cur.gy) && cur !== start) { links.push([cur.id, keeper.id]); keeperLinked = true; }
  }
  let guard = 0;
  while (guard++ < 400) {
    const enough = normalCount() >= target;
    if (enough && (!keeper || keeperLinked)) break;
    // grow from a random existing room cell
    const frontier = [];
    for (const r of rooms) {
      if (r === keeper) continue;
      for (const [dx, dy] of DIRS) if (free(r.gx + dx, r.gy + dy)) frontier.push([r, r.gx + dx, r.gy + dy]);
    }
    if (!frontier.length) break;
    // bias toward the keeper once we have enough rooms
    let choice;
    if (enough && keeper) {
      frontier.sort((a, b) => dist2(a[1], a[2], keeper) - dist2(b[1], b[2], keeper));
      choice = frontier[0];
    } else choice = frontier[Math.floor(rng.next() * frontier.length)];
    const [from, gx, gy] = choice;
    const r = { id: rooms.length, gx, gy, gw: 1, gh: 1, type: 'combat' };
    rooms.push(r);
    cell[idx(gx, gy)] = r.id;
    links.push([from.id, r.id]);
    if (keeper && !keeperLinked && adjacentToKeeper(gx, gy) && (enough || rng.next() < 0.15) && r.id !== start.id) {
      links.push([r.id, keeper.id]);
      keeperLinked = true;
    }
  }
  if (keeper && !keeperLinked) {
    // fall back: link any adjacent room (start excluded when possible)
    const cand = rooms.filter((r) => r !== keeper && adjacentToKeeper(r.gx, r.gy));
    const pick = cand.find((r) => r !== start) ?? cand[0];
    if (pick) { links.push([pick.id, keeper.id]); keeperLinked = true; }
  }

  // depths
  const adj = rooms.map(() => []);
  for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
  for (const r of rooms) r.depth = Infinity;
  start.depth = 0;
  const q = [start.id];
  while (q.length) {
    const id = q.shift();
    for (const n of adj[id]) if (rooms[n].depth === Infinity) { rooms[n].depth = rooms[id].depth + 1; q.push(n); }
  }
  // end room: keeper hall or the deepest leaf (stairs)
  let end = keeper;
  if (!end) {
    end = rooms.filter((r) => r !== start).sort((a, b) => b.depth - a.depth || adj[a.id].length - adj[b.id].length)[0];
    end.type = 'stairs';
  }
  // room types (start/end fixed); at least one blessing and two combat rooms per floor
  const middle = rooms.filter((r) => r !== start && r !== end);
  for (const r of middle) r.type = pickType(rng, params.roomWeights ?? { combat: 55, puzzle: 15, treasure: 10, trap: 10, blessing: 10 });
  if (middle.length >= 3 && !middle.some((r) => r.type === 'blessing')) middle[Math.floor(rng.next() * middle.length)].type = 'blessing';
  let combats = middle.filter((r) => r.type === 'combat').length;
  for (const r of middle) { if (combats >= 2) break; if (r.type !== 'combat' && r.type !== 'blessing') { r.type = 'combat'; combats++; } }

  // tiles
  const ground = new Uint8Array(w * h).fill(T.EMPTY);
  const set = (x, y, g) => { if (x >= 0 && y >= 0 && x < w && y < h) ground[y * w + x] = g; };
  for (const r of rooms) {
    r.x = r.gx * pw + 1; r.y = r.gy * ph + 1;
    r.w = r.gw * pw - 1; r.h = r.gh * ph - 1;
    r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2;
    r.doors = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const inside = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
      set(x, y, inside ? T.DUNGEON_FLOOR : T.DUNGEON_WALL);
    }
  }
  // doors on the shared wall, 3 tiles wide, centred on the overlap
  for (const [a, b] of links) {
    const A = rooms[a], B = rooms[b];
    const tiles = [];
    if (A.x + A.w + 1 === B.x || B.x + B.w + 1 === A.x) {
      const wx = A.x + A.w + 1 === B.x ? A.x + A.w : B.x + B.w;
      const y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      const mid = Math.floor((y0 + y1) / 2);
      for (let y = mid - 1; y <= mid + 1; y++) tiles.push([wx, y]);
    } else {
      const wy = A.y + A.h + 1 === B.y ? A.y + A.h : B.y + B.h;
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w);
      const mid = Math.floor((x0 + x1) / 2);
      for (let x = mid - 1; x <= mid + 1; x++) tiles.push([x, wy]);
    }
    for (const [x, y] of tiles) set(x, y, T.DUNGEON_FLOOR);
    A.doors.push({ tiles, to: b });
    B.doors.push({ tiles, to: a });
  }
  return { w, h, ground, rooms, links, startId: start.id, endId: end.id, keeperId: keeper ? keeper.id : null, floor, floors };
}

function dist2(gx, gy, k) { return (gx - (k.gx + 0.5)) ** 2 + (gy - (k.gy + 0.5)) ** 2; }

// Every room centre reachable from the start over floor tiles (used by tests and as a generator assert).
export function floorConnected(layout) {
  const { w, h, ground, rooms, startId } = layout;
  const seen = new Uint8Array(w * h);
  const s = rooms[startId];
  const q = [[Math.floor(s.cx), Math.floor(s.cy)]];
  seen[q[0][1] * w + q[0][0]] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (seen[i]) continue;
      const g = ground[i];
      if (g === T.DUNGEON_WALL || g === T.EMPTY || g === T.DEEP) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return rooms.every((r) => seen[Math.floor(r.cy) * w + Math.floor(r.cx)] === 1);
}

// Room index per tile (for "which room is this player in").
export function roomMap(layout) {
  const map = new Int16Array(layout.w * layout.h).fill(-1);
  for (const r of layout.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map[y * layout.w + x] = r.id;
  return map;
}

export default { generateFloor, floorConnected, roomMap, floorSize };
