// Clock (WP7): 24-minute day/night, 6-minute tide, per-biome weather rolled three steps ahead (the forecast is
// always true), king tides every third day, and the weather's gameplay effects (DESIGN 4.6, A.9).
//
// Publishes world.clock, sets overworld realm.lowTide, emits clock.phase / tide.change / weather.change.
// Services: timeInfo() (TECH_SPEC 5.5; optional (x, y) gives the weather of the biome at that tile),
// plus the extras weatherAt(x, y), weatherOf(biome), clockState().

import { PLOT, WORLD_PLOTS } from '../../../shared/config.js';
import { T, BIOMES, BIOME_TIER, biomeOf, plotOfTile, inPlotBounds, plotIndex, isWater } from '../../../shared/grid.js';
import { createRng, hashString, mix32 } from '../../../shared/rng.js';

export const DAY_LEN = 1440;
export const PHASES = Object.freeze([['dawn', 0, 120], ['day', 120, 840], ['dusk', 840, 960], ['night', 960, 1440]]);
export const TIDE = Object.freeze({ high: 240, low: 120, king: 240, turning: 10 });
export const KING_EVERY = 3;
export const NIGHT_ECLIPSE = 0.05;
export const LIGHTNING_EVERY = 8;
export const CHILL_AFTER = 40;
export const CHILL_DPS = 3;
const PUBLISH_EVERY = 5;
const HEAT_KINDS = new Set(['campfire', 'kiln', 'kiln_2', 'kiln_3', 'ember_boiler', 'lamp', 'tidestone', 'tempering_forge', 'umbral_reactor']);

export const phaseAt = (t) => {
  for (const [name, a, b] of PHASES) if (t >= a && t < b) return name;
  return 'night';
};
const absTime = (st) => (st.day - 1) * DAY_LEN + st.t;
const isNightAbs = (abs) => phaseAt(((abs % DAY_LEN) + DAY_LEN) % DAY_LEN) === 'night';
const dayOfAbs = (abs) => Math.floor(abs / DAY_LEN) + 1;

// ---------------------------------------------------------------- weather rolls (deterministic per biome + index)

function rollWeather(game, biome, n, atAbs) {
  const rng = createRng(mix32((game.world.seed ^ hashString('weather:' + biome)) + n * 0x9e3779b1));
  const b = game.content.biomes.byId[biome];
  const table = Object.entries(b?.weather ?? { clear: 1 }).map(([id, w]) => ({ id, w }));
  let id = rng.weighted(table, (e) => e.w)?.id ?? 'clear';
  const wdef = game.content.weather.byId[id];
  const [lo, hi] = wdef?.dur ?? [360, 600];
  const dur = rng.int(lo, hi);
  const eclipseChance = game.content.modules.biomes?.NIGHT_ECLIPSE_CHANCE ?? NIGHT_ECLIPSE;
  if ((BIOME_TIER[biome] ?? 1) <= 5 && isNightAbs(atAbs) && rng.chance(eclipseChance)) id = 'eclipse';
  return { id, dur, at: atAbs };
}

function initBiomeWeather(game, st, biome) {
  const first = rollWeather(game, biome, 0, absTime(st));
  const w = { cur: first, left: first.dur, n: 0, queue: [] };
  let at = first.at + first.dur;
  for (let i = 1; i <= 3; i++) { const r = rollWeather(game, biome, i, at); w.queue.push(r); at += r.dur; }
  w.n = 3;
  return w;
}

function advanceWeather(game, st, biome) {
  const w = st.weather[biome];
  w.cur = w.queue.shift();
  w.left = w.cur.dur;
  const last = w.queue[w.queue.length - 1] ?? w.cur;
  w.n += 1;
  w.queue.push(rollWeather(game, biome, w.n, last.at + last.dur));
}

// ---------------------------------------------------------------- state

const NEW_WORLD_T = 150;          // 30 s after dawn ends
const NEW_WORLD_CLEAR_S = 1440;   // the whole first in-game day (WP14 client note; BUILD_REVIEW P2-21)
const STATES = new WeakMap();   // game -> clock state (re-created by load)
const stOf = (game) => STATES.get(game);

