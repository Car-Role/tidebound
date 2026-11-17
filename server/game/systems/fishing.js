// WP9 fishing: cast with a rod onto water within 6 tiles, bite after rand(4..10) s * biteMult, set the hook within the
// bite window, then a server-authoritative reel minigame (hold to reel, release to slack; keep the marker in the moving
// green zone until the catch meter fills, 2-6 s by rarity). 30 fish with conditions; rod tier gates fish tier.
// Pity: a rare is guaranteed by the 20th cast made while its condition holds, a legendary by the 60th (per player per
// fish, reset on the catch) (DESIGN 14.2, CRITIQUE N2). Service rollFish (TECH_SPEC 5.5).

import { isInt } from '../../../shared/protocol.js';
import { BIOME_TIER } from '../../../shared/grid.js';
import { createEntity } from '../entities.js';
import { toolFor, gearInSlot, effectsOf, itemDef } from './inventory.js';

export const CAST_RANGE = 6;
const BITE_MIN = 4, BITE_MAX = 10;
const BITE_WINDOW = 1.4;
const LEASH = 1.6;                    // moving this far from the cast spot snaps the line
const MAX_REEL_S = 45;
export const PITY = Object.freeze({ rare: 20, legendary: 60 });
export const CATCH_TIME = Object.freeze({ common: 2, uncommon: 3, rare: 4.5, legendary: 6 });
const SEND_HZ = 10;

// Marker physics shared with the client panel (keep in sync with client/ui/panels/fishing.js).
export const REEL = Object.freeze({ up: 4.6, down: 3.6, damp: 2.2, start: 0.3, drain: 0.32 });

export function zoneParams(rng, difficulty) {
  const zw = 0.3 - 0.14 * difficulty;
  return {
    zw: +zw.toFixed(4),
    A: +(0.5 - zw / 2 - 0.02).toFixed(4),
    w1: +(0.8 + 2.0 * difficulty).toFixed(4), w2: +(1.6 + 2.6 * difficulty).toFixed(4),
    p1: +rng.float(0, 6.283).toFixed(4), p2: +rng.float(0, 6.283).toFixed(4),
  };
}
export const zoneAt = (z, t) => 0.5 + z.A * (0.62 * Math.sin(z.w1 * t + z.p1) + 0.38 * Math.sin(z.w2 * t + z.p2));

// One fixed physics step of the reel minigame (dt seconds). Mutates g = { m, v, meter, t }.
export function reelStep(g, z, hold, dt, catchT) {
  g.v += (hold ? REEL.up : -REEL.down) * dt;
  g.v -= g.v * Math.min(1, REEL.damp * dt);
  g.m += g.v * dt;
  if (g.m < 0) { g.m = 0; g.v = Math.max(0, g.v) * 0; }
  if (g.m > 1) { g.m = 1; g.v = Math.min(0, g.v); }
  g.t += dt;
  const c = zoneAt(z, g.t);
  const inside = Math.abs(g.m - c) <= z.zw / 2;
  g.meter += inside ? dt / catchT : -REEL.drain * dt;
  g.meter = Math.max(0, Math.min(1, g.meter));
  return inside;
}

function timeInfo(game, x, y) { return (Number.isFinite(x) ? game.call('timeInfo', x, y) : game.call('timeInfo')) || {}; }

function isNoon(game, ti) {
  if (ti.noon != null) return !!ti.noon;
  if (ti.phase && ti.phase !== 'day') return false;
  const t = game.worldState?.clock?.t;
  if (!Number.isFinite(t)) return false;
  const s = t <= 1 ? t * 1440 : t % 1440;     // seconds into the 24-minute day (dawn 0-120, day 120-840)
  return s >= 420 && s <= 540;
}

export function condHolds(game, cond, x, y) {
  if (!cond) return true;
  const ti = timeInfo(game, x, y);
  if (cond.phase && ti.phase !== cond.phase) return false;
  if (cond.tide === 'low' && !ti.lowTide) return false;
  if (cond.time === 'noon' && !isNoon(game, ti)) return false;
  if (cond.weather) {
    if (cond.weather === 'king_tide') {
      if (!(ti.weather === 'king_tide' || ti.kingTide || game.worldState?.clock?.kingTide || ti.overlay === 'king_tide')) return false;
    } else if (ti.weather !== cond.weather) return false;
  }
  return true;
}

