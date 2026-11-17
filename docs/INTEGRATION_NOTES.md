# Integration notes

Each work package appends its own section. WP14 resolves the items.

## WP2

Files: `shared/data/registries.js`, `schema.js`, all content tables (`items`, `recipes`, `structures`, `nodes`, `biomes`, `enemies`, `bosses`, `cards`, `skills`, `classes`, `abilities`, `crops`, `fish`, `weather`, `dungeons`, `blessings`, `quests`, `npcs`, `archive`, `deeds`, `rebirth`, `affixes`, `shops`), `shared/rules/{constants,xp,costs,combat,loot,draft,market,scaling}.js`, `test/data.test.js`, `test/rules.test.js`. Numbers follow DESIGN.md as revised on 2026-11-16 (Ballast 10n/90/160/200/380/1,000, `q01` 60 G, biome weather table).

### schema.js API (for WP1 `shared/data/index.js` and everyone)
- `validateContent(content, extras?)` returns `string[]` (empty = valid). With no `extras` it reads named exports from `content.modules` (as built by `index.js`), so `index.js`'s current call already works.
- `validateTable(name, rows, content?, extras?)`, `assertValid(content, extras?)`, `TABLE_NAMES`.
- `reachability(content, extras, { beacons, level, trench })` returns the sets of obtainable items, buildable structures, killable bosses, clearable Vaults, completable quests and castaway lines in a world state. `checkUnlockOrder(content, extras)` runs it per gate. WP14 can reuse both for the pacing test.

### Applied spec patch (CRITIQUE Re-review R4, from the coordinator)
1. **`when` on Mod**: optional condition id from `registries.CONDITIONS`: `night`, `day`, `rain`, `shallows`, `shallows_or_rain`, `low_tide`, `low_hp`, `in_dungeon`. Used by `c29` (night), `c30` (day), `r05` (night, also in `worldMods`), `u14` (`cacheChance` at `low_tide`), `barnacle_charm` (`shallows_or_rain`), `deep_lantern` (`in_dungeon`). **WP1a statbook** must evaluate `when` (re-check on `clock.phase`, `weather.change`, `tide.change`, 1 Hz for `shallows`/`low_hp`/`in_dungeon`).
2. **`flags: string[]`** on cards, card sets, skills, items (trinkets, gear, buffs), blessings, class passives, rebirth perks, weather and NPC line rewards, from `registries.FLAGS` (each has a one-line meaning there). The list: `dig_minimap`, `crit_overflow`, `fire_immune`, `ore_minimap` (H4), `no_shallows_slow` (H5), `no_wither` (H11), `refund_full` (F4), `no_knockback_attacking` (C6), `second_weapon` (C11), `map_reveal` (T3), `hud_timers` (T4), `second_calling` (T9), `wayfarer` (T11), `lava_immune`, `chill_immune`, `freeze_immune`, `burn_immune`, `cache_minimap`, `reveal_ambushers`, `dodge_crit`, `ability_kill_surge`, `summons_scale_power`, `gem_spawn_boost`, `ally_regen`, `summon_hp`, `crop_aura`, `start_burrow`, `eclipse_cards`, `trench_no_key`, `lightning`, `wet`, `low_visibility`, `chill_meter`, `elites_guaranteed`, `king_tide`, `mirage_spawns`, `storm_fish`, `dig_glow`, `ambush_x2`. **WP1a statbook** needs `game.stats.hasFlag(player, flag)`.
   Numeric non-stat effects use `effects: [{ id, ...params }]` with ids and allowed params in `registries.EFFECTS` (e.g. `token_per_levels`, `elite_loot`, `kiln_queue`, `creel_bonus`, `rare_fish`, `ally_aura`, `shop_restock`, `burrow_near`, `start_item`). This is a WP2 addition beyond R4 item 2; WP6a/WP6b/others read the ids they own.
   Three player stats were added per R4 item 1: `cacheChance` (u14), `chestLoot` (u22), `weatherBonus` (T7).
