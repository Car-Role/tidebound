// WP12 tests: particle presets, FX routing, SFX table, music tracks, ambient director (headless, no WebAudio).

import { ok, eq } from './assert.js';
import { content } from '../shared/data/index.js';
import { PAL } from '../client/art/palette.js';
import PRESETS from '../client/fx/presets.js';
import * as particles from '../client/fx/particles.js';
import router, { FX_MAP, budgetScale, BUDGET_HARD } from '../client/fx/router.js';
import ambient from '../client/fx/ambient.js';
import SFX, { REQUIRED_SFX } from '../client/audio/sfx.js';
import TRACKS from '../client/audio/tracks.js';
import { buildMelody, resolveTrack, midiOfDegree } from '../client/audio/music.js';
import audio from '../client/audio/audio.js';
import { ambienceId, BED_IDS } from '../client/audio/ambience.js';
import sprites from '../client/art/sprites/index.js';

const SHAPES = ['px', 'circle', 'ring', 'spark', 'shard', 'leaf', 'star', 'plus', 'glyph', 'streak', 'sprite'];
const LAYERS = ['ground', 'world', 'overlay', 'ui'];
const WAVES = ['sine', 'square', 'triangle', 'saw', 'noise'];
const FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf', 'allpass'];
const isColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) || (c in PAL && PAL[c]);
const pair = (v) => Array.isArray(v) ? v : [v, v];

function presetErrors(name, p) {
  const e = [];
  const [c0, c1] = pair(p.count ?? 1);
  if (!(c0 >= 0 && c1 >= c0 && c1 <= 400)) e.push('count');
  const [l0, l1] = pair(p.life ?? 0.5);
  if (!(l0 > 0 && l1 >= l0 && l1 <= 12)) e.push('life');
  const [s0, s1] = pair(p.speed ?? 0);
  if (!(s0 >= 0 && s1 >= s0 && s1 <= 60)) e.push('speed');
  if (!Array.isArray(p.colors) || !p.colors.length || !p.colors.every(isColor)) e.push('colors');
  if (p.shape && !SHAPES.includes(p.shape)) e.push('shape');
  if (p.layer && !LAYERS.includes(p.layer)) e.push('layer');
  if (p.blend && !['normal', 'add'].includes(p.blend)) e.push('blend');
  if (p.shape === 'sprite' && !sprites[p.sprite]) e.push('sprite ' + p.sprite);
  if (p.decal && !sprites[p.decal]) e.push('decal ' + p.decal);
  if (p.flash && !isColor(p.flash)) e.push('flash');
  for (const s of p.sub ?? []) if (!PRESETS[s.preset] || !['spawn', 'death'].includes(s.at)) e.push('sub ' + s.preset);
  if (p.seek && !['target', 'ui:xp', 'ui:glint', 'ui:deck'].includes(p.seek.to)) e.push('seek');
  return e.map((x) => `${name}: ${x}`);
}
function sfxErrors(name, d) {
  const e = [];
  if (!Array.isArray(d.layers) || !d.layers.length) return [name + ': layers'];
  for (const L of d.layers) {
    if (!WAVES.includes(L.wave)) e.push('wave');
    if (!(L.dur > 0 && L.dur <= 4)) e.push('dur');
    if (!(Array.isArray(L.env) && L.env.length === 4 && L.env.every((v) => v >= 0))) e.push('env');
    if (!(L.vol > 0 && L.vol <= 1)) e.push('vol');
    if (L.wave !== 'noise' && !(L.freq?.[0] > 0 && L.freq?.[1] > 0)) e.push('freq');
    if (L.wave === 'noise' && !L.filter) e.push('noise needs filter');
    if (L.filter && (!FILTERS.includes(L.filter.type) || !(L.filter.f > 0))) e.push('filter');
  }
  if (!(d.pitchVar >= 0 && d.pitchVar <= 0.3)) e.push('pitchVar');
  return e.map((x) => `${name}: ${x}`);
}
const soundOk = (s) => s === null || s === undefined || !!SFX[s];
const fxOk = (n) => !!PRESETS[n] || !!FX_MAP[n];

