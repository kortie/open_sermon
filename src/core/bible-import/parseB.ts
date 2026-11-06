// Format B: a chapter heading "<book> <chapter>[장|편]" followed by "<verse> <text>" lines.
// Verse lines before the first heading have no chapter and count as bad lines.
import { lookupBook, type BookNo } from '../bible/books';
import { B_VERSE, matchHeading } from './detectFormat';
import type { Line } from './lines';
import type { ParseResult } from './parse';

export function parseB(lines: readonly Line[]): ParseResult {
  const out: ParseResult = { verses: [], badLines: [] };
  let current: { book: BookNo | null; chapter: number } | null = null;
  for (const { no, text } of lines) {
    const h = matchHeading(text);
    if (h) {
      current = { book: lookupBook(h.book), chapter: h.chapter };
      continue;
    }
    const m = B_VERSE.exec(text);
    if (!m || !current) {
      out.badLines.push(no);
      continue;
    }
    out.verses.push({ line: no, book: current.book, chapter: current.chapter, verse: Number(m[1]), text: m[2]!.trim() });
  }
  return out;
}
