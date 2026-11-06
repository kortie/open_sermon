#!/usr/bin/env node
// Builds public/licenses/app.txt (this app's Apache-2.0 license) and public/licenses/third-party.txt
// (license texts of the libraries shipped inside the app) for the About screen (S16). Run after
// changing runtime dependencies: `node scripts/build-notices.mjs`. `--check` fails when the files
// are out of date (used by the unit tests).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Runtime packages bundled in the web assets or the native shells (+ transitive runtime code). */
export const PACKAGES = [...Object.keys(pkg.dependencies), 'scheduler'].sort();

/** Native libraries pulled by Gradle (not in node_modules). Terms are named, not copied. */
export const NATIVE = [
  { name: 'AndroidX (appcompat, coordinatorlayout, core-splashscreen)', license: 'Apache-2.0' },
  { name: 'Google ML Kit GenAI Prompt API (com.google.mlkit:genai-prompt)', license: 'ML Kit Terms of Service (Google)' },
  { name: 'Google Play Billing Library (com.android.billingclient:billing)', license: 'Android Software Development Kit License Agreement (Google)' },
];

function licenseText(dir) {
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE']) {
    const p = join(dir, f);
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  }
  return null;
}

export function buildNotices() {
  const parts = ['Third-party software in this app', ''];
  for (const name of PACKAGES) {
    const dir = join(root, 'node_modules', name);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const text = licenseText(dir);
    if (!text) throw new Error(`build-notices: no license file for ${name}`);
    parts.push('='.repeat(72), `${meta.name} ${meta.version} (${meta.license})`, '='.repeat(72), text, '');
  }
  parts.push('='.repeat(72), 'Native libraries (Android)', '='.repeat(72));
  for (const n of NATIVE) parts.push(`- ${n.name}: ${n.license}`);
  return `${parts.join('\n')}\n`;
}

const outputs = () => ({
  'public/licenses/third-party.txt': buildNotices(),
  'public/licenses/app.txt': `Bible Meditation\nCopyright 2026 JuanStudio\n\n${readFileSync(join(root, 'LICENSE'), 'utf8').trim()}\n`,
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, text] of Object.entries(outputs())) {
    const p = join(root, rel);
    if (check) {
      if (!existsSync(p) || readFileSync(p, 'utf8') !== text) {
        console.error(`build-notices: ${rel} is out of date (run node scripts/build-notices.mjs)`);
        stale++;
      }
    } else writeFileSync(p, text);
  }
  if (stale) process.exit(1);
  console.log(check ? 'build-notices: up to date' : 'build-notices: written');
}

export { outputs };
