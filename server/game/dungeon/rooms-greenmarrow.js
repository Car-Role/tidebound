// WP10 room templates - Rootbound Vault (Greenmarrow). decorate(ctx) dresses a room interior; the centre
// cross (door lanes) is always left clear so floors stay connected. ctx: { set, get, room, rng, T, kind }.
export default {
  id: 'rooms-greenmarrow',
  biome: 'greenmarrow',
  decorate({ set, room, rng, T, kind }) {
    const cx = Math.floor(room.cx), cy = Math.floor(room.cy);
    const v = Math.floor(rng.next() * 3);
    const quad = (fn) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) fn(sx, sy); };
    if (kind === 'keeper' || kind === 'start') {
      quad((sx, sy) => set(cx + sx * 7, cy + sy * 5, T.GREENMARROW));
      return;
    }
    if (v === 0) quad((sx, sy) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) set(cx + sx * (4 + i), cy + sy * (2 + j), T.DUNGEON_WALL); });   // root pillars
    else if (v === 1) quad((sx, sy) => { for (let i = 3; i < 7; i++) set(cx + sx * i, cy + sy * 3, T.DUNGEON_WALL); });   // root walls
    // moss patches
    for (let n = 0; n < 10; n++) {
      const x = room.x + 1 + Math.floor(rng.next() * (room.w - 2)), y = room.y + 1 + Math.floor(rng.next() * (room.h - 2));
      if (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) set(x, y, T.GREENMARROW);
    }
  },
};
