// WP9 fishing overlay (opens by itself while a rod is equipped and you aim at water in range).
// Aim: a cast line to the target tile; LMB casts. Wait for the bite, then click within the bite window to set the hook.
// Reel: hold LMB to reel (the marker rises), release to slack (it sinks); keep it inside the moving green zone until
// the catch meter fills. RMB reels in. The server runs the same physics and decides the catch; this panel predicts
// the marker locally for instant feel and snaps to the server every 100 ms.

import { content } from '../../../shared/data/index.js';
import { drawText } from '../../render/text.js';
import { C, RARITY_COLOR, itemName, worldToUi, mouseWorld, myPos, overOtherPanel } from './inventory.js';

// Same constants as server/game/systems/fishing.js (REEL, zoneAt, reelStep).
const REEL = { up: 4.6, down: 3.6, damp: 2.2, start: 0.3, drain: 0.32 };
const CAST_RANGE = 6;
const zoneAt = (z, t) => 0.5 + z.A * (0.62 * Math.sin(z.w1 * t + z.p1) + 0.38 * Math.sin(z.w2 * t + z.p2));
function reelStep(g, z, hold, dt, catchT) {
  g.v += (hold ? REEL.up : -REEL.down) * dt;
  g.v -= g.v * Math.min(1, REEL.damp * dt);
  g.m += g.v * dt;
  if (g.m < 0) { g.m = 0; g.v = 0; }
  if (g.m > 1) { g.m = 1; g.v = Math.min(0, g.v); }
  g.t += dt;
  const inside = Math.abs(g.m - zoneAt(z, g.t)) <= z.zw / 2;
  g.meter = Math.max(0, Math.min(1, g.meter + (inside ? dt / catchT : -REEL.drain * dt)));
  return inside;
}

const RESULT = {
  caught: (f) => [`Caught ${itemName(f.fish)}!`, RARITY_COLOR[f.rarity] ?? C.text],
  lost: () => ['It got away...', C.bad], missed: () => ['Missed the bite', C.bad], snap: () => ['The line went slack', C.dim],
  early: () => ['Too early - wait for the bite', C.bad],
};

const S = { bound: false, g: null, z: null, local: 0, hold: false, sentHold: false, acc: 0, banner: null, lastSt: 'idle', reelSfx: 0, biteT: 0, lastT: 0, cast: null };

function onFish(f) {
  if (!f) return;
  if (f.st === 'reel') {
    if (!S.g || S.lastSt !== 'reel') { S.hold = true; S.sentHold = true; }
    S.z = f.z;
    // snap to the authoritative state, keep local hold
    S.g = { m: f.m, v: f.v, meter: f.meter, t: f.t };
    S.catchT = f.catchT;
    S.acc = 0;
  } else S.g = null;
  if (f.st === 'bite' && S.lastSt !== 'bite') { S.biteT = 0; const j = globalThis.__tb?.juice; j?.shake?.(2, 0.12); }
  if (RESULT[f.st] && S.lastSt !== f.st) {
    const [text, color] = RESULT[f.st](f);
    S.banner = { text, color, t: 2.2, item: f.st === 'caught' ? f.fish : null, rarity: f.rarity };
    if (f.st === 'caught') { const j = globalThis.__tb?.juice; j?.shake?.(3, 0.2); if (f.rarity === 'legendary' || f.rarity === 'rare') j?.flash?.('#ffffff', 0.25, 0.15); }
  }
  S.lastSt = f.st;
}

const active = (st) => st === 'wait' || st === 'bite' || st === 'reel';

