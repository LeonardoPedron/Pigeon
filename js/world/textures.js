// Texture procedurali (canvas): facciate con finestre e scuri veneti, coppi, terreno/mappa.
import * as THREE from 'three';
import { mulberry32 } from './data.js';

export const LAND_COLORS = {
  base: '#9daa60', farmland: '#a9b46a', grass: '#8db35b', forest: '#4b7536', scrub: '#6c8b44', vineyard: '#93a253',
  orchard: '#87a553', residential: '#aaa78a', industrial: '#a6a39a', cemetery: '#98a888', paved: '#b9b3a6',
  pitch: '#6aa548', water: '#5b8db3', rock: '#a29a8a', farmyard: '#b0a77e',
};
export const CLASS_ID = { base: 0, farmland: 1, grass: 2, forest: 3, scrub: 4, vineyard: 5, orchard: 6, residential: 7, industrial: 8, cemetery: 9, paved: 10, pitch: 11, water: 12, rock: 13, farmyard: 14, road: 20, building: 21 };
const ROAD_COLORS = { primary: '#595a5e', secondary: '#5d5e62', tertiary: '#626366', residential: '#68696b', unclassified: '#6c6b69', living_street: '#707070', service: '#76746f', pedestrian: '#a49f94', track: '#a88f6c', path: '#b9a682', footway: '#b5aa94', cycleway: '#8f7f70', steps: '#a0a0a0', bridleway: '#a88f6c', trunk: '#555', motorway: '#555' };
export const ROAD_WIDTH = { motorway: 10, trunk: 8, primary: 7, secondary: 6.5, tertiary: 6, residential: 5, unclassified: 4.5, living_street: 4.5, service: 3.5, track: 3, pedestrian: 4, footway: 1.6, path: 1.4, cycleway: 2, steps: 1.6, bridleway: 1.6 };
export const ROAD_COLOR = ROAD_COLORS;

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// Rasterizza aree, acqua, strade ed edifici su un canvas che fa da texture al terreno e da base per le mappe.
export function buildLandCanvas(world, size) {
  const t = world.terrain;
  const W = t.x1 - t.x0, H = t.z1 - t.z0;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const sx = size / W, sz = size / H;
  const tx = (x) => (x - t.x0) * sx, tz = (z) => (z - t.z0) * sz;
  const poly = (ctx, p) => {
    ctx.moveTo(tx(p[0]), tz(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(tx(p[i]), tz(p[i + 1]));
    ctx.closePath();
  };
  // classi a bassa risoluzione per la vegetazione
  const CS = 2048;
  const cc = document.createElement('canvas');
  cc.width = cc.height = CS;
  const cg = cc.getContext('2d', { willReadFrequently: true });
  cg.imageSmoothingEnabled = false;
  const csx = CS / W, csz = CS / H;
  const ctx2 = (x) => (x - t.x0) * csx, ctz2 = (z) => (z - t.z0) * csz;
  const cpoly = (p) => {
    cg.moveTo(ctx2(p[0]), ctz2(p[1]));
    for (let i = 2; i < p.length; i += 2) cg.lineTo(ctx2(p[i]), ctz2(p[i + 1]));
    cg.closePath();
  };
  const classColor = (id) => `rgb(${id},0,0)`;

  const rnd = mulberry32(12345);
  g.fillStyle = LAND_COLORS.base;
  g.fillRect(0, 0, size, size);
  // patchwork di campi fuori dai dati (colline e pianura generica)
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size, w = (20 + rnd() * 60) * sx * 2, h = (20 + rnd() * 80) * sz * 2;
    g.fillStyle = shade(LAND_COLORS.base, 0.92 + rnd() * 0.16);
    g.fillRect(x, y, w, h);
  }
  cg.fillStyle = classColor(0);
  cg.fillRect(0, 0, CS, CS);

  for (let k = 0; k < world.areas.length; k++) {
    const a = world.areas[k];
    let col = LAND_COLORS[a.c] || LAND_COLORS.base;
    const r = mulberry32(k * 7919 + 3)();
    if (a.c === 'farmland') col = ['#b9b56c', '#a7b763', '#c2b47a', '#9db35e', '#b0a85e', '#c9c08a'][Math.floor(r * 6)];
    else col = shade(col, 0.93 + r * 0.12);
    g.beginPath();
    poly(g, a.p);
    if (a.h) for (const h of a.h) poly(g, h);
    g.fillStyle = col;
    g.fill('evenodd');
    if (a.c === 'vineyard' || a.c === 'orchard') {
      g.save();
      g.clip('evenodd');
      g.strokeStyle = shade(col, 0.75);
      g.lineWidth = Math.max(1, 0.9 * sx);
      g.beginPath();
      const ang = r * Math.PI;
      const step = (a.c === 'vineyard' ? 2.6 : 5) * sx;
      let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      for (let i = 0; i < a.p.length; i += 2) {
        mnx = Math.min(mnx, tx(a.p[i])); mxx = Math.max(mxx, tx(a.p[i]));
        mnz = Math.min(mnz, tz(a.p[i + 1])); mxz = Math.max(mxz, tz(a.p[i + 1]));
      }
      const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2, R = Math.hypot(mxx - mnx, mxz - mnz) / 2 + 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let d = -R; d <= R; d += Math.max(step, 1.2)) {
        g.moveTo(cx + ca * -R - sa * d, cz + sa * -R + ca * d);
        g.lineTo(cx + ca * R - sa * d, cz + sa * R + ca * d);
      }
      g.stroke();
      g.restore();
    }
    cg.beginPath();
    cpoly(a.p);
    if (a.h) for (const h of a.h) cpoly(h);
    cg.fillStyle = classColor(CLASS_ID[a.c] ?? 0);
    cg.fill('evenodd');
  }
  // corsi d'acqua
  g.lineCap = cg.lineCap = 'round';
  g.lineJoin = cg.lineJoin = 'round';
  for (const w of world.waterways) {
    const wd = { river: 12, canal: 6, stream: 3, ditch: 1.6, drain: 1.6 }[w.t] || 2;
    g.strokeStyle = LAND_COLORS.water;
    g.lineWidth = Math.max(1, wd * sx);
    g.beginPath();
    g.moveTo(tx(w.p[0]), tz(w.p[1]));
    for (let i = 2; i < w.p.length; i += 2) g.lineTo(tx(w.p[i]), tz(w.p[i + 1]));
    g.stroke();
  }
  // strade (dalla più piccola alla più grande)
  const order = ['path', 'footway', 'cycleway', 'steps', 'bridleway', 'track', 'service', 'living_street', 'unclassified', 'residential', 'pedestrian', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
  const sorted = world.roads.filter((r) => !r.tu).sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t));
  const N = world.roadNodes;
  for (const r of sorted) {
    const wd = r.w || ROAD_WIDTH[r.t] || 3;
    g.strokeStyle = ROAD_COLORS[r.t] || '#666';
    g.lineWidth = Math.max(1, wd * sx);
    g.beginPath();
    g.moveTo(tx(N[r.i[0] * 2]), tz(N[r.i[0] * 2 + 1]));
    for (let k = 1; k < r.i.length; k++) g.lineTo(tx(N[r.i[k] * 2]), tz(N[r.i[k] * 2 + 1]));
    g.stroke();
    cg.strokeStyle = classColor(CLASS_ID.road);
    cg.lineWidth = Math.max(1, (wd + 1.5) * csx);
    cg.beginPath();
    cg.moveTo(ctx2(N[r.i[0] * 2]), ctz2(N[r.i[0] * 2 + 1]));
    for (let k = 1; k < r.i.length; k++) cg.lineTo(ctx2(N[r.i[k] * 2]), ctz2(N[r.i[k] * 2 + 1]));
    cg.stroke();
  }
  // impronte degli edifici (visibili da lontano)
  g.fillStyle = '#9a6248';
  g.beginPath();
  for (const b of world.buildings) poly(g, b.p);
  g.fill();
  cg.fillStyle = classColor(CLASS_ID.building);
  cg.beginPath();
  for (const b of world.buildings) cpoly(b.p);
  cg.fill();
  // espandi un poco gli edifici nella mappa classi per tenere lontani gli alberi
  cg.strokeStyle = classColor(CLASS_ID.building);
  cg.lineWidth = 2;
  cg.stroke();

  const img = cg.getImageData(0, 0, CS, CS).data;
  const classes = new Uint8Array(CS * CS);
  for (let i = 0; i < classes.length; i++) classes[i] = img[i * 4];
  cc.width = cc.height = 1; // libera memoria
  return {
    canvas: cv,
    classAt(x, z) {
      const i = Math.floor((x - t.x0) * csx), j = Math.floor((z - t.z0) * csz);
      if (i < 0 || j < 0 || i >= CS || j >= CS) return 0;
      return classes[j * CS + i];
    },
    toPx: (x, z) => [tx(x), tz(z)],
    scale: sx,
  };
}

