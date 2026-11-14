// Converte i dati grezzi OSM + DEM nel formato del gioco:
//   data/world.json  – edifici, strade, aree, corsi d'acqua, POI, civici, confine (metri locali, 1 unità = 1 m)
//   data/height.bin  – heightmap del terreno (Int16, decimetri) con intestazione in world.json
// Proiezione: piano tangente locale centrato sul comune (errore < 0,1 % sull'area di gioco).
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PNG } from 'pngjs';

const RAW = path.resolve('data/raw');
const OUT = path.resolve('data');
const BOUNDARY_REL = '44798'; // relation OSM "Rovolon" admin_level=8

// ---------------------------------------------------------------- parsing
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (n) => ['node', 'way', 'relation', 'tag', 'nd', 'member'].includes(n),
});
const nodes = new Map(), ways = new Map(), rels = new Map();
for (const f of fs.readdirSync(path.join(RAW, 'osm'))) {
  const o = parser.parse(fs.readFileSync(path.join(RAW, 'osm', f), 'utf8')).osm;
  for (const n of o.node || []) nodes.set(n.id, n);
  for (const w of o.way || []) ways.set(w.id, w);
  for (const r of o.relation || []) rels.set(r.id, r);
}
const tagsOf = (e) => {
  if (e._t) return e._t;
  const t = {};
  for (const x of e.tag || []) t[x.k] = x.v;
  return (e._t = t);
};
console.log('raw', nodes.size, 'nodes', ways.size, 'ways', rels.size, 'relations');

// ---------------------------------------------------------------- projection
const boundaryRel = rels.get(BOUNDARY_REL);
if (!boundaryRel) throw new Error('boundary relation missing');

