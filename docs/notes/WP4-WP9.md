# WP4 + WP9 notes (gathering, inventory, crafting, building, storage; farming, fishing, market)

Files: `server/game/systems/{gathering,drops,inventory,crafting,stations,building,storage,farming,fishing,market}.js`,
`client/render/drawers/{chest,crop,bobber}.js`, `client/ui/hud/{hotbar,pickups}.js`,
`client/ui/panels/{inventory,crafting,build,station,storage,market,fishing}.js`,
`test/gather-craft.test.js` (18 tests), `test/farm-fish-market.test.js` (13 tests). Both pass in the integrated tree.

## Contracts others need

### Services (TECH_SPEC 5.5, all implemented)
- `hitNode(node, dmg, opts)`: extra opts `collect` (return drops, do not spawn them; default true when `byMachine`),
  `dir` (radians, for fx), `ignoreTier`, `yieldMult`. Grants node XP to `opts.player` on break (so abilities, bombs and
  procs that break nodes for a player give XP; do not grant it again). Plants (`hits`) break in a fixed number of hits.
  Hook tier comes from `player.gear.hook` (else the best hook carried, else `hook_1`). Returns `{ broken, drops, tooWeak }`.
- `giveItem` overflow drops at the player's feet, locked for that player for 2 s. All gains feed `self.gain`.
- `dropItem(realm, x, y, item, qty, opts)`: extra opts `vx, vy` (pop velocity), `lockFor: [playerId]`, `lockS`, `quiet`.
- `canPlace(kind, realm, tx, ty, player, opts?)`: optional 6th arg `{ rot, noCost, free, cost, unlockFree }`. WP4 checks:
  bounds, overworld only, `FLAG.OWNED`, terrain per `place.on` (land/water/shore/soil), no farmland except `cat:'farming'`,
  overlap (solid flag, structure/node/crop/chest/npc), bodies inside solid footprints, unlock, cost. Then every registered
  validator, which receives `(kind, realm, tx, ty, player, opts)`.
- `placeStructure(realm, kind, tx, ty, rot, owner, opts)`: odd `rot` swaps the footprint. opts `force, free, paid, glintPaid, data, quiet`.
  `data` holds `tx, ty, w, h, owner (token), ownerName, paid, glintPaid, placedAt (world playtime)`.
- `removeStructure(s, { refundTo })`: refund `floor(paid*0.75)` or exact with flag `refund_full`; a placeable item paid for the
  structure comes back whole; Glint refunds likewise. Station slots and Stockpile contents spill as drops.
- `containerOf`: Stockpile `data.inv`; Brinelocker = shared per-colour network inventory (world state saved by `storage`).
- `insertInto(station, item, qty, { slot: 'in'|'fuel' })`: without `slot`, fuel items that are not recipe inputs go to fuel.
  Only items that are inputs of a recipe of that station are accepted. `extractFrom` takes from output slots only.
  Inserts by machines mark the station `byMachine` (no craft XP; `item.crafted` has `byMachine: true`).
- `farmTend(realm, tx, ty, r, seed)`: does NOT consume the seed - the caller removes 1 seed when `did === 'plant'`.
  Harvest items are returned, not dropped.
- `rollFish(biome, { commonOnly, rodTier, luck })`; `sellItems(player|null, item, qty, { rate, satKey, source })` never
  removes items (the caller hands them over) and pays via `addGlint`; `shopStock(npcId)` also accepts `'stall'`.
- Exports usable by other systems: `gathering.js` `nodeTier`, `hookOf`, `burstDrops`; `fishing.js` `condHolds`,
  `rollFishWith`; `farming.js` `cropAt`, `pestEvent`; `inventory.js` `effectsOf`, `toolFor`, `containerAdapters`.

### Actions (payload details beyond 6.3)
- `inv.move {src, from, dst, to, qty}`: `to: -1` = quick move (merge then empty). Containers by entity id (Stockpile,
  Brinelocker, every timed station; station slot layout `[...inputs, fuel?, ...outputs]`).
- `inv.sort {src?, colour?}`: `colour` 0-7 on a Brinelocker switches its network (no other action fits; noted for WP14).
- `craft.make {recipe, qty | 'max', use?: {group: item}}` queues; `{cancel: index}` cancels (refunds the running craft).
- `station.queue {id, recipe, qty | 'max'}` loads ingredients (and fuel) from the pack and pins the recipe;
  `{id, cancel: index}`. `station.take {id, slot?}`, `station.fuel {id, item?, qty?}`.
