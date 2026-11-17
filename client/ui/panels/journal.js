// WP11: Journal (J). Tabs: Quests, Board (Tide Board contracts), Archive, Logbook (Deeds), Bestiary, Fish.
// Reads world.mainQuest, self.quests, world.archive, self.deeds. Opened with args { tab } by the Tide Board and
// Archive interactions (self.ui router in hud/toasts.js).

import { UI_COLORS } from '../widgets.js';
import { measure } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { wrapText } from './dialog.js';
import { content as CONTENT } from '../../../shared/data/index.js';

const TABS = ['Quests', 'Board', 'Archive', 'Logbook', 'Bestiary', 'Fish'];
const TAB_IDS = ['quests', 'board', 'archive', 'logbook', 'bestiary', 'fish'];
const DEED_CATS = ['gather', 'craft', 'fight', 'explore', 'automate', 'crew'];
const RARITY_COL = { common: PAL[RAMPS.stone[4]], uncommon: PAL[RAMPS.grass[4]], rare: PAL[RAMPS.sea[4]], legendary: PAL[RAMPS.gold[4]] };
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

const st = { tab: 0, sel: null, wing: 0, cat: 0, busy: false, msg: '', msgAt: 0 };

function content() { return CONTENT; }
function itemName(id) { return content()?.items.byId[id]?.name ?? id; }

function flash(text) { st.msg = text; st.msgAt = performance.now(); }

function act(ui, a, d, okText) {
  if (st.busy) return;
  st.busy = true;
  ui.ui.net.do(a, d).then((r) => {
    st.busy = false;
    const why = { range: 'Too far away', cost: 'Not enough yet', full: 'Too many active', locked: 'Locked', invalid: 'Not possible' };
    flash(r.ok ? okText : (why[r.err] ?? 'Failed'));
  });
}

// ---------------------------------------------------------------- quests tab

function questEntries(store) {
  const out = [];
  const mq = store.world.mainQuest;
  if (mq) out.push({ id: 'main', type: 'main', name: mq.complete ? 'Main chain complete' : `${mq.n}. ${mq.name}`, giverName: `Main chain ${mq.done}/${mq.total}`, goals: mq.goals, ready: mq.complete, reward: mq.reward });
  for (const a of store.self.quests?.active ?? []) out.push(a);
  return out;
}

function drawGoals(ui, x, y, w, goals) {
  for (const g of goals) {
    const done = g.have >= g.n;
    const lines = wrapText(g.label, w - 34);
    ui.label(x, y, (done ? '+ ' : '- ') + lines[0], { color: done ? UI_COLORS.good : UI_COLORS.text });
    ui.label(x + w, y, `${fmt(Math.min(g.have, g.n))}/${fmt(g.n)}`, { color: done ? UI_COLORS.good : UI_COLORS.dim, align: 'right' });
    ui.bar(x + 8, y + 9, w - 8, 3, g.have, g.n, done ? UI_COLORS.good : UI_COLORS.accent);
    y += 16;
  }
  return y;
}

