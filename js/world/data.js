// Caricamento dati del mondo (generati da scripts/build-data.mjs) e utilità geografiche.

async function fetchWithProgress(url, onProgress, type) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile scaricare ${url} (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) {
    onProgress?.(1);
    return type === 'json' ? res.json() : res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  if (type === 'json') return JSON.parse(new TextDecoder().decode(buf));
  return buf.buffer;
}

export async function loadWorldData(onProgress) {
  let p1 = 0, p2 = 0;
  const upd = () => onProgress?.((p1 + p2) / 2);
  const [world, hbuf] = await Promise.all([
    fetchWithProgress('data/world.json', (p) => { p1 = p; upd(); }, 'json'),
    fetchWithProgress('data/height.bin', (p) => { p2 = p; upd(); }, 'bin'),
  ]);
  world.terrain = new Terrain(world.height, hbuf);
  world.geo = new Geo(world.origin);
  return world;
}

export class Geo {
  constructor(o) { this.o = o; }
  toLatLon(x, z) { return [this.o.lat - z / this.o.klat, this.o.lon + x / this.o.klon]; }
  toXZ(lat, lon) { return [(lon - this.o.lon) * this.o.klon, -(lat - this.o.lat) * this.o.klat]; }
}

// Heightmap su griglia regolare. heightAt usa la stessa triangolazione della mesh del terreno
// (diagonale da (i,j+1) a (i+1,j)) così collisioni e grafica coincidono.
export class Terrain {
  constructor(h, buf) {
    this.x0 = h.x0; this.z0 = h.z0; this.w = h.w; this.h = h.h; this.res = h.res;
    const raw = new Int16Array(buf);
    this.data = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) this.data[i] = raw[i] * h.scale;
    this.x1 = this.x0 + (this.w - 1) * this.res;
    this.z1 = this.z0 + (this.h - 1) * this.res;
  }
  sample(i, j) {
    i = i < 0 ? 0 : i >= this.w ? this.w - 1 : i;
    j = j < 0 ? 0 : j >= this.h ? this.h - 1 : j;
    return this.data[j * this.w + i];
  }
  heightAt(x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = this.sample(i, j), h10 = this.sample(i + 1, j), h01 = this.sample(i, j + 1), h11 = this.sample(i + 1, j + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  normalAt(x, z, out) {
    const e = 2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    out.set(nx / l, ny / l, nz / l);
    return out;
  }
}

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyCentroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const f = p[i] * p[j + 1] - p[j] * p[i + 1];
    a += f; cx += (p[i] + p[j]) * f; cz += (p[i + 1] + p[j + 1]) * f;
  }
  if (Math.abs(a) < 1e-6) {
    let x = 0, z = 0;
    for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; }
    return [x / (p.length / 2), z / (p.length / 2)];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

// Generatore pseudo-casuale deterministico
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
