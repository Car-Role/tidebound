// World map (WP7, DESIGN 4.3/21/A.9): the 9x9 plot grid. Click a plot to see its biome, feature (when known), lock
// reason and cost (Glint + Ballast), and raise it; set a charter on an owned wild plot; Beacon attunement progress.
// Tabs: Map, Almanac (weather forecast per owned biome, tides, next king tide), Waystones (fast travel).
// Opened with M, from the Tidestone (self.mapOpen) and from a Waystone (tab 'waystones', `from` = that Waystone).

import { content } from '../../../shared/data/index.js';
import { WORLD_PLOTS } from '../../../shared/config.js';
import { BIOMES, BIOME_TIER, biomeOf } from '../../../shared/grid.js';
import { ballastFor } from '../../../shared/rules/costs.js';
import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { clockNow } from '../../render/lighting.js';

const C = (ramp, i) => PAL[RAMPS[ramp][i]];
const BIOME_RAMP = { greenmarrow: 'grass', saltfen: 'teal', emberreach: 'ember', glasswaste: 'sand', hoarfrost: 'ice', umbral: 'violet' };
const FEATURE = {
  start: ['*', 'Tidestone'], archive: ['M', 'The Archive'], vault: ['V', 'Vault entrance'], arena: ['A', 'Warden altar'],
  castaway: ['C', 'Castaway'], shrine: ['S', 'Puzzle shrine'], lagoon: ['~', 'Lagoon'], vein: ['O', 'Rich vein (Drill site)'],
  grove: ['T', 'Grove'], dig: ['D', 'Dig site'], gate_site: ['G', 'Tidegate site'], wild: ['', 'Wild land'],
};
const CHARTERS = [
  ['quarry', 'Quarry', 'Stone and ore spawn +25%; wood and plants -50%'],
  ['orchard', 'Orchard', 'Wood and plants spawn +25%; stone and ore -50%'],
  ['workshop', 'Workshop', 'Machine cap +2, node cap -8'],
  ['garrison', 'Garrison', 'No enemy spawns; no Tide Lamps needed'],
];
const WNAME = { clear: 'Clear', rain: 'Rain', storm: 'Storm', fog: 'Fog', ashfall: 'Ashfall', heatwave: 'Heatwave', blizzard: 'Blizzard', eclipse: 'Eclipse' };
const CELL = 20, GX = 8, GY = 28;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const st = { tab: 0, sel: null, msg: '', msgT: 0, from: null, busy: false };

function bagCount(store, item) {
  let n = 0;
  for (const s of store.self.inv?.slots ?? []) if (s && s[0] === item) n += s[1];
  return n;
}

function plotState(store, i) {
  const plots = store.world.plots ?? [];
  const p = plots[i];
  const px = i % WORLD_PLOTS, py = Math.floor(i / WORLD_PLOTS);
  const biome = biomeOf(px, py);
  if (p?.owned) return { px, py, biome, owned: true };
  const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const x = px + dx, y = py + dy;
    return x >= 0 && y >= 0 && x < WORLD_PLOTS && y < WORLD_PLOTS && plots[y * WORLD_PLOTS + x]?.owned;
  });
  const tier = BIOME_TIER[biome];
  const unlocked = tier <= 1 || !!store.world.unlocks?.['beacon:' + (tier - 1)];
  return { px, py, biome, owned: false, adj, unlocked, raisable: adj && unlocked, tier };
}

function featureOf(store, i) {
  const p = store.world.plots?.[i];
  if (p?.known) return p.feature;
  const r = (store.world.mapReveal ?? []).find((x) => x[0] === i);
  return r ? r[1] : null;
}

function say(text) { st.msg = text; st.msgT = performance.now(); }

const WHY = { glint: 'Not enough Glint in the Treasury', ballast: 'Not enough Ballast (inventory + start-plot Stockpiles)', adjacent: 'Must touch an owned plot', beacon: 'Light the previous Beacon first', owned: 'Already raised' };

