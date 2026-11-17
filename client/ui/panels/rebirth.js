// WP11: the end of a run. Three modes: 'credits' (rolls after Moonfall; skippable), 'vote' (the Turning: what resets,
// what stays, Moon Shard preview, the crew's votes and the countdown) and 'chart' (the Moon Chart: 20 perks).
// Reads world.rebirth, self.moon, world.coop, world.telemetry. Actions: rebirth.vote {yes}, moon.buy {perk}.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';
import { content } from '../../../shared/data/index.js';
import { wrapText } from './dialog.js';

const MODES = ['credits', 'vote', 'chart'];
const st = { mode: 'vote', t0: 0, busy: false, msg: '', msgAt: 0, scroll: 0 };
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} m`;

const RESETS = ['Plots and structures', 'Inventories, gear, Glint', 'Level, cards, skill points', 'Quests and the Tidegate'];
const KEEPS = ['The Archive', 'Logbook and cosmetics', 'Class Mastery, bestiary', 'Moon Chart, recipes, Trench record'];

function creditLines(store) {
  const crew = (store.world.coop?.players ?? []).map((p) => ({ text: p.name, color: playerColor(p.color) }));
  const tele = (store.world.telemetry ?? []).map((x) => ({ text: `${x.label} - ${hm(x.t)}`, color: UI_COLORS.dim }));
  const L = (text, color = UI_COLORS.text, big = false) => ({ text, color, big });
  return [
    L('TIDEBOUND', PAL[RAMPS.gold[4]], true), L(''), L('Moonfall', UI_COLORS.accent), L(''),
    L('The sea drew back, and stayed back.', UI_COLORS.dim), L('Every plot you raised is still there, for now.', UI_COLORS.dim), L(''),
    L('The crew', UI_COLORS.accent), ...crew, L(''),
    L('The castaways', UI_COLORS.accent),
    ...content.npcs.map((n) => L(`${n.name} - ${n.role}`)), L(''),
    L('The Wardens', UI_COLORS.accent),
    ...content.bosses.filter((b) => b.kind === 'warden').map((b) => L(b.name)), L(''),
    L('The run', UI_COLORS.accent), ...tele, L(''),
    L('Thank you for playing.', UI_COLORS.accent), L(''),
    L('The tide always comes back.', UI_COLORS.dim), L('At the Tidestone, the crew may Turn it.', UI_COLORS.dim),
  ];
}

function act(ui, a, d, okText) {
  if (st.busy) return;
  st.busy = true;
  ui.ui.net.do(a, d).then((r) => {
    st.busy = false;
    st.msgAt = performance.now();
    st.msg = r.ok ? okText : (r.d?.reason ?? { range: 'Vote at the Tidestone', locked: 'Defeat the Drowned Moon first', denied: 'Only bound crew vote', cost: 'Not enough Moon Shards', full: 'Max rank' }[r.err] ?? 'Failed');
  });
}

function drawCredits(ui, store) {
  const c = ui.ctx;
  const W = ui.ui.W, H = ui.ui.H;
  c.fillStyle = 'rgba(8,6,16,0.97)';
  c.fillRect(0, 0, W, H);
  const t = (performance.now() - st.t0) / 1000;
  // stars and a broken moon
  for (let i = 0; i < 60; i++) {
    const x = (i * 97) % W, y = (i * 53) % H;
    c.fillStyle = (Math.sin(t * 2 + i) > 0.6) ? '#ffffff' : PAL[RAMPS.ink[3]];
    c.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + t * 0.05, r = 26 + (i % 3) * 9 + t * 0.6;
    c.fillStyle = PAL[RAMPS.violet[2 + (i % 3)]];
    c.fillRect(Math.round(W * 0.82 + Math.cos(a) * r), Math.round(H * 0.25 + Math.sin(a) * r), 3 + (i % 2), 3);
  }
  const lines = creditLines(store);
  const speed = 14;
  const y0 = H + 10 - t * speed;
  let y = y0;
  for (const l of lines) {
    if (y > -20 && y < H + 10) ui.label(W / 2 - ui.x, y - ui.y, l.text, { color: l.color, align: 'center', scale: l.big ? 3 : 1, outline: true });
    y += l.big ? 28 : 11;
  }
  if (y < 0) st.mode = 'vote';
  if (ui.button(W - ui.x - 84, H - ui.y - 20, 'Skip credits', { key: 'skip', w: 78 })) st.mode = 'vote';
}

function drawVote(ui, store) {
  const r = store.world.rebirth ?? {};
  const m = store.self.moon ?? { shards: 0, preview: null };
  const L = 10, colW = 214;
  ui.label(L, 28, 'The Turning', { color: UI_COLORS.accent });
  let y = 40;
  const intro = r.available
    ? 'The whole crew votes at the Tidestone. When everyone agrees the island sinks, the sea rises one step higher, and you begin again - stronger.'
    : 'Defeat the Drowned Moon to unlock the Turning.';
  for (const l of wrapText(intro, colW)) { ui.label(L, y, l, { color: UI_COLORS.dim }); y += 9; }
  y += 5;
  ui.label(L, y, 'Resets', { color: UI_COLORS.bad }); y += 10;
  for (const x of RESETS) { ui.label(L + 4, y, '- ' + x); y += 9; }
  y += 4;
  ui.label(L, y, 'Keeps', { color: UI_COLORS.good }); y += 10;
  for (const x of KEEPS) { ui.label(L + 4, y, '+ ' + x); y += 9; }
  y += 4;
  const th = r.tideHeight ?? 0;
  const thText = 'Tide Height ' + th + ' -> ' + Math.min(10, th + 1) + ': enemies +40% HP and +25% damage, land and world costs +15% per step.';
  for (const l of wrapText(thText, colW)) { ui.label(L, y, l, { color: PAL[RAMPS.violet[4]] }); y += 9; }

  const x = 244, w = 126;
  ui.rect(x - 8, 28, 1, ui.h - 40, UI_COLORS.border);
  ui.label(x, 28, 'Moon Shards', { color: PAL[RAMPS.violet[4]] });
  const p = m.preview;
  if (p) {
    const rows = [['Drowned Moon', p.finalBoss], ['Levels', p.levels], ['Archive wings', p.wings], ['Trench', p.trench], ['Quests', p.quests]];
    rows.forEach(([k, v], i) => { ui.label(x, 40 + i * 9, k, { color: UI_COLORS.dim }); ui.label(x + w, 40 + i * 9, '+' + v, { align: 'right' }); });
    ui.rect(x, 86, w, 1, UI_COLORS.border);
    ui.label(x, 90, 'You receive', { color: UI_COLORS.accent }); ui.label(x + w, 90, String(p.total), { color: UI_COLORS.accent, align: 'right' });
  }
  ui.label(x, 108, 'Votes', { color: UI_COLORS.accent });
  (r.needed ?? []).slice(0, 8).forEach((name, i) => {
    const v = r.votes?.[name];
    const off = r.offline?.includes(name);
    const mark = v === true ? 'yes' : v === false ? 'no' : off ? 'away' : '...';
    ui.label(x, 118 + i * 9, name, { color: v === true ? UI_COLORS.good : v === false ? UI_COLORS.bad : UI_COLORS.text });
    ui.label(x + w, 118 + i * 9, mark, { color: v === true ? UI_COLORS.good : v === false ? UI_COLORS.bad : UI_COLORS.dim, align: 'right' });
  });
  if (r.offline?.length) for (const [i, l] of wrapText('Away crew must return or be unbound by the host.', w).entries()) ui.label(x, 194 + i * 9, l, { color: UI_COLORS.dim });
  if (r.countdown != null) ui.label(ui.w / 2, 70, String(r.countdown), { color: PAL[RAMPS.gold[4]], align: 'center', scale: 4, outline: true });
  if (r.available) {
    if (ui.button(x, ui.h - 18, 'Vote yes', { key: 'yes', w: 60 })) act(ui, 'rebirth.vote', { yes: true }, 'You voted yes');
    if (ui.button(x + 66, ui.h - 18, 'Vote no', { key: 'no', w: 60 })) act(ui, 'rebirth.vote', { yes: false }, 'You voted no');
  }
}

function drawChart(ui, store) {
  const m = store.self.moon ?? { shards: 0, perks: {} };
  ui.label(10, 28, `Moon Chart - ${m.shards} Moon Shards. Perks are kept forever.`, { color: PAL[RAMPS.violet[4]] });
  content.rebirth.forEach((perk, i) => {
    const x = 8 + (i % 4) * 92, y = 42 + Math.floor(i / 4) * 34;
    const rank = m.perks?.[perk.id] ?? 0, max = perk.ranks;
    const cost = rank < max ? perk.cost[rank] : null;
    const afford = cost != null && m.shards >= cost;
    const hot = ui.hover(x, y, 88, 30);
    ui.rect(x, y, 88, 30, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, 86, 28, rank >= max ? PAL[RAMPS.violet[1]] : hot && afford ? UI_COLORS.slotHover : UI_COLORS.bgLight);
    let name = perk.name; if (name.length > 14) name = name.slice(0, 13) + '.';
    ui.label(x + 4, y + 3, name, { color: rank ? PAL[RAMPS.violet[4]] : UI_COLORS.text });
    for (let k = 0; k < max; k++) ui.rect(x + 4 + k * 7, y + 18, 5, 5, k < rank ? PAL[RAMPS.violet[4]] : UI_COLORS.border);
    ui.label(x + 84, y + 17, cost == null ? 'max' : `${cost}`, { color: cost == null ? UI_COLORS.dim : afford ? UI_COLORS.good : UI_COLORS.bad, align: 'right' });
    if (hot) ui.tooltip(`${perk.name}\n${perk.text}${max > 1 ? ' (per rank)' : ''}\nRank ${rank}/${max}${cost != null ? `, next costs ${cost}` : ''}`);
    if (hot && afford && ui.ui.mouse.released) { ui.ui.consumeClick(); act(ui, 'moon.buy', { perk: perk.id }, `${perk.name} rank ${rank + 1}`); }
  });
  ui.label(10, ui.h - 14, `Turnings so far: ${m.turnings ?? 0}`, { color: UI_COLORS.dim });
}

export default {
  id: 'rebirth',
  key: null,
  modal: false,
  w: 384, h: 236, anchor: 'center',

  open(store, args) {
    st.mode = MODES.includes(args?.mode) ? args.mode : (store.world.rebirth?.available ? 'vote' : 'chart');
    st.t0 = performance.now();
    st.msg = '';
  },
  close() {},

  draw(ui, store) {
    if (st.mode === 'credits') { drawCredits(ui, store); return; }
    ui.frame('');
    const i = ui.tabs(6, 3, ['The Turning', 'Moon Chart', 'Credits'], st.mode === 'chart' ? 1 : 0);
    if (i === 1) st.mode = 'chart';
    else if (i === 2) { st.mode = 'credits'; st.t0 = performance.now(); }
    else st.mode = 'vote';
    if (ui.button(ui.w - 16, 2, 'x', { key: 'close', w: 12, h: 10 })) { ui.ui.close('rebirth'); return; }
    if (st.mode === 'chart') drawChart(ui, store); else drawVote(ui, store);
    if (st.msg && performance.now() - st.msgAt < 3000) ui.label(ui.w - 8, 16, st.msg, { color: UI_COLORS.accent, align: 'right', outline: true });
  },
};
