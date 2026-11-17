# TIDEBOUND — Design Critique

Reviewed: `DESIGN.md` v1.0, `PACING.md`, `TECH_SPEC.md`. All numbers below were recomputed with a script from the formulas and recipe tables in those documents; anything marked "estimate" is my own projection, not a measurement.

## Verdict: FAIL as written (fixable in the documents, no redesign needed)

| Requirement | Result | Why |
|---|---|---|
| 1. 100 hours | **FAIL** | The arithmetic sums are correct, but the 100 h is a budget, not a floor. The critical path is about 55–65 h using PACING's own rates (B3), idle automation removes most of the rest (B4), the Glint clock stops binding around hour 40 (B5), and one unmodelled resource (rares) can stall phase 4 in the opposite direction (B6). |
| 2. Multiplayer from the start | PASS WITH FIXES | Architecture is right. Co-op XP rule breaks the level curve (B7); realm-change message and entity-patch path are missing (B9, B10). |
| 3. Systems, classes, cards, automation | PASS WITH FIXES | Breadth is there. One hard softlock in the tier-5 chain (B1) and an item duplication loop (B2). |
| 4. Particles, code-made assets | PASS WITH FIXES | 86 rows / 89 names. 16 of 24 abilities and all boss patterns have no preset (I7). |
| 5. Production quality | Not yet | Depends on B1–B14. |
| 6. Originality | PASS WITH FIXES | No copied names found except a handful of near-matches (I12). |
| 7. Buildability | **FAIL** | Wave-1 packages share vocabularies that no document defines (B8), about ten cross-package calls have no interface (B11), and several files/features have two owners or none (B12–B14). |

Re-review after the 14 blocking items are applied to the three documents.

---

## 0. Recomputed numbers

| Check | PACING claims | Recomputed | Status |
|---|---|---|---|
| Land total, n = 1..80, `round5(50 * 1.08^n)` | 317,910 | 317,910 | matches |
| Land per biome | 585 / 2,710 / 8,605 / 27,310 / 86,635 / 192,065 | same | matches |
| Land actually required (12/15 attunement in tiers 2–5 = 68 purchases) | not stated | **125,845** (40% of the claim) | see B3 |
| XP 1 -> 100, `round5(30 * L^1.9)` | 6,432,785 | 6,432,785 | matches |
| XP per phase | 3,555 … 1,701,310 | same | matches |
| Income per phase, `150 * 1.07^h` | 321 … 945,807, total 1,921,520 | same | matches |
| Hour at which cumulative designed income alone pays for all 80 plots | not stated | **73.5** | land is 17% of income |
| Phase hours (section 4.5) | 100.0 | 100.01 | matches, but 58 of the 100 hours are asserted columns, not derived |
| Co-op `100 * coopScale / S^0.9` | 89–91 | 89.0–91.1 | matches; the `S^0.9` exponent is an assumption with no derivation |
| Beacon 5 material, expanded from recipes | 15,000 RU ("Gates" column) | **7,620 RU** | PACING overstates x2 |
| Beacon 6 material | 32,000 RU | **19,085 RU** | PACING overstates x1.7 |
| Tidegate, all 5 stages | 120,000 RU | **144,020 RU** (64,100 of it fuel units) | PACING understates |
| Card split | 32/26/18/12/8 | 32/26/18/12/8 | matches |
| Cards per tag | — | Tide 14, Storm 13, Bloom 13, Fortune 12, Fang 12, Gear 11, Ember 11, Frost 10 | uneven, see I5 |
| Skill points | 120 = 60 nodes | 5 x (4x1 + 4x2 + 4x3) = 120; sources 99+6+6+8+1 = 120 | matches |
| FX presets | 86 | 86 table rows, **89 names** (rows 56, 59, 60 hold two each) | see I7 |
| Mastery XP to level 10 / 20, `2000 * m^2` | — | 770,000 / **5,740,000** (89% of all XP in a run) | see I6 |
| Main-chain Glint rewards | "10–15% of income" | 281,880 (89% of all land cost; 2.2x the 68-plot land cost) | see B5 |

---

## 1. Blocking issues

### B1. Hard softlock: `cryo_cell` needs a bench that is unlocked by a Beacon that costs `cryo_cell`
`cryo_cell` is crafted at Workbench III (DESIGN 6.3). `workbench_3` unlocks at **Beacon 5** (7.1). Beacon 5 costs 100 `cryo_cell` (7.3) and Warden 5's Lure costs 10 `cryo_cell` (12.2). The game cannot pass hour 72. The same row breaks the automation ladder: Drill, Burrow III, Gull Roost, Rime Turbine and Ledger Post all cost `cryo_cell` and are scheduled at hours 60–75.

**Fix (exact):** DESIGN 7.1, `workbench_3` unlock: change "Beacon 5" to "Beacon 4". Keep its cost (40 `rimesteel_bar`, 10 `prism_circuit`); `rimesteel_bar` is already available because `kiln_3` unlocks at Beacon 4. Add to WP2 tests: "for every gate k, every transitive ingredient and station is obtainable using only unlocks from gates < k" (the existing "reachable from raw nodes" test does not check unlock order).

Related contradictions to fix in the same pass (each one is a builder guessing otherwise):

| Structure | DESIGN 8 gate text | PACING 6 hour | Conflict | Set unlock to |
|---|---|---|---|---|
| Burrow II | "Beacon 3" (stage 5), F5 says "II and III unlock by Beacon" (which?) | 34 | Beacon 3 is hour 38 | `beacon:2` + `skill:F5` |
| Autobench II, Prism Array, Trawl Buoy, Bolt Turret | "Beacon 4" | 48 | Beacon 4 is hour 55 | `beacon:3` (+ `skill:F8` / `skill:C7`) |
| Burrow III, Drill, Tiller Bot, Gull Roost, Rime Turbine | "Beacon 5" | 60 | Beacon 5 is hour 72 | `beacon:4` (+ F9/F11/H11) |
| Fish Trap | stage 2, "hours 3–9" | — | needs H8 = row 2 = level 20 = hour 10.5 | move H8's unlock to H4 (row 1), or change the stage-2 text |

The schema's `unlock` field is a single string; these need two conditions. Change it to an array, all required: `unlock:['beacon:2','skill:F5']`.

### B2. Infinite material duplication through build/deconstruct
Deconstruct refunds 75%, or **100% with F4**. F4 itself also gives -8% cost; `c27` gives up to -10%; Gearwright passive -10%. Place a Rime Crucible at 72–92% cost, remove it for 100% of list cost, repeat: +8% to +28% free materials per cycle on any structure, including ones that cost `void_core`.

**Fix (exact):** DESIGN 7: "Each structure stores the items actually paid (`data.paid`). Deconstruct refunds `floor(paid * 0.75)` per item, or `paid` exactly with F4. World structures (W) cannot be deconstructed." Add a WP4 test: place + remove with every discount active never increases any item count. Also state the stacking rule once: "structure-cost discounts are additive and capped at 25%; they do not apply to world structures or Tidegate deliveries" (otherwise a 10-minute class swap to Gearwright makes every Beacon 10% cheaper).

### B3. The critical path is about 55–65 hours, not 100
PACING 4.4/4.5 reach 100 h only by counting things a player is not forced to do. Using PACING's own rates and removing only the optional columns:

