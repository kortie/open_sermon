// Copy check (DESIGN 7.3, skill generation-validator §4.3). Shared by the outline (S05) and
// generation (S09). A match is a run of at least `n` (copy_check_ngram_chars, 20) consecutive
// characters equal to a source after normalisation: NFC, lowercase, whitespace and punctuation
// removed. Quoted blocks (bundled bible text, outline quotes) are never passed as targets.
import { sermon_ingest } from '../../../config/app.config.json';

export const COPY_NGRAM = sermon_ingest.copy_check_ngram_chars;

export interface CopySource {
  id: string;
  text: string;
}

export interface CopyMatch {
  sourceId: string;
  /** Offsets in the original (unnormalised) target, end exclusive. */
  start: number;
  end: number;
}

interface Normalized {
  text: string;
  /** Normalised code points (grams are counted in code points, not UTF-16 units). */
  chars: string[];
  /** For each normalised code point, its offset in the original string. */
  offsets: number[];
  /** For each normalised code point, the end (exclusive) of its grapheme in the original. */
  ends: number[];
}

const KEEP = /[\p{L}\p{N}]/u;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Letters and digits only, NFC, lowercase; keeps a map back to original offsets.
 * Each grapheme is composed on its own, so decomposed Hangul jamo become one syllable and map
 * to the offset where that syllable starts; astral letters count as one character.
 */
export function normalizeForCopy(input: string): Normalized {
  const chars: string[] = [];
  const offsets: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of graphemes.segment(input)) {
    for (const c of segment.normalize('NFC').toLowerCase()) {
      if (KEEP.test(c)) {
        chars.push(c);
        offsets.push(index);
        ends.push(index + segment.length);
      }
    }
  }
  return { text: chars.join(''), chars, offsets, ends };
}

/** Build the n-gram index of all sources once (reuse it for several targets). */
export function buildCopyIndex(sources: readonly CopySource[], n = COPY_NGRAM): Map<string, string> {
  const index = new Map<string, string>();
  for (const src of sources) {
    const { chars } = normalizeForCopy(src.text);
    for (let i = 0; i + n <= chars.length; i++) {
      const gram = chars.slice(i, i + n).join('');
      if (!index.has(gram)) index.set(gram, src.id);
    }
  }
  return index;
}

/** Matches in `target`; overlapping windows from the same source merge into one span. */
export function findCopies(target: string, index: Map<string, string>, n = COPY_NGRAM): CopyMatch[] {
  const { chars, offsets, ends } = normalizeForCopy(target);
  const out: CopyMatch[] = [];
  let open: { sourceId: string; from: number; to: number } | null = null;
  const close = () => {
    if (!open) return;
    // from/to are valid indexes into the normalised arrays by construction.
    out.push({ sourceId: open.sourceId, start: offsets[open.from]!, end: ends[open.to - 1]! });
    open = null;
  };
  for (let i = 0; i + n <= chars.length; i++) {
    const id = index.get(chars.slice(i, i + n).join(''));
    if (id === undefined) continue;
    if (open && open.sourceId === id && i <= open.to) open.to = i + n;
    else {
      close();
      open = { sourceId: id, from: i, to: i + n };
    }
  }
  close();
  return out;
}

export function copyCheck(target: string, sources: readonly CopySource[], n = COPY_NGRAM): CopyMatch[] {
  if (sources.length === 0 || !target) return [];
  return findCopies(target, buildCopyIndex(sources, n), n);
}

export type CheckedBlock = { kind: 'quote_bible' | 'quote_excerpt' | 'user_text'; text: string };

/** Only user-written blocks are checked; quote blocks are skipped (DESIGN 3.4, 7.3). */
export function copyCheckBlocks<B extends CheckedBlock>(
  blocks: readonly B[],
  sources: readonly CopySource[],
  n = COPY_NGRAM,
): { block: B; matches: CopyMatch[] }[] {
  if (sources.length === 0) return [];
  const index = buildCopyIndex(sources, n);
  return blocks
    .filter((b) => b.kind === 'user_text' && b.text)
    .map((block) => ({ block, matches: findCopies(block.text, index, n) }))
    .filter((r) => r.matches.length > 0);
}

/**
 * Index of `sources` without the n-grams that also occur in `allowed` texts (bundled bible quotes,
 * DESIGN 7.3): an excerpt that quotes Scripture must not flag the same Scripture in a result.
 */
export function buildCopyIndexExcluding(sources: readonly CopySource[], allowed: readonly string[], n = COPY_NGRAM): Map<string, string> {
  const index = buildCopyIndex(sources, n);
  if (index.size === 0) return index;
  for (const text of allowed) {
    const { chars } = normalizeForCopy(text);
    for (let i = 0; i + n <= chars.length; i++) index.delete(chars.slice(i, i + n).join(''));
  }
  return index;
}
