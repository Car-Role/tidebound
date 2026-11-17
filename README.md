# Tidebound

A co-op, top-down pixel-art island-expansion game. One Node process runs the world and serves the browser client.
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

## Controls

WASD move, mouse aim, left mouse swing/attack, right mouse interact, Space dodge, Q/E/R/F abilities,
1-8 hotbar, Tab inventory, B build, C craft, K skills, V deck, M map, J journal, Esc menu.

## Develop

`npm test` runs the headless test suite (`node test/run.js [filter]`). Architecture and ownership rules are in
`docs/TECH_SPEC.md`; cross-package notes go in `docs/INTEGRATION_NOTES.md`.