function wayLatLon(w) {
  const out = [];
  for (const nd of w.nd) {
    const n = nodes.get(nd.ref);
    if (n) out.push([+n.lat, +n.lon, nd.ref]);
  }
  return out;
}
// Unisce le way di una multipolygon in anelli chiusi
function assembleRings(memberWays) {
  const segs = memberWays.map((w) => wayLatLon(w)).filter((s) => s.length >= 2);
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (ring[0][2] !== ring[ring.length - 1][2] && guard++ < 10000) {
      const end = ring[ring.length - 1][2];
      let idx = segs.findIndex((s) => s[0][2] === end || s[s.length - 1][2] === end);
      if (idx < 0) break;
      let s = segs.splice(idx, 1)[0];
      if (s[0][2] !== end) s = s.slice().reverse();
      ring = ring.concat(s.slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

const bRings = assembleRings(boundaryRel.member.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => ways.get(m.ref)).filter(Boolean));
let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
for (const r of bRings) for (const [la, lo] of r) {
  minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
  minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
}
const lat0 = (minLat + maxLat) / 2, lon0 = (minLon + maxLon) / 2;
const phi = (lat0 * Math.PI) / 180;
const KLAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const KLON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const px = (lon) => (lon - lon0) * KLON;
const pz = (lat) => -(lat - lat0) * KLAT; // nord = -z
const r1 = (v) => Math.round(v * 10) / 10;

const bx0 = px(minLon), bx1 = px(maxLon), bz0 = pz(maxLat), bz1 = pz(minLat);
const MARGIN = 400;
const inMargin = (x, z) => x > bx0 - MARGIN && x < bx1 + MARGIN && z > bz0 - MARGIN && z < bz1 + MARGIN;
console.log('boundary extent m', (bx1 - bx0).toFixed(0), 'x', (bz1 - bz0).toFixed(0));

const ringXZ = (ring) => {
  const out = [];
  for (const [la, lo] of ring) out.push(r1(px(lo)), r1(pz(la)));
  // rimuovi ultimo punto duplicato
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
};
const anyIn = (flat) => {
  for (let i = 0; i < flat.length; i += 2) if (inMargin(flat[i], flat[i + 1])) return true;
  return false;
};
function area(flat) {
  let a = 0;
  for (let i = 0, n = flat.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
  }
  return a / 2;
}
function centroid(flat) {
  let x = 0, z = 0;
  const n = flat.length / 2;
  for (let i = 0; i < flat.length; i += 2) { x += flat[i]; z += flat[i + 1]; }
  return [r1(x / n), r1(z / n)];
}
function pointInPoly(x, z, flat) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const boundary = bRings.map(ringXZ);
const inBoundary = (x, z) => boundary.some((r) => pointInPoly(x, z, r));

// ---------------------------------------------------------------- buildings
const KIND_MAP = {
  house: 'house', detached: 'house', semidetached_house: 'house', terrace: 'house', residential: 'house', bungalow: 'house', villa: 'villa',
  apartments: 'apartments', farm: 'farm', barn: 'barn', farm_auxiliary: 'barn', stable: 'barn', cowshed: 'barn', greenhouse: 'greenhouse',
  church: 'church', chapel: 'chapel', cathedral: 'church', bell_tower: 'tower', tower: 'tower', campanile: 'tower',
  industrial: 'industrial', warehouse: 'industrial', manufacture: 'industrial', commercial: 'commercial', retail: 'commercial', supermarket: 'commercial',
  school: 'school', kindergarten: 'school', public: 'public', civic: 'public', government: 'public', townhall: 'public',
  garage: 'garage', garages: 'garage', shed: 'shed', carport: 'shed', hut: 'shed', roof: 'roof', service: 'shed', ruins: 'ruins', castle: 'castle',
};
const buildings = [];
function addBuilding(t, outer, holes, id) {
  const pts = ringXZ(outer);
  if (pts.length < 6 || !anyIn(pts)) return;
  let a = area(pts);
  if (a < 0) { // vogliamo CCW nel piano x,z con z verso sud => area positiva
    const rev = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i], pts[i + 1]);
    pts.splice(0, pts.length, ...rev);
    a = -a;
  }
  if (a < 4) return;
  let kind = KIND_MAP[t.building] || (t['building'] === 'yes' ? 'yes' : 'yes');
  if (t.man_made === 'tower' || t.tower) kind = 'tower';
  if (t.amenity === 'place_of_worship' && kind === 'yes') kind = a > 150 ? 'church' : 'chapel';
  if (kind === 'yes') {
    if (t.shop || t.amenity) kind = 'commercial';
    else if (a < 25) kind = 'shed';
    else if (a > 1500) kind = 'industrial';
    else kind = 'house';
  }
  let levels = parseFloat(t['building:levels']);
  let h = parseFloat(t.height);
  const defaults = { house: 2, villa: 2, apartments: 3, farm: 2, barn: 1.6, greenhouse: 1, church: 4, chapel: 2, tower: 8, industrial: 2.4, commercial: 2, school: 2, public: 2, garage: 1, shed: 1, roof: 1, ruins: 1, castle: 3 };
  if (!levels) levels = defaults[kind] || 2;
  if (kind === 'house' && a > 300 && !t['building:levels']) levels = 3;
  if (!h) h = levels * 3 + (kind === 'tower' ? 4 : 0.4);
  if (kind === 'shed' || kind === 'garage') h = Math.min(h, 3);
  if (kind === 'tower' && h < 18) h = Math.max(h, 22);
  let roof = t['roof:shape'];
  if (!roof || !['flat', 'gabled', 'hipped', 'pyramidal'].includes(roof)) {
    if (['industrial', 'commercial', 'greenhouse', 'roof', 'ruins'].includes(kind) && a > 300) roof = 'flat';
    else if (kind === 'tower') roof = 'pyramidal';
    else if (kind === 'church' || kind === 'chapel' || kind === 'barn' || kind === 'garage' || kind === 'shed') roof = 'gabled';
    else roof = a > 900 ? 'flat' : (id % 3 === 0 ? 'gabled' : 'hipped');
  }
  const b = { p: pts, h: r1(h), k: kind, r: roof[0], _t: t, _a: a, _id: id };
  if (holes && holes.length) b.hl = holes.map(ringXZ).filter((x) => x.length >= 6);
  if (t.name) b.n = t.name;
  if (t['addr:housenumber']) b.a = [t['addr:street'] || '', t['addr:housenumber']];
  const col = t['building:colour'] || t['building:color'];
  if (col) b.c = col;
  if (t.shop || t.amenity || t.office || t.craft || t.tourism) b.poi = t.shop || t.amenity || t.office || t.craft || t.tourism;
  if (t.amenity === 'place_of_worship' || kind === 'church') b.poi = b.poi || 'place_of_worship';
  buildings.push(b);
}
for (const w of ways.values()) {
  const t = tagsOf(w);
  if (!t.building || t.building === 'no') continue;
  if (w.nd[0].ref !== w.nd[w.nd.length - 1].ref) continue;
  addBuilding(t, wayLatLon(w), null, +w.id);
}
for (const r of rels.values()) {
  const t = tagsOf(r);
  if (t.type !== 'multipolygon' || !t.building) continue;
  const outers = assembleRings(r.member.filter((m) => m.type === 'way' && m.role === 'outer').map((m) => ways.get(m.ref)).filter(Boolean));
  const inners = assembleRings(r.member.filter((m) => m.type === 'way' && m.role === 'inner').map((m) => ways.get(m.ref)).filter(Boolean));
  for (const o of outers) addBuilding(t, o, inners, +r.id);
}
console.log('buildings', buildings.length);

