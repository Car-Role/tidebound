// WP11: the Tidegate megaproject (DESIGN 18.1). Five stages built at the `gate_site` structure after Beacon 6.
// Deliveries come from players (`tidegate.deliver {stage}`), Sluices and Gulls (IO provider for `gate_site`:
// `insertInto(gateSite, item, qty)` accepts what the current stage still needs).
// Costs are world-structure costs: x coopScale and Tide Height (shared/rules/costs.js structureCost with gate:true),
// except the 20 moonpetal; wing and Trench requirements are never scaled.
// Each completed stage: 150,000 XP to every bound player, +10% machine speed (world sheet), `gate_stage` fx,
// a cutscene moment (world.tidegate.cutscene), bus `tidegate.stage {stage}`, flag `tidegate:<n>`.
// `tidegate.deliver { stage: 6 }` after stage 5 is the descent to the Drowned Moon (finale.js).

import { TIDEGATE_STAGES } from '../../../shared/data/structures.js';
import { structureCost } from '../../../shared/rules/costs.js';
import { st as questState } from './quests.js';
import { wingsComplete } from './archive.js';
import { descend, finaleView } from './finale.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);
const GATE_RANGE = 10;
export const DESCENT_STAGE = 6;

export function tidegateStage(game) { return st(game)?.data?.stage ?? 0; }

function gateSite(game) {
  for (const e of game.realms.get('overworld')?.entities.values() ?? []) if (e.type === 'structure' && e.kind === 'gate_site') return e;
  return null;
}

function nearGate(game, player) {
  const g = gateSite(game);
  if (!g) return player.entity?.realm === 'overworld';      // site not stamped yet (WP7): allow from the overworld
  if (player.entity?.realm !== g.realm) return false;
  const hw = (g.data?.w ?? 6) / 2, hh = (g.data?.h ?? 4) / 2;
  const dx = Math.max(0, Math.abs(player.entity.x - g.x) - hw), dy = Math.max(0, Math.abs(player.entity.y - g.y) - hh);
  return Math.hypot(dx, dy) <= GATE_RANGE;
}

function trenchDeepest(game) {
  let m = questState(game)?.world?.record?.trench || 0;
  for (const p of game.players.values()) m = Math.max(m, p.counters?.trench_deepest || 0);
  for (const prof of game.profiles.values()) m = Math.max(m, prof.counters?.trench_deepest || 0);
  return m;
}

// Needs of stage n (1..5) at the current coopScale and Tide Height.
export function stageNeeds(game, n) {
  const def = TIDEGATE_STAGES[n - 1];
  if (!def) return null;
  const coop = game.call('coopScale') || 1;
  const tideHeight = game.world.tideHeight || 0;
  const unscaled = new Set(def.unscaled || []);
  const items = [];
  for (const c of def.cost) {
    const qty = unscaled.has(c.item) ? c.qty : structureCost([c], { world: true, coop, tideHeight, gate: true })[0].qty;
    items.push({ item: c.item, qty });
  }
  const glint = def.glint ? structureCost([{ item: 'glint', qty: def.glint }], { world: true, coop, tideHeight, gate: true })[0].qty : 0;
  return { def, items, glint };
}

// Why the next stage cannot be worked on, or null.
export function lockReason(game, n) {
  const def = TIDEGATE_STAGES[n - 1];
  if (!def) return 'complete';
  for (const u of def.unlock || []) {
    if (!game.call('hasUnlock', u, null)) return u.startsWith('beacon:') ? `Light Beacon ${u.split(':')[1]} first` : `Needs ${u}`;
  }
  if (wingsComplete(game) < def.wings) return `Needs ${def.wings} completed Archive wings (${wingsComplete(game)}/${def.wings})`;
  if (def.trench && trenchDeepest(game) < def.trench) return `Needs Trench floor ${def.trench} reached by anyone (deepest ${trenchDeepest(game)})`;
  return null;
}

function remaining(game, n) {
  const needs = stageNeeds(game, n);
  const del = st(game).data.delivered[n] ||= {};
  return {
    items: needs.items.map((c) => ({ item: c.item, need: c.qty, have: Math.min(c.qty, del[c.item] || 0) })),
    glint: { need: needs.glint, have: Math.min(needs.glint, del.glint || 0) },
  };
}

