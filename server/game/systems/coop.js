// WP13: co-op (DESIGN 22, TECH_SPEC 5.5 Co-op). Bound players, coopScale, host, kick / unbind, spend caps, chat,
// pings, the party roster, per-profile prefs (`settings.set`).
//
// Bound rule: a profile is bound when it has >= BOUND_MINUTES of playtime inside the last WINDOW_MINUTES of WORLD
// playtime (max 8). S is recomputed once per hour of world playtime; a change is announced one hour before it
// applies. coopScale = 1 + 0.7 * (S - 1). Costs already paid are never re-charged.
//
// world.coop  = { S, scale, pending:{S, inS}|null, bound:[{uid,name,online}], players:[{id,uid,name,color,host,bound}],
//                 worldName, playtimeS, caps:{uid: glintPerDay} }
// world.party = [{ id, uid, name, color, class, level, hp, mh, realm, x, y }] at 2 Hz
// self.prefs  = { key: value }  (per-profile, server side; settings.set)
// chat        = { t:'chat', from, text, color, sys?, ping?:{x,y,kind,realm} }
//
// Host = loopback connection, or the token given with --admin. Host tools: coop.kick/unbind/spendcap and the chat
// commands /kick <name>, /unbind <name>, /spendcap <name> <glint>, /who, /help.
//
// Spend caps: this system wraps the registered `spendGlint` service in load() (after every system's init), so
// non-land spends above the per-player daily cap fail, and non-land spends above 2,000 x highest biome tier are
// written to chat (DESIGN 15).

import { MAX_PLAYERS } from '../../../shared/config.js';
import { PING_KINDS, validatePingMark, sanitizeText, sanitizeName } from '../../../shared/protocol.js';
import { BIOME_TIER } from '../../../shared/grid.js';
import { coopScale as scaleFor } from '../../../shared/rules/costs.js';
import { MAX_BOUND, SPEND_ANNOUNCE_PER_TIER } from '../../../shared/rules/constants.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);

export const BOUND_MINUTES = 30;
export const WINDOW_MINUTES = 600;          // 10 hours of world playtime
export const RECOMPUTE_S = 3600;            // once per hour of world playtime
export const CHAT_MAX = 160;
export const CHAT_BURST = 5;                // messages per CHAT_WINDOW_S
export const CHAT_WINDOW_S = 8;
export const CHAT_MIN_GAP_S = 0.35;
export const PING_COOLDOWN_S = 0.75;
export const PARTY_HZ = 2;
const PREF_KEY = /^[a-z][A-Za-z0-9_.]{0,23}$/;
const MAX_PREFS = 48;
const PING_TEXT = { need: 'needs this', danger: 'danger!', look: 'look here', omw: 'on my way' };

// ------------------------------------------------------------------ helpers

function coopData(profile) {
  const sys = (profile.sys ||= {});
  const c = (sys.coop ||= {});
  c.prefs ||= {};
  return c;
}

function uidOf(game, token) {
  const s = st(game);
  let uid = s.uids.get(token);
  if (uid) return uid;
  const prof = game.profiles.get(token);
  uid = prof ? coopData(prof).uid : null;
  if (!uid) {
    uid = 'u' + (s.uidRng.next() * 0xffffffff >>> 0).toString(36);
    if (prof) coopData(prof).uid = uid;
  }
  s.uids.set(token, uid);
  return uid;
}

function tokenOfUid(game, uid) {
  for (const [tok] of game.profiles) if (uidOf(game, tok) === uid) return tok;
  for (const p of game.players.values()) if (uidOf(game, p.token) === uid) return p.token;
  return null;
}

export function isHost(game, player) {
  return !!player && (!!player.conn?.loopback || (!!game.opts.adminToken && player.token === game.opts.adminToken));
}

function sysChat(game, text, filter = null) {
  game.broadcast({ t: 'chat', from: '', text: sanitizeText(text, 200), color: -1, sys: 1 }, filter);
}

function findPlayerByName(game, name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  const list = [...game.players.values()];
  return list.find((p) => p.name.toLowerCase() === n) ?? list.find((p) => p.name.toLowerCase().startsWith(n)) ?? null;
}
function findTokenByName(game, name) {
  const p = findPlayerByName(game, name);
  if (p) return p.token;
  const n = String(name || '').toLowerCase();
  for (const [tok, prof] of game.profiles) if (prof.name?.toLowerCase() === n) return tok;
  return null;
}

