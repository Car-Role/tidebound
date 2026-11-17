# TIDEBOUND — Pacing: the 100-hour proof

Version 3 (revised after the re-review in `CRITIQUE.md`). Every number in this document is printed by `docs/pacing-model.mjs` (`node docs/pacing-model.mjs`). WP14 ports that file to `shared/rules/pacing.js`, and `test/pacing.test.js` asserts the bands in section 10.

**Result:** the **critical path** (only what the game forces) is **85.8 hours** solo; the **full model** (critical path plus the optional content a normal player does) is **98.2 hours**. An efficient player (machines 25% faster than modelled, building 20% quicker) still needs 76.0 hours. Co-op critical path is 71–78 hours of wall-clock time.

Honest scope: these are design targets computed from tuning constants and stated assumptions. 43.65 of the 85.8 critical hours (building 19.8, side content 12.1, combat 11.75) are time estimates, not derived. The first playtest numbers from the pacing bot and the save telemetry (section 10), not this model, are the acceptance test for "about 100 hours".

---

## 1. What is forced

Nothing below can be skipped or reordered.

```
Biome k (k = 1..6):
  raise ALL plots of biome k            (Glint by the land curve + Ballast per plot)
  finish every castaway quest line of biome k and every shrine of biome k
  clear Vault k            -> vault_core_k -> craft hook k+1
  craft Lure k, kill Warden k -> trophy
  build Beacon k           -> biome k+1 plots become purchasable
After Beacon 6:
  Archive wings: 4 for Tidegate stage 1, 6 for stage 3, all 8 for stage 5
  Trench floor 10          (moonpetal seeds for stage 5)
  Tidegate stages 1..5     -> Drowned Moon
```

Four clocks limit progress. A phase ends when all four allow it.

| Clock | Limited by | Section |
|---|---|---|
| Materials | harvest throughput (manual + automation) vs required raw units | 3 |
| Glint | capped income sources vs the land curve | 4 |
| Rares | gem nodes, Burrow and Drill shares vs recipe demand | 5 |
| XP | XP rate vs level curve (soft: gates skill rows and abilities) | 6 |

Idle time is not a clock: machines drop to 10% speed 30 minutes after an *active* player was last near them (Tending, `DESIGN.md` 8.0), and an empty server pauses machines.

---

## 2. Phase table (solo, full model)

| Phase | Name | Hours | Length | Plots at end | Level at end | Hook tier | Automation stage reached | Exit gate |
|---|---|---|---|---|---|---|---|---|
| 0 | Castaway | 0–1.4 | 1.4 | 2 | 8 | 1 | 1 | first plot raised (about minute 20), Anvil built |
| 1 | Greenmarrow | 1.4–8.6 | 7.2 | 9 | 18 | 2 | 2 | Beacon 1 |
| 2 | Saltfen | 8.6–21.9 | 13.4 | 24 | 32 | 3 | 3, 3b (Burrow I hour 14, Spillway hour 18) | Beacon 2 |
| 3 | Emberreach | 21.9–39.0 | 17.1 | 39 | 46 | 4 | 4, 5 (Sluices hour 26, Flux and Autobench hour 34) | Beacon 3 |
| 4 | Glasswaste | 39.0–56.4 | 17.4 | 54 | 60 | 5 | 6, 6b (hour 44, Tiller Bot hour 50) | Beacon 4 |
| 5 | Hoarfrost | 56.4–72.9 | 16.5 | 69 | 74 | 6 | 7, 7b (hour 60, Gulls hour 66) | Beacon 5 |
| 6 | Umbral Deep | 72.9–89.3 | 16.5 | 81 | 90 | 7 | 8, 9 (hour 76, hour 86) | Beacon 6 |
| 7 | Tidegate and Moonfall | 89.3–98.2 | 8.9 | 81 | 100 | 7 | 9 | Drowned Moon |
| | **Total** | | **98.2** | | | | | |

---

## 3. Clock 1 — Materials

### 3.1 Unit of account

**RU (raw unit)** = one raw drop or one fuel unit, of any tier, at face value. Every required amount below is expanded from the recipes in `DESIGN.md` down to raw drops and fuel by the model script.

### 3.2 Throughput assumptions

