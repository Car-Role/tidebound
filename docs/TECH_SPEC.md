# TIDEBOUND — Technical Specification

For the builder agents. Read `DESIGN.md` for content and numbers, `PACING.md` for curves. This document defines architecture, contracts, schemas, and the work-package split. Where this document and `DESIGN.md` disagree on an id or number, `DESIGN.md` wins for content and this document wins for structure.

---

## 1. Stack and run

| Item | Decision |
|---|---|
| Runtime | Node.js 24, ES modules (`"type": "module"`) |
| Dependencies | `ws` only. No build step, no bundler, no framework, no TypeScript |
| Start | `npm start` -> `node server/main.js` -> HTTP + WebSocket on one port (default 8080; `--port N`, `--world NAME`, `--persist`, `--admin TOKEN`). One world per server process |
| Test | `npm test` -> `node test/run.js` (headless, no browser) |
| Client | plain ES modules served as static files, HTML5 Canvas 2D |
| Shared code | `shared/` is imported by the server with relative paths and by the browser via `/shared/...` URLs |
| Assets | none on disk. Sprites generated at runtime from code; audio synthesised with WebAudio |
| Saves | `saves/<world>.json` (+ rotating backups) |
| Join | host prints LAN URLs at start (`http://<lan-ip>:8080`); friends open it in a browser. Internet play via port forward |

`package.json` scripts: `start`, `test`, `test:pacing` (`node test/run.js pacing`), `bot` (`node test/bot/pacing-bot.js`).

HTTP static rules (`server/http-static.js`): serves `/` -> `client/index.html`, `/client/*`, `/shared/*` only; rejects `..`; correct MIME for `.js` (`text/javascript`), `.html`, `.css`; `Cache-Control: no-cache`.

---

## 2. Core rules for parallel work

1. **WP1 creates every file listed in section 3**, either fully (its own files) or as a working stub (files owned by later packages). The exception is the wildcard folders (`server/game/ai/`, `bosses/`, `abilities/`, `dungeon/keepers/`, `dungeon/rooms-*.js`): they are loaded at startup by `server/game/loader.js` with `fs.readdir` + dynamic `import()`, so their owners add files without touching any registry. A stub exports the correct shape and does nothing harmful.
2. After WP1, **a builder edits only files its package owns.** If a builder needs a change in a file it does not own, it uses an extension point (below) or records a request in `docs/INTEGRATION_NOTES.md` for WP14.
3. Extension points that remove the need to edit shared files:

| Need | Extension point |
|---|---|
| New server logic | a system file in `server/game/systems/` (already listed in `systems/index.js`) |
| React to gameplay | `game.bus.on(event, fn)` (section 5.4) |
| Offer a capability to other systems | `game.services.register(name, fn)`; callers use `game.call(name, ...args)` (section 5.5) |
| Client -> server command | `handlers` map in the system: action name -> function (section 6.3) |
| Per-player state to client | `game.sendSelf(player, key, data)` (section 6.4) |
| World state to client | `game.sendWorld(key, data)` |
| Stat modifiers | `game.stats.addSource(name, fn)` for a player, `game.stats.addWorldSource(name, fn)` for the world sheet (section 5.6) |
| Save data | `save()` / `load()` on the system (section 12) |
| Draw a new entity kind | a drawer file in `client/render/drawers/` (already listed in its `index.js`) |
| New UI panel / HUD widget | file in `client/ui/panels/` or `client/ui/hud/` (already listed in their `index.js`) |
| Visual/sound feedback | `game.fx(realm, name, x, y, params)` on the server, or `fx.play(name, x, y, params)` on the client. Names are the preset names in `DESIGN.md` 19.1. Unknown names fall back to a generic puff, never an error |
| Sprites | reference by id (`item.copper_bar`). Missing ids render an auto-generated placeholder, never an error |

4. Content ids are fixed by `DESIGN.md`. Code refers to content by id through `shared/data/index.js` lookups, never by array position.
5. No builder changes `package.json`, `shared/config.js`, `shared/protocol.js`, or any `index.js` registry after WP1 (WP14 may).

---

## 3. Folder and file layout (with owners)

`WPn` after a path = the owning work package. WP1 creates stubs for everything.

```
Tidebound/
  package.json                               WP1
  README.md                                  WP1   (how to run and join; 30 lines)
  saves/.gitkeep                             WP1
  docs/DESIGN.md PACING.md TECH_SPEC.md            (design; read-only)
  docs/INTEGRATION_NOTES.md                  any WP may append; WP14 resolves

  server/
    main.js                                  WP1   args, http, ws, Game bootstrap, LAN URL print, graceful shutdown save
    http-static.js                           WP1
    net/connection.js                        WP1   per-socket state, JSON parse guard, rate limit, heartbeat
    net/router.js                            WP1   hello/input/do dispatch to system handlers
    net/snapshot.js                          WP1   interest management, add/upd/rem delta builder
    game/game.js                             WP1   Game class: realms, players, systems, loop, facade methods
    game/realm.js                            WP1   tile layers, entity store, spatial hash, chunk serialisation
    game/entities.js                         WP1   entity factory, id allocator, public-field projection
    game/spatial.js                          WP1   uniform grid broadphase (cell = 4 tiles)
    game/bus.js                              WP1   event emitter
    game/services.js                         WP1   service registry + default implementations
    game/statbook.js                         WP1   modifier sources, cached stat sheets
    game/inventory.js                        WP1   pure inventory ops (add, remove, count, has, move, firstFit)
    game/player.js                           WP1   player record, profile create/load, join/leave
    game/loader.js                           WP1   readdir + dynamic import() of the wildcard folders
    game/worldgen/index.js                   WP1   overworld creation, plot raise tile stamping, populator registry
    game/worldgen/shape.js                   WP1   plot land mask (organic shoreline noise), shore/tidal ring
    game/worldgen/features.js                WP7   feature assignment per DESIGN 4.4 + feature stampers
    game/worldgen/populate-greenmarrow.js    WP7
    game/worldgen/populate-saltfen.js        WP7
    game/worldgen/populate-emberreach.js     WP7
    game/worldgen/populate-glasswaste.js     WP7
    game/worldgen/populate-hoarfrost.js      WP7
    game/worldgen/populate-umbral.js         WP7
    game/systems/index.js                    WP1   ordered list of all systems below
    game/systems/movement.js                 WP1
    game/systems/gathering.js                WP4   hook swings vs nodes, drops, gather XP
    game/systems/drops.js                    WP4   ground items, magnet, pickup, despawn (5 min)
    game/systems/inventory.js                WP4   inv intents: move, split, drop, sort, hotbar
    game/systems/crafting.js                 WP4   hand crafting
    game/systems/stations.js                 WP4   timed stations (kiln/loom/anvil/cookpot/still), fuel, queues
    game/systems/building.js                 WP4   place/deconstruct, `data.paid`, costs, `canPlace` validator chain
    game/systems/storage.js                  WP4   stockpiles, Brinelocker colour networks
    game/systems/combat.js                   WP5   damage service, weapon attacks, crits, knockback, i-frames
    game/systems/projectiles.js              WP5
    game/systems/status.js                   WP5   burn, chill, freeze, bleed, slow, stun, mark, shield
    game/systems/mobs.js                     WP5   spawn rules, elites, affixes, loot rolls
    game/systems/ai.js                       WP5   behaviour runner
    game/ai/*.js                             WP5   one file per behaviour archetype (charger, kiter, burrower, ...)
    game/systems/bosses.js                   WP5   boss framework: phases, telegraphs, enrage, personal loot
    game/bosses/*.js                         WP5   6 Wardens (one file each)
    game/systems/death.js                    WP5   player death, Sea Chest, respawn, downed/revive
    game/systems/defence.js                  WP5   bolt turret, spike trap, arc spire, walls HP
    game/systems/raids.js                    WP5   Tidebreak raids
    game/systems/progression.js              WP6a   XP grant service, level-up, rested, wake bonus hook
    game/systems/cards.js                    WP6a   draft queue, offers, pick/reroll/banish/skip, set bonuses
    game/systems/procs.js                    WP6a   proc effect implementations for cards and trinkets
    game/systems/skills.js                   WP6a   skill tree purchase, respec, world unlock flags
    game/systems/classes.js                  WP6b   class select, mastery
    game/systems/abilities.js                WP6b   cast pipeline: cost, cooldown, targeting
    game/abilities/*.js                      WP6b   one file per class (6)
    game/systems/gear.js                     WP6b   equip slots, set bonuses, tempering
    game/systems/consumables.js              WP6b   food, tonics, bombs, buffs timers
    game/systems/land.js                     WP7   raise plot, cost, Ballast, gates, attunement, Treasury (`addGlint`/`spendGlint`), Beacons, charters
    game/systems/clock.js                    WP7   day/night, tide, weather
    game/systems/nodes.js                    WP7   node respawn per plot, tidal nodes, gem nodes
    game/systems/waystones.js                WP7
    game/systems/shrines.js                  WP7   5 overworld puzzle types
    game/systems/machines.js                 WP8   machine registry, Flux pool, caps, Tending, enable/disable
    game/systems/scuttlers.js                WP8
    game/systems/sluices.js                  WP8   sluice items, grabbers, splitters, hoppers
    game/systems/autocraft.js                WP8   Autobench I-III
    game/systems/producers.js                WP8   drip, sap tap, fish trap, hive, drill, trawl, generators
    game/systems/gulls.js                    WP8
    game/systems/ledger.js                   WP8   ledger post, mint, echo chamber
    game/systems/farming.js                  WP9   soil, crops, water, pests, sprinkler, scarecrow, `farmTend` and `growCrops` services
    game/systems/fishing.js                  WP9
    game/systems/market.js                   WP9   market stall, saturation, castaway shop stock and transactions
    game/systems/dungeons.js                 WP10  instance lifecycle, entry/exit, keys, rewards
    game/dungeon/gen.js                      WP10  floor layout generator
    game/dungeon/rooms-*.js                  WP10  room templates per biome (6 files)
    game/dungeon/puzzles.js                  WP10
    game/dungeon/blessings.js                    WP10
    game/dungeon/trench.js                   WP10
    game/dungeon/keepers/*.js                WP10  6 Keeper scripts (use WP5 boss framework via services)
    game/systems/quests.js                   WP11  main chain, side quests, Tide Board
    game/systems/npcs.js                     WP11  castaways, dialogue, quest markers (shop stock and transactions are WP9)
    game/systems/archive.js                  WP11
    game/systems/deeds.js                    WP11  counters + Logbook
    game/systems/tidegate.js                 WP11
    game/systems/finale.js                   WP11  Drowned Moon realm and boss script
    game/systems/rebirth.js                  WP11  vote, reset, Moon Shards, Moon Chart
    game/systems/coop.js                     WP13  bound players, coopScale, host, kick/unbind, spend caps, chat, pings
    persistence/save.js                      WP1   atomic write, autosave, backups, load
    persistence/migrate.js                   WP14  version migrations

  shared/
    config.js                                WP1   engine constants (section 4)
    protocol.js                              WP1   message type names, action names, validators
    rng.js                                   WP1   mulberry32, hash2D, seeded shuffle, weighted pick
    math.js                                  WP1   clamp, lerp, dist, angle, aabb
    grid.js                                  WP1   plot<->tile helpers, biomeOf(px,py), neighbours
    rules/movement.js                        WP1   deterministic step used by server and client prediction
    rules/constants.js                       WP2   all balance knobs (PACING section 8)
    rules/xp.js                              WP2   xpToNext, totalXp, levelFromXp
    rules/costs.js                           WP2   landCost, structureCost, temperCost, coopScale
    rules/combat.js                          WP2   damage formula, armor, crit, element table
    rules/loot.js                            WP2   drop quantity, luck, elite multipliers
    rules/draft.js                           WP2   rarity weights, pity, offer generation (pure, seeded)
    rules/market.js                          WP2   saturation math, sell price
    rules/scaling.js                         WP2   enemy/boss co-op scaling, Tide Height scaling
    rules/pacing.js                          WP14  phase model used by pacing test
    data/index.js                            WP1   imports all data files, builds id maps, freezes, validates
    data/schema.js                           WP2   validators for every content type (section 7)
    data/registries.js                       WP2   closed vocabularies of section 7.1
    data/items.js                            WP2
    data/recipes.js                          WP2
    data/structures.js                       WP2
    data/nodes.js                            WP2
    data/biomes.js                           WP2
    data/enemies.js                          WP2
    data/bosses.js                           WP2
    data/cards.js                            WP2
    data/skills.js                           WP2
    data/classes.js                          WP2
    data/abilities.js                        WP2
    data/crops.js                            WP2
    data/fish.js                             WP2
    data/weather.js                          WP2
    data/dungeons.js                         WP2
    data/blessings.js                            WP2
    data/quests.js                           WP2
    data/npcs.js                             WP2
    data/archive.js                          WP2
    data/deeds.js                            WP2
    data/rebirth.js                          WP2
    data/affixes.js                          WP2
    data/shops.js                            WP2   castaway shop stock (DESIGN A.6)

  client/
    index.html                               WP1
    style.css                                WP1   (canvas fill, cursor, no scroll; nothing else)
    main.js                                  WP1   boot: sprites -> audio unlock -> title -> connect -> loop
    net/client.js                            WP1   socket, reconnect, send helpers
    net/prediction.js                        WP1   local player prediction and reconciliation
    net/interp.js                            WP1   entity interpolation buffer (100 ms)
    state/store.js                           WP1   client mirror: entities, chunks, self.*, world.*, change events
    input/input.js                           WP1   keyboard/mouse state, action mapping, rebinding
    render/renderer.js                       WP1   frame pipeline (section 8.1)
    render/camera.js                         WP1
    render/tilemap.js                        WP1   chunk canvases, autotile, water animation
    render/text.js                           WP1   procedural 5x7 pixel font, outlined text
    render/lighting.js                       WP7   night darkness + light sources (offscreen multiply layer)
    render/weather.js                        WP7   screen-space weather layers
    render/drawers/index.js                  WP1
    render/drawers/player.js                 WP1
    render/drawers/node.js                   WP1
    render/drawers/drop.js                   WP1
    render/drawers/structure.js              WP1   generic structure (sprite + progress bar)
    render/drawers/mob.js                    WP5
    render/drawers/boss.js                   WP5
    render/drawers/projectile.js             WP5
    render/drawers/zone.js                   WP5
    render/drawers/chest.js                  WP4
    render/drawers/summon.js                 WP6b
    render/drawers/machine.js                WP8
    render/drawers/sluice.js                 WP8
    render/drawers/scuttler.js               WP8
    render/drawers/gull.js                   WP8
    render/drawers/crop.js                   WP9
    render/drawers/bobber.js                 WP9
    render/drawers/dungeon.js                WP10
    render/drawers/npc.js                    WP11
    art/palette.js                           WP1   master palette (section 9.1)
    art/spritegen.js                         WP1   pixel-map parser, atlas, variants, placeholder
    art/tilegen.js                           WP1   ground texture + autotile generator engine
    art/sprites/index.js                     WP1   merges all sprite definition files
    art/sprites/core.js                      WP1   player (4 dirs x 4 frames), cursor, shadow, 1 tree, 1 rock, water, grass, sand
    art/sprites/items.js                     WP3
    art/sprites/nodes.js                     WP3
    art/sprites/structures.js                WP3
    art/sprites/machines.js                  WP3
    art/sprites/mobs.js                      WP3
    art/sprites/bosses.js                    WP3
    art/sprites/npcs.js                      WP3
    art/sprites/icons.js                     WP3   UI, ability, card, skill, status icons
    art/sprites/decor.js                     WP3   decals, crabs, gulls, flowers
    art/gen/biomes.js                        WP3   ground/tile generators for 6 biomes + dungeon tilesets
    art/gen/big.js                           WP3   generator functions for large sprites (Beacon, Tidegate, bosses' parts)
    art/gen/player-parts.js                  WP3   layered player: body, class outfit, hat, weapon, hook tiers
    fx/particles.js                          WP1   particle engine (section 10)
    fx/juice.js                              WP1   shake, hitstop, squash, floating numbers, flashes
    fx/presets.js                            WP12  all 126 preset names (WP1b ships 6: hit_wood, hit_stone, break_wood, break_stone, pickup_flash, level_up)
    fx/router.js                             WP12  server fx event -> particles + sound + juice (WP1 ships pass-through)
    fx/ambient.js                            WP12  fireflies, leaf fall, ripples, kiln smoke scheduling
    audio/audio.js                           WP12  synth engine (WP1 ships a no-op with the same API)
    audio/sfx.js                             WP12  SFX definitions
    audio/music.js                           WP12  sequencer
    audio/tracks.js                          WP12  track definitions
    audio/ambience.js                        WP12
    ui/ui.js                                 WP1   panel manager, input capture, layout helpers, drag and drop
    ui/widgets.js                            WP1   button, slot, bar, list, tabs, tooltip, scroll, nine-slice frame
    ui/hud/index.js                          WP1
    ui/hud/bars.js                           WP1   HP, Surge, XP
    ui/hud/hotbar.js                         WP4
    ui/hud/pickups.js                        WP4
    ui/hud/boss.js                           WP5
    ui/hud/abilities.js                      WP6b
    ui/hud/draft-badge.js                    WP6a
    ui/hud/clock.js                          WP7
    ui/hud/treasury.js                       WP7
    ui/hud/flux.js                           WP8
    ui/hud/goals.js                          WP11
    ui/hud/party.js                          WP13
    ui/hud/minimap.js                        WP13
    ui/hud/chat.js                           WP13
    ui/hud/toasts.js                         WP13
    ui/panels/index.js                       WP1
    ui/panels/inventory.js                   WP4
    ui/panels/crafting.js                    WP4
    ui/panels/build.js                       WP4
    ui/panels/station.js                     WP4
    ui/panels/storage.js                     WP4
    ui/panels/character.js                   WP6b
    ui/panels/draft.js                       WP6a
    ui/panels/deck.js                        WP6a
    ui/panels/skills.js                      WP6a
    ui/panels/class.js                       WP6b
    ui/panels/temper.js                      WP6b
    ui/panels/map.js                         WP7
    ui/panels/machine.js                     WP8
    ui/panels/market.js                      WP9
    ui/panels/fishing.js                     WP9   reel minigame overlay
    ui/panels/dungeon.js                     WP10  entry, blessing pick, results
    ui/panels/journal.js                     WP11  quests, Archive, Logbook, bestiary, fish tabs
    ui/panels/dialog.js                      WP11  NPC dialogue + shop (uses market service)
    ui/panels/tidegate.js                    WP11
    ui/panels/rebirth.js                     WP11  vote + Moon Chart
    ui/panels/title.js                       WP13
    ui/panels/settings.js                    WP13
    ui/panels/pause.js                       WP13
    ui/panels/tutorial.js                    WP13  onboarding prompts (DESIGN 23)

  test/
    run.js                                   WP1   discovers test/*.test.js, runs, prints summary, exit code
    assert.js                                WP1
    harness.js                               WP1   headless Game + fake clients (section 13)
    core.test.js                             WP1
    data.test.js                             WP2
    rules.test.js                            WP2
    sprites.test.js                          WP3   (pure-JS checks of pixel maps: sizes, palette chars)
    gather-craft.test.js                     WP4
    combat.test.js                           WP5
    progression.test.js                      WP6a
    classes.test.js                          WP6b
    world.test.js                            WP7
    automation.test.js                       WP8
    farm-fish-market.test.js                 WP9
    dungeon.test.js                          WP10
    quests-endgame.test.js                   WP11
    fx-audio.test.js                         WP12  (preset/sfx tables valid; every DESIGN preset name exists)
    coop.test.js                             WP13
    save.test.js                             WP14
    pacing.test.js                           WP14
    bot/pacing-bot.js                        WP14
```

