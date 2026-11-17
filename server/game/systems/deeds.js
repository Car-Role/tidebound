// WP11: counters + Logbook (DESIGN 17.2, A.7). Provides the `counter` service (TECH_SPEC 5.5).
//
// Counter storage: per-player counters live in `player.counters` (saved by WP1 as the profile's top-level
// `counters`); world counters live in `game.world.counters` (saved by WP1 in the world block).
//
// Counters this system derives itself from bus events (owners must NOT also call `counter` for these):
//   nodes_broken, wood_gathered, stone_gathered, ore_gathered, plants_gathered, tidal_nodes, tide_caches, gem_nodes,
//   crops_harvested, fish_caught, legendary_fish, items_crafted, bars_smelted, gear_crafted, dishes_cooked,
//   tonics_brewed, ballast_made, components_made, structures_built, machines_built, plots_raised (world),
//   mobs_killed, elites_killed, shared_kills, bosses_killed, wardens_hard, damage_dealt, crits_landed, deaths,
//   abilities_cast, dodges, shrines_solved, vaults_cleared, trench_deepest, relics_found, archive_donations,
//   quests_done, distance_walked, cards_picked, skills_bought, items_sold, glint_earned, sluice_items (world),
//   gull_deliveries (world), autobench_crafts (world), burrow_units (world), minted (world), flux_peak (world),
//   mythics_owned, mastery_levels, rebirths, coop_minutes and pings_sent (WP13 coop.js).
// Counters that have no bus event and must be reported by their owners through `counter(player|null, id, delta)`:
//   tempers_done (WP6b), rerolls_used (WP6a), waystone_jumps (WP7), king_tides_worked (WP7), tend_refills (WP8),
//   allies_revived (WP5), raids_survived (WP5, world: player null).

const ST = new WeakMap();
const st = (game) => ST.get(game);

// Gauges: the counter holds a maximum, not a running sum.
const GAUGES = new Set(['trench_deepest', 'flux_peak', 'mythics_owned', 'mastery_levels']);
const SYNC_EVERY = 1;   // slow ticks between self.deeds pushes when dirty

function playerOf(game, ref) {
  if (!ref) return null;
  if (ref.token && ref.entity !== undefined) return ref;                 // Player record
  if (typeof ref === 'number') return game.players.get(ref) ?? null;     // player id
  if (ref.type === 'player') return game.playerOfEntity(ref);           // player entity
  if (ref.owner?.token) return ref.owner;
  return null;
}

function participantsOf(game, list, extra) {
  const out = new Set();
  for (const p of list || []) { const pl = playerOf(game, p); if (pl) out.add(pl); }
  const k = playerOf(game, extra);
  if (k) out.add(k);
  return [...out];
}

function profileDeeds(player) {
  const sys = (player.profile.sys ||= {});
  const d = (player._deeds ||= sys.deeds && typeof sys.deeds === 'object' ? sys.deeds : {});
  d.tiers ||= {};
  d.cosmetics ||= [];
  d.kills ||= {};
  d.fish ||= {};
  d.relics ||= [];
  return d;
}

