// WP12 FX router: server `fx` event -> particles + sound + juice (TECH_SPEC 10.3).
// route(name, x, y, params) is called for every [name, x, y, params?] in an `fx` message (and may be called by
// client code). FX_MAP[name] = { particles, sfx, shake, hitstop, number, flash, slowmo, freeze } expands a name;
// a name that is only a particle preset emits it; unknown names fall back to a generic puff and never throw.
//
// params understood (all optional): dir (radians), angle (alias), color (palette char), scale, count,
//   target {x,y} | tx,ty (homing / chains), dmg | amount | n (floating number), crit (bool), style
//   ('dmg'|'crit'|'heal'|'xp'|'glint'|'miss'), text (floating text), pitch, vol, silent (no sound),
//   elem (element id: tints hits), blood ('green'|'teal'|'orange'|'violet'|'red'|'blue'), self (local player only juice).
// Particle budget: bursts are scaled down as the pool fills (BUDGET_SOFT .. BUDGET_HARD live particles) and
// cosmetic emits (isCosmetic) are dropped first. Decals: a particles decal hook draws sprite decals on the ground layer.

import * as particles from './particles.js';
import juice from './juice.js';
import audio from '../audio/audio.js';
import PRESETS from './presets.js';

export const BUDGET_SOFT = 2000;
export const BUDGET_HARD = 3500;

const S = (sfx, extra = {}) => ({ sfx, ...extra });

