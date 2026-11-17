// Clock (WP7, DESIGN 4.6/21): under the Treasury. A day/night dial (sun and moon arc over the horizon), the tide gauge
// (fills while the sea is high, empties at low tide, blinks while turning, gold for a king tide), the weather icon of
// the biome you stand in, and a Blizzard chill meter when it applies. Hover for details and the forecast.
// Also opens the map when the server asks (self.mapOpen from the Tidestone or a Waystone).

import { UI_COLORS } from '../widgets.js';
import { measure } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { clockNow, weatherAt, biomeAtTile, DAY_LEN } from '../../render/lighting.js';
import { HUD_RIGHT, HUD_W } from './treasury.js';

const WNAME = { clear: 'Clear', rain: 'Rain', storm: 'Storm', fog: 'Fog', ashfall: 'Ashfall', heatwave: 'Heatwave', blizzard: 'Blizzard', eclipse: 'Eclipse', king_tide: 'King tide' };
const WEFFECT = {
  rain: 'crops watered, fish bite faster', storm: 'lightning every 8 s, Tide Wheels +50%', fog: 'view 7 tiles, ambushes x2, dig spots glow',
  ashfall: 'move -10%, kilns +20%, ashwood +50%', heatwave: 'Prism Arrays +50%, crops thirsty', blizzard: 'chill: stay near heat; everice +50%',
  eclipse: 'elites guaranteed, +50% XP', clear: 'calm',
};
const C = (ramp, i) => PAL[RAMPS[ramp][i]];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let subscribed = false;

function subscribe(ui, store) {
  if (subscribed) return;
  subscribed = true;
  const mgr = ui.ui;
  store.on('change:self.mapOpen', (d) => {
    if (!d) return;
    if (mgr.isOpen('map')) mgr.get('map').open(store, d);
    else mgr.open('map', d);
  });
}

function dial(ui, x, y, r, t) {
  const ctx = ui.ctx, cx = ui.x + x, cy = ui.y + y;
  // sky
  const night = t >= 960 || t < 60;
  const dusk = (t >= 840 && t < 960) || t < 120;
  ctx.fillStyle = night ? C('ink', 2) : dusk ? C('ember', 3) : C('sea', 3);
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
  ctx.fillStyle = C('grass', 1); ctx.fillRect(cx - r, cy, r * 2 + 1, 2);
  // sun runs dawn->dusk over the arc (t 0..960), moon over the night (960..1440)
  const sunA = Math.PI + Math.PI * Math.min(1, t / 960);
  const moonA = Math.PI + Math.PI * Math.max(0, (t - 960) / 480);
  if (t < 960) { ctx.fillStyle = C('gold', 4); ctx.fillRect(Math.round(cx + Math.cos(sunA) * (r - 3)) - 1, Math.round(cy + Math.sin(sunA) * (r - 3)) - 1, 3, 3); }
  else { ctx.fillStyle = C('ice', 4); ctx.fillRect(Math.round(cx + Math.cos(moonA) * (r - 3)) - 1, Math.round(cy + Math.sin(moonA) * (r - 3)) - 1, 3, 3); }
  ctx.strokeStyle = UI_COLORS.borderDark; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
}

