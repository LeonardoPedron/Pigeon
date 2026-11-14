// Piccioni comuni controllati dal computer, deterministici: posizione = f(seme della stanza, orologio).
// Ogni giocatore della stanza li vede negli stessi posti senza scambiare dati.
import { RemotePigeon } from './remote.js';

export const PIGEON_NAMES = ['Gigio', 'Tobia', 'Nane', 'Bepi', 'Toni', 'Rina', 'Gina', 'Ottavio', 'Piuma', 'Grigio', 'Colombo', 'Tita', 'Mariuccia', 'Checco', 'Berto', 'Ivo', 'Lalla', 'Zeno', 'Bruna', 'Dino', 'Pina', 'Rocco', 'Ugo', 'Nina', 'Tullio', 'Elda', 'Gastone', 'Fiore', 'Sandro', 'Wanda'];
const SPOT_TYPES = /^(place_of_worship|bar|cafe|restaurant|townhall|school|pharmacy|post_office|fountain|bench|shop:|supermarket|historic:memorial|community_centre|newsagent)/;
const SEG = 16; // durata di un tratto, s

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rnd(seed, a, b) { // numero pseudo-casuale in [0,1) da tre interi
  let h = seed ^ Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Flock {
  constructor(game, room, nest, count = 20) {
    this.g = game;
    this.seed = hashStr(room);
    const spots = (game.data.pois || []).filter((p) => SPOT_TYPES.test(p.t || ''));
    spots.sort((a, b) => Math.hypot(a.x - nest.x, a.z - nest.z) - Math.hypot(b.x - nest.x, b.z - nest.z));
    this.bots = [];
    const usedNames = new Set();
    for (let i = 0; i < count; i++) {
      // i primi 6 attorno al nido (dove nascono i giocatori), gli altri nei luoghi frequentati vicini
      const s = i < 6 ? nest : spots[Math.floor(rnd(this.seed, i, 1) * Math.min(spots.length, 40))] || nest;
      let name = PIGEON_NAMES[Math.floor(rnd(this.seed, i, 2) * PIGEON_NAMES.length)];
      if (usedNames.has(name)) name += ' ' + (2 + i % 7);
      usedNames.add(name);
      const r = new RemotePigeon(game.scene, 'bot' + i, name, { bot: true });
      this.bots.push({ i, ax: s.x + (rnd(this.seed, i, 3) - 0.5) * 8, az: s.z + (rnd(this.seed, i, 4) - 0.5) * 8, rad: 4 + rnd(this.seed, i, 5) * 10, off: rnd(this.seed, i, 6) * SEG, r });
    }
  }

  point(b, k) {
    const s = this.seed, i = b.i;
    const fly = rnd(s, i * 977 + 13, k) < 0.08;
    const rad = fly ? b.rad * 4 : b.rad;
    const a = rnd(s, i * 31 + 7, k) * Math.PI * 2, d = Math.sqrt(rnd(s, i * 57 + 3, k)) * rad;
    return { x: b.ax + Math.cos(a) * d, z: b.az + Math.sin(a) * d, fly };
  }

  update(dt, camPos) {
    const now = Date.now() / 1000;
    const world = this.g.world;
    for (const b of this.bots) {
      const t = (now + b.off) / SEG;
      const k = Math.floor(t), f = t - k;
      const p0 = this.point(b, k), p1 = this.point(b, k + 1);
      const fly = p1.fly;
      // si muove nella prima parte del tratto, poi becchetta fermo
      const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const moveT = fly ? 0.35 : Math.min(0.85, dist / 0.55 / SEG);
      const m = Math.min(1, f / Math.max(0.01, moveT));
      const e = m * m * (3 - 2 * m);
      const x = p0.x + (p1.x - p0.x) * e, z = p0.z + (p1.z - p0.z) * e;
      let y = world.surfaceAt ? world.surfaceAt(x, z).y : 0;
      const moving = m < 1;
      if (fly && moving) y += Math.sin(m * Math.PI) * Math.min(25, 4 + dist * 0.4);
      const h = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      const sp = moving ? dist / (moveT * SEG) : 0;
      const prevH = b.r.heading;
      b.r.setDirect(x, y, z, moving ? h : prevH, fly && moving && m > 0.05 && m < 0.95, Math.sin(h) * sp, Math.cos(h) * sp);
      if (!moving && b.r.peckT <= 0 && rnd(this.seed, b.i * 7 + 1, Math.floor(now * 1.3)) < 0.03) b.r.peck();
      b.r.update(dt, camPos);
    }
  }

  dispose() { for (const b of this.bots) b.r.dispose(); this.bots = []; }
}
