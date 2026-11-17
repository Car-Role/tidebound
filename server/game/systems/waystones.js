// Waystones (WP7, DESIGN 7.1, T3/T11): fast travel between Waystones with a 2 s channel. Using a Waystone opens the
// map on its Waystones tab; `waystone.go {id}` starts the channel. Moving more than 0.75 tiles or taking damage
// cancels it. Wayfarer (skill T11, flag `wayfarer`) may travel from anywhere every 5 minutes. One Waystone per plot.
// World key `waystones`: [{ id, x, y, px, py, biome }].

import { PLOT } from '../../../shared/config.js';
import { plotOfTile, biomeOf, inPlotBounds } from '../../../shared/grid.js';
import { isInt } from '../../../shared/protocol.js';

const CHANNEL_S = 2;
const NEAR = 3;
const WAYFARER_CD = 300;
const GAMES = new WeakMap();
const W = (game) => GAMES.get(game);

function list(game) {
  const realm = game.realms.get('overworld');
  const out = [];
  for (const e of realm?.entities.values() ?? []) {
    if (e.type !== 'structure' || e.kind !== 'waystone') continue;
    const { px, py } = plotOfTile(Math.floor(e.x), Math.floor(e.y));
    out.push({ id: e.id, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, px, py, biome: inPlotBounds(px, py) ? biomeOf(px, py) : null });
  }
  return out.sort((a, b) => a.py - b.py || a.px - b.px);
}

const publish = (game) => game.sendWorld('waystones', list(game));

function nearWaystone(game, player) {
  const e = player.entity;
  const realm = game.realms.get(e.realm);
  return realm?.query(e.x, e.y, NEAR, [], (s) => s.type === 'structure' && s.kind === 'waystone')[0] ?? null;
}

function wayfarerCd(game, player) {
  const cd = player.wayfarerAt ?? -Infinity;
  return Math.max(0, cd + WAYFARER_CD - game.now);
}

function go(game, player, d) {
  if (!d || !isInt(d.id, 1, 2 ** 31)) return { ok: false, err: 'invalid' };
  const e = player.entity;
  if (e.realm !== 'overworld') return { ok: false, err: 'denied' };
  const realm = game.realms.get('overworld');
  const target = realm.entities.get(d.id);
  if (!target || target.kind !== 'waystone') return { ok: false, err: 'invalid' };
  const from = nearWaystone(game, player);
  let viaWayfarer = false;
  if (!from) {
    if (!game.stats.hasFlag(player, 'wayfarer')) return { ok: false, err: 'range' };
    if (wayfarerCd(game, player) > 0) return { ok: false, err: 'cooldown', d: { left: Math.ceil(wayfarerCd(game, player)) } };
    viaWayfarer = true;
  } else if (from.id === target.id) return { ok: false, err: 'invalid' };
  W(game).channels.set(player.id, { to: target.id, until: game.now + CHANNEL_S, x: e.x, y: e.y, hp: e.hp, wayfarer: viaWayfarer });
  game.fx(realm, 'waystone_warp', e.x, e.y, { charge: CHANNEL_S });
  return { ok: true, d: { channel: CHANNEL_S } };
}

function arrive(game, player, ch) {
  const realm = game.realms.get('overworld');
  const target = realm.entities.get(ch.to);
  if (!target) { game.toast(player, 'That Waystone is gone.', 'warn'); return; }
  const tx = target.data.tx ?? Math.floor(target.x), ty = target.data.ty ?? Math.floor(target.y);
  let dest = null;
  for (const [dx, dy] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 2], [2, 0], [-2, 0]]) {
    if (realm.isWalkable(tx + dx, ty + dy)) { dest = { x: tx + dx + 0.5, y: ty + dy + 0.5 }; break; }
  }
  if (!dest) { game.toast(player, 'The Waystone is blocked.', 'warn'); return; }
  const e = player.entity;
  game.fx(realm, 'waystone_warp', e.x, e.y);
  game.movePlayer(player, 'overworld', dest.x, dest.y);
  game.fx(realm, 'waystone_warp', dest.x, dest.y, { arrive: 1 });
  if (ch.wayfarer) player.wayfarerAt = game.now;
  game.call('counter', player, 'waystone_jumps', 1);
  game.bus.emit('waystone.jump', { player, to: target });
}

export default {
  name: 'waystones',

  init(game) {
    GAMES.set(game, { channels: new Map(), seq: 0 });
    game.call('registerInteract', 'waystone', (g, player, e) => {
      g.sendSelf(player, 'mapOpen', { n: ++W(g).seq, tab: 'waystones', from: e.id });
      return { ok: true };
    });
    game.call('registerPlaceValidator', (kind, realm, tx, ty) => {
      if (kind !== 'waystone' || realm.kind !== 'overworld') return null;
      const { px, py } = plotOfTile(tx, ty);
      const x0 = px * PLOT, y0 = py * PLOT;
      const taken = realm.query(x0 + PLOT / 2, y0 + PLOT / 2, PLOT, [], (e) => e.kind === 'waystone'
        && e.x >= x0 && e.y >= y0 && e.x < x0 + PLOT && e.y < y0 + PLOT);
      return taken.length ? { ok: false, err: 'full' } : null;
    });
    const refresh = ({ structure }) => { if (structure?.kind === 'waystone') publish(game); };
    game.bus.on('structure.placed', refresh);
    game.bus.on('structure.removed', refresh);
  },

  load(game) { publish(game); },

  handlers: { 'waystone.go': (game, player, d) => go(game, player, d) },

  tick(game) {
    const st = W(game);
    if (!st.channels.size) return;
    for (const [id, ch] of st.channels) {
      const player = game.players.get(id);
      const e = player?.entity;
      if (!e || e.realm !== 'overworld') { st.channels.delete(id); continue; }
      if (Math.hypot(e.x - ch.x, e.y - ch.y) > 0.75 || e.hp < ch.hp) {
        st.channels.delete(id);
        game.toast(player, 'Waystone travel interrupted.', 'warn');
        continue;
      }
      if (game.now >= ch.until) { st.channels.delete(id); arrive(game, player, ch); }
    }
  },

  onLeave(game, player) { W(game).channels.delete(player.id); },
};
