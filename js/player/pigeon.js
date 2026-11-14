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
    this.col = world.col;
    this.model = buildPigeonModel();
    scene.add(this.model);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.mode = 'ground';
    this.battery = 100;
    this.maxBattery = 100;
    this.speedMul = 1;
    this.phase = 0;
    this.spread = 0;
    this.flapT = 0;
    this.onBuilding = null;
    this.support = null;
    this.stats = { flown: 0, walked: 0 };
    this.events = [];
    this.knockT = 0;
    this.R = 0.13; // raggio di collisione (piccione reale: 32 cm)
    this.H = 0.3;
    // ombra a disco (aiuta a capire quota e scala)
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.renderOrder = 2;
    scene.add(sh);
    this.shadow = sh;
  }

  place(x, z, y) {
    const g = this.col.groundAt(x, z, y ?? 1e6, 0.45);
    this.pos.set(x, y ?? g.y, z);
    this.vel.set(0, 0, 0);
    if (this.pos.y <= g.y + 0.01) { this.pos.y = g.y; this.mode = 'ground'; this.setSupport(g); }
    else { this.mode = 'air'; this.support = null; this.onBuilding = null; }
    this.col.ensureTrees(x, z);
  }

  setSupport(g) {
    this.support = g;
    const b = g.kind === 'roof' ? g.ref : null;
    if (b !== this.onBuilding || (g.kind !== this.lastKind)) {
      this.onBuilding = b;
      this.lastKind = g.kind;
      this.emit('land', { building: b, kind: g.kind, ref: g.ref });
    }
    this.supportPos = g.ref && (g.kind === 'car' || g.kind === 'head') ? [g.ref.x, g.ref.y, g.ref.z, g.ref.yaw || 0] : null;
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  update(dt, input, camYaw, frozen) {
    const col = this.col;
    col.ensureTrees(this.pos.x, this.pos.z);
    const a = frozen ? { x: 0, y: 0 } : input.axes();
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    const wx = fx * a.y + rx * a.x, wz = fz * a.y + rz * a.x;
    const moving = Math.hypot(wx, wz) > 0.05;
    const boost = input.boost && this.battery > 0;
    if (this.knockT > 0) this.knockT -= dt;
    // trasportato da auto o persone in movimento
    if (this.mode === 'ground' && this.supportPos && this.support?.ref) {
      const r = this.support.ref, sp = this.supportPos;
      const dyaw = (r.yaw || 0) - sp[3];
      const ox = this.pos.x - sp[0], oz = this.pos.z - sp[2];
      const c = Math.cos(dyaw), s = Math.sin(dyaw);
      this.pos.x = r.x + ox * c + oz * s;
      this.pos.z = r.z - ox * s + oz * c;
      this.pos.y += r.y - sp[1];
      this.heading += dyaw;
      this.supportPos = [r.x, r.y, r.z, r.yaw || 0];
    }
    if (this.mode === 'ground') {
      const sp = (boost ? 3.2 : 1.3) * this.speedMul;
      const k = 1 - Math.exp(-10 * dt);
      if (this.knockT <= 0) { this.vel.x += (wx * sp - this.vel.x) * k; this.vel.z += (wz * sp - this.vel.z) * k; }
      this.vel.y = 0;
      if (!frozen && input.fly) {
        if (this.battery > 0.5) { this.mode = 'air'; this.vel.y = 3.8; this.support = null; this.onBuilding = null; this.lastKind = null; this.emit('takeoff', {}); }
        else if (!this.lowFlyMsg || performance.now() - this.lowFlyMsg > 3000) { this.lowFlyMsg = performance.now(); this.emit('nobattery', {}); }
      }
    } else {
      const dead = this.battery <= 0;
      const sp = (dead ? 5 : boost ? 26 : 13) * this.speedMul;
      const k = 1 - Math.exp(-(moving ? 1.6 : 1.0) * dt);
      if (this.knockT <= 0) { this.vel.x += (wx * sp - this.vel.x) * k; this.vel.z += (wz * sp - this.vel.z) * k; }
      let ty = -1.3;
      if (!frozen && input.fly && !dead) ty = boost ? 8 : 5.5;
      if (!frozen && input.descend) ty = -10;
      if (dead) ty = input.descend ? -10 : -4.5;
      this.vel.y += (ty - this.vel.y) * (1 - Math.exp(-3 * dt));
    }
    // integrazione a sotto-passi con collisioni
    const T = this.world.terrain;
    const dist = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
    const n = Math.min(16, Math.max(1, Math.ceil(dist / 0.1)));
    const h = dt / n;
    const p = this.pos;
    const x0 = p.x, z0 = p.z;
    for (let i = 0; i < n; i++) {
      p.x += this.vel.x * h; p.z += this.vel.z * h;
      p.x = Math.max(T.x0 + 60, Math.min(T.x1 - 60, p.x));
      p.z = Math.max(T.z0 + 60, Math.min(T.z1 - 60, p.z));
      const hit = col.resolve(p, this.R, this.H);
      if (hit) {
        const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
        if (vn < 0) { this.vel.x -= vn * hit.nx; this.vel.z -= vn * hit.nz; }
        if (this.mode === 'air' && -vn > 6) this.emit('bump', { speed: -vn, kind: hit.kind });
      }
      if (this.mode === 'ground') {
        const g = col.groundAt(p.x, p.z, p.y, 0.45);
        if (g.y < p.y - 0.6) { this.mode = 'air'; this.vel.y = 0; this.support = null; this.onBuilding = null; this.lastKind = null; }
        else { p.y = g.y; if (g.ref !== this.support?.ref || g.kind !== this.support?.kind) this.setSupport(g); }
      } else {
        const prevY = p.y;
        p.y += this.vel.y * h;
        const ceil = col.ceilingAt(p.x, p.z, prevY);
        if (p.y + this.H > ceil) { p.y = ceil - this.H; this.vel.y = Math.min(0, this.vel.y); }
        const lim = T.heightAt(p.x, p.z) + 700;
        if (p.y > lim) { p.y = lim; this.vel.y = Math.min(0, this.vel.y); }
        const g = col.groundAt(p.x, p.z, prevY, 0.05);
        if (p.y <= g.y && this.vel.y <= 0.5) {
          p.y = g.y; this.mode = 'ground'; this.vel.y = 0;
          this.lastKind = null;
          this.setSupport(g);
        } else if (p.y < g.y) p.y = g.y;
      }
    }
    const hs = Math.hypot(p.x - x0, p.z - z0);
    if (this.mode === 'ground') {
      this.stats.walked += hs;
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (v > 0.2) this.heading = turn(this.heading, Math.atan2(this.vel.x, this.vel.z), dt * 10);
      this.phase += v * dt * 9;
      this.spread += (0 - this.spread) * Math.min(1, dt * 8);
      this.drain(dt, v > 0.2 ? 0.05 : 0.03);
    } else {
      this.stats.flown += hs;
      const climbing = this.vel.y > 1;
      this.flapT += dt * (climbing ? 14 : moving ? 9 : 11);
      this.spread += (1 - this.spread) * Math.min(1, dt * 8);
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (v > 0.6) this.heading = turn(this.heading, Math.atan2(this.vel.x, this.vel.z), dt * 4);
      else if (moving) this.heading = turn(this.heading, Math.atan2(wx, wz), dt * 4);
      this.drain(dt, 0.2 + (boost ? 0.45 : 0) + (climbing ? 0.08 : 0));
    }
    // ombra
    const gs = col.groundAt(p.x, p.z, p.y + 0.01, 0.01);
    this.shadow.position.set(p.x, gs.y + 0.02, p.z);
    const hgt = p.y - gs.y;
    this.shadow.visible = hgt < 40;
    this.shadow.material.opacity = Math.max(0.05, 0.35 - hgt * 0.008);
    this.shadow.scale.setScalar(1 + hgt * 0.02);
    this.animate(dt);
  }

  drain(dt, rate) {
    const before = this.battery;
    this.battery = Math.max(0, this.battery - rate * dt);
    for (const th of [25, 10]) if (before > th && this.battery <= th) this.emit('lowbattery', { level: th });
    if (before > 0 && this.battery <= 0) this.emit('empty', {});
  }

  knock(dx, dz, power, loss = 8) {
    this.vel.x = dx * power;
    this.vel.z = dz * power;
    this.vel.y = 3;
    this.mode = 'air';
    this.support = null;
    this.knockT = 0.6;
    this.battery = Math.max(0, this.battery - loss);
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
    this.col = world.col;
    this.yaw = 0;
    this.pitch = 0.2;
    this.dist = 1.0;
    this.photo = false;
    this.zoom = 1;
    this.lastMouse = 0;
    this.userDist = 1;
    this.cur = new THREE.Vector3();
    this.shake = 0;
  }
  update(dt, input, pigeon) {
    const sens = input.locked ? 0.0024 : 0.004;
    if (input.mouseDX || input.mouseDY) this.lastMouse = performance.now();
    this.yaw -= input.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * sens, -0.9, 1.35);
    if (this.photo) {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (input.wheel > 0 ? 0.85 : input.wheel < 0 ? 1.18 : 1), 1, this.maxZoom || 8);
      const head = pigeon.pos.clone().add(new THREE.Vector3(Math.sin(pigeon.heading) * 0.1, 0.24, Math.cos(pigeon.heading) * 0.1));
      // leggero tremolio della mano (ala)
      const t = performance.now() / 1000;
      const j = 0.0025 * this.zoom;
      const d = new THREE.Vector3(Math.sin(this.yaw + Math.sin(t * 1.7) * j) * Math.cos(this.pitch), -Math.sin(this.pitch + Math.sin(t * 2.3) * j), Math.cos(this.yaw + Math.sin(t * 1.7) * j) * Math.cos(this.pitch));
      this.cam.position.copy(head);
      this.cam.lookAt(head.clone().add(d));
      const fov = 70 / this.zoom;
      if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
      pigeon.model.visible = false;
      this.cur.copy(this.cam.position);
      return;
    }
    pigeon.model.visible = true;
    if (this.cam.fov !== 70) { this.cam.fov = 70; this.cam.updateProjectionMatrix(); }
    const air = pigeon.mode === 'air';
    const hs = Math.hypot(pigeon.vel.x, pigeon.vel.z);
    if (air && hs > 3 && performance.now() - this.lastMouse > 1500) {
      let d = pigeon.heading - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.2);
    }
    if (input.wheel) this.userDist = THREE.MathUtils.clamp(this.userDist * (input.wheel > 0 ? 1.15 : 0.87), 0.5, 8);
    // occhio di piccione: a terra vicino e basso, in volo più distante
    const want = (air ? 3.2 + Math.min(hs, 26) * 0.07 : 1.55) * this.userDist;
    this.dist += (want - this.dist) * Math.min(1, dt * 3);
    const target = pigeon.pos.clone();
    target.y += air ? 0.15 : 0.2;
    const pitch = air ? this.pitch + 0.12 : this.pitch;
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.yaw) * Math.cos(pitch));
    const desired = target.clone().addScaledVector(dir, this.dist);
    // raycast reale contro muri, tetti, tettoie, pali e terreno
    const f = this.col.raycast(target, desired, 0.08);
    const dd = Math.max(0.25, this.dist * f - 0.12);
    const p = target.clone().addScaledVector(dir, dd);
    const gy = this.world.terrain.heightAt(p.x, p.z);
    if (p.y < gy + 0.08) p.y = gy + 0.08;
    // avvicinamento immediato, allontanamento morbido (niente scatti dentro i muri)
    const curD = this.cur.distanceTo(target);
    if (dd < curD || this.cur.lengthSq() === 0) this.cur.copy(p);
    else this.cur.lerp(p, Math.min(1, dt * 6));
    this.cam.position.copy(this.cur);
    this.cam.lookAt(target);
  }
}