| Quantity | Value | Derivation |
|---|---|---|
| Swings per second | 2.0 | base `swingSpeed` |
| Hits to break an at-tier node | 3 (T1) to 5.5 (T6) | node HP / hook power |
| Seconds per node incl. walking | 5.0 | 1.5–2.75 s swinging + about 2.5 s travel and pickup |
| Share of gather time swinging (rest: hauling, loading stations) | 45% | assumption |
| Drops per node | 2.3 average | node table |
| Base manual rate | `12/min * 0.45 * 2.3 * 60` = 745 RU/h, used as 700 in phase 0 | |
| Manual growth | level, cards, skills, class; all yield bonuses add and cap at x3.0 | 700 -> 2,000 RU/h |

Automated throughput = installed base x base rate x the typical machine speed bonus of that phase (F10 +20%, Archive `wing_works` +10%, cards; cap x3.0), at full tend:

| Phase | Installed base (base rates) | Base RU/h | Speed bonus | Automated RU/h |
|---|---|---|---|---|
| 0 | none | 0 | — | 0 |
| 1 | 2 Drip Collectors, 1 Sap Tap, 1 Hum Hive, 1 Creel | 150 | x1.0 | 150 |
| 2 | 2 Burrow I (360 each) from hour 14, averaged over the phase | 600 | x1.0 | 600 |
| 3 | 4 Burrow I (1,440), 1 Burrow II (960) at partial uptime | 1,900 | x1.1 | 2,090 |
| 4 | 4 Burrow II (3,840), 3 Burrow I (1,080), Trawl Buoy | 5,000 | x1.2 | 6,000 |
| 5 | 4 Burrow III (8,640), 4 Drills (2,400), Tiller Bots and Trawls (1,460) | 12,500 | x1.3 | 16,250 |
| 6 | 8 Burrow III (17,280), 10 Drills (6,000), farms (3,720) | 27,000 | x1.4 | 37,800 |
| 7 | 12 Burrow III and 12 Drills | 30,000 | x1.5 | 45,000 |

Burrows are producers that need standing nodes in radius, and **each node counts toward only one Burrow**. A 22-node wild plot therefore runs one Burrow III at full rate (12 nodes) plus one at 83% (10 nodes): land, not machine count, is the factory ceiling. 8 Burrow III need about 4.4 open plots of the biome; Umbral has 12. The machines counted here are exactly the ones whose cost is in the "machines" column below.

### 3.3 Required raw units and hours (model output A)

Columns: **gates** = Beacon (phase 7: all five Tidegate stages); **ballast** = Ballast for every plot raised in the phase; **gear** = hook, one weapon, three armor pieces of the tier; **machines** = the installed base above plus stations; **sold** = raw units that must be sold to hit the modelled income (section 4).

| Phase | Gates | Ballast | Gear | Machines | Sold | **Required RU** | Manual/h | Auto/h | Gather h |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 70 | 0 | 500 | 0 | 570 | 700 | 0 | 0.81 |
| 1 | 1,200 | 2,450 | 224 | 400 | 0 | 4,274 | 900 | 150 | 4.07 |
| 2 | 1,030 | 9,450 | 278 | 720 | 0 | 11,478 | 1,100 | 600 | 6.75 |
| 3 | 3,420 | 16,800 | 692 | 4,023 | 2,047 | 26,982 | 1,300 | 2,090 | 7.96 |
| 4 | 7,060 | 33,000 | 926 | 8,081 | 6,255 | 55,322 | 1,500 | 6,000 | 7.38 |
| 5 | 15,350 | 68,400 | 944 | 15,228 | 9,911 | 109,833 | 1,700 | 16,250 | 6.12 |
| 6 | 47,800 | 132,000 | 1,358 | 22,125 | 17,278 | 220,561 | 1,900 | 37,800 | 5.56 |
| 7 | 144,000 | 0 | 0 | 8,750 | 11,612 | 164,362 | 2,000 | 45,000 | 3.50 |
| **Total** | | | | | | **593,382** | | | **42.14** |

Fuel units inside gates and ballast per phase: 20, 1,000, 2,970, 6,120, 15,160, 36,500, 87,600, 64,100. Fuel is over a third of all required RU; from phase 3 it is meant to come from Burrows on brimstone and peat ground feeding Kiln fuel slots by Grabber.

Why Ballast exists: expanded from recipes, Beacons, gear and machines alone are only 35–45% of what the phase lengths need. Ballast spreads the rest over every plot, so each plot (about one per hour) is a small project and the factory always has a job.

