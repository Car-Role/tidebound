# TIDEBOUND — Game Design Document

Version 2.0 (revised after `CRITIQUE.md`). Companion documents: `PACING.md` (the 100-hour proof), `TECH_SPEC.md` (architecture, schemas, build order).

All ids in `code_style` are the canonical ids used in `shared/data/*`. Builders must use these ids exactly.

---

## 1. Pitch

**Tidebound** is a top-down 2D pixel-art co-op game (1–8 players, one shared world) about raising a drowned world back out of the sea.

The Long Tide swallowed the Shelf centuries ago. You are a **Tidewright**, washed onto the last dry rock with a driftwood hook. You gather, craft, and spend **Glint** at the **Tidestone** to raise sunken **plots** of land from the water, one at a time, across six biomes. You fight what was living down there, build a workshop that slowly becomes a factory, light six **Beacons**, build the **Tidegate**, and finally face **the Drowned Moon**.

Genre pillars (learned from the gather/craft/expand genre, implemented with original content):

| Pillar | How Tidebound delivers it |
|---|---|
| Always-visible progress | XP bar fills on every action; every level-up gives a card draft AND a skill point |
| Expansion as reward | 81 plots; each newly raised plot reveals a feature (NPC, dungeon, shrine, vein, lagoon) |
| Manual first, machines later | 9-stage automation ladder; first helper machine at about hour 14, full factories after hour 60 |
| Build variety | 6 classes, 96 draft cards in 8 synergy tags, 60 skill nodes, gear tempering |
| The sea is alive | Tide cycle exposes tidal flats every 6 minutes; weather and night change spawns and yields |
| Co-op from the first minute | Shared world, shared Glint treasury, personal inventory/level/deck; costs scale with party size |

Completion target: **100 hours** for a solo player to defeat the Drowned Moon (see `PACING.md`). Post-game: Rebirth ("the Turning") and the endless Trench.

### Originality rule
Every name, creature, item, biome, and piece of lore in this document is original to Tidebound. Builders must not import names, sprites, layouts, or music from any existing game. Mechanics common to the genre (gather, craft, buy adjacent land, skill unlocks) are used; specific content is not.

---

## 2. Core loops

### 2.1 Minute loop (30–90 s)
1. Swing the Tidehook at nodes (trees, rocks, ore, plants). Drops pop out and magnet to you.
2. XP ticks up with every node broken, item crafted, enemy killed.
3. Feed stations (Kiln, Loom, Anvil), which process over time while you keep gathering.
4. Deal with whatever spawned (enemy, tide going out, rare node sparkle).

### 2.2 Session loop (30–120 min)
1. Pick a goal from the **Goal Tracker** (next plot, next tool tier, next Beacon part, a quest).
2. Gather and process toward it; level up 1–4 times, each giving a **card draft** and a **skill point**.
3. Raise 1–3 plots; explore their features.
4. Run a dungeon or summon a Warden boss when geared.
5. Add one piece of automation, removing one chore permanently.

### 2.3 Week loop (10–20 h)
1. Finish a biome: own all its plots, finish its castaway lines and shrines, clear its Vault dungeon, kill its Warden, build its Beacon.
2. New biome unlocks: new tier of tool, materials, enemies, machines, fish, crops, cards odds.
3. Rework the base: the previous tier becomes automated; the new tier is manual.

### 2.4 Whole-game arc
Six biomes, six Beacons, then the Tidegate megaproject (requires a real factory), then the final boss. After that: Rebirth with permanent Moon Chart perks, higher Tide Height difficulty, and the endless Trench.

---

## 3. Controls and camera

| Input | Action |
|---|---|
| WASD | Move (8-direction, analog-normalised) |
| Mouse | Aim; cursor tile highlight within reach (2.5 tiles) |
| LMB (hold) | Primary: swing Tidehook at node / attack with weapon (auto-selects by target) |
| RMB | Interact (stations, NPCs, chests), place structure in build mode |
| Space | Dodge roll (uses 1 dodge charge; 0.35 s i-frames; 3.5 tiles) |
| Q, E, R, F | Class abilities 1–4 |
| Z, X | Second Calling abilities (skill T9) |
| 1–8 | Hotbar (consumables, placeables, rod, weapons) |
| Tab | Inventory / character |
| B | Build menu |
| C | Crafting (hand recipes) |
| K | Skill tree |
| V | Card deck |
| M | World map |
| J | Journal (quests, Archive, Logbook) |
| T | Ping location for party |
| Enter | Chat |
| Esc | Menu |

Camera: follows player with 0.12 lerp, 3x integer zoom (tile = 16 px source, 48 px on screen), mouse look-ahead 1.5 tiles, shake channel. Zoom options 2x/3x/4x.

---

## 4. World

### 4.1 Geometry

| Property | Value |
|---|---|
| Tile | 16x16 px source |
| Plot | 20x20 tiles |
| World | 9x9 plots = 180x180 tiles |
| Start plot | (4,4), centre |
| Plots to raise | 80 |
| Unraised plots | deep water; a faint silhouette of the sunken land is visible |
| Shore | the outer ring of a plot edge facing an unraised neighbour is **tidal flat** (water at high tide, walkable sand at low tide) |

Plot coordinates are `(px, py)` with 0..8. `dx = px-4`, `dy = py-4`, `d = max(|dx|,|dy|)`.

### 4.2 Biomes

| Tier | Biome id | Name | Rule | Plots | Purchase ordinals | Look |
|---|---|---|---|---|---|---|
| 1 | `greenmarrow` | Greenmarrow | d <= 1 | 9 (incl. start) | 1–8 | soft meadow, bentwood trees, yellow reeds |
| 2 | `saltfen` | Saltfen | d >= 2, dx < 0, \|dx\| > \|dy\| (west) | 15 | 9–23 | teal marsh, stilt-root trees, salt pans |
| 3 | `emberreach` | Emberreach | d >= 2, dy > 0, \|dy\| > \|dx\| (south) | 15 | 24–38 | black basalt, lava cracks, ash trees |
| 4 | `glasswaste` | Glasswaste | d >= 2, dx > 0, \|dx\| > \|dy\| (east) | 15 | 39–53 | pale sand, fused glass spires, prisms |
| 5 | `hoarfrost` | Hoarfrost Verge | d >= 2, dy < 0, \|dy\| > \|dx\| (north) | 15 | 54–68 | blue snow, pale pines, ice sheets |
| 6 | `umbral` | The Umbral Deep | d >= 2, \|dx\| == \|dy\| (four diagonals) | 12 | 69–80 | violet-black silt, glowing ink pools |

Total 81.

### 4.3 Raising plots

- Interact with the Tidestone (start plot) or open the map (M) and click a plot.
- Requirements: (a) 4-neighbour adjacent to an owned plot, (b) biome unlocked, (c) pay Glint from the shared treasury, (d) deliver **Ballast** from the raising player's inventory or any Stockpile on the start plot.
- **Ballast** is the stone the new land is anchored with: `ballast_k` blocks made at a Kiln from the *previous* biome's stone and bars (recipes in Appendix A.6). Ballast scales with `coopScale` like the Glint cost; discounts do not apply to it.

| Plots | Ballast per plot |
|---|---|
| Greenmarrow (ordinals 1–8) | `10 * ordinal` `ballast_1` (10, 20, … 80) |
| Saltfen | 90 `ballast_1` |
| Emberreach | 160 `ballast_2` |
| Glasswaste | 200 `ballast_3` |
| Hoarfrost | 380 `ballast_4` |
| Umbral | 1,000 `ballast_5` |

- Cost depends only on how many plots the world has already raised: `landCost(n) = round5(50 * 1.08^n) * coopScale * discounts`, n = 1..80 (see `PACING.md` for the table). First plot 55 Glint, 80th plot 23,600 Glint, total 317,910 Glint solo.
- Biome unlock: tier 1 always. Tier k (k >= 2) requires **Beacon k-1** to be lit.
- **Attunement**: Beacon k can only be built once the world owns **all** plots of biome k, has completed every castaway quest line of biome k, and has solved every shrine of biome k. Nothing can be skipped: all 80 plots are on the critical path.
- Raising animation: 2.5 s; the plot rises row by row with water sheeting off (`plot_rise` effect), camera shake, fanfare. Nodes and the plot feature are generated at that moment from the world seed.

### 4.4 Plot features

Each plot has exactly one feature, assigned by seeded shuffle within its biome.

| Feature | What it is | Greenmarrow (9) | Each of tiers 2–5 (15) | Umbral (12) |
|---|---|---|---|---|
| `start` | Tidestone, campfire | 1 | 0 | 0 |
| `archive` | The Archive ruin (museum) | 1 | 0 | 0 |
| `vault` | Dungeon entrance | 1 | 1 | 1 |
| `arena` | Warden summoning altar | 1 | 1 | 1 |
| `castaway` | NPC with quest line and shop | 1 | 2 | 2 |
| `shrine` | Puzzle shrine | 1 | 2 | 2 |
| `lagoon` | Inland water for fishing | 1 | 1 | 0 |
| `vein` | Rich ore vein (x3 ore nodes, Drill site) | 0 | 1 | 1 |
| `grove` | Dense wood/plant plot | 0 | 1 | 0 |
| `dig` | Ruin with 6 buried relic spots | 0 | 1 | 0 |
| `gate_site` | Tidegate construction site | 0 | 0 | 1 |
| `wild` | Standard resource plot | 2 | 5 | 4 |

### 4.5 Resource nodes

Each plot keeps a node population. Free tiles respawn nodes on a timer.

| Rule | Value |
|---|---|
| Node cap per plot | 22 (wild), 30 (grove/vein), 12 (feature plots) |
| Respawn | every 6 s per plot, if below cap, spawn 1 node from the biome's weighted table on a free tile not within 1 tile of a structure |
| Co-op respawn | interval divided by `1 + 0.6*(S-1)` |
| Node HP by tier | T1 3, T2 7, T3 16, T4 36, T5 80, T6 176 (large variants x3 HP, x3 drops) |
| Too tough | hook tier below node tier: 10% damage, no drops, grey "clink" spark |
| Tidal nodes | during low tide each owned plot with a tidal ring spawns 1 tidal node per 10 s on its flats, cap 8; they vanish when the tide returns |
| Gem nodes | replace 3% of normal spawns; Burrows count them like any other node |

Node list:

| id | Biome | HP class | Drops (per break) | XP |
|---|---|---|---|---|
| `bentwood_tree` | 1 | T1 | 2–3 `driftwood`, 20% `resin` | 4 |
| `fieldstone_rock` | 1 | T1 | 2–3 `fieldstone`, 25% `peat` | 4 |
| `copper_vein` | 1 | T1 | 2 `copper_ore`, 1 `fieldstone` | 6 |
| `reed_clump` | 1 | T1 (1 hit) | 1–2 `reedfiber` | 2 |
| `marrowberry_bush` | 1 | T1 (1 hit) | 1–2 `marrowberry` | 2 |
| `peat_mound` | 1 | T1 | 2–3 `peat` | 4 |
| `stiltwood_tree` | 2 | T2 | 2–3 `stiltwood`, 20% `resin` | 10 |
| `clay_bank` | 2 | T2 | 2–3 `clay` | 10 |
| `bogiron_vein` | 2 | T2 | 2 `bog_iron_ore` | 14 |
| `kelp_tangle` | 2 | T2 (2 hits) | 2 `kelp` | 5 |
| `salt_pan` | 2 | T2 | 2 `salt` | 10 |
| `ashwood_tree` | 3 | T3 | 2–3 `ashwood`, 30% `charcoal` | 18 |
| `obsidian_spire` | 3 | T3 | 2–3 `obsidian` | 18 |
| `cinderite_vein` | 3 | T3 | 2 `cinderite_ore` | 25 |
| `brimstone_vent` | 3 | T3 | 2 `brimstone` | 18 |
| `ashgrass_tuft` | 3 | T3 (2 hits) | 2 `ashgrass` | 9 |
| `spinewood_cactus` | 4 | T4 | 2–3 `spinewood`, 1 `needlesilk` | 26 |
| `sunsand_dune` | 4 | T4 | 3 `sunsand` | 26 |
| `prismite_vein` | 4 | T4 | 2 `prismite_ore` | 36 |
| `needlesilk_bloom` | 4 | T4 (2 hits) | 2 `needlesilk` | 13 |
| `palewood_pine` | 5 | T5 | 2–3 `palewood` | 38 |
| `everice_block` | 5 | T5 | 2–3 `everice` | 38 |
| `rime_vein` | 5 | T5 | 2 `rime_ore` | 52 |
| `frostmoss_patch` | 5 | T5 (2 hits) | 2 `frostmoss` | 19 |
| `gloomwood_tree` | 6 | T6 | 2–3 `gloomwood` | 54 |
| `nullsilt_heap` | 6 | T6 | 3 `nullsilt` | 54 |
| `umbrite_vein` | 6 | T6 | 2 `umbrite_ore` | 75 |
| `inkweed_frond` | 6 | T6 (2 hits) | 2 `inkweed` | 27 |
| `tide_shellbed` | any tidal flat | tier of biome | 2 `shell`, 3% `pearl` | 3 x tier |
| `tide_sandbar` | any tidal flat | tier of biome | 3 `sand` | 3 x tier |
| `tide_cache` | any tidal flat, 4% of tidal spawns | 1 hit | 5–15 x tier Glint, 1 random raw of tier, 5% Tide Token | 10 x tier |
| `gem_node` | any biome, 3% of spawns, no prerequisite (6% on the plot a Prospector stands on) | tier of biome x2 HP | 1 rare of tier (`pearl`,`magma_core`,`amber`,`aurora_shard`,`echoglass`; T1 gives `glintstone`) | 10 x tier |

### 4.6 Time, tide, weather

| Cycle | Length (real) | Phases |
|---|---|---|
| Day | 24 min | Dawn 2, Day 12, Dusk 2, Night 8 |
| Tide | 6 min | High 4 min, Low 2 min (tidal flats exposed, tide nodes spawn, 10 s "tide turning" warning) |
| Weather | re-rolled every 6–10 min from biome table | see below |

The first low tide of a new world always spawns one `tide_cache` worth exactly 15 Glint on the start plot.

Weather weights per biome (chance out of 100 at each re-roll; an eclipse can also replace any night roll in biomes 1–5 with 5% chance; `king_tide` is scheduled every third day and overlays the rolled weather):

| Biome | `clear` | `rain` | `storm` | `fog` | `ashfall` | `heatwave` | `blizzard` | `eclipse` |
|---|---|---|---|---|---|---|---|---|
| Greenmarrow | 60 | 25 | 15 | | | | | |
| Saltfen | 50 | 25 | 10 | 15 | | | | |
| Emberreach | 50 | | 15 | | 35 | | | |
| Glasswaste | 60 | | | | | 40 | | |
| Hoarfrost | 50 | | | 20 | | | 30 | |
| Umbral | 40 | 20 | 15 | 15 | | | | 10 |

Night: light radius 5 tiles around player (lamps 6, campfire 7), enemy spawn rate x2, night-only enemies, +25% enemy XP. Players caught on a tidal flat when the tide returns are slowed 50% and pushed toward land; no damage.

| Weather id | Biomes | Effect |
|---|---|---|
| `clear` | all | none |
| `rain` | 1,2,6 | crops auto-watered, fish bite 25% faster, fire damage -20% |
| `storm` | 1,2,3,6 | lightning strikes random node/enemy every 8 s (breaks node, drops doubled), Tide Wheels +50% Flux, storm-only fish |
| `fog` | 2,5,6 | view radius reduced to 7 tiles, ambush enemies x2, relic dig spots glow |
| `ashfall` | 3 | -10% move speed outdoors, `ashwood` yields +50%, kilns +20% speed |
| `heatwave` | 4 | Prism Arrays +50% Flux, crops need water x2, mirage enemies spawn |
| `blizzard` | 5 | chill meter (stand near heat or -3 HP/s after 40 s), `everice` yields +50% |
| `eclipse` | 6, rare 5% anywhere at night | elites guaranteed, +50% XP, card-drop "Tide Token" chance x3 |
| `king_tide` | all, once per 3 days | low tide lasts 4 min and exposes a second tidal ring with `tide_cache` x4 |

---

## 5. Player stats and formulas

### 5.1 Stats

| Stat id | Base | Per level | Notes |
|---|---|---|---|
| `maxHp` | 100 | +8 | |
| `hpRegen` | 0.5 /s | — | out of combat (5 s no damage) x4 |
| `maxSurge` | 100 | — | ability resource |
| `surgeRegen` | 5 /s | — | |
| `power` | 0 % | +1 % | weapon damage multiplier |
| `gatherPower` | 0 % | +1 % | tool damage multiplier |
| `swingSpeed` | 2.0 /s | — | tool and weapon rate; multiplied by `atkSpeed` % |
| `critChance` | 5 % | — | cap 75 % |
| `critMult` | 1.5 | — | |
| `armor` | 0 | — | reduction = armor / (armor + 100) |
| `moveSpeed` | 5.0 tiles/s | — | cap 9.0 |
| `luck` | 0 | — | each point: +0.5% rare-drop chance multiplier, shifts draft odds |
| `xpMult`, `yieldMult`, `glintMult`, `craftSpeed`, `cdr` | 1.0 | — | multiplicative buckets |
| `pickupRadius` | 2.0 tiles | — | magnet range |
| `dodgeCharges` | 2 | — | recharge 2.5 s each |
| `invSlots` | 24 | — | max 80 |

Stat aggregation: `final = (base + sum(add)) * product(1 + mul)`. **Stacking rule:** every percentage bonus to the same stat is `add` and goes into one summed bucket; `mul` is used only by class passives, card set bonuses and Moon Chart perks. Caps after aggregation: total yield multiplier of any kind <= 3.0, `xpMult` <= 2.5, machine speed <= 3.0, structure-cost discount <= 25%, land discount <= 20%, cooldown reduction <= 50%, lifesteal <= 15%. The complete stat list is in `TECH_SPEC.md` 7.1. Sources: level, gear, tempering, cards, card set bonuses, skills, class passive, class mastery, food/tonic buffs, Archive bonuses, Moon Chart perks, dungeon blessings, weather.

### 5.2 Formulas

