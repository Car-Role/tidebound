// Procedural 5x7 pixel font (TECH_SPEC 8.3). Glyphs are 5 column bytes as hex strings (bit 0 = top row).
// Text renders to cached canvases keyed by (string, colour, outline).

const HEX = {
  ' ': '0000000000', '!': '00005f0000', '"': '0007000700', '#': '147f147f14', '$': '242a7f2a12',
  '%': '2313086462', '&': '3649552250', "'": '0005030000', '(': '001c224100', ')': '0041221c00',
  '*': '082a1c2a08', '+': '08083e0808', ',': '0050300000', '-': '0808080808', '.': '0060600000',
  '/': '2010080402', '0': '3e5149453e', '1': '00427f4000', '2': '4261514946', '3': '2141454b31',
  '4': '1814127f10', '5': '2745454539', '6': '3c4a494930', '7': '0171090503', '8': '3649494936',
  '9': '064949291e', ':': '0036360000', ';': '0056360000', '<': '0814224100', '=': '1414141414',
  '>': '0041221408', '?': '0201510906', '@': '324979413e', 'A': '7e1111117e', 'B': '7f49494936',
  'C': '3e41414122', 'D': '7f4141221c', 'E': '7f49494941', 'F': '7f09090101', 'G': '3e41415132',
  'H': '7f0808087f', 'I': '00417f4100', 'J': '2040413f01', 'K': '7f08142241', 'L': '7f40404040',
  'M': '7f0204027f', 'N': '7f0408107f', 'O': '3e4141413e', 'P': '7f09090906', 'Q': '3e4151215e',
  'R': '7f09192946', 'S': '4649494931', 'T': '01017f0101', 'U': '3f4040403f', 'V': '1f2040201f',
  'W': '7f2018207f', 'X': '6314081463', 'Y': '0304780403', 'Z': '6151494543', '[': '007f414100',
  '\\': '0204081020', ']': '0041417f00', '^': '0402010204', '_': '4040404040', '`': '0001020400',
  'a': '2054545478', 'b': '7f48444438', 'c': '3844444420', 'd': '384444487f', 'e': '3854545418',
  'f': '087e090102', 'g': '081454543c', 'h': '7f08040478', 'i': '00447d4000', 'j': '2040443d00',
  'k': '007f102844', 'l': '00417f4000', 'm': '7c04180478', 'n': '7c08040478', 'o': '3844444438',
  'p': '7c14141408', 'q': '081414187c', 'r': '7c08040408', 's': '4854545420', 't': '043f444020',
  'u': '3c4040207c', 'v': '1c2040201c', 'w': '3c4030403c', 'x': '4428102844', 'y': '0c5050503c',
  'z': '4464544c44', '{': '0008364100', '|': '00007f0000', '}': '0041360800', '~': '0804081008',
  // arrows and icons
  '←': '081c2a0808', '↑': '04027f0204', '→': '08082a1c08', '↓': '10207f2010',
  '♥': '0c1e3c1e0c', '★': '14363f3614', '●': '1c3e3e3e1c',
};

export const GLYPH_W = 5, GLYPH_H = 7, ADVANCE = 6, LINE_H = 9;

export const GLYPHS = Object.freeze(Object.fromEntries(Object.entries(HEX).map(([ch, hex]) => {
  const cols = new Uint8Array(5);
  for (let i = 0; i < 5; i++) cols[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return [ch, cols];
})));

export function measure(str) {
  let w = 0, line = 0;
  for (const ch of String(str)) {
    if (ch === '\n') { w = Math.max(w, line); line = 0; continue; }
    line += ADVANCE;
  }
  w = Math.max(w, line);
  return Math.max(0, w - 1);
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function plot(ctx, str, ox, oy) {
  let x = ox, y = oy;
  for (const ch of String(str)) {
    if (ch === '\n') { x = ox; y += LINE_H; continue; }
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let cx = 0; cx < 5; cx++) {
      const col = g[cx];
      if (!col) continue;
      for (let cy = 0; cy < 7; cy++) if (col & (1 << cy)) ctx.fillRect(x + cx, y + cy, 1, 1);
    }
    x += ADVANCE;
  }
}

const cache = new Map();
const MAX_CACHE = 600;

// Returns a cached canvas with the rendered string (1 px outline adds a 1 px border on every side).
export function textCanvas(str, colorCss = '#ffffff', outlineCss = '#0d0a14') {
  const key = str + '\u0000' + colorCss + '\u0000' + (outlineCss || '');
  let c = cache.get(key);
  if (c) return c;
  const lines = String(str).split('\n').length;
  const pad = outlineCss ? 1 : 0;
  c = makeCanvas(Math.max(1, measure(str) + pad * 2), lines * LINE_H - 2 + pad * 2);
  const ctx = c.getContext('2d');
  if (outlineCss) {
    ctx.fillStyle = outlineCss;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) plot(ctx, str, pad + dx, pad + dy);
  }
  ctx.fillStyle = colorCss;
  plot(ctx, str, pad, pad);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, c);
  return c;
}

// Draw text at (x, y) top-left. opts: { color, outline (css or false), align: 'left'|'center'|'right', scale }
export function drawText(ctx, str, x, y, opts = {}) {
  const c = textCanvas(String(str), opts.color ?? '#ffffff', opts.outline === false ? null : (opts.outline ?? '#0d0a14'));
  const s = opts.scale ?? 1;
  let dx = x;
  if (opts.align === 'center') dx = x - Math.floor((c.width * s) / 2);
  else if (opts.align === 'right') dx = x - c.width * s;
  ctx.drawImage(c, Math.round(dx), Math.round(y), c.width * s, c.height * s);
  return c.width * s;
}

export default { drawText, measure, textCanvas, GLYPHS };