---

## 4. Engine constants (`shared/config.js`)

| Constant | Value |
|---|---|
| `TICK_HZ` | 20 (dt = 0.05 s) |
| `SNAPSHOT_HZ` | 20 (one snapshot per tick per client) |
| `SLOW_TICK_HZ` | 1 |
| `INPUT_HZ` | 20 (client sends input every 50 ms, plus immediately on change) |
| `INTERP_DELAY_MS` | 100 |
| `TILE` | 16 px |
| `PLOT` | 20 tiles |
| `WORLD_PLOTS` | 9 |
| `INTEREST_RADIUS` | 28 tiles (hysteresis: add at 28, remove at 32) |
| `MAX_PLAYERS` | 8 |
| `AUTOSAVE_S` | 60 |
| `BACKUPS` | 5 |
| `POS_QUANT` | 32 (positions sent as integers = tiles * 32) |
| `PLAYER_RADIUS` | 0.3 tiles |
| `REACH` | 2.5 tiles |
| `MAX_MSG_BYTES` | 16,384 inbound |
| `RATE_LIMIT` | 60 messages/s per socket |
| `PARTY_RANGE` | 24 tiles (kill credit, enemy HP scaling, party auras unless an ability states its own radius) |
| `TEND_RADIUS` | 12 tiles (`TEND_MINUTES` and `UNTENDED_SPEED` are balance knobs in `rules/constants.js`) |

---

## 5. Server architecture

### 5.1 Game loop

```js
// server/game/game.js (shape)
class Game {
  content;            // shared/data index
  world;              // { seed, time, day, glint, plots[81], flags{}, boundPlayers, tideHeight, ... }
  realms;             // Map<realmId, Realm>   'overworld', 'vault:<n>', 'trench:<n>', 'moon'
  players;            // Map<playerId, Player> (connected)
  profiles;           // Map<token, ProfileData> (all, incl. offline)
  systems;            // ordered array
  bus; services; stats; inv;
  tick(dt) {}         // 20 Hz: for each system: tick(game, dt); then snapshot.send()
  slowTick() {}       // 1 Hz: for each system: slowTick(game)
}
```

Loop uses a fixed timestep accumulator with `setTimeout` drift correction; if the process falls behind by more than 250 ms it drops the backlog (no spiral). `harness.step(seconds)` calls `tick` directly, so tests are deterministic.

### 5.2 System interface

```js
export default {
  name: 'gathering',
  init(game) {},                       // register services, bus listeners, stat sources
  tick(game, dt) {},                   // optional, 20 Hz
  slowTick(game) {},                   // optional, 1 Hz
  handlers: {                          // client actions (section 6.3)
    'gather.swing': (game, player, d) => ({ ok: true }),   // return {ok:false, err:'code'} to reject
  },
  onJoin(game, player) {},             // send initial self state
  onLeave(game, player) {},
  save(game) { return {}; },           // JSON-serialisable; stored under systems[name]
  load(game, data) {},
  saveProfile(game, player) { return {}; },   // optional; stored under profiles[token].sys[name]
  loadProfile(game, player, data) {},         // optional; called on join, data may be undefined
};
```

System order in `systems/index.js`: coop, clock, land, nodes, movement, gathering, drops, inventory, crafting, stations, building, storage, combat, projectiles, status, mobs, ai, bosses, death, defence, raids, progression, cards, procs, skills, classes, abilities, gear, consumables, waystones, shrines, machines, scuttlers, sluices, autocraft, producers, gulls, ledger, farming, fishing, market, dungeons, quests, npcs, archive, deeds, tidegate, finale, rebirth.

### 5.3 Realms and tiles

A `Realm` = `{ id, w, h, ground: Uint8Array, flags: Uint8Array, entities: Map, spatial, kind }`.

Tile ids (`ground`):

| id | Tile | Walk | Notes |
|---|---|---|---|
| 0 | deep water | no | |
| 1 | shallow water | no (yes with card e12) | 1 tile around land |
| 2 | tidal flat | only at low tide | |
| 3 | sand | yes | shore |
| 4–9 | biome ground (greenmarrow..umbral) | yes | |
| 10 | soil | yes | farmable |
| 11 | path | yes | +10% move speed |
| 12 | lava | yes, 30 dmg/s | Emberreach, Slagworks |
| 13 | ice | yes, slippery | Hoarfrost |
| 14 | ink | yes, slow 40% | Umbral |
| 15 | dungeon floor | yes | |
| 16 | dungeon wall | no | |
| 17 | empty | no | |

`flags` bits: 1 solid (structure), 2 owned, 4 no-spawn, 8 lit, 16 watered.

Plot shape: `worldgen/shape.js` produces a 20x20 mask per plot from seeded noise: interior always land; edges that face an **unraised** neighbour get an organic shoreline 1–3 tiles deep (sand, then tidal flat, then shallow). When a neighbour is raised, both plots' shared edges are re-stamped as solid land so the plots join seamlessly.

### 5.4 Event bus (stable names)

| Event | Payload |
|---|---|
| `player.join`, `player.leave` | `{player}` |
| `node.hit` | `{player, node, dmg}` |
| `node.broken` | `{player, node, kind, tier, x, y, byMachine}` |
| `item.pickup` | `{player, item, qty}` |
| `item.crafted` | `{player, item, qty, station, byMachine}` |
| `structure.placed`, `structure.removed` | `{player, structure}` |
| `mob.hit` | `{attacker, mob, dmg, crit, element}` |
| `mob.killed` | `{killer, mob, kind, tier, elite, participants[]}` |
| `boss.killed` | `{boss, kind, participants[], first}` |
| `player.hurt` | `{player, source, dmg}` |
| `player.died`, `player.revived` | `{player}` |
| `player.dodge` | `{player}` |
| `player.active` | `{player}` — emitted by WP1a at most once per second per player while the player is *active* (rule below) |
| `ability.cast` | `{player, ability}` |
| `xp.gained` | `{player, amount, source}` |
| `player.levelup` | `{player, level}` |
| `card.picked` | `{player, card, rank}` |
| `skill.bought` | `{player, skill}` |
| `land.raised` | `{player, px, py, biome, ordinal}` |
| `beacon.lit` | `{k}` |
| `clock.phase` | `{phase}` (dawn/day/dusk/night) |
| `tide.change` | `{low: bool}` |
| `weather.change` | `{id}` |
| `crop.harvested` | `{player, crop, qty, byMachine}` |
| `fish.caught` | `{player, fish, rarity}` |
| `glint.changed` | `{delta, source, player}` |
| `item.sold` | `{player, item, qty, glint}` |
| `vault.cleared` | `{k, participants[], seconds, first}` |
| `trench.floor` | `{floor, participants[]}` |
| `quest.completed` | `{player, quest}` |
| `questline.completed` | `{npc, biome}` |
| `shrine.solved` | `{player, biome, px, py}` |
| `charter.changed` | `{px, py, charter}` |
| `coop.changed` | `{S, scale}` |
| `archive.donated` | `{player, item, wing}` |
| `machine.output` | `{machine, item, qty}` |
| `sluice.moved` | `{count}` (batched per slow tick) |
| `gull.delivered` | `{count}` |
| `tidegate.stage` | `{stage}` |
| `rebirth` | `{tideHeight}` |

Listeners must not throw; the bus wraps each listener in try/catch and logs.

**`player.active` rule (WP1a).** A player is active for 60 s after either (a) `systems/movement.js` sees at least 4 tiles of net displacement between the player's position now and 10 s ago, or (b) `net/router.js` returns `ok: true` for any action other than `gather.swing` and `attack`. Held keys, held mouse buttons, failed actions and movement against a wall do not qualify. While active, WP1a emits `player.active` once per second. This is the only thing that refills Tending: WP8 listens and calls `refillTend(realm, player.x, player.y, TEND_RADIUS)`; it must not refill on raw input.

