// Wildcard folders (TECH_SPEC 14) under server/game/: key -> { dir, match }. Shared by loader.js and
// scripts/gen-module-manifest.js, which writes modules.manifest.js from these patterns.

export const WILDCARDS = Object.freeze({
  ai: { dir: 'ai', match: /\.js$/ },
  bosses: { dir: 'bosses', match: /\.js$/ },
  abilities: { dir: 'abilities', match: /\.js$/ },
  keepers: { dir: 'dungeon/keepers', match: /\.js$/ },
  rooms: { dir: 'dungeon', match: /^rooms-.*\.js$/ },
});
