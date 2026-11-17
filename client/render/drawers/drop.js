// Ground item: item sprite bobbing over a shadow, with a stack count.

import { drawText } from '../text.js';

export default {
  kinds: [],
  types: ['drop'],
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    const age = (view.now - (e.born ?? 0)) / 1000;
    const pop = age < 0.35 ? Math.sin((age / 0.35) * Math.PI) * 6 : 0;
    const bob = Math.round(Math.sin(time * 4 + e.i) * 1.5 + 1.5 + pop);
    view.sprites.drawShadow(ctx, sx, sy + 1, 8, 0.3);
    view.sprites.draw(ctx, 'item.' + e.it, sx, sy - bob, { scaleX: 0.75, scaleY: 0.75 });
    if (e.q > 1) drawText(ctx, String(e.q), sx + 6, sy - bob - 6, { align: 'center' });
  },
};