export default {
  name: 'deeds',

  init(game) {
    const content = game.content;
    const byCounter = new Map();
    for (const d of content.deeds) {
      if (!byCounter.has(d.counter)) byCounter.set(d.counter, []);
      byCounter.get(d.counter).push(d);
    }
    // item -> node class for "<class>_gathered" counters, built from node drop tables
    const itemClass = new Map();
    for (const n of content.nodes) {
      for (const dr of n.drops || []) {
        if (!itemClass.has(dr.item) && ['wood', 'stone', 'ore', 'plant'].includes(n.cls) && content.items.byId[dr.item]?.cat === 'material') {
          itemClass.set(dr.item, n.cls);
        }
      }
    }
    const s = { byCounter, itemClass, lastPos: new Map(), walkAcc: new Map(), dirty: new Set(), ticks: 0 };
    ST.set(game, s);

    const worldCounters = () => (game.world.counters ||= {});
    const isWorldCounter = (id) => content.deeds.some((d) => d.counter === id && d.world);

    // ---- the counter service ----
    const bump = (playerRef, id, delta) => {
      if (typeof id !== 'string' || !Number.isFinite(delta)) return 0;
      const player = playerOf(game, playerRef);
      const bag = player ? (player.counters ||= {}) : worldCounters();
      const prev = bag[id] || 0;
      const next = prev + delta;
      bag[id] = next;
      if (player) { s.dirty.add(player); checkDeeds(game, player, id); }
      else if (byCounter.has(id)) for (const p of game.players.values()) { s.dirty.add(p); checkDeeds(game, p, id); }
      return next;
    };
    game.services.register('counter', bump);

    // Raise a gauge counter to at least `v`.
    const gauge = (playerRef, id, v) => {
      const player = playerOf(game, playerRef);
      const bag = player ? (player.counters ||= {}) : worldCounters();
      if ((bag[id] || 0) >= v) return bag[id] || 0;
      return bump(player, id, v - (bag[id] || 0));
    };
    s.gauge = gauge;
    // Extra service (not in 5.5): owners with a maximum-style counter may call counterMax(player|null, id, value).
    game.services.register('counterMax', gauge);
    s.isWorldCounter = isWorldCounter;

    const items = content.items.byId;
    const on = (ev, fn) => game.bus.on(ev, fn);

    on('node.broken', ({ player, kind, byMachine }) => {
      const p = playerOf(game, player);
      if (!p || byMachine) return;
      bump(p, 'nodes_broken', 1);
      const def = content.nodes.byId[kind];
      if (def?.cls === 'tidal') bump(p, 'tidal_nodes', 1);
      if (def?.cls === 'gem') bump(p, 'gem_nodes', 1);
      if (kind === 'tide_cache') bump(p, 'tide_caches', 1);
    });
    on('item.pickup', ({ player, item, qty }) => {
      const p = playerOf(game, player);
      if (!p) return;
      const cls = itemClass.get(item);
      if (cls === 'plant') bump(p, 'plants_gathered', qty);
      else if (cls) bump(p, cls + '_gathered', qty);
      if (items[item]?.cat === 'relic') {
        const d = profileDeeds(p);
        if (!d.relics.includes(item)) { d.relics.push(item); bump(p, 'relics_found', 1); }
      }
    });
    on('crop.harvested', ({ player, qty, byMachine }) => {
      const p = playerOf(game, player);
      if (p && !byMachine) bump(p, 'crops_harvested', qty || 1);
    });
    on('fish.caught', ({ player, fish, rarity }) => {
      const p = playerOf(game, player);
      if (!p) return;
      bump(p, 'fish_caught', 1);
      if (rarity === 'legendary') bump(p, 'legendary_fish', 1);
      const d = profileDeeds(p);
      d.fish[fish] = (d.fish[fish] || 0) + 1;
    });
    on('item.crafted', ({ player, item, qty = 1, byMachine }) => {
      const p = playerOf(game, player);
      if (!p || byMachine) return;
      const def = items[item];
      bump(p, 'items_crafted', qty);
      if (!def) return;
      if (def.bar) bump(p, 'bars_smelted', qty);
      if (['weapon', 'armor', 'tool', 'rod', 'pack', 'lantern'].includes(def.cat)) bump(p, 'gear_crafted', qty);
      if (def.cat === 'food') bump(p, 'dishes_cooked', qty);
      if (def.cat === 'tonic') bump(p, 'tonics_brewed', qty);
      if (def.cat === 'component') bump(p, 'components_made', qty);
      if (/^ballast_\d$/.test(item)) bump(p, 'ballast_made', qty);
    });
    on('structure.placed', ({ player, structure }) => {
      const p = playerOf(game, player);
      if (!p) return;
      const def = content.structures.byId[structure?.kind];
      if (def?.natural) return;
      bump(p, 'structures_built', 1);
      if (def && (def.countsToCap || def.cat === 'automation')) bump(p, 'machines_built', 1);
    });
    on('land.raised', () => bump(null, 'plots_raised', 1));
    on('mob.killed', ({ killer, mob, elite, participants }) => {
      const ps = participantsOf(game, participants, killer);
      const isElite = !!(elite || mob?.pub?.el);
      for (const p of ps) {
        bump(p, 'mobs_killed', 1);
        if (isElite) bump(p, 'elites_killed', 1);
        if (ps.length >= 2) bump(p, 'shared_kills', 1);
        const d = profileDeeds(p);
        const k = mob?.kind;
        if (k && mob?.type !== 'boss') d.kills[k] = (d.kills[k] || 0) + 1;
      }
    });
    on('boss.killed', ({ boss, kind, participants }) => {
      const def = content.bosses.byId[kind];
      for (const p of participantsOf(game, participants)) {
        if (def?.kind !== 'final') bump(p, 'bosses_killed', 1);
        if (def?.kind === 'warden' && (boss?.data?.hard || boss?.hard)) bump(p, 'wardens_hard', 1);
        const d = profileDeeds(p);
        d.kills[kind] = (d.kills[kind] || 0) + 1;
      }
    });
    on('mob.hit', ({ attacker, dmg, crit }) => {
      const p = playerOf(game, attacker);
      if (!p) return;
      if (dmg > 0) bump(p, 'damage_dealt', Math.round(dmg));
      if (crit) bump(p, 'crits_landed', 1);
    });
    on('player.died', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'deaths', 1); });
    on('ability.cast', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'abilities_cast', 1); });
    on('player.dodge', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'dodges', 1); });
    on('shrine.solved', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'shrines_solved', 1); });
    on('vault.cleared', ({ participants }) => { for (const p of participantsOf(game, participants)) bump(p, 'vaults_cleared', 1); });
    on('trench.floor', ({ floor, participants }) => { for (const p of participantsOf(game, participants)) gauge(p, 'trench_deepest', floor); });
    on('archive.donated', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'archive_donations', 1); });
    on('quest.completed', ({ player, quest }) => {
      const q = content.quests.byId?.[quest] ?? content.quests.find?.((x) => x.id === quest);
      // main quests are world quests: every connected player shares the credit
      if (q?.type === 'main') for (const p of game.players.values()) bump(p, 'quests_done', 1);
      else { const p = playerOf(game, player); if (p) bump(p, 'quests_done', 1); }
    });
    on('card.picked', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'cards_picked', 1); });
    on('skill.bought', ({ player }) => { const p = playerOf(game, player); if (p) bump(p, 'skills_bought', 1); });
    on('item.sold', ({ player, qty }) => { const p = playerOf(game, player); if (p) bump(p, 'items_sold', qty || 1); });
    on('glint.changed', ({ delta, player, source }) => {
      const p = playerOf(game, player);
      if (p && delta > 0 && source !== 'refund') bump(p, 'glint_earned', Math.round(delta));
    });
    on('sluice.moved', ({ count }) => { if (count > 0) bump(null, 'sluice_items', count); });
    on('gull.delivered', ({ count }) => { if (count > 0) bump(null, 'gull_deliveries', count); });
    on('machine.output', ({ machine, qty = 1 }) => {
      const k = machine?.kind || '';
      if (k.startsWith('autobench')) bump(null, 'autobench_crafts', qty);
      else if (k.startsWith('burrow')) bump(null, 'burrow_units', qty);
      else if (k === 'mint' || k.startsWith('mint')) bump(null, 'minted', qty);
    });
    on('rebirth', () => {
      for (const p of game.players.values()) bump(p, 'rebirths', 1);
    });
  },

  slowTick(game) {
    const s = st(game);
    // distance walked (tiles, teleports ignored) and gauges read from other systems' published state
    for (const p of game.players.values()) {
      const e = p.entity;
      if (!e) continue;
      const last = s.lastPos.get(p.id);
      if (last && last.realm === e.realm) {
        const d = Math.hypot(e.x - last.x, e.y - last.y);
        if (d > 0.01 && d < 15) {
          const acc = (s.walkAcc.get(p.id) || 0) + d;
          const whole = Math.floor(acc);
          s.walkAcc.set(p.id, acc - whole);
          if (whole > 0) game.call('counter', p, 'distance_walked', whole);
        }
      }
      s.lastPos.set(p.id, { x: e.x, y: e.y, realm: e.realm });

      const cards = p.selfState?.cards?.owned;
      if (cards && typeof cards === 'object') {
        let mythics = 0;
        for (const id of Object.keys(cards)) if (game.content.cards.byId[id]?.rarity === 'mythic') mythics++;
        if (mythics) s.gauge(p, 'mythics_owned', mythics);
      }
      const mastery = p.selfState?.class?.mastery;
      if (mastery && typeof mastery === 'object') {
        const sum = Object.values(mastery).reduce((a, b) => a + (Number(b) || 0), 0);
        if (sum) s.gauge(p, 'mastery_levels', sum);
      }
    }
    const flux = game.worldState?.flux;
    if (flux && Number.isFinite(flux.supply) && flux.supply > 0) s.gauge(null, 'flux_peak', Math.floor(flux.supply));

    if (++s.ticks >= SYNC_EVERY) {
      s.ticks = 0;
      for (const p of s.dirty) if (game.players.has(p.id)) sendDeeds(game, p);
      s.dirty.clear();
    }
  },

  onJoin(game, player) {
    const s = st(game);
    s.lastPos.delete(player.id);
    // WP14 (client P1-8): the worn hat is a public entity key read by the player drawer (pl.hat.<id>)
    const hat = profileDeeds(player).hat;
    if (hat && player.entity) player.entity.set('hat', hat);
    for (const id of s.byCounter.keys()) checkDeeds(game, player, id, true);
    sendDeeds(game, player);
  },

  onLeave(game, player) {
    const s = st(game);
    s.lastPos.delete(player.id);
    s.walkAcc.delete(player.id);
    s.dirty.delete(player);
  },

  loadProfile(game, player, data) {
    player._deeds = data && typeof data === 'object' ? structuredClone(data) : {};
    profileDeeds(player);
    player.counters ||= {};
  },

  saveProfile(game, player) { return profileDeeds(player); },

  handlers: {
    // WP14: wear an unlocked hat cosmetic (d.id, or null to take it off). Hats: Craft and Explore deeds, Moon crown.
    'cosmetic.equip': (game, player, d) => {
      const pd = profileDeeds(player);
      const id = d?.id ?? null;
      if (id !== null) {
        if (typeof id !== 'string' || id.length > 40) return { ok: false, err: 'invalid' };
        const deed = game.content.deeds.find((x) => x.cosmetic === id);
        const isHat = deed ? deed.cosmeticKind === 'hat' : id === 'moon_shard_crown';
        const owned = pd.cosmetics.includes(id) || (id === 'moon_shard_crown' && (player.profile.cosmetics || []).includes(id));
        if (!isHat || !owned) return { ok: false, err: 'locked' };
      }
      pd.hat = id;
      player.entity?.set('hat', id ?? 0);
      sendDeeds(game, player);
      return { ok: true, d: { hat: id } };
    },
  },
};

