// Piccioni degli altri giocatori (e dei bot): modello "travestito" uguale per tutti,
// interpolazione degli stati ricevuti, animazione, targhetta col nome e fumetti.
import * as THREE from 'three';
import { buildPigeonModel } from '../player/pigeon.js';

const DELAY = 0.12; // s di ritardo di interpolazione
const eyeNormal = new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x552200 });
const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff1010 });

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function makeLabel(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.renderOrder = 10;
  spr.scale.set(1.2, 0.3, 1);
  spr.userData.draw = (t, col = color, badge = '') => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 256, 64);
    x.font = 'bold 26px system-ui, sans-serif';
    const label = (badge ? badge + ' ' : '') + t;
    const w = Math.min(250, x.measureText(label).width + 24);
    x.fillStyle = 'rgba(15,18,26,0.72)';
    x.beginPath();
    x.roundRect((256 - w) / 2, 10, w, 42, 12);
    x.fill();
    x.fillStyle = col;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, 128, 32, 240);
    tex.needsUpdate = true;
  };
  spr.userData.draw(text);
  return spr;
}

export class RemotePigeon {
  constructor(scene, id, name, { bot = false } = {}) {
    this.id = id;
    this.name = name;
    this.bot = bot;
    this.scene = scene;
    this.model = buildPigeonModel();
    const u = this.model.userData || {};
    this.u = u;
    // travestimento: niente cappello, antenna o occhio bionico visibile
    if (u.hat) u.hat.visible = false;
    this.eye = null;
    (u.neck || this.model).traverse((o) => {
      if (!o.isMesh || (u.hat && isChildOf(o, u.hat))) return;
      if (o.geometry?.type === 'TorusGeometry') o.visible = false;
      if (o.material?.isMeshBasicMaterial && o.material.color && o.material.color.r > 0.8 && o.material.color.g < 0.3) {
        o.material = eyeNormal;
        this.eye = o;
      }
    });
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.label = makeLabel(name);
    this.label.position.y = 0.62;
    this.model.add(this.label);
    this.bubble = null;
    this.bubbleUntil = 0;
    scene.add(this.model);
    this.snaps = [];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.mode = 'ground';
    this.flags = 0;
    this.phase = Math.random() * 6;
    this.flapT = 0;
    this.spread = 0;
    this.lastSeen = performance.now();
    this.unmaskedUntil = 0;
    this.peckT = 0;
    this.glowT = 0;
  }

  // stato ricevuto: [x, y, z, heading, mode(0/1), vx, vy, vz, flags]
  push(s) {
    const t = performance.now() / 1000;
    this.lastSeen = performance.now();
    this.snaps.push({ t, x: s[0], y: s[1], z: s[2], h: s[3], air: s[4] === 1, vx: s[5], vy: s[6], vz: s[7] });
    this.flags = s[8] | 0;
    if (this.snaps.length > 20) this.snaps.shift();
    if (this.snaps.length === 1) this.pos.set(s[0], s[1], s[2]);
  }

  // usato dai bot deterministici: posizione già calcolata
  setDirect(x, y, z, h, air, vx, vz) {
    this.pos.set(x, y, z);
    this.vel.set(vx, 0, vz);
    this.heading = h;
    this.mode = air ? 'air' : 'ground';
    this.lastSeen = performance.now();
  }

  setName(name, color, badge) { this.name = name; this.label.userData.draw(name, color, badge); }

  say(text, ms = 3500) {
    if (!this.bubble) {
      this.bubble = makeLabel(text, '#ffe08a');
      this.bubble.position.y = 0.95;
      this.bubble.scale.set(1.8, 0.45, 1);
      this.model.add(this.bubble);
    } else this.bubble.userData.draw(text, '#ffe08a');
    this.bubble.visible = true;
    this.bubbleUntil = performance.now() + ms;
  }

  unmask(seconds = 30) {
    this.unmaskedUntil = performance.now() + seconds * 1000;
  }

  peck() { this.peckT = 0.8; }
  glow(seconds = 1.5) { this.glowT = seconds; }

