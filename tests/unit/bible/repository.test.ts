// Uses the real derived DB (public/data/bible.sqlite, built by `npm run db:build`).
import { readFileSync } from 'node:fs';
import initSqlJs, { type Database } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import appConfig from '../../../config/app.config.json';
import { availableBibleIds, publicPath } from '../../../src/core/bible/db';
import { BibleRepository, escapeLike } from '../../../src/core/bible/repository';
import { parseReference, type Reference } from '../../../src/core/bible/reference-parser';

let db: Database;
let repo: BibleRepository;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database(readFileSync(appConfig.bible_db.file));
  repo = new BibleRepository(db, availableBibleIds(appConfig));
});
afterAll(() => db.close());

const refOf = (s: string): Reference => {
  const r = parseReference(s);
  if (!r.ok) throw new Error(r.error);
  return r.ref;
};

describe('BibleRepository', () => {
  it('exposes only configured bibles', () => {
    expect(availableBibleIds(appConfig).sort()).toEqual(['kjv', 'krv']);
    expect(repo.hasBible('niv')).toBe(false);
    expect(repo.getChapter('niv', 1, 1)).toEqual([]);
    expect(repo.chapterCount('niv', 1)).toBe(0);
    expect(repo.verseCount('niv', 1, 1)).toBe(0);
    expect(repo.getVerses('niv', refOf('창 1:1'))).toEqual([]);
    expect(repo.search('niv', 'love')).toEqual({ ok: false, error: 'UNKNOWN_BIBLE' });
  });

  it('Genesis 1 has 31 verses in order', () => {
    const v = repo.getChapter('krv', 1, 1);
    expect(v).toHaveLength(31);
    expect(v.map((x) => x.verse)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(repo.verseCount('krv', 1, 1)).toBe(31);
    expect(v[0]?.text).toBe('태초에 하나님이 천지를 창조하시니라');
  });

  it('John 3:16 exists in krv and kjv', () => {
    const [ko] = repo.getVerses('krv', refOf('요 3:16'));
    const [en] = repo.getVerses('kjv', refOf('John 3:16'));
    expect(ko?.text).toBe('하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라');
    expect(en?.text).toMatch(/^For God so loved the world/);
  });

  it('returns comma-list verses in range order', () => {
    const v = repo.getVerses('krv', refOf('요 15:1-3, 12'));
    expect(v.map((x) => x.verse)).toEqual([1, 2, 3, 12]);
    expect(repo.getVerses('krv', refOf('요 15')).length).toBe(repo.verseCount('krv', 43, 15));
  });

  it('last book, last chapter', () => {
    expect(repo.chapterCount('krv', 66)).toBe(22);
    expect(repo.verseCount('krv', 66, 22)).toBe(21);
    expect(repo.chapterCount('krv', 19)).toBe(150);
    expect(repo.chapterCount('krv', 67)).toBe(0);
  });

  it('missing chapter → empty result, OUT_OF_RANGE on check', () => {
    expect(repo.getChapter('krv', 43, 22)).toEqual([]);
    expect(repo.checkReference('krv', refOf('요 22:1'))).toBe('OUT_OF_RANGE');
    expect(repo.checkReference('krv', refOf('요 3:37'))).toBe('OUT_OF_RANGE');
    expect(repo.checkReference('krv', refOf('요 3:36'))).toBeNull();
    expect(repo.checkReference('krv', refOf('요 3'))).toBeNull();
  });

  it('adjacent chapters cross book boundaries and stop at the ends', () => {
    expect(repo.adjacentChapter('krv', 1, 1, -1)).toBeNull();
    expect(repo.adjacentChapter('krv', 1, 1, 1)).toEqual({ book: 1, chapter: 2 });
    expect(repo.adjacentChapter('krv', 1, 50, 1)).toEqual({ book: 2, chapter: 1 });
    expect(repo.adjacentChapter('krv', 2, 1, -1)).toEqual({ book: 1, chapter: 50 });
    expect(repo.adjacentChapter('krv', 66, 22, 1)).toBeNull();
    expect(repo.adjacentChapter('krv', 66, 22, -1)).toEqual({ book: 66, chapter: 21 });
  });

  it('keyword search pages through results', () => {
    const p1 = repo.search('krv', '사랑');
    expect(p1.ok && p1.page.hits.length).toBe(50);
    expect(p1.ok && p1.page.hasMore).toBe(true);
    const all: number[] = [];
    for (let offset = 0; ; offset += 50) {
      const p = repo.search('krv', '사랑', { offset });
      if (!p.ok) throw new Error(p.error);
      all.push(...p.page.hits.map((h) => h.book));
      if (!p.page.hasMore) break;
    }
    expect(all).toHaveLength(517);
    const en = repo.search('kjv', 'so loved the world');
    expect(en.ok && en.page.hits.map((h) => [h.book, h.chapter, h.verse])).toEqual([[43, 3, 16]]);
  });

  it('treats %, _, \\ and quotes literally', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    for (const q of ['%', '_', "'", "' OR 1=1 --", '\\', '"; DROP TABLE verses; --']) {
      const r = repo.search('krv', q);
      expect(r).toEqual({ ok: true, page: { hits: [], hasMore: false } });
    }
    expect(repo.getChapter('krv', 1, 1)).toHaveLength(31); // table still there
  });

  it('rejects empty and too-long queries', () => {
    expect(repo.search('krv', '  ')).toEqual({ ok: false, error: 'EMPTY' });
    expect(repo.search('krv', '가'.repeat(51))).toEqual({ ok: false, error: 'TOO_LONG' });
  });

  it('chapter lookup p95 < 200ms over 50 random chapters', () => {
    const times: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 50; i++) {
      const book = 1 + Math.floor(rnd() * 66);
      const chapter = 1 + Math.floor(rnd() * repo.chapterCount('krv', book));
      const t0 = performance.now();
      const v = repo.getChapter('krv', book, chapter);
      times.push(performance.now() - t0);
      expect(v.length).toBeGreaterThan(0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? Infinity;
    process.stdout.write(`chapter lookup p50=${times[25]?.toFixed(2)}ms p95=${p95.toFixed(2)}ms\n`);
    expect(p95).toBeLessThan(200);
  });

  it('publicPath maps public/ files to the base URL', () => {
    expect(publicPath('public/data/bible.sqlite', '/')).toBe('/data/bible.sqlite');
    expect(publicPath('public/data/bible.sqlite', '/app/')).toBe('/app/data/bible.sqlite');
  });
});
