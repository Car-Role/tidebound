// WP10 room templates - Sunken Cistern (Saltfen): flooded basins and broken columns.
export default {
  id: 'rooms-saltfen',
  biome: 'saltfen',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'keeper' || kind === 'start') return;
    const v = Math.floor(rng.next() * 3);
    if (v === 0) quad((sx, sy) => { for (let i = 3; i < 6; i++) for (let j = 2; j < 4; j++) set(cx + sx * i, cy + sy * j, T.SHALLOW); });
    else if (v === 1) quad((sx, sy) => set(cx + sx * 4, cy + sy * 3, T.DUNGEON_WALL));
    else { for (let i = 3; i < 7; i++) { set(cx - i, cy - 3, T.SHALLOW); set(cx + i, cy + 3, T.SHALLOW); } }
    for (let n = 0; n < 6; n++) {
      const x = room.x + 1 + Math.floor(rng.next() * (room.w - 2)), y = room.y + 1 + Math.floor(rng.next() * (room.h - 2));
      if (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) set(x, y, T.SALTFEN);
    }
  },
};
