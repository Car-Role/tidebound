// Weather and world-moment layers (WP7), screen space, drawn after lighting (TECH_SPEC 8.1 step 8):
//   rain / storm streaks with ground splashes and lightning (bolt + flash on world.strike), snow / blizzard with
//   wind streaks, ashfall with rising embers, drifting fog banks with a 7-tile view radius, heat shimmer (scanline
//   wobble), eclipse motes; tide foam sweeping the flats when the tide turns; the plot-rise sequence (land rising
//   row by row out of the sea with water sheeting off, spray and a rolling shake).
// Layers cross-fade when the weather at the player's position changes.

import { TILE, PLOT, WORLD_PLOTS } from '../../shared/config.js';
import { T } from '../../shared/grid.js';
import juice from '../fx/juice.js';
import { clockNow, weatherAt, biomeAtTile } from './lighting.js';

const MAXP = 320;
const LAYERS = ['rain', 'storm', 'snow', 'blizzard', 'ashfall', 'fog', 'heatwave', 'eclipse'];
const RISE_S = 2.6;

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// particle pools (struct of arrays), one per layer family
function pool(n) { return { x: new Float32Array(n), y: new Float32Array(n), v: new Float32Array(n), s: new Float32Array(n), init: false }; }
const P = { rain: pool(MAXP), snow: pool(MAXP), ash: pool(120), motes: pool(90), splash: pool(48), spray: pool(200) };
const amount = Object.fromEntries(LAYERS.map((k) => [k, 0]));
let lastT = 0;

function seed(p, w, h, vmin, vmax) {
  for (let i = 0; i < p.x.length; i++) {
    p.x[i] = Math.random() * w; p.y[i] = Math.random() * h;
    p.v[i] = vmin + Math.random() * (vmax - vmin); p.s[i] = Math.random();
  }
  p.init = true;
}

// ---------------------------------------------------------------- fog bank sprites

let fogBlobs = null;
function fogSprites() {
  if (fogBlobs) return fogBlobs;
  fogBlobs = [];
  for (const r of [34, 46, 60]) {
    const c = makeCanvas(r * 2, r * 2);
    const g = c.getContext('2d');
    const img = g.createImageData(r * 2, r * 2);
    for (let y = 0; y < r * 2; y++) {
      for (let x = 0; x < r * 2; x++) {
        const d = Math.hypot(x - r, y - r) / r;
        if (d >= 1) continue;
        const a = (1 - d) * (1 - d);
        const thr = (((x * 7 + y * 13) % 16) + 0.5) / 16;
        if (a * 1.4 < thr * 0.9) continue;
        const i = (y * r * 2 + x) * 4;
        img.data[i] = 215; img.data[i + 1] = 222; img.data[i + 2] = 230; img.data[i + 3] = Math.round(70 + a * 90);
      }
    }
    g.putImageData(img, 0, 0);
    fogBlobs.push(c);
  }
  return fogBlobs;
}
const fog = Array.from({ length: 12 }, (_, i) => ({ x: (i * 97) % 400, y: (i * 61) % 260, vx: 4 + (i % 3) * 2, k: i % 3 }));

// ---------------------------------------------------------------- layer drawing

function drawRain(ctx, view, dt, a, heavy) {
  const p = P.rain;
  if (!p.init) seed(p, view.w, view.h, 170, 260);
  const n = Math.round((heavy ? 240 : 120) * a);
  const wind = heavy ? 70 : 35;
  ctx.fillStyle = heavy ? 'rgba(170,196,236,0.6)' : 'rgba(160,190,230,0.5)';
  for (let i = 0; i < n; i++) {
    p.y[i] += p.v[i] * dt; p.x[i] += wind * dt;
    if (p.y[i] > view.h) {
      p.y[i] -= view.h + 8; p.x[i] = Math.random() * (view.w + 40) - 40;
      if (Math.random() < 0.35) { const s = P.splash; const j = (Math.random() * s.x.length) | 0; s.x[j] = Math.random() * view.w; s.y[j] = Math.random() * view.h; s.s[j] = 0.25; }
    }
    if (p.x[i] > view.w) p.x[i] -= view.w + 10;
    const len = heavy ? 6 : 4;
    for (let k = 0; k < len; k++) ctx.fillRect((p.x[i] - k * 0.3) | 0, (p.y[i] - k) | 0, 1, 1);
  }
  const s = P.splash;
  ctx.fillStyle = 'rgba(200,220,245,0.7)';
  for (let j = 0; j < s.x.length; j++) {
    if (s.s[j] <= 0) continue;
    s.s[j] -= dt;
    const r = s.s[j] > 0.12 ? 1 : 2;
    ctx.fillRect(s.x[j] - r, s.y[j], 1, 1); ctx.fillRect(s.x[j] + r, s.y[j], 1, 1);
  }
}