// ---------------------------------------------------------------- DBT/CTRN Regione del Veneto: tipologia e uso ufficiali
// edi_ty: 01 edificio, 03 rudere, 13/05 baracca o tettoia. edi_uso: 01 residenziale, 0102 autorimessa, 08 industriale,
// 09 agricolo, 05 culto, 0303 istruzione, 02/03 pubblico, 10 sport, 07 commerciale (codici verificati incrociandoli con OSM).
const ctrnFile = path.join(RAW, 'ctrn/edifici.json');
const ctrn = fs.existsSync(ctrnFile) ? JSON.parse(fs.readFileSync(ctrnFile, 'utf8')) : [];
const bGrid = new Map();
const gkey = (x, z) => Math.floor(x / 40) + ',' + Math.floor(z / 40);
buildings.forEach((b, i) => { const [x, z] = centroid(b.p); b._c = [x, z]; const k = gkey(x, z); if (!bGrid.has(k)) bGrid.set(k, []); bGrid.get(k).push(i); });
const nearB = (x, z) => { const out = []; const gx = Math.floor(x / 40), gz = Math.floor(z / 40); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const i of bGrid.get(gx + dx + ',' + (gz + dz)) || []) out.push(i); return out; };
let ctMatched = 0, ctAdded = 0;
const extra = [];
for (const f of ctrn) {
  for (const poly of f.g) {
    const ring = poly.map((c) => [c[1], c[0], null]);
    const flat = ringXZ(ring);
    if (flat.length < 6) continue;
    const [cx, cz] = centroid(flat);
    let hit = -1;
    for (const i of nearB(cx, cz)) {
      const b = buildings[i];
      if (pointInPoly(cx, cz, b.p) || pointInPoly(b._c[0], b._c[1], flat)) { hit = i; break; }
    }
    if (hit >= 0) { if (!buildings[hit].ct) { buildings[hit].ct = { t: f.t, u: f.u }; ctMatched++; } }
    else if (inMargin(cx, cz) && Math.abs(area(flat)) > 6) extra.push({ ring, ct: { t: f.t, u: f.u } });
  }
}
for (const e of extra) {
  const n0 = buildings.length;
  addBuilding({ building: 'yes' }, e.ring, null, 900000000 + n0);
  if (buildings.length > n0) { buildings[n0].ct = e.ct; buildings[n0].src = 'ctrn'; ctAdded++; }
}
console.log('CTRN: abbinati', ctMatched, 'aggiunti (mancanti in OSM)', ctAdded);

