// Ruoli segreti con commit-reveal: ogni client sceglie il proprio ruolo, pubblica solo
// SHA-256(ruolo|sale) e, se accusato, rivela ruolo e sale. Gli altri ricalcolano l'hash:
// chi mente sul proprio ruolo viene scoperto.

export const SPY = 'spia', REAL = 'vero';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Probabilità di essere spia in base a quanti giocatori ci sono (circa 1 su 4,
// ma nelle stanze piccole almeno una spia attesa).
export function spyChance(players) {
  if (players <= 1) return 1;
  return 1 / Math.min(4, players);
}

export class Role {
  constructor() { this.role = null; this.salt = null; this.commit = null; this.round = 0; }

  async roll(players, forced) {
    this.role = forced || (Math.random() < spyChance(players) ? SPY : REAL);
    this.salt = randomSalt();
    this.round++;
    this.commit = await sha256(`${this.role}|${this.salt}|${this.round}`);
    return this.role;
  }

  get isSpy() { return this.role === SPY; }

  reveal() { return { role: this.role, salt: this.salt, round: this.round, commit: this.commit }; }
}

export async function verifyReveal(commit, r) {
  if (!commit || !r || (r.role !== SPY && r.role !== REAL)) return false;
  return (await sha256(`${r.role}|${r.salt}|${r.round}`)) === commit;
}
