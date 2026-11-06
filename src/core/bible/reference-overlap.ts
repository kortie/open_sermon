// Overlap between two references, shared by "Search My Sermons" scoring and library search.
// Stored references use the canonical code form ("JHN 15:1-8,12"), which the parser accepts.
import { BOOKS } from './books';
import { parseReference, type Reference } from './reference-parser';

export interface Overlap {
  /** Verses both references name (0 when either is a whole chapter). */
  verses: number;
  sameChapter: boolean;
}

export function verseSet(ref: Reference): Set<number> {
  const s = new Set<number>();
  for (const r of ref.ranges) for (let v = r.start; v <= r.end; v++) s.add(v);
  return s;
}

export function referenceOverlap(a: Reference, b: Reference): Overlap {
  if (a.book !== b.book || a.chapter !== b.chapter) return { verses: 0, sameChapter: false };
  const sa = verseSet(a);
  let verses = 0;
  for (const v of verseSet(b)) if (sa.has(v)) verses++;
  return { verses, sameChapter: true };
}

/** Parse stored canonical references, skipping any that no longer parse. */
export function parseStoredRefs(refs: readonly string[]): Reference[] {
  const out: Reference[] = [];
  for (const r of refs) {
    const p = parseReference(r);
    if (p.ok) out.push(p.ref);
  }
  return out;
}
/** Canonical stored form: "JHN 15:1-8,12". */
export function canonicalRef(ref: Reference): string {
  const code = BOOKS[ref.book - 1]?.code ?? String(ref.book);
  const verses = ref.ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(',');
  return verses ? `${code} ${ref.chapter}:${verses}` : `${code} ${ref.chapter}`;
}

