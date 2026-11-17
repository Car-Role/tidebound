// Panel registry. Frozen after WP1: owners edit only their panel file.

import inventory from './inventory.js';
import crafting from './crafting.js';
import build from './build.js';
import station from './station.js';
import storage from './storage.js';
import character from './character.js';
import draft from './draft.js';
import deck from './deck.js';
import skills from './skills.js';
import classPanel from './class.js';
import temper from './temper.js';
import map from './map.js';
import machine from './machine.js';
import market from './market.js';
import fishing from './fishing.js';
import dungeon from './dungeon.js';
import journal from './journal.js';
import dialog from './dialog.js';
import tidegate from './tidegate.js';
import rebirth from './rebirth.js';
import title from './title.js';
import settings from './settings.js';
import pause from './pause.js';
import tutorial from './tutorial.js';

export default Object.freeze([
  inventory, crafting, build, station, storage, character, draft, deck, skills, classPanel, temper, map,
  machine, market, fishing, dungeon, journal, dialog, tidegate, rebirth, title, settings, pause, tutorial,
]);
