// Resource node: sprite 'node.<kind>' drawn with its palette variant (pub `v`, 0 = base) and mirrored by entity id
// for variety, falling back to the core tree/rock by node class.

const FALLBACK = { wood: 'core.tree', stone: 'core.rock', ore: 'core.rock', gem: 'core.rock' };

export default {
  kinds: [],
  types: ['node'],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y) + 7;
    let id = 'node.' + e.k;
    if (!view.sprites.has(id)) {
      const cls = view.content.nodes.byId[e.k]?.cls;
      if (FALLBACK[cls]) id = FALLBACK[cls];
    }
    const sq = view.juice.squashOf(e.i);
    const big = e.big ? 1.5 : 1;
    view.sprites.drawShadow(ctx, sx, sy - 1, Math.round(12 * big), 0.3);
    view.sprites.draw(ctx, id, sx, sy, {
      variant: e.v | 0, flip: ((e.i * 7 + (e.v | 0)) & 2) === 2, scaleX: sq.sx * big, scaleY: sq.sy * big,
      flash: e.flashUntil > view.now,
    });
  },
};
