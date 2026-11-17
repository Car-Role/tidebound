# WP7 (World) and WP8 (Automation) notes

Files: `server/game/worldgen/features.js`, `populate-*.js`; `server/game/systems/{land,clock,nodes,waystones,shrines,machines,scuttlers,sluices,autocraft,producers,gulls,ledger}.js`; `client/render/{lighting,weather}.js`; `client/render/drawers/{machine,sluice,scuttler,gull}.js`; `client/ui/hud/{clock,treasury,flux}.js`; `client/ui/panels/{map,machine}.js`; `test/world.test.js` (18 tests), `test/automation.test.js` (13 tests). All per-game state lives in WeakMaps keyed by the Game, so several games can share one process.

## Contracts others can use

### World (WP7)
- Services per TECH_SPEC 5.5, plus extras: `attunement(k)` -> `{ok, plots:[have,need], lines, shrines, lit}`, `landDiscount()`, `lineDone(npcId)`, `highestTier()`, `weatherAt(x, y)`, `weatherOf(biome)`, `clockState()`, `spawnNodeNatural(realm, plot, kind, tx, ty, rng)`, `nodeTier(realm, tx, ty)`, `buildShrine(realm, plot, lx, ly, type?)`, `shrineType(px, py)`.
- `timeInfo(x?, y?)`: weather is per biome. With a tile position it returns that biome's weather; without, Greenmarrow's. Extra fields: `t`, `kingTide`, `tideLeft`. `turning` = last 10 s of low tide.
- `featureAt` also returns `tier`, `charter`, `npc` (castaway on that plot, same rule as WP11 `castawayAssignments`) and `anchor` (feature centre).
- Bus: `tide.change {low, king}`, `tide.turning {}`, `weather.change {id, biome, prev}`, `clock.phase {phase, day}`, `land.raised {..., feature}`, `beacon.lit {k, player, structure}`, `shrine.solved {..., puzzle}`, `feature.stamped`, `natural.placed {structure}`, `dig.done`, `waystone.jump`. Natural world-gen structures are NOT announced as `structure.placed` (they are not player builds).
- World keys: `clock` = `{day, t, phase, len, tideT, low, left, king, turning, weather, nextWeather, w:{biome:[id, secondsLeft]}, fc:{biome:[[id, dur] x3]}, kingAt:{day, in}}`; `landNext {ordinal, glint, discount, coop}`; `attune {k: attunement}`; `beacons [{k,x,y,id}]`; `charters {"px,py": {id, day}}`; `mapReveal [[plotIndex, feature]]`; `telemetry {gate: playtimeS}`; `waystones [{id,x,y,px,py,biome}]`; `strike {x,y,n}` (lightning).
- Self keys: `mapOpen {n, tab, from?}` (Tidestone / Waystone use opens the map), `chill {v, max, warm}` (Blizzard).
- Flags in `world.flags`: `beacon:k`, `line:<npcId>` (set on `questline.completed`), `shrine:<px>,<py>`, `relic:relic_01`, `gate:first_plot`, `gate:beacon_k`, `sys:nextId` (see deviation 3).
- Treasury: `addGlint` applies the player's `glintMult` (callers must not apply it again) and fires `glint_burst` for >= 10. `spendGlint` exempts source `'land'` from the per-player daily cap; other spends above 2,000 x highest tier are announced in chat as from "Treasury".
- Spend cap source: service `spendCap(player)` if registered, else `game.world.spendCaps[token]` (Glint per in-game day).
- Interactions owned: `tidestone`, `waystone`, `shrine` (altar: hint / reset blocks), `shrine_piece`, `dig_spot` (dig with RMB `use`, 10 digs).
- Tidal and gem nodes carry numeric `data.tier`; tide caches carry `data.glint` (first cache exactly 15).

### Automation (WP8)
- Every machine structure is registered on `structure.placed` and on load. `machineSpeed` includes `data.overclock = {until, mult}` (WP6b Overclock) after the 3.0 cap. `disableMachine(e, s)` sets `data.disabledUntil` (any `disableStructure` that also sets `data.disabledUntil` is honoured).
- Structure pub keys for machines: `on`, `p` (progress), `it` (shown / carried / sluice item), `lv` status bits: 1 untended, 2 low Flux, 4 working, 8 off, 16 output full, 32 waiting for input.
- Directions: `rot` 0 east, 1 south, 2 west, 3 north; movers take from behind and give in front; Splitter alternates left, right, forward. Drawers use `struct.<kind>.r<rot>` when present (WP3 request satisfied).
- Machine inventories: `data.in`, `data.out`, `data.fuel` (`{slots}`); IO providers registered for every machine kind except turrets. Insert without `opts.slot` lets the target decide (stations put fuel in the fuel slot).
- `machine.config {id, on?, recipe?, filter?, tag?, k?, take?: 'out'|'in'|'fuel'|'all', put?: {slot, qty?, to?}}`; containers (any structure with `container`, and `gate_site`) take `tag: 'supply'|'request'` and `filter` (<= 4 items) in `data.gull`, from the container or from any Gull Roost panel. `burrow.rename {id, name?, hat?}`, hats = Logbook cosmetics `cos_d_*` (sprites `helper.scuttler.<id>`).
- Self key `machine` (panel view, `open: true` on use, refreshed at 1 Hz near it); world keys `flux {supply, demand, ratio, gens}`, `report {made, used, minutes}`.
- Bus: `machine.output`, `machine.registered`, `item.crafted {byMachine: true, machine}`, `sluice.moved {count}`, `gull.delivered {count, item, to, roost}`, `item.sold {player: null, machine}`, `echo.cycle`, `soil.watered`, `gull.tags`, `burrow.hat`.
- Helpers: Scuttler state id = base state + 16 x hat index; Gulls fly with state 1.

