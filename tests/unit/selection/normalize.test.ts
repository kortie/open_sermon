// Blocks → reference string → parser → the same Set (S03, DESIGN 3.1.1).
import { describe, expect, it } from 'vitest';
import { formatReference } from '../../../src/core/bible/reference-format';
import { parseReference } from '../../../src/core/bible/reference-parser';
import { fromBlocks, selectionReference, toBlocks, verseSpan } from '../../../src/core/selection/normalize';

const CASES: [number, number, number[]][] = [
  [43, 15, [1, 2, 3, 4, 5, 6, 7, 8, 12]],
  [43, 15, [1, 2, 3, 5, 6, 7]],
  [43, 3, [16]],
  [43, 3, [16, 17]],
  [1, 1, [1]],
  [1, 1, [1, 31]],
  [1, 1, [1, 3, 5, 7, 9]],
  [19, 23, [1, 2, 3, 4, 5, 6]],
  [19, 119, [1, 2, 105, 176]],
  [19, 117, [1, 2]],
  [45, 8, [28, 29, 30, 38, 39]],
  [46, 13, [4, 5, 6, 7, 13]],
  [40, 5, [3, 4, 5, 6, 7, 8, 9, 10, 43, 44]],
  [42, 15, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]],
  [62, 4, [7, 8, 16]],
  [66, 22, [20, 21]],
  [9, 3, [10]],
  [23, 53, [4, 5, 6]],
  [58, 11, [1, 6]],
  [50, 4, [4, 6, 7, 13]],
  [57, 1, [1, 25]],
  [65, 1, [24, 25]],
  [64, 1, [2]],
  [12, 2, [9, 10, 11, 14]],
];

describe('selection → reference string → parser round trip', () => {
  for (const lang of ['ko', 'en'] as const) {
    it.each(CASES)(`${lang}: book %i chapter %i %j`, (book, chapter, verses) => {
      const set = new Set(verses);
      const text = formatReference(selectionReference(book, chapter, set), lang);
      const parsed = parseReference(text);
      expect(parsed.ok, text).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.ref.book).toBe(book);
      expect(parsed.ref.chapter).toBe(chapter);
      expect(fromBlocks(parsed.ref.ranges)).toEqual(set);
      expect(parsed.ref.ranges).toEqual(toBlocks(set));
    });
  }

  it('formats the examples from DESIGN 3.1.1', () => {
    expect(formatReference(selectionReference(43, 15, new Set([1, 2, 3, 4, 5, 6, 7, 8, 12])), 'ko')).toBe('요 15:1–8, 12');
    expect(formatReference(selectionReference(43, 15, new Set([1, 2, 3, 5, 6, 7])), 'ko')).toBe('요 15:1–3, 5–7');
  });

  it('verseSpan works in both directions', () => {
    expect(verseSpan(3, 6)).toEqual([3, 4, 5, 6]);
    expect(verseSpan(6, 3)).toEqual([3, 4, 5, 6]);
    expect(verseSpan(4, 4)).toEqual([4]);
  });
});

describe('selectionText', () => {
  it('reference line, then selected verses in order', async () => {
    const { selectionText } = await import('../../../src/core/selection/normalize');
    const verses = [1, 2, 3, 4].map((v) => ({ verse: v, text: `t${v}` }));
    expect(selectionText('요 15:1, 3–4', verses, new Set([4, 1, 3]))).toBe('요 15:1, 3–4\n1 t1\n3 t3\n4 t4');
  });
});
