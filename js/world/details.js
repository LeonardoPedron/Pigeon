// Dettagli reali da OpenStreetMap: recinzioni, muri, muri di contenimento, siepi, guardrail, linee elettriche
// (tralicci, pali, fili su cui posarsi), strisce pedonali, stop, fermate bus, capitelli votivi, panchine,
// fontane, cestini, piscine, segnaletica orizzontale e filari 3D dei vigneti.
import * as THREE from 'three';
import earcut from '../vendor/earcut.js';
import { GeoBuf } from './buildings.js';
import { hash2 } from './data.js';
import { ROAD_WIDTH, longestEdgeAngle } from './textures.js';

const CH = 250;
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const COL = {
  fenceMetal: lin('#3f4a3f'), fenceWood: lin('#7a5a3a'), wall: lin('#d8cdb8'), wallStone: lin('#b9b0a0'), cap: lin('#9a9488'),
  retaining: lin('#9a9a94'), hedge: lin('#3f6b32'), guard: lin('#b9bec2'), tower: lin('#7d8388'), pole: lin('#a7a59e'),
  stripe: lin('#f2f2ee'), stop: lin('#c0262d'), white: lin('#f0f0ee'), signBlue: lin('#1f4fa0'), yellow: lin('#e6b400'),
  shrine: lin('#e2d6bf'), shrineRoof: lin('#a8503a'), niche: lin('#2a2420'), wood: lin('#7a5532'), stone: lin('#bdb3a2'),
  water: lin('#3d8fc4'), poolEdge: lin('#e9e6dc'), bin: lin('#2f5a33'), red: lin('#b8252a'), vine: lin('#4f7a2e'), post: lin('#6b5a44'),
  dash: lin('#ececdf'),
};

export class Details {
  constructor(world, scene) {
    this.w = world;
    this.data = world.data;
    this.T = world.terrain;
    this.col = world.col;
    this.scene = scene;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.markMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.vineyards = [];
    this.vineBuilt = new Map();
  }

  buf(x, z, mark) {
    const k = (mark ? 'm' : '') + Math.floor(x / CH) + ',' + Math.floor(z / CH);
    if (!this.chunks.has(k)) this.chunks.set(k, { b: new GeoBuf(), mark, c: [(Math.floor(x / CH) + 0.5) * CH, (Math.floor(z / CH) + 0.5) * CH] });
    return this.chunks.get(k).b;
  }