## Needs from others
- **WP4 (gathering.js hitNode)**: pay `node.data.glint` for a tide cache when present (the guaranteed first cache must be exactly 15; today `cacheGlint` rolls). Respect `node.data.tapped` (a tree with a Sap Tap cannot be cut). Natural structures carry `data.natural = true` (the Castaway-camp and start-plot campfires are `campfire` structures) and must not be removable.
- **WP4 storage/containerOf**: Gulls count and space-check via `containerOf`; Brinelocker networks work if `containerOf` returns the shared inventory.
- **WP9**: Drip Collector sets `FLAG.WATERED` on the 4 adjacent soil tiles every 90 s; Tiller Bot calls `farmTend(realm, tx, ty, 2, seed)` and removes one seed from its slot itself when `did === 'plant'` (farmTend should not consume seeds). Weather is per biome: use `timeInfo(x, y)` / `weatherAt(x, y)` for rain watering and fish conditions; the king tide is `timeInfo().kingTide`, not a `weather` value.
- **WP5**: Garrison charter = `featureAt(...).charter === 'garrison'`; lightning in storms damages mobs through `damage(..., {element:'storm'})`. Raids: `machineClusters()` and `disableMachine` are live.
- **WP10**: `vault_entrance` structures carry `data.k` and `data.dungeon`; the Trench entrance (`trench_entrance`, 3x3, non-solid) is placed on the start plot when Beacon 3 is lit.
- **WP5 arena**: `arena` structures carry `data.k` and `data.boss` (Warden id).
- **WP11**: castaway assignment matches your `castawayAssignments`; the camp (path ring + campfire) is at the plot centre, your NPC spot centre + (2, 1) sits beside it. Tide Board is a natural `tide_board` at start-plot local (6, 12). Quill's `solve` goals can count `shrine.solved`. Tidegate stage art `struct.gate_site.s1..s5` (WP3 request) belongs to your Tidegate drawing; WP7 only places `gate_site`.
- **WP12**: shrine echo notes fire `shrine_chime` `{n}` (not a DESIGN preset; falls back to a puff). Raid key: WP7 does not publish `world.raid`.
- **WP1/WP14 (save.js)**: `restoreGame` restores nodes with fresh ids before structures with saved ids, so a saved structure id can collide with a node id and silently replace it. WP7 works around it (deviation 3); the clean fix is to set `game.nextEntityId = data.nextEntityId` before restoring nodes.
- **WP1/WP14 (save.js)**: saved plots omit `biome`; WP7 restores it in `land.init`.

## Deviations
1. Weather is rolled per biome (DESIGN 4.6 table); `world.clock.weather`/`nextWeather` are Greenmarrow's for compatibility, `w`/`fc` hold every biome.
2. King tide: the first low tide of every third in-game day lasts 4 min; the shallow ring touching owned flats becomes tidal flat for its duration (non-persistent tile edits) and caches are x4 of tidal spawns.
3. `land.save` writes `world.flags['sys:nextId']`; `land.init` raises `game.nextEntityId` to it so restored node ids never collide with saved ids.
4. Tidal and gem node payouts are left to WP4's hitNode (it already implements glintPerTier, rawOfTier, tokenChance, gem rares, weather yields and the tide-turn double); WP7 only spawns them with the right tier.
5. One Waystone per plot (not in DESIGN; keeps the network meaningful).
6. Blizzard heat sources: campfire, kilns, Ember Boiler, lamp, Tidestone, Tempering Forge, Umbral Reactor within 4 tiles.
7. Autobench recipes: hand / Workbench / Loom / Anvil recipes whose output is a material or component, output tier <= bench tier, world unlocks met (level unlocks ignored). Inputs accepted up to 4 crafts' worth per ingredient.
8. Tending drains for turrets while switched on (WP8 cannot see when WP5 turrets fire).

## Test patch for WP14 (core.test.js)
The start plot now has natural structures (Tidestone at local 9,6, Tide Board at 6,12, campfire at 13,12; tiles 5..14 x 5..13 reserved from node spawns). The campfire was moved off the spawn row so `server movement acks inputs and blocks water` passes again unchanged (verified). If the start layout ever changes again, the robust patch is to clear the path first:
```js
// in 'server movement acks inputs and blocks water', after createHarness:
const realm0 = h.game.realms.get('overworld');
for (const e of [...realm0.entities.values()]) {
  if (e.type !== 'node' && e.type !== 'structure') continue;
  if (Math.abs(e.y - 90) < 1.5 && e.x > 90 && e.x < 96) { if (e.type === 'structure') h.game.call('removeStructure', e); else realm0.remove(e); }
}
```
`save -> load round trip` passes through deviation 3. The remaining core failure (`movePlayer ... realm message`, expects a 40x40 realm) comes from WP10's `createInstance`, not WP7/WP8.

## Verification
- `node test/run.js world` 18/18, `node test/run.js automation` 13/13; `node --check` on every owned file.
- End to end: a prepared save on `--port 8105`, headless Chrome over the DevTools protocol (synthetic Enter on the title only). Screenshots in the scratchpad `shots/` folder: `day-base` (factory: Burrow, Sluice with items, Autobench, Gull Roost, Prism Array, Reactor; HUD Treasury/Clock/Flux), `day-map`, `day-almanac`, `day-machine` (Autobench panel), `night-later` (storm rain + night lighting with punched lights), `rise-raise1..3` (plot rising row by row). No client console errors.
