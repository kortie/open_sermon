// OpenAI Responses API (developers.openai.com/api/docs, checked 2026-11-09). OpenAI's servers refuse
// browser CORS for POST, so this provider is used only inside the app, where requests go through
// native HTTP (app_direct_verified; the registry hands in that fetch). Endpoint, models, reasoning
// effort and header name come from config.providers.openai. The key goes in a request header only;
// never in the URL, the body, an error or a log. `store: false`: the provider keeps no response.
import { openaiCause, readOpenAiError } from '../errors';
import { fetchWithTimeout } from '../fetchWithTimeout';
import { LlmError, type ClientParams, type GenerateOptions, type LlmClient } from '../types';

const DEFAULT_MAX_TOKENS = 4096;
/** Documented minimum of max_output_tokens. */
const MIN_OUTPUT_TOKENS = 16;

function headers({ key, config }: ClientParams): Record<string, string> {
  if (config.auth_header !== 'authorization_bearer') throw new LlmError('unknown');
  return { 'content-type': 'application/json', authorization: `Bearer ${key}` };
}

/** reasoning.effort for the model (config), or undefined to leave it to the provider. */
function effortOf({ model, config }: ClientParams): string | undefined {
  return config.reasoning_effort?.[model];
}

/** Output budget: the answer plus, when the model reasons, room for its reasoning tokens. */
export function outputBudget(params: ClientParams, maxTokens: number): number {
  const effort = effortOf(params);
  const reserve = effort === 'none' ? 0 : (params.config.reasoning_reserve_tokens ?? 0);
  return Math.max(MIN_OUTPUT_TOKENS, maxTokens + reserve);
}

function body(params: ClientParams, fields: Record<string, unknown>): Record<string, unknown> {
  const effort = effortOf(params);
  return { model: params.model, store: false, ...(effort ? { reasoning: { effort } } : {}), ...fields };
}

async function send(params: ClientParams, payload: object, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchWithTimeout(params.config.endpoint, { method: 'POST', headers: headers(params), body: JSON.stringify(payload), signal }, params.timeoutMs, params.fetch);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new LlmError(openaiCause(res.status, readOpenAiError(json)));
  return json;
}

/** output_text parts of the message items joined; no text (refusal, cut off before any text) → 'unknown'. */
export function openaiTextOf(json: unknown): string {
  const output = (json as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) throw new LlmError('unknown');
  const text = output
    .filter((o): o is { type: 'message'; content: unknown } => typeof o === 'object' && o !== null && (o as { type?: unknown }).type === 'message')
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
    .filter((c): c is { type: 'output_text'; text: string } => typeof c === 'object' && c !== null && c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  if (!text) throw new LlmError('unknown');
  return text;
}

export function createOpenAiClient(params: ClientParams): LlmClient {
  return {
    async generate(system: string, user: string, opts: GenerateOptions = {}) {
      const json = await send(params, body(params, { instructions: system, input: user, max_output_tokens: outputBudget(params, opts.maxTokens ?? DEFAULT_MAX_TOKENS) }), opts.signal);
      return openaiTextOf(json);
    },
    async validateKey() {
      // Smallest generation (minimum output budget, one short line): checks the key, the model and
      // that the account has credits (a key without credits fails here, not at the first draft).
      // The answer is discarded; a cut-off answer still means the key works.
      await send(params, body(params, { input: 'ping', max_output_tokens: MIN_OUTPUT_TOKENS }));
    },
  };
}
