// Panel manager, HUD layout, input capture, tooltips, drag and drop (TECH_SPEC 8.3).
// Panels and HUD widgets come from ui/panels/index.js and ui/hud/index.js; nothing here needs editing per panel.
//
// Panel module: { id, key?, modal?, w, h, anchor: 'center'|'left'|'right'|'top'|'bottom'|'top-left'|..., open?(store, args),
//                 close?(), draw(ui, store), auto? (title only: skip the blocking title flow) }
// HUD module:   { id, anchor, order, draw(ui, store) }  -- `ui` is bound to the whole screen (ui.w, ui.h).

import { Widgets } from './widgets.js';
import { drawText, measure } from '../render/text.js';
import { UI_COLORS } from './widgets.js';
import panels from './panels/index.js';
import hud from './hud/index.js';

const SLIDE_S = 0.12;

function anchorRect(anchor, w, h, W, H, margin = 8) {
  const a = anchor || 'center';
  let x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  if (a.includes('left')) x = margin;
  if (a.includes('right')) x = W - w - margin;
  if (a.startsWith('top')) y = margin;
  if (a.startsWith('bottom')) y = H - h - margin;
  return { x, y, w, h };
}

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

export class UI {
  constructor({ input, store, net, sprites, audio }) {
    this.input = input; this.store = store; this.net = net; this.sprites = sprites; this.audio = audio;
    this.scale = 2;
    this.W = 0; this.H = 0;
    this.mouse = { x: 0, y: 0, down: false, pressed: false, released: false, wheel: 0 };
    this.panels = new Map();          // id -> { mod, open, t, args }
    this.order = [];                  // open panel ids, last = top
    this.hud = [...hud].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.widgets = new Widgets(this);
    this.scroll = new Map();
    this.activeKey = null;
    this.lastHoverKey = null;
    this.pendingTooltip = null;
    this.drag = null;
    this.clickConsumed = false;
    this.wantsMouse = false;
    for (const p of panels) this.panels.set(p.id, { mod: p, open: false, t: 0, args: null, closing: false });
  }

  sound(name) { this.audio?.play(name, {}); }
  consumeClick() { this.clickConsumed = true; }

  resize(screenW, screenH, scale = this.scale) {
    this.scale = Math.max(1, Math.round(scale));
    this.W = Math.ceil(screenW / this.scale);
    this.H = Math.ceil(screenH / this.scale);
  }

  isOpen(id) { return !!this.panels.get(id)?.open; }
  anyModal() { return this.order.some((id) => this.panels.get(id).mod.modal); }
  get(id) { return this.panels.get(id)?.mod; }

  open(id, args = null) {
    const p = this.panels.get(id);
    if (!p) return false;
    if (!p.open) {
      p.open = true; p.closing = false; p.t = 0; p.args = args;
      this.order.push(id);
      try { p.mod.open?.(this.store, args); } catch (err) { console.error(`[tb:ui] open ${id}`, err); }
      this.sound('ui_open');
    } else {
      this.order.splice(this.order.indexOf(id), 1);
      this.order.push(id);
    }
    return true;
  }

  close(id) {
    const p = this.panels.get(id);
    if (!p || !p.open) return;
    p.open = false;
    this.order.splice(this.order.indexOf(id), 1);
    try { p.mod.close?.(); } catch (err) { console.error(`[tb:ui] close ${id}`, err); }
    this.sound('ui_close');
  }

  toggle(id, args) { if (this.isOpen(id)) this.close(id); else this.open(id, args); }
  closeTop() { const id = this.order[this.order.length - 1]; if (id) { this.close(id); return true; } return false; }

  rectOf(p) {
    const r = anchorRect(p.mod.anchor, p.mod.w ?? 200, p.mod.h ?? 140, this.W, this.H);
    const k = easeOutBack(Math.min(1, p.t / SLIDE_S));
    r.y += Math.round((1 - k) * 16);
    return r;
  }

  // Screen areas a panel takes the mouse from. A modal takes the whole screen; a full-screen tool panel (build)
  // may list only the parts it draws (`hitRects(ui)`), so the HUD stays usable around it.
  hitRects(p) {
    if (p.mod.modal) return [{ x: 0, y: 0, w: this.W, h: this.H }];
    if (p.mod.hitRects) { try { return p.mod.hitRects(this) ?? []; } catch { return []; } }
    return [this.rectOf(p)];
  }

