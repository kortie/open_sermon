// Chunking (DESIGN 3.9/4.1, skill sermon-ingest-privacy): 200–800 chars, split at paragraph or
// sentence boundaries, never mid-sentence unless a sentence alone exceeds the maximum.
// Invariant: chunks.join('') === text (nothing is dropped or rewritten).
import { sermon_ingest } from '../../../config/app.config.json';

export interface ChunkLimits {
  min: number;
  max: number;
}

export const DEFAULT_CHUNK_LIMITS: ChunkLimits = {
  min: sermon_ingest.min_chunk_chars,
  max: sermon_ingest.max_chunk_chars,
};

interface Unit {
  text: string;
  /** The unit ends a paragraph (followed by a blank line or the end of text). */
  paraEnd: boolean;
}

// A sentence ends at . ! ? 。 (plus closing quotes/brackets) followed by whitespace, or at a newline.
const SENTENCE = /[^\n]*?(?:[.!?。…]+["'”’)\]]*(?:[ ]+|(?=\n)|$)|\n+|$)/g;

function units(text: string): Unit[] {
  const out: Unit[] = [];
  for (const m of text.matchAll(SENTENCE)) {
    const s = m[0];
    if (!s) continue;
    const prev = out[out.length - 1];
    if (/^\n+$/.test(s) && prev) {
      prev.text += s;
      prev.paraEnd = s.length >= 2;
      continue;
    }
    out.push({ text: s, paraEnd: false });
  }
  const last = out[out.length - 1];
  if (last) last.paraEnd = true;
  return out;
}

/** Best cut in [lo, hi]: a sentence end nearest `target`, else a space, else `target` itself. */
function bestCut(text: string, lo: number, hi: number, target: number): number {
  // Only the window matters; scanning just the prefix keeps long inputs linear.
  const s = text.slice(0, hi + 1);
  const near = (cands: number[]) =>
    cands.filter((c) => c >= lo && c <= hi).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  const sentenceEnds: number[] = [];
  let pos = 0;
  for (const u of units(s)) {
    pos += u.text.length;
    sentenceEnds.push(pos);
  }
  const spaces: number[] = [];
  for (let i = s.indexOf(' '); i >= 0; i = s.indexOf(' ', i + 1)) spaces.push(i + 1);
  return near(sentenceEnds) ?? near(spaces) ?? Math.min(hi, Math.max(lo, target));
}

/** Cut `s` (longer than `max`) into pieces of `min`..`max` chars, preferring whitespace. */
function hardSplit(s: string, max: number, min: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    // Leave at least `min` for what follows so the last piece is not a fragment.
    const hi = Math.min(max, rest.length - min);
    const cut = bestCut(rest, Math.min(min, hi), hi, hi);
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Re-split two neighbouring chunks so both fall in [min, max] when possible. */
function rebalance(a: string, b: string, min: number, max: number): string[] {
  const s = a + b;
  const lo = Math.max(min, s.length - max);
  const hi = Math.min(max, s.length - min);
  if (lo > hi) return [a, b];
  const cut = bestCut(s, lo, hi, Math.floor(s.length / 2));
  return [s.slice(0, cut), s.slice(cut)];
}

export function chunkText(text: string, limits: ChunkLimits = DEFAULT_CHUNK_LIMITS): string[] {
  const { min, max } = limits;
  if (!text) return [];
  const chunks: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur) chunks.push(cur);
    cur = '';
  };

  for (const unit of units(text)) {
    let piece = unit.text;
    if (cur.length + piece.length > max) {
      if (cur.length >= min) flush();
      else {
        // Fill the current chunk up to `max` from this unit, cutting near whitespace.
        const room = max - cur.length;
        let cut = piece.lastIndexOf(' ', room);
        if (cut <= 0 || cur.length + cut < min) cut = room;
        else cut += 1;
        cur += piece.slice(0, cut);
        piece = piece.slice(cut);
        flush();
      }
    }
    if (piece.length > max) {
      const parts = hardSplit(piece, max, min);
      const tail = parts.pop() ?? '';
      chunks.push(...parts);
      piece = tail;
    }
    cur += piece;
    if (unit.paraEnd && cur.length >= min) flush();
  }
  // A short tail joins the previous chunk when that stays within the maximum.
  if (cur) {
    const prev = chunks[chunks.length - 1];
    if (cur.length >= min || prev === undefined) chunks.push(cur);
    else if (prev.length + cur.length <= max) chunks[chunks.length - 1] = prev + cur;
    else chunks.splice(chunks.length - 1, 1, ...rebalance(prev, cur, min, max));
  }
  return chunks;
}
