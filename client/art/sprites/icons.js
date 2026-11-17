// WP3 icons (16x16, anchor top-left [0,0] so UI code can draw at slot corners):
//   icon.ability.<id>  icon.card.<id>  icon.tag.<tag>  icon.skill.<id>  icon.branch.<branch>  icon.status.<id>
//   icon.buff.<id>     icon.element.<id>  icon.class.<id>  icon.weather.<id>  icon.rarity.<id>  icon.blessing.<id>
//   icon.rebirth.<id>  icon.archive.<wing>  icon.ui.<name>  (ui: glint, heart, surge, xp, flux, gear, map, journal,
//   deck, skills, inventory, build, close, check, lock, arrow_l/r/u/d, plus, minus, star, trash, sort, quest,
//   turnin, ping_need/danger/look/omw, chat, party, settings, warning, clock, tide_low, tide_high, sun, moon, info)
// Each icon is a framed badge (frame colour = class / tag / branch / rarity) with a pictogram from a shared glyph set.

import { Px, R, INK, done, band } from '../gen/paint.js';
import ABILITIES from '../../../shared/data/abilities.js';
import CARDS from '../../../shared/data/cards.js';
import SKILLS from '../../../shared/data/skills.js';
import BLESSINGS from '../../../shared/data/blessings.js';
import REBIRTH from '../../../shared/data/rebirth.js';
import ARCHIVE from '../../../shared/data/archive.js';
import CLASSES from '../../../shared/data/classes.js';
import ITEMS from '../../../shared/data/items.js';
import * as REG from '../../../shared/data/registries.js';

const W = '#';

// ------------------------------------------------------------------ glyphs (drawn in the 4..12 area)

