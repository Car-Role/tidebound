# WP5 (combat, enemies, bosses) + WP10 (dungeons, Trench) - notes

## Files
Server: `systems/{combat,status,projectiles,mobs,ai,bosses,death,defence,raids,dungeons}.js`, `game/ai/*.js` (23
archetypes), `game/bosses/*.js` (6 Wardens + `drowned_moon`), `game/dungeon/{gen,puzzles,blessings,trench}.js`,
`game/dungeon/rooms-<biome>.js` (6), `game/dungeon/keepers/*.js` (6). Client: drawers `mob, boss, projectile, zone,
dungeon`, `ui/hud/boss.js`, `ui/panels/dungeon.js`. Tests: `test/combat.test.js` (16), `test/dungeon.test.js` (12).

## Contracts others need
- **`damage(target, amount, opts)`**: `amount` is the attacker-side number (base x power x crit x roll). damage()
  applies the target side: armor (hollow ignores 30%), weak/resist, mark, shield, guard fronts, vulnerability
  windows (`data.dmgMult`), player armor/elemResist/dmgTaken, dodge i-frames (`player.body.dodgeT > 0`), `invuln`,
  plus the attacking player's `bossDmg`/`eliteDmg`/`dmgWorld`. opts: `source, element, crit, knock, noProcs, raw,
  melee, ability, unavoidable, quiet, kx, ky, tag`. Do not apply armor/bossDmg yourself. Kill credit comes from
  `source` (a player, or any entity with `data.ownerId`).
- Bus: `mob.hit` also carries `source, noProcs, ability, melee, tag`; `mob.killed` adds `raid, instance`;
  `boss.killed` adds `firstFor[], hard, instance, seconds`; `vault.cleared` adds `firstFor[]`. New events:
  `player.swing {player, weapon, wtype}` (every weapon swing; WP6a can map it to the `swing` proc trigger),
  `player.dodge` (emitted by combat.js when a dodge charge is spent), `player.downed`, `raid.ended`, `instance.wipe`.
- Extra services: `spawnProjectile, spawnZone, telegraph, shapeHit, ringWave, weaponOf, rollPlayerDamage, knockback,
  hostilesInRadius, hasStatus, runSpawnRules, enemyDef, endBoss, bossXp, startRaid, raidHitStructure,
  registerDeathGuard (WP6a already uses it), revivePlayer, respawnPlayer, killDowned, checkWipe, instanceOf,
  ejectFromInstance, destroyInstance, instanceDarkness`.
- Statuses live in `entity.data.status = {id: {t, p, n}}`; public `st` bitmask bit i = `registries.STATUSES[i]`
  (confirms the WP3/WP12 assumption). Player slows/roots/stuns are a `status` stat source (moveSpeed).
- **World key for raids**: `world.raid = { active, wave, waves, px, py, x, y, biome, left, next }` (`{active:false}`
  when none) - confirms the WP12 assumption.
- Self keys added: `death` `{state: alive|down|dead, respawnIn, downIn, revive, at}` and `dungeon` `{in, kind, k,
  name, floor, floors, blessings, offer, rooms, room, dark, trench, results, entry}`.
- Public keys added on mobs/bosses: `iv` (0 visible, 1 disguised, 2 shrouded, 3 burrowed, 4 high above, 5 riding a
  wave), `hb` (last attacker id), `hc` (crit counter), `hd` (direct-hit counter: client hitstop), bosses `en`
  (enraged), `cx` (core exposed / vulnerable), `sh` (shielded), `cv` (conveyor dir), `sr` (safe radius), `arm/arms/al`
  (rotating beams), `gi/gn` (index/count in a multi-body encounter). Zones: `sh, w, h, r2, gp, c, wd, sf, dl`.
- Boss scripts may use extensions beyond TECH_SPEC's BossScript (all optional, documented at the top of
  `systems/bosses.js`): `zones()`, `track`, `update/end` channels, `tick`, `onStart`, `onEnd`, `onPartDeath`, `when`.
- **Drowned Moon**: `server/game/bosses/drowned_moon.js` registers the full fight. WP11 should create the arena
  with `createInstance('moon', {party})` (44x44 circle, players go down instead of dying, wipe ejects to the
  overworld) and call `startBoss(realm, 'drowned_moon', 22, 22, {})`; react to `boss.killed` (kind `drowned_moon`).
  If finale.js registers its own `drowned_moon` script it overrides this one (it inits later).
- Damage numbers, attacker hitstop and the self-hurt shake/flash are drawn by WP5 drawers from `entity:hurt` + the
  `hc/hd/hb` keys. **WP12: do not add `number` to `hit_*` FX_MAP entries** or numbers will double. Hit fx params:
  `{d: dealt, c: crit, b: blood, i: target id}`.
- Combat "ground pass": `drawers/zone.js` inserts two pseudo entities (ids -9001/-9002, `pseudo: true`, at
  x = y = -1e6) into `store.entities` so telegraphs/pools draw under characters and dungeon darkness over them.
  Anything iterating `store.entities` should skip `e.pseudo` (minimap, targeting already ignore them by distance).

## Deviations
1. **Vault realm size**: `createInstance('vault')` makes the real 5x5 grid of 16x12 rooms = **86x66** tiles
   (TECH_SPEC 13.1 / DESIGN 13.1), not WP1's 40x40 placeholder. `test/core.test.js` "movePlayer sends the realm
   message..." still asserts 40x40. **Patch for WP14** (core.test.js line ~218):
   `eq([m.id, m.w, m.h, m.kind, m.x, m.y], [inst.id, inst.w, inst.h, 'vault', 5, 5]);`
   (`inst` is the returned Realm, so `inst.w/inst.h` are the actual size).
2. Boss first-kill XP is not in DESIGN: `0.25 * xpToNext(level)` with Warden levels 10/22/36/50/64/78 and Keeper
   levels 8/18/30/44/58/72; repeats share 20% of that by the kill formula. Bosses give no Glint.
3. Sea Chest takes 50% of every `material` and `component` stack; chests expire after 20 min of world playtime.
4. Downed players whose 20 s run out stay dead inside the instance until the room/floor is cleared (then revive at
   30%) or the party wipes. Revive = stand beside them for 3 s (x reviveSpeed) or the `revive` action.
5. First Vault entry is free per player (the one who opens the instance); joining an active instance is free.
6. Extra synthetic enemies (not in data): `glass_shard` (Glass Revenant split), `choir_singer`, `prism_clone`,
   `lens`, `pylon`. Clones and boss adds give no loot/XP.
7. Hollow Choir: the Choir body is immune; its HP mirrors the three singers (killed within 10 s of each other).
   `three_singers` is also a move (a chord burst around each singer).
8. Trench Keepers are normalised to the Bellows Engine (x0.6 HP, x0.75 dmg) times 1.12^floor; Trench enemies are
   normalised to the tier-3 average and scaled 1.12^floor; floor Glint `20 * floor * (1 + floor/10)`.
9. Raids also need a target: `machineClusters()[0]`, else the owned plot with the most structures. Repelling all 3
   waves drops a `vault_key_<newest tier>` per defender.
10. The tutorial Mossback (DESIGN 23 step 2) spawns once near the first player who crafts a weapon (5 Glint).
11. Boss HP bars sit above the hotbar (the top centre is the goal tracker); the run/raid strip is under the HP bars.

## Needs from others
- **WP1/WP14 client**: `main.js` never sends `revive` (its `use` targeting skips players). Revive works by
  proximity, but an interact on a downed ally should send `revive {id}`. Also the client swing cadence is a fixed
  0.5 s; the server allows `rate * (1 + swingSpeed)` (bow 1.5/s, staff 1.0/s), so bows/staves get `cooldown`
  replies when held - send `attack` at the weapon rate.
- **WP6b**: `drainSurge(player, n)` service would make the Leeching affix drain Surge reliably (combat.js falls back
  to `player.surge.cur` if present). Abilities should use `damage(..., {ability: true})` and not add armor/bossDmg.
- **WP14**: apply the core.test.js patch above.

## Open problems
- Player knockback/stun pins are server-side position changes, so the client corrects (small snap) on big knocks.
- Ice floors / erased tiles are non-persistent tile edits restored when the effect ends or the fight ends.
