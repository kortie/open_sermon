// S08: Anthropic adapter over mocked fetch — cause mapping (DESIGN 3.13.3, docs/PROVIDERS.md),
// header-only key, config endpoint, 60 s timeout, and no key in any error form.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providers } from '../../../config/app.config.json';
import { textOf } from '../../../src/core/llm/providers/anthropic';
import { createClient } from '../../../src/core/llm/registry';
import { LlmError, type FetchFn, type LlmCause } from '../../../src/core/llm/types';

const KEY = 'sk-ant-api03-SECRET-test-key-ABCD';
const MODEL = 'claude-haiku-5-5';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const apiError = (status: number, type: string, message: string) => json(status, { type: 'error', error: { type, message }, request_id: 'req_1' });
const ok = (text = 'ok') => json(200, { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' });

function client(fetchFn: FetchFn, model = MODEL) {
  return createClient('anthropic', KEY, model, { fetch: fetchFn });
}

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

afterEach(() => vi.useRealTimers());

describe('anthropic request shape', () => {
  it('posts to the config endpoint with the key in a header only', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    await client(fetchFn).validateKey();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(providers.anthropic.endpoint);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    expect(String(init.body)).not.toContain(KEY);
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe(`Bearer ${KEY}`);
    expect(h['anthropic-version']).toBe(providers.anthropic.api_version);
    expect(h[providers.anthropic.browser_access_header]).toBe('true');
    expect(h['content-type']).toBe('application/json');
    expect(Object.entries(h).filter(([, v]) => v.includes(KEY)).map(([k]) => k)).toEqual(['authorization']);
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the chosen model, or the config default for an unknown one', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    await client(fetchFn, 'claude-opus-5-5').validateKey();
    await client(fetchFn, 'gpt-x').validateKey();
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body)).model).toBe('claude-opus-5-5');
    expect(JSON.parse(String(fetchFn.mock.calls[1]![1].body)).model).toBe(providers.anthropic.model);
  });

  it('generate sends system + user and returns the joined text blocks', async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      json(200, { content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: '가' }, { type: 'text', text: '나' }] }),
    );
    expect(await client(fetchFn).generate('sys', 'user', { maxTokens: 50 })).toBe('가나');
    const body = JSON.parse(String(fetchFn.mock.calls[0]![1].body));
    expect(body).toMatchObject({ model: MODEL, max_tokens: 50, system: 'sys', messages: [{ role: 'user', content: 'user' }] });
    expect(String(fetchFn.mock.calls[0]![1].body)).not.toContain(KEY);
  });

  it('a malformed or empty answer is "unknown" (not guessed)', async () => {
    for (const body of [{}, { content: 'x' }, { content: [] }, { content: [{ type: 'tool_use' }] }]) {
      await expect(client(async () => json(200, body)).generate('s', 'u')).rejects.toMatchObject({ cause: 'unknown' });
    }
    await expect(client(async () => new Response('not json', { status: 200 })).generate('s', 'u')).rejects.toMatchObject({ cause: 'unknown' });
    expect(() => textOf(null)).toThrow(LlmError);
  });
});

describe('anthropic error → cause (3.13.3)', () => {
  it.each<[string, Response, LlmCause]>([
    ['401 authentication_error', apiError(401, 'authentication_error', 'invalid x-api-key'), 'auth'],
    ['401 CORS blocked org', apiError(401, 'authentication_error', 'CORS requests are not allowed for this Organization because of ZDR'), 'org_blocked'],
    ['402 billing_error', apiError(402, 'billing_error', 'Your credit balance is too low'), 'billing'],
    ['403 permission_error', apiError(403, 'permission_error', 'Your API key does not have permission'), 'unknown'],
    // No documented region code for Anthropic (PROVIDERS.md): a region-like 403 is not guessed.
    ['403 region-like message', apiError(403, 'permission_error', 'This service is not available in your region'), 'unknown'],
    ['429 rate_limit_error', apiError(429, 'rate_limit_error', 'Number of requests has exceeded your rate limit'), 'quota'],
    ['400 spend limit', apiError(400, 'invalid_request_error', 'You have reached your specified workspace API usage limits / spend limit'), 'quota'],
    ['400 workspace', apiError(400, 'invalid_request_error', 'This API key is not scoped to a workspace. Include the anthropic-workspace-id header.'), 'workspace'],
    ['400 other', apiError(400, 'invalid_request_error', 'messages: field required'), 'unknown'],
    ['404', apiError(404, 'not_found_error', 'model not found'), 'unknown'],
    ['500 api_error', apiError(500, 'api_error', 'Internal'), 'unknown'],
    ['529 overloaded', apiError(529, 'overloaded_error', 'Overloaded'), 'unknown'],
    ['500 non-JSON body', new Response('<html>oops</html>', { status: 500 }), 'unknown'],
  ])('%s', async (_name, res, cause) => {
    expect(await causeOf(res)).toBe(cause);
  });

  it('network failure → network; the original error (which may echo the key) is dropped', async () => {
    expect(await causeOf(async () => Promise.reject(new TypeError(`Failed to fetch with ${KEY}`)))).toBe('network');
  });

  it('no answer within 60 s (config) → timeout', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<FetchFn>(
      (_u, init) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }),
    );
    const p = client(fetchFn).validateKey();
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchFn.mock.calls[0]![1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await caught;
    expectNoKey(err);
    expect((err as LlmError).cause).toBe('timeout');
  });

  it('LlmError carries only the cause and its i18n key', () => {
    const e = new LlmError('billing');
    expect(JSON.parse(JSON.stringify(e))).toEqual({ name: 'LlmError', cause: 'billing', messageKey: 'llm.error.billing' });
    expect(e.message).toBe('llm: billing');
  });
});