const rodForFishTier = (game, tier) => game.content.modules.fish?.ROD_FOR_FISH_TIER?.[tier] ?? 1;

// Candidate fish for a biome and rod tier: [{ def, w }].
function candidates(game, biome, { commonOnly = false, rodTier = 4, luck = 0, rareBonus = 0, perFish = {}, x, y } = {}) {
  const out = [];
  for (const f of game.content.fish) {
    if (f.biome !== biome) continue;
    if (rodForFishTier(game, f.tier) > rodTier) continue;
    if (commonOnly && f.rarity !== 'common') continue;
    if (f.cond && !condHolds(game, f.cond, x, y)) continue;
    let w = f.weight;
    if (f.rarity === 'rare' || f.rarity === 'legendary') w *= (1 + rareBonus) * (1 + 0.005 * Math.max(0, luck));
    if (perFish[f.id]) w *= 1 + perFish[f.id];
    out.push({ def: f, w });
  }
  return out;
}

export function rollFishWith(game, biome, opts = {}, rand = () => game.rng.float(0, 1)) {
  const list = candidates(game, biome, opts);
  if (!list.length) return null;
  let total = 0;
  for (const c of list) total += c.w;
  let r = rand() * total;
  for (const c of list) { r -= c.w; if (r < 0) return c.def.id; }
  return list[list.length - 1].def.id;
}

function rodOf(game, player) {
  const d = toolFor(game, player, 'rod', null);
  if (!d) return null;
  return { id: d.id, tier: d.gear?.tier ?? 1, equipped: gearInSlot(game, player, 'rod') === d.id, def: d };
}

function fishMods(game, player) {
  let rare = 0; const perFish = {};
  for (const e of effectsOf(game, player)) {
    if (e.id === 'rare_fish') rare += e.v ?? 0;
    if (e.id === 'rod_rare_fish' && e.item) perFish[e.item] = (perFish[e.item] || 0) + (e.v ?? 0);
  }
  return { rare, perFish };
}

function sendState(game, player, extra = {}) {
  const f = player.fishing;
  if (!f) { game.sendSelf(player, 'fish', { st: 'idle', ...extra }); return; }
  const base = { st: f.st, id: f.bobber?.id ?? 0, at: +game.now.toFixed(3), tx: f.tx, ty: f.ty };
  if (f.st === 'reel') Object.assign(base, { z: f.z, m: +f.g.m.toFixed(4), v: +f.g.v.toFixed(4), meter: +f.g.meter.toFixed(4), t: +f.g.t.toFixed(3), catchT: f.catchT, hold: !!f.hold });
  if (f.st === 'bite') base.window = BITE_WINDOW;
  game.sendSelf(player, 'fish', { ...base, ...extra });
}

function endFishing(game, player, result, extra = {}) {
  const f = player.fishing;
  if (f?.bobber && !f.bobber.removed) game.realms.get(f.bobber.realm)?.remove(f.bobber);
  player.fishing = null;
  if (player.entity?.pub.a === 'fish') player.entity.set('a', 'idle');
  game.sendSelf(player, 'fish', { st: result, at: +game.now.toFixed(3), ...extra });
}

function catchFish(game, player) {
  const f = player.fishing;
  const fish = game.content.fish.byId[f.fish];
  const realm = game.realms.get(f.bobber.realm);
  game.fx(realm, 'fish_splash', f.bobber.x, f.bobber.y, { catch: 1, item: fish.id, to: player.id });
  game.call('giveItem', player, fish.id, 1);
  game.call('grantXp', player, Math.max(1, Math.ceil(fish.value * 0.5)), 'fish');
  player.fishPity ||= {};
  player.fishPity[fish.id] = 0;
  player.fishLog ||= {};
  player.fishLog[fish.id] = (player.fishLog[fish.id] || 0) + 1;
  game.sendSelf(player, 'fishlog', player.fishLog);
  game.bus.emit('fish.caught', { player, fish: fish.id, rarity: fish.rarity });
  endFishing(game, player, 'caught', { fish: fish.id, rarity: fish.rarity });
}