function stageDone(game, n) {
  const r = remaining(game, n);
  return r.items.every((c) => c.have >= c.need) && r.glint.have >= r.glint.need;
}

// Accept `qty` of `item` toward the current stage; returns quantity accepted.
export function acceptDelivery(game, item, qty) {
  const d = st(game).data;
  const n = d.stage + 1;
  if (n > TIDEGATE_STAGES.length || lockReason(game, n) || !(qty > 0)) return 0;
  const r = remaining(game, n);
  const c = r.items.find((x) => x.item === item);
  if (!c) return 0;
  const take = Math.min(qty, c.need - c.have);
  if (take <= 0) return 0;
  const del = d.delivered[n] ||= {};
  del[item] = (del[item] || 0) + take;
  st(game).dirty = true;
  if (stageDone(game, n)) completeStage(game, n);
  return take;
}

function completeStage(game, n) {
  const s = st(game);
  const d = s.data;
  if (d.stage >= n) return;
  d.stage = n;
  const def = TIDEGATE_STAGES[n - 1];
  game.world.flags[`tidegate:${n}`] = true;
  const site = gateSite(game);
  const x = site?.x ?? 0, y = site?.y ?? 0;
  d.cutscene = { stage: n, name: def.name, at: game.now, x, y };
  if (site) { site.set('lv', n); site.set('p', 0); game.fx(site.realm, 'gate_stage', x, y, { stage: n }); }
  const xp = def.xpEach ?? 150000;
  const online = new Set();
  for (const p of game.players.values()) {
    online.add(p.token);
    game.call('grantXp', p, xp, 'tidegate');
  }
  const qs = questState(game);
  if (qs) for (const tok of game.world.bound || []) if (!online.has(tok)) qs.world.pendingXp[tok] = (qs.world.pendingXp[tok] || 0) + xp;
  game.stats.invalidateWorld();
  for (const p of game.players.values()) game.stats.invalidate(p);
  game.toast(null, `Tidegate stage ${n} complete: ${def.name}! +${xp.toLocaleString('en-US')} XP, machines +10%`, 'quest');
  game.bus.emit('tidegate.stage', { stage: n });
  if (n === TIDEGATE_STAGES.length) {
    game.world.flags['moon:open'] = true;
    game.toast(null, 'The Tidegate is whole. Beneath it, something vast is waking. The Drowned Moon waits below.', 'quest');
  }
  game.sendWorld('unlocks', game.world.flags);
  publish(game);
}

function publish(game) {
  const s = st(game);
  const d = s.data;
  const n = d.stage + 1;
  const view = {
    stage: d.stage, total: TIDEGATE_STAGES.length,
    stages: TIDEGATE_STAGES.map((x) => ({ stage: x.stage, name: x.name, wings: x.wings, trench: x.trench })),
    cutscene: d.cutscene ?? null,
    moon: d.stage >= TIDEGATE_STAGES.length,
    finale: finaleView(game),
  };
  if (n <= TIDEGATE_STAGES.length) {
    const reason = lockReason(game, n);
    const r = remaining(game, n);
    view.current = { stage: n, name: TIDEGATE_STAGES[n - 1].name, locked: reason, needs: r.items, glint: r.glint,
      wings: { need: TIDEGATE_STAGES[n - 1].wings, have: wingsComplete(game) }, trench: { need: TIDEGATE_STAGES[n - 1].trench, have: trenchDeepest(game) } };
    const tot = r.items.reduce((a, c) => a + c.need, 0) + (r.glint.need ? 1 : 0);
    const got = r.items.reduce((a, c) => a + c.have, 0) + (r.glint.need ? r.glint.have / r.glint.need : 0);
    view.current.progress = tot ? got / tot : 0;
    const site = gateSite(game);
    if (site) site.set('p', Math.floor(view.current.progress * 255));
  }
  const json = JSON.stringify(view);
  if (json !== s.json) { s.json = json; game.sendWorld('tidegate', view); }
  s.dirty = false;
}

