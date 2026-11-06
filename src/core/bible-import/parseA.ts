// Format A: one verse per line, "<book> <chapter>:<verse> <text>".
import { lookupBook } from '../bible/books';
import { A_LINE } from './detectFormat';
import type { Line } from './lines';
import type { ParseResult } from './parse';

export function parseA(lines: readonly Line[]): ParseResult {
  const out: ParseResult = { verses: [], badLines: [] };
  for (const { no, text } of lines) {
    const m = A_LINE.exec(text);
    if (!m) {
      out.badLines.push(no);
      continue;
    }
    out.verses.push({ line: no, book: lookupBook(m[1]!.trim()), chapter: Number(m[2]), verse: Number(m[3]), text: m[4]!.trim() });
  }
  return out;
}
