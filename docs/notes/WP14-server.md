# WP14 server half: notes

Scope: `server/`, `shared/`, `test/`, `package.json`, `docs/` (BUILD_REVIEW.md untouched). Client changes the server
needs are in `docs/notes/WP14-client-needs.md`. Pacing results are in `docs/PACING_RESULTS.md`.

## BUILD_REVIEW items

| Id | Status | What changed |
|---|---|---|
| P0-1 tier-1 weapon / elites | fixed | `shared/data/recipes.js`: `r_rope_hand` (4 reedfiber -> 1 rope, Workbench, 4 s), so the Driftwood Blade needs no Loom. `mobs.js` `spawnMob`: no rolled elites while fewer than 3 plots are owned (start plot counts). The tutorial text is client (fixed by the client builder). |
| P0-2 one effects pipeline | fixed | `inventory.js` `effectsOf` returns `game.effects.of(player)` (cards, sets, class, gear, skills, lines, moon) plus skills unlocked in the world by another bound player; the old gear + skills body is the fallback. `quests.js` registers effects source `lines` (pq(p).effects), so Brannick's temper discount and Ysolde's rare-fish bonus reach `gear.js` / `fishing.js`; gathering, fishing, market, stations and tempering all read the same list. |
| P0-3 Moon Chart effects | fixed | `rebirth.js`: effects source `moon` (perk effects, `n` x rank). `cards.js`: drafts carry `level`; level drafts at levels divisible by 10 get +`draft_offer_tens`. `rebirth.js` reset keeps rank-many cards (new action `moon.keep {ids}` chooses them, else highest rank) for online players and offline profiles, and now actually clears online players' live card / skill / ability / dungeon / buff state (it only cleared the saved profile before). `bosses.js`: Twin Spoils re-rolls the trinket entries once per rank. `scuttlers.js`: Burrow `maxTier + moonRank(owner, 'moon_scuttler')`. |
| P0-4 Archive skill point | fixed | `archive.js` calls `grantSkillPoint(null, 'wing:<id>')` on wing completion; `skills.js` load back-fills `wing:*` flags of older saves. |
| P0-5 co-op scaling | fixed | Rule: **S = number of distinct tokens in (bound profiles UNION players online), 1..8**. A player counts the moment they join; S never sits below the number of players online. The hourly, announced recompute still governs who stays bound after they stop playing. `/unbind` (chat and `coop.unbind`) refuses online players and has a 6 h (world playtime) cooldown; the host gets the reason as a toast. `coopScale`, `boundCount` (node respawn, Tidegate, machine cap) all read this S. Tests updated (`coop.test.js`, `world.test.js`, `quests-endgame.test.js`). |
| P0-6 pacing test | fixed | `shared/rules/pacing.js` (model port reading the real data), `test/pacing.test.js`, `test/bot/pacing-bot.js`; `npm run test:pacing` runs the full bot. See PACING_RESULTS.md. |
| P1-1 automation ceiling | fixed | `machines.js` place validator: Burrows <= (2 + 2 x lit Beacons) x coopScale, Drills <= 2 x lit Beacons x coopScale, world-wide (constants `BURROW_WORLD_BASE`, `BURROW_PER_BEACON`, `DRILL_PER_BEACON`). |
| P1-2 early Glint | fixed (gate) | `market.sell` refuses until Beacon 1 (`MARKET_SELL_BEACON` in constants) with `why`. Ledger Post and Mint unlock at Beacon 5 anyway. |
| P1-3 copper / start plot | fixed | `copper_vein` weight 10 -> 17; `populateWith` supports `style.guarantee`; the Greenmarrow start plot always has 2 copper veins, 4 fieldstone rocks and 4 reed clumps (client note: first weapon path). |
| P1-4 six deed counters | fixed | `tempers_done` (gear.js, on success), `rerolls_used` (cards.js), `tend_refills` (machines.js, a refill that brought a machine back from below half), `allies_revived` (death.js `revivePlayer` with a reviver), `raids_survived` (raids.js, world counter), `king_tides_worked` (gathering.js, a tidal node broken during a king tide, once per king tide per player). |
| P1-5..P1-11 | n/a | client (client builder). Revive: the server already handled `revive {id}`. |
| P1-12 tapped / glint | fixed | `gathering.js`: `gather.swing` refuses a `tapped` tree (`locked`), `hitNode` ignores player hits on it; a tide cache pays `node.data.glint` when set (first cache exactly 15 G). |
| P2-1 passive actions | fixed | `PASSIVE_ACTIONS` += chat.say, settings.set, quest.pin, inv.sort, inv.hotbar, ping.mark. |
| P2-2 Overclock cap | fixed | `machineSpeed`: `min(3.0, (1 + bonus) * overclock)`. |
| P2-3 double glintMult | fixed | `mobs.js` passes `glintMult: 0`; `land.js addGlint` applies it once. |
| P2-4 remote donations | fixed | `archive.js` reach check returns false without an Archive structure in reach. |
| P2-5 Tide Board | fixed | One shared set of 3 contracts per 3 in-game days (`BOARD_REFRESH_DAYS`); each contract pays once per world (`world.boardClaimed`); holders of a claimed contract lose it with a toast. About 2.5 contracts per real hour per crew instead of 7.5 per player. |
| P2-6 Ballast XP | fixed | `crafting.js craftXp`: Ballast at half XP (`BALLAST_XP_MULT`). |
| P2-7 respawn bonus cap | fixed | `nodes.js` uses the 0.5 cap of `nodeRespawnInterval`. |
| P2-8 untended producers | fixed | <= 4 x coopScale Drip Collector / Sap Tap / Creel / Hum Hive per plot (`PRODUCERS_PER_PLOT`). |
| P2-9 SAT_FLOOR | fixed | 0.05 -> 0.01; `rules.test.js` now asserts the cap also holds at 60 units/min. |
| P2-10 Trench key | fixed | `dungeon.enter {id, start: 10}` at the Trench starts at floor 10 once floor 10 was reached (`world.flags['trench:10']`), costing one `vault_key_6` unless the party has `trench_no_key`. |
| P2-11 procs not wired | fixed | Shallows Walker: `systems/movement.js` walks shallow water while `player.walkShallows > now` (client prediction: see client needs). Loot fires `drop` procs for every node and mob stack and sets `game.procs.dropHooked`. `dealHeal` honours `noHealUntil`. |
| P2-12 tokens after rejoin | checked, no change | The welcome `self.cards.tokens` is correct after a rejoin in the harness (cards `onJoin` runs after the inventory is restored). |
| P2-13 save ids / biome | fixed | `save.js` sets `nextEntityId` above every saved structure / chest id before restoring nodes and saves `biome` per plot. `land.js` no longer writes `sys:nextId`; it honours and deletes it once for old saves. |
| P2-14 | n/a | client. |
| P2-15 core.test vault size | fixed | expects `inst.w` / `inst.h`. |
| P2-16..P2-20, P2-23 | n/a | client. |
| P2-21 dark rainy start | fixed | `clock.js`: a brand-new world starts at t = 150 (day) with clear Greenmarrow weather for the whole first in-game day. |
| P2-22 mobs on the start plot | fixed | `ai.js tileOk`: wild mobs cannot step onto the start plot (raiders and tutorial mobs can). |
| P2-24 | fixed | `building.js costFor` uses WP6b's `structureDiscount` (cap 25%, class passive never on world structures); DESIGN.md q13 typo fixed (3 plots, 300 G). |

