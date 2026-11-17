// WP12 ambient FX + audio director. update(dt, store, view) is called once per frame by the renderer
// (view in source px: x, y, w, h, time). It:
//  - emits biome ambience particles over the view (fireflies at night, leaf fall near trees, water ripples, ash and
//    embers, glass glints, snow and aurora motes, void motes) and screen-area weather (rain, storms, snow,
//    blizzards, ashfall, fog, heat shimmer, eclipse motes) from world.clock (per-biome weather `w[biome]`);
//  - schedules entity-bound loops: kiln/boiler/forge smoke, machine sparks, sluice flow, gem sparkles, Beacon motes,
//    elite auras, burn / chill / bleed status particles (mob `st` bitmask in registries.STATUSES order), footstep
//    variants (snow / ash / splash) for the local player;
//  - drives audio, which nothing else does: listener = camera centre, music by biome / realm / nearby boss /
//    title screen with night variants, ambience beds (surf near water, wind, crackle, rain, storm, fog, eclipse).
// All particle emits respect the router's budget (cosmetic emits are dropped first). No per-frame allocation.

import * as particles from './particles.js';
import { budgetScale } from './router.js';
import audio from '../audio/audio.js';
import { T, isWater, biomeOf, BIOMES } from '../../shared/grid.js';
import { PLOT } from '../../shared/config.js';

const TILE = 16;
const STATUS_BIT = { burn: 1 << 0, bleed: 1 << 1, chill: 1 << 2, freeze: 1 << 4 };
const WEATHER_FX = {
  rain: [['rain', 140]], storm: [['storm_rain', 260]], fog: [['fog_bank', 1.6]], ashfall: [['ashfall', 60], ['_embers_rise', 2]],
  heatwave: [['heat_shimmer', 14]], blizzard: [['blizzard', 220], ['snow', 60]], eclipse: [['eclipse_motes', 30]], king_tide: [],
};
// Per-biome ambient particles: [preset, rate per screen per second, day | night | any]
const BIOME_FX = {
  greenmarrow: [['fireflies', 6, 'night']],
  saltfen: [['fireflies', 5, 'night'], ['_bubbles', 1.5, 'any']],
  emberreach: [['_embers_rise', 5, 'any'], ['ashfall', 6, 'any']],
  glasswaste: [['gem_sparkle', 4, 'any'], ['heat_shimmer', 2, 'day']],
  hoarfrost: [['snow', 18, 'any'], ['eclipse_motes', 2, 'night']],
  umbral: [['hit_null', 1.2, 'any'], ['eclipse_motes', 6, 'any']],
};
const WEATHER_AMB = { rain: ['rain', 0.7], storm: ['storm', 0.9], fog: ['fog', 0.6], ashfall: ['crackle', 0.5], heatwave: ['heat', 0.4], blizzard: ['wind', 1], eclipse: ['eclipse', 0.6] };
const BIOME_AMB = { hoarfrost: ['wind', 0.45], emberreach: ['crackle', 0.35], umbral: ['eclipse', 0.2] };

const acc = new Map();         // preset -> fractional emit accumulator
const lastSent = { track: null, beds: Object.create(null) };
let audioT = 0, waterSample = 0, nearWater = 0;
const one = { count: 1 };

function emitRate(name, rate, dt, x0, y0, w, h, store, groundTest) {
  const k = budgetScale(name);
  if (k <= 0) return;
  let a = (acc.get(name) ?? 0) + rate * k * dt;
  while (a >= 1) {
    a -= 1;
    const x = x0 + Math.random() * w, y = y0 + Math.random() * h;
    if (groundTest && !groundTest(store, x, y)) continue;
    particles.emit(name, x, y, one);
  }
  acc.set(name, a);
}
const onLand = (store, x, y) => { const g = store.groundAt(Math.floor(x), Math.floor(y)); return g !== T.EMPTY && !isWater(g); };
const onWater = (store, x, y) => { const g = store.groundAt(Math.floor(x), Math.floor(y)); return g === T.SHALLOW || g === T.DEEP; };

