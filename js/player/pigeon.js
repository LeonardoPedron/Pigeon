// Il piccione-robot spia: modello procedurale con cappello da spia, animazioni, fisica di volo/camminata, batteria.
import * as THREE from 'three';

function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }

export function buildPigeonModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const grey = mat(0x8c95aa), light = mat(0xa7afc2), dark = mat(0x3f4554), irid = new THREE.MeshPhongMaterial({ color: 0x4f8a72, emissive: 0x241540, shininess: 80, specular: 0xb070ff });
  const add = (parent, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const torso = add(body, new THREE.SphereGeometry(0.1, 12, 9), grey, 0, 0.13, 0);
  torso.scale.set(0.95, 0.85, 1.55);
  const chest = add(body, new THREE.SphereGeometry(0.07, 10, 8), irid, 0, 0.17, 0.09);
  chest.scale.set(1, 1.1, 0.9);
  // testa (pivot al collo per il tipico movimento avanti-indietro)
  const neck = new THREE.Group();
  neck.position.set(0, 0.2, 0.12);
  body.add(neck);
  add(neck, new THREE.SphereGeometry(0.052, 10, 8), light, 0, 0.04, 0.03);
  const beak = add(neck, new THREE.ConeGeometry(0.011, 0.045, 6), mat(0x3a3530), 0, 0.03, 0.095);
  beak.rotation.x = Math.PI / 2;
  add(neck, new THREE.SphereGeometry(0.012, 6, 5), mat(0xf2f0ea), 0, 0.045, 0.075); // cera
  const eyeL = add(neck, new THREE.SphereGeometry(0.011, 8, 6), mat(0xff7a1a, { emissive: 0x552200 }), 0.04, 0.055, 0.05);
  const eyeR = add(neck, new THREE.SphereGeometry(0.013, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), -0.04, 0.055, 0.05); // occhio bionico
  add(neck, new THREE.TorusGeometry(0.016, 0.004, 5, 10), mat(0x777b84), -0.043, 0.055, 0.05).rotation.y = Math.PI / 2;
  void eyeL; void eyeR;
  // cappello da spia (fedora)
  const hat = new THREE.Group();
  hat.position.set(0, 0.085, 0.02);
  hat.rotation.z = -0.12;
  hat.rotation.x = -0.08;
  neck.add(hat);
  const hatMat = mat(0x1c1c22);
  add(hat, new THREE.CylinderGeometry(0.085, 0.085, 0.006, 18), hatMat, 0, 0, 0);
  add(hat, new THREE.CylinderGeometry(0.044, 0.052, 0.05, 14), hatMat, 0, 0.027, 0);
  add(hat, new THREE.CylinderGeometry(0.0525, 0.0525, 0.013, 14), mat(0x8b1e2d), 0, 0.01, 0);
  // antenna
  add(hat, new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 4), mat(0x999999), 0.025, 0.08, -0.01);
  const led = add(hat, new THREE.SphereGeometry(0.007, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0.025, 0.117, -0.01);
  // ali
  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.075 * side, 0.18, 0.04);
    body.add(pivot);
    const w = new THREE.Group();
    pivot.add(w);
    const inner = add(w, new THREE.BoxGeometry(0.13, 0.012, 0.13), grey, 0.065 * side, 0, -0.02);
    const outer = add(w, new THREE.BoxGeometry(0.13, 0.008, 0.1), grey, 0.19 * side, 0, -0.035);
    add(w, new THREE.BoxGeometry(0.09, 0.009, 0.07), dark, 0.25 * side, 0, -0.05);
    add(w, new THREE.BoxGeometry(0.1, 0.013, 0.018), dark, 0.07 * side, 0.002, -0.06); // barre scure
    void inner; void outer;
    wings.push({ pivot, side });
  }
  // coda
  const tail = new THREE.Group();
  tail.position.set(0, 0.14, -0.15);
  body.add(tail);
  add(tail, new THREE.BoxGeometry(0.09, 0.01, 0.12), grey, 0, 0, -0.06);
  add(tail, new THREE.BoxGeometry(0.09, 0.011, 0.025), dark, 0, 0, -0.115);
  // zampe
  const legs = [];
  const legMat = mat(0xc4515a);
  for (const side of [1, -1]) {
    const lp = new THREE.Group();
    lp.position.set(0.03 * side, 0.07, 0.01);
    body.add(lp);
    add(lp, new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4), legMat, 0, -0.035, 0);
    add(lp, new THREE.BoxGeometry(0.03, 0.005, 0.04), legMat, 0, -0.07, 0.012);
    legs.push(lp);
  }
  root.userData = { body, neck, wings, tail, legs, led, hat };
  return root;
}

