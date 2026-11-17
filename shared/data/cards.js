// Tide Cards (DESIGN 9.1): 96 cards (32 C, 26 U, 18 R, 12 E, 8 M), 12 per tag.
// Rank rules: `mods` (and `worldMods`) are per rank and multiplied by rank. A proc's `scale` lists the params multiplied
// by rank (others are fixed). `perRank` (when not null) replaces mods/proc/effects/worldMods with absolute per-rank values.
// worldMods go to the world sheet (machine speed etc.); worldRule describes how several players' copies combine.
// when: condition id from registries.CONDITIONS. flags/effects: registries.FLAGS / registries.EFFECTS.
const m = (stat, v, when) => (when ? { stat, op: 'add', v, when } : { stat, op: 'add', v });
const mm = (stat, v) => ({ stat, op: 'mul', v });
const MAX = { common: 5, uncommon: 4, rare: 3, epic: 2, mythic: 1 };
const C = [];
const card = (id, name, rarity, tag, text, extra = {}) =>
  C.push({ id, name, rarity, tag, max: MAX[rarity], text, mods: [], perRank: null, proc: null, ...extra });

// ---------------------------------------------------------------- Common (32), max rank 5, values per rank
card('c01', 'Calloused Hands', 'common', 'gear', '+6% gather power', { mods: [m('gatherPower', 0.06)] });
card('c02', 'Quick Wrists', 'common', 'gear', '+4% swing speed', { mods: [m('swingSpeed', 0.04)] });
card('c03', 'Deep Pockets', 'common', 'fortune', '+4 inventory slots', { mods: [m('invSlots', 4)] });
card('c04', 'Sea Legs', 'common', 'tide', '+3% move speed', { mods: [m('moveSpeed', 0.03)] });
card('c05', 'Thick Hide', 'common', 'fang', '+10 armor', { mods: [m('armor', 10)] });
card('c06', 'Hearty', 'common', 'bloom', '+25 max HP', { mods: [m('maxHp', 25)] });
card('c07', 'Second Wind', 'common', 'bloom', '+0.4 HP/s regen', { mods: [m('hpRegen', 0.4)] });
card('c08', 'Keen Edge', 'common', 'fang', '+5% weapon damage', { mods: [m('power', 0.05)] });
card('c09', 'Lucky Find', 'common', 'fortune', '+3 luck', { mods: [m('luck', 3)] });
card('c10', 'Scholar', 'common', 'fortune', '+3% XP', { mods: [m('xpMult', 0.03)] });
card('c11', 'Haggler', 'common', 'fortune', '+4% sell price', { mods: [m('sellMult', 0.04)] });
card('c12', 'Magnetism', 'common', 'gear', '+0.6 tile pickup radius', { mods: [m('pickupRadius', 0.6)] });
card('c13', 'Warm Coals', 'common', 'ember', '+8% kiln speed', { mods: [m('kilnSpeed', 0.08)] });
card('c14', 'Nimble Fingers', 'common', 'gear', '+6% hand craft speed', { mods: [m('craftSpeed', 0.06)] });
card('c15', 'Surge Well', 'common', 'tide', '+10 max Surge', { mods: [m('maxSurge', 10)] });
card('c16', 'Flowing Mind', 'common', 'tide', '+0.5 Surge/s', { mods: [m('surgeRegen', 0.5)] });
card('c17', 'Timberhand', 'common', 'bloom', '+8% wood yield', { mods: [m('yieldWood', 0.08)] });
card('c18', 'Stonebreaker', 'common', 'ember', '+8% stone and ore yield', { mods: [m('yieldStone', 0.08), m('yieldOre', 0.08)] });
card('c19', 'Green Thumb', 'common', 'bloom', 'crops grow 5% faster', { mods: [m('cropGrowth', 0.05)] });
card('c20', 'Patient Line', 'common', 'frost', 'fish bite time -6%', { mods: [m('fishBite', -0.06)] });
card('c21', 'Sharp Eye', 'common', 'storm', '+2% crit chance', { mods: [m('critChance', 0.02)] });
card('c22', 'Heavy Blows', 'common', 'fang', '+8% crit damage', { mods: [m('critMult', 0.08)] });
card('c23', 'Rimeskin', 'common', 'frost', '-4% elemental damage taken', { mods: [m('elemResist', 0.04)] });
card('c24', 'Chill Touch', 'common', 'frost', 'hits slow 4% for 1.5 s (stacks to 5)', { proc: { on: 'hit', id: 'chill', p: { slow: 0.04, dur: 1.5, max: 5 }, scale: ['slow'] } });
card('c25', 'Spark', 'common', 'storm', '5% on hit: 40% damage spark to 1 enemy within 3 tiles', { proc: { on: 'hit', id: 'spark', p: { chance: 0.05, dmg: 0.4, range: 3 }, scale: ['chance'] } });
card('c26', 'Kindle', 'common', 'ember', '5% on hit: burn for 30% weapon damage over 3 s', { proc: { on: 'hit', id: 'burn', p: { chance: 0.05, dmg: 0.3, dur: 3 }, scale: ['chance'] } });
card('c27', 'Tidy Camp', 'common', 'gear', 'structures cost 2% less', { mods: [m('structCost', -0.02)] });
card('c28', 'Beachcomber', 'common', 'tide', '+10% tidal-flat yields', { mods: [m('yieldTidal', 0.10)] });
card('c29', 'Night Owl', 'common', 'frost', '+4% damage and gather power at night', { mods: [m('power', 0.04, 'night'), m('gatherPower', 0.04, 'night')] });
card('c30', 'Sunwarmed', 'common', 'ember', '+4% yields by day', { mods: [m('yieldAll', 0.04, 'day')] });
card('c31', 'Roll With It', 'common', 'storm', 'dodge recharge -5%', { mods: [m('dodgeRecharge', -0.05)] });
card('c32', 'Butcher', 'common', 'fang', '+8% mob drop quantity', { mods: [m('yieldMob', 0.08)] });

