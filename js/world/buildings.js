// Edifici: dalle piante OSM a mesh low-poly con tetti a padiglione/capanna/piani e collisioni.
import earcut from '../vendor/earcut.js';
import { pointInPoly, hash2 } from './data.js';

const WALL_PALETTE = ['#efe3c8', '#f1d9a6', '#e9c99a', '#f4ead7', '#e8d2b8', '#f3cfa9', '#ead9c3', '#f6e6b4', '#dcc7a1', '#f0dccd', '#e5b98f', '#f2e2c0', '#e7cfae', '#f5dcc0'];
const IND_PALETTE = ['#c9ccce', '#bfc3c0', '#d6d3cb', '#aeb5b8', '#cfc7b8'];
const ROOF_PALETTE = ['#b5553a', '#a84a32', '#c0643f', '#9e4a35', '#b86a48', '#a95a3d'];

function hexToRgb(h) {
  if (!h) return null;
  if (h[0] !== '#') {
    const names = { white: '#f2f2f0', yellow: '#efd98a', red: '#b8553f', grey: '#a8a8a8', gray: '#a8a8a8', brown: '#8b6a4e', beige: '#e3d4b1', orange: '#e8a86a', pink: '#e9b9ad' };
    h = names[h.toLowerCase()];
    if (!h) return null;
  }
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  const n = parseInt(h.slice(1), 16);
  if (Number.isNaN(n)) return null;
  // in lineare (i colori dei vertici sono in spazio lineare)
  const f = (c) => Math.pow(c / 255, 2.2);
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
const PAL = (arr) => arr.map(hexToRgb);
const WALLS = PAL(WALL_PALETTE), INDS = PAL(IND_PALETTE), ROOFS = PAL(ROOF_PALETTE);
const FLATROOF = hexToRgb('#8f8d88'), CHURCH = hexToRgb('#e6dccb'), TOWER = hexToRgb('#d8c9ac'), BARN = hexToRgb('#c9a47c'), GREEN = hexToRgb('#d9ecef'), RUIN = hexToRgb('#a89f90');

function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return a / 2;
}
function reverseRing(p) {
  const r = [];
  for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]);
  return r;
}

