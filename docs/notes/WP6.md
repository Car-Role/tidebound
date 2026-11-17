# WP6 notes (WP6a levels/cards/skills, WP6b classes/abilities/gear/consumables)

Files: `server/game/systems/{progression,cards,procs,skills,classes,abilities,gear,consumables}.js`,
`server/game/abilities/{bulwark,squallblade,brinesinger,gearwright,prospector,greenwarden,_util}.js`,
`client/ui/hud/{draft-badge,abilities}.js`, `client/ui/panels/{draft,deck,skills,character,class,temper}.js`,
`client/render/drawers/summon.js`, `test/progression.test.js` (82 tests), `test/classes.test.js` (19 tests).

## Services and contracts provided

| Service | Signature | Notes |
|---|---|---|
| `grantXp` | `(player, amount, source)` | x `xpMult`+`xpWorld` (cap x2.5), night (`1 + nightXp`, + 0.25 for source `'kill'`), Rested x1.25, Wake x2. Emits `xp.gained` with the granted amount (mastery listens), `player.levelup` per level. Returns XP granted. |
| `queueDraft` | `(player, { minRarity?, tag?, size?, source? })` | offers are rolled when queued (reconnect never re-rolls). |
| `hasUnlock` | `(id \| id[], player?)` | arrays = every entry. `level:N` without a player = any connected player. `skill:<id>` = world flag while any profile owns it. Other kinds read `world.flags`. |
| `grantSkillPoint` | `(player \| null, sourceKey)` | **for WP11 Archive wings**: `grantSkillPoint(null, 'wing:<id>')` gives every player (current and future) one point, once per key. Wardens, Vault first clears and the final boss are handled here from `boss.killed` / `vault.cleared`. |
| `effects` | `(player, id?)` | all registries.EFFECTS entries active for a player: cards (incl. set bonuses), skills, gear/trinkets, class passive. Also `game.effects.sum(player, id, key)`. |
| `addBuff` / `removeBuff` | per TECH_SPEC; `opts` also takes `kind` ('food' / 'tonic' are exclusive), `flags`, `hot` (HP/s), `duration: Infinity` | buffs are a stat + flag source; self key `buffs`. |
| `addSurge` / `drainSurge` | `(player, n)` | Surge lives in `player.abState.surge`; self key `surge { cur, max }`. |
| `weaponStats` / `hookStats` | `(player)` | tempered numbers (+6% per temper level), favoured-weapon flag. |
| `structureDiscount` | `(player, structureKind)` | **for WP4**: total structCost discount capped at 25%, minus the class-passive part for `world`/`natural` structures (DESIGN 10: class discounts never apply to world structures). |
| `cheatDeath` | `(player)` | also registered as a WP5 death guard (`registerDeathGuard`) so Phoenix Ash / Last Stand / `bl_revive` run before death. |
| `procFire` | `(trigger, player, ctx)` | same as `game.procs.fire(...)`. |

`game.procs` (procs.js): `addSource(name, fn(player) -> proc[])`, `invalidate(player)`, `fire(trigger, player, ctx)`,
`has(player, id)`, `params(player, id)`, `luckRoll(player, p)` (Golden Tide rolls twice), `dropHooked`, `hurtHooks`.