- `build.place {kind, tx, ty, rot, item?: true, colour?}` (`item` = place from a placeable item); errors carry `d.why`.
- `shop.buy {npc, qty: 0}` / `market.buy {qty: 0}` return today's stock in `res.d.stock` without buying.
- `fish.cast {tx, ty}`, `fish.reel {hold}` (sets the hook during the bite window, then reel hold), `fish.cancel`.

### Self/world keys (extra ones are WP4/WP9-owned)
`recipes`, `craft` (queue), `build` ({ids, disc, coop, th, full}), `gain` (pickup feed batch), `station`, `container`,
`ui` (`{kind: 'craft'|'station'|'storage'|'market'|'close', id, n}`), `shop`, `fish` (minigame), `fishlog` (catch counts
per fish, for the Journal fish tab). World `market` = saturation map (only entries below 1).

### Bus
`item.crafted` (stations: `player` = the loader, `byMachine` when loaded by a machine), `item.pickup`, `node.hit`,
`node.broken`, `structure.placed/removed`, `crop.harvested`, `fish.caught`, `item.sold` (also for machine sales, player null).

### Client
- The hotbar HUD is the controller: it opens my panels on `self.ui`, selects hotbar slots (seeds -> plant mode, placeables ->
  place mode, gear -> `gear.equip {slot}`, consumables -> `item.use {slot, ax, ay}`), and opens the fishing overlay when a
  rod is equipped (`self.gear.rod`) and the cursor is on water in range, so LMB casts instead of attacking.
- `market` panel accepts `ui.open('market', { npc })` for castaway shops (WP11 dialog "Trade").
- The crafting panel stores the pinned recipe in `store.pinnedRecipe` and emits `pin:recipe` (WP11 Goal Tracker may read it).
- Full-screen overlays (`build`, `fishing`) set `fullscreen: true` on the panel module.

## Deviations / interpretations
- Hand crafting is a timed per-player queue (recipe time / (1 + craftSpeed)); queues persist with the profile.
- Kilns hold 1 queued (pinned) recipe, 2 with F2 `kiln_queue`; other stations hold up to 3. Kiln speed = station speed x
  (1 + loader kilnSpeed + world kilnSpeedWorld); other stations use the loader's craftSpeed.
- Harvest XP = ceil(value x 0.4) per crop; fish XP = ceil(value x 0.5). DESIGN gives no numbers.
- Watering lasts one stage (heatwave: half a stage). Regrowing crops return to stage (stages - 2) after harvest.
- Pests: crop clusters = crops within 2 tiles of each other; only crops outside every Scarecrow's 7x7 can be eaten.
- Market Stall "buy": previous-tier raw materials (wood/stone/ore/fiber of tiers below the highest owned biome) at 3x
  value, 40 per day (DESIGN names no stall stock).
- `sellItems` applies sellMult and saturation only; `glintMult` is left to `addGlint` (WP7 already applies it).
- Fishing pity: counters per fish, incremented on each cast whose condition holds (rod able to catch it), reset only on
  catching that fish. Noon = the 420-540 s window of the day phase (or `timeInfo().noon` if WP7 adds it).

## Needs from others
- WP1/WP13: `client/main.js` awaits the title panel before starting the frame loop, so with WP13's title (`auto: false`) the
  screen stays black and nothing boots in the browser. My live checks used a scratch copy with `auto: true`.
- WP1 (`core.test.js`) currently fails 3 tests in the integrated tree, none from WP4/WP9: movement distance and node
  restore (3 plant/peat nodes are removed after load by another system - all 12 are saved), and the vault realm size (WP10).
- WP3: no `chest.*` sprite; the chest drawer draws a procedural chest until one exists. Crop frames are used as-is.
- WP12: I fire `swing_arc`, `hit_*`, `hit_clink`, `break_*`, `drop_pop`, `pickup_trail` (params `follow`), `pickup_flash`,
  `craft_done`, `build_place`, `build_remove`, `crop_grow`, `water_pour`, `fish_cast`, `fish_bite`, `fish_splash`,
  `water_ripple`, `glint_burst`, `chest_open`; client sounds `fish_reel`, `deny`, `glint`.
