// Genera js/vendor/trystero.js (WebRTC P2P con segnalazione su relay Nostr) come singolo modulo ES.
// Uso: node scripts/vendor-net.mjs  (scarica trystero ed esbuild in una cartella temporanea)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.26.0';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trystero-'));
const run = (c) => execSync(c, { cwd: tmp, stdio: 'inherit' });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true,"type":"module"}');
run(`npm i --no-audit --no-fund trystero@${VERSION} esbuild@0.24.0`);
const out = path.resolve('js/vendor/trystero.js');
run(`npx esbuild node_modules/trystero/dist/index.mjs --bundle --format=esm --minify --legal-comments=inline --outfile="${out}"`);
fs.writeFileSync(out, `/* trystero ${VERSION} (MIT, github.com/dmotz/trystero) – bundle generato da scripts/vendor-net.mjs */\n` + fs.readFileSync(out, 'utf8'));
console.log('scritto', out);
