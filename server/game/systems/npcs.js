// WP11: castaways (DESIGN 16.2): one NPC per `castaway` plot, dialogue trees, quest markers.
// Shop stock and transactions are WP9 (`shopStock` / `shop.buy`); the dialog's "Trade" option only asks the
// client to open the `market` panel with { npc }.
//
// Entities: type 'npc', kind = npc id, public key `q` (0 none, 1 quest available, 2 ready to turn in; the max over
// connected players - each client also gets its own markers in self.quests.markers). NPCs are not saved: they are
// re-spawned on load, on `land.raised` and on `rebirth` for every owned castaway plot.
//
// Interaction: `use` on an NPC sends self.ui = { panel:'dialog', npc, id, node }. `npc.talk {id, choice}` returns the
// next node in `res.d`. Node = { npc, id, name, role, node, text, options:[{id,label}], quest?, open? }.

import { REACH, PLOT } from '../../../shared/config.js';
import { plotIndex } from '../../../shared/grid.js';
import { createEntity } from '../entities.js';
import { pq, sideStatus, acceptQuest, turnInQuest, questProgress, rewardText, sendQuests, markDirty } from './quests.js';

const ST = new WeakMap();
const st = (game) => ST.get(game);
const TALK_REACH = REACH + 2;
const WANDER_R = 2.5;
const WALK_SPEED = 1.1;

// ------------------------------------------------------------------ dialogue (original text)

