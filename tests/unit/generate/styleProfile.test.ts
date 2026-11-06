// S10: style profile call — consent and key gates, masked text only, one retry, no-original
// filter, nothing saved on failure, and the S09 prompt only ever gets a fresh profile.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrompt } from '../../../src/core/generate/buildPrompt';
import { activeStyleProfileText, buildStyleProfilePrompt, createStyleProfile, styleProfileText, styleProfileVersion } from '../../../src/core/generate/styleProfile';
import type { FetchFn } from '../../../src/core/llm/types';
import { ingestSermon } from '../../../src/core/sermon/ingest';
import { deleteSermon, readSermonText } from '../../../src/core/sermon/read';
import { recordConsent } from '../../../src/core/store/consent';
import { openDb } from '../../../src/core/store/db';
import { getLlmCalls } from '../../../src/core/store/local-stats';
import { setSettings } from '../../../src/core/store/settings';
import { getStyleProfileRecord } from '../../../src/core/store/styleProfile';
import { listSermons } from '../../../src/core/store/sermon';
import { saveProviderKey } from '../../../src/core/vault/providerKey';
import { getOrCreateDeviceKey, resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import { KEYWORDS_KO, ref, VERSES } from '../../fixtures/llm-responses';

const KEY = 'sk-ant-api03-style-profile-test-WXYZ';
const PHONE = '010-2345-6789';
const ORIGINAL = '포도나무 가지가 나무에 붙어 있어야 열매를 맺는 것처럼 우리도 주님께 붙어 있어야 합니다';
const sermonText = (i: number) =>
  [
    `${i}번째 원고입니다. 문의는 ${PHONE}로 주세요.`,
    `${ORIGINAL}. 사랑하는 여러분, 오늘도 말씀 앞에 섭니다.`,
    ...Array.from({ length: 12 }, (_, k) => `${i}번 원고의 ${k}번째 문장에서 우리는 무엇을 배우나요? 함께 생각해 봅시다.`),
  ].join(' ');

const opened: IDBDatabase[] = [];
let n = 0;
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});

const noPdf = { loadPdf: () => Promise.reject(new Error('no pdf')) };
async function setup(opts: { sermons?: number; key?: boolean; consent?: boolean | null } = {}) {
  const db = await openDb(`style-gen-${++n}-${Date.now()}`);
  opened.push(db);
  const key = await getOrCreateDeviceKey(db);
  for (let i = 1; i <= (opts.sermons ?? 3); i++) await ingestSermon({ kind: 'paste', text: sermonText(i), title: `원고 ${i}` }, { granted: true, at: i }, noPdf, { db, key, now: i });
  if (opts.key !== false) {
    await saveProviderKey('anthropic', KEY, 1, db);
    await setSettings({ llm_provider: 'anthropic' }, db);
  }
  if (opts.consent !== null) await recordConsent({ id: 'c1', kind: 'external_transfer', target_id: 'anthropic', granted: opts.consent ?? true, at: 10 }, db);
  return { db, key };
}

const good = {
  illustration_freq: 'mid',
  structure: 'expository',
  tone_summary: ['따뜻하게 묻고 함께 답을 찾아갑니다', '짧은 문장으로 차분하게 권면합니다'],
  frequent_phrases: ['사랑하는 여러분', '함께 생각해 봅시다', '포도나무 가지가 나무에 붙어 있어야 열매를 맺는'],
};
const answer = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
function scripted(...texts: (string | (() => Response))[]) {
  return vi.fn<FetchFn>(async () => {
    const s = texts.shift();
    if (s === undefined) throw new Error('unexpected extra request');
    return typeof s === 'string' ? answer(s) : s();
  });
}
const sentUser = (f: ReturnType<typeof scripted>, i = 0) => (JSON.parse(f.mock.calls[i]![1].body as string) as { messages: { content: string }[] }).messages[0]!.content;

