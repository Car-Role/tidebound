// Browser save store for the browser-hosted world (client/net/host.js): the same store interface as fs-store.js,
// installed with save.js setSaveStore(). Plain JS, no node:* imports.
//
// Records live in IndexedDB (database 'tidebound', object store 'saves', key = save path, value = { text, at }).
// Reads are synchronous from an in-memory cache filled by createBrowserStore(), so save.js loadSave() keeps its
// synchronous API. writeSync() (used by the save on pagehide) cannot wait for IndexedDB, so it also writes the
// record to localStorage ('tb.save.' + path), which is synchronous; on the next open the newer of the two copies
// wins and the localStorage copy is dropped once IndexedDB has caught up. Without IndexedDB everything goes to
// localStorage (smaller quota; a write that does not fit is reported, not thrown).

const LS_PREFIX = 'tb.save.';

// IndexedDB as a tiny async key-value store: { getAll() -> [[key, value]], put(key, value), delete(key) }.
export function idbKv(indexedDB, dbName = 'tidebound', storeName = 'saves') {
  const open = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  const run = (mode, fn) => open.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const os = tx.objectStore(storeName);
    let out;
    fn(os, (v) => { out = v; });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  }));
  return {
    ready: open.then(() => true),
    getAll: () => run('readonly', (os, set) => {
      const keys = os.getAllKeys(), vals = os.getAll();
      vals.onsuccess = () => set(keys.result.map((k, i) => [k, vals.result[i]]));
    }),
    put: (key, value) => run('readwrite', (os) => { os.put(value, key); }),
    delete: (key) => run('readwrite', (os) => { os.delete(key); }),
  };
}

const lsGet = (ls, k) => { try { return ls?.getItem(k) ?? null; } catch { return null; } };
const lsSet = (ls, k, v) => { try { ls.setItem(k, v); return true; } catch { return false; } };
const lsDel = (ls, k) => { try { ls?.removeItem(k); } catch { /* ignore */ } };
function lsKeys(ls) {
  const out = [];
  try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(LS_PREFIX)) out.push(k); } } catch { /* ignore */ }
  return out;
}

// Opens the store: loads every record into memory. `kv` overrides the IndexedDB backend (tests pass a memory one);
// pass indexedDB: null to force the localStorage-only fallback.
export async function createBrowserStore({
  indexedDB = globalThis.indexedDB, localStorage = globalThis.localStorage, kv = null, dbName = 'tidebound', log = console,
} = {}) {
  let db = kv;
  if (!db && indexedDB) {
    try { db = idbKv(indexedDB, dbName); await db.ready; } catch (err) { log.warn?.('[tb:save] IndexedDB unavailable, using localStorage:', err?.message ?? err); db = null; }
  }
  const cache = new Map();            // path -> { text, at }
  let clock = 0;                      // strictly increasing stamp so same-millisecond writes still order
  const stamp = () => (clock = Math.max(clock + 1, Date.now()));
  const take = (path, rec) => {
    if (!rec || typeof rec.text !== 'string') return;
    const cur = cache.get(path);
    if (!cur || (rec.at ?? 0) > (cur.at ?? 0)) cache.set(path, { text: rec.text, at: rec.at ?? 0 });
    clock = Math.max(clock, rec.at ?? 0);
  };
  if (db) {
    try { for (const [k, v] of await db.getAll()) take(String(k), v); } catch (err) { log.warn?.('[tb:save] reading IndexedDB failed:', err?.message ?? err); }
  }
  const lsNewer = [];
  for (const k of lsKeys(localStorage)) {
    let rec = null;
    try { rec = JSON.parse(lsGet(localStorage, k)); } catch { rec = null; }
    const path = k.slice(LS_PREFIX.length);
    const before = cache.get(path);
    take(path, rec);
    if (db && cache.get(path) !== before) lsNewer.push(path);           // pagehide copy newer than IndexedDB
    else if (db) lsDel(localStorage, k);                                // stale pagehide copy
  }

  const pending = new Set();
  const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };
  const persist = (path, rec) => {
    if (!db) {
      if (!lsSet(localStorage, LS_PREFIX + path, JSON.stringify(rec))) return Promise.reject(new Error('localStorage quota exceeded'));
      return Promise.resolve();
    }
    return track(db.put(path, rec).then(() => {
      // the IndexedDB copy is now at least as new as any pagehide copy of this path
      const ls = lsGet(localStorage, LS_PREFIX + path);
      if (ls) { try { if ((JSON.parse(ls).at ?? 0) <= rec.at) lsDel(localStorage, LS_PREFIX + path); } catch { lsDel(localStorage, LS_PREFIX + path); } }
    }));
  };
  const remove = (path) => {
    cache.delete(path);
    lsDel(localStorage, LS_PREFIX + path);
    if (db) track(db.delete(path)).catch(() => {});
  };
  // move the newer pagehide copies into IndexedDB now
  for (const path of lsNewer) persist(path, cache.get(path)).catch(() => {});

  const store = {
    kind: db ? 'indexeddb' : 'localStorage',
    existsSync: (path) => cache.has(path),
    readSync: (path) => cache.get(path)?.text ?? null,
    async write(path, text) {
      const rec = { text, at: stamp() };
      cache.set(path, rec);
      await persist(path, rec);
    },
    // Synchronous best effort (pagehide): localStorage now, IndexedDB queued (it usually completes).
    writeSync(path, text) {
      const rec = { text, at: stamp() };
      cache.set(path, rec);
      const ok = lsSet(localStorage, LS_PREFIX + path, JSON.stringify(rec));
      if (db) persist(path, rec).catch((err) => log.warn?.('[tb:save] IndexedDB write failed:', err?.message ?? err));
      else if (!ok) log.warn?.('[tb:save] localStorage is full: this save was not stored');
    },
    renameSync(from, to) {
      const rec = cache.get(from);
      if (!rec) return;
      cache.set(to, rec);
      persist(to, rec).catch(() => {});
      remove(from);
    },
    copySync(from, to) {
      const rec = cache.get(from);
      if (!rec) return;
      const copy = { text: rec.text, at: stamp() };
      cache.set(to, copy);
      persist(to, copy).catch(() => {});
    },
    // Resolves when every queued IndexedDB write has settled (tests, and before a deliberate reload).
    flush: () => Promise.allSettled([...pending]),
    paths: () => [...cache.keys()].sort(),
  };
  return store;
}
