// Test del multiplayer con Playwright: due giocatori nello stesso browser (trasporto BroadcastChannel).
// Verifica presenza reciproca, sincronizzazione della posizione, ruoli commit-reveal, indizi, scansioni e accuse.
// Uso: node tests/mp.mjs [--shots]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'playwright')); }
const { chromium } = playwright;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(ROOT, 'tests/shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const data = fs.readFileSync(f);
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': data.length });
  res.end(data);
}).listen(0);
const PORT = server.address().port;

let failures = 0;
function check(name, ok, info = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const errors = [];
async function open(name, role) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/index.html?q=low&net=local&room=test&autostart=new&name=${name}&role=${role}`);
  return page;
}
const A = await open('Alfa', 'spia');
const B = await open('Beta', 'vero');
const ready = (p) => p.waitForFunction(() => window.__mp?.role?.commit && document.getElementById('mpPanel'), null, { timeout: 180000 });
await Promise.all([ready(A), ready(B)]);
check('modulo multiplayer avviato su entrambe le pagine', true);

const closeBriefings = (p) => p.evaluate(() => { const h = window.__game.hud; while (h.briefingOpen) h.closeBriefing(); });
await Promise.all([closeBriefings(A), closeBriefings(B)]);
check('ruoli', (await A.evaluate(() => __mp.role.role)) === 'spia' && (await B.evaluate(() => __mp.role.role)) === 'vero');
check('pannello missione nascosto al piccione vero', await B.evaluate(() => getComputedStyle(document.getElementById('mission')).display === 'none'));

const idA = await A.evaluate(() => __mp.id), idB = await B.evaluate(() => __mp.id);
await B.waitForFunction((id) => window.__mp.peers.get(id)?.r && window.__mp.peers.get(id).name === 'Alfa', idA, { timeout: 15000 }).catch(() => {});
check('B vede il piccione di A', await B.evaluate((id) => !!window.__mp.peers.get(id)?.r, idA));
check('A vede il piccione di B', await A.evaluate((id) => !!window.__mp.peers.get(id)?.r, idB));
check('piccioni-bot presenti', (await B.evaluate(() => __mp.flock.bots.length)) >= 15);

// posizione: sposta A vicino al nido e controlla cosa vede B
await A.evaluate(() => { const g = __game; g.pigeon.place(g.nest.x + 3, g.nest.z + 1); });
await B.evaluate(() => { const g = __game; g.pigeon.place(g.nest.x, g.nest.z); });
await sleep(2500);
const posA = await A.evaluate(() => __game.pigeon.pos.toArray());
const seen = await B.evaluate((id) => window.__mp.peers.get(id).r.pos.toArray(), idA);
const err = Math.hypot(posA[0] - seen[0], posA[1] - seen[1], posA[2] - seen[2]);
check('posizione di A sincronizzata su B', err < 2, `errore ${err.toFixed(2)} m`);

// indizio: A ruba una batteria davanti a B
await A.evaluate(() => __mp.onSteal(__game.pigeon.pos));
await sleep(600);
check('B registra il furto di A come indizio', await B.evaluate((id) => !!window.__mp.dossier.files.get(id)?.clues.some((c) => c.kind === 'steal'), idA));
// il piccione vero non può rubare batterie
check('il piccione vero non ruba', (await B.evaluate(() => __game.trySteal())) === false);

// scansione
await B.evaluate((id) => { const m = __mp; const p = m.peers.get(id); m.finishScan({ id, name: p.name, r: p.r, bot: false, dist: 3 }); }, idA);
await sleep(800);
const scan = await B.evaluate((id) => window.__mp.dossier.files.get(id)?.scans[0], idA);
check('scansione di una spia da vicino ≥ 70%', scan >= 70, `lettura ${scan}%`);

// accusa sbagliata: A (spia) accusa B (vero)
await A.evaluate((id) => { const m = __mp; const p = m.peers.get(id); m.accuse({ id, name: p.name, r: p.r, bot: false, dist: 3 }); }, idB);
await sleep(1200);
check('accusa sbagliata: A −40', (await A.evaluate(() => __mp.score)) === -40);
check('accusa sbagliata: B +10', (await B.evaluate(() => __mp.score)) === 10);
check('A vede B come piccione vero verificato', (await A.evaluate((id) => window.__mp.peers.get(id).verdict, idB)) === 'real');

// accusa giusta: B accusa A
await B.evaluate((id) => { const m = __mp; const p = m.peers.get(id); m.accuse({ id, name: p.name, r: p.r, bot: false, dist: 3 }); }, idA);
await sleep(1200);
check('accusa giusta: B +100', (await B.evaluate(() => __mp.score)) === 110);
check('A smascherata (cappello visibile su B)', await B.evaluate((id) => { const p = window.__mp.peers.get(id); return p.verdict === 'spy' && performance.now() < p.r.unmaskedUntil; }, idA));
check('A sa di essere smascherata', await A.evaluate(() => __mp.unmaskedUntil > performance.now()));

// accusa a un bot: sempre sbagliata
await B.evaluate(() => { const m = __mp; m.accuseCooldown = 0; const b = m.flock.bots[0].r; m.accuse({ id: b.id, name: b.name, r: b, bot: true, dist: 3 }); });
check('accusa a un piccione-bot: −40', (await B.evaluate(() => __mp.score)) === 70);

// commit-reveal: un reveal falso viene rifiutato
check('reveal falso rifiutato', await B.evaluate(async () => {
  const { verifyReveal } = await import('./js/net/roles.js');
  const p = [...__mp.peers.values()][0];
  return !(await verifyReveal(p.commit, { role: 'vero', salt: 'x', round: 1 }));
}));

if (process.argv.includes('--shots')) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await B.evaluate(() => { const g = __game; g.cam.yaw = Math.atan2(g.nest.x + 3 - g.pigeon.pos.x, g.nest.z + 1 - g.pigeon.pos.z); });
  await sleep(800);
  await B.screenshot({ path: path.join(SHOTS, 'mp-B.png') });
  await B.evaluate(() => __mp.toggleDossier(true));
  await sleep(300);
  await B.screenshot({ path: path.join(SHOTS, 'mp-dossier.png') });
  await A.bringToFront();
  await A.screenshot({ path: path.join(SHOTS, 'mp-A.png') });
}

check('nessun errore in console', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
process.exit(failures ? 1 : 0);
