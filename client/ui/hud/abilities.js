// WP6b HUD: ability bar (Q E R F, plus Z X with Second Calling) to the right of the hotbar, with cooldown wipes,
// charges, Surge affordability and a ready flash; the buff row under the HP bars; ability key input (cast at the
// cursor). Also opens the class / temper panels when the server sends self.ui { kind: 'class' | 'temper' } and keeps
// the Character panel beside the Inventory. Exports the ability icon kit used by the class and character panels.

import { content } from '../../../shared/data/index.js';
import { POS_QUANT } from '../../../shared/config.js';
import { drawText } from '../../render/text.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { drawIcon } from '../panels/draft.js';

const P = (r, i) => PAL[RAMPS[r][i]];
export const CLASS_STYLE = Object.freeze({
  bulwark: { color: P('stone', 3), light: P('stone', 4), dark: P('stone', 0), glyph: 'shield' },
  squallblade: { color: P('teal', 3), light: P('teal', 4), dark: P('teal', 0), glyph: 'blade' },
  brinesinger: { color: P('sea', 3), light: P('sea', 4), dark: P('sea', 0), glyph: 'wave' },
  gearwright: { color: P('gold', 2), light: P('gold', 4), dark: P('gold', 0), glyph: 'cog' },
  prospector: { color: P('brown', 4), light: P('sand', 4), dark: P('brown', 0), glyph: 'pick' },
  greenwarden: { color: P('grass', 3), light: P('grass', 4), dark: P('grass', 0), glyph: 'leaf' },
});
const INK0 = P('ink', 0), INK1 = P('ink', 1), INK2 = P('ink', 2), INK3 = P('ink', 3), GOLD = P('gold', 4), DIM = P('stone', 3), BAD = P('ember', 3), SEA = P('sea', 4);

const G = {
  shield: ['.######.', '##....##', '#.####.#', '#.####.#', '#.####.#', '.#.##.#.', '..#..#..', '...##...'],
  blade: ['.......#', '......#.', '.....#..', '....#...', '.#.#....', '..#.....', '.#.#....', '#.......'],
  wave: ['........', '..###...', '.#...#..', '#..#..#.', '..#.#..#', '.#...##.', '#.......', '........'],
  cog: ['..#..#..', '.######.', '##.##.##', '.##..##.', '.##..##.', '##.##.##', '.######.', '..#..#..'],
  pick: ['.######.', '#..##..#', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  leaf: ['.....##.', '...####.', '..#####.', '.######.', '.#####..', '.####...', '#.##....', '#.......'],
};
function glyph(ctx, name, x, y, s, color) {
  const g = G[name];
  if (!g) return;
  ctx.fillStyle = color;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] === '#') ctx.fillRect(x + c * s, y + r * s, s, s);
}

// Ability icon: WP3's 'icon.ability.<id>' sprite if present, else a class-coloured tile with the class glyph and
// pips for the slot (Q = 1 ... F = 4).
export function drawAbilityIcon(ctx, sprites, abilityId, x, y, size = 20, opts = {}) {
  const def = content.abilities.byId[abilityId];
  const st = CLASS_STYLE[def?.class] ?? CLASS_STYLE.bulwark;
  ctx.fillStyle = INK0; ctx.fillRect(x, y, size, size);
  const spriteId = 'icon.ability.' + abilityId;
  if (sprites?.entries?.has?.(spriteId)) {
    ctx.fillStyle = st.dark; ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    if (size >= 16) drawIcon(ctx, sprites, spriteId, x, y, size);
    else { ctx.save(); ctx.translate(x + 1, y + 1); ctx.scale((size - 2) / 16, (size - 2) / 16); drawIcon(ctx, sprites, spriteId, 0, 0, 16); ctx.restore(); }
  } else {
    ctx.fillStyle = st.dark; ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = st.color; ctx.fillRect(x + 1, y + 1, size - 2, Math.round((size - 2) * 0.45));
    const s = size >= 18 ? 2 : 1;
    glyph(ctx, st.glyph, x + Math.round((size - 8 * s) / 2) + 1, y + Math.round((size - 8 * s) / 2) + 1, s, INK0);
    glyph(ctx, st.glyph, x + Math.round((size - 8 * s) / 2), y + Math.round((size - 8 * s) / 2), s, st.light);
    const slot = def?.slot ?? 0;
    for (let i = 0; i <= slot; i++) { ctx.fillStyle = GOLD; ctx.fillRect(x + size - 3 - i * 3, y + 2, 2, 2); }
  }
  if (opts.signature) { ctx.fillStyle = GOLD; ctx.fillRect(x + 1, y + size - 3, size - 2, 2); }
  if (opts.dim) { ctx.fillStyle = 'rgba(13,10,20,0.6)'; ctx.fillRect(x, y, size, size); }
}

