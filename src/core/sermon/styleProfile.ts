// Style profile contract (DESIGN 3.9, 4.1; S10; skill sermon-style-profile). Schema, validation,
// the no-original-text filter, sermon-set hash and staleness. No LLM code here: the call lives in
// core/generate (CLAUDE.md rule 3). A profile never holds manuscript sentences.
import { sermon_ingest } from '../../../config/app.config.json';
import { listSermons, type SermonMeta } from '../store/sermon';
import { sha256Hex } from './ingest';
import { getStyleProfileRecord, type StyleProfileRecord } from '../store/styleProfile';
import { copyCheck, COPY_NGRAM, normalizeForCopy } from '../validate/copy-check';
import { looksLikePersonLabel } from '../validate/person-name';

export const ILLUSTRATION_FREQS = ['low', 'mid', 'high'] as const;
export const STRUCTURES = ['expository', 'topical', 'narrative', 'mixed'] as const;
export type IllustrationFreq = (typeof ILLUSTRATION_FREQS)[number];
export type SermonStructure = (typeof STRUCTURES)[number];

export const MAX_TONE_LINES = 3;
export const MAX_TONE_LINE_CHARS = 100;
export const MAX_PHRASES = 10;
/** Phrases of this many normalised characters or more are dropped (copy-check size). */
export const PHRASE_MAX_CHARS = COPY_NGRAM;
export const MIN_SERMONS_FOR_STYLE = sermon_ingest.min_sermons_for_style;

export interface StyleProfile {
  /** Average sentence length in characters, measured on the device. */
  avg_sentence_len: number;
  /** Share of sentences ending in a question mark (0..1), measured on the device. */
  question_ratio: number;
  illustration_freq: IllustrationFreq;
  structure: SermonStructure;
  tone_summary: string[];
  frequent_phrases: string[];
}

/** The part the model answers; the two numbers are measured locally. */
export type ModelStyleAnswer = Pick<StyleProfile, 'illustration_freq' | 'structure' | 'tone_summary' | 'frequent_phrases'>;

export type ProfileIssue = 'not_object' | 'illustration_freq' | 'structure' | 'tone_summary' | 'frequent_phrases' | 'avg_sentence_len' | 'question_ratio';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown, max: number): string[] | null => {
  if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === 'string')) return null;
  return (v as string[]).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
};

/** Strict check of the model answer: wrong types, unknown enums, > 3 lines, > 10 phrases fail. */
export function validateModelAnswer(raw: unknown): { ok: true; answer: ModelStyleAnswer } | { ok: false; issue: ProfileIssue } {
  if (!isObj(raw)) return { ok: false, issue: 'not_object' };
  if (!ILLUSTRATION_FREQS.includes(raw.illustration_freq as IllustrationFreq)) return { ok: false, issue: 'illustration_freq' };
  if (!STRUCTURES.includes(raw.structure as SermonStructure)) return { ok: false, issue: 'structure' };
  const tone = strings(raw.tone_summary, MAX_TONE_LINES);
  if (!tone || tone.some((l) => [...l].length > MAX_TONE_LINE_CHARS)) return { ok: false, issue: 'tone_summary' };
  const phrases = strings(raw.frequent_phrases, MAX_PHRASES);
  if (!phrases) return { ok: false, issue: 'frequent_phrases' };
  return {
    ok: true,
    answer: { illustration_freq: raw.illustration_freq as IllustrationFreq, structure: raw.structure as SermonStructure, tone_summary: tone, frequent_phrases: phrases },
  };
}

/** Full profile check (stored records, backups): the model rules plus the two measured numbers. */
export function validateStyleProfile(raw: unknown): { ok: true; profile: StyleProfile } | { ok: false; issue: ProfileIssue } {
  const m = validateModelAnswer(raw);
  if (!m.ok) return m;
  const r = raw as Record<string, unknown>;
  const len = r.avg_sentence_len;
  if (typeof len !== 'number' || !Number.isFinite(len) || len < 0) return { ok: false, issue: 'avg_sentence_len' };
  const q = r.question_ratio;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 1) return { ok: false, issue: 'question_ratio' };
  if (m.answer.frequent_phrases.some((p) => normalizeForCopy(p).chars.length >= PHRASE_MAX_CHARS)) return { ok: false, issue: 'frequent_phrases' };
  return { ok: true, profile: { avg_sentence_len: len, question_ratio: q, ...m.answer } };
}

