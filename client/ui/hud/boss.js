// WP5/WP10 combat HUD (top centre): boss bars with phase ticks, a lagging damage trail and an enrage warning;
// boss name and phase banners; the Tidebreak raid banner; the downed / respawn overlay; the dungeon run strip
// (name, floor, blessings) with a room map; dungeon darkness pass. Opens the dungeon panel when the server
// offers an entry, a blessing choice or run results.

import { content } from '../../../shared/data/index.js';
import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { ensurePasses } from '../../render/drawers/zone.js';

const C = (r, i) => PAL[RAMPS[r][i]];
const ROMAN = ['I', 'II', 'III', 'IV'];
const ROOM_COLOR = { start: 'stone', combat: 'ember', stairs: 'gold', keeper: 'violet', puzzle: 'sea', treasure: 'gold', trap: 'brown', blessing: 'grass' };

const banners = [];             // { text, sub, t, life, color }
const seen = new Map();         // boss entity id -> { ph }
const lag = new Map();          // boss kind -> trailing hp fraction
let lastIn = false, lastEntryAt = null, lastOffer = null, lastResults = null, deathRecv = null, deathAt = 0;

function banner(text, sub, color = '#ffffff', life = 2.4) { banners.push({ text, sub, t: 0, life, color }); if (banners.length > 3) banners.shift(); }

function bossName(k) { return content.bosses?.byId?.[k]?.name ?? k; }

function drawBossBars(ui, store, now, dt) {
  const me = store.me();
  const groups = new Map();
  for (const e of store.entities.values()) {
    if (e.ty !== 'boss') continue;
    if (me && Math.hypot(e.x - me.x, e.y - me.y) > 40) continue;
    let g = groups.get(e.k);
    if (!g) { g = { k: e.k, hp: 0, mh: 0, ph: 0, en: 0, cx: 0, list: [] }; groups.set(e.k, g); }
    g.hp += Math.max(0, e.hp); g.mh += e.mh; g.ph = Math.max(g.ph, e.ph ?? 0); g.en |= e.en ?? 0; g.cx |= e.cx ?? 0; g.list.push(e);
    const s = seen.get(e.i);
    if (!s) { seen.set(e.i, { ph: e.ph ?? 0 }); if (!seen.has('k:' + e.k + ':' + Math.floor(now / 60000))) { seen.set('k:' + e.k + ':' + Math.floor(now / 60000), 1); banner(bossName(e.k).toUpperCase(), content.bosses?.byId?.[e.k]?.kind === 'keeper' ? 'Keeper of the Vault' : content.bosses?.byId?.[e.k]?.kind === 'final' ? 'The tide made flesh' : 'Warden', C('gold', 4), 3); } }
    else if ((e.ph ?? 0) > s.ph) { s.ph = e.ph; banner(`PHASE ${ROMAN[e.ph] ?? e.ph + 1}`, bossName(e.k), C('ember', 4), 2); }
  }
  // bars sit just above the hotbar/ability row (the top centre belongs to the goal tracker)
  let y = ui.h - 92 - (groups.size - 1) * 22;
  const w = Math.min(280, ui.w - 120);
  const x = Math.round((ui.w - w) / 2);
  for (const g of groups.values()) {
    const frac = g.mh > 0 ? g.hp / g.mh : 0;
    const l = Math.max(frac, (lag.get(g.k) ?? frac) - dt * 0.35);
    lag.set(g.k, l);
    ui.rect(x - 2, y - 1, w + 4, 18, UI_COLORS.borderDark);
    ui.label(x + w / 2, y, bossName(g.k), { color: g.en ? C('ember', 4) : C('gold', 4), align: 'center', outline: true });
    const by = y + 9;
    ui.rect(x, by, w, 6, UI_COLORS.bg);
    ui.rect(x, by, Math.round(w * l), 6, '#ffffff');
    ui.rect(x, by, Math.round(w * frac), 6, g.cx ? C('gold', 3) : g.en ? C('ember', 2) : C('violet', 3));
    ui.rect(x, by, Math.round(w * frac), 1, g.cx ? C('gold', 4) : C('violet', 4));
    const phases = content.bosses?.byId?.[g.k]?.phases ?? [1, 0.66, 0.33];
    for (const p of phases.slice(1)) ui.rect(x + Math.round(w * p), by - 1, 1, 8, C('stone', 4));
    if (g.en) ui.label(x + w + 6, by - 2, 'ENRAGED', { color: Math.floor(now / 250) % 2 ? C('ember', 4) : C('ember', 2), outline: true });
    if (g.list.length > 1) ui.label(x - 6, by - 2, `x${g.list.filter((e) => e.hp > 0).length}`, { color: '#ffffff', align: 'right', outline: true });
    y += 22;
  }
  return y;
}

