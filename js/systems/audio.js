// Audio sintetizzato con WebAudio: tubare, ali, vento, splat, furto, scatto, chiacchiericcio, clacson, campane.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.windGain = null;
  }
  start() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    // rumore bianco
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // vento continuo
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
    // ambiente (grilli di notte)
    this.amb = this.ctx.createGain();
    this.amb.gain.value = 0;
    const o = this.ctx.createOscillator();
    o.frequency.value = 4200;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 18;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.5;
    const og = this.ctx.createGain();
    og.gain.value = 0.5;
    lfo.connect(lg).connect(og.gain);
    o.connect(og).connect(this.amb).connect(this.master);
    o.start(); lfo.start();
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.6 : 0;
    if (v) this.start();
  }
  get ok() { return this.ctx && this.enabled; }
  env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }
  noiseBurst(freq, q, peak, dur, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, peak, type = 'sine', slide) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.01, peak, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, opt = {}) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    switch (name) {
      case 'coo': {
        for (let k = 0; k < 3; k++) {
          const o = c.createOscillator();
          o.type = 'sine';
          const st = t + k * 0.32;
          o.frequency.setValueAtTime(330, st);
          o.frequency.linearRampToValueAtTime(420, st + 0.08);
          o.frequency.linearRampToValueAtTime(300, st + 0.28);
          const trem = c.createOscillator();
          trem.frequency.value = 28;
          const tg = c.createGain();
          tg.gain.value = 40;
          trem.connect(tg).connect(o.frequency);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.25, st + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.3);
          o.connect(g).connect(this.master);
          o.start(st); o.stop(st + 0.32); trem.start(st); trem.stop(st + 0.32);
        }
        break;
      }
      case 'flap': this.noiseBurst(900, 0.8, 0.25, 0.09); break;
      case 'splat': this.noiseBurst(300, 1.5, 0.35, 0.12, 'lowpass'); this.tone(180, 0.1, 0.1, 'sine', 80); break;
      case 'drop': this.tone(900, 0.15, 0.06, 'sine', 300); break;
      case 'steal': this.tone(660, 0.1, 0.15, 'square'); setTimeout(() => this.ok && this.tone(990, 0.15, 0.15, 'square'), 90); break;
      case 'shutter': this.noiseBurst(3000, 0.7, 0.4, 0.04, 'highpass'); setTimeout(() => this.ok && this.noiseBurst(2000, 0.7, 0.3, 0.05, 'highpass'), 70); break;
      case 'success': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.ok && this.tone(f, 0.18, 0.12, 'triangle'), i * 110)); break;
      case 'alarm': this.tone(880, 0.25, 0.12, 'sawtooth', 440); break;
      case 'honk': this.tone(392, 0.35, 0.12, 'square'); this.tone(466, 0.35, 0.08, 'square'); break;
      case 'hit': this.noiseBurst(200, 1, 0.5, 0.2, 'lowpass'); break;
      case 'bell': {
        for (let k = 0; k < (opt.n || 1); k++) {
          setTimeout(() => {
            if (!this.ok) return;
            for (const [f, a] of [[220, 0.12], [440, 0.06], [587, 0.04], [880, 0.03]]) this.tone(f, 2.5, a * (opt.vol || 1), 'sine');
          }, k * 1400);
        }
        break;
      }
      case 'blip': {
        // "voce" stilizzata: sillabe con altezza diversa per persona
        const n = Math.min(14, opt.n || 6);
        for (let k = 0; k < n; k++) {
          const st = t + k * 0.085;
          const o = c.createOscillator();
          o.type = 'triangle';
          o.frequency.value = (opt.pitch || 200) * (0.85 + Math.random() * 0.4);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.05 * (opt.vol ?? 1), st + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.07);
          o.connect(g).connect(this.master);
          o.start(st); o.stop(st + 0.08);
        }
        break;
      }
      default: break;
    }
  }
  update(speed, night) {
    if (!this.ok) return;
    this.windGain.gain.setTargetAtTime(Math.min(0.25, speed / 100), this.ctx.currentTime, 0.2);
    this.amb.gain.setTargetAtTime(night * 0.012, this.ctx.currentTime, 1);
  }
}