describe('createStyleProfile gates', () => {
  it('no consent → blocked, 0 requests, nothing saved', async () => {
    for (const consent of [false, null]) {
      const { db, key } = await setup({ consent });
      const f = scripted(JSON.stringify(good));
      expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toEqual({ kind: 'blocked', reason: 'no_consent' });
      expect(f).not.toHaveBeenCalled();
      expect(await getStyleProfileRecord(db)).toBeUndefined();
    }
  });

  it('a later refusal overrides an earlier consent', async () => {
    const { db, key } = await setup();
    await recordConsent({ id: 'c2', kind: 'external_transfer', target_id: 'anthropic', granted: false, at: 20 }, db);
    const f = scripted(JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toMatchObject({ kind: 'blocked', reason: 'no_consent' });
    expect(f).not.toHaveBeenCalled();
  });

  it('no key → blocked, 0 requests', async () => {
    const { db, key } = await setup({ key: false });
    const f = scripted(JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toEqual({ kind: 'blocked', reason: 'no_connection' });
    expect(f).not.toHaveBeenCalled();
  });

  it('no sermons → blocked, 0 requests', async () => {
    const { db, key } = await setup({ sermons: 0 });
    const f = scripted(JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toEqual({ kind: 'blocked', reason: 'no_sermons' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('createStyleProfile call', () => {
  it('with consent: one request with the masked text only; copied phrase removed; saved with hash and version', async () => {
    const { db, key } = await setup();
    const f = scripted(JSON.stringify(good));
    const out = await createStyleProfile({ lang: 'ko', db, key, fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
    const user = sentUser(f);
    expect(user).not.toContain(PHONE);
    for (const m of await listSermons(db)) expect(user).toContain(((await readSermonText(m.id, { db, key })) ?? 'missing').slice(0, 30));
    expect(f.mock.calls[0]![1].headers).toMatchObject({ authorization: `Bearer ${KEY}` });

    expect(out).toMatchObject({ kind: 'saved', calls: 1, removed: 1 });
    if (out.kind !== 'saved') throw new Error('not saved');
    expect(out.profile.frequent_phrases).toEqual(['사랑하는 여러분', '함께 생각해 봅시다']);
    expect(out.profile.question_ratio).toBeGreaterThan(0);
    expect(out.profile.avg_sentence_len).toBeGreaterThan(0);
    const rec = await getStyleProfileRecord(db);
    expect(rec).toMatchObject({ prompt_version: styleProfileVersion('ko'), sermon_count: 3, source_hash: out.record.source_hash });
    expect(rec?.profile_json).not.toContain(ORIGINAL.slice(0, 20));
    expect(await getLlmCalls(new Date(), db)).toBe(1);
  });

  it('bad JSON → one retry → nothing saved; exactly 2 requests', async () => {
    const { db, key } = await setup();
    const f = scripted('not json at all', '{"structure": "poem"}');
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toEqual({ kind: 'failed', reason: 'validation', calls: 2 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(await getStyleProfileRecord(db)).toBeUndefined();
    expect(await getLlmCalls(new Date(), db)).toBe(2);
  });

  it('empty after the filter → retry; a valid second answer is saved', async () => {
    const { db, key } = await setup();
    const copied = { ...good, tone_summary: [ORIGINAL] };
    const f = scripted(JSON.stringify(copied), JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toMatchObject({ kind: 'saved', calls: 2 });
  });

  it('a call failure maps to its cause and saves nothing', async () => {
    const { db, key } = await setup();
    const f = scripted(() => new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'x' } }), { status: 429 }));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toEqual({ kind: 'failed', reason: 'quota', calls: 1 });
    expect(await getStyleProfileRecord(db)).toBeUndefined();
  });

  it('the daily limit stops the call before any request', async () => {
    const { db, key } = await setup();
    const f = scripted(JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f, limit: 0 })).toMatchObject({ kind: 'failed', reason: 'daily_limit' });
    expect(f).not.toHaveBeenCalled();
  });

  it('cancelled by the signal', async () => {
    const { db, key } = await setup();
    const c = new AbortController();
    const f = vi.fn<FetchFn>(async () => {
      c.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f, signal: c.signal })).toEqual({ kind: 'cancelled', calls: 1 });
  });

  it('fewer than 3 sermons: allowed, and the prompt says it is limited', async () => {
    const { db, key } = await setup({ sermons: 2 });
    const f = scripted(JSON.stringify(good));
    expect(await createStyleProfile({ lang: 'ko', db, key, fetch: f })).toMatchObject({ kind: 'saved' });
    expect(sentUser(f)).toContain('2편뿐');
  });
});

describe('prompt input', () => {
  it('long manuscripts are cut to an equal share of the budget', () => {
    const p = buildStyleProfilePrompt(['가'.repeat(500), '나'.repeat(500)], 'en', 200);
    expect(p.user).toContain('가'.repeat(100));
    expect(p.user).not.toContain('가'.repeat(101));
    expect(p.user).toContain('[Data: manuscripts]');
    expect(p.system).toContain('JSON');
  });
});

describe('S09 prompt link', () => {
  it('a fresh profile enters buildPrompt as a block without manuscript sentences', async () => {
    const { db, key } = await setup();
    await createStyleProfile({ lang: 'ko', db, key, fetch: scripted(JSON.stringify(good)) });
    const text = await activeStyleProfileText('ko', db);
    expect(text).toContain('사랑하는 여러분');
    const p = buildPrompt({ lang: 'ko', bibleId: 'krv', refs: [ref('JHN 15:1-5')], verses: VERSES, keywords: KEYWORDS_KO, persona: null, excerpts: [], transferConsent: true, styleProfile: text });
    expect(p.user).toContain('[스타일 프로필]');
    expect(p.user).toContain('구성 방식: 강해식');
    for (const m of await listSermons(db)) {
      const body = (await readSermonText(m.id, { db, key })) ?? '';
      for (const sentence of body.split(/(?<=[.?!])\s+/).filter((s) => s.length >= 20)) expect(p.user).not.toContain(sentence);
    }
  });

  it('after a sermon deletion the stale profile does not enter the prompt', async () => {
    const { db, key } = await setup();
    await createStyleProfile({ lang: 'ko', db, key, fetch: scripted(JSON.stringify(good)) });
    const [first] = await listSermons(db);
    await deleteSermon(first!.id, { db, key });
    expect(await activeStyleProfileText('ko', db)).toBeNull();
  });

  it('english labels', () => {
    const t = styleProfileText({ avg_sentence_len: 40, question_ratio: 0.25, illustration_freq: 'high', structure: 'narrative', tone_summary: ['Warm'], frequent_phrases: [] }, 'en');
    expect(t).toContain('about 25% of sentences');
    expect(t).toContain('Structure: narrative');
    expect(t).not.toContain('Frequent phrases');
  });
});