function raise(ui, i) {
  if (st.busy) return;
  st.busy = true;
  ui.ui.net.do('land.raise', { px: i % WORLD_PLOTS, py: Math.floor(i / WORLD_PLOTS) }).then((r) => {
    st.busy = false;
    if (r.ok) { say('The land rises!'); ui.ui.sound('build_place'); }
    else { say(WHY[r.d?.why] ?? `Cannot raise (${r.err})`); ui.ui.sound('deny'); }
  });
}

// ---------------------------------------------------------------- Map tab

function drawGrid(ui, store, time) {
  const plots = store.world.plots ?? [];
  const ctx = ui.ctx;
  ui.rect(GX - 2, GY - 2, CELL * WORLD_PLOTS + 4, CELL * WORLD_PLOTS + 4, UI_COLORS.borderDark);
  ui.rect(GX - 1, GY - 1, CELL * WORLD_PLOTS + 2, CELL * WORLD_PLOTS + 2, C('sea', 0));
  let hoverI = -1;
  for (let i = 0; i < WORLD_PLOTS * WORLD_PLOTS; i++) {
    const s = plotState(store, i);
    const x = GX + s.px * CELL, y = GY + s.py * CELL;
    const ramp = BIOME_RAMP[s.biome];
    if (s.owned) {
      ui.rect(x + 1, y + 1, CELL - 2, CELL - 2, C(ramp, 2));
      ui.rect(x + 1, y + 1, CELL - 2, 2, C(ramp, 3));
    } else {
      ui.rect(x + 1, y + 1, CELL - 2, CELL - 2, C('sea', 1));
      ctx.globalAlpha = 0.35;
      ui.rect(x + 4, y + 4, CELL - 8, CELL - 8, C(ramp, 1));
      ctx.globalAlpha = 1;
      if (s.raisable) {
        const a = 0.5 + 0.5 * Math.sin(time * 4 + i);
        ctx.globalAlpha = 0.5 + 0.5 * a;
        ui.rect(x + 1, y + 1, CELL - 2, 1, UI_COLORS.accent); ui.rect(x + 1, y + CELL - 2, CELL - 2, 1, UI_COLORS.accent);
        ui.rect(x + 1, y + 1, 1, CELL - 2, UI_COLORS.accent); ui.rect(x + CELL - 2, y + 1, 1, CELL - 2, UI_COLORS.accent);
        ctx.globalAlpha = 1;
      } else if (s.adj && !s.unlocked) {
        ui.rect(x + CELL / 2 - 2, y + CELL / 2 - 1, 5, 4, UI_COLORS.dim);
        ui.rect(x + CELL / 2 - 1, y + CELL / 2 - 3, 3, 2, UI_COLORS.dim);
      }
    }
    const f = featureOf(store, i);
    if (f && FEATURE[f]?.[0]) {
      let col = s.owned ? '#ffffff' : UI_COLORS.dim;
      if (f === 'shrine' && store.world.unlocks?.[`shrine:${s.px},${s.py}`]) col = UI_COLORS.good;
      ui.label(x + CELL / 2, y + 6, FEATURE[f][0], { color: col, align: 'center', outline: true });
    }
    if (st.sel === i) {
      ui.rect(x, y, CELL, 1, '#ffffff'); ui.rect(x, y + CELL - 1, CELL, 1, '#ffffff');
      ui.rect(x, y, 1, CELL, '#ffffff'); ui.rect(x + CELL - 1, y, 1, CELL, '#ffffff');
    }
    if (ui.hover(x, y, CELL, CELL)) {
      hoverI = i;
      if (ui.ui.mouse.released) { st.sel = i; ui.ui.consumeClick(); ui.ui.sound('ui_click'); }
    }
  }
  // Beacons, Waystones, players
  for (const b of store.world.beacons ?? []) {
    if (b.x == null) continue;
    ui.rect(GX + (b.x / 20) * CELL - 1, GY + (b.y / 20) * CELL - 3, 3, 5, C('gold', 4));
  }
  for (const w of store.world.waystones ?? []) ui.rect(GX + (w.x / 20) * CELL - 1, GY + (w.y / 20) * CELL - 1, 3, 3, C('teal', 4));
  const party = store.world.party ?? [];
  for (const p of party) {
    if (p.realm && p.realm !== 'overworld') continue;
    ui.rect(GX + (p.x / 20) * CELL - 1, GY + (p.y / 20) * CELL - 1, 3, 3, PAL[RAMPS[['teal', 'ember', 'gold', 'violet', 'sea', 'grass', 'flesh', 'stone'][p.color & 7]][4]]);
  }
  const me = store.me();
  if (me && store.realm.kind === 'overworld' && Math.floor(time * 3) % 2 === 0) ui.rect(GX + ((me.rx ?? me.x) / 20) * CELL - 1, GY + ((me.ry ?? me.y) / 20) * CELL - 1, 3, 3, '#ffffff');
  if (hoverI >= 0) {
    const s = plotState(store, hoverI);
    const f = featureOf(store, hoverI);
    ui.tooltip(`${content.biomes.byId[s.biome]?.name ?? s.biome} (${s.px},${s.py})\n${f ? FEATURE[f]?.[1] ?? f : 'Unknown feature'}${s.owned ? '' : s.raisable ? '\nClick, then Raise' : !s.adj ? '\nNot adjacent' : '\nLocked'}`);
  }
}

