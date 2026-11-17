// WP12 music track definitions (TECH_SPEC 11, DESIGN 20). Every track is generative: the sequencer builds an
// 8-bar melody per cycle from a seeded random walk on the scale with motif structure A A' B A (A stays fixed per
// track so it stays recognisable; A' and B vary per cycle). `night` overrides are merged for night variants.
// Track fields: bpm, scale (semitones), root (MIDI), bars, swing?, channels { bass, lead, pad, drums, arp? }, night.
//   bass:  { wave, pattern (16 steps, 'x' = note on chord root, 'o' = fifth), oct, vol, cutoff? }
//   lead:  { wave, duty?, gen: 'melody', density 0..1, range [lo, hi] MIDI, vol, detune?, fm?, delay?, cutoff? }
//   pad:   { wave, chords: [[deg...]...] (one per 2 bars, scale degrees), vol, cutoff? }
//   drums: { kick, snare, hat (8 or 16 chars), vol }
//   arp:   { wave, rate (steps per note), vol, oct }   (boss tracks: the fifth channel)

const MAJ_PENTA = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIN_PENTA = [0, 3, 5, 7, 10];
const WHOLE = [0, 2, 4, 6, 8, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];

const TRACKS = {
  title: { bpm: 88, scale: MAJ_PENTA, root: 48, bars: 8, seed: 11,
    channels: {
      bass: { wave: 'triangle', pattern: 'x.......x...o...', oct: -1, vol: 0.4 },
      lead: { wave: 'triangle', gen: 'melody', density: 0.38, range: [64, 81], vol: 0.3, delay: { time: 0.34, fb: 0.35, mix: 0.3 } },
      pad: { wave: 'sine', chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [4, 6, 8]], vol: 0.2 },
      drums: { kick: 'x.......', snare: '........', hat: '....x...', vol: 0.12 } },
    night: { bpm: -10, lead: { density: 0.22 }, pad: { vol: 0.28 } } },

  greenmarrow: { bpm: 96, scale: MAJ_PENTA, root: 48, bars: 8, seed: 101,
    channels: {
      bass: { wave: 'triangle', pattern: 'x...x...x..x.x..', oct: -1, vol: 0.45 },
      lead: { wave: 'triangle', gen: 'melody', density: 0.45, range: [60, 79], vol: 0.32 },
      pad: { wave: 'sine', chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], vol: 0.2 },
      drums: { kick: 'x...x...', snare: '....x...', hat: '..x...x.', vol: 0.22 } },
    night: { bpm: -12, lead: { density: 0.25 }, pad: { vol: 0.32 }, drums: { vol: 0.1 } } },

  saltfen: { bpm: 84, scale: DORIAN, root: 50, bars: 8, seed: 202,
    channels: {
      bass: { wave: 'triangle', pattern: 'x.....x...x.....', oct: -1, vol: 0.45 },
      lead: { wave: 'square', duty: 0.25, gen: 'melody', density: 0.4, range: [62, 79], vol: 0.18, cutoff: 1800 },
      pad: { wave: 'triangle', chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 2, 4]], vol: 0.17 },
      drums: { kick: 'x.......x..x....', snare: '........x.......', hat: '..x...x...x...x.', vol: 0.2 } },
    night: { bpm: -10, lead: { density: 0.24 }, pad: { vol: 0.28 }, drums: { vol: 0.1 } } },

  emberreach: { bpm: 108, scale: PHRYGIAN, root: 52, bars: 8, seed: 303,
    channels: {
      bass: { wave: 'saw', pattern: 'x.x...x.x.x...x.', oct: -1, vol: 0.32, cutoff: 500 },
      lead: { wave: 'saw', gen: 'melody', density: 0.42, range: [59, 76], vol: 0.16, cutoff: 1300 },
      pad: { wave: 'saw', chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]], vol: 0.1, cutoff: 700 },
      drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', vol: 0.26 } },
    night: { bpm: -14, lead: { density: 0.26 }, pad: { vol: 0.16 }, drums: { vol: 0.14 } } },

  glasswaste: { bpm: 100, scale: LYDIAN, root: 57, bars: 8, seed: 404,
    channels: {
      bass: { wave: 'triangle', pattern: 'x.......x.x.....', oct: -2, vol: 0.4 },
      lead: { wave: 'sine', gen: 'melody', density: 0.4, range: [69, 88], vol: 0.26, fm: { ratio: 3.5, depth: 1.6 } },
      pad: { wave: 'sine', chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [2, 4, 6]], vol: 0.18 },
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x', vol: 0.16 } },
    night: { bpm: -12, lead: { density: 0.24 }, pad: { vol: 0.28 } } },

  hoarfrost: { bpm: 76, scale: MIN_PENTA, root: 54, bars: 8, seed: 505,
    channels: {
      bass: { wave: 'sine', pattern: 'x...............', oct: -1, vol: 0.4 },
      lead: { wave: 'triangle', gen: 'melody', density: 0.3, range: [66, 85], vol: 0.26, delay: { time: 0.47, fb: 0.5, mix: 0.45 } },
      pad: { wave: 'sine', chords: [[0, 2, 4], [2, 4, 6], [1, 3, 5], [0, 2, 4]], vol: 0.22 },
      drums: { kick: '........', snare: '........', hat: '....x...', vol: 0.08 } },
    night: { bpm: -8, lead: { density: 0.18 }, pad: { vol: 0.3 } } },

  umbral: { bpm: 70, scale: WHOLE, root: 48, bars: 8, seed: 606,
    channels: {
      bass: { wave: 'triangle', pattern: 'x.......o.......', oct: -1, vol: 0.4 },
      lead: { wave: 'square', duty: 0.5, gen: 'melody', density: 0.32, range: [60, 78], vol: 0.12, detune: 9, cutoff: 1500 },
      pad: { wave: 'triangle', chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [3, 5, 7]], vol: 0.16 },
      drums: { kick: 'x...........x...', snare: '........', hat: '......x.......x.', vol: 0.12 } },
    night: { bpm: -6, lead: { density: 0.2 }, pad: { vol: 0.24 } } },

  vault: { bpm: 112, scale: AEOLIAN, root: 45, bars: 8, seed: 707,
    channels: {
      bass: { wave: 'square', duty: 0.25, pattern: 'x.x.x.x.x.x.x.x.', oct: -1, vol: 0.22, cutoff: 700 },
      lead: { wave: 'square', duty: 0.25, gen: 'melody', density: 0.5, range: [64, 81], vol: 0.15, cutoff: 2200 },
      pad: { wave: 'saw', chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], vol: 0.1, cutoff: 900 },
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', vol: 0.26 } },
    night: {} },

  boss: { bpm: 138, scale: HARM_MINOR, root: 52, bars: 8, seed: 808,
    channels: {
      bass: { wave: 'saw', pattern: 'x.xx.xx.x.xx.xx.', oct: -1, vol: 0.3, cutoff: 650 },
      lead: { wave: 'square', duty: 0.25, gen: 'melody', density: 0.55, range: [64, 84], vol: 0.15, cutoff: 2600 },
      pad: { wave: 'saw', chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], vol: 0.1, cutoff: 1000 },
      drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', vol: 0.3 },
      arp: { wave: 'square', duty: 0.125, rate: 1, vol: 0.08, oct: 1 } },
    night: {} },

  trench: { bpm: 80, scale: [0, 1, 3, 5, 6, 8, 10], root: 38, bars: 8, seed: 909,
    channels: {
      bass: { wave: 'sine', pattern: 'x.......x.......', oct: 0, vol: 0.5 },
      lead: { wave: 'sine', gen: 'melody', density: 0.28, range: [60, 76], vol: 0.2, fm: { ratio: 1.5, depth: 0.8 }, delay: { time: 0.56, fb: 0.45, mix: 0.4 } },
      pad: { wave: 'saw', chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 2, 4]], vol: 0.09, cutoff: 500 },
      drums: { kick: 'x.......', snare: '........', hat: '........', vol: 0.2 } },
    night: {} },

  tidegate: { bpm: 92, scale: DORIAN, root: 50, bars: 8, seed: 1010,
    channels: {
      bass: { wave: 'triangle', pattern: 'x...x...x...x.x.', oct: -1, vol: 0.45 },
      lead: { wave: 'triangle', gen: 'melody', density: 0.42, range: [62, 81], vol: 0.3, delay: { time: 0.33, fb: 0.3, mix: 0.25 } },
      pad: { wave: 'saw', chords: [[0, 2, 4], [3, 5, 7], [6, 8, 10], [4, 6, 8]], vol: 0.11, cutoff: 1400 },
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', vol: 0.22 } },
    night: { bpm: -8, lead: { density: 0.3 } } },

  moon: { bpm: 126, scale: WHOLE, root: 46, bars: 8, seed: 1111,
    channels: {
      bass: { wave: 'saw', pattern: 'x.x.x.xxx.x.x.xx', oct: -1, vol: 0.3, cutoff: 600 },
      lead: { wave: 'square', duty: 0.5, gen: 'melody', density: 0.5, range: [62, 86], vol: 0.13, detune: 12, cutoff: 2400 },
      pad: { wave: 'saw', chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [3, 5, 7]], vol: 0.11, cutoff: 1100 },
      drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', vol: 0.3 },
      arp: { wave: 'square', duty: 0.25, rate: 1, vol: 0.07, oct: 1 } },
    night: {} },

  raid: { bpm: 128, scale: PHRYGIAN, root: 52, bars: 8, seed: 1212,
    channels: {
      bass: { wave: 'saw', pattern: 'x.x.x.x.x.x.xxx.', oct: -1, vol: 0.32, cutoff: 600 },
      lead: { wave: 'saw', gen: 'melody', density: 0.5, range: [62, 81], vol: 0.13, cutoff: 1800 },
      pad: { wave: 'saw', chords: [[0, 2, 4], [1, 3, 5], [6, 8, 10], [0, 2, 4]], vol: 0.1, cutoff: 900 },
      drums: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x..x....x..x', hat: 'xxxxxxxxxxxxxxxx', vol: 0.32 },
      arp: { wave: 'square', duty: 0.25, rate: 2, vol: 0.06, oct: 0 } },
    night: {} },
};

export const TRACK_IDS = Object.freeze(Object.keys(TRACKS));
export default TRACKS;
