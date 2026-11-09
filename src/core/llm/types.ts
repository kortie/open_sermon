// LLM provider contract (CLAUDE.md 4.5, DESIGN 3.6, skill llm-provider-adapter).
// Every provider implements LlmClient only. Errors are LlmError: a cause and an i18n key, nothing
// else (no response body, no request headers, no key).

/**
 * Failure causes (DESIGN 3.13.3).
 * - format: the pasted key does not look like this provider's key (checked before any call)
 * - workspace / org_blocked: Anthropic-specific causes recorded in docs/PROVIDERS.md
 * - daily_limit: this device's own daily call limit (local_limits), no call was made
 * - device_busy / device_unavailable / device_too_long: on-device AI (S15) is busy or over its
 *   per-app quota, not ready on this device, or the passage is too long for it
 * - unknown: anything else, including malformed responses (never guessed)
 */
export const LLM_CAUSES = ['auth', 'billing', 'quota', 'region', 'network', 'timeout', 'format', 'workspace', 'org_blocked', 'daily_limit', 'device_busy', 'device_unavailable', 'device_too_long', 'unknown'] as const;
export type LlmCause = (typeof LLM_CAUSES)[number];

/** i18n key of the user-facing message for each cause (src/i18n *.llm.error.*). */
export function causeMessageKey(cause: LlmCause): string {
  return `llm.error.${cause}`;
}

export class LlmError extends Error {
  readonly cause: LlmCause;
  readonly messageKey: string;
  constructor(cause: LlmCause) {
    // The message names the cause only. It is built from a fixed list, so it can never carry a key.
    super(`llm: ${cause}`);
    this.name = 'LlmError';
    this.cause = cause;
    this.messageKey = causeMessageKey(cause);
  }
  toJSON(): { name: string; cause: LlmCause; messageKey: string } {
    return { name: this.name, cause: this.cause, messageKey: this.messageKey };
  }
}

export interface GenerateOptions {
  /** Upper bound on output tokens. */
  maxTokens?: number;
  /** Cancels the request (the user pressed cancel). */
  signal?: AbortSignal;
}

export interface LlmClient {
  /** One request; resolves with the text answer. Throws LlmError. */
  generate(system: string, user: string, opts?: GenerateOptions): Promise<string>;
  /** The shortest request the provider accepts (docs/PROVIDERS.md). Resolves when the key works. Throws LlmError. */
  validateKey(): Promise<void>;
}

/** One provider entry of config/app.config.json `providers`. */
export interface ProviderConfig {
  endpoint: string;
  model: string;
  models?: string[];
  browser_direct_verified: boolean;
  unavailable_reason?: 'pending_verification' | 'no_browser_access';
  /** Callable from the Android/iOS app through native HTTP only (no browser CORS); user decision 2026-11-09. */
  app_direct_verified?: boolean;
  /** OpenAI Responses API reasoning.effort per model id. */
  reasoning_effort?: Record<string, string>;
  /** Extra output tokens when the model reasons (reasoning tokens count against max_output_tokens). */
  reasoning_reserve_tokens?: number;
  api_version?: string;
  auth_header?: string;
  browser_access_header?: string;
  console_url?: string;
  keys_url?: string;
  billing_url?: string;
  docs_url?: string;
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientParams {
  key: string;
  model: string;
  config: ProviderConfig;
  timeoutMs: number;
  /** Defaults to the global fetch (tests pass a mock). */
  fetch?: FetchFn;
}