// densità edilizia (per distinguere centro paese e campagna)
const dGrid = new Map();
for (const b of buildings) { const [x, z] = b._c || centroid(b.p); b._c = [x, z]; const k = Math.floor(x / 60) + ',' + Math.floor(z / 60); dGrid.set(k, (dGrid.get(k) || 0) + 1); }
const density = (x, z) => { let n = 0; const gx = Math.floor(x / 60), gz = Math.floor(z / 60); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) n += dGrid.get(gx + dx + ',' + (gz + dz)) || 0; return n; };
const hrand = (id, k) => { let h = Math.imul((id | 0) ^ (k * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
const KIND_KEEP = new Set(['church', 'chapel', 'tower', 'greenhouse', 'school', 'public', 'castle', 'apartments', 'villa', 'industrial', 'commercial', 'garage', 'barn', 'farm', 'ruins', 'roof']);
const LEV = {};
for (const b of buildings) {
  const t = b._t || {}, a = b._a || Math.abs(area(b.p)), c = b.ct, id = b._id || 0;
  const r = (k) => hrand(id, k);
  const osm = KIND_MAP[t.building];
  let k = KIND_KEEP.has(osm) ? osm : null;
  if (t.man_made === 'tower' || t.tower || t.building === 'bell_tower') k = 'tower';
  if (t.man_made === 'silo' || t.building === 'silo') k = 'silo';
  if (t.building === 'roof' || /tettoia|pensilina/.test(t.note || '')) k = k === 'roof' || !k ? 'canopy' : k;
  if (k === 'roof') k = 'canopy';
  if (k === 'industrial' && c?.u === '09') k = 'barn';
  if (!k) {
    const note = t.note || '';
    if (c?.t === '03' || /rudere/.test(note)) k = 'ruins';
    else if (c && (c.t === '13' || c.t === '05')) k = /baracca/.test(note) ? 'shed' : a > 45 && r(1) < 0.65 ? 'canopy' : 'shed';
    else if (/baracca/.test(note) || osm === 'shed') k = a > 60 && /baracca/.test(note) === false ? 'canopy' : 'shed';
    else if (c?.u === '0102' || osm === 'garage') k = 'garage';
    else if (c?.u === '08') k = 'industrial';
    else if (c?.u === '09') k = a > 220 ? 'barn' : 'farm';
    else if (c?.u === '05' || t.amenity === 'place_of_worship') k = a > 150 ? 'church' : 'chapel';
    else if (c?.u === '0303' || c?.u === '0301') k = 'school';
    else if (c?.u === '02' || c?.u === '03') k = 'public';
    else if (c?.u === '10' || c?.u === '1002') k = 'sport';
    else if (c?.u === '07') k = 'commercial';
    else if (a < 22) k = 'shed';
    else if (a > 1500 && !c) k = 'industrial';
    else {
      const dens = density(b._c[0], b._c[1]);
      if (a > 420 || (a > 260 && dens > 30)) k = 'apartments';
      else if (a > 230) k = r(2) < 0.5 ? 'villa' : 'house';
      else k = 'house';
    }
  }
  if ((t.shop || t.amenity) && k === 'house') b.shopfront = 1;
  // piani e altezze stimate in base al tipo (OSM non ha altezze per questo comune)
  let lv = parseFloat(t['building:levels']) || 0, h = parseFloat(t.height) || 0;
  const dens = density(b._c[0], b._c[1]);
  switch (k) {
    case 'house': lv = lv || (a < 70 && r(3) < 0.35 ? 1 : dens > 35 && r(3) < 0.25 ? 3 : 2); h = h || lv * 2.95 + 0.5; break;
    case 'villa': lv = lv || (r(3) < 0.3 ? 3 : 2); h = h || lv * 3.3 + 0.8; break;
    case 'apartments': lv = lv || (dens > 40 ? 4 + Math.floor(r(3) * 2) : 3 + Math.floor(r(3) * 2)); h = h || lv * 3 + 0.6; break;
    case 'farm': lv = lv || 2; h = h || 6.8 + r(3); break;
    case 'barn': lv = 1; h = h || 6 + r(3) * 2.5; break;
    case 'industrial': lv = 1; h = h || 6.5 + r(3) * 4; break;
    case 'commercial': lv = lv || 1 + Math.floor(r(3) * 2); h = h || lv * 3.8 + 0.5; break;
    case 'garage': lv = 1; h = h || 2.6; break;
    case 'shed': lv = 1; h = h || 2.2 + r(3) * 0.8; break;
    case 'canopy': lv = 1; h = h || 3.2 + r(3) * 1.6; break;
    case 'ruins': lv = 1; h = h || 2.5 + r(3) * 3; break;
    case 'church': lv = 1; h = h || Math.max(9, Math.min(16, Math.sqrt(a) * 0.75)); break;
    case 'chapel': lv = 1; h = h || 5.5; break;
    case 'tower': lv = 1; h = h || Math.max(22, b.h || 0, 24 + r(3) * 8); break;
    case 'school': lv = lv || 2; h = h || lv * 3.6 + 0.6; break;
    case 'public': lv = lv || 2; h = h || lv * 3.5 + 0.8; break;
    case 'sport': lv = 1; h = h || 7.5; break;
    case 'silo': lv = 1; h = h || 12 + r(3) * 8; break;
    case 'greenhouse': lv = 1; h = h || 3.2; break;
    case 'castle': lv = lv || 3; h = h || 12; break;
    default: lv = lv || 2; h = h || lv * 3;
  }
  let roof = t['roof:shape'] && ['flat', 'gabled', 'hipped', 'pyramidal'].includes(t['roof:shape']) ? t['roof:shape'][0] : null;
  if (!roof) {
    roof = {
      house: r(4) < 0.62 ? 'h' : 'g', villa: 'h', apartments: r(4) < 0.2 ? 'f' : 'h', farm: r(4) < 0.5 ? 'g' : 'h', barn: 'g',
      industrial: r(4) < 0.6 ? 'f' : 'g', commercial: r(4) < 0.5 ? 'f' : 'h', garage: r(4) < 0.5 ? 'f' : 'g', shed: r(4) < 0.4 ? 'f' : 'g',
      canopy: r(4) < 0.4 ? 'f' : 'g', ruins: 'n', church: 'g', chapel: 'g', tower: 'p', school: r(4) < 0.5 ? 'f' : 'h', public: 'h',
      sport: 'g', silo: 'd', greenhouse: 'g', castle: 'f',
    }[k] || 'h';
  }
  b.k = k; b.h = r1(h); b.lv = lv; b.r = roof;
  LEV[k] = (LEV[k] || 0) + 1;
}
console.log('tipi edificio', JSON.stringify(LEV));
// insegne: POI (nodi) dentro un edificio
for (const n of nodes.values()) {
  if (!n.tag) continue;
  const t = tagsOf(n);
  const name = t.name;
  const type = t.shop ? 'shop' : ['bar', 'cafe', 'restaurant', 'pharmacy', 'post_office', 'bank', 'pub', 'ice_cream', 'fast_food'].includes(t.amenity) ? t.amenity : null;
  if (!name || !type) continue;
  const x = px(+n.lon), z = pz(+n.lat);
  for (const i of nearB(x, z)) {
    const b = buildings[i];
    if (b && pointInPoly(x, z, b.p)) { b.sign = name; b.signT = type; if (b.k === 'house' || b.k === 'apartments' || b.k === 'villa') b.shopfront = 1; break; }
  }
}
for (const b of buildings) if (b.n && b.poi && !b.sign && !['place_of_worship'].includes(b.poi)) { b.sign = b.n; b.signT = b.poi; }
for (const b of buildings) { delete b._t; delete b._a; delete b._id; delete b._c; }

// ---------------------------------------------------------------- roads (nodi condivisi -> grafo)
const ROAD_W = { motorway: 10, trunk: 8, primary: 7, secondary: 6.5, tertiary: 6, residential: 5, unclassified: 4.5, living_street: 4.5, service: 3.5, track: 3, pedestrian: 4, footway: 1.6, path: 1.4, cycleway: 2, steps: 1.6, bridleway: 1.6 };
const roadNodes = [];
const roadNodeIdx = new Map();
const roads = [];
for (const w of ways.values()) {
  const t = tagsOf(w);
  if (!t.highway || !(t.highway in ROAD_W) || t.area === 'yes') continue;
  const ll = wayLatLon(w);
  if (ll.length < 2) continue;
  const flat = [];
  for (const [la, lo] of ll) flat.push(px(lo), pz(la));
  if (!anyIn(flat)) continue;
  const idx = [];
  for (const [la, lo, id] of ll) {
    let i = roadNodeIdx.get(id);
    if (i === undefined) {
      i = roadNodes.length / 2;
      roadNodes.push(r1(px(lo)), r1(pz(la)));
      roadNodeIdx.set(id, i);
    }
    idx.push(i);
  }
  const rd = { t: t.highway, i: idx };
  if (t.name) rd.n = t.name;
  if (t.bridge && t.bridge !== 'no') rd.b = 1;
  if (t.tunnel && t.tunnel !== 'no') rd.tu = 1;
  if (t.oneway === 'yes') rd.o = 1;
  if (t.width && parseFloat(t.width)) rd.w = parseFloat(t.width);
  else if (t.lanes && parseInt(t.lanes) >= 2 && ['primary', 'secondary', 'tertiary', 'unclassified', 'residential'].includes(t.highway)) rd.w = Math.max(ROAD_W[t.highway], parseInt(t.lanes) * 3);
  if (t.lanes) rd.l = parseInt(t.lanes) || undefined;
  if (t.surface) rd.s = t.surface;
  if (t.footway === 'sidewalk') rd.sw = 1;
  if (t.layer) rd.y = parseInt(t.layer) || undefined;
  roads.push(rd);
}
console.log('roads', roads.length, 'road nodes', roadNodes.length / 2);

// ---------------------------------------------------------------- areas (landcover)
function areaClass(t) {
  const lu = t.landuse, na = t.natural, le = t.leisure, am = t.amenity;
  if (na === 'water' || lu === 'reservoir' || lu === 'basin' || t.water) return 'water';
  if (na === 'wood' || lu === 'forest') return 'forest';
  if (na === 'scrub' || na === 'heath') return 'scrub';
  if (lu === 'vineyard') return 'vineyard';
  if (lu === 'orchard') return 'orchard';
  if (lu === 'farmland' || lu === 'farmyard' || lu === 'greenhouse_horticulture' || lu === 'plant_nursery') return lu === 'farmyard' ? 'farmyard' : 'farmland';
  if (lu === 'meadow' || lu === 'grass' || na === 'grassland' || lu === 'village_green' || le === 'garden' || le === 'park' || lu === 'recreation_ground') return 'grass';
  if (le === 'pitch' || le === 'sports_centre' || le === 'stadium') return 'pitch';
  if (lu === 'residential') return 'residential';
  if (lu === 'industrial' || lu === 'commercial' || lu === 'retail' || lu === 'construction') return 'industrial';
  if (lu === 'cemetery' || am === 'grave_yard') return 'cemetery';
  if (am === 'parking' || t.highway === 'pedestrian' || (t.area === 'yes' && t.highway) || am === 'marketplace' || t.place === 'square') return 'paved';
  if (na === 'bare_rock' || lu === 'quarry') return 'rock';
  return null;
}
const areas = [];
for (const w of ways.values()) {
  const t = tagsOf(w);
  if (t.building) continue;
  const c = areaClass(t);
  if (!c || w.nd[0].ref !== w.nd[w.nd.length - 1].ref) continue;
  const p = ringXZ(wayLatLon(w));
  if (p.length >= 6 && anyIn(p)) areas.push({ c, p });
}
for (const r of rels.values()) {
  const t = tagsOf(r);
  if (t.type !== 'multipolygon' || t.building) continue;
  const c = areaClass(t);
  if (!c) continue;
  const outers = assembleRings(r.member.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => ways.get(m.ref)).filter(Boolean));
  const inners = assembleRings(r.member.filter((m) => m.type === 'way' && m.role === 'inner').map((m) => ways.get(m.ref)).filter(Boolean));
  for (const o of outers) {
    const p = ringXZ(o);
    if (p.length >= 6 && anyIn(p)) areas.push({ c, p, h: inners.map(ringXZ) });
  }
}
// disegna prima le aree grandi
areas.sort((a, b) => Math.abs(area(b.p)) - Math.abs(area(a.p)));
console.log('areas', areas.length);

// ---------------------------------------------------------------- waterways, trees
const WW = { river: 12, stream: 3, canal: 6, ditch: 1.5, drain: 1.5 };
const waterways = [];
const trees = [];
for (const w of ways.values()) {
  const t = tagsOf(w);
  if (t.waterway in WW) {
    const flat = ringXZ(wayLatLon(w));
    if (flat.length >= 4 && anyIn(flat)) waterways.push({ t: t.waterway, p: flat, n: t.name });
  }
  if (t.natural === 'tree_row') {
    const flat = ringXZ(wayLatLon(w));
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const dx = flat[i + 2] - flat[i], dz = flat[i + 3] - flat[i + 1];
      const L = Math.hypot(dx, dz), n = Math.floor(L / 8);
      for (let k = 0; k <= n; k++) trees.push(r1(flat[i] + (dx * k) / Math.max(n, 1)), r1(flat[i + 1] + (dz * k) / Math.max(n, 1)));
    }
  }
}

// ---------------------------------------------------------------- dettagli: recinzioni, muri, linee elettriche, arredo urbano
const barriers = [];
const power = { lines: [], supports: [] };
const furniture = [];
const pools = [];
const supportSeen = new Set();
for (const w of ways.values()) {
  const t = tagsOf(w);
  if (['fence', 'wall', 'retaining_wall', 'hedge', 'guard_rail', 'city_wall'].includes(t.barrier)) {
    const flat = ringXZ(wayLatLon(w));
    if (w.nd[0].ref === w.nd[w.nd.length - 1].ref && flat.length >= 4) flat.push(flat[0], flat[1]);
    if (flat.length >= 4 && anyIn(flat)) barriers.push({ t: t.barrier === 'city_wall' ? 'wall' : t.barrier, p: flat, h: parseFloat(t.height) || undefined });
  }
  if (t.power === 'line' || t.power === 'minor_line') {
    const ll = wayLatLon(w);
    const flat = [];
    for (const [la, lo] of ll) flat.push(r1(px(lo)), r1(pz(la)));
    if (flat.length < 4 || !anyIn(flat)) continue;
    const big = t.power === 'line';
    power.lines.push({ p: flat, big: big ? 1 : 0, c: Math.min(6, parseInt(t.cables) || (big ? 3 : 3)) });
    for (const [la, lo, id] of ll) {
      if (supportSeen.has(id)) continue;
      supportSeen.add(id);
      const nt = nodes.get(id) ? tagsOf(nodes.get(id)) : {};
      power.supports.push(r1(px(lo)), r1(pz(la)), nt.power === 'tower' || big ? 1 : 0);
    }
  }
  if (t.leisure === 'swimming_pool' && w.nd[0].ref === w.nd[w.nd.length - 1].ref) {
    const p = ringXZ(wayLatLon(w));
    if (p.length >= 6 && anyIn(p)) pools.push(p);
  }
}
const FURN = { street_lamp: 'lamp', crossing: 'crossing', stop: 'stop', give_way: 'giveway', bus_stop: 'bus', traffic_signals: 'signals' };
for (const n of nodes.values()) {
  if (!n.tag) continue;
  const t = tagsOf(n);
  const x = r1(px(+n.lon)), z = r1(pz(+n.lat));
  if (!inMargin(x, z)) continue;
  let f = FURN[t.highway] || null;
  if (!f && t.historic === 'wayside_shrine') f = 'shrine';
  if (!f && t.historic === 'wayside_cross') f = 'cross';
  if (!f && t.amenity === 'bench') f = 'bench';
  if (!f && (t.amenity === 'fountain' || t.amenity === 'drinking_water')) f = 'fountain';
  if (!f && t.amenity === 'waste_basket') f = 'bin';
  if (!f && t.leisure === 'picnic_table') f = 'picnic';
  if (!f && t.barrier === 'gate') f = 'gate';
  if (!f && t.leisure === 'playground') f = 'playground';
  if (!f && t.amenity === 'post_box') f = 'postbox';
  if (!f && t.amenity === 'recycling') f = 'recycling';
  if (!f && t.man_made === 'mast') f = 'mast';
  if (!f) continue;
  const it = { t: f, x, z };
  if (t.name && (f === 'bus' || f === 'shrine')) it.n = t.name;
  furniture.push(it);
}
console.log('dettagli: barriere', barriers.length, 'linee elettriche', power.lines.length, 'sostegni', power.supports.length / 3, 'arredo', furniture.length, 'piscine', pools.length);

// ---------------------------------------------------------------- POI & indirizzi
const pois = [];
const addresses = [];
for (const n of nodes.values()) {
  if (!n.tag) continue;
  const t = tagsOf(n);
  const x = r1(px(+n.lon)), z = r1(pz(+n.lat));
  if (!inMargin(x, z)) continue;
  if (t.natural === 'tree') trees.push(x, z);
  if (t['addr:housenumber']) addresses.push({ x, z, s: t['addr:street'] || t['addr:place'] || '', n: t['addr:housenumber'] });
  const type = t.shop ? 'shop:' + t.shop : t.amenity ? t.amenity : t.tourism ? 'tourism:' + t.tourism : t.craft ? 'craft:' + t.craft : t.office ? 'office' : t.historic ? 'historic:' + t.historic : t.place ? 'place:' + t.place : t.natural === 'peak' ? 'peak' : t.man_made ? 'man_made:' + t.man_made : null;
  if (!type) continue;
  if (['bench', 'waste_basket', 'recycling', 'parking_entrance', 'vending_machine'].includes(type) && !t.name) {
    if (type === 'bench') pois.push({ x, z, t: 'bench' });
    continue;
  }
  if (type === 'information' && t.information !== 'board') continue;
  const p = { x, z, t: type };
  if (t.name) p.n = t.name;
  if (t.ele) p.e = parseFloat(t.ele);
  pois.push(p);
}
for (const b of buildings) {
  if (b.a) {
    const [x, z] = centroid(b.p);
    addresses.push({ x, z, s: b.a[0], n: b.a[1], b: 1 });
  }
  if (b.poi) {
    const [x, z] = centroid(b.p);
    const p = { x, z, t: b.poi, b: 1 };
    if (b.n || b.poi === 'place_of_worship') p.n = b.n || 'Chiesa';
    pois.push(p);
  }
}
console.log('pois', pois.length, 'real addresses', addresses.length);

// ---------------------------------------------------------------- civici stimati
// Per gli edifici abitativi senza civico in OSM assegna un numero stimato lungo la via
// più vicina (dispari a sinistra, pari a destra, crescente dall'inizio della via).
const named = roads.filter((r) => r.n && !['footway', 'path', 'track', 'cycleway', 'steps'].includes(r.t));
const streetReal = new Map();
for (const a of addresses) if (a.s) streetReal.set(a.s, (streetReal.get(a.s) || 0) + 1);
// griglia segmenti
const SEG_CELL = 50;
const segGrid = new Map();
const streetLen = new Map();
const streetSegs = [];
for (const r of named) {
  let s0 = streetLen.get(r.n) || 0;
  for (let k = 0; k + 1 < r.i.length; k++) {
    const ax = roadNodes[r.i[k] * 2], az = roadNodes[r.i[k] * 2 + 1], bx = roadNodes[r.i[k + 1] * 2], bz = roadNodes[r.i[k + 1] * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const seg = { ax, az, bx, bz, L, s0, name: r.n };
    const si = streetSegs.push(seg) - 1;
    s0 += L;
    const minx = Math.floor(Math.min(ax, bx) / SEG_CELL), maxx = Math.floor(Math.max(ax, bx) / SEG_CELL);
    const minz = Math.floor(Math.min(az, bz) / SEG_CELL), maxz = Math.floor(Math.max(az, bz) / SEG_CELL);
    for (let gx = minx; gx <= maxx; gx++) for (let gz = minz; gz <= maxz; gz++) {
      const key = gx + ',' + gz;
      if (!segGrid.has(key)) segGrid.set(key, []);
      segGrid.get(key).push(si);
    }
  }
  streetLen.set(r.n, s0);
}
function nearestStreet(x, z, maxD) {
  const gx = Math.floor(x / SEG_CELL), gz = Math.floor(z / SEG_CELL);
  let best = null, bd = maxD;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (const si of segGrid.get(gx + dx + ',' + (gz + dz)) || []) {
      const s = streetSegs[si];
      const vx = s.bx - s.ax, vz = s.bz - s.az;
      let t = ((x - s.ax) * vx + (z - s.az) * vz) / (s.L * s.L || 1);
      t = Math.max(0, Math.min(1, t));
      const qx = s.ax + vx * t, qz = s.az + vz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < bd) {
        bd = d;
        const side = vx * (z - s.az) - vz * (x - s.ax) > 0 ? 1 : 0;
        best = { name: s.name, s: s.s0 + s.L * t, side, d };
      }
    }
  }
  return best;
}
const perStreet = new Map();
for (const b of buildings) {
  const [x, z] = centroid(b.p);
  const ns = nearestStreet(x, z, 80);
  if (ns) b.st = ns.name; // via di riferimento (per la mappa e gli NPC)
  if (b.a || !['house', 'villa', 'apartments', 'farm', 'commercial', 'public', 'school'].includes(b.k)) continue;
  if (!ns || (streetReal.get(ns.name) || 0) >= 3) continue;
  if (!perStreet.has(ns.name)) perStreet.set(ns.name, []);
  perStreet.get(ns.name).push({ b, x, z, ...ns });
}
let est = 0;
for (const [name, list] of perStreet) {
  list.sort((a, b) => a.s - b.s);
  let odd = 1, even = 2;
  for (const it of list) {
    const num = it.side ? odd : even;
    if (it.side) odd += 2; else even += 2;
    it.b.a = [name, String(num), 1];
    addresses.push({ x: it.x, z: it.z, s: name, n: String(num), e: 1, b: 1 });
    est++;
  }
}
console.log('estimated house numbers', est);

