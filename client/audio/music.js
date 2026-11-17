// WP12 generative music sequencer (TECH_SPEC 11): 16th-note steps scheduled 100 ms ahead on AudioContext time.
// Channels: bass, lead (seeded melody, motif form A A' B A over 8 bars), pad (chords), drums (kick/snare/hat
// synthesised), optional arp (boss tracks). Crossfades between tracks; night variants via track.night overrides.
// Pure helpers (resolveTrack, buildMelody, chordAt, midiOfDegree) are exported for tests.

import { createRng } from '../../shared/rng.js';

const LOOKAHEAD = 0.1, TICK_MS = 25;

// ------------------------------------------------------------------ pure helpers

export function resolveTrack(track, night = false) {
  if (!night || !track.night) return track;
  const n = track.night, ch = {};
  for (const [k, v] of Object.entries(track.channels)) ch[k] = { ...v, ...(n[k] ?? {}) };
  return { ...track, bpm: track.bpm + (n.bpm ?? 0), channels: ch };
}

// MIDI note of scale degree `deg` (may exceed the scale length: wraps up octaves).
export function midiOfDegree(track, deg) {
  const s = track.scale, n = s.length;
  const o = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return track.root + s[i] + 12 * o;
}
export function chordAt(track, bar) {
  const chords = track.channels.pad?.chords ?? [[0, 2, 4]];
  return chords[Math.floor(bar / 2) % chords.length];
}

// One motif: 2 bars (32 steps) of { step, deg, len } from a seeded random walk.
function motif(rng, density, lo, hi) {
  const notes = [];
  let deg = Math.round((lo + hi) / 2);
  for (let s = 0; s < 32;) {
    const onBeat = s % 4 === 0;
    if (rng.next() < (onBeat ? density * 1.4 : density * 0.6)) {
      const r = rng.next();
      deg += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
      if (deg < lo) deg = lo + 1; if (deg > hi) deg = hi - 1;
      const len = rng.next() < 0.3 ? 4 : rng.next() < 0.5 ? 2 : 1;
      notes.push({ step: s, deg, len });
      s += len;
    } else s += 1;
  }
  // land the phrase on a chord tone
  if (notes.length) notes[notes.length - 1].deg = Math.round(notes[notes.length - 1].deg / 2) * 2;
  return notes;
}

// Melody for one 8-bar cycle (A A' B A). Degrees are scale degrees relative to the track root.
export function buildMelody(track, cycle = 0) {
  const lead = track.channels.lead;
  if (!lead) return [];
  const n = track.scale.length;
  const toDeg = (midi) => Math.round(((midi - track.root) / 12) * n);
  const lo = toDeg(lead.range[0]), hi = toDeg(lead.range[1]);
  const A = motif(createRng((track.seed ?? 1) * 7919), lead.density, lo, hi);
  const rv = createRng((track.seed ?? 1) * 104729 + cycle * 31);
  const A2 = A.map((x, i) => (i >= A.length - 3 ? { ...x, deg: Math.max(lo, Math.min(hi, x.deg + (rv.next() < 0.5 ? 1 : -1))) } : x));
  const B = motif(rv, lead.density * 1.1, lo, hi);
  const out = [];
  [A, A2, B, A].forEach((m, k) => { for (const x of m) out.push({ step: x.step + k * 32, deg: x.deg, len: x.len }); });
  return out;
}

// ------------------------------------------------------------------ sequencer