// ---------------------------------------------------------------- Uncommon (26), max rank 4
card('u01', 'Splinter Burst', 'uncommon', 'bloom', 'breaking a tree: 10% chance an adjacent tree takes a full hit x3', { proc: { on: 'nodeBreak', id: 'splinter', p: { chance: 0.10, mult: 3, cls: 'wood' }, scale: ['chance'] } });
card('u02', 'Chain Reaction', 'uncommon', 'ember', 'breaking an ore node: 8% chance all nodes within 2 tiles take 150% of your hit', { proc: { on: 'nodeBreak', id: 'chain_break', p: { chance: 0.08, radius: 2, mult: 1.5, cls: 'ore' }, scale: ['chance'] } });
card('u03', 'Double Catch', 'uncommon', 'tide', '8% chance to land 2 fish', { proc: { on: 'fishCatch', id: 'double_catch', p: { chance: 0.08 }, scale: ['chance'] } });
card('u04', 'Ricochet', 'uncommon', 'storm', '12% chance attacks and sparks bounce to a second target for 60%', { proc: { on: 'hit', id: 'ricochet', p: { chance: 0.12, dmg: 0.6 }, scale: ['chance'] } });
card('u05', 'Leech Edge', 'uncommon', 'fang', 'heal 0.8% of damage dealt', { mods: [m('lifesteal', 0.008)] });
card('u06', 'Frostbite', 'uncommon', 'frost', 'slowed enemies take +6% damage', { proc: { on: 'hit', id: 'dmg_vs_status', p: { status: 'slow', bonus: 0.06 }, scale: ['bonus'] } });
card('u07', 'Wildfire', 'uncommon', 'ember', 'burns have 20% chance per tick to spread within 2 tiles', { proc: { on: 'tick', id: 'burn_spread', p: { chance: 0.2, radius: 2 }, scale: ['chance'] } });
card('u08', 'Static Build', 'uncommon', 'storm', 'each hit +1% swing speed, max 5 stacks per rank, 3 s decay', { proc: { on: 'hit', id: 'stack_buff', p: { stat: 'swingSpeed', per: 0.01, max: 5, decay: 3 }, scale: ['max'] } });
card('u09', 'Overgrowth', 'uncommon', 'bloom', '6% of harvests return the seed and +1 crop', { proc: { on: 'harvest', id: 'seed_return', p: { chance: 0.06 }, scale: ['chance'] } });
card('u10', 'Windfall', 'uncommon', 'fortune', '4% of node breaks drop Glint = 2 * nodeTier * (1 + level/10)', { proc: { on: 'nodeBreak', id: 'windfall', p: { chance: 0.04 }, scale: ['chance'] } });
card('u11', 'Gilded Touch', 'uncommon', 'fortune', '+6% Glint from all sources', { mods: [m('glintMult', 0.06)] });
card('u12', 'Efficient Design', 'uncommon', 'gear', 'world machines +4% speed (highest rank among players applies; others add 1%)', { worldMods: [m('machineSpeed', 0.04)], worldRule: { mode: 'highest', others: 0.01 } });
card('u13', 'Scuttler Friend', 'uncommon', 'gear', 'Scuttlers +8% harvest speed', { worldMods: [m('scuttlerRate', 0.08)] });
card('u14', 'Low Tide Lore', 'uncommon', 'tide', 'low tide +10% duration on your current plot; +10% tide_cache chance', { mods: [m('tidalDuration', 0.10), m('cacheChance', 0.10, 'low_tide')] });
card('u15', 'Rimeguard', 'uncommon', 'frost', 'after a dodge: ice shield for 4% max HP, 3 s', { proc: { on: 'dodge', id: 'dodge_shield', p: { pct: 0.04, dur: 3 }, scale: ['pct'] } });
card('u16', 'Thornskin', 'uncommon', 'bloom', 'reflect 8% of melee damage taken', { mods: [m('thorns', 0.08)] });
card('u17', 'Finisher', 'uncommon', 'fang', '+10% damage vs enemies under 30% HP', { proc: { on: 'hit', id: 'dmg_vs_hp', p: { below: 0.3, bonus: 0.10 }, scale: ['bonus'] } });
card('u18', 'Opening Strike', 'uncommon', 'fang', '+15% damage vs enemies at full HP', { proc: { on: 'hit', id: 'dmg_vs_hp', p: { above: 1.0, bonus: 0.15 }, scale: ['bonus'] } });
card('u19', 'Cold Storage', 'uncommon', 'frost', 'food and tonic buffs last 10% longer', { mods: [m('buffDuration', 0.10)] });
card('u20', 'Heat Treatment', 'uncommon', 'ember', '5% of smelts produce a bonus bar', { proc: { on: 'smelt', id: 'bonus_output', p: { chance: 0.05 }, scale: ['chance'] } });
card('u21', 'Momentum', 'uncommon', 'storm', 'each kill +2% move speed, 5 stacks, 6 s', { proc: { on: 'kill', id: 'stack_buff', p: { stat: 'moveSpeed', per: 0.02, max: 5, decay: 6 }, scale: ['per'] } });
card('u22', 'Treasure Sense', 'uncommon', 'fortune', 'chests +10% loot; rank 1 also shows dig spots on the minimap', { mods: [m('chestLoot', 0.10)], flags: ['dig_minimap'] });
card('u23', 'Thrifty', 'uncommon', 'fortune', '5% of crafts refund 1 random ingredient', { proc: { on: 'craft', id: 'refund', p: { chance: 0.05 }, scale: ['chance'] } });
card('u24', 'Iceplate', 'uncommon', 'frost', 'when hit: 10% chance to freeze the attacker 1 s', { proc: { on: 'hurt', id: 'freeze_attacker', p: { chance: 0.10, dur: 1 }, scale: ['chance'] } });
card('u25', 'Battle Trance', 'uncommon', 'fang', 'kills restore 3 Surge', { proc: { on: 'kill', id: 'surge_on_kill', p: { amount: 3 }, scale: ['amount'] } });
card('u26', 'Spare Parts', 'uncommon', 'gear', 'turrets and summons last 10% longer and deal +5% damage', { mods: [m('summonDuration', 0.10), m('summonPower', 0.05)] });

