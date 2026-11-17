# Tidebound build review (after WP1-WP13)

Reviewed 2026-11-17 against DESIGN.md, PACING.md, TECH_SPEC.md and the builders' notes. No code was changed.

## Verdict: FIX THEN SHIP

The build boots, plays, syncs two players, saves and reloads, and runs fast. Nothing crashes. It is not at the
user's bar yet for four reasons: the first fifteen minutes send a new player into a fight they cannot arm for,
several reward systems are shown to the player but wired to nothing, co-op cost scaling can be avoided, and no
test checks the 100 hours.

## How this was checked

| Check | Method | Result |
|---|---|---|
| `npm test` | run | 297 passed, 1 failed (`core.test.js` vault realm size, known) |
| `node --check` on all 292 .js files | script | clean (the `market.js` syntax error is gone) |
| New-player start | real server on port 8110, headless Chrome driven by real key and mouse events over CDP | title, join, gather, level-up draft, Workbench, Kiln, `q01`, plot raise, first enemy all work; problems listed below |
| Two players | second browser tab | both see each other, name tag, party frame, shared structures, Treasury and quest |
| Save / restart | both players left, server process killed, restarted from `saves/review_tmp.json`, "Continue as Ada" | position, inventory, level, XP, cards, pending draft, skill points, structures, Kiln queue and fuel, Glint, main quest, clock: identical |
| Save round trip, built world | in-process harness: 81 plots, 1,625 entities, machines, cards, skills, gear, board quest | identical after reload, except the note in P2-12 |
| Server tick | harness and live | 0.22 ms average with 81 plots and 2 players; 0.51 ms (max 4.2 ms) with 4 players and 150 mobs. Budget is 50 ms |
| Client frame | `renderer.frame` timed in Chrome, 1280x800 | 0.8 ms average; 1.2 ms (max 1.7 ms) with 60 mobs on screen |
| Needs-from-others, pacing levers, exploits | two code audits with harness scripts; I re-checked the "no consumer" findings by grep | see P0-P2 |

Not checked: anything past the first raised plot through the real UI (dungeons, bosses, automation panels,
fishing, farming, Rebirth), audio, more than two live players, the Ctrl+C save path. The pacing numbers in P1-1
to P1-3 are estimates from reading code and data, not from a played run.

