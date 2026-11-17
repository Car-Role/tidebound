// Master palette (TECH_SPEC 9.1). Every generated pixel uses one of these characters.
// '.' transparent, '0' pure black, '#' pure white, 'Z' accent; 12 ramps x 5 shades (dark -> light).
// 63 colours + transparent = 64 palette entries (the character set 0-9 a-z A-Z # has room for exactly 63).

export const RAMP_COLORS = Object.freeze({
  stone:  ['#3a3d4a', '#565a68', '#7a7e8a', '#a3a6ae', '#cfd1d4'],
  brown:  ['#3b2418', '#5e3a24', '#87562f', '#ad7a45', '#d1a46a'],
  sand:   ['#7a6440', '#a68b5b', '#cbb07a', '#e3cd98', '#f4e6bd'],
  grass:  ['#1e3d2a', '#2f5e33', '#4a8a3c', '#74b04a', '#a8d46a'],
  teal:   ['#123b3d', '#1d5c58', '#2d8577', '#4eb09a', '#8ad6bf'],
  sea:    ['#0e1f3d', '#16365e', '#1f5687', '#3584b0', '#6cb7d6'],
  ember:  ['#4a1414', '#8a2418', '#c4441e', '#ec7a2a', '#ffb54a'],
  gold:   ['#5a3e0e', '#8a6414', '#c49a22', '#ecc94a', '#fff08a'],
  violet: ['#2a1640', '#47266a', '#6a3d96', '#9466c4', '#c39ee6'],
  ice:    ['#2c4a6a', '#4a7aa0', '#78aed0', '#a8d6ec', '#dcf2fa'],
  flesh:  ['#5a3328', '#8f5640', '#c4835e', '#e8b48a', '#fbe0c0'],
  ink:    ['#0d0a14', '#1a1424', '#2a2238', '#3e344e', '#584a6a'],
});

const RAMP_CHARS = '123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY';

export const RAMPS = {};
export const PAL = { '.': null, '0': '#000000', '#': '#ffffff', 'Z': '#ff4fa0' };
{
  let i = 0;
  for (const [name, colors] of Object.entries(RAMP_COLORS)) {
    RAMPS[name] = [];
    for (const c of colors) {
      const ch = RAMP_CHARS[i++];
      RAMPS[name].push(ch);
      PAL[ch] = c;
    }
  }
}
Object.freeze(RAMPS);
Object.freeze(PAL);

// Index order: 0 = transparent. PALETTE_CHARS[i] is the character for palette index i.
export const PALETTE_CHARS = Object.freeze(['.', '0', ...RAMP_CHARS, 'Z', '#']);
export const CHAR_INDEX = Object.freeze(Object.fromEntries(PALETTE_CHARS.map((c, i) => [c, i])));

const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
// RGBA bytes per palette index (alpha 0 for transparent), for ImageData writes.
export const RGBA = (() => {
  const out = new Uint8ClampedArray(PALETTE_CHARS.length * 4);
  PALETTE_CHARS.forEach((ch, i) => {
    if (!PAL[ch]) return;
    const [r, g, b] = hexToRgb(PAL[ch]);
    out.set([r, g, b, 255], i * 4);
  });
  return out;
})();

const RAMP_OF = {};
for (const [name, chars] of Object.entries(RAMPS)) chars.forEach((c, i) => { RAMP_OF[c] = [name, i]; });

export const rampOf = (ch) => RAMP_OF[ch]?.[0] ?? null;
// Shade of the same ramp, clamped: shade('k', -2) -> two steps darker.
export function shade(ch, d) {
  const r = RAMP_OF[ch];
  if (!r) return ch;
  const ramp = RAMPS[r[0]];
  return ramp[Math.max(0, Math.min(4, r[1] + d))];
}
export const darkest = (ch) => (RAMP_OF[ch] ? RAMPS[RAMP_OF[ch][0]][0] : '0');
export const color = (ch) => PAL[ch] ?? '#ff00ff';

// Player colours (hello.color 0..7) as ramp names used for clothing swaps and UI tints.
export const PLAYER_RAMPS = Object.freeze(['teal', 'ember', 'gold', 'violet', 'sea', 'grass', 'flesh', 'stone']);
export const playerColor = (c) => PAL[RAMPS[PLAYER_RAMPS[c & 7]][3]];
