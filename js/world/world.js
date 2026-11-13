// Mondo 3D: terreno a chunk con LOD, edifici, strade, acqua, alberi, lampioni, targhe dei civici, collisioni.
import * as THREE from 'three';
import { prepareBuilding, meshBuilding, roofY, insideFootprint, nearestEdge, GeoBuf } from './buildings.js';
import { buildLandCanvas, facadeTextures, industrialTexture, roofTexture, textTexture, ROAD_WIDTH, ROAD_COLOR, CLASS_ID } from './textures.js';
import { hash2, mulberry32, polyCentroid } from './data.js';

const CHUNK = 250;
const TCHUNK = 500;
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

function srgbToLinear(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function makeGeometry(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  if (buf.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.computeBoundingSphere();
  return g;
}

export class World {
  constructor(data, scene, renderer, quality) {
    this.data = data;
    this.scene = scene;
    this.renderer = renderer;
    this.terrain = data.terrain;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildings = [];
    this.grid = new Map(); // celle 16 m -> indici edifici
    this.GC = 16;
    this.bChunks = new Map();
    this.rChunks = new Map();
    this.tChunks = new Map();
    this.treeChunks = new Map();
    this.viewDist = 1500;
  }

  async build(progress) {
    const d = this.data;
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    progress(0.02, 'Disegno il territorio (campi, vigneti, boschi)…');
    await yieldFrame();
    const maxTex = this.renderer.capabilities.maxTextureSize;
    const landSize = Math.min(maxTex, this.quality === 'low' ? 2048 : 4096);
    this.land = buildLandCanvas(d, landSize);
    this.landTex = new THREE.CanvasTexture(this.land.canvas);
    this.landTex.colorSpace = THREE.SRGBColorSpace;
    this.landTex.anisotropy = aniso;
    this.landTex.generateMipmaps = true;
    this.landTex.minFilter = THREE.LinearMipmapLinearFilter;

    this.terrainMat = new THREE.MeshLambertMaterial({ map: this.landTex });
    const fac = facadeTextures(aniso);
    this.wallMat = new THREE.MeshLambertMaterial({ map: fac.map, vertexColors: true, emissive: 0xffd48a, emissiveMap: fac.emap, emissiveIntensity: 0 });
    this.indMat = new THREE.MeshLambertMaterial({ map: industrialTexture(aniso), vertexColors: true });
    this.roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(aniso), vertexColors: true });
    this.roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x4f86ad, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });

    progress(0.15, 'Costruisco ' + d.buildings.length + ' edifici reali…');
    await yieldFrame();
    // prepara edifici + griglia collisioni
    for (let i = 0; i < d.buildings.length; i++) {
      const rec = prepareBuilding(d.buildings[i], this.terrain, i);
      this.buildings.push(rec);
      const gx0 = Math.floor(rec.minx / this.GC), gx1 = Math.floor(rec.maxx / this.GC);
      const gz0 = Math.floor(rec.minz / this.GC), gz1 = Math.floor(rec.maxz / this.GC);
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const k = gx * 100003 + gz;
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(i);
      }
    }
    // mesh per chunk
    const byChunk = new Map();
    for (const rec of this.buildings) {
      const cx = Math.floor((rec.minx + rec.maxx) / 2 / CHUNK), cz = Math.floor((rec.minz + rec.maxz) / 2 / CHUNK);
      const k = cx + ',' + cz;
      if (!byChunk.has(k)) byChunk.set(k, { cx, cz, list: [] });
      byChunk.get(k).list.push(rec);
    }
    let done = 0;
    for (const [k, ch] of byChunk) {
      const walls = new GeoBuf(), ind = new GeoBuf(), roofs = new GeoBuf();
      for (const rec of ch.list) meshBuilding(rec, rec.ind ? ind : walls, roofs);
      const grp = new THREE.Group();
      for (const [buf, mat] of [[walls, this.wallMat], [ind, this.indMat], [roofs, this.roofMat]]) {
        if (!buf.count) continue;
        const m = new THREE.Mesh(makeGeometry(buf), mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        grp.add(m);
      }
      grp.userData.c = [(ch.cx + 0.5) * CHUNK, (ch.cz + 0.5) * CHUNK];
      this.group.add(grp);
      this.bChunks.set(k, grp);
      if (++done % 12 === 0) {
        progress(0.15 + 0.35 * (done / byChunk.size), 'Costruisco gli edifici… ' + Math.round((100 * done) / byChunk.size) + '%');
        await yieldFrame();
      }
    }

    progress(0.52, 'Traccio ' + d.roads.length + ' strade e vie…');
    await yieldFrame();
    this.buildRoads();
    progress(0.62, 'Modello il terreno dei Colli Euganei…');
    await yieldFrame();
    this.buildTerrainLow();
    progress(0.72, 'Pianto alberi e lampioni…');
    await yieldFrame();
    this.buildTreeAssets();
    this.buildLamps();
    this.buildPlates();
    this.computeDoors();
    progress(0.8, 'Mondo pronto');
  }

  // ------------------------------------------------------------- strade e acqua
  buildRoads() {
    const d = this.data, N = d.roadNodes, T = this.terrain;
    const bufs = new Map();
    const getBuf = (x, z, water) => {
      const k = (water ? 'w' : '') + Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
      if (!bufs.has(k)) bufs.set(k, { buf: new GeoBuf(), water, c: [(Math.floor(x / CHUNK) + 0.5) * CHUNK, (Math.floor(z / CHUNK) + 0.5) * CHUNK] });
      return bufs.get(k).buf;
    };
    const ribbon = (pts, width, color, lift, bridge, water) => {
      // densifica
      const P = [];
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(L / 6));
        for (let k = 0; k < n; k++) P.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      P.push(pts[pts.length - 1]);
      if (P.length < 2) return;
      const hw = width / 2;
      let y0 = 0, y1 = 0;
      if (bridge) { y0 = T.heightAt(P[0][0], P[0][1]); y1 = T.heightAt(P[P.length - 1][0], P[P.length - 1][1]); }
      let prevL = null, prevR = null;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        const nx = -tz, nz = tx;
        const lx = P[i][0] + nx * hw, lz = P[i][1] + nz * hw, rx = P[i][0] - nx * hw, rz = P[i][1] - nz * hw;
        let ly = T.heightAt(lx, lz) + lift, ry = T.heightAt(rx, rz) + lift;
        if (bridge) {
          const yb = y0 + ((y1 - y0) * i) / (P.length - 1) + 0.6;
          ly = Math.max(ly, yb); ry = Math.max(ry, yb);
        }
        const L = [lx, ly, lz], R = [rx, ry, rz];
        if (prevL) {
          const mx = (prevL[0] + R[0]) / 2, mz = (prevL[2] + R[2]) / 2;
          const buf = getBuf(mx, mz, water);
          const uv = [0, 0, 0, 0, 0, 0];
          buf.tri(prevL[0], prevL[1], prevL[2], prevR[0], prevR[1], prevR[2], R[0], R[1], R[2], 0, 1, 0, uv, color);
          buf.tri(prevL[0], prevL[1], prevL[2], R[0], R[1], R[2], L[0], L[1], L[2], 0, 1, 0, uv, color);
        }
        prevL = L; prevR = R;
      }
    };
    const colCache = {};
    for (const r of d.roads) {
      if (r.tu) continue;
      const pts = r.i.map((i) => [N[i * 2], N[i * 2 + 1]]);
      const c = colCache[r.t] || (colCache[r.t] = srgbToLinear(ROAD_COLOR[r.t] || '#666'));
      ribbon(pts, r.w || ROAD_WIDTH[r.t] || 3, c, ['path', 'footway', 'track', 'cycleway', 'steps', 'bridleway'].includes(r.t) ? 0.12 : 0.18, !!r.b, false);
    }
    const wc = [1, 1, 1];
    for (const w of d.waterways) {
      const wd = { river: 12, canal: 6, stream: 3, ditch: 1.6, drain: 1.6 }[w.t] || 2;
      if (wd < 2.5) continue;
      const pts = [];
      for (let i = 0; i < w.p.length; i += 2) pts.push([w.p[i], w.p[i + 1]]);
      ribbon(pts, wd, wc, 0.1, false, true);
    }
    for (const [k, v] of bufs) {
      const m = new THREE.Mesh(makeGeometry(v.buf), v.water ? this.waterMat : this.roadMat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.userData.c = v.c;
      this.group.add(m);
      this.rChunks.set(k, m);
    }
  }

  // ------------------------------------------------------------- terreno
  terrainGeometry(cx, cz, seg) {
    const T = this.terrain;
    const x0 = T.x0 + cx * TCHUNK, z0 = T.z0 + cz * TCHUNK;
    const n = seg + 1;
    const step = TCHUNK / seg;
    const W = T.x1 - T.x0, H = T.z1 - T.z0;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = Math.min(T.x1, x0 + i * step), z = Math.min(T.z1, z0 + j * step);
      pos.push(x, T.heightAt(x, z), z);
      uv.push((x - T.x0) / W, 1 - (z - T.z0) / H);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // diagonale coerente con Terrain.heightAt (da (i,j+1) a (i+1,j))
      idx.push(a, c, b, b, c, d);
    }
    // gonne lungo i bordi per nascondere le fessure tra LOD
    const skirt = (list) => {
      for (let k = 0; k + 1 < list.length; k++) {
        const a = list[k], b = list[k + 1];
        const ia = pos.length / 3;
        pos.push(pos[a * 3], pos[a * 3 + 1] - 6, pos[a * 3 + 2]);
        uv.push(uv[a * 2], uv[a * 2 + 1]);
        pos.push(pos[b * 3], pos[b * 3 + 1] - 6, pos[b * 3 + 2]);
        uv.push(uv[b * 2], uv[b * 2 + 1]);
        idx.push(a, ia, b, b, ia, ia + 1, a, b, ia, b, ia + 1, ia);
      }
    };
    const top = [], bot = [], left = [], right = [];
    for (let i = 0; i < n; i++) { top.push(i); bot.push(seg * n + i); left.push(i * n); right.push(i * n + seg); }
    skirt(top); skirt(bot); skirt(left); skirt(right);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  buildTerrainLow() {
    const T = this.terrain;
    const nx = Math.ceil((T.x1 - T.x0) / TCHUNK), nz = Math.ceil((T.z1 - T.z0) / TCHUNK);
    this.tn = [nx, nz];
    for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) {
      const mesh = new THREE.Mesh(this.terrainGeometry(cx, cz, 10), this.terrainMat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      const c = [T.x0 + (cx + 0.5) * TCHUNK, T.z0 + (cz + 0.5) * TCHUNK];
      this.group.add(mesh);
      this.tChunks.set(cx + ',' + cz, { mesh, low: mesh.geometry, high: null, mid: null, lod: 0, c, cx, cz });
    }
  }

  // ------------------------------------------------------------- vegetazione
  buildTreeAssets() {
    const mk = (parts) => {
      const geos = [];
      for (const [geo, col] of parts) {
        const g = geo.toNonIndexed();
        const n = g.attributes.position.count;
        const cols = new Float32Array(n * 3);
        const c = new THREE.Color(col);
        for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        g.deleteAttribute('uv');
        geos.push(g);
      }
      return mergeGeos(geos);
    };
    const trunk = new THREE.CylinderGeometry(0.18, 0.25, 3, 5).translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(2.6, 0).scale(1, 1.15, 1).translate(0, 4.6, 0);
    const cyprTrunk = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 5).translate(0, 0.75, 0);
    const cypr = new THREE.ConeGeometry(1.1, 9, 6).translate(0, 5.5, 0);
    this.treeGeos = [mk([[trunk, '#5a4030'], [crown, '#ffffff']]), mk([[cyprTrunk, '#5a4030'], [cypr, '#ffffff']])];
    for (const g of this.treeGeos) g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const MAX = this.quality === 'low' ? 6000 : this.quality === 'medium' ? 16000 : 30000;
    this.treeMeshes = this.treeGeos.map((g) => {
      const m = new THREE.InstancedMesh(g, mat, MAX);
      m.count = 0;
      m.castShadow = this.quality === 'high';
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(m);
      return m;
    });
    this.treeMax = MAX;
    this.treeRadius = this.quality === 'low' ? 450 : this.quality === 'medium' ? 750 : 1000;
    // alberi OSM indicizzati per chunk
    this.osmTrees = new Map();
    const tr = this.data.trees;
    for (let i = 0; i < tr.length; i += 2) {
      const k = Math.floor(tr[i] / CHUNK) + ',' + Math.floor(tr[i + 1] / CHUNK);
      if (!this.osmTrees.has(k)) this.osmTrees.set(k, []);
      this.osmTrees.get(k).push(tr[i], tr[i + 1]);
    }
  }

  treesForChunk(cx, cz) {
    const k = cx + ',' + cz;
    if (this.treeChunks.has(k)) return this.treeChunks.get(k);
    const rnd = mulberry32(cx * 73856093 ^ cz * 19349663);
    const out = [];
    const step = this.quality === 'low' ? 9 : 7;
    const T = this.terrain;
    const add = (x, z, type, s, shade) => {
      out.push(x, T.heightAt(x, z) - 0.2, z, type, s, rnd() * Math.PI * 2, shade);
    };
    for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x += step) {
      for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z += step) {
        const px = x + rnd() * step, pz = z + rnd() * step;
        const c = this.land.classAt(px, pz);
        let p = 0;
        if (c === CLASS_ID.forest) p = 0.75;
        else if (c === CLASS_ID.scrub) p = 0.3;
        else if (c === CLASS_ID.orchard) p = 0.5;
        else if (c === CLASS_ID.grass || c === CLASS_ID.cemetery) p = 0.06;
        else if (c === CLASS_ID.residential) p = 0.08;
        else if (c === CLASS_ID.farmland || c === CLASS_ID.base) p = 0.006;
        else if (c === CLASS_ID.vineyard) p = 0.004;
        if (p && rnd() < p) {
          const cypress = c === CLASS_ID.cemetery || (c === CLASS_ID.residential && rnd() < 0.3) || rnd() < 0.05;
          const s = c === CLASS_ID.orchard ? 0.45 + rnd() * 0.2 : 0.7 + rnd() * 0.6;
          add(px, pz, cypress ? 1 : 0, s, rnd());
        }
      }
    }
    const osm = this.osmTrees.get(k);
    if (osm) for (let i = 0; i < osm.length; i += 2) add(osm[i], osm[i + 1], 0, 0.8 + rnd() * 0.4, rnd());
    this.treeChunks.set(k, out);
    return out;
  }

  updateTrees(px, pz) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const key = cx + ',' + cz;
    if (key === this.treeKey) return;
    this.treeKey = key;
    const R = Math.ceil(this.treeRadius / CHUNK);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const counts = [0, 0];
    const col = new THREE.Color();
    const list = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (Math.hypot(dx, dz) > R + 0.5) continue;
      list.push([Math.hypot(dx, dz), cx + dx, cz + dz]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of list) {
      const arr = this.treesForChunk(x, z);
      for (let i = 0; i < arr.length; i += 7) {
        const type = arr[i + 3];
        const m = this.treeMeshes[type];
        if (counts[type] >= this.treeMax) continue;
        p.set(arr[i], arr[i + 1], arr[i + 2]);
        q.setFromAxisAngle(up, arr[i + 5]);
        const sc = arr[i + 4];
        s.set(sc, sc * (0.9 + arr[i + 6] * 0.3), sc);
        m4.compose(p, q, s);
        m.setMatrixAt(counts[type], m4);
        const sh = arr[i + 6];
        if (type === 0) col.setRGB(0.18 + sh * 0.12, 0.33 + sh * 0.14, 0.12 + sh * 0.05);
        else col.setRGB(0.12, 0.25 + sh * 0.06, 0.12);
        m.setColorAt(counts[type], col);
        counts[type]++;
      }
    }
    this.treeMeshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------- lampioni
  buildLamps() {
    const d = this.data, N = d.roadNodes;
    const pts = [];
    const rnd = mulberry32(42);
    for (const r of d.roads) {
      if (!r.n || ['path', 'footway', 'track', 'cycleway', 'steps', 'service'].includes(r.t)) continue;
      let acc = 0, side = 1;
      for (let k = 0; k + 1 < r.i.length; k++) {
        const ax = N[r.i[k] * 2], az = N[r.i[k] * 2 + 1], bx = N[r.i[k + 1] * 2], bz = N[r.i[k + 1] * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
        let t = 30 - acc;
        while (t < L) {
          const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
          const c = this.land.classAt(x, z);
          const near = this.buildingsNear(x, z, 40).length > 0;
          if (near && rnd() < 0.9) {
            const off = (ROAD_WIDTH[r.t] || 5) / 2 + 0.8;
            const lx = x + nx * off * side, lz = z + nz * off * side;
            if (!this.buildingAt(lx, lz)) pts.push(lx, lz, Math.atan2(-nx * side, -nz * side));
            side = -side;
          }
          t += 32;
          void c;
        }
        acc = (acc + L) % 30;
      }
    }
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 6, 5).translate(0, 3, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.2).translate(0, 5.95, 0.55);
    const head = new THREE.BoxGeometry(0.35, 0.15, 0.5).translate(0, 5.85, 1.1);
    const poleGeo = mergeGeos([pole.toNonIndexed(), arm.toNonIndexed()]);
    const n = pts.length / 3;
    this.lampPoints = pts;
    this.lampPoleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3d42 }), n);
    this.lampHeadMat = new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.lampHeadMesh = new THREE.InstancedMesh(head, this.lampHeadMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      p.set(pts[i * 3], this.terrain.heightAt(pts[i * 3], pts[i * 3 + 1]), pts[i * 3 + 1]);
      q.setFromAxisAngle(up, pts[i * 3 + 2]);
      m4.compose(p, q, one);
      this.lampPoleMesh.setMatrixAt(i, m4);
      this.lampHeadMesh.setMatrixAt(i, m4);
    }
    this.group.add(this.lampPoleMesh, this.lampHeadMesh);
    // alone luminoso notturno (sprite instanziati via Points)
    const gpos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = pts[i * 3 + 2];
      gpos[i * 3] = pts[i * 3] + Math.sin(a) * 1.1;
      gpos[i * 3 + 1] = this.terrain.heightAt(pts[i * 3], pts[i * 3 + 1]) + 5.7;
      gpos[i * 3 + 2] = pts[i * 3 + 1] + Math.cos(a) * 1.1;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,220,160,1)');
    grd.addColorStop(0.3, 'rgba(255,200,120,.45)');
    grd.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.PointsMaterial({ size: 9, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.glow = new THREE.Points(gg, this.glowMat);
    this.glow.frustumCulled = false;
    this.group.add(this.glow);
  }

  // ------------------------------------------------------------- targhe civici (sprite vicini)
  buildPlates() {
    this.plateCache = new Map();
    this.platePool = [];
    this.plateGroup = new THREE.Group();
    this.group.add(this.plateGroup);
    this.addrGrid = new Map();
    for (const a of this.data.addresses) {
      const k = Math.floor(a.x / 50) + ',' + Math.floor(a.z / 50);
      if (!this.addrGrid.has(k)) this.addrGrid.set(k, []);
      this.addrGrid.get(k).push(a);
    }
    this.plateTimer = 0;
  }

  plateMaterial(text, est) {
    const k = text + (est ? '*' : '');
    if (!this.plateCache.has(k)) {
      const { tex, aspect } = textTexture(text, { size: 40, bg: est ? '#3c4a6b' : '#1c3f94' });
      this.plateCache.set(k, { mat: new THREE.SpriteMaterial({ map: tex, depthTest: true, sizeAttenuation: true }), aspect });
    }
    return this.plateCache.get(k);
  }

  updatePlates(px, py, pz) {
    const near = [];
    const gx = Math.floor(px / 50), gz = Math.floor(pz / 50);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const a of this.addrGrid.get(gx + dx + ',' + (gz + dz)) || []) {
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d < 60) near.push([d, a]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    const n = Math.min(near.length, 40);
    while (this.platePool.length < n) {
      const s = new THREE.Sprite();
      this.platePool.push(s);
      this.plateGroup.add(s);
    }
    for (let i = 0; i < this.platePool.length; i++) {
      const s = this.platePool[i];
      if (i >= n) { s.visible = false; continue; }
      const a = near[i][1];
      if (!a.door) {
        const rec = a.b ? this.buildingAt(a.x, a.z) : null;
        a.door = rec?.door || { x: a.x, z: a.z, y: this.terrain.heightAt(a.x, a.z) + 2 };
      }
      const pm = this.plateMaterial(a.n, a.e);
      s.material = pm.mat;
      s.visible = true;
      s.position.set(a.door.x, a.door.y + 2.6, a.door.z);
      s.scale.set(0.42 * pm.aspect, 0.42, 1);
    }
  }

  computeDoors() {
    // porta = punto del perimetro più vicino al nodo stradale più vicino
    const N = this.data.roadNodes;
    this.nodeGrid = new Map();
    for (let i = 0; i < N.length / 2; i++) {
      const k = Math.floor(N[i * 2] / 40) + ',' + Math.floor(N[i * 2 + 1] / 40);
      if (!this.nodeGrid.has(k)) this.nodeGrid.set(k, []);
      this.nodeGrid.get(k).push(i);
    }
    for (const rec of this.buildings) {
      const [cx, cz] = polyCentroid(rec.outer);
      rec.c = [cx, cz];
      const ni = this.nearestNode(cx, cz, 120);
      let tx = cx + 1, tz = cz;
      if (ni >= 0) { tx = N[ni * 2]; tz = N[ni * 2 + 1]; }
      const e = nearestEdge(rec, tx, tz);
      rec.door = { x: e.x + e.nx * 0.08, z: e.z + e.nz * 0.08, y: rec.ground, nx: e.nx, nz: e.nz, node: ni };
    }
  }

  nearestNode(x, z, maxD = 200) {
    const N = this.data.roadNodes;
    const gx = Math.floor(x / 40), gz = Math.floor(z / 40);
    let best = -1, bd = maxD;
    const R = Math.ceil(maxD / 40);
    for (let r = 0; r <= R; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const i of this.nodeGrid.get(gx + dx + ',' + (gz + dz)) || []) {
          const d = Math.hypot(N[i * 2] - x, N[i * 2 + 1] - z);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0 && bd < r * 40) break;
    }
    return best;
  }

  // ------------------------------------------------------------- query
  buildingsNear(x, z, r) {
    const out = new Set();
    const g0 = Math.floor((x - r) / this.GC), g1 = Math.floor((x + r) / this.GC);
    const h0 = Math.floor((z - r) / this.GC), h1 = Math.floor((z + r) / this.GC);
    for (let gx = g0; gx <= g1; gx++) for (let gz = h0; gz <= h1; gz++) {
      const a = this.grid.get(gx * 100003 + gz);
      if (a) for (const i of a) out.add(i);
    }
    return [...out].map((i) => this.buildings[i]);
  }
  buildingAt(x, z) {
    const a = this.grid.get(Math.floor(x / this.GC) * 100003 + Math.floor(z / this.GC));
    if (!a) return null;
    for (const i of a) {
      const rec = this.buildings[i];
      if (insideFootprint(rec, x, z)) return rec;
    }
    return null;
  }
  // superficie più alta sotto (x,z): tetto o terreno
  surfaceAt(x, z) {
    const g = this.terrain.heightAt(x, z);
    const b = this.buildingAt(x, z);
    if (b) {
      const ry = roofY(b, x, z);
      if (ry > g) return { y: ry, b, ground: g };
    }
    return { y: g, b: null, ground: g };
  }
  roofY(rec, x, z) { return roofY(rec, x, z); }
  nearestEdge(rec, x, z) { return nearestEdge(rec, x, z); }

  // linea di vista libera tra due punti?
  lineOfSight(a, b) {
    const d = a.distanceTo(b);
    const n = Math.min(60, Math.ceil(d / 1.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      if (y < this.terrain.heightAt(x, z) - 0.2) return false;
      const rec = this.buildingAt(x, z);
      if (rec && y < roofY(rec, x, z) - 0.1 && y > rec.base) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- aggiornamento per frame
  setViewDistance(d) { this.viewDist = d; }

  update(pos, dt) {
    const px = pos.x, pz = pos.z;
    const vd = this.viewDist;
    const alt = Math.max(0, pos.y - this.terrain.heightAt(px, pz));
    for (const g of this.bChunks.values()) {
      const d = Math.hypot(g.userData.c[0] - px, g.userData.c[1] - pz);
      g.visible = d < vd + 200;
    }
    const roadD = Math.min(vd, 1300 + alt * 2);
    for (const m of this.rChunks.values()) {
      const d = Math.hypot(m.userData.c[0] - px, m.userData.c[1] - pz);
      m.visible = d < roadD;
    }
    // LOD terreno: alto < 700 m, medio < 1600 m, basso oltre
    let rebuilt = 0;
    for (const t of this.tChunks.values()) {
      const d = Math.max(0, Math.hypot(t.c[0] - px, t.c[1] - pz) - TCHUNK * 0.7);
      t.mesh.visible = d < vd + 400;
      const want = d < 450 ? 2 : d < 1400 ? 1 : 0;
      if (want !== t.lod) {
        if (want === 2 && !t.high) { if (rebuilt >= 1) continue; t.high = this.terrainGeometry(t.cx, t.cz, 50); rebuilt++; }
        if (want === 1 && !t.mid) { if (rebuilt >= 2) continue; t.mid = this.terrainGeometry(t.cx, t.cz, 20); rebuilt++; }
        t.mesh.geometry = want === 2 ? t.high : want === 1 ? t.mid : t.low;
        t.lod = want;
      }
    }
    this.updateTrees(px, pz);
    this.plateTimer -= dt;
    if (this.plateTimer <= 0) {
      this.plateTimer = 0.5;
      this.updatePlates(px, pos.y, pz);
    }
  }

  setNight(f) {
    this.wallMat.emissiveIntensity = f * 0.9;
    this.lampHeadMat.emissiveIntensity = f * 1.5;
    this.glowMat.opacity = f * 0.9;
    this.glow.visible = f > 0.02;
  }
}

export function mergeGeos(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const hasCol = geos.every((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export { CHUNK, hash2 };
