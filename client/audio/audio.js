// WP12 WebAudio synth engine (TECH_SPEC 11). Created on the first user gesture (unlock); safe to import in Node.
// Graph: voices -> category gain (sfx | music | amb | ui) -> master gain -> compressor -> destination.
// Max 24 simultaneous SFX voices (oldest stolen). Positional: volume and pan from the distance to the listener
// (camera centre, tiles); silent beyond 20 tiles. All sounds are synthesised from audio/sfx.js definitions.
//
// API: unlock(), play(name, { x, y, pitch, vol }), music(trackId, { fade, night }), ambience(id, level),
//      setVolume(category, v), getVolume(category), mute(on), pickupCombo(), setListener(x, y), stopAll(),
//      loop(name, level) -> handle { set(level), stop() }, has(name), state() (debug).

import SFX from './sfx.js';
import TRACKS from './tracks.js';
import { createSequencer } from './music.js';
import { createAmbience } from './ambience.js';

export const MAX_VOICES = 24;
export const HEAR_RANGE = 20;
const CATS = ['sfx', 'music', 'amb', 'ui'];
const DEFAULT_VOL = { master: 0.8, sfx: 0.8, music: 0.55, amb: 0.6, ui: 0.7 };

let ctx = null, master = null, comp = null, noiseBuf = null;
const gains = {};
const vol = { ...DEFAULT_VOL };
let muted = false;
const voices = [];                 // { stopAt, nodes: [], cat }
const lastPlayed = new Map();      // name -> ctx time (cooldowns)
const listener = { x: 0, y: 0, set: false };
const pulseWaves = new Map();
let sequencer = null, amb = null;
let pendingMusic = null;
const pendingAmb = new Map();
let combo = { n: 0, t: 0 };

try {
  const saved = JSON.parse(globalThis.localStorage?.getItem('tb.audio.vol') || 'null');
  if (saved) for (const k of Object.keys(DEFAULT_VOL)) if (typeof saved[k] === 'number') vol[k] = Math.max(0, Math.min(1, saved[k]));
} catch { /* ignore */ }
function saveVol() { try { globalThis.localStorage?.setItem('tb.audio.vol', JSON.stringify(vol)); } catch { /* ignore */ } }

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.03);
  for (const c of CATS) gains[c].gain.setTargetAtTime(vol[c], t, 0.03);
}

function build() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
  master = ctx.createGain();
  master.connect(comp); comp.connect(ctx.destination);
  for (const c of CATS) { gains[c] = ctx.createGain(); gains[c].connect(master); }
  // 2 s of white noise shared by every noise layer
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  sequencer = createSequencer(ctx, gains.music, TRACKS);
  amb = createAmbience(ctx, gains.amb, noiseBuf);
  return true;
}

// Silent mode for tests and checks: ?mute=1 on the page URL, or a browser driven by automation (navigator.webdriver).
// ?mute=0 forces sound on. In silent mode no AudioContext is ever made, so nothing can play.
export const SILENT = (() => {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('mute');
    if (q === '0') return false;
    if (q === '1' || q === 'true') return true;
    return globalThis.navigator?.webdriver === true;
  } catch { return false; }
})();

function unlock() {
  if (SILENT) return;
  if (!ctx && !build()) return;
  if (ctx.state === 'suspended') ctx.resume?.();
  if (pendingMusic) { const [id, o] = pendingMusic; pendingMusic = null; music(id, o); }
  for (const [id, lv] of pendingAmb) amb.set(id, lv);
  pendingAmb.clear();
}

// ------------------------------------------------------------------ synthesis

function pulseWave(duty) {
  const key = Math.round(duty * 100);
  let w = pulseWaves.get(key);
  if (w) return w;
  const n = 32, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  w = ctx.createPeriodicWave(re, im);
  pulseWaves.set(key, w);
  return w;
}
const distCurves = new Map();
function distCurve(amount) {
  const key = Math.round(amount * 10);
  let c = distCurves.get(key);
  if (c) return c;
  c = new Float32Array(256);
  const k = amount * 50;
  for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  distCurves.set(key, c);
  return c;
}

