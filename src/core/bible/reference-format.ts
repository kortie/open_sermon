// Reference formatter (skill bible-reference-parser §4.3). Shares the book table and range
// rules with the parser so that parseReference(formatReference(ref)) returns ref.
import { bookName } from './books';
import { mergeRanges, type Reference } from './reference-parser';

export const EN_DASH = '–';

export function formatReference(ref: Reference, lang: 'ko' | 'en', style: 'short' | 'long' = 'short'): string {
  const name = bookName(ref.book, lang, style);
  const ranges = mergeRanges(ref.ranges);
  if (ranges.length === 0) return `${name} ${ref.chapter}`;
  const verses = ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}${EN_DASH}${r.end}`)).join(', ');
  return `${name} ${ref.chapter}:${verses}`;
}