| Formula | Definition |
|---|---|
| Craft XP | `ceil(itemValue * 0.4)` per item crafted by hand or at a station you loaded; machine crafts give no XP |
| Weapon hit | `dmg = weaponBase * (1 + power) * abilityMult * (crit ? critMult : 1) * 100/(100 + targetArmor) * elemMult * rand(0.9..1.1)` |
| Gather hit | `dmg = hookPower * (1 + gatherPower)`; hook tier < node tier => x0.1 and no drops |
| Damage taken | `enemyDmg * 100/(100 + armor) * (1 - elemResist)` |
| Drop quantity | `floor(base * yieldMult + rand())` (fractional part is a chance) |
| XP gain | `baseXp * xpMult * restedMult * nightMult`; node, craft, fish and harvest XP go only to the player who did the action. Kill XP: each player who dealt damage gets `xp * (1 + 0.6*(n-1)) / n` (n = contributors), which equals solo XP per unit of enemy HP. Quest, boss first-kill and Beacon XP are full for everyone. One range constant is used for all party effects: `PARTY_RANGE = 24` tiles |
| XP to next level | `xpToNext(L) = round5(30 * L^1.9)`, L = 1..99, cap 100 |
| Glint sale | `value * sellMult * saturation(item)` |
| Elements | `ember` (burn DoT), `frost` (slow, freeze), `storm` (chain), `tide` (knockback/pull), `hollow` (armor ignore 30%). Each enemy lists weak (x1.5) and resist (x0.5) elements |

### 5.3 Death
On death the player drops a **Sea Chest** containing 50% of each raw-material stack (gear, tools, consumables, Glint are kept). Respawn at the last used Hammock or the Tidestone after 5 s. The chest persists 20 minutes and is marked on the map. In dungeons: downed state for 20 s, any ally can revive in 3 s; full wipe ejects the party and resets the floor.

---

## 6. Items

Stack size 999 for materials, 99 consumables, 1 gear. `value` is base Glint sale price.

### 6.1 Tier material matrix (raw)

| Tier | Wood | Stone | Ore | Fiber | Rare | Mob drop | Raw value |
|---|---|---|---|---|---|---|---|
| 1 | `driftwood` | `fieldstone` | `copper_ore` | `reedfiber` | `shell` | `chitin` | 1 |
| 2 | `stiltwood` | `clay` | `bog_iron_ore` | `kelp` | `pearl` | `fen_slime` | 2 |
| 3 | `ashwood` | `obsidian` | `cinderite_ore` | `ashgrass` | `magma_core` | `ember_scale` | 4 |
| 4 | `spinewood` | `sunsand` | `prismite_ore` | `needlesilk` | `amber` | `mirage_dust` | 8 |
| 5 | `palewood` | `everice` | `rime_ore` | `frostmoss` | `aurora_shard` | `frost_pelt` | 16 |
| 6 | `gloomwood` | `nullsilt` | `umbrite_ore` | `inkweed` | `echoglass` | `gloom_heart` | 32 |

Rare column items are worth 10x raw value. Other raw: `brimstone` (4, fuel 4), `sand` (1), `peat` (1, fuel 1), `salt` (2), `resin` (2), `marrowberry` (1), `honeycomb` (6), `glintstone` (25, sells only), `relic_fragment` (dig spots).

### 6.2 Processed materials

| id | Recipe | Station | Time | Value |
|---|---|---|---|---|
| `plank` | 2 wood (any tier; tier k wood gives k planks) | Workbench | 2 s | 3 |
| `brick` | 2 `fieldstone` + 1 fuel, or 1 `clay` + 1 fuel | Kiln | 4 s | 3 |
| `charcoal` | 2 wood (no fuel) | Kiln | 4 s | 2 (fuel 2) |
| `rope` | 3 `reedfiber` or 2 `kelp` | Loom | 3 s | 4 |
| `cloth` | 4 fiber (tier k fiber gives k cloth) | Loom | 5 s | 6 |
| `leather` | 2 mob drop tier 1–2 + 1 `salt` | Loom | 5 s | 8 |
| `glass` | 2 `sand` (or 1 `sunsand` -> 2 glass) + 1 fuel | Kiln | 4 s | 4 |
| `copper_bar` | 2 `copper_ore` + 1 fuel | Kiln | 4 s | 4 |
| `iron_bar` | 2 `bog_iron_ore` + 1 fuel | Kiln | 8 s | 8 |
| `cindersteel_bar` | 2 `cinderite_ore` + 1 `iron_bar` + 2 fuel | Kiln II | 12 s | 20 |
| `prism_alloy` | 2 `prismite_ore` + 1 `glass` + 3 fuel | Kiln II | 16 s | 36 |
| `rimesteel_bar` | 2 `rime_ore` + 1 `everice` + 4 fuel | Kiln III | 20 s | 70 |
| `umbral_alloy` | 2 `umbrite_ore` + 1 `nullsilt` + 6 fuel | Kiln III | 24 s | 140 |

**Kiln rules.** Kilns have 3 input slots, 1 fuel slot and 1 output slot. A Kiln runs the first recipe (in data order) whose inputs are all present; queueing a recipe pins it instead. Fuel is a meter filled from the fuel slot. Listed times are base times: the Blast Kiln divides them by 2 and the Rime Crucible by 4. Every Kiln recipe lists its fuel explicitly.

Fuel values: `peat` 1, `charcoal` 2, `brimstone` 4, `magma_core` 40.

### 6.3 Components

| id | Recipe | Station | Value |
|---|---|---|---|
| `gear_part` | 1 `copper_bar` -> 2 | Workbench | 3 |
| `nail` | 1 `iron_bar` -> 4 | Anvil | 3 |
| `iron_plate` | 2 `iron_bar` | Anvil | 18 |
| `sluice_board` | 2 `plank` + 1 `resin` | Workbench | 9 |
| `flux_coil` | 2 `cindersteel_bar` + 1 `copper_bar` + 1 `brimstone` | Anvil | 55 |
| `lens` | 2 `glass` + 1 `amber` -> 2 | Workbench II | 95 |
| `prism_circuit` | 1 `prism_alloy` + 1 `lens` + 1 `flux_coil` | Workbench II | 210 |
| `cryo_cell` | 2 `rimesteel_bar` + 2 `everice` + 1 `aurora_shard` | Workbench III | 380 |
| `hollow_core` | 2 `umbral_alloy` + 1 `echoglass` + 1 `cryo_cell` + 1 `prism_circuit` | Workbench III | 1,300 |

### 6.4 Gear

All gear recipes are made at the Anvil (tier 1–3), Anvil II (4–5), Anvil III (6–7).

**Tidehook** (gather tool; one slot):

| Tier | id | Name | Power | Harvests node tier | Recipe |
|---|---|---|---|---|---|
| 1 | `hook_1` | Driftwood Hook | 1 | 1 | start item |
| 2 | `hook_2` | Copper Hook | 2 | <= 2 | 12 `copper_bar`, 6 `plank`, 2 `shell`, 1 `vault_core_1` |
| 3 | `hook_3` | Bog-Iron Hook | 4 | <= 3 | 16 `iron_bar`, 6 `stiltwood`, 2 `pearl`, 1 `vault_core_2` |
| 4 | `hook_4` | Cindersteel Hook | 8 | <= 4 | 20 `cindersteel_bar`, 6 `ashwood`, 2 `magma_core`, 1 `vault_core_3` |
| 5 | `hook_5` | Prism Hook | 16 | <= 5 | 24 `prism_alloy`, 6 `spinewood`, 2 `amber`, 1 `vault_core_4` |
| 6 | `hook_6` | Rimesteel Hook | 32 | <= 6 | 28 `rimesteel_bar`, 6 `palewood`, 2 `aurora_shard`, 1 `vault_core_5` |
| 7 | `hook_7` | Umbral Hook | 64 | all, +25% yield | 32 `umbral_alloy`, 6 `gloomwood`, 2 `echoglass`, 1 `vault_core_6` |

`vault_core_k` drops (100%, one per player, first clear; 25% on repeat clears) from the Vault dungeon boss of biome k. This is the hard gate between biomes: dungeon k -> hook k+1 -> biome k+1 nodes.

**Weapons** (three types per tier; any class may use any; classes get +15% with their favoured type):

| Type | Pattern | Rate | Base damage by tier 1..7 |
|---|---|---|---|
| Blade (`blade_k`) | 100° melee arc, reach 1.8 | 2.0 /s | 6, 12, 24, 46, 85, 150, 260 |
| Bow (`bow_k`) | projectile, range 9, pierce 0 | 1.5 /s | 7, 14, 28, 54, 100, 176, 305 |
| Staff (`staff_k`) | slow orb, range 7, splash r1.2, element by tier | 1.0 /s | 9, 18, 36, 70, 128, 225, 390 |

Recipe tier 1: 6 `driftwood`, 4 `fieldstone`, 2 `rope`. Tier k+1 (k = 1..6): `(10 + 5k)` bar of tier k, 8 mob drop of tier k, 1 rare of tier k.

**Armor** (Head `helm_k`, Body `coat_k`, Feet `boots_k`; tiers 1–6):

| Tier | Armor per piece (H/B/F) | Max HP per piece | Recipe per piece |
|---|---|---|---|
| k | `6k / 10k / 5k` | `10k / 20k / 8k` | `(6 + 3k)` bar of tier k, 10 fiber of tier k, 5 mob drop of tier k |

Wearing 3 pieces of the same tier gives a set bonus: T1 +5% move, T2 +10% gather power, T3 burn immunity, T4 +10% crit damage, T5 chill immunity, T6 +10% all damage.

**Other gear**

| Slot | Items |
|---|---|
| Rod | `rod_1` Reed Rod (start of fishing, 4 `driftwood` + 2 `rope`), `rod_2` Iron Reel (T2), `rod_3` Prism Caster (T4), `rod_4` Abyss Line (T6); each +1 fish tier and -15% bite time |
| Pack | `pack_1..5`: +8 inventory slots each (cloth/leather/tier fibers), bought from castaways or crafted |
| Trinket x2 | 24 trinkets from bosses, dungeons, shrines (see 13.4) |
| Lantern | `lantern_1` (light 6), `lantern_2` (light 9, reveals ambushers) |

**Tempering** (long-term sink, Tempering Forge, unlocked in Emberreach): any gear piece can be tempered +1..+10. Each level: +6% of the item's base stats. Cost level n: `n * 2` bars of the item's tier + `n` rare of that tier + `25 * tier * n^2` Glint. Success 100% to +5, then 90/80/70/60/50%; failure consumes materials, keeps level.

### 6.5 Consumables

| id | Effect | Recipe (Cookpot / Still) |
|---|---|---|
| `roast_berries` | heal 25 | 3 `marrowberry` (Campfire) |
| `grilled_fish` | heal 60 | 1 any fish (Campfire) |
| `reed_bread` | heal 80, +10% move 3 min | 2 `tidewheat`, 1 `salt` |
| `fen_stew` | heal 150, +1 HP/s 5 min | 1 fish T2, 2 `mudroot`, 1 `kelp` |
| `ember_curry` | +15% damage 5 min | 2 `scorchpepper`, 1 fish T3, 1 `salt` |
| `glass_noodles` | +15% gather power 5 min | 2 `needlesilk`, 1 `sunmelon` |
| `frost_sorbet` | +20% Surge regen, chill immune 5 min | 2 `everice`, 2 `snowberry` |
| `ink_broth` | +10% XP 10 min | 1 `inkcap`, 1 fish T6 |
| `tidewright_feast` | all of the above at half strength 15 min, party-wide r8 | 1 of each tier crop + 1 legendary fish |
| `tonic_haste` | +25% swing speed 2 min | 2 `kelp`, 1 `brimstone` (Still) |
| `tonic_stone` | +40 armor 2 min | 2 `obsidian`, 1 `fen_slime` |
| `tonic_fortune` | +25 luck 5 min | 1 `pearl`, 1 `amber` |
| `tonic_surge` | restore 100 Surge | 2 `inkweed`, 1 `salt` |
| `bandage` | heal 40 over 4 s | 2 `cloth` (hand) |
| `bomb` | 150 dmg / 30 gather dmg r2 | 2 `brimstone`, 1 `clay` (Workbench) |
| `lure_k` (k=1..6) | summons Warden k at the arena | see 12.2 |
| `tide_token` | reroll currency for drafts | drops only |

Only one food buff and one tonic buff active at a time.

---

## 7. Structures

Placement: build menu (B), ghost preview snapped to tiles, green/red validity, only on owned land (bridging over water is not possible). Each structure stores the items actually paid for it (`data.paid`). Deconstruct refunds `floor(paid * 0.75)` of each item, or exactly `paid` with skill F4, so no discount can create items. World structures (W) cannot be deconstructed. Structure-cost discounts (F4, `c27`, Gearwright) are additive, capped at 25%, and never apply to world structures, Ballast or Tidegate deliveries. Structure cost in co-op: world structures marked (W) scale by `coopScale` (see `PACING.md`).

### 7.1 Stations and utility

| id | Name | Size | Cost | Unlock | Function |
|---|---|---|---|---|---|
| `campfire` | Campfire | 1x1 | 5 `driftwood`, 3 `fieldstone` | start | cook 2 basic recipes, light 7 |
| `workbench` | Workbench | 2x1 | 10 `driftwood`, 6 `fieldstone` | start | T1–3 crafting |
| `workbench_2` | Fitter's Bench | 2x1 | 30 `cindersteel_bar`, 20 `plank`, 10 `gear_part` | Beacon 3 | T4–5 components |
| `workbench_3` | Rime Bench | 2x1 | 40 `rimesteel_bar`, 10 `prism_circuit` | Beacon 4 | T6 components |
| `kiln` | Clay Kiln | 2x2 | 20 `fieldstone`, 6 `peat` | level 2 | smelting; 3 input slots, 1 fuel slot, 1 output slot, queue 20 (Kiln rules under 6.2) |
| `kiln_2` | Blast Kiln | 2x2 | 40 `brick`, 20 `iron_plate`, 10 `obsidian` | Beacon 2 | x2 speed, T3–4 smelts |
| `kiln_3` | Rime Crucible | 2x2 | 60 `prism_alloy`, 20 `flux_coil`, 30 `everice` | Beacon 4 | x4 speed, T5–6 smelts |
| `loom` | Loom | 2x1 | 12 `driftwood`, 10 `reedfiber` | level 4 | rope, cloth, leather |
| `anvil` | Anvil | 1x1 | 15 `copper_bar`, 10 `fieldstone` | level 6 | gear T1–3 |
| `anvil_2` | Tempered Anvil | 1x1 | 30 `cindersteel_bar`, 4 `magma_core` | Beacon 3 | gear T4–5 |
| `anvil_3` | Umbral Anvil | 1x1 | 40 `rimesteel_bar`, 4 `aurora_shard` | Beacon 5 | gear T6–7 |
| `cookpot` | Cookpot | 1x1 | 10 `copper_bar`, 5 `brick` | level 8 | cooking |
| `still` | Alchemy Still | 1x1 | 12 `glass`, 8 `iron_bar` | Beacon 1 | tonics |
| `tempering_forge` | Tempering Forge | 2x2 | 40 `cindersteel_bar`, 20 `obsidian`, 5 `magma_core` | Beacon 2 | tempering |
| `stockpile` | Stockpile | 1x1 | 12 `plank` | level 3 | 24 slots, shared |
| `brine_locker` | Brinelocker | 2x1 | 30 `plank`, 10 `iron_plate` | skill F3 | 60 slots, shared; all Brinelockers share one 60-slot inventory per colour tag (8 colours) |
| `hammock` | Hammock | 2x1 | 8 `rope`, 6 `plank` | level 5 | respawn point; logging out near it gives Rested (+25% XP for 30 min per 4 h offline, cap 2 h) |
| `lamp` | Tide Lamp | 1x1 | 2 `copper_bar`, 1 `resin` | level 6 | light 6, enemies do not spawn within 6 |
| `market_stall` | Market Stall | 2x1 | 20 `plank`, 10 `rope` | level 7 | sell/buy (section 15) |
| `waystone` | Waystone (W) | 1x1 | 20 `brick`, 4 rare of the plot's tier | skill T3 | fast travel between Waystones, 2 s channel |
| `wall`, `gate` | Palisade, Gate | 1x1 | 2 `plank` / 4 `plank` | level 5 | blocks enemies (HP 100 x tier of plank) |
| `calling_shrine` | Calling Shrine | 2x2 | 30 `brick`, 10 `copper_bar`, 5 `shell` | level 10 | choose/switch class |
| `beacon_k` | Beacon k (W) | 3x3 | see 7.3 | attunement k + Warden k trophy | unlocks biome k+1 |

### 7.2 Farming, fishing, passive producers

| id | Name | Cost | Unlock | Function |
|---|---|---|---|---|
| `drip_collector` | Drip Collector | 8 `plank`, 4 `rope` | level 9 | 1 `salt` per 90 s on shore, else fresh water (waters 4 adjacent soil) |
| `sap_tap` | Sap Tap | 4 `copper_bar`, 2 `rope` | skill H3 | attach to a tree: 1 `resin` per 60 s, tree cannot be cut |
| `creel` | Creel | 10 `rope`, 6 `plank` | level 12 | on water: 1 fish (biome common) per 180 s, holds 5 |
| `sprinkler` | Sprinkler | 6 `iron_bar`, 2 `gear_part` | skill H7 | waters 5x5 |
| `scarecrow` | Scarecrow | 6 `plank`, 4 `cloth` | skill H7 | crops in 7x7 immune to pest events |
| `hum_hive` | Hum Hive | 12 `plank`, 6 `resin` | Beacon 1 | 1 `honeycomb` per 120 s if 4+ crops within 3 tiles; +10% crop growth in 3 tiles |

### 7.3 Beacons (W)

| Beacon | Cost (solo) | Also requires |
|---|---|---|
| `beacon_1` | 150 `copper_bar`, 150 `plank`, 150 `brick` | `trophy_thornmother`; all 9 Greenmarrow plots; Ferrin's line; the Greenmarrow shrine |
| `beacon_2` | 150 `iron_bar`, 60 `iron_plate`, 40 `rope`, 100 `pearl` | `trophy_regent`; all 15 Saltfen plots; Odalys's and Brannick's lines; both Saltfen shrines |
| `beacon_3` | 300 `cindersteel_bar`, 60 `flux_coil`, 150 `obsidian`, 90 `magma_core` | `trophy_kilnheart`; all 15 Emberreach plots; Sootwren's and Ashka's lines; both shrines |
| `beacon_4` | 500 `prism_alloy`, 80 `prism_circuit`, 200 `glass`, 100 `amber` | `trophy_prismarch`; all 15 Glasswaste plots; Lumen's and Quill's lines; both shrines |
| `beacon_5` | 1,600 `rimesteel_bar`, 200 `cryo_cell`, 600 `everice`, 150 `aurora_shard` | `trophy_antler`; all 15 Hoarfrost plots; Halvard's and Ysolde's lines; both shrines |
| `beacon_6` | 3,000 `umbral_alloy`, 300 `hollow_core`, 1,000 `nullsilt`, 150 `echoglass` | `trophy_choir`; all 12 Umbral plots; Nix's and Morrow's lines; both shrines |

Lighting a Beacon: sky-wide light pillar (`beacon_light` effect), permanent +5% XP for the world per Beacon, music stinger, next biome's plots become purchasable.