export function createSequencer(ctx, destination, tracks) {
  let current = null;          // { id, track, out, night, step, nextTime, cycle, melodyIdx, melody }
  let timer = null;
  const fadeOut = (o, t) => { const now = ctx.currentTime; o.gain.cancelScheduledValues(now); o.gain.setValueAtTime(o.gain.value, now); o.gain.linearRampToValueAtTime(0.0001, now + t); setTimeout(() => { try { o.disconnect(); } catch { /* gone */ } }, t * 1000 + 300); };

  function voice(out, wave, midi, t, len, vol, opts = {}) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.01, rel = opts.release ?? Math.min(0.25, len * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(vol * (opts.sustain ?? 0.6), t + a, len * 0.3);
    g.gain.setTargetAtTime(0.0001, t + len, rel / 3);
    const oscs = [];
    const mk = (detuneCents) => {
      const o = ctx.createOscillator();
      if (wave === 'square' && opts.duty && opts.duty !== 0.5) o.setPeriodicWave(pulse(opts.duty));
      else o.type = wave === 'saw' ? 'sawtooth' : wave;
      o.frequency.value = f; o.detune.value = detuneCents;
      oscs.push(o);
      return o;
    };
    let src = mk(0);
    if (opts.detune) { const o2 = mk(opts.detune); const m = ctx.createGain(); m.gain.value = 0.5; src.connect(m); o2.connect(m); src = m; }
    if (opts.fm) {
      const mod = ctx.createOscillator(), mg = ctx.createGain();
      mod.frequency.value = f * opts.fm.ratio; mg.gain.setValueAtTime(f * opts.fm.depth, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + len);
      mod.connect(mg); mg.connect(oscs[0].frequency); mod.start(t); mod.stop(t + len + rel + 0.1);
    }
    let node = src;
    if (opts.cutoff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opts.cutoff; fl.Q.value = 1.2; node.connect(fl); node = fl; }
    node.connect(g); g.connect(out);
    for (const o of oscs) { o.start(t); o.stop(t + len + rel + 0.1); }
  }
  const pulses = new Map();
  function pulse(duty) {
    const k = Math.round(duty * 100);
    if (pulses.has(k)) return pulses.get(k);
    const n = 24, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    const w = ctx.createPeriodicWave(re, im); pulses.set(k, w); return w;
  }
  let noise = null;
  function noiseSrc() {
    if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noise; return s;
  }
  function drum(out, kind, t, vol) {
    const g = ctx.createGain();
    g.connect(out);
    if (kind === 'kick') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vol * 1.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); o.start(t); o.stop(t + 0.25);
    } else {
      const s = noiseSrc(), f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800; f.Q.value = kind === 'hat' ? 0.7 : 0.9;
      const dur = kind === 'hat' ? 0.04 : 0.14;
      g.gain.setValueAtTime(vol * (kind === 'hat' ? 0.35 : 0.9), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    }
  }
  const hit = (pat, step) => { if (!pat) return false; const len = pat.length; const i = len >= 16 ? step % len : (step % 16) % (len * 2) / 2; return Number.isInteger(i) && pat[i % len] === 'x'; };

  function scheduleStep(cur, t) {
    const tr = cur.track, ch = tr.channels, stepDur = 60 / tr.bpm / 4;
    const step = cur.step, totalSteps = (tr.bars ?? 8) * 16;
    const s = step % totalSteps, bar = Math.floor(s / 16);
    if (s === 0) { cur.melody = buildMelody(tr, cur.cycle++); cur.mi = 0; }
    const chord = chordAt(tr, bar);
    const root = midiOfDegree(tr, chord[0]);
    // bass
    if (ch.bass) {
      const c = ch.bass.pattern[s % 16];
      if (c === 'x' || c === 'o') voice(cur.out, ch.bass.wave, root + 12 * (ch.bass.oct ?? -1) + (c === 'o' ? 7 : 0), t, stepDur * 1.8, ch.bass.vol * 0.5, { cutoff: ch.bass.cutoff, duty: ch.bass.duty, sustain: 0.5 });
    }
    // pad: each bar start
    if (ch.pad && s % 16 === 0) for (const d of chord) voice(cur.out, ch.pad.wave, midiOfDegree(tr, d), t, stepDur * 16, ch.pad.vol * 0.32, { attack: 0.3, release: 0.6, sustain: 0.8, cutoff: ch.pad.cutoff });
    // lead
    if (ch.lead && cur.melody) {
      while (cur.mi < cur.melody.length && cur.melody[cur.mi].step < s) cur.mi++;
      while (cur.mi < cur.melody.length && cur.melody[cur.mi].step === s) {
        const nt = cur.melody[cur.mi++];
        voice(cur.lead, ch.lead.wave, midiOfDegree(tr, nt.deg), t, stepDur * nt.len * 0.95, ch.lead.vol * 0.55, { duty: ch.lead.duty, detune: ch.lead.detune, fm: ch.lead.fm, cutoff: ch.lead.cutoff });
      }
    }
    // arp (boss)
    if (ch.arp && s % (ch.arp.rate ?? 1) === 0) {
      const i = Math.floor(s / (ch.arp.rate ?? 1)) % 4;
      const deg = [chord[0], chord[1], chord[2], chord[1]][i];
      voice(cur.out, ch.arp.wave, midiOfDegree(tr, deg) + 12 * (ch.arp.oct ?? 1), t, stepDur * 0.9, ch.arp.vol * 0.6, { duty: ch.arp.duty, sustain: 0.3 });
    }
    // drums
    if (ch.drums) {
      if (hit(ch.drums.kick, s)) drum(cur.out, 'kick', t, ch.drums.vol);
      if (hit(ch.drums.snare, s)) drum(cur.out, 'snare', t, ch.drums.vol);
      if (hit(ch.drums.hat, s)) drum(cur.out, 'hat', t + (s % 2 ? stepDur * (tr.swing ?? 0) : 0), ch.drums.vol);
    }
    cur.step++;
  }

  function tick() {
    if (!current) return;
    const until = ctx.currentTime + LOOKAHEAD;
    while (current.nextTime < until) {
      scheduleStep(current, current.nextTime);
      current.nextTime += 60 / current.track.bpm / 4;
    }
  }

  function play(id, { fade = 1.5, night = false } = {}) {
    const base = tracks[id];
    if (!base) return;
    if (current && current.id === id && current.night === night) return;
    const now = ctx.currentTime;
    // same track, other time of day: keep the position, swap the arrangement
    if (current && current.id === id) { current.track = resolveTrack(base, night); current.night = night; return; }
    if (current) fadeOut(current.out, fade);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now); out.gain.linearRampToValueAtTime(1, now + fade);
    out.connect(destination);
    const track = resolveTrack(base, night);
    let lead = out;
    if (track.channels.lead?.delay) {
      lead = ctx.createGain();
      const d = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain();
      d.delayTime.value = track.channels.lead.delay.time; fb.gain.value = track.channels.lead.delay.fb; wet.gain.value = track.channels.lead.delay.mix;
      lead.connect(out); lead.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out);
    }
    current = { id, track, out, lead, night, step: 0, cycle: 0, mi: 0, melody: null, nextTime: now + 0.06 };
    if (!timer) timer = setInterval(tick, TICK_MS);
  }
  function stop(fade = 1) {
    if (!current) return;
    fadeOut(current.out, fade);
    current = null;
  }
  function setNight(on) { if (current) play(current.id, { night: !!on }); }

  return { play, stop, setNight, current: () => (current ? current.id + (current.night ? ':night' : '') : null) };
}

export default { createSequencer, buildMelody, resolveTrack, midiOfDegree, chordAt };
