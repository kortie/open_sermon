import { describe, expect, it } from 'vitest';
import { BOOKS, bookKey, bookName, getBook, lookupBook } from '../../../src/core/bible/books';
import { mergeRanges, parseReference, type Reference } from '../../../src/core/bible/reference-parser';

const ok = (input: string): Reference => {
  const r = parseReference(input);
  if (!r.ok) throw new Error(`expected ok for "${input}", got ${r.error}`);
  return r.ref;
};
const err = (input: string) => {
  const r = parseReference(input);
  return r.ok ? 'OK' : r.error;
};
const ref = (book: number, chapter: number, ...ranges: [number, number][]): Reference => ({
  book,
  chapter,
  ranges: ranges.map(([start, end]) => ({ start, end })),
});

describe('books', () => {
  it('has 66 books numbered 1..66 matching the DB codes', () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.map((b) => b.no)).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
    expect(getBook(43)?.code).toBe('JHN');
    expect(getBook(62)?.code).toBe('1JN');
    expect(getBook(67)).toBeUndefined();
    expect(bookName(67, 'ko')).toBe('');
  });

  it.each([
    ['창세기', 1], ['창', 1], ['Genesis', 1], ['gen', 1], ['GEN', 1],
    ['시편', 19], ['시', 19], ['Psalms', 19], ['Ps.', 19], ['psalm', 19],
    ['요한복음', 43], ['요', 43], ['John', 43], ['Jn', 43], ['JHN', 43],
    ['요일', 62], ['요한일서', 62], ['1 John', 62], ['1John', 62], ['1jn', 62],
    ['요나', 32], ['욘', 32], ['Jonah', 32],
    ['아가', 22], ['아', 22], ['Song of Solomon', 22], ['Song of Songs', 22],
    ['사', 23], ['전', 21], ['수', 6], ['요한계시록', 66], ['Rev', 66],
  ])('lookupBook(%s) = %i', (name, no) => {
    expect(lookupBook(name)).toBe(no);
  });

  it('does not prefix-match', () => {
    expect(lookupBook('요한')).toBeNull();
    expect(lookupBook('Jo')).toBeNull();
    expect(bookKey(' 1 John. ')).toBe('1john');
  });
});

describe('parseReference — accepted forms', () => {
  it.each<[string, Reference]>([
    ['요 15:1-8', ref(43, 15, [1, 8])],
    ['요한복음 15장 1절', ref(43, 15, [1, 1])],
    ['요 15', ref(43, 15)],
    ['John 3:16', ref(43, 3, [16, 16])],
    ['Jn 3:16-18', ref(43, 3, [16, 18])],
    ['요 15:1-8, 12', ref(43, 15, [1, 8], [12, 12])],
    ['요 15:1-3, 5-7', ref(43, 15, [1, 3], [5, 7])],
    ['요3:16', ref(43, 3, [16, 16])],
    ['1 John 4:8', ref(62, 4, [8, 8])],
    ['1John 4:8', ref(62, 4, [8, 8])],
    ['요일 4:8', ref(62, 4, [8, 8])],
    ['요 4:8', ref(43, 4, [8, 8])],
    ['요한복음 15장', ref(43, 15)],
    ['요한복음 15장 1-8절', ref(43, 15, [1, 8])],
    ['요한복음 15장 1절~8절', ref(43, 15, [1, 8])],
    ['요 15:1–8', ref(43, 15, [1, 8])],
    ['요 15:1~8', ref(43, 15, [1, 8])],
    ['요 15:1—8', ref(43, 15, [1, 8])],
    ['John 15', ref(43, 15)],
    ['창 1:1', ref(1, 1, [1, 1])],
    ['창세기 1:1', ref(1, 1, [1, 1])],
    ['Genesis 1:1', ref(1, 1, [1, 1])],
    ['시 23', ref(19, 23)],
    ['시편 119:105', ref(19, 119, [105, 105])],
    ['Ps 23:1', ref(19, 23, [1, 1])],
    ['롬 8:28', ref(45, 8, [28, 28])],
    ['로마서 8:28', ref(45, 8, [28, 28])],
    ['Rom 8:28', ref(45, 8, [28, 28])],
    ['Song of Solomon 2:1', ref(22, 2, [1, 1])],
    ['계 22:21', ref(66, 22, [21, 21])],
  ])('%s', (input, expected) => {
    expect(ok(input)).toEqual(expected);
  });

  it('accepts spacing variants and full-width digits', () => {
    for (const s of ['  요   15 : 1 - 8 ,  12 ', '요 15:1-8,12', '요15:1-8 ,12', '요 １５：１－８']) {
      expect(ok(s).book).toBe(43);
      expect(ok(s).chapter).toBe(15);
      expect(ok(s).ranges[0]).toEqual({ start: 1, end: 8 });
    }
  });

  it('sorts and merges overlapping or adjacent ranges', () => {
    expect(ok('요 15:1-3,2-5').ranges).toEqual([{ start: 1, end: 5 }]);
    expect(ok('요 15:1-3,4').ranges).toEqual([{ start: 1, end: 4 }]);
    expect(ok('요 15:12, 1-8').ranges).toEqual([{ start: 1, end: 8 }, { start: 12, end: 12 }]);
    expect(mergeRanges([])).toEqual([]);
  });
});

describe('parseReference — errors', () => {
  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['요 15:'.padEnd(51, ' ') + '1', 'TOO_LONG'],
    ['가'.repeat(51), 'TOO_LONG'],
    ['<script>', 'BAD_CHARS'],
    ['요 3:16;', 'BAD_CHARS'],
    ["요 3:16'", 'BAD_CHARS'],
    ['없는책 1:1', 'UNKNOWN_BOOK'],
    ['Hezekiah 1:1', 'UNKNOWN_BOOK'],
    ['15:1', 'BAD_FORMAT'],
    ['요한복음', 'BAD_FORMAT'],
    ['요 15:1-', 'BAD_FORMAT'],
    ['요 15::1', 'BAD_FORMAT'],
    ['요 15:8-1', 'REVERSED_RANGE'],
    ['요 15:1-3, 9-4', 'REVERSED_RANGE'],
    ['요 0:1', 'ZERO_OR_NEGATIVE'],
    ['요 3:0', 'ZERO_OR_NEGATIVE'],
    ['요 3:16-4:2', 'MULTI_CHAPTER'],
    ['요 3:16, 4:1', 'MULTI_CHAPTER'],
  ])('%j → %s', (input, code) => {
    expect(err(input)).toBe(code);
  });

  it('accepts exactly 50 characters', () => {
    const s = '요 15:1' + ' '.repeat(50 - '요 15:1'.length);
    expect(s).toHaveLength(50);
    expect(err(s)).toBe('OK');
  });
});
