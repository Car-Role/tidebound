// Splitting of large protocol messages for transports with a message size limit (WebRTC data channels).
// A message at or under the limit is sent unchanged (protocol JSON always starts with '{'); a larger one becomes
// frames "~<id>,<index>,<count>|<part>" that FrameAssembler joins back in order. Used by both ends of the PeerJS
// path (server/net/transport.js peerSocket and client/net/peer-client.js); WebSocket and loopback never split.

export const FRAME_CHARS = 16000;     // UTF-16 units per frame: <= 48 KB of UTF-8, well under SCTP limits

let nextId = 1;

export function packFrames(text, max = FRAME_CHARS) {
  if (text.length <= max) return [text];
  const parts = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(text.length, i + max);
    // never split a surrogate pair (a lone half would not survive UTF-8 encoding)
    const c = text.charCodeAt(end - 1);
    if (end < text.length && c >= 0xd800 && c <= 0xdbff) end--;
    parts.push(text.slice(i, end));
    i = end;
  }
  const id = (nextId = (nextId % 1e9) + 1);
  return parts.map((p, i) => `~${id},${i},${parts.length}|${p}`);
}

export class FrameAssembler {
  constructor(maxChars = 8 * 1024 * 1024) { this.cur = null; this.maxChars = maxChars; }

  // Returns the whole message when complete, else null. Frames of one message arrive in order (reliable,
  // ordered channel); a frame that does not continue the current message restarts assembly.
  push(data) {
    if (data[0] !== '~') { this.cur = null; return data; }
    const bar = data.indexOf('|');
    const head = data.slice(1, bar).split(',');
    if (bar < 0 || head.length !== 3) return null;
    const [id, i, n] = head.map(Number);
    if (!(n > 1) || !(i >= 0) || i >= n) return null;
    if (i === 0) this.cur = { id, n, parts: [], size: 0 };
    const c = this.cur;
    if (!c || c.id !== id || c.parts.length !== i || c.n !== n) { this.cur = null; return null; }
    const part = data.slice(bar + 1);
    c.parts.push(part);
    c.size += part.length;
    if (c.size > this.maxChars) { this.cur = null; return null; }
    if (c.parts.length < n) return null;
    this.cur = null;
    return c.parts.join('');
  }
}