| Item | PACING hours | Forced hours (estimate) | What was removed |
|---|---|---|---|
| Gather and craft | 42.0 | 20.7 | "Sold for Glint" (94,150 RU) and "base building, food, tempering, waste" (100,550 RU): 37% of all RU. Remaining RU per phase / PACING throughput = 0.50 + 1.57 + 2.06 + 3.13 + 3.54 + 3.38 + 3.53 + 2.98 |
| Combat | 23.9 | about 11.5 | Vault repeat clears (6.0), most Trench runs (2.6 of 3.3), half of overworld combat |
| Building and logistics | 19.8 | 19.8 | nothing |
| Side systems | 14.3 | about 1 | shrines, all 27 castaway steps, contracts, Archive, most fishing and farming: none of it gates anything except 5 T2 fish (Lure 2) and 20 `moonpetal` |
| **Total** | **100.0** | **about 53; 55–65 with slack** | |

Two more shortcuts on top:
- **Attunement is 12/15, so only 68 plots are ever needed**, and the 12 skipped are the most expensive of each biome's band. Required land spend is 125,845 Glint, not 317,910.
- Beacon 5 and 6 recipes are half of what PACING's own "Gates" column budgets (table in section 0).

**Fix (exact):**
1. DESIGN 4.3: "Beacon k requires **all** plots of biome k." Delete "12 of 15".
2. DESIGN 7.3, add a column "Also requires" to every Beacon: "1 castaway quest line of biome k completed and 1 shrine of biome k solved (Greenmarrow: Ferrin's line and its shrine)". This moves about 8–10 h of side content onto the critical path.
3. Raise Beacon costs to match PACING's Gates column: `beacon_5` = 1,600 `rimesteel_bar`, 200 `cryo_cell`, 600 `everice`, 40 `aurora_shard`; `beacon_6` = 2,000 `umbral_alloy`, 200 `void_core`, 700 `voidsilt`, 40 `echoglass`.
4. PACING 4.4: split every row into `requiredRU` and `optionalRU`. `test/pacing.test.js` must assert **two** bands: full model 95–105 h **and** critical path (required RU + first clears + Wardens + building only) >= 85 h. The pacing bot already plays the critical path; change its target from "within 15% of 9/22/38/55/72/90" to "not earlier than 85% of those hours".

### B4. Idle automation collapses the material clock
Nothing stops machines from running while nobody plays. DESIGN 22 offers `--persist` (world runs with zero players); even without it, a player parked next to a Tide Lamp (no spawns within 6 tiles; raids only disable machines for 60 s, never destroy) accrues output indefinitely. At phase 6 rates one night (8 h x 27,000 RU/h = 216,000 RU) exceeds the whole phase budget of 190,000 RU. From Burrow II onward (hour 34) the fastest way to play is not to. Ledger Posts and the Mint do the same for Glint.

**Fix (exact):** add to DESIGN 8: "**Tending.** Every automation structure has a `tend` meter, 0–30 min. It drains in real time while the machine works and refills to full when any player performs an input action within 12 tiles of it (walking past counts). At 0 the machine runs at 10% speed. Generators, Ledger Posts and the Mint follow the same rule. With `--persist` and zero connected players, machines, crops and market recovery are paused; only the clock runs." Add constant `TEND_MINUTES = 30`, `UNTENDED_SPEED = 0.1`. The pacing bot must run one scenario that idles 8 h at hour 60 and assert the gain is under 1 h of active play.

### B5. The Glint clock stops binding around hour 40; saturation is a flat tax, not a cap
- Saturation floor is 0.4 and recovery is +0.1/min, so the steady state for unlimited dumping is 0.4–0.5 (simulated: selling 60 or 200 units/min both settle at 0.50). There is no cap, only a 50% tax.
- One Ledger Post selling **one** raw T6 item: `60/min * 32 * 0.8 * 0.5` = 46,000 Glint/h. PACING's whole phase-6 target is 38,255 Glint/h. Eight Burrow IIIs feed five posts: about 220,000 Glint/h.
- The Mint pays 100% value with no saturation: 30 `umbral_alloy`/min = 252,000 Glint/h per Mint.
- Before Ledger Posts, one 999-stack of T5 raw sells for about 6,400–8,000 Glint; Hoarfrost's entire land band (86,635) is about one hour of phase-5 factory output.
- Main-chain quest Glint alone is 281,880.
- Reroll tokens can be bought for `50 * level` Glint. With Glint this cheap, every draft can be rerolled until the wanted card appears; the randomised system becomes a shop.

Result: from phase 4 on, land is bought as fast as plots unlock, and PACING's "28–47% of income goes to land" does not hold.

**Fix (exact):**
1. DESIGN 15: saturation per unit `x0.99`, floor `0.05`, recovery `+0.02` per real minute. G8 changes recovery to `+0.04`, not "halved saturation".
2. Mint: "pays 60% of value and uses one shared saturation entry `mint`".
3. Ledger Post: 20 items/min, 70%.
4. Main-chain Glint rewards: cap each at 25% of the next plot's cost at that point (q20: 60,000 -> 2,500; q22: 150,000 -> 6,000).
5. Rerolls: Glint price is `50 * level * 2^(rerolls already bought in this draft)`.
6. Castaway shops selling "raw materials of the previous tier at 3x value" need a stock number: 40 units per item per in-game day; otherwise surplus Glint converts straight into Tidegate materials.
7. `pacing.test.js` must compute income from the source table (drops, caches, saturated selling of the modelled surplus, quests), not from `150 * 1.07^h`, and assert it stays within 0.8–1.3x of the curve per phase.

### B6. Rare materials are an unmodelled fourth clock, and several rates behind it are undefined
PACING counts a rare as one RU. Expanded from recipes, rare demand is:

| Rare | Where it is needed | Units |
|---|---|---|
| `amber` | Beacon 4 (55), Autobench II (10), each Prism Array (5), Lure 4 (5), hook/weapons (about 5) | about 85–100 in phase 4, before any Drill exists |
| `amber` + `aurora_shard` | phase-5 base of 4 Burrow III + 4 Drills | 140 + 120 |
| `aurora_shard` | Beacon 5 (120), Lure 5 (10 per attempt) | 130+ |
| `echoglass` | Beacon 6 (145), Autobench III + Reactor + Echo Chamber (65), Tidegate 5 (200) | about 410 |
| Tidegate, all stages | `amber` 450, `aurora_shard` 450, `echoglass` 200 | |

Supply: `gem_node` is "1% of spawns (needs skill/ability/luck)" — the parenthesis is undefined. At 360 breaks/h that is 3.6 rares/h; mob drops add about 1/h; a Drill gives 3% of 10/min = 18/h but does not exist before phase 5. Phase 4 therefore needs about 100 `amber` from about 4.8/h = **21 hours for a 17-hour phase**, or about 80 hours if gem nodes really do need a skill. This pushes the game long while B3–B5 push it short; neither is in the model.

Also undefined and needed by the same calculation: tidal node spawn rate (`tide_shellbed` is the main `pearl` source), whether Scuttlers harvest gem nodes, whether a Drill can sit in Umbral (Umbral has no `vein` plot; "over an ore node tile" conflicts with "no spawn within 1 tile of a structure"), Trench rare quantities, `moonpetal` seed drop rate.

**Fix (exact):**
1. `gem_node`: "3% of spawns in every biome, no prerequisite. Prospector passive makes it 6%."
2. Tidal nodes: "during low tide each owned plot with a tidal ring spawns 1 tidal node per 10 s, cap 8."
3. Scuttlers harvest gem nodes of a tier they can harvest.
4. Give Umbral one `vein` plot (change its `wild` count from 5 to 4) and delete "or over an ore node tile".
5. Trench: "each floor cleared drops 1 rare of tier `min(party tier, 3 + floor(floor/8))`", so floors 1–7 at hour 80 do not pay out `echoglass`.
6. `moonpetal`: "Trench floor 10, 20, 30… each drop 5 `seed_moonpetal`; harvest returns the seed 50%." State that Trench floor 10 is a required gate and add it to PACING section 1. In co-op the 20 `moonpetal` is not multiplied by `coopScale`.
7. Add a rares table to PACING (demand vs supply per phase) and assert supply/demand within 0.9–1.5 in `pacing.test.js`.

