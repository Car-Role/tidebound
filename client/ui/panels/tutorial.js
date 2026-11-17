// WP13: onboarding prompts (DESIGN 23, revised: q01 pays 60 Glint; Ballast explained). Never modal: a small
// dismissible card at the top of the screen. Each step completes from state the client already has (inventory,
// main quest, level, drafts, tide, plots). Progress is a bitmask in the server-side profile prefs (`settings.set`
// key 'tut'), mirrored in localStorage; prefs.tutOff hides it. hud/toasts.js draws the card every frame while a step
// is pending (it is not opened as a panel, so Esc and the panel stack never close it); opening the panel also works.

import { UI_COLORS } from '../widgets.js';
import { PAL, RAMPS } from '../../art/palette.js';
import { wrapText } from './dialog.js';

const inv = (s, id) => (s.self.inv?.slots ?? []).reduce((n, sl) => n + (sl && sl[0] === id ? sl[1] : 0), 0);
const level = (s) => s.self.xp?.level ?? 1;
const mq = (s) => s.world.mainQuest;
const q01Goal = (s, i) => (mq(s)?.id === 'q01' ? (mq(s).goals?.[i]?.have ?? 0) >= 1 : !!mq(s) && mq(s).id !== 'q01');
const q01Done = (s) => !!mq(s) && mq(s).id !== 'q01';
const plots = (s) => (s.world.plots ?? []).filter((p) => p.owned).length;
const WEAPONS = ['blade_1', 'bow_1', 'staff_1'];
const hasWeapon = (s) => !!s.self.gear?.weapon;
const carriesWeapon = (s) => WEAPONS.some((id) => inv(s, id) > 0);

// The first weapon (WP14 / BUILD_REVIEW P0-1): everything is made at the Workbench. Rope is 4 Reedfiber by hand,
// a Driftwood Blade (or Bow / Staff) is 6 Driftwood + 4 Fieldstone + 2 Rope. The text follows what is still missing.
function weaponText(s) {
  if (carriesWeapon(s)) return 'Equip your new weapon: press Tab and click it in the Character panel beside your bag. Something is rustling in the grass...';
  const rope = inv(s, 'rope'), fiber = inv(s, 'reedfiber'), stone = inv(s, 'fieldstone'), wood = inv(s, 'driftwood');
  const fiberNeed = Math.max(0, 2 - rope) * 4;
  if (fiber < fiberNeed || stone < 4) {
    return `Make a weapon. Pick Reedfiber from the reed clumps by the shore (${Math.min(fiber, fiberNeed)}/${fiberNeed}) and break rocks for Fieldstone (${Math.min(stone, 4)}/4).`;
  }
  if (rope < 2) return 'RMB the Workbench and twist 2 Rope (4 Reedfiber each). A weapon needs 2 Rope.';
  if (wood < 6) return `Gather a little more Driftwood (${wood}/6), then craft a Driftwood Blade at the Workbench.`;
  return 'RMB the Workbench and craft a Driftwood Blade (or a Bow or Staff): 6 Driftwood, 4 Fieldstone, 2 Rope.';
}

// A Workbench costs 10 Driftwood + 6 Fieldstone, so the first tip asks for both and counts them.
function gatherText(s) {
  const wood = Math.min(10, inv(s, 'driftwood')), stone = Math.min(6, inv(s, 'fieldstone'));
  return `Hold LMB on trees and rocks to gather. A Workbench needs Driftwood (${wood}/10) and Fieldstone (${stone}/6).`;
}

export const TUTORIAL_STEPS = Object.freeze([
  // the first steps follow this castaway's own progress, so a crewmate who joins a built world still gets them
  { id: 'gather', text: gatherText, done: (s) => (inv(s, 'driftwood') >= 10 && inv(s, 'fieldstone') >= 6) || q01Goal(s, 0) || hasWeapon(s) || carriesWeapon(s) || level(s) >= 3 },
  { id: 'workbench', text: 'Press B, pick the Workbench from the Stations list and click the ground to place it.', done: (s) => q01Goal(s, 0) },
  { id: 'weapon', text: weaponText, done: (s) => hasWeapon(s) || level(s) >= 5 },
  { id: 'draft', text: 'Level up! Press V and pick one of three Tide Cards. Every level brings a new draft.', when: (s) => level(s) >= 2, done: (s) => level(s) >= 2 && !(s.self.cards?.drafts?.length) },
  { id: 'kiln', text: 'Build a Clay Kiln (B) and smelt copper ore into bars. Finishing Dry Land pays the Treasury 60 Glint.', done: (s) => q01Done(s) },
  { id: 'tide', text: 'Low tide! The sea has pulled back: tidal flats are safe for 2 minutes. Look for a glinting tide cache.', when: (s) => !!s.world.clock?.low, done: () => false, once: true },
  { id: 'ballast', text: 'New land needs Glint AND Ballast, the stone foundation of a plot. Smelt 10 copper bars into Copper Ballast at the Kiln.', done: (s) => inv(s, 'ballast_1') >= 10 || plots(s) > 1 },
  { id: 'raise', text: 'Open the Map (M) and raise a plot next to the start. The Treasury (top right) pays the Glint; your Ballast is used too.', done: (s) => plots(s) > 1 },
  { id: 'goals', text: 'The Goal Tracker on the right leads from here. Enemies now roam beyond the start plot. Good luck, castaway!', done: () => false, timed: 12 },
]);

// Text of a step for the current state (some steps update as the player makes progress).
export const stepText = (step, s) => (typeof step.text === 'function' ? step.text(s) : step.text);

