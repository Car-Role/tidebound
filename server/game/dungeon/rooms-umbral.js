// WP10 room templates - The Inkwell (Umbral): ink pools (slow) between leaning shelves.
export default {
  id: 'rooms-umbral',
  biome: 'umbral',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'start') return;
    if (kind === 'keeper') { quad((sx, sy) => { for (let i = 10; i < 14; i++) set(cx + sx * i, cy + sy * 9, T.INK); }); return; }
    const v = Math.floor(rng.next() * 3);
    if (v === 0) quad((sx, sy) => { for (let i = 3; i < 6; i++) for (let j = 2; j < 4; j++) set(cx + sx * i, cy + sy * j, T.INK); });
    else if (v === 1) quad((sx, sy) => { for (let i = 3; i < 7; i++) set(cx + sx * i, cy + sy * 4, T.DUNGEON_WALL); });
    else quad((sx, sy) => { set(cx + sx * 4, cy + sy * 2, T.DUNGEON_WALL); set(cx + sx * 6, cy + sy * 3, T.INK); set(cx + sx * 5, cy + sy * 3, T.INK); });
  },
};