---

## 8. Automation ladder

Design rule: **each stage removes one chore, arrives late enough that the chore was felt, and is capped so manual play stays relevant in the newest tier.**

### 8.0 Global rules

| Rule | Value |
|---|---|
| Machine cap | `machineCap` = 8 automation structures per plot (Sluices, Spillways, Grabber Arms, Splitters and Hoppers do not count). +2 with skill F10, +2/+4 with card `e06`. Multiplied by `coopScale` (rounded) |
| **Tending** | Every automation structure, generator, Ledger Post and Mint has a `tend` meter of 30 minutes. It drains in real time while the machine works and refills to full when a player who is *active* comes within 12 tiles of it. A player is active for 60 s after moving at least 4 tiles of net displacement within 10 s, or after any successful action other than `gather.swing` and `attack` (a held key or held mouse button never counts). At 0 the machine runs at 10% speed (`TEND_MINUTES = 30`, `UNTENDED_SPEED = 0.1`). A wrench icon blinks over untended machines |
| Empty server | With `--persist` and zero connected players, machines, crops, node respawn and market recovery are paused; only the clock runs |
| Speed stacking | Machine speed = `min(3.0, 1 + sum of all percentage bonuses)` x Flux ratio x tend factor. Bonuses add; they never multiply each other |
| "+1 Scuttler" effects | Burrow rates are per Burrow. Each "+1 Scuttler" (card `m06`, Gear 7-set) adds one visible Scuttler and +33% rate, and counts inside the 3.0 speed cap |
| Machine crafts | give no XP and do not advance Deeds counters other than the automation ones |
| Cosmetics | Each Burrow can be given a name and a hat for its Scuttlers (hats come from Logbook unlocks); no gameplay effect |
| Factory report | The machine panel has a Report tab: items produced and consumed per minute for the whole world, last 10 minutes |

### 8.1 The ladder

Hours are for a solo player (phase boundaries from `PACING.md`: Beacons at 8.6, 21.9, 39.0, 56.4, 72.9, 89.3).

| Stage | Hour | Name | New structures | What it removes | Unlock (all conditions required) |
|---|---|---|---|---|---|
| 0 | 0 | Bare hands | Workbench, Campfire | nothing | — |
| 1 | 0.5 | Timed stations | Kiln, Loom, Anvil | waiting: stations work while you gather | levels 2–6 |
| 2 | 3–9 | Passive trickle | Drip Collector, Sap Tap, Creel, Hum Hive | a few minor gathers | level 9; skill H3; level 12; Beacon 1 |
| 3 | 14 | Helpers | Scuttler Burrow I | T1–T2 gathering near the Burrow | skill F5 |
| 3b | 18 | First hand-offs | Hopper, Spillway | emptying Burrows by hand into the chest next to them | skill F3 + level 26 |
| 4 | 26 | Flow | Sluice I, Grabber Arm, Splitter | carrying items across the base | skill F6 + Beacon 2 |
| 5 | 34 | Flux and crafting | Tide Wheel, Ember Boiler, Autobench I, Burrow II, Filter Arm | hand-crafting T1–T3 components | skills F7, F8, F5 + Beacon 2 |
| 6 | 44 | Scaling | Autobench II, Prism Array, Sluice II, Trawl Buoy, Bolt Turret | T4–T5 components, fishing, raid defence | Beacon 3 (+ F8 / C7) |
| 6b | 50 | Fields | Tiller Bot | farming | skill H11 + Beacon 3 |
| 7 | 60 | Deep automation | Burrow III, Lodestone Drill, Rime Turbine | T5–T6 gathering, ore | Beacon 4 (+ F5 / F11 / F7) |
| 7b | 66 | Sky logistics | Gull Roost, Sluice III | long-distance hauling | skill F9 + Beacon 4 |
| 8 | 76 | Economy | Ledger Post, Mint, Autobench III, Arc Spire | selling | skills G9, F12, C11 + Beacon 5 |
| 9 | 86 | Closed loop | Umbral Reactor, Echo Chamber | Flux ceiling, re-running Vaults | skill F12 + Beacon 5 |

No gap between new automation steps is longer than 10 hours.

### 8.2 Automation structures

All rates are before speed bonuses.

| id | Name | Size | Cost | Flux | Unlock | Function and rate |
|---|---|---|---|---|---|---|
| `burrow_1` | Scuttler Burrow I | 2x2 | 12 `iron_plate`, 20 `gear_part`, 30 `plank` | 0 | `skill:F5` | 6 units/min from nodes of tier <= 2 within 4 tiles; 12-slot store; needs 4 nodes in radius for full rate |
| `burrow_2` | Scuttler Burrow II | 2x2 | 20 `flux_coil`, 40 `iron_plate`, 10 `magma_core` | 4 | `skill:F5`, `beacon:2` | 16 units/min, tier <= 4, radius 6, needs 8 nodes |
| `burrow_3` | Scuttler Burrow III | 2x2 | 20 `cryo_cell`, 40 `prism_circuit` | 12 | `skill:F5`, `beacon:4` | 36 units/min, tier <= 6, radius 8, needs 12 nodes |
| `hopper` | Hopper | 1x1 | 6 `plank`, 2 `iron_plate` | 0 | `skill:F3`, `level:26` | picks up ground drops within 3 tiles into itself (8 slots) |
| `spillway` | Spillway | 1x1 | 10 `plank`, 4 `iron_plate` | 0 | `skill:F3`, `level:26` | moves 1 item per 3 s from the container or machine behind it to the one in front; no filter |
| `sluice_1` | Sluice I | 1x1 | 1 `sluice_board` | 0 | `skill:F6`, `beacon:2` | carries items 1 tile/s; 1 item per tile; direction set on placement (R rotates) |
| `sluice_2` | Sluice II | 1x1 | 1 `sluice_board`, 1 `iron_plate` | 0 | `skill:F6`, `beacon:3` | 2 tiles/s |
| `sluice_3` | Sluice III | 1x1 | 1 `sluice_board`, 1 `prism_alloy` | 0 | `skill:F9`, `beacon:4` | 4 tiles/s |
| `grabber` | Grabber Arm | 1x1 | 2 `flux_coil`, 4 `gear_part` | 1 | `skill:F6`, `beacon:2` | moves 1 item per 1.5 s from the tile behind to the tile in front (container, machine or Sluice) |
| `filter_grabber` | Filter Arm | 1x1 | 1 `grabber`, 1 `lens` | 1 | `skill:F6`, `beacon:3` | as Grabber with up to 4 whitelisted items |
| `splitter` | Splitter | 1x1 | 4 `sluice_board`, 2 `gear_part` | 0 | `skill:F6`, `beacon:2` | alternates items to its left, right and forward outputs |
| `autobench_1` | Autobench I | 2x2 | 30 `iron_plate`, 10 `flux_coil`, 20 `gear_part` | 5 | `skill:F8`, `beacon:2` | crafts one selected recipe of tier <= 3 at 0.5x hand speed; 6 input slots, 2 output slots |
| `autobench_2` | Autobench II | 2x2 | 20 `prism_circuit`, 30 `cindersteel_bar` | 10 | `skill:F8`, `beacon:3` | tier <= 5, 1x speed |
| `autobench_3` | Autobench III | 2x2 | 15 `hollow_core`, 40 `rimesteel_bar` | 25 | `skill:F12`, `beacon:5` | all tiers, 2x speed |
| `drill` | Lodestone Drill | 2x2 | 30 `prism_circuit`, 40 `rimesteel_bar`, 10 `cryo_cell` | 15 | `skill:F11`, `beacon:4` | only on a `vein` plot (max 6 per vein plot); 10 units/min: 99% that biome's ore, 1% that biome's rare |
| `tiller_bot` | Tiller Bot | 1x1 | 10 `prism_circuit`, 20 `iron_plate` | 6 | `skill:H11`, `beacon:3` | plants (from its seed slot), waters and harvests soil in 5x5; one action per 2 s |
| `trawl_buoy` | Trawl Buoy | 1x1 on water | 15 `flux_coil`, 30 `rope`, 10 `glass` | 5 | `beacon:3` | 4 common fish/min of the local biome |
| `gull_roost` | Gull Roost | 2x2 | 20 `cryo_cell`, 30 `cloth`, 20 `prism_circuit` | 10 | `skill:F9`, `beacon:4` | 4 courier Gulls; each carries 16 items per trip from containers tagged Supply to containers tagged Request (with a filter), anywhere in the overworld; 8 tiles/s |
| `ledger_post` | Ledger Post | 1x1 | 20 `prism_circuit`, 10 `cryo_cell`, 500 Glint | 5 | `skill:G9`, `beacon:5` | sells the contents of the container behind it at 70% of market value, 20 items/min, saturation applies |
| `mint` | Mint | 2x2 | 40 `rimesteel_bar`, 20 `cryo_cell` | 15 | `skill:G9`, `beacon:5` | converts `glintstone` and any bar to Glint at 60% of value, 30 items/min, through one shared saturation entry `mint` |
| `echo_chamber` | Echo Chamber | 3x3 | 30 `hollow_core`, 100 `umbral_alloy` | 40 | `skill:F12`, `beacon:5` | bound to one cleared Vault; every 20 min consumes 1 `vault_key_k` and produces two rolls of that Vault's loot table (no XP, no cores) |

**Burrows are producers, not harvesters.** A Burrow does not remove nodes. While at least `need` harvestable nodes (tier <= its limit) stand inside its radius it produces its full rate; with fewer it scales linearly (`rate * count / need`). Each unit produced is a weighted roll over the drop tables of the nodes currently in radius. 0.5% of units are instead the rare of the highest-tier node in radius. Scuttlers are visible helpers that walk to nodes and back; they are animation only. Each node counts toward only one Burrow's `need` (nearest Burrow first), so a 22-node plot runs at most one Burrow III at full rate plus one at 83%: land is the factory limit. Structures block node spawns, so a Burrow needs open ground around it.

Kilns, Looms, Anvils and Cookpots accept Spillway and Grabber input and output (inputs, fuel slot, output slot), so a Grabber feeding a Kiln automates smelting; there is no separate "auto kiln". Fuel is 45% of the Tidegate's raw cost: the intended source is Burrows on `brimstone_vent` and `peat_mound` ground feeding Kiln fuel slots by Grabber.

### 8.3 Flux (power)

One global Flux pool per world (no wiring). `supply = sum(generators)`, `demand = sum(running machines)`. If demand > supply, every Flux-consuming machine runs at `supply/demand` speed. The HUD shows supply/demand once the first generator exists.

| id | Name | Cost | Output | Unlock | Condition |
|---|---|---|---|---|---|
| `tide_wheel` | Tide Wheel | 20 `plank`, 10 `iron_plate`, 4 `flux_coil` | 5 (10 during the 60 s around each tide change) | `skill:F7`, `beacon:2` | must touch a tidal or water tile |
| `ember_boiler` | Ember Boiler | 30 `cindersteel_bar`, 10 `flux_coil`, 20 `brick` | 20 | `skill:F7`, `beacon:2` | burns 1 fuel unit per 10 s |
| `prism_array` | Prism Array | 10 `prism_circuit`, 20 `glass` | 30 by day, 0 at night | `skill:F7`, `beacon:3` | outdoors |
| `rime_turbine` | Rime Turbine | 10 `cryo_cell`, 30 `rimesteel_bar` | 40 | `skill:F7`, `beacon:4` | must be on a Hoarfrost plot (x1.5 in blizzard) |
| `umbral_reactor` | Umbral Reactor | 20 `hollow_core`, 60 `umbral_alloy` | 150 | `skill:F12`, `beacon:5` | consumes 1 `echoglass` per 10 min |

### 8.4 Defence automation

| id | Cost | Flux | Unlock | Behaviour |
|---|---|---|---|---|
| `bolt_turret` | 10 `flux_coil`, 20 `iron_plate` | 2 | `skill:C7`, `beacon:3` | 9-tile range, `40 * tier of its plot` damage, 2 shots/s, no ammo |
| `spike_trap` | 6 `iron_bar` | 0 | `skill:C7` | 25 damage on step, 2 s rearm |
| `arc_spire` | 10 `cryo_cell`, 20 `prism_circuit` | 8 | `skill:C11`, `beacon:5` | chains 400 damage to 4 enemies every 1.5 s, range 8 |

Raids: from Beacon 2 onward, each night there is a 30% chance of a **Tidebreak** raid: 3 waves of the newest biome's enemies walk from the nearest shore toward the plot with the most machines. Machines hit by enemies are disabled for 60 s (never destroyed). Raid loot is 2x normal.

---

## 9. Levels, cards, skills

Every level-up (2..100) grants: +8 max HP, +1% power, +1% gather power, **1 card draft**, **1 skill point**. Level-up moment: time-freeze-free burst (`level_up` effect), full heal, chime.

### 9.1 Tide Cards (randomized draft)

On each level-up a draft of 3 cards is queued (press V or click the pulsing deck icon; drafts stack, there is no time pressure, the world does not pause).

| Rule | Value |
|---|---|
| Offer size | 3 (4 with skill G10, +1 with Fortune 7-set, max 5) |
| Rarities | Common (max rank 5), Uncommon (4), Rare (3), Epic (2), Mythic (1) |
| Stacking | Picking a card you own raises its rank; effects scale linearly per rank unless stated |
| Pool | 96 cards (32 C, 26 U, 18 R, 12 E, 8 M); maxed cards leave the pool |
| No duplicates | within one offer |
| Pity | if 5 consecutive drafts showed no Rare or better, the next has one guaranteed |
| Mythic limit | at most 1 Mythic owned per 20 levels reached |
| Reroll | costs 1 `tide_token`; 1 free token every 5 levels; also from tide caches, shrines, quests; or buy with Glint for `50 * level * 2^(rerolls already bought in this draft)` |
| Banish | 1 per 10 levels: remove an offered card from your pool permanently for this life |
| Skip | take 1 `tide_token` instead of a card |
| Bonus drafts | first kill of each Warden: draft with Rare+ guaranteed; first clear of each Vault: Uncommon+ guaranteed (12 bonus drafts) |
| Luck | every 10 luck moves 1 percentage point from Common to Rare and 0.5 from Uncommon to Epic |

Rarity weights by player level:

| Level | Common | Uncommon | Rare | Epic | Mythic |
|---|---|---|---|---|---|
| 2–15 | 70 | 25 | 5 | 0 | 0 |
| 16–35 | 55 | 30 | 12 | 3 | 0 |
| 36–60 | 40 | 32 | 18 | 8 | 2 |
| 61–100 | 30 | 30 | 22 | 13 | 5 |

A solo player sees about 111 drafts in a run; total ranks available are 350, so no two decks match.

**Synergy tags.** Each card has one tag. Every tag has exactly 12 cards. Count of *distinct* cards owned per tag activates set bonuses at 3, 5 and 7:

| Tag | 3 cards | 5 cards | 7 cards |
|---|---|---|---|
| Tide | +10% ability damage | abilities leave a puddle (20% slow, 3 s) | -15% cooldowns; low-tide yields x2 |
| Ember | burn damage +25% | kilns +25% speed; fire immunity | burn kills explode (10% max HP AoE) and drop `charcoal` |
| Frost | slow potency +10% | +15% armor | frozen enemies take +25% damage |
| Storm | +5% swing speed | +10% crit damage; sparks chain +1 | every 20th hit calls lightning (300%) |
| Bloom | +10% plant and wood yield | +1 HP/s per 10 levels | crops 25% chance to give a second harvest |
| Gear | +5% craft speed | machines +10% speed | +1 Scuttler per Burrow |
| Fortune | +5 luck | +10% Glint | drafts offer +1 card |
| Fang | +5% damage | 3% lifesteal | +15% damage vs elites and bosses |

**Common cards (32)** — values are per rank, max rank 5.

| id | Name | Tag | Effect per rank |
|---|---|---|---|
| `c01` | Calloused Hands | Gear | +6% gather power |
| `c02` | Quick Wrists | Gear | +4% swing speed |
| `c03` | Deep Pockets | Fortune | +4 inventory slots |
| `c04` | Sea Legs | Tide | +3% move speed |
| `c05` | Thick Hide | Fang | +10 armor |
| `c06` | Hearty | Bloom | +25 max HP |
| `c07` | Second Wind | Bloom | +0.4 HP/s regen |
| `c08` | Keen Edge | Fang | +5% weapon damage |
| `c09` | Lucky Find | Fortune | +3 luck |
| `c10` | Scholar | Fortune | +3% XP |
| `c11` | Haggler | Fortune | +4% sell price |
| `c12` | Magnetism | Gear | +0.6 tile pickup radius |
| `c13` | Warm Coals | Ember | +8% kiln speed |
| `c14` | Nimble Fingers | Gear | +6% hand craft speed |
| `c15` | Surge Well | Tide | +10 max Surge |
| `c16` | Flowing Mind | Tide | +0.5 Surge/s |
| `c17` | Timberhand | Bloom | +8% wood yield |
| `c18` | Stonebreaker | Ember | +8% stone and ore yield |
| `c19` | Green Thumb | Bloom | crops grow 5% faster |
| `c20` | Patient Line | Frost | fish bite time -6% |
| `c21` | Sharp Eye | Storm | +2% crit chance |
| `c22` | Heavy Blows | Fang | +8% crit damage |
| `c23` | Rimeskin | Frost | -4% elemental damage taken |
| `c24` | Chill Touch | Frost | hits slow 4% for 1.5 s (stacks to 5) |
| `c25` | Spark | Storm | 5% on hit: 40% damage spark to 1 enemy within 3 tiles |
| `c26` | Kindle | Ember | 5% on hit: burn for 30% weapon damage over 3 s |
| `c27` | Tidy Camp | Gear | structures cost 2% less |
| `c28` | Beachcomber | Tide | +10% tidal-flat yields |
| `c29` | Night Owl | Frost | +4% damage and gather power at night |
| `c30` | Sunwarmed | Ember | +4% yields by day |
| `c31` | Roll With It | Storm | dodge recharge -5% |
| `c32` | Butcher | Fang | +8% mob drop quantity |

**Uncommon cards (26)** — max rank 4.