// ---------------------------------------------------------------- Rare (18), max rank 3
card('r01', 'Tidal Surge', 'rare', 'tide', 'every 10th hit releases a wave: 120% damage in a 5-tile line, knockback', { proc: { on: 'hit', id: 'nth_hit_wave', p: { n: 10, dmg: 1.2, len: 5 }, scale: ['dmg'] } });
card('r02', 'Ember Heart', 'rare', 'ember', 'burning enemies explode on death for 80% weapon damage, radius 2', { proc: { on: 'kill', id: 'death_explode', p: { status: 'burn', dmg: 0.8, radius: 2 }, scale: ['dmg'] } });
card('r03', 'Glacial Core', 'rare', 'frost', '5 Chill stacks freeze for 2 s (per-enemy cooldown 8 / 6 / 4 s)', {
  perRank: [8, 6, 4].map((icd) => ({ proc: { on: 'hit', id: 'chill_freeze', p: { stacks: 5, dur: 2, icd } } })) });
card('r04', 'Thunderhead', 'rare', 'storm', 'crits call lightning for 100% damage (cooldown 2 / 1.5 / 1 s)', {
  perRank: [2, 1.5, 1].map((icd) => ({ proc: { on: 'crit', id: 'crit_lightning', p: { dmg: 1.0, icd } } })) });