function weatherHere(clock, biome) {
  if (!clock) return 'clear';
  const w = clock.w?.[biome];
  return (Array.isArray(w) ? w[0] : w) ?? clock.weather ?? 'clear';
}

function every(e, key, interval, dt) {
  const t = (e[key] ?? Math.random() * interval) - dt;
  if (t <= 0) { e[key] = interval * (0.7 + Math.random() * 0.6); return true; }
  e[key] = t;
  return false;
}

export function update(dt, store, view) {
  if (!store || !view || dt <= 0) return;
  const tx0 = view.x / TILE, ty0 = view.y / TILE, tw = view.w / TILE, th = view.h / TILE;
  const cx = tx0 + tw / 2, cy = ty0 + th / 2;
  const realm = store.realm ?? {};
  const overworld = realm.kind === 'overworld' || !realm.kind;
  const clock = store.world?.clock;
  const night = clock?.phase === 'night' || clock?.phase === 'dusk';
  const biome = overworld ? biomeOf(Math.floor(cx / PLOT), Math.floor(cy / PLOT)) : null;
  const weather = overworld ? weatherHere(clock, biome) : 'clear';
  const started = store.myId != null;

  // ---------------------------------------------------------------- screen weather + biome motes
  if (started && overworld) {
    for (const [name, rate] of WEATHER_FX[weather] ?? []) emitRate(name, rate * (tw * th) / 600, dt, tx0 - 2, ty0 - 3, tw + 4, th + 2, store, null);
    for (const [name, rate, when] of BIOME_FX[biome] ?? []) {
      if ((when === 'night' && !night) || (when === 'day' && night)) continue;
      emitRate(name, rate * (tw * th) / 600, dt, tx0, ty0, tw, th, store, name === 'fireflies' || name === 'gem_sparkle' ? onLand : null);
    }
    emitRate('water_ripple', 3 * (tw * th) / 600, dt, tx0, ty0, tw, th, store, onWater);
  }

  // ---------------------------------------------------------------- entity-bound loops
  let bossNear = false;
  if (store.entities) {
    for (const e of store.entities.values()) {
      const ex = e.rx ?? e.x, ey = e.ry ?? e.y;
      if (ex < tx0 - 2 || ey < ty0 - 2 || ex > tx0 + tw + 2 || ey > ty0 + th + 3) continue;
      const ty = e.ty, k = e.k;
      if (ty === 'structure') {
        if (e.on) {
          if (k && (k.startsWith('kiln') || k === 'ember_boiler' || k === 'tempering_forge' || k === 'cookpot') && every(e, '_fxSmoke', 0.3, dt)) particles.emit('kiln_smoke', ex + (k === 'ember_boiler' ? 0.3 : 0.2), ey - (k.startsWith('kiln') ? 2.2 : 1.6), one);
          else if (k && (k.startsWith('autobench') || k === 'drill' || k === 'mint') && every(e, '_fxWork', 0.5, dt)) particles.emit('machine_work', ex, ey - 0.8);
          else if (k && k.startsWith('sluice') && every(e, '_fxFlow', 0.5, dt)) particles.emit('sluice_flow', ex - 0.4, ey, { dir: ((e.rot ?? 0) * Math.PI) / 2, count: 1 });
          else if (k && /^(tide_wheel|prism_array|rime_turbine|umbral_reactor|arc_spire)$/.test(k) && every(e, '_fxArc', 1.6, dt)) particles.emit('flux_arc', ex, ey - 1, one);
        }
        if (k === 'campfire' && every(e, '_fxSmoke', 0.5, dt)) particles.emit('kiln_smoke', ex, ey - 0.8, one);
        if (k && k.startsWith('beacon_') && every(e, '_fxBeacon', 0.2, dt)) particles.emit('_beacon_idle', ex, ey - 4, one);
      } else if (ty === 'node') {
        const cls = view.content?.nodes?.byId?.[k]?.cls;
        if (cls === 'gem' && every(e, '_fxGem', 0.4, dt)) particles.emit('gem_sparkle', ex, ey - 0.4, one);
        else if (cls === 'wood' && overworld && every(e, '_fxLeaf', 5, dt) && budgetScale('leaf_fall') > 0) particles.emit('leaf_fall', ex + (Math.random() - 0.5), ey - 1.4, one);
      } else if (ty === 'mob' || ty === 'boss') {
        if (ty === 'boss') bossNear = true;
        if (e.el && every(e, '_fxElite', 0.2, dt)) particles.emit('elite_aura', ex, ey - 0.4, one);
        const st = e.st | 0;
        if (st) {
          if (st & STATUS_BIT.burn && every(e, '_fxBurn', 0.1, dt)) particles.emit('burn', ex, ey - 0.4, one);
          if (st & (STATUS_BIT.chill | STATUS_BIT.freeze) && every(e, '_fxChill', 0.2, dt)) particles.emit('chill', ex, ey - 0.9, one);
          if (st & STATUS_BIT.bleed && every(e, '_fxBleed', 0.5, dt)) particles.emit('poison_bubble', ex, ey - 0.5, one);
        }
      } else if (ty === 'player' && e.isSelf && e._moving && overworld) {
        if (every(e, '_fxStep', 0.25, dt)) {
          const g = store.groundAt(Math.floor(ex), Math.floor(ey));
          if (g === T.HOARFROST || g === T.ICE) particles.emit('footstep_snow', ex, ey + 0.05);
          else if (g === T.EMBERREACH) particles.emit('footstep_ash', ex, ey + 0.05);
          else if (g === T.TIDAL || g === T.SHALLOW) particles.emit('footstep_splash', ex, ey + 0.05);
        }
      }
    }
  }

  // ---------------------------------------------------------------- audio (4 Hz)
  audio.setListener(cx, cy);
  audioT -= dt;
  if (audioT > 0) return;
  audioT = 0.25;
  let track;
  if (!started) track = 'title';
  else if (bossNear) track = realm.kind === 'trench' || realm.id?.startsWith?.('trench') ? 'moon' : 'boss';
  else if (!overworld) track = realm.kind === 'trench' || String(realm.id).startsWith('trench') ? 'trench' : 'vault';
  else if (store.world?.raid?.active) track = 'raid';
  else track = biome ?? 'greenmarrow';
  const wantNight = night && overworld && !bossNear;
  const key = track + (wantNight ? ':night' : '');
  if (key !== lastSent.track) { audio.music(track, { fade: 2, night: wantNight }); lastSent.track = key; }

  // surf level: share of water tiles sampled around the camera (rolling)
  if (overworld && store.groundAt) {
    let water = 0;
    for (let i = 0; i < 12; i++) {
      const a = (waterSample++ * 2.399) % 6.283, r = 3 + (i % 4) * 3;
      const g = store.groundAt(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r));
      if (g === T.DEEP || g === T.SHALLOW || (g === T.TIDAL && !clock?.low)) water++;
    }
    nearWater += (water / 12 - nearWater) * 0.5;
  } else nearWater *= 0.5;
  const beds = { surf: overworld ? Math.min(1, nearWater * 1.4) * (clock?.low ? 0.7 : 1) : 0, wind: 0, crackle: 0, rain: 0, storm: 0, fog: 0, heat: 0, eclipse: 0, cave: overworld ? 0 : 0.5 };
  const ba = BIOME_AMB[biome]; if (ba) beds[ba[0]] = Math.max(beds[ba[0]], ba[1]);
  const wa = WEATHER_AMB[weather]; if (wa) beds[wa[0]] = Math.max(beds[wa[0]], wa[1]);
  for (const id in beds) {
    const lv = Math.round(beds[id] * 20) / 20;
    if (lastSent.beds[id] !== lv) { audio.ambience(id, lv); lastSent.beds[id] = lv; }
  }
}

export const BIOME_IDS = BIOMES;
export default { update };
