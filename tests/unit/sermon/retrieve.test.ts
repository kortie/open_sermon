// S05 "Search My Sermons" scoring (DESIGN 3.3, skill sermon-retrieval §4–5).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReference, type Reference } from '../../../src/core/bible/reference-parser';
import { saveSermon } from '../../../src/core/sermon/ingest';
import { loadExcerpts, queryKeywords, rankChunks, scoreChunk, searchMySermons, TOP_K } from '../../../src/core/sermon/retrieve';
import { openDb } from '../../../src/core/store/db';
import type { SermonChunkRecord } from '../../../src/core/store/sermon';
import { decryptText } from '../../../src/core/vault/cipher';
import { getOrCreateDeviceKey } from '../../../src/core/vault/crypto-key';

const ref = (s: string): Reference => {
  const p = parseReference(s);
  if (!p.ok) throw new Error(s);
  return p.ref;
};
let seq = 0;
const chunk = (sermon_id: string, verse_refs: string[], keywords: string[], s = seq++): SermonChunkRecord => ({
  id: `${sermon_id}-${s}`,
  sermon_id,
  seq: s,
  ciphertext: new ArrayBuffer(0),
  iv: new Uint8Array(12),
  keywords,
  verse_refs,
});
const created = (m: Record<string, number>) => new Map(Object.entries(m));
const q = (refs: string[], keywords: string[] = []) => ({ refs: refs.map(ref), keywords });

describe('scoreChunk', () => {
  it('+3 per shared verse up to 9, +1 for the same chapter only, +1 per keyword', () => {
    expect(scoreChunk(q(['JHN 15:1-8']), chunk('a', ['JHN 15:5'], [])).score).toBe(3);
    expect(scoreChunk(q(['JHN 15:1-8']), chunk('a', ['JHN 15:1-8'], [])).score).toBe(9);
    expect(scoreChunk(q(['JHN 15:1-8']), chunk('a', ['JHN 15:20'], [])).score).toBe(1);
    expect(scoreChunk(q(['JHN 15:1-8']), chunk('a', ['JHN 15'], [])).score).toBe(1);
    expect(scoreChunk(q(['JHN 15:1-8']), chunk('a', ['JHN 16:1'], [])).score).toBe(0);
    const s = scoreChunk(q(['JHN 15:1'], ['포도나무', '가지', '열매']), chunk('a', ['JHN 15:1'], ['가지', '열매', '농부']));
    expect(s.score).toBe(5);
    expect(s.reasons).toEqual(['verse', 'keyword']);
  });
  it('uses every verse of a comma selection (요 15:1-3, 7)', () => {
    expect(scoreChunk(q(['요 15:1-3, 7']), chunk('a', ['JHN 15:7'], [])).score).toBe(3);
    expect(scoreChunk(q(['요 15:1-3, 7']), chunk('a', ['JHN 15:2-3,7'], [])).score).toBe(9);
  });
  it('ignores stored references that no longer parse', () => {
    expect(scoreChunk(q(['JHN 15:1']), chunk('a', ['???'], [])).score).toBe(0);
  });
});

describe('rankChunks', () => {
  it('a verse match beats a keyword-only match; score 0 is dropped; never more than k', () => {
    const chunks = [
      chunk('a', [], ['가지', '열매']),
      chunk('b', ['JHN 15:5'], []),
      chunk('c', [], []),
      chunk('d', [], ['가지']),
      chunk('e', ['JHN 15:1'], ['가지']),
    ];
    const r = rankChunks(q(['JHN 15:1-8'], ['가지', '열매']), chunks, created({}));
    expect(r.map((x) => x.sermonId)).toEqual(['e', 'b', 'a']);
    expect(r.length).toBeLessThanOrEqual(TOP_K);
    expect(r.some((x) => x.sermonId === 'c')).toBe(false);
  });
  it('ties: verse score, then newer sermon, then smaller seq — deterministic', () => {
    const chunks = [chunk('old', [], ['가지', '열매'], 1), chunk('new', [], ['가지', '열매'], 5), chunk('new', [], ['가지', '열매'], 2), chunk('v', ['JHN 15:9'], ['가지'], 0)];
    const order = () => rankChunks(q(['JHN 15:1'], ['가지', '열매']), chunks, created({ old: 1, new: 2, v: 0 }), 10).map((x) => x.chunkId);
    // all score 2: 'v' has verse score (chapter, 1) and comes first; then newer sermon by seq; then old.
    expect(order()).toEqual(['v-0', 'new-2', 'new-5', 'old-1']);
    expect(order()).toEqual(order());
  });
  it('at most 2 chunks from the same sermon', () => {
    const chunks = [0, 1, 2, 3].map((i) => chunk('a', ['JHN 3:16'], [], i)).concat(chunk('b', [], ['사랑'], 9));
    const r = rankChunks(q(['JHN 3:16'], ['사랑']), chunks, created({}));
    expect(r.map((x) => x.sermonId)).toEqual(['a', 'a', 'b']);
  });
  it('no chunks → empty', () => {
    expect(rankChunks(q(['JHN 3:16']), [], created({}))).toEqual([]);
  });
});

describe('queryKeywords', () => {
  it('takes up to 5 content words from the verse text', () => {
    const k = queryKeywords('나는 참포도나무요 내 아버지는 농부라 무릇 내게 붙어 있어 과실을 맺지 아니하는 가지는 아버지께서 이를 제해 버리시고');
    expect(k.length).toBeLessThanOrEqual(5);
    expect(k).toContain('아버지');
  });
});

const opened: IDBDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));

describe('searchMySermons (decrypts only the winners)', () => {
  const text = (topic: string, n: number) => Array.from({ length: n }, (_, i) => `${topic} 이야기 ${i}번째 문단입니다. 요 15:${(i % 8) + 1} 말씀을 생각합니다.`).join('\n\n');
  it('decrypt is never called while scoring and at most k times overall', async () => {
    const db = await openDb(`retrieve-${Date.now()}`);
    opened.push(db);
    const key = await getOrCreateDeviceKey(db);
    for (let i = 0; i < 4; i++) await saveSermon({ title: `설교 ${i}`, text: text(`포도나무${i}`, 40) }, { granted: true, at: 1 }, { db, key, now: i + 1 });
    const decrypt = vi.fn((c: ArrayBuffer, iv: Uint8Array) => decryptText(c, iv, key));
    const out = await searchMySermons(q(['JHN 15:1-8'], ['포도나무']), { db, decrypt });
    expect(out.length).toBe(3);
    expect(decrypt).toHaveBeenCalledTimes(3);
    expect(out[0]?.sermonTitle).toMatch(/^설교 /);
    expect(out[0]?.text).toContain('요 15:');
    expect(new Set(out.map((e) => e.sermonId)).size).toBeGreaterThanOrEqual(2);
    expect(await searchMySermons(q(['GEN 1:1']), { db, decrypt })).toEqual([]);
    expect(decrypt).toHaveBeenCalledTimes(3);
  });
  it('loadExcerpts decrypts exactly the chunks it is given', async () => {
    const decrypt = vi.fn(async () => 'x');
    const top = rankChunks(q(['JHN 3:16']), [chunk('a', ['JHN 3:16'], [])], created({}));
    expect(await loadExcerpts(top, new Map([['a', 'T']]), decrypt)).toMatchObject([{ sermonTitle: 'T', text: 'x' }]);
    expect(decrypt).toHaveBeenCalledTimes(1);
  });
});