const G = {
  sword: (p, c) => { p.line(4, 12, 11, 5, c[4], 1); p.line(5, 12, 12, 5, c[2]); p.set(12, 4, W); p.line(3, 9, 7, 13, R.gold[3]); p.set(3, 13, R.brown[2]); },
  shield: (p, c) => { p.poly([[4, 3], [12, 3], [12, 8], [8, 13], [4, 8]], c[3]); p.poly([[4, 3], [8, 3], [8, 13], [4, 8]], c[4]); p.vline(8, 4, 11, c[1]); },
  wave: (p, c) => { p.path([[3, 9], [5, 6], [8, 6], [9, 8], [7, 9]], c[4]); p.path([[3, 12], [6, 10], [9, 11], [12, 9], [13, 7]], c[3]); p.set(5, 6, W); },
  flame: (p, c) => { p.poly([[8, 2], [12, 9], [10, 13], [6, 13], [4, 9], [6, 6]], R.ember[3]); p.poly([[8, 7], [10, 11], [8, 13], [6, 11]], R.gold[4]); },
  flake: (p) => { for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) p.line(8 - dx * 5, 8 - dy * 5, 8 + dx * 5, 8 + dy * 5, R.ice[4]); p.set(8, 8, W); },
  bolt: (p) => { p.poly([[9, 2], [4, 9], [8, 9], [6, 14], [12, 6], [8, 6]], R.gold[4]); p.line(9, 2, 5, 9, W); },
  leaf: (p, c) => { p.poly([[3, 13], [5, 6], [12, 3], [11, 10]], R.grass[3]); p.line(4, 12, 11, 4, R.grass[1]); p.set(6, 6, R.grass[4]); },
  gear: (p, c) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.rect(Math.round(8 + Math.cos(a) * 4.6) - 1, Math.round(8 + Math.sin(a) * 4.6) - 1, 2, 2, c[3]); } p.ball(8, 8, 4, 4, c); p.ellipse(8, 8, 1.5, 1.5, INK); },
  coin: (p) => { p.ball(8, 8, 4.5, 4.5, R.gold, { spec: W }); p.ellipse(8, 8, 2.6, 2.6, R.gold[2]); p.vline(8, 6, 10, R.gold[4]); },
  fang: (p) => { p.poly([[4, 3], [8, 4], [12, 3], [10, 8], [8, 14], [6, 8]], W); p.line(8, 5, 8, 12, R.ice[3]); },
  heart: (p) => { p.ball(6, 6, 2.6, 2.6, R.ember); p.ball(10, 6, 2.6, 2.6, R.ember); p.poly([[3, 7], [13, 7], [8, 13]], R.ember[2]); p.set(5, 5, W); },
  star: (p, c) => { p.poly([[8, 2], [10, 6], [14, 7], [11, 10], [12, 14], [8, 12], [4, 14], [5, 10], [2, 7], [6, 6]], R.gold[4]); p.set(7, 6, W); },
  eye: (p, c) => { p.ellipse(8, 8, 5.5, 3.5, W); p.ball(8, 8, 2.5, 2.5, c); p.set(8, 8, INK); },
  boot: (p, c) => { p.rect(5, 3, 4, 7, R.brown[3]); p.rect(5, 9, 7, 4, R.brown[3]); p.hline(5, 11, 12, R.brown[1]); p.line(2, 6, 4, 6, W); p.line(1, 9, 4, 9, W); },
  pick: (p) => { p.line(4, 13, 11, 6, R.brown[3]); p.path([[6, 4], [9, 3], [12, 4], [13, 7]], R.stone[4], 2); },
  clock: (p, c) => { p.ball(8, 8, 5, 5, R.ice, { spec: W }); p.line(8, 8, 8, 5, INK); p.line(8, 8, 10, 9, INK); },
  bag: (p) => { p.ball(8, 10, 4.5, 3.8, R.brown); p.rect(6, 4, 4, 3, R.brown[2]); p.hline(5, 10, 6, R.gold[3]); },
  potion: (p, c) => { p.ball(8, 10, 4, 3.6, c, { spec: W }); p.rect(7, 3, 3, 4, R.ice[3]); p.rect(7, 2, 3, 1, R.brown[2]); },
  moon: (p) => { p.ellipse(8, 8, 5, 5, R.ice[4]); p.cut(10, 6, 4, 4); },
  sun: (p) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.line(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, R.gold[3]); } p.ball(8, 8, 3.4, 3.4, R.gold, { spec: W }); },
  cloud: (p) => { p.ball(6, 8, 3, 2.6, R.ice); p.ball(10, 7, 3.4, 3, R.ice); p.rect(4, 9, 9, 2, R.ice[3]); },
  rain: (p) => { G.cloud(p); for (const x of [5, 8, 11]) p.line(x, 12, x - 1, 14, R.sea[4]); },
  drop: (p, c) => { p.poly([[8, 2], [12, 9], [8, 13], [4, 9]], c[3]); p.ball(8, 10, 3.5, 3.2, c, { spec: W }); },
  skull: (p) => { p.ball(8, 7, 4.5, 4.2, R.stone, { spec: W }); p.rect(6, 11, 5, 2, R.stone[3]); p.set(6, 7, INK); p.set(10, 7, INK); p.set(8, 9, INK); },
  chain: (p) => { for (let k = 0; k < 3; k++) { p.ellipse(4 + k * 4, 12 - k * 4, 2.2, 1.6, R.stone[3]); p.cut(4 + k * 4, 12 - k * 4, 1, 0.6); } },
  lock: (p) => { p.ellipse(8, 6, 3, 3, R.stone[3]); p.cut(8, 6, 1.6, 1.6); p.rect(4, 7, 9, 6, R.gold[3]); p.set(8, 9, INK); p.set(8, 10, INK); },
  cross: (p, c) => { p.rect(7, 3, 3, 10, c[4]); p.rect(3, 7, 11, 3, c[4]); p.set(7, 3, W); },
  minus: (p, c) => { p.rect(3, 7, 11, 3, c[4]); },
  x: (p) => { p.line(4, 4, 12, 12, R.ember[4], 2); p.line(12, 4, 4, 12, R.ember[4], 2); },
  check: (p) => { p.path([[3, 8], [6, 11], [13, 4]], R.grass[4], 2); },
  arrow: (p, c) => { p.poly([[3, 6], [9, 6], [9, 3], [13, 8], [9, 13], [9, 10], [3, 10]], c[4]); },
  ore: (p) => { p.ball(8, 9, 5, 4, R.stone); p.rect(6, 7, 2, 2, R.ember[4]); p.rect(9, 9, 2, 2, R.gold[4]); },
  tree: (p) => { p.ball(8, 6, 4.5, 4, R.grass); p.rect(7, 9, 2, 5, R.brown[2]); },
  fish: (p) => { p.ellipse(9, 8, 4, 2.6, R.sea[3]); p.poly([[5, 8], [2, 5], [2, 11]], R.sea[2]); p.set(11, 7, INK); },
  hammer: (p) => { p.line(4, 13, 10, 7, R.brown[3], 2); p.rect(8, 3, 6, 4, R.stone[3]); p.hline(8, 13, 3, R.stone[4]); },
  sprout: (p) => { p.rect(4, 12, 9, 2, R.brown[2]); p.vline(8, 6, 12, R.grass[2]); p.ellipse(6, 6, 2.2, 1.4, R.grass[3]); p.ellipse(10, 5, 2.2, 1.4, R.grass[4]); },
  magnet: (p) => { p.path([[4, 4], [4, 9], [6, 12], [10, 12], [12, 9], [12, 4]], R.ember[3], 3); p.rect(3, 3, 3, 2, R.stone[4]); p.rect(11, 3, 3, 2, R.stone[4]); },
  anchor: (p) => { p.vline(8, 3, 12, R.stone[4]); p.hline(5, 11, 5, R.stone[4]); p.ellipse(8, 2.5, 1.4, 1.4, R.stone[3]); p.path([[3, 9], [5, 12], [8, 13], [11, 12], [13, 9]], R.stone[3]); },
  horn: (p) => { p.path([[3, 11], [7, 11], [11, 8], [13, 4]], R.gold[3], 3); p.ellipse(13, 4, 1.5, 2.2, R.gold[1]); },
  crosshair: (p, c) => { p.ellipse(8, 8, 5, 5, c[4]); p.ellipse(8, 8, 4, 4, '.'); p.cut(8, 8, 4, 4); p.hline(2, 14, 8, c[4]); p.vline(8, 2, 14, c[4]); p.set(8, 8, R.ember[4]); },
  spiral: (p, c) => { for (let k = 0; k < 40; k++) { const a = k * 0.35, r = 0.3 + k * 0.13; p.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, c[4 - (k % 2)]); } },
  rings: (p, c) => { for (const r of [2, 4, 6]) for (let a = 0; a < 40; a++) p.set(8 + Math.cos(a / 6.4) * r, 9 + Math.sin(a / 6.4) * r * 0.6, c[r === 2 ? 4 : 3]); },
  slash: (p) => { for (let k = 0; k < 3; k++) p.line(3 + k * 3, 13, 9 + k * 3, 3, W); },
  wind: (p, c) => { p.path([[2, 6], [10, 6], [12, 4], [10, 3]], c[4]); p.path([[3, 10], [12, 10], [14, 12], [12, 13]], c[3]); },
  turret: (p) => { p.rect(4, 10, 8, 4, R.stone[2]); p.rect(5, 6, 6, 4, R.gold[3]); p.rect(10, 7, 4, 2, R.stone[4]); },
  bomb: (p) => { p.ball(7, 10, 4, 4, R.ink, { spec: R.stone[4] }); p.path([[9, 6], [11, 3], [13, 3]], R.brown[3]); p.set(14, 2, R.gold[4]); },
  gem: (p, c) => { p.poly([[4, 6], [6, 3], [10, 3], [12, 6], [8, 13]], c[3]); p.poly([[4, 6], [8, 13], [8, 6]], c[4]); p.set(6, 4, W); },
  crack: (p) => { p.path([[2, 12], [5, 9], [7, 11], [10, 6], [14, 4]], R.ember[4], 2); p.rect(3, 13, 11, 1, R.stone[3]); },
  whip: (p) => { p.path([[3, 13], [6, 8], [10, 6], [13, 3]], R.grass[3], 2); for (const [x, y] of [[6, 8], [10, 6]]) p.set(x + 1, y - 2, R.brown[3]); },
  book: (p) => { p.rect(3, 4, 10, 9, R.ember[2]); p.rect(4, 5, 8, 7, R.sand[4]); p.vline(8, 5, 11, R.sand[1]); },
  map: (p) => { p.poly([[2, 4], [6, 3], [10, 4], [14, 3], [14, 12], [10, 13], [6, 12], [2, 13]], R.sand[4]); p.vline(6, 3, 12, R.sand[2]); p.vline(10, 4, 13, R.sand[2]); p.line(4, 10, 12, 6, R.ember[3]); },
  cards: (p) => { p.rect(3, 4, 7, 9, R.ice[4]); p.box(3, 4, 7, 9, R.stone[2]); p.rect(6, 3, 7, 9, W); p.box(6, 3, 7, 9, R.gold[3]); p.set(9, 7, R.violet[3]); },
  tree_skill: (p) => { p.set(8, 3, R.gold[4]); p.line(8, 3, 4, 8, R.stone[4]); p.line(8, 3, 12, 8, R.stone[4]); p.line(4, 8, 4, 12, R.stone[4]); p.line(12, 8, 12, 12, R.stone[4]); for (const [x, y] of [[8, 3], [4, 8], [12, 8], [4, 12], [12, 12]]) p.ellipse(x, y, 1.5, 1.5, R.teal[4]); },
  hand: (p) => { p.rect(5, 7, 6, 6, R.flesh[3]); for (let k = 0; k < 4; k++) p.vline(5 + k * 1.6, 3 + (k % 2), 7, R.flesh[3]); p.line(11, 9, 13, 7, R.flesh[3]); },
  ping: (p, c) => { p.poly([[8, 13], [4, 7], [5, 4], [8, 3], [11, 4], [12, 7]], c[3]); p.ellipse(8, 6, 1.6, 1.6, W); },
  exclaim: (p) => { p.rect(7, 3, 3, 7, R.gold[4]); p.rect(7, 11, 3, 2, R.gold[4]); },
  question: (p) => { p.path([[5, 5], [7, 3], [10, 3], [11, 5], [8, 8], [8, 10]], R.gold[4], 2); p.rect(7, 12, 2, 2, R.gold[4]); },
  speech: (p) => { p.rect(3, 4, 11, 7, W); p.poly([[5, 11], [5, 14], [8, 11]], W); for (const x of [6, 8, 10]) p.set(x, 7, R.stone[2]); },
  people: (p) => { p.ball(5, 6, 2, 2, R.flesh); p.ball(11, 6, 2, 2, R.flesh); p.rect(3, 9, 5, 4, R.teal[3]); p.rect(9, 9, 5, 4, R.ember[3]); },
  tide: (p, c) => { G.wave(p, c); p.hline(2, 14, 13, R.sand[3]); },
  sort: (p) => { for (let k = 0; k < 4; k++) p.hline(3, 5 + k * 2, 4 + k * 3, R.ice[4]); },
  trash: (p) => { p.rect(4, 5, 8, 8, R.stone[3]); p.hline(3, 12, 4, R.stone[4]); p.rect(7, 2, 3, 2, R.stone[3]); for (const x of [6, 8, 10]) p.vline(x, 6, 11, R.stone[1]); },
  info: (p) => { p.rect(7, 3, 3, 2, R.sea[4]); p.rect(7, 6, 3, 7, R.sea[4]); },
  stone: (p) => { p.ball(8, 9, 5, 4, R.stone, { spec: W }); },
  plank: (p) => { p.rect(2, 6, 12, 3, R.brown[3]); p.rect(3, 9, 12, 3, R.brown[2]); },
  pearl: (p) => { p.ball(8, 8, 4, 4, R.ice, { spec: W }); },
  crown: (p) => { p.poly([[3, 12], [3, 5], [6, 8], [8, 3], [10, 8], [13, 5], [13, 12]], R.gold[3]); p.hline(3, 13, 11, R.gold[1]); },
  fog: (p) => { for (const y of [5, 8, 11]) p.hline(3 + (y % 2), 13 - (y % 3), y, R.stone[4]); },
  ash: (p) => { G.cloud(p); p.map((c) => (c === R.ice[3] ? R.stone[2] : c === R.ice[4] ? R.stone[3] : null)); for (const [x, y] of [[5, 13], [9, 12], [12, 14]]) p.set(x, y, R.ember[4]); },
  hourglass: (p) => { p.poly([[4, 3], [12, 3], [8, 8]], R.sand[3]); p.poly([[8, 8], [12, 13], [4, 13]], R.sand[2]); p.hline(3, 13, 2, R.brown[3]); p.hline(3, 13, 14, R.brown[3]); },
  aura: (p, c) => { p.ellipse(8, 8, 5.5, 5.5, c[3]); p.cut(8, 8, 4, 4); p.ball(8, 8, 2, 2, c); },
};

