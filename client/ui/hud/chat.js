// WP13: chat (bottom-left, above the pickup feed) and the ping wheel (DESIGN A.9).
// Enter opens the input (Enter sends, Esc cancels, Up recalls). Lines fade after 6 s unless the input is open.
// Hold T: a wheel with four presets (need this / danger / look here / on my way) around the cursor; release over
// a sector to ping, tap T for a quick "look here". Pings arrive as `chat` messages with `ping` and are kept in
// `recentPings` for the minimap; the `ping` fx preset is drawn by WP12 at the spot.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS, playerColor } from '../../art/palette.js';
import { measure } from '../../render/text.js';

export const PING_WHEEL = Object.freeze([
  { kind: 'need', label: 'Need this', ang: -Math.PI / 2, color: PAL[RAMPS.gold[4]] },
  { kind: 'danger', label: 'Danger', ang: 0, color: PAL[RAMPS.ember[3]] },
  { kind: 'look', label: 'Look here', ang: Math.PI / 2, color: PAL[RAMPS.teal[4]] },
  { kind: 'omw', label: 'On my way', ang: Math.PI, color: PAL[RAMPS.grass[4]] },
]);
const DEAD_ZONE = 7;

// Sector under an offset from the wheel centre (UI px; +y is down). null inside the dead zone.
export function pingKindAt(dx, dy) {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'danger' : 'omw';
  return dy < 0 ? 'need' : 'look';
}

export const recentPings = [];       // { x, y, kind, realm, color, name, t }
const LINES_MAX = 60, SHOW = 7, FADE_S = 6, LINE_H = 10, MAX_LEN = 160;
const st = { hooked: null, lines: [], open: false, text: '', history: [], hIdx: -1, wheel: null, err: '', errAt: 0 };

function hook(ui, store) {
  if (st.hooked === store) return;
  st.hooked = store;
  store.on('chat', (m) => {
    const now = performance.now();
    st.lines.push({ from: m.from || '', text: String(m.text ?? ''), color: m.color, sys: !!m.sys || !m.from, ping: m.ping ?? null, t: now });
    if (st.lines.length > LINES_MAX) st.lines.shift();
    if (m.ping) {
      recentPings.push({ ...m.ping, color: m.color, name: m.from, t: now });
      if (recentPings.length > 24) recentPings.shift();
      ui.ui.audio?.play('ping', {});
    }
  });
}

function openInput(ui) {
  const input = ui.ui.input;
  if (input.textCapture) return;
  st.open = true;
  st.text = '';
  st.hIdx = -1;
  input.textCapture = (e) => {
    if (e.type && e.type !== 'keydown') return;
    if (e.key === 'Enter') { send(ui); close(ui); }
    else if (e.key === 'Escape') close(ui);
    else if (e.key === 'Backspace') st.text = st.text.slice(0, -1);
    else if (e.key === 'ArrowUp') { if (st.history.length) { st.hIdx = Math.min(st.history.length - 1, st.hIdx + 1); st.text = st.history[st.history.length - 1 - st.hIdx]; } }
    else if (e.key === 'ArrowDown') { st.hIdx = Math.max(-1, st.hIdx - 1); st.text = st.hIdx < 0 ? '' : st.history[st.history.length - 1 - st.hIdx]; }
    else if (e.key && e.key.length === 1 && /[\x20-\x7e]/.test(e.key) && st.text.length < MAX_LEN) st.text += e.key;
  };
}
function close(ui) {
  st.open = false;
  if (ui.ui.input.textCapture) ui.ui.input.textCapture = null;
}
function send(ui) {
  const text = st.text.trim();
  if (!text) return;
  st.history.push(text);
  if (st.history.length > 30) st.history.shift();
  ui.ui.net?.do('chat.say', { text }).then((r) => {
    if (!r.ok) { st.err = r.err === 'cooldown' ? 'Slow down a little.' : 'Message not sent.'; st.errAt = performance.now(); }
  });
}

