// Edifici: dalle piante OSM/CTRN Regione Veneto a mesh low-poly distinte per tipo (casa veneta, villa, condominio,
// casa colonica, annesso agricolo, capannone, garage, baracca, tettoia, chiesa, campanile, serra, silos, rudere…).
import earcut from '../vendor/earcut.js';
import { pointInPoly, hash2 } from './data.js';
import { TILE, tileUV } from './textures.js';

const WALL_PALETTE = ['#efe3c8', '#f1d9a6', '#e9c99a', '#f4ead7', '#e8d2b8', '#f3cfa9', '#ead9c3', '#f6e6b4', '#dcc7a1', '#f0dccd', '#e5b98f', '#f2e2c0', '#e7cfae', '#f5dcc0', '#efd4b0', '#e9d6c6', '#f3c9a0', '#e6c3a8'];
const FARM_PALETTE = ['#d9c3a0', '#cfb995', '#d6b98c', '#c9b48f', '#e0caa4'];
const IND_PALETTE = ['#c9ccce', '#bfc3c0', '#d6d3cb', '#aeb5b8', '#cfc7b8', '#b9c2c9', '#d2c8b4'];
const ROOF_PALETTE = ['#b5553a', '#a84a32', '#c0643f', '#9e4a35', '#b86a48', '#a95a3d', '#b04e36'];

function lin(h) {
  if (!h) return null;
  if (h[0] !== '#') {
    const names = { white: '#f2f2f0', yellow: '#efd98a', red: '#b8553f', grey: '#a8a8a8', gray: '#a8a8a8', brown: '#8b6a4e', beige: '#e3d4b1', orange: '#e8a86a', pink: '#e9b9ad' };
    h = names[h.toLowerCase()];
    if (!h) return null;
  }
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  const n = parseInt(h.slice(1), 16);
  if (Number.isNaN(n)) return null;
  const f = (c) => Math.pow(c / 255, 2.2);
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
const P = (a) => a.map(lin);
const WALLS = P(WALL_PALETTE), FARMS = P(FARM_PALETTE), INDS = P(IND_PALETTE), ROOFS = P(ROOF_PALETTE);
const C = {
  white: [0.92, 0.92, 0.9], flat: lin('#8f8d88'), flatInd: lin('#9aa0a3'), brickTint: [1, 1, 1], stoneTint: [0.98, 0.97, 0.95],
  chimney: lin('#b7a48a'), chimneyBrick: lin('#9c5a3c'), cap: lin('#6e6a64'), rail: lin('#2b2b2b'), slab: lin('#d8d2c6'),
  pillar: lin('#c9c3b6'), wood: lin('#7a5a3a'), metal: lin('#b9bfc4'), metalRoof: lin('#8a9298'), bronze: lin('#6b4a1f'),
  clock: lin('#f2efe6'), umbrella: [lin('#c0392b'), lin('#f2f2f0'), lin('#1f4a2e'), lin('#e6b84a')], table: lin('#e8e6e0'), glassRoof: lin('#cfe6ea'),
};

function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; a += p[i] * p[j + 1] - p[j] * p[i + 1]; }
  return a / 2;
}
function reverseRing(p) { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); return r; }

// allarga il poligono (sporto di gronda)
function offsetRing(p, d) {
  const n = p.length / 2, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const ax = p[i * 2] - p[a * 2], az = p[i * 2 + 1] - p[a * 2 + 1];
    const bx = p[b * 2] - p[i * 2], bz = p[b * 2 + 1] - p[i * 2 + 1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    const n1x = az / la, n1z = -ax / la, n2x = bz / lb, n2z = -bx / lb;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = Math.max(0.5, mx * n1x + mz * n1z);
    out.push(p[i * 2] + (mx * d) / cos, p[i * 2 + 1] + (mz * d) / cos);
  }
  return out;
}

const RESID = new Set(['house', 'villa', 'apartments', 'farm', 'public', 'school', 'commercial', 'castle']);