| id | Name | Tag | Effect per rank |
|---|---|---|---|
| `u01` | Splinter Burst | Bloom | breaking a tree: 10% chance an adjacent tree takes a full hit x3 |
| `u02` | Chain Reaction | Ember | breaking an ore node: 8% chance all nodes within 2 tiles take 150% of your hit |
| `u03` | Double Catch | Tide | 8% chance to land 2 fish |
| `u04` | Ricochet | Storm | 12% chance attacks and sparks bounce to a second target for 60% |
| `u05` | Leech Edge | Fang | heal 0.8% of damage dealt |
| `u06` | Frostbite | Frost | slowed enemies take +6% damage |
| `u07` | Wildfire | Ember | burns have 20% chance per tick to spread within 2 tiles |
| `u08` | Static Build | Storm | each hit +1% swing speed, max 5 stacks per rank, 3 s decay |
| `u09` | Overgrowth | Bloom | 6% of harvests return the seed and +1 crop |
| `u10` | Windfall | Fortune | 4% of node breaks drop Glint = `2 * nodeTier * (1 + level/10)` |
| `u11` | Gilded Touch | Fortune | +6% Glint from all sources |
| `u12` | Efficient Design | Gear | world machines +4% speed (highest rank among players applies; others add 1%) |
| `u13` | Scuttler Friend | Gear | Scuttlers +8% harvest speed |
| `u14` | Low Tide Lore | Tide | low tide +10% duration on your current plot; +10% `tide_cache` chance |
| `u15` | Rimeguard | Frost | after a dodge: ice shield for 4% max HP, 3 s |
| `u16` | Thornskin | Bloom | reflect 8% of melee damage taken |
| `u17` | Finisher | Fang | +10% damage vs enemies under 30% HP |
| `u18` | Opening Strike | Fang | +15% damage vs enemies at full HP |
| `u19` | Cold Storage | Frost | food and tonic buffs last 10% longer |
| `u20` | Heat Treatment | Ember | 5% of smelts produce a bonus bar |
| `u21` | Momentum | Storm | each kill +2% move speed, 5 stacks, 6 s |
| `u22` | Treasure Sense | Fortune | chests +10% loot; rank 1 also shows dig spots on the minimap |
| `u23` | Thrifty | Fortune | 5% of crafts refund 1 random ingredient |
| `u24` | Iceplate | Frost | when hit: 10% chance to freeze the attacker 1 s |
| `u25` | Battle Trance | Fang | kills restore 3 Surge |
| `u26` | Spare Parts | Gear | turrets and summons last 10% longer and deal +5% damage |

**Rare cards (18)** — max rank 3.

| id | Name | Tag | Effect per rank |
|---|---|---|---|
| `r01` | Tidal Surge | Tide | every 10th hit releases a wave: 120% damage in a 5-tile line, knockback |
| `r02` | Ember Heart | Ember | burning enemies explode on death for 80% weapon damage, radius 2 |
| `r03` | Glacial Core | Frost | 5 Chill stacks freeze for 2 s (per-enemy cooldown 8 / 6 / 4 s) |
| `r04` | Thunderhead | Storm | crits call lightning for 100% damage (cooldown 2 / 1.5 / 1 s) |
| `r05` | Harvest Moon | Bloom | at night: crops +20% growth, nodes on your plot respawn 10% faster |
| `r06` | Clockwork Heart | Gear | machines within 6 tiles of you +15% speed |
| `r07` | Glint Vein | Fortune | ore nodes 3% chance to drop a `glintstone` |
| `r08` | Bloodtide | Fang | under 40% HP: +15% damage and +3% lifesteal |
| `r09` | Twin Swing | Storm | 10% chance a swing hits twice |
| `r10` | Rootnet | Bloom | harvesting 5 plants within 5 s: +30% swing speed for 3 s |
| `r11` | Salvager | Gear | 6% chance a machine craft consumes no input |
| `r12` | Deep Lungs | Tide | abilities cost 8% less Surge, cooldowns -5% |
| `r13` | Predator | Fang | +8% damage per distinct debuff on the target |
| `r14` | Permafrost | Frost | frozen enemies take +40% crit damage |
| `r15` | Slag Armor | Ember | +20 armor; melee attackers are burned |
| `r16` | Fortune's Favor | Fortune | +5 percentage points Rare-or-better in drafts; +1 `tide_token` per 10 levels |
| `r17` | Squall Boots | Storm | dodges leave a 2 s lightning trail (60% damage/s) |
| `r18` | Pearl Diver | Tide | 4% of fish catches also give a `pearl`; tidal shellbed pearl chance x2 |

**Epic cards (12)** — max rank 2 (values rank 1 / rank 2).

| id | Name | Tag | Effect |
|---|---|---|---|
| `e01` | Maelstrom | Tide | ability hits pull enemies 1.5 tiles toward the impact; +25% / +50% ability damage |
| `e02` | Phoenix Ash | Ember | on death revive in place with 40% HP and a fire nova (cooldown 10 / 6 min) |
| `e03` | Absolute Zero | Frost | freezes last 3 / 4 s; bosses are slowed 30% / 45% instead of frozen |
| `e04` | Chain Lightning | Storm | all your lightning and sparks chain to 3 / 5 extra enemies at 70% |
| `e05` | Worldseed | Bloom | place one personal sapling (hotbar): aura radius 6, +20% / +40% crop growth and +2 / +4 HP/s to allies |
| `e06` | Master Blueprint | Gear | +2 / +4 machine cap on every plot; machines use 15% / 30% less Flux |
| `e07` | King's Ransom | Fortune | elites and bosses drop x1.5 / x2 Glint; land costs -3% / -6% |
| `e08` | Apex | Fang | +15% / +25% damage vs elites and bosses; each kill +0.01% permanent damage (cap 10% / 20%) |
| `e09` | Echo Swing | Storm | every 5th swing repeats as a shockwave, 200% / 300%, radius 3 (also hits nodes) |
| `e10` | Living Hook | Bloom | your Tidehook swings by itself at the nearest node within 2 tiles every 1.2 / 0.8 s |
| `e11` | Kilnsoul | Ember | ore in your inventory smelts by itself, 1 ore pair per 3 / 1.5 s, no fuel |
| `e12` | Shallows Walker | Tide | walk on shallow water (1 tile from shore) / also tidal nodes spawn at high tide for you; tidal yields +50% / +100% |

**Mythic cards (8)** — rank 1, build-defining.

| id | Name | Tag | Effect |
|---|---|---|---|
| `m01` | Leviathan's Call | Tide | every 30 s your next ability casts twice at no cost |
| `m02` | Heart of the Caldera | Ember | burns never expire, stack to 5, and deal +100% damage |
| `m03` | Winter's Crown | Frost | enemies within 4 tiles are permanently slowed 25%; killing a frozen enemy releases a freezing nova |
| `m04` | Eye of the Storm | Storm | lightning strikes a random enemy within 8 tiles every 3 s for 250%; crit chance above 75% converts to crit damage |
| `m05` | Verdant Sovereign | Bloom | nodes you break have a 15% chance to regrow instantly; crops yield double |
| `m06` | The Grand Design | Gear | all world machines +25% speed; every Burrow gains +1 Scuttler |
| `m07` | Golden Tide | Fortune | every luck roll is rolled twice and takes the better; +1% of all Glint the world earns is duplicated |
| `m08` | Alpha | Fang | +30% damage; kills heal 5% HP; elites spawn 50% more often |

### 9.2 Skill tree ("the Chart")

Deterministic long-term progression. 5 branches x 12 nodes = 60 nodes, 120 points total.

| Rule | Value |
|---|---|
| Node cost | row 1: 1 point; row 2: 2 points; row 3: 3 points |
| Row 2 requires | 3 nodes of row 1 in that branch and level 20 |
| Row 3 requires | 3 nodes of row 2 in that branch and level 50 |
| Points | 99 from levels, 6 Wardens, 6 Vault first clears, 8 Archive wings, 1 final boss = 120 |
| Respec | at the Calling Shrine, `100 * level` Glint |

| id | Branch / Row | Name | Effect |
|---|---|---|---|
| `H1` | Harvest 1 | Strong Back | +10% gather power |
| `H2` | Harvest 1 | Wide Swing | Tidehook hits every node in a 1.2-tile arc |
| `H3` | Harvest 1 | Forester | +15% wood yield; unlocks Sap Tap |
| `H4` | Harvest 1 | Rockhound | +15% stone and ore yield; ore nodes on minimap |
| `H5` | Harvest 2 | Tidewalker | tidal nodes +50% yield; no slow in shallows |
| `H6` | Harvest 2 | Regrowth | nodes respawn 20% faster on all plots |
| `H7` | Harvest 2 | Almanac | crops +15% yield; unlocks Sprinkler, Scarecrow |
| `H8` | Harvest 2 | Master Angler | rare fish +25%; Creels hold 10 fish and fill 50% faster |
| `H9` | Harvest 3 | Geode Splitter | ore nodes 5% chance to drop the tier's rare |
| `H10` | Harvest 3 | Twin Harvest | 12% chance of double drops |
| `H11` | Harvest 3 | Evergreen | crops never wither; unlocks Tiller Bot |
| `H12` | Harvest 3 | Worldroot | +25% gather power; 10% of nodes you break respawn instantly |
| `F1` | Forge 1 | Tinkerer | +15% hand craft speed |
| `F2` | Forge 1 | Kiln Master | kilns +20% speed and hold 2 recipes queued |
| `F3` | Forge 1 | Packrat | Stockpiles +8 slots; unlocks Brinelocker; at level 26 unlocks Hopper and Spillway |
| `F4` | Forge 1 | Builder | structures cost 8% less; deconstruct refunds 100% |
| `F5` | Forge 2 | Scuttler Keeper | unlocks Scuttler Burrows (I at once, II with Beacon 2, III with Beacon 4) |
| `F6` | Forge 2 | Sluicewright | unlocks Sluice, Grabber Arm, Filter Arm, Splitter (with Beacon 2) |
| `F7` | Forge 2 | Fluxworks | unlocks Flux generators (Tide Wheel and Ember Boiler with Beacon 2, Prism Array with 3, Rime Turbine with 4) |
| `F8` | Forge 2 | Autobench | unlocks Autobench I with Beacon 2 and Autobench II with Beacon 3 |
| `F9` | Forge 3 | Logistics | unlocks Gull Roost and Sluice III |
| `F10` | Forge 3 | Overdrive | machines +20% speed; +2 machine cap per plot |
| `F11` | Forge 3 | Deep Drilling | unlocks Lodestone Drill |
| `F12` | Forge 3 | Grand Foundry | unlocks Autobench III, Umbral Reactor, Echo Chamber |
| `C1` | Fray 1 | Brawler | +10% weapon damage |
| `C2` | Fray 1 | Toughness | +15% max HP |
| `C3` | Fray 1 | Footwork | +1 dodge charge |
| `C4` | Fray 1 | Field Medic | food heals +30%; revive allies 50% faster |
| `C5` | Fray 2 | Critical Eye | +8% crit chance |
| `C6` | Fray 2 | Ironclad | +25 armor; no knockback while attacking |
| `C7` | Fray 2 | Trophy Hunter | elites +50% loot; unlocks Bolt Turret and Spike Trap |
| `C8` | Fray 2 | Adrenaline | kills grant +20% swing speed for 4 s |
| `C9` | Fray 3 | Giant Slayer | +20% damage vs bosses |
| `C10` | Fray 3 | Last Stand | a lethal hit leaves you at 1 HP, once per 3 min |
| `C11` | Fray 3 | Arsenal | second weapon slot (swap with mouse wheel); unlocks Arc Spire |
| `C12` | Fray 3 | Warlord | +15% damage; allies within 10 tiles +5% damage |
| `T1` | Tide 1 | Attuned | +20 max Surge |
| `T2` | Tide 1 | Swift Current | +8% move speed |
| `T3` | Tide 1 | Cartographer | map shows the feature of unraised plots adjacent to owned ones; unlocks Waystone |
| `T4` | Tide 1 | Tidereader | tide and weather timers on HUD; low tide +20% duration |
| `T5` | Tide 2 | Channeling | -12% ability cooldowns |
| `T6` | Tide 2 | Deepcall | +15% ability damage |
| `T7` | Tide 2 | Stormwise | weather bonuses +50%; weather penalties -50% |
| `T8` | Tide 2 | Moonlit | +15% XP at night; light radius +3 |
| `T9` | Tide 3 | Second Calling | equip the first two abilities of a second class (keys Z, X) |
| `T10` | Tide 3 | Riptide | abilities can crit |
| `T11` | Tide 3 | Wayfarer | teleport to any Waystone from anywhere (5 min cooldown) |
| `T12` | Tide 3 | Tidelord | Surge regen +100%; first ability after 10 s out of combat deals double |
| `G1` | Fortune 1 | Barter | +10% sell prices |
| `G2` | Fortune 1 | Lucky | +8 luck |
| `G3` | Fortune 1 | Quick Study | +10% XP |
| `G4` | Fortune 1 | Scavenger | mobs drop +20% Glint |
| `G5` | Fortune 2 | Surveyor | land costs -5% |
| `G6` | Fortune 2 | Collector | dig spots x2; Archive donations give double XP |
| `G7` | Fortune 2 | Card Shark | +1 `tide_token` per 5 levels (retroactive); +1 banish per 10 levels |
| `G8` | Fortune 2 | Merchant Prince | market saturation recovers twice as fast (+0.04 per minute); castaway shops restock x2 |
| `G9` | Fortune 3 | Ledgerkeeper | unlocks Ledger Post and Mint |
| `G10` | Fortune 3 | High Roller | drafts offer 4 cards |
| `G11` | Fortune 3 | Jackpot | 2% chance any drop is multiplied x10 |
| `G12` | Fortune 3 | Tycoon | land costs a further -10%; +15% Glint |

In co-op, structure unlocks apply to the world as soon as **any** player has the node; personal bonuses stay personal. Land discounts from every source and every player are added together and capped at 20% in total (G5 5%, G12 10%, `e07` 3%/6%, Quill 3%, Moon Chart 5% per rank).

---

## 10. Classes and abilities

Chosen at the Calling Shrine from level 10. Switching is free with a 10-minute cooldown. Each class has its own **Mastery** level 1–20, earned by XP gained while that class is active; mastery XP needed for level m is `600 * m^2` (231,000 total for mastery 10, about hour 23; 1,722,000 for mastery 20, about hour 60). Each mastery level gives +1% to the class's primary stat. Mastery 10 upgrades abilities 1–2, mastery 20 upgrades abilities 3–4 (+25% effect and the listed bonus).

Abilities unlock at player level **10 / 20 / 35 / 60**. At levels **70, 80 and 90** the player picks one of their current class's four abilities to receive its **Signature** (a permanent second upgrade; picks are stored per class, so a second class gets its own three picks once it is played at those levels or later).

Class passives and their structure discounts apply only to structures placed while the class is active and never to world structures.

### 10.1 Bulwark — front-line protector (favoured: Blade)
Passive *Seawall*: +20% max HP, +20 armor, generates 2x threat. Primary stat: max HP.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `breakwater` | Breakwater | 20 | 10 s | 3 s frontal guard: block 80%, reflect 30% | blocked hits restore 5 Surge | guard covers 360 degrees |
| E | `anchor_slam` | Anchor Slam | 30 | 12 s | leap up to 6 tiles; 220% AoE radius 3, stun 1.5 s | leaves a slowing crater 4 s | second slam for 110% after 0.6 s |
| R | `rally_horn` | Rally Horn | 40 | 30 s | allies within 8: +25% armor, 3% max HP/s for 8 s | also cleanses debuffs | allies also gain +20% damage |
| F | `unmoored` | Unmoored | 60 | 90 s | 10 s: unstoppable, +50% damage, hits heal 4% max HP | duration 14 s | kills during it extend it 1 s (max +6 s) |

### 10.2 Squallblade — mobile critical striker (favoured: Blade)
Passive *Slipstream*: +10% move speed, +10% crit chance; dodging through an enemy guarantees the next crit. Primary: crit damage.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `gale_step` | Gale Step | 15 | 6 s | dash 5 tiles through enemies for 180% | 2 charges | leaves a wind wall that blocks projectiles 2 s |
| E | `crosscurrent` | Crosscurrent | 25 | 8 s | spin: 3 hits of 90%, radius 2.2 | pulls enemies inward | each enemy hit reduces its cooldown 0.5 s |
| R | `riptide_mark` | Riptide Mark | 20 | 15 s | mark a target 6 s: +30% damage taken; if it dies, Gale Step resets | mark spreads on death | marked target cannot be healed or shielded |
| F | `tempest` | Tempest | 60 | 80 s | 12 strikes of 150% across enemies within 6 tiles; invulnerable during | 18 strikes | final strike is a guaranteed crit for 400% |

### 10.3 Brinesinger — ranged caster and healer (favoured: Staff)
Passive *Deepsong*: +30 max Surge, +15% ability damage; ability kills restore 10 Surge. Primary: ability damage.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `brine_bolt` | Brine Bolt | 12 | 2 s | piercing bolt 200%, range 10 | splits into 3 on first hit | every third bolt is free and deals 300% |
| E | `undertow` | Undertow | 30 | 14 s | vortex radius 3 for 4 s: pulls, 60%/s | ends with a 200% burst | vortex follows the cursor |
| R | `tidepool` | Tidepool | 35 | 20 s | zone radius 3, 8 s: allies heal 5% max HP/s, enemies take 40%/s | allies also gain +20% swing speed | revives one downed ally inside it |
| F | `kingwave` | Kingwave | 70 | 90 s | wave 12 tiles long, 4 wide: 900%, heavy knockback | returns as a second wave for 450% | leaves the ground soaked 6 s: enemies slowed 40% |

### 10.4 Gearwright — engineer (favoured: Bow)
Passive *Tinkersense*: machines within 8 tiles +10% speed; structures you place cost 10% less; turrets and summons scale with your power. Primary: craft speed.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `pocket_turret` | Pocket Turret | 25 | 10 s | deploy a turret 20 s: 3 shots/s of 40% (max 2) | max 3 | turrets fire piercing bolts |
| E | `overclock` | Overclock | 30 | 25 s | target machine or ally: +100% speed for 15 s | affects all within 3 tiles | also refills the tend meter of machines within 12 tiles |
| R | `magnet_coil` | Magnet Coil | 20 | 12 s | pull all drops within 12 tiles; enemies within 5 pulled and stunned 1 s | also 150% damage | pulled drops are doubled 10% of the time |
| F | `clockwork_legion` | Clockwork Legion | 60 | 90 s | 4 battle Scuttlers for 25 s (each 60% damage, 2/s, taunt) | 6 Scuttlers | Scuttlers explode for 200% when they expire |

### 10.5 Prospector — master gatherer (favoured: Blade)
Passive *Lodesense*: +20% gather power, +10% yields; gem node spawn chance 6% instead of 3% on the plot you stand on. Primary: gather power.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `seismic_strike` | Seismic Strike | 20 | 6 s | every node within 3 tiles takes 300% gather damage; enemies 150% | radius 4 | drops fly straight to you |
| E | `vein_sense` | Vein Sense | 15 | 30 s | 20 s: rare nodes highlighted within 20 tiles; rare drop chance x2 | spawns 1 gem node | duration 30 s |
| R | `blast_charge` | Blast Charge | 30 | 14 s | thrown charge: 400% gather and weapon damage, radius 2.5 | leaves 3 mini-charges | 2 charges stored |
| F | `motherlode` | Motherlode | 60 | 100 s | 15 s: every node break gives double drops and double XP | 20 s and triple drops | allies within 8 tiles share it |

