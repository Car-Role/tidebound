// Test runner: node test/run.js [filter]. Runs test/*.test.js; each default-exports async (t) => { t.test(name, fn) }.

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';

const files = (await readdir(dir)).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();
let passed = 0, failed = 0;
const failures = [];

for (const f of files) {
  const tests = [];
  let mod;
  try { mod = await import(pathToFileURL(join(dir, f)).href); } catch (err) {
    failed++; failures.push(`${f}: failed to load: ${err.stack || err}`);
    console.log(`\n${f}\n  FAIL (load error)`);
    continue;
  }
  const t = { test: (name, fn) => tests.push({ name, fn }) };
  try { await mod.default(t); } catch (err) {
    failed++; failures.push(`${f}: setup threw: ${err.stack || err}`);
    continue;
  }
  console.log(`\n${f}`);
  for (const { name, fn } of tests) {
    const t0 = performance.now();
    try {
      await fn();
      passed++;
      console.log(`  ok   ${name} (${Math.round(performance.now() - t0)} ms)`);
    } catch (err) {
      failed++;
      failures.push(`${f} > ${name}: ${err.stack || err}`);
      console.log(`  FAIL ${name}`);
    }
  }
}

if (failures.length) {
  console.log('\nFailures:');
  for (const m of failures) console.log(' - ' + m);
}
console.log(`\n${passed} passed, ${failed} failed (${files.length} files)`);
process.exit(failed ? 1 : 0);
