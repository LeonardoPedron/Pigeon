// Animali: stormi di piccioni normali, gatti che cacciano il piccione a terra, falco che lo caccia in volo,
// galline nelle corti delle case coloniche.
import * as THREE from 'three';
import { mulberry32 } from '../world/data.js';

function birdGeo(scale, colBody, colWing) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6).scale(0.9, 0.8, 1.5), new THREE.MeshLambertMaterial({ color: colBody }));
  body.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: colBody }));
  head.position.set(0, 0.2, 0.13);
  const wl = new THREE.Group(), wr = new THREE.Group();
  wl.position.set(0.07, 0.17, 0.02); wr.position.set(-0.07, 0.17, 0.02);
  const w = new THREE.BoxGeometry(0.28, 0.01, 0.14).translate(0.14, 0, -0.03);
  wl.add(new THREE.Mesh(w, new THREE.MeshLambertMaterial({ color: colWing })));
  const w2 = new THREE.BoxGeometry(0.28, 0.01, 0.14).translate(-0.14, 0, -0.03);
  wr.add(new THREE.Mesh(w2, new THREE.MeshLambertMaterial({ color: colWing })));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.12), new THREE.MeshLambertMaterial({ color: colWing }));
  tail.position.set(0, 0.13, -0.17);
  g.add(body, head, wl, wr, tail);
  g.scale.setScalar(scale);
  g.userData = { wl, wr, head };
  return g;
}