function freshState(game) {
  const st = {
    t: 0, day: 1, phase: 'dawn',
    tide: { low: false, left: TIDE.high, king: false, kingDay: 0, lows: 0, turningSent: false },
    weather: {}, lightT: {}, publishT: 0, ring: [], strikeN: 0,
  };
  for (const b of BIOMES) st.weather[b] = initBiomeWeather(game, st, b);
  return st;
}

export function clockState(game) { return stOf(game); }
export function weatherOf(game, biome) { return stOf(game)?.weather[biome]?.cur?.id ?? 'clear'; }

export function biomeAtTile(x, y) {
  const { px, py } = plotOfTile(Math.floor(x), Math.floor(y));
  return inPlotBounds(px, py) ? biomeOf(px, py) : null;
}

function weatherAt(game, x, y) {
  const b = biomeAtTile(x, y);
  return b ? weatherOf(game, b) : 'clear';
}

function playerBiome(game, p) {
  const e = p?.entity;
  if (!e || e.realm !== 'overworld') return null;
  return biomeAtTile(e.x, e.y);
}

function timeInfo(game, x, y) {
  const S = stOf(game);
  const weather = Number.isFinite(x) && Number.isFinite(y) ? weatherAt(game, x, y) : weatherOf(game, 'greenmarrow');
  const biome = Number.isFinite(x) && Number.isFinite(y) ? (biomeAtTile(x, y) ?? 'greenmarrow') : 'greenmarrow';
  const w = S.weather[biome];
  return {
    day: S.day, t: S.t, phase: S.phase, isNight: S.phase === 'night', lowTide: S.tide.low,
    turning: S.tide.low && S.tide.left <= TIDE.turning, kingTide: S.tide.low && S.tide.king,
    weather, forecast: w ? w.queue.map((q) => q.id) : ['clear', 'clear', 'clear'],
    tideLeft: S.tide.left,
  };
}

// Next king tide: walk the tide schedule forward from now (first low tide of every third day).
export function nextKingTide(game) {
  const S = stOf(game);
  if (!S) return null;
  let abs = absTime(S), low = S.tide.low, left = S.tide.left, kingDay = S.tide.kingDay;
  if (low && S.tide.king) return { day: S.day, in: 0, now: true };
  for (let i = 0; i < 40; i++) {
    abs += left;
    low = !low;
    if (low) {
      const d = dayOfAbs(abs);
      if (d % KING_EVERY === 0 && kingDay !== d) return { day: d, in: Math.round(abs - absTime(S)) };
      left = TIDE.low;
    } else left = TIDE.high;
  }
  return null;
}

function publish(game) {
  const S = stOf(game);
  const home = S.weather.greenmarrow;
  const w = {}, fc = {};
  for (const b of BIOMES) {
    const x = S.weather[b];
    w[b] = [x.cur.id, Math.round(x.left)];
    fc[b] = x.queue.map((q) => [q.id, q.dur]);
  }
  game.sendWorld('clock', {
    day: S.day, t: Math.round(S.t * 10) / 10, phase: S.phase, len: DAY_LEN,
    tideT: Math.round((S.tide.low ? (S.tide.king ? TIDE.king : TIDE.low) - S.tide.left : TIDE.high - S.tide.left) * 10) / 10,
    low: S.tide.low, left: Math.round(S.tide.left * 10) / 10, king: S.tide.low && S.tide.king,
    turning: S.tide.low && S.tide.left <= TIDE.turning,
    weather: home.cur.id, nextWeather: home.queue[0]?.id ?? 'clear',
    w, fc, kingAt: nextKingTide(game),
  });
  S.publishT = 0;
}

// ---------------------------------------------------------------- tide

function overworld(game) { return game.realms.get('overworld'); }

// King tide second ring: shallow water touching an owned plot's tidal flats turns to flat for the king tide.
function exposeRing(game) {
  const S = stOf(game);
  const realm = overworld(game);
  const ring = [];
  for (const p of game.world.plots) {
    if (!p.owned) continue;
    const x0 = p.px * PLOT - 1, y0 = p.py * PLOT - 1;
    for (let y = y0; y < y0 + PLOT + 2; y++) {
      for (let x = x0; x < x0 + PLOT + 2; x++) {
        if (realm.groundAt(x, y) !== T.SHALLOW) continue;
        let touch = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (realm.groundAt(x + dx, y + dy) === T.TIDAL) { touch = true; break; }
        if (touch) ring.push([x, y, plotIndex(p.px, p.py)]);
      }
    }
  }
  for (const [x, y] of ring) realm.setGround(x, y, T.TIDAL, { persist: false });
  S.ring = ring;
}