// Resolve a {id} target: online player id (number) or profile uid (string).
function resolveTarget(game, id) {
  if (Number.isInteger(id)) { const p = game.players.get(id); return p ? { token: p.token, player: p } : null; }
  if (typeof id === 'string' && id.length <= 16) { const tok = tokenOfUid(game, id); return tok ? { token: tok, player: [...game.players.values()].find((p) => p.token === tok) ?? null } : null; }
  return null;
}

// ------------------------------------------------------------------ bound players and S
// WP14 (BUILD_REVIEW P0-5): crew size S = |bound profiles UNION connected players| (1..8). Connected players count
// the moment they join, so a new crew never pays solo prices and S can never sit below the number of players online.
// The hourly, announced recompute still governs the bound list (people who stopped playing drop out an hour after
// the notice). /unbind refuses online players and has a cooldown of UNBIND_COOLDOWN_S of world playtime.
export const UNBIND_COOLDOWN_S = 6 * 3600;
export function crewTokens(game) {
  const set = new Set(game.world.bound || []);
  for (const p of game.players.values()) if (p.token) set.add(p.token);
  return [...set].slice(0, MAX_BOUND);
}
export const crewSize = (game) => Math.max(1, crewTokens(game).length);

function refreshS(game, why = '') {
  const s = st(game);
  if (!s?.data) return;
  const prevS = s.data.S;
  const S = crewSize(game);
  s.data.S = S;
  if (S !== prevS) {
    game.stats.invalidateWorld();
    game.bus.emit('coop.changed', { S, scale: scaleFor(S) });
    sysChat(game, `Crew size is now ${S} (costs x${scaleFor(S).toFixed(1)}).${why ? ' ' + why : ''}`);
    try { game.sendWorld('landNext', game.call('landCostNext')); } catch { /* WP7 */ }
  }
}

function minutesOf(game, token) {
  const s = st(game);
  let m = s.data.minutes[token];
  if (!m) { m = []; s.data.minutes[token] = m; }
  return m;
}

// Candidate S from the activity window right now.
export function candidateBound(game) {
  const s = st(game);
  const nowMin = Math.floor(game.playtimeS / 60);
  const out = [];
  for (const [tok, mins] of Object.entries(s.data.minutes)) {
    const recent = mins.filter((m) => m > nowMin - WINDOW_MINUTES).length;
    if (recent >= BOUND_MINUTES) out.push({ tok, recent });
  }
  out.sort((a, b) => b.recent - a.recent);
  return out.slice(0, MAX_BOUND).map((x) => x.tok);
}

function applyBound(game, tokens, why = '') {
  const s = st(game);
  const prevS = s.data.S;
  game.world.bound = tokens.slice(0, MAX_BOUND);
  const S = crewSize(game);
  s.data.S = S;
  if (S !== prevS) {
    game.stats.invalidateWorld();
    game.bus.emit('coop.changed', { S, scale: scaleFor(S) });
    sysChat(game, `Crew size is now ${S} (costs x${scaleFor(S).toFixed(1)}).${why ? ' ' + why : ''}`);
    try { game.sendWorld('landNext', game.call('landCostNext')); } catch { /* WP7 */ }
  }
  publishCoop(game);
}

function hourly(game) {
  const s = st(game);
  const d = s.data;
  if (d.pending && game.playtimeS >= d.pending.at) {
    const p = d.pending;
    d.pending = null;
    applyBound(game, p.tokens, 'As announced an hour ago.');
  }
  const cand = candidateBound(game);
  const curS = crewSize(game);
  const candS = Math.max(1, new Set([...cand, ...[...game.players.values()].map((p) => p.token)]).size);
  const same = cand.length === (game.world.bound || []).length && cand.every((t) => game.world.bound.includes(t));
  if (!same && !d.pending) {
    if (candS === curS) applyBound(game, cand);            // membership swap, same S: no cost change to announce
    else {
      d.pending = { tokens: cand, S: candS, at: game.playtimeS + RECOMPUTE_S };
      sysChat(game, `Heads up: in one hour the crew size changes from ${curS} to ${candS} (costs x${scaleFor(curS).toFixed(1)} -> x${scaleFor(candS).toFixed(1)}).`);
      publishCoop(game);
    }
  }
}

