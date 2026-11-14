// Bisogni del piccione: proiettili con gravità, macchie persistenti su tetti/strade, colpi su persone e auto.
import * as THREE from 'three';
import { mulberry32 } from '../world/data.js';

const MAX_SPLATS = 500;

function splatGeometry() {
  const rnd = mulberry32(5);
  const shape = new THREE.Shape();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 * (0.65 + rnd() * 0.45) * (i % 3 === 0 ? 1.25 : 1);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  // colore: bianco con centro grigio-verde
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i));
    const c = d < 0.15 ? [0.45, 0.5, 0.38] : [0.95, 0.95, 0.9];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class PoopSystem {
  constructor(scene, world) {
    this.world = world;
    this.drops = [];
    this.splats = []; // {x,y,z,nx,ny,nz,s}
    this.mesh = new THREE.InstancedMesh(splatGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), MAX_SPLATS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.dropGeo = new THREE.SphereGeometry(0.018, 6, 5);
    this.dropMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ea });
    this.scene = scene;
    this.cooldown = 0;
    this.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._n = new THREE.Vector3();
  }

  drop(pigeon, side = 0) {
    if (this.cooldown > 0) return false;
    this.cooldown = 0.7;
    const m = new THREE.Mesh(this.dropGeo, this.dropMat);
    const back = -0.14;
    m.position.set(pigeon.pos.x + Math.sin(pigeon.heading) * back + Math.cos(pigeon.heading) * side, pigeon.pos.y + 0.1, pigeon.pos.z + Math.cos(pigeon.heading) * back - Math.sin(pigeon.heading) * side);
    this.scene.add(m);
    this.drops.push({ mesh: m, vel: new THREE.Vector3(pigeon.vel.x * 0.9, Math.min(pigeon.vel.y, 0) - 0.5, pigeon.vel.z * 0.9), life: 12 });
    this.count++;
    return true;
  }

  addSplat(x, y, z, nx, ny, nz, s) {
    this.splats.push({ x, y, z, nx, ny, nz, s });
    if (this.splats.length > MAX_SPLATS) this.splats.shift();
    this.rebuild();
  }

  rebuild() {
    const m = this._m, q = this._q, n = this._n;
    for (let i = 0; i < this.splats.length; i++) {
      const sp = this.splats[i];
      n.set(sp.nx, sp.ny, sp.nz);
      q.setFromUnitVectors(this._up, n);
      const rot = new THREE.Quaternion().setFromAxisAngle(this._up, (i * 2.399) % (Math.PI * 2));
      q.multiply(rot);
      m.compose(new THREE.Vector3(sp.x, sp.y, sp.z), q, new THREE.Vector3(sp.s, sp.s, sp.s));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.splats.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // ritorna gli eventi di impatto
  update(dt, npc) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const hits = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vel.y -= 9.8 * dt;
      d.vel.x *= 1 - 0.3 * dt;
      d.vel.z *= 1 - 0.3 * dt;
      const p = d.mesh.position;
      const steps = Math.max(1, Math.ceil((d.vel.length() * dt) / 0.3));
      let hit = null;
      const col = this.world.col;
      for (let k = 0; k < steps && !hit; k++) {
        const ox = p.x, oy = p.y, oz = p.z;
        p.addScaledVector(d.vel, dt / steps);
        const target = npc?.hitTest(p.x, p.y, p.z);
        if (target) { hit = { kind: target.kind, ref: target.ref, x: p.x, y: p.y, z: p.z }; break; }
        const solid = col.solidAt(p.x, p.y, p.z);
        if (solid && solid.kind === 'building') {
          // colpito un muro: macchia verticale sulla facciata
          const e = this.world.nearestEdge(solid.ref, ox, oz);
          if (e && e.d < 0.4 && oy < this.world.roofY(solid.ref, e.x, e.z) - 0.1) {
            hit = { kind: 'wall', ref: solid.ref, x: e.x + e.nx * 0.02, y: p.y, z: e.z + e.nz * 0.02, nx: e.nx, ny: 0, nz: e.nz };
            break;
          }
        }
        const g = col.groundAt(p.x, p.z, oy, 0.02);
        if (p.y <= g.y) {
          let nx = 0, ny = 1, nz = 0;
          if (g.kind === 'roof') {
            const e = 0.3, b = g.ref;
            const hx = this.world.roofY(b, p.x + e, p.z) - this.world.roofY(b, p.x - e, p.z);
            const hz = this.world.roofY(b, p.x, p.z + e) - this.world.roofY(b, p.x, p.z - e);
            const l = Math.hypot(hx, 2 * e, hz);
            nx = -hx / l; ny = (2 * e) / l; nz = -hz / l;
          } else if (g.kind === 'ground') {
            this.world.terrain.normalAt(p.x, p.z, this._n);
            nx = this._n.x; ny = this._n.y; nz = this._n.z;
          }
          hit = { kind: g.kind === 'roof' ? 'roof' : g.kind === 'ground' ? 'ground' : 'object', ref: g.ref, x: p.x, y: g.y + 0.015, z: p.z, nx, ny, nz };
        }
      }
      d.life -= dt;
      if (hit || d.life <= 0) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        if (hit) {
          if (hit.kind === 'roof' || hit.kind === 'ground' || hit.kind === 'wall' || hit.kind === 'object') this.addSplat(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 0.16 + Math.random() * 0.08);
          hits.push(hit);
        }
      }
    }
    return hits;
  }

  serialize() { return this.splats.slice(-300).map((s) => [s.x, s.y, s.z, s.nx, s.ny, s.nz, s.s].map((v) => Math.round(v * 1000) / 1000)); }
  load(arr) {
    this.splats = (arr || []).map((a) => ({ x: a[0], y: a[1], z: a[2], nx: a[3], ny: a[4], nz: a[5], s: a[6] }));
    this.rebuild();
  }
}
