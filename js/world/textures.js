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

export function longestEdgeAngle(p) {
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    const dx = p[j] - p[i], dz = p[j + 1] - p[i + 1], L = Math.hypot(dx, dz);
    if (L > best) { best = L; ang = Math.atan2(dz, dx); }
  }
  return ang;
}
const SURFACE_COLORS = { asphalt: null, paved: null, concrete: '#8a8a86', unpaved: '#a08a68', ground: '#9c8460', dirt: '#957a55', gravel: '#b7ab92', fine_gravel: '#bdb197', compacted: '#ad9f82', paving_stones: '#8f8578', sett: '#7f766b', cobblestone: '#7f766b', grass: '#7f9c55', sand: '#cdbb8e' };
export function roadColor(r) { return (r.s && SURFACE_COLORS[r.s]) || ROAD_COLORS[r.t] || '#666'; }

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
      const ang = longestEdgeAngle(a.p);
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
    g.strokeStyle = roadColor(r);
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

// ---------------------------------------------------------------------------------------------
// Atlante delle facciate: 8x4 tessere da 256 px; ogni tessera = una campata (circa 3 m) di un piano.
export const TILE = {
  winGreen: 0, winBrown: 1, winGray: 2, winPlain: 3, door: 4, shop: 5, garage: 6, plaster: 7,
  villaArch: 8, balcony: 9, brick: 10, brickArch: 11, stone: 12, stoneWin: 13, rose: 14, churchDoor: 15,
  panel: 16, panelBand: 17, sectional: 18, metal: 19, wood: 20, glass: 21, schoolBand: 22, belfry: 23,
  winGreenD: 24, winBrownD: 25, winGrayD: 26, winPlainD: 27, villaArchD: 28, balconyD: 29, brickWin: 30, stoneRuin: 31,
};
export const ATLAS_COLS = 8, ATLAS_ROWS = 4;
export function tileUV(t) {
  const c = t % ATLAS_COLS, r = Math.floor(t / ATLAS_COLS);
  const pad = 3 / 256;
  return [(c + pad) / ATLAS_COLS, 1 - (r + 1 - pad) / ATLAS_ROWS, (c + 1 - pad) / ATLAS_COLS, 1 - (r + pad) / ATLAS_ROWS];
}