function drawRaid(ui, store, y) {
  const r = store.world.raid;
  if (!r?.active) return y;
  const text = r.wave > 0 ? `TIDEBREAK - WAVE ${r.wave}/${r.waves}  (${r.left} left)` : 'TIDEBREAK - THE TIDE IS TURNING';
  ui.label(6, y, text, { color: Math.floor(performance.now() / 400) % 2 ? C('ember', 4) : C('ember', 3), outline: true });
  return y + 11;
}

function drawDungeon(ui, store, y) {
  const d = store.self.dungeon;
  if (!d?.in) return y;
  const line = d.kind === 'trench' ? `THE TRENCH - FLOOR ${d.floor}` : d.kind === 'moon' ? (d.name ?? '').toUpperCase() : `${(d.name ?? '').toUpperCase()} - FLOOR ${d.floor}/${d.floors}`;
  ui.label(6, y, line, { color: C('teal', 4), outline: true });
  const lw = line.length * 6 + 8;
  if (ui.hover(4, y - 1, lw, 10)) {
    ui.tooltip('Run details / leave');
    if (ui.ui.mouse.released) { ui.ui.open('dungeon', { view: 'run' }); ui.ui.consumeClick(); }
  }
  y += 10;
  const bl = d.blessings ?? [];
  if (bl.length) {
    let bx = 6;
    for (const id of bl) {
      ui.rect(bx, y, 9, 9, UI_COLORS.borderDark);
      ui.rect(bx + 1, y + 1, 7, 7, C('gold', 3));
      ui.rect(bx + 3, y + 3, 3, 3, '#ffffff');
      if (ui.hover(bx, y, 9, 9)) { const b = content.blessings?.byId?.[id]; ui.tooltip(`${b?.name ?? id}\n${b?.text ?? ''}`); }
      bx += 12;
    }
    y += 12;
  }
  // room map (left side)
  if (d.rooms && d.w) {
    const s = 0.9;
    const mw = Math.round(d.w * s * 0.5), mh = Math.round(d.h * s * 0.5);
    const mx = 6, my = Math.max(y + 4, Math.round(ui.h * 0.32));
    ui.rect(mx - 2, my - 2, mw + 4, mh + 4, 'rgba(13,10,20,0.6)');
    for (const [i, r] of d.rooms.entries()) {
      if (!r.v) continue;
      const col = C(ROOM_COLOR[r.t] ?? 'stone', r.s === 2 ? 2 : 3);
      ui.rect(mx + Math.round(r.x * s * 0.5), my + Math.round(r.y * s * 0.5), Math.max(2, Math.round(r.w * s * 0.5)), Math.max(2, Math.round(r.h * s * 0.5)), i === d.room ? '#ffffff' : col);
    }
    const me = store.me();
    if (me) ui.rect(mx + Math.round(me.x * s * 0.5) - 1, my + Math.round(me.y * s * 0.5) - 1, 2, 2, C('ember', 4));
  }
  return y;
}