const SENTENCE = /[^.!?。？！\n]+[.!?。？！]*/g;

/** Average sentence length (characters) and question share over the masked texts. */
export function measureSentences(texts: readonly string[]): { avg_sentence_len: number; question_ratio: number } {
  let count = 0;
  let chars = 0;
  let questions = 0;
  for (const t of texts) {
    for (const m of t.matchAll(SENTENCE)) {
      const s = m[0].trim();
      if ([...s].length < 2) continue;
      count++;
      chars += [...s].length;
      if (/[?？]$/.test(s)) questions++;
    }
  }
  if (count === 0) return { avg_sentence_len: 0, question_ratio: 0 };
  return { avg_sentence_len: Math.round(chars / count), question_ratio: Math.round((questions / count) * 100) / 100 };
}

/**
 * No-original-text filter (S10): drop summary lines and phrases that copy 20 consecutive
 * characters of a manuscript, phrases of 20 characters or more, and anything shaped like a
 * real pastor's name. `removed` counts the dropped items.
 */
export function filterOriginal(answer: ModelStyleAnswer, sermonTexts: readonly string[]): { answer: ModelStyleAnswer; removed: number } {
  const sources = sermonTexts.map((text, i) => ({ id: String(i), text }));
  const copies = (s: string) => copyCheck(s, sources).length > 0;
  const tone = answer.tone_summary.filter((l) => !copies(l) && !looksLikePersonLabel(l));
  const phrases = [...new Set(answer.frequent_phrases)].filter((p) => normalizeForCopy(p).chars.length < PHRASE_MAX_CHARS && !copies(p) && !looksLikePersonLabel(p));
  const removed = answer.tone_summary.length - tone.length + (answer.frequent_phrases.length - phrases.length);
  return { answer: { ...answer, tone_summary: tone, frequent_phrases: phrases }, removed };
}

/** A profile with no summary line left is empty (retry once, then do not save). */
export const isEmptyAnswer = (a: ModelStyleAnswer): boolean => a.tone_summary.length === 0;

/**
 * Hash of the sermon set: SHA-256 over the sorted sermon source_hash values (one per line).
 * Sorting by content hash, not id, keeps it equal after a backup restore that re-keys sermons.
 */
export function computeSourceHash(metas: readonly Pick<SermonMeta, 'source_hash'>[]): Promise<string> {
  return sha256Hex(metas.map((m) => m.source_hash).sort().join('\n'));
}

/** Stale: content wiped by a deletion, or made from a different sermon set. */
export const isStale = (rec: Pick<StyleProfileRecord, 'profile_json' | 'source_hash'>, currentHash: string): boolean =>
  rec.profile_json === null || rec.source_hash !== currentHash;

export type StyleProfileStatus =
  | { state: 'none'; sermonCount: number }
  | { state: 'stale'; sermonCount: number; record: StyleProfileRecord }
  | { state: 'ready'; sermonCount: number; record: StyleProfileRecord; profile: StyleProfile };

/** What the screen and the prompt need: none, stale (do not use, offer "make again") or ready. */
export async function styleProfileStatus(db?: IDBDatabase): Promise<StyleProfileStatus> {
  const [metas, record] = await Promise.all([listSermons(db), getStyleProfileRecord(db)]);
  const sermonCount = metas.length;
  if (!record) return { state: 'none', sermonCount };
  if (isStale(record, await computeSourceHash(metas))) return { state: 'stale', sermonCount, record };
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.profile_json as string);
  } catch {
    return { state: 'stale', sermonCount, record };
  }
  const v = validateStyleProfile(parsed);
  return v.ok ? { state: 'ready', sermonCount, record, profile: v.profile } : { state: 'stale', sermonCount, record };
}

export const limitedStyle = (sermonCount: number): boolean => sermonCount < MIN_SERMONS_FOR_STYLE;