export function prepareBuilding(b, terrain, idx) {
  let outer = b.p.slice();
  if (signedArea(outer) < 0) outer = reverseRing(outer);
  const holes = (b.hl || []).map((h) => (signedArea(h) > 0 ? reverseRing(h) : h.slice()));
  let minG = Infinity, maxG = -Infinity, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    const g = terrain.heightAt(outer[i], outer[i + 1]);
    minG = Math.min(minG, g); maxG = Math.max(maxG, g);
    minx = Math.min(minx, outer[i]); maxx = Math.max(maxx, outer[i]);
    minz = Math.min(minz, outer[i + 1]); maxz = Math.max(maxz, outer[i + 1]);
  }
  const ground = maxG - minG < 3 ? minG : (minG + maxG) / 2;
  const k = b.k;
  const base = minG - 0.6;
  const eave = ground + b.h;
  let best = null;
  for (let i = 0; i < outer.length; i += 2) {
    const j = (i + 2) % outer.length;
    const dx = outer[j] - outer[i], dz = outer[j + 1] - outer[i + 1];
    const L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L, vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let q = 0; q < outer.length; q += 2) {
      const u = outer[q] * ux + outer[q + 1] * uz, v = outer[q] * vx + outer[q + 1] * vz;
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

  let roof = b.r || 'h';
  if ((holes.length || outer.length > 60) && roof !== 'n') roof = 'f';
  const S = { house: 0.44, villa: 0.42, apartments: 0.4, farm: 0.46, barn: 0.42, industrial: 0.16, commercial: 0.3, garage: 0.22, shed: 0.26, canopy: 0.2, church: 0.58, chapel: 0.6, tower: 1.6, school: 0.36, public: 0.4, sport: 0.24, greenhouse: 0.55 };
  let s = S[k] ?? 0.42, maxRh = k === 'tower' ? 12 : 5.5;
  if (roof === 'p') { s = k === 'tower' ? 1.6 : 0.6; }
  if ((roof === 'g' || roof === 'h' || roof === 'p') && s * hw > maxRh) s = maxRh / hw;
  if (roof !== 'f' && roof !== 'n' && roof !== 'd' && hw < 0.8) roof = 'f';
  if (roof === 'f' || roof === 'n') s = 0;
  const cv = cx * vx + cz * vz, cu = cx * ux + cz * uz;
  const planes = [[-vx, -vz, hw + cv], [vx, vz, hw - cv], [-ux, -uz, hl + cu], [ux, uz, hl - cu]];
  const used = roof === 'g' ? [0, 1] : roof === 'h' || roof === 'p' ? [0, 1, 2, 3] : [];
  const r = hash2(idx, 17), r2 = hash2(idx, 29);
  let wall;
  if (b.c && lin(b.c)) wall = lin(b.c);
  else if (['industrial', 'commercial', 'garage', 'sport'].includes(k)) wall = INDS[Math.floor(r * INDS.length)];
  else if (k === 'farm') wall = FARMS[Math.floor(r * FARMS.length)];
  else if (k === 'church' || k === 'chapel' || k === 'castle') wall = C.stoneTint;
  else if (k === 'barn' || k === 'tower' || k === 'ruins') wall = C.brickTint;
  else if (k === 'shed') wall = [0.95, 0.95, 0.95];
  else wall = WALLS[Math.floor(r * WALLS.length)];
  const roofCol = roof === 'f' ? (['industrial', 'commercial', 'sport', 'garage'].includes(k) ? C.flatInd : C.flat)
    : k === 'industrial' || k === 'sport' ? C.metalRoof : k === 'shed' && r2 < 0.5 ? C.metalRoof : k === 'greenhouse' ? C.glassRoof : ROOFS[Math.floor(hash2(idx, 5) * ROOFS.length)];
  const solid = k !== 'canopy' && k !== 'ruins';
  const pitched = used.length > 0;
  const ov = pitched && (RESID.has(k) || k === 'barn' || k === 'church') ? 0.5 : pitched && k !== 'tower' ? 0.25 : 0;
  const shut = r2 < 0.45 ? 0 : r2 < 0.75 ? 1 : r2 < 0.9 ? 2 : 3;
  const rec = {
    i: idx, d: b, k, outer, holes, minx, maxx, minz, maxz, base, ground, eave, roof, s, planes, used,
    cx, cz, ux, uz, vx, vz, hl, hw, wall, roofCol, solid, ov, shut, lv: b.lv || 2,
    top: eave + (pitched ? s * hw : roof === 'd' ? hw * 0.6 : 0),
  };
  rec.ovRing = ov > 0 ? offsetRing(outer, ov) : null;
  if (ov > 0) { minx -= ov; maxx += ov; minz -= ov; maxz += ov; }
  rec.minx = minx; rec.maxx = maxx; rec.minz = minz; rec.maxz = maxz;
  return rec;
}

// quota del tetto (senza limite inferiore: usata anche per lo sporto)
export function roofYRaw(rec, x, z) {
  if (rec.roof === 'f' || rec.roof === 'n') return rec.eave;
  if (rec.roof === 'd') {
    const R = (rec.hw + rec.hl) / 2, d = Math.hypot(x - rec.cx, z - rec.cz);
    return rec.eave + rec.hw * 0.6 * Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
  }
  let m = Infinity;
  for (const i of rec.used) {
    const p = rec.planes[i];
    const d = p[0] * x + p[1] * z + p[2];
    if (d < m) m = d;
  }
  return rec.eave + rec.s * m;
}
export function roofY(rec, x, z) {
  const y = roofYRaw(rec, x, z);
  return y < rec.eave && rec.roof !== 'd' ? Math.max(y, rec.eave - rec.s * rec.ov) : y;
}

