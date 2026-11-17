// Economy machines (WP8, DESIGN 8.2):
//   Ledger Post   sells the contents of the container behind it at 70% of market value, 20 items/min, through the
//                 market's saturation (WP9 sellItems with rate 0.7)
//   Mint          converts glintstone and any bar in its own input slots to Glint at 60%, 30 items/min, through one
//                 shared saturation entry `mint`
//   Echo Chamber  bound to one cleared Vault (machine.config {k}); every 20 min consumes 1 vault_key_k and produces two
//                 rolls of that Vault's loot table (no XP, no cores)
// If the market service is still the WP1 default, a local fallback pays value * rate so items never vanish for nothing.

import { M, machinesOfType, machineSpeed, isOn, running, want, rt, machineOf, backTile, structAt, outAdd, invOf, report, takeFrom } from './machines.js';

const GAMES = new WeakMap();
const LG = (game) => GAMES.get(game);

function sell(game, e, item, qty, rate, satKey) {
  const owner = game.services.owner?.get('sellItems');
  let glint;
  if (owner && owner !== 'default') glint = game.call('sellItems', null, item, qty, satKey ? { rate, satKey } : { rate }) || 0;
  else {
    glint = Math.floor((game.content.items.byId[item]?.value ?? 0) * qty * rate);
    if (glint > 0) game.call('addGlint', glint, 'machine_sale', null);
  }
  report(game, item, qty, false);
  game.bus.emit('item.sold', { player: null, item, qty, glint, machine: e });
  if (game.now - (rt(game, e).fxAt ?? -9) > 1.5) {
    rt(game, e).fxAt = game.now;
    game.fx(e.realm, 'mint_coin', e.x, e.y - 0.5, { glint });
  }
  return glint;
}

const sellable = (game) => (item) => (game.content.items.byId[item]?.value ?? 0) > 0;

function tickLedger(game, e, dt) {
  const m = machineOf(game, e);
  const r = rt(game, e);
  const realm = game.realms.get(e.realm);
  const src = structAt(game, realm, ...backTile(e));
  if (!src) { r.noInput = true; return; }
  const interval = 60 / (m.rate || 20);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  if (e.data.acc < interval) { want(game, e); return; }
  const got = game.call('extractFrom', src, sellable(game), 1);
  if (!got || !got.qty) { r.noInput = true; e.data.acc = Math.min(e.data.acc, interval); return; }
  r.noInput = false;
  want(game, e);
  e.data.acc -= interval;
  e.set('it', got.item);
  sell(game, e, got.item, got.qty, m.pct ?? 0.7, m.satKey);
}

function tickMint(game, e, dt) {
  const m = machineOf(game, e);
  const r = rt(game, e);
  const inv = invOf(e, 'in', 8);
  if (inv.slots.every((s) => !s)) { r.noInput = true; return; }
  r.noInput = false;
  want(game, e);
  const interval = 60 / (m.rate || 30);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  while (e.data.acc >= interval) {
    const got = takeFrom(game, inv, null, 1);
    if (!got) break;
    e.data.acc -= interval;
    e.set('it', got.item);
    sell(game, e, got.item, got.qty, m.pct ?? 0.6, m.satKey ?? 'mint');
  }
}

function tickEcho(game, e, dt) {
  const m = machineOf(game, e);
  const r = rt(game, e);
  const k = e.data.k;
  if (!k) { r.noInput = true; return; }
  const key = 'vault_key_' + k;
  const inv = invOf(e, 'in', 4);
  if (game.inv.count(inv, key) < 1) { r.noInput = true; return; }
  const out = invOf(e, 'out', 16);
  if (out.slots.every((s) => s)) { r.blocked = true; return; }
  r.noInput = false; r.blocked = false;
  want(game, e);
  e.data.acc = (e.data.acc ?? 0) + machineSpeed(game, e) * dt;
  const interval = m.interval || 1200;
  const pv = Math.min(255, Math.floor((e.data.acc / interval) * 32) * 8);
  if (e.pub.p !== pv) e.set('p', pv);
  if (e.data.acc < interval) return;
  e.data.acc -= interval;
  game.inv.remove(inv, key, 1);
  report(game, key, 1, false);
  for (let roll = 0; roll < 2; roll++) {
    const loot = game.call('rollVaultLoot', k) || [];
    for (const { item, qty } of loot) {
      if (!item || /^vault_core_/.test(item) || !(qty > 0)) continue;
      const left = outAdd(game, e, item, qty);
      if (left > 0) game.call('dropItem', e.realm, e.x, e.y + 2, item, left, {});
    }
  }
  game.fx(e.realm, 'summon_puff', e.x, e.y);
  game.bus.emit('echo.cycle', { machine: e, k });
}

export default {
  name: 'ledger',

  init(game) {
    GAMES.set(game, {});
    M(game).viewExtras.push((e) => {
      const m = machineOf(game, e);
      if (m?.type === 'echo') {
        const cleared = [];
        for (let k = 1; k <= 6; k++) if (game.call('hasUnlock', 'vault:' + k)) cleared.push(k);
        return { cleared, interval: m.interval, acc: Math.round(e.data.acc ?? 0) };
      }
      if (m?.type === 'seller') return { rate: m.rate, pct: m.pct };
      return null;
    });
  },

  slowTick(game) {
    if (!running(game)) return;
    for (const e of machinesOfType(game, 'echo')) if (!e.removed && isOn(game, e)) tickEcho(game, e, 1);
  },

  tick(game, dt) {
    if (!running(game)) return;
    for (const e of machinesOfType(game, 'seller')) {
      if (e.removed || !isOn(game, e)) continue;
      if (e.kind === 'mint') tickMint(game, e, dt); else tickLedger(game, e, dt);
    }
  },
};

export { LG };