function coverRing(game) {
  const S = stOf(game);
  const realm = overworld(game);
  for (const [x, y] of S.ring) {
    if (realm.groundAt(x, y) !== T.TIDAL) continue;
    const { px, py } = plotOfTile(x, y);
    if (inPlotBounds(px, py) && game.world.plots[plotIndex(px, py)].owned) continue;
    realm.setGround(x, y, T.SHALLOW, { persist: false });
  }
  S.ring = [];
}

export function kingRing(game) { return stOf(game)?.ring ?? []; }

function setTide(game, low) {
  const S = stOf(game);
  const realm = overworld(game);
  S.tide.low = low;
  S.tide.turningSent = false;
  if (low) {
    S.tide.lows += 1;
    const king = S.day % KING_EVERY === 0 && S.tide.kingDay !== S.day;
    S.tide.king = king;
    if (king) S.tide.kingDay = S.day;
    S.tide.left = king ? TIDE.king : TIDE.low;
    if (king) exposeRing(game);
  } else {
    if (S.tide.king) coverRing(game);
    S.tide.king = false;
    S.tide.left = TIDE.high;
  }
  if (realm) realm.lowTide = low;
  // feedback near each player (fx are sent in interest range only)
  for (const p of game.players.values()) {
    const e = p.entity;
    if (e?.realm === 'overworld') game.fx(realm, low ? 'tide_out' : 'tide_in', e.x, e.y, { king: S.tide.king ? 1 : 0 });
  }
  if (low) {
    const first = S.tide.lows === 1;
    game.toast(null, S.tide.king ? 'King tide! The sea has pulled far back for 4 minutes.' : first
      ? 'The sea has pulled back. Tidal flats are safe for 2 minutes.' : 'Low tide: the flats are exposed.', S.tide.king ? 'good' : 'info');
  }
  game.bus.emit('tide.change', { low, king: S.tide.king });
  publish(game);
}

// Players standing on a flat when the water returns are slowed and carried toward land (no damage).
const pushCache = new Map();
function nearestLand(realm, tx, ty) {
  const key = tx + ',' + ty;
  if (pushCache.has(key)) return pushCache.get(key);
  let best = null, bd = Infinity;
  for (let r = 1; r <= 6 && !best; r++) {
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        const g = realm.groundAt(x, y);
        if (isWater(g) || g === T.EMPTY || !realm.isWalkable(x, y)) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
    }
  }
  if (pushCache.size > 4096) pushCache.clear();
  pushCache.set(key, best);
  return best;
}

function carryOffFlats(game, dt) {
  const S = stOf(game);
  if (S.tide.low) return;
  const realm = overworld(game);
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e || e.realm !== 'overworld') continue;
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    const g = realm.groundAt(tx, ty);
    if (g !== T.TIDAL && g !== T.SHALLOW) continue;
    const to = nearestLand(realm, tx, ty);
    if (!to) continue;
    const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
    const v = 2.5 * dt;                            // 50% of base walking speed
    if (d < 0.05) continue;
    const k = Math.min(1, v / d);
    realm.move(e, e.x + dx * k, e.y + dy * k);
    e.vx = 0; e.vy = 0;
    if (game.tickCount % 6 === 0) game.fx(realm, 'footstep_splash', e.x, e.y);
  }
}

// ---------------------------------------------------------------- weather effects

function weatherMods(game, player) {
  const b = playerBiome(game, player);
  if (!b) return [];
  const def = game.content.weather.byId[weatherOf(game, b)];
  if (!def?.mods?.length) return [];
  const wb = player.lastWeatherBonus ?? 0;   // cached at 1 Hz (a source must not read the sheet it feeds)
  return def.mods.map((m) => ({ stat: m.stat, op: m.op, v: m.v >= 0 ? m.v * (1 + wb) : m.v * Math.max(0, 1 - wb) }));
}

