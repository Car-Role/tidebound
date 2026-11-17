// WP13: pause menu (Esc). The world keeps running for everyone (co-op); this only frees the mouse.
// Tabs: Menu (resume, settings, journal, Moon Chart, leave), Crew (players, bound status, host tools: kick,
// unbind, daily spend cap) and Records (pacing telemetry: "Beacon 3 at 36 h 10 m", DESIGN A.9).

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';
import { resetTutorial } from './tutorial.js';

const st = { tab: 0, busy: false, msg: '', msgAt: 0, confirm: null };
const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} m`;
const CAPS = [[null, 'Off'], [1000, '1k'], [5000, '5k'], [20000, '20k']];

function act(ui, a, d, okText) {
  if (st.busy) return;
  st.busy = true;
  ui.ui.net.do(a, d).then((r) => {
    st.busy = false;
    st.msgAt = performance.now();
    st.msg = r.ok ? okText : ({ denied: 'Host only', invalid: 'Not possible' }[r.err] ?? 'Failed');
  });
}

function drawMenu(ui, store) {
  const c = store.world.coop ?? {};
  const bx = 14, bw = 120;
  let y = 32;
  const btn = (text, key, fn) => { if (ui.button(bx, y, text, { w: bw, key })) fn(); y += 16; };
  btn('Resume', 'resume', () => ui.ui.close('pause'));
  btn('Settings', 'settings', () => { ui.ui.close('pause'); ui.ui.open('settings'); });
  btn('Journal', 'journal', () => { ui.ui.close('pause'); ui.ui.open('journal'); });
  if (store.self.moon?.shards || store.world.rebirth?.available) btn('Moon Chart / Turning', 'moon', () => { ui.ui.close('pause'); ui.ui.open('rebirth', { mode: store.world.rebirth?.available ? 'vote' : 'chart' }); });
  btn('Tutorial tips', 'tut', () => { ui.ui.close('pause'); resetTutorial(); });
  y += 6;
  if (st.confirm === 'leave') {
    ui.label(bx, y + 2, 'Leave the world?', { color: UI_COLORS.bad });
    y += 12;
    if (ui.button(bx, y, 'Yes, leave', { key: 'leaveyes', w: 58 })) { try { window.__tb?.net?.ws?.close(); } catch { /* ignore */ } location.reload(); }
    if (ui.button(bx + 62, y, 'Stay', { key: 'leaveno', w: 58 })) st.confirm = null;
  } else btn('Leave to title', 'leave', () => { st.confirm = 'leave'; });

  const x = 150;
  ui.rect(x - 6, 30, 1, 150, UI_COLORS.border);
  ui.label(x, 32, c.worldName ? `World: ${c.worldName}` : 'World', { color: UI_COLORS.accent });
  ui.label(x, 44, `Played: ${hm(c.playtimeS ?? 0)}`);
  ui.label(x, 56, `Online: ${(c.players ?? []).length}/${c.max ?? 8}`);
  ui.label(x, 68, `Crew size ${c.S ?? 1} - costs x${(c.scale ?? 1).toFixed(1)}`);
  if (c.pending) ui.label(x, 80, `Changes to ${c.pending.S} in ${Math.ceil(c.pending.inS / 60)} min`, { color: UI_COLORS.accent });
  ui.label(x, 96, `Tide Height ${store.world.tideHeight ?? 0}`, { color: PAL[RAMPS.violet[4]] });
  const net = typeof window !== 'undefined' ? window.__tb?.net : null;
  if (net) ui.label(x, 108, `Ping ${Math.round(net.rtt || 0)} ms`, { color: UI_COLORS.dim });
  const me = (c.players ?? []).find((p) => p.id === store.myId);
  if (me?.host) ui.label(x, 120, 'You are the host. See Crew.', { color: UI_COLORS.good });
  ui.label(x, 150, 'The world keeps running while', { color: UI_COLORS.dim });
  ui.label(x, 159, 'this menu is open.', { color: UI_COLORS.dim });
}

function drawCrew(ui, store) {
  const c = store.world.coop ?? {};
  const me = (c.players ?? []).find((p) => p.id === store.myId);
  const host = !!me?.host;
  const rows = [...(c.players ?? [])];
  for (const b of c.bound ?? []) if (!b.online) rows.push({ uid: b.uid, name: b.name, offline: true, bound: true });
  ui.label(10, 30, `Bound crew (${c.boundMinutes ?? 30}+ min in the last 10 h) scales costs.`, { color: UI_COLORS.dim });
  ui.list(8, 42, 300, 126, rows, 16, (p, y, hot) => {
    if (hot) ui.rect(8, y, 298, 15, UI_COLORS.slotHover);
    ui.rect(12, y + 4, 6, 6, p.offline ? UI_COLORS.dim : playerColor(p.color ?? 0));
    ui.label(22, y + 3, p.name + (p.host ? ' *' : '') + (p.id === store.myId ? ' (you)' : ''), { color: p.offline ? UI_COLORS.dim : UI_COLORS.text });
    ui.label(120, y + 3, p.offline ? 'offline' : p.bound ? 'bound' : `${p.minutes ?? 0}/${c.boundMinutes ?? 30} min`, { color: p.bound ? UI_COLORS.good : UI_COLORS.dim });
    const cap = c.caps?.[p.uid];
    if (cap != null) ui.label(170, y + 3, `cap ${cap >= 1000 ? cap / 1000 + 'k' : cap}`, { color: UI_COLORS.accent });
    if (host && p.id !== store.myId) {
      let bx = 306;
      if (p.bound) { bx -= 40; if (ui.button(bx, y + 1, 'Unbind', { key: 'ub' + p.uid, w: 38, h: 12 })) act(ui, 'coop.unbind', { id: p.uid }, `${p.name} unbound`); }
      if (!p.offline && !p.host) { bx -= 32; if (ui.button(bx, y + 1, 'Kick', { key: 'k' + p.uid, w: 30, h: 12 })) act(ui, 'coop.kick', { id: p.id }, `${p.name} removed`); }
      if (hot) {
        let cx = 200;
        for (const [v, l] of CAPS) {
          if (cx + 18 > bx - 2) break;
          if (ui.button(cx, y + 1, l, { key: 'cap' + p.uid + l, w: 18, h: 12, tooltip: 'Daily spend cap' })) act(ui, 'coop.spendcap', { id: p.uid, glint: v }, `Cap set for ${p.name}`);
          cx += 19;
        }
      }
    }
  }, 'crew');
  ui.label(10, 172, host ? 'Hover a row for spend caps. Chat: /kick /unbind' : 'Only the host can kick, unbind or cap spending.', { color: UI_COLORS.dim });
}

function drawRecords(ui, store) {
  const list = store.world.telemetry ?? [];
  ui.label(10, 30, 'Milestones (world playtime when first reached)', { color: UI_COLORS.dim });
  if (!list.length) { ui.label(10, 46, 'Nothing yet. Raise your first plot!', { color: UI_COLORS.dim }); return; }
  ui.list(8, 42, 300, 140, list, 11, (x, y) => {
    ui.label(12, y + 2, x.label);
    ui.label(300, y + 2, hm(x.t), { color: UI_COLORS.accent, align: 'right' });
  }, 'tele');
}

export default {
  id: 'pause',
  key: null,
  modal: true,
  w: 316, h: 192, anchor: 'center',
  open() { st.confirm = null; st.msg = ''; },
  close() {},

  draw(ui, store) {
    ui.frame('Paused');
    st.tab = ui.tabs(60, 2, ['Menu', 'Crew', 'Records'], st.tab);
    if (st.tab === 0) drawMenu(ui, store);
    else if (st.tab === 1) drawCrew(ui, store);
    else drawRecords(ui, store);
    if (st.msg && performance.now() - st.msgAt < 2500) ui.label(ui.w - 8, ui.h - 11, st.msg, { color: UI_COLORS.accent, align: 'right', outline: true });
  },
};