export const DIALOG = {
  npc_ferrin: {
    intro: 'Ferrin. I walk ropes between whatever is still above water. You look like someone who finishes things.',
    lore: [
      'The Tidestone was here before the first plank. It hums when the sea turns. I just listen.',
      'Every plot you raise pushes the water back a little. The sea notices. Keep a lamp lit.',
      'Rope is the oldest machine. Two knots and a pull, and the world gets lighter.',
    ],
    quests: {
      s_ferrin_1: { offer: 'My lines are fraying faster than I can splice them. Twenty coils of rope would keep the camp tied together.', progress: 'Twenty coils. The Loom will twist reeds into rope if you feed it.', thanks: 'Ah, good tight lay. That will hold through a king tide.' },
      s_ferrin_2: { offer: 'I am building a proper trading post. Ten planks and ten bricks and it stops leaning.', progress: 'Planks from the Workbench, bricks from the Kiln. Ten of each.', thanks: 'Look at that. A wall that does not apologise.' },
      s_ferrin_3: { offer: 'Supper has been seaweed for a week. Catch me five fish, any kind, and I will owe you more than rope.', progress: 'Five fish. Cast where the water ripples.', thanks: 'Fish! Real fish! Here, take this pack. You carry more than I do anyway.' },
    },
    lineDone: 'You have done more for this camp than the tide ever did. Come trade whenever you like.',
  },
  npc_odalys: {
    intro: 'Odalys. People here call me Saltmother because I feed them and scold them in equal measure. Sit.',
    lore: [
      'Salt keeps fish, keeps meat, keeps grudges. Use it on the first two.',
      'A full stomach swings a heavier hook. That is not superstition, that is soup.',
      'The fen gives mudroot to anyone patient enough to dig it out.',
    ],
    quests: {
      s_odalys_1: { offer: 'Bring me three cooked dishes. Any kind. I want to taste what this island has taught you.', progress: 'Three dishes. A Cookpot and something to put in it.', thanks: 'Hm. Underseasoned. Edible. Promising.' },
      s_odalys_2: { offer: 'My stores are low. Ten salt and five mudroot and I can feed the whole shore through the next storm.', progress: 'Salt from the flats, mudroot from wet soil. Ten and five.', thanks: 'Now we can eat like people instead of gulls.' },
      s_odalys_3: { offer: 'There is a pearl gar in these waters, silver as a coin. Bring me one and I will teach you my stew.', progress: 'The pearl gar bites when the light is low. Patience.', thanks: 'Beautiful. Here is the fen stew, and three fortune tonics for the road. Eat well.' },
    },
    lineDone: 'You may eat at my fire any night you like. That is not a small thing.',
  },
  npc_brannick: {
    intro: 'Brannick. Half an anchor, half a smith, all temper. What do you want hammered?',
    lore: [
      'Bog iron is ugly iron. Ugly iron holds.',
      'Temper too far and the metal remembers it was ore. Know when to stop.',
      'Clatterclaws pinch harder than they look. Their shells make good rivets though.',
    ],
    quests: {
      s_brannick_1: { offer: 'My forge is cold for lack of stock. Twenty iron bars and I will show you what heat can do.', progress: 'Twenty iron bars. Bog iron ore, a Kiln, patience.', thanks: 'Heavy. Good. That is proper iron.' },
      s_brannick_2: { offer: 'The clatterclaws keep stealing my tongs. Thin them out. Fifteen should send a message.', progress: 'Fifteen clatterclaws. They hide in the reeds at low tide.', thanks: 'Quiet at last. My tongs thank you.' },
      s_brannick_3: { offer: 'Show me you can make something worth tempering. A tier-three hook or weapon, your own work.', progress: 'Tier three. Cinderite at least. Do not bring me copper.', thanks: 'That will cut. Take this pack, and I will knock a tenth off your tempering bills.' },
    },
    lineDone: 'Bring me your gear when it needs a harder edge. Friend price.',
  },
  npc_sootwren: {
    intro: 'Sootwren! Engineer. Everything wants to move, you only have to give it a slope. Have you seen a Sluice run? Beautiful.',
    lore: [
      'Count the gears. Then count them again. Then let a Scuttler count them for you.',
      'Flux is just water that learned to pull. Do not let it pool.',
      'A machine with nobody near it slows down. They get lonely. I do too.',
    ],
    quests: {
      s_sootwren_1: { offer: 'Lay twenty Sluice tiles for me. Anywhere. I want to hear things flowing again.', progress: 'Twenty Sluice tiles. Chain them, curve them, make it sing.', thanks: 'Listen to that rattle. Music.' },
      s_sootwren_2: { offer: 'Ten flux coils. My generators keep eating the old ones.', progress: 'Ten flux coils. Copper wire around a cinderite core.', thanks: 'Warm still. Lovely.' },
      s_sootwren_3: { offer: 'Get your Flux supply to twenty. Real supply, steady, not a spark.', progress: 'Twenty Flux supply. Generators, plenty of them.', thanks: 'Twenty! Here, a whole Autobench. Let it craft while you sleep.' },
    },
    lineDone: 'You understand flow now. Go build something that never stops.',
  },
  npc_ashka: {
    intro: 'Ashka. Breathe through the cloth; the vents are generous today. What brings you to the fire?',
    lore: [
      'Brimstone remembers being fire. Treat it kindly and it will be fire again.',
      'A tonic is a promise your body makes to itself. Do not make too many at once.',
      'The elites here burn hotter. Their ash is worth more, too.',
    ],
    quests: {
      s_ashka_1: { offer: 'Ten brimstone, yellow and stinking. My still is starving.', progress: 'Ten brimstone. It crusts around the vents.', thanks: 'It smells like a good day.' },
      s_ashka_2: { offer: 'Brew five tonics yourself. Any kind. I need to know your hands are steady.', progress: 'Five tonics at the Still. Do not rush the boil.', thanks: 'Steady hands. Good.' },
      s_ashka_3: { offer: 'Three elites prowl Emberreach. Put them down; they are poisoning the vents.', progress: 'Three elites in Emberreach. Look for the gold outline.', thanks: 'The vents already breathe easier. Take my curry and this flask; it keeps tonics burning longer.' },
    },
    lineDone: 'The fire knows your name now. That is mostly a compliment.',
  },
  npc_lumen: {
    intro: 'We are Lumen. Some of us are glad you came. Which of us are you speaking to?',
    lore: [
      'Sand is only glass that has not decided yet.',
      'In the prism trees we saw a hundred of you. Most of them were kind.',
      'Light bends. So do people. Neither breaks if you are gentle.',
    ],
    quests: {
      s_lumen_1: { offer: 'Thirty panes of glass, please. We are rebuilding our faces.', progress: 'Thirty glass. Sand and heat, nothing more.', thanks: 'We can see ourselves again. All of us.' },
      s_lumen_2: { offer: 'Six lenses. We want to look further than the shore.', progress: 'Six lenses, ground true.', thanks: 'Oh. The horizon is so much closer now.' },
      s_lumen_3: { offer: 'Find three relics. Old things, buried things. We collect what others forgot.', progress: 'Three relics. Dig spots and Vault treasure rooms hide them.', thanks: 'Each one holds a voice. Take this pack and this lantern; you will need more light where you go.' },
    },
    lineDone: 'We will remember you. Every one of us.',
  },
  npc_quill: {
    intro: 'Quill, surveyor. Hold still, you are standing on an unmapped bit.',
    lore: [
      'Every shore is a line someone forgot to finish.',
      'The sea floor has roads on it. Old ones. I am not saying who built them.',
      'A Waystone is a promise that you will come back. Keep your promises.',
    ],
    quests: {
      s_quill_1: { offer: 'Raise five more plots. I cannot map what is under the water.', progress: 'Five plots. The Treasury and some Ballast will do it.', thanks: 'New coastline. Wonderful. Hold this end of the tape.' },
      s_quill_2: { offer: 'Build three Waystones. Surveying is mostly walking, and I am tired.', progress: 'Three Waystones, anywhere sensible.', thanks: 'Click, and I am across the island. Marvellous.' },
      s_quill_3: { offer: 'The shrines hide puzzles older than the tide. Solve three; I need their glyphs.', progress: 'Three shrines solved. Watch the patterns before you touch anything.', thanks: 'The glyphs line up with my charts. Land will come cheaper now; I know where it wants to rise.' },
    },
    lineDone: 'The map is yours as much as mine now.',
  },
  npc_halvard: {
    intro: 'Halvard. Quiet. The wolves count footsteps.',
    lore: [
      'Cold is honest. It tells you exactly how long you have.',
      'A frostbulk elite once followed me for three days. I let it win the first two.',
      'Keep your fire small and your knife sharp.',
    ],
    quests: {
      s_halvard_1: { offer: 'Twenty frost pelts. Winter does not care how brave you are.', progress: 'Twenty pelts. The beasts here grow them thick.', thanks: 'Warm. Good.' },
      s_halvard_2: { offer: 'An elite frostbulk walks the ridge. Bring it down.', progress: 'The frostbulk with the gold outline. Do not fight it on the ice.', thanks: 'Clean kill. The ridge is safer.' },
      s_halvard_3: { offer: 'Temper something to plus three. A dull edge in the cold is a death sentence.', progress: 'Plus three. Any piece of gear.', thanks: 'Sharp. Take this pack and the frost bead; it bites the way the cold does.' },
    },
    lineDone: 'You walk like a hunter now. Mostly.',
  },
  npc_ysolde: {
    intro: 'Ysolde. A light for the dark, a line for the deep. Welcome to the cold shore.',
    lore: [
      'Fish rise to lanterns. So do worse things.',
      'The aurora trout only bites when the sky is singing.',
      'Every lamp I light is a promise to someone still out at sea.',
    ],
    quests: {
      s_ysolde_1: { offer: 'Help me light the north. Ten Tide Lamps on Hoarfrost plots.', progress: 'Ten lamps on Hoarfrost ground. The night is long here.', thanks: 'Look how far the shore reaches now.' },
      s_ysolde_2: { offer: 'Catch me an aurora trout. I have only ever seen one.', progress: 'Fish under the aurora. Night, and a steady hand.', thanks: 'It glows. Oh, it glows.' },
      s_ysolde_3: { offer: 'Ten cryo cells. My lamps need cold hearts to burn bright.', progress: 'Ten cryo cells.', thanks: 'Every Tide Lamp will shine further now, and your rod will find rarer fish.' },
    },
    lineDone: 'Whenever you see a lamp in the north, I lit it for you.',
  },
  npc_nix: {
    intro: 'I have met you before. You were drier. Or wetter. The Turnings blur.',
    lore: [
      'The Archive forgets nothing. That is its curse.',
      'When the Moon drowned, the sea forgot where it ended. You are reminding it.',
      'Every Turning, the tide rises a little higher. Every Turning, you rise to meet it.',
    ],
    quests: {
      s_nix_1: { offer: 'Sixty donations in the Archive. The world must remember itself before it can heal.', progress: 'Sixty items in the Archive, by anyone.', thanks: 'The halls hum again.' },
      s_nix_2: { offer: 'A legendary fish. The old ones swim in every biome. Bring me proof one still lives.', progress: 'A legendary catch. Any of the six.', thanks: 'Still alive. Then so is the sea.' },
      s_nix_3: { offer: 'Five relic fragments. They are pieces of the last world.', progress: 'Five relic fragments.', thanks: 'Take this pack. And when the next Turning comes, I will remember three shards more for you.' },
    },
    lineDone: 'I will remember this conversation. Even if you do not.',
  },
  npc_morrow: {
    intro: 'Morrow. I dive. Down is the only direction that never ends.',
    lore: [
      'The Trench breathes. Time your dives to it.',
      'At floor ten the water stops being water. It starts being memory.',
      'Bring a lantern. Bring two.',
    ],
    quests: {
      s_morrow_1: { offer: 'Reach floor five of the Trench. Then we will talk.', progress: 'Floor five. Lantern lit, breath held.', thanks: 'You came back. Most do not, the first time.' },
      s_morrow_2: { offer: 'Ten gloom hearts. The deep things grow them.', progress: 'Ten gloom hearts from the Umbral dark.', thanks: 'Still beating. Unsettling. Useful.' },
      s_morrow_3: { offer: 'Floor ten. Do that and I will show you the shortcut down.', progress: 'Floor ten of the Trench.', thanks: 'Take my deep lantern. From now on your crew can start dives at floor ten.' },
    },
    lineDone: 'The deep remembers you now. That is good. Mostly.',
  },
};

