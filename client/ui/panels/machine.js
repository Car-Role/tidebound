// Machine panel (WP8, DESIGN 8.0/21): opens when you use a machine (server sends self.machine with open: true and keeps
// it updated about once per second while you stay near). Shows status, speed, Flux, the Tending meter, the machine's
// slots (take all / put from your bag), and type-specific config: Autobench recipe, Filter Arm whitelist, Burrow name
// and Scuttler hat, Echo Chamber Vault, Gull Roost Supply/Request tags. Report tab: world items made / used per minute
// over the last 10 minutes (world.report).

import { content } from '../../../shared/data/index.js';
import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';

const C = (ramp, i) => PAL[RAMPS[ramp][i]];
const HATS = ['none', 'cos_d_machines', 'cos_d_burrow', 'cos_d_sluice', 'cos_d_gulls', 'cos_d_auto', 'cos_d_flux', 'cos_d_sold', 'cos_d_glint', 'cos_d_mint', 'cos_d_tend'];
const ST = { UNTENDED: 1, LOWFLUX: 2, WORKING: 4, OFF: 8, BLOCKED: 16, NOINPUT: 32 };
const iname = (id) => content.items.byId[id]?.name ?? id;
const sname = (id) => content.structures.byId[id]?.name ?? id;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const st = { id: null, tab: 0, msg: '', msgT: 0, filterFor: null, recipeScroll: 0 };

function say(text) { st.msg = text; st.msgT = performance.now(); }

function cfg(ui, d, okText) {
  return ui.ui.net.do('machine.config', d).then((r) => {
    if (!r.ok) { say({ range: 'Too far away', locked: 'Locked', full: 'No room', invalid: 'Not possible here' }[r.err] ?? r.err); ui.ui.sound('deny'); }
    else if (okText) say(okText);
    return r;
  });
}

function statusText(v) {
  const s = v.status | 0;
  if (v.disabled) return ['Disabled (raid damage)', UI_COLORS.bad];
  if (s & ST.OFF) return ['Switched off', UI_COLORS.dim];
  if (s & ST.UNTENDED) return ['Untended: 10% speed', UI_COLORS.bad];
  if (s & ST.LOWFLUX) return ['Low Flux', UI_COLORS.bad];
  if (s & ST.BLOCKED) return ['Output full', C('gold', 4)];
  if (s & ST.WORKING) return ['Working', UI_COLORS.good];
  if (s & ST.NOINPUT) return ['Waiting for input', UI_COLORS.dim];
  return ['Idle', UI_COLORS.dim];
}

function slotsRow(ui, x, y, label, slots, opts = {}) {
  if (!slots) return y;
  ui.label(x, y, label, { color: UI_COLORS.dim });
  const per = opts.per ?? 6;
  slots.forEach((s, i) => {
    ui.slot(x + (i % per) * 19, y + 9 + Math.floor(i / per) * 19, s, { tooltip: s ? `${iname(s[0])} x${s[1]}` : null });
  });
  return y + 9 + Math.ceil(slots.length / per) * 19 + 2;
}

// ---------------------------------------------------------------- type-specific sections

function sectionAutobench(ui, v, x, y, w) {
  const r = v.recipe ? content.recipes.byId[v.recipe] : null;
  ui.label(x, y, r ? `Recipe: ${iname(r.out.item)} x${r.out.qty}` : 'Pick a recipe:', { color: r ? '#ffffff' : UI_COLORS.accent });
  y += 10;
  if (r) {
    const ins = r.in.map((i) => `${i.qty} ${i.item ? iname(i.item) : 'any ' + i.group.replace('_', ' ')}`).join(', ');
    ui.label(x, y, ins.length > 34 ? ins.slice(0, 33) + '.' : ins, { color: UI_COLORS.dim });
    y += 9;
    ui.label(x, y, `${v.time ?? r.time} s per craft  - made ${v.made ?? 0}`, { color: UI_COLORS.dim });
    y += 10;
    ui.bar(x, y, w, 4, v.prog ?? 0, Math.max(0.1, (v.time ?? r.time)), C('gold', 3));
    y += 7;
  }
  const list = v.recipes ?? [];
  const h = Math.max(24, 150 - y);
  ui.list(x, y, w, h, list, 11, (id, ry, hot) => {
    const rr = content.recipes.byId[id];
    const sel = id === v.recipe;
    if (hot || sel) ui.rect(x, ry, w, 11, sel ? UI_COLORS.border : UI_COLORS.slotHover);
    ui.label(x + 2, ry + 2, `${iname(rr.out.item)}${rr.out.qty > 1 ? ' x' + rr.out.qty : ''}`, { color: sel ? UI_COLORS.accent : '#ffffff' });
    if (hot && ui.ui.mouse.released) { ui.ui.consumeClick(); cfg(ui, { id: v.id, recipe: id }, `Recipe: ${iname(rr.out.item)}`); }
  }, 'recipes');
  return y + h + 2;
}