card('r05', 'Harvest Moon', 'rare', 'bloom', 'at night: crops +20% growth, nodes on your plot respawn 10% faster', { mods: [m('cropGrowth', 0.20, 'night')], worldMods: [m('nodeRespawn', 0.10, 'night')] });
card('r06', 'Clockwork Heart', 'rare', 'gear', 'machines within 6 tiles of you +15% speed', { mods: [m('machineNear', 0.15)], effects: [{ id: 'machine_near_radius', radius: 6 }] });
card('r07', 'Glint Vein', 'rare', 'fortune', 'ore nodes 3% chance to drop a glintstone', { proc: { on: 'nodeBreak', id: 'node_bonus_drop', p: { cls: 'ore', item: 'glintstone', chance: 0.03 }, scale: ['chance'] } });
card('r08', 'Bloodtide', 'rare', 'fang', 'under 40% HP: +15% damage and +3% lifesteal', { proc: { on: 'tick', id: 'low_hp_buff', p: { below: 0.4, mods: [m('power', 0.15), m('lifesteal', 0.03)] }, scale: ['mods'] } });
card('r09', 'Twin Swing', 'rare', 'storm', '10% chance a swing hits twice', { proc: { on: 'swing', id: 'double_swing', p: { chance: 0.10 }, scale: ['chance'] } });
card('r10', 'Rootnet', 'rare', 'bloom', 'harvesting 5 plants within 5 s: +30% swing speed for 3 s', { proc: { on: 'nodeBreak', id: 'harvest_streak', p: { n: 5, window: 5, mods: [m('swingSpeed', 0.30)], dur: 3 }, scale: ['mods'] } });
card('r11', 'Salvager', 'rare', 'gear', '6% chance a machine craft consumes no input', { proc: { on: 'machineCraft', id: 'machine_free', p: { chance: 0.06 }, scale: ['chance'] } });
card('r12', 'Deep Lungs', 'rare', 'tide', 'abilities cost 8% less Surge, cooldowns -5%', { mods: [m('surgeCost', -0.08), m('cdr', 0.05)] });
card('r13', 'Predator', 'rare', 'fang', '+8% damage per distinct debuff on the target', { proc: { on: 'hit', id: 'dmg_per_debuff', p: { bonus: 0.08 }, scale: ['bonus'] } });
card('r14', 'Permafrost', 'rare', 'frost', 'frozen enemies take +40% crit damage', { proc: { on: 'crit', id: 'dmg_vs_status', p: { status: 'freeze', bonus: 0.40, critOnly: true }, scale: ['bonus'] } });
card('r15', 'Slag Armor', 'rare', 'ember', '+20 armor; melee attackers are burned', { mods: [m('armor', 20)], proc: { on: 'hurt', id: 'burn_attacker', p: { dmg: 0.3, dur: 3 }, scale: ['dmg'] } });
card('r16', "Fortune's Favor", 'rare', 'fortune', '+5 percentage points Rare-or-better in drafts; +1 tide_token per 10 levels', { mods: [m('draftRarePlus', 0.05)], effects: [{ id: 'token_per_levels', every: 10, n: 1 }] });
card('r17', 'Squall Boots', 'rare', 'storm', 'dodges leave a 2 s lightning trail (60% damage/s)', { proc: { on: 'dodge', id: 'dodge_trail', p: { dmg: 0.6, dur: 2 }, scale: ['dmg'] } });
card('r18', 'Pearl Diver', 'rare', 'tide', '4% of fish catches also give a pearl; tidal shellbed pearl chance x2', { proc: { on: 'fishCatch', id: 'fish_bonus', p: { item: 'pearl', chance: 0.04 }, scale: ['chance'] }, effects: [{ id: 'shellbed_pearl_mult', v: 2 }] });