### B7. Co-op XP rule multiplies levelling by party size
DESIGN 5.2: full XP "to every player within 20 tiles who contributed or is in party range". Node HP does not scale with players, so four players gathering together each receive four players' node XP. Kills: group kill rate is `S / (1 + 0.6(S-1))` = 1.43x at S = 4, and everyone gets full credit. PACING 7.2's statement that "each player's level follows the solo curve" is false for any party that stays together: estimate level 100 near hour 50 for S = 4, then no drafts or skill points for the remaining 40 hours. It also pays for standing still next to a working friend.

**Fix (exact):** "Node, craft, fish and harvest XP go only to the player who did it. Kill XP: each player who dealt damage gets `xp * (1 + 0.6(n-1)) / n` (n = contributors), which equals solo XP per unit of enemy HP. Quest, boss first-kill and Beacon XP stay full for all." Also reconcile the three radii (20 tiles XP, 30 tiles HP scaling, 8–10 tiles auras) into one constant `PARTY_RANGE = 24`.

### B8. Wave-1 packages share vocabularies that are defined nowhere
WP2 writes the data; WP4–WP11 write the code that interprets it; all run in parallel against "6 items, 3 recipes, 3 structures, 1 enemy, 3 cards, 2 skills, 1 class" of sample data. The following string sets appear in schemas only as one example each, so two builders will invent two different sets:

| Vocabulary | Written by | Read by | Defined? |
|---|---|---|---|
| Stat ids for `mods` (DESIGN 5.1 lists 21; cards need about 40 more: wood/stone/ore/plant/tidal yield, kiln speed, sell price, ability damage, burn damage, fish bite, crop growth, mob-drop quantity, structure cost, land discount, machine speed…) | WP2 | WP1 statbook, WP4–WP9 | no |
| `proc.id` and `proc.on` values (cards, trinkets, boons, set bonuses) | WP2 | WP6 `procs.js`, WP10 boons | no (examples: `burn`, `spark`, `chain`) |
| Enemy `ai` archetypes and `aiParams` keys | WP2 | WP5 `game/ai/*.js` | no (one example: `guarded_melee`) |
| Status ids, buff ids, elite affix effects | WP5 / WP6 | WP2, WP6, WP10 | names only |
| `machine.type` values and per-type params | WP2 | WP8 | one example |
| Ability `params` keys, boss `script` names, dungeon `mechanic` names | WP2 | WP6, WP5, WP10 | no |
| World-level and machine-level modifiers ("all world machines +25%", Archive wings, Tidegate buffs) | WP2 | WP8 | `statbook.of(player)` is per-player only; no world sheet exists |

**Fix (exact):**
1. Change the build order: `Wave 0: WP1 -> Wave 0.5: WP2 -> Wave 1: WP3..WP13 -> Wave 2: WP14`. WP2 is pure data and blocks everyone's real tests.
2. Add TECH_SPEC section "7.1 Registries" with the complete lists (stat ids with op and cap, proc ids with param keys, proc triggers, AI archetypes with param keys, status ids, machine types with param keys). WP1 ships them in `shared/data/schema.js` as enums; `data.test.js` rejects unknown values.
3. Add `game.stats.world()` (world sheet, sources registered with `addWorldSource(name, fn)`) and state that `machineSpeed` multiplies world sheet x Flux ratio x proximity sources.
4. State the stacking rule: "all percentage bonuses to the same stat are `add` and sum into one bucket; `mul` is reserved for class passives, set bonuses and Moon Chart." Then cap: `yieldMult <= 3.0`, machine speed `<= 3.0`, `xpMult <= 2.5`. Without this, same-stat yield sources multiply to about 4.2x for wood (c17 1.40, c30 1.20, Bloom-3 1.10, H3 1.15, Prospector 1.10, `hook_7` 1.25, Archive 1.10, H10 1.12, G11 1.18) before Motherlode, against PACING's whole-run allowance of 2.9x including gather power; machine speed sources multiply to about 3.2x and, with Gear-9 and `m06`, 5 Scuttlers instead of 3 (x5.3 total).

### B9. No message tells the client it changed realm
`movePlayer(player, realmId, x, y)` exists, but section 6.2 has no server-to-client message for entering a Vault, the Trench or the Moon arena; `welcome` is the only message carrying `realm {id, w, h, kind}`. Dungeons, the Trench and the finale cannot be entered.

**Fix (exact):** add to 6.2: `realm` | `id, w, h, kind, x, y, tick` | "sent by `movePlayer`; client drops all entities and chunks, resets prediction and interpolation, then receives `chunk` and `snap.add` for the new realm". Also add `kicked` | `reason`.

### B10. Entities cannot change any public field after they are added
`upd` is `[i, x, y, f, s]` plus optional `hp`. Every type-specific key in 6.5 (player `g`, `a`, `at`, `cl`, `lv`; mob `st`, `tg`; boss `ph`; structure `p`, `on`, `it`; crop `st`, `w`; npc `q`; zone `t`) is only ever sent in `add`. Progress bars, telegraphs, gear changes, crop stages and status icons would never update.

**Fix (exact):** `upd` entry = `[i, x, y, f, s, hp, patch?]` where `patch` is an object of changed public keys (same short names as 6.5), `hp` is `null` when unchanged. `entities.js` tracks a dirty-key set per entity; `snapshot.js` clears it per client after sending. Also define sluice contents explicitly: "sluice items are not entities; a sluice tile's `it` key changes only when the item on it changes; the client animates movement locally", otherwise a Tidegate-scale factory breaks the 6 KB per tick budget.

### B11. Cross-package calls with no interface
Each of these is required by a DESIGN feature and crosses a package boundary, but has no service, event or action in TECH_SPEC:

| Needed by | Needs from | Missing interface | Add to 5.5 |
|---|---|---|---|
| WP8 Scuttlers, WP6 Seismic Strike / Blast Charge / Echo Swing / Living Hook / bombs, WP7 storm lightning | WP4 gathering | break or damage a node on someone's behalf | `hitNode(node, dmg, {player?, byMachine?, yieldMult?})` -> broken (WP4) |
| WP8 Grabbers, Gulls, WP11 Tidegate deliveries | WP4 stations | `containerOf` returns one inventory; stations have input/fuel/output | `insertInto(structure, item, qty)` -> accepted; `extractFrom(structure, filter)` -> `{item, qty}` or null; any system may register an `io:<kind>` provider (WP4 for stations and storage, WP8 for machines, WP11 for `gate_site`) |
| WP4 building | WP8 machines | "machine cap check hook" | `canPlace(kind, tx, ty, player)` -> `{ok, err}`; building calls every registered validator |
| WP8 Tiller Bot | WP9 farming | "tiller bot logic hook" | `farmTend(tx, ty, r, seedItem)` (WP9) |
| WP8 Fish Trap, Trawl Buoy | WP9 fishing | fish table roll | `rollFish(biome, {commonOnly})` (WP9) |
| WP6 Quickgrow, Verdant Tide | WP9 farming, WP7 nodes | advance crops, respawn nodes | `growCrops(x, y, r, stages)` (WP9); `respawnNodes(x, y, r)` (WP7) |
| WP8 Echo Chamber | WP10 | Vault loot roll | `rollVaultLoot(k)` (WP10) |
| WP5 raids | WP8 | disable a machine 60 s; find "most valuable machine cluster" | `disableMachine(structure, seconds)`, `machineClusters()` (WP8) |
| WP6 consumables (Lure `item.use`) | WP5 bosses, WP7 arena feature | Warden summon has no owner | action `boss.summon {lure}` owned by WP5; WP7 exposes `featureAt(x, y)` |
| Router `use` action | everyone | `interact:<kind>` is mentioned in 6.3 but not in the service table | list it in 5.5 with the owner per kind (station WP4, market WP9, npc WP11, vault entrance WP10, waystone and tidestone WP7, calling shrine WP6, arena WP5) |
| WP6 `hasUnlock(unlockId)` | — | `level:N` is per-player but the signature has no player | `hasUnlock(unlockId, player?)` |
| WP13 Treasury veto | WP7 `spendGlint` | veto is a 5-second asynchronous window; `spendGlint` returns a synchronous bool to WP6, WP7, WP9 callers | delete the veto. Replace with: "non-land spends above the threshold are logged to chat; host can set a per-player spend cap" |
| Per-player persistence | WP1 | `save()/load()` are world-level only; `profiles.*.cards/skills/quests` have no writer | `saveProfile(player)` / `loadProfile(player, data)` optional methods on every system; stored under `profiles[token].sys[name]` |
| Structure state | WP1 | save shows `"state": {}` with no rule | "`entity.data` of structures must be JSON-serialisable and is saved and restored verbatim by WP1" |

