// WP13: Settings. Tabs: Audio (master + the four buses of TECH_SPEC 11), Video (UI scale, zoom, particle density),
// Controls (rebinding through input.setBinding), Access (screen shake, flashing).
// Stored in localStorage 'tb.settings' and mirrored to store.settings; `store.emit('change:settings')` on change.
// Contract for other packages: store.settings.particleDensity is a multiplier (0.35 / 0.65 / 1) that the FX router
// may apply to particle counts; juice.config.shakeScale and juice.config.reduceFlashing are set directly.

import { UI_COLORS } from '../widgets.js';
import { DEFAULT_BINDINGS } from '../../input/input.js';

export const DEFAULT_SETTINGS = Object.freeze({
  master: 0.8, music: 0.6, sfx: 0.8, amb: 0.6, ui: 0.7,
  uiScale: 0, zoom: 0, particles: 'high', shake: true, shakeStrength: 1, reduceFlashing: false,
});
const PARTICLE_LEVELS = { low: 0.35, medium: 0.65, high: 1 };
const KEY = 'tb.settings';
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export function normaliseSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const s = { ...d };
  for (const k of ['master', 'music', 'sfx', 'amb', 'ui']) s[k] = clamp01(Number(raw[k]), d[k]);
  s.uiScale = [0, 1, 2, 3].includes(raw.uiScale) ? raw.uiScale : d.uiScale;
  s.zoom = [0, 2, 3, 4].includes(raw.zoom) ? raw.zoom : d.zoom;
  s.particles = raw.particles in PARTICLE_LEVELS ? raw.particles : d.particles;
  s.shake = typeof raw.shake === 'boolean' ? raw.shake : raw.shake === 0 ? false : d.shake;
  s.shakeStrength = Number.isFinite(raw.shakeStrength) ? Math.max(0.25, Math.min(1.5, raw.shakeStrength)) : d.shakeStrength;
  s.reduceFlashing = typeof raw.reduceFlashing === 'boolean' ? raw.reduceFlashing : d.reduceFlashing;
  s.particleDensity = PARTICLE_LEVELS[s.particles];
  return s;
}

export function loadSettings() {
  try { return normaliseSettings(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return normaliseSettings({}); }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage disabled */ }
}

// Apply to whatever is reachable: { audio, juice, renderer, store }. Safe to call repeatedly.
export function applySettings(s, { audio, juice, renderer, store } = {}) {
  if (audio) {
    audio.setVolume('master', s.master);
    for (const k of ['music', 'sfx', 'amb', 'ui']) audio.setVolume(k, s[k] * s.master);
  }
  if (juice?.config) {
    juice.config.shakeScale = s.shake ? s.shakeStrength : 0;
    juice.config.reduceFlashing = s.reduceFlashing;
  }
  if (renderer) {
    const changed = renderer.uiScale !== s.uiScale || renderer.zoomSetting !== s.zoom;
    renderer.uiScale = s.uiScale;
    renderer.zoomSetting = s.zoom;
    if (changed) renderer.resize();
  }
  if (store) {
    Object.assign(store.settings, s);
    store.emit('change:settings', store.settings);
  }
}

// Browser-only: apply using the live client handles (window.__tb after boot).
export async function applyEverywhere(s, ui) {
  const tb = typeof window !== 'undefined' ? window.__tb : null;
  let juice = tb?.juice;
  if (!juice && typeof window !== 'undefined') { try { juice = (await import('../../fx/juice.js')).default; } catch { juice = null; } }
  applySettings(s, { audio: ui?.audio ?? null, juice, renderer: tb?.renderer ?? null, store: ui?.store ?? tb?.store ?? null });
}

// ---------------------------------------------------------------- panel

const TABS = ['Audio', 'Video', 'Controls', 'Access'];
const REBIND = [
  ['move.up', 'Move up'], ['move.down', 'Move down'], ['move.left', 'Move left'], ['move.right', 'Move right'],
  ['dodge', 'Dodge'], ['ability1', 'Ability 1'], ['ability2', 'Ability 2'], ['ability3', 'Ability 3'], ['ability4', 'Ability 4'],
  ['ability5', 'Second Calling 1'], ['ability6', 'Second Calling 2'], ['panel.inventory', 'Inventory'], ['panel.build', 'Build'],
  ['panel.crafting', 'Crafting'], ['panel.skills', 'Skill Chart'], ['panel.deck', 'Card deck'], ['panel.map', 'Map'],
  ['panel.journal', 'Journal'], ['ping', 'Ping (hold for wheel)'], ['chat', 'Chat'],
];
const st = { tab: 0, s: null, drag: null, capture: null };

function keyName(code) {
  if (!code) return '-';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB').replace('Mouse1', 'MMB');
}

function changed(ui) {
  st.s = normaliseSettings(st.s);
  saveSettings(st.s);
  applyEverywhere(st.s, ui.ui);
}

