// Keeper 4 - The Twin Lenses (two bodies): beam (each Lens fires a tracking beam, 1.2 s charge) and swap (the two
// trade places); P2 refract (beams bounce off the room's mirrors once); P3 focus (both beams converge on one
// player). Killing one Lens enrages the other (+40% rate).
import { createEntity } from '../../entities.js';
const r2 = (v) => Math.round(v * 100) / 100;

function mirrors(game, b) { return (b.data.enc.mirrors ?? []).filter((m) => !m.removed); }

export default {
  id: 'twin_lenses',
  script: {
    radius: 1.0, speed: 1.6, range: 7, movement: 'hover', fxHit: 'hit_armor', blood: 'white', gcd: 1.0,
    phases: [{ at: 1, moves: ['beam', 'swap'] }, { at: 0.66, moves: ['refract'] }, { at: 0.33, moves: ['focus'] }],
    onStart(game, b, k) {
      const enc = b.data.enc;
      if (b.data.index !== 0 || enc.mirrors) return;
      const a = enc.arena;
      const realm = k.realm(b);
      enc.mirrors = [[-9, -6], [9, 6], [9, -6], [-9, 6]].map(([dx, dy]) => {
        const e = createEntity(game, { type: 'structure', kind: 'keeper_mirror', x: a.x + dx, y: a.y + dy, hp: 0, radius: 0.6, data: { tx: Math.floor(a.x + dx), ty: Math.floor(a.y + dy), w: 1, h: 1 }, pub: { rot: 0, own: 0, on: 1 } });
        realm.add(e);
        return e;
      });
    },
    moves: {
      beam: {
        windup: 1.2, cooldown: 3.5, track: true,
        telegraph: { shape: 'line', len: 22, w: 1.0 },
        run(game, b, t, k, aim) {
          k.lineHits(b, b.x, b.y, aim.a, 22, 1.0, 1.0, { knock: 0.5 });
          k.fx(b, 'keeper_lenses', { a: r2(aim.a), len: 22 });
        },
      },
      swap: {
        windup: 0.8, cooldown: 12, aim: 'self', when: (game, b) => b.data.index === 0 && b.data.enc.members.filter((m) => !m.removed).length > 1,
        telegraph: { shape: 'circle', r: 1.2 },
        run(game, b, t, k) {
          const other = b.data.enc.members.find((m) => m !== b && !m.removed);
          if (!other) return;
          const realm = k.realm(b);
          const x = b.x, y = b.y;
          k.fx(b, 'waystone_warp', { out: 1 });
          realm.move(b, other.x, other.y);
          realm.move(other, x, y);
          k.fx(b, 'waystone_warp', { in: 1 });
        },
      },
      refract: {
        windup: 1.3, cooldown: 7,
        zones: (game, b, t, k) => {
          const ms = mirrors(game, b);
          if (!ms.length || !t) return [];
          const m = ms.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[Math.floor(game.bossRng.next() * Math.min(2, ms.length))];
          const a1 = Math.atan2(m.y - b.y, m.x - b.x), l1 = Math.hypot(m.x - b.x, m.y - b.y);
          const a2 = Math.atan2(t.y - m.y, t.x - m.x);
          return [{ shape: 'line', x: b.x, y: b.y, a: a1, len: l1, w: 1.0 }, { shape: 'line', x: m.x, y: m.y, a: a2, len: 22, w: 1.0 }];
        },
        run(game, b, t, k, aim) {
          for (const z of aim.zones ?? []) { k.lineHits(b, z.x, z.y, z.a, z.len, z.w, 1.1, { knock: 0.5 }); k.fx(b, 'keeper_lenses', { a: r2(z.a), len: z.len }, z.x, z.y); }
        },
      },
      focus: {
        windup: 1.4, cooldown: 9, when: (game, b) => b.data.index === 0,
        zones: (game, b, t, k) => {
          if (!t) return [];
          const out = [];
          for (const L of k.members(b)) out.push({ shape: 'line', x: L.x, y: L.y, a: Math.atan2(t.y - L.y, t.x - L.x), len: Math.hypot(t.x - L.x, t.y - L.y) + 1, w: 1.0 });
          out.push({ shape: 'circle', x: t.x, y: t.y, r: 2.2 });
          return out;
        },
        run(game, b, t, k, aim) {
          const zs = aim.zones ?? [];
          for (const z of zs) {
            if (z.shape === 'line') { k.lineHits(b, z.x, z.y, z.a, z.len, z.w, 0.8, { knock: 0.3 }); k.fx(b, 'keeper_lenses', { a: r2(z.a), len: z.len, focus: 1 }, z.x, z.y); }
            else { k.hit(b, z, 1.5, { knock: 1.6, fx: 'keeper_lenses', melee: false }); }
          }
        },
      },
    },
    onPartDeath(game, b, others, k) {
      for (const o of others) { k.enrage(o, true); o.data.atkRate = 1.4; o.data.gcd = game.now + 0.5; }
      for (const p of k.allPlayers(b, 40)) game.toast(game.players.get(p.id), 'The surviving Lens burns brighter!', 'warn');
    },
    onEnd(game, b) {
      for (const m of b.data.enc.mirrors ?? []) if (!m.removed) game.realms.get(b.realm)?.remove(m);
    },
  },
};
