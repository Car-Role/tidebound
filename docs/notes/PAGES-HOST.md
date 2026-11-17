# Browser-hosted multiplayer (GitHub Pages)

Tidebound now runs from static files. GitHub Pages serves the repo root of `main`; the title screen offers
**Host** (the real server sim runs in that tab) and **Join** (connect to a host by room code over WebRTC).
`npm start` (Node + WebSocket) is unchanged for players.

## How it fits together

```
Node (npm start)                         Browser host tab (Pages)                 Joiner tab (Pages)
ws socket ──wsSocket()──┐                loopback ──createLoopbackPair()──┐        PeerClientSocket (WebSocket-like)
                        ├─ attachSocket(game, sock) ─ Connection ─ routeMessage ─ Game    │
                        │                PeerJS dc ──peerSocket()─────────┘  <── WebRTC ──┘
```

- `server/net/transport.js` is the one adapter layer. Every transport becomes a `ServerSocket`
  (`readyState`, `send(text)`, `close(code, reason)`, `listen({ message, close })`) and goes through
  `attachSocket()`: `Connection.parse` (size, rate limit, JSON guard) -> `routeMessage` -> `game`, and `game.leave`
  on close. Router, snapshot and game code are untouched; `server/main.js` now uses `wsSocket(ws)` with it too.
- Messages are the same JSON text in all three paths. PeerJS uses `{ reliable: true, serialization: 'raw' }`
  (one ordered, reliable channel). Messages over 16 000 chars are split by `shared/frames.js` (`~id,i,n|part`)
  on that path only; small messages pass through unchanged.
- The host's own player connects through the loopback with `loopback: true`, so it is the host (`isHost`,
  coop host tools). Peers are `loopback: false`.
- `client/net/client.js` (`NetClient`) takes a URL or a socket factory; `reconnect: false` for P2P.

## Files

New:
- `index.html` (root): redirects to `client/`. `.nojekyll`: Pages serves files as-is.
- `server/net/transport.js`: `attachSocket`, `wsSocket`, `createLoopbackPair`, `peerSocket` (idle drop after 150 s,
  ICE failure = close).
- `shared/frames.js`: message splitting for the data channel.
- `server/persistence/fs-store.js`: the old file I/O, now a store (Node only, loaded lazily).
- `server/persistence/browser-store.js`: IndexedDB store (localStorage fallback) with the same interface.
- `server/game/wildcards.js`, `server/game/modules.manifest.js` (generated), `scripts/gen-module-manifest.js`.
- `client/net/host.js`: starts the Game in the tab, IndexedDB saves, PeerJS room, worker-backed timers,
  pagehide/visibility saves, host-left broadcast. Dynamically imported only when hosting.
- `client/net/peer-client.js`: PeerJS loader (pinned `peerjs@1.5.4` from jsDelivr with SRI), room codes,
  `PeerClientSocket` for joiners.
- `client/ui/hud/room.js` (room code + Copy at the bottom right, host only), `client/ui/clipboard.js`.
- `test/pages-host.test.js` (17 tests).

Changed:
- `server/persistence/save.js`: same exports (`serializeGame`, `restoreGame`, `saveToDisk`, `loadSave`) plus
  `setSaveStore` / `getSaveStore` / `backupPath`. Storage goes through the installed store; under Node the default
  is `fs-store.js` via a guarded top-level dynamic import, so the browser never requests `node:*`.
- `server/game/loader.js`: imports the files listed in `modules.manifest.js` with relative dynamic imports (works
  for `file:` and `http:`), still one try/catch per module. **After adding or removing a wildcard file run
  `npm run manifest`**; `npm test` fails while the manifest is stale.
- `server/game/realm.js`: chunk base64 without `Buffer` in the browser (`toBase64Browser`).
- `server/game/game.js`: `start(timers)` accepts a timer source (default `setTimeout`).
- `server/net/connection.js`: `new Connection(sock, addr, { loopback })`.
- `server/main.js`: uses `attachSocket(game, wsSocket(ws))`.
- `server/http-static.js`: `/` and `/client` redirect to `/client/` (the client now uses relative URLs);
  `/client/server-info.json` is answered by the Node server so the client knows to connect by WebSocket.
- `client/index.html`: relative `style.css` / `main.js`.
- `client/main.js`: picks the mode (`server-info.json` present -> direct WebSocket; absent -> Host/Join; `?net=ws|p2p`
  overrides), starts the host or the peer socket, "host left" / "no such room" -> message, back to the title.
- `client/ui/panels/title.js`: P2P main view (Host / Join / How online play works / Settings), room code entry,
  one-time notice line. The Node-served title is unchanged.
- `client/ui/panels/pause.js`: room code with Copy (host and joiners), "Close the world?" for the host.
- `README.md` ("Play online"), `docs/TECH_SPEC.md` (one line in section 6), `package.json` (`npm run manifest`).

## Lifecycle

- Host: title -> Host -> IndexedDB opened, save loaded (or new world) -> `Game.init` -> `game.start(workerTimers)`
  -> PeerJS peer `tidebound-<code>` (reuses the last code for this world from localStorage when free) -> the
  host's NetClient opens the loopback. If PeerJS cannot load or reach the broker, the host plays offline (toast
  says why; no code shown).
- Saves: the Game's own autosave every 60 s and on last leave, plus an async save when the tab is hidden, and a
  synchronous save on `pagehide` (localStorage copy + queued IndexedDB write; the newer copy wins on the next load).
  Backups rotate like the file saves (`tidebound/world.bak1..5.json` keys).
- Joiner leaves (tab closed or "Leave to title"): the data channel closes -> `game.leave`. A tab that vanishes
  without closing is dropped on ICE failure or after 150 s of silence.
- Host leaves (tab closed / navigates): `kicked { reason: 'host_left' }` to every peer, sync save, peer destroyed.
  Joiners show "The host left the game." and return to the title, which shows the notice. A host that dies
  silently is detected by joiners after 20 s without data (the host sends 20 snapshots a second).

## How to test

- `npm test` (319 tests; `node test/run.js pages-host` for the new ones).
- Pages mimic: serve the repo root under `/tidebound/` with any static server (case-sensitive is best), open
  `http://127.0.0.1:<port>/tidebound/` in two browsers (or two profiles: the save and the token pool are per
  browser profile), Host in one, Join with the code in the other.
- `npm start`, open `http://localhost:8080` (redirects to `/client/`): the old title and direct connect.

## Known limits

- STUN only (PeerJS defaults), no TURN: strict NATs / corporate or some mobile networks cannot connect. Adding a
  TURN server means passing `config: { iceServers: [...] }` to both `new Peer()` calls.
- Signaling relies on the free PeerJS cloud broker (`0.peerjs.com`); if it is down, nobody can join (live sessions
  keep working). The room code is public-namespace: anyone who has it can join (same as an open LAN server).
- The world lives in the host's browser profile. Clearing site data deletes it; there is no export/import yet.
  Joiners' characters are stored in the host's save (keyed by the joiner's browser token).
- The host tab must stay open. Hidden tabs keep ticking at 20 Hz through worker timers, but a browser may still
  freeze a long-hidden or discarded tab (mobile especially).
- localStorage (pagehide copy) is ~5 MB; a larger save relies on the IndexedDB write finishing during unload.
- One world per browser (`world`); "New castaway" makes a new character, not a new world.
- `npm start` does not serve `server/` to browsers, so the Node-served page cannot host in-tab (it does not need to).
- The title's world summary (`tb.world.<host>`) is per site, so on Pages it shows the last world seen, hosted or joined.