// ------------------------------------------------------------------ frames

function badge(frame, glyph, gramp = frame, opts = {}) {
  const p = new Px(16, 16);
  p.rect(1, 0, 14, 16, frame[1]); p.rect(0, 1, 16, 14, frame[1]);
  p.rect(1, 1, 14, 14, (x, y) => band(frame, 0.32 - (x + y) / 80));
  p.hline(1, 14, 1, frame[3]); p.vline(1, 1, 14, frame[2]);
  const g = new Px(16, 16);
  (G[glyph] || G.star)(g, gramp);
  g.outline(INK);
  p.blit(g);
  if (opts.pip) p.set(13, 2, opts.pip);
  if (opts.corner) opts.corner(p);
  return p;
}
const def = (p) => ({ w: 16, h: 16, anchor: [0, 0], px: p.rows() });
const out = {};

// stat keyword -> glyph
const STAT_GLYPH = [
  [/gather|yieldStone|swing|dodgeRecharge/, 'pick'], [/yieldWood/, 'tree'], [/yieldCrop|cropGrowth|crop|seed|wither/, 'sprout'],
  [/yieldTidal|tidal|tide|wave/, 'wave'], [/fish|catch/, 'fish'], [/maxHp|hpRegen|lifesteal|heal|foodHeal|revive|cheat_death/, 'heart'],
  [/armor|thorns|shield|elemResist/, 'shield'], [/crit|ability_crit/, 'star'], [/power|bossDmg|dmg|double_swing|wide_swing|abilityPower/, 'sword'],
  [/moveSpeed|dodge|wayfarer/, 'boot'], [/luck|jackpot|luck_twice|windfall/, 'gem'], [/xp|nightXp|draft|card|keep_card/, 'cards'],
  [/sell|glint|landDiscount|refund|shop|token|structCost/, 'coin'], [/invSlots|pickup|stockpile|chestLoot|loot|double_drop|bonus_drop/, 'bag'],
  [/kiln|craft|bonus_output/, 'hammer'], [/Surge|surge/, 'bolt'], [/cdr|buffDuration|summonDuration|stack_buff/, 'clock'],
  [/burn|ember/, 'flame'], [/chill|freeze|frost|aura_slow/, 'flake'], [/spark|chain|lightning|periodic/, 'bolt'],
  [/machine|scuttler|burrow|companion/, 'gear'], [/map|dig|weather|eclipse|beacon/, 'map'], [/splinter|ricochet|death_explode/, 'bomb'],
  [/yieldMob|glintMob|elite|dmg_vs|debuff/, 'fang'], [/yieldAll|harvest/, 'ore'], [/second_calling|calling|start/, 'anchor'],
];
function glyphFor(entry) {
  const m = (entry.mods || entry.worldMods || [])[0];
  const procs = Array.isArray(entry.proc) ? entry.proc : entry.proc ? [entry.proc] : [];
  const key = [m?.stat, procs[0]?.id, entry.flags?.[0], entry.effects?.[0]?.id].filter(Boolean).join(' ');
  for (const [re, g] of STAT_GLYPH) if (re.test(key)) return g;
  return 'star';
}