function drawSnow(ctx, view, dt, a, time, bliz) {
  const p = P.snow;
  if (!p.init) seed(p, view.w, view.h, 14, 34);
  const n = Math.round((bliz ? 300 : 100) * a);
  const wind = bliz ? 90 : 6;
  ctx.fillStyle = 'rgba(245,250,255,0.85)';
  for (let i = 0; i < n; i++) {
    p.y[i] += p.v[i] * dt * (bliz ? 1.8 : 1);
    p.x[i] += (wind + Math.sin(time * 1.3 + p.s[i] * 9) * 12) * dt;
    if (p.y[i] > view.h) { p.y[i] -= view.h; p.x[i] = Math.random() * view.w; }
    if (p.x[i] > view.w) p.x[i] -= view.w; else if (p.x[i] < 0) p.x[i] += view.w;
    const big = p.s[i] > 0.75 ? 2 : 1;
    ctx.fillRect(p.x[i] | 0, p.y[i] | 0, big, big);
  }
  if (bliz) {
    ctx.fillStyle = 'rgba(235,242,255,0.35)';
    for (let i = 0; i < 40 * a; i++) {
      const y = ((i * 37 + time * 40) % view.h) | 0, x = ((i * 113 + time * 260) % (view.w + 60)) - 30;
      ctx.fillRect(x | 0, y, 12 + (i % 4) * 4, 1);
    }
    ctx.globalAlpha = 0.14 * a;
    ctx.fillStyle = '#e8f0ff';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
  }
}

function drawAsh(ctx, view, dt, a, time) {
  const p = P.ash;
  if (!p.init) seed(p, view.w, view.h, 8, 20);
  const n = Math.round(110 * a);
  for (let i = 0; i < n; i++) {
    const ember = i < 12;
    p.y[i] += (ember ? -p.v[i] * 1.4 : p.v[i]) * dt;
    p.x[i] += (Math.sin(time + p.s[i] * 7) * 8 + 6) * dt;
    if (p.y[i] > view.h) p.y[i] -= view.h; else if (p.y[i] < 0) p.y[i] += view.h;
    if (p.x[i] > view.w) p.x[i] -= view.w;
    ctx.fillStyle = ember ? (Math.sin(time * 6 + i) > 0 ? '#ffb54a' : '#ec7a2a') : 'rgba(122,126,138,0.8)';
    ctx.fillRect(p.x[i] | 0, p.y[i] | 0, ember ? 1 : 2, 1);
  }
  ctx.globalAlpha = 0.08 * a;
  ctx.fillStyle = '#5e3a24';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.globalAlpha = 1;
}