### B12. Kiln model contradicts its own recipes
`kiln`: "1 input slot, 1 fuel slot" (DESIGN 7.1; schema `station:{slots:1}`). `cindersteel_bar`, `prism_alloy`, `rimesteel_bar`, `umbral_alloy`, `glass` and the clay `brick` all need two different inputs plus fuel. WP4 and WP8 cannot both guess the same answer, and "a Grabber feeding a Kiln automates smelting" depends on it. Related ambiguities in the same table: is the listed time the base time or the time at that Kiln tier (umbral alloys for Beacon 6 + Tidegate: 4,340 bars = 28.9 kiln-hours at 24 s, 7.2 at 6 s); does the fieldstone `brick` variant need fuel; does `charcoal` need fuel.

**Fix (exact):** "Kilns have 3 input slots, 1 fuel slot, 1 output slot. A Kiln runs the first recipe (in data order) whose inputs are all present; `station.queue` pins a recipe instead. Fuel is a meter filled from the fuel slot. Listed times are base times; Kiln II divides by 2, Kiln III by 4. Every Kiln recipe lists its fuel explicitly: fieldstone brick 1, charcoal 0." Schema: `station:{ inSlots:3, fuel:true, outSlots:1, queue:20, speed:1 }`.

### B13. Burrow rates exceed what plots can spawn; two packages' tests cannot both pass
A plot spawns 1 node per 6 s = 10 nodes/min = about 23 units/min. Burrow III is specified at 36 units/min inside a radius-8 area (72% of one plot), so it can physically harvest about 17 units/min. PACING phase 6 counts 8 Burrow III at full rate (17,280 RU/h); Umbral's 12 plots spawn at most 16,560 RU/h in total, before manual gathering and before structures block spawn tiles. WP8's test ("Burrow harvest rate within 5% of DESIGN rates over 10 simulated minutes") fails against WP7's real respawn.

**Fix (exact):** make Burrows producers with a local node requirement instead of node consumers: "A Burrow produces its rate while at least `workers * 4` harvestable nodes stand in its radius; it does not remove nodes. Below that count its rate scales linearly. Output is a weighted roll of the drops of the nodes in radius." Define the rate as per Burrow (not per Scuttler) and "+1 Scuttler" as +33% / +50% rate. Then PACING 4.3 holds and the WP8 test is deterministic.

### B14. Files and features with two owners or none

| Item | Problem | Fix |
|---|---|---|
| Beacons | Placed by WP4 building, gated by WP7 land (attunement), trophy from WP5, emits `beacon.lit`, unlocks via WP6 `hasUnlock`. No system owns them | `systems/land.js` (WP7) owns Beacon validation (through `canPlace`), lighting, `beacon.lit` and `world.beacons` |
| `shared/data/deeds.js` | DESIGN 17.2 says WP11 defines it; TECH_SPEC gives the file to WP2 | WP2 owns it; DESIGN must list all 60 Deeds |
| Wake bonus | In WP6 `progression.js` description and in WP13's tests | WP6 owns it; WP13 only exposes `partyAverageLevel()` |
| Shop stock | `market.js` (WP9: "castaway shop transactions") and `npcs.js` (WP11: "shop stock") | WP9 owns stock and transactions; WP11 only opens the panel |
| Treasury | services listed as "WP7 (treasury)", no system file | name it: `systems/land.js` registers `addGlint` / `spendGlint` |
| Drawers | dispatch is by `type` (`types:['mob']`), but `structure.js` (WP1) and `machine.js`, `sluice.js` (WP8) all draw type `structure`; `scuttler.js` and `gull.js` both draw type `helper`. No drawer exists for `zone` or `chest` | dispatch by `kind` first, then `type`. Add `drawers/zone.js` (WP5) and `drawers/chest.js` (WP4) |
| Wildcard files (`game/ai/*.js`, `game/bosses/*.js`, `game/abilities/*.js`, `dungeon/rooms-*.js`, `keepers/*.js`) | rule 1 says WP1 stubs every file; rule 5 freezes registries; ES modules cannot glob | "these folders are loaded at startup with `fs.readdir` + dynamic `import()`; each file default-exports `{ id, ... }`. WP1 ships the loader" |
| Soil | a structure (`soil`, DESIGN 7.2, with a cost), a tile id (10), and an action (`farm.till`) | soil is a tile only; delete the structure row; `farm.till` costs 1 `fieldstone` |
| Host | `coop.kick`, `/unbind`, "host can kick" — no definition of who the host is | "host = any connection from a loopback address, plus the token in `--admin <token>`" |
| Content that DESIGN counts but does not define | 12 shrine/Trench trinkets, 16 of 20 boons, 6 elite affix effects, 6 Keeper move sets, 12 relics, 5 "cooked dishes" for the Archive, `pack_1..5` / `rod_2..4` / `lantern_1..2` recipes, `vault_key_k` station, all seed items | add the tables to DESIGN before WP2 starts; otherwise WP2, WP5, WP10 and WP3 each invent them |

---

## 2. Important issues (fix soon)

**I1. Dead zones.** No new active ability after level 50 (hour 43) — 57 hours. Automation gaps: hours 14–26 and 60–75. Fix: move ability 4 to level 60; add one "signature upgrade" pick per ability at levels 70/80/90; move Hopper + Splitter to hour 20 (skill F3) so the 14–26 gap has a logistics step.

**I2. Mob spawning floods the base and the server.** "Each owned non-start plot rolls a spawn if a player is within 2 plots" = up to 25 plots x (2 + tier) = 200 live T6 mobs around one player, inside the factory, and far above the 120 kills/h XP assumption (a fighter can take about 600 kills/h, 2–3x the required XP rate). Fix: spawn only on the player's plot and its 4 neighbours; global cap `6 + 4 * tier` per player; no spawns on plots with a lit Beacon or 4+ Tide Lamps.

**I3. Bound-player rule punishes a guest evening.** A friend who plays 31 minutes raises every future cost by 70% forever unless the host knows `/unbind`. Fix: `S` = profiles with >= 30 min playtime in the last 10 hours of world playtime, recomputed hourly; show the pending change before it applies.

**I4. Warden 5 DPS check.** T6 weapons need Anvil III (Beacon 5), so Warden 5 (160,000 HP, 6 min enrage) is fought with tier-5 weapons: 85 x 2.0/s x about 2.5 = 425–500 DPS = 320–376 s. That is at the enrage line for a solo Blade user and over it for Bow. Fix: 120,000 HP, or enrage 8 min for Wardens 4–6.

