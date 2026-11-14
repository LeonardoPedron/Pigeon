// Meteo: sereno, nuvoloso, pioggia, nebbia padana del mattino. Cambia ogni qualche ora di gioco.
import * as THREE from 'three';

const STATES = {
  sereno: { cloud: 0.32, sun: 1, amb: 1, fog: 1, rain: 0, gray: 0 },
  nuvoloso: { cloud: 0.75, sun: 0.55, amb: 0.92, fog: 0.85, rain: 0, gray: 0.35 },
  pioggia: { cloud: 0.95, sun: 0.28, amb: 0.75, fog: 0.5, rain: 1, gray: 0.6 },
  nebbia: { cloud: 0.6, sun: 0.45, amb: 0.9, fog: 0.22, rain: 0, gray: 0.55 },
};
export const WEATHER_LABEL = { sereno: '☀️ Sereno', nuvoloso: '☁️ Nuvoloso', pioggia: '🌧 Pioggia', nebbia: '🌫 Nebbia' };

export class Weather {
  constructor(scene, quality) {
    this.state = 'sereno';
    this.cur = { ...STATES.sereno };
    this.nextChange = 3;
    this.timer = 0;
    const N = quality === 'low' ? 500 : quality === 'medium' ? 1200 : 2200;
    const pos = new Float32Array(N * 6);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 60; this.drops[i * 3 + 1] = Math.random() * 30; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.N = N;
    this.lastHour = 8;
  }

  set(state) { this.state = state; }

  update(dt, dayNight, center, scene) {
    const h = dayNight.time;
    // cambi di meteo: nebbia probabile all'alba
    if (Math.floor(h) !== this.lastHour) {
      this.lastHour = Math.floor(h);
      this.nextChange--;
      if (this.nextChange <= 0) {
        const r = Math.random();
        if (h >= 5 && h < 9 && r < 0.45) this.state = 'nebbia';
        else this.state = r < 0.5 ? 'sereno' : r < 0.78 ? 'nuvoloso' : 'pioggia';
        this.nextChange = 2 + Math.floor(Math.random() * 4);
      }
      if (this.state === 'nebbia' && h >= 11) this.state = 'sereno';
    }
    const tgt = STATES[this.state];
    const k = Math.min(1, dt * 0.25);
    for (const key in tgt) this.cur[key] += (tgt[key] - this.cur[key]) * k;
    const c = this.cur;
    dayNight.sun.intensity *= c.sun;
    dayNight.hemi.intensity *= c.amb;
    scene.fog.far *= c.fog;
    scene.fog.near *= c.fog * 0.6;
    const gray = new THREE.Color(0x9aa2ab).multiplyScalar(1 - dayNight.night * 0.8);
    scene.fog.color.lerp(gray, c.gray);
    dayNight.skyMat.uniforms.cloud.value = c.cloud;
    dayNight.skyMat.uniforms.horizon.value.lerp(gray, c.gray);
    dayNight.skyMat.uniforms.top.value.lerp(gray, c.gray * 0.8);
    // pioggia attorno alla camera
    this.rain.visible = c.rain > 0.05;
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array;
      const n = Math.floor(this.N * c.rain);
      for (let i = 0; i < this.N; i++) {
        const o = i * 3;
        this.drops[o + 1] -= dt * 14;
        if (this.drops[o + 1] < 0) { this.drops[o + 1] += 30; this.drops[o] = (Math.random() - 0.5) * 60; this.drops[o + 2] = (Math.random() - 0.5) * 60; }
        const x = center.x + this.drops[o], y = center.y - 12 + this.drops[o + 1], z = center.z + this.drops[o + 2];
        const v = i < n ? 1 : 0;
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + 0.05 * v; p[i * 6 + 4] = y + 0.45 * v; p[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