export class Pigeon {
  constructor(world, scene) {
    this.world = world;
    this.model = buildPigeonModel();
    scene.add(this.model);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.mode = 'ground';
    this.battery = 100;
    this.phase = 0;
    this.spread = 0;
    this.flapT = 0;
    this.headBob = 0;
    this.onBuilding = null;
    this.stats = { flown: 0, walked: 0 };
    this.events = [];
    this.knockT = 0;
    this.lowWarned = 0;
  }

  place(x, z, y) {
    const s = this.world.surfaceAt(x, z);
    this.pos.set(x, y ?? s.y, z);
    if (this.pos.y <= s.y + 0.01) { this.pos.y = s.y; this.mode = 'ground'; this.onBuilding = s.b; }
    else this.mode = 'air';
    this.vel.set(0, 0, 0);
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  update(dt, input, camYaw, frozen) {
    const w = this.world;
    const a = frozen ? { x: 0, y: 0 } : input.axes();
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let wx = fx * a.y + rx * a.x, wz = fz * a.y + rz * a.x;
    const moving = Math.hypot(wx, wz) > 0.05;
    const boost = input.boost && this.battery > 0;
    const old = this.pos.clone();
    if (this.knockT > 0) this.knockT -= dt;

    if (this.mode === 'ground') {
      const sp = boost ? 3.4 : 1.5;
      const k = 1 - Math.exp(-10 * dt);
      if (this.knockT <= 0) {
        this.vel.x += (wx * sp - this.vel.x) * k;
        this.vel.z += (wz * sp - this.vel.z) * k;
      }
      let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      let s = w.surfaceAt(nx, nz);
      if (s.y - this.pos.y > 0.35) {
        // muro: prova a scivolare lungo un asse
        const sx = w.surfaceAt(nx, this.pos.z), sz = w.surfaceAt(this.pos.x, nz);
        if (sx.y - this.pos.y <= 0.35) { nz = this.pos.z; s = sx; this.vel.z = 0; }
        else if (sz.y - this.pos.y <= 0.35) { nx = this.pos.x; s = sz; this.vel.x = 0; }
        else { nx = this.pos.x; nz = this.pos.z; s = w.surfaceAt(nx, nz); this.vel.x = this.vel.z = 0; }
      }
      this.pos.x = nx; this.pos.z = nz;
      if (s.y < this.pos.y - 0.5) {
        // bordo del tetto: si cade/plana
        this.mode = 'air';
        this.vel.y = 0;
      } else {
        this.pos.y = s.y;
        if (s.b !== this.onBuilding) {
          this.onBuilding = s.b;
          if (s.b) this.emit('land', { building: s.b });
        }
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.stats.walked += hs * dt;
      if (hs > 0.2) this.heading = turn(this.heading, Math.atan2(this.vel.x, this.vel.z), dt * 10);
      this.phase += hs * dt * 9;
      this.spread += (0 - this.spread) * Math.min(1, dt * 8);
      if (!frozen && input.fly) {
        if (this.battery > 0.5) {
          this.mode = 'air';
          this.vel.y = 3.8;
          this.onBuilding = null;
          this.emit('takeoff', {});
        } else if (!this.lowFlyMsg || performance.now() - this.lowFlyMsg > 3000) {
          this.lowFlyMsg = performance.now();
          this.emit('nobattery', {});
        }
      }
      this.drain(dt, hs > 0.2 ? 0.05 : 0.03);
    } else {
      const dead = this.battery <= 0;
      const sp = dead ? 5 : boost ? 26 : 13;
      const k = 1 - Math.exp(-(moving ? 1.6 : 1.0) * dt);
      if (this.knockT <= 0) {
        this.vel.x += (wx * sp - this.vel.x) * k;
        this.vel.z += (wz * sp - this.vel.z) * k;
      }
      let ty = -1.3;
      if (!frozen && input.fly && !dead) ty = boost ? 8 : 5.5;
      if (!frozen && input.descend) ty = -10;
      if (dead) ty = input.descend ? -10 : -4.5;
      this.vel.y += (ty - this.vel.y) * (1 - Math.exp(-3 * dt));
      const climbing = this.vel.y > 1;
      this.flapT += dt * (climbing ? 14 : moving ? 9 : 11);
      this.spread += (1 - this.spread) * Math.min(1, dt * 8);
      let nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
      // limiti del mondo
      const T = w.terrain;
      nx = Math.max(T.x0 + 60, Math.min(T.x1 - 60, nx));
      nz = Math.max(T.z0 + 60, Math.min(T.z1 - 60, nz));
      const ceil = T.heightAt(nx, nz) + 700;
      if (ny > ceil) { ny = ceil; this.vel.y = Math.min(0, this.vel.y); }
      const s = w.surfaceAt(nx, nz);
      if (ny <= s.y) {
        const was = w.surfaceAt(old.x, old.z);
        if (old.y >= s.y - 0.4 || !s.b || was.b === s.b) {
          // atterraggio (su tetto o terreno)
          ny = s.y;
          this.mode = 'ground';
          this.vel.y = 0;
          this.onBuilding = s.b;
          this.emit('land', { building: s.b });
        } else {
          // colpito un muro di lato: respinto
          nx = old.x; nz = old.z;
          const e = w.nearestEdge(s.b, old.x, old.z);
          if (e) {
            const vn = this.vel.x * e.nx + this.vel.z * e.nz;
            if (vn < 0) { this.vel.x -= vn * e.nx * 1.3; this.vel.z -= vn * e.nz * 1.3; }
          } else { this.vel.x *= -0.3; this.vel.z *= -0.3; }
          const s2 = w.surfaceAt(nx, nz);
          if (ny < s2.y) ny = s2.y;
        }
      }
      this.stats.flown += Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.set(nx, ny, nz);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 0.6) this.heading = turn(this.heading, Math.atan2(this.vel.x, this.vel.z), dt * 4);
      else if (moving) this.heading = turn(this.heading, Math.atan2(wx, wz), dt * 4);
      this.drain(dt, 0.2 + (boost ? 0.45 : 0) + (climbing ? 0.08 : 0));
    }
    this.animate(dt);
  }

  drain(dt, rate) {
    const before = this.battery;
    this.battery = Math.max(0, this.battery - rate * dt);
    for (const th of [25, 10]) if (before > th && this.battery <= th) this.emit('lowbattery', { level: th });
    if (before > 0 && this.battery <= 0) this.emit('empty', {});
  }

  knock(dx, dz, power) {
    this.vel.x = dx * power;
    this.vel.z = dz * power;
    this.vel.y = 3;
    this.mode = 'air';
    this.knockT = 0.6;
    this.battery = Math.max(0, this.battery - 8);
  }

  animate(dt) {
    const m = this.model, u = m.userData;
    m.position.copy(this.pos);
    m.rotation.y = this.heading;
    const air = this.mode === 'air';
    // inclinazione del corpo
    const pitch = air ? THREE.MathUtils.clamp(-this.vel.y * 0.05, -0.5, 0.5) + 0.15 * this.spread : 0;
    u.body.rotation.x += (pitch - u.body.rotation.x) * Math.min(1, dt * 6);
    // ali
    for (const wg of u.wings) {
      const fold = 1 - this.spread;
      const flap = air ? Math.sin(this.flapT) * (this.vel.y > -0.5 ? 0.9 : 0.25) : 0;
      wg.pivot.rotation.y = wg.side * fold * 1.35;
      wg.pivot.rotation.z = wg.side * (flap * this.spread + fold * -0.15);
      wg.pivot.rotation.x = fold * 0.25;
    }
    // testa che va avanti e indietro camminando
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (!air && hs > 0.15) {
      u.neck.position.z = 0.12 + Math.max(0, Math.sin(this.phase)) * 0.035;
      u.legs[0].rotation.x = Math.sin(this.phase) * 0.6;
      u.legs[1].rotation.x = -Math.sin(this.phase) * 0.6;
    } else {
      u.neck.position.z += (0.12 - u.neck.position.z) * 0.2;
      for (const l of u.legs) l.rotation.x = air ? 0.9 : l.rotation.x * 0.8;
    }
    u.tail.rotation.x = air ? -0.2 : 0.15;
    u.led.visible = Math.floor(performance.now() / 600) % 2 === 0;
  }
}

function turn(cur, target, rate) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, rate);
}

