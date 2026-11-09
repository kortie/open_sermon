// Provider error → cause (DESIGN 3.13.3, docs/PROVIDERS.md). Unknown cases map to 'unknown'
// ("연결에 실패했습니다. 키를 다시 확인해 주세요"); causes are never guessed.
import type { LlmCause } from './types';

export interface ProviderErrorBody {
  type?: string;
  message?: string;
}

/** `{ type: "error", error: { type, message } }` → the inner error; anything else → {}. */
export function readErrorBody(json: unknown): ProviderErrorBody {
  if (typeof json !== 'object' || json === null) return {};
  const err = (json as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return {};
  const { type, message } = err as { type?: unknown; message?: unknown };
  return { type: typeof type === 'string' ? type : undefined, message: typeof message === 'string' ? message : undefined };
}

/**
 * Anthropic Messages API (docs/PROVIDERS.md "anthropic", checked 2026-11-05).
 * - 401: org blocks browser calls when the message starts with "CORS requests are not allowed", else auth
 * - 402 billing_error → billing
 * - 400 invalid_request_error: key not scoped to a workspace → workspace; spend limit → quota; else unknown
 * - 429 → quota
 * - 403, 404, 413, 500, 504, 529 and the rest → unknown (no documented region code)
 */
export function anthropicCause(status: number, body: ProviderErrorBody): LlmCause {
  const msg = body.message ?? '';
  switch (status) {
    case 401:
      return msg.startsWith('CORS requests are not allowed') ? 'org_blocked' : 'auth';
    case 402:
      return 'billing';
    case 429:
      return 'quota';
    case 400:
      if (/not scoped to a workspace/i.test(msg)) return 'workspace';
      if (/spend(ing)? limit/i.test(msg)) return 'quota';
      return 'unknown';
    default:
      return 'unknown';
  }
}

export interface GoogleErrorBody {
  /** google.rpc status name, e.g. INVALID_ARGUMENT, RESOURCE_EXHAUSTED */
  status?: string;
  /** ErrorInfo reason, e.g. API_KEY_INVALID */
  reason?: string;
  message?: string;
}

/** `{ error: { status, message, details: [{ reason }] } }` (Google APIs) → its parts; anything else → {}. */
export function readGoogleError(json: unknown): GoogleErrorBody {
  if (typeof json !== 'object' || json === null) return {};
  const err = (json as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return {};
  const { status, message, details } = err as { status?: unknown; message?: unknown; details?: unknown };
  const reason = Array.isArray(details)
    ? details.map((d) => (typeof d === 'object' && d !== null ? (d as { reason?: unknown }).reason : undefined)).find((r): r is string => typeof r === 'string')
    : undefined;
  return { status: typeof status === 'string' ? status : undefined, reason, message: typeof message === 'string' ? message : undefined };
}

/**
 * Gemini API (docs/PROVIDERS.md "gemini", checked 2026-11-06).
 * - API_KEY_INVALID (seen on device: 400 INVALID_ARGUMENT), 401, 403 PERMISSION_DENIED → auth
 * - 429 RESOURCE_EXHAUSTED → quota (free tier limits)
 * - 400 FAILED_PRECONDITION "User location is not supported" → region
 * - anything else → unknown
 */
export function geminiCause(status: number, body: GoogleErrorBody): LlmCause {
  if (body.reason === 'API_KEY_INVALID' || status === 401 || status === 403) return 'auth';
  if (status === 429 || body.status === 'RESOURCE_EXHAUSTED') return 'quota';
  if (body.status === 'FAILED_PRECONDITION' && /location is not supported/i.test(body.message ?? '')) return 'region';
  return 'unknown';
}

export interface OpenAiErrorBody {
  type?: string;
  code?: string;
  message?: string;
}

/** `{ error: { message, type, code } }` (OpenAI) → its parts; anything else → {}. */
export function readOpenAiError(json: unknown): OpenAiErrorBody {
  if (typeof json !== 'object' || json === null) return {};
  const err = (json as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return {};
  const { type, code, message } = err as { type?: unknown; code?: unknown; message?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return { type: str(type), code: str(code), message: str(message) };
}

const OPENAI_BILLING_CODES = ['credit_balance_exhausted', 'insufficient_quota'];
const OPENAI_LIMIT_CODES = ['organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'rate_limit_exceeded', 'slow_down'];

/**
 * OpenAI API error codes (developers.openai.com/api/docs/guides/error-codes, checked 2026-11-09).
 * - 401 (invalid or revoked key, not in an organization, IP not allowed) → auth
 * - 403 "Country, region, or territory not supported" → region; other 403 → unknown
 * - 429 no prepaid credits (code credit_balance_exhausted; type may be insufficient_quota) → billing
 * - 429 spend/usage limits and rate limits → quota
 * - anything else → unknown
 */
export function openaiCause(status: number, body: OpenAiErrorBody): LlmCause {
  if (status === 401) return 'auth';
  if (status === 403) return /country, region, or territory/i.test(body.message ?? '') ? 'region' : 'unknown';
  if (status === 429) {
    if (OPENAI_BILLING_CODES.includes(body.code ?? '') || (body.type === 'insufficient_quota' && !OPENAI_LIMIT_CODES.includes(body.code ?? ''))) return 'billing';
    return 'quota';
  }
  return 'unknown';
}
