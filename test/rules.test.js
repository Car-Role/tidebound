// WP2: pure rule functions checked against DESIGN and PACING numbers.
import { ok, eq, near, throws } from './assert.js';
import { mulberry32 } from '../shared/rng.js';
import { xpToNext, totalXp, levelFromXp, masteryTotal, craftXp, killXpShare, archiveXp, xpMultiplier } from '../shared/rules/xp.js';
import { landBase, landCost, landTotal, coopScale, ballastFor, structureCost, refund, machineCap, temperCost, rerollCost, respecCost } from '../shared/rules/costs.js';
import { weaponHit, gatherHit, armorReduction, damageTaken, elemMult, bossMods, enrageTime } from '../shared/rules/combat.js';
import { yieldMult, dropQty, rollTable, mobGlint, luckChance } from '../shared/rules/loot.js';
import { rarityWeights, generateOffer, mythicLimit, draftPool, cardAtRank, setTiers } from '../shared/rules/draft.js';
import { sell, recover, simulateSteady, incomeCapPerHour } from '../shared/rules/market.js';
import { enemyHpScale, bossHpScale, trenchScale, trenchRareTier, tideHeightMods, nodeRespawnInterval, machineSpeed } from '../shared/rules/scaling.js';
import CARDS from '../shared/data/cards.js';

