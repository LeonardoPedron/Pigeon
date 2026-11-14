// Multiplayer "Chi è la spia?": altri giocatori come piccioni nella mappa, ruoli segreti,
// indizi, scansioni, accuse verificate con commit-reveal, emote e spinte.
// Si aggancia al gioco a runtime (vedi boot.js) senza modificare main.js.
import * as THREE from 'three';
import { connect } from './transport.js';
import { Role, verifyReveal, SPY, REAL } from './roles.js';
import { RemotePigeon } from './remote.js';
import { Flock } from './flock.js';
import { Dossier, CLUE } from './clues.js';

const EMOTES = ['Tuuu-tuuu!', 'Seguimi!', 'Ti tengo d\'occhio…', 'Ciao!'];
const ACCUSE_RANGE = 10, PUSH_RANGE = 1.6, SCAN_TIME = 2, SCAN_COOLDOWN = 20, WRONG_COOLDOWN = 60, UNMASK_TIME = 30;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r2 = (v) => Math.round(v * 100) / 100;

export class Multiplayer {
  constructor(game, { room, name, net, forceRole }) {
    this.g = game;
    this.room = room;
    this.name = (name || 'Piccione').slice(0, 18);
    this.net = net;
    this.forceRole = forceRole;
    this.peers = new Map();
    this.role = new Role();
    this.dossier = new Dossier();
    this.score = 0;
    this.sendT = 0;
    this.scoreT = 0;
    this.miniT = 0;
    this.spyMinute = 0;
    this.glowUntil = 0;
    this.accuseCooldown = 0;
    this.scanCooldown = 0;
    this.scanProg = 0;
    this.scanTarget = null;
    this.scanBtn = false;
    this.pendingAcc = new Map();
    this.pendingScan = new Map();
    this.unmaskedUntil = 0;
    this.target = null;
    this.sparks = [];
    this.missionsDone = game.missions?.state?.done?.length || 0;
    this.log = [];
  }

  async start() {
    const t = this.t = await connect(this.net, this.room);
    this.id = t.id;
    t.onMessage((m, from) => this.onMessage(m, from));
    t.onJoin((id) => { this.peer(id); if (this.role.commit) this.sendHello(id); });
    t.onLeave((id) => this.dropPeer(id));
    this.flock = new Flock(this.g, this.room, this.g.nest || this.g.pigeon.pos);
    this.patchGame();
    this.buildUI();
    // aspetta di scoprire chi c'è già prima di decidere il ruolo
    await new Promise((r) => setTimeout(r, this.net === 'local' ? 900 : 3000));
    await this.newRole();
    this.status(this.statusText());
    if (this.net !== 'local' && !this.t.turn) console.info('[mp] nessun server TURN configurato (js/net/config.js): sulle reti mobili il collegamento potrebbe fallire');
  }

  // ------------------------------------------------------------------ aggancio al gioco (senza modificarne i file)
  patchGame() {
    const g = this.g, mp = this;
    const isReal = () => mp.role.commit && !mp.role.isSpy;
    // E: le spie rubano batterie (e tutti lo vedono); i piccioni veri, o chi non ha batterie vicino, beccano briciole
    const steal = g.trySteal.bind(g);
    g.trySteal = function () {
      if (!isReal()) {
        const ok = steal();
        if (ok) { mp.onSteal(g.pigeon.pos); return true; }
      }
      mp.onPeck();
      return false;
    };
    // niente "E – Ruba batteria" per chi non è una spia
    if (g.hud?.prompt) {
      const prompt = g.hud.prompt.bind(g.hud);
      g.hud.prompt = (t) => prompt(isReal() && t && /Ruba/.test(t) ? null : t);
    }
    // i piccioni veri non seguono le missioni degli Illuminati
    const ms = g.missions;
    if (ms) {
      for (const k of ['update', 'event']) {
        if (typeof ms[k] !== 'function') continue;
        const orig = ms[k].bind(ms);
        ms[k] = (...a) => (isReal() ? undefined : orig(...a));
      }
      if (typeof ms.targets === 'function') {
        const orig = ms.targets.bind(ms);
        ms.targets = () => (isReal() ? [] : orig());
      }
    }
  }

