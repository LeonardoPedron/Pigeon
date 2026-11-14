// Test end-to-end con Playwright: carica il gioco, gioca l'intera campagna tramite gli hook di debug,
// verifica mappa, salvataggio, comandi touch. Uso: node tests/e2e.mjs [--shots]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'playwright')); }
const { chromium, devices } = playwright;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(ROOT, 'tests/shots');
fs.mkdirSync(SHOTS, { recursive: true });
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
const URL0 = `http://localhost:${PORT}/index.html`;

const results = [];
let failures = 0;
function check(name, ok, info = '') {
  results.push({ name, ok, info });
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function openGame(ctx, query) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(URL0 + query);
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 300000 });
  return { page, loadMs: Date.now() - t0 };
}
const sim = (page, s) => page.evaluate((s) => window.__game.simulate(s), s);
const closeBrief = (page) => page.evaluate(() => { while (window.__game.hud.briefingOpen) window.__game.hud.closeBriefing(); });
const story = (page) => page.evaluate(() => ({ story: window.__game.missions.state.story, step: window.__game.missions.current?.stepIdx, title: window.__game.missions.current?.title }));
async function waitMission(page, idx, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await story(page);
    if (s.story >= idx && s.title) return s;
    await page.waitForTimeout(200);
  }
  return story(page);
}
// porta il piccione in aria sopra un punto
const tp = (page, x, z, up = 0) => page.evaluate(([x, z, up]) => { const g = window.__game; const s = g.world.surfaceAt(x, z); g.pigeon.place(x, z, s.y + up); }, [x, z, up]);