function publishCoop(game) {
  const s = st(game);
  const d = s.data;
  const bound = (game.world.bound || []).map((tok) => ({
    uid: uidOf(game, tok), name: [...game.players.values()].find((p) => p.token === tok)?.name ?? game.profiles.get(tok)?.name ?? '?',
    online: [...game.players.values()].some((p) => p.token === tok),
  }));
  const players = [...game.players.values()].map((p) => ({
    id: p.id, uid: uidOf(game, p.token), name: p.name, color: p.color, host: isHost(game, p), bound: (game.world.bound || []).includes(p.token),
    minutes: minutesOf(game, p.token).filter((m) => m > Math.floor(game.playtimeS / 60) - WINDOW_MINUTES).length,
  }));
  const caps = {};
  for (const [tok, cap] of Object.entries(d.caps)) caps[uidOf(game, tok)] = cap;
  const S = crewSize(game);
  const view = {
    S, scale: +scaleFor(S).toFixed(2), bound, players, caps, max: MAX_PLAYERS,
    pending: d.pending ? { S: d.pending.S, inS: Math.max(0, Math.round(d.pending.at - game.playtimeS)) } : null,
    worldName: game.opts.worldName, playtimeS: Math.round(game.playtimeS), boundMinutes: BOUND_MINUTES,
  };
  const json = JSON.stringify(view);
  if (json !== s.coopJson) { s.coopJson = json; game.sendWorld('coop', view); }
}

function publishParty(game) {
  const party = [];
  for (const p of game.players.values()) {
    const e = p.entity;
    if (!e) continue;
    party.push({
      id: p.id, uid: uidOf(game, p.token), name: p.name, color: p.color, class: p.selfState?.class?.id ?? e.pub.cl ?? 0,
      level: p.level, hp: Math.ceil(e.hp), mh: Math.ceil(e.maxHp), realm: e.realm, x: +e.x.toFixed(1), y: +e.y.toFixed(1),
      st: e.state, host: isHost(game, p),
    });
  }
  const json = JSON.stringify(party);
  const s = st(game);
  if (json !== s.partyJson) { s.partyJson = json; game.sendWorld('party', party); }
}

// ------------------------------------------------------------------ spend caps

function highestTier(game) {
  let k = 1;
  for (const p of game.world.plots) if (p.owned) k = Math.max(k, BIOME_TIER[p.biome] ?? 1);
  return k;
}
const isLandSpend = (source) => typeof source === 'string' && /^(land|raise|ballast)/.test(source);

function today(game) {
  try { return game.call('timeInfo')?.day ?? game.world.day ?? 1; } catch { return game.world.day ?? 1; }
}

export function spendAllowed(game, player, amount, source) {
  if (!player || isLandSpend(source)) return true;
  const s = st(game);
  const cap = s.data.caps[player.token];
  if (!(cap >= 0) || cap === null) return true;
  const day = today(game);
  const rec = s.data.spent[player.token];
  const spent = rec && rec.day === day ? rec.n : 0;
  return spent + amount <= cap;
}

function recordSpend(game, player, amount, source) {
  if (!player || isLandSpend(source)) return;
  const s = st(game);
  const day = today(game);
  const rec = s.data.spent[player.token];
  if (!rec || rec.day !== day) s.data.spent[player.token] = { day, n: amount };
  else rec.n += amount;
  if (amount > SPEND_ANNOUNCE_PER_TIER * highestTier(game)) {
    sysChat(game, `${player.name} spent ${Math.round(amount).toLocaleString('en-US')} Glint on ${String(source || 'something').replace(/[^a-z0-9 _-]/gi, '')}.`);
  }
}

function wrapSpend(game) {
  const s = st(game);
  const inner = game.services.get('spendGlint');
  if (!inner || inner.__coopWrapped) return;
  const wrapped = (amount, source, player) => {
    if (!spendAllowed(game, player, amount, source)) {
      if (player) game.toast(player, 'Your daily spend cap (set by the host) is reached.', 'warn');
      return false;
    }
    const ok = inner(amount, source, player);
    if (ok) recordSpend(game, player, amount, source);
    return ok;
  };
  wrapped.__coopWrapped = true;
  const prev = game.services.currentSystem;
  game.services.currentSystem = 'coop';
  game.services.register('spendGlint', wrapped);
  game.services.currentSystem = prev;
  s.wrapped = true;
}

