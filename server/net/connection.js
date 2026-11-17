// Per-socket state: JSON parse guard, size limit, token-bucket rate limit, heartbeat.

import { MAX_MSG_BYTES, RATE_LIMIT } from '../../shared/config.js';

let nextConnId = 1;
const HEARTBEAT_MS = 10000;
const MAX_STRIKES = 300;      // dropped-over-limit messages before the socket is closed

export function isLoopback(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('127.');
}

export class Connection {
  constructor(ws, remoteAddress) {
    this.id = nextConnId++;
    this.ws = ws;
    this.remoteAddress = remoteAddress || '';
    this.loopback = isLoopback(this.remoteAddress);
    this.player = null;
    this.tokens = RATE_LIMIT;
    this.lastRefill = performance.now();
    this.strikes = 0;
    this.alive = true;
    this.closed = false;
  }

  send(msg) {
    if (this.closed || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    try { this.ws.close(code, reason); } catch { /* already closing */ }
  }

  // Returns a parsed message object, or null when it must be ignored.
  parse(raw, isBinary) {
    const now = performance.now();
    this.tokens = Math.min(RATE_LIMIT, this.tokens + ((now - this.lastRefill) / 1000) * RATE_LIMIT);
    this.lastRefill = now;
    if (this.tokens < 1) {
      if (++this.strikes > MAX_STRIKES) this.close(4008, 'rate');
      return null;
    }
    this.tokens -= 1;
    this.strikes = 0;
    if (isBinary) return null;
    const len = typeof raw === 'string' ? raw.length : raw.byteLength ?? raw.length;
    if (len > MAX_MSG_BYTES) return null;
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')); } catch { return null; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return null;
    return msg;
  }
}

// Ping every socket periodically; terminate those that did not answer the previous ping.
export function startHeartbeat(wss) {
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      const conn = ws.conn;
      if (!conn) continue;
      if (!conn.alive) { ws.terminate(); continue; }
      conn.alive = false;
      try { ws.ping(); } catch { /* socket closing */ }
    }
  }, HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
