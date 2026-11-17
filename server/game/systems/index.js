// Ordered list of every system (TECH_SPEC 5.2). Frozen after WP1: owners edit only their own system file.

import coop from './coop.js';
import clock from './clock.js';
import land from './land.js';
import nodes from './nodes.js';
import movement from './movement.js';
import gathering from './gathering.js';
import drops from './drops.js';
import inventory from './inventory.js';
import crafting from './crafting.js';
import stations from './stations.js';
import building from './building.js';
import storage from './storage.js';
import combat from './combat.js';
import projectiles from './projectiles.js';
import status from './status.js';
import mobs from './mobs.js';
import ai from './ai.js';
import bosses from './bosses.js';
import death from './death.js';
import defence from './defence.js';
import raids from './raids.js';
import progression from './progression.js';
import cards from './cards.js';
import procs from './procs.js';
import skills from './skills.js';
import classes from './classes.js';
import abilities from './abilities.js';
import gear from './gear.js';
import consumables from './consumables.js';
import waystones from './waystones.js';
import shrines from './shrines.js';
import machines from './machines.js';
import scuttlers from './scuttlers.js';
import sluices from './sluices.js';
import autocraft from './autocraft.js';
import producers from './producers.js';
import gulls from './gulls.js';
import ledger from './ledger.js';
import farming from './farming.js';
import fishing from './fishing.js';
import market from './market.js';
import dungeons from './dungeons.js';
import quests from './quests.js';
import npcs from './npcs.js';
import archive from './archive.js';
import deeds from './deeds.js';
import tidegate from './tidegate.js';
import finale from './finale.js';
import rebirth from './rebirth.js';

export const SYSTEM_ORDER = Object.freeze([
  'coop', 'clock', 'land', 'nodes', 'movement', 'gathering', 'drops', 'inventory', 'crafting', 'stations',
  'building', 'storage', 'combat', 'projectiles', 'status', 'mobs', 'ai', 'bosses', 'death', 'defence',
  'raids', 'progression', 'cards', 'procs', 'skills', 'classes', 'abilities', 'gear', 'consumables',
  'waystones', 'shrines', 'machines', 'scuttlers', 'sluices', 'autocraft', 'producers', 'gulls', 'ledger',
  'farming', 'fishing', 'market', 'dungeons', 'quests', 'npcs', 'archive', 'deeds', 'tidegate', 'finale',
  'rebirth',
]);

export const systems = Object.freeze([
  coop, clock, land, nodes, movement, gathering, drops, inventory, crafting, stations,
  building, storage, combat, projectiles, status, mobs, ai, bosses, death, defence,
  raids, progression, cards, procs, skills, classes, abilities, gear, consumables,
  waystones, shrines, machines, scuttlers, sluices, autocraft, producers, gulls, ledger,
  farming, fishing, market, dungeons, quests, npcs, archive, deeds, tidegate, finale,
  rebirth,
]);

export default systems;
