// Gemini adapter over mocked fetch (docs/PROVIDERS.md "gemini", 2026-11-06): header-only key, config
// endpoint and model, request/response shape, cause mapping, and no key in any error form.
import { describe, expect, it, vi } from 'vitest';
import { providers } from '../../../config/app.config.json';
import { geminiCause, readGoogleError } from '../../../src/core/llm/errors';
import { geminiTextOf } from '../../../src/core/llm/providers/gemini';
import { createClient, type RegistryConfig } from '../../../src/core/llm/registry';
import { LlmError, type FetchFn, type LlmCause } from '../../../src/core/llm/types';
import { generation, wizard } from '../../../config/app.config.json';

const KEY = 'AIzaSyTEST-SECRET-key-1234';
const MODEL = 'gemini-flash-latest';
const BASE = providers.gemini.endpoint;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const googleError = (code: number, status: string, message: string, reason?: string) =>
  json(code, { error: { code, message, status, details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }] : [] } });
const ok = (text = 'ok') => json(200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

const client = (fetchFn: FetchFn, model = MODEL) => createClient('gemini', KEY, model, { fetch: fetchFn });

function expectNoKey(err: unknown) {
  expect(err).toBeInstanceOf(LlmError);
  const e = err as LlmError;
  for (const s of [String(e), e.message, e.stack ?? '', JSON.stringify(e)]) {
    expect(s).not.toContain(KEY);
    expect(s).not.toContain('SECRET');
  }
}

async function causeOf(res: Response | (() => Promise<Response>)): Promise<LlmCause> {
  const fetchFn = vi.fn<FetchFn>(typeof res === 'function' ? res : async () => res);
  try {
    await client(fetchFn).validateKey();
  } catch (err) {
    expectNoKey(err);
    return (err as LlmError).cause;
  }
  throw new Error('expected a failure');
}

describe('gemini request shape', () => {
  it('validateKey looks up the configured model (GET, no generation) with the key in x-goog-api-key only', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(200, { name: `models/${MODEL}` }));
    await client(fetchFn).validateKey();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect(url).not.toContain(KEY);
    expect(url).not.toContain('key=');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const h = init.headers as Record<string, string>;
    expect(h).toEqual({ 'x-goog-api-key': KEY });
  });

  it('generate posts systemInstruction + one user turn to <model>:generateContent', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => ok('초안'));
    await expect(client(fetchFn).generate('SYS', 'USER', { maxTokens: 900 })).resolves.toBe('초안');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}:generateContent`);
    expect(init.method).toBe('POST');
    expect(String(init.body)).not.toContain(KEY);
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
      generationConfig: { maxOutputTokens: 900 },
    });
    const h = init.headers as Record<string, string>;
    expect(h).toEqual({ 'x-goog-api-key': KEY, 'content-type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses a stored model choice when offered, else the config default', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(200, {}));
    await client(fetchFn, 'gemini-flash-lite-latest').validateKey();
    await client(fetchFn, 'not-offered').validateKey();
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([`${BASE}/gemini-flash-lite-latest`, `${BASE}/${providers.gemini.model}`]);
  });

  it('a model id that could change the URL path fails closed before any request', async () => {
    const cfg = { providers: structuredClone(providers), wizard, generation } as unknown as RegistryConfig;
    cfg.providers.gemini!.model = '../files';
    cfg.providers.gemini!.models = ['../files'];
    const fetchFn = vi.fn<FetchFn>();
    await expect(createClient('gemini', KEY, '', { fetch: fetchFn, cfg }).validateKey()).rejects.toMatchObject({ cause: 'unknown' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('gemini response text', () => {
  it('joins text parts of the first candidate and skips thought parts', () => {
    expect(geminiTextOf({ candidates: [{ content: { parts: [{ text: 'think', thought: true }, { text: 'A' }, { text: 'B' }] } }] })).toBe('AB');
  });
  it.each([null, {}, { candidates: [] }, { candidates: [{}] }, { candidates: [{ content: { parts: [] } }] }, { candidates: [{ content: { parts: [{ text: 'x', thought: true }] } }] }])(
    'malformed or empty → unknown (%j)',
    (body) => {
      expect(() => geminiTextOf(body)).toThrow(LlmError);
    },
  );
});

describe('gemini cause mapping', () => {
  it('invalid key as seen on the device (400 INVALID_ARGUMENT, API_KEY_INVALID) → auth', async () => {
    expect(await causeOf(googleError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'))).toBe('auth');
  });
  it('401 / 403 → auth', async () => {
    expect(await causeOf(googleError(401, 'UNAUTHENTICATED', 'x'))).toBe('auth');
    expect(await causeOf(googleError(403, 'PERMISSION_DENIED', 'x'))).toBe('auth');
  });
  it('429 RESOURCE_EXHAUSTED → quota', async () => {
    expect(await causeOf(googleError(429, 'RESOURCE_EXHAUSTED', 'quota'))).toBe('quota');
  });
  it('unsupported location → region', async () => {
    expect(await causeOf(googleError(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.'))).toBe('region');
  });
  it('other errors, non-JSON bodies, and 5xx → unknown (never guessed)', async () => {
    expect(await causeOf(googleError(400, 'INVALID_ARGUMENT', 'bad request'))).toBe('unknown');
    expect(await causeOf(googleError(404, 'NOT_FOUND', 'model not found'))).toBe('unknown');
    expect(await causeOf(new Response('<html>', { status: 500 }))).toBe('unknown');
  });
  it('network failure → network; the thrown error never carries the key', async () => {
    expect(await causeOf(async () => Promise.reject(new TypeError(`Failed to fetch ${KEY}`)))).toBe('network');
  });
  it('readGoogleError tolerates odd shapes', () => {
    expect(readGoogleError('x')).toEqual({});
    expect(readGoogleError({ error: { status: 1, details: 'no' } })).toEqual({ status: undefined, reason: undefined, message: undefined });
    expect(geminiCause(500, {})).toBe('unknown');
  });
});
