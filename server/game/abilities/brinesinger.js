// Brinesinger abilities (DESIGN 10.3): Brine Bolt, Undertow, Tidepool, Kingwave.

import { STATE } from '../../../shared/protocol.js';

export default {
  id: 'brinesinger',
  abilities: {
    // Piercing bolt 200%, range 10. Mastery: splits into 3 on the first hit. Signature: every third bolt is free and deals 300%.
    brine_bolt: {
      cast(c) {
        const { params: p, flags, e } = c;
        const len = p.range || 10;
        c.fx('brine_bolt', e.x, e.y, { a: +c.angle.toFixed(3), len, sig: c.sigBolt ? 1 : 0 });
        const hits = c.line(e.x, e.y, c.dir.x, c.dir.y, len, 0.9);
        hits.forEach((t) => c.hit(t, p.dmg, { x: t.x, y: t.y }));
        const first = hits[0];
        if (first && flags.has('split_3')) {
          for (const da of [-0.5, 0, 0.5]) {
            const a = c.angle + da, dx = Math.cos(a), dy = Math.sin(a);
            c.fx('brine_bolt', first.x, first.y, { a: +a.toFixed(3), len: 5, split: 1 });
            for (const t of c.line(first.x, first.y, dx, dy, 5, 0.7)) if (t !== first) c.hit(t, p.dmg / 2, { x: t.x, y: t.y });
          }
        }
      },
    },

    // Vortex r3 for 4 s: pulls, 60%/s. Mastery: ends with a 200% burst. Signature: the vortex follows the cursor.
    undertow: {
      cast(c) {
        const { params: p, flags, player, game } = c;
        c.fx('undertow', c.aim.x, c.aim.y, { r: p.radius, dur: p.dur });
        c.zone({
          kind: 'undertow', x: c.aim.x, y: c.aim.y, r: p.radius, dur: p.dur, every: p.tick || 1, instant: true,
          tick: (z, foes) => {
            const realm = game.realms.get(z.e.realm);
            for (const f of foes) {
              if (f.type !== 'boss') {
                const dx = z.e.x - f.x, dy = z.e.y - f.y, d = Math.hypot(dx, dy);
                if (d > 0.4) {
                  const k = Math.min(p.pull || 1, d - 0.3) / d;
                  if (realm.isWalkable(Math.floor(f.x + dx * k), Math.floor(f.y + dy * k))) realm.move(f, f.x + dx * k, f.y + dy * k);
                }
              }
              c.hit(f, p.dmg, { x: z.e.x, y: z.e.y });
            }
          },
          follow: flags.has('follow_cursor') ? (z, dt) => {
            if (!Number.isFinite(player.aimX)) return null;
            const dx = player.aimX - z.e.x, dy = player.aimY - z.e.y, d = Math.hypot(dx, dy);
            if (d < 0.1) return null;
            const s = Math.min(d, 3.5 * dt);
            return { x: z.e.x + (dx / d) * s, y: z.e.y + (dy / d) * s };
          } : null,
          onEnd: flags.has('burst_200') ? (z) => {
            c.fx('tide_wave', z.e.x, z.e.y, { r: p.radius, burst: 1 });
            for (const f of c.foes(z.e.x, z.e.y, p.radius)) c.hit(f, 2.0, { knock: 2, x: z.e.x, y: z.e.y });
          } : null,
        });
      },
    },

    // Zone r3, 8 s: allies heal 5% max HP/s, enemies take 40%/s. Mastery: allies +20% swing speed. Signature: revives one downed ally.
    tidepool: {
      cast(c) {
        const { params: p, flags, game } = c;
        let revived = false;
        c.fx('tidepool', c.aim.x, c.aim.y, { r: p.radius, dur: p.dur });
        c.zone({
          kind: 'tidepool', x: c.aim.x, y: c.aim.y, r: p.radius, dur: p.dur, every: p.tick || 1, instant: true,
          tick: (z, foes, allies) => {
            for (const a of allies) {
              c.heal(a, p.heal * c.eff * a.entity.maxHp);
              if (flags.has('ally_swing_20')) c.buff(a, 'tidepool', { duration: 1.3, mods: [{ stat: 'swingSpeed', op: 'add', v: 0.2 }] });
            }
            for (const f of foes) c.hit(f, p.dmg, { x: z.e.x, y: z.e.y });
            if (flags.has('revive_one') && !revived) {
              for (const q of game.players.values()) {
                const qe = q.entity;
                if (!qe || qe.realm !== z.e.realm || qe.state !== STATE.DOWN) continue;
                if (Math.hypot(qe.x - z.e.x, qe.y - z.e.y) > z.r) continue;
                revived = true;
                if (game.services.has('revivePlayer')) game.call('revivePlayer', q, c.player);
                else {
                  qe.state = STATE.IDLE;
                  qe.hp = Math.max(qe.hp, 0.3 * qe.maxHp);
                  game.call('clearStatus', qe, 'downed');
                  game.bus.emit('player.revived', { player: q });
                }
                c.fx('revive', qe.x, qe.y);
                break;
              }
            }
          },
        });
      },
    },

    // Wave 12 x 4: 900%, heavy knockback. Mastery: returns as a second wave for 450%. Signature: soaked ground slows 40% for 6 s.
    kingwave: {
      cast(c) {
        const { params: p, flags, e } = c;
        const sx = e.x, sy = e.y, dx = c.dir.x, dy = c.dir.y, len = p.len || 12, w = p.width || 4;
        c.fx('kingwave', sx, sy, { a: +c.angle.toFixed(3), len, w });
        for (const t of c.line(sx, sy, dx, dy, len, w)) c.hit(t, p.dmg, { knock: 4, x: t.x, y: t.y });
        if (flags.has('return_wave_450')) {
          c.later(1.2, () => {
            const ex = sx + dx * len, ey = sy + dy * len;
            c.fx('kingwave', ex, ey, { a: +(c.angle + Math.PI).toFixed(3), len, w, back: 1 });
            for (const t of c.line(ex, ey, -dx, -dy, len, w)) c.hit(t, 4.5, { knock: 2, x: t.x, y: t.y });
          });
        }
        if (flags.has('soaked')) {
          for (let i = 1; i <= 3; i++) {
            c.zone({ kind: 'soaked', x: sx + dx * (len * i) / 4, y: sy + dy * (len * i) / 4, r: w / 2 + 0.5, dur: p.dur ?? 6, every: 0.5, instant: true,
              tick: (z, foes) => { for (const f of foes) c.status(f, 'slow', { duration: 0.7, power: p.slow ?? 0.4 }); } });
          }
        }
      },
    },
  },
};