export function prepareBuilding(b, terrain, idx) {
  let outer = b.p.slice();
  if (signedArea(outer) < 0) outer = reverseRing(outer);
  let holes = (b.hl || []).map((h) => (signedArea(h) > 0 ? reverseRing(h) : h.slice()));
  let minG = Infinity, maxG = -Infinity, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    const g = terrain.heightAt(outer[i], outer[i + 1]);
    minG = Math.min(minG, g); maxG = Math.max(maxG, g);
    minx = Math.min(minx, outer[i]); maxx = Math.max(maxx, outer[i]);
    minz = Math.min(minz, outer[i + 1]); maxz = Math.max(maxz, outer[i + 1]);
  }
  const ground = maxG - minG < 3 ? minG : (minG + maxG) / 2;
  const base = minG - 0.5;
  const eave = ground + b.h;
  // rettangolo orientato di area minima
  let best = null;
  for (let i = 0; i < outer.length; i += 2) {
    const j = (i + 2) % outer.length;
    const dx = outer[j] - outer[i], dz = outer[j + 1] - outer[i + 1];
    const L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L, vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < outer.length; k += 2) {
      const u = outer[k] * ux + outer[k + 1] * uz, v = outer[k] * vx + outer[k + 1] * vz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, vx, vz, u0, u1, v0, v1 };
  }
  if (!best) best = { ux: 1, uz: 0, vx: 0, vz: 1, u0: minx, u1: maxx, v0: minz, v1: maxz };
  let { ux, uz, vx, vz } = best;
  let hl = (best.u1 - best.u0) / 2, hw = (best.v1 - best.v0) / 2;
  const um = (best.u0 + best.u1) / 2, vm = (best.v0 + best.v1) / 2;
  const cx = um * ux + vm * vx, cz = um * uz + vm * vz;
  if (hw > hl) { [ux, uz, vx, vz] = [vx, vz, -ux, -uz]; [hl, hw] = [hw, hl]; }

  let roof = b.r; // f g h p
  if (holes.length || outer.length > 60) roof = 'f';
  let s = 0, maxRh = 5.5;
  if (roof === 'p' || b.k === 'tower') { roof = 'p'; s = 1.5; maxRh = 12; }
  else if (roof === 'g') s = b.k === 'church' || b.k === 'chapel' ? 0.58 : b.k === 'shed' || b.k === 'garage' ? 0.28 : 0.5;
  else if (roof === 'h') s = 0.46;
  if (roof !== 'f' && s * hw > maxRh) s = maxRh / hw;
  if (roof !== 'f' && hw < 0.8) roof = 'f';
  const cv = cx * vx + cz * vz, cu = cx * ux + cz * uz;
  const planes = [
    [-vx, -vz, hw + cv],
    [vx, vz, hw - cv],
    [-ux, -uz, hl + cu],
    [ux, uz, hl - cu],
  ];
  const used = roof === 'g' ? [0, 1] : roof === 'f' ? [] : [0, 1, 2, 3];

  const r = hash2(idx, 17);
  let wall;
  const k = b.k;
  if (b.c && hexToRgb(b.c)) wall = hexToRgb(b.c);
  else if (k === 'industrial' || k === 'commercial' || k === 'garage') wall = INDS[Math.floor(r * INDS.length)];
  else if (k === 'church' || k === 'chapel') wall = CHURCH;
  else if (k === 'tower' || k === 'castle') wall = TOWER;
  else if (k === 'barn' || k === 'farm') wall = r < 0.5 ? BARN : WALLS[Math.floor(r * WALLS.length)];
  else if (k === 'greenhouse') wall = GREEN;
  else if (k === 'ruins') wall = RUIN;
  else wall = WALLS[Math.floor(r * WALLS.length)];
  const roofCol = roof === 'f' ? (k === 'greenhouse' ? GREEN : FLATROOF) : ROOFS[Math.floor(hash2(idx, 5) * ROOFS.length)];
  return {
    i: idx, d: b, outer, holes, minx, maxx, minz, maxz, base, ground, eave, roof, s, planes, used,
    cx, cz, ux, uz, vx, vz, hl, hw, wall, roofCol,
    ind: k === 'industrial' || k === 'commercial' || k === 'greenhouse' || k === 'garage',
    top: eave + (roof === 'f' ? 0 : s * hw),
  };
}

export function roofY(rec, x, z) {
  if (rec.roof === 'f') return rec.eave;
  let m = Infinity;
  for (const i of rec.used) {
    const p = rec.planes[i];
    const d = p[0] * x + p[1] * z + p[2];
    if (d < m) m = d;
  }
  return rec.eave + rec.s * Math.max(0, m);
}

export function insideFootprint(rec, x, z) {
  if (x < rec.minx || x > rec.maxx || z < rec.minz || z > rec.maxz) return false;
  if (!pointInPoly(x, z, rec.outer)) return false;
  for (const h of rec.holes) if (pointInPoly(x, z, h)) return false;
  return true;
}

// punto più vicino sul perimetro + normale verso l'esterno
export function nearestEdge(rec, x, z) {
  let best = null;
  const rings = [rec.outer, ...rec.holes];
  for (const p of rings) {
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) {
        const L = Math.sqrt(L2);
        best = { x: qx, z: qz, d, nx: dz / L, nz: -dx / L };
      }
    }
  }
  return best;
}

// Sutherland-Hodgman: mantiene la parte con g(x,z) = a*x + b*z + c <= 0
function clipHalf(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const px = poly[i], pz = poly[i + 1], qx = poly[j], qz = poly[j + 1];
    const gp = a * px + b * pz + c, gq = a * qx + b * qz + c;
    if (gp <= 0) out.push(px, pz);
    if ((gp < 0 && gq > 0) || (gp > 0 && gq < 0)) {
      const t = gp / (gp - gq);
      out.push(px + (qx - px) * t, pz + (qz - pz) * t);
    }
  }
  return out;
}

