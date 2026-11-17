// WP10 room templates - Refraction Hall (Glasswaste): symmetric glass pillars.
export default {
  id: 'rooms-glasswaste',
  biome: 'glasswaste',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'start') return;
    if (kind === 'keeper') { quad((sx, sy) => { set(cx + sx * 6, cy + sy * 5, T.DUNGEON_WALL); set(cx + sx * 12, cy + sy * 3, T.DUNGEON_WALL); }); return; }
    const v = Math.floor(rng.next() * 3);
    if (v === 0) quad((sx, sy) => set(cx + sx * 3, cy + sy * 2, T.DUNGEON_WALL));
    else if (v === 1) quad((sx, sy) => { set(cx + sx * 5, cy + sy * 2, T.DUNGEON_WALL); set(cx + sx * 5, cy + sy * 3, T.DUNGEON_WALL); set(cx + sx * 6, cy + sy * 3, T.DUNGEON_WALL); });
    else quad((sx, sy) => { for (let i = 2; i < 7; i += 2) set(cx + sx * i, cy + sy * 4, T.DUNGEON_WALL); });
    for (let n = 0; n < 8; n++) {
      const x = room.x + 1 + Math.floor(rng.next() * (room.w - 2)), y = room.y + 1 + Math.floor(rng.next() * (room.h - 2));
      if (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) set(x, y, T.GLASSWASTE);
    }
  },
};
