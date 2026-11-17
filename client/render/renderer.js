// Frame pipeline (TECH_SPEC 8.1). The game draws at 1x to an offscreen canvas of ceil(window / zoom) and is
// blitted to the visible canvas with integer scaling and no smoothing; the UI draws at its own scale on top.

import { TILE, REACH } from '../../shared/config.js';
import { drawerFor, DRAWERS } from './drawers/index.js';
import * as particles from '../fx/particles.js';
import juice from '../fx/juice.js';
import ambient from '../fx/ambient.js';
import lighting from './lighting.js';
import weather from './weather.js';
import { Tilemap } from './tilemap.js';
import { drawText } from './text.js';

const CULL_MARGIN = 48;   // px

export class Renderer {
  constructor(canvas, { store, sprites, tileset, camera, ui, content }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = document.createElement('canvas');
    this.gctx = this.game.getContext('2d', { alpha: false });
    this.store = store; this.sprites = sprites; this.camera = camera; this.ui = ui; this.content = content;
    this.tilemap = new Tilemap(store, tileset);
    this.view = { x: 0, y: 0, w: 0, h: 0, time: 0, now: 0, sprites, juice, particles, store, content };
    this.visible = [];
    this.tmp = { x: 0, y: 0 };
    this.shake = { x: 0, y: 0 };
    this.cursorTile = null;
    this.status = '';
    this.uiScale = 2;
    this.zoomSetting = 0;      // 0 = auto
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    const zoom = this.zoomSetting || (h < 560 || w < 900 ? 2 : h > 1300 ? 4 : 3);
    this.camera.resize(w, h, zoom);
    this.game.width = this.camera.viewW; this.game.height = this.camera.viewH;
    // auto UI scale: 1x below 540 px tall, 3x on 1440p and up, else 2x (text stays readable on big screens)
    this.ui.resize(w, h, this.uiScale || (h < 540 ? 1 : h >= 1300 ? 3 : 2));
  }

  // Per-frame entity bookkeeping: render positions, drawer updates, culling and y-sort.
  prepareEntities(dt, now, selfPos) {
    const v = this.view, list = this.visible;
    list.length = 0;
    const rt = this.store.renderTime(now);
    const x0 = v.x - CULL_MARGIN, y0 = v.y - CULL_MARGIN, x1 = v.x + v.w + CULL_MARGIN, y1 = v.y + v.h + CULL_MARGIN * 2;
    for (const e of this.store.entities.values()) {
      if (e.i === this.store.myId && selfPos) { e.rx = selfPos.x; e.ry = selfPos.y; e.isSelf = true; }
      else if (e.buf.sample(rt, this.tmp)) { e.rx = this.tmp.x; e.ry = this.tmp.y; }
      else { e.rx = e.x; e.ry = e.y; }
      const d = drawerFor(e);
      if (d.update) d.update(e, dt, v);
      const px = e.rx * TILE, py = e.ry * TILE;
      if (px < x0 || py < y0 || px > x1 || py > y1) continue;
      list.push(e);
    }
    list.sort((a, b) => a.ry - b.ry || a.i - b.i);
  }

