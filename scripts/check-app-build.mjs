// S13 static check for the Capacitor app build (DESIGN 2.1.2): run after `vite build --mode app`.
// - capacitor.config.ts must not point the app at a remote server (`server.url`) or turn on the
//   native HTTP plugin (requests must stay WebView fetch calls under the CSP);
// - dist/ (the assets copied into the app) must not register a service worker.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const errors = [];
const cfg = readFileSync('capacitor.config.ts', 'utf8');
if (/\bserver\s*:/.test(cfg)) errors.push('capacitor.config.ts: no `server` block (remote url / cleartext) allowed');
if (/CapacitorHttp\s*:\s*\{\s*enabled\s*:\s*true/.test(cfg)) errors.push('capacitor.config.ts: CapacitorHttp must stay disabled');
if (!/webDir\s*:\s*'dist'/.test(cfg)) errors.push("capacitor.config.ts: webDir must be 'dist'");

if (!existsSync('dist/index.html')) errors.push('dist/index.html missing: run vite build --mode app first');
else {
  for (const f of readdirSync('dist')) if (/^(sw\.js|registerSW\.js|workbox-.*\.js)$/.test(f)) errors.push(`dist/${f}: no service worker in the app build`);
  const html = readFileSync(join('dist', 'index.html'), 'utf8');
  if (/registerSW|serviceWorker/.test(html)) errors.push('dist/index.html registers a service worker');
}

if (errors.length) {
  for (const e of errors) console.error(`check-app-build: ${e}`);
  process.exit(1);
}
console.log('check-app-build: OK');
