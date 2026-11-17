// Enemies (DESIGN 11). Base solo stats. weak x1.5, resist x0.5 ('none' = no element). glint: [min, max] = tier * rand(0..2).
// aiParams values not given by DESIGN (cooldowns, distances) are WP2 fill-ins derived from the behaviour text.
const BIOME = [null, 'greenmarrow', 'saltfen', 'emberreach', 'glasswaste', 'hoarfrost', 'umbral'];
const BLOOD = [null, 'green', 'teal', 'orange', 'white', 'blue', 'violet'];
const l = (item, min, max = min, p = 1) => ({ item, min, max, p });

const E = [];
const en = (id, name, tier, hp, dmg, speed, xp, ai, aiParams, weak, resist, loot, extra = {}) =>
  E.push({
    id, name, tier, biome: BIOME[tier], hp, dmg, speed, xp, armor: 0, ai, aiParams, weak, resist,
    radius: 0.4, night: false, loot, glint: [0, 2 * tier], blood: BLOOD[tier], fxHit: 'hit_flesh', ...extra,
  });

// Greenmarrow
en('mossback', 'Mossback', 1, 30, 6, 2.0, 12, 'charger', { windup: 0.6, chargeSpeed: 6, chargeDist: 5, cd: 3 }, 'ember', 'tide', [l('chitin', 1, 2)]);
en('thistlewisp', 'Thistlewisp', 1, 20, 7, 2.5, 12, 'kiter', { keepDist: 5, shotCd: 2, proj: 'seed' }, 'ember', 'storm', [l('reedfiber', 1), l('resin', 1, 1, 0.1)]);
en('burrowgrub', 'Burrowgrub', 1, 26, 9, 3.0, 14, 'burrower', { windup: 0.8, cd: 4, hideTime: 2 }, 'frost', 'none', [l('chitin', 1), l('peat', 1)]);
en('lantern_moth', 'Lantern Moth', 1, 14, 5, 4.0, 10, 'swarm', { groupSize: 4, lightSeek: true }, 'ember', 'none', [l('shell', 1)], { night: true, radius: 0.3 });
// Saltfen
en('clatterclaw', 'Clatterclaw', 2, 90, 16, 2.2, 32, 'guarded_melee', { frontBlock: 0.8, windup: 0.6, range: 1.2, cd: 1.6 }, 'storm', 'tide', [l('fen_slime', 1), l('shell', 1, 1, 0.5)], { armor: 20, radius: 0.45, fxHit: 'hit_armor' });
en('fenleech', 'Fenleech', 2, 60, 14, 4.5, 28, 'lunger', { lungeDist: 4, latchTime: 2, heal: 0.05, cd: 4 }, 'ember', 'frost', [l('fen_slime', 1, 2)]);
en('reedstalker', 'Reedstalker', 2, 80, 22, 3.5, 34, 'ambusher', { disguise: 'reed_clump', revealDist: 2.5, burst: 1.5 }, 'ember', 'none', [l('kelp', 1), l('fen_slime', 1)]);
en('bogwisp', 'Bogwisp', 2, 55, 18, 3.0, 30, 'teleport_caster', { shotCd: 2.5, proj: 'bog_orb', homing: 0.5, blinkOnHit: true }, 'storm', 'ember', [l('salt', 1), l('pearl', 1, 1, 0.05)]);
en('brine_shambler', 'Brine Shambler', 2, 110, 20, 2.5, 40, 'shambler', { groupSize: 3, fromWater: true }, 'ember', 'tide', [l('fen_slime', 1), l('iron_bar', 1, 1, 0.05)], { night: true, radius: 0.45 });
// Emberreach
en('cinderling', 'Cinderling', 3, 160, 45, 4.5, 50, 'exploder', { fuse: 1, radius: 2 }, 'frost', 'ember', [l('ember_scale', 1), l('brimstone', 1)], { fxHit: 'hit_flesh' });
en('slagback', 'Slagback', 3, 280, 34, 1.8, 70, 'trail_tank', { trail: 'fire', trailDur: 4 }, 'frost', 'ember', [l('ember_scale', 2), l('obsidian', 1)], { armor: 40, radius: 0.6, fxHit: 'hit_armor' });
en('ashwing', 'Ashwing', 3, 180, 30, 5.0, 55, 'diver', { circleDist: 5, diveCd: 4, lineLen: 7 }, 'storm', 'none', [l('ember_scale', 1)]);
en('magmaw', 'Magmaw', 3, 240, 38, 0, 60, 'turret_lobber', { shotCd: 2.5, proj: 'lava_blob', arc: true }, 'frost', 'ember', [l('brimstone', 2), l('magma_core', 1, 1, 0.03)], { radius: 0.6 });
en('emberwraith', 'Emberwraith', 3, 220, 40, 3.5, 75, 'phaser', { passStructures: true, touchStatus: 'burn' }, 'tide', 'ember', [l('ember_scale', 1), l('charcoal', 1)], { night: true });
// Glasswaste
en('shardscuttle', 'Shardscuttle', 4, 420, 60, 5.5, 80, 'skirmisher', { zigzag: 1.5, stabCd: 1.5 }, 'tide', 'storm', [l('mirage_dust', 1)], { fxHit: 'hit_armor' });
en('mirage_stalker', 'Mirage Stalker', 4, 500, 70, 4.0, 90, 'illusionist', { clones: 2, cloneCd: 10 }, 'storm', 'none', [l('mirage_dust', 2)]);
en('dune_maw', 'Dune Maw', 4, 700, 85, 6, 105, 'charger', { windup: 0.8, chargeSpeed: 6, chargeDist: 8, cd: 5, burrow: true }, 'frost', 'none', [l('mirage_dust', 1), l('sunsand', 3)], { radius: 0.6 });
en('prism_sentinel', 'Prism Sentinel', 4, 600, 75, 1.5, 100, 'beam_turret', { charge: 1.2, sweep: 90, dps: 75 }, 'hollow', 'storm', [l('glass', 2), l('amber', 1, 1, 0.04)], { fxHit: 'hit_armor' });
en('glass_revenant', 'Glass Revenant', 4, 650, 80, 3.5, 115, 'splitter', { into: 'glass_shard', count: 3 }, 'storm', 'frost', [l('mirage_dust', 1), l('lens', 1, 1, 0.03)], { night: true, fxHit: 'hit_armor' });
// Hoarfrost
en('rimewolf', 'Rimewolf', 5, 950, 110, 5.5, 115, 'pack_hunter', { packSize: 3, flank: true, howlCd: 12 }, 'ember', 'frost', [l('frost_pelt', 1)]);
en('frostbulk', 'Frostbulk', 5, 1600, 150, 2.0, 150, 'trail_tank', { trail: 'ice', trailDur: 3, slamCd: 5 }, 'ember', 'frost', [l('frost_pelt', 2), l('everice', 2)], { radius: 0.7 });
en('stillwing', 'Stillwing', 5, 1000, 120, 6.0, 125, 'diver', { circleDist: 8, diveCd: 5, lineLen: 9, fromOffscreen: true }, 'storm', 'frost', [l('frost_pelt', 1)]);
en('sleetspitter', 'Sleetspitter', 5, 1100, 130, 2.5, 130, 'kiter', { keepDist: 6, shotCd: 2.5, proj: 'icicle', fan: 3 }, 'ember', 'frost', [l('frostmoss', 2), l('aurora_shard', 1, 1, 0.04)]);
en('pale_shade', 'Pale Shade', 5, 1300, 140, 3.5, 160, 'ambusher', { disguise: 'invisible', revealDist: 4, burst: 1.5 }, 'ember', 'hollow', [l('frost_pelt', 1), l('everice', 1)], { night: true });
// Umbral
en('hollowling', 'Hollowling', 6, 2200, 190, 4.5, 160, 'blinker', { blinkCd: 5, behind: true }, 'storm', 'hollow', [l('gloom_heart', 1, 1, 0.3), l('inkweed', 1)]);
en('inkmaw', 'Inkmaw', 6, 3000, 220, 2.5, 185, 'turret_lobber', { shotCd: 3, proj: 'ink', arc: true, pool: 'ink' }, 'frost', 'tide', [l('inkweed', 2)], { radius: 0.6 });
en('refrain_knight', 'Refrain Knight', 6, 3800, 260, 3.5, 230, 'mimic', { copyRange: 10 }, 'tide', 'none', [l('gloom_heart', 1, 1, 0.5), l('umbral_alloy', 1, 1, 0.03)], { armor: 60, fxHit: 'hit_armor' });
en('gloom_lantern', 'Gloom Lantern', 6, 2400, 0, 3.0, 175, 'support_shield', { radius: 6 }, 'storm', 'hollow', [l('echoglass', 1, 1, 0.05), l('nullsilt', 3)]);
en('abyss_eye', 'Abyss Eye', 6, 2800, 240, 1.0, 195, 'beam_turret', { charge: 1.2, sweep: 120, dps: 240, summons: 'hollowling' }, 'ember', 'hollow', [l('gloom_heart', 1, 1, 0.4)], { radius: 0.6 });
en('tidewraith', 'Tidewraith', 6, 3400, 250, 4.0, 240, 'wave_rider', { waveSpeed: 6, vulnWindow: 1.5 }, 'storm', 'tide', [l('gloom_heart', 1), l('echoglass', 1, 1, 0.03)], { night: true, raid: true });

// Elite rule (DESIGN 11): 8% chance (100% during eclipse), x4 HP, x1.5 damage, x5 XP and loot, one affix, gold outline.
export const ELITE = Object.freeze({ chance: 0.08, hp: 4, dmg: 1.5, xp: 5, loot: 5, glint: 5, affixes: 1 });
// Spawning rule (DESIGN 11)
export const SPAWN = Object.freeze({ dayEvery: 20, nightEvery: 10, perPlot: (tier) => 2 + tier, globalCap: (tier) => 6 + 4 * tier, lampRadius: 6, lampsPerPlot: 4, nightXp: 0.25 });
// Raids (DESIGN 8.4)
export const RAIDS = Object.freeze({ fromBeacon: 2, nightChance: 0.3, waves: 3, disableS: 60, lootMult: 2 });

export default E;