  frame(dt, now, time, selfPos, aim) {
    const v = this.view, g = this.gctx, cam = this.camera;
    v.time = time; v.now = now;
    cam.worldW = this.store.realm.w; cam.worldH = this.store.realm.h;
    if (selfPos) cam.follow(selfPos.x, selfPos.y, aim, dt);
    juice.update(dt, this.shake);
    cam.shakeX = this.shake.x; cam.shakeY = this.shake.y;
    cam.view(v);
    if (!juice.isHitstopped()) particles.update(dt);
    ambient.update(dt, this.store, v);
    this.prepareEntities(dt, now, selfPos);

    g.imageSmoothingEnabled = false;
    this.tilemap.drawWater(g, v, time);
    this.tilemap.draw(g, v);
    particles.draw(g, 'ground', v);
    if (aim && selfPos) this.drawCursor(g, aim, selfPos);
    const hover = v.hover;
    for (const e of this.visible) {
      if (hover && hover.i === e.i) this.drawHoverOutline(g, e, v, time);
      try { drawerFor(e).draw(g, e, time, v); } catch (err) { this.reportOnce(e.ty + ':' + e.k, err); }
    }
    this.drawOccludedPlayers(g, v);
    if (hover?.label) this.drawHoverLabel(g, hover, v);
    particles.draw(g, 'world', v);
    juice.drawNumbers(g, v);
    lighting.draw(g, v, this.store, time);
    weather.draw(g, v, this.store, time);
    particles.draw(g, 'overlay', v);
    juice.drawOverlay(g, v.w, v.h);
    if (this.status) drawText(g, this.status, v.w / 2, v.h / 2 - 4, { align: 'center' });

    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.game, 0, 0, v.w * cam.zoom, v.h * cam.zoom);
    this.ui.draw(c);
    particles.draw(c, 'ui', { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height });
  }

  // Players hidden behind a tree, the Tidestone or a building get a translucent silhouette in their colour drawn on
  // top (BUILD_REVIEW P2-19). The player drawer leaves its last draw call in e._drawn.
  drawOccludedPlayers(g, v) {
    const list = this.visible;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.ty !== 'player' || !p._drawn) continue;
      const px0 = p.rx * TILE - 6, px1 = p.rx * TILE + 6, py1 = p.ry * TILE, py0 = py1 - 18;
      let hidden = false;
      for (let j = i + 1; j < list.length && !hidden; j++) {
        const o = list[j];
        if (o.ty !== 'node' && o.ty !== 'structure') continue;
        const r = this.spriteRect(o);
        if (!r) continue;
        // overlap by a good part of the body, not a toe
        const ox = Math.min(px1, r.x1) - Math.max(px0, r.x0), oy = Math.min(py1, r.y1) - Math.max(py0, r.y0);
        if (ox > 4 && oy > 6) hidden = true;
      }
      if (!hidden) continue;
      const d = p._drawn;
      this.sprites.draw(g, 'pl.body', d.x, d.y, { ...d.opts, silhouette: d.color, alpha: 0.5, flash: false });
    }
  }

  // Target feedback: a 1 px light outline around the node / structure the next click will hit (main.js sets
  // view.hover = { i, kind: 'gather' | 'use' | 'revive', label? }).
  drawHoverOutline(g, e, v, time) {
    let id, x = Math.round(e.rx * TILE - v.x), y = Math.round(e.ry * TILE - v.y), opts = { time };
    if (e.ty === 'node') {
      id = 'node.' + e.k;
      const big = e.big ? 1.5 : 1;
      y += 7;
      opts = { variant: e.v | 0, flip: ((e.i * 7 + (e.v | 0)) & 2) === 2, scaleX: big, scaleY: big };
    } else if (e.ty === 'structure') {
      const def = this.content.structures?.byId?.[e.k];
      id = 'struct.' + e.k;
      y += ((def?.h ?? 1) * TILE) / 2;
      opts = { time, frame: e.on === 0 ? 0 : undefined };
    } else return;
    if (!this.sprites.has(id)) return;
    const pulse = 0.8 + 0.2 * Math.sin(time * 8);
    const o = { ...opts, silhouette: '#fff7d6', alpha: pulse };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.sprites.draw(g, id, x + dx, y + dy, o);
  }

  drawHoverLabel(g, hover, v) {
    const e = this.store.entities.get(hover.i);
    if (!e) return;
    let top = 20;
    if (e.ty === 'structure') {
      const id = 'struct.' + e.k, def = this.content.structures?.byId?.[e.k];
      const sz = this.sprites.has(id) ? this.sprites.size(id) : { h: 16 };
      top = sz.h - ((def?.h ?? 1) * TILE) / 2 + 3;
    } else if (e.ty === 'npc') top = 24;
    else if (e.ty === 'chest') top = 10;
    const x = Math.round(e.rx * TILE - v.x), y = Math.round(e.ry * TILE - v.y - top - 8);
    drawText(g, hover.label, x, y, { align: 'center', color: '#fff7d6' });
  }

  spriteRect(o) {
    if (o.ty === 'node') {
      const id = 'node.' + o.k;
      if (!this.sprites.has(id)) return null;
      const sz = this.sprites.size(id), big = o.big ? 1.5 : 1;
      if (sz.h <= 16 && !o.big) return null;          // bushes and rocks are too short to hide anyone
      const bx = o.rx * TILE, by = o.ry * TILE + 7;
      return { x0: bx - (sz.w * big) / 2, x1: bx + (sz.w * big) / 2, y0: by - sz.h * big, y1: by - 3 };
    }
    const def = this.content.structures?.byId?.[o.k];
    const id = 'struct.' + o.k;
    if (!def || !this.sprites.has(id)) return null;
    const sz = this.sprites.size(id);
    if (sz.h <= 16) return null;
    const bx = o.rx * TILE, by = o.ry * TILE + (def.h * TILE) / 2;
    return { x0: bx - sz.w / 2, x1: bx + sz.w / 2, y0: by - sz.h, y1: by - 4 };
  }

  // Tile highlight under the mouse while it is within reach.
  drawCursor(g, aim, selfPos) {
    const tx = Math.floor(aim.x), ty = Math.floor(aim.y);
    const d = Math.hypot(tx + 0.5 - selfPos.x, ty + 0.5 - selfPos.y);
    if (d > REACH + 0.5 || this.ui.wantsMouse) return;
    this.sprites.draw(g, 'core.cursor', tx * TILE - this.view.x, ty * TILE - this.view.y, { alpha: 0.85 });
  }

  reportOnce(key, err) {
    this.reported ||= new Set();
    if (this.reported.has(key)) return;
    this.reported.add(key);
    console.error(`[tb:render] drawer for ${key} threw`, err);
  }
}

export { DRAWERS };