  build() {
    const d = this.data;
    for (const b of d.barriers || []) this.barrier(b);
    this.powerLines(d.power || { lines: [], supports: [] });
    this.roadIndex();
    for (const f of d.furniture || []) this.furniture(f);
    for (const p of d.pools || []) this.pool(p);
    this.markings();
    for (const [, c] of this.chunks) {
      if (!c.b.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.b.col, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, c.mark ? this.markMat : this.mat);
      m.castShadow = !c.mark;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.userData.c = c.c;
      this.group.add(m);
      c.mesh = m;
    }
    this.vineyards = d.areas.filter((a) => a.c === 'vineyard').map((a) => {
      let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      for (let i = 0; i < a.p.length; i += 2) { mnx = Math.min(mnx, a.p[i]); mxx = Math.max(mxx, a.p[i]); mnz = Math.min(mnz, a.p[i + 1]); mxz = Math.max(mxz, a.p[i + 1]); }
      return { a, c: [(mnx + mxx) / 2, (mnz + mxz) / 2], r: Math.hypot(mxx - mnx, mxz - mnz) / 2 };
    });
    // linee dei fili elettrici
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(this.wirePos, 3));
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x222222 }));
    this.wires.frustumCulled = false;
    this.group.add(this.wires);
  }

  // ------------------------------------------------------------------ recinzioni e muri
  barrier(b) {
    const p = b.p, T = this.T;
    const kind = b.t;
    const H = b.h || { fence: 1.3, wall: 1.9, retaining_wall: 1.1, hedge: 1.5, guard_rail: 0.75 }[kind] || 1.3;
    const th = { fence: 0.06, wall: 0.3, retaining_wall: 0.4, hedge: 0.8, guard_rail: 0.1 }[kind] || 0.2;
    const r = hash2(Math.round(p[0]), Math.round(p[1]));
    const color = kind === 'hedge' ? COL.hedge : kind === 'retaining_wall' ? COL.retaining : kind === 'guard_rail' ? COL.guard : kind === 'wall' ? (r < 0.5 ? COL.wall : COL.wallStone) : r < 0.6 ? COL.fenceMetal : COL.fenceWood;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const ya = T.heightAt(ax, az), yb = T.heightAt(bx, bz);
      const ang = Math.atan2(bx - ax, bz - az);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const B = this.buf(mx, mz);
      const n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const y0 = ya + (yb - ya) * t0, y1 = yb * t1 + ya * (1 - t1);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = Math.min(y0, y1) - 0.3;
        const len = L / n;
        if (kind === 'fence') {
          B.box(x0, cy, z0, 0.07, H + 0.3 + Math.abs(y1 - y0), 0.07, ang, color);
          for (const hh of [0.35, H - 0.1]) B.box(cx, Math.min(y0, y1) + hh, cz, 0.03, 0.05, len, ang, color);
          if (color === COL.fenceMetal) for (let q = 1; q < 6; q++) { const t = q / 6; B.box(x0 + (x1 - x0) * t, Math.min(y0, y1), z0 + (z1 - z0) * t, 0.02, H, 0.02, ang, color); }
        } else if (kind === 'guard_rail') {
          B.box(x0, cy, z0, 0.1, H + 0.3, 0.1, ang, COL.cap);
          B.box(cx, Math.min(y0, y1) + H - 0.35, cz, th, 0.3, len, ang, color);
        } else {
          B.box(cx, cy, cz, th, H + 0.3 + Math.abs(y1 - y0), len + 0.02, ang, color, kind === 'wall' ? COL.cap : color);
        }
      }
      this.col.addSeg(ax, az, bx, bz, ya - 0.3, ya + H, yb - 0.3, yb + H, Math.max(th, 0.1), kind === 'hedge' ? 'hedge' : kind === 'fence' ? 'fence' : 'wall');
    }
  }

  // ------------------------------------------------------------------ linee elettriche
  powerLines(pw) {
    this.wirePos = [];
    const T = this.T;
    const sup = new Map();
    for (let i = 0; i < pw.supports.length; i += 3) sup.set(pw.supports[i] + ',' + pw.supports[i + 1], pw.supports[i + 2]);
    const built = new Set();
    for (const line of pw.lines) {
      const p = line.p, big = !!line.big;
      const hTop = big ? 24 : 9;
      const offs = big ? [-3.2, 0, 3.2] : [-0.7, 0, 0.7];
      const yArm = big ? [21, 25, 21] : [8.4, 8.9, 8.4];
      let prev = null;
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i], z = p[i + 1];
        const y = T.heightAt(x, z);
        // direzione media della linea per orientare le mensole
        const a = p[Math.max(0, i - 2)], b = p[Math.max(1, i - 1)], c = p[Math.min(p.length - 2, i + 2)], dd = p[Math.min(p.length - 1, i + 3)];
        const ang = Math.atan2(c - a, dd - b);
        const nx = Math.cos(ang), nz = -Math.sin(ang);
        const k = x + ',' + z;
        if (!built.has(k)) {
          built.add(k);
          const B = this.buf(x, z);
          if (big) {
            // traliccio a traliccio stilizzato: quattro montanti inclinati + mensole
            for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
              for (let q = 0; q < 6; q++) {
                const t0 = q / 6, t1 = (q + 1) / 6;
                const w0 = 2.2 * (1 - t0) + 0.6 * t0, w1 = 2.2 * (1 - t1) + 0.6 * t1;
                const px0 = x + sx * w0 * Math.cos(ang) + sz * w0 * Math.sin(ang), pz0 = z - sx * w0 * Math.sin(ang) + sz * w0 * Math.cos(ang);
                const px1 = x + sx * w1 * Math.cos(ang) + sz * w1 * Math.sin(ang), pz1 = z - sx * w1 * Math.sin(ang) + sz * w1 * Math.cos(ang);
                B.box((px0 + px1) / 2, y + t0 * hTop, (pz0 + pz1) / 2, 0.14, hTop / 6 + 0.1, 0.14, 0, COL.tower);
              }
            }
            for (let q = 1; q < 6; q++) B.box(x, y + (q * hTop) / 6, z, 2.2 * (1 - q / 6) * 2 + 0.6, 0.08, 0.08, ang + Math.PI / 2, COL.tower);
            B.box(x, y + 21, z, 0.15, 0.2, 7.2, ang + Math.PI / 2, COL.tower);
            B.box(x, y + 25, z, 0.15, 0.2, 2.4, ang + Math.PI / 2, COL.tower);
            this.col.addCyl(x, z, 1.4, y, y + hTop + 1, true, 'pylon');
          } else {
            B.box(x, y - 0.5, z, 0.22, hTop + 0.5, 0.22, ang, COL.pole);
            B.box(x, y + 8.3, z, 0.1, 0.12, 1.8, ang + Math.PI / 2, COL.pole);
            this.col.addCyl(x, z, 0.14, y, y + hTop, true, 'pole');
          }
        }
        const cur = offs.map((o, q) => [x + nx * o, y + yArm[q], z + nz * o]);
        if (prev) {
          for (let q = 0; q < cur.length; q++) {
            const A = prev[q], Bp = cur[q];
            const L = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]);
            const sag = Math.min(4, L * L * 0.00012 + 0.3);
            const segs = 10;
            for (let s = 0; s < segs; s++) {
              const t0 = s / segs, t1 = (s + 1) / segs;
              const yy = (t) => A[1] + (Bp[1] - A[1]) * t - sag * 4 * t * (1 - t);
              this.wirePos.push(A[0] + (Bp[0] - A[0]) * t0, yy(t0), A[2] + (Bp[2] - A[2]) * t0, A[0] + (Bp[0] - A[0]) * t1, yy(t1), A[2] + (Bp[2] - A[2]) * t1);
            }
            this.col.addWire(A[0], A[1], A[2], Bp[0], Bp[1], Bp[2], sag);
          }
        }
        prev = cur;
      }
    }
  }

  // ------------------------------------------------------------------ indice strade per orientare segnali e strisce
  roadIndex() {
    const d = this.data, N = d.roadNodes;
    this.segGrid = new Map();
    for (const r of d.roads) {
      if (r.tu) continue;
      for (let k = 0; k + 1 < r.i.length; k++) {
        const a = r.i[k], b = r.i[k + 1];
        const s = { ax: N[a * 2], az: N[a * 2 + 1], bx: N[b * 2], bz: N[b * 2 + 1], r };
        const gx = Math.floor((s.ax + s.bx) / 2 / 30), gz = Math.floor((s.az + s.bz) / 2 / 30);
        const key = gx + ',' + gz;
        if (!this.segGrid.has(key)) this.segGrid.set(key, []);
        this.segGrid.get(key).push(s);
      }
    }
  }
  nearestRoad(x, z) {
    let best = null, bd = 40;
    const gx = Math.floor(x / 30), gz = Math.floor(z / 30);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const s of this.segGrid.get(gx + dx + ',' + (gz + dz)) || []) {
        const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz || 1;
        let t = ((x - s.ax) * vx + (z - s.az) * vz) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = s.ax + vx * t, qz = s.az + vz * t, d = Math.hypot(x - qx, z - qz);
        if (d < bd) { bd = d; best = { s, d, qx, qz, ang: Math.atan2(vx, vz), w: s.r.w || ROAD_WIDTH[s.r.t] || 4 }; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ arredo urbano
  furniture(f) {
    const T = this.T, x = f.x, z = f.z, y = T.heightAt(x, z);
    const B = this.buf(x, z);
    const rd = this.nearestRoad(x, z);
    const face = rd ? Math.atan2(rd.qx - x, rd.qz - z) : 0;
    switch (f.t) {
      case 'crossing': {
        if (!rd || rd.d > 3) break;
        const M = this.buf(x, z, true);
        const w = rd.w, ang = rd.ang;
        const ux = Math.sin(ang), uz = Math.cos(ang), px = Math.cos(ang), pz = -Math.sin(ang);
        const n = Math.max(3, Math.floor(w / 1.0));
        for (let q = 0; q < n; q++) {
          const o = -w / 2 + (q + 0.5) * (w / n);
          const cx = rd.qx + px * o, cz = rd.qz + pz * o;
          const cy = T.heightAt(cx, cz) + 0.21;
          const hl = 1.5, hw = 0.25;
          const P = (a, b) => [cx + ux * a + px * b, cy, cz + uz * a + pz * b];
          M.quad(P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw), [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], COL.stripe);
        }
        break;
      }
      case 'stop': case 'giveway': {
        const sx = x + (rd ? Math.cos(rd.ang) * (rd.w / 2 + 0.8) * 0 : 0);
        B.box(sx, y, z, 0.06, 2.2, 0.06, 0, COL.pole);
        if (f.t === 'stop') {
          for (let s = 0; s < 8; s++) {
            const a0 = (s / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((s + 1) / 8) * Math.PI * 2 + Math.PI / 8;
            const ca = Math.cos(face), sa = Math.sin(face);
            const pt = (a) => [sx + Math.cos(a) * 0.32 * ca, y + 2.15 + Math.sin(a) * 0.32, z - Math.cos(a) * 0.32 * sa];
            const p0 = pt(a0), p1 = pt(a1);
            B.tri(sx, y + 2.15, z, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], Math.sin(face), 0, Math.cos(face), [0, 0, 0, 0, 0, 0], COL.stop);
            B.tri(sx, y + 2.15, z, p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], -Math.sin(face), 0, -Math.cos(face), [0, 0, 0, 0, 0, 0], COL.stop);
          }
        } else {
          const ca = Math.cos(face), sa = Math.sin(face);
          const P = (u, v) => [sx + u * ca, y + 2.0 + v, z - u * sa];
          const a = P(0, -0.35), b = P(0.38, 0.3), c = P(-0.38, 0.3);
          B.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], Math.sin(face), 0, Math.cos(face), [0, 0, 0, 0, 0, 0], COL.white);
          B.tri(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], -Math.sin(face), 0, -Math.cos(face), [0, 0, 0, 0, 0, 0], COL.stop);
        }
        this.col.addCyl(sx, z, 0.05, y, y + 2.5, true, 'sign');
        break;
      }
      case 'bus': {
        B.box(x, y, z, 0.07, 2.6, 0.07, 0, COL.pole);
        B.box(x, y + 2.2, z, 0.04, 0.45, 0.45, face, COL.signBlue);
        B.box(x + Math.sin(face + Math.PI / 2) * 1.2, y, z + Math.cos(face + Math.PI / 2) * 1.2, 1.6, 0.45, 0.4, face + Math.PI / 2, COL.wood);
        this.col.addCyl(x, z, 0.05, y, y + 2.65, true, 'sign');
        break;
      }
      case 'shrine': {
        // capitello votivo veneto
        B.box(x, y - 0.2, z, 0.9, 2.4, 0.9, face, COL.shrine);
        B.box(x + Math.sin(face) * 0.42, y + 1.2, z + Math.cos(face) * 0.42, 0.5, 0.7, 0.05, face, COL.niche);
        for (let s = 0; s < 4; s++) {
          const a0 = face + (s / 4) * Math.PI * 2 + Math.PI / 4, a1 = face + ((s + 1) / 4) * Math.PI * 2 + Math.PI / 4;
          const R = 0.8;
          B.tri(x, y + 2.9, z, x + Math.sin(a0) * R, y + 2.2, z + Math.cos(a0) * R, x + Math.sin(a1) * R, y + 2.2, z + Math.cos(a1) * R, 0, 1, 0, [0, 0, 0, 0, 0, 0], COL.shrineRoof);
        }
        this.col.addCyl(x, z, 0.5, y, y + 2.85, true, 'shrine');
        break;
      }
      case 'cross':
        B.box(x, y, z, 0.15, 2.6, 0.15, face, COL.wood);
        B.box(x, y + 1.9, z, 1.1, 0.13, 0.13, face + Math.PI / 2, COL.wood);
        this.col.addCyl(x, z, 0.08, y, y + 2.6, true, 'cross');
        break;
      case 'bench':
        B.box(x, y + 0.42, z, 1.6, 0.06, 0.45, face + Math.PI / 2, COL.wood);
        B.box(x - Math.sin(face) * 0.2, y + 0.45, z - Math.cos(face) * 0.2, 1.6, 0.45, 0.06, face + Math.PI / 2, COL.wood);
        for (const s of [-0.7, 0.7]) B.box(x + Math.cos(face) * s, y, z - Math.sin(face) * s, 0.08, 0.42, 0.4, face, COL.fenceMetal);
        this.col.addDisc(x, z, 0.5, y + 0.48, 'bench');
        break;
      case 'fountain':
        B.box(x, y, z, 1.4, 0.6, 1.4, face, COL.stone);
        B.box(x, y + 0.55, z, 1.2, 0.04, 1.2, face, COL.water);
        B.box(x, y + 0.55, z, 0.2, 1.0, 0.2, face, COL.stone);
        this.col.addCyl(x, z, 0.7, y, y + 0.6, true, 'fountain');
        break;
      case 'bin': B.box(x, y, z, 0.4, 0.9, 0.4, face, COL.bin); this.col.addCyl(x, z, 0.22, y, y + 0.9, true, 'bin'); break;
      case 'postbox': B.box(x, y, z, 0.08, 1.0, 0.08, 0, COL.pole); B.box(x, y + 1.0, z, 0.4, 0.5, 0.3, face, COL.red); this.col.addCyl(x, z, 0.22, y, y + 1.5, true, 'postbox'); break;
      case 'recycling': for (let q = -1; q <= 1; q++) B.box(x + Math.cos(face) * q * 1.3, y, z - Math.sin(face) * q * 1.3, 1.2, 1.4, 1.2, face, [COL.bin, COL.yellow, COL.signBlue][q + 1]); this.col.addCyl(x, z, 1.9, y, y + 1.4, true, 'bins'); break;
      case 'picnic': B.box(x, y + 0.72, z, 1.8, 0.06, 0.8, face, COL.wood); for (const s of [-0.6, 0.6]) B.box(x + Math.sin(face) * s, y + 0.42, z + Math.cos(face) * s, 1.8, 0.05, 0.3, face, COL.wood); this.col.addDisc(x, z, 0.6, y + 0.75, 'table'); break;
      case 'playground': B.box(x - 1.2, y, z, 0.1, 2.3, 0.1, 0, COL.signBlue); B.box(x + 1.2, y, z, 0.1, 2.3, 0.1, 0, COL.signBlue); B.box(x, y + 2.25, z, 2.5, 0.1, 0.1, 0, COL.signBlue); B.box(x, y + 0.5, z, 0.5, 0.05, 0.25, 0, COL.red); break;
      case 'mast': B.box(x, y, z, 0.5, 30, 0.5, 0, COL.tower); this.col.addCyl(x, z, 0.3, y, y + 30, true, 'mast'); break;
      case 'gate': break;
      default: break;
    }
  }

  pool(p) {
    const T = this.T;
    const [cx, cz] = [p.reduce((s, v, i) => (i % 2 ? s : s + v), 0) / (p.length / 2), p.reduce((s, v, i) => (i % 2 ? s + v : s), 0) / (p.length / 2)];
    const y = T.heightAt(cx, cz) + 0.08;
    const M = this.buf(cx, cz, true);
    const tris = earcut(p, null, 2);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 2, b = tris[t + 1] * 2, c = tris[t + 2] * 2;
      M.tri(p[a], y, p[a + 1], p[b], y, p[b + 1], p[c], y, p[c + 1], 0, 1, 0, [0, 0, 0, 0, 0, 0], COL.water);
    }
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const B = this.buf(cx, cz);
      const L = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]);
      B.box((p[i] + p[j]) / 2, y - 0.2, (p[i + 1] + p[j + 1]) / 2, 0.35, 0.3, L + 0.35, Math.atan2(p[j] - p[i], p[j + 1] - p[i + 1]), COL.poolEdge);
    }
  }

  // ------------------------------------------------------------------ segnaletica orizzontale
  markings() {
    const d = this.data, N = d.roadNodes, T = this.T;
    for (const r of d.roads) {
      if (r.tu || r.b) continue;
      const w = r.w || ROAD_WIDTH[r.t] || 4;
      const main = ['primary', 'secondary', 'tertiary'].includes(r.t);
      if (!(main || (w >= 5.5 && ['unclassified', 'residential'].includes(r.t)))) continue;
      if (r.s && !['asphalt', 'paved', 'concrete'].includes(r.s)) continue;
      let acc = 0;
      for (let k = 0; k + 1 < r.i.length; k++) {
        const ax = N[r.i[k] * 2], az = N[r.i[k] * 2 + 1], bx = N[r.i[k + 1] * 2], bz = N[r.i[k + 1] * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, px = -uz, pz = ux;
        const strip = (o, t0, t1, hw) => {
          const x0 = ax + ux * t0 + px * o, z0 = az + uz * t0 + pz * o, x1 = ax + ux * t1 + px * o, z1 = az + uz * t1 + pz * o;
          const y0 = T.heightAt(x0, z0) + 0.2, y1 = T.heightAt(x1, z1) + 0.2;
          const M = this.buf((x0 + x1) / 2, (z0 + z1) / 2, true);
          M.quad([x0 - px * hw, y0, z0 - pz * hw], [x1 - px * hw, y1, z1 - pz * hw], [x1 + px * hw, y1, z1 + pz * hw], [x0 + px * hw, y0, z0 + pz * hw], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], COL.dash);
        };
        // mezzeria tratteggiata 3 m ogni 7,5 m
        let t = (7.5 - (acc % 7.5)) % 7.5;
        while (t < L) { strip(0, t, Math.min(L, t + 3), 0.07); t += 7.5; }
        if (main) for (let t0 = 0; t0 < L; t0 += 6) { strip(w / 2 - 0.25, t0, Math.min(L, t0 + 6), 0.06); strip(-(w / 2 - 0.25), t0, Math.min(L, t0 + 6), 0.06); }
        acc += L;
      }
    }
  }

  // ------------------------------------------------------------------ vigneti 3D (filari) vicino al piccione
  buildVineyard(v) {
    const p = v.a.p, T = this.T;
    const ang = longestEdgeAngle(p);
    const ux = Math.cos(ang), uz = Math.sin(ang), px = -uz, pz = ux;
    const B = new GeoBuf();
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < p.length; i += 2) { const o = (p[i] - v.c[0]) * px + (p[i + 1] - v.c[1]) * pz; mn = Math.min(mn, o); mx = Math.max(mx, o); }
    const segs = [];
    for (let o = mn + 1.3; o < mx; o += 2.6) {
      // intersezioni della retta del filare con il poligono
      const xs = [];
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        const oa = (p[i] - v.c[0]) * px + (p[i + 1] - v.c[1]) * pz, ob = (p[j] - v.c[0]) * px + (p[j + 1] - v.c[1]) * pz;
        if ((oa - o) * (ob - o) < 0) {
          const t = (o - oa) / (ob - oa);
          const x = p[i] + (p[j] - p[i]) * t, z = p[i + 1] + (p[j + 1] - p[i + 1]) * t;
          xs.push((x - v.c[0]) * ux + (z - v.c[1]) * uz);
        }
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) segs.push([o, xs[q] + 0.8, xs[q + 1] - 0.8]);
    }
    if (segs.length > 400) segs.length = 400;
    for (const [o, s0, s1] of segs) {
      if (s1 - s0 < 2) continue;
      const n = Math.max(1, Math.ceil((s1 - s0) / 6));
      for (let k = 0; k < n; k++) {
        const t0 = s0 + ((s1 - s0) * k) / n, t1 = s0 + ((s1 - s0) * (k + 1)) / n;
        const x0 = v.c[0] + ux * t0 + px * o, z0 = v.c[1] + uz * t0 + pz * o, x1 = v.c[0] + ux * t1 + px * o, z1 = v.c[1] + uz * t1 + pz * o;
        const y0 = T.heightAt(x0, z0), y1 = T.heightAt(x1, z1);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = Math.min(y0, y1);
        B.box(cx, cy + 0.5, cz, 0.45, 1.1 + Math.abs(y1 - y0), t1 - t0, Math.atan2(ux, uz), COL.vine);
        B.box(x0, cy - 0.2, z0, 0.07, 1.9, 0.07, 0, COL.post);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    this.group.add(m);
    return m;
  }

  update(pos, viewDist) {
    for (const [, c] of this.chunks) {
      if (!c.mesh) continue;
      const d = Math.hypot(c.c[0] - pos.x, c.c[1] - pos.z);
      c.mesh.visible = d < Math.min(viewDist, c.mark ? 600 : 900);
    }
    // vigneti: costruisci entro 220 m, libera oltre 450 m (al massimo 1 per frame)
    let budget = 1;
    for (const v of this.vineyards) {
      const d = Math.hypot(v.c[0] - pos.x, v.c[1] - pos.z) - v.r;
      const m = this.vineBuilt.get(v);
      if (d < 220 && !m && budget-- > 0) this.vineBuilt.set(v, this.buildVineyard(v));
      else if (m && d > 450) { this.group.remove(m); m.geometry.dispose(); this.vineBuilt.delete(v); }
    }
  }
}