function lightning(game, biome) {
  const S = stOf(game);
  const realm = overworld(game);
  const here = [...game.players.values()].filter((p) => playerBiome(game, p) === biome && p.entity);
  if (!here.length) return;
  const rng = game.rng;
  const p = rng.pick(here);
  const targets = realm.query(p.entity.x, p.entity.y, 12, [], (e) => (e.type === 'node' && !e.data?.tidal && e.kind !== 'gem_node') || e.type === 'mob');
  let x, y;
  if (targets.length) {
    const tgt = rng.pick(targets);
    x = tgt.x; y = tgt.y;
    // WP14 (client note): a strike splits the node but leaves no loot on the ground (storms piled up ~77 drops on the
    // start plot in 25 minutes); the node respawns as usual.
    if (tgt.type === 'node') game.call('hitNode', tgt, 1e6, { yieldMult: 2, ignoreTier: true, lightning: true, collect: true });
    else game.call('damage', tgt, 40 * (BIOME_TIER[biome] ?? 1) + 20, { element: 'storm' });
  } else {
    const a = rng.float(0, Math.PI * 2), r = rng.float(4, 10);
    x = p.entity.x + Math.cos(a) * r; y = p.entity.y + Math.sin(a) * r;
  }
  game.fx(realm, 'lightning_strike', x, y);
  S.strikeN = (S.strikeN + 1) % 1e6;
  game.sendWorld('strike', { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, n: S.strikeN });
}

function nearHeat(realm, x, y) {
  const list = realm.query(x, y, 4, [], (e) => e.type === 'structure' && HEAT_KINDS.has(e.kind));
  return list.length > 0;
}

function chill(game) {
  const realm = overworld(game);
  for (const p of game.players.values()) {
    const e = p.entity;
    const inBliz = e && playerBiome(game, p) === 'hoarfrost' && weatherOf(game, 'hoarfrost') === 'blizzard';
    const immune = inBliz && (game.stats.hasFlag(p, 'chill_immune') || game.stats.hasFlag(p, 'freeze_immune'));
    if (!inBliz || immune) {
      if (p.chill) { p.chill = 0; game.sendSelf(p, 'chill', null); }
      continue;
    }
    p.chill = nearHeat(realm, e.x, e.y) ? 0 : (p.chill || 0) + 1;
    if (p.chill > CHILL_AFTER) game.call('damage', e, CHILL_DPS, { element: 'frost', noProcs: true });
    game.sendSelf(p, 'chill', { v: p.chill, max: CHILL_AFTER, warm: p.chill === 0 });
  }
}

// ---------------------------------------------------------------- system