// ------------------------------------------------------------------ groups

const TAG = { tide: [R.sea, 'wave'], ember: [R.ember, 'flame'], frost: [R.ice, 'flake'], storm: [R.gold, 'bolt'], bloom: [R.grass, 'leaf'], gear: [R.stone, 'gear'], fortune: [R.gold, 'coin'], fang: [R.violet, 'fang'] };
const RARITY = { common: R.stone, uncommon: R.grass, rare: R.sea, epic: R.violet, mythic: R.gold };
const BRANCH = { harvest: [R.grass, 'pick'], forge: [R.ember, 'hammer'], fray: [R.ember, 'sword'], tide: [R.sea, 'wave'], fortune: [R.gold, 'coin'] };
const CLASS = { bulwark: [R.stone, 'shield'], squallblade: [R.grass, 'wind'], brinesinger: [R.sea, 'drop'], gearwright: [R.gold, 'gear'], prospector: [R.ember, 'pick'], greenwarden: [R.grass, 'leaf'] };
const ABIL = {
  breakwater: 'shield', anchor_slam: 'anchor', rally_horn: 'horn', unmoored: 'chain', gale_step: 'wind', crosscurrent: 'spiral', riptide_mark: 'crosshair', tempest: 'slash',
  brine_bolt: 'drop', undertow: 'spiral', tidepool: 'rings', kingwave: 'wave', pocket_turret: 'turret', overclock: 'gear', magnet_coil: 'magnet', clockwork_legion: 'gear',
  seismic_strike: 'crack', vein_sense: 'eye', blast_charge: 'bomb', motherlode: 'gem', thornlash: 'whip', quickgrow: 'sprout', sproutling: 'sprout', verdant_tide: 'leaf',
};