**I5. Card sets.** 9-set needs 9 distinct cards of a tag; Frost has 10 in total including its Epic and Mythic, Gear and Ember 11. Fix: 12 cards per tag (move two Tide and one Storm/Bloom card), thresholds 3/5/7.

**I6. Mastery.** `2000 * m^2` sums to 5.74M XP for level 20 — 89% of a run — so ability 3–4 upgrades arrive at the credits and a second class never matures. Fix: `600 * m^2` (1.72M total; mastery 20 near hour 62), mastery 10 near hour 28.

**I7. Particle coverage.** 16 of 24 abilities (Breakwater, Rally Horn, Unmoored, Crosscurrent, Riptide Mark, Tempest, Brine Bolt, Kingwave has `tide_wave` only, Pocket Turret, Magnet Coil, Clockwork Legion, Vein Sense, Blast Charge, Thornlash, Quickgrow, Sproutling) fall back to the generic puff; Wardens and Keepers share one `boss_telegraph`. Add about 30 presets (one per ability, one signature per boss, raid horn, Tidebreak wave, card-set proc, tempering success/fail, Mint coin, Gull trail). State the count as names, not rows (89 today), so the WP12 test is unambiguous.

**I8. Vault and arena may be among the unbought plots / hidden.** With B3 fixed (15/15) this goes away; otherwise guarantee `vault` and `arena` are within the first 8 plots of each biome by adjacency order, and show them on the map without skill T3.

**I9. Tide Board and Archive XP scale with the level bar.** 96 donations x 2% (4% with G6) can be hoarded and dumped at level 95+ for about 3.8 levels. Fix: donation XP = `50 * itemTier^2`, fixed.

**I10. WP1 and WP6 are too large for one agent each.** WP1 is the whole engine, client and about 250 stubs; WP6 is 96 cards, procs, 60 skills, 24 abilities, gear, tempering and consumables. Split: WP1a server + shared, WP1b client (same protocol file, written first by WP1a); WP6a progression/cards/procs/skills, WP6b classes/abilities/gear/consumables.

**I11. Smaller spec gaps.** Per-player recipe knowledge has no `self` key; "world select" on the title screen conflicts with one world per process; land-discount stacking is undefined for a solo player with G5 + G12 + `e07` + Quill (state: additive, cap 20%); elite XP x5 and night +25% are left out of the XP supply table that then reports 0.87; fuel is 45% of Tidegate RU and has no automation note (state that Kiln fuel slots accept Grabbers and that `brimstone` Burrows are the intended source); tier-3 "fiber" is `brimstone`, so T3 armor and `cloth` are made from sulphur — pick a real fiber (`ashgrass`).

**I12. Originality — near-matches to rename.**

| Tidebound | Too close to | Suggested |
|---|---|---|
| `fish_trap` "Fish Trap" | same name as a Forager structure | "Creel" |
| "Brinevault" / `vault_chest` (shared storage) | Forager's storage building is the "Vault" | "Brinelocker" / `brine_locker` |
| `void_core`, `voidsilt`, `voidling`, `void` element, "Void Crown" | Forager's Void realm and void-named materials | "hollow" / "null": `hollow_core`, `nullsilt`, `hollowling` |
| "Drowned Husk" | two Minecraft mob names joined | "Brine Shambler" |
| "Echo Knight" | a published D&D subclass name | "Refrain Knight" |
| "Hushwing" | an existing trading-card creature name | "Stillwing" |
| "Tidecaller" class | used by several existing games for a character/unit | "Brinesinger" |
| "boon" (run-only dungeon upgrades) | strongly associated with one roguelike | "current" or "blessing" |
| Biome set meadow / desert / snow / fire | same four archetypes as Forager's grass / desert / winter / fire | keep Saltfen and Umbral prominent; give Glasswaste and Hoarfrost non-archetypal landmarks in the art brief (fused-glass forests, aurora ice shelves) |

I could not verify whether the title "Tidebound" is already used by a released game; run a store and trademark search before publishing.

---

## 3. Nice-to-have (depth for little cost)

1. **Tide Almanac**: show the next three weather rolls and king tides; turns weather-conditioned fish and yields into planning instead of waiting.
2. **Plot specialisation**: one free "charter" per plot (Quarry, Orchard, Workshop, Garrison): +25% of one node class and -50% of the others. Reuses node tables, gives land a second decision.
3. **Card fusion** at the Calling Shrine: sacrifice two maxed Commons of one tag for one Uncommon draft of that tag. Uses surplus drafts late, when commons are maxed.
4. **Warden hard modes**: re-summon with 2 Lures for +100% HP and a guaranteed trinket; gives the re-summon loop a reason beyond keys.
5. **Scuttler names and hats**: per-Burrow cosmetic picked from Logbook unlocks; no balance impact, strong attachment.
6. **Factory report panel**: per-item production/consumption per minute from the existing `machine.output` and `sluice.moved` events.
7. **Shared ping wheel** (T held): "need", "danger", "look", "on my way" — four presets on the existing ping message.
8. **Tide-turn gamble**: staying on a flat during the 10 s warning doubles tidal yields for those 10 s; uses the existing push-to-land rule as the risk.
9. **Pacing telemetry in the save**: log the playtime at each gate into `world.flags`; the title screen shows "Beacon 3 at 36 h" and the builders get real pacing data from every playtest for free.

---

## Resolution

Applied in `DESIGN.md` v2, `PACING.md` v2, `TECH_SPEC.md` and the new `docs/pacing-model.mjs` (prints every PACING table and the pass/fail bands). Result: critical path 87.3 h solo, full model 99.7 h.

### Blocking

