// S09: call → validate → at most one retry → result | independent result (DESIGN 7.0–7.3).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, type GenerateDeps, type GenerateRequest } from '../../../src/core/generate/orchestrate';
import { createClient } from '../../../src/core/llm/registry';
import type { FetchFn } from '../../../src/core/llm/types';
import { putLibraryItem } from '../../../src/core/store/library';
import { getLlmCalls } from '../../../src/core/store/local-stats';
import { openDb } from '../../../src/core/store/db';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import { KEYWORDS_KO, ref, reply, SOURCES, VERSES } from '../../fixtures/llm-responses';

const KEY = 'sk-ant-api03-orchestrate-test-ABCD';
const opened: IDBDatabase[] = [];
let n = 0;
async function fresh() {
  const db = await openDb(`orchestrate-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
  vi.useRealTimers();
});

const answer = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
const error = (status: number, type: string) => new Response(JSON.stringify({ type: 'error', error: { type, message: 'x' } }), { status });

/** A fetch that answers with the given fixture replies (or Responses) in order. */
function scripted(...steps: (string | (() => Response | Promise<Response>))[]) {
  return vi.fn<FetchFn>(async () => {
    const s = steps.shift();
    if (s === undefined) throw new Error('unexpected extra request');
    return typeof s === 'string' ? answer(reply(s)) : s();
  });
}

const request: GenerateRequest = {
  lang: 'ko',
  bibleId: 'krv',
  refs: [ref('JHN 15:1-5')],
  verses: VERSES,
  keywords: KEYWORDS_KO,
  persona: null,
  excerpts: [
    { sermonId: 's1', chunkId: 'chunk-1', sermonTitle: '새벽', text: SOURCES.excerpt },
    { sermonId: 's2', chunkId: 'chunk-2', sermonTitle: '주일', text: '다른 설교의 한 부분입니다. 공동체가 함께 기도합니다.' },
  ],
  transferConsent: true,
  libraryKind: 'one_liner',
};

function deps(fetchFn: FetchFn, db: IDBDatabase, extra: Partial<GenerateDeps> = {}): GenerateDeps {
  return { client: createClient('anthropic', KEY, '', { fetch: fetchFn }), provider: 'anthropic', model: 'claude-haiku-5-5', db, ...extra };
}
const sentUser = (f: ReturnType<typeof scripted>, i: number) => (JSON.parse(f.mock.calls[i]![1].body as string) as { messages: { content: string }[] }).messages[0]!.content;

describe('generate', () => {
  it('valid first reply: result, one request, one call counted, cached', async () => {
    const db = await fresh();
    const f = scripted('ok-ko');
    const out = await generate(request, deps(f, db));
    expect(out).toMatchObject({ kind: 'result', fromCache: false, calls: 1, humorDropped: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(await getLlmCalls(new Date(), db)).toBe(1);

    // Same request again: cache hit, 0 requests, no call counted.
    const f2 = scripted();
    const again = await generate(request, deps(f2, db));
    expect(again).toMatchObject({ kind: 'result', fromCache: true, calls: 0 });
    expect(f2).not.toHaveBeenCalled();
    expect(await getLlmCalls(new Date(), db)).toBe(1);
  });

  it('first reply fails, second passes: result, exactly 2 requests, 2 calls counted', async () => {
    const db = await fresh();
    const f = scripted('examples-one', 'ok-ko');
    const out = await generate(request, deps(f, db));
    expect(out).toMatchObject({ kind: 'result', calls: 2 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sentUser(f, 1)).toContain('[다시 쓰기]');
    expect(await getLlmCalls(new Date(), db)).toBe(2);
  });

  it('both replies fail: fallback with outline + library, exactly 2 requests (no third)', async () => {
    const db = await fresh();
    await putLibraryItem({ id: 'l1', kind: 'example', body: '예시', tags: [], verse_refs: ['JHN 15:5'], created_at: 1, updated_at: 1 } as never, db);
    await putLibraryItem({ id: 'l2', kind: 'one_liner', body: '한마디', tags: [], verse_refs: ['JHN 15:2'], created_at: 1, updated_at: 1 } as never, db);
    const f = scripted('ko-799', 'ko-1201', 'ok-ko');
    const out = await generate(request, deps(f, db));
    expect(f).toHaveBeenCalledTimes(2);
    expect(out.kind).toBe('fallback');
    if (out.kind !== 'fallback') return;
    expect(out).toMatchObject({ reason: 'validation', calls: 2 });
    expect(out.issues[0]).toMatchObject({ kind: 'length', actual: 1201 });
    expect(out.independent.outline.ref).toBe('JHN 15:1-5');
    expect(out.independent.outline.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'quote_excerpt')).toHaveLength(2);
    expect(out.independent.library.map((h) => h.item.id)).toEqual(['l2', 'l1']);
    expect(await getLlmCalls(new Date(), db)).toBe(2);
  });

  it('copy detected: the retry request no longer carries the matched excerpt', async () => {
    const db = await fresh();
    const f = scripted('copy-excerpt', 'ok-ko');
    const out = await generate(request, deps(f, db));
    expect(out.kind).toBe('result');
    expect(sentUser(f, 0)).toContain(SOURCES.excerpt);
    expect(sentUser(f, 1)).not.toContain(SOURCES.excerpt);
    expect(sentUser(f, 1)).toContain('공동체가 함께 기도합니다');
  });

  it('copy detected twice: fallback after 2 requests', async () => {
    const db = await fresh();
    // The second reply copies again; the excerpt is still a source for the check.
    const f = scripted('copy-excerpt', 'copy-excerpt');
    const out = await generate({ ...request, extraCopySources: [{ id: 'chunk-1', text: SOURCES.excerpt }] }, deps(f, db));
    expect(out).toMatchObject({ kind: 'fallback', reason: 'validation', calls: 2 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('light remarks only fail: result without light remarks, no retry', async () => {
    const db = await fresh();
    const f = scripted('humor-forbidden');
    const out = await generate(request, deps(f, db));
    expect(f).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: 'result', humorDropped: true });
    if (out.kind === 'result') {
      expect(out.output.humor).toEqual([]);
      expect(out.output.examples).toHaveLength(2);
    }
  });

  it('no transfer consent: excerpts are not sent', async () => {
    const db = await fresh();
    const f = scripted('ok-ko');
    await generate({ ...request, transferConsent: false }, deps(f, db));
    expect(sentUser(f, 0)).not.toContain(SOURCES.excerpt);
  });

  describe('failure injection → independent result', () => {
    const cases: [string, () => Response | Promise<Response>, string][] = [
      ['401', () => error(401, 'authentication_error'), 'auth'],
      ['429', () => error(429, 'rate_limit_error'), 'quota'],
      ['network', () => Promise.reject(new TypeError('Failed to fetch')), 'network'],
    ];
    for (const [name, step, reason] of cases)
      it(name, async () => {
        const db = await fresh();
        const f = scripted(step);
        const out = await generate(request, deps(f, db));
        expect(out).toMatchObject({ kind: 'fallback', reason, calls: 1 });
        if (out.kind === 'fallback') expect(out.independent.outline.sections).toHaveLength(5);
        expect(f).toHaveBeenCalledTimes(1);
      });

    it('timeout', async () => {
      const db = await fresh();
      // Only the request deadline is faked; IndexedDB keeps its real scheduling.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const f = vi.fn<FetchFn>((_u, init) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
      const pending = generate(request, deps(f, db));
      await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await pending).toMatchObject({ kind: 'fallback', reason: 'timeout', calls: 1 });
    });

    it('daily limit: nothing is sent', async () => {
      const db = await fresh();
      const f = scripted('ok-ko');
      const out = await generate(request, deps(f, db, { limit: 0 }));
      expect(out).toMatchObject({ kind: 'fallback', reason: 'daily_limit', calls: 0 });
      expect(f).not.toHaveBeenCalled();
    });

    it('daily limit reached before the retry: fallback after 1 request', async () => {
      const db = await fresh();
      const f = scripted('examples-one', 'ok-ko');
      const out = await generate(request, deps(f, db, { limit: 1 }));
      expect(out).toMatchObject({ kind: 'fallback', reason: 'daily_limit', calls: 1 });
      expect(f).toHaveBeenCalledTimes(1);
    });

    it('excluded bible: nothing is sent', async () => {
      const db = await fresh();
      const f = scripted('ok-ko');
      expect(await generate({ ...request, bibleId: 'niv' }, deps(f, db))).toMatchObject({ kind: 'fallback', reason: 'unknown', calls: 0 });
      expect(f).not.toHaveBeenCalled();
    });
  });

  it('cancel: the request is aborted and no result is returned', async () => {
    const db = await fresh();
    const controller = new AbortController();
    const f = vi.fn<FetchFn>((_u, init) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    const pending = generate(request, deps(f, db, { signal: controller.signal }));
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await pending).toEqual({ kind: 'cancelled', calls: 1 });
  });

  it('cancel after the reply arrived still discards it', async () => {
    const db = await fresh();
    const controller = new AbortController();
    const f = vi.fn<FetchFn>(async () => {
      controller.abort();
      return answer(reply('ok-ko'));
    });
    expect(await generate(request, deps(f, db, { signal: controller.signal }))).toEqual({ kind: 'cancelled', calls: 1 });
  });
});