export function insideFootprint(rec, x, z) {
  if (x < rec.minx || x > rec.maxx || z < rec.minz || z > rec.maxz) return false;
  if (!pointInPoly(x, z, rec.outer)) return false;
  for (const h of rec.holes) if (pointInPoly(x, z, h)) return false;
  return true;
}
export function insideRoof(rec, x, z) {
  if (x < rec.minx || x > rec.maxx || z < rec.minz || z > rec.maxz) return false;
  return pointInPoly(x, z, rec.ovRing || rec.outer);
}

export function nearestEdge(rec, x, z) {
  let best = null;
  for (const p of [rec.outer, ...rec.holes]) {
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) { const L = Math.sqrt(L2); best = { x: qx, z: qz, d, nx: dz / L, nz: -dx / L }; }
    }
  }
  return best;
}

function clipHalf(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const px = poly[i], pz = poly[i + 1], qx = poly[j], qz = poly[j + 1];
    const gp = a * px + b * pz + c, gq = a * qx + b * qz + c;
    if (gp <= 0) out.push(px, pz);
    if ((gp < 0 && gq > 0) || (gp > 0 && gq < 0)) { const t = gp / (gp - gq); out.push(px + (qx - px) * t, pz + (qz - pz) * t); }
  }
  return out;
}

export class GeoBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, uvs, c) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const l = Math.hypot(gx, gy, gz);
    if (l < 1e-9) return;
    gx /= l; gy /= l; gz /= l;
    if (gx * nx + gy * ny + gz * nz < 0) {
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
  // quadrilatero verticale/qualsiasi: a,b,c,d in senso antiorario visto dalla normale
  quad(a, b, c, d, n, uv, col) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], n[0], n[1], n[2], [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], col);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], n[0], n[1], n[2], [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], col);
  }
  // parallelepipedo orientato (centro x,z; base y0; dimensioni; rotazione ang attorno a y)
  box(x, y0, z, w, h, d, ang, col, colTop) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c];
    const hw = w / 2, hd = d / 2;
    const v = [P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), P(-hw, h, -hd), P(hw, h, -hd), P(hw, h, hd), P(-hw, h, hd)];
    const z0 = [0, 0, 0, 0, 0, 0, 0, 0];
    const faces = [[0, 1, 5, 4, [-s * 0 - s, 0, -c]], [1, 2, 6, 5, [c, 0, -s]], [2, 3, 7, 6, [s, 0, c]], [3, 0, 4, 7, [-c, 0, s]], [4, 5, 6, 7, [0, 1, 0]], [3, 2, 1, 0, [0, -1, 0]]];
    for (const [a, b, cc, dd, n] of faces) {
      const nn = n.length === 3 ? n : [0, 1, 0];
      // normale esterna calcolata dal centro
      const mx = (v[a][0] + v[cc][0]) / 2 - x, my = (v[a][1] + v[cc][1]) / 2 - (y0 + h / 2), mz = (v[a][2] + v[cc][2]) / 2 - z;
      this.quad(v[a], v[b], v[cc], v[dd], [mx, my, mz], z0, nn === faces[4][4] && colTop ? colTop : col);
    }
  }
  get count() { return this.pos.length / 3; }
}

// ------------------------------------------------------------------------- scelta delle tessere di facciata
const WIN_LIT = [TILE.winGreen, TILE.winBrown, TILE.winGray, TILE.winPlain];
const WIN_DARK = [TILE.winGreenD, TILE.winBrownD, TILE.winGrayD, TILE.winPlainD];
function rnd3(a, b, c) { return hash2(a * 7 + c * 131, b * 13 + c * 17); }

