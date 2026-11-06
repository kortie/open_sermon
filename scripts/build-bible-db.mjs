#!/usr/bin/env node
// Builds public/data/bible.sqlite from the crizin/bible-db release (DESIGN 2.1.1).
//   npm run db:build                       # download release_url into .cache/, verify, build
//   npm run db:build -- --input <file.gz>  # use an already downloaded release asset
// The release .gz must match bible_db.release_sha256. Only `books` and the verses of
// bible_db.sources are copied; verse text is copied byte-for-byte (KRV must not be altered).
// Output is deterministic for the same input and sql.js version; its hash goes to bible_db.sha256.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import initSqlJs from 'sql.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const DERIVED_SCHEMA = [
  'CREATE TABLE books(book INTEGER PRIMARY KEY, code TEXT NOT NULL, name_kr TEXT NOT NULL, testament TEXT NOT NULL)',
  'CREATE TABLE verses(source TEXT NOT NULL, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(source, book, chapter, verse)) WITHOUT ROWID',
  'CREATE TABLE build_info(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID',
];

/**
 * @param {import('sql.js').SqlJsStatic} SQL
 * @param {Uint8Array} sourceDb uncompressed release bible.sqlite
 * @param {{ sources: string[], releaseTag: string, releaseSha256: string, source: string }} opts
 * @returns {Uint8Array}
 */
export function buildDerived(SQL, sourceDb, opts) {
  const src = new SQL.Database(sourceDb);
  const out = new SQL.Database();
  try {
    out.exec('PRAGMA page_size = 4096; PRAGMA journal_mode = OFF;');
    for (const sql of DERIVED_SCHEMA) out.exec(sql);
    out.exec('BEGIN');

    const insBook = out.prepare('INSERT INTO books VALUES (?, ?, ?, ?)');
    const books = src.prepare('SELECT book, code, name_kr, testament FROM books ORDER BY book');
    let bookCount = 0;
    while (books.step()) { insBook.run(books.get()); bookCount++; }
    books.free(); insBook.free();
    if (bookCount !== 66) throw new Error(`expected 66 books, found ${bookCount}`);

    const insVerse = out.prepare('INSERT INTO verses VALUES (?, ?, ?, ?, ?)');
    const verses = src.prepare('SELECT source, book, chapter, verse, text FROM verses WHERE source = ? ORDER BY book, chapter, verse');
    const counts = {};
    for (const s of opts.sources) {
      verses.bind([s]);
      let n = 0;
      while (verses.step()) { insVerse.run(verses.get()); n++; }
      verses.reset();
      if (n === 0) throw new Error(`source "${s}" has no verses in the release`);
      counts[s] = n;
    }
    verses.free(); insVerse.free();

    const insInfo = out.prepare('INSERT INTO build_info VALUES (?, ?)');
    const info = {
      source: opts.source,
      release_tag: opts.releaseTag,
      release_sha256: opts.releaseSha256,
      sources: opts.sources.join(','),
      ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [`verses_${k}`, String(v)])),
    };
    for (const [k, v] of Object.entries(info)) insInfo.run([k, v]);
    insInfo.free();

    out.exec('COMMIT');
    out.exec('VACUUM');
    return out.export();
  } finally {
    src.close();
    out.close();
  }
}

async function main(argv) {
  const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/app.config.json'), 'utf8')).bible_db;
  const i = argv.indexOf('--input');
  let gz;
  if (i >= 0 && argv[i + 1]) {
    gz = readFileSync(resolve(argv[i + 1]));
  } else {
    const cached = resolve(ROOT, '.cache', cfg.release_asset);
    if (!existsSync(cached)) {
      console.error(`downloading ${cfg.release_url}`);
      const res = await fetch(cfg.release_url);
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      mkdirSync(dirname(cached), { recursive: true });
      writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
    }
    gz = readFileSync(cached);
  }

  const gzHash = sha256(gz);
  if (gzHash !== cfg.release_sha256) {
    console.error(`FAIL release asset sha256 ${gzHash} != config bible_db.release_sha256 ${cfg.release_sha256}`);
    return 1;
  }
  console.error(`release asset OK (${cfg.release_tag}, ${gz.length} bytes)`);

  const SQL = await initSqlJs();
  const bytes = buildDerived(SQL, gunzipSync(gz), {
    sources: cfg.sources,
    releaseTag: cfg.release_tag,
    releaseSha256: cfg.release_sha256,
    source: cfg.source,
  });
  const outFile = resolve(ROOT, cfg.file);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, bytes);
  const hash = sha256(bytes);
  console.error(`wrote ${cfg.file} (${bytes.length} bytes)`);
  console.error(`sha256 ${hash}${hash === cfg.sha256 ? ' (matches config)' : ' (update config bible_db.sha256)'}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(`FAIL ${err.message}`);
    process.exit(1);
  });
}
