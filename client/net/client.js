// WebSocket client: connect, auto-reconnect with backoff, send helpers, request/response for `do`.

import { PROTOCOL_VERSION } from '../../shared/protocol.js';

const PING_MS = 2000;

function randomToken() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context (LAN http) */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const safeGet = (store, k) => { try { return store.getItem(k); } catch { return null; } };
const safeSet = (store, k, v) => { try { store.setItem(k, v); } catch { /* storage disabled */ } };

// Identity: a token per tab (sessionStorage), drawn from a pool kept in localStorage so the first tab
// keeps the same profile across browser restarts while a second tab joins as a different player.
export function acquireToken() {
  const CLAIM_MS = 6000;
  let token = safeGet(sessionStorage, 'tb.token');
  if (!token) {
    let pool = [];
    try { pool = JSON.parse(safeGet(localStorage, 'tb.tokens') || '[]'); } catch { pool = []; }
    const now = Date.now();
    token = pool.find((t) => now - Number(safeGet(localStorage, 'tb.claim.' + t) || 0) > CLAIM_MS) || null;
    if (!token) {
      token = randomToken().replace(/[^A-Za-z0-9_-]/g, '');
      pool.push(token);
      safeSet(localStorage, 'tb.tokens', JSON.stringify(pool.slice(-16)));
    }
    safeSet(sessionStorage, 'tb.token', token);
  }
  const claim = () => safeSet(localStorage, 'tb.claim.' + token, String(Date.now()));
  claim();
  setInterval(claim, 2000);
  addEventListener('pagehide', () => { try { localStorage.removeItem('tb.claim.' + token); } catch { /* ignore */ } });
  return token;
}

export class NetClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.pending = new Map();
    this.reqId = 0;
    this.hello = null;
    this.backoff = 1000;
    this.connected = false;
    this.rtt = 0;
    this.pingTimer = null;
    this.closedByServer = null;
    this.bytesIn = 0;
  }

  on(type, fn) { this.handlers.set(type, fn); return this; }

  connect(hello) {
    this.hello = hello;
    this.open();
  }

  open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.backoff = 1000;
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, ...this.hello }));
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), PING_MS);
      this.handlers.get('open')?.();
    };
    ws.onmessage = (ev) => {
      this.bytesIn += ev.data.length;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') this.rtt = performance.now() - m.c;
      if (m.t === 'res') {
        const p = this.pending.get(m.n);
        if (p) { this.pending.delete(m.n); p(m); }
      }
      if (m.t === 'kicked' || m.t === 'reject') this.closedByServer = m;
      const h = this.handlers.get(m.t);
      if (h) {
        try { h(m); } catch (err) { console.error(`[tb:net] handler ${m.t} threw`, err); }
      }
    };
    ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      for (const p of this.pending.values()) p({ t: 'res', ok: false, err: 'busy' });
      this.pending.clear();
      this.handlers.get('close')?.(this.closedByServer);
      if (this.closedByServer && this.closedByServer.reason !== 'shutdown') return;   // do not fight a kick or reject
      this.closedByServer = null;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(10000, this.backoff * 2);
    };
    ws.onerror = () => {};
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  // Discrete command; resolves with the server's `res` message.
  do(a, d = {}) {
    const n = ++this.reqId;
    return new Promise((resolve) => {
      if (!this.send({ t: 'do', n, a, d })) { resolve({ t: 'res', n, ok: false, err: 'busy' }); return; }
      this.pending.set(n, resolve);
    });
  }
}
