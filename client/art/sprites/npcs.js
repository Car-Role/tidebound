// WP3 NPC sprites ('npc.<id>', 16x20, anchor [8,19], mirror: true) with anims idle (2), talk (2), idle_side (2).
// NPCs are built on the player body (recoloured hair, skin, clothes) plus role accessories, so they share the
// player's proportions. This file also merges the layered player parts from gen/player-parts.js.

import { Px, R, INK } from '../gen/paint.js';
import parts, { analyse, hatShape, BODY } from '../gen/player-parts.js';
import NPCS from '../../../shared/data/npcs.js';

const W = '#';
const swapRamp = (from, to, idx) => Object.fromEntries(idx.map((i) => [from[i], to[i]]));

function recolor(rows, look) {
  const map = {
    ...swapRamp(R.brown, look.hair, [2, 3]),
    ...swapRamp(R.flesh, look.skin, [2, 3]),
    ...swapRamp(R.teal, look.shirt, [2, 3, 4]),
    ...swapRamp(R.sea, look.pants, [0, 1]),
    [R.brown[1]]: look.boots[1],
  };
  return Px.from(rows).swap(map);
}

const LOOKS = {
  npc_ferrin: { hair: R.sand, skin: R.flesh, shirt: R.brown, pants: R.stone, boots: R.brown, hat: 'straw',
    extra: (p, a, dir) => { if (dir !== 'up') { p.ellipse(a.sx1, a.shirtTop + 2, 2.5, 2, R.sand[3]); p.set(a.sx1, a.shirtTop + 2, R.sand[1]); } } },
  npc_odalys: { hair: R.ink, skin: R.brown, shirt: R.teal, pants: R.teal, boots: R.brown, hat: 'chef',
    extra: (p, a, dir) => { if (dir !== 'up') { p.rect(a.sx0 + 1, a.shirtTop + 1, a.sx1 - a.sx0 - 1, a.shirtBot - a.shirtTop + 3, W); p.hline(a.sx0 + 1, a.sx1 - 1, a.shirtTop + 1, R.ice[3]); } } },
  npc_brannick: { hair: R.ember, skin: R.flesh, shirt: R.stone, pants: R.ink, boots: R.ink, hat: null,
    extra: (p, a, dir) => {
      if (dir !== 'up') { p.rect(a.sx0 + 1, a.shirtTop + 1, a.sx1 - a.sx0 - 1, a.shirtBot - a.shirtTop + 3, R.brown[1]); p.rect(Math.round(a.hcx) - 2, a.shirtTop - 2, 5, 3, R.ember[2]); p.set(Math.round(a.hcx), a.shirtTop, R.ember[1]); }
      p.hline(a.hx0 + 1, a.hx1 - 1, a.headTop, R.flesh[3]);
    } },
  npc_sootwren: { hair: R.ink, skin: R.flesh, shirt: R.ink, pants: R.stone, boots: R.ink, hat: 'goggles',
    extra: (p, a) => { p.hline(a.sx0, a.sx1, a.shirtBot, R.gold[2]); p.set(a.sx0 + 1, a.shirtTop + 2, R.stone[1]); } },
  npc_ashka: { hair: R.ember, skin: R.flesh, shirt: R.violet, pants: R.violet, boots: R.ink, hat: 'witch',
    extra: (p, a, dir) => { if (dir !== 'up') { p.rect(a.sx1 + 1, a.shirtBot - 3, 2, 3, R.grass[3]); p.set(a.sx1 + 1, a.shirtBot - 4, R.ice[4]); } } },
  npc_lumen: { hair: W === '#' ? R.ice : R.ice, skin: R.flesh, shirt: R.ice, pants: R.sand, boots: R.sand, hat: null,
    extra: (p, a, dir) => { if (dir === 'down') { p.set(a.hx1 - 2, a.headTop + 4, R.gold[3]); p.set(a.hx1 - 3, a.headTop + 4, R.ice[4]); } p.set(a.sx0 - 1, a.shirtTop + 1, R.violet[4]); p.set(a.sx0 - 1, a.shirtTop, R.ice[4]); } },
  npc_quill: { hair: R.brown, skin: R.flesh, shirt: R.sand, pants: R.brown, boots: R.brown, hat: 'fedora',
    extra: (p, a, dir) => { if (dir !== 'up') { p.rect(a.sx1, a.shirtTop + 1, 2, 5, R.sand[4]); p.set(a.sx1, a.shirtTop + 1, R.ember[3]); } } },
  npc_halvard: { hair: R.stone, skin: R.flesh, shirt: R.brown, pants: R.brown, boots: R.ink, hat: 'hood_fur',
    extra: (p, a) => { for (let y = a.shirtTop; y <= a.shirtBot + 2; y++) { p.set(a.sx0 - 1, y, R.ice[4]); p.set(a.sx1 + 1, y, R.ice[3]); } } },
  npc_ysolde: { hair: R.gold, skin: R.flesh, shirt: R.sea, pants: R.ink, boots: R.brown, hat: 'sailor',
    extra: (p, a, dir) => { if (dir !== 'up') { p.vline(a.sx1 + 2, a.headTop, a.shirtBot + 6, R.brown[3]); p.rect(a.sx1 + 1, a.headTop - 3, 3, 3, R.gold[4]); p.set(a.sx1 + 2, a.headTop - 2, W); } } },
  npc_nix: { hair: R.violet, skin: R.flesh, shirt: R.ink, pants: R.ink, boots: R.ink, hat: 'mortar',
    extra: (p, a, dir) => { if (dir !== 'up') { p.rect(a.sx0 - 1, a.shirtTop + 2, 3, 4, R.violet[3]); p.hline(a.sx0 - 1, a.sx0 + 1, a.shirtTop + 2, R.gold[3]); } } },
  npc_morrow: { hair: R.stone, skin: R.flesh, shirt: R.gold, pants: R.gold, boots: R.stone, hat: 'diving', extra: null },
};

function hoodFur(p, a) {
  p.rect(a.hx0 - 1, a.headTop - 1, a.hx1 - a.hx0 + 3, 3, R.ice[4]);
  p.vline(a.hx0 - 1, a.headTop, a.headTop + 5, R.ice[3]); p.vline(a.hx1 + 1, a.headTop, a.headTop + 5, R.ice[3]);
}

function build(look) {
  const mk = (rows, dir, talk) => {
    const p = recolor(rows, look);
    const a = analyse(rows);
    if (look.extra) look.extra(p, a, dir);
    if (look.hat === 'hood_fur') hoodFur(p, a);
    else if (look.hat) hatShape(look.hat)(p, a, dir);
    if (talk && dir === 'down') { const fy = a.shirtTop - 2; p.set(Math.round(a.hcx), fy, INK); p.set(Math.round(a.hcx) + 1, fy, INK); }
    return p.rows();
  };
  const d = BODY.anims.idle_down, s = BODY.anims.idle_side;
  return {
    w: 16, h: 20, fps: 3, mirror: true, anchor: [8, 19],
    anims: { idle: [mk(d[0], 'down'), mk(d[1], 'down')], talk: [mk(d[0], 'down', true), mk(d[1], 'down')], idle_side: [mk(s[0], 'side'), mk(s[1], 'side')] },
  };
}

const out = { ...parts };
for (const n of NPCS) {
  const look = LOOKS[n.id] ?? { hair: R.brown, skin: R.flesh, shirt: R.teal, pants: R.sea, boots: R.brown, hat: 'cap' };
  out['npc.' + n.id] = build(look);
}
export default out;
