// Immediate-mode widgets drawn on the UI canvas layer (TECH_SPEC 8.3). All coordinates are in panel space
// (UI pixels relative to the bound rect). One Widgets instance is re-bound for every panel and HUD widget.

import { drawText, measure } from '../render/text.js';
import { PAL, RAMPS } from '../art/palette.js';

export const UI_COLORS = Object.freeze({
  bg: PAL[RAMPS.ink[1]], bgLight: PAL[RAMPS.ink[2]], border: PAL[RAMPS.ink[4]], borderDark: PAL[RAMPS.ink[0]],
  text: '#ffffff', dim: PAL[RAMPS.stone[3]], accent: PAL[RAMPS.gold[3]], good: PAL[RAMPS.grass[4]], bad: PAL[RAMPS.ember[3]],
  hp: PAL[RAMPS.ember[2]], hpLight: PAL[RAMPS.ember[3]], surge: PAL[RAMPS.sea[3]], surgeLight: PAL[RAMPS.sea[4]],
  xp: PAL[RAMPS.teal[3]], slot: PAL[RAMPS.ink[2]], slotHover: PAL[RAMPS.ink[3]],
});

export class Widgets {
  constructor(ui) {
    this.ui = ui;           // the UI manager (mouse state, sprites, audio, drag state)
    this.ctx = null;
    this.x = 0; this.y = 0; this.w = 0; this.h = 0;
    this.id = '';
    this.blockers = null;   // UI-space rects drawn above the bound widget (set by UI.draw); hover is false inside them
  }

  bind(ctx, rect, id) {
    this.ctx = ctx; this.x = rect.x; this.y = rect.y; this.w = rect.w; this.h = rect.h; this.id = id;
    return this;
  }

  // mouse in panel space
  get mx() { return this.ui.mouse.x - this.x; }
  get my() { return this.ui.mouse.y - this.y; }
  hover(x, y, w, h) {
    const mx = this.mx, my = this.my;
    if (!(mx >= x && my >= y && mx < x + w && my < y + h)) return false;
    if (this.blocked()) return false;
    if (this.id.startsWith('hud:')) this.ui.hudHover = true;
    return true;
  }

  // True when the mouse is over a panel drawn above the current widget (so clicks must not reach it).
  blocked() {
    const b = this.blockers;
    if (!b || !b.length) return false;
    const X = this.ui.mouse.x, Y = this.ui.mouse.y;
    for (const r of b) if (X >= r.x && Y >= r.y && X < r.x + r.w && Y < r.y + r.h) return true;
    return false;
  }

  // Nine-slice style frame with a title bar.
  frame(title = '', opts = {}) {
    const c = this.ctx, X = this.x, Y = this.y, W = this.w, H = this.h;
    c.fillStyle = UI_COLORS.borderDark;
    c.fillRect(X + 1, Y, W - 2, H); c.fillRect(X, Y + 1, W, H - 2);
    c.fillStyle = UI_COLORS.border;
    c.fillRect(X + 1, Y + 1, W - 2, H - 2);
    c.fillStyle = UI_COLORS.bg;
    c.fillRect(X + 2, Y + 2, W - 4, H - 4);
    if (title) {
      c.fillStyle = UI_COLORS.bgLight;
      c.fillRect(X + 2, Y + 2, W - 4, 11);
      drawText(c, title, X + 6, Y + 4, { color: opts.color ?? UI_COLORS.accent, outline: false });
    }
  }

  rect(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(this.x + x, this.y + y, w, h); }

  label(x, y, text, opts = {}) {
    return drawText(this.ctx, text, this.x + x, this.y + y, { color: opts.color ?? UI_COLORS.text, outline: opts.outline ?? false, align: opts.align, scale: opts.scale });
  }

  // Returns true on click (press and release inside). Hover lifts 1 px, press sinks 1 px.
  button(x, y, text, opts = {}) {
    const w = opts.w ?? measure(text) + 10, h = opts.h ?? 13;
    const hot = this.hover(x, y, w, h) && !opts.disabled;
    const key = this.id + ':' + (opts.key ?? text) + ':' + x + ',' + y;
    const down = hot && this.ui.mouse.down && this.ui.activeKey === key;
    if (hot && this.ui.mouse.pressed) this.ui.activeKey = key;
    const lift = down ? 1 : hot ? -1 : 0;
    const c = this.ctx, X = this.x + x, Y = this.y + y + lift;
    c.fillStyle = UI_COLORS.borderDark; c.fillRect(X, Y + 1, w, h);
    c.fillStyle = opts.disabled ? UI_COLORS.bg : hot ? UI_COLORS.slotHover : UI_COLORS.bgLight;
    c.fillRect(X, Y, w, h);
    drawText(c, text, X + w / 2, Y + 3, { color: opts.disabled ? UI_COLORS.dim : UI_COLORS.text, outline: false, align: 'center' });
    if (hot && this.ui.lastHoverKey !== key) { this.ui.lastHoverKey = key; this.ui.sound('ui_hover'); }
    if (hot && this.ui.mouse.released && this.ui.activeKey === key) { this.ui.sound('ui_click'); this.ui.consumeClick(); return true; }
    if (opts.tooltip && hot) this.tooltip(opts.tooltip);
    return false;
  }

