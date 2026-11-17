// Prospector abilities (DESIGN 10.5): Seismic Strike, Vein Sense, Blast Charge, Motherlode.

import { spawnNodeDrops } from './_util.js';
import { TIER_MATS } from '../../../shared/data/items.js';

// Drops that appeared since `idBefore` near (x, y) fly to the player (Seismic Strike signature).
function pullNewDrops(game, player, realmId, x, y, r, idBefore) {
  const realm = game.realms.get(realmId), e = player.entity;
  for (const d of realm.query(x, y, r + 1.5, [], (q) => q.type === 'drop' && q.id > idBefore)) {
    game.fx(realmId, 'pickup_trail', d.x, d.y, { x2: +e.x.toFixed(2), y2: +e.y.toFixed(2) });
    realm.move(d, e.x, e.y);
  }
}

export default {
  id: 'prospector',
  abilities: {
    // Every node within 3 (4 at mastery 10) takes 300% gather damage; enemies 150%. Signature: drops fly straight to you.
    seismic_strike: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        const before = game.nextEntityId;
        c.fx('seismic', e.x, e.y, { r: p.radius });
        for (const n of c.nodes(e.x, e.y, p.radius)) c.gather(n, p.gather);
        for (const t of c.foes(e.x, e.y, p.radius)) c.hit(t, p.dmg, { knock: 1, x: e.x, y: e.y });
        if (flags.has('drops_to_player')) pullNewDrops(game, player, e.realm, e.x, e.y, p.radius, before);
      },
    },

    // 20 s (30 with Signature): rare nodes highlighted within 20 tiles; rare drop chance x2. Mastery: spawns 1 gem node.
    vein_sense: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        player.veinSense = { until: game.now + p.dur, mult: p.yieldMult || 2, r: p.radius || 20, pulse: 0 };
        c.buff(player, 'vein_sense', { duration: p.dur, mods: [] });
        c.fx('vein_sense', e.x, e.y, { r: p.radius, dur: p.dur });
        if (flags.has('spawn_gem')) {
          const realm = game.realms.get(e.realm);
          for (let i = 0; i < 20; i++) {
            const tx = Math.floor(e.x + game.procs.rng.int(-3, 3)), ty = Math.floor(e.y + game.procs.rng.int(-3, 3));
            if (Math.abs(tx + 0.5 - e.x) < 1 && Math.abs(ty + 0.5 - e.y) < 1) continue;
            const n = game.call('spawnNode', realm, 'gem_node', tx, ty);
            if (n) { c.fx('gem_sparkle', n.x, n.y, { spawn: 1 }); break; }
          }
        }
      },
      init(game) {
        // Rare drop chance x2: rare entries of the node's table get a second roll.
        game.bus.on('node.broken', ({ player, kind, tier, x, y, node, byMachine }) => {
          const v = player?.veinSense;
          if (!v || v.until < game.now || byMachine) return;
          const def = game.content.nodes.byId[kind];
          const t = Number(tier) || node?.data?.tier || 1;
          for (const d of def?.drops || []) {
            if (d.p == null || d.p >= 1) continue;
            for (let k = 1; k < v.mult; k++) if (game.procs.luckRoll(player, d.p)) game.call('dropItem', node?.realm ?? player.entity.realm, x, y, d.item, d.min || 1, {});
          }
          if (def?.cls === 'gem' && TIER_MATS[t]) game.call('dropItem', node?.realm ?? player.entity.realm, x, y, TIER_MATS[t].rare, 1, {});
        });
        // Highlight pulse every 2 s.
        const pulse = () => {
          for (const p of game.players.values()) {
            const v = p.veinSense;
            if (!v || v.until < game.now || !p.entity) continue;
            const realm = game.realms.get(p.entity.realm);
            for (const n of realm.query(p.entity.x, p.entity.y, v.r, [], (q) => q.type === 'node' && (q.pub?.big || game.content.nodes.byId[q.kind]?.cls === 'gem'))) {
              game.fx(realm, 'gem_sparkle', n.x, n.y, { hl: 1 });
            }
          }
        };
        game.veinPulse = pulse;
      },
    },

    // Thrown charge: 400% gather and weapon damage, r2.5. Mastery: leaves 3 mini-charges. Signature: 2 charges stored.
    blast_charge: {
      cast(c) {
        const { params: p, flags, e, game } = c;
        const at = { x: c.aim.x, y: c.aim.y };
        c.fx('blast_charge', e.x, e.y, { x2: +at.x.toFixed(2), y2: +at.y.toFixed(2), fuse: 0.6 });
        const boom = (x, y, r, frac) => {
          c.fx('burn_explode', x, y, { r, blast: 1 });
          for (const n of c.nodes(x, y, r)) c.gather(n, frac);
          for (const t of c.foes(x, y, r)) c.hit(t, frac, { knock: 1.5, element: 'ember', x, y });
        };
        c.later(0.6, () => {
          boom(at.x, at.y, p.radius, p.gather);
          if (flags.has('mini_charges')) {
            for (let i = 0; i < (p.count || 3); i++) {
              const a = game.procs.rng.float(0, Math.PI * 2), d = game.procs.rng.float(1, 2.2);
              const mx = at.x + Math.cos(a) * d, my = at.y + Math.sin(a) * d;
              c.fx('blast_charge', at.x, at.y, { x2: +mx.toFixed(2), y2: +my.toFixed(2), mini: 1 });
              c.later(0.4 + i * 0.1, () => boom(mx, my, 1.5, 1.0));
            }
          }
        });
      },
    },

    // 15 s (20 at mastery 20, triple drops): node breaks give double drops and double XP. Signature: allies within 8 share it.
    motherlode: {
      cast(c) {
        const { params: p, flags, e, game, player } = c;
        const targets = flags.has('share_allies') ? c.allies(e.x, e.y, p.radius || 8) : [player];
        if (!targets.includes(player)) targets.push(player);
        for (const a of targets) {
          a.motherlode = { until: game.now + p.dur, yieldMult: p.yieldMult || 2, xpMult: p.xpMult || 2, from: player.id };
          c.buff(a, 'motherlode', { duration: p.dur, mods: [] });
          c.fx('motherlode', a.entity.x, a.entity.y, { dur: p.dur });
        }
      },
      init(game) {
        game.bus.on('node.broken', ({ player, kind, tier, x, y, node, byMachine }) => {
          const m = player?.motherlode;
          if (!m || m.until < game.now || byMachine) return;
          const t = Number(tier) || node?.data?.tier || 1;
          const realm = node?.realm ?? player.entity.realm;
          spawnNodeDrops(game, player, kind, t, x, y, realm, Math.max(0, Math.round(m.yieldMult) - 1));
          const def = game.content.nodes.byId[kind];
          const xp = (def?.xp || 0) + (def?.xpPerTier || 0) * t;
          if (xp > 0) game.call('grantXp', player, xp * (m.xpMult - 1), 'gather');
          game.fx(realm, 'glint_burst', x, y, { motherlode: 1 });
        });
      },
    },
  },
};
