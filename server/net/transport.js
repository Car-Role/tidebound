// Transport adapters: one server-side socket interface for every way a client can reach the Game.
//
//   ServerSocket = {
//     readyState,                 // 1 while open (WebSocket numbering: 0 connecting, 1 open, 2 closing, 3 closed)
//     send(text),                 // one JSON protocol message (TECH_SPEC 6), already stringified
//     close(code, reason),
//     listen({ message(raw, isBinary), close() }),   // called once by attachSocket
//   }
//
// attachSocket() wraps any ServerSocket in a Connection and wires it to the router, so the WebSocket server
// (server/main.js), the in-tab loopback (browser host's own player) and PeerJS data channels (browser host's
// friends) all share one path: Connection.parse -> routeMessage -> game, and game.leave on close.
// Nothing here imports node:* or ws; the ws socket is passed in by server/main.js.

import { Connection } from './connection.js';
import { routeMessage } from './router.js';
import { packFrames, FrameAssembler } from '../../shared/frames.js';

export function attachSocket(game, sock, { remoteAddress = '', loopback } = {}) {
  const conn = new Connection(sock, remoteAddress, { loopback });
  sock.listen({
    message(raw, isBinary) {
      conn.alive = true;
      const msg = conn.parse(raw, isBinary);
      if (!msg) return;
      try { routeMessage(game, conn, msg); } catch (err) { console.error('[tb:net] route error:', err); }
    },
    close() {
      if (conn.left) return;
      conn.left = true;
      conn.closed = true;
      if (conn.player) game.leave(conn.player);
    },
  });
  return conn;
}

// ---------------------------------------------------------------- ws (Node)

export function wsSocket(ws) {
  return {
    get readyState() { return ws.readyState; },
    send: (text) => ws.send(text),
    close: (code, reason) => ws.close(code, reason),
    listen(h) {
      ws.on('message', (raw, isBinary) => h.message(raw, isBinary));
      ws.on('close', () => h.close());
      ws.on('error', () => {});
    },
  };
}

// ---------------------------------------------------------------- in-tab loopback

// A connected pair: `server` is a ServerSocket for attachSocket, `client` behaves like a browser WebSocket
// (readyState, onopen, onmessage({ data }), onclose({ code, reason }), onerror, send, close) for client/net/client.js.
// Messages are strings in both directions (the same JSON text a WebSocket carries) and are delivered
// asynchronously (microtask), never re-entrantly inside the sender's call.
export function createLoopbackPair() {
  let h = null;                       // server handlers
  let state = 0;
  const later = (fn) => queueMicrotask(fn);
  const finish = (code, reason) => {
    if (state === 3) return;
    state = 3;
    later(() => {
      h?.close();
      client.onclose?.({ code, reason, wasClean: true });
    });
  };
  const server = {
    get readyState() { return state; },
    send(text) {
      if (state !== 1) return;
      later(() => { if (state === 1) client.onmessage?.({ data: String(text) }); });
    },
    close(code = 1000, reason = '') { finish(code, reason); },
    listen(handlers) { h = handlers; },
  };
  const client = {
    get readyState() { return state; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
    send(text) {
      if (state !== 1) throw new Error('loopback socket is not open');
      later(() => { if (state === 1) h?.message(String(text), false); });
    },
    close(code = 1000, reason = '') { finish(code, reason); },
  };
  later(() => { if (state === 0) { state = 1; client.onopen?.({}); } });
  return { server, client };
}

// ---------------------------------------------------------------- PeerJS data channel (host side)

// Wraps a PeerJS DataConnection opened with { reliable: true, serialization: 'raw' }. Messages are the protocol's
// JSON text; ones over the frame limit are split by shared/frames.js (both ends use it). A peer that sends
// nothing for `idleMs` is dropped (the client pings every 2 s; background tabs may stretch that to ~1/min).
export function peerSocket(dc, { idleMs = 150000, frameBytes } = {}) {
  let state = dc.open === false ? 0 : 1;
  let last = Date.now();
  let idle = null;
  let h = null;
  const asm = new FrameAssembler();
  const sock = {
    get readyState() { return state; },
    send(text) {
      if (state !== 1) return;
      try { for (const part of packFrames(String(text), frameBytes)) dc.send(part); } catch { sock.close(1011, 'send'); }
    },
    close(code = 1000, reason = '') {
      if (state === 3) return;
      state = 3;
      clearInterval(idle);
      try { dc.close(); } catch { /* already closed */ }
      h?.close();
    },
    listen(handlers) {
      h = handlers;
      if (state === 0) dc.on('open', () => { if (state === 0) state = 1; });
      dc.on('data', (data) => {
        last = Date.now();
        if (typeof data !== 'string') { h.message(data, true); return; }
        const whole = asm.push(data);
        if (whole !== null) h.message(whole, false);
      });
      const gone = () => { if (state !== 3) { state = 3; clearInterval(idle); h.close(); } };
      dc.on('close', gone);
      dc.on('error', gone);
      dc.peerConnection?.addEventListener?.('iceconnectionstatechange', () => {
        const s = dc.peerConnection.iceConnectionState;
        if (s === 'failed' || s === 'closed') gone();
      });
      idle = setInterval(() => { if (Date.now() - last > idleMs) sock.close(4009, 'idle'); }, Math.min(idleMs, 5000));
    },
  };
  return sock;
}
