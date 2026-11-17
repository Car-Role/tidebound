// WP13: toasts (top-centre) plus the client shell glue that has to run every frame:
//  - toast stack from server `toast` messages (kinds info / good / warn / quest; "Deed:" toasts get a medal),
//  - the self.ui router: when the server sets self.ui = { panel, ...args } the named panel opens with those args
//    (self.ui = { close: '<panelId>' } closes one). Any package may use it.
//  - saved settings applied once the client handles exist (window.__tb),
//  - the world card cache the title screen shows (localStorage),
//  - opening the onboarding card while a tutorial step is pending,
//  - connection overlay (reconnecting / kicked / rejected),
//  - cinematic letterbox and captions for Tidegate stages and the finale (WP11 state in world.tidegate).

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { measure } from '../../render/text.js';
import { loadSettings, applyEverywhere } from '../panels/settings.js';
import { tutorialWanted, drawTutorialCard } from '../panels/tutorial.js';
import { worldCacheKey } from '../panels/title.js';
import { wrapText } from '../panels/dialog.js';

const LIFE = 4.5, MAX_VISIBLE = 4;
const STYLE = {
  info: { edge: PAL[RAMPS.ink[4]], text: '#ffffff' },
  good: { edge: PAL[RAMPS.grass[3]], text: PAL[RAMPS.grass[4]] },
  warn: { edge: PAL[RAMPS.ember[3]], text: PAL[RAMPS.ember[4]] },
  quest: { edge: PAL[RAMPS.gold[3]], text: PAL[RAMPS.gold[4]] },
};
const REASONS = {
  kicked: 'The host removed you from this world.',
  replaced: 'This castaway was opened in another tab or window.',
  full: 'This world is full (8 castaways).',
  version: 'The server runs a different version. Refresh the page.',
  name: 'That name cannot be used. Pick another on the title screen.',
  shutdown: 'The host closed the world.',
};

const st = {
  hooked: null, toasts: [], applied: false, tutCheck: 0, tutShown: false, cinematic: false, lastCut: null, wasConnected: false, lostAt: 0, attempts: 0,
};

function hook(ui, store) {
  if (st.hooked === store) return;
  st.hooked = store;
  const mgr = ui.ui;
  store.on('toast', (m) => {
    st.toasts.push({ text: String(m.text ?? ''), kind: STYLE[m.kind] ? m.kind : 'info', t0: performance.now() });
    if (st.toasts.length > 12) st.toasts.splice(0, st.toasts.length - 12);
    if (m.kind === 'quest') mgr.audio?.play('quest_done', {});
    else if (/^Deed:/.test(m.text)) mgr.audio?.play('levelup', {});
  });
  store.on('change:self.ui', (d) => {
    if (!d) return;
    // a stale request (e.g. replayed in `welcome` after a reconnect) must not pop a panel open
    if (Number.isFinite(d.t) && store.serverTime(performance.now()) / 1000 - d.t > 3) return;
    if (d.close && mgr.get(d.close)) mgr.close(d.close);
    if (d.panel && mgr.get(d.panel)) {
      if (mgr.isOpen(d.panel)) mgr.close(d.panel);
      mgr.open(d.panel, d);
    }
  });
  store.on('change:world.coop', (c) => {
    if (!c) return;
    try {
      localStorage.setItem(worldCacheKey(), JSON.stringify({
        worldName: c.worldName, playtimeS: c.playtimeS, S: c.S, max: c.max,
        bound: (c.bound ?? []).map((b) => b.name), online: (c.players ?? []).map((p) => p.name), at: Date.now(),
      }));
    } catch { /* ignore */ }
  });
  store.on('welcome', () => { st.attempts = 0; });
}