| Id | Resolution |
|---|---|
| B1 | `workbench_3` unlocks at Beacon 4. Every automation structure now has an explicit unlock list in DESIGN 8.2–8.4 (Burrow II `skill:F5` + `beacon:2`; Autobench II, Prism Array, Trawl Buoy, Bolt Turret `beacon:3`; Burrow III, Drill, Rime Turbine, Gull Roost `beacon:4`). Creel is `level:12` (not H8 or H4, so stage 2 stays at hours 3–9); H8 now improves Creels. `unlock` is an array, all required. Unlock-order test added to WP2. |
| B2 | Structures store `data.paid`; refund is `floor(paid * 0.75)` or exactly `paid` with F4; world structures cannot be deconstructed; structure discounts are additive, capped at 25%, and never apply to world structures, Ballast or Tidegate. WP4 test added. |
| B3 | Attunement is all plots of the biome; each Beacon also needs every castaway line and every shrine of its biome; Tidegate stages need 4/6/8 Archive wings and Trench floor 10. Beacon 5 and 6 raised (Beacon 6 beyond the suggestion: 3,000 alloy, 300 cores). Added per-plot **Ballast**, a better fix than tripling Beacons: recipes alone were 35–45% of the needed RU, and Ballast spreads the rest over 80 plots. PACING splits required and optional; the model asserts critical path >= 85 h (87.29) and full 95–105 h (99.69); the bot target is "not earlier than 85%". |
| B4 | Tending added as specified (30 min, 10%, 12 tiles; generators, Ledger Posts and the Mint included; an empty `--persist` server pauses machines, crops, respawn and market). Idle check in PACING 7: 8 h parked at hour 60 = 1.1 h of play. The bot assertion is < 1.5 h rather than < 1 h because the specified constants give 1.1 h. |
| B5 | Saturation x0.99, floor 0.05, +0.02/min (G8: +0.04); Mint 60% through one shared entry; Ledger Post 20/min at 70%; main-quest Glint capped at 25% of the next plot (q20 2,500, q22 6,000); reroll price doubles per reroll within a draft; shop materials 40 per item per day with full stock tables (A.6); mob Glint lowered to `tier * rand(0..2)`. Income is modelled from sources and held within 0.8–1.3x of `min(150 * 1.07^h, 40,000)` (actual 0.90–1.12). |
| B6 | Gem nodes 3% with no prerequisite (Prospector 6%); tidal nodes 1 per 10 s, cap 8; Burrows count gem nodes (0.5% rare share); Umbral gets a `vein` plot and Drills are vein-only (1% rare, max 6 per plot); Trench rare tier rule; moonpetal seeds at floors 10/20/30 with 50% seed return; Trench floor 10 is a stated gate; moonpetal is not scaled in co-op. PACING 5 has the rares table; ratios 1.39–1.46 (Beacon rare counts were raised to reach the band). |
| B7 | Node, craft, fish and harvest XP are personal; kill XP is `xp * (1 + 0.6(n-1)) / n` per contributor; quest, boss first-kill and Beacon XP are full. One constant `PARTY_RANGE = 24`. |
| B8 | Build order changed: WP2 (registries, schema, all data) runs in Wave 0 beside WP1a; Wave 1 starts with real data. TECH_SPEC 7.1 lists every vocabulary: player and world stats with caps, proc triggers, 63 proc ids with params, statuses, elements, affixes, 23 AI archetypes with params and the enemy mapping, machine types with params, ability keys, boss scripts, dungeon mechanics, goal kinds, unlock forms, buff ids. World sheet (`addWorldSource`, `stats.world()`) added. Stacking rule: all same-stat percentages add; `mul` only for passives, set bonuses and Moon Chart; caps yield x3.0, machine speed x3.0, XP x2.5. |
| B9 | `realm` message (`id, w, h, kind, x, y, tick`) and `kicked` added to 6.2; WP1a, WP1b and WP10 tests cover it. |
| B10 | `upd` is `[i, x, y, f, s, hp, patch?]` with dirty-key tracking per entity and per client; sluice contents are a tile-level `it` key, not entities. |
| B11 | Section 5.5 rewritten with exact signatures: `hitNode`, `insertInto` / `extractFrom` / `registerIO`, `canPlace` / `registerPlaceValidator`, `farmTend`, `rollFish`, `growCrops`, `respawnNodes`, `nodesInRadius`, `rollVaultLoot`, `disableMachine`, `machineClusters`, `registerInteract` with owners per kind, `hasUnlock(id, player?)`, `featureAt`, `registerBossScript`; action `boss.summon` (WP5). Treasury veto deleted (spend log plus host spend cap). `saveProfile` / `loadProfile` added; structure `entity.data` is saved verbatim. |
| B12 | Kilns: 3 input slots, fuel meter, 1 output; first matching recipe or pinned; base times divided by 2 and 4 for Kiln II and III; fuel explicit on every Kiln recipe (fieldstone brick 1, charcoal 0). Schema updated. |
| B13 | Burrows are producers needing `need` nodes in radius (4 / 8 / 12) and never remove nodes; the rate is per Burrow; "+1 Scuttler" is +33% inside the 3.0 cap. |
| B14 | Beacons and the Treasury are owned by `systems/land.js` (WP7); `deeds.js` is owned by WP2 with all 60 listed (A.7); Wake bonus is WP6a (`partyAverageLevel` from WP13); shop stock and transactions are WP9; drawers dispatch by kind then type, with `zone.js` (WP5) and `chest.js` (WP4) added; wildcard folders are loaded by `loader.js`; soil is a tile only (`farm.till` costs 1 fieldstone); host = loopback or `--admin`; all pattern-only content is now listed (A.1 trinkets, A.2 blessings, A.3 affixes, A.4 Keeper moves, A.5 relics, A.6 recipes, seeds, dishes and shops, A.7 Deeds, 16.2 side quests). |

### Important

| Id | Resolution |
|---|---|
| I1 | Ability 4 at level 60; Signature picks at 70/80/90, with a Signature listed for all 24 abilities. The hour-18 step is Hopper + **Spillway** (F3 + level 26) instead of Hopper + Splitter, because a Splitter does nothing without Sluices. Tiller Bot at 50 and Gull Roost at 66 close the later gaps; the longest gap is 10 h. |
| I2 | Spawns only on the player's plot and its 4 neighbours; cap `6 + 4 * tier` per player; none on Beacon plots, plots with 4+ lamps, or Garrison plots. The model uses 100 kills/h. |
| I3 | `S` = profiles with 30+ min in the last 10 h of world playtime, recomputed hourly, announced an hour ahead. |
| I4 | Glacier Antler 120,000 HP; enrage 8 min for Wardens and Keepers 4–6. |
| I5 | 12 cards per tag (c20 and u15 moved to Frost, c02 to Gear, c30 to Ember); thresholds 3/5/7. |
| I6 | Mastery `600 * m^2` (mastery 10 about hour 28, mastery 20 about hour 62). |
| I7 | 37 presets added (A.8): one per remaining ability, each Warden and Keeper, the final boss, raids, set procs, tempering, Mint, Gulls, tend warning. The count is stated as 126 names and the WP12 test uses that number. |
| I8 | Resolved by B3 (every plot is required). |
| I9 | Archive donation XP is `50 * itemTier^2`; Tide Board XP is `40 * 2^k`. |
| I10 | WP1 split into WP1a (server + shared) and WP1b (client); WP6 split into WP6a (levels, cards, procs, skills) and WP6b (classes, abilities, gear, consumables). |
| I11 | `self.recipes` key added; one world per process, no world select; land discounts additive, cap 20%; elite and night XP included in the XP table; Kiln fuel slots take Grabbers and brimstone Burrows are named as the fuel source; tier-3 fiber is `ashgrass` (new node `ashgrass_tuft`), brimstone stays as fuel. |
| I12 | Renamed: Creel, Brinelocker, `hollow_core`, `nullsilt`, Hollowling, `hollow` element, Hollow Crown, Brine Shambler, Refrain Knight, Stillwing, Brinesinger, blessings. Glasswaste and Hoarfrost get non-archetypal landmarks in the WP3 art brief. |

### Nice-to-have

All nine taken: Tide Almanac, plot charters, card fusion, Warden hard mode, ping wheel, tide-turn gamble, pacing telemetry (A.9); Scuttler names and hats, and the factory report (8.0).

### Not fixed or only partly fixed

| Item | Why |
|---|---|
| Title "Tidebound" availability | Not checked; it needs a store and trademark search by a person before publishing. |
| Co-op critical path | 72.7–79.4 h for 2–8 players, below the 85 h solo floor, because once-per-world side content and building work are shared. Left as designed (9–17% faster than solo). |
| B4 idle threshold | The bot asserts < 1.5 h instead of < 1 h (see B4). Lowering `TEND_MINUTES` to 20 would meet 1 h. |
| Building hours (19.8) and per-activity timings | Still assumptions, not derived. Only the RU, land, XP, income and rare figures are computed from recipes and formulas. |

---

## Re-review

Checked against the text of `DESIGN.md` v2, `PACING.md` v2, `TECH_SPEC.md` and a run of `docs/pacing-model.mjs` (exit 0, 8 of 8 bands pass as shipped). Sensitivity runs below were made on a temporary copy of the script with only the named constants changed.

### Verdict: PASS WITH FIXES

The softlock, the duplication loop, the missing protocol pieces and the ownership holes are fixed in the text. Four items remain that I would not ship without; all four are number or wording patches that WP2 and WP14 can apply without restarting WP1a, WP1b or WP2.

### Resolution audit