// Mastery upgrade and Signature texts (DESIGN 10.x tables).
export const ABILITY_TEXT = Object.freeze({
  breakwater: ['blocked hits restore 5 Surge', 'guard covers 360 degrees'],
  anchor_slam: ['leaves a slowing crater 4 s', 'second slam for 110% after 0.6 s'],
  rally_horn: ['also cleanses debuffs', 'allies also gain +20% damage'],
  unmoored: ['duration 14 s', 'kills during it extend it 1 s (max +6 s)'],
  gale_step: ['2 charges', 'leaves a wind wall that blocks projectiles 2 s'],
  crosscurrent: ['pulls enemies inward', 'each enemy hit reduces its cooldown 0.5 s'],
  riptide_mark: ['mark spreads on death', 'marked target cannot be healed or shielded'],
  tempest: ['18 strikes', 'final strike is a guaranteed crit for 400%'],
  brine_bolt: ['splits into 3 on first hit', 'every third bolt is free and deals 300%'],
  undertow: ['ends with a 200% burst', 'vortex follows the cursor'],
  tidepool: ['allies also gain +20% swing speed', 'revives one downed ally inside it'],
  kingwave: ['returns as a second wave for 450%', 'leaves the ground soaked 6 s: enemies slowed 40%'],
  pocket_turret: ['max 3', 'turrets fire piercing bolts'],
  overclock: ['affects all within 3 tiles', 'also refills the tend meter of machines within 12 tiles'],
  magnet_coil: ['also 150% damage', 'pulled drops are doubled 10% of the time'],
  clockwork_legion: ['6 Scuttlers', 'Scuttlers explode for 200% when they expire'],
  seismic_strike: ['radius 4', 'drops fly straight to you'],
  vein_sense: ['spawns 1 gem node', 'duration 30 s'],
  blast_charge: ['leaves 3 mini-charges', '2 charges stored'],
  motherlode: ['20 s and triple drops', 'allies within 8 tiles share it'],
  thornlash: ['roots 1 s', 'hits also harvest plants and crops in the cone'],
  quickgrow: ['radius 6', 'two stages'],
  sproutling: ['2 Sproutlings', 'Sproutlings heal allies 2% max HP/s within 3 tiles'],
  verdant_tide: ['also respawns nodes in radius', 'radius 9'],
});

export function abilityTooltip(store, id) {
  const def = content.abilities.byId[id];
  if (!def) return '';
  const cls = store.self.class || {};
  const m = cls.mastery?.[def.class]?.lv ?? 0;
  const up = m >= def.upgrade.mastery;
  const sig = (store.self.sig?.[def.class] || []).includes(id);
  const stats = store.self.stats || {};
  const cost = Math.round(def.surge * (1 + Math.max(-0.5, stats.surgeCost || 0)));
  const cd = (def.cd * (1 - Math.min(0.5, stats.cdr || 0))).toFixed(1).replace(/\.0$/, '');
  const [upT, sigT] = ABILITY_TEXT[id] || ['', ''];
  return [
    `${def.name}  (${cost} Surge, ${cd} s)`, def.text,
    `${up ? '[ON]' : '[  ]'} Mastery ${def.upgrade.mastery}: +25%, ${upT}`,
    `${sig ? '[ON]' : '[  ]'} Signature: ${sigT}`,
  ].join('\n');
}

const BUFF_NAMES = { rested: 'Rested: +25% XP', wake: 'Wake: +100% XP while catching up', rally: 'Rally Horn', overclock: 'Overclocked', tidepool: 'Tidepool: +20% swing speed', breakwater: 'Breakwater guard', bandage: 'Bandaged' };
const buffName = (id) => BUFF_NAMES[id] ?? content.items.byId[id]?.name ?? content.abilities.byId[id]?.name ?? id.replace(/_/g, ' ');

const st = { lastUi: null, invOpen: false, ready: {}, shake: {}, msg: '', msgAt: 0, bound: false };
const now = () => performance.now() / 1000;

