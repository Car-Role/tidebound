# Pacing results (WP14)

What was run, what it showed, and what changed. Commands:

```
npm test                                  # model bands over the real data, bot first-plot check, idle check
npm run test:pacing                       # + the full solo bot run to the Drowned Moon (about 10 min)
TB_PACING_COOP=1 npm run test:pacing      # + 2- and 4-player crews
node test/bot/pacing-bot.js --players N --hours H [--json]
```

## 1. The model, now over the real data (`shared/rules/pacing.js`)

`docs/pacing-model.mjs` is ported; every material requirement (Beacon and Tidegate costs, Ballast per plot, gear,
machines) is expanded through the real recipe graph in `shared/data`, plots per biome come from `shared/grid.js`, land
and XP from `shared/rules`. Result with the shipped data: **critical path 85.80 h, full model 98.20 h**, efficient
player 75.99 h, co-op 77.9 / 75.0 / 73.5 / 71.9 / 71.1 h for 2 / 3 / 4 / 6 / 8 players. All ten section-10 bands pass
(`test/pacing.test.js`). The real recipes matched the copied constants to within 7 RU of 593,382.

## 2. The bot (`test/bot/pacing-bot.js`)

A scripted player on the real server simulation (harness, no sockets, 1 s ticks). It gathers real nodes with its
real stats, crafts real recipes at real stations it built (station orders run in parallel lanes), raises plots with
`land.raise`, builds with `build.place`, runs the castaway lines through `quest.accept` / `quest.turnin`, clears the
real Vault instances room by room (BOT_AUTOBATTLE: real per-hit damage through the damage service, time = HP / DPS x
1.6), summons Wardens with real Lures, lights Beacons, picks cards and skills, builds Burrows, Flux generators,
Sluices and Stockpiles, collects machine output, sells after Beacon 1, and fights what spawns around it. What it
cannot play is charged by the clock (PACING 3.5 minutes): shrines 6 min, puzzle / trap rooms 75 s, fish 2.5 min each,
crop items 45 s, relics 7 min, castaway goals of kind catch / temper / solve / reach / donate / kill_elite / counter
8 min, Trench floors 6 min. Every modelled completion is counted in the report (`forced`).

### Solo, seed 1 (latest bot, run 26)

| Phase | Bot ends at | PACING end | Bot length | PACING length | 85% gate |
|---|---|---|---|---|---|
| 0 first plot | 0.2 h (minute 12) | about minute 20 | | | first plot before minute 30: pass |
| 1 Greenmarrow (Beacon 1) | 4.6 | 8.6 | 4.5 | 7.2 | **fails** (needs >= 7.3) |
| 2 Saltfen (Beacon 2) | 14.1 | 21.9 | 9.4 | 13.3 | **fails** (needs >= 18.6) |
| 3 Emberreach (Beacon 3) | 32.3 | 39.0 | 18.2 | 17.1 | pass (>= 33.2 would be the gate: 32.3 is 83%) |
| 4 Glasswaste (Beacon 4) | not reached at 98.9 h | 56.4 | > 66 | 17.4 | |
| 5-7 | not reached | 72.9 / 89.3 / 98.2 | | | |

Total critical path: **not finished**. Earlier bot builds reached Beacon 4 at 77.8 h (run 24) and stood at 64 plots,
Beacon 4, after 200 simulated hours. Time split in run 26 (player-hours): walking 54.5, swinging 11.0, fighting 10.5,
UI and station interactions 15.3, side content 2.2, building 1.4, waiting on stations 7.4.

### Co-op

See section 4.

## 3. What the bot found

**Real code (fixed):**
1. **Burrows turned gem nodes into a rare fountain.** A gem node inside a Burrow's radius counted as one of its nodes,
   so 1/N of ALL Burrow output was the tier's rare: in one run the bot held 1,998 magma cores at hour 63 (Beacon 3
   needs 90). PACING 5 assumes 0.5% (`BURROW_RARE`). `scuttlers.js` now ignores gem nodes. This alone would have
   collapsed the rare clock for every phase after Burrow II.
