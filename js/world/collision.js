// Collisioni unificate: edifici (volumi, tetti con sporto, tettoie), terreno, muri/recinzioni (segmenti),
// pali/tronchi/pilastri (cilindri), appoggi (dischi), fili elettrici (catenarie), chiome degli alberi,
// più persone e auto (dinamici). Usate da piccione, camera, bisogni e NPC.
import { roofY, insideFootprint, insideRoof, nearestEdge } from './buildings.js';

const CELL = 8;
const key = (gx, gz) => gx * 100003 + gz;

export class Collision {
  constructor(world) {
    this.w = world;
    this.T = world.terrain;
    this.cells = new Map();
    this.dynamic = null; // (x,z,r) => { people:[], cars:[] }
    this.treeChunks = new Set();
  }

  _add(o, x0, z0, x1, z1) {
    const gx0 = Math.floor(Math.min(x0, x1) / CELL), gx1 = Math.floor(Math.max(x0, x1) / CELL);
    const gz0 = Math.floor(Math.min(z0, z1) / CELL), gz1 = Math.floor(Math.max(z0, z1) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const k = key(gx, gz);
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(o);
    }
  }
  // segmento verticale (muro, recinzione, siepe): spessore th, da y0 a y1 (quote assolute agli estremi)
  addSeg(ax, az, bx, bz, ya0, ya1, yb0, yb1, th, kind = 'wall') {
    const o = { t: 's', ax, az, bx, bz, ya0, ya1, yb0, yb1, th, kind };
    this._add(o, ax - th, az - th, bx + th, bz + th);
    return o;
  }
  addCyl(x, z, r, y0, y1, perch = true, kind = 'pole') {
    const o = { t: 'c', x, z, r, y0, y1, perch, kind };
    this._add(o, x - r, z - r, x + r, z + r);
    return o;
  }
  addDisc(x, z, r, y, kind = 'perch') {
    const o = { t: 'd', x, z, r, y, kind };
    this._add(o, x - r, z - r, x + r, z + r);
    return o;
  }
  // filo: estremi e freccia (abbassamento al centro)
  addWire(ax, ay, az, bx, by, bz, sag) {
    const o = { t: 'w', ax, ay, az, bx, by, bz, sag, kind: 'wire' };
    this._add(o, ax, az, bx, bz);
    return o;
  }
  addCrown(x, z, cy, R, top, kind = 'tree') {
    const o = { t: 'r', x, z, cy, R, top, kind };
    this._add(o, x - R, z - R, x + R, z + R);
    return o;
  }

  near(x, z, r = 1) {
    const out = [];
    const gx0 = Math.floor((x - r) / CELL), gx1 = Math.floor((x + r) / CELL), gz0 = Math.floor((z - r) / CELL), gz1 = Math.floor((z + r) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const a = this.cells.get(key(gx, gz));
      if (a) for (const o of a) out.push(o);
    }
    return out;
  }