### 5.5 Services (cross-system calls)

`game.services.register(name, fn)` / `game.call(name, ...args)`. WP1a registers a simple default for each so the skeleton runs; the owning package replaces it in its system `init`. Signatures are exact; `opts` objects may omit any key marked `?`. `Entity` is a server entity; `Player` is a player record; `realm` is a `Realm`.

**Combat (WP5)**

| Service | Signature | Returns |
|---|---|---|
| `damage` | `(target: Entity, amount: number, opts: { source?: Entity, element?: string, crit?: boolean, knock?: number, noProcs?: boolean })` | damage dealt (number) |
| `heal` | `(target: Entity, amount: number, source?: Entity)` | amount healed |
| `applyStatus` | `(target: Entity, statusId: string, opts: { duration: number, power?: number, stacks?: number, source?: Entity })` | boolean (false if immune) |
| `clearStatus` | `(target: Entity, statusId: string \| 'debuffs')` | number removed |
| `spawnMob` | `(realm, kind: string, x: number, y: number, opts: { elite?: string \| true, scaleN?: number, noLoot?: boolean })` | Entity |
| `registerBossScript` | `(id: string, script: BossScript)` — used by WP5 (Wardens), WP10 (Keepers), WP11 (Drowned Moon) | void |
| `startBoss` | `(realm, bossId: string, x: number, y: number, opts: { hard?: boolean })` | Entity |
| `disableStructure` | `(structure: Entity, seconds: number)` — sets `on = 0`; WP8 honours it | void |

`BossScript = { phases: [{ at: number, moves: string[] }], moves: { [name]: { windup: number, cooldown: number, telegraph?: { shape: 'circle'|'line'|'cone'|'ring', r?: number, len?: number, w?: number }, run(game, boss, target) } }, onPhase?(game, boss, i) }`.

**Items, nodes, structures (WP4)**