function keyLabel(input, action) {
  const code = input.bindings?.[action]?.[0] ?? '';
  return code.replace(/^Key|^Digit/, '').slice(0, 2);
}

function cast(mgr, store, slot, def) {
  const cam = globalThis.__tb?.camera;
  const aim = cam ? mgr.input.aimTile(cam) : null;
  const d = { slot };
  if (aim) { d.ax = Math.round(aim.x * POS_QUANT); d.ay = Math.round(aim.y * POS_QUANT); }
  mgr.net.do('ability.cast', d).then((res) => {
    if (res.ok) return;
    st.shake[slot] = now();
    st.msg = res.err === 'cost' ? 'Not enough Surge' : res.err === 'cooldown' ? `${def.name} is not ready` : res.err === 'locked' ? 'Locked' : res.err === 'invalid' ? 'No target' : '';
    st.msgAt = now();
    mgr.sound('deny');
  });
}

export default {
  id: 'abilities',
  anchor: 'bottom',
  order: 21,
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, t = now();
    // server-opened panels
    if (!st.bound) {
      st.bound = true;
      st.lastUi = store.self.ui?.n ?? null;
      store.on('welcome', (m) => { st.lastUi = m.self?.ui?.n ?? null; });
    }
    const u = store.self.ui;
    if (u && u.n !== st.lastUi) {
      if (u.kind === 'class' || u.kind === 'temper') mgr.open(u.kind, { ...u });
      st.lastUi = u.n;
    }
    // Character panel follows the Inventory
    const invOpen = mgr.isOpen('inventory');
    if (invOpen !== st.invOpen) { st.invOpen = invOpen; if (invOpen) mgr.open('character'); else mgr.close('character'); }

    const cls = store.self.class;
    const slots = cls?.slots || [];
    const cds = store.self.cooldowns;
    const serverNow = (store.serverTime?.(performance.now()) ?? 0) / 1000;
    const surge = store.self.surge?.cur ?? 0;
    const stats = store.self.stats || {};
    const hotbarW = 8 * 20 + 7 * 2;
    const S = 20, GAP = 2;
    let x = Math.round((ui.w + hotbarW) / 2) + 10;
    const y = ui.h - 39;
    const shown = slots.map((s, i) => ({ ...s, i })).filter((s) => s.ability && (s.i < 4 || cls?.secondCalling));
    if (shown.length) ui.rect(x - 3, y - 3, shown.length * (S + GAP) + (shown.some((s) => s.i >= 4) ? 6 : 0) + 4, S + 6, 'rgba(13,10,20,0.55)');
    for (const s of shown) {
      if (s.i === 4) x += 6;
      const def = content.abilities.byId[s.ability];
      const sh = st.shake[s.i] && t - st.shake[s.i] < 0.25 ? Math.round(Math.sin((t - st.shake[s.i]) * 60) * 2) : 0;
      const ax = ui.x + x + sh, ay = ui.y + y;
      const sig = (store.self.sig?.[def.class] || []).includes(def.id);
      drawAbilityIcon(ctx, mgr.sprites, def.id, ax, ay, S, { dim: !s.unlocked, signature: sig });
      const cost = Math.round(def.surge * (1 + Math.max(-0.5, stats.surgeCost || 0)));
      let cooling = false;
      if (s.unlocked) {
        const c = cds?.list?.[def.id];
        const [readyAt = 0, dur = 1, charges = 1, max = 1] = c || [];
        const left = readyAt - serverNow;
        if (charges < max && left > 0) {
          const frac = Math.max(0, Math.min(1, left / Math.max(0.1, dur)));
          cooling = charges < 1;
          ctx.fillStyle = cooling ? 'rgba(13,10,20,0.68)' : 'rgba(13,10,20,0.35)';
          ctx.beginPath();
          ctx.moveTo(ax + S / 2, ay + S / 2);
          ctx.arc(ax + S / 2, ay + S / 2, S, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.closePath();
          ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, S, S); ctx.clip();
          ctx.beginPath(); ctx.moveTo(ax + S / 2, ay + S / 2); ctx.arc(ax + S / 2, ay + S / 2, S, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.closePath(); ctx.fill();
          ctx.restore();
          if (cooling) drawText(ctx, left < 3 ? left.toFixed(1) : String(Math.ceil(left)), ax + S / 2, ay + 6, { align: 'center' });
        }
        if (max > 1) drawText(ctx, String(charges), ax + S - 1, ay + 1, { align: 'right', color: GOLD });
        const wasCooling = st.ready[s.i];
        if (wasCooling && !cooling) st.ready[s.i] = -t;
        else if (cooling) st.ready[s.i] = 1;
        if (st.ready[s.i] < 0 && t + st.ready[s.i] < 0.25) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - (t + st.ready[s.i]) / 0.25)})`; ctx.fillRect(ax, ay, S, S); }
        if (!cooling && surge < cost) { ctx.fillStyle = 'rgba(31,86,135,0.55)'; ctx.fillRect(ax, ay, S, S); }
        if (!cooling) drawText(ctx, String(cost), ax + S - 1, ay + S - 7, { align: 'right', color: surge < cost ? BAD : SEA });
      } else {
        drawText(ctx, 'Lv' + s.level, ax + S / 2, ay + 7, { align: 'center', color: DIM });
      }
      drawText(ctx, keyLabel(mgr.input, 'ability' + (s.i + 1)), ax + S / 2, ay - 9, { color: s.unlocked ? '#ffffff' : DIM, align: 'center' });
      if (ui.hover(x, y, S, S)) ui.tooltip(s.unlocked ? abilityTooltip(store, def.id) : `${def.name}: unlocks at level ${s.level}\n${def.text}`);
      x += S + GAP;
    }
    if (!shown.length && (store.self.xp?.level ?? 1) >= 10 && !cls?.id) {
      const pulse = Math.sin(t * 3) > 0 ? GOLD : DIM;
      drawText(ctx, 'Choose a class at a Calling Shrine', ui.x + x, ui.y + y + 6, { color: pulse });
    }
    if (st.msg && t - st.msgAt < 1.4) drawText(ctx, st.msg, ui.x + Math.round((ui.w + hotbarW) / 2) + 10, ui.y + y - 20, { color: BAD });

    // ability keys
    if (!mgr.input.textCapture && !mgr.anyModal()) {
      for (const s of shown) {
        if (!mgr.input.pressed('ability' + (s.i + 1))) continue;
        const def = content.abilities.byId[s.ability];
        if (!s.unlocked) { st.shake[s.i] = t; mgr.sound('deny'); continue; }
        cast(mgr, store, s.i, def);
      }
    }

    // buff row under the HP / Surge bars
    const buffs = store.self.buffs?.list || [];
    let bx = 6;
    const by = 24;
    for (const b of buffs) {
      const left = b.until == null ? null : b.until - serverNow;
      const bxx = ui.x + bx, byy = ui.y + by;
      ctx.fillStyle = INK0; ctx.fillRect(bxx, byy, 14, 14);
      ctx.fillStyle = b.kind === 'food' ? P('grass', 1) : b.kind === 'tonic' ? P('violet', 1) : INK2;
      ctx.fillRect(bxx + 1, byy + 1, 12, 12);
      if (content.abilities.byId[b.id]) drawAbilityIcon(ctx, mgr.sprites, b.id, bxx + 1, byy + 1, 12);
      else if (content.items.byId[b.id]) { if (!drawIcon(ctx, mgr.sprites, 'icon.buff.' + b.id, bxx - 1, byy - 1, 16)) mgr.sprites?.draw(ctx, 'item.' + b.id, bxx + 7, byy + 13, { scaleX: 0.7, scaleY: 0.7 }); }
      else drawText(ctx, b.id.slice(0, 2).toUpperCase(), bxx + 7, byy + 4, { align: 'center', color: GOLD, outline: false });
      if (left != null && b.dur) {
        const f = Math.max(0, Math.min(1, left / b.dur));
        ctx.fillStyle = INK1; ctx.fillRect(bxx, byy + 15, 14, 2);
        ctx.fillStyle = left < 10 && Math.sin(t * 10) > 0 ? BAD : GOLD; ctx.fillRect(bxx, byy + 15, Math.round(14 * f), 2);
      }
      if (b.stacks > 1) drawText(ctx, String(b.stacks), bxx + 13, byy + 7, { align: 'right' });
      if (ui.hover(bx, by, 14, 17)) ui.tooltip(`${buffName(b.id)}${left != null ? `\n${left >= 60 ? Math.floor(left / 60) + ' min ' : ''}${Math.max(0, Math.round(left % 60))} s left` : ''}`);
      bx += 16;
    }
  },
};