export default async function (t) {
  t.test('all 126 DESIGN preset names exist', () => {
    const names = content.registries.FX_PRESETS;
    eq(names.length, 126);
    eq(names.filter((n) => !PRESETS[n]), []);
  });

  t.test('every preset (including helpers) validates', () => {
    const errs = Object.entries(PRESETS).flatMap(([n, p]) => presetErrors(n, p));
    eq(errs.slice(0, 10), []);
  });

  t.test('presets register with the particle engine and emit without errors', () => {
    for (const [n, p] of Object.entries(PRESETS)) particles.define(n, p);
    particles.clear();
    for (const n of content.registries.FX_PRESETS) particles.emit(n, 10, 10, { dir: 0.5, target: { x: 12, y: 8 } });
    ok(particles.liveCount() > 500, 'live ' + particles.liveCount());
    for (let i = 0; i < 30; i++) particles.update(1 / 30);
    particles.clear();
  });

  t.test('all required SFX exist and every SFX validates', () => {
    eq(REQUIRED_SFX.filter((n) => !SFX[n]), []);
    eq(Object.entries(SFX).flatMap(([n, d]) => sfxErrors(n, d)).slice(0, 10), []);
    ok(Object.keys(SFX).length >= 86, 'sfx count');
  });

  t.test('FX_MAP references existing presets and sounds', () => {
    const bad = [];
    for (const [n, m] of Object.entries(FX_MAP)) {
      if (m.particles && !PRESETS[m.particles]) bad.push(n + ' particles ' + m.particles);
      if (!soundOk(m.sfx)) bad.push(n + ' sfx ' + m.sfx);
    }
    eq(bad, []);
    for (const n of content.registries.FX_PRESETS) ok(FX_MAP[n], 'FX_MAP has ' + n);
  });

  t.test('every fx / sfx name referenced by content resolves', () => {
    const fx = new Set(), sfx = new Set();
    for (const n of content.nodes) { if (n.fx?.hit) fx.add(n.fx.hit); if (n.fx?.brk) fx.add(n.fx.brk); if (n.sfx) sfx.add(n.sfx); }
    for (const a of content.abilities) { if (a.fx) fx.add(a.fx); if (a.sfx) sfx.add(a.sfx); }
    for (const b of content.bosses) if (b.fx) fx.add(b.fx);
    for (const e of content.enemies) if (e.fxHit) fx.add(e.fxHit);
    for (const w of content.weather) { if (w.fx) fx.add(w.fx); if (w.sfx) sfx.add(w.sfx); }
    eq([...fx].filter((n) => !fxOk(n)), [], 'fx');
    eq([...sfx].filter((n) => !SFX[n]), [], 'sfx');
  });

  t.test('router never throws, handles numbers and unknown names, enforces the budget', () => {
    particles.clear();
    router.route('definitely_not_a_preset', 5, 5);
    router.route('hit_flesh', 5, 5, { dir: 1, dmg: 42, crit: true, blood: 'teal' });
    router.route('xp_mote', 5, 5, { count: 3 });
    for (const n of Object.keys(FX_MAP)) router.route(n, 5, 5, { dir: 0 });
    ok(particles.liveCount() > 0, 'emitted');
    for (let i = 0; i < 40; i++) particles.emit('plot_rise', 5, 5);
    ok(particles.liveCount() >= BUDGET_HARD, 'filled');
    eq(budgetScale('footstep_dust'), 0, 'cosmetic dropped first');
    ok(budgetScale('hit_wood') < 0.5, 'bursts scaled');
    particles.clear();
    eq(budgetScale('hit_wood'), 1);
  });

  t.test('all music tracks validate, generate A A\' B A melodies and night variants', () => {
    const ids = [...content.registries.MUSIC_IDS, 'raid'];
    eq(ids.filter((id) => !TRACKS[id]), []);
    for (const id of ids) {
      const tr = TRACKS[id];
      ok(tr.bpm >= 60 && tr.bpm <= 160, id + ' bpm');
      ok(Array.isArray(tr.scale) && tr.scale.length >= 5 && tr.scale[0] === 0, id + ' scale');
      for (const [k, ch] of Object.entries(tr.channels)) ok(['bass', 'lead', 'pad', 'drums', 'arp'].includes(k), id + ' channel ' + k);
      ok(tr.channels.bass.pattern.length === 16, id + ' bass pattern');
      const mel = buildMelody(tr, 0);
      ok(mel.length >= 8, id + ' melody notes ' + mel.length);
      const lead = tr.channels.lead;
      for (const n of mel) { const m = midiOfDegree(tr, n.deg); ok(m >= lead.range[0] - 3 && m <= lead.range[1] + 3, `${id} note ${m}`); ok(n.step >= 0 && n.step < 128, id + ' step'); }
      const A = mel.filter((n) => n.step < 32).map((n) => n.step + ':' + n.deg).join(), A4 = mel.filter((n) => n.step >= 96).map((n) => (n.step - 96) + ':' + n.deg).join();
      eq(A4, A, id + ' motif A returns');
      const m1 = buildMelody(tr, 1);
      ok(JSON.stringify(m1) !== JSON.stringify(mel) || id === 'trench', id + ' cycles vary');
      if (tr.night && tr.night.bpm) ok(resolveTrack(tr, true).bpm < tr.bpm, id + ' night slower');
    }
    eq(TRACKS.boss.channels.arp ? 1 : 0, 1, 'boss has the fifth (arp) channel');
  });

  t.test('audio API is a safe no-op before unlock (Node)', () => {
    audio.play('pickup', { x: 1, y: 1 });
    audio.music('greenmarrow', { fade: 1 });
    audio.ambience('surf', 0.5);
    audio.setVolume('music', 0.4);
    eq(audio.getVolume('music'), 0.4);
    audio.pickupCombo(); audio.setListener(3, 4); audio.stopAll();
    ok(audio.has('levelup') && !audio.has('nope'));
    eq(ambienceId('amb_rain'), 'rain');
    ok(BED_IDS.includes('surf') && BED_IDS.includes('wind') && BED_IDS.includes('crackle'));
  });

  t.test('ambient director runs headless and emits biome / weather particles', () => {
    particles.clear();
    const ents = new Map([
      [1, { i: 1, ty: 'structure', k: 'kiln', on: 1, x: 300, y: 300 }],
      [2, { i: 2, ty: 'mob', k: 'mossback', el: 'swift', st: 1, x: 301, y: 301 }],
      [3, { i: 3, ty: 'node', k: 'gem_node', x: 302, y: 300 }],
    ]);
    const store = {
      myId: 9, realm: { id: 'overworld', kind: 'overworld' }, entities: ents,
      world: { clock: { phase: 'night', weather: 'rain', w: { greenmarrow: ['storm', 100] }, low: false } },
      groundAt: () => T_GREEN,
    };
    const view = { x: 290 * 16, y: 290 * 16, w: 480, h: 270, time: 0, content };
    for (let i = 0; i < 60; i++) ambient.update(1 / 30, store, view);
    ok(particles.liveCount() > 20, 'ambient particles ' + particles.liveCount());
    particles.clear();
  });
}
const T_GREEN = 4;