// ---------------------------------------------------------------- Epic (12), max rank 2 (values rank 1 / rank 2)
const two = (a, b) => [a, b];
card('e01', 'Maelstrom', 'epic', 'tide', 'ability hits pull enemies 1.5 tiles toward the impact; +25% / +50% ability damage', {
  perRank: two(0.25, 0.5).map((v) => ({ mods: [m('abilityPower', v)], proc: { on: 'abilityHit', id: 'ability_pull', p: { dist: 1.5 } } })) });
card('e02', 'Phoenix Ash', 'epic', 'ember', 'on death revive in place with 40% HP and a fire nova (cooldown 10 / 6 min)', {
  perRank: two(600, 360).map((cd) => ({ proc: { on: 'death', id: 'revive', p: { hp: 0.4, cd } } })) });
card('e03', 'Absolute Zero', 'epic', 'frost', 'freezes last 3 / 4 s; bosses are slowed 30% / 45% instead of frozen', {
  perRank: [[3, 0.3], [4, 0.45]].map(([dur, bossSlow]) => ({ proc: { on: 'hit', id: 'freeze_extend', p: { dur, bossSlow } } })) });
card('e04', 'Chain Lightning', 'epic', 'storm', 'all your lightning and sparks chain to 3 / 5 extra enemies at 70%', {
  perRank: two(3, 5).map((n) => ({ proc: { on: 'hit', id: 'chain_extra', p: { n, mult: 0.7 } } })) });
card('e05', 'Worldseed', 'epic', 'bloom', 'place one personal sapling (hotbar): aura radius 6, +20% / +40% crop growth and +2 / +4 HP/s to allies', {
  perRank: [[0.2, 2], [0.4, 4]].map(([growth, regen]) => ({ proc: { on: 'tick', id: 'sapling', p: { radius: 6, growth, regen } } })), grants: [{ item: 'worldseed_sapling', qty: 1 }] });
card('e06', 'Master Blueprint', 'epic', 'gear', '+2 / +4 machine cap on every plot; machines use 15% / 30% less Flux', {
  perRank: [[2, -0.15], [4, -0.30]].map(([cap, flux]) => ({ worldMods: [m('machineCap', cap), m('fluxUse', flux)] })) });
