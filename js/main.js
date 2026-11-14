// Piccione Spia – Operazione Rovolon. Avvio, ciclo di gioco, collegamento dei sistemi.
import * as THREE from 'three';
import { loadWorldData } from './world/data.js';
import { World } from './world/world.js';
import { DayNight } from './systems/daynight.js';
import { Input } from './systems/input.js';
import { Audio } from './systems/audio.js';
import { Pigeon, SpyCamera } from './player/pigeon.js';
import { PoopSystem } from './player/poop.js';
import { Batteries } from './player/batteries.js';
import { RoadGraph } from './npc/roadgraph.js';
import { NPCManager } from './npc/people.js';
import { Missions, fmtDist } from './missions/missions.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { FullMap } from './ui/fullmap.js';
import { SHOUTS } from './npc/dialogue.js';
import { Details } from './world/details.js';
import { Polaroid } from './ui/polaroid.js';
import { Animals } from './npc/animals.js';
import { Weather, WEATHER_LABEL } from './systems/weather.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'piccioneSpia.save.v1';
const SET_KEY = 'piccioneSpia.settings.v1';
const REC_KEY = 'piccioneSpia.records.v1';
const ACH = [
  ['fly', 'Primo volo', 'Decolla per la prima volta'], ['fly5', 'Ali instancabili', 'Vola per 5 km'], ['fly25', 'Giro del comune', 'Vola per 25 km'],
  ['poop10', 'Bombardiere', 'Fai i bisogni 10 volte'], ['poop50', 'Flagello di Rovolon', 'Fai i bisogni 50 volte'], ['steal5', 'Ladro di pile', 'Ruba 5 batterie'],
  ['photo', 'Primo scatto', 'Scatta una Polaroid'], ['photo10', 'Archivio segreto', 'Raccogli 10 foto'], ['wire', 'Funambolo', 'Posati su un filo elettrico'],
  ['car', 'Passaggio gratis', 'Fatti trasportare sul tetto di un\'auto in corsa'], ['head', 'Cappello vivente', 'Posati sulla testa di qualcuno'], ['tower', 'Campanaro', 'Posati su un campanile'],
  ['hawk', 'Scampato al falco', 'Sfuggi al falco'], ['story', 'Fine dell\'operazione', 'Completa la campagna'], ['proc5', 'Agente esperto', 'Completa 5 missioni procedurali'], ['days', 'Veterano', 'Sopravvivi fino al giorno 3'],
];

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const settings = lsGet(SET_KEY) || { quality: isTouch ? 'low' : 'medium', audio: true };
const params = new URLSearchParams(location.search);
if (params.get('q')) settings.quality = params.get('q');
const Q = settings.quality;

const VIEW = { low: 900, medium: 1500, high: 2200 };