function chooseTile(rec, f, j, nb, wall, rows) {
  const k = rec.k, r = rnd3(rec.i, wall.idx * 31 + j, f), lit = rnd3(rec.i + 3, wall.idx * 17 + j, f + 9) < 0.38;
  const win = () => (lit ? WIN_LIT : WIN_DARK)[rec.shut];
  const street = wall.street, doorBay = street && j === wall.doorBay;
  switch (k) {
    case 'house': case 'villa': case 'apartments': case 'farm': case 'castle': {
      if (wall.L < 2.2) return TILE.plaster;
      if (f === 0 && doorBay) return TILE.door;
      if (f === 0 && rec.d.shopfront && street) return TILE.shop;
      if (!street && r < 0.32) return TILE.plaster;
      if (r < 0.1) return TILE.plaster;
      if (k === 'villa' && f > 0) return lit ? TILE.villaArch : TILE.villaArchD;
      if (wall.balc && f > 0 && j % 2 === 1) return lit ? TILE.balcony : TILE.balconyD;
      return win();
    }
    case 'school': case 'public':
      if (f === 0 && doorBay) return TILE.door;
      return wall.L < 2.5 ? TILE.plaster : TILE.schoolBand;
    case 'commercial':
      if (f === 0) return doorBay ? TILE.door : TILE.shop;
      return TILE.panelBand;
    case 'barn':
      if (f === 0 && wall.long && r < 0.75) return TILE.brickArch;
      return r < 0.25 ? TILE.brickWin : TILE.brick;
    case 'industrial': case 'sport':
      if (f === rows - 1 && rows > 1) return TILE.panelBand;
      if (f === 0 && street && j % 3 === 1) return TILE.sectional;
      return TILE.panel;
    case 'garage':
      return street || wall.long ? TILE.garage : TILE.plaster;
    case 'shed':
      return rec.shedWood ? TILE.wood : TILE.metal;
    case 'greenhouse':
      return TILE.glass;
    case 'church': case 'chapel': {
      if (wall.front) {
        if (f === 0 && j === Math.floor(nb / 2)) return TILE.churchDoor;
        if (f === rows - 1 && j === Math.floor(nb / 2) && rows > 1) return TILE.rose;
        return TILE.stone;
      }
      return f >= rows - 2 && j % 2 === 1 ? TILE.stoneWin : TILE.stone;
    }
    case 'tower':
      return f === rows - 1 ? TILE.belfry : TILE.brick;
    case 'ruins':
      return TILE.stoneRuin;
    default:
      return win();
  }
}

function tintFor(rec, tile) {
  if ([TILE.brick, TILE.brickArch, TILE.brickWin, TILE.belfry, TILE.stone, TILE.stoneWin, TILE.rose, TILE.churchDoor, TILE.stoneRuin, TILE.wood, TILE.metal, TILE.glass].includes(tile)) return [1, 1, 1];
  return rec.wall;
}