function sectionFilter(ui, v, x, y) {
  ui.label(x, y, 'Whitelist (click a bag item to add):', { color: UI_COLORS.dim });
  y += 9;
  const f = v.filter ?? [];
  for (let i = 0; i < 4; i++) {
    const item = f[i];
    ui.slot(x + i * 19, y, item ? [item, 1] : null, {
      tooltip: item ? `${iname(item)}\nClick to remove` : 'Empty',
      onClick: item ? () => cfg(ui, { id: v.id, filter: f.filter((q) => q !== item) }) : null,
    });
  }
  st.filterFor = { id: v.id, list: f, kind: 'mover' };
  return y + 22;
}

function sectionBurrow(ui, v, x, y, w) {
  ui.label(x, y, `Nodes ${v.nodes}/${v.need} in ${v.radius} tiles (tier <= ${v.maxTier})`, { color: v.nodes >= v.need ? UI_COLORS.good : C('gold', 4) });
  y += 10;
  ui.label(x, y, `${v.rate}/min (base ${v.baseRate})  made ${v.made}`, { color: UI_COLORS.dim });
  y += 11;
  ui.label(x, y, `Name: ${v.name || '(unnamed)'}`, {});
  if (ui.button(x + w - 34, y - 2, 'Hat', { w: 34, h: 11, tooltip: `Scuttler hat: ${v.hat}\nClick to cycle (cosmetic)` })) {
    const next = HATS[(HATS.indexOf(v.hat ?? 'none') + 1) % HATS.length];
    ui.ui.net.do('burrow.rename', { id: v.id, hat: next });
  }
  return y + 12;
}

function sectionEcho(ui, v, x, y) {
  ui.label(x, y, v.k ? `Bound to Vault ${v.k}: 1 key per ${Math.round((v.interval ?? 1200) / 60)} min` : 'Bind to a cleared Vault:', { color: v.k ? '#ffffff' : UI_COLORS.accent });
  y += 10;
  for (let k = 1; k <= 6; k++) {
    const can = (v.cleared ?? []).includes(k);
    if (ui.button(x + (k - 1) * 19, y, String(k), { w: 17, h: 12, disabled: !can, key: 'vk' + k, tooltip: can ? `Vault ${k}` : `Vault ${k}: not cleared` })) cfg(ui, { id: v.id, k }, `Bound to Vault ${k}`);
  }
  y += 15;
  if (v.k) { ui.bar(x, y, 112, 4, v.acc ?? 0, v.interval ?? 1200, C('violet', 3)); ui.label(x + 116, y - 2, mmss((v.interval ?? 1200) - (v.acc ?? 0)), { color: UI_COLORS.dim }); y += 8; }
  return y;
}

function sectionRoost(ui, v, x, y, w) {
  ui.label(x, y, 'Containers (Supply -> Request):', { color: UI_COLORS.dim });
  y += 9;
  const list = v.containers ?? [];
  const h = Math.max(30, 150 - y);
  ui.list(x, y, w, h, list, 13, (c, ry, hot) => {
    if (hot) ui.rect(x, ry, w, 13, UI_COLORS.slotHover);
    ui.label(x + 2, ry + 3, `${sname(c.kind).slice(0, 10)} ${c.x},${c.y}`, { color: '#ffffff' });
    const bx = x + w - 66;
    if (ui.button(bx, ry + 1, 'Sup', { w: 20, h: 11, key: 'su' + c.id, tooltip: 'Supply: Gulls take from here' })) cfg(ui, { id: c.id, tag: c.tag === 'supply' ? null : 'supply' });
    if (ui.button(bx + 22, ry + 1, 'Req', { w: 20, h: 11, key: 'rq' + c.id, tooltip: 'Request: Gulls bring the whitelisted items here' })) cfg(ui, { id: c.id, tag: c.tag === 'request' ? null : 'request' });
    if (c.tag) ui.rect(c.tag === 'supply' ? bx : bx + 22, ry + 11, 20, 1, c.tag === 'supply' ? UI_COLORS.good : UI_COLORS.accent);
    if (c.tag === 'request' && ui.button(bx + 44, ry + 1, '+', { w: 20, h: 11, key: 'rf' + c.id, tooltip: `Wants: ${(c.filter ?? []).map(iname).join(', ') || 'nothing yet'}\nClick, then click a bag item (max 4)` })) {
      st.filterFor = { id: c.id, list: c.filter ?? [], kind: 'request' };
      say('Click a bag item to request it');
    }
  }, 'roost');
  y += h + 2;
  const busy = (v.gulls ?? []).filter((g) => g.phase !== 'idle').length;
  ui.label(x, y, `Gulls flying: ${busy}/${(v.gulls ?? []).length}`, { color: UI_COLORS.dim });
  return y + 10;
}