export default async function (t) {
  t.test('land cost curve: PACING 4.1 samples and 317,910 total', () => {
    const samples = { 1: 55, 2: 60, 8: 95, 9: 100, 23: 295, 24: 315, 38: 930, 39: 1005, 53: 2955, 54: 3190, 68: 9370, 69: 10120, 80: 23600 };
    for (const [n, v] of Object.entries(samples)) eq(landBase(Number(n)), v, 'n=' + n);
    eq(landTotal(), 317910);
    const band = (a, b) => { let s = 0; for (let n = a; n <= b; n++) s += landBase(n); return s; };
    eq([band(1, 8), band(9, 23), band(24, 38), band(39, 53), band(54, 68), band(69, 80)], [585, 2710, 8605, 27310, 86635, 192065]);
  });

  t.test('land cost: coopScale, discount capped at 20%, Tide Height +15%', () => {
    eq(coopScale(1), 1); near(coopScale(2), 1.7); near(coopScale(8), 5.9);
    eq(landCost(1, { coop: 1.7 }), Math.round(55 * 1.7));
    eq(landCost(10, { discount: 0.5 }), Math.round(landBase(10) * 0.8));
    eq(landCost(10, { tideHeight: 2 }), Math.round(landBase(10) * 1.3));
  });

  t.test('Ballast per plot (DESIGN 4.3) scales with coopScale', () => {
    eq(ballastFor('greenmarrow', 3), { item: 'ballast_1', qty: 30 });
    eq(ballastFor('saltfen', 12), { item: 'ballast_1', qty: 90 });
    eq(ballastFor('emberreach', 30), { item: 'ballast_2', qty: 160 });
    eq(ballastFor('glasswaste', 40), { item: 'ballast_3', qty: 200 });
    eq(ballastFor('hoarfrost', 60), { item: 'ballast_4', qty: 380 });
    eq(ballastFor('umbral', 70), { item: 'ballast_5', qty: 1000 });
    eq(ballastFor('umbral', 70, { coop: 1.7 }).qty, 1700);
  });

  t.test('XP curve: PACING 6.1 samples, total 6,432,785, phase requirements', () => {
    const s = { 1: 30, 5: 640, 10: 2385, 20: 8895, 30: 19215, 50: 50720, 75: 109580, 99: 185705 };
    for (const [L, v] of Object.entries(s)) eq(xpToNext(Number(L)), v, 'L=' + L);
    eq(xpToNext(100), 0);
    eq(totalXp(100), 6432785);
    const ends = [1, 8, 18, 32, 46, 60, 74, 90, 100];
    const need = ends.slice(1).map((L, i) => totalXp(L) - totalXp(ends[i]));
    eq(need, [3555, 38060, 187330, 436180, 782955, 1224545, 2058850, 1701310]);
    eq(levelFromXp(0).level, 1); eq(levelFromXp(totalXp(50)).level, 50); eq(levelFromXp(totalXp(50) - 1).level, 49);
    eq(levelFromXp(1e9).level, 100);
  });

  t.test('mastery, craft, kill-split and Archive XP', () => {
    eq(masteryTotal(10), 231000); eq(masteryTotal(20), 1722000);
    eq(craftXp(4), 2); eq(craftXp(1300), 520);
    near(killXpShare(100, 1), 100); near(killXpShare(100, 2), 80); near(killXpShare(100, 4) * 4, 100 * enemyHpScale(4));
    eq(archiveXp(3), 450);
    eq(xpMultiplier(5), 2.5);
  });

  t.test('structure cost: world scales by coopScale and ignores discounts; discounts capped at 25%', () => {
    const cost = [{ item: 'plank', qty: 100 }, { item: 'rope', qty: 1 }];
    eq(structureCost(cost, { discount: 0.5 }), [{ item: 'plank', qty: 75 }, { item: 'rope', qty: 1 }]);
    eq(structureCost(cost, { world: true, coop: 1.7, discount: 0.25 }), [{ item: 'plank', qty: 170 }, { item: 'rope', qty: 2 }]);
  });

  t.test('place + remove with every discount never creates items (DESIGN 7)', () => {
    for (const q of [1, 2, 3, 7, 12, 40, 100, 999]) for (const d of [0, 0.02, 0.08, 0.1, 0.2, 0.25, 0.4]) {
      const paid = structureCost([{ item: 'x', qty: q }], { discount: d });
      ok(refund(paid, true)[0].qty <= q && refund(paid)[0].qty <= q, `q=${q} d=${d}`);
      eq(refund(paid, true)[0].qty, paid[0].qty);
    }
  });

  t.test('machine cap, tempering, rerolls, respec', () => {
    eq(machineCap(0, 1), 8); eq(machineCap(2, 1.7), 17);
    eq(temperCost(1, 3), { bars: 2, rares: 1, glint: 75, success: 1 });
    eq(temperCost(10, 6).glint, 15000); eq(temperCost(6, 1).success, 0.9); eq(temperCost(10, 1).success, 0.5);
    eq(temperCost(11, 1), null);
    eq([rerollCost(20, 0), rerollCost(20, 1), rerollCost(20, 3)], [1000, 2000, 8000]);
    eq(respecCost(42), 4200);
  });

  t.test('combat: weapon hit, armor, elements, gather, damage taken, bosses', () => {
    near(armorReduction(100), 0.5); near(armorReduction(0), 0);
    near(weaponHit({ base: 10, power: 0.5, crit: true, critMult: 2, armor: 100, roll01: 0.5 }), 10 * 1.5 * 2 * 0.5);
    near(weaponHit({ base: 10, element: 'ember', target: { weak: 'ember' }, roll01: 0 }), 10 * 1.5 * 0.9);
    near(weaponHit({ base: 10, element: 'hollow', armor: 100, roll01: 1 }), 10 * (100 / 170) * 1.1);
    eq(elemMult('tide', { weak: 'ember', resist: 'tide' }), 0.5);
    eq(gatherHit({ hookPower: 4, gatherPower: 0.5, hookTier: 3, nodeTier: 3 }), { dmg: 6, drops: true });
    const tough = gatherHit({ hookPower: 4, gatherPower: 0, hookTier: 2, nodeTier: 3 });
    near(tough.dmg, 0.4); eq(tough.drops, false);
    near(damageTaken(100, { armor: 100 }), 50);
    eq(bossMods({ enraged: true, hard: true }), { hp: 2, dmg: 1.5 * 1.25, speed: 1.3 });
    eq([enrageTime(3), enrageTime(4)], [360, 480]);
  });

  t.test('loot: yield cap x3.0, fractional drop chance, luck, elite', () => {
    eq(yieldMult(0.5, 0.2), 1.7); eq(yieldMult(3, 3), 3);
    eq(dropQty(2, 1.25, () => 0.49), 2); eq(dropQty(2, 1.25, () => 0.5), 3);
    near(luckChance(0.1, 100), 0.15);
    const rand = mulberry32(7);
    let pearls = 0;
    for (let i = 0; i < 20000; i++) pearls += rollTable([{ item: 'pearl', min: 1, max: 1, p: 0.03 }], { rand }).length;
    ok(pearls > 500 && pearls < 700, 'pearl rate ' + pearls);
    eq(rollTable([{ item: 'chitin', min: 2, max: 2 }], { rand: () => 0, elite: true })[0].qty, 10);
    const g = mobGlint(3, () => 0.999, { elite: true });
    ok(g >= 29 && g <= 30);
  });

  t.test('market: saturation x0.99 per unit, floor 0.01, +0.02/min; steady state = 120 * value per good (+/-10%)', () => {
    const r = sell(10, 1000, 1);
    near(r.sat, 0.01, 1e-9);   // WP14 (BUILD_REVIEW P2-9): floor 0.05 -> 0.01
    near(recover(0.5, 10), 0.7); eq(recover(0.99, 5), 1); near(recover(0.5, 10, 1), 0.9);
    for (const value of [1, 4, 32]) for (const perMin of [2, 5, 20, 30]) {
      const perHour = simulateSteady(value, perMin, 8);
      ok(Math.abs(perHour / (120 * value) - 1) <= 0.1, `value ${value} at ${perMin}/min: ${perHour.toFixed(1)}/h`);
    }
    near(incomeCapPerHour(32, { rate: 0.7 }), 2688);
    // WP14: with floor 0.01 the cap also holds at 60 units/min (the 0.05 floor gave about 1.66x).
    ok(simulateSteady(1, 60, 8) <= 120 * 1.1, 'cap holds at 60/min: ' + simulateSteady(1, 60, 8).toFixed(1));
    ok(Math.abs(simulateSteady(10, 20, 8, { satRecover: 1 }) / 2400 - 1) <= 0.1, 'G8 doubles recovery');
  });

  t.test('draft: rarity bands, luck shift, Mythic limit', () => {
    eq(rarityWeights(5), { common: 70, uncommon: 25, rare: 5, epic: 0, mythic: 0 });
    eq(rarityWeights(70), { common: 30, uncommon: 30, rare: 22, epic: 13, mythic: 5 });
    eq(rarityWeights(5, { luck: 20 }), { common: 68, uncommon: 24, rare: 7, epic: 1, mythic: 0 });
    eq(rarityWeights(5, { rarePlus: 0.05 }).rare, 10);
    eq([mythicLimit(19), mythicLimit(20), mythicLimit(100)], [0, 1, 5]);
    const owned = { m01: 1 };
    ok(draftPool(CARDS, { level: 39, owned }).every((c) => c.rarity !== 'mythic'), 'one mythic owned at 39: no more');
    ok(draftPool(CARDS, { level: 40, owned }).some((c) => c.rarity === 'mythic'));
  });

  t.test('draft: no duplicates, offer size, bands respected, maxed and banished cards excluded', () => {
    const rand = mulberry32(42);
    const seen = { common: 0, uncommon: 0, rare: 0, epic: 0, mythic: 0 };
    for (let i = 0; i < 2000; i++) {
      const { offer } = generateOffer(CARDS, { level: 10, owned: { c01: 5 }, banished: ['c02'], size: 3, rand });
      eq(offer.length, 3); eq(new Set(offer).size, 3);
      ok(!offer.includes('c01') && !offer.includes('c02'));
      for (const id of offer) seen[CARDS.find((c) => c.id === id).rarity]++;
    }
    eq(seen.epic + seen.mythic, 0, 'level 2-15 offers no Epic or Mythic');
    ok(seen.rare > 0 && seen.common > seen.uncommon && seen.uncommon > seen.rare);
    eq(generateOffer(CARDS, { level: 70, size: 5, rand }).offer.length, 5);
    eq(generateOffer(CARDS, { level: 70, size: 9, rand }).offer.length, 5);
    throws(() => generateOffer(CARDS, { level: 5 }));
  });

  t.test('draft: pity guarantees a Rare+ after 5 drafts without one; bonus drafts respect minRarity', () => {
    const rand = mulberry32(3);
    let pity = 0, maxRun = 0, run = 0;
    for (let i = 0; i < 3000; i++) {
      const r = generateOffer(CARDS, { level: 5, pity, rand });
      const rareSeen = r.offer.some((id) => ['rare', 'epic', 'mythic'].includes(CARDS.find((c) => c.id === id).rarity));
      if (pity >= 5) ok(rareSeen, 'pity draft must contain a Rare+');
      run = rareSeen ? 0 : run + 1; maxRun = Math.max(maxRun, run);
      pity = r.pity;
    }
    ok(maxRun <= 5, 'never more than 5 drafts in a row without a Rare+ (got ' + maxRun + ')');
    for (let i = 0; i < 200; i++) {
      const r = generateOffer(CARDS, { level: 30, minRarity: 'rare', rand });
      ok(r.offer.every((id) => ['rare', 'epic', 'mythic'].includes(CARDS.find((c) => c.id === id).rarity)));
    }
    const fusion = generateOffer(CARDS, { level: 30, minRarity: 'uncommon', tag: 'ember', rand });
    ok(fusion.offer.every((id) => CARDS.find((c) => c.id === id).tag === 'ember'));
  });

  t.test('cards scale per rank; perRank overrides; set tiers count distinct cards', () => {
    const c01 = cardAtRank(CARDS.find((c) => c.id === 'c01'), 3);
    near(c01.mods[0].v, 0.18);
    const c25 = cardAtRank(CARDS.find((c) => c.id === 'c25'), 2);
    near(c25.proc.p.chance, 0.10); near(c25.proc.p.dmg, 0.4);
    eq(cardAtRank(CARDS.find((c) => c.id === 'r03'), 3).proc.p.icd, 4);
    eq(cardAtRank(CARDS.find((c) => c.id === 'e06'), 2).worldMods[0].v, 4);
    const tiers = setTiers(CARDS, { c13: 1, c18: 5, c26: 2, u02: 1, u07: 1 });
    eq(tiers.counts.ember, 5); eq(tiers.active.ember, [3, 5]);
  });

  t.test('scaling: co-op HP, Trench, Tide Height, node respawn, machine speed', () => {
    near(enemyHpScale(1), 1); near(enemyHpScale(3), 2.2); near(bossHpScale(3), 2.6);
    near(trenchScale(10), Math.pow(1.12, 10));
    eq([trenchRareTier(6, 1), trenchRareTier(6, 16), trenchRareTier(4, 40)], [3, 5, 4]);
    const th = tideHeightMods(3);
    near(th.hp, 2.2); near(th.dmg, 1.75); near(th.cost, 1.45); eq(th.secondAffix, true);
    near(nodeRespawnInterval(1), 6); near(nodeRespawnInterval(2), 6 / 1.6);
    eq(machineSpeed(5, 1, true), 3); near(machineSpeed(0.5, 0.5, false), 1.5 * 0.5 * 0.1);
  });
}