// ------------------------------------------------------------------------- mesh dettagliata
// bufs: { walls, roofs, flat, detail, glass }
export function meshBuildingDetailed(rec, bufs, signs) {
  const k = rec.k;
  if (k === 'silo') return meshSilo(rec, bufs);
  if (k === 'canopy') return meshCanopy(rec, bufs);
  const glass = k === 'greenhouse';
  const W = glass ? bufs.glass : bufs.walls;
  const h = rec.eave - rec.ground;
  const rows = ['house', 'villa', 'apartments', 'farm', 'school', 'public', 'commercial', 'castle'].includes(k) ? Math.max(1, rec.lv) : k === 'tower' ? Math.max(3, Math.round(h / 4)) : Math.max(1, Math.round(h / (k === 'church' ? 4.5 : 3.6)));
  const fh = h / rows;
  const bayW = ['industrial', 'sport'].includes(k) ? 4.5 : k === 'church' ? 3.6 : 3;
  rec.shedWood = hash2(rec.i, 77) < 0.5;
  const door = rec.door;
  const rings = [rec.outer, ...rec.holes];
  let wallIdx = 0;
  // lato principale (facciata) = parete più vicina alla porta
  let streetEdge = null, bd = 1e9;
  if (door) {
    const p = rec.outer;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const mx = (p[i] + p[j]) / 2, mz = (p[i + 1] + p[j + 1]) / 2;
      const d = Math.hypot(mx - door.x, mz - door.z);
      const L = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]);
      if (L > 1.5 && d < bd) { bd = d; streetEdge = i; }
    }
  }
  const ruins = k === 'ruins';
  for (let ri = 0; ri < rings.length; ri++) {
    const p = rings[ri];
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
      const dx = bx - ax, dz = bz - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const nx = dz / L, nz = -dx / L, n = [nx, 0, nz];
      const street = ri === 0 && i === streetEdge;
      const wall = { idx: wallIdx++, L, street, long: L > rec.hl * 1.4, front: street, balc: (k === 'apartments' || (k === 'villa' && hash2(rec.i, 3) < 0.3)) && L > 7, doorBay: 0 };
      const nb = Math.max(1, Math.round(L / bayW));
      if (street && door) {
        const t = ((door.x - ax) * dx + (door.z - az) * dz) / (L * L);
        wall.doorBay = Math.max(0, Math.min(nb - 1, Math.floor(t * nb)));
      }
      const topH = ruins && ri === 0 ? ruinWallTops(rec)[i / 2] : rec.eave;
      const rws = ruins ? 1 : rows;
      const fhh = ruins ? topH - rec.ground : fh;
      // zoccolo (dalla base sotto terra fino al piano terra)
      const plinthCol = [rec.wall[0] * 0.72, rec.wall[1] * 0.72, rec.wall[2] * 0.72];
      if (rec.ground - rec.base > 0.05) {
        const uv = tileUV(TILE.plaster);
        W.quad([ax, rec.base, az], [bx, rec.base, bz], [bx, rec.ground, bz], [ax, rec.ground, az], n, [uv[0], uv[1], uv[2], uv[1], uv[2], uv[1] + 0.02, uv[0], uv[1] + 0.02], plinthCol);
      }
      // griglia di campate e piani
      for (let f = 0; f < rws; f++) {
        const y0 = rec.ground + f * fhh, y1 = y0 + fhh;
        for (let q = 0; q < nb; q++) {
          const t0 = q / nb, t1 = (q + 1) / nb;
          const tile = chooseTile(rec, f, q, nb, wall, rws);
          const [u0, v0, u1, v1] = tileUV(tile);
          W.quad([ax + dx * t0, y0, az + dz * t0], [ax + dx * t1, y0, az + dz * t1], [ax + dx * t1, y1, az + dz * t1], [ax + dx * t0, y1, az + dz * t0], n, [u0, v0, u1, v0, u1, v1, u0, v1], tintFor(rec, tile));
          // balconi
          if (wall.balc && f > 0 && q % 2 === 1 && !glass) {
            const mx = ax + dx * (t0 + t1) / 2, mz = az + dz * (t0 + t1) / 2;
            const ang = Math.atan2(dx, dz) + Math.PI / 2;
            const ox = mx + nx * 0.55, oz = mz + nz * 0.55;
            bufs.detail.box(ox, y0 - 0.05, oz, Math.min(2.6, (L / nb) * 0.85), 0.16, 1.1, ang, C.slab);
            bufs.detail.box(ox + nx * 0.52, y0 + 0.11, oz + nz * 0.52, Math.min(2.6, (L / nb) * 0.85), 0.95, 0.05, ang, C.rail);
          }
        }
      }
      if (ruins) continue;
      // timpani sopra la gronda
      const ts = [0, 1];
      const u = rec.used;
      for (let m = 0; m < u.length; m++) for (let o = m + 1; o < u.length; o++) {
        const A = rec.planes[u[m]], B = rec.planes[u[o]];
        const ga = (A[0] - B[0]) * ax + (A[1] - B[1]) * az + (A[2] - B[2]);
        const gb = (A[0] - B[0]) * bx + (A[1] - B[1]) * bz + (A[2] - B[2]);
        if (ga * gb < 0) ts.push(ga / (ga - gb));
      }
      ts.sort((a, b) => a - b);
      const pt = k === 'tower' ? TILE.brick : k === 'church' || k === 'chapel' ? TILE.stone : k === 'barn' ? TILE.brick : ['industrial', 'sport'].includes(k) ? TILE.panel : k === 'shed' ? (rec.shedWood ? TILE.wood : TILE.metal) : k === 'greenhouse' ? TILE.glass : TILE.plaster;
      const [pu0, pv0, pu1, pv1] = tileUV(pt);
      for (let q = 0; q + 1 < ts.length; q++) {
        const t0 = ts[q], t1 = ts[q + 1];
        if (t1 - t0 < 1e-4) continue;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        const y0 = roofY(rec, x0, z0), y1 = roofY(rec, x1, z1);
        if (y0 - rec.eave < 0.02 && y1 - rec.eave < 0.02) continue;
        const vh = (pv1 - pv0) / 3;
        W.quad([x0, rec.eave, z0], [x1, rec.eave, z1], [x1, y1, z1], [x0, y0, z0], n, [pu0, pv0, pu1, pv0, pu1, pv0 + vh * (y1 - rec.eave), pu0, pv0 + vh * (y0 - rec.eave)], tintFor(rec, pt));
      }
      // parapetto dei tetti piani
      if (rec.roof === 'f' && ['apartments', 'industrial', 'commercial', 'school', 'public', 'sport', 'castle'].includes(k)) {
        const ph = 0.6;
        bufs.flat.quad([ax, rec.eave, az], [bx, rec.eave, bz], [bx, rec.eave + ph, bz], [ax, rec.eave + ph, az], n, [0, 0, 0, 0, 0, 0, 0, 0], rec.wall);
        bufs.flat.quad([bx - nx * 0.2, rec.eave, bz - nz * 0.2], [ax - nx * 0.2, rec.eave, az - nz * 0.2], [ax - nx * 0.2, rec.eave + ph, az - nz * 0.2], [bx - nx * 0.2, rec.eave + ph, bz - nz * 0.2], [-nx, 0, -nz], [0, 0, 0, 0, 0, 0, 0, 0], rec.wall);
        bufs.flat.quad([ax, rec.eave + ph, az], [bx, rec.eave + ph, bz], [bx - nx * 0.2, rec.eave + ph, bz - nz * 0.2], [ax - nx * 0.2, rec.eave + ph, az - nz * 0.2], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], C.cap);
      }
      // insegna del negozio sulla facciata
      if (street && rec.d.sign && signs) {
        signs.push({ text: rec.d.sign, kind: rec.d.signT, x: (ax + bx) / 2 + nx * 0.08, z: (az + bz) / 2 + nz * 0.08, y: rec.ground + Math.min(fh, 3.6) * 0.93, w: Math.min(L * 0.85, 5), nx, nz, door: { x: door?.x, z: door?.z } });
      }
    }
  }
  if (ruins) return;
  meshRoof(rec, bufs, glass);
  if (k === 'tower') meshTowerExtras(rec, bufs);
  if (['house', 'villa', 'apartments', 'farm'].includes(k) && rec.used.length) meshChimneys(rec, bufs);
  if (rec.roof === 'f' && (k === 'industrial' || k === 'commercial') && rec.hw > 4) {
    // impianti sul tetto
    const n = 1 + Math.floor(hash2(rec.i, 41) * 3);
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n - 0.5;
      const x = rec.cx + rec.ux * rec.hl * t * 1.2, z = rec.cz + rec.uz * rec.hl * t * 1.2;
      if (insideFootprint(rec, x, z)) bufs.detail.box(x, rec.eave, z, 1.6, 1.0, 1.2, Math.atan2(rec.ux, rec.uz), C.metal);
    }
  }
  if (k === 'church' || k === 'chapel') {
    // croce sul colmo della facciata
    const fx = rec.cx + rec.ux * rec.hl, fz = rec.cz + rec.uz * rec.hl;
    const y = roofY(rec, rec.cx + rec.ux * (rec.hl - 0.3), rec.cz + rec.uz * (rec.hl - 0.3));
    bufs.detail.box(fx, y, fz, 0.15, 1.6, 0.15, 0, C.cap);
    bufs.detail.box(fx, y + 1.0, fz, 0.8, 0.15, 0.15, Math.atan2(rec.vx, rec.vz), C.cap);
  }
  if (rec.d.signT && ['bar', 'cafe', 'restaurant', 'ice_cream', 'pub'].includes(rec.d.signT) && door) meshTerrace(rec, bufs);
}