function catGeo(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.46), m); body.position.y = 0.26;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.15), m); head.position.set(0, 0.38, 0.28);
  const e1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), m); e1.position.set(0.05, 0.48, 0.27);
  const e2 = e1.clone(); e2.position.x = -0.05;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.01), new THREE.MeshBasicMaterial({ color: 0xc8e04a })); eyes.position.set(0, 0.4, 0.356);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.34), m); tail.position.set(0, 0.36, -0.36); tail.rotation.x = -0.6;
  const legs = [];
  for (const [x, z] of [[0.07, 0.17], [-0.07, 0.17], [0.07, -0.17], [-0.07, -0.17]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), m); l.position.set(x, 0.09, z); legs.push(l); g.add(l); }
  g.add(body, head, e1, e2, eyes, tail);
  g.userData = { legs, tail, body };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Animals {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.rnd = mulberry32(99);
    this.flocks = [];
    this.birds = [];
    this.cats = [];
    this.chickens = [];
    const r = this.rnd;
    // stormi nelle piazze (chiese, bar, negozi)
    const spots = [...game.npc.places.church, ...game.npc.places.bar, ...game.npc.places.shop].filter((p, i) => i % 2 === 0);
    for (const s of spots) {
      const n = 4 + Math.floor(r() * 7);
      this.flocks.push({ x: s.x, z: s.z, n, birds: null });
    }
    // falco
    this.hawk = birdGeo(3.4, 0x6b4a2e, 0x4a3220);
    this.hawk.visible = false;
    this.scene.add(this.hawk);
    this.hawkState = 'none';
    this.exposure = 0;
    this.hawkCD = 60;
    this.catCD = 0;
    this.catColors = [0xd9822b, 0x2b2b2b, 0x8d8d8d, 0xf1e6d2, 0x6b4a2e];
  }

  // ---------------------------------------------------------------- stormi
  spawnFlock(f) {
    f.birds = [];
    for (let i = 0; i < f.n; i++) {
      const tone = [0x8c95aa, 0x7d8597, 0x9aa1b0, 0x5d6371, 0xb8bcc6][Math.floor(this.rnd() * 5)];
      const m = birdGeo(1, tone, 0x5d6371);
      const a = this.rnd() * Math.PI * 2, d = this.rnd() * 5;
      const b = { m, x: f.x + Math.cos(a) * d, z: f.z + Math.sin(a) * d, y: 0, vx: 0, vy: 0, vz: 0, yaw: this.rnd() * 6, state: 'ground', t: this.rnd() * 3, flap: 0, home: f };
      b.y = this.g.world.col.groundAt(b.x, b.z, 1e6, 0.4).y;
      if (b.y > this.g.world.terrain.heightAt(b.x, b.z) + 0.5) b.y = this.g.world.terrain.heightAt(b.x, b.z);
      this.scene.add(m);
      f.birds.push(b);
    }
  }
  updateFlocks(dt, P, pig) {
    for (const f of this.flocks) {
      const d = Math.hypot(f.x - P.x, f.z - P.z);
      if (d < 220 && !f.birds) this.spawnFlock(f);
      else if (d > 320 && f.birds) { for (const b of f.birds) this.scene.remove(b.m); f.birds = null; }
      if (!f.birds) continue;
      for (const b of f.birds) {
        const dp = Math.hypot(b.x - P.x, b.z - P.z, (b.y - P.y) * 0.5);
        const spook = (dp < 2.2 && Math.hypot(pig.vel.x, pig.vel.z) > 1) || (dp < 1.2) || this.spookAt?.(b.x, b.z);
        if (b.state === 'ground') {
          b.t -= dt;
          if (b.t <= 0) { b.t = 0.6 + this.rnd() * 2; b.yaw += (this.rnd() - 0.5) * 2.5; b.walk = this.rnd() < 0.5 ? 0.6 : 0; }
          if (b.walk) { const nx = b.x + Math.sin(b.yaw) * b.walk * dt, nz = b.z + Math.cos(b.yaw) * b.walk * dt; if (Math.hypot(nx - b.home.x, nz - b.home.z) < 8) { b.x = nx; b.z = nz; b.y = this.g.world.terrain.heightAt(b.x, b.z); } }
          b.m.userData.head.position.z = 0.13 + Math.max(0, Math.sin(performance.now() / 120 + b.x)) * 0.03 * (b.walk ? 1 : 0);
          b.m.userData.head.position.y = b.walk ? 0.2 : 0.2 - (Math.sin(performance.now() / 300 + b.z) > 0.6 ? 0.08 : 0);
          b.m.userData.wl.rotation.set(0, 1.3, 0); b.m.userData.wr.rotation.set(0, -1.3, 0);
          if (spook) {
            b.state = 'fly';
            const a = Math.atan2(b.x - P.x, b.z - P.z) + (this.rnd() - 0.5);
            b.vx = Math.sin(a) * 7; b.vz = Math.cos(a) * 7; b.vy = 4 + this.rnd() * 2; b.t = 3 + this.rnd() * 3;
            this.g.audio?.play('flap');
          }
        } else {
          b.t -= dt;
          b.flap += dt * 18;
          b.vy -= dt * (b.t > 0 ? 0.5 : 3);
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          if (b.t <= 0) { const dx = b.home.x - b.x, dz = b.home.z - b.z, l = Math.hypot(dx, dz) || 1; b.vx += (dx / l) * dt * 6; b.vz += (dz / l) * dt * 6; const s = Math.hypot(b.vx, b.vz); if (s > 7) { b.vx *= 7 / s; b.vz *= 7 / s; } }
          b.yaw = Math.atan2(b.vx, b.vz);
          const fl = Math.sin(b.flap) * 0.9;
          b.m.userData.wl.rotation.set(0, 0, fl); b.m.userData.wr.rotation.set(0, 0, -fl);
          const gy = this.g.world.terrain.heightAt(b.x, b.z);
          if (b.y < gy) { b.y = gy; if (b.t <= 0) { b.state = 'ground'; b.t = 1; } }
          if (b.t < -12) { b.x = b.home.x + (this.rnd() - 0.5) * 6; b.z = b.home.z + (this.rnd() - 0.5) * 6; b.y = this.g.world.terrain.heightAt(b.x, b.z); b.state = 'ground'; }
        }
        b.m.position.set(b.x, b.y, b.z);
        b.m.rotation.y = b.yaw;
      }
    }
  }

  // ---------------------------------------------------------------- gatti
  updateCats(dt, P, pig) {
    const W = this.g.world;
    this.catCD -= dt;
    // mantieni pochi gatti vicino al piccione, in zone abitate
    if (this.cats.length < 4 && this.catCD <= 0) {
      this.catCD = 4;
      const near = W.buildingsNear(P.x, P.z, 70).filter((b) => b.k === 'house' || b.k === 'villa' || b.k === 'farm');
      if (near.length) {
        const b = near[Math.floor(this.rnd() * near.length)];
        const x = b.door.x + b.door.nx * 1.2, z = b.door.z + b.door.nz * 1.2;
        if (Math.hypot(x - P.x, z - P.z) > 18) {
          const m = catGeo(this.catColors[Math.floor(this.rnd() * this.catColors.length)]);
          this.scene.add(m);
          this.cats.push({ m, x, z, y: W.terrain.heightAt(x, z), yaw: this.rnd() * 6, state: 'sit', t: 2, cd: 0 });
        }
      }
    }
    for (let i = this.cats.length - 1; i >= 0; i--) {
      const c = this.cats[i];
      const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz);
      if (d > 140) { this.scene.remove(c.m); this.cats.splice(i, 1); continue; }
      const onGround = pig.mode === 'ground' && Math.abs(pig.pos.y - W.terrain.heightAt(pig.pos.x, pig.pos.z)) < 0.6;
      c.cd = Math.max(0, c.cd - dt);
      let sp = 0;
      if (c.state === 'sit') {
        c.t -= dt;
        if (c.t <= 0) { c.t = 3 + this.rnd() * 5; c.yaw += (this.rnd() - 0.5) * 2; c.state = this.rnd() < 0.4 ? 'walk' : 'sit'; }
        if (onGround && d < 11 && c.cd <= 0) { c.state = 'stalk'; this.g.hud.toast('🐈 Un gatto ti ha puntato! Vola via!', 'bad'); }
      } else if (c.state === 'walk') {
        sp = 0.5; c.t -= dt; if (c.t <= 0) { c.state = 'sit'; c.t = 4; }
        if (onGround && d < 11 && c.cd <= 0) c.state = 'stalk';
      } else if (c.state === 'stalk') {
        c.yaw = Math.atan2(dx, dz); sp = 0.9;
        if (!onGround || d > 16) { c.state = 'sit'; c.t = 3; }
        else if (d < 2.6) { c.state = 'pounce'; c.t = 0.6; this.g.audio?.play('hit'); }
      } else if (c.state === 'pounce') {
        c.yaw = Math.atan2(dx, dz); sp = 6.5; c.t -= dt;
        if (d < 0.45 && onGround) {
          pig.knock(dx / (d || 1), dz / (d || 1), 3, this.g.upgrades?.silent ? 8 : 14);
          this.g.hud.toast('🐈 Il gatto ti ha preso! -14% batteria', 'bad');
          this.g.addSuspicion(5);
          c.state = 'sit'; c.t = 5; c.cd = 25;
        } else if (c.t <= 0) { c.state = 'sit'; c.t = 3; c.cd = 8; }
      }
      if (sp) {
        const nx = c.x + Math.sin(c.yaw) * sp * dt, nz = c.z + Math.cos(c.yaw) * sp * dt;
        if (!W.buildingAt(nx, nz)?.solid) { c.x = nx; c.z = nz; }
        c.y = W.terrain.heightAt(c.x, c.z);
      }
      const ph = performance.now() / 90;
      c.m.userData.legs.forEach((l, k) => { l.rotation.x = sp ? Math.sin(ph * (sp > 2 ? 2 : 1) + k * Math.PI / 2) * 0.6 : 0; });
      c.m.userData.body.scale.y = c.state === 'stalk' ? 0.7 : 1;
      c.m.userData.tail.rotation.x = c.state === 'sit' ? -1.1 : -0.4 + Math.sin(ph / 3) * 0.2;
      c.m.position.set(c.x, c.y - (c.state === 'stalk' ? 0.05 : 0), c.z);
      c.m.rotation.y = c.yaw;
    }
  }

  // ---------------------------------------------------------------- falco
  updateHawk(dt, P, pig) {
    const W = this.g.world;
    const ground = W.terrain.heightAt(P.x, P.z);
    const alt = P.y - ground;
    const sheltered = pig.mode === 'ground' && (W.col.ceilingAt(P.x, P.z, P.y) < Infinity || pig.support?.kind === 'tree') || (alt < 5 && W.buildingsNear(P.x, P.z, 6).length > 0);
    const open = pig.mode === 'air' && alt > 20 && W.buildingsNear(P.x, P.z, 40).length < 3;
    this.hawkCD -= dt;
    const h = this.hawk;
    if (this.hawkState === 'none') {
      this.exposure = this.exposure > 900 ? (pig.mode === 'air' ? 999 : this.exposure) : Math.max(0, this.exposure + (open ? dt : -dt * 0.5));
      if (this.exposure > (this.g.upgrades?.silent ? 45 : 25) && this.hawkCD <= 0) {
        this.hawkState = 'circle';
        this.hawkT = 6;
        this.hawkAng = Math.random() * 6;
        h.visible = true;
        this.g.hud.toast('🦅 Un falco ti ha avvistato! Rifugiati sotto una tettoia, tra gli alberi o scendi in paese!', 'bad');
        this.g.audio?.play('screech');
      }
    } else if (this.hawkState === 'circle') {
      this.hawkT -= dt;
      this.hawkAng += dt * 0.9;
      h.position.set(P.x + Math.cos(this.hawkAng) * 40, P.y + 25, P.z + Math.sin(this.hawkAng) * 40);
      h.rotation.y = this.hawkAng + Math.PI;
      h.userData.wl.rotation.z = 0.1; h.userData.wr.rotation.z = -0.1;
      if (sheltered) this.hawkLeave();
      else if (this.hawkT <= 0) { this.hawkState = 'dive'; this.g.audio?.play('screech'); }
    } else if (this.hawkState === 'dive') {
      const d = new THREE.Vector3(P.x - h.position.x, P.y + 0.1 - h.position.y, P.z - h.position.z);
      const L = d.length();
      if (sheltered) { this.hawkLeave(); return; }
      d.normalize();
      h.position.addScaledVector(d, Math.min(L, 34 * dt));
      h.rotation.y = Math.atan2(d.x, d.z);
      h.userData.wl.rotation.z = -0.9; h.userData.wr.rotation.z = 0.9;
      if (L < 0.9) {
        pig.knock(d.x, d.z, 9, this.g.upgrades?.silent ? 10 : 20);
        this.g.hud.toast('🦅 Il falco ti ha colpito! -20% batteria', 'bad');
        this.g.audio?.play('hit');
        this.hawkLeave();
      }
    } else if (this.hawkState === 'leave') {
      h.position.y += dt * 12;
      h.position.x += Math.sin(h.rotation.y) * dt * 20;
      h.position.z += Math.cos(h.rotation.y) * dt * 20;
      h.userData.wl.rotation.z = Math.sin(performance.now() / 80) * 0.8; h.userData.wr.rotation.z = -h.userData.wl.rotation.z;
      this.hawkT -= dt;
      if (this.hawkT <= 0) { h.visible = false; this.hawkState = 'none'; }
    }
  }
  forceHawk() { if (this.hawkState === 'none') { this.exposure = 999; this.hawkCD = 0; } }
  hawkLeave() {
    if (this.hawkState === 'dive' || this.hawkState === 'circle') this.g.hud.toast('🦅 Il falco ha rinunciato.', 'good');
    this.hawkState = 'leave'; this.hawkT = 6; this.exposure = 0; this.hawkCD = 150;
    this.g.achieve?.('hawk');
  }

  // ---------------------------------------------------------------- galline
  updateChickens(dt, P) {
    const W = this.g.world;
    if (!this.chickT || (this.chickT -= dt) <= 0) {
      this.chickT = 3;
      for (const c of this.chickens) this.scene.remove(c.m);
      this.chickens = [];
      const farms = W.buildingsNear(P.x, P.z, 120).filter((b) => b.k === 'farm' || b.k === 'barn').slice(0, 4);
      for (const b of farms) {
        for (let i = 0; i < 4; i++) {
          const m = birdGeo(1.3, this.rnd() < 0.5 ? 0xf2efe6 : 0x9a5a2a, 0xd8d2c6);
          const x = b.door.x + b.door.nx * (2 + this.rnd() * 4) + (this.rnd() - 0.5) * 4, z = b.door.z + b.door.nz * (2 + this.rnd() * 4) + (this.rnd() - 0.5) * 4;
          if (W.buildingAt(x, z)?.solid) continue;
          m.position.set(x, W.terrain.heightAt(x, z), z);
          m.userData.wl.rotation.set(0, 1.3, 0); m.userData.wr.rotation.set(0, -1.3, 0);
          this.scene.add(m);
          this.chickens.push({ m, yaw: this.rnd() * 6 });
        }
      }
    }
    for (const c of this.chickens) {
      c.m.userData.head.position.y = 0.2 - (Math.sin(performance.now() / 200 + c.yaw * 10) > 0.3 ? 0.09 : 0);
      c.m.rotation.y = c.yaw += (Math.random() - 0.5) * dt;
    }
  }

  update(dt) {
    const pig = this.g.pigeon, P = pig.pos;
    this.updateFlocks(dt, P, pig);
    this.updateCats(dt, P, pig);
    this.updateHawk(dt, P, pig);
    this.updateChickens(dt, P);
  }
}