export function facadeAtlas(anisotropy) {
  const T = 256, W = T * ATLAS_COLS, H = T * ATLAS_ROWS;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ev = document.createElement('canvas'); ev.width = W; ev.height = H;
  const g = cv.getContext('2d'), e = ev.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const rnd = mulberry32(31);
  const at = (t) => [(t % ATLAS_COLS) * T, Math.floor(t / ATLAS_COLS) * T];
  const plaster = (x, y, base = '#ffffff') => {
    g.fillStyle = base; g.fillRect(x, y, T, T);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`; g.fillRect(x + rnd() * T, y + rnd() * T, 2 + rnd() * 9, 2 + rnd() * 9); }
    g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, y + T - 6, T, 6); // marcapiano
  };
  const bricks = (x, y, col = '#b4643f', h = 10) => {
    g.fillStyle = '#c9b8a4'; g.fillRect(x, y, T, T);
    for (let r = 0; r * h < T; r++) for (let c = -1; c * 26 < T; c++) {
      const ox = (r % 2) * 13;
      const k = 0.85 + rnd() * 0.3;
      const cc = new THREE.Color(col).multiplyScalar(k);
      g.fillStyle = '#' + cc.getHexString();
      g.fillRect(x + c * 26 + ox + 1, y + r * h + 1, 24, h - 2);
    }
  };
  const stones = (x, y) => {
    g.fillStyle = '#d9d1c1'; g.fillRect(x, y, T, T);
    for (let r = 0; r * 22 < T; r++) for (let c = -1; c * 44 < T; c++) {
      const ox = (r % 2) * 22, k = 0.88 + rnd() * 0.2;
      g.fillStyle = `rgb(${Math.round(222 * k)},${Math.round(212 * k)},${Math.round(192 * k)})`;
      g.fillRect(x + c * 44 + ox + 1, y + r * 22 + 1, 42, 20);
    }
  };
  const window = (x, y, shutter, lit, opts = {}) => {
    const ww = opts.w || 78, wh = opts.h || 118, wx = x + (T - ww) / 2, wy = y + (opts.y ?? 62);
    // cornice e davanzale
    g.fillStyle = '#e9e3d6'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 12);
    g.fillStyle = '#cfc6b4'; g.fillRect(wx - 12, wy + wh, ww + 24, 9);
    if (opts.arch) { g.beginPath(); g.arc(wx + ww / 2, wy, ww / 2 + 8, Math.PI, 0); g.fill(); }
    g.fillStyle = '#26303a';
    g.fillRect(wx, wy, ww, wh);
    if (opts.arch) { g.beginPath(); g.arc(wx + ww / 2, wy, ww / 2, Math.PI, 0); g.fill(); }
    g.fillStyle = '#6f7a84'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.4, ww, 3);
    // riflesso
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx + 8, wy + wh); g.fill();
    if (lit) {
      const col = rnd() < 0.8 ? '#ffcf7a' : '#bfd9ff';
      e.fillStyle = col; e.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      if (opts.arch) { e.beginPath(); e.arc(wx + ww / 2, wy, ww / 2 - 2, Math.PI, 0); e.fill(); }
    }
    if (shutter) {
      g.fillStyle = shutter;
      g.fillRect(wx - ww * 0.52 - 4, wy, ww * 0.5, wh);
      g.fillRect(wx + ww + 4, wy, ww * 0.5, wh);
      g.fillStyle = 'rgba(0,0,0,.28)';
      for (let k = 1; k < 10; k++) { g.fillRect(wx - ww * 0.52 - 4, wy + (wh * k) / 10, ww * 0.5, 2); g.fillRect(wx + ww + 4, wy + (wh * k) / 10, ww * 0.5, 2); }
    }
    if (opts.rail) {
      g.fillStyle = '#2b2b2b';
      g.fillRect(wx - 4, wy + wh * 0.62, ww + 8, 3);
      for (let k = 0; k <= 8; k++) g.fillRect(wx - 4 + (k * (ww + 8)) / 8, wy + wh * 0.62, 2, wh * 0.38);
    }
  };
  const tiles = [];
  const def = (t, fn) => tiles.push([t, fn]);
  def(TILE.winGreen, (x, y) => { plaster(x, y); window(x, y, '#3f6b47', true); });
  def(TILE.winBrown, (x, y) => { plaster(x, y); window(x, y, '#6b4a2e', true); });
  def(TILE.winGray, (x, y) => { plaster(x, y); window(x, y, '#7f8b8c', true); });
  def(TILE.winPlain, (x, y) => { plaster(x, y); window(x, y, null, true, { rail: true }); });
  def(TILE.winGreenD, (x, y) => { plaster(x, y); window(x, y, '#3f6b47', false); });
  def(TILE.winBrownD, (x, y) => { plaster(x, y); window(x, y, '#6b4a2e', false); });
  def(TILE.winGrayD, (x, y) => { plaster(x, y); window(x, y, '#7f8b8c', false); });
  def(TILE.winPlainD, (x, y) => { plaster(x, y); window(x, y, null, false, { rail: true }); });
  def(TILE.door, (x, y) => {
    plaster(x, y);
    g.fillStyle = '#e1d9c8'; g.fillRect(x + 70, y + 46, 116, 210);
    g.fillStyle = '#5b3a24'; g.fillRect(x + 80, y + 56, 96, 200);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 4; k++) g.fillRect(x + 86 + (k % 2) * 46, y + 64 + Math.floor(k / 2) * 96, 38, 84);
    g.fillStyle = '#d4af37'; g.fillRect(x + 160, y + 150, 6, 10);
    e.fillStyle = '#ffd98a'; e.fillRect(x + 118, y + 30, 20, 10); // luce sopra la porta
  });
  def(TILE.shop, (x, y) => {
    plaster(x, y);
    g.fillStyle = '#3a3f46'; g.fillRect(x + 10, y + 40, T - 20, T - 40);
    g.fillStyle = '#9fc3d6'; g.fillRect(x + 18, y + 48, T - 36, T - 60);
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x + 30, y + 54, 30, T - 74);
    g.fillStyle = '#3a3f46'; g.fillRect(x + T / 2 - 3, y + 48, 6, T - 60);
    e.fillStyle = '#fff1c4'; e.fillRect(x + 18, y + 48, T - 36, T - 60);
  });
  def(TILE.garage, (x, y) => {
    plaster(x, y);
    g.fillStyle = '#9aa0a6'; g.fillRect(x + 28, y + 70, T - 56, T - 70);
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let k = 0; k < 10; k++) g.fillRect(x + 28, y + 70 + k * 18.6, T - 56, 3);
  });
  def(TILE.plaster, (x, y) => plaster(x, y));
  def(TILE.villaArch, (x, y) => { plaster(x, y); window(x, y, '#3f6b47', true, { arch: true, y: 80, h: 110 }); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y, T, 14); });
  def(TILE.villaArchD, (x, y) => { plaster(x, y); window(x, y, '#3f6b47', false, { arch: true, y: 80, h: 110 }); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y, T, 14); });
  def(TILE.balcony, (x, y) => { plaster(x, y); window(x, y, '#6b4a2e', true, { y: 30, h: 220, w: 90 }); });
  def(TILE.balconyD, (x, y) => { plaster(x, y); window(x, y, '#6b4a2e', false, { y: 30, h: 220, w: 90 }); });
  def(TILE.brick, (x, y) => bricks(x, y));
  def(TILE.brickArch, (x, y) => {
    bricks(x, y);
    g.fillStyle = '#1f1a16'; g.beginPath(); g.moveTo(x + 24, y + T); g.lineTo(x + 24, y + 110); g.arc(x + T / 2, y + 110, T / 2 - 24, Math.PI, 0); g.lineTo(x + T - 24, y + T); g.fill();
    g.strokeStyle = '#8e4a2c'; g.lineWidth = 12; g.beginPath(); g.arc(x + T / 2, y + 110, T / 2 - 18, Math.PI, 0); g.stroke();
  });
  def(TILE.brickWin, (x, y) => { bricks(x, y); window(x, y, '#6b4a2e', false, { w: 60, h: 90, y: 80 }); });
  def(TILE.stone, (x, y) => stones(x, y));
  def(TILE.stoneWin, (x, y) => {
    stones(x, y);
    g.fillStyle = '#2d3440'; g.fillRect(x + 104, y + 70, 48, 150); g.beginPath(); g.arc(x + 128, y + 70, 24, Math.PI, 0); g.fill();
    e.fillStyle = '#ffcf7a'; e.fillRect(x + 108, y + 74, 40, 142);
  });
  def(TILE.rose, (x, y) => {
    stones(x, y);
    g.fillStyle = '#c9bfa9'; g.beginPath(); g.arc(x + 128, y + 128, 92, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e3d5c'; g.beginPath(); g.arc(x + 128, y + 128, 78, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9bfa9'; g.lineWidth = 6;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x + 128, y + 128); g.lineTo(x + 128 + Math.cos(a) * 78, y + 128 + Math.sin(a) * 78); g.stroke(); }
    e.fillStyle = '#ffb35c'; e.beginPath(); e.arc(x + 128, y + 128, 74, 0, Math.PI * 2); e.fill();
  });
  def(TILE.churchDoor, (x, y) => {
    stones(x, y);
    g.fillStyle = '#c9bfa9'; g.fillRect(x + 50, y + 40, 156, 216);
    g.fillStyle = '#4a2f1e'; g.fillRect(x + 64, y + 90, 128, 166); g.beginPath(); g.arc(x + 128, y + 90, 64, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 126, y + 60, 4, 196);
  });
  def(TILE.panel, (x, y) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, T, T);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < T; k += 64) g.fillRect(x + k, y, 3, T);
    g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x, y + T / 2, T, 2);
  });
  def(TILE.panelBand, (x, y) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, T, T);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < T; k += 64) g.fillRect(x + k, y, 3, T);
    g.fillStyle = '#4f6b80'; g.fillRect(x, y + 26, T, 46);
    g.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < T; k += 64) g.fillRect(x + k + 6, y + 30, 14, 38);
    e.fillStyle = '#e8f2ff'; e.fillRect(x, y + 28, T, 42);
  });
  def(TILE.sectional, (x, y) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, T, T);
    g.fillStyle = '#b8bec4'; g.fillRect(x + 16, y + 40, T - 32, T - 40);
    g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 0; k < 8; k++) g.fillRect(x + 16, y + 40 + k * 27, T - 32, 3);
    g.fillStyle = '#d6a600'; g.fillRect(x + 16, y + 34, T - 32, 6);
  });
  def(TILE.metal, (x, y) => {
    g.fillStyle = '#d0d4d8'; g.fillRect(x, y, T, T);
    for (let k = 0; k < T; k += 16) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + k, y, 6, T); }
    g.fillStyle = 'rgba(120,70,40,.18)'; for (let i = 0; i < 40; i++) g.fillRect(x + rnd() * T, y + rnd() * T, 3 + rnd() * 10, 10 + rnd() * 40);
  });
  def(TILE.wood, (x, y) => {
    g.fillStyle = '#8a6a4a'; g.fillRect(x, y, T, T);
    for (let k = 0; k < T; k += 22) { g.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.1})`; g.fillRect(x + k, y, 3, T); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x + rnd() * T, y + rnd() * T, 1, 20 + rnd() * 40); }
  });
  def(TILE.glass, (x, y) => {
    g.fillStyle = '#e9f5f7'; g.fillRect(x, y, T, T);
    g.fillStyle = '#9fb3b8'; for (let k = 0; k <= T; k += 64) { g.fillRect(x + k - 2, y, 4, T); g.fillRect(x, y + k - 2, T, 4); }
  });
  def(TILE.schoolBand, (x, y) => {
    plaster(x, y);
    g.fillStyle = '#e9e3d6'; g.fillRect(x, y + 56, T, 136);
    g.fillStyle = '#2b3540'; g.fillRect(x + 8, y + 64, T - 16, 120);
    g.fillStyle = '#e9e3d6'; for (let k = 1; k < 4; k++) g.fillRect(x + (k * T) / 4 - 3, y + 64, 6, 120);
    e.fillStyle = '#e8f2ff'; e.fillRect(x + 10, y + 66, T - 20, 116);
  });
  def(TILE.belfry, (x, y) => {
    bricks(x, y, '#a85a38');
    g.fillStyle = '#15110e'; g.beginPath(); g.moveTo(x + 50, y + T); g.lineTo(x + 50, y + 100); g.arc(x + 128, y + 100, 78, Math.PI, 0); g.lineTo(x + 206, y + T); g.fill();
  });
  def(TILE.stoneRuin, (x, y) => {
    stones(x, y);
    g.fillStyle = 'rgba(60,80,40,.35)'; for (let i = 0; i < 30; i++) g.fillRect(x + rnd() * T, y + T * 0.5 + rnd() * T * 0.5, 6 + rnd() * 20, 4 + rnd() * 10);
  });
  for (const [t, fn] of tiles) { const [x, y] = at(t); fn(x, y); }
  const map = new THREE.CanvasTexture(cv), emap = new THREE.CanvasTexture(ev);
  for (const t of [map, emap]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; }
  return { map, emap };
}

export function signTexture(text, kind) {
  const cv = document.createElement('canvas');
  const fs = 64;
  const g = cv.getContext('2d');
  g.font = `bold ${fs}px Georgia, serif`;
  const w = Math.min(1024, Math.ceil(g.measureText(text).width) + fs);
  cv.width = w; cv.height = Math.round(fs * 1.5);
  const bg = { bar: '#1f4a2e', cafe: '#5a2e1a', restaurant: '#6b1f1f', pharmacy: '#1f7a3a', post_office: '#f4c430', bank: '#1f3a6b' }[kind] || '#24324a';
  g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#e9d9a6'; g.lineWidth = 5; g.strokeRect(5, 5, cv.width - 10, cv.height - 10);
  g.font = `bold ${fs}px Georgia, serif`;
  g.fillStyle = kind === 'post_office' ? '#1f3a68' : '#f6ecd0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let label = text;
  while (g.measureText(label).width > cv.width - fs * 0.6 && label.length > 4) label = label.slice(0, -2);
  g.fillText(label, cv.width / 2, cv.height / 2 + 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: cv.width / cv.height };
}

export function roofAtlasTexture(anisotropy) { return roofTexture(anisotropy); }
