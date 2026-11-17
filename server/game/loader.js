// Loads the wildcard folders (TECH_SPEC 14): every .js file default-exports an object with an `id`.
// Owners add files freely; nothing here needs editing.

import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GAME_DIR = dirname(fileURLToPath(import.meta.url));

export const WILDCARDS = Object.freeze({
  ai: { dir: 'ai', match: /\.js$/ },
  bosses: { dir: 'bosses', match: /\.js$/ },
  abilities: { dir: 'abilities', match: /\.js$/ },
  keepers: { dir: 'dungeon/keepers', match: /\.js$/ },
  rooms: { dir: 'dungeon', match: /^rooms-.*\.js$/ },
});

async function loadFolder(dir, match) {
  const out = new Map();
  let files;
  try { files = await readdir(join(GAME_DIR, dir)); } catch { return out; }
  for (const f of files.sort()) {
    if (!match.test(f)) continue;
    try {
      const mod = await import(pathToFileURL(join(GAME_DIR, dir, f)).href);
      const def = mod.default;
      const id = def?.id ?? f.replace(/\.js$/, '');
      out.set(id, def ?? mod);
    } catch (err) {
      console.error(`[tb:loader] failed to load ${dir}/${f}:`, err);
    }
  }
  return out;
}

// Returns { ai: Map, bosses: Map, abilities: Map, keepers: Map, rooms: Map } keyed by module id.
export async function loadWildcards() {
  const result = {};
  for (const [key, { dir, match }] of Object.entries(WILDCARDS)) result[key] = await loadFolder(dir, match);
  return result;
}