try {
  // ---------------------------------------------------------------- desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page, loadMs } = await openGame(ctx, '?q=low&autostart=new');
  check('Caricamento del gioco', true, `${(loadMs / 1000).toFixed(1)} s`);
  const stats = await page.evaluate(() => {
    const g = window.__game;
    return { b: g.data.buildings.length, r: g.data.roads.length, a: g.npc.agents.length, p: g.npc.parked.length, cars: g.npc.cars.length, addr: g.data.addresses.length, bat: g.batteries.items.length };
  });
  check('Dati reali caricati (edifici, strade, civici)', stats.b > 5000 && stats.r > 1500 && stats.addr > 2000, JSON.stringify(stats));
  check('Abitanti e auto generati', stats.a > 100 && stats.cars > 15 && stats.p > 300, `${stats.a} abitanti, ${stats.cars} auto in circolazione, ${stats.p} parcheggiate`);
  await page.screenshot({ path: path.join(SHOTS, '01-briefing.png') });
  await closeBrief(page);

  // fisica: decollo, volo, consumo batteria, atterraggio
  const fly = await page.evaluate(() => {
    const g = window.__game, inp = g.input;
    const y0 = g.pigeon.pos.y, b0 = g.pigeon.battery;
    inp.keys.add('Space'); inp.pressed.add('Space');
    g.simulate(3);
    inp.keys.delete('Space');
    inp.keys.add('KeyW');
    g.simulate(6);
    inp.keys.delete('KeyW');
    const y1 = g.pigeon.pos.y, mode1 = g.pigeon.mode, b1 = g.pigeon.battery;
    inp.keys.add('KeyC');
    g.simulate(15);
    inp.keys.delete('KeyC');
    return { y0, y1, mode1, b0, b1, mode2: g.pigeon.mode, flown: g.pigeon.stats.flown };
  });
  check('Decollo e volo', fly.y1 > fly.y0 + 5 && fly.mode1 === 'air', `quota +${(fly.y1 - fly.y0).toFixed(1)} m, volati ${fly.flown.toFixed(0)} m`);
  check('La batteria si scarica volando', fly.b1 < fly.b0, `${fly.b0.toFixed(1)}% → ${fly.b1.toFixed(1)}%`);
  check('Atterraggio', fly.mode2 === 'ground');

  // bisogni sul terreno -> macchia persistente
  const poop = await page.evaluate(() => {
    const g = window.__game;
    const n0 = g.poop.splats.length;
    const p = g.pigeon.pos;
    g.pigeon.place(p.x, p.z, g.world.surfaceAt(p.x, p.z).y + 6);
    g.input.pressed.add('KeyF');
    g.simulate(2);
    return { n0, n1: g.poop.splats.length };
  });
  check('Bisogni: macchia sul punto di impatto', poop.n1 === poop.n0 + 1, `${poop.n0} → ${poop.n1}`);

  // ---------------------------------------------------------------- Missione 1
  const m1 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x, t.z, t.y + 4);
    g.input.keys.add('KeyC');
    g.simulate(4);
    g.input.keys.delete('KeyC');
    const landed = g.pigeon.onBuilding ? g.pigeon.onBuilding.d.k : null;
    const step = g.missions.current.stepIdx;
    return { landed, step };
  });
  check('M1: atterraggio sul campanile', m1.step === 1, `posato su: ${m1.landed}`);
  await page.evaluate(() => { const g = window.__game; g.render(); });
  await page.screenshot({ path: path.join(SHOTS, '02-campanile.png') });
  await page.evaluate(() => { window.__game.input.pressed.add('KeyV'); window.__game.simulate(0.1); });
  let s = await waitMission(page, 1);
  check('M1 completata (tubare)', s.story === 1, s.title);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 2: ascolto
  const m2 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x + 3, t.z + 3);
    g.simulate(1);
    const step1 = g.missions.current.stepIdx;
    let heard = 0;
    for (let i = 0; i < 240 && g.missions.state.story === 1; i++) {
      // resta vicino ai due pensionati
      const a = g.missions.tempAgents?.[0];
      if (a) g.pigeon.place(a.x + 4, a.z + 2);
      g.simulate(1);
      heard = g.npc.convos.length;
    }
    return { step1, story: g.missions.state.story, heard };
  });
  check('M2: arrivo al bar e ascolto della conversazione sulla sagra', m2.story === 2, JSON.stringify(m2));
  await page.screenshot({ path: path.join(SHOTS, '03-ascolto.png') });
  s = await waitMission(page, 2);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 3: furto batterie
  const m3 = await page.evaluate(() => {
    const g = window.__game;
    const before = g.pigeon.battery;
    g.pigeon.battery = 50;
    let stolen = 0;
    for (let k = 0; k < 2; k++) {
      const it = g.batteries.items.filter((i) => !i.taken).sort((a, b) => Math.hypot(a.x - g.pigeon.pos.x, a.z - g.pigeon.pos.z) - Math.hypot(b.x - g.pigeon.pos.x, b.z - g.pigeon.pos.z))[0];
      g.pigeon.place(it.x + 0.3, it.z, it.y);
      g.simulate(0.2);
      g.input.pressed.add('KeyE');
      g.simulate(0.1);
      stolen++;
    }
    return { before, after: g.pigeon.battery, story: g.missions.state.story };
  });
  check('M3: furto di 2 batterie ricarica il piccione', m3.after > 50 && m3.story === 3, `50% → ${m3.after.toFixed(0)}%`);
  s = await waitMission(page, 3);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 4: pedinamento
  const m4 = await page.evaluate(() => {
    const g = window.__game;
    const a = g.missions.tempAgents[0];
    g.simulate(2);
    for (let i = 0; i < 90 && g.missions.state.story === 3; i++) {
      // in volo, 12 m dietro e 8 m sopra al postino
      const bx = a.x - Math.sin(a.yaw) * 12, bz = a.z - Math.cos(a.yaw) * 12;
      g.pigeon.place(bx, bz, Math.max(g.world.surfaceAt(bx, bz).y, a.y) + 8);
      g.simulate(1);
    }
    return { story: g.missions.state.story, walked: a.state };
  });
  check('M4: pedinamento del postino', m4.story === 4, JSON.stringify(m4));
  s = await waitMission(page, 4);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 5: foto auto nera
  const photoAt = (labelHint) => page.evaluate((labelHint) => {
    const g = window.__game;
    const t = g.missions.step.photoTarget();
    // posizione 8 m dal bersaglio, in aria
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = t.x + Math.sin(a) * 8, z = t.z + Math.cos(a) * 8;
      const y = Math.max(g.world.surfaceAt(x, z).y + 1, t.y + 2);
      g.pigeon.place(x, z, y);
      g.input.keys.add('KeyQ'); g.input.pressed.add('KeyQ');
      g.simulate(1 / 30);
      g.input.keys.delete('KeyQ');
      // orienta la camera verso il bersaglio
      const head = g.camera.position;
      g.cam.yaw = Math.atan2(t.x - x, t.z - z);
      g.pigeon.heading = g.cam.yaw;
      g.cam.update(0, g.input, g.pigeon);
      const dx = t.x - head.x, dy = t.y - head.y, dz = t.z - head.z;
      g.cam.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      g.cam.update(0, g.input, g.pigeon);
      g.render();
      const before = g.missions.state.story * 10 + g.missions.current.stepIdx;
      g.input.pressed.add('Enter');
      g.simulate(1 / 30);
      g.render();
      const after = g.missions.current ? g.missions.state.story * 10 + g.missions.current.stepIdx : 999;
      g.input.pressed.add('KeyQ');
      g.simulate(1 / 30);
      if (after !== before || !g.missions.current) { best = { ok: true, k }; if (g.photoMode) g.setPhoto(false); break; }
    }
    return best || { ok: false };
  }, labelHint);
  await page.evaluate(() => { const g = window.__game; const t = g.missions.step.targets()[0]; g.pigeon.place(t.x + 10, t.z + 10, t.y + 10); g.simulate(1); });
  const p5 = await photoAt('auto');
  check('M5: foto dell\'auto nera', p5.ok, JSON.stringify(p5));
  s = await waitMission(page, 5);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 6: marchio sul geometra
  const m6 = await page.evaluate(() => {
    const g = window.__game;
    const a = g.missions.tempAgents[0];
    let tries = 0;
    for (; tries < 30 && g.missions.state.story === 5; tries++) {
      g.pigeon.place(a.x + 15, a.z + 15, a.y + 20);
      g.simulate(1.2);
      // anticipa il movimento
      const sp = a.state === 'walk' ? a.speed : 0;
      const lead = 0.5;
      const x = a.x + Math.sin(a.yaw) * sp * lead, z = a.z + Math.cos(a.yaw) * sp * lead;
      g.pigeon.place(x, z, a.y + 1.85 + 1.2);
      g.pigeon.vel.set(0, 0, 0);
      g.pigeon.heading = 0;
      g.poop.cooldown = 0;
      g.input.pressed.add('KeyF');
      g.simulate(1);
    }
    return { story: g.missions.state.story, tries, stained: a.stained };
  });
  check('M6: bisogni sul geometra', m6.story === 6, JSON.stringify(m6));
  s = await waitMission(page, 6);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 7: antenna sui colli
  await page.evaluate(() => { const g = window.__game; const t = g.missions.step.targets()[0]; g.pigeon.place(t.x + 5, t.z + 5, t.y + 5); g.simulate(1); });
  const st7 = await story(page);
  check('M7: arrivo sulla vetta del Monte della Madonna', st7.step === 1, JSON.stringify(st7));
  await page.screenshot({ path: path.join(SHOTS, '04-monte-madonna.png') });
  const p7 = await photoAt('antenna');
  check('M7: foto dell\'antenna', p7.ok, JSON.stringify(p7));
  s = await waitMission(page, 7);
  await closeBrief(page);

  // ---------------------------------------------------------------- Missione 8: riunione notturna
  const m8 = await page.evaluate(() => {
    const g = window.__game;
    g.dayNight.time = 20.9;
    g.simulate(8);
    const s0 = g.missions.current.stepIdx;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x + 6, t.z + 6);
    g.simulate(1);
    const s1 = g.missions.current.stepIdx;
    for (let i = 0; i < 200 && g.missions.current?.stepIdx === 2; i++) {
      const a = g.missions.tempAgents?.[0];
      if (a) g.pigeon.place(a.x + 5, a.z + 3);
      g.simulate(1);
    }
    return { s0, s1, s2: g.missions.current?.stepIdx, hour: g.dayNight.clock() };
  });
  check('M8: notte, arrivo e ascolto della riunione segreta', m8.s0 >= 1 && m8.s2 === 3, JSON.stringify(m8));
  await page.evaluate(() => window.__game.render());
  await page.screenshot({ path: path.join(SHOTS, '05-riunione-notte.png') });
  const p8 = await photoAt('capo');
  check('M8: foto del Gran Cappuccio', p8.ok, JSON.stringify(p8));
  s = await waitMission(page, 8);
  check('Capitolo 1 completato, inizia il capitolo 2', s.story === 8 && /Sul filo/.test(s.title || ''), s.title);
  await closeBrief(page);

  // ---------------------------------------------------------------- Capitolo 2
  const m9 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    const w = g.world.col.near(t.x, t.z, 30).filter((o) => o.t === 'w')[0];
    const x = (w.ax + w.bx) / 2, z = (w.az + w.bz) / 2;
    const wy = g.world.col.wireY(w, x, z);
    g.pigeon.place(x, z, wy + 0.01);
    const kind = g.pigeon.support?.kind;
    g.simulate(16);
    return { kind, story: g.missions.state.story, y: +wy.toFixed(1) };
  });
  check('M9: posato su un filo elettrico reale', m9.kind === 'wire' && m9.story === 9, JSON.stringify(m9));
  await page.evaluate(() => window.__game.render());
  await page.screenshot({ path: path.join(SHOTS, '09-filo.png') });
  s = await waitMission(page, 9); await closeBrief(page);
  const p10 = await photoAt('capitello');
  check('M10: foto del capitello votivo', p10.ok, JSON.stringify(p10));
  s = await waitMission(page, 10); await closeBrief(page);
  const m11 = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 240 && g.missions.state.story === 10; i++) { const a = g.missions.tempAgents?.[0]; if (a) g.pigeon.place(a.x + 4, a.z + 2); g.simulate(1); }
    return g.missions.state.story;
  });
  check('M11: ascolto alla fermata dell\'autobus', m11 === 11, String(m11));
  s = await waitMission(page, 11); await closeBrief(page);
  const m12 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x, t.z, t.y + 3);
    g.input.keys.add('KeyC'); g.simulate(4); g.input.keys.delete('KeyC');
    return { story: g.missions.state.story, on: g.pigeon.onBuilding?.k };
  });
  check('M12: atterraggio sul punto più alto (silos/campanile)', m12.story === 12, JSON.stringify(m12));
  s = await waitMission(page, 12); await closeBrief(page);
  const p13 = await photoAt('piscina');
  check('M13: foto della piscina della villa', p13.ok, JSON.stringify(p13));
  s = await waitMission(page, 13); await closeBrief(page);
  const m14 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x + 1.6, t.z + 1.2);
    g.simulate(0.2);
    g.input.pressed.add('KeyE'); g.simulate(0.1);
    return g.missions.state.story;
  });
  check('M14: cimice piazzata sull\'auto nera', m14 === 14, String(m14));
  s = await waitMission(page, 14); await closeBrief(page);
  const m15 = await page.evaluate(() => {
    const g = window.__game;
    const t = g.missions.step.targets()[0];
    g.pigeon.place(t.x, t.z, t.y + 6); g.pigeon.vel.set(0, 0, 0);
    g.poop.cooldown = 0; g.input.pressed.add('KeyF'); g.simulate(2);
    return g.missions.state.story;
  });
  check('M15: segnale sulle strisce pedonali reali', m15 === 15, String(m15));
  s = await waitMission(page, 15); await closeBrief(page);
  const m16 = await page.evaluate(() => {
    const g = window.__game;
    let t = g.missions.step.targets()[0];
    g.pigeon.place(t.x + 3, t.z + 3, t.y + 3); g.simulate(1);
    const s1 = g.missions.current.stepIdx;
    t = g.missions.step.targets()[0];
    g.simulate(3);
    const hawk = g.animals.hawkState;
    g.pigeon.place(t.x, t.z, t.y + 2); g.input.keys.add('KeyC'); g.simulate(4); g.input.keys.delete('KeyC');
    return { s1, hawk, story: g.missions.state.story };
  });
  check('M16: fuga dal falco e consegna al campanile', m16.s1 === 1 && m16.story === 16, JSON.stringify(m16));
  s = await waitMission(page, 16);
  check('Campagna completa (16 missioni), partono le procedurali', s.story === 16 && /Missione/.test(s.title || ''), s.title);
  await closeBrief(page);

  // ---------------------------------------------------------------- collisioni
  const colls = await page.evaluate(() => {
    const g = window.__game, W = g.world, P = g.pigeon;
    const out = {};
    // muro a 26 m/s: mai dentro un edificio, scivola
    const b = W.buildings.filter((b) => b.solid && b.k === 'house' && Math.hypot(b.c[0] - g.nest.x, b.c[1] - g.nest.z) < 300)[0];
    const y = b.ground + 2;
    P.place(b.c[0] - b.ux * 25, b.c[1] - b.uz * 25, y);
    P.mode = 'air'; P.vel.set(b.ux * 26, 0, b.uz * 26);
    let inside = 0;
    for (let i = 0; i < 60; i++) { P.vel.y = 0; g.pigeon.update(1 / 30, { axes: () => ({ x: 0, y: 0 }), fly: false, descend: false, boost: false }, 0, false); if (W.buildingAt(P.pos.x, P.pos.z)?.solid && P.pos.y < W.roofY(W.buildingAt(P.pos.x, P.pos.z), P.pos.x, P.pos.z) - 0.1) inside++; }
    out.wall = inside;
    // lampione
    const L = W.lampPoints;
    const lx = L[0] + Math.sin(L[2]) * 1.1, lz = L[1] + Math.cos(L[2]) * 1.1;
    P.place(lx, lz, W.terrain.heightAt(L[0], L[1]) + 6.6);
    g.input.keys.add('KeyC'); g.simulate(1); g.input.keys.delete('KeyC');
    out.lamp = P.support?.kind;
    // albero
    W.col.ensureTrees(P.pos.x, P.pos.z);
    const tr = W.col.near(P.pos.x, P.pos.z, 250).find((o) => o.t === 'r');
    if (tr) { P.place(tr.x, tr.z, tr.top + 1); g.input.keys.add('KeyC'); g.simulate(1.5); g.input.keys.delete('KeyC'); out.tree = P.support?.kind; }
    // auto in corsa
    g.dayNight.time = 8; g.simulate(1);
    const car = g.npc.cars.find((c) => c.state === 'driving');
    if (car) {
      g.pigeon.place(car.x, car.z, car.y + 1.6); g.npc.render(g.pigeon);
      const d0 = car.x;
      P.place(car.x, car.z, car.y + 1.55);
      g.simulate(2);
      out.carSupport = P.support?.kind;
      out.carDist = +Math.hypot(P.pos.x - car.x, P.pos.z - car.z).toFixed(2);
      out.carMoved = +Math.abs(car.x - d0).toFixed(1);
    }
    // camera mai dentro i muri
    let bad = 0;
    const houses = W.buildings.filter((b) => b.solid && Math.hypot(b.c[0] - g.nest.x, b.c[1] - g.nest.z) < 250).slice(0, 25);
    for (const h of houses) {
      const e = h.door;
      P.place(e.x + e.nx * 0.4, e.z + e.nz * 0.4);
      for (const yaw of [0, 1.6, 3.1, 4.7]) { g.cam.yaw = Math.atan2(e.nx, e.nz) + yaw; g.cam.cur.set(0, 0, 0); g.cam.update(0.016, g.input, P); if (W.col.solidAt(g.camera.position.x, g.camera.position.y, g.camera.position.z)) bad++; }
    }
    out.camBad = bad;
    return out;
  });
  check('Collisioni: a 26 m/s il piccione non attraversa i muri', colls.wall === 0, JSON.stringify(colls));
  check('Collisioni: posarsi su lampione, albero e tetto di un\'auto in corsa', colls.lamp === 'lamp' && colls.tree === 'tree' && colls.carSupport === 'car' && colls.carDist < 2.5, JSON.stringify(colls));
  check('Camera: mai dentro muri o tetti (100 posizioni)', colls.camBad === 0, 'posizioni errate: ' + colls.camBad);
  const npcIn = await page.evaluate(() => { const g = window.__game; g.dayNight.time = 10; g.simulate(60); const v = g.npc.agents.filter((a) => a.state !== 'inside' && a.state !== 'plan'); const bad = v.filter((a) => g.world.buildingAt(a.x, a.z)?.solid).length; return { bad, tot: v.length }; });
  check('NPC: nessun abitante dentro gli edifici', npcIn.bad <= Math.ceil(npcIn.tot * 0.01), JSON.stringify(npcIn));

  // ---------------------------------------------------------------- Polaroid
  const pol = await page.evaluate(async () => {
    const g = window.__game;
    g.pigeon.place(g.nest.x, g.nest.z, g.world.terrain.heightAt(g.nest.x, g.nest.z) + 10);
    const n0 = g.photoTotal || 0;
    g.setPhoto(true); g.simulate(0.1); g.render();
    g.input.pressed.add('Enter'); g.simulate(1 / 30); g.render();
    const shown = !!document.querySelector('.polaroid');
    g.setPhoto(false);
    return { n0, n1: g.photoTotal || 0, shown };
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, '10-polaroid.png') });
  await page.waitForTimeout(4500);
  const polGone = await page.evaluate(() => !document.querySelector('.polaroid'));
  check('Polaroid: esce, si sviluppa e finisce nell\'album', pol.shown && pol.n1 === pol.n0 + 1 && polGone, JSON.stringify({ ...pol, polGone }));

  // ---------------------------------------------------------------- edifici distinti
  const kinds = await page.evaluate(() => { const g = window.__game; const k = {}; for (const b of g.data.buildings) k[b.k] = (k[b.k] || 0) + 1; return { n: Object.keys(k).length, k, signs: g.data.buildings.filter((b) => b.sign).map((b) => b.sign).slice(0, 8), ctrn: g.data.buildings.filter((b) => b.ct).length }; });
  check('Edifici distinti per tipo (dati OSM + Regione Veneto) e insegne reali', kinds.n >= 12 && kinds.signs.length >= 5 && kinds.ctrn > 4000, JSON.stringify(kinds));

  // ---------------------------------------------------------------- procedurali: generazione
  const procs = await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    for (let i = 0; i < 12; i++) { const m = g.missions.procedural(); out.push(m.title + ' | ' + m.steps.map((s) => s.type).join(',')); }
    return out;
  });
  check('Missioni procedurali generate', procs.length === 12 && new Set(procs.map((p) => p.split('|')[0].split('·')[1])).size >= 3, procs.slice(0, 5).join(' ; '));

  // ---------------------------------------------------------------- dialoghi procedurali
  const talk = await page.evaluate(() => {
    const g = window.__game;
    g.dayNight.time = 10;
    g.simulate(1);
    const lines = new Set();
    let convos = 0;
    const sub = document.getElementById('subtitles');
    g.pigeon.place(g.nest.x, g.nest.z);
    for (let i = 0; i < 120 && lines.size < 8; i++) {
      const c = g.npc.convos[0];
      if (c) { g.pigeon.place(c.x + 4, c.z + 4); convos++; }
      g.simulate(1);
      for (const el of sub.children) lines.add(el.textContent);
    }
    return { convos, lines: [...lines].slice(0, 8), n: lines.size };
  });
  check('Conversazioni casuali udite e sottotitolate', talk.n >= 4, talk.lines.join(' / '));

  // routine: a mezzogiorno e a mezzanotte
  const routine = await page.evaluate(() => {
    const g = window.__game;
    const count = () => g.npc.agents.filter((a) => a.state !== 'inside' && a.state !== 'plan').length;
    g.dayNight.time = 9.5; g.simulate(30); const morning = count();
    const drivingM = g.npc.cars.filter((c) => c.state === 'driving').length;
    g.dayNight.time = 2.5; g.simulate(30); const night = count();
    return { morning, night, drivingM };
  });
  check('Routine giorno/notte degli abitanti', routine.morning > routine.night, JSON.stringify(routine));

  // ---------------------------------------------------------------- mappa
  await page.evaluate(() => { const g = window.__game; g.dayNight.time = 11; g.pigeon.place(g.nest.x, g.nest.z); g.simulate(1); g.toggleMap(true); });
  await page.waitForFunction(() => window.L && window.__game.fullmap.map, null, { timeout: 20000 });
  await page.evaluate(() => { const g = window.__game; const [la, lo] = g.data.geo.toLatLon(g.pigeon.pos.x, g.pigeon.pos.z); g.fullmap.map.setView([la, lo], 18); });
  await page.waitForTimeout(2500);
  const mapInfo = await page.evaluate(() => ({ numbers: document.querySelectorAll('.hn').length, streets: [...document.querySelectorAll('.poi-label')].map((e) => e.textContent).filter((t) => /^(Via|Piazza|Strada|Vicolo)/i.test(t)).slice(0, 6), tiles: document.querySelectorAll('.leaflet-tile-loaded').length, pigeon: !!document.querySelector('.pigeon-marker') }));
  check('Mappa: civici, nomi delle vie e posizione del piccione', mapInfo.numbers > 5 && mapInfo.streets.length > 0 && mapInfo.pigeon, JSON.stringify(mapInfo));
  await page.screenshot({ path: path.join(SHOTS, '06-mappa.png') });
  await page.evaluate(() => window.__game.toggleMap(false));

  // ---------------------------------------------------------------- vista di gioco (giorno)
  await page.evaluate(() => {
    const g = window.__game;
    g.pigeon.place(g.nest.x, g.nest.z, g.world.surfaceAt(g.nest.x, g.nest.z).y + 30);
    g.cam.pitch = 0.35;
    g.simulate(0.5);
    g.render();
  });
  await page.screenshot({ path: path.join(SHOTS, '07-volo-giorno.png') });

  // ---------------------------------------------------------------- salvataggio e ripresa
  const before = await page.evaluate(() => { const g = window.__game; g.save(); return { story: g.missions.state.story, x: g.pigeon.pos.x, splats: g.poop.splats.length }; });
  await page.close();
  const { page: page2 } = await openGame(ctx, '?q=low&autostart=continue');
  const after = await page2.evaluate(() => { const g = window.__game; return { story: g.missions.state.story, x: g.pigeon.pos.x, splats: g.poop.splats.length }; });
  check('Salvataggio e ripresa della partita', after.story === before.story && Math.abs(after.x - before.x) < 0.5 && after.splats === before.splats, JSON.stringify({ before, after }));
  await page2.close();
  await ctx.close();

  // ---------------------------------------------------------------- mobile
  const mctx = await browser.newContext({ ...devices['Pixel 7'] });
  const { page: mp } = await openGame(mctx, '?q=low&autostart=new');
  await closeBrief(mp);
  const touchUI = await mp.evaluate(() => !document.getElementById('touch').classList.contains('hidden'));
  check('Mobile: comandi touch visibili', touchUI);
  const mfly = await mp.evaluate(() => {
    const g = window.__game;
    const y0 = g.pigeon.pos.y;
    g.input.touchHeld.add('fly');
    g.simulate(2);
    g.input.touchHeld.delete('fly');
    g.input.joy = { x: 0, y: -1, active: true };
    g.simulate(2);
    g.input.joy = { x: 0, y: 0, active: false };
    return { dy: g.pigeon.pos.y - y0, moved: g.pigeon.stats.flown };
  });
  check('Mobile: volo con pulsante e joystick', mfly.dy > 3 && mfly.moved > 5, JSON.stringify(mfly));
  await mp.evaluate(() => window.__game.render());
  await mp.screenshot({ path: path.join(SHOTS, '08-mobile.png') });
  await mctx.close();

  // ---------------------------------------------------------------- prestazioni (rendering reale)
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: pp } = await openGame(pctx, '?q=medium&autostart=new');
  await closeBrief(pp);
  const perf = await pp.evaluate(async () => {
    const g = window.__game;
    g.world.fastBuild = true; g.tick(1 / 60); g.world.fastBuild = false;
    for (let i = 0; i < 10; i++) { g.tick(1 / 60); g.input.endFrame(); }
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { g.tick(1 / 60); g.input.endFrame(); }
    const tickMs = (performance.now() - t0) / 30;
    g.render();
    const info = g.renderer.info.render;
    return { tickMs: tickMs.toFixed(2), calls: info.calls, triangles: info.triangles };
  });
  check('Prestazioni: budget draw call, triangoli e tempo CPU di simulazione', +perf.calls < 260 && +perf.triangles < 900000 && +perf.tickMs < 8, JSON.stringify(perf));
  await pctx.close();
} catch (e) {
  check('Eccezione durante il test', false, e.stack);
}
check('Nessun errore JavaScript in console', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures}/${results.length} controlli superati`);
process.exit(failures ? 1 : 0);
