#!/usr/bin/env node
// Validates config/app.config.json and config/bible-sources.json (schema, link rules, i18n names).
// Rules: .claude/skills/sermon-verify/SKILL.md §5.
//
// Usage:
//   node scripts/check-config.mjs            # full config check
//   node scripts/check-config.mjs --bibles   # only bible-related rules (quick static check)
// Placeholders that become mandatory after a step is DONE are read from docs/spec/README.md:
//   bible_db.sha256            → required once S01 is DONE
//   backup.pbkdf2_iterations   → required once S06 is DONE; a number must equal the S06 decision
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';
import { connectOriginsFromConfig } from './build-csp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isPlaceholder = (v) => typeof v === 'string' && /^<.*>$/.test(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** S06 decision (DESIGN 4.2): OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256, checked 2026-11-05. */
export const CONFIRMED_PBKDF2_ITERATIONS = 600000;

/** Steps marked DONE in the status table of docs/spec/README.md. */
export function doneSteps(readmeText) {
  const done = new Set();
  for (const line of readmeText.split('\n')) {
    const m = line.match(/^\|\s*\[(S\d{2})\][^|]*\|(.*)$/);
    if (m && m[2].split('|').map((c) => c.trim()).includes('DONE')) done.add(m[1]);
  }
  return done;
}

/** Origins of providers verified for browser-direct calls (kept here for existing callers). */
export const verifiedProviderOrigins = connectOriginsFromConfig;

export function checkBibles(cfg) {
  const errors = [];
  const { i18n } = cfg;
  const excluded = new Set(i18n.excluded_bibles.map((b) => b.toLowerCase()));
  for (const [lang, list] of Object.entries(i18n.available_bibles)) {
    for (const b of list) {
      if (excluded.has(b.toLowerCase())) errors.push(`i18n.available_bibles.${lang} contains excluded bible "${b}"`);
    }
    const def = i18n.default_bible[lang];
    if (!list.includes(def)) errors.push(`i18n.default_bible.${lang} "${def}" is not in available_bibles.${lang}`);
    // Bundled bibles must come from the derived DB (DESIGN 2.1.1).
    for (const id of list) {
      if (!(cfg.bible_db?.sources ?? []).includes(id)) errors.push(`i18n.available_bibles.${lang} "${id}" is not in bible_db.sources`);
    }
  }
  for (const s of cfg.bible_db?.sources ?? []) {
    if (excluded.has(s.toLowerCase())) errors.push(`bible_db.sources contains excluded bible "${s}"`);
  }
  return errors;
}

/**
 * @param {object} cfg parsed app.config.json
 * @param {{ schema: object, providersDoc?: string, done?: Set<string>, bibleSources?: object|null }} opts
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkConfig(cfg, { schema, providersDoc = '', done = new Set(), bibleSources = null, bibleSourcesOpts = {} }) {
  const errors = [];
  const warnings = [];

  const ajv = new Ajv({ allErrors: true });
  if (!ajv.validate(schema, cfg)) {
    for (const e of ajv.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    return { errors, warnings };
  }

  errors.push(...checkBibles(cfg));

  const fs = cfg.ui.font_size_px;
  if (!fs.options.includes(fs.default)) errors.push(`ui.font_size_px.default ${fs.default} is not in options`);
  if (fs.options.some((v, i, a) => i > 0 && v <= a[i - 1])) errors.push('ui.font_size_px.options must be ascending');

  const g = cfg.generation;
  if (!(g.sermon_min_chars <= g.sermon_target_chars && g.sermon_target_chars <= g.sermon_max_chars)) {
    errors.push('generation: sermon_min_chars <= sermon_target_chars <= sermon_max_chars violated');
  }
  const si = cfg.sermon_ingest;
  if (si.min_chunk_chars >= si.max_chunk_chars) errors.push('sermon_ingest: min_chunk_chars must be < max_chunk_chars');

  for (const name of cfg.wizard.providers_order) {
    if (!cfg.providers[name]) errors.push(`wizard.providers_order references unknown provider "${name}"`);
  }

  // Wizard exposure (CLAUDE.md rule 20, DESIGN 3.13 v0.15): only verified providers are selectable or
  // recommended; an unverified provider shown in the wizard must say why (disabled card).
  const rec = cfg.wizard.beginner_recommendation;
  if (cfg.providers[rec]?.browser_direct_verified !== true) {
    errors.push(`wizard.beginner_recommendation "${rec}" is not a browser_direct_verified provider`);
  }
  for (const name of cfg.wizard.providers_order) {
    const p = cfg.providers[name];
    if (p && p.browser_direct_verified !== true && !p.unavailable_reason) {
      errors.push(`providers.${name} is not browser_direct_verified and needs unavailable_reason for its disabled wizard card`);
    }
  }
  for (const [name, p] of Object.entries(cfg.providers)) {
    if (p.models && !isPlaceholder(p.model) && !p.models.includes(p.model)) {
      errors.push(`providers.${name}.model "${p.model}" is not in providers.${name}.models`);
    }
  }

  for (const [name, p] of Object.entries(cfg.providers)) {
    if (!p.browser_direct_verified) continue;
    if (isPlaceholder(p.endpoint) || isPlaceholder(p.model)) {
      errors.push(`providers.${name} is browser_direct_verified but endpoint/model is still a placeholder`);
    }
    else {
      let url = null;
      try {
        url = new URL(p.endpoint);
      } catch {
        errors.push(`providers.${name}.endpoint is not a valid URL`);
      }
      if (url && url.protocol !== 'https:') errors.push(`providers.${name}.endpoint must use https (got ${url.protocol})`);
    }
    const section = providersDoc.split(/^## /m).find((s) => s.toLowerCase().startsWith(name.toLowerCase()));
    const date = section?.match(/확인 날짜:\s*(\S+)/)?.[1];
    if (!date || !DATE_RE.test(date)) {
      errors.push(`providers.${name} is browser_direct_verified but docs/PROVIDERS.md has no "확인 날짜: YYYY-MM-DD" for it`);
    }
  }

  const placeholderRules = [
    ['S01', 'bible_db.sha256', cfg.bible_db.sha256],
    ['S06', 'backup.pbkdf2_iterations', cfg.backup.pbkdf2_iterations],
  ];
  for (const [step, key, value] of placeholderRules) {
    if (!isPlaceholder(value)) continue;
    (done.has(step) ? errors : warnings).push(`${key} is still a placeholder (required once ${step} is DONE)`);
  }

  const iter = cfg.backup.pbkdf2_iterations;
  if (!isPlaceholder(iter) && iter !== CONFIRMED_PBKDF2_ITERATIONS) {
    errors.push(`backup.pbkdf2_iterations is ${iter}, expected the confirmed ${CONFIRMED_PBKDF2_ITERATIONS} (DESIGN 4.2)`);
  }

  if (bibleSources) errors.push(...checkBibleSources(bibleSources, bibleSourcesOpts));

  return { errors, warnings };
}

/**
 * config/bible-sources.json rules (CLAUDE.md rules 12, 22, 23; DESIGN 3.15; skill bible-txt-import §4.5).
 * @param {unknown} doc parsed bible-sources.json
 * @param {{ schema?: object, i18n?: { ko: object, en: object } }} [opts] schema check and screen-name check
 */