const loadbar = $('loadbar'), loadtext = $('loadtext');
function progress(p, msg) {
  loadbar.style.width = Math.round(p * 100) + '%';
  if (msg) loadtext.textContent = msg;
}

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: Q !== 'low' && !isTouch, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = Q !== 'low' && settings.shadows !== false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPR = Q === 'high' ? Math.min(devicePixelRatio, 2) : Q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    this.pr = this.maxPR;
    this.renderer.setPixelRatio(this.pr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.03, 4500);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.audio.enabled = settings.audio;
    this.suspicion = 0;
    this.timeMult = 1;
    this.modal = false;
    this.paused = false;
    this.running = false;
    this.photoMode = false;
    this.photos = [];
    this.fps = 0;
    this.frames = 0;
    this.fpsT = 0;
    this.saveT = 0;
    this.lastHour = -1;
    this.viewMul = settings.view || 1;
    this.markerPool = [];
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.fpsEl.className = 'hidden';
    document.body.append(this.fpsEl);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async load() {
    progress(0.01, 'Scarico i dati OpenStreetMap del comune di Rovolon…');
    this.data = await loadWorldData((p) => progress(p * 0.35, 'Scarico i dati OpenStreetMap del comune di Rovolon… ' + Math.round(p * 100) + '%'));
    this.world = new World(this.data, this.scene, this.renderer, Q);
    await this.world.build((p, m) => progress(0.35 + p * 0.5, m));
    progress(0.86, 'Collego le strade e sveglio gli abitanti…');
    await new Promise((r) => setTimeout(r, 0));
    this.details = new Details(this.world, this.scene);
    this.details.build();
    this.graph = new RoadGraph(this.data);
    this.npc = new NPCManager(this.world, this.data, this.scene, this.graph, Q);
    this.world.col.dynamic = (x, z, r) => this.npc.collidersNear(x, z, r);
    this.dayNight = new DayNight(this.scene, Q);
    this.pigeon = new Pigeon(this.world, this.scene);
    this.cam = new SpyCamera(this.camera, this.world);
    this.poop = new PoopSystem(this.scene, this.world);
    this.batteries = new Batteries(this.scene, this.world, this.data);
    this.missions = new Missions(this);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this, $('minimap'));
    this.fullmap = new FullMap(this);
    this.polaroid = new Polaroid();
    this.buildMarkers();
    this.animals = new Animals(this);
    this.weather = new Weather(this.scene, Q);
    progress(1, `Pronto: ${this.data.buildings.length} edifici, ${this.data.roads.length} strade, ${this.npc.agents.length} abitanti.`);
    // pre-compilazione shader con un primo render
    this.placeStart(null);
    this.world.update(this.pigeon.pos, 1);
    this.dayNight.update(0, this.pigeon.pos, VIEW[Q]);
    this.renderer.compile(this.scene, this.camera);
  }

  placeStart(save) {
    const ch = this.data.pois.find((p) => p.t === 'place_of_worship' && /Giovanni/.test(p.n || '')) || { x: this.data.spawn.x, z: this.data.spawn.z };
    const rec = this.world.buildingAt(ch.x, ch.z);
    this.nest = rec ? { x: rec.door.x + rec.door.nx * 6, z: rec.door.z + rec.door.nz * 6 } : { x: ch.x, z: ch.z };
    if (save?.pos) {
      this.pigeon.place(save.pos[0], save.pos[2], save.pos[1]);
      this.pigeon.heading = save.heading || 0;
    } else {
      this.pigeon.place(this.nest.x, this.nest.z);
      this.pigeon.heading = rec ? Math.atan2(-rec.door.nx, -rec.door.nz) : 0;
    }
    this.cam.yaw = this.pigeon.heading;
    this.cam.update(0, this.input, this.pigeon);
  }

  start(continueGame) {
    const save = continueGame ? lsGet(SAVE_KEY) : null;
    if (!continueGame) try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.placeStart(save);
    if (save) {
      this.pigeon.battery = save.battery ?? 100;
      this.dayNight.time = save.time ?? 8;
      this.dayNight.day = save.day ?? 1;
      this.suspicion = save.suspicion || 0;
      this.missions.load(save.missions);
      this.poop.load(save.splats);
      this.photos = save.photos || [];
      this.polaroid.setCount(this.photos.length);
      Object.assign(this.pigeon.stats, save.stats || {});
      this.batteries.stolen = save.stolen || 0;
      this.poop.count = save.poops || 0;
    } else {
      this.dayNight.time = 8.2;
    }
    this.npc.init(this.dayNight.time);
    this.applyUpgrades();
    if (!save) this.pigeon.battery = this.pigeon.maxBattery;
    this.lastHour = Math.floor(this.dayNight.time);
    $('start').classList.add('hidden');
    this.hud.show();
    if (isTouch) {
      $('touch').classList.remove('hidden');
      this.input.setupTouch($('touch'));
    }
    this.audio.start();
    this.running = true;
    this.missions.start(true);
    this.save();
    this.canvas.focus();
  }

  setModal(v) {
    this.modal = v;
    if (v && document.pointerLockElement) document.exitPointerLock?.();
  }

  toggleMap(force) {
    const open = force ?? !this.fullmap.open;
    if (open) { this.fullmap.show(); this.setModal(true); }
    else { this.fullmap.hide(); this.setModal(this.paused || this.hud.briefingOpen); }
  }

  pause(v) {
    this.paused = v;
    $('pause').classList.toggle('hidden', !v);
    if (v) {
      const s = this.pigeon.stats;
      $('stats').innerHTML = `Missioni completate: <b>${this.missions.state.done.length}</b> · Punti Illuminati: <b>${this.missions.state.points}</b><br>Volati: ${fmtDist(s.flown)} · Camminati: ${fmtDist(s.walked)} · Batterie rubate: ${this.batteries.stolen} · Bisogni: ${this.poop.count}`;
      $('quality2').value = Q;
      $('optAudio2').checked = this.audio.enabled;
      $('gallery').classList.add('hidden');
      $('missionList').classList.add('hidden');
    }
    this.setModal(v || this.fullmap.open || this.hud.briefingOpen);
  }

  addSuspicion(n) {
    if (this.upgrades.silent) n *= 0.6;
    this.suspicion = Math.min(100, this.suspicion + n);
    if (this.suspicion >= 100) {
      this.suspicion = 0;
      this.hud.toast('Copertura saltata! Gli Illuminati ti riportano alla base.', 'bad');
      this.audio.play('alarm');
      this.pigeon.place(this.nest.x, this.nest.z);
      this.pigeon.battery = Math.max(5, this.pigeon.battery - 15);
    }
  }

  // ------------------------------------------------------------ azioni
  tryPhoto() {
    this.audio.play('shutter');
    this.hud.flash();
    this.photoRequested = true;
    const step = this.missions.step;
    const t = step?.photoTarget?.();
    if (!t) { this.photoLabel = this.npc.streetNear(this.pigeon.pos.x, this.pigeon.pos.z) || 'Ricognizione'; this.photoSecret = false; this.missions.event({ type: 'photo', ok: false }); return; }
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    this.camera.updateMatrixWorld();
    const ndc = pos.clone().project(this.camera);
    const d = pos.distanceTo(this.camera.position);
    const eff = d / this.cam.zoom;
    let ok = true, reason = '';
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.75 || Math.abs(ndc.y) > 0.75) { ok = false; reason = 'Il bersaglio non è inquadrato'; }
    else if (eff > t.maxD) { ok = false; reason = `Troppo lontano (${Math.round(d)} m): avvicinati o usa lo zoom`; }
    else if (!this.world.lineOfSight(this.camera.position.clone(), pos)) { ok = false; reason = 'Qualcosa copre il bersaglio'; }
    this.hud.toast(ok ? `📷 Foto perfetta di: ${t.label}!` : '📷 ' + reason, ok ? 'good' : 'bad');
    this.photoLabel = ok ? t.label : 'Foto';
    this.photoSecret = ok;
    this.missions.event({ type: 'photo', ok });
  }

  capturePhoto() {
    try {
      const src = this.renderer.domElement;
      const S = Math.min(src.width, src.height);
      const c = document.createElement('canvas');
      c.width = c.height = 320;
      const g = c.getContext('2d');
      g.drawImage(src, (src.width - S) / 2, (src.height - S) / 2, S, S, 0, 0, 320, 320);
      // grana e calore da pellicola istantanea
      g.fillStyle = 'rgba(255,200,120,.08)';
      g.fillRect(0, 0, 320, 320);
      const img = c.toDataURL('image/jpeg', 0.7);
      const p = this.pigeon.pos;
      const where = (this.npc.streetNear(p.x, p.z) || 'campagna') + ', ' + this.npc.villageName(p.x, p.z);
      const when = `${this.dayNight.clock()} · giorno ${this.dayNight.day}`;
      this.photoTotal = (this.photoTotal || 0) + 1;
      this.photos.push({ img, label: this.photoLabel || 'Foto', t: when, where, secret: !!this.photoSecret });
      if (this.photos.length > 12) this.photos.shift();
      this.polaroid.show(img, this.photoLabel || 'Foto', `${where} — ${when}`, !!this.photoSecret);
      this.polaroid.setCount(this.photos.length);
      this.achieve?.('photo');
    } catch (e) { console.warn(e); }
  }

  // stato del mirino (bersaglio inquadrato, distanza, aggancio)
  updateViewfinder(dt) {
    this.vfT = (this.vfT || 0) - dt;
    const z = this.cam.zoom;
    document.getElementById('photoZoom').textContent = '×' + z.toFixed(1);
    const t = this.missions.step?.photoTarget?.();
    const cross = document.getElementById('photoCross'), lock = document.getElementById('photoLock'), dist = document.getElementById('photoDist');
    const p = this.pigeon.pos;
    document.getElementById('photoMeta').textContent = `${this.dayNight.clock()} · ${(this.npc.streetNear(p.x, p.z) || '').toUpperCase()}`;
    if (!t) { cross.classList.remove('lock'); lock.textContent = 'RICOGNIZIONE'; dist.textContent = '— m'; return; }
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    this.camera.updateMatrixWorld();
    const ndc = pos.clone().project(this.camera);
    const d = pos.distanceTo(this.camera.position);
    dist.textContent = Math.round(d) + ' m';
    const inFrame = ndc.z < 1 && Math.abs(ndc.x) < 0.75 && Math.abs(ndc.y) < 0.75;
    if (this.vfT <= 0) { this.vfT = 0.25; this.vfLos = this.world.lineOfSight(this.camera.position.clone(), pos); }
    const ok = inFrame && d / z <= t.maxD && this.vfLos;
    cross.classList.toggle('lock', ok);
    lock.textContent = ok ? 'AGGANCIATO' : !inFrame ? 'FUORI CAMPO' : d / z > t.maxD ? 'TROPPO LONTANO · ZOOM' : 'COPERTO';
  }

  trySteal() {
    const it = this.batteries.nearest(this.pigeon.pos, 1.8);
    if (!it) return false;
    const kind = this.batteries.steal(it);
    this.pigeon.battery = Math.min(this.pigeon.maxBattery, this.pigeon.battery + kind.amount);
    this.audio.play('steal');
    this.hud.toast(`🔋 Rubata: ${kind.name} (+${kind.amount}%)`, 'good');
    const w = this.npc.witnesses(this.pigeon.pos, 14);
    if (w.length) {
      const a = w[0];
      this.npc.say(a, SHOUTS.thief[Math.floor(Math.random() * SHOUTS.thief.length)], 'thief');
      this.addSuspicion(30);
      this.audio.play('alarm');
    }
    this.missions.event({ type: 'steal' });
    return true;
  }

  interact() {
    const s = this.missions.step;
    if (s?.type === 'bug') { this.missions.event({ type: 'interact' }); if (!this.missions.step || this.missions.step !== s) { this.audio.play('bug'); this.hud.toast('🐞 Cimice piazzata!', 'good'); } else this.hud.toast("Avvicinati di più all'auto", 'bad'); }
  }

  get upgrades() { return this.missions.state.upgrades || (this.missions.state.upgrades = {}); }
  applyUpgrades() {
    const u = this.upgrades;
    this.pigeon.maxBattery = u.battery ? 150 : 100;
    this.pigeon.speedMul = u.turbo ? 1.25 : 1;
    this.cam.maxZoom = u.zoom ? 12 : 8;
    this.minimap.range = u.radar ? 260 : 160;
  }
  renderLab() {
    const L = document.getElementById('lab');
    const st = this.missions.state;
    const items = [
      ['battery', 'Batteria al litio maggiorata', 'Capacità 150% invece di 100%', 60],
      ['turbo', 'Turbo potenziato', 'Volo e camminata +25% di velocità', 50],
      ['zoom', 'Teleobiettivo ×12', 'Zoom della fotocamera spia fino a ×12', 30],
      ['silent', 'Piume silenziose', 'Sospetto −40%, falco e gatti meno pericolosi', 70],
      ['cluster', 'Bisogni a grappolo', 'Tre colpi alla volta (F)', 40],
      ['radar', 'Antenna radar', 'Minimappa con raggio più ampio', 40],
    ];
    L.innerHTML = `<div>Punti Illuminati disponibili: <b>${st.points}</b></div>`;
    for (const [k, name, desc, cost] of items) {
      const d = document.createElement('div');
      d.className = 'lab-item';
      const own = !!this.upgrades[k];
      d.innerHTML = `<div><b>${name}</b><small>${desc}</small></div>`;
      const b = document.createElement('button');
      b.textContent = own ? '✔ Installato' : `Compra (${cost})`;
      b.disabled = own || st.points < cost;
      b.addEventListener('click', () => { if (st.points >= cost && !this.upgrades[k]) { st.points -= cost; this.upgrades[k] = 1; this.applyUpgrades(); this.save(); this.audio.play('trophy'); this.renderLab(); } });
      d.append(b);
      L.append(d);
    }
  }
  achieve(id) {
    const A = this.missions.state.ach || (this.missions.state.ach = {});
    if (A[id]) return;
    const def = ACH.find((a) => a[0] === id);
    if (!def) return;
    A[id] = Date.now();
    this.hud.toast(`🏆 Obiettivo sbloccato: ${def[1]}`, 'good');
    this.audio.play('trophy');
    this.missions.state.points += 5;
  }
  checkAchievements() {
    const s = this.pigeon.stats, st = this.missions.state;
    if (s.flown > 50) this.achieve('fly');
    if (s.flown > 5000) this.achieve('fly5');
    if (s.flown > 25000) this.achieve('fly25');
    if (this.poop.count >= 10) this.achieve('poop10');
    if (this.poop.count >= 50) this.achieve('poop50');
    if (this.batteries.stolen >= 5) this.achieve('steal5');
    if (this.photos.length >= 10) this.achieve('photo10');
    if (this.pigeon.support?.kind === 'wire') this.achieve('wire');
    if (this.pigeon.support?.kind === 'car' && this.pigeon.support.ref?.state === 'driving') this.achieve('car');
    if (this.pigeon.support?.kind === 'head') this.achieve('head');
    if (this.pigeon.onBuilding?.k === 'tower') this.achieve('tower');
    if (st.proc >= 5) this.achieve('proc5');
    if (this.dayNight.day >= 3) this.achieve('days');
    const rec = lsGet(REC_KEY) || {};
    const cur = { points: st.points, missions: st.done.length, km: +(s.flown / 1000).toFixed(1) };
    let ch = false;
    for (const k in cur) if (!(rec[k] >= cur[k])) { rec[k] = cur[k]; ch = true; }
    if (ch) lsSet(REC_KEY, rec);
  }
  renderAchievements() {
    const L = document.getElementById('achList');
    const A = this.missions.state.ach || {};
    const rec = lsGet(REC_KEY) || {};
    L.innerHTML = `<div><b>Record personali</b>: ${rec.points || 0} punti · ${rec.missions || 0} missioni · ${rec.km || 0} km volati</div>` + ACH.map(([id, name, desc]) => `<div class="ach${A[id] ? ' ok' : ''}">${A[id] ? '🏆' : '🔒'} <b>${name}</b> — ${desc}</div>`).join('');
  }

  // ------------------------------------------------------------ marcatori 3D degli obiettivi
  buildMarkers() {
    const beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 8, 1, true).translate(0, 0.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const arrowGeo = new THREE.ConeGeometry(0.8, 1.6, 4).rotateX(Math.PI);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffc400 });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, beamMat);
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      g.add(beam, arrow);
      g.visible = false;
      g.userData = { beam, arrow };
      this.scene.add(g);
      this.markerPool.push(g);
    }
  }
  updateMarkers() {
    const ts = this.missions.targets();
    const p = this.pigeon.pos;
    this.markerPool.forEach((g, i) => {
      const t = ts[i];
      if (!t) { g.visible = false; return; }
      g.visible = true;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const s = THREE.MathUtils.clamp(d / 60, 0.25, 6);
      g.position.set(t.x, t.y, t.z);
      g.userData.beam.scale.set(s, 80 + d * 0.1, s);
      g.userData.beam.visible = d > 25;
      g.userData.arrow.scale.setScalar(s);
      g.userData.arrow.position.y = 1.2 * s + Math.sin(performance.now() / 300) * 0.3 * s;
      g.userData.arrow.rotation.y += 0.03;
    });
  }

  // ------------------------------------------------------------ eventi
  handleEvents() {
    for (const ev of this.pigeon.events) {
      if (ev.type === 'land') { this.missions.event(ev); if (ev.building) this.audio.play('flap'); }
      else if (ev.type === 'takeoff') this.audio.play('flap');
      else if (ev.type === 'lowbattery') this.hud.toast(`⚠ Batteria al ${ev.level}%! Ruba una batteria (bagliore verde).`, 'bad');
      else if (ev.type === 'empty') this.hud.toast('🪫 Batteria scarica: puoi solo camminare. Trova una batteria!', 'bad');
      else if (ev.type === 'nobattery') this.hud.toast('🪫 Batteria scarica: non puoi volare.', 'bad');
    }
    this.pigeon.events.length = 0;
    const pp = this.pigeon.pos;
    for (const ev of this.npc.events) {
      if (ev.type === 'line') {
        if (ev.heard) {
          const w = ev.line.who;
          this.hud.subtitle(`${w.first}${w.title ? ' (' + w.title + ')' : ''}`, ev.line.text, false, 1600 + ev.line.text.length * 50);
          this.audio.play('blip', { n: Math.ceil(ev.line.text.length / 6), pitch: w.role === 'child' ? 420 : w.gender === 'f' ? 290 : 170, vol: Math.max(0.2, 1 - ev.dist / 16) });
        }
      } else if (ev.type === 'convoEnd') {
        if (ev.fraction > 0) this.missions.event({ type: 'heard', convo: ev.convo, fraction: ev.fraction });
      } else if (ev.type === 'say') {
        const d = Math.hypot(ev.x - pp.x, ev.z - pp.z);
        if (d < 35) {
          this.hud.subtitle(ev.who.first + (ev.who.last ? '' : ''), ev.text, d > 20, 3500);
          this.audio.play('blip', { n: 6, pitch: ev.who.gender === 'f' ? 300 : 180, vol: Math.max(0.2, 1 - d / 35) });
        }
      } else if (ev.type === 'honk') {
        if (Math.hypot(ev.x - pp.x, ev.z - pp.z) < 60) this.audio.play('honk');
      } else if (ev.type === 'carHit') {
        this.audio.play('hit');
        this.hud.toast('💥 Investito da un\'auto! -8% batteria', 'bad');
      }
    }
    this.npc.events.length = 0;
  }

  bells() {
    const h = Math.floor(this.dayNight.time);
    if (h === this.lastHour) return;
    this.lastHour = h;
    if (h < 7 || h > 21) return;
    const p = this.pigeon.pos;
    let best = 1e9;
    for (const c of this.npc.places.church) best = Math.min(best, Math.hypot(c.x - p.x, c.z - p.z));
    if (best < 1500) this.audio.play('bell', { n: Math.min(6, h % 12 || 12), vol: 1 - best / 1500 });
  }

  // ------------------------------------------------------------ ciclo principale
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const now = t / 1000;
    let dt = this.last ? now - this.last : 0.016;
    this.last = now;
    this.realFrame(dt);
    dt = Math.min(dt, 0.05);
    if (!this.running) return;
    this.tick(dt);
    this.render();
    this.input.endFrame();
  }

  // simulazione a passo fisso senza rendering (usata dai test automatici)
  simulate(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) {
      this.tick(step);
      this.input.endFrame();
    }
  }

  tick(dt) {
    const inp = this.input;
    // tasti globali
    if (inp.hit('Escape', 'KeyP')) {
      if (this.fullmap.open) this.toggleMap(false);
      else if (this.photoMode) this.setPhoto(false);
      else if (!this.hud.briefingOpen) this.pause(!this.paused);
    }
    if (inp.hit('KeyM', 'touch:map') && !this.paused && !this.hud.briefingOpen) this.toggleMap();
    if (this.hud.briefingOpen && inp.hit('Enter')) this.hud.closeBriefing();
    const active = !this.modal && !this.paused;
    if (active) {
      if (inp.hit('KeyQ', 'touch:photo')) this.setPhoto(!this.photoMode);
      if (inp.hit('F3')) { this.showFps = !this.showFps; this.fpsEl.classList.toggle('hidden', !this.showFps); }
      if (inp.hit('KeyV')) { this.audio.play('coo'); this.missions.event({ type: 'coo' }); this.npc.say({ x: this.pigeon.pos.x, z: this.pigeon.pos.z, first: 'P-77', last: 'x' }, 'Tuuu-tuuu-tuuu!', 'coo'); }
      if (inp.hit('KeyF', 'touch:poop') && !this.photoMode) { if (this.poop.drop(this.pigeon)) { this.audio.play('drop'); if (this.upgrades.cluster) { this.poop.cooldown = 0; this.poop.drop(this.pigeon, 0.18); this.poop.cooldown = 0; this.poop.drop(this.pigeon, -0.18); } } }
      if (inp.hit('KeyE', 'touch:steal')) { if (!this.trySteal()) this.interact(); }
      if (this.photoMode && (inp.click || inp.hit('Enter'))) this.tryPhoto();
      this.timeMult = inp.down('KeyT') ? 30 : 1;

      this.pigeon.update(dt, inp, this.cam.yaw, this.photoMode);
      const hits = this.poop.update(dt, this.npc);
      for (const h of hits) {
        this.audio.play('splat');
        if (h.kind === 'person' || h.kind === 'car') {
          this.npc.onPooped(h);
          if (h.kind === 'person') this.addSuspicion(4);
        }
        this.missions.event({ type: 'poop', hit: h });
      }
      this.dayNight.update(dt, this.pigeon.pos, this.viewDist() * this.viewMul, this.timeMult);
      this.weather.update(dt, this.dayNight, this.camera.position, this.scene);
      this.animals.update(dt);
      this.achT = (this.achT || 0) - dt;
      if (this.achT <= 0) { this.achT = 1; this.checkAchievements(); }
      this.npc.update(dt, this.dayNight.time, this.pigeon);
      this.batteries.update(dt, this.pigeon.pos);
      this.handleEvents();
      this.missions.update(dt);
      this.bells();
      this.suspicion = Math.max(0, this.suspicion - dt * 2);
      const near = this.batteries.nearest(this.pigeon.pos, 1.8);
      this.hud.prompt(near ? `${isTouch ? '✋' : 'E'} – Ruba: ${near.kind.name} (${near.where})` : null);
      this.saveT += dt;
      if (this.saveT > 20) { this.saveT = 0; this.save(); }
    }
    this.cam.update(dt, inp, this.pigeon);
    this.world.setViewDistance(this.viewDist());
    this.world.update(this.pigeon.pos, dt);
    this.details.update(this.pigeon.pos, this.viewDist());
    if (this.photoMode) this.updateViewfinder(dt);
    if (this.showFps) { this.fpsEl.textContent = `${this.fps.toFixed(0)} fps · ${this.renderer.info.render.calls} draw · ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k tri · px ${this.pr.toFixed(2)}`; }
    this.world.setNight(this.dayNight.night);
    this.updateMarkers();
    this.hud.update(dt);
    this.minimap.update(dt);
    this.audio.update(this.pigeon.mode === 'air' ? Math.hypot(this.pigeon.vel.x, this.pigeon.vel.z) : 0, this.dayNight.night, this.weather.cur.rain);
  }

  render() {
    // ombre aggiornate a frame alterni (prestazioni)
    this.frameN = (this.frameN || 0) + 1;
    this.renderer.shadowMap.autoUpdate = false;
    if (this.frameN % 2 === 0 || this.photoMode) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    if (this.photoRequested) { this.photoRequested = false; this.capturePhoto(); }
  }

  setPhoto(v) {
    this.photoMode = v;
    this.cam.photo = v;
    this.cam.zoom = 1;
    const t = this.missions.step?.photoTarget?.();
    this.hud.photoMode(v, t?.label);
    if (isTouch) document.querySelector('[data-k="photo"]').classList.toggle('on', v);
  }

  viewDist() {
    const alt = Math.max(0, this.pigeon.pos.y - this.world.terrain.heightAt(this.pigeon.pos.x, this.pigeon.pos.z));
    return VIEW[Q] + Math.min(1500, alt * 2);
  }

  realFrame(dt) {
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT < 3) return;
    this.fps = this.frames / this.fpsT;
    this.frames = 0;
    this.fpsT = 0;
    if (!this.running) return;
    if (this.fps < 28 && this.pr > 0.55) { this.pr = Math.max(0.55, this.pr - 0.15); this.renderer.setPixelRatio(this.pr); this.resize(); }
    else if (this.fps > 55 && this.pr < this.maxPR) { this.pr = Math.min(this.maxPR, this.pr + 0.1); this.renderer.setPixelRatio(this.pr); this.resize(); }
  }

  save() {
    if (!this.running) return;
    const p = this.pigeon;
    const data = {
      v: 1, pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => Math.round(v * 100) / 100), heading: p.heading, battery: p.battery,
      time: this.dayNight.time, day: this.dayNight.day, suspicion: this.suspicion, missions: this.missions.serialize(),
      splats: this.poop.serialize(), photos: this.photos.slice(-8), stats: p.stats, stolen: this.batteries.stolen, poops: this.poop.count,
    };
    if (!lsSet(SAVE_KEY, data)) { data.photos = []; lsSet(SAVE_KEY, data); }
  }
}

