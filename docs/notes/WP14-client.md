# WP14 client half: notes

Scope: everything under `client/`. Checked live against the real server on port 8121 (headless Chrome over CDP, no
real mouse or keyboard), at 1280x720, 1280x650, 1920x1080 and 2560x1440. `node --check` passes on every client file;
`npm test`: 298 passed, 0 failed.

`docs/notes/WP14-client-needs.md` (patches the server builder wanted from the client) did not exist when this work
finished, so nothing from it was applied.

## BUILD_REVIEW items

| Id | Status | What changed |
|---|---|---|
| P0-1 (client part) | fixed | `ui/panels/tutorial.js`: step 1 counts Driftwood 10 and Fieldstone 6 (the Workbench costs both). Step 3 follows the real path and updates as you go: Reedfiber from reed clumps (x/8) and Fieldstone (x/4), then 2 Rope at the Workbench (`r_rope_hand`), then the Driftwood Blade (or Bow/Staff), then "equip it in the Character panel". The step ends when a weapon is equipped (or at level 5). Played through live: gather, Workbench, rope, blade, equip. |
| P0-2..P0-6 | n/a | server / shared / test |
| P1-1..P1-4, P1-12 | n/a | server |
| P1-5 click-through | fixed | `ui/ui.js` + `ui/widgets.js`: every widget gets the hit rects of the panels drawn above it, and `hover()` is false inside them, so HUD and lower panels never get clicks or hovers that land on a panel above. Modals block the whole screen. Full-screen tool panels can list their own `hitRects` (the build panel lists its bar and palette). An interactive HUD element under the mouse also sets `wantsMouse`, so clicking the hotbar, Treasury or goals does not also swing in the world. Checked live: Journal over the Goal Tracker, no HUD hover under the panel, HUD works next to it. |
| P1-6 top-centre pile-up | fixed | `hud/toasts.js`: the tutorial card and toasts sit in the free band between the HP bars (x 108) and the Treasury/clock column (W - 208), 180-300 px wide. The card grows to fit its text (2-4 lines) and toasts start under it and wrap. `panels/build.js`: the mode/cost bar now sits above the hotbar (and right of the palette on narrow screens); the palette starts below a 3-line tutorial card; the feedback line is drawn above the bar. `hud/clock.js`: the tide countdown follows the word ("High 3:55", was "High3:55"/"TURN0:00") and the day gets its own row ("Day 2", was "D1" over the dial). No overlap at 1280x720, 1280x650, 1920x1080 or 2560x1440. |
| P1-7 colour off by one | fixed | `drawers/player.js` and `panels/title.js` use variant `(c & 7) + 1`. All 8 checked in an offscreen sheet (teal, orange, yellow, violet, blue, green, flesh, grey). |
| P1-8 player layers | fixed | `drawers/player.js` rewritten: `swing_*` (3 frames, plus a 2 px lunge) while attacking or gathering, `roll_*` (4 frames) while dodging, a lying pose when downed, hurt flash, and layers outfit, `pl.weapon.<type>.<tier>` (from `g[1]`), `pl.hat.<id>` (from pub key `hat`, see Needs) and hook. The local player's swing and roll start on the client (`main.js` sets `_swingAt`, `_swingF`, `_dodgeT`, `_face` from the predicted body); other players use `a` and the `at` swing counter. The back-carried weapon is mostly hidden by the body when facing down (WP3 art); it shows facing up and side. |
| P1-9 gather targeting | fixed | `main.js`: the node whose drawn sprite covers the cursor (tree canopies included), else a node base within 1.2 tiles, else (when no enemy is near the cursor and no structure is under it) the nearest node in reach within about 53 degrees of the cursor. Checked live: holding LMB on a tree canopy sent only `gather.swing` and broke the tree. New target feedback: the node or structure the next click hits gets a light outline, and usable things show "RMB  <name>" (`renderer.js` `drawHoverOutline` / `drawHoverLabel`, `view.hover`). |
| P1-10 attack rate + revive | fixed | `main.js`: attacks at `1 / max(0.2, rate * (1 + swingSpeed))` of the equipped weapon (fist 2/s), gathering at `1 / (2 * (1 + swingSpeed))`, each plus 20 ms. Holding RMB on or near a downed crewmate sends `revive {id}` every 0.35 s (the server holds a channel for 0.6 s); downed allies show a pulsing ring and "Hold RMB: revive". Not tested live with two players. |
| P1-11 particle density | fixed | `fx/router.js` multiplies the budget factor by `store.settings.particleDensity`. |
| P2-1..P2-13, P2-15, P2-21, P2-22, P2-24 | n/a | server / shared / test |
| P2-14 frame loop before title | fixed | `main.js` starts the rAF loop before awaiting the title, so the panel manager draws the title (its own fallback loop steps aside). `net` is created after the title; `ui.net` / `__tb.net` are set then. |
| P2-16 draft panel | fixed | `panels/draft.js` closes itself after the last pick animation. Checked live. |
| P2-17 station panel | fixed (client part) | the idle status is now "Idle" (the long text ran into the title); the recipe "+" button only queues when the pack can load at least one craft (else a deny sound). Whether the server counts queued crafts with no loaded inputs is the server's call. |
| P2-18 text clipping | fixed | build cost rows: one row per ingredient with the full name and a right-aligned have/need ("Driftwood 16/10"); clock labels as P1-6; title frame grows when "Continue as" adds a fifth button; Treasury rolling digits land exactly on the value (they overshot sub-1 gaps and read 1 off the Inventory). Also "In your bag (click to equip):" in the Character panel (ran past the frame). |
| P2-19 hidden characters | fixed | `renderer.js` `drawOccludedPlayers`: a player covered by a later-drawn tall node or structure (trees, Tidestone, Kiln, ...) gets a 50% silhouette in their colour on top. |
| P2-20 joiner tutorial | fixed | steps 1 and 3 now follow the castaway's own items/gear; the localStorage mirror is keyed per player token (`tb.tut.<token>`), so a second tab no longer inherits the first tab's progress. |
| P2-23 (client part) | fixed | zone styles for `crater`, `wind_wall`, `undertow`, `soaked`, `puddle`, `verdant_tide` (`drawers/zone.js`); presets `whoosh` and `shrine_chime` (`fx/presets.js`), mapped in `FX_MAP` (`shrine_chime` no longer shows its note index as a floating number); node drawer passes `variant: e.v` and mirrors by entity id. |

