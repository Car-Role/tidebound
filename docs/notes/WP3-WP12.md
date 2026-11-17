# WP3 (Sprite art) and WP12 (FX and audio) — notes

All art is generated in code from the master palette at boot (about 1,050 sprites, about 2,700 frames; the atlas
builds in 65-90 ms in Chrome, generation + parse about 180 ms in Node). Audio is fully synthesised (WebAudio).
Tests: `node test/run.js sprites` (9 pass), `node test/run.js fx-audio` (10 pass).

## Files

| File | What |
|---|---|
| `client/art/gen/paint.js` (new, WP3) | char-grid painter `Px`: rect/ellipse/ball (lit sphere)/poly/line/bevel/outline/rotate/scale/cut, `solid()`, `TIER_METAL` |
| `client/art/gen/build.js` (new, WP3) | building toolkit: planks, masonry, roofs, posts, flames, glows, pipes, crates, runes |
| `client/art/gen/big.js` | Beacons 1-6, Tidestone, Archive, Tide Board, Tidegate site + 5 stages, arena, Vault/Trench entrances, shrine, dig spot |
| `client/art/gen/biomes.js` | ground generators for every `TILE_NAMES` entry + `dungeonTiles` per Vault tileset (+ `trench`) |
| `client/art/gen/player-parts.js` | `pl.body` (+ swing/roll anims), outfits, hats, hooks, weapons |
| `client/art/sprites/*.js` | items, nodes (+ crops), structures, machines, mobs, bosses, npcs (+ player parts), icons, decor |
| `client/fx/presets.js` | all 126 preset names + `_helpers` |
| `client/fx/router.js` | `FX_MAP`, juice, budget, decals |
| `client/fx/ambient.js` | ambient particles, weather, entity loops, music/ambience/listener director |
| `client/audio/{audio,sfx,music,tracks,ambience}.js` | synth engine, 98 SFX, sequencer, 13 tracks, noise beds |

## Sprite id contracts (for drawer / UI owners)

- `item.<id>` 16x16 for all 262 items. `node.<id>` (trees 16x32, obsidian spire 16x24, vault crystal 16x24) with
  3 palette `variants` each: drawers may pass `variant: e.v` (0 = base). The node drawer currently only mirrors.
- `crop.<id>`: `frames` with one frame per growth stage (frame index = `st`), `fps: 0`. WP9 crop drawer: `draw(..., { frame: e.st })`.
- `struct.<id>` for all 74 structures, size `w*16 x (h*16 + extra)`, anchor bottom-centre of the footprint.
  Animated ones use `frames`: frame 0 = idle/off, the structure drawer already pins frame 0 when `on === 0`.
  Directional machines: `struct.<sluice_k|spillway|splitter|grabber|filter_grabber>.r0..r3` (r0 east, r1 south,
  r2 west, r3 north); draw by `e.rot`. Extras: `struct.gate_site.s1..s5` (Tidegate stages; `struct.gate_site`
  is the ruined site, s5 animates the portal), `struct.beacon_<k>.unlit`.
- `mob.<id>`: anims `idle`(2) `walk`(4) `windup`(2) `attack`(2) `hit`(1), facing right, `mirror: true`.
  16x16; radius >= 0.6 -> 24x24; frostbulk 32x32. The WP5 mob drawer can pick the anim from `state`.
- `boss.<id>`, `boss.<id>.p2`, `boss.<id>.p3` (phase looks; use `ph` 0-2): anims `idle`(2) `attack`(2) `hit`(1),
  `mirror: true`, anchor `[size/2, size-1]`. Wardens 64 (Glacier Antler 72), Keepers 48-56, Drowned Moon 80.
