// HUD: batteria, sospetto, orologio, posizione, missione, sottotitoli, notifiche, briefing.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game;
    this.subs = [];
    this.el = {
      battFill: $('batteryFill'), battText: $('batteryText'), coverFill: $('coverFill'), coverText: $('coverText'),
      clock: $('clock'), location: $('location'), altitude: $('altitude'), mTitle: $('missionTitle'), mStep: $('missionStep'),
      mProg: $('missionProgress'), prompt: $('prompt'), subtitles: $('subtitles'), toasts: $('toasts'), flash: $('flash'),
      photo: $('photoOverlay'), photoTarget: $('photoTarget'),
    };
    this.briefQueue = [];
    $('briefOk').addEventListener('click', () => this.closeBriefing());
    this.t = 0;
  }

  show() { $('hud').classList.remove('hidden'); }

  update(dt) {
    this.t -= dt;
    // sottotitoli: scadenza
    const now = performance.now();
    this.subs = this.subs.filter((s) => {
      if (s.until < now) { s.el.remove(); return false; }
      return true;
    });
    if (this.t > 0) return;
    this.t = 0.1;
    const g = this.g, p = g.pigeon;
    const b = p.battery;
    this.el.battFill.style.width = b.toFixed(1) + '%';
    this.el.battFill.style.background = b > 50 ? '#6cc56c' : b > 20 ? '#e9b04b' : '#e2513b';
    this.el.battText.textContent = Math.ceil(b) + '%';
    this.el.coverFill.style.width = g.suspicion.toFixed(0) + '%';
    this.el.coverText.textContent = Math.round(g.suspicion) + '%';
    this.el.clock.textContent = `🕐 ${g.dayNight.clock()} · Giorno ${g.dayNight.day}` + (g.timeMult > 1 ? ' ⏩' : '');
    const street = g.npc.streetNear(p.pos.x, p.pos.z);
    const vill = g.npc.villageName(p.pos.x, p.pos.z);
    this.el.location.textContent = (street ? street + ', ' : '') + vill;
    const ground = g.world.terrain.heightAt(p.pos.x, p.pos.z);
    const alt = p.pos.y - ground;
    this.el.altitude.textContent = `Quota ${Math.round(p.pos.y)} m s.l.m. · ${alt < 0.5 ? (p.onBuilding ? 'sul tetto' : 'a terra') : Math.round(alt) + ' m da terra'}` + (p.mode === 'air' ? ` · ${Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6)} km/h` : '');
    g.minimap.street = street;
  }

  mission(m, step) {
    this.el.mTitle.textContent = m ? m.title : '';
    this.el.mStep.textContent = step ? step.text : '';
  }
  missionProgress(t) { this.el.mProg.textContent = t; }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.textContent = text;
    this.el.prompt.classList.remove('hidden');
  }

  subtitle(name, text, far, dur = 4000) {
    const el = document.createElement('div');
    el.className = 'sub' + (far ? ' far' : '');
    const b = document.createElement('b');
    b.textContent = name + ': ';
    el.append(b, document.createTextNode(text));
    this.el.subtitles.append(el);
    this.subs.push({ el, until: performance.now() + dur });
    while (this.subs.length > 4) this.subs.shift().el.remove();
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this.el.toasts.append(el);
    setTimeout(() => el.remove(), 3500);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  flash() {
    this.el.flash.style.transition = 'none';
    this.el.flash.style.opacity = '0.9';
    requestAnimationFrame(() => { this.el.flash.style.transition = 'opacity .45s'; this.el.flash.style.opacity = '0'; });
  }

  photoMode(on, label) {
    this.el.photo.classList.toggle('hidden', !on);
    this.el.photoTarget.textContent = label ? 'Bersaglio: ' + label : '';
  }

  briefing(title, text) {
    this.briefQueue.push([title, text]);
    if (this.briefQueue.length === 1) this.openBriefing();
  }
  openBriefing() {
    const [title, text] = this.briefQueue[0];
    $('briefTitle').textContent = title;
    $('briefText').textContent = text;
    $('briefing').classList.remove('hidden');
    this.g.setModal(true);
  }
  closeBriefing() {
    this.briefQueue.shift();
    $('briefing').classList.add('hidden');
    if (this.briefQueue.length) this.openBriefing();
    else this.g.setModal(false);
  }
  get briefingOpen() { return this.briefQueue.length > 0; }
}
