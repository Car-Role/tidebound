// WP10 room templates - The Slagworks (Emberreach): lava channels and furnace pillars.
export default {
  id: 'rooms-emberreach',
  biome: 'emberreach',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'keeper') { quad((sx, sy) => { for (let i = 9; i < 13; i++) set(cx + sx * i, cy + sy * 8, T.LAVA); }); return; }
    if (kind === 'start') return;
    const v = Math.floor(rng.next() * 3);
    if (v === 0) quad((sx, sy) => { for (let i = 3; i < 7; i++) set(cx + sx * i, cy + sy * 3, T.LAVA); });
    else if (v === 1) quad((sx, sy) => { set(cx + sx * 4, cy + sy * 2, T.DUNGEON_WALL); set(cx + sx * 5, cy + sy * 2, T.DUNGEON_WALL); set(cx + sx * 6, cy + sy * 4, T.LAVA); });
    else quad((sx, sy) => { for (let j = 2; j < 5; j++) set(cx + sx * 5, cy + sy * j, T.LAVA); });
  },
};