  // Per-frame input handling. Call before the game reads input.
  update(dt) {
    const inp = this.input;
    this.mouse.x = inp.mouse.x / this.scale;
    this.mouse.y = inp.mouse.y / this.scale;
    this.mouse.down = inp.mouseDown(0);
    this.mouse.pressed = inp.mousePressed(0);
    this.mouse.released = inp.mouseReleased(0);
    this.mouse.wheel = inp.mouse.wheel;
    this.clickConsumed = false;
    if (!this.mouse.down && !this.mouse.released) this.activeKey = null;

    for (const p of this.panels.values()) if (p.open) p.t += dt;
    for (const p of this.panels.values()) {
      const key = p.mod.key;
      if (key && !inp.textCapture && inp.pressed(key)) this.toggle(p.mod.id);
    }
    if (inp.pressed('menu')) {
      if (!this.closeTop() && this.panels.has('pause')) this.open('pause');
    }
    this.wantsMouse = false;
    for (const id of this.order) {
      const r = this.rectOf(this.panels.get(id));
      if (this.mouse.x >= r.x && this.mouse.y >= r.y && this.mouse.x < r.x + r.w && this.mouse.y < r.y + r.h) this.wantsMouse = true;
    }
    if (this.anyModal()) this.wantsMouse = true;
    // an interactive HUD element was under the mouse last frame: the click belongs to the HUD, not the world
    this.overHud = this.hudHover;
    if (this.hudHover) this.wantsMouse = true;
    inp.suppressGameplay = this.anyModal() || !!inp.textCapture;
    if (this.drag && this.mouse.released) this.queueEndDrag = true;
  }

  beginDrag(payload, stack) { this.drag = { payload, stack }; }
  endDrag() { this.drag = null; this.queueEndDrag = false; }

  drawDragGhost(ctx) {
    if (!this.drag?.stack) return;
    this.sprites?.draw(ctx, 'item.' + this.drag.stack[0], this.mouse.x, this.mouse.y + 8, { alpha: 0.8 });
  }

  // Draw HUD then panels then tooltip; ctx is the screen canvas.
  draw(ctx) {
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.pendingTooltip = null;
    const screen = { x: 0, y: 0, w: this.W, h: this.H };
    // Click-through guard: every widget only sees the mouse where no panel above it covers the screen.
    // blockersFrom[i] = hit rects of the panels drawn after panel i (a modal covers everything).
    const hits = this.order.map((id) => this.hitRects(this.panels.get(id)));
    const blockersFrom = new Array(this.order.length + 1);
    blockersFrom[this.order.length] = [];
    for (let i = this.order.length - 1; i >= 0; i--) blockersFrom[i] = blockersFrom[i + 1].concat(hits[i]);
    this.hudHover = false;
    this.widgets.blockers = blockersFrom[0];
    for (const h of this.hud) {
      try { h.draw(this.widgets.bind(ctx, screen, 'hud:' + h.id), this.store); } catch (err) { this.reportOnce(h.id, err); }
    }
    this.order.forEach((id, i) => {
      const p = this.panels.get(id);
      if (p.mod.modal) {
        ctx.fillStyle = 'rgba(13,10,20,0.55)';
        ctx.fillRect(0, 0, this.W, this.H);
      }
      this.widgets.blockers = blockersFrom[i + 1];
      try { p.mod.draw(this.widgets.bind(ctx, this.rectOf(p), id), this.store); } catch (err) { this.reportOnce(id, err); }
    });
    this.widgets.blockers = null;
    if (this.drag) this.drawDragGhost(ctx);
    if (this.queueEndDrag) this.endDrag();
    if (this.pendingTooltip) this.drawTooltip(ctx, this.pendingTooltip);
    ctx.restore();
  }

  drawTooltip(ctx, text) {
    const lines = String(text).split('\n');
    const w = Math.max(...lines.map(measure)) + 8, h = lines.length * 9 + 5;
    const x = Math.min(this.W - w - 2, this.mouse.x + 8), y = Math.min(this.H - h - 2, this.mouse.y + 8);
    ctx.fillStyle = UI_COLORS.borderDark; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = UI_COLORS.bg; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    drawText(ctx, text, x + 4, y + 3, { outline: false });
  }

  reportOnce(id, err) {
    this.reported ||= new Set();
    if (this.reported.has(id)) return;
    this.reported.add(id);
    console.error(`[tb:ui] ${id} draw threw`, err);
  }
}