// First pending step for a store-like { self, world } given a bitmask of finished steps; null when all are done.
export function tutorialStep(s, mask = 0) {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    if (mask & (1 << i)) continue;
    const step = TUTORIAL_STEPS[i];
    if (step.done(s)) continue;
    if (step.when && !step.when(s)) continue;
    return { ...step, index: i };
  }
  return null;
}

// Steps that are complete right now (to fold into the mask).
export function completedMask(s, mask = 0) {
  let m = mask;
  TUTORIAL_STEPS.forEach((step, i) => { if (step.done(s)) m |= 1 << i; });
  return m;
}

const st = { mask: 0, loaded: false, cur: null, since: 0, tideSeen: false, sent: -1, off: false };
// per castaway: two tabs (two players) share localStorage, so the key carries this tab's player token
const lsKey = () => { let t = ''; try { t = sessionStorage.getItem('tb.token') || ''; } catch { /* ignore */ } return 'tb.tut' + (t ? '.' + t : ''); };

function loadMask(store) {
  if (st.loaded) return;
  st.loaded = true;
  st.mask = Number(store.self.prefs?.tut) || 0;
  try { st.mask |= Number(localStorage.getItem(lsKey())) || 0; } catch { /* ignore */ }
  st.sent = st.mask;
}

function persist(ui) {
  try { localStorage.setItem(lsKey(), String(st.mask)); } catch { /* ignore */ }
  if (st.sent !== st.mask) { st.sent = st.mask; ui.ui.net?.do('settings.set', { key: 'tut', value: st.mask }); }
}

export function tutorialWanted(store) {
  const prefs = store.self.prefs;
  if (!prefs || (prefs.tutOff && !st.forced) || st.off) return false;
  loadMask(store);
  return !!tutorialStep(store, st.mask);
}

// Bring the tips back (pause menu): clears "hide all" and shows every step that is not already done.
export function resetTutorial() {
  st.mask = 0; st.sent = -1; st.off = false; st.forced = true; st.loaded = true; st.cur = null;
  try { localStorage.removeItem(lsKey()); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.__tb?.net?.do('settings.set', { key: 'tutOff', value: null });
}

// Draws the card into `ui` (bound to a w x h rect; it re-binds itself taller when the text needs it) and returns
// the height used, or false when no step is pending. Shared by the HUD host and the panel.
export function drawTutorialCard(ui, store) {
  loadMask(store);
  const before = st.mask;
  st.mask = completedMask(store, st.mask);
  const step = tutorialStep(store, st.mask);
  if (step?.id !== st.cur?.id) { st.cur = step; st.since = performance.now(); if (step) ui.ui.sound('ui_open'); }
  // the low-tide tip counts as seen once the tide comes back in
  if (step?.id === 'tide') st.tideSeen = true;
  else if (st.tideSeen && !store.world.clock?.low) { st.mask |= 1 << TUTORIAL_STEPS.findIndex((x) => x.id === 'tide'); st.tideSeen = false; }
  if (step?.timed && performance.now() - st.since > step.timed * 1000) st.mask |= 1 << step.index;
  if (st.mask !== before) persist(ui);
  if (!step) return false;

  const t = (performance.now() - st.since) / 1000;
  const slide = Math.min(1, t / 0.25);
  // grow to fit the text (2-4 lines) so no tip is ever cut off; the host reads the returned height
  const lines = wrapText(stepText(step, store), ui.w - 44).slice(0, 4);
  const h = Math.max(24, 6 + lines.length * 9 + 3);
  if (ui.h !== h) ui.bind(ui.ctx, { x: ui.x, y: ui.y, w: ui.w, h }, ui.id);
  const fresh = Math.max(0, 1 - t / 1.2);          // a new step flashes its frame gold for a moment
  ui.ctx.save();
  ui.ctx.globalAlpha = slide;
  const dy = Math.round((1 - slide) * -6);
  ui.rect(0, dy, ui.w, ui.h, fresh > 0 && Math.floor(t * 6) % 2 === 0 ? PAL[RAMPS.gold[3]] : UI_COLORS.borderDark);
  ui.rect(1, dy + 1, ui.w - 2, ui.h - 2, UI_COLORS.bg);
  ui.rect(1, dy + 1, 3, ui.h - 2, PAL[RAMPS.teal[3 + (Math.floor(t * 2) % 2)]]);
  lines.forEach((l, i) => ui.label(9, dy + 4 + i * 9, l));
  ui.label(ui.w - 5, dy + 4, `${step.index + 1}/${TUTORIAL_STEPS.length}`, { color: UI_COLORS.dim, align: 'right' });
  ui.ctx.restore();
  if (ui.button(ui.w - 15, ui.h - 13, 'x', { key: 'dismiss', w: 11, h: 10, tooltip: 'Hide this tip (Shift-click the card hides all tips)' })) { st.mask |= 1 << step.index; persist(ui); }
  else if (ui.hover(0, 0, ui.w - 20, ui.h) && ui.ui.mouse.released && (ui.ui.input.down?.has('ShiftLeft') || ui.ui.input.down?.has('ShiftRight'))) {
    ui.ui.consumeClick();
    st.off = true; st.forced = false;
    ui.ui.net?.do('settings.set', { key: 'tutOff', value: true });
  }
  return h;
}

export default {
  id: 'tutorial',
  key: null,
  modal: false,
  w: 260, h: 34, anchor: 'top',

  open(store, args) { if (args?.reset) resetTutorial(); },
  close() {},
  draw(ui, store) { if (!drawTutorialCard(ui, store)) ui.ui.close('tutorial'); },
};
