// support_shield (Gloom Lantern): floats among its allies (keeping out of the player's reach) and keeps every
// other enemy within `radius` shielded until it is killed.
export default {
  id: 'support_shield',
  tick(game, m, dt, k, t) {
    const p = m.data.aiParams, ai = m.data.ai;
    const R = p.radius ?? 6;
    const realm = k.realm(m);
    const allies = realm.query(m.x, m.y, 12, [], (o) => (o.type === 'mob' || o.type === 'boss') && o !== m && !o.removed && o.hp > 0 && o.kind !== m.kind);
    if (allies.length) {
      // hover at the allies' centre, nudged away from the nearest player
      let cx = 0, cy = 0;
      for (const o of allies) { cx += o.x; cy += o.y; }
      cx /= allies.length; cy /= allies.length;
      if (t) {
        const a = Math.atan2(cy - t.y, cx - t.x);
        cx += Math.cos(a) * 2.5; cy += Math.sin(a) * 2.5;
        if (k.dist(m, t) < 3.5) { k.away(m, t.x, t.y, 1); }
        else if (Math.hypot(cx - m.x, cy - m.y) > 1) k.toward(m, cx, cy, 0.8);
        else k.stop(m);
      } else if (Math.hypot(cx - m.x, cy - m.y) > 2) k.toward(m, cx, cy, 0.6);
      else k.stop(m);
    } else if (t) {
      const d = k.dist(m, t);
      if (d < 5) k.away(m, t.x, t.y, 0.9);
      else if (d > 9) k.toward(m, t.x, t.y, 0.6);
      else k.orbit(m, t.x, t.y, 7, 1, 0.4);
    }
    ai.pulse = (ai.pulse ?? 0) - dt;
    if (ai.pulse > 0) return;
    ai.pulse = 2.5;
    for (const o of allies) {
      if (Math.hypot(o.x - m.x, o.y - m.y) > R) continue;
      k.applyStatus(o, 'shield', { duration: 3.5, power: o.maxHp * 0.12, refresh: true, max: o.maxHp * 0.12, source: m, quiet: true });
      k.fx(m, 'shield_pop', { link: o.id, x2: Math.round(o.x * 100) / 100, y2: Math.round(o.y * 100) / 100 }, m.x, m.y);
    }
  },
};