// Camera in terza persona con anti-compenetrazione e modalità fotocamera.
export class SpyCamera {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.25;
    this.dist = 1.5;
    this.photo = false;
    this.zoom = 1;
    this.lastMouse = 0;
    this.pos = new THREE.Vector3();
  }
  update(dt, input, pigeon) {
    const sens = input.locked ? 0.0024 : 0.004;
    if (input.mouseDX || input.mouseDY) this.lastMouse = performance.now();
    this.yaw -= input.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * sens, -1.2, 1.35);
    if (this.photo) {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (input.wheel > 0 ? 0.85 : input.wheel < 0 ? 1.18 : 1), 1, 8);
      const head = pigeon.pos.clone().add(new THREE.Vector3(Math.sin(pigeon.heading) * 0.12, 0.27, Math.cos(pigeon.heading) * 0.12));
      this.cam.position.copy(head);
      const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      this.cam.lookAt(head.clone().add(d));
      const fov = 60 / this.zoom;
      if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
      pigeon.model.visible = false;
      return;
    }
    pigeon.model.visible = true;
    if (this.cam.fov !== 60) { this.cam.fov = 60; this.cam.updateProjectionMatrix(); }
    const air = pigeon.mode === 'air';
    // in volo, se il giocatore non tocca la visuale, la camera si rimette dietro al piccione
    const hs = Math.hypot(pigeon.vel.x, pigeon.vel.z);
    if (air && hs > 3 && performance.now() - this.lastMouse > 1500) {
      let d = pigeon.heading - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.2);
    }
    if (input.wheel) this.userDist = THREE.MathUtils.clamp((this.userDist || 1) * (input.wheel > 0 ? 1.15 : 0.87), 0.6, 6);
    const want = (air ? 2.6 + Math.min(hs, 26) * 0.09 : 1.35) * (this.userDist || 1);
    this.dist += (want - this.dist) * Math.min(1, dt * 3);
    const target = pigeon.pos.clone();
    target.y += 0.22;
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // accorcia se ostruita
    let dd = this.dist;
    const p = new THREE.Vector3();
    for (let i = 1; i <= 10; i++) {
      const t = (this.dist * i) / 10;
      p.copy(target).addScaledVector(dir, t);
      const s = this.world.surfaceAt(p.x, p.z);
      if (p.y < s.y + 0.15) { dd = Math.max(0.35, t - this.dist / 10); break; }
    }
    p.copy(target).addScaledVector(dir, dd);
    const s = this.world.surfaceAt(p.x, p.z);
    if (p.y < s.y + 0.15) p.y = s.y + 0.15;
    this.cam.position.copy(p);
    this.cam.lookAt(target);
  }
}