const panel = {
  id: 'fishing',
  key: null,
  modal: false,
  fullscreen: true,
  w: 320, h: 180, anchor: 'center',
  open(store) {
    if (!S.bound) { S.bound = true; store.on('change:self.fish', onFish); }
  },
  close() {
    const mgr = globalThis.__tb?.ui;
    const st = mgr?.store.self.fish?.st;
    if (mgr && active(st)) mgr.net.do('fish.cancel', {});
  },
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, inp = mgr.input;
    panel.w = mgr.W; panel.h = mgr.H;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, S.lastT ? now - S.lastT : 0); S.lastT = now;
    const f = store.self.fish ?? { st: 'idle' };
    const st = active(f.st) ? f.st : 'idle';
    const me = myPos(store);
    const blocked = overOtherPanel(mgr, 'fishing');
    const bob = f.id ? store.entities.get(f.id) : null;

    if (st === 'idle') {
      const a = mouseWorld(mgr);
      if (a && me) {
        const tx = Math.floor(a.x), ty = Math.floor(a.y);
        const g = store.groundAt(tx, ty);
        const water = g === 0 || g === 1;
        const inRange = Math.hypot(tx + 0.5 - me.x, ty + 0.5 - me.y) <= CAST_RANGE + 0.5;
        const p0 = worldToUi(mgr, me.x, me.y - 0.6), p1 = worldToUi(mgr, tx + 0.5, ty + 0.5, { x: 0, y: 0, s: 1 });
        if (p0 && p1) {
          // dotted arc to the target
          const ok = water && inRange;
          ctx.fillStyle = ok ? C.seaLight : C.bad;
          for (let i = 1; i < 12; i++) {
            const k = i / 12;
            const x = p0.x + (p1.x - p0.x) * k, y = p0.y + (p1.y - p0.y) * k - Math.sin(k * Math.PI) * 18 * p1.s;
            ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
          }
          const r = 5 + Math.sin(now * 5);
          ctx.strokeStyle = ok ? C.seaLight : C.bad; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(Math.round(p1.x) + 0.5, Math.round(p1.y) + 0.5, r, 0, Math.PI * 2); ctx.stroke();
          drawText(ctx, ok ? 'LMB cast' : (water ? 'Too far' : 'Aim at water'), p1.x, p1.y + 8, { align: 'center', color: ok ? C.text : C.bad });
          if (ok && !blocked && inp.mousePressed(0)) {
            mgr.net.do('fish.cast', { tx, ty }).then((res) => { if (!res.ok) mgr.sound('deny'); });
            mgr.consumeClick();
          }
        }
      }
    } else {
      const bp = bob ? worldToUi(mgr, bob.rx ?? bob.x, (bob.ry ?? bob.y) - 0.9) : null;
      if (st === 'wait') {
        if (bp) drawText(ctx, '.'.repeat(1 + (Math.floor(now * 2.5) % 3)), bp.x, bp.y, { align: 'center', color: C.text });
        drawText(ctx, 'Wait for a bite...   RMB reel in', mgr.W / 2, mgr.H - 70, { align: 'center', color: C.dim });
        if (!blocked && inp.mousePressed(0)) { mgr.net.do('fish.reel', { hold: true }); mgr.consumeClick(); }
      } else if (st === 'bite') {
        S.biteT += dt;
        if (bp) {
          const jump = Math.abs(Math.sin(S.biteT * 14)) * 6;
          drawText(ctx, '!', bp.x, bp.y - jump - 6, { align: 'center', color: C.goldLight, scale: 3 });
        }
        drawText(ctx, 'CLICK!', mgr.W / 2, mgr.H - 74, { align: 'center', color: C.goldLight, scale: 2 });
        if (!blocked && inp.mousePressed(0)) { mgr.net.do('fish.reel', { hold: true }); S.hold = true; S.sentHold = true; mgr.consumeClick(); mgr.sound('fish_reel'); }
      } else if (st === 'reel' && S.g && S.z) {
        // local prediction at the server's fixed step
        const hold = inp.mouseDown(0) && !blocked;
        if (hold !== S.sentHold) { mgr.net.do('fish.reel', { hold }); S.sentHold = hold; }
        S.acc += dt;
        while (S.acc >= 0.05) { reelStep(S.g, S.z, hold, 0.05, S.catchT || 2); S.acc -= 0.05; }
        if (hold) { S.reelSfx -= dt; if (S.reelSfx <= 0) { mgr.sound('fish_reel'); S.reelSfx = 0.16; } }
        drawReel(ui, ctx, mgr, S.g, S.z, hold, now);
      }
      if (inp.mousePressed(2) && !blocked) { mgr.net.do('fish.cancel', {}); mgr.consumeClick(); }
    }

    // result banner
    if (S.banner) {
      S.banner.t -= dt;
      if (S.banner.t <= 0) S.banner = null;
      else {
        const b = S.banner;
        const k = Math.min(1, (2.2 - b.t) * 6);
        const y = mgr.H / 2 - 86 - (1 - k) * 10;
        ctx.globalAlpha = Math.min(1, b.t * 2);
        const w = 150;
        ctx.fillStyle = 'rgba(13,10,20,0.75)'; ctx.fillRect(mgr.W / 2 - w / 2, y - 4, w, b.item ? 30 : 16);
        drawText(ctx, b.text, mgr.W / 2, y, { align: 'center', color: b.color });
        if (b.item) {
          const sc = 1 + Math.max(0, 0.4 - (2.2 - b.t)) * 2;
          mgr.sprites?.draw(ctx, 'item.' + b.item, mgr.W / 2, y + 26, { scaleX: sc, scaleY: sc });
          const fdef = content.fish.byId[b.item];
          if (fdef) drawText(ctx, fdef.rarity, mgr.W / 2 + 14, y + 14, { color: b.color, outline: false });
        }
        ctx.globalAlpha = 1;
      }
    }
  },
};

function drawReel(ui, ctx, mgr, g, z, hold, now) {
  const H = 110, W = 14;
  const x = Math.round(mgr.W / 2 + 70), y = Math.round(mgr.H / 2 - H / 2 - 10);
  ctx.fillStyle = 'rgba(13,10,20,0.8)'; ctx.fillRect(x - 32, y - 8, W + 70, H + 26);
  ctx.fillStyle = C.borderDark; ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
  ctx.fillStyle = C.ink2; ctx.fillRect(x, y, W, H);
  const c = zoneAt(z, g.t);
  const zh = Math.round(z.zw * H), zy = Math.round(y + (1 - c) * H - zh / 2);
  const inside = Math.abs(g.m - c) <= z.zw / 2;
  ctx.fillStyle = inside ? C.grassLight : C.grass;
  ctx.fillRect(x + 1, Math.max(y, zy), W - 2, Math.min(zh, y + H - Math.max(y, zy)));
  // marker
  const my = Math.round(y + (1 - g.m) * H);
  ctx.fillStyle = hold ? C.goldLight : '#ffffff';
  ctx.fillRect(x - 3, my - 1, W + 6, 3);
  ctx.fillStyle = C.ink0; ctx.fillRect(x - 3, my + 2, W + 6, 1);
  // catch meter
  const mx = x + W + 6;
  ctx.fillStyle = C.borderDark; ctx.fillRect(mx - 1, y - 1, 8, H + 2);
  ctx.fillStyle = C.ink1; ctx.fillRect(mx, y, 6, H);
  const fh = Math.round(g.meter * H);
  ctx.fillStyle = g.meter > 0.75 ? C.goldLight : g.meter > 0.3 ? C.seaLight : C.ember;
  ctx.fillRect(mx, y + H - fh, 6, fh);
  if (!inside && Math.floor(now * 8) % 2) { ctx.fillStyle = C.ember; ctx.fillRect(mx, y + H - fh, 6, 1); }
  drawText(ctx, 'Hold LMB to reel', x + W / 2 + 6, y + H + 4, { align: 'center', color: C.dim, outline: false });
}

export default panel;