### 10.6 Greenwarden — grower and summoner (favoured: Staff)
Passive *Rootbond*: crops +20% growth near you (6 tiles); +1 HP/s to allies within 6; summons +30% HP. Primary: yields.

| Key | id | Ability | Surge | CD | Effect | Mastery upgrade | Signature |
|---|---|---|---|---|---|---|---|
| Q | `thornlash` | Thornlash | 15 | 4 s | whip cone 4 tiles: 160%, bleed 60% over 4 s | roots 1 s | hits also harvest plants and crops in the cone |
| E | `quickgrow` | Quickgrow | 30 | 30 s | crops within 4 advance one stage; allies heal 15% | radius 6 | two stages |
| R | `sproutling` | Sproutling | 35 | 40 s | summon a Sproutling 30 s (80% damage, taunts, harvests plants) | 2 Sproutlings | Sproutlings heal allies 2% max HP/s within 3 tiles |
| F | `verdant_tide` | Verdant Tide | 70 | 110 s | radius 6, 12 s: allies 6% max HP/s, enemies rooted 3 s, crops ripen instantly | also respawns nodes in radius | radius 9 |

Total active abilities: 24 (each with a mastery upgrade and a Signature), plus dodge roll, plus Second Calling cross-class slots.

---

## 11. Enemies

Spawning: enemies spawn only on the plot a player stands on and its 4 neighbours (owned, non-start). Each such plot rolls a spawn every 20 s by day (10 s at night) if fewer than `2 + tier` enemies are alive on it. Global cap: `6 + 4 * tier` live overworld enemies per player. No spawns within 6 tiles of a Tide Lamp, on the start plot, on a plot with a lit Beacon, on a plot with 4 or more Tide Lamps, or on a Garrison-chartered plot. Enemy stats below are the base (solo). **Elite** variants (8% chance, 100% during eclipse): x4 HP, x1.5 damage, x5 XP and loot, one affix (effects in Appendix A.3), gold outline.

Co-op scaling: HP x `1 + 0.6*(n-1)`, where n is the number of players within `PARTY_RANGE` (24 tiles) when the enemy spawns; bosses x `1 + 0.8*(n-1)`.

| id | Name | Biome | HP | Dmg | Speed | XP | Behaviour | Weak / Resist | Drops |
|---|---|---|---|---|---|---|---|---|---|
| `mossback` | Mossback | 1 | 30 | 6 | 2.0 | 12 | slow charger, 0.6 s telegraph | ember / tide | `chitin` 1–2 |
| `thistlewisp` | Thistlewisp | 1 | 20 | 7 | 2.5 | 12 | floats, keeps 5 tiles away, spits a seed every 2 s | ember / storm | `reedfiber`, 10% `resin` |
| `burrowgrub` | Burrowgrub | 1 | 26 | 9 | 3.0 | 14 | hides underground, erupts under player (dust telegraph 0.8 s) | frost / — | `chitin`, `peat` |
| `lantern_moth` | Lantern Moth | 1 night | 14 | 5 | 4.0 | 10 | swarms of 4, drawn to light | ember / — | `shell` |
| `clatterclaw` | Clatterclaw | 2 | 90 | 16 | 2.2 | 32 | armored front (x0.2 from the front), sidestep attacks | storm / tide | `fen_slime`, `shell` |
| `fenleech` | Fenleech | 2 | 60 | 14 | 4.5 | 28 | lunges and latches 2 s, heals itself | ember / frost | `fen_slime` 1–2 |
| `reedstalker` | Reedstalker | 2 | 80 | 22 | 3.5 | 34 | disguised as a reed clump until approached | ember / — | `kelp`, `fen_slime` |
| `bogwisp` | Bogwisp | 2 | 55 | 18 | 3.0 | 30 | slow homing orbs, teleports when hit | storm / ember | `salt`, 5% `pearl` |
| `brine_shambler` | Brine Shambler | 2 night | 110 | 20 | 2.5 | 40 | walks out of the water in groups of 3 | ember / tide | `fen_slime`, `iron_bar` 5% |
| `cinderling` | Cinderling | 3 | 160 | 45 (blast) | 4.5 | 50 | runs at player and explodes after 1 s fuse | frost / ember | `ember_scale`, `brimstone` |
| `slagback` | Slagback | 3 | 280 | 34 | 1.8 | 70 | armored tortoise, leaves a fire trail | frost / ember | `ember_scale` 2, `obsidian` |
| `ashwing` | Ashwing | 3 | 180 | 30 | 5.0 | 55 | circles, dive-bombs along a telegraphed line | storm / — | `ember_scale` |
| `magmaw` | Magmaw | 3 | 240 | 38 | 0 | 60 | stationary lava mouth, lobs arcing blobs (ground markers) | frost / ember | `brimstone` 2, 3% `magma_core` |
| `emberwraith` | Emberwraith | 3 night | 220 | 40 | 3.5 | 75 | phases through structures, burns on touch | tide / ember | `ember_scale`, `charcoal` |
| `shardscuttle` | Shardscuttle | 4 | 420 | 60 | 5.5 | 80 | fast zig-zag, tail stab | tide / storm | `mirage_dust` |
| `mirage_stalker` | Mirage Stalker | 4 | 500 | 70 | 4.0 | 90 | spawns 2 illusions (1 HP) that mimic it | storm / — | `mirage_dust` 2 |
| `dune_maw` | Dune Maw | 4 | 700 | 85 | 6 (burrow) | 105 | burrows in a line, surfaces under target | frost / — | `mirage_dust`, `sunsand` 3 |
| `prism_sentinel` | Prism Sentinel | 4 | 600 | 75/s beam | 1.5 | 100 | rotating beam, 1.2 s charge-up | hollow / storm | `glass` 2, 4% `amber` |
| `glass_revenant` | Glass Revenant | 4 night | 650 | 80 | 3.5 | 115 | shatters into 3 shards on death | storm / frost | `mirage_dust`, `lens` 3% |
| `rimewolf` | Rimewolf | 5 | 950 | 110 | 5.5 | 115 | packs of 3, flanking, howl buffs +20% speed | ember / frost | `frost_pelt` |
| `frostbulk` | Frostbulk | 5 | 1,600 | 150 | 2.0 | 150 | ground slam with radial ice spikes | ember / frost | `frost_pelt` 2, `everice` 2 |
| `stillwing` | Stillwing | 5 | 1,000 | 120 | 6.0 | 125 | silent swoop from off-screen (shadow telegraph) | storm / frost | `frost_pelt` |
| `sleetspitter` | Sleetspitter | 5 | 1,100 | 130 | 2.5 | 130 | 3-shot icicle fan, applies Chill | ember / frost | `frostmoss` 2, 4% `aurora_shard` |
| `pale_shade` | Pale Shade | 5 night | 1,300 | 140 | 3.5 | 160 | invisible until within 4 tiles or lit | ember / hollow | `frost_pelt`, `everice` |
| `hollowling` | Hollowling | 6 | 2,200 | 190 | 4.5 | 160 | blinks behind the player before striking | storm / hollow | `gloom_heart` 30%, `inkweed` |
| `inkmaw` | Inkmaw | 6 | 3,000 | 220 | 2.5 | 185 | spits ink pools (slow 40%, 100 dmg/s) | frost / tide | `inkweed` 2 |
| `refrain_knight` | Refrain Knight | 6 | 3,800 | 260 | 3.5 | 230 | copies the last ability used near it | tide / — | `gloom_heart` 50%, `umbral_alloy` 3% |
| `gloom_lantern` | Gloom Lantern | 6 | 2,400 | 0 | 3.0 | 175 | shields other enemies until killed | storm / hollow | `echoglass` 5%, `nullsilt` 3 |
| `abyss_eye` | Abyss Eye | 6 | 2,800 | 240 | 1.0 | 195 | sweeping beam, summons 2 Hollowlings at 50% | ember / hollow | `gloom_heart` 40% |
| `tidewraith` | Tidewraith | 6 night and any raid at tier 6 | 3,400 | 250 | 4.0 | 240 | rides a moving wave; only vulnerable after its attack | storm / tide | `gloom_heart`, `echoglass` 3% |

All enemies also drop Glint: `tier * rand(0..2)` (elites x5).

---

## 12. Bosses

### 12.1 Design rules
- All attacks telegraph (ground markers or wind-up poses) at least 0.6 s.
- Three phases at 100/66/33% HP, each adds one pattern.
- Enrage at 6 minutes for Wardens and Keepers 1–3, 8 minutes for 4–6 (+50% damage, +30% speed).
- Hard mode: summoning with 2 Lures gives +100% HP, +25% damage and a guaranteed trinket.
- Loot is personal (each participant rolls).

### 12.2 Wardens (overworld, summoned at the arena plot with a Lure)

| k | id | Name | HP | Hit | Lure recipe | Patterns | Drops |
|---|---|---|---|---|---|---|---|
| 1 | `thornmother` | Old Thornmother | 1,500 | 14 | 10 `marrowberry`, 10 `resin`, 5 `chitin` | root line sweeps; seed-pod volley; P2 summons 3 Thistlewisps; P3 thorn ring closes in | `trophy_thornmother`, `blade_2` 30%, trinket `thorn_locket` |
| 2 | `mire_regent` | Gulchmaw, the Mire Regent | 6,000 | 30 | 12 `fen_slime`, 5 any fish T2, 2 `pearl` | tongue grab; belly-flop shockwave; P2 floods arena (tidal lanes); P3 spits Fenleeches | `trophy_regent`, trinket `regent_signet` |
| 3 | `kilnheart` | Kilnheart Colossus | 20,000 | 60 | 15 `ember_scale`, 20 `charcoal`, 2 `magma_core` | fist slams; rotating flame arms; P2 vents (stand on cool tiles); P3 core exposed windows | `trophy_kilnheart`, trinket `kiln_ember` |
| 4 | `prismarch` | The Prismarch | 60,000 | 110 | 20 `mirage_dust`, 10 `lens` | beam lattice; mirror clones (only the real one casts a shadow); P2 colour-coded safe zones; P3 full-arena refraction | `trophy_prismarch`, trinket `prism_eye` |
| 5 | `glacier_antler` | The Glacier Antler | 120,000 | 190 | 20 `frost_pelt`, 10 `cryo_cell` | charge lanes; antler ice-shard fans; P2 blizzard chill meter; P3 ice floor (momentum movement) | `trophy_antler`, trinket `antler_tine` |
| 6 | `hollow_choir` | The Hollow Choir | 400,000 | 320 | 20 `gloom_heart`, 5 `hollow_core` | three singers must die within 10 s of each other; note-wave rings; P2 silence zones (no abilities); P3 arena shrinks | `trophy_choir`, trinket `choir_bell` |

Wardens can be re-summoned (lure cost each time) for trinket rerolls and `vault_key_k` (x2).

### 12.3 Final boss — the Drowned Moon
Unlocked by completing Tidegate stage 5. Fought in its own realm (a circular 40x40 arena on the sea floor with the water held back).

| Phase | HP | Mechanics |
|---|---|---|
| 1 Crescent | 300,000 | tidal lanes sweep the arena; moon-shard rain; 4 tether pylons to break |
| 2 Half | 400,000 | arena alternates flooded/dry halves every 12 s; summons one mini-version of each Warden's signature attack |
| 3 Full | 500,000 | gravity pulls toward centre; expanding ring waves with gaps; enrage at 10 min |

Hit damage 420. Reward: `moon_shard_crown` (cosmetic), 1 skill point, 5 Moon Shards, credits, Rebirth unlocked. Total HP 1,200,000 solo.

---

## 13. Dungeons

### 13.1 Vaults
Each biome's `vault` plot holds an entrance. Entering creates a private instance (realm) for the party. Vaults are generated from room templates per biome using the world seed + clear count.

| Property | Value |
|---|---|
| Structure | 3 floors; each floor is a 5x5 grid of 16x12-tile rooms, 7–10 rooms used; floor 3 ends in the Keeper |
| Room types | combat (55%), puzzle (15%), treasure (10%), trap gauntlet (10%), shrine/blessing (10%) |
| Entry | first entry free; repeats cost 1 `vault_key_k` (crafted at the Anvil of that tier: 10 bar k + 2 rare k; or from Wardens and raids) |
| Blessings | short-term upgrades: each blessing room offers 1 of 3 run-only blessings (20 total, all listed in Appendix A.2) lost on exit |
| No building | structures cannot be placed inside; nodes inside are crystal growths giving the tier's ore and rares |
| Time | first clear 25–40 min, later 12–18 min |

| k | id | Name | Keeper | Keeper HP | Signature mechanic | First-clear reward |
|---|---|---|---|---|---|---|
| 1 | `rootbound_vault` | Rootbound Vault | Sporeking Bulb | 900 | spore clouds that must be burst with the hook | `vault_core_1`, skill point, bonus draft |
| 2 | `sunken_cistern` | Sunken Cistern | The Barnacle Bell | 3,500 | water level rises/falls with levers | `vault_core_2`, skill point, bonus draft |
| 3 | `slagworks` | The Slagworks | The Bellows Engine | 12,000 | conveyor floors and timed flame jets | `vault_core_3`, skill point, bonus draft |
| 4 | `refraction_hall` | Refraction Hall | The Twin Lenses | 2 x 18,000 | rotate mirrors to route beams and open doors | `vault_core_4`, skill point, bonus draft |
| 5 | `frozen_reliquary` | Frozen Reliquary | The Thawless Knight | 95,000 | sliding ice-block puzzles; braziers thaw paths | `vault_core_5`, skill point, bonus draft |
| 6 | `the_inkwell` | The Inkwell | Scribe of Nothing | 240,000 | darkness; ink erases floor tiles; carry a light | `vault_core_6`, skill point, bonus draft |

### 13.2 Puzzle shrines (overworld, 11 total)
Five puzzle types, parameterised by seed: `plates` (step on plates in the order shown by flashing), `braziers` (light all, toggling neighbours), `blocks` (push 3 blocks onto marks), `tidelock` (reach the pedestal across flats during low tide), `echo` (repeat a 4–7 note sequence by hitting chimes). Reward: chest with 1 trinket roll, 2 `tide_token`, `100 * tier^2` Glint.

### 13.3 The Trench (endless, unlocked by Beacon 3)
Entrance on the start plot (a whirlpool). Infinite floors of single arena rooms; enemy stats scale `1.12^floor` from tier-3 baselines; every 5th floor is a Keeper remix; blessing every 3 floors. Rewards: Glint, `relic_fragment`, and Trench-only trinkets at floors 10/20/30/40. Each floor cleared drops 1 rare of tier `min(party's highest biome tier, 3 + floor(floor / 8))`. Floors 10, 20, 30… also drop 5 `seed_moonpetal`. **Reaching floor 10 is a required gate** (Tidegate stage 5). Deepest floor is recorded per player and feeds Moon Shards on Rebirth. Floor 10 is tuned for hour 80, floor 30 for hour 100.

### 13.4 Trinkets (24)
Two slots. The 12 Warden and Keeper trinkets are below; the other 12 (shrines, quest lines, Trench) are in Appendix A.1.

| id | Source | Effect |
|---|---|---|
| `thorn_locket` | Thornmother | reflect 15% melee damage; +20 max HP |
| `regent_signet` | Mire Regent | +15% sell price; fish value x2 |
| `kiln_ember` | Kilnheart | attacks apply burn (40%/3 s); immune to lava tiles |
| `prism_eye` | Prismarch | +12% crit; crits blind (enemy misses next attack) |
| `antler_tine` | Glacier Antler | +20% damage vs slowed; chill immunity |
| `choir_bell` | Hollow Choir | abilities echo for 30% after 1 s |
| `spore_pouch` | Sporeking | +20% plant yield |
| `barnacle_charm` | Barnacle Bell | +30 armor while standing in shallows or rain |
| `bellows_valve` | Bellows Engine | kilns you load run +30% for 60 s |
| `twin_lens` | Twin Lenses | projectiles split in two at 60% |
| `thawless_plate` | Thawless Knight | +15% max HP; cannot be frozen |
| `scribe_quill` | Scribe | +10% XP; +1 card offered in bonus drafts |


---

## 14. Farming and fishing

### 14.1 Farming
Till with the hook on biome ground (action "Till" in the build menu; costs 1 `fieldstone`; turns the tile into soil, tile id 10). Soil is a tile, not a structure. Plant a seed, water once per stage (or rain/sprinkler/drip), harvest. Unwatered crops pause; after 2 unwatered days they wither (unless skill H11).

| id | Name | Tier | Seed source | Stages x time | Yield | Value | Used in |
|---|---|---|---|---|---|---|---|
| `tidewheat` | Tidewheat | 1 | castaway shop 2 G | 4 x 60 s | 2–3 | 3 | bread |
| `marrowberry` (bush) | Marrowberry | 1 | from berries | 4 x 75 s, regrows | 2 | 1 | roast berries |
| `mudroot` | Mudroot | 2 | Saltfen grass drops | 4 x 90 s | 2 | 6 | stew |
| `saltbloom` | Saltbloom | 2 | Saltfen shop 8 G | 5 x 80 s | 1–2 | 10 | tonics |
| `scorchpepper` | Scorchpepper | 3 | Emberreach shop 25 G | 5 x 100 s | 2 | 16 | curry |
| `cindercap` | Cindercap | 3 | ashwood drops 5% | 4 x 120 s | 1–2 | 22 | fuel 6, tonics |
| `sunmelon` | Sunmelon | 4 | Glasswaste shop 60 G | 6 x 110 s | 1 (3 at heatwave) | 60 | noodles |
| `glassgourd` | Glassgourd | 4 | dig spots | 6 x 120 s | 1–2 | 70 | gives 2 `glass` when smelted |
| `snowberry` | Snowberry | 5 | Hoarfrost shop 150 G | 5 x 150 s, regrows | 2 | 90 | sorbet |
| `pinecone_pale` | Pale Cone | 5 | palewood drops 5% | 6 x 150 s | 1 | 120 | plants `palewood_pine` node |
| `inkcap` | Inkcap | 6 | Umbral shop 400 G | 6 x 180 s | 1–2 | 240 | broth |
| `moonpetal` | Moonpetal | 6 | 5 `seed_moonpetal` at Trench floors 10, 20, 30…; harvest returns the seed 50% | 8 x 180 s, night only | 1 | 600 | `tidewright_feast`, Tidegate stage 5 |

Pest event: each day 15% chance per unprotected farm cluster that 20% of crops are eaten by Burrowgrubs (which then spawn). Scarecrows prevent it.