export default {
  name: 'tidegate',

  init(game) {
    ST.set(game, { data: { stage: 0, delivered: {} }, dirty: true, json: '' });
    const qs = questState(game);
    if (qs) qs.tidegateStage = () => tidegateStage(game);
    game.stats.addWorldSource('tidegate', () => {
      const n = st(game).data.stage;
      return n > 0 ? [{ stat: 'machineSpeed', op: 'add', v: 0.1 * n }] : [];
    });
    game.call('registerIO', 'gate_site', {
      insert: (structure, itemId, qty) => acceptDelivery(game, itemId, qty),
      extract: () => null,
    });
    game.call('registerInteract', 'gate_site', (g, player) => {
      publish(g);
      g.sendSelf(player, 'ui', { panel: 'tidegate', t: g.now });
      return { ok: true };
    });
    game.bus.on('archive.donated', () => { st(game).dirty = true; });
    game.bus.on('beacon.lit', () => { st(game).dirty = true; });
    game.bus.on('trench.floor', () => { st(game).dirty = true; });
    game.bus.on('coop.changed', () => { st(game).dirty = true; });
    game.bus.on('finale.changed', () => publish(game));
    game.bus.on('rebirth', () => {
      const s = st(game);
      s.data = { stage: 0, delivered: {} };
      for (let n = 1; n <= TIDEGATE_STAGES.length; n++) delete game.world.flags[`tidegate:${n}`];
      delete game.world.flags['moon:open'];
      game.stats.invalidateWorld();
      publish(game);
    });
  },

  load(game, data) {
    const s = st(game);
    const d = data && typeof data === 'object' ? structuredClone(data) : {};
    d.stage = Math.max(0, Math.min(TIDEGATE_STAGES.length, d.stage | 0));
    d.delivered ||= {};
    s.data = d;
    s.json = '';
    game.stats.invalidateWorld();
    publish(game);
  },

  save(game) { const d = st(game).data; return { stage: d.stage, delivered: d.delivered }; },

  slowTick(game) {
    const s = st(game);
    if (s.dirty || (s.tick = (s.tick || 0) + 1) % 5 === 0) publish(game);
  },

  handlers: {
    'tidegate.deliver': (game, player, d) => {
      const s = st(game);
      const n = d?.stage;
      if (!Number.isInteger(n)) return { ok: false, err: 'invalid' };
      if (!nearGate(game, player)) return { ok: false, err: 'range' };
      if (n === DESCENT_STAGE) return descend(game, player);
      if (n !== s.data.stage + 1) return { ok: false, err: 'invalid' };
      const reason = lockReason(game, n);
      if (reason) return { ok: false, err: 'locked', d: { reason } };
      const r = remaining(game, n);
      const take = [];
      for (const c of r.items) {
        const want = c.need - c.have;
        if (want <= 0) continue;
        const have = game.call('countItem', player, c.item) || 0;
        const q = Math.min(want, have);
        if (q > 0) take.push({ item: c.item, qty: q });
      }
      let glint = 0;
      const gWant = r.glint.need - r.glint.have;
      if (gWant > 0) {
        const g = Math.min(gWant, Math.floor(game.world.glint || 0));
        if (g > 0 && game.call('spendGlint', g, 'tidegate', player)) glint = g;
      }
      if (!take.length && !glint) return { ok: false, err: 'cost' };
      if (take.length && !game.call('takeItems', player, take)) return { ok: false, err: 'cost' };
      const del = s.data.delivered[n] ||= {};
      for (const t of take) del[t.item] = (del[t.item] || 0) + t.qty;
      if (glint) del.glint = (del.glint || 0) + glint;
      const site = gateSite(game);
      if (site) game.fx(site.realm, 'build_place', site.x, site.y, { n: take.length });
      const sum = take.reduce((a, t) => a + t.qty, 0);
      game.toast(player, `Delivered ${sum.toLocaleString('en-US')} items${glint ? ` and ${glint.toLocaleString('en-US')} Glint` : ''} to the Tidegate.`, 'good');
      if (stageDone(game, n)) completeStage(game, n);
      else publish(game);
      return { ok: true, d: { stage: n, items: take, glint } };
    },
  },
};

export { completeStage, publish as publishTidegate, gateSite };