function slider(ui, x, y, w, label, key) {
  ui.label(x, y, label);
  const v = st.s[key];
  const bx = x + 80, by = y + 1;
  ui.rect(bx, by + 2, w, 3, UI_COLORS.borderDark);
  ui.rect(bx, by + 2, Math.round(w * v), 3, UI_COLORS.accent);
  const kx = bx + Math.round(w * v) - 2;
  const hot = ui.hover(bx - 3, by - 2, w + 6, 11);
  ui.rect(kx, by - 1, 5, 9, hot || st.drag === key ? '#ffffff' : UI_COLORS.text);
  ui.label(bx + w + 8, y, `${Math.round(v * 100)}%`, { color: UI_COLORS.dim });
  if (hot && ui.ui.mouse.pressed) { st.drag = key; ui.ui.activeKey = 'slider:' + key; }
  if (st.drag === key) {
    if (ui.ui.mouse.down) {
      const nv = Math.max(0, Math.min(1, (ui.mx - bx) / w));
      if (Math.abs(nv - st.s[key]) > 0.004) { st.s[key] = Math.round(nv * 100) / 100; changed(ui); }
    } else { st.drag = null; ui.ui.sound('ui_click'); }
  }
}

function choice(ui, x, y, label, key, options) {
  ui.label(x, y + 2, label);
  let cx = x + 80;
  for (const [val, text] of options) {
    if (ui.button(cx, y, text, { key: key + val, disabled: false })) { st.s[key] = val; changed(ui); }
    if (st.s[key] === val) ui.rect(cx, y + 13, ui.ctx ? Math.max(10, text.length * 6 + 4) : 0, 1, UI_COLORS.accent);
    cx += text.length * 6 + 14;
  }
}

function toggle(ui, x, y, label, key) {
  const on = !!st.s[key];
  ui.label(x, y + 2, label);
  if (ui.button(x + 160, y, on ? 'On' : 'Off', { key, w: 30 })) { st.s[key] = !on; changed(ui); }
}

function drawControls(ui) {
  const input = ui.ui.input;
  ui.label(10, 30, 'Click a binding, then press a key (Esc cancels). Mouse buttons stay on LMB / RMB.', { color: UI_COLORS.dim });
  ui.list(8, 42, 304, 136, REBIND, 13, ([action, label], y, hot) => {
    if (hot) ui.rect(8, y, 300, 12, UI_COLORS.slotHover);
    ui.label(12, y + 2, label);
    const codes = input.bindings[action] || [];
    const text = st.capture === action ? 'press a key...' : codes.map(keyName).join(' / ');
    ui.label(300, y + 2, text, { color: st.capture === action ? UI_COLORS.accent : UI_COLORS.text, align: 'right' });
    if (hot && ui.ui.mouse.released && !st.capture) {
      ui.ui.consumeClick();
      st.capture = action;
      input.textCapture = (e) => {
        if (e.type && e.type !== 'keydown') return;
        if (e.code !== 'Escape') {
          const rest = (input.bindings[action] || []).slice(1).filter((c) => c !== e.code && c.startsWith('Arrow'));
          input.setBinding(action, [e.code, ...rest]);
        }
        st.capture = null;
        input.textCapture = null;
      };
    }
  }, 'binds');
  if (ui.button(8, 182, 'Reset to defaults', { key: 'resetbinds' })) { input.resetBindings(); }
  void DEFAULT_BINDINGS;
}

export default {
  id: 'settings',
  key: null,
  modal: false,
  w: 320, h: 200, anchor: 'center',

  open(store) { st.s = loadSettings(); st.capture = null; void store; },
  close() {
    if (st.capture && typeof window !== 'undefined' && window.__tb?.input) window.__tb.input.textCapture = null;
    st.capture = null;
  },

  draw(ui, store) {
    if (!st.s) st.s = loadSettings();
    ui.frame('Settings');
    if (ui.button(ui.w - 16, 2, 'x', { key: 'close', w: 12, h: 10 })) { ui.ui.close('settings'); return; }
    st.tab = ui.tabs(6, 15, TABS, st.tab);
    const x = 12;
    switch (st.tab) {
      case 0:
        slider(ui, x, 36, 140, 'Master', 'master');
        slider(ui, x, 54, 140, 'Music', 'music');
        slider(ui, x, 72, 140, 'Effects', 'sfx');
        slider(ui, x, 90, 140, 'Ambience', 'amb');
        slider(ui, x, 108, 140, 'Interface', 'ui');
        ui.label(x, 134, 'Sound starts after your first click or key press.', { color: UI_COLORS.dim });
        break;
      case 1:
        choice(ui, x, 34, 'UI scale', 'uiScale', [[0, 'Auto'], [1, '1x'], [2, '2x'], [3, '3x']]);
        choice(ui, x, 54, 'Zoom', 'zoom', [[0, 'Auto'], [2, '2x'], [3, '3x'], [4, '4x']]);
        choice(ui, x, 74, 'Particles', 'particles', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
        ui.label(x, 100, 'Lower particle density helps slower machines.', { color: UI_COLORS.dim });
        break;
      case 2:
        drawControls(ui);
        break;
      case 3:
        toggle(ui, x, 34, 'Screen shake', 'shake');
        if (st.s.shake) choice(ui, x, 54, 'Shake strength', 'shakeStrength', [[0.5, 'Gentle'], [1, 'Normal'], [1.5, 'Strong']]);
        toggle(ui, x, 74, 'Reduce flashing', 'reduceFlashing');
        ui.label(x, 100, 'Rarity markers always use shape as well as colour.', { color: UI_COLORS.dim });
        break;
      default: break;
    }
    void store;
  },
};