// name -> { particles?, sfx?, shake?, hitstop?, flash?, slowmo?, freeze? }  (particles defaults to the name itself)
export const FX_MAP = {
  // gathering
  hit_wood: S('tap_wood', { hitstop: 40, shake: 2 }), hit_stone: S('tap_stone', { hitstop: 40, shake: 2 }), hit_plant: S('tap_plant', { hitstop: 30 }),
  hit_ice: S('tap_ice', { hitstop: 40, shake: 2 }), hit_null: S('tap_null', { hitstop: 40, shake: 2 }), hit_clink: S('clink', { shake: 1 }),
  break_wood: S('break_wood', { shake: 3 }), break_stone: S('break_stone', { shake: 3 }), break_plant: S('break_plant', { shake: 1 }), break_crystal: S('break_crystal', { shake: 3 }),
  shrine_chime: S('ping', { noNumber: true, vol: 0.7 }), whoosh: S('whoosh'),
  gem_sparkle: S(null), drop_pop: S(null), pickup_trail: S(null), pickup_flash: S('pickup'), xp_mote: S(null),
  level_up: S('levelup', { slowmo: [0.3, 0.15], shake: 4 }), card_reveal: S('card_flip'), card_pick: S('card_pick'), skill_buy: S('skill_buy'),
  footstep_dust: S(null), footstep_splash: S('footstep_water'), footstep_snow: S('footstep_snow'), footstep_ash: S(null),
  dodge_trail: S('dodge'), swing_arc: S('swing'),
  // combat
  hit_flesh: S('hit_flesh', { hitstop: 40, shake: 2 }), hit_armor: S('hit_armor', { hitstop: 40, shake: 2 }), crit_spark: S('crit', { hitstop: 60, shake: 6 }),
  enemy_death: S('death', { shake: 2 }), elite_aura: S(null), elite_death: S('death', { shake: 4, hitstop: 60 }),
  burn: S(null), burn_explode: S('explode', { shake: 5, flash: ['y', 0.25, 0.08] }), chill: S(null), freeze_shatter: S('shatter', { shake: 3 }),
  spark_chain: S('zap'), lightning_strike: S('thunder', { shake: 8, flash: ['#', 0.6, 0.04] }), tide_wave: S('wave', { shake: 3 }),
  heal: S('heal'), shield_pop: S('shield'), poison_bubble: S(null), ability_cast: S('cast'),
  anchor_slam: S('slam', { shake: 7, hitstop: 60 }), gale_step: S('whoosh'), undertow: S('wave'), tidepool: S('water_pour'), overclock: S('zap'),
  seismic: S('slam', { shake: 6 }), motherlode: S('glint'), verdant_tide: S('heal', { shake: 2 }), summon_puff: S('summon'),
  boss_telegraph: S('telegraph'), boss_phase: S('boss_phase', { freeze: 300, shake: 8, flash: ['#', 0.6, 0.15] }), boss_death: S('boss_death', { shake: 10, slowmo: [0.35, 0.6], flash: ['#', 0.8, 0.3] }),
  // world
  plot_rise: S('plot_rise', { shake: 10 }), tide_out: S('tide_out'), tide_in: S('tide_in'), water_ripple: S(null), fish_splash: S('fish_catch'),
  rain: S(null), storm_rain: S(null), snow: S(null), blizzard: S(null), ashfall: S(null), fog_bank: S(null), heat_shimmer: S(null), eclipse_motes: S(null),
  fireflies: S(null), leaf_fall: S(null), kiln_smoke: S(null), craft_done: S('craft_done'), machine_work: S(null), sluice_flow: S(null), flux_arc: S('zap', { vol: 0.4 }),
  build_place: S('build_place', { shake: 2 }), build_remove: S('build_remove'), crop_grow: S('crop_pop'), water_pour: S('water_pour'), glint_burst: S('glint'),
  chest_open: S('chest_open', { shake: 2 }), beacon_light: S('beacon_light', { shake: 6, flash: ['E', 0.5, 0.3] }), gate_stage: S('beacon_light', { shake: 8, flash: ['#', 0.5, 0.3] }),
  waystone_warp: S('warp'), revive: S('revive'), death_poof: S('hurt', { shake: 4 }), quest_done: S('quest_done'), donate_confetti: S('donate'), ping: S('ping'),
  moon_shards: S('moonfall', { flash: ['J', 0.5, 0.5], shake: 6 }),
  // A.8 abilities, bosses, systems
  breakwater: S('shield'), rally_horn: S('raid_horn', { vol: 0.6 }), unmoored: S('slam', { shake: 5 }), crosscurrent: S('whoosh'), riptide_mark: S('cast'), tempest: S('whoosh', { shake: 4 }),
  brine_bolt: S('bolt'), kingwave: S('wave', { shake: 6 }), pocket_turret: S('summon'), magnet_coil: S('zap'), clockwork_legion: S('summon'), vein_sense: S('glint'),
  blast_charge: S('explode', { shake: 6, flash: ['y', 0.3, 0.08] }), thornlash: S('whoosh'), quickgrow: S('crop_pop'), sproutling: S('summon'),
  boss_thornmother: S('slam', { shake: 3 }), boss_regent: S('slam', { shake: 7 }), boss_kilnheart: S('burn', { shake: 3 }), boss_prismarch: S('zap'), boss_antler: S('freeze', { shake: 4 }),
  boss_choir: S('eclipse'), boss_moon: S('wave', { shake: 5 }), keeper_sporeking: S('poison'), keeper_bell: S('boss_roar', { shake: 5 }), keeper_bellows: S('burn'),
  keeper_lenses: S('zap'), keeper_knight: S('shatter', { shake: 8 }), keeper_scribe: S('eclipse'), raid_horn: S('raid_horn', { shake: 5, flash: ['x', 0.3, 0.2] }),
  tidebreak_wave: S('wave', { shake: 3 }), set_proc: S('glint'), temper_success: S('craft_done', { flash: ['#', 0.4, 0.1], shake: 3 }), temper_fail: S('deny'),
  mint_coin: S('glint', { vol: 0.5 }), gull_trail: S(null), tend_warning: S('flux_low', { vol: 0.5 }),

  // sound-only event names (server or content may send these)
  tap_wood: S('tap_wood', { particles: 'hit_wood' }), tap_stone: S('tap_stone', { particles: 'hit_stone' }), tap_plant: S('tap_plant', { particles: 'hit_plant' }),
  tap_ice: S('tap_ice', { particles: 'hit_ice' }), tap_null: S('tap_null', { particles: 'hit_null' }), clink: S('clink', { particles: 'hit_clink' }),
  ability_bulwark: S('ability_bulwark', { particles: 'ability_cast' }), ability_squallblade: S('ability_squallblade', { particles: 'ability_cast' }),
  ability_brinesinger: S('ability_brinesinger', { particles: 'ability_cast' }), ability_gearwright: S('ability_gearwright', { particles: 'ability_cast' }),
  ability_prospector: S('ability_prospector', { particles: 'ability_cast' }), ability_greenwarden: S('ability_greenwarden', { particles: 'ability_cast' }),
  pickup: S('pickup', { particles: 'pickup_flash' }), pickup_rare: S('pickup_rare', { particles: 'gem_sparkle' }),
  hurt: S('hurt', { shake: 3, particles: 'hit_flesh' }), death: S('death', { particles: 'death_poof' }), crit: S('crit', { particles: 'crit_spark', hitstop: 60, shake: 6 }),
  levelup: S('levelup', { particles: 'level_up', slowmo: [0.3, 0.15] }), thunder: S('thunder', { particles: 'lightning_strike', shake: 8 }),
  turret_shot: S('turret_shot', { particles: 'machine_work' }), fish_bite: S('fish_bite', { particles: 'water_ripple' }), fish_cast: S('fish_cast', { particles: 'water_ripple' }),
  boss_roar: S('boss_roar', { shake: 6 }), warp: S('warp', { particles: 'waystone_warp' }), eclipse: S('eclipse', { particles: 'eclipse_motes' }), moonfall: S('moonfall', { particles: 'moon_shards' }),
  deny: S('deny', { particles: null }),
};
for (const name of Object.keys(FX_MAP)) if (!('particles' in FX_MAP[name])) FX_MAP[name].particles = name in PRESETS ? name : null;

