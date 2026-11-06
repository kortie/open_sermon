// Reading an imported bible (DESIGN 3.14): all its verses are loaded from IndexedDB once and kept in
// memory; lookups and the search (full scan, substring, case-insensitive like the bundled LIKE) run
// on that copy. Same contract as the bundled BibleRepository (BibleSource).
import { BOOK_COUNT, type BookNo } from '../bible/books';
import type { Reference, ReferenceError } from '../bible/reference-parser';
import { MAX_SEARCH_LENGTH, SEARCH_PAGE_SIZE, type BibleSource, type SearchResult, type Verse } from '../bible/repository';
import { getImportedVerses, type ImportedVerseRecord } from '../store/importedBible';

const chapterKey = (book: number, chapter: number) => book * 1000 + chapter;

export class ImportedRepository implements BibleSource {
  /** chapterKey → verses sorted by verse number. */
  private readonly chapters = new Map<number, Verse[]>();
  /** Present chapters in reading order. */
  private readonly order: number[];
  private readonly lastChapter = new Map<number, number>();
  private readonly all: Verse[];
  private readonly lower: string[];

  constructor(
    readonly bibleId: string,
    records: readonly Pick<ImportedVerseRecord, 'book' | 'chapter' | 'verse' | 'text'>[],
  ) {
    this.all = records
      .map((r) => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: r.text }))
      .sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
    for (const v of this.all) {
      const k = chapterKey(v.book, v.chapter);
      let list = this.chapters.get(k);
      if (!list) this.chapters.set(k, (list = []));
      list.push(v);
      this.lastChapter.set(v.book, Math.max(this.lastChapter.get(v.book) ?? 0, v.chapter));
    }
    this.order = [...this.chapters.keys()].sort((a, b) => a - b);
    this.lower = this.all.map((v) => v.text.toLowerCase());
  }

  hasBible(bible: string): boolean {
    return bible === this.bibleId;
  }

  getChapter(bible: string, book: BookNo, chapter: number): Verse[] {
    if (!this.hasBible(bible)) return [];
    return [...(this.chapters.get(chapterKey(book, chapter)) ?? [])];
  }

  getVerses(bible: string, ref: Reference): Verse[] {
    const chapter = this.getChapter(bible, ref.book, ref.chapter);
    if (ref.ranges.length === 0) return chapter;
    return ref.ranges.flatMap((r) => chapter.filter((v) => v.verse >= r.start && v.verse <= r.end));
  }

  chapterCount(bible: string, book: BookNo): number {
    if (!this.hasBible(bible) || book < 1 || book > BOOK_COUNT) return 0;
    return this.lastChapter.get(book) ?? 0;
  }

  verseCount(bible: string, book: BookNo, chapter: number): number {
    const list = this.hasBible(bible) ? this.chapters.get(chapterKey(book, chapter)) : undefined;
    return list ? list[list.length - 1]!.verse : 0;
  }

  checkReference(bible: string, ref: Reference): ReferenceError | null {
    const last = this.verseCount(bible, ref.book, ref.chapter);
    if (last === 0) return 'OUT_OF_RANGE';
    if (ref.ranges.some((r) => r.end > last)) return 'OUT_OF_RANGE';
    return null;
  }

  /** Previous/next chapter present in this bible (a partial bible skips missing books and chapters). */
  adjacentChapter(bible: string, book: BookNo, chapter: number, dir: -1 | 1): { book: BookNo; chapter: number } | null {
    if (!this.hasBible(bible)) return null;
    const here = chapterKey(book, chapter);
    const k = dir === 1 ? this.order.find((x) => x > here) : [...this.order].reverse().find((x) => x < here);
    return k === undefined ? null : { book: Math.floor(k / 1000), chapter: k % 1000 };
  }

  search(bible: string, query: string, { limit = SEARCH_PAGE_SIZE, offset = 0 } = {}): SearchResult {
    const q = query.trim();
    if (q === '') return { ok: false, error: 'EMPTY' };
    if (q.length > MAX_SEARCH_LENGTH) return { ok: false, error: 'TOO_LONG' };
    if (!this.hasBible(bible)) return { ok: false, error: 'UNKNOWN_BIBLE' };
    const needle = q.toLowerCase();
    const hits: Verse[] = [];
    let skipped = 0;
    for (let i = 0; i < this.all.length && hits.length <= limit; i++) {
      if (!this.lower[i]!.includes(needle)) continue;
      if (skipped < offset) skipped++;
      else hits.push(this.all[i]!);
    }
    return { ok: true, page: { hits: hits.slice(0, limit), hasMore: hits.length > limit } };
  }
}

export async function loadImportedRepository(bibleId: string, db?: IDBDatabase): Promise<ImportedRepository> {
  return new ImportedRepository(bibleId, await getImportedVerses(bibleId, db));
}