### 3.4 Critical path and full model (model output A, continued)

"Required" columns are forced by the gate chain. "Optional" is content a typical player also does.

| Phase | Gather h | Combat required | Building | Side required | **Critical h** | Combat optional | Side optional | Optional RU h | **Full h** |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.81 | 0.2 | 0.3 | 0.1 | **1.41** | 0 | 0 | 0 | **1.41** |
| 1 | 4.07 | 0.9 | 1.0 | 0.7 | **6.67** | 0.3 | 0.1 | 0.1 | **7.17** |
| 2 | 6.75 | 1.4 | 2.0 | 1.8 | **11.95** | 0.9 | 0.4 | 0.1 | **13.35** |
| 3 | 7.96 | 1.7 | 3.0 | 2.2 | **14.86** | 1.5 | 0.5 | 0.2 | **17.06** |
| 4 | 7.38 | 1.9 | 3.5 | 2.2 | **14.98** | 1.7 | 0.5 | 0.2 | **17.38** |
| 5 | 6.12 | 2.0 | 3.6 | 2.2 | **13.92** | 1.9 | 0.5 | 0.2 | **16.52** |
| 6 | 5.56 | 2.2 | 3.8 | 2.2 | **13.76** | 2.1 | 0.4 | 0.2 | **16.46** |
| 7 | 3.50 | 1.45 | 2.6 | 0.7 | **8.25** | 0.5 | 0.1 | 0 | **8.85** |
| **Total** | **42.14** | **11.75** | **19.8** | **12.1** | **85.79** | 8.9 | 2.5 | 1.0 | **98.19** |

**Critical path: 42.14 + 11.75 + 19.8 + 12.1 = 85.79 hours. Full model: 85.79 + 12.40 = 98.19 hours.**

**Efficient-player check:** with automation 25% faster than the table (more speed cards, Gearwright) and building 20% quicker, the critical path is 75.98 hours. A player who wastes materials, dies, decorates or explores lands above 100; the model contains no waste allowance.

### 3.5 Where the fixed hours come from

| Required combat | Count | Minutes each | Hours |
|---|---|---|---|
| Vault first clears | 6 | 25–40 | 3.2 |
| Warden fights incl. failed attempts and Lure prep | 6 x about 3 attempts | 10 | 3.0 |
| Mob drops for Lures, armor, quest steps; incidental fights while gathering | — | — | 3.75 |
| Trench to floor 10 | 2–3 runs | 20 | 1.0 |
| Final boss attempts | about 3 | 15 | 0.8 |
| **Subtotal** | | | **11.75** |

| Required side content | Count | Minutes each | Hours |
|---|---|---|---|
| Castaway quest lines (Beacon requirement) | 33 steps | 8 | 4.4 |
| Shrines (Beacon requirement) | 11 | 6 | 1.1 |
| Fishing for `wing_angler` (12 uncommon and rare fish; the Tide Almanac removes blind waiting and the pity rule bounds bad luck: a rare by the 20th cast under its condition, a legendary by the 60th) | — | — | 2.6 |
| Farming for `wing_harvest`, Lures, `moonpetal` before Tiller Bots | — | — | 2.5 |
| Dig sites, relics, Archive donations | — | — | 1.5 |
| **Subtotal** | | | **12.1** |

| Optional content | Hours |
|---|---|
| Vault repeat clears (keys, trinkets) | 4.0 |
| Extra Trench runs beyond floor 10 | 2.4 |
| Elective overworld fights, raids defended in person | 2.5 |
| Tide Board contracts, Logbook hunting | 2.5 |
| Tempering, decoration, surplus food (RU) | 1.0 |
| **Subtotal** | **12.4** |

Building (19.8 h, all required) is placing structures, routing Sluices and re-laying the factory at each tier; it is an assumption per phase, not derived.

---

## 4. Clock 2 — Glint and land

### 4.1 Land cost curve

```
landCost(n) = round5( 50 * 1.08^n ) * coopScale * (1 - landDiscount) * (1 + 0.15 * tideHeight)
n = ordinal of the purchase, 1..80      round5(x) = round(x / 5) * 5      landDiscount <= 0.20
```

