// Bulwark abilities (DESIGN 10.1): Breakwater, Anchor Slam, Rally Horn, Unmoored.
// Cast context `c`: see makeCtx() in server/game/systems/abilities.js.

import { isFoe, dealDamage, asPlayerSafe } from './_util.js';

const FRONT_ARC = (75 * Math.PI) / 180;

export default {
  id: 'bulwark',
  abilities: {
    // 3 s guard: block 80% of hits from the front and reflect 30%. Mastery: blocked hits restore 5 Surge. Signature: 360 degrees.
    breakwater: {
      cast(c) {
        const { params: p, flags, player, e } = c;
        player.guard = { until: c.game.now + p.dur, angle: c.angle, block: p.block, reflect: p.reflect, restore: flags.has('blocked_hits_restore_surge_5'), full: flags.has('guard_360') };
        c.buff(player, 'breakwater', { duration: p.dur, mods: [] });
        c.fx('breakwater', e.x, e.y, { a: +c.angle.toFixed(3), dur: p.dur, full: flags.has('guard_360') ? 1 : 0 });
      },
      init(game) {
        game.procs.hurtHooks.push((player, source, dmg) => {
          const g = player.guard, e = player.entity;
          if (!g || g.until < game.now || !(dmg > 0) || !e) return;
          if (!g.full) {
            const sx = source?.x ?? e.x, sy = source?.y ?? e.y;
            const face = Number.isFinite(player.aimX) ? Math.atan2(player.aimY - e.y, player.aimX - e.x) : g.angle;
            let d = Math.atan2(sy - e.y, sx - e.x) - face;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            if (Math.abs(d) > FRONT_ARC && source) return;
          }
          e.hp = Math.min(e.maxHp, e.hp + dmg * g.block);
          game.fx(e.realm, 'shield_pop', e.x, e.y, { block: 1 });
          if (g.restore) game.call('addSurge', player, 5);
          if (isFoe(source) && g.reflect > 0) dealDamage(game, player, source, dmg * g.reflect, { ability: true });
        });
      },
    },

    // Leap up to 6 tiles; 220% AoE r3, stun 1.5 s. Mastery: slowing crater 4 s. Signature: second slam for 110% after 0.6 s.
    anchor_slam: {
      cast(c) {
        const { params: p, flags, e } = c;
        const to = c.walkTo(c.aim.x, c.aim.y);
        c.fx('gale_step', e.x, e.y, { x2: +to.x.toFixed(2), y2: +to.y.toFixed(2), leap: 1 });
        c.teleport(to.x, to.y);
        const slam = (frac, big) => {
          c.fx('anchor_slam', e.x, e.y, { r: p.radius, big: big ? 1 : 0 });
          for (const t of c.foes(e.x, e.y, p.radius)) {
            c.hit(t, frac, { knock: 1.5, x: e.x, y: e.y });
            if (big) c.status(t, 'stun', { duration: p.stun });
          }
        };
        slam(p.dmg, true);
        if (flags.has('crater')) {
          c.zone({ kind: 'crater', x: e.x, y: e.y, r: p.radius, dur: 4, every: 0.5, instant: true,
            tick: (z, foes) => { for (const f of foes) c.status(f, 'slow', { duration: 0.7, power: p.slow ?? 0.3 }); } });
        }
        if (flags.has('double_slam')) c.later(p.dur ?? 0.6, () => slam(p.dmg / 2, false));
      },
    },

    // Allies within 8: +25% armor and 3% max HP/s for 8 s. Mastery: cleanses debuffs. Signature: +20% damage.
    rally_horn: {
      cast(c) {
        const { params: p, flags, e, game } = c;
        c.fx('rally_horn', e.x, e.y, { r: p.radius });
        for (const a of c.allies(e.x, e.y, p.radius)) {
          const armor = Math.max(10, p.armor * (game.stats.of(a).armor || 0));
          const mods = [{ stat: 'armor', op: 'add', v: Math.round(armor) }];
          if (flags.has('ally_damage_20')) mods.push({ stat: 'power', op: 'add', v: 0.2 });
          c.buff(a, 'rally', { duration: p.dur, mods, hot: p.heal * c.eff * a.entity.maxHp });
          if (flags.has('cleanse')) game.call('clearStatus', a.entity, 'debuffs');
          c.fx('heal', a.entity.x, a.entity.y, { rally: 1 });
        }
      },
    },

    // 10 s (14 at mastery 20): unstoppable, +50% damage, hits heal 4% max HP. Signature: kills extend it 1 s (max +6 s).
    unmoored: {
      cast(c) {
        const { params: p, flags, player, e, game } = c;
        player.unmoored = { until: game.now + p.dur, heal: p.heal, ext: 0, maxExt: flags.has('kill_extend') ? p.max ?? 6 : 0, healAt: 0 };
        c.status(e, 'unstoppable', { duration: p.dur });
        c.buff(player, 'unmoored', { duration: p.dur, mods: [{ stat: 'power', op: 'add', v: p.dmg }] });
        c.fx('unmoored', e.x, e.y, { dur: p.dur });
      },
      init(game) {
        game.bus.on('mob.hit', ({ attacker }) => {
          const p = asPlayerSafe(game, attacker), u = p?.unmoored;
          if (!u || u.until < game.now || u.healAt > game.now) return;
          u.healAt = game.now + 0.15;
          game.call('heal', p.entity, u.heal * p.entity.maxHp, p.entity);
        });
        game.bus.on('mob.killed', ({ killer }) => {
          const p = asPlayerSafe(game, killer), u = p?.unmoored;
          if (!u || u.until < game.now || u.ext >= u.maxExt) return;
          u.ext += 1;
          u.until += 1;
          const left = u.until - game.now;
          game.call('applyStatus', p.entity, 'unstoppable', { duration: left, source: p.entity });
          const b = p.buffs?.get('unmoored');
          if (b) { b.until += 1; b.dur += 1; }
          game.fx(p.entity.realm, 'unmoored', p.entity.x, p.entity.y, { extend: 1 });
        });
      },
    },
  },
};
