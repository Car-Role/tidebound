// File save store for Node (the default store of save.js): atomic writes (.tmp then rename), sync and async.
// Never imported by the browser path; save.js loads it with a dynamic import only when running under Node.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { dirname } from 'node:path';

export const fsStore = Object.freeze({
  kind: 'fs',
  existsSync: (p) => fs.existsSync(p),
  readSync: (p) => fs.readFileSync(p, 'utf8'),
  writeSync(p, text) {
    fs.mkdirSync(dirname(p), { recursive: true });
    fs.writeFileSync(p + '.tmp', text);
    fs.renameSync(p + '.tmp', p);
  },
  async write(p, text) {
    await fsp.mkdir(dirname(p), { recursive: true });
    await fsp.writeFile(p + '.tmp', text);
    await fsp.rename(p + '.tmp', p);
  },
  renameSync: (from, to) => fs.renameSync(from, to),
  copySync(from, to) {
    fs.mkdirSync(dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  },
});
