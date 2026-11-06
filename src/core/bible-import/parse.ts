// Shared parse result: one entry per verse line, plus lines that did not fit the format.
import type { BookNo } from '../bible/books';

export interface ParsedVerse {
  line: number;
  /** null: book name not recognised (warning). */
  book: BookNo | null;
  chapter: number;
  verse: number;
  text: string;
}

export interface ParseResult {
  verses: ParsedVerse[];
  /** Line numbers that match neither a verse nor a heading of the format. */
  badLines: number[];
}
