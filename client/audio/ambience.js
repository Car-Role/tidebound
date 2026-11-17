// WP12 ambience beds (DESIGN 20): filtered-noise surf (swells with an LFO), wind (wandering band-pass),
// crackle (random noise clicks), rain, storm (rain + low rumble), and the weather beds named by content
// (amb_* in weather.js). Levels 0..1 are smoothed; beds are built lazily and torn down when silent.
// createAmbience(ctx, destination, noiseBuffer) -> { set(id, level), loopSfx(name, def, level), stopAll(), levels() }

export const BED_IDS = Object.freeze(['surf', 'wind', 'crackle', 'rain', 'storm', 'fog', 'heat', 'eclipse', 'cave']);
const ALIAS = { amb_surf: 'surf', amb_wind: 'wind', amb_rain: 'rain', amb_storm: 'storm', amb_fog: 'fog', amb_ash: 'crackle', amb_heat: 'heat', amb_eclipse: 'eclipse',
  surf_loop: 'surf', wind_loop: 'wind', rain_loop: 'rain', crackle_loop: 'crackle' };
export const ambienceId = (id) => ALIAS[id] ?? id;

export function createAmbience(ctx, dest, noise) {
  const beds = new Map();     // id -> { out, nodes, timer? }

  const src = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(ctx.currentTime, Math.random() * 1.5); return s; };
  const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const lfo = (rate, depth, target, offset) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); if (offset != null) target.value = offset; o.start(); return o; };

  function build(id) {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);
    const nodes = [];
    const chain = (s, ...fx) => { let n = s; for (const f of fx) { n.connect(f); n = f; } n.connect(out); nodes.push(s, ...fx); };
    let timer = null;
    switch (id) {
      case 'surf': { const f = filt('lowpass', 600, 0.7), g = ctx.createGain(); chain(src(), f, g); nodes.push(lfo(0.12, 0.35, g.gain, 0.55), lfo(0.09, 260, f.frequency, 650)); break; }
      case 'wind': { const f = filt('bandpass', 500, 0.8), g = ctx.createGain(); chain(src(), f, g); nodes.push(lfo(0.07, 300, f.frequency, 550), lfo(0.15, 0.25, g.gain, 0.6)); break; }
      case 'rain': { chain(src(), filt('highpass', 2500, 0.5), filt('lowpass', 9000, 0.5)); break; }
      case 'storm': { chain(src(), filt('highpass', 1800, 0.5)); const g = ctx.createGain(); g.gain.value = 0.8; chain(src(), filt('lowpass', 160, 0.8), g); nodes.push(lfo(0.05, 0.5, g.gain, 0.7)); break; }
      case 'fog': { const g = ctx.createGain(); chain(src(), filt('lowpass', 260, 0.6), g); nodes.push(lfo(0.04, 0.3, g.gain, 0.5)); break; }
      case 'heat': { chain(src(), filt('bandpass', 1500, 3)); break; }
      case 'cave': { const g = ctx.createGain(); chain(src(), filt('lowpass', 200, 1), g); nodes.push(lfo(0.03, 0.2, g.gain, 0.6)); break; }
      case 'eclipse': {
        for (const f of [110, 164.8, 220.5]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(out); o.start(); nodes.push(o, g, lfo(0.1 + f / 2000, 0.06, g.gain, 0.08)); }
        break;
      }
      case 'crackle': {
        // sparse clicks scheduled ahead
        const tickFn = () => {
          const now = ctx.currentTime;
          for (let k = 0; k < 6; k++) {
            if (Math.random() > 0.55) continue;
            const t = now + Math.random() * 0.25, s = ctx.createBufferSource(), g = ctx.createGain(), f = filt('highpass', 1500 + Math.random() * 3000, 1);
            s.buffer = noise; g.gain.setValueAtTime(0.25 + Math.random() * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.015 + Math.random() * 0.03);
            s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + 0.06);
          }
        };
        timer = setInterval(tickFn, 250);
        const g = ctx.createGain(); g.gain.value = 0.25; chain(src(), filt('lowpass', 300, 0.7), g);
        break;
      }
      default: chain(src(), filt('lowpass', 800, 0.7));
    }
    const bed = { out, nodes, timer, level: 0 };
    beds.set(id, bed);
    return bed;
  }

  function teardown(id, bed) {
    if (bed.timer) clearInterval(bed.timer);
    for (const n of bed.nodes) { try { n.stop?.(); } catch { /* not started */ } try { n.disconnect(); } catch { /* gone */ } }
    try { bed.out.disconnect(); } catch { /* gone */ }
    beds.delete(id);
  }

  function set(id, level) {
    id = ambienceId(id);
    level = Math.max(0, Math.min(1, Number(level) || 0));
    let bed = beds.get(id);
    if (!bed) { if (level <= 0.001) return; bed = build(id); }
    if (Math.abs(bed.level - level) < 0.01) return;
    bed.level = level;
    const now = ctx.currentTime;
    bed.out.gain.cancelScheduledValues(now);
    bed.out.gain.setTargetAtTime(level * 0.5, now, 0.6);
    if (bed.dropTimer) clearTimeout(bed.dropTimer);
    if (level <= 0.001) bed.dropTimer = setTimeout(() => { if (bed.level <= 0.001) teardown(id, bed); }, 4000);
  }

  // A loop SFX definition (e.g. kiln_loop, machine_hum) as a bed with its own handle.
  function loopSfx(name, def, level = 1) {
    const id = 'sfx:' + name + ':' + Math.random().toString(36).slice(2, 6);
    const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
    const nodes = [];
    for (const L of def?.layers ?? []) {
      let s;
      if (L.wave === 'noise') s = src();
      else { s = ctx.createOscillator(); s.type = L.wave === 'saw' ? 'sawtooth' : L.wave === 'square' ? 'square' : L.wave; s.frequency.value = L.freq?.[0] ?? 220; s.start(); }
      let n = s;
      if (L.filter) { const f = filt(L.filter.type, L.filter.f, L.filter.q ?? 1); n.connect(f); n = f; nodes.push(f); }
      const g = ctx.createGain(); g.gain.value = L.vol ?? 0.3; n.connect(g); g.connect(out);
      nodes.push(s, g);
    }
    const bed = { out, nodes, timer: null, level };
    beds.set(id, bed);
    out.gain.setTargetAtTime(level * 0.5, ctx.currentTime, 0.3);
    return {
      set(lv) { bed.level = lv; out.gain.setTargetAtTime(Math.max(0, lv) * 0.5, ctx.currentTime, 0.3); },
      stop() { out.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => teardown(id, bed), 1200); },
    };
  }

  function stopAll() { for (const [id, bed] of [...beds]) teardown(id, bed); }
  const levels = () => Object.fromEntries([...beds].map(([k, b]) => [k, b.level]));
  return { set, loopSfx, stopAll, levels, setListener() {} };
}

export default { createAmbience, ambienceId, BED_IDS };
