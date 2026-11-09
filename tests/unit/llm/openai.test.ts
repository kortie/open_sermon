// OpenAI Responses API adapter (checked 2026-11-09) over a mocked native fetch — app only (OpenAI
// refuses browser CORS), request shape, reasoning budget, error causes, header-only key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providers } from '../../../config/app.config.json';
import { openaiCause } from '../../../src/core/llm/errors';
import { openaiTextOf } from '../../../src/core/llm/providers/openai';
import { createClient, providerCards, selectableProviders, setNativeHttp } from '../../../src/core/llm/registry';
import { LlmError, type FetchFn, type LlmCause } from '../../../src/core/llm/types';

const KEY = 'sk-proj-SECRET-test-key-ABCD';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const apiError = (status: number, error: Record<string, unknown>) => json(status, { error: { message: 'x', param: null, ...error } });
const reply = (text = 'ok', status = 'completed') =>
  json(200, { id: 'resp_1', object: 'response', status, output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', status, content: [{ type: 'output_text', text, annotations: [] }] }] });

let native: ReturnType<typeof vi.fn<FetchFn>>;
beforeEach(() => {
  native = vi.fn<FetchFn>(async () => reply());
  setNativeHttp(native);
});
afterEach(() => {
  setNativeHttp(null);
  vi.useRealTimers();
});

const client = (model = providers.openai.model) => createClient('openai', KEY, model);

function expectNoKey(err: unknown) {
  expect(err).toBeInstanceOf(LlmError);
  const e = err as LlmError;
  for (const s of [String(e), e.message, e.stack ?? '', JSON.stringify(e)]) expect(s).not.toContain('SECRET');
}

async function causeOf(res: Response): Promise<LlmCause> {
  native.mockImplementation(async () => res);
  try {
    await client().generate('S', 'U');
  } catch (err) {
    expectNoKey(err);
    return (err as LlmError).cause;
  }
  throw new Error('expected a failure');
}

describe('openai: app only', () => {
  it('browser build (no native HTTP): a disabled "app only" card, no client, nothing sent', () => {
    setNativeHttp(null);
    expect(selectableProviders()).not.toContain('openai');
    expect(providerCards().find((c) => c.id === 'openai')).toMatchObject({ selectable: false, reason: 'app_only', recommended: false, keyPrefix: 'sk-' });
    expect(() => createClient('openai', KEY, providers.openai.model)).toThrow(LlmError);
  });

  it('app (native HTTP set): selectable, never recommended, and every request goes through native HTTP', async () => {
    expect(selectableProviders()).toContain('openai');
    expect(providerCards().find((c) => c.id === 'openai')).toMatchObject({ selectable: true, recommended: false });
    const web = vi.spyOn(globalThis, 'fetch');
    await client().generate('S', 'U');
    expect(native).toHaveBeenCalledTimes(1);
    expect(web).not.toHaveBeenCalled();
  });
});

describe('openai request shape', () => {
  it('generate: config endpoint, key in the Authorization header only, store off, instructions + input', async () => {
    await expect(client().generate('SYSTEM', 'USER', { maxTokens: 2000 })).resolves.toBe('ok');
    const [url, init] = native.mock.calls[0]!;
    expect(url).toBe(providers.openai.endpoint);
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h).toEqual({ 'content-type': 'application/json', authorization: `Bearer ${KEY}` });
    expect(String(init.body)).not.toContain('SECRET');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gpt-6.1-terra',
      store: false,
      reasoning: { effort: 'none' },
      instructions: 'SYSTEM',
      input: 'USER',
      max_output_tokens: 2000,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a reasoning model gets room for its reasoning tokens; the effort comes from config per model', async () => {
    await client('gpt-6.1-sol').generate('S', 'U', { maxTokens: 2000 });
    const body = JSON.parse(String(native.mock.calls[0]![1].body));
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(2000 + providers.openai.reasoning_reserve_tokens);
    await client('gpt-6-luna').generate('S', 'U');
    expect(JSON.parse(String(native.mock.calls[1]![1].body))).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'none' }, max_output_tokens: 4096 });
  });

  it('validateKey: the smallest generation (16 tokens, one short line); a cut-off answer still passes', async () => {
    native.mockImplementation(async () => json(200, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }));
    await expect(client().validateKey()).resolves.toBeUndefined();
    expect(JSON.parse(String(native.mock.calls[0]![1].body))).toEqual({ model: 'gpt-6.1-terra', store: false, reasoning: { effort: 'none' }, input: 'ping', max_output_tokens: 16 });
  });

  it('text: output_text parts of message items joined; reasoning items, refusals and empty output are not text', () => {
    expect(openaiTextOf({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'a' }, { type: 'refusal', refusal: 'no' }, { type: 'output_text', text: 'b' }] }] })).toBe('ab');
    for (const bad of [null, {}, { output: [] }, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, { output: 'x' }]) {
      expect(() => openaiTextOf(bad)).toThrow(LlmError);
    }
  });

  it('a model id outside the list falls back to the default', async () => {
    await client('gpt-unknown').generate('S', 'U');
    expect(JSON.parse(String(native.mock.calls[0]![1].body)).model).toBe(providers.openai.model);
  });
});

describe('openai causes (error-codes guide)', () => {
  it('401 → auth; 403 region → region, other 403 → unknown', async () => {
    expect(await causeOf(apiError(401, { message: 'Incorrect API key provided: sk-proj-***ABCD.', type: 'invalid_request_error', code: 'invalid_api_key' }))).toBe('auth');
    expect(await causeOf(apiError(403, { message: 'Country, region, or territory not supported', code: 'unsupported_country_region_territory' }))).toBe('region');
    expect(await causeOf(apiError(403, { message: 'Project does not have access to model' }))).toBe('unknown');
  });

  it('429: no credits → billing; spend, usage and rate limits → quota', async () => {
    expect(await causeOf(apiError(429, { type: 'insufficient_quota', code: 'credit_balance_exhausted' }))).toBe('billing');
    expect(await causeOf(apiError(429, { type: 'insufficient_quota', code: 'insufficient_quota', message: 'You exceeded your current quota' }))).toBe('billing');
    for (const code of ['organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'rate_limit_exceeded', 'slow_down']) {
      expect(openaiCause(429, { type: 'insufficient_quota', code })).toBe('quota');
    }
    expect(await causeOf(apiError(429, { type: 'requests', code: null }))).toBe('quota');
  });

  it('500, 503, a non-JSON body → unknown; a native failure → network', async () => {
    expect(await causeOf(apiError(503, { type: 'service_unavailable_error', code: 'server_is_overloaded' }))).toBe('unknown');
    expect(await causeOf(new Response('<html>', { status: 500 }))).toBe('unknown');
    native.mockImplementation(async () => {
      throw new Error(`boom ${KEY}`);
    });
    const err = await client().generate('S', 'U').catch((e: unknown) => e);
    expectNoKey(err);
    expect((err as LlmError).cause).toBe('network');
  });

  it('times out after the config timeout', async () => {
    vi.useFakeTimers();
    native.mockImplementation((_u, init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const p = client().generate('S', 'U').catch((e: unknown) => (e as LlmError).cause);
    await vi.advanceTimersByTimeAsync(60_001);
    await expect(p).resolves.toBe('timeout');
  });
});
