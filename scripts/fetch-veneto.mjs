// Scarica dal GeoServer della Regione del Veneto (IDT, licenza IODL 2.0):
//   - Edifici del Veneto (DBT/CTRN 1:5000) con tipologia e uso         -> data/raw/veneto/edifici.json
//   - Grafo stradale regionale con i nomi ufficiali delle vie          -> data/raw/veneto/strade.json
//   - DTM regionale a 5 m (LiDAR dove disponibile) in tile PNG         -> data/raw/veneto/dtm/
// Il DTM è pubblicato solo come WMS: per ottenere le quote grezze lo si richiede più volte con uno
// stile SLD a rampa di grigi su finestre di 64 m (0,25 m di risoluzione verticale) e poi lo si
// ricompone in build-data.mjs.
import fs from 'node:fs';
import path from 'node:path';

const GS = 'https://idt2-geoserver.regione.veneto.it/geoserver';
const OUT = path.resolve('data/raw/veneto');
fs.mkdirSync(path.join(OUT, 'dtm'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, type = 'json') {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (type === 'json') return JSON.parse(buf.toString('utf8'));
      if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error('not a PNG: ' + buf.subarray(0, 200).toString());
      return buf;
    } catch (err) {
      console.warn('retry', err.message.slice(0, 200));
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error('failed ' + url);
}

// ---------------------------------------------------------------- vettoriali (WFS)
const [S, W, N, E] = [45.325, 11.585, 45.415, 11.715];
async function wfs(layer, file) {
  const f = path.join(OUT, file);
  if (fs.existsSync(f)) return;
  const all = [];
  for (let start = 0; ; start += 5000) {
    const url = `${GS}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${layer}` +
      `&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=5000&startIndex=${start}` +
      `&bbox=${W},${S},${E},${N},EPSG:4326`;
    const fc = await get(url);
    all.push(...fc.features);
    console.log(layer, all.length);
    if (fc.features.length < 5000) break;
  }
  fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features: all }));
}
await wfs('rv:edifici_veneto_feb2022', 'edifici.json');
await wfs('rv:c01070240012_elementostradale', 'strade.json');

// ---------------------------------------------------------------- DTM 5 m (WMS)
const DTM = { s: 45.315, w: 11.57, n: 45.435, e: 11.74, px: 1024, windows: 10, win: 64 };
DTM.dlat = 4.5e-5; // ~5 m
DTM.dlon = 6.4e-5; // ~5 m a 45,4° N
DTM.cols = Math.ceil((DTM.e - DTM.w) / DTM.dlon / DTM.px);
DTM.rows = Math.ceil((DTM.n - DTM.s) / DTM.dlat / DTM.px);
const sld = (lo) => `<?xml version="1.0"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>rv:DTM_RV_5m_3003</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap type="ramp"><ColorMapEntry color="#000000" quantity="${lo}"/><ColorMapEntry color="#FFFFFF" quantity="${lo + DTM.win}"/></ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
for (let r = 0; r < DTM.rows; r++) for (let c = 0; c < DTM.cols; c++) {
  const w = DTM.w + c * DTM.px * DTM.dlon, e = w + DTM.px * DTM.dlon;
  const n = DTM.n - r * DTM.px * DTM.dlat, s = n - DTM.px * DTM.dlat;
  for (let k = 0; k < DTM.windows; k++) {
    const f = path.join(OUT, 'dtm', `${r}_${c}_${k}.png`);
    if (fs.existsSync(f)) continue;
    const q = new URLSearchParams({
      service: 'WMS', version: '1.1.1', request: 'GetMap', layers: 'rv:DTM_RV_5m_3003', srs: 'EPSG:4326',
      bbox: `${w},${s},${e},${n}`, width: DTM.px, height: DTM.px, format: 'image/png', SLD_BODY: sld(k * DTM.win),
    });
    fs.writeFileSync(f, await get(`${GS}/wms?${q}`, 'png'));
    console.log('dtm', r, c, k);
  }
}
fs.writeFileSync(path.join(OUT, 'dtm', 'index.json'), JSON.stringify(DTM));
console.log('done');
