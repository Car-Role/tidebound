// WP5 zone drawer + the shared combat render passes used by every WP5/WP10 drawer.
//
// Ground pass: telegraphs, hazard pools and beams must sit UNDER characters, but the renderer only knows
// y-sorted entities. A pseudo entity ('__ground') is placed at the top edge of the view so it sorts first and
// draws everything queued with ground(e) during this frame's drawer updates. A second one ('__overlay') sorts
// last and draws dungeon darkness over the world. Also hosts the floating damage numbers and attacker hitstop
// (driven by `entity:hurt` + the `hc`/`hd`/`hb` keys WP5 publishes on enemies).

import { PAL, RAMPS } from '../../art/palette.js';
import juice from '../../fx/juice.js';
import { STATUSES } from '../../../shared/data/registries.js';

export const C = (ramp, i) => PAL[RAMPS[ramp][i]];
export const BIT = Object.freeze(Object.fromEntries(STATUSES.map((s, i) => [s, 1 << i])));
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- passes

const groundQ = [];
const overlayQ = [];
let hookedStore = null;
const PSEUDO = [
  { i: -9001, ty: 'zone', k: '__ground' },
  { i: -9002, ty: 'zone', k: '__overlay' },
];
const noBuf = { sample: () => false, push() {} };

export function ensurePasses(view) {
  const store = view.store;
  if (!store) return;
  for (const p of PSEUDO) {
    if (!store.entities.has(p.i)) store.entities.set(p.i, { i: p.i, ty: p.ty, k: p.k, buf: noBuf, x: -1e6, y: -1e6, rx: -1e6, ry: -1e6, hp: 0, mh: 0, f: 0, s: 0, pseudo: true });
  }
  if (hookedStore !== store) {
    hookedStore = store;
    store.on('entity:hurt', ({ e, dmg }) => { if (e && !e.pseudo) queueMicrotask(() => hurtFeedback(store, e, dmg)); });
  }
}

export function ground(e) { groundQ.push(e); }
export function overlay(e) { overlayQ.push(e); }

const groundDrawers = new Map();          // entity type -> fn(ctx, e, view)
export function registerGround(type, fn) { groundDrawers.set(type, fn); }

function hurtFeedback(store, e, dmg) {
  if (!(dmg > 0)) return;
  const x = e.rx ?? e.x, y = (e.ry ?? e.y) - (e.ty === 'boss' ? 2.2 : 1);
  const crit = e.hc !== undefined && e.hc !== e._hcSeen;
  e._hcSeen = e.hc;
  if (e.ty === 'mob' || e.ty === 'boss') {
    juice.number(x, y, String(Math.round(dmg)), crit ? 'crit' : 'dmg');
    const direct = e.hd !== undefined && e.hd !== e._hdSeen;
    e._hdSeen = e.hd;
    if (direct && e.hb === store.myId) {
      juice.hitstop(crit ? 70 : 40);
      juice.shake(crit ? 6 : 2, crit ? 0.18 : 0.08);
    }
    e._flash = performance.now() + 70;
  } else if (e.ty === 'player') {
    juice.number(x, y, '-' + Math.round(dmg), 'dmg');
    if (e.i === store.myId) {
      juice.shake(Math.min(8, 3 + dmg / Math.max(1, e.mh) * 20), 0.2);
      juice.flash(C('ember', 2), 0.16, 0.18);
    }
  }
}

// ---------------------------------------------------------------- shape helpers

export function sx(view, x) { return x * 16 - view.x; }
export function sy(view, y) { return y * 16 - view.y; }

