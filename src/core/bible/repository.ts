// Queries against the derived bible.sqlite (DESIGN 2.1.1, 3.2; skill bible-db-access §4.4).
// Schema (build-bible-db.mjs): books(book, code, name_kr, testament),
// verses(source, book, chapter, verse, text) PK(source, book, chapter, verse), build_info(key, value).
// Every query binds parameters; nothing is concatenated into SQL. Read-only: no write statements.
import type { Database, SqlValue } from 'sql.js';
import { BOOK_COUNT, type BookNo } from './books';
import type { Reference, ReferenceError } from './reference-parser';

export interface Verse {
  book: BookNo;
  chapter: number;
  verse: number;
  text: string;
}

export type SearchHit = Verse;

export interface SearchPage {
  hits: SearchHit[];
  hasMore: boolean;
}

export type SearchError = 'EMPTY' | 'TOO_LONG' | 'UNKNOWN_BIBLE';
export type SearchResult = { ok: true; page: SearchPage } | { ok: false; error: SearchError };

export const MAX_SEARCH_LENGTH = 50;
export const SEARCH_PAGE_SIZE = 50;

/** Escape LIKE wildcards so user input is matched literally (ESCAPE '\'). */
export function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** What the reader screens need from a bible: the bundled DB (BibleRepository) or an imported
 *  bible kept in IndexedDB (core/bible-import ImportedRepository, S11). */
export interface BibleSource {
  hasBible(bible: string): boolean;
  getChapter(bible: string, book: BookNo, chapter: number): Verse[];
  getVerses(bible: string, ref: Reference): Verse[];
  chapterCount(bible: string, book: BookNo): number;
  verseCount(bible: string, book: BookNo, chapter: number): number;
  checkReference(bible: string, ref: Reference): ReferenceError | null;
  adjacentChapter(bible: string, book: BookNo, chapter: number, dir: -1 | 1): { book: BookNo; chapter: number } | null;
  search(bible: string, query: string, opts?: { limit?: number; offset?: number }): SearchResult;
}

export class BibleRepository implements BibleSource {
  private readonly chapterCounts = new Map<string, number>();
  private readonly verseCounts = new Map<string, number>();

  /**
   * @param db opened sql.js database
   * @param bibles bible ids that may be queried (config i18n.available_bibles, all languages)
   */
  constructor(
    private readonly db: Database,
    private readonly bibles: readonly string[],
  ) {}

  hasBible(bible: string): boolean {
    return this.bibles.includes(bible);
  }

  private rows(sql: string, params: SqlValue[]): SqlValue[][] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out: SqlValue[][] = [];
      while (stmt.step()) out.push(stmt.get());
      return out;
    } finally {
      stmt.free();
    }
  }

  private static toVerse(row: SqlValue[]): Verse {
    return { book: Number(row[0]), chapter: Number(row[1]), verse: Number(row[2]), text: String(row[3]) };
  }

  getChapter(bible: string, book: BookNo, chapter: number): Verse[] {
    if (!this.hasBible(bible)) return [];
    return this.rows(
      'SELECT book, chapter, verse, text FROM verses WHERE source = ? AND book = ? AND chapter = ? ORDER BY verse',
      [bible, book, chapter],
    ).map(BibleRepository.toVerse);
  }

  /** Verses of a reference in range order; whole chapter when `ranges` is empty. */
  getVerses(bible: string, ref: Reference): Verse[] {
    if (ref.ranges.length === 0) return this.getChapter(bible, ref.book, ref.chapter);
    if (!this.hasBible(bible)) return [];
    return ref.ranges.flatMap((r) =>
      this.rows(
        'SELECT book, chapter, verse, text FROM verses WHERE source = ? AND book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse',
        [bible, ref.book, ref.chapter, r.start, r.end],
      ).map(BibleRepository.toVerse),
    );
  }

  chapterCount(bible: string, book: BookNo): number {
    if (!this.hasBible(bible) || book < 1 || book > BOOK_COUNT) return 0;
    const key = `${bible}:${book}`;
    let n = this.chapterCounts.get(key);
    if (n === undefined) {
      n = Number(this.rows('SELECT max(chapter) FROM verses WHERE source = ? AND book = ?', [bible, book])[0]?.[0] ?? 0);
      this.chapterCounts.set(key, n);
    }
    return n;
  }

  verseCount(bible: string, book: BookNo, chapter: number): number {
    if (!this.hasBible(bible)) return 0;
    const key = `${bible}:${book}:${chapter}`;
    let n = this.verseCounts.get(key);
    if (n === undefined) {
      n = Number(
        this.rows('SELECT max(verse) FROM verses WHERE source = ? AND book = ? AND chapter = ?', [bible, book, chapter])[0]?.[0] ?? 0,
      );
      this.verseCounts.set(key, n);
    }
    return n;
  }

  /** `OUT_OF_RANGE` when the chapter or any verse does not exist in this bible. */
  checkReference(bible: string, ref: Reference): ReferenceError | null {
    const last = this.verseCount(bible, ref.book, ref.chapter);
    if (last === 0) return 'OUT_OF_RANGE';
    if (ref.ranges.some((r) => r.end > last)) return 'OUT_OF_RANGE';
    return null;
  }

  /** Previous/next chapter across book boundaries; null at Genesis 1 / Revelation 22. */
  adjacentChapter(bible: string, book: BookNo, chapter: number, dir: -1 | 1): { book: BookNo; chapter: number } | null {
    if (dir === 1) {
      if (chapter < this.chapterCount(bible, book)) return { book, chapter: chapter + 1 };
      return book < BOOK_COUNT ? { book: book + 1, chapter: 1 } : null;
    }
    if (chapter > 1) return { book, chapter: chapter - 1 };
    return book > 1 ? { book: book - 1, chapter: this.chapterCount(bible, book - 1) } : null;
  }

  /** Substring search (DESIGN 3.2: LIKE, no FTS). */
  search(bible: string, query: string, { limit = SEARCH_PAGE_SIZE, offset = 0 } = {}): SearchResult {
    const q = query.trim();
    if (q === '') return { ok: false, error: 'EMPTY' };
    if (q.length > MAX_SEARCH_LENGTH) return { ok: false, error: 'TOO_LONG' };
    if (!this.hasBible(bible)) return { ok: false, error: 'UNKNOWN_BIBLE' };
    const rows = this.rows(
      "SELECT book, chapter, verse, text FROM verses WHERE source = ? AND text LIKE ? ESCAPE '\\' ORDER BY book, chapter, verse LIMIT ? OFFSET ?",
      [bible, `%${escapeLike(q)}%`, limit + 1, offset],
    );
    return { ok: true, page: { hits: rows.slice(0, limit).map(BibleRepository.toVerse), hasMore: rows.length > limit } };
  }
}