### 14.2 Fishing
Equip rod, LMB on water within 6 tiles to cast. Bite after `rand(4..10) s * biteMult`. Minigame: a tension bar; hold LMB to reel, release to slack; keep the marker inside the moving green zone until the catch meter fills (2–6 s by rarity). Failing loses the fish, never the rod. **Pity:** a rare fish is guaranteed by the 20th cast made while its condition holds, and a legendary by the 60th (counters are per player per fish and reset on the catch).

30 fish, 5 per biome: common (60%), common (25%), uncommon (10%), rare (4%, condition), legendary (1%, condition).

| Biome | Common | Common | Uncommon | Rare (condition) | Legendary (condition) |
|---|---|---|---|---|---|
| 1 | `pebble_minnow` | `reed_perch` | `marrow_carp` | `dawn_darter` (dawn) | `old_whiskers` (rain) |
| 2 | `mud_skipper` | `salt_sprat` | `fen_eel` | `pearl_gar` (low tide) | `bog_sovereign` (fog) |
| 3 | `ash_guppy` | `cinder_bass` | `lava_loach` | `obsidian_pike` (night) | `kiln_koi` (ashfall) |
| 4 | `sand_dab` | `glassfin` | `prism_ray` | `mirage_angel` (heatwave) | `sun_sturgeon` (noon) |
| 5 | `ice_smelt` | `frost_char` | `rime_cod` | `aurora_trout` (night, clear) | `glacier_maw` (blizzard) |
| 6 | `ink_fry` | `gloom_tetra` | `null_lamprey` | `echo_ray` (eclipse) | `moon_leviathan` (king tide) |

Values: common `4 * tier`, uncommon `15 * tier`, rare `60 * tier`, legendary `400 * tier`. Fish tier requires rod tier (rod_1: biomes 1–2, rod_2: 3, rod_3: 4–5, rod_4: 6).

---

## 15. Economy

**Glint** is the only currency. It lives in one shared world **Treasury** (visible to all, top-right). Everyone deposits automatically; any player can spend on land. Personal spending (rerolls, respec, tempering, shops) also draws from the Treasury; every non-land spend above `2,000 * highestBiomeTier` is written to chat ("Ada spent 4,000 on tempering"), and the host can set a per-player spend cap per in-game day.

Sources: selling at Market Stall or castaway shops, enemy drops, tide caches, chests, quests, raids, Ledger Post, Mint.

**Market saturation**: each item has a saturation value starting at 1.0. Each unit sold multiplies it by 0.99 (floor 0.05); it recovers +0.02 per real minute of connected play toward 1.0. In steady state one kind of item earns at most about `120 * value` Glint per hour however many units are dumped, so income comes from selling many different goods, not volume. The Mint uses one shared entry `mint` for everything it converts.

**Castaway shops** (per NPC, restock each in-game day): exact stock in Appendix A.6. Materials are previous-tier goods at 3x value, limited to 40 units per item per in-game day.

Designed income (solo, Glint/hour) follows `min(150 * 1.07^hour, 40,000)`; see `PACING.md` section 4.

---

## 16. Quests and NPCs

### 16.1 Main chain (24 quests, auto-tracked; 4 per biome)

| # | id | Name | Objective | Reward |
|---|---|---|---|---|
| 1 | `q01` | Dry Land | Build a Workbench and a Kiln | 60 G (the one exemption from the 25% cap: it pays for the first plot), 50 XP |
| 2 | `q02` | The Tidestone Wakes | Raise your first plot | 15 G, `tide_token` |
| 3 | `q03` | Something Below | Clear the Rootbound Vault | recipe `hook_2` shown, 300 XP |
| 4 | `q04` | First Light | Kill Old Thornmother and light Beacon 1 | 25 G, 1,000 XP |
| 5 | `q05` | West Wind | Raise 3 Saltfen plots | 30 G |
| 6 | `q06` | Little Helpers | Build a Scuttler Burrow | 10 `iron_plate`, 2,000 XP |
| 7 | `q07` | The Cistern | Clear the Sunken Cistern | 4,000 XP |
| 8 | `q08` | Second Light | Kill the Mire Regent and light Beacon 2 | 75 G, 8,000 XP |
| 9 | `q09` | Where the Sea Boils | Raise 3 Emberreach plots | 85 G |
| 10 | `q10` | Let It Flow | Move 200 items by Sluice | 20 `sluice_board`, 12,000 XP |
| 11 | `q11` | Slag and Cinder | Clear the Slagworks | 20,000 XP |
| 12 | `q12` | Third Light | Kill the Kilnheart Colossus and light Beacon 3 | 250 G, 40,000 XP |
| 13 | `q13` | The Bright Wastes | Raise 3 Glasswaste plots | 300 G |
| 14 | `q14` | Hands Off | Have an Autobench craft 100 items | 5 `prism_circuit`, 30,000 XP |
| 15 | `q15` | Hall of Selves | Clear Refraction Hall | 40,000 XP |
| 16 | `q16` | Fourth Light | Kill the Prismarch and light Beacon 4 | 800 G, 60,000 XP |
| 17 | `q17` | North | Raise 3 Hoarfrost plots | 1,000 G |
| 18 | `q18` | The Sky Carries | Deliver 500 items by Gull | 5 `cryo_cell`, 50,000 XP |
| 19 | `q19` | What the Ice Kept | Clear the Frozen Reliquary | 60,000 XP |
| 20 | `q20` | Fifth Light | Kill the Glacier Antler and light Beacon 5 | 2,500 G, 100,000 XP |
| 21 | `q21` | The Corners of the World | Raise 3 Umbral plots | 3,000 G |
| 22 | `q22` | Sixth Light | Clear the Inkwell, kill the Hollow Choir, light Beacon 6 | 6,000 G, 300,000 XP |
| 23 | `q23` | The Tidegate | Complete all 5 Tidegate stages | 2 Moon Shards |
| 24 | `q24` | Moonfall | Defeat the Drowned Moon | credits, Rebirth |

### 16.2 Castaways (11 NPCs, 3 side quests each = 33 side quests)

One castaway stands on each `castaway` plot (Greenmarrow 1, tiers 2–6 two each). Side-quest progress is per player, but a line counts as completed for the Beacon requirement as soon as any player finishes it. Shop stock and prices are in Appendix A.6.

| NPC id | Name | Biome | Role | Line reward (after step 3) |
|---|---|---|---|---|
| `npc_ferrin` | Ferrin the Ropewalker | 1 | general trader | `pack_1` |
| `npc_odalys` | Odalys Saltmother | 2 | cook | recipe `fen_stew`, 3 `tonic_fortune` |
| `npc_brannick` | Brannick Half-Anchor | 2 | smith | `pack_2`; tempering costs -10% Glint for the player |
| `npc_sootwren` | Sootwren | 3 | engineer | one free `autobench_1` item |
| `npc_ashka` | Ashka of the Vents | 3 | alchemist | recipe `ember_curry`, trinket `ember_flask` |
| `npc_lumen` | Lumen-of-Many-Faces | 4 | glassmaker | `pack_3`, `lantern_2` |
| `npc_quill` | Quill the Surveyor | 4 | cartographer | land costs -3% (world) |
| `npc_halvard` | Halvard Frostbeard | 5 | hunter | `pack_4`, trinket `frost_bead` |
| `npc_ysolde` | Ysolde Lanternwright | 5 | lamplighter and angler | `rod_3` upgrade to +10% rare fish; Tide Lamps light 8 tiles (world) |
| `npc_nix` | Nix, Who Remembers | 6 | archivist | `pack_5`; +3 Moon Shards on the next Turning |
| `npc_morrow` | Morrow the Unmoored | 6 | deep diver | trinket `deep_lantern`; the party may start Trench runs at floor 10 |

All 33 side quests (goal kinds as in `TECH_SPEC.md` section 7; each step also gives XP `200 * tier^2` and Glint `20 * 2^tier`):

| id | Giver | Objective |
|---|---|---|
| `s_ferrin_1` | Ferrin | deliver 20 `rope` |
| `s_ferrin_2` | Ferrin | deliver 10 `plank` and 10 `brick` |
| `s_ferrin_3` | Ferrin | catch 5 fish of any kind |
| `s_odalys_1` | Odalys | deliver 3 cooked dishes (any) |
| `s_odalys_2` | Odalys | deliver 10 `salt` and 5 `mudroot` |
| `s_odalys_3` | Odalys | deliver 1 `pearl_gar` |
| `s_brannick_1` | Brannick | deliver 20 `iron_bar` |
| `s_brannick_2` | Brannick | kill 15 `clatterclaw` |
| `s_brannick_3` | Brannick | craft `hook_3` or any tier-3 weapon |
| `s_sootwren_1` | Sootwren | build 20 Sluice tiles |
| `s_sootwren_2` | Sootwren | deliver 10 `flux_coil` |
| `s_sootwren_3` | Sootwren | reach 20 Flux supply |
| `s_ashka_1` | Ashka | deliver 10 `brimstone` |
| `s_ashka_2` | Ashka | brew 5 tonics |
| `s_ashka_3` | Ashka | kill 3 elites in Emberreach |
| `s_lumen_1` | Lumen | deliver 30 `glass` |
| `s_lumen_2` | Lumen | deliver 6 `lens` |
| `s_lumen_3` | Lumen | find 3 relics |
| `s_quill_1` | Quill | raise 5 plots |
| `s_quill_2` | Quill | build 3 Waystones |
| `s_quill_3` | Quill | solve 3 shrines |
| `s_halvard_1` | Halvard | deliver 20 `frost_pelt` |
| `s_halvard_2` | Halvard | kill an elite `frostbulk` |
| `s_halvard_3` | Halvard | temper any item to +3 |
| `s_ysolde_1` | Ysolde | build 10 Tide Lamps on Hoarfrost plots |
| `s_ysolde_2` | Ysolde | catch 1 `aurora_trout` |
| `s_ysolde_3` | Ysolde | deliver 10 `cryo_cell` |
| `s_nix_1` | Nix | donate 60 Archive items (world total) |
| `s_nix_2` | Nix | catch any legendary fish |
| `s_nix_3` | Nix | deliver 5 `relic_fragment` |
| `s_morrow_1` | Morrow | reach Trench floor 5 |
| `s_morrow_2` | Morrow | deliver 10 `gloom_heart` |
| `s_morrow_3` | Morrow | reach Trench floor 10 |

### 16.3 Tide Board (repeatable contracts)
A notice board on the start plot offers 3 contracts, refreshed each in-game day, scaled to the highest unlocked tier k.

| Template | Objective | Reward |
|---|---|---|
| `tb_gather` | deliver `40k` of a raw tier-k item | `30 * 2^k` G, `40 * 2^k` XP |
| `tb_hunt` | kill `8 + 2k` of an enemy type | same + 1 `vault_key_k` 20% |
| `tb_craft` | deliver `5k` of a component | `60 * 2^k` G |
| `tb_fish` | catch 3 uncommon fish of tier k | `40 * 2^k` G |
| `tb_cook` | deliver 3 of a dish | `40 * 2^k` G, random tonic |
| `tb_elite` | kill an elite | `80 * 2^k` G, `tide_token` 30% |
| `tb_vault` | clear the tier-k Vault in under 15 min | `150 * 2^k` G, trinket roll |
| `tb_tide` | open 3 tide caches | `50 * 2^k` G |

---

## 17. Collections

### 17.1 The Archive (museum)
A ruin on a Greenmarrow plot. Donate one of each listed item. 8 wings x 12 items = 96 donations.

| Wing id | Contents | Completion reward (permanent, world-wide) |
|---|---|---|
| `wing_timber` | 6 woods, `plank`, `charcoal`, `resin`, `rope`, `cloth`, `sluice_board` | +10% wood yield, skill point |
| `wing_stone` | 6 stones, `brick`, `glass`, `sand`, `salt`, `peat`, `lens` | +10% stone yield, skill point |
| `wing_metal` | 6 ores + 6 bars | kilns +15% speed, skill point |
| `wing_harvest` | 12 crops | crops +10% growth, skill point |
| `wing_angler` | 12 fish (the 6 uncommon + 6 rare) | fish bite 15% faster, skill point |
| `wing_bestiary` | 6 mob drops + 6 Warden trophies (copies awarded on re-kill) | +5% damage, skill point |
| `wing_relic` | 12 relics from dig spots and Vault treasure rooms (`relic_01..12`) | +10 luck, skill point |
| `wing_works` | `gear_part`, `nail`, `iron_plate`, `flux_coil`, `prism_circuit`, `cryo_cell`, `hollow_core`, and the 5 dishes named in Appendix A.6 | machines +10% speed, skill point |

Each individual donation gives fixed XP `50 * itemTier^2` and a small confetti burst. The Archive survives Rebirth.

### 17.2 Logbook (achievements)
60 Deeds in 6 categories (Gather, Craft, Fight, Explore, Automate, Crew), each with 3 thresholds. All 60 are listed in Appendix A.7. Deeds persist through Rebirth. WP2 enters them in `shared/data/deeds.js`; WP11 implements the counters.

---

## 18. Endgame

### 18.1 The Tidegate (hours 90–100)
Built on the `gate_site` plot after Beacon 6. Five stages; each accepts deliveries from players, Sluices, and Gulls. World structure: costs scale in co-op.

| Stage | Name | Cost (solo) |
|---|---|---|
| 1 | Foundation | 5,000 `brick`, 3,000 `plank`, 2,000 `iron_plate` |
| 2 | Frame | 2,500 `cindersteel_bar`, 1,500 `prism_alloy`, 600 `flux_coil` |
| 3 | Lensworks | 400 `lens`, 300 `prism_circuit`, 2,000 `glass` |
| 4 | Cold Heart | 250 `cryo_cell`, 2,000 `rimesteel_bar`, 500 `everice` |
| 5 | Hollow Crown | 200 `hollow_core`, 2,500 `umbral_alloy`, 100 `gloom_heart`, 20 `moonpetal`, 250,000 Glint |

Stage 1 also requires 4 completed Archive wings, stage 3 requires 6, and stage 5 requires all 8 plus Trench floor 10 reached by any player (the source of `moonpetal`). The 20 `moonpetal` and the wing requirements are not multiplied by `coopScale`.

Each completed stage grants every bound player 150,000 XP. Each completed stage plays a construction cutscene (camera pans, `gate_stage` effect) and grants a world buff (+10% machine speed per stage).

### 18.2 Rebirth — "the Turning"
Available after the Drowned Moon. All bound players must vote yes at the Tidestone.

| Resets | Keeps |
|---|---|
| plots, structures, inventories, Glint, level, cards, skill points, gear, quests | Archive, Logbook and cosmetics, class Mastery, bestiary, Moon Chart, discovered recipes list, Trench record |

**Moon Shards** earned on Turning: `5 (final boss) + floor(sumOfLevels/100 per player averaged) + 1 per Archive wing + floor(trenchDeepest/10) + questBonuses`. Typical first Turning: 18–22 shards.

**Moon Chart** (20 perks, each 3 ranks, costs 1/2/3 shards): +10% XP, +10% yields, +10% Glint, -5% land cost, start with `hook_2`, start with 1 Scuttler Burrow, +1 draft offer on levels divisible by 10, +5% damage, +5% max HP, +1 starting `tide_token` per 5 levels, kilns +15%, machines +10%, +1 dodge charge (1 rank), keep 1 chosen card per rank across Rebirths, unlock Mythic-plus "Eclipse" card variants (1 rank), +10% move speed, +2 inventory rows, Scuttlers +1 tier, bosses drop 2 trinkets, start with Beacon 1 lit (1 rank).

**Tide Height**: each Turning raises it by 1 (max 10): enemies +40% HP and +25% damage per Height, land and world-structure costs +15% per Height, elites gain a second affix at Height 3, new raid types at Height 5. A Height-1 run with a typical Moon Chart takes about 45–55 hours.

---

## 19. Juice: feedback rules

| Event | Feedback |
|---|---|
| Tool/weapon hit | 40 ms hitstop for the attacker's client; target squashes 1.25x/0.8y for 80 ms; white flash 60 ms; knock 2 px shake |
| Node break | 3 px shake, drops burst outward in arcs then magnet after 0.25 s, pitch-randomised pop |
| Pickup | item arcs to player, stack counter toast bottom-left merges duplicates ("+12 Driftwood"), pitch rises with rapid pickups (resets after 0.6 s) |
| Crit | damage number 1.6x size, yellow, 6 px shake, `crit_spark` |
| Level up | radial burst, 150 ms slow-motion of local particles only (the simulation never pauses), fanfare, deck icon pulses |
| Plot raise | 2.5 s sequence, 10 px rolling shake, water sheets, gulls scatter, horn sting |
| Low HP | red vignette pulse, heartbeat thump under 25% |
| Boss phase | 300 ms freeze-frame on client visuals, screen flash, boss name banner |
| UI | every button has hover lift (1 px), press sink, click tick; panels slide 120 ms with overshoot |

All shakes scale with an accessibility slider (0–100%). Flashes respect a "reduce flashing" toggle.

### 19.1 Particle effects (complete list)

Every effect is a named preset in `client/fx/presets.js`. This table holds 89 names in 86 rows (rows 56, 59 and 60 hold two each); Appendix A.8 adds 37 more (one per remaining ability, one signature per boss and Keeper, raids, tempering, set procs). Total: **126 preset names**. Colours reference the master palette. "n" is particle count.