// ---------------------------------------------------------------- Report tab

function drawReport(ui, store) {
  const r = store.world.report;
  if (!r) { ui.label(10, 30, 'No machine has worked yet.', { color: UI_COLORS.dim }); return; }
  const items = new Set([...Object.keys(r.made ?? {}), ...Object.keys(r.used ?? {})]);
  const rows = [...items].map((id) => ({ id, made: r.made?.[id] ?? 0, used: r.used?.[id] ?? 0 })).sort((a, b) => (b.made - b.used) - (a.made - a.used));
  ui.label(10, 28, `World factory, per minute (last ${r.minutes} min)`, { color: UI_COLORS.dim });
  ui.label(ui.w - 70, 38, 'made', { color: UI_COLORS.good, align: 'right' });
  ui.label(ui.w - 14, 38, 'used', { color: UI_COLORS.bad, align: 'right' });
  ui.list(8, 48, ui.w - 16, ui.h - 56, rows, 12, (row, ry, hot) => {
    if (hot) ui.rect(8, ry, ui.w - 16, 12, UI_COLORS.slotHover);
    ui.ui.sprites?.draw(ui.ctx, 'item.' + row.id, ui.x + 16, ui.y + ry + 12, { scaleX: 0.6, scaleY: 0.6 });
    ui.label(26, ry + 2, iname(row.id), {});
    ui.label(ui.w - 70, ry + 2, row.made ? row.made.toFixed(1) : '-', { color: UI_COLORS.good, align: 'right' });
    ui.label(ui.w - 14, ry + 2, row.used ? row.used.toFixed(1) : '-', { color: UI_COLORS.bad, align: 'right' });
  }, 'report');
}

// ---------------------------------------------------------------- panel