// Blood / element tints (palette char picked from the preset's colour list when present).
const BLOOD = { green: 'i', teal: 'n', orange: 'x', violet: 'I', red: 'w', blue: 'u' };
const ELEM_COLOR = { ember: 'y', frost: 'O', storm: 'E', tide: 'u', hollow: 'J', none: '#' };

// Purely cosmetic presets (dropped first when over budget).
const COSMETIC = new Set(['footstep_dust', 'footstep_ash', 'footstep_snow', 'footstep_splash', 'leaf_fall', 'fireflies', 'water_ripple', 'kiln_smoke', 'gem_sparkle',
  'machine_work', 'sluice_flow', 'pickup_trail', 'gull_trail', 'elite_aura', 'burn', 'chill', 'rain', 'storm_rain', 'snow', 'blizzard', 'ashfall', 'fog_bank',
  'heat_shimmer', 'eclipse_motes', 'boss_telegraph', 'poison_bubble']);
export const isCosmetic = (name) => COSMETIC.has(name);

// Scale factor for a burst given the live particle count (1 = full).
export function budgetScale(name) {
  const live = particles.liveCount();
  if (live < BUDGET_SOFT) return 1;
  if (COSMETIC.has(name)) return live > BUDGET_SOFT * 1.2 ? 0 : 0.4;
  if (live >= BUDGET_HARD) return 0.15;
  return 1 - 0.85 * ((live - BUDGET_SOFT) / (BUDGET_HARD - BUDGET_SOFT));
}

// ------------------------------------------------------------------ UI-anchored presets

const view = () => globalThis.__tb?.renderer?.view ?? null;
// World point for a UI anchor: xp bar (bottom-centre), glint counter (top-right), deck icon (top-left).
const UI_ANCHOR = { 'ui:xp': [0.5, 0.97], 'ui:glint': [0.9, 0.04], 'ui:deck': [0.06, 0.06] };
function uiTarget(to) {
  const v = view(), a = UI_ANCHOR[to];
  if (!v || !a) return null;
  return { x: (v.x + v.w * a[0]) / 16, y: (v.y + v.h * a[1]) / 16 };
}
// Convert a world position (tiles) to the UI layer's coordinate frame (screen px / 16).
function worldToUi(x, y) {
  const tb = globalThis.__tb, v = view();
  const zoom = tb?.camera?.zoom ?? 1;
  if (!v) return [x, y];
  return [((x * 16 - v.x) * zoom) / 16, ((y * 16 - v.y) * zoom) / 16];
}

