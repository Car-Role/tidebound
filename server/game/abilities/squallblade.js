// Squallblade abilities (DESIGN 10.2): Gale Step, Crosscurrent, Riptide Mark, Tempest.

import { asPlayerSafe, reduceCooldown, nearestFoe, foesNear } from './_util.js';

export default {
  id: 'squallblade',
  abilities: {
    // Dash 5 tiles through enemies for 180%. Mastery: 2 charges. Signature: wind wall that blocks projectiles 2 s.
    gale_step: {
      cast(c) {
        const { params: p, flags, e, game } = c;
        const sx = e.x, sy = e.y;
        const to = c.walkTo(sx + c.dir.x * p.len, sy + c.dir.y * p.len);
        const len = Math.hypot(to.x - sx, to.y - sy);
        c.fx('gale_step', sx, sy, { x2: +to.x.toFixed(2), y2: +to.y.toFixed(2) });
        for (const t of c.line(sx, sy, c.dir.x, c.dir.y, Math.max(0.5, len), 1.4)) c.hit(t, p.dmg, { element: 'storm', x: t.x, y: t.y });
        c.teleport(to.x, to.y);
        c.status(e, 'invuln', { duration: 0.25 });
        if (flags.has('wind_wall')) {
          const mx = (sx + to.x) / 2, my = (sy + to.y) / 2;
          c.zone({ kind: 'wind_wall', x: mx, y: my, r: Math.max(1.5, len / 2), dur: p.dur ?? 2, every: 0.05,
            tick: (z) => {
              const realm = game.realms.get(z.e.realm);
              for (const pr of realm.query(z.e.x, z.e.y, z.r, [], (q) => q.type === 'proj')) {
                const owner = realm.entities.get(pr.pub?.own);
                if (!owner || owner.type !== 'player') { realm.remove(pr); game.fx(realm, 'hit_clink', pr.x, pr.y); }
              }
            } });
        }
      },
    },

    // Spin: 3 hits of 90%, radius 2.2. Mastery: pulls enemies inward. Signature: each enemy hit -0.5 s cooldown.
    crosscurrent: {
      cast(c) {
        const { params: p, flags, e, player, game } = c;
        for (let i = 0; i < (p.hits || 3); i++) {
          c.later(i * 0.2, () => {
            c.fx('crosscurrent', e.x, e.y, { r: p.radius, i });
            for (const t of c.foes(e.x, e.y, p.radius)) {
              c.hit(t, p.dmg, { element: 'storm', x: e.x, y: e.y });
              if (flags.has('pull_inward') && t.type !== 'boss' && !t.removed) {
                const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy);
                if (d > 0.9) {
                  const k = Math.min(0.6, d - 0.8) / d, realm = game.realms.get(t.realm);
                  if (realm.isWalkable(Math.floor(t.x + dx * k), Math.floor(t.y + dy * k))) realm.move(t, t.x + dx * k, t.y + dy * k);
                }
              }
              if (flags.has('cd_per_hit_0.5')) reduceCooldown(game, player, 'crosscurrent', 0.5);
            }
          });
        }
      },
    },

    // Mark a target 6 s: +30% damage taken; if it dies, Gale Step resets. Mastery: mark spreads on death.
    // Signature: the marked target cannot be healed or shielded.
    riptide_mark: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        let t = c.nearestFoe(c.aim.x, c.aim.y, 2.5);
        if (!t || Math.hypot(t.x - e.x, t.y - e.y) > (c.def.range || 8) + 1) t = c.nearestFoe(e.x, e.y, c.def.range || 8);
        if (!t) return { ok: false, err: 'invalid' };
        mark(game, player, t, p.dur, p.mark, flags);
      },
      init(game) {
        game.bus.on('mob.killed', ({ mob }) => {
          const m = mob?.wpMark;
          if (!m || m.until < game.now) return;
          const owner = [...game.players.values()].find((p) => p.id === m.owner);
          if (!owner) return;
          reduceCooldown(game, owner, 'gale_step', Infinity);
          game.fx(mob.realm, 'riptide_mark', mob.x, mob.y, { pop: 1 });
          if (m.spreads) {
            const next = nearestFoe(game, mob.realm, mob.x, mob.y, 5, mob);
            if (next) mark(game, owner, next, m.until - game.now, m.power, m.flags);
          }
        });
      },
    },

    // 12 strikes (18 at mastery 20) of 150% across enemies within 6; invulnerable during. Signature: final strike crits for 400%.
    tempest: {
      cast(c) {
        const { params: p, flags, e, game } = c;
        const n = p.hits || 12, step = 0.2;
        if (!c.foes(e.x, e.y, p.radius).length) return { ok: false, err: 'invalid' };
        c.status(e, 'invuln', { duration: n * step + 0.3 });
        c.fx('tempest', e.x, e.y, { r: p.radius, n });
        for (let i = 0; i < n; i++) {
          c.later(i * step, () => {
            const list = foesNear(game, e.realm, e.x, e.y, p.radius);
            if (!list.length) return;
            const t = list[game.procs.rng.int(0, list.length - 1)];
            c.fx('tempest', t.x, t.y, { strike: 1 });
            const last = i === n - 1 && flags.has('final_crit_400');
            c.hit(t, last ? 4.0 : p.dmg, last ? { crit: true, critMult: 1, element: 'storm' } : { element: 'storm' });
          });
        }
      },
    },
  },
};

function mark(game, player, t, dur, power, flags) {
  game.call('applyStatus', t, 'mark', { duration: dur, power, source: player.entity });
  (t.wpStatus ||= {}).mark = game.now + dur;
  t.wpMark = { owner: player.id, until: game.now + dur, power, spreads: flags.has('mark_spreads'), flags };
  if (flags.has('no_heal_shield')) {
    game.call('clearStatus', t, 'shield');
    t.data.noHealUntil = game.now + dur;
  }
  game.fx(t.realm, 'riptide_mark', t.x, t.y, { dur });
}
