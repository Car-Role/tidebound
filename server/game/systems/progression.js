// WP6a: XP grant service, level-up, Rested, Wake bonus (DESIGN 5.2, 9, 22; TECH_SPEC 5.5).
// Also hosts the small WP6 registries every WP6 system shares (effects and proc sources) and a few helpers.
//
// grantXp(player, amount, source): amount * xpMult (capped x2.5, includes the world xpWorld) * night * rested * wake.
//   - night: 1 + nightXp, plus NIGHT_KILL_XP for source 'kill'
//   - rested: +25% while the player has Rested time (earned offline near a Hammock: 30 min per 4 h, cap 2 h)
//   - wake: +100% while more than 5 levels below the party average (partyAverageLevel from WP13)
// Level-up (each level 2..100): full heal, `level_up` fx + toast, player.levelup on the bus (cards queue a draft,
// skills add a point, abilities refill Surge and announce new abilities).

import { xpToNext, xpMultiplier } from '../../../shared/rules/xp.js';
import {
  RESTED_XP, RESTED_MINUTES_PER_4H, RESTED_CAP_MINUTES, WAKE_LEVEL_GAP, WAKE_XP_BONUS, NIGHT_KILL_XP, LEVEL_CAP,
} from '../../../shared/rules/constants.js';

// ---------------------------------------------------------------- shared WP6 helpers

// Registries shared by the WP6 systems. `effects` collects registries.EFFECTS entries per player from cards, skills,
// gear, classes (and anyone else who registers); `procs` collects proc objects per player (procs.js runs them).
export function ensureWp6(game) {
  if (game.wp6) return game.wp6;
  const mk = () => {
    const sources = new Map();
    return {
      sources,
      add(name, fn) { sources.set(name, fn); },
      remove(name) { sources.delete(name); },
      collect(player) {
        const out = [];
        for (const [name, fn] of sources) {
          try {
            const r = fn(player);
            if (Array.isArray(r)) for (const x of r) if (x) out.push(x);
          } catch (err) { console.error(`[tb:wp6] source '${name}' threw:`, err); }
        }
        return out;
      },
    };
  };
  const effects = mk();
  const procSources = mk();
  game.wp6 = { effects, procSources };
  // effects(player) -> [{ id, ...params, src }]
  game.effects = {
    addSource: (name, fn) => effects.add(name, fn),
    of: (player) => (player ? effects.collect(player) : []),
    list: (player, id) => effects.collect(player).filter((e) => e.id === id),
    sum: (player, id, key = 'v') => effects.collect(player).reduce((s, e) => s + (e.id === id ? Number(e[key]) || 0 : 0), 0),
    max: (player, id, key = 'v') => effects.collect(player).reduce((s, e) => (e.id === id ? Math.max(s, Number(e[key]) || 0) : s), 0),
  };
  game.services.register('effects', (player, id) => (id ? game.effects.list(player, id) : game.effects.of(player)));
  return game.wp6;
}

// Player record from a Player, a player entity, or null.
export function asPlayer(game, x) {
  if (!x) return null;
  if (x.token && x.entity !== undefined) return x;
  if (x.type === 'player') return game.players.get(x.id) ?? null;
  return null;
}

// Is a structure of `kind` within r tiles of the player (Calling Shrine, Tempering Forge, Hammock)?
export function nearStructure(game, player, kind, r = 4) {
  const e = player?.entity;
  if (!e) return null;
  const realm = game.realms.get(e.realm);
  if (!realm) return null;
  const kinds = Array.isArray(kind) ? kind : [kind];
  const list = realm.query(e.x, e.y, r + 1.5, [], (s) => s.type === 'structure' && kinds.includes(s.kind));
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - e.x, s.y - e.y) - (s.radius || 1);
    if (d <= r && d < bd) { best = s; bd = d; }
  }
  return best;
}

export const timeInfo = (game) => (game.services.has('timeInfo') ? game.call('timeInfo') : { isNight: false });

// Wall clock for offline (Rested) time only; everything else uses game.now. Tests may override game.wallNow.
const wallNow = (game) => (typeof game.wallNow === 'function' ? game.wallNow() : Date.now());

// ---------------------------------------------------------------- progression

function stateOf(player) {
  return (player.prog ||= { restedS: 0, wake: false, leaveAt: null, nearHammock: false });
}

function partyAverage(game) {
  const v = game.services.has('partyAverageLevel') ? game.call('partyAverageLevel') : null;
  if (Number.isFinite(v)) return v;
  let n = 0, s = 0;
  for (const p of game.players.values()) { n++; s += p.level; }
  return n ? s / n : 1;
}

export function isWake(game, player) {
  if (game.players.size < 2) return false;
  return player.level < partyAverage(game) - WAKE_LEVEL_GAP;
}

