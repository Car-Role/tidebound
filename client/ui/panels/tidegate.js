// WP11: the Tidegate panel (opened at the gate_site). Five-stage track, current stage needs, deliveries, and after
// stage 5 the descent to the Drowned Moon. Reads world.tidegate (see server/game/systems/tidegate.js).

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { content } from '../../../shared/data/index.js';
import { wrapText } from './dialog.js';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const st = { busy: false, msg: '', msgAt: 0 };

function act(ui, d, okText) {
  if (st.busy) return;
  st.busy = true;
  ui.ui.net.do('tidegate.deliver', d).then((r) => {
    st.busy = false;
    st.msgAt = performance.now();
    if (r.ok) { st.msg = okText; if (d.stage === 6) ui.ui.close('tidegate'); }
    else st.msg = r.d?.reason ?? ({ range: 'Stand at the Tidegate site', cost: 'You carry nothing it needs', locked: 'Locked', busy: 'Busy' }[r.err] ?? 'Failed');
  });
}

function drawTrack(ui, tg, t) {
  const x0 = 44, y = 28, step = 70;
  for (let i = 0; i < tg.total; i++) {
    const x = x0 + i * step;
    if (i < tg.total - 1) ui.rect(x + 8, y + 3, step - 8, 2, i < tg.stage ? UI_COLORS.good : UI_COLORS.border);
    const done = i < tg.stage, cur = i === tg.stage;
    const pulse = cur ? Math.round((Math.sin(t * 4) + 1) * 1.5) : 0;
    ui.rect(x - pulse, y - pulse, 9 + pulse * 2, 9 + pulse * 2, done ? UI_COLORS.good : cur ? UI_COLORS.accent : UI_COLORS.border);
    ui.label(x + 4, y + 12, tg.stages[i].name, { color: done ? UI_COLORS.good : cur ? UI_COLORS.accent : UI_COLORS.dim, align: 'center' });
  }
}

