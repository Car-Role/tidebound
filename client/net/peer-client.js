// PeerJS side of browser multiplayer (GitHub Pages): loads PeerJS from a pinned CDN build, room codes, and the
// joiner's WebSocket-like socket over a WebRTC data channel. The PeerJS cloud broker is used for signaling only;
// game traffic goes peer to peer on one reliable, ordered channel carrying the same JSON messages as the WebSocket.

import { packFrames, FrameAssembler } from '../../shared/frames.js';

export const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR';
export const PEER_PREFIX = 'tidebound-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O or 1/I
export const CODE_LEN = 6;

export function randomRoomCode() {
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
export function normalizeRoomCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
}
export const isRoomCode = (s) => typeof s === 'string' && s.length === CODE_LEN && [...s].every((c) => CODE_ALPHABET.includes(c));
export const peerIdFor = (code) => PEER_PREFIX + code.toLowerCase();

let loading = null;
export function loadPeerJs() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.integrity = PEERJS_SRI;
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = () => {
      const P = globalThis.Peer || globalThis.peerjs?.Peer;
      if (P) resolve(P); else reject(new Error('PeerJS loaded but Peer is missing'));
    };
    s.onerror = () => { loading = null; reject(new Error('could not load PeerJS (offline or blocked)')); };
    document.head.appendChild(s);
  });
  return loading;
}

export const PEER_ERRORS = {
  'peer-unavailable': 'No world with that code. Check it with the host.',
  'unavailable-id': 'That room code is taken.',
  network: 'Cannot reach the PeerJS signaling server.',
  'server-error': 'Cannot reach the PeerJS signaling server.',
  'socket-error': 'Lost the PeerJS signaling server.',
  'browser-incompatible': 'This browser does not support WebRTC.',
  webrtc: 'The WebRTC connection failed (a strict network may block it).',
};
export const peerErrorText = (err) => PEER_ERRORS[err?.type] ?? (err?.message || String(err));

// The joiner's socket, shaped like a browser WebSocket for client/net/client.js:
// readyState, onopen, onmessage({ data }), onclose({ code, reason }), onerror, send(text), close().
// `closeReason` is set before onclose: 'host_left', 'no_room', 'timeout', 'error:<text>' or 'closed'.
export class PeerClientSocket {
  constructor(code, { connectTimeoutMs = 20000, silenceMs = 20000 } = {}) {
    this.readyState = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.closeReason = '';
    this.code = code;
    this.asm = new FrameAssembler();
    this.lastData = performance.now();
    this.silenceMs = silenceMs;
    this.peer = null;
    this.dc = null;
    this.timer = setTimeout(() => this.fail('timeout', 'Could not reach the host (timed out).'), connectTimeoutMs);
    this.onPageHide = () => this.close();
    addEventListener('pagehide', this.onPageHide);
    this.start().catch((err) => this.fail('error', err.message));
  }

  async start() {
    const Peer = await loadPeerJs();
    if (this.readyState === 3) return;
    const peer = new Peer();
    this.peer = peer;
    peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') this.fail('no_room', peerErrorText(err));
      else if (this.readyState !== 1) this.fail('error', peerErrorText(err));
    });
    peer.on('open', () => {
      if (this.readyState === 3) return;
      const dc = peer.connect(peerIdFor(this.code), { reliable: true, serialization: 'raw' });
      this.dc = dc;
      dc.on('open', () => {
        if (this.readyState === 3) return;
        clearTimeout(this.timer);
        this.readyState = 1;
        this.lastData = performance.now();
        // a host whose tab died without a goodbye goes silent (it sends 20 snapshots a second while alive)
        this.watch = setInterval(() => {
          if (this.readyState === 1 && performance.now() - this.lastData > this.silenceMs) this.fail('host_left', 'The host stopped responding.');
        }, 1000);
        this.onopen?.({});
      });
      dc.on('data', (data) => {
        this.lastData = performance.now();
        if (typeof data !== 'string') return;
        const whole = this.asm.push(data);
        if (whole !== null) this.onmessage?.({ data: whole });
      });
      dc.on('close', () => this.fail(this.readyState === 1 ? 'host_left' : 'error', 'The connection to the host closed.'));
      dc.on('error', (err) => this.fail('error', peerErrorText(err)));
    });
  }

  send(text) {
    if (this.readyState !== 1) return;
    for (const part of packFrames(String(text))) this.dc.send(part);
  }

  fail(reason, text) {
    if (this.readyState === 3) return;
    this.closeReason = reason;
    this.closeText = text || '';
    this.shutdown();
    this.onclose?.({ code: 4000, reason });
  }

  close() {
    if (this.readyState === 3) return;
    this.closeReason = 'closed';
    this.shutdown();
    this.onclose?.({ code: 1000, reason: 'closed' });
  }

  shutdown() {
    this.readyState = 3;
    clearTimeout(this.timer);
    clearInterval(this.watch);
    removeEventListener('pagehide', this.onPageHide);
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}