// Draw a telegraph shape. k = fill progress 0..1. danger palette unless safe.
export function drawShape(ctx, view, s, k, opts = {}) {
  const safe = !!opts.safe;
  const edge = opts.edge ?? (safe ? C('grass', 4) : C('ember', 3));
  const fill = opts.fill ?? (safe ? C('grass', 3) : C('ember', 2));
  const x = sx(view, s.x), y = sy(view, s.y);
  const pulse = 0.75 + 0.25 * Math.sin(view.time * 18);
  ctx.save();
  ctx.lineWidth = 1;
  switch (s.shape ?? s.sh) {
    case 'line': {
      const a = s.a ?? 0, len = (s.len ?? s.l ?? 4) * 16, w = (s.w ?? 1) * 16;
      ctx.translate(x, y); ctx.rotate(a);
      ctx.globalAlpha = 0.18 * (opts.alpha ?? 1); ctx.fillStyle = fill; ctx.fillRect(0, -w / 2, len, w);
      ctx.globalAlpha = 0.45 * (opts.alpha ?? 1); ctx.fillRect(0, -w / 2, len * k, w);
      ctx.globalAlpha = pulse * (opts.alpha ?? 1); ctx.strokeStyle = edge; ctx.strokeRect(0.5, -w / 2 + 0.5, len - 1, w - 1);
      break;
    }
    case 'cone': {
      const a = s.a ?? 0, r = (s.r ?? 2) * 16, arc = ((s.arc ?? 90) * Math.PI) / 180;
      ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a - arc / 2, a + arc / 2); ctx.closePath();
      ctx.globalAlpha = 0.18 * (opts.alpha ?? 1); ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.max(0.1, r * k), a - arc / 2, a + arc / 2); ctx.closePath();
      ctx.globalAlpha = 0.4 * (opts.alpha ?? 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a - arc / 2, a + arc / 2); ctx.closePath();
      ctx.globalAlpha = pulse * (opts.alpha ?? 1); ctx.strokeStyle = edge; ctx.stroke();
      break;
    }
    case 'ring': {
      const r = (s.r ?? 3) * 16, r2 = (s.r2 ?? 0) * 16;
      ctx.translate(x, y);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.arc(0, 0, Math.max(0, r2), 0, TAU, true);
      ctx.globalAlpha = (0.2 + 0.25 * k) * (opts.alpha ?? 1); ctx.fillStyle = fill; ctx.fill('evenodd');
      ctx.globalAlpha = pulse * (opts.alpha ?? 1); ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      if (r2 > 1) { ctx.beginPath(); ctx.arc(0, 0, r2, 0, TAU); ctx.stroke(); }
      break;
    }
    case 'rect': {
      const w = (s.w ?? 2) * 16, h = (s.h ?? 2) * 16;
      ctx.globalAlpha = 0.16 * (opts.alpha ?? 1); ctx.fillStyle = fill; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.globalAlpha = 0.38 * (opts.alpha ?? 1); ctx.fillRect(x - (w / 2) * k, y - (h / 2) * k, w * k, h * k);
      ctx.globalAlpha = pulse * (opts.alpha ?? 1); ctx.strokeStyle = edge; ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
      break;
    }
    default: {
      const r = (s.r ?? 1) * 16;
      ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, 0, TAU);
      ctx.globalAlpha = 0.16 * (opts.alpha ?? 1); ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, r * k), Math.max(0.5, r * k), 0, 0, TAU);
      ctx.globalAlpha = 0.38 * (opts.alpha ?? 1); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, 0, TAU);
      ctx.globalAlpha = pulse * (opts.alpha ?? 1); ctx.strokeStyle = edge; ctx.stroke();
    }
  }
  ctx.restore();
}

// Telegraph `tg` published on a mob/boss: progress measured from the first frame this tg (by seq n) was seen.
export function drawEntityTelegraph(ctx, view, e) {
  const tg = e.tg;
  if (!tg || typeof tg !== 'object') return;
  if (e._tgN !== tg.n) { e._tgN = tg.n; e._tgAt = view.now; }
  const dur = Math.max(0.05, tg.t ?? 0.6) * 1000;
  const k = tg.t > 0 ? Math.min(1, (view.now - e._tgAt) / dur) : 1;
  drawShape(ctx, view, tg, k, { alpha: tg.t > 0 ? 1 : 0.85 });
}