| # | Preset name | Fires when | Look |
|---|---|---|---|
| 1 | `hit_wood` | hook hits a tree | n6 brown/tan chips, cone opposite to swing, gravity, 0.4 s |
| 2 | `hit_stone` | hook hits rock/ore | n6 grey shards + 2 white sparks, 0.35 s |
| 3 | `hit_plant` | hook hits reeds/bush/crop | n5 green leaf shapes, flutter (sine drift), 0.6 s |
| 4 | `hit_ice` | hits on Hoarfrost nodes | n7 pale-blue shards, slight glow, 0.4 s |
| 5 | `hit_null` | hits on Umbral nodes | n6 violet motes that rise instead of fall, additive, 0.6 s |
| 6 | `hit_clink` | tool too weak | n3 grey sparks + small "X" glyph, 0.25 s |
| 7 | `break_wood` | tree destroyed | n18 chips + n6 leaves + dust ring, 0.7 s |
| 8 | `break_stone` | rock/ore destroyed | n16 shards (ore-coloured for veins) + dust puff ring, 0.6 s |
| 9 | `break_plant` | plant destroyed | n12 leaves spiral upward, 0.8 s |
| 10 | `break_crystal` | gem node / ice / glass destroyed | n20 bright shards, additive, 4 star-glints, 0.7 s |
| 11 | `gem_sparkle` | idle on gem nodes and rare drops | 1 star-glint every 0.4 s, 4-point, white/yellow |
| 12 | `drop_pop` | item drop spawns | 3 tiny white pixels + drop bounces twice |
| 13 | `pickup_trail` | item magnetises to player | 4-pixel trail in the item's dominant colour |
| 14 | `pickup_flash` | item absorbed | 1 ring expanding 6 px, white, 0.15 s |
| 15 | `xp_mote` | XP granted | 2–5 cyan motes fly from source to the XP bar (UI layer), 0.5 s ease-in |
| 16 | `level_up` | level-up | 40 gold sparks radial + 2 expanding rings + rising column of 20 motes, 1.2 s |
| 17 | `card_reveal` | draft opens | per-card shimmer by rarity colour; Mythic adds 30 orbiting embers |
| 18 | `card_pick` | card chosen | card dissolves into 24 rarity-coloured pixels flying to the deck icon |
| 19 | `skill_buy` | skill node bought | node pulse ring + 12 sparks along the connecting line |
| 20 | `footstep_dust` | every 0.25 s while running on land | 2 pale dust pixels behind feet, 0.3 s |
| 21 | `footstep_splash` | moving in shallows / tidal flat | 3 white-blue droplets + ripple ring, 0.4 s |
| 22 | `footstep_snow` | Hoarfrost | 2 white puffs + footprints decal fading 4 s |
| 23 | `footstep_ash` | Emberreach | 2 dark-grey puffs, 1 orange ember 20% |
| 24 | `dodge_trail` | dodge roll | 5 afterimage silhouettes fading 0.25 s + dust burst at start |
| 25 | `swing_arc` | any melee/tool swing | crescent of 8 white pixels sweeping the arc, 0.12 s |
| 26 | `hit_flesh` | weapon hits organic enemy | n6 enemy-blood-colour droplets (green/teal/orange by enemy), 0.35 s |
| 27 | `hit_armor` | weapon hits armored/constructed enemy | n5 yellow sparks, 0.25 s |
| 28 | `crit_spark` | critical hit | 8-point star burst, yellow-white, additive, 0.2 s + n8 sparks |
| 29 | `enemy_death` | enemy dies | body flashes white, pops into n14 body-coloured pixels + smoke puff, 0.6 s |
| 30 | `elite_aura` | elite alive | 1 gold mote orbiting per 0.2 s, additive |
| 31 | `elite_death` | elite dies | `enemy_death` x2 + gold ring + 10 Glint-coloured sparks |
| 32 | `burn` | burning target | 2 orange/yellow flame pixels rising per 0.1 s, additive |
| 33 | `burn_explode` | Ember Heart / cinderling blast | n30 orange-red radial + dark smoke ring + flash, 0.5 s |
| 34 | `chill` | slowed/chilled target | 1 pale-blue snowflake drifting down per 0.2 s |
| 35 | `freeze_shatter` | frozen enemy killed / freeze ends | n16 ice shards radial + mist, 0.5 s |
| 36 | `spark_chain` | spark/lightning chains | jagged 2-px yellow-white polyline between targets, 0.1 s, + n4 sparks at each end |
| 37 | `lightning_strike` | Thunderhead, storms | vertical bolt from top of screen, full-screen 40 ms flash (respect toggle), scorch decal, n12 sparks |
| 38 | `tide_wave` | Tidal Surge, Kingwave | moving wavefront of 30 blue-white droplets + foam trail |
| 39 | `heal` | healing received | 4 green plus-shaped pixels rising, 0.7 s |
| 40 | `shield_pop` | shield gained / broken | blue hex ring in / n10 blue shards out |
| 41 | `poison_bubble` | bleed/poison ticks | 1 purple-green bubble popping |
| 42 | `ability_cast` | any ability cast | class-coloured ring contracting to player 0.15 s |
| 43 | `anchor_slam` | Bulwark E | ground crack decal + n24 stone chunks + dust ring radius 3 |
| 44 | `gale_step` | Squallblade Q | horizontal streak lines + 10 pale-green wisps |
| 45 | `undertow` | Brinesinger E | 40 droplets spiralling inward continuously for 4 s |
| 46 | `tidepool` | Brinesinger R | rippling ring decals + rising bubbles for 8 s |
| 47 | `overclock` | Gearwright E | yellow gear glyphs spinning above target + sparks |
| 48 | `seismic` | Prospector Q | ring shockwave + dust plumes at every node hit |
| 49 | `motherlode` | Prospector F | golden aura on player, glints on all nodes in view |
| 50 | `verdant_tide` | Greenwarden F | green ring expanding, n40 leaves, flowers pop from ground decals |
| 51 | `summon_puff` | turrets/summons/Scuttlers appear or expire | white smoke puff n10 + 4 gear/leaf glyphs |
| 52 | `boss_telegraph` | boss ground attack | red ring/line fills over wind-up; n6 red embers on its edge |
| 53 | `boss_phase` | boss changes phase | 60 particles in boss colour imploding then exploding, shockwave ring |
| 54 | `boss_death` | boss dies | 2.5 s chain of 8 `burn_explode`-style pops across the body, final white-out ring, loot fountain |
| 55 | `plot_rise` | plot raised | along the plot edges: n200 water droplets falling, foam line retreating, mist; 2.5 s |
| 56 | `tide_out` / `tide_in` | tide changes | foam line pixels sweeping across tidal flats; small crabs scatter (decor sprites) |
| 57 | `water_ripple` | ambient on water every few seconds; fish bite | expanding 1-px ring, light blue |
| 58 | `fish_splash` | hook set / catch | n12 droplets up + fish silhouette arc on catch |
| 59 | `rain` / `storm_rain` | weather | 120 / 240 slanted blue streaks (screen-space) + ground splash pixels |
| 60 | `snow` / `blizzard` | weather | 100 / 300 white flakes with sine drift; blizzard adds horizontal streaks |
| 61 | `ashfall` | weather | 80 grey flakes + 10 orange embers rising |
| 62 | `fog_bank` | weather | 12 large soft translucent blobs drifting (pre-rendered dithered sprites) |
| 63 | `heat_shimmer` | heatwave | horizontal 1-px row offsets on the world layer (cheap scanline wobble) |
| 64 | `eclipse_motes` | eclipse | violet motes rising everywhere, vignette |
| 65 | `fireflies` | Greenmarrow/Saltfen at night | 20 yellow-green blinking dots wandering |
| 66 | `leaf_fall` | ambient near trees | 1 leaf per tree per 5 s, sway |
| 67 | `kiln_smoke` | Kiln/Boiler working | 1 grey puff per 0.3 s rising and expanding; orange spark 10% |
| 68 | `craft_done` | any craft completes | 6 white sparkles over the station + item icon pops up |
| 69 | `machine_work` | Autobench/Drill running | small yellow sparks at the tool head every 0.5 s |
| 70 | `sluice_flow` | Sluice tiles | 1 light-blue pixel moving along flow direction per tile per 0.5 s |
| 71 | `flux_arc` | generators / low Flux warning | blue-white arc flicker; red when demand > supply |
| 72 | `build_place` | structure placed | dust ring + 8 plank/stone chips + structure squash-in |
| 73 | `build_remove` | deconstruct | reverse puff + materials fly to player |
| 74 | `crop_grow` | crop stage up | 3 green sparkles |
| 75 | `water_pour` | watering | 8 blue droplets arc + soil darkens |
| 76 | `glint_burst` | Glint gained (>= 10) | gold coin-pixels fountain flying to the Treasury counter (UI layer) |
| 77 | `chest_open` | chest/tide cache | lid pop, light rays (4 additive wedges), n20 gold sparks |
| 78 | `beacon_light` | Beacon lit / idle | huge vertical additive beam, rotating rays, n100 rising motes on lighting; idle: 1 mote/0.2 s |
| 79 | `gate_stage` | Tidegate stage complete | scaffolding dust falls, ring of light, 150 sparks |
| 80 | `waystone_warp` | teleport | column of 30 cyan pixels rising at origin, falling at destination |
| 81 | `revive` | player revived / Phoenix Ash | gold-white upward spiral n30 |
| 82 | `death_poof` | player death | 20 grey pixels + Sea Chest drops with a thud ring |
| 83 | `quest_done` | quest complete | banner confetti: 40 multi-colour rectangles falling on the UI layer |
| 84 | `donate_confetti` | Archive donation | 16 confetti pieces around the pedestal |
| 85 | `ping` | player ping (T) | two expanding rings in the player's colour + bouncing arrow |
| 86 | `moon_shards` | final boss, Rebirth | white-violet shards orbiting then converging; full-screen fade |

---

## 20. Audio direction

All audio is synthesised with WebAudio at runtime (definitions in `TECH_SPEC.md` section 10).

- **SFX**: short, chunky, pitch-randomised +/-6%. Families: taps (wood = low square blip, stone = noise click + sine ping, plant = filtered noise swish), pops (pickup arpeggio that climbs a pentatonic scale with rapid pickups), impacts, UI ticks, ability whooshes, boss roars (detuned saw sweeps).
- **Music**: one generative track per biome plus night variants, dungeon, boss, title. 4 channels (bass, lead, pad, drums), pentatonic or modal scales per biome, 70–120 BPM, pattern-based with seeded variation so loops do not repeat exactly. Boss tracks add a fifth channel and raise tempo by 15%.
- **Ambience**: filtered noise for surf (volume follows distance to water and tide phase), wind (Hoarfrost), crackle (Emberreach).

| Biome | Scale | BPM | Lead timbre | Mood |
|---|---|---|---|---|
| Greenmarrow | C major pentatonic | 96 | triangle | gentle, hopeful |
| Saltfen | D dorian | 84 | soft square 25% | murky, curious |
| Emberreach | E phrygian | 108 | saw, low-pass | tense, heavy |
| Glasswaste | A lydian | 100 | sine + bell FM | bright, strange |
| Hoarfrost | F# minor pentatonic | 76 | triangle + long reverb-like delay | sparse, cold |
| Umbral | C whole-tone | 70 | detuned square pair | eerie |
| Vault | biome scale, minor variant | +10 | — | driving |
| Boss | biome scale | +15% | adds arpeggio channel | urgent |

---

## 21. UI

Pixel font drawn from a procedural 5x7 glyph table (no font files). UI scale 2x/3x.

| Element | Position | Contents |
|---|---|---|
| HP / Surge bars | top-left | segmented bars, numbers on hover, buff icons below |
| XP bar | bottom, full width, 6 px | fills continuously, level number at left, flashes on gain |
| Hotbar | bottom-centre | 8 slots, counts, cooldown wipes; ability icons Q/E/R/F to its right |
| Treasury | top-right | Glint counter (rolling digits), Flux supply/demand under it once relevant |
| Clock | top-right under Treasury | day/night dial, tide indicator (wave icon fills/empties), weather icon |
| Goal Tracker | right side | 3 pinned goals with progress bars (next plot cost, pinned recipe, quest) |
| Minimap | top-right corner, 96x96 px | owned plots, players, pings, bosses, Sea Chests |
| Pickup feed | bottom-left | merged "+N item" lines, 3 s |
| Draft badge | above hotbar | pulsing deck icon with pending count |
| Party frames | left side | name, class icon, HP, level for each other player |
| Chat | bottom-left above feed | fades after 6 s |
| Toasts | top-centre | quest updates, "Tide turning", "Raid incoming" |

Panels: Inventory/Character, Crafting (recipes with have/need counts, "pin" button, craft x1/x5/max), Build menu (categories: Stations, Storage, Farming, Automation, Flux, Defence, Decor), Station UI (input/fuel/output/queue), Machine config (recipe select, filters, Supply/Request tags), Card draft, Deck, Skill Chart, Map (click plot to raise; cost shown; features if known), Journal (Quests / Archive / Logbook / Bestiary / Fish), Market, Shop, Class select, Settings (volume, shake, flashing, zoom, UI scale, key rebinding), Lobby/Title (name, colour, host address, world select).

Clarity rules: every locked thing shows *exactly* what unlocks it. Every recipe ingredient is clickable to show its own recipe/source. Costs you cannot afford are red with the missing amount.

---

## 22. Multiplayer rules summary

| Topic | Rule |
|---|---|
| Players | 1–8, drop-in/drop-out at any time; world runs while at least one player is connected (with `--persist` the clock keeps running when empty, but machines, crops, respawns and market recovery are paused) |
| Shared | world, plots, structures, Stockpiles, Treasury (Glint), Archive, quests of type world (main chain), Beacons, Flux |
| Personal | inventory, gear, level, cards, skills, class, mastery, Logbook, side-quest progress |
| Loot | node drops are shared ground items; enemy and boss loot is rolled per player (instanced); XP follows section 5.2 (your own actions; kill XP split by contributors) |
| Scaling | `S` = bound players: profiles with >= 30 min of playtime within the last 10 hours of world playtime (max 8), recomputed once per hour of world playtime; a pending change is announced one hour before it applies. `coopScale = 1 + 0.7*(S-1)` multiplies land costs, Ballast, world-structure costs (W), Tidegate costs, and machine caps |
| Catch-up | a player more than 5 levels below the party average gains +100% XP ("Wake bonus") |
| Friendly fire | none |
| Trading | drop items, or use shared Stockpiles |
| Griefing guard | deconstructing another player's structure placed in the last 10 min needs their consent; the host can kick, unbind and set spend caps. Host = any connection from a loopback address, plus the token given with `--admin <token>` |
| Identity | client keeps a random token in localStorage; server maps token -> profile inside the world save |

---

## 23. Onboarding (first 15 minutes)

1. Wake on the start plot. Prompt: "Hold LMB on a tree." (Goal Tracker: 10 driftwood.)
2. Build Workbench (B). Craft Blade. One scripted Mossback appears (a tutorial spawn that drops 5 Glint; normal spawning never happens on the start plot).
3. Level 2: first card draft explained in one line. Build Kiln; smelt copper.
4. Tide goes out at minute 4: "The sea has pulled back. Tidal flats are safe for 2 minutes." First tide cache.
5. Smelt 10 copper bars into 10 Ballast, reach 55 Glint (the `q01` reward and the first tide cache cover it), raise the first plot: about minute 20. Enemies start to appear only once a plot beyond the start plot exists.
6. From here the Goal Tracker and main chain take over. No modal tutorials; all prompts are dismissible toasts.

---

## Appendix A. Complete content lists

Everything below is final content. WP2 enters it as data; no builder invents entries.

### A.1 Shrine and Trench trinkets (the other 12 of 24)

| id | Source | Effect |
|---|---|---|
| `tide_compass` | shrine chest pool | tide caches show on the minimap; +25% tidal-flat yield |
| `lucky_cork` | shrine chest pool | +15 luck |
| `gull_feather` | shrine chest pool | +12% move speed |
| `salt_idol` | shrine chest pool | +20% max HP regen; food buffs last 20% longer |
| `miser_purse` | shrine chest pool | +15% Glint from all sources |
| `runner_anklet` | shrine chest pool | dodge recharge -20% |
| `ember_flask` | Ashka quest line | tonics last 50% longer |
| `frost_bead` | Halvard quest line | hits apply Chill (10% slow, 2 s) |
| `deep_lantern` | Morrow quest line; Trench floor 10 | light radius +4; +15% damage in Vaults and the Trench |
| `scuttler_whistle` | Trench floor 20 | Burrows within 10 tiles of you +20% rate |
| `storm_vial` | Trench floor 30 | every 5 s your next hit calls lightning for 150% |
| `moon_sliver` | Trench floor 40 | +10% to all yields and +10% XP |

Shrine chests roll one of the six pool trinkets the player does not own yet. Trench floor 50 gives a second copy of any Trench trinket for the Archive bestiary display (cosmetic).

### A.2 Blessings (run-only dungeon upgrades, 20)

A blessing room offers 3 of these at random (no duplicates of ones already held). All are lost on leaving the instance.

| id | Name | Effect |
|---|---|---|
| `bl_swift` | Racing Tide | +40% swing speed |
| `bl_chain` | Forked Current | attacks chain to 1 extra enemy for 50% |
| `bl_revive` | Second Breath | revive once at 50% HP |
| `bl_orbs` | Kind Water | enemies have a 15% chance to drop an orb that heals 8% max HP |
| `bl_crit` | Keen Tide | +20% crit chance |
| `bl_power` | Heavy Water | +30% damage |
| `bl_armor` | Shellback | +60 armor |
| `bl_surge` | Deep Well | Surge regen +100% |
| `bl_cdr` | Quick Eddy | -25% ability cooldowns |
| `bl_burn` | Hot Spring | hits burn for 50% over 3 s |
| `bl_chill` | Cold Seep | hits Chill 10%; 5 stacks freeze 1.5 s |
| `bl_spark` | Storm Glass | 20% on hit: lightning for 120% |
| `bl_dodge` | Slipwater | +2 dodge charges |
| `bl_thorns` | Urchin | reflect 40% of melee damage taken |
| `bl_leech` | Red Tide | 5% lifesteal |
| `bl_gold` | Glint Wake | +100% Glint found in this run |
| `bl_loot` | Full Nets | +1 loot roll from the Keeper |
| `bl_glass` | Glass Tide | +60% damage dealt, +30% damage taken |
| `bl_pup` | Tide Pup | a companion crab fights beside you (60% damage, 2 hits/s) |
| `bl_nova` | Breaking Wave | every 10 s release a wave: 200%, radius 3 |

### A.3 Elite affixes (6)

| id | Name | Effect |
|---|---|---|
| `swift` | Swift | +60% move speed, +30% attack rate |
| `plated` | Plated | +100 armor, immune to knockback |
| `volatile` | Volatile | 1 s after death explodes for 150% of its damage, radius 2.5 (telegraphed) |
| `leeching` | Leeching | heals 20% of damage it deals; each hit drains 10 Surge |
| `splitting` | Splitting | on death splits into 2 non-elite copies with 40% HP (no loot from copies) |
| `shrouded` | Shrouded | invisible beyond 4 tiles; its first hit from stealth deals +50% |

### A.4 Keeper move sets

Each Keeper has 3 phases at 100/66/33% HP; each phase keeps earlier moves. Wind-ups are at least 0.6 s. Enrage 6 minutes (8 for Keepers 4–6).

| Keeper | Phase 1 | Phase 2 adds | Phase 3 adds |
|---|---|---|---|
| Sporeking Bulb | `spore_lob`: 3 arcing pods leave clouds (10 dmg/s, 6 s; hook hits burst them). `root_jab`: line stab 6 tiles | `sporeling_call`: 4 Burrowgrubs | `bloom`: ring of 8 pods around itself every 8 s |
| The Barnacle Bell | `toll`: expanding ring, jump the gap. `barnacle_spit`: 5-shot fan | `flood`: half the room floods for 6 s (slow 50%), levers lower it | `clapper_swing`: 270-degree sweep, then 2 s vulnerable (x2 damage taken) |
| The Bellows Engine | `flame_jet`: 3 rotating jets. `slag_drop`: 4 ground markers | `conveyor`: floor belts push toward the jets, direction flips every 10 s | `overheat`: vents all jets at once, then core exposed 4 s |
| The Twin Lenses | `beam`: each Lens fires a tracking beam (1.2 s charge). `swap`: the two trade places | `refract`: beams bounce off the room's mirrors once | `focus`: both beams converge on one player; killing one Lens enrages the other (+40% rate) |
| The Thawless Knight | `cleave`: 180-degree arc. `shard_line`: icicles erupt along a line | `ice_floor`: room becomes ice (slippery) except around lit braziers | `glacier_drop`: 3 falling blocks that stay as walls; `frost_charge` across the room |
| Scribe of Nothing | `ink_blot`: 3 pools (slow 40%, 100 dmg/s). `quill_dart`: 3 fast darts | `erase`: removes 6 floor tiles for 8 s (fall = 20% max HP and respawn at room edge) | `darkness`: light radius 3 for 10 s while it teleports between attacks |