## Other needs-from-others (server side)

| Need | Status |
|---|---|
| WP5 `drainSurge`, ability `{ability:true}` damage | already present (abilities.js registers `drainSurge`; ability hits pass `ability: true`). |
| WP6 effects / statbook | see P0-2. `structureDiscount` see P2-24. |
| WP6 Overclock | see P2-2. |
| WP7 `tapped`, first cache 15 G | see P1-12. Natural structures not removable: already enforced by building.js. |
| WP7 save.js id collision, plot biome | see P2-13. |
| WP11 `extraSkillPoints`, `moonRank`, `lineEffects`, counters | see P0-3, P0-4, P1-4. `waystone_jumps` was already reported. |
| core.test.js patch | applied. |
| Client builder needs: start-plot reeds/rocks, hat key, storm drops, first-day weather | start plot P1-3; hats: new action `cosmetic.equip {id}` (deeds.js) sets the public `hat` key and `self.deeds.hat`; lightning now breaks nodes without dropping loot (`clock.js`, `collect: true`); first day clear (P2-21). |

## Found by the pacing bot (fixed)

- `scuttlers.js`: gem nodes inside a Burrow's radius counted as Burrow nodes, so 1/N of all Burrow output was the
  tier's rare (one run held 1,998 magma cores at hour 63). Gem nodes are no longer Burrow ground; Burrows give rares
  only through `BURROW_RARE` (PACING 5).

## Verified live

Real server on port 8120 (world `wp14_server_tmp`, deleted afterwards), two `ws` clients: both get `welcome`,
`world.coop.S` = 2 at once, the next plot costs 94 G (55 x 1.7), the new world opens at t = 150 (day) with clear
weather. Server stopped.

## Tests

`npm test`: 302 passed, 0 failed (16 files). New: `test/pacing.test.js` (model bands over the real data, first plot before
minute 30 with the bot, idle check). `npm run test:pacing` additionally runs the full solo bot to the Drowned Moon;
`TB_PACING_COOP=1 npm run test:pacing` adds the 2- and 4-player crews.