  iconButton(x, y, spriteId, opts = {}) {
    const s = opts.size ?? 18;
    const hot = this.hover(x, y, s, s);
    this.rect(x, y, s, s, hot ? UI_COLORS.slotHover : UI_COLORS.slot);
    this.ui.sprites?.draw(this.ctx, spriteId, this.x + x + s / 2, this.y + y + s / 2 + 8, {});
    if (opts.tooltip && hot) this.tooltip(opts.tooltip);
    if (hot && this.ui.mouse.released) { this.ui.sound('ui_click'); this.ui.consumeClick(); return true; }
    return false;
  }

  // Item slot. stack: [itemId, qty] | null. opts: { onClick, onDrop(dragPayload), drag (payload), tooltip, selected }
  slot(x, y, stack, opts = {}) {
    const s = opts.size ?? 18;
    const hot = this.hover(x, y, s, s);
    this.rect(x, y, s, s, UI_COLORS.borderDark);
    this.rect(x + 1, y + 1, s - 2, s - 2, opts.selected ? UI_COLORS.accent : hot ? UI_COLORS.slotHover : UI_COLORS.slot);
    if (stack) {
      this.ui.sprites?.draw(this.ctx, 'item.' + stack[0], this.x + x + s / 2, this.y + y + s / 2 + 8, {});
      if (stack[1] > 1) drawText(this.ctx, String(stack[1]), this.x + x + s - 1, this.y + y + s - 8, { align: 'right' });
    }
    if (hot) {
      if (opts.tooltip) this.tooltip(opts.tooltip);
      if (this.ui.mouse.pressed && stack && opts.drag !== undefined) this.ui.beginDrag(opts.drag, stack);
      if (this.ui.mouse.released) {
        if (this.ui.drag && opts.onDrop) { opts.onDrop(this.ui.drag.payload); this.ui.endDrag(); this.ui.consumeClick(); }
        else if (opts.onClick) { opts.onClick(); this.ui.consumeClick(); }
      }
    }
  }

  bar(x, y, w, h, value, max, color = UI_COLORS.hp, opts = {}) {
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    this.rect(x, y, w, h, UI_COLORS.borderDark);
    this.rect(x + 1, y + 1, w - 2, h - 2, UI_COLORS.bg);
    const fw = Math.round((w - 2) * frac);
    this.rect(x + 1, y + 1, fw, h - 2, color);
    if (opts.light && h > 3) this.rect(x + 1, y + 1, fw, 1, opts.light);
    if (opts.segments) for (let i = 1; i < opts.segments; i++) this.rect(x + Math.round((w * i) / opts.segments), y + 1, 1, h - 2, UI_COLORS.borderDark);
  }

  progress(x, y, w, value01, color = UI_COLORS.accent) { this.bar(x, y, w, 4, value01, 1, color); }

  // Tab strip; returns the index of the active tab (click switches).
  tabs(x, y, labels, active) {
    let cx = x, result = active;
    labels.forEach((l, i) => {
      const w = measure(l) + 8;
      const hot = this.hover(cx, y, w, 11);
      this.rect(cx, y, w, 11, i === active ? UI_COLORS.border : hot ? UI_COLORS.slotHover : UI_COLORS.bgLight);
      drawText(this.ctx, l, this.x + cx + 4, this.y + y + 2, { color: i === active ? UI_COLORS.accent : UI_COLORS.text, outline: false });
      if (hot && this.ui.mouse.released) { result = i; this.ui.sound('ui_click'); this.ui.consumeClick(); }
      cx += w + 1;
    });
    return result;
  }

  // Scrollable list. renderRow(item, rowY, hovered) draws one row (panel space). Scroll state is kept per key.
  list(x, y, w, h, items, rowH, renderRow, key = 'list') {
    const sk = this.id + ':' + key;
    let scroll = this.ui.scroll.get(sk) ?? 0;
    const maxScroll = Math.max(0, items.length * rowH - h);
    if (this.hover(x, y, w, h) && this.ui.mouse.wheel) scroll += this.ui.mouse.wheel * rowH;
    scroll = Math.max(0, Math.min(maxScroll, scroll));
    this.ui.scroll.set(sk, scroll);
    const c = this.ctx;
    c.save();
    c.beginPath(); c.rect(this.x + x, this.y + y, w, h); c.clip();
    const first = Math.floor(scroll / rowH);
    for (let i = first; i < items.length && i * rowH - scroll < h; i++) {
      const ry = y + i * rowH - scroll;
      renderRow(items[i], ry, this.hover(x, ry, w, rowH), i);
    }
    c.restore();
    if (maxScroll > 0) this.rect(x + w - 2, y + Math.round((scroll / (maxScroll + h)) * h), 2, Math.max(6, Math.round((h * h) / (maxScroll + h))), UI_COLORS.border);
  }

  grid(x, y, cols, rows, cell, fn) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn(r * cols + c, x + c * cell, y + r * cell);
  }

  // Ingredient list with have/need colouring: list [{ item, qty }], have(itemId) -> number.
  cost(x, y, list, have, nameOf = (id) => id) {
    let cy = y;
    for (const { item, qty } of list) {
      const h = have(item);
      this.ui.sprites?.draw(this.ctx, 'item.' + item, this.x + x + 6, this.y + cy + 11, { scaleX: 0.75, scaleY: 0.75 });
      const ok = h >= qty;
      drawText(this.ctx, `${nameOf(item)} ${h}/${qty}`, this.x + x + 14, this.y + cy + 2, { color: ok ? UI_COLORS.text : UI_COLORS.bad, outline: false });
      cy += 12;
    }
    return cy - y;
  }

  tooltip(text) { this.ui.pendingTooltip = text; }

  dragGhost() { this.ui.drawDragGhost(this.ctx); }
}
