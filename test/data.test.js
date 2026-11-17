// WP2: content data, registries, schema validation, cross-references, counts, reachability and unlock order.
import { ok, eq } from './assert.js';
import { content } from '../shared/data/index.js';
import * as REG from '../shared/data/registries.js';
import { validateContent, validateTable, extrasFrom, reachability, checkUnlockOrder, TABLE_NAMES } from '../shared/data/schema.js';
import { plotBiome, FEATURES } from '../shared/data/biomes.js';
import { biomeOf } from '../shared/grid.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const tables = () => Object.fromEntries(TABLE_NAMES.map((t) => [t, clone(content[t])]));
const extras = () => ({ ...extrasFrom(content), GROUPS: content.modules.recipes.GROUPS });
const count = (arr, f) => arr.filter(f).length;

export default async function (t) {
  t.test('every data file is real (no placeholders)', () => {
    eq(content.placeholders.length, 0, 'placeholder tables: ' + content.placeholders.join(','));
  });

  t.test('schema validation passes on all content', () => {
    const errs = validateContent(content);
    ok(errs.length === 0, errs.slice(0, 20).join('\n'));
  });

  t.test('schema rejects unknown registry values', () => {
    const c = tables();
    const card = clone(c.cards.find((x) => x.id === 'c01'));
    const bad = (mut) => { const x = clone(card); mut(x); return validateTable('cards', [x], c, extras()); };
    ok(bad((x) => { x.mods[0].stat = 'notAStat'; }).length > 0, 'unknown stat');
    ok(bad((x) => { x.mods[0].op = 'pow'; }).length > 0, 'unknown op');
    ok(bad((x) => { x.mods[0].op = 'mul'; }).length > 0, 'mul not allowed on cards');
    ok(bad((x) => { x.mods[0].when = 'full_moon'; }).length > 0, 'unknown condition');
    ok(bad((x) => { x.proc = { on: 'hit', id: 'not_a_proc', p: {} }; }).length > 0, 'unknown proc');
    ok(bad((x) => { x.proc = { on: 'sneeze', id: 'spark', p: { chance: 0.1, dmg: 1, range: 2 } }; }).length > 0, 'unknown trigger');
    ok(bad((x) => { x.proc = { on: 'hit', id: 'spark', p: { chance: 0.1, dmg: 1, range: 2, zap: 1 } }; }).length > 0, 'unknown proc param');
    ok(bad((x) => { x.proc = { on: 'hit', id: 'dmg_vs_status', p: { status: 'sleepy', bonus: 0.1 } }; }).length > 0, 'unknown status');
    ok(bad((x) => { x.flags = ['not_a_flag']; }).length > 0, 'unknown flag');
    ok(bad((x) => { x.tag = 'void'; }).length > 0, 'unknown tag');
    const en = clone(c.enemies[0]); en.ai = 'dancer';
    ok(validateTable('enemies', [en], c, extras()).length > 0, 'unknown archetype');
    const en2 = clone(c.enemies[0]); en2.aiParams.extra = 1;
    ok(validateTable('enemies', [en2], c, extras()).length > 0, 'unknown aiParam');
    const st = clone(c.structures.find((s) => s.id === 'burrow_1')); st.machine.type = 'teleporter';
    ok(validateTable('structures', [st], c, extras()).length > 0, 'unknown machine type');
    const st2 = clone(c.structures.find((s) => s.id === 'kiln')); st2.unlock = ['moon:3'];
    ok(validateTable('structures', [st2], c, extras()).length > 0, 'unknown unlock kind');
    const r = clone(c.recipes[0]); r.in[0].item = 'unobtainium';
    ok(validateTable('recipes', [r], c, extras()).length > 0, 'unknown recipe input');
    const ab = clone(c.abilities[0]); ab.params.explode = 1;
    ok(validateTable('abilities', [ab], c, extras()).length > 0, 'unknown ability param');
  });

  t.test('registries: 126 fx presets, 60 counters, closed lists unique', () => {
    eq(REG.FX_PRESETS.length, 126); eq(new Set(REG.FX_PRESETS).size, 126);
    eq(REG.FX_PRESETS_CORE.length, 89); eq(REG.FX_PRESETS_EXTRA.length, 37);
    eq(REG.COUNTERS.length, 60); eq(new Set(REG.COUNTERS).size, 60);
    eq(REG.AI_IDS.length, 23);
    for (const list of [REG.STAT_IDS, REG.PROC_IDS, REG.STATUSES, REG.FLAG_IDS, REG.EFFECT_IDS]) eq(new Set(list).size, list.length);
  });

  t.test('every fx name referenced by content is a preset', () => {
    const used = new Set();
    for (const n of content.nodes) { used.add(n.fx.hit); used.add(n.fx.brk); }
    for (const e of content.enemies) used.add(e.fxHit);
    for (const a of content.abilities) used.add(a.fx);
    for (const b of content.bosses) used.add(b.fx);
    for (const b of content.biomes) b.ambient.forEach((x) => used.add(x));
    for (const w of content.weather) if (w.fx) used.add(w.fx);
    for (const f of used) ok(REG.FX_PRESETS.includes(f), 'fx ' + f);
    // one preset per ability and one per boss/Keeper
    eq(new Set(content.abilities.map((a) => a.fx)).size, 24);
  });

  t.test('cards: 96 split 32/26/18/12/8, 12 per tag, sets 3/5/7 for every tag', () => {
    eq(content.cards.length, 96);
    const by = (r) => count(content.cards, (c) => c.rarity === r);
    eq([by('common'), by('uncommon'), by('rare'), by('epic'), by('mythic')], [32, 26, 18, 12, 8]);
    for (const tag of REG.CARD_TAGS) eq(count(content.cards, (c) => c.tag === tag), 12, 'tag ' + tag);
    const sets = content.modules.cards.TAG_SETS;
    eq(Object.keys(sets).sort(), [...REG.CARD_TAGS].sort());
    for (const tag of REG.CARD_TAGS) eq(Object.keys(sets[tag]), ['3', '5', '7']);
    const ranks = content.cards.reduce((a, c) => a + c.max, 0);
    eq(ranks, 32 * 5 + 26 * 4 + 18 * 3 + 12 * 2 + 8);
  });

  t.test('skills: 60 nodes, 120 points, 12 per branch, unlock lists consistent with structures', () => {
    eq(content.skills.length, 60);
    eq(content.skills.reduce((a, s) => a + s.cost, 0), 120);
    for (const b of REG.SKILL_BRANCHES) eq(count(content.skills, (s) => s.branch === b), 12);
    const sp = content.modules.skills.SKILL_POINT_SOURCES;
    eq(sp.levels + sp.wardens + sp.vaults + sp.wings + sp.finalBoss, 120);
    // every structure that needs skill:X is listed by X, and vice versa
    for (const st of content.structures) for (const u of st.unlock) {
      if (!u.startsWith('skill:')) continue;
      const sk = content.skills.byId[u.slice(6)];
      ok(sk && sk.unlocks.includes(st.id), `${st.id} needs ${u} but the skill does not list it`);
    }
  });

  t.test('world: 81 plots by biome 9/15/15/15/15/12, features per DESIGN 4.4', () => {
    const n = {};
    for (let px = 0; px < 9; px++) for (let py = 0; py < 9; py++) {
      const b = plotBiome(px, py);
      n[b] = (n[b] || 0) + 1;
      eq(biomeOf(px, py), b, `grid.biomeOf(${px},${py})`);
    }
    eq([n.greenmarrow, n.saltfen, n.emberreach, n.glasswaste, n.hoarfrost, n.umbral], [9, 15, 15, 15, 15, 12]);
    for (const b of content.biomes) {
      eq(FEATURES.reduce((a, f) => a + f.counts[b.id], 0), b.plots, 'features for ' + b.id);
      eq(b.plots, n[b.id]);
    }
    const fc = (id, b) => FEATURES.find((f) => f.id === id).counts[b];
    eq([fc('vault', 'umbral'), fc('castaway', 'saltfen'), fc('shrine', 'umbral'), fc('vein', 'umbral'), fc('wild', 'umbral'), fc('gate_site', 'umbral')], [1, 2, 2, 1, 4, 1]);
    // shrines = 11, castaways = 11 = NPCs
    eq(content.biomes.reduce((a, b) => a + fc('shrine', b.id), 0), 11);
    eq(content.biomes.reduce((a, b) => a + fc('castaway', b.id), 0), content.npcs.length);
    for (const b of content.biomes) eq(content.npcs.filter((x) => x.biome === b.id).length, fc('castaway', b.id), 'castaways in ' + b.id);
  });

  t.test('content counts', () => {
    eq(content.fish.length, 30); eq(content.crops.length, 12);
    eq(count(content.quests, (q) => q.type === 'main'), 24);
    eq(count(content.quests, (q) => q.type === 'side'), 33);
    eq(count(content.quests, (q) => q.type === 'board'), 8);
    eq(count(content.items, (i) => i.cat === 'trinket'), 24);
    eq(content.blessings.length, 20); eq(content.affixes.length, 6);
    eq(count(content.items, (i) => i.cat === 'relic'), 12);
    eq(content.deeds.length, 60);
    eq(new Set(content.deeds.map((d) => d.counter)).size, 60);
    for (const d of content.deeds) ok(REG.COUNTERS.includes(d.counter));
    eq(content.abilities.length, 24);
    for (const a of content.abilities) ok(a.upgrade && a.signature, a.id);
    for (const cl of content.classes) eq(cl.abilities.map((id) => content.abilities.byId[id].slot), [0, 1, 2, 3]);
    eq(content.enemies.length, 30); eq(content.weather.length, 9); eq(content.rebirth.length, 20);
    eq(count(content.bosses, (b) => b.kind === 'warden'), 6); eq(count(content.bosses, (b) => b.kind === 'keeper'), 6);
    eq(content.dungeons.length, 6); eq(content.npcs.length, 11); eq(content.archive.length, 8);
    for (const b of content.biomes) eq(count(content.fish, (f) => f.biome === b.id), 5);
  });

  t.test('Archive: 96 distinct donations, every one obtainable', () => {
    const all = content.archive.flatMap((w) => w.items);
    eq(all.length, 96); eq(new Set(all).size, 96);
  });

  t.test('main chain Glint totals 14,140 and respects the 25% cap (q01 exempt)', () => {
    const main = content.quests.filter((q) => q.type === 'main');
    eq(main.reduce((a, q) => a + q.rewards.glint, 0), 14140);
    eq(content.quests.byId.q13.goals[0].n, 3);
    eq(content.quests.byId.q01.rewards.glint, 60);
  });

  t.test('side quests: 3 per castaway, rewards 200*tier^2 XP and 20*2^tier Glint', () => {
    for (const npc of content.npcs) {
      eq(npc.quests.length, 3);
      for (const id of npc.quests) {
        const q = content.quests.byId[id];
        ok(q && q.giver === npc.id, id);
        eq(q.rewards.xp, 200 * npc.tier ** 2); eq(q.rewards.glint, 20 * 2 ** npc.tier);
      }
    }
  });

  t.test('castaway shops: previous-tier materials at 3x value, 40 per day', () => {
    for (const s of content.shops) for (const line of s.stock) {
      const it = line.item && content.items.byId[line.item];
      if (it && (it.cat === 'material' || it.cat === 'component') && line.stock === 40) eq(line.price, 3 * it.value, line.item);
    }
  });

  t.test('every recipe input exists and every recipe output is reachable from raw drops', () => {
    const R = reachability(content, extras(), { beacons: 6, level: 100, trench: 50 });
    const missing = content.recipes.filter((r) => !R.items.has(r.out.item)).map((r) => r.id);
    eq(missing, []);
    const unbuildable = content.structures.filter((s) => !s.natural && !R.structures.has(s.id)).map((s) => s.id);
    eq(unbuildable, []);
    // everything except the final-boss cosmetic is obtainable
    eq(content.items.filter((i) => !R.items.has(i.id)).map((i) => i.id), ['moon_shard_crown']);
  });

  t.test('unlock order: every Beacon and Tidegate stage is reachable using only earlier gates (no softlock)', () => {
    const errs = checkUnlockOrder(content, extras());
    eq(errs, []);
  });

  t.test('unlock-order check catches the CRITIQUE B1 softlock (Rime Bench at Beacon 5)', () => {
    const c = tables();
    c.structures.find((s) => s.id === 'workbench_3').unlock = ['beacon:5'];
    const errs = checkUnlockOrder(c, extras());
    ok(errs.some((e) => e.startsWith('gate Beacon 5')), errs.join('; '));
  });

  t.test('Ballast RU per biome matches PACING 4.1 (expanded from the real recipes)', () => {
    const recipeOf = new Map(content.recipes.filter((r) => !r.id.includes('_clay') && !r.id.includes('_sunsand') && !r.id.includes('_gourd') && !r.id.includes('_kelp')).map((r) => [r.out.item, r]));
    const ru = (item, qty) => {
      const r = recipeOf.get(item);
      if (!r || item === 'plank') return qty;
      const n = qty / r.out.qty;
      let s = (r.fuel || 0) * n;
      for (const i of r.in) s += ru(i.item, i.qty * n);
      return s;
    };
    const want = { greenmarrow: 2520, saltfen: 9450, emberreach: 16800, glasswaste: 33000, hoarfrost: 68400, umbral: 132000 };
    for (const b of content.biomes) {
      const per = b.ballast.perOrdinal ? b.ballast.perOrdinal * (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8) : b.ballast.qty * (b.plots - (b.id === 'greenmarrow' ? 1 : 0));
      eq(Math.round(ru(b.ballast.item, per)), want[b.id], b.id);
    }
  });

  t.test('Beacon and Tidegate costs match DESIGN 7.3 / 18.1', () => {
    const cost = (id) => Object.fromEntries(content.structures.byId[id].cost.map((c) => [c.item, c.qty]));
    eq(cost('beacon_1'), { copper_bar: 150, plank: 150, brick: 150 });
    eq(cost('beacon_6'), { umbral_alloy: 3000, hollow_core: 300, nullsilt: 1000, echoglass: 150 });
    const stages = content.modules.structures.TIDEGATE_STAGES;
    eq(stages.length, 5); eq(stages[4].glint, 250000); eq(stages.map((s) => s.wings), [4, 4, 6, 6, 8]);
    for (let k = 1; k <= 6; k++) ok(content.structures.byId['beacon_' + k].world);
  });

  t.test('every unlock reference resolves; Kiln recipes list fuel; groups are valid', () => {
    for (const r of content.recipes) if (/^kiln/.test(r.station)) ok(typeof r.fuel === 'number', r.id);
    for (const [g, members] of Object.entries(content.modules.recipes.GROUPS)) for (const it of Object.keys(members)) ok(content.items.byId[it], g + ':' + it);
  });
}
