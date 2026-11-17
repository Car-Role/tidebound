// Minimal assertions for the test runner.

export class AssertionError extends Error {}

const fmt = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

export function ok(v, msg = 'expected truthy') {
  if (!v) throw new AssertionError(`${msg} (got ${fmt(v)})`);
}

export function eq(actual, expected, msg = '') {
  const a = fmt(actual), b = fmt(expected);
  if (actual !== expected && a !== b) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${b}, got ${a}`);
}

export function near(actual, expected, eps = 1e-6, msg = '') {
  if (!(Math.abs(actual - expected) <= eps)) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${expected} +/- ${eps}, got ${actual}`);
}

export function throws(fn, msg = 'expected function to throw') {
  try { fn(); } catch { return; }
  throw new AssertionError(msg);
}

export default { ok, eq, near, throws };