export default {
  id: 'clock',
  anchor: 'top-right',
  order: 51,
  draw(ui, store) {
    if (!store.myId || ui.ui.isOpen('title')) return;
    subscribe(ui, store);
    const c = clockNow(store);
    if (!c) return;
    const now = performance.now();
    const x0 = ui.w - HUD_RIGHT - HUD_W, y0 = 20, w = HUD_W, h = 28;
    ui.rect(x0, y0, w, h, UI_COLORS.borderDark);
    ui.rect(x0 + 1, y0 + 1, w - 2, h - 2, UI_COLORS.bg);
    const overworld = store.realm.kind === 'overworld';
    dial(ui, x0 + 13, y0 + 15, 10, c.t);
    // day number gets its own row under the tide line (it used to overlap the dial)
    ui.label(x0 + 27, y0 + 20, `Day ${c.day}`, { color: UI_COLORS.dim });

    // tide gauge
    const tx = x0 + 27, ty = y0 + 4, tw = 22, th = 7;
    const turning = c.low && c.tideLeft <= 10;
    // water level: full at high tide, draining over its last 20 s, low while the flats are out, rising when turning
    const level = !c.low ? Math.min(1, 0.15 + c.tideLeft / 20) : turning ? 0.15 + 0.85 * (1 - c.tideLeft / 10) : 0.15;
    ui.rect(tx, ty, tw, th, UI_COLORS.borderDark);
    ui.rect(tx + 1, ty + 1, tw - 2, th - 2, C('sand', 3));
    const wcol = c.king ? C('gold', 3) : turning && Math.floor(now / 200) % 2 ? C('ember', 3) : C('sea', 3);
    const lh = Math.max(1, Math.round((th - 2) * level));
    ui.rect(tx + 1, ty + th - 1 - lh, tw - 2, lh, wcol);
    const blink = turning && Math.floor(now / 300) % 2 === 0;
    const tideWord = turning ? 'Turn' : c.low ? (c.king ? 'King' : 'Low') : 'High';
    ui.label(tx, ty + 9, tideWord, { color: turning ? (blink ? UI_COLORS.bad : UI_COLORS.text) : c.low ? (c.king ? UI_COLORS.accent : UI_COLORS.good) : UI_COLORS.dim });
    // the countdown follows the word with a gap (it used to start at a fixed x and run into "High"/"TURN")
    ui.label(tx + measure(tideWord) + 4, ty + 9, mmss(c.tideLeft), { color: turning ? UI_COLORS.bad : UI_COLORS.text, align: 'left' });

    // weather of the biome underfoot
    const me = store.me();
    const px = me ? me.rx ?? me.x : 0, py = me ? me.ry ?? me.y : 0;
    const w8 = overworld ? weatherAt(store, px, py) : 'clear';
    const biome = biomeAtTile(px, py) ?? 'greenmarrow';
    const ix = x0 + w - 18, iy = y0 + 2;
    if (ui.ui.sprites?.has('icon.weather.' + w8)) ui.ui.sprites.draw(ui.ctx, 'icon.weather.' + w8, ui.x + ix, ui.y + iy, {});
    else ui.label(ix, iy + 4, WNAME[w8]?.slice(0, 3) ?? '?', { color: UI_COLORS.text });
    if (c.king && overworld) ui.ui.sprites?.draw(ui.ctx, 'icon.weather.king_tide', ui.x + ix - 17, ui.y + iy, {});

    const chill = store.self.chill;
    if (chill && chill.v > 0) {
      const cy = 66;                               // below the Flux row
      ui.label(x0, cy, 'Chill', { color: C('ice', 3), outline: true });
      ui.bar(x0 + 28, cy + 1, w - 28, 5, chill.v, chill.max, chill.v > chill.max ? UI_COLORS.bad : C('ice', 3));
    }

    if (ui.hover(x0, y0, w, h)) {
      const phaseLeft = c.t < 120 ? 120 - c.t : c.t < 840 ? 840 - c.t : c.t < 960 ? 960 - c.t : DAY_LEN - c.t;
      const nextPhase = c.t < 120 ? 'day' : c.t < 840 ? 'dusk' : c.t < 960 ? 'night' : 'dawn';
      const fc = c.fc?.[biome] ?? [];
      const bname = biome[0].toUpperCase() + biome.slice(1);
      const lines = [
        `Day ${c.day}, ${c.phase} (${nextPhase} in ${mmss(phaseLeft)})`,
        c.low ? `Low tide${c.king ? ' (KING TIDE)' : ''}: flats exposed for ${mmss(c.tideLeft)}` : `High tide: the sea pulls back in ${mmss(c.tideLeft)}`,
        overworld ? `${bname}: ${WNAME[w8] ?? w8}${WEFFECT[w8] ? ' - ' + WEFFECT[w8] : ''}` : 'Underground',
      ];
      if (overworld && fc.length) lines.push('Next: ' + fc.map((f) => WNAME[f[0]] ?? f[0]).join(', '));
      if (c.kingAt) lines.push(c.kingAt.now ? 'King tide now!' : `Next king tide: day ${c.kingAt.day} (in ${mmss(c.kingAt.in)})`);
      ui.tooltip(lines.join('\n'));
      if (ui.ui.mouse.released) { ui.ui.consumeClick(); ui.ui.open('map', { tab: 'almanac' }); }
    }
  },
};
