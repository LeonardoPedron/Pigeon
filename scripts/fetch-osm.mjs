// Scarica i dati OpenStreetMap del comune di Rovolon tramite l'API OSM (/api/0.6/map),
// suddividendo l'area in celle. Salva i file XML grezzi in data/raw/osm/.
// Uso: node scripts/fetch-osm.mjs [south west north east]
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/raw/osm');
fs.mkdirSync(OUT, { recursive: true });

const [S, W, N, E] = process.argv.length >= 6
  ? process.argv.slice(2, 6).map(Number)
  : [45.335, 11.595, 45.425, 11.715];
const STEP = 0.01;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCell(s, w, n, e, depth = 0) {
  const key = `${s.toFixed(4)}_${w.toFixed(4)}_${n.toFixed(4)}_${e.toFixed(4)}`;
  const file = path.join(OUT, `${key}.osm`);
  if (fs.existsSync(file) && fs.statSync(file).size > 200) return;
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${w},${s},${e},${n}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'pigeon-spy-game-data-builder/1.0' } });
      if (res.status === 400 && depth < 3) {
        // troppi nodi: dividi la cella in 4
        const ms = (s + n) / 2, mw = (w + e) / 2;
        await fetchCell(s, w, ms, mw, depth + 1);
        await fetchCell(s, mw, ms, e, depth + 1);
        await fetchCell(ms, w, n, mw, depth + 1);
        await fetchCell(ms, mw, n, e, depth + 1);
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      fs.writeFileSync(file, txt);
      console.log('ok', key, (txt.length / 1024).toFixed(0) + 'KB');
      await sleep(400);
      return;
    } catch (err) {
      console.warn('retry', key, err.message);
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error('failed ' + key);
}

for (let s = S; s < N - 1e-9; s += STEP) {
  for (let w = W; w < E - 1e-9; w += STEP) {
    await fetchCell(+s.toFixed(4), +w.toFixed(4), +Math.min(s + STEP, N).toFixed(4), +Math.min(w + STEP, E).toFixed(4));
  }
}
console.log('done');