export default {
  id: 'tidegate',
  key: null,
  modal: false,
  w: 370, h: 200, anchor: 'center',
  open() { st.msg = ''; },
  close() {},

  draw(ui, store) {
    const tg = store.world.tidegate;
    const t = performance.now() / 1000;
    ui.frame('The Tidegate');
    if (ui.button(ui.w - 16, 2, 'x', { key: 'close', w: 12, h: 10 })) { ui.ui.close('tidegate'); return; }
    if (!tg) { ui.label(10, 30, 'The site is quiet.', { color: UI_COLORS.dim }); return; }
    drawTrack(ui, tg, t);

    if (!tg.moon && tg.current) {
      const c = tg.current;
      ui.label(10, 54, `Stage ${c.stage}: ${c.name}`, { color: UI_COLORS.accent });
      ui.label(360, 54, `${Math.floor((c.progress || 0) * 100)}%`, { color: UI_COLORS.dim, align: 'right' });
      ui.bar(10, 64, 350, 5, c.progress || 0, 1, UI_COLORS.accent, { light: PAL[RAMPS.gold[4]] });
      let y = 74;
      const inv = store.self.inv?.slots ?? [];
      const have = (id) => inv.reduce((s, sl) => s + (sl && sl[0] === id ? sl[1] : 0), 0);
      for (const n of c.needs) {
        const done = n.have >= n.need;
        ui.ui.sprites?.draw(ui.ctx, 'item.' + n.item, ui.x + 18, ui.y + y + 11, { scaleX: 0.75, scaleY: 0.75 });
        ui.label(28, y + 1, content.items.byId[n.item]?.name ?? n.item, { color: done ? UI_COLORS.good : UI_COLORS.text });
        ui.bar(130, y + 2, 150, 5, n.have, n.need, done ? UI_COLORS.good : UI_COLORS.accent);
        ui.label(360, y + 1, `${fmt(n.have)}/${fmt(n.need)}`, { color: done ? UI_COLORS.good : UI_COLORS.dim, align: 'right' });
        const carry = have(n.item);
        if (carry && !done) ui.label(284, y + 1, `+${fmt(Math.min(carry, n.need - n.have))}`, { color: UI_COLORS.good });
        y += 12;
      }
      if (c.glint?.need) {
        const done = c.glint.have >= c.glint.need;
        ui.label(28, y + 1, 'Glint (Treasury)', { color: done ? UI_COLORS.good : UI_COLORS.text });
        ui.bar(130, y + 2, 150, 5, c.glint.have, c.glint.need, done ? UI_COLORS.good : PAL[RAMPS.gold[3]]);
        ui.label(360, y + 1, `${fmt(c.glint.have)}/${fmt(c.glint.need)}`, { color: UI_COLORS.dim, align: 'right' });
        y += 12;
      }
      y += 2;
      const wOk = c.wings.have >= c.wings.need;
      ui.label(10, y, `Archive wings ${c.wings.have}/${c.wings.need}`, { color: wOk ? UI_COLORS.good : UI_COLORS.bad });
      if (c.trench?.need) ui.label(150, y, `Trench floor ${c.trench.have}/${c.trench.need}`, { color: c.trench.have >= c.trench.need ? UI_COLORS.good : UI_COLORS.bad });
      y += 11;
      if (c.locked) wrapText('Locked: ' + c.locked, 350).forEach((l, i) => ui.label(10, y + i * 9, l, { color: UI_COLORS.bad }));
      else ui.label(10, y, 'Sluices and Gulls can feed the site directly.', { color: UI_COLORS.dim });
      if (ui.button(10, 180, 'Deliver what I carry', { key: 'deliver', disabled: !!c.locked || st.busy })) act(ui, { stage: c.stage }, 'Delivered!');
      ui.label(360, 183, 'Each stage: +150,000 XP, machines +10%', { color: UI_COLORS.dim, align: 'right' });
    } else {
      // the descent
      const f = tg.finale ?? {};
      const glow = PAL[RAMPS.violet[Math.floor((Math.sin(t * 2) + 1) * 1.5) + 1]];
      ui.rect(135, 56, 100, 60, UI_COLORS.borderDark);
      ui.rect(136, 57, 98, 58, PAL[RAMPS.ink[0]]);
      ui.ctx.fillStyle = glow;
      ui.ctx.beginPath(); ui.ctx.arc(ui.x + 185, ui.y + 86, 18 + Math.sin(t * 1.5) * 2, 0, Math.PI * 2); ui.ctx.fill();
      ui.ctx.fillStyle = PAL[RAMPS.ink[0]];
      ui.ctx.beginPath(); ui.ctx.arc(ui.x + 193, ui.y + 80, 16, 0, Math.PI * 2); ui.ctx.fill();
      const lines = {
        ready: 'The Tidegate is whole. Below it the sea floor lies bare, and the Drowned Moon waits. Everyone near you descends together.',
        intro: 'The descent has begun. Others can still join by descending now.',
        fight: 'The crew fights the Drowned Moon below. You may descend to join them.',
        victory: 'The Moon is broken.',
        credits: 'Moonfall. The Turning awaits at the Tidestone.',
        done: 'Moonfall. The Turning awaits at the Tidestone.',
        locked: 'Complete all five stages.',
      };
      wrapText(lines[f.stage] ?? '', 350).forEach((l, i) => ui.label(10, 122 + i * 9, l, { color: UI_COLORS.text }));
      if (f.party?.length) ui.label(10, 152, 'Below: ' + f.party.join(', '), { color: UI_COLORS.accent });
      if (f.boss) ui.bar(10, 164, 350, 5, f.boss.hp, f.boss.mh, UI_COLORS.hp);
      const canGo = ['ready', 'intro', 'fight'].includes(f.stage);
      if (canGo && ui.button(10, 180, f.stage === 'ready' ? 'Descend to the Drowned Moon' : 'Descend and join', { key: 'descend' })) act(ui, { stage: 6 }, 'Descending...');
      if (['credits', 'done'].includes(f.stage) && ui.button(10, 180, 'The Turning...', { key: 'turn' })) ui.ui.open('rebirth', { mode: 'vote' });
      if (f.wins) ui.label(360, 183, `Victories: ${f.wins}`, { color: UI_COLORS.dim, align: 'right' });
    }
    if (st.msg && performance.now() - st.msgAt < 3000) ui.label(360, 170, st.msg, { color: UI_COLORS.accent, align: 'right', outline: true });
  },
};
