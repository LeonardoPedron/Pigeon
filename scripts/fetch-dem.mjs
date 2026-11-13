// Scarica le tile di elevazione Terrarium (AWS Open Data, derivate da SRTM/EU-DEM)
// che coprono l'area di gioco. Salva i PNG in data/raw/dem/.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/raw/dem');
fs.mkdirSync(OUT, { recursive: true });
const Z = 14;
const [S, W, N, E] = [45.325, 11.585, 45.425, 11.725];

const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2y = (lat) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z);
};

const x0 = lon2x(W), x1 = lon2x(E), y0 = lat2y(N), y1 = lat2y(S);
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const file = path.join(OUT, `${Z}_${x}_${y}.png`);
    if (fs.existsSync(file)) continue;
    const url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${Z}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' ' + res.status);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('ok', file);
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ z: Z, x0, x1, y0, y1 }));
console.log('done');
