// S11: saving (rights consent, one transaction, no partial save), deletion, backup exclusion,
// reading an imported bible (ImportedRepository), the blank sample template and a search timing.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeBytes,
  ImportedRepository,
  ImportError,
  inspectText,
  IMPORTED_PREFIX,
  loadImportedRepository,
  removeImportedBible,
  sampleTemplate,
  saveImportedBible,
  splitLines,
  type BibleStructure,
  type Inspection,
} from '../../../src/core/bible-import';
import { collectPayload } from '../../../src/core/backup/export';
import { BOOK_COUNT } from '../../../src/core/bible';
import { listConsents } from '../../../src/core/store/consent';
import { openDb, req, withTransaction } from '../../../src/core/store/db';
import { countImportedVerses, getImportedVerses, listImportedBibles } from '../../../src/core/store/importedBible';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import ko from '../../../src/i18n/ko.json';

const STRUCT: BibleStructure = { chapterCount: () => 50, verseCount: () => 31 };
const yes = { granted: true, at: 1234 };
const opened: IDBDatabase[] = [];
let n = 0;
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});
async function fresh() {
  const db = await openDb(`bible-import-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
const sample = (): Inspection => {
  const { text, encoding } = decodeBytes(new Uint8Array(readFileSync('tests/fixtures/bible-import/format-a.txt')));
  return inspectText(text, encoding, STRUCT);
};
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`;
  }
  return 'no error';
}
const counts = async (db: IDBDatabase) => ({
  bibles: (await listImportedBibles(db)).length,
  verses: await withTransaction('imported_verse', 'readonly', (tx) => req(tx.objectStore('imported_verse').count()), db),
  consents: (await listConsents(db)).length,
});

describe('save', () => {
  it('stores the bible, its verses and the bible_rights consent together', async () => {
    const db = await fresh();
    const meta = await saveImportedBible({ name: '  나의   시험 역본 ', language: 'ko', inspection: sample() }, yes, { db, now: 99 });
    expect(meta.id.startsWith(IMPORTED_PREFIX)).toBe(true);
    expect(meta).toMatchObject({ name: '나의 시험 역본', language: 'ko', encoding: 'utf-8', verse_count: 6, partial: true, rights_consent_at: 1234, no_redistribute: true, created_at: 99 });
    expect(await listImportedBibles(db)).toEqual([meta]);
    expect(await countImportedVerses(meta.id, db)).toBe(6);
    expect(await listConsents(db)).toEqual([expect.objectContaining({ kind: 'bible_rights', target_id: meta.id, granted: true, at: 1234 })]);
  });

  it('without the rights check nothing is stored', async () => {
    const db = await fresh();
    expect(await codeOf(saveImportedBible({ name: '역본', language: 'ko', inspection: sample() }, { granted: false, at: 1 }, { db }))).toBe('CONSENT_REQUIRED');
    expect(await counts(db)).toEqual({ bibles: 0, verses: 0, consents: 0 });
  });

  it('a bad name, an empty result or too many warnings is refused', async () => {
    const db = await fresh();
    expect(await codeOf(saveImportedBible({ name: '   ', language: 'ko', inspection: sample() }, yes, { db }))).toBe('BAD_NAME');
    expect(await codeOf(saveImportedBible({ name: 'x'.repeat(41), language: 'ko', inspection: sample() }, yes, { db }))).toBe('BAD_NAME');
    const bad = inspectText('창세기 1:1 가\n창세기 99:1 범위 밖', 'utf-8', STRUCT);
    expect(await codeOf(saveImportedBible({ name: '역본', language: 'ko', inspection: bad }, yes, { db }))).toBe('TOO_MANY_WARNINGS');
    const empty = inspectText('창세기 99:1 범위 밖', 'utf-8', STRUCT);
    expect(await codeOf(saveImportedBible({ name: '역본', language: 'ko', inspection: empty }, yes, { db }))).toBe('EMPTY');
    expect(await counts(db)).toEqual({ bibles: 0, verses: 0, consents: 0 });
  });

  it('a failure in the middle of the write leaves nothing behind (no partial save)', async () => {
    const db = await fresh();
    const insp = sample();
    // An invalid key (NaN) on the 4th verse makes that put throw inside the transaction.
    const broken: Inspection = { ...insp, verses: insp.verses.map((v, i) => (i === 3 ? { ...v, chapter: Number.NaN } : v)) };
    expect(await codeOf(saveImportedBible({ name: '역본', language: 'ko', inspection: broken }, yes, { db }))).not.toBe('no error');
    expect(await counts(db)).toEqual({ bibles: 0, verses: 0, consents: 0 });
  });
});