function drawInfo(ui, store) {
  const x = GX + CELL * WORLD_PLOTS + 8, w = ui.w - x - 8;
  let y = GY;
  if (st.sel == null) {
    ui.label(x, y, 'Select a plot.', { color: UI_COLORS.dim });
    y += 12;
    const next = store.world.landNext;
    if (next) { ui.label(x, y, `Next plot: #${next.ordinal}`, {}); ui.label(x, y + 10, `${fmt(next.glint)} Glint`, { color: UI_COLORS.accent }); y += 24; }
    ui.label(x, y, 'Gold edge: raisable', { color: UI_COLORS.dim }); y += 10;
    ui.label(x, y, 'Lock: needs a Beacon', { color: UI_COLORS.dim });
    return;
  }
  const s = plotState(store, st.sel);
  const f = featureOf(store, st.sel);
  const bname = content.biomes.byId[s.biome]?.name ?? s.biome;
  ui.label(x, y, bname, { color: PAL[RAMPS[BIOME_RAMP[s.biome]][4]] }); y += 10;
  ui.label(x, y, f ? FEATURE[f]?.[1] ?? f : 'Feature unknown', { color: f ? '#ffffff' : UI_COLORS.dim }); y += 12;
  if (s.owned) {
    ui.label(x, y, 'Raised', { color: UI_COLORS.good }); y += 12;
    if (f === 'wild') {
      const cur = store.world.charters?.[s.px + ',' + s.py]?.id ?? null;
      ui.label(x, y, 'Charter:', { color: UI_COLORS.dim }); y += 10;
      for (const [id, name, text] of CHARTERS) {
        const on = cur === id;
        if (ui.button(x, y, (on ? '> ' : '') + name, { w, h: 11, key: 'ch' + id, tooltip: text + '\nFree; change once per in-game day' })) {
          ui.ui.net.do('charter.set', { px: s.px, py: s.py, charter: on ? null : id }).then((r) => say(r.ok ? (on ? 'Charter removed' : `${name} charter set`) : r.err === 'cooldown' ? 'Already changed today' : 'Cannot set charter'));
        }
        y += 12;
      }
    }
  } else {
    const next = store.world.landNext ?? { ordinal: 1, glint: 0, coop: 1 };
    const ballast = ballastFor(s.biome, next.ordinal, { coop: next.coop ?? 1, tideHeight: store.world.tideHeight ?? 0 }) ?? { item: 'ballast_1', qty: 0 };
    const glint = store.world.glint ?? 0;
    if (!s.adj) { ui.label(x, y, 'Not adjacent', { color: UI_COLORS.bad }); y += 10; }
    if (!s.unlocked) { ui.label(x, y, `Needs Beacon ${s.tier - 1}`, { color: UI_COLORS.bad }); y += 10; }
    ui.label(x, y, `Plot #${next.ordinal}`, { color: UI_COLORS.dim }); y += 10;
    ui.label(x, y, `${fmt(next.glint)} Glint`, { color: glint >= next.glint ? UI_COLORS.accent : UI_COLORS.bad }); y += 10;
    const have = bagCount(store, ballast.item);
    ui.ui.sprites?.draw(ui.ctx, 'item.' + ballast.item, ui.x + x + 5, ui.y + y + 10, { scaleX: 0.7, scaleY: 0.7 });
    ui.label(x + 12, y + 2, `${have}/${ballast.qty}`, { color: have >= ballast.qty ? UI_COLORS.text : UI_COLORS.bad });
    if (ui.hover(x, y, w, 12)) ui.tooltip(`${content.items.byId[ballast.item]?.name ?? ballast.item}\nFrom your bag, topped up from Stockpiles on the start plot`);
    y += 14;
    const can = s.raisable && glint >= next.glint && !st.busy;
    if (ui.button(x, y, 'Raise plot', { w, h: 14, disabled: !s.raisable })) raise(ui, st.sel);
    if (!can && s.raisable) ui.label(x, y + 16, glint < next.glint ? 'Treasury short' : '', { color: UI_COLORS.bad });
    y += 30;
  }
  // attunement of this biome's Beacon
  const k = BIOME_TIER[s.biome];
  const a = store.world.attune?.[k];
  if (a) {
    y = Math.max(y, GY + CELL * WORLD_PLOTS - 40);
    ui.label(x, y, `Beacon ${k}${a.lit ? ' (lit)' : ''}`, { color: a.lit ? UI_COLORS.accent : UI_COLORS.text }); y += 10;
    const row = (label, v) => { ui.label(x, y, `${label} ${v[0]}/${v[1]}`, { color: v[0] >= v[1] ? UI_COLORS.good : UI_COLORS.dim }); y += 9; };
    row('Plots', a.plots); row('Castaways', a.lines); row('Shrines', a.shrines);
  }
}

