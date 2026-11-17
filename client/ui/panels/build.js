// WP4 build mode (B). A full-screen overlay: a categorised structure palette on the left (costs with have/need,
// exact lock reasons), and in the world a snapped ghost preview that is green when placeable and red with the reason
// when not. Tools: Till (1 fieldstone), Water, Plant (seeds), Deconstruct (refund preview). Hotbar seeds and
// placeable items open this panel directly in Plant / Place mode.
// Controls: LMB place (hold and drag for 1x1 and farm tools), mouse wheel or . rotates, RMB back to the palette,
// Esc closes, [ ] switch category.

import { content } from '../../../shared/data/index.js';
import { REACH } from '../../../shared/config.js';
import { T, FLAG, BIOME_TIER, biomeOf } from '../../../shared/grid.js';
import { structureCost } from '../../../shared/rules/costs.js';
import { drawText, measure } from '../../render/text.js';
import { C, itemName, structName, invCount, unlockText, worldToUi, mouseWorld, myPos, overOtherPanel, itemDef } from './inventory.js';

const BUILD_RANGE = REACH + 4;
const FARM_REACH = REACH + 1.5;
const LAND = new Set([T.SAND, T.GREENMARROW, T.SALTFEN, T.EMBERREACH, T.GLASSWASTE, T.HOARFROST, T.UMBRAL, T.SOIL, T.PATH, T.ICE, T.INK]);
const BIOME_GROUND = new Set([T.GREENMARROW, T.SALTFEN, T.EMBERREACH, T.GLASSWASTE, T.HOARFROST, T.UMBRAL]);
const TIER_MATS = content.modules.items?.TIER_MATS ?? [];
const CATS = [
  { id: 'station', label: 'Stations' }, { id: 'storage', label: 'Storage' }, { id: 'farming', label: 'Farming' },
  { id: 'automation', label: 'Automation' }, { id: 'flux', label: 'Flux' }, { id: 'defence', label: 'Defence' },
  { id: 'utility', label: 'Utility' }, { id: 'world', label: 'Beacons' }, { id: 'tools', label: 'Tools' },
];
const BY_CAT = {};
for (const s of content.structures) { if (s.natural) continue; (BY_CAT[s.cat === 'decor' ? 'utility' : s.cat] ||= []).push(s); }
const LOCKER_COLOURS = ['#e8c170', '#d4553a', '#5aa45a', '#3c78c8', '#8d5ac8', '#e0e0e0', '#2fb3a6', '#e078b4'];

const B = { mode: 'menu', cat: 0, kind: null, item: null, seed: null, rot: 0, colour: 0, last: null, msg: null, hoverKind: null, busy: false };

export function footprint(def, rot) {
  const w = def?.w ?? 1, h = def?.h ?? 1;
  return (rot & 1) ? { w: h, h: w } : { w, h };
}

function costLines(def, tx, ty) {
  return (def.cost ?? []).map((c) => {
    if (c.item) return c;
    if (c.group === 'rare_plot_tier') {
      const tier = BIOME_TIER[biomeOf(Math.floor(tx / 20), Math.floor(ty / 20))] ?? 1;
      return { item: TIER_MATS[tier]?.rare ?? 'shell', qty: c.qty };
    }
    return { item: c.group, qty: c.qty };
  });
}

export function costFor(store, def, tx = 0, ty = 0) {
  const b = store.self.build ?? {};
  const items = structureCost(costLines(def, tx, ty), { world: !!def.world, coop: def.world ? (b.coop ?? 1) : 1, discount: b.disc ?? 0, tideHeight: b.th ?? 0 });
  const glint = def.glint ? Math.ceil(def.glint * (def.world ? (b.coop ?? 1) : 1)) : 0;
  return { items, glint };
}

const unlocked = (store, kind) => (store.self.build?.ids ?? []).includes(kind);

function lockReason(def) {
  return 'Locked: ' + (def.unlock ?? []).map(unlockText).join(', ');
}

// Entity covering a tile (client side: structures by footprint around their centre, others by their tile).
function blockerAt(store, tx, ty) {
  for (const e of store.entities.values()) {
    if (e.ty === 'structure') {
      const d = content.structures.byId[e.k];
      const fp = footprint(d, e.rot ?? 0);
      const x0 = Math.round(e.x - fp.w / 2), y0 = Math.round(e.y - fp.h / 2);
      if (tx >= x0 && ty >= y0 && tx < x0 + fp.w && ty < y0 + fp.h) return e;
    } else if (e.ty === 'node' || e.ty === 'crop' || e.ty === 'chest' || e.ty === 'npc') {
      if (Math.floor(e.x) === tx && Math.floor(e.y) === ty) return e;
    }
  }
  return null;
}

