// Ciclo giorno/notte: sole, luna, cielo, nebbia, stelle. 1 ora di gioco = 60 s reali.
import * as THREE from 'three';

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night;
varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, pow(max(h,0.0), 0.55));
  float s = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(s, 800.0) * 4.0 + pow(s, 12.0) * 0.25);
  if (night > 0.0 && d.y > 0.0) {
    vec3 c = floor(d * 300.0);
    float st = step(0.9975, hash(c));
    col += vec3(st) * night * smoothstep(0.0, 0.25, d.y);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const KEYS = [
  // ora, cielo alto, orizzonte, luce sole, intensità sole, ambiente
  [0, '#060a18', '#111a33', '#5a6a9a', 0.12, 0.28],
  [5, '#0b1430', '#3a3554', '#6a6a9a', 0.12, 0.3],
  [6.3, '#3d5e93', '#f0a86a', '#ffb070', 0.7, 0.45],
  [8, '#5d93d6', '#bcd6ee', '#fff2dc', 2.2, 0.7],
  [13, '#4f8ad6', '#c7def2', '#ffffff', 2.6, 0.75],
  [18, '#5a86c4', '#e8c39a', '#ffdcb0', 1.8, 0.65],
  [19.8, '#34477a', '#f08a5a', '#ff8a50', 0.6, 0.45],
  [21, '#0e1636', '#2d2c4c', '#6a6a9a', 0.14, 0.3],
  [24, '#060a18', '#111a33', '#5a6a9a', 0.12, 0.28],
];

export class DayNight {
  constructor(scene, quality) {
    this.scene = scene;
    this.time = 8; // ore
    this.day = 1;
    this.speed = 1 / 60; // ore per secondo reale
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5a3a, 0.7);
    scene.add(this.hemi);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xbcd6ee, 300, 1800);
    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this._c = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  }

  get hours() { return Math.floor(this.time); }
  get minutes() { return Math.floor((this.time % 1) * 60); }
  clock() { return String(this.hours).padStart(2, '0') + ':' + String(this.minutes).padStart(2, '0'); }

  update(dt, center, fogFar, mult = 1) {
    this.time += dt * this.speed * mult;
    if (this.time >= 24) { this.time -= 24; this.day++; }
    const t = this.time;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = (t - a[0]) / (b[0] - a[0]);
    const [top, hor, sunc] = this._c;
    top.set(a[1]).lerp(new THREE.Color(b[1]), f);
    hor.set(a[2]).lerp(new THREE.Color(b[2]), f);
    sunc.set(a[3]).lerp(new THREE.Color(b[3]), f);
    const sunI = a[4] + (b[4] - a[4]) * f;
    const amb = a[5] + (b[5] - a[5]) * f;
    // posizione del sole (alba 6:30, tramonto 19:30) ; di notte la "luce" diventa la luna
    const ang = ((t - 6.5) / 13) * Math.PI;
    const isDay = t > 6.3 && t < 19.8;
    if (isDay) this.sunDir.set(Math.cos(ang) * 0.8, Math.max(0.08, Math.sin(ang)), -0.45).normalize();
    else {
      const mt = ((t + 24 - 19.5) % 24) / 11;
      const ma = mt * Math.PI;
      this.sunDir.set(Math.cos(ma) * 0.7, Math.max(0.15, Math.sin(ma) * 0.8), 0.4).normalize();
    }
    this.night = t < 6 ? 1 : t < 7.2 ? 1 - (t - 6) / 1.2 : t < 19.3 ? 0 : t < 21 ? (t - 19.3) / 1.7 : 1;
    this.sun.color.copy(sunc);
    this.sun.intensity = sunI;
    this.sun.position.copy(center).addScaledVector(this.sunDir, 400);
    this.sun.target.position.copy(center);
    this.hemi.intensity = amb;
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.55);
    this.hemi.groundColor.set(0x4a4a30).multiplyScalar(0.4 + amb);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(hor);
    this.skyMat.uniforms.sunDir.value.copy(isDay ? this.sunDir : this.sunDir.clone().multiplyScalar(-1));
    this.skyMat.uniforms.sunCol.value.copy(isDay ? sunc : new THREE.Color(0x000000));
    this.skyMat.uniforms.night.value = this.night;
    this.sky.position.copy(center);
    this.scene.fog.color.copy(hor);
    this.scene.fog.far = fogFar;
    this.scene.fog.near = fogFar * 0.25;
  }
}
