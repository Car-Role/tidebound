// WP12 SFX definitions (TECH_SPEC 11), synthesised by audio.js. No audio files.
// def: { layers: [layer...], pitchVar, cat?, loop?, cooldown? }
// layer: { wave: sine|square|triangle|saw|noise, freq: [start, end] (exp sweep), dur, env: [a, d, s, r], vol,
//          duty?, filter?: { type, f, q, to? (sweep end) }, t? (start offset s), arp?: [semitones], arpRate?,
//          vibrato?: { rate, depth (semitones) }, dist?, delay?: { time, fb, mix } }
// cat: 'sfx' (default) | 'ui' | 'amb'. loop: true for *_loop beds (played via audio.loop / ambience).

const tone = (wave, f0, f1, dur, vol = 0.5, env = [0.002, dur * 0.6, 0, dur * 0.4], extra = {}) => ({ wave, freq: [f0, f1], dur, env, vol, ...extra });
const noise = (type, f, q, dur, vol = 0.4, env = [0.001, dur * 0.6, 0, dur * 0.4], extra = {}) => ({ wave: 'noise', filter: { type, f, q, ...(extra.to ? { to: extra.to } : {}) }, dur, env, vol, ...extra });
const def = (layers, pitchVar = 0.06, extra = {}) => ({ layers, pitchVar, ...extra });

