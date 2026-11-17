// Loads the wildcard folders (TECH_SPEC 14): every .js file default-exports an object with an `id`.
// The file list comes from modules.manifest.js (generated, checked in) instead of a runtime readdir, so the same
// loader runs in Node and in a browser tab (the browser-hosted world, client/net/host.js).
// After adding or removing a file in one of these folders run: npm run manifest   (npm test fails until you do).

import { WILDCARD_FILES } from './modules.manifest.js';
import { WILDCARDS } from './wildcards.js';

export { WILDCARDS };

async function loadFolder(dir, files) {
  const out = new Map();
  for (const f of [...files].sort()) {
    try {
      // relative specifier: resolved against this module's URL in both Node (file:) and the browser (http:)
      const mod = await import(`./${dir}/${f}`);
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
  for (const [key, { dir }] of Object.entries(WILDCARDS)) result[key] = await loadFolder(dir, WILDCARD_FILES[key] ?? []);
  return result;
}