// Top-centre layout (BUILD_REVIEW P1-6). The top row is: HP/Surge bars (left, to x 102), the tutorial card and
// toasts (centre band), Treasury + clock + Flux (x from W - 204) and the minimap (right). The centre band is the
// free span between them, so the card never covers the Treasury or the clock at any UI width (>= 480).
const LEFT_COL = 108, RIGHT_COL = 208, TOP_Y = 4;
function topBand(W) {
  const free = W - RIGHT_COL - LEFT_COL;
  const w = Math.max(180, Math.min(300, free - 8));
  const x = free >= w ? LEFT_COL + Math.round((free - w) / 2) : Math.round((W - w) / 2);
  return { x, w };
}

function drawToasts(ui, now) {
  st.toasts = st.toasts.filter((x) => now - x.t0 < LIFE * 1000);
  const vis = st.toasts.slice(-MAX_VISIBLE);
  const band = topBand(ui.w);
  let y = st.tutShown ? TOP_Y + st.tutShown + 4 : TOP_Y + 2;
  for (const t of vis) {
    const age = (now - t.t0) / 1000;
    const a = Math.min(1, age / 0.15, (LIFE - age) / 0.5);
    const s = STYLE[t.kind];
    const deed = /^Deed:/.test(t.text);
    const big = t.kind === 'quest';
    const pad = deed || big ? 24 : 12;
    const lines = measure(t.text) + pad <= band.w ? [t.text] : wrapText(t.text, band.w - pad).slice(0, 3);
    const w = Math.min(band.w, Math.max(...lines.map(measure)) + pad);
    const h = (big ? 15 : 13) + (lines.length - 1) * 9;
    const x = Math.round(band.x + band.w / 2 - w / 2);
    const slide = Math.round((1 - Math.min(1, age / 0.15)) * -8);
    ui.ctx.save();
    ui.ctx.globalAlpha = Math.max(0, a);
    ui.rect(x, y + slide, w, h, UI_COLORS.borderDark);
    ui.rect(x + 1, y + slide + 1, w - 2, h - 2, big ? PAL[RAMPS.ink[2]] : UI_COLORS.bg);
    ui.rect(x + 1, y + slide + h - 2, w - 2, 1, s.edge);
    if (deed || big) {
      const cx = x + 8, cy = y + slide + Math.floor(h / 2);
      ui.rect(cx - 3, cy - 3, 7, 7, deed ? PAL[RAMPS.gold[3]] : PAL[RAMPS.gold[4]]);
      ui.rect(cx - 1, cy - 1, 3, 3, deed ? PAL[RAMPS.gold[1]] : PAL[RAMPS.ember[3]]);
    }
    lines.forEach((l, i) => ui.label(x + (deed || big ? 16 : 6), y + slide + (big ? 4 : 3) + i * 9, l, { color: s.text }));
    ui.ctx.restore();
    y += h + 3;
  }
}

function drawConnection(ui, store, now) {
  const net = typeof window !== 'undefined' ? window.__tb?.net : null;
  if (!net) return;
  if (net.connected) { st.wasConnected = true; st.lostAt = 0; return; }
  if (!st.wasConnected && !net.closedByServer) return;      // still on the first connect: renderer shows "Connecting..."
  if (!st.lostAt) { st.lostAt = now; st.attempts++; }
  const c = ui.ctx;
  c.save();
  c.fillStyle = 'rgba(8,6,16,0.6)';
  c.fillRect(0, 0, ui.w, ui.h);
  const bw = 230, bh = 54, bx = Math.round(ui.w / 2 - bw / 2), by = Math.round(ui.h / 2 - bh / 2);
  ui.rect(bx, by, bw, bh, UI_COLORS.borderDark);
  ui.rect(bx + 1, by + 1, bw - 2, bh - 2, UI_COLORS.bg);
  const why = net.closedByServer;
  if (why && why.reason !== 'shutdown') {
    ui.label(ui.w / 2, by + 7, why.t === 'reject' ? 'Could not join' : 'Disconnected', { color: UI_COLORS.bad, align: 'center' });
    ui.label(ui.w / 2, by + 19, REASONS[why.reason] ?? `Reason: ${why.reason}`, { align: 'center' });
    if (ui.button(ui.w / 2 - 40, by + 34, 'Back to title', { w: 80, key: 'backtitle' })) location.reload();
  } else {
    const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3));
    ui.label(ui.w / 2, by + 9, `Connection lost. Reconnecting${dots}`, { color: UI_COLORS.accent, align: 'center' });
    ui.label(ui.w / 2, by + 21, `${Math.floor((now - st.lostAt) / 1000)} s - your castaway is safe in the save.`, { color: UI_COLORS.dim, align: 'center' });
    const spin = Math.floor(now / 120) % 8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ui.rect(Math.round(ui.w / 2 + Math.cos(a) * 6) - 1, Math.round(by + 40 + Math.sin(a) * 6) - 1, 2, 2, i === spin ? UI_COLORS.accent : UI_COLORS.border);
    }
  }
  c.restore();
  void store;
}