export default {
  name: 'fishing',

  init(game) {
    game.services.register('rollFish', (biome, opts = {}) => rollFishWith(game, biome, { rodTier: opts.rodTier ?? 4, luck: opts.luck ?? 0, commonOnly: !!opts.commonOnly }));
    game.bus.on('player.hurt', ({ player }) => {
      if (player?.fishing && player.fishing.st === 'reel') { /* a hit jerks the line: lose some progress */ player.fishing.g.meter = Math.max(0, player.fishing.g.meter - 0.15); }
    });
  },

  onJoin(game, player) {
    player.fishing = null;
    game.sendSelf(player, 'fish', { st: 'idle' });
    game.sendSelf(player, 'fishlog', player.fishLog || {});
  },

  onLeave(game, player) {
    if (player.fishing?.bobber && !player.fishing.bobber.removed) game.realms.get(player.fishing.bobber.realm)?.remove(player.fishing.bobber);
    player.fishing = null;
  },

  tick(game, dt) {
    for (const player of game.players.values()) {
      const f = player.fishing;
      if (!f) continue;
      const pe = player.entity;
      if (!pe || pe.realm !== f.bobber.realm || Math.hypot(pe.x - f.px, pe.y - f.py) > LEASH || pe.state === 5 || pe.state === 4) {
        endFishing(game, player, 'snap');
        continue;
      }
      if (f.st === 'wait') {
        if (game.now >= f.biteAt) {
          f.st = 'bite'; f.biteEnd = game.now + BITE_WINDOW;
          f.bobber.set('b', 1);
          game.fx(game.realms.get(f.bobber.realm), 'water_ripple', f.bobber.x, f.bobber.y, { bite: 1 });
          game.fx(game.realms.get(f.bobber.realm), 'fish_bite', f.bobber.x, f.bobber.y);
          sendState(game, player);
        }
      } else if (f.st === 'bite') {
        if (game.now >= f.biteEnd) endFishing(game, player, 'missed');
      } else if (f.st === 'reel') {
        reelStep(f.g, f.z, f.hold, dt, f.catchT);
        if (f.g.meter >= 1) { catchFish(game, player); continue; }
        if (f.g.meter <= 0 || f.g.t > MAX_REEL_S) {
          game.fx(game.realms.get(f.bobber.realm), 'fish_splash', f.bobber.x, f.bobber.y, { lost: 1 });
          endFishing(game, player, 'lost', { rarity: game.content.fish.byId[f.fish]?.rarity });
          continue;
        }
        f.sendAcc = (f.sendAcc || 0) + dt;
        if (f.sendAcc >= 1 / SEND_HZ - 1e-9) { f.sendAcc = 0; sendState(game, player); }
      }
    }
  },

  handlers: {
    'fish.cast': (game, player, d) => {
      if (!isInt(d.tx, 0, 1e5) || !isInt(d.ty, 0, 1e5)) return { ok: false, err: 'invalid' };
      if (player.fishing) return { ok: false, err: 'busy' };
      const pe = player.entity;
      const realm = game.realms.get(pe.realm);
      if (!realm || realm.kind !== 'overworld') return { ok: false, err: 'denied' };
      const rod = rodOf(game, player);
      if (!rod) { game.toast(player, 'You need a rod. Craft a Reed Rod at the Workbench.', 'warn'); return { ok: false, err: 'locked' }; }
      const g = realm.groundAt(d.tx, d.ty);
      if (g !== 0 && g !== 1) return { ok: false, err: 'invalid' };
      const bx = d.tx + 0.5, by = d.ty + 0.5;
      if (Math.hypot(bx - pe.x, by - pe.y) > CAST_RANGE + 0.5) return { ok: false, err: 'range' };
      const feat = game.call('featureAt', realm, bx, by);
      const biome = feat?.biome ?? 'greenmarrow';
      const s = game.stats.of(player);
      const luck = (s.luck ?? 0) + (s.luckWorld ?? 0);
      const mods = fishMods(game, player);
      const opts = { rodTier: rod.tier, luck, rareBonus: mods.rare, perFish: mods.perFish, x: bx, y: by };
      if (!candidates(game, biome, opts).length) {
        const need = rodForFishTier(game, BIOME_TIER[biome] ?? 1);
        const rodName = itemDef(game, 'rod_' + need)?.name ?? 'a better rod';
        game.toast(player, `These waters need ${rodName}.`, 'warn');
        return { ok: false, err: 'locked' };
      }
      // pity: count this cast for every conditional fish whose condition holds right now
      player.fishPity ||= {};
      for (const f of game.content.fish) {
        if (f.biome !== biome || !f.cond || rodForFishTier(game, f.tier) > rod.tier) continue;
        if (condHolds(game, f.cond, bx, by)) player.fishPity[f.id] = (player.fishPity[f.id] || 0) + 1;
      }
      let fish = null;
      const pityList = game.content.fish.filter((f) => f.biome === biome && f.cond && rodForFishTier(game, f.tier) <= rod.tier && condHolds(game, f.cond, bx, by));
      for (const rarity of ['legendary', 'rare']) {
        const due = pityList.find((f) => f.rarity === rarity && (player.fishPity[f.id] || 0) >= PITY[rarity]);
        if (due) { fish = due.id; break; }
      }
      if (!fish) fish = rollFishWith(game, biome, opts);
      // bite time: rand(4..10) * biteMult; a carried (unequipped) rod still gives its bite bonus
      let bite = s.fishBite ?? 0;
      if (!rod.equipped) for (const m of rod.def.mods ?? []) if (m.stat === 'fishBite') bite += m.v;
      bite += s.fishBiteWorld ?? 0;
      const biteMult = Math.max(0.2, 1 + bite);
      const wait = game.rng.float(BITE_MIN, BITE_MAX) * biteMult;
      const bobber = createEntity(game, { type: 'zone', kind: 'bobber', x: bx, y: by, radius: 0.2, data: { owner: player.id }, pub: { own: player.id, b: 0, r: 0, t: 0 } });
      realm.add(bobber);
      player.fishing = { st: 'wait', bobber, fish, biteAt: game.now + wait, px: pe.x, py: pe.y, tx: d.tx, ty: d.ty, hold: false, biome };
      pe.facing = ((Math.round(Math.atan2(by - pe.y, bx - pe.x) / (Math.PI / 4)) % 8) + 8) % 8;
      pe.set('a', 'fish');
      game.fx(realm, 'fish_cast', pe.x, pe.y, { tx: bx, ty: by });
      game.fx(realm, 'water_ripple', bx, by);
      sendState(game, player);
      return { ok: true };
    },

    'fish.reel': (game, player, d) => {
      const f = player.fishing;
      if (!f) return { ok: false, err: 'invalid' };
      const hold = d.hold !== false;
      if (f.st === 'wait') {
        if (!hold) return { ok: true };
        endFishing(game, player, 'early');
        return { ok: true, d: { early: true } };
      }
      if (f.st === 'bite') {
        if (!hold) return { ok: true };
        const def = game.content.fish.byId[f.fish];
        const rng = (game._fishRng ||= game.rng.fork('fishing'));
        f.st = 'reel';
        f.z = zoneParams(rng, def?.difficulty ?? 0.3);
        f.catchT = CATCH_TIME[def?.rarity] ?? 2;
        f.g = { m: 0.15, v: 0, meter: REEL.start, t: 0 };
        f.hold = true;
        f.bobber.set('b', 2);
        game.fx(game.realms.get(f.bobber.realm), 'fish_splash', f.bobber.x, f.bobber.y, { hook: 1 });
        sendState(game, player);
        return { ok: true };
      }
      if (f.st === 'reel') { f.hold = hold; return { ok: true }; }
      return { ok: false, err: 'invalid' };
    },

    'fish.cancel': (game, player) => {
      if (!player.fishing) return { ok: false, err: 'invalid' };
      endFishing(game, player, 'idle');
      return { ok: true };
    },
  },

  saveProfile(game, player) {
    return { pity: player.fishPity || {}, log: player.fishLog || {} };
  },
  loadProfile(game, player, data) {
    player.fishPity = data?.pity && typeof data.pity === 'object' ? { ...data.pity } : {};
    player.fishLog = data?.log && typeof data.log === 'object' ? { ...data.log } : {};
  },
};