// ---------------------------------------------------------------- heightmap
const demIdx = JSON.parse(fs.readFileSync(path.join(RAW, 'dem/index.json'), 'utf8'));
const tiles = new Map();
function demTile(x, y) {
  const k = x + '_' + y;
  if (!tiles.has(k)) {
    const f = path.join(RAW, 'dem', `${demIdx.z}_${x}_${y}.png`);
    tiles.set(k, fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null);
  }
  return tiles.get(k);
}
function demPixel(gx, gy) {
  const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
  const t = demTile(tx, ty);
  if (!t) return 0;
  const ix = gx - tx * 256, iy = gy - ty * 256;
  const o = (iy * 256 + ix) * 4;
  return t.data[o] * 256 + t.data[o + 1] + t.data[o + 2] / 256 - 32768;
}
function elevation(lat, lon) {
  const n = 2 ** demIdx.z * 256;
  const fx = ((lon + 180) / 360) * n - 0.5;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = demPixel(x0, y0), b = demPixel(x0 + 1, y0), c = demPixel(x0, y0 + 1), d = demPixel(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
const HM_RES = 10;
const HM_PAD = 1600;
const hx0 = Math.floor((bx0 - HM_PAD) / HM_RES) * HM_RES, hz0 = Math.floor((bz0 - HM_PAD) / HM_RES) * HM_RES;
const hw = Math.ceil((bx1 - bx0 + 2 * HM_PAD) / HM_RES) + 1, hh = Math.ceil((bz1 - bz0 + 2 * HM_PAD) / HM_RES) + 1;
const hm = new Int16Array(hw * hh);
let hmin = 1e9, hmax = -1e9;
for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
  const x = hx0 + i * HM_RES, z = hz0 + j * HM_RES;
  const lon = lon0 + x / KLON, lat = lat0 - z / KLAT;
  const e = elevation(lat, lon);
  hm[j * hw + i] = Math.round(e * 10);
  hmin = Math.min(hmin, e); hmax = Math.max(hmax, e);
}
fs.writeFileSync(path.join(OUT, 'height.bin'), Buffer.from(hm.buffer));
console.log('heightmap', hw, 'x', hh, 'min', hmin.toFixed(1), 'max', hmax.toFixed(1));

// ---------------------------------------------------------------- output
const villages = pois.filter((p) => p.t === 'place:village' || p.t === 'place:hamlet');
const carb = pois.find((p) => p.t === 'place:village' && p.n === 'Carbonara');
const world = {
  version: 1,
  source: 'OpenStreetMap contributors (ODbL) – elevazione: Terrarium/AWS Open Data (SRTM, EU-DEM)',
  generated: new Date().toISOString().slice(0, 10),
  origin: { lat: lat0, lon: lon0, klat: KLAT, klon: KLON },
  bounds: { x0: r1(bx0), x1: r1(bx1), z0: r1(bz0), z1: r1(bz1), margin: MARGIN },
  spawn: carb ? { x: carb.x, z: carb.z } : { x: 0, z: 0 },
  height: { x0: hx0, z0: hz0, w: hw, h: hh, res: HM_RES, scale: 0.1 },
  boundary,
  buildings,
  roadNodes,
  roads,
  areas,
  waterways,
  trees,
  barriers,
  power,
  furniture,
  pools,
  pois,
  addresses,
  villages: villages.map((v) => ({ x: v.x, z: v.z, n: v.n, inside: inBoundary(v.x, v.z) })),
};
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(world));
console.log('world.json', (fs.statSync(path.join(OUT, 'world.json')).size / 1e6).toFixed(2), 'MB');
