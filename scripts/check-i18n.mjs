#!/usr/bin/env node
// i18n checks (CLAUDE.md rule 16, sermon-verify §3.1):
//  - ko.json and en.json have the same key set
//  - no empty values
//  - every t('key') used in src exists
// Usage: node scripts/check-i18n.mjs [i18nDir] [srcDir]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['ko', 'en'];

export function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}

/** Keys passed as a string literal to t(...) in source files. */
export function usedKeys(srcDir) {
  const keys = new Map();
  const re = /\bt\(\s*['"`]([A-Za-z0-9_.-]+)['"`]/g;
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) if (!keys.has(m[1])) keys.set(m[1], file);
  }
  return keys;
}

/** @returns {string[]} errors */
export function checkI18n(i18nDir, srcDir) {
  const errors = [];
  const dicts = {};
  for (const lang of LANGS) {
    const p = join(i18nDir, `${lang}.json`);
    if (!existsSync(p)) {
      errors.push(`missing ${lang}.json`);
      continue;
    }
    dicts[lang] = flatten(JSON.parse(readFileSync(p, 'utf8')));
  }
  if (errors.length) return errors;

  const [a, b] = LANGS;
  for (const k of Object.keys(dicts[a])) if (!(k in dicts[b])) errors.push(`key "${k}" in ${a}.json missing in ${b}.json`);
  for (const k of Object.keys(dicts[b])) if (!(k in dicts[a])) errors.push(`key "${k}" in ${b}.json missing in ${a}.json`);
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(dicts[lang])) {
      if (typeof v !== 'string' || v.trim() === '') errors.push(`empty or non-string value for "${k}" in ${lang}.json`);
    }
  }
  // CLAUDE.md rule 14: internal terms must not appear in screen strings (values only; keys may use internal names)
  const forbidden = {
    ko: /설교 생성|예문|유머|골격|발췌 검색/,
    en: /sermon generat|\bhumou?r\b|skeleton|excerpt search/i,
  };
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(dicts[lang])) {
      if (typeof v === 'string' && forbidden[lang].test(v)) errors.push(`internal term in ${lang}.json "${k}": "${v}"`);
    }
  }
  for (const [k, file] of usedKeys(srcDir)) {
    if (!(k in dicts[a])) errors.push(`key "${k}" used in ${file} is not defined`);
  }
  return errors;
}

function main(argv) {
  const errors = checkI18n(resolve(argv[0] ?? join(ROOT, 'src/i18n')), resolve(argv[1] ?? join(ROOT, 'src')));
  errors.forEach((e) => console.error(`FAIL ${e}`));
  if (!errors.length) console.error('check-i18n: OK');
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