// ---------------------------------------------------------------- Almanac tab

function drawAlmanac(ui, store) {
  const c = clockNow(store);
  let y = GY;
  if (!c) { ui.label(10, y, 'No clock yet.', { color: UI_COLORS.dim }); return; }
  ui.label(10, y, `Day ${c.day}, ${c.phase}. ${c.low ? `Low tide${c.king ? ' (KING TIDE)' : ''}, ${mmss(c.tideLeft)} left` : `High tide, low in ${mmss(c.tideLeft)}`}`, {}); y += 11;
  if (c.kingAt) ui.label(10, y, c.kingAt.now ? 'A king tide is out right now: a second ring of flats, caches x4.' : `Next king tide: day ${c.kingAt.day}, in ${mmss(c.kingAt.in)} (4 minutes, caches x4)`, { color: UI_COLORS.accent });
  y += 14;
  const owned = new Set((store.world.plots ?? []).map((p, i) => (p.owned ? biomeOf(i % 9, Math.floor(i / 9)) : null)).filter(Boolean));
  for (const b of BIOMES) {
    if (!owned.has(b)) continue;
    const cur = c.w?.[b];
    const fc = c.fc?.[b] ?? [];
    ui.label(10, y + 10, content.biomes.byId[b]?.name ?? b, { color: PAL[RAMPS[BIOME_RAMP[b]][4]] });
    let x = 84;
    const cell = (id, label, now) => {
      if (now) ui.rect(x - 2, y - 1, 52, 36, UI_COLORS.bgLight);
      if (ui.ui.sprites?.has('icon.weather.' + id)) ui.ui.sprites.draw(ui.ctx, 'icon.weather.' + id, ui.x + x + 16, ui.y + y, {});
      ui.label(x + 24, y + 17, WNAME[id] ?? id, { color: '#ffffff', align: 'center' });
      ui.label(x + 24, y + 26, label, { color: UI_COLORS.dim, align: 'center' });
      x += 53;
    };
    if (cur) cell(cur[0], mmss(Math.max(0, cur[1] - c.since)), true);
    for (const [id, dur] of fc) cell(id, Math.round(dur / 60) + ' min', false);
    y += 40;
  }
  ui.label(10, ui.h - 14, 'Weather is rolled three steps ahead: this forecast is always true.', { color: UI_COLORS.dim });
}