// ------------------------------------------------------------------ chat

function chatAllowed(game, player) {
  const s = st(game);
  let r = s.rate.get(player.id);
  if (!r) { r = { times: [] }; s.rate.set(player.id, r); }
  const now = game.now;
  r.times = r.times.filter((t) => now - t < CHAT_WINDOW_S);
  if (r.times.length >= CHAT_BURST) return false;
  if (r.times.length && now - r.times[r.times.length - 1] < CHAT_MIN_GAP_S) return false;
  r.times.push(now);
  return true;
}

function command(game, player, text) {
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  const reply = (t) => player.conn?.send({ t: 'chat', from: '', text: t, color: -1, sys: 1 });
  const host = isHost(game, player);
  switch ((cmd || '').toLowerCase()) {
    case 'help':
      reply('Commands: /who, /help' + (host ? ', /kick <name>, /unbind <name>, /spendcap <name> <glint|off>' : '') + '. Hold T to ping.');
      return { ok: true };
    case 'who': {
      const d = st(game).data;
      reply(`Online: ${[...game.players.values()].map((p) => p.name + (isHost(game, p) ? ' (host)' : '')).join(', ')}. Crew size ${d.S}.`);
      return { ok: true };
    }
    case 'kick': case 'unbind': {
      if (!host) { reply('Only the host can do that.'); return { ok: false, err: 'denied' }; }
      const tok = cmd.toLowerCase() === 'kick' ? findPlayerByName(game, args.join(' '))?.token : findTokenByName(game, args.join(' '));
      if (!tok) { reply(`No player named "${args.join(' ')}".`); return { ok: false, err: 'invalid' }; }
      if (cmd.toLowerCase() === 'kick') return kick(game, player, tok);
      const r = unbind(game, player, tok);
      if (!r.ok && r.msg) reply(r.msg);
      return r;
    }
    case 'spendcap': {
      if (!host) { reply('Only the host can do that.'); return { ok: false, err: 'denied' }; }
      const amt = args.pop();
      const tok = findTokenByName(game, args.join(' '));
      if (!tok) { reply(`No player named "${args.join(' ')}".`); return { ok: false, err: 'invalid' }; }
      const v = amt === 'off' || amt === 'none' ? null : Number(amt);
      return setCap(game, player, tok, v);
    }
    default:
      reply(`Unknown command /${cmd}. Try /help.`);
      return { ok: false, err: 'invalid' };
  }
}

// ------------------------------------------------------------------ host tools

function kick(game, host, token) {
  const target = [...game.players.values()].find((p) => p.token === token);
  if (!target) return { ok: false, err: 'invalid' };
  if (target === host || isHost(game, target)) return { ok: false, err: 'denied' };
  const conn = target.conn;
  conn?.send({ t: 'kicked', reason: 'kicked' });
  game.leave(target);
  conn?.close?.(4003, 'kicked');
  sysChat(game, `${target.name} was removed by the host.`);
  return { ok: true, d: { name: target.name } };
}

function unbind(game, host, token) {
  const s = st(game);
  const online = [...game.players.values()].find((p) => p.token === token);
  const name = online?.name ?? game.profiles.get(token)?.name ?? '?';
  // WP14 (P0-5): an online player always counts; unbinding is for people who stopped playing, with a cooldown.
  if (online) return { ok: false, err: 'denied', msg: `${name} is online and counts toward the crew.` };
  if (s.data.lastUnbindAt != null && game.playtimeS - s.data.lastUnbindAt < UNBIND_COOLDOWN_S) {
    return { ok: false, err: 'cooldown', msg: `Unbind again in ${Math.ceil((UNBIND_COOLDOWN_S - (game.playtimeS - s.data.lastUnbindAt)) / 60)} min.` };
  }
  s.data.lastUnbindAt = game.playtimeS;
  s.data.minutes[token] = [];
  if (s.data.pending) s.data.pending.tokens = s.data.pending.tokens.filter((t) => t !== token);
  const was = (game.world.bound || []).includes(token);
  applyBound(game, (game.world.bound || []).filter((t) => t !== token), was ? `${name} was unbound by the host.` : '');
  if (!was) sysChat(game, `${name}'s crew time was reset by the host.`);
  return { ok: true, d: { name } };
}