3. **Generators** are only `machine: { type: 'generator', flux: <OUTPUT>, fuelPer10s, cond }`; no separate `generator` block. For every other machine type `machine.flux` is demand.
4. Stale TECH_SPEC examples ignored, registries win: skills keep an informational `unlocks: [structure ids]` (no `struct:` prefix; the authority is the structure's `unlock: ['skill:F5', ...]`, and `data.test.js` checks both directions agree); sets are 3/5/7; blessing `bl_chain` uses proc `ricochet`; Bulwark threat is `{ stat: 'threat', op: 'mul', v: 1.0 }`; goal kinds per registry.
5. `disableStructure` vs `disableMachine`: not in WP2 files; noted for WP5/WP8 (raids call `disableMachine`).
6. **For WP1 (protocol is theirs):** `ping.mark` payload gains `kind`, one of the four ping-wheel presets. The coordinator named them `go`, `danger`, `loot`, `help`; CRITIQUE R4 item 6 names them `need`, `danger`, `look`, `omw` (DESIGN A.9: "need this", "danger", "look here", "on my way"). WP1/WP13 should pick one set; DESIGN A.9 matches the CRITIQUE names.
7. Biome weather weights: DESIGN 4.6 now has the table; `biomes.js` uses it verbatim (Umbral eclipse 10). Night eclipse override 5% in biomes 1-5 (`NIGHT_ECLIPSE_CHANCE`) and king tide every 3 days are in `biomes.js` / `weather.js`. The coordinator's fallback rule was not needed.

### Integrity errors found in DESIGN
- **`q13` typo**: DESIGN 16.1 says "Raise 300 Glasswaste plots, 3,000 G". Glasswaste has 15 plots, and PACING 4.2 states main-quest Glint totals 14,140, which only holds with **3 plots and 300 G** (digits swapped). Data uses 3 / 300; `data.test.js` asserts the 14,140 total. Please fix DESIGN.
- **Onboarding vs recipes (DESIGN 23 step 2 vs 6.4/6.2)**: "Build Workbench. Craft Blade." but gear is made at the Anvil (level 6) and the tier-1 weapon needs 2 `rope`, which needs the Loom (level 4). Data puts tier-1 weapons (`blade_1`, `bow_1`, `staff_1`) at the **Workbench** (deviation from 6.4, follows 23) but keeps the rope, so the first weapon still needs level 4. Designer decision needed (e.g. a hand recipe for rope, or drop rope from tier 1).
- **Market floor breaks the per-good cap at high volume**: with floor 0.05 the steady state is `120 * value`/h only while the decay equilibrium stays above the floor, i.e. up to about 45 units/min of one good. At 60 units/min the floor binds and one good earns about 1.66x the cap (`rules.test.js` asserts the cap holds at 2-30/min and documents the overshoot at 60/min). Ledger Post (20/min) and Mint (30/min, shared entry) are under the line; a Market Stall dump or several Ledger Posts on one good are not. Suggest floor 0.01 or a per-good minute rate cap.
- **Seed and tonic gaps**: `saltbloom` and `cindercap` say "used in tonics" but no tonic recipe uses them (they are only Archive items and Cindercap is fuel). Mudroot's seed source "Saltfen grass drops" names no node (Saltfen has no grass node). Glassgourd's seed source "dig spots" conflicts with A.5 (dig spots hold relics and fragments only). "storm-only fish" (weather table) has no fish in the 30.
- No softlock found: the unlock-order test passes for Beacons 1-6 and Tidegate stages 1-5 (including every castaway line, the hook for each biome, and all 8 Archive wings). It does catch the old B1 bug (Rime Bench at Beacon 5) when that is re-introduced.

### Content filled in by WP2 (not stated in DESIGN)
- Item values: Ballast = input value (8/15/33/61/119); seeds `floor(crop value / 3)` (min 1); dishes and tonics derived from shop prices at 3x (reed_bread 10, tonic_haste 27, tonic_surge 200) and interpolated for the rest; gear `5 * 2^tier`; keys, cores, trophies, relics, lures, tokens 0 (not sellable).
- Item tiers for processed goods and components (used for Archive XP and Autobench tiers): plank/brick/charcoal/rope/cloth/glass/gear_part/sluice_board 1, leather/nail/iron_plate 2, flux_coil 3, lens/prism_circuit 4, cryo_cell 5, hollow_core 6; relic tiers by biome of origin.
- Names: weapons/armor by tier material ("Copper Blade", "Bog-Iron Helm"), packs, lanterns, lures, Ballast I-V.
- Staff element by tier: none, tide, ember, storm, frost, hollow, hollow.
- Rods: `rod_k` gives `fishBite -0.15 * (k-1)` ("each ... -15% bite time" read as relative to `rod_1`).
- Recipe times not in DESIGN (components, gear, food, keys, lures, seeds); Ballast recipes 6 s (CRITIQUE B12); `glassgourd -> 2 glass` Kiln fuel 1.
- Kiln data order is first-match order: Ballast and alloys first, then bars, glass, bricks, charcoal.
- Station chains (`STATION_TIERS`): a recipe for `kiln`/`workbench`/`anvil` runs at that station or any higher tier of the chain.
- Placeable items: `grabber` (needed by `filter_grabber`'s cost; recipe at the Anvil with the Grabber's cost and unlock), `autobench_1` (Sootwren reward), `worldseed_sapling` (e05).
- Natural world structures added to `structures.js` with `natural: true`: `tidestone`, `archive`, `tide_board`, `gate_site`, `arena`, `vault_entrance`, `trench_entrance`, `shrine`, `dig_spot`, plus `sapling`.
- Beacons: the Warden trophy is an unlock (`boss:<warden>`), not consumed (trophies also feed `wing_bestiary`). Attunement is left to WP7.
- Tidegate stages are `TIDEGATE_STAGES` in `structures.js` (wings 4/4/6/6/8, Trench 10 for stage 5, moonpetal unscaled).
- Node spawn weights, big-node chance 0.08, tidal weights (shellbed 48, sandbar 48, cache 4 = 4%); seed drops: `seed_mudroot` 5% from `kelp_tangle`, `seed_cindercap` 5% from `ashwood_tree`, `seed_pinecone_pale` 5% from `palewood_pine`; Glasswaste dig fragment spots also hold 1 `seed_glassgourd`.
- Enemy `aiParams` values (cooldowns, distances), armor for armored enemies, Keeper hit damage, Warden trinket chance 0.5 (guaranteed in hard mode), Keeper trinket chance 0.5, `riptide_mark` range 8, several ability ranges, `r15` burn 30%/3 s, `prism_eye` blind 3 s, `frost_bead` chill max 5, `bl_chill` duration 2 s, `bl_spark` range 3, ember 7-set radius 2, storm 5-set chain mult 0.7.
- Moon Chart perk names and ids; 1-rank perks cost 1 shard; "+2 inventory rows" = +16 slots.
- Drowned Moon phase thresholds 1 / 0.75 / 0.4167 (from the 300k/400k/500k phase HP).
- Producer/turret details: Drip Collector, Sap Tap, Hum Hive 4 slots; Trawl Buoy 8 slots, 15 s interval (4/min); Arc Spire rate 1/1.5 s; which structures count toward the machine cap (`countsToCap`: automation except Sluice/Spillway/Grabber/Filter Arm/Splitter/Hopper, plus generators and turrets) and which are tended (`tend`).
- NPC dialogue lines are original filler.

### Interpretations other packages must know
- Card ranks: `mods`/`worldMods` multiply by rank; a proc's `scale: [param names]` lists the params that multiply by rank; `perRank` (array of length `max`) replaces everything with absolute values. `rules/draft.js` `cardAtRank` implements this.
- `proc` may be an object or an array of procs (m07, `bl_chill`).
- `periodic_lightning`: with `on: 'tick'`, `interval` is seconds (m04; `storm_vial` uses `range: 0` = arms the next hit every 5 s); with `on: 'hit'`, `interval` counts hits (Storm 7-set, every 20th hit).
- `node_bonus_drop` `item: 'rare_of_tier'` (H9) means the rare of the node's tier.
- `op: 'mul'` is allowed in class passives, card sets and Moon Chart perks, plus two exceptions (`MUL_EXCEPTIONS`): skill C2 and trinket `thawless_plate` ("+15% max HP" cannot be an add on a flat stat).
- `worldMods` (cards, skills, sets, Archive, NPC rewards, perks) go to the world sheet; `u12` carries `worldRule: { mode: 'highest', others: 0.01 }`.
- `+100% Surge regen` (T12, `bl_surge`) is written as `surgeRegen +5` (base 5).
- Quest goal `target` may be an id or an array (any of); `reach` targets include `tidegate` (q23, WP2 extension). Board templates use `n: { base, perK }`, rewards `{ perPow2 }` and placeholder targets (`BOARD_PLACEHOLDERS`).
- Shops are in `shops.js`; `npcs.js` copies each NPC's stock in for convenience.

### Open problems
- `test/core.test.js` (WP1) failed to load in my last run because `server/http-static.js` has a syntax error (`node --check` fails; WP1 is still building it). WP2's own suites pass, and `shared/data/index.js` `validateContent()` returns 0 errors with the real data.
- TECH_SPEC 7/7.1 text still shows the stale examples and lacks `CONDITIONS`, `FLAGS`, `EFFECTS`, the three new stats and `REACH_TARGETS.tidegate`; registries.js is the current source.
- Reachability treats combat as always winnable and quantities as unlimited; it proves order, not amounts. PACING's RU expansion stays with WP14.

## WP1

WP1a (server, shared, test, root) and WP1b (client) built together. Every file in TECH_SPEC section 3 exists, except
WP2's files (theirs) and other packages' test files (the runner discovers `test/*.test.js`, so none are needed).
Wildcard folders (`server/game/ai/`, `bosses/`, `abilities/`, `dungeon/keepers/`, `dungeon/rooms-*.js`) are not
created; `loader.js` tolerates their absence and exposes what it finds as `game.modules.{ai, bosses, abilities, keepers, rooms}` (Map id -> default export).
`npm test`: 61 passed (core 26, data and rules from WP2). Verified live: two headless Chrome tabs against `npm start`
(both see each other, prediction agrees with the server, dust puffs while walking, gather -> drop -> pickup -> XP),
plus `ws` scripts for static serving, bad input, and save -> restart -> reload.

### Spec additions applied (coordinator)
- **`player.active` bus event** `{ playerId, player, reason }`: emitted by `game.markActive(player, reason)`.
  Sources: `systems/movement.js` (net displacement >= 4 tiles within a rolling 10 s window, checked at 1 Hz, so it
  repeats about once per second while the player keeps travelling; `reason: 'move'`), and `game.handleAction` for every
  successful `do` action except `PASSIVE_ACTIONS` = `gather.swing`, `attack` (`reason` = action name). Holding a mouse
  button sends only `in.b` bits and never fires it. Test: core "player.active ...".
- **`ping.mark` payload** `{ x, y, kind }`, `kind` one of `PING_KINDS` = `need`, `danger`, `look`, `omw` (DESIGN A.9,
  per the WP2 note; the coordinator's first set go/danger/loot/help was replaced). `validatePingMark(d)` in protocol.js
  normalises it (unknown kind -> `look`). WP13 implements the handler.
- **Statbook vs WP2 registries**: tables come from `registries.STATS` / `WORLD_STATS` (built-in fallback otherwise), so
  `cacheChance`, `chestLoot`, `weatherBonus` exist. Mods may carry `when` (registries.CONDITIONS); conditions are
  evaluated per player and re-checked at 1 Hz and on `clock.phase`, `weather.change`, `tide.change`. Defaults use
  `timeInfo()`, the player's tile and realm kind; owners may replace one with `game.stats.setCondition(id, fn(game, player|null))`.
  Flags: a stat source may return `{ flag: 'lava_immune' }` entries, or register `game.stats.addFlagSource(name, fn(player) -> string[])`;
  read with `game.stats.hasFlag(player, flag)`; the sheet carries `flags` (sorted array). `op: 'mul'` is accepted from any
  source (WP2's schema decides where it is legal). `proc` arrays are not the statbook's concern (WP6a).

### Deviations from TECH_SPEC
1. **Palette size**: 63 colours + transparent = 64 entries ('0' black, 60 ramp chars '1'-'9','a'-'z','A'-'Y', 'Z' accent,
   '#' white). The character set 0-9 a-z A-Z # only holds 63 colours, so there is one accent, not two.
   Ramp chars: stone 1-5, brown 6-a, sand b-f, grass g-k, teal l-p, sea q-u, ember v-z, gold A-E, violet F-J, ice K-O,
   flesh P-T, ink U-Y (dark to light). `RAMPS`, `PAL`, `shade(ch, d)`, `PLAYER_RAMPS` in `client/art/palette.js`.
2. **Save `nodes` entries** are `[kindId, tx, ty, hp, variant, big]` with the node **id string**, not a kind index
   (an index silently re-maps if `nodes.js` order changes). Structures also save `hp`. Drops: `[item, qty, x, y]`.
3. **`moveSpeed` in the sheet is a fraction** (7.1) and `shared/rules/movement.js` uses `5.0 * (1 + moveSpeed)` (6.6 wording
   "max speed stats.moveSpeed" read through 7.1). `maxSpeed(stats)` is exported.
4. **Fixed 50 ms input steps**: the client simulates and sends one `in` per 50 ms of frame time (plus an early, shorter
   step when the move axis changes or dodge is pressed); it renders between its last two predicted states. Dodge is
   edge-triggered: `b & 4` is set only on the input where it was pressed. The server banks up to 0.5 s of input time per
   player (anti speed-hack) and zeroes velocity if a client stops sending for 0.3 s.
5. **Client tests live in `test/core.test.js`** (no separate client test file in the layout).
6. **`fx/presets.js` stub** ships the 6 named presets plus `footstep_dust` (DESIGN 19.1 #20, needed for walking dust) and
   three helpers used as `sub` presets (`spark_white`, `dust_ring`, `level_ring`). WP12 may rename or drop the helpers.
7. **Minimal working stubs**: `systems/gathering.js` (handler `gather.swing`, 0.5 s cooldown, `hitNode` + `grantXp`) and
   `systems/drops.js` (magnet, pickup, 5 min despawn), and `worldgen/populate-*.js` (`ctx.scatter(22 | 12)`) are
   functional so the skeleton demonstrates gather -> pickup. WP4/WP7 replace them entirely.
8. Extra `config.js` constants: `TICK_DT`, `INPUT_STEP_MS`, `WORLD_TILES`, `START_PLOT`, `CHUNK` (= PLOT), `INTEREST_DROP` (32),
   `BACKUP_INTERVAL_S`, movement constants, `DEFAULT_PORT`. Extra `main.js` flags: `--seed N`, `--verbose`.

### Contracts later packages must know
- **Services** (`server/game/services.js`): every name in 5.5 has a default (`SERVICE_NAMES`, tested). Defaults worth
  knowing: `giveItem` sends `self.inv`; `hitNode` rolls `drops` min..max, spawns drops, emits fx/bus; `placeStructure`
  sets `data = { tx, ty, w, h, owner(token), paid }` and SOLID flags, `opts.force` skips `canPlace`, `opts.data` merges
  into data; `canPlace` = bounds + registered validators; `insertInto`/`extractFrom` dispatch to `registerIO` by kind,
  else `data.inv` via `containerOf`; `spawnNode` stores `data.tx/ty/tier`, pub `v` (0-3) and `big`; `createInstance`
  makes a 40x40 floor realm with id `<kind>:<n>`; `isHost` = loopback or `--admin` token. Also `game.services.bossScripts`,
  `.interactions`, `.placeValidators`, `.io` are the dispatch tables.
- **Game facade**: `game.now` (sim seconds), `game.rng` (`fork(name)`), `game.world` (`plots[81]` with `px, py, biome,
  owned, ordinal, feature, known`, `flags`, `glint`, `day`, `time`, `tideHeight`, `counters`), `game.realms`,
  `game.players` (keyed by player id = entity id), `game.profiles` (token -> saved profile), `game.inv` (bound inventory
  ops), `game.content`, `game.call`, `game.fx`, `game.sendSelf/sendWorld/toast/broadcast`, `game.movePlayer`,
  `game.markActive`, `game.plotsView()`, `game.invView(player)`, `game.spawnPoint()`, `game.xpToNext` (from `rules/xp.js`).
- **Player record**: `{ id, token, name, color, entity, level, xp, inv {slots:[[item,qty]|null]}, hotbar[8], gear, counters,
  playtimeS, body (dodge state), conn }`. Inventory size grows to `stats.invSlots` on join; systems that change
  `invSlots` should call `game.inv.resize(player.inv, n)` and resend `inv`.
- **Entities**: `entity.set(k, v)` for public keys (objects always count as changed; `entity.touch(k)` after mutating an
  object in place). `x, y, facing (0=E,2=S,4=W,6=N), state (protocol.STATE), hp, maxHp` are diffed automatically.
  Move entities only via `realm.move(e, x, y)` (keeps the spatial hash right). `realm.entityAtTile(tx, ty, type?)`.
- **Realm**: `realm.lowTide` gates TIDAL walkability; WP7's clock must set it on the overworld and publish `world.clock.low`
  (the client uses that for prediction and rendering). `realm.setGround/setFlag` record persistent tile patches and
  send `tiles`; `realm.stamp` is generation-only. `worldgen/index.js` exports `raisePlot(game, px, py, {ordinal})` for
  WP7 (re-stamps the plot and its neighbours, keeps patches, calls `stampFeature` then the populator, sends `world.plots`).
- **Populator ctx** (WP7): `{ game, realm, plot, px, py, biome, feature, rng, x0, y0, freeTiles(), spawnNode(kind, tx, ty),
  nodeTable(), scatter(n, table?) }`. `features.js` must export `assignFeatures(seed) -> 81 ids` and `stampFeature(game, realm, plot)`.
- **Client store events**: `change:self.<k>`, `change:world.<k>`, `entity:add|rem|patch|state|hurt`, `chunk`, `tiles`,
  `realm`, `welcome`, `snap`, and `toast` / `chat` (raw server messages, for WP13's HUD widgets).
- **Drawers** get `view = { x, y, w, h, time, now, sprites, juice, particles, store, content }` and entities with render
  position `e.rx, e.ry` (+ `e.isSelf`). Optional `update(e, dt, view)` hook runs every frame for every entity
  (the player drawer uses it for footstep dust). `sprites.draw(ctx, id, x, y, opts)` anchors at the sprite's `anchor`
  (default bottom-centre); `sprites.drawShadow(ctx, x, y, w)`.
- **Sprites**: definitions may add `anchor: [x, y]` and `variants: [swapMap, ...]` (drawn with `opts.variant`); the player
  body is `pl.body` with anims `idle_down|up|side`, `run_down|up|side`, `mirror: true`, 8 shirt-colour variants.
  `art/sprites/index.js` merges core first, so WP3 files override core ids. `gen/biomes.js` contract:
  `tiles[groundName] = (g, rng) => void` with `g = { set, fill, noise, dither }` (see tilegen.js).
- **UI**: panels `{ id, key, modal, w, h, anchor, open(store, args), close(), draw(ui, store) }`; the title panel's
  `auto: true` makes `main.js` skip it; WP13 sets `auto: false` and calls `args.onDone({ name, color })`.
  HUD widgets get `ui` bound to the whole screen (`ui.w`, `ui.h`). Widgets in `ui/widgets.js` (`frame, label, button,
  iconButton, slot, bar, progress, tabs, list, grid, cost, tooltip, dragGhost`, plus `rect`, `hover`).
  `hud/bars.js` reads Surge from `store.self.surge = { cur, max }` if a package publishes that key (not in 6.4; WP6b).
- **FX**: `fx/router.js` `route(name, x, y, params)` is called for every server `fx` entry; unknown preset names fall back to
  a generic puff. `audio/audio.js` no-op has `unlock, play, music, ambience, setVolume, pickupCombo, setListener`.
- **Identity**: the client keeps a per-tab token (sessionStorage) drawn from a localStorage pool, so two tabs are two
  players and the first tab keeps its profile. A second connection with the same token replaces the first (`kicked:
  replaced`).

### Open problems
- Windows: Ctrl+C in the server console saves (SIGINT/SIGBREAK handlers); `taskkill /F` or closing the window does not.
  Autosave (60 s while active) and save-on-last-leave limit the loss.
- `low_hp` / `shallows` conditions are polled at 1 Hz, so a `when` mod can lag a state change by up to 1 s.
- Corner rounding of shores is driven by value noise and can look blocky at plot corners; WP3/WP7 may want a smoother mask.
- `hpRegen`, Surge, death and respawn are not implemented in WP1 (WP5/WP6b); HP only changes through `damage`/`heal`.
