import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDerived, sha256 } from '../../../scripts/build-bible-db.mjs';
import { verifyDb } from '../../../scripts/verify-db.mjs';

const cfg = () => JSON.parse(readFileSync('config/app.config.json', 'utf8'));
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** Tiny stand-in for the release DB: same table shapes, plus a source and a table we must drop. */
function fakeRelease(): Uint8Array {
  const db = new SQL.Database();
  db.exec(`CREATE TABLE books(book INTEGER PRIMARY KEY, code TEXT, name_kr TEXT, testament TEXT);
    CREATE TABLE verses(id INTEGER PRIMARY KEY, book INT, chapter INT, verse INT, canon_chapter INT, canon_verse INT, source TEXT, text TEXT);
    CREATE TABLE strongs(id TEXT, gloss TEXT);
    INSERT INTO strongs VALUES ('H1', 'share-alike data');`);
  for (let b = 1; b <= 66; b++) db.run('INSERT INTO books VALUES (?, ?, ?, ?)', [b, `B${b}`, `책${b}`, b < 40 ? 'OT' : 'NT']);
  const ins = 'INSERT INTO verses(book, chapter, verse, canon_chapter, canon_verse, source, text) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(ins, [43, 3, 16, 3, 16, 'kjv', 'For God so loved']);
  db.run(ins, [43, 3, 16, 3, 16, 'wlc', 'hebrew']);
  db.run(ins, [1, 1, 1, 1, 1, 'krv', '태초에 ’하나님이’ –']);
  const bytes = db.export();
  db.close();
  return bytes;
}

const opts = { sources: ['krv', 'kjv'], releaseTag: 'v1.0.1', releaseSha256: 'a'.repeat(64), source: 'crizin/bible-db' };

describe('build-bible-db', () => {
  it('copies only books and the configured sources, byte-for-byte text, deterministically', () => {
    const release = fakeRelease();
    const a = buildDerived(SQL, release, opts);
    const b = buildDerived(SQL, release, opts);
    expect(sha256(a)).toBe(sha256(b));

    const db = new SQL.Database(a);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0]?.values.flat();
    expect(tables).toEqual(['books', 'build_info', 'verses']);
    expect(db.exec('SELECT source, book, chapter, verse, text FROM verses ORDER BY source')[0]?.values).toEqual([
      ['kjv', 43, 3, 16, 'For God so loved'],
      ['krv', 1, 1, 1, '태초에 ’하나님이’ –'],
    ]);
    const info = Object.fromEntries(db.exec('SELECT key, value FROM build_info')[0]?.values ?? []);
    expect(info).toMatchObject({ release_tag: 'v1.0.1', sources: 'krv,kjv', verses_krv: '1', verses_kjv: '1' });
    db.close();
  });

  it('fails when a configured source has no verses', () => {
    expect(() => buildDerived(SQL, fakeRelease(), { ...opts, sources: ['krv', 'web'] })).toThrow(/"web" has no verses/);
  });
});

describe('verify-db', () => {
  const real = () => new Uint8Array(readFileSync(cfg().bible_db.file));

  it('passes the bundled DB', () => {
    expect(verifyDb(SQL, real(), cfg())).toEqual([]);
  });

  it('fails a copy with one byte changed', () => {
    const bytes = real();
    bytes[5_000_000] = (bytes[5_000_000] ?? 0) ^ 0x01;
    expect(verifyDb(SQL, bytes, cfg())).toContainEqual(expect.stringMatching(/^sha256 mismatch/));
  });

  it('fails a DB with missing or unexpected bibles and a foreign release', () => {
    const c = cfg();
    const bytes = buildDerived(SQL, fakeRelease(), { ...opts, sources: ['kjv'] });
    c.bible_db.sha256 = sha256(bytes);
    const errors = verifyDb(SQL, bytes, c);
    expect(errors).toContainEqual('required bible "krv" has no verses');
    expect(errors).toContainEqual('build_info.release_sha256 does not match config');
    c.i18n.excluded_bibles = ['kjv'];
    c.bible_db.sources = ['krv'];
    expect(verifyDb(SQL, bytes, c)).toEqual(
      expect.arrayContaining(['unexpected bible "kjv" in DB (not in bible_db.sources)', 'excluded bible "kjv" is present in DB']),
    );
  });

  it('reports unreadable files instead of throwing', () => {
    const errors = verifyDb(SQL, new TextEncoder().encode('not a database'), cfg());
    expect(errors.some((e) => e.startsWith('cannot read DB'))).toBe(true);
  });
});
