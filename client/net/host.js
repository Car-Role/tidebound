// Browser host (GitHub Pages "Host"): runs the real authoritative server (server/ + shared/, unchanged game logic)
// inside this tab. The host's own player connects through the in-tab loopback; friends connect over PeerJS data
// channels. Both go through server/net/transport.js attachSocket, the same path the Node WebSocket server uses.
// Saves go to IndexedDB (localStorage fallback) through save.js with the browser store; autosave is the Game's own
// (every 60 s), plus a save when the tab is hidden and a synchronous one on pagehide.
// Imported dynamically by client/main.js only when hosting, so joiners and the Node-served page never load it.

import { content } from '../../shared/data/index.js';
import { Game } from '../../server/game/game.js';
import { attachSocket, createLoopbackPair, peerSocket } from '../../server/net/transport.js';
import { setSaveStore, loadSave } from '../../server/persistence/save.js';
import { createBrowserStore } from '../../server/persistence/browser-store.js';
import { loadPeerJs, randomRoomCode, isRoomCode, peerIdFor, peerErrorText } from './peer-client.js';

// setTimeout/clearTimeout backed by a dedicated worker: Chrome throttles main-thread timers in hidden tabs (to 1 Hz,
// then once a minute), which would stall the world for everyone while the host looks at another tab.
function workerTimers() {
  try {
    const src = 'const t=new Map();onmessage=(e)=>{const[o,i,ms]=e.data;if(o===1)t.set(i,setTimeout(()=>{t.delete(i);postMessage(i)},ms));else{clearTimeout(t.get(i));t.delete(i)}}';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    const cbs = new Map();
    let next = 1;
    w.onmessage = (e) => { const fn = cbs.get(e.data); cbs.delete(e.data); fn?.(); };
    return {
      setTimeout(fn, ms) { const id = next++; cbs.set(id, fn); w.postMessage([1, id, ms]); return id; },
      clearTimeout(id) { cbs.delete(id); w.postMessage([0, id, 0]); },
    };
  } catch { return null; }
}

// Opens a PeerJS peer under the room code (reusing the last code for this world when it is free).
async function openRoom(Peer, preferred, onLog) {
  let code = isRoomCode(preferred) ? preferred : randomRoomCode();
  for (let attempt = 0; attempt < 4; attempt++) {
    const peer = new Peer(peerIdFor(code));
    const r = await new Promise((resolve) => {
      peer.once('open', () => resolve({ ok: true }));
      peer.once('error', (err) => resolve({ ok: false, err }));
    });
    if (r.ok) return { peer, code };
    try { peer.destroy(); } catch { /* ignore */ }
    if (r.err?.type !== 'unavailable-id') throw new Error(peerErrorText(r.err));
    onLog?.(`room code ${code} is taken, picking another`);
    code = randomRoomCode();
  }
  throw new Error('could not get a free room code');
}

/**
 * Starts the world in this tab. Returns { game, code, peerError, clientSocket(), stop() }.
 * `code` is null when the PeerJS room could not be opened (single player still works; peerError says why).
 */
export async function startBrowserHost({ worldName = 'world', onStatus = () => {}, onPeers = () => {} } = {}) {
  onStatus('Opening your save...');
  const store = await createBrowserStore();
  setSaveStore(store);
  const savePath = `tidebound/${worldName}.json`;
  const saveData = loadSave(savePath);

  onStatus(saveData ? 'Loading your world...' : 'Raising a new world...');
  const game = new Game({ content, worldName, savePath, persist: false });
  await game.init(saveData);
  game.start(workerTimers());
  console.log(`[tb:host] world '${worldName}' ${saveData ? 'loaded' : 'created'} (seed ${game.seed}, ${store.kind})`);

  let handedOut = false;

  // friends
  let stopped = false;
  const peers = new Set();
  let peer = null, code = null, peerError = null;
  const roomKey = 'tb.room.' + worldName;
  try {
    onStatus('Opening a room...');
    const Peer = await loadPeerJs();
    let last = null;
    try { last = localStorage.getItem(roomKey); } catch { /* ignore */ }
    ({ peer, code } = await openRoom(Peer, last, (m) => console.warn('[tb:host]', m)));
    try { localStorage.setItem(roomKey, code); } catch { /* ignore */ }
    peer.on('connection', (dc) => {
      dc.on('open', () => {
        if (stopped) { try { dc.close(); } catch { /* ignore */ } return; }
        const sock = peerSocket(dc);
        peers.add(sock);
        const conn = attachSocket(game, sock, { remoteAddress: 'peer:' + dc.peer, loopback: false });
        console.log(`[tb:host] peer connected (${peers.size} online)`);
        onPeers(peers.size);
        const off = () => { if (peers.delete(sock)) { console.log(`[tb:host] peer left (${peers.size} online)`); onPeers(peers.size); } };
        dc.on('close', off);
        dc.on('error', off);
        conn.peerSock = sock;
      });
    });
    // losing the broker only stops new joins; live channels keep working. Try to get back on it.
    peer.on('disconnected', () => { if (!stopped) setTimeout(() => { try { if (!stopped && peer.disconnected) peer.reconnect(); } catch { /* ignore */ } }, 2000); });
    peer.on('error', (err) => console.warn('[tb:host] peer error:', err?.type ?? err));
  } catch (err) {
    peerError = err.message || String(err);
    console.warn('[tb:host] online room unavailable:', peerError);
  }

  const saveNow = () => game.save().catch((err) => console.error('[tb:save] save failed:', err));
  const onHidden = () => { if (document.visibilityState === 'hidden') saveNow(); };
  // Host leaving: tell everyone, save synchronously, drop the room.
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const p of game.players.values()) if (!p.conn?.loopback) p.conn?.send({ t: 'kicked', reason: 'host_left' });
    game.stop();
    try { game.save({ sync: true }); } catch (err) { console.error('[tb:save] save on close failed:', err); }
    for (const s of peers) s.close(1001, 'host_left');
    try { peer?.destroy(); } catch { /* ignore */ }
    removeEventListener('pagehide', stop);
    document.removeEventListener('visibilitychange', onHidden);
  };
  addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', onHidden);

  return {
    game, code, peerError, store,
    peerCount: () => peers.size,
    // The host's own player: a fresh in-tab loopback pair, created when the NetClient opens (the client end opens
    // on the next microtask, so its handlers must already be listening).
    clientSocket() {
      if (handedOut) throw new Error('the loopback socket was already used');
      handedOut = true;
      const loop = createLoopbackPair();
      attachSocket(game, loop.server, { remoteAddress: 'loopback', loopback: true });
      return loop.client;
    },
    stop,
  };
}
