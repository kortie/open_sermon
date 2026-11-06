// Format detection (DESIGN 3.14, skill bible-txt-import §4.1).
//   A: "<book> <chapter>:<verse> <text>"           e.g. "Genesis 1:1 ..."
//   B: heading "<book> <chapter>[장|편]" followed by "<verse> <text>" lines
// Both patterns above 5% of the lines → mixed → rejected. Neither covering half the lines → unknown.
import { lookupBook } from '../bible/books';
import { ImportError } from './errors';
import type { Line } from './lines';

export type ImportFormat = 'A' | 'B';

export const MIXED_THRESHOLD = 0.05;
export const MIN_COVERAGE = 0.5;

export const A_LINE = /^(\S.*?)\s*(\d{1,3})\s*:\s*(\d{1,3})\s+(\S.*)$/u;
export const B_HEADING = /^(\S.*?)\s*(\d{1,3})\s*(?:장|편)?$/u;
export const B_VERSE = /^(\d{1,3})[.)]?\s+(\S.*)$/u;

/** A heading line names a known book; an unknown name counts only when the line is not a verse line. */
export function matchHeading(text: string): { book: string; chapter: number } | null {
  const m = B_HEADING.exec(text);
  if (!m) return null;
  const book = m[1]!.trim();
  if (lookupBook(book) === null && (B_VERSE.test(text) || /^\d+$/.test(book))) return null;
  return { book, chapter: Number(m[2]) };
}

export function detectFormat(lines: readonly Line[]): ImportFormat {
  if (lines.length === 0) throw new ImportError('EMPTY');
  let a = 0;
  let b = 0;
  let headings = 0;
  for (const { text } of lines) {
    if (A_LINE.test(text)) a++;
    else if (matchHeading(text)) {
      b++;
      headings++;
    } else if (B_VERSE.test(text)) b++;
  }
  const n = lines.length;
  if (a / n > MIXED_THRESHOLD && b / n > MIXED_THRESHOLD) throw new ImportError('MIXED_FORMAT');
  if (a >= b && a / n >= MIN_COVERAGE) return 'A';
  if (b > a && headings > 0 && b / n >= MIN_COVERAGE) return 'B';
  throw new ImportError('UNKNOWN_FORMAT');
}