// Rotating arms / beams published as `arm` (angle), `arms` (count), `al` (length).
export function drawArms(ctx, view, e, palette = 'ember') {
  if (!e.arms) return;
  const x = sx(view, e.rx), y = sy(view, e.ry - 0.2);
  const len = (e.al ?? 9) * 16;
  ctx.save();
  for (let i = 0; i < e.arms; i++) {
    const a = (e.arm ?? 0) + (i / e.arms) * TAU;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    const flick = 0.85 + 0.15 * Math.sin(view.time * 40 + i);
    ctx.globalAlpha = 0.35; ctx.fillStyle = C(palette, 2); ctx.fillRect(0, -9, len, 18);
    ctx.globalAlpha = 0.8 * flick; ctx.fillStyle = C(palette, 3); ctx.fillRect(0, -5, len, 10);
    ctx.globalAlpha = 0.95; ctx.fillStyle = C(palette, 4); ctx.fillRect(0, -2, len, 4);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- zone visuals

const ZONE_STYLE = {
  fire: ['ember', 2, 3], ink: ['ink', 0, 3], spore: ['grass', 3, 4], frost: ['ice', 3, 4], flood: ['sea', 3, 4],
  silence: ['violet', 2, 4], warm: ['ember', 3, 4], tidepool: ['sea', 3, 4], heal_orb: ['grass', 3, 4],
  // WP6 ability zones (BUILD_REVIEW P2-23)
  crater: ['brown', 1, 3], wind_wall: ['ice', 3, 4], undertow: ['sea', 2, 4], soaked: ['sea', 3, 4],
  puddle: ['sea', 3, 4], verdant_tide: ['grass', 2, 4],
};
const RING_COLORS = ['ember', 'grass', 'brown', 'ember', 'violet', 'sea', 'gold'];

function drawZoneGround(ctx, e, view) {
  const x = sx(view, e.rx), y = sy(view, e.ry);
  const r = (e.r ?? 1) * 16;
  const left = (e.t ?? 30) / 10;
  if (e._born == null) e._born = view.now;
  const age = (view.now - e._born) / 1000;
  const fadeIn = Math.min(1, age / 0.2);
  if (e.k === 'telegraph') {
    const dur = Math.max(0.05, (e.wd ?? e.t ?? 6) / 10) * 1000;
    const k = Math.min(1, (view.now - e._born) / dur);
    const s = { shape: e.sh ?? 'circle', x: e.rx, y: e.ry, r: e.r, len: e.l, w: e.w, a: e.a, r2: e.r2, arc: e.arc, h: e.h };
    const color = e.c ? ['ember', 'sea', 'grass', 'gold', 'violet'][(e.c - 1) % 5] : null;
    drawShape(ctx, view, s, k, { safe: !!e.sf, edge: color && !e.sf ? C(color, 4) : undefined, fill: color && !e.sf ? C(color, 2) : undefined });
    return;
  }
  if (e.sh === 'ring') {
    const r2 = (e.r2 ?? 0) * 16;
    const col = RING_COLORS[(e.c ?? 0) % RING_COLORS.length];
    ctx.save();
    ctx.translate(x, y);
    const gaps = e.gp ?? [];
    const draw = (a0, a1) => {
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.arc(0, 0, Math.max(0, r2), a1, a0, true); ctx.closePath();
      ctx.globalAlpha = 0.55; ctx.fillStyle = C(col, 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = C(col, 4); ctx.beginPath(); ctx.arc(0, 0, r - 0.5, a0, a1); ctx.stroke();
    };
    if (!gaps.length) draw(0, TAU);
    else {
      const sorted = gaps.map(([a, arc]) => [((a - arc * Math.PI / 360) % TAU + TAU) % TAU, arc * Math.PI / 180]).sort((p, q) => p[0] - q[0]);
      for (let i = 0; i < sorted.length; i++) {
        const end = sorted[i][0] + sorted[i][1];
        const next = i + 1 < sorted.length ? sorted[i + 1][0] : sorted[0][0] + TAU;
        if (next > end) draw(end, next);
      }
    }
    ctx.restore();
    return;
  }
  const st = ZONE_STYLE[e.k] ?? ['stone', 2, 3];
  const fade = Math.min(1, left / 0.6) * fadeIn;
  ctx.save();
  if (e.sh === 'rect') {
    const w = (e.w ?? 2) * 16, h = (e.h ?? 2) * 16;
    ctx.globalAlpha = 0.32 * fade; ctx.fillStyle = C(st[0], st[1]); ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = C(st[0], st[2]);
    for (let i = 0; i < 6; i++) {
      const ox = ((Math.sin(view.time * 1.3 + i * 7.1) + 1) / 2) * w - w / 2, oy = ((Math.cos(view.time * 0.9 + i * 3.7) + 1) / 2) * h - h / 2;
      ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 6, 1);
    }
    ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = C(st[0], st[2]); ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
  } else {
    const wob = 1 + 0.04 * Math.sin(view.time * 3 + e.i);
    ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = C(st[0], st[1]);
    ctx.beginPath(); ctx.ellipse(x, y, r * wob, r * 0.8 * wob, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = C(st[0], st[2]);
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.6, r * 0.45, 0, 0, TAU); ctx.fill();
    // flecks: flames, bubbles, motes
    for (let i = 0; i < 5; i++) {
      const a = view.time * (e.k === 'fire' ? 2.5 : 0.8) + i * 1.257 + e.i;
      const px = x + Math.cos(a) * r * 0.6, py = y + Math.sin(a * 1.3) * r * 0.45 - (e.k === 'fire' ? (view.time * 20 + i * 5) % 6 : 0);
      ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = C(st[0], 4);
      ctx.fillRect(Math.round(px), Math.round(py), 1, e.k === 'fire' ? 2 : 1);
    }
  }
  ctx.restore();
}

function drawZoneUpright(ctx, e, view) {
  // burstable spore pods and heal orbs stand up off the ground
  const x = sx(view, e.rx), y = sy(view, e.ry);
  const bob = Math.sin(view.time * 4 + e.i) * 1.5;
  if (e.k === 'spore_pod') {
    view.sprites.drawShadow(ctx, x, y + 2, 10);
    ctx.fillStyle = C('grass', 2); ctx.beginPath(); ctx.ellipse(x, y - 5 + bob, 5, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C('grass', 4); ctx.beginPath(); ctx.ellipse(x - 1, y - 7 + bob, 2, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C('gold', 4); ctx.fillRect(x + 1, y - 4 + bob, 1, 1); ctx.fillRect(x - 3, y - 3 + bob, 1, 1);
  } else if (e.k === 'heal_orb') {
    ctx.globalAlpha = 0.5; ctx.fillStyle = C('grass', 4); ctx.beginPath(); ctx.arc(x, y - 6 + bob, 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 7 + bob, 5, 1); ctx.fillRect(x, y - 9 + bob, 1, 5);
  } else if (e.k === 'spore') {
    for (let i = 0; i < 4; i++) {
      const a = view.time * 0.7 + i * 1.6 + e.i;
      ctx.globalAlpha = 0.7; ctx.fillStyle = C('gold', 4);
      ctx.fillRect(Math.round(x + Math.cos(a) * (e.r ?? 1) * 10), Math.round(y - 6 + Math.sin(a * 1.4) * 6), 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- overlay: dungeon darkness

let darkCanvas = null, darkCtx = null;
function drawDarkness(ctx, view) {
  const d = view.store.self?.dungeon;
  if (!d?.in || !d.dark) return;
  const me = view.store.me?.();
  if (!me) return;
  const W = Math.ceil(view.w), H = Math.ceil(view.h);
  if (!darkCanvas || darkCanvas.width !== W || darkCanvas.height !== H) {
    darkCanvas = document.createElement('canvas'); darkCanvas.width = W; darkCanvas.height = H; darkCtx = darkCanvas.getContext('2d');
  }
  const g = darkCtx;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(13,10,20,0.94)';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const light = (wx, wy, rTiles) => {
    const x = wx * 16 - view.x, y = wy * 16 - view.y, r = rTiles * 16;
    const grad = g.createRadialGradient(x, y, r * 0.35, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  const lr = d.dark.r ?? Math.max(3, view.store.self?.stats?.lightRadius ?? 5);
  for (const e of view.store.entities.values()) {
    if (e.ty === 'player') light(e.rx ?? e.x, (e.ry ?? e.y) - 0.5, e.i === view.store.myId ? lr : lr * 0.8);
    else if ((e.k === 'brazier' && e.on) || e.k === 'keeper_brazier' || e.k === 'warm') light(e.rx ?? e.x, e.ry ?? e.y, 4);
  }
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCanvas, 0, 0);
}

// ---------------------------------------------------------------- drawer

export default {
  kinds: ['__ground', '__overlay'],
  types: ['zone'],
  update(e, dt, view) {
    if (e.pseudo) {
      // pin to the top / bottom edge of the view so y-sorting puts them first / last
      e.rx = view.x / 16 + 1;
      e.ry = e.k === '__ground' ? (view.y - 47.5) / 16 : (view.y + view.h + 40) / 16;
      return;
    }
    ensurePasses(view);
    ground(e);
  },
  draw(ctx, e, time, view) {
    if (e.k === '__ground') {
      for (const g of groundQ) {
        try {
          if (g.ty === 'zone') drawZoneGround(ctx, g, view);
          else groundDrawers.get(g.ty)?.(ctx, g, view);
        } catch (err) { if (!g._gerr) { g._gerr = true; console.error('[tb:zone] ground draw', g.ty, g.k, err); } }
      }
      groundQ.length = 0;
      return;
    }
    if (e.k === '__overlay') {
      for (const o of overlayQ) groundDrawers.get('overlay:' + o.ty)?.(ctx, o, view);
      overlayQ.length = 0;
      drawDarkness(ctx, view);
      return;
    }
    drawZoneUpright(ctx, e, view);
  },
};