card('e07', "King's Ransom", 'epic', 'fortune', 'elites and bosses drop x1.5 / x2 Glint; land costs -3% / -6%', {
  perRank: [[1.5, 0.03], [2, 0.06]].map(([mult, land]) => ({ mods: [m('landDiscount', land)], effects: [{ id: 'elite_glint', mult }] })) });
card('e08', 'Apex', 'epic', 'fang', '+15% / +25% damage vs elites and bosses; each kill +0.01% permanent damage (cap 10% / 20%)', {
  perRank: [[0.15, 0.10], [0.25, 0.20]].map(([v, cap]) => ({ mods: [m('eliteDmg', v), m('bossDmg', v)], proc: { on: 'kill', id: 'kill_stack_perm', p: { per: 0.0001, cap } } })) });
card('e09', 'Echo Swing', 'epic', 'storm', 'every 5th swing repeats as a shockwave, 200% / 300%, radius 3 (also hits nodes)', {
  perRank: two(2, 3).map((dmg) => ({ proc: { on: 'swing', id: 'nth_swing_shockwave', p: { n: 5, dmg, radius: 3 } } })) });
card('e10', 'Living Hook', 'epic', 'bloom', 'your Tidehook swings by itself at the nearest node within 2 tiles every 1.2 / 0.8 s', {
  perRank: two(1.2, 0.8).map((interval) => ({ proc: { on: 'tick', id: 'auto_swing', p: { interval, range: 2 } } })) });
card('e11', 'Kilnsoul', 'epic', 'ember', 'ore in your inventory smelts by itself, 1 ore pair per 3 / 1.5 s, no fuel', {
  perRank: two(3, 1.5).map((interval) => ({ proc: { on: 'tick', id: 'inv_smelt', p: { interval } } })) });
card('e12', 'Shallows Walker', 'epic', 'tide', 'walk on shallow water (1 tile from shore) / also tidal nodes spawn at high tide for you; tidal yields +50% / +100%', {
  perRank: [[false, 0.5], [true, 1.0]].map(([highTideNodes, y]) => ({ mods: [m('yieldTidal', y)], proc: { on: 'tick', id: 'shallows_walk', p: { highTideNodes } } })) });

// ---------------------------------------------------------------- Mythic (8), rank 1
card('m01', "Leviathan's Call", 'mythic', 'tide', 'every 30 s your next ability casts twice at no cost', { proc: { on: 'cast', id: 'double_cast', p: { interval: 30 } } });
card('m02', 'Heart of the Caldera', 'mythic', 'ember', 'burns never expire, stack to 5, and deal +100% damage', { proc: { on: 'hit', id: 'burn_stack', p: { max: 5, mult: 1.0 } } });
card('m03', "Winter's Crown", 'mythic', 'frost', 'enemies within 4 tiles are permanently slowed 25%; killing a frozen enemy releases a freezing nova', { proc: { on: 'tick', id: 'aura_slow', p: { radius: 4, slow: 0.25, novaOnFrozenKill: true } } });
card('m04', 'Eye of the Storm', 'mythic', 'storm', 'lightning strikes a random enemy within 8 tiles every 3 s for 250%; crit chance above 75% converts to crit damage', { proc: { on: 'tick', id: 'periodic_lightning', p: { interval: 3, dmg: 2.5, range: 8 } }, flags: ['crit_overflow'] });
card('m05', 'Verdant Sovereign', 'mythic', 'bloom', 'nodes you break have a 15% chance to regrow instantly; crops yield double', { mods: [m('yieldCrop', 1.0)], proc: { on: 'nodeBreak', id: 'node_regrow', p: { chance: 0.15 } } });
card('m06', 'The Grand Design', 'mythic', 'gear', 'all world machines +25% speed; every Burrow gains +1 Scuttler', { worldMods: [m('machineSpeed', 0.25), m('scuttlerRate', 0.33)] });
card('m07', 'Golden Tide', 'mythic', 'fortune', 'every luck roll is rolled twice and takes the better; +1% of all Glint the world earns is duplicated', { proc: [{ on: 'drop', id: 'luck_twice', p: {} }, { on: 'tick', id: 'glint_echo', p: { pct: 0.01 } }] });
card('m08', 'Alpha', 'mythic', 'fang', '+30% damage; kills heal 5% HP; elites spawn 50% more often', { mods: [m('power', 0.30)], proc: { on: 'kill', id: 'heal_on_kill', p: { pct: 0.05 } }, effects: [{ id: 'elite_spawn', v: 0.5 }] });

