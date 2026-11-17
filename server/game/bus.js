// Event bus (TECH_SPEC 5.4). Listeners never break the emitter: each is wrapped in try/catch and logged.

export class Bus {
  constructor(log = console) {
    this.listeners = new Map();
    this.log = log;
  }

  on(event, fn) {
    let list = this.listeners.get(event);
    if (!list) { list = []; this.listeners.set(event, list); }
    list.push(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (p) => { off(); fn(p); });
    return off;
  }

  off(event, fn) {
    const list = this.listeners.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return;
    for (const fn of list.slice()) {
      try { fn(payload); } catch (err) {
        this.log.error(`[tb:bus] listener for '${event}' threw:`, err);
      }
    }
  }
}