  // ------------------------------------------------------------------ ruoli
  async newRole() {
    const players = [...this.peers.values()].filter((p) => p.alive).length + 1;
    await this.role.roll(players, this.forceRole);
    this.applyRole();
    this.sendHello();
  }

  applyRole() {
    const spy = this.role.isSpy;
    document.body.classList.toggle('mp-spy', spy);
    document.body.classList.toggle('mp-real', !spy);
    this.el.role.innerHTML = spy
      ? '🤖 Sei una <b>SPIA</b> degli Illuminati'
      : '🐦 Sei un <b>PICCIONE VERO</b> di Rovolon';
    const hud = this.g.hud;
    const brief = [spy ? 'Ruolo segreto: SPIA' : 'Ruolo segreto: PICCIONE VERO', spy
      ? 'Sei una spia-robot degli Illuminati infiltrata tra i piccioni di Rovolon.\n\nCompleta le missioni, ruba batterie quando nessuno ti guarda e non farti scoprire: di notte il tuo occhio bionico può lampeggiare e a volte il tuo tubare suona metallico.\n\nPunti: +5 al minuto finché resti nascosta, +50 per missione.'
      : 'Sei un piccione vero. Tra i piccioni che vedi (giocatori e piccioni comuni) si nascondono spie-robot degli Illuminati.\n\nRaccogli indizi: chi ruba batterie, chi ha l\'occhio rosso al buio, chi tuba in modo metallico. Scansiona i sospetti con R (meglio con la fotocamera Q) e accusa con X.\n\nAccusa giusta +100, sbagliata −40 e un minuto senza accuse.'];
    // il briefing del ruolo va per primo; ai piccioni veri non servono quelli delle missioni
    const q = hud?.briefQueue;
    if (Array.isArray(q) && hud.openBriefing) {
      if (!spy) q.length = 0;
      q.unshift(brief);
      hud.openBriefing();
    } else hud?.toast?.(brief[0], 'good');
  }

  sendHello(to) {
    this.t.send({ t: 'hi', name: this.name, commit: this.role.commit, round: this.role.round, score: this.score, unmask: Math.max(0, (this.unmaskedUntil - performance.now()) / 1000) }, to);
  }

  // ------------------------------------------------------------------ peer
  peer(id) {
    let p = this.peers.get(id);
    if (!p) { p = { id, name: '…', commit: null, round: 0, score: 0, r: null, alive: true, cheater: false, verdict: null }; this.peers.set(id, p); }
    p.alive = true;
    return p;
  }

  model(p) {
    if (!p.r) {
      p.r = new RemotePigeon(this.g.scene, p.id, p.name);
      this.refreshLabel(p);
    }
    return p.r;
  }

