// Supporting verses must lie inside the selected passage (DESIGN 7.1). References are parsed with
// the shared reference parser; anything it rejects is out of range.
import { parseReference, verseSet, type Reference } from '../bible';
import { quoteRefs } from './quotes';
import type { GenerationOutput, Issue } from './types';

/** True when every verse of `refText` is inside one of the input references. */
export function refWithin(refText: string, inputs: readonly Reference[]): boolean {
  const parsed = parseReference(refText);
  if (!parsed.ok) return false;
  const ref = parsed.ref;
  const same = inputs.filter((r) => r.book === ref.book && r.chapter === ref.chapter);
  if (same.length === 0) return false;
  // A whole chapter in the input allows any verse of it.
  if (same.some((r) => r.ranges.length === 0)) return true;
  if (ref.ranges.length === 0) return false;
  const allowed = new Set(same.flatMap((r) => [...verseSet(r)]));
  return [...verseSet(ref)].every((v) => allowed.has(v));
}

export function checkVerseRefs(o: GenerationOutput, inputs: readonly Reference[]): Issue[] {
  const refs = [
    ...o.sermon.verse_refs,
    ...quoteRefs(o.sermon.body),
    ...o.examples.flatMap((e) => [...e.verse_refs, ...quoteRefs(e.text)]),
    ...o.humor.flatMap((h) => quoteRefs(h.text)),
  ];
  const issues: Issue[] = [...new Set(refs)].filter((r) => !refWithin(r, inputs)).map((ref) => ({ kind: 'verse_out_of_range', ref }));
  o.examples.forEach((e, index) => {
    if (e.verse_refs.length === 0) issues.push({ kind: 'verse_missing', index });
  });
  return issues;
}
