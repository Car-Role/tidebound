// WP3 sprite tests (TECH_SPEC 9.4): pure-JS checks of every generated pixel map, and coverage of every content id.

import { ok, eq } from './assert.js';
import { content } from '../shared/data/index.js';
import { TILE_NAMES } from '../shared/grid.js';
import { PAL, CHAR_INDEX } from '../client/art/palette.js';
import { parseSprite, resolveDefs } from '../client/art/spritegen.js';
import { makePainter } from '../client/art/tilegen.js';
import { createRng } from '../shared/rng.js';
import defs, { SPRITE_FILES } from '../client/art/sprites/index.js';
import { tiles, dungeonTiles } from '../client/art/gen/biomes.js';

const resolved = resolveDefs(defs);
const framesOf = (d) => [...(d.px ? [d.px] : []), ...(d.frames ?? []), ...Object.values(d.anims ?? {}).flat()];
const missing = (ids) => ids.filter((id) => !resolved[id]);

export default async function (t) {
  t.test('every sprite definition has valid size, rows and palette chars', () => {
    const bad = [];
    for (const [id, d] of Object.entries(resolved)) {
      if (!(d.w > 0 && d.h > 0)) { bad.push(id + ': size'); continue; }
      const frames = framesOf(d);
      if (!frames.length) bad.push(id + ': no frames');
      for (const rows of frames) {
        if (rows.length !== d.h) bad.push(`${id}: ${rows.length} rows, h=${d.h}`);
        for (const r of rows) {
          if (r.length !== d.w) { bad.push(`${id}: row length ${r.length}, w=${d.w}`); break; }
          for (const ch of r) if (!(ch in PAL) || CHAR_INDEX[ch] === undefined) { bad.push(`${id}: char '${ch}'`); break; }
        }
      }
      for (const sw of d.variants ?? []) for (const [a, b] of Object.entries(sw)) if (!(a in PAL) || !(b in PAL)) bad.push(`${id}: variant char ${a}->${b}`);
      try { parseSprite(d, id); } catch (err) { bad.push(err.message); }
    }
    eq(bad.slice(0, 10), [], 'invalid sprites');
  });

  t.test('every ref resolves', () => {
    const refs = Object.entries(defs).filter(([, d]) => d.ref).map(([id]) => id);
    ok(refs.length > 0, 'expected some refs');
    eq(missing(refs), []);
  });

  t.test('every item, node, structure, enemy, boss, NPC and crop has real art', () => {
    eq(missing(content.items.map((i) => 'item.' + i.id)), [], 'items');
    eq(missing(content.nodes.map((n) => 'node.' + n.id)), [], 'nodes');
    eq(missing(content.structures.map((s) => 'struct.' + s.id)), [], 'structures');
    eq(missing(content.enemies.map((e) => 'mob.' + e.id)), [], 'enemies');
    eq(missing(content.bosses.flatMap((b) => ['boss.' + b.id, `boss.${b.id}.p2`, `boss.${b.id}.p3`])), [], 'bosses');
    eq(missing(content.npcs.map((n) => 'npc.' + n.id)), [], 'npcs');
    eq(missing(content.crops.map((c) => 'crop.' + c.id)), [], 'crops');
    eq(content.items.length, 262); eq(content.nodes.length, 33); eq(content.structures.length, 74);
  });

  t.test('every icon referenced by content exists', () => {
    eq(missing(content.abilities.map((a) => a.icon)), [], 'ability icons');
    eq(missing(content.cards.map((c) => 'icon.card.' + c.id)), [], 'cards');
    eq(missing(content.skills.map((s) => 'icon.skill.' + s.id)), [], 'skills');
    eq(missing(content.blessings.map((b) => 'icon.blessing.' + b.id)), [], 'blessings');
    eq(missing(content.rebirth.map((r) => 'icon.rebirth.' + r.id)), [], 'rebirth');
    eq(missing(content.classes.map((c) => 'icon.class.' + c.id)), [], 'classes');
    eq(missing(content.weather.map((w) => 'icon.weather.' + w.id)), [], 'weather');
    const R = content.registries;
    eq(missing(R.STATUSES.map((s) => 'icon.status.' + s)), [], 'statuses');
    eq(missing(R.BUFF_IDS.map((s) => 'icon.buff.' + s)), [], 'buffs');
    eq(missing(R.ELEMENTS.map((s) => 'icon.element.' + s)), [], 'elements');
    eq(missing(R.CARD_TAGS.map((s) => 'icon.tag.' + s)), [], 'tags');
    eq(missing(R.RARITIES.map((s) => 'icon.rarity.' + s)), [], 'rarities');
  });

  t.test('mobs and bosses carry the full animation set', () => {
    const want = { idle: 2, walk: 4, windup: 2, attack: 2, hit: 1 };
    for (const e of content.enemies) {
      const d = resolved['mob.' + e.id];
      for (const [k, n] of Object.entries(want)) eq(d.anims[k]?.length, n, `mob.${e.id}.${k}`);
      ok(d.mirror, 'mob mirror');
    }
    for (const b of content.bosses) for (const k of ['idle', 'attack', 'hit']) ok(resolved['boss.' + b.id].anims[k]?.length >= 1, `boss.${b.id}.${k}`);
  });

  t.test('player parts share the body animation layout', () => {
    const body = resolved['pl.body'];
    for (const k of ['idle_down', 'run_side', 'swing_up', 'roll_side']) ok(body.anims[k], 'body anim ' + k);
    eq(body.variants?.length, 8, 'shirt variants kept');
    const parts = Object.keys(resolved).filter((id) => /^pl\.(outfit|hat|hook|weapon)\./.test(id));
    ok(parts.length >= 6 + 21 + 7 + 21, 'part count ' + parts.length);
    for (const id of parts) for (const [k, list] of Object.entries(body.anims)) eq(resolved[id].anims[k]?.length, list.length, `${id}.${k}`);
    eq(missing(content.classes.map((c) => 'pl.outfit.' + c.id)), [], 'outfits');
    const hats = content.deeds.filter((d) => d.cosmeticKind === 'hat').map((d) => 'pl.hat.' + d.cosmetic);
    eq(missing(hats), [], 'deed hats');
    eq(missing(content.deeds.filter((d) => d.cosmeticKind === 'hook_skin').map((d) => 'pl.hook.' + d.cosmetic)), [], 'hook skins');
  });

  t.test('fx, helper, chest, summon and projectile sprites exist', () => {
    const fx = ['crab', 'gull', 'leaf', 'feather', 'coin', 'gear', 'note', 'flake', 'fish_sil', 'bubble', 'banner', 'chain'].map((n) => 'decor.' + n);
    eq(missing(fx), [], 'fx sprites');
    eq(missing(['helper.scuttler', 'helper.gull', 'chest.chest', 'chest.sea_chest', 'chest.tide_cache', 'summon.turret_pocket', 'summon.sproutling', 'summon.battle_scuttler', 'proj.arrow', 'bobber.bobber']), []);
  });

  t.test('ground generators cover every tile name and every Vault tileset', () => {
    for (const name of TILE_NAMES) {
      ok(typeof tiles[name] === 'function', 'generator ' + name);
      const g = makePainter(7);
      tiles[name](g, createRng(3));
      ok(g.data.some((v) => v !== 0), 'painted ' + name);
    }
    for (const d of content.dungeons) {
      const set = dungeonTiles[d.tileset];
      ok(set && set.floor && set.wall, 'tileset ' + d.tileset);
      const g = makePainter(1); set.floor(g, createRng(1));
      ok(g.data.every((v) => v !== 0), 'floor fully painted ' + d.tileset);
    }
  });

  t.test('sprite files stay in their lanes and parse fast', () => {
    const t0 = performance.now();
    let frames = 0;
    for (const [id, d] of Object.entries(resolved)) { const p = parseSprite(d, id); for (const l of Object.values(p.frames)) frames += l.length; }
    const ms = performance.now() - t0;
    ok(frames > 2000, 'frame count ' + frames);
    ok(ms < 1500, `parse took ${Math.round(ms)} ms`);
    for (const [file, map] of Object.entries(SPRITE_FILES)) ok(Object.keys(map).length > 0, 'file ' + file + ' not empty');
  });
}