function tileOk(def, g) {
  const on = def.place?.on ?? ['land'];
  if (on.includes('water')) return g === T.DEEP || g === T.SHALLOW;
  if (on.includes('soil')) return g === T.SOIL;
  if (g === T.SOIL && def.cat !== 'farming') return false;
  if (g === T.LAVA) return false;
  return LAND.has(g);
}

function edgeDist(tx, ty, w, h, x, y) {
  const dx = Math.max(tx - x, 0, x - (tx + w)), dy = Math.max(ty - y, 0, y - (ty + h));
  return Math.hypot(dx, dy);
}

// Client-side placement check mirroring the server's WP4 validators (the server stays authoritative).
function checkPlace(store, def, tx, ty, rot) {
  const { w, h } = footprint(def, rot);
  const me = myPos(store);
  if (!me) return 'Not connected';
  if (edgeDist(tx, ty, w, h, me.x, me.y) > BUILD_RANGE) return 'Too far away';
  if (!B.item && !unlocked(store, def.id)) return lockReason(def);
  let touchWater = false, touchLand = false;
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const f = store.flagsAt(x, y), g = store.groundAt(x, y);
      if (!(f & FLAG.OWNED)) return 'Not your land';
      if (!tileOk(def, g)) return g === T.SOIL ? 'Not on farmland' : (def.place?.on?.includes('water') ? 'Must be on water' : 'Bad ground');
      if (f & FLAG.SOLID) return 'Blocked';
      const b = blockerAt(store, x, y);
      if (b) return b.ty === 'node' ? 'Clear the node first' : 'Occupied';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = store.groundAt(x + dx, y + dy);
        if (n === T.DEEP || n === T.SHALLOW) touchWater = true;
        if (LAND.has(n)) touchLand = true;
      }
    }
  }
  if (def.place?.on?.includes('shore') && !touchWater) return 'Must touch water';
  if (def.place?.on?.includes('water') && !touchLand) return 'Must be next to land';
  if (def.place?.needs && biomeOf(Math.floor(tx / 20), Math.floor(ty / 20)) !== def.place.needs) return `Only in ${def.place.needs}`;
  if (def.solid !== false) {
    for (const e of store.entities.values()) {
      if (e.ty !== 'player' && e.ty !== 'mob') continue;
      const px = e.rx ?? e.x, py = e.ry ?? e.y;
      if (px + 0.3 > tx && px - 0.3 < tx + w && py + 0.3 > ty && py - 0.3 < ty + h) return 'Someone is standing there';
    }
  }
  if (B.item) return invCount(store, B.item) > 0 ? null : 'No ' + itemName(B.item) + ' left';
  const cost = costFor(store, def, tx, ty);
  for (const c of cost.items) if (invCount(store, c.item) < c.qty) return `Need ${c.qty - invCount(store, c.item)} more ${itemName(c.item)}`;
  if (cost.glint > (store.world.glint ?? 0)) return 'Not enough Glint';
  return null;
}

function checkTool(store, tool, tx, ty) {
  const me = myPos(store);
  if (!me) return 'Not connected';
  if (Math.hypot(tx + 0.5 - me.x, ty + 0.5 - me.y) > FARM_REACH) return 'Too far away';
  const g = store.groundAt(tx, ty), f = store.flagsAt(tx, ty);
  const b = blockerAt(store, tx, ty);
  if (tool === 'till') {
    if (!(f & FLAG.OWNED)) return 'Not your land';
    if (g === T.SOIL) return 'Already soil';
    if (!BIOME_GROUND.has(g)) return 'Till only on grass and earth';
    if (b || (f & FLAG.SOLID)) return 'Occupied';
    if (invCount(store, 'fieldstone') < 1) return 'Needs 1 Fieldstone';
    return null;
  }
  if (tool === 'water') {
    if (g !== T.SOIL) return 'Water soil or crops';
    if (b?.ty === 'crop') return b.w ? 'Already watered' : (b.st === -1 ? 'Withered' : null);
    return (f & FLAG.WATERED) ? 'Already watered' : null;
  }
  if (tool === 'plant') {
    const d = itemDef(B.seed);
    if (!d || invCount(store, B.seed) < 1) return 'No seeds left';
    if (d.use?.kind === 'plant_node') { if (g === T.SOIL || !LAND.has(g) || b || !(f & FLAG.OWNED)) return 'Plant it on free land'; return null; }
    if (g !== T.SOIL) return 'Plant on tilled soil';
    if (b) return b.ty === 'crop' ? 'Already planted' : 'Occupied';
    return null;
  }
  return null;
}