function sendXp(game, player) {
  const st = stateOf(player);
  game.sendSelf(player, 'xp', {
    level: player.level, xp: player.xp, next: xpToNext(player.level) || 0,
    rested: Math.round(st.restedS), wake: !!st.wake, cap: player.level >= LEVEL_CAP,
  });
}

// One level gained: heal, fanfare, bus event. Stats are recomputed first so the heal uses the new max HP.
function onLevel(game, player) {
  const e = player.entity;
  e?.set('lv', player.level);
  game.stats.invalidate(player);
  const s = game.stats.of(player);
  if (e && e.hp > 0) { e.maxHp = s.maxHp; e.hp = s.maxHp; }
  if (e) game.fx(e.realm, 'level_up', e.x, e.y, { lv: player.level, id: player.id });
  game.bus.emit('player.levelup', { player, level: player.level });
}

export function grantXp(game, player, amount, source = 'misc') {
  if (!player || !(amount > 0) || !player.entity) return 0;
  const st = stateOf(player);
  const s = game.stats.of(player);
  let mult = xpMultiplier((s.xpMult || 0) + (s.xpWorld || 0));
  if (timeInfo(game).isNight) mult *= 1 + (s.nightXp || 0) + (source === 'kill' ? NIGHT_KILL_XP : 0);
  if (st.restedS > 0) mult *= 1 + RESTED_XP;
  if (st.wake) mult *= 1 + WAKE_XP_BONUS;
  const amt = Math.max(1, Math.round(amount * mult));
  if (player.level < LEVEL_CAP) {
    player.xp += amt;
    let next = xpToNext(player.level);
    while (next > 0 && player.xp >= next && player.level < LEVEL_CAP) {
      player.xp -= next;
      player.level += 1;
      onLevel(game, player);
      next = xpToNext(player.level);
    }
    if (player.level >= LEVEL_CAP) player.xp = 0;
  }
  game.bus.emit('xp.gained', { player, amount: amt, source });
  sendXp(game, player);
  return amt;
}

function refreshWake(game) {
  for (const p of game.players.values()) {
    const st = stateOf(p);
    const w = isWake(game, p);
    if (w === st.wake) continue;
    st.wake = w;
    if (w) {
      game.call('addBuff', p, 'wake', { duration: Infinity, mods: [] });
      game.toast(p, 'Wake bonus: +100% XP while you catch up', 'good');
    } else game.call('removeBuff', p, 'wake');
    sendXp(game, p);
  }
}

export default {
  name: 'progression',

  init(game) {
    ensureWp6(game);
    game.services.register('grantXp', (player, amount, source) => grantXp(game, player, amount, source));
    game.bus.on('player.join', () => refreshWake(game));
    game.bus.on('player.leave', () => refreshWake(game));
    game.bus.on('player.levelup', () => refreshWake(game));
  },

  slowTick(game) {
    for (const p of game.players.values()) {
      const st = stateOf(p);
      if (st.restedS > 0) {
        st.restedS = Math.max(0, st.restedS - 1);
        if (st.restedS === 0) { game.call('removeBuff', p, 'rested'); sendXp(game, p); game.toast(p, 'Rested bonus used up', 'info'); }
      }
    }
    if (game.tickCount % 100 < 20) refreshWake(game);   // about every 5 s
  },

  onJoin(game, player) {
    const st = stateOf(player);
    if (st.leaveAt && st.nearHammock) {
      const hours = Math.max(0, (wallNow(game) - st.leaveAt) / 3600000);
      const gained = (hours / 4) * RESTED_MINUTES_PER_4H * 60;
      st.restedS = Math.min(RESTED_CAP_MINUTES * 60, st.restedS + gained);
      if (gained >= 60) game.toast(player, `Well rested: +25% XP for ${Math.round(st.restedS / 60)} min`, 'good');
    }
    st.leaveAt = null;
    st.nearHammock = false;
    if (st.restedS > 0) game.call('addBuff', player, 'rested', { duration: st.restedS, mods: [] });
    player.entity?.set('lv', player.level);
    sendXp(game, player);
  },

  onLeave(game, player) {
    const st = stateOf(player);
    st.leaveAt = wallNow(game);
    st.nearHammock = !!nearStructure(game, player, 'hammock', 4);
  },

  saveProfile(game, player) {
    const st = stateOf(player);
    return { restedS: Math.round(st.restedS), leaveAt: st.leaveAt, nearHammock: !!st.nearHammock };
  },

  loadProfile(game, player, data) {
    const st = stateOf(player);
    if (data && typeof data === 'object') {
      st.restedS = Math.max(0, Math.min(RESTED_CAP_MINUTES * 60, Number(data.restedS) || 0));
      st.leaveAt = Number.isFinite(data.leaveAt) ? data.leaveAt : null;
      st.nearHammock = !!data.nearHammock;
    }
  },
};