  ensureTrees(x, z) {
    const CH = 250;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = cx + dx + ',' + (cz + dz);
      if (this.treeChunks.has(k)) continue;
      this.treeChunks.add(k);
      const arr = this.w.treesForChunk(cx + dx, cz + dz);
      for (let i = 0; i < arr.length; i += 7) {
        const tx = arr[i], ty = arr[i + 1], tz = arr[i + 2], type = arr[i + 3], s = arr[i + 4], sy = s * (0.9 + arr[i + 6] * 0.3);
        if (type === 0) {
          this.addCyl(tx, tz, 0.22 * s, ty - 1, ty + 3.2 * sy, false, 'trunk');
          this.addCrown(tx, tz, ty + 4.6 * sy, 2.6 * s, ty + 4.6 * sy + 2.9 * sy, 'tree');
        } else {
          this.addCyl(tx, tz, 0.5 * s, ty - 1, ty + 8 * sy, false, 'trunk');
          this.addDisc(tx, tz, 0.45 * s, ty + 9.6 * sy, 'cypress');
        }
      }
    }
  }

  wireY(o, x, z) {
    const dx = o.bx - o.ax, dz = o.bz - o.az;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - o.ax) * dx + (z - o.az) * dz) / L2;
    if (t < 0 || t > 1) return null;
    const qx = o.ax + dx * t, qz = o.az + dz * t;
    if (Math.hypot(x - qx, z - qz) > 0.14) return null;
    return o.ay + (o.by - o.ay) * t - o.sag * 4 * t * (1 - t);
  }

  segDist(o, x, z) {
    const dx = o.bx - o.ax, dz = o.bz - o.az;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - o.ax) * dx + (z - o.az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = o.ax + dx * t, qz = o.az + dz * t;
    return { d: Math.hypot(x - qx, z - qz), t, qx, qz, y0: o.ya0 + (o.yb0 - o.ya0) * t, y1: o.ya1 + (o.yb1 - o.ya1) * t };
  }

  // superficie calpestabile più alta con quota <= y + step
  groundAt(x, z, y, step = 0.45) {
    let best = this.T.heightAt(x, z), kind = 'ground', ref = null;
    const lim = y + step;
    for (const rec of this.w.buildingsNear(x, z, 1)) {
      if (rec.k === 'ruins') continue;
      if (!insideRoof(rec, x, z)) continue;
      const ry = roofY(rec, x, z);
      if (ry <= lim && ry > best) { best = ry; kind = 'roof'; ref = rec; }
    }
    for (const o of this.near(x, z, 0.5)) {
      let top = null;
      if (o.t === 's') { const s = this.segDist(o, x, z); if (s.d < o.th / 2 + 0.06) top = s.y1; }
      else if (o.t === 'c') { if (o.perch && Math.hypot(x - o.x, z - o.z) < o.r + 0.06) top = o.y1; }
      else if (o.t === 'd') { if (Math.hypot(x - o.x, z - o.z) < o.r) top = o.y; }
      else if (o.t === 'w') top = this.wireY(o, x, z);
      else if (o.t === 'r') { const d = Math.hypot(x - o.x, z - o.z); if (d < o.R * 0.8) top = o.cy + Math.sqrt(o.R * o.R - d * d) * ((o.top - o.cy) / o.R); }
      if (top !== null && top <= lim && top > best) { best = top; kind = o.kind; ref = o; }
    }
    if (this.dynamic) {
      const dyn = this.dynamic(x, z, 3);
      for (const c of dyn.cars) {
        const l = this.carLocal(c, x, z);
        if (Math.abs(l.a) < 2 && Math.abs(l.b) < 0.88) { const top = c.y + (Math.abs(l.a + 0.2) < 1.05 ? 1.5 : 0.94); if (top <= lim && top > best) { best = top; kind = 'car'; ref = c; } }
      }
      for (const a of dyn.people) {
        if (Math.hypot(x - a.x, z - a.z) < 0.13 * a.scale) { const top = a.y + 1.85 * a.scale; if (top <= lim && top > best) { best = top; kind = 'head'; ref = a; } }
      }
    }
    return { y: best, kind, ref };
  }

  // soffitto (intradosso di tettoie e sporti) sopra y
  ceilingAt(x, z, y) {
    let c = Infinity;
    for (const rec of this.w.buildingsNear(x, z, 1)) {
      if (rec.k === 'ruins' || !insideRoof(rec, x, z)) continue;
      const ry = roofY(rec, x, z);
      if (rec.solid && insideFootprint(rec, x, z)) continue;
      if (ry - 0.15 > y && ry - 0.15 < c) c = ry - 0.15;
    }
    return c;
  }

  carLocal(c, x, z) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const dx = x - c.x, dz = z - c.z;
    return { a: dx * fx + dz * fz, b: dx * fz - dz * fx, fx, fz };
  }

  // spinge fuori un cilindro (raggio r, da y a y+h) da tutti gli ostacoli; ritorna la normale dell'ultimo urto
  resolve(p, r, h) {
    let hit = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const rec of this.w.buildingsNear(p.x, p.z, r + 1)) {
        if (!rec.solid) continue;
        if (p.y + h < rec.base) continue;
        const inside = insideFootprint(rec, p.x, p.z);
        const e = nearestEdge(rec, p.x, p.z);
        if (!e) continue;
        const wallTop = roofY(rec, e.x - e.nx * 0.05, e.z - e.nz * 0.05);
        if (inside) {
          const ry = roofY(rec, p.x, p.z);
          if (p.y >= ry - 0.05) continue; // sopra il tetto
          p.x = e.x + e.nx * (r + 0.01); p.z = e.z + e.nz * (r + 0.01);
          hit = { nx: e.nx, nz: e.nz, kind: 'wall', ref: rec }; moved = true;
        } else if (e.d < r && p.y < wallTop - 0.05) {
          const push = r - e.d + 0.005;
          p.x += e.nx * push; p.z += e.nz * push;
          hit = { nx: e.nx, nz: e.nz, kind: 'wall', ref: rec }; moved = true;
        }
      }
      for (const o of this.near(p.x, p.z, r + 0.5)) {
        if (o.t === 's') {
          const s = this.segDist(o, p.x, p.z);
          const lim = o.th / 2 + r;
          if (s.d < lim && p.y < s.y1 - 0.03 && p.y + h > s.y0) {
            let nx = p.x - s.qx, nz = p.z - s.qz;
            const l = Math.hypot(nx, nz);
            if (l < 1e-6) { nx = -(o.bz - o.az); nz = o.bx - o.ax; }
            const ll = Math.hypot(nx, nz) || 1;
            nx /= ll; nz /= ll;
            p.x = s.qx + nx * (lim + 0.005); p.z = s.qz + nz * (lim + 0.005);
            hit = { nx, nz, kind: o.kind }; moved = true;
          }
        } else if (o.t === 'c') {
          const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), lim = o.r + r;
          if (d < lim && p.y < o.y1 - 0.03 && p.y + h > o.y0) {
            const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
            p.x = o.x + nx * (lim + 0.005); p.z = o.z + nz * (lim + 0.005);
            hit = { nx, nz, kind: o.kind }; moved = true;
          }
        }
      }
      if (this.dynamic) {
        const dyn = this.dynamic(p.x, p.z, 4);
        for (const c of dyn.cars) {
          if (p.y > c.y + 1.48 || p.y + h < c.y) continue;
          const l = this.carLocal(c, p.x, p.z);
          const ea = 2.0 + r, eb = 0.88 + r;
          if (Math.abs(l.a) < ea && Math.abs(l.b) < eb) {
            const pa = ea - Math.abs(l.a), pb = eb - Math.abs(l.b);
            if (pa < pb) { const s = Math.sign(l.a) || 1; p.x += l.fx * pa * s; p.z += l.fz * pa * s; hit = { nx: l.fx * s, nz: l.fz * s, kind: 'car', ref: c }; }
            else { const s = Math.sign(l.b) || 1; p.x += l.fz * pb * s; p.z += -l.fx * pb * s; hit = { nx: l.fz * s, nz: -l.fx * s, kind: 'car', ref: c }; }
            moved = true;
          }
        }
        for (const a of dyn.people) {
          const top = a.y + 1.85 * a.scale;
          if (p.y >= top - 0.05 || p.y + h < a.y) continue;
          const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz), lim = 0.24 * a.scale + r;
          if (d < lim) {
            const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
            p.x = a.x + nx * (lim + 0.005); p.z = a.z + nz * (lim + 0.005);
            hit = { nx, nz, kind: 'person', ref: a }; moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  // il punto è dentro qualcosa di solido?
  solidAt(x, y, z) {
    if (y < this.T.heightAt(x, z) - 0.05) return { kind: 'ground' };
    for (const rec of this.w.buildingsNear(x, z, 0.5)) {
      if (rec.k === 'ruins') continue;
      if (rec.solid && insideFootprint(rec, x, z) && y > rec.base && y < roofY(rec, x, z)) return { kind: 'building', ref: rec };
      if (insideRoof(rec, x, z)) { const ry = roofY(rec, x, z); if (y < ry && y > ry - 0.18) return { kind: 'roof', ref: rec }; }
    }
    for (const o of this.near(x, z, 0.3)) {
      if (o.t === 's') { const s = this.segDist(o, x, z); if (s.d < o.th / 2 && y < s.y1 && y > s.y0) return { kind: o.kind }; }
      else if (o.t === 'c') { if (Math.hypot(x - o.x, z - o.z) < o.r && y < o.y1 && y > o.y0) return { kind: o.kind }; }
    }
    return null;
  }

  // primo punto solido lungo il segmento a->b (frazione 0..1) oppure 1
  raycast(a, b, step = 0.12) {
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(2, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.solidAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)) return (i - 1) / n;
    }
    return 1;
  }
}