// Build one layer into `out` starting at time t0 with pitch multiplier pm; returns the layer end time.
export function renderLayer(ac, L, out, t0, pm = 1, noise = noiseBuf) {
  const start = t0 + (L.t ?? 0);
  const [a, d, s, r] = L.env ?? [0.002, L.dur * 0.6, 0, L.dur * 0.4];
  const peak = L.vol ?? 0.5;
  const end = start + Math.max(L.dur, a + d) + r;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + a);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * s), start + a + d);
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), Math.max(start + a + d, start + L.dur));
  g.gain.linearRampToValueAtTime(0.0001, end);
  let src, head = g;
  if (L.wave === 'noise') {
    src = ac.createBufferSource();
    src.buffer = noise; src.loop = true;
    src.playbackRate.value = pm;
    src.start(start, Math.random() * 1.5);
  } else {
    src = ac.createOscillator();
    if (L.wave === 'square' && L.duty && L.duty !== 0.5) src.setPeriodicWave(pulseWave(L.duty));
    else src.type = L.wave === 'saw' ? 'sawtooth' : L.wave || 'sine';
    const f0 = Math.max(20, (L.freq?.[0] ?? 440) * pm), f1 = Math.max(20, (L.freq?.[1] ?? L.freq?.[0] ?? 440) * pm);
    src.frequency.setValueAtTime(f0, start);
    if (L.arp?.length) {
      const step = L.arpRate ?? 0.05;
      for (let i = 0, tt = start; tt < start + L.dur; i++, tt += step) src.frequency.setValueAtTime(f0 * Math.pow(2, L.arp[i % L.arp.length] / 12), tt);
    } else if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, start + L.dur);
    if (L.vibrato) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = L.vibrato.rate;
      lg.gain.value = f0 * (Math.pow(2, (L.vibrato.depth ?? 0.3) / 12) - 1);
      lfo.connect(lg); lg.connect(src.frequency);
      lfo.start(start); lfo.stop(end + 0.05);
    }
    src.start(start);
  }
  src.stop(end + 0.05);
  let node = src;
  if (L.filter) {
    const f = ac.createBiquadFilter();
    f.type = L.filter.type; f.Q.value = L.filter.q ?? 1;
    f.frequency.setValueAtTime(L.filter.f * (L.wave === 'noise' ? 1 : 1), start);
    if (L.filter.to) f.frequency.exponentialRampToValueAtTime(L.filter.to, start + L.dur);
    node.connect(f); node = f;
  }
  if (L.dist) { const ws = ac.createWaveShaper(); ws.curve = distCurve(L.dist); node.connect(ws); node = ws; }
  node.connect(g);
  if (L.delay) {
    const dl = ac.createDelay(1), fb = ac.createGain(), mix = ac.createGain();
    dl.delayTime.value = L.delay.time; fb.gain.value = L.delay.fb ?? 0.3; mix.gain.value = L.delay.mix ?? 0.3;
    g.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(mix); mix.connect(out);
  }
  head.connect(out);
  return end;
}

function stealIfFull(now) {
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].stopAt <= now) voices.splice(i, 1);
  while (voices.length >= MAX_VOICES) {
    const v = voices.shift();
    try { v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, 0.01); setTimeout(() => { try { v.out.disconnect(); } catch { /* gone */ } }, 80); } catch { /* ignore */ }
  }
}