for (const [tag, [ramp, g]] of Object.entries(TAG)) out['icon.tag.' + tag] = def(badge(ramp, g));
for (const [r, ramp] of Object.entries(RARITY)) out['icon.rarity.' + r] = def(badge(ramp, 'star', ramp));
for (const [b, [ramp, g]] of Object.entries(BRANCH)) out['icon.branch.' + b] = def(badge(ramp, g));
for (const c of CLASSES) { const [ramp, g] = CLASS[c.id] ?? [R.stone, 'star']; out['icon.class.' + c.id] = def(badge(ramp, g)); }

for (const a of ABILITIES) {
  const [ramp] = CLASS[a.class] ?? [R.stone];
  const g = ABIL[a.id] ?? 'star';
  out['icon.ability.' + a.id] = def(badge(ramp, g, g === 'drop' || g === 'wave' || g === 'rings' || g === 'spiral' ? R.sea : ramp, { pip: a.slot === 3 ? R.gold[4] : null }));
}
for (const c of CARDS) {
  const [tramp, tg] = TAG[c.tag] ?? [R.stone, 'star'];
  const frame = RARITY[c.rarity] ?? R.stone;
  const g = glyphFor(c);
  out['icon.card.' + c.id] = def(badge(frame, g === 'star' ? tg : g, tramp, { pip: tramp[4] }));
}
for (const s of SKILLS) { const [ramp] = BRANCH[s.branch] ?? [R.stone]; out['icon.skill.' + s.id] = def(badge(ramp, glyphFor(s), ramp)); }
for (const b of BLESSINGS) out['icon.blessing.' + b.id] = def(badge(R.teal, glyphFor(b), R.teal, { pip: W }));
for (const r of REBIRTH) out['icon.rebirth.' + r.id] = def(badge(R.violet, glyphFor(r), R.ice, { pip: R.ice[4] }));
const WING = { wing_timber: 'tree', wing_stone: 'stone', wing_ore: 'ore', wing_flora: 'leaf', wing_tide: 'pearl', wing_bestiary: 'fang', wing_relics: 'crown', wing_cuisine: 'potion' };
for (const w of ARCHIVE) out['icon.archive.' + w.id] = def(badge(R.sand, WING[w.id] ?? glyphFor(w.reward ?? {}), R.gold));

