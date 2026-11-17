// HUD widget registry (drawn in `order`). Frozen after WP1: owners edit only their widget file.

import bars from './bars.js';
import hotbar from './hotbar.js';
import pickups from './pickups.js';
import boss from './boss.js';
import abilities from './abilities.js';
import draftBadge from './draft-badge.js';
import clock from './clock.js';
import treasury from './treasury.js';
import flux from './flux.js';
import goals from './goals.js';
import party from './party.js';
import minimap from './minimap.js';
import chat from './chat.js';
import toasts from './toasts.js';

export default Object.freeze([
  bars, hotbar, pickups, boss, abilities, draftBadge, clock, treasury, flux, goals, party, minimap, chat, toasts,
]);