| n | Cost | | n | Cost | | n | Cost |
|---|---|---|---|---|---|---|---|
| 1 | 55 | | 23 | 295 | | 53 | 2,955 |
| 2 | 60 | | 24 | 315 | | 54 | 3,190 |
| 8 | 95 | | 38 | 930 | | 68 | 9,370 |
| 9 | 100 | | 39 | 1,005 | | 69 | 10,120 |
| | | | | | | 80 | 23,600 |

Total for 80 plots: **317,910 Glint.** All 80 are required, so this is also the critical-path land spend.

| Biome | Ordinals | Plots | Glint | Ballast per plot | Ballast RU for the biome |
|---|---|---|---|---|---|
| Greenmarrow | 1–8 | 8 | 585 | `10 * ordinal` `ballast_1` | 2,520 |
| Saltfen | 9–23 | 15 | 2,710 | 90 `ballast_1` | 9,450 |
| Emberreach | 24–38 | 15 | 8,605 | 160 `ballast_2` | 16,800 |
| Glasswaste | 39–53 | 15 | 27,310 | 200 `ballast_3` | 33,000 |
| Hoarfrost | 54–68 | 15 | 86,635 | 380 `ballast_4` | 68,400 |
| Umbral | 69–80 | 12 | 192,065 | 1,000 `ballast_5` | 132,000 |

A plot is raised about every 65 minutes at every stage of the game.

**The first plot.** Before any plot is raised no enemies spawn, so the model credits phase 0 with no mob drops. The first plot (55 Glint, 10 `ballast_1`) is paid by `q01` (60 Glint, the one exemption from the 25% quest-reward rule) and the guaranteed 15-Glint tide cache of the first low tide: about minute 20. Phase-0 income is 103 Glint against 55 spent; the second plot follows early in phase 1.

### 4.2 Income is the sum of capped sources (model output B)

| Source | Rate | Cap mechanism |
|---|---|---|
| Enemy drops | `tier * rand(0..2)` Glint, elites x5; 100 kills/h; none in phase 0 | spawn only on the player's plot and its neighbours, cap `6 + 4 * tier` live enemies per player |
| Tide caches | `20 * tier` Glint/h | one low tide per 6 min; tidal nodes 1 per 10 s, cap 8; 4% caches |
| Tide Board contracts | `30 * 2^tier` Glint each, one per hour assumed | one shared set of 3 contracts per 3 in-game days, each paid once per world |
| Selling | at most about `120 * value` Glint/h **per kind of item**; trading opens with Beacon 1 (`MARKET_SELL_BEACON`) | saturation x0.99 per unit, floor 0.01, +0.02 per minute |
| Ledger Post | 70% of the above, 20 items/min per post | same saturation |
| Mint | 60%, one shared saturation entry | cannot bypass the cap |
| Main-quest Glint | each reward <= 25% of the next plot's cost (`q01` exempt: 60) | fixed list, 14,140 Glint over the whole game |

The reference curve is `min(150 * 1.07^h, 40,000)` Glint/h. The model must stay within 0.8–1.3x of it in phases 1–7.

| Phase | Hours | Curve Glint | Modelled Glint | Ratio | Drops/h | Caches/h | Contracts/h | Sales/h | Selling rotation | Land spend | Land share |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0–1.4 | 223 | 103 | 0.46 | 0 | 20 | 0 | 0 | none (plus `q01` 60 and first cache 15) | 55 | 53% |
| 1 | 1.4–8.6 | 1,523 | 1,520 | 1.00 | 132 | 20 | 60 | 0 | none | 530 | 35% |
| 2 | 8.6–21.9 | 5,817 | 5,661 | 0.97 | 264 | 40 | 120 | 0 | none | 2,710 | 48% |
| 3 | 21.9–39.0 | 21,238 | 20,062 | 0.94 | 396 | 60 | 240 | 480 | 1 good worth 4 | 8,605 | 43% |
| 4 | 39.0–56.4 | 69,489 | 68,949 | 0.99 | 528 | 80 | 480 | 2,880 | 4 goods, mean value 6 | 27,310 | 40% |
| 5 | 56.4–72.9 | 206,807 | 186,993 | 0.90 | 660 | 100 | 960 | 9,600 | 8 goods, mean value 10 | 86,635 | 46% |
| 6 | 72.9–89.3 | 555,299 | 599,514 | 1.08 | 792 | 120 | 1,920 | 33,600 | 16 goods, mean 25, via Ledger Posts (70%) | 192,065 | 32% |
| 7 | 89.3–98.2 | 353,882 | 396,631 | 1.12 | 792 | 120 | 1,920 | 42,000 | 20 goods, mean 25, via Ledger Posts | 0 | 0% |

