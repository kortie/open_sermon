// Selection → blocks (DESIGN 3.1.1). Blocks are never stored; they are always derived from the Set.
import type { BookNo, Reference, VerseRange } from '../bible';

/** Sorted, maximal runs of consecutive verse numbers. Adjacent or overlapping verses merge. */
export function toBlocks(verses: ReadonlySet<number>): VerseRange[] {
  const sorted = [...verses].filter((v) => Number.isInteger(v) && v > 0).sort((a, b) => a - b);
  const blocks: VerseRange[] = [];
  for (const v of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && v <= last.end + 1) last.end = Math.max(last.end, v);
    else blocks.push({ start: v, end: v });
  }
  return blocks;
}

/** Blocks → Set (inverse of toBlocks). */
export function fromBlocks(blocks: readonly VerseRange[]): Set<number> {
  const set = new Set<number>();
  for (const b of blocks) for (let v = b.start; v <= b.end; v++) set.add(v);
  return set;
}

/** Inclusive range between two verses in either direction. */
export function verseSpan(a: number, b: number): number[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Reference for the current selection; feed it to formatReference (same rules as the parser). */
export function selectionReference(book: BookNo, chapter: number, verses: ReadonlySet<number>): Reference {
  return { book, chapter, ranges: toBlocks(verses) };
}

/** Clipboard text: the reference line, then each selected verse as "N text" in chapter order. */
export function selectionText(reference: string, verses: readonly { verse: number; text: string }[], selected: ReadonlySet<number>): string {
  const lines = verses.filter((v) => selected.has(v.verse)).map((v) => `${v.verse} ${v.text}`);
  return [reference, ...lines].join('\n');
}
