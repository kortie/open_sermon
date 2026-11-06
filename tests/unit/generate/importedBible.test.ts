// S11: generation while an imported bible is being read — the prompt says not to re-quote other
// translations verse by verse, the imported text is never sent, and the copy check covers it.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrompt } from '../../../src/core/generate/buildPrompt';
import { generate, type GenerateRequest } from '../../../src/core/generate/orchestrate';
import { createClient } from '../../../src/core/llm/registry';
import type { FetchFn } from '../../../src/core/llm/types';
import { openDb } from '../../../src/core/store/db';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import enPhrases from '../../../src/prompts/en/prompt.json';
import koPhrases from '../../../src/prompts/ko/prompt.json';
import { KEYWORDS_KO, ref, reply, SOURCES, VERSES } from '../../fixtures/llm-responses';

const KEY = 'sk-ant-api03-imported-bible-test-ABCD';
const opened: IDBDatabase[] = [];
let n = 0;
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});
async function fresh() {
  const db = await openDb(`imported-gen-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
const answer = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
function scripted(...names: string[]) {
  return vi.fn<FetchFn>(async () => {
    const s = names.shift();
    if (s === undefined) throw new Error('unexpected extra request');
    return answer(reply(s));
  });
}
const sentUser = (f: ReturnType<typeof scripted>, i: number) => (JSON.parse(f.mock.calls[i]![1].body as string) as { messages: { content: string }[] }).messages[0]!.content;

/** The imported bible's text of the passage (synthetic): only a copy-check source. */
const IMPORTED_TEXT = SOURCES.excerpt;
const request: GenerateRequest = {
  lang: 'ko',
  bibleId: 'krv',
  refs: [ref('JHN 15:1-5')],
  verses: VERSES,
  keywords: KEYWORDS_KO,
  persona: null,
  excerpts: [],
  transferConsent: false,
  otherTranslation: true,
  extraCopySources: [{ id: 'imported:43:15:1', text: IMPORTED_TEXT }],
};
const deps = (f: FetchFn, db: IDBDatabase) => ({ client: createClient('anthropic', KEY, '', { fetch: f }), provider: 'anthropic', model: 'claude-haiku-5-5', db });

describe('imported bible and generation', () => {
  it('the no-requote line is added only while an imported bible is read (both languages)', () => {
    const base = { ...request, otherTranslation: false };
    expect(buildPrompt({ ...request, excerpts: [] }).user).toContain(koPhrases.no_requote);
    expect(buildPrompt({ ...base, excerpts: [] }).user).not.toContain(koPhrases.no_requote);
    expect(buildPrompt({ ...request, lang: 'en', bibleId: 'kjv', excerpts: [] }).user).toContain(enPhrases.no_requote);
  });

  it('copying the imported text is caught on both attempts → independent result; the text is never sent', async () => {
    const db = await fresh();
    const f = scripted('copy-excerpt', 'copy-excerpt');
    const out = await generate(request, deps(f, db));
    expect(out).toMatchObject({ kind: 'fallback', reason: 'validation', calls: 2 });
    expect(out.kind === 'fallback' && out.issues.some((i) => i.kind === 'copy')).toBe(true);
    for (const i of [0, 1]) {
      expect(sentUser(f, i)).toContain(koPhrases.no_requote);
      expect(sentUser(f, i)).not.toContain(IMPORTED_TEXT.slice(0, 20));
    }
  });

  it('a reply that does not copy the imported text passes', async () => {
    const db = await fresh();
    const f = scripted('ok-ko');
    expect(await generate(request, deps(f, db))).toMatchObject({ kind: 'result', calls: 1 });
  });
});
