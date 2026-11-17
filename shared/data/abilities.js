// Abilities (DESIGN 10): 24, slot 0..3 = keys Q/E/R/F, unlocking at levels 10/20/35/60.
// dmg/heal are fractions of weapon damage / max HP (2.2 = 220%). upgrade = mastery upgrade (slots 0-1 at mastery 10,
// slots 2-3 at mastery 20; +25% effect plus the listed params/flags). signature = permanent second upgrade (levels 70/80/90).
// flags are free-form strings read only by that ability's own file in server/game/abilities/.
const LV = [10, 20, 35, 60];
const MS = [10, 10, 20, 20];
const A = [];
const ab = (id, cls, slot, name, surge, cd, target, range, params, upgrade, signature, text, extra = {}) =>
  A.push({ id, class: cls, slot, level: LV[slot], name, surge, cd, target, range, params, upgrade: { mastery: MS[slot], ...upgrade }, signature,
    text, fx: id, sfx: 'ability_' + cls, icon: 'icon.ability.' + id, ...extra });

// Bulwark
ab('breakwater', 'bulwark', 0, 'Breakwater', 20, 10, 'self', 0, { dur: 3, block: 0.8, reflect: 0.3 }, { flags: ['blocked_hits_restore_surge_5'] }, { flags: ['guard_360'] }, '3 s frontal guard: block 80%, reflect 30%');
ab('anchor_slam', 'bulwark', 1, 'Anchor Slam', 30, 12, 'point', 6, { dmg: 2.2, radius: 3, stun: 1.5 }, { flags: ['crater'], params: { slow: 0.3 } }, { flags: ['double_slam'], params: { dur: 0.6 } }, 'leap up to 6 tiles; 220% AoE radius 3, stun 1.5 s', { fx: 'anchor_slam' });
ab('rally_horn', 'bulwark', 2, 'Rally Horn', 40, 30, 'self', 0, { radius: 8, armor: 0.25, heal: 0.03, dur: 8 }, { flags: ['cleanse'] }, { flags: ['ally_damage_20'] }, 'allies within 8: +25% armor, 3% max HP/s for 8 s');
ab('unmoored', 'bulwark', 3, 'Unmoored', 60, 90, 'self', 0, { dur: 10, dmg: 0.5, heal: 0.04 }, { params: { dur: 14 } }, { flags: ['kill_extend'], params: { max: 6 } }, '10 s: unstoppable, +50% damage, hits heal 4% max HP');
// Squallblade
ab('gale_step', 'squallblade', 0, 'Gale Step', 15, 6, 'dir', 5, { len: 5, dmg: 1.8 }, { params: { charges: 2 } }, { flags: ['wind_wall'], params: { dur: 2 } }, 'dash 5 tiles through enemies for 180%');
ab('crosscurrent', 'squallblade', 1, 'Crosscurrent', 25, 8, 'self', 0, { hits: 3, dmg: 0.9, radius: 2.2 }, { flags: ['pull_inward'] }, { flags: ['cd_per_hit_0.5'] }, 'spin: 3 hits of 90%, radius 2.2');
ab('riptide_mark', 'squallblade', 2, 'Riptide Mark', 20, 15, 'enemy', 8, { dur: 6, mark: 0.3 }, { flags: ['mark_spreads'] }, { flags: ['no_heal_shield'] }, 'mark a target 6 s: +30% damage taken; if it dies, Gale Step resets', { flags: ['reset_gale_step'] });
ab('tempest', 'squallblade', 3, 'Tempest', 60, 80, 'self', 6, { hits: 12, dmg: 1.5, radius: 6 }, { params: { hits: 18 } }, { flags: ['final_crit_400'] }, '12 strikes of 150% across enemies within 6 tiles; invulnerable during', { flags: ['invulnerable'] });
// Brinesinger
ab('brine_bolt', 'brinesinger', 0, 'Brine Bolt', 12, 2, 'dir', 10, { dmg: 2.0, range: 10 }, { flags: ['split_3'] }, { flags: ['third_free_300'] }, 'piercing bolt 200%, range 10', { flags: ['pierce'] });
ab('undertow', 'brinesinger', 1, 'Undertow', 30, 14, 'point', 8, { radius: 3, dur: 4, dmg: 0.6, tick: 1, pull: 1 }, { flags: ['burst_200'] }, { flags: ['follow_cursor'] }, 'vortex radius 3 for 4 s: pulls, 60%/s');
ab('tidepool', 'brinesinger', 2, 'Tidepool', 35, 20, 'point', 8, { radius: 3, dur: 8, heal: 0.05, dmg: 0.4, tick: 1 }, { flags: ['ally_swing_20'] }, { flags: ['revive_one'] }, 'zone radius 3, 8 s: allies heal 5% max HP/s, enemies take 40%/s');
ab('kingwave', 'brinesinger', 3, 'Kingwave', 70, 90, 'dir', 12, { len: 12, width: 4, dmg: 9.0 }, { flags: ['return_wave_450'] }, { flags: ['soaked'], params: { slow: 0.4, dur: 6 } }, 'wave 12 tiles long, 4 wide: 900%, heavy knockback');
// Gearwright
ab('pocket_turret', 'gearwright', 0, 'Pocket Turret', 25, 10, 'point', 4, { summon: 'pocket_turret', dur: 20, speed: 3, dmg: 0.4, max: 2 }, { params: { max: 3 } }, { flags: ['piercing_bolts'] }, 'deploy a turret 20 s: 3 shots/s of 40% (max 2)');
ab('overclock', 'gearwright', 1, 'Overclock', 30, 25, 'ally_or_machine', 6, { speed: 1.0, dur: 15 }, { flags: ['area'], params: { radius: 3 } }, { flags: ['refill_tend'], params: { range: 12 } }, 'target machine or ally: +100% speed for 15 s');
ab('magnet_coil', 'gearwright', 2, 'Magnet Coil', 20, 12, 'self', 12, { radius: 12, range: 5, pull: 5, stun: 1 }, { params: { dmg: 1.5 } }, { flags: ['double_drops_10'] }, 'pull all drops within 12 tiles; enemies within 5 pulled and stunned 1 s');
ab('clockwork_legion', 'gearwright', 3, 'Clockwork Legion', 60, 90, 'self', 0, { summon: 'battle_scuttler', count: 4, dur: 25, dmg: 0.6, speed: 2 }, { params: { count: 6 } }, { flags: ['explode_200'] }, '4 battle Scuttlers for 25 s (each 60% damage, 2/s, taunt)', { flags: ['taunt'] });
// Prospector
ab('seismic_strike', 'prospector', 0, 'Seismic Strike', 20, 6, 'self', 0, { radius: 3, gather: 3.0, dmg: 1.5 }, { params: { radius: 4 } }, { flags: ['drops_to_player'] }, 'every node within 3 tiles takes 300% gather damage; enemies 150%', { fx: 'seismic' });
ab('vein_sense', 'prospector', 1, 'Vein Sense', 15, 30, 'self', 0, { dur: 20, radius: 20, yieldMult: 2 }, { flags: ['spawn_gem'] }, { params: { dur: 30 } }, '20 s: rare nodes highlighted within 20 tiles; rare drop chance x2');
ab('blast_charge', 'prospector', 2, 'Blast Charge', 30, 14, 'point', 8, { gather: 4.0, dmg: 4.0, radius: 2.5 }, { flags: ['mini_charges'], params: { count: 3 } }, { params: { charges: 2 } }, 'thrown charge: 400% gather and weapon damage, radius 2.5');
ab('motherlode', 'prospector', 3, 'Motherlode', 60, 100, 'self', 0, { dur: 15, yieldMult: 2, xpMult: 2 }, { params: { dur: 20, yieldMult: 3 } }, { flags: ['share_allies'], params: { radius: 8 } }, '15 s: every node break gives double drops and double XP');
// Greenwarden
ab('thornlash', 'greenwarden', 0, 'Thornlash', 15, 4, 'dir', 4, { len: 4, dmg: 1.6, dur: 4 }, { flags: ['root_1s'] }, { flags: ['harvest_cone'] }, 'whip cone 4 tiles: 160%, bleed 60% over 4 s', { flags: ['bleed_60'] });
ab('quickgrow', 'greenwarden', 1, 'Quickgrow', 30, 30, 'self', 0, { radius: 4, stages: 1, heal: 0.15 }, { params: { radius: 6 } }, { params: { stages: 2 } }, 'crops within 4 advance one stage; allies heal 15%');
ab('sproutling', 'greenwarden', 2, 'Sproutling', 35, 40, 'point', 4, { summon: 'sproutling', count: 1, dur: 30, dmg: 0.8 }, { params: { count: 2 } }, { flags: ['sprout_heal'], params: { heal: 0.02, radius: 3 } }, 'summon a Sproutling 30 s (80% damage, taunts, harvests plants)', { flags: ['taunt', 'harvests'] });
ab('verdant_tide', 'greenwarden', 3, 'Verdant Tide', 70, 110, 'self', 0, { radius: 6, dur: 12, heal: 0.06, stun: 3 }, { flags: ['respawn_nodes'] }, { params: { radius: 9 } }, 'radius 6, 12 s: allies 6% max HP/s, enemies rooted 3 s, crops ripen instantly', { flags: ['root', 'ripen'] });

export default A;
