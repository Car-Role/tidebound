// WP10 dungeon panel: Vault / Trench entry (cost, Keeper, party), blessing pick (3 cards), run results, and the
// in-run summary with a Leave button. Opened by the combat HUD when the server offers something; Esc closes.

import { content } from '../../../shared/data/index.js';
import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { measure } from '../../render/text.js';

const C = (r, i) => PAL[RAMPS[r][i]];
const MECHANIC = {
  spores: 'Spore clouds drift through the halls - burst them with your weapon.',
  water_level: 'Water rises and falls - pull the levers to drain the way.',
  conveyors: 'Flame jets sweep the floors. Time your steps.',
  mirrors: 'Rotate the mirrors to route the beam and open the way.',
  ice_blocks: 'Push the ice blocks onto the frost marks.',
  darkness: 'Darkness swallows the light. Bring a lantern.',
};

function wrap(text, width) {
  const out = [];
  let line = '';
  for (const w of String(text).split(' ')) {
    const next = line ? line + ' ' + w : w;
    if (measure(next) > width && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

const state = { view: null, msg: '', msgAt: 0, busy: false };

function act(ui, a, d, after) {
  if (state.busy) return;
  state.busy = true;
  ui.ui.net.do(a, d).then((res) => {
    state.busy = false;
    if (!res?.ok) {
      state.msg = res?.err === 'cost' ? 'You need a Vault Key.' : res?.err === 'locked' ? 'Locked - light Beacon 3 first.' : res?.err === 'range' ? 'Too far away.' : 'Not now.';
      state.msgAt = performance.now();
    } else after?.(res);
  });
}

function close(ui) { ui.ui.close('dungeon'); }

function drawEntry(ui, d) {
  const e = d.entry;
  ui.frame(e.name ?? 'Vault');
  let y = 18;
  if (e.kind === 'trench') {
    for (const l of wrap('An endless spiral of arenas beneath the start plot. Every floor is harder than the last; every 5th holds a Keeper.', ui.w - 16)) { ui.label(8, y, l); y += 9; }
    y += 3;
    ui.label(8, y, `Deepest floor: ${e.deepest ?? 0}`, { color: C('teal', 4) }); y += 12;
    if (e.locked) { ui.label(8, y, 'Sealed until Beacon 3 is lit.', { color: UI_COLORS.bad }); y += 10; }
  } else {
    ui.label(8, y, `Keeper: ${e.keeper}`, { color: C('violet', 4) }); y += 10;
    ui.label(8, y, `${e.floors} floors  -  cleared ${e.clears ?? 0}x`, { color: UI_COLORS.dim }); y += 11;
    for (const l of wrap(MECHANIC[e.mechanic] ?? '', ui.w - 16)) { ui.label(8, y, l, { color: C('sand', 4) }); y += 9; }
    y += 3;
    if (e.active) ui.label(8, y, `Your party is inside (floor ${e.active.floor}). Join them.`, { color: UI_COLORS.good });
    else if (e.cost) ui.label(8, y, `Costs 1 ${content.items?.byId?.[e.cost]?.name ?? e.cost} (have ${e.have})`, { color: e.have > 0 ? '#ffffff' : UI_COLORS.bad });
    else ui.label(8, y, 'Your first entry is free.', { color: UI_COLORS.good });
    y += 12;
    ui.label(8, y, 'Allies within range enter with you.', { color: UI_COLORS.dim });
  }
  const can = !(e.kind === 'trench' && e.locked) && !(e.cost && !(e.have > 0) && !e.active);
  if (ui.button(ui.w - 104, ui.h - 20, e.active ? 'Join' : 'Enter', { w: 46, disabled: !can || state.busy })) act(ui, 'dungeon.enter', { id: e.id }, () => close(ui));
  if (ui.button(ui.w - 54, ui.h - 20, 'Close', { w: 46 })) close(ui);
}

function drawOffer(ui, d) {
  ui.frame('Blessing Altar - choose one');
  const choices = d.offer.choices;
  const cw = Math.floor((ui.w - 16 - (choices.length - 1) * 6) / choices.length);
  choices.forEach((id, i) => {
    const b = content.blessings?.byId?.[id] ?? { name: id, text: '' };
    const x = 8 + i * (cw + 6), y = 18, h = ui.h - 26;
    const hot = ui.hover(x, y, cw, h);
    ui.rect(x, y, cw, h, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, cw - 2, h - 2, hot ? UI_COLORS.slotHover : UI_COLORS.bgLight);
    ui.rect(x + cw / 2 - 5, y + 6, 10, 10, C('gold', 3));
    ui.rect(x + cw / 2 - 2, y + 9, 4, 4, '#ffffff');
    let ty = y + 22;
    for (const l of wrap(b.name, cw - 8)) { ui.label(x + cw / 2, ty, l, { color: C('gold', 4), align: 'center' }); ty += 9; }
    ty += 3;
    for (const l of wrap(b.text, cw - 8)) { ui.label(x + cw / 2, ty, l, { color: '#ffffff', align: 'center' }); ty += 9; }
    if (ui.button(x + cw / 2 - 18, y + h - 18, 'Take', { w: 36, key: 'take' + i, disabled: state.busy })) act(ui, 'blessing.pick', { index: i }, () => close(ui));
  });
}

function drawResults(ui, d) {
  const r = d.results;
  ui.frame(r.cleared ? 'Vault cleared!' : 'Run over');
  const mm = Math.floor((r.seconds ?? 0) / 60), ss = String((r.seconds ?? 0) % 60).padStart(2, '0');
  let y = 20;
  ui.label(ui.w / 2, y, r.name ?? '', { color: C('gold', 4), align: 'center', scale: 2 }); y += 20;
  ui.label(8, y, `Time: ${mm}:${ss}`); y += 10;
  ui.label(8, y, `${content.bosses?.byId?.[r.keeper]?.name ?? 'The Keeper'} defeated`, { color: C('violet', 4) }); y += 10;
  if (r.first) { ui.label(8, y, 'First clear: Vault Core, a skill point and a bonus draft!', { color: UI_COLORS.good }); y += 10; }
  ui.label(8, y, `Clears: ${r.clears ?? 1}`, { color: UI_COLORS.dim });
  if (d.in && ui.button(ui.w - 104, ui.h - 20, 'Leave', { w: 46, disabled: state.busy })) act(ui, 'dungeon.leave', {}, () => close(ui));
  if (ui.button(ui.w - 54, ui.h - 20, 'Close', { w: 46 })) close(ui);
}

function drawRun(ui, d) {
  ui.frame(d.kind === 'trench' ? `The Trench - floor ${d.floor}` : `${d.name} - floor ${d.floor}/${d.floors}`);
  let y = 18;
  const bl = d.blessings ?? [];
  if (!bl.length) { ui.label(8, y, 'No blessings yet. Find an altar.', { color: UI_COLORS.dim }); y += 10; }
  for (const id of bl) {
    const b = content.blessings?.byId?.[id];
    ui.label(8, y, b?.name ?? id, { color: C('gold', 4) });
    ui.label(8 + measure(b?.name ?? id) + 6, y, b?.text ?? '', { color: '#ffffff' });
    y += 10;
  }
  ui.label(8, ui.h - 30, 'Blessings fade when you leave.', { color: UI_COLORS.dim });
  if (ui.button(ui.w - 104, ui.h - 20, 'Leave', { w: 46, disabled: state.busy })) act(ui, 'dungeon.leave', {}, () => close(ui));
  if (ui.button(ui.w - 54, ui.h - 20, 'Close', { w: 46 })) close(ui);
}

export default {
  id: 'dungeon',
  key: null,
  modal: false,
  w: 300, h: 132, anchor: 'center',
  open(store, args) { state.view = args?.view ?? null; state.msg = ''; state.busy = false; },
  close() { state.view = null; },
  draw(ui, store) {
    const d = store.self.dungeon ?? {};
    const want = state.view;
    if (d.offer && (want === 'offer' || !want || d.in)) drawOffer(ui, d);
    else if (want === 'results' && d.results) drawResults(ui, d);
    else if (!d.in && d.entry) drawEntry(ui, d);
    else if (d.in) drawRun(ui, d);
    else if (d.results) drawResults(ui, d);
    else { ui.frame('Vault'); ui.label(8, 20, 'Find a Vault entrance on a vault plot.', { color: UI_COLORS.dim }); if (ui.button(ui.w - 54, ui.h - 20, 'Close', { w: 46 })) close(ui); }
    if (state.msg && performance.now() - state.msgAt < 3000) ui.label(8, ui.h - 17, state.msg, { color: UI_COLORS.bad });
  },
};