function drawQuests(ui, store) {
  const list = questEntries(store);
  if (!st.sel || !list.some((q) => q.id === st.sel)) st.sel = list[0]?.id ?? null;
  const pinned = store.self.quests?.pinned ?? [];
  ui.list(6, 30, 128, 196, list, 20, (q, y, hot) => {
    const sel = q.id === st.sel;
    if (sel || hot) ui.rect(6, y, 126, 19, sel ? UI_COLORS.border : UI_COLORS.slotHover);
    const col = q.type === 'main' ? UI_COLORS.accent : q.type === 'board' ? PAL[RAMPS.sea[4]] : UI_COLORS.text;
    let name = q.name;
    while (measure(name) > 106 && name.length > 4) name = name.slice(0, -2);
    ui.label(10, y + 1, name !== q.name ? name + '.' : name, { color: col });
    ui.label(10, y + 10, q.giverName ?? '', { color: UI_COLORS.dim });
    if (q.ready) ui.label(128, y + 1, '!', { color: UI_COLORS.good, align: 'right' });
    else if (pinned.includes(q.id) || q.type === 'main') ui.label(128, y + 1, '*', { color: UI_COLORS.accent, align: 'right' });
    if (hot && ui.ui.mouse.released) { st.sel = q.id; ui.ui.consumeClick(); ui.ui.sound('ui_click'); }
  }, 'quests');

  const q = list.find((x) => x.id === st.sel);
  const x = 140, w = 252;
  ui.rect(x - 2, 30, 1, 196, UI_COLORS.border);
  if (!q) { ui.label(x + 4, 34, 'No quests yet.', { color: UI_COLORS.dim }); return; }
  ui.label(x + 4, 30, q.name, { color: q.type === 'main' ? UI_COLORS.accent : UI_COLORS.text });
  ui.label(x + 4, 40, q.type === 'main' ? 'Main chain - shared, auto-tracked' : q.type === 'board' ? 'Tide Board contract - turn in at the board' : `From ${q.giverName} - return to them`, { color: UI_COLORS.dim });
  let y = drawGoals(ui, x + 4, 54, w - 6, q.goals || []);
  ui.label(x + 4, y + 2, 'Reward', { color: UI_COLORS.accent });
  wrapText(q.reward || '-', w - 6).forEach((l, i) => ui.label(x + 4, y + 12 + i * 9, l));
  y += 34;
  if (q.type !== 'main') {
    const isPinned = pinned.includes(q.id);
    if (ui.button(x + 4, 212, isPinned ? 'Unpin' : 'Pin to tracker', { key: 'pin' })) act(ui, 'quest.pin', { quest: q.id }, isPinned ? 'Unpinned' : 'Pinned');
    if (q.type === 'board' && q.ready && ui.button(x + 96, 212, 'Turn in', { key: 'turnin' })) act(ui, 'quest.turnin', { quest: q.id }, 'Contract complete!');
  }
  // castaway lines summary
  const lines = store.self.quests?.lines ?? {};
  const npcs = content()?.npcs ?? [];
  if (q.type === 'main' && npcs.length) {
    ui.label(x + 4, y, 'Castaway lines', { color: UI_COLORS.accent });
    npcs.forEach((n, i) => {
      const cx = x + 4 + (i % 4) * 62, cy = y + 11 + Math.floor(i / 4) * 11;
      const done = lines[n.id] ?? 0;
      for (let k = 0; k < 3; k++) ui.rect(cx + k * 4, cy + 2, 3, 3, k < done ? UI_COLORS.good : UI_COLORS.border);
      ui.label(cx + 14, cy, n.name.split(/[ ,-]/)[0].slice(0, 7), { color: done >= 3 ? UI_COLORS.good : UI_COLORS.dim });
    });
  }
}

// ---------------------------------------------------------------- board tab

function drawBoard(ui, store) {
  const b = store.self.quests?.board;
  if (!b) { ui.label(10, 34, 'The Tide Board is blank.', { color: UI_COLORS.dim }); return; }
  ui.label(8, 30, `Day ${b.day}, tier ${b.k}. New contracts every dawn; take up to 3.`, { color: UI_COLORS.dim });
  const active = store.self.quests?.active ?? [];
  b.offers.forEach((o, i) => {
    const x = 6 + i * 130, y = 42, w = 126, h = 128;
    ui.rect(x, y, w, h, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, w - 2, h - 2, o.done ? UI_COLORS.bg : UI_COLORS.bgLight);
    // pinned-paper look
    ui.rect(x + w / 2 - 2, y + 2, 4, 4, PAL[RAMPS.ember[3]]);
    ui.label(x + 5, y + 9, o.name, { color: UI_COLORS.accent });
    let ly = y + 21;
    for (const gl of o.goals) for (const l of wrapText(gl, w - 10)) { ui.label(x + 5, ly, l); ly += 9; }
    ly += 3;
    ui.label(x + 5, ly, 'Reward', { color: UI_COLORS.dim }); ly += 9;
    for (const l of wrapText(o.reward, w - 10)) { ui.label(x + 5, ly, l, { color: UI_COLORS.good }); ly += 9; }
    const a = active.find((q) => q.id === o.id);
    if (o.done) ui.label(x + w / 2, y + h - 14, 'Done', { color: UI_COLORS.good, align: 'center' });
    else if (a) {
      if (a.ready) { if (ui.button(x + 5, y + h - 17, 'Turn in', { key: 'bt' + i, w: w - 10 })) act(ui, 'quest.turnin', { quest: o.id }, 'Contract complete!'); }
      else {
        const g = a.goals[0];
        ui.bar(x + 5, y + h - 14, w - 10, 5, g?.have ?? 0, g?.n ?? 1, UI_COLORS.accent);
        ui.label(x + w / 2, y + h - 24, `${fmt(g?.have)}/${fmt(g?.n)}`, { color: UI_COLORS.dim, align: 'center' });
      }
    } else if (ui.button(x + 5, y + h - 17, 'Take contract', { key: 'bo' + i, w: w - 10 })) act(ui, 'quest.accept', { quest: o.id }, 'Contract taken');
  });
  ui.label(8, 178, 'Contracts are personal: each castaway takes their own.', { color: UI_COLORS.dim });
  ui.label(8, 188, 'Deliveries are handed over at the Tide Board.', { color: UI_COLORS.dim });
}

// ---------------------------------------------------------------- archive tab