function setCap(game, host, token, glint) {
  const s = st(game);
  const name = [...game.players.values()].find((p) => p.token === token)?.name ?? game.profiles.get(token)?.name ?? '?';
  if (glint == null || glint < 0 || !Number.isFinite(glint)) {
    delete s.data.caps[token];
    sysChat(game, `${name} has no spend cap.`);
  } else {
    s.data.caps[token] = Math.min(1e12, Math.floor(glint));
    sysChat(game, `${name} may spend at most ${s.data.caps[token].toLocaleString('en-US')} Glint per day.`);
  }
  publishCoop(game);
  return { ok: true, d: { name, cap: s.data.caps[token] ?? null } };
}

const hostOnly = (fn) => (game, player, d) => {
  if (!isHost(game, player)) return { ok: false, err: 'denied' };
  const t = resolveTarget(game, d?.id);
  if (!t) return { ok: false, err: 'invalid' };
  const r = fn(game, player, t.token, d);
  if (r && !r.ok && r.msg) { game.toast(player, r.msg, 'warn'); delete r.msg; }
  return r;
};

// ------------------------------------------------------------------ system

export default {
  name: 'coop',

  init(game) {
    ST.set(game, {
      data: { minutes: {}, S: 1, pending: null, caps: {}, spent: {}, lastMinute: 0, lastHour: 0 },
      uids: new Map(), uidRng: game.rng.fork('coop-uid'), rate: new Map(), pingAt: new Map(),
      coopJson: '', partyJson: '', partyAcc: 0, wrapped: false,
    });
    const reg = (name, fn) => game.services.register(name, fn);
    reg('coopScale', () => scaleFor(crewSize(game)));
    reg('boundCount', () => crewSize(game));
    reg('partyAverageLevel', () => {
      let n = 0, sum = 0;
      for (const p of game.players.values()) { n++; sum += p.level; }
      return n ? sum / n : 1;
    });
    reg('isHost', (player) => isHost(game, player));
    // Extra (not in 5.5): spendAllowed(player, amount, source) -> boolean, for packages that pre-check a spend.
    reg('spendAllowed', (player, amount, source) => spendAllowed(game, player, amount, source));
  },

  load(game, data) {
    const s = st(game);
    const d = data && typeof data === 'object' ? structuredClone(data) : {};
    d.minutes ||= {};
    d.caps ||= {};
    d.spent ||= {};
    d.pending ||= null;
    d.lastMinute = Math.floor(game.playtimeS / 60);
    d.lastHour = Math.floor(game.playtimeS / RECOMPUTE_S);
    game.world.bound = Array.isArray(game.world.bound) ? game.world.bound.slice(0, MAX_BOUND) : [];
    d.lastUnbindAt ??= null;
    s.data = d;
    d.S = crewSize(game);
    wrapSpend(game);
    publishCoop(game);
  },

  save(game) {
    const d = st(game).data;
    // keep only the window that still matters
    const nowMin = Math.floor(game.playtimeS / 60);
    for (const [tok, mins] of Object.entries(d.minutes)) {
      d.minutes[tok] = mins.filter((m) => m > nowMin - WINDOW_MINUTES);
      if (!d.minutes[tok].length) delete d.minutes[tok];
    }
    return { minutes: d.minutes, pending: d.pending, caps: d.caps, spent: d.spent, lastUnbindAt: d.lastUnbindAt };
  },

  tick(game, dt) {
    const s = st(game);
    s.partyAcc += dt;
    if (s.partyAcc >= 1 / PARTY_HZ) { s.partyAcc = 0; publishParty(game); }
    if (s.refreshNext) { s.refreshNext = false; refreshS(game); }
    if (s.coopNext) { s.coopNext = false; publishCoop(game); }
  },

  slowTick(game) {
    const s = st(game);
    const d = s.data;
    if (!game.services.get('spendGlint')?.__coopWrapped) wrapSpend(game);   // re-wrap if a later system re-registered it
    const minute = Math.floor(game.playtimeS / 60);
    if (minute > d.lastMinute) {
      d.lastMinute = minute;
      const together = game.players.size >= 2;
      for (const p of game.players.values()) {
        const mins = minutesOf(game, p.token);
        if (mins[mins.length - 1] !== minute) mins.push(minute);
        while (mins.length && mins[0] <= minute - WINDOW_MINUTES) mins.shift();
        if (together) game.call('counter', p, 'coop_minutes', 1);
      }
      publishCoop(game);
    }
    const hour = Math.floor(game.playtimeS / RECOMPUTE_S);
    if (hour > d.lastHour) { d.lastHour = hour; hourly(game); }
    else if (d.pending) publishCoop(game);
  },

  onJoin(game, player) {
    uidOf(game, player.token);
    refreshS(game, `${player.name} joined.`);
    const prefs = coopData(player.profile).prefs;
    game.sendSelf(player, 'prefs', prefs);
    st(game).coopJson = '';
    publishCoop(game);
    publishParty(game);
    sysChat(game, `${player.name} joined the crew.`, (p) => p !== player);
    const host = isHost(game, player);
    player.conn?.send({ t: 'chat', from: '', text: `Welcome to ${game.opts.worldName}. ${game.players.size} online${host ? ' - you are the host (/help)' : ''}.`, color: -1, sys: 1 });
  },

  onLeave(game, player) {
    const s = st(game);
    s.rate.delete(player.id);
    s.pingAt.delete(player.id);
    game.broadcast({ t: 'chat', from: '', text: `${player.name} left.`, color: -1, sys: 1 }, (p) => p !== player);
    s.coopJson = '';
    s.partyJson = '';
    s.partyAcc = 1;          // roster and coop view refresh on the next tick, after the player is gone
    s.coopNext = true;
    s.refreshNext = true;
  },

  saveProfile(game, player) { return coopData(player.profile); },
  loadProfile(game, player, data) {
    const sys = (player.profile.sys ||= {});
    sys.coop = data && typeof data === 'object' ? data : (sys.coop || {});
    coopData(player.profile);
  },

  handlers: {
    'chat.say': (game, player, d) => {
      const raw = typeof d?.text === 'string' ? d.text : '';
      const text = sanitizeText(raw, CHAT_MAX);
      if (!text) return { ok: false, err: 'invalid' };
      if (!chatAllowed(game, player)) return { ok: false, err: 'cooldown' };
      if (text.startsWith('/')) return command(game, player, text);
      game.broadcast({ t: 'chat', from: player.name, text, color: player.color, id: player.id });
      return { ok: true };
    },
    'ping.mark': (game, player, d) => {
      const v = validatePingMark(d);
      if (!v) return { ok: false, err: 'invalid' };
      const s = st(game);
      const last = s.pingAt.get(player.id) ?? -Infinity;
      if (game.now - last < PING_COOLDOWN_S) return { ok: false, err: 'cooldown' };
      s.pingAt.set(player.id, game.now);
      const realm = game.realms.get(player.entity.realm);
      const x = Math.max(0, Math.min(realm.w, v.x)), y = Math.max(0, Math.min(realm.h, v.y));
      game.fx(realm, 'ping', x, y, { c: player.color, k: v.kind, n: player.name });
      const ping = { x: +x.toFixed(2), y: +y.toFixed(2), kind: v.kind, realm: realm.id, id: player.id };
      game.broadcast({ t: 'chat', from: player.name, text: PING_TEXT[v.kind], color: player.color, id: player.id, ping },
        (p) => p.entity?.realm === realm.id);
      game.call('counter', player, 'pings_sent', 1);
      return { ok: true, d: ping };
    },
    'coop.kick': hostOnly((game, host, token) => kick(game, host, token)),
    'coop.unbind': hostOnly((game, host, token) => unbind(game, host, token)),
    'coop.spendcap': hostOnly((game, host, token, d) => setCap(game, host, token, d?.glint == null ? null : Number(d.glint))),
    'settings.set': (game, player, d) => {
      const key = d?.key;
      if (typeof key !== 'string' || !PREF_KEY.test(key)) return { ok: false, err: 'invalid' };
      const v = d.value;
      const okVal = v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 64);
      if (!okVal) return { ok: false, err: 'invalid' };
      const prefs = coopData(player.profile).prefs;
      if (v === null) delete prefs[key];
      else {
        if (!(key in prefs) && Object.keys(prefs).length >= MAX_PREFS) return { ok: false, err: 'full' };
        prefs[key] = typeof v === 'string' ? sanitizeText(v, 64) : v;
      }
      game.sendSelf(player, 'prefs', { ...prefs });
      return { ok: true };
    },
  },
};

export { PING_KINDS, kick, unbind, setCap, publishCoop, sanitizeName };