function drawLog(ui, now) {
  const x = 6, baseY = ui.h - 62;
  const vis = st.lines.slice(-SHOW);
  let y = baseY - vis.length * LINE_H;
  if (st.open) {
    ui.ctx.fillStyle = 'rgba(13,10,20,0.55)';
    ui.ctx.fillRect(ui.x + x - 3, ui.y + y - 3, 214, vis.length * LINE_H + 4);
  }
  for (const l of vis) {
    const age = (now - l.t) / 1000;
    const a = st.open ? 1 : Math.max(0, Math.min(1, (FADE_S - age) / 1));
    if (a > 0) {
      ui.ctx.save();
      ui.ctx.globalAlpha = a;
      if (l.sys) ui.label(x, y, l.text, { color: UI_COLORS.dim, outline: true });
      else {
        const name = l.from + ':';
        ui.label(x, y, name, { color: Number.isInteger(l.color) && l.color >= 0 ? playerColor(l.color) : UI_COLORS.accent, outline: true });
        const pc = l.ping ? PING_WHEEL.find((p) => p.kind === l.ping.kind)?.color : null;
        ui.label(x + measure(name) + 5, y, l.ping ? `[${l.text}]` : l.text, { color: pc ?? '#ffffff', outline: true });
      }
      ui.ctx.restore();
    }
    y += LINE_H;
  }
  if (st.open) {
    const iy = baseY + 2;
    ui.rect(x - 3, iy, 214, 12, UI_COLORS.borderDark);
    ui.rect(x - 2, iy + 1, 212, 10, UI_COLORS.bg);
    let shown = st.text;
    while (measure(shown) > 196 && shown.length) shown = shown.slice(1);
    ui.label(x, iy + 2, shown || 'Say something... (/help)', { color: shown ? '#ffffff' : UI_COLORS.dim });
    if (Math.floor(now / 450) % 2) ui.rect(x + measure(shown) + 1, iy + 2, 1, 7, UI_COLORS.accent);
  }
  if (st.err && now - st.errAt < 2000) ui.label(x, baseY + 16, st.err, { color: UI_COLORS.bad, outline: true });
}

function drawWheel(ui, now) {
  const input = ui.ui.input;
  const mgr = ui.ui;
  if (!st.wheel && input.pressed('ping') && !input.textCapture) {
    const cam = typeof window !== 'undefined' ? window.__tb?.camera : null;
    if (!cam) return;
    const w = cam.screenToWorld(input.mouse.x, input.mouse.y, { x: 0, y: 0 });
    st.wheel = { cx: mgr.mouse.x, cy: mgr.mouse.y, wx: w.x, wy: w.y, t0: now };
  }
  if (!st.wheel) return;
  const W = st.wheel;
  const dx = mgr.mouse.x - W.cx, dy = mgr.mouse.y - W.cy;
  const kind = pingKindAt(dx, dy);
  const held = (now - W.t0) / 1000;
  if (input.released('ping') || !input.held('ping')) {
    const k = kind ?? (held < 0.3 ? 'look' : null);
    if (k) mgr.net?.do('ping.mark', { x: +W.wx.toFixed(2), y: +W.wy.toFixed(2), kind: k });
    st.wheel = null;
    return;
  }
  if (held < 0.12) return;
  const c = ui.ctx, RX = 52, RY = 22;
  c.save();
  c.globalAlpha = Math.min(1, (held - 0.12) / 0.1);
  c.fillStyle = 'rgba(13,10,20,0.45)';
  c.beginPath(); c.ellipse(W.cx, W.cy, RX + 8, RY + 14, 0, 0, Math.PI * 2); c.fill();
  for (const p of PING_WHEEL) {
    const on = p.kind === kind;
    const px = Math.round(W.cx + Math.cos(p.ang) * RX), py = Math.round(W.cy + Math.sin(p.ang) * RY);
    const w = measure(p.label) + 10;
    ui.rect(px - w / 2 - ui.x, py - 7 - ui.y, w, 14, on ? p.color : UI_COLORS.borderDark);
    ui.rect(px - w / 2 + 1 - ui.x, py - 6 - ui.y, w - 2, 12, on ? UI_COLORS.bgLight : UI_COLORS.bg);
    ui.label(px - ui.x, py - 3 - ui.y, p.label, { color: on ? p.color : '#ffffff', align: 'center' });
  }
  ui.rect(W.cx - 2 - ui.x, W.cy - 2 - ui.y, 5, 5, kind ? PING_WHEEL.find((p) => p.kind === kind).color : UI_COLORS.border);
  c.restore();
}

export default {
  id: 'chat',
  anchor: 'bottom-left',
  order: 80,
  draw(ui, store) {
    hook(ui, store);
    const now = performance.now();
    const input = ui.ui.input;
    if (!st.open && !input.textCapture && input.pressed('chat') && store.myId && !ui.ui.isOpen('title')) openInput(ui);
    if (st.open && input.textCapture == null) st.open = false;
    while (recentPings.length && now - recentPings[0].t > 12000) recentPings.shift();
    drawLog(ui, now);
    drawWheel(ui, now);
  },
};