// ---------------------------------------------------------------- Waystones tab

function drawWaystones(ui, store) {
  const list = store.world.waystones ?? [];
  const wayfarer = (store.self.stats?.flags ?? []).includes('wayfarer');
  let y = GY;
  if (!list.length) { ui.label(10, y, 'No Waystones yet (skill T3 unlocks them; one per plot).', { color: UI_COLORS.dim }); return; }
  ui.label(10, y, st.from ? 'Travel from this Waystone (2 s channel; moving cancels):' : wayfarer ? 'Wayfarer: travel from anywhere (5 min cooldown).' : 'Stand at a Waystone to travel.', { color: UI_COLORS.dim });
  y += 12;
  ui.list(8, y, ui.w - 16, ui.h - y - 8, list, 14, (w, ry, hot) => {
    if (hot) ui.rect(8, ry, ui.w - 16, 14, UI_COLORS.slotHover);
    const here = w.id === st.from;
    ui.label(12, ry + 3, `${content.biomes.byId[w.biome]?.name ?? '?'} (${w.px},${w.py})${here ? '  - you are here' : ''}`, { color: here ? UI_COLORS.accent : '#ffffff' });
    const can = !here && (st.from || wayfarer);
    if (ui.button(ui.w - 60, ry + 1, 'Travel', { w: 46, h: 12, disabled: !can, key: 'wy' + w.id })) {
      ui.ui.net.do('waystone.go', { id: w.id }).then((r) => {
        if (r.ok) { ui.ui.close('map'); } else say(r.err === 'cooldown' ? 'Wayfarer on cooldown' : r.err === 'range' ? 'Stand at a Waystone' : 'Cannot travel');
      });
    }
  }, 'waystones');
}

export default {
  id: 'map',
  key: 'panel.map',
  modal: false,
  w: 300, h: 222, anchor: 'center',
  open(store, args) {
    st.from = args?.from ?? null;
    st.tab = args?.tab === 'almanac' ? 1 : args?.tab === 'waystones' ? 2 : args?.tab === 'map' ? 0 : st.tab;
    if (st.sel == null && store.world.plots) {
      const me = store.me();
      if (me) st.sel = Math.floor((me.ry ?? me.y) / 20) * WORLD_PLOTS + Math.floor((me.rx ?? me.x) / 20);
    }
  },
  close() { st.from = null; },
  draw(ui, store) {
    ui.frame('World Map');
    st.tab = ui.tabs(8, 14, ['Map', 'Almanac', 'Waystones'], st.tab);
    if (ui.button(ui.w - 16, 2, 'x', { w: 12, h: 10, key: 'close' })) { ui.ui.close('map'); return; }
    const time = performance.now() / 1000;
    if (st.tab === 0) { drawGrid(ui, store, time); drawInfo(ui, store); }
    else if (st.tab === 1) drawAlmanac(ui, store);
    else drawWaystones(ui, store);
    if (st.msg && performance.now() - st.msgT < 3000) ui.label(ui.w / 2, ui.h - 11, st.msg, { color: UI_COLORS.accent, align: 'center', outline: true });
  },
};
