# Tidebound

A co-op, top-down pixel-art island-expansion game. One Node process runs the world and serves the browser client,
or (on GitHub Pages) the host's browser tab runs it; see "Play online".
All art and sound are generated in code; there are no asset files.

## Run

```
npm install
npm start                      # http://localhost:8080
```

Options: `node server/main.js --port 8080 --world NAME --persist --admin TOKEN --seed N --verbose`

- `--world NAME` picks the save `saves/NAME.json` (autosaved every 60 s while anyone plays, when the last player
  leaves, and on Ctrl+C; 5 rotating backups `NAME.bak1..5.json`).
- `--persist` keeps the world clock running when nobody is connected.
- `--admin TOKEN` gives host rights to the player with that token (anyone on the server machine is host anyway).

## Join

The server prints LAN addresses at start, e.g. `http://192.168.0.15:8080`. Friends on the same network open that
address in a browser. For internet play, forward the port on your router. Up to 8 players.
Each browser tab is its own player; your first tab keeps the same character across restarts.

## Play online (GitHub Pages, no server)

The repo root is a static site: GitHub Pages (or any static file host) serves `index.html`, which opens `client/`.
There is no Node server there, so the title screen offers **Host** and **Join** instead of a direct connection:

- **Host** runs the real game server (the same `server/` and `shared/` code `npm start` runs) inside your browser
  tab. Your own player connects to it in-tab. You get a 6-character **room code**, shown at the bottom right and in
  the pause menu (Esc) with a Copy button.
- **Join**: friends open the same page, click Join and type the code. They connect straight to the host's tab over
  a WebRTC data channel (PeerJS; its free cloud broker is used only to find each other, game traffic is peer to
  peer). Up to 8 players.
- The world lives in the host's browser: it is saved in that browser's IndexedDB (autosave every 60 s, when the
  tab is hidden, and on close) and comes back the next time that browser hosts. Joiners keep their character on
  that host's world. When the host closes the tab the world stops and joiners return to the title screen.
- Only STUN is configured (no TURN relay), so some strict networks (corporate, some mobile carriers, symmetric
  NAT on both sides) cannot connect. If Join times out, try another network or play over `npm start` instead.

To publish: Settings > Pages > deploy from branch `main`, folder `/ (root)`. The page served by `npm start` keeps
the direct WebSocket connection (it does not serve `server/` to browsers, so it cannot host in-tab).

## Controls

WASD move, mouse aim, left mouse swing/attack, right mouse interact, Space dodge, Q/E/R/F abilities,
1-8 hotbar, Tab inventory, B build, C craft, K skills, V deck, M map, J journal, Esc menu.

## Develop

`npm test` runs the headless test suite (`node test/run.js [filter]`). After adding or removing a file in a
wildcard folder (`server/game/ai`, `bosses`, `abilities`, `dungeon/keepers`, `dungeon/rooms-*.js`) run
`npm run manifest` (the loader uses a checked-in file list so it also works in the browser). Architecture and ownership rules are in
`docs/TECH_SPEC.md`; cross-package notes go in `docs/INTEGRATION_NOTES.md`.