Land takes 32–48% of modelled income in every land phase after the first. Phase 7 income pays the 250,000 Glint of Tidegate stage 5.

Known limit of this clock: the cap is per kind of item and the number of goods in rotation is a model input. A large late factory could keep about 30 goods above 2 units/min and earn several times the curve. That does not shorten the game, because every plot also needs Ballast (the material clock). If playtests show Glint is meaningless late, add one world-wide `market` saturation entry (x0.999 per unit sold, floor 0.2, +0.02/min).

---

## 5. Clock 3 — Rares (model output D)

Rules behind the supply (`DESIGN.md` 4.5, 8.2): gem nodes are 3% of spawns with no prerequisite; tidal shellbeds give 3% pearls; Burrows give 0.5% of output as the rare of the highest-tier node in radius; Drills give 1%; Trench floors drop one rare each.

Demand is expanded from recipes for everything built in the phase (Beacon, hook, weapon, machines).

| Phase | Current-tier rare | Demand | Supply per hour | Supply in phase | Ratio |
|---|---|---|---|---|---|
| 2 | `pearl` | 103 | 10.9 (manual gem nodes 7.6, mobs 1.5, shellbeds 1.8) | 146 | 1.41 |
| 3 | `magma_core` | 107 | 9.1 (manual 7.6, mobs 1.5) | 155 | 1.45 |
| 4 | `amber` | 178 | 14.9 (manual 7.6, mobs 1.5, 2 Burrow II 5.8) | 258 | 1.45 |
| 5 | `aurora_shard` | 527 | 42.7 (manual 7.6, mobs 1.5, 4 Burrow III 21.6, 4 Drills 12) | 705 | 1.34 |
| 6 | `echoglass` | 503 | 40.2 (manual 7.6, mobs 2.0, 4 Burrow III 21.6, 3 Drills 9) | 662 | 1.32 |

Older-tier rares, cumulative supply / cumulative demand at each phase end (asserted: supply >= demand for every rare). Older supply comes from machines left running in earlier biomes: one Burrow II on Emberreach (4.8 `magma_core`/h); two Burrow II and two Drills on Glasswaste (21.6 `amber`/h), plus the two Drills built in phase 7 placed on the Glasswaste vein (33.6/h); the Hoarfrost base at full uptime (67.2 `aurora_shard`/h).

| Phase end | `pearl` | `magma_core` | `amber` | `aurora_shard` | `echoglass` |
|---|---|---|---|---|---|
| 2 | 146 / 103 | | | | |
| 3 | 163 / 103 | 155 / 107 | | | |
| 4 | 163 / 103 | 239 / 137 | 259 / 178 | | |
| 5 | 163 / 103 | 318 / 137 | 616 / 338 | 705 / 527 | |
| 6 | 163 / 103 | 318 / 137 | 971 / 703 | 1,811 / 1,097 | 662 / 503 |
| 7 | 163 / 103 | 318 / 137 | 1,268 / 1,263 | 2,406 / 1,647 | 1,017 / 703 |

Amber is the tight one: the Tidegate needs 560 in phase 7, which is why the phase-7 Drills belong on the Glasswaste vein. The margin at the end is 5 units, so `DRILL_RARE` or the Tidegate lens count is the knob if playtests run short.

---

## 6. Clock 4 — XP

### 6.1 Level curve

```
xpToNext(L) = round5( 30 * L^1.9 )      L = 1..99      level cap 100      total 6,432,785 XP
```

| L | xpToNext | | L | xpToNext |
|---|---|---|---|---|
| 1 | 30 | | 30 | 19,215 |
| 5 | 640 | | 50 | 50,720 |
| 10 | 2,385 | | 75 | 109,580 |
| 20 | 8,895 | | 99 | 185,705 |

### 6.2 Required and supplied XP per phase (model output C)

Assumptions: 360 node breaks/h and 100 kills/h averaged over all play time; kill XP includes elites (x1.32) and the night bonus (x1.08); `xpMult` is capped at 2.5; lump = quests, bosses, Beacons, Tidegate stages (150,000 each).