// Facciata: 4x4 celle da 3 m. Finestre con scuri verdi/marroni, alcune finestre accese di notte (emissive).
export function facadeTextures(anisotropy) {
  const S = 512, C = 4, cs = S / C;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const ev = document.createElement('canvas');
  ev.width = ev.height = S;
  const e = ev.getContext('2d');
  const rnd = mulberry32(99);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // leggera irregolarità dell'intonaco
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  for (let cy = 0; cy < C; cy++) {
    for (let cx = 0; cx < C; cx++) {
      const x0 = cx * cs, y0 = cy * cs;
      const ww = cs * 0.34, wh = cs * 0.5;
      const wx = x0 + (cs - ww) / 2, wy = y0 + cs * 0.22;
      const door = cy === C - 1 && cx === 1;
      const kind = rnd();
      // davanzale
      g.fillStyle = '#d8d2c6';
      g.fillRect(wx - 4, wy + wh, ww + 8, 5);
      if (door) {
        g.fillStyle = '#5b3a24';
        g.fillRect(wx - 2, y0 + cs * 0.18, ww + 4, cs * 0.82);
        continue;
      }
      g.fillStyle = '#2b3138';
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = '#56606b';
      g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      // scuri (balconi) veneti
      const shutter = kind < 0.45 ? '#3f6b47' : kind < 0.7 ? '#6b4a2e' : kind < 0.85 ? '#7d8a8c' : null;
      if (shutter) {
        g.fillStyle = shutter;
        const open = rnd() < 0.7;
        if (open) {
          g.fillRect(wx - ww * 0.5, wy, ww * 0.46, wh);
          g.fillRect(wx + ww * 1.04, wy, ww * 0.46, wh);
        } else {
          g.fillRect(wx, wy, ww, wh);
        }
        g.fillStyle = 'rgba(0,0,0,.25)';
        for (let k = 1; k < 7; k++) {
          if (open) {
            g.fillRect(wx - ww * 0.5, wy + (wh * k) / 7, ww * 0.46, 1);
            g.fillRect(wx + ww * 1.04, wy + (wh * k) / 7, ww * 0.46, 1);
          } else g.fillRect(wx, wy + (wh * k) / 7, ww, 1);
        }
        if (!open) continue;
      }
      if (rnd() < 0.38) {
        e.fillStyle = rnd() < 0.8 ? '#ffcf7a' : '#b9d7ff';
        e.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(cv);
  const emap = new THREE.CanvasTexture(ev);
  for (const t of [map, emap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
  }
  return { map, emap };
}

export function industrialTexture(anisotropy) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(0,0,0,.08)';
    g.fillRect(x, 0, 3, S);
  }
  g.fillStyle = 'rgba(40,60,80,.55)';
  g.fillRect(0, 30, S, 26);
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(0, 196, S, 4);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export function roofTexture(anisotropy) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rnd = mulberry32(7);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const rows = 8, cols = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (S / cols) + (r % 2 ? S / cols / 2 : 0), y = r * (S / rows);
      const grd = g.createLinearGradient(x, 0, x + S / cols, 0);
      const b = 0.75 + rnd() * 0.25;
      grd.addColorStop(0, `rgba(0,0,0,${0.35 * b})`);
      grd.addColorStop(0.5, `rgba(255,255,255,${0.1 * b})`);
      grd.addColorStop(1, `rgba(0,0,0,${0.35 * b})`);
      g.fillStyle = grd;
      g.fillRect(x, y, S / cols, S / rows);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x, y + S / rows - 2, S / cols, 2);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export function textTexture(text, opts = {}) {
  const cv = document.createElement('canvas');
  const fs = opts.size || 48;
  const g = cv.getContext('2d');
  g.font = `bold ${fs}px Trebuchet MS, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + fs * 0.6;
  cv.width = w;
  cv.height = Math.ceil(fs * 1.4);
  g.font = `bold ${fs}px Trebuchet MS, sans-serif`;
  g.fillStyle = opts.bg || '#1f3f8a';
  g.strokeStyle = opts.border || '#fff';
  g.lineWidth = fs * 0.08;
  const r = fs * 0.2;
  g.beginPath();
  g.roundRect(2, 2, cv.width - 4, cv.height - 4, r);
  g.fill();
  g.stroke();
  g.fillStyle = opts.color || '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + fs * 0.04);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: cv.width / cv.height };
}