2. Everything in `docs/notes/WP14-server.md` that touches pacing (co-op S, Burrow / Drill world caps, Beacon-1 selling
   gate, Ballast half XP, saturation floor 0.01, Tide Board 3-day shared contracts, copper weight, start-plot nodes).

**Pacing (not tuned, see 5):**
1. **The first two biomes run 35-45% fast.** With the real data a competent player lights Beacon 1 at 4.6 h and
   Beacon 2 at 14.1 h (PACING 8.6 / 21.9). Material needs in these phases are small (4,300 and 11,500 RU) and the bot
   gathers about 1,300-1,600 RU per hour of gathering against the modelled 900-1,100; it also spends far less than the
   modelled 1-2 h of building and 0.7-1.8 h of side content per phase.
2. **From Glasswaste on, the rare clock and logistics dominate.** Amber (Beacon 4: 100, plus about 40 in Prism
   Circuits and 2 per hook) comes from gem nodes at 3% of respawns on the 15 Glasswaste plots, Prism Sentinels and 0.5%
   of Burrow output. The bot cleared Glasswaste nodes for about 24 h to collect it; PACING 5 models 14.9 amber per
   hour (ratio 1.45). The modelled "manual 7.6 per hour" assumes 360 breaks per hour at 70% on the current tier; real
   tier-4 nodes take longer to break and to walk between, so the real manual rate is lower.
3. **Hauling is most of the bot's time** (walking 40-55% of all hours). The bot only partly simulates logistics:
   after it lays 6 Sluice tiles per producer it stops walking machine output and station loads, but it still walks
   every fetch from storage. A human factory with Grabbers into Kilns and Gulls between biomes does better, so the
   later-phase hours are an upper bound.

## 4. Co-op (2 and 4 players, 80 h cap)

(filled in below by the final runs)

## 5. Tuning decision

The user's rule: tune the shared levers if the real code collapses the solo critical path below about 85 h. It does
not: the bot is slower than PACING after Beacon 3 and does not finish in 200 h, while it is faster in the first two
biomes. A uniform lever (Ballast, `GATE_COST_MULT`) would push the slow part further out. A trial with Greenmarrow
Ballast 16 x ordinal and Saltfen 120 per plot added 3.3 h to the model's critical path (89.1 h) but pushed three model
bands out (income ratio below 0.8 in phases 2-5, Saltfen pearl ratio 1.61), so it was reverted. Recommended next
steps, in order:

1. Re-run the bot after a factory pass (Grabbers into Kilns, Gull Roosts, Autobenches) so phases 4-7 measure the game
   and not the bot's hauling; only then decide on early-game levers.
2. If the early phases stay fast: raise `BALLAST_PER_PLOT.greenmarrow.perOrdinal` 10 -> 14 and Saltfen 90 -> 110 and
   update PACING 4.2's income inputs for the later phase hours together (the model's income curve is tied to hours).
3. Amber: if human playtests also stall at Beacon 4, raise `GEM_NODE_CHANCE` for tier-4 plots or `BURROW_RARE` to 1%.

## 6. Run history (solo, seed 1; bot changes, not game changes, unless marked)

| Run | Change | Beacon 1 / 2 / 3 / 4 (h) | Stopped at |
|---|---|---|---|
| 3 | first full build | 5.6 / 28.9 / - | 87 h, turn-in loop |
| 6 | fuel from peat / brimstone / charcoal, fill orders | 3.8 / 13.6 / - | 50 h, magma core |
| 9 | Waystones, raise goals | 3.8 / 12.6 / 30.7 | 87 h, placement |
| 16 | Burrows prioritised, rares reserved for Beacons | 3.8 / 13.1 / 34.1 | 75 h |
| 17 | **game fix: gem nodes no longer feed Burrows** | 3.8 / 14.6 / 35.8 | 71 h, bog iron |
| 24 | storage grows, burrows by demand, memory fix | 3.8 / 13.2 / 33.8 / 77.8 | 200 h cap, 64 plots |
| 26 | Sluice logistics, nominal Flux | 4.6 / 14.1 / 32.3 / - | 99 h, amber |
