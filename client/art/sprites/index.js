// Merges every sprite definition file. Later files override earlier ids (core first, so WP3 can replace core art).

import core from './core.js';
import items from './items.js';
import nodes from './nodes.js';
import structures from './structures.js';
import machines from './machines.js';
import mobs from './mobs.js';
import bosses from './bosses.js';
import npcs from './npcs.js';
import icons from './icons.js';
import decor from './decor.js';

export const SPRITE_FILES = Object.freeze({ core, items, nodes, structures, machines, mobs, bosses, npcs, icons, decor });

export default Object.assign({}, core, items, nodes, structures, machines, mobs, bosses, npcs, icons, decor);