// ---------------------------------------------------------------- set bonuses: distinct cards owned per tag at 3, 5, 7
// op:'mul' is allowed here (DESIGN 5.1).
export const TAG_SETS = {
  tide: {
    3: { text: '+10% ability damage', mods: [m('abilityPower', 0.10)] },
    5: { text: 'abilities leave a puddle (20% slow, 3 s)', proc: { on: 'abilityHit', id: 'puddle', p: { slow: 0.2, dur: 3 } } },
    7: { text: '-15% cooldowns; low-tide yields x2', mods: [m('cdr', 0.15)], effects: [{ id: 'low_tide_yield', mult: 2 }] },
  },
  ember: {
    3: { text: 'burn damage +25%', mods: [m('burnDmg', 0.25)] },
    5: { text: 'kilns +25% speed; fire immunity', worldMods: [m('kilnSpeedWorld', 0.25)], flags: ['fire_immune'] },
    7: { text: 'burn kills explode (10% max HP AoE) and drop charcoal', proc: { on: 'kill', id: 'death_explode', p: { status: 'burn', dmg: 0.1, radius: 2 } }, effects: [{ id: 'burn_kill_drop', item: 'charcoal' }] },
  },
  frost: {
    3: { text: 'slow potency +10%', mods: [m('slowPotency', 0.10)] },
    5: { text: '+15% armor', mods: [mm('armor', 0.15)] },
    7: { text: 'frozen enemies take +25% damage', proc: { on: 'hit', id: 'dmg_vs_status', p: { status: 'freeze', bonus: 0.25 } } },
  },
  storm: {
    3: { text: '+5% swing speed', mods: [m('swingSpeed', 0.05)] },
    5: { text: '+10% crit damage; sparks chain +1', mods: [m('critMult', 0.10)], proc: { on: 'hit', id: 'chain_extra', p: { n: 1, mult: 0.7 } } },
    7: { text: 'every 20th hit calls lightning (300%)', proc: { on: 'hit', id: 'periodic_lightning', p: { interval: 20, dmg: 3, range: 0 } } },
  },
  bloom: {
    3: { text: '+10% plant and wood yield', mods: [m('yieldPlant', 0.10), m('yieldWood', 0.10)] },
    5: { text: '+1 HP/s per 10 levels', effects: [{ id: 'regen_per_levels', every: 10, v: 1 }] },
    7: { text: 'crops 25% chance to give a second harvest', effects: [{ id: 'crop_double', chance: 0.25 }] },
  },
  gear: {
    3: { text: '+5% craft speed', mods: [m('craftSpeed', 0.05)] },
    5: { text: 'machines +10% speed', worldMods: [m('machineSpeed', 0.10)] },
    7: { text: '+1 Scuttler per Burrow', worldMods: [m('scuttlerRate', 0.33)] },
  },
  fortune: {
    3: { text: '+5 luck', mods: [m('luck', 5)] },
    5: { text: '+10% Glint', mods: [m('glintMult', 0.10)] },
    7: { text: 'drafts offer +1 card', mods: [m('draftOffers', 1)] },
  },
  fang: {
    3: { text: '+5% damage', mods: [m('power', 0.05)] },
    5: { text: '3% lifesteal', mods: [m('lifesteal', 0.03)] },
    7: { text: '+15% damage vs elites and bosses', mods: [m('eliteDmg', 0.15), m('bossDmg', 0.15)] },
  },
};
export const SET_THRESHOLDS = Object.freeze([3, 5, 7]);

export default C;
