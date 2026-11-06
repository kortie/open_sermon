// "Search My Sermons" (DESIGN 3.3, skill sermon-retrieval §4). Scoring reads only the plain
// chunk metadata (keywords, verse_refs); only the top k chunks are decrypted, for the screen.
import { sermon_ingest } from '../../../config/app.config.json';
import { parseStoredRefs, referenceOverlap } from '../bible/reference-overlap';
import type { Reference } from '../bible/reference-parser';
import { getSermonChunks, listSermons, type SermonChunkRecord, type SermonMeta } from '../store/sermon';
import { decryptText } from '../vault/cipher';
import { extractKeywords } from './extract';

export const VERSE_WEIGHT = 3;
export const VERSE_SCORE_MAX = 9;
export const CHAPTER_WEIGHT = 1;
export const KEYWORD_WEIGHT = 1;
export const MAX_PER_SERMON = 2;
export const TOP_K = sermon_ingest.retrieval_top_k;
export const QUERY_KEYWORDS = 5;

export interface RetrievalQuery {
  refs: Reference[];
  keywords: string[];
}

export interface ScoredChunk {
  chunkId: string;
  sermonId: string;
  seq: number;
  score: number;
  verseScore: number;
  reasons: ('verse' | 'chapter' | 'keyword')[];
  /** Kept for decryption of the winners; never shown. */
  record: SermonChunkRecord;
}

export interface Excerpt {
  chunkId: string;
  sermonId: string;
  sermonTitle: string;
  text: string;
  score: number;
  reasons: ScoredChunk['reasons'];
}

/** Query keywords from the selected verse text (DESIGN 3.3). */
export function queryKeywords(verseText: string, max = QUERY_KEYWORDS): string[] {
  return extractKeywords(verseText, max);
}

export function scoreChunk(q: RetrievalQuery, chunk: SermonChunkRecord): Omit<ScoredChunk, 'seq' | 'record'> {
  let verses = 0;
  let chapter = false;
  for (const r of parseStoredRefs(chunk.verse_refs)) {
    for (const qr of q.refs) {
      const o = referenceOverlap(qr, r);
      verses += o.verses;
      if (o.sameChapter) chapter = true;
    }
  }
  const verseScore = verses > 0 ? Math.min(VERSE_SCORE_MAX, verses * VERSE_WEIGHT) : chapter ? CHAPTER_WEIGHT : 0;
  const kw = new Set(q.keywords.map((k) => k.toLowerCase()));
  const keywordHits = chunk.keywords.filter((k) => kw.has(k.toLowerCase())).length;
  const reasons: ScoredChunk['reasons'] = [];
  if (verses > 0) reasons.push('verse');
  else if (chapter) reasons.push('chapter');
  if (keywordHits > 0) reasons.push('keyword');
  return { chunkId: chunk.id, sermonId: chunk.sermon_id, score: verseScore + keywordHits * KEYWORD_WEIGHT, verseScore, reasons };
}

/**
 * Rank chunks without decrypting anything. Ties: verse score, newer sermon, smaller seq, id.
 * Score 0 is dropped; at most MAX_PER_SERMON per sermon; at most k results.
 */
export function rankChunks(q: RetrievalQuery, chunks: readonly SermonChunkRecord[], sermonCreatedAt: ReadonlyMap<string, number>, k = TOP_K): ScoredChunk[] {
  const scored = chunks
    .map((c) => ({ ...scoreChunk(q, c), seq: c.seq, record: c }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.verseScore - a.verseScore ||
        (sermonCreatedAt.get(b.sermonId) ?? 0) - (sermonCreatedAt.get(a.sermonId) ?? 0) ||
        a.seq - b.seq ||
        a.chunkId.localeCompare(b.chunkId),
    );
  const perSermon = new Map<string, number>();
  const out: ScoredChunk[] = [];
  for (const s of scored) {
    const n = perSermon.get(s.sermonId) ?? 0;
    if (n >= MAX_PER_SERMON) continue;
    perSermon.set(s.sermonId, n + 1);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

export type Decrypt = (ciphertext: ArrayBuffer, iv: Uint8Array) => Promise<string>;

/** Decrypt the winners only (one call each). Nothing is cached. */
export async function loadExcerpts(top: readonly ScoredChunk[], titles: ReadonlyMap<string, string>, decrypt: Decrypt): Promise<Excerpt[]> {
  const out: Excerpt[] = [];
  for (const s of top) {
    out.push({
      chunkId: s.chunkId,
      sermonId: s.sermonId,
      sermonTitle: titles.get(s.sermonId) ?? '',
      text: await decrypt(s.record.ciphertext, s.record.iv),
      score: s.score,
      reasons: s.reasons,
    });
  }
  return out;
}

/** Full flow for the screen: load metadata, rank, decrypt the top k. */
export async function searchMySermons(q: RetrievalQuery, opts: { db?: IDBDatabase; key?: CryptoKey; decrypt?: Decrypt; k?: number } = {}): Promise<Excerpt[]> {
  const sermons: SermonMeta[] = await listSermons(opts.db);
  const chunks = (await Promise.all(sermons.map((s) => getSermonChunks(s.id, opts.db)))).flat();
  const top = rankChunks(q, chunks, new Map(sermons.map((s) => [s.id, s.created_at])), opts.k);
  const decrypt = opts.decrypt ?? ((c, iv) => decryptText(c, iv, opts.key));
  return loadExcerpts(top, new Map(sermons.map((s) => [s.id, s.title])), decrypt);
}
