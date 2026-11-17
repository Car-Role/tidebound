// Player: layered body (pl.body + WP3 parts), shadow, name tag, HP bar; footstep dust on land.
//
// Layers (all share pl.body's anim names, so one opts object draws them in step):
//   pl.body (shirt colour variant = player colour + 1: variant 0 is the undyed base sprite)
//   pl.outfit.<class>      class outfit (e.cl)
//   pl.weapon.<type>.<t>   weapon on the back (e.g[1] = equipped weapon item id)
//   pl.hat.<cosmetic>      cosmetic hat (e.hat, when the server publishes one)
//   pl.hook.<id>           gathering hook in hand (e.g[0])
// Anims: idle_/run_ by movement, swing_ (3 frames) while attacking or gathering, roll_ (4 frames) while dodging.
// The local player's swing and roll start on the client (main.js sets e._swingAt / e._dodgeT) so they feel instant;
// other players follow their public `a` key and the `at` swing counter.

import { drawText } from '../text.js';
import { playerColor, PAL, RAMPS } from '../../art/palette.js';
import { T, isWater } from '../../../shared/grid.js';

function dirOf(f) {
  if (f === 2) return ['down', false];
  if (f === 6) return ['up', false];
  return ['side', f >= 3 && f <= 5];
}

const STEP_INTERVAL = 0.25;
const SWING_S = 0.24, ROLL_S = 0.35;

// sprite id of an equipped weapon: 'pl.weapon.<blade|bow|staff>.<tier>'
const weaponIds = new Map();
function weaponSprite(id, view) {
  if (!id) return null;
  if (weaponIds.has(id)) return weaponIds.get(id);
  const def = view.content.items.byId?.[id];
  const g = def?.gear;
  let sid = null;
  const m = /^(blade|bow|staff)_(\d)/.exec(id);
  const type = g?.wtype ?? m?.[1], tier = Math.max(1, Math.min(7, g?.tier ?? def?.tier ?? (Number(m?.[2]) || 1)));
  if (type) sid = `pl.weapon.${type}.${tier}`;
  if (sid && !view.sprites.has(sid)) sid = null;
  weaponIds.set(id, sid);
  return sid;
}

export const playerVariant = (c) => ((c ?? 0) & 7) + 1;

export default {
  kinds: [],
  types: ['player'],
  update(e, dt, view) {
    // other players: a new swing shows up as a change of the `at` counter (or `a` turning to swing)
    if (!e.isSelf && (e.at !== e._lastAt || (e.a === 'swing' && e._lastA !== 'swing'))) {
      if (e._lastAt !== undefined || e.a === 'swing') e._swingAt = view.now;
      e._lastAt = e.at;
    }
    if (!e.isSelf && e.a === 'roll' && e._lastA !== 'roll') e._rollAt = view.now;
    e._lastA = e.a;

    const lx = e._lx ?? e.rx, ly = e._ly ?? e.ry;
    const speed = dt > 0 ? Math.hypot(e.rx - lx, e.ry - ly) / dt : 0;
    e._lx = e.rx; e._ly = e.ry;
    e._moving = speed > 1;
    if (!e._moving) { e._dust = 0; return; }
    e._dust = (e._dust ?? 0) - dt;
    if (e._dust > 0) return;
    e._dust = STEP_INTERVAL;
    const g = view.store.groundAt(Math.floor(e.rx), Math.floor(e.ry));
    if (g !== T.EMPTY && !isWater(g)) view.particles.emit('footstep_dust', e.rx, e.ry + 0.05);
  },
  draw(ctx, e, time, view) {
    const sx = Math.round(e.rx * 16 - view.x), sy = Math.round(e.ry * 16 - view.y);
    const down = e.s === 4 || e.a === 'down';
    const facing = e.isSelf && e._face != null ? e._face : e.f;
    const swingAge = (view.now - (e._swingAt ?? -1e9)) / 1000;
    const swinging = !down && swingAge >= 0 && swingAge < SWING_S;
    const [dir, flip] = dirOf(swinging && e._swingF != null && e.isSelf ? e._swingF : facing);
    const moving = e.isSelf ? e._moving : e.a === 'run' || e._moving;
    const rolling = !down && (e.isSelf ? (e._dodgeT ?? 0) > 0 : e.a === 'roll');
    let anim = (moving ? 'run_' : 'idle_') + dir, frame;
    if (down) { anim = 'roll_side'; frame = 1; }
    else if (rolling) {
      anim = 'roll_' + dir;
      const k = e.isSelf ? 1 - (e._dodgeT ?? 0) / ROLL_S : ((view.now - (e._rollAt ?? view.now)) / 1000) / ROLL_S;
      frame = Math.max(0, Math.min(3, Math.floor(k * 4)));
    } else if (swinging) {
      anim = 'swing_' + dir;
      frame = Math.min(2, Math.floor((swingAge / SWING_S) * 3));
    }
    const sq = view.juice.squashOf(e.i);
    const flash = e.flashUntil > view.now;
    const opts = {
      anim, frame, time, flip, variant: playerVariant(e.c), flash,
      scaleX: sq.sx, scaleY: sq.sy, alpha: down ? 0.8 : rolling ? 0.9 : 1,
    };
    view.sprites.drawShadow(ctx, sx, sy, down ? 14 : 10);
    // a lunge toward the swing direction sells the hit
    const lunge = swinging ? Math.round(Math.sin((swingAge / SWING_S) * Math.PI) * 2) : 0;
    const lx = dir === 'side' ? (flip ? -lunge : lunge) : 0, ly = dir === 'down' ? lunge : dir === 'up' ? -lunge : 0;
    const bx = sx + lx, by = sy + ly + (down ? 2 : 0);
    view.sprites.draw(ctx, 'pl.body', bx, by, opts);
    e._drawn = { x: bx, y: by, opts, color: playerColor(e.c) };
    const partOpts = { ...opts, variant: 0 };
    const wid = weaponSprite(e.g?.[1], view);
    const parts = [
      e.cl ? 'pl.outfit.' + e.cl : null,
      wid,
      e.hat ? 'pl.hat.' + e.hat : null,
      e.g?.[0] ? 'pl.hook.' + e.g[0] : null,
    ];
    for (const id of parts) if (id && view.sprites.has(id)) view.sprites.draw(ctx, id, bx, by, partOpts);

    if (!e.isSelf && e.n) drawText(ctx, e.n, sx, sy - 31, { color: playerColor(e.c), align: 'center' });
    if (down && !e.isSelf) {
      // downed ally: pulsing ring and a prompt
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ctx.globalAlpha = 0.4 + 0.4 * pulse;
      ctx.strokeStyle = PAL[RAMPS.ember[3]];
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx + 0.5, sy + 0.5, 11 + pulse * 2, 5 + pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      drawText(ctx, 'Hold RMB: revive', sx, sy - 40, { color: PAL[RAMPS.ember[4]], align: 'center' });
    }
    if (e.mh > 0 && e.hp < e.mh) {
      ctx.fillStyle = PAL[RAMPS.ink[0]];
      ctx.fillRect(sx - 8, sy - 23, 16, 3);
      ctx.fillStyle = PAL[RAMPS.ember[3]];
      ctx.fillRect(sx - 7, sy - 22, Math.round((14 * Math.max(0, e.hp)) / e.mh), 1);
    }
  },
};