| Phase | Levels | XP needed | Hours | Required/h | Node XP/h | Kill XP/h | Craft XP/h | Lump/h | `xpMult` | Supply/h | Ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1 -> 8 | 3,555 | 1.4 | 2,514 | 1,440 | 1,711 | 200 | 100 | 1.00 | 3,451 | 1.37 |
| 1 | 8 -> 18 | 38,060 | 7.2 | 5,308 | 1,440 | 1,711 | 600 | 900 | 1.10 | 5,026 | 0.95 |
| 2 | 18 -> 32 | 187,330 | 13.4 | 14,030 | 3,600 | 4,704 | 1,900 | 1,400 | 1.20 | 13,645 | 0.97 |
| 3 | 32 -> 46 | 436,180 | 17.1 | 25,568 | 6,480 | 8,839 | 3,600 | 4,800 | 1.30 | 29,394 | 1.15 |
| 4 | 46 -> 60 | 782,955 | 17.4 | 45,059 | 9,360 | 13,971 | 6,000 | 8,000 | 1.45 | 50,530 | 1.12 |
| 5 | 60 -> 74 | 1,224,545 | 16.5 | 74,130 | 13,680 | 19,388 | 9,500 | 12,500 | 1.60 | 80,609 | 1.09 |
| 6 | 74 -> 90 | 2,058,850 | 16.5 | 125,115 | 19,440 | 28,084 | 15,000 | 17,000 | 1.75 | 126,418 | 1.01 |
| 7 | 90 -> 100 | 1,701,310 | 8.8 | 192,302 | 19,440 | 28,084 | 20,000 | 75,000 | 1.75 | 193,168 | 1.00 |

Phase 0 runs fast on purpose. (Its kill XP is an overestimate before the first plot; node XP alone covers 57% of the need and the phase is 1.4 hours.) Phases 1–7 sit between 0.95 and 1.15.

Level checkpoints: level 10 (class) at about hour 3; level 20 (skill row 2) at about hour 10.5; level 26 (Spillway) at about hour 16; level 35 at about hour 25.5; level 50 (skill row 3) at about hour 44; level 60 (fourth ability) at hour 56; signature picks at levels 70, 80, 90 = about hours 68, 79, 89.

Mastery (`600 * m^2` per level): mastery 10 costs 231,000 XP (about hour 23 if the class was picked at level 10); mastery 20 costs 1,722,000 XP in total (about hour 60).

XP is the softest clock: a player two levels behind is weaker, not blocked. In co-op it cannot be farmed off friends (section 8).

---

## 7. Automation timeline

| Hour | First available | Chore removed | Unlock |
|---|---|---|---|
| 0.5 | Kiln | standing and waiting | level 2 |
| 3–9 | Drip Collector, Sap Tap, Creel, Hum Hive | 4 minor resources | level 9, H3, level 12, Beacon 1 |
| 14 | Scuttler Burrow I (6 units/min, tier <= 2) | T1–T2 gathering near it | skill F5 (level 20 at hour 10.5; `iron_plate` needs Saltfen ore) |
| 18 | Hopper, Spillway | emptying Burrows by hand | skill F3 + level 26 |
| 26 | Sluice I, Grabber Arm, Splitter | carrying across the base | skill F6 + Beacon 2 (hour 21.9); `flux_coil` needs Emberreach ore |
| 34 | Tide Wheel, Ember Boiler, Autobench I, Burrow II | hand-crafting T1–T3 parts | skills F7, F8 + Beacon 2 |
| 44 | Autobench II, Prism Array, Trawl Buoy, Sluice II, Bolt Turret | T4–T5 parts, fishing, raid defence | Beacon 3 (hour 39.0); `prism_circuit` needs amber |
| 50 | Tiller Bot | farming | skill H11 (level 50 at hour 44) + Beacon 3 |
| 60 | Burrow III, Lodestone Drill, Rime Turbine | T5–T6 gathering, ore | Beacon 4 (hour 56.4); `cryo_cell` at the Rime Bench (also Beacon 4) |
| 66 | Gull Roost, Sluice III | hauling between biomes | skill F9 + Beacon 4 |
| 76 | Ledger Post, Mint, Autobench III, Arc Spire | selling | skills G9, F12, C11 + Beacon 5 (hour 72.9) |
| 86 | Umbral Reactor, Echo Chamber | Flux ceiling, Vault re-runs | skill F12 + Beacon 5; 20–30 `hollow_core` each |

