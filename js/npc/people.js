// Abitanti e auto con intelligenza procedurale: routine giornaliere su strade reali, lavoro nei negozi reali,
// bambini a scuola, pensionati al bar, auto dei pendolari, conversazioni casuali, reazioni al piccione.
import * as THREE from 'three';
import { mulberry32 } from '../world/data.js';
import { ROAD_WIDTH } from '../world/textures.js';
import { generateConversation, NAMES_M, NAMES_F, NAMES_KID, SURNAMES, SHOUTS } from './dialogue.js';

const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#34495e', '#16a085', '#d35400', '#7f8c8d', '#e8a1b5', '#5d6d7e', '#a9cce3', '#f5cba7'];
const PANTS = ['#2c3e50', '#34495e', '#1b2631', '#5d4037', '#4e5d6c', '#283747', '#6d5c4b', '#3b4a6b'];
const SKINS = ['#f1c9a5', '#e8b98f', '#d9a27a', '#f5d6ba', '#c68b62'];
const HAIRS = ['#2b1d14', '#4a3222', '#7a5230', '#1a1a1a', '#b88c4a', '#5a3a2a'];
const CAR_COLORS = ['#f2f2f0', '#c0c4c8', '#2a2a2e', '#a3242a', '#2b4f8a', '#6d7177', '#2f5233', '#d9cfb0', '#e8e8e8', '#8a8f96', '#1f3b5c'];
const WALK_ROAD = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track', 'bridleway']);

function col(hex) { return new THREE.Color(hex); }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }

export class NPCManager {
  constructor(world, data, scene, graph, quality) {
    this.world = world;
    this.data = data;
    this.scene = scene;
    this.g = graph;
    this.quality = quality;
    this.rnd = mulberry32(777);
    this.agents = [];
    this.cars = [];
    this.parked = [];
    this.convos = [];
    this.events = [];
    this.topicBias = [];
    this.planQueue = [];
    this.hour = 8;
    this.pool = quality === 'low' ? 28 : quality === 'medium' ? 50 : 75;
    this.carPool = quality === 'low' ? 40 : quality === 'medium' ? 70 : 100;
    this.convoTimer = 0;
    this.renderTimer = 0;
    this.buildPlaces();
    this.buildPopulation(quality === 'low' ? 300 : quality === 'medium' ? 500 : 700);
    this.buildMeshes();
  }

  // ------------------------------------------------------------------ luoghi
  placeAt(x, z, name, kind, indoor, r) {
    const rec = this.world.buildingAt(x, z);
    let px = x, pz = z;
    if (rec?.door) { px = rec.door.x + rec.door.nx * 1.2; pz = rec.door.z + rec.door.nz * 1.2; }
    let node = this.world.nearestNode(px, pz, 300);
    if (node >= 0 && !this.g.inMain(node, false)) node = this.nearestMain(px, pz, false);
    return { x: px, z: pz, node, name, kind, indoor, r: r || 4, rec };
  }

