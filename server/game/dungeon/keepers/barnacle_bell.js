// Keeper 2 - The Barnacle Bell: toll (expanding ring, jump the gap) and barnacle_spit (5-shot fan); P2 flood
// (half the room floods for 6 s, slow 50%; pulling a lever drains it); P3 clapper_swing (270-degree sweep, then
// 2 s vulnerable, x2 damage taken).
import { createEntity } from '../../entities.js';

function roomOf(game, b) {
  const inst = game.call('instanceOf', b.realm);
  const a = b.data.enc.arena;
  return inst?.rooms?.find((r) => a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h) ?? { x: a.x - 16, y: a.y - 12, w: 33, h: 25, cx: a.x, cy: a.y };
}

function drain(game, b) {
  const f = b.data.flood;
  if (!f) return;
  if (f.zone && !f.zone.removed) { game.realms.get(b.realm)?.remove(f.zone); game.zoneActive?.delete(f.zone); }
  b.data.flood = null;
  for (const l of b.data.levers ?? []) l.set('it', 0);
  game.fx(b.realm, 'tide_out', b.x, b.y, { drain: 1 });
}

export default {
  id: 'barnacle_bell',
  script: {
    radius: 1.4, speed: 0, range: 0, movement: 'stationary', fxHit: 'hit_armor', blood: 'teal', armor: 30, gcd: 0.9,
    phases: [{ at: 1, moves: ['toll', 'barnacle_spit'] }, { at: 0.66, moves: ['flood'] }, { at: 0.33, moves: ['clapper_swing'] }],
    onStart(game, b, k) {
      b.data.static = true;
      // two levers at the room's side walls
      const room = roomOf(game, b);
      const realm = k.realm(b);
      b.data.levers = [room.x + 1, room.x + room.w - 2].map((tx) => {
        const ty = Math.floor(room.cy);
        const e = createEntity(game, { type: 'structure', kind: 'flood_lever', x: tx + 0.5, y: ty + 0.5, hp: 0, radius: 0.5, data: { tx, ty, w: 1, h: 1, boss: b.id }, pub: { rot: 0, own: 0, on: 1, it: 0 } });
        realm.add(e);
        return e;
      });
      if (!game.services.interactions.has('flood_lever')) {
        game.call('registerInteract', 'flood_lever', (g, player, lever) => {
          const boss = g.realms.get(lever.realm)?.entities.get(lever.data.boss);
          if (!boss?.data?.flood) { g.toast(player, 'The lever clanks. Nothing to drain.', 'info'); return { ok: true }; }
          lever.set('it', 1);
          drain(g, boss);
          return { ok: true };
        });
      }
    },
    tick(game, b) {
      if (b.data.flood && game.now >= b.data.flood.until) drain(game, b);
      if (b.data.vulnUntil && game.now >= b.data.vulnUntil) { b.data.vulnUntil = 0; b.data.dmgMult = null; b.set('cx', 0); }
    },
    moves: {
      toll: {
        windup: 0.9, cooldown: 5, aim: 'self',
        telegraph: { shape: 'ring', r: 2.5, r2: 1.5 },
        run(game, b, t, k, aim) {
          const g = aim.a + game.bossRng.float(-0.8, 0.8);
          k.ring(b, { x: b.x, y: b.y, from: 1.5, to: 17, dur: 2.4, width: 1.1, mult: 1.0, kind: 'tollring', color: 6, gaps: [{ a: g, arc: 40 }] });
          k.fx(b, 'keeper_bell', { gap: Math.round(g * 100) / 100 });
        },
      },
      barnacle_spit: {
        windup: 0.7, cooldown: 4, aim: 'self', track: true,
        telegraph: { shape: 'cone', r: 7, arc: 60 },
        run(game, b, t, k, aim) { for (let i = 0; i < 5; i++) k.shoot(b, 'barnacle', aim.a + (i - 2) * 0.2, { speed: 8, range: 16, mult: 0.7 }); },
      },
      flood: {
        windup: 1.2, cooldown: 16, aim: 'self', when: (game, b) => !b.data.flood,
        zones: (game, b) => {
          const room = roomOf(game, b);
          const left = game.bossRng.next() < 0.5;
          return [{ shape: 'rect', x: left ? room.x + room.w / 4 : room.x + room.w * 0.75, y: room.y + room.h / 2, w: room.w / 2, h: room.h }];
        },
        run(game, b, t, k, aim) {
          const z = aim.zones[0];
          const zone = k.zoneAt(b, { kind: 'flood', shape: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, r: z.w / 2, dur: 6, dps: k.dmg(b, 0.12), tick: 0.5, status: { id: 'slow', dur: 0.7, power: 0.5 } });
          b.data.flood = { zone, until: game.now + 6 };
          k.fx(b, 'tide_wave', { flood: 1, w: z.w }, z.x, z.y);
        },
      },
      clapper_swing: {
        windup: 1.2, cooldown: 12, aim: 'self', track: true,
        telegraph: { shape: 'cone', r: 5.5, arc: 270 },
        run(game, b, t, k, aim) {
          k.hit(b, aim.spec, 1.4, { knock: 2, fx: 'keeper_bell' });
          b.data.dmgMult = 2;
          b.data.vulnUntil = game.now + 2;
          b.set('cx', 1);
          return 2;
        },
      },
    },
    onEnd(game, b) {
      drain(game, b);
      for (const l of b.data.levers ?? []) if (!l.removed) game.realms.get(b.realm)?.remove(l);
    },
  },
};