function meshRoof(rec, bufs, glass) {
  const B = rec.roof === 'f' ? bufs.flat : glass ? bufs.glass : bufs.roofs;
  const rc = rec.roofCol;
  const addPoly = (poly, holeRings, plane) => {
    if (poly.length < 6) return;
    const data = poly.slice();
    const holeIdx = [];
    for (const h of holeRings || []) { holeIdx.push(data.length / 2); data.push(...h); }
    const tris = earcut(data, holeIdx, 2);
    // UV lungo la falda (coppi)
    let gu = [1, 0], gv = [0, 1];
    if (plane) { gv = [plane[0], plane[1]]; gu = [-plane[1], plane[0]]; }
    const uvf = (x, z) => [(x * gu[0] + z * gu[1]) * 0.5, (x * gv[0] + z * gv[1]) * 0.36];
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 2, b = tris[t + 1] * 2, c = tris[t + 2] * 2;
      const ax = data[a], az = data[a + 1], bx = data[b], bz = data[b + 1], cx = data[c], cz = data[c + 1];
      const ay = roofYRaw(rec, ax, az) + 0.02, by = roofYRaw(rec, bx, bz) + 0.02, cy = roofYRaw(rec, cx, cz) + 0.02;
      const A = uvf(ax, az), Bv = uvf(bx, bz), Cv = uvf(cx, cz);
      B.tri(ax, ay, az, bx, by, bz, cx, cy, cz, 0, 1, 0, [A[0], A[1], Bv[0], Bv[1], Cv[0], Cv[1]], rc);
      // intradosso dello sporto
      if (rec.ov > 0 && !glass) bufs.detail.tri(ax, ay - 0.1, az, bx, by - 0.1, bz, cx, cy - 0.1, cz, 0, -1, 0, [0, 0, 0, 0, 0, 0], [0.55, 0.45, 0.38]);
    }
  };
  const ring = rec.ovRing || rec.outer;
  if (rec.roof === 'f') { addPoly(rec.outer, rec.holes); return; }
  for (const i of rec.used) {
    let poly = ring;
    for (const j of rec.used) {
      if (j === i) continue;
      const A = rec.planes[i], Bp = rec.planes[j];
      poly = clipHalf(poly, A[0] - Bp[0], A[1] - Bp[1], A[2] - Bp[2]);
      if (poly.length < 6) break;
    }
    addPoly(poly, null, rec.planes[i]);
  }
}

