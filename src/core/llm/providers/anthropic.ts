// Anthropic Messages API over fetch (docs/PROVIDERS.md "anthropic", checked 2026-11-05).
// Endpoint, API version and header names come from config.providers.anthropic. The key goes in a
// request header only; never in the URL, the body, an error or a log.
import { anthropicCause, readErrorBody } from '../errors';
import { fetchWithTimeout } from '../fetchWithTimeout';
import { LlmError, type ClientParams, type GenerateOptions, type LlmClient } from '../types';

const DEFAULT_MAX_TOKENS = 4096;

function headers({ key, config }: ClientParams): Record<string, string> {
  if (!config.api_version || !config.browser_access_header) throw new LlmError('unknown');
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': config.api_version,
    [config.browser_access_header]: 'true',
  };
  if (config.auth_header === 'authorization_bearer') h.authorization = `Bearer ${key}`;
  else throw new LlmError('unknown');
  return h;
}

async function send(params: ClientParams, body: object, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchWithTimeout(params.config.endpoint, { method: 'POST', headers: headers(params), body: JSON.stringify(body), signal }, params.timeoutMs, params.fetch);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new LlmError(anthropicCause(res.status, readErrorBody(json)));
  return json;
}

/** Text blocks of a Messages response joined; anything else is a format error ('unknown'). */
export function textOf(json: unknown): string {
  const content = (json as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) throw new LlmError('unknown');
  const text = content
    .filter((b): b is { type: 'text'; text: string } => typeof b === 'object' && b !== null && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) throw new LlmError('unknown');
  return text;
}

export function createAnthropicClient(params: ClientParams): LlmClient {
  return {
    async generate(system: string, user: string, opts: GenerateOptions = {}) {
      const json = await send(params, {
        model: params.model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }, opts.signal);
      return textOf(json);
    },
    async validateKey() {
      // Shortest accepted request (PROVIDERS.md): max_tokens 1, one short user line. The answer is discarded.
      await send(params, { model: params.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
    },
  };
}