// ------------------------------------------------------------------ placement

function castawayAssignments(game) {
  const byBiome = new Map();
  game.world.plots.forEach((p, i) => {
    if (p.feature !== 'castaway') return;
    if (!byBiome.has(p.biome)) byBiome.set(p.biome, []);
    byBiome.get(p.biome).push({ plot: p, i });
  });
  const out = [];
  for (const [biome, plots] of byBiome) {
    plots.sort((a, b) => a.i - b.i);
    const npcs = game.content.npcs.filter((n) => n.biome === biome);
    plots.forEach((pl, j) => { if (npcs[j]) out.push({ npc: npcs[j], plot: pl.plot }); });
  }
  return out;
}

function findSpot(realm, cx, cy) {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.floor(cx + dx), ty = Math.floor(cy + dy);
        if (realm.isWalkable(tx, ty) && !realm.entityAtTile(tx, ty)) return { x: tx + 0.5, y: ty + 0.5 };
      }
    }
  }
  return null;
}

export function spawnCastaways(game) {
  const s = st(game);
  const realm = game.realms.get('overworld');
  if (!realm) return 0;
  let n = 0;
  for (const { npc, plot } of castawayAssignments(game)) {
    if (!plot.owned) continue;
    const cur = s.ents.get(npc.id);
    if (cur && !cur.removed && cur.realm === 'overworld' && realm.entities.get(cur.id) === cur) continue;
    // another package may already have placed this castaway
    let existing = null;
    for (const e of realm.entities.values()) if (e.type === 'npc' && e.kind === npc.id) { existing = e; break; }
    if (existing) { s.ents.set(npc.id, existing); existing.data.home ||= { x: existing.x, y: existing.y }; continue; }
    // stand a little off the plot centre so a feature stamp in the middle stays reachable
    const spot = findSpot(realm, plot.px * PLOT + PLOT / 2 + 2, plot.py * PLOT + PLOT / 2 + 1);
    if (!spot) continue;
    const e = createEntity(game, {
      type: 'npc', kind: npc.id, x: spot.x, y: spot.y, hp: 1, radius: 0.4, facing: 2,
      data: { npc: npc.id, home: { x: spot.x, y: spot.y }, plot: plotIndex(plot.px, plot.py), target: null, waitT: 2, talkUntil: 0 },
      pub: { q: 0 },
    });
    realm.add(e);
    s.ents.set(npc.id, e);
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ dialogue nodes

function questView(game, player, qid) {
  const q = game.content.quests.byId[qid];
  const inst = pq(player).active[qid];
  if (!q) return null;
  const prog = inst ? questProgress(game, q, inst, player) : { goals: q.goals.map((g, i) => ({ label: null, have: 0, n: g.n })), ready: false };
  if (!inst) {
    const tmp = { prog: q.goals.map(() => 0), base: q.goals.map(() => 0) };
    prog.goals = questProgress(game, q, tmp, player).goals.map((g) => ({ ...g, have: 0 }));
  }
  return { id: qid, name: q.name, step: q.step, goals: prog.goals.map(({ label, have, n }) => ({ label, have, n })), reward: rewardText(game, q.rewards), ready: prog.ready, active: !!inst };
}

export function dialogNode(game, player, e, choice = 'root', extraText = null) {
  const npc = game.content.npcs.byId[e.kind];
  const text = DIALOG[e.kind] ?? { intro: npc?.lines?.greet?.[0] ?? '...', lore: npc?.lines?.idle ?? ['...'], quests: {}, lineDone: '...' };
  const d = pq(player);
  d.met ||= [];
  const ss = sideStatus(game, player, e.kind);
  const base = { npc: e.kind, id: e.id, name: npc?.name ?? e.kind, role: npc?.role ?? '', node: choice };
  const opts = () => {
    const o = [];
    if (ss?.activeId && ss.ready) o.push({ id: 'turnin', label: 'I have what you asked for.' });
    else if (ss?.activeId) o.push({ id: 'work', label: 'About that task...' });
    else if (ss?.nextId) o.push({ id: 'work', label: 'Need a hand with anything?' });
    if (npc?.shop?.length) o.push({ id: 'trade', label: 'Let us trade.' });
    o.push({ id: 'chat', label: 'Tell me about this place.' });
    o.push({ id: 'bye', label: 'Goodbye.' });
    return o;
  };
  switch (choice) {
    case 'root': {
      let t;
      if (!d.met.includes(e.kind)) { d.met.push(e.kind); t = text.intro; }
      else if (ss?.lineDone) t = text.lineDone;
      else t = npc?.lines?.greet?.[game.rng.int(0, Math.max(0, (npc.lines.greet.length || 1) - 1))] ?? text.intro;
      return { ...base, text: extraText ?? t, options: opts() };
    }
    case 'work': {
      if (ss?.activeId) {
        const qv = questView(game, player, ss.activeId);
        const qt = text.quests[ss.activeId];
        return { ...base, text: qv.ready ? 'You have it? Let me see.' : (qt?.progress ?? 'Still waiting.'), quest: qv,
          options: [...(qv.ready ? [{ id: 'turnin', label: 'Hand it over.' }] : []), { id: 'root', label: 'Back.' }, { id: 'bye', label: 'Goodbye.' }] };
      }
      if (ss?.nextId) {
        const qv = questView(game, player, ss.nextId);
        return { ...base, text: text.quests[ss.nextId]?.offer ?? 'I could use some help.', quest: qv,
          options: [{ id: 'accept', label: 'I will do it.' }, { id: 'root', label: 'Not right now.' }] };
      }
      return { ...base, text: text.lineDone, options: opts() };
    }
    case 'chat': {
      const lore = [...(text.lore || []), ...(npc?.lines?.idle || [])];
      d.loreIx ||= {};
      const i = (d.loreIx[e.kind] = ((d.loreIx[e.kind] ?? -1) + 1) % Math.max(1, lore.length));
      return { ...base, text: lore[i] ?? '...', options: opts() };
    }
    case 'trade':
      return { ...base, text: 'Have a look.', options: opts(), open: { panel: 'market', npc: e.kind } };
    case 'bye':
      return { ...base, text: '', options: [], close: true };
    default:
      return { ...base, text: extraText ?? text.intro, options: opts() };
  }
}

function talk(game, player, d) {
  const id = d?.id;
  const choice = typeof d?.choice === 'string' ? d.choice : 'root';
  if (!Number.isInteger(id)) return { ok: false, err: 'invalid' };
  const realm = game.realms.get(player.entity.realm);
  const e = realm?.entities.get(id);
  if (!e || e.type !== 'npc') return { ok: false, err: 'invalid' };
  if (Math.hypot(e.x - player.entity.x, e.y - player.entity.y) > TALK_REACH + (e.radius || 0.5)) return { ok: false, err: 'range' };
  if (!['root', 'work', 'accept', 'turnin', 'trade', 'chat', 'bye'].includes(choice)) return { ok: false, err: 'invalid' };
  faceTalker(e, player);
  const text = DIALOG[e.kind];
  const ss = sideStatus(game, player, e.kind);
  if (choice === 'accept') {
    if (!ss?.nextId) return { ok: true, d: dialogNode(game, player, e, 'root') };
    const r = acceptQuest(game, player, ss.nextId);
    if (!r.ok) return r;
    sendQuests(game, player);
    const qv = questView(game, player, ss.nextId);
    return { ok: true, d: { ...dialogNode(game, player, e, 'root', text?.quests[ss.nextId]?.progress ?? 'Good. Off you go.'), quest: qv, node: 'accepted' } };
  }
  if (choice === 'turnin') {
    if (!ss?.activeId) return { ok: true, d: dialogNode(game, player, e, 'root') };
    const qid = ss.activeId;
    const r = turnInQuest(game, player, qid);
    if (!r.ok) return { ok: true, d: { ...dialogNode(game, player, e, 'work'), text: 'That is not everything yet. Check what I asked for.', err: r.err } };
    sendQuests(game, player);
    const after = sideStatus(game, player, e.kind);
    let t = text?.quests[qid]?.thanks ?? 'Thank you.';
    if (after.lineDone) t += ' ' + (text?.lineDone ?? '');
    return { ok: true, d: { ...dialogNode(game, player, e, 'root', t), node: 'thanks', rewards: r.d?.rewards } };
  }
  return { ok: true, d: dialogNode(game, player, e, choice) };
}

function faceTalker(e, player) {
  const dx = player.entity.x - e.x, dy = player.entity.y - e.y;
  const f = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  e.facing = f;
  e.data.talkUntil = Infinity;
  e.data.talker = player.id;
  e.data.target = null;
  e.vx = 0; e.vy = 0;
}

// ------------------------------------------------------------------ system

export default {
  name: 'npcs',

  init(game) {
    ST.set(game, { ents: new Map() });
    game.call('registerInteract', 'npc', (g, player, e) => {
      faceTalker(e, player);
      e.data.talkUntil = g.now + 20;
      const node = dialogNode(g, player, e, 'root');
      g.sendSelf(player, 'ui', { panel: 'dialog', npc: e.kind, id: e.id, node, t: g.now });
      g.fx(e.realm, 'ping', e.x, e.y - 1.2, { kind: 'talk', quiet: 1 });
      return { ok: true, d: node };
    });
    game.bus.on('land.raised', () => spawnCastaways(game));
    game.bus.on('rebirth', () => { st(game).ents.clear(); spawnCastaways(game); });
  },

  load(game) {
    st(game).ents.clear();
    spawnCastaways(game);
  },

  onJoin(game, player) { markDirty(game, player); },

  tick(game, dt) {
    const s = st(game);
    for (const e of s.ents.values()) {
      if (e.removed) continue;
      const realm = game.realms.get(e.realm);
      if (!realm) continue;
      const data = e.data;
      if (data.talkUntil > game.now) {
        const p = game.players.get(data.talker);
        if (!p || !p.entity || p.entity.realm !== e.realm || Math.hypot(p.entity.x - e.x, p.entity.y - e.y) > 6) data.talkUntil = 0;
        if (e.state !== 0) e.state = 0;
        continue;
      }
      if (!data.target) {
        data.waitT -= dt;
        if (data.waitT <= 0) {
          const a = game.rng.float(0, Math.PI * 2), r = game.rng.float(0.5, WANDER_R);
          const tx = data.home.x + Math.cos(a) * r, ty = data.home.y + Math.sin(a) * r;
          if (realm.isWalkable(Math.floor(tx), Math.floor(ty))) data.target = { x: tx, y: ty };
          data.waitT = game.rng.float(2.5, 6);
        }
        if (e.state !== 0) e.state = 0;
        continue;
      }
      const dx = data.target.x - e.x, dy = data.target.y - e.y, d = Math.hypot(dx, dy);
      if (d < 0.1) { data.target = null; e.state = 0; continue; }
      const step = Math.min(d, WALK_SPEED * dt);
      const nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
      if (!realm.isWalkable(Math.floor(nx), Math.floor(ny))) { data.target = null; e.state = 0; continue; }
      e.facing = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      e.state = 1;
      realm.move(e, nx, ny);
    }
  },

  slowTick(game) {
    // castaway plots raised by other means (load, cheats) still get their castaway
    const s = st(game);
    s.slow = (s.slow || 0) + 1;
    if (s.slow % 5 === 0) spawnCastaways(game);
  },

  handlers: {
    'npc.talk': talk,
  },
};

export { castawayAssignments };