function structureAt(store, tx, ty) {
  const e = blockerAt(store, tx, ty);
  return e?.ty === 'structure' ? e : null;
}

function say(text, good = false) { B.msg = { text, good, t: 1.6 }; }

function act(mgr, store, tx, ty, def) {
  const reply = (r, okText) => {
    if (!r.ok) { say(r.d?.why ?? errText(r.err)); mgr.sound('deny'); }
    else if (okText) say(okText, true);
  };
  if (B.mode === 'place') {
    const res = checkPlace(store, def, tx, ty, B.rot);
    if (res) { say(res); mgr.sound('deny'); return; }
    mgr.net.do('build.place', { kind: def.id, tx, ty, rot: B.rot, ...(B.item ? { item: true } : {}), ...(def.id === 'brine_locker' ? { colour: B.colour } : {}) })
      .then((r) => { reply(r); if (r.ok && B.item && invCount(store, B.item) <= 1) B.mode = 'menu'; });
  } else if (B.mode === 'till' || B.mode === 'water' || B.mode === 'plant') {
    const res = checkTool(store, B.mode, tx, ty);
    if (res) { if (!B.dragging) { say(res); mgr.sound('deny'); } return; }
    const a = B.mode === 'till' ? 'farm.till' : B.mode === 'water' ? 'farm.water' : 'farm.plant';
    mgr.net.do(a, { tx, ty, ...(B.mode === 'plant' ? { seed: B.seed } : {}) }).then((r) => reply(r));
  } else if (B.mode === 'remove') {
    const e = structureAt(store, tx, ty);
    if (!e) return;
    const d = content.structures.byId[e.k];
    if (d?.world || d?.natural) { say('World structures cannot be removed'); mgr.sound('deny'); return; }
    mgr.net.do('build.remove', { id: e.i }).then((r) => reply(r, 'Removed'));
  }
}

const ERR = { range: 'Too far away', cost: 'Missing materials', locked: 'Locked', busy: 'Occupied', denied: 'Not allowed here', invalid: 'Cannot place there', full: 'Full' };
const errText = (e) => ERR[e] ?? 'Cannot do that';

function drawGhostTiles(ctx, mgr, tx, ty, w, h, color, alpha = 0.35) {
  const a = worldToUi(mgr, tx, ty), s = a?.s;
  if (!a) return null;
  const px = a.x, py = a.y, tw = 16 * s;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, tw * w, tw * h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(px) + 0.5, Math.round(py) + 0.5, Math.round(tw * w) - 1, Math.round(tw * h) - 1);
  return { px, py, tw };
}

function drawStructGhost(ctx, mgr, def, tx, ty, rot, ok, t) {
  const { w, h } = footprint(def, rot);
  const g = drawGhostTiles(ctx, mgr, tx, ty, w, h, ok ? C.grassLight : C.ember, ok ? 0.25 : 0.35);
  if (!g) return;
  const sp = mgr.sprites;
  const id = 'struct.' + def.id;
  const cx = g.px + (g.tw * w) / 2, by = g.py + g.tw * h;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(by));
  const s = g.tw / 16;
  ctx.scale(s, s);
  const bob = Math.sin(t * 6) * 0.6;
  if (sp?.has(id)) sp.draw(ctx, id, 0, bob, { alpha: ok ? 0.75 : 0.45, silhouette: ok ? undefined : '#d4553a', time: t });
  else { ctx.globalAlpha = 0.6; ctx.fillStyle = ok ? C.brown : C.ember; ctx.fillRect(-w * 8, -h * 16, w * 16, h * 16); ctx.globalAlpha = 1; }
  ctx.restore();
  // rotation arrow
  if (w !== h || def.w !== def.h) {
    drawText(ctx, ['>', 'v', '<', '^'][rot & 3], cx, g.py - 9, { align: 'center', color: C.goldLight });
  }
}