Longest gap between automation steps: 10 hours. Every unlock hour is after the Beacon it names.

Automated share of throughput by phase: 0%, 14%, 35%, 62%, 80%, 91%, 95%, 96%. The newest tier is always manual: Burrow I stops at tier 2, Burrow II at tier 4.

**Idle check.** Tending is refilled only by an *active* player (4 tiles of net movement within 10 s, or a successful action other than swinging or attacking), so a held key or weighted mouse button does not count. Parking for 8 hours at hour 60 (16,250 RU/h): 30 min at full rate (8,125 RU) + 7.5 h at 10% (12,190 RU) = 20,300 RU, which is 1.1 hours of active phase-5 play. With an empty `--persist` server the gain is zero.

---

## 8. Co-op scaling (model output E)

### 8.1 Rules

```
S          = profiles with >= 30 min of playtime in the last 10 hours of world playtime (1..8), recomputed hourly
coopScale  = 1 + 0.7 * (S - 1)
PARTY_RANGE = 24 tiles (all party effects, HP scaling and kill-credit checks)
```

| What | Scaling |
|---|---|
| Land cost, Ballast, world structures (Beacons, Waystones, Tidegate) | x `coopScale` |
| Machine cap per plot | x `coopScale` (rounded) |
| Node respawn interval | / `(1 + 0.6 * (S - 1))` |
| Enemy HP | x `1 + 0.6 * (n - 1)`, n = players within `PARTY_RANGE` at spawn |
| Boss and Keeper HP | x `1 + 0.8 * (n - 1)` |
| Node, craft, fish, harvest XP | only the player who did it |
| Kill XP | each contributor gets `xp * (1 + 0.6 * (n - 1)) / n` |
| Quest, boss first-kill, Beacon XP | full for everyone |
| Castaway lines, shrines, Archive wings, Trench floor 10 | done once per world; not multiplied |
| Loot from enemies and bosses | rolled per player |
| Market saturation | shared per world |

### 8.2 Projected time

The model scales each part of the critical path separately: gathering needs `coopScale` times the materials against manual throughput limited by node respawn (`1 + 0.6(S-1)`) and machine throughput scaled by the machine cap (`coopScale`); boss time scales with boss HP over party size; building is `coopScale` times the structures shared by S builders; required side content is done once and shared (divided by `S^0.7`, an assumption for imperfect splitting).

| Players S | coopScale | Gather h | Combat h | Build h | Side h | **Critical path h** | vs solo |
|---|---|---|---|---|---|---|---|
| 1 | 1.0 | 42.1 | 11.8 | 19.8 | 12.1 | **85.8** | 100% |
| 2 | 1.7 | 43.0 | 10.6 | 16.8 | 7.4 | **77.9** | 91% |
| 3 | 2.4 | 43.4 | 10.2 | 15.8 | 5.6 | **75.0** | 87% |
| 4 | 3.1 | 43.6 | 10.0 | 15.3 | 4.6 | **73.5** | 86% |
| 6 | 4.5 | 43.8 | 9.8 | 14.9 | 3.5 | **71.9** | 84% |
| 8 | 5.9 | 44.0 | 9.7 | 14.6 | 2.8 | **71.1** | 83% |

A party finishes the critical path 9–17% sooner than a solo player, not 2–8 times sooner. With the same optional content the full run is about 84–90 hours. The saving comes from sharing the once-per-world side content and the building work. If parity with solo is wanted, require castaway lines to be completed by `ceil(S/2)` players instead of once per world (not applied).

### 8.3 Edge cases

| Case | Rule |
|---|---|
| Friend joins for one evening | counted in S only while they have 30+ minutes inside the last 10 hours of world playtime; S drops again by itself. Changes are announced an hour ahead. Costs already paid are never re-charged |
| Late joiner | level 1 with Wake bonus (+100% XP while more than 5 levels below the party average) and a starter kit: hook and weapon two tiers below the party's best |
| Host tools | `/unbind <name>`, `/kick <name>`, `/spendcap <name> <glint>`; host = loopback connection or `--admin <token>` |

---

## 9. Tuning knobs

All in `shared/rules/constants.js`.

