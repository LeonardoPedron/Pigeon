// Scarica gli edifici della Carta Tecnica / DBT della Regione del Veneto (layer edifici_veneto_feb2022)
// con tipologia (edi_ty) e uso (edi_uso) ufficiali. Salva in data/raw/ctrn/edifici.json.
import fs from 'node:fs';
const OUT = 'data/raw/ctrn';
fs.mkdirSync(OUT, { recursive: true });
const [S, W, N, E] = [45.340, 11.600, 45.420, 11.710];
const base = 'https://idt2-geoserver.regione.veneto.it/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=rv:edifici_veneto_feb2022&outputFormat=application/json&srsName=EPSG:4326&sortBy=classid';
const feats = [];
for (let start = 0; ; start += 2000) {
  const url = `${base}&count=2000&startIndex=${start}&bbox=${S},${W},${N},${E},urn:ogc:def:crs:EPSG::4326`;
  let j;
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); j = await r.json(); break; } catch (e) { console.warn('retry', e.message); await new Promise((r) => setTimeout(r, 3000)); }
  }
  if (!j) throw new Error('download fallito');
  feats.push(...j.features);
  console.log('scaricati', feats.length, '/', j.totalFeatures);
  if (j.features.length < 2000) break;
}
const slim = feats.map((f) => ({ t: f.properties.edi_ty, u: f.properties.edi_uso, s: f.properties.edi_stat, g: f.geometry.coordinates.map((poly) => poly[0].map((c) => [+c[0].toFixed(7), +c[1].toFixed(7)])) }));
fs.writeFileSync(OUT + '/edifici.json', JSON.stringify(slim));
console.log('salvati', slim.length);
