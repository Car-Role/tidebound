// Keyboard/mouse state, action mapping (DESIGN 3), rebinding stored in localStorage.
// When a UI panel has focus (`suppressGameplay`), gameplay actions read as idle.

export const DEFAULT_BINDINGS = Object.freeze({
  'move.up': ['KeyW', 'ArrowUp'], 'move.down': ['KeyS', 'ArrowDown'],
  'move.left': ['KeyA', 'ArrowLeft'], 'move.right': ['KeyD', 'ArrowRight'],
  primary: ['Mouse0'], interact: ['Mouse2'], dodge: ['Space'],
  ability1: ['KeyQ'], ability2: ['KeyE'], ability3: ['KeyR'], ability4: ['KeyF'],
  ability5: ['KeyZ'], ability6: ['KeyX'],
  hotbar1: ['Digit1'], hotbar2: ['Digit2'], hotbar3: ['Digit3'], hotbar4: ['Digit4'],
  hotbar5: ['Digit5'], hotbar6: ['Digit6'], hotbar7: ['Digit7'], hotbar8: ['Digit8'],
  'panel.inventory': ['Tab'], 'panel.build': ['KeyB'], 'panel.crafting': ['KeyC'], 'panel.skills': ['KeyK'],
  'panel.deck': ['KeyV'], 'panel.map': ['KeyM'], 'panel.journal': ['KeyJ'],
  ping: ['KeyT'], chat: ['Enter'], menu: ['Escape'],
});

// Actions that keep working while a panel has focus.
const UI_ACTIONS = new Set(['menu', 'chat', 'panel.inventory', 'panel.build', 'panel.crafting', 'panel.skills', 'panel.deck', 'panel.map', 'panel.journal']);
const STORAGE_KEY = 'tb.binds';

export class Input {
  constructor(target = window, canvas = null) {
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouse = { x: 0, y: 0, inside: false, wheel: 0 };
    this.suppressGameplay = false;
    this.textCapture = null;      // fn(key event) while a text field is focused (chat)
    this.bindings = this.loadBindings();
    this.reverse = new Map();
    this.rebuild();
    this.attach(target, canvas || target);
  }

  loadBindings() {
    const b = structuredClone(DEFAULT_BINDINGS);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      for (const [a, codes] of Object.entries(saved)) if (a in b && Array.isArray(codes)) b[a] = codes;
    } catch { /* defaults */ }
    return b;
  }

  rebuild() {
    this.reverse.clear();
    for (const [action, codes] of Object.entries(this.bindings)) {
      for (const c of codes) {
        if (!this.reverse.has(c)) this.reverse.set(c, []);
        this.reverse.get(c).push(action);
      }
    }
  }

  setBinding(action, codes) {
    this.bindings[action] = codes;
    this.rebuild();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings)); } catch { /* ignore */ }
  }

  resetBindings() {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.rebuild();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  codeDown(code) {
    if (this.down.has(code)) return;
    this.down.add(code);
    this.pressedSet.add(code);
  }
  codeUp(code) {
    if (!this.down.delete(code)) return;
    this.releasedSet.add(code);
  }

  attach(target, canvas) {
    target.addEventListener('keydown', (e) => {
      if (this.textCapture) { this.textCapture(e); e.preventDefault(); return; }
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.codeDown(e.code);
    });
    target.addEventListener('keyup', (e) => this.codeUp(e.code));
    target.addEventListener('blur', () => { for (const c of [...this.down]) this.codeUp(c); });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    canvas.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.codeDown('Mouse' + e.button); e.preventDefault(); });
    target.addEventListener('mouseup', (e) => this.codeUp('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  blocked(action) { return this.suppressGameplay && !UI_ACTIONS.has(action); }

  held(action) {
    if (this.blocked(action)) return false;
    for (const c of this.bindings[action] || []) if (this.down.has(c)) return true;
    return false;
  }

  pressed(action) {
    if (this.blocked(action)) return false;
    for (const c of this.bindings[action] || []) if (this.pressedSet.has(c)) return true;
    return false;
  }

  released(action) {
    for (const c of this.bindings[action] || []) if (this.releasedSet.has(c)) return true;
    return false;
  }

  mouseDown(button = 0) { return this.down.has('Mouse' + button); }
  mousePressed(button = 0) { return this.pressedSet.has('Mouse' + button); }
  mouseReleased(button = 0) { return this.releasedSet.has('Mouse' + button); }

  // Normalised move axis {x, y}.
  axis(out = { x: 0, y: 0 }) {
    out.x = (this.held('move.right') ? 1 : 0) - (this.held('move.left') ? 1 : 0);
    out.y = (this.held('move.down') ? 1 : 0) - (this.held('move.up') ? 1 : 0);
    if (out.x && out.y) { out.x *= Math.SQRT1_2; out.y *= Math.SQRT1_2; }
    return out;
  }

  // Mouse position in world tiles, given the camera.
  aimTile(camera, out = { x: 0, y: 0 }) { return camera.screenToWorld(this.mouse.x, this.mouse.y, out); }

  // Call at the end of every frame.
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouse.wheel = 0;
  }
}