  nearestMain(x, z, car) {
    let best = -1, bd = 1e9;
    const N = this.g.N;
    for (let i = 0; i < this.g.n; i++) {
      if (!this.g.inMain(i, car)) continue;
      const d = (N[i * 2] - x) ** 2 + (N[i * 2 + 1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  buildPlaces() {
    const P = { bar: [], shop: [], church: [], school: [], town: [], bench: [], post: [], villages: [] };
    for (const p of this.data.pois) {
      const t = p.t;
      if (t === 'bench') { if (this.rnd() < 0.5) P.bench.push(this.placeAt(p.x, p.z, 'panchina', 'bench', false, 2)); continue; }
      if (!p.n) continue;
      if (['bar', 'cafe', 'pub', 'restaurant', 'ice_cream', 'fast_food'].includes(t)) P.bar.push(this.placeAt(p.x, p.z, p.n, 'bar', false, 6));
      else if (t.startsWith('shop:') || ['pharmacy', 'bank', 'tobacco', 'hairdresser'].includes(t) || t.startsWith('craft')) P.shop.push(this.placeAt(p.x, p.z, p.n, 'shop', false, 4));
      else if (t === 'post_office') { const pl = this.placeAt(p.x, p.z, p.n, 'post', false, 4); P.post.push(pl); P.shop.push(pl); }
      else if (t === 'place_of_worship') P.church.push(this.placeAt(p.x, p.z, p.n, 'church', false, 12));
      else if (['school', 'kindergarten', 'childcare'].includes(t)) P.school.push(this.placeAt(p.x, p.z, p.n, 'school', true, 10));
      else if (t === 'townhall') P.town.push(this.placeAt(p.x, p.z, p.n, 'town', false, 8));
      else if (t === 'place:village' || t === 'place:hamlet') P.villages.push({ x: p.x, z: p.z, n: p.n });
    }
    if (!P.school.length) P.school = P.church.slice();
    this.places = P;
    this.allOut = [...P.bar, ...P.shop, ...P.church, ...P.bench];
  }

  nearPlace(list, x, z, k = 3) {
    if (!list.length) return null;
    const s = list.map((p) => [Math.hypot(p.x - x, p.z - z), p]).sort((a, b) => a[0] - b[0]).slice(0, k);
    return s[Math.floor(this.rnd() * s.length)][1];
  }

  villageName(x, z) {
    let best = 'campagna', bd = 1e9;
    for (const v of this.places.villages) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v.n; }
    }
    return best;
  }

  // ------------------------------------------------------------------ popolazione
  buildPopulation(count) {
    const r = this.rnd;
    const W = this.world;
    const homes = W.buildings.filter((b) => ['house', 'villa', 'apartments', 'farm'].includes(b.d.k) && b.door.node >= 0 && this.g.inMain(b.door.node, false));
    // preferisci case nei centri abitati (vicine a POI)
    const centers = [...this.places.bar, ...this.places.shop, ...this.places.church];
    const weight = (b) => {
      let d = 1e9;
      for (const c of centers) d = Math.min(d, Math.hypot(c.x - b.c[0], c.z - b.c[1]));
      return d < 300 ? 4 : d < 700 ? 2 : 1;
    };
    const bag = [];
    for (const h of homes) { const w = weight(h); for (let i = 0; i < w; i++) bag.push(h); }
    // negozianti: uno per negozio/bar
    const workplaces = [...this.places.bar, ...this.places.shop].filter((p) => p.node >= 0);
    let id = 0;
    const mk = (role, home) => {
      const gender = r() < 0.5 ? 'm' : 'f';
      let first;
      if (role === 'child') { const k = pick(r, NAMES_KID); first = k[0]; return this.newAgent(id++, first, pick(r, SURNAMES), k[1], role, home); }
      first = gender === 'm' ? pick(r, NAMES_M) : pick(r, NAMES_F);
      return this.newAgent(id++, first, pick(r, SURNAMES), gender, role, home);
    };
    for (const wp of workplaces) {
      if (this.agents.length >= count * 0.3) break;
      const home = this.nearHome(bag, wp.x, wp.z);
      const a = mk('shopkeeper', home);
      a.work = wp;
      this.agents.push(a);
    }
    while (this.agents.length < count) {
      const home = bag[Math.floor(r() * bag.length)];
      const x = r();
      const role = x < 0.17 ? 'child' : x < 0.45 ? 'elder' : x < 0.58 ? 'farmer' : 'adult';
      this.agents.push(mk(role, home));
    }
    for (const a of this.agents) this.makeSchedule(a);
    // auto parcheggiate davanti alle case
    this.parkGrid = new Map();
    for (const h of homes) {
      if (r() > 0.42) continue;
      const pc = this.parkSpot(h);
      if (pc) this.addParked(pc);
    }
    // pendolari e traffico
    const exits = this.exitNodes();
    this.exits = exits;
    const nComm = this.quality === 'low' ? 18 : 35;
    for (let i = 0; i < nComm; i++) {
      const home = bag[Math.floor(r() * bag.length)];
      const spot = this.parkSpot(home);
      if (!spot || home.door.node < 0) continue;
      const node = this.g.inMain(home.door.node, true) ? home.door.node : this.nearestMain(home.door.x, home.door.z, true);
      this.cars.push(this.newCar('commuter', { home, spot, node, leave: 6.8 + r() * 1.8, back: 16.8 + r() * 2.8, exit: pick(r, exits) }));
    }
    const nTraffic = this.quality === 'low' ? 8 : 16;
    for (let i = 0; i < nTraffic; i++) {
      const p = pick(r, this.allOut);
      const node = this.nearestMain(p.x, p.z, true);
      this.cars.push(this.newCar('traffic', { node }));
    }
  }

  nearHome(bag, x, z) {
    let best = bag[0], bd = 1e9;
    for (let i = 0; i < 300; i++) {
      const h = bag[Math.floor(this.rnd() * bag.length)];
      const d = Math.hypot(h.c[0] - x, h.c[1] - z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  newAgent(id, first, last, gender, role, home) {
    const r = this.rnd;
    const elder = role === 'elder';
    const a = {
      id, first, last, gender, role, home,
      homePlace: { x: home.door.x + home.door.nx * 0.6, z: home.door.z + home.door.nz * 0.6, node: home.door.node, name: 'casa', kind: 'home', indoor: true, r: 3, rec: home },
      x: 0, y: 0, z: 0, yaw: 0, speed: role === 'child' ? 1.5 : elder ? 0.85 : 1.25,
      state: 'inside', path: null, pi: 0, pt: 0, dest: null, actIdx: -1, idleT: 0, wander: null,
      talkCD: 10 + r() * 30, convo: null, phase: r() * 10, stained: false, shoutCD: 0, nearT: 0,
      scale: role === 'child' ? 0.58 + r() * 0.16 : (gender === 'f' ? 0.88 : 0.93) + r() * 0.1, lean: elder ? 0.18 : 0,
      colors: {
        shirt: col(pick(r, SHIRTS)), pants: col(pick(r, PANTS)), skin: col(pick(r, SKINS)),
        hair: elder ? col(pick(r, ['#d8d8d8', '#bdbdbd', '#9e9e9e', '#eeeeee'])) : col(pick(r, HAIRS)),
      },
      hat: elder && gender === 'm' && r() < 0.5,
    };
    if (a.hat) a.colors.hair = col(pick(r, ['#5a4a3a', '#3a3a3a', '#6b5b4b']));
    return a;
  }

  makeSchedule(a) {
    const r = this.rnd;
    const j = () => (r() - 0.5) * 0.8;
    const H = a.homePlace;
    const hx = H.x, hz = H.z;
    const bar = () => this.nearPlace(this.places.bar, hx, hz) || H;
    const shop = () => this.nearPlace(this.places.shop, hx, hz) || H;
    const church = () => this.nearPlace(this.places.church, hx, hz, 2) || H;
    const walk = () => this.nearPlace(this.allOut, hx, hz, 8) || H;
    const field = () => {
      for (let k = 0; k < 20; k++) {
        const x = hx + (r() - 0.5) * 400, z = hz + (r() - 0.5) * 400;
        const c = this.world.land.classAt(x, z);
        if ([1, 5, 6].includes(c)) {
          const node = this.world.nearestNode(x, z, 120);
          if (node >= 0 && this.g.inMain(node, false)) return { x: this.g.x(node), z: this.g.z(node), node, name: 'campi', kind: 'field', indoor: false, r: 15 };
        }
      }
      return walk();
    };
    let s;
    switch (a.role) {
      case 'shopkeeper': s = [[7.2 + j(), a.work], [12.5 + j() * 0.5, H], [14.5 + j() * 0.5, a.work], [19.2 + j(), r() < 0.5 ? bar() : H], [20.6 + j(), H]]; break;
      case 'child': {
        const sc = this.nearPlace(this.places.school, hx, hz, 1) || church();
        s = [[7.6 + j() * 0.3, sc], [13.1 + j() * 0.3, H], [15.8 + j(), r() < 0.6 ? church() : walk()], [18.6 + j() * 0.5, H]];
        break;
      }
      case 'elder': s = [[8.3 + j(), r() < 0.5 ? church() : shop()], [9.8 + j(), bar()], [11.8 + j(), H], [15.3 + j(), walk()], [17.2 + j(), r() < 0.5 ? bar() : church()], [19 + j(), H]]; break;
      case 'farmer': s = [[6.8 + j(), field()], [12 + j(), H], [14 + j(), field()], [18.3 + j(), bar()], [20.5 + j(), H]]; break;
      default: s = [[8.8 + j(), shop()], [10.6 + j(), H], [16.6 + j(), walk()], [18.4 + j(), r() < 0.4 ? bar() : H], [20 + j(), H]];
    }
    a.schedule = s.sort((x, y) => x[0] - y[0]);
  }

  parkSpot(h) {
    const d = h.door;
    for (const off of [2.6, 3.4]) {
      const x = d.x + d.nx * off, z = d.z + d.nz * off;
      if (this.world.buildingAt(x, z)) continue;
      const yaw = Math.atan2(d.nx, d.nz) + Math.PI / 2;
      const ok = !this.world.buildingAt(x + Math.sin(yaw) * 2.2, z + Math.cos(yaw) * 2.2) && !this.world.buildingAt(x - Math.sin(yaw) * 2.2, z - Math.cos(yaw) * 2.2);
      if (ok) return { x, z, yaw };
    }
    return null;
  }

  addParked(spot, color) {
    const p = { kind: 'parked', x: spot.x, z: spot.z, yaw: spot.yaw, y: this.world.terrain.heightAt(spot.x, spot.z), color: col(color || pick(this.rnd, CAR_COLORS)), stained: false, id: 'p' + this.parked.length };
    this.parked.push(p);
    const k = Math.floor(p.x / 60) + ',' + Math.floor(p.z / 60);
    if (!this.parkGrid.has(k)) this.parkGrid.set(k, []);
    this.parkGrid.get(k).push(p);
    return p;
  }

  exitNodes() {
    const W = this.world, b = this.data.bounds;
    const out = [];
    for (const r of this.data.roads) {
      if (!['primary', 'secondary', 'tertiary'].includes(r.t)) continue;
      for (const i of [r.i[0], r.i[r.i.length - 1]]) {
        const x = this.g.x(i), z = this.g.z(i);
        const edge = Math.min(x - (b.x0 - b.margin), b.x1 + b.margin - x, z - (b.z0 - b.margin), b.z1 + b.margin - z);
        if (edge < 120 && this.g.inMain(i, true)) out.push(i);
      }
    }
    void W;
    return out.length ? out : [this.nearestMain(0, 0, true)];
  }

  newCar(role, o) {
    const r = this.rnd;
    return { kind: 'car', role, ...o, x: 0, y: 0, z: 0, yaw: 0, speed: 0, path: null, pi: 0, pt: 0, state: 'parked', color: col(pick(r, CAR_COLORS)), stained: false, wait: r() * 30, id: 'c' + Math.floor(r() * 1e9), honkCD: 0 };
  }

  // ------------------------------------------------------------------ mesh
  buildMeshes() {
    const M = (geo) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 200);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(200 * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = this.quality !== 'low';
      this.scene.add(m);
      return m;
    };
    this.parts = {
      legL: M(new THREE.BoxGeometry(0.14, 0.84, 0.16).translate(0, -0.42, 0)),
      legR: M(new THREE.BoxGeometry(0.14, 0.84, 0.16).translate(0, -0.42, 0)),
      torso: M(new THREE.BoxGeometry(0.42, 0.62, 0.24).translate(0, 0.31, 0)),
      armL: M(new THREE.BoxGeometry(0.1, 0.6, 0.11).translate(0, -0.3, 0)),
      armR: M(new THREE.BoxGeometry(0.1, 0.6, 0.11).translate(0, -0.3, 0)),
      head: M(new THREE.BoxGeometry(0.2, 0.25, 0.22).translate(0, 0.125, 0)),
      hair: M(new THREE.BoxGeometry(0.22, 0.09, 0.24).translate(0, 0.045, -0.01)),
      stain: M(new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.4, 1)),
      eyes: M(new THREE.BoxGeometry(0.13, 0.035, 0.02)),
      mouth: M(new THREE.BoxGeometry(0.06, 0.015, 0.02)),
      handL: M(new THREE.BoxGeometry(0.08, 0.1, 0.08)),
      handR: M(new THREE.BoxGeometry(0.08, 0.1, 0.08)),
      shoeL: M(new THREE.BoxGeometry(0.12, 0.07, 0.24)),
      shoeR: M(new THREE.BoxGeometry(0.12, 0.07, 0.24)),
    };
    const C = (geo, cap = this.carPool) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = this.quality !== 'low';
      this.scene.add(m);
      return m;
    };
    this.carParts = {
      body: C(new THREE.BoxGeometry(1.76, 0.68, 4.0).translate(0, 0.6, 0)),
      cabin: C(new THREE.BoxGeometry(1.56, 0.56, 2.1).translate(0, 1.22, -0.2)),
      glass: C(new THREE.BoxGeometry(1.6, 0.4, 2.14).translate(0, 1.2, -0.2)),
      wheel: C(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 10).rotateZ(Math.PI / 2), this.carPool * 4),
      stain: C(new THREE.SphereGeometry(0.12, 6, 4).scale(1, 0.3, 1)),
    };
    // fumetti sopra chi parla
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.font = '48px serif';
    g.textAlign = 'center';
    g.fillText('💬', 32, 50);
    this.bubbleMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false });
    this.bubbles = [];
    this.bubbleGroup = new THREE.Group();
    this.scene.add(this.bubbleGroup);
    this._m = new THREE.Matrix4();
    this._r = new THREE.Matrix4();
    this._l = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  // ------------------------------------------------------------------ percorso
  buildPath(fromX, fromZ, place, car) {
    const g = this.g;
    let start = car ? null : this.world.nearestNode(fromX, fromZ, 250);
    if (car) start = this.carNodeNear(fromX, fromZ);
    if (start >= 0 && !g.inMain(start, car)) start = this.nearestMain(fromX, fromZ, car);
    let goal = place.node;
    if (car && goal >= 0 && !g.inMain(goal, true)) goal = this.carNodeNear(place.x, place.z);
    const nodes = g.path(start, goal, car);
    if (!nodes) return null;
    const pts = [[fromX, fromZ]];
    for (let k = 0; k < nodes.length; k++) {
      const i = nodes[k];
      let ox = 0, oz = 0, cnt = 0;
      for (const kk of [k - 1, k]) {
        if (kk < 0 || kk + 1 >= nodes.length) continue;
        const a = nodes[kk], b = nodes[kk + 1];
        const e = g.edgeInfo(a, b);
        const rd = e ? g.roads[e.road] : null;
        const w = rd ? rd.w || ROAD_WIDTH[rd.t] || 4 : 4;
        let off;
        if (car) off = w / 4;
        else off = rd && WALK_ROAD.has(rd.t) ? 0 : w / 2 + 0.5;
        const dx = g.x(b) - g.x(a), dz = g.z(b) - g.z(a);
        const L = Math.hypot(dx, dz) || 1;
        // destra rispetto alla direzione di marcia
        ox += (-dz / L) * -off; oz += (dx / L) * -off; cnt++;
      }
      if (cnt) { ox /= cnt; oz /= cnt; }
      let qx = g.x(i) + ox, qz = g.z(i) + oz;
      for (let f = 0.66; f > 0 && this.world.buildingAt(qx, qz)?.solid; f -= 0.33) { qx = g.x(i) + ox * f; qz = g.z(i) + oz * f; }
      pts.push([qx, qz]);
    }
    pts.push([place.x, place.z]);
    // lunghezze
    const segs = [];
    for (let k = 0; k + 1 < pts.length; k++) segs.push(Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
    return { pts, segs, nodes };
  }

  carNodeNear(x, z) {
    const n = this.world.nearestNode(x, z, 300);
    if (n >= 0 && this.g.inMain(n, true)) return n;
    return this.nearestMain(x, z, true);
  }

  // avanza lungo il percorso; ritorna true se arrivato
  follow(e, dt, speed) {
    const p = e.path;
    if (!p) return true;
    let move = speed * dt;
    while (move > 0 && e.pi < p.segs.length) {
      const L = p.segs[e.pi];
      const left = L - e.pt;
      if (move < left) { e.pt += move; move = 0; }
      else { move -= left; e.pi++; e.pt = 0; }
    }
    if (e.pi >= p.segs.length) {
      const last = p.pts[p.pts.length - 1];
      e.x = last[0]; e.z = last[1];
      return true;
    }
    const a = p.pts[e.pi], b = p.pts[e.pi + 1];
    const L = p.segs[e.pi] || 1;
    const t = e.pt / L;
    e.x = a[0] + (b[0] - a[0]) * t;
    e.z = a[1] + (b[1] - a[1]) * t;
    if (L > 0.05) {
      const ty = Math.atan2(b[0] - a[0], b[1] - a[1]);
      let d = ty - e.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.yaw += d * Math.min(1, dt * 8);
    }
    return false;
  }

  // ------------------------------------------------------------------ simulazione
  currentActivity(a, hour) {
    const s = a.schedule;
    let idx = s.length - 1;
    for (let i = 0; i < s.length; i++) if (s[i][0] <= hour) idx = i;
    if (hour < s[0][0]) idx = s.length - 1;
    return idx;
  }

  placeAgentAt(a, place) {
    const r = this.rnd;
    const ang = r() * Math.PI * 2, d = r() * place.r;
    let x = place.x + Math.cos(ang) * d, z = place.z + Math.sin(ang) * d;
    if (this.world.buildingAt(x, z)) { x = place.x; z = place.z; }
    a.x = x; a.z = z;
  }

  arrive(a) {
    a.path = null;
    const pl = a.dest;
    if (!pl) { a.state = 'idle'; return; }
    if (pl.indoor) { a.state = 'inside'; return; }
    a.state = 'idle';
    a.idleT = 2 + this.rnd() * 6;
  }

  setDestination(a, place, immediate) {
    a.dest = place;
    if (immediate) {
      this.placeAgentAt(a, place);
      a.state = place.indoor ? 'inside' : 'idle';
      a.path = null;
      return;
    }
    if (a.state === 'inside') {
      // esce dalla porta
      const from = a.dest === a.homePlace ? a.homePlace : a.lastPlace || a.homePlace;
      void from;
    }
    a.state = 'plan';
    this.planQueue.push(a);
  }

  init(hour) {
    this.hour = hour;
    for (const a of this.agents) {
      const idx = this.currentActivity(a, hour);
      a.actIdx = idx;
      const pl = a.schedule[idx][1];
      a.lastPlace = pl;
      this.setDestination(a, pl, true);
    }
    for (const c of this.cars) this.initCar(c, hour);
  }

  initCar(c, hour) {
    if (c.role === 'commuter') {
      const away = hour > c.leave && hour < c.back;
      if (away) { c.state = 'away'; }
      else { c.state = 'parked'; c.x = c.spot.x; c.z = c.spot.z; c.yaw = c.spot.yaw; }
    } else {
      c.x = this.g.x(c.node); c.z = this.g.z(c.node);
      c.state = 'parked';
      c.wait = this.rnd() * 20;
    }
  }

  carTrip(c, place) {
    const path = this.buildPath(c.x, c.z, place, true);
    if (!path) { c.wait = 30; return false; }
    c.path = path; c.pi = 0; c.pt = 0; c.state = 'driving'; c.destPlace = place;
    return true;
  }

  update(dt, hour, pigeon) {
    this.hour = hour;
    const r = this.rnd;
    // pianificazione (poche A* per frame)
    let budget = 5;
    while (this.planQueue.length && budget-- > 0) {
      const a = this.planQueue.shift();
      if (a.state !== 'plan') continue;
      let sx = a.x, sz = a.z;
      if (a.wasInside && a.lastPlace) { sx = a.lastPlace.x; sz = a.lastPlace.z; a.x = sx; a.z = sz; }
      const p = this.buildPath(sx, sz, a.dest, false);
      if (!p) { this.setDestination(a, a.dest, true); continue; }
      a.path = p; a.pi = 0; a.pt = 0; a.state = 'walk';
    }
    const px = pigeon.pos.x, pz = pigeon.pos.z;
    for (const a of this.agents) {
      a.shoutCD = Math.max(0, a.shoutCD - dt);
      a.talkCD -= dt;
      if (!a.special || a.special.schedule) {
        const idx = this.currentActivity(a, hour);
        if (idx !== a.actIdx && a.state !== 'talk') {
          a.actIdx = idx;
          a.wasInside = a.state === 'inside';
          a.lastPlace = a.dest;
          this.setDestination(a, a.schedule[idx][1], false);
        }
      }
      if (a.special?.update) a.special.update(a, dt, hour);
      switch (a.state) {
        case 'walk': {
          // lontano dal piccione il tragitto viene compresso nel tempo (1 ora di gioco = 1 minuto reale)
          const far = Math.hypot(a.x - px, a.z - pz) > 350 && !a.special;
          const arrived = this.follow(a, dt, a.speed * (far ? 25 : 1));
          a.phase += dt * a.speed * 5.5;
          if (arrived) this.arrive(a);
          break;
        }
        case 'idle': {
          a.idleT -= dt;
          if (a.wander) {
            const dx = a.wander[0] - a.x, dz = a.wander[1] - a.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15) a.wander = null;
            else {
              const s = Math.min(d, 0.6 * dt);
              a.x += (dx / d) * s; a.z += (dz / d) * s;
              a.yaw = Math.atan2(dx, dz);
              a.phase += dt * 3;
            }
          } else if (a.idleT <= 0) {
            a.idleT = 4 + r() * 10;
            const pl = a.dest;
            if (pl && r() < 0.6) {
              const ang = r() * Math.PI * 2, d = r() * pl.r;
              const x = pl.x + Math.cos(ang) * d, z = pl.z + Math.sin(ang) * d;
              if (!this.world.buildingAt(x, z)) a.wander = [x, z];
            } else a.yaw += (r() - 0.5) * 2;
          }
          break;
        }
        case 'talk': {
          const o = a.convo.a === a ? a.convo.b : a.convo.a;
          a.yaw = Math.atan2(o.x - a.x, o.z - a.z);
          break;
        }
        default: break;
      }
      if (a.state !== 'inside' && a.state !== 'plan') {
        a.y = this.world.terrain.heightAt(a.x, a.z);
        // reazione alla vicinanza del piccione a terra
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d < 1.6 && Math.abs(pigeon.pos.y - a.y) < 1.5) {
          a.nearT += dt;
          if (a.nearT > 2.5 && a.shoutCD <= 0) {
            a.shoutCD = 25;
            a.nearT = 0;
            this.say(a, pick(r, SHOUTS.near), 'near');
          }
        } else a.nearT = 0;
      }
    }
    this.updateCars(dt, hour, pigeon);
    this.convoTimer -= dt;
    if (this.convoTimer <= 0) { this.convoTimer = 0.5; this.findConversations(px, pz); }
    this.updateConversations(dt, pigeon);
    this.separate(dt);
    this.renderTimer -= dt;
    this.render(pigeon);
  }

  updateCars(dt, hour, pigeon) {
    const r = this.rnd;
    for (const c of this.cars) {
      c.honkCD = Math.max(0, c.honkCD - dt);
      if (c.role === 'commuter') {
        const away = hour > c.leave && hour < c.back;
        if (c.state === 'parked' && away && hour < c.leave + 1) {
          const ex = { x: this.g.x(c.exit), z: this.g.z(c.exit), node: c.exit };
          if (!this.carTrip(c, ex)) c.state = 'away';
          else c.goingAway = true;
        } else if (c.state === 'away' && !away && hour >= c.back) {
          c.x = this.g.x(c.exit); c.z = this.g.z(c.exit);
          const home = { x: c.spot.x, z: c.spot.z, node: c.node };
          if (this.carTrip(c, home)) c.goingAway = false;
          else { c.state = 'parked'; c.x = c.spot.x; c.z = c.spot.z; c.yaw = c.spot.yaw; }
        } else if (c.state === 'parked' && away && hour >= c.leave + 1) {
          c.state = 'away';
        }
      } else if (c.state === 'parked') {
        c.wait -= dt;
        if (c.wait <= 0) {
          const p = pick(r, this.allOut);
          if (!this.carTrip(c, { x: p.x, z: p.z, node: this.carNodeNear(p.x, p.z) })) c.wait = 20;
        }
      }
      if (c.state !== 'driving') { c.speed = 0; continue; }
      // velocità desiderata
      const p = c.path;
      let target = 11;
      const e = p.nodes && p.nodes[Math.min(p.nodes.length - 1, Math.max(0, c.pi - 1))];
      const ri = e !== undefined ? this.g.roadOf[e] : -1;
      if (ri >= 0) {
        const t = this.g.roads[ri].t;
        target = ['primary', 'secondary'].includes(t) ? 14 : t === 'tertiary' ? 12 : t === 'residential' || t === 'unclassified' ? 9 : 6;
      }
      // curva in arrivo
      if (c.pi + 2 < p.pts.length) {
        const a = p.pts[c.pi], b = p.pts[c.pi + 1], d = p.pts[c.pi + 2];
        const a1 = Math.atan2(b[0] - a[0], b[1] - a[1]), a2 = Math.atan2(d[0] - b[0], d[1] - b[1]);
        let da = Math.abs(a2 - a1);
        if (da > Math.PI) da = Math.PI * 2 - da;
        const left = p.segs[c.pi] - c.pt;
        if (da > 0.6 && left < 25) target = Math.min(target, 5 + left * 0.25);
      }
      // ostacoli davanti: auto, persone, piccione
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const ahead = (x, z, y, dist) => {
        const dx = x - c.x, dz = z - c.z;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        return along > 0 && along < dist && lat < 1.6 && (y === undefined || Math.abs(y - c.y) < 2);
      };
      for (const o of this.cars) if (o !== c && o.state === 'driving' && ahead(o.x, o.z, undefined, 12)) target = Math.min(target, Math.max(0, o.speed - 1));
      if (pigeon.mode === 'ground' && ahead(pigeon.pos.x, pigeon.pos.z, pigeon.pos.y, 9)) {
        target = Math.min(target, 1.5);
        if (c.honkCD <= 0) { c.honkCD = 6; this.events.push({ type: 'honk', x: c.x, z: c.z }); }
      }
      c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), (target < c.speed ? 7 : 3) * dt);
      const farC = Math.hypot(c.x - pigeon.pos.x, c.z - pigeon.pos.z) > 500;
      const arrived = this.follow(c, dt, c.speed * (farC ? 4 : 1));
      c.y = this.world.terrain.heightAt(c.x, c.z);
      // investimento del piccione
      const dx = pigeon.pos.x - c.x, dz = pigeon.pos.z - c.z;
      const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (Math.abs(along) < 2.2 && Math.abs(lat) < 1.0 && pigeon.pos.y - c.y < 1.25 && pigeon.support?.ref !== c && c.speed > 2.5) {
        pigeon.knock(fx, fz, c.speed * 0.8);
        this.events.push({ type: 'carHit', x: c.x, z: c.z });
        this.say({ x: c.x, y: c.y, z: c.z, first: 'Automobilista', last: '' }, pick(r, SHOUTS.car), 'car');
      }
      if (arrived) {
        c.path = null;
        c.speed = 0;
        if (c.role === 'commuter') {
          if (c.goingAway) c.state = 'away';
          else { c.state = 'parked'; c.x = c.spot.x; c.z = c.spot.z; c.yaw = c.spot.yaw; }
        } else { c.state = 'parked'; c.wait = 25 + r() * 60; }
      }
    }
  }

  // ------------------------------------------------------------------ conversazioni
  findConversations(px, pz) {
    const r = this.rnd;
    const cand = this.agents.filter((a) => (a.state === 'walk' || a.state === 'idle') && a.talkCD <= 0 && !a.convo && Math.hypot(a.x - px, a.z - pz) < 500 && !a.special?.noTalk);
    for (let i = 0; i < cand.length; i++) {
      const a = cand[i];
      if (a.convo) continue;
      for (let j = i + 1; j < cand.length; j++) {
        const b = cand[j];
        if (b.convo) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        const both = a.state === 'idle' && b.state === 'idle';
        if (a.special?.topic && b.special?.topic && d < 20) { this.startConversation(a, b); break; }
        if ((a.special?.topic || b.special?.topic) && !(a.special?.topic && b.special?.topic) && r() < 0.8) continue;
        const samePlace = both && a.dest && a.dest === b.dest;
        const maxD = samePlace ? a.dest.r * 2 + 6 : both ? 8 : 4;
        if (d < maxD && r() < (both ? 0.55 : 0.3)) {
          if ((a.role === 'child') !== (b.role === 'child') && r() < 0.7) continue;
          this.startConversation(a, b);
          break;
        }
      }
    }
  }

  biasAt(x, z) {
    for (const b of this.topicBias) if (Math.hypot(b.x - x, b.z - z) < b.r && this.rnd() < b.p) return b.topic;
    return null;
  }

  startConversation(a, b, forced) {
    const r = this.rnd;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const others = this.agents.filter((o) => o !== a && o !== b);
    const other = pick(r, others), otherF = others.find((o) => o.gender === 'f' && r() < 0.2) || pick(r, others);
    const vills = this.places.villages.map((v) => v.n);
    const ctx = {
      hour: this.hour, rnd: r,
      village: this.villageName(mx, mz), village2: pick(r, vills) || 'Bastia',
      street: this.streetNear(mx, mz) || 'via Roma',
      other: other.first + ' ' + other.last, otherF: otherF.first,
    };
    const topic = forced || a.special?.topic || b.special?.topic || this.biasAt(mx, mz);
    const conv = generateConversation(a, b, ctx, topic);
    const c = { a, b, ...conv, idx: -1, t: 0, x: mx, z: mz, heard: 0, id: Math.floor(r() * 1e9), forced: !!topic };
    for (const p of [a, b]) {
      p.prevState = p.state === 'talk' ? p.prevState : p.state;
      p.state = 'talk';
      p.convo = c;
    }
    this.convos.push(c);
    return c;
  }

  streetNear(x, z) {
    const n = this.world.nearestNode(x, z, 150);
    if (n < 0) return null;
    for (const e of this.g.adj[n]) { const rd = this.g.roads[e.road]; if (rd.n) return rd.n; }
    const ri = this.g.roadOf[n];
    return ri >= 0 ? this.g.roads[ri].n : null;
  }

  updateConversations(dt, pigeon) {
    for (let i = this.convos.length - 1; i >= 0; i--) {
      const c = this.convos[i];
      c.t -= dt;
      c.x = (c.a.x + c.b.x) / 2; c.z = (c.a.z + c.b.z) / 2;
      if (c.t <= 0) {
        c.idx++;
        if (c.idx >= c.lines.length) {
          this.convos.splice(i, 1);
          for (const p of [c.a, c.b]) {
            p.convo = null;
            p.state = p.prevState === 'walk' && p.path ? 'walk' : p.prevState === 'plan' ? 'plan' : 'idle';
            if (p.state === 'idle') p.idleT = 2;
            p.talkCD = 45 + this.rnd() * 60;
          }
          this.events.push({ type: 'convoEnd', convo: c, fraction: c.heard / c.lines.length });
          continue;
        }
        const line = c.lines[c.idx];
        c.t = 1.6 + line.text.length * 0.05;
        const y = this.world.terrain.heightAt(c.x, c.z) + 1.5;
        const d = Math.hypot(c.x - pigeon.pos.x, c.z - pigeon.pos.z, (y - pigeon.pos.y) * 0.6);
        const heard = d < 16;
        if (heard) c.heard++;
        this.events.push({ type: 'line', convo: c, line, heard, dist: d });
      }
    }
  }

  say(a, text, kind) {
    this.events.push({ type: 'say', who: a, text, kind, x: a.x, z: a.z });
  }

  // collisori dinamici vicini (per piccione, camera, bisogni)
  collidersNear(x, z, r) {
    const people = [], cars = [];
    for (const a of this.visibleAgents || []) if (Math.abs(a.x - x) < r && Math.abs(a.z - z) < r) people.push(a);
    for (const c of this.visibleCars || []) if (Math.abs(c.x - x) < r + 2 && Math.abs(c.z - z) < r + 2) cars.push(c);
    return { people, cars };
  }

  separate(dt) {
    const v = this.visibleAgents || [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i];
      if (a.state === 'talk') continue;
      for (let j = i + 1; j < v.length; j++) {
        const b = v[j];
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
        const m = 0.55 * Math.max(a.scale, b.scale);
        if (d > 1e-4 && d < m) {
          const push = ((m - d) / 2) * Math.min(1, dt * 8);
          const nx = dx / d, nz = dz / d;
          if (!this.world.buildingAt(a.x + nx * push, a.z + nz * push)?.solid) { a.x += nx * push; a.z += nz * push; }
          if (b.state !== 'talk' && !this.world.buildingAt(b.x - nx * push, b.z - nz * push)?.solid) { b.x -= nx * push; b.z -= nz * push; }
        }
      }
    }
  }

  // ------------------------------------------------------------------ interazioni
  visiblePeople() { return this.agents.filter((a) => a.state !== 'inside' && a.state !== 'plan'); }

  hitTest(x, y, z) {
    for (const a of this.agents) {
      if (a.state === 'inside' || a.state === 'plan') continue;
      const dx = a.x - x, dz = a.z - z;
      if (dx * dx + dz * dz > 0.16 * a.scale + 0.05) continue;
      if (y >= a.y && y <= a.y + 1.85 * a.scale) return { kind: 'person', ref: a };
    }
    const carHit = (c) => {
      const dx = x - c.x, dz = z - c.z;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      return Math.abs(along) < 2 && Math.abs(lat) < 0.9 && y >= c.y && y <= c.y + 1.5;
    };
    for (const c of this.cars) if ((c.state === 'driving' || c.state === 'parked') && carHit(c)) return { kind: 'car', ref: c };
    const k = Math.floor(x / 60) + ',' + Math.floor(z / 60);
    for (const p of this.parkGrid.get(k) || []) if (carHit(p)) return { kind: 'car', ref: p };
    return null;
  }

  onPooped(hit) {
    const r = this.rnd;
    if (hit.kind === 'person') {
      const a = hit.ref;
      a.stained = true;
      this.say(a, pick(r, SHOUTS.pooped), 'pooped');
      a.shoutCD = 10;
      // gli altri vicini ridono
      for (const o of this.agents) {
        if (o === a || o.state === 'inside' || o.state === 'plan') continue;
        if (Math.hypot(o.x - a.x, o.z - a.z) < 10 && r() < 0.5) { this.say(o, pick(r, SHOUTS.laugh), 'laugh'); break; }
      }
    } else if (hit.kind === 'car') {
      hit.ref.stained = true;
      // il proprietario, se vicino, si arrabbia
      for (const o of this.agents) {
        if (o.state === 'inside' || o.state === 'plan') continue;
        if (Math.hypot(o.x - hit.ref.x, o.z - hit.ref.z) < 15) { this.say(o, pick(r, SHOUTS.carPooped), 'pooped'); break; }
      }
    }
  }

  // qualcuno vede il piccione?
  witnesses(pos, maxD = 14) {
    const out = [];
    for (const a of this.agents) {
      if (a.state === 'inside' || a.state === 'plan') continue;
      const dx = pos.x - a.x, dz = pos.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD) continue;
      const facing = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) / (d || 1);
      if (d > 3 && facing < 0.1) continue;
      if (a.state === 'talk' && d > 6) continue;
      const eye = new THREE.Vector3(a.x, a.y + 1.6 * a.scale, a.z);
      if (this.world.lineOfSight(eye, pos)) out.push(a);
    }
    return out;
  }

  // ------------------------------------------------------------------ speciali per le missioni
  addSpecial(o) {
    const home = o.home || this.world.buildingAt(o.place.x, o.place.z) || this.agents[0].home;
    const a = this.newAgent(this.agents.length + 1000, o.first, o.last, o.gender || 'm', o.role || 'adult', home);
    a.special = o;
    a.title = o.title;
    if (o.colors) for (const k in o.colors) a.colors[k] = col(o.colors[k]);
    if (o.hat !== undefined) a.hat = o.hat;
    if (o.speed) a.speed = o.speed;
    a.schedule = [[0, o.place]];
    a.dest = o.place;
    this.placeAgentAt(a, o.place);
    a.state = 'idle';
    a.y = this.world.terrain.heightAt(a.x, a.z);
    a.talkCD = o.talkCD ?? 5;
    this.agents.push(a);
    return a;
  }
  removeAgent(a) {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    if (a.convo) {
      const c = a.convo;
      const j = this.convos.indexOf(c);
      if (j >= 0) this.convos.splice(j, 1);
      for (const p of [c.a, c.b]) { p.convo = null; if (p.state === 'talk') p.state = 'idle'; }
    }
  }
  sendTo(a, place) {
    a.wasInside = false;
    a.dest = place;
    a.state = 'plan';
    this.planQueue.unshift(a);
  }

  // ------------------------------------------------------------------ rendering
  render(pigeon) {
    const px = pigeon.pos.x, pz = pigeon.pos.z;
    // persone più vicine
    const vis = [];
    for (const a of this.agents) {
      if (a.state === 'inside' || a.state === 'plan') continue;
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < 260 || a.special?.alwaysShow && d < 600) vis.push([d, a]);
    }
    vis.sort((x, y) => x[0] - y[0]);
    const n = Math.min(vis.length, this.pool);
    const P = this.parts;
    const m = this._m, R = this._r, L = this._l, q = this._q, v = this._v, s = this._s, e = this._e;
    const set = (mesh, i, local, color) => {
      m.multiplyMatrices(R, local);
      mesh.setMatrixAt(i, m);
      if (color) mesh.setColorAt(i, color);
    };
    const part = (x, y, z, rx) => { e.set(rx, 0, 0); q.setFromEuler(e); v.set(x, y, z); s.set(1, 1, 1); return L.compose(v, q, s); };
    const white = new THREE.Color(0xf4f4ee), dark = new THREE.Color(0x1a1410), lips = new THREE.Color(0x8a4a3a), shoe = new THREE.Color(0x2a2420);
    this.visibleAgents = [];
    for (let i = 0; i < n; i++) {
      const a = vis[i][1];
      this.visibleAgents.push(a);
      a.renderIdx = i;
      const walking = a.state === 'walk' || (a.state === 'idle' && a.wander);
      const sw = walking ? Math.sin(a.phase) * 0.55 : 0;
      const talkArm = a.state === 'talk' && a.convo && a.convo.lines[a.convo.idx]?.who === a ? Math.sin(performance.now() / 180 + a.id) * 0.4 - 0.5 : 0;
      q.setFromAxisAngle(v.set(0, 1, 0), a.yaw);
      R.compose(v.set(a.x, a.y, a.z), q, s.set(a.scale, a.scale, a.scale));
      set(P.legL, i, part(0.1, 0.86, 0, sw), a.colors.pants);
      a.renderSw = sw;
      set(P.legR, i, part(-0.1, 0.86, 0, -sw), a.colors.pants);
      set(P.torso, i, part(0, 0.84, 0, a.lean), a.colors.shirt);
      set(P.armL, i, part(0.27, 1.42, 0, -sw * 0.8), a.colors.shirt);
      set(P.armR, i, part(-0.27, 1.42, 0, sw * 0.8 + talkArm), a.colors.shirt);
      const hz = a.lean * 0.6;
      set(P.head, i, part(0, 1.47, hz, 0), a.colors.skin);
      const hairL = part(0, 1.71, hz, 0);
      if (a.hat) L.scale(v.set(1.25, 1.1, 1.35));
      if (a.special?.hood) L.scale(v.set(1.5, 3.2, 1.5));
      set(P.hair, i, hairL, a.colors.hair);
      const st = part(0.05, 1.8, hz, 0);
      if (!a.stained) L.scale(v.set(0.001, 0.001, 0.001));
      set(P.stain, i, st, white);
      set(P.eyes, i, part(0, 1.62, hz + 0.112, 0), dark);
      set(P.mouth, i, part(0, 1.53, hz + 0.112, 0), lips);
      // mani alla fine delle braccia, scarpe sotto le gambe (seguono l'oscillazione)
      const swA = -sw * 0.8, swB = sw * 0.8 + talkArm;
      set(P.handL, i, part(0.27, 1.42 - Math.cos(swA) * 0.62, Math.sin(swA) * 0.62, swA), a.colors.skin);
      set(P.handR, i, part(-0.27, 1.42 - Math.cos(swB) * 0.62, Math.sin(swB) * 0.62, swB), a.colors.skin);
      set(P.shoeL, i, part(0.1, 0.86 - Math.cos(sw) * 0.84 + 0.0, Math.sin(sw) * 0.84 + 0.04, sw), shoe);
      set(P.shoeR, i, part(-0.1, 0.86 - Math.cos(-sw) * 0.84 + 0.0, Math.sin(-sw) * 0.84 + 0.04, -sw), shoe);
    }
    for (const k in P) {
      P[k].count = n;
      P[k].instanceMatrix.needsUpdate = true;
      if (P[k].instanceColor) P[k].instanceColor.needsUpdate = true;
    }
    // fumetti
    let bi = 0;
    for (const c of this.convos) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > 120) continue;
      if (bi >= this.bubbles.length) { const sp = new THREE.Sprite(this.bubbleMat); this.bubbles.push(sp); this.bubbleGroup.add(sp); }
      const sp = this.bubbles[bi++];
      const sp2 = c.lines[Math.max(0, c.idx)]?.who || c.a;
      sp.visible = true;
      sp.position.set(sp2.x, sp2.y + 2.25 * sp2.scale, sp2.z);
      const sc = Math.max(0.6, d * 0.03);
      sp.scale.set(sc, sc, 1);
    }
    for (let i = bi; i < this.bubbles.length; i++) this.bubbles[i].visible = false;
    // auto: in movimento + parcheggiate vicine
    const carVis = [];
    for (const c of this.cars) {
      if (c.state !== 'driving' && c.state !== 'parked') continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < 450) carVis.push([d, c]);
    }
    const gx = Math.floor(px / 60), gz = Math.floor(pz / 60);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      for (const p of this.parkGrid.get(gx + dx + ',' + (gz + dz)) || []) {
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d < 300) carVis.push([d, p]);
      }
    }
    carVis.sort((x, y) => x[0] - y[0]);
    const cn = Math.min(carVis.length, this.carPool);
    const C = this.carParts;
    const glass = new THREE.Color(0x26303a), tire = new THREE.Color(0x1a1a1a);
    this.visibleCars = [];
    for (let i = 0; i < cn; i++) {
      const c = carVis[i][1];
      this.visibleCars.push(c);
      if (c.y === undefined || c.kind === 'car') c.y = this.world.terrain.heightAt(c.x, c.z);
      q.setFromAxisAngle(v.set(0, 1, 0), c.yaw);
      R.compose(v.set(c.x, c.y, c.z), q, s.set(1, 1, 1));
      L.identity();
      set(C.body, i, L, c.color);
      set(C.cabin, i, L, c.color);
      L.makeScale(1, 1, 0.96);
      set(C.glass, i, L, glass);
      for (let w = 0; w < 4; w++) {
        const wx = w % 2 ? 0.82 : -0.82, wz = w < 2 ? 1.3 : -1.3;
        L.makeTranslation(wx, 0.32, wz);
        set(C.wheel, i * 4 + w, L, tire);
      }
      L.makeTranslation(0.2, 1.5, -0.3);
      if (!c.stained) L.scale(v.set(0.001, 0.001, 0.001));
      set(C.stain, i, L, white);
    }
    for (const k in C) {
      C[k].count = k === 'wheel' ? cn * 4 : cn;
      C[k].instanceMatrix.needsUpdate = true;
      if (C[k].instanceColor) C[k].instanceColor.needsUpdate = true;
    }
  }
}
