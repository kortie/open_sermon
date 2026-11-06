// Reference parser (DESIGN 3.1, 3.1.1, 3.2; skill bible-reference-parser).
// Whitelist only, 50-char cap, one chapter per reference, comma lists within that chapter.
import { lookupBook, type BookNo } from './books';

export const MAX_REFERENCE_LENGTH = 50;

export interface VerseRange {
  start: number;
  end: number;
}

/** `ranges` empty = the whole chapter. Ranges are sorted, non-overlapping and non-adjacent. */
export interface Reference {
  book: BookNo;
  chapter: number;
  ranges: VerseRange[];
}

export type ParseError =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'BAD_CHARS'
  | 'UNKNOWN_BOOK'
  | 'BAD_FORMAT'
  | 'REVERSED_RANGE'
  | 'ZERO_OR_NEGATIVE'
  | 'MULTI_CHAPTER';

/** `OUT_OF_RANGE` is produced by the DB layer (repository.checkReference), not by the parser. */
export type ReferenceError = ParseError | 'OUT_OF_RANGE';

export type ParseResult = { ok: true; ref: Reference } | { ok: false; error: ParseError };

// After NFKC: Hangul syllables, ASCII letters and digits, space, ":", "-", ",", ".".
const ALLOWED = /^[가-힣A-Za-z0-9 :,.-]+$/;
// Optional leading 1-3 (1 John, 2 Kings), then a name without digits or ":" (Korean or English).
const SPLIT = /^([1-3]?\s*[^\d\s:,.-][^\d:,]*?)\s*(\d.*)?$/;
const NUM = '(\\d{1,3})';
const RANGE = `${NUM}(?:-${NUM})?`;
const COLON_FORM = new RegExp(`^${NUM}(?::(${RANGE}(?:,${RANGE})*))?$`);
const MULTI_CHAPTER_FORM = /^\d+:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*(?:-\d+:\d+|,\d+:\d+)/;

function normalize(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[‐-―−~〜]/g, '-') // hyphens, en/em dash, minus, tildes → "-"
    .replace(/\s+/g, ' ')
    .trim();
}

/** "15장 1절~8절" → "15:1-8"; "15장" → "15"; removes spaces around separators. */
function toColonForm(rest: string): string {
  return rest
    .replace(/\s*장\s*/, ':')
    .replace(/절/g, '')
    .replace(/\s*([:,-])\s*/g, '$1')
    .replace(/:$/, '')
    .trim();
}

export function mergeRanges(ranges: VerseRange[]): VerseRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: VerseRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function parseReference(input: string): ParseResult {
  const fail = (error: ParseError): ParseResult => ({ ok: false, error });
  if (input.trim() === '') return fail('EMPTY');
  if (input.length > MAX_REFERENCE_LENGTH) return fail('TOO_LONG');

  const text = normalize(input);
  if (!ALLOWED.test(text)) return fail('BAD_CHARS');

  const m = SPLIT.exec(text);
  if (!m) return fail('BAD_FORMAT');
  const [, bookPart = '', restPart] = m;
  const book = lookupBook(bookPart.trim());
  if (book === null) return /[가-힣A-Za-z]/.test(bookPart) ? fail('UNKNOWN_BOOK') : fail('BAD_FORMAT');
  if (restPart === undefined) return fail('BAD_FORMAT');

  const rest = toColonForm(restPart);
  if (MULTI_CHAPTER_FORM.test(rest)) return fail('MULTI_CHAPTER');
  const cm = COLON_FORM.exec(rest);
  if (!cm) return fail('BAD_FORMAT');

  const chapter = Number(cm[1]);
  if (chapter < 1) return fail('ZERO_OR_NEGATIVE');

  const ranges: VerseRange[] = [];
  if (cm[2] !== undefined) {
    for (const part of cm[2].split(',')) {
      const [a, b] = part.split('-').map(Number) as [number, number | undefined];
      const start = a;
      const end = b ?? a;
      if (start < 1 || end < 1) return fail('ZERO_OR_NEGATIVE');
      if (end < start) return fail('REVERSED_RANGE');
      ranges.push({ start, end });
    }
  }
  return { ok: true, ref: { book, chapter, ranges: mergeRanges(ranges) } };
}