export function chimneySpots(rec) {
  if (!['house', 'villa', 'apartments', 'farm'].includes(rec.k) || !rec.used.length) return [];
  const out = [];
  const n = rec.k === 'apartments' ? 2 + Math.floor(hash2(rec.i, 9) * 2) : hash2(rec.i, 9) < 0.78 ? 1 : 0;
  for (let q = 0; q < n; q++) {
    const t = n === 1 ? (hash2(rec.i, 11) - 0.5) * 0.9 : (q / (n - 1) - 0.5) * 1.1;
    const side = hash2(rec.i, 13 + q) < 0.5 ? -1 : 1;
    const x = rec.cx + rec.ux * rec.hl * t + rec.vx * rec.hw * 0.3 * side;
    const z = rec.cz + rec.uz * rec.hl * t + rec.vz * rec.hw * 0.3 * side;
    if (!insideFootprint(rec, x, z)) continue;
    out.push({ x, z, y: roofY(rec, x, z), top: rec.top + 0.9 });
  }
  return out;
}
function meshChimneys(rec, bufs) {
  const ang = Math.atan2(rec.ux, rec.uz);
  const col = hash2(rec.i, 15) < 0.5 ? C.chimneyBrick : rec.wall;
  for (const c of chimneySpots(rec)) {
    bufs.detail.box(c.x, c.y - 0.4, c.z, 0.55, c.top - c.y + 0.4, 0.55, ang, col);
    bufs.detail.box(c.x, c.top, c.z, 0.8, 0.12, 0.8, ang, C.cap);
    bufs.detail.box(c.x, c.top + 0.12, c.z, 0.3, 0.35, 0.3, ang, C.cap);
  }
}
export function canopyPillars(rec) {
  const p = rec.outer, out = [];
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    const L = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]);
    const n = Math.max(1, Math.round(L / 4.5));
    for (let q = 0; q < n; q++) { const t = q / n; out.push([p[i] + (p[j] - p[i]) * t, p[i + 1] + (p[j + 1] - p[i + 1]) * t]); }
  }
  return out;
}
export function terraceSpots(rec) {
  const d = rec.door;
  if (!d || !rec.d.signT || !['bar', 'cafe', 'restaurant', 'ice_cream', 'pub'].includes(rec.d.signT)) return [];
  const tx = -d.nz, tz = d.nx, out = [];
  for (let q = -1; q <= 1; q++) out.push({ x: d.x + d.nx * 2.6 + tx * q * 2.6, z: d.z + d.nz * 2.6 + tz * q * 2.6, y: rec.ground, q });
  return out;
}
export function ruinWallTops(rec) {
  const p = rec.outer, out = [];
  const h = rec.eave - rec.ground;
  for (let e = 0; e < p.length / 2; e++) out.push(rec.ground + h * (0.35 + 0.65 * hash2(rec.i, e + 1)));
  return out;
}

function meshTowerExtras(rec, bufs) {
  // orologio sui quattro lati e campana nella cella
  const h = rec.eave - rec.ground;
  const rows = Math.max(3, Math.round(h / 4));
  const fh = h / rows;
  const yc = rec.ground + fh * (rows - 1) - fh * 0.45;
  for (const [ax, az] of [[rec.ux, rec.uz], [-rec.ux, -rec.uz], [rec.vx, rec.vz], [-rec.vx, -rec.vz]]) {
    const ext = ax === rec.ux || ax === -rec.ux ? rec.hl : rec.hw;
    const x = rec.cx + ax * (ext + 0.06), z = rec.cz + az * (ext + 0.06);
    bufs.detail.box(x, yc - 0.7, z, 1.4, 1.4, 0.08, Math.atan2(ax, az), C.clock);
    bufs.detail.box(x + ax * 0.05, yc - 0.05, z + az * 0.05, 0.08, 0.6, 0.04, Math.atan2(ax, az), C.rail);
  }
  bufs.detail.box(rec.cx, rec.eave - fh * 0.85, rec.cz, Math.min(1.4, rec.hw), Math.min(1.4, rec.hw * 1.1), Math.min(1.4, rec.hw), 0, C.bronze);
  // croce in cima
  bufs.detail.box(rec.cx, rec.top, rec.cz, 0.12, 1.4, 0.12, 0, C.cap);
  bufs.detail.box(rec.cx, rec.top + 0.9, rec.cz, 0.7, 0.12, 0.12, Math.atan2(rec.vx, rec.vz), C.cap);
}

