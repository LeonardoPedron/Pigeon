// Batterie da rubare in giro per il comune (davanti ai negozi, sulle panchine, sui davanzali, vicino alle auto).
import * as THREE from 'three';
import { mulberry32 } from '../world/data.js';

const KINDS = [
  { name: 'pila stilo', amount: 18 },
  { name: 'batteria del telecomando', amount: 22 },
  { name: 'power bank', amount: 40 },
  { name: 'batteria della bici elettrica', amount: 55 },
];

export class Batteries {
  constructor(scene, world, data) {
    this.world = world;
    this.scene = scene;
    const rnd = mulberry32(2024);
    const cands = [];
    const T = world.terrain;
    // davanti a negozi/bar/POI
    for (const p of data.pois) {
      if (!p.n || p.t.startsWith('place') || p.t === 'peak') continue;
      const rec = world.buildingAt(p.x, p.z);
      if (rec?.door) cands.push({ x: rec.door.x + rec.door.nx * 0.8, z: rec.door.z + rec.door.nz * 0.8, where: 'davanti a ' + p.n });
      else cands.push({ x: p.x, z: p.z, where: 'vicino a ' + p.n });
    }
    // panchine
    for (const p of data.pois) if (p.t === 'bench') cands.push({ x: p.x, z: p.z, where: 'su una panchina', h: 0.45 });
    // davanzali/tetti di case a caso
    const houses = world.buildings.filter((b) => b.d.k === 'house' || b.d.k === 'apartments');
    for (let i = 0; i < 260 && houses.length; i++) {
      const b = houses[Math.floor(rnd() * houses.length)];
      if (rnd() < 0.5) cands.push({ x: b.door.x + b.door.nx * 0.6, z: b.door.z + b.door.nz * 0.6, where: 'davanti a una casa in ' + (b.d.st || 'campagna') });
      else cands.push({ x: b.cx, z: b.cz, roof: b, where: 'sul tetto di una casa in ' + (b.d.st || 'campagna') });
    }
    this.cands = cands.filter((c) => c.x > T.x0 && c.x < T.x1 && c.z > T.z0 && c.z < T.z1);
    this.items = [];
    this.rnd = rnd;
    const target = Math.min(170, this.cands.length);
    const used = new Set();
    while (this.items.length < target) {
      const i = Math.floor(rnd() * this.cands.length);
      if (used.has(i)) continue;
      used.add(i);
      this.items.push(this.makeItem(this.cands[i]));
    }
    // modello: pila con polo e alone
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10), new THREE.MeshLambertMaterial({ color: 0x2c8a3c, emissive: 0x0d3a12 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.035, 10), new THREE.MeshLambertMaterial({ color: 0xd4a62a }));
    top.position.y = 0.083;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    pole.position.y = 0.11;
    g.add(body, top, pole);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(120,255,140,0.9)');
    grd.addColorStop(1, 'rgba(120,255,140,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.proto = g;
    this.pool = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.stolen = 0;
    this.t = 0;
  }

  makeItem(c) {
    const kind = KINDS[Math.floor(this.rnd() * (this.rnd() < 0.85 ? 2 : 4))];
    let y;
    if (c.roof) y = this.world.roofY(c.roof, c.x, c.z);
    else y = this.world.surfaceAt(c.x, c.z).y + (c.h || 0);
    return { x: c.x, y: y + 0.02, z: c.z, kind, where: c.where, taken: false, respawn: 0 };
  }

  nearest(pos, maxD) {
    let best = null, bd = maxD;
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - pos.x, (it.y - pos.y) * 1.5, it.z - pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  steal(it) {
    it.taken = true;
    it.respawn = 240 + this.rnd() * 240; // secondi reali
    this.stolen++;
    return it.kind;
  }

  update(dt, pos) {
    this.t += dt;
    // respawn in un altro punto
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.taken) continue;
      it.respawn -= dt;
      if (it.respawn <= 0) this.items[i] = this.makeItem(this.cands[Math.floor(this.rnd() * this.cands.length)]);
    }
    const near = [];
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < 260) near.push([d, it]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const n = Math.min(near.length, 30);
    while (this.pool.length < n) {
      const g = this.proto.clone();
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.set(0.9, 0.9, 1);
      glow.position.y = 0.06;
      g.add(glow);
      this.pool.push(g);
      this.group.add(g);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const g = this.pool[i];
      if (i >= n) { g.visible = false; continue; }
      const it = near[i][1];
      g.visible = true;
      const sc = 1.6;
      g.scale.setScalar(sc);
      g.position.set(it.x, it.y + 0.05 + Math.sin(this.t * 3 + i) * 0.03, it.z);
      g.rotation.y = this.t * 1.5 + i;
    }
  }

  visibleList(pos, r) {
    return this.items.filter((it) => !it.taken && Math.hypot(it.x - pos.x, it.z - pos.z) < r);
  }
}