function play(name, opts = {}) {
  if (!ctx || !name) return;
  const def = SFX[name];
  if (!def) return;
  const now = ctx.currentTime;
  const cd = def.cooldown ?? 0.03;
  const last = lastPlayed.get(name);
  if (last != null && now - last < cd) return;
  lastPlayed.set(name, now);
  // positional
  let gainMul = opts.vol ?? 1, pan = 0;
  if (opts.x != null && listener.set) {
    const dx = opts.x - listener.x, dy = opts.y - listener.y;
    const dist = Math.hypot(dx, dy);
    if (dist > HEAR_RANGE) return;
    gainMul *= Math.pow(1 - dist / HEAR_RANGE, 1.3);
    pan = Math.max(-0.85, Math.min(0.85, dx / 12));
  }
  if (gainMul <= 0.01) return;
  stealIfFull(now);
  const cat = def.cat ?? 'sfx';
  const out = ctx.createGain();
  out.gain.value = gainMul;
  let tail = out;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p; }
  tail.connect(gains[cat] ?? gains.sfx);
  const pm = (1 + (Math.random() * 2 - 1) * (def.pitchVar ?? 0.06)) * (opts.pitch ?? 1);
  let end = now;
  for (const L of def.layers) end = Math.max(end, renderLayer(ctx, L, out, now + 0.005, pm));
  voices.push({ stopAt: end, out, cat });
  setTimeout(() => { try { tail.disconnect(); } catch { /* gone */ } }, (end - now + 0.3) * 1000);
}

// Continuous loop of a *_loop / amb_* definition (re-triggered layers crossfaded by the ambience engine).
function loop(name, level = 1) {
  if (!ctx) return { set() {}, stop() {} };
  return amb.loopSfx(name, SFX[name], level);
}

function music(trackId, opts = {}) {
  if (!ctx) { pendingMusic = [trackId, opts]; return; }
  let id = trackId, night = opts.night;
  if (typeof id === 'string' && id.endsWith(':night')) { id = id.slice(0, -6); night = true; }
  if (!id) { sequencer.stop(opts.fade ?? 1.5); return; }
  sequencer.play(id, { fade: opts.fade ?? 1.5, night: !!night });
}

function ambience(id, level) {
  if (!ctx) { pendingAmb.set(id, level); return; }
  amb.set(id, level);
}

function setVolume(category, v) {
  if (!(category in vol)) return;
  vol[category] = Math.max(0, Math.min(1, Number(v) || 0));
  saveVol();
  applyVolumes();
}
const getVolume = (category) => vol[category];
function mute(on = true) { muted = !!on; applyVolumes(); }

// Climbing pentatonic pickup blip (resets after 0.6 s without pickups).
const PENTA = [0, 2, 4, 7, 9];
function pickupCombo(opts = {}) {
  if (!ctx) return;
  const now = ctx.currentTime;
  combo.n = now - combo.t > 0.6 ? 0 : Math.min(combo.n + 1, 14);
  combo.t = now;
  const deg = combo.n, semi = PENTA[deg % 5] + 12 * Math.floor(deg / 5);
  const f = 660 * Math.pow(2, semi / 12);
  stealIfFull(now);
  const out = ctx.createGain(); out.gain.value = opts.vol ?? 1; out.connect(gains.sfx);
  const end = renderLayer(ctx, { wave: 'square', duty: 0.25, freq: [f, f], dur: 0.07, env: [0.001, 0.03, 0.2, 0.04], vol: 0.18 }, out, now + 0.003, 1);
  renderLayer(ctx, { wave: 'sine', freq: [f * 2, f * 2], dur: 0.05, env: [0.001, 0.02, 0, 0.03], vol: 0.06 }, out, now + 0.003, 1);
  voices.push({ stopAt: end, out, cat: 'sfx' });
}

function setListener(x, y) { listener.x = x; listener.y = y; listener.set = true; amb?.setListener?.(x, y); }

function stopAll() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices) { try { v.out.gain.setTargetAtTime(0, now, 0.02); } catch { /* ignore */ } }
  voices.length = 0;
  sequencer?.stop(0.2);
  amb?.stopAll();
}

const has = (name) => !!SFX[name];
const state = () => ({ unlocked: !!ctx, voices: voices.length, track: sequencer?.current?.() ?? null, vol: { ...vol }, muted });

const audio = { unlock, play, loop, music, ambience, setVolume, getVolume, mute, pickupCombo, setListener, stopAll, has, state, get ctx() { return ctx; } };
export default audio;
