// Pure inventory operations. An inventory is { slots: Array<[itemId, qty] | null> }.
// `stackOf(itemId) -> max stack` is passed in so these functions stay content-agnostic.

export const DEFAULT_STACK = 999;
const defaultStackOf = () => DEFAULT_STACK;

export function createInventory(size) {
  return { slots: new Array(Math.max(0, size | 0)).fill(null) };
}

// Grow or shrink; shrinking never drops items (returns the stacks that no longer fit).
export function resize(inv, size) {
  const spill = [];
  while (inv.slots.length < size) inv.slots.push(null);
  while (inv.slots.length > size) {
    const s = inv.slots.pop();
    if (s) spill.push(s);
  }
  return spill;
}

export function count(inv, item) {
  let n = 0;
  for (const s of inv.slots) if (s && s[0] === item) n += s[1];
  return n;
}

export function has(inv, list) {
  const need = new Map();
  for (const { item, qty } of list) need.set(item, (need.get(item) || 0) + qty);
  for (const [item, qty] of need) if (count(inv, item) < qty) return false;
  return true;
}

// Index of the first slot that can take at least one `item` (existing partial stack first), or -1.
export function firstFit(inv, item, stackOf = defaultStackOf) {
  const max = stackOf(item);
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s && s[0] === item && s[1] < max) return i;
  }
  for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) return i;
  return -1;
}

export function spaceFor(inv, item, stackOf = defaultStackOf) {
  const max = stackOf(item);
  let room = 0;
  for (const s of inv.slots) {
    if (!s) room += max;
    else if (s[0] === item) room += Math.max(0, max - s[1]);
  }
  return room;
}

// Adds as much as fits; returns the leftover quantity.
export function add(inv, item, qty, stackOf = defaultStackOf) {
  if (!(qty > 0)) return 0;
  const max = stackOf(item);
  let left = Math.floor(qty);
  for (const s of inv.slots) {
    if (left <= 0) break;
    if (s && s[0] === item && s[1] < max) {
      const n = Math.min(left, max - s[1]);
      s[1] += n; left -= n;
    }
  }
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    if (!inv.slots[i]) {
      const n = Math.min(left, max);
      inv.slots[i] = [item, n]; left -= n;
    }
  }
  return left;
}

// Removes up to qty (from the last stacks first); returns the amount removed.
export function remove(inv, item, qty) {
  let left = Math.floor(qty);
  for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.slots[i];
    if (!s || s[0] !== item) continue;
    const n = Math.min(left, s[1]);
    s[1] -= n; left -= n;
    if (s[1] <= 0) inv.slots[i] = null;
  }
  return Math.floor(qty) - left;
}

// Atomic: removes every entry of list or nothing.
export function removeAll(inv, list) {
  if (!has(inv, list)) return false;
  for (const { item, qty } of list) remove(inv, item, qty);
  return true;
}

// Move qty from src slot `from` to dst slot `to` (dst may equal src). Merges same items, swaps otherwise.
export function move(src, from, dst, to, qty, stackOf = defaultStackOf) {
  if (from < 0 || from >= src.slots.length || to < 0 || to >= dst.slots.length) return false;
  const a = src.slots[from];
  if (!a) return false;
  if (src === dst && from === to) return true;
  const n = Math.min(a[1], qty > 0 ? Math.floor(qty) : a[1]);
  const b = dst.slots[to];
  if (!b) {
    dst.slots[to] = [a[0], n];
    a[1] -= n;
    if (a[1] <= 0) src.slots[from] = null;
    return true;
  }
  if (b[0] === a[0]) {
    const room = stackOf(a[0]) - b[1];
    const m = Math.min(room, n);
    if (m <= 0) return false;
    b[1] += m; a[1] -= m;
    if (a[1] <= 0) src.slots[from] = null;
    return true;
  }
  if (n !== a[1]) return false;          // partial move onto a different item is not allowed
  src.slots[from] = b; dst.slots[to] = a;
  return true;
}

export function clear(inv) { inv.slots.fill(null); }

export const toJSON = (inv) => inv.slots.map((s) => (s ? [s[0], s[1]] : null));

export function fromJSON(data, size) {
  const inv = createInventory(size);
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      if (!Array.isArray(s) || typeof s[0] !== 'string' || !(s[1] > 0)) continue;
      if (i < inv.slots.length) inv.slots[i] = [s[0], Math.floor(s[1])];
      else add(inv, s[0], s[1]);
    }
  }
  return inv;
}

// Bound facade used as game.inv: same ops with the content stack sizes filled in.
export function bindInventory(stackOf) {
  return {
    create: createInventory, resize, count, has, removeAll, remove, clear, toJSON,
    fromJSON,
    firstFit: (inv, item) => firstFit(inv, item, stackOf),
    spaceFor: (inv, item) => spaceFor(inv, item, stackOf),
    add: (inv, item, qty) => add(inv, item, qty, stackOf),
    move: (src, from, dst, to, qty) => move(src, from, dst, to, qty, stackOf),
    stackOf,
  };
}