const tmpOpts = {};
function emitPreset(name, x, y, params) {
  const p = PRESETS[name];
  if (!p && !particles.has(name)) { particles.emit('__generic', x, y); return; }
  // particle budget times the player's density setting (store.settings.particleDensity: 0.35 / 0.65 / 1)
  const density = globalThis.__tb?.store?.settings?.particleDensity ?? 1;
  const k = budgetScale(name) * (Number.isFinite(density) ? Math.max(0.1, Math.min(1, density)) : 1);
  if (k <= 0) return;
  for (const key of Object.keys(tmpOpts)) delete tmpOpts[key];
  if (params) {
    const dir = params.dir ?? params.angle;
    if (dir != null) tmpOpts.dir = dir;
    if (params.scale) tmpOpts.scale = params.scale;
    const color = params.color ?? (params.blood ? BLOOD[params.blood] : params.elem ? ELEM_COLOR[params.elem] : null);
    if (color && p?.colors?.includes(color)) tmpOpts.color = color;
    if (params.target) tmpOpts.target = params.target;
    else if (params.tx != null) tmpOpts.target = { x: params.tx, y: params.ty };
  }
  if (!tmpOpts.target) tmpOpts.target = p?.seek?.to?.startsWith('ui:') ? uiTarget(p.seek.to) : { x, y };
  if (!tmpOpts.target) delete tmpOpts.target;
  // Note: particles.emit passes opts on to sub presets, so a count is only forced when asked for or over budget.
  let n = params?.count;
  if (n == null && p && k < 1) { const c = Array.isArray(p.count) ? p.count : [p.count ?? 1, p.count ?? 1]; n = Math.round(c[0] + Math.random() * (c[1] - c[0])); }
  if (n != null) tmpOpts.count = Math.max(1, Math.round(n * k));
  if (p?.layer === 'ui') [x, y] = worldToUi(x, y);
  particles.emit(name, x, y, tmpOpts);
}

// ------------------------------------------------------------------ route

export function route(name, x, y, params) {
  try {
    const m = FX_MAP[name];
    const pname = m ? m.particles : name;
    if (pname) emitPreset(pname, x, y, params);
    else if (!m) emitPreset(name, x, y, params);
    // sound
    const sfx = m ? m.sfx : name;
    if (sfx && !params?.silent) audio.play(sfx, { x, y, pitch: params?.pitch, vol: params?.vol ?? m?.vol });
    // juice
    if (m) {
      if (m.shake) juice.shake(m.shake * (params?.crit ? 1.5 : 1), 0.2);
      if (m.hitstop && (params?.self ?? true)) juice.hitstop(m.hitstop);
      if (m.freeze) juice.hitstop(m.freeze);
      if (m.flash) juice.flash(m.flash[0], m.flash[1], m.flash[2]);
      if (m.slowmo) juice.slowmo(m.slowmo[0], m.slowmo[1]);
    }
    // floating numbers / text
    if (params && !m?.noNumber) {
      const val = params.dmg ?? params.amount ?? params.n;
      if (val != null || params.text) {
        const style = params.style ?? (params.crit ? 'crit' : 'dmg');
        juice.number(x, y, params.text ?? Math.round(val), style);
        if (params.crit && name !== 'crit_spark') { emitPreset('crit_spark', x, y - 0.3, null); juice.shake(6, 0.2); }
      }
    }
  } catch (err) {
    if (!route.warned) { route.warned = true; console.warn('[tb:fx] route failed', name, err); }
  }
}

// ------------------------------------------------------------------ decals
// juice.js only registers shake/flash hooks; decals are drawn as long-lived ground-layer sprite particles
// (one lazily defined preset per decal sprite), so they sit under entities and fade out on their own.

const decalPresets = new Set();
export function addDecal(sprite, x, y, life = 5) {
  if (!sprite) return;
  const name = '_decal:' + sprite + ':' + life;
  if (!decalPresets.has(name)) {
    particles.define(name, { count: [1, 1], life: [life, life], speed: [0, 0], size: [1, 1], colors: ['#'], shape: 'sprite', sprite, layer: 'ground' });
    decalPresets.add(name);
  }
  if (particles.liveCount() < BUDGET_HARD) particles.emit(name, x, y);
}
particles.setHooks({ decal: (sprite, x, y) => addDecal(sprite, x, y, sprite === 'decor.footprint_snow' ? 4 : 6) });

export default { route, FX_MAP, budgetScale, isCosmetic, addDecal };