### A.5 Relics (Archive `wing_relic`, 12)

| id | Name | Found in |
|---|---|---|
| `relic_01` | Barnacled Compass | Greenmarrow shrine chest (guaranteed first) |
| `relic_02` | Salt-Glazed Bowl | Saltfen `dig` plot |
| `relic_03` | Ropewalker's Knot | Saltfen `dig` plot |
| `relic_04` | Cinder Tablet | Emberreach `dig` plot |
| `relic_05` | Kiln-God Figurine | Emberreach `dig` plot |
| `relic_06` | Mirror Shard of the First Lens | Glasswaste `dig` plot |
| `relic_07` | Sand-Clock | Glasswaste `dig` plot |
| `relic_08` | Frozen Lantern | Hoarfrost `dig` plot |
| `relic_09` | Antler Flute | Hoarfrost `dig` plot |
| `relic_10` | Tide-Table Slate | Sunken Cistern treasure room (guaranteed first clear) |
| `relic_11` | Bell Without a Voice | Refraction Hall treasure room (guaranteed first clear) |
| `relic_12` | The Blank Page | The Inkwell treasure room (guaranteed first clear) |

Each `dig` plot has 6 dig spots: 2 hold that biome's relics (one each), 4 hold 2 `relic_fragment` each. Dig spots are dug with the hook (10 hits) and do not respawn. Duplicate relics cannot drop.

### A.6 Remaining recipes, seeds, shops

| id | Recipe | Station |
|---|---|---|
| `ballast_1` | 3 `fieldstone` + 1 `copper_bar` + 1 fuel | Kiln |
| `ballast_2` | 3 `clay` + 1 `iron_bar` + 1 fuel | Kiln |
| `ballast_3` | 3 `obsidian` + 1 `cindersteel_bar` + 1 fuel | Kiln II |
| `ballast_4` | 3 `sunsand` + 1 `prism_alloy` + 1 fuel | Kiln II |
| `ballast_5` | 3 `everice` + 1 `rimesteel_bar` + 1 fuel | Kiln III |
| `pack_1` | 6 `cloth`, 4 `rope` (also Ferrin reward) | Loom |
| `pack_2` | 8 `leather`, 6 `kelp` | Loom |
| `pack_3` | 10 `cloth`, 10 `ashgrass`, 4 `ember_scale` | Loom |
| `pack_4` | 12 `cloth`, 12 `needlesilk`, 4 `mirage_dust` | Loom |
| `pack_5` | 14 `cloth`, 14 `frostmoss`, 4 `frost_pelt` | Loom |
| `rod_1` | 4 `driftwood`, 2 `rope` | Workbench |
| `rod_2` | 8 `iron_bar`, 4 `rope`, 2 `gear_part` | Anvil |
| `rod_3` | 8 `prism_alloy`, 6 `needlesilk`, 1 `lens` | Anvil II |
| `rod_4` | 8 `umbral_alloy`, 6 `inkweed`, 1 `echoglass` | Anvil III |
| `lantern_1` | 4 `copper_bar`, 2 `glass`, 1 `resin` | Workbench |
| `lantern_2` | 6 `prism_alloy`, 2 `lens`, 1 `amber` (also Lumen reward) | Workbench II |
| `vault_key_k` (k = 1..6) | 10 bar of tier k + 2 rare of tier k (`shell` for k = 1) | Anvil (tier 1–3), Anvil II (4–5), Anvil III (6) |
| `lure_k` (k = 1..6) | as listed in 12.2 | Cookpot |
| `seed_<crop>` (all 12 crops) | 1 crop -> 2 seeds | Workbench |
| `bandage`, `bomb` | as listed in 6.5 | hand / Workbench |

Every `ballast_k` recipe has a base time of 6 s (divided by 2 and 4 at Kiln II and III).

Seed items: `seed_tidewheat`, `seed_marrowberry`, `seed_mudroot`, `seed_saltbloom`, `seed_scorchpepper`, `seed_cindercap`, `seed_sunmelon`, `seed_glassgourd`, `seed_snowberry`, `seed_pinecone_pale`, `seed_inkcap`, `seed_moonpetal`.

The five cooked dishes in Archive `wing_works`: `reed_bread`, `fen_stew`, `ember_curry`, `glass_noodles`, `frost_sorbet`.

Castaway shops (restock each in-game day; prices in Glint):

| NPC | Stock |
|---|---|
| Ferrin | `seed_tidewheat` 2 (x20), `rope` 12 (x40), `plank` 9 (x40), `pack_1` 150 (x1 after his line) |
| Odalys | `seed_saltbloom` 8 (x20), `salt` 6 (x40), `reed_bread` 30 (x5) |
| Brannick | `copper_bar` 12 (x40), `nail` 9 (x40), `vault_key_1` 120 (x1) |
| Sootwren | `gear_part` 9 (x40), `iron_plate` 54 (x40), `sluice_board` 27 (x40) |
| Ashka | `seed_scorchpepper` 25 (x20), `tonic_haste` 80 (x3), `charcoal` 6 (x40) |
| Lumen | `seed_sunmelon` 60 (x20), `glass` 12 (x40), `cindersteel_bar` 60 (x40) |
| Quill | one random trinket from the shrine pool at `2,000 * 4^2` = 32,000 (x1, re-rolled daily) |
| Halvard | `seed_snowberry` 150 (x20), `prism_alloy` 108 (x40), `vault_key_4` 2,000 (x1) |
| Ysolde | `tide_token` 4,000 (x1), `lens` 285 (x40) |
| Nix | `seed_inkcap` 400 (x20), `rimesteel_bar` 210 (x40) |
| Morrow | `vault_key_6` 12,000 (x1), `tonic_surge` 600 (x3) |

Rule behind the material prices: previous-tier goods at 3x value, **40 units per item per in-game day**.

### A.7 Deeds (Logbook, 60)

Each Deed has 3 thresholds on one counter. Every threshold reached gives 1 `tide_token`; the third also gives the cosmetic `cos_<deed id>` (Gather: hook skin; Craft: hat; Fight: weapon trail colour; Explore: hat; Automate: Scuttler hat; Crew: ping colour). Counters are per player unless marked (world).

| id | Category | Name | Counter | Thresholds |
|---|---|---|---|---|
| `d_nodes` | Gather | Hookhand | `nodes_broken` | 1,000 / 10,000 / 100,000 |
| `d_wood` | Gather | Timberline | `wood_gathered` | 500 / 5,000 / 50,000 |
| `d_stone` | Gather | Quarry Dust | `stone_gathered` | 500 / 5,000 / 50,000 |
| `d_ore` | Gather | Veinfinder | `ore_gathered` | 500 / 5,000 / 50,000 |
| `d_plants` | Gather | Reed Reaper | `plants_gathered` | 500 / 5,000 / 50,000 |
| `d_tidal` | Gather | Flatwalker | `tidal_nodes` | 100 / 1,000 / 5,000 |
| `d_caches` | Gather | Cache Hound | `tide_caches` | 10 / 50 / 250 |
| `d_gems` | Gather | Glint Eye | `gem_nodes` | 10 / 100 / 500 |
| `d_crops` | Gather | Green Ledger | `crops_harvested` | 100 / 1,000 / 10,000 |
| `d_fish` | Gather | Wet Line | `fish_caught` | 25 / 200 / 1,000 |
| `d_craft` | Craft | Busy Hands | `items_crafted` | 500 / 5,000 / 50,000 |
| `d_bars` | Craft | Kilnkeeper | `bars_smelted` | 100 / 2,000 / 20,000 |
| `d_gear` | Craft | Outfitter | `gear_crafted` | 5 / 20 / 42 |
| `d_dishes` | Craft | Galley Hand | `dishes_cooked` | 10 / 100 / 500 |
| `d_tonics` | Craft | Stillmaster | `tonics_brewed` | 5 / 50 / 250 |
| `d_build` | Craft | Raise the Roof | `structures_built` | 25 / 150 / 600 |
| `d_temper` | Craft | Tempered | `tempers_done` | 5 / 30 / 100 |
| `d_ballast` | Craft | Heavy Foundations | `ballast_made` | 100 / 2,000 / 15,000 |
| `d_parts` | Craft | Parts Bin | `components_made` | 100 / 2,000 / 20,000 |
| `d_plots` | Craft | Landmaker | `plots_raised` (world) | 8 / 38 / 80 |
| `d_kills` | Fight | Shorebreaker | `mobs_killed` | 100 / 2,000 / 15,000 |
| `d_elites` | Fight | Gold Outline | `elites_killed` | 5 / 50 / 300 |
| `d_bosses` | Fight | Warden's Bane | `bosses_killed` | 2 / 8 / 20 |
| `d_hard` | Fight | Twice-Lured | `wardens_hard` | 1 / 3 / 6 |
| `d_damage` | Fight | Heavy Hitter | `damage_dealt` | 100,000 / 5,000,000 / 100,000,000 |
| `d_deaths` | Fight | Sea Tax | `deaths` | 1 / 10 / 50 |
| `d_crits` | Fight | Sharp Work | `crits_landed` | 500 / 10,000 / 100,000 |
| `d_casts` | Fight | Well Practised | `abilities_cast` | 100 / 2,000 / 15,000 |
| `d_raids` | Fight | Tidebreaker | `raids_survived` (world) | 1 / 10 / 40 |
| `d_dodges` | Fight | Slippery | `dodges` | 100 / 2,000 / 10,000 |
| `d_shrines` | Explore | Riddle Reader | `shrines_solved` | 1 / 5 / 11 |
| `d_vaults` | Explore | Vault Runner | `vaults_cleared` | 1 / 6 / 30 |
| `d_trench` | Explore | Deeper | `trench_deepest` | 10 / 20 / 30 |
| `d_relics` | Explore | Finder | `relics_found` | 3 / 8 / 12 |
| `d_legend` | Explore | Fish Story | `legendary_fish` | 1 / 3 / 6 |
| `d_archive` | Explore | Curator | `archive_donations` | 12 / 48 / 96 |
| `d_quests` | Explore | Good Neighbour | `quests_done` | 10 / 30 / 57 |
| `d_walk` | Explore | Long Shore | `distance_walked` (tiles) | 10,000 / 100,000 / 1,000,000 |
| `d_warp` | Explore | Stone Skipper | `waystone_jumps` | 10 / 100 / 500 |
| `d_kingtide` | Explore | King's Guest | `king_tides_worked` | 1 / 5 / 20 |
| `d_machines` | Automate | Foreman | `machines_built` | 5 / 30 / 100 |
| `d_burrow` | Automate | Many Legs | `burrow_units` (world) | 1,000 / 50,000 / 1,000,000 |
| `d_sluice` | Automate | Let It Flow | `sluice_items` (world) | 1,000 / 50,000 / 1,000,000 |
| `d_gulls` | Automate | Air Freight | `gull_deliveries` (world) | 100 / 5,000 / 50,000 |
| `d_auto` | Automate | Hands Off | `autobench_crafts` (world) | 100 / 5,000 / 100,000 |
| `d_flux` | Automate | Live Wire | `flux_peak` (world) | 50 / 250 / 600 |
| `d_sold` | Automate | Open Market | `items_sold` | 500 / 10,000 / 100,000 |
| `d_glint` | Automate | Treasurer | `glint_earned` | 5,000 / 200,000 / 2,000,000 |
| `d_mint` | Automate | Coin Press | `minted` (world) | 100 / 5,000 / 50,000 |
| `d_tend` | Automate | Good Shepherd | `tend_refills` | 50 / 500 / 5,000 |
| `d_revive` | Crew | Lifeline | `allies_revived` | 1 / 10 / 50 |
| `d_coop` | Crew | Shipmates | `coop_minutes` | 60 / 600 / 3,000 |
| `d_pings` | Crew | Over Here | `pings_sent` | 10 / 100 / 500 |
| `d_shared` | Crew | Together | `shared_kills` | 50 / 1,000 / 10,000 |
| `d_cards` | Crew | Full Deck | `cards_picked` | 20 / 60 / 110 |
| `d_mythic` | Crew | Legend in Hand | `mythics_owned` | 1 / 2 / 4 |
| `d_reroll` | Crew | Second Opinion | `rerolls_used` | 5 / 30 / 100 |
| `d_skills` | Crew | Charted | `skills_bought` | 15 / 40 / 60 |
| `d_mastery` | Crew | Many Callings | `mastery_levels` (sum over classes) | 10 / 30 / 60 |
| `d_rebirth` | Crew | Turner of Tides | `rebirths` | 1 / 2 / 5 |

### A.8 Additional particle presets (37; total preset names = 126)

The table in 19.1 holds 89 names (rows 56, 59 and 60 hold two each). These 37 complete the set. `test/fx-audio.test.js` asserts all 126 names exist.

| Preset name | Fires when | Look |
|---|---|---|
| `breakwater` | Bulwark Q | blue-steel shield arc in front of the player; blocked hits spray n6 sparks off it |
| `rally_horn` | Bulwark R | gold ring expanding to 8 tiles, small banner glyphs rising over each ally |
| `unmoored` | Bulwark F | chains of 12 grey links snapping outward, then a steady red-gold body aura |
| `crosscurrent` | Squallblade E | two counter-rotating pale-green crescents, radius 2.2 |
| `riptide_mark` | Squallblade R | teal crosshair glyph over the target, 3 droplets orbiting |
| `tempest` | Squallblade F | white slash streaks jumping between targets, afterimages of the player |
| `brine_bolt` | Brinesinger Q | blue-white bolt with a 6-pixel droplet trail, splash ring on hit |
| `kingwave` | Brinesinger F | 4-tile-wide wall of 60 droplets with a foam crest, wet-ground decal behind it |
| `pocket_turret` | Gearwright Q | gear glyphs and n8 yellow sparks at the deploy point; muzzle spark per shot |
| `magnet_coil` | Gearwright R | concentric blue rings contracting to the player, items leave streaks |
| `clockwork_legion` | Gearwright F | 4 ground hatches flip open with brass sparks and steam puffs |
| `vein_sense` | Prospector E | gold ripple expanding 20 tiles; highlighted nodes pulse with a gold outline |
| `blast_charge` | Prospector R | fuse sparks in flight, then n30 orange radial shards, dust ring and scorch decal |
| `thornlash` | Greenwarden Q | green whip arc with n8 thorn shards along it |
| `quickgrow` | Greenwarden E | green ring; each crop in range pops 3 leaf sparkles and squashes upward |
| `sproutling` | Greenwarden R | soil mound bursts, n10 dirt clods and 4 leaves |
| `boss_thornmother` | Thornmother root sweep | brown root line erupting tile by tile with dirt clods and leaf scatter |
| `boss_regent` | Mire Regent belly-flop | mud shockwave ring of 40 brown-green droplets, ripple decals |
| `boss_kilnheart` | Kilnheart vents | orange flame columns from vent tiles with rising embers and heat shimmer |
| `boss_prismarch` | Prismarch beam lattice | rainbow-edged white beams with glitter motes along their length |
| `boss_antler` | Glacier Antler charge | ice-shard wake of 30 pale-blue shards and a frost trail decal |
| `boss_choir` | Hollow Choir note waves | violet ring waves with small note glyphs riding the ring |
| `boss_moon` | Drowned Moon tidal lanes | tall walls of dark-blue droplets with white crests sweeping the arena |
| `keeper_sporeking` | spore cloud | slow yellow-green motes filling a radius, popping when burst |
| `keeper_bell` | toll ring | bronze ring with a visible gap, dust falling from the ceiling |
| `keeper_bellows` | flame jet | rotating orange jets with black smoke tips |
| `keeper_lenses` | converging beams | two white beams, bright star-glint where they meet |
| `keeper_knight` | glacier drop | shadow grows, block lands with n24 ice chunks and mist |
| `keeper_scribe` | erase | floor tiles dissolve into black pixels drifting upward |
| `raid_horn` | Tidebreak raid starts | red banner flash on the UI layer, 3 expanding red rings at the shore |
| `tidebreak_wave` | each raid wave lands | foam surge up the beach with n40 droplets |
| `set_proc` | a card set bonus triggers | small tag-coloured glyph (wave, flame, flake, bolt, leaf, gear, coin, fang) popping over the player |
| `temper_success` | tempering succeeds | white-hot flash on the item, n20 gold sparks, ring |
| `temper_fail` | tempering fails | grey smoke puff, n6 dull sparks falling |
| `mint_coin` | Mint or Ledger Post pays | 3 coin pixels arcing from the machine to the Treasury counter |
| `gull_trail` | courier Gull in flight | 2 white feather pixels drifting behind the gull every 0.5 s |
| `tend_warning` | machine tend meter at 0 | small blinking wrench glyph and 1 grey smoke puff per second |

### A.9 Small systems

| System | Rule |
|---|---|
| Tide Almanac | A panel on the Tidestone and in the Journal shows the next three weather rolls for each owned biome and the time of the next king tide. Weather is rolled three steps ahead so the forecast is always true |
| Plot charters | Each owned `wild` plot may be given one free charter, changeable once per in-game day: Quarry (stone and ore nodes +25% spawn weight), Orchard (wood and plant +25%), Workshop (machine cap +2, node cap -8), Garrison (no enemy spawns, Tide Lamps not needed). The classes not boosted by Quarry/Orchard get -50% weight |
| Card fusion | At the Calling Shrine: sacrifice two max-rank Common cards of the same tag to receive one draft of 3 Uncommon-or-better cards of that tag. The sacrificed cards leave the deck and return to the pool |
| Warden hard mode | Summoning with 2 Lures gives the Warden +100% HP and +25% damage and guarantees a trinket drop |
| Ping wheel | Hold T: four presets ("need this", "danger", "look here", "on my way") on the normal ping message |
| Tide-turn gamble | During the 10 s "tide turning" warning, tidal nodes give double yields |
| Pacing telemetry | The save records the world playtime at each gate (first plot, each Vault clear, each Warden, each Beacon, each Tidegate stage, final boss). The pause menu shows them ("Beacon 3 at 36 h 10 m") |