  refreshLabel(p) {
    if (!p.r) return;
    const badge = p.cheater ? '🚫' : p.verdict === 'spy' ? '🎩' : p.verdict === 'real' ? '✅' : '';
    p.r.setName(p.name, p.verdict === 'spy' ? '#ff8a7a' : this.target?.id === p.id ? '#ffd34d' : '#ffffff', badge);
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.r) p.r.dispose();
    this.peers.delete(id);
    if (p.name !== '…') this.toast(`👋 ${p.name} è volato via`);
    this.status(this.statusText());
  }

  // ------------------------------------------------------------------ messaggi
  onMessage(m, from) {
    if (!m || typeof m !== 'object') return;
    const p = this.peer(from);
    switch (m.t) {
      case 'hi': {
        const first = p.name === '…';
        p.name = String(m.name || 'Piccione').slice(0, 18);
        p.score = +m.score || 0;
        if (m.commit !== p.commit) {
          if (p.commit) { this.dossier.reset(from); p.verdict = null; }
          p.commit = m.commit; p.round = m.round;
        }
        this.model(p);
        if (m.unmask > 0) p.r.unmask(m.unmask);
        this.refreshLabel(p);
        if (first) { this.toast(`🐦 ${p.name} è entrato nella stanza`); if (this.role.commit) this.sendHello(from); }
        this.status(this.statusText());
        break;
      }
      case 's':
        if (Array.isArray(m.s) && m.s.length >= 9) {
          const r = this.model(p);
          r.push(m.s);
          if (m.s[8] & 1) this.sawGlow(p);
        }
        break;
      case 'sc': p.score = +m.score || 0; break;
      case 'e': this.onEvent(p, m); break;
      case 'scan':
        if (m.to === this.id) {
          const d = Math.max(0, +m.d || 10);
          const spy = this.role.isSpy, near = d < 4;
          const v = Math.round(spy ? (near ? 70 + Math.random() * 25 : 55 + Math.random() * 40) : (near ? 5 + Math.random() * 35 : 5 + Math.random() * 55));
          this.t.send({ t: 'scanR', n: m.n, v }, from);
          if (spy) this.toast(`📡 ${p.name} ti sta scansionando!`, 'bad');
        }
        break;
      case 'scanR': {
        const pend = this.pendingScan.get(m.n);
        if (!pend || pend.id !== from) break;
        this.pendingScan.delete(m.n);
        this.scanResult(p, +m.v);
        break;
      }
      case 'acc':
        if (m.to === this.id) this.accused(p);
        else {
          const tgt = this.peers.get(m.to);
          this.feed(`☝ ${p.name} accusa ${tgt ? tgt.name : 'qualcuno'}!`);
        }
        break;
      case 'rev': this.onReveal(p, m); break;
    }
  }

  onEvent(p, m) {
    const r = this.model(p);
    const d = this.distTo(r.pos);
    switch (m.k) {
      case 'coo':
        if (d < 40) {
          if (m.robo) this.roboCoo(d); else this.g.audio?.play?.('coo');
          r.say(m.robo ? 'Tzzuu-tzzuu!' : 'Tuuu-tuuu!', 2500);
          if (m.robo && d < 25 && this.dossier.add(p.id, p.name, 'robo')) this.feed(`📢 Il tubare di ${p.name} suona… metallico?`);
        }
        break;
      case 'peck':
        r.peck();
        if (d < 15) this.dossier.add(p.id, p.name, 'peck', '', 30);
        break;
      case 'emo': {
        const text = EMOTES[m.i | 0] || EMOTES[0];
        r.say(text);
        if (d < 40) this.g.hud?.subtitle?.(p.name, text, d > 20, 3000);
        break;
      }
      case 'steal': {
        const pos = new THREE.Vector3(+m.x, +m.y + 0.2, +m.z);
        const me = this.g.pigeon.pos.clone(); me.y += 0.25;
        if (me.distanceTo(pos) < 25 && this.los(me, pos)) {
          this.spark(pos);
          if (this.dossier.add(p.id, p.name, 'steal', '', 3)) { this.toast(`🔋 Hai visto ${p.name} rubare una batteria!`, 'good'); this.g.audio?.play?.('steal'); }
        }
        break;
      }
      case 'push':
        if (m.to === this.id) {
          const pg = this.g.pigeon;
          if (typeof pg.knock === 'function') pg.knock(+m.dx || 0, +m.dz || 0, 4);
          if (!this.role.isSpy) pg.battery = 100;
          this.toast(`💢 ${p.name} ti ha dato una spinta!`);
          this.g.audio?.play?.('flap');
        }
        break;
    }
  }

  sawGlow(p) {
    const r = p.r;
    if (!r || r.glowT > 0) return;
    const d = this.distTo(r.pos);
    if (d > 8) return;
    r.glow(1.5);
    if (this.dossier.add(p.id, p.name, 'glow', '', 10)) this.feed(`👁️ L'occhio di ${p.name} ha lampeggiato di rosso!`);
  }

  // ------------------------------------------------------------------ accuse
  accuse(tg) {
    if (!tg) return this.toast('Nessun piccione davanti a te (avvicinati entro 10 m e guardalo).', 'bad');
    if (this.accuseCooldown > 0) return this.toast(`Sei confuso: puoi accusare di nuovo tra ${Math.ceil(this.accuseCooldown)} s`, 'bad');
    if (tg.dist > ACCUSE_RANGE) return this.toast(`${tg.name} è troppo lontano per accusarlo (${Math.round(tg.dist)} m)`, 'bad');
    if (tg.bot) {
      this.addScore(-40);
      this.accuseCooldown = WRONG_COOLDOWN;
      tg.r.say('Tuu?! Son solo un piccione!');
      this.toast(`❌ ${tg.name} era un piccione comune! −40 punti`, 'bad');
      this.g.audio?.play?.('alarm');
      return;
    }
    const p = this.peers.get(tg.id);
    if (!p || p.verdict) return this.toast(`${tg.name} è già stato verificato.`, 'bad');
    this.t.send({ t: 'acc', to: p.id });
    this.pendingAcc.set(p.id, performance.now());
    this.accuseCooldown = 5;
    this.toast(`☝ Accusi ${p.name} di essere una spia…`);
    setTimeout(() => {
      if (this.pendingAcc.has(p.id)) { this.pendingAcc.delete(p.id); this.toast(`${p.name} non ha risposto all'accusa.`, 'bad'); }
    }, 7000);
  }

  accused(by) {
    const rev = this.role.reveal();
    this.t.send({ t: 'rev', by: by.id, r: rev });
    if (this.role.isSpy) {
      this.toast(`🎩 ${by.name} ti ha smascherato! Tra ${UNMASK_TIME} s torni al nido con una nuova identità.`, 'bad');
      this.g.audio?.play?.('alarm');
      this.unmaskedUntil = performance.now() + UNMASK_TIME * 1000;
      setTimeout(async () => {
        this.unmaskedUntil = 0;
        const n = this.g.nest;
        if (n) this.g.pigeon.place(n.x, n.z);
        await this.newRole();
      }, UNMASK_TIME * 1000);
    } else {
      this.addScore(10);
      this.toast(`😤 ${by.name} ti ha accusato ingiustamente: +10 punti`, 'good');
    }
  }

  async onReveal(p, m) {
    const ok = await verifyReveal(p.commit, m.r);
    const role = m.r?.role;
    const byMe = m.by === this.id;
    const by = byMe ? 'te' : this.peers.get(m.by)?.name || 'qualcuno';
    if (byMe) this.pendingAcc.delete(p.id);
    if (!ok) {
      p.cheater = true;
      this.refreshLabel(p);
      this.feed(`🚫 ${p.name} ha mentito sul suo ruolo (hash non valido)!`);
      if (byMe) { this.addScore(100); this.toast(`🚫 ${p.name} bara! Conta come spia: +100`, 'good'); }
      return;
    }
    if (role === SPY) {
      p.verdict = 'spy';
      p.r?.unmask(UNMASK_TIME);
      this.dossier.add(p.id, p.name, 'spy', '', 0);
      this.dossier.file(p.id).verdict = 'spy';
      this.feed(byMe ? `🎩 Hai smascherato ${p.name}: era una SPIA!` : `🎩 ${by} ha smascherato ${p.name}: era una SPIA!`);
      if (byMe) { this.addScore(100); this.toast(`🎉 Giusto! ${p.name} era una spia degli Illuminati: +100`, 'good'); this.g.audio?.play?.('success'); }
    } else {
      p.verdict = 'real';
      this.dossier.add(p.id, p.name, 'clean', '', 0);
      this.dossier.file(p.id).verdict = 'real';
      this.feed(`✅ ${p.name} era un piccione vero (accusato da ${by}).`);
      if (byMe) { this.addScore(-40); this.accuseCooldown = WRONG_COOLDOWN; this.toast(`❌ ${p.name} era un piccione vero! −40 punti`, 'bad'); this.g.audio?.play?.('alarm'); }
    }
    this.refreshLabel(p);
  }

  // ------------------------------------------------------------------ scansione
  finishScan(tg) {
    this.scanCooldown = SCAN_COOLDOWN;
    this.g.audio?.play?.('shutter');
    if (tg.bot) {
      // i piccioni comuni danno letture da piccione vero
      const near = tg.dist < 4;
      this.scanResult({ id: tg.id, name: tg.name }, Math.round(near ? 5 + Math.random() * 35 : 5 + Math.random() * 55));
      return;
    }
    const n = Math.random().toString(36).slice(2, 9);
    this.pendingScan.set(n, { id: tg.id });
    this.t.send({ t: 'scan', to: tg.id, n, d: r2(tg.dist) }, tg.id);
    setTimeout(() => { if (this.pendingScan.delete(n)) this.toast(`📡 Nessuna risposta dalla scansione di ${tg.name}`, 'bad'); }, 5000);
  }

  scanResult(p, v) {
    this.dossier.scan(p.id, p.name, v);
    const s = this.dossier.suspicion(p.id);
    this.toast(`📡 Scansione di ${p.name}: segnale elettronico ${v}% · sospetto ${s}%`, v > 60 ? 'bad' : 'good');
  }

  // ------------------------------------------------------------------ bersaglio
  candidates() {
    const out = [];
    for (const p of this.peers.values()) if (p.r && p.alive) out.push({ id: p.id, name: p.name, r: p.r, bot: false });
    for (const b of this.flock?.bots || []) out.push({ id: b.r.id, name: b.r.name, r: b.r, bot: true });
    return out;
  }

  pickTarget() {
    const cam = this.g.camera;
    const cp = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const photo = !!this.g.photoMode;
    const zoom = this.g.cam?.zoom || 1;
    const maxD = photo ? 35 * zoom : 12, maxA = photo ? 0.14 / zoom : 0.32;
    let best = null, bestA = maxA;
    const v = new THREE.Vector3();
    for (const c of this.candidates()) {
      v.copy(c.r.pos); v.y += 0.15;
      const dist = this.distTo(c.r.pos);
      if (dist > maxD) continue;
      v.sub(cp);
      const a = v.angleTo(fwd);
      const tol = bestA + Math.min(0.25, 0.4 / Math.max(1, v.length())); // più tolleranza da vicino
      if (a < tol) {
        const end = c.r.pos.clone(); end.y += 0.15;
        if (!this.los(cp, end)) continue;
        best = { ...c, dist };
        bestA = a;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ aggiornamento per frame
  update(dt) {
    const g = this.g;
    if (!this.t || !this.role.commit) { this.flock?.update(dt, g.camera.position); return; }
    const inp = g.input, pg = g.pigeon;
    const active = !g.modal && !g.paused;
    const spy = this.role.isSpy;
    if (!spy) pg.battery = 100;
    this.accuseCooldown = Math.max(0, this.accuseCooldown - dt);
    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
    const now = performance.now();

    // bersaglio al centro della visuale
    const tg = this.pickTarget();
    if ((tg?.id || null) !== (this.target?.id || null)) {
      const old = this.target;
      this.target = tg;
      if (old && !old.bot) this.refreshLabel(this.peers.get(old.id) || {});
      if (old?.bot) old.r.setName(old.name);
      if (tg?.bot) tg.r.setName(tg.name, '#ffd34d');
      else if (tg) this.refreshLabel(this.peers.get(tg.id) || {});
    } else if (tg) this.target.dist = tg.dist;

    if (active) {
      if (inp.hit('KeyV')) {
        const robo = spy && Math.random() < 0.5;
        this.t.send({ t: 'e', k: 'coo', robo });
      }
      for (let i = 0; i < 4; i++) if (inp.hit('Digit' + (i + 1), 'Numpad' + (i + 1))) this.emote(i);
      if (inp.hit('KeyX')) this.accuse(this.target);
      if (inp.hit('KeyG')) this.push(this.target);
      if (inp.hit('KeyJ')) this.toggleDossier();
      // scansione: tieni premuto R (o il pulsante) sul bersaglio
      const holding = inp.down('KeyR') || this.scanBtn;
      if (holding && this.target && this.scanCooldown <= 0) {
        if (this.scanTarget !== this.target.id) { this.scanTarget = this.target.id; this.scanProg = 0; }
        this.scanProg += dt;
        if (this.scanProg >= SCAN_TIME) { this.finishScan(this.target); this.scanProg = 0; this.scanTarget = null; this.scanBtn = false; }
      } else {
        if (holding && this.scanCooldown > 0 && inp.hit('KeyR')) this.toast(`📡 Scanner in ricarica: ${Math.ceil(this.scanCooldown)} s`, 'bad');
        this.scanProg = Math.max(0, this.scanProg - dt * 2);
        if (this.scanProg === 0) this.scanTarget = null;
      }
    }
    this.el.board.classList.toggle('hidden', !(active && inp.down('Tab')) && !this.boardOpen);

    // occhio bionico che si tradisce di notte
    if (spy && (g.dayNight?.night || 0) > 0.5 && now > this.glowUntil + 4000 && Math.random() < dt / 12) this.glowUntil = now + 1500;

    // punteggi della spia
    if (spy && now > this.unmaskedUntil) {
      this.spyMinute += dt;
      if (this.spyMinute >= 60) { this.spyMinute = 0; this.addScore(5); this.toast('🤖 Un altro minuto sotto copertura: +5', 'good'); }
      const done = g.missions?.state?.done?.length || 0;
      if (done > this.missionsDone) { this.addScore(50 * (done - this.missionsDone)); this.toast('🤖 Missione per gli Illuminati: +50', 'good'); }
      this.missionsDone = done;
    } else this.missionsDone = g.missions?.state?.done?.length || 0;

    // invio dello stato a 10 Hz
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      const p = pg.pos, v = pg.vel;
      const flags = (now < this.glowUntil ? 1 : 0);
      this.t.send({ t: 's', s: [r2(p.x), r2(p.y), r2(p.z), r2(pg.heading), pg.mode === 'air' ? 1 : 0, r2(v.x), r2(v.y), r2(v.z), flags] });
    }
    this.scoreT -= dt;
    if (this.scoreT <= 0) { this.scoreT = 3; this.t.send({ t: 'sc', score: this.score }); }

    // modelli remoti
    const cp = g.camera.position;
    for (const p of this.peers.values()) {
      if (!p.r) continue;
      if (now - p.r.lastSeen > 6000) { p.r.model.visible = false; p.alive = false; continue; }
      p.r.model.visible = true;
      p.alive = true;
      p.r.update(dt, cp);
    }
    this.flock.update(dt, cp);
    this.updateSparks(dt);
    this.updateUI(dt);
  }

  emote(i) {
    this.t.send({ t: 'e', k: 'emo', i });
    this.g.hud?.subtitle?.(this.name + ' (tu)', EMOTES[i], false, 2500);
  }

  push(tg) {
    if (!tg || tg.dist > PUSH_RANGE) return this.toast('Avvicinati di più a un piccione per spingerlo.', 'bad');
    const pp = this.g.pigeon.pos;
    const dx = tg.r.pos.x - pp.x, dz = tg.r.pos.z - pp.z, l = Math.hypot(dx, dz) || 1;
    tg.r.peck();
    if (tg.bot) { tg.r.say('Tuu?! Ma va\' là!', 2500); return; }
    this.t.send({ t: 'e', k: 'push', to: tg.id, dx: r2(dx / l), dz: r2(dz / l) });
  }

  // chiamati dai wrapper di boot.js
  onPeck() {
    this.t?.send({ t: 'e', k: 'peck' });
    this.g.hud?.toast?.('🌾 Becchi qualche briciola. Gnam!');
  }
  onSteal(pos) { this.t?.send({ t: 'e', k: 'steal', x: r2(pos.x), y: r2(pos.y), z: r2(pos.z) }); }

  addScore(n) {
    this.score += n;
    this.t?.send({ t: 'sc', score: this.score });
  }

  distTo(pos) { return this.g.pigeon.pos.distanceTo(pos); }
  los(a, b) { try { return this.g.world.lineOfSight ? this.g.world.lineOfSight(a, b) : true; } catch { return true; } }

  // ------------------------------------------------------------------ effetti
  spark(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5dff7a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    this.g.scene.add(m);
    this.sparks.push({ m, t: 0 });
  }
  updateSparks(dt) {
    this.sparks = this.sparks.filter((s) => {
      s.t += dt;
      s.m.scale.setScalar(1 + s.t * 6);
      s.m.material.opacity = Math.max(0, 0.9 - s.t * 0.9);
      if (s.t > 1) { this.g.scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); return false; }
      return true;
    });
  }

  roboCoo(d) {
    const a = this.g.audio;
    if (!a?.ok || !a.ctx) return;
    const c = a.ctx, t = c.currentTime, vol = Math.max(0.05, 0.22 * (1 - d / 40));
    for (let k = 0; k < 3; k++) {
      const o = c.createOscillator();
      o.type = 'square';
      const st = t + k * 0.3;
      o.frequency.setValueAtTime(320, st);
      o.frequency.setValueAtTime(410, st + 0.08);
      o.frequency.setValueAtTime(290, st + 0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(vol, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.26);
      o.connect(g).connect(a.master || c.destination);
      o.start(st); o.stop(st + 0.3);
    }
  }

  // ------------------------------------------------------------------ interfaccia
  buildUI() {
    const hud = document.getElementById('hud') || document.body;
    const panel = document.createElement('div');
    panel.id = 'mpPanel';
    panel.innerHTML = `
      <div class="mp-role" id="mpRole">🔒 Assegnazione del ruolo segreto…</div>
      <div class="mp-status" id="mpStatus"></div>
      <div class="mp-score">Punti: <b id="mpScore">0</b></div>
      <div class="mp-target" id="mpTarget"></div>
      <div class="mp-scanbar"><div id="mpScanFill"></div></div>
      <div class="mp-buttons">
        <button data-mp="scan" title="Scansiona (tieni premuto R)">📡</button>
        <button data-mp="accuse" title="Accusa (X)">☝</button>
        <button data-mp="push" title="Spingi (G)">💢</button>
        <button data-mp="emote" title="Tuuu! (1-4)">💬</button>
        <button data-mp="dossier" title="Dossier (J)">📋</button>
        <button data-mp="board" title="Classifica (Tab)">🏆</button>
      </div>
      <div class="mp-feed" id="mpFeed"></div>`;
    hud.appendChild(panel);
    const dossier = document.createElement('div');
    dossier.id = 'mpDossier';
    dossier.className = 'hidden';
    hud.appendChild(dossier);
    const board = document.createElement('div');
    board.id = 'mpBoard';
    board.className = 'hidden';
    hud.appendChild(board);
    const wrap = document.getElementById('minimapWrap');
    let mini = null;
    if (wrap) {
      mini = document.createElement('canvas');
      mini.id = 'mpMini';
      mini.width = 200; mini.height = 200;
      wrap.appendChild(mini);
    }
    this.el = {
      role: panel.querySelector('#mpRole'), status: panel.querySelector('#mpStatus'), score: panel.querySelector('#mpScore'),
      target: panel.querySelector('#mpTarget'), scan: panel.querySelector('#mpScanFill'), feed: panel.querySelector('#mpFeed'),
      dossier, board, mini,
    };
    let emoteI = 0;
    for (const b of panel.querySelectorAll('button[data-mp]')) {
      const k = b.dataset.mp;
      const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
      if (k === 'scan') {
        b.addEventListener('pointerdown', (e) => { stop(e); this.scanBtn = true; });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { this.scanBtn = false; });
        continue;
      }
      b.addEventListener('pointerdown', stop);
      b.addEventListener('click', (e) => {
        stop(e);
        if (k === 'accuse') this.accuse(this.target);
        else if (k === 'push') this.push(this.target);
        else if (k === 'emote') { this.emote(emoteI); emoteI = (emoteI + 1) % EMOTES.length; }
        else if (k === 'dossier') this.toggleDossier();
        else if (k === 'board') { this.boardOpen = !this.boardOpen; }
      });
    }
    dossier.addEventListener('click', () => this.toggleDossier(false));
    this.uiT = 0;
  }

  statusText() {
    const relay = this.net === 'local' ? '' : this.t?.turn ? ' · 🔁 TURN' : ' · solo P2P diretto';
    return `Stanza «${this.room}» · ${this.peers.size + 1} giocatori${relay}`;
  }

  status(t) { if (this.el) this.el.status.textContent = t; }
  toast(t, kind) { this.g.hud?.toast?.(t, kind); }
  feed(t) {
    this.log.unshift(t);
    this.log.length = Math.min(this.log.length, 4);
    if (this.el) this.el.feed.innerHTML = this.log.map((l) => `<div>${esc(l)}</div>`).join('');
    this.toast(t);
  }

  toggleDossier(force) {
    const el = this.el.dossier;
    const open = force ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !open);
    if (open) this.renderDossier();
  }

  renderDossier() {
    const rows = [];
    for (const f of this.dossier.files.values()) rows.push({ f, s: this.dossier.suspicion(f.id) });
    rows.sort((a, b) => b.s - a.s);
    this.el.dossier.innerHTML = `<h3>📋 Dossier degli indizi</h3>` + (rows.length ? rows.map(({ f, s }) => `
      <div class="mp-file">
        <div class="mp-file-h"><b>${esc(f.name)}</b><span>${s}%</span></div>
        <div class="mp-bar"><div style="width:${s}%;background:${s > 65 ? '#e2513b' : s > 40 ? '#e9b04b' : '#6cc56c'}"></div></div>
        <div class="mp-clues">${f.clues.slice(-8).map((c) => `<span title="${esc(CLUE[c.kind]?.text || '')}">${CLUE[c.kind]?.icon || '•'}${c.extra ? ' ' + esc(c.extra) : ''}</span>`).join(' ')}</div>
      </div>`).join('') : '<p>Nessun indizio ancora. Osserva gli altri piccioni: chi ruba batterie? Chi ha l\'occhio rosso di notte? Scansiona con R.</p>') + '<p class="mp-hint">Clic per chiudere · J</p>';
  }

  renderBoard() {
    const list = [{ name: this.name + ' (tu)', score: this.score, me: true, badge: this.role.isSpy ? '🤖' : '🐦' }];
    for (const p of this.peers.values()) if (p.alive && p.name !== '…') list.push({ name: p.name, score: p.score, badge: p.cheater ? '🚫' : p.verdict === 'spy' ? '🎩' : p.verdict === 'real' ? '✅' : '❔' });
    list.sort((a, b) => b.score - a.score);
    this.el.board.innerHTML = `<h3>🏆 Stanza «${esc(this.room)}»</h3><table>${list.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}.</td><td>${r.badge} ${esc(r.name)}</td><td>${r.score}</td></tr>`).join('')}</table><p class="mp-hint">❔ ruolo ignoto · 🎩 spia smascherata · ✅ piccione vero</p>`;
  }

  updateUI(dt) {
    this.uiT -= dt;
    const tg = this.target;
    this.el.scan.style.width = Math.min(100, (this.scanProg / SCAN_TIME) * 100) + '%';
    if (this.uiT > 0) return;
    this.uiT = 0.15;
    this.el.score.textContent = this.score;
    if (tg) {
      const s = this.dossier.suspicion(tg.id);
      this.el.target.innerHTML = `🎯 <b>${esc(tg.name)}</b> · ${Math.round(tg.dist)} m${s != null ? ` · sospetto ${s}%` : ''}<br><small>X accusa · R scansiona${this.scanCooldown > 0 ? ` (${Math.ceil(this.scanCooldown)} s)` : ''} · G spingi</small>`;
    } else this.el.target.innerHTML = '<small>Guarda un piccione da vicino per osservarlo</small>';
    if (this.accuseCooldown > 5) this.el.target.innerHTML += `<br><small class="bad">Confuso: niente accuse per ${Math.ceil(this.accuseCooldown)} s</small>`;
    if (!this.el.board.classList.contains('hidden')) this.renderBoard();
    if (!this.el.dossier.classList.contains('hidden')) this.renderDossier();
    this.drawMini();
  }

  drawMini() {
    const cv = this.el.mini, g = this.g;
    if (!cv || !g.world?.terrain) return;
    const c = cv.getContext('2d'), W = cv.width, R = W / 2;
    const p = g.pigeon.pos;
    const alt = Math.max(0, p.y - g.world.terrain.heightAt(p.x, p.z));
    const range = 160 + Math.min(500, alt * 1.5);
    const yaw = g.cam?.yaw || 0;
    const cs = Math.cos(Math.PI + yaw), sn = Math.sin(Math.PI + yaw);
    c.clearRect(0, 0, W, W);
    for (const cd of this.candidates()) {
      if (!cd.r.model.visible) continue;
      const dx = (cd.r.pos.x - p.x) * (R / range), dz = (cd.r.pos.z - p.z) * (R / range);
      const x = R + dx * cs - dz * sn, y = R + dx * sn + dz * cs;
      if (Math.hypot(x - R, y - R) > R - 4) continue;
      const pr = cd.bot ? null : this.peers.get(cd.id);
      c.fillStyle = pr?.verdict === 'spy' ? '#ff5050' : '#9fd3ff';
      c.strokeStyle = '#10141c';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
}

export { SPY, REAL };
