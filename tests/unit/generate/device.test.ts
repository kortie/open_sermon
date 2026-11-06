// S15: short results on the device — short prompt (no persona, profile or excerpts), no daily slot,
// no cache, passage cap, same validation with one retry, fallback on failure.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDevicePrompt, generateOnDevice } from '../../../src/core/generate/device';
import type { GenerateRequest } from '../../../src/core/generate/orchestrate';
import { createDeviceClient, type DeviceAiBridge } from '../../../src/core/llm/device';
import { getLlmCalls } from '../../../src/core/store/local-stats';
import { openDb } from '../../../src/core/store/db';
import { fixture, KEYWORDS_KO, ref, SOURCES, VERSES } from '../../fixtures/llm-responses';

const ok = fixture('ok-ko') as { examples: unknown[]; humor: unknown[] };
let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`device-gen-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => opened.splice(0).forEach((db) => db.close()));

const request = (kind: 'example' | 'one_liner', over: Partial<GenerateRequest> = {}) => ({
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
    if (out.kind === 'result') expect(out.output.examples).toHaveLength(2);
    const sent = gen.mock.calls[0]![0];
    expect(sent.user).not.toContain(SOURCES.excerpt);
    expect(sent.user).not.toContain('STYLE-PROFILE-TEXT');
    expect(await getLlmCalls(new Date(), db)).toBe(0);
  });

  it('bad first reply → one retry with the rewrite note → result', async () => {
    const db = await fresh();
    const { gen, client } = scripted('not json', JSON.stringify({ humor: ok.humor }));
    const out = await generateOnDevice(request('one_liner'), { client, model: 'm', db });
    expect(out).toMatchObject({ kind: 'result', calls: 2 });
    expect(gen.mock.calls[1]![0].user).toContain('[다시 쓰기]');
  });

  it('two bad replies → independent result (validation)', async () => {
    const db = await fresh();
    const { client } = scripted('x', 'y');
    const out = await generateOnDevice(request('example'), { client, model: 'm', db });
    expect(out).toMatchObject({ kind: 'fallback', reason: 'validation', calls: 2 });
    if (out.kind === 'fallback') expect(out.independent.outline.ref).toBe('JHN 15:1-5');
  });

  it('native failure → its cause; too long → device_too_long without a call; draft kind refused', async () => {
    const db = await fresh();
    const busy = scripted(Object.assign(new Error('on-device: busy'), { code: 'busy' }));
    expect(await generateOnDevice(request('example'), { client: busy.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'device_busy', calls: 1 });

    const long = scripted();
    const verses = VERSES.map((v) => ({ ...v, text: '가'.repeat(400) }));
    expect(await generateOnDevice(request('example', { verses }), { client: long.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'device_too_long', calls: 0 });
    expect(long.gen).not.toHaveBeenCalled();

    const draft = scripted();
    expect(await generateOnDevice({ ...request('example'), kind: 'sermon' as never }, { client: draft.client, model: 'm', db })).toMatchObject({ kind: 'fallback', reason: 'unknown', calls: 0 });
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