| Knob | Constant | Default | Effect of +10% |
|---|---|---|---|
| Ballast per plot | `BALLAST_PER_PLOT[biome]` | 10n / 90 / 160 / 200 / 380 / 1,000 | about +2.5 h on the critical path (strongest smooth lever) |
| Beacon and Tidegate cost multiplier | `GATE_COST_MULT` | 1.0 | about +1.4 h |
| Land growth | `LAND_GROWTH` | 1.08 | total land cost x2.0 (adjust in steps of 0.005) |
| Land base | `LAND_BASE` | 50 | all land +10% |
| Node respawn interval | `NODE_RESPAWN_S` | 6 | manual throughput -9% |
| Burrow rate multiplier | `SCUTTLER_RATE` | 1.0 | late gather hours -9% |
| Tending | `TEND_MINUTES`, `UNTENDED_SPEED` | 30, 0.1 | idle gain |
| Saturation | `SAT_DECAY` 0.99, `SAT_FLOOR` 0.05, `SAT_RECOVER_PER_MIN` 0.02 | | per-good income cap = `60 * recover / (1 - decay) * value` |
| Gem node share | `GEM_NODE_CHANCE` | 0.03 | rare supply |
| Burrow and Drill rare share | `BURROW_RARE` 0.005, `DRILL_RARE` 0.01 | | rare supply late |
| Fishing pity | `PITY_RARE_CASTS` 20, `PITY_LEGENDARY_CASTS` 60 | | worst-case Archive time |
| XP exponent and per-tier XP tables | `XP_EXP` 1.9 | | level cadence |
| Machine cap | `MACHINE_CAP` | 8 | factory ceiling |
| Party range | `PARTY_RANGE` | 24 | — |

---

## 10. How the builders verify this

1. `test/pacing.test.js` (WP14) runs the ported model and asserts exactly these bands (all ten pass in `docs/pacing-model.mjs` today):

| Assertion | Current value |
|---|---|
| land total = 317,910 | 317,910 |
| total XP = 6,432,785 | 6,432,785 |
| **critical path >= 85 h** | **85.79** |
| full model within 95–105 h | 98.19 |
| modelled income / curve within 0.8–1.3 in phases 1–7 | 0.90–1.12 |
| XP supply / required within 0.85–1.25 in phases 1–7 | 0.95–1.15 |
| current-tier rare supply / demand within 0.9–1.5 in phases 2–6 | 1.32–1.45 |
| co-op critical path within 70–95 h for S = 2..8 | 71.1–77.9 |
| efficient player (`AUTO` x1.25, `BUILD` x0.8) critical path >= 75 h | 75.98 |
| cumulative supply of every rare >= cumulative demand at each phase end | holds (tightest: amber 1,268 / 1,263) |

   The test must build its RU figures by expanding the real `shared/data` recipes (not copied constants), so a recipe change that breaks pacing fails the build.

2. `test/bot/pacing-bot.js` (WP14): a headless scripted player on the real server simulation at accelerated tick rate, following the gate chain with a greedy policy. Combat is resolved with the stat-based shortcut `BOT_AUTOBATTLE`. Assertions: no Beacon is reached **earlier than 85%** of 8.6 / 21.9 / 39.0 / 56.4 / 72.9 / 89.3 hours; the first plot is raised before minute 30; and an idle scenario (**the bot holds primary fire for 8 hours next to its largest machine cluster** at hour 60) gains less than 1.5 hours of active play.

3. Pacing telemetry: every save records the playtime at each gate (`DESIGN.md` A.9), so each human playtest yields real numbers to compare with section 2. These are the acceptance test.

## 11. Summary

| Check | Result |
|---|---|
| Critical path (solo) | **85.8 h** (efficient player: 76.0 h) |
| Full model (solo) | **98.2 h** (phases 1.4 + 7.2 + 13.4 + 17.1 + 17.4 + 16.5 + 16.5 + 8.9) |
| Land | 80 plots, 317,910 Glint, all required; 32–48% of capped income |
| Rares | current-tier supply / demand 1.32–1.45; every rare covered cumulatively |
| XP | level 90 at hour 89, level 100 at hour 98 |
| First plot | about minute 20 |
| Idle | 8 h parked = about 1.1 h of play |
| Co-op critical path | 71.1–77.9 h for 2–8 players |
| Post-game | Rebirth runs about 45–55 h each; Trench endless |
