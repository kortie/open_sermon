// Gemini API (generateContent) over fetch (docs/PROVIDERS.md "gemini", checked 2026-11-06).
// The endpoint base, model ids and header name come from config.providers.gemini. The key goes in
// a request header only; never in the URL (no `?key=`), the body, an error or a log.
import { geminiCause, readGoogleError } from '../errors';
import { fetchWithTimeout } from '../fetchWithTimeout';
import { LlmError, type ClientParams, type GenerateOptions, type LlmClient } from '../types';

const DEFAULT_MAX_TOKENS = 4096;

function headers({ key, config }: ClientParams, json: boolean): Record<string, string> {
  if (config.auth_header !== 'x-goog-api-key') throw new LlmError('unknown');
  const h: Record<string, string> = { 'x-goog-api-key': key };
  if (json) h['content-type'] = 'application/json';
  return h;
}

/** `<endpoint>/<model>` with the model id checked so it cannot change the path. */
function modelUrl(params: ClientParams): string {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(params.model)) throw new LlmError('unknown');
  return `${params.config.endpoint}/${params.model}`;
}

async function send(params: ClientParams, url: string, init: RequestInit): Promise<unknown> {
  const res = await fetchWithTimeout(url, init, params.timeoutMs, params.fetch);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new LlmError(geminiCause(res.status, readGoogleError(json)));
  return json;
}

/** Text parts of the first candidate joined (thought parts skipped); anything else is 'unknown'. */
export function geminiTextOf(json: unknown): string {
  const candidates = (json as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) throw new LlmError('unknown');
  const parts = (candidates[0] as { content?: { parts?: unknown } } | null)?.content?.parts;
  if (!Array.isArray(parts)) throw new LlmError('unknown');
  const text = parts
    .filter((p): p is { text: string } => typeof p === 'object' && p !== null && typeof p.text === 'string' && (p as { thought?: unknown }).thought !== true)
    .map((p) => p.text)
    .join('');
  if (!text) throw new LlmError('unknown');
  return text;
}

export function createGeminiClient(params: ClientParams): LlmClient {
  return {
    async generate(system: string, user: string, opts: GenerateOptions = {}) {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS },
      };
      const json = await send(params, `${modelUrl(params)}:generateContent`, { method: 'POST', headers: headers(params, true), body: JSON.stringify(body), signal: opts.signal });
      return geminiTextOf(json);
    },
    async validateKey() {
      // Model lookup (GET models/<id>): checks the key and that the configured model exists, and
      // uses no generation quota. The answer is discarded.
      await send(params, modelUrl(params), { method: 'GET', headers: headers(params, false) });
    },
  };
}