const TOOLS = [
  { mode: 'till', label: 'Till soil', icon: 'item.fieldstone', tip: 'Turn grass into farmland\nCosts 1 Fieldstone' },
  { mode: 'water', label: 'Water', icon: 'item.glass', tip: 'Water soil and crops\n(once per growth stage)' },
  { mode: 'remove', label: 'Deconstruct', icon: 'item.nail', tip: 'Remove your structures\nRefunds 75% of what was paid (100% with Builder)' },
];

// Palette on the left (below the party frames' top), mode bar centred above the hotbar and the draft badge.
const DETAIL_H = 66;   // structure detail box under the palette list: name, lock line, up to 4 costs, Glint
function menuRect(mgr) { return { x: 6, y: 46, w: 178, h: Math.min(mgr.H - 110, 260) }; }   // starts below a 3-line tutorial card
function barRect(mgr) {
  // centred, but never under the palette on narrow UIs (640 px wide at 1280x720)
  const m = menuRect(mgr), left = m.x + m.w + 8;
  const w = Math.min(300, mgr.W - left - 6);
  const x = Math.max(left, Math.round((mgr.W - w) / 2));
  return { x, y: mgr.H - 100, w, h: 22 };
}

const panel = {
  id: 'build',
  key: 'panel.build',
  modal: false,
  fullscreen: true,
  w: 320, h: 180, anchor: 'center',
  open(store, args) {
    B.mode = 'menu'; B.item = null; B.seed = null; B.msg = null;
    if (args?.tool === 'plant' && args.seed) { B.mode = 'plant'; B.seed = args.seed; }
    if (args?.tool === 'place' && args.kind) { B.mode = 'place'; B.kind = args.kind; B.item = args.item ?? null; B.rot = 0; }
  },
  close() { B.dragging = false; },
  // the panel is full screen (it owns world clicks); only its bar and palette take the mouse from the HUD
  hitRects(mgr) {
    const out = [barRect(mgr)];
    if (B.mode === 'menu') { const m = menuRect(mgr); out.push({ x: m.x - 2, y: m.y - 2, w: m.w + 4, h: m.h + 4 }); }
    return out;
  },
  draw(ui, store) {
    const mgr = ui.ui, ctx = ui.ctx, inp = mgr.input;
    panel.w = mgr.W; panel.h = mgr.H;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, B.lastT ? now - B.lastT : 0); B.lastT = now;
    const mw = mouseWorld(mgr);
    const overOther = overOtherPanel(mgr, 'build');
    const MENU = menuRect(mgr);
    const inMenu = B.mode === 'menu' && mgr.mouse.x < MENU.x + MENU.w + 2 && mgr.mouse.y > MENU.y - 4 && mgr.mouse.y < MENU.y + MENU.h + 4;
    if (inp.pressedSet.has('BracketLeft')) { B.cat = (B.cat + CATS.length - 1) % CATS.length; B.mode = 'menu'; }
    if (inp.pressedSet.has('BracketRight')) { B.cat = (B.cat + 1) % CATS.length; B.mode = 'menu'; }

    // ---------------- world interaction
    if (B.mode !== 'menu' && mw && !overOther) {
      const def = B.mode === 'place' ? content.structures.byId[B.kind] : null;
      if (def && (mgr.mouse.wheel || inp.pressedSet.has('Period'))) { B.rot = (B.rot + (mgr.mouse.wheel < 0 ? 3 : 1)) & 3; mgr.sound('ui_hover'); }
      const fp = def ? footprint(def, B.rot) : { w: 1, h: 1 };
      const tx = Math.floor(mw.x - fp.w / 2 + 0.5), ty = Math.floor(mw.y - fp.h / 2 + 0.5);
      if (B.mode === 'place' && def) {
        const why = checkPlace(store, def, tx, ty, B.rot);
        drawStructGhost(ctx, mgr, def, tx, ty, B.rot, !why, now);
        if (why) { const a = worldToUi(mgr, tx + fp.w / 2, ty); if (a) drawText(ctx, why, a.x, a.y - 22, { align: 'center', color: C.bad }); }
        const single = fp.w === 1 && fp.h === 1;
        if (mgr.input.mousePressed(0) || (single && mgr.input.mouseDown(0) && B.dragging && (B.last?.x !== tx || B.last?.y !== ty))) {
          B.dragging = true; B.last = { x: tx, y: ty };
          act(mgr, store, tx, ty, def);
        }
      } else if (B.mode === 'remove') {
        const t0x = Math.floor(mw.x), t0y = Math.floor(mw.y);
        const e = structureAt(store, t0x, t0y);
        if (e) {
          const d = content.structures.byId[e.k];
          const f = footprint(d, e.rot ?? 0);
          const x0 = Math.round(e.x - f.w / 2), y0 = Math.round(e.y - f.h / 2);
          const fixed = d?.world || d?.natural;
          drawGhostTiles(ctx, mgr, x0, y0, f.w, f.h, fixed ? C.stone : C.ember, 0.3 + Math.sin(now * 8) * 0.1);
          const a = worldToUi(mgr, e.x, y0);
          const full = store.self.build?.full;
          if (a) drawText(ctx, fixed ? `${structName(e.k)} cannot be removed` : `Remove ${structName(e.k)}: refund ${full ? '100%' : '75%'} of cost`, a.x, a.y - 12, { align: 'center', color: fixed ? C.dim : C.goldLight });
          if (mgr.input.mousePressed(0)) act(mgr, store, t0x, t0y, null);
        } else {
          drawGhostTiles(ctx, mgr, t0x, t0y, 1, 1, C.dim, 0.15);
        }
      } else {
        const t0x = Math.floor(mw.x), t0y = Math.floor(mw.y);
        const why = checkTool(store, B.mode, t0x, t0y);
        const col = B.mode === 'water' ? C.seaLight : B.mode === 'plant' ? C.grassLight : C.sand;
        drawGhostTiles(ctx, mgr, t0x, t0y, 1, 1, why ? C.ember : col, why ? 0.25 : 0.4);
        if (B.mode === 'plant' && !why) {
          const a = worldToUi(mgr, t0x + 0.5, t0y + 1);
          if (a) mgr.sprites?.draw(ctx, 'item.' + B.seed, a.x, a.y - 2 * a.s, { alpha: 0.7, scaleX: a.s * 0.7, scaleY: a.s * 0.7 });
        }
        if (why && !B.dragging) { const a = worldToUi(mgr, t0x + 0.5, t0y); if (a) drawText(ctx, why, a.x, a.y - 12, { align: 'center', color: C.bad }); }
        const first = mgr.input.mousePressed(0);
        if (first || (mgr.input.mouseDown(0) && B.dragging && (B.last?.x !== t0x || B.last?.y !== t0y))) {
          B.dragging = !first;              // only the first click reports why a tile was refused
          B.last = { x: t0x, y: t0y };
          act(mgr, store, t0x, t0y, null);
          B.dragging = true;
        }
      }
      if (!mgr.input.mouseDown(0)) { B.dragging = false; B.last = null; }
      if (mgr.input.mousePressed(2)) { B.mode = 'menu'; B.item = null; mgr.sound('ui_close'); }
    }

    // ---------------- top bar (mode + cost)
    // sits just above the hotbar so it never covers the tutorial card, toasts or the Treasury at the top
    const BAR = barRect(mgr), barW = BAR.w, bx = BAR.x, byy = BAR.y;
    ctx.fillStyle = 'rgba(13,10,20,0.78)'; ctx.fillRect(bx, byy, barW, 22);
    ctx.fillStyle = C.border; ctx.fillRect(bx, byy + 21, barW, 1);
    let title = 'Build', hint = 'Pick something from the palette   Esc close';
    if (B.mode === 'place') {
      const def = content.structures.byId[B.kind];
      title = (B.item ? itemName(B.item) : structName(B.kind));
      hint = 'LMB place   Wheel rotate   RMB back';
      if (def && !B.item) {
        const cost = costFor(store, def, 0, 0);
        let cx = bx + 6 + measure(title) + 10;
        for (const c of cost.items) {
          const have = invCount(store, c.item);
          mgr.sprites?.draw(ctx, 'item.' + c.item, cx + 5, byy + 13, { scaleX: 0.6, scaleY: 0.6 });
          cx += 11 + drawText(ctx, String(c.qty), cx + 11, byy + 3, { color: have >= c.qty ? C.text : C.bad }) + 4;
        }
        if (cost.glint) drawText(ctx, cost.glint + ' G', cx + 2, byy + 3, { color: (store.world.glint ?? 0) >= cost.glint ? C.gold : C.bad });
      }
    } else if (B.mode === 'till') { title = 'Till soil'; hint = 'LMB (drag) till   1 Fieldstone each   RMB back'; }
    else if (B.mode === 'water') { title = 'Water'; hint = 'LMB (drag) water soil and crops   RMB back'; }
    else if (B.mode === 'plant') { title = 'Plant ' + itemName(B.seed) + ` (${invCount(store, B.seed)})`; hint = 'LMB (drag) plant on soil   RMB back'; }
    else if (B.mode === 'remove') { title = 'Deconstruct'; hint = 'LMB remove a structure   RMB back'; }
    drawText(ctx, title, bx + 6, byy + 3, { color: C.accent });
    drawText(ctx, hint, bx + 6, byy + 12, { color: C.dim, outline: false });

    // ---------------- palette (menu mode)
    if (B.mode === 'menu') {
      ctx.fillStyle = C.borderDark; ctx.fillRect(MENU.x - 2, MENU.y - 2, MENU.w + 4, MENU.h + 4);
      ctx.fillStyle = C.border; ctx.fillRect(MENU.x - 1, MENU.y - 1, MENU.w + 2, MENU.h + 2);
      ctx.fillStyle = C.bg; ctx.fillRect(MENU.x, MENU.y, MENU.w, MENU.h);
      // category tabs: two rows
      const lx = MENU.x - ui.x, ly = MENU.y - ui.y;
      let tx = lx + 2, ty = ly + 2;
      CATS.forEach((c, i) => {
        const w = measure(c.label) + 6;
        if (tx + w > lx + MENU.w - 2) { tx = lx + 2; ty += 12; }
        const hot = ui.hover(tx, ty, w, 11);
        ui.rect(tx, ty, w, 11, i === B.cat ? C.border : hot ? C.slotHover : C.bgLight);
        drawText(ctx, c.label, ui.x + tx + 3, ui.y + ty + 2, { color: i === B.cat ? C.accent : C.text, outline: false });
        if (hot && mgr.mouse.released) { B.cat = i; mgr.consumeClick(); mgr.sound('ui_click'); }
        tx += w + 2;
      });
      const listY = ty + 14, listH = MENU.h - (listY - ly) - DETAIL_H - 2;
      const cat = CATS[B.cat].id;
      let rows;
      if (cat === 'tools') {
        const seeds = [];
        for (const s of store.self.inv?.slots ?? []) if (s && (itemDef(s[0])?.cat === 'seed' || itemDef(s[0])?.use?.kind === 'plant_node') && !seeds.includes(s[0])) seeds.push(s[0]);
        rows = [...TOOLS.map((t) => ({ tool: t })), ...seeds.map((s) => ({ seed: s }))];
      } else rows = (BY_CAT[cat] ?? []).map((s) => ({ def: s }));
      B.hoverKind = null;
      ui.list(lx, listY, MENU.w, listH, rows, 18, (row, ry, hov) => {
        if (hov) ui.rect(lx, ry, MENU.w, 18, C.bgLight);
        if (row.tool || row.seed) {
          const label = row.tool ? row.tool.label : `Plant ${itemName(row.seed)} (${invCount(store, row.seed)})`;
          mgr.sprites?.draw(ctx, row.tool ? row.tool.icon : 'item.' + row.seed, ui.x + lx + 9, ui.y + ry + 16, { scaleX: 0.75, scaleY: 0.75 });
          drawText(ctx, label, ui.x + lx + 20, ui.y + ry + 5, { color: C.text, outline: false });
          if (hov) {
            ui.tooltip(row.tool ? row.tool.tip : 'Plant on tilled soil');
            if (mgr.mouse.released) { B.mode = row.tool ? row.tool.mode : 'plant'; B.seed = row.seed ?? B.seed; B.item = null; mgr.consumeClick(); mgr.sound('ui_click'); }
          }
          return;
        }
        const def = row.def;
        const un = unlocked(store, def.id);
        const cost = costFor(store, def);
        const afford = un && cost.items.every((c) => invCount(store, c.item) >= c.qty) && cost.glint <= (store.world.glint ?? 0);
        const sid = 'struct.' + def.id;
        if (mgr.sprites?.has(sid)) {
          const sz = mgr.sprites.size(sid);
          const sc = Math.min(14 / sz.w, 15 / sz.h, 1);
          mgr.sprites.draw(ctx, sid, ui.x + lx + 9, ui.y + ry + 16, { scaleX: sc, scaleY: sc, alpha: un ? 1 : 0.35 });
        }
        drawText(ctx, def.name, ui.x + lx + 20, ui.y + ry + 1, { color: !un ? C.dim : afford ? C.text : C.stone, outline: false });
        drawText(ctx, !un ? 'Locked' : `${def.w}x${def.h}${def.world ? '  world' : ''}${afford ? '' : '  need more'}`, ui.x + lx + 20, ui.y + ry + 9, { color: !un ? C.bad : afford ? C.good : C.dim, outline: false });
        if (hov) {
          B.hoverKind = def.id;
          if (mgr.mouse.released) {
            if (un) { B.mode = 'place'; B.kind = def.id; B.item = null; B.rot = 0; mgr.sound('ui_click'); }
            else mgr.sound('deny');
            mgr.consumeClick();
          }
        }
      }, 'build:' + cat);
      // detail of the hovered (or last hovered) structure
      if (B.hoverKind) B.detailKind = B.hoverKind;
      if (B.detailKind && !(BY_CAT[cat] ?? []).some((d) => d.id === B.detailKind)) B.detailKind = null;
      const dk = B.detailKind;
      const dy = MENU.y + MENU.h - DETAIL_H;
      ctx.fillStyle = C.border; ctx.fillRect(MENU.x + 2, dy - 2, MENU.w - 4, 1);
      if (dk) {
        const def = content.structures.byId[dk];
        const un = unlocked(store, dk);
        drawText(ctx, def.name, MENU.x + 4, dy + 1, { color: C.accent });
        if (!un) drawText(ctx, lockReason(def), MENU.x + 4, dy + 11, { color: C.bad, outline: false });
        const cost = costFor(store, def);
        let cy = dy + (un ? 11 : 21);
        cost.items.slice(0, 4).forEach((c, i) => {
          const have = invCount(store, c.item);
          // one row per ingredient: full name on the left, have/need right-aligned (no clipped names)
          const x = MENU.x + 4, y = cy + i * 10;
          mgr.sprites?.draw(ctx, 'item.' + c.item, x + 4, y + 9, { scaleX: 0.55, scaleY: 0.55 });
          const cnt = `${have}/${c.qty}`, room = MENU.w - 18 - measure(cnt) - 6;
          let nm = itemName(c.item); if (measure(nm) > room) { while (measure(nm + '.') > room && nm.length > 3) nm = nm.slice(0, -1); nm += '.'; }
          drawText(ctx, nm, x + 10, y + 1, { color: have >= c.qty ? C.text : C.bad, outline: false });
          drawText(ctx, cnt, MENU.x + MENU.w - 4, y + 1, { color: have >= c.qty ? C.good : C.bad, outline: false, align: 'right' });
        });
        if (cost.glint) drawText(ctx, `${cost.glint} Glint`, MENU.x + 4, cy + Math.min(4, cost.items.length) * 10 + 1, { color: (store.world.glint ?? 0) >= cost.glint ? C.gold : C.bad, outline: false });
        if (dk === 'brine_locker' && un) {
          LOCKER_COLOURS.forEach((col, i) => {
            const x = MENU.x + 100 + i * 9, y = dy + 1;
            ctx.fillStyle = i === B.colour ? '#ffffff' : C.borderDark; ctx.fillRect(x - 1, y - 1, 8, 8);
            ctx.fillStyle = col; ctx.fillRect(x, y, 6, 6);
          });
        }
      } else drawText(ctx, 'Hover for the cost', MENU.x + 4, dy + 3, { color: C.dim, outline: false });
      // brine locker colour pick (click swatches in the detail area)
      if (dk === 'brine_locker') {
        for (let i = 0; i < 8; i++) {
          const x = MENU.x + 100 + i * 9 - ui.x, y = dy + 1 - ui.y;
          if (ui.hover(x - 1, y - 1, 8, 8) && mgr.mouse.released) { B.colour = i; mgr.consumeClick(); }
        }
      }
      if (inMenu) mgr.consumeClick();
    }

    // ---------------- feedback line
    if (B.msg) {
      B.msg.t -= dt;
      if (B.msg.t <= 0) B.msg = null;
      else {
        ctx.globalAlpha = Math.min(1, B.msg.t * 2);
        drawText(ctx, B.msg.text, bx + barW / 2, byy - 11, { align: 'center', color: B.msg.good ? C.good : C.bad });
        ctx.globalAlpha = 1;
      }
    }
  },
};

export default panel;