// Award every newly reached tier of every deed on `counterId` for `player`.
function checkDeeds(game, player, counterId, quiet = false) {
  const s = st(game);
  const list = s.byCounter.get(counterId);
  if (!list) return;
  const d = profileDeeds(player);
  for (const deed of list) {
    const value = deed.world ? (game.world.counters?.[deed.counter] || 0) : (player.counters?.[deed.counter] || 0);
    let reached = 0;
    for (const th of deed.tiers) if (value >= th) reached++;
    const had = d.tiers[deed.id] || 0;
    if (reached <= had) continue;
    d.tiers[deed.id] = reached;
    for (let t = had + 1; t <= reached; t++) {
      game.call('giveItem', player, 'tide_token', deed.reward?.tokensPerTier ?? 1);
      if (t === 3 && !d.cosmetics.includes(deed.cosmetic)) d.cosmetics.push(deed.cosmetic);
    }
    s.dirty.add(player);
    const roman = ['', 'I', 'II', 'III'][reached];
    game.toast(player, `Deed: ${deed.name} ${roman}${reached === 3 ? ' - cosmetic unlocked' : ''} (+${reached - had} Tide Token)`, 'good');
    if (!quiet && player.entity) game.fx(player.entity.realm, 'glint_burst', player.entity.x, player.entity.y - 1, { deed: deed.id, tier: reached });
  }
}

function sendDeeds(game, player) {
  const d = profileDeeds(player);
  const counters = {};
  for (const id of st(game).byCounter.keys()) {
    const deedWorld = game.content.deeds.find((x) => x.counter === id)?.world;
    counters[id] = deedWorld ? (game.world.counters?.[id] || 0) : (player.counters?.[id] || 0);
  }
  game.sendSelf(player, 'deeds', { tiers: d.tiers, counters, cosmetics: d.cosmetics, kills: d.kills, fish: d.fish, relics: d.relics, hat: d.hat ?? null });
}

export { GAUGES };