- `npc.<id>` 16x20: anims `idle`, `talk`, `idle_side`, `mirror: true`.
- Player: `pl.body` (overrides core, same 8 shirt variants) now also has `swing_down|up|side` (3) and
  `roll_down|up|side` (4). Overlays with identical anim layout: `pl.outfit.<class>` (6), `pl.hat.<cosmetic>`
  (20 deed hats + `moon_shard_crown`), `pl.hook.<1..7>` (+ `pl.hook.hook_<n>` refs + 10 hook-skin cosmetics
  `pl.hook.cos_d_*`), `pl.weapon.<blade|bow|staff>.<1..7>` (carried on the back). The player drawer (WP1) already
  draws `pl.outfit.<cl>` and `pl.hook.<g[0]>`; hats/weapons need a line there (WP13/WP14).
- Icons, 16x16, anchor `[0,0]`: `icon.ability.<id>` (abilities.js `icon`), `icon.card.<id>`, `icon.tag.<tag>`,
  `icon.skill.<id>`, `icon.branch.<b>`, `icon.status.<id>`, `icon.buff.<BUFF_ID>` (item buffs ref the item art),
  `icon.element.<id>`, `icon.class.<id>`, `icon.weather.<id>`, `icon.rarity.<r>`, `icon.blessing.<id>`,
  `icon.rebirth.<id>`, `icon.archive.<wing>`, `icon.ui.<name>` (glint heart surge xp flux gear map journal deck
  skills inventory build close check lock plus minus star trash sort quest turnin chat party settings warning
  clock tide_low tide_high sun moon info ping_need ping_danger ping_look ping_omw arrow_l/r/u/d hand fish crown).
- Generic-drawer ids (`<type>.<kind>`): `helper.scuttler` (anims idle/walk/carry), `helper.scuttler.<cos_d_*>`
  (scuttler hats), `helper.gull` (fly/idle), `summon.turret_pocket|sproutling|battle_scuttler|tide_pup`,
  `chest.chest|sea_chest|tide_cache` (anims closed/open), `proj.<kind>` (arrow bolt seed thorn rock prism_shard
  lava_blob ink icicle sleet bog_orb brine_bolt spark note bomb orb_<element>; facing east, centre anchor — rotate by
  `a`), `bobber.bobber` (idle/bite).
- Decor: `decor.flower_<biome>_<0..2>`, `decor.tuft_<biome>`, pebbles, shell, driftwood, bones, mushroom,
  ice_crystal, glass_shard, ink_puddle, ember_crack; flat decals (no outline): footprint, footprint_snow, scorch,
  crack, puddle, wet, `splat_<green|teal|orange|violet|red|blue>`; FX sprites: crab gull leaf(_gold/_ash/_ink)
  feather coin gear note flake fish_sil bubble banner chain glint wrench flame.
- Tiles: `gen/biomes.js` `tiles[ground]` share border noise between variants, so tiles join seamlessly.
  `dungeonTiles[tileset] = { floor, wall }` uses the same `(g, rng)` contract; WP10 can build them with
  `makePainter(seed)` from `art/tilegen.js` (TileSet only builds `TILE_NAMES`).

## FX / audio contracts

- `game.fx(realm, name, x, y, params)`: `name` = any preset name (126), or a sound/event name in `FX_MAP`
  (`tap_*`, `clink`, `ability_<class>`, `pickup`, `pickup_rare`, `hurt`, `death`, `crit`, `levelup`, `thunder`,
  `turret_shot`, `fish_bite`, `fish_cast`, `boss_roar`, `warp`, `eclipse`, `moonfall`, `deny`). Unknown names emit
  a generic puff and try the same-named SFX.
- `params` (all optional): `dir`/`angle` (radians; aims hit chips, waves, beams), `color` (palette char present in
  the preset), `blood` (green|teal|orange|violet|red|blue), `elem`, `scale`, `count`, `target {x,y}` or `tx,ty`
  (homing / implode / chains), `dmg`|`amount`|`n` + `style` (dmg|crit|heal|xp|glint|miss) or `text` -> floating
  number, `crit: true` (adds crit spark + shake), `pitch`, `vol`, `silent`, `self` (false = no hitstop for others).
- Juice per DESIGN 19: hits 40 ms hitstop + 2 px shake, crit 6 px, node break 3 px, boss phase 300 ms freeze +
  flash, level up 150 ms slow-mo, boss death slow-mo + white-out, plot rise 10 px rolling shake.