function drawDeath(ui, store, now) {
  const d = store.self.death;
  if (!d || d.state === 'alive') return;
  if (deathRecv !== d) { deathRecv = d; deathAt = now; }
  const el = (now - deathAt) / 1000;
  const cx = Math.round(ui.w / 2), cy = Math.round(ui.h * 0.4);
  ui.rect(0, cy - 14, ui.w, 34, 'rgba(13,10,20,0.55)');
  if (d.state === 'down') {
    const left = Math.max(0, (d.downIn ?? 0) - el);
    ui.label(cx, cy - 8, 'DOWNED', { color: C('ember', 4), align: 'center', outline: true, scale: 2 });
    ui.label(cx, cy + 8, `An ally can revive you - ${Math.ceil(left)}s`, { color: '#ffffff', align: 'center', outline: true });
    if (d.revive > 0) ui.bar(cx - 50, cy + 18, 100, 5, d.revive, 1, C('grass', 3));
  } else {
    const left = d.respawnIn != null ? Math.max(0, d.respawnIn - el) : null;
    ui.label(cx, cy - 8, 'SWEPT AWAY', { color: C('sea', 4), align: 'center', outline: true, scale: 2 });
    ui.label(cx, cy + 8, left != null ? `Washing ashore in ${Math.ceil(left)}...` : 'Waiting for the party...', { color: '#ffffff', align: 'center', outline: true });
  }
}

function drawBanners(ui, dt) {
  for (let i = banners.length - 1; i >= 0; i--) {
    const b = banners[i];
    b.t += dt;
    if (b.t >= b.life) { banners.splice(i, 1); continue; }
    const k = b.t / b.life;
    const a = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = Math.round(ui.h * 0.22) + i * 30;
    const ctx = ui.ctx;
    ctx.globalAlpha = a * 0.55;
    ui.rect(0, y - 4, ui.w, 28, '#0d0a14');
    ctx.globalAlpha = a;
    ui.label(Math.round(ui.w / 2), y, b.text, { color: b.color, align: 'center', outline: true, scale: 2 });
    if (b.sub) ui.label(Math.round(ui.w / 2), y + 16, b.sub, { color: C('stone', 4), align: 'center', outline: true });
    ctx.globalAlpha = 1;
  }
}

function autoOpen(ui, store) {
  const d = store.self.dungeon;
  if (!d) return;
  const mgr = ui.ui;
  // stepping through an entrance closes the entry panel
  if (d.in !== lastIn) { if (d.in && mgr.isOpen('dungeon') && !d.offer) mgr.close('dungeon'); lastIn = d.in; }
  const entryAt = d.entry?.at ?? null;
  if (!d.in && entryAt != null && entryAt !== lastEntryAt) { lastEntryAt = entryAt; mgr.open('dungeon', { view: 'entry' }); }
  const offerKey = d.offer ? d.offer.altar + ':' + d.offer.choices.join(',') : null;
  if (offerKey && offerKey !== lastOffer) { lastOffer = offerKey; mgr.open('dungeon', { view: 'offer' }); }
  if (!offerKey) lastOffer = null;
  const resKey = d.results ? JSON.stringify(d.results) : null;
  if (resKey && resKey !== lastResults) { lastResults = resKey; banner(d.results.cleared ? 'VAULT CLEARED' : 'RUN OVER', d.results.name ?? '', C('gold', 4), 3.5); mgr.open('dungeon', { view: 'results' }); }
}

let lastNow = 0;
export default {
  id: 'boss',
  anchor: 'top',
  order: 40,
  draw(ui, store) {
    const now = performance.now();
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    ensurePasses({ store });
    drawBossBars(ui, store, now, dt);
    // run / raid strip under the HP and Surge bars (top-left)
    const y = drawRaid(ui, store, 26);
    drawDungeon(ui, store, y);
    drawDeath(ui, store, now);
    drawBanners(ui, dt);
    autoOpen(ui, store);
    if (seen.size > 200) seen.clear();
  },
};