export default {
  id: 'machine',
  key: null,
  modal: false,
  w: 290, h: 214, anchor: 'center',
  open(store, args) { st.id = args?.id ?? store.self.machine?.id ?? null; st.tab = 0; st.filterFor = null; },
  close() { st.id = null; st.filterFor = null; },
  draw(ui, store) {
    if (st.filterFor?.kind === 'mover') st.filterFor = null;      // re-armed below while a Filter Arm is shown
    const v = store.self.machine;
    const def = v ? content.structures.byId[v.kind] : null;
    ui.frame(def ? def.name : 'Machine');
    if (ui.button(ui.w - 16, 2, 'x', { w: 12, h: 10, key: 'close' })) { ui.ui.close('machine'); return; }
    if (!v) { ui.label(10, 30, 'Use a machine to configure it.', { color: UI_COLORS.dim }); return; }
    st.tab = ui.tabs(8, 14, ['Machine', 'Report'], st.tab);
    if (st.tab === 1) { drawReport(ui, store); return; }

    // ---- left column: status
    const L = 8, LW = 132;
    let y = 30;
    const [stText, stCol] = statusText(v);
    ui.label(L, y, stText, { color: stCol });
    if (v.type !== 'container' && ui.button(L + LW - 30, y - 2, v.on ? 'On' : 'Off', { w: 30, h: 11, key: 'onoff', tooltip: 'Switch the machine on or off' })) cfg(ui, { id: v.id, on: !v.on });
    y += 11;
    ui.label(L, y, `Speed x${(v.speed ?? 0).toFixed(2)}${v.bonus ? ` (+${Math.round(v.bonus * 100)}%)` : ''}`, { color: '#ffffff' });
    if (ui.hover(L, y, LW, 9)) ui.tooltip('min(3, 1 + bonuses) x Flux ratio x Tending');
    y += 10;
    if (v.type === 'generator') ui.label(L, y, `Output ${v.output ?? 0} Flux${v.cond === 'none' || v.cond === 'echoglass' ? `  fuel ${mmss(v.fuelT ?? 0)}` : ''}`, { color: C('ice', 4) });
    else if (v.flux > 0) ui.label(L, y, `Uses ${v.flux} Flux (${Math.round((v.fluxRatio ?? 1) * 100)}%)`, { color: (v.fluxRatio ?? 1) < 1 ? UI_COLORS.bad : UI_COLORS.dim });
    else ui.label(L, y, 'No Flux needed', { color: UI_COLORS.dim });
    y += 10;
    if (v.tend != null) {
      const low = v.tend <= 0;
      ui.label(L, y, low ? 'Untended!' : `Tended ${mmss(v.tend)}`, { color: low ? UI_COLORS.bad : UI_COLORS.dim });
      ui.bar(L + 84, y + 1, LW - 84, 5, v.tend, v.tendMax, low ? UI_COLORS.bad : UI_COLORS.good);
      if (ui.hover(L, y, LW, 9)) ui.tooltip('Tending drains while the machine works.\nIt refills when an active player is within 12 tiles.\nAt zero the machine runs at 10% speed.');
      y += 11;
    }
    y += 2;
    if (v.type === 'autobench') y = sectionAutobench(ui, v, L, y, LW);
    else if (v.type === 'mover' && v.filter) y = sectionFilter(ui, v, L, y);
    else if (v.type === 'burrow') y = sectionBurrow(ui, v, L, y, LW);
    else if (v.type === 'echo') y = sectionEcho(ui, v, L, y);
    else if (v.type === 'courier') y = sectionRoost(ui, v, L, y, LW);
    else if (v.type === 'seller') { ui.label(L, y, `${v.rate}/min at ${Math.round((v.pct ?? 0) * 100)}% value`, { color: UI_COLORS.dim }); y += 10; }
    else if (v.type === 'drill' && v.ore) { ui.label(L, y, `Drilling ${iname(v.ore)} (1% rare)`, { color: UI_COLORS.dim }); y += 10; }

    // ---- right column: slots
    const R = 148;
    let ry = 30;
    ry = slotsRow(ui, R, ry, 'Input', v.in);
    ry = slotsRow(ui, R, ry, 'Fuel', v.fuel);
    if (v.hold) { ui.label(R, ry, 'Holding', { color: UI_COLORS.dim }); ui.slot(R, ry + 9, [v.hold.item, v.hold.qty], { tooltip: iname(v.hold.item) }); ry += 30; }
    if (v.item) { ui.label(R, ry, 'On it', { color: UI_COLORS.dim }); ui.slot(R, ry + 9, [v.item, 1], { tooltip: iname(v.item) }); ry += 30; }
    ry = slotsRow(ui, R, ry, 'Output', v.out);
    const anything = [v.out, v.in, v.fuel].some((s) => s?.some(Boolean)) || v.hold;
    if (anything && ui.button(R, ry, 'Take all', { w: 60, h: 12, key: 'take' })) cfg(ui, { id: v.id, take: 'all' }, 'Taken');

    // ---- bag: put items in (or pick a whitelist / request item)
    const bag = store.self.inv?.slots ?? [];
    const by = ui.h - 30;
    const picking = st.filterFor && st.filterFor.id;
    ui.label(8, by - 9, picking ? 'Bag: click an item to whitelist it' : 'Bag: click to put a stack into the machine', { color: UI_COLORS.dim });
    for (let i = 0; i < Math.min(14, bag.length); i++) {
      const s = bag[i];
      ui.slot(8 + i * 19, by, s, {
        tooltip: s ? `${iname(s[0])} x${s[1]}` : null,
        onClick: s ? () => {
          if (picking) {
            const f = st.filterFor;
            if (f.list.includes(s[0]) || f.list.length >= 4) { say('Whitelist full or already listed'); return; }
            cfg(ui, { id: f.id, filter: [...f.list, s[0]] }, `${iname(s[0])} whitelisted`);
            if (f.kind === 'request') st.filterFor = null;
          } else cfg(ui, { id: v.id, put: { slot: i } }, `${iname(s[0])} added`);
        } : null,
      });
    }
    if (st.msg && performance.now() - st.msgT < 2500) ui.label(ui.w / 2, by - 20, st.msg, { color: UI_COLORS.accent, align: 'center', outline: true });
  },
};