- Budget: bursts scale down from 2,000 live particles to 15% at 3,500; cosmetic presets (footsteps, weather,
  ambient, auras, status loops) are dropped first. `router.budgetScale(name)` is exported.
- Decals: `particles.setHooks({ decal })` is registered by the router; decals are ground-layer sprite particles.
- UI-anchored motes (`xp_mote`, `glint_burst`, `mint_coin`, `card_pick`) home to approximate screen anchors
  (XP bar bottom-centre, Treasury top-right, deck top-left) computed from `window.__tb.renderer.view`.
- `ambient.update` drives audio: listener = camera centre, `audio.music(biome | vault | trench | boss | moon |
  raid | title, { night })`, beds `surf` (water near the camera, quieter at low tide), `wind`, `crackle`, `rain`,
  `storm`, `fog`, `heat`, `eclipse`, `cave` (non-overworld). It reads `world.clock.w[biome][0]` (WP7 shape) with
  `clock.weather` as fallback, and `world.raid.active` for the raid track (guess; WP5/WP7 please confirm the key).
  Status particles read the mob `st` bitmask with bit i = `registries.STATUSES[i]` (burn 0, bleed 1, chill 2, freeze 4).
- Audio API additions: `audio.loop(name, level) -> { set, stop }` (for `kiln_loop`, `machine_hum`),
  `getVolume`, `mute`, `stopAll`, `has`, `state()`; `music('id:night')` also selects the night variant.
  Volumes persist in localStorage `tb.audio.vol` (categories master, sfx, music, amb, ui). WP13's settings panel
  can call `audio.setVolume(cat, v)`.
- Tracks: title, greenmarrow, saltfen, emberreach, glasswaste, hoarfrost, umbral, vault, boss, trench, tidegate,
  moon, raid; boss/moon/raid add an arpeggio channel. Melodies A A' B A per 8 bars, A fixed per track.

## Deviations

- Tidegate stages are separate sprite ids (`struct.gate_site.s<n>`) rather than generic `struct.<id>` frames,
  because the structure drawer pins frame 0 when `on` is 0.
- `pl.body` is overridden from WP3 (allowed: index.js merges core first) to add swing and roll anims; the idle/run
  frames and the 8 shirt variants are unchanged.
- Weather rain/snow use short `spark` particles instead of `streak`: the engine draws streak length as
  velocity x 3 px, so fast streaks became 60 px lines.
- Glasswaste's wood node `spinewood_cactus` is drawn as a fused-glass prism tree (TECH_SPEC art brief).

## Needs from others

- **WP1/WP14 (player drawer)**: draw `pl.hat.<cosmetic>` and `pl.weapon.<type>.<tier>` layers, and use
  `swing_*` / `roll_*` anims when `e.a` is `swing` / `roll` (the parts are ready). Also pass `variant: e.v` in the
  node drawer to use the node palette variants.
- **WP9**: `client/ui/panels/market.js` currently has a syntax error (line 103), which stops the whole client from
  booting. I verified in the browser by stubbing that one file through DevTools request interception only.
- **WP1 (particles.js, optional)**: emit() passes `opts` (including `count`) on to sub presets; a per-call count
  therefore also forces the sub presets' counts. The router only sets `count` when asked or when over budget.
- **WP5/WP7**: confirm the world key for an active raid (`world.raid.active` assumed) and the mob status bitmask
  order (registries.STATUSES assumed).

## Screenshots

Under `C:\Users\Carl\AppData\Local\Temp\claude\61116aaa1e7f93f5\bf265a22-cd81-462e-94d7-957c1cfd8239\scratchpad\shots\`:
`items.png`, `nodes.png`, `tiles.png`, `structs.png`, `machines.png`, `mobs.png`, `mobs_frames.png`, `bosses.png`,
`player_parts.png`, `decor.png`, `icons.png` (offline sheets) and `game_world.png`, `fx_grid.png`, `fx_big.png`,
`fx_storm.png`, `fx_blizzard.png`, `art_mobs_bosses.png`, `art_structures.png` (live headless Chrome on port 8101).