Bus events added (beyond TECH_SPEC 5.4): `skill.respec {player}`, `class.changed {player, class, second}`,
`gear.tempered {player, item, level, success}` (WP11's `temper` goal kind can listen to it).

Self keys: `xp {level, xp, next, rested, wake, cap}`, `cards {owned, drafts[{id, offers, minRarity, tag, source, rerollGlint, rerolls}], tokens, banishes, banished, pity, sets, mythic, apex}`,
`skills {points, owned, bonus, total, respecCost}`, `class {id, second, mastery{cls:{lv,xp,into,need}}, t, switchReadyAt, slots[6], secondCalling, sigSlots}`, `sig`,
`surge`, `cooldowns {t, list{ability:[readyAt, dur, charges, maxCharges]}}` (server seconds = client `store.serverTime()/1000`),
`buffs {t, list[{id, until, dur, kind, stacks}]}`, `gear {...slots, temper, set}`, `ui {kind:'class'|'temper', id, n}` (WP4's `ui` shape).

Saved per profile under `sys.progression` (rested), `sys.cards`, `sys.skills`, `sys.classes`, `sys.abilities` (surge,
cooldowns), `sys.gear` (first-join flag; the gear itself is the WP1 top-level `gear` incl. `gear.temper`), `sys.consumables` (buffs).
`systems.skills.worldPoints` holds the world-wide bonus points.

## Decisions and deviations

- **Tide tokens are the `tide_token` item** (reroll consumes one; skip gives one; 1 per 5 levels plus G7 / r16, granted retroactively). Using the item from the hotbar rerolls the oldest pending draft.
- **Pity** counts level drafts that resolved without a Rare+ ever shown (rerolled offers count as shown).
- **Banish** replaces the banished slot with a fresh card. Fusion requires standing within 4 tiles of a Calling Shrine; the fusion draft has exactly 3 offers.
- **Set world mods** (Ember 5 kilns, Gear 5/7) count once per world however many players hold the set; card `worldMods` sum across players except `u12` (highest rank + 1% per other holder).
- **Ability damage** = weapon damage x (1 + power) x favoured x ability % x (1 + abilityPower) x mastery effect (1.25) x cast multiplier (Tidelord opener, Leviathan double). Abilities crit only with Riptide (T10). WP5's `damage` adds boss/elite/world bonuses and all mitigation.
- **Mastery upgrade "+25% effect"** multiplies damage and healing (not durations, block, or radii; radii/durations come from the listed upgrade params).
- **Breakwater**: 80% of a frontal hit is restored in a `player.hurt` hook before WP5 checks death (so blocked lethal hits are survived); reflect goes through `damage`.
- **Rally Horn "+25% armor"** is an `add` of 25% of the ally's current armor (min 10): buffs may only use `add`.
- **Overclock** (ally): +100% swing, craft and kiln speed (swing is capped at +150% by the statbook).
- **Rested** uses the wall clock only for the offline span (`game.wallNow()` overridable); everything else is `game.now`.
- **HP regen is WP5's** (combat.js). WP6 adds Greenwarden's +1 HP/s and Warlord's +5% damage to nearby allies as stat mods.
- Level-up feedback is the client banner (drafts, points, tokens, new ability, Signature); the server only sends the `level_up` fx.

## Needs from others

- **WP1 / WP14 (movement)**: Shallows Walker (`e12`) sets `player.walkShallows` (a game-time expiry, refreshed each tick); `shared/rules/movement.js` / `systems/movement.js` should treat shallow water (tile 1) as walkable while `player.walkShallows > game.now`. Until then only the yield and high-tide-node parts of e12 work.
- **WP4**: use `game.call('effects', player)` instead of only gear + skills in `inventory.js effectsOf`, so card and set effects reach you (`low_tide_yield` Tide 7-set, `token_per_levels`, `burn_kill_drop`, `elite_glint`...). Use `structureDiscount(player, kind)` for placement costs. For Jackpot / Golden Tide on all drops, fire `game.procs.fire('drop', player, ctx)` with a mutable `{ item, qty }` in your loot roll and set `game.procs.dropHooked = true` (until then Jackpot rolls on node breaks only). `hitNode` with `opts.player` for ability/proc hits is relied on (your hitNode grants node XP; WP6 does not add more).
- **WP5**: `mob.hit` / `mob.killed` / `player.hurt` / `player.dodge` / `registerDeathGuard` are all used as you emit them today. Taunt from summons is `applyStatus(mob, 'taunt', { source: summonEntity })`; summon entities carry `data.ownerId` and `data.team = 'player'`. Riptide Mark's Signature sets `target.data.noHealUntil` (heals and shields on that target should be refused until then). Tidepool's Signature calls `revivePlayer(player)` when you register it (you do).
- **WP8**: Overclock on a machine writes `structure.data.overclock = { until, mult }` (game-time); `machineSpeed` should multiply by `mult` while `game.now < until`. Gearwright and `r06` set `machineNear` (+10% / +15%) with effect `machine_near_radius` (8 / 6 tiles).
- **WP9**: Quickgrow / Verdant Tide / Worldseed call `growCrops(realm, x, y, r, stages)`; Thornlash's Signature calls `farmTend(realm, tx, ty, 0.6, null)` and gives the harvested items to the caster.
- **WP10**: blessings with procs: register `game.procs.addSource('blessings', (player) => procs)` (each proc `{ on, id, p }`) and call `game.procs.invalidate(player)` when the run's blessings change. `companion` spawns a WP6 summon of `p.kind` while the proc is held.
- **WP11**: Archive wing skill points via `grantSkillPoint(null, 'wing:<id>')`.
- **WP12**: preset names used: `level_up`, `card_reveal`, `card_pick`, `set_proc`, `skill_buy`, `ability_cast`, the 24 ability presets (`seismic` for Seismic Strike), `summon_puff`, `temper_success`, `temper_fail`, plus proc feedback (`spark_chain`, `lightning_strike`, `burn`, `burn_explode`, `chill`, `freeze_shatter`, `tide_wave`, `swing_arc`, `dodge_trail`, `shield_pop`, `heal`, `revive`, `glint_burst`, `gem_sparkle`, `drop_pop`, `crop_grow`, `leaf_fall`, `kiln_smoke`, `craft_done`, `machine_work`, `fish_splash`, `pickup_trail`, `tide_out`, `hit_clink`). Line effects pass `{ a, len, w }`, chains `{ x2, y2 }`, areas `{ r }`. Client SFX names used: `levelup`, `card_flip`, `card_pick`, `card_mythic`, `skill_buy`, `deny`, `craft_done`, `shatter`, `ui_click`, `build_place`.
- **WP5 zone drawer**: WP6 zone kinds are `crater`, `wind_wall`, `undertow`, `tidepool`, `soaked`, `puddle`, `verdant_tide` (pub `r` radius in tiles, `t` remaining x10, `own`).

## Verification

- `node test/run.js progression` 82/82 and `node test/run.js classes` 19/19 (WP5 combat doubles in the rigs; every proc id has a case).
- Integration script against the real WP4/WP5 systems: weapon `attack` triggers card procs (chill applied by WP5's status system), Brine Bolt / Kingwave / turret / Clockwork Legion damage through WP5's `damage`, Phoenix Ash survives a lethal hit via the death guard.
- Headless Chrome (CDP over a pipe, port 8104 server, synthetic input only): title -> join, level-up banner, draft flip + rarity glow, click and number-key picks, reroll, deck with set progress and card preview, the Chart with hover details, Calling Shrine via the real `use` interaction and class choose, Q/E/R/F casts (summons drawn, cooldown wipes, "Not enough Surge"), Brinesinger zones, Tempering Forge via `use` + temper, Character beside Inventory. No page errors from WP6 code. (The client boot currently needs WP12's audio.js to finish: it imports a missing `createAmbience`; the check served a no-op audio module through CDP.)