describe('delete and backup', () => {
  it('deleting removes the bible and every verse; other bibles stay', async () => {
    const db = await fresh();
    const a = await saveImportedBible({ name: '가', language: 'ko', inspection: sample() }, yes, { db, now: 1 });
    const b = await saveImportedBible({ name: '나', language: 'en', inspection: sample() }, yes, { db, now: 2 });
    await removeImportedBible(a.id, db);
    expect(await countImportedVerses(a.id, db)).toBe(0);
    expect((await listImportedBibles(db)).map((x) => x.id)).toEqual([b.id]);
    expect(await countImportedVerses(b.id, db)).toBe(6);
  });

  it('a default backup has no imported bible, verses or their rights consent', async () => {
    const db = await fresh();
    await saveImportedBible({ name: '가', language: 'ko', inspection: sample() }, yes, { db });
    const p = await collectPayload({ db });
    expect(p.stores.imported_bible).toBeUndefined();
    expect(p.stores.imported_verse).toBeUndefined();
    expect(p.stores.consent_log.some((c) => c.kind === 'bible_rights')).toBe(false);
    expect(JSON.stringify(p)).not.toContain('시험 문장');
  });
});

describe('ImportedRepository', () => {
  it('chapter, verses, counts and references on a partial bible', async () => {
    const db = await fresh();
    const meta = await saveImportedBible({ name: '가', language: 'ko', inspection: sample() }, yes, { db });
    const repo = await loadImportedRepository(meta.id, db);
    expect(repo.hasBible(meta.id)).toBe(true);
    expect(repo.hasBible('krv')).toBe(false);
    expect(repo.getChapter(meta.id, 1, 1).map((v) => v.verse)).toEqual([1, 2, 3]);
    expect(repo.getChapter('krv', 1, 1)).toEqual([]);
    expect(repo.getVerses(meta.id, { book: 1, chapter: 1, ranges: [{ start: 2, end: 3 }] }).map((v) => v.verse)).toEqual([2, 3]);
    expect(repo.getVerses(meta.id, { book: 1, chapter: 1, ranges: [] })).toHaveLength(3);
    expect(repo.chapterCount(meta.id, 1)).toBe(2);
    expect(repo.chapterCount(meta.id, 2)).toBe(0);
    expect(repo.chapterCount(meta.id, 99)).toBe(0);
    expect(repo.verseCount(meta.id, 1, 1)).toBe(3);
    expect(repo.checkReference(meta.id, { book: 1, chapter: 1, ranges: [{ start: 1, end: 3 }] })).toBeNull();
    expect(repo.checkReference(meta.id, { book: 1, chapter: 1, ranges: [{ start: 1, end: 4 }] })).toBe('OUT_OF_RANGE');
    expect(repo.checkReference(meta.id, { book: 2, chapter: 1, ranges: [] })).toBe('OUT_OF_RANGE');
    // Missing books and chapters are skipped: Genesis 2 → 1 Samuel 3 → John 3 → end.
    expect(repo.adjacentChapter(meta.id, 1, 2, 1)).toEqual({ book: 9, chapter: 3 });
    expect(repo.adjacentChapter(meta.id, 9, 3, 1)).toEqual({ book: 43, chapter: 3 });
    expect(repo.adjacentChapter(meta.id, 43, 3, 1)).toBeNull();
    expect(repo.adjacentChapter(meta.id, 43, 3, -1)).toEqual({ book: 9, chapter: 3 });
    expect(repo.adjacentChapter(meta.id, 1, 1, -1)).toBeNull();
    expect(repo.adjacentChapter('krv', 1, 1, 1)).toBeNull();
  });

  it('search: substring, case-insensitive, paging and errors', () => {
    const repo = new ImportedRepository('imp-x', [
      { book: 2, chapter: 1, verse: 1, text: 'Light line' },
      { book: 1, chapter: 1, verse: 2, text: 'the light again' },
      { book: 1, chapter: 1, verse: 1, text: 'no match here' },
    ]);
    const r = repo.search('imp-x', 'LIGHT');
    expect(r.ok && r.page.hits.map((h) => [h.book, h.verse])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    const p1 = repo.search('imp-x', 'light', { limit: 1 });
    expect(p1.ok && p1.page).toMatchObject({ hasMore: true, hits: [{ book: 1 }] });
    const p2 = repo.search('imp-x', 'light', { limit: 1, offset: 1 });
    expect(p2.ok && p2.page).toMatchObject({ hasMore: false, hits: [{ book: 2 }] });
    expect(repo.search('imp-x', '  ')).toEqual({ ok: false, error: 'EMPTY' });
    expect(repo.search('imp-x', 'x'.repeat(51))).toEqual({ ok: false, error: 'TOO_LONG' });
    expect(repo.search('krv', 'light')).toEqual({ ok: false, error: 'UNKNOWN_BIBLE' });
  });

  it('timing: about 31,000 synthetic verses — load and a full-scan search (over 5 s only warns)', () => {
    const records = [];
    for (let book = 1; book <= BOOK_COUNT; book++)
      for (let chapter = 1; chapter <= 20; chapter++)
        for (let verse = 1; verse <= 24; verse++) records.push({ book, chapter, verse, text: `합성 시험 본문 ${book}권 ${chapter}장 ${verse}절 가나다라마바사 아자차카타파하` });
    expect(records.length).toBeGreaterThanOrEqual(31_000);
    const t0 = performance.now();
    const repo = new ImportedRepository('imp-perf', records);
    const t1 = performance.now();
    const miss = repo.search('imp-perf', '없는 낱말');
    const t2 = performance.now();
    const hit = repo.search('imp-perf', '20장 24절');
    const t3 = performance.now();
    expect(miss.ok && miss.page.hits).toEqual([]);
    expect(hit.ok && hit.page).toMatchObject({ hasMore: true });
    expect(hit.ok && hit.page.hits.length).toBe(50);
    const ms = { verses: records.length, load: Math.round(t1 - t0), searchMiss: Math.round(t2 - t1), searchHit: Math.round(t3 - t2) };
    if (t2 - t1 > 5000) console.warn('bible-import search over 5 s', ms);
    console.info('bible-import timing', ms);
  });
});

describe('sample template', () => {
  it('has only comment and blank lines: no bible text, imports as zero verses', () => {
    const lines = Object.entries(ko.bible_import.sample).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    const text = sampleTemplate(lines);
    expect(text.split('\r\n').every((l) => l === '' || l.startsWith('# '))).toBe(true);
    expect(splitLines(text)).toEqual([]);
    expect(() => inspectText(text, 'utf-8', STRUCT)).toThrow(ImportError);
    expect(sampleTemplate(['a\nb'])).toBe('# a b\r\n\r\n\r\n');
  });
});

it('getImportedVerses reads one bible only', async () => {
  const db = await fresh();
  const a = await saveImportedBible({ name: '가', language: 'ko', inspection: sample() }, yes, { db });
  await saveImportedBible({ name: '나', language: 'ko', inspection: sample() }, yes, { db });
  expect((await getImportedVerses(a.id, db)).every((v) => v.bible_id === a.id)).toBe(true);
  expect(await getImportedVerses(a.id, db)).toHaveLength(6);
});