Screenshots: `C:\Users\Carl\AppData\Local\Temp\claude\61116aaa1e7f93f5\bf265a22-cd81-462e-94d7-957c1cfd8239\scratchpad\shots\review\`
(file names are given per finding). Scripts: the `review`, `review-needs` and `review-pacing` folders beside it.

## P0 blockers

**P0-1. The first fight cannot be armed for, and the tutorial tells the player to craft an item they cannot make.**
Seen live: tutorial step 3 says "craft a Copper Blade". The item is called Driftwood Blade, it needs 2 rope
(`shared/data/recipes.js:94`), rope needs the Loom (`recipes.js:72`) and the Loom needs level 4
(`shared/data/structures.js:20`). I raised the first plot at level 3 with fists (3 damage,
`server/game/systems/combat.js:24`), met an elite Burrowgrub (104 HP, 8% elite chance) and died twice in 45 seconds.
- `shared/data/recipes.js`: add `r('r_rope_hand', 'rope', 1, [i('reedfiber', 4)], 'workbench', 4)` (or drop rope from the three tier-1 weapon recipes).
- `client/ui/panels/tutorial.js:22`: say "Driftwood Blade", and mention the reeds.
- `server/game/systems/mobs.js` (elite roll near line 59): no elites while fewer than 3 plots are owned.

**P0-2. Card, set, class and castaway-line effects never reach gathering, fishing, market or tempering.**
- `server/game/systems/inventory.js` `effectsOf` (line 87): return `game.effects.of(player)` when `game.effects` exists; keep the current gear + skills body as the fallback.
- `server/game/systems/quests.js` init (near line 780): add `game.effects.addSource('lines', (p) => pq(p).effects)`. Today `lineEffects` has no caller, so Brannick's temper discount (`gear.js:222`) and Ysolde's rare-fish bonus (`fishing.js:111`) do nothing.

**P0-3. Moon Chart effect perks do nothing.** `moonRank` (`rebirth.js:333`) has no caller. The long-term upgrade
layer sells four perks that have no code.
- `cards.js` draft generation: offer size + rank of `moon_draft` on levels divisible by 10.
- `rebirth.js` reset: keep `moon_keep` chosen cards.
- `bosses.js:384`: trinket count + rank of `moon_trinkets`.
- `scuttlers.js:27`: `maxTier + moonRank(player, 'moon_scuttler')`.

**P0-4. The Archive wing skill point is announced and never granted.** `archive.js:70-71` toasts "+1 skill point";
`skills.js` `pointsOf` (line 26) never reads `extraSkillPoints`. In `archive.js` on wing completion call
`game.call('grantSkillPoint', null, 'wing:' + wing.id)`.

**P0-5. Co-op cost scaling can be avoided, and a new crew pays solo prices for about two hours.**
Seen live: with two players online `world.coop.S` stayed 1 and the next plot stayed 55 Glint. In code
(`coop.js:138-157`) S is recomputed hourly and applied an hour after the notice; `unbind` (`coop.js:317-321`)
zeroes a player's minutes with no cooldown, so the host can hold S at 1 for the whole game. Node respawn also
uses S, so four new players share one node per 6 seconds on the start plot.
- `coop.js` `onJoin`/`load`: while world `playtimeS` is under 2 h, set S to the number of connected players at once.
- `coop.js` `unbind`: refuse players who are online, or re-bind after 5 minutes online.

**P0-6. Nothing tests the 100 hours.** `shared/rules/pacing.js` returns `{hours: 0}`, `test/bot/pacing-bot.js` is
4 lines, `npm run test:pacing` matches no file. `docs/pacing-model.mjs` passes but uses copied constants. WP14 must
port the model to read `shared/data` and `shared/rules` and fail outside 85-115 h, as PACING section 10 says.

## P1 important

Pacing (estimates, see "Not checked"):

1. **Automation has no world ceiling.** Burrows count nodes without using them up (`scuttlers.js:39-44`), Drills need no nodes (`producers.js` `tickDrill`), the only cap is 8 machines per plot (`machines.js:238`). Estimated late-game gathering falls from about 15 h to about 5 h for a factory player. Add a world cap in the place validator (`machines.js` near 247): Burrows <= 2 + 2 x lit Beacons, Drills <= 2 x lit Beacons.
2. **Glint does not bind early.** Selling works at any castaway or Market Stall; 100 Copper Ballast paid 507 G in the harness while all 8 Greenmarrow plots cost 585 G, and PACING assumes no sales before hour 22. Gate `market.sell` (`market.js` `sellItems`) behind Beacon 1, or update PACING 4.2 to say Ballast is the only early clock.
3. **Copper is too rare at the start.** `copper_vein` is weight 10 of 60 and drops 2. Seen live: 14 node breaks in a row with no vein, and the 12-node start plot fills with trees and bushes so nothing else respawns until they are cut. Raise the weight to 16-18 in `shared/data/nodes.js`, and have `worldgen/populate-greenmarrow.js` guarantee 2 veins and 4 rocks on the start plot.
4. **Six Logbook deeds are unobtainable.** Add `game.call('counter', ...)` at `gear.js:254` (`tempers_done`), `cards.js` reroll near 219 (`rerolls_used`), `machines.js` `refillTend` near 221 (`tend_refills`), `death.js` revive (`allies_revived`), `raids.js:118` (`raids_survived`, player null), tidal node break during a king tide (`king_tides_worked`).

Client, seen live:

5. **Clicks pass through panels to the HUD.** Clicking "Add fuel" in the Kiln panel also clicked the Goal Tracker under it and opened the Journal (`34-queued.png`). In `client/ui/ui.js`, HUD widgets must not get mouse input where an open panel covers them (set `clickConsumed` before the HUD pass).
6. **Top-centre HUD pile-up.** The tutorial banner overlaps the Treasury and clock, the build-mode hint is drawn over the tutorial text, and quest toasts stack on both (`05-ingame.png`, `19-ghost.png`, `44-raise-b.png`). Move the tutorial (`panels/tutorial.js:119`) below the top row or to the left, put the build hint above the hotbar, and start toasts under the banner.
7. **Player colour is off by one.** Violet shows a yellow shirt, orange shows teal (`04-named.png`, `32-p2-view.png`). `client/render/drawers/player.js:37` and `client/ui/panels/title.js:197`: use `(c & 7) + 1`.
8. **The player has no attack or dodge body animation and no visible weapon or hat.** `drawers/player.js:35-41` ignores `swing_*`, `roll_*`, `pl.weapon.*` and `pl.hat.*`, all of which exist in `art/gen/player-parts.js`.
9. **Gathering needs the cursor within 1.2 tiles of the node's base.** Clicking a tree's canopy sends `attack`, not `gather.swing` (`client/main.js` `targetAt`). Hit-test the sprite bounds, or when no hostile is under the cursor pick the nearest node in reach toward the cursor.
10. **Attack rate is fixed at 0.5 s on the client** (`client/main.js:23`); bows and staves get `cooldown` replies. Use `1 / (rate * (1 + swingSpeed))` of the equipped weapon. Also send `revive {id}` when interacting with a downed ally.
11. **The particle density setting does nothing.** `client/fx/router.js:116`: multiply the count factor by `store.settings.particleDensity`.
12. **`gathering.js` ignores two node flags.** Deny the swing when `node.data.tapped`; pay `node.data.glint ?? cacheGlint(...)` at line 57 so the first tide cache is the promised 15 G.

## P2 polish

1. `PASSIVE_ACTIONS` (`shared/protocol.js:102`): add `chat.say`, `settings.set`, `quest.pin`, `inv.sort`, `inv.hotbar`, `ping.mark`, so they do not refresh Tending.
2. `machines.js:137-141`: clamp Overclock inside the x3.0 cap, `Math.min(MACHINE_SPEED_CAP, base * over)`.
3. `mobs.js:393`: `glintMult` is applied twice on mob Glint (again in `land.js:109`); pass 0 here.
4. `archive.js:35-38`: donations work from anywhere until the Archive plot exists; return `false` with no `archive` structure.
5. Tide Board pays about 7x the modelled rate (3 contracts per 24-minute day per player, not scaled by S); refresh every 3 days or share one set per world.
6. `stations.js:164`: Ballast gives full craft XP (about 576k for tier 5 against 247k modelled); set Ballast to half or zero XP.
7. `nodes.js:315`: use `nodeRespawnInterval()` from `shared/rules/scaling.js` so the 0.5 bonus cap applies.
8. `drip_collector`, `sap_tap`, `creel`, `hum_hive` are untended and uncapped; cap 4 producers per plot.
9. Market `SAT_FLOOR` 0.05 (`shared/rules/constants.js:83`) still lets one good earn 1.66x the cap at 60 units/min; use 0.01.
10. `dungeons.js:355-358` never charges a Trench key, so the `trench_no_key` flag is meaningless.
11. Shallows Walker (`procs.js:693`) sets `player.walkShallows` but neither movement file reads it; `game.procs.dropHooked` is never set; Riptide Mark's `noHealUntil` is not honoured in `combat.js` `dealHeal`.
12. After a rejoin the `cards` self key shows 0 Tide Tokens until the next card update (tokens are inventory items; send `cards` after the inventory loads).
13. `save.js`: set `game.nextEntityId` before restoring nodes (line 113) and save `biome` per plot (line 50); both are only worked around in `land.js`.
14. `client/main.js:62-66`: start the frame loop before awaiting the title; today the title runs its own loop.
15. `test/core.test.js` "movePlayer sends the realm message": update the vault size expectation.
16. Draft panel stays open on "No drafts waiting" after the last pick, and other panels open on top of it (`14-picked.png`, `15-build.png`); close it after the pick.
17. Station panel: the title is drawn over the hint text when idle (`33-kilnpanel.png`); the queue counter rises on clicks that load no inputs (queue showed 12 with ore for 6).
18. Build palette cost text is cut ("Driftwoo 9/10", `16-hoverwb.png`); clock label collides ("TURN0:00", "High3:56"); title menu with "Continue" overflows its frame (`40-title-return.png`); Inventory shows a different Glint than the Treasury by 1.
19. Characters vanish behind the Tidestone, trees and the Kiln; draw a silhouette or fade the occluder.
20. A player who joins a progressed world starts the tutorial at step 7 of 9 (`31-p2-ingame.png`); use per-player state for the first steps.
21. The world opens at dawn in rain and reads dark (`05-ingame.png`); start at morning with clear weather for the first 4 minutes.
22. Mobs walk onto the start plot although they cannot spawn there; the first tide cache vanished within a minute, before the tutorial mentions it.
23. Zone kinds `crater`, `wind_wall`, `undertow`, `soaked`, `puddle`, `verdant_tide` have no style in `drawers/zone.js:164`; presets `shrine_chime` and `whoosh` are missing; node drawer ignores palette variants (`drawers/node.js:19`).
24. `structureDiscount` service (`classes.js:173`) has no caller; DESIGN.md:1083 still has the `q13` typo.

## What holds

- No softlock and no duplication found: a greedy bot reached the first raise on five seeds; negative, fractional, NaN and huge quantities, drop/pickup, craft cancel and build/remove all conserved items.
- Land cost, Ballast table, yield cap, XP split, machine speed cap, per-plot machine cap, Tending, empty-server pause and Beacon gates match the constants.
- All services, protocol actions and bus events resolve; 108 of 110 FX presets and every sound name exist.

## What is good

- The world looks like a finished pixel-art game: tiles, the Tidestone, Kiln, vault entrance, night lighting and rain are all code-made and read well.
- The loop is juicy where it is wired: swing arcs, pickup feed, level-up banner, plot-raise wave, damage numbers and telegraphs.
- Multiplayer works out of the box, including "Continue as Ada" on the title after a restart.
- Performance has a very large margin on both server and client.
- The data layer is validated at start and the unlock order is machine-checked.