| Id | Text matches the Resolution line? | Judgement |
|---|---|---|
| B1 | Yes: `workbench_3` at Beacon 4; unlock lists on every row of 8.2–8.4; Creel `level:12`; `unlock` is an array | Fixed. I walked the chain for all six Beacons, Lures, hooks, Anvil/Kiln/Bench tiers and every side-quest step; no new unlock-order deadlock found |
| B2 | Yes (DESIGN 7, WP4 test) | Fixed |
| B3 | Yes: all plots, lines and shrines; Ballast; wing and Trench gates | **Not proven.** The 87.3 h holds only because the model leaves out machine speed bonuses the design grants (R1) |
| B4 | Yes, as I specified it | **Partly.** My own rule was too weak once Burrows became shareable producers (R3) |
| B5 | Yes: 0.99 / 0.05 / +0.02, Mint 60% shared, Ledger 20/min at 70%, quest Glint capped, reroll doubling, shop stock | Per-good cap is real. The income band is not evidence (see N3), but Ballast now carries the clock, so this no longer breaks pacing |
| B6 | Yes: gem 3%, tidal 1 per 10 s, Umbral vein, Drill 1% vein-only, Trench tier rule, moonpetal seeds | Fixed for current-tier rares. Older-tier rares are not asserted (N1) |
| B7 | Yes (DESIGN 5.2, PACING 8.1) | Fixed |
| B8 | Yes: Wave 0 = WP1a + WP2; registries in 7.1; world sheet; add/mul rule and caps | **Partly.** Gaps the WP2 builder hits immediately (R4) |
| B9, B10 | Yes (`realm`, `kicked`, `upd` patch, sluice `it`) | Fixed |
| B11 | Yes, signatures present | Fixed except two loose ends (R4 items 5–6) |
| B12 | Yes | Fixed. Ballast recipes in A.6 have no `time`; add 6 s base to each |
| B13 | Yes: producer rule, per-Burrow rate | Fixed as asked, but "two Burrows may share nodes" removes any ceiling (R1) |
| B14 | Yes | Fixed |
| I1–I12 | Spot-checked: ability 4 at 60 and Signatures; spawn rule; S window; Antler 120,000; 12 cards per tag, sets 3/5/7; mastery `600 * m^2`; 37 new presets (89 + 37 = 126 counted); fixed donation XP; WP splits; renames | Fixed. One side effect of I2 + B5 (R2) |

### Remaining blockers

**R1. The critical path is 75–83 h, not 87.3 h: the model omits machine speed bonuses and Burrows have no ceiling.**
`AUTO` in the model is installed base x base rate for phases 1–6 (8 Burrow III x 2,160 = 17,280). DESIGN 8.0 allows up to x3.0, and two sources are effectively guaranteed on the critical path: F10 (+20%) and `wing_works` (+10%, itself required for Tidegate stage 5). Separately, a Burrow no longer consumes nodes and "two Burrows may share nodes", so 8–14 Burrow IIIs can stand around the same 12 nodes on one plot; the only limit on throughput is rares for more Burrows.

| Variant (only this changed) | Critical path | Full model | Model's own bands |
|---|---|---|---|
| As shipped | 87.29 | 99.69 | pass |
| Speed bonus x1.1 / 1.2 / 1.3 / 1.4 in phases 3–6 | 82.46 | 94.86 | 2 fail |
| `AUTO` x1.3 in phases 4–6 | 82.83 | 95.24 | 1 fails |
| `AUTO` x2 in phases 4–7 (cards, Gearwright, stacked Burrows) | 75.63 | 88.03 | 2 fail |
| `BUILD` x0.7 (an efficient builder) | 81.08 | 93.48 | 2 fail |

**Fix (exact; verified on a copy of the script: all 8 bands pass at 85.86 h critical, 98.26 h full, rare ratios 1.32–1.45):**
1. `pacing-model.mjs` and PACING 3.2: `const AUTO = [0, 150, 600, 2090, 6000, 16250, 37800, 45000];` with the note "includes typical speed bonus x1.1 / 1.2 / 1.3 / 1.4; phase 7 already includes x1.5".
2. DESIGN 4.3 and `BALLAST_PER_PLOT`: Emberreach 130 -> **160**, Glasswaste 160 -> **200**, Hoarfrost 300 -> **380**, Umbral 800 -> **1,000**.
3. DESIGN 8.2, replace "Two Burrows may share nodes" with: "Each node counts toward only one Burrow's `need` (nearest Burrow first)." A 22-node plot then runs at most one Burrow III at full rate plus one at 83%, which makes land the factory limit again. WP8 keeps a per-tick claimed set over `nodesInRadius` results; no signature change.
4. Add a ninth assertion: "critical path with `AUTO` x1.25 and `BUILD` x0.8 is >= 75 h", so the floor is tested against an efficient player, not only the average one.

**R2. The first plot now takes about an hour.**
Three revisions combine: enemies spawn only on owned non-start plots (none exist before plot 1), mob Glint is `tier * rand(0..2)` (mean 1), and `q01` pays 10 Glint. Before the first plot the only income is tide caches: 12 tidal spawns per low tide (cap 8) x 4% x about 10 Glint = about 5 Glint per 6 minutes. 55 Glint minus 10 from `q01` is about 55 minutes of waiting on tides. The model hides this by crediting phase 0 with 132 Glint/h of mob drops. DESIGN 23 still promises the first plot inside the first 15 minutes and does not mention Ballast (10 `ballast_1` = 30 fieldstone, 10 copper bars, a Kiln).

**Fix (exact):**
1. `q01` reward 10 G -> **60 G**, marked as the one exemption from the 25% rule.
2. DESIGN 4.6: "The first low tide of a new world always spawns one `tide_cache` worth 15 Glint on the start plot."
3. DESIGN 23 step 5: "Smelt 10 copper bars into 10 Ballast, reach 55 Glint (the quest reward and the first tide cache cover it), raise the first plot — about minute 20."
4. Model: `drops` = 0 in phase 0 until the first plot; add `q01` to phase-0 income.

**R3. Tending is refilled by any held input, and the best factory is the one that fits inside 12 tiles.**
"Refills when any player performs an input action within 12 tiles (walking past counts)" is satisfied by a weighted mouse button or a key held against a wall. With shared-node Burrows the whole cluster sits inside one 12-tile circle. Eight hours of that at hour 60 is 100,000 RU, about 7 hours of play, not 1.1. R1 item 3 spreads Burrows out; this closes the rest.

**Fix (exact):** DESIGN 8.0 Tending: replace "performs an input action within 12 tiles of it (walking past counts)" with "a player who is *active* comes within 12 tiles. A player is active for 60 s after moving at least 4 tiles of net displacement within 10 s, or after any successful action other than `gather.swing` and `attack`." TECH_SPEC 5.4: add bus event `player.active` `{player}`, emitted by WP1a (`systems/movement.js` and `net/router.js`) under that rule, at most once per second per player; WP8 calls `refillTend` on it. PACING 10 idle scenario: "the bot holds primary fire for 8 hours next to its largest machine cluster; gain < 1.5 h".

**R4. Registry and schema gaps that the WP2 builder meets now.** Apply as patches to TECH_SPEC 7 and 7.1; only items 1, 2 and the `player.active` event in R3 touch WP1a, each as a small addition to `statbook.js` or the router.