export default {
  name: 'clock',

  init(game) {
    STATES.set(game, freshState(game));
    game.services.register('timeInfo', (x, y) => timeInfo(game, x, y));
    game.services.register('weatherAt', (x, y) => weatherAt(game, x, y));
    game.services.register('weatherOf', (biome) => weatherOf(game, biome));
    game.services.register('clockState', () => stOf(game));
    game.stats.addSource('weather', (player) => weatherMods(game, player));
    const rainAt = (p) => { const b = playerBiome(game, p); return ['rain', 'storm'].includes(b ? weatherOf(game, b) : weatherOf(game, 'greenmarrow')); };
    game.stats.setCondition('rain', (g, p) => rainAt(p));
    game.stats.setCondition('shallows_or_rain', (g, p) => {
      if (rainAt(p)) return true;
      const e = p?.entity;
      if (!e) return false;
      const gr = g.realms.get(e.realm)?.groundAt(Math.floor(e.x), Math.floor(e.y));
      return gr === T.SHALLOW || gr === T.TIDAL;
    });
  },

  load(game, data) {
    const S = freshState(game);
    STATES.set(game, S);
    if (data && typeof data === 'object') {
      if (Number.isFinite(data.t)) S.t = Math.max(0, Math.min(DAY_LEN - 1e-3, data.t));
      if (Number.isInteger(data.day) && data.day >= 1) S.day = data.day;
      if (data.tide) Object.assign(S.tide, { low: !!data.tide.low, left: +data.tide.left || TIDE.high, king: !!data.tide.king, kingDay: data.tide.kingDay | 0, lows: data.tide.lows | 0 });
      for (const b of BIOMES) {
        const w = data.weather?.[b];
        if (w?.cur && Array.isArray(w.queue) && w.queue.length === 3) S.weather[b] = { cur: w.cur, left: +w.left || w.cur.dur, n: w.n | 0, queue: w.queue };
        else S.weather[b] = initBiomeWeather(game, S, b);
      }
    } else if (Number.isFinite(game.world.time) && (game.world.time > 0 || (game.playtimeS ?? 0) > 0)) {
      S.t = game.world.time; S.day = game.world.day || 1;
    } else {
      // WP14 (BUILD_REVIEW P2-21): a brand-new world opens in the morning with clear Greenmarrow skies for 4 minutes.
      S.t = NEW_WORLD_T;
      const w = S.weather.greenmarrow;
      if (w?.cur) { w.cur = { ...w.cur, id: 'clear', dur: Math.max(w.cur.dur ?? 0, NEW_WORLD_CLEAR_S) }; w.left = w.cur.dur; }
    }
    S.phase = phaseAt(S.t);
    const realm = overworld(game);
    if (realm) realm.lowTide = S.tide.low;
    if (S.tide.low && S.tide.king) exposeRing(game);
    game.world.time = S.t; game.world.day = S.day;
    publish(game);
  },

  save(game) {
    const S = stOf(game);
    if (!S) return undefined;
    const w = {};
    for (const b of BIOMES) { const x = S.weather[b]; w[b] = { cur: x.cur, left: Math.round(x.left * 10) / 10, n: x.n, queue: x.queue }; }
    return { t: Math.round(S.t * 100) / 100, day: S.day, tide: { low: S.tide.low, left: Math.round(S.tide.left * 100) / 100, king: S.tide.king, kingDay: S.tide.kingDay, lows: S.tide.lows }, weather: w };
  },

  tick(game, dt) {
    const S = stOf(game);
    if (!S) return;
    // day / phase
    S.t += dt;
    if (S.t >= DAY_LEN) { S.t -= DAY_LEN; S.day += 1; }
    const ph = phaseAt(S.t);
    if (ph !== S.phase) {
      S.phase = ph;
      game.bus.emit('clock.phase', { phase: ph, day: S.day });
      if (ph === 'night') game.toast(null, 'Night falls. Stay near the light.', 'info');
      publish(game);
    }
    game.world.time = S.t; game.world.day = S.day;

    // tide
    S.tide.left -= dt;
    if (S.tide.low && !S.tide.turningSent && S.tide.left <= TIDE.turning) {
      S.tide.turningSent = true;
      game.toast(null, 'Tide turning! Get off the flats.', 'warn');
      game.bus.emit('tide.turning', {});
      publish(game);
    }
    if (S.tide.left <= 0) setTide(game, !S.tide.low);
    carryOffFlats(game, dt);

    // weather
    for (const b of BIOMES) {
      const w = S.weather[b];
      w.left -= dt;
      if (w.left <= 0) {
        const prev = w.cur.id;
        advanceWeather(game, S, b);
        if (w.cur.id !== prev) {
          game.bus.emit('weather.change', { id: w.cur.id, biome: b, prev });
          game.stats.invalidateAll();
        }
        publish(game);
      }
    }

    S.publishT += dt;
    if (S.publishT >= PUBLISH_EVERY) publish(game);
  },

  slowTick(game) {
    const S = stOf(game);
    if (!S) return;
    // storms: a lightning strike every 8 s in each stormy biome somebody stands in
    for (const b of BIOMES) {
      if (weatherOf(game, b) !== 'storm') { S.lightT[b] = 0; continue; }
      S.lightT[b] = (S.lightT[b] || 0) + 1;
      if (S.lightT[b] >= LIGHTNING_EVERY) { S.lightT[b] = 0; lightning(game, b); }
    }
    chill(game);
    // weather stat mods follow the player between biomes
    for (const p of game.players.values()) {
      const b = playerBiome(game, p);
      const key = b ? b + ':' + weatherOf(game, b) : '-';
      const wb = game.stats.of(p).weatherBonus ?? 0;
      if (p.weatherKey !== key || p.lastWeatherBonus !== wb) { p.weatherKey = key; p.lastWeatherBonus = wb; game.stats.invalidate(p); }
    }
  },

  onJoin(game, player) {
    player.weatherKey = null;
    if (stOf(game)) publish(game);
  },
};

export { WORLD_PLOTS };
