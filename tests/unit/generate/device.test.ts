// S15: one section at a time on the device — short prompt (no profile or excerpts; persona for the
// draft only), no daily slot, no cache, passage cap, same validation with one retry, fallback on failure.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDevicePrompt, deviceMaxTokens, generateOnDevice } from '../../../src/core/generate/device';
import { buildPersonaBlock, defaultPersona } from '../../../src/core/persona';
import type { GenerateRequest } from '../../../src/core/generate/orchestrate';
import { createDeviceClient, type DeviceAiBridge } from '../../../src/core/llm/device';
import { getLlmCalls } from '../../../src/core/store/local-stats';
import { openDb } from '../../../src/core/store/db';
import { fixture, KEYWORDS_KO, ref, SOURCES, VERSES } from '../../fixtures/llm-responses';

const ok = fixture('ok-ko') as { sermon: { title: string; body: string; verse_refs: string[] }; examples: unknown[]; humor: unknown[] };
let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`device-gen-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => opened.splice(0).forEach((db) => db.close()));

const request = (kind: 'sermon' | 'example' | 'one_liner', over: Partial<GenerateRequest> = {}) => ({
  kind,
  lang: 'ko' as const,
  bibleId: 'krv',
  refs: [ref('JHN 15:1-5')],
  verses: VERSES,
  keywords: KEYWORDS_KO,
  persona: null,
  excerpts: [{ sermonId: 's', chunkId: 'c', sermonTitle: 't', text: SOURCES.excerpt }],
  transferConsent: true,
  styleProfile: 'STYLE-PROFILE-TEXT',
  ...over,
});

function scripted(...answers: (string | Error)[]) {
  const gen = vi.fn<DeviceAiBridge['generate']>(async () => {
    const a = answers.shift();
    if (a === undefined) throw new Error('unexpected extra call');
    if (a instanceof Error) throw a;
    return a;
  });
  const b: DeviceAiBridge = { platform: 'android', status: async () => ({ status: 'available' }), download: async () => undefined, generate: gen };
  return { gen, client: createDeviceClient(b) };
}

describe('buildDevicePrompt', () => {
  it('passage, keywords, task and format only; small system prompt', () => {
    const p = buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: VERSES, keywords: [' 열매 ', '열매', '가지'], kind: 'example' });
    expect(p.user).toContain('[본문]\nJHN 15:1 placeholder');
    expect(p.user).toContain('[핵심어]\n열매, 가지');
    expect(p.user).toContain('"examples"');
    expect(p.user).not.toContain('"sermon"');
    expect(p.version).toMatch(/^ko-device-/);
    expect(p.system.split(/\s+/).length).toBeLessThan(150);
    const en = buildDevicePrompt({ lang: 'en', bibleId: 'kjv', verses: VERSES, keywords: ['vine'], kind: 'one_liner', retry: true });
    expect(en.system.split(/\s+/).length).toBeLessThan(150);
    expect(en.user).toContain('"humor"');
    expect(en.user).toContain('[Rewrite]');
  });

  it('draft: persona block, length range and the draft-only format; no persona for the short kinds', () => {
    const persona = defaultPersona('p', 'MY-LABEL');
    const p = buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: VERSES, keywords: ['열매'], kind: 'sermon', persona });
    expect(p.user.startsWith(`[설교자]\n${buildPersonaBlock(persona, 'ko')}`)).toBe(true);
    expect(p.user).not.toContain('MY-LABEL');
    expect(p.user).toContain('800~1200자');
    expect(p.user).toContain('{"sermon":{"title":"","body":"","verse_refs":[]}}');
    expect(p.user).not.toContain('"examples"');
    const fallback = buildDevicePrompt({ lang: 'en', bibleId: 'kjv', verses: VERSES, keywords: [], kind: 'sermon' });
    expect(fallback.user).toContain(buildPersonaBlock(defaultPersona('default', ''), 'en'));
    expect(fallback.user).toContain('550 to 750 words');
    expect(buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: VERSES, keywords: [], kind: 'example', persona }).user).not.toContain('[설교자]');
    expect([deviceMaxTokens('sermon'), deviceMaxTokens('example'), deviceMaxTokens('one_liner')]).toEqual([2048, 1024, 1024]);
  });

  it('the example reference is the passage\'s first verse; the light remark gets no keywords', () => {
    const p = buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: VERSES, keywords: ['열매'], kind: 'sermon' });
    expect(`${p.system}\n${p.user}`).not.toContain('{ref}');
    // The passage itself ends at JHN 15:5, so check the fixed example is gone from the instructions only.
    expect(p.system).toContain('[[QUOTE JHN 15:1]]');
    expect(p.system).not.toContain('JHN 15:5');
    expect(p.user).toContain('[[QUOTE JHN 15:1]]');
    const remark = buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: VERSES, keywords: ['열매'], kind: 'one_liner' });
    expect(remark.user).not.toContain('[핵심어]');
    expect(remark.user).toContain('{"humor":[{"text":"","purpose":""}]}');
    const example = buildDevicePrompt({ lang: 'en', bibleId: 'kjv', verses: VERSES, keywords: ['vine'], kind: 'example' });
    expect(example.user).toContain('[Keywords]\nvine');
    expect(example.user).toContain('{"examples":[{"text":"","verse_refs":[]}]}');
  });

  it('refuses an excluded bible, no verses, and a passage over the cap', () => {
    expect(() => buildDevicePrompt({ lang: 'ko', bibleId: 'niv', verses: VERSES, keywords: [], kind: 'example' })).toThrow(/excluded_bible/);
    expect(() => buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: [], keywords: [], kind: 'example' })).toThrow(/no_verses/);
    const long = VERSES.map((v) => ({ ...v, text: '가'.repeat(400) }));
    expect(() => buildDevicePrompt({ lang: 'ko', bibleId: 'krv', verses: long, keywords: [], kind: 'example' })).toThrow(/too_long/);
  });
});

describe('generateOnDevice', () => {
  it('valid reply: result for that kind only; nothing from the manuscripts or the profile goes in; no daily slot', async () => {
    const db = await fresh();
    const { gen, client } = scripted(JSON.stringify({ examples: ok.examples }));
    const out = await generateOnDevice(request('example'), { client, model: 'gemini-nano', db });
    expect(out).toMatchObject({ kind: 'result', fromCache: false, calls: 1, meta: { provider: 'device', model: 'gemini-nano' } });
    if (out.kind === 'result') expect(out.output.examples).toHaveLength(1);
    const sent = gen.mock.calls[0]![0];
    expect(sent.user).not.toContain(SOURCES.excerpt);
    expect(sent.user).not.toContain('STYLE-PROFILE-TEXT');
    expect(await getLlmCalls(new Date(), db)).toBe(0);
  });

  it('draft: valid reply → draft only, asked with the draft token budget; too short twice → independent result', async () => {
    const db = await fresh();
    const { gen, client } = scripted(JSON.stringify({ sermon: ok.sermon }));
    const out = await generateOnDevice(request('sermon'), { client, model: 'gemini-nano', db });
    expect(out).toMatchObject({ kind: 'result', calls: 1, meta: { provider: 'device' } });
    if (out.kind === 'result') {
      expect(out.output.sermon).toEqual(ok.sermon);
      expect(out.output.examples).toEqual([]);
    }
    expect(gen.mock.calls[0]![0].maxTokens).toBe(2048);
    expect(gen.mock.calls[0]![0].user).not.toContain(SOURCES.excerpt);
    expect(gen.mock.calls[0]![0].user).not.toContain('STYLE-PROFILE-TEXT');
    expect(await getLlmCalls(new Date(), db)).toBe(0);

    const short = JSON.stringify({ sermon: { ...ok.sermon, body: '짧은 초안입니다.' } });
    const bad = scripted(short, short);
    const failed = await generateOnDevice(request('sermon'), { client: bad.client, model: 'm', db });
    expect(failed).toMatchObject({ kind: 'fallback', reason: 'validation', calls: 2 });
    if (failed.kind === 'fallback') expect(failed.issues).toContainEqual(expect.objectContaining({ kind: 'length' }));
    expect(bad.gen.mock.calls[1]![0].user).toContain('[다시 쓰기]');
  });

  it('bad first reply → one retry with the rewrite note → result', async () => {
    const db = await fresh();
    const { gen, client } = scripted('not json', JSON.stringify({ humor: ok.humor }));
    const out = await generateOnDevice(request('one_liner'), { client, model: 'm', db });
    expect(out).toMatchObject({ kind: 'result', calls: 2 });
    expect(gen.mock.calls[1]![0].user).toContain('[다시 쓰기]');
  });

  it('a draft that is too long → the retry says how long it was', async () => {
    const db = await fresh();
    const long = JSON.stringify({ sermon: { ...ok.sermon, body: '가'.repeat(1600) } });
    const { gen, client } = scripted(long, JSON.stringify({ sermon: ok.sermon }));
    const out = await generateOnDevice(request('sermon'), { client, model: 'm', db });
    expect(out).toMatchObject({ kind: 'result', calls: 2 });
    expect(gen.mock.calls[1]![0].user).toContain('1600자로 너무 길었습니다');
    expect(gen.mock.calls[1]![0].user).toContain('1200자 안으로');
  });

  it('two bad replies → independent result (validation)', async () => {
    const db = await fresh();
    const { client } = scripted('x', 'y');
    const out = await generateOnDevice(request('example'), { client, model: 'm', db });
    expect(out).toMatchObject({ kind: 'fallback', reason: 'validation', calls: 2 });
    if (out.kind === 'fallback') expect(out.independent.outline.ref).toBe('JHN 15:1-5');
  });

  it('native failure → its cause; too long → device_too_long without a call; unknown kind refused', async () => {
    const db = await fresh();
    const busy = scripted(Object.assign(new Error('on-device: busy'), { code: 'busy' }));
    expect(await generateOnDevice(request('example'), { client: busy.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'device_busy', calls: 1 });

    const long = scripted();
    const verses = VERSES.map((v) => ({ ...v, text: '가'.repeat(400) }));
    expect(await generateOnDevice(request('example', { verses }), { client: long.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'device_too_long', calls: 0 });
    expect(long.gen).not.toHaveBeenCalled();

    const other = scripted();
    expect(await generateOnDevice({ ...request('example'), kind: 'outline' as never }, { client: other.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'unknown', calls: 0 });
    const niv = scripted();
    expect(await generateOnDevice(request('example', { bibleId: 'niv' }), { client: niv.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'unknown', calls: 0 });
  });

  it('cancel → cancelled', async () => {
    const db = await fresh();
    const ac = new AbortController();
    const b: DeviceAiBridge = { platform: 'android', status: async () => ({ status: 'available' }), download: async () => undefined, generate: () => new Promise(() => undefined) };
    const p = generateOnDevice(request('example'), { client: createDeviceClient(b), model: 'm', db, signal: ac.signal });
    ac.abort();
    expect(await p).toMatchObject({ kind: 'cancelled', calls: 1 });
  });
});