// ------------------------------------------------------------------ avvio
const game = new Game();
window.__game = game;
$('quality').value = Q;
$('optAudio').checked = settings.audio;
$('quality').addEventListener('change', (e) => { settings.quality = e.target.value; lsSet(SET_KEY, settings); location.reload(); });
$('quality2').addEventListener('change', (e) => { settings.quality = e.target.value; lsSet(SET_KEY, settings); game.save(); location.reload(); });
const setAudio = (v) => { settings.audio = v; lsSet(SET_KEY, settings); game.audio.setEnabled(v); };
$('optAudio').addEventListener('change', (e) => setAudio(e.target.checked));
$('optAudio2').addEventListener('change', (e) => setAudio(e.target.checked));
$('btnNew').addEventListener('click', () => game.start(false));
$('btnContinue').addEventListener('click', () => game.start(true));
$('btnResume').addEventListener('click', () => game.pause(false));
$('btnPause').addEventListener('click', () => game.pause(true));
$('btnReset').addEventListener('click', () => {
  if (confirm('Cancellare il salvataggio e ricominciare da capo?')) { game.running = false; try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload(); }
});
$('btnGallery').addEventListener('click', () => {
  const g = $('gallery');
  g.innerHTML = game.photos.length ? '' : '<p>Nessuna foto ancora. Premi Q per la fotocamera.</p>';
  for (const p of game.photos.slice().reverse()) {
    const f = document.createElement('figure');
    const img = document.createElement('img');
    img.src = p.img;
    const cap = document.createElement('figcaption');
    cap.textContent = `${p.secret ? '🔒 ' : ''}${p.label} · ${p.where || ''} · ${p.t}`;
    f.append(img, cap);
    g.append(f);
  }
  g.classList.toggle('hidden');
});
$('btnLab').addEventListener('click', () => { game.renderLab(); $('lab').classList.toggle('hidden'); });
$('btnAch').addEventListener('click', () => { game.renderAchievements(); $('achList').classList.toggle('hidden'); });
$('optView').value = String(settings.view || 1);
$('optView').addEventListener('change', (e) => { settings.view = +e.target.value; game.viewMul = settings.view; lsSet(SET_KEY, settings); });
$('optShadows').checked = settings.shadows !== false;
$('optShadows').addEventListener('change', (e) => { settings.shadows = e.target.checked; lsSet(SET_KEY, settings); game.renderer.shadowMap.enabled = e.target.checked && Q !== 'low'; game.dayNight.sun.castShadow = game.renderer.shadowMap.enabled; game.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); });
$('btnMissionList').addEventListener('click', () => {
  const l = $('missionList');
  const st = game.missions.state;
  l.innerHTML = '<ol>' + st.done.map((t) => `<li>✅ ${t.replace(/</g, '&lt;')}</li>`).join('') + (game.missions.current ? `<li>▶ ${game.missions.current.title}</li>` : '') + '</ol>';
  l.classList.toggle('hidden');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.running) game.save(); });

try {
  await game.load();
  if (lsGet(SAVE_KEY)) $('btnContinue').classList.remove('hidden');
  $('loading').classList.add('hidden');
  $('startButtons').classList.remove('hidden');
  requestAnimationFrame((t) => game.loop(t));
  if (params.get('autostart')) game.start(params.get('autostart') === 'continue');
} catch (e) {
  console.error(e);
  loadtext.textContent = 'Errore durante il caricamento: ' + e.message;
  loadtext.style.color = '#ff8a7a';
}