function drawArchive(ui, store) {
  const c = content();
  const a = store.world.archive ?? { donated: {}, wings: {}, complete: [] };
  if (!c) return;
  const wings = c.archive;
  ui.label(8, 30, `The Archive - ${a.total ?? Object.keys(a.donated).length}/${a.max ?? 96} donated. Wings reward everyone.`, { color: UI_COLORS.dim });
  wings.forEach((w, i) => {
    const y = 42 + i * 22, sel = i === st.wing, hot = ui.hover(6, y, 118, 20);
    ui.rect(6, y, 118, 20, sel ? UI_COLORS.border : hot ? UI_COLORS.slotHover : UI_COLORS.bgLight);
    const n = a.wings?.[w.id] ?? 0, done = a.complete?.includes(w.id);
    ui.label(10, y + 1, w.name, { color: done ? UI_COLORS.good : UI_COLORS.text });
    ui.bar(10, y + 12, 80, 3, n, w.items.length, done ? UI_COLORS.good : UI_COLORS.accent);
    ui.label(120, y + 6, `${n}/12`, { color: UI_COLORS.dim, align: 'right' });
    if (hot && ui.ui.mouse.released) { st.wing = i; ui.ui.consumeClick(); ui.ui.sound('ui_click'); }
  });
  const w = wings[st.wing];
  const inv = store.self.inv?.slots ?? [];
  const have = (id) => inv.reduce((s, sl) => s + (sl && sl[0] === id ? sl[1] : 0), 0);
  ui.label(134, 42, w.name + ' wing', { color: UI_COLORS.accent });
  ui.label(134, 52, 'Reward: ' + (w.reward?.text ?? '') + ', +1 skill point', { color: a.complete?.includes(w.id) ? UI_COLORS.good : UI_COLORS.dim });
  let canDonate = 0;
  w.items.forEach((id, i) => {
    const x = 134 + (i % 6) * 42, y = 66 + Math.floor(i / 6) * 42;
    const donor = a.donated?.[id];
    const hv = have(id);
    if (!donor && hv > 0) canDonate++;
    ui.rect(x, y, 30, 30, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, 28, 28, donor ? PAL[RAMPS.sand[1]] : hv > 0 ? PAL[RAMPS.grass[1]] : UI_COLORS.slot);
    ui.ui.sprites?.draw(ui.ctx, 'item.' + id, ui.x + x + 15, ui.y + y + 23, { alpha: donor ? 1 : 0.25 });
    if (donor) ui.rect(x + 24, y + 3, 3, 3, UI_COLORS.good);
    const tier = c.items.byId[id]?.tier ?? 1;
    if (ui.hover(x, y, 30, 30)) ui.tooltip(`${itemName(id)}\n${donor ? 'Donated by ' + donor : hv > 0 ? 'You have ' + hv + ' - click to donate' : 'Not donated yet'}\n+${50 * tier * tier} XP`);
    if (!donor && hv > 0 && ui.hover(x, y, 30, 30) && ui.ui.mouse.released) { ui.ui.consumeClick(); act(ui, 'archive.donate', { item: id }, 'Donated ' + itemName(id)); }
  });
  if (ui.button(134, 156, canDonate ? `Donate all (${canDonate} here)` : 'Donate everything I carry', { key: 'donall' })) act(ui, 'archive.donate', { item: '*' }, 'Donated!');
  ui.label(134, 176, 'Donate at the Archive ruin.', { color: UI_COLORS.dim });
  ui.label(134, 186, 'One of each item, kept through every Turning.', { color: UI_COLORS.dim });
}

// ---------------------------------------------------------------- logbook tab

function drawLogbook(ui, store) {
  const c = content();
  const dd = store.self.deeds ?? { tiers: {}, counters: {}, cosmetics: [] };
  if (!c) return;
  const done = Object.values(dd.tiers || {}).reduce((a, b) => a + b, 0);
  ui.label(8, 30, `Logbook - ${done}/180 tiers, ${dd.cosmetics?.length ?? 0} cosmetics. Every tier pays a Tide Token.`, { color: UI_COLORS.dim });
  st.cat = ui.tabs(6, 40, DEED_CATS.map((x) => x[0].toUpperCase() + x.slice(1)), st.cat);
  const deeds = c.deeds.filter((d) => d.cat === DEED_CATS[st.cat]);
  ui.list(6, 54, 388, 172, deeds, 14, (d, y) => {
    const tier = dd.tiers?.[d.id] ?? 0;
    const v = dd.counters?.[d.counter] ?? 0;
    const next = d.tiers[Math.min(2, tier)];
    for (let k = 0; k < 3; k++) {
      const col = k < tier ? [PAL[RAMPS.flesh[3]], PAL[RAMPS.stone[4]], PAL[RAMPS.gold[4]]][k] : UI_COLORS.border;
      ui.rect(8 + k * 6, y + 3, 5, 5, col);
    }
    ui.label(28, y + 2, d.name, { color: tier >= 3 ? UI_COLORS.accent : UI_COLORS.text });
    ui.label(118, y + 2, d.counter.replace(/_/g, ' ') + (d.world ? ' (world)' : ''), { color: UI_COLORS.dim });
    ui.bar(250, y + 4, 60, 4, tier >= 3 ? 1 : v, tier >= 3 ? 1 : next, tier >= 3 ? UI_COLORS.good : UI_COLORS.accent);
    ui.label(386, y + 2, tier >= 3 ? 'done' : `${fmt(v)}/${fmt(next)}`, { color: UI_COLORS.dim, align: 'right' });
    if (ui.hover(6, y, 380, 14)) ui.tooltip(`${d.name}: ${d.tiers.map(fmt).join(' / ')}\nTier 3 unlocks ${d.cosmeticKind?.replace(/_/g, ' ') ?? 'a cosmetic'}`);
  }, 'deeds' + st.cat);
}

