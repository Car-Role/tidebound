// WP10 run-only blessings (DESIGN A.2). A blessing altar offers 3 not already held; picks last until the player
// leaves the instance. Stat mods go through the 'blessings' stat source; proc blessings are handed to WP6a's
// proc runtime (game.procs.addSource) so chain/burn/chill/spark/revive/orbs/pup/nova use the shared proc code.
// `bl_loot` adds Keeper loot rolls (read by the dungeon system), `bl_gold` is a glintMult mod.

const procList = (p) => (Array.isArray(p) ? p : p ? [p] : []);

export function blessingDef(game, id) { return game.content.blessings.byId[id] ?? null; }

export function rollOffer(game, held, rng, n = 3) {
  const pool = game.content.blessings.map((b) => b.id).filter((id) => !held.includes(id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

// Blessings of a player in their current instance (empty outside one).
export function heldBlessings(game, player) {
  const inst = player?.entity ? game.instances?.get(player.entity.realm) : null;
  return inst?.blessings.get(player.id) ?? [];
}

export function installBlessings(game) {
  game.stats.addSource('blessings', (player) => {
    const out = [];
    for (const id of heldBlessings(game, player)) {
      const def = blessingDef(game, id);
      for (const m of def?.mods ?? []) out.push(m);
      for (const f of def?.flags ?? []) out.push({ flag: f });
    }
    return out;
  });
  const procSource = (player) => {
    const inst = player?.entity ? game.instances?.get(player.entity.realm) : null;
    if (!inst) return [];
    const out = [];
    for (const id of inst.blessings.get(player.id) ?? []) {
      procList(blessingDef(game, id)?.proc).forEach((p, i) => out.push({ ...p, src: 'blessing', key: `bl:${inst.id}:${id}:${i}`, once: !!blessingDef(game, id)?.once }));
    }
    return out;
  };
  if (game.procs?.addSource) game.procs.addSource('blessings', procSource);
  else if (game.wp6?.procSources?.add) game.wp6.procSources.add('blessings', procSource);
  else console.warn('[tb:dungeons] no proc runtime found; proc blessings are inert');
}

export function grantBlessing(game, inst, player, id) {
  const list = inst.blessings.get(player.id) ?? [];
  if (list.includes(id)) return false;
  list.push(id);
  inst.blessings.set(player.id, list);
  game.stats.invalidate(player);
  if (game.procs?.invalidate) game.procs.invalidate(player);
  else player.procCache = null;
  return true;
}

export function clearBlessings(game, inst, player) {
  if (!inst.blessings.has(player.id)) return;
  inst.blessings.delete(player.id);
  game.stats.invalidate(player);
  if (game.procs?.invalidate) game.procs.invalidate(player);
  else player.procCache = null;
}

export function extraKeeperRolls(game, inst, player) {
  let n = 0;
  for (const id of inst.blessings.get(player.id) ?? []) for (const e of blessingDef(game, id)?.effects ?? []) if (e.id === 'keeper_loot_rolls') n += e.n ?? 1;
  return n;
}

export default { rollOffer, heldBlessings, installBlessings, grantBlessing, clearBlessings, extraKeeperRolls, blessingDef };