// Buffer di geometria (non indicizzata, normali piatte)
export class GeoBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, uvs, c) {
    // normale geometrica
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const l = Math.hypot(gx, gy, gz);
    if (l < 1e-9) return;
    gx /= l; gy /= l; gz /= l;
    if (gx * nx + gy * ny + gz * nz < 0) {
      // inverti ordine
      this.pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);
      this.uv.push(uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]);
      gx = -gx; gy = -gy; gz = -gz;
    } else {
      this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      this.uv.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]);
    }
    this.nor.push(gx, gy, gz, gx, gy, gz, gx, gy, gz);
    this.col.push(c[0], c[1], c[2], c[0], c[1], c[2], c[0], c[1], c[2]);
  }
  get count() { return this.pos.length / 3; }
}

export function meshBuilding(rec, walls, roofs) {
  const wallScale = rec.ind ? 1 / 8 : 1 / 12;
  const rings = [rec.outer, ...rec.holes];
  const c = rec.wall;
  // pareti
  for (const p of rings) {
    let acc = 0;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
      const dx = bx - ax, dz = bz - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const nx = dz / L, nz = -dx / L;
      const ts = [0, 1];
      const u = rec.used;
      for (let m = 0; m < u.length; m++) for (let n = m + 1; n < u.length; n++) {
        const P = rec.planes[u[m]], Q = rec.planes[u[n]];
        const ga = (P[0] - Q[0]) * ax + (P[1] - Q[1]) * az + (P[2] - Q[2]);
        const gb = (P[0] - Q[0]) * bx + (P[1] - Q[1]) * bz + (P[2] - Q[2]);
        if (ga * gb < 0) ts.push(ga / (ga - gb));
      }
      ts.sort((x, y) => x - y);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1];
        if (t1 - t0 < 1e-4) continue;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        const y0 = roofY(rec, x0, z0), y1 = roofY(rec, x1, z1);
        const u0 = (acc + L * t0) * wallScale, u1 = (acc + L * t1) * wallScale;
        const b = rec.base;
        const vb = 0, v0 = (y0 - b) * wallScale, v1 = (y1 - b) * wallScale;
        walls.tri(x0, b, z0, x1, b, z1, x1, y1, z1, nx, 0, nz, [u0, vb, u1, vb, u1, v1], c);
        walls.tri(x0, b, z0, x1, y1, z1, x0, y0, z0, nx, 0, nz, [u0, vb, u1, v1, u0, v0], c);
      }
      acc += L;
    }
  }
  // tetto
  const rc = rec.roofCol;
  const ruv = (x, z) => [(x * rec.ux + z * rec.uz) * 0.5, (x * rec.vx + z * rec.vz) * 0.5];
  const addPoly = (poly, holeRings) => {
    if (poly.length < 6) return;
    const data = poly.slice();
    const holeIdx = [];
    for (const h of holeRings || []) { holeIdx.push(data.length / 2); data.push(...h); }
    const tris = earcut(data, holeIdx, 2);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 2, b = tris[t + 1] * 2, cc = tris[t + 2] * 2;
      const ax = data[a], az = data[a + 1], bx = data[b], bz = data[b + 1], cx = data[cc], cz = data[cc + 1];
      const ay = roofY(rec, ax, az) + 0.02, by = roofY(rec, bx, bz) + 0.02, cy = roofY(rec, cx, cz) + 0.02;
      const A = ruv(ax, az), B = ruv(bx, bz), C = ruv(cx, cz);
      roofs.tri(ax, ay, az, bx, by, bz, cx, cy, cz, 0, 1, 0, [A[0], A[1], B[0], B[1], C[0], C[1]], rc);
    }
  };
  if (rec.roof === 'f') {
    addPoly(rec.outer, rec.holes);
  } else {
    for (const i of rec.used) {
      let poly = rec.outer;
      for (const j of rec.used) {
        if (j === i) continue;
        const P = rec.planes[i], Q = rec.planes[j];
        poly = clipHalf(poly, P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]);
        if (poly.length < 6) break;
      }
      addPoly(poly);
    }
  }
}
