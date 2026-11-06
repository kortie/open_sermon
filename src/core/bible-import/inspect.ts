// Checks and the preview report (DESIGN 3.14, skill bible-txt-import §4.3).
// - unknown book name, chapter/verse outside the bible's structure, duplicate (book, chapter, verse:
//   the first one is kept) and lines that fit no pattern are warnings;
// - warningRatio = warning lines / all verse lines; above bible_import.max_warning_ratio (20%) the
//   bible cannot be saved; exactly 20% is allowed;
// - fewer than 66 books → partial.
// The structure (chapters per book, verses per chapter) comes from the bundled DB (max over krv/kjv).
import { bible_import } from '../../../config/app.config.json';
import { BOOK_COUNT, type BookNo } from '../bible/books';
import type { BibleSource } from '../bible/repository';
import type { ImportEncoding } from './decode';
import { detectFormat, type ImportFormat } from './detectFormat';
import { splitLines } from './lines';
import type { ParsedVerse } from './parse';
import { parseA } from './parseA';
import { parseB } from './parseB';

export const MAX_WARNING_RATIO = bible_import.max_warning_ratio;

export interface BibleStructure {
  chapterCount(book: BookNo): number;
  verseCount(book: BookNo, chapter: number): number;
}

export interface ImportedVerse {
  book: BookNo;
  chapter: number;
  verse: number;
  text: string;
}

/** Line numbers per warning kind (shown as counts and the first few lines). */
export interface ImportReport {
  encoding: ImportEncoding;
  format: ImportFormat;
  books: number;
  verses: number;
  missingChapters: { book: BookNo; chapter: number }[];
  duplicates: number[];
  outOfRange: number[];
  unknownBooks: number[];
  badLines: number[];
  warningRatio: number;
  partial: boolean;
  canSave: boolean;
}

export interface Inspection {
  report: ImportReport;
  verses: ImportedVerse[];
}

export function inspectText(text: string, encoding: ImportEncoding, structure: BibleStructure): Inspection {
  const lines = splitLines(text);
  const format = detectFormat(lines);
  const parsed = format === 'A' ? parseA(lines) : parseB(lines);

  const duplicates: number[] = [];
  const outOfRange: number[] = [];
  const unknownBooks: number[] = [];
  const seen = new Set<string>();
  const verses: ImportedVerse[] = [];
  for (const v of parsed.verses) {
    if (v.book === null) {
      unknownBooks.push(v.line);
      continue;
    }
    if (!inRange(v as ParsedVerse & { book: BookNo }, structure)) {
      outOfRange.push(v.line);
      continue;
    }
    const key = `${v.book}:${v.chapter}:${v.verse}`;
    if (seen.has(key)) {
      duplicates.push(v.line);
      continue;
    }
    seen.add(key);
    verses.push({ book: v.book, chapter: v.chapter, verse: v.verse, text: v.text });
  }

  const total = parsed.verses.length + parsed.badLines.length;
  const warnings = duplicates.length + outOfRange.length + unknownBooks.length + parsed.badLines.length;
  const warningRatio = total === 0 ? 1 : warnings / total;
  const books = new Set(verses.map((v) => v.book));
  const chapters = new Set(verses.map((v) => `${v.book}:${v.chapter}`));
  const missingChapters: { book: BookNo; chapter: number }[] = [];
  for (const book of [...books].sort((x, y) => x - y)) {
    for (let c = 1; c <= structure.chapterCount(book); c++) if (!chapters.has(`${book}:${c}`)) missingChapters.push({ book, chapter: c });
  }
  verses.sort((x, y) => x.book - y.book || x.chapter - y.chapter || x.verse - y.verse);

  return {
    verses,
    report: {
      encoding,
      format,
      books: books.size,
      verses: verses.length,
      missingChapters,
      duplicates,
      outOfRange,
      unknownBooks,
      badLines: parsed.badLines,
      warningRatio,
      partial: books.size < BOOK_COUNT,
      canSave: verses.length > 0 && warningRatio <= MAX_WARNING_RATIO,
    },
  };
}

function inRange(v: { book: BookNo; chapter: number; verse: number }, s: BibleStructure): boolean {
  if (v.chapter < 1 || v.verse < 1) return false;
  if (v.chapter > s.chapterCount(v.book)) return false;
  return v.verse <= s.verseCount(v.book, v.chapter);
}

/** Structure for the range checks: the largest chapter/verse count over the bundled bibles. */
export function structureFrom(source: Pick<BibleSource, 'chapterCount' | 'verseCount'>, bibles: readonly string[]): BibleStructure {
  return {
    chapterCount: (book) => Math.max(0, ...bibles.map((b) => source.chapterCount(b, book))),
    verseCount: (book, chapter) => Math.max(0, ...bibles.map((b) => source.verseCount(b, book, chapter))),
  };
}