### Other drawer contracts from the notes

- Crop drawer: already draws `crop.<id>` with `frame` per growth stage (server stages 0..N map onto the N frames, the last frame is ripe). No change needed.
- Tidegate: `drawers/structure.js` draws `struct.gate_site.s1`..`s5` from `world.tidegate.stage` (ruined site at stage 0; animated, not pinned to frame 0). Not seen live (needs a built world).

### Juice and readability (first 15 minutes)

- Target outline + "RMB  Workbench" style prompts; swing lunge; hurt flash on any player; getting hit yourself adds a 3 px shake and a short red flash (off with "reduce flashing").
- Tutorial card flashes gold when a new step appears and shows live counters.
- Auto UI scale is now 1x only below 540 px tall, 3x from 1300 px (2560x1440 gave a 2x UI with tiny text before), else 2x.

## Needs from server

- **Start-plot materials (P0-1 follow-up)**: a live start plot had 2 `reed_clump` (1-2 fiber each) and 1 `fieldstone_rock`, but the first weapon path needs 8 Reedfiber and 10 Fieldstone (Workbench 6 + blade 4). Please guarantee about 4 reed clumps and 3 fieldstone rocks on the start plot in `worldgen/populate-greenmarrow.js` (next to P1-3's veins and rocks).
- **Hats (P1-8)**: the drawer reads a public entity key `hat` (cosmetic id). Nothing publishes it; an equip action for unlocked `deeds.cosmetics` that sets `entity.set('hat', id)` would show the 21 hat sprites.
- **Ground clutter**: after about 25 minutes of a storm the start plot held 77 resource drops (driftwood, fieldstone, ore, reedfiber) that no player broke, which reads as a mess. If storm lightning breaks nodes, consider not dropping their loot on the ground, or merging/despawning sooner.
- P2-21 (start at morning, clear weather) is still visible: the first minutes ran into night and rain.

## Screenshots

`C:\Users\Carl\AppData\Local\Temp\claude\61116aaa1e7f93f5\bf265a22-cd81-462e-94d7-957c1cfd8239\scratchpad\shots\wp14\`:
before `b00-title.png`, `b01-new.png`, `b02-ingame.png`; after `a05-crop.png` (canopy outline), `a07`/`a11` (build palette), `a12-ghost.png` (bar above hotbar), `a13-placed.png`, `a15-wbhover.png` ("RMB  Workbench"), `a16-craft.png`, `a18-blade.png`, `a20-inv.png`, `a22-sheet.png` (8 colours, swing/roll, layers), `a24-levelup.png`, `final-1280x720.png`, `final-1280x650.png`, `final-1280x650-build.png`, `final-1920x1080.png`, `final-2560x1440.png`.
