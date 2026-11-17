// Shared helpers for the ability files (not an ability module itself: it default-exports an object without
// `abilities`, which the abilities system ignores).

export { isFoe, dealDamage, foesNear, nearestFoe, hasStatus, applyStatus, alliesNear, nodesNear, hitNodeFor, spawnNodeDrops } from '../systems/procs.js';
export { asPlayer } from '../systems/progression.js';
export { reduceCooldown } from '../systems/abilities.js';
import { asPlayer } from '../systems/progression.js';

export const asPlayerSafe = (game, x) => {
  if (!x) return null;
  if (x.token && x.entity) return x;
  return asPlayer(game, x);
};

export default { id: '_util', abilities: {} };
