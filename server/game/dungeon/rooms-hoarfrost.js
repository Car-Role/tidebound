// WP10 room templates - Frozen Reliquary (Hoarfrost): ice sheets (slippery) and frozen columns.
export default {
  id: 'rooms-hoarfrost',
  biome: 'hoarfrost',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'start') return;
    if (kind === 'keeper') { quad((sx, sy) => set(cx + sx * 8, cy + sy * 6, T.DUNGEON_WALL)); return; }
    const v = Math.floor(rng.next() * 3);
    if (v === 0) { for (let y = room.y + 2; y < room.y + room.h - 2; y++) for (let x = cx - 3; x <= cx + 3; x++) if (y !== cy) set(x, y, T.ICE); }
    else if (v === 1) quad((sx, sy) => { set(cx + sx * 4, cy + sy * 3, T.DUNGEON_WALL); for (let i = 5; i < 8; i++) set(cx + sx * i, cy + sy * 2, T.ICE); });
    else quad((sx, sy) => { for (let i = 2; i < 6; i++) for (let j = 2; j < 4; j++) set(cx + sx * i, cy + sy * j, T.ICE); });
  },
};
