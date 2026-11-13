// Copia le librerie (versioni fisse da package.json) in js/vendor
import fs from 'node:fs';
fs.mkdirSync('js/vendor/leaflet/images', { recursive: true });
fs.copyFileSync('node_modules/three/build/three.module.min.js', 'js/vendor/three.module.min.js');
fs.copyFileSync('node_modules/leaflet/dist/leaflet.js', 'js/vendor/leaflet/leaflet.js');
fs.copyFileSync('node_modules/leaflet/dist/leaflet.css', 'js/vendor/leaflet/leaflet.css');
for (const f of fs.readdirSync('node_modules/leaflet/dist/images')) fs.copyFileSync('node_modules/leaflet/dist/images/' + f, 'js/vendor/leaflet/images/' + f);
fs.copyFileSync('node_modules/earcut/src/earcut.js', 'js/vendor/earcut.js');
console.log('vendored');