export function checkBibleSources(doc, { schema, i18n } = {}) {
  const errors = [];
  if (schema) {
    const ajv = new Ajv({ allErrors: true });
    if (!ajv.validate(schema, doc)) {
      for (const e of ajv.errors) errors.push(`bible-sources schema: ${e.instancePath || '/'} ${e.message}`);
      return errors;
    }
  }
  const entries = Array.isArray(doc) ? doc : doc?.sources;
  if (!Array.isArray(entries)) return ['bible-sources.json: expected an array or {"sources": [...]}'];
  const seen = new Set();
  for (const e of entries) {
    const id = e.id ?? '(no id)';
    if (seen.has(id)) errors.push(`bible-sources ${id}: duplicate id`);
    seen.add(id);
    if (!['public_domain', 'copyrighted', 'unverified'].includes(e.rights)) errors.push(`bible-sources ${id}: invalid rights "${e.rights}"`);
    for (const k of ['read_url', 'download_url']) {
      if (e[k] && !/^https:\/\/\S+$/.test(e[k])) errors.push(`bible-sources ${id}: ${k} must be an https URL`);
    }
    if (e.download_url) {
      if (e.rights !== 'public_domain') errors.push(`bible-sources ${id}: download_url only allowed for public_domain`);
      if (!e.verified_on || !DATE_RE.test(e.verified_on)) errors.push(`bible-sources ${id}: download_url requires verified_on (YYYY-MM-DD)`);
    }
    if (e.read_url && (!e.verified_on || !DATE_RE.test(e.verified_on))) errors.push(`bible-sources ${id}: read_url requires verified_on (YYYY-MM-DD)`);
    if (e.rights === 'unverified' && (e.read_url || e.download_url)) errors.push(`bible-sources ${id}: unverified entries have no links`);
    if (i18n) {
      for (const [lang, strings] of Object.entries(i18n)) {
        const guide = strings.bible_guide ?? {};
        if (typeof guide.name?.[id] !== 'string') errors.push(`bible-sources ${id}: missing i18n ${lang} bible_guide.name.${id}`);
        if (e.note && typeof guide.note?.[e.note] !== 'string') errors.push(`bible-sources ${id}: missing i18n ${lang} bible_guide.note.${e.note}`);
      }
    }
  }
  return errors;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(argv) {
  const cfg = readJson(resolve(ROOT, 'config/app.config.json'));
  if (argv.includes('--bibles')) {
    const errors = checkBibles(cfg);
    errors.forEach((e) => console.error(`FAIL ${e}`));
    return errors.length ? 1 : 0;
  }
  const readme = resolve(ROOT, 'docs/spec/README.md');
  const providers = resolve(ROOT, 'docs/PROVIDERS.md');
  const sources = resolve(ROOT, 'config/bible-sources.json');
  const { errors, warnings } = checkConfig(cfg, {
    schema: readJson(resolve(ROOT, 'config/app.config.schema.json')),
    providersDoc: existsSync(providers) ? readFileSync(providers, 'utf8') : '',
    done: existsSync(readme) ? doneSteps(readFileSync(readme, 'utf8')) : new Set(),
    bibleSources: existsSync(sources) ? readJson(sources) : null,
    bibleSourcesOpts: {
      schema: readJson(resolve(ROOT, 'config/bible-sources.schema.json')),
      i18n: { ko: readJson(resolve(ROOT, 'src/i18n/ko.json')), en: readJson(resolve(ROOT, 'src/i18n/en.json')) },
    },
  });
  warnings.forEach((w) => console.error(`WARN ${w}`));
  errors.forEach((e) => console.error(`FAIL ${e}`));
  if (!errors.length) console.error('check-config: OK');
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
