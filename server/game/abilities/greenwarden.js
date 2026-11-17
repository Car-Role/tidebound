// Greenwarden abilities (DESIGN 10.6): Thornlash, Quickgrow, Sproutling, Verdant Tide.

const QUARTER = Math.PI / 2;

export default {
  id: 'greenwarden',
  abilities: {
    // Whip cone 4 tiles: 160%, bleed 60% over 4 s. Mastery: roots 1 s. Signature: also harvests plants and crops in the cone.
    thornlash: {
      cast(c) {
        const { params: p, flags, e, game } = c;
        const len = p.len || 4;
        c.fx('thornlash', e.x, e.y, { a: +c.angle.toFixed(3), len });
        for (const t of c.cone(e.x, e.y, c.angle, QUARTER, len)) {
          c.hit(t, p.dmg, { x: t.x, y: t.y });
          if (t.removed) continue;
          c.status(t, 'bleed', { duration: p.dur || 4, power: (0.6 * c.base * c.eff) / (p.dur || 4) });
          if (flags.has('root_1s')) c.status(t, 'root', { duration: 1 });
        }
        if (flags.has('harvest_cone')) {
          for (const n of c.nodes(e.x + c.dir.x * len / 2, e.y + c.dir.y * len / 2, len / 2 + 0.5)) {
            const cls = game.content.nodes.byId[n.kind]?.cls;
            if (cls !== 'plant') continue;
            let d = Math.atan2(n.y - e.y, n.x - e.x) - c.angle;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            if (Math.abs(d) <= QUARTER / 2 + 0.2) c.gather(n, 3);
          }
          const realm = game.realms.get(e.realm);
          let calls = 0;
          for (let s = 1; s <= len && calls < 12; s++) {
            for (const off of [-1, 0, 1]) {
              const tx = Math.floor(e.x + c.dir.x * s - c.dir.y * off * s * 0.4), ty = Math.floor(e.y + c.dir.y * s + c.dir.x * off * s * 0.4);
              calls++;
              const r = game.call('farmTend', realm, tx, ty, 0.6, null);
              if (r?.did === 'harvest') for (const it of r.items || []) game.call('giveItem', c.player, it.item, it.qty);
            }
          }
        }
      },
    },

    // Crops within 4 (6 at mastery 10) advance one stage (two with Signature); allies heal 15%.
    quickgrow: {
      cast(c) {
        const { params: p, e, game } = c;
        c.fx('quickgrow', e.x, e.y, { r: p.radius });
        game.call('growCrops', game.realms.get(e.realm), e.x, e.y, p.radius, p.stages || 1);
        for (const a of c.allies(e.x, e.y, p.radius)) { c.heal(a, p.heal * c.eff * a.entity.maxHp); c.fx('heal', a.entity.x, a.entity.y); }
      },
    },

    // Sproutling 30 s: 80% damage, taunts, harvests plants (2 at mastery 20). Signature: heals allies 2% max HP/s within 3.
    sproutling: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        const n = p.count || 1;
        const mine = (game.abil?.summons || []).filter((s) => s.player === player && s.kind === 'sproutling' && !s.e.removed);
        while (mine.length + n > Math.max(n, 2)) { const old = mine.shift(); if (!old) break; old.until = 0; }
        const at = c.walkTo(c.aim.x, c.aim.y);
        c.fx('sproutling', at.x, at.y, { n });
        for (let i = 0; i < n; i++) {
          c.summon({ kind: 'sproutling', x: at.x + i * 0.8, y: at.y, dur: p.dur, dmg: p.dmg * c.eff, rate: 1.2, taunt: true, harvests: true,
            heal: flags.has('sprout_heal') ? p.heal || 0.02 : 0, healR: p.radius || 3 });
        }
      },
    },

    // Radius 6 (9 with Signature), 12 s: allies 6% max HP/s, enemies rooted 3 s, crops ripen instantly. Mastery: respawns nodes.
    verdant_tide: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        const realm = game.realms.get(e.realm);
        const rooted = new Set();
        c.fx('verdant_tide', e.x, e.y, { r: p.radius, dur: p.dur });
        game.call('growCrops', realm, e.x, e.y, p.radius, 99);
        if (flags.has('respawn_nodes')) game.call('respawnNodes', realm, e.x, e.y, p.radius);
        c.zone({
          kind: 'verdant_tide', x: e.x, y: e.y, r: p.radius, dur: p.dur, every: 1, instant: true,
          follow: () => (player.entity ? { x: player.entity.x, y: player.entity.y } : null),
          tick: (z, foes, allies) => {
            for (const a of allies) c.heal(a, p.heal * c.eff * a.entity.maxHp);
            for (const f of foes) if (!rooted.has(f.id)) { rooted.add(f.id); c.status(f, 'root', { duration: p.stun || 3 }); c.fx('thornlash', f.x, f.y, { root: 1 }); }
          },
        });
      },
    },
  },
};
