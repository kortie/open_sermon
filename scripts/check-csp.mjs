#!/usr/bin/env node
// Checks the CSP <meta> in a built index.html (CLAUDE.md 4.2, sermon-verify §4).
// Usage: node scripts/check-csp.mjs dist/index.html
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connectOriginsFromConfig } from './build-csp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { buildCsp } from './build-csp.mjs';

export function extractCsp(html) {
  // The policy itself contains single quotes ('self'), so the closing quote must match the opening one.
  const m = html.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*http-equiv=["']Content-Security-Policy["'](?:[^>"']|"[^"]*"|'[^']*')*>/i);
  if (!m) return null;
  const c = m[0].match(/content=(?:"([^"]*)"|'([^']*)')/i);
  return c ? decodeEntities(c[1] ?? c[2]) : null;
}

/** Vite serializes attribute quotes as entities (&#39;); browsers decode them before parsing the policy. */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseCsp(policy) {
  const out = {};
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = values;
  }
  return out;
}

const same = (actual, expected) =>
  actual && actual.length === expected.length && expected.every((v) => actual.includes(v));

/**
 * @param {string} html
 * @param {string[]} verifiedOrigins origins allowed in connect-src besides 'self'
 * @returns {string[]} errors
 */
export function checkCsp(html, verifiedOrigins = []) {
  const policy = extractCsp(html);
  if (!policy) return ['no Content-Security-Policy <meta> found'];
  const d = parseCsp(policy);
  const errors = [];
  const forbidden = ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:'];
  for (const [name, values] of Object.entries(d)) {
    for (const v of values) if (forbidden.includes(v)) errors.push(`forbidden source ${v} in ${name}`);
  }
  const exact = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:'],
  };
  for (const [name, expected] of Object.entries(exact)) {
    if (!d[name]) errors.push(`missing directive ${name}`);
    else if (!same(d[name], expected)) errors.push(`${name} must be exactly "${expected.join(' ')}" (got "${d[name].join(' ')}")`);
  }
  const connect = d['connect-src'];
  if (!connect) errors.push('missing directive connect-src');
  else {
    if (!connect.includes("'self'")) errors.push("connect-src must include 'self'");
    for (const src of connect) {
      if (src !== "'self'" && !verifiedOrigins.includes(src)) errors.push(`connect-src contains unverified source ${src}`);
    }
    // Exact match (S07 gate): every verified origin must be present, nothing missing or extra.
    for (const origin of verifiedOrigins) {
      if (!connect.includes(origin)) errors.push(`connect-src is missing verified provider origin ${origin}`);
    }
  }
  return [...new Set(errors)];
}

function main(argv) {
  const file = argv[0] ?? 'dist/index.html';
  const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/app.config.json'), 'utf8'));
  const errors = checkCsp(readFileSync(file, 'utf8'), connectOriginsFromConfig(cfg));
  errors.forEach((e) => console.error(`FAIL ${e}`));
  if (!errors.length) console.error('check-csp: OK');
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