function drawFog(ctx, view, dt, a, store) {
  const blobs = fogSprites();
  ctx.globalAlpha = 0.55 * a;
  for (const f of fog) {
    f.x += f.vx * dt;
    const s = blobs[f.k];
    if (f.x > view.w + s.width) f.x = -s.width;
    ctx.drawImage(s, (f.x - s.width / 2) | 0, ((f.y % (view.h + 40)) - s.height / 2) | 0);
  }
  ctx.globalAlpha = 1;
  // visibility drops to about 7 tiles around the player
  const me = store.me();
  if (!me) return;
  const sx = (me.rx ?? me.x) * TILE - view.x, sy = (me.ry ?? me.y) * TILE - view.y;
  const R = 7 * TILE;
  const g = ctx.createRadialGradient(sx, sy, R * 0.55, sx, sy, R * 1.25);
  g.addColorStop(0, 'rgba(200,208,218,0)');
  g.addColorStop(1, `rgba(196,204,214,${(0.82 * a).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}

function drawHeat(ctx, view, a, time) {
  const amp = 1.4 * a;
  if (amp > 0.3) {
    const src = ctx.canvas;
    for (let y = 0; y < view.h; y += 3) {
      const off = Math.round(Math.sin(y * 0.11 + time * 5.5) * amp);
      if (off) ctx.drawImage(src, 0, y, view.w, 3, off, y, view.w, 3);
    }
  }
  ctx.globalAlpha = 0.07 * a;
  ctx.fillStyle = '#fff08a';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.globalAlpha = 1;
}

function drawEclipse(ctx, view, dt, a, time) {
  const p = P.motes;
  if (!p.init) seed(p, view.w, view.h, 6, 16);
  for (let i = 0; i < Math.round(90 * a); i++) {
    p.y[i] -= p.v[i] * dt;
    p.x[i] += Math.sin(time * 0.8 + p.s[i] * 10) * 6 * dt;
    if (p.y[i] < 0) { p.y[i] += view.h; p.x[i] = Math.random() * view.w; }
    ctx.fillStyle = (i & 3) === 0 ? '#c39ee6' : '#9466c4';
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3 + i);
    ctx.fillRect(p.x[i] | 0, p.y[i] | 0, 1, 1);
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.25, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
  g.addColorStop(0, 'rgba(42,22,64,0)');
  g.addColorStop(1, `rgba(42,22,64,${(0.55 * a).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}

// ---------------------------------------------------------------- lightning

let strikeN = null, strike = null;
function drawLightning(ctx, view, store, dt) {
  const s = store.world.strike;
  if (s && s.n !== strikeN) {
    if (strikeN !== null) {
      const me = store.me();
      const near = !me || Math.hypot(s.x - (me.rx ?? me.x), s.y - (me.ry ?? me.y)) < 40;
      if (near) {
        const pts = [];
        const tx = s.x * TILE - view.x, ty = s.y * TILE - view.y;
        let x = tx + (Math.random() - 0.5) * 30;
        for (let y = 0; y < ty; y += 8) { pts.push([x, y]); x += (Math.random() - 0.5) * 10 + (tx - x) * 0.15; }
        pts.push([tx, ty]);
        strike = { t: 0.18, pts };
        if (!juice.config.reduceFlashing) juice.flash('#ffffff', 0.55, 0.12);
        juice.shake(3, 0.2);
      }
    }
    strikeN = s.n;
  }
  if (!strike) return;
  strike.t -= dt;
  if (strike.t <= 0) { strike = null; return; }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#fff8d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  strike.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- tide foam

let lastLow = null, tideAnim = null;
function drawTideFoam(ctx, view, store, time, dt) {
  const c = store.world.clock;
  if (!c || store.realm.kind !== 'overworld') return;
  if (lastLow !== null && c.low !== lastLow) tideAnim = { low: c.low, t: 0 };
  lastLow = c.low;
  if (!tideAnim) return;
  tideAnim.t += dt;
  if (tideAnim.t > 2.8) { tideAnim = null; return; }
  const k = 1 - tideAnim.t / 2.8;
  const tx0 = Math.floor(view.x / TILE), ty0 = Math.floor(view.y / TILE);
  const tx1 = Math.ceil((view.x + view.w) / TILE), ty1 = Math.ceil((view.y + view.h) / TILE);
  ctx.fillStyle = '#ffffff';
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (store.groundAt(tx, ty) !== T.TIDAL) continue;
      const sx = tx * TILE - view.x, sy = ty * TILE - view.y;
      const sweep = tideAnim.low ? tideAnim.t * 7 : (2.8 - tideAnim.t) * 7;
      for (let i = 0; i < 5; i++) {
        const fx = (i * 5 + ((tx * 7 + ty * 3) % 11) + sweep * 3) % TILE;
        const fy = (i * 3 + ((tx + ty * 5) % 13)) % TILE;
        ctx.globalAlpha = k * (0.35 + 0.35 * Math.sin(time * 10 + i + tx));
        ctx.fillRect(sx + fx, sy + fy, 2, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- plot rise

let owned = null;             // last seen ownership per plot
const rising = [];            // { i, t }
function trackPlots(store) {
  const plots = store.world.plots;
  if (!plots) return;
  if (!owned || owned.length !== plots.length || owned.realm !== store.realm.id) {
    owned = plots.map((p) => !!p.owned);
    owned.realm = store.realm.id;
    return;
  }
  for (let i = 0; i < plots.length; i++) {
    if (plots[i].owned && !owned[i]) {
      rising.push({ i, t: 0, shake: 0 });
      juice.shake(5, 0.35);
    }
    owned[i] = !!plots[i].owned;
  }
}

function spray(x, y) {
  const p = P.spray;
  for (let k = 0; k < 2; k++) {
    const j = (Math.random() * p.x.length) | 0;
    p.x[j] = x + (Math.random() - 0.5) * 6; p.y[j] = y; p.v[j] = -20 - Math.random() * 40; p.s[j] = 0.6 + Math.random() * 0.4;
  }
}

function drawRise(ctx, view, dt) {
  if (rising.length) {
    for (let r = rising.length - 1; r >= 0; r--) {
      const a = rising[r];
      a.t += dt;
      a.shake -= dt;
      if (a.shake <= 0 && a.t < RISE_S - 0.4) { juice.shake(4 + 6 * Math.sin((a.t / RISE_S) * Math.PI), 0.3); a.shake = 0.25; }
      if (a.t > RISE_S + 0.6) { rising.splice(r, 1); continue; }
      const px = a.i % WORLD_PLOTS, py = Math.floor(a.i / WORLD_PLOTS);
      const ox = px * PLOT * TILE - view.x, oy = py * PLOT * TILE - view.y;
      if (ox > view.w || oy > view.h || ox + PLOT * TILE < 0 || oy + PLOT * TILE < 0) continue;
      for (let row = 0; row < PLOT; row++) {
        const start = (row / PLOT) * (RISE_S - 0.9);
        const prog = Math.max(0, Math.min(1, (a.t - start) / 0.9));
        if (prog >= 1) continue;
        const y = oy + row * TILE;
        // the still-submerged part of the row, sea coloured, thinning as it rises
        ctx.globalAlpha = 0.92 * (1 - prog);
        ctx.fillStyle = '#16365e';
        ctx.fillRect(ox, y, PLOT * TILE, TILE);
        ctx.globalAlpha = 0.5 * (1 - prog);
        ctx.fillStyle = '#3584b0';
        for (let x = 0; x < PLOT * TILE; x += 6) ctx.fillRect(ox + x + ((row * 3 + (a.t * 30) | 0) % 6), y + (x % 5), 3, 1);
        if (prog > 0) {
          // the sheeting front: foam line plus spray
          ctx.globalAlpha = Math.min(1, 1.6 * (1 - prog));
          ctx.fillStyle = '#ffffff';
          const fy = y + Math.round(TILE * prog);
          ctx.fillRect(ox, fy, PLOT * TILE, 1);
          ctx.fillStyle = '#a8d6ec';
          ctx.fillRect(ox, fy + 1, PLOT * TILE, 1);
          if (Math.random() < 0.9) spray(ox + Math.random() * PLOT * TILE, fy);
        }
      }
      ctx.globalAlpha = 1;
      // edge mist while it rises
      if (a.t < RISE_S) {
        ctx.globalAlpha = 0.18 * (1 - a.t / RISE_S);
        ctx.fillStyle = '#dcf2fa';
        ctx.fillRect(ox - 4, oy - 4, PLOT * TILE + 8, 4);
        ctx.fillRect(ox - 4, oy + PLOT * TILE, PLOT * TILE + 8, 4);
        ctx.fillRect(ox - 4, oy, 4, PLOT * TILE);
        ctx.fillRect(ox + PLOT * TILE, oy, 4, PLOT * TILE);
        ctx.globalAlpha = 1;
      }
    }
  }
  const p = P.spray;
  ctx.fillStyle = '#dcf2fa';
  for (let j = 0; j < p.x.length; j++) {
    if (p.s[j] <= 0) continue;
    p.s[j] -= dt;
    p.v[j] += 160 * dt;
    p.y[j] += p.v[j] * dt;
    ctx.globalAlpha = Math.min(1, p.s[j] * 2);
    ctx.fillRect(p.x[j] | 0, p.y[j] | 0, 1, 1);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- draw

export default {
  draw(ctx, view, store, time) {
    const dt = Math.max(0, Math.min(0.1, time - lastT));
    lastT = time;
    trackPlots(store);
    drawTideFoam(ctx, view, store, time, dt);
    drawRise(ctx, view, dt);
    if (store.realm.kind !== 'overworld') { for (const k of LAYERS) amount[k] = 0; return; }
    const me = store.me();
    const x = me ? me.rx ?? me.x : (view.x + view.w / 2) / TILE, y = me ? me.ry ?? me.y : (view.y + view.h / 2) / TILE;
    const w = weatherAt(store, x, y);
    const frosty = biomeAtTile(x, y) === 'hoarfrost';
    clockNow(store);
    for (const k of LAYERS) {
      // Hoarfrost always has a light snowfall unless a blizzard is blowing
      const target = k === w ? 1 : (k === 'snow' && frosty && w !== 'blizzard' ? 0.45 : 0);
      amount[k] += Math.sign(target - amount[k]) * Math.min(Math.abs(target - amount[k]), dt * 0.5);
    }
    ctx.save();
    if (amount.heatwave > 0.01) drawHeat(ctx, view, amount.heatwave, time);
    if (amount.fog > 0.01) drawFog(ctx, view, dt, amount.fog, store);
    if (amount.rain > 0.01) drawRain(ctx, view, dt, amount.rain, false);
    if (amount.storm > 0.01) drawRain(ctx, view, dt, amount.storm, true);
    if (amount.snow > 0.01) drawSnow(ctx, view, dt, amount.snow, time, false);
    if (amount.blizzard > 0.01) drawSnow(ctx, view, dt, amount.blizzard, time, true);
    if (amount.ashfall > 0.01) drawAsh(ctx, view, dt, amount.ashfall, time);
    if (amount.eclipse > 0.01) drawEclipse(ctx, view, dt, amount.eclipse, time);
    drawLightning(ctx, view, store, dt);
    ctx.restore();
  },
};