function meshTerrace(rec, bufs) {
  for (const { x, z, y, q } of terraceSpots(rec)) {
    bufs.detail.box(x, y, z, 0.07, 2.4, 0.07, 0, C.rail);
    bufs.detail.box(x, y + 0.72, z, 0.8, 0.04, 0.8, 0, C.table);
    const col = C.umbrella[Math.floor(hash2(rec.i, 50 + q) * 4)];
    const R = 1.25, y1 = y + 2.4;
    for (let s = 0; s < 8; s++) {
      const a0 = (s / 8) * Math.PI * 2, a1 = ((s + 1) / 8) * Math.PI * 2;
      bufs.detail.tri(x, y1 + 0.35, z, x + Math.cos(a0) * R, y1, z + Math.sin(a0) * R, x + Math.cos(a1) * R, y1, z + Math.sin(a1) * R, 0, 1, 0, [0, 0, 0, 0, 0, 0], col);
      bufs.detail.tri(x, y1 + 0.33, z, x + Math.cos(a1) * R, y1 - 0.02, z + Math.sin(a1) * R, x + Math.cos(a0) * R, y1 - 0.02, z + Math.sin(a0) * R, 0, -1, 0, [0, 0, 0, 0, 0, 0], col);
    }
  }
}

function meshCanopy(rec, bufs) {
  const pc = hash2(rec.i, 3) < 0.5 ? C.pillar : C.wood;
  for (const [x, z] of canopyPillars(rec)) bufs.detail.box(x, rec.base, z, 0.25, roofY(rec, x, z) - rec.base, 0.25, 0, pc);
  meshRoof(rec, bufs, false);
  // intradosso visibile da sotto
  const tris = earcut(rec.outer, null, 2);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 2, b = tris[t + 1] * 2, c = tris[t + 2] * 2;
    const P2 = (q) => [rec.outer[q], roofYRaw(rec, rec.outer[q], rec.outer[q + 1]) - 0.12, rec.outer[q + 1]];
    const A = P2(a), B = P2(b), Cc = P2(c);
    bufs.detail.tri(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2], 0, -1, 0, [0, 0, 0, 0, 0, 0], [0.42, 0.36, 0.3]);
  }
}

function meshSilo(rec, bufs) {
  const R = Math.max(1.2, (rec.hw + rec.hl) / 2), seg = 14;
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
    const x0 = rec.cx + Math.cos(a0) * R, z0 = rec.cz + Math.sin(a0) * R, x1 = rec.cx + Math.cos(a1) * R, z1 = rec.cz + Math.sin(a1) * R;
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
    const col = s % 2 ? C.metal : [C.metal[0] * 0.92, C.metal[1] * 0.92, C.metal[2] * 0.92];
    bufs.detail.quad([x0, rec.base, z0], [x1, rec.base, z1], [x1, rec.eave, z1], [x0, rec.eave, z0], [nx, 0, nz], [0, 0, 0, 0, 0, 0, 0, 0], col);
    bufs.detail.tri(x0, rec.eave, z0, x1, rec.eave, z1, rec.cx, rec.top, rec.cz, nx, 1, nz, [0, 0, 0, 0, 0, 0], C.metalRoof);
  }
}

// ------------------------------------------------------------------------- mesh semplificata (LOD lontano)
export function meshBuildingSimple(rec, bufs) {
  const k = rec.k;
  const dim = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const wc = ['brick', 'tower', 'barn', 'ruins'].includes(k) || k === 'barn' || k === 'tower' ? lin('#a8653f') : k === 'church' || k === 'chapel' ? lin('#d6ccb8') : dim(rec.wall, 0.82);
  if (k === 'canopy') { meshRoofSimple(rec, bufs); return; }
  if (k === 'silo') { bufs.simple.box(rec.cx, rec.base, rec.cz, rec.hw * 1.8, rec.eave - rec.base, rec.hw * 1.8, Math.atan2(rec.ux, rec.uz), C.metal); return; }
  const p = rec.outer;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const n = [(bz - az) / L, 0, -(bx - ax) / L];
    const y0 = k === 'ruins' ? rec.eave * 0.5 + rec.ground * 0.5 : roofY(rec, ax, az), y1 = k === 'ruins' ? y0 : roofY(rec, bx, bz);
    bufs.simple.quad([ax, rec.base, az], [bx, rec.base, bz], [bx, y1, bz], [ax, y0, az], n, [0, 0, 0, 0, 0, 0, 0, 0], wc);
  }
  if (k !== 'ruins') meshRoofSimple(rec, bufs);
}
function meshRoofSimple(rec, bufs) {
  const tmp = { walls: bufs.simple, roofs: bufs.simple, flat: bufs.simple, detail: { tri() {} }, glass: bufs.simple };
  const save = rec.ovRing;
  rec.ovRing = null;
  const ov = rec.ov;
  rec.ov = 0;
  meshRoof(rec, tmp, false);
  rec.ovRing = save;
  rec.ov = ov;
}

export function shopSign(rec) { return rec.d.sign; }