| # | Gap | Patch |
|---|---|---|
| 1 | Conditional modifiers cannot be written. `Mod` is `{stat, op, v}` and the registry is closed, but `c29` (night), `c30` (day), `r05` (night), `barnacle_charm` (shallows or rain) and `u14` (cache chance) need a condition | `Mod` gains optional `when`: one of `night`, `day`, `rain`, `shallows`, `lowTide`, `lowHp`. The statbook re-evaluates `when` mods on `clock.phase`, `weather.change`, `tide.change` and at 1 Hz for `shallows` and `lowHp`. Add player stats `cacheChance`, `chestLoot`, `weatherBonus` |
| 2 | Non-numeric effects have no field. H4 (ore on minimap), H5 (no slow in shallows), C6 (no knockback), C11 (second weapon slot), T3, T4, T9, T11, F2, F3, G7, r16, u22 are neither stats nor procs | Add `flags: string[]` to cards, skills, trinkets, blessings and Moon Chart perks; add a **Flags** list to 7.1 (WP2 enumerates them while encoding and records each in `INTEGRATION_NOTES.md`); the statbook exposes `game.stats.hasFlag(player, flag)` |
| 3 | Generators are specified twice: a `generator:{...}` block in the structure schema and machine type `generator` in 7.1 | Delete the `generator` block; generators are `machine:{ type:'generator', flux, fuelPer10s, cond }` |
| 4 | Stale schema examples contradict 7.1 and would fail validation: skills `unlocks:['struct:burrow_1']` (the `struct:` form no longer exists; structures carry `unlock:['skill:F5']`), `TAG_SETS` shown as 3/6/9 (now 3/5/7), blessing example `id:'blessing_chain'` with proc `chain` (registry: `bl_chain`, `ricochet`), class example `flags:['threat2x']` (registry: stat `threat`), quest goal-kind comment (registry adds `kill_elite`, `temper`, `solve`) | Correct the five examples; drop the `unlocks` field from skills |
| 5 | Two services do the same thing: `disableStructure` (WP5) and `disableMachine` (WP8) | Delete `disableStructure`; raids call `disableMachine` |
| 6 | `ping.mark` payload is `{x, y}` but the ping wheel has four presets | `{x, y, kind}` with `kind` one of `need`, `danger`, `look`, `omw` |
| 7 | Biome weather weights exist only as one example (Saltfen) in TECH_SPEC; DESIGN 4.6 lists which weathers a biome can have but not how often. Critical-path fish depend on it (`echo_ray` needs an eclipse and is required for `wing_angler`, so for Tidegate stage 5) | Add a weights row per biome to DESIGN 4.6; set Umbral eclipse to 10 of 100 |

### Not blocking, fix during integration

**N1. Older-tier rares are not asserted, and phase 7 comes up short on the model's own numbers.** Amber needed in phases 5–7 is 160 + 365 + 560 = 1,085 (PACING's prose uses 975); supply is 21.6/h x 44 h + 82 surplus = about 1,030, and phase 7 alone needs 560 in 8.85 h against roughly 300 on hand. The player solves it by adding Glasswaste Drills, but the 8.85 h phase 7 is not supported. Add the assertion "cumulative supply of every rare >= cumulative demand at the end of each phase".

**N2. Random gates on the critical path.** Nix step 2 (any legendary fish: 1% per cast under a weather condition) and `wing_angler` (six conditioned rares at 4%) are now required. Add a pity rule: "a rare is guaranteed by the 20th cast made under its condition and a legendary by the 60th".

**N3. The Glint clock is nominal.** The cap is per kind of item, and the number of kinds is a free parameter in the model (`ROTATION`: 16 goods, mean value 25). A factory can keep about 30 goods above 2 units/min (six bar types, fifteen T4–T6 raws, Tiller-Bot crops worth 60–240 each) for roughly 150,000–200,000 Glint/h (my estimate) against the 40,000 curve. Harmless while Ballast gates every plot. If Glint should matter late, add one world-wide `market` saturation entry (x0.999 per unit sold, floor 0.2, +0.02/min).

**N4. Co-op critical path is 71–78 h** after the R1 retune (72.7–79.4 as shipped). The design accepts 9–17% faster than solo; the stated bar is about 100. If parity is wanted, require castaway lines to be completed by `ceil(S/2)` players instead of once per world.

**N5. Leftovers.** DESIGN 13.3 still has the old sentence "rares of the party's highest tier" in front of the new tier rule; Morrow's reward mentions a Trench entry key that is defined nowhere; DESIGN 15 ends with the uncapped `150 * 1.07^hour`.

**N6. Still assumptions.** 43.65 of the 87.3 critical hours (building 19.8, side 12.1, combat 11.75) are estimates, as the Resolution admits. The pacing bot and the save telemetry are the right instruments; treat the first playtest numbers, not this model, as the acceptance test for "about 100 hours".

---

## Re-review resolution

Applied to `DESIGN.md`, `PACING.md` (v3), `docs/pacing-model.mjs` and, for R3 only, `TECH_SPEC.md` 5.4/5.5 and two test lines. TECH_SPEC registry and schema sections (7, 7.1) were not touched; R4 is with the WP2 builder.

Model after the changes: critical path **85.79 h**, full model **98.19 h**, efficient player 75.98 h, co-op critical path 71.1–77.9 h; all 10 assertions pass.

| Id | Resolution |
|---|---|
| R1 | Model `AUTO` = `[0, 150, 600, 2090, 6000, 16250, 37800, 45000]` (speed bonus x1.1/1.2/1.3/1.4 in phases 3–6); Ballast raised to 160 / 200 / 380 / 1,000 for Emberreach / Glasswaste / Hoarfrost / Umbral in DESIGN 4.3, PACING and the model; DESIGN 8.2 now says each node counts toward only one Burrow's `need` (nearest first); ninth assertion added (`AUTO` x1.25, `BUILD` x0.8 gives >= 75 h; actual 75.98). |
| R2 | `q01` pays 60 Glint (stated exemption from the 25% cap); the first low tide always spawns a 15-Glint cache on the start plot (DESIGN 4.6); onboarding step 5 now covers Ballast and gives "about minute 20", and step 2's Mossback is a scripted tutorial spawn; model phase 0 has no mob drops and gets the `q01` + cache lump. Phase 0 now ends with the first plot (the second is bought early in phase 1), because 103 Glint of phase-0 income does not cover both. |
| R3 | Tending refills only for an *active* player (4 tiles net displacement in 10 s, or a successful action other than `gather.swing` / `attack`; active for 60 s). TECH_SPEC 5.4 adds the `player.active` event and the exact rule, emitted by WP1a at most once per second; `refillTend` is called by WP8 on that event only; WP1a and WP8 test lines updated. PACING 10 idle scenario: the bot holds primary fire for 8 hours next to its largest cluster, gain < 1.5 h (model: 1.1 h). |
| R4 | Not applied here by instruction (WP2 builder is handling it), except item 7: biome weather weights added to DESIGN 4.6 with Umbral eclipse at 10 of 100. |
| N1 | Tenth assertion added: cumulative supply of every rare >= cumulative demand at each phase end. The phase-7 amber shortfall is closed by placing the two phase-7 Drills on the Glasswaste vein (33.6 amber/h); the final margin is thin (1,268 supplied against 1,263 needed) and is called out in PACING 5 with its knob. |
| N2 | Fishing pity added (DESIGN 14.2, PACING knobs): a rare by the 20th cast under its condition, a legendary by the 60th. |
| N3 | Not changed; PACING 4.2 now states the limit of the Glint clock and the optional world-wide `market` saturation entry. |
| N4 | Not changed; PACING 8.2 states the `ceil(S/2)` option. |
| N5 | Three stale sentences fixed: Trench rewards line (DESIGN 13.3), Morrow's reward (no undefined key), DESIGN 15 income curve now `min(150 * 1.07^hour, 40,000)`. Also: Ballast recipes get a 6 s base time (A.6), and the mastery and Beacon hours quoted in DESIGN were updated to the new model. |
| N6 | Acknowledged in the PACING header: 43.65 of the critical hours are estimates, and playtest telemetry is the acceptance test. |
