#!/usr/bin/env node
// npm run verify:db — checks public/data/bible.sqlite (skill bible-db-access §4.1, DESIGN 2.1.1):
// file present, SHA-256 equals bible_db.sha256, 66 books, every bible_db.sources / available bible
// has verses, no excluded bible inside, build_info matches the release recorded in config.
// Usage: node scripts/verify-db.mjs [path]   (path defaults to bible_db.file)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {import('sql.js').SqlJsStatic} SQL
 * @param {Uint8Array} bytes
 * @param {object} cfg parsed app.config.json
 * @returns {string[]} errors
 */
export function verifyDb(SQL, bytes, cfg) {
  const errors = [];
  const { bible_db: bdb, i18n } = cfg;
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== bdb.sha256) errors.push(`sha256 mismatch: file ${hash}, config bible_db.sha256 ${bdb.sha256}`);

  let db;
  try {
    db = new SQL.Database(bytes);
    const one = (sql, params = []) => {
      const st = db.prepare(sql);
      try { st.bind(params); return st.step() ? st.get() : []; } finally { st.free(); }
    };
    const books = one('SELECT count(*) FROM books')[0];
    if (books !== 66) errors.push(`expected 66 books, found ${books}`);

    const present = new Set();
    const st = db.prepare('SELECT DISTINCT source FROM verses');
    while (st.step()) present.add(String(st.get()[0]));
    st.free();

    const required = new Set([...bdb.sources, ...Object.values(i18n.available_bibles).flat()]);
    for (const s of required) if (!present.has(s)) errors.push(`required bible "${s}" has no verses`);
    for (const s of present) if (!bdb.sources.includes(s)) errors.push(`unexpected bible "${s}" in DB (not in bible_db.sources)`);
    for (const s of i18n.excluded_bibles) if (present.has(s)) errors.push(`excluded bible "${s}" is present in DB`);

    const info = Object.fromEntries(db.exec('SELECT key, value FROM build_info')[0]?.values ?? []);
    if (info.release_tag !== bdb.release_tag) errors.push(`build_info.release_tag ${info.release_tag} != ${bdb.release_tag}`);
    if (info.release_sha256 !== bdb.release_sha256) errors.push('build_info.release_sha256 does not match config');
  } catch (e) {
    errors.push(`cannot read DB: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    db?.close();
  }
  return errors;
}

async function main(argv) {
  const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/app.config.json'), 'utf8'));
  const file = resolve(argv[0] ?? resolve(ROOT, cfg.bible_db.file));
  if (!existsSync(file)) {
    console.error(`FAIL ${file} not found (run npm run db:build)`);
    return 1;
  }
  const errors = verifyDb(await initSqlJs(), readFileSync(file), cfg);
  errors.forEach((e) => console.error(`FAIL ${e}`));
  if (!errors.length) console.error(`verify-db: OK (${cfg.bible_db.source} ${cfg.bible_db.release_tag}, ${cfg.bible_db.sources.join(', ')})`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