// ---------------------------------------------------------------- bestiary / fish

function drawBestiary(ui, store) {
  const c = content();
  if (!c) return;
  const kills = store.self.deeds?.kills ?? {};
  const list = [...c.enemies, ...c.bosses.filter((b) => b.kind !== 'final' || kills[b.id])];
  const seen = list.filter((e) => kills[e.id]).length;
  ui.label(8, 30, `Bestiary - ${seen}/${list.length} known. Kept through the Turning.`, { color: UI_COLORS.dim });
  ui.list(6, 42, 388, 184, list, 12, (e, y) => {
    const k = kills[e.id] ?? 0;
    const boss = !!c.bosses.byId[e.id];
    ui.label(10, y + 2, k ? e.name : '???', { color: k ? (boss ? UI_COLORS.accent : UI_COLORS.text) : UI_COLORS.dim });
    ui.label(170, y + 2, k ? (boss ? (e.kind === 'warden' ? 'Warden' : e.kind === 'keeper' ? 'Keeper' : 'Final') : `tier ${e.tier} ${e.biome ?? ''}`) : '', { color: UI_COLORS.dim });
    ui.label(386, y + 2, k ? `${fmt(k)} defeated` : '', { color: UI_COLORS.dim, align: 'right' });
  }, 'beasts');
}

function drawFish(ui, store) {
  const c = content();
  if (!c) return;
  const fish = store.self.deeds?.fish ?? {};
  const caught = c.fish.filter((f) => fish[f.id]).length;
  ui.label(8, 30, `Fish - ${caught}/${c.fish.length} species caught.`, { color: UI_COLORS.dim });
  c.fish.forEach((f, i) => {
    const x = 8 + (i % 10) * 39, y = 44 + Math.floor(i / 10) * 58;
    const n = fish[f.id] ?? 0;
    ui.rect(x, y, 30, 30, UI_COLORS.borderDark);
    ui.rect(x + 1, y + 1, 28, 28, n ? UI_COLORS.bgLight : UI_COLORS.slot);
    ui.rect(x + 1, y + 27, 28, 2, RARITY_COL[f.rarity] ?? UI_COLORS.dim);
    ui.ui.sprites?.draw(ui.ctx, 'item.' + f.id, ui.x + x + 15, ui.y + y + 23, { alpha: n ? 1 : 0.15 });
    ui.label(x + 15, y + 32, n ? String(n) : '-', { color: UI_COLORS.dim, align: 'center' });
    if (ui.hover(x, y, 30, 30)) ui.tooltip(n ? `${f.name} (${f.rarity})\n${f.biome}, caught ${n}` : `??? (${f.rarity}, ${f.biome})`);
  });
}

export default {
  id: 'journal',
  key: 'panel.journal',
  modal: false,
  w: 400, h: 232, anchor: 'center',

  open(store, args) {
    const i = TAB_IDS.indexOf(args?.tab);
    if (i >= 0) st.tab = i;
  },
  close() {},

  draw(ui, store) {
    ui.frame('Journal');
    st.tab = ui.tabs(6, 15, TABS, st.tab);
    if (ui.button(ui.w - 16, 2, 'x', { key: 'close', w: 12, h: 10 })) { ui.ui.close('journal'); return; }
    switch (TAB_IDS[st.tab]) {
      case 'quests': drawQuests(ui, store); break;
      case 'board': drawBoard(ui, store); break;
      case 'archive': drawArchive(ui, store); break;
      case 'logbook': drawLogbook(ui, store); break;
      case 'bestiary': drawBestiary(ui, store); break;
      case 'fish': drawFish(ui, store); break;
      default: break;
    }
    if (st.msg && performance.now() - st.msgAt < 2500) ui.label(ui.w - 8, ui.h - 11, st.msg, { color: UI_COLORS.accent, align: 'right', outline: true });
  },
};