const STATUS = {
  burn: [R.ember, 'flame'], bleed: [R.ember, 'drop'], chill: [R.ice, 'flake'], slow: [R.ice, 'hourglass'], freeze: [R.ice, 'flake'], stun: [R.gold, 'star'],
  root: [R.grass, 'sprout'], mark: [R.ember, 'crosshair'], blind: [R.ink, 'eye'], silence: [R.violet, 'x'], shield: [R.sea, 'shield'], taunt: [R.ember, 'exclaim'],
  haste: [R.grass, 'boot'], invuln: [R.gold, 'shield'], unstoppable: [R.ember, 'anchor'], downed: [R.stone, 'skull'],
};
for (const id of REG.STATUSES ?? Object.keys(STATUS)) { const [ramp, g] = STATUS[id] ?? [R.stone, 'star']; out['icon.status.' + id] = def(badge(ramp, g, ramp === R.ink ? R.violet : ramp)); }

const ELEMENT = { none: [R.stone, 'sword'], ember: [R.ember, 'flame'], frost: [R.ice, 'flake'], storm: [R.gold, 'bolt'], tide: [R.sea, 'wave'], hollow: [R.violet, 'eye'] };
for (const [id, [ramp, g]] of Object.entries(ELEMENT)) out['icon.element.' + id] = def(badge(ramp, g, ramp));
const WEATHER = { clear: 'sun', rain: 'rain', storm: 'bolt', fog: 'fog', ashfall: 'ash', heatwave: 'sun', blizzard: 'flake', eclipse: 'moon', king_tide: 'wave' };
for (const [id, g] of Object.entries(WEATHER)) out['icon.weather.' + id] = def(badge(id === 'eclipse' ? R.violet : id === 'heatwave' ? R.ember : R.sea, g, R.sea));