const SFX = {
  // ---------------------------------------------------------------- taps and breaks
  tap_wood: def([tone('square', 180, 90, 0.07, 0.45, [0.002, 0.03, 0, 0.03], { duty: 0.25 }), noise('bandpass', 900, 1.2, 0.04, 0.3)]),
  tap_stone: def([noise('highpass', 2400, 0.8, 0.05, 0.35), tone('sine', 1250, 1100, 0.12, 0.25, [0.001, 0.05, 0.1, 0.06])]),
  tap_plant: def([noise('bandpass', 2600, 0.7, 0.09, 0.35, [0.01, 0.04, 0.1, 0.04], { to: 1400 })], 0.1),
  tap_ice: def([tone('triangle', 2200, 1900, 0.15, 0.25, [0.001, 0.05, 0.2, 0.08]), tone('sine', 3300, 3200, 0.1, 0.12), noise('highpass', 5000, 1, 0.03, 0.2)]),
  tap_null: def([tone('sine', 260, 520, 0.18, 0.3, [0.01, 0.08, 0.2, 0.08], { vibrato: { rate: 18, depth: 0.6 } }), noise('bandpass', 700, 3, 0.12, 0.15)]),
  clink: def([tone('square', 1800, 1700, 0.06, 0.18, [0.001, 0.03, 0, 0.03], { duty: 0.5 }), tone('sine', 2700, 2600, 0.12, 0.15)], 0.04),
  break_wood: def([noise('lowpass', 1400, 0.8, 0.25, 0.5, [0.002, 0.1, 0.2, 0.12], { to: 300 }), tone('square', 140, 60, 0.18, 0.35, undefined, { duty: 0.3 }), tone('triangle', 90, 50, 0.22, 0.3)]),
  break_stone: def([noise('lowpass', 2200, 0.7, 0.3, 0.55, [0.001, 0.12, 0.2, 0.15], { to: 400 }), tone('sine', 120, 50, 0.25, 0.45)]),
  break_plant: def([noise('bandpass', 3000, 0.6, 0.22, 0.4, [0.005, 0.1, 0.1, 0.1], { to: 1200 }), tone('triangle', 600, 900, 0.08, 0.15)], 0.1),
  break_crystal: def([tone('triangle', 2400, 2400, 0.4, 0.2, [0.001, 0.1, 0.3, 0.25], { arp: [0, 7, 12, 19], arpRate: 0.04 }), noise('highpass', 4000, 1, 0.2, 0.3), tone('sine', 1600, 800, 0.2, 0.15)]),
  // ---------------------------------------------------------------- pickups
  pickup: def([tone('square', 880, 880, 0.08, 0.2, [0.001, 0.04, 0, 0.03], { duty: 0.25, arp: [0, 7], arpRate: 0.035 })], 0.02),
  pickup_rare: def([tone('square', 880, 880, 0.3, 0.2, [0.001, 0.1, 0.3, 0.12], { duty: 0.25, arp: [0, 4, 7, 12, 16], arpRate: 0.045 }), tone('sine', 1760, 1760, 0.35, 0.1, [0.05, 0.1, 0.3, 0.15])], 0.02),
  glint: def([tone('triangle', 1975, 1975, 0.2, 0.18, [0.001, 0.06, 0.2, 0.1], { arp: [0, 5, 12], arpRate: 0.04 }), tone('sine', 3950, 3950, 0.12, 0.06)], 0.03),
  // ---------------------------------------------------------------- combat
  swing: def([noise('bandpass', 800, 0.9, 0.12, 0.35, [0.02, 0.05, 0.1, 0.05], { to: 2200 })], 0.1),
  swing_heavy: def([noise('bandpass', 400, 0.8, 0.22, 0.45, [0.04, 0.08, 0.1, 0.1], { to: 1400 }), tone('sine', 110, 70, 0.2, 0.2)], 0.08),
  hit_flesh: def([noise('lowpass', 1200, 1, 0.1, 0.45, [0.001, 0.05, 0, 0.05], { to: 300 }), tone('sine', 160, 70, 0.1, 0.45)]),
  hit_armor: def([tone('square', 620, 540, 0.12, 0.22, [0.001, 0.05, 0.1, 0.06], { duty: 0.4 }), tone('sine', 1450, 1400, 0.18, 0.15, [0.001, 0.08, 0.1, 0.1]), noise('highpass', 3000, 1, 0.05, 0.25)]),
  crit: def([tone('square', 220, 110, 0.12, 0.35, undefined, { duty: 0.3 }), noise('lowpass', 3000, 1, 0.12, 0.45, undefined, { to: 400 }), tone('triangle', 1320, 1760, 0.15, 0.2)], 0.04),
  hurt: def([tone('square', 330, 180, 0.16, 0.35, [0.001, 0.08, 0.1, 0.08], { duty: 0.5 }), noise('bandpass', 900, 1, 0.1, 0.2)], 0.05),
  death: def([tone('square', 400, 60, 0.45, 0.3, [0.001, 0.2, 0.2, 0.2], { duty: 0.4 }), noise('lowpass', 1600, 1, 0.4, 0.3, undefined, { to: 200 })], 0.06),
  dodge: def([noise('bandpass', 1200, 0.8, 0.16, 0.3, [0.02, 0.06, 0.1, 0.06], { to: 500 })], 0.08),
  // ---------------------------------------------------------------- footsteps
  footstep_land: def([noise('lowpass', 700, 1, 0.05, 0.15)], 0.15),
  footstep_water: def([noise('bandpass', 1500, 1.2, 0.09, 0.2, undefined, { to: 600 }), tone('sine', 700, 400, 0.05, 0.05)], 0.15),
  footstep_snow: def([noise('highpass', 1800, 0.7, 0.08, 0.15, [0.01, 0.04, 0, 0.03])], 0.15),
  // ---------------------------------------------------------------- progression
  levelup: def([
    tone('square', 523, 523, 0.12, 0.2, [0.005, 0.05, 0.4, 0.05], { duty: 0.25 }), tone('square', 659, 659, 0.12, 0.2, [0.005, 0.05, 0.4, 0.05], { duty: 0.25, t: 0.1 }),
    tone('square', 784, 784, 0.12, 0.2, [0.005, 0.05, 0.4, 0.05], { duty: 0.25, t: 0.2 }), tone('square', 1047, 1047, 0.45, 0.22, [0.005, 0.1, 0.5, 0.3], { duty: 0.25, t: 0.3, vibrato: { rate: 6, depth: 0.15 } }),
    tone('triangle', 262, 262, 0.7, 0.25, [0.01, 0.2, 0.5, 0.3], { t: 0.3 })], 0, { cat: 'ui' }),
  card_flip: def([noise('bandpass', 2400, 1, 0.07, 0.3, undefined, { to: 4000 }), tone('triangle', 900, 1300, 0.05, 0.12)], 0.08, { cat: 'ui' }),
  card_pick: def([tone('triangle', 660, 660, 0.25, 0.2, [0.002, 0.08, 0.3, 0.1], { arp: [0, 7, 12], arpRate: 0.05 }), noise('highpass', 3000, 1, 0.1, 0.1)], 0.02, { cat: 'ui' }),
  card_mythic: def([tone('saw', 440, 440, 0.9, 0.12, [0.01, 0.2, 0.5, 0.4], { arp: [0, 4, 7, 11, 14, 19, 24], arpRate: 0.06, filter: { type: 'lowpass', f: 2400, q: 2 } }), tone('sine', 110, 110, 1.0, 0.25, [0.05, 0.3, 0.6, 0.4]), noise('highpass', 6000, 1, 0.6, 0.1, [0.3, 0.1, 0.3, 0.2])], 0, { cat: 'ui' }),
  skill_buy: def([tone('triangle', 523, 1047, 0.18, 0.22, [0.002, 0.08, 0.2, 0.08]), tone('square', 1568, 1568, 0.1, 0.08, undefined, { t: 0.08, duty: 0.25 })], 0.02, { cat: 'ui' }),
  quest_done: def([tone('square', 659, 659, 0.12, 0.18, undefined, { duty: 0.25 }), tone('square', 784, 784, 0.12, 0.18, undefined, { duty: 0.25, t: 0.12 }), tone('square', 988, 988, 0.12, 0.18, undefined, { duty: 0.25, t: 0.24 }), tone('triangle', 1319, 1319, 0.5, 0.2, [0.005, 0.1, 0.4, 0.3], { t: 0.36 })], 0, { cat: 'ui' }),
  donate: def([tone('triangle', 784, 784, 0.3, 0.2, [0.002, 0.1, 0.3, 0.15], { arp: [0, 4, 7, 12], arpRate: 0.06 }), noise('highpass', 5000, 1, 0.2, 0.08)], 0.02),
  // ---------------------------------------------------------------- crafting / building
  craft_done: def([tone('triangle', 1047, 1047, 0.18, 0.2, [0.001, 0.06, 0.2, 0.1], { arp: [0, 7], arpRate: 0.06 }), tone('sine', 2093, 2093, 0.15, 0.08, undefined, { t: 0.06 })], 0.03),
  kiln_loop: def([noise('lowpass', 500, 0.7, 2, 0.25, [0.3, 0.2, 1, 0.5]), tone('sine', 55, 55, 2, 0.12, [0.3, 0.2, 1, 0.5], { vibrato: { rate: 3, depth: 0.3 } })], 0, { loop: true }),
  build_place: def([tone('square', 160, 80, 0.12, 0.35, undefined, { duty: 0.3 }), noise('lowpass', 1500, 1, 0.15, 0.35, undefined, { to: 300 })], 0.05),
  build_remove: def([noise('bandpass', 1000, 1, 0.2, 0.3, undefined, { to: 3000 }), tone('triangle', 300, 600, 0.15, 0.15)], 0.05),
  deny: def([tone('square', 196, 185, 0.09, 0.22, [0.001, 0.04, 0.3, 0.03], { duty: 0.5 }), tone('square', 147, 139, 0.12, 0.22, [0.001, 0.05, 0.3, 0.04], { duty: 0.5, t: 0.1 })], 0, { cat: 'ui' }),
  // ---------------------------------------------------------------- UI
  ui_click: def([tone('square', 1200, 900, 0.03, 0.15, [0.001, 0.015, 0, 0.012], { duty: 0.25 })], 0.03, { cat: 'ui' }),
  ui_hover: def([tone('sine', 1800, 1800, 0.025, 0.06, [0.001, 0.01, 0, 0.01])], 0.04, { cat: 'ui', cooldown: 0.04 }),
  ui_open: def([tone('triangle', 500, 900, 0.09, 0.15), noise('bandpass', 2000, 1, 0.06, 0.08, undefined, { to: 4000 })], 0.02, { cat: 'ui' }),
  ui_close: def([tone('triangle', 900, 500, 0.08, 0.13), noise('bandpass', 3000, 1, 0.05, 0.06, undefined, { to: 1500 })], 0.02, { cat: 'ui' }),
  ping: def([tone('sine', 1320, 1320, 0.25, 0.25, [0.001, 0.08, 0.3, 0.15]), tone('sine', 1760, 1760, 0.25, 0.18, [0.001, 0.08, 0.3, 0.15], { t: 0.12 })], 0, { cat: 'ui' }),
  // ---------------------------------------------------------------- world
  chest_open: def([tone('square', 220, 330, 0.1, 0.2, undefined, { duty: 0.3 }), tone('triangle', 784, 784, 0.45, 0.2, [0.01, 0.1, 0.4, 0.25], { t: 0.08, arp: [0, 4, 7, 12, 16], arpRate: 0.05 }), noise('highpass', 5000, 1, 0.4, 0.08, [0.1, 0.1, 0.4, 0.2])], 0.02),
  plot_rise: def([noise('lowpass', 600, 0.8, 2.4, 0.5, [0.4, 0.8, 0.5, 1.0], { to: 2000 }), tone('sine', 55, 82, 2.4, 0.4, [0.3, 1, 0.5, 0.8]),
    tone('saw', 220, 220, 1.0, 0.12, [0.1, 0.3, 0.5, 0.4], { t: 1.5, filter: { type: 'lowpass', f: 1400, q: 1 }, arp: [0, 7, 12], arpRate: 0.18 })], 0),
  tide_out: def([noise('lowpass', 900, 0.7, 2.0, 0.35, [0.5, 0.8, 0.3, 0.7], { to: 300 })], 0, { cat: 'amb' }),
  tide_in: def([noise('lowpass', 300, 0.7, 2.0, 0.35, [0.5, 0.8, 0.3, 0.7], { to: 1100 })], 0, { cat: 'amb' }),
  thunder: def([noise('lowpass', 900, 0.6, 2.2, 0.8, [0.005, 0.4, 0.4, 1.4], { to: 120 }), tone('sine', 60, 35, 1.5, 0.5, [0.01, 0.5, 0.3, 0.8])], 0.15),
  rain_loop: def([noise('highpass', 3000, 0.5, 2, 0.3, [0.4, 0.2, 1, 0.6])], 0, { loop: true, cat: 'amb' }),
  wind_loop: def([noise('bandpass', 600, 0.6, 2, 0.35, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  surf_loop: def([noise('lowpass', 800, 0.6, 2, 0.35, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  crackle_loop: def([noise('highpass', 2500, 1.2, 2, 0.18, [0.3, 0.2, 1, 0.5])], 0, { loop: true, cat: 'amb' }),
  // ---------------------------------------------------------------- abilities
  cast: def([tone('triangle', 400, 1200, 0.18, 0.2, [0.01, 0.08, 0.2, 0.08]), noise('bandpass', 2000, 1.5, 0.15, 0.12, undefined, { to: 5000 })], 0.05),
  slam: def([tone('sine', 140, 40, 0.4, 0.7, [0.001, 0.15, 0.2, 0.2]), noise('lowpass', 1500, 0.8, 0.35, 0.5, undefined, { to: 150 })], 0.05),
  whoosh: def([noise('bandpass', 500, 1, 0.3, 0.4, [0.08, 0.1, 0.2, 0.1], { to: 3000 })], 0.1),
  bolt: def([tone('square', 900, 300, 0.2, 0.2, undefined, { duty: 0.25 }), noise('bandpass', 1800, 2, 0.2, 0.2, undefined, { to: 600 })], 0.06),
  wave: def([noise('lowpass', 400, 0.8, 0.9, 0.5, [0.15, 0.3, 0.4, 0.4], { to: 2500 }), tone('sine', 90, 60, 0.8, 0.25, [0.1, 0.3, 0.4, 0.3])], 0.06),
  heal: def([tone('sine', 523, 523, 0.5, 0.18, [0.02, 0.1, 0.5, 0.3], { arp: [0, 4, 7, 12], arpRate: 0.07 }), tone('sine', 1047, 1047, 0.4, 0.08, [0.1, 0.1, 0.4, 0.2])], 0.02),
  shield: def([tone('triangle', 330, 660, 0.25, 0.2, [0.005, 0.1, 0.3, 0.1], { vibrato: { rate: 14, depth: 0.3 } }), noise('highpass', 3500, 1, 0.12, 0.12)], 0.04),
  burn: def([noise('bandpass', 1200, 0.6, 0.5, 0.35, [0.03, 0.2, 0.4, 0.2], { to: 500 }), noise('highpass', 4000, 2, 0.4, 0.12)], 0.08),
  freeze: def([tone('triangle', 2400, 1200, 0.4, 0.15, [0.005, 0.2, 0.2, 0.15]), noise('highpass', 5000, 1, 0.35, 0.2, [0.01, 0.2, 0.2, 0.1])], 0.05),
  shatter: def([noise('highpass', 3000, 0.8, 0.35, 0.45, [0.001, 0.15, 0.1, 0.15]), tone('triangle', 3000, 1800, 0.25, 0.15, undefined, { arp: [0, 5, -3, 7], arpRate: 0.03 })], 0.06),
  zap: def([tone('saw', 1400, 300, 0.12, 0.2, [0.001, 0.05, 0.2, 0.05], { vibrato: { rate: 60, depth: 2 } }), noise('highpass', 4000, 1, 0.08, 0.2)], 0.1),
  explode: def([noise('lowpass', 3000, 0.8, 0.7, 0.8, [0.001, 0.25, 0.2, 0.4], { to: 100 }), tone('sine', 90, 30, 0.6, 0.6, [0.001, 0.25, 0.2, 0.3])], 0.08),
  summon: def([tone('triangle', 262, 784, 0.3, 0.2, [0.01, 0.1, 0.3, 0.1]), noise('lowpass', 1200, 1, 0.3, 0.2, undefined, { to: 3000 })], 0.04),
  turret_shot: def([tone('square', 600, 200, 0.08, 0.2, undefined, { duty: 0.25 }), noise('bandpass', 2000, 1, 0.06, 0.2)], 0.08),
  poison: def([tone('sine', 300, 500, 0.15, 0.15, undefined, { vibrato: { rate: 12, depth: 1 } }), noise('bandpass', 900, 3, 0.2, 0.12)], 0.1),
  ability_bulwark: def([tone('square', 196, 196, 0.25, 0.22, [0.005, 0.1, 0.3, 0.1], { duty: 0.4 }), tone('sine', 98, 98, 0.3, 0.3), noise('lowpass', 900, 1, 0.2, 0.2)], 0.03),
  ability_squallblade: def([noise('bandpass', 900, 1, 0.25, 0.35, [0.02, 0.1, 0.2, 0.1], { to: 4000 }), tone('triangle', 660, 990, 0.12, 0.12)], 0.06),
  ability_brinesinger: def([tone('sine', 440, 660, 0.35, 0.22, [0.02, 0.1, 0.4, 0.15], { vibrato: { rate: 7, depth: 0.4 } }), noise('lowpass', 600, 1, 0.3, 0.2, undefined, { to: 1600 })], 0.03),
  ability_gearwright: def([tone('square', 330, 330, 0.2, 0.18, undefined, { duty: 0.25, arp: [0, 12, 7, 12], arpRate: 0.04 }), noise('highpass', 3000, 2, 0.1, 0.15)], 0.03),
  ability_prospector: def([tone('sine', 110, 60, 0.3, 0.45), noise('lowpass', 2000, 1, 0.25, 0.35, undefined, { to: 200 }), tone('triangle', 1760, 1760, 0.15, 0.08, undefined, { t: 0.05 })], 0.04),
  ability_greenwarden: def([noise('bandpass', 2500, 0.8, 0.35, 0.25, [0.05, 0.1, 0.3, 0.15], { to: 1000 }), tone('sine', 523, 784, 0.3, 0.15, [0.02, 0.1, 0.3, 0.1])], 0.04),
  // ---------------------------------------------------------------- machines / farming / fishing
  machine_hum: def([tone('saw', 60, 60, 2, 0.08, [0.3, 0.2, 1, 0.5], { filter: { type: 'lowpass', f: 300, q: 2 } }), tone('sine', 120, 120, 2, 0.06, [0.3, 0.2, 1, 0.5])], 0, { loop: true }),
  sluice_tick: def([noise('bandpass', 1800, 4, 0.03, 0.12)], 0.2),
  flux_low: def([tone('square', 440, 440, 0.12, 0.15, undefined, { duty: 0.5 }), tone('square', 330, 330, 0.12, 0.15, undefined, { duty: 0.5, t: 0.16 })], 0, { cat: 'ui', cooldown: 2 }),
  fish_cast: def([noise('bandpass', 1500, 1, 0.25, 0.25, [0.02, 0.1, 0.1, 0.1], { to: 600 }), tone('sine', 900, 300, 0.25, 0.08)], 0.06),
  fish_bite: def([noise('bandpass', 1200, 2, 0.12, 0.35, undefined, { to: 400 }), tone('sine', 800, 500, 0.1, 0.18), tone('triangle', 1320, 1320, 0.1, 0.12, undefined, { t: 0.1 })], 0.04),
  fish_reel: def([tone('square', 1200, 1100, 0.04, 0.08, [0.001, 0.02, 0, 0.015], { duty: 0.2 })], 0.15),
  fish_catch: def([noise('lowpass', 2500, 1, 0.4, 0.4, undefined, { to: 400 }), tone('triangle', 659, 659, 0.35, 0.2, [0.005, 0.1, 0.3, 0.15], { t: 0.1, arp: [0, 4, 7, 12], arpRate: 0.06 })], 0.03),
  water_pour: def([noise('bandpass', 1400, 0.8, 0.5, 0.3, [0.05, 0.2, 0.4, 0.2], { to: 900 })], 0.08),
  crop_pop: def([tone('sine', 600, 1200, 0.08, 0.2, [0.001, 0.04, 0, 0.03]), noise('bandpass', 2500, 2, 0.05, 0.1)], 0.12),
  // ---------------------------------------------------------------- bosses and events
  boss_roar: def([tone('saw', 110, 70, 1.0, 0.35, [0.05, 0.4, 0.4, 0.4], { filter: { type: 'lowpass', f: 900, q: 3, to: 300 }, vibrato: { rate: 9, depth: 0.8 } }), tone('saw', 116, 72, 1.0, 0.3, [0.05, 0.4, 0.4, 0.4], { filter: { type: 'lowpass', f: 800, q: 3 } }), noise('lowpass', 700, 1, 0.9, 0.3, [0.05, 0.3, 0.4, 0.4])], 0.05),
  boss_phase: def([tone('saw', 70, 140, 0.8, 0.3, [0.01, 0.3, 0.4, 0.3], { filter: { type: 'lowpass', f: 1200, q: 4 } }), noise('lowpass', 2000, 1, 0.8, 0.4, [0.001, 0.3, 0.3, 0.4], { to: 150 }), tone('sine', 50, 40, 1.0, 0.5)], 0),
  boss_death: def([noise('lowpass', 2500, 0.8, 2.5, 0.7, [0.001, 0.8, 0.4, 1.4], { to: 80 }), tone('saw', 220, 55, 2.2, 0.25, [0.01, 1, 0.3, 1], { filter: { type: 'lowpass', f: 1500, q: 2 } }), tone('sine', 55, 30, 2.5, 0.5, [0.01, 1, 0.4, 1.2]),
    tone('triangle', 523, 523, 1.2, 0.2, [0.05, 0.3, 0.5, 0.6], { t: 1.4, arp: [0, 4, 7, 12, 16, 19, 24], arpRate: 0.09 })], 0),
  telegraph: def([tone('square', 880, 880, 0.3, 0.12, [0.01, 0.05, 0.6, 0.05], { duty: 0.5, vibrato: { rate: 16, depth: 1 } })], 0.02),
  beacon_light: def([tone('saw', 131, 131, 2.4, 0.15, [0.3, 0.6, 0.6, 1.0], { filter: { type: 'lowpass', f: 400, q: 1, to: 3000 }, arp: [0, 7, 12, 16, 19], arpRate: 0.25 }), tone('sine', 65, 65, 2.6, 0.35, [0.2, 0.8, 0.6, 1.0]), noise('highpass', 5000, 1, 2, 0.1, [0.6, 0.4, 0.4, 0.8])], 0),
  warp: def([tone('sine', 300, 1800, 0.5, 0.25, [0.01, 0.2, 0.4, 0.2], { vibrato: { rate: 20, depth: 0.5 } }), noise('bandpass', 1000, 2, 0.5, 0.2, undefined, { to: 6000 })], 0.03),
  revive: def([tone('triangle', 392, 392, 0.8, 0.22, [0.02, 0.2, 0.5, 0.3], { arp: [0, 4, 7, 12, 16], arpRate: 0.1 }), tone('sine', 784, 784, 0.8, 0.12, [0.2, 0.2, 0.5, 0.3])], 0),
  raid_horn: def([tone('saw', 147, 147, 1.4, 0.3, [0.08, 0.2, 0.7, 0.4], { filter: { type: 'lowpass', f: 900, q: 2 }, vibrato: { rate: 5, depth: 0.15 } }), tone('saw', 220, 220, 1.4, 0.2, [0.08, 0.2, 0.7, 0.4], { filter: { type: 'lowpass', f: 1100, q: 2 } })], 0),
  eclipse: def([tone('sine', 196, 185, 2, 0.25, [0.4, 0.6, 0.5, 0.8], { vibrato: { rate: 0.7, depth: 0.5 } }), tone('sine', 277, 262, 2, 0.18, [0.6, 0.6, 0.5, 0.8]), noise('bandpass', 400, 4, 2, 0.12, [0.6, 0.6, 0.4, 0.8])], 0),
  moonfall: def([tone('saw', 880, 55, 2.5, 0.2, [0.05, 1.2, 0.3, 1.0], { filter: { type: 'lowpass', f: 3000, q: 2, to: 200 } }), noise('lowpass', 3000, 0.8, 2.5, 0.5, [0.8, 0.4, 0.5, 1.0], { to: 100 }), tone('sine', 40, 30, 2.5, 0.5, [0.8, 0.5, 0.5, 1])], 0),

  // ---------------------------------------------------------------- weather beds named by content (weather.js sfx)
  amb_rain: def([noise('highpass', 3000, 0.5, 2, 0.3, [0.4, 0.2, 1, 0.6])], 0, { loop: true, cat: 'amb' }),
  amb_storm: def([noise('highpass', 2000, 0.5, 2, 0.4, [0.4, 0.2, 1, 0.6]), noise('lowpass', 300, 0.7, 2, 0.25, [0.4, 0.2, 1, 0.6])], 0, { loop: true, cat: 'amb' }),
  amb_fog: def([noise('lowpass', 250, 0.6, 2, 0.2, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  amb_ash: def([noise('bandpass', 500, 0.6, 2, 0.2, [0.6, 0.3, 1, 0.8]), noise('highpass', 3000, 1.2, 2, 0.08, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  amb_heat: def([noise('bandpass', 1500, 2, 2, 0.08, [0.6, 0.3, 1, 0.8]), tone('sine', 3200, 3300, 2, 0.02, [0.5, 0.3, 1, 0.8], { vibrato: { rate: 9, depth: 0.2 } })], 0, { loop: true, cat: 'amb' }),
  amb_wind: def([noise('bandpass', 600, 0.6, 2, 0.35, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  amb_eclipse: def([tone('sine', 110, 108, 2, 0.12, [0.6, 0.3, 1, 0.8], { vibrato: { rate: 0.3, depth: 0.4 } }), noise('bandpass', 300, 5, 2, 0.08, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
  amb_surf: def([noise('lowpass', 800, 0.6, 2, 0.35, [0.6, 0.3, 1, 0.8])], 0, { loop: true, cat: 'amb' }),
};

// Names the TECH_SPEC requires (section 11).
export const REQUIRED_SFX = Object.freeze(['tap_wood', 'tap_stone', 'tap_plant', 'tap_ice', 'tap_null', 'clink', 'break_wood', 'break_stone', 'break_plant', 'break_crystal',
  'pickup', 'pickup_rare', 'swing', 'swing_heavy', 'hit_flesh', 'hit_armor', 'crit', 'hurt', 'death', 'dodge', 'footstep_land', 'footstep_water', 'footstep_snow', 'levelup',
  'card_flip', 'card_pick', 'card_mythic', 'skill_buy', 'craft_done', 'kiln_loop', 'build_place', 'build_remove', 'deny', 'ui_click', 'ui_hover', 'ui_open', 'ui_close',
  'glint', 'chest_open', 'plot_rise', 'tide_out', 'tide_in', 'thunder', 'rain_loop', 'wind_loop', 'surf_loop', 'crackle_loop', 'cast', 'slam', 'whoosh', 'bolt', 'wave',
  'heal', 'shield', 'burn', 'freeze', 'shatter', 'zap', 'explode', 'summon', 'turret_shot', 'machine_hum', 'sluice_tick', 'flux_low', 'fish_cast', 'fish_bite',
  'fish_reel', 'fish_catch', 'water_pour', 'crop_pop', 'boss_roar', 'boss_phase', 'boss_death', 'telegraph', 'quest_done', 'donate', 'beacon_light', 'warp', 'revive',
  'ping', 'raid_horn', 'eclipse', 'moonfall']);

export default SFX;
