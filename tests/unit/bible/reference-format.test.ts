import { describe, expect, it } from 'vitest';
import { BOOKS } from '../../../src/core/bible/books';
import { formatReference } from '../../../src/core/bible/reference-format';
import { parseReference, type Reference } from '../../../src/core/bible/reference-parser';

describe('formatReference', () => {
  const r: Reference = { book: 43, chapter: 15, ranges: [{ start: 1, end: 8 }, { start: 12, end: 12 }] };

  it('formats short and long, ko and en, with an en dash', () => {
    expect(formatReference(r, 'ko')).toBe('요 15:1–8, 12');
    expect(formatReference(r, 'ko', 'long')).toBe('요한복음 15:1–8, 12');
    expect(formatReference(r, 'en', 'long')).toBe('John 15:1–8, 12');
    expect(formatReference({ book: 43, chapter: 15, ranges: [{ start: 12, end: 12 }] }, 'ko')).toBe('요 15:12');
    expect(formatReference({ book: 43, chapter: 15, ranges: [] }, 'ko')).toBe('요 15');
    expect(formatReference({ book: 62, chapter: 4, ranges: [{ start: 8, end: 8 }] }, 'en')).toBe('1John 4:8');
    expect(formatReference({ book: 62, chapter: 4, ranges: [{ start: 8, end: 8 }] }, 'en', 'long')).toBe('1 John 4:8');
  });

  it('normalizes unsorted, overlapping input the same way the parser does', () => {
    const messy: Reference = { book: 43, chapter: 15, ranges: [{ start: 12, end: 12 }, { start: 3, end: 8 }, { start: 1, end: 4 }] };
    expect(formatReference(messy, 'ko')).toBe('요 15:1–8, 12');
  });

  // Round trip over every book × language × style × range shape (66 × 2 × 2 × 4 = 1056 cases).
  const shapes: Reference['ranges'][] = [
    [],
    [{ start: 1, end: 1 }],
    [{ start: 2, end: 9 }],
    [{ start: 1, end: 3 }, { start: 5, end: 7 }, { start: 10, end: 10 }],
  ];
  it('parse(format(ref)) === ref for all books, languages and styles', () => {
    let n = 0;
    for (const b of BOOKS) {
      for (const lang of ['ko', 'en'] as const) {
        for (const style of ['short', 'long'] as const) {
          for (const ranges of shapes) {
            const ref: Reference = { book: b.no, chapter: 3, ranges };
            const text = formatReference(ref, lang, style);
            const parsed = parseReference(text);
            expect(parsed, `${text}`).toEqual({ ok: true, ref });
            n++;
          }
        }
      }
    }
    expect(n).toBe(1056);
  });
});