  sample() {
    const sn = this.snaps;
    if (!sn.length) return;
    const rt = performance.now() / 1000 - DELAY;
    let a = sn[0], b = null;
    for (let i = sn.length - 1; i >= 0; i--) {
      if (sn[i].t <= rt) { a = sn[i]; b = sn[i + 1] || null; break; }
    }
    if (b) {
      const k = (rt - a.t) / Math.max(1e-3, b.t - a.t);
      this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      this.heading = lerpAngle(a.h, b.h, k);
      this.vel.set(b.vx, b.vy, b.vz);
      this.mode = b.air ? 'air' : 'ground';
    } else {
      // estrapolazione breve oltre l'ultimo stato
      const last = sn[sn.length - 1];
      const e = Math.min(0.3, Math.max(0, rt - last.t));
      this.pos.set(last.x + last.vx * e, last.y + last.vy * e, last.z + last.vz * e);
      this.heading = last.h;
      this.vel.set(last.vx, last.vy, last.vz);
      this.mode = last.air ? 'air' : 'ground';
    }
  }

  update(dt, camPos) {
    if (!this.bot) this.sample();
    const m = this.model, u = this.u;
    m.position.copy(this.pos);
    m.rotation.y = this.heading;
    const air = this.mode === 'air';
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.spread += ((air ? 1 : 0) - this.spread) * Math.min(1, dt * 5);
    if (air) this.flapT += dt * (this.vel.y > -0.5 ? 14 : 4);
    this.phase += dt * hs * 9;
    if (u.body) {
      const pitch = air ? THREE.MathUtils.clamp(-this.vel.y * 0.05, -0.5, 0.5) + 0.15 * this.spread : 0;
      u.body.rotation.x += (pitch - u.body.rotation.x) * Math.min(1, dt * 6);
    }
    for (const wg of u.wings || []) {
      const fold = 1 - this.spread;
      const flap = air ? Math.sin(this.flapT) * 0.9 : 0;
      wg.pivot.rotation.y = wg.side * fold * 1.35;
      wg.pivot.rotation.z = wg.side * (flap * this.spread + fold * -0.15);
      wg.pivot.rotation.x = fold * 0.25;
    }
    if (u.neck) {
      if (this.peckT > 0) {
        this.peckT -= dt;
        u.neck.rotation.x = Math.max(0, Math.sin(this.peckT * 16)) * 0.9;
      } else u.neck.rotation.x *= 0.8;
      if (!air && hs > 0.15) u.neck.position.z = 0.12 + Math.max(0, Math.sin(this.phase)) * 0.035;
      else u.neck.position.z += (0.12 - u.neck.position.z) * 0.2;
    }
    if (u.legs?.length === 2) {
      if (!air && hs > 0.15) { u.legs[0].rotation.x = Math.sin(this.phase) * 0.6; u.legs[1].rotation.x = -Math.sin(this.phase) * 0.6; }
      else for (const l of u.legs) l.rotation.x = air ? 0.9 : l.rotation.x * 0.8;
    }
    if (u.tail) u.tail.rotation.x = air ? -0.2 : 0.15;
    // smascherato: cappello da spia visibile a tutti
    const unmasked = performance.now() < this.unmaskedUntil;
    if (u.hat) u.hat.visible = unmasked;
    if (u.led) u.led.visible = unmasked && Math.floor(performance.now() / 300) % 2 === 0;
    if (this.glowT > 0) this.glowT -= dt;
    if (this.eye) this.eye.material = (this.glowT > 0 && Math.floor(performance.now() / 180) % 2 === 0) || unmasked ? eyeGlow : eyeNormal;
    // targhetta e fumetto visibili solo da vicino; scala costante a schermo
    const d = camPos ? camPos.distanceTo(this.pos) : 0;
    const s = THREE.MathUtils.clamp(d / 6, 0.6, 6);
    this.label.visible = d < 35 || unmasked;
    this.label.scale.set(1.2 * s, 0.3 * s, 1);
    this.label.position.y = 0.45 + 0.17 * s;
    if (this.bubble) {
      this.bubble.visible = performance.now() < this.bubbleUntil && d < 60;
      this.bubble.scale.set(1.8 * s, 0.45 * s, 1);
      this.bubble.position.y = 0.6 + 0.45 * s;
    }
  }

  dispose() {
    this.scene.remove(this.model);
    this.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
  }
}

function isChildOf(o, p) {
  for (let q = o.parent; q; q = q.parent) if (q === p) return true;
  return false;
}