| Service | Signature | Returns |
|---|---|---|
| `giveItem` | `(player: Player, itemId: string, qty: number)` | leftover that did not fit (dropped at the player's feet) |
| `takeItems` | `(player: Player, list: [{ item: string, qty: number }])` | boolean, atomic |
| `countItem` | `(player: Player, itemId: string)` | number |
| `dropItem` | `(realm, x: number, y: number, itemId: string, qty: number, opts: { owner?: number })` | Entity |
| `hitNode` | `(node: Entity, dmg: number, opts: { player?: Player, byMachine?: boolean, yieldMult?: number, ignoreTier?: boolean })` | `{ broken: boolean, drops: [{ item, qty }] }` |
| `placeStructure` | `(realm, kind: string, tx: number, ty: number, rot: 0\|1\|2\|3, owner: Player \| null, opts: { free?: boolean })` | Entity or null |
| `removeStructure` | `(structure: Entity, opts: { refundTo?: Player })` | void |
| `canPlace` | `(kind: string, realm, tx: number, ty: number, player: Player \| null)` — runs every registered validator | `{ ok: boolean, err?: string }` |
| `registerPlaceValidator` | `(fn: (kind, realm, tx, ty, player) => { ok: false, err: string } \| null)` | void |
| `containerOf` | `(structure: Entity)` — plain storage only | Inventory or null |
| `insertInto` | `(structure: Entity, itemId: string, qty: number, opts: { slot?: 'in' \| 'fuel' })` | quantity accepted |
| `extractFrom` | `(structure: Entity, filter: ((itemId: string) => boolean) \| null, max: number)` | `{ item, qty }` or null |
| `registerIO` | `(structureKind: string, io: { insert(structure, itemId, qty, opts) => number, extract(structure, filter, max) => { item, qty } \| null })` | void |

Place validators: WP4 (overlap, terrain, cost), WP7 (owned land, Beacon attunement, world structures), WP8 (machine cap, Drill on vein, Rime Turbine biome), WP9 (water/shore rules for Creel and Trawl Buoy). IO providers: WP4 (stations, Stockpile, Brinelocker), WP8 (every machine kind), WP11 (`gate_site`).

**Interaction (dispatcher WP1a)**

| Service | Signature |
|---|---|
| `registerInteract` | `(entityKindOrType: string, fn: (game, player: Player, entity: Entity) => void)` — the router's `use` action calls the handler registered for `entity.kind`, else for `entity.type` |

Owners: stations and storage WP4; `market_stall` WP9; `npc` WP11; Vault and Trench entrances WP10; `waystone`, `tidestone`, shrine pieces WP7; `calling_shrine` WP6b; `tempering_forge` WP6b; Warden altar (`arena`) WP5; `archive`, `tide_board`, `gate_site` WP11; machines WP8.

**World (WP7, in `systems/land.js`, `clock.js`, `nodes.js`)**

| Service | Signature | Returns |
|---|---|---|
| `addGlint` | `(amount: number, source: string, player?: Player)` | void |
| `spendGlint` | `(amount: number, source: string, player: Player)` — synchronous; fails if the Treasury is short or the player's spend cap is exceeded | boolean |
| `landCostNext` | `()` | `{ ordinal, glint }` |
| `ballastFor` | `(px: number, py: number)` | `{ item: string, qty: number }` |
| `featureAt` | `(realm, x: number, y: number)` | `{ px, py, biome, feature, owned }` or null |
| `timeInfo` | `()` | `{ day, phase, isNight, lowTide, turning, weather, forecast: string[3] }` |
| `spawnNode` | `(realm, kind: string, tx: number, ty: number)` | Entity or null |
| `respawnNodes` | `(realm, x: number, y: number, r: number)` | count spawned |
| `nodesInRadius` | `(realm, x: number, y: number, r: number, maxTier: number)` | Entity[] |

Beacons are owned by `systems/land.js`: it validates Beacon placement (attunement), lights them, emits `beacon.lit`, and publishes `world.beacons`. The Treasury also lives there.

**Progression (WP6a / WP6b)**

| Service | Signature | Returns | Owner |
|---|---|---|---|
| `grantXp` | `(player: Player, amount: number, source: string)` — applies `xpMult`, Rested, Wake bonus | XP actually granted | WP6a |
| `queueDraft` | `(player: Player, opts: { minRarity?: string, tag?: string })` | void | WP6a |
| `hasUnlock` | `(unlockId: string, player?: Player)` — `level:N` needs the player | boolean | WP6a |
| `addBuff` | `(player: Player, buffId: string, opts: { duration: number, mods?: Mod[], stacks?: number })` | void | WP6b |
| `removeBuff` | `(player: Player, buffId: string)` | void | WP6b |

**Automation (WP8)**

| Service | Signature | Returns |
|---|---|---|
| `machineSpeed` | `(structure: Entity)` = `min(3, 1 + world sheet machineSpeed + proximity sources) * fluxRatio * tendFactor` | number |
| `disableMachine` | `(structure: Entity, seconds: number)` | void |
| `machineClusters` | `()` | `[{ px, py, count }]` sorted by count descending |
| `refillTend` | `(realm, x: number, y: number, r: number)` — called by WP8 on the `player.active` bus event (never on raw input) and by Overclock's signature | void |

**Farming, fishing, market (WP9)**

| Service | Signature | Returns |
|---|---|---|
| `farmTend` | `(realm, tx: number, ty: number, r: number, seedItem: string \| null)` — one action per call: harvest ripe, else water dry, else plant | `{ did: 'harvest'\|'water'\|'plant'\|null, items: [{ item, qty }] }` |
| `growCrops` | `(realm, x: number, y: number, r: number, stages: number)` | crops advanced |
| `rollFish` | `(biome: string, opts: { commonOnly?: boolean, rodTier?: number, luck?: number })` | fish id |
| `sellItems` | `(player: Player \| null, itemId: string, qty: number, opts: { rate?: number, satKey?: string })` — applies saturation, adds Glint | Glint paid |
| `shopStock` | `(npcId: string)` | `[{ item, price, left }]` |

**Dungeons (WP10)**: `createInstance(kind: 'vault' | 'trench' | 'moon', params: { k?: number, floor?: number, party: Player[] })` -> Realm; `rollVaultLoot(k: number)` -> `[{ item, qty }]`.

**Collections (WP11)**: `counter(player: Player | null, counterId: string, delta: number)` (null = world counter).

**Co-op (WP13)**: `coopScale()` -> number; `boundCount()` -> number; `partyAverageLevel()` -> number; `isHost(player: Player)` -> boolean.

**Core (WP1a)**: `movePlayer(player: Player, realmId: string, x: number, y: number)` (sends the `realm` message); `toast(player: Player | null, text: string, kind: string)`; `fx` is the method `game.fx(realm, name, x, y, params?)`.

### 5.6 Stat sheets (`game/statbook.js`)

```js
game.stats.addSource('cards', (player) => [ {stat:'gatherPower', op:'add', v:0.12}, ... ]);
game.stats.invalidate(player);          // call when a source changes
const s = game.stats.of(player);        // cached { maxHp, power, ... } per DESIGN 5.1
```

`final = (base + levelGain + sum(add)) * product(1 + mul)`, then the caps from section 7.1 (the statbook enforces them; no system applies its own).

**World sheet.** `game.stats.addWorldSource(name, (game) => Mod[])`, `game.stats.world()` returns the cached world stats of section 7.1 (machine speed, node respawn, Archive bonuses, Beacon XP, land discount). `game.stats.invalidateWorld()` when a source changes. It is sent as `sendWorld('sheet', sheet)`. Player sheets include the world values that apply to players (`xpWorld`, `luckWorld`, `dmgWorld`, yields). On recompute the sheet is sent via `sendSelf(player, 'stats', sheet)`.

Modifier object: `{ stat: string, op: 'add' | 'mul', v: number }`.

---

## 6. Network protocol

Transport: one WebSocket per client, JSON text frames. Every message is an object with a `t` field. Unknown `t` is ignored. Server validates every inbound field (type, range, reach, cooldown); the client is never trusted.

### 6.1 Client -> server

| `t` | Fields | Purpose |
|---|---|---|
| `hello` | `v` protocol version, `token` (uuid from localStorage), `name` (1–16 chars), `color` (0–7) | join |
| `in` | `n` seq, `mx`,`my` move axis (-1..1), `ax`,`ay` aim tile position x32, `b` button bitmask (1 primary, 2 secondary, 4 dodge), `dt` ms simulated | movement input, 20 Hz |
| `do` | `n` request id, `a` action name, `d` payload | every discrete command (6.3) |
| `ping` | `c` client time | latency |

### 6.2 Server -> client

| `t` | Fields | Purpose |
|---|---|---|
| `welcome` | `id`, `v`, `contentHash`, `world` (all world keys), `self` (all self keys), `realm` `{id,w,h,kind}`, `tick` | accepted |
| `reject` | `reason` (`full`, `version`, `name`) | refused |
| `chunk` | `realm`, `cx`, `cy` (20x20 chunk coords), `g` base64 ground bytes, `f` base64 flags | tile data; sent when a chunk enters interest or changes wholesale (plot raised) |
| `tiles` | `realm`, `p` array of `[tx, ty, ground, flags]` | small tile patches |
| `snap` | `k` tick, `ack` last processed input seq, `me` `[x, y, vx, vy]` x32, `add` array of entity objects, `upd` array of compact arrays, `rem` array of ids | 20 Hz |
| `self` | `k` key, `d` data | personal state (6.4) |
| `world` | `k` key, `d` data | shared state (6.4) |
| `fx` | `e` array of `[name, x, y, params?]` | batched feedback events in interest range |
| `res` | `n` request id, `ok`, `err?`, `d?` | reply to `do` |
| `toast` | `text`, `kind` (`info`, `good`, `warn`, `quest`) | |
| `chat` | `from`, `text`, `color` | |
| `pong` | `c`, `s` server time | |
| `realm` | `id`, `w`, `h`, `kind`, `x`, `y`, `tick` | sent by `movePlayer` when a player enters or leaves a Vault, the Trench or the Moon arena. The client drops all entities and chunks, resets prediction and interpolation, sets its position to `x, y`, then receives `chunk` and `snap.add` for the new realm |
| `kicked` | `reason` | connection is closed by the host or the server |

`add` entity object keys: `i` id, `ty` type, `k` kind, `x`, `y` (tiles x32, integers), `f` facing (0–7), `s` state id, `hp`, `mh` max HP, plus the type-specific public keys in section 6.5.

`upd` entry: `[i, x, y, f, s, hp, patch?]`. `hp` is `null` when unchanged. `patch` is an object holding only the public keys (short names from 6.5) that changed since this client last received the entity, e.g. `{ "p": 120, "on": 1 }` or `{ "tg": { ... } }`. `entities.js` exposes `entity.set(key, value)` which marks the key dirty; `snapshot.js` keeps a per-client version per entity and sends the union of keys dirtied since that client's last snapshot. Only entities with any change are included. Static entities (nodes, structures) appear in `upd` only when hp, state or a public key changes.

### 6.3 Actions (`do.a`)

Namespaced by owner. Handlers live in the owning system's `handlers` map.

| Action | Payload `d` | Owner |
|---|---|---|
| `gather.swing` | `{tx, ty}` or `{id}` | WP4 |
| `inv.move` | `{from, to, qty, src, dst}` (containers by id or `'self'`) | WP4 |
| `inv.drop` | `{slot, qty}` | WP4 |
| `inv.sort`, `inv.hotbar` | `{}` / `{slot, bar}` | WP4 |
| `craft.make` | `{recipe, qty}` | WP4 |
| `station.queue`, `station.take`, `station.fuel` | `{id, recipe, qty}` etc. | WP4 |
| `build.place` | `{kind, tx, ty, rot}` | WP4 |
| `build.remove` | `{id}` | WP4 |
| `use` | `{id}` interact with entity (opens UI, talk, enter) — router calls the handler registered with `registerInteract` for the entity's kind, else its type (5.5) | WP1 routing |
| `attack` | `{ax, ay}` | WP5 |
| `revive` | `{id}` | WP5 |
| `boss.summon` | `{lure}` (must stand on an `arena` plot; consumes 1 or 2 Lures: `{lure, hard: true}`) | WP5 |
| `card.pick`, `card.reroll`, `card.banish`, `card.skip` | `{draft, index}` | WP6a |
| `skill.buy`, `skill.respec` | `{skill}` | WP6a |
| `class.choose` | `{class}` | WP6b |
| `ability.cast` | `{slot, ax, ay}` | WP6b |
| `gear.equip`, `gear.unequip`, `gear.temper` | `{slot}` / `{item}` | WP6b |
| `item.use` | `{slot, ax, ay}` (consumables, placeables) | WP6b |
| `land.raise` | `{px, py}` | WP7 |
| `waystone.go` | `{id}` | WP7 |
| `shrine.act` | `{id, i}` | WP7 |
| `machine.config` | `{id, recipe?, filter?, tag?, on?}` | WP8 |
| `farm.till`, `farm.plant`, `farm.water`, `farm.harvest` | `{tx, ty, seed?}` | WP9 |
| `fish.cast`, `fish.reel`, `fish.cancel` | `{tx, ty}` / `{hold: bool}` | WP9 |
| `market.sell`, `market.buy`, `shop.buy` | `{item, qty, npc?}` | WP9 |
| `dungeon.enter`, `dungeon.leave`, `blessing.pick` | `{id}` / `{}` / `{index}` | WP10 |
| `quest.accept`, `quest.turnin`, `quest.pin` | `{quest}` | WP11 |
| `npc.talk` | `{id, choice?}` | WP11 |
| `archive.donate` | `{item}` | WP11 |
| `tidegate.deliver` | `{stage}` | WP11 |
| `rebirth.vote`, `moon.buy` | `{yes}` / `{perk}` | WP11 |
| `chat.say`, `ping.mark` | `{text}` / `{x, y}` | WP13 |
| `coop.kick`, `coop.unbind`, `coop.spendcap` | `{id}` / `{id}` / `{id, glint}` (host only) | WP13 |
| `card.fuse` | `{a, b}` (two max-rank Commons of one tag) | WP6a |
| `ability.signature` | `{ability}` (at levels 70, 80, 90) | WP6b |
| `charter.set` | `{px, py, charter}` | WP7 |
| `burrow.rename` | `{id, name, hat}` | WP8 |
| `settings.set` | `{key, value}` (server-side per-profile prefs) | WP13 |

Standard error codes: `range`, `cooldown`, `cost`, `locked`, `full`, `invalid`, `busy`, `dead`, `denied`.

### 6.4 State keys

`self` keys (per player): `recipes` (ids of recipes this player can craft now; recomputed on unlock changes; owned by WP4), `sig` (signature picks per class), `inv` (slots, hotbar), `gear`, `stats`, `xp` (`{level, xp, next}`), `cards` (`{owned:{id:rank}, drafts:[{id, offers[]}], tokens, banishes}`), `skills` (`{points, owned[]}`), `class` (`{id, mastery:{}}`), `cooldowns`, `buffs`, `quests`, `deeds`, `fish` (minigame state), `ui` (open container/station view), `dungeon` (blessings, floor), `prefs`.

`world` keys (shared): `clock` (`{day, t, phase, tideT, low, weather, nextWeather}`), `glint`, `plots` (array of 81 `{owned, feature?, known}`), `landNext` (next cost, ordinal), `unlocks` (flags), `beacons`, `flux` (`{supply, demand}`), `party` (array `{id, name, color, class, level, hp, mh, realm, x, y}` at 2 Hz), `archive`, `mainQuest`, `tidegate`, `market` (saturation map), `coop` (`{S, scale}`), `raid`, `rebirth` (vote state), `tideHeight`, `sheet` (world stat sheet), `charters`, `telemetry` (playtime at each gate).

The client store sets `store.self[k]` / `store.world[k]` and emits `change:self.k` / `change:world.k`. UI subscribes; nobody polls.

### 6.5 Entity model

All entities: `{ id, type, kind, realm, x, y, vx, vy, facing, state, hp, maxHp, radius, solid, data }`. `x, y` in tiles (float). `data` is private server state. Public projection per type:

| `type` | `kind` values | Extra public keys |
|---|---|---|
| `player` | `player` | `n` name, `c` colour, `cl` class, `lv` level, `g` gear sprite ids `[hook, weapon, helm, coat]`, `a` anim (`idle`, `run`, `swing`, `roll`, `cast`, `fish`, `down`), `at` action progress 0–255 |
| `mob` | enemy ids | `el` elite affix id or 0, `st` status bitmask, `tg` telegraph `{shape, x, y, r, t}` when winding up |
| `boss` | boss ids | as mob + `ph` phase |
| `node` | node ids | `v` variant 0–3, `big` 0/1 |
| `drop` | `drop` | `it` item id, `q` qty |
| `structure` | structure ids | `rot`, `own` owner id, `p` progress 0–255, `on` 0/1, `it` displayed item, `lv` |
| `proj` | projectile ids | `a` angle, `own` |
| `npc` | npc ids | `q` quest marker (0 none, 1 available, 2 turn-in) |
| `summon` | `turret_pocket`, `sproutling`, `battle_scuttler` | `own` |
| `helper` | `scuttler`, `gull` | `it` carried item |
| `crop` | crop ids | `st` stage, `w` watered |
| `zone` | `tidepool`, `fire`, `ink`, `telegraph`, ... | `r` radius, `t` remaining x10 |
| `chest` | `sea_chest`, `tide_cache`, `chest` | `own` |

Entity ids are integers from a per-game counter, never reused within a session.

**Sluice contents are not entities.** Each Sluice tile is one `structure` entity whose public key `it` is the item id currently on it (or 0). `it` is patched only when the item on that tile changes; the client animates the item sliding along the tile locally from the Sluice speed. Scuttlers and Gulls are `helper` entities and are animation only (Burrow output is computed without them); at most 3 Scuttlers per Burrow and 4 Gulls per Roost are ever spawned.

### 6.6 Movement, prediction, interpolation

- `shared/rules/movement.js`: `step(body, input, stats, dt, isWalkable)` -> mutates `body {x, y, vx, vy}`. Acceleration 60 tiles/s^2, friction 50, max speed `stats.moveSpeed` x tile modifiers; circle-vs-tile collision with axis-separated resolution; dodge is a fixed-velocity state (10 tiles/s for 0.35 s).
- Client keeps a ring buffer of unacknowledged inputs. On each `snap`: set local body to `me`, re-apply inputs with `n > ack`. Render position smooths corrections under 0.5 tiles over 100 ms; larger corrections snap.
- Other entities: buffer snapshots, render at `now - 100 ms`, linear interpolation, snap if the jump exceeds 3 tiles.
- Attacks and swings are sent as actions; the client plays the swing animation immediately (prediction of feel), the server decides the result and emits `fx`.

---

## 7. Content schemas (`shared/data/*.js`)

Every file: `export default [ ... ]` (array of plain objects). `shared/data/index.js` builds `content.items.byId`, etc., runs `schema.js` validation at startup (server) and in `data.test.js`, and cross-checks references (every recipe input is an item id, every unlock id exists, every sprite id is formed by convention).

```js
// items.js
{ id:'copper_bar', name:'Copper Bar', cat:'material',      // material|component|tool|weapon|armor|trinket|rod|pack|lantern|food|tonic|seed|fish|placeable|key|trophy|relic|misc
  tier:1, value:4, stack:999,
  fuel:0,                                  // fuel units if burnable
  gear:{ slot:'hook', power:2, tier:2 },   // only for gear; weapon: {slot:'weapon', wtype:'blade', dmg:12, rate:2.0}; armor: {slot:'helm', armor:6, hp:10}
  mods:[ {stat:'critChance', op:'add', v:0.12} ],   // trinkets, armor extras
  proc:{ on:'hit', id:'burn', p:{chance:1, dmg:0.4, dur:3} },   // optional
  use:{ kind:'food', heal:80, buff:{ id:'reed_bread', dur:180, mods:[...] } },  // consumables
  places:'workbench' }                     // placeables: structure id

// recipes.js
{ id:'r_copper_bar', out:{item:'copper_bar', qty:1}, in:[{item:'copper_ore', qty:2}], fuel:1,
  station:'kiln', time:4, unlock:[] }      // station: 'hand'|structure id; time is the base time; fuel is explicit on every Kiln recipe (0 allowed); unlock: array of unlock ids, all required
// 'any wood' style inputs use groups: {group:'wood', qty:2}; groups are defined at the top of recipes.js with per-item output multipliers

// structures.js
{ id:'kiln', name:'Clay Kiln', w:2, h:2, solid:true, cat:'station',   // station|storage|farming|automation|flux|defence|utility|world|decor
  cost:[{item:'fieldstone', qty:20},{item:'peat', qty:6}], glint:0, world:false,   // world:true => cost x coopScale
  unlock:['level:2'],                       // array, ALL required, e.g. ['skill:F5','beacon:2']; forms in 7.1
  hp:200, light:0, countsToCap:false,
  station:{ inSlots:3, fuel:true, outSlots:1, queue:20, speed:1 },   // speed 2 = Kiln II, 4 = Kiln III
  container:{ slots:24, shared:true },
  machine:{ type:'burrow', flux:4, rate:16, radius:6, maxTier:4, need:8, slots:12 },   // types and params: 7.1
  generator:{ flux:20, fuelPer10s:1, cond:'none' },
  place:{ on:['land'], needs:null } }       // on: land|water|shore|soil|vein ; needs: 'hoarfrost' etc.

// nodes.js
{ id:'copper_vein', biome:'greenmarrow', tier:1, hp:3, hits:null, cls:'ore',   // cls: wood|stone|ore|plant|tidal|gem
  drops:[{item:'copper_ore', min:2, max:2},{item:'fieldstone', min:1, max:1}], xp:6,
  weight:14, big:0.08, fx:{hit:'hit_stone', brk:'break_stone'}, sfx:'tap_stone' }

// biomes.js
{ id:'saltfen', tier:2, name:'Saltfen', ground:5, weather:{clear:50, rain:25, storm:10, fog:15},
  nodeTable:['stiltwood_tree','clay_bank','bogiron_vein','kelp_tangle','salt_pan'],   // weights come from nodes
  mobs:{ day:['clatterclaw','fenleech','reedstalker','bogwisp'], night:['brine_shambler'] },
  music:'saltfen', ambient:['fireflies','water_ripple'], palette:'saltfen' }

// enemies.js
{ id:'clatterclaw', name:'Clatterclaw', tier:2, biome:'saltfen', hp:90, dmg:16, speed:2.2, xp:32, armor:20,
  ai:'guarded_melee', aiParams:{ frontBlock:0.8, windup:0.6, range:1.2, cd:1.6 },
  weak:'storm', resist:'tide', radius:0.45, night:false,
  loot:[{item:'fen_slime', min:1, max:1, p:1},{item:'shell', min:1, max:1, p:0.5}], glint:[2,6],
  blood:'teal', fxHit:'hit_armor' }

// bosses.js
{ id:'thornmother', name:'Old Thornmother', kind:'warden', k:1, hp:1500, dmg:14, enrage:360,
  lure:'lure_1', phases:[1, 0.66, 0.33], script:'thornmother',      // script file in server/game/bosses
  loot:[{item:'trophy_thornmother', p:1},{item:'thorn_locket', p:0.5},{item:'blade_2', p:0.3}], music:'boss' }

// cards.js
{ id:'c01', name:'Calloused Hands', rarity:'common', tag:'gear', max:5,
  text:'+{6*r}% gather power',
  mods:[{stat:'gatherPower', op:'add', v:0.06}],          // multiplied by rank unless perRank given
  perRank:null,                                            // or array of per-rank mods/params
  proc:null }                                              // or { on:'hit', id:'spark', p:{chance:0.05, dmg:0.4}, scale:'chance' }
// set bonuses: export const TAG_SETS = { tide:{3:{mods:[...]},6:{proc:...},9:{...}}, ... }

// skills.js
{ id:'F5', branch:'forge', row:2, col:1, cost:2, name:'Scuttler Keeper', text:'...',
  mods:[], unlocks:['struct:burrow_1'], proc:null }

// classes.js
{ id:'bulwark', name:'Bulwark', favoured:'blade', primary:'maxHp',
  passive:{ mods:[{stat:'maxHp',op:'mul',v:0.2},{stat:'armor',op:'add',v:20}], flags:['threat2x'] },
  abilities:['breakwater','anchor_slam','rally_horn','unmoored'], color:'steel' }

// abilities.js
{ id:'anchor_slam', class:'bulwark', slot:1, level:20, surge:30, cd:12, target:'point', range:6,
  params:{ dmg:2.2, radius:3, stun:1.5 }, upgrade:{ mastery:10, flags:['crater'] }, signature:{ flags:['double_slam'] },
  fx:'anchor_slam', sfx:'slam', icon:'icon.ability.anchor_slam' }

// crops.js
{ id:'tidewheat', tier:1, seed:'seed_tidewheat', stages:4, stageTime:60, yield:[2,3], regrows:false, nightOnly:false }

// fish.js
{ id:'pearl_gar', biome:'saltfen', tier:2, rarity:'rare', weight:4, value:120, cond:{ tide:'low' }, difficulty:0.6 }

// weather.js
{ id:'storm', name:'Storm', dur:[360,600], mods:[...], flags:['lightning','rain'], fx:'storm_rain', sfx:'amb_storm' }

// dungeons.js
{ id:'rootbound_vault', k:1, biome:'greenmarrow', floors:3, rooms:[7,10], keeper:'sporeking',
  mobs:['mossback','thistlewisp','burrowgrub'], tileset:'vault_root', mechanic:'spores',
  key:'vault_key_1', firstReward:[{item:'vault_core_1', qty:1}], music:'vault' }

// blessings.js
{ id:'blessing_chain', name:'Forked Current', text:'Attacks chain to 1 extra enemy', mods:[], proc:{on:'hit', id:'chain', p:{n:1, dmg:0.5}} }

// quests.js
{ id:'q06', type:'main', name:'Little Helpers', giver:null, prereq:'q05',
  goals:[{ kind:'build', target:'burrow_1', n:1 }],       // kinds: build|craft|collect|deliver|kill|raise|clear|catch|donate|counter|reach
  rewards:{ glint:0, xp:2000, items:[{item:'iron_plate', qty:10}] } }

// npcs.js
{ id:'npc_ferrin', name:'Ferrin the Ropewalker', biome:'greenmarrow', quests:['s_ferrin_1','s_ferrin_2','s_ferrin_3'],
  shop:[{item:'seed_tidewheat', price:2, stock:20}], lines:{ greet:[...], idle:[...] } }

// archive.js
{ id:'wing_metal', name:'Metals', items:[...12 ids], reward:{ mods:[...], skillPoint:1 } }

// deeds.js
{ id:'d_nodes', cat:'gather', name:'Hookhand', counter:'nodes_broken', tiers:[1000,10000,100000], cosmetic:'cos_d_nodes', world:false }

// rebirth.js
{ id:'moon_xp', name:'Bright Wake', ranks:3, cost:[1,2,3], mods:[{stat:'xpMult',op:'mul',v:0.10}] }
```

Deeds counters: exactly the 60 names in the Counter column of `DESIGN.md` Appendix A.7, incremented through the `counter` service (`null` player = world counter).


---

### 7.1 Registries (closed vocabularies)

These lists are complete. They live in `shared/data/registries.js` as frozen arrays/objects; `schema.js` rejects any value not listed. Adding a value means editing this document first.

**Stacking rule.** A modifier is `{ stat, op, v }`. `op: 'add'` values for the same stat are summed into one bucket (percentages are written as fractions: 0.06 = 6%). `op: 'mul'` is allowed only in class passives, card set bonuses and Moon Chart perks. `final = (base + sumAdd) * product(1 + mul)`, then the cap.

**Player stats** (`game.stats.of(player)`):

| id | Base | Cap | Meaning |
|---|---|---|---|
| `maxHp` | 100 + 8/level | — | |
| `hpRegen` | 0.5 | — | HP/s |
| `maxSurge` | 100 | — | |
| `surgeRegen` | 5 | — | per s |
| `surgeCost` | 0 | -0.5 | fraction added to ability costs |
| `cdr` | 0 | 0.5 | cooldown reduction |
| `power` | 0.01/level | — | weapon damage fraction |
| `abilityPower` | 0 | — | ability damage fraction |
| `summonPower` | 0 | — | turret/summon damage |
| `summonDuration` | 0 | — | |
| `gatherPower` | 0.01/level | — | hook damage fraction |
| `swingSpeed` | 0 | 1.5 | fraction over 2.0 swings/s |
| `critChance` | 0.05 | 0.75 | |
| `critMult` | 1.5 | — | |
| `armor` | 0 | — | |
| `dmgTaken` | 0 | -0.6 | fraction (negative reduces) |
| `elemResist` | 0 | 0.75 | |
| `lifesteal` | 0 | 0.15 | |
| `thorns` | 0 | 1.0 | melee reflect fraction |
| `bossDmg`, `eliteDmg` | 0 | — | extra damage fraction |
| `burnDmg`, `slowPotency` | 0 | — | status strength |
| `moveSpeed` | 0 | 0.8 | fraction over 5.0 tiles/s |
| `dodgeCharges` | 2 | 5 | |
| `dodgeRecharge` | 0 | -0.6 | fraction |
| `luck` | 0 | 100 | |
| `xpMult` | 0 | 1.5 | fraction (total x2.5) |
| `nightXp` | 0 | — | extra at night |
| `yieldAll`, `yieldWood`, `yieldStone`, `yieldOre`, `yieldPlant`, `yieldTidal`, `yieldMob`, `yieldCrop` | 0 | sum of `yieldAll` + the class-specific one <= 2.0 (total x3.0) | drop quantity fractions |
| `glintMult` | 0 | 1.0 | Glint from all sources |
| `glintMob` | 0 | — | Glint from mobs |
| `sellMult` | 0 | 0.5 | sell price |
| `craftSpeed`, `kilnSpeed` | 0 | 2.0 | |
| `structCost` | 0 | -0.25 | structure cost fraction |
| `landDiscount` | 0 | 0.2 | summed over all players |
| `pickupRadius` | 2.0 | 8 | tiles |
| `invSlots` | 24 | 80 | |
| `fishBite` | 0 | -0.6 | bite time fraction |
| `cropGrowth` | 0 | 2.0 | near the player |
| `buffDuration`, `foodHeal` | 0 | 1.0 | |
| `reviveSpeed` | 0 | 1.0 | |
| `lightRadius` | 5 | 14 | tiles |
| `tidalDuration` | 0 | 0.5 | low-tide extension on the player's plot |
| `draftOffers` | 3 | 5 | |
| `draftRarePlus` | 0 | 0.2 | percentage points |
| `machineNear` | 0 | — | speed bonus to machines within `machineNearRadius` (6 or 8 by source) |
| `threat` | 1 | — | |

**World stats** (`game.stats.world()`; sources registered with `game.stats.addWorldSource(name, fn)`; used by WP7, WP8, WP9):

| id | Cap | Sources |
|---|---|---|
| `machineSpeed` | 2.0 (total x3.0 with `machineNear`) | u12, m06, F10, Gear 5-set, Archive `wing_works`, Tidegate stages, Moon Chart |
| `scuttlerRate` | inside the machine cap | u13, m06 (+0.33), Gear 7-set (+0.33) |
| `machineCap` | +6 | F10, e06 |
| `fluxUse` | -0.3 | e06 |
| `nodeRespawn` | 0.5 | H6, r05 |
| `kilnSpeedWorld` | 1.0 | Archive `wing_metal`, Ember 5-set |
| `cropGrowthWorld` | 1.0 | Archive `wing_harvest` |
| `fishBiteWorld` | -0.3 | Archive `wing_angler` |
| `yieldWoodWorld`, `yieldStoneWorld` | 0.1 | Archive wings |
| `luckWorld`, `dmgWorld` | — | Archive wings |
| `xpWorld` | 0.3 | Beacons (+0.05 each) |
| `landDiscountWorld` | joins the 0.2 cap | Quill |
| `satRecover` | x2 | G8 |
| `lampRadius` | — | Ysolde |

**Proc triggers** (`proc.on`): `hit` (weapon hit), `crit`, `kill`, `hurt` (player damaged), `dodge`, `cast`, `abilityHit`, `swing` (any tool or weapon swing), `nodeHit`, `nodeBreak`, `harvest`, `fishCatch`, `craft`, `smelt`, `machineCraft`, `tick` (1 Hz), `death`, `drop` (any item drop roll).

**Proc ids** (`proc.id`; implemented in `systems/procs.js`, WP6a; params are the only keys allowed):

| id | Params | Used by |
|---|---|---|
| `chill` | `slow, dur, max` | c24, `frost_bead`, `bl_chill` |
| `spark` | `chance, dmg, range` | c25, `bl_spark` |
| `burn` | `chance, dmg, dur` | c26, `kiln_ember`, `bl_burn` |
| `splinter` | `chance, mult, cls` | u01 |
| `chain_break` | `chance, radius, mult, cls` | u02 |
| `double_catch` | `chance` | u03 |
| `ricochet` | `chance, dmg` | u04, `bl_chain` |
| `dmg_vs_status` | `status, bonus, critOnly?` | u06, r14, `antler_tine` |
| `burn_spread` | `chance, radius` | u07 |
| `stack_buff` | `stat, per, max, decay` | u08, u21, C8 |
| `seed_return` | `chance` | u09 |
| `windfall` | `chance` | u10 |
| `dodge_shield` | `pct, dur` | u15 |
| `dmg_vs_hp` | `below?, above?, bonus` | u17, u18 |
| `bonus_output` | `chance` | u20 |
| `refund` | `chance` | u23 |
| `freeze_attacker` | `chance, dur` | u24 |
| `surge_on_kill` | `amount` | u25 |
| `nth_hit_wave` | `n, dmg, len` | r01 |
| `death_explode` | `status, dmg, radius` | r02, Ember 7-set |
| `chill_freeze` | `stacks, dur, icd` | r03 |
| `crit_lightning` | `dmg, icd` | r04 |
| `node_bonus_drop` | `cls, item, chance` | r07, H9 |
| `low_hp_buff` | `below, mods` | r08 |
| `double_swing` | `chance` | r09 |
| `harvest_streak` | `n, window, mods, dur` | r10 |
| `machine_free` | `chance` | r11 |
| `dmg_per_debuff` | `bonus` | r13 |
| `burn_attacker` | `dmg, dur` | r15 |
| `dodge_trail` | `dmg, dur` | r17 |
| `fish_bonus` | `item, chance` | r18 |
| `ability_pull` | `dist` | e01 |
| `revive` | `hp, cd` | e02, `bl_revive` |
| `freeze_extend` | `dur, bossSlow` | e03 |
| `chain_extra` | `n, mult` | e04, Storm 5-set |
| `sapling` | `radius, growth, regen` | e05 |
| `kill_stack_perm` | `per, cap` | e08 |
| `nth_swing_shockwave` | `n, dmg, radius` | e09 |
| `auto_swing` | `interval, range` | e10 |
| `inv_smelt` | `interval` | e11 |
| `shallows_walk` | `highTideNodes` | e12 |
| `double_cast` | `interval` | m01 |
| `burn_stack` | `max, mult` | m02 |
| `aura_slow` | `radius, slow, novaOnFrozenKill` | m03 |
| `periodic_lightning` | `interval, dmg, range` | m04, Storm 7-set, `storm_vial` |
| `node_regrow` | `chance` | m05, H12 |
| `luck_twice` | — | m07 |
| `glint_echo` | `pct` | m07 |
| `heal_on_kill` | `pct` | m08 |
| `wide_swing` | `arc` | H2 |
| `double_drop` | `chance` | H10 |
| `cheat_death` | `cd` | C10 |
| `ability_crit` | — | T10 |
| `opener` | `idle, mult` | T12 |
| `jackpot` | `chance, mult` | G11 |
| `blind_on_crit` | `dur` | `prism_eye` |
| `ability_echo` | `mult, delay` | `choir_bell` |
| `projectile_split` | `mult` | `twin_lens` |
| `kiln_boost` | `bonus, dur` | `bellows_valve` |
| `puddle` | `slow, dur` | Tide 5-set |
| `heal_orb` | `chance, pct` | `bl_orbs` |
| `companion` | `kind` | `bl_pup` |
| `periodic_wave` | `interval, dmg, radius` | `bl_nova` |

**Statuses** (`applyStatus`; owned by `systems/status.js`, WP5): `burn` (power = dmg/s), `bleed`, `chill` (stacking slow), `slow`, `freeze`, `stun`, `root`, `mark` (power = extra damage taken), `blind`, `silence`, `shield` (power = absorb), `taunt`, `haste`, `invuln`, `unstoppable`, `downed`. Debuffs for `clearStatus('debuffs')` and `dmg_per_debuff`: burn, bleed, chill, slow, freeze, stun, root, mark, blind, silence.

**Elements**: `none`, `ember`, `frost`, `storm`, `tide`, `hollow`.

**Elite affixes**: `swift`, `plated`, `volatile`, `leeching`, `splitting`, `shrouded` (effects in DESIGN A.3).

**AI archetypes** (`enemy.ai`; one file each in `server/game/ai/`, WP5) and the `aiParams` keys each reads:

| Archetype | Params | Enemies |
|---|---|---|
| `charger` | `windup, chargeSpeed, chargeDist, cd` | mossback, dune_maw (with `burrow: true`) |
| `kiter` | `keepDist, shotCd, proj, fan?` | thistlewisp, sleetspitter (`fan: 3`) |
| `burrower` | `windup, cd, hideTime` | burrowgrub |
| `swarm` | `groupSize, lightSeek` | lantern_moth |
| `guarded_melee` | `frontBlock, windup, range, cd` | clatterclaw |
| `lunger` | `lungeDist, latchTime, heal, cd` | fenleech |
| `ambusher` | `disguise, revealDist, burst` | reedstalker, pale_shade (`disguise: 'invisible'`) |
| `teleport_caster` | `shotCd, proj, homing, blinkOnHit` | bogwisp |
| `shambler` | `groupSize, fromWater` | brine_shambler |
| `exploder` | `fuse, radius` | cinderling |
| `trail_tank` | `trail, trailDur, slamCd?` | slagback, frostbulk (`slamCd`) |
| `diver` | `circleDist, diveCd, lineLen, fromOffscreen?` | ashwing, stillwing |
| `turret_lobber` | `shotCd, proj, arc` | magmaw, inkmaw (`pool: 'ink'`) |
| `phaser` | `passStructures, touchStatus` | emberwraith |
| `skirmisher` | `zigzag, stabCd` | shardscuttle |
| `illusionist` | `clones, cloneCd` | mirage_stalker |
| `beam_turret` | `charge, sweep, dps, summons?` | prism_sentinel, abyss_eye (`summons: 'hollowling'`) |
| `splitter` | `into, count` | glass_revenant |
| `pack_hunter` | `packSize, flank, howlCd` | rimewolf |
| `blinker` | `blinkCd, behind` | hollowling |
| `mimic` | `copyRange` | refrain_knight |
| `support_shield` | `radius` | gloom_lantern |
| `wave_rider` | `waveSpeed, vulnWindow` | tidewraith |

**Machine types** (`structure.machine.type`; WP8) and their params:

| Type | Params | Structures |
|---|---|---|
| `burrow` | `rate` (units/min), `radius`, `maxTier`, `need`, `slots` | `burrow_1..3` |
| `mover` | `interval` (s), `filter` (bool) | `spillway`, `grabber`, `filter_grabber` |
| `sluice` | `speed` (tiles/s) | `sluice_1..3` |
| `splitter` | — | `splitter` |
| `hopper` | `radius`, `slots` | `hopper` |
| `autobench` | `maxTier`, `speed`, `inSlots`, `outSlots` | `autobench_1..3` |
| `drill` | `rate`, `rareShare`, `perPlot` | `drill` |
| `tiller` | `radius`, `interval` | `tiller_bot` |
| `producer` | `item` or `table`, `interval`, `cond`, `slots` | `drip_collector`, `sap_tap`, `creel`, `hum_hive`, `trawl_buoy` |
| `courier` | `gulls`, `carry`, `speed` | `gull_roost` |
| `seller` | `rate` (items/min), `pct`, `satKey?` | `ledger_post`, `mint` |
| `echo` | `interval` | `echo_chamber` |
| `generator` | `flux`, `fuelPer10s`, `cond` (`none`, `shore`, `day`, `hoarfrost`, `echoglass`) | all five generators |
| `turret` | `range`, `dmg`, `rate`, `chain` | `bolt_turret`, `arc_spire` (logic in WP5 `defence.js`) |

**Ability schema keys** (`abilities.js`; WP6b): `target` is one of `self`, `point`, `dir`, `enemy`, `ally_or_machine`. `params` keys allowed: `dmg`, `radius`, `range`, `len`, `width`, `dur`, `tick`, `hits`, `stun`, `slow`, `pull`, `heal`, `block`, `reflect`, `armor`, `speed`, `count`, `max`, `summon`, `mark`, `charges`, `gather`, `yieldMult`, `xpMult`, `stages`. `upgrade` and `signature` are `{ params?: {...}, flags?: string[] }`; flags are free-form strings read only by that ability's own file in `server/game/abilities/`.

**Boss scripts** (`bosses.js` `script`): `thornmother`, `mire_regent`, `kilnheart`, `prismarch`, `glacier_antler`, `hollow_choir` (WP5, `server/game/bosses/`); `sporeking`, `barnacle_bell`, `bellows_engine`, `twin_lenses`, `thawless_knight`, `scribe` (WP10, `server/game/dungeon/keepers/`); `drowned_moon` (WP11, inside `finale.js`).

**Dungeon mechanics** (`dungeons.js` `mechanic`): `spores`, `water_level`, `conveyors`, `mirrors`, `ice_blocks`, `darkness`.

**Quest goal kinds**: `build`, `craft`, `collect`, `deliver`, `kill`, `kill_elite`, `raise`, `clear`, `catch`, `donate`, `counter`, `reach` (level, Flux, Trench floor), `temper`, `solve`.

**Unlock ids** (the `unlock` field is an **array; every entry must hold**): `level:N` (per player), `skill:<id>` (world: any bound player owns it), `beacon:N`, `quest:<id>`, `boss:<id>`, `vault:N`.

**Buff ids**: every food and tonic id from DESIGN 6.5, plus `rested`, `wake`, `overclock`, `rally`, `motherlode`, `vein_sense`, `unmoored`, and `set_<tag>` markers.

---

## 8. Client architecture

### 8.1 Frame pipeline (`render/renderer.js`)

Internal resolution = `ceil(window / zoom)`; the game draws to an offscreen canvas at 1x and blits to the visible canvas scaled by the integer zoom with `imageSmoothingEnabled = false`. UI draws at its own integer scale on top.

Order per frame:
1. Update: input -> prediction -> interpolation -> particles -> juice timers -> ambient.
2. Camera (follow, look-ahead, shake offset, clamp).
3. Water background (animated 2-frame pattern, sunken-plot silhouettes for unraised plots).
4. Tile chunks (pre-rendered per chunk to a canvas; re-rendered on `chunk`/`tiles` messages and on tide change).
5. Ground decals and `ground` particle layer.
6. Y-sorted entities: each visible entity is drawn by its drawer `draw(ctx, e, t, view)`; shadows first.
7. `world` particle layer, floating damage numbers.
8. Lighting (night multiply layer with punched lights), weather layers.
9. `overlay` particle layer, screen flashes, vignette.
10. HUD widgets, panels, tooltips, `ui` particle layer, cursor.

Drawer interface: `export default { kinds:['sluice_1','sluice_2','sluice_3'], types:[], draw(ctx, e, time, view) {}, bounds?(e) }`. Dispatch: a drawer whose `kinds` contains `e.kind` wins; otherwise the drawer whose `types` contains `e.type`. `structure.js` (WP1b) is the type-level fallback for `structure`; `machine.js`, `sluice.js` (WP8) and `crop.js` (WP9) claim kinds. `scuttler.js` claims kind `scuttler`, `gull.js` claims `gull`; `zone.js` (WP5) draws type `zone`; `chest.js` (WP4) draws type `chest`.

Performance budget: 60 fps with 400 visible entities and 2,000 particles on a mid laptop. Rules: no per-frame allocation in hot loops, no `getImageData` after boot, chunk canvases cached, entity culling by view rectangle.

### 8.2 Input

`input.js` exposes `axis()`, `aimTile()`, `pressed(action)`, `held(action)`. Actions are names (`primary`, `interact`, `dodge`, `ability1..4`, `panel.inventory`, ...) mapped from keys per DESIGN section 3; rebinding stored in localStorage. When a UI panel has focus, gameplay actions are suppressed.

### 8.3 UI framework (`ui/ui.js`, `ui/widgets.js`)

Immediate-mode-style on canvas. A panel module:

```js
export default {
  id: 'inventory', key: 'panel.inventory', modal: false, w: 220, h: 160, anchor: 'center',
  open(store, args) {}, close() {},
  draw(ui, store) {            // ui: widget helper bound to this panel's rect
    ui.frame('Inventory');
    for (...) ui.slot(x, y, stack, { onClick, onDrop, tooltip });
    if (ui.button(x, y, 'Sort')) net.do('inv.sort', {});
  },
};
```

Widgets: `frame`, `label`, `button`, `iconButton`, `slot`, `bar`, `tabs`, `list` (scroll), `grid`, `tooltip`, `progress`, `cost` (ingredient list with have/need colouring), `dragGhost`. All take pixel coordinates in panel space. Open/close animation (slide 120 ms with overshoot) and click/hover sounds are applied by the framework, not by panels.

HUD widget module: `export default { id, anchor:'top-left', order, draw(ui, store) }`.

Pixel font: `render/text.js` holds a 5x7 glyph table as strings for ASCII 32–126 plus arrows and icons; text is rendered to cached canvases keyed by `(string, colour, outline)`.

---

## 9. Sprite generation

No image files. Three mechanisms, all in `client/art/`:

### 9.1 Master palette (`art/palette.js`)

One palette of 64 colours, each bound to a single character: `.` transparent, `0-9`, `a-z`, `A-Z`, and `#`. Organised as 12 ramps of 5 shades (dark to light): stone grey, warm brown, sand, grass green, teal, sea blue, ember red-orange, gold, violet, ice blue, flesh/cream, ink black-purple; plus pure white, pure black, and 2 accent colours. Exported as `PAL = { 'a': '#rrggbb', ... }` and `RAMPS = { stone:['1','2','3','4','5'], ... }`. Per-biome tints are ramp choices, not new colours. This single palette is what keeps all generated art coherent.

### 9.2 Pixel maps (`art/sprites/*.js`)

```js
export default {
  'item.copper_bar': { w: 16, h: 16, px: [
    '................',
    '................',
    '.....111111.....',
    // 16 rows of 16 palette characters
  ] },
  'mob.mossback': { w: 16, h: 16, fps: 6,
    anims: { idle: [ [/*rows*/], [/*rows*/] ], walk: [ ... 4 frames ], hit: [ ... 1 ], windup: [ ... 2 ] },
    mirror: true },                       // left-facing frames produced by mirroring
  'item.hook_3': { ref: 'item.hook_1', swap: { '7': 'c', '8': 'd' } },     // palette swap of another sprite
};
```

Conventions:

| Category | Id pattern | Size | Frames |
|---|---|---|---|
| Items | `item.<itemId>` | 16x16 | 1 |
| Nodes | `node.<nodeId>` (+ `.v0..v3` variants generated by `swap`/mirror) | 16x16, trees 16x32, big x1.5 scale via generator | 1 + `hit` frame auto-generated (squash) |
| Structures | `struct.<id>` | w*16 x h*16 (+16 tall for 2-tile-high art) | 1–4 (working animation) |
| Mobs | `mob.<id>` | 16x16 (large 24x24, 32x32) | idle 2, walk 4, windup 2, attack 2 |
| Bosses | `boss.<id>` | 48x48 to 80x80, built from parts via `art/gen/big.js` | per-part |
| Player | layered: `pl.body`, `pl.outfit.<class>`, `pl.hat.<id>`, `pl.hook.<tier>`, `pl.weapon.<type>.<tier>` | 16x20 | 4 directions x (idle 2, run 4, swing 3, roll 4) |
| Icons | `icon.<group>.<id>` | 12x12 or 16x16 | 1 |
| Decor | `decor.<id>` | varies | 1–4 |

Gear tiers reuse one base sprite per type with palette swaps per tier (7 hooks = 1 drawing + 6 swaps). This keeps hand-authored pixel maps to roughly 420 sprites total.

### 9.3 Generator functions (`art/tilegen.js`, `art/gen/*.js`)

For things that need variety or size:

```js
// art/gen/biomes.js
export const tiles = {
  greenmarrow: (g, rng) => { /* g: {set(x,y,ch), fill(ch), noise(scale), dither(a,b,p)} draw a 16x16 tile */ },
};
```

- Ground tiles: 4 variants per ground type from seeded noise + ordered dithering between two ramp shades; flowers/pebbles/cracks sprinkled by biome.
- Autotile: shoreline and biome borders use a 16-case 4-bit mask; the engine composites edge strips (foam line, sand lip) generated once per pair.
- Water: 2-frame scrolling highlight pattern; tidal flats get a wet-sand variant with a moving foam edge.
- Large sprites (Beacon, Tidegate stages, bosses): composed from primitives (`rect`, `ellipse`, `line`, `mirrorX`, `shade(ramp, lightDir)`).

### 9.4 Atlas and variants (`art/spritegen.js`)

At boot: parse all definitions -> draw each frame to a shared atlas canvas via `ImageData` -> record rects. Then auto-derive per sprite: `outline` (1 px darkest-ramp border, used for entities), `flash` (all opaque pixels white), `shadow` (flattened ellipse), `silhouette` (single colour, used for locked icons and sunken plots), `mirrored`. API:

```js
sprites.draw(ctx, id, x, y, { frame, anim, time, flip, variant, scaleX, scaleY, alpha });
sprites.has(id); sprites.size(id);
sprites.icon(id)   // returns a small cached canvas for UI
```

Placeholder: `sprites.draw` with an unknown id generates and caches a 16x16 rounded tile whose colour is a hash of the id and which shows the first two letters. The game is therefore fully playable before WP3 lands.

Boot time target: under 1.5 s for all sprites. `test/sprites.test.js` validates in Node (no canvas): every `px` row length equals `w`, row count equals `h`, every character exists in the palette, every `ref` resolves, and every item/node/structure/enemy id in `shared/data` has a sprite definition.

---

## 10. Particle and juice API

### 10.1 Engine (`fx/particles.js`)

Struct-of-arrays pool, capacity 4,096, typed arrays (`x, y, vx, vy, life, maxLife, size0, size1, rot, vr, colorIdx, shape, layer, gravity, drag, flags`). Oldest particles are recycled when full. Update and draw are single loops; drawing batches by layer and blend mode.

```js
particles.define(name, preset);                    // register
particles.emit(name, x, y, opts);                  // world coords (tiles). opts: { dir, color, scale, count, target:{x,y}, follow:entityId }
particles.emitter(name, x, y, opts) -> handle;     // continuous; handle.stop(), handle.move(x,y)
particles.update(dt); particles.draw(ctx, layer, view);
```

Preset schema:

```js
{
  count: [6, 8],                 // per burst
  rate: 0,                       // per second for continuous emitters
  life: [0.3, 0.5],              // seconds
  speed: [2, 5],                 // tiles/s
  angle: 0, spread: 6.283,       // radians; angle is relative to opts.dir if relDir:true
  relDir: false,
  gravity: 12, drag: 2,          // tiles/s^2, 1/s
  size: [2, 0],                  // px start -> end
  colors: ['c', 'd', 'e'],       // palette chars; picked at random or 'ramp' over life
  colorMode: 'pick',             // pick | ramp
  shape: 'px',                   // px | circle | ring | spark | shard | leaf | star | plus | glyph | streak | sprite
  sprite: null,                  // sprite id when shape is 'sprite'
  blend: 'normal',               // normal | add
  layer: 'world',                // ground | world | overlay | ui
  spin: [0, 0], sway: 0,         // rad/s, sine drift amplitude
  area: [0, 0],                  // spawn rectangle half-extents (tiles)
  seek: null,                    // { to:'target'|'ui:xp'|'ui:glint'|'ui:deck', ease:'in', after:0.2 } homing motes
  trail: 0,                      // leave n-pixel trail
  sub: [],                       // [{ preset:'dust_ring', at:'spawn'|'death' }] chained presets
  shake: 0, flash: null, decal: null   // juice hooks fired with the burst
}
```

WP12 implements all 126 preset names (89 in `DESIGN.md` 19.1 plus 37 in Appendix A.8) with exactly those names. `test/fx-audio.test.js` asserts every name exists.

### 10.2 Juice (`fx/juice.js`)

```js
juice.shake(px, seconds);            // trauma-based, scaled by settings
juice.hitstop(ms);                   // freezes local render time (not network time)
juice.flash(color, alpha, seconds);  // respects reduce-flashing
juice.squash(entityId, sx, sy, seconds);
juice.number(x, y, text, style);     // floating numbers: dmg | crit | heal | xp | glint | miss
juice.slowmo(factor, seconds);       // affects particles and animations only
juice.vignette(color, alpha);        // persistent (low HP, eclipse)
```

### 10.3 FX routing

Server: `game.fx(realm, name, x, y, params)` queues into the per-tick `fx` batch for clients within interest range. Client `fx/router.js`: looks up `FX_MAP[name] = { particles, sfx, shake, hitstop, number }` and fires them; if `name` matches a particle preset directly it emits it. Gameplay builders only ever call `game.fx(...)` with a DESIGN name.

---

## 11. Audio API (`client/audio/`)

WebAudio, created on first user gesture. Graph: voices -> category gain (`sfx`, `music`, `amb`, `ui`) -> master compressor -> destination. Max 24 simultaneous SFX voices (oldest stolen). Positional: volume and stereo pan from distance to camera centre (silent beyond 20 tiles).

```js
audio.play(name, { x, y, pitch, vol });     // SFX by name; unknown names are ignored
audio.music(trackId, { fade: 1.5 });        // crossfade
audio.ambience(id, level);                  // 0..1
audio.setVolume(category, v);
audio.pickupCombo();                        // climbing pentatonic pickup blip
```

SFX definition (`audio/sfx.js`):

```js
'tap_wood': { layers: [
  { wave:'square', freq:[180, 90], dur:0.07, env:[0.002, 0.03, 0, 0.03], vol:0.5, duty:0.25 },
  { wave:'noise',  filter:{ type:'bandpass', f:900, q:1.2 }, dur:0.04, env:[0.001, 0.02, 0, 0.02], vol:0.3 },
], pitchVar:0.06 }
// wave: sine|square|triangle|saw|noise ; freq: [start, end] exponential sweep ; env: [attack, decay, sustain, release]
// optional: vibrato:{rate, depth}, arp:[semitones...], arpRate, delay:{time, fb, mix}, dist:amount
```

Required SFX names (WP12): `tap_wood, tap_stone, tap_plant, tap_ice, tap_null, clink, break_wood, break_stone, break_plant, break_crystal, pickup, pickup_rare, swing, swing_heavy, hit_flesh, hit_armor, crit, hurt, death, dodge, footstep_land, footstep_water, footstep_snow, levelup, card_flip, card_pick, card_mythic, skill_buy, craft_done, kiln_loop, build_place, build_remove, deny, ui_click, ui_hover, ui_open, ui_close, glint, chest_open, plot_rise, tide_out, tide_in, thunder, rain_loop, wind_loop, surf_loop, crackle_loop, cast, slam, whoosh, bolt, wave, heal, shield, burn, freeze, shatter, zap, explode, summon, turret_shot, machine_hum, sluice_tick, flux_low, fish_cast, fish_bite, fish_reel, fish_catch, water_pour, crop_pop, boss_roar, boss_phase, boss_death, telegraph, quest_done, donate, beacon_light, warp, revive, ping, raid_horn, eclipse, moonfall`.

Music (`audio/music.js`, `audio/tracks.js`): a step sequencer scheduled 100 ms ahead with `AudioContext.currentTime`.

```js
{ id:'greenmarrow', bpm:96, scale:[0,2,4,7,9], root:48, bars:8,
  channels: {
    bass:  { wave:'triangle', pattern:'x...x...x..x.x..', notes:'degree walk', vol:0.5 },
    lead:  { wave:'triangle', gen:'melody', density:0.45, range:[60,79], vol:0.4 },
    pad:   { wave:'sine', chords:[[0,2,4],[3,5,7],[4,6,8],[0,2,4]], vol:0.25 },
    drums: { kick:'x...x...', hat:'..x...x.', snare:'....x...', vol:0.3 } },
  night: { bpm:-12, lead:{ density:0.25 }, pad:{ vol:0.35 } } }
```

Melodies are generated per 8 bars from a seeded random walk on the scale with motif repetition (A A' B A), so tracks are recognisable but not identical loops. Tracks: `title, greenmarrow, saltfen, emberreach, glasswaste, hoarfrost, umbral, vault, boss, trench, moon, raid` plus automatic night variants.

---

## 12. Save format

`saves/<world>.json`, written atomically (`.tmp` then rename), autosave every 60 s and on shutdown (`SIGINT`, `SIGTERM`), keeping `<world>.bak1..5.json` rotated every 10 minutes.

```json
{
  "version": 1,
  "seed": 123456789,
  "createdAt": 1790000000000,
  "playtimeS": 86400,
  "world": {
    "time": 512.4, "day": 37, "glint": 15230, "tideHeight": 0,
    "plots": [ { "px": 4, "py": 4, "owned": true, "ordinal": 0, "feature": "start" } ],
    "flags": { "beacon:1": true, "struct:burrow_1": true },
    "bound": ["token-a", "token-b"]
  },
  "realms": {
    "overworld": {
      "tilePatches": [[81, 92, 10, 2]],
      "nodes": [[kindIndex, tx, ty, hp, variant]],
      "structures": [ { "id": 5012, "kind": "kiln", "tx": 82, "ty": 90, "rot": 0, "owner": "token-a", "state": {} } ],
      "drops": [], "chests": []
    }
  },
  "profiles": {
    "token-a": {
      "name": "Ada", "color": 3, "playtimeS": 40000, "x": 85.2, "y": 91.0, "realm": "overworld",
      "level": 41, "xp": 12050, "hp": 420,
      "inv": [["copper_bar", 40], null], "hotbar": [0, 4, null], "gear": { "hook": "hook_4" , "temper": { "hook_4": 3 } },
      "cards": { "owned": { "c01": 3 }, "tokens": 2, "banished": [], "pending": [], "pity": 1, "seed": 99 },
      "skills": { "points": 2, "owned": ["H1", "F5"] }, "class": { "id": "prospector", "mastery": { "prospector": 7 } },
      "quests": {}, "deeds": {}, "counters": {}, "moon": { "shards": 0, "perks": {} }, "cosmetics": [],
      "sys": { "cards": {}, "skills": {}, "quests": {}, "deeds": {} }
    }
  },
  "systems": { "clock": {}, "market": { "sat": {} }, "machines": {}, "farming": {}, "quests": {}, "archive": {}, "tidegate": {} },
  "nextEntityId": 90211
}
```

Rules: tiles are **not** stored wholesale; the overworld is regenerated from `seed` + owned plots, then `tilePatches`, nodes, and structures are applied. Dungeon instances are not saved (players inside are returned to the entrance on load). Mobs and projectiles are not saved. Each system's `save()` result goes under `systems[name]`; `load()` must accept `undefined` (new world) and old shapes (`persistence/migrate.js` upgrades by `version`). Target size: under 2 MB at hour 100.

Per-player data: the top-level profile fields shown above are written by WP1a (`player.js`: name, colour, position, level, xp, hp, inventory, hotbar, gear). Everything else a system keeps per player is returned by that system's `saveProfile(game, player)` and stored under `profiles[token].sys[<system name>]`; `loadProfile` receives it on join. The `cards`, `skills`, `class`, `quests`, `deeds`, `counters`, `moon` keys in the example are illustrations of such data and live under `sys`.

Structure state: `entity.data` of every structure must be JSON-serialisable; WP1a saves it verbatim under the structure's `state` and restores it verbatim on load (this includes `data.paid`, station slots, machine config, tend meters). Systems must not keep structure state anywhere else.

Telemetry: `world.flags` records `gate:<name> = playtimeS` for the first plot, each Vault clear, each Warden, each Beacon, each Tidegate stage and the final boss.

---

## 13. Test harness

`test/harness.js`:

```js
import { createHarness } from './harness.js';
const h = await createHarness({ seed: 1, players: 1 });   // real Game, no sockets, no timers
const p = h.player(0);
h.do(p, 'build.place', { kind: 'workbench', tx: 90, ty: 90, rot: 0 });   // returns the 'res' object
h.input(p, { mx: 1, my: 0 }); h.step(2.0);                                 // seconds of simulation at 20 Hz
h.give(p, 'copper_ore', 20); h.setLevel(p, 20); h.raise(4, 3);             // cheats for setup
h.sent(p, 'self', 'inv');                                                  // last message of that kind to this fake client
h.game                                                                     // full access for assertions
```

`test/run.js` runs every `*.test.js` (or those matching `process.argv[2]`), each exporting `export default async function (t) { t.test('name', async () => { ... }) }`. Assertions from `test/assert.js` (`eq`, `near`, `ok`, `throws`). Exit code 1 on any failure.

Minimum test content per package is listed with each work package below.

---

## 14. Build order and work packages

```
Wave 0:  WP1a (server + shared skeleton)   and   WP2 (registries, schema, all content data)      in parallel
         WP1b (client skeleton) starts as soon as WP1a has committed shared/config.js and shared/protocol.js (its first task)
Wave 1:  WP3  WP4  WP5  WP6a  WP6b  WP7  WP8  WP9  WP10  WP11  WP12  WP13                         in parallel
Wave 2:  WP14 (integration, balance, save hardening)
```

Wave 1 starts only when WP1a, WP1b and WP2 are merged, so every Wave-1 builder has the real registries and the full content data, not samples. WP2 needs nothing from WP1a except the schemas in section 7 of this document, which is why the two can run side by side.

In the file tree (section 3): **"WP1" means WP1a for everything under `server/`, `shared/`, `test/` and the root, and WP1b for everything under `client/`.** "WP6" is split per file as listed under WP6a and WP6b below. Every file has exactly one owner.

Wildcard folders (`server/game/ai/`, `server/game/bosses/`, `server/game/abilities/`, `server/game/dungeon/keepers/`, and the `rooms-*.js` files) are not listed in any registry file: `server/game/loader.js` (WP1a) loads every `.js` file in them at startup with `fs.readdir` + dynamic `import()`. Each file default-exports an object with an `id`. The owning package may add files freely.

### WP1a — Server and shared skeleton
**Goal:** `npm start` serves the client and runs an authoritative world: players join, move with server reconciliation, hit stub nodes, pick up drops into an inventory; the world saves and reloads; `npm test` runs.

**Owns:** `package.json`, `README.md`, `saves/.gitkeep`; `server/main.js`, `server/http-static.js`, `server/net/*`, `server/game/game.js`, `realm.js`, `entities.js` (incl. dirty-key tracking), `spatial.js`, `bus.js`, `services.js` (registry, defaults, `registerInteract`, `registerPlaceValidator` and `registerIO` dispatch tables), `statbook.js` (player and world sheets, caps), `inventory.js`, `player.js`, `loader.js`, `server/game/worldgen/index.js`, `worldgen/shape.js`, `server/game/systems/index.js`, `systems/movement.js`, `server/persistence/save.js`; `shared/config.js`, `protocol.js`, `rng.js`, `math.js`, `grid.js`, `rules/movement.js`, `data/index.js`; `test/run.js`, `assert.js`, `harness.js`, `core.test.js`.

**First task (unblocks WP1b):** `shared/config.js` and `shared/protocol.js`.

**Also creates working stubs** for every server file in section 3 owned by a later package.

**Tests:** RNG determinism; movement step equality; collision; snapshot add/upd(patch)/rem and interest hysteresis; `realm` message on `movePlayer`; `player.active` emitted for 4-tile net movement and successful non-swing actions, not for held input or wall-walking; inventory ops; save -> load round trip incl. structure `data` and per-profile system data; service default table complete (every name in 5.5 registered); two fake clients see each other.

### WP1b — Client skeleton
**Goal:** the browser client: connects, renders the world with generated sprites, predicts local movement, interpolates others, draws particles, HUD bars and the panel framework.

**Owns:** `client/index.html`, `style.css`, `main.js`, `client/net/*`, `client/state/store.js`, `client/input/input.js`, `client/render/renderer.js`, `camera.js`, `tilemap.js`, `text.js`, `render/drawers/index.js` (dispatch by `kind`, then `type`), `drawers/player.js`, `node.js`, `drop.js`, `structure.js`, `client/art/palette.js`, `spritegen.js`, `tilegen.js`, `art/sprites/index.js`, `art/sprites/core.js`, `client/fx/particles.js`, `fx/juice.js`, `client/ui/ui.js`, `ui/widgets.js`, `ui/hud/index.js`, `ui/hud/bars.js`, `ui/panels/index.js`.

**Also creates working stubs** for every client file owned by a later package (drawers, panels, HUD widgets, `fx/presets.js` with 6 presets, `fx/router.js` pass-through, `audio/audio.js` no-op).

**Tests (Node, no browser):** pixel-map parser; palette completeness; prediction/reconciliation on recorded input; interpolation buffer; store applies `add`/`upd` patches/`rem` and resets on `realm`.

### WP2 — Registries, schema and content data
**Goal:** every table in `DESIGN.md` (including Appendix A) as data; every formula as pure functions; the closed vocabularies of section 7.1 as enums.

**Owns:** `shared/data/registries.js`, `shared/data/schema.js`, all other `shared/data/*.js` except `index.js`; `shared/rules/constants.js`, `xp.js`, `costs.js`, `combat.js`, `loot.js`, `draft.js`, `market.js`, `scaling.js`; `test/data.test.js`, `test/rules.test.js`.

**Tests:** schema validation with registry enums (unknown stat, proc, trigger, archetype, machine type or status fails); cross-references; counts (96 cards split 32/26/18/12/8 and 12 per tag, 60 skills costing 120 points, 81 plots by biome 9/15/15/15/15/12, feature counts per DESIGN 4.4, 30 fish, 12 crops, 96 Archive items, 24 main quests, 33 side quests, 24 trinkets, 20 blessings, 6 affixes, 12 relics, 60 Deeds, 24 abilities each with upgrade and signature, 126 fx names referenced); `landCost` sum = 317,910; `totalXp(100)` = 6,432,785; every recipe reachable from raw drops; **unlock-order test: for every gate k (Beacon 1..6, each Tidegate stage), every transitive ingredient, station and structure it needs is obtainable using only unlocks from gates before k**; saturation steady-state income per good = `120 * value` +/- 10%; draft generator respects pity, no duplicates, rarity bands, Mythic limit.

### WP3 — Sprite art
**Owns:** `client/art/sprites/items.js`, `nodes.js`, `structures.js`, `machines.js`, `mobs.js`, `bosses.js`, `npcs.js`, `icons.js`, `decor.js`; `client/art/gen/biomes.js`, `gen/big.js`, `gen/player-parts.js`; `test/sprites.test.js`.

**Tests:** as in section 9.4. Order of work: tiers 1–2 nodes and items, player parts, structures, mobs tiers 1–2, then upward by tier, bosses last. Art brief for the two archetypal biomes: Glasswaste is a forest of fused-glass spires and prism trees (not dunes and cacti alone); Hoarfrost is aurora-lit ice shelves with pale pines.

### WP4 — Gathering, inventory, crafting, building
**Owns:** `server/game/systems/gathering.js`, `drops.js`, `inventory.js`, `crafting.js`, `stations.js`, `building.js`, `storage.js`; `client/render/drawers/chest.js`; `client/ui/hud/hotbar.js`, `hud/pickups.js`; `client/ui/panels/inventory.js`, `crafting.js`, `build.js`, `station.js`, `storage.js`; `test/gather-craft.test.js`.

**Services provided:** `giveItem`, `takeItems`, `countItem`, `dropItem`, `hitNode`, `placeStructure`, `removeStructure`, `canPlace`, `containerOf`, `insertInto`, `extractFrom` (dispatch + station and storage providers).

**Tests:** hook tier gating; drop quantities with the yield cap; `hitNode` on behalf of a machine and of an ability; pickup magnet; atomic crafting; Kiln with 3 inputs + fuel meter, first-match and pinned recipe, Kiln II/III time division; `insertInto`/`extractFrom` on every station; placement validators chained; **place + remove with every discount active never increases any item count**; world structures cannot be removed; Brinelocker colour sharing; recipe knowledge in `self.recipes`.

### WP5 — Combat, enemies, bosses
**Owns:** `server/game/systems/combat.js`, `projectiles.js`, `status.js`, `mobs.js`, `ai.js`, `bosses.js`, `death.js`, `defence.js`, `raids.js`; `server/game/ai/*`, `server/game/bosses/*`; `client/render/drawers/mob.js`, `boss.js`, `projectile.js`, `zone.js`; `client/ui/hud/boss.js`; `test/combat.test.js`.

**Services provided:** `damage`, `heal`, `applyStatus`, `clearStatus`, `spawnMob`, `registerBossScript`, `startBoss`, `disableStructure`. **Actions:** `attack`, `revive`, `boss.summon`.

**Tests:** damage formula; every status in the registry; spawn rule (player plot + 4 neighbours, cap `6 + 4 * tier`, lamp/Beacon/Garrison exclusion); elite affixes (all 6); co-op HP scaling within `PARTY_RANGE`; kill-XP split formula; each of the 23 AI archetypes reaches and attacks a dummy; boss phases, 6/8-minute enrage, hard mode; personal loot; Sea Chest; raid targets `machineClusters()[0]`.

### WP6a — Levels, cards, skills
**Owns:** `server/game/systems/progression.js` (XP, levels, Rested, Wake bonus), `cards.js`, `procs.js`, `skills.js`; `client/ui/hud/draft-badge.js`; `client/ui/panels/draft.js`, `deck.js`, `skills.js`; `test/progression.test.js`.

**Services provided:** `grantXp`, `queueDraft`, `hasUnlock`.

**Tests:** level thresholds; a draft per level; pick/reroll (price doubling)/banish/skip/fusion; rank caps; set bonuses at 3/5/7; every card's mods appear in the stat sheet and respect caps; **every proc id in the registry has an implementation and a test**; skill rows and costs; world unlock flags with array `unlock`; Wake bonus condition.

### WP6b — Classes, abilities, gear, consumables
**Owns:** `server/game/systems/classes.js`, `abilities.js`, `gear.js`, `consumables.js`; `server/game/abilities/*`; `client/render/drawers/summon.js`; `client/ui/hud/abilities.js`; `client/ui/panels/character.js`, `class.js`, `temper.js`; `test/classes.test.js`.

**Services provided:** `addBuff`, `removeBuff`.

**Tests:** all 24 abilities cast, cost Surge, respect cooldown, unlock at 10/20/35/60; mastery upgrades at 10/20 with `600 * m^2`; signature picks at 70/80/90; Second Calling slots; class passive discounts never apply to world structures; equip slots and armor set bonuses; tempering cost and success table; food/tonic exclusivity; Lure use calls `boss.summon`.

### WP7 — World: land, biomes, tides, time, weather
**Owns:** `server/game/worldgen/features.js`, `worldgen/populate-*.js`; `server/game/systems/land.js` (plots, Ballast, Treasury, Beacons, charters), `clock.js` (day, tide, weather, forecast), `nodes.js`, `waystones.js`, `shrines.js`; `client/render/lighting.js`, `render/weather.js`; `client/ui/hud/clock.js`, `hud/treasury.js`; `client/ui/panels/map.js` (incl. Tide Almanac tab); `test/world.test.js`.

**Services provided:** `addGlint`, `spendGlint`, `landCostNext`, `ballastFor`, `featureAt`, `timeInfo`, `spawnNode`, `respawnNodes`, `nodesInRadius`.

**Tests:** adjacency; biome gates; Beacon needs all plots + castaway lines + shrines; cost by ordinal with additive discounts capped at 20% and `coopScale`; Ballast per biome; feature counts for 20 seeds; shoreline re-stamp; tide walkability; tidal node spawn (1 per 10 s, cap 8); gem node share 3%; forecast matches what happens; each shrine puzzle solvable; spend cap.

### WP8 — Automation
**Owns:** `server/game/systems/machines.js` (registry, Flux, caps, Tending), `scuttlers.js`, `sluices.js`, `autocraft.js`, `producers.js`, `gulls.js`, `ledger.js`; `client/render/drawers/machine.js`, `sluice.js`, `scuttler.js`, `gull.js`; `client/ui/hud/flux.js`; `client/ui/panels/machine.js` (incl. Report tab); `test/automation.test.js`.

**Services provided:** `machineSpeed`, `disableMachine`, `machineClusters`, `refillTend`; IO providers for every machine kind; place validators for machine cap, Drill and Turbine.

**Tests:** Flux ratio; machine cap incl. `coopScale`; speed cap 3.0; Tending (30 min, 10%, refill only on `player.active` within 12 tiles, not on held input; paused on empty `--persist` server); Burrow producer rule (full rate with `need` nodes, linear below, never removes nodes, 0.5% rare share) within 5% over 10 simulated minutes; Sluice 1/2/4 tiles/s with sluice contents as tile `it` patches, not entities; Spillway and Grabber into a Kiln -> bar out; Splitter fairness; Autobench loop; Drill on vein only, 1% rare; Gull supply/request; Ledger Post 20/min at 70% with saturation; Mint 60% through one saturation entry; Echo Chamber cycle.

### WP9 — Farming, fishing, market
**Owns:** `server/game/systems/farming.js`, `fishing.js`, `market.js` (Market Stall, saturation, castaway shop stock and transactions); `client/render/drawers/crop.js`, `bobber.js`; `client/ui/panels/market.js`, `fishing.js`; `test/farm-fish-market.test.js`.

**Services provided:** `farmTend`, `growCrops`, `rollFish`, `sellItems`, `shopStock`.

**Tests:** `farm.till` costs 1 fieldstone and sets tile 10; crop stages with water/rain/sprinkler; wither; pests and scarecrow; `farmTend` loop; fish table by biome, rod tier, conditions; minigame server logic; saturation (x0.99, floor 0.05, +0.02/min, G8 +0.04) and the `120 * value` steady state; shop stock of 40 per item per day.

### WP10 — Dungeons and the Trench
**Owns:** `server/game/systems/dungeons.js`; `server/game/dungeon/*` (generator, room templates, puzzles, `blessings.js` logic, `trench.js`, `keepers/*`); `client/render/drawers/dungeon.js`; `client/ui/panels/dungeon.js`; `test/dungeon.test.js`.

**Services provided:** `createInstance`, `rollVaultLoot`. Keepers are registered with `registerBossScript`.

**Tests:** floors connected for 200 seeds per Vault; room distribution; key consumption; first-clear rewards once per player; all 20 blessings apply and vanish on exit; wipe ejects; each Keeper performs every move in DESIGN A.4; Trench scaling `1.12^floor`, rare tier rule, moonpetal seeds at floors 10/20/30; instance cleanup; `realm` message on enter and leave.

### WP11 — Quests, NPCs, collections, endgame
**Owns:** `server/game/systems/quests.js`, `npcs.js` (dialogue, quest markers; opens the shop panel only), `archive.js`, `deeds.js`, `tidegate.js`, `finale.js`, `rebirth.js`; `client/render/drawers/npc.js`; `client/ui/hud/goals.js`; `client/ui/panels/journal.js`, `dialog.js`, `tidegate.js`, `rebirth.js`; `test/quests-endgame.test.js`.

**Services provided:** `counter`; IO provider for `gate_site`.

**Tests:** every goal kind completes from bus events; main chain order and capped Glint rewards; all 33 side quests completable; line completion feeds the Beacon check; Tide Board refresh; Archive fixed donation XP and wing rewards into the world sheet; all 60 counters increment; Tidegate deliveries by hand, Sluice and Gull, wing and Trench requirements, `coopScale`; final boss realm; Rebirth keep/reset lists; Moon Shard formula; pacing telemetry flags written.

### WP12 — FX and audio
**Owns:** `client/fx/presets.js`, `fx/router.js`, `fx/ambient.js`; `client/audio/audio.js`, `sfx.js`, `music.js`, `tracks.js`, `ambience.js`; `test/fx-audio.test.js`.

**Tests:** all **126** preset names (DESIGN 19.1 + A.8) exist and validate; all required SFX names exist; all 12 tracks validate; `FX_MAP` entries reference existing presets and sounds.

### WP13 — Shell and co-op UX
**Owns:** `server/game/systems/coop.js` (bound players, `coopScale`, host, kick/unbind, spend caps, chat, pings); `client/ui/hud/party.js`, `hud/minimap.js`, `hud/chat.js`, `hud/toasts.js`; `client/ui/panels/title.js`, `settings.js`, `pause.js` (incl. telemetry list), `tutorial.js`; `test/coop.test.js`.

**Services provided:** `coopScale`, `boundCount`, `partyAverageLevel`, `isHost`.

**Tests:** bound rule (30 min within the last 10 h of world playtime, hourly recompute, announced an hour ahead); `coopScale` values; host detection (loopback, `--admin`); kick sends `kicked`; chat sanitisation and rate limit; reconnect with the same token; ninth player rejected; ping wheel presets. The title screen shows the single world this server runs (name, playtime, bound players); there is no world select.

### WP14 — Integration, balance, hardening
**Owns:** `shared/rules/pacing.js`, `server/persistence/migrate.js`, `test/save.test.js`, `test/pacing.test.js`, `test/bot/pacing-bot.js`; plus permission to edit any file to resolve `docs/INTEGRATION_NOTES.md` items and tune `shared/rules/constants.js`.

**Tasks:** run everything together; fix contract mismatches; full save/load with every system populated; 8-client soak (30 simulated minutes; snapshot under 6 KB per client per tick average with a Tidegate-scale factory; tick under 15 ms); pacing test and bot per `PACING.md` section 10 (critical path >= 85 h, full model 95–105 h, idle scenario); client performance pass; onboarding check against DESIGN 23.

---

## 15. Conventions

| Topic | Rule |
|---|---|
| Modules | ES modules, named or default exports as shown; no globals except `window.__tb` debug handle on the client |
| Style | 2 spaces, semicolons, `const` by default, no classes required except `Game`, `Realm` |
| Determinism | all gameplay randomness uses `game.rng` streams derived from the world seed (`rng.fork('mobs')`), never `Math.random()` on the server |
| Time | server logic uses simulated time (`game.now`, seconds), never `Date.now()`, so the harness can fast-forward |
| Errors | handlers return `{ok:false, err}`; they do not throw on bad client input. System exceptions are caught per system per tick and logged with the system name; the server keeps running |
| Units | positions in tiles (float), time in seconds, rates per second unless the field name says otherwise |
| Security | validate every inbound field; clamp strings; ignore actions while dead unless listed; rate limits per section 4; static server never serves outside `client/` and `shared/` |
| Logging | `[tb:<system>]` prefix; `--verbose` flag for debug |
| Client perf | no allocations in per-entity draw paths; reuse arrays; cache text canvases |
| Accessibility | shake scale, reduce flashing, UI scale, colour-safe rarity markers (shape + colour), rebindable keys |
