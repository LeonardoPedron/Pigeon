// Trasporti di rete per il multiplayer. Interfaccia comune:
//   t.id, t.send(msg, to?), t.onMessage(fn(msg, from)), t.onJoin(fn(id)), t.onLeave(fn(id)), t.leave()
// - TrysteroTransport: WebRTC P2P, segnalazione tramite relay Nostr pubblici (funziona su GitHub Pages).
// - LocalTransport: BroadcastChannel tra schede dello stesso browser (test e prove in locale).

const APP_ID = 'piccione-spia-rovolon-v1';

class Base {
  constructor() { this.handlers = { msg: [], join: [], leave: [] }; }
  onMessage(fn) { this.handlers.msg.push(fn); }
  onJoin(fn) { this.handlers.join.push(fn); }
  onLeave(fn) { this.handlers.leave.push(fn); }
  emit(kind, ...a) { for (const f of this.handlers[kind]) { try { f(...a); } catch (e) { console.error('[mp]', e); } } }
}

export class LocalTransport extends Base {
  constructor(room) {
    super();
    this.id = 'L' + Math.random().toString(36).slice(2, 10);
    this.peers = new Map(); // id -> ultimo contatto
    this.ch = new BroadcastChannel('pz:' + room);
    this.ch.onmessage = (e) => {
      const { from, to, msg, sys } = e.data || {};
      if (!from || from === this.id) return;
      if (to && to !== this.id) return;
      if (!this.peers.has(from)) {
        this.peers.set(from, performance.now());
        this.emit('join', from);
        if (sys !== 'bye') this.ch.postMessage({ from: this.id, to: from, sys: 'hi' });
      }
      this.peers.set(from, performance.now());
      if (sys === 'bye') { this.peers.delete(from); this.emit('leave', from); return; }
      if (msg) this.emit('msg', msg, from);
    };
    this.ch.postMessage({ from: this.id, sys: 'hi' });
    this.ping = setInterval(() => {
      this.ch.postMessage({ from: this.id, sys: 'hi' });
      const now = performance.now();
      for (const [id, t] of this.peers) if (now - t > 6000) { this.peers.delete(id); this.emit('leave', id); }
    }, 2000);
    addEventListener('pagehide', () => this.leave());
  }
  send(msg, to) { this.ch.postMessage({ from: this.id, to, msg }); }
  leave() {
    if (!this.ch) return;
    clearInterval(this.ping);
    try { this.ch.postMessage({ from: this.id, sys: 'bye' }); this.ch.close(); } catch { /* ignore */ }
    this.ch = null;
  }
}

export class TrysteroTransport extends Base {
  static async create(room) {
    const lib = await import('../vendor/trystero.js');
    return new TrysteroTransport(lib, room);
  }
  constructor(lib, room) {
    super();
    this.id = lib.selfId;
    this.room = lib.joinRoom({ appId: APP_ID }, room);
    this.action = this.room.makeAction('pz', { onMessage: (data, ctx) => this.emit('msg', data, ctx.peerId) });
    this.room.onPeerJoin = (id) => this.emit('join', id);
    this.room.onPeerLeave = (id) => this.emit('leave', id);
    addEventListener('pagehide', () => this.leave());
  }
  send(msg, to) {
    this.action.send(msg, to ? { target: to } : undefined).catch(() => { /* peer andato via */ });
  }
  leave() { if (this.room) { this.room.leave(); this.room = null; } }
}

export async function connect(kind, room) {
  if (kind === 'local') return new LocalTransport(room);
  return TrysteroTransport.create(room);
}
