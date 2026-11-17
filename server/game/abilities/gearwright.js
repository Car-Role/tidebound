// Gearwright abilities (DESIGN 10.4): Pocket Turret, Overclock, Magnet Coil, Clockwork Legion.
//
// Overclock on a machine writes structure.data.overclock = { until, mult } (JSON-safe, saved with the structure);
// WP8's machineSpeed should multiply by `mult` while game.now < until (see docs/notes/WP6.md).

const ownSummons = (game, player, kind) => (game.abil?.summons || []).filter((s) => s.player === player && s.kind === kind && !s.e.removed);

export default {
  id: 'gearwright',
  abilities: {
    // Turret 20 s: 3 shots/s of 40% (max 2; 3 at mastery 10). Signature: piercing bolts.
    pocket_turret: {
      cast(c) {
        const { params: p, game, player } = c;
        const mine = ownSummons(game, player, 'turret_pocket');
        while (mine.length >= (p.max || 2)) { const old = mine.shift(); old.until = 0; }
        const at = c.walkTo(c.aim.x, c.aim.y);
        c.fx('pocket_turret', at.x, at.y, { deploy: 1 });
        c.summon({ kind: 'turret_pocket', x: at.x, y: at.y, dur: p.dur, dmg: p.dmg * c.eff, rate: p.speed || 3 });
      },
    },

    // Target machine or ally: +100% speed for 15 s. Mastery: everything within 3 tiles. Signature: refills tend meters within 12.
    overclock: {
      cast(c) {
        const { params: p, flags, game, e, player } = c;
        const realm = game.realms.get(e.realm);
        const isMachine = (s) => s.type === 'structure' && !!game.content.structures.byId[s.kind]?.machine;
        const reach = (c.def.range || 6) + 1;
        const inReach = (q) => Math.hypot(q.x - e.x, q.y - e.y) <= reach;
        let target = null, bd = Infinity;
        for (const s of realm.query(c.aim.x, c.aim.y, 2.5, [], (q) => isMachine(q) && inReach(q))) { const d = Math.hypot(s.x - c.aim.x, s.y - c.aim.y); if (d < bd) { bd = d; target = s; } }
        for (const a of c.allies(c.aim.x, c.aim.y, 2.5)) { const d = Math.hypot(a.entity.x - c.aim.x, a.entity.y - c.aim.y); if (d < bd && inReach(a.entity)) { bd = d; target = a; } }
        if (!target) {
          // Fall back to the nearest machine around the caster, then the caster.
          for (const s of realm.query(e.x, e.y, reach, [], isMachine)) { const d = Math.hypot(s.x - e.x, s.y - e.y); if (d < bd) { bd = d; target = s; } }
          target ||= player;
        }
        const tx = target.entity ? target.entity.x : target.x, ty = target.entity ? target.entity.y : target.y;
        const machines = flags.has('area') ? realm.query(tx, ty, p.radius || 3, [], isMachine) : (target.entity ? [] : [target]);
        const allies = flags.has('area') ? c.allies(tx, ty, p.radius || 3) : (target.entity ? [target] : []);
        for (const m of machines) {
          m.data.overclock = { until: game.now + p.dur, mult: 1 + p.speed };
          m.touch?.('on');
          c.fx('overclock', m.x, m.y, { dur: p.dur });
        }
        for (const a of allies) {
          c.buff(a, 'overclock', { duration: p.dur, mods: [{ stat: 'swingSpeed', op: 'add', v: p.speed }, { stat: 'craftSpeed', op: 'add', v: p.speed }, { stat: 'kilnSpeed', op: 'add', v: p.speed }] });
          c.fx('overclock', a.entity.x, a.entity.y, { dur: p.dur, ally: 1 });
        }
        if (flags.has('refill_tend')) game.call('refillTend', realm, tx, ty, p.range || 12);
      },
    },

    // Pull all drops within 12; enemies within 5 pulled and stunned 1 s. Mastery: also 150% damage. Signature: pulled drops doubled 10% of the time.
    magnet_coil: {
      cast(c) {
        const { params: p, flags, game, e, player } = c;
        const realm = game.realms.get(e.realm);
        c.fx('magnet_coil', e.x, e.y, { r: p.radius });
        for (const d of realm.query(e.x, e.y, p.radius, [], (q) => q.type === 'drop')) {
          if (flags.has('double_drops_10') && game.procs.rng.next() < 0.1) { d.set('q', (d.pub.q || 1) * 2); c.fx('gem_sparkle', d.x, d.y); }
          c.fx('pickup_trail', d.x, d.y, { x2: +e.x.toFixed(2), y2: +e.y.toFixed(2) });
          realm.move(d, e.x + (game.procs.rng.next() - 0.5) * 0.4, e.y + (game.procs.rng.next() - 0.5) * 0.4);
          if (d.data) d.data.owner = player.id;
        }
        for (const t of c.foes(e.x, e.y, p.range || 5)) {
          if (t.type !== 'boss') {
            const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
            const nx = e.x + (dx / d) * 1.5, ny = e.y + (dy / d) * 1.5;
            if (realm.isWalkable(Math.floor(nx), Math.floor(ny))) realm.move(t, nx, ny);
          }
          c.status(t, 'stun', { duration: p.stun || 1 });
          if (p.dmg) c.hit(t, p.dmg, { element: 'storm', x: e.x, y: e.y });
        }
      },
    },

    // 4 battle Scuttlers (6 at mastery 20) for 25 s: 60% damage, 2 hits/s, taunt. Signature: they explode for 200% on expiry.
    clockwork_legion: {
      cast(c) {
        const { params: p, flags, e } = c;
        const n = p.count || 4;
        c.fx('clockwork_legion', e.x, e.y, { n });
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          c.summon({ kind: 'battle_scuttler', x: e.x + Math.cos(a) * 1.2, y: e.y + Math.sin(a) * 1.2, dur: p.dur, dmg: p.dmg * c.eff, rate: p.speed || 2, taunt: true, explode: flags.has('explode_200') ? 2.0 : 0 });
        }
      },
    },
  },
};
