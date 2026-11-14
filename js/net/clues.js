// Dossier dell'investigatore: indizi raccolti su ogni piccione e livello di sospetto stimato.
export const CLUE = {
  steal: { icon: '🔋', text: 'visto rubare una batteria', w: 40 },
  glow: { icon: '👁️', text: 'occhio rosso lampeggiante nel buio', w: 25 },
  robo: { icon: '📢', text: 'tubare metallico, da robot', w: 20 },
  scan: { icon: '📡', text: 'scansione elettronica', w: 0 },
  peck: { icon: '🌾', text: 'becca le briciole come un piccione vero', w: -6 },
  clean: { icon: '✅', text: 'dichiarato piccione vero (verificato)', w: 0 },
  spy: { icon: '🎩', text: 'SMASCHERATO: spia degli Illuminati', w: 0 },
};

export class Dossier {
  constructor() { this.files = new Map(); }

  file(id, name) {
    let f = this.files.get(id);
    if (!f) { f = { id, name, clues: [], scans: [], last: {}, verdict: null }; this.files.set(id, f); }
    if (name) f.name = name;
    return f;
  }

  // aggiunge un indizio; "every" evita di registrare lo stesso tipo troppo spesso (s)
  add(id, name, kind, extra = '', every = 8) {
    const f = this.file(id, name);
    const now = performance.now() / 1000;
    if (f.last[kind] && now - f.last[kind] < every) return false;
    f.last[kind] = now;
    f.clues.push({ kind, extra, t: now });
    if (f.clues.length > 30) f.clues.shift();
    return true;
  }

  scan(id, name, v) {
    const f = this.file(id, name);
    f.scans.push(v);
    if (f.scans.length > 6) f.scans.shift();
    this.add(id, name, 'scan', v + '%', 0);
  }

  // nuovo ruolo (dopo uno smascheramento): gli indizi vecchi non valgono più
  reset(id) {
    const f = this.files.get(id);
    if (f) { f.clues = []; f.scans = []; f.last = {}; f.verdict = null; }
  }

  suspicion(id) {
    const f = this.files.get(id);
    if (!f) return null;
    if (f.verdict === 'spy') return 100;
    if (f.verdict === 'real') return 0;
    let s = 15;
    const count = {};
    for (const c of f.clues) {
      count[c.kind] = (count[c.kind] || 0) + 1;
      if (count[c.kind] <= 3) s += CLUE[c.kind]?.w || 0;
    }
    if (f.scans.length) {
      const avg = f.scans.reduce((a, b) => a + b, 0) / f.scans.length;
      s += (avg - 40) * Math.min(1.2, 0.5 + f.scans.length * 0.25);
    }
    return Math.max(0, Math.min(99, Math.round(s)));
  }
}