// Letterbox and captions: Tidegate stage completion (6 s) and the finale intro / victory.
function drawCinematic(ui, store, now) {
  const tg = store.world.tidegate;
  const srvNow = store.serverTime(now) / 1000;
  let caption = null, title = null, k = 0;
  const cut = tg?.cutscene;
  if (cut && srvNow - cut.at >= 0 && srvNow - cut.at < 6.5) {
    const t = srvNow - cut.at;
    k = Math.min(1, t / 0.5, (6.5 - t) / 0.5);
    title = `Tidegate - Stage ${cut.stage}`;
    caption = `${cut.name} complete. The crew grows stronger; machines run faster.`;
    if (st.lastCut !== cut.at) { st.lastCut = cut.at; ui.ui.audio?.play('quest_done', {}); }
  }
  const f = tg?.finale;
  if (f && (f.stage === 'intro' || f.stage === 'victory') && f.caption && (store.realm.kind === 'moon' || f.stage === 'victory')) {
    k = 1;
    caption = f.caption;
    title = f.stage === 'intro' ? 'The Drowned Moon' : 'Moonfall';
  } else if (f?.caption && f.stage === 'fight' && store.realm.kind === 'moon') {
    caption = f.caption; k = Math.max(k, 0.6);
  }
  if (!caption && !title) return false;
  const bar = Math.round(22 * k);
  ui.rect(0, 0, ui.w, bar, '#000000');
  ui.rect(0, ui.h - bar, ui.w, bar, '#000000');
  if (title && k > 0.5) ui.label(ui.w / 2, Math.round(ui.h * 0.22), title, { color: PAL[RAMPS.gold[4]], align: 'center', scale: 2, outline: true });
  if (caption && k > 0.3) ui.label(ui.w / 2, ui.h - bar + 7, caption, { color: '#ffffff', align: 'center', outline: false });
  return true;
}

export default {
  id: 'toasts',
  anchor: 'top',
  order: 95,
  draw(ui, store) {
    hook(ui, store);
    const now = performance.now();
    const tb = typeof window !== 'undefined' ? window.__tb : null;
    if (!st.applied && tb?.renderer) { st.applied = true; applyEverywhere(loadSettings(), ui.ui); }
    if (st.applied && !st.bindsSynced && ui.ui.input?.loadBindings) {
      // keys rebound on the title screen were saved to localStorage; pick them up
      st.bindsSynced = true;
      ui.ui.input.bindings = ui.ui.input.loadBindings();
      ui.ui.input.rebuild();
    }
    st.cinematic = drawCinematic(ui, store, now);
    st.tutShown = false;
    if (store.myId && !st.cinematic && !ui.ui.isOpen('tutorial') && !ui.ui.isOpen('title') && !ui.ui.anyModal() && tutorialWanted(store)) {
      const r = topBand(ui.ui.W);
      ui.bind(ui.ctx, { x: r.x, y: TOP_Y, w: r.w, h: 34 }, 'hud:tutorial');
      st.tutShown = drawTutorialCard(ui, store);
      ui.bind(ui.ctx, { x: 0, y: 0, w: ui.ui.W, h: ui.ui.H }, 'hud:toasts');
    }
    drawToasts(ui, now);
    drawConnection(ui, store, now);
  },
};