// Buffs: item buffs reuse the item art inside a frame; ability/system buffs get glyph badges.
const itemIds = new Set(ITEMS.map((i) => i.id));
const BUFF_GLYPH = { rested: ['moon', R.sea], wake: ['sun', R.gold], overclock: ['gear', R.gold], rally: ['horn', R.gold], motherlode: ['gem', R.gold], vein_sense: ['eye', R.gold], unmoored: ['chain', R.ember] };
for (const id of REG.BUFF_IDS ?? []) {
  if (itemIds.has(id)) { out['icon.buff.' + id] = { ref: 'item.' + id, anchor: [0, 0] }; continue; }
  if (id.startsWith('set_')) { const [ramp, g] = TAG[id.slice(4)] ?? [R.stone, 'star']; out['icon.buff.' + id] = def(badge(ramp, g, ramp, { pip: W })); continue; }
  const [g, ramp] = BUFF_GLYPH[id] ?? ['star', R.teal];
  out['icon.buff.' + id] = def(badge(ramp, g, ramp));
}

const UI = {
  glint: [R.gold, 'coin'], heart: [R.ember, 'heart'], surge: [R.sea, 'bolt'], xp: [R.teal, 'star'], flux: [R.sea, 'bolt'], gear: [R.stone, 'gear'],
  map: [R.sand, 'map'], journal: [R.brown, 'book'], deck: [R.violet, 'cards'], skills: [R.teal, 'tree_skill'], inventory: [R.brown, 'bag'], build: [R.brown, 'hammer'],
  close: [R.ember, 'x'], check: [R.grass, 'check'], lock: [R.stone, 'lock'], plus: [R.grass, 'cross'], minus: [R.ember, 'minus'], star: [R.gold, 'star'],
  trash: [R.ember, 'trash'], sort: [R.stone, 'sort'], quest: [R.gold, 'exclaim'], turnin: [R.gold, 'question'], chat: [R.stone, 'speech'], party: [R.teal, 'people'],
  settings: [R.stone, 'gear'], warning: [R.ember, 'exclaim'], clock: [R.sea, 'clock'], tide_low: [R.sand, 'tide'], tide_high: [R.sea, 'wave'], sun: [R.gold, 'sun'],
  moon: [R.violet, 'moon'], info: [R.sea, 'info'], ping_need: [R.gold, 'hand'], ping_danger: [R.ember, 'skull'], ping_look: [R.sea, 'eye'], ping_omw: [R.grass, 'boot'],
  arrow_r: [R.stone, 'arrow'], hand: [R.flesh, 'hand'], fish: [R.sea, 'fish'], crown: [R.gold, 'crown'],
};
for (const [id, [ramp, g]] of Object.entries(UI)) out['icon.ui.' + id] = def(badge(ramp, g, ramp));
{
  const base = badge(R.stone, 'arrow', R.stone);
  out['icon.ui.arrow_l'] = def(base.flipX());
  out['icon.ui.arrow_u'] = def(base.rotate(-Math.PI / 2, 8, 8));
  out['icon.ui.arrow_d'] = def(base.rotate(Math.PI / 2, 8, 8));
}
void done;
export { G as GLYPHS, glyphFor };
export default out;
